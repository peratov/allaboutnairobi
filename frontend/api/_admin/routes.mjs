// What the admin can see and do. Every route here runs only after
// requireOwner() in admin.mjs has said yes.
//
// One rule shapes the views: /terms promises that the name, phone and email on
// a listing or a reply are shown to one person - the other party - and the
// admin is not that person. So listings and replies come back without them;
// the admin sees only whether a listing still holds contact details, and can
// erase them. A place is different: it applied as a business, and checking
// that it is real is the admin's job, so a place's contact is shown.
//
// Every change is written to lf_admin_log, its own collection so the log is
// read in date order with no index of its own.

import { HttpError } from '../_lostfound/http.mjs';
import { forgetSettings, issuePortal, rules, settingsOf } from '../_lostfound/handlers.mjs';
import { OWNER_EMAIL } from './owner.mjs';
import { guarded, live as liveVisitors, lostFoundStats, rangeOf, ratings, search, traffic } from './analytics.mjs';
import { CATEGORIES as EVENT_CATEGORIES, applyChange, commitCalendar, readCalendar, validEvent } from './events.mjs';
import { pulseRoutes } from '../_pulse/admin.mjs';
import { newsRoutes } from '../_news/admin.mjs';
import { goalsAction, goalsView } from './goals.mjs';
import { promptSettings, vocab as pulseVocab } from '../_pulse/handlers.mjs';
import { summary as promptSummary } from '../_prompts/handlers.mjs';

const { pick, text, publicText, date, live, placesById, CATEGORIES, PLACE_KINDS, daysFromNow, limits, isoDay } = rules;

// An event an organiser sent in. Unlike a listing's, the organiser's contact
// is shown here: checking that an event is real is the admin's job, as it is
// for a place, and the outcome is emailed to them.
const SUBMISSION_FIELDS = ['ref', 'title', 'starts', 'ends', 'time', 'venue', 'area', 'organiser', 'category', 'price', 'url', 'description', 'contact_name', 'contact_phone', 'contact_email', 'status', 'created_at', 'decided_at', 'reason', 'commit'];
const SUBMISSION_STATUSES = new Set(['pending', 'approved', 'rejected']);

/** The calendar entry a submission would become, before the admin's edits. */
function asCalendarEvent(row) {
	return {
		title: row.title, starts: row.starts, ends: row.ends || '', time: row.time || '',
		venue: row.venue, area: row.area || '', organiser: row.organiser, category: row.category,
		price: row.price || '', url: row.url || '', description: row.description,
		source: `The organiser, ${row.organiser}, through the site's event form`,
		last_verified: isoDay(0),
	};
}

const titleKey = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const wordsOf = (t) => new Set(titleKey(t).split(' ').filter((w) => w.length > 3));

const fail = (message) => { throw new HttpError(400, message, 'invalid'); };
const PAGE = 30;
const ITEM_FIELDS = ['ref', 'kind', 'category', 'title', 'details', 'district', 'place_text', 'happened_on', 'status', 'flags', 'created_at', 'expires_at', 'ended_at'];
const PLACE_FIELDS = ['slug', 'name', 'kind', 'district', 'address', 'hours', 'collect_note', 'contact_public', 'contact_name', 'contact_phone', 'contact_email', 'status', 'created_at'];
const PLACE_STATUSES = new Set(['pending', 'active', 'suspended', 'rejected']);
const ITEM_STATUSES = new Set(['open', 'expired', 'returned', 'closed', 'hidden']);
const nowIso = () => new Date().toISOString();
const daysAgo = (days) => new Date(Date.now() - days * 86400000).toISOString();

function itemView(row, places) {
	const view = pick(row, ITEM_FIELDS);
	view.flags = row.flags || 0;
	// "Expired" is not stored: an open listing past its date is expired.
	if (row.status === 'open' && row.expires_at <= nowIso()) view.status = 'expired';
	view.has_contact = Boolean(row.contact_name || row.contact_phone || row.contact_email);
	const place = places?.get(row.place_id);
	if (place) view.place = pick(place, ['slug', 'name']);
	return view;
}

async function itemViews(store, rows) {
	const places = await placesById(store, rows.map((r) => r.place_id));
	return rows.map((row) => itemView(row, places));
}

