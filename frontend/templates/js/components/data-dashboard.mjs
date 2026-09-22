// The data dashboard at /data.
//
// Thirty series and about thirteen hundred points, drawn as hand-made SVG.
// No charting library, for the same reasons as the two maps: the CSP allows no
// external scripts, and a chart library would be a bigger download than every
// number it draws.
//
// The design problem here is not drawing lines, it is honesty. Almost no
// economic time series exists for Accra alone, so every series carries a scope
// and the scope is on screen at all times:
//
//   Accra    Greater Accra itself. Six census counts, and that is nearly all
//            there is.
//   Ghana    National. Sixty-odd years of it, labelled as Ghana and never as
//            Accra.
//   Derived  Arithmetic on two sourced series, and nothing more.
//
// A reader must never be able to mistake Ghana's GDP for Accra's, which is why
// the badge is on every card rather than in a legend somebody scrolls past.

import { element } from '/js/utils/format.mjs';

const DATA_URL = '/api/indicators.json';

const SCOPE_LABEL = { accra: 'Accra', ghana: 'Ghana', derived: 'Derived' };

const FILTERS = [
	['all', 'Everything'],
	['accra', 'Accra only'],
	['ghana', 'Ghana'],
	['derived', 'Derived'],
];

// Room around the plot, so a point sitting on the minimum or the maximum is
// not half a dot in the card's margin.
const PAD = 4;

const compact = new Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1 });
const plain = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 });

/** Format for a card headline: compact for big counts, plain for rates. */
function readable(value, unit) {
	if (value === null || value === undefined) return '—';
	if (unit === 'US$') return `$${compact.format(value)}`;
	if (unit === 'people' || unit === 'per km²') return compact.format(value);
	if (unit === '%' || unit.startsWith('%')) return `${plain.format(value)}%`;
	return plain.format(value);
}

class DataDashboard extends HTMLElement {
	async connectedCallback() {
		if (this.rendered) return;
		this.rendered = true;

		this.replaceChildren(element('p', { class: 'tool-note', text: 'Loading the figures…' }));

		try {
			const response = await fetch(DATA_URL);
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			this.data = await response.json();
		} catch (error) {
			this.replaceChildren(element('p', { class: 'tool-note', text:
				'The charts could not load. Every figure is summarised in the table below.' }));
			console.warn('Data dashboard:', error);
			return;
		}

		this.scope = 'all';
		this.build();
	}

	disconnectedCallback() {
		this.observer?.disconnect();
	}

	build() {
		const { meta, series } = this.data;

		const accra = series.find((s) => s.id === 'accra-population');
		const growth = accra
			? (accra.points.at(-1).value / accra.points[0].value).toFixed(1)
			: null;

		this.filters = element('div', { class: 'dash-filters', role: 'group',
			'aria-label': 'Filter by what the figures cover' },
			FILTERS.map(([id, label]) => element('button', {
				type: 'button',
				class: `dash-chip${id === 'all' ? ' is-on' : ''}`,
				'aria-pressed': String(id === 'all'),
				text: label,
				onclick: () => this.setScope(id),
			}))
		);

		this.groups = element('div', { class: 'dash-groups' });

		this.replaceChildren(
			// The headline, because it is the one thing on this page that is
			// unambiguously about Accra and it is remarkable.
			accra ? element('div', { class: 'dash-headline' }, [
				element('div', { class: 'dash-headline-figure' }, [
					element('strong', { text: `${growth}×` }),
					element('span', { text: 'more people in Greater Accra than in 1960' }),
				]),
				element('p', { class: 'dash-headline-detail', text:
					`${plain.format(accra.points[0].value)} at the 1960 census, ` +
					`${plain.format(accra.points.at(-1).value)} at the 2021 one.` }),
			]) : null,

			element('div', { class: 'dash-scopes' },
				Object.entries(meta.scopes).map(([id, description]) =>
					element('p', { class: 'dash-scope-note' }, [
						element('span', { class: `dash-badge scope-${id}`, text: SCOPE_LABEL[id] }),
						document.createTextNode(` ${description}`),
					])
				)
			),

			this.filters,
			this.groups
		);

		this.renderGroups();
	}

