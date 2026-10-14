// Nairobi Pulse's page: the map of how Nairobi answers.
//
// The page is the map. It arrives with its frame - the 29 outlines, the empty
// sections, how it works - and this fills it from /api/pulse: the question the
// map shows sits on top of it, with the one before and after and the whole list
// behind "See all", and the map, the city's answer and every district follow
// whichever question that is.
//
// Answering is not done here. "Add your answer" opens the same card readers in
// Nairobi are asked with on every other page (/js/pulse/card.mjs), and the card
// tells the page when a vote lands (`pulse:voted`), so the map redraws from the
// vote's own fresh tally. What a browser keeps - its id, its pass, its answers -
// and talking to the API are in /js/pulse/client.mjs, shared by both.
//
// What the map and the summaries say is worked out in /js/pulse/compute.mjs;
// this file only draws it. The rules that matter - a district's answers hidden
// below the threshold, one vote a device, a pass only from inside Greater
// Nairobi - are kept by the server, and this file never pretends otherwise: it
// shows what came back.

import { element } from '/js/utils/format.mjs';
import { cityView, defaultMode, districtView, insights, modesFor, moodWord, newer, paint, toneOf, turnoutScale } from '/js/pulse/compute.mjs';
import { KEYS, api, currentPass, deviceId, remember } from '/js/pulse/client.mjs';
import { openPulseCard } from '/js/pulse/card.mjs';

const POLL = 20000;

// --- small things -------------------------------------------------------------------------

