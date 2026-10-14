// The JKIA route map.
//
// Every nonstop destination from Nairobi, drawn as a great circle on a cropped
// world. Same approach as /map and for the same reasons: one same-origin JSON,
// hand-drawn SVG, no tile server and no mapping library - which is what lets
// it work under the site's CSP, cost one request, and load on a slow
// connection.
//
// The arcs are computed on the sphere in build_flight_map.py and projected
// point by point, so they curve the way a flight path actually does rather
// than being drawn as decorative bezier curves between two dots.
//
// It zooms, because many destinations are in East Africa and at the default
// view they are a knot around Kenya. Zoom, pan, pinch, scroll, the buttons and
// the keyboard all drive the same viewBox.
//
// Everything here is enhancement. The page already lists every destination
// as HTML before this runs, which is what a crawler and a reader without
// JavaScript get.
//
// The phone layout
// ----------------
// Redesigned from measurements, the same way /map was. At 393x851 the old
// layout put the map 57% of the way down the first screen at a quarter of its
// height, behind three rows of region chips. Fourteen of the thirty-eight
// destinations - every domestic route and most of West Africa - sat under one
// fingertip at Nairobi, and a tap aimed dead centre on Lagos selected Lome,
// whose hit circle covered it. Once something was selected nothing could
// deselect it. Hence: the controls on the map, the region chips as one row
// that is also the key, an "ACC +14" bubble instead of fourteen dots, a tap
// resolver that asks when a finger genuinely covers several cities, and a
// sheet over the map so the answer is never below it.
//
// The geometry - which names fit, which dots merge, what a tap meant - is
// map-placement.mjs, shared with /map and checked from Node.

import { element } from '/js/utils/format.mjs';
import {
	REACH_PX, clusterPoints, placeLabels, resolveTap, toScreen, unitsPerPixel,
} from '/js/utils/map-placement.mjs';

const DATA_URL = '/geo/flights.json';

const REGION_ORDER = [
	'Domestic', 'East Africa', 'Rest of Africa', 'Europe', 'Middle East', 'Asia', 'North America',
];

// How far in the view may go, as a fraction of the whole network's width.
const MIN_SPAN = 0.05;

// Past this a drag is a drag rather than a shaky press. In client pixels, not
// map units: at the default zoom a fraction of the viewBox is under two
// physical pixels, and a mouse drifts that far between press and release
// almost every time, which is how /map once swallowed every click.
const DRAG_SLOP_PX = 4;

// Dots closer than this on screen merge into one bubble. Smaller than /map's,
// because a city dot is smaller than a landmark pin.
const CLUSTER_PX = 22;

// Nairobi gathers from further out than a bubble does. At the same radius a
// "3" bubble sat a thumb's width from "ACC +13", and three things crowded on
// the origin read as clutter rather than as Nairobi and its neighbours.
const ORIGIN_PX = 44;

const EASE_MS = 600;

const NARROW = '(max-width: 719px)';

const integer = (value) => Number(value).toLocaleString('en-GB');
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const slug = (text) => String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isNarrow = () => window.matchMedia(NARROW).matches;
const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** Fit a box to an aspect ratio without ever cropping it. */
function fit(box, aspect) {
	if (box.w / box.h > aspect) {
		const h = box.w / aspect;
		return { x: box.x, y: box.y + (box.h - h) / 2, w: box.w, h };
	}
	const w = box.h * aspect;
	return { x: box.x + (box.w - w) / 2, y: box.y, w, h: box.h };
}

const ICONS = {
	expand: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
	collapse: 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5',
	home: 'M4 11 12 4l8 7M6 9.5V20h12V9.5',
	plus: 'M12 5v14M5 12h14',
	minus: 'M5 12h14',
	close: 'M6 6l12 12M18 6 6 18',
	search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM20 20l-4-4',
};

