// How readers meet the site's prompts, at /api/prompts?r=report.
//
//   POST report   one report from a Pulse card or a guide's rating prompt when
//                 it closes: what opened it and what the reader did. Added to
//                 the day's counts; nothing else is kept.
//
// Same-origin JSON only, like every other write here. Everything it decides is
// in _prompts/handlers.mjs; the admin's view is ?r=prompts behind /api/admin.

import { configuredStore } from './_lostfound/store.mjs';
import { ipHash } from './_lostfound/handlers.mjs';
import { HttpError, guardWrite, readBody, send } from './_lostfound/http.mjs';
import { routes } from './_prompts/handlers.mjs';

export default async function handler(req, res, env = process.env) {
	try {
		const route = new URL(req.url, 'http://localhost').searchParams.get('r') || '';
		if (req.method !== 'POST') throw new HttpError(405, 'Reports only.', 'method');
		if (!routes[route]) throw new HttpError(404, 'No such thing here.', 'route');
		const store = configuredStore(env);
		if (!store) throw new HttpError(503, 'Not set up yet.', 'not-configured');
		guardWrite(req);
		const body = await readBody(req);
		send(res, 200, await routes[route]({ store, body, env, ip: ipHash(req, env) }));
	} catch (error) {
		if (error instanceof HttpError) return send(res, error.status, { error: error.message, code: error.code });
		if (error instanceof SyntaxError) return send(res, 400, { error: 'That was not valid JSON.', code: 'json' });
		console.error('prompts:', error);
		send(res, 500, { error: 'Something went wrong on our side.', code: 'server' });
	}
}
