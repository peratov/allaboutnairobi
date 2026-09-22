// The interactive map at /map.
//
// One SVG built from /geo/nairobi-map.json (about 30 KB), with no tile server
// and no mapping library, so it costs one request and works on a slow bundle.
// Everything - pan, zoom, fly-to, deep links - is the viewBox being moved.
//
// Constituency populations are estimates and the panel says so: the census
// publishes Nairobi by sub-county, on different boundaries. The build script,
// scripts/build_nairobi_map.py, explains the method.

const DATA_URL = '/geo/nairobi-map.json';
const SVG_NS = 'http://www.w3.org/2000/svg';
const EASE_MS = 450;
const DRAG_SLOP_PX = 4;
const MAX_ZOOM = 40;

const SHADES = [
	{ id: 'plain', label: 'Constituencies' },
	{ id: 'density', label: 'People per km² (estimate)', field: 'density' },
	{ id: 'population', label: 'Population (estimate)', field: 'population' },
	{ id: 'area', label: 'Area, km²', field: 'areaKm2' },
];

// Place-name labels by rank, and the zoom at which each rank appears.
const RANK_ZOOM = { 1: 1.5, 2: 2.6, 3: 4.2 };

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function el(tag, attributes = {}, children = []) {
	const node = document.createElement(tag);
	for (const [key, value] of Object.entries(attributes)) {
		if (value === undefined || value === null || value === false) continue;
		if (key === 'class') node.className = value;
		else if (key === 'text') node.textContent = value;
		else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
		else node.setAttribute(key, value === true ? '' : value);
	}
	for (const child of [].concat(children)) if (child) node.append(child);
	return node;
}

function svg(tag, attributes = {}) {
	const node = document.createElementNS(SVG_NS, tag);
	for (const [key, value] of Object.entries(attributes)) {
		if (key === 'class') node.setAttribute('class', value);
		else if (key === 'text') node.textContent = value;
		else node.setAttribute(key, value);
	}
	return node;
}

