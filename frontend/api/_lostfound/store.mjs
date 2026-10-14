// Storage for lost and found, behind one small interface with two backends.
//
//   Firestore  production. Google Cloud Firestore through its REST API, with a
//              service account, from the server only. No SDK: fetch and
//              node:crypto are enough, and the function then has no
//              dependencies to install or keep patched.
//   File       local development and tests. A JSON file, the same semantics,
//              so the whole system can be driven end to end on a laptop
//              without a database or a network.
//
// Which one runs is decided by the environment: FIRESTORE_CREDENTIALS (a
// service account key) means Firestore; FIRESTORE_EMULATOR_HOST with
// FIRESTORE_PROJECT means a Firestore emulator; LOSTFOUND_FILE means the file;
// none of them means "not configured", and the API says so rather than
// pretending.
//
// Filters are a list of [column, op, value]. Ops: eq, neq, gt, gte, lt, lte,
// in (an array), and words (value is { columns, words }: every word must
// appear in at least one of the columns, case-insensitively).
//
// remove() deletes for good, and only the admin calls it: everything else in
// the system closes, hides or blanks rather than deleting.
//
// Two more for Nairobi Pulse, which keeps running totals that must never drift
// from the votes behind them:
//
//   get(table, id)  one row by its id, or null - a single document read, not
//                   a query. The row carries `_version`, which changes on
//                   every write.
//   write(ops)      several writes that land together or not at all. Each op
//                   names a table and an id, and is one of:
//                     { set: row, expect }  replace the row. `expect` is
//                                           'missing' (it must not exist yet)
//                                           or a `_version` (it must not have
//                                           changed since it was read).
//                     { add: { 'a.b': 1 }, merge: {...} }
//                                           add to counters, nested by dots,
//                                           creating the row and the counters
//                                           as needed, and set `merge`'s fields.
//                     { remove: true }      delete it.
//                   A failed `expect` throws an error with `conflict: true`,
//                   and nothing is written.

import { randomUUID } from 'node:crypto';
import { SCOPES, accessToken, parseCredentials } from './google.mjs';
import { promises as fs } from 'node:fs';

const DEFAULTS = {
	lf_places: () => ({ status: 'pending', portal_token_hash: null }),
	lf_items: () => ({ status: 'open', flags: 0, place_id: null }),
	lf_claims: () => ({ status: 'new' }),
	lf_events: () => ({}),
	lf_admin_log: () => ({}),
	lf_settings: () => ({}),
	// Events organisers send in, waiting for the admin. See handlers.mjs.
	ev_submissions: () => ({ status: 'pending', decided_at: null }),
	// Nairobi Pulse. Votes and tallies are written with write(), under ids of
	// their own; see ../_pulse/handlers.mjs.
	pulse_questions: () => ({ status: 'draft', featured: false, final: null }),
	pulse_votes: () => ({}),
	pulse_tallies: () => ({}),
	pulse_meta: () => ({}),
	play_days: () => ({}),
	prompt_days: () => ({}),
	// The newsletter. Subscribers are written with write(), under a hash of the
	// address; see ../_news/handlers.mjs.
	nl_subscribers: () => ({}),
	nl_campaigns: () => ({}),
	nl_campaign_counts: () => ({}),
	nl_days: () => ({}),
};

export function configuredStore(env = process.env) {
	if (env.FIRESTORE_EMULATOR_HOST && env.FIRESTORE_PROJECT) {
		return firestoreStore({ projectId: env.FIRESTORE_PROJECT, database: env.FIRESTORE_DATABASE, emulatorHost: env.FIRESTORE_EMULATOR_HOST });
	}
	if (env.FIRESTORE_CREDENTIALS) {
		const credentials = parseCredentials(env.FIRESTORE_CREDENTIALS);
		return firestoreStore({ projectId: env.FIRESTORE_PROJECT || credentials.project_id, database: env.FIRESTORE_DATABASE, credentials });
	}
	if (env.LOSTFOUND_FILE) return fileStore(env.LOSTFOUND_FILE);
	return null;
}

// One file store per file, whoever asks. Every request calls configuredStore(),
// and a store per request meant a lock per request: two requests at once -
// two admin tabs sending the same issue - each read, wrote and renamed the
// same temp file, and one died with ENOENT or wrote over the other.
const fileStores = new Map();

// --- what both backends agree on ------------------------------------------------------

