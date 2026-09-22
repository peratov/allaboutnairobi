// The interactive map at /map.
//
// No tile server, no mapping library, no third-party request. The whole thing
// is one SVG built from a 96KB JSON file served from this origin, which means
// it works behind a strict CSP, costs one request, and keeps working on a
// pay-as-you-go bundle in a lift. A slippy map would have been less work and a
// worse fit for a site whose readers are mostly on a phone in Accra.
//
// Two views share one coordinate space, so switching between them is only a
// change of viewBox: Ghana's sixteen regions, and Greater Accra's twenty-nine
// district assemblies. Everything else - pan, zoom, fly-to, deep links - is
// the same viewBox being moved around.
//
// Constituencies are labels, not shapes, and that is deliberate. Ghana's
// constituency boundaries are not published as open data, so drawing them
// would mean inventing them. They are attached to the district that contains
// them instead, which answers the question people actually have.

import { element } from '/js/utils/format.mjs';

const DATA_URL = '/geo/accra-map.json';

const CATEGORIES = {
	monument: 'Monuments',
	government: 'Government',
	culture: 'Culture',
	market: 'Markets',
	transport: 'Transport',
	education: 'Education',
	health: 'Health',
	nature: 'Coast and green space',
};

const EASE_MS = 650;

// How far the pointer may move between press and release and still count as a
// click rather than a drag, in screen pixels. Four is the usual figure; two is
// where a trackpad starts losing clicks.
const DRAG_SLOP_PX = 4;

// What the 29 districts can be shaded by.
//
// `quantile` splits the districts into five roughly equal groups and colours
// them along one ramp. Quintiles rather than equal-width bins on purpose: five
// equal slices of the *range* would put twenty-six districts in one colour,
// because Accra's distributions have long tails. Quintiles always use all five.
//
// Everything marked `census` is a real count from the 2021 Population and
// Housing Census. Rent is the one layer that is not measured, and it says so
// wherever it appears.
const SHADES = [
	{ id: 'type', label: 'Assembly type', kind: 'type' },
	{ id: 'rent', label: 'Rent (indicative)', kind: 'rent' },
	{ id: 'population', label: 'Population', kind: 'quantile', field: 'population',
	  format: (n) => n.toLocaleString('en-GH'), census: true },
	{ id: 'under15Pct', label: 'Children under 15', kind: 'quantile', field: 'under15Pct',
	  format: (n) => n + '%', census: true },
	{ id: 'over64Pct', label: 'People over 64', kind: 'quantile', field: 'over64Pct',
	  format: (n) => n + '%', census: true },
	{ id: 'femalePct', label: 'Women', kind: 'quantile', field: 'femalePct',
	  format: (n) => n + '%', census: true },
	{ id: 'ethnicity', label: 'Largest ethnic group', kind: 'ethnicity', census: true },
	{ id: 'unemploymentPct', label: 'Unemployment', kind: 'quantile', field: 'unemploymentPct',
	  format: (n) => n + '%', census: true },
	{ id: 'informalPct', label: 'Informal employment', kind: 'quantile', field: 'informalPct',
	  format: (n) => n + '%', census: true },
	{ id: 'participationPct', label: 'In the labour force', kind: 'quantile', field: 'participationPct',
	  format: (n) => n + '%', census: true },

	// Noise. There are no decibels here and there is no measured series to put
	// them against - the three components are real counts, the combined layer
	// is the average of their ranks, and every label says modelled.
	{ id: 'noiseScore', label: 'Noise exposure (modelled)', kind: 'quantile', field: 'noiseScore',
	  format: (n) => n + ' / 5', noise: true },
	{ id: 'roadPerKm2', label: 'Major road density', kind: 'quantile', field: 'roadPerKm2',
	  format: (n) => n + ' km/km²', noise: true },
	{ id: 'premisesPerKm2', label: 'Noisy premises', kind: 'quantile', field: 'premisesPerKm2',
	  format: (n) => n + ' /km²', noise: true },
	{ id: 'peoplePerKm2', label: 'People per km²', kind: 'quantile', field: 'peoplePerKm2',
	  format: (n) => Math.round(n).toLocaleString('en-GH'), noise: true },
];

// Only four of the nine major groups are the largest anywhere in Greater
// Accra, but all nine are here so the map does not break if a boundary or a
// census does.
const ETHNIC_COLOURS = [
	'Akan', 'Ga-Dangme', 'Ewe', 'Guan', 'Gurma',
	'Mole-Dagbani', 'Grusi', 'Mande', 'Others',
];

const slug = (text) =>
	String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

const reducedMotion = () =>
	window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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

class AccraMap extends HTMLElement {
	connectedCallback() {
		if (this.rendered) return;
		this.rendered = true;

		this.state = {
			view: 'accra', // 'accra' | 'ghana'
			selected: null, // {kind: 'district'|'region'|'landmark', id}
			constituency: null, // slug of the constituency picked out inside it
			query: '',
			shade: 'type', // 'type' | 'rent'
			categories: new Set(Object.keys(CATEGORIES)),
			showLandmarks: true,
			showLabels: true,
		};

		this.box = null;
		this.animation = null;

		this.build();
		this.load();
	}

	disconnectedCallback() {
		if (this.animation) cancelAnimationFrame(this.animation);
	}

	// ---------------------------------------------------------------- loading

