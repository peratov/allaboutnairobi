// How readers meet the site's two prompts - Nairobi Pulse's question card and
// the guide rating - counted, never recorded.
//
// Each prompt sends one report when it closes, or when the reader leaves with
// it still open: what brought it up, and what the reader did with it. The
// report becomes increments to the day's document (prompt_days/<YYYY-MM-DD>),
// in one write; the report itself is not kept, and nothing in it is about a
// person - no id, no device, no page they were on beyond the trigger.
//
// A Pulse card's report (kind "pulse"):
//
//   why       what opened it: reading, leaving (the pointer heading for the
//             tabs), back (the back gesture), page (/pulse's own button),
//             test (?pulse=ask), checkin (/pulse's "Check in", no question)
//   outcome   answered, notnow, close, never ("Don't ask me again"), or ignored
//             - the reader left with it still open
//   answers   how many questions were answered in it, one after another
//   asked     whether the location check was shown
//   located   how the check went: ok, outside, refused (the browser said no),
//             failed (no fix, no connection)
//   map       whether "See how Nairobi answered" was followed
//
// A rating prompt's report (kind "rating"): outcome scored, dismissed or
// ignored; the score, 1 to 5; and contact, whether the "tell us" link under a
// low score was followed.
//
// Every value is checked against these lists and every number clamped, so a
// report can only ever move the counters it names. The hourly limit is kept
// in the warm function's memory, as Home Ride's play counts' is, for the same
// reason: a row per report to count reports would cost more than the reports.

import { HttpError } from '../_lostfound/http.mjs';
import { sum } from '../_shared/counters.mjs';

export const vocab = {
	whys: ['reading', 'leaving', 'back', 'page', 'test'],
	pulseOutcomes: ['answered', 'notnow', 'close', 'never', 'ignored'],
	located: ['ok', 'outside', 'refused', 'failed'],
	ratingOutcomes: ['scored', 'dismissed', 'ignored'],
	perHour: 200,
};

const fail = (message, code = 'invalid') => { throw new HttpError(400, message, code); };
export const isoDay = (offset = 0) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
const one = (value, list, fallback) => (list.includes(value) ? value : fallback);
const whole = (value, max) => {
	const n = Math.round(Number(value));
	return Number.isFinite(n) && n > 0 ? Math.min(n, max) : 0;
};

/** A report as the counters it moves, dotted paths into the day's document. */
export function increments(body) {
	const add = {};
	const bump = (key, n = 1) => { if (n) add[key] = (add[key] || 0) + n; };
	if (body?.kind === 'pulse') {
		if (body.why === 'checkin') {
			// "Check in" on /pulse asks no question: it is the location check alone.
			bump('pulse.checkin');
		} else {
			const why = one(body.why, vocab.whys, 'reading');
			bump(`pulse.shown.${why}`);
			// The answers decide whether it was answered, whatever the outcome says.
			const answers = whole(body.answers, 50);
			let outcome = one(body.outcome, vocab.pulseOutcomes, 'ignored');
			if (answers) outcome = 'answered';
			else if (outcome === 'answered') outcome = 'ignored';
			bump(`pulse.outcome.${outcome}`);
			if (answers) {
				bump('pulse.answers', answers);
				bump(`pulse.answeredBy.${why}`);
				bump(`pulse.chain.${Math.min(answers, 4)}`);
			}
			if (body.map === true) bump('pulse.map');
		}
		if (body.asked === true) bump('pulse.locate.asked');
		if (vocab.located.includes(body.located)) bump(`pulse.locate.${body.located}`);
	} else if (body?.kind === 'rating') {
		bump('rating.shown');
		// Likewise the score decides whether it was scored.
		const score = whole(body.score, 5);
		let outcome = one(body.outcome, vocab.ratingOutcomes, 'ignored');
		if (score) outcome = 'scored';
		else if (outcome === 'scored') outcome = 'ignored';
		bump(`rating.outcome.${outcome}`);
		if (score) bump(`rating.score.${score}`);
		if (body.contact === true) bump('rating.contact');
	} else {
		fail('Not a report this counts.', 'kind');
	}
	return add;
}

const seen = new Map();
function withinLimit(ip, now = Date.now()) {
	const hour = Math.floor(now / 3600000);
	const entry = seen.get(ip);
	if (!entry || entry.hour !== hour) {
		if (seen.size > 5000) seen.clear();
		seen.set(ip, { hour, n: 1 });
		return true;
	}
	return ++entry.n <= vocab.perHour;
}
export const forgetLimits = () => seen.clear();

export const routes = {
	async report({ store, body, ip }) {
		const add = increments(body);
		if (!withinLimit(ip)) throw new HttpError(429, 'That is a lot of reports from one connection this hour.', 'rate');
		const day = isoDay(0);
		await store.write([{ table: 'prompt_days', id: day, add, merge: { day, updated_at: new Date().toISOString() } }]);
		return { ok: true };
	},
};

// --- for the admin ---------------------------------------------------------------------------

const total = (map) => Object.values(map || {}).reduce((a, n) => a + (typeof n === 'number' ? n : 0), 0);
const SUMMARY_TTL = 60000;
const cache = new Map();

/** This period and the one before, day by day, and all time - every day is one document. */
export async function summary(store, days, { fresh = false } = {}) {
	const key = `${store.name}|${days}`;
	const hit = cache.get(key);
	if (!fresh && hit && Date.now() - hit.at < SUMMARY_TTL) return hit.value;
	const rows = await store.select('prompt_days', { order: ['day', 'asc'] });
	const from = isoDay(-(days - 1));
	const before = isoDay(-(2 * days - 1));
	const byDay = new Map(rows.map((r) => [r.day, r]));
	const daily = [];
	for (let i = days - 1; i >= 0; i--) {
		const date = isoDay(-i);
		const r = byDay.get(date) || {};
		daily.push({
			date,
			pulseShown: total(r.pulse?.shown),
			pulseAnswered: total(r.pulse?.answeredBy),
			ratingShown: r.rating?.shown || 0,
			ratingScored: r.rating?.outcome?.scored || 0,
		});
	}
	const value = {
		days,
		from,
		to: isoDay(0),
		current: sum(rows.filter((r) => r.day >= from)),
		previous: sum(rows.filter((r) => r.day >= before && r.day < from)),
		allTime: sum(rows),
		first: rows[0]?.day || null,
		daily,
		vocab,
		updated_at: new Date().toISOString(),
	};
	cache.set(key, { at: Date.now(), value });
	return value;
}

export const forgetSummaries = () => cache.clear();
