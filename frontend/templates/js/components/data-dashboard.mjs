// The data dashboard at /data.
//
// Thirty series and about thirteen hundred points, drawn as hand-made SVG.
// No charting library, for the same reasons as the two maps: the CSP allows no
// external scripts, and a chart library would be a bigger download than every
// number it draws.
//
// The design problem here is not drawing lines, it is honesty. Very little
// economic data exists for Nairobi alone, so every series carries a scope and
// the scope is on screen at all times:
//
//   Nairobi  Nairobi City County itself. Six census counts and five years of
//            output per person, and that is nearly all there is.
//   Kenya    National. Sixty-odd years of it, labelled as Kenya and never as
//            Nairobi.
//   Derived  Arithmetic on two sourced series, and nothing more.
//
// A reader must never be able to mistake Kenya's GDP for Nairobi's, which is why
// the badge is on every tile and in every detail view rather than in a legend
// somebody scrolls past.
//
// The phone layout
// ----------------
// Ported from All About Accra, where it was redesigned from measurements at
// 393x851, like /map and /flights. The page
// was eighteen screens tall and the dashboard ten of them. Thirty cards each
// gave their chart 72 pixels of height and no axis, so the only number a phone
// could read off a chart was its latest one. The intro said "drag across it on
// a phone to read a single year", and that was not true: a tap did nothing,
// and a drag showed the year only while the finger stayed on the screen,
// covering it - lifting to look snapped it back. Inflation, whose peak is
// the whole story of that chart, was six screens down with no way to jump.
//
// So: two compact tiles to a row as the overview, a sheet per series as the
// place to read one - with axes, a reading that stays when the finger lifts,
// and the extremes named - and a row that jumps between the four groups.

import { element } from '/js/utils/format.mjs';

const DATA_URL = '/api/indicators.json';

const SCOPE_LABEL = { nairobi: 'Nairobi', kenya: 'Kenya', derived: 'Derived' };

const FILTERS = [
	['all', 'Everything'],
	['nairobi', 'Nairobi only'],
	['kenya', 'Kenya'],
	['derived', 'Derived'],
];

// Room around the plot, so a point sitting on the minimum or the maximum is
// not half a dot in the card's margin.
const PAD = 4;

const compact = new Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1 });
const plain = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 });

