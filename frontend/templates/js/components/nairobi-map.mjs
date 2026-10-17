// The interactive map at /map.
//
// No tile server, no mapping library, no third-party request. The whole thing
// is one SVG built from /geo/nairobi-map.json, served from this origin, so it
// works behind a strict CSP, costs one request, and keeps working on a
// pay-as-you-go bundle. Everything - pan, zoom, fly-to, deep links - is the
// viewBox being moved.
//
// Two sets of shapes share one coordinate space. The 17 constituencies carry
// the population estimates, the wealth index and the rent bands; the census's
// 11 sub-counties carry its real 2019 counts, on different lines. A census
// layer switches the map to sub-counties rather than force its figures onto
// the wrong shapes. scripts/build_nairobi_map.py explains the method.
//
// The phone layout
// ----------------
// Rebuilt the way All About Accra rebuilt its map, from measurements. At
// 393x851 the old layout put the map 689px down the first screen, behind the
// intro, a search box, a layer menu, four zoom buttons and ten category chips;
// the details ran below the map, so reading them scrolled the map away, and the
// key that explains the colours sat under the details. Now the map is the first
// thing on the screen; the search, the layers button, zoom and the key float
// over it; the details are a sheet that leaves the map visible; a tap that
// could mean several small constituencies asks which; and landmark pins that
// would overlap merge into a bubble with a count (map-placement.mjs, which is
// pure and shared with the flight map).

import { element } from '/js/utils/format.mjs';
import {
	FINGER_PX, REACH_PX, SMALL_PX,
	clusterPoints, placeLabels, resolveTap, toScreen, unitsPerPixel,
} from '/js/utils/map-placement.mjs';

const DATA_URL = '/geo/nairobi-map.json';
const SVG_NS = 'http://www.w3.org/2000/svg';

const EASE_MS = 650;

// How far the pointer may move between press and release and still count as a
// click rather than a drag, in screen pixels.
const DRAG_SLOP_PX = 4;

// Pins closer than this on screen merge into one bubble with a count.
const CLUSTER_PX = 26;

const NARROW = '(max-width: 719px)';

// Neighbourhood names by rank, and how far in (against the whole county) each
// rank needs the map to be before it is named.
const RANK_ZOOM = { 1: 1.35, 2: 2.3, 3: 3.8 };

// What the shapes can be coloured by, grouped the way the layers sheet shows
// them. `geo` is which shapes carry it. Quintiles, not equal-width bins:
// Nairobi's constituencies run from 3 km² to 250, so five equal slices of the
// range would put almost everything in one colour.
const GROUPS = [
	{ id: 'places', label: 'Constituencies' },
	{ id: 'people', label: 'People · estimates by constituency' },
	{ id: 'census', label: 'People · 2019 census, by sub-county' },
	{ id: 'homes', label: 'Homes · 2019 census, by sub-county' },
	{ id: 'living', label: 'Living' },
];

const count = (n) => Math.round(n).toLocaleString('en-KE');
const pct = (n) => `${n}%`;

const SHADES = [
	{ id: 'plain', group: 'places', label: 'Constituencies', kind: 'plain', geo: 'constituencies' },
	{ id: 'area', group: 'places', label: 'Area', kind: 'quantile', geo: 'constituencies', field: 'areaKm2',
	  format: (n) => `${n} km²`, caveat: 'Measured from the IEBC boundaries.' },

	{ id: 'density', group: 'people', label: 'People per km²', note: 'estimate', kind: 'quantile',
	  geo: 'constituencies', field: 'density', format: (n) => `about ${count(n)}`,
	  caveat: "The 2019 census total, shared out by WorldPop's model." },
	{ id: 'population', group: 'people', label: 'Population', note: 'estimate', kind: 'quantile',
	  geo: 'constituencies', field: 'population', format: (n) => `about ${count(n)}`,
	  caveat: "The 2019 census total, shared out by WorldPop's model." },

	{ id: 'census-density', group: 'census', label: 'People per km²', kind: 'quantile', geo: 'subcounties',
	  field: 'density', format: count, caveat: 'Real 2019 census counts, by sub-county.' },
	{ id: 'census-population', group: 'census', label: 'Population', kind: 'quantile', geo: 'subcounties',
	  field: 'population', format: count, caveat: 'Real 2019 census counts, by sub-county.' },
	{ id: 'census-women', group: 'census', label: 'Women', kind: 'quantile', geo: 'subcounties',
	  field: 'femalePct', format: pct, caveat: 'Real 2019 census counts, by sub-county.' },
	{ id: 'census-children', group: 'census', label: 'Children under 15', kind: 'quantile', geo: 'subcounties',
	  field: 'under15Pct', format: pct, caveat: 'Real 2019 census counts, by sub-county.' },
	{ id: 'census-young', group: 'census', label: 'Aged 20 to 34', kind: 'quantile', geo: 'subcounties',
	  field: 'age20to34Pct', format: pct, caveat: 'Real 2019 census counts, by sub-county.' },
	{ id: 'census-older', group: 'census', label: 'Aged 65 and over', kind: 'quantile', geo: 'subcounties',
	  field: 'over64Pct', format: pct, caveat: 'Real 2019 census counts, by sub-county.' },

	// Kenya's latest census, 2019: how households live. Shares of households,
	// except internet use, which is of people aged 3 and over.
	{ id: 'census-renting', group: 'homes', label: 'Households renting', kind: 'quantile', geo: 'subcounties',
	  field: 'rentingPct', format: pct, caveat: 'Share of households, 2019 census.' },
	{ id: 'census-household', group: 'homes', label: 'People per household', kind: 'quantile', geo: 'subcounties',
	  field: 'householdSize', format: (n) => n.toFixed(1), caveat: 'The 2019 census count over its households.' },
	{ id: 'census-piped', group: 'homes', label: 'Piped water at home', kind: 'quantile', geo: 'subcounties',
	  field: 'pipedPct', format: pct, caveat: 'Piped into the home, yard or plot. 2019 census.' },
	{ id: 'census-sewer', group: 'homes', label: 'On the main sewer', kind: 'quantile', geo: 'subcounties',
	  field: 'sewerPct', format: pct, caveat: 'Share of households, 2019 census.' },
	{ id: 'census-cooking', group: 'homes', label: 'Cooking with gas or electricity', kind: 'quantile', geo: 'subcounties',
	  field: 'cleanCookingPct', format: pct, caveat: 'Share of households, 2019 census.' },
	{ id: 'census-internet', group: 'homes', label: 'Using the internet', kind: 'quantile', geo: 'subcounties',
	  field: 'internetPct', format: pct, caveat: 'People aged 3 and over, 2019 census.' },

	{ id: 'wealth', group: 'living', label: 'Relative wealth', note: 'modelled', kind: 'quantile',
	  geo: 'constituencies', field: 'rwi', rank: true, ends: ['Least wealthy', 'Wealthiest'],
	  caveat: "Meta's satellite-based index. A ranking, not an income." },
	{ id: 'rent', group: 'living', label: 'Typical rent', note: 'indicative', kind: 'rent', geo: 'constituencies' },
];

// Where a place sits among the others, in words.
const BUCKET_WORDS = [
	'', 'among the lowest', 'below the middle', 'around the middle',
	'above the middle', 'among the highest',
];

