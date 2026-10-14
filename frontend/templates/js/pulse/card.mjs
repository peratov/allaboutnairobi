// Nairobi Pulse's question card: the one place a vote is cast, on any page.
//
// Opened by pulse-prompt.mjs when it is time to ask a reader, and by the map
// at /pulse when someone presses "Add your answer". It asks one question, does
// the location check the first time (explained before the browser asks), casts
// the vote, shows how Nairobi answered, and offers the next question at random.
//
// Fetched only when a card is about to open, with its styles inside it, added
// to the page the first time it does: a reader who is never asked downloads
// none of this.

import { element } from '/js/utils/format.mjs';
import { checkLocation, currentPass, myVotes, vote } from '/js/pulse/client.mjs';
import { snooze, unanswered } from '/js/components/pulse-prompt.mjs';

const count = (n) => Number(n || 0).toLocaleString('en-GB');
const pct = (x) => `${Math.round((x || 0) * 100)}%`;
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// --- the card ---------------------------------------------------------------------------------

const STYLES = `
.pp{position:fixed;z-index:60;left:.75rem;right:.75rem;bottom:calc(.75rem + env(safe-area-inset-bottom,0px));max-width:25rem;margin-left:auto;max-height:calc(100vh - 5rem);overflow:auto;overscroll-behavior:contain;color:var(--c-text);background:var(--c-bg-page);border:1px solid var(--c-border);border-radius:18px;box-shadow:0 18px 50px -12px rgba(0,0,0,.45);transform:translateY(calc(100% + 2rem));transition:transform .28s cubic-bezier(.2,.8,.2,1)}
.pp.is-open{transform:none}
@media (min-width:40rem){.pp{left:auto;right:1.25rem;bottom:1.25rem;width:24rem}}
.pp-head{display:flex;align-items:center;justify-content:space-between;padding:.5rem .5rem 0 1rem}
.pp-eyebrow{display:inline-flex;align-items:center;gap:.5em;font-size:.75rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--c-highlight)}
.pp-eyebrow::before{content:"";width:.5rem;height:.5rem;border-radius:50%;background:currentColor}
.pp-x{width:2.75rem;height:2.75rem;font:inherit;font-size:1.5rem;line-height:1;color:var(--c-text-light);background:none;border:0;border-radius:50%;cursor:pointer}
.pp-body{padding:0 1rem 1rem}
.pp-kicker{margin:0 0 .3rem;font-size:.85rem;color:var(--c-text-light)}
.pp-q{margin:0 0 .4rem;font-family:var(--font-heading);font-size:1.25rem;line-height:1.25;color:var(--c-text-heading);outline:none}
.pp-context{margin:0 0 .5rem;font-size:.9rem;line-height:1.45;color:var(--c-text-light)}
.pp-options{display:grid;gap:.4rem;margin:.6rem 0 .2rem}
.pp-option{display:flex;align-items:center;gap:.65rem;min-height:2.9rem;padding:.4rem .9rem;font:inherit;font-size:1rem;font-weight:600;text-align:left;color:var(--c-text-heading);background:var(--c-bg-widget);border:1px solid var(--c-border-strong);border-radius:12px;cursor:pointer}
.pp-option::before{content:"";flex:none;width:1rem;height:1rem;border:2px solid currentColor;border-radius:50%;opacity:.55}
.pp-option:hover{border-color:var(--c-highlight)}
.pp-option[aria-pressed=true]{border-color:var(--c-highlight);box-shadow:inset 0 0 0 1px var(--c-highlight)}
.pp-option[aria-pressed=true]::before{background:var(--c-highlight);border-color:var(--c-highlight);opacity:1}
.pp-option:disabled{cursor:progress;opacity:.7}
.pp-options.is-chips{display:flex;flex-wrap:wrap;gap:.4rem}
.pp-options.is-chips .pp-option{min-height:2.75rem;padding:.3rem .85rem;font-size:.95rem;border-radius:999px}
.pp-options.is-chips .pp-option::before{width:.8rem;height:.8rem}
.pp-x:focus-visible,.pp-option:focus-visible,.pp-button:focus-visible,.pp-link:focus-visible{outline:3px solid var(--c-highlight);outline-offset:2px}
.pp-note{margin:.5rem 0 0;font-size:.8rem;line-height:1.45;color:var(--c-text-light)}
.pp-row{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem 1rem;margin-top:.8rem}
.pp-button{display:inline-flex;align-items:center;justify-content:center;min-height:2.75rem;padding:0 1.15rem;font:inherit;font-weight:700;color:var(--c-text-heading);text-decoration:none;background:var(--c-bg-widget);border:1px solid var(--c-border-strong);border-radius:999px;cursor:pointer}
.pp-button.is-primary{color:var(--c-bg-on-accent);background:var(--c-highlight);border-color:var(--c-highlight)}
.pp-button:disabled{cursor:progress;opacity:.7}
.pp-link{display:inline-flex;align-items:center;min-height:2.5rem;padding:0;font:inherit;font-size:.9rem;font-weight:600;color:var(--c-text-link);text-decoration:underline;text-underline-offset:.15em;background:none;border:0;cursor:pointer}
.pp-link.is-quiet{font-weight:500;color:var(--c-text-light)}
.pp-bars{display:grid;gap:.5rem;margin:.7rem 0 0;padding:0;list-style:none}
.pp-bars li{margin:0}
.pp-bar{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:.2rem .6rem;font-size:.9rem}
.pp-track{grid-column:1/-1;height:.5rem;overflow:hidden;background:var(--c-bg-widget);border-radius:1rem}
.pp-fill{display:block;height:100%;background:var(--c-border-strong);border-radius:1rem}
.pp-bar.is-yours{font-weight:700}
.pp-bar.is-yours .pp-fill{background:var(--c-highlight)}
.pp-message{margin:.6rem 0 0;padding:.6rem .8rem;font-size:.9rem;line-height:1.45;background:var(--c-warning-bg,var(--c-bg-widget));border-left:3px solid var(--c-warning-border,var(--c-highlight));border-radius:0 10px 10px 0}
.pp-busy{display:flex;align-items:center;gap:.6rem;margin:.6rem 0}
.pp-busy::before{content:"";flex:none;width:1.2rem;height:1.2rem;border:3px solid var(--c-border);border-top-color:var(--c-highlight);border-radius:50%;animation:pp-spin .8s linear infinite}
@keyframes pp-spin{to{transform:rotate(360deg)}}
.support-float.is-yielding-pulse{opacity:0;pointer-events:none}
@media (prefers-reduced-motion:reduce){.pp{transition:none}.pp-busy::before{animation:none}}
@media print{.pp{display:none}}
`;

