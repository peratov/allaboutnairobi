// Lost and found: every rule the service keeps, in one place.
//
// The design is about two risks more than about storage.
//
// 1. Contact details. Whoever lists an item gives a phone or an email so they
//    can be reached, and none of it is ever returned by a public route. A
//    claim ("this is mine", "I found this") goes to the person who listed the
//    item, through their private manage link - never the other way round. So
//    a stranger browsing cannot harvest numbers, and a scammer cannot ring a
//    finder pretending to be an owner without first describing the item.
//
// 2. Identity theft. A found national ID or bank card is the most common thing
//    people want to post, and printing its number makes it a gift. Public text
//    is refused if it carries a long run of digits, an email or a web address,
//    with a message saying why. Finders are told to keep one detail back and
//    ask claimants for it.
//
// There are no accounts. Whoever lists an item gets a private link to manage
// it (a random token, stored only as a hash). A mall or station gets the same
// kind of link to its portal once a person has approved it. The admin is the
// site's owner, signed in with Google - see ../_admin/.

import { createHash, randomBytes } from 'node:crypto';
import vocab from './vocab.mjs';
import { HttpError } from './http.mjs';
import { OWNER_EMAIL } from '../_admin/owner.mjs';
import { CATEGORIES as EVENT_CATEGORIES, CATEGORY_LABELS as EVENT_LABELS } from '../_admin/events.mjs';

export { HttpError };

const { limits } = vocab;
const CATEGORIES = new Set(vocab.categories.map((c) => c.id));
const PLACE_KINDS = new Set(vocab.placeKinds.map((k) => k.id));

const PUBLIC_ITEM = ['ref', 'kind', 'category', 'title', 'details', 'district', 'place_text', 'place_id', 'happened_on', 'status', 'created_at'];
const PUBLIC_PLACE = ['slug', 'name', 'kind', 'district', 'address', 'hours', 'collect_note', 'contact_public'];

const fail = (message, code = 'invalid') => { throw new HttpError(400, message, code); };

// --- small helpers -------------------------------------------------------------------

const pick = (row, keys) => Object.fromEntries(keys.filter((k) => k in row).map((k) => [k, row[k]]));
const hash = (value) => createHash('sha256').update(String(value)).digest('hex');
const token = () => randomBytes(24).toString('base64url');
const now = () => new Date();
const daysFromNow = (days) => new Date(Date.now() + days * 86400000).toISOString();

// Short public references people can say over the phone: no 0/O or 1/I/L.
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const reference = (kind) => (kind === 'lost' ? 'L-' : 'F-') +
	Array.from(randomBytes(5), (b) => ALPHABET[b % ALPHABET.length]).join('');

function text(value, { max, required, label }) {
	const clean = String(value ?? '').replace(/\s+/g, ' ').trim();
	if (required && !clean) fail(`${label} is missing.`);
	if (clean.length > max) fail(`${label} is too long - keep it under ${max} characters.`);
	return clean;
}

// The rule that keeps card, account and phone numbers out of public text.
function publicText(value, options) {
	const clean = text(value, options);
	if (/\d[\d\s.\-/]{6,}\d/.test(clean)) {
		fail(`${options.label} has a long number in it. Leave out card, account and phone numbers - anyone could use them. The owner can prove it is theirs another way.`, 'number');
	}
	if (/[^\s@]+@[^\s@]+\.[a-z]{2,}/i.test(clean) || /(https?:\/\/|www\.)/i.test(clean)) {
		fail(`${options.label} cannot carry an email address or a link. Contact details go in the private box below.`, 'contact');
	}
	return clean;
}

// Kenyan numbers to +254; anything else with enough digits is kept as typed.
function phone(value) {
	const digits = String(value ?? '').replace(/[^\d+]/g, '');
	if (!digits) return '';
	if (/^0[17]\d{8}$/.test(digits)) return `+254${digits.slice(1)}`;
	if (/^254[17]\d{8}$/.test(digits)) return `+${digits}`;
	if (/^\+\d{9,15}$/.test(digits)) return digits;
	fail('That phone number does not look right. A Kenyan number is ten digits, like 0712 345 678.', 'phone');
}

