// End-to-end checks of the newsletter: the pieces on their own, then the real
// functions - the public one and the admin's - against a throwaway file and
// against the stand-in Firestore, with a stand-in for Resend that keeps every
// email it is handed.
//
//   node scripts/check_newsletter.mjs        (or: mise check-newsletter)
//
// What it holds them to: nobody is on the list until they confirm; the form
// answers the same whatever the address's state, so it cannot be used to find
// out who subscribes; a link in an email acts only for what it was signed
// for; anyone who left, bounced or complained stays off unless they come back
// themselves; every issue goes once to each subscriber and to nobody else,
// even when a batch fails or two tabs send at once; every email carries both
// ways out; the public answers never carry an address in full; only the owner
// sees the list.

import { createServer } from 'node:http';
import { createHmac, randomBytes } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import handler from '../api/news.mjs';
import adminHandler from '../api/admin.mjs';
import { sessionCookie } from '../api/_admin/auth.mjs';
import { OWNER_EMAIL } from '../api/_admin/owner.mjs';
import { configuredStore } from '../api/_lostfound/store.mjs';
import { forgetSettings } from '../api/_lostfound/handlers.mjs';
import { addressesIn } from '../api/_news/admin.mjs';
import { markdown, styled, textOf } from '../api/_news/mail.mjs';
import { cleanEmail, isoDay, keyed, maskEmail, readToken, signToken, sourceOf, subscriberId, verifyWebhook } from '../api/_news/handlers.mjs';
import { startFakeFirestore } from './fake_firestore.mjs';

