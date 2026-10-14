// What both serverless functions - /api/lost-found and /api/admin - do the same
// way: answer in JSON that nobody caches, read a JSON body, refuse writes that
// are not JSON from this site, and send the occasional email.

export class HttpError extends Error {
	constructor(status, message, code) {
		super(message);
		this.status = status;
		this.code = code;
	}
}

export function send(res, status, payload, headers = {}) {
	res.statusCode = status;
	res.setHeader('Content-Type', 'application/json; charset=utf-8');
	// Listings change by the minute and some answers carry contact details:
	// nothing here is cached anywhere, by anyone.
	res.setHeader('Cache-Control', 'no-store');
	res.setHeader('X-Robots-Tag', 'noindex');
	for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
	res.end(JSON.stringify(payload));
}

export async function readBody(req, limit = 20000) {
	if (req.body && typeof req.body === 'object') return req.body;
	if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
	const chunks = [];
	let size = 0;
	for await (const chunk of req) {
		size += chunk.length;
		if (size > limit) throw new HttpError(413, 'That is too much text.', 'size');
		chunks.push(chunk);
	}
	return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
}

/**
 * JSON only, and from this site only. A form on another site cannot send
 * application/json without a preflight, and the Origin, when the browser sends
 * one, has to be ours.
 */
export function guardWrite(req) {
	if (!String(req.headers['content-type'] || '').includes('application/json')) {
		throw new HttpError(415, 'Send JSON.', 'type');
	}
	const origin = req.headers.origin;
	const host = req.headers['x-forwarded-host'] || req.headers.host;
	if (origin && host && new URL(origin).host !== host) throw new HttpError(403, 'Not from this site.', 'origin');
}

export function baseUrl(req, env) {
	const proto = req.headers['x-forwarded-proto'] || 'https';
	return env.LOSTFOUND_BASE_URL || `${proto}://${req.headers['x-forwarded-host'] || req.headers.host}`;
}

export function emailer(env) {
	if (!env.RESEND_API_KEY || !env.LOSTFOUND_FROM) return async () => {};
	return async ({ to, subject, text }) => {
		try {
			await fetch('https://api.resend.com/emails', {
				method: 'POST',
				headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
				body: JSON.stringify({ from: env.LOSTFOUND_FROM, to, subject, text }),
			});
		} catch (error) {
			// An email that fails must not fail the action that triggered it.
			console.warn('lost-found: email failed', error);
		}
	};
}
