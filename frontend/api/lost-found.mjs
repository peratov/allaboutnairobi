// The lost and found API, at /api/lost-found?r=<route>.
//
// The public half of the site's only backend; /api/admin is the other half.
// It sits on this site's own origin, which is why the CSP's connect-src 'self'
// did not need to change: the browser only ever talks to /api/lost-found, and
// only this function talks to the database. Everything it decides is in
// _lostfound/handlers.mjs; this file is the doorway.
//
// Environment (set in the Vercel project, never in this repository):
//
//   FIRESTORE_CREDENTIALS               the database: a Google service account
//                                       key, JSON or base64. Without it the API
//                                       answers 503 "not set up yet", and the
//                                       pages say so.
//   FIRESTORE_PROJECT, FIRESTORE_DATABASE  optional. Default to the key's
//                                       project and the (default) database.
//   LOSTFOUND_SALT                      salts the hashed IPs used for limits.
//   RESEND_API_KEY, LOSTFOUND_FROM      optional. With both, replies and
//                                       portal links are emailed; without,
//                                       people check their private link.
//   CRON_SECRET                         lets Vercel Cron run the daily purge of
//                                       old contact details (see vercel.json).
//   LOSTFOUND_FILE                      local development only: a JSON file
//                                       in place of the database.
//   FIRESTORE_EMULATOR_HOST             local only: a Firestore emulator, with
//                                       FIRESTORE_PROJECT and no key.
//
// The admin's own settings are listed in admin.mjs.

import { configuredStore } from './_lostfound/store.mjs';
import { ipHash, routes } from './_lostfound/handlers.mjs';
import { HttpError, baseUrl, emailer, guardWrite, readBody, send } from './_lostfound/http.mjs';

// `event` and `event-meta` are event submissions, which share this function's
// database, limits and defences rather than standing up a second one.
const WRITES = new Set(['report', 'claim', 'flag', 'join', 'manage', 'portal', 'event']);
const READS = new Set(['meta', 'notice', 'items', 'item', 'places', 'place', 'manage', 'portal', 'purge', 'event-meta']);

// The banner is the same for everybody, so the edge may keep it for a minute
// and serve a stale one for five while it fetches the next.
const SHARED = { notice: 'public, max-age=0, s-maxage=60, stale-while-revalidate=300' };

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
		if (!store) throw new HttpError(503, 'Lost and found is not set up yet.', 'not-configured');

		let body = {};
		if (method === 'POST') {
			guardWrite(req);
			body = await readBody(req);
		}

		// Private keys travel in a header, never in the URL, so they stay out of
		// access logs. The pages carry them in the URL's #fragment, which is
		// never sent to any server at all.
		const secret = String(req.headers['x-lostfound-key'] || body.key || '');

		const result = await routes[route]({
			store, query, body, method, secret, env,
			base: baseUrl(req, env),
			authorization: req.headers.authorization || '',
			ip: ipHash(req, env),
			notify: emailer(env),
		});
		send(res, 200, result, SHARED[route] ? { 'Cache-Control': SHARED[route] } : {});
	} catch (error) {
		if (error instanceof HttpError) return send(res, error.status, { error: error.message, code: error.code });
		if (error instanceof SyntaxError) return send(res, 400, { error: 'That was not valid JSON.', code: 'json' });
		console.error('lost-found:', error);
		send(res, 500, { error: 'Something went wrong on our side. Try again in a minute.', code: 'server' });
	}
}