let failures = 0;
const check = (label, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`); if (!ok) failures++; };
const throws = (fn) => { try { fn(); return false; } catch { return true; } };

// --- the pieces --------------------------------------------------------------------------------

const secretEnv = { NEWSLETTER_SECRET: 'check-newsletter-secret' };
const id = subscriberId('ama@example.com');
check('an address is kept lower-case and trimmed', cleanEmail('  Ama@Example.COM ') === 'ama@example.com');
check('a non-address is refused', [null, '', 'ama', 'ama@', '@x.com', 'a b@x.com', 'ama@x', 'ama@x.c', `${'a'.repeat(65)}@x.com`].every((v) => cleanEmail(v) === null));
check('a pasted list is read whatever its shape', JSON.stringify(addressesIn('a@b.com, "Kofi" <KOFI@example.org>;\nbad@x\tama@gmail.com a@b.com').emails) === JSON.stringify(['a@b.com', 'kofi@example.org', 'ama@gmail.com']));
check('a page becomes a counter name, and nothing else does', sourceOf('/guides/rent-advance') === 'guides/rent-advance' && sourceOf('//guides//x/') === 'guides/x' && sourceOf('/') === 'home' && sourceOf('https://evil.example/') === 'other' && sourceOf('/a.b') === 'other');
check('an address is masked for public answers', maskEmail('kwame@gmail.com') === 'kw***@gmail.com' && maskEmail('k@x.com') === 'k***@x.com');
const confirmToken = signToken(secretEnv, 'confirm', id, 7);
check('a token reads back as its address', readToken(secretEnv, confirmToken, 'confirm') === id);
check('a confirmation token cannot unsubscribe, nor the other way round', throws(() => readToken(secretEnv, confirmToken, 'unsub')) && throws(() => readToken(secretEnv, signToken(secretEnv, 'unsub', id), 'confirm')));
check('a token from another secret is refused', throws(() => readToken({ NEWSLETTER_SECRET: 'another' }, confirmToken, 'confirm')));
check('a tampered or cut-short token is refused', throws(() => readToken(secretEnv, `x${confirmToken.slice(1)}`, 'confirm')) && throws(() => readToken(secretEnv, confirmToken.slice(0, -3), 'confirm')) && throws(() => readToken(secretEnv, `${confirmToken}.x`, 'confirm')));
check('an expired confirmation is refused', throws(() => readToken(secretEnv, signToken(secretEnv, 'confirm', id, -1), 'confirm')));
check('no secret, no tokens', throws(() => signToken({}, 'unsub', id)));

const webhookSecret = `whsec_${randomBytes(24).toString('base64')}`;
const sign = (raw, { secret = webhookSecret, at = Math.floor(Date.now() / 1000) } = {}) => {
	const svixId = `msg_${randomBytes(6).toString('hex')}`;
	const signature = createHmac('sha256', Buffer.from(secret.replace(/^whsec_/, ''), 'base64')).update(`${svixId}.${at}.${raw}`).digest('base64');
	return { 'svix-id': svixId, 'svix-timestamp': String(at), 'svix-signature': `v1,${signature}` };
};
const hookEnv = { RESEND_WEBHOOK_SECRET: webhookSecret };
check('a signed webhook is believed', !throws(() => verifyWebhook(hookEnv, sign('{"a":1}'), '{"a":1}')));
check('a webhook signed with another secret is not', throws(() => verifyWebhook(hookEnv, sign('{"a":1}', { secret: `whsec_${randomBytes(24).toString('base64')}` }), '{"a":1}')));
check('a webhook whose body changed is not', throws(() => verifyWebhook(hookEnv, sign('{"a":1}'), '{"a":2}')));
check('an old webhook is not', throws(() => verifyWebhook(hookEnv, sign('{}', { at: Math.floor(Date.now() / 1000) - 900 }), '{}')));
check('without a secret no webhook is', throws(() => verifyWebhook({}, sign('{}'), '{}')));

const md = markdown('## Hi <b>there</b>\n\nA [link](/guides/x) and [bad](javascript:alert(1)) and **bold**.\n\n- one\n- two', 'https://site.example');
check('Markdown is escaped before it is markup', md.includes('Hi &lt;b&gt;there&lt;/b&gt;') && !md.includes('<b>'));
check('links are made absolute, and only http(s) and mailto are kept', md.includes('href="https://site.example/guides/x"') && !md.includes('javascript:') && md.includes('bad'));
check('lists, bold and headings come through, styled inline', md.includes('<ul style=') && md.includes('<strong>bold</strong>') && md.includes('<h2 style='));
check('the text part keeps a link as words and address', textOf('<p>See <a href="https://x.example/a" style="">the guide</a>.</p>') === 'See the guide (https://x.example/a).');
check('an issue from the build is styled inline', styled('<h2>A</h2><p>b <a href="https://x">c</a></p>').match(/style="/g)?.length === 3);

// --- a stand-in for Resend ----------------------------------------------------------------------

function startResend() {
	const sent = [];
	const keys = new Map();
	const state = { fail: 0, batches: [], singles: 0, rejectedAuth: 0 };
	const server = createServer(async (req, res) => {
		let raw = '';
		for await (const chunk of req) raw += chunk;
		const reply = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
		if (req.headers.authorization !== 'Bearer re_check') { state.rejectedAuth++; return reply(401, { message: 'bad key' }); }
		if (state.fail > 0) { state.fail--; return reply(500, { message: 'a stand-in failure' }); }
		const key = req.headers['idempotency-key'];
		if (key && keys.has(key)) return reply(200, keys.get(key));
		const body = JSON.parse(raw);
		let answer;
		if (req.url === '/emails/batch') {
			if (!Array.isArray(body) || body.length > 100) return reply(422, { message: 'a batch is 1 to 100' });
			state.batches.push({ key, size: body.length });
			for (const m of body) sent.push(m);
			answer = { data: body.map(() => ({ id: randomBytes(8).toString('hex') })) };
		} else if (req.url === '/emails') {
			state.singles++;
			sent.push(body);
			answer = { id: randomBytes(8).toString('hex') };
		} else {
			return reply(404, { message: 'no such route' });
		}
		if (key) keys.set(key, answer);
		reply(200, answer);
	});
	return new Promise((resolve) => server.listen(0, () => resolve({
		base: `http://localhost:${server.address().port}`, sent, state, close: () => new Promise((r) => server.close(r)),
	})));
}