	setScope(scope) {
		this.scope = scope;
		const label = Object.fromEntries(FILTERS)[scope];
		for (const button of this.filters.querySelectorAll('.dash-chip')) {
			const on = button.textContent === label;
			button.classList.toggle('is-on', on);
			button.setAttribute('aria-pressed', String(on));
		}
		this.renderGroups();
	}

	// The group titles are h2 and the card titles h3, which is what the document
	// outline needs: the page's own h1 is the title, and jumping straight to h3
	// would skip a level for anyone navigating by heading. The visual weight
	// comes from the classes, not from the tags.
	renderGroups() {
		const { meta, series } = this.data;
		const shown = this.scope === 'all' ? series : series.filter((s) => s.scope === this.scope);

		// A fresh observer each time: every card is thrown away and rebuilt on
		// a filter change, and the old ones would otherwise be observed for
		// the life of the page.
		this.observer?.disconnect();
		this.observer = new ResizeObserver((entries) => {
			for (const entry of entries) entry.target.redraw?.();
		});

		this.groups.replaceChildren(
			...Object.entries(meta.groups).flatMap(([id, title]) => {
				const inGroup = shown.filter((s) => s.group === id);
				if (!inGroup.length) return [];

				return [element('section', { class: 'dash-group' }, [
					element('h2', { class: 'dash-group-title', id: `group-${id}`, text: title }),
					element('div', { class: 'dash-grid' }, inGroup.map((s) => this.card(s))),
				])];
			})
		);

		if (!this.groups.children.length) {
			this.groups.replaceChildren(element('p', { class: 'tool-note',
				text: 'Nothing in that scope.' }));
		}
	}

	// -------------------------------------------------------------------- card

	card(entry) {
		const points = entry.points;
		const first = points[0];
		const last = points.at(-1);

		const readout = element('p', { class: 'dash-readout' }, [
			element('strong', { class: 'dash-readout-value', text: readable(last.value, entry.unit) }),
			element('span', { class: 'dash-readout-year', text: String(last.year) }),
		]);

		const chart = this.chart(entry, readout);

		return element('article', { class: `dash-card scope-${entry.scope}` }, [
			element('header', { class: 'dash-card-head' }, [
				element('span', { class: `dash-badge scope-${entry.scope}`, text: SCOPE_LABEL[entry.scope] }),
				element('h3', { class: 'dash-card-title', text: entry.label }),
			]),
			readout,
			chart,
			element('p', { class: 'dash-card-foot' }, [
				element('span', { text: `${entry.unit} · ${first.year}–${last.year} · ${points.length} points` }),
			]),
			entry.note ? element('p', { class: 'dash-card-note', text: entry.note }) : null,
			element('p', { class: 'dash-card-source', text: entry.source }),
		]);
	}