	async load() {
		try {
			const response = await fetch(DATA_URL);
			if (!response.ok) throw new Error(String(response.status));
			this.data = await response.json();
		} catch (error) {
			this.status.textContent =
				'The map data could not be loaded. Everything on it is listed below.';
			this.status.hidden = false;
			this.classList.add('map-failed');
			return;
		}

		this.index();
		this.draw();
		this.setShade(this.state.shade);
		this.status.hidden = true;
		this.classList.add('map-ready');

		// A shared link should open on what it points at.
		this.applyHash();
		window.addEventListener('hashchange', () => this.applyHash());
	}

	index() {
		this.byId = new Map();
		this.data.regions.forEach((r) => this.byId.set('region:' + r.id, r));
		this.data.districts.forEach((d) => this.byId.set('district:' + d.id, d));
		this.data.landmarks.forEach((l) => this.byId.set('landmark:' + l.id, l));

		// One flat list drives the search box: districts, their capitals, every
		// constituency, and every landmark.
		this.searchable = [];
		this.data.districts.forEach((d) => {
			this.searchable.push({
				kind: 'district', id: d.id, label: d.name,
				detail: `${d.type} · ${d.capital}`,
				terms: [d.name, d.capital, d.type, ...d.constituencies].join(' ').toLowerCase(),
			});
			d.constituencies.forEach((c) =>
				this.searchable.push({
					kind: 'constituency', id: slug(c), name: c, district: d.id, label: c,
					detail: 'Constituency in ' + d.name,
					terms: (c + ' ' + d.name).toLowerCase(),
				})
			);
		});
		this.data.landmarks.forEach((l) =>
			this.searchable.push({
				kind: 'landmark', id: l.id, label: l.name,
				detail: CATEGORIES[l.category] || l.category,
				terms: (l.name + ' ' + l.category + ' ' + l.blurb).toLowerCase(),
			})
		);
		this.data.regions.forEach((r) =>
			this.searchable.push({
				kind: 'region', id: r.id, label: r.name + ' Region',
				detail: `${r.districts} districts · ${r.constituencies} constituencies`,
				terms: r.name.toLowerCase(),
			})
		);
	}

	// ----------------------------------------------------------------- markup

	build() {
		this.classList.add('accra-map');

		this.status = element('p', {
			class: 'map-status',
			role: 'status',
			text: 'Loading the map…',
		});

		this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		this.svg.setAttribute('class', 'map-canvas');
		this.svg.setAttribute('role', 'group');
		this.svg.setAttribute('aria-label', 'Map of Ghana and Greater Accra');
		this.svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

		this.layers = {};
		for (const name of ['regions', 'districts', 'labels', 'landmarks']) {
			const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
			group.setAttribute('class', 'layer layer-' + name);
			this.layers[name] = group;
			this.svg.append(group);
		}

		this.stage = element('div', { class: 'map-stage' }, [this.svg, this.status]);
		this.bindPointer();

		this.panel = element('aside', {
			class: 'map-panel',
			'aria-live': 'polite',
			'aria-label': 'Selected place',
		});

		// Category filters go under the map, not over it. On a phone eight chips
		// above the stage push the map itself below the fold, and they are a
		// refinement rather than something you reach for first.
		this.legend = element('ul', { class: 'map-legend', 'aria-label': 'What the colours mean' });

		this.append(
			this.buildControls(),
			element('div', { class: 'map-body' }, [this.stage, this.panel]),
			element('div', { class: 'map-chips no-print', role: 'group', 'aria-label': 'Landmark categories' },
				this.categoryChips),
			this.legend
		);

		this.classList.add('shade-type');
		this.renderLegend();

		this.renderPanel();
	}

	buildControls() {
		const uid = Math.random().toString(36).slice(2, 7);

		this.searchInput = element('input', {
			id: `map-search-${uid}`,
			type: 'search',
			placeholder: 'Search a district, constituency or landmark',
			autocomplete: 'off',
			spellcheck: 'false',
			oninput: (event) => {
				this.state.query = event.target.value.trim();
				this.renderSuggestions();
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
			},
		});

		this.suggestions = element('div', {
			class: 'map-suggestions',
			role: 'listbox',
			hidden: 'hidden',
		});

		this.viewButtons = [
			['accra', 'Greater Accra'],
			['ghana', 'All Ghana'],
		].map(([view, label]) =>
			element('button', {
				type: 'button',
				class: 'toggle',
				'aria-pressed': String(this.state.view === view),
				text: label,
				onclick: () => this.setView(view),
			})
		);

		// Ten ways to colour the same 29 shapes is a select, not ten buttons.
		this.shadeSelect = element('select', {
			id: `map-shade-${uid}`,
			onchange: (event) => this.setShade(event.target.value),
		});
		SHADES.forEach((shade) => {
			const option = element('option', { value: shade.id, text: shade.label });
			if (shade.id === this.state.shade) option.selected = true;
			this.shadeSelect.append(option);
		});

		this.landmarkToggle = element('button', {
			type: 'button',
			class: 'toggle',
			'aria-pressed': 'true',
			text: 'Landmarks',
			onclick: () => {
				this.state.showLandmarks = !this.state.showLandmarks;
				this.landmarkToggle.setAttribute('aria-pressed', String(this.state.showLandmarks));
				this.applyFilters();
			},
		});

		this.labelToggle = element('button', {
			type: 'button',
			class: 'toggle',
			'aria-pressed': 'true',
			text: 'Names',
			onclick: () => {
				this.state.showLabels = !this.state.showLabels;
				this.labelToggle.setAttribute('aria-pressed', String(this.state.showLabels));
				this.layers.labels.classList.toggle('is-hidden', !this.state.showLabels);
			},
		});

		this.categoryChips = Object.entries(CATEGORIES).map(([id, label]) =>
			element('button', {
				type: 'button',
				class: 'chip chip-' + id,
				'aria-pressed': 'true',
				text: label,
				onclick: (event) => {
					const on = this.state.categories.has(id);
					if (on) this.state.categories.delete(id);
					else this.state.categories.add(id);
					event.currentTarget.setAttribute('aria-pressed', String(!on));
					this.applyFilters();
				},
			})
		);

		const zoomButton = (label, aria, factor) =>
			element('button', {
				type: 'button',
				class: 'map-zoom',
				'aria-label': aria,
				text: label,
				onclick: () => this.zoomBy(factor),
			});

		return element('div', { class: 'map-controls no-print' }, [
			element('div', { class: 'map-search' }, [
				element('label', {
					class: 'visually-hidden',
					for: `map-search-${uid}`,
					text: 'Search the map',
				}),
				this.searchInput,
				this.suggestions,
			]),
			element('div', { class: 'map-toggles' }, [
				element('div', { class: 'input-group', role: 'group', 'aria-label': 'Map view' }, this.viewButtons),
				element('div', { class: 'map-shade' }, [
					element('label', { for: `map-shade-${uid}`, text: 'Shade by' }),
					this.shadeSelect,
				]),
				element('div', { class: 'input-group', role: 'group', 'aria-label': 'Layers' }, [
					this.landmarkToggle,
					this.labelToggle,
				]),
				element('div', { class: 'map-zooms' }, [
					zoomButton('+', 'Zoom in', 0.7),
					zoomButton('−', 'Zoom out', 1 / 0.7),
					element('button', {
						type: 'button',
						class: 'map-zoom',
						'aria-label': 'Reset the view',
						text: '⌂',
						onclick: () => this.setView(this.state.view, true),
					}),
				]),
			]),
		]);
	}

