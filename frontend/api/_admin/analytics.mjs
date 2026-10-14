// The admin's analytics: Google Analytics, Search Console, reader ratings, and
// lost and found's own numbers.
//
// Google is read as the site's service account - the same key as Firestore -
// which the owner adds by hand as a read-only user in GA4 and in Search
// Console. Nothing is stored: each answer is kept five minutes in a warm
// function, so a dashboard refreshed every few seconds still costs Google a
// handful of requests an hour.
//
// When something is not set up, the answer says exactly what is missing and
// which account to add, rather than failing. A dashboard that errors is a
// dashboard nobody opens twice.

import { SCOPES, accessToken, parseCredentials } from '../_lostfound/google.mjs';

const TTL = 5 * 60000;
const cache = new Map();

export async function cached(key, fresh, compute, ttl = TTL) {
	const hit = cache.get(key);
	if (!fresh && hit && Date.now() - hit.at < ttl) return { ...hit.value, cachedAt: new Date(hit.at).toISOString() };
	const value = await compute();
	cache.set(key, { at: Date.now(), value });
	return { ...value, cachedAt: new Date().toISOString() };
}

class NotReady extends Error {
	constructor(reason, detail = {}) {
		super(reason);
		this.reason = reason;
		this.detail = detail;
	}
}

function credentialsOf(env) {
	if (!env.FIRESTORE_CREDENTIALS) throw new NotReady('credentials');
	return parseCredentials(env.FIRESTORE_CREDENTIALS);
}