let card = null;

function addStyles() {
	if (document.getElementById('pulse-prompt-styles')) return;
	document.head.append(element('style', { id: 'pulse-prompt-styles', text: STYLES }));
}

function results(question, answer, min) {
	const tally = answer?.results;
	const total = tally?.total || 0;
	return {
		total,
		shown: total >= min,
		rows: question.options.map((o) => {
			const n = tally?.options?.find((x) => x.id === o.id)?.count || 0;
			return { id: o.id, label: o.label, n, share: total ? n / total : 0 };
		}),
	};
}

/**
 * Opens the card. `question` is the one to ask, or none to ask where the
 * reader is (`checkIn`); `pool` the open questions "Next" picks from; `onShow`
 * hears each question the card moves to, `onClose` whether it was answered.
 */
// --- what happened, counted -----------------------------------------------------------------
//
// Each card reports once, when it closes or when the reader leaves with it
// open: what opened it and what the reader did - answered, how many in a row,
// "Not now", closed, "Don't ask me again", or nothing at all - and how the
// location check went. Counts only, added up by day; see _prompts/handlers.mjs.

function report(story) {
	if (story.sent) return;
	story.sent = true;
	const { sent, ...fields } = story;
	const body = JSON.stringify({ kind: 'pulse', ...fields });
	try {
		if (navigator.sendBeacon?.('/api/prompts?r=report', new Blob([body], { type: 'application/json' }))) return;
	} catch { /* fall back to fetch */ }
	fetch('/api/prompts?r=report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
}

window.addEventListener('pagehide', () => {
	if (!card) return;
	card.story.answers = card.answered;
	card.story.outcome = card.answered ? 'answered' : 'ignored';
	report(card.story);
});

export function openPulseCard({ question = null, pool = [], min = 10, why = 'page', paused = null, onShow, onClose } = {}) {
	addStyles();
	if (card) closeCard({ quiet: true });
	const root = element('aside', { class: 'pp', role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': 'pp-q', 'data-clarity-mask': 'true' });
	const body = element('div', { class: 'pp-body' });
	const close = element('button', { type: 'button', class: 'pp-x', 'aria-label': 'Close', text: '×' });
	root.append(element('div', { class: 'pp-head' }, [element('span', { class: 'pp-eyebrow', text: 'Nairobi Pulse' }), close]), body);
	document.body.append(root);
	card = {
		root, body, question, pool, min, why, paused, onShow, onClose, answered: 0, returnTo: document.activeElement,
		story: { why: question ? why : 'checkin', outcome: 'ignored', answers: 0, asked: false, located: '', map: false },
	};
	close.addEventListener('click', () => closeCard({ dismissed: true, how: 'close' }));
	root.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeCard({ dismissed: true, how: 'close' }); });
	document.querySelector('.support-float')?.classList.add('is-yielding-pulse');
	if (question) ask(question);
	else checkIn();
	// The closed position paints first, so the slide is seen; the timer is for a
	// tab that is not painting, which never gets the frame.
	requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('is-open')));
	setTimeout(() => root.classList.add('is-open'), 80);
	// Asked for - a button, the back gesture - the card takes the focus;
	// arriving on its own, it leaves the reader where they were.
	if (why === 'page' || why === 'back' || why === 'test') body.querySelector('.pp-q')?.focus({ preventScroll: true });
	return card;
}