	// ---------------------------------------------------------------- drawing

	svgEl(tag, attrs) {
		const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
		for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
		return node;
	}

	draw() {
		const { regions, districts, landmarks } = this.data;

		regions.forEach((region) => {
			const path = this.svgEl('path', {
				d: region.d,
				class: 'shape region' + (region.id === 'greater-accra' ? ' is-home' : ''),
				'data-id': region.id,
				tabindex: '0',
				role: 'button',
				'aria-label': `${region.name} Region. ${region.districts} districts, ${region.constituencies} constituencies.`,
			});
			path.addEventListener('click', () => this.pick('region', region.id));
			path.addEventListener('keydown', (e) => this.shapeKey(e, 'region', region.id));
			this.layers.regions.append(path);
		});

		districts.forEach((district) => {
			const path = this.svgEl('path', {
				d: district.d,
				class: `shape district type-${district.type.toLowerCase()} rent-${district.rent}`,
				'data-id': district.id,
				tabindex: '0',
				role: 'button',
				'aria-label': `${district.name}. ${district.type} assembly, capital ${district.capital}. ${district.constituencies.length} constituencies.`,
			});
			path.addEventListener('click', () => this.pick('district', district.id));
			path.addEventListener('keydown', (e) => this.shapeKey(e, 'district', district.id));
			this.layers.districts.append(path);

			const label = this.svgEl('text', {
				x: district.cx,
				y: district.cy,
				class: 'map-label',
				'data-id': district.id,
			});
			label.textContent = district.name
				.replace(/ (Municipal|Metropolitan|District)$/, '')
				.trim();
			this.layers.labels.append(label);
		});

		landmarks.forEach((landmark) => {
			const group = this.svgEl('g', {
				class: 'landmark cat-' + landmark.category,
				'data-id': landmark.id,
				'data-category': landmark.category,
				// Not a tab stop. Districts are 29 stops, which is reasonable;
				// another 45 pins on top of them is a keyboard user tabbing
				// through three quarters of the page to get past a picture.
				// Every landmark is listed below the map with its own link, and
				// the search box reaches all of them by name.
				tabindex: '-1',
				role: 'button',
				'aria-label': `${landmark.name}. ${CATEGORIES[landmark.category] || landmark.category}.`,
				transform: `translate(${landmark.x} ${landmark.y})`,
			});
			group.append(
				this.svgEl('circle', { class: 'pin-halo', r: '70' }),
				this.svgEl('circle', { class: 'pin', r: '30' })
			);
			group.addEventListener('click', () => this.pick('landmark', landmark.id));
			group.addEventListener('keydown', (e) => this.shapeKey(e, 'landmark', landmark.id));
			this.layers.landmarks.append(group);
		});

		this.setView('accra', true, true);
	}

	shade() {
		return SHADES.find((s) => s.id === this.state.shade) || SHADES[0];
	}

	setShade(id) {
		this.state.shade = id;
		if (this.shadeSelect.value !== id) this.shadeSelect.value = id;

		const shade = this.shade();
		SHADES.forEach((s) => this.classList.remove('shade-' + s.kind));
		this.classList.add('shade-' + shade.kind);

		this.applyShade();
		this.renderLegend();
		this.renderPanel();
	}

