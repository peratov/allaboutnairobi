/**
 * "Was this guide useful?" - the sampled prompt, and nothing else.
 *
 * There is no backend, so the honest design follows from that and from one
 * number: the site draws a great many impressions and almost no clicks, and
 * nothing on it has ever told us which guides actually help a reader. Page
 * views cannot: a reader who lands, reads the wrong page and leaves looks
 * identical to one who got exactly what they came for.
 *
 * How a rating gets out of the browser
 * ------------------------------------
 * The CSP is `connect-src 'self'`, and that tightness is why /map has no tile
 * server and /radio needed its own policy. Widening it site-wide for a rating
 * widget would retract the promise on /terms for three hundred pages to serve
 * one, which is the same trade that was refused for Home Ride.
 *
 * So the vote rides on analytics that are already loaded and already
 * disclosed: a GA4 event through the `gtag` already in <head>. No new host, no
 * new policy, no new third party in /terms. The aggregate is pulled back by
 * hand with `mise ratings-data`, the way every other figure on this site is,
 * and committed as `content/ratings.yaml`.
 *
 * Why it asks the way it does
 * ---------------------------
 * `_install.scss` already says it, having learned it the hard way: a banner
 * pinned to the viewport is the pattern everyone has learned to dismiss
 * without reading, and on a phone it covers the thing being read. A rating
 * prompt cannot follow the install card into normal page flow - nobody would
 * ever see it - so it floats. Every rule below exists to stop it becoming the
 * advert that card refused to be:
 *
 *   * It waits until the guide has actually been read. Past the end of the
 *     article, and a real dwell time, or the answer means nothing anyway.
 *   * It asks a random minority. Most readers are never interrupted at all,
 *     which is the difference between a survey and a nag.
 *   * It asks a given reader once, then leaves them alone for a month, across
 *     every guide on the site. Browsing six guides must not mean six prompts.
 *   * It never covers the article text, never traps focus, and closes on
 *     Escape.
 *   * A refusal is an answer, and is remembered.
 *
 * There is deliberately no comment box. Free text typed into this site would
 * be the one thing /terms promises Clarity cannot capture, and sending it to
 * Google as an event parameter would make that untrue. A low score points at
 * /contact instead, where a reply is possible.
 */

const ANSWERED_PREFIX = 'rating-answered:';
const LAST_ASKED_KEY = 'rating-last-asked';

/** Ask a given reader at most once a month, however much they read. */
const QUIET_DAYS = 30;

/** Fraction of qualifying readers who are asked. The rest are left alone. */
const SAMPLE_RATE = 0.35;

/** How far down the article counts as having read it. */
const SCROLL_FRACTION = 0.7;

/** Shortest dwell that could plausibly be a read, in milliseconds. */
const MIN_DWELL = 25000;

function readStore(key) {
	try {
		return localStorage.getItem(key);
	} catch {
		// Private mode, or site data blocked. Treated as "nothing known".
		return null;
	}
}

function writeStore(key, value) {
	try {
		localStorage.setItem(key, value);
	} catch {
		// Nothing to do. The cost is being asked again on another visit, which
		// is better than failing to render the page.
	}
}

/** This reader has already answered or dismissed this particular guide. */
function alreadyAnswered(slug) {
	return readStore(ANSWERED_PREFIX + slug) !== null;
}

/** This reader was asked about something recently. Leave them alone. */
function inQuietPeriod() {
	const last = Number(readStore(LAST_ASKED_KEY));
	if (!last) return false;
	return Date.now() - last < QUIET_DAYS * 24 * 60 * 60 * 1000;
}

/**
 * Send the vote. GA4 is already in <head> and already in /terms; if the reader
 * blocks it, or an extension removed it, the vote is simply lost and the
 * prompt still behaves correctly. Nothing here waits on a network call.
 */
function send(slug, score) {
	try {
		if (typeof window.gtag === 'function') {
			window.gtag('event', 'guide_rating', {
				guide: slug,
				score: score,
				// Non-interaction: rating a guide should not alter bounce or
				// engagement reporting for the page it happened on.
				non_interaction: true,
			});
		}
	} catch {
		// An analytics failure is not worth a broken widget.
	}
}

/**
 * How the prompt went, counted: shown, then scored (and the score), dismissed,
 * or left open as the reader went - and whether the "tell us" link under a low
 * score was followed. One report, when it closes or the page goes, to the
 * site's own /api/prompts, which adds it to the day's totals and keeps nothing
 * else (see _prompts/handlers.mjs). The vote itself still goes to GA4 above.
 */