export function closeCard({ dismissed = false, quiet = false, how = 'close' } = {}) {
	if (!card) return;
	const { root, onClose, answered, returnTo, story } = card;
	card = null;
	story.answers = answered;
	story.outcome = answered ? 'answered' : how;
	report(story);
	document.querySelector('.support-float')?.classList.remove('is-yielding-pulse');
	root.classList.remove('is-open');
	setTimeout(() => root.remove(), quiet || reduceMotion() ? 0 : 300);
	if (root.contains(document.activeElement)) returnTo?.focus?.({ preventScroll: true });
	onClose?.({ dismissed: dismissed && !answered, answered });
}

const heading = (text) => element('h2', { class: 'pp-q', id: 'pp-q', tabindex: '-1', text });
const mapLink = (q) => (location.pathname.startsWith('/pulse') ? null : element('a', {
	class: 'pp-link',
	href: `/pulse#q=${q.id}`,
	text: 'See how Nairobi answered',
	onclick: () => { if (card) card.story.map = true; },
}));

function ask(q, note = '') {
	if (!card) return;
	card.question = q;
	card.onShow?.(q);
	const mine = myVotes()[q.id];
	const pass = currentPass();
	card.body.replaceChildren(...[
		element('p', { class: 'pp-kicker', text: card.answered ? `Thank you. Here is another - ${card.answered} answered` : card.why === 'leaving' || card.why === 'back' ? 'Before you go: one question for Nairobi' : 'A quick question for Nairobi' }),
		heading(q.text),
		q.context ? element('p', { class: 'pp-context', text: q.context }) : null,
		card.paused ? element('p', { class: 'pp-message', text: card.paused }) : null,
		// Short answers sit side by side, so the card stays a strip at the
		// bottom of a phone rather than a wall over the page.
		element('div', { class: `pp-options${q.options.every((o) => o.label.length <= 16) ? ' is-chips' : ''}`, role: 'group', 'aria-label': 'Answers' }, q.options.map((o) => element('button', {
			type: 'button',
			class: 'pp-option',
			'aria-pressed': String(mine === o.id),
			...(card.paused ? { disabled: '' } : {}),
			text: o.label,
			onclick: () => choose(q, o),
		}))),
		note ? element('p', { class: 'pp-message', role: 'alert', text: note }) : null,
		element('p', { class: 'pp-note', text: pass
			? `Counted in ${pass.district.name}, where you checked in. Only votes from inside Nairobi count.`
			: 'Only votes from inside Nairobi count, each in its own constituency.' }),
		element('div', { class: 'pp-row' }, [
			mapLink(q),
			card.why === 'page' ? null : element('button', { type: 'button', class: 'pp-link is-quiet', text: 'Not now', onclick: () => closeCard({ dismissed: true, how: 'notnow' }) }),
			card.why === 'page' || card.why === 'test' ? null : element('button', { type: 'button', class: 'pp-link is-quiet', text: "Don't ask me again", onclick: () => { snooze(); closeCard({ dismissed: true, how: 'never' }); } }),
		].filter(Boolean)),
	].filter(Boolean));
}

function choose(q, option) {
	if (!currentPass()) return locateFor(q, option);
	return send(q, option);
}

function busy(text) {
	card.body.querySelectorAll('button').forEach((b) => { b.disabled = true; });
	card.body.append(element('p', { class: 'pp-busy', role: 'status', text }));
}

