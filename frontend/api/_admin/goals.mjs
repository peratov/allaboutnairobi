// The site's goals: where search and readership stood when the 90-day
// calendar began, where they are now, where they should be by a date, and
// whether the line between the first two is heading for the third.
//
// Every number but the targets is measured. The baseline is read from Search
// Console and GA4 for one fixed window - the 28 days to 23 September 2026,
// the same window as the export seo/guide-pipeline-2026-09.md was drawn from,
// so the two can be checked against each other - and "now" is the latest 28
// complete days. The targets are decisions, written here with the reason for
// each, and the owner can move any of them in the admin (lf_settings `goals`).
//
// The lesson of the first exports runs through it: the site never had an
// impressions problem, it had a clicks problem, and three quarters of its
// impressions were searches no page of ours can win. So the search goals are
// measured on winnable searches only - not a portal's name, not "near me",
// not a glossary word Google answers on the results page - and impressions
// are never a goal on their own without the click-through beside them.
//
// "On track" compares how far a goal has come with how far it should have by
// today. Counts that grow by multiplying - clicks, visitors - are judged on a
// log scale, so going from 1 to 2 a day in October is the same progress as 5
// to 10 in December; rates and shares are judged on a straight line.

import { cached, ga, guarded, searchQuery } from './analytics.mjs';

export const BASELINE = { start: '2026-08-27', end: '2026-09-23', label: 'the 28 days to 23 September 2026' };
const CALENDAR_END = '2026-12-15';
const WINDOW = 28;
const TTL = 30 * 60000;

const why = {
	clicks: 'The click problem in one number. Position 9.7 should draw one or two clicks in a hundred; on the 600 winnable impressions a day aimed for below, that is about ten a day by the end of the calendar.',
	impressions: 'Searches the site can actually win: not a portal\'s name (icums was three quarters of September\'s impressions), not "near me", not a glossary word. The calendar adds about forty pages aimed at real queries; tripling the winnable demand is what that should buy.',
	ctr: 'Of winnable searches that showed a page of ours, how many chose it. September\'s guides drew 0.26%; a page in the top ten should draw well over 1%. This is the title-and-description work, and it moves faster than ranking does.',
	pageOne: 'Winnable searches where a page of ours averages position ten or better, seen at least ten times in 28 days. Week 13 of the calendar re-optimises everything at 6 to 15; three times the baseline is what a working calendar looks like.',
	pagesSeen: 'Pages that showed up in Google at least once in 28 days, out of about 350 in the sitemap. A page nobody is shown is either not indexed or not ranking for anything, and either is worth knowing before writing another.',
	pagesClicked: 'Pages that earned at least one click in 28 days. Growth that comes from a handful of pages is fragile; the cluster pages exist to spread it.',
	visitors: 'Everyone, from every channel - about a hundred a day in October. Three times that by the end of the calendar, with search carrying most of the growth.',
	searchShare: 'Visits that arrive from Google\'s ordinary results. A reference site lives on search; sharing and the newsletter should grow too, but if this share falls while visitors rise, the growth is not coming from the guides.',
	subscribers: 'People who confirmed their address and get every issue - the one audience no algorithm can take away. Counted from the site\'s own list.',
};

/**
 * The goals and their defaults. `target` is a number, or `{ times }` - a
 * multiple of the measured baseline, for counts nobody had measured before.
 * `scale` is how progress is judged: `log` for counts that grow by
 * multiplying, `linear` for rates and shares.
 */