function email(value) {
	const clean = String(value ?? '').trim().toLowerCase();
	if (!clean) return '';
	if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(clean) || clean.length > 120) fail('That email address does not look right.', 'email');
	return clean;
}

function contact(body) {
	const result = {
		contact_name: text(body.contact_name, { max: 60, label: 'Your name' }),
		contact_phone: phone(body.contact_phone),
		contact_email: email(body.contact_email),
	};
	if (!result.contact_phone && !result.contact_email) {
		fail('Leave a phone number or an email, so they can reach you. It is never shown publicly.', 'contact');
	}
	return result;
}

function date(value) {
	const clean = String(value ?? '');
	if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) fail('Pick the date it happened.');
	const day = new Date(`${clean}T12:00:00Z`);
	if (Number.isNaN(day.getTime())) fail('Pick the date it happened.');
	if (day > new Date(Date.now() + 86400000)) fail('That date is in the future.');
	if (day < new Date(Date.now() - 365 * 86400000)) fail('That is more than a year ago - too long for a listing to help.');
	return clean;
}

const slugify = (name) => name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
	.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);

// Event submissions: how far ahead a date may be, and the shortest
// description that says what the event is.
const EVENT_AHEAD_DAYS = 540;
const EVENT_MAX_DAYS = 31;
const EVENT_DESCRIPTION_MIN = 40;
const eventRef = () => `E-${Array.from(randomBytes(5), (b) => ALPHABET[b % ALPHABET.length]).join('')}`;
const isoDay = (offset = 0) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

// Links belong in the link box and contact details in the private one, so the
// text that will be published carries neither.
function noLinks(clean, label) {
	if (/[^\s@]+@[^\s@]+\.[a-z]{2,}/i.test(clean) || /(https?:\/\/|www\.)/i.test(clean)) {
		fail(`${label} cannot carry an email address or a link. The event's link has its own box, and your details go in the private one.`, 'contact');
	}
	return clean;
}

function eventDay(value, label) {
	const clean = String(value ?? '');
	if (!/^\d{4}-\d{2}-\d{2}$/.test(clean) || Number.isNaN(new Date(`${clean}T12:00:00Z`).getTime())) fail(`Pick ${label}.`, 'date');
	return clean;
}

// --- rate limits ------------------------------------------------------------------------

export function ipHash(req, env = process.env) {
	const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
	const ip = forwarded || req.socket?.remoteAddress || 'unknown';
	// A daily salt: enough to count actions per hour, useless for tracking anyone.
	return hash(`${ip}|${env.LOSTFOUND_SALT || 'lostfound'}|${new Date().toISOString().slice(0, 10)}`).slice(0, 32);
}

// --- settings the admin can change -----------------------------------------------------
//
// Documents in lf_settings: `lostfound` (paused, a message, and hourly
// limits that override vocab.mjs), `banner` (the site-wide notice), `events`
// (pausing submissions), `pulse` (pausing Nairobi Pulse's voting) and
// `newsletter` (pausing sign-ups, double opt-in, the welcome email). Read at
// most every thirty seconds by a warm function, so a change takes effect in
// about that long without every request paying a database read for it.

const SETTINGS_TTL = 30000;
let settingsCache = { at: 0, value: null, name: null };

export async function settingsOf(store) {
	if (settingsCache.name === store.name && Date.now() - settingsCache.at < SETTINGS_TTL) return settingsCache.value;
	const rows = await store.select('lf_settings', { filters: [['id', 'in', ['lostfound', 'banner', 'events', 'pulse', 'newsletter']]] });
	const value = Object.fromEntries(rows.map((row) => [row.id, row]));
	settingsCache = { at: Date.now(), value, name: store.name };
	return value;
}

export const forgetSettings = () => { settingsCache = { at: 0, value: null, name: null }; };

async function refuseIfPaused(store) {
	const lf = (await settingsOf(store)).lostfound;
	if (lf?.paused) throw new HttpError(503, lf.message || 'Lost and found is paused for a short while. Try again later.', 'paused');
}

