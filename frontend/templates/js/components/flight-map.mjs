// The Kotoka route map.
//
// Every nonstop destination from Accra, drawn as a great circle on a cropped
// world. Same approach as /map and for the same reasons: one same-origin JSON,
// hand-drawn SVG, no tile server and no mapping library - which is what lets
// it work under the site's CSP, cost one request, and load on a slow
// connection.
//
// The arcs are computed on the sphere in build_flight_map.py and projected
// point by point, so they curve the way a flight path actually does rather
// than being drawn as decorative bezier curves between two dots.
//
// It zooms, because eleven of the thirty-eight destinations are inside West
// Africa and at the default view they are a knot around Ghana. Zoom, pan,
// pinch, scroll, the buttons and the keyboard all drive the same viewBox.
//
// Everything here is enhancement. The page already lists all 38 destinations
// as HTML before this runs, which is what a crawler and a reader without
// JavaScript get.

import { element } from '/js/utils/format.mjs';

const DATA_URL = '/geo/flights.json';

const REGION_ORDER = [
	'Domestic', 'West Africa', 'Rest of Africa', 'Europe', 'Middle East', 'North America',
];

// How far in and out the view may go, as a fraction of the whole network.
const MIN_SPAN = 0.06;   // about sixteen times in - a single city and its neighbours
const MAX_SPAN = 1.0;    // never further out than the whole map

// Past this a drag is a drag rather than a shaky press. In client pixels, not
// map units: at the default zoom a fraction of the viewBox is under two
// physical pixels, and a mouse drifts that far between press and release
// almost every time, which is how /map once swallowed every click.
const DRAG_SLOP_PX = 4;

const integer = (value) => Number(value).toLocaleString('en-GB');
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

class FlightMap extends HTMLElement {
	async connectedCallback() {
		if (this.rendered) return;
		this.rendered = true;

		this.replaceChildren(element('p', { class: 'tool-note', text: 'Loading the route map…' }));

		try {
			const response = await fetch(DATA_URL);
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			this.data = await response.json();
		} catch (error) {
			// The list below the map is the same information, so say so rather
			// than leaving an empty box.
			this.replaceChildren(element('p', { class: 'tool-note', text:
				'The route map could not load. Every destination is listed below it.' }));
			console.warn('Flight map:', error);
			return;
		}

		const [x, y, w, h] = this.data.meta.viewBox.split(/\s+/).map(Number);
		this.home = { x, y, w, h };
		this.box = { ...this.home };

		this.region = 'all';
		this.selected = null;
		this.dragging = false;

		this.build();
		this.draw();
		this.bindPointer();
		this.applyBox();
	}

	// ------------------------------------------------------------------ build

	build() {
		const { meta } = this.data;

		this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		this.svg.setAttribute('class', 'flight-canvas');
		this.svg.setAttribute('role', 'img');
		this.svg.setAttribute('tabindex', '0');
		this.svg.setAttribute('aria-label',
			`Nonstop flight routes from ${meta.origin.city}. Drag to pan, scroll to zoom. ` +
			'Every destination is also listed below this map.');

		const regions = ['all', ...REGION_ORDER.filter((r) =>
			this.data.destinations.some((d) => d.region === r))];

		this.filters = element('div', { class: 'flight-filters', role: 'group',
			'aria-label': 'Filter routes by region' },
			regions.map((region) => element('button', {
				type: 'button',
				class: `flight-chip${region === 'all' ? ' is-on' : ''}`,
				'aria-pressed': String(region === 'all'),
				text: region === 'all' ? `All ${this.data.destinations.length}` : region,
				// Zooming to a region is the thing people want from a filter on
				// a map: West Africa is unreadable at the full view.
				onclick: () => this.setRegion(region),
			}))
		);

		this.zoomControls = element('div', { class: 'flight-zoom', role: 'group',
			'aria-label': 'Zoom the map' }, [
			element('button', { type: 'button', class: 'flight-zoom-button',
				'aria-label': 'Zoom in', text: '+', onclick: () => this.zoomBy(1 / 1.4) }),
			element('button', { type: 'button', class: 'flight-zoom-button',
				'aria-label': 'Zoom out', text: '−', onclick: () => this.zoomBy(1.4) }),
			element('button', { type: 'button', class: 'flight-zoom-button flight-zoom-reset',
				'aria-label': 'Show the whole network', text: 'Reset', onclick: () => this.reset() }),
		]);

		this.panel = element('div', { class: 'flight-panel', 'aria-live': 'polite' });
		this.stage = element('div', { class: 'flight-stage' }, [this.svg, this.zoomControls]);

		this.replaceChildren(this.filters, this.stage, this.panel);
		this.renderPanel(null);
	}