function test(row, [column, op, value]) {
	const field = row[column];
	switch (op) {
		case 'eq': return String(field) === String(value);
		case 'neq': return String(field) !== String(value);
		case 'gt': return field > value;
		case 'gte': return field >= value;
		case 'lt': return field < value;
		case 'lte': return field <= value;
		case 'in': return value.map(String).includes(String(field));
		case 'words': return value.words.every((word) =>
			value.columns.some((c) => String(row[c] || '').toLowerCase().includes(String(word).toLowerCase())));
		default: throw new Error(`Unknown op ${op}`);
	}
}

const matching = (rows, filters = []) => rows.filter((row) => filters.every((f) => test(row, f)));

function sortRows(rows, order) {
	if (!order) return rows;
	const [column, direction] = order;
	return rows.sort((a, b) => (a[column] > b[column] ? 1 : a[column] < b[column] ? -1 : 0) * (direction === 'desc' ? -1 : 1));
}

const fresh = (table, row) => ({ id: randomUUID(), created_at: new Date().toISOString(), ...DEFAULTS[table](), ...row });

const conflict = () => Object.assign(new Error('Someone else changed that first.'), { conflict: true });

// --- Firestore ------------------------------------------------------------------------
//
// One collection per table, one document per row, the row's id as the
// document id. Timestamps are stored as ISO strings, not Firestore
// timestamps, so they sort and compare exactly as they do in the file store.
//
// Firestore answers every query from an index, so this decides what to ask
// it and what to work out here:
//
//   - Every equality filter (eq, and in up to 30 values) goes to Firestore,
//     with the order and the limit. Equality on any mix of fields, ordered by
//     one field, is served by merging the two-field indexes in
//     firestore.indexes.json - (status, created_at), (kind, created_at) and
//     so on - so eight indexes cover every query the handlers make.
//   - A range on one field goes to Firestore only when nothing else does: the
//     purge's "older than thirty days", say.
//   - Everything else - the expiry check on live listings, the search words,
//     "not hidden" - is applied here, to batches read in order, until there
//     are enough rows. Expired listings are the oldest, so on the pages people
//     actually read that costs a batch, not the collection.
//
// If an index is ever missing, Firestore refuses the query with a link to
// create it. That is logged, and the query is retried with one equality
// filter, so the page still works while somebody clicks the link.

const MAX_SCAN = 5000;
const IN_MAX = 30;
const RANGE = { gt: 'GREATER_THAN', gte: 'GREATER_THAN_OR_EQUAL', lt: 'LESS_THAN', lte: 'LESS_THAN_OR_EQUAL' };

function encode(value) {
	if (value === null || value === undefined) return { nullValue: null };
	if (typeof value === 'boolean') return { booleanValue: value };
	if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
	if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
	if (typeof value === 'object') return { mapValue: { fields: encodeFields(value) } };
	return { stringValue: String(value) };
}

function encodeFields(row) {
	const fields = {};
	for (const [key, value] of Object.entries(row)) if (value !== undefined) fields[key] = encode(value);
	return fields;
}

function decode(value) {
	if ('stringValue' in value) return value.stringValue;
	if ('integerValue' in value) return Number(value.integerValue);
	if ('doubleValue' in value) return value.doubleValue;
	if ('booleanValue' in value) return value.booleanValue;
	if ('timestampValue' in value) return value.timestampValue;
	if ('arrayValue' in value) return (value.arrayValue.values || []).map(decode);
	if ('mapValue' in value) return decodeFields(value.mapValue.fields || {});
	return null;
}

function decodeFields(fields) {
	return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decode(value)]));
}

