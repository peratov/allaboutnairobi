// Nairobi Pulse: questions about the city, answered only by people in it.
//
// Three things decide whether a vote counts, and where.
//
// 1. Being in Nairobi. The page asks the browser for its position once,
//    and this checks it against the 29 district outlines (geo.mjs). Inside -
//    or within a few hundred metres of the coast - the answer is a pass: the
//    district, signed, good for `passDays`. The position itself is used for
//    that one decision and is never stored or logged. Vercel's own reading of
//    the connection's country is checked beside it, so a request from a
//    network outside Kenya is refused however it describes its position. A
//    determined person can fool both; the page says so.
//
// 2. One vote a device, per question. The browser makes a random id and keeps
//    it. A vote is stored under a keyed hash of the question and that id, so
//    the same device voting again changes its vote rather than adding one, and
//    nothing stored can be turned back into the id.
//
// 3. Counts that cannot drift. Each question has a tally - a total, a count
//    per answer, and the same per district - and a vote and the tally change it
//    makes are one commit (store.write), applied together or not at all. A
//    changed vote takes one from where it was and adds one where it goes.
//
// Who is asked. Readers are asked on every page (pulse-prompt.mjs), and
// `where` decides whether this one should be: it reads what Vercel says about
// the connection - its country, region, city and rough position - and answers
// yes or no, keeping nothing. That is a guess, good enough to choose whom to
// ask and no more: a vote still needs the phone's own position (1, above),
// because a connection cannot say which district anyone is in.
//
// What the public sees is the tally, never a vote. A district's breakdown is
// published only once it has `minDistrictVotes`; below that only how many
// votes it has, so a district where three people voted cannot be read as
// three people's answers.
//
// The public side costs the same however many questions there are. The list
// of questions is one document (pulse_meta/index), rebuilt by every admin
// change and by the daily job; every question's vote count is another
// (pulse_meta/totals), incremented in the same commit as each new vote. A
// question's own reads are one document by id. Reading the questions
// collection itself - a hundred documents once the bank is in use - is left
// to the admin.

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import vocab from './vocab.mjs';
import bank from './bank.mjs';
import { districtIds, districtName, locate } from './geo.mjs';
import { HttpError } from '../_lostfound/http.mjs';
import { settingsOf } from '../_lostfound/handlers.mjs';

export { vocab, bank };

const { limits } = vocab;
const TOPICS = new Set(vocab.topics.map((t) => t.id));
const DISTRICT_IDS = new Set(districtIds());
export const OPTION_IDS = 'abcdef'.split('');

const fail = (message, code = 'invalid') => { throw new HttpError(400, message, code); };
const isoDay = (offset = 0) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

// --- keys -----------------------------------------------------------------------------
//
// One secret signs passes and keys votes. PULSE_SECRET if it is set; otherwise
// the admin's session secret, which every deployment already has. Each use is
// labelled, so a pass can never stand in for a session or a vote key.

function secretOf(env) {
	const secret = env.PULSE_SECRET || env.ADMIN_SESSION_SECRET;
	if (!secret) throw new HttpError(503, 'Nairobi Pulse is not set up yet.', 'not-configured');
	return secret;
}

const mac = (env, ...parts) => createHmac('sha256', secretOf(env)).update(['nairobi-pulse', ...parts].join('|')).digest();

function deviceOf(value) {
	const device = String(value ?? '');
	if (!/^[A-Za-z0-9_-]{16,64}$/.test(device)) fail('This browser could not be recognised. Reload the page and try again.', 'device');
	return device;
}

const deviceKey = (env, device) => mac(env, 'device', device).toString('base64url').slice(0, 22);
export const voteId = (env, question, device) => mac(env, 'vote', question, device).toString('hex').slice(0, 40);

// --- passes -----------------------------------------------------------------------------

export function issuePass(env, device, district, days = vocab.passDays) {
	const payload = Buffer.from(JSON.stringify({ d: district, k: deviceKey(env, device), e: Date.now() + days * 86400000 })).toString('base64url');
	return `${payload}.${mac(env, 'pass', payload).toString('base64url')}`;
}