async function google(env, scope, url, body) {
	const credentials = credentialsOf(env);
	const response = await fetch(url, {
		method: 'POST',
		headers: { Authorization: `Bearer ${await accessToken(credentials, scope)}`, 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(9000),
	});
	const payload = await response.json().catch(() => ({}));
	const said = payload.error?.message || '';
	// Two different 403s. An API the Cloud project has not switched on is the
	// project owner's click, not a permission to grant - and telling someone to
	// add a Viewer when the API is off sends them to the wrong screen.
	if (response.status === 403 && /has not been used|is disabled|SERVICE_DISABLED/i.test(said)) {
		throw new NotReady('api', { message: said, link: /https:\/\/console\.(?:developers|cloud)\.google\.com\/\S+/.exec(said)?.[0]?.replace(/[.,]$/, '') || '' });
	}
	if (response.status === 403 || response.status === 401) throw new NotReady('access', { account: credentials.client_email, message: said });
	if (!response.ok) {
		const message = payload.error?.message || `Google answered ${response.status}`;
		if (/customEvent|dimension/i.test(message)) throw new NotReady('dimensions', { message });
		throw new NotReady('error', { message });
	}
	return payload;
}

/** Turns a failure into what the page needs to say about it. */
export async function guarded(fn) {
	try {
		return { ready: true, ...(await fn()) };
	} catch (error) {
		if (error instanceof NotReady) return { ready: false, reason: error.reason, ...error.detail };
		throw error;
	}
}

const RANGES = new Set([7, 28, 90]);
export const rangeOf = (value) => (RANGES.has(Number(value)) ? Number(value) : 28);

// --- Google Analytics 4 ---------------------------------------------------------------

const num = (v) => Number(v?.value ?? v ?? 0);
const rowsOf = (report) => (report?.rows || []).map((r) => ({
	d: (r.dimensionValues || []).map((x) => x.value),
	m: (r.metricValues || []).map((x) => num(x)),
}));

function propertyOf(env) {
	const id = String(env.GA4_PROPERTY_ID || '').replace(/^properties\//, '').trim();
	if (!/^\d+$/.test(id)) throw new NotReady('property');
	return id;
}

export const ga = (env, method, body) => {
	credentialsOf(env); // the key first: without it, the property ID is the least of it
	return google(env, SCOPES.analytics, `https://analyticsdata.googleapis.com/v1beta/properties/${propertyOf(env)}:${method}`, body);
};

export function traffic(env, days, fresh) {
	return cached(`traffic:${days}`, fresh, async () => {
		const current = { startDate: `${days - 1}daysAgo`, endDate: 'today', name: 'current' };
		const previous = { startDate: `${days * 2 - 1}daysAgo`, endDate: `${days}daysAgo`, name: 'previous' };
		const metrics = ['activeUsers', 'newUsers', 'sessions', 'screenPageViews', 'engagementRate', 'averageSessionDuration'].map((name) => ({ name }));
		const top = (dimension, metric, limit = 10) => ({
			dateRanges: [current], dimensions: [{ name: dimension }], metrics: [{ name: metric }],
			orderBys: [{ metric: { metricName: metric }, desc: true }], limit,
		});
		const [first, second, now, nowPages] = await Promise.all([
			ga(env, 'batchRunReports', { requests: [
				{ dateRanges: [current, previous], metrics },
				{ dateRanges: [current], dimensions: [{ name: 'date' }], metrics: [{ name: 'activeUsers' }, { name: 'screenPageViews' }], orderBys: [{ dimension: { dimensionName: 'date' } }], limit: 400 },
				{ dateRanges: [current], dimensions: [{ name: 'pagePath' }], metrics: [{ name: 'screenPageViews' }, { name: 'activeUsers' }, { name: 'userEngagementDuration' }], orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }], limit: 20 },
				top('sessionDefaultChannelGroup', 'sessions'),
				top('sessionSource', 'sessions'),
			] }),
			ga(env, 'batchRunReports', { requests: [
				top('deviceCategory', 'activeUsers', 5),
				top('country', 'activeUsers'),
				top('city', 'activeUsers'),
				top('landingPage', 'sessions'),
			] }),
			ga(env, 'runRealtimeReport', { metrics: [{ name: 'activeUsers' }] }),
			ga(env, 'runRealtimeReport', { dimensions: [{ name: 'unifiedScreenName' }], metrics: [{ name: 'activeUsers' }], limit: 5 }),
		]);
		const [totals, daily, pages, channels, sources] = first.reports;
		const [devices, countries, cities, landing] = second.reports;
		const byRange = Object.fromEntries(rowsOf(totals).map((r) => [r.d[0], r.m]));
		const names = metrics.map((m) => m.name);
		const pick = (row) => Object.fromEntries(names.map((n, i) => [n, row?.[i] ?? 0]));
		const pairs = (report) => rowsOf(report).map((r) => ({ label: r.d[0], value: r.m[0] }));
		return {
			days,
			totals: { current: pick(byRange.current), previous: pick(byRange.previous) },
			daily: rowsOf(daily).map((r) => ({ date: `${r.d[0].slice(0, 4)}-${r.d[0].slice(4, 6)}-${r.d[0].slice(6, 8)}`, users: r.m[0], views: r.m[1] })),
			pages: rowsOf(pages).map((r) => ({ path: r.d[0], views: r.m[0], users: r.m[1], engagedSeconds: r.m[1] ? Math.round(r.m[2] / r.m[1]) : 0 })),
			channels: pairs(channels),
			sources: pairs(sources),
			devices: pairs(devices),
			countries: pairs(countries),
			cities: pairs(cities),
			landing: pairs(landing),
			realtime: { users: num(now.rows?.[0]?.metricValues?.[0]), pages: rowsOf(nowPages).map((r) => ({ label: r.d[0], value: r.m[0] })) },
		};
	});
}

/** Who is on the site in the last 30 minutes. Kept 30 seconds, for polling. */
export function live(env) {
	return cached('live', false, async () => {
		const [now, pages] = await Promise.all([
			ga(env, 'runRealtimeReport', { metrics: [{ name: 'activeUsers' }] }),
			ga(env, 'runRealtimeReport', { dimensions: [{ name: 'unifiedScreenName' }], metrics: [{ name: 'activeUsers' }], limit: 5 }),
		]);
		return { users: num(now.rows?.[0]?.metricValues?.[0]), pages: rowsOf(pages).map((r) => ({ label: r.d[0], value: r.m[0] })) };
	}, 30000);
}

// --- reader ratings, live from GA4 ------------------------------------------------------

// Kept in step with context_processors/ratings.py: under ten votes a mean is
// noise, and the dashboard says so rather than ranking on it.
export const RATING_MIN_VOTES = 10;