	draw() {
		const { world, destinations, meta } = this.data;
		const ns = 'http://www.w3.org/2000/svg';
		const make = (tag, attrs) => {
			const node = document.createElementNS(ns, tag);
			for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
			return node;
		};

		// Coastlines first, so everything else sits on top of them.
		const land = make('g', { class: 'flight-land' });
		for (const path of world) land.append(make('path', { d: path }));
		this.svg.append(land);

		const arcs = make('g', { class: 'flight-arcs' });
		const dots = make('g', { class: 'flight-dots' });

		this.nodes = new Map();

		for (const destination of destinations) {
			const arc = make('path', {
				d: destination.path,
				class: `flight-arc region-${this.slug(destination.region)}`,
			});
			arcs.append(arc);

			// A button rather than a circle with a click handler, so it is
			// reachable by keyboard and announced as something you can press.
			const hit = make('g', {
				class: `flight-dot region-${this.slug(destination.region)}`,
				tabindex: '0',
				role: 'button',
				'aria-label':
					`${destination.city}, ${destination.country}. ` +
					`${integer(destination.km)} kilometres. ` +
					`${destination.airlines.map((a) => a.name).join(', ')}.`,
			});
			hit.append(make('circle', { cx: destination.x, cy: destination.y, class: 'flight-dot-hit' }));
			hit.append(make('circle', { cx: destination.x, cy: destination.y, class: 'flight-dot-mark' }));

			const label = make('text', {
				x: destination.x, y: destination.y, class: 'flight-dot-label',
			});
			label.textContent = destination.city;
			hit.append(label);

			// Not while dragging: passing the cursor over a dozen dots on the
			// way across the map should not leave the panel flickering.
			const show = () => { if (!this.dragging) this.select(destination); };
			hit.addEventListener('pointerenter', show);
			hit.addEventListener('focus', show);
			hit.addEventListener('click', show);
			hit.addEventListener('keydown', (event) => {
				if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); show(); }
			});