export function readPass(env, pass, device) {
	const [payload, signature, extra] = String(pass ?? '').split('.');
	const refuse = (message) => { throw new HttpError(401, message, 'pass'); };
	if (!payload || !signature || extra !== undefined) refuse('Check where you are first - it takes a second.');
	const expected = mac(env, 'pass', payload);
	const given = Buffer.from(signature, 'base64url');
	if (given.length !== expected.length || !timingSafeEqual(given, expected)) refuse('That location check did not hold up. Check where you are again.');
	let data;
	try { data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch { refuse('That location check did not hold up. Check where you are again.'); }
	if (!(data.e > Date.now())) refuse('Your location check has run out. Check where you are again.');
	if (data.k !== deviceKey(env, device)) refuse('That location check belongs to another browser. Check where you are again.');
	if (!DISTRICT_IDS.has(data.d)) refuse('Check where you are again.');
	return { district: data.d, expires: new Date(data.e).toISOString() };
}

// --- settings, limits -------------------------------------------------------------------------

async function pulseSettings(store) {
	return (await settingsOf(store)).pulse || {};
}

/** How many questions may be open at once: the admin's number, or the default. */
export async function liveCap(store) {
	const n = Number((await pulseSettings(store)).limits?.maxLive);
	return Number.isInteger(n) && n >= 1 && n <= 100 ? n : limits.maxLive;
}

/** The admin's choices about asking readers, over vocab's defaults. */
export function promptSettings(saved = {}) {
	const d = vocab.prompt;
	const within = (value, [lo, hi], fallback) => {
		const n = Number(value);
		return Number.isInteger(n) && n >= lo && n <= hi ? n : fallback;
	};
	return {
		on: typeof saved.on === 'boolean' ? saved.on : d.on,
		audience: d.audiences.some((a) => a.id === saved.audience) ? saved.audience : d.audience,
		delay: within(saved.delay, d.bounds.delay, d.delay),
		again: within(saved.again, d.bounds.again, d.again),
		perVisit: within(saved.perVisit, d.bounds.perVisit, d.perVisit),
		leave: typeof saved.leave === 'boolean' ? saved.leave : d.leave,
	};
}

// Places in Nairobi a connection's city may be named as. A guess at a
// connection is coarse: a phone network can place a whole county at its
// gateway, so the region code and the position are tried first.
const NAIROBI_TOWNS = /^(nairobi|westlands|kasarani|embakasi|karen|langata|lang'ata|kibera|kibra|eastleigh|ruaraka|dagoretti|kawangware|roysambu|ruai|utawala|kilimani|parklands|gigiri|runda|kileleshwa|lavington|donholm|buruburu|umoja|kayole|githurai|kahawa|mathare|makadara|starehe|south b|south c|madaraka)$/i;

/**
 * Whether a connection looks like it is in Nairobi, from Vercel's reading of
 * it: the region (ISO 3166-2 KE-30, Nairobi City County, sometimes reported
 * as the old province code 110), the city, or a position in or within 15km of
 * the county's outline - a connection's position is a town's centre, not a
 * phone's.
 */
export function looksLikeNairobi(geo = {}) {
	if (geo.country !== 'KE') return false;
	if (geo.region === '30' || geo.region === '110') return true;
	if (NAIROBI_TOWNS.test(String(geo.city || '').trim())) return true;
	const lat = Number(geo.lat);
	const lon = Number(geo.lon);
	return Number.isFinite(lat) && Number.isFinite(lon) && Boolean(geo.lat) && Boolean(locate(lat, lon, 15000));
}

async function refuseIfPaused(store) {
	const s = await pulseSettings(store);
	if (s.paused) throw new HttpError(503, s.message || 'Voting is paused for a short while. Results are still here.', 'paused');
}

// Location checks per connection per hour, counted the way lost and found
// counts its actions (lf_events, an hourly window, a daily-salted IP hash). A
// location check is the one step worth limiting: a vote needs a pass, and a
// pass needs one of these.
async function hourly(store, ip, action, perHour) {
	const since = new Date(Date.now() - 3600000).toISOString();
	const used = await store.count('lf_events', [['ip_hash', 'eq', ip], ['action', 'eq', action], ['created_at', 'gte', since]]);
	if (used >= perHour) throw new HttpError(429, 'A lot of location checks have come from your connection this hour. Try again a little later.', 'rate');
	await store.insert('lf_events', { action, ip_hash: ip });
}

// --- questions --------------------------------------------------------------------------------
//
// A handful of rows, read whole and kept for ten seconds by a warm function,
// so the page's every request does not cost a query. The admin's changes clear
// it in the instance that made them; elsewhere they show within ten seconds.

const QUESTIONS_TTL = 10000;
let questionCache = { at: 0, rows: null, name: null };

export async function allQuestions(store, { fresh = false } = {}) {
	if (!fresh && questionCache.name === store.name && Date.now() - questionCache.at < QUESTIONS_TTL) return questionCache.rows;
	const rows = await store.select('pulse_questions', { order: ['created_at', 'desc'] });
	questionCache = { at: Date.now(), rows, name: store.name };
	return rows;
}

export const forgetQuestions = () => { questionCache = { at: 0, rows: null, name: null }; };

/** Live until the admin closes it or its closing day has passed. */
export function statusOf(q, today = isoDay(0)) {
	if (q.status === 'live' && q.closes_at && q.closes_at < today) return 'closed';
	return q.status;
}

const PUBLIC_QUESTION = ['id', 'text', 'context', 'topic', 'kind', 'options', 'featured', 'opened_at', 'closes_at', 'closed_at'];

export function publicQuestion(q) {
	const out = Object.fromEntries(PUBLIC_QUESTION.map((k) => [k, q[k] ?? null]));
	out.ref = `P-${q.id.toUpperCase()}`;
	out.status = statusOf(q);
	out.options = (q.options || []).map((o) => (q.kind === 'scale' ? { id: o.id, label: o.label, value: o.value } : { id: o.id, label: o.label }));
	return out;
}

/**
 * The tally as the public may see it: every answer's count, and each
 * district's total - but a district's answers only once it has the minimum.
 */
export function publicResults(q, tally) {
	const min = vocab.minDistrictVotes;
	const t = tally || {};
	const districts = {};
	for (const id of DISTRICT_IDS) {
		const d = t.districts?.[id];
		const total = Math.max(0, d?.total || 0);
		if (!total) continue;
		districts[id] = total >= min
			? { total, counts: Object.fromEntries(q.options.map((o) => [o.id, Math.max(0, d[o.id] || 0)])) }
			: { total };
	}
	return {
		question: q.id,
		total: Math.max(0, t.total || 0),
		options: q.options.map((o) => ({ id: o.id, count: Math.max(0, t.options?.[o.id] || 0) })),
		districts,
		min,
		updated_at: t.updated_at || null,
	};
}

// One question by id, kept ten seconds by a warm function: a vote and a
// results read each need it, and it changes only when the admin changes it.
const QUESTION_TTL = 10000;
const oneCache = new Map();

async function findQuestion(store, id) {
	const clean = String(id ?? '').toLowerCase();
	if (!/^[a-z0-9]{4,12}$/.test(clean)) throw new HttpError(404, 'No such question.', 'missing');
	const key = `${store.name}|${clean}`;
	const cached = oneCache.get(key);
	let q = cached && Date.now() - cached.at < QUESTION_TTL ? cached.q : null;
	if (!q) {
		q = await store.get('pulse_questions', clean);
		oneCache.set(key, { at: Date.now(), q });
	}
	if (!q || q.status === 'draft') throw new HttpError(404, 'No such question.', 'missing');
	return q;
}

// --- the public index ---------------------------------------------------------------------
//
// What the page lists: every live question, featured first, and the latest
// closed ones with their final counts. Written whenever the admin changes a
// question, so the page reads one document instead of the collection.

const INDEX_TTL = 10000;
let indexCache = { at: 0, value: null, name: null };

export async function rebuildIndex(store, rows = null) {
	rows = (rows || await allQuestions(store, { fresh: true })).filter((q) => q.status !== 'draft');
	const live = rows.filter((q) => q.status === 'live')
		.sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0) || String(b.opened_at).localeCompare(String(a.opened_at)));
	const closed = rows.filter((q) => q.status === 'closed')
		.sort((a, b) => String(b.closed_at || '').localeCompare(String(a.closed_at || '')))
		.slice(0, 24);
	const value = {
		live: live.map((q) => ({ ...publicQuestion(q), status: q.status })),
		closed: closed.map((q) => ({ ...publicQuestion(q), status: q.status, final: q.final || null })),
		updated_at: new Date().toISOString(),
	};
	await store.write([{ table: 'pulse_meta', id: 'index', set: value }]);
	indexCache = { at: Date.now(), value, name: store.name };
	oneCache.clear();
	return value;
}