/** Format for a headline: compact for big counts, plain for rates. */
function readable(value, unit) {
	if (value === null || value === undefined) return '—';
	if (unit === 'US$') return `$${compact.format(value)}`;
	if (unit === 'KSh') return `KSh ${compact.format(value)}`;
	if (unit === 'people' || unit === 'per km²') return compact.format(value);
	if (unit === '%' || unit.startsWith('%')) return `${plain.format(value)}%`;
	return plain.format(value);
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Not Array#at, which iOS Safari only gained in 15.4.
const lastOf = (list) => list[list.length - 1];

/** The y range a series is drawn against - shared by tile and detail. */
function yRange(entry) {
	const values = entry.points.map((p) => p.value);
	const rawMin = Math.min(...values);
	const rawMax = Math.max(...values);
	// Include zero for counts, so a rise is not exaggerated by a cropped
	// axis. Rates that go negative keep their own range.
	const min = rawMin > 0 && entry.unit !== '% a year' ? 0 : rawMin;
	return { min, max: rawMax, span: rawMax - min || 1 };
}

const NS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs = {}) {
	const node = document.createElementNS(NS, tag);
	for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
	return node;
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
		this.byId = new Map(this.data.series.map((s) => [s.id, s]));
		this.build();

		if (this.applyHash()) this.scrollIntoView({ block: 'start' });
		window.addEventListener('hashchange', () => this.applyHash());
		window.addEventListener('popstate', (event) => {
			if (this.dialog.open && !(event.state && event.state.dataSeries)) this.closeSeries({ fromHistory: true });
		});
	}

	disconnectedCallback() {
		this.observer?.disconnect();
		this.spy?.disconnect();
		this.detailObserver?.disconnect();
	}

	build() {
		const { meta, series } = this.data;

		const nairobi = series.find((s) => s.id === 'nairobi-population');
		const growth = nairobi
			? (lastOf(nairobi.points).value / nairobi.points[0].value).toFixed(1)
			: null;

		// The scope chips are the key as well as the filter: each one in its
		// badge colour, with what that scope means written under the row. That
		// replaced three paragraphs of scope notes, which on a phone was two
		// hundred pixels between the caveat and the first chart.
		this.filters = element('div', { class: 'dash-filters', role: 'group',
			'aria-label': 'Show figures covering' },
			FILTERS.map(([id, label]) => element('button', {
				type: 'button',
				class: `dash-chip${id === 'all' ? ' is-on' : ''}`,
				'data-scope': id,
				'aria-pressed': String(id === 'all'),
				onclick: () => this.setScope(id),
			}, [
				id === 'all' ? null : element('span', { class: `dash-chip-dot scope-${id}`, 'aria-hidden': 'true' }),
				element('span', { text: label }),
			]))
		);
		this.scopeNote = element('p', { class: 'dash-scope-line', 'aria-live': 'polite' });

		// Jump between the four groups. Sticky on a phone, and it follows the
		// scroll, because the economy starts four screens down even compacted.
		this.jumps = element('nav', { class: 'dash-jumps no-print', 'aria-label': 'Jump to a group of figures' });

		this.groups = element('div', { class: 'dash-groups' });
		this.dialog = this.buildDialog();

		this.replaceChildren(
			// The headline, because it is the one thing on this page that is
			// unambiguously about Nairobi and it is remarkable.
			nairobi ? element('div', { class: 'dash-headline' }, [
				element('div', { class: 'dash-headline-figure' }, [
					element('strong', { text: `${growth}×` }),
					element('span', { text: `more people in Nairobi than in ${nairobi.points[0].year}` }),
				]),
				element('p', { class: 'dash-headline-detail', text:
					`${plain.format(nairobi.points[0].value)} at the ${nairobi.points[0].year} census, ` +
					`${plain.format(lastOf(nairobi.points).value)} at the ${lastOf(nairobi.points).year} one.` }),
			]) : null,
			this.filters,
			this.scopeNote,
			this.jumps,
			this.groups,
			this.dialog
		);

		this.renderScopeNote();
		this.renderGroups();
	}

	renderScopeNote() {
		const { scopes } = this.data.meta;
		if (this.scope === 'all') {
			this.scopeNote.replaceChildren(
				document.createTextNode('Every chart is stamped with what it covers: '),
				...['nairobi', 'kenya', 'derived'].flatMap((id, i) => [
					i ? document.createTextNode(i === 2 ? ' or ' : ', ') : null,
					element('span', { class: `dash-badge scope-${id}`, text: SCOPE_LABEL[id] }),
				].filter(Boolean)),
				document.createTextNode('.')
			);
		} else {
			this.scopeNote.replaceChildren(
				element('span', { class: `dash-badge scope-${this.scope}`, text: SCOPE_LABEL[this.scope] }),
				document.createTextNode(' ' + scopes[this.scope])
			);
		}
	}

	setScope(scope) {
		this.scope = scope;
		for (const button of this.filters.querySelectorAll('.dash-chip')) {
			const on = button.dataset.scope === scope;
			button.classList.toggle('is-on', on);
			button.setAttribute('aria-pressed', String(on));
		}
		this.renderScopeNote();
		this.renderGroups();
	}

	shown() {
		const { series } = this.data;
		return this.scope === 'all' ? series : series.filter((s) => s.scope === this.scope);
	}

	// The group titles are h2 and the card titles h3, which is what the document
	// outline needs: the page's own h1 is the title, and jumping straight to h3
	// would skip a level for anyone navigating by heading. The visual weight
	// comes from the classes, not from the tags.
	renderGroups() {
		const { meta } = this.data;
		const shown = this.shown();

		// A fresh observer each time: every card is thrown away and rebuilt on
		// a filter change, and the old ones would otherwise be observed for
		// the life of the page.
		this.observer?.disconnect();
		this.observer = new ResizeObserver((entries) => {
			for (const entry of entries) entry.target.redraw?.();
		});

		const present = Object.entries(meta.groups)
			.map(([id, title]) => ({ id, title, items: shown.filter((s) => s.group === id) }))
			.filter((g) => g.items.length);

		this.groups.replaceChildren(
			...present.map(({ id, title, items }) => element('section', {
				class: 'dash-group', id: `group-${id}`, 'data-group': id,
			}, [
				element('h2', { class: 'dash-group-title', text: title }),
				element('div', { class: 'dash-grid' }, items.map((s) => this.card(s))),
			]))
		);

		if (!present.length) {
			this.groups.replaceChildren(element('p', { class: 'tool-note', text: 'Nothing in that scope.' }));
		}

		this.renderJumps(present);
	}

	renderJumps(present) {
		this.jumpLinks = present.map(({ id, title, items }) => element('a', {
			class: 'dash-jump',
			href: `#group-${id}`,
			'data-group': id,
			onclick: (event) => {
				// The hash belongs to the series sheet, so a jump scrolls without
				// writing one - and lands below the sticky header and this row.
				event.preventDefault();
				const target = this.querySelector(`#group-${id}`);
				if (target) target.scrollIntoView({ block: 'start', behavior: reducedMotion() ? 'auto' : 'smooth' });
				this.markJump(id);
			},
		}, [element('span', { text: title }), element('span', { class: 'dash-jump-count', text: String(items.length) })]));
		this.jumps.replaceChildren(...this.jumpLinks);
		this.jumps.hidden = present.length < 2;

		// Follow the scroll. The line it watches sits just under the sticky
		// header and this row, which is where a reader's eye is.
		this.spy?.disconnect();
		if (!('IntersectionObserver' in window)) return;
		this.spy = new IntersectionObserver((entries) => {
			for (const entry of entries) if (entry.isIntersecting) this.markJump(entry.target.dataset.group);
		}, { rootMargin: '-130px 0px -65% 0px' });
		this.groups.querySelectorAll('.dash-group').forEach((g) => this.spy.observe(g));
		if (present[0]) this.markJump(present[0].id);
	}

	markJump(id) {
		for (const link of this.jumpLinks || []) {
			const on = link.dataset.group === id;
			link.classList.toggle('is-on', on);
			if (on) {
				link.setAttribute('aria-current', 'true');
				// Keep the current group in view in a row that scrolls sideways,
				// without touching the page's own scroll position.
				const row = this.jumps;
				const left = link.offsetLeft - row.clientWidth / 2 + link.offsetWidth / 2;
				row.scrollTo({ left: Math.max(0, left), behavior: reducedMotion() ? 'auto' : 'smooth' });
			} else link.removeAttribute('aria-current');
		}
	}

	// -------------------------------------------------------------------- card

	card(entry) {
		const points = entry.points;
		const first = points[0];
		const last = lastOf(points);

		const readout = element('p', { class: 'dash-readout' }, [
			element('strong', { class: 'dash-readout-value', text: readable(last.value, entry.unit) }),
			element('span', { class: 'dash-readout-year', text: String(last.year) }),
		]);

		const chart = this.chart(entry, readout);
		// Where the chart sits above the stretched button (a device that can
		// hover), a click on it still has to open the series.
		chart.addEventListener('click', () => this.openSeries(entry.id));

		// The title is the button, stretched over the whole card - a heading
		// that opens the series, rather than a clickable box with no name.
		const open = element('button', {
			type: 'button',
			class: 'dash-open',
			'aria-label': `${entry.label}, ${SCOPE_LABEL[entry.scope]}. ` +
				`${readable(last.value, entry.unit)} in ${last.year}. Open the chart.`,
			onclick: () => this.openSeries(entry.id),
			text: entry.label,
		});

		return element('article', { class: `dash-card scope-${entry.scope}`, 'data-series': entry.id }, [
			element('header', { class: 'dash-card-head' }, [
				element('span', { class: `dash-badge scope-${entry.scope}`, text: SCOPE_LABEL[entry.scope] }),
				element('h3', { class: 'dash-card-title' }, [open]),
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
	 * One series, as a small SVG line with a hover readout.
	 *
	 * Drawn in the element's own CSS pixels, with the viewBox set to match and
	 * redrawn on resize. The obvious alternative - a fixed 0..100 box stretched
	 * by CSS with preserveAspectRatio="none" - needs no resize handling and is
	 * wrong: stretching a square box into a wide one turns every circle into a
	 * flat ellipse. `vector-effect: non-scaling-stroke` rescues the stroke
	 * width but not the geometry, so the six census dots and the hover marker
	 * all come out as lozenges. It is the same trap as sizing anything on /map
	 * in raw user units, and it hides the same way: the paths look right.
	 *
	 * Hover is for a mouse. On a phone the tile opens the series instead, where
	 * the reading stays put when the finger lifts.
	 */
	chart(entry, readout) {
		const points = entry.points;
		const years = points.map((p) => p.year);
		const minYear = Math.min(...years);
		const maxYear = Math.max(...years);
		const { min: minValue, span } = yRange(entry);

		const svg = svgEl('svg', { class: 'dash-chart', 'aria-hidden': 'true' });

		// A filled area under counts reads as accumulation; rates get a line
		// alone, because the area under an inflation rate means nothing.
		const isCount = ['people', 'US$', 'KSh', 'per km²'].includes(entry.unit);

		// A zero line, where zero is inside the range - it matters for growth
		// and inflation, which go negative.
		const zero = minValue < 0 ? svgEl('line', { class: 'dash-zero' }) : null;
		const area = isCount ? svgEl('path', { class: 'dash-area' }) : null;
		const line = svgEl('path', { class: 'dash-line' });
		// Census and sparse series are a handful of observations, not a
		// continuous record, so the observations themselves are drawn.
		const dots = entry.shape === 'line' ? [] : points.map(() => svgEl('circle', { class: 'dash-point', r: 2.5 }));
		const rule = svgEl('line', { class: 'dash-rule' });
		const marker = svgEl('circle', { class: 'dash-marker', r: 3.5 });

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

			const path = points.map((p) => `${x(p.year).toFixed(1)} ${y(p.value).toFixed(1)}`).join('L');
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
			if (reading) place(reading);
		};

		wrap.redraw = draw;
		this.observer.observe(wrap);

		// A mouse hovering reads the nearest year into the card's own headline.
		// Touch is ignored here on purpose - see the comment above.
		const show = (event) => {
			if (event.pointerType !== 'mouse' || !width) return;
			const box = svg.getBoundingClientRect();
			const ratio = (event.clientX - box.left - PAD) / (box.width - PAD * 2);
			const year = minYear + ratio * (maxYear - minYear);
			reading = points.reduce((a, b) => (Math.abs(b.year - year) < Math.abs(a.year - year) ? b : a));
			place(reading);
			wrap.classList.add('is-reading');
			readout.querySelector('.dash-readout-value').textContent = readable(reading.value, entry.unit);
			readout.querySelector('.dash-readout-year').textContent = String(reading.year);
		};
		const rest = (event) => {
			if (event.pointerType !== 'mouse') return;
			reading = null;
			wrap.classList.remove('is-reading');
			readout.querySelector('.dash-readout-value').textContent = readable(lastOf(points).value, entry.unit);
			readout.querySelector('.dash-readout-year').textContent = String(lastOf(points).year);
		};
		wrap.addEventListener('pointermove', show);
		wrap.addEventListener('pointerleave', rest);

		return wrap;
	}

	// ------------------------------------------------------------------ detail

	buildDialog() {
		this.detailTitle = element('h2', { class: 'dash-detail-title', id: 'dash-detail-title' });
		this.detailBadge = element('span', { class: 'dash-badge' });
		this.detailValue = element('strong', { class: 'dash-detail-value' });
		this.detailYear = element('span', { class: 'dash-detail-year' });
		this.detailHint = element('span', { class: 'dash-detail-hint' });
		this.detailChart = element('div', { class: 'dash-detail-chart' });
		this.detailStats = element('div', { class: 'dash-stats', role: 'group', 'aria-label': 'Jump to a year' });
		this.detailMeta = element('div', { class: 'dash-detail-meta' });
		this.prevButton = element('button', { type: 'button', class: 'dash-step', onclick: () => this.step(-1) });
		this.nextButton = element('button', { type: 'button', class: 'dash-step', onclick: () => this.step(1) });

		const close = element('button', {
			type: 'button', class: 'dash-detail-close', 'aria-label': 'Close', onclick: () => this.closeSeries(),
		}, [this.closeIcon()]);

		const dialog = element('dialog', {
			class: 'dash-detail',
			'aria-labelledby': 'dash-detail-title',
			// A click on the backdrop lands on the dialog element itself.
			onclick: (event) => { if (event.target === this.dialog) this.closeSeries(); },
			oncancel: (event) => { event.preventDefault(); this.closeSeries(); },
		}, [
			element('div', { class: 'dash-detail-inner' }, [
				element('div', { class: 'dash-detail-head' }, [
					element('div', {}, [this.detailBadge, this.detailTitle]),
					close,
				]),
				element('p', { class: 'dash-detail-readout', 'aria-live': 'polite' }, [
					this.detailValue, this.detailYear, this.detailHint,
				]),
				this.detailChart,
				this.detailStats,
				this.detailMeta,
				element('div', { class: 'dash-detail-nav' }, [this.prevButton, this.nextButton]),
			]),
		]);
		return dialog;
	}

	closeIcon() {
		const svg = svgEl('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true', class: 'map-icon' });
		svg.append(svgEl('path', { d: 'M6 6l12 12M18 6 6 18' }));
		return svg;
	}

	/**
	 * Open one series in the sheet.
	 *
	 * Pushed onto history with its own hash, so Android's back button closes the
	 * sheet rather than leaving the page, and a link to /data#series=<id> -
	 * from one of the data guides, say - opens straight onto the chart.
	 */
	openSeries(id, { push = true } = {}) {
		const entry = this.byId.get(id);
		if (!entry) return;
		this.current = entry;
		this.returnFocus = this.querySelector(`.dash-card[data-series="${id}"] .dash-open`) || document.activeElement;
		this.renderDetail(entry);

		if (!this.dialog.open) {
			if (typeof this.dialog.showModal === 'function') this.dialog.showModal();
			else this.dialog.setAttribute('open', '');
			document.documentElement.classList.add('dash-detail-open');
		}

		const hash = '#series=' + id;
		if (push && !(history.state && history.state.dataSeries)) {
			history.pushState({ ...(history.state || {}), dataSeries: true }, '', hash);
		} else if (location.hash !== hash) {
			history.replaceState(history.state, '', hash);
		}
		this.scrubber.focus({ preventScroll: true });
	}

	closeSeries({ fromHistory = false } = {}) {
		if (!this.dialog.open) return;
		// Unwind our own history entry, so back does not reopen it.
		if (!fromHistory && history.state && history.state.dataSeries) {
			history.back();
			return;
		}
		this.dialog.close();
		document.documentElement.classList.remove('dash-detail-open');
		this.detailObserver?.disconnect();
		if (/^#series=/.test(location.hash)) {
			history.replaceState(history.state, '', location.pathname + location.search);
		}
		const card = this.current && this.querySelector(`.dash-card[data-series="${this.current.id}"] .dash-open`);
		(card || this.returnFocus)?.focus?.({ preventScroll: false });
	}

	step(delta) {
		const list = this.shown();
		const at = list.findIndex((s) => s.id === this.current.id);
		const next = list[(at + delta + list.length) % list.length];
		this.openSeries(next.id, { push: false });
	}

	applyHash() {
		const match = /^#series=([a-z0-9-]+)$/.exec(location.hash);
		if (!match) {
			if (this.dialog?.open) this.closeSeries({ fromHistory: true });
			return false;
		}
		if (!this.byId.has(match[1])) return false;
		// Arrived by a link or by back/forward - the entry already exists.
		this.openSeries(match[1], { push: false });
		return true;
	}

	renderDetail(entry) {
		const points = entry.points;
		const first = points[0];
		const last = lastOf(points);
		const low = points.reduce((a, b) => (b.value < a.value ? b : a));
		const high = points.reduce((a, b) => (b.value > a.value ? b : a));

		this.detailBadge.className = `dash-badge scope-${entry.scope}`;
		this.detailBadge.textContent = SCOPE_LABEL[entry.scope];
		this.detailTitle.textContent = entry.label;
		this.dialog.className = `dash-detail scope-${entry.scope}`;

		const list = this.shown();
		const at = list.findIndex((s) => s.id === entry.id);
		const prev = list[(at - 1 + list.length) % list.length];
		const next = list[(at + 1) % list.length];
		this.prevButton.textContent = '← ' + prev.label;
		this.nextButton.textContent = next.label + ' →';
		this.prevButton.hidden = this.nextButton.hidden = list.length < 2;

		// The extremes are named because several series only say anything at
		// them: inflation at 46% in 1993, growth at -8% in 1961.
		// A point that is two of these at once - Nairobi's first census is also
		// its lowest - is one button with both names, not two identical ones.
		const stats = [];
		for (const [label, point] of [['First', first], ['Lowest', low], ['Highest', high], ['Latest', last]]) {
			const same = stats.find((s) => s[1] === point);
			if (same) same[0] += ' and ' + label.toLowerCase();
			else stats.push([label, point]);
		}
		this.detailStats.replaceChildren(...stats.map(([label, point]) => element('button', {
			type: 'button',
			class: 'dash-stat',
			'aria-label': `${label}: ${readable(point.value, entry.unit)} in ${point.year}`,
			onclick: () => this.setReading(point),
		}, [
			element('span', { class: 'dash-stat-label' }, [
				document.createTextNode(label + ' · '),
				element('span', { class: 'dash-stat-year', text: String(point.year) }),
			]),
			element('strong', { text: readable(point.value, entry.unit) }),
		])));

		this.detailMeta.replaceChildren(...[
			element('p', { class: 'dash-card-foot', text: `${entry.unit} · ${first.year}–${last.year} · ${points.length} points` }),
			entry.note ? element('p', { class: 'dash-card-note', text: entry.note }) : null,
			element('p', { class: 'dash-card-source', text: 'Source: ' + entry.source }),
		].filter(Boolean));

		this.buildDetailChart(entry);
		this.setReading(last, { latest: true });
	}

	/**
	 * The chart you actually read: full width, with axes, and a reading that
	 * stays put.
	 *
	 * touch-action: pan-y, so a vertical swipe still scrolls the sheet while a
	 * sideways drag scrubs the years. A tap sets the year; lifting the finger
	 * keeps it - which is the whole of what the old card got wrong on a phone.
	 * It is also a slider for a keyboard: arrows step a year, Home and End go
	 * to the ends.
	 */
	buildDetailChart(entry) {
		const points = entry.points;
		const years = points.map((p) => p.year);
		const minYear = Math.min(...years);
		const maxYear = Math.max(...years);
		const { min, max, span } = yRange(entry);
		const isCount = ['people', 'US$', 'KSh', 'per km²'].includes(entry.unit);

		const svg = svgEl('svg', { class: 'dash-detail-svg', 'aria-hidden': 'true' });
		const grid = svgEl('g', { class: 'dash-grid-lines' });
		const area = isCount ? svgEl('path', { class: 'dash-area' }) : null;
		const line = svgEl('path', { class: 'dash-line' });
		const dots = entry.shape === 'line' ? [] : points.map(() => svgEl('circle', { class: 'dash-point', r: 3.5 }));
		const rule = svgEl('line', { class: 'dash-rule' });
		const marker = svgEl('circle', { class: 'dash-marker', r: 5.5 });
		const labels = svgEl('g', { class: 'dash-axis' });
		svg.append(...[grid, area, line, ...dots, rule, marker, labels].filter(Boolean));

		this.scrubber = element('div', {
			class: 'dash-scrub',
			tabindex: '0',
			role: 'slider',
			'aria-label': `${entry.label}, by year`,
			'aria-valuemin': String(minYear),
			'aria-valuemax': String(maxYear),
		}, [svg]);
		this.detailChart.replaceChildren(this.scrubber);

		// Left room for the y labels, bottom room for the years.
		const m = { left: 6, right: 10, top: 12, bottom: 22 };
		const geom = { width: 0, height: 0 };
		const x = (year) => m.left + ((year - minYear) / (maxYear - minYear || 1)) * (geom.width - m.left - m.right);
		const y = (value) => m.top + (1 - (value - min) / span) * (geom.height - m.top - m.bottom);

		const draw = () => {
			const box = this.scrubber.getBoundingClientRect();
			if (!box.width || !box.height) return;
			geom.width = box.width;
			geom.height = box.height;
			svg.setAttribute('viewBox', `0 0 ${box.width.toFixed(1)} ${box.height.toFixed(1)}`);

			const path = points.map((p) => `${x(p.year).toFixed(1)} ${y(p.value).toFixed(1)}`).join('L');
			line.setAttribute('d', `M${path}`);
			if (area) {
				const base = y(min).toFixed(1);
				area.setAttribute('d', `M${path}L${x(maxYear).toFixed(1)} ${base}L${x(minYear).toFixed(1)} ${base}Z`);
			}
			dots.forEach((dot, i) => {
				dot.setAttribute('cx', x(points[i].year).toFixed(1));
				dot.setAttribute('cy', y(points[i].value).toFixed(1));
			});

			// Gridlines and labels at the top and bottom of the range, and at
			// zero where zero is inside it. Labels sit on the plot, left-aligned
			// above their line, so the chart keeps its full width.
			// Inflation's zero sits 13px above its -8.4% floor, so a level too
			// close to one already kept is dropped - the top first, then zero,
			// because zero is the line a rate is read against.
			const levels = [];
			for (const v of [max, ...(min < 0 && max > 0 ? [0] : []), min]) {
				if (levels.every((kept) => Math.abs(y(kept) - y(v)) >= 16)) levels.push(v);
			}
			grid.replaceChildren(...levels.map((v) => svgEl('line', {
				class: v === 0 && min < 0 ? 'dash-zero' : 'dash-gridline',
				x1: m.left, x2: (geom.width - m.right).toFixed(1),
				y1: y(v).toFixed(1), y2: y(v).toFixed(1),
			})));
			labels.replaceChildren(
				...levels.map((v) => {
					const t = svgEl('text', { x: m.left + 2, y: (y(v) - 4).toFixed(1), class: 'dash-axis-y' });
					t.textContent = readable(v, entry.unit);
					return t;
				}),
				...[minYear, maxYear].map((yr, i) => {
					const t = svgEl('text', {
						x: x(yr).toFixed(1), y: (geom.height - 5).toFixed(1),
						class: 'dash-axis-x', 'text-anchor': i ? 'end' : 'start',
					});
					t.textContent = String(yr);
					return t;
				})
			);
			rule.setAttribute('y1', m.top);
			rule.setAttribute('y2', (geom.height - m.bottom).toFixed(1));
			if (this.reading) this.placeMarker();
		};

		this.placeMarker = () => {
			const p = this.reading;
			marker.setAttribute('cx', x(p.year).toFixed(1));
			marker.setAttribute('cy', y(p.value).toFixed(1));
			rule.setAttribute('x1', x(p.year).toFixed(1));
			rule.setAttribute('x2', x(p.year).toFixed(1));
		};

		const nearest = (clientX) => {
			const box = this.scrubber.getBoundingClientRect();
			const ratio = (clientX - box.left - m.left) / (box.width - m.left - m.right);
			const year = minYear + ratio * (maxYear - minYear);
			return points.reduce((a, b) => (Math.abs(b.year - year) < Math.abs(a.year - year) ? b : a));
		};

		let down = false;
		this.scrubber.addEventListener('pointerdown', (event) => {
			down = true;
			try { this.scrubber.setPointerCapture(event.pointerId); } catch { /* fine without */ }
			this.setReading(nearest(event.clientX));
		});
		this.scrubber.addEventListener('pointermove', (event) => {
			if (down || event.pointerType === 'mouse') this.setReading(nearest(event.clientX));
		});
		const lift = () => { down = false; };
		this.scrubber.addEventListener('pointerup', lift);
		this.scrubber.addEventListener('pointercancel', lift);

		this.scrubber.addEventListener('keydown', (event) => {
			const at = points.indexOf(this.reading);
			let next = null;
			if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = points[Math.max(0, at - 1)];
			if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = points[Math.min(points.length - 1, at + 1)];
			if (event.key === 'Home') next = points[0];
			if (event.key === 'End') next = lastOf(points);
			if (next) { event.preventDefault(); this.setReading(next); }
		});

		this.detailObserver?.disconnect();
		this.detailObserver = new ResizeObserver(draw);
		this.detailObserver.observe(this.scrubber);
		this.detailDraw = draw;
	}

	setReading(point, { latest = false } = {}) {
		const entry = this.current;
		this.reading = point;
		this.detailValue.textContent = readable(point.value, entry.unit);
		this.detailYear.textContent = String(point.year);
		const isLatest = point === lastOf(entry.points);
		this.detailHint.textContent = latest || isLatest ? 'Latest. Tap or drag across the chart for any year.' : '';
		this.scrubber.setAttribute('aria-valuenow', String(point.year));
		this.scrubber.setAttribute('aria-valuetext', `${point.year}: ${readable(point.value, entry.unit)}`);
		for (const stat of this.detailStats.querySelectorAll('.dash-stat')) {
			stat.classList.toggle('is-on', stat.querySelector('.dash-stat-year').textContent === String(point.year)
				&& stat.querySelector('strong').textContent === readable(point.value, entry.unit));
		}
		if (this.placeMarker && this.scrubber.getBoundingClientRect().width) this.placeMarker();
		this.scrubber.classList.add('is-reading');
	}
}

customElements.define('data-dashboard', DataDashboard);
