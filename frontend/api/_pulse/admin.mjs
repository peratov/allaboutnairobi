// Nairobi Pulse, for the admin: writing questions, opening and closing them, and
// reading every count behind the public map. Merged into ../_admin/routes.mjs,
// so every route here runs only after requireOwner() has said yes.
//
// Two rules the public page relies on are kept here.
//
// - A question's answers cannot change shape once anyone has voted. Their
//   wording can be corrected - a typo is not a reason to throw votes away -
//   but adding, removing or reordering answers would move votes onto answers
//   nobody chose. To ask something different, close it and ask again.
// - Deleting a question deletes its votes and its tally for good, and needs its
//   reference typed to confirm. Closing is almost always what is wanted.
//
// The admin sees every district's counts, including those under the public
// threshold: no vote is tied to a person, and checking that a question is not
// being flooded from one district is part of the job.
//
// The bank (bank.mjs) is a hundred questions with a switch each. On writes the
// entry as a live question, or opens the one already written from it; off
// closes it - or, if nobody has voted yet, puts it back to a draft, so a
// question switched on by mistake leaves nothing behind in the archive. A
// question remembers its entry by `bank_key`, so one entry is never two
// questions at once.
//
// Every change rebuilds the public index (handlers.mjs), which is all /pulse
// reads to list the questions.

import { HttpError } from '../_lostfound/http.mjs';
import { OWNER_EMAIL } from '../_admin/owner.mjs';
import { districtIds, districtName } from './geo.mjs';
import { OPTION_IDS, allQuestions, bank, closeQuestion, forgetQuestions, liveCap, newQuestionId, promptSettings, publicQuestion, publicResults, rebuildIndex, rules, statusOf, vocab } from './handlers.mjs';
import { settingsOf } from '../_lostfound/handlers.mjs';

const { fail, isoDay, TOPICS, limits } = rules;
const nowIso = () => new Date().toISOString();

const log = (store, action, target, note = '') =>
	store.insert('lf_admin_log', { action, target, note: String(note).slice(0, 300), by: OWNER_EMAIL });

function clean(value, { max, label, required }) {
	const text = String(value ?? '').replace(/\s+/g, ' ').trim();
	if (required && !text) fail(`${label} is missing.`);
	if (text.length > max) fail(`${label} is too long - keep it under ${max} characters.`);
	if (/[^\s@]+@[^\s@]+\.[a-z]{2,}/i.test(text) || /(https?:\/\/|www\.)/i.test(text)) fail(`${label} cannot carry a link or an email address.`);
	return text;
}

/** A question as typed in the admin, checked and shaped for storage. */
function validQuestion(input, existing) {
	const text = clean(input.text, { max: limits.questionMax, label: 'The question', required: true });
	if (text.length < 8) fail('Write the whole question.');
	const context = clean(input.context, { max: limits.contextMax, label: 'The note under it' });
	const topic = TOPICS.has(input.topic) ? input.topic : fail('Pick a topic.');
	const kind = input.kind === 'scale' ? 'scale' : input.kind === 'choice' ? 'choice' : fail('Pick what kind of answers it has.');
	const given = (Array.isArray(input.options) ? input.options : [])
		.map((o) => ({ label: clean(o?.label, { max: limits.optionMax, label: 'An answer' }), value: o?.value }))
		.filter((o) => o.label);
	if (given.length < limits.minOptions) fail(`Give at least ${limits.minOptions} answers.`);
	if (given.length > limits.maxOptions) fail(`Give at most ${limits.maxOptions} answers.`);
	const labels = given.map((o) => o.label.toLowerCase());
	if (new Set(labels).size !== labels.length) fail('Two answers say the same thing.');
	if (kind === 'scale') {
		const values = given.map((o) => Number(o.value));
		if (values.some((v) => !Number.isInteger(v) || v < -3 || v > 3)) fail('Every answer on a scale needs a whole number from -3 to 3.');
		if (new Set(values).size !== values.length) fail('Two answers on the scale have the same number.');
		if (!values.some((v) => v > 0) || !values.some((v) => v < 0)) fail('A scale needs a good end and a bad end - some answers above zero and some below.');
	}
	const options = given.map((o, i) => (kind === 'scale' ? { id: OPTION_IDS[i], label: o.label, value: Number(o.value) } : { id: OPTION_IDS[i], label: o.label }));
	const closes_at = String(input.closes_at || '');
	if (closes_at && !/^\d{4}-\d{2}-\d{2}$/.test(closes_at)) fail('Pick the closing day from the calendar.');

	if (existing && existing.votes > 0) {
		// Votes are counted against answer ids. Wording may change; shape may not.
		const before = existing.options || [];
		if (kind !== existing.kind || options.length !== before.length || options.some((o, i) => o.value !== before[i].value)) {
			fail('People have voted on this, so its answers can be reworded but not added, removed or reordered. Close it and ask a new question instead.', 'locked');
		}
	}
	return { text, context, topic, kind, options, closes_at, featured: Boolean(input.featured) };
}