			dots.append(hit);
			this.nodes.set(destination.iata, { arc, hit, destination });
		}

		this.svg.append(arcs, dots);

		// Accra last, on top of everything, and visibly different.
		const origin = make('g', { class: 'flight-origin' });
		origin.append(make('circle', { cx: meta.origin.x, cy: meta.origin.y, class: 'flight-origin-dot' }));
		const label = make('text', { x: meta.origin.x, y: meta.origin.y, class: 'flight-origin-label' });
		label.textContent = meta.origin.iata;
		origin.append(label);
		this.svg.append(origin);
	}

	slug(region) {
		return region.toLowerCase().replace(/[^a-z0-9]+/g, '-');
	}

	// ------------------------------------------------------------------- view

	applyBox() {
		const { x, y, w, h } = this.box;

		// A NaN anywhere in here renders nothing at all and says nothing about
		// why. /map learned this the expensive way.
		if (![x, y, w, h].every(Number.isFinite)) {
			console.warn('flight-map: refusing a non-finite viewBox', this.box);
			return;
		}

		this.svg.setAttribute('viewBox', `${x} ${y} ${w} ${h}`);

		// How many user units make one screen pixel at the current zoom. Every
		// stroke, dot and label is sized as a multiple of this, so a 2px arc
		// stays 2px whether you are looking at the Atlantic or at Lomé.
		const width = this.stage.getBoundingClientRect().width || 1;
		this.style.setProperty('--flight-unit', String(w / width));

		// Names only once there is room for them. Thirty-eight labels at the
		// full view is not a label layer, it is a smear.
		this.classList.toggle('is-zoomed', w < this.home.w * 0.55);
		this.classList.toggle('is-home', Math.abs(w - this.home.w) < 1);
	}

	/**
	 * Keep the view over the map.
	 *
	 * Without this a hard scroll leaves you looking at empty space with no clue
	 * which way the world went. Half a view of slack, so panning to the edge
	 * still feels free.
	 */
	clampBox(box) {
		const slack = { x: box.w / 2, y: box.h / 2 };
		return {
			w: box.w,
			h: box.h,
			x: clamp(box.x, this.home.x - slack.x, this.home.x + this.home.w - box.w + slack.x),
			y: clamp(box.y, this.home.y - slack.y, this.home.y + this.home.h - box.h + slack.y),
		};
	}

	zoomBy(factor, anchor = null) {
		const w = clamp(this.box.w * factor, this.home.w * MIN_SPAN, this.home.w * MAX_SPAN);
		const h = w * (this.home.h / this.home.w);
		const point = anchor || { x: this.box.x + this.box.w / 2, y: this.box.y + this.box.h / 2 };

		// Keep whatever is under the cursor under the cursor.
		const rx = (point.x - this.box.x) / this.box.w;
		const ry = (point.y - this.box.y) / this.box.h;

		this.box = this.clampBox({ x: point.x - w * rx, y: point.y - h * ry, w, h });
		this.applyBox();
	}

	reset() {
		this.box = { ...this.home };
		this.applyBox();
	}

	/** Frame a set of destinations, with room around them. */
	frame(points) {
		if (!points.length) return this.reset();

		const xs = points.map((p) => p.x).concat(this.data.meta.origin.x);
		const ys = points.map((p) => p.y).concat(this.data.meta.origin.y);
		const pad = this.home.w * 0.06;

		const minX = Math.min(...xs) - pad;
		const maxX = Math.max(...xs) + pad;
		const minY = Math.min(...ys) - pad;
		const maxY = Math.max(...ys) + pad;

		// Grow the tighter axis so the aspect ratio never changes; a squashed
		// world is worse than a loose crop.
		const ratio = this.home.h / this.home.w;
		let w = Math.max(maxX - minX, (maxY - minY) / ratio);
		w = clamp(w, this.home.w * MIN_SPAN, this.home.w * MAX_SPAN);
		const h = w * ratio;

		this.box = this.clampBox({
			x: (minX + maxX) / 2 - w / 2,
			y: (minY + maxY) / 2 - h / 2,
			w, h,
		});
		this.applyBox();
	}

	clientToMap(event) {
		const rect = this.svg.getBoundingClientRect();
		return {
			x: this.box.x + ((event.clientX - rect.left) / rect.width) * this.box.w,
			y: this.box.y + ((event.clientY - rect.top) / rect.height) * this.box.h,
		};
	}

	// --------------------------------------------------------------- pointers

	bindPointer() {
		const pointers = new Map();
		let pinchStart = null;
		let pressedAt = null;
		let captured = false;

		this.svg.addEventListener('pointerdown', (event) => {
			pointers.set(event.pointerId, event);
			this.dragging = false;
			pressedAt = { x: event.clientX, y: event.clientY };

			if (pointers.size === 1) {
				this.dragFrom = { pointer: this.clientToMap(event), box: { ...this.box } };
				captured = false;
				// Capture is NOT taken here, and that is the whole point.
				//
				// A captured pointer retargets the click that follows it to the
				// capturing element, so every click would land on the <svg>
				// rather than on the destination under the cursor, and the
				// per-dot handlers would never run. That is exactly the bug
				// /map shipped with: hover worked and clicking did nothing.
			} else if (pointers.size === 2) {
				const [a, b] = [...pointers.values()];
				pinchStart = {
					distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
					box: { ...this.box },
				};
			}
		});

		this.svg.addEventListener('pointermove', (event) => {
			if (!pointers.has(event.pointerId)) return;
			pointers.set(event.pointerId, event);

			if (pointers.size === 2 && pinchStart) {
				const [a, b] = [...pointers.values()];
				const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
				if (distance > 0) {
					this.box = { ...pinchStart.box };
					this.zoomBy(clamp(pinchStart.distance / distance, 0.2, 5));
					this.dragging = true;
				}
				return;
			}

			if (!this.dragFrom) return;

			if (pressedAt) {
				const moved = Math.hypot(event.clientX - pressedAt.x, event.clientY - pressedAt.y);
				if (moved > DRAG_SLOP_PX) {
					this.dragging = true;
					this.classList.add('is-dragging');
					// Now it is a drag, so capture is safe: this gesture will
					// never be a click, and capture is what keeps the pan alive
					// when the cursor leaves the map.
					if (!captured) {
						try {
							this.svg.setPointerCapture(event.pointerId);
							captured = true;
						} catch {
							// An optimisation only. Panning still works to the
							// edge of the element without it.
						}
					}
				}
			}

			if (!this.dragging) return;

			const now = this.clientToMap(event);
			this.box = this.clampBox({
				...this.dragFrom.box,
				x: this.dragFrom.box.x + (this.dragFrom.pointer.x - now.x),
				y: this.dragFrom.box.y + (this.dragFrom.pointer.y - now.y),
			});
			this.applyBox();
		});

		const release = (event) => {
			pointers.delete(event.pointerId);
			if (pointers.size < 2) pinchStart = null;
			if (pointers.size === 0) {
				this.dragFrom = null;
				pressedAt = null;
				this.classList.remove('is-dragging');
				if (captured) {
					try { this.svg.releasePointerCapture(event.pointerId); } catch { /* already released */ }
					captured = false;
				}
				// Cleared after the click has been and gone, so a drag that
				// finishes on a dot does not also select it.
				window.setTimeout(() => { this.dragging = false; }, 0);
			}
		};
		this.svg.addEventListener('pointerup', release);
		this.svg.addEventListener('pointercancel', release);

		this.svg.addEventListener('wheel', (event) => {
			event.preventDefault();
			this.zoomBy(event.deltaY > 0 ? 1.15 : 1 / 1.15, this.clientToMap(event));
		}, { passive: false });

		// The map is focusable, so it should answer the keyboard.
		this.svg.addEventListener('keydown', (event) => {
			const step = this.box.w * 0.12;
			const moves = {
				ArrowLeft: [-step, 0], ArrowRight: [step, 0],
				ArrowUp: [0, -step], ArrowDown: [0, step],
			};

			if (moves[event.key]) {
				const [dx, dy] = moves[event.key];
				this.box = this.clampBox({ ...this.box, x: this.box.x + dx, y: this.box.y + dy });
				this.applyBox();
			} else if (event.key === '+' || event.key === '=') {
				this.zoomBy(1 / 1.4);
			} else if (event.key === '-' || event.key === '_') {
				this.zoomBy(1.4);
			} else if (event.key === '0' || event.key === 'Escape') {
				this.reset();
			} else {
				return;
			}

			event.preventDefault();
		});
	}

	// ------------------------------------------------------------ interaction

	setRegion(region) {
		this.region = region;
		for (const button of this.filters.querySelectorAll('.flight-chip')) {
			const on = button.textContent.startsWith('All') ? region === 'all' : button.textContent === region;
			button.classList.toggle('is-on', on);
			button.setAttribute('aria-pressed', String(on));
		}

		const inRegion = [];
		for (const { arc, hit, destination } of this.nodes.values()) {
			const dim = region !== 'all' && destination.region !== region;
			arc.classList.toggle('is-dim', dim);
			hit.classList.toggle('is-dim', dim);
			if (!dim) inRegion.push(destination);
		}

		// Zoom to what was asked for. Filtering West Africa and leaving the
		// view over the Atlantic would be a filter that does half its job.
		if (region === 'all') this.reset();
		else this.frame(inRegion);
	}

	select(destination) {
		if (this.selected === destination.iata) return;
		this.selected = destination.iata;

		for (const [iata, { arc, hit }] of this.nodes) {
			const on = iata === destination.iata;
			arc.classList.toggle('is-active', on);
			hit.classList.toggle('is-active', on);
		}

		this.renderPanel(destination);
	}

	renderPanel(destination) {
		if (!destination) {
			const { destinations } = this.data;
			const furthest = destinations.reduce((a, b) => (a.km > b.km ? a : b));
			const airlines = new Set(destinations.flatMap((d) => d.airlines.map((a) => a.name)));

			this.panel.replaceChildren(
				element('p', { class: 'flight-panel-hint', text:
					'Hover or tap a destination. Drag to pan, scroll or pinch to zoom.' }),
				element('dl', { class: 'flight-stats' }, [
					element('dt', { text: 'Nonstop destinations' }),
					element('dd', { text: String(destinations.length) }),
					element('dt', { text: 'Airlines' }),
					element('dd', { text: String(airlines.size) }),
					element('dt', { text: 'Furthest' }),
					element('dd', { text: `${furthest.city}, ${integer(furthest.km)}km` }),
				])
			);
			return;
		}

		this.panel.replaceChildren(
			element('p', { class: 'flight-panel-eyebrow', text: destination.region }),
			element('h3', { class: 'flight-panel-city', text: `${destination.city} (${destination.iata})` }),
			element('p', { class: 'flight-panel-meta',
				text: `${destination.name} · ${destination.country} · ${integer(destination.km)}km nonstop` }),
			element('ul', { class: 'flight-panel-airlines' },
				destination.airlines.map((airline) => element('li', {}, [
					document.createTextNode(airline.name),
					airline.note ? element('span', { class: 'flight-note', text: ` ${airline.note}` }) : null,
				]))
			)
		);
	}
}

customElements.define('flight-map', FlightMap);