const ISSUES = { issues: [{ slug: '2026-09-what-this-is', issue: 1, title: 'What this is', description: 'The first issue.', url: 'https://www.allaboutnairobi.com/newsletter/2026-09-what-this-is', html: '<h2>What it will carry</h2>\n<p>One email a month, with <a href="https://www.allaboutnairobi.com/guides">the guides</a>.</p>' }] };

async function serve(env) {
	const server = createServer((req, res) => {
		if (req.url.startsWith('/api/newsletter-issues.json')) { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(ISSUES)); }
		return (req.url.startsWith('/api/admin') ? adminHandler : handler)(req, res, env);
	});
	await new Promise((resolve) => server.listen(0, resolve));
	const port = server.address().port;
	const base = `http://localhost:${port}`;
	env.LOSTFOUND_BASE_URL = base;
	const owner = sessionCookie(env).split(';')[0];
	let ip = 0;
	const read = async (res) => ({ status: res.status, body: await res.json().catch(() => ({})), headers: res.headers });
	const news = async (route, body, headers = {}) => read(await fetch(`${base}/api/news?r=${route}`, {
		method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `10.0.0.${++ip % 250}`, ...headers }, body: JSON.stringify(body),
	}));
	return {
		base,
		news,
		get: async (route, query = '') => read(await fetch(`${base}/api/news?r=${route}${query}`)),
		raw: (route, init) => fetch(`${base}/api/news?r=${route}`, { redirect: 'manual', ...init }),
		admin: async (route, params = {}, cookie = owner) => read(await fetch(`${base}/api/admin?r=${route}&${new URLSearchParams(params)}`, { headers: cookie ? { Cookie: cookie } : {} })),
		act: async (body, cookie = owner) => read(await fetch(`${base}/api/admin?r=news`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) })),
		close: () => new Promise((resolve) => server.close(resolve)),
	};
}

const tokenIn = (mail, kind) => new RegExp(`/newsletter/${kind}#t=([A-Za-z0-9_.-]+)`).exec(mail?.html || '')?.[1];
const oneClickIn = (mail) => /<([^>]+)>/.exec(mail?.headers?.['List-Unsubscribe'] || '')?.[1];