async function questionById(store, id) {
	const q = (await allQuestions(store, { fresh: true })).find((row) => row.id === String(id || ''));
	if (!q) throw new HttpError(404, 'No such question.', 'missing');
	return q;
}

const coverage = (tally) => {
	const counts = districtIds().map((id) => Math.max(0, tally?.districts?.[id]?.total || 0));
	return { voting: counts.filter((n) => n > 0).length, shown: counts.filter((n) => n >= vocab.minDistrictVotes).length };
};

function adminView(q, tally, votes = tally?.total) {
	return {
		...publicQuestion(q),
		raw_status: q.status,
		bank_key: q.bank_key || null,
		created_at: q.created_at,
		updated_at: q.updated_at || q.created_at,
		final: q.final || null,
		votes_deleted: Boolean(q.votes_deleted),
		votes: Math.max(0, votes || 0),
		// Undefined when the tally was not read: the list reads only open questions' tallies.
		coverage: tally === undefined ? null : coverage(tally),
	};
}

// What the admin's editor needs to offer, from the same vocabulary the
// function enforces.
const editorVocab = () => ({
	topics: vocab.topics,
	presets: vocab.presets,
	limits: vocab.limits,
	min: vocab.minDistrictVotes,
});

// --- the bank -------------------------------------------------------------------------------------

/** A bank entry as the editor's input, so it passes the same checks as one typed in. */
export function fromBank(entry) {
	const preset = vocab.presets.find((p) => p.id === entry.preset);
	if (!preset) fail(`The bank entry ${entry.key} names no preset.`);
	return {
		text: entry.text,
		context: entry.context || '',
		topic: entry.topic,
		kind: preset.kind,
		options: entry.options ? entry.options.map((label) => ({ label })) : preset.options,
		closes_at: '',
		featured: false,
	};
}

export { validQuestion };

const sameText = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

/**
 * The question an entry is now: the open one if there is one, else a draft,
 * else the latest closed. A question written by hand with the entry's exact
 * words counts too, so switching the entry on does not ask it twice.
 */
function questionFor(entry, rows, today = isoDay(0)) {
	const mine = rows.filter((q) => q.bank_key === entry.key || (!q.bank_key && sameText(q.text, entry.text)));
	const rank = (q) => ({ live: 0, draft: 1, closed: 2 }[statusOf(q, today)] ?? 3);
	return mine.sort((a, b) => rank(a) - rank(b) || String(b.updated_at || b.created_at).localeCompare(String(a.updated_at || a.created_at)))[0] || null;
}

async function pulseSettingsView(store) {
	const s = (await settingsOf(store)).pulse || {};
	return {
		paused: Boolean(s.paused),
		message: s.message || '',
		limits: s.limits || {},
		cap: await liveCap(store),
		prompt: promptSettings(s.prompt),
		defaults: { maxLive: limits.maxLive, passesPerHour: limits.passesPerHour, prompt: vocab.prompt },
	};
}

/**
 * Everything the Pulse view draws, from rows already read: one more read for
 * every question's count, and a tally each for the open ones, for how many
 * districts they fill. A closed question's count is on it.
 */