const LIMIT_KEYS = { report: 'itemsPerHour', claim: 'claimsPerHour', flag: 'flagsPerHour', join: 'joinsPerHour', event: 'eventsPerHour' };

async function limit(store, ip, action, fallback) {
	const override = Number((await settingsOf(store)).lostfound?.limits?.[LIMIT_KEYS[action]]);
	const perHour = Number.isFinite(override) && override > 0 ? override : fallback;
	const since = new Date(Date.now() - 3600000).toISOString();
	const used = await store.count('lf_events', [['ip_hash', 'eq', ip], ['action', 'eq', action], ['created_at', 'gte', since]]);
	if (used >= perHour) throw new HttpError(429, 'That is a lot in one hour. Try again a little later.', 'rate');
	await store.insert('lf_events', { action, ip_hash: ip });
}

// --- reading -----------------------------------------------------------------------------

const live = () => [['status', 'eq', 'open'], ['expires_at', 'gt', now().toISOString()]];

async function placesById(store, ids) {
	const unique = [...new Set(ids.filter(Boolean))];
	if (!unique.length) return new Map();
	const rows = await store.select('lf_places', { filters: [['id', 'in', unique]] });
	return new Map(rows.map((p) => [p.id, p]));
}

async function publicItems(store, rows) {
	const places = await placesById(store, rows.map((r) => r.place_id));
	return rows.map((row) => {
		const item = pick(row, PUBLIC_ITEM);
		const place = places.get(row.place_id);
		delete item.place_id;
		if (place && place.status === 'active') item.place = pick(place, ['slug', 'name']);
		return item;
	});
}

/**
 * Possible matches: the other kind, same category, open, within three weeks of
 * each other, scored on district and shared words. Cheap, explainable, and
 * good enough for a city where most listings will be phones, wallets and IDs.
 */
async function matchesFor(store, item) {
	const day = new Date(`${item.happened_on}T12:00:00Z`).getTime();
	const window = 21 * 86400000;
	const rows = await store.select('lf_items', {
		filters: [
			...live(),
			['kind', 'eq', item.kind === 'lost' ? 'found' : 'lost'],
			['category', 'eq', item.category],
			['happened_on', 'gte', new Date(day - window).toISOString().slice(0, 10)],
			['happened_on', 'lte', new Date(day + window).toISOString().slice(0, 10)],
		],
		limit: 60,
	});
	const words = (row) => new Set(`${row.title} ${row.details || ''} ${row.place_text || ''}`.toLowerCase().match(/[a-z]{3,}/g) || []);
	const mine = words(item);
	const scored = rows
		.filter((row) => row.ref !== item.ref)
		.map((row) => {
			let score = row.district && row.district === item.district ? 3 : 0;
			for (const word of words(row)) if (mine.has(word)) score += 1;
			score -= Math.abs(new Date(`${row.happened_on}T12:00:00Z`).getTime() - day) / (7 * 86400000);
			return { row, score };
		})
		.sort((a, b) => b.score - a.score)
		.slice(0, 4)
		.map((s) => s.row);
	return publicItems(store, scored);
}

// --- the routes ----------------------------------------------------------------------------