export const GOALS = [
	{ id: 'clicks', group: 'search', source: 'sc', label: 'Clicks from Google, a day', format: 'perDay', scale: 'log', target: 10, by: CALENDAR_END },
	{ id: 'impressions', group: 'search', source: 'sc', label: 'Winnable impressions, a day', format: 'perDay', scale: 'log', target: 600, by: CALENDAR_END },
	{ id: 'ctr', group: 'search', source: 'sc', label: 'Click-through on winnable searches', format: 'pct', scale: 'linear', target: 0.015, by: CALENDAR_END },
	{ id: 'pageOne', group: 'search', source: 'sc', label: 'Winnable searches on page one', format: 'int', scale: 'log', target: { times: 3 }, by: CALENDAR_END },
	{ id: 'pagesSeen', group: 'search', source: 'sc', label: 'Pages seen in Google', format: 'int', scale: 'linear', target: 300, by: CALENDAR_END },
	{ id: 'pagesClicked', group: 'search', source: 'sc', label: 'Pages that earn clicks', format: 'int', scale: 'log', target: 50, by: CALENDAR_END },
	{ id: 'visitors', group: 'audience', source: 'ga', label: 'Visitors, a day', format: 'perDay', scale: 'log', target: 300, by: CALENDAR_END },
	{ id: 'searchShare', group: 'audience', source: 'ga', label: 'Visits from Google search', format: 'pct', scale: 'linear', target: 0.4, by: CALENDAR_END },
	{ id: 'subscribers', group: 'owned', source: 'site', label: 'Newsletter subscribers', format: 'int', scale: 'linear', target: 250, by: '2026-12-31' },
].map((g) => ({ ...g, why: why[g.id] }));

const byId = new Map(GOALS.map((g) => [g.id, g]));

// --- what counts as winnable -------------------------------------------------------------
//
// Kept in step with "Writing for search" in CLAUDE.md. A navigational search
// is someone looking for somebody else's site; "near me" is owned by the map
// pack; a glossary page is a definition Google answers on the results page.

const NAVIGATIONAL = /\b(icums|portal|login|log in|sign in|signin|website|www|\.gov|\.com)\b/i;
const NEAR_ME = /\b(near me|nearby|near by|around me|close to me|closest to me)\b/i;

export function winnable({ query, page }) {
	const path = (() => { try { return new URL(page).pathname; } catch { return String(page || ''); } })();
	return !NAVIGATIONAL.test(query || '') && !NEAR_ME.test(query || '') && !path.startsWith('/glossary');
}

// --- dates -------------------------------------------------------------------------------

const DAY = 86400000;
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const at = (day) => Date.parse(`${day}T00:00:00Z`);
const shift = (day, n) => iso(at(day) + n * DAY);

function windowsEndingOn(end) {
	const current = { start: shift(end, -(WINDOW - 1)), end };
	const previous = { start: shift(current.start, -WINDOW), end: shift(current.start, -1) };
	return { baseline: { start: BASELINE.start, end: BASELINE.end }, previous, current };
}

const inWindow = (date, w) => date >= w.start && date <= w.end;

/** Days in a window from the first day anything was recorded, so a site that is younger than its window is not divided by days it did not exist. */
function daysIn(w, first) {
	if (!first) return 0;
	const from = Math.max(at(w.start), at(first));
	return from > at(w.end) ? 0 : Math.round((at(w.end) - from) / DAY) + 1;
}

const sum = (rows, key) => rows.reduce((n, r) => n + (Number(r[key]) || 0), 0);

// --- measuring -----------------------------------------------------------------------------

/** Search Console's goals for one window, from its rows. Pure, for the checks. */
export function searchMetrics({ daily, pairs, pages, window: w, first }) {
	const days = daysIn(w, first);
	const won = pairs.filter(winnable);
	const wonImpressions = sum(won, 'impressions');
	return {
		clicks: days ? sum(daily.filter((d) => inWindow(d.date, w)), 'clicks') / days : null,
		impressions: days ? wonImpressions / days : null,
		ctr: wonImpressions ? sum(won, 'clicks') / wonImpressions : null,
		pageOne: new Set(won.filter((p) => p.position <= 10 && p.impressions >= 10).map((p) => p.query)).size,
		pagesSeen: pages.filter((p) => p.impressions > 0).length,
		pagesClicked: pages.filter((p) => p.clicks > 0).length,
	};
}

/** GA4's goals for one window. Pure, for the checks. */
export function audienceMetrics({ daily, channels, window: w, first }) {
	const days = daysIn(w, first);
	const sessions = sum(channels, 'sessions');
	const organic = sum(channels.filter((c) => c.channel === 'Organic Search'), 'sessions');
	return {
		visitors: days ? sum(daily.filter((d) => inWindow(d.date, w)), 'users') / days : null,
		searchShare: sessions ? organic / sessions : null,
	};
}