async function listing(store, rows) {
	const today = isoDay(0);
	const totals = (await store.get('pulse_meta', 'totals'))?.counts || {};
	const live = rows.filter((q) => statusOf(q, today) === 'live');
	const tallies = new Map(await Promise.all(live.map(async (q) => [q.id, await store.get('pulse_tallies', q.id)])));
	const votesOf = (q) => (tallies.has(q.id) ? tallies.get(q.id)?.total : q.final?.total ?? totals[q.id]) || 0;
	const order = { live: 0, draft: 1, closed: 2 };
	const questions = rows.map((q) => adminView(q, tallies.get(q.id), votesOf(q)))
		.sort((a, b) => order[a.status] - order[b.status] || String(b.updated_at).localeCompare(String(a.updated_at)));
	const byId = new Map(questions.map((q) => [q.id, q]));
	const entries = bank.map((entry) => {
		const q = questionFor(entry, rows, today);
		const view = q && byId.get(q.id);
		return {
			key: entry.key,
			topic: entry.topic,
			text: entry.text,
			context: entry.context || '',
			preset: entry.preset,
			options: entry.options || null,
			on: view?.status === 'live',
			status: view?.status || null,
			id: view?.id || null,
			ref: view?.ref || null,
			votes: view?.votes || 0,
		};
	});
	return {
		questions,
		bank: entries,
		settings: await pulseSettingsView(store),
		vocab: editorVocab(),
	};
}

/**
 * The switch. On: write the entry as a live question, or open the draft or
 * closed one already written from it. Off: close it - or back to a draft if
 * nobody has voted. Takes a bank `key`, or the `id` of any question.
 */
async function toggle(store, body) {
	const on = body.on === true;
	const rows = await allQuestions(store, { fresh: true });
	const today = isoDay(0);
	const now = nowIso();
	let entry = null;
	let q;
	if (body.key) {
		entry = bank.find((b) => b.key === body.key);
		if (!entry) throw new HttpError(404, 'No such question in the bank.', 'missing');
		q = questionFor(entry, rows, today);
	} else {
		q = rows.find((row) => row.id === String(body.id || ''));
		if (!q) throw new HttpError(404, 'No such question.', 'missing');
		entry = q.bank_key ? bank.find((b) => b.key === q.bank_key) || null : null;
	}
	const status = q ? statusOf(q, today) : null;
	let action = null;
	let patch = null;

	if (on && status !== 'live') {
		const live = rows.filter((row) => statusOf(row, today) === 'live').length;
		const cap = await liveCap(store);
		if (live >= cap) fail(`${live} questions are open, which is the limit. Switch one off first, or raise the limit at the top of this page.`, 'full');
		// A past closing day would close it again at once: switching on clears it.
		const reopenDay = q?.closes_at && q.closes_at < today ? { closes_at: '' } : {};
		if (!q || (status === 'closed' && q.votes_deleted)) {
			// Never asked, or asked so long ago its votes are gone: a new question.
			if (!entry) fail('Its votes have been deleted, so it cannot take more. Write it as a new question instead.');
			const value = validQuestion(fromBank(entry));
			const ids = new Set(rows.map((row) => row.id));
			let id = newQuestionId();
			while (ids.has(id)) id = newQuestionId();
			q = await store.insert('pulse_questions', { id, ...value, bank_key: entry.key, status: 'live', opened_at: now, closed_at: null, updated_at: now });
			rows.unshift(q);
			action = 'on';
		} else if (status === 'draft') {
			patch = { status: 'live', opened_at: q.opened_at || now, ...reopenDay };
			action = 'open';
		} else {
			patch = { status: 'live', closed_at: null, final: null, ...reopenDay };
			action = 'reopen';
		}
	} else if (!on && status === 'live') {
		const votes = Math.max(0, (await store.get('pulse_tallies', q.id))?.total || 0);
		if (votes) {
			const final = await closeQuestion(store, q, now);
			Object.assign(q, { status: 'closed', closed_at: now, final, updated_at: now });
			action = 'close';
		} else {
			// Nobody voted, so nothing to keep: back where it was before it opened.
			patch = { status: 'draft', opened_at: null };
			action = 'off';
		}
	}
	if (patch) {
		patch.updated_at = now;
		await store.update('pulse_questions', [['id', 'eq', q.id]], patch);
		Object.assign(q, patch);
	}
	if (action) {
		forgetQuestions();
		await rebuildIndex(store, rows);
		await log(store, `pulse.${action}`, q.id, q.text);
	}
	return { ...(await listing(store, rows)), toggled: { key: entry?.key || null, id: q?.id || null, action } };
}

