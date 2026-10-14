// End-to-end checks of lost and found: every route, through the real
// serverless function, twice - against a throwaway JSON file, and against a
// stand-in for Firestore (fake_firestore.mjs) that refuses any query the
// declared indexes could not serve, the way the real one does.
//
//   node scripts/check_lostfound.mjs        (or: mise check-lostfound)
//
// What it holds the API to: no public route ever returns a name, phone, email
// or token; long numbers, emails and links are refused in public text; a key
// opens only its own listing or place; three reports take a listing down; the
// hour's limits hold; writes must be JSON from this origin. And the admin:
// only the owner's Google account gets a session, a forged or tampered one is
// refused, and no admin view carries a listing's or a reply's contact details.
// Run it after any change to api/.

import { createServer } from 'node:http';
import { promises as fs, readFileSync } from 'node:fs';
import { generateKeyPairSync } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import handler from '../api/lost-found.mjs';
import adminHandler from '../api/admin.mjs';
import { sessionCookie } from '../api/_admin/auth.mjs';
import { OWNER_EMAIL } from '../api/_admin/owner.mjs';
import { DECLARED, startFakeFirestore } from './fake_firestore.mjs';

let failures = 0;
const check = (label, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`); if (!ok) failures++; };
const today = new Date().toISOString().slice(0, 10);
const inDays = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
// An event an organiser might send, with the fields the form posts.
const anEvent = (extra = {}) => ({
	title: 'Osu Night Market', category: 'food', starts: inDays(30), time: '6pm to midnight', venue: 'Oxford Street car park', area: 'Osu',
	organiser: 'Osu Traders Collective', price: 'Free entry', url: 'https://example.com/osu-night-market',
	description: 'Forty food stalls, a DJ and craft sellers on the last Friday of the month. Families welcome until nine.',
	contact_name: 'Kofi', contact_email: 'kofi@organiser.example', contact_phone: '0722000111', ...extra,
});
const common = {
	LOSTFOUND_SALT: 'check', LOSTFOUND_BASE_URL: 'http://localhost', CRON_SECRET: 'check-cron',
	ADMIN_SESSION_SECRET: 'check-session-secret-that-is-long-enough', GOOGLE_CLIENT_ID: 'check-client.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'check-client-secret',
};

// Google's token endpoint and GitHub, stood in for: the checks never leave
// the machine. `google.claims` is what the next sign-in's ID token will say.
const google = { claims: null };
const realFetch = globalThis.fetch;
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
// GitHub's copy of the events calendar: read, and replaced by each commit.
const gh = { text: readFileSync(new URL('../content/events-calendar.yaml', import.meta.url), 'utf8').replace(/\r\n/g, '\n'), sha: 'sha0', commits: [] };
// GA4 answers, made up but shaped exactly like the real thing.
function gaReport(req) {
	const metrics = (req.metrics || []).map((m) => m.name);
	const values = (n) => metrics.map((_, i) => ({ value: String(n + i) }));
	const dims = (req.dimensions || []).map((d) => d.name);
	if (!dims.length && (req.dateRanges || []).length === 2) return { rows: [{ dimensionValues: [{ value: 'current' }], metricValues: values(10) }, { dimensionValues: [{ value: 'previous' }], metricValues: values(8) }] };
	if (dims[0] === 'date') return { rows: ['20261001', '20261002', '20261003'].map((d, i) => ({ dimensionValues: [{ value: d }], metricValues: values(i + 1) })) };
	if (dims[0] === 'customEvent:guide') {
		const rows = [['guides/rent-advance', '4', 12], ['guides/rent-advance', '2', 3], ['guides/paye-and-taxes', '5', 2]];
		return { rows: rows.map(([g, sc, n]) => ({ dimensionValues: [{ value: g }, { value: sc }], metricValues: [{ value: String(n) }] })) };
	}
	return { rows: dims.length ? [{ dimensionValues: dims.map(() => ({ value: '/guides/a' })), metricValues: values(5) }, { dimensionValues: dims.map(() => ({ value: '/guides/b' })), metricValues: values(2) }] : [{ metricValues: values(3) }] };
}
const google_ = { property: '123' };
globalThis.fetch = async (url, init = {}) => {
	const u = String(url);
	if (u === 'https://oauth2.googleapis.com/token') {
		// The service account's JWT exchange, or Google sign-in's code exchange.
		if (String(init.body).includes('jwt-bearer')) return json({ access_token: 'sa-token', expires_in: 3600 });
		const part = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
		return json({ id_token: `${part({ alg: 'RS256' })}.${part(google.claims)}.sig` });
	}
	if (u.startsWith('https://analyticsdata.googleapis.com/')) {
		if (google_.property === '998') return json({ error: { message: 'Google Analytics Data API has not been used in project 123 before or it is disabled. Enable it by visiting https://console.developers.google.com/apis/api/analyticsdata.googleapis.com/overview?project=123 then retry.' } }, 403);
		if (!u.includes(`/properties/${google_.property}:`) || google_.property === '999') return json({ error: { message: 'User does not have sufficient permissions' } }, 403);
		const body = JSON.parse(init.body);
		if (u.endsWith(':batchRunReports')) return json({ reports: body.requests.map(gaReport) });
		return json(gaReport(body));
	}
	if (u.startsWith('https://searchconsole.googleapis.com/')) {
		if (u.includes('sc-domain')) return json({ error: { message: 'no access' } }, 403);
		const body = JSON.parse(init.body);
		const d = body.dimensions || [];
		if (!d.length) return json({ rows: [{ clicks: 40, impressions: 2000, ctr: 0.02, position: 9.1 }] });
		if (d.join() === 'query,page') return json({ rows: [
			{ keys: ['where to shop cheap accra', '/guides/where-to-shop-in-accra'], clicks: 0, impressions: 90, ctr: 0, position: 5.6 },
			{ keys: ['birth certificate ghana', '/guides/birth-certificate'], clicks: 3, impressions: 60, ctr: 0.05, position: 14 },
			{ keys: ['rent advance', '/guides/rent-advance'], clicks: 30, impressions: 300, ctr: 0.1, position: 3 },
		] });
		return json({ rows: [{ keys: [d[0] === 'date' ? '2026-10-01' : 'x'], clicks: 5, impressions: 100, ctr: 0.05, position: 7 }] });
	}
	if (u.startsWith('https://api.github.com/') && u.includes('/contents/frontend/content/events-calendar.yaml')) {
		if (!init.headers?.Authorization) return json({}, 401);
		if ((init.method || 'GET') === 'GET') return json({ content: Buffer.from(gh.text).toString('base64'), sha: gh.sha });
		const body = JSON.parse(init.body);
		if (body.sha !== gh.sha) return json({ message: 'sha mismatch' }, 409);
		gh.text = Buffer.from(body.content, 'base64').toString('utf8');
		gh.sha = `sha${gh.commits.length + 1}`;
		gh.commits.push(body.message);
		return json({ commit: { sha: `c0ffee${gh.commits.length}`, html_url: 'https://github.com/x/y/commit/c0ffee' } });
	}
	if (u.startsWith('https://api.github.com/')) return new Response('{}', { status: 503 });
	return realFetch(url, init);
};
const jar = (res) => Object.fromEntries(res.headers.getSetCookie().map((c) => c.split(';')[0].split('=')).map(([k, ...v]) => [k, v.join('=')]));
const asCookie = (setCookie) => setCookie.split(';')[0];

async function serve(env) {
	const server = createServer((req, res) => (req.url.startsWith('/api/admin') ? adminHandler : handler)(req, res, env));
	await new Promise((resolve) => server.listen(0, resolve));
	const B = `http://localhost:${server.address().port}/api/lost-found`;
	const get = async (r, params = {}, key) => {
		const res = await fetch(`${B}?r=${r}&${new URLSearchParams(params)}`, { headers: key ? { 'X-LostFound-Key': key } : {} });
		return { status: res.status, body: await res.json() };
	};
	const post = async (r, body, key, headers = {}) => {
		const res = await fetch(`${B}?r=${r}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(key ? { 'X-LostFound-Key': key } : {}), ...headers }, body: JSON.stringify(body) });
		return { status: res.status, body: await res.json() };
	};
	const A = `http://localhost:${server.address().port}/api/admin`;
	const owner = asCookie(sessionCookie(env));
	const aget = async (r, params = {}, cookie = owner) => {
		const res = await fetch(`${A}?r=${r}&${new URLSearchParams(params)}`, { headers: cookie ? { Cookie: cookie } : {} });
		return { status: res.status, body: await res.json() };
	};
	const apost = async (r, body, cookie = owner, headers = {}) => {
		const res = await fetch(`${A}?r=${r}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...headers }, body: JSON.stringify(body) });
		return { status: res.status, body: await res.json() };
	};
	return { A, B, owner, get, post, aget, apost, close: () => server.close() };
}

async function suite(env) {
	const { B, owner, get, post, aget, apost, close } = await serve(env);

	const meta = await get('meta');
	check('meta answers', meta.status === 200 && meta.body.vocab.categories.length === 12);

	// A lost phone.
	const lost = await post('report', { kind: 'lost', category: 'phone', title: 'Black Samsung A54 in a blue case', details: 'Cracked corner, sticker of a lion on the back', district: 'westlands', place_text: 'Trotro from Circle to La', happened_on: today, contact_name: 'Ama', contact_phone: '0712 345 678' });
	check('report lost', lost.status === 200 && /^L-[A-Z2-9]{5}$/.test(lost.body.ref), JSON.stringify(lost.body).slice(0, 120));
	const lostKey = lost.body.manage?.split('#t=')[1];

	// A found phone, which should match.
	const found = await post('report', { kind: 'found', category: 'phone', title: 'Samsung phone, blue case', details: 'Found on a trotro seat', district: 'westlands', place_text: 'La junction trotro', happened_on: today, contact_email: 'finder@example.com' });
	check('report found', found.status === 200 && found.body.ref.startsWith('F-'));
	check('found report returns the lost phone as a match', found.body.matches.some((m) => m.ref === lost.body.ref));
	const foundKey = found.body.manage.split('#t=')[1];

	// Privacy: no public route leaks contact details.
	const list = await get('items');
	const leak = JSON.stringify(list.body);
	check('list has both items', list.body.items.length === 2);
	check('list carries no phone, email, name or token hash', !/024|233|finder@|Ama|token_hash|ip_hash/.test(leak));
	const one = await get('item', { ref: lost.body.ref });
	check('item page carries no contact details', !/233|Ama|token/.test(JSON.stringify(one.body)));

	// Filters and search.
	const one1 = await get('items', { limit: '1' });
	check('limit gives a smaller page, newest first, and says there is more', one1.body.items.length === 1 && one1.body.items[0].ref === found.body.ref && one1.body.more === true);
	check('limit never gives a larger page', (await get('items', { limit: '999' })).body.items.length === 2);
	check('filter by kind', (await get('items', { kind: 'found' })).body.items.every((i) => i.kind === 'found'));
	check('search finds by word', (await get('items', { q: 'lion' })).body.items.length === 1);
	check('search with junk characters does not break', (await get('items', { q: 'a,(b)*' })).status === 200);

	// The number rule.
	const card = await post('report', { kind: 'found', category: 'documents', title: 'ID card 12345678', place_text: 'Sarit Centre', happened_on: today, contact_phone: '0711234567' });
	check('a card number in public text is refused', card.status === 400 && card.body.code === 'number', card.body.error);
	const mail = await post('report', { kind: 'found', category: 'keys', title: 'Keys', details: 'call me at x@y.com', place_text: 'Osu', happened_on: today, contact_phone: '0711234567' });
	check('an email in public text is refused', mail.status === 400 && mail.body.code === 'contact');
	const nocontact = await post('report', { kind: 'lost', category: 'keys', title: 'Keys', place_text: 'Osu', happened_on: today });
	check('a report with no way to reach you is refused', nocontact.status === 400 && nocontact.body.code === 'contact');
	const honeypot = await post('report', { kind: 'lost', category: 'keys', title: 'Keys', place_text: 'Osu', happened_on: today, contact_phone: '0711234567', website: 'spam' });
	check('the honeypot refuses a bot', honeypot.status === 400);

	// A claim on the found phone, from the owner.
	const claim = await post('claim', { ref: found.body.ref, message: 'That is mine - there is a lion sticker on the back and the corner is cracked.', contact_phone: '0712345679', contact_name: 'Ama' });
	check('claim accepted', claim.status === 200);
	const short = await post('claim', { ref: found.body.ref, message: 'mine', contact_phone: '0712345679' });
	check('a one-word claim is refused', short.status === 400);

	// The finder's manage link shows the claim, with how to reach the owner.
	const manage = await get('manage', {}, foundKey);
	check('manage shows the claim with its contact', manage.status === 200 && manage.body.claims.length === 1 && manage.body.claims[0].contact_phone === '+254712345679');
	check('manage needs the right key', (await get('manage', {}, 'wrong')).status === 404);
	check('manage needs a key at all', (await get('manage')).status === 401);
	const accepted = await post('manage', { action: 'accept', claim: manage.body.claims[0].id }, foundKey);
	check('accept a claim', accepted.body.claims[0].status === 'accepted');
	const returned = await post('manage', { action: 'returned' }, foundKey);
	check('mark returned', returned.body.item.status === 'returned');
	check('a returned item leaves the public list', !(await get('items')).body.items.some((i) => i.ref === found.body.ref));
	check('a closed listing refuses claims', (await post('claim', { ref: found.body.ref, message: 'Actually it is mine really, honestly.', contact_phone: '0712345679' })).status === 404);
	check('one key cannot manage another listing', (await post('manage', { action: 'close' }, lostKey)).body.item.ref === lost.body.ref);

	// Places: apply, approve, portal, public page.
	const join = await post('join', { name: 'Sarit Centre', kind: 'mall', district: 'westlands', address: 'Westlands Road, Westlands', hours: 'Daily 9am to 9pm', collect_note: 'Customer service desk, ground floor', contact_public: 'Customer service desk', contact_email: 'desk@saritcentre.example', contact_phone: '0720000000' });
	check('a place applies', join.status === 200);
	check('a pending place is not public', (await get('places')).body.places.length === 0);
	check('the admin needs a session', (await aget('overview', {}, null)).status === 401);
	check('a session for anyone but the owner is refused', (await aget('overview', {}, asCookie(sessionCookie(env, 'someone.else@gmail.com')))).status === 401);
	check('a tampered session is refused', (await aget('overview', {}, owner.slice(0, -3) + 'abc')).status === 401);
	check('the old password admin is gone', (await get('admin')).status === 404);
	const overview = await aget('overview');
	check('the admin sees the pending place', overview.body.counts.pending === 1 && overview.body.pending[0].slug === 'sarit-centre' && overview.body.pending[0].contact_email === 'desk@saritcentre.example');
	const approve = await apost('place', { action: 'approve', slug: 'sarit-centre' });
	check('approval returns a portal link', /\/lost-and-found\/portal#t=/.test(approve.body.link || ''));
	const portalKey = approve.body.link.split('#t=')[1];
	const added = await post('portal', { action: 'add', category: 'bag', title: 'Brown leather handbag', details: 'Left at the food court', place_text: 'Food court, level 1', happened_on: today }, portalKey);
	check('a place logs a found item', added.status === 200 && added.body.items.length === 1);
	const placePage = await get('place', { slug: 'sarit-centre' });
	check('the public place page lists it, with no private contact', placePage.body.items.length === 1 && !/desk@|0302/.test(JSON.stringify(placePage.body)));
	check('the place appears in places with a count', (await get('places')).body.places[0].holding === 1);
	const bagRef = added.body.items[0].ref;
	await post('claim', { ref: bagRef, message: 'My brown handbag, it has a red scarf inside it and a receipt.', contact_email: 'owner@example.com' });
	const portal = await get('portal', {}, portalKey);
	check('the portal shows the claim', portal.body.claims.length === 1 && portal.body.claims[0].ref === bagRef);
	check('a portal cannot touch other listings', (await post('portal', { action: 'close', ref: lost.body.ref }, portalKey)).status === 400);

	// Enough listings to need more than one page, and more than one read from
	// the database: the one search word that matches is on the oldest, so
	// finding it means reading past the first batch.
	await post('portal', { action: 'add', category: 'other', title: 'Zebra print umbrella', place_text: 'Entrance B', happened_on: today }, portalKey);
	for (let i = 0; i < 55; i++) await post('portal', { action: 'add', category: 'other', title: `Umbrella number ${i}`, place_text: 'Entrance B', happened_on: today }, portalKey);
	const zebra = await get('items', { q: 'zebra' });
	check('a search finds a match past the first batch read', zebra.body.items.length === 1 && zebra.body.items[0].title === 'Zebra print umbrella');
	const pages = [];
	for (let page = 0; page < 4; page++) pages.push(...(await get('items', { page: String(page) })).body.items.map((item) => item.ref));
	// The lost phone was closed above, so the place's items are every live listing.
	const open = (await get('place', { slug: 'sarit-centre' })).body.items.length;
	check('pages cover every live listing once', pages.length === open && new Set(pages).size === pages.length, `${pages.length} paged, ${open} live`);

	// The purge: only with the cron secret, and nothing recent is touched.
	check('the purge needs the cron secret', (await get('purge')).status === 401);
	const purged = await (await fetch(`${B}?r=purge`, { headers: { Authorization: 'Bearer check-cron' } })).json();
	check('the purge runs', purged.ok === true, JSON.stringify(purged));
	const afterPurge = await get('manage', {}, foundKey);
	check('the purge leaves recent contact details alone', afterPurge.body.claims[0]?.contact_phone === '+254712345679');

	// Reports take a listing down at three.
	for (let i = 0; i < 3; i++) await post('flag', { ref: lost.body.ref, reason: 'spam' });
	check('three reports hide a listing', (await get('item', { ref: lost.body.ref })).status === 404);
	const reported = await aget('reports');
	check('the admin sees the report and its reason', reported.body.items.some((i) => i.ref === lost.body.ref && i.status === 'hidden' && i.reasons.includes('spam')));
	check('hidden listings can be filtered for', (await aget('items', { status: 'hidden' })).body.items.every((i) => i.status === 'hidden'));
	const restore = await apost('item', { action: 'restore', ref: lost.body.ref });
	check('the admin can restore it', restore.status === 200 && restore.body.item.status === 'open' && (await get('item', { ref: lost.body.ref })).status === 200);

	// The admin's other powers, and what it is not shown.
	const detail = await aget('item', { ref: found.body.ref });
	check('a listing in the admin shows replies but not who sent them', detail.status === 200 && detail.body.claims.length === 1 && detail.body.item.has_contact && !/\+254|finder@|\bAma\b|owner@/.test(JSON.stringify(detail.body)));
	check('no admin listing view carries contact details', !/\+254|finder@|\bAma\b|owner@|token_hash|ip_hash/.test(JSON.stringify([(await aget('items')).body, (await aget('overview')).body])));
	check('a reference finds its listing', (await aget('items', { q: found.body.ref.toLowerCase() })).body.items[0]?.ref === found.body.ref);
	const edited = await apost('place', { action: 'edit', slug: 'sarit-centre', fields: { name: 'Sarit Centre', address: 'Westlands Road, Westlands', hours: 'Daily 10am to 10pm', collect_note: 'Customer service desk', contact_public: 'Customer service desk' } });
	check('the admin can edit a place', edited.body.place.hours === 'Daily 10am to 10pm' && (await get('place', { slug: 'sarit-centre' })).body.place.hours === 'Daily 10am to 10pm');
	await apost('place', { action: 'suspend', slug: 'sarit-centre' });
	check('a suspended place leaves the public site', (await get('place', { slug: 'sarit-centre' })).status === 404);
	const back = await apost('place', { action: 'reactivate', slug: 'sarit-centre' });
	check('and comes back', back.body.place.status === 'active' && (await get('place', { slug: 'sarit-centre' })).status === 200);
	const relinked = await apost('place', { action: 'relink', slug: 'sarit-centre' });
	check('a new portal link retires the old one', /portal#t=/.test(relinked.body.link || '') && (await get('portal', {}, portalKey)).status !== 200);
	const erased = await apost('item', { action: 'erase', ref: found.body.ref, note: 'asked by email' });
	const managed = await get('manage', {}, foundKey);
	check('erasing a listing\'s details clears it and its replies', !erased.body.item.has_contact && managed.body.item && !managed.body.claims[0]?.contact_phone && !managed.body.claims[0]?.contact_email);
	const entries = (await aget('log')).body.entries;
	check('every admin action is in the log', ['place.approve', 'item.restore', 'place.edit', 'place.suspend', 'place.reactivate', 'place.relink', 'item.erase'].every((a) => entries.some((e) => e.action === a)) && entries.every((e) => e.by === OWNER_EMAIL));
	check('the log says a link was issued, not what it was', !JSON.stringify(entries).includes(relinked.body.link.split('#t=')[1]));
	const site = await aget('site');
	check('site settings say what is set, never what it is', site.status === 200 && site.body.settings.dailyPurge === true && !/check-cron|check-client-secret|check-session/.test(JSON.stringify(site.body)));
	check('an admin write from another origin is refused', (await apost('item', { action: 'hide', ref: lost.body.ref }, owner, { Origin: 'https://evil.example' })).status === 403);
	check('an unknown admin action is refused', (await apost('item', { action: 'drop', ref: lost.body.ref })).status === 400);

	// The site-wide notice: off, on, and cached at the edge for a minute.
	const quiet = await fetch(`${B}?r=notice`);
	check('with no notice set, there is none', (await quiet.json()).banner === null && /s-maxage=60/.test(quiet.headers.get('cache-control')));
	await apost('settings', { what: 'banner', banner: { active: true, text: 'PAYE bands changed on 1 September 2026.', tone: 'warning', link: '/guides/paye-and-taxes', link_text: 'Read more' } });
	const notice = (await get('notice')).body.banner;
	check('a notice set in the admin reaches the site', notice?.text === 'PAYE bands changed on 1 September 2026.' && notice.tone === 'warning' && Boolean(notice.version));
	check('a notice cannot link anywhere odd', (await apost('settings', { what: 'banner', banner: { active: true, text: 'x', link: 'javascript:alert(1)' } })).body.banner.link === '');
	await apost('settings', { what: 'banner', banner: { active: true, text: 'Old news', until: '2020-01-01' } });
	check('a notice past its end date is not shown', (await get('notice')).body.banner === null);
	await apost('settings', { what: 'banner', banner: { active: false } });

	// Pausing lost and found, and the hourly limits.
	await apost('settings', { what: 'lostfound', lostfound: { paused: true, message: 'Back at noon.' } });
	const paused = await post('report', { kind: 'lost', category: 'keys', title: 'Keys while paused', place_text: 'Osu', happened_on: today, contact_phone: '0711234567' });
	check('paused, new listings are refused with the message', paused.status === 503 && paused.body.code === 'paused' && paused.body.error === 'Back at noon.' && (await get('meta')).body.paused === 'Back at noon.');
	await apost('settings', { what: 'lostfound', lostfound: { paused: false, limits: { itemsPerHour: 2 } } });
	check('a lower hourly limit takes effect', (await post('report', { kind: 'lost', category: 'keys', title: 'Keys over the limit', place_text: 'Osu', happened_on: today, contact_phone: '0711234567' })).status === 429);
	await apost('settings', { what: 'lostfound', lostfound: { paused: false, limits: {} } });
	check('and back to the default', (await post('report', { kind: 'lost', category: 'keys', title: 'Keys within the limit', place_text: 'Osu', happened_on: today, contact_phone: '0711234567' })).status === 200);
	check('every settings change is in the log', (await aget('log')).body.entries.filter((e) => e.action.startsWith('settings.')).length >= 5);

	// Editing and deleting a listing outright.
	const newKey = relinked.body.link.split('#t=')[1];
	const doomed = (await post('portal', { action: 'add', category: 'other', title: 'Umbrella to delete', place_text: 'Entrance B', happened_on: today }, newKey)).body.items.find((i) => i.title === 'Umbrella to delete');
	const renamed = await apost('item', { action: 'edit', ref: doomed.ref, fields: { title: 'Green umbrella', details: 'Folding', place_text: 'Entrance B', category: 'other', happened_on: today } });
	check('the admin can edit a listing', renamed.body.item?.title === 'Green umbrella' && (await get('item', { ref: doomed.ref })).body.item.title === 'Green umbrella');
	check('an edit is held to the public-text rules too', (await apost('item', { action: 'edit', ref: doomed.ref, fields: { title: 'Card GHA-712345678-9', place_text: 'x', happened_on: today } })).status === 400);
	check('deleting needs the reference typed', (await apost('item', { action: 'delete', ref: doomed.ref, confirm: 'yes' })).status === 400);
	const gone = await apost('item', { action: 'delete', ref: doomed.ref, confirm: doomed.ref });
	check('a deleted listing is gone for good', gone.body.deleted === doomed.ref && (await get('item', { ref: doomed.ref })).status === 404 && (await aget('item', { ref: doomed.ref })).status === 404);

	// Lost and found's numbers, and the analytics that are not set up here.
	const stats = await aget('lostfound', { days: '28', fresh: '1' });
	check('lost and found has numbers', stats.body.ready && stats.body.totals.listed > 0 && stats.body.daily.length === 28 && stats.body.categories.length > 0);
	const ga = await aget('traffic');
	check('analytics that are not set up say what is missing', ga.status === 200 && ga.body.ready === false && ga.body.reason === 'credentials');
	check('so does the events calendar without a GitHub token', (await aget('events')).body.code === 'not-configured');

	// Events sent in by organisers: checked, held, and only listed by the admin.
	const evMeta = await get('event-meta');
	check('the event form gets its categories and dates', evMeta.status === 200 && evMeta.body.categories.length === 8 && evMeta.body.earliest === today && evMeta.body.paused === null);
	const sentIn = await post('event', anEvent());
	check('an organiser sends an event', sentIn.status === 200 && /^E-[A-Z2-9]{5}$/.test(sentIn.body.ref), JSON.stringify(sentIn.body).slice(0, 120));
	check('the same event sent twice is refused while it waits', (await post('event', anEvent({ title: 'OSU NIGHT MARKET!' }))).status === 409);
	check('a date that has passed is refused', (await post('event', anEvent({ title: 'Yesterday Fair', starts: inDays(-1) }))).body.code === 'date');
	check('a date years away is refused', (await post('event', anEvent({ title: 'Far Future Fair', starts: inDays(900) }))).body.code === 'date');
	check('an end before the start is refused', (await post('event', anEvent({ title: 'Backwards Fair', ends: inDays(10) }))).body.code === 'date');
	check('a link in the description is refused', (await post('event', anEvent({ title: 'Linky Fair', description: 'Tickets and everything else you need to know are at www.example.com right now.' }))).body.code === 'contact');
	check('a link that is not https is refused', (await post('event', anEvent({ title: 'Plain Fair', url: 'http://example.com' }))).body.code === 'url');
	check('an event with no email is refused', (await post('event', anEvent({ title: 'Silent Fair', contact_email: '' }))).body.code === 'contact');
	check('a one-line description is refused', (await post('event', anEvent({ title: 'Short Fair', description: 'A fair.' }))).status === 400);
	check('the honeypot refuses a bot sending events', (await post('event', anEvent({ title: 'Bot Fair', website: 'spam' }))).status === 400);
	const waiting = await aget('submissions');
	check('the admin sees what was sent, with who sent it', waiting.body.submissions.length === 1 && waiting.body.submissions[0].ref === sentIn.body.ref && waiting.body.submissions[0].contact_email === 'kofi@organiser.example');
	check('and the overview counts it', (await aget('overview')).body.counts.eventsPending === 1);
	check('nothing public carries the organiser\'s details', !/kofi@|0722000111|\bKofi\b/.test(JSON.stringify([(await get('event-meta')).body, (await get('items')).body])));
	const opened_ = await aget('submission', { ref: sentIn.body.ref });
	check('a submission opens with the calendar entry it would become', opened_.body.event.title === 'Osu Night Market' && opened_.body.event.source.includes('Osu Traders Collective') && opened_.body.event.last_verified === today && opened_.body.similar === null);
	check('approving without GitHub set up fails and leaves it waiting', (await apost('submission', { action: 'approve', ref: sentIn.body.ref })).body.code === 'not-configured' && (await aget('submission', { ref: sentIn.body.ref })).body.submission.status === 'pending');
	const turned = await apost('submission', { action: 'reject', ref: sentIn.body.ref, reason: 'We could not confirm the date with the venue.' });
	check('the admin can turn one down, with a reason', turned.body.submission.status === 'rejected' && turned.body.submission.reason.startsWith('We could not') && Boolean(turned.body.submission.decided_at));
	check('a turned-down event can be sent again', (await post('event', anEvent())).status === 200);
	check('and reopened', (await apost('submission', { action: 'reopen', ref: sentIn.body.ref })).body.submission.status === 'pending');
	await apost('settings', { what: 'events', events: { paused: true, message: 'Back on Monday.' } });
	const evPaused = await post('event', anEvent({ title: 'Paused Fair' }));
	check('paused, events are refused with the message', evPaused.status === 503 && evPaused.body.error === 'Back on Monday.' && (await get('event-meta')).body.paused === 'Back on Monday.');
	await apost('settings', { what: 'events', events: { paused: false } });
	check('a third event in the hour is accepted', (await post('event', anEvent({ title: 'Third Fair' }))).status === 200);
	check('a fourth is refused', (await post('event', anEvent({ title: 'Fourth Fair' }))).status === 429);
	const erasedSub = await apost('submission', { action: 'erase', ref: sentIn.body.ref });
	check('the organiser\'s details can be erased', !erasedSub.body.submission.contact_email && !erasedSub.body.submission.contact_name);
	const subLog = (await aget('log')).body.entries.map((e) => e.action);
	check('submission actions are in the log', ['submission.reject', 'submission.reopen', 'submission.erase', 'settings.events'].every((a) => subLog.includes(a)));

	// Requests from elsewhere, and in the wrong shape.
	check('a POST that is not JSON is refused', (await fetch(`${B}?r=report`, { method: 'POST', body: 'x=1', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })).status === 415);
	check('a POST from another origin is refused', (await post('claim', { ref: bagRef, message: 'From somewhere else entirely, mine.', contact_phone: '0712345679' }, null, { Origin: 'https://evil.example' })).status === 403);
	check('an unknown route is a 404', (await get('drop-tables')).status === 404);

	// The rate limit.
	let last;
	for (let i = 0; i < 6; i++) last = await post('report', { kind: 'lost', category: 'keys', title: `Keys ${i}`, place_text: 'Osu', happened_on: today, contact_phone: '0711234567' });
	check('the sixth report in an hour is refused', last.status === 429);

	close();
}

console.log('--- against a JSON file');
const file = path.join(os.tmpdir(), `lostfound-check-${process.pid}.json`);
await suite({ ...common, LOSTFOUND_FILE: file });
await fs.rm(file, { force: true });

console.log('\n--- against Firestore, held to its index rules');
const firestore = await startFakeFirestore();
const firestoreEnv = { ...common, FIRESTORE_EMULATOR_HOST: firestore.host, FIRESTORE_PROJECT: 'check' };
await suite(firestoreEnv);
check('no query needed an index that is not declared', firestore.stats.refused === 0, `${firestore.stats.refused} refused of ${firestore.stats.queries}`);
await firestore.close();

console.log('\n--- signing in');
{
	const { A, aget, close } = await serve({ ...common, LOSTFOUND_FILE: path.join(os.tmpdir(), `lostfound-signin-${process.pid}.json`) });
	const start = await fetch(`${A}?r=login`, { redirect: 'manual' });
	const to = new URL(start.headers.get('location'));
	const oauth = jar(start)['__Host-aa_oauth'];
	check('signing in goes to Google, for the owner, with PKCE', start.status === 302 && to.host === 'accounts.google.com' && to.searchParams.get('login_hint') === OWNER_EMAIL && to.searchParams.get('code_challenge_method') === 'S256' && Boolean(oauth));
	const callback = async (claims, { state = to.searchParams.get('state'), cookie = oauth } = {}) => {
		google.claims = { iss: 'https://accounts.google.com', aud: common.GOOGLE_CLIENT_ID, exp: Math.floor(Date.now() / 1000) + 600, nonce: to.searchParams.get('nonce'), email_verified: true, ...claims };
		const res = await fetch(`${A}?r=callback&code=abc&state=${state}`, { redirect: 'manual', headers: { Cookie: `__Host-aa_oauth=${cookie}` } });
		return { location: res.headers.get('location'), session: jar(res)['__Host-aa_admin'] };
	};
	const ok = await callback({ email: OWNER_EMAIL });
	check('the owner is let in', ok.location === '/admin' && Boolean(ok.session) && (await aget('me', {}, `__Host-aa_admin=${ok.session}`)).body.email === OWNER_EMAIL);
	const other = await callback({ email: 'someone.else@gmail.com' });
	check('any other Google account is turned away', other.location === '/admin#signin=denied' && !other.session);
	check('an unverified owner address is turned away', (await callback({ email: OWNER_EMAIL, email_verified: false })).location === '/admin#signin=denied');
	check('a forged callback is turned away', (await callback({ email: OWNER_EMAIL }, { state: 'forged' })).location === '/admin#signin=state');
	check('a replayed token is turned away', (await callback({ email: OWNER_EMAIL, nonce: 'other' })).location === '/admin#signin=token');
	check('a token for another app is turned away', (await callback({ email: OWNER_EMAIL, aud: 'someone-else' })).location === '/admin#signin=token');
	const out = await fetch(`${A}?r=logout`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
	check('signing out clears the session', jar(out)['__Host-aa_admin'] === '');
	close();
}
{
	const devEnv = { ...common, LOSTFOUND_FILE: path.join(os.tmpdir(), `lostfound-dev-${process.pid}.json`), ADMIN_DEV_LOGIN: '1' };
	const dev = await serve(devEnv);
	const local = await fetch(`${dev.A}?r=login`, { redirect: 'manual' });
	check('a laptop can sign in without Google', local.headers.get('location') === '/admin' && Boolean(jar(local)['__Host-aa_admin']));
	dev.close();
	const vercel = await serve({ ...devEnv, VERCEL: '1' });
	const deployed = await fetch(`${vercel.A}?r=login`, { redirect: 'manual' });
	check('but never on Vercel', new URL(deployed.headers.get('location'), 'http://x').host === 'accounts.google.com');
	vercel.close();
}

console.log('\n--- analytics and the events calendar');
{
	const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
	const key = JSON.stringify({ type: 'service_account', project_id: 'check', client_email: 'site@check.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) });
	const fakeDb = await startFakeFirestore();
	const { aget, apost, post, close } = await serve({ ...common, FIRESTORE_EMULATOR_HOST: fakeDb.host, FIRESTORE_PROJECT: 'check', FIRESTORE_CREDENTIALS: key, GA4_PROPERTY_ID: '123', GITHUB_TOKEN: 'check-github' });

	const t = (await aget('traffic', { days: '7', fresh: '1' })).body;
	check('traffic: totals against the period before', t.ready && t.totals.current.activeUsers === 10 && t.totals.previous.activeUsers === 8 && t.daily.length === 3 && t.daily[0].date === '2026-10-01' && t.pages.length === 2 && typeof t.realtime.users === 'number');
	const lv = (await aget('live')).body;
	check('live visitors, for the dashboard to poll', lv.ready && typeof lv.users === 'number' && Array.isArray(lv.pages));
	const s = (await aget('search', { days: '28', fresh: '1' })).body;
	check('search: falls back to the URL property, and finds the unclicked page', s.ready && s.site === 'https://www.allaboutnairobi.com/' && s.totals.current.clicks === 40 && s.unclicked.length === 1 && s.unclicked[0].query === 'where to shop cheap accra' && s.nearlyThere[0]?.query === 'birth certificate ghana');
	const r = (await aget('ratings', { fresh: '1' })).body;
	const rent = r.guides?.find((g) => g.guide === 'guides/rent-advance');
	check('ratings: a mean from enough votes, and none from too few', r.ready && rent.votes === 15 && rent.mean === 3.6 && rent.enough && r.guides.find((g) => g.guide === 'guides/paye-and-taxes').enough === false);
	google_.property = '999';
	const denied = (await aget('traffic', { days: '7', fresh: '1' })).body;
	check('without access, it names the account to add', denied.ready === false && denied.reason === 'access' && denied.account === 'site@check.iam.gserviceaccount.com');
	google_.property = '998';
	const off = (await aget('traffic', { days: '7', fresh: '1' })).body;
	check('a switched-off API is told apart from missing access, with the link', off.ready === false && off.reason === 'api' && off.link === 'https://console.developers.google.com/apis/api/analyticsdata.googleapis.com/overview?project=123');
	google_.property = '123';

	const cal = (await aget('events')).body;
	const baseEvents = cal.events?.length ?? -1;
	check('the calendar reads from GitHub', baseEvents > 0 && cal.sha === 'sha0');
	const added = await apost('event', { action: 'add', sha: cal.sha, event: { title: 'Admin Check Street Festival', starts: '2027-08-20', ends: '2027-08-22', venue: 'James Town', area: 'Accra Metropolitan', category: 'culture', price: 'Free', description: 'Street art, performance and music across James Town.', source: 'Accra [dot] Alt', last_verified: today } });
	check('adding an event commits it to GitHub', added.status === 200 && added.body.events.length === baseEvents + 1 && gh.commits[0].startsWith('events: Add Admin Check Street Festival') && gh.text.includes('title: Admin Check Street Festival') && added.body.commit.commit === 'c0ffee1');
	check('and leaves every comment in the file alone', (gh.text.match(/^\s*#/gm) || []).length === (readFileSync(new URL('../content/events-calendar.yaml', import.meta.url), 'utf8').match(/^\s*#/gm) || []).length);
	check('an edit from a stale copy is refused', (await apost('event', { action: 'remove', index: baseEvents, sha: 'sha0' })).status === 409);
	check('an annual event cannot be given an invented date', (await apost('event', { action: 'add', sha: gh.sha, event: { title: 'Homowo', annual: true, when: 'August', starts: '2027-08-01', venue: 'Accra', category: 'culture', description: 'Ga harvest festival.', source: 'Ga Traditional Council', last_verified: today } })).status === 400);
	const removed = await apost('event', { action: 'remove', index: baseEvents, sha: gh.sha, title: 'Admin Check Street Festival' });
	check('removing it commits again', removed.body.events.length === baseEvents && !gh.text.includes('Admin Check Street Festival') && gh.commits.length === 2);
	check('event changes are in the log, with their commit', (await aget('log')).body.entries.filter((e) => e.action.startsWith('event.')).length === 2);

	// An organiser's event, approved with an edit: it goes into the calendar
	// through the same commit, with its time and organiser.
	const sub = await post('event', anEvent({ title: 'Accra Jazz Night', category: 'music', venue: 'Alliance Francaise', description: 'An evening of Ghanaian jazz, highlife and guests, from seven until late. All ages.' }));
	const opened = await aget('submission', { ref: sub.body.ref });
	check('opening one checks the calendar for duplicates', Array.isArray(opened.body.similar), JSON.stringify(opened.body).slice(0, 160));
	const listed = await apost('submission', { action: 'approve', ref: sub.body.ref, event: { ...opened.body.event, title: 'Accra Jazz Night at Alliance Francaise' } });
	check('approving commits it to the calendar, as edited', listed.status === 200 && listed.body.submission.status === 'approved' && gh.text.includes('title: Accra Jazz Night at Alliance Francaise') && gh.text.includes('organiser: Osu Traders Collective') && gh.text.includes('time: 6pm to midnight') && gh.commits.at(-1).includes(sub.body.ref), JSON.stringify(listed.body).slice(0, 200));
	check('and records the commit', listed.body.submission.commit === listed.body.commit.slice(0, 12));
	check('it cannot be approved twice', (await apost('submission', { action: 'approve', ref: sub.body.ref })).status === 400);
	check('the calendar file still reads back whole', (await aget('events')).body.events.some((e) => e.title === 'Accra Jazz Night at Alliance Francaise' && e.time === '6pm to midnight'));
	close();
	await fakeDb.close();
}

// With an index missing, Firestore refuses the query; the store should log it
// and answer the slow way rather than fail the page.
const thin = await startFakeFirestore({ indexes: DECLARED.filter((index) => !['kind', 'category'].includes(index.fields[0].fieldPath)) });
const quiet = console.warn;
let warned = 0;
console.warn = () => { warned++; };
{
	const { get, post, close } = await serve({ ...common, FIRESTORE_EMULATOR_HOST: thin.host, FIRESTORE_PROJECT: 'check' });
	await post('report', { kind: 'lost', category: 'keys', title: 'Car keys on a red ring', place_text: 'Osu', happened_on: today, contact_phone: '0711234567' });
	const filtered = await get('items', { kind: 'lost', category: 'keys' });
	check('a missing index is survived, and said', filtered.status === 200 && filtered.body.items.length === 1 && warned > 0, `status ${filtered.status}, warned ${warned}`);
	close();
}
console.warn = quiet;
await thin.close();

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