function firestoreStore({ projectId, database, credentials, emulatorHost }) {
	if (!projectId) throw new Error('No Firestore project: set FIRESTORE_PROJECT, or use a key that names one.');
	const root = emulatorHost ? `http://${emulatorHost}/v1` : 'https://firestore.googleapis.com/v1';
	const documents = `projects/${projectId}/databases/${database || '(default)'}/documents`;

	async function call(path, body, method = 'POST') {
		const token = emulatorHost ? 'owner' : await accessToken(credentials, SCOPES.datastore);
		const response = await fetch(`${root}/${path}`, {
			method,
			headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
			body: body ? JSON.stringify(body) : undefined,
		});
		if (method === 'GET' && response.status === 404) return null;
		if (!response.ok) {
			const text = await response.text().catch(() => '');
			let status = '';
			try {
				const parsed = JSON.parse(text);
				status = (Array.isArray(parsed) ? parsed[0] : parsed)?.error?.status || '';
			} catch { /* not JSON */ }
			throw Object.assign(new Error(`Firestore ${response.status}: ${text.slice(0, 400)}`), { status });
		}
		return response.json();
	}

	const fieldFilter = (column, op, value) => ({ fieldFilter: { field: { fieldPath: column }, op, value: encode(value) } });

	function where(filters) {
		const parts = filters.map(([column, op, value]) => {
			if (op === 'eq') return value === null ? { unaryFilter: { field: { fieldPath: column }, op: 'IS_NULL' } } : fieldFilter(column, 'EQUAL', value);
			if (op === 'in') return fieldFilter(column, 'IN', value);
			return fieldFilter(column, RANGE[op], value);
		});
		if (!parts.length) return undefined;
		return parts.length === 1 ? parts[0] : { compositeFilter: { op: 'AND', filters: parts } };
	}

	// Which filters Firestore is asked, which are checked here, and the order.
	function plan(filters, order) {
		const pushed = filters.filter(([, op, value]) => op === 'eq' || (op === 'in' && value.length <= IN_MAX));
		let rest = filters.filter((f) => !pushed.includes(f));
		const ranges = rest.filter(([, op]) => op in RANGE);
		const rangeFields = new Set(ranges.map(([column]) => column));
		let orderBy = order ? [[order[0], order[1] || 'asc']] : [];
		if (!pushed.length && rangeFields.size === 1 && (!order || order[0] === ranges[0][0])) {
			pushed.push(...ranges);
			rest = rest.filter((f) => !ranges.includes(f));
			if (!order) orderBy = [[ranges[0][0], 'asc']];
		}
		// The document name breaks ties, so a cursor never skips or repeats a row.
		orderBy.push(['__name__', orderBy[0]?.[1] || 'asc']);
		return { pushed, rest, orderBy };
	}

	const toOrder = (orderBy) => orderBy.map(([column, direction]) => ({
		field: { fieldPath: column }, direction: direction === 'desc' ? 'DESCENDING' : 'ASCENDING',
	}));

	function structured(table, pushed, orderBy) {
		const structuredQuery = { from: [{ collectionId: table }], orderBy: toOrder(orderBy) };
		const filter = where(pushed);
		if (filter) structuredQuery.where = filter;
		return structuredQuery;
	}

	async function run(table, { pushed, orderBy, limit, offset, after }) {
		const structuredQuery = structured(table, pushed, orderBy);
		if (limit) structuredQuery.limit = limit;
		if (offset) structuredQuery.offset = offset;
		if (after) {
			structuredQuery.startAt = {
				before: false,
				values: orderBy.map(([column]) => (column === '__name__' ? { referenceValue: after.name } : encode(after.row[column]))),
			};
		}
		const answer = await call(`${documents}:runQuery`, { structuredQuery });
		return answer.filter((part) => part.document).map(({ document }) => ({ name: document.name, row: decodeFields(document.fields || {}) }));
	}

	async function scan(table, { pushed, rest, orderBy, limit, offset }) {
		if (!rest.length) return (await run(table, { pushed, orderBy, limit, offset })).map((d) => d.row);
		const wanted = limit ? offset + limit : Infinity;
		const batch = Number.isFinite(wanted) ? Math.min(300, Math.max(50, wanted * 2)) : 300;
		const found = [];
		let after = null;
		for (let scanned = 0; scanned < MAX_SCAN;) {
			const docs = await run(table, { pushed, orderBy, limit: batch, after });
			scanned += docs.length;
			for (const doc of docs) if (rest.every((f) => test(doc.row, f))) found.push(doc.row);
			if (found.length >= wanted || docs.length < batch) break;
			after = docs[docs.length - 1];
		}
		return found.slice(offset, limit ? offset + limit : undefined);
	}

	async function find(table, { filters = [], order, limit, offset = 0 } = {}) {
		// More than thirty values for "in" is more than Firestore takes at once:
		// ask in thirties and put the answers back in order here.
		const big = filters.find(([, op, value]) => op === 'in' && value.length > IN_MAX);
		if (big) {
			const others = filters.filter((f) => f !== big);
			const parts = [];
			for (let i = 0; i < big[2].length; i += IN_MAX) {
				parts.push(...await find(table, { filters: [...others, [big[0], 'in', big[2].slice(i, i + IN_MAX)]], order }));
			}
			const rows = sortRows(parts, order).slice(offset);
			return limit ? rows.slice(0, limit) : rows;
		}

		const { pushed, rest, orderBy } = plan(filters, order);
		try {
			return await scan(table, { pushed, rest, orderBy, limit, offset });
		} catch (error) {
			const equalities = pushed.filter(([, op]) => op === 'eq' || op === 'in');
			if (error.status !== 'FAILED_PRECONDITION' || equalities.length < 2) throw error;
			console.warn('lost-found: Firestore wants an index for this query; answering it the slow way meanwhile.', error.message);
			const [first] = equalities;
			return scan(table, { pushed: [first], rest: filters.filter((f) => f !== first), orderBy, limit, offset });
		}
	}

	async function commit(writes) {
		for (let i = 0; i < writes.length; i += 500) await call(`${documents}:commit`, { writes: writes.slice(i, i + 500) });
	}

	// write()'s ops as Firestore writes. A counter's dotted path becomes a field
	// path of quoted segments, because district ids have hyphens in them.
	function toWrite({ table, id, set, expect, add, merge, remove }) {
		const name = `${documents}/${table}/${id}`;
		if (remove) return { delete: name };
		if (add) {
			const fields = merge || {};
			return {
				update: { name, fields: encodeFields(fields) },
				updateMask: { fieldPaths: Object.keys(fields).map(fieldPath) },
				updateTransforms: Object.entries(add).filter(([, n]) => n).map(([path, n]) => ({ fieldPath: fieldPath(path), increment: encode(n) })),
			};
		}
		const { _version, ...row } = set;
		const write = { update: { name, fields: encodeFields({ ...row, id }) } };
		if (expect === 'missing') write.currentDocument = { exists: false };
		else if (expect) write.currentDocument = { updateTime: expect };
		return write;
	}

	return {
		kind: 'firestore',
		// Stable across requests, so a cache can tell one database from another.
		name: `firestore:${documents}`,
		select: find,
		async count(table, filters = []) {
			const { pushed, rest, orderBy } = plan(filters);
			if (rest.length || filters.some(([, op, value]) => op === 'in' && value.length > IN_MAX)) {
				return (await find(table, { filters })).length;
			}
			const [answer] = await call(`${documents}:runAggregationQuery`, {
				structuredAggregationQuery: { structuredQuery: structured(table, pushed, orderBy), aggregations: [{ alias: 'n', count: {} }] },
			});
			return Number(answer?.result?.aggregateFields?.n?.integerValue || 0);
		},
		async insert(table, row) {
			const full = fresh(table, row);
			await commit([{
				update: { name: `${documents}/${table}/${full.id}`, fields: encodeFields(full) },
				currentDocument: { exists: false },
			}]);
			return full;
		},
		async update(table, filters, patch) {
			const rows = await find(table, { filters });
			// Only rows the patch would change are written: the daily purge matches
			// every old listing every day, and rewriting the ones it has already
			// blanked would cost a write each, for ever.
			const changed = rows.filter((row) => Object.entries(patch).some(([key, value]) => (row[key] ?? null) !== (value ?? null)));
			await commit(changed.map((row) => ({
				update: { name: `${documents}/${table}/${row.id}`, fields: encodeFields(patch) },
				updateMask: { fieldPaths: Object.keys(patch) },
				currentDocument: { exists: true },
			})));
			return rows.map((row) => Object.assign(row, patch));
		},
		async remove(table, filters) {
			const rows = await find(table, { filters });
			await commit(rows.map((row) => ({ delete: `${documents}/${table}/${row.id}` })));
			return rows.length;
		},
		async get(table, id) {
			const doc = await call(`${documents}/${table}/${encodeURIComponent(id)}`, null, 'GET');
			return doc ? { ...decodeFields(doc.fields || {}), _version: doc.updateTime } : null;
		},
		async write(ops) {
			// One commit: Firestore applies every write in it or none of them.
			try {
				await call(`${documents}:commit`, { writes: ops.map(toWrite) });
			} catch (error) {
				if (['ALREADY_EXISTS', 'FAILED_PRECONDITION', 'NOT_FOUND', 'ABORTED'].includes(error.status)) throw conflict();
				throw error;
			}
		},
	};
}