const slug = (text) =>
	String(text).toLowerCase().replace(/'/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const normalise = (text) =>
	String(text).toLowerCase().normalize('NFD').replace(/[̀-ͯ']/g, '');

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const isNarrow = () => window.matchMedia(NARROW).matches;

const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

function ordinal(n) {
	const s = ['th', 'st', 'nd', 'rd'];
	const v = n % 100;
	return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/** Grow a box by a proportion of its size, so a selection is not flush to the edge. */
function pad(box, factor) {
	const dx = box.w * factor;
	const dy = box.h * factor;
	return { x: box.x - dx, y: box.y - dy, w: box.w + dx * 2, h: box.h + dy * 2 };
}

/** Fit a box to an aspect ratio without ever cropping it. */
function fit(box, aspect) {
	const current = box.w / box.h;
	if (current > aspect) {
		const h = box.w / aspect;
		return { x: box.x, y: box.y + (box.h - h) / 2, w: box.w, h };
	}
	const w = box.h * aspect;
	return { x: box.x + (box.w - w) / 2, y: box.y, w, h: box.h };
}

// Stroke icons, drawn rather than fetched.
const ICONS = {
	layers: 'M12 3 2 8l10 5 10-5-10-5ZM2 12l10 5 10-5M2 16l10 5 10-5',
	expand: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
	collapse: 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5',
	home: 'M4 11 12 4l8 7M6 9.5V20h12V9.5',
	plus: 'M12 5v14M5 12h14',
	minus: 'M5 12h14',
	close: 'M6 6l12 12M18 6 6 18',
	search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM20 20l-4-4',
	locate: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2v3M12 19v3M2 12h3M19 12h3',
};

function icon(name) {
	const svg = document.createElementNS(SVG_NS, 'svg');
	svg.setAttribute('viewBox', '0 0 24 24');
	svg.setAttribute('aria-hidden', 'true');
	svg.setAttribute('class', 'map-icon');
	const path = document.createElementNS(SVG_NS, 'path');
	path.setAttribute('d', ICONS[name]);
	svg.append(path);
	return svg;
}

function svgEl(tag, attrs = {}) {
	const node = document.createElementNS(SVG_NS, tag);
	for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
	return node;
}

class NairobiMap extends HTMLElement {
	connectedCallback() {
		if (this.rendered) return;
		this.rendered = true;

		this.state = {
			selected: null, // {kind: 'constituency'|'subcounty'|'landmark'|'rent', id}
			query: '',
			shade: 'plain',
			categories: null, // the landmark categories shown; all of them once loaded
			showLandmarks: true,
			showLabels: true,
			showPlaces: true,
			sheet: 'closed', // 'closed' | 'peek' | 'open' - where the sheet floats
			fullscreen: false,
		};

		this.box = null;
		this.animation = null;
		this.size = { width: 1, height: 1 };
		this.lastInput = 'mouse';
		this.layoutKey = '';

		this.build();
		this.load();
	}

	disconnectedCallback() {
		if (this.animation) cancelAnimationFrame(this.animation);
		if (this.resizeObserver) this.resizeObserver.disconnect();
		if (this.yieldObserver) this.yieldObserver.disconnect();
		const float = document.querySelector('.support-float');
		if (float) float.classList.remove('is-yielding-map');
		document.documentElement.classList.remove('map-fullscreen-open');
	}

	// ---------------------------------------------------------------- loading

	async load() {
		try {
			const response = await fetch(DATA_URL);
			if (!response.ok) throw new Error(String(response.status));
			this.data = await response.json();
		} catch (error) {
			console.warn('nairobi-map:', error);
			this.status.textContent = 'The map could not load. Everything on it is listed below.';
			this.status.hidden = false;
			this.classList.add('map-failed');
			return;
		}

		this.state.categories = new Set(Object.keys(this.data.categories));
		this.index();
		this.buildCategoryChips();
		this.draw();
		this.setShade(this.state.shade);
		this.status.hidden = true;
		this.classList.add('map-ready');

		// A shared link opens on what it points at, and a link in the tables
		// below the map brings the map into view rather than changing it two
		// screens up.
		if (this.applyHash()) this.revealMap();
		window.addEventListener('hashchange', () => {
			if (this.applyHash()) this.revealMap();
		});
		window.addEventListener('popstate', (event) => {
			// Our own step back out of full screen, from setFullscreen(false).
			if (this.unwinding) {
				this.unwinding = false;
				this.updateHash();
				this.revealMap(true);
				return;
			}
			if (this.state.fullscreen && !(event.state && event.state.nairobiMapFullscreen)) {
				this.setFullscreen(false, { fromHistory: true });
				// Going back restores the address from before full screen, which
				// names whatever was selected then. Write the current selection
				// back, before the hashchange that follows would re-select the
				// old one.
				this.updateHash();
			}
		});
	}

	index() {
		const { constituencies, subcounties, landmarks, neighbourhoods } = this.data;
		this.byId = new Map();
		constituencies.forEach((c) => this.byId.set('constituency:' + c.id, c));
		subcounties.forEach((s) => this.byId.set('subcounty:' + s.id, s));
		landmarks.forEach((l) => this.byId.set('landmark:' + l.id, l));
		neighbourhoods.forEach((n) => {
			n.id = slug(n.name);
			if (n.rent) this.byId.set('rent:' + n.id, n);
		});

		const rank = (list, field) =>
			new Map([...list].sort((a, b) => b[field] - a[field]).map((item, i) => [item.id, i + 1]));
		this.ranks = {
			density: rank(constituencies, 'density'),
			wealth: rank(constituencies, 'rwi'),
			censusDensity: rank(subcounties, 'density'),
		};

		// One flat list drives the search box.
		this.searchable = [];
		constituencies.forEach((c) => this.searchable.push({
			kind: 'constituency', id: c.id, label: c.name, detail: 'Constituency',
			terms: normalise(c.name),
		}));
		neighbourhoods.forEach((n) => {
			const home = constituencies.find((c) => c.id === n.constituency);
			this.searchable.push({
				kind: 'neighbourhood', id: n.id, label: n.name,
				detail: 'Neighbourhood' + (home ? ` in ${home.name}` : ''),
				terms: normalise(n.name),
			});
		});
		landmarks.forEach((l) => this.searchable.push({
			kind: 'landmark', id: l.id, label: l.name,
			detail: this.data.categories[l.category] || l.category,
			terms: normalise(`${l.name} ${this.data.categories[l.category] || ''} ${l.description || ''}`),
		}));
		subcounties.forEach((s) => this.searchable.push({
			kind: 'subcounty', id: s.id, label: `${s.name} sub-county`, detail: '2019 census',
			terms: normalise(`${s.name} sub-county census`),
		}));
	}

	// ----------------------------------------------------------------- markup

	build() {
		this.classList.add('city-map', 'nairobi-map', 'geo-constituencies');
		const uid = Math.random().toString(36).slice(2, 7);
		this.uid = uid;

		this.status = element('p', { class: 'map-status', role: 'status', text: 'Loading the map…' });

		this.svg = svgEl('svg', {
			class: 'map-canvas',
			role: 'group',
			'aria-label': 'Map of Nairobi',
			preserveAspectRatio: 'xMidYMid meet',
		});

		this.layers = {};
		// 'lifted' holds the selected pin, above the bubbles: in the city centre
		// a bubble of twelve sits exactly where the chosen landmark is.
		for (const name of ['outline', 'constituencies', 'subcounties', 'labels', 'rent', 'landmarks', 'clusters', 'lifted', 'you']) {
			const group = svgEl('g', { class: 'layer layer-' + name });
			this.layers[name] = group;
			this.svg.append(group);
		}

		this.toast = element('div', { class: 'map-toast', 'aria-hidden': 'true', hidden: 'hidden' });
		this.chooser = element('div', {
			class: 'map-chooser', role: 'dialog', 'aria-label': 'Which did you mean?', hidden: 'hidden',
		});
		this.legend = element('div', { class: 'map-legend', 'aria-label': 'What the colours mean' });

		this.stage = element('div', { class: 'map-stage' }, [
			this.svg,
			this.status,
			this.buildToolbar(uid),
			this.buildZooms(),
			this.legend,
			this.chooser,
			this.toast,
		]);

		this.sheet = this.buildSheet();
		this.frame = element('div', { class: 'map-frame' }, [this.stage, this.sheet]);
		this.layersDialog = this.buildLayersDialog(uid);

		this.append(this.frame, this.layersDialog);

		this.bindPointer();
		this.bindTouch();
		this.bindWheel();
		this.bindKeys();
		this.observe();

		this.renderLegend();
		this.renderSheet();
	}

	buildToolbar(uid) {
		this.searchInput = element('input', {
			id: `map-search-${uid}`,
			type: 'search',
			placeholder: 'Search: Kilimani, KICC, Giraffe Centre…',
			autocomplete: 'off',
			spellcheck: 'false',
			enterkeyhint: 'search',
			oninput: (event) => {
				this.state.query = event.target.value.trim();
				this.renderSuggestions();
			},
			onfocus: () => {
				// On a phone the keyboard takes half the screen. Put the map
				// where the results will land before it does.
				if (isNarrow() && !this.state.fullscreen) this.revealMap();
			},
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
			class: 'map-suggestions', role: 'listbox', 'aria-label': 'Places matching your search', hidden: 'hidden',
		});

		this.layersButton = element('button', {
			type: 'button',
			class: 'map-fab',
			'aria-label': 'Map layers and colours',
			'aria-haspopup': 'dialog',
			onclick: () => this.openLayers(),
		}, [icon('layers')]);

		this.fullscreenButton = element('button', {
			type: 'button',
			class: 'map-fab map-fullscreen-button',
			'aria-label': 'Full screen map',
			'aria-pressed': 'false',
			onclick: () => this.setFullscreen(!this.state.fullscreen),
		}, [icon('expand'), icon('collapse')]);

		return element('div', { class: 'map-toolbar no-print' }, [
			element('div', { class: 'map-search' }, [
				element('label', {
					class: 'visually-hidden',
					for: `map-search-${uid}`,
					text: 'Search the map for a constituency, neighbourhood or landmark',
				}),
				icon('search'),
				this.searchInput,
				this.suggestions,
			]),
			this.layersButton,
			this.fullscreenButton,
		]);
	}

	buildZooms() {
		const zoomButton = (name, aria, factor) =>
			element('button', {
				type: 'button',
				class: 'map-fab map-fab-small',
				'aria-label': aria,
				onclick: () => this.zoomBy(factor, null, true),
			}, [icon(name)]);

		this.locateButton = element('button', {
			type: 'button',
			class: 'map-fab map-fab-small',
			'aria-label': 'Show where I am',
			title: 'Show where I am',
			onclick: () => this.locate(),
		}, [icon('locate')]);

		return element('div', { class: 'map-zooms no-print' }, [
			zoomButton('plus', 'Zoom in', 0.6),
			zoomButton('minus', 'Zoom out', 1 / 0.6),
			element('button', {
				type: 'button',
				class: 'map-fab map-fab-small',
				'aria-label': 'Show all of Nairobi again',
				onclick: () => this.reset(),
			}, [icon('home')]),
			this.locateButton,
		]);
	}

	buildSheet() {
		this.sheetHandle = element('button', {
			type: 'button',
			class: 'map-sheet-handle',
			'aria-expanded': 'false',
			'aria-label': 'Show more about this place',
			onclick: () => {
				// A drag that ended on the handle is not also a press.
				if (this.sheetDragged) return;
				this.setSheet(this.state.sheet === 'open' ? 'peek' : 'open');
			},
		}, [element('span', { class: 'map-sheet-grip' })]);

		this.sheetSummary = element('div', { class: 'map-sheet-summary', 'aria-live': 'polite' });

		this.sheetClose = element('button', {
			type: 'button',
			class: 'map-sheet-close',
			'aria-label': 'Close',
			onclick: () => this.pick(null),
		}, [icon('close')]);

		this.sheetHead = element('div', { class: 'map-sheet-head' }, [
			this.sheetHandle, this.sheetSummary, this.sheetClose,
		]);

		// Nairobi's details need no tabs - one place, one short page - but the
		// shared frame measures the peek as head plus tab row, so the row is
		// kept, empty and hidden.
		this.tabList = element('div', { class: 'map-tabs', hidden: 'hidden' });

		this.sheetBody = element('div', { class: 'map-sheet-body', tabindex: '0' });

		const sheet = element('section', {
			class: 'map-sheet',
			'aria-label': 'Selected place',
			'data-state': 'closed',
		}, [this.sheetHead, this.tabList, this.sheetBody]);

		this.bindSheetDrag();
		return sheet;
	}

	buildLayersDialog(uid) {
		const shadeGroups = GROUPS.map((group) =>
			element('fieldset', { class: 'map-options' }, [
				element('legend', { text: group.label }),
				...SHADES.filter((s) => s.group === group.id).map((shade) =>
					element('label', { class: 'map-option' }, [
						element('input', {
							type: 'radio',
							name: `map-shade-${uid}`,
							value: shade.id,
							onchange: () => this.setShade(shade.id),
						}),
						element('span', {}, [
							element('strong', { text: shade.label }),
							shade.note ? element('small', { class: 'map-option-note', text: shade.note }) : null,
						]),
					])
				),
			])
		);

		const toggle = (label, onChange) =>
			element('label', { class: 'map-switch' }, [
				element('input', {
					type: 'checkbox',
					checked: 'checked',
					onchange: (event) => onChange(event.target.checked),
				}),
				element('span', { text: label }),
			]);

		const display = element('fieldset', { class: 'map-options' }, [
			element('legend', { text: 'On the map' }),
			toggle('Landmarks', (on) => {
				this.state.showLandmarks = on;
				this.applyFilters();
			}),
			toggle('Constituency names', (on) => {
				this.state.showLabels = on;
				this.applyFilters();
			}),
			toggle('Neighbourhood names', (on) => {
				this.state.showPlaces = on;
				this.applyFilters();
			}),
		]);

		// Filled in once the data says which categories there are.
		this.categoryChips = element('div', { class: 'map-chips' });
		const categories = element('fieldset', { class: 'map-options map-categories' }, [
			element('legend', { text: 'Landmark types' }),
			this.categoryChips,
		]);

		const close = () => this.layersDialog.close();

		return element('dialog', {
			class: 'map-layers',
			'aria-labelledby': `map-layers-title-${uid}`,
			onclose: () => this.layersButton.focus({ preventScroll: true }),
			// A click on the backdrop lands on the dialog element itself.
			onclick: (event) => { if (event.target === this.layersDialog) close(); },
		}, [
			element('div', { class: 'map-layers-inner' }, [
				element('div', { class: 'map-layers-head' }, [
					element('h2', { id: `map-layers-title-${uid}`, text: 'Map layers' }),
					element('button', {
						type: 'button', class: 'map-sheet-close', 'aria-label': 'Close', onclick: close,
					}, [icon('close')]),
				]),
				element('div', { class: 'map-layers-body' }, [
					element('p', { class: 'map-layers-section', text: 'Colour the map by' }),
					...shadeGroups,
					display,
					categories,
				]),
				element('div', { class: 'map-layers-foot' }, [
					element('button', { type: 'button', class: 'map-done', text: 'Show the map', onclick: close }),
				]),
			]),
		]);
	}

	buildCategoryChips() {
		const counts = {};
		this.data.landmarks.forEach((l) => { counts[l.category] = (counts[l.category] || 0) + 1; });
		this.categoryChips.replaceChildren(
			...Object.entries(this.data.categories).filter(([id]) => counts[id]).map(([id, label]) =>
				element('label', { class: 'map-chip chip-' + id }, [
					element('input', {
						type: 'checkbox',
						checked: 'checked',
						onchange: (event) => {
							if (event.target.checked) this.state.categories.add(id);
							else this.state.categories.delete(id);
							this.applyFilters();
						},
					}),
					element('span', { text: `${label} (${counts[id]})` }),
				])
			)
		);
	}

	openLayers() {
		this.layersDialog.querySelectorAll(`input[name="map-shade-${this.uid}"]`).forEach((input) => {
			input.checked = input.value === this.state.shade;
		});
		if (typeof this.layersDialog.showModal === 'function') this.layersDialog.showModal();
		else this.layersDialog.setAttribute('open', '');
	}

	// ---------------------------------------------------------------- drawing

	draw() {
		const { constituencies, subcounties, landmarks, neighbourhoods, rentBands } = this.data;

		this.layers.outline.append(svgEl('path', { class: 'county', d: this.data.outline }));

		const shape = (kind, item, layer, aria) => {
			const path = svgEl('path', {
				d: item.path,
				class: `shape district ${kind}`,
				'data-id': item.id,
				tabindex: '0',
				role: 'button',
				'aria-label': aria,
			});
			path.addEventListener('keydown', (event) => this.shapeKey(event, kind, item.id));
			layer.append(path);

			// Keyed by kind: a constituency and a sub-county can share an id
			// (both Westlands), and the placer keeps one name per key.
			const label = svgEl('text', {
				x: item.label[0], y: item.label[1], class: `map-label is-${kind}`, 'data-key': `${kind}:${item.id}`,
			});
			label.textContent = item.name;
			this.layers.labels.append(label);
		};

		constituencies.forEach((c) => shape('constituency', c, this.layers.constituencies,
			`${c.name} constituency. About ${count(c.population)} people.`));
		subcounties.forEach((s) => shape('subcounty', s, this.layers.subcounties,
			`${s.name} sub-county. ${count(s.population)} people at the 2019 census.`));

		// Neighbourhood names, placed with the constituency names so nothing is
		// printed over anything else.
		neighbourhoods.forEach((n) => {
			const label = svgEl('text', {
				x: n.x, y: n.y, class: `map-label is-place rank-${n.rank}`, 'data-key': 'place:' + n.id,
			});
			label.textContent = n.name;
			this.layers.labels.append(label);
		});

		// Rent: one dot per neighbourhood we can place with confidence.
		neighbourhoods.filter((n) => n.rent).forEach((n) => {
			const group = svgEl('g', {
				class: `rent-dot rent-${n.rent}`,
				'data-id': n.id,
				transform: `translate(${n.x} ${n.y})`,
				role: 'img',
				'aria-label': `${n.name}: ${rentBands[n.rent].label}`,
			});
			group.append(svgEl('circle', { class: 'rent-circle', r: '60' }));
			this.layers.rent.append(group);
		});

		landmarks.forEach((landmark) => {
			const group = svgEl('g', {
				class: 'landmark cat-' + landmark.category,
				'data-id': landmark.id,
				// Not a tab stop: 46 pins on top of 17 shapes would make the map a
				// keyboard trap. Every landmark is linked below the map, and the
				// search reaches each by name.
				tabindex: '-1',
				role: 'button',
				'aria-label': `${landmark.name}. ${this.data.categories[landmark.category] || landmark.category}.`,
				transform: `translate(${landmark.x} ${landmark.y})`,
			});
			group.append(svgEl('circle', { class: 'pin-halo', r: '70' }), svgEl('circle', { class: 'pin', r: '30' }));
			this.layers.landmarks.append(group);
		});

		this.you = svgEl('g', { class: 'you', hidden: 'hidden' });
		this.you.append(svgEl('circle', { class: 'you-halo', r: '1' }), svgEl('circle', { class: 'you-dot', r: '1' }));
		this.layers.you.append(this.you);

		// Bounding boxes once, in map units. The tap resolver and the label
		// placer work from these and the viewBox, never from layout.
		this.bounds = new Map();
		for (const kind of ['constituency', 'subcounty']) {
			this.svg.querySelectorAll(`.${kind}`).forEach((node) => {
				const b = node.getBBox();
				this.bounds.set(kind + ':' + node.dataset.id, { x: b.x, y: b.y, w: b.width, h: b.height });
			});
		}
		this.home = this.boundsOf([...this.layers.constituencies.children], 'constituency');

		this.measure();
		// Not a reset: on load that would clear a deep link before applyHash()
		// reads it.
		this.flyTo(this.fitVisible(pad(this.home, 0.03)), true);
	}

	shade() {
		return SHADES.find((s) => s.id === this.state.shade) || SHADES[0];
	}

	/** Which kind of shape the current colours are on. */
	geoKind() {
		return this.shade().geo === 'subcounties' ? 'subcounty' : 'constituency';
	}

	setShade(id) {
		const before = this.data ? this.shade() : null;
		this.state.shade = id;
		const shade = this.shade();

		['plain', 'rent', 'quantile'].forEach((kind) => this.classList.remove('shade-' + kind));
		this.classList.add('shade-' + shade.kind);
		this.classList.toggle('geo-subcounties', shade.geo === 'subcounties');
		this.classList.toggle('geo-constituencies', shade.geo !== 'subcounties');

		// Switching between constituencies and sub-counties leaves a selected
		// shape that is no longer drawn; let it go. A landmark survives.
		const selected = this.state.selected;
		if (before && before.geo !== shade.geo && selected && selected.kind !== 'landmark') {
			this.pick(null);
		}
		if (shade.kind !== 'rent' && selected && selected.kind === 'rent') this.pick(null);

		this.applyShade();
		this.renderLegend();
		this.renderSheet();
		this.layoutKey = '';
		this.layoutOverlays(true);
	}

	/** Put every shape in a quintile for the current shading. */
	applyShade() {
		if (!this.data) return;
		const shade = this.shade();
		this.svg.querySelectorAll('.district').forEach((path) => path.removeAttribute('data-bucket'));
		this.buckets = null;
		this.bucketOf = new Map();
		if (shade.kind !== 'quantile') return;

		const list = shade.geo === 'subcounties' ? this.data.subcounties : this.data.constituencies;
		const kind = shade.geo === 'subcounties' ? 'subcounty' : 'constituency';
		const values = list.map((item) => item[shade.field]).filter((v) => typeof v === 'number').sort((a, b) => a - b);
		if (!values.length) return;

		const cuts = [1, 2, 3, 4].map((i) => values[Math.floor((i * values.length) / 5)]);
		const bucketOf = (value) => cuts.filter((cut) => value >= cut).length + 1;
		this.buckets = cuts.map((cut, i) => ({ from: i === 0 ? values[0] : cuts[i - 1], to: cut }));
		this.buckets.push({ from: cuts[3], to: values[values.length - 1] });

		list.forEach((item) => {
			const value = item[shade.field];
			if (typeof value !== 'number') return;
			const bucket = bucketOf(value);
			this.bucketOf.set(item.id, bucket);
			const path = this.svg.querySelector(`.${kind}[data-id="${item.id}"]`);
			if (path) path.setAttribute('data-bucket', String(bucket));
		});
	}

	/**
	 * The key, docked on the map, with the caveat travelling with the colours:
	 * a coloured map looks authoritative whether or not it has earned it.
	 */
	renderLegend() {
		if (!this.legend) return;
		this.legend.replaceChildren();
		const shade = this.shade();
		this.legend.dataset.kind = shade.kind;
		this.legend.hidden = shade.kind === 'plain';
		if (shade.kind === 'plain') return;

		this.legend.append(element('p', { class: 'map-legend-title' }, [
			element('strong', { text: shade.label }),
			shade.note ? element('span', { class: 'map-legend-note', text: ' · ' + shade.note }) : null,
		]));

		if (shade.kind === 'quantile') {
			if (!this.buckets) return;
			const end = (v) => shade.format(Math.round(v * 10) / 10);
			const ends = shade.ends || [end(this.buckets[0].from), end(this.buckets[4].to)];
			this.legend.append(
				element('div', { class: 'map-ramp' },
					this.buckets.map((bucket, i) => element('span', {
						class: 'swatch swatch-rent-' + (i + 1),
						title: shade.rank ? '' : `${end(bucket.from)} – ${end(bucket.to)}`,
					}))),
				element('p', { class: 'map-ramp-ends' }, [
					element('span', { text: ends[0] }),
					element('span', { text: ends[1] }),
				]),
				element('p', { class: 'map-legend-caveat', text: `Five equal groups. ${shade.caveat}` })
			);
			return;
		}

		// Rent: a ramp of the bands the dots are coloured in.
		const bands = this.data ? Object.keys(this.data.rentBands) : [];
		this.legend.append(
			element('div', { class: 'map-ramp' },
				bands.map((band) => element('span', {
					class: 'swatch swatch-rent-' + band, title: this.data.rentBands[band].label,
				}))),
			element('p', { class: 'map-ramp-ends' }, [
				element('span', { text: 'Cheaper' }),
				element('span', { text: 'Dearer' }),
			]),
			element('p', {
				class: 'map-legend-caveat',
				text: 'One dot per neighbourhood. Our reading of 2026 listings, not a measured index.',
			})
		);
	}

	shapeKey(event, kind, id) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			this.pick(kind, id);
		}
	}

	// ------------------------------------------------------------------ views

	/** Cache the stage size. Read once per resize, never per frame. */
	measure() {
		const rect = this.stage.getBoundingClientRect();
		this.size = { width: rect.width || 1, height: rect.height || 1 };
	}

	aspect() {
		return this.size.width / this.size.height;
	}

	/**
	 * Fit `content` into the part of the stage nothing is floating over: the
	 * toolbar at the top, and the sheet and the key at the bottom.
	 */
	fitVisible(content) {
		const { width, height } = this.size;
		const top = this.toolbarHeight();
		const bottom = this.sheetVisible() + this.legendHeight();
		const free = Math.max(80, height - top - bottom);

		const box = fit(content, width / free);
		const unit = box.w / width;
		return { x: box.x, y: box.y - top * unit, w: box.w, h: height * unit };
	}

	toolbarHeight() {
		const bar = this.stage.querySelector('.map-toolbar');
		return bar ? bar.offsetHeight + bar.offsetTop : 0;
	}

	legendHeight() {
		if (this.state.sheet === 'open' && this.sheetOverlays()) return 0;
		return this.legend && !this.legend.hidden && this.legend.offsetHeight ? this.legend.offsetHeight + 12 : 0;
	}

	/** How much of the stage the sheet currently covers. Zero beside the map. */
	sheetVisible() {
		if (!this.sheetOverlays()) return 0;
		if (this.state.sheet === 'closed') return 0;
		if (this.state.sheet === 'open') return this.sheet.offsetHeight;
		return this.sheetHead.offsetHeight + this.tabList.offsetHeight;
	}

	/**
	 * True when the sheet floats over the map rather than standing beside it.
	 * Read from the layout, so the stylesheet is the one place the line is drawn.
	 */
	sheetOverlays() {
		return getComputedStyle(this.sheet).position === 'absolute';
	}

	/** Back to the whole county, with nothing selected. */
	reset() {
		this.state.selected = null;
		this.state.sheet = this.sheetOverlays() ? 'closed' : this.state.sheet;
		this.querySelectorAll('.is-selected').forEach((n) => n.classList.remove('is-selected'));
		this.renderSheet();
		this.updateHash();
		if (this.home) this.flyTo(this.fitVisible(pad(this.home, 0.03)));
		this.layoutKey = '';
	}

	/** Bounding box of a set of shapes. */
	boundsOf(nodes, kind) {
		let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
		nodes.forEach((node) => {
			const b = this.bounds.get(kind + ':' + node.dataset.id);
			if (!b) return;
			x1 = Math.min(x1, b.x);
			y1 = Math.min(y1, b.y);
			x2 = Math.max(x2, b.x + b.w);
			y2 = Math.max(y2, b.y + b.h);
		});
		return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
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
			else {
				this.animation = null;
				this.layoutOverlays(true);
			}
		};
		this.animation = requestAnimationFrame(step);
	}

	applyBox() {
		const { x, y, w, h } = this.box;
		if (![x, y, w, h].every(Number.isFinite)) {
			console.warn('nairobi-map: refusing a non-finite viewBox', this.box);
			return;
		}
		this.svg.setAttribute('viewBox', `${x} ${y} ${w} ${h}`);
		// Map units in one screen pixel: strokes, names and pins are multiples
		// of it, so they stay the same size on screen at any zoom.
		const unit = w / (this.size.width || 1);
		this.style.setProperty('--map-unit', String(unit));
		const you = this.you;
		if (you) {
			you.querySelector('.you-dot').setAttribute('r', String(6 * unit));
			you.querySelector('.you-halo').setAttribute('r', String(16 * unit));
		}
		this.layoutOverlays();
	}

	/**
	 * Decide which names and which pins to draw at this zoom. Recomputed when
	 * the zoom moves by a noticeable step, and at the end of every gesture.
	 */
	layoutOverlays(force = false) {
		if (!this.data || !this.box) return;
		const unit = unitsPerPixel(this.box, this.size);
		const selected = this.state.selected;
		const key = [
			Math.round(Math.log2(unit) * 6), this.state.shade, selected ? selected.kind + ':' + selected.id : '',
			[...this.state.categories].join(), this.state.showLandmarks, this.state.showLabels, this.state.showPlaces,
		].join('|');
		if (!force && key === this.layoutKey) return;
		this.layoutKey = key;

		// Markers first: they are what the names have to keep clear of.
		this.placeMarkers();
		this.placeNames();
	}

	zoomLevel() {
		return this.home && this.box ? this.home.w / this.box.w : 1;
	}

	placeNames() {
		const fontPx = isNarrow() ? 12 : 11;
		this.style.setProperty('--map-label-px', String(fontPx));

		const kind = this.geoKind();
		const selected = this.state.selected;
		const zoom = this.zoomLevel();
		const labels = [];
		// A neighbourhood with the same name as the shape it is in - Kibra,
		// Lang'ata, Kasarani - would be named twice, once for each.
		const areaNames = new Set([...this.layers.labels.querySelectorAll('.is-' + kind)]
			.map((node) => normalise(node.textContent)));

		const chosen = selected ? selected.kind + ':' + selected.id : '';

		this.layers.labels.querySelectorAll('.map-label').forEach((node) => {
			const id = node.dataset.key;
			const x = Number(node.getAttribute('x'));
			const y = Number(node.getAttribute('y'));
			if (node.classList.contains('is-' + kind)) {
				if (!this.state.showLabels && id !== chosen) return;
				const b = this.bounds.get(id);
				labels.push({
					id, x, y, text: node.textContent,
					priority: b ? b.w * b.h : 0,
					forced: id === chosen,
				});
			} else if (node.classList.contains('is-place') && this.state.showPlaces && !areaNames.has(normalise(node.textContent))) {
				const rank = Number(/rank-(\d)/.exec(node.getAttribute('class'))[1]);
				if (zoom < RANK_ZOOM[rank]) return;
				// Below every constituency name, bigger neighbourhoods first.
				labels.push({ id, x, y, text: node.textContent, priority: -rank });
			}
		});

		const obstacles = (this.markers || []).map((m) => {
			const s = toScreen(this.box, this.size, m.x, m.y);
			const r = m.kind === 'cluster' ? 15 : 8;
			return { left: s.x - r, right: s.x + r, top: s.y - r, bottom: s.y + r };
		});

		const shown = placeLabels(labels, this.box, this.size, { fontPx, obstacles });
		this.layers.labels.querySelectorAll('.map-label').forEach((node) => {
			const on = shown.has(node.dataset.key);
			node.classList.toggle('is-placed', on);
			const dy = on ? shown.get(node.dataset.key).dy : 0;
			if (dy) node.setAttribute('dy', (dy / fontPx).toFixed(2) + 'em');
			else node.removeAttribute('dy');
		});
	}

	/** Merge pins that would overlap into bubbles with a count. */
	placeMarkers() {
		const visible = this.data.landmarks.filter((l) =>
			this.state.showLandmarks && this.state.categories.has(l.category));
		const exempt = new Set();
		const selected = this.state.selected;
		if (selected && selected.kind === 'landmark') exempt.add(selected.id);

		const clusters = clusterPoints(visible, this.box, this.size, CLUSTER_PX, exempt);
		const merged = new Set();
		this.markers = clusters.map((cluster) => {
			if (cluster.ids.length > 1) cluster.ids.forEach((id) => merged.add(id));
			return {
				key: cluster.ids.length > 1 ? 'cluster:' + cluster.ids.join(',') : 'landmark:' + cluster.ids[0],
				kind: cluster.ids.length > 1 ? 'cluster' : 'landmark',
				ids: cluster.ids,
				x: cluster.x,
				y: cluster.y,
			};
		});

		// Rent dots are markers too while rent is shown: tappable, and ground a
		// name may not be printed on. Never merged - each one is a different
		// answer.
		if (this.shade().kind === 'rent') {
			this.data.neighbourhoods.filter((n) => n.rent).forEach((n) => {
				this.markers.push({ key: 'rent:' + n.id, kind: 'rent', ids: [n.id], x: n.x, y: n.y });
			});
		}

		const shown = new Set(visible.map((l) => l.id));
		[...this.layers.landmarks.children, ...this.layers.lifted.children].forEach((node) => {
			node.classList.toggle('is-clustered', merged.has(node.dataset.id));
			node.classList.toggle('is-hidden', !shown.has(node.dataset.id));
		});
		if (this.liftedPin) this.liftedPin.classList.remove('is-clustered', 'is-hidden');

		this.layers.clusters.replaceChildren(
			...this.markers.filter((m) => m.kind === 'cluster').map((m) => {
				const names = m.ids.map((id) => this.byId.get('landmark:' + id).name);
				const group = svgEl('g', {
					class: 'cluster',
					transform: `translate(${m.x} ${m.y})`,
					role: 'img',
					'aria-label': `${m.ids.length} landmarks: ${names.join(', ')}.`,
				});
				const text = svgEl('text', { class: 'cluster-count' });
				text.textContent = String(m.ids.length);
				group.append(svgEl('circle', { class: 'cluster-dot', r: '60' }), text);
				return group;
			})
		);
	}

	/** Grow the view so a bubble's members separate, and centre it. */
	zoomToCluster(ids) {
		const points = ids.map((id) => this.byId.get('landmark:' + id));
		const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
		const box = {
			x: Math.min(...xs), y: Math.min(...ys),
			w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys),
		};
		const span = Math.max(box.w, box.h, this.home.w / 20);
		const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
		this.flyTo(this.fitVisible({ x: cx - span * 0.9, y: cy - span * 0.9, w: span * 1.8, h: span * 1.8 }));
	}

	zoomBy(factor, anchor = null, animate = false) {
		if (!this.box || !this.home) return;
		const w = clamp(this.box.w * factor, this.home.w / 40, this.home.w * 1.8);
		const h = w / (this.box.w / this.box.h);
		const point = anchor || { x: this.box.x + this.box.w / 2, y: this.box.y + this.box.h / 2 };
		const rx = (point.x - this.box.x) / this.box.w;
		const ry = (point.y - this.box.y) / this.box.h;
		const target = { x: point.x - w * rx, y: point.y - h * ry, w, h };
		if (animate) this.flyTo(target);
		else {
			this.box = target;
			this.applyBox();
		}
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

	pinchMove(start, a, b) {
		const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
		if (!distance || !start.distance) return;
		const mid = { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
		const { box, rect } = start;

		const w = clamp(box.w * clamp(start.distance / distance, 0.2, 5), this.home.w / 40, this.home.w * 1.8);
		const h = w * (box.h / box.w);
		const px = box.x + ((start.mid.x - rect.left) / rect.width) * box.w;
		const py = box.y + ((start.mid.y - rect.top) / rect.height) * box.h;
		this.box = {
			x: px - ((mid.x - rect.left) / rect.width) * w,
			y: py - ((mid.y - rect.top) / rect.height) * h,
			w, h,
		};
		this.applyBox();
	}

	/**
	 * Mouse, pen, and a finger in full screen. Inline, a finger is handled by
	 * bindTouch instead, because the map sits in a page that has to scroll.
	 */
	bindPointer() {
		const pointers = new Map();
		let pinch = null;
		let pressedAt = null;
		let captured = false;
		this.dragged = false;

		const ownsTouch = (event) => event.pointerType !== 'touch' || this.state.fullscreen;

		this.svg.addEventListener('pointerdown', (event) => {
			this.lastInput = event.pointerType || 'mouse';
			if (!this.box || !ownsTouch(event)) return;
			this.hideChooser();
			pointers.set(event.pointerId, event);
			this.dragged = false;
			pressedAt = { x: event.clientX, y: event.clientY };
			if (pointers.size === 1) {
				this.dragFrom = { pointer: this.clientToMap(event.clientX, event.clientY), box: { ...this.box } };
				// Capture is taken only once a drag starts: captured on press,
				// every click would be retargeted to the SVG itself.
				captured = false;
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
				this.dragged = true;
				return;
			}
			if (!this.dragFrom) return;

			if (pressedAt) {
				const moved = Math.hypot(event.clientX - pressedAt.x, event.clientY - pressedAt.y);
				if (moved <= DRAG_SLOP_PX && !this.dragged) return;
				if (!this.dragged) {
					this.dragged = true;
					if (!captured) {
						try {
							this.svg.setPointerCapture(event.pointerId);
							captured = true;
						} catch {
							// Panning still works without capture, up to the edge.
						}
					}
				}
			}

			const rect = this.svg.getBoundingClientRect();
			const start = this.dragFrom.box;
			this.box = {
				...start,
				x: this.dragFrom.pointer.x - ((event.clientX - rect.left) / rect.width) * start.w,
				y: this.dragFrom.pointer.y - ((event.clientY - rect.top) / rect.height) * start.h,
			};
			this.applyBox();
		});

		const release = (event) => {
			if (!pointers.has(event.pointerId)) return;
			pointers.delete(event.pointerId);
			if (pointers.size < 2) pinch = null;
			if (pointers.size === 0) {
				this.dragFrom = null;
				pressedAt = null;
				if (captured) {
					try { this.svg.releasePointerCapture(event.pointerId); } catch { /* already released */ }
					captured = false;
				}
				if (this.dragged) this.layoutOverlays(true);
			}
		};
		this.svg.addEventListener('pointerup', release);
		this.svg.addEventListener('pointercancel', release);

		// One click handler for the whole map: the resolver asks the geometry
		// what a tap meant, rather than taking whatever pin was on top.
		this.svg.addEventListener('click', (event) => {
			if (this.dragged || performance.now() < (this.suppressClickUntil || 0)) {
				this.dragged = false;
				event.preventDefault();
				return;
			}
			if (!this.box) return;
			this.handleTap(event.clientX, event.clientY);
		});
	}

	/**
	 * A finger on the map while it sits inline in the page: one finger
	 * scrolls the page, two move the map. Full screen gives one-finger panning
	 * back. Touch events, because only a non-passive touchmove can stop the
	 * browser scrolling once two fingers are down.
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
			// A sideways swipe is someone trying to pan; a vertical one is
			// someone scrolling past, and is left alone.
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
				// Lifting the second finger must not read as a tap.
				this.suppressClickUntil = performance.now() + 400;
				this.layoutOverlays(true);
			}
			if (!event.touches.length) single = null;
		};
		this.svg.addEventListener('touchend', end);
		this.svg.addEventListener('touchcancel', end);
	}

	/**
	 * A mouse wheel over the map scrolls the page unless Ctrl or Cmd is held,
	 * so a tall map does not trap it. A trackpad pinch arrives with ctrlKey
	 * set, so pinching still zooms.
	 */
	bindWheel() {
		this.svg.addEventListener('wheel', (event) => {
			if (!this.box) return;
			const intended = this.state.fullscreen || event.ctrlKey || event.metaKey;
			if (!intended) {
				this.showToast(`Hold ${isMac() ? '⌘' : 'Ctrl'} and scroll to zoom the map`);
				return;
			}
			event.preventDefault();
			const factor = Math.exp(clamp(event.deltaY, -120, 120) * 0.0022);
			this.zoomBy(factor, this.clientToMap(event.clientX, event.clientY));
			clearTimeout(this.wheelTimer);
			this.wheelTimer = setTimeout(() => this.layoutOverlays(true), 160);
		}, { passive: false });

		this.svg.addEventListener('dblclick', (event) => {
			if (!this.box) return;
			event.preventDefault();
			this.zoomBy(event.shiftKey ? 1.8 : 0.5, this.clientToMap(event.clientX, event.clientY), true);
		});
	}

	bindKeys() {
		this.svg.setAttribute('tabindex', '0');
		this.svg.addEventListener('keydown', (event) => {
			if (!this.box || event.target !== this.svg) return;
			const step = this.box.w * 0.12;
			const moves = {
				ArrowLeft: [-step, 0], ArrowRight: [step, 0],
				ArrowUp: [0, -step], ArrowDown: [0, step],
			};
			if (moves[event.key]) {
				event.preventDefault();
				this.box = { ...this.box, x: this.box.x + moves[event.key][0], y: this.box.y + moves[event.key][1] };
				this.applyBox();
				this.layoutOverlays(true);
			} else if (event.key === '+' || event.key === '=') {
				event.preventDefault();
				this.zoomBy(0.8, null, true);
			} else if (event.key === '-' || event.key === '_') {
				event.preventDefault();
				this.zoomBy(1.25, null, true);
			} else if (event.key === '0') {
				event.preventDefault();
				this.reset();
			}
		});

		this.addEventListener('keydown', (event) => {
			if (event.key !== 'Escape') return;
			if (!this.chooser.hidden) { this.hideChooser(true); return; }
			if (this.state.selected) { this.pick(null); return; }
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
		// The stage changes size on rotation, on entering full screen, and when
		// the page settles - so the box is refitted to whatever it now is.
		this.resizeObserver = new ResizeObserver(() => {
			const before = this.size;
			this.measure();
			if (!this.box) return;
			if (Math.abs(before.width - this.size.width) < 1 && Math.abs(before.height - this.size.height) < 1) return;
			this.flyTo(fit(this.box, this.aspect()), true);
		});
		this.resizeObserver.observe(this.stage);

		// On a phone the floating coffee button would sit on the zoom buttons
		// and on the sheet; it steps aside while the map is in view.
		if ('IntersectionObserver' in window) {
			this.yieldObserver = new IntersectionObserver(([entry]) => {
				this.stageInView = entry.isIntersecting;
				this.yieldSupport();
			}, { threshold: 0.25 });
			this.yieldObserver.observe(this.stage);
		}
	}

	yieldSupport() {
		const float = document.querySelector('.support-float');
		if (!float) return;
		const on = this.isConnected && (this.state.fullscreen || (!!this.stageInView && this.sheetOverlays()));
		float.classList.toggle('is-yielding-map', on);
	}

	// ------------------------------------------------------------- tapping

	/**
	 * Work out what a tap was aimed at, and do it. The shape under the point
	 * comes from the stacking order, which sees through a pin on top of it;
	 * small shapes nearby and pins within reach come from the geometry.
	 * resolveTap decides - the reasoning lives there.
	 */
	handleTap(clientX, clientY) {
		const rect = this.svg.getBoundingClientRect();
		const point = { x: clientX - rect.left, y: clientY - rect.top };
		const touch = this.lastInput === 'touch' || this.lastInput === 'pen';
		const reach = touch ? REACH_PX : 4;
		const smallPx = touch ? SMALL_PX : 12;
		const kind = this.geoKind();

		const stack = document.elementsFromPoint(clientX, clientY);
		const hit = stack.find((node) => node.classList && node.classList.contains(kind) && this.svg.contains(node));
		const contained = hit ? hit.dataset.id : null;

		const screenBox = (b) => {
			const a = toScreen(this.box, this.size, b.x, b.y);
			const z = toScreen(this.box, this.size, b.x + b.w, b.y + b.h);
			return { left: a.x, top: a.y, right: z.x, bottom: z.y, size: Math.max(z.x - a.x, z.y - a.y) };
		};

		let containedSmall = false;
		const small = [];
		this.bounds.forEach((b, key) => {
			if (!key.startsWith(kind + ':')) return;
			const s = screenBox(b);
			if (s.size >= smallPx) return;
			const id = key.slice(kind.length + 1);
			if (id === contained) { containedSmall = true; return; }
			const dx = Math.max(s.left - point.x, 0, point.x - s.right);
			const dy = Math.max(s.top - point.y, 0, point.y - s.bottom);
			const dist = Math.hypot(dx, dy);
			if (dist <= reach) small.push({ id, dist });
		});

		const markers = (this.markers || []).map((m) => {
			const s = toScreen(this.box, this.size, m.x, m.y);
			return {
				key: m.key, kind: m.kind, ids: m.ids,
				dist: Math.hypot(s.x - point.x, s.y - point.y),
				radius: m.kind === 'cluster' ? 15 : 7,
			};
		}).filter((m) => m.dist <= FINGER_PX + 20);

		const result = resolveTap({ contained, containedSmall, small, markers }, { reach });

		if (result.action === 'clear') {
			if (this.state.selected) this.pick(null);
			return;
		}
		if (result.action === 'pick') {
			this.act(result.target, kind);
			return;
		}
		this.showChooser(result.targets, point, kind);
	}

	act(target, kind) {
		this.hideChooser();
		if (target.kind === 'district') this.pick(kind, target.id);
		else if (target.kind === 'cluster') this.zoomToCluster(target.ids);
		else if (target.kind === 'landmark') this.pick('landmark', target.ids ? target.ids[0] : target.id);
		else if (target.kind === 'rent') this.pick('rent', target.ids[0]);
	}

	/**
	 * Ask, when a finger genuinely covered several things. "Zoom in here" is
	 * always offered, so the list is never a dead end.
	 */
	showChooser(targets, point, kind) {
		const items = targets.slice(0, 6).map((target) => {
			let label, detail;
			if (target.kind === 'district') {
				label = this.byId.get(kind + ':' + target.id).name;
				detail = kind === 'subcounty' ? 'Census sub-county' : 'Constituency';
			} else if (target.kind === 'cluster') {
				label = `${target.ids.length} landmarks`;
				detail = 'Zoom in to see them';
			} else if (target.kind === 'rent') {
				const n = this.byId.get('rent:' + target.ids[0]);
				label = n.name;
				detail = 'Rent: ' + this.data.rentBands[n.rent].label.toLowerCase();
			} else {
				const record = this.byId.get('landmark:' + target.ids[0]);
				label = record.name;
				detail = this.data.categories[record.category] || record.category;
			}
			return element('button', {
				type: 'button',
				class: 'map-chooser-item' + (target.kind === 'district' ? ' is-district' : ''),
				onclick: () => this.act(target, kind),
			}, [element('strong', { text: label }), element('span', { text: detail })]);
		});

		items.push(element('button', {
			type: 'button',
			class: 'map-chooser-item is-zoom',
			onclick: () => {
				this.hideChooser();
				const rect = this.svg.getBoundingClientRect();
				this.zoomBy(0.35, this.clientToMap(point.x + rect.left, point.y + rect.top), true);
			},
		}, [icon('plus'), element('strong', { text: 'Zoom in here' })]));

		this.chooser.replaceChildren(
			element('p', { class: 'map-chooser-title', text: 'Which did you mean?' }),
			...items
		);
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
		if (restoreFocus && this.chooserReturn && this.chooserReturn.focus) {
			this.chooserReturn.focus({ preventScroll: true });
		}
	}

	showToast(text) {
		if (this.toastTimer && this.toast.textContent === text) return;
		this.toast.textContent = text;
		this.toast.hidden = false;
		requestAnimationFrame(() => this.toast.classList.add('is-on'));
		clearTimeout(this.toastTimer);
		this.toastTimer = setTimeout(() => {
			this.toast.classList.remove('is-on');
			this.toastTimer = setTimeout(() => {
				this.toast.hidden = true;
				this.toastTimer = null;
			}, 250);
		}, 1800);
	}

	// ------------------------------------------------------------- full screen

	/**
	 * Full screen without the Fullscreen API, which iOS Safari offers only for
	 * video: a fixed layer over the page, pushed onto history so Android's back
	 * button leaves full screen rather than the page.
	 */
	setFullscreen(on, { fromHistory = false } = {}) {
		if (on === this.state.fullscreen) return;
		this.state.fullscreen = on;
		this.classList.toggle('is-fullscreen', on);
		document.documentElement.classList.toggle('map-fullscreen-open', on);
		this.fullscreenButton.setAttribute('aria-pressed', String(on));
		this.fullscreenButton.setAttribute('aria-label', on ? 'Leave full screen' : 'Full screen map');
		this.yieldSupport();

		if (on) {
			history.pushState({ ...(history.state || {}), nairobiMapFullscreen: true }, '');
		} else if (!fromHistory && history.state && history.state.nairobiMapFullscreen) {
			// Unwind our own entry, so back does not re-enter full screen. The
			// popstate that follows puts the current selection in the address.
			this.unwinding = true;
			history.back();
			return;
		}

		if (!on) this.revealMap(true);
		if (this.state.sheet === 'closed' && this.state.selected) this.setSheet('peek', false);
	}

	/** Scroll the map into view, below the sticky header, unless it already is. */
	revealMap(instant = false) {
		if (this.state.fullscreen) return;
		const rect = this.frame.getBoundingClientRect();
		const header = parseFloat(getComputedStyle(document.documentElement).fontSize) * 3.5;
		const comfortable = rect.top >= header - 4 && rect.bottom <= window.innerHeight + 4;
		const mostly = rect.top >= header - 4 && rect.top < window.innerHeight * 0.35;
		if (comfortable || mostly) return;
		this.frame.scrollIntoView({ block: 'start', behavior: instant || reducedMotion() ? 'auto' : 'smooth' });
	}

	// -------------------------------------------------------------- selection

	pick(kind, id, { fly = true } = {}) {
		this.hideChooser();
		if (kind && !this.byId.has(kind + ':' + id)) return;

		// A shape is only drawn in its own geography, and a rent dot only on the
		// rent layer, so picking one switches the colours to something that
		// shows it.
		const shade = this.shade();
		if (kind === 'subcounty' && shade.geo !== 'subcounties') this.setShade('census-density');
		if (kind === 'constituency' && shade.geo === 'subcounties') this.setShade('plain');
		if (kind === 'rent' && shade.kind !== 'rent') this.setShade('rent');

		this.state.selected = kind ? { kind, id } : null;
		this.querySelectorAll('.is-selected').forEach((node) => node.classList.remove('is-selected'));

		if (this.liftedPin) {
			this.layers.landmarks.append(this.liftedPin);
			this.liftedPin = null;
		}

		let node = null;
		if (kind === 'landmark') {
			node = this.svg.querySelector(`.landmark[data-id="${id}"]`);
			if (node) {
				this.layers.lifted.append(node);
				this.liftedPin = node;
			}
		}
		else if (kind === 'rent') node = this.svg.querySelector(`.rent-dot[data-id="${id}"]`);
		else if (kind) node = this.svg.querySelector(`.${kind}[data-id="${id}"]`);
		if (node) node.classList.add('is-selected');

		// The sheet is shown before the flight, so the flight frames the place
		// in the part of the map the sheet leaves visible.
		if (kind && this.state.sheet === 'closed') this.state.sheet = 'peek';
		if (!kind && this.sheetOverlays()) this.state.sheet = 'closed';
		this.renderSheet();

		if (kind && fly) this.flyToSelection();

		this.layoutKey = '';
		this.layoutOverlays(true);
		this.updateHash();
	}

	/** Frame whatever is selected in the space left clear by the sheet. */
	flyToSelection() {
		const selected = this.state.selected;
		if (!selected || !this.box) return;
		if (selected.kind === 'landmark' || selected.kind === 'rent') {
			const p = this.byId.get(selected.kind + ':' + selected.id);
			// Close enough that the dense centre comes apart around it.
			const span = clamp(this.box.w, this.home.w / 16, this.home.w / 7);
			this.flyTo(this.fitVisible({ x: p.x - span / 2, y: p.y - span / 2, w: span, h: span }));
		} else {
			const b = this.bounds.get(selected.kind + ':' + selected.id);
			if (b) this.flyTo(this.fitVisible(pad(b, 0.35)));
		}
	}

	/** Fly to a neighbourhood: its constituency selected, its name in view. */
	goToNeighbourhood(id) {
		const n = this.data.neighbourhoods.find((item) => item.id === id);
		if (!n) return;
		if (this.shade().kind === 'rent' && n.rent) {
			this.pick('rent', n.id);
			return;
		}
		this.pick('constituency', n.constituency, { fly: false });
		// Close enough that a neighbourhood of any rank is named.
		const span = this.home.w / (RANK_ZOOM[3] + 0.6);
		this.flyTo(this.fitVisible({ x: n.x - span / 2, y: n.y - span / 2, w: span, h: span }));
	}

	applyFilters() {
		this.layoutKey = '';
		this.layoutOverlays(true);
	}

	// ------------------------------------------------------------------ sheet

	setSheet(state, refly = true) {
		if (!this.state.selected && state !== 'closed' && this.sheetOverlays()) state = 'closed';
		this.state.sheet = state;
		this.sheet.dataset.state = state;
		// With the sheet open over a phone's map, the key and the zoom buttons
		// step aside until it closes.
		this.frame.classList.toggle('is-sheet-open', state === 'open');
		this.sheetHandle.setAttribute('aria-expanded', String(state === 'open'));
		this.sheetHandle.setAttribute('aria-label', state === 'open' ? 'Show less' : 'Show more about this place');
		this.updateSheetGeometry();
		if (refly && state !== 'closed') this.flyToSelection();
	}

	updateSheetGeometry() {
		const peek = this.sheetHead.offsetHeight + this.tabList.offsetHeight;
		const full = this.sheet.offsetHeight;
		this.frame.style.setProperty('--sheet-peek', Math.max(0, full - peek) + 'px');
		this.frame.style.setProperty('--sheet-visible', this.sheetVisible() + 'px');
	}

	bindSheetDrag() {
		let start = null;

		this.sheetHead.addEventListener('pointerdown', (event) => {
			if (!this.sheetOverlays() || event.target.closest('.map-sheet-close')) return;
			this.sheetDragged = false;
			start = {
				y: event.clientY,
				from: this.state.sheet === 'open' ? 0 : this.sheet.offsetHeight - (this.sheetHead.offsetHeight + this.tabList.offsetHeight),
				id: event.pointerId,
			};
		});

		this.sheetHead.addEventListener('pointermove', (event) => {
			if (!start || event.pointerId !== start.id) return;
			const dy = event.clientY - start.y;
			if (!this.sheetDragged && Math.abs(dy) < 6) return;
			if (!this.sheetDragged) {
				this.sheetDragged = true;
				this.sheet.classList.add('is-dragging');
				try { this.sheetHead.setPointerCapture(event.pointerId); } catch { /* fine without */ }
			}
			const y = clamp(start.from + dy, 0, this.sheet.offsetHeight);
			this.sheet.style.transform = `translateY(${y}px)`;
		});

		const end = (event) => {
			if (!start || event.pointerId !== start.id) return;
			const dy = event.clientY - start.y;
			const wasDragged = this.sheetDragged;
			this.sheet.classList.remove('is-dragging');
			this.sheet.style.transform = '';
			start = null;
			if (!wasDragged) return;

			if (dy < -40) this.setSheet('open');
			else if (dy > 40 && this.state.sheet === 'open') this.setSheet('peek');
			else if (dy > 40) this.pick(null);
			else this.setSheet(this.state.sheet, false);

			// The click that follows a drag must not toggle the sheet back.
			setTimeout(() => { this.sheetDragged = false; }, 0);
		};
		this.sheetHead.addEventListener('pointerup', end);
		this.sheetHead.addEventListener('pointercancel', end);
	}

	/**
	 * One line that says what the colour under this shape means, so the peek
	 * answers the question the colours asked without opening anything.
	 */
	headline(record, kind) {
		const shade = this.shade();
		if (shade.kind === 'quantile') {
			const value = record[shade.field];
			if (typeof value !== 'number') return '';
			const bucket = this.bucketOf && this.bucketOf.get(record.id);
			const words = bucket ? ' · ' + BUCKET_WORDS[bucket] : '';
			if (shade.rank) {
				const total = this.data.constituencies.length;
				return `Relative wealth: ${ordinal(this.ranks.wealth.get(record.id))} of ${total}${words}`;
			}
			return `${shade.label}: ${shade.format(value)}${words}`;
		}
		if (kind === 'subcounty') return `${count(record.population)} people at the 2019 census`;
		if (shade.kind === 'rent') {
			const dots = this.data.neighbourhoods.filter((n) => n.rent && n.constituency === record.id).length;
			return dots ? `Rent shown for ${dots} ${dots === 1 ? 'neighbourhood' : 'neighbourhoods'} here` : 'No rent band placed here';
		}
		return `About ${count(record.population)} people · ${record.areaKm2} km²`;
	}

	facts(rows) {
		return element('dl', { class: 'map-facts' },
			rows.flatMap(([k, v]) => [element('dt', { text: k }), element('dd', { text: v })]));
	}

	constituencyButton(c) {
		return element('button', {
			type: 'button', class: 'constituency', text: c.name,
			onclick: () => this.pick('constituency', c.id),
		});
	}

	renderSheet() {
		const selected = this.state.selected;
		this.sheetSummary.replaceChildren();
		this.sheetBody.replaceChildren();
		this.sheet.classList.toggle('is-empty', !selected);
		this.sheetClose.hidden = !selected;

		const record = selected && this.byId ? this.byId.get(selected.kind + ':' + selected.id) : null;

		if (!record) {
			const data = this.data;
			this.sheetSummary.append(
				element('p', { class: 'map-eyebrow', text: 'Nairobi City County' }),
				element('h3', { text: 'Nairobi' }),
				element('p', {
					class: 'map-headline',
					text: data
						? `${data.constituencies.length} constituencies, ${data.neighbourhoods.length} neighbourhoods and ${data.landmarks.length} landmarks.`
						: '',
				})
			);
			if (data) {
				this.sheetBody.append(
					this.facts([
						['People (2019 census)', count(data.meta.population)],
						['Area', `${count(data.meta.countyAreaKm2)} km²`],
					]),
					element('p', {
						class: 'map-hint',
						text: 'Tap a constituency to see who lives there and what rent looks like. ' +
							'Use the layers button to colour the map by any of it.',
					}),
					element('h4', { text: 'Constituencies' }),
					element('ul', { class: 'map-list' },
						[...data.constituencies].sort((a, b) => a.name.localeCompare(b.name))
							.map((c) => element('li', {}, [this.constituencyButton(c)])))
				);
			}
			this.setSheet(this.sheetOverlays() ? 'closed' : 'open', false);
			return;
		}

		const { kind } = selected;
		if (kind === 'constituency') this.renderConstituency(record);
		else if (kind === 'subcounty') this.renderSubcounty(record);
		else if (kind === 'rent') this.renderRent(record);
		else this.renderLandmark(record);

		this.setSheet(this.state.sheet === 'closed' ? 'peek' : this.state.sheet, false);
	}

	renderConstituency(c) {
		const total = this.data.constituencies.length;
		const density = this.ranks.density.get(c.id);
		const places = this.data.neighbourhoods.filter((n) => n.constituency === c.id);
		const landmarks = this.data.landmarks.filter((l) => l.constituency === c.id);

		this.sheetSummary.append(
			element('p', { class: 'map-eyebrow', text: 'Constituency' }),
			element('h3', { text: c.name }),
			element('p', { class: 'map-headline', text: this.headline(c, 'constituency') })
		);
		this.sheetBody.append(
			element('div', { class: 'map-block' }, [
				this.facts([
					['People', `about ${count(c.population)} (estimate)`],
					['People per km²', `about ${count(c.density)}`],
					['Area', `${c.areaKm2} km²`],
					['Crowding', density === 1 ? `The most densely populated of ${total}` : `${ordinal(density)} most densely populated of ${total}`],
					['Relative wealth', `${ordinal(this.ranks.wealth.get(c.id))} of ${total}, wealthiest first`],
				]),
				element('p', { class: 'map-hint' }, [
					"Population is estimated: the 2019 census total for Nairobi, shared out by WorldPop's model. ",
					`Relative wealth is Meta's modelled index from ${c.rwiTiles || 'the nearest'} ${c.rwiTiles === 1 ? 'tile' : 'tiles'} of about 2.4 km`,
					c.rwiTiles <= 2 ? ', so treat it as rough here. ' : ', for comparison, not an income. ',
					element('a', { href: '#map-method', text: 'How and why' }),
				]),
			]),
			places.length ? element('div', { class: 'map-block' }, [
				element('h4', { text: 'Neighbourhoods' }),
				element('ul', { class: 'map-list' }, places.map((n) => element('li', {}, [
					element('button', {
						type: 'button',
						class: 'constituency' + (n.rent ? ` has-rent rent-${n.rent}` : ''),
						text: n.name,
						title: n.rent ? `Rent: ${this.data.rentBands[n.rent].label}` : '',
						onclick: () => this.goToNeighbourhood(n.id),
					}),
				]))),
			]) : null,
			landmarks.length ? element('div', { class: 'map-block' }, [
				element('h4', { text: 'On the map here' }),
				element('ul', { class: 'map-list' }, landmarks.map((l) => element('li', {}, [
					element('button', {
						type: 'button', class: `constituency landmark-link cat-${l.category}`, text: l.name,
						onclick: () => this.pick('landmark', l.id),
					}),
				]))),
			]) : null,
			element('p', {}, [
				element('a', { class: 'next-link', href: '/guides/neighbourhoods-of-nairobi', text: "Nairobi's neighbourhoods, and who lives where" }),
			])
		);
	}

	renderSubcounty(s) {
		const total = this.data.subcounties.length;
		const rank = this.ranks.censusDensity.get(s.id);
		this.sheetSummary.append(
			element('p', { class: 'map-eyebrow', text: 'Census sub-county, 2019' }),
			element('h3', { text: s.name }),
			element('p', { class: 'map-headline', text: this.headline(s, 'subcounty') })
		);
		this.sheetBody.append(
			element('div', { class: 'map-block' }, [
				this.facts([
					['People', count(s.population)],
					['People per km²', count(s.density)],
					['Area', `${s.areaKm2} km²`],
					['Crowding', rank === 1 ? `The most densely populated of ${total}` : `${ordinal(rank)} most densely populated of ${total}`],
					['Women', `${s.femalePct}%`],
					['Children under 15', `${s.under15Pct}%`],
					['Aged 20 to 34', `${s.age20to34Pct}%`],
					['Aged 65 and over', `${s.over64Pct}%`],
				]),
				element('p', { class: 'map-hint' }, [
					"Counted by the 2019 Kenya Population and Housing Census, Kenya's latest. Sub-counties are administrative areas and do not follow constituency lines. ",
					element('a', { href: '#census', text: 'All sub-counties' }),
				]),
			]),
			typeof s.households === 'number' ? element('div', { class: 'map-block' }, [
				element('h4', { text: 'Homes' }),
				this.facts([
					['Households', count(s.households)],
					['People per household', s.householdSize.toFixed(1)],
					['Renting', `${s.rentingPct}%`],
					['Piped water at home', `${s.pipedPct}%`],
					['Water from vendors', `${s.vendorPct}%`],
					['On the main sewer', `${s.sewerPct}%`],
					['Cooking with gas or electricity', `${s.cleanCookingPct}%`],
					['Cooking with paraffin', `${s.paraffinPct}%`],
					['Lights on mains electricity', `${s.electricityPct}%`],
				]),
				element('h4', { text: 'Online' }),
				this.facts([
					['Using the internet', `${s.internetPct}%`],
					['Using a computer', `${s.computerPct}%`],
				]),
				element('p', { class: 'map-hint' }, [
					'Shares of households, except the internet and computers, which are of people aged 3 and over. ',
					element('a', { href: '#homes', text: 'Every sub-county' }),
				]),
			]) : null
		);
	}

	renderRent(n) {
		const band = this.data.rentBands[n.rent];
		const home = this.data.constituencies.find((c) => c.id === n.constituency);
		this.sheetSummary.append(
			element('p', { class: 'map-eyebrow', text: 'Rent · indicative' }),
			element('h3', { text: n.name }),
			element('p', { class: 'map-headline', text: band.label })
		);
		this.sheetBody.append(
			element('div', { class: 'map-block map-rent' }, [
				element('h4', {}, [
					element('span', { class: 'swatch swatch-rent-' + n.rent }),
					element('span', { text: ' ' + band.label }),
				]),
				element('p', { class: 'map-hint', text: band.note }),
				home ? element('p', { class: 'map-in' }, ['In ', this.constituencyButton(home), ' constituency']) : null,
				element('p', {
					class: 'map-hint',
					text: 'Our reading of 2026 rental listings, not a measured index - Kenya publishes no rent figures by neighbourhood, and rents vary a lot inside one.',
				}),
				element('p', {}, [
					element('a', { class: 'next-link', href: '/guides/finding-housing#rough-asking-rents', text: 'Rents and deposits in the housing guide' }),
				]),
			])
		);
	}

	renderLandmark(l) {
		const home = this.data.constituencies.find((c) => c.id === l.constituency);
		this.sheetSummary.append(
			element('p', { class: `map-eyebrow cat-${l.category}`, text: this.data.categories[l.category] || l.category }),
			element('h3', { text: l.name }),
			element('p', { class: 'map-headline', text: l.description })
		);
		this.sheetBody.append(
			element('div', { class: 'map-block' }, [
				home ? element('p', { class: 'map-in' }, ['In ', this.constituencyButton(home), ' constituency']) : null,
				element('p', { class: 'map-links' }, [
					element('a', {
						href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${l.lat},${l.lon}`)}`,
						target: '_blank', rel: 'noopener', text: 'Open in Google Maps',
					}),
					element('a', {
						href: `https://www.openstreetmap.org/?mlat=${l.lat}&mlon=${l.lon}#map=17/${l.lat}/${l.lon}`,
						target: '_blank', rel: 'noopener', text: 'OpenStreetMap',
					}),
				]),
			])
		);
	}

	// ----------------------------------------------------------------- search

	renderSuggestions() {
		const query = normalise(this.state.query);
		this.suggestions.replaceChildren();

		if (query.length < 2 || !this.searchable) {
			this.suggestions.hidden = true;
			return;
		}

		// Names that start with the query first. Fewer on a phone, where the
		// keyboard has already taken half the screen.
		const hits = this.searchable
			.filter((item) => item.terms.includes(query))
			.sort((a, b) => (normalise(a.label).startsWith(query) ? 0 : 1) - (normalise(b.label).startsWith(query) ? 0 : 1))
			.slice(0, isNarrow() ? 5 : 8);

		if (!hits.length) {
			this.suggestions.append(element('p', { class: 'map-hint', text: 'Nothing on the map by that name.' }));
			this.suggestions.hidden = false;
			return;
		}

		hits.forEach((hit) => {
			this.suggestions.append(element('button', {
				type: 'button',
				role: 'option',
				class: 'map-suggestion',
				onkeydown: (event) => {
					const all = [...this.suggestions.querySelectorAll('button')];
					const at = all.indexOf(event.currentTarget);
					if (event.key === 'ArrowDown' && all[at + 1]) { event.preventDefault(); all[at + 1].focus(); }
					if (event.key === 'ArrowUp') {
						event.preventDefault();
						(all[at - 1] || this.searchInput).focus();
					}
				},
				onclick: () => {
					if (hit.kind === 'neighbourhood') this.goToNeighbourhood(hit.id);
					else this.pick(hit.kind, hit.id);
					this.searchInput.value = hit.label;
					this.state.query = '';
					this.suggestions.hidden = true;
					// Put the keyboard away so the result is visible.
					this.searchInput.blur();
				},
			}, [element('strong', { text: hit.label }), element('span', { text: hit.detail })]));
		});
		this.suggestions.hidden = false;
	}

	// ---------------------------------------------------------------- locate

	/**
	 * "Show where I am": the browser's location, used on this device and sent
	 * nowhere, turned into map units with the map's own projection.
	 */
	locate() {
		if (!navigator.geolocation) {
			this.showToast('Your browser cannot share its location');
			return;
		}
		this.locateButton.disabled = true;
		navigator.geolocation.getCurrentPosition((position) => {
			this.locateButton.disabled = false;
			const { latitude, longitude } = position.coords;
			const { origin, unitsPerDegLon, unitsPerDegLat } = this.data.meta;
			const x = (longitude - origin[0]) * unitsPerDegLon;
			const y = -(latitude - origin[1]) * unitsPerDegLat;
			const inside = [...this.layers.constituencies.children]
				.find((path) => path.isPointInFill && path.isPointInFill(new DOMPoint(x, y)));
			if (!inside) {
				this.you.setAttribute('hidden', 'hidden');
				this.showToast('You appear to be outside Nairobi City County');
				return;
			}
			this.you.setAttribute('transform', `translate(${x} ${y})`);
			this.you.removeAttribute('hidden');
			this.pick('constituency', inside.dataset.id, { fly: false });
			const span = this.home.w / 8;
			this.flyTo(this.fitVisible({ x: x - span / 2, y: y - span / 2, w: span, h: span }));
		}, () => {
			this.locateButton.disabled = false;
			this.showToast('Location was not shared, so the map cannot show where you are');
		}, { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 });
	}

	// ------------------------------------------------------------- deep links

	// The links this site has always used - #constituency/kibra, #place/kicc,
	// #subcounty/westlands, #rent/kilimani - from the guides, the home page's
	// hero map and the tables below. "place" is a landmark.
	updateHash() {
		const selected = this.state.selected;
		const prefix = { constituency: 'constituency', subcounty: 'subcounty', landmark: 'place', rent: 'rent' };
		const hash = selected ? `#${prefix[selected.kind]}/${selected.id}` : '';
		if (hash !== window.location.hash) {
			// Carry the state object through, or the full-screen marker is lost
			// and Android's back button leaves the page.
			history.replaceState(history.state, '', hash || window.location.pathname + window.location.search);
		}
	}

	/** Returns true when the hash pointed at something and it was shown. */
	applyHash() {
		const match = /^#(constituency|subcounty|place|rent)\/([a-z0-9-]+)$/.exec(decodeURIComponent(window.location.hash));
		if (!match) return false;
		const kind = { place: 'landmark' }[match[1]] || match[1];
		const id = match[2];
		if (!this.byId.has(kind + ':' + id)) return false;
		const selected = this.state.selected;
		if (selected && selected.kind === kind && selected.id === id) return true;
		this.pick(kind, id);
		return true;
	}
}

customElements.define('nairobi-map', NairobiMap);