export const pulseRoutes = {
	async pulseList({ store }) {
		return listing(store, await allQuestions(store, { fresh: true }));
	},

	async pulseQuestion({ store, query }) {
		const q = await questionById(store, query.id);
		const tally = await store.get('pulse_tallies', q.id);
		// Every district, under the threshold too, for the admin's eyes.
		const districts = districtIds().map((id) => {
			const d = tally?.districts?.[id] || {};
			return {
				id,
				name: districtName(id),
				total: Math.max(0, d.total || 0),
				counts: Object.fromEntries(q.options.map((o) => [o.id, Math.max(0, d[o.id] || 0)])),
			};
		}).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
		// Votes by the day they were first cast, from the votes themselves.
		const votes = await store.select('pulse_votes', { filters: [['question_id', 'eq', q.id]] });
		const byDay = new Map();
		let changed = 0;
		for (const v of votes) {
			const day = String(v.created_at).slice(0, 10);
			byDay.set(day, (byDay.get(day) || 0) + 1);
			if (v.changes) changed++;
		}
		return {
			question: { ...adminView(q, tally), raw: { text: q.text, context: q.context, topic: q.topic, kind: q.kind, options: q.options, closes_at: q.closes_at || '', featured: Boolean(q.featured) } },
			results: publicResults(q, tally),
			districts,
			days: [...byDay].sort(([a], [b]) => a.localeCompare(b)).map(([date, n]) => ({ date, votes: n })),
			stored_votes: votes.length,
			changed,
			votes_deleted: Boolean(q.votes_deleted),
			vocab: editorVocab(),
		};
	},

	async pulseAction({ store, body }) {
		const action = String(body.action || '');
		const now = nowIso();
		let q = null;
		let note = '';

		if (action === 'toggle') return toggle(store, body);

		if (action === 'create') {
			const value = validQuestion(body.question || {});
			const ids = new Set((await allQuestions(store, { fresh: true })).map((row) => row.id));
			let id = newQuestionId();
			while (ids.has(id)) id = newQuestionId();
			const live = body.status === 'live';
			if (live) await roomForAnother(store);
			if (live && value.closes_at && value.closes_at < isoDay(0)) fail('The closing day has already passed.');
			// Written from a bank entry: remembered, so its switch finds it.
			const entry = bank.find((b) => b.key === body.bank_key);
			q = await store.insert('pulse_questions', { id, ...value, ...(entry ? { bank_key: entry.key } : {}), status: live ? 'live' : 'draft', opened_at: live ? now : null, closed_at: null, updated_at: now });
			note = value.text;
		} else {
			q = await questionById(store, body.id);
			const tally = await store.get('pulse_tallies', q.id);
			const votes = Math.max(0, tally?.total || 0);
			const status = statusOf(q);
			const patch = { updated_at: now };

			if (action === 'update') {
				Object.assign(patch, validQuestion(body.question || {}, { ...q, votes }));
				if (status === 'live' && patch.closes_at && patch.closes_at < isoDay(0)) fail('The closing day has already passed. Close the question instead.');
				// Kept answers keep their ids; with votes the shape is unchanged, so
				// the ids line up one for one.
				note = patch.text;
			} else if (action === 'open') {
				if (status !== 'draft') fail('Only a draft can be opened.');
				await roomForAnother(store);
				if (q.closes_at && q.closes_at < isoDay(0)) fail('Its closing day has passed. Change the date first.');
				Object.assign(patch, { status: 'live', opened_at: q.opened_at || now });
			} else if (action === 'close') {
				if (status !== 'live' && q.status !== 'live') fail('Only a live question can be closed.');
				const final = await closeQuestion(store, q, now);
				await rebuildIndex(store);
				await log(store, 'pulse.close', q.id, `${q.text} - ${final.total} votes`);
				return pulseRoutes.pulseQuestion({ store, query: { id: q.id } });
			} else if (action === 'reopen') {
				if (q.status !== 'closed' && status !== 'closed') fail('Only a closed question can be reopened.');
				await roomForAnother(store);
				Object.assign(patch, { status: 'live', closed_at: null, final: null });
				if (q.closes_at && q.closes_at < isoDay(0)) patch.closes_at = '';
				if (q.votes_deleted) fail('Its votes have been deleted, so it cannot take more: the count would start again from the tally alone.');
			} else if (action === 'feature') {
				patch.featured = Boolean(body.featured);
				note = patch.featured ? 'featured' : 'not featured';
			} else if (action === 'recount') {
				// The tally rebuilt from the votes. It only ever disagrees if a
				// commit was lost somewhere; this says by how much.
				if (q.votes_deleted) fail('Its votes have been deleted - the tally is all there is now.');
				const rows = await store.select('pulse_votes', { filters: [['question_id', 'eq', q.id]] });
				const fresh = { question_id: q.id, total: 0, options: {}, districts: {}, updated_at: now };
				for (const v of rows) {
					fresh.total++;
					fresh.options[v.option] = (fresh.options[v.option] || 0) + 1;
					const d = (fresh.districts[v.district] ||= { total: 0 });
					d.total++;
					d[v.option] = (d[v.option] || 0) + 1;
				}
				// The page's count of votes moves by the same difference.
				const counted = Math.max(0, (await store.get('pulse_meta', 'totals'))?.counts?.[q.id] || 0);
				await store.write([
					{ table: 'pulse_tallies', id: q.id, set: fresh },
					...(fresh.total !== counted ? [{ table: 'pulse_meta', id: 'totals', add: { [`counts.${q.id}`]: fresh.total - counted }, merge: { updated_at: now } }] : []),
				]);
				await log(store, 'pulse.recount', q.id, `${votes} counted, ${fresh.total} found`);
				return { ...(await pulseRoutes.pulseQuestion({ store, query: { id: q.id } })), recount: { before: votes, after: fresh.total } };
			} else if (action === 'delete') {
				if (String(body.confirm || '').trim().toUpperCase() !== `P-${q.id.toUpperCase()}`) fail(`Type P-${q.id.toUpperCase()} to confirm.`);
				const removed = await store.remove('pulse_votes', [['question_id', 'eq', q.id]]);
				const counted = Math.max(0, (await store.get('pulse_meta', 'totals'))?.counts?.[q.id] || 0);
				await store.write([
					{ table: 'pulse_tallies', id: q.id, remove: true },
					...(counted ? [{ table: 'pulse_meta', id: 'totals', add: { [`counts.${q.id}`]: -counted }, merge: { updated_at: now } }] : []),
				]);
				await store.remove('pulse_questions', [['id', 'eq', q.id]]);
				forgetQuestions();
				await rebuildIndex(store);
				await log(store, 'pulse.delete', q.id, `${q.text} - ${removed} votes deleted`);
				return { ok: true, deleted: q.id };
			} else {
				fail('Unknown action.');
			}
			await store.update('pulse_questions', [['id', 'eq', q.id]], patch);
		}
		forgetQuestions();
		await rebuildIndex(store);
		await log(store, `pulse.${action}`, q.id, note || q.text);
		return pulseRoutes.pulseQuestion({ store, query: { id: q.id } });
	},
};

// Too many live questions and none of them gets enough votes in any district
// to show on the map. The admin sets how many is too many (the top of the
// Pulse view, or Settings); the default is vocab's.
async function roomForAnother(store) {
	const live = (await allQuestions(store, { fresh: true })).filter((row) => statusOf(row) === 'live').length;
	const cap = await liveCap(store);
	if (live >= cap) fail(`${live} questions are open, which is the limit. Close one first, or raise the limit - but spread too thin, none of them fills the map.`, 'full');
}