function icon(name) {
	const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	svg.setAttribute('viewBox', '0 0 24 24');
	svg.setAttribute('aria-hidden', 'true');
	svg.setAttribute('class', 'map-icon');
	const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
	path.setAttribute('d', ICONS[name]);
	svg.append(path);
	return svg;
}

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
		this.box = null;
		this.size = { width: 1, height: 1 };

		this.state = {
			region: 'all',
			airline: null,
			selected: null, // an IATA code, or 'origin'
			sheet: 'closed',
			fullscreen: false,
			query: '',
		};
		this.lastInput = 'mouse';
		this.layoutKey = '';

		this.byIata = new Map(this.data.destinations.map((d) => [d.iata, d]));

		this.build();
		this.draw();
		this.bindPointer();
		this.bindTouch();
		this.bindWheel();
		this.bindKeys();
		this.observe();

		this.measure();
		this.flyTo(this.fitVisible(this.home), true);
		this.renderSheet();

		if (this.applyHash()) this.revealMap();
		window.addEventListener('hashchange', () => { if (this.applyHash()) this.revealMap(); });
		window.addEventListener('popstate', (event) => {
			if (this.state.fullscreen && !(event.state && event.state.flightMapFullscreen)) {
				this.setFullscreen(false, { fromHistory: true });
			}
		});
	}

	disconnectedCallback() {
		if (this.animation) cancelAnimationFrame(this.animation);
		if (this.resizeObserver) this.resizeObserver.disconnect();
		if (this.yieldObserver) this.yieldObserver.disconnect();
		const float = document.querySelector('.support-float');
		if (float) float.classList.remove('is-yielding-map');
		document.documentElement.classList.remove('map-fullscreen-open');
	}

	// ------------------------------------------------------------------ build

	build() {
		const { meta } = this.data;
		this.classList.add('flight-map');

		this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		this.svg.setAttribute('class', 'flight-canvas');
		// A group, not an image. role="img" made every one of the thirty-eight
		// focusable destinations inside it presentational, so a screen reader
		// heard one picture where there were thirty-eight buttons.
		this.svg.setAttribute('role', 'group');
		this.svg.setAttribute('tabindex', '0');
		this.svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
		this.svg.setAttribute('aria-label',
			`Nonstop flight routes from ${meta.origin.city}. ` +
			'Every destination is also listed below this map.');

		this.searchInput = element('input', {
			type: 'search',
			id: 'flight-search',
			placeholder: 'Where to? A city or an airline',
			autocomplete: 'off',
			spellcheck: 'false',
			enterkeyhint: 'search',
			oninput: (event) => {
				this.state.query = event.target.value.trim();
				this.renderSuggestions();
			},
			onfocus: () => { if (isNarrow() && !this.state.fullscreen) this.revealMap(); },
			onkeydown: (event) => {
				if (event.key === 'Escape') {
					event.target.value = '';
					this.state.query = '';
					this.renderSuggestions();
				}
				if (event.key === 'Enter') {
					event.preventDefault();
					const first = this.suggestions.querySelector('button');
					if (first) first.click();
				}
				if (event.key === 'ArrowDown') {
					const first = this.suggestions.querySelector('button');
					if (first) { event.preventDefault(); first.focus(); }
				}
			},
		});
		this.suggestions = element('div', {
			class: 'map-suggestions', role: 'listbox', 'aria-label': 'Matching destinations and airlines', hidden: 'hidden',
		});

		this.fullscreenButton = element('button', {
			type: 'button',
			class: 'map-fab map-fullscreen-button',
			'aria-label': 'Full screen map',
			'aria-pressed': 'false',
			onclick: () => this.setFullscreen(!this.state.fullscreen),
		}, [icon('expand'), icon('collapse')]);

		const regions = REGION_ORDER.filter((r) => this.data.destinations.some((d) => d.region === r));

		// One row of chips, scrolled sideways, rather than three wrapped rows
		// above the map. Each carries its route colour, so the filter is also
		// the key - there is no separate legend to scroll to.
		this.chips = element('div', { class: 'flight-chips', role: 'group', 'aria-label': 'Show routes to' },
			['all', ...regions].map((region) => element('button', {
				type: 'button',
				class: `flight-chip region-${slug(region)}`,
				'data-region': region,
				'aria-pressed': String(region === 'all'),
				onclick: () => this.setRegion(region),
			}, [
				region === 'all' ? null : element('span', { class: 'flight-chip-dot', 'aria-hidden': 'true' }),
				element('span', { text: region === 'all' ? `All ${this.data.destinations.length}` : region }),
			]))
		);

		this.airlineChip = element('button', {
			type: 'button',
			class: 'flight-chip is-airline',
			hidden: 'hidden',
			onclick: () => this.setAirline(null),
		});
		this.chips.prepend(this.airlineChip);

		this.toolbar = element('div', { class: 'flight-toolbar no-print' }, [
			element('div', { class: 'map-search' }, [
				element('label', { class: 'visually-hidden', for: 'flight-search', text: 'Search destinations and airlines' }),
				icon('search'),
				this.searchInput,
				this.suggestions,
			]),
			this.fullscreenButton,
			this.chips,
		]);

		const zoomButton = (name, aria, factor) => element('button', {
			type: 'button', class: 'map-fab map-fab-small', 'aria-label': aria,
			onclick: () => this.zoomBy(factor, null, true),
		}, [icon(name)]);

		this.zooms = element('div', { class: 'map-zooms no-print' }, [
			zoomButton('plus', 'Zoom in', 0.6),
			zoomButton('minus', 'Zoom out', 1 / 0.6),
			element('button', {
				type: 'button', class: 'map-fab map-fab-small', 'aria-label': 'Show the whole network',
				onclick: () => this.setRegion('all'),
			}, [icon('home')]),
		]);

		// A photograph, and it says so on the photograph. Airlines move routes
		// with weeks of notice; the date belongs next to the lines, not only in
		// a paragraph further down the page.
		const taken = new Date(meta.generated + 'T00:00:00').toLocaleDateString('en-GB', {
			day: 'numeric', month: 'long', year: 'numeric',
		});
		this.caption = element('p', { class: 'flight-caption', text: `Routes as of ${taken}` });

		this.chooser = element('div', { class: 'map-chooser', role: 'dialog', 'aria-label': 'Which did you mean?', hidden: 'hidden' });
		this.toast = element('div', { class: 'map-toast', 'aria-hidden': 'true', hidden: 'hidden' });

		this.stage = element('div', { class: 'map-stage flight-stage' }, [
			this.svg, this.toolbar, this.zooms, this.caption, this.chooser, this.toast,
		]);

		// The details.
		this.sheetHandle = element('button', {
			type: 'button', class: 'map-sheet-handle', 'aria-expanded': 'false',
			'aria-label': 'Show more about this route',
			onclick: () => {
				if (this.sheetDragged) return;
				this.setSheet(this.state.sheet === 'open' ? 'peek' : 'open');
			},
		}, [element('span', { class: 'map-sheet-grip' })]);
		this.sheetSummary = element('div', { class: 'map-sheet-summary', 'aria-live': 'polite' });
		this.sheetClose = element('button', {
			type: 'button', class: 'map-sheet-close', 'aria-label': 'Close', onclick: () => this.select(null),
		}, [icon('close')]);
		this.sheetHead = element('div', { class: 'map-sheet-head' }, [this.sheetHandle, this.sheetSummary, this.sheetClose]);
		this.sheetBody = element('div', { class: 'map-sheet-body' });
		this.sheet = element('section', {
			class: 'map-sheet flight-sheet', 'aria-label': 'Selected destination', 'data-state': 'closed',
		}, [this.sheetHead, this.sheetBody]);
		this.bindSheetDrag();

		this.frame = element('div', { class: 'map-frame flight-frame' }, [this.stage, this.sheet]);
		this.replaceChildren(this.frame);
		this.renderChips();
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
		this.clusterLayer = make('g', { class: 'flight-clusters' });

		this.nodes = new Map();

		for (const destination of destinations) {
			const region = slug(destination.region);
			const arc = make('path', { d: destination.path, class: `flight-arc region-${region}` });
			arcs.append(arc);

			// A button rather than a circle with a click handler, so it is
			// reachable by keyboard and announced as something you can press.
			const hit = make('g', {
				class: `flight-dot region-${region}`,
				tabindex: '0',
				role: 'button',
				'data-iata': destination.iata,
				'aria-label':
					`${destination.city}, ${destination.country}. ` +
					`${integer(destination.km)} kilometres. ` +
					`${destination.airlines.map((a) => a.name).join(', ')}.`,
			});
			hit.append(make('circle', { cx: destination.x, cy: destination.y, class: 'flight-dot-mark' }));

			const label = make('text', {
				x: destination.x, y: destination.y, class: 'flight-dot-label',
				'text-anchor': 'start', dx: '0.9em', dy: '0.35em',
			});
			label.textContent = destination.city;
			hit.append(label);

			// A mouse previews by hovering - in the column beside the map, and
			// without flying, or crossing the map would be a fairground ride.
			hit.addEventListener('pointerenter', (event) => {
				if (event.pointerType === 'mouse' && !this.dragging && !this.sheetOverlays() && !this.isDim(destination)) {
					this.select(destination.iata, { fly: false });
				}
			});
			hit.addEventListener('focus', () => this.select(destination.iata, { fly: false }));
			hit.addEventListener('keydown', (event) => {
				if (event.key === 'Enter' || event.key === ' ') {
					event.preventDefault();
					this.select(destination.iata);
				}
			});

			dots.append(hit);
			this.nodes.set(destination.iata, { arc, hit, label, destination });
		}

		this.svg.append(arcs, dots, this.clusterLayer);

		// Nairobi last, on top of everything, and visibly different.
		const origin = make('g', { class: 'flight-origin' });
		origin.append(make('circle', { cx: meta.origin.x, cy: meta.origin.y, class: 'flight-origin-dot' }));
		const label = make('text', { x: meta.origin.x, y: meta.origin.y, class: 'flight-origin-label' });
		label.textContent = meta.origin.iata;
		this.originBadge = make('g', {
			class: 'cluster flight-origin-badge', transform: `translate(${meta.origin.x} ${meta.origin.y})`,
		});
		this.originBadgeText = make('text', { class: 'cluster-count' });
		this.originBadge.append(make('circle', { class: 'cluster-dot' }), this.originBadgeText);
		origin.append(label, this.originBadge);
		this.svg.append(origin);
	}

	// ------------------------------------------------------------------- view

	measure() {
		const rect = this.stage.getBoundingClientRect();
		this.size = { width: rect.width || 1, height: rect.height || 1 };
	}

	aspect() {
		return this.size.width / this.size.height;
	}

	sheetOverlays() {
		return getComputedStyle(this.sheet).position === 'absolute';
	}

	sheetVisible() {
		if (!this.sheetOverlays() || this.state.sheet === 'closed') return 0;
		if (this.state.sheet === 'open') return this.sheet.offsetHeight;
		return this.sheetHead.offsetHeight;
	}

	toolbarHeight() {
		return this.toolbar.offsetTop + this.toolbar.offsetHeight;
	}

	/** Fit `content` into the part of the stage nothing is floating over. */
	fitVisible(content) {
		const { width, height } = this.size;
		const top = this.toolbarHeight() + 4;
		const caption = this.state.sheet === 'open' && this.sheetOverlays() ? 0 : this.caption.offsetHeight + 8;
		const bottom = Math.max(this.sheetVisible(), caption) + 4;
		const free = Math.max(80, height - top - bottom);
		const box = fit(content, width / free);
		const unit = box.w / width;
		return this.clampBox({ x: box.x, y: box.y - top * unit, w: box.w, h: height * unit });
	}

	/**
	 * Keep the middle of the view over the map.
	 *
	 * Measured from the centre rather than the edges, so it works for a view
	 * of any shape: the stage on a phone is taller than the world crop, and an
	 * edge clamp would have fought every portrait view.
	 */
	clampBox(box) {
		const cx = clamp(box.x + box.w / 2, this.home.x, this.home.x + this.home.w);
		const cy = clamp(box.y + box.h / 2, this.home.y, this.home.y + this.home.h);
		return { x: cx - box.w / 2, y: cy - box.h / 2, w: box.w, h: box.h };
	}

	flyTo(target, immediate = false) {
		if (this.animation) cancelAnimationFrame(this.animation);
		if (immediate || !this.box || reducedMotion()) {
			this.box = target;
			this.applyBox();
			this.layoutOverlays(true);
			return;
		}
		const from = { ...this.box };
		const start = performance.now();
		const step = (now) => {
			const t = clamp((now - start) / EASE_MS, 0, 1);
			const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
			this.box = {
				x: from.x + (target.x - from.x) * e,
				y: from.y + (target.y - from.y) * e,
				w: from.w + (target.w - from.w) * e,
				h: from.h + (target.h - from.h) * e,
			};
			this.applyBox();
			if (t < 1) this.animation = requestAnimationFrame(step);
			else { this.animation = null; this.layoutOverlays(true); }
		};
		this.animation = requestAnimationFrame(step);
	}

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
		// stays 2px whether you are looking at the Atlantic or at Lome.
		this.style.setProperty('--flight-unit', String(unitsPerPixel(this.box, this.size)));
		this.layoutOverlays();
	}

	zoomBy(factor, anchor = null, animate = false) {
		if (!this.box) return;
		const widest = fit(this.home, this.aspect()).w * 1.2;
		const w = clamp(this.box.w * factor, this.home.w * MIN_SPAN, widest);
		const h = w / (this.box.w / this.box.h);
		const point = anchor || { x: this.box.x + this.box.w / 2, y: this.box.y + this.box.h / 2 };
		const rx = (point.x - this.box.x) / this.box.w;
		const ry = (point.y - this.box.y) / this.box.h;
		const target = this.clampBox({ x: point.x - w * rx, y: point.y - h * ry, w, h });
		if (animate) this.flyTo(target);
		else { this.box = target; this.applyBox(); }
	}

	/**
	 * Frame a set of destinations, with Nairobi always among them.
	 *
	 * Not called frame(): `this.frame` is the frame element, and assigning it
	 * in build() shadowed a method of that name. Every region chip, the ACC
	 * bubble and every selection then threw on tap, silently, inside a click
	 * handler.
	 */
	frameRoutes(points) {
		const all = [...points, this.data.meta.origin];
		const xs = all.map((p) => p.x), ys = all.map((p) => p.y);
		const minX = Math.min(...xs), maxX = Math.max(...xs);
		const minY = Math.min(...ys), maxY = Math.max(...ys);
		const span = Math.max(maxX - minX, maxY - minY, this.home.w * MIN_SPAN * 1.6);
		const pad = span * 0.18;
		this.flyTo(this.fitVisible({
			x: minX - pad, y: minY - pad,
			w: Math.max(maxX - minX, span * 0.5) + pad * 2,
			h: Math.max(maxY - minY, span * 0.35) + pad * 2,
		}));
	}

	// ------------------------------------------------------- what gets drawn

	isDim(destination) {
		if (this.state.region !== 'all' && destination.region !== this.state.region) return true;
		if (this.state.airline && !destination.airlines.some((a) => a.name === this.state.airline)) return true;
		return false;
	}

	/**
	 * Merge dots, place names, every time the zoom moves a noticeable step.
	 *
	 * Destinations within a bubble's reach of Nairobi join Nairobi itself rather
	 * than a bubble of their own - otherwise the West Africa bubble lands on
	 * the origin and hides it. So at the default phone zoom the origin reads
	 * "ACC +14", and tapping it opens up the region.
	 */
	layoutOverlays(force = false) {
		if (!this.box || !this.nodes) return;
		const unit = unitsPerPixel(this.box, this.size);
		const key = [Math.round(Math.log2(unit) * 6), this.state.region, this.state.airline, this.state.selected].join('|');
		if (!force && key === this.layoutKey) return;
		this.layoutKey = key;

		const origin = this.data.meta.origin;
		const o = toScreen(this.box, this.size, origin.x, origin.y);
		const visible = this.data.destinations.filter((d) => !this.isDim(d));
		const selected = this.state.selected;

		const nearOrigin = [];
		const rest = [];
		for (const d of visible) {
			const s = toScreen(this.box, this.size, d.x, d.y);
			if (d.iata !== selected && Math.hypot(s.x - o.x, s.y - o.y) <= ORIGIN_PX) nearOrigin.push(d);
			else rest.push(d);
		}

		const clusters = clusterPoints(
			rest.map((d) => ({ id: d.iata, x: d.x, y: d.y })),
			this.box, this.size, CLUSTER_PX, new Set(selected ? [selected] : [])
		);

		this.markers = [{
			key: 'origin', kind: nearOrigin.length ? 'cluster' : 'origin', origin: true,
			ids: nearOrigin.map((d) => d.iata), x: origin.x, y: origin.y,
		}];
		const merged = new Set(nearOrigin.map((d) => d.iata));
		for (const c of clusters) {
			if (c.ids.length > 1) c.ids.forEach((id) => merged.add(id));
			this.markers.push({
				key: c.ids.length > 1 ? 'cluster:' + c.ids.join(',') : 'dest:' + c.ids[0],
				kind: c.ids.length > 1 ? 'cluster' : 'landmark',
				ids: c.ids, x: c.x, y: c.y,
			});
		}

		for (const [iata, { arc, hit, destination }] of this.nodes) {
			const dim = this.isDim(destination);
			arc.classList.toggle('is-dim', dim);
			hit.classList.toggle('is-dim', dim);
			hit.classList.toggle('is-clustered', merged.has(iata));
		}

		this.originBadge.classList.toggle('is-on', nearOrigin.length > 0);
		this.originBadgeText.textContent = '+' + nearOrigin.length;

		const ns = 'http://www.w3.org/2000/svg';
		this.clusterLayer.replaceChildren(...this.markers.filter((m) => m.kind === 'cluster' && !m.origin).map((m) => {
			const g = document.createElementNS(ns, 'g');
			g.setAttribute('class', 'cluster');
			g.setAttribute('transform', `translate(${m.x} ${m.y})`);
			g.setAttribute('role', 'img');
			g.setAttribute('aria-label', `${m.ids.length} destinations: ${m.ids.map((id) => this.byIata.get(id).city).join(', ')}.`);
			const dot = document.createElementNS(ns, 'circle');
			dot.setAttribute('class', 'cluster-dot');
			const text = document.createElementNS(ns, 'text');
			text.setAttribute('class', 'cluster-count');
			text.textContent = String(m.ids.length);
			g.append(dot, text);
			return g;
		}));

		this.placeNames();
	}

	/** City names beside their dots, never over a dot, a bubble or Nairobi. */
	placeNames() {
		const fontPx = isNarrow() ? 11 : 10;
		this.style.setProperty('--flight-label-px', String(fontPx));
		const r = 7;
		const h = fontPx * 1.3;

		const obstacles = this.markers.map((m) => {
			const s = toScreen(this.box, this.size, m.x, m.y);
			const radius = m.kind === 'cluster' ? 13 : m.origin ? 9 : 5;
			return {
				left: s.x - radius, right: s.x + radius, top: s.y - radius, bottom: s.y + radius,
				// A city's own dot never blocks its own name.
				id: m.kind === 'landmark' ? m.ids[0] : undefined,
			};
		});
		// "ACC" itself, which sits to the right of the origin dot.
		const o = toScreen(this.box, this.size, this.data.meta.origin.x, this.data.meta.origin.y);
		obstacles.push({ left: o.x + 8, right: o.x + 42, top: o.y - 9, bottom: o.y + 9 });

		const singles = this.markers.filter((m) => m.kind === 'landmark');
		const labels = singles.map((m) => {
			const d = this.byIata.get(m.ids[0]);
			return {
				id: d.iata, x: d.x, y: d.y, text: d.city,
				// Busier routes are named first.
				priority: d.airlines.length * 10000 + d.km,
				forced: d.iata === this.state.selected,
			};
		});

		const shown = placeLabels(labels, this.box, this.size, {
			fontPx,
			obstacles,
			candidates: [
				{ dx: r, dy: 0, align: 'start' },
				{ dx: -r, dy: 0, align: 'end' },
				{ dx: 0, dy: -h, align: 'middle' },
				{ dx: 0, dy: h, align: 'middle' },
			],
		});

		for (const [iata, { label }] of this.nodes) {
			const at = shown.get(iata);
			label.classList.toggle('is-placed', !!at);
			if (!at) continue;
			label.setAttribute('text-anchor', at.align);
			label.setAttribute('dx', (at.dx / fontPx).toFixed(2) + 'em');
			// +0.35em puts the middle of a lowercase line on the anchor.
			label.setAttribute('dy', (at.dy / fontPx + 0.35).toFixed(2) + 'em');
		}
	}

	zoomToIds(ids, withOrigin = false) {
		const points = ids.map((id) => this.byIata.get(id));
		if (withOrigin || !points.length) return this.frameRoutes(points);
		const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
		const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), this.home.w * MIN_SPAN * 1.6);
		const cx = (Math.max(...xs) + Math.min(...xs)) / 2, cy = (Math.max(...ys) + Math.min(...ys)) / 2;
		this.flyTo(this.fitVisible({ x: cx - span * 0.75, y: cy - span * 0.75, w: span * 1.5, h: span * 1.5 }));
	}

	// --------------------------------------------------------------- pointers

	clientToMap(clientX, clientY) {
		const rect = this.svg.getBoundingClientRect();
		return {
			x: this.box.x + ((clientX - rect.left) / rect.width) * this.box.w,
			y: this.box.y + ((clientY - rect.top) / rect.height) * this.box.h,
		};
	}

	pinchStart(a, b) {
		return {
			distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
			mid: { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 },
			box: { ...this.box },
			rect: this.svg.getBoundingClientRect(),
		};
	}

	/** Two fingers: zoom about the point between them, and pan with it. */
	pinchMove(start, a, b) {
		const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
		if (!distance || !start.distance) return;
		const mid = { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
		const { box, rect } = start;
		const widest = fit(this.home, this.aspect()).w * 1.2;
		const w = clamp(box.w * clamp(start.distance / distance, 0.2, 5), this.home.w * MIN_SPAN, widest);
		const h = w * (box.h / box.w);
		const px = box.x + ((start.mid.x - rect.left) / rect.width) * box.w;
		const py = box.y + ((start.mid.y - rect.top) / rect.height) * box.h;
		this.box = this.clampBox({
			x: px - ((mid.x - rect.left) / rect.width) * w,
			y: py - ((mid.y - rect.top) / rect.height) * h,
			w, h,
		});
		this.applyBox();
	}

	/** Mouse, pen, and a finger in full screen. Inline, a finger is bindTouch's. */
	bindPointer() {
		const pointers = new Map();
		let pinch = null;
		let pressedAt = null;
		let captured = false;
		this.dragging = false;

		const owns = (event) => event.pointerType !== 'touch' || this.state.fullscreen;

		this.svg.addEventListener('pointerdown', (event) => {
			this.lastInput = event.pointerType || 'mouse';
			if (!this.box || !owns(event)) return;
			this.hideChooser();
			pointers.set(event.pointerId, event);
			this.dragging = false;
			pressedAt = { x: event.clientX, y: event.clientY };
			if (pointers.size === 1) {
				this.dragFrom = { pointer: this.clientToMap(event.clientX, event.clientY), box: { ...this.box } };
				captured = false;
				// Capture is NOT taken here: a captured pointer retargets the
				// click that follows it, which is the bug /map shipped with -
				// hover worked and clicking did nothing. It is taken once the
				// gesture is known to be a drag.
			} else if (pointers.size === 2) {
				const [a, b] = [...pointers.values()];
				pinch = this.pinchStart(a, b);
			}
		});

		this.svg.addEventListener('pointermove', (event) => {
			if (!pointers.has(event.pointerId) || !this.box) return;
			pointers.set(event.pointerId, event);

			if (pointers.size === 2 && pinch) {
				const [a, b] = [...pointers.values()];
				this.pinchMove(pinch, a, b);
				this.dragging = true;
				return;
			}
			if (!this.dragFrom) return;

			if (pressedAt && !this.dragging) {
				if (Math.hypot(event.clientX - pressedAt.x, event.clientY - pressedAt.y) <= DRAG_SLOP_PX) return;
				this.dragging = true;
				this.classList.add('is-dragging');
				if (!captured) {
					try { this.svg.setPointerCapture(event.pointerId); captured = true; } catch { /* optional */ }
				}
			}

			const rect = this.svg.getBoundingClientRect();
			const start = this.dragFrom.box;
			this.box = this.clampBox({
				...start,
				x: this.dragFrom.pointer.x - ((event.clientX - rect.left) / rect.width) * start.w,
				y: this.dragFrom.pointer.y - ((event.clientY - rect.top) / rect.height) * start.h,
			});
			this.applyBox();
		});

		const release = (event) => {
			if (!pointers.has(event.pointerId)) return;
			pointers.delete(event.pointerId);
			if (pointers.size < 2) pinch = null;
			if (pointers.size === 0) {
				this.dragFrom = null;
				pressedAt = null;
				this.classList.remove('is-dragging');
				if (captured) {
					try { this.svg.releasePointerCapture(event.pointerId); } catch { /* already released */ }
					captured = false;
				}
				if (this.dragging) this.layoutOverlays(true);
			}
		};
		this.svg.addEventListener('pointerup', release);
		this.svg.addEventListener('pointercancel', release);

		// One click handler for the whole map, deciding from the geometry what
		// the tap was aimed at. Per-dot handlers asked the DOM, and the DOM said
		// Lome when the finger was on Lagos.
		this.svg.addEventListener('click', (event) => {
			if (this.dragging || performance.now() < (this.suppressClickUntil || 0)) {
				this.dragging = false;
				event.preventDefault();
				return;
			}
			if (this.box) this.handleTap(event.clientX, event.clientY);
		});
	}

	/**
	 * One finger scrolls the page, two move the map - the arrangement every
	 * embedded map settles on. See /map's accra-map.mjs for why it has to be
	 * touch events rather than pointer events.
	 */
	bindTouch() {
		let pinch = null;
		let single = null;

		this.svg.addEventListener('touchstart', (event) => {
			this.lastInput = 'touch';
			if (this.state.fullscreen || !this.box) return;
			this.hideChooser();
			if (event.touches.length >= 2) {
				pinch = this.pinchStart(event.touches[0], event.touches[1]);
				single = null;
				if (event.cancelable) event.preventDefault();
			} else {
				single = { x: event.touches[0].clientX, y: event.touches[0].clientY };
			}
		}, { passive: false });

		this.svg.addEventListener('touchmove', (event) => {
			if (this.state.fullscreen || !this.box) return;
			if (event.touches.length >= 2) {
				if (!pinch) pinch = this.pinchStart(event.touches[0], event.touches[1]);
				if (event.cancelable) event.preventDefault();
				this.pinchMove(pinch, event.touches[0], event.touches[1]);
				return;
			}
			if (single) {
				const dx = event.touches[0].clientX - single.x;
				const dy = event.touches[0].clientY - single.y;
				if (Math.abs(dx) > 14 && Math.abs(dx) > Math.abs(dy) * 1.2) {
					this.showToast('Use two fingers to move the map, or go full screen');
					single = null;
				}
			}
		}, { passive: false });

		const end = (event) => {
			if (pinch && event.touches.length < 2) {
				pinch = null;
				this.suppressClickUntil = performance.now() + 400;
				this.layoutOverlays(true);
			}
			if (!event.touches.length) single = null;
		};
		this.svg.addEventListener('touchend', end);
		this.svg.addEventListener('touchcancel', end);
	}

	/** The wheel scrolls the page unless Ctrl or Cmd is held, or in full screen. */
	bindWheel() {
		this.svg.addEventListener('wheel', (event) => {
			if (!this.box) return;
			if (!(this.state.fullscreen || event.ctrlKey || event.metaKey)) {
				this.showToast(`Hold ${isMac() ? '⌘' : 'Ctrl'} and scroll to zoom the map`);
				return;
			}
			event.preventDefault();
			this.zoomBy(Math.exp(clamp(event.deltaY, -120, 120) * 0.0022), this.clientToMap(event.clientX, event.clientY));
			clearTimeout(this.wheelTimer);
			this.wheelTimer = setTimeout(() => this.layoutOverlays(true), 160);
		}, { passive: false });
	}

	bindKeys() {
		// The map is focusable, so it should answer the keyboard.
		this.svg.addEventListener('keydown', (event) => {
			if (!this.box) return;
			const step = this.box.w * 0.12;
			const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
			if (moves[event.key]) {
				const [dx, dy] = moves[event.key];
				this.box = this.clampBox({ ...this.box, x: this.box.x + dx, y: this.box.y + dy });
				this.applyBox();
				this.layoutOverlays(true);
			} else if (event.key === '+' || event.key === '=') this.zoomBy(0.7, null, true);
			else if (event.key === '-' || event.key === '_') this.zoomBy(1 / 0.7, null, true);
			else if (event.key === '0') this.setRegion('all');
			else return;
			event.preventDefault();
		});

		this.addEventListener('keydown', (event) => {
			if (event.key !== 'Escape') return;
			if (!this.chooser.hidden) { this.hideChooser(true); return; }
			if (this.state.selected) { this.select(null); return; }
			if (this.state.fullscreen) this.setFullscreen(false);
		});

		document.addEventListener('pointerdown', (event) => {
			if (!this.chooser.hidden && !this.chooser.contains(event.target)) this.hideChooser();
			if (!this.suggestions.hidden && !this.querySelector('.map-search').contains(event.target)) {
				this.suggestions.hidden = true;
			}
		});
	}

	observe() {
		this.resizeObserver = new ResizeObserver(() => {
			const before = this.size;
			this.measure();
			if (!this.box) return;
			if (Math.abs(before.width - this.size.width) < 1 && Math.abs(before.height - this.size.height) < 1) return;
			this.flyTo(this.clampBox(fit(this.box, this.aspect())), true);
		});
		this.resizeObserver.observe(this.stage);

		if ('IntersectionObserver' in window) {
			this.yieldObserver = new IntersectionObserver(([entry]) => {
				this.stageInView = entry.isIntersecting;
				this.yieldSupport();
			}, { threshold: 0.25 });
			this.yieldObserver.observe(this.stage);
		}
	}

	/** The floating coffee button steps aside while the map fills a phone. */
	yieldSupport() {
		const float = document.querySelector('.support-float');
		if (!float) return;
		float.classList.toggle('is-yielding-map',
			this.isConnected && (this.state.fullscreen || (!!this.stageInView && this.sheetOverlays())));
	}

	// ----------------------------------------------------------------- tapping

	handleTap(clientX, clientY) {
		const rect = this.svg.getBoundingClientRect();
		const point = { x: clientX - rect.left, y: clientY - rect.top };
		const touch = this.lastInput === 'touch' || this.lastInput === 'pen';
		const reach = touch ? REACH_PX : 4;

		const markers = (this.markers || []).map((m) => {
			const s = toScreen(this.box, this.size, m.x, m.y);
			return {
				...m,
				dist: Math.hypot(s.x - point.x, s.y - point.y),
				radius: m.kind === 'cluster' ? 13 : m.origin ? 9 : 6,
			};
		}).filter((m) => m.dist <= 50);

		const result = resolveTap({ contained: null, markers }, { reach });
		if (result.action === 'clear') { if (this.state.selected) this.select(null); return; }
		if (result.action === 'pick') { this.act(result.target); return; }
		this.showChooser(result.targets, point);
	}

	act(target) {
		this.hideChooser();
		if (target.kind === 'cluster') this.zoomToIds(target.ids, !!target.origin);
		else if (target.origin) this.select('origin');
		else this.select(target.ids[0]);
	}

	/** "Which did you mean?" - only when a finger genuinely covered several. */
	showChooser(targets, point) {
		const items = targets.slice(0, 6).map((target) => {
			let label, detail;
			if (target.kind === 'cluster') {
				label = target.origin ? `Nairobi and ${target.ids.length} nearby` : `${target.ids.length} destinations`;
				detail = 'Zoom in to see them';
			} else if (target.origin) {
				label = 'Nairobi (NBO)';
				detail = 'Where every route starts';
			} else {
				const d = this.byIata.get(target.ids[0]);
				label = `${d.city} (${d.iata})`;
				detail = `${d.country} · ${integer(d.km)}km`;
			}
			return element('button', {
				type: 'button', class: 'map-chooser-item', onclick: () => this.act(target),
			}, [element('strong', { text: label }), element('span', { text: detail })]);
		});
		items.push(element('button', {
			type: 'button', class: 'map-chooser-item is-zoom',
			onclick: () => {
				this.hideChooser();
				const rect = this.svg.getBoundingClientRect();
				this.zoomBy(0.4, this.clientToMap(point.x + rect.left, point.y + rect.top), true);
			},
		}, [icon('plus'), element('strong', { text: 'Zoom in here' })]));

		this.chooser.replaceChildren(element('p', { class: 'map-chooser-title', text: 'Which did you mean?' }), ...items);
		this.chooser.hidden = false;
		this.chooserReturn = document.activeElement;

		const { width, height } = this.size;
		const w = this.chooser.offsetWidth, h = this.chooser.offsetHeight;
		const top = clamp(point.y - h / 2, this.toolbarHeight() + 4, Math.max(this.toolbarHeight() + 4, height - h - 8));
		const left = point.x + 16 + w < width - 8 ? point.x + 16 : clamp(point.x - w - 16, 8, width - w - 8);
		this.chooser.style.left = left + 'px';
		this.chooser.style.top = top + 'px';
		items[0].focus({ preventScroll: true });
	}

	hideChooser(restoreFocus = false) {
		if (this.chooser.hidden) return;
		this.chooser.hidden = true;
		if (restoreFocus && this.chooserReturn && this.chooserReturn.focus) this.chooserReturn.focus({ preventScroll: true });
	}

	showToast(text) {
		if (this.toastTimer && this.toast.textContent === text) return;
		this.toast.textContent = text;
		this.toast.hidden = false;
		requestAnimationFrame(() => this.toast.classList.add('is-on'));
		clearTimeout(this.toastTimer);
		this.toastTimer = setTimeout(() => {
			this.toast.classList.remove('is-on');
			this.toastTimer = setTimeout(() => { this.toast.hidden = true; this.toastTimer = null; }, 250);
		}, 1600);
	}

	// ------------------------------------------------------------ interaction

	setRegion(region) {
		this.state.region = region;
		this.state.airline = null;
		this.renderChips();
		this.layoutKey = '';

		const inRegion = this.data.destinations.filter((d) => !this.isDim(d));
		// Zoom to what was asked for. Filtering East Africa and leaving the
		// view over the Atlantic would be a filter that does half its job.
		if (region === 'all') this.flyTo(this.fitVisible(this.home));
		else this.frameRoutes(inRegion);

		if (this.state.selected && this.state.selected !== 'origin' && this.isDim(this.byIata.get(this.state.selected))) {
			this.select(null);
		} else {
			this.layoutOverlays(true);
			this.renderSheet();
		}
	}

	setAirline(name) {
		this.state.airline = name;
		this.state.region = 'all';
		this.renderChips();
		this.layoutKey = '';
		const served = this.data.destinations.filter((d) => !this.isDim(d));
		if (name) this.frameRoutes(served);
		else this.flyTo(this.fitVisible(this.home));
		if (this.state.selected && this.state.selected !== 'origin' && this.isDim(this.byIata.get(this.state.selected))) {
			this.select(null);
		} else this.layoutOverlays(true);
	}

	renderChips() {
		for (const chip of this.chips.querySelectorAll('[data-region]')) {
			const on = !this.state.airline && chip.dataset.region === this.state.region;
			chip.classList.toggle('is-on', on);
			chip.setAttribute('aria-pressed', String(on));
		}
		this.airlineChip.hidden = !this.state.airline;
		if (this.state.airline) {
			this.airlineChip.replaceChildren(icon('close'), element('span', { text: this.state.airline }));
			this.airlineChip.setAttribute('aria-label', `Showing ${this.state.airline} only. Show every airline`);
			this.airlineChip.classList.add('is-on');
			this.chips.scrollLeft = 0;
		}
	}

	select(iata, { fly = true } = {}) {
		this.hideChooser();
		const changed = iata !== this.state.selected;
		this.state.selected = iata;

		for (const [code, { arc, hit }] of this.nodes) {
			const on = code === iata;
			arc.classList.toggle('is-active', on);
			hit.classList.toggle('is-active', on);
		}
		this.classList.toggle('has-selection', !!iata && iata !== 'origin');

		if (changed) {
			this.layoutKey = '';
			this.layoutOverlays(true);
		}
		if (!iata) this.state.sheet = 'closed';
		else if (this.state.sheet === 'closed') this.state.sheet = 'peek';
		this.renderSheet();

		if (iata && fly) {
			if (iata === 'origin') this.frameRoutes(this.data.destinations.filter((d) => !this.isDim(d)));
			else this.frameRoutes([this.byIata.get(iata)]);
		}
		// Only a deliberate choice is worth a URL. A hover or a focus is a
		// preview: writing those to the hash made the address bar flicker
		// through every city a mouse crossed, and a copied link pointed at
		// whichever one it brushed last.
		if (fly || !iata) this.updateHash();
	}

	renderSheet() {
		const iata = this.state.selected;
		this.sheetSummary.replaceChildren();
		this.sheetBody.replaceChildren();
		this.sheetClose.hidden = !iata;
		this.sheet.classList.toggle('is-empty', !iata);

		const { destinations, meta } = this.data;

		if (!iata) {
			const furthest = destinations.reduce((a, b) => (a.km > b.km ? a : b));
			const airlines = new Set(destinations.flatMap((d) => d.airlines.map((a) => a.name)));
			this.sheetSummary.append(
				element('p', { class: 'map-eyebrow', text: 'From ' + meta.origin.iata }),
				element('h3', { text: 'Where you can fly nonstop' }),
			);
			this.sheetBody.append(
				element('dl', { class: 'map-facts' }, [
					element('dt', { text: 'Destinations' }), element('dd', { text: String(destinations.length) }),
					element('dt', { text: 'Airlines' }), element('dd', { text: String(airlines.size) }),
					element('dt', { text: 'Furthest' }), element('dd', { text: `${furthest.city}, ${integer(furthest.km)}km` }),
				]),
				element('p', { class: 'map-hint', text: 'Tap a city, or search for one or for an airline.' })
			);
		} else if (iata === 'origin') {
			this.sheetSummary.append(
				element('p', { class: 'map-eyebrow', text: 'Origin' }),
				element('h3', { text: `${meta.origin.city} (${meta.origin.iata})` }),
				element('p', { class: 'map-headline', text: `${meta.origin.name} · ${destinations.length} nonstop destinations` }),
			);
			this.sheetBody.append(element('ul', { class: 'flight-regions' },
				REGION_ORDER.filter((r) => destinations.some((d) => d.region === r)).map((region) => {
					const n = destinations.filter((d) => d.region === region).length;
					return element('li', {}, [element('button', {
						type: 'button', class: `flight-region-row region-${slug(region)}`,
						onclick: () => { this.select(null); this.setRegion(region); },
					}, [
						element('span', { class: 'flight-chip-dot', 'aria-hidden': 'true' }),
						element('span', { text: region }),
						element('span', { class: 'flight-region-count', text: String(n) }),
					])]);
				})
			));
		} else {
			const d = this.byIata.get(iata);
			const n = d.airlines.length;
			// One airline on 29 of the 38 routes, so the peek names it and most
			// readers never need to open the sheet at all.
			const who = n === 1
				? d.airlines[0].name + (d.airlines[0].note ? ` (${d.airlines[0].note})` : '')
				: `${n} airlines`;
			this.sheetSummary.append(
				element('p', { class: 'map-eyebrow', text: d.region }),
				element('h3', { text: `${d.city} (${d.iata})` }),
				element('p', { class: 'map-headline', text: `${who} · ${d.country} · ${integer(d.km)}km nonstop` }),
			);
			this.sheetBody.append(
				element('ul', { class: 'flight-airlines' },
					d.airlines.map((airline) => element('li', {}, [
						element('button', {
							type: 'button', class: 'flight-airline',
							'aria-label': `${airline.name}: show every route it flies from Nairobi`,
							onclick: () => { this.select(null); this.setAirline(airline.name); },
						}, [
							element('span', { text: airline.name }),
							airline.note ? element('span', { class: 'flight-note', text: airline.note }) : null,
						]),
					]))
				),
				element('dl', { class: 'map-facts' }, [
					element('dt', { text: 'Airport' }), element('dd', { text: d.name }),
				]),
				element('p', { class: 'map-hint', text: 'Routes change with weeks of notice. Check with the airline before you book.' })
			);
		}

		if (!this.sheetOverlays()) this.setSheet('open', false);
		else this.setSheet(iata ? (this.state.sheet === 'closed' ? 'peek' : this.state.sheet) : 'closed', false);
	}

	/**
	 * Closed, peeking or open, over a phone's map; always open beside a wide
	 * one. Laid out at full height and moved with a transform, so the numbers
	 * below never change mid-animation - the same arrangement as /map.
	 *
	 * Open-only was the first version, on the theory that a city and its
	 * airlines is short. On a 407px map it was 270px, and the zoom buttons and
	 * the date were shoved up into the search bar.
	 */
	setSheet(state, refly = true) {
		if (!this.state.selected && this.sheetOverlays()) state = 'closed';
		const changed = state !== this.state.sheet;
		this.state.sheet = state;
		this.sheet.dataset.state = state;
		this.sheetHandle.setAttribute('aria-expanded', String(state === 'open'));
		this.sheetHandle.setAttribute('aria-label', state === 'open' ? 'Show less' : 'Show more about this route');
		this.frame.classList.toggle('is-sheet-open', state === 'open' && this.sheetOverlays());
		this.frame.style.setProperty('--sheet-peek', Math.max(0, this.sheet.offsetHeight - this.sheetHead.offsetHeight) + 'px');
		this.frame.style.setProperty('--sheet-visible', this.sheetVisible() + 'px');
		// Opening or closing changes how much map is left, so frame the route
		// again in what remains.
		const iata = this.state.selected;
		if (refly && changed && iata && iata !== 'origin') this.frameRoutes([this.byIata.get(iata)]);
	}

	bindSheetDrag() {
		let start = null;
		this.sheetHead.addEventListener('pointerdown', (event) => {
			if (!this.sheetOverlays() || event.target.closest('.map-sheet-close')) return;
			this.sheetDragged = false;
			start = { y: event.clientY, id: event.pointerId };
		});
		this.sheetHead.addEventListener('pointermove', (event) => {
			if (!start || event.pointerId !== start.id) return;
			const dy = event.clientY - start.y;
			if (!this.sheetDragged && Math.abs(dy) < 6) return;
			if (!this.sheetDragged) {
				this.sheetDragged = true;
				this.sheet.classList.add('is-dragging');
				try { this.sheetHead.setPointerCapture(event.pointerId); } catch { /* fine */ }
			}
			const from = this.state.sheet === 'open' ? 0 : this.sheet.offsetHeight - this.sheetHead.offsetHeight;
			this.sheet.style.transform = `translateY(${clamp(from + dy, 0, this.sheet.offsetHeight)}px)`;
		});
		const end = (event) => {
			if (!start || event.pointerId !== start.id) return;
			const dy = event.clientY - start.y;
			const dragged = this.sheetDragged;
			this.sheet.classList.remove('is-dragging');
			this.sheet.style.transform = '';
			start = null;
			if (dragged) {
				if (dy < -40) this.setSheet('open');
				else if (dy > 40 && this.state.sheet === 'open') this.setSheet('peek');
				else if (dy > 40) this.select(null);
			}
			setTimeout(() => { this.sheetDragged = false; }, 0);
		};
		this.sheetHead.addEventListener('pointerup', end);
		this.sheetHead.addEventListener('pointercancel', end);
	}

	// ------------------------------------------------------------------ search

	renderSuggestions() {
		const query = this.state.query.toLowerCase();
		this.suggestions.replaceChildren();
		if (query.length < 2) { this.suggestions.hidden = true; return; }

		// Ranked by how well the name matches, not places first. Typing
		// "emirates" listed Dubai and Abu Dhabi above the airline, because both
		// are in the United Arab Emirates - and someone typing an airline's name
		// means the airline. A name that starts with the query beats a city in a
		// matching country, which beats an airport name or a word mid-way through
		// an airline's.
		const lower = (text) => String(text).toLowerCase();
		const places = this.data.destinations.map((d) => {
			const score =
				lower(d.city).startsWith(query) || lower(d.iata) === query ? 0 :
				lower(d.city).includes(query) || lower(d.country).includes(query) ? 1 :
				lower(d.name).includes(query) ? 2 : -1;
			return { kind: 'place', score, label: `${d.city} (${d.iata})`, detail: `${d.country} · ${integer(d.km)}km`, iata: d.iata };
		}).filter((hit) => hit.score >= 0);

		const counts = new Map();
		for (const d of this.data.destinations) for (const a of d.airlines) counts.set(a.name, (counts.get(a.name) || 0) + 1);
		const airlines = [...counts].map(([name, n]) => ({
			kind: 'airline', name,
			score: lower(name).startsWith(query) ? 0 : lower(name).includes(query) ? 2 : -1,
			label: name, detail: `${n} ${n === 1 ? 'route' : 'routes'} from Nairobi`,
		})).filter((hit) => hit.score >= 0);

		// Stable sort, so at equal scores places keep coming before airlines.
		const hits = [...places, ...airlines]
			.map((hit, order) => ({ hit, order }))
			.sort((a, b) => a.hit.score - b.hit.score || a.order - b.order)
			.map(({ hit }) => hit)
			.slice(0, isNarrow() ? 5 : 8);

		if (!hits.length) {
			// The useful answer to "can I fly to X" when the answer is no.
			this.suggestions.append(element('p', { class: 'map-hint flight-no-route',
				text: 'No nonstop route from Nairobi matches that. You would need to change planes.' }));
			this.suggestions.hidden = false;
			return;
		}

		for (const hit of hits) {
			this.suggestions.append(element('button', {
				type: 'button', role: 'option', class: 'map-suggestion',
				onkeydown: (event) => {
					const all = [...this.suggestions.querySelectorAll('button')];
					const at = all.indexOf(event.currentTarget);
					if (event.key === 'ArrowDown' && all[at + 1]) { event.preventDefault(); all[at + 1].focus(); }
					if (event.key === 'ArrowUp') { event.preventDefault(); (all[at - 1] || this.searchInput).focus(); }
				},
				onclick: () => {
					this.searchInput.value = hit.label;
					this.state.query = '';
					this.suggestions.hidden = true;
					this.searchInput.blur();
					if (hit.kind === 'airline') { this.select(null); this.setAirline(hit.name); return; }
					if (this.isDim(this.byIata.get(hit.iata))) {
						this.state.region = 'all';
						this.state.airline = null;
						this.renderChips();
					}
					this.select(hit.iata);
				},
			}, [element('strong', { text: hit.label }), element('span', { text: hit.detail })]));
		}
		this.suggestions.hidden = false;
	}

	// ------------------------------------------------------------- full screen

	setFullscreen(on, { fromHistory = false } = {}) {
		if (on === this.state.fullscreen) return;
		this.state.fullscreen = on;
		this.classList.toggle('is-fullscreen', on);
		document.documentElement.classList.toggle('map-fullscreen-open', on);
		this.fullscreenButton.setAttribute('aria-pressed', String(on));
		this.fullscreenButton.setAttribute('aria-label', on ? 'Leave full screen' : 'Full screen map');
		this.yieldSupport();
		if (on) {
			history.pushState({ ...(history.state || {}), flightMapFullscreen: true }, '');
		} else if (!fromHistory && history.state && history.state.flightMapFullscreen) {
			history.back();
			return;
		}
		if (!on) this.revealMap(true);
	}

	revealMap(instant = false) {
		if (this.state.fullscreen) return;
		const rect = this.frame.getBoundingClientRect();
		const header = parseFloat(getComputedStyle(document.documentElement).fontSize) * 3.5;
		if (rect.top >= header - 4 && (rect.bottom <= window.innerHeight + 4 || rect.top < window.innerHeight * 0.35)) return;
		this.frame.scrollIntoView({ block: 'start', behavior: instant || reducedMotion() ? 'auto' : 'smooth' });
	}

	// -------------------------------------------------------------- deep links

	updateHash() {
		const iata = this.state.selected;
		const hash = iata && iata !== 'origin' ? '#to=' + iata.toLowerCase() : '';
		if (hash !== window.location.hash && (hash || /^#to=/.test(window.location.hash))) {
			history.replaceState(history.state, '', hash || window.location.pathname + window.location.search);
		}
	}

	applyHash() {
		const match = /^#to=([a-z]{3})$/i.exec(window.location.hash);
		if (!match) return false;
		const iata = match[1].toUpperCase();
		if (!this.byIata.has(iata)) return false;
		this.select(iata);
		return true;
	}
}

customElements.define('flight-map', FlightMap);