/** `a.b-c` as Firestore's `\`a\`.\`b-c\``: every segment quoted, so any id is safe. */
const fieldPath = (path) => path.split('.').map((part) => `\`${part.replace(/[`\\]/g, (c) => `\\${c}`)}\``).join('.');

// --- A JSON file --------------------------------------------------------------------

function fileStore(path) {
	if (!fileStores.has(path)) fileStores.set(path, openFileStore(path));
	return fileStores.get(path);
}

let saves = 0;

function openFileStore(path) {
	// Only a missing file is an empty store. A file that will not parse was
	// caught half-written, and reading it as {} meant the next save wrote that
	// emptiness back: the dev server, reading while a seed script wrote, once
	// lost everything but the seed's last table that way.
	const load = async () => {
		for (let attempt = 0; ; attempt++) {
			let text;
			try {
				text = await fs.readFile(path, 'utf8');
			} catch (error) {
				if (error.code === 'ENOENT') return {};
				throw error;
			}
			if (!text.trim()) return {};
			try {
				return JSON.parse(text);
			} catch (error) {
				if (attempt >= 20) throw error;
				await new Promise((resolve) => setTimeout(resolve, 25));
			}
		}
	};
	// Written beside the file and renamed over it, so a reader sees the old
	// whole file or the new one, never half of either. Windows refuses the
	// rename while another process has the file open for a moment; try again.
	const save = async (data) => {
		const temp = `${path}.${process.pid}.${++saves}.tmp`;
		await fs.writeFile(temp, JSON.stringify(data, null, '\t'));
		for (let attempt = 0; ; attempt++) {
			try {
				return await fs.rename(temp, path);
			} catch (error) {
				if (attempt >= 20 || !['EPERM', 'EBUSY', 'EACCES'].includes(error.code)) throw error;
				await new Promise((resolve) => setTimeout(resolve, 25));
			}
		}
	};
	// One write at a time, so two requests cannot interleave a read and a write.
	let queue = Promise.resolve();
	const locked = (fn) => (queue = queue.then(fn, fn));

	return {
		kind: 'file',
		name: `file:${path}`,
		async select(table, { filters, order, limit, offset = 0 } = {}) {
			const data = await load();
			const rows = sortRows(matching(data[table] || [], filters), order);
			return rows.slice(offset, limit ? offset + limit : undefined);
		},
		async count(table, filters = []) {
			return matching((await load())[table] || [], filters).length;
		},
		insert(table, row) {
			return locked(async () => {
				const data = await load();
				const full = fresh(table, row);
				(data[table] ||= []).push(full);
				await save(data);
				return full;
			});
		},
		update(table, filters, patch) {
			return locked(async () => {
				const data = await load();
				const rows = matching(data[table] || [], filters);
				for (const row of rows) Object.assign(row, patch);
				await save(data);
				return rows;
			});
		},
		remove(table, filters) {
			return locked(async () => {
				const data = await load();
				const before = (data[table] || []).length;
				data[table] = (data[table] || []).filter((row) => !filters.every((f) => test(row, f)));
				await save(data);
				return before - data[table].length;
			});
		},
		async get(table, id) {
			const row = ((await load())[table] || []).find((r) => r.id === id);
			return row ? structuredClone(row) : null;
		},
		write(ops) {
			return locked(async () => {
				const data = await load();
				const find = (table, id) => (data[table] || []).find((r) => r.id === id);
				// Every precondition first, so a failed one writes nothing.
				for (const { table, id, set, expect } of ops) {
					if (!set || !expect) continue;
					const existing = find(table, id);
					if (expect === 'missing' ? existing : existing?._version !== expect) throw conflict();
				}
				for (const { table, id, set, add, merge, remove } of ops) {
					const rows = (data[table] ||= []);
					const index = rows.findIndex((r) => r.id === id);
					if (remove) {
						if (index >= 0) rows.splice(index, 1);
						continue;
					}
					const _version = `${Date.now()}.${++versions}`;
					if (add) {
						let row = rows[index];
						if (!row) rows.push((row = { id }));
						Object.assign(row, merge || {}, { _version });
						for (const [path, n] of Object.entries(add)) {
							const parts = path.split('.');
							const leaf = parts.pop();
							let node = row;
							for (const part of parts) node = (node[part] && typeof node[part] === 'object') ? node[part] : (node[part] = {});
							node[leaf] = (Number(node[leaf]) || 0) + n;
						}
						continue;
					}
					const { _version: _, ...clean } = set;
					const row = { ...clean, id, _version };
					if (index >= 0) rows[index] = row;
					else rows.push(row);
				}
				await save(data);
			});
		},
	};
}

let versions = 0;