// A first vote: one location check, explained before the browser asks.
function locateFor(q, option, problem = '') {
	card.story.asked = true;
	card.body.replaceChildren(...[
		element('p', { class: 'pp-kicker', text: option ? `Your answer: ${option.label}` : '' }),
		heading('One check: are you in Nairobi?'),
		element('p', { class: 'pp-context', text: 'Your phone shares where it is once, to find your constituency. The position is not kept - only the constituency, on this browser, for a week.' }),
		problem ? element('p', { class: 'pp-message', role: 'alert', text: problem }) : null,
		element('div', { class: 'pp-row' }, [
			element('button', { type: 'button', class: 'pp-button is-primary', text: option ? 'Share my location and vote' : 'Share my location', onclick: () => locateNow(q, option) }),
			element('button', { type: 'button', class: 'pp-link is-quiet', text: q ? 'Back' : 'Not now', onclick: () => (q ? ask(q) : closeCard({ dismissed: true, how: 'notnow' })) }),
		]),
	].filter(Boolean));
	card.body.querySelector('.pp-button')?.focus({ preventScroll: true });
}

async function locateNow(q, option) {
	busy('Asking your phone where it is. Allow it when your browser asks.');
	try {
		const pass = await checkLocation();
		if (!card) return;
		card.story.located = 'ok';
		if (q && option) return send(q, option);
		card.body.replaceChildren(
			heading(`You're in ${pass.district.name}`),
			element('p', { class: 'pp-context', text: 'Your answers count there for the next week, on this browser.' }),
			element('div', { class: 'pp-row' }, [element('button', { type: 'button', class: 'pp-button', text: 'Done', onclick: () => closeCard() })]),
		);
	} catch (error) {
		if (!card) return;
		card.story.located = error.code === 'outside' || error.code === 'country' ? 'outside' : error.code === 'blocked' ? 'refused' : 'failed';
		if (error.code === 'outside' || error.code === 'country') return outside(q, error.message);
		locateFor(q, option, error.message);
	}
}

function outside(q, message) {
	card.body.replaceChildren(...[
		heading('Only Nairobi counts here'),
		element('p', { class: 'pp-context', text: message }),
		element('div', { class: 'pp-row' }, [
			q ? mapLink(q) : null,
			element('button', { type: 'button', class: 'pp-button', text: 'Close', onclick: () => { snooze(7); closeCard(); } }),
		].filter(Boolean)),
	].filter(Boolean));
}

async function send(q, option) {
	busy('Counting your answer…');
	try {
		const answer = await vote(q, option.id);
		if (!card) return;
		card.answered++;
		done(q, option, answer);
	} catch (error) {
		if (!card) return;
		if (error.code === 'pass') return locateFor(q, option, error.message);
		ask(q, error.message);
	}
}

function done(q, option, answer) {
	const r = results(q, answer, card.min);
	const next = unanswered(card.pool, q.id);
	const where = answer.vote?.district_name || currentPass()?.district.name || '';
	card.body.replaceChildren(...[
		element('p', { class: 'pp-kicker', text: answer.unchanged ? 'That was already your answer.' : answer.changed ? `Changed. It counts in ${where}.` : `Counted in ${where}. Thank you.` }),
		heading(q.text),
		r.shown
			? element('ul', { class: 'pp-bars', 'aria-label': "How Nairobi answered" }, r.rows.map((row) => element('li', {}, [element('div', { class: `pp-bar${row.id === option.id ? ' is-yours' : ''}` }, [
				element('span', { text: row.id === option.id ? `${row.label} (you)` : row.label }),
				element('span', { text: pct(row.share) }),
				element('span', { class: 'pp-track', 'aria-hidden': 'true' }, [element('span', { class: 'pp-fill', style: `width:${Math.round(row.share * 100)}%` })]),
			])])))
			: element('p', { class: 'pp-context', text: `${count(r.total)} ${r.total === 1 ? 'vote' : 'votes'} so far. Nairobi's answer shows from ${card.min}.` }),
		element('div', { class: 'pp-row' }, [
			next ? element('button', { type: 'button', class: 'pp-button is-primary', text: 'Next question', onclick: () => ask(next) }) : null,
			mapLink(q),
			element('button', { type: 'button', class: next ? 'pp-link is-quiet' : 'pp-button', text: next ? 'Done for now' : 'Done', onclick: () => closeCard() }),
		].filter(Boolean)),
	].filter(Boolean));
	card.body.querySelector('.pp-button')?.focus({ preventScroll: true });
}

/** The card with no question: check where the reader is, from /pulse's "Check in". */
function checkIn() {
	locateFor(null, null);
}