export const routes = {
	async meta({ store }) {
		const lf = (await settingsOf(store)).lostfound;
		return { ok: true, vocab, paused: lf?.paused ? (lf.message || 'Lost and found is paused for a short while.') : null };
	},

	// The site-wide notice, for every page. Public, and cached at the edge for a
	// minute (see lost-found.mjs), so a busy day costs one read a minute.
	async notice({ store }) {
		const b = (await settingsOf(store)).banner;
		const live = b?.active && b.text && (!b.until || b.until >= new Date().toISOString().slice(0, 10));
		return { banner: live ? pick(b, ['version', 'text', 'tone', 'link', 'link_text']) : null };
	},

	async items({ store, query }) {
		const filters = live();
		if (query.kind === 'lost' || query.kind === 'found') filters.push(['kind', 'eq', query.kind]);
		if (CATEGORIES.has(query.category)) filters.push(['category', 'eq', query.category]);
		if (/^[a-z0-9-]{2,60}$/.test(query.district || '')) filters.push(['district', 'eq', query.district]);
		const words = String(query.q || '').toLowerCase().match(/[a-z0-9]{2,}/g)?.slice(0, 4) || [];
		if (words.length) filters.push(['', 'words', { columns: ['title', 'details', 'place_text'], words }]);
		const page = Math.max(0, Math.min(50, parseInt(query.page, 10) || 0));
		// A caller may ask for a smaller page, never a larger one.
		const size = Math.max(1, Math.min(limits.pageSize, parseInt(query.limit, 10) || limits.pageSize));
		const rows = await store.select('lf_items', {
			filters, order: ['created_at', 'desc'], limit: size + 1, offset: page * size,
		});
		return { items: await publicItems(store, rows.slice(0, size)), more: rows.length > size };
	},

	async item({ store, query }) {
		const [row] = await store.select('lf_items', { filters: [['ref', 'eq', String(query.ref || '').toUpperCase()]] });
		if (!row || row.status === 'hidden') throw new HttpError(404, 'That listing is not here any more.', 'gone');
		const [item] = await publicItems(store, [row]);
		const open = row.status === 'open' && row.expires_at > now().toISOString();
		return { item, matches: open ? await matchesFor(store, row) : [] };
	},

	async report({ store, body, ip, base }) {
		await refuseIfPaused(store);
		if (body.website) fail('Something went wrong.'); // the honeypot
		const kind = body.kind === 'lost' || body.kind === 'found' ? body.kind : fail('Say whether you lost it or found it.');
		if (!CATEGORIES.has(body.category)) fail('Pick what kind of thing it is.');
		const row = {
			kind,
			category: body.category,
			title: publicText(body.title, { max: limits.titleMax, required: true, label: 'What it is' }),
			details: publicText(body.details, { max: limits.detailsMax, label: 'The description' }),
			district: /^[a-z0-9-]{2,60}$/.test(body.district || '') ? body.district : null,
			place_text: publicText(body.place_text, { max: limits.placeTextMax, required: true, label: 'Where' }),
			happened_on: date(body.happened_on),
			...contact(body),
		};
		await limit(store, ip, 'report', limits.itemsPerHour);
		const secret = token();
		const saved = await store.insert('lf_items', {
			...row,
			ref: reference(kind),
			manage_token_hash: hash(secret),
			ip_hash: ip,
			expires_at: daysFromNow(limits.itemDays),
		});
		return {
			ref: saved.ref,
			manage: `${base}/lost-and-found/manage#t=${secret}`,
			matches: await matchesFor(store, saved),
		};
	},

	async claim({ store, body, ip, notify, base }) {
		await refuseIfPaused(store);
		const [item] = await store.select('lf_items', { filters: [['ref', 'eq', String(body.ref || '').toUpperCase()]] });
		if (!item || item.status !== 'open') throw new HttpError(404, 'That listing is closed.', 'gone');
		const message = text(body.message, { max: limits.messageMax, required: true, label: 'Your message' });
		if (message.length < 15) fail('Say a little more - what makes it yours, or where you found it.');
		const who = contact(body);
		await limit(store, ip, 'claim', limits.claimsPerHour);
		await store.insert('lf_claims', { item_id: item.id, message, ...who, ip_hash: ip });
		// Tell whoever holds the item: the person who listed it, or the place.
		let to = item.contact_email;
		if (item.place_id) {
			const [place] = await store.select('lf_places', { filters: [['id', 'eq', item.place_id]] });
			to = place?.contact_email || to;
		}
		if (to) {
			await notify({
				to,
				subject: `Someone replied about ${item.ref}: ${item.title}`,
				text: `Someone has replied to your lost and found listing ${item.ref} (${item.title}).\n\n` +
					`Open your private link to read it and to see how to reach them. If you lost that link, ` +
					`reply to this email.\n\n${base}/lost-and-found`,
			});
		}
		return { ok: true };
	},

	async flag({ store, body, ip }) {
		const [item] = await store.select('lf_items', { filters: [['ref', 'eq', String(body.ref || '').toUpperCase()]] });
		if (!item) throw new HttpError(404, 'That listing is not here any more.', 'gone');
		await limit(store, ip, 'flag', limits.flagsPerHour);
		const reason = text(body.reason, { max: 200, label: 'The reason' });
		await store.insert('lf_events', { action: 'flagged', ip_hash: ip, item_id: item.id, note: reason });
		const flags = (item.flags || 0) + 1;
		// Three reports take a listing down until someone looks at it.
		await store.update('lf_items', [['id', 'eq', item.id]], { flags, ...(flags >= 3 ? { status: 'hidden' } : {}) });
		return { ok: true };
	},

	// --- whoever listed an item ---

	async manage({ store, method, body, secret }) {
		if (!secret) throw new HttpError(401, 'This link is missing its key.', 'auth');
		const [item] = await store.select('lf_items', { filters: [['manage_token_hash', 'eq', hash(secret)]] });
		if (!item) throw new HttpError(404, 'This link does not open any listing. It may have been mistyped.', 'auth');

		if (method === 'POST') {
			const actions = {
				returned: () => store.update('lf_items', [['id', 'eq', item.id]], { status: 'returned', ended_at: new Date().toISOString() }),
				close: () => store.update('lf_items', [['id', 'eq', item.id]], { status: 'closed', ended_at: new Date().toISOString() }),
				reopen: () => store.update('lf_items', [['id', 'eq', item.id]], { status: 'open', expires_at: daysFromNow(limits.itemDays) }),
				accept: () => store.update('lf_claims', [['id', 'eq', body.claim], ['item_id', 'eq', item.id]], { status: 'accepted' }),
				decline: () => store.update('lf_claims', [['id', 'eq', body.claim], ['item_id', 'eq', item.id]], { status: 'declined' }),
			};
			if (!actions[body.action]) fail('Unknown action.');
			if (item.status === 'hidden') throw new HttpError(403, 'This listing was taken down after reports.', 'hidden');
			await actions[body.action]();
			return routes.manage({ store, method: 'GET', secret });
		}

		const claims = await store.select('lf_claims', { filters: [['item_id', 'eq', item.id]], order: ['created_at', 'desc'] });
		const [publicItem] = await publicItems(store, [item]);
		return {
			item: { ...publicItem, expires_at: item.expires_at, contact_name: item.contact_name, contact_phone: item.contact_phone, contact_email: item.contact_email },
			claims: claims.map((c) => pick(c, ['id', 'message', 'contact_name', 'contact_phone', 'contact_email', 'status', 'created_at'])),
			matches: item.status === 'open' ? await matchesFor(store, item) : [],
		};
	},

	// --- places: malls, stations, businesses ---

	async places({ store }) {
		const rows = await store.select('lf_places', { filters: [['status', 'eq', 'active']], order: ['name', 'asc'] });
		const counts = await Promise.all(rows.map((p) => store.count('lf_items', [...live(), ['place_id', 'eq', p.id]])));
		return { places: rows.map((p, i) => ({ ...pick(p, PUBLIC_PLACE), holding: counts[i] })) };
	},

	async place({ store, query }) {
		const [place] = await store.select('lf_places', { filters: [['slug', 'eq', String(query.slug || '')], ['status', 'eq', 'active']] });
		if (!place) throw new HttpError(404, 'That place is not on lost and found.', 'gone');
		const rows = await store.select('lf_items', { filters: [...live(), ['place_id', 'eq', place.id]], order: ['created_at', 'desc'], limit: 100 });
		return { place: pick(place, PUBLIC_PLACE), items: await publicItems(store, rows) };
	},

	async join({ store, body, ip, notify, env, base }) {
		await refuseIfPaused(store);
		if (body.website) fail('Something went wrong.');
		const name = text(body.name, { max: 80, required: true, label: 'The name of the place' });
		if (!PLACE_KINDS.has(body.kind)) fail('Pick what kind of place it is.');
		const row = {
			name,
			kind: body.kind,
			district: /^[a-z0-9-]{2,60}$/.test(body.district || '') ? body.district : null,
			address: text(body.address, { max: 140, required: true, label: 'The address' }),
			hours: text(body.hours, { max: 100, label: 'Opening hours' }),
			collect_note: text(body.collect_note, { max: 200, label: 'Where to collect' }),
			contact_public: text(body.contact_public, { max: 60, label: 'The public contact' }),
			...contact(body),
		};
		if (!row.contact_email) fail('Leave an email - it is how your portal link reaches you.', 'contact');
		await limit(store, ip, 'join', limits.joinsPerHour);
		let slug = slugify(name) || 'place';
		if ((await store.count('lf_places', [['slug', 'eq', slug]])) > 0) slug = `${slug}-${randomBytes(2).toString('hex')}`;
		await store.insert('lf_places', { ...row, slug, status: 'pending' });
		await notify({
			to: env.LOSTFOUND_ADMIN_EMAIL || OWNER_EMAIL,
			subject: `Lost and found: ${name} wants a portal`,
			text: `${name} (${row.kind}) applied for a lost and found portal.\n\nReview it: ${base}/admin#places`,
		});
		return { ok: true };
	},

	async portal({ store, method, body, secret, base }) {
		if (!secret) throw new HttpError(401, 'This link is missing its key.', 'auth');
		const [place] = await store.select('lf_places', { filters: [['portal_token_hash', 'eq', hash(secret)]] });
		if (!place || place.status !== 'active') throw new HttpError(404, 'This portal link does not open any place, or the place is suspended.', 'auth');

		if (method === 'POST') {
			const own = async (ref) => {
				const [item] = await store.select('lf_items', { filters: [['ref', 'eq', String(ref || '')], ['place_id', 'eq', place.id]] });
				if (!item) fail('That item is not one of yours.');
				return item;
			};
			if (body.action === 'add') {
				await refuseIfPaused(store);
				if (!CATEGORIES.has(body.category)) fail('Pick what kind of thing it is.');
				await store.insert('lf_items', {
					kind: 'found',
					category: body.category,
					title: publicText(body.title, { max: limits.titleMax, required: true, label: 'What it is' }),
					details: publicText(body.details, { max: limits.detailsMax, label: 'The description' }),
					district: place.district,
					place_text: publicText(body.place_text || place.name, { max: limits.placeTextMax, label: 'Where in the building' }),
					place_id: place.id,
					happened_on: date(body.happened_on),
					ref: reference('found'),
					expires_at: daysFromNow(limits.placeItemDays),
				});
			} else if (['returned', 'close', 'reopen'].includes(body.action)) {
				const item = await own(body.ref);
				const status = { returned: 'returned', close: 'closed', reopen: 'open' }[body.action];
				await store.update('lf_items', [['id', 'eq', item.id]], { status, ...(status === 'open' ? { expires_at: daysFromNow(limits.placeItemDays) } : { ended_at: new Date().toISOString() }) });
			} else if (body.action === 'accept' || body.action === 'decline') {
				const [claim] = await store.select('lf_claims', { filters: [['id', 'eq', String(body.claim || '')]] });
				if (!claim) fail('That reply is not here.');
				const [item] = await store.select('lf_items', { filters: [['id', 'eq', claim.item_id], ['place_id', 'eq', place.id]] });
				if (!item) fail('That reply is not about one of your items.');
				await store.update('lf_claims', [['id', 'eq', claim.id]], { status: body.action === 'accept' ? 'accepted' : 'declined' });
			} else if (body.action === 'details') {
				await store.update('lf_places', [['id', 'eq', place.id]], {
					hours: text(body.hours, { max: 100, label: 'Opening hours' }),
					collect_note: text(body.collect_note, { max: 200, label: 'Where to collect' }),
					contact_public: text(body.contact_public, { max: 60, label: 'The public contact' }),
				});
			} else fail('Unknown action.');
			return routes.portal({ store, method: 'GET', secret, base });
		}

		const items = await store.select('lf_items', { filters: [['place_id', 'eq', place.id], ['status', 'neq', 'hidden']], order: ['created_at', 'desc'], limit: 200 });
		const ids = items.map((i) => i.id);
		const claims = ids.length ? await store.select('lf_claims', { filters: [['item_id', 'in', ids]], order: ['created_at', 'desc'], limit: 200 }) : [];
		const refById = new Map(items.map((i) => [i.id, i.ref]));
		return {
			place: { ...pick(place, PUBLIC_PLACE), page: `${base}/lost-and-found/place?p=${place.slug}` },
			items: items.map((i) => ({ ...pick(i, PUBLIC_ITEM), expires_at: i.expires_at })),
			claims: claims.map((c) => ({ ...pick(c, ['id', 'message', 'contact_name', 'contact_phone', 'contact_email', 'status', 'created_at']), ref: refById.get(c.item_id) })),
		};
	},

	// --- events: an organiser asks for a listing on /events ---
	//
	// Nothing submitted here is published by it. A submission waits in
	// ev_submissions until the admin approves it, which commits it to the
	// events calendar like any other edit (see ../_admin/routes.mjs), so it goes
	// through the build and its checks. The organiser's name, email and phone
	// are for that check and for telling them the outcome; they are never on the
	// site, and they are blanked thirty days after the decision.

	async 'event-meta'({ store }) {
		const ev = (await settingsOf(store)).events;
		return {
			categories: EVENT_CATEGORIES.map((id) => ({ id, label: EVENT_LABELS[id] })),
			earliest: isoDay(0),
			latest: isoDay(EVENT_AHEAD_DAYS),
			paused: ev?.paused ? (ev.message || 'Event submissions are paused for a short while. Try again later.') : null,
		};
	},

	async event({ store, body, ip, notify, env, base }) {
		const ev = (await settingsOf(store)).events;
		if (ev?.paused) throw new HttpError(503, ev.message || 'Event submissions are paused for a short while. Try again later.', 'paused');
		if (body.website) fail('Something went wrong.'); // the honeypot

		const title = noLinks(text(body.title, { max: 100, required: true, label: 'The name of the event' }), 'The name of the event');
		if (title.length < 4) fail('Give the event its full name.');
		const starts = eventDay(body.starts, 'the day it starts');
		if (starts < isoDay(0)) fail('That date has passed. List events that are still to come.', 'date');
		if (starts > isoDay(EVENT_AHEAD_DAYS)) fail('That is more than eighteen months away. List it closer to the time.', 'date');
		let ends = '';
		if (body.ends) {
			ends = eventDay(body.ends, 'the day it ends');
			if (ends < starts) fail('The last day has to be on or after the first.', 'date');
			if ((new Date(ends) - new Date(starts)) / 86400000 > EVENT_MAX_DAYS) fail('That runs for more than a month. For a season or an exhibition, list its opening.', 'date');
			if (ends === starts) ends = '';
		}
		const category = EVENT_CATEGORIES.includes(body.category) ? body.category : fail('Pick what kind of event it is.');
		const url = String(body.url ?? '').trim();
		if (url && (!/^https:\/\/[^\s]+\.[^\s]+$/.test(url) || url.length > 300)) fail('The link has to be a full web address starting with https://', 'url');
		const description = noLinks(text(body.description, { max: 900, required: true, label: 'The description' }), 'The description');
		if (description.length < EVENT_DESCRIPTION_MIN) fail('Say a little more about it - what happens, and who it is for.');

		// The outcome is emailed, so an email is the one contact that is required.
		if (!String(body.contact_email ?? '').trim()) fail('Leave your email - it is how you hear that your event is on the site.', 'contact');
		const row = {
			title,
			starts,
			ends,
			time: noLinks(text(body.time, { max: 40, label: 'The time' }), 'The time'),
			venue: noLinks(text(body.venue, { max: 140, required: true, label: 'The venue' }), 'The venue'),
			area: noLinks(text(body.area, { max: 80, label: 'The area' }), 'The area'),
			organiser: noLinks(text(body.organiser, { max: 100, required: true, label: 'Who is organising it' }), 'Who is organising it'),
			category,
			price: noLinks(text(body.price, { max: 60, label: 'The price' }), 'The price'),
			url,
			description,
			...contact(body),
		};

		// The same event sent twice, waiting both times, is one event.
		const sameDay = await store.select('ev_submissions', { filters: [['starts', 'eq', starts]], limit: 100 });
		const key = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, '');
		if (sameDay.some((s) => s.status === 'pending' && key(s.title) === key(title))) {
			throw new HttpError(409, 'That event is already waiting to be checked. You will hear by email once it has been.', 'duplicate');
		}

		await limit(store, ip, 'event', limits.eventsPerHour);
		const saved = await store.insert('ev_submissions', { ...row, ref: eventRef(), ip_hash: ip });
		await notify({
			to: env.LOSTFOUND_ADMIN_EMAIL || OWNER_EMAIL,
			subject: `Event to approve: ${title}`,
			text: `${row.organiser} sent an event for ${starts}: ${title}, at ${row.venue}.\n\nReview it: ${base}/admin#submission=${saved.ref}`,
		});
		await notify({
			to: row.contact_email,
			subject: `We have your event: ${title}`,
			text: `Thank you for sending ${title} (${starts}) to All About Nairobi.\n\nEvery event is checked by a person before it goes on the site. You will get another email when it is listed, or if it cannot be.\n\nYour reference is ${saved.ref}.\n\n${base}/events`,
		});
		return { ok: true, ref: saved.ref };
	},

	// --- the daily purge, run by Vercel Cron ---
	//
	// /terms promises that contact details do not outlive their use, and a
	// promise like that has to be enforced by something that runs whether or
	// not anyone remembers. Thirty days after a listing has ended - expired,
	// closed or sorted - its name, phone and email are blanked; after ninety
	// days, so are the replies'. The listing text stays, since it was public.
	async purge({ store, env, authorization }) {
		if (!env.CRON_SECRET || authorization !== `Bearer ${env.CRON_SECRET}`) throw new HttpError(401, 'Not for you.', 'auth');
		const cutoff = new Date(Date.now() - 30 * 86400000).toISOString();
		const blank = { contact_name: null, contact_phone: null, contact_email: null };
		const expired = await store.update('lf_items', [['expires_at', 'lt', cutoff]], blank);
		const ended = await store.update('lf_items', [['status', 'in', ['returned', 'closed', 'hidden']], ['created_at', 'lt', cutoff]], blank);
		const replies = await store.update('lf_claims', [['created_at', 'lt', new Date(Date.now() - 90 * 86400000).toISOString()]], blank);
		const events = await store.update('lf_events', [['created_at', 'lt', cutoff]], { ip_hash: null });
		// An event's organiser, thirty days after it was approved or turned down.
		const submissions = await store.update('ev_submissions', [['status', 'in', ['approved', 'rejected']], ['decided_at', 'lt', cutoff]], { ...blank, ip_hash: null });
		return { ok: true, items: expired.length + ended.length, replies: replies.length, events: events.length, submissions: submissions.length };
	},
};

// --- for the admin ---------------------------------------------------------------------

/**
 * Approve a place, or give it a new portal link: either way a fresh key, the
 * old one stops working, and the link is emailed to the place when email is
 * set up. Returned once, to the admin, and never stored.
 */
export async function issuePortal({ store, place, base, notify }) {
	const portal = token();
	await store.update('lf_places', [['id', 'eq', place.id]], { status: 'active', portal_token_hash: hash(portal) });
	const link = `${base}/lost-and-found/portal#t=${portal}`;
	if (place.contact_email) {
		await notify({
			to: place.contact_email,
			subject: `Your lost and found portal for ${place.name}`,
			text: `${place.name} is on All About Nairobi's lost and found.\n\nThis is your private portal link. Anyone with it can list and close items for ${place.name}, so keep it to the staff who handle lost property:\n\n${link}\n\nYour public page: ${base}/lost-and-found/place?p=${place.slug}`,
		});
	}
	return link;
}

export const rules = { pick, text, publicText, date, live, placesById, CATEGORIES, PLACE_KINDS, limits, daysFromNow, isoDay };
