// Talking to Google as the site's service account: Firestore for lost and
// found, and - for the admin - Analytics and Search Console.
//
// One key, FIRESTORE_CREDENTIALS, for all three. The account can only do what
// each product has been told to let it do: Firestore grants it
// roles/datastore.user, Analytics and Search Console a read-only seat that the
// owner adds by hand. No SDK: a JWT signed with node:crypto, traded for an
// hour's token per scope, kept while the function stays warm.

import { createSign } from 'node:crypto';

export const SCOPES = {
	datastore: 'https://www.googleapis.com/auth/datastore',
	analytics: 'https://www.googleapis.com/auth/analytics.readonly',
	searchConsole: 'https://www.googleapis.com/auth/webmasters.readonly',
};

// The key Google gives you is a JSON file. Pasted into Vercel as it is, or
// base64-encoded to keep it on one line - either works.
export function parseCredentials(raw) {
	const text = String(raw).trim();
	const json = text.startsWith('{') ? text : Buffer.from(text, 'base64').toString('utf8');
	const credentials = JSON.parse(json);
	if (!credentials.client_email || !credentials.private_key) {
		throw new Error('FIRESTORE_CREDENTIALS is not a service account key: it has no client_email or private_key.');
	}
	return credentials;
}

const tokens = new Map();

export async function accessToken(credentials, scope = SCOPES.datastore) {
	const key = `${credentials.client_email} ${scope}`;
	const cached = tokens.get(key);
	if (cached && cached.expires > Date.now() + 60000) return cached.token;
	const now = Math.floor(Date.now() / 1000);
	const audience = credentials.token_uri || 'https://oauth2.googleapis.com/token';
	const part = (object) => Buffer.from(JSON.stringify(object)).toString('base64url');
	const unsigned = `${part({ alg: 'RS256', typ: 'JWT' })}.${part({ iss: credentials.client_email, scope, aud: audience, iat: now, exp: now + 3600 })}`;
	const signature = createSign('RSA-SHA256').update(unsigned).sign(credentials.private_key, 'base64url');
	const response = await fetch(audience, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` }),
	});
	if (!response.ok) throw new Error(`Google token ${response.status}: ${(await response.text()).slice(0, 200)}`);
	const { access_token: token, expires_in: life } = await response.json();
	tokens.set(key, { token, expires: Date.now() + (life || 3600) * 1000 });
	return token;
}
