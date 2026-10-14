// The newsletter, for the admin: the list, adding to it, issues and sending.
// Merged into ../_admin/routes.mjs, so every route here runs only after
// requireOwner() has said yes.
//
// The list is the owner's, so the admin sees each address in full - it is how
// a subscriber is found, helped or erased. /terms#newsletter says the owner
// holds it and nobody else does.
//
// Sending an issue is resumable. "Start" fixes how many it is going to; each
// "step" sends the next hundred through Resend's batch endpoint, newest
// subscriber first, and moves a cursor (the last `list_key` sent) on only once
// Resend has taken them - with an idempotency key, so a step retried after a
// timeout sends nobody twice. The admin's page calls step until it is done; a
// tab closed halfway leaves the issue "sending", and opening it carries on
// from the cursor. Someone who joins after an issue started is newer than
// where the cursor began, so it is not sent to them; someone who leaves
// halfway is no longer in the range, so it is not sent to them either.

import { randomBytes } from 'node:crypto';
import { HttpError } from '../_lostfound/http.mjs';
import { forgetSettings } from '../_lostfound/handlers.mjs';
import { OWNER_EMAIL } from '../_admin/owner.mjs';
import { rangeOf } from '../_admin/analytics.mjs';
import { sum } from '../_shared/counters.mjs';
import { campaignEmail, fromOf, sendBatch, sendOne, sendingReady, unsubscribeHeaders } from './mail.mjs';
import {
	REASONS, STATUSES, cleanEmail, countToday, isoDay, keyed, leave, newsSettings, oneClickLink, pageOf, sendConfirmation,
	subscriberId, unsubscribeLink, upsert, withHistory,
} from './handlers.mjs';

const fail = (message, code = 'invalid') => { throw new HttpError(400, message, code); };
const nowIso = () => new Date().toISOString();
const log = (store, action, target, note = '') => store.insert('lf_admin_log', { action, target, note: String(note).slice(0, 300), by: OWNER_EMAIL });
const PAGE = 30;
const BATCH = 100;
const STEP_MS = 6000;
// Resend takes two requests a second on a new account; a batch every 600ms
// stays under it with room for the database writes between.
const GAP_MS = 600;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const subscriberView = (r) => ({
	id: r.id, email: r.email, status: r.status, source: r.source || 'other', tags: r.tags || [],
	created_at: r.created_at, confirmed_at: r.confirmed_at || null, unsubscribed_at: r.unsubscribed_at || null,
	unsub_reason: r.unsub_reason ? REASONS[r.unsub_reason] || r.unsub_reason : null, key: r.list_key,
});

const campaignView = (c, { full = false } = {}) => ({
	id: c.id, subject: c.subject, preheader: c.preheader || '', status: c.status, format: c.format, issue: c.issue || null,
	audience: c.audience || 'all', created_at: c.created_at, updated_at: c.updated_at, started_at: c.started_at || null,
	finished_at: c.finished_at || null, test_sent_at: c.test_sent_at || null, total: c.total || 0, sent: c.sent || 0,
	failed: c.failed || 0, delivered: c.reports?.delivered || 0, bounced: c.reports?.bounced || 0, complained: c.reports?.complained || 0,
	error: c.error || null, url: c.url || null,
	...(full ? { body: c.body || '', html: c.format === 'issue' ? c.html || '' : null } : {}),
});

// Tags are separated by commas; "Old list" is one tag, old-list.
const cleanTags = (value) => [...new Set((Array.isArray(value) ? value : String(value || '').split(/[,;\n]+/))
	.map((t) => String(t).trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 24)).filter(Boolean))].slice(0, 10);

