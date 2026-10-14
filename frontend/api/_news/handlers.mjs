// The newsletter's list: who is on it, how they got there, and how they leave.
//
// The list lives in the site's own database (nl_subscribers), one document per
// address, keyed by a hash of the address so it can be found without a query.
// Every address passes through one of five states:
//
//   pending       asked for, not yet confirmed. Nothing but the confirmation
//                 is ever sent to it.
//   subscribed    confirmed - the only state an issue goes to.
//   unsubscribed  left. Kept, so an import cannot quietly put it back.
//   bounced       the address does not exist (Resend said so). Suppressed.
//   complained    marked an issue as spam. Suppressed.
//
// A suppressed address comes back only when its owner subscribes again
// through the form and confirms - always with a confirmation, even when double
// opt-in is switched off - and never by the admin's hand or an import.
//
// Double opt-in by default: a subscription is an address someone typed, and
// anyone can type anyone's address, so it counts only once its owner taps the
// link in the confirmation email. Every reply to a sign-up is the same,
// whether the address was new, waiting, already on the list or suppressed, so
// the form cannot be used to find out who subscribes.
//
// Links in emails carry signed tokens - which address, what for, and for a
// confirmation, until when - so nothing about them is stored. They open pages
// (/newsletter/confirm, /newsletter/unsubscribe) that act only when the reader
// presses a button: link scanners in company inboxes follow every URL, and must
// not confirm or unsubscribe anyone. A mail app's own "Unsubscribe" posts to
// `oneclick` (RFC 8058) and needs no page.
//
// Each change is also counted in the day's document (nl_days), so the admin's
// charts cost a read a day, not a read a subscriber.
//
// Every row carries `list_key` - its status, when it joined and its id, in one
// string - and is paged on that alone: "subscribed, newest first, after this
// one" is a range on one field, which Firestore serves from the index it keeps
// on every field anyway. No composite index, and sending to a long list never
// re-reads the people already sent to. Anything that changes a row's status
// goes through keyed() so the key follows.

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { HttpError } from '../_lostfound/http.mjs';
import { settingsOf } from '../_lostfound/handlers.mjs';
import { confirmationEmail, sendOne, sendingReady, unsubscribeHeaders, welcomeEmail } from './mail.mjs';

export const STATUSES = ['subscribed', 'pending', 'unsubscribed', 'bounced', 'complained'];
export const SUPPRESSED = new Set(['unsubscribed', 'bounced', 'complained']);
export const REASONS = { many: 'Too many emails', relevant: 'Not what I expected', never: 'I never signed up', other: 'Something else' };
export const limits = { subscribesPerHour: 5, confirmDays: 7, resendMinutes: 10, historyKept: 25, unconfirmedDays: 30 };
const WELCOME = {
	subject: 'You are on the list',
	body: "Thank you for confirming. Once a month you will get what changed at the offices, what a thing costs now, and which guides were rewritten because the rules moved.\n\nEvery past issue is on the site, at [the newsletter archive](/newsletter).",
};

const fail = (message, code = 'invalid') => { throw new HttpError(400, message, code); };
export const isoDay = (offset = 0) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
const nowIso = () => new Date().toISOString();

// --- addresses ----------------------------------------------------------------------------

