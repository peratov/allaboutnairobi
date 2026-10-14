// The admin API, at /api/admin?r=<route>, behind /admin.
//
// The site owner - OWNER_EMAIL in _admin/owner.mjs, and nobody else - signs in
// with Google and can then see and run everything lost and found holds:
// listings, places and their portals, reports, Nairobi Pulse's questions, an
// audit log, and the state of the deployment. How sign-in works is in _admin/auth.mjs; what the admin can
// see and do is in _admin/routes.mjs.
//
// Environment (set in the Vercel project, never in this repository):
//
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET  an OAuth client of type "Web
//                                       application", with the redirect URI
//                                       https://www.allaboutnairobi.com/api/admin?r=callback
//   ADMIN_SESSION_SECRET                at least 32 random characters. Signs
//                                       the session cookie; changing it signs
//                                       every session out.
//   ADMIN_DEV_LOGIN                     local only: "1" lets localhost in
//                                       without Google. Ignored on Vercel.
//   GA4_PROPERTY_ID                     the Analytics property's number, for
//                                       Traffic and Ratings. The service account
//                                       in FIRESTORE_CREDENTIALS needs Viewer on it.
//   SEARCH_CONSOLE_SITE                 optional: the Search Console property,
//                                       "sc-domain:allaboutnairobi.com" or the URL.
//                                       Both are tried without it.
//   GITHUB_TOKEN                        fine-grained, Contents read and write on
//                                       this repository only: the Site page's
//                                       deploy check, and editing events.
//
// plus the database settings listed in lost-found.mjs.

import { configuredStore } from './_lostfound/store.mjs';
import { HttpError, baseUrl, emailer, guardWrite, readBody, send } from './_lostfound/http.mjs';
import { finishLogin, requireOwner, signOutCookies, startLogin } from './_admin/auth.mjs';
import { routes } from './_admin/routes.mjs';

const READS = {
	me: 'me', overview: 'overview', items: 'items', item: 'item', places: 'places', place: 'place', reports: 'reports', log: 'log', site: 'site',
	traffic: 'traffic', live: 'live', search: 'search', ratings: 'ratings', lostfound: 'lostfoundStats', settings: 'settings', events: 'events',
	submissions: 'submissions', submission: 'submission', pulse: 'pulseList', 'pulse-question': 'pulseQuestion',
	prompts: 'promptStats',
	news: 'newsList', 'news-subscribers': 'newsSubscribers', 'news-subscriber': 'newsSubscriber', 'news-export': 'newsExport', 'news-campaign': 'newsCampaign',
	goals: 'goals',
};
const WRITES = {
	item: 'itemAction', place: 'placeAction', settings: 'saveSettings', event: 'saveEvent', submission: 'submissionAction', pulse: 'pulseAction',
	news: 'newsAction', goals: 'goalsAction',
};
// Google and GitHub answer these; the database does not have to be set up.
const NO_STORE_NEEDED = new Set(['me', 'site', 'traffic', 'live', 'search', 'ratings', 'events', 'goals']);

function redirect(res, location, cookies = []) {
	res.statusCode = 302;
	res.setHeader('Location', location);
	res.setHeader('Cache-Control', 'no-store');
	res.setHeader('X-Robots-Tag', 'noindex');
	if (cookies.length) res.setHeader('Set-Cookie', cookies);
	res.end();
}

export default async function handler(req, res, env = process.env) {
	const url = new URL(req.url, 'http://localhost');
	const query = Object.fromEntries(url.searchParams);
	const route = query.r || '';
	const method = req.method;
	const base = baseUrl(req, env);

	// The two legs of signing in are browser navigations, so they answer with
	// redirects rather than JSON - and a failure lands on /admin saying why.
	if (method === 'GET' && (route === 'login' || route === 'callback')) {
		try {
			if (route === 'login') {
				const { location, cookies } = startLogin(req, env, base);
				return redirect(res, location, cookies);
			}
			return redirect(res, '/admin', await finishLogin(req, env, base, query));
		} catch (error) {
			if (!(error instanceof HttpError)) console.error('admin: sign-in failed', error);
			const code = error instanceof HttpError ? error.code : 'server';
			return redirect(res, `/admin#signin=${encodeURIComponent(code)}`, signOutCookies());
		}
	}

	try {
		if (method === 'POST' && route === 'logout') {
			guardWrite(req);
			return send(res, 200, { ok: true }, { 'Set-Cookie': signOutCookies() });
		}

		const name = (method === 'GET' ? READS : method === 'POST' ? WRITES : {})[route];
		if (!name) throw new HttpError(method === 'GET' || method === 'POST' ? 404 : 405, 'No such thing here.', 'route');

		const who = requireOwner(req, env);
		let body = {};
		if (method === 'POST') {
			guardWrite(req);
			// A newsletter issue, or a pasted list of addresses, is longer than
			// anything else the admin sends.
			body = await readBody(req, route === 'news' ? 150000 : 20000);
		}
		const store = configuredStore(env);
		if (!store && !NO_STORE_NEEDED.has(route)) throw new HttpError(503, 'The database is not set up yet.', 'not-configured');

		const result = await routes[name]({ store, query, body, env, base, who, notify: emailer(env) });
		send(res, 200, result);
	} catch (error) {
		if (error instanceof HttpError) return send(res, error.status, { error: error.message, code: error.code });
		if (error instanceof SyntaxError) return send(res, 400, { error: 'That was not valid JSON.', code: 'json' });
		console.error('admin:', error);
		send(res, 500, { error: 'Something went wrong on our side.', code: 'server' });
	}
}
