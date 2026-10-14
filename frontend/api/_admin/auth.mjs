// Signing the owner in, and nobody else.
//
// "Sign in with Google", done entirely on the server: /api/admin?r=login sends
// the browser to Google, Google sends it back to ?r=callback with a code, and
// the function trades the code for an ID token directly with Google over TLS.
// So no Google script runs on the page, the CSP needs nothing new, and the
// browser never holds a Google token.
//
// The ID token says who signed in. It is accepted only if Google says the
// address is verified and it is OWNER_EMAIL - any other Google account, however
// it got there, is turned away. The answer is a session cookie: HttpOnly,
// Secure, SameSite=Strict, signed with ADMIN_SESSION_SECRET, good for twelve
// hours. Nothing is stored server-side, so changing the secret signs every
// session out at once.
//
// The login round trip carries a state (against forged callbacks), a nonce
// (against a replayed token) and PKCE (against an intercepted code), in a
// short-lived signed cookie of its own.

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { HttpError } from '../_lostfound/http.mjs';
import { OWNER_EMAIL } from './owner.mjs';

const SESSION = '__Host-aa_admin';
const OAUTH = '__Host-aa_oauth';
const SESSION_HOURS = 12;
const AUTHORIZE = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN = 'https://oauth2.googleapis.com/token';
const ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);

const b64 = (value) => Buffer.from(value).toString('base64url');
const random = () => randomBytes(32).toString('base64url');

function secretOf(env) {
	const secret = env.ADMIN_SESSION_SECRET || '';
	if (secret.length < 32) throw new HttpError(503, 'The admin is not set up yet.', 'not-configured');
	return secret;
}

function sign(payload, secret) {
	const body = b64(JSON.stringify(payload));
	return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
}

function unsign(token, secret) {
	const [body, mac] = String(token || '').split('.');
	if (!body || !mac) return null;
	const expected = Buffer.from(createHmac('sha256', secret).update(body).digest('base64url'));
	const given = Buffer.from(mac);
	if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
	try {
		const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
		return payload.exp > Date.now() ? payload : null;
	} catch {
		return null;
	}
}

function cookies(req) {
	const jar = {};
	for (const part of String(req.headers.cookie || '').split(';')) {
		const at = part.indexOf('=');
		if (at > 0) jar[part.slice(0, at).trim()] = part.slice(at + 1).trim();
	}
	return jar;
}

const cookie = (name, value, { maxAge, sameSite = 'Strict' }) =>
	`${name}=${value}; Path=/; HttpOnly; Secure; SameSite=${sameSite}; Max-Age=${maxAge}`;

// No owner configured means nobody is the owner - never an empty match.
const isOwner = (email) => Boolean(OWNER_EMAIL) && String(email || '').trim().toLowerCase() === OWNER_EMAIL;

/** Who is signed in, or null. Only ever the owner. */
export function session(req, env) {
	const payload = unsign(cookies(req)[SESSION], secretOf(env));
	return payload && isOwner(payload.email) ? { email: OWNER_EMAIL, expires: payload.exp } : null;
}

export function requireOwner(req, env) {
	const who = session(req, env);
	if (!who) throw new HttpError(401, 'Sign in as the site owner.', 'auth');
	return who;
}

/** The Set-Cookie for a fresh session. Exported for the checks. */
export function sessionCookie(env, email = OWNER_EMAIL) {
	const exp = Date.now() + SESSION_HOURS * 3600000;
	return cookie(SESSION, sign({ email, exp }, secretOf(env)), { maxAge: SESSION_HOURS * 3600 });
}

export const signOutCookies = () => [cookie(SESSION, '', { maxAge: 0 }), cookie(OAUTH, '', { maxAge: 0, sameSite: 'Lax' })];

const redirectUri = (base) => `${base}/api/admin?r=callback`;

// A laptop running `mise lostfound-dev` has no Google client and should not
// need one. Only off Vercel, only on localhost, only when the dev server asks.
function devLogin(req, env) {
	const host = String(req.headers.host || '').split(':')[0];
	return env.ADMIN_DEV_LOGIN === '1' && !env.VERCEL && (host === 'localhost' || host === '127.0.0.1');
}

/** Where to send the browser to sign in, and the cookie that remembers why. */
export function startLogin(req, env, base) {
	const secret = secretOf(env);
	if (devLogin(req, env)) return { location: '/admin', cookies: [sessionCookie(env)] };
	if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) throw new HttpError(503, 'Google sign-in is not set up yet.', 'not-configured');
	const state = random();
	const nonce = random();
	const verifier = random();
	const params = new URLSearchParams({
		client_id: env.GOOGLE_CLIENT_ID,
		redirect_uri: redirectUri(base),
		response_type: 'code',
		scope: 'openid email',
		state,
		nonce,
		code_challenge: createHash('sha256').update(verifier).digest('base64url'),
		code_challenge_method: 'S256',
		login_hint: OWNER_EMAIL,
		prompt: 'select_account',
	});
	return {
		location: `${AUTHORIZE}?${params}`,
		// Lax, not Strict: it has to come back on the redirect from Google.
		cookies: [cookie(OAUTH, sign({ state, nonce, verifier, exp: Date.now() + 600000 }, secret), { maxAge: 600, sameSite: 'Lax' })],
	};
}

/**
 * Google's redirect back. Returns the session cookie, or throws an HttpError
 * whose code says why - the entry point turns either into a redirect to /admin.
 */
export async function finishLogin(req, env, base, query) {
	const secret = secretOf(env);
	if (query.error) throw new HttpError(400, 'Google did not sign you in.', 'cancelled');
	const pending = unsign(cookies(req)[OAUTH], secret);
	if (!pending || !query.state || query.state !== pending.state) throw new HttpError(400, 'That sign-in had expired. Try again.', 'state');

	const response = await fetch(TOKEN, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			code: String(query.code || ''),
			client_id: env.GOOGLE_CLIENT_ID,
			client_secret: env.GOOGLE_CLIENT_SECRET,
			redirect_uri: redirectUri(base),
			grant_type: 'authorization_code',
			code_verifier: pending.verifier,
		}),
	});
	if (!response.ok) throw new HttpError(400, 'Google would not confirm that sign-in.', 'exchange');
	const { id_token: idToken } = await response.json();

	// Straight from Google's token endpoint over TLS, so the token's own
	// signature need not be checked again (OpenID Connect Core, 3.1.3.7) - but
	// everything it claims is.
	let claims;
	try {
		claims = JSON.parse(Buffer.from(String(idToken).split('.')[1], 'base64url').toString('utf8'));
	} catch {
		throw new HttpError(400, 'Google sent something unreadable.', 'token');
	}
	if (!ISSUERS.has(claims.iss) || claims.aud !== env.GOOGLE_CLIENT_ID || !(claims.exp * 1000 > Date.now()) || claims.nonce !== pending.nonce) {
		throw new HttpError(400, 'That sign-in did not check out.', 'token');
	}
	if (claims.email_verified !== true || !isOwner(claims.email)) {
		console.warn('admin: refused a sign-in from', claims.email);
		throw new HttpError(403, 'Only the site owner can sign in here.', 'denied');
	}
	return [sessionCookie(env), cookie(OAUTH, '', { maxAge: 0, sameSite: 'Lax' })];
}