async function one(store, table, column, value, what) {
	const [row] = await store.select(table, { filters: [[column, 'eq', String(value || '')]] });
	if (!row) throw new HttpError(404, `No such ${what}.`, 'missing');
	return row;
}

const log = (store, action, target, note = '') =>
	store.insert('lf_admin_log', { action, target, note: String(note).slice(0, 300), by: OWNER_EMAIL });

export const routes = {
	async me({ who }) {
		return { email: who.email, expires: new Date(who.expires).toISOString() };
	},

	async overview({ store }) {
		const week = daysAgo(7);
		const [open, expired, returned, hidden, pending, active, itemsWeek, claimsWeek, recent, waiting, flagged, eventsPending] = await Promise.all([
			store.count('lf_items', live()),
			store.count('lf_items', [['status', 'eq', 'open'], ['expires_at', 'lte', nowIso()]]),
			store.count('lf_items', [['status', 'eq', 'returned']]),
			store.count('lf_items', [['status', 'eq', 'hidden']]),
			store.count('lf_places', [['status', 'eq', 'pending']]),
			store.count('lf_places', [['status', 'eq', 'active']]),
			store.count('lf_items', [['created_at', 'gte', week]]),
			store.count('lf_claims', [['created_at', 'gte', week]]),
			store.select('lf_items', { order: ['created_at', 'desc'], limit: 8 }),
			store.select('lf_places', { filters: [['status', 'eq', 'pending']], order: ['created_at', 'desc'], limit: 10 }),
			store.select('lf_items', { filters: [['flags', 'gt', 0], ['status', 'neq', 'closed']], order: ['created_at', 'desc'], limit: 10 }),
			store.count('ev_submissions', [['status', 'eq', 'pending']]),
		]);
		return {
			counts: { open, expired, returned, hidden, pending, active, itemsWeek, claimsWeek, eventsPending },
			recent: await itemViews(store, recent),
			pending: waiting.map((p) => pick(p, PLACE_FIELDS)),
			flagged: await itemViews(store, flagged),
		};
	},

	// --- listings ---

	async items({ store, query }) {
		// A reference is unique: look it up, whatever else is set.
		const ref = String(query.q || '').trim().toUpperCase();
		if (/^[LF]-[A-Z0-9]{5}$/.test(ref)) {
			const rows = await store.select('lf_items', { filters: [['ref', 'eq', ref]] });
			return { items: await itemViews(store, rows), more: false, page: 0 };
		}
		const filters = [];
		const status = ITEM_STATUSES.has(query.status) ? query.status : '';
		if (status === 'open') filters.push(...live());
		else if (status === 'expired') filters.push(['status', 'eq', 'open'], ['expires_at', 'lte', nowIso()]);
		else if (status) filters.push(['status', 'eq', status]);
		if (query.kind === 'lost' || query.kind === 'found') filters.push(['kind', 'eq', query.kind]);
		if (CATEGORIES.has(query.category)) filters.push(['category', 'eq', query.category]);
		if (/^[a-z0-9-]{2,60}$/.test(query.district || '')) filters.push(['district', 'eq', query.district]);
		if (query.flagged === '1') filters.push(['flags', 'gt', 0]);
		if (query.place) filters.push(['place_id', 'eq', (await one(store, 'lf_places', 'slug', query.place, 'place')).id]);
		const words = String(query.q || '').toLowerCase().match(/[a-z0-9]{2,}/g)?.slice(0, 4) || [];
		if (words.length) filters.push(['', 'words', { columns: ['title', 'details', 'place_text'], words }]);
		const page = Math.max(0, Math.min(100, parseInt(query.page, 10) || 0));
		const rows = await store.select('lf_items', { filters, order: ['created_at', 'desc'], limit: PAGE + 1, offset: page * PAGE });
		return { items: await itemViews(store, rows.slice(0, PAGE)), more: rows.length > PAGE, page };
	},

	async item({ store, query }) {
		const row = await one(store, 'lf_items', 'ref', String(query.ref || '').toUpperCase(), 'listing');
		const [claims, reports] = await Promise.all([
			store.select('lf_claims', { filters: [['item_id', 'eq', row.id]], order: ['created_at', 'desc'] }),
			store.select('lf_events', { filters: [['item_id', 'eq', row.id], ['action', 'eq', 'flagged']] }),
		]);
		const [view] = await itemViews(store, [row]);
		return {
			item: view,
			// How many replies and where they stand - not what they say, nor who sent them.
			claims: claims.map((c) => ({ status: c.status, created_at: c.created_at })),
			reports: reports.map((r) => ({ reason: r.note || '', created_at: r.created_at })).sort((a, b) => (a.created_at < b.created_at ? 1 : -1)),
		};
	},

	async itemAction({ store, body }) {
		const row = await one(store, 'lf_items', 'ref', String(body.ref || '').toUpperCase(), 'listing');
		const blank = { contact_name: null, contact_phone: null, contact_email: null };
		const actions = {
			hide: { status: 'hidden' },
			restore: { status: 'open', flags: 0, ...(row.expires_at <= nowIso() ? { expires_at: daysFromNow(limits.itemDays) } : {}) },
			close: { status: 'closed', ended_at: nowIso() },
			extend: { status: 'open', expires_at: daysFromNow(row.place_id ? limits.placeItemDays : limits.itemDays) },
			clearReports: { flags: 0 },
			// When someone asks for their details to go, as /terms says they can.
			erase: { status: row.status === 'open' ? 'closed' : row.status, ...(row.status === 'open' ? { ended_at: nowIso() } : {}), ...blank },
		};
		if (body.action === 'edit') {
			// The public-text rules still apply: no long numbers, emails or links,
			// whoever is typing.
			const f = body.fields || {};
			const changes = {
				title: publicText(f.title, { max: limits.titleMax, required: true, label: 'What it is' }),
				details: publicText(f.details, { max: limits.detailsMax, label: 'The description' }),
				place_text: publicText(f.place_text, { max: limits.placeTextMax, required: true, label: 'Where' }),
				category: CATEGORIES.has(f.category) ? f.category : row.category,
				district: /^[a-z0-9-]{2,60}$/.test(f.district || '') ? f.district : null,
				happened_on: date(f.happened_on),
			};
			await store.update('lf_items', [['id', 'eq', row.id]], changes);
			await log(store, 'item.edit', row.ref, body.note);
			return routes.item({ store, query: { ref: row.ref } });
		}
		if (body.action === 'delete') {
			// Gone for good: the listing, every reply to it, every report about it.
			// The log keeps the reference and the note, which is all it ever held.
			if (body.confirm !== row.ref) fail(`Type ${row.ref} to confirm.`);
			await store.remove('lf_claims', [['item_id', 'eq', row.id]]);
			await store.remove('lf_events', [['item_id', 'eq', row.id]]);
			await store.remove('lf_items', [['id', 'eq', row.id]]);
			await log(store, 'item.delete', row.ref, body.note);
			return { deleted: row.ref };
		}
		const patch = actions[body.action];
		if (!patch) fail('Unknown action.');
		await store.update('lf_items', [['id', 'eq', row.id]], patch);
		if (body.action === 'erase') await store.update('lf_claims', [['item_id', 'eq', row.id]], blank);
		await log(store, `item.${body.action}`, row.ref, body.note);
		return routes.item({ store, query: { ref: row.ref } });
	},

	// --- places ---

	async places({ store, query }) {
		const status = PLACE_STATUSES.has(query.status) ? query.status : '';
		const rows = await store.select('lf_places', status
			? { filters: [['status', 'eq', status]], order: status === 'pending' ? ['created_at', 'desc'] : ['name', 'asc'] }
			: { order: ['name', 'asc'] });
		return { places: rows.map((p) => pick(p, PLACE_FIELDS)) };
	},

	async place({ store, query }) {
		const row = await one(store, 'lf_places', 'slug', query.slug, 'place');
		const [holding, items] = await Promise.all([
			store.count('lf_items', [...live(), ['place_id', 'eq', row.id]]),
			store.select('lf_items', { filters: [['place_id', 'eq', row.id]], order: ['created_at', 'desc'], limit: 20 }),
		]);
		return { place: { ...pick(row, PLACE_FIELDS), has_portal: Boolean(row.portal_token_hash) }, holding, items: await itemViews(store, items) };
	},

	async placeAction({ store, body, base, notify }) {
		const row = await one(store, 'lf_places', 'slug', body.slug, 'place');
		let link = null;
		switch (body.action) {
			case 'approve':
			case 'relink':
				if (row.status === 'rejected') fail('Reopen the request before approving it.');
				link = await issuePortal({ store, place: row, base, notify });
				break;
			case 'suspend':
				await store.update('lf_places', [['id', 'eq', row.id]], { status: 'suspended' });
				break;
			case 'reactivate':
				if (!row.portal_token_hash) fail('This place has never had a portal: approve it instead.');
				await store.update('lf_places', [['id', 'eq', row.id]], { status: 'active' });
				break;
			case 'reject':
				if (row.status !== 'pending') fail('Only a request can be turned down.');
				await store.update('lf_places', [['id', 'eq', row.id]], { status: 'rejected' });
				break;
			case 'reopen':
				if (row.status !== 'rejected') fail('Only a turned-down request can be reopened.');
				await store.update('lf_places', [['id', 'eq', row.id]], { status: 'pending' });
				break;
			case 'edit': {
				const f = body.fields || {};
				const patch = {
					name: text(f.name, { max: 80, required: true, label: 'The name' }),
					address: text(f.address, { max: 140, required: true, label: 'The address' }),
					hours: text(f.hours, { max: 100, label: 'Opening hours' }),
					collect_note: text(f.collect_note, { max: 200, label: 'Where to collect' }),
					contact_public: text(f.contact_public, { max: 60, label: 'The public contact' }),
				};
				if (f.kind !== undefined) {
					if (!PLACE_KINDS.has(f.kind)) fail('Pick what kind of place it is.');
					patch.kind = f.kind;
				}
				if (f.district !== undefined) patch.district = /^[a-z0-9-]{2,60}$/.test(f.district || '') ? f.district : null;
				await store.update('lf_places', [['id', 'eq', row.id]], patch);
				break;
			}
			default:
				fail('Unknown action.');
		}
		await log(store, `place.${body.action}`, row.slug, body.note);
		// The link is in this answer and nowhere else: it is not stored, and the
		// log records that one was issued, not what it was.
		return { ...(await routes.place({ store, query: { slug: row.slug } })), link };
	},

	// --- reports and the log ---

	async reports({ store }) {
		const rows = await store.select('lf_items', { filters: [['flags', 'gt', 0]], order: ['created_at', 'desc'], limit: 60 });
		const items = await itemViews(store, rows);
		const reasons = await Promise.all(rows.map((row) => store.select('lf_events', { filters: [['item_id', 'eq', row.id], ['action', 'eq', 'flagged']] })));
		return { items: items.map((item, i) => ({ ...item, reasons: reasons[i].map((r) => r.note || '').filter(Boolean) })) };
	},

	async log({ store, query }) {
		const page = Math.max(0, Math.min(50, parseInt(query.page, 10) || 0));
		const rows = await store.select('lf_admin_log', { order: ['created_at', 'desc'], limit: 51, offset: page * 50 });
		return { entries: rows.slice(0, 50).map((r) => pick(r, ['action', 'target', 'note', 'by', 'created_at'])), more: rows.length > 50, page };
	},

	// --- analytics ---

	async traffic({ env, query }) {
		return guarded(() => traffic(env, rangeOf(query.days), query.fresh === '1'));
	},

	async live({ env }) {
		return guarded(() => liveVisitors(env));
	},

	async search({ env, query }) {
		return guarded(() => search(env, rangeOf(query.days), query.fresh === '1'));
	},

	async ratings({ env, query }) {
		return guarded(() => ratings(env, query.fresh === '1'));
	},

	async lostfoundStats({ store, query }) {
		return guarded(() => lostFoundStats(store, rangeOf(query.days), query.fresh === '1'));
	},

	// --- settings: the banner and lost and found ---

	async settings({ store, env }) {
		forgetSettings();
		const s = await settingsOf(store);
		return {
			banner: s.banner ? pick(s.banner, ['active', 'text', 'tone', 'link', 'link_text', 'until', 'version', 'updated_at']) : { active: false },
			lostfound: s.lostfound ? pick(s.lostfound, ['paused', 'message', 'limits', 'updated_at']) : { paused: false, limits: {} },
			events: s.events ? pick(s.events, ['paused', 'message', 'updated_at']) : { paused: false },
			pulse: s.pulse ? pick(s.pulse, ['paused', 'message', 'limits', 'prompt', 'updated_at']) : { paused: false, limits: {} },
			defaults: { ...pick(limits, ['itemsPerHour', 'claimsPerHour', 'flagsPerHour', 'joinsPerHour', 'eventsPerHour']), passesPerHour: pulseVocab.limits.passesPerHour, maxLive: pulseVocab.limits.maxLive },
			github: Boolean(env.GITHUB_TOKEN),
		};
	},

	async saveSettings({ store, body, env }) {
		const now = nowIso();
		let change;
		if (body.what === 'banner') {
			const b = body.banner || {};
			const value = {
				active: Boolean(b.active),
				text: String(b.text || '').replace(/\s+/g, ' ').trim().slice(0, 240),
				tone: ['info', 'warning', 'good'].includes(b.tone) ? b.tone : 'info',
				link: /^(https:\/\/|\/)[^\s]*$/.test(b.link || '') ? b.link : '',
				link_text: String(b.link_text || '').trim().slice(0, 40),
				until: /^\d{4}-\d{2}-\d{2}$/.test(b.until || '') ? b.until : '',
				// A new version on every save, so a reader who closed the old
				// notice still sees the new one.
				version: now,
				updated_at: now,
			};
			if (value.active && !value.text) fail('Write the notice before switching it on.');
			change = ['banner', value, value.active ? `on: ${value.text.slice(0, 80)}` : 'off'];
		} else if (body.what === 'lostfound') {
			const l = body.lostfound || {};
			const lim = {};
			for (const key of ['itemsPerHour', 'claimsPerHour', 'flagsPerHour', 'joinsPerHour', 'eventsPerHour']) {
				const n = Number(l.limits?.[key]);
				if (Number.isInteger(n) && n >= 1 && n <= 500) lim[key] = n;
			}
			const value = { paused: Boolean(l.paused), message: String(l.message || '').replace(/\s+/g, ' ').trim().slice(0, 200), limits: lim, updated_at: now };
			change = ['lostfound', value, `${value.paused ? 'paused' : 'open'}; limits ${JSON.stringify(lim)}`];
		} else if (body.what === 'events') {
			const e = body.events || {};
			const value = { paused: Boolean(e.paused), message: String(e.message || '').replace(/\s+/g, ' ').trim().slice(0, 200), updated_at: now };
			change = ['events', value, value.paused ? 'submissions paused' : 'submissions open'];
		} else if (body.what === 'pulse') {
			const p = body.pulse || {};
			const lim = {};
			const passes = Number(p.limits?.passesPerHour);
			if (Number.isInteger(passes) && passes >= 1 && passes <= 1000) lim.passesPerHour = passes;
			// How many questions may be open at once. Lowering it closes nothing;
			// it only stops another opening.
			const cap = Number(p.limits?.maxLive);
			if (Number.isInteger(cap) && cap >= 1 && cap <= 100) lim.maxLive = cap;
			const value = { paused: Boolean(p.paused), message: String(p.message || '').replace(/\s+/g, ' ').trim().slice(0, 200), limits: lim, updated_at: now };
			// Asking readers on other pages: saved only when sent, so the
			// settings page, which does not send it, leaves it as it was.
			if (p.prompt && typeof p.prompt === 'object') value.prompt = promptSettings(p.prompt);
			change = ['pulse', value, `${value.paused ? 'voting paused' : 'voting open'}; limits ${JSON.stringify(lim)}${value.prompt ? `; asking ${value.prompt.on ? `on, ${value.prompt.audience}` : 'off'}` : ''}`];
		} else fail('Unknown setting.');
		const [id, value, note] = change;
		const [existing] = await store.select('lf_settings', { filters: [['id', 'eq', id]] });
		if (existing) await store.update('lf_settings', [['id', 'eq', id]], value);
		else await store.insert('lf_settings', { id, ...value });
		forgetSettings();
		await log(store, `settings.${id}`, id, note);
		return routes.settings({ store, env });
	},

	// --- the events calendar, through GitHub ---

	async events({ env }) {
		const { events, sha } = await readCalendar(env);
		return { events, sha, categories: EVENT_CATEGORIES };
	},

	async saveEvent({ env, store, body }) {
		const action = body.action;
		const index = Number.isInteger(body.index) ? body.index : null;
		const event = action === 'remove' ? null : validEvent(body.event || {});
		const { text: current, sha } = await readCalendar(env);
		if (body.sha && body.sha !== sha) throw new HttpError(409, 'The calendar changed since you opened it. Reload and make the change again.', 'stale');
		const next = applyChange(current, { action, index, event });
		const title = event?.title || body.title || 'an event';
		const verb = { add: 'Add', edit: 'Update', remove: 'Remove' }[action];
		const result = await commitCalendar(env, { text: next, sha, message: `events: ${verb} ${title}\n\nFrom the admin, by ${OWNER_EMAIL}.` });
		await log(store, `event.${action}`, title, result.commit.slice(0, 7));
		return { ...(await routes.events({ env })), commit: result };
	},

	// --- events sent in by organisers ---

	async submissions({ store, query }) {
		const status = query.status === 'all' ? '' : SUBMISSION_STATUSES.has(query.status) ? query.status : 'pending';
		// One equality and no order, sorted here: there are few of these, and it
		// needs no index beyond the ones Firestore makes for every field.
		const rows = await store.select('ev_submissions', status ? { filters: [['status', 'eq', status]], limit: 300 } : { limit: 300 });
		// Waiting: the soonest event first, since it is the one that runs out of
		// time. Decided: the latest decision first.
		rows.sort(status === 'pending'
			? (a, b) => (a.starts < b.starts ? -1 : a.starts > b.starts ? 1 : 0)
			: (a, b) => ((b.decided_at || b.created_at) < (a.decided_at || a.created_at) ? -1 : 1));
		return { submissions: rows.map((r) => pick(r, SUBMISSION_FIELDS)) };
	},

	async submission({ store, env, query }) {
		const row = await one(store, 'ev_submissions', 'ref', String(query.ref || '').toUpperCase(), 'submission');
		// What is already in the calendar that this might duplicate: the same day,
		// or most of the same words in the name. Best effort - it needs GitHub.
		let similar = null;
		let calendar = null;
		try {
			const { events } = await readCalendar(env);
			const mine = wordsOf(row.title);
			similar = events.filter((e) => {
				if (titleKey(e.title) === titleKey(row.title)) return true;
				const theirs = wordsOf(e.title);
				const shared = [...mine].filter((w) => theirs.has(w)).length;
				return (e.starts && e.starts === row.starts) || (mine.size && shared / mine.size >= 0.6);
			}).map((e) => pick(e, ['title', 'starts', 'when', 'venue']));
		} catch (error) {
			calendar = error.message;
		}
		return { submission: pick(row, SUBMISSION_FIELDS), event: asCalendarEvent(row), similar, calendar, categories: EVENT_CATEGORIES };
	},

	async submissionAction({ store, env, body, notify, base }) {
		const row = await one(store, 'ev_submissions', 'ref', String(body.ref || '').toUpperCase(), 'submission');
		const blank = { contact_name: null, contact_phone: null, contact_email: null };
		let commit = null;
		switch (body.action) {
			case 'approve': {
				if (row.status !== 'pending') fail('Only a waiting event can be approved.');
				// The admin's edits on top of what was sent, held to the calendar's
				// own rules - and dated today, because today is when it was checked.
				const event = validEvent({ ...asCalendarEvent(row), ...(body.event || {}), annual: false, last_verified: isoDay(0) });
				if ((event.ends || event.starts) < isoDay(0)) fail('That event is over. Turn it down instead.');
				const { text: current, sha } = await readCalendar(env);
				const next = applyChange(current, { action: 'add', index: null, event });
				const result = await commitCalendar(env, { text: next, sha, message: `events: Add ${event.title}\n\nSent in by the organiser (${row.ref}), checked and approved in the admin by ${OWNER_EMAIL}.` });
				commit = result.commit;
				await store.update('ev_submissions', [['id', 'eq', row.id]], { status: 'approved', decided_at: nowIso(), commit: commit.slice(0, 12), title: event.title, starts: event.starts });
				if (row.contact_email && body.tell !== false) {
					await notify({
						to: row.contact_email,
						subject: `Your event is on All About Nairobi: ${event.title}`,
						text: `${event.title} has been checked and added to the events calendar. It appears on the site within a few minutes:\n\n${base}/events\n\nIt drops off by itself the day after it ends. If anything changes - the date, the venue - tell us, with your reference, at ${base}/contact\n\nReference ${row.ref}.`,
					});
				}
				break;
			}
			case 'reject': {
				if (row.status !== 'pending') fail('Only a waiting event can be turned down.');
				const reason = text(body.reason, { max: 300, label: 'The reason' });
				await store.update('ev_submissions', [['id', 'eq', row.id]], { status: 'rejected', decided_at: nowIso(), reason });
				if (row.contact_email && body.tell !== false) {
					await notify({
						to: row.contact_email,
						subject: `About your event: ${row.title}`,
						text: `Thank you for sending ${row.title} to All About Nairobi. We could not list it this time.${reason ? `\n\n${reason}` : ''}\n\nIf something has changed, you are welcome to send it again: ${base}/events/submit\n\nReference ${row.ref}.`,
					});
				}
				break;
			}
			case 'reopen':
				if (row.status !== 'rejected') fail('Only a turned-down event can be reopened.');
				await store.update('ev_submissions', [['id', 'eq', row.id]], { status: 'pending', decided_at: null, reason: null });
				break;
			case 'erase':
				// When the organiser asks for their details to go.
				await store.update('ev_submissions', [['id', 'eq', row.id]], { ...blank, ip_hash: null });
				break;
			default:
				fail('Unknown action.');
		}
		await log(store, `submission.${body.action}`, `${row.ref} ${row.title}`.slice(0, 120), body.note || (commit ? commit.slice(0, 7) : ''));
		return { ...(await routes.submission({ store, env, query: { ref: row.ref } })), commit };
	},

	// --- the site around it ---

	async site({ env, store }) {
		const repo = env.VERCEL_GIT_REPO_OWNER && env.VERCEL_GIT_REPO_SLUG ? `${env.VERCEL_GIT_REPO_OWNER}/${env.VERCEL_GIT_REPO_SLUG}` : 'peratov/allaboutnairobi';
		// The repository is private, so GitHub answers only with a token: a
		// fine-grained one, read-only, on this repository alone.
		let latest = null;
		if (env.GITHUB_TOKEN) try {
			const response = await fetch(`https://api.github.com/repos/${repo}/commits/master`, {
				headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'allaboutnairobi-admin', Authorization: `Bearer ${env.GITHUB_TOKEN}` },
				signal: AbortSignal.timeout(3000),
			});
			if (response.ok) {
				const commit = await response.json();
				latest = { sha: commit.sha, message: commit.commit?.message?.split('\n')[0] || '', date: commit.commit?.committer?.date || '' };
			}
		} catch { /* GitHub slow or down: the page says it could not tell */ }
		return {
			deploy: {
				sha: env.VERCEL_GIT_COMMIT_SHA || '',
				message: env.VERCEL_GIT_COMMIT_MESSAGE?.split('\n')[0] || '',
				environment: env.VERCEL_ENV || 'local',
				region: env.VERCEL_REGION || '',
				repo,
			},
			latest,
			database: store?.kind || 'none',
			// Whether each is set - never what it is.
			settings: {
				database: Boolean(env.FIRESTORE_CREDENTIALS || env.FIRESTORE_EMULATOR_HOST || env.LOSTFOUND_FILE),
				googleSignIn: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
				email: Boolean(env.RESEND_API_KEY && env.LOSTFOUND_FROM),
				dailyPurge: Boolean(env.CRON_SECRET),
				ipSalt: Boolean(env.LOSTFOUND_SALT),
				github: Boolean(env.GITHUB_TOKEN),
			},
		};
	},
};

// Nairobi Pulse's questions and counts. See ../_pulse/admin.mjs.
Object.assign(routes, pulseRoutes);

// The newsletter: the list, adding to it, issues and sending. See
// ../_news/admin.mjs.
Object.assign(routes, newsRoutes);

// How often the Pulse card and the rating prompt are shown, and what readers
// did with them. Counts only - see _prompts/handlers.mjs.
routes.promptStats = ({ store, query }) => promptSummary(store, rangeOf(query.days), { fresh: query.fresh === '1' });

// The site's goals: baseline, now and target for search, readership and the
// list, and whether each is on track. See goals.mjs.
routes.goals = ({ store, env, query }) => goalsView(store, env, { fresh: query.fresh === '1' });
routes.goalsAction = async ({ store, env, body }) => {
	if (!store) throw new HttpError(503, 'The database is not set up yet.', 'not-configured');
	const done = await goalsAction(store, body, (target, note) => log(store, 'goals.target', target, note));
	if (done.error) throw new HttpError(400, done.error, 'invalid');
	return goalsView(store, env);
};