async function publicIndex(store) {
	if (indexCache.name === store.name && Date.now() - indexCache.at < INDEX_TTL) return indexCache.value;
	// The first read after a deploy that has never written one builds it.
	const value = (await store.get('pulse_meta', 'index')) || await rebuildIndex(store);
	indexCache = { at: Date.now(), value, name: store.name };
	return value;
}

export const forgetIndex = () => { indexCache = { at: 0, value: null, name: null }; oneCache.clear(); };

// --- the vote -------------------------------------------------------------------------------------

/**
 * The counters a vote moves: one in for where it goes, and - for a changed
 * vote - one out of where it was. Keys are dotted paths into the tally.
 */
export function tallyChange(before, after) {
	const add = {};
	const bump = (key, n) => { add[key] = (add[key] || 0) + n; };
	if (before) {
		bump('total', -1);
		bump(`options.${before.option}`, -1);
		bump(`districts.${before.district}.${before.option}`, -1);
		bump(`districts.${before.district}.total`, -1);
	}
	bump('total', 1);
	bump(`options.${after.option}`, 1);
	bump(`districts.${after.district}.${after.option}`, 1);
	bump(`districts.${after.district}.total`, 1);
	for (const key of Object.keys(add)) if (!add[key]) delete add[key];
	return add;
}