const count = (n) => Number(n || 0).toLocaleString('en-GB');
const pct = (x) => `${Math.round((x || 0) * 100)}%`;
const shortDate = (iso) => (iso ? new Date(`${String(iso).slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '');
const plural = (n, one, many) => `${count(n)} ${n === 1 ? one : many}`;
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function initializePulse() {
	const root = document.querySelector('[data-pulse]');
	if (!root || root.dataset.ready) return;
	root.dataset.ready = 'yes';

	const data = JSON.parse(document.getElementById('pulse-data')?.textContent || '{}');
	const DISTRICTS = data.districts || {};
	const TOPICS = Object.fromEntries((data.topics || []).map((t) => [t.id, t]));
	const short = (id) => DISTRICTS[id]?.short || id;
	const names = Object.fromEntries(Object.entries(DISTRICTS).map(([id, d]) => [id, d.short]));

	const $ = (s) => root.querySelector(s);
	const page = root.closest('.pulse-page') || document;
	const els = {
		paused: $('[data-pulse-paused]'),
		qbar: $('[data-pulse-qbar]'),
		modes: $('[data-pulse-modes]'),
		map: $('[data-pulse-map]'),
		paths: [...root.querySelectorAll('[data-district]')],
		card: $('[data-pulse-district]'),
		legend: $('[data-pulse-legend]'),
		city: $('[data-pulse-city]'),
		cityBody: $('[data-pulse-city-body]'),
		insights: $('[data-pulse-insights]'),
		tableSection: $('[data-pulse-table-section]'),
		table: $('[data-pulse-table] tbody'),
		archive: $('[data-pulse-archive]'),
		archiveList: $('[data-pulse-archive-list]'),
		icons: $('[data-pulse-icons]'),
		where: page.querySelector('[data-pulse-where]'),
		whereText: page.querySelector('[data-pulse-where-text]'),
		stats: page.querySelector('[data-pulse-stats]'),
		mapcard: $('.pulse-mapcard'),
		mapTitle: $('#pulse-map-title'),
		qnames: [...root.querySelectorAll('[data-pulse-qname]')],
		list: $('[data-pulse-list]'),
		listProgress: $('[data-pulse-list-progress]'),
		listTopics: $('[data-pulse-list-topics]'),
		listItems: $('[data-pulse-list-items]'),
		listClosed: $('[data-pulse-list-closed]'),
		dock: $('[data-pulse-dock]'),
		dockLabel: $('[data-dock-label]'),
		dockText: $('[data-dock-text]'),
		dockNow: $('[data-dock-now]'),
		dockSteps: [...root.querySelectorAll('[data-dock-step]')],
	};

	const state = {
		live: [],
		closed: [],
		paused: null,
		current: null,
		results: null,
		mode: null,
		selected: null,
		votes: remember(KEYS.votes, {}),
		message: null,
		loaded: false,
		topic: '',
	};

	const icon = (topic) => {
		const found = els.icons?.content.querySelector(`[data-topic="${topic}"]`);
		return found ? found.cloneNode(true) : null;
	};

	const isLive = (q) => q?.status === 'live';
	const allQuestions = () => [...state.live, ...state.closed];

	// --- the views of the current question ---

	function views() {
		if (!state.current) return [];
		return Object.keys(DISTRICTS).map((id) => districtView(state.current, state.results, id, DISTRICTS[id].population));
	}

	// --- the hero: totals, and where this browser votes from ---

	function drawStats() {
		if (!els.stats) return;
		const set = (name, value) => { const n = els.stats.querySelector(`[data-stat="${name}"]`); if (n) n.textContent = value; };
		const votes = allQuestions().reduce((sum, q) => sum + (q.id === state.current?.id && state.results ? state.results.total : q.total || 0), 0);
		set('open', count(state.live.length));
		set('votes', count(votes));
		set('districts', count(state.results ? Object.keys(state.results.districts || {}).length : 0));
	}

	function drawWhere() {
		if (!els.where) return;
		const pass = currentPass();
		els.where.hidden = false;
		els.where.classList.toggle('is-in', Boolean(pass));
		els.whereText.textContent = pass ? `Voting from ${short(pass.district.id)}` : 'Check in to vote';
		els.where.setAttribute('aria-label', pass ? `You vote from ${pass.district.name}. Check where you are again.` : 'Check you are in Nairobi, to vote');
	}

	// --- moving between questions ---
	//
	// With many open, the list behind "See all" has a row of topics, and says
	// how many this browser has answered.

	const MANY = 6;

	/** Where the current question is among the open ones; -1 for a closed one. */
	const position = () => state.live.findIndex((q) => q.id === state.current?.id);

	/** The open question before or after this one, round the end. */
	function step(direction) {
		const list = state.live;
		if (!list.length) return null;
		const at = position();
		const next = at < 0
			? list[direction > 0 ? 0 : list.length - 1]
			: list[(at + direction + list.length) % list.length];
		return next.id === state.current?.id ? null : choose(next.id);
	}

	/** The map and its question at the top of the screen, under the header. */
	function showMap() {
		els.mapcard?.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' });
	}

	// "Question 2 of 8", either side of it the one before and after, and the
	// whole list behind it. It is the way between questions on a phone, where
	// the chips are hidden: a row of half-read questions was not a thing anyone
	// took for tabs.
	function questionNav() {
		const list = state.live;
		const at = position();
		if (at < 0) {
			return list.length ? element('div', { class: 'pulse-qnav is-closed' }, [
				element('button', { type: 'button', class: 'pulse-qnav-all', 'data-focus': 'qnav-back', onclick: () => choose((nextUnanswered() || list[0]).id) }, [
					element('span', { class: 'pulse-qnav-count', text: 'Back to the open questions' }),
					element('span', { class: 'pulse-qnav-sub', text: plural(list.length, 'is open', 'are open') }),
				]),
			]) : null;
		}
		if (list.length < 2) return null;
		const answered = list.filter((q) => state.votes[q.id]).length;
		return element('div', { class: 'pulse-qnav' }, [
			element('button', { type: 'button', class: 'pulse-qnav-step', 'aria-label': 'Previous question', 'data-focus': 'qnav-prev', onclick: () => step(-1) }, [element('span', { 'aria-hidden': 'true', text: '‹' })]),
			element('button', { type: 'button', class: 'pulse-qnav-all', 'aria-haspopup': 'dialog', 'data-focus': 'qnav-all', onclick: openList }, [
				element('span', { class: 'pulse-qnav-count', text: `Question ${at + 1} of ${list.length}` }),
				element('span', { class: 'pulse-qnav-sub', text: answered ? `${count(answered)} answered · see all` : 'See all of them' }),
			]),
			element('button', { type: 'button', class: 'pulse-qnav-step', 'aria-label': 'Next question', 'data-focus': 'qnav-next', onclick: () => step(1) }, [element('span', { 'aria-hidden': 'true', text: '›' })]),
		]);
	}

	function drawList() {
		const list = state.live;
		const answered = list.filter((q) => state.votes[q.id]).length;
		els.listProgress.textContent = !list.length
			? 'Nothing is open right now.'
			: answered === list.length ? `You have answered all ${count(list.length)}.`
				: answered ? `You have answered ${count(answered)} of ${count(list.length)}.` : `${plural(list.length, 'question is', 'questions are')} open. Pick one to answer.`;
		// Topics, where they would narrow anything: many open, and some topic
		// with more than one.
		const present = (data.topics || []).map((t) => ({ ...t, n: list.filter((q) => q.topic === t.id).length })).filter((t) => t.n);
		const useful = list.length >= MANY && present.length > 1 && present.some((t) => t.n > 1);
		if (!useful || (state.topic && !present.some((t) => t.id === state.topic))) state.topic = '';
		els.listTopics.replaceChildren(...(useful ? [element('div', { class: 'pulse-topics', role: 'group', 'aria-label': 'Questions by topic' }, [{ id: '', label: 'All', n: list.length }, ...present].map((t) => element('button', {
			type: 'button',
			class: 'pulse-topic',
			'aria-pressed': String(state.topic === t.id),
			onclick: () => {
				state.topic = t.id;
				drawList();
				els.listTopics.querySelector('.pulse-topic[aria-pressed="true"]')?.focus();
			},
		}, [element('span', { text: t.label }), element('span', { class: 'pulse-topic-count', text: count(t.n) })])))] : []));
		const row = (q, meta) => element('li', {}, [element('button', {
			type: 'button',
			class: `pulse-list-item${q.id === state.current?.id ? ' is-on' : ''}${state.votes[q.id] ? ' is-voted' : ''}`,
			...(q.id === state.current?.id ? { 'aria-current': 'true' } : {}),
			onclick: () => pick(q.id),
		}, [
			icon(q.topic),
			element('span', { class: 'pulse-list-text', text: q.text }),
			element('span', { class: 'pulse-list-meta', text: meta }),
		])]);
		const shown = state.topic ? list.filter((q) => q.topic === state.topic) : list;
		els.listItems.replaceChildren(...shown.map((q) => row(q, state.votes[q.id] ? 'Voted' : plural(q.total, 'vote', 'votes'))));
		els.listClosed.replaceChildren(...(state.closed.length ? [
			element('h3', { class: 'pulse-list-subhead', text: 'Closed' }),
			element('ol', { class: 'pulse-list' }, state.closed.slice(0, 8).map((q) => row(q, `Closed · ${plural(q.final?.total ?? q.total, 'vote', 'votes')}`))),
		] : []));
	}

	let listReturn = null;
	function openList() {
		const sheet = els.list;
		if (!sheet) return;
		drawList();
		listReturn = document.activeElement;
		if (typeof sheet.showModal === 'function') { if (!sheet.open) sheet.showModal(); } else sheet.setAttribute('open', '');
		requestAnimationFrame(() => sheet.classList.add('is-open'));
		setTimeout(() => sheet.classList.add('is-open'), 60);
		(sheet.querySelector('.pulse-list-item.is-on') || sheet.querySelector('.pulse-list-item'))?.focus();
		drawDock();
	}

	/** Slides the list away; resolves once it is closed and the browser has moved focus. */
	function closeList({ restore = true } = {}) {
		const sheet = els.list;
		if (!sheet?.hasAttribute('open')) return Promise.resolve();
		sheet.classList.remove('is-open');
		return new Promise((resolve) => setTimeout(() => {
			if (typeof sheet.close === 'function' && sheet.open) sheet.close();
			else sheet.removeAttribute('open');
			if (restore) listReturn?.focus?.({ preventScroll: true });
			drawDock();
			resolve();
		}, reduceMotion() ? 0 : 200));
	}

	// The dialog hands focus back to whatever opened it when it closes, so the
	// question's first answer is focused only after that.
	async function pick(id) {
		await Promise.all([closeList({ restore: false }), choose(id)]);
		showMap();
		els.qbar.querySelector('[data-focus="answer"], #pulse-map-title')?.focus({ preventScroll: true });
	}

	// --- the bar at the thumb, while the counts are read ---
	//
	// Further down - the city's answer, the table - nothing on screen says which
	// question they count. While they are on screen and the question above the
	// map is not, a bar at the bottom names it and steps to the next; tapping it
	// goes back up to the map. Below 60rem only.

	const single = window.matchMedia('(max-width: 59.99rem)');
	const inView = new Set();
	const headerHeight = () => document.querySelector('.site-header, body > header')?.offsetHeight || 56;
	const dialogOpen = () => Boolean(els.list?.open || document.querySelector('.pp'));

	function drawDock() {
		const dock = els.dock;
		if (!dock) return;
		const q = state.current;
		const show = Boolean(q) && single.matches && !inView.has('bar') && ['map', 'city', 'table'].some((k) => inView.has(k)) && !dialogOpen();
		dock.hidden = false;
		dock.classList.toggle('is-shown', show);
		dock.inert = !show;
		dock.setAttribute('aria-hidden', String(!show));
		document.querySelector('.support-float')?.classList.toggle('is-yielding', show);
		if (!q) return;
		const at = position();
		els.dockLabel.textContent = at >= 0 && state.live.length > 1 ? `On the map · ${at + 1} of ${state.live.length}` : isLive(q) ? 'On the map' : 'On the map · closed';
		if (els.dockText.textContent !== q.text) els.dockText.textContent = q.text;
		els.dockNow.setAttribute('aria-label', `${q.text} Go to the question.`);
		for (const b of els.dockSteps) b.hidden = at < 0 || state.live.length < 2;
	}

	/** A change of question from the dock is said by the bar itself, briefly. */
	function nudge(...nodes) {
		if (reduceMotion()) return;
		for (const node of nodes.filter(Boolean)) {
			node.classList.remove('is-changed');
			void node.getBoundingClientRect();
			node.classList.add('is-changed');
			setTimeout(() => node.classList.remove('is-changed'), 700);
		}
	}

	if (els.dock && 'IntersectionObserver' in window) {
		const watch = new IntersectionObserver((entries) => {
			for (const entry of entries) {
				if (entry.isIntersecting) inView.add(entry.target.dataset.watch);
				else inView.delete(entry.target.dataset.watch);
			}
			drawDock();
		}, { rootMargin: `-${headerHeight()}px 0px 0px 0px` });
		for (const [key, node] of [['bar', els.qbar], ['map', els.map], ['city', els.city], ['table', els.tableSection]]) {
			if (!node) continue;
			node.dataset.watch = key;
			watch.observe(node);
		}
		single.addEventListener?.('change', drawDock);
		els.dockNow.addEventListener('click', () => {
			showMap();
			els.qbar.querySelector('[data-focus="answer"], #pulse-map-title')?.focus({ preventScroll: true });
		});
		for (const button of els.dockSteps) {
			button.addEventListener('click', async () => {
				await step(Number(button.dataset.dockStep));
				nudge(els.dock, els.mapTitle);
			});
		}
	}

	/** The next open question this browser has not answered, after the current one. */
	function nextUnanswered() {
		const list = state.live;
		const at = list.findIndex((q) => q.id === state.current?.id);
		const after = [...list.slice(at + 1), ...list.slice(0, Math.max(0, at))].filter((q) => !state.votes[q.id]);
		return after.find((q) => !state.topic || q.topic === state.topic) || after[0] || null;
	}

	// --- the question on the map ---
	//
	// The question the map shows sits on top of it: where it is among the open
	// ones, its words, and one button to answer, which opens the card every
	// other page asks with. Redrawn only when something in it changed, so the
	// twenty-second refresh neither re-reads it to a screen reader nor drops a
	// keyboard user's place.

	function answerNow() {
		const q = state.current;
		if (!q || !isLive(q)) return;
		openPulseCard({
			question: q,
			pool: state.live,
			min: data.min,
			why: 'page',
			paused: state.paused,
			// "Next question" in the card moves the map along with it.
			onShow: (shown) => { if (shown.id !== state.current?.id) choose(shown.id, { quiet: false }); },
		});
	}

	function drawBar() {
		if (!els.qbar) return;
		const q = state.current;
		let bar;
		if (!q) {
			bar = element('div', { class: 'pulse-qbar-inner' }, [
				element('h2', { class: 'pulse-qbar-text', id: 'pulse-map-title', tabindex: '-1', text: 'No question is open right now' }),
				element('p', { class: 'pulse-qbar-context', text: state.closed.length ? 'The last ones are below, with how every constituency answered.' : 'The first question opens soon.' }),
			]);
		} else {
			const mine = state.votes[q.id];
			const chosen = q.options.find((o) => o.id === mine);
			const city = cityView(q, state.results);
			const topic = TOPICS[q.topic];
			const live = isLive(q);
			bar = element('div', { class: 'pulse-qbar-inner' }, [
				questionNav(),
				element('p', { class: 'pulse-question-topic' }, [
					icon(q.topic),
					element('span', { text: topic?.label || '' }),
					q.featured && live ? element('span', { class: 'pulse-tag', text: 'This week' }) : null,
					!live ? element('span', { class: 'pulse-tag is-closed', text: 'Closed' }) : null,
				]),
				element('h2', { class: 'pulse-qbar-text', id: 'pulse-map-title', tabindex: '-1', text: q.text }),
				q.context ? element('p', { class: 'pulse-qbar-context', text: q.context }) : null,
				element('div', { class: 'pulse-qbar-row' }, [
					live && !state.paused ? element('button', {
						type: 'button',
						class: `pulse-button${chosen ? '' : ' is-primary'}`,
						'data-focus': 'answer',
						text: chosen ? `You said: ${chosen.label} · Change` : 'Add your answer',
						onclick: answerNow,
					}) : null,
					element('span', { class: 'pulse-qbar-meta', text: live
						? `${plural(city.total, 'vote', 'votes')}${q.closes_at ? ` · closes ${shortDate(q.closes_at)}` : ''}`
						: `Closed ${shortDate(q.closed_at || q.closes_at)} · ${plural(city.total, 'vote', 'votes')}` }),
					element('button', { type: 'button', class: 'pulse-link', 'data-focus': 'share', text: 'Share', onclick: () => share(q) }),
				]),
				state.message ? element('p', { class: `pulse-message is-${state.message.tone}`, role: 'status', text: state.message.text }) : null,
			].filter(Boolean));
		}
		if (els.qbar.firstElementChild?.outerHTML === bar.outerHTML) return;
		const focused = els.qbar.contains(document.activeElement) ? document.activeElement.dataset.focus || document.activeElement.id : null;
		els.qbar.replaceChildren(bar);
		els.mapTitle = els.qbar.querySelector('#pulse-map-title');
		if (focused) els.qbar.querySelector(`[data-focus="${focused}"], #${focused}`)?.focus({ preventScroll: true });
	}

	// --- the map ---

	function drawModes() {
		const q = state.current;
		if (!q) { els.modes.replaceChildren(); return; }
		els.modes.replaceChildren(...modesFor(q).map((m) => {
			const on = m.id === state.mode;
			return element('button', {
				type: 'button',
				role: 'radio',
				'aria-checked': on ? 'true' : 'false',
				class: `pulse-mode${on ? ' is-on' : ''}${m.index !== undefined ? ` tone-${toneOf(q, m.index)}` : ''}`,
				onclick: () => { state.mode = m.id; drawModes(); paintMap(); drawLegend(); },
			}, [m.index !== undefined ? element('span', { class: 'pulse-swatch', 'aria-hidden': 'true' }) : null, element('span', { text: m.label })]);
		}));
	}

	function describe(view) {
		const name = DISTRICTS[view.id]?.name || view.id;
		if (!view.total) return `${name}: no votes yet`;
		if (!view.shown) return `${name}: ${plural(view.total, 'vote', 'votes')}, ${count(view.needs)} more to show`;
		const top = view.leading;
		return `${name}: ${plural(view.total, 'vote', 'votes')}, ${top.tie ? 'tied' : `${pct(top.share)} ${top.label}`}`;
	}

	function paintMap() {
		if (!els.paths.length) return;
		const all = views();
		const scale = turnoutScale(all);
		const byId = Object.fromEntries(all.map((v) => [v.id, v]));
		const you = currentPass()?.district.id;
		for (const path of els.paths) {
			const view = byId[path.dataset.district];
			if (!view) continue;
			const { tone, opacity } = state.current ? paint(state.current, state.mode, view, scale) : { tone: 'empty', opacity: 1 };
			path.setAttribute('class', `pulse-district tone-${tone}${view.id === state.selected ? ' is-selected' : ''}${view.id === you ? ' is-you' : ''}`);
			path.style.fillOpacity = tone === 'thin' || tone === 'empty' ? '' : String(opacity);
			path.setAttribute('aria-label', describe(view));
			path.setAttribute('aria-pressed', view.id === state.selected ? 'true' : 'false');
		}
		// The selected district and this browser's own are drawn last, so their
		// outlines are not covered by a neighbour's.
		// Moving an element drops its focus, so a keyboard user who just chose
		// a district would lose their place: give it back.
		const svg = els.paths[0].ownerSVGElement;
		const focused = document.activeElement;
		for (const id of [you, state.selected]) {
			const path = id && els.paths.find((p) => p.dataset.district === id);
			if (path && svg.lastElementChild !== path) svg.append(path);
		}
		if (focused?.dataset?.district && document.activeElement !== focused) focused.focus({ preventScroll: true });
	}

	function drawLegend() {
		const q = state.current;
		if (!q || !els.legend) { els.legend?.replaceChildren(); return; }
		const parts = [];
		const ramp = (tone, from, to) => element('span', { class: 'pulse-ramp' }, [
			element('span', { text: from }),
			element('span', { class: `pulse-ramp-bar tone-${tone}`, 'aria-hidden': 'true' }),
			element('span', { text: to }),
		]);
		if (state.mode === 'leading') {
			parts.push(element('span', { class: 'pulse-key' }, q.options.map((o, i) => element('span', { class: `pulse-key-item tone-${toneOf(q, i)}` }, [element('span', { class: 'pulse-swatch', 'aria-hidden': 'true' }), element('span', { text: o.label })]))));
			parts.push(element('span', { class: 'pulse-legend-note', text: 'Stronger colour means a wider win.' }));
		} else if (state.mode === 'mood') {
			const bad = q.options[q.options.length - 1]?.label;
			const good = q.options[0]?.label;
			parts.push(element('span', { class: 'pulse-diverge' }, [
				element('span', { text: bad }),
				element('span', { class: 'pulse-ramp-bar tone-diverge', 'aria-hidden': 'true' }),
				element('span', { text: good }),
			]));
		} else if (state.mode === 'turnout') {
			parts.push(ramp('turnout', 'Fewer', 'More votes per 100,000 people'));
		} else {
			const o = q.options.find((x) => `option:${x.id}` === state.mode);
			const index = q.options.indexOf(o);
			parts.push(ramp(toneOf(q, index), '0%', `100% say ${o.label}`));
		}
		// Turnout shades every district that has votes, so it has no hatch to explain.
		if (state.mode !== 'turnout') parts.push(element('span', { class: 'pulse-key-item is-thin' }, [element('span', { class: 'pulse-swatch is-hatch', 'aria-hidden': 'true' }), element('span', { text: `Under ${data.min} votes` })]));
		els.legend.replaceChildren(...parts);
	}

	function drawCard() {
		const card = els.card;
		if (!card) return;
		const id = state.selected;
		if (!id || !state.current) { card.hidden = true; card.replaceChildren(); return; }
		const q = state.current;
		const view = districtView(q, state.results, id, DISTRICTS[id]?.population);
		const city = cityView(q, state.results);
		const you = currentPass()?.district.id === id;
		const rows = view.shown ? view.shares.map((s, i) => element('li', { class: `pulse-bar tone-${toneOf(q, i)}` }, [
			element('span', { class: 'pulse-bar-label', text: s.label }),
			element('span', { class: 'pulse-bar-track' }, [
				element('span', { class: 'pulse-bar-fill', style: `width: ${Math.round(s.share * 100)}%` }),
				city.shown ? element('span', { class: 'pulse-bar-city', style: `left: ${Math.round(city.shares[i].share * 100)}%`, title: `Nairobi: ${pct(city.shares[i].share)}` }) : null,
			]),
			element('span', { class: 'pulse-bar-value', text: pct(s.share) }),
		])) : [];
		card.replaceChildren(...[
			element('div', { class: 'pulse-card-head' }, [
				element('div', {}, [
					element('h3', { text: DISTRICTS[id]?.name || id }),
					you ? element('span', { class: 'pulse-tag is-you', text: 'You are here' }) : null,
				]),
				element('button', { type: 'button', class: 'pulse-card-close', 'aria-label': 'Close', text: '×', onclick: () => select(null) }),
			]),
			element('p', { class: 'pulse-card-count', text: view.total ? plural(view.total, 'vote', 'votes') : 'No votes yet' }),
			view.shown
				? element('ul', { class: 'pulse-bars' }, rows)
				: element('p', { class: 'pulse-note', text: view.total
					? `Its answers show at ${data.min} votes. ${plural(view.needs, 'more vote is', 'more votes are')} needed${you ? ' - share the question with your neighbours.' : '.'}`
					: `Nobody here has answered yet.${you ? ' Yours could be the first.' : ''}` }),
			view.shown && q.kind === 'scale' && view.mood !== null ? element('p', { class: 'pulse-note', text: `${DISTRICTS[id]?.short} ${moodWord(view.mood)}.` }) : null,
			view.shown && city.shown ? element('p', { class: 'pulse-note pulse-card-key', text: 'The line on each bar is Nairobi as a whole.' }) : null,
			view.perHundredThousand !== null && view.total ? element('p', { class: 'pulse-note', text: `${count(Math.round(view.perHundredThousand))} votes per 100,000 residents.` }) : null,
		].filter(Boolean));
		card.hidden = false;
	}

	// --- how much of the map to show ---

	const svg = els.paths[0]?.ownerSVGElement;
	const zoomBox = $('[data-pulse-zoom]');
	const fullBox = svg?.getAttribute('viewBox');
	// Constituencies to leave out of a "city centre" view. Greater Accra needed
	// one - its rural districts made the region too wide to tap on a phone - but
	// Nairobi's 17 constituencies fit a phone screen whole, so the set is empty
	// and the zoom buttons stay hidden. Add ids here to bring them back.
	const OUTER = new Set([]);
	let cityBox = null;
	if (svg && zoomBox && OUTER.size) {
		let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
		for (const path of els.paths) {
			if (OUTER.has(path.dataset.district)) continue;
			const b = path.getBBox();
			x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.width); y1 = Math.max(y1, b.y + b.height);
		}
		const pad = 40;
		if (Number.isFinite(x0) && x1 > x0) cityBox = `${Math.round(x0 - pad)} ${Math.round(y0 - pad)} ${Math.round(x1 - x0 + 2 * pad)} ${Math.round(y1 - y0 + 2 * pad)}`;
	}
	function zoom(which) {
		if (!svg || !cityBox) return;
		svg.setAttribute('viewBox', which === 'city' ? cityBox : fullBox);
		for (const b of zoomBox.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.zoom === which));
		state.zoom = which;
	}
	if (cityBox) {
		zoomBox.hidden = false;
		zoomBox.addEventListener('click', (event) => { const b = event.target.closest('[data-zoom]'); if (b) zoom(b.dataset.zoom); });
		zoom(window.matchMedia('(max-width: 40rem)').matches ? 'city' : 'all');
	}

	function select(id) {
		state.selected = id && id === state.selected ? null : id;
		// A district beyond the city, chosen from the table or an insight, is
		// off the city view: show the whole region rather than nothing.
		if (state.selected && OUTER.has(state.selected) && state.zoom === 'city') zoom('all');
		paintMap();
		drawCard();
		for (const row of els.table?.querySelectorAll('tr') || []) row.classList.toggle('is-selected', row.dataset.district === state.selected);
	}

	// --- the city as a whole ---

	function drawCity() {
		const q = state.current;
		if (!q || !state.results) { els.city.hidden = true; return; }
		const city = cityView(q, state.results);
		els.city.hidden = false;
		const body = [];
		if (!city.shown) {
			body.push(element('p', { class: 'pulse-city-wait' }, [
				element('strong', { text: plural(city.total, 'vote', 'votes') }),
				element('span', { text: ` so far. Nairobi's answer shows at ${data.min}.` }),
			]));
		} else {
			if (q.kind === 'scale' && city.mood !== null) {
				const position = Math.round((city.mood + 1) * 50);
				body.push(element('div', { class: 'pulse-gauge' }, [
					element('p', { class: 'pulse-gauge-word', text: `Nairobi ${moodWord(city.mood)}` }),
					element('div', { class: 'pulse-gauge-track', 'aria-hidden': 'true' }, [element('span', { class: 'pulse-gauge-mark', style: `left: ${position}%` })]),
					element('p', { class: 'pulse-gauge-ends' }, [element('span', { text: q.options[q.options.length - 1].label }), element('span', { text: q.options[0].label })]),
				]));
			}
			body.push(element('ul', { class: 'pulse-bars is-large' }, city.shares.map((s, i) => element('li', { class: `pulse-bar tone-${toneOf(q, i)}${state.votes[q.id] === s.id ? ' is-yours' : ''}` }, [
				element('span', { class: 'pulse-bar-label', text: s.label }),
				element('span', { class: 'pulse-bar-track' }, [element('span', { class: 'pulse-bar-fill', style: `width: ${Math.round(s.share * 100)}%` })]),
				element('span', { class: 'pulse-bar-value' }, [element('strong', { text: pct(s.share) }), element('span', { text: ` ${count(s.count)}` })]),
			]))));
			body.push(element('p', { class: 'pulse-note', text: `${plural(city.total, 'vote', 'votes')} from ${plural(city.districtsHeard, 'district', 'districts')}; ${count(city.districtsShown)} with enough to show on the map.` }));
		}
		els.cityBody.replaceChildren(...body);
		const notes = insights(q, views(), city, names);
		els.insights.hidden = !notes.length;
		els.insights.replaceChildren(...notes.map((n) => element('li', {}, [
			element('button', { type: 'button', class: `pulse-insight is-${n.kind}`, onclick: () => { select(n.district); els.map?.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'center' }); } }, [
				element('span', { class: 'pulse-insight-title', text: n.title }),
				element('span', { class: 'pulse-insight-text', text: n.text }),
			]),
		])));
	}

	// --- every district, as a table ---

	function drawTable() {
		const q = state.current;
		if (!q || !els.table) { if (els.tableSection) els.tableSection.hidden = true; return; }
		els.tableSection.hidden = false;
		const rows = views().sort((a, b) => b.total - a.total || short(a.id).localeCompare(short(b.id)));
		els.table.replaceChildren(...rows.map((v) => element('tr', { 'data-district': v.id, class: v.id === state.selected ? 'is-selected' : '' }, [
			element('th', { scope: 'row' }, [element('button', { type: 'button', class: 'pulse-link', text: short(v.id), onclick: () => { select(v.id); els.map?.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'center' }); } })]),
			element('td', { class: 'numeric', text: count(v.total) }),
			element('td', { text: !v.total ? '' : !v.shown ? `${count(v.needs)} more to show` : v.leading.tie ? 'Tied' : `${v.leading.label} ${pct(v.leading.share)}` }),
			element('td', { class: 'numeric', text: v.perHundredThousand && v.total ? count(Math.round(v.perHundredThousand)) : '' }),
		])));
	}

	// --- closed questions ---

	function drawArchive() {
		els.archive.hidden = !state.closed.length;
		els.archiveList.replaceChildren(...state.closed.map((q) => {
			const total = q.final?.total || q.total || 0;
			const counts = q.final?.options || {};
			const top = q.options.map((o, i) => ({ ...o, i, n: counts[o.id] || 0 })).sort((a, b) => b.n - a.n)[0];
			return element('li', {}, [element('a', { class: `pulse-archive-card${q.id === state.current?.id ? ' is-on' : ''}`, href: `#q=${q.id}` }, [
				element('span', { class: 'pulse-archive-meta' }, [icon(q.topic), element('span', { text: `Closed ${shortDate(q.closed_at || q.closes_at)}` })]),
				element('span', { class: 'pulse-archive-text', text: q.text }),
				total >= data.min && top?.n
					? element('span', { class: `pulse-archive-result tone-${toneOf(q, top.i)}` }, [element('span', { class: 'pulse-swatch', 'aria-hidden': 'true' }), element('span', { text: `${top.label} ${pct(top.n / total)} · ${plural(total, 'vote', 'votes')}` })])
					: element('span', { class: 'pulse-archive-result', text: plural(total, 'vote', 'votes') }),
			])]);
		}));
	}

	function drawPaused() {
		els.paused.hidden = !state.paused;
		els.paused.textContent = state.paused || '';
	}

	function drawNames() {
		const q = state.current;
		for (const node of els.qnames) {
			node.hidden = !q;
			node.textContent = q ? q.text : '';
		}
	}

	function drawAll() {
		drawNames();
		drawStats();
		drawWhere();
		drawPaused();
		drawBar();
		drawModes();
		paintMap();
		drawLegend();
		drawCard();
		drawCity();
		drawTable();
		drawArchive();
		drawDock();
	}

	// --- choosing a question ---

	async function choose(id, { quiet = false } = {}) {
		const q = allQuestions().find((x) => x.id === id) || state.live[0] || state.closed[0] || null;
		const changed = q?.id !== state.current?.id;
		state.current = q;
		if (changed) {
			state.results = null;
			state.mode = q ? defaultMode(q) : null;
			state.message = null;
		}
		drawAll();
		if (!q) return;
		if (!quiet && location.hash !== `#q=${q.id}`) history.replaceState(history.state, '', `#q=${q.id}`);
		await refreshResults();
	}

	async function refreshResults() {
		const q = state.current;
		if (!q) return;
		try {
			const { results } = await api('results', { params: { q: q.id } });
			if (state.current?.id !== q.id) return;
			const merged = newer(state.results, results);
			if (merged !== state.results) {
				state.results = merged;
				drawStats(); paintMap(); drawLegend(); drawCard(); drawCity(); drawTable(); drawBar();
			}
		} catch (error) {
			if (error.status === 404) await loadQuestions();
		}
	}

	async function loadQuestions() {
		try {
			const answer = await api('questions');
			state.live = answer.live || [];
			state.closed = answer.closed || [];
			state.paused = answer.paused || null;
			state.loaded = true;
			const wanted = /^#q=([a-z0-9]+)$/.exec(location.hash)?.[1];
			const keep = state.current && allQuestions().find((q) => q.id === state.current.id);
			if (keep) {
				state.current = keep;
				drawAll();
			} else {
				// The fullest map first: the open question with the most answers.
				// Asking is the card's job; arriving here is for looking.
				const first = [...state.live].sort((a, b) => (b.total || 0) - (a.total || 0))[0] || state.closed[0];
				await choose(wanted || first?.id, { quiet: !wanted });
			}
		} catch (error) {
			els.qbar.replaceChildren(element('div', { class: 'pulse-qbar-inner' }, [
				element('h2', { class: 'pulse-qbar-text', id: 'pulse-map-title', text: error.code === 'not-configured' ? 'Nairobi Pulse is opening soon' : 'The questions did not load' }),
				element('p', { text: error.code === 'not-configured' ? 'The first questions are on their way.' : error.message }),
				error.code === 'not-configured' ? null : element('button', { type: 'button', class: 'pulse-button', text: 'Try again', onclick: loadQuestions }),
			]));
		}
	}

	// --- a vote, from the card ---
	//
	// The card counts it and says so; the page redraws from the vote's own fresh
	// tally, and the voter's district pulses once on the map.

	window.addEventListener('pulse:voted', (event) => {
		const { question, option, answer } = event.detail;
		state.votes[question] = option;
		const listed = state.live.find((x) => x.id === question);
		if (listed) listed.total = answer.results.total;
		if (state.current?.id === question) state.results = newer(state.results, answer.results);
		if (answer.vote?.district) state.selected = answer.vote.district;
		drawAll();
		if (answer.vote?.district) flash(answer.vote.district);
	});
	window.addEventListener('pulse:pass', () => { drawWhere(); paintMap(); });

	// Your district pulses once on the map when your vote lands there.
	function flash(id) {
		const path = els.paths.find((p) => p.dataset.district === id);
		if (!path || reduceMotion()) return;
		path.classList.remove('is-flash');
		void path.getBoundingClientRect();
		path.classList.add('is-flash');
		setTimeout(() => path.classList.remove('is-flash'), 1600);
	}

	async function share(q) {
		const url = `${location.origin}${location.pathname}#q=${q.id}`;
		const text = `${q.text} - vote from anywhere in Nairobi, and see how every constituency answers.`;
		try {
			if (navigator.share) {
				await navigator.share({ title: 'Nairobi Pulse', text, url });
				return;
			}
			await navigator.clipboard.writeText(url);
			state.message = { tone: 'good', text: 'Link copied. Send it to someone in Nairobi.' };
		} catch (error) {
			if (error?.name === 'AbortError') return;
			state.message = { tone: 'info', text: url };
		}
		drawBar();
	}

	// --- events ---

	els.list?.addEventListener('cancel', (event) => { event.preventDefault(); closeList(); });
	els.list?.addEventListener('click', (event) => { if (event.target === els.list) closeList(); });
	els.list?.querySelector('[data-pulse-list-close]')?.addEventListener('click', () => closeList());
	// "Check in": the card, with no question - only where the reader is.
	els.where?.addEventListener('click', () => openPulseCard({ question: null, why: 'page' }));

	for (const path of els.paths) {
		path.addEventListener('click', () => select(path.dataset.district));
		path.addEventListener('keydown', (event) => {
			if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(path.dataset.district); }
		});
	}
	document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && state.selected && !els.list?.open && !document.querySelector('.pp')) select(null); });

	window.addEventListener('hashchange', () => {
		const id = /^#q=([a-z0-9]+)$/.exec(location.hash)?.[1];
		if (id && id !== state.current?.id) choose(id, { quiet: true });
	});

	// Fresh counts every twenty seconds while the page is in view and the
	// question is open; the edge answers most of these without the database.
	let ticks = 0;
	setInterval(() => {
		if (document.hidden || !state.loaded) return;
		ticks++;
		if (ticks % 3 === 0) loadQuestions();
		else if (isLive(state.current)) refreshResults();
	}, POLL);
	document.addEventListener('visibilitychange', () => { if (!document.hidden && state.loaded && isLive(state.current)) refreshResults(); });

	deviceId();
	drawWhere();
	loadQuestions();
}