const scRows = (rows) => rows.map((r) => ({ keys: r.keys || [], clicks: r.clicks || 0, impressions: r.impressions || 0, position: r.position || 0 }));

function searchPart(env, fresh) {
	return cached('goals:sc', fresh, async () => {
		// Search Console lags about two days: end three days back, so every day
		// in every window is complete.
		const end = iso(Date.now() - 3 * DAY);
		const windows = windowsEndingOn(end);
		const span = (w) => ({ startDate: w.start, endDate: w.end });
		const names = ['baseline', 'previous', 'current'];
		const [daily, ...rest] = await Promise.all([
			searchQuery(env, { startDate: BASELINE.start, endDate: end, dimensions: ['date'], rowLimit: 1000 }),
			...names.map((n) => searchQuery(env, { ...span(windows[n]), dimensions: ['query', 'page'], rowLimit: 25000 })),
			...names.map((n) => searchQuery(env, { ...span(windows[n]), dimensions: ['page'], rowLimit: 25000 })),
		]);
		const days = scRows(daily.rows).map((r) => ({ date: r.keys[0], clicks: r.clicks, impressions: r.impressions })).sort((a, b) => (a.date < b.date ? -1 : 1));
		const first = days.find((d) => d.impressions > 0)?.date || null;
		const values = {};
		names.forEach((n, i) => {
			const pairs = scRows(rest[i].rows).map((r) => ({ query: r.keys[0], page: r.keys[1], clicks: r.clicks, impressions: r.impressions, position: r.position }));
			const pages = scRows(rest[i + 3].rows).map((r) => ({ page: r.keys[0], clicks: r.clicks, impressions: r.impressions }));
			values[n] = searchMetrics({ daily: days, pairs, pages, window: windows[n], first });
		});
		return { windows, first, values, daily: days };
	}, TTL);
}

