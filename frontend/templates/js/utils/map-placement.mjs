// Screen-space decisions for the map at /map: which labels fit, which pins merge,
// and what a finger meant.
//
// Pure. No DOM, no layout reads - everything is computed from the viewBox and the
// stage size, which the component already knows. That is what lets it run on every
// zoom step of an animation without forcing a layout per label, and what lets it be
// driven from Node against the real data, the way viability.mjs and nightplan.mjs
// are.
//
// The problem it exists to solve was measured, not assumed. On a 393px phone at the
// default view, the six central districts are 4 to 19 pixels across - Ayawaso Central
// is 4 - and every one of them had a landmark pin sitting on its centre. A tap on
// Accra Metropolitan landed on Ridge Hospital. One fingertip there covered fourteen
// different targets. Forty-five pins made 308 overlapping pairs, and when labels came
// on, 32 pairs of names were drawn over each other. Districts span a 25x range in
// size, so there is no zoom at which the whole region fits a phone and the centre is
// tappable. Hence this file.

/** A fingertip, as a radius in CSS pixels. 44px is the usual minimum target. */
export const FINGER_PX = 22;

/**
 * How far past a target's edge a tap may land and still count as aimed at it.
 * Narrower than FINGER_PX on purpose: generous enough to forgive a thumb, tight
 * enough that tapping a big district near a pin does not ask which you meant.
 */
export const REACH_PX = 14;

/** A district smaller than this on screen is one a finger cannot hit reliably. */
export const SMALL_PX = 36;

/** Map coordinates to stage pixels, for a given viewBox and stage size. */
export function toScreen(box, size, x, y) {
	return {
		x: ((x - box.x) / box.w) * size.width,
		y: ((y - box.y) / box.h) * size.height,
	};
}

/** Map units per screen pixel. Under `preserveAspectRatio="meet"` the larger wins. */
export function unitsPerPixel(box, size) {
	return Math.max(box.w / size.width, box.h / size.height);
}

/**
 * Estimate a label's width without measuring it.
 *
 * Measuring 29 text nodes on every animation frame is 29 forced layouts a frame.
 * The body face averages a little over half an em per character, and an estimate
 * that errs wide only costs the odd label that would have fitted.
 */
export function labelWidth(text, fontPx) {
	return text.length * fontPx * 0.56 + fontPx * 0.6;
}

function overlaps(a, b, gap) {
	return !(
		a.right + gap <= b.left ||
		b.right + gap <= a.left ||
		a.bottom + gap <= b.top ||
		b.bottom + gap <= a.top
	);
}

/**
 * Choose which district names to draw.
 *
 * Greedy, largest district first, with the selected one forced to the front. A
 * name that would collide with one already placed is dropped rather than drawn
 * over it. So the outer districts are named at the default zoom, the dense core
 * names itself as you zoom in, and nothing is ever printed on top of anything
 * else - which is what a real map does, and what the old all-or-nothing toggle
 * could not.
 *
 * Pins and bubbles are passed in as `obstacles` and placed before any name. A
 * name blocked where it belongs tries its other candidate positions before
 * giving up - so "Adenta" moves off the pin sitting on Adenta rather than being
 * printed through it, or vanishing. The first version only avoided other names,
 * and four of the eight it drew at the default phone zoom ran into a pin.
 *
 * `candidates` are where a name may go relative to its anchor, in screen
 * pixels, tried in order. A district is named on its centre, then just above,
 * then just below. A city on the flight map is a dot, so its name goes beside
 * it - right, left, above, below - and never on top of it.
 *
 * @param {Array<{id, x, y, text, priority, forced?}>} labels  map coordinates
 * @param {object} [options]
 * @param {Array<{left, top, right, bottom, id?}>} [options.obstacles]  screen rects to keep
 *   clear of. One carrying an `id` never blocks the name with that id: a city's
 *   name goes beside its own dot, and the first version counted the dot against
 *   it - every candidate overlapped by a pixel or two, and not one city on the
 *   flight map was named.
 * @param {Array<{dx, dy, align}>} [options.candidates]  align is start, middle or end
 * @returns {Map<string, {dx, dy, align}>} the position chosen for each name to show
 */
export function placeLabels(
	labels, box, size,
	{ fontPx = 11, gap = 3, margin = 4, obstacles = [], candidates = null } = {}
) {
	const ordered = [...labels].sort((a, b) => {
		if (a.forced !== b.forced) return a.forced ? -1 : 1;
		return b.priority - a.priority;
	});

	const placed = [...obstacles];
	const shown = new Map();
	const height = fontPx * 1.3;
	const step = height * 1.1;
	const options = candidates || [
		{ dx: 0, dy: 0, align: 'middle' },
		{ dx: 0, dy: -step, align: 'middle' },
		{ dx: 0, dy: step, align: 'middle' },
	];

	const rectFor = (centre, width, option) => {
		const ax = centre.x + option.dx;
		const ay = centre.y + option.dy;
		const left =
			option.align === 'start' ? ax :
			option.align === 'end' ? ax - width :
			ax - width / 2;
		return { left, right: left + width, top: ay - height / 2, bottom: ay + height / 2 };
	};

	for (const label of ordered) {
		const centre = toScreen(box, size, label.x, label.y);
		const width = labelWidth(label.text, fontPx);
		let done = false;

		// The selected one is always named. It still steps off a pin if it
		// can, and only takes its first place regardless when it cannot.
		for (const option of options) {
			const rect = rectFor(centre, width, option);

			// Off the stage, or hanging off its edge where it would be clipped.
			const outside =
				rect.left < margin || rect.top < margin ||
				rect.right > size.width - margin || rect.bottom > size.height - margin;
			if (outside) continue;
			if (placed.some((other) => other.id !== label.id && overlaps(rect, other, gap))) continue;

			placed.push(rect);
			shown.set(label.id, option);
			done = true;
			break;
		}

		if (!done && label.forced) {
			placed.push(rectFor(centre, width, options[0]));
			shown.set(label.id, options[0]);
		}
	}

	return shown;
}