export function ratings(env, fresh) {
	return cached('ratings', fresh, async () => {
		const report = await ga(env, 'runReport', {
			dateRanges: [{ startDate: '2024-01-01', endDate: 'today' }],
			dimensions: [{ name: 'customEvent:guide' }, { name: 'customEvent:score' }],
			metrics: [{ name: 'eventCount' }],
			dimensionFilter: { filter: { fieldName: 'eventName', stringFilter: { value: 'guide_rating' } } },
			limit: 10000,
		});
		const guides = new Map();
		const overall = [0, 0, 0, 0, 0];
		for (const { d: [guide, score], m: [count] } of rowsOf(report)) {
			const s = Number(score);
			if (!guide || guide === '(not set)' || !(s >= 1 && s <= 5)) continue;
			const g = guides.get(guide) || { guide, votes: 0, sum: 0, spread: [0, 0, 0, 0, 0] };
			g.votes += count;
			g.sum += s * count;
			g.spread[s - 1] += count;
			overall[s - 1] += count;
			guides.set(guide, g);
		}
		const rows = [...guides.values()].map((g) => ({ guide: g.guide, votes: g.votes, mean: g.votes ? Math.round((g.sum / g.votes) * 100) / 100 : 0, spread: g.spread, enough: g.votes >= RATING_MIN_VOTES }));
		rows.sort((a, b) => (b.enough - a.enough) || (a.enough ? a.mean - b.mean : b.votes - a.votes));
		const votes = overall.reduce((a, b) => a + b, 0);
		return { minVotes: RATING_MIN_VOTES, votes, mean: votes ? Math.round((overall.reduce((s, n, i) => s + n * (i + 1), 0) / votes) * 100) / 100 : 0, spread: overall, guides: rows };
	});
}

// --- Search Console -------------------------------------------------------------------------

const SITE_GUESSES = ['sc-domain:allaboutnairobi.com', 'https://www.allaboutnairobi.com/'];
let workingSite = null;

const iso = (date) => date.toISOString().slice(0, 10);
const daysBefore = (date, n) => new Date(date.getTime() - n * 86400000);

export async function searchQuery(env, body) {
	const sites = env.SEARCH_CONSOLE_SITE ? [env.SEARCH_CONSOLE_SITE] : workingSite ? [workingSite] : SITE_GUESSES;
	let last;
	for (const site of sites) {
		try {
			const answer = await google(env, SCOPES.searchConsole, `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`, body);
			workingSite = site;
			return { site, rows: answer.rows || [] };
		} catch (error) {
			last = error;
			if (!(error instanceof NotReady) || error.reason !== 'access') throw error;
		}
	}
	throw last;
}

export function search(env, days, fresh) {
	return cached(`search:${days}`, fresh, async () => {
		// Search Console lags about two days; ending three days back means every
		// day in the window is complete, so the comparison is fair.
		const end = daysBefore(new Date(), 3);
		const start = daysBefore(end, days - 1);
		const prevEnd = daysBefore(start, 1);
		const prevStart = daysBefore(prevEnd, days - 1);
		const span = { startDate: iso(start), endDate: iso(end) };
		const [cur, prev, daily, queries, pages, devices, wide] = await Promise.all([
			searchQuery(env, { ...span }),
			searchQuery(env, { startDate: iso(prevStart), endDate: iso(prevEnd) }),
			searchQuery(env, { ...span, dimensions: ['date'], rowLimit: 500 }),
			searchQuery(env, { ...span, dimensions: ['query'], rowLimit: 25 }),
			searchQuery(env, { ...span, dimensions: ['page'], rowLimit: 25 }),
			searchQuery(env, { ...span, dimensions: ['device'], rowLimit: 5 }),
			searchQuery(env, { ...span, dimensions: ['query', 'page'], rowLimit: 1000 }),
		]);
		const total = (r) => {
			const row = r.rows[0] || {};
			return { clicks: row.clicks || 0, impressions: row.impressions || 0, ctr: row.ctr || 0, position: row.position || 0 };
		};
		const flat = (r) => r.rows.map((row) => ({ key: row.keys?.[0], clicks: row.clicks, impressions: row.impressions, ctr: row.ctr, position: row.position }));
		const pairs = wide.rows.map((row) => ({ query: row.keys[0], page: row.keys[1], clicks: row.clicks, impressions: row.impressions, ctr: row.ctr, position: row.position }));
		return {
			days,
			site: cur.site,
			window: { ...span, previous: { startDate: iso(prevStart), endDate: iso(prevEnd) } },
			totals: { current: total(cur), previous: total(prev) },
			daily: flat(daily).map((d) => ({ date: d.key, clicks: d.clicks, impressions: d.impressions })),
			queries: flat(queries),
			pages: flat(pages),
			devices: flat(devices),
			// The lesson from the first exports: ranking without clicks means the
			// title and description are the bug. On page one, seen often, rarely
			// chosen.
			unclicked: pairs.filter((p) => p.position <= 10 && p.impressions >= 20 && p.ctr < 0.02).sort((a, b) => b.impressions - a.impressions).slice(0, 15),
			// And just off page one, where a better page moves a query most.
			nearlyThere: pairs.filter((p) => p.position > 10 && p.position <= 20 && p.impressions >= 20).sort((a, b) => b.impressions - a.impressions).slice(0, 15),
		};
	});
}