async function castVote(store, env, { question, option, district, device }) {
	const id = voteId(env, question.id, device);
	for (let attempt = 0; attempt < 4; attempt++) {
		const before = await store.get('pulse_votes', id);
		if (before && before.option === option && before.district === district) return { unchanged: true };
		if (before && (before.changes || 0) >= limits.maxChanges) {
			throw new HttpError(429, 'You have changed this vote as many times as a vote can be changed.', 'changes');
		}
		const now = new Date().toISOString();
		try {
			await store.write([
				{
					table: 'pulse_votes',
					id,
					set: {
						question_id: question.id,
						option,
						district,
						created_at: before?.created_at || now,
						updated_at: now,
						changes: before ? (before.changes || 0) + 1 : 0,
					},
					expect: before ? before._version : 'missing',
				},
				{ table: 'pulse_tallies', id: question.id, add: tallyChange(before, { option, district }), merge: { question_id: question.id, updated_at: now } },
				// A changed vote leaves the count of votes where it was.
				...(before ? [] : [{ table: 'pulse_meta', id: 'totals', add: { [`counts.${question.id}`]: 1 }, merge: { updated_at: now } }]),
			]);
			return { changed: Boolean(before) };
		} catch (error) {
			// Two taps at once from the same device: read again and decide again.
			if (!error.conflict) throw error;
		}
	}
	throw new HttpError(409, 'Your vote crossed with another one. Try again.', 'busy');
}

// --- the routes -----------------------------------------------------------------------------------