const normalise = (text) => text.toLowerCase().normalize('NFD').replace(/[̀-ͯ']/g, '');

function ordinal(n) {
	const s = ['th', 'st', 'nd', 'rd'];
	const v = n % 100;
	return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

class NairobiMap extends HTMLElement {
	connectedCallback() {
		if (this.built) return;
		this.built = true;
		this.classList.add('nairobi-map');
		this.buildChrome();
		fetch(DATA_URL)
			.then((response) => {
				if (!response.ok) throw new Error(`HTTP ${response.status}`);
				return response.json();
			})
			.then((data) => this.start(data))
			.catch((error) => {
				console.warn('nairobi-map:', error);
				this.status.textContent = 'The map could not load. Everything on it is listed in the tables below.';
				this.status.hidden = false;
			});
	}

	// ---------------------------------------------------------------- chrome

	buildChrome() {
		this.searchInput = el('input', {
			type: 'search', placeholder: 'Find a place: Kilimani, KICC, Giraffe Centre…',
			'aria-label': 'Find a constituency, neighbourhood or landmark', autocomplete: 'off',
			'aria-controls': 'map-suggestions', 'aria-expanded': 'false',
		});
		this.suggestions = el('ul', { class: 'map-suggestions', id: 'map-suggestions', hidden: true });
		this.shadeSelect = el('select', { 'aria-label': 'Shade the constituencies by' },
			SHADES.map((shade) => el('option', { value: shade.id, text: shade.label })));

		const zoomButton = (label, text, handler) =>
			el('button', { type: 'button', class: 'map-zoom', 'aria-label': label, title: label, text, onclick: handler });

		this.locateButton = el('button', {
			type: 'button', class: 'map-zoom map-locate', title: 'Show where I am',
			'aria-label': 'Show where I am', text: '◎', onclick: () => this.locate(),
		});

		this.chips = el('div', { class: 'map-chips', role: 'group', 'aria-label': 'Show on the map' });

		this.canvas = svg('svg', {
			class: 'map-canvas', role: 'img', tabindex: '0',
			'aria-label': 'Map of Nairobi. Drag to move, scroll or pinch to zoom, arrow keys to pan.',
		});
		this.tooltip = el('div', { class: 'map-tooltip', hidden: true, 'aria-hidden': 'true' });
		this.status = el('p', { class: 'map-status', role: 'status', text: 'Loading the map…' });
		this.legend = el('div', { class: 'map-legend', hidden: true });
		this.panel = el('aside', { class: 'map-panel', 'aria-live': 'polite', 'aria-label': 'Details' });

		this.append(
			el('div', { class: 'map-controls' }, [
				el('div', { class: 'map-search' }, [this.searchInput, this.suggestions]),
				el('div', { class: 'map-toggles' }, [
					el('label', { class: 'map-shade' }, [el('span', { text: 'Shade by' }), this.shadeSelect]),
					el('div', { class: 'map-zooms' }, [
						zoomButton('Zoom in', '+', () => this.zoomBy(1.8)),
						zoomButton('Zoom out', '−', () => this.zoomBy(1 / 1.8)),
						zoomButton('Show all of Nairobi', '⤢', () => this.flyTo(this.full)),
						this.locateButton,
					]),
				]),
				this.chips,
			]),
			el('div', { class: 'map-body' }, [
				el('div', { class: 'map-stage' }, [this.canvas, this.tooltip, this.status, this.legend]),
				this.panel,
			]),
		);

		this.searchInput.addEventListener('input', () => this.suggest());
		this.searchInput.addEventListener('keydown', (event) => {
			if (event.key === 'Enter') {
				event.preventDefault();
				const first = this.suggestions.querySelector('button');
				if (first) first.click();
			} else if (event.key === 'ArrowDown') {
				event.preventDefault();
				this.suggestions.querySelector('button')?.focus();
			} else if (event.key === 'Escape') {
				this.closeSuggestions();
			}
		});
		this.suggestions.addEventListener('keydown', (event) => {
			const buttons = [...this.suggestions.querySelectorAll('button')];
			const index = buttons.indexOf(document.activeElement);
			if (event.key === 'ArrowDown') { event.preventDefault(); buttons[Math.min(index + 1, buttons.length - 1)]?.focus(); }
			if (event.key === 'ArrowUp') {
				event.preventDefault();
				if (index <= 0) this.searchInput.focus(); else buttons[index - 1].focus();
			}
			if (event.key === 'Escape') { this.closeSuggestions(); this.searchInput.focus(); }
		});
		document.addEventListener('click', (event) => {
			if (!this.contains(event.target) || !event.target.closest('.map-search')) this.closeSuggestions();
		});
		this.shadeSelect.addEventListener('change', () => this.shade(this.shadeSelect.value));
	}

	// ------------------------------------------------------------------ data

	start(data) {
		this.data = data;
		const [x, y, w, h] = data.meta.viewBox;
		this.full = { x, y, w, h };
		this.box = { ...this.full };
		this.off = new Set();
		this.byId = new Map();

		data.constituencies.forEach((c) => this.byId.set(`constituency/${c.id}`, { kind: 'constituency', item: c }));
		data.landmarks.forEach((l) => this.byId.set(`place/${l.id}`, { kind: 'landmark', item: l }));

		this.densityRank = new Map(
			[...data.constituencies].sort((a, b) => b.density - a.density).map((c, i) => [c.id, i + 1]));

		this.draw();
		this.buildChips();
		this.bindCanvas();
		this.status.hidden = true;

		new ResizeObserver(() => this.apply()).observe(this.canvas);
		window.addEventListener('hashchange', () => this.fromHash());
		this.shade('plain');
		this.apply();
		if (!this.fromHash()) this.showOverview();
	}

	draw() {
		const { data } = this;
		const layer = (name) => this.canvas.appendChild(svg('g', { class: `layer layer-${name}` }));

		layer('outline').appendChild(svg('path', { class: 'county', d: data.outline }));

		const shapes = layer('constituencies');
		this.shapes = new Map();
		for (const c of data.constituencies) {
			const path = svg('path', { class: 'shape constituency-shape', d: c.path, 'data-id': c.id });
			path.addEventListener('pointerenter', () => this.hover(c.name));
			path.addEventListener('pointerleave', () => this.hover(null));
			shapes.appendChild(path);
			this.shapes.set(c.id, path);
		}

		// A constituency's name is drawn only when its shape is wide enough on
		// screen to hold it, so the small central ones do not pile up at the
		// full view and appear one by one as you zoom in.
		const areaLabels = layer('constituency-labels');
		this.areaLabels = data.constituencies.map((c) => {
			const node = svg('text', {
				class: 'map-label constituency-label', x: c.label[0], y: c.label[1], text: c.name,
			});
			areaLabels.appendChild(node);
			return { node, width: this.shapes.get(c.id).getBBox().width, chars: c.name.length };
		});

		const places = layer('places');
		this.placeLabels = data.neighbourhoods.map((n) => {
			const text = svg('text', { class: `map-label place-label rank-${n.rank}`, x: n.x, y: n.y, text: n.name });
			places.appendChild(text);
			return { node: text, rank: n.rank };
		});

		const pins = layer('landmarks');
		this.pins = new Map();
		for (const l of data.landmarks) {
			const group = svg('g', {
				class: `landmark cat-${l.category}`, transform: `translate(${l.x} ${l.y})`, 'data-id': l.id,
			});
			group.append(svg('circle', { class: 'pin-halo', r: '1' }), svg('circle', { class: 'pin', r: '1' }));
			group.addEventListener('pointerenter', () => this.hover(l.name));
			group.addEventListener('pointerleave', () => this.hover(null));
			pins.appendChild(group);
			this.pins.set(l.id, group);
		}

		this.you = svg('g', { class: 'you', hidden: '' });
		this.you.append(svg('circle', { class: 'you-halo', r: '1' }), svg('circle', { class: 'you-dot', r: '1' }));
		layer('you').appendChild(this.you);
	}

	buildChips() {
		const counts = {};
		for (const l of this.data.landmarks) counts[l.category] = (counts[l.category] || 0) + 1;

		const chip = (key, label, className) => {
			const button = el('button', {
				type: 'button', class: `chip ${className}`, 'aria-pressed': 'true', 'data-key': key,
			}, [el('span', { class: 'chip-dot', 'aria-hidden': 'true' }), document.createTextNode(label)]);
			button.addEventListener('click', () => {
				const on = button.getAttribute('aria-pressed') !== 'true';
				button.setAttribute('aria-pressed', String(on));
				if (on) this.off.delete(key); else this.off.add(key);
				this.applyVisibility();
			});
			return button;
		};

		this.chips.append(chip('places', 'Place names', 'chip-places'));
		for (const [key, label] of Object.entries(this.data.categories)) {
			if (counts[key]) this.chips.append(chip(key, `${label} (${counts[key]})`, `cat-${key}`));
		}
	}

	// ------------------------------------------------------------ view state

	scale() {
		const rect = this.canvas.getBoundingClientRect();
		if (!rect.width || !rect.height) return 1;
		return Math.max(this.box.w / rect.width, this.box.h / rect.height);
	}

	clamp(box) {
		const minW = this.full.w / MAX_ZOOM;
		const maxW = this.full.w * 1.25;
		let { x, y, w, h } = box;
		const ratio = h / w;
		if (w < minW) { x += (w - minW) / 2; y += (h - minW * ratio) / 2; w = minW; h = minW * ratio; }
		if (w > maxW) { x += (w - maxW) / 2; y += (h - maxW * ratio) / 2; w = maxW; h = maxW * ratio; }
		const cx = Math.min(Math.max(x + w / 2, this.full.x), this.full.x + this.full.w);
		const cy = Math.min(Math.max(y + h / 2, this.full.y), this.full.y + this.full.h);
		return { x: cx - w / 2, y: cy - h / 2, w, h };
	}

	apply() {
		if (!this.box) return;
		const { x, y, w, h } = this.box;
		if (![x, y, w, h].every(Number.isFinite)) return;
		this.canvas.setAttribute('viewBox', `${x} ${y} ${w} ${h}`);
		const unit = this.scale();
		this.style.setProperty('--map-unit', unit.toFixed(3));
		const r = 5.5 * unit;
		for (const circle of this.canvas.querySelectorAll('.pin')) circle.setAttribute('r', r);
		for (const circle of this.canvas.querySelectorAll('.pin-halo')) circle.setAttribute('r', r * 2.4);
		this.you.querySelector('.you-dot').setAttribute('r', 6 * unit);
		this.you.querySelector('.you-halo').setAttribute('r', 16 * unit);
		this.zoom = this.full.w / w;
		this.classList.toggle('is-zoomed', this.zoom > 1.6);
		this.applyVisibility();
	}

	applyVisibility() {
		const unit = this.scale();
		for (const label of this.areaLabels) {
			label.node.classList.toggle('is-hidden', label.width / unit < label.chars * 7.5);
		}

		const showPlaces = !this.off.has('places');
		for (const { node, rank } of this.placeLabels) {
			node.classList.toggle('is-hidden', !showPlaces || this.zoom < RANK_ZOOM[rank]);
		}
		for (const l of this.data.landmarks) {
			this.pins.get(l.id).classList.toggle('is-hidden', this.off.has(l.category));
		}
	}

	setBox(box) {
		this.box = this.clamp(box);
		this.apply();
	}

	flyTo(target) {
		const to = this.clamp(this.fit(target));
		if (reducedMotion()) return this.setBox(to);
		const from = { ...this.box };
		const start = performance.now();
		cancelAnimationFrame(this.frame);
		const step = (now) => {
			const t = Math.min(1, (now - start) / EASE_MS);
			const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
			this.box = {
				x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e,
				w: from.w + (to.w - from.w) * e, h: from.h + (to.h - from.h) * e,
			};
			this.apply();
			if (t < 1) this.frame = requestAnimationFrame(step);
		};
		this.frame = requestAnimationFrame(step);
	}

	// Grow a target box to the canvas's aspect ratio, so fly-to never squashes.
	fit(box) {
		const rect = this.canvas.getBoundingClientRect();
		const aspect = rect.width && rect.height ? rect.height / rect.width : this.full.h / this.full.w;
		let { x, y, w, h } = box;
		if (h / w > aspect) { const nw = h / aspect; x -= (nw - w) / 2; w = nw; }
		else { const nh = w * aspect; y -= (nh - h) / 2; h = nh; }
		return { x, y, w, h };
	}

	zoomBy(factor, cx, cy) {
		const { x, y, w, h } = this.box;
		const px = cx ?? x + w / 2;
		const py = cy ?? y + h / 2;
		const nw = w / factor;
		const nh = h / factor;
		this.setBox({ x: px - (px - x) * (nw / w), y: py - (py - y) * (nh / h), w: nw, h: nh });
	}

	toUnits(clientX, clientY) {
		const matrix = this.canvas.getScreenCTM();
		if (!matrix) return null;
		const point = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
		return { x: point.x, y: point.y };
	}

	// ----------------------------------------------------------- interaction

	bindCanvas() {
		const pointers = new Map();
		let drag = null;
		let pinch = null;

		this.canvas.addEventListener('pointerdown', (event) => {
			this.canvas.setPointerCapture(event.pointerId);
			pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
			if (pointers.size === 1) {
				drag = { x: event.clientX, y: event.clientY, box: { ...this.box }, moved: false, target: event.target };
			} else if (pointers.size === 2) {
				const [a, b] = [...pointers.values()];
				pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y), box: { ...this.box } };
				drag = null;
			}
		});

		this.canvas.addEventListener('pointermove', (event) => {
			if (!pointers.has(event.pointerId)) {
				this.moveTooltip(event);
				return;
			}
			pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
			if (pinch && pointers.size === 2) {
				const [a, b] = [...pointers.values()];
				const distance = Math.hypot(a.x - b.x, a.y - b.y);
				const mid = this.toUnits((a.x + b.x) / 2, (a.y + b.y) / 2);
				this.box = { ...pinch.box };
				if (mid) this.zoomBy(distance / pinch.distance, mid.x, mid.y);
				return;
			}
			if (!drag) return;
			const dx = event.clientX - drag.x;
			const dy = event.clientY - drag.y;
			if (!drag.moved && Math.hypot(dx, dy) < DRAG_SLOP_PX) return;
			drag.moved = true;
			this.hover(null);
			const unit = this.scale();
			this.setBox({ ...drag.box, x: drag.box.x - dx * unit, y: drag.box.y - dy * unit });
		});

		const end = (event) => {
			pointers.delete(event.pointerId);
			if (pointers.size < 2) pinch = null;
			if (drag && !drag.moved && event.type === 'pointerup') this.clickAt(drag.target);
			drag = null;
		};
		this.canvas.addEventListener('pointerup', end);
		this.canvas.addEventListener('pointercancel', end);

		this.canvas.addEventListener('wheel', (event) => {
			event.preventDefault();
			const point = this.toUnits(event.clientX, event.clientY);
			const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
			if (point) this.zoomBy(Math.exp(-delta * 0.0018), point.x, point.y);
		}, { passive: false });

		this.canvas.addEventListener('dblclick', (event) => {
			const point = this.toUnits(event.clientX, event.clientY);
			if (point) this.zoomBy(event.shiftKey ? 1 / 2 : 2, point.x, point.y);
		});

		this.canvas.addEventListener('keydown', (event) => {
			const step = this.box.w * 0.15;
			const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
			if (moves[event.key]) {
				event.preventDefault();
				this.setBox({ ...this.box, x: this.box.x + moves[event.key][0], y: this.box.y + moves[event.key][1] });
			} else if (event.key === '+' || event.key === '=') {
				this.zoomBy(1.5);
			} else if (event.key === '-' || event.key === '_') {
				this.zoomBy(1 / 1.5);
			} else if (event.key === '0') {
				this.flyTo(this.full);
			}
		});

		this.canvas.addEventListener('pointerleave', () => this.hover(null));
	}

	clickAt(target) {
		const pin = target.closest?.('.landmark');
		if (pin) return this.select(`place/${pin.dataset.id}`, { fly: false });
		const shape = target.closest?.('.constituency-shape');
		if (shape) return this.select(`constituency/${shape.dataset.id}`, { fly: false });
		this.clearSelection();
	}

	hover(name) {
		this.hovering = name;
		this.tooltip.hidden = !name;
		if (name) this.tooltip.textContent = name;
	}

	moveTooltip(event) {
		if (!this.hovering || event.pointerType === 'touch') return;
		const rect = this.canvas.getBoundingClientRect();
		this.tooltip.style.left = `${event.clientX - rect.left + 14}px`;
		this.tooltip.style.top = `${event.clientY - rect.top + 14}px`;
	}

	// ------------------------------------------------------------- selection

	select(key, { fly = true, updateHash = true } = {}) {
		const found = this.byId.get(key);
		if (!found) return false;
		this.clearMarks();
		this.selected = key;

		if (found.kind === 'constituency') {
			const c = found.item;
			this.shapes.get(c.id).classList.add('is-selected');
			if (fly) this.flyTo(this.boundsOf(this.shapes.get(c.id), 0.12));
			this.showConstituency(c);
		} else {
			const l = found.item;
			this.pins.get(l.id).classList.add('is-selected');
			if (this.off.has(l.category)) {
				this.off.delete(l.category);
				this.chips.querySelector(`[data-key="${l.category}"]`)?.setAttribute('aria-pressed', 'true');
				this.applyVisibility();
			}
			if (fly) this.flyTo(this.around(l.x, l.y, this.full.w / 9));
			this.showLandmark(l);
		}

		if (updateHash) history.replaceState(null, '', `#${key}`);
		return true;
	}

	clearMarks() {
		this.canvas.querySelectorAll('.is-selected').forEach((node) => node.classList.remove('is-selected'));
	}

	clearSelection() {
		if (!this.selected) return;
		this.clearMarks();
		this.selected = null;
		history.replaceState(null, '', location.pathname + location.search);
		this.showOverview();
	}

	fromHash() {
		const key = decodeURIComponent(location.hash.slice(1));
		if (!key) return false;
		if (key === this.selected) return true;
		return this.select(key, { updateHash: false });
	}

	boundsOf(node, pad = 0) {
		const b = node.getBBox();
		return { x: b.x - b.width * pad, y: b.y - b.height * pad, w: b.width * (1 + 2 * pad), h: b.height * (1 + 2 * pad) };
	}

	around(x, y, w) {
		return { x: x - w / 2, y: y - w / 2, w, h: w };
	}

	// ----------------------------------------------------------------- panel

	fillPanel(children) {
		this.panel.replaceChildren(...children.filter(Boolean));
	}

	closeButton() {
		return el('button', {
			type: 'button', class: 'map-panel-close', 'aria-label': 'Close and show all of Nairobi', text: '×',
			onclick: () => { this.clearSelection(); this.flyTo(this.full); },
		});
	}

	constituencyButton(c, current = false) {
		return el('button', {
			type: 'button', class: `constituency${current ? ' is-current' : ''}`, text: c.name,
			onclick: () => this.select(`constituency/${c.id}`),
		});
	}

	facts(rows) {
		return el('dl', { class: 'map-facts' }, rows.flatMap(([term, value]) => [
			el('dt', { text: term }), el('dd', { text: value }),
		]));
	}

	showOverview() {
		const { meta, constituencies } = this.data;
		this.fillPanel([
			el('p', { class: 'map-eyebrow', text: 'Nairobi City County' }),
			el('h2', { text: 'Nairobi' }),
			this.facts([
				['People (2019 census)', meta.population.toLocaleString('en-KE')],
				['Area', `${Math.round(meta.countyAreaKm2).toLocaleString('en-KE')} km²`],
				['Constituencies', String(constituencies.length)],
				['Landmarks on the map', String(this.data.landmarks.length)],
			]),
			el('p', { class: 'map-hint', text: 'Tap a constituency or a pin, or search above. Pinch or scroll to zoom.' }),
			el('h3', { text: 'Constituencies' }),
			el('div', { class: 'map-list' },
				[...constituencies].sort((a, b) => a.name.localeCompare(b.name)).map((c) => this.constituencyButton(c))),
		]);
	}

	showConstituency(c) {
		const places = this.data.neighbourhoods.filter((n) => n.constituency === c.id).map((n) => n.name);
		const landmarks = this.data.landmarks.filter((l) => l.constituency === c.id);
		const rank = this.densityRank.get(c.id);
		const total = this.data.constituencies.length;

		this.fillPanel([
			this.closeButton(),
			el('p', { class: 'map-eyebrow', text: 'Constituency' }),
			el('h2', { text: c.name }),
			this.facts([
				['People (estimate)', `about ${c.population.toLocaleString('en-KE')}`],
				['People per km²', `about ${c.density.toLocaleString('en-KE')}`],
				['Area', `${c.areaKm2.toLocaleString('en-KE')} km²`],
				['Crowding', rank === 1 ? `The most densely populated of ${total}` : `${ordinal(rank)} most densely populated of ${total}`],
			]),
			el('p', { class: 'map-note' }, [
				'Estimated: the 2019 census total for Nairobi, shared out using WorldPop\'s population model. ',
				el('a', { href: '#map-method', text: 'How and why' }),
			]),
			places.length ? el('h3', { text: 'Neighbourhoods' }) : null,
			places.length ? el('p', { class: 'map-places', text: places.join(', ') }) : null,
			landmarks.length ? el('h3', { text: 'On the map here' }) : null,
			landmarks.length ? el('div', { class: 'map-list' }, landmarks.map((l) => el('button', {
				type: 'button', class: `constituency landmark-link cat-${l.category}`, text: l.name,
				onclick: () => this.select(`place/${l.id}`),
			}))) : null,
		]);
	}

	showLandmark(l) {
		const home = this.data.constituencies.find((c) => c.id === l.constituency);
		const coords = `${l.lat},${l.lon}`;
		this.fillPanel([
			this.closeButton(),
			el('p', { class: `map-eyebrow cat-${l.category}`, text: this.data.categories[l.category] }),
			el('h2', { text: l.name }),
			el('p', { text: l.description }),
			home ? el('p', { class: 'map-in' }, ['In ', this.constituencyButton(home), ' constituency']) : null,
			el('p', { class: 'map-links' }, [
				el('a', {
					href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(coords)}`,
					target: '_blank', rel: 'noopener', text: 'Open in Google Maps',
				}),
				el('a', {
					href: `https://www.openstreetmap.org/?mlat=${l.lat}&mlon=${l.lon}#map=17/${l.lat}/${l.lon}`,
					target: '_blank', rel: 'noopener', text: 'OpenStreetMap',
				}),
			]),
		]);
	}

	// ----------------------------------------------------------------- shade

	shade(id) {
		const shade = SHADES.find((s) => s.id === id) || SHADES[0];
		this.shadeSelect.value = shade.id;
		this.classList.toggle('shade-plain', !shade.field);
		this.classList.toggle('shade-quantile', Boolean(shade.field));

		if (!shade.field) {
			this.shapes.forEach((path) => path.removeAttribute('data-bucket'));
			this.legend.hidden = true;
			return;
		}

		const values = this.data.constituencies.map((c) => c[shade.field]).sort((a, b) => a - b);
		const cut = (q) => values[Math.min(values.length - 1, Math.floor(q * values.length))];
		const edges = [cut(0.2), cut(0.4), cut(0.6), cut(0.8)];
		const bucket = (v) => 1 + edges.filter((edge) => v >= edge).length;

		for (const c of this.data.constituencies) this.shapes.get(c.id).setAttribute('data-bucket', bucket(c[shade.field]));

		const n = (v) => v.toLocaleString('en-KE');
		const ranges = [
			`under ${n(edges[0])}`,
			`${n(edges[0])} to ${n(edges[1])}`,
			`${n(edges[1])} to ${n(edges[2])}`,
			`${n(edges[2])} to ${n(edges[3])}`,
			`${n(edges[3])} and over`,
		];
		this.legend.replaceChildren(
			el('p', { class: 'map-legend-title', text: shade.label }),
			...ranges.map((text, i) => el('p', { class: 'map-legend-row' }, [
				el('span', { class: `swatch swatch-${i + 1}`, 'aria-hidden': 'true' }),
				document.createTextNode(text),
			])),
		);
		this.legend.hidden = false;
	}

	// ---------------------------------------------------------------- search

	suggest() {
		const query = normalise(this.searchInput.value.trim());
		if (query.length < 2) return this.closeSuggestions();

		const results = [];
		for (const c of this.data.constituencies) {
			if (normalise(c.name).includes(query)) results.push({ label: c.name, kind: 'Constituency', go: () => this.select(`constituency/${c.id}`) });
		}
		for (const n of this.data.neighbourhoods) {
			if (normalise(n.name).includes(query)) {
				results.push({
					label: n.name, kind: 'Neighbourhood',
					go: () => {
						this.select(`constituency/${n.constituency}`, { fly: false });
						this.flyTo(this.around(n.x, n.y, this.full.w / 7));
					},
				});
			}
		}
		for (const l of this.data.landmarks) {
			if (normalise(l.name).includes(query) || normalise(this.data.categories[l.category]).includes(query)) {
				results.push({ label: l.name, kind: this.data.categories[l.category], go: () => this.select(`place/${l.id}`) });
			}
		}

		results.sort((a, b) => (normalise(a.label).startsWith(query) ? 0 : 1) - (normalise(b.label).startsWith(query) ? 0 : 1));
		this.suggestions.replaceChildren(...(results.length ? results.slice(0, 8).map((r) => el('li', {}, [
			el('button', {
				type: 'button', class: 'map-suggestion',
				onclick: () => { r.go(); this.searchInput.value = r.label; this.closeSuggestions(); },
			}, [el('span', { text: r.label }), el('small', { text: r.kind })]),
		])) : [el('li', { class: 'map-suggestion-empty', text: 'Nothing on the map by that name.' })]));
		this.suggestions.hidden = false;
		this.searchInput.setAttribute('aria-expanded', 'true');
	}

	closeSuggestions() {
		this.suggestions.hidden = true;
		this.searchInput.setAttribute('aria-expanded', 'false');
	}

	// ---------------------------------------------------------------- locate

	locate() {
		if (!navigator.geolocation) {
			this.flash('Your browser cannot share its location.');
			return;
		}
		this.locateButton.disabled = true;
		navigator.geolocation.getCurrentPosition((position) => {
			this.locateButton.disabled = false;
			const { latitude, longitude } = position.coords;
			const { origin, unitsPerDegLon, unitsPerDegLat } = this.data.meta;
			const x = (longitude - origin[0]) * unitsPerDegLon;
			const y = -(latitude - origin[1]) * unitsPerDegLat;
			const inside = [...this.shapes.entries()].find(([, path]) => path.isPointInFill?.(new DOMPoint(x, y)));
			if (!inside) {
				this.you.setAttribute('hidden', '');
				this.flash('You appear to be outside Nairobi City County.');
				return;
			}
			this.you.setAttribute('transform', `translate(${x} ${y})`);
			this.you.removeAttribute('hidden');
			this.select(`constituency/${inside[0]}`, { fly: false });
			this.flyTo(this.around(x, y, this.full.w / 8));
		}, () => {
			this.locateButton.disabled = false;
			this.flash('Location was not shared, so the map cannot show where you are.');
		}, { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 });
	}

	flash(message) {
		this.status.textContent = message;
		this.status.hidden = false;
		clearTimeout(this.flashTimer);
		this.flashTimer = setTimeout(() => { this.status.hidden = true; }, 5000);
	}
}

customElements.define('nairobi-map', NairobiMap);