// --- lost and found, from its own database ---------------------------------------------------

const median = (values) => {
	if (!values.length) return null;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

export function lostFoundStats(store, days, fresh) {
	return cached(`lostfound:${store.name}:${days}`, fresh, async () => {
		const since = daysBefore(new Date(), days).toISOString();
		const [items, claims, places] = await Promise.all([
			store.select('lf_items', { order: ['created_at', 'desc'], limit: 5000 }),
			store.select('lf_claims', { order: ['created_at', 'desc'], limit: 5000 }),
			store.select('lf_places', { filters: [['status', 'eq', 'active']], order: ['name', 'asc'] }),
		]);
		const recent = items.filter((i) => i.created_at >= since);
		const claimsBy = new Map();
		for (const c of claims) claimsBy.set(c.item_id, (claimsBy.get(c.item_id) || 0) + 1);

		const group = (rows, key) => {
			const map = new Map();
			for (const row of rows) {
				const k = row[key] || 'unknown';
				const g = map.get(k) || { key: k, listed: 0, returned: 0, lost: 0, found: 0 };
				g.listed += 1;
				g[row.kind] += 1;
				if (row.status === 'returned') g.returned += 1;
				map.set(k, g);
			}
			return [...map.values()].sort((a, b) => b.listed - a.listed);
		};

		const perDay = new Map();
		for (let i = days - 1; i >= 0; i--) perDay.set(iso(daysBefore(new Date(), i)), { date: iso(daysBefore(new Date(), i)), lost: 0, found: 0 });
		for (const row of recent) {
			const d = perDay.get(row.created_at.slice(0, 10));
			if (d) d[row.kind] += 1;
		}

		const returnedDays = recent
			.filter((r) => r.status === 'returned' && r.ended_at)
			.map((r) => (new Date(r.ended_at) - new Date(r.created_at)) / 86400000);
		const withReply = recent.filter((r) => claimsBy.get(r.id)).length;
		const placeRows = places.map((p) => {
			const mine = recent.filter((r) => r.place_id === p.id);
			return { slug: p.slug, name: p.name, listed: mine.length, returned: mine.filter((r) => r.status === 'returned').length };
		}).sort((a, b) => b.listed - a.listed);

		return {
			days,
			totals: {
				listed: recent.length,
				lost: recent.filter((r) => r.kind === 'lost').length,
				found: recent.filter((r) => r.kind === 'found').length,
				returned: recent.filter((r) => r.status === 'returned').length,
				withReply,
				replies: claims.filter((c) => c.created_at >= since).length,
				medianDaysToReturn: returnedDays.length ? Math.round(median(returnedDays) * 10) / 10 : null,
				timedReturns: returnedDays.length,
			},
			daily: [...perDay.values()],
			categories: group(recent, 'category'),
			districts: group(recent, 'district').slice(0, 12),
			places: placeRows,
			allTime: { listed: items.length, returned: items.filter((r) => r.status === 'returned').length },
		};
	});
}