	/**
	 * One series, as an SVG line with a hover readout.
	 *
	 * Drawn in the element's own CSS pixels, with the viewBox set to match and
	 * redrawn on resize. The obvious alternative - a fixed 0..100 box stretched
	 * by CSS with preserveAspectRatio="none" - needs no resize handling and is
	 * wrong: stretching a square box into a wide one turns every circle into a
	 * flat ellipse. `vector-effect: non-scaling-stroke` rescues the stroke
	 * width but not the geometry, so the six census dots and the hover marker
	 * all come out as lozenges. It is the same trap as sizing anything on /map
	 * in raw user units, and it hides the same way: the paths look right.
	 */
	chart(entry, readout) {
		const ns = 'http://www.w3.org/2000/svg';
		const points = entry.points;
		const years = points.map((p) => p.year);
		const values = points.map((p) => p.value);

		const minYear = Math.min(...years);
		const maxYear = Math.max(...years);
		// Include zero for counts, so a rise is not exaggerated by a cropped
		// axis. Rates that go negative keep their own range.
		const rawMin = Math.min(...values);
		const rawMax = Math.max(...values);
		const minValue = rawMin > 0 && entry.unit !== '% a year' ? 0 : rawMin;
		const span = rawMax - minValue || 1;

		const make = (tag, attrs = {}) => {
			const node = document.createElementNS(ns, tag);
			for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
			return node;
		};

		const svg = make('svg', { class: 'dash-chart', role: 'img' });
		svg.setAttribute('aria-label',
			`${entry.label}, ${entry.unit}. ${readable(points[0].value, entry.unit)} in ` +
			`${points[0].year} to ${readable(points.at(-1).value, entry.unit)} in ` +
			`${points.at(-1).year}.`);

		// A filled area under counts reads as accumulation; rates get a line
		// alone, because the area under an inflation rate means nothing.
		const isCount = ['people', 'US$', 'per km²'].includes(entry.unit);

		// A zero line, where zero is inside the range - it matters for growth
		// and inflation, which go negative.
		const zero = minValue < 0 ? make('line', { class: 'dash-zero' }) : null;
		const area = isCount ? make('path', { class: 'dash-area' }) : null;
		const line = make('path', { class: 'dash-line' });
		// Census and sparse series are a handful of observations, not a
		// continuous record, so the observations themselves are drawn.
		const dots = entry.shape === 'line'
			? []
			: points.map(() => make('circle', { class: 'dash-point', r: 2.5 }));
		const rule = make('line', { class: 'dash-rule' });
		const marker = make('circle', { class: 'dash-marker', r: 3.5 });

		svg.append(...[zero, area, line, ...dots, rule, marker].filter(Boolean));

		const wrap = element('div', { class: 'dash-chart-wrap' }, [svg]);

		let width = 0;
		let height = 0;
		let reading = null;

		const x = (year) => PAD + ((year - minYear) / (maxYear - minYear || 1)) * (width - PAD * 2);
		const y = (value) => PAD + (1 - (value - minValue) / span) * (height - PAD * 2);

		const place = (point) => {
			marker.setAttribute('cx', x(point.year).toFixed(1));
			marker.setAttribute('cy', y(point.value).toFixed(1));
			rule.setAttribute('x1', x(point.year).toFixed(1));
			rule.setAttribute('x2', x(point.year).toFixed(1));
		};

		const draw = () => {
			const box = wrap.getBoundingClientRect();
			if (!box.width || !box.height) return;
			width = box.width;
			height = box.height;
			svg.setAttribute('viewBox', `0 0 ${width.toFixed(1)} ${height.toFixed(1)}`);

			const path = points
				.map((p) => `${x(p.year).toFixed(1)} ${y(p.value).toFixed(1)}`)
				.join('L');
			line.setAttribute('d', `M${path}`);

			if (area) {
				area.setAttribute('d', `M${path}`
					+ `L${x(maxYear).toFixed(1)} ${height.toFixed(1)}`
					+ `L${x(minYear).toFixed(1)} ${height.toFixed(1)}Z`);
			}
			if (zero) {
				zero.setAttribute('x1', PAD);
				zero.setAttribute('x2', (width - PAD).toFixed(1));
				zero.setAttribute('y1', y(0).toFixed(1));
				zero.setAttribute('y2', y(0).toFixed(1));
			}
			dots.forEach((dot, index) => {
				dot.setAttribute('cx', x(points[index].year).toFixed(1));
				dot.setAttribute('cy', y(points[index].value).toFixed(1));
			});
			rule.setAttribute('y1', 0);
			rule.setAttribute('y2', height.toFixed(1));

			// Somebody resizing mid-hover keeps the dot on the year they were
			// reading, rather than having it jump to the corner.
			if (reading) place(reading);
		};

		wrap.redraw = draw;
		this.observer.observe(wrap);

		// Hover reads the nearest year out into the card's own headline, so
		// there is no floating tooltip to position or clip.
		const show = (event) => {
			if (!width) return;
			const box = svg.getBoundingClientRect();
			const ratio = (event.clientX - box.left - PAD) / (box.width - PAD * 2);
			const year = minYear + ratio * (maxYear - minYear);
			reading = points.reduce((a, b) =>
				Math.abs(b.year - year) < Math.abs(a.year - year) ? b : a);

			place(reading);
			wrap.classList.add('is-reading');
			readout.querySelector('.dash-readout-value').textContent = readable(reading.value, entry.unit);
			readout.querySelector('.dash-readout-year').textContent = String(reading.year);
		};

		const rest = () => {
			reading = null;
			wrap.classList.remove('is-reading');
			readout.querySelector('.dash-readout-value').textContent = readable(points.at(-1).value, entry.unit);
			readout.querySelector('.dash-readout-year').textContent = String(points.at(-1).year);
		};

		wrap.addEventListener('pointermove', show);
		wrap.addEventListener('pointerleave', rest);

		return wrap;
	}
}

customElements.define('data-dashboard', DataDashboard);