function audiencePart(env, fresh) {
	return cached('goals:ga', fresh, async () => {
		const end = iso(Date.now() - DAY);
		const windows = windowsEndingOn(end);
		const names = ['baseline', 'previous', 'current'];
		const range = (w) => [{ startDate: w.start, endDate: w.end }];
		const answer = await ga(env, 'batchRunReports', { requests: [
			{ dateRanges: [{ startDate: BASELINE.start, endDate: end }], dimensions: [{ name: 'date' }], metrics: [{ name: 'activeUsers' }, { name: 'sessions' }], orderBys: [{ dimension: { dimensionName: 'date' } }], limit: 1000 },
			...names.map((n) => ({ dateRanges: range(windows[n]), dimensions: [{ name: 'sessionDefaultChannelGroup' }], metrics: [{ name: 'sessions' }], limit: 50 })),
		] });
		const [dailyReport, ...channelReports] = answer.reports;
		const value = (v) => Number(v?.value || 0);
		const days = (dailyReport.rows || []).map((r) => {
			const d = r.dimensionValues[0].value;
			return { date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`, users: value(r.metricValues[0]), sessions: value(r.metricValues[1]) };
		}).sort((a, b) => (a.date < b.date ? -1 : 1));
		const first = days.find((d) => d.users > 0)?.date || null;
		const values = {};
		names.forEach((n, i) => {
			const channels = (channelReports[i].rows || []).map((r) => ({ channel: r.dimensionValues[0].value, sessions: value(r.metricValues[0]) }));
			values[n] = audienceMetrics({ daily: days, channels, window: windows[n], first });
		});
		return { windows, first, values, daily: days };
	}, TTL);
}

/**
 * The newsletter's confirmed subscribers now and 28 days ago. Its baseline is
 * none, on the day the list began (its first day of counts): judging a list
 * that opened in October against September would call it behind for not
 * existing.
 */
async function ownedPart(store) {
	const now = await store.count('nl_subscribers', [['status', 'eq', 'subscribed']]);
	const today = iso(Date.now());
	const cut = shift(today, -WINDOW);
	const [rows, [firstDay]] = await Promise.all([
		store.select('nl_days', { filters: [['day', 'gt', cut]] }),
		store.select('nl_days', { order: ['day', 'asc'], limit: 1 }),
	]);
	const net = rows.reduce((n, r) => n + (r.confirmed || 0) - (r.unsubscribed || 0) - (r.bounced || 0) - (r.complained || 0), 0);
	return { start: firstDay?.day || today, values: { baseline: { subscribers: 0 }, previous: { subscribers: Math.max(0, now - net) }, current: { subscribers: now } } };
}

// --- judging -----------------------------------------------------------------------------------

export function resolveTarget(goal, baseline) {
	if (typeof goal.target === 'number') return goal.target;
	if (goal.target?.times) return baseline ? Math.max(1, Math.ceil(baseline * goal.target.times)) : null;
	return null;
}

/**
 * Where a goal stands. `now` is a time; dates are YYYY-MM-DD. Statuses:
 * reached, on-track, behind, off-track, early (too soon after the baseline to
 * say), missed (past its date), unknown (no measurement).
 */
export function assess({ scale, by, from = BASELINE.end }, { baseline, current, target }, now = Date.now()) {
	if (current === null || current === undefined || baseline === null || baseline === undefined || target === null || target === undefined) return { status: 'unknown' };
	const start = at(from);
	const end = at(by);
	const span = Math.max(DAY, end - start);
	const expected = Math.min(1, Math.max(0, (now - start) / span));
	const up = target >= baseline;
	const reached = up ? current >= target : current <= target;
	const logOk = scale === 'log' && baseline > 0 && target > 0;
	const f = logOk ? (x) => Math.log(Math.max(x, 1e-9)) : (x) => x;
	const g = logOk ? Math.exp : (x) => x;
	const distance = f(target) - f(baseline);
	const progress = distance ? (f(current) - f(baseline)) / distance : (reached ? 1 : 0);
	const pace = g(f(baseline) + expected * distance);
	const daysLeft = Math.max(0, Math.ceil((end - now) / DAY));
	// When the target is reached if the line from baseline to now carries on.
	const projected = progress > 0 && !reached && now > start ? iso(start + (now - start) / progress) : null;
	// What it takes from here: a weekly multiple, or a weekly step.
	let needed = null;
	if (!reached && daysLeft > 0) {
		needed = logOk && current > 0
			? { kind: 'growth', perWeek: (target / current) ** (7 / daysLeft) - 1 }
			: { kind: 'step', perWeek: (target - current) / (daysLeft / 7) };
	}
	let status;
	if (reached) status = 'reached';
	else if (now > end) status = 'missed';
	else if (expected < 0.1) status = 'early';
	else if (progress >= expected - 0.05) status = 'on-track';
	else if (progress >= expected * 0.5) status = 'behind';
	else status = 'off-track';
	return { status, progress, expected, pace, projected, needed, daysLeft };
}

/** The pace a daily series should have kept, for each of its dates. */
function pacePath(goal, baseline, target, dates) {
	if (!(baseline > 0) || !(target > 0)) return dates.map(() => null);
	const start = at(BASELINE.end);
	const span = Math.max(DAY, at(goal.by) - start);
	const logOk = goal.scale === 'log';
	return dates.map((d) => {
		const t = Math.min(1, Math.max(0, (at(d) - start) / span));
		if (at(d) < start) return baseline;
		return logOk ? Math.exp(Math.log(baseline) + t * (Math.log(target) - Math.log(baseline))) : baseline + t * (target - baseline);
	});
}

const rolling = (rows, key, n = 7) => rows.map((r, i) => {
	const part = rows.slice(Math.max(0, i - n + 1), i + 1);
	return sum(part, key) / part.length;
});

// --- the routes ----------------------------------------------------------------------------------

async function overridesOf(store) {
	const [row] = await store.select('lf_settings', { filters: [['id', 'eq', 'goals']] });
	return row?.targets || {};
}

export async function goalsView(store, env, { fresh = false } = {}) {
	const [sc, gaPart, owned, overrides] = await Promise.all([
		guarded(() => searchPart(env, fresh)),
		guarded(() => audiencePart(env, fresh)),
		store ? ownedPart(store).then((v) => ({ ready: true, ...v })).catch(() => ({ ready: false, reason: 'database' })) : { ready: false, reason: 'database' },
		store ? overridesOf(store).catch(() => ({})) : {},
	]);
	const parts = { sc, ga: gaPart, site: owned };
	const goals = GOALS.map((goal) => {
		const part = parts[goal.source];
		const o = overrides[goal.id] || {};
		const chosen = { ...goal, target: typeof o.target === 'number' ? o.target : goal.target, by: o.by || goal.by };
		const v = (n) => (part.ready ? part.values[n]?.[goal.id] ?? null : null);
		const baseline = v('baseline');
		const target = resolveTarget(chosen, baseline);
		const view = {
			id: goal.id, group: goal.group, source: goal.source, label: goal.label, format: goal.format, scale: goal.scale, why: goal.why,
			by: chosen.by, target, changed: Boolean(o.target !== undefined || o.by),
			defaults: { target: resolveTarget(goal, baseline), by: goal.by, rule: goal.target?.times ? `${goal.target.times} times the baseline` : null },
			baseline, previous: v('previous'), current: v('current'),
			ready: part.ready, reason: part.ready ? null : part.reason,
		};
		const from = goal.source === 'site' && part.ready ? part.start : BASELINE.end;
		return { ...view, from, ...assess({ ...chosen, from }, { baseline, current: view.current, target }) };
	});
	// A seven-day average of a daily series, every calendar day from the first
	// with data (both sources leave out days with nothing), beside the pace the
	// goal needs.
	const trend = (part, key, goalId, series) => {
		if (!part.ready || !part.first) return null;
		const g = goals.find((x) => x.id === goalId);
		const byDate = new Map(part.daily.map((d) => [d.date, d]));
		const days = [];
		for (let d = part.first; d <= part.windows.current.end; d = shift(d, 1)) days.push(byDate.get(d) || { date: d, [key]: 0 });
		const dates = days.map((d) => d.date);
		return { dates, values: rolling(days, key), pace: pacePath(g, g.baseline, g.target, dates), name: series };
	};
	const summary = {};
	for (const g of goals) summary[g.status] = (summary[g.status] || 0) + 1;
	return {
		baseline: BASELINE,
		calendarEnd: CALENDAR_END,
		windows: { sc: sc.ready ? sc.windows : null, ga: gaPart.ready ? gaPart.windows : null },
		sources: Object.fromEntries(Object.entries(parts).map(([k, p]) => [k, p.ready ? { ready: true } : { ready: false, reason: p.reason, account: p.account, link: p.link, message: p.message }])),
		goals,
		summary,
		trends: {
			clicks: trend(sc, 'clicks', 'clicks', 'Clicks a day'),
			visitors: trend(gaPart, 'users', 'visitors', 'Visitors a day'),
		},
		cachedAt: sc.cachedAt || gaPart.cachedAt || null,
	};
}

/** The owner moves a target or its date, or puts the default back. */
export async function goalsAction(store, body, log) {
	const goal = byId.get(String(body.id || ''));
	if (!goal) return { error: 'No such goal.' };
	const overrides = await overridesOf(store);
	if (body.action === 'reset') {
		delete overrides[goal.id];
	} else {
		const target = Number(body.target);
		const by = String(body.by || '');
		if (!Number.isFinite(target) || target < 0 || (goal.format === 'pct' && target > 1)) return { error: goal.format === 'pct' ? 'A share is between 0 and 100%.' : 'The target is a number, zero or more.' };
		if (!/^\d{4}-\d{2}-\d{2}$/.test(by) || at(by) <= Date.now() || at(by) > Date.now() + 3 * 365 * DAY) return { error: 'The date is a day in the next three years.' };
		overrides[goal.id] = { target, by };
	}
	const [existing] = await store.select('lf_settings', { filters: [['id', 'eq', 'goals']] });
	const value = { targets: overrides, updated_at: new Date().toISOString() };
	if (existing) await store.update('lf_settings', [['id', 'eq', 'goals']], value);
	else await store.insert('lf_settings', { id: 'goals', ...value });
	await log(goal.id, body.action === 'reset' ? 'back to the default' : `${body.target} by ${body.by}`);
	return { ok: true };
}