export const routes = {
	// Every live question, and the recently closed ones, each with its total.
	// Public, and cached at the edge for twenty seconds (see pulse.mjs).
	async questions({ store }) {
		const settings = await pulseSettings(store);
		const [index, totals] = await Promise.all([publicIndex(store), store.get('pulse_meta', 'totals')]);
		const counts = totals?.counts || {};
		const count = (q) => Math.max(0, counts[q.id] || 0);
		// A question whose closing day has passed reads as closed at once; the
		// daily job writes its final count onto it the next morning.
		const today = isoDay(0);
		const all = [...index.live, ...index.closed];
		const live = all.filter((q) => statusOf(q, today) === 'live');
		const closed = all.filter((q) => statusOf(q, today) === 'closed');
		return {
			paused: settings.paused ? (settings.message || 'Voting is paused for a short while.') : null,
			// Whether readers are being asked on other pages: a browser that was
			// told yes some hours ago stops when this says no.
			asking: promptSettings(settings.prompt).on,
			live: live.map((q) => ({ ...q, status: 'live', total: count(q) })),
			closed: closed.map((q) => {
				const final = q.final || { total: count(q) };
				return { ...q, status: 'closed', total: final.total, final };
			}),
			min: vocab.minDistrictVotes,
		};
	},

	// Whether to ask this reader on other pages, and how. Private: the answer
	// depends on the connection, so no cache may keep it for anyone else.
	async where({ store, geo }) {
		const settings = await pulseSettings(store);
		const prompt = promptSettings(settings.prompt);
		const place = looksLikeNairobi(geo) ? 'nairobi' : geo?.country === 'KE' ? 'kenya' : 'elsewhere';
		const audience = { nairobi: ['nairobi'], kenya: ['nairobi', 'kenya'], everyone: ['nairobi', 'kenya', 'elsewhere'] }[prompt.audience];
		return {
			ask: prompt.on && !settings.paused && audience.includes(place),
			place,
			delay: prompt.delay,
			again: prompt.again,
			perVisit: prompt.perVisit,
			leave: prompt.leave,
		};
	},

	async results({ store, query }) {
		const q = await findQuestion(store, query.q);
		return { question: publicQuestion(q), results: publicResults(q, await store.get('pulse_tallies', q.id)) };
	},

	// A location check: the position once, the district back, signed.
	async pass({ store, body, env, ip, country }) {
		await refuseIfPaused(store);
		if (body.website) fail('Something went wrong.'); // the honeypot
		const device = deviceOf(body.device);
		// Vercel reads the connection's country. Off Vercel - a laptop, the
		// checks - there is no such header, and nothing to check it against.
		if (env.VERCEL && country && country !== 'KE') {
			throw new HttpError(403, 'Your connection looks like it is coming from outside Kenya. If you use a VPN, turn it off and try again.', 'country');
		}
		const lat = Number(body.lat);
		const lon = Number(body.lon);
		if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) fail('Your browser did not send a position.', 'position');
		const accuracy = Number(body.accuracy);
		if (Number.isFinite(accuracy) && accuracy > vocab.maxAccuracyMetres) {
			throw new HttpError(422, 'Your device could only guess roughly where it is. Turn on location, or try on your phone, and check again.', 'accuracy');
		}
		const s = await pulseSettings(store);
		const perHour = Number(s.limits?.passesPerHour) > 0 ? Number(s.limits.passesPerHour) : limits.passesPerHour;
		await hourly(store, ip, 'pulse-pass', perHour);
		// Three decimal places is about a hundred metres: plenty to find a
		// district, and all the position this function ever looks at.
		const place = locate(Math.round(lat * 1000) / 1000, Math.round(lon * 1000) / 1000, vocab.edgeMetres);
		if (!place) {
			throw new HttpError(403, 'You seem to be outside Nairobi. Only people in Nairobi can vote - but the results are open to everyone.', 'outside');
		}
		const pass = issuePass(env, device, place.id);
		return {
			pass,
			district: { id: place.id, name: place.name },
			expires: new Date(Date.now() + vocab.passDays * 86400000).toISOString(),
		};
	},

	async vote({ store, body, env }) {
		await refuseIfPaused(store);
		if (body.website) fail('Something went wrong.');
		const device = deviceOf(body.device);
		const { district } = readPass(env, body.pass, device);
		const question = await findQuestion(store, body.question);
		if (statusOf(question) !== 'live') throw new HttpError(409, 'Voting on this question has closed. The results are final.', 'closed');
		const option = question.options.find((o) => o.id === body.option)?.id || fail('Pick one of the answers.', 'option');
		const outcome = await castVote(store, env, { question, option, district, device });
		const tally = await store.get('pulse_tallies', question.id);
		return {
			ok: true,
			...outcome,
			vote: { option, district, district_name: districtName(district) },
			results: publicResults(question, tally),
		};
	},

	// The daily job, run by Vercel Cron. A question past its closing day is
	// closed for good, with its final count written onto it; thirty days after
	// a question closes its individual votes are deleted. The tally stays: it
	// holds counts, not people.
	async purge({ store, env, authorization }) {
		if (!env.CRON_SECRET || authorization !== `Bearer ${env.CRON_SECRET}`) throw new HttpError(401, 'Not for you.', 'auth');
		const rows = await allQuestions(store, { fresh: true });
		let settled = 0;
		for (const q of rows) {
			if (q.status === 'live' && statusOf(q) === 'closed') {
				await closeQuestion(store, q, `${q.closes_at}T23:59:59.000Z`);
				settled++;
			}
		}
		const cutoff = new Date(Date.now() - vocab.keepVotesDays * 86400000).toISOString();
		const old = (await allQuestions(store, { fresh: true })).filter((q) => q.status === 'closed' && q.closed_at && q.closed_at < cutoff && !q.votes_deleted);
		let deleted = 0;
		for (const q of old) {
			deleted += await store.remove('pulse_votes', [['question_id', 'eq', q.id]]);
			await store.update('pulse_questions', [['id', 'eq', q.id]], { votes_deleted: true });
		}
		forgetQuestions();
		if (settled) await rebuildIndex(store);
		return { ok: true, settled, deleted };
	},
};

/** Close a question, writing its final count onto it for the archive. */
export async function closeQuestion(store, q, at = new Date().toISOString()) {
	const tally = await store.get('pulse_tallies', q.id);
	const results = publicResults(q, tally);
	const final = { total: results.total, options: Object.fromEntries(results.options.map((o) => [o.id, o.count])) };
	await store.update('pulse_questions', [['id', 'eq', q.id]], { status: 'closed', closed_at: at, final, updated_at: new Date().toISOString() });
	forgetQuestions();
	return final;
}

// --- for the admin -------------------------------------------------------------------------------

const ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz';
export const newQuestionId = () => Array.from(randomBytes(6), (b) => ALPHABET[b % ALPHABET.length]).join('');

export const rules = { fail, isoDay, TOPICS, DISTRICT_IDS, limits };
