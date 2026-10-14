// The newsletter's API, at /api/news?r=<route>.
//
//   POST subscribe   a sign-up: JSON from the site's script, or a plain form
//                    post when there is none (answered with a redirect)
//   POST confirm     the button on /newsletter/confirm, with the email's token
//   GET  who         what /newsletter/unsubscribe shows before its button
//   POST unsubscribe the button on /newsletter/unsubscribe
//   POST oneclick    a mail app's own "Unsubscribe" (RFC 8058): a form post with
//                    the token in the address, from no page of ours
//   POST webhook     Resend's report of each email, signed: bounces and
//                    complaints come off the list
//   GET  purge       Vercel Cron's daily job: addresses never confirmed are
//                    deleted after thirty days
//
// It shares lost and found's database and its settings document. The rules
// are in _news/handlers.mjs, the email in _news/mail.mjs, and the admin's
// side - the list, imports, issues and sending - in _news/admin.mjs, behind
// /api/admin.
//
// Environment (set in Vercel, never in this repository): RESEND_API_KEY and
// NEWSLETTER_FROM (a sender on a domain verified in Resend, such as
// "All About Nairobi <newsletter@allaboutnairobi.com>"); RESEND_WEBHOOK_SECRET for
// the webhook; NEWSLETTER_SECRET to sign the links in emails (the admin's
// session secret otherwise - set it once and leave it, or every unsubscribe
// link already sent stops working); CRON_SECRET for the daily job; the
// database settings in lost-found.mjs.

import { configuredStore } from './_lostfound/store.mjs';
import { ipHash } from './_lostfound/handlers.mjs';
import { HttpError, baseUrl, guardWrite, readBody, send } from './_lostfound/http.mjs';
import { routes } from './_news/handlers.mjs';

const READS = new Set(['who', 'purge']);
const WRITES = new Set(['subscribe', 'confirm', 'unsubscribe', 'oneclick', 'webhook']);

async function readRaw(req) {
	const chunks = [];
	let size = 0;
	for await (const chunk of req) {
		size += chunk.length;
		if (size > 100000) throw new HttpError(413, 'Too much.', 'size');
		chunks.push(chunk);
	}
	return Buffer.concat(chunks).toString('utf8');
}

const isForm = (req) => String(req.headers['content-type'] || '').includes('application/x-www-form-urlencoded');

function sameSite(req) {
	const origin = req.headers.origin;
	const host = req.headers['x-forwarded-host'] || req.headers.host;
	if (origin && host && new URL(origin).host !== host) throw new HttpError(403, 'Not from this site.', 'origin');
}

export default async function handler(req, res, env = process.env) {
	const url = new URL(req.url, 'http://localhost');
	const query = Object.fromEntries(url.searchParams);
	const route = query.r || '';
	// A plain form post is answered with a page, not JSON.
	let form = false;
	try {
		if (!(req.method === 'GET' ? READS : WRITES).has(route) || !routes[route]) {
			throw new HttpError(req.method === 'GET' || req.method === 'POST' ? 404 : 405, 'No such thing here.', 'route');
		}
		const store = configuredStore(env);
		if (!store) throw new HttpError(503, 'The newsletter is not set up yet.', 'not-configured');
		const context = { store, env, query, base: baseUrl(req, env), ip: ipHash(req, env), headers: req.headers, authorization: req.headers.authorization || '', body: {} };
		if (route === 'webhook') {
			// Signed over the exact bytes Resend sent, so they are read as they came.
			context.raw = typeof req.body === 'string' ? req.body : await readRaw(req);
		} else if (route === 'oneclick') {
			// From a mail app: no page, no Origin, a form body that says only
			// "List-Unsubscribe=One-Click". The signed token is what counts.
		} else if (req.method === 'POST' && route === 'subscribe' && isForm(req)) {
			form = true;
			sameSite(req);
			context.body = req.body && typeof req.body === 'object' ? req.body : Object.fromEntries(new URLSearchParams(await readRaw(req)));
		} else if (req.method === 'POST') {
			guardWrite(req);
			context.body = await readBody(req);
		}
		const result = await routes[route](context);
		if (form) {
			res.statusCode = 303;
			res.setHeader('Location', `/newsletter/check${result.confirm === false ? '?subscribed=1' : ''}`);
			res.setHeader('Cache-Control', 'no-store');
			return res.end();
		}
		send(res, 200, result);
	} catch (error) {
		if (form) {
			res.statusCode = 303;
			res.setHeader('Location', `/newsletter/check?error=${encodeURIComponent(error instanceof HttpError ? error.code : 'server')}`);
			res.setHeader('Cache-Control', 'no-store');
			return res.end();
		}
		if (error instanceof HttpError) return send(res, error.status, { error: error.message, code: error.code });
		if (error instanceof SyntaxError) return send(res, 400, { error: 'That was not valid JSON.', code: 'json' });
		console.error('news:', error);
		send(res, 500, { error: 'Something went wrong on our side. Try again in a minute.', code: 'server' });
	}
}