/** Addresses out of whatever was pasted: one a line, a CSV, or a list with commas. */
export function addressesIn(text) {
	const found = [];
	const invalid = [];
	for (const piece of String(text || '').split(/[\n\r,;\t ]+/)) {
		const raw = piece.trim().replace(/^["'<]+|["'>]+$/g, '');
		if (!raw || !raw.includes('@')) continue;
		const email = cleanEmail(raw);
		if (email) found.push(email);
		else invalid.push(raw.slice(0, 80));
	}
	return { emails: [...new Set(found)], invalid };
}

/**
 * What Resend's webhook reported for each issue: delivered, bounced, marked as
 * spam. Kept in ten shards per issue, apart from the issue itself, so a burst
 * of reports neither queues on one document nor collides with the sender
 * moving the issue's cursor.
 */
async function reportsFor(store, ids) {
	const out = Object.fromEntries(ids.map((id) => [id, { delivered: 0, bounced: 0, complained: 0 }]));
	if (!ids.length) return out;
	for (const row of await store.select('nl_campaign_counts', { filters: [['campaign', 'in', ids]] })) {
		for (const key of ['delivered', 'bounced', 'complained']) out[row.campaign][key] += row[key] || 0;
	}
	return out;
}

async function campaignById(store, id) {
	const c = await store.get('nl_campaigns', String(id || ''));
	if (!c) throw new HttpError(404, 'No such issue.', 'missing');
	return c;
}

/** A published issue, as the build wrote it for email (api/newsletter-issues.json). */
async function issueFrom(base, slug) {
	let issues;
	try {
		const response = await fetch(`${base}/api/newsletter-issues.json`);
		issues = (await response.json()).issues || [];
	} catch {
		fail('The published issues could not be read. Try again in a minute.', 'issues');
	}
	return issues.find((i) => i.slug === slug) || fail('No published issue by that name.', 'issue');
}

/** Everyone in one state, a page at a time, without holding more than a page. */
async function* everyone(store, status, size = 500) {
	let after = null;
	for (;;) {
		const rows = await store.select('nl_subscribers', { ...pageOf(status, after), limit: size });
		yield* rows;
		if (rows.length < size) return;
		after = rows[rows.length - 1].list_key;
	}
}

async function audienceCount(store, audience) {
	if (!audience || audience === 'all') return store.count('nl_subscribers', [['status', 'eq', 'subscribed']]);
	let n = 0;
	for await (const r of everyone(store, 'subscribed')) if ((r.tags || []).includes(audience)) n++;
	return n;
}

/** The next page of the issue's audience, newest first, after the cursor. */
const nextRecipients = (store, cursor, limit) => store.select('nl_subscribers', { ...pageOf('subscribed', cursor), limit });

function messageFor(env, base, campaign, row, { test = false } = {}) {
	const unsubscribe = unsubscribeLink(env, base, row.id);
	const mail = campaignEmail({ origin: base, unsubscribe, campaign });
	return {
		to: row.email,
		subject: test ? `[Test] ${mail.subject}` : mail.subject,
		html: mail.html,
		text: mail.text,
		headers: unsubscribeHeaders(oneClickLink(env, base, row.id)),
		tags: [{ name: 'campaign', value: test ? 'test' : campaign.id }],
	};
}

/**
 * Moves an issue's cursor on from `from`, counting `n` more sent. False if
 * somebody else moved it first - a second tab sending the same issue - in
 * which case that batch went once (Resend's idempotency key saw to it) and is
 * not counted twice. A change that is not the cursor's, such as Stop, is kept.
 */
async function advance(store, id, from, cursor, n) {
	for (let attempt = 0; attempt < 5; attempt++) {
		const now = await store.get('nl_campaigns', id);
		if (!now || (now.cursor || null) !== (from || null)) return false;
		try {
			await store.write([
				{ table: 'nl_campaigns', id, set: { ...now, cursor, sent: (now.sent || 0) + n, updated_at: nowIso(), error: null }, expect: now._version },
				...(n ? [countToday({ sent: n })] : []),
			]);
			return true;
		} catch (error) {
			if (!error.conflict) throw error;
		}
	}
	return false;
}

/** Sends batches for up to STEP_MS, re-reading the issue before each one. */
async function step(store, env, base, id) {
	const started = Date.now();
	let last = 0;
	while (Date.now() - started < STEP_MS) {
		const c = await store.get('nl_campaigns', id);
		if (!c || c.status !== 'sending') return;
		const rows = await nextRecipients(store, c.cursor, BATCH);
		if (!rows.length) {
			try {
				await store.write([{ table: 'nl_campaigns', id, set: { ...c, status: 'sent', finished_at: nowIso(), updated_at: nowIso(), error: null }, expect: c._version }]);
				await log(store, 'news.sent', id, `${c.subject} - ${c.sent || 0} sent`);
			} catch (error) {
				if (!error.conflict) throw error;
			}
			return;
		}
		const audience = c.audience && c.audience !== 'all' ? rows.filter((r) => (r.tags || []).includes(c.audience)) : rows;
		const cursor = rows[rows.length - 1].list_key;
		try {
			if (audience.length) {
				const wait = last + GAP_MS - Date.now();
				if (wait > 0) await sleep(wait);
				last = Date.now();
				await sendBatch(env, audience.map((r) => messageFor(env, base, c, r)), `${id}-${cursor}`.slice(0, 250));
			}
		} catch (error) {
			await store.update('nl_campaigns', [['id', 'eq', id]], { error: error.message, updated_at: nowIso() });
			throw error;
		}
		if (!(await advance(store, id, c.cursor, cursor, audience.length))) return;
	}
}

export const newsRoutes = {
	async newsList({ store, env, query }) {
		const days = rangeOf(query.days);
		const counts = Object.fromEntries(await Promise.all(STATUSES.map(async (s) => [s, await store.count('nl_subscribers', [['status', 'eq', s]])])));
		const rows = await store.select('nl_days', { order: ['day', 'asc'] });
		const from = isoDay(-(days - 1));
		const before = isoDay(-(2 * days - 1));
		const byDay = new Map(rows.map((r) => [r.day, r]));
		const daily = [];
		for (let i = days - 1; i >= 0; i--) {
			const date = isoDay(-i);
			const r = byDay.get(date) || {};
			daily.push({ date, confirmed: r.confirmed || 0, unsubscribed: (r.unsubscribed || 0) + (r.bounced || 0) + (r.complained || 0), signups: r.signups || 0, sent: r.sent || 0 });
		}
		const campaigns = await store.select('nl_campaigns', { order: ['created_at', 'desc'], limit: 40 });
		const reports = await reportsFor(store, campaigns.map((c) => c.id));
		return {
			days,
			counts,
			current: sum(rows.filter((r) => r.day >= from)),
			previous: sum(rows.filter((r) => r.day >= before && r.day < from)),
			daily,
			campaigns: campaigns.map((c) => campaignView({ ...c, reports: reports[c.id] })),
			settings: await newsSettings(store),
			setup: {
				sending: sendingReady(env),
				from: fromOf(env) || null,
				webhook: Boolean(env.RESEND_WEBHOOK_SECRET),
				secret: Boolean(env.NEWSLETTER_SECRET),
				live: env.NEWSLETTER_LIVE === '1',
				owner: OWNER_EMAIL,
			},
			reasons: REASONS,
		};
	},

	async newsSubscribers({ store, query }) {
		if (query.email) {
			const email = cleanEmail(query.email);
			const row = email ? await store.get('nl_subscribers', subscriberId(email)) : null;
			return { rows: row ? [subscriberView(row)] : [], next: null, searched: true };
		}
		const status = STATUSES.includes(query.status) ? query.status : 'subscribed';
		const after = query.after && String(query.after).startsWith(`${status}|`) ? String(query.after) : null;
		const rows = await store.select('nl_subscribers', { ...pageOf(status, after), limit: PAGE });
		return { rows: rows.map(subscriberView), next: rows.length === PAGE ? rows[rows.length - 1].list_key : null };
	},

	async newsSubscriber({ store, query }) {
		const row = await store.get('nl_subscribers', String(query.id || ''));
		if (!row) throw new HttpError(404, 'No such subscriber.', 'missing');
		return { subscriber: { ...subscriberView(row), consent: row.consent || '', history: row.history || [], confirm_sent_at: row.confirm_sent_at || null } };
	},

	// Everyone in one state, as CSV: the address, when they joined and how.
	async newsExport({ store, query }) {
		const status = STATUSES.includes(query.status) ? query.status : 'subscribed';
		const lines = ['email,status,source,tags,joined,confirmed,consent'];
		// A leading = + - or @ would be read as a formula by a spreadsheet.
		const cell = (v) => `"${String(v ?? '').replace(/^[=+\-@]/, "'$&").replace(/"/g, '""')}"`;
		for await (const r of everyone(store, status)) {
			lines.push([r.email, r.status, r.source || '', (r.tags || []).join(' '), r.created_at || '', r.confirmed_at || '', r.consent || ''].map(cell).join(','));
		}
		return { csv: `${lines.join('\n')}\n`, count: lines.length - 1, status };
	},

	async newsCampaign({ store, query }) {
		const c = await campaignById(store, query.id);
		const reports = await reportsFor(store, [c.id]);
		return { campaign: campaignView({ ...c, reports: reports[c.id] }, { full: true }), audience: c.status === 'draft' ? await audienceCount(store, c.audience) : c.total || 0 };
	},

	async newsAction({ store, env, base, body }) {
		const action = String(body.action || '');

		// --- adding to the list ---
		if (action === 'add') {
			const mode = body.mode === 'subscribed' ? 'subscribed' : 'confirm';
			const consent = String(body.consent || '').replace(/\s+/g, ' ').trim();
			if (consent.length < 10) fail('Say how these people agreed to be emailed - it is kept with each address.', 'consent');
			if (mode === 'confirm' && !sendingReady(env)) fail('Sending is not set up, so no confirmation can go out. Add them as already subscribed, or set up Resend first.', 'not-configured');
			const { emails, invalid } = addressesIn(body.emails);
			if (!emails.length) fail(invalid.length ? 'None of those look like email addresses.' : 'Paste at least one address.', 'empty');
			const max = mode === 'confirm' ? 25 : 500;
			if (emails.length > max) fail(`At most ${max} at a time this way. The page sends them in parts.`, 'too-many');
			const tags = cleanTags(body.tags);
			const settings = await newsSettings(store);
			const tally = { subscribed: 0, pending: 0, resent: 0, waiting: 0, confirmed: 0, existing: 0, suppressed: 0, invalid: invalid.length };
			for (const email of emails) {
				const outcome = await upsert(store, env, base, { email, source: body.source === 'import' ? 'import' : 'admin', consent, mode, tags }, settings);
				tally[outcome] = (tally[outcome] || 0) + 1;
			}
			await log(store, 'news.add', `${emails.length} addresses`, `${mode}; ${JSON.stringify(tally)}; ${consent}`);
			return { ok: true, tally, invalid: invalid.slice(0, 20) };
		}

		// --- one subscriber ---
		if (action === 'subscriber') {
			const row = await store.get('nl_subscribers', String(body.id || ''));
			if (!row) throw new HttpError(404, 'No such subscriber.', 'missing');
			const op = String(body.op || '');
			if (op === 'resend') {
				if (row.status !== 'pending') fail('Only an address waiting for confirmation can be sent another.');
				await sendConfirmation(store, env, base, row);
			} else if (op === 'subscribe') {
				// Only someone who signed up and did not confirm: the admin says they
				// agreed some other way. A suppressed address comes back only itself.
				if (row.status !== 'pending') fail('Only an address waiting for confirmation can be marked subscribed. Anyone who left has to subscribe again themselves.');
				const consent = String(body.consent || '').trim();
				if (consent.length < 10) fail('Say how they agreed.', 'consent');
				await store.write([
					{ table: 'nl_subscribers', id: row.id, set: keyed({ ...row, status: 'subscribed', confirmed_at: nowIso(), consent, updated_at: nowIso(), history: withHistory(row, 'subscribed by the admin', consent) }), expect: row._version },
					countToday({ confirmed: 1, [`sources.${row.source || 'other'}`]: 1 }),
				]);
			} else if (op === 'unsubscribe') {
				if (!(await leave(store, row, { note: 'by the admin' }))) fail('That address is not on the list.');
			} else if (op === 'tags') {
				await store.update('nl_subscribers', [['id', 'eq', row.id]], { tags: cleanTags(body.tags), updated_at: nowIso() });
			} else if (op === 'delete') {
				if (String(body.confirm || '').trim().toLowerCase() !== row.email) fail(`Type ${row.email} to confirm.`);
				await store.remove('nl_subscribers', [['id', 'eq', row.id]]);
				await log(store, 'news.delete', row.id, 'erased an address for good');
				return { ok: true, deleted: true };
			} else {
				fail('Unknown action.');
			}
			await log(store, `news.${op}`, row.id, row.email.replace(/^(.{2})[^@]*/, '$1***'));
			return newsRoutes.newsSubscriber({ store, query: { id: row.id } });
		}

		// --- settings ---
		if (action === 'settings') {
			const s = body.settings || {};
			const value = {
				paused: Boolean(s.paused),
				message: String(s.message || '').replace(/\s+/g, ' ').trim().slice(0, 200),
				doubleOptIn: s.doubleOptIn !== false,
				welcome: s.welcome !== false,
				welcomeSubject: String(s.welcomeSubject || '').trim().slice(0, 150),
				welcomeBody: String(s.welcomeBody || '').trim().slice(0, 5000),
				updated_at: nowIso(),
			};
			const [existing] = await store.select('lf_settings', { filters: [['id', 'eq', 'newsletter']] });
			if (existing) await store.update('lf_settings', [['id', 'eq', 'newsletter']], value);
			else await store.insert('lf_settings', { id: 'newsletter', ...value });
			forgetSettings();
			await log(store, 'news.settings', 'newsletter', `${value.paused ? 'sign-ups paused' : 'sign-ups open'}; double opt-in ${value.doubleOptIn ? 'on' : 'off'}; welcome ${value.welcome ? 'on' : 'off'}`);
			return { ok: true, settings: await newsSettings(store) };
		}

		// --- issues ---
		if (action === 'campaign') {
			const op = String(body.op || '');
			if (op === 'create' || op === 'update') {
				const subject = String(body.subject || '').replace(/\s+/g, ' ').trim();
				if (subject.length < 3 || subject.length > 150) fail('Give it a subject, under 150 characters.', 'subject');
				const format = body.format === 'issue' ? 'issue' : 'markdown';
				const fields = {
					subject,
					preheader: String(body.preheader || '').replace(/\s+/g, ' ').trim().slice(0, 200),
					format,
					audience: body.audience && body.audience !== 'all' ? cleanTags(body.audience)[0] || 'all' : 'all',
					updated_at: nowIso(),
				};
				if (format === 'issue') {
					const issue = await issueFrom(base, String(body.issue || ''));
					Object.assign(fields, { issue: issue.slug, html: issue.html, url: issue.url, body: '' });
				} else {
					const text = String(body.body || '');
					if (text.trim().length < 20) fail('Write the issue - at least a sentence or two.', 'body');
					if (text.length > 60000) fail('That is too long for one email.', 'body');
					Object.assign(fields, { body: text, issue: null, html: null, url: null });
				}
				let c;
				if (op === 'create') {
					const id = randomBytes(6).toString('hex');
					c = { id, ...fields, status: 'draft', created_at: nowIso(), sent: 0, failed: 0, cursor: null };
					await store.write([{ table: 'nl_campaigns', id, set: c, expect: 'missing' }]);
				} else {
					c = await campaignById(store, body.id);
					if (c.status !== 'draft') fail('An issue that has started sending cannot be changed.', 'locked');
					await store.update('nl_campaigns', [['id', 'eq', c.id]], fields);
				}
				await log(store, `news.${op}`, c.id, subject);
				return newsRoutes.newsCampaign({ store, query: { id: c.id } });
			}
			const c = await campaignById(store, body.id);
			if (op === 'preview') {
				return { html: messageFor(env, base, c, { id: subscriberId(OWNER_EMAIL), email: OWNER_EMAIL }).html };
			}
			if (op === 'test') {
				await sendOne(env, messageFor(env, base, c, { id: subscriberId(OWNER_EMAIL), email: OWNER_EMAIL }, { test: true }));
				await store.update('nl_campaigns', [['id', 'eq', c.id]], { test_sent_at: nowIso(), updated_at: nowIso() });
				await log(store, 'news.test', c.id, `test to ${OWNER_EMAIL}`);
				return newsRoutes.newsCampaign({ store, query: { id: c.id } });
			}
			if (op === 'start') {
				if (c.status !== 'draft') fail('This issue has already started.', 'started');
				if (!sendingReady(env)) fail('Sending is not set up: RESEND_API_KEY and NEWSLETTER_FROM are needed in Vercel.', 'not-configured');
				if (!c.test_sent_at) fail('Send yourself a test first, and read it on your phone.', 'test');
				const total = await audienceCount(store, c.audience);
				if (!total) fail('Nobody to send it to yet.', 'empty');
				// The cursor starts at this moment, so nobody who joins from now
				// on is in the range: the issue goes to the list as it stood.
				const at = nowIso();
				await store.update('nl_campaigns', [['id', 'eq', c.id]], { status: 'sending', started_at: at, total, cursor: `subscribed|${at}`, sent: 0, error: null, updated_at: at });
				await log(store, 'news.start', c.id, `${c.subject} - to ${total}`);
				return newsRoutes.newsCampaign({ store, query: { id: c.id } });
			}
			if (op === 'step') {
				if (c.status !== 'sending') return newsRoutes.newsCampaign({ store, query: { id: c.id } });
				await step(store, env, base, c.id);
				return newsRoutes.newsCampaign({ store, query: { id: c.id } });
			}
			if (op === 'stop') {
				if (c.status !== 'sending') fail('It is not sending.');
				await store.update('nl_campaigns', [['id', 'eq', c.id]], { status: 'stopped', updated_at: nowIso() });
				await log(store, 'news.stop', c.id, `${c.subject} - stopped at ${c.sent || 0}`);
				return newsRoutes.newsCampaign({ store, query: { id: c.id } });
			}
			if (op === 'resume') {
				if (c.status !== 'stopped') fail('Only a stopped issue can carry on.');
				await store.update('nl_campaigns', [['id', 'eq', c.id]], { status: 'sending', updated_at: nowIso() });
				return newsRoutes.newsCampaign({ store, query: { id: c.id } });
			}
			if (op === 'delete') {
				if (c.status === 'sending' || (c.sent || 0) > 0) fail('An issue that went out stays in the record.');
				await store.remove('nl_campaigns', [['id', 'eq', c.id]]);
				await log(store, 'news.discard', c.id, c.subject);
				return { ok: true, deleted: c.id };
			}
			fail('Unknown action.');
		}

		fail('Unknown action.');
	},
};
