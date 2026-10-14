// Nairobi Pulse, on every page: a question now and then, to readers in Nairobi.
//
// The map at /pulse is where the answers are read; this is where they are
// asked. Nobody has to find the page or be sent a link: a reader whose
// connection looks like Nairobi (`?r=where`, from what Vercel says about
// it, kept nowhere) is asked one question after a while of reading, again a
// while later, and as they leave - a card at the bottom of the screen, never
// over the text in the middle, gone with one tap.
//
// When it asks, and how often, is the admin's (Pulse -> Asking readers):
//
//   delay     seconds of reading, across the visit, before the first question
//   again     seconds more before the next; twice that after a "Not now"
//   perVisit  at most this many questions a visit, and none after two "Not now"s
//   leave     ask as someone leaves: the pointer heading for the tabs on a
//             computer, and the back gesture, once a visit, on the reading
//             pages. The back gesture is only listened for after the reader has
//             tapped the page - browsers ignore a history entry a page adds
//             before that - and the next back always leaves.
//
// "Don't ask me again" stops it for sixty days on this browser. A question
// already answered on this browser is never asked again; after an answer the
// card offers the next one, at random, and that is where most votes come from.
//
// This module is on every page, so it imports nothing and is small: whether
// to ask, and when. The card itself, its styles and the vote are in
// /js/pulse/card.mjs, fetched only when a card is about to open.
//
// ?pulse=ask on any page opens a card at once, whoever and wherever the
// reader is - for seeing it. A vote still needs the phone's own position in
// Nairobi, so that can never add a vote from anywhere else.

const WHERE = 'aaa:pulse:where';
const SNOOZE = 'aaa:pulse:snooze';
const VISIT = 'aaa:pulse:visit';
const SNOOZE_DAYS = 60;
// The pages where the back gesture is listened for: reading pages, which
// leave the history alone. The map, the dashboards and the sheets elsewhere
// keep history entries of their own.
const BACK_PAGES = /^\/(?:$|guides|glossary|docs|collections|newsletter|about|contact)/;

const read = (storage, key, fallback) => {
	try { return JSON.parse(storage.getItem(key)) ?? fallback; } catch { return fallback; }
};
const write = (storage, key, value) => {
	try { storage.setItem(key, JSON.stringify(value)); } catch { /* blocked: this visit only */ }
};

// --- the questions, and which to ask -------------------------------------------------------

let questionsCache = null;

/** The open questions, from the edge's copy of at most twenty seconds old. */
export async function openQuestions({ fresh = false } = {}) {
	if (!fresh && questionsCache && Date.now() - questionsCache.at < 20000) return questionsCache.data;
	const response = await fetch('/api/pulse?r=questions', { credentials: 'same-origin' });
	if (!response.ok) throw new Error(`questions: ${response.status}`);
	const data = await response.json();
	questionsCache = { at: Date.now(), data };
	return data;
}

/** An open question this browser has not answered, at random. */
export function unanswered(pool, except) {
	const mine = read(localStorage, 'aaa:pulse:votes', {}) || {};
	const left = (pool || []).filter((q) => !mine[q.id] && q.id !== except);
	return left.length ? left[Math.floor(Math.random() * left.length)] : null;
}

// --- when to ask ---------------------------------------------------------------------------------

export function snooze(days = SNOOZE_DAYS) {
	write(localStorage, SNOOZE, new Date(Date.now() + days * 86400000).toISOString());
}
const snoozed = () => {
	const until = read(localStorage, SNOOZE, null);
	return Boolean(until && until > new Date().toISOString());
};

/** Whether to ask this reader: the server's answer, kept six hours (a no, a day). */
async function where() {
	const saved = read(localStorage, WHERE, null);
	if (saved && Date.now() - saved.at < (saved.value?.ask ? 6 : 24) * 3600000) return saved.value;
	const response = await fetch('/api/pulse?r=where', { credentials: 'same-origin' });
	if (!response.ok) throw new Error(`where: ${response.status}`);
	const value = await response.json();
	write(localStorage, WHERE, { at: Date.now(), value });
	return value;
}