async function suite(name, storeEnv) {
	console.log(`\n--- ${name} ---`);
	forgetSettings();
	const resend = await startResend();
	const env = {
		...storeEnv, ...secretEnv, ...hookEnv, LOSTFOUND_SALT: 'check', ADMIN_SESSION_SECRET: 'check-session-secret-that-is-long-enough',
		GOOGLE_CLIENT_ID: 'x', GOOGLE_CLIENT_SECRET: 'y', RESEND_API_KEY: 're_check', RESEND_API_BASE: resend.base,
		NEWSLETTER_FROM: 'All About Accra <newsletter@allaboutnairobi.com>', CRON_SECRET: 'check-cron',
	};
	const store = configuredStore(env);
	const { base, news, get, raw, admin, act, close } = await serve(env);
	const to = (address) => resend.sent.filter((m) => [].concat(m.to).includes(address));
	const row = (address) => store.get('nl_subscribers', subscriberId(address));

	// Sign-ups.
	const first = await news('subscribe', { email: 'Ama@Example.com', source: '/guides/rent-advance' });
	check('a sign-up is answered, and asked to confirm', first.status === 200 && first.body.confirm === true);
	let ama = await row('ama@example.com');
	check('it waits, unconfirmed, with where it came from', ama?.status === 'pending' && ama.source === 'guides/rent-advance' && ama.list_key === `pending|${ama.created_at}|${ama.id}`);
	check('one confirmation went to it, and nothing else', to('ama@example.com').length === 1 && /Confirm/.test(to('ama@example.com')[0].subject) && Boolean(tokenIn(to('ama@example.com')[0], 'confirm')));
	check('the confirmation carries a text part', to('ama@example.com')[0].text.includes('/newsletter/confirm#t='));
	const again = await news('subscribe', { email: 'ama@example.com' });
	check('signing up again within minutes sends nothing more, and says the same', JSON.stringify(again.body) === JSON.stringify(first.body) && to('ama@example.com').length === 1);
	check('a sign-up with the honeypot filled is answered and ignored', (await news('subscribe', { email: 'bot@example.com', website: 'http://spam' })).status === 200 && !(await row('bot@example.com')) && !to('bot@example.com').length);
	check('a non-address is refused', (await news('subscribe', { email: 'not-an-address' })).status === 400);
	check('a sign-up from another site is refused', (await news('subscribe', { email: 'x@example.com' }, { Origin: 'https://evil.example' })).status === 403);
	check('a sign-up that is not JSON or a form is refused', (await raw('subscribe', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'email=a@b.com' })).status === 415);
	const form = await raw('subscribe', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Forwarded-For': '10.1.1.1' }, body: 'email=kofi%40example.com&source=%2Fnewsletter&website=' });
	check('a plain form post is answered with a page to go to', form.status === 303 && form.headers.get('location') === '/newsletter/check');
	check('and it signed up the address', (await row('kofi@example.com'))?.status === 'pending');
	const formAway = await raw('subscribe', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: 'https://evil.example' }, body: 'email=x%40example.com' });
	check('a form post from another site lands on the page with why', formAway.status === 303 && formAway.headers.get('location') === '/newsletter/check?error=origin');
	let limited = null;
	for (let i = 0; i < 7; i++) {
		const r = await news('subscribe', { email: `flood${i}@example.com` }, { 'X-Forwarded-For': '10.9.9.9' });
		if (r.status !== 200) { limited = r; break; }
	}
	check('one connection is held to five sign-ups an hour', limited?.status === 429);

	// Confirming.
	const token = tokenIn(to('ama@example.com')[0], 'confirm');
	const confirmed = await news('confirm', { token });
	ama = await row('ama@example.com');
	check('the button confirms it', confirmed.status === 200 && ama.status === 'subscribed' && ama.list_key.startsWith('subscribed|'));
	check('the answer names the address only masked', confirmed.body.email === 'am***@example.com');
	const welcome = to('ama@example.com')[1];
	check('a welcome follows, with both ways out', welcome && /list/i.test(welcome.subject) && welcome.headers['List-Unsubscribe-Post'] === 'List-Unsubscribe=One-Click' && Boolean(oneClickIn(welcome)) && Boolean(tokenIn(welcome, 'unsubscribe')));
	check('confirming twice is fine, and changes nothing', (await news('confirm', { token })).body.already === true && to('ama@example.com').length === 2);
	check('a tampered confirmation is refused', (await news('confirm', { token: `${token.slice(0, -2)}xx` })).status === 400);
	check('an unsubscribe token cannot confirm', (await news('confirm', { token: tokenIn(welcome, 'unsubscribe') })).status === 400);
	const doc = await store.get('nl_days', isoDay(0));
	check('the day counts the sign-ups and the confirmation, by page', doc.signups >= 2 && doc.confirmed === 1 && doc.sources['guides/rent-advance'] === 1);
	check('the form says the same for an address already on the list', JSON.stringify((await news('subscribe', { email: 'ama@example.com' })).body) === JSON.stringify(first.body) && to('ama@example.com').length === 2);

	// Leaving, and staying gone.
	const unsubToken = tokenIn(welcome, 'unsubscribe');
	const who = await get('who', `&t=${encodeURIComponent(unsubToken)}`);
	check('the unsubscribe page is told who, masked', who.status === 200 && who.body.email === 'am***@example.com' && who.body.status === 'subscribed');
	check('opening the page unsubscribes nobody', (await row('ama@example.com')).status === 'subscribed');
	const left = await news('unsubscribe', { token: unsubToken, reason: 'many' });
	ama = await row('ama@example.com');
	check('the button does, with the reason', left.status === 200 && ama.status === 'unsubscribed' && ama.unsub_reason === 'many' && ama.list_key.startsWith('unsubscribed|'));
	check('the reason is counted for the day', (await store.get('nl_days', isoDay(0))).reasons?.many === 1);
	check('a confirmation link cannot put a left address back', (await news('confirm', { token })).status === 409);
	const adminAdd = await act({ action: 'add', mode: 'subscribed', emails: 'ama@example.com', consent: 'Imported from the old list' });
	check('nor can the admin, nor an import', adminAdd.status === 200 && adminAdd.body.tally.suppressed === 1 && (await row('ama@example.com')).status === 'unsubscribed');
	check('a sign-up after leaving always asks to confirm, and says the same', JSON.stringify((await news('subscribe', { email: 'ama@example.com' })).body) === JSON.stringify(first.body) && (await row('ama@example.com')).status === 'pending' && to('ama@example.com').length === 3);
	await news('confirm', { token: tokenIn(to('ama@example.com')[2], 'confirm') });
	check('and once confirmed, it is back', (await row('ama@example.com')).status === 'subscribed');
	const oneClick = oneClickIn(to('ama@example.com').at(-1));
	const mailApp = await fetch(oneClick, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'List-Unsubscribe=One-Click' });
	check('a mail app\'s own Unsubscribe works in one post, from no page', mailApp.status === 200 && (await row('ama@example.com')).status === 'unsubscribed');
	check('a one-click post without its token does nothing', (await raw('oneclick', { method: 'POST', body: 'List-Unsubscribe=One-Click' })).status === 400);

	// The webhook.
	await act({ action: 'add', mode: 'subscribed', emails: 'bounce@example.com\ncomplain@example.com', consent: 'Signed up at a talk, on paper' });
	const hook = async (event, headers) => {
		const body = JSON.stringify(event);
		return (await raw('webhook', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(headers || sign(body)) }, body })).status;
	};
	check('an unsigned webhook is refused', (await hook({ type: 'email.bounced', data: { to: ['bounce@example.com'] } }, {})) === 401);
	check('a forged one is refused', (await hook({ type: 'email.bounced', data: { to: ['bounce@example.com'] } }, sign('{}'))) === 401);
	check('a soft bounce leaves the address alone', (await hook({ type: 'email.bounced', data: { to: ['bounce@example.com'], bounce: { type: 'Transient' } } })) === 200 && (await row('bounce@example.com')).status === 'subscribed');
	check('a hard bounce takes it off', (await hook({ type: 'email.bounced', data: { to: ['bounce@example.com'], bounce: { type: 'Permanent', message: 'no such user' } } })) === 200 && (await row('bounce@example.com')).status === 'bounced');
	check('a complaint takes it off', (await hook({ type: 'email.complained', data: { to: ['complain@example.com'] } })) === 200 && (await row('complain@example.com')).status === 'complained');
	check('a bounced address is not taken back by the admin', (await act({ action: 'add', mode: 'subscribed', emails: 'bounce@example.com', consent: 'Imported from the old list' })).body.tally.suppressed === 1);

	// The admin: the list.
	check('the admin needs the owner', (await admin('news', {}, '')).status === 401 && (await act({ action: 'add' }, '')).status === 401);
	check('adding needs a note of how they agreed', (await act({ action: 'add', mode: 'subscribed', emails: 'a@example.com', consent: '' })).status === 400);
	const people = Array.from({ length: 34 }, (_, i) => `reader${String(i).padStart(2, '0')}@example.com`);
	const added = await act({ action: 'add', mode: 'subscribed', emails: people.join('\n'), consent: '=Moved from Buttondown', tags: 'buttondown, Old List' });
	check('a list is added at once when they already agreed', added.status === 200 && added.body.tally.subscribed === 34 && (await row('reader07@example.com')).tags.join() === 'buttondown,old-list');
	check('no email goes to an address added that way', !to('reader07@example.com').length);
	const asked = await act({ action: 'add', mode: 'confirm', emails: 'new1@example.com new2@example.com nope@', consent: 'Asked at the October meetup' });
	check('or each is sent a confirmation, and added only on a tap', asked.body.tally.pending === 2 && asked.body.tally.invalid === 1 && to('new1@example.com').length === 1 && (await row('new1@example.com')).status === 'pending');
	const overview = (await admin('news', { days: '7' })).body;
	check('the admin counts each state', overview.counts.subscribed === 34 && overview.counts.pending >= 6 && overview.counts.bounced === 1 && overview.counts.complained === 1 && overview.counts.unsubscribed === 1, JSON.stringify(overview.counts));
	check('and the period, by day and by page', overview.daily.length === 7 && overview.current.confirmed >= 37 && overview.current.added >= 36 && overview.setup.sending === true && overview.setup.webhook === true);
	const page1 = (await admin('news-subscribers', { status: 'subscribed' })).body;
	const page2 = (await admin('news-subscribers', { status: 'subscribed', after: page1.next })).body;
	const all = [...page1.rows, ...page2.rows].map((r) => r.email);
	check('the list pages thirty at a time, newest first, without repeats', page1.rows.length === 30 && page2.rows.length === 4 && !page2.next && new Set(all).size === 34 && page1.rows[0].key > page1.rows[29].key);
	check('a cursor for one state cannot page another', (await admin('news-subscribers', { status: 'bounced', after: page1.next })).body.rows.length === 1);
	check('an exact address finds one person', (await admin('news-subscribers', { email: ' Reader03@Example.com ' })).body.rows[0]?.email === 'reader03@example.com');
	const csv = (await admin('news-export', { status: 'subscribed' })).body;
	check('the list downloads, every one, with formulas defused', csv.count === 34 && csv.csv.split('\n').length === 36 && csv.csv.includes(`"'=Moved from Buttondown"`));

	// The admin: one person.
	const newOne = subscriberId('new1@example.com');
	check('another confirmation can be sent', (await act({ action: 'subscriber', op: 'resend', id: newOne })).status === 200 && to('new1@example.com').length === 2);
	check('marking subscribed needs how they agreed', (await act({ action: 'subscriber', op: 'subscribe', id: newOne, consent: '' })).status === 400);
	const marked = await act({ action: 'subscriber', op: 'subscribe', id: newOne, consent: 'Confirmed by phone, 13 October' });
	check('and then it is', marked.body.subscriber?.status === 'subscribed' && marked.body.subscriber.history.at(-1).what === 'subscribed by the admin');
	check('tags can be changed', (await act({ action: 'subscriber', op: 'tags', id: newOne, tags: 'Accra, ' })).body.subscriber.tags.join() === 'accra');
	check('erasing needs the address typed', (await act({ action: 'subscriber', op: 'delete', id: subscriberId('new2@example.com'), confirm: 'new1@example.com' })).status === 400);
	check('and then it is gone for good', (await act({ action: 'subscriber', op: 'delete', id: subscriberId('new2@example.com'), confirm: 'NEW2@example.com' })).status === 200 && !(await row('new2@example.com')));
	const sub = (await admin('news-subscriber', { id: subscriberId('reader01@example.com') })).body.subscriber;
	check('one person shows how they agreed and what happened', sub.consent === '=Moved from Buttondown' && sub.history.length === 1);

	// Settings.
	await act({ action: 'settings', settings: { doubleOptIn: false, welcome: true, welcomeSubject: 'Akwaaba', welcomeBody: 'Thank you.' } });
	forgetSettings();
	const direct = await news('subscribe', { email: 'direct@example.com' });
	check('with double opt-in off, a new address is on at once, and welcomed', direct.body.confirm === false && (await row('direct@example.com')).status === 'subscribed' && to('direct@example.com')[0]?.subject === 'Akwaaba');
	const backAgain = await news('subscribe', { email: 'ama@example.com' });
	check('but an address that left still has to confirm', (await row('ama@example.com')).status === 'pending' && backAgain.body.confirm === false);
	await act({ action: 'settings', settings: { paused: true, message: 'Back on Monday.', doubleOptIn: true } });
	forgetSettings();
	const paused = await news('subscribe', { email: 'later@example.com' });
	check('paused, sign-ups are refused with the message', paused.status === 503 && paused.body.error === 'Back on Monday.' && !(await row('later@example.com')));
	await act({ action: 'settings', settings: { paused: false, doubleOptIn: true } });
	forgetSettings();

	// An issue.
	const subscribed = (await admin('news')).body.counts.subscribed;
	const before = resend.sent.length;
	const draft = (await act({ action: 'campaign', op: 'create', format: 'markdown', subject: 'What changed in October', preheader: 'Rent, tax and the rains', body: '## Rent\n\nThe [rent guide](/guides/rent-advance) changed.\n\n- one\n- two' })).body;
	check('an issue is written as a draft', draft.campaign?.status === 'draft' && draft.audience === subscribed);
	const cid = draft.campaign.id;
	check('it cannot be sent before a test', (await act({ action: 'campaign', op: 'start', id: cid })).body.code === 'test');
	const preview = (await act({ action: 'campaign', op: 'preview', id: cid })).body.html;
	check('the preview is the email, links absolute', preview.includes(`href="${base}/guides/rent-advance"`) && preview.includes('/newsletter/unsubscribe#t='));
	await act({ action: 'campaign', op: 'test', id: cid });
	const test = to(OWNER_EMAIL).at(-1);
	check('the test goes to the owner alone, marked as one', resend.sent.length === before + 1 && test.subject === '[Test] What changed in October' && test.tags[0].value === 'test');
	check('the text part is there too', test.text.includes('RENT') && test.text.includes('rent guide (http'));
	check('a draft can be edited', (await act({ action: 'campaign', op: 'update', id: cid, format: 'markdown', subject: 'What changed in October', body: '## Rent\n\nThe [rent guide](/guides/rent-advance) changed again.' })).body.campaign.body.includes('again'));
	const started = (await act({ action: 'campaign', op: 'start', id: cid })).body.campaign;
	check('starting fixes the audience', started.status === 'sending' && started.total === subscribed);
	check('a started issue cannot be edited or discarded', (await act({ action: 'campaign', op: 'update', id: cid, subject: 'x', body: 'a long enough body here' })).status === 400 && (await act({ action: 'campaign', op: 'delete', id: cid })).status === 400);
	await act({ action: 'add', mode: 'subscribed', emails: 'latecomer@example.com', consent: 'Joined after it started' });
	resend.state.fail = 1;
	const failed = await act({ action: 'campaign', op: 'step', id: cid });
	check('a batch Resend refuses stops the step, says why, and moves nothing', failed.status === 502 && (await store.get('nl_campaigns', cid)).sent === 0 && /Resend/.test((await store.get('nl_campaigns', cid)).error));
	const [one, two] = await Promise.all([act({ action: 'campaign', op: 'step', id: cid }), act({ action: 'campaign', op: 'step', id: cid })]);
	let state = (await act({ action: 'campaign', op: 'step', id: cid })).body.campaign;
	for (let i = 0; i < 5 && state.status === 'sending'; i++) state = (await act({ action: 'campaign', op: 'step', id: cid })).body.campaign;
	check('two tabs sending at once both carry on', one.status === 200 && two.status === 200);
	check('it finishes, counting each once', state.status === 'sent' && state.sent === subscribed && Boolean(state.finished_at), `${state.sent} of ${subscribed}`);
	const issueMails = resend.sent.filter((m) => m.tags?.[0]?.value === cid);
	const recipients = issueMails.map((m) => m.to);
	check('every subscriber got it once, and nobody else', recipients.length === subscribed && new Set(recipients).size === subscribed && !recipients.includes('latecomer@example.com') && !recipients.includes('bounce@example.com') && !recipients.includes('ama@example.com') && !recipients.includes(OWNER_EMAIL));
	check('in batches of at most a hundred, each sent once', resend.state.batches.every((b) => b.size <= 100) && new Set(resend.state.batches.map((b) => b.key)).size === resend.state.batches.length);
	const readerMail = issueMails.find((m) => m.to === 'reader05@example.com');
	check('each carries its reader\'s own way out', readToken(env, tokenIn(readerMail, 'unsubscribe'), 'unsub') === subscriberId('reader05@example.com') && readToken(env, new URL(oneClickIn(readerMail)).searchParams.get('t'), 'unsub') === subscriberId('reader05@example.com'));
	check('and no tracking: no pixel, every link straight to the site', !/<img/i.test(readerMail.html) && [...readerMail.html.matchAll(/href="([^"]+)"/g)].every((m) => m[1].startsWith(base)) && readerMail.html.includes(`href="${base}/guides/rent-advance"`));
	await hook({ type: 'email.delivered', data: { to: ['reader05@example.com'], tags: { campaign: cid } } });
	await hook({ type: 'email.delivered', data: { to: ['reader06@example.com'], tags: [{ name: 'campaign', value: cid }] } });
	await hook({ type: 'email.delivered', data: { to: [OWNER_EMAIL], tags: { campaign: 'test' } } });
	check('deliveries are counted against the issue', (await admin('news-campaign', { id: cid })).body.campaign.delivered === 2);

	// An issue from the archive, to a tag, stopped and carried on.
	const fromArchive = (await act({ action: 'campaign', op: 'create', format: 'issue', issue: '2026-09-what-this-is', subject: 'What this is', audience: 'buttondown' })).body;
	check('a published issue can be sent, to a tag', fromArchive.campaign?.format === 'issue' && fromArchive.audience === 34 && fromArchive.campaign.html.includes('What it will carry'));
	check('an issue that is not published cannot', (await act({ action: 'campaign', op: 'create', format: 'issue', issue: 'nope', subject: 'x' })).status === 400);
	const aid = fromArchive.campaign.id;
	await act({ action: 'campaign', op: 'test', id: aid });
	await act({ action: 'campaign', op: 'start', id: aid });
	check('a sending issue can be stopped', (await act({ action: 'campaign', op: 'stop', id: aid })).body.campaign.status === 'stopped');
	check('a stopped one sends nothing', (await act({ action: 'campaign', op: 'step', id: aid })).body.campaign.sent === 0);
	await act({ action: 'campaign', op: 'resume', id: aid });
	let archive = (await act({ action: 'campaign', op: 'step', id: aid })).body.campaign;
	for (let i = 0; i < 5 && archive.status === 'sending'; i++) archive = (await act({ action: 'campaign', op: 'step', id: aid })).body.campaign;
	const archiveMails = resend.sent.filter((m) => m.tags?.[0]?.value === aid);
	check('carried on, it goes to the tag alone', archive.status === 'sent' && archiveMails.length === 34 && archiveMails.every((m) => /^reader\d+@/.test(m.to)));
	check('styled, with a link to read it on the site', archiveMails[0].html.includes('<h2 style=') && archiveMails[0].html.includes('Read this issue on the site'));

	// The daily job.
	const stale = await row('kofi@example.com');
	const longAgo = new Date(Date.now() - 40 * 86400000).toISOString();
	await store.write([{ table: 'nl_subscribers', id: stale.id, set: keyed({ ...stale, created_at: longAgo, confirm_sent_at: longAgo }), expect: stale._version }]);
	check('the daily job needs its secret', (await get('purge')).status === 401);
	const purged = await fetch(`${base}/api/news?r=purge`, { headers: { Authorization: 'Bearer check-cron' } }).then((r) => r.json());
	check('an address never confirmed in thirty days is deleted', purged.unconfirmed === 1 && !(await row('kofi@example.com')) && (await row('new1@example.com')));

	// Every row's key follows its state, and nothing public says an address.
	const rows = await store.select('nl_subscribers', {});
	check('every row\'s paging key matches its state', rows.every((r) => r.list_key === `${r.status}|${r.created_at}|${r.id}`));
	check('no email went out unsigned by the sender set', resend.state.rejectedAuth === 0 && resend.sent.every((m) => m.from === env.NEWSLETTER_FROM));

	await close();
	await resend.close();
}

const file = path.join(os.tmpdir(), `newsletter-check-${process.pid}-${Date.now()}.json`);
await suite('a JSON file', { LOSTFOUND_FILE: file });
const fake = await startFakeFirestore();
await suite('the stand-in Firestore', { FIRESTORE_EMULATOR_HOST: fake.host, FIRESTORE_PROJECT: 'check' });
check('no query needed an index nobody declared', fake.stats.refused === 0);
await fake.close();

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