	/**
	 * Put every district in a bucket for the current shading.
	 *
	 * Quintiles, not equal-width bins. Accra's distributions have long tails -
	 * one district holds 412,000 people and another 53,000 - so five equal
	 * slices of the range would drop twenty-six districts into the palest
	 * colour and call it a map. Quintiles always use all five steps.
	 */
	applyShade() {
		if (!this.data) return;
		const shade = this.shade();
		const paths = [...this.layers.districts.children];

		paths.forEach((path) => {
			path.removeAttribute('data-bucket');
			path.removeAttribute('data-eth');
		});
		this.buckets = null;

		if (shade.kind === 'quantile') {
			const values = this.data.districts
				.map((d) => d[shade.field])
				.filter((v) => typeof v === 'number')
				.sort((a, b) => a - b);
			if (!values.length) return;

			// Four cut points, five buckets.
			const cuts = [1, 2, 3, 4].map((i) => values[Math.floor((i * values.length) / 5)]);
			const bucketOf = (value) => cuts.filter((cut) => value >= cut).length + 1;

			this.buckets = cuts.map((cut, i) => {
				const low = i === 0 ? values[0] : cuts[i - 1];
				return { from: low, to: cut };
			});
			this.buckets.push({ from: cuts[3], to: values[values.length - 1] });
			this.buckets[0].from = values[0];

			this.data.districts.forEach((district) => {
				const value = district[shade.field];
				if (typeof value !== 'number') return;
				const path = this.svg.querySelector(`.district[data-id="${district.id}"]`);
				if (path) path.setAttribute('data-bucket', String(bucketOf(value)));
			});
		} else if (shade.kind === 'ethnicity') {
			this.data.districts.forEach((district) => {
				const path = this.svg.querySelector(`.district[data-id="${district.id}"]`);
				if (path && district.largestEthnicGroup) {
					path.setAttribute('data-eth', slug(district.largestEthnicGroup));
				}
			});
		}
	}

	/**
	 * The legend belongs to whichever shading is on, and the rent one carries
	 * its own health warning. A coloured map looks authoritative whether or not
	 * it deserves to, so the caveat sits next to the colours rather than in a
	 * footnote nobody scrolls to.
	 */
	renderLegend() {
		if (!this.legend) return;
		this.legend.replaceChildren();
		const shade = this.shade();

		if (shade.kind === 'quantile') {
			if (!this.buckets) return;
			this.buckets.forEach((bucket, i) => {
				const from = shade.format(Math.round(bucket.from * 10) / 10);
				const to = shade.format(Math.round(bucket.to * 10) / 10);
				this.legend.append(
					element('li', {}, [
						element('span', { class: 'swatch swatch-rent-' + (i + 1) }),
						element('span', { text: from === to ? from : `${from} – ${to}` }),
					])
				);
			});
			this.legend.append(
				element('li', { class: 'map-legend-caveat' }, [
					element('span', {
						text: shade.noise
							? 'Modelled from road and premises counts, not measured. Nobody publishes ambient noise by district for Accra.'
							: '2021 Population and Housing Census, Ghana Statistical Service. Districts in five equal groups.',
					}),
				])
			);
			return;
		}

		if (shade.kind === 'ethnicity') {
			const present = new Set(
				this.data.districts.map((d) => d.largestEthnicGroup).filter(Boolean)
			);
			ETHNIC_COLOURS.filter((g) => present.has(g)).forEach((group) => {
				this.legend.append(
					element('li', {}, [
						element('span', { class: 'swatch swatch-eth-' + slug(group) }),
						element('span', { text: group }),
					])
				);
			});
			this.legend.append(
				element('li', { class: 'map-legend-caveat' }, [
					element('span', {
						text: 'The largest group in each district, not the only one. 2021 census.',
					}),
				])
			);
			return;
		}

		if (shade.kind === 'rent') {
			const bands = (this.data && this.data.rent && this.data.rent.bands) || [];
			bands.forEach((band) => {
				this.legend.append(
					element('li', { title: band.note }, [
						element('span', { class: 'swatch swatch-rent-' + band.band }),
						element('span', { text: band.label }),
					])
				);
			});
			this.legend.append(
				element('li', { class: 'map-legend-caveat' }, [
					element('span', {
						text: 'Indicative ranking, not measured. Ghana publishes no rent data by district.',
					}),
				])
			);
			return;
		}

		[
			['metropolitan', 'Metropolitan'],
			['municipal', 'Municipal'],
			['district', 'District'],
		].forEach(([id, label]) => {
			this.legend.append(
				element('li', {}, [
					element('span', { class: 'swatch swatch-' + id }),
					element('span', { text: label }),
				])
			);
		});
	}