// Another card, the rating prompt, the install card, a dialog, or a reader
// typing: not now.
function busyElsewhere() {
	if (document.querySelector('.pp')) return true;
	if (document.querySelector('dialog[open], [data-rating-prompt]:not([hidden]), [data-install]:not([hidden])')) return true;
	const typing = document.activeElement?.matches?.('input, textarea, select, [contenteditable="true"]');
	return Boolean(typing);
}

export default function initPulsePrompt() {
	if (window.__pulsePrompt) return;
	window.__pulsePrompt = true;
	const path = location.pathname;
	if (path.startsWith('/admin') || path.startsWith('/pulse') || path.startsWith('/drive')) return;

	let settings = null;
	const visit = read(sessionStorage, VISIT, { active: 0, shown: 0, nextAt: null, dismissed: 0, backUsed: false, backArmed: false });
	const save = () => write(sessionStorage, VISIT, visit);

	if (new URLSearchParams(location.search).get('pulse') === 'ask') {
		setTimeout(() => show('test', { force: true }), 600);
		return;
	}
	if (snoozed()) return;

	/** Opens a card if one may open now; says whether it did. */
	async function show(why, { force = false } = {}) {
		if (!force) {
			if (!settings || snoozed() || visit.shown >= settings.perVisit || visit.dismissed >= 2) return false;
			// Something else on screen: the timer tries again shortly; a reader
			// leaving is let go.
			if (busyElsewhere()) {
				if (why === 'reading') visit.nextAt = visit.active + 20;
				return false;
			}
		}
		let data;
		try { data = await openQuestions(); } catch { return false; }
		if (!force && (!data.asking || data.paused)) { settings = null; return false; }
		const question = unanswered(data.live);
		if (!question) { if (!force) settings = null; return false; }
		if (!force) {
			visit.shown++;
			visit.nextAt = visit.active + settings.again;
			save();
		}
		const { openPulseCard } = await import('/js/pulse/card.mjs');
		openPulseCard({
			question,
			pool: data.live,
			min: data.min,
			why,
			paused: data.paused,
			onClose: ({ dismissed }) => {
				if (!dismissed || force) return;
				visit.dismissed++;
				visit.nextAt = visit.active + (settings?.again || 150) * 2;
				save();
			},
		});
		return true;
	}

	function arm(value) {
		settings = value;
		if (visit.nextAt === null) visit.nextAt = settings.delay;
		// Seconds of reading, counted only while the page is on screen, and
		// carried from page to page through the visit.
		let tick = 0;
		setInterval(() => {
			if (!settings || document.hidden || document.querySelector('.pp')) return;
			visit.active++;
			if (++tick % 5 === 0) save();
			if (visit.active >= visit.nextAt) show('reading');
		}, 1000);
		if (!settings.leave) return;

		// A computer: the pointer leaving through the top of the window, for the
		// tabs or the address bar.
		// Once a page, and only once a card has actually opened for it.
		let leftThisPage = false;
		document.addEventListener('mouseout', async (event) => {
			if (leftThisPage || event.relatedTarget || event.clientY > 0 || visit.active < 8) return;
			leftThisPage = true;
			if (!(await show('leaving'))) leftThisPage = false;
		});

		// The back gesture, on a reading page, once a visit. One history entry is
		// added on the reader's first tap that is not on a link or a control - a
		// browser ignores one added before any tap - and stepping back off it
		// brings the card instead of the page before. The next back leaves.
		if (!BACK_PAGES.test(path) || visit.backUsed) return;
		let armedHere = Boolean(history.state?.pulseBack);
		const onTap = (event) => {
			if (armedHere || visit.backArmed || visit.active < 10) return;
			if (event.target.closest?.('a[href], button, input, select, textarea, summary, label, [role="button"]')) return;
			history.pushState({ ...(history.state || {}), pulseBack: true }, '');
			armedHere = true;
			visit.backArmed = true;
			save();
		};
		document.addEventListener('pointerdown', onTap, true);
		window.addEventListener('popstate', (event) => {
			if (!armedHere || visit.backUsed || event.state?.pulseBack) return;
			visit.backUsed = true;
			save();
			show('back');
		});
	}

	const start = () => where().then((value) => { if (value?.ask) arm(value); }).catch(() => {});
	if ('requestIdleCallback' in window) requestIdleCallback(start, { timeout: 4000 });
	else setTimeout(start, 2000);
}