/**
 * Merge pins that would sit on top of each other into one bubble with a count.
 *
 * Greedy seed clustering in screen space: walk the points in a fixed order, and
 * each unclaimed one gathers every unclaimed point within `radiusPx` of it. Fixed
 * order matters - an ordering that changed between frames would make bubbles
 * swap members while the map moved, which reads as flicker.
 *
 * Clustering depends only on scale, never on pan, so the component recomputes it
 * when the zoom level changes and lets the bubbles ride along with a drag.
 *
 * @param {Array<{id, x, y}>} points  map coordinates
 * @param {Set<string>} exempt  ids never merged - the selected landmark
 * @returns {Array<{ids: string[], x, y}>}  in map coordinates
 */
export function clusterPoints(points, box, size, radiusPx, exempt = new Set()) {
	const ordered = [...points].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
	const screen = new Map(ordered.map((p) => [p.id, toScreen(box, size, p.x, p.y)]));
	const claimed = new Set();
	const clusters = [];

	for (const seed of ordered) {
		if (claimed.has(seed.id)) continue;
		claimed.add(seed.id);

		const members = [seed];
		if (!exempt.has(seed.id)) {
			const s = screen.get(seed.id);
			for (const other of ordered) {
				if (claimed.has(other.id) || exempt.has(other.id)) continue;
				const o = screen.get(other.id);
				if (Math.hypot(o.x - s.x, o.y - s.y) <= radiusPx) {
					members.push(other);
					claimed.add(other.id);
				}
			}
		}

		clusters.push({
			ids: members.map((m) => m.id),
			x: members.reduce((n, m) => n + m.x, 0) / members.length,
			y: members.reduce((n, m) => n + m.y, 0) / members.length,
		});
	}

	return clusters;
}

/**
 * Decide what a tap was aimed at.
 *
 * The rule is the one a person would apply. Where small districts are within
 * reach of the finger, the tap is genuinely ambiguous and the reader is asked -
 * one tap on a short list beats guessing wrong and flying somewhere they did not
 * mean. Anywhere else, a pin hit squarely wins, and otherwise it is the district
 * under the finger.
 *
 * @param {object} input
 * @param {string|null} input.contained  the district or region whose fill holds the point
 * @param {boolean} input.containedSmall  whether that one is itself small on screen
 * @param {Array<{id, dist}>} input.small  other small districts within reach, nearest first
 * @param {Array<{key, kind, dist, radius}>} input.markers  pins and bubbles within reach
 * @param {object} [options]
 * @param {number} [options.reach]  REACH_PX for a finger; a mouse is precise and
 *   gets far less, or a click beside a pin on a large district would open a chooser
 * @returns {{action: 'clear'} | {action: 'pick', target} | {action: 'choose', targets}}
 */
export function resolveTap(
	{ contained, containedSmall = false, small = [], markers = [] },
	{ reach = REACH_PX } = {}
) {
	const districts = [];
	if (contained) districts.push({ kind: 'district', id: contained, dist: 0 });
	small
		.filter((d) => d.id !== contained)
		.sort((a, b) => a.dist - b.dist)
		.forEach((d) => districts.push({ kind: 'district', id: d.id, dist: d.dist }));

	const near = markers
		.filter((m) => m.dist <= m.radius + reach)
		.sort((a, b) => a.dist - b.dist);
	const direct = near.filter((m) => m.dist <= m.radius + 4);

	const all = [...districts, ...near];
	if (!all.length) return { action: 'clear' };
	if (all.length === 1) return { action: 'pick', target: all[0] };

	// A bubble hit squarely is never ambiguous, even in the dense core. It is
	// the biggest thing drawn there and nobody taps a "37" by accident - and
	// zooming in is the right answer for the core anyway, because it separates
	// the pins and makes the small districts big enough to tap. The first
	// version asked "which did you mean?" here, which was a question with an
	// obvious answer.
	const bubble = direct.find((m) => m.kind === 'cluster');
	if (bubble) return { action: 'pick', target: bubble };

	const dense = containedSmall || districts.length > 1;
	if (!dense) {
		if (direct.length) return { action: 'pick', target: direct[0] };
		if (contained) return { action: 'pick', target: districts[0] };
	}

	return { action: 'choose', targets: all };
}