	shapeKey(event, kind, id) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			this.pick(kind, id);
		}
	}

	// ------------------------------------------------------------------ views

	aspect() {
		const rect = this.stage.getBoundingClientRect();
		return rect.width && rect.height ? rect.width / rect.height : 1;
	}

	/** Bounding box of a set of shapes, in the shared coordinate space. */
	boundsOf(nodes) {
		let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
		nodes.forEach((node) => {
			const b = node.getBBox();
			x1 = Math.min(x1, b.x);
			y1 = Math.min(y1, b.y);
			x2 = Math.max(x2, b.x + b.width);
			y2 = Math.max(y2, b.y + b.height);
		});
		return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
	}

	setView(view, reset = false, immediate = false) {
		this.state.view = view;
		this.viewButtons.forEach((button, i) =>
			button.setAttribute('aria-pressed', String(['accra', 'ghana'][i] === view))
		);
		this.classList.toggle('view-ghana', view === 'ghana');
		this.classList.toggle('view-accra', view === 'accra');

		const nodes =
			view === 'ghana'
				? [...this.layers.regions.children]
				: [...this.layers.districts.children];
		const content = pad(this.boundsOf(nodes), 0.04);

		// Shape the stage to the thing being shown before measuring it. Greater
		// Accra is twice as wide as it is tall; dropped into a portrait box it
		// would use two fifths of the height and leave the rest empty.
		this.shapeStage(content.w / content.h);

		this.flyTo(fit(content, this.aspect()), immediate);
		if (reset) this.pick(null);
	}

	/**
	 * Give the stage the aspect ratio of its contents, within limits.
	 *
	 * Unclamped, All Ghana would make a tall narrow slot and Greater Accra a
	 * letterbox too short to touch. The clamps are what keep both usable on a
	 * phone.
	 */
	shapeStage(contentAspect) {
		const narrow = window.matchMedia('(max-width: 719px)').matches;
		// A phone gets a squarer box than the data asks for. Letterboxing a
		// little is better than a strip too short to put a thumb on.
		const [low, high] = narrow ? [0.8, 1.35] : [1.1, 2.4];
		this.style.setProperty('--map-aspect', String(clamp(contentAspect, low, high)));
		// Force layout so aspect() measures the stage we just reshaped.
		void this.stage.offsetHeight;
	}

	flyTo(target, immediate = false) {
		if (this.animation) cancelAnimationFrame(this.animation);

		if (immediate || !this.box || reducedMotion()) {
			this.box = target;
			this.applyBox();
			return;
		}

		const from = { ...this.box };
		const start = performance.now();
		const step = (now) => {
			const t = clamp((now - start) / EASE_MS, 0, 1);
			// easeInOutCubic
			const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
			this.box = {
				x: from.x + (target.x - from.x) * e,
				y: from.y + (target.y - from.y) * e,
				w: from.w + (target.w - from.w) * e,
				h: from.h + (target.h - from.h) * e,
			};
			this.applyBox();
			if (t < 1) this.animation = requestAnimationFrame(step);
		};
		this.animation = requestAnimationFrame(step);
	}

	applyBox() {
		const { x, y, w, h } = this.box;

		// A NaN anywhere in here renders nothing at all and says nothing about
		// why, which cost an hour once already.
		if (![x, y, w, h].every(Number.isFinite)) {
			console.warn('accra-map: refusing a non-finite viewBox', this.box);
			return;
		}

		this.svg.setAttribute('viewBox', `${x} ${y} ${w} ${h}`);

		// How many user units make one screen pixel at the current zoom. Strokes,
		// label text and pins are all sized as multiples of this, so a border
		// stays a hairline and a label stays 11px whether you are looking at the
		// whole country or at one street in Osu.
		const width = this.stage.getBoundingClientRect().width || 1;
		this.style.setProperty('--map-unit', String(w / width));

		// Twenty-nine names on top of each other is not a label layer, it is a
		// smear. They appear once the view is close enough for them to be read.
		this.classList.toggle('is-zoomed', w < 2600);
	}

	zoomBy(factor, anchor = null) {
		if (!this.box) return;
		const w = clamp(this.box.w * factor, 200, 40000);
		const h = w / (this.box.w / this.box.h);
		const point = anchor || { x: this.box.x + this.box.w / 2, y: this.box.y + this.box.h / 2 };
		const rx = (point.x - this.box.x) / this.box.w;
		const ry = (point.y - this.box.y) / this.box.h;
		this.box = { x: point.x - w * rx, y: point.y - h * ry, w, h };
		this.applyBox();
	}

	// --------------------------------------------------------------- pointers

	clientToMap(event) {
		const rect = this.svg.getBoundingClientRect();
		return {
			x: this.box.x + ((event.clientX - rect.left) / rect.width) * this.box.w,
			y: this.box.y + ((event.clientY - rect.top) / rect.height) * this.box.h,
		};
	}

	bindPointer() {
		const pointers = new Map();
		let dragged = false;
		let pinchStart = null;
		let pressedAt = null;
		let captured = false;

		this.svg.addEventListener('pointerdown', (event) => {
			if (!this.box) return;
			pointers.set(event.pointerId, event);
			dragged = false;
			pressedAt = { x: event.clientX, y: event.clientY };
			if (pointers.size === 1) {
				this.dragFrom = { pointer: this.clientToMap(event), box: { ...this.box } };
				captured = false;
				// Capture is NOT taken here, and that is the whole point.
				//
				// A captured pointer retargets the click that follows it to the
				// capturing element. Capture the SVG on pointerdown and every
				// click is delivered to the SVG rather than to the district path
				// under the cursor - and the per-shape click listeners, which is
				// where selection lives, never run. Clicking a district did
				// nothing on desktop for exactly this reason: hover worked,
				// because hover is not a pointer-capture event.
				//
				// Capture is only ever needed once a drag is under way, to keep
				// panning alive when the cursor leaves the map. So it is taken
				// in pointermove, the moment the gesture is known to be a drag.
			} else if (pointers.size === 2) {
				const [a, b] = [...pointers.values()];
				pinchStart = {
					distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
					box: { ...this.box },
				};
			}
		});

		this.svg.addEventListener('pointermove', (event) => {
			if (!pointers.has(event.pointerId) || !this.box) return;
			pointers.set(event.pointerId, event);

			if (pointers.size === 2 && pinchStart) {
				const [a, b] = [...pointers.values()];
				const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
				if (distance > 0) {
					const factor = clamp(pinchStart.distance / distance, 0.2, 5);
					this.box = { ...pinchStart.box };
					this.zoomBy(factor);
					dragged = true;
				}
				return;
			}

			if (!this.dragFrom) return;
			const now = this.clientToMap(event);
			const dx = this.dragFrom.pointer.x - now.x;
			const dy = this.dragFrom.pointer.y - now.y;

			// In SCREEN pixels, not map units.
			//
			// This was `> this.box.w * 0.004`, a fraction of the viewBox - which
			// at the default Accra zoom came to 1.9 physical pixels. A finger
			// tapping does not move; a mouse or a trackpad drifts two pixels
			// between press and release almost every time. So every click was
			// being treated as a drag and swallowed, on desktop only, which is
			// exactly where it was reported.
			if (pressedAt) {
				const moved = Math.hypot(event.clientX - pressedAt.x, event.clientY - pressedAt.y);
				if (moved > DRAG_SLOP_PX) {
					dragged = true;
					// Now it is a drag, so capture is safe: this gesture is never
					// going to be a click anyway - the handler below suppresses
					// the click once `dragged` is set - and capture is what keeps
					// the pan alive when the cursor leaves the map.
					if (!captured) {
						try {
							this.svg.setPointerCapture(event.pointerId);
							captured = true;
						} catch {
							// Capture is an optimisation. Panning still works
							// without it, up to the edge of the element.
						}
					}
				}
			}
			this.box = {
				...this.dragFrom.box,
				x: this.dragFrom.box.x + dx,
				y: this.dragFrom.box.y + dy,
			};
			this.applyBox();
		});

		const release = (event) => {
			pointers.delete(event.pointerId);
			if (pointers.size < 2) pinchStart = null;
			if (pointers.size === 0) {
				this.dragFrom = null;
				pressedAt = null;
				if (captured) {
					try {
						this.svg.releasePointerCapture(event.pointerId);
					} catch {
						// Already released implicitly on pointerup. Harmless.
					}
					captured = false;
				}
			}
		};
		this.svg.addEventListener('pointerup', release);
		this.svg.addEventListener('pointercancel', release);

		// A drag that ends on a shape should not also select it.
		this.svg.addEventListener('click', (event) => {
			if (dragged) {
				event.stopPropagation();
				event.preventDefault();
			}
		}, true);

		this.svg.addEventListener('wheel', (event) => {
			if (!this.box) return;
			event.preventDefault();
			this.zoomBy(event.deltaY > 0 ? 1.12 : 1 / 1.12, this.clientToMap(event));
		}, { passive: false });

		this.svg.setAttribute('tabindex', '0');
		this.svg.addEventListener('keydown', (event) => {
			if (!this.box) return;
			const step = this.box.w * 0.12;
			const moves = {
				ArrowLeft: [-step, 0], ArrowRight: [step, 0],
				ArrowUp: [0, -step], ArrowDown: [0, step],
			};
			if (moves[event.key]) {
				event.preventDefault();
				this.box = { ...this.box, x: this.box.x + moves[event.key][0], y: this.box.y + moves[event.key][1] };
				this.applyBox();
			} else if (event.key === '+' || event.key === '=') {
				event.preventDefault();
				this.zoomBy(0.8);
			} else if (event.key === '-' || event.key === '_') {
				event.preventDefault();
				this.zoomBy(1.25);
			} else if (event.key === 'Escape') {
				this.pick(null);
			}
		});

		window.addEventListener('resize', () => {
			if (this.box) this.flyTo(fit(this.box, this.aspect()), true);
		});
	}

	// -------------------------------------------------------------- selection

	pick(kind, id, { fly = true, keepConstituency = false } = {}) {
		this.state.selected = kind ? { kind, id } : null;
		// Picking anything else clears the constituency, or the panel would
		// keep a name highlighted that belongs to a district you have left.
		if (!keepConstituency) this.state.constituency = null;

		this.querySelectorAll('.is-selected').forEach((node) =>
			node.classList.remove('is-selected')
		);

		if (kind) {
			const node = this.svg.querySelector(`.${kind === 'landmark' ? 'landmark' : 'shape'}[data-id="${id}"]`);
			if (node) {
				node.classList.add('is-selected');
				if (fly) {
					if (kind === 'landmark') {
						const l = this.byId.get('landmark:' + id);
						const w = Math.min(this.box.w, 2200);
						this.flyTo(fit({ x: l.x - w / 2, y: l.y - w / 2, w, h: w }, this.aspect()));
					} else if (kind === 'district') {
						// Read the rect field by field. An SVGRect keeps x, y,
						// width and height on its prototype, so spreading one
						// copies nothing and quietly yields a NaN viewBox.
						const b = node.getBBox();
						const box = { x: b.x, y: b.y, w: b.width, h: b.height };
						this.flyTo(fit(pad(box, 0.5), this.aspect()));
					}
				}
			}
			// Selecting a region from the Ghana view is how you get into Accra.
			if (kind === 'region' && id === 'greater-accra') {
				this.setView('accra');
				this.state.selected = null;
			}
		}

		this.renderPanel();
		this.updateHash();
	}

	/**
	 * Select a constituency.
	 *
	 * There is nothing to fly to - Ghana does not publish constituency
	 * boundaries, so a constituency has no shape of its own. What it has is a
	 * district, so selecting one selects that district and marks the
	 * constituency inside it. That is the honest answer to "where is
	 * Odododiodio", and it is also the useful one.
	 */
	pickConstituency(name, districtId) {
		const already = this.state.selected
			&& this.state.selected.kind === 'district'
			&& this.state.selected.id === districtId;
		this.pick('district', districtId, { fly: !already, keepConstituency: true });
		this.state.constituency = slug(name);
		this.renderPanel();
		this.updateHash();
	}

	/** Which district holds a constituency, by slug. */
	districtOfConstituency(constituencySlug) {
		return this.data.districts.find((d) =>
			d.constituencies.some((c) => slug(c) === constituencySlug)
		);
	}

	applyFilters() {
		this.layers.landmarks.classList.toggle('is-hidden', !this.state.showLandmarks);
		[...this.layers.landmarks.children].forEach((node) => {
			const visible = this.state.categories.has(node.dataset.category);
			node.classList.toggle('is-hidden', !visible);
		});
	}

	// ------------------------------------------------------------------ panel

	renderPanel() {
		this.panel.replaceChildren();
		const selected = this.state.selected;

		if (!selected) {
			this.panel.append(
				element('div', { class: 'map-panel-empty' }, [
					element('h3', { text: 'Greater Accra' }),
					element('p', {
						text:
							this.data
								? `${this.data.districts.length} district assemblies, ` +
								  `${this.data.districts.reduce((n, d) => n + d.constituencies.length, 0)} constituencies ` +
								  `and ${this.data.landmarks.length} landmarks.`
								: '',
					}),
					element('p', {
						class: 'map-hint',
						text: 'Tap a district to see its capital and its constituencies. Drag to pan, pinch or scroll to zoom.',
					}),
				])
			);
			return;
		}

		const record = this.byId.get(selected.kind + ':' + selected.id);
		if (!record) return;

		const close = element('button', {
			type: 'button',
			class: 'map-panel-close',
			'aria-label': 'Clear the selection',
			text: '×',
			onclick: () => this.pick(null),
		});

		if (selected.kind === 'district') {
			this.panel.append(
				close,
				element('p', { class: 'map-eyebrow', text: record.type + ' assembly' }),
				element('h3', { text: record.name }),
				element('dl', { class: 'map-facts' }, [
					element('dt', { text: 'Capital' }),
					element('dd', { text: record.capital || 'Not recorded' }),
					element('dt', { text: 'Constituencies' }),
					element('dd', { text: String(record.constituencies.length) }),
				]),
				// Buttons, not text. A list of names on a map where everything
				// else responds to a click reads as broken when these do not.
				element('ul', { class: 'map-list' },
					record.constituencies.map((c) =>
						element('li', {}, [
							element('button', {
								type: 'button',
								class: 'constituency'
									+ (slug(c) === this.state.constituency ? ' is-current' : ''),
								'aria-pressed': String(slug(c) === this.state.constituency),
								text: c,
								onclick: () => this.pickConstituency(c, record.id),
							}),
						])
					)),
				element('p', { class: 'map-hint', text:
					'Constituency boundaries are not published as open data, so these are listed by the district that contains them rather than drawn.' }),
				this.censusBlock(record),
				this.noiseBlock(record),
				this.rentBlock(record),
				element('p', {}, [
					element('a', {
						class: 'next-link',
						href: '/guides/government-agencies',
						text: 'Who to complain to about what',
					}),
				])
			);
		} else if (selected.kind === 'landmark') {
			this.panel.append(
				close,
				element('p', { class: 'map-eyebrow', text: CATEGORIES[record.category] || record.category }),
				element('h3', { text: record.name }),
				element('p', { text: record.blurb }),
				element('dl', { class: 'map-facts' }, [
					element('dt', { text: 'Coordinates' }),
					element('dd', { text: `${record.lat}, ${record.lon}` }),
				]),
				record.url
					? element('p', {}, [
							element('a', { class: 'next-link', href: record.url, text: 'Read the guide' }),
					  ])
					: null
			);
		} else {
			this.panel.append(
				close,
				element('p', { class: 'map-eyebrow', text: 'Region' }),
				element('h3', { text: record.name }),
				element('dl', { class: 'map-facts' }, [
					element('dt', { text: 'Districts' }),
					element('dd', { text: String(record.districts) }),
					element('dt', { text: 'Constituencies' }),
					element('dd', { text: String(record.constituencies) }),
				])
			);
		}
	}

	/**
	 * The noise components, shown separately.
	 *
	 * The combined score is the average of three ranks, so the only way it
	 * means anything to a reader is if they can see the three. A district that
	 * scores high on roads and low on people is a different place to live from
	 * one that scores the reverse, and a single number hides that.
	 */
	noiseBlock(district) {
		if (typeof district.noiseScore !== 'number') return null;

		const rows = [
			['Major roads', district.roadPerKm2 + ' km per km²'],
			['Noisy premises', district.premisesPerKm2 + ' per km²'],
			['People', Math.round(district.peoplePerKm2).toLocaleString('en-GH') + ' per km²'],
			['Area', district.areaKm2 + ' km²'],
		];

		return element('div', { class: 'map-census' }, [
			element('h4', { text: `Noise exposure: ${district.noiseScore} out of 5` }),
			element('dl', { class: 'map-facts' },
				rows.flatMap(([k, v]) => [element('dt', { text: k }), element('dd', { text: v })])),
			element('p', {
				class: 'map-hint',
				text:
					'Modelled, not measured. Nobody publishes ambient noise by district for Accra, ' +
					'so this ranks the things that make a place loud - traffic, markets and ' +
					'industry, and how many people are packed in - rather than reporting decibels.',
			}),
			element('p', {}, [
				element('a', {
					class: 'next-link',
					href: '/guides/reporting-broken-infrastructure',
					text: 'Reporting a noise problem',
				}),
			]),
		]);
	}

	/** Who lives here and what they do, straight from the 2021 census. */
	censusBlock(district) {
		if (!district.population) return null;

		const rows = [
			['People', district.population.toLocaleString('en-GH')],
			['Women', district.femalePct + '%'],
			['Under 15', district.under15Pct + '%'],
			['Over 64', district.over64Pct + '%'],
		];

		const work = [
			['In the labour force', district.participationPct + '%'],
			['Unemployed', district.unemploymentPct + '%'],
			['Working informally', district.informalPct + '%'],
			['Working for government', district.publicPct + '%'],
		];

		const ethnicity = Object.entries(district.ethnicity || {}).slice(0, 4);

		return element('div', { class: 'map-census' }, [
			element('h4', { text: 'People' }),
			element('dl', { class: 'map-facts' },
				rows.flatMap(([k, v]) => [element('dt', { text: k }), element('dd', { text: v })])),

			element('h4', { text: 'Work' }),
			element('dl', { class: 'map-facts' },
				work.flatMap(([k, v]) => [element('dt', { text: k }), element('dd', { text: v })])),
			element('p', {
				class: 'map-hint',
				text:
					'Unemployment is a share of the labour force. Informal is a share of those in ' +
					'work, and in Ghana it means private informal - a trader, an apprentice, a ' +
					'mechanic with no payslip.',
			}),

			ethnicity.length
				? element('div', {}, [
						element('h4', { text: 'Ethnicity' }),
						element('ul', { class: 'map-bars' },
							ethnicity.map(([group, pct]) =>
								element('li', {}, [
									element('span', { class: 'map-bar-label', text: group }),
									element('span', { class: 'map-bar' }, [
										element('span', {
											class: 'map-bar-fill eth-' + slug(group),
											style: `width:${Math.max(2, pct)}%`,
										}),
									]),
									element('span', { class: 'map-bar-value', text: pct + '%' }),
								])
							)),
				  ])
				: null,

			element('p', {
				class: 'map-hint',
				text: '2021 Population and Housing Census, Ghana Statistical Service.',
			}),
		]);
	}

	/**
	 * The rent band, with what it rests on.
	 *
	 * Naming the neighbourhoods that set the band lets a reader judge the call
	 * instead of taking a colour on trust, and saying so where a district is
	 * too varied for an average to mean much is more useful than the average.
	 */
	rentBlock(district) {
		if (!district.rent || !this.data.rent) return null;

		const band = this.data.rent.bands.find((b) => b.band === district.rent);
		if (!band) return null;

		const children = [
			element('h4', {}, [
				element('span', { class: 'swatch swatch-rent-' + band.band }),
				element('span', { text: ' Rent: ' + band.label.toLowerCase() }),
			]),
			element('p', { class: 'map-hint', text: band.note }),
		];

		if (district.rentDrivenBy) {
			children.push(
				element('p', { class: 'map-hint', text: 'Set by ' + district.rentDrivenBy + '.' })
			);
		}

		if (district.rentSpread === 'wide') {
			children.push(
				element('p', {
					class: 'map-hint map-hint-warn',
					text:
						'This district varies enormously inside its own borders, so a single band ' +
						'says less here than elsewhere.',
				})
			);
		}

		children.push(
			element('p', {
				class: 'map-hint',
				text:
					'A coarse ranking from listing observation, not a survey - Ghana publishes no ' +
					'rent data at district level. Corrections welcome.',
			})
		);

		return element('div', { class: 'map-rent' }, children);
	}

	renderSuggestions() {
		const query = this.state.query.toLowerCase();
		this.suggestions.replaceChildren();

		if (query.length < 2 || !this.searchable) {
			this.suggestions.hidden = true;
			return;
		}

		const hits = this.searchable
			.filter((item) => item.terms.includes(query))
			.slice(0, 8);

		if (!hits.length) {
			this.suggestions.append(element('p', { class: 'map-hint', text: 'Nothing matches that.' }));
			this.suggestions.hidden = false;
			return;
		}

		hits.forEach((hit) => {
			this.suggestions.append(
				element('button', {
					type: 'button',
					role: 'option',
					class: 'map-suggestion',
					onclick: () => {
						if (hit.kind === 'region') this.setView('ghana');
						else this.setView('accra');
						// Let the view settle before flying to the thing itself.
						const settle = reducedMotion() ? 0 : EASE_MS * 0.4;
						setTimeout(() => {
							// Searching a constituency should land on the
							// constituency, not merely on the district around it -
							// otherwise the panel lists four names and gives no
							// sign which one was asked for.
							if (hit.kind === 'constituency') this.pickConstituency(hit.name, hit.district);
							else this.pick(hit.kind, hit.id);
						}, settle);
						this.searchInput.value = hit.label;
						this.state.query = '';
						this.suggestions.hidden = true;
					},
				}, [
					element('strong', { text: hit.label }),
					element('span', { text: hit.detail }),
				])
			);
		});
		this.suggestions.hidden = false;
	}

	// ------------------------------------------------------------- deep links

	updateHash() {
		const selected = this.state.selected;
		let hash = '';
		if (this.state.constituency) hash = `#constituency=${this.state.constituency}`;
		else if (selected) hash = `#${selected.kind}=${selected.id}`;

		if (hash !== window.location.hash) {
			history.replaceState(null, '', hash || window.location.pathname);
		}
	}

	applyHash() {
		const match = /^#(district|region|landmark|constituency)=([a-z0-9-]+)$/.exec(
			window.location.hash
		);
		if (!match) return;
		const [, kind, id] = match;

		// A constituency has no shape, so it resolves to the district holding it.
		// This is what makes the links in the table below the map work.
		if (kind === 'constituency') {
			const district = this.districtOfConstituency(id);
			if (!district) return;
			const name = district.constituencies.find((c) => slug(c) === id);
			this.setView('accra');
			this.pickConstituency(name, district.id);
			return;
		}

		if (!this.byId.has(kind + ':' + id)) return;
		if (kind === 'region') this.setView('ghana');
		this.pick(kind, id);
	}
}

customElements.define('accra-map', AccraMap);