/** An address as the list keeps it, or null if it is not one. */
export function cleanEmail(value) {
	const email = String(value ?? '').trim().toLowerCase();
	if (email.length > 254 || !/^[^\s@<>()[\]\\,;:"]{1,64}@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(email)) return null;
	if (!/\.[a-z]{2,}$/.test(email)) return null;
	return email;
}

export const subscriberId = (email) => createHash('sha256').update(email).digest('hex').slice(0, 32);

/** "kw***@gmail.com": enough for someone to recognise their own address. */
export const maskEmail = (email) => String(email || '').replace(/^(.{1,2})[^@]*@/, (whole, start) => `${start}***@`);

/**
 * Where a sign-up came from: the page's path without its outer slashes, as a
 * counter's name - "guides/rent-advance". Never a dot, which would nest the
 * counter; anything that is not a plain path here is "other".
 */
export function sourceOf(value) {
	const path = String(value ?? '');
	if (!/^\/[a-z0-9/-]{0,80}$/.test(path)) return 'other';
	return path.replace(/\/{2,}/g, '/').replace(/^\/+|\/+$/g, '') || 'home';
}

// --- tokens ------------------------------------------------------------------------------------
//
// NEWSLETTER_SECRET signs them, or the admin's session secret when it is unset,
// labelled so a token can never stand in for a session. Changing it breaks the
// unsubscribe link in every issue already sent - the one-click header too - so
// it should be set once and left.

function secretOf(env) {
	const secret = env.NEWSLETTER_SECRET || env.ADMIN_SESSION_SECRET;
	if (!secret) throw new HttpError(503, 'The newsletter is not set up yet.', 'not-configured');
	return secret;
}
const mac = (env, payload) => createHmac('sha256', secretOf(env)).update(`newsletter|${payload}`).digest();

export function signToken(env, purpose, id, days = null) {
	const payload = Buffer.from(JSON.stringify({ p: purpose, s: id, ...(days ? { e: Date.now() + days * 86400000 } : {}) })).toString('base64url');
	return `${payload}.${mac(env, payload).toString('base64url')}`;
}

export function readToken(env, token, purpose) {
	const [payload, signature, extra] = String(token ?? '').split('.');
	const bad = (message = 'That link is not one of ours, or it was cut short. Copy the whole link from the email.') => { throw new HttpError(400, message, 'token'); };
	if (!payload || !signature || extra !== undefined) bad();
	const expected = mac(env, payload);
	const given = Buffer.from(signature, 'base64url');
	if (given.length !== expected.length || !timingSafeEqual(given, expected)) bad();
	let data;
	try { data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch { bad(); }
	if (data.p !== purpose || !/^[0-9a-f]{32}$/.test(data.s || '')) bad();
	if (data.e && data.e < Date.now()) bad('That confirmation link has run out - they last a week. Subscribe again and a fresh one comes at once.');
	return data.s;
}

export const confirmLink = (env, base, id) => `${base}/newsletter/confirm#t=${signToken(env, 'confirm', id, limits.confirmDays)}`;
export const unsubscribeLink = (env, base, id) => `${base}/newsletter/unsubscribe#t=${signToken(env, 'unsub', id)}`;
export const oneClickLink = (env, base, id) => `${base}/api/news?r=oneclick&t=${signToken(env, 'unsub', id)}`;

// --- the list ------------------------------------------------------------------------------------

export async function newsSettings(store) {
	const s = (await settingsOf(store)).newsletter || {};
	return {
		paused: Boolean(s.paused),
		message: s.message || '',
		doubleOptIn: s.doubleOptIn !== false,
		welcome: s.welcome !== false,
		welcomeSubject: s.welcomeSubject || WELCOME.subject,
		welcomeBody: s.welcomeBody || WELCOME.body,
	};
}

/** One line in a subscriber's history, newest last, the oldest let go. */
export const withHistory = (row, what, note = '') => [...(row?.history || []), { at: nowIso(), what, ...(note ? { note: String(note).slice(0, 200) } : {}) }].slice(-limits.historyKept);

/** Counters for today, in the same breath as the change they count. */
export const countToday = (add) => ({ table: 'nl_days', id: isoDay(0), add, merge: { day: isoDay(0), updated_at: nowIso() } });

/** The row with its paging key brought up to date: status|created_at|id. */
export const keyed = (row) => ({ ...row, list_key: `${row.status}|${row.created_at}|${row.id}` });

/** The filters and order for one status, newest first, after a row's key. */
export const pageOf = (status, after = null) => ({
	filters: [['list_key', 'gt', `${status}|`], ['list_key', 'lt', after || `${status}|~`]],
	order: ['list_key', 'desc'],
});

export async function sendConfirmation(store, env, base, row) {
	const mail = confirmationEmail({ origin: base, confirm: confirmLink(env, base, row.id) });
	await sendOne(env, { to: row.email, ...mail, tags: [{ name: 'kind', value: 'confirm' }] });
	await store.update('nl_subscribers', [['id', 'eq', row.id]], { confirm_sent_at: nowIso(), updated_at: nowIso(), history: withHistory(row, 'confirmation sent') });
}

export async function sendWelcome(store, env, base, row, settings) {
	if (!settings.welcome) return;
	const mail = welcomeEmail({ origin: base, unsubscribe: unsubscribeLink(env, base, row.id), subject: settings.welcomeSubject, body: settings.welcomeBody });
	try {
		await sendOne(env, { to: row.email, ...mail, headers: unsubscribeHeaders(oneClickLink(env, base, row.id)), tags: [{ name: 'kind', value: 'welcome' }] });
	} catch (error) {
		// A welcome that fails must not undo a confirmation that worked.
		console.warn('newsletter: welcome failed', error.message);
	}
}

/**
 * Puts an address on the list, or moves it along. `mode` is how it got here:
 * 'form' (a reader, double opt-in unless switched off), 'confirm' (the admin,
 * sending a confirmation) or 'subscribed' (the admin, saying the person already
 * agreed - the consent note says how). Returns what happened, for the admin.
 */
export async function upsert(store, env, base, { email, source = 'other', consent = '', mode = 'form', tags = [] }, settings) {
	const id = subscriberId(email);
	const row = await store.get('nl_subscribers', id);
	const now = nowIso();
	if (row && row.status === 'subscribed') return 'existing';
	const suppressed = Boolean(row && SUPPRESSED.has(row.status));
	if (suppressed && mode !== 'form') return 'suppressed';
	const confirmNow = mode === 'subscribed' || (mode === 'form' && !settings.doubleOptIn && !suppressed);
	if (row && row.status === 'pending') {
		if (confirmNow) {
			await store.write([
				{ table: 'nl_subscribers', id, set: keyed({ ...row, status: 'subscribed', confirmed_at: now, updated_at: now, consent: consent || row.consent, history: withHistory(row, 'subscribed', consent) }), expect: row._version },
				countToday({ confirmed: 1, [`sources.${row.source || 'other'}`]: 1, ...(mode !== 'form' ? { added: 1 } : {}) }),
			]);
			return 'confirmed';
		}
		const last = row.confirm_sent_at ? Date.parse(row.confirm_sent_at) : 0;
		if (Date.now() - last < limits.resendMinutes * 60000) return 'waiting';
		await sendConfirmation(store, env, base, row);
		return 'resent';
	}
	const fresh = keyed({
		id,
		email,
		status: confirmNow ? 'subscribed' : 'pending',
		source,
		tags: [...new Set(tags)].slice(0, 10),
		consent: String(consent || '').slice(0, 300),
		created_at: row?.created_at || now,
		updated_at: now,
		confirmed_at: confirmNow ? now : null,
		unsubscribed_at: null,
		unsub_reason: null,
		confirm_sent_at: null,
		history: withHistory(row, confirmNow ? 'subscribed' : 'signed up', consent || (row ? 'came back' : '')),
	});
	await store.write([
		{ table: 'nl_subscribers', id, set: fresh, ...(row ? { expect: row._version } : { expect: 'missing' }) },
		// `signups` is the form's, and the admin's sending confirmations; `added`
		// is the admin's straight onto the list, so the share of sign-ups that
		// go on to confirm is (confirmed - added) / signups.
		countToday(confirmNow ? { confirmed: 1, [`sources.${source}`]: 1, ...(mode === 'form' ? { signups: 1 } : { added: 1 }) } : { signups: 1 }),
	]);
	if (!confirmNow) await sendConfirmation(store, env, base, fresh);
	return confirmNow ? 'subscribed' : 'pending';
}

/** Takes an address off the list, keeping the record so it stays off. */
export async function leave(store, row, { status = 'unsubscribed', reason = null, note = '' } = {}) {
	if (!row || row.status === status || (status === 'unsubscribed' && SUPPRESSED.has(row.status))) return false;
	const now = nowIso();
	await store.write([
		{ table: 'nl_subscribers', id: row.id, set: keyed({ ...row, status, unsubscribed_at: now, unsub_reason: reason, updated_at: now, history: withHistory(row, status, note || (reason ? REASONS[reason] : '')) }) },
		countToday({ [status]: 1, ...(reason ? { [`reasons.${reason}`]: 1 } : {}) }),
	]);
	return true;
}

// --- abuse ---------------------------------------------------------------------------------------
//
// Sign-ups per connection per hour, counted the way lost and found counts its
// actions: lf_events, against a daily-salted hash of the connection. A sign-up
// sends an email to whatever address was typed, so this is what stops the
// form being used to bury somebody's inbox.

async function hourly(store, ip, action, perHour) {
	const since = new Date(Date.now() - 3600000).toISOString();
	const used = await store.count('lf_events', [['ip_hash', 'eq', ip], ['action', 'eq', action], ['created_at', 'gte', since]]);
	if (used >= perHour) throw new HttpError(429, 'A lot of sign-ups have come from your connection this hour. Try again a little later.', 'rate');
	await store.insert('lf_events', { action, ip_hash: ip });
}

// --- the webhook ---------------------------------------------------------------------------------
//
// Resend posts what happened to each email, signed the Svix way: an HMAC of
// "id.timestamp.body" with the endpoint's secret (RESEND_WEBHOOK_SECRET,
// "whsec_..."). Without the secret no event is believed.

export function verifyWebhook(env, headers, raw) {
	const secret = String(env.RESEND_WEBHOOK_SECRET || '');
	if (!secret) throw new HttpError(503, 'No webhook secret is set.', 'not-configured');
	const id = headers['svix-id'];
	const timestamp = headers['svix-timestamp'];
	const signatures = String(headers['svix-signature'] || '');
	if (!id || !timestamp || !signatures) throw new HttpError(401, 'Unsigned.', 'signature');
	if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) throw new HttpError(401, 'Too old.', 'signature');
	const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
	const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${raw}`).digest();
	const ok = signatures.split(' ').some((part) => {
		const [version, value] = part.split(',');
		if (version !== 'v1' || !value) return false;
		const given = Buffer.from(value, 'base64');
		return given.length === expected.length && timingSafeEqual(given, expected);
	});
	if (!ok) throw new HttpError(401, 'Bad signature.', 'signature');
}

const tagOf = (data, name) => {
	const tags = data?.tags;
	if (Array.isArray(tags)) return tags.find((t) => t.name === name)?.value;
	return tags?.[name];
};

// --- the routes ----------------------------------------------------------------------------------

export const routes = {
	// A sign-up from the site's form: JSON from the script, or a plain form post
	// when there is none. The answer is the same whatever the address's state.
	async subscribe({ store, env, base, body, ip }) {
		const settings = await newsSettings(store);
		const sameAnswer = { ok: true, confirm: settings.doubleOptIn, message: settings.doubleOptIn ? 'Almost there: check your inbox for a link to confirm. It can take a minute, and sometimes lands in spam.' : 'You are on the list. The next issue comes to your inbox.' };
		if (body.website) return sameAnswer; // the honeypot: a bot gets the answer, and nothing happens
		if (settings.paused) throw new HttpError(503, settings.message || 'Sign-ups are paused for a short while. Try again later.', 'paused');
		if (!sendingReady(env)) throw new HttpError(503, 'The newsletter is not taking sign-ups yet.', 'not-configured');
		const email = cleanEmail(body.email) || fail('That does not look like an email address.', 'email');
		await hourly(store, ip, 'news-subscribe', limits.subscribesPerHour);
		const outcome = await upsert(store, env, base, { email, source: sourceOf(body.source), consent: `Signed up on ${body.source || 'the site'}` }, settings);
		if (outcome === 'subscribed') await sendWelcome(store, env, base, await store.get('nl_subscribers', subscriberId(email)), settings);
		return sameAnswer;
	},

	async confirm({ store, env, base, body }) {
		const id = readToken(env, body.token, 'confirm');
		const row = await store.get('nl_subscribers', id);
		if (!row) throw new HttpError(404, 'That address is no longer on the list. Subscribe again from any page.', 'missing');
		if (row.status === 'subscribed') return { ok: true, already: true, email: maskEmail(row.email) };
		if (row.status !== 'pending') throw new HttpError(409, 'That subscription has ended. Subscribe again, and a fresh confirmation comes at once.', 'ended');
		const now = nowIso();
		const confirmed = keyed({ ...row, status: 'subscribed', confirmed_at: now, updated_at: now, history: withHistory(row, 'confirmed') });
		await store.write([
			{ table: 'nl_subscribers', id, set: confirmed, expect: row._version },
			countToday({ confirmed: 1, [`sources.${row.source || 'other'}`]: 1 }),
		]);
		await sendWelcome(store, env, base, confirmed, await newsSettings(store));
		return { ok: true, email: maskEmail(row.email) };
	},

	// What the unsubscribe page shows before the reader presses the button.
	async who({ store, env, query }) {
		const id = readToken(env, query.t, 'unsub');
		const row = await store.get('nl_subscribers', id);
		return { email: row ? maskEmail(row.email) : null, status: row ? (row.status === 'pending' ? 'subscribed' : row.status) : 'gone' };
	},

	async unsubscribe({ store, env, body }) {
		const id = readToken(env, body.token, 'unsub');
		const row = await store.get('nl_subscribers', id);
		if (!row) return { ok: true, email: null };
		const reason = Object.hasOwn(REASONS, body.reason) ? body.reason : null;
		await leave(store, row, { reason, note: reason ? '' : 'from the unsubscribe page' });
		return { ok: true, email: maskEmail(row.email) };
	},

	// A mail app's own "Unsubscribe" button (List-Unsubscribe-Post): a form post
	// with the token in the address, from no page at all.
	async oneclick({ store, env, query }) {
		const id = readToken(env, query.t, 'unsub');
		const row = await store.get('nl_subscribers', id);
		if (row) await leave(store, row, { note: 'one click, from the mail app' });
		return { ok: true };
	},

	// Resend's report of each email: bounces and complaints come off the list,
	// and an issue counts its deliveries.
	async webhook({ store, env, headers, raw }) {
		verifyWebhook(env, headers, raw);
		const event = JSON.parse(raw || '{}');
		const data = event.data || {};
		const to = [].concat(data.to || [])[0];
		const email = cleanEmail(to);
		const row = email ? await store.get('nl_subscribers', subscriberId(email)) : null;
		const tag = tagOf(data, 'campaign');
		// An issue's reports land on one of ten shards of its own (see
		// _news/admin.mjs); a test, or anything else, is not counted.
		const campaign = /^[0-9a-f]{12}$/.test(tag || '') ? tag : null;
		const report = (what) => ({ table: 'nl_campaign_counts', id: `${campaign}-${Math.floor(Math.random() * 10)}`, add: { [what]: 1 }, merge: { campaign, updated_at: nowIso() } });
		if (event.type === 'email.bounced') {
			const permanent = !/transient|temporary|soft/i.test(String(data.bounce?.type || data.bounce?.subType || 'Permanent'));
			if (permanent && row) await leave(store, row, { status: 'bounced', note: data.bounce?.message || 'the address does not exist' });
			if (campaign) await store.write([report('bounced')]);
		} else if (event.type === 'email.complained') {
			if (row) await leave(store, row, { status: 'complained', note: 'marked an email as spam' });
			if (campaign) await store.write([report('complained')]);
		} else if (event.type === 'email.delivered' && campaign) {
			await store.write([report('delivered')]);
		}
		return { ok: true };
	},

	// Vercel Cron, daily. An address nobody confirmed is somebody's address that
	// its owner never agreed to give: thirty days after the last confirmation
	// was sent, it is deleted, not kept.
	async purge({ store, env, authorization }) {
		if (!env.CRON_SECRET || authorization !== `Bearer ${env.CRON_SECRET}`) throw new HttpError(401, 'Not for you.', 'auth');
		const cutoff = new Date(Date.now() - limits.unconfirmedDays * 86400000).toISOString();
		const old = await store.select('nl_subscribers', { filters: [['list_key', 'gt', 'pending|'], ['list_key', 'lt', `pending|${cutoff}`]], order: ['list_key', 'asc'], limit: 400 });
		const gone = old.filter((r) => (r.confirm_sent_at || r.updated_at || r.created_at) < cutoff);
		for (const r of gone) await store.write([{ table: 'nl_subscribers', id: r.id, remove: true }]);
		return { ok: true, unconfirmed: gone.length };
	},
};
