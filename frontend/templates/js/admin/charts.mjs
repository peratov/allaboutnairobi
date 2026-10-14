// The admin's charts: hand-drawn SVG and plain HTML, no library - the same
// reasons as /data and the two maps, and the same lesson. A chart is drawn in
// its element's own CSS pixels with the viewBox to match, and redrawn by a
// ResizeObserver; a stretched fixed viewBox turns every dot into an ellipse.

import { element } from '/js/utils/format.mjs';

const SVG = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}) => {
	const node = document.createElementNS(SVG, tag);
	for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
	return node;
};

export const fmt = {
	int: (n) => Math.round(Number(n) || 0).toLocaleString('en-GB'),
	compact: (n) => {
		const v = Number(n) || 0;
		if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
		if (Math.abs(v) >= 1e4) return `${Math.round(v / 1e3)}k`;
		if (Math.abs(v) >= 1e3) return `${(v / 1e3).toFixed(1)}k`;
		return String(Math.round(v));
	},
	pct: (n, digits = 1) => `${((Number(n) || 0) * 100).toFixed(digits)}%`,
	pos: (n) => (Number(n) || 0).toFixed(1),
	secs: (n) => {
		const s = Math.round(Number(n) || 0);
		return s >= 60 ? `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s` : `${s}s`;
	},
	day: (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
};

/** A tiny trend line for a headline number: shape only, no axes. */
function sparkline(values) {
	const nums = values.map(Number).filter(Number.isFinite);
	if (nums.length < 2) return null;
	const max = Math.max(...nums, 1);
	const min = Math.min(...nums, 0);
	const pts = nums.map((v, i) => `${((i / (nums.length - 1)) * 100).toFixed(2)},${(26 - ((v - min) / (max - min || 1)) * 24).toFixed(2)}`);
	// Lines only, so stretching the box cannot turn anything into an ellipse.
	const root = svg('svg', { class: 'kpi-spark', viewBox: '0 0 100 28', preserveAspectRatio: 'none', 'aria-hidden': 'true' });
	root.append(svg('polyline', { points: `0,28 ${pts.join(' ')} 100,28`, class: 'kpi-spark-area' }), svg('polyline', { points: pts.join(' '), class: 'kpi-spark-line', 'vector-effect': 'non-scaling-stroke' }));
	return root;
}

/** A headline number, with how it moved against the period before. */
export function kpi(label, value, { previous, format = fmt.int, invert = false, note, spark, live = false, href } = {}) {
	let delta = null;
	if (previous !== undefined && previous !== null) {
		const change = previous ? (value - previous) / previous : value ? 1 : 0;
		const better = invert ? change < 0 : change > 0;
		const flat = Math.abs(change) < 0.005;
		delta = element('span', {
			class: `kpi-delta${flat ? '' : better ? ' is-up' : ' is-down'}`,
			title: `Previous period: ${format(previous)}`,
			text: flat ? 'no change' : `${change > 0 ? '▲' : '▼'} ${Math.abs(change * 100).toFixed(change && Math.abs(change) < 0.1 ? 1 : 0)}%`,
		});
	}
	return element(href ? 'a' : 'div', { class: `kpi${live ? ' is-live' : ''}`, ...(href ? { href } : {}) }, [
		element('span', { class: 'kpi-label' }, [live ? element('span', { class: 'aa-live-dot', 'aria-hidden': 'true' }) : null, label]),
		element('strong', { class: 'kpi-value', text: format(value), ...(live ? { 'data-live-users': '' } : {}) }),
		element('span', { class: 'kpi-foot' }, [delta, note ? element('span', { class: 'kpi-note', text: note }) : null]),
		spark ? sparkline(spark) : null,
	]);
}

/**
 * A line chart over dates. `series` is [{ name, values: [numbers], tone }]
 * sharing `dates`. Hover or touch reads a day; the label says what it shows
 * for a screen reader.
 *
 * Two series an order of magnitude apart - clicks and impressions - would put
 * the smaller one flat on the floor, so then each line gets its own scale, the
 * axis is dropped rather than lying about one of them, and the key says so.
 */
export function lineChart({ dates, series, format = fmt.int, height = 200, label }) {
	const peaks = series.map((s) => Math.max(1, ...s.values.map(Number)));
	const ownScales = series.length > 1 && Math.max(...peaks) / Math.min(...peaks) > 4;
	const wrap = element('figure', { class: 'chart' });
	const readout = element('figcaption', { class: 'chart-readout', 'aria-live': 'off' });
	const legend = element('div', { class: 'chart-legend' }, [
		...series.map((s) => element('span', { class: `chart-key is-${s.tone || 'a'}`, text: s.name })),
		ownScales ? element('span', { class: 'chart-scale-note', text: 'each line on its own scale' }) : null,
	]);
	const box = element('div', { class: 'chart-box', style: `height:${height}px` });
	wrap.append(legend, box, readout);
	const totalOf = (s) => s.values.reduce((a, b) => a + (Number(b) || 0), 0);
	box.setAttribute('role', 'img');
	box.setAttribute('aria-label', label || `${series.map((s) => `${s.name}: ${format(totalOf(s))} in total`).join('; ')}, ${dates.length} days.`);

	const say = (i) => {
		if (i === null) {
			readout.textContent = `${fmt.day(dates[0])} – ${fmt.day(dates[dates.length - 1])}`;
			return;
		}
		readout.textContent = `${fmt.day(dates[i])}: ${series.map((s) => `${s.name} ${format(s.values[i])}`).join(' · ')}`;
	};

	function draw() {
		const width = Math.round(box.clientWidth);
		if (!width || !dates.length) return;
		const pad = { top: 10, right: 8, bottom: 22, left: ownScales ? 8 : 40 };
		const plotW = width - pad.left - pad.right;
		const plotH = height - pad.top - pad.bottom;
		const max = Math.max(1, ...series.flatMap((s) => s.values.map(Number)));
		const x = (i) => pad.left + (dates.length === 1 ? plotW / 2 : (i / (dates.length - 1)) * plotW);
		const y = (v, n = 0) => pad.top + plotH - (Number(v) / (ownScales ? peaks[n] : max)) * plotH;
		const root = svg('svg', { viewBox: `0 0 ${width} ${height}`, width, height, 'aria-hidden': 'true' });

		for (const frac of [0, 0.5, 1]) {
			const yy = pad.top + plotH - frac * plotH;
			root.append(svg('line', { x1: pad.left, x2: width - pad.right, y1: yy, y2: yy, class: 'chart-grid' }));
			if (ownScales) continue;
			const t = svg('text', { x: pad.left - 6, y: yy + 4, 'text-anchor': 'end', class: 'chart-axis' });
			t.textContent = fmt.compact(max * frac);
			root.append(t);
		}
		// Evenly spaced dates, and the last one only if it is not crowding the
		// one before it.
		const last = dates.length - 1;
		const step = Math.max(1, Math.ceil(last / Math.max(1, Math.floor(plotW / 72))));
		const marks = [];
		for (let i = 0; i <= last; i += step) marks.push(i);
		if (marks[marks.length - 1] !== last) {
			if (last - marks[marks.length - 1] < step * 0.6) marks.pop();
			marks.push(last);
		}
		for (const i of marks) {
			const t = svg('text', { x: x(i), y: height - 6, 'text-anchor': i === 0 ? 'start' : i === last ? 'end' : 'middle', class: 'chart-axis' });
			t.textContent = fmt.day(dates[i]);
			root.append(t);
		}
		series.forEach((s, n) => {
			const pts = s.values.map((v, i) => `${x(i).toFixed(1)},${y(v, n).toFixed(1)}`);
			const base = pad.top + plotH;
			if (n === 0) root.append(svg('path', { d: `M${x(0)},${base} L${pts.join(' L')} L${x(dates.length - 1)},${base} Z`, class: `chart-area is-${s.tone || 'a'}` }));
			root.append(svg('polyline', { points: pts.join(' '), class: `chart-line is-${s.tone || 'a'}` }));
		});
		const cursor = svg('line', { y1: pad.top, y2: pad.top + plotH, class: 'chart-cursor', visibility: 'hidden' });
		const dots = series.map((s) => svg('circle', { r: 4, class: `chart-dot is-${s.tone || 'a'}`, visibility: 'hidden' }));
		root.append(cursor, ...dots);
		const hit = svg('rect', { x: pad.left, y: 0, width: plotW, height, fill: 'transparent' });
		const at = (clientX) => {
			const r = root.getBoundingClientRect();
			const i = Math.max(0, Math.min(dates.length - 1, Math.round(((clientX - r.left - pad.left) / plotW) * (dates.length - 1))));
			cursor.setAttribute('x1', x(i));
			cursor.setAttribute('x2', x(i));
			cursor.setAttribute('visibility', 'visible');
			dots.forEach((d, n) => { d.setAttribute('cx', x(i)); d.setAttribute('cy', y(series[n].values[i], n)); d.setAttribute('visibility', 'visible'); });
			say(i);
		};
		hit.addEventListener('pointermove', (e) => at(e.clientX));
		hit.addEventListener('pointerdown', (e) => at(e.clientX));
		hit.addEventListener('pointerleave', () => { cursor.setAttribute('visibility', 'hidden'); dots.forEach((d) => d.setAttribute('visibility', 'hidden')); say(null); });
		root.append(hit);
		box.replaceChildren(root);
	}
	say(null);
	new ResizeObserver(draw).observe(box);
	return wrap;
}

/** Labelled horizontal bars - pages, sources, countries. */
export function barList(rows, { format = fmt.int, empty = 'Nothing yet.', limit = 10 } = {}) {
	if (!rows.length) return element('p', { class: 'admin-empty', text: empty });
	const max = Math.max(...rows.map((r) => r.value), 1);
	return element('ol', { class: 'bars' }, rows.slice(0, limit).map((r) => element('li', {}, [
		element('span', { class: 'bars-fill', style: `width:${Math.max(1.5, (r.value / max) * 100).toFixed(1)}%`, 'aria-hidden': 'true' }),
		r.href ? element('a', { class: 'bars-label', href: r.href, text: r.label, ...(r.external ? { target: '_blank', rel: 'noopener' } : {}) }) : element('span', { class: 'bars-label', text: r.label }),
		element('span', { class: 'bars-value', text: `${format(r.value)}${r.sub ? ` · ${r.sub}` : ''}` }),
	])));
}

/** One bar split into shares - devices, channels - with its key underneath. */
export function splitBar(rows, { format = fmt.int } = {}) {
	const total = rows.reduce((a, r) => a + r.value, 0) || 1;
	return element('div', { class: 'split' }, [
		element('div', { class: 'split-bar', role: 'img', 'aria-label': rows.map((r) => `${r.label} ${Math.round((r.value / total) * 100)}%`).join(', ') },
			rows.map((r, i) => element('span', { class: `split-part is-${i % 6}`, style: `width:${((r.value / total) * 100).toFixed(2)}%` }))),
		element('ul', { class: 'split-key' }, rows.map((r, i) => element('li', {}, [
			element('span', { class: `split-swatch is-${i % 6}`, 'aria-hidden': 'true' }),
			`${r.label} ${Math.round((r.value / total) * 100)}%`,
			element('span', { class: 'split-n', text: ` (${format(r.value)})` }),
		]))),
	]);
}

/** A table, with a button that downloads it as CSV. */
export function table(columns, rows, { filename, empty = 'Nothing yet.' } = {}) {
	if (!rows.length) return element('p', { class: 'admin-empty', text: empty });
	const head = element('tr', {}, columns.map((c) => element('th', { scope: 'col', class: c.numeric ? 'numeric' : '', text: c.label })));
	const body = rows.map((r) => element('tr', {}, columns.map((c) => {
		const value = c.value(r);
		// The label travels with the cell, so on a phone a row can become a card.
		const cell = element('td', { class: c.numeric ? 'numeric' : '', 'data-label': c.label });
		if (c.href) cell.append(element('a', { href: c.href(r), text: String(value), ...(c.external ? { target: '_blank', rel: 'noopener' } : {}) }));
		else cell.append(c.format ? c.format(value) : String(value ?? ''));
		return cell;
	})));
	const csv = () => {
		const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
		const text = [columns.map((c) => esc(c.label)).join(','), ...rows.map((r) => columns.map((c) => esc(c.value(r))).join(','))].join('\r\n');
		const link = element('a', { href: URL.createObjectURL(new Blob([text], { type: 'text/csv' })), download: `${filename || 'export'}.csv` });
		link.click();
		setTimeout(() => URL.revokeObjectURL(link.href), 1000);
	};
	return element('div', { class: 'data-table is-responsive' }, [
		element('div', { class: 'table-wrapper' }, [element('table', {}, [element('thead', {}, [head]), element('tbody', {}, body)])]),
		filename ? element('button', { type: 'button', class: 'admin-button is-small', text: 'Download CSV', onclick: csv }) : null,
	]);
}