function report(story) {
	if (story.sent) return;
	story.sent = true;
	const body = JSON.stringify({ kind: 'rating', outcome: story.outcome, score: story.score, contact: story.contact });
	try {
		if (navigator.sendBeacon?.('/api/prompts?r=report', new Blob([body], { type: 'application/json' }))) return;
	} catch { /* fall back to fetch */ }
	fetch('/api/prompts?r=report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
}

export default function initializeGuideRating() {
	const panel = document.querySelector('[data-rating-prompt]');
	if (!panel) return;

	const slug = panel.dataset.ratingPrompt;
	if (!slug) return;

	const article = document.querySelector('.article-body');
	if (!article) return;

	// Idempotent. The layout calls this once, but a second call would attach a
	// second set of click handlers and every vote would be counted twice - and
	// it would be counted twice in the committed aggregate, silently, with
	// nothing on the page looking wrong. A feature whose whole purpose is a
	// trustworthy number cannot have that failure mode one refactor away.
	if (panel.dataset.ratingReady === 'yes') return;
	panel.dataset.ratingReady = 'yes';

	// Every gate that can be decided now, before any listener is attached.
	if (alreadyAnswered(slug) || inQuietPeriod()) return;
	if (Math.random() >= SAMPLE_RATE) return;

	const question = panel.querySelector('[data-rating-question]');
	const thanks = panel.querySelector('[data-rating-thanks]');
	const followUp = panel.querySelector('[data-rating-followup]');
	const buttons = Array.from(panel.querySelectorAll('[data-rating-score]'));
	const dismiss = panel.querySelector('[data-rating-dismiss]');

	const openedAt = Date.now();
	let shown = false;
	let closed = false;
	const story = { outcome: 'ignored', score: 0, contact: false, sent: false };
	followUp?.addEventListener('click', (event) => { if (event.target.closest('a')) story.contact = true; });

	/**
	 * The floating "Buy me a coffee" button lives in the same corner, and
	 * support.mjs already calls that out: two things in one corner is asking
	 * twice. It has a class for yielding, so use it rather than inventing a
	 * second stacking order and hoping.
	 */
	function yieldSupport(on) {
		const float = document.querySelector('.support-float');
		if (float) float.classList.toggle('is-yielding', on);
	}

	function close() {
		closed = true;
		if (shown) report(story);
		panel.hidden = true;
		yieldSupport(false);
		document.removeEventListener('keydown', onKeydown);
	}

	function onKeydown(event) {
		if (event.key === 'Escape' && shown && !closed) {
			writeStore(ANSWERED_PREFIX + slug, 'dismissed');
			if (story.outcome !== 'scored') story.outcome = 'dismissed';
			close();
		}
	}

	function show() {
		if (shown || closed) return;
		shown = true;
		panel.hidden = false;
		yieldSupport(true);
		// Marks the whole-site quiet period the moment we ask, not when the
		// reader answers, so an ignored prompt still buys them a month.
		writeStore(LAST_ASKED_KEY, String(Date.now()));
		document.addEventListener('keydown', onKeydown);
		window.addEventListener('pagehide', () => report(story));
	}

	function answer(score) {
		send(slug, score);
		story.outcome = 'scored';
		story.score = score;
		writeStore(ANSWERED_PREFIX + slug, String(score));

		question.hidden = true;
		// Two or below is the only answer worth acting on, and a reply needs a
		// way to reach us that a GA4 event cannot provide.
		if (score <= 2 && followUp) followUp.hidden = false;
		thanks.hidden = false;

		window.setTimeout(close, score <= 2 ? 9000 : 2600);
	}

	buttons.forEach((button) => {
		button.addEventListener('click', () => answer(Number(button.dataset.ratingScore)));
	});

	if (dismiss) {
		dismiss.addEventListener('click', () => {
			writeStore(ANSWERED_PREFIX + slug, 'dismissed');
			if (story.outcome !== 'scored') story.outcome = 'dismissed';
			close();
		});
	}

	// The read test. An IntersectionObserver on a sentinel after the article
	// would fire for anyone who jumped to the comments-shaped bottom of the
	// page; pairing depth with dwell is what makes it mean "read".
	function qualified() {
		if (Date.now() - openedAt < MIN_DWELL) return false;
		const box = article.getBoundingClientRect();
		const seen = window.innerHeight - box.top;
		return box.height > 0 && seen / box.height >= SCROLL_FRACTION;
	}

	let ticking = false;
	function onScroll() {
		if (ticking || shown || closed) return;
		ticking = true;
		window.requestAnimationFrame(() => {
			ticking = false;
			if (qualified()) {
				window.removeEventListener('scroll', onScroll);
				show();
			}
		});
	}

	window.addEventListener('scroll', onScroll, { passive: true });

	// A short guide can be read without ever scrolling, so the dwell alone
	// eventually qualifies - checked once rather than on an interval.
	window.setTimeout(() => {
		if (!shown && !closed && qualified()) show();
	}, MIN_DWELL + 500);
}
