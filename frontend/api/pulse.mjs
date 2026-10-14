// Nairobi Pulse's API, at /api/pulse?r=<route>.
//
//   GET  questions   every live question and the recent closed ones, with totals
//   GET  where       whether to ask this reader on other pages, from what
//                    Vercel says about the connection; never cached
//   GET  results     one question's tally, as the public may see it (?q=<id>)
//   POST pass        a location check: a position in, a signed district out
//   POST vote        a vote, with a pass
//   GET  purge       Vercel Cron's daily job: close what has passed its day,
//                    and delete individual votes a month after a question closes
//
// It shares lost and found's database, its settings document and its hourly
// limits table, and stands as its own function only so its public reads can be
// cached at the edge while lost and found's are not. Everything it decides is in
// _pulse/handlers.mjs; the admin's side is in _pulse/admin.mjs, behind
// /api/admin.
//
// Environment (set in the Vercel project, never in this repository): the
// database settings listed in lost-found.mjs, CRON_SECRET for the daily job,
// and optionally PULSE_SECRET to sign passes and key votes - without it the
// admin's ADMIN_SESSION_SECRET is used, for a different purpose and labelled as
// such. Changing whichever one is in use asks every voter to check their
// location again, and lets every device vote once more on every question.

import { configuredStore } from './_lostfound/store.mjs';
import { ipHash } from './_lostfound/handlers.mjs';
import { HttpError, guardWrite, readBody, send } from './_lostfound/http.mjs';
import { routes } from './_pulse/handlers.mjs';

const WRITES = new Set(['pass', 'vote']);
const READS = new Set(['questions', 'results', 'where', 'purge']);

// The same answer for everyone, so the edge may keep it briefly. A voter never
// waits on these: a vote's response carries the fresh tally, and the page keeps
// whichever tally is newest.
const SHARED = {
	questions: 'public, max-age=0, s-maxage=20, stale-while-revalidate=60',
	results: 'public, max-age=0, s-maxage=10, stale-while-revalidate=30',
};

export default async function handler(req, res, env = process.env) {
	try {
		const url = new URL(req.url, 'http://localhost');
		const query = Object.fromEntries(url.searchParams);
		const route = query.r || '';
		const method = req.method;

		if (!(method === 'GET' ? READS : WRITES).has(route) || !routes[route]) {
			throw new HttpError(method === 'GET' || method === 'POST' ? 404 : 405, 'No such thing here.', 'route');
		}

		const store = configuredStore(env);
		if (!store) throw new HttpError(503, 'Nairobi Pulse is not set up yet.', 'not-configured');

		let body = {};
		if (method === 'POST') {
			guardWrite(req);
			body = await readBody(req);
		}

		const result = await routes[route]({
			store, query, body, env,
			authorization: req.headers.authorization || '',
			ip: ipHash(req, env),
			// Vercel's reading of the connection's country, ISO 3166 alpha-2.
			country: String(req.headers['x-vercel-ip-country'] || '').toUpperCase(),
			// And of its region, city and rough position, for `where` alone. Off
			// Vercel there are none of these headers, and nowhere looks like Nairobi.
			geo: {
				country: String(req.headers['x-vercel-ip-country'] || '').toUpperCase(),
				region: String(req.headers['x-vercel-ip-country-region'] || '').toUpperCase(),
				city: (() => { try { return decodeURIComponent(String(req.headers['x-vercel-ip-city'] || '')); } catch { return ''; } })(),
				lat: req.headers['x-vercel-ip-latitude'] || '',
				lon: req.headers['x-vercel-ip-longitude'] || '',
			},
		});
		send(res, 200, result, SHARED[route] ? { 'Cache-Control': SHARED[route] } : {});
	} catch (error) {
		if (error instanceof HttpError) return send(res, error.status, { error: error.message, code: error.code });
		if (error instanceof SyntaxError) return send(res, 400, { error: 'That was not valid JSON.', code: 'json' });
		console.error('pulse:', error);
		send(res, 500, { error: 'Something went wrong on our side. Try again in a minute.', code: 'server' });
	}
}
