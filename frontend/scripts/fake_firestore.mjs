// A stand-in for Firestore, for check_lostfound.mjs and check_pulse.mjs: the
// REST calls the store makes (runQuery, runAggregationQuery, commit, and a GET
// of one document), kept in memory, served over HTTP on a spare port so the
// store's fetch code runs for real.
//
// Commits are atomic, as Firestore's are: every precondition is checked before
// anything is written, so a vote and its tally land together or not at all.
// Field transforms (increment) work on quoted, dotted field paths.
//
// It also holds queries to Firestore's index rules, against the indexes in
// api/_lostfound/firestore.indexes.json. A query the real database would
// refuse with "requires an index" is refused here too, the same way - so a new
// query that needs an index nobody declared fails the check rather than the
// live site. The rules modelled are the ones the store relies on:
//
//   - equality filters alone are served by single-field indexes;
//   - a range is allowed on one field, which must be ordered first, and
//     beside equality filters only with a composite index;
//   - equality filters ordered by another field need, for each equality
//     field, an index on (that field, the order field) - Firestore merges them.
//
// It is not the Firestore emulator, and does not try to be: it exists so the
// suite runs anywhere Node does, with no Java and no Google account.

import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DECLARED = JSON.parse(readFileSync(path.join(here, '..', 'api', '_lostfound', 'firestore.indexes.json'), 'utf8')).indexes;

const decode = (v) => {
	if ('stringValue' in v) return v.stringValue;
	if ('integerValue' in v) return Number(v.integerValue);
	if ('doubleValue' in v) return v.doubleValue;
	if ('booleanValue' in v) return v.booleanValue;
	if ('referenceValue' in v) return v.referenceValue;
	if ('arrayValue' in v) return (v.arrayValue.values || []).map(decode);
	if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, decode(x)]));
	return null;
};

// "`a`.`b-c`" or "a.b" as ['a', 'b-c'].
const segments = (path) => [...path.matchAll(/`((?:[^`\\]|\\.)*)`|([^.`]+)/g)].map((m) => (m[1] ?? m[2]).replace(/\\(.)/g, '$1'));

function getPath(fields, parts) {
	let node = { mapValue: { fields } };
	for (const part of parts) node = node?.mapValue?.fields?.[part];
	return node;
}

function setPath(fields, parts, value) {
	const [head, ...rest] = parts;
	if (!rest.length) { fields[head] = value; return; }
	if (!fields[head]?.mapValue) fields[head] = { mapValue: { fields: {} } };
	fields[head].mapValue.fields ||= {};
	setPath(fields[head].mapValue.fields, rest, value);
}

const compare = (a, b) => (a === b ? 0 : a === null || a === undefined ? -1 : b === null || b === undefined ? 1 : a < b ? -1 : 1);

function flatten(where) {
	if (!where) return [];
	if (where.compositeFilter) return where.compositeFilter.filters.flatMap(flatten);
	return [where];
}

const EQUALITY = new Set(['EQUAL', 'IN']);

function indexProblem(collection, filters, orderBy, indexes) {
	const has = (fields) => indexes.some((index) => index.collectionGroup === collection
		&& index.fields.length === fields.length
		&& index.fields.every((f, i) => f.fieldPath === fields[i][0] && f.order === fields[i][1]));
	const equal = new Set();
	const range = new Set();
	for (const f of filters) {
		if (f.unaryFilter) equal.add(f.unaryFilter.field.fieldPath);
		else if (EQUALITY.has(f.fieldFilter.op)) equal.add(f.fieldFilter.field.fieldPath);
		else range.add(f.fieldFilter.field.fieldPath);
	}
	const order = orderBy.filter((o) => o.field.fieldPath !== '__name__');
	if (range.size > 1) return 'a range on more than one field';
	if (range.size) {
		const [r] = range;
		if (order.length && order[0].field.fieldPath !== r) return `a range on ${r} ordered by ${order[0].field.fieldPath}`;
		if (equal.size) return `equality beside a range on ${r}`;
		return null;
	}
	if (!order.length || !equal.size) return null;
	if (order.length > 1) return 'ordering by two fields';
	const by = [order[0].field.fieldPath, order[0].direction];
	const missing = [...equal].filter((e) => e !== by[0] && !has([[e, 'ASCENDING'], by]));
	return missing.length ? `no index on (${missing.join(', ')}) with ${by[0]}` : null;
}

function matches(doc, f) {
	if (f.unaryFilter) return doc.data[f.unaryFilter.field.fieldPath] === null || doc.data[f.unaryFilter.field.fieldPath] === undefined;
	const { field: { fieldPath }, op, value } = f.fieldFilter;
	const field = fieldPath === '__name__' ? doc.name : doc.data[fieldPath];
	const want = decode(value);
	if (field === undefined) return false;
	switch (op) {
		case 'EQUAL': return compare(field, want) === 0;
		case 'IN': return want.some((w) => compare(field, w) === 0);
		case 'NOT_EQUAL': return compare(field, want) !== 0;
		case 'LESS_THAN': return compare(field, want) < 0;
		case 'LESS_THAN_OR_EQUAL': return compare(field, want) <= 0;
		case 'GREATER_THAN': return compare(field, want) > 0;
		case 'GREATER_THAN_OR_EQUAL': return compare(field, want) >= 0;
		default: throw new Error(`fake firestore: unsupported op ${op}`);
	}
}

export async function startFakeFirestore({ indexes = DECLARED } = {}) {
	const collections = new Map();
	// `reads` names every collection read, query or single document, so a
	// check can say what a route touched as well as how often.
	const stats = { queries: 0, refused: 0, reads: [] };

	const key = (doc, orderBy) => orderBy.map((o) => (o.field.fieldPath === '__name__' ? doc.name : doc.data[o.field.fieldPath]));
	const sortDocs = (docs, orderBy) => docs.sort((a, b) => {
		const ka = key(a, orderBy);
		const kb = key(b, orderBy);
		for (let i = 0; i < orderBy.length; i++) {
			const c = compare(ka[i], kb[i]) * (orderBy[i].direction === 'DESCENDING' ? -1 : 1);
			if (c) return c;
		}
		return 0;
	});

	function query(q) {
		stats.queries++;
		const collection = q.from[0].collectionId;
		stats.reads.push(`query ${collection}`);
		const filters = flatten(q.where);
		const orderBy = q.orderBy || [];
		const problem = indexProblem(collection, filters, orderBy, indexes);
		if (problem) {
			stats.refused++;
			return { error: { code: 400, status: 'FAILED_PRECONDITION', message: `The query requires an index: ${problem}.` } };
		}
		let docs = [...(collections.get(collection) || new Map()).values()].filter((doc) => filters.every((f) => matches(doc, f)));
		docs = sortDocs(docs, orderBy);
		if (q.startAt) {
			const cursor = q.startAt.values.map(decode);
			docs = docs.filter((doc) => {
				const k = key(doc, orderBy);
				for (let i = 0; i < orderBy.length; i++) {
					const c = compare(k[i], cursor[i]) * (orderBy[i].direction === 'DESCENDING' ? -1 : 1);
					if (c) return c > 0;
				}
				return q.startAt.before;
			});
		}
		docs = docs.slice(q.offset || 0);
		if (q.limit) docs = docs.slice(0, q.limit);
		return { docs };
	}

	let ticks = 0;
	const locate = (name) => {
		const [, collection, id] = /\/documents\/([^/]+)\/([^/]+)$/.exec(name);
		const table = collections.get(collection) || new Map();
		collections.set(collection, table);
		return { table, id: decodeURIComponent(id) };
	};

	// A write's precondition, without writing anything.
	function problemWith(w) {
		if (w.delete) return null;
		const { table, id } = locate(w.update.name);
		const existing = table.get(id);
		if (w.currentDocument?.exists === false && existing) return 'ALREADY_EXISTS';
		if (w.currentDocument?.exists === true && !existing) return 'NOT_FOUND';
		if (w.currentDocument?.updateTime && existing?.updateTime !== w.currentDocument.updateTime) return 'FAILED_PRECONDITION';
		return null;
	}

	function write(w, updateTime) {
		if (w.delete) {
			const { table, id } = locate(w.delete);
			table.delete(id);
			return;
		}
		const name = w.update.name;
		const { table, id } = locate(name);
		const existing = table.get(id);
		let fields;
		if (w.updateMask) {
			fields = structuredClone(existing?.fields || {});
			for (const path of w.updateMask.fieldPaths) {
				const parts = segments(path);
				setPath(fields, parts, getPath(w.update.fields || {}, parts) ?? { nullValue: null });
			}
		} else {
			fields = structuredClone(w.update.fields || {});
		}
		for (const t of w.updateTransforms || []) {
			const parts = segments(t.fieldPath);
			const current = Number(decode(getPath(fields, parts) || { integerValue: '0' })) || 0;
			setPath(fields, parts, { integerValue: String(current + Number(decode(t.increment))) });
		}
		table.set(id, { name, fields, updateTime, data: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, decode(v)])) });
	}

	const server = createServer(async (req, res) => {
		let raw = '';
		for await (const chunk of req) raw += chunk;
		const body = raw ? JSON.parse(raw) : {};
		const reply = (status, payload) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(payload)); };
		const now = new Date().toISOString();
		if (req.url.endsWith(':runQuery')) {
			const { error, docs } = query(body.structuredQuery);
			if (error) return reply(400, [{ error }]);
			return reply(200, docs.length ? docs.map((d) => ({ document: { name: d.name, fields: d.fields }, readTime: now })) : [{ readTime: now }]);
		}
		if (req.url.endsWith(':runAggregationQuery')) {
			const { error, docs } = query(body.structuredAggregationQuery.structuredQuery);
			if (error) return reply(400, [{ error }]);
			return reply(200, [{ result: { aggregateFields: { n: { integerValue: String(docs.length) } } }, readTime: now }]);
		}
		if (req.url.endsWith(':commit')) {
			// All or nothing: every precondition before any write.
			for (const w of body.writes) {
				const problem = problemWith(w);
				if (problem) return reply({ NOT_FOUND: 404, ALREADY_EXISTS: 409 }[problem] || 400, { error: { status: problem } });
			}
			const updateTime = `${now.slice(0, -1)}${String(++ticks).padStart(6, '0')}Z`;
			for (const w of body.writes) write(w, updateTime);
			return reply(200, { writeResults: body.writes.map(() => ({ updateTime })), commitTime: updateTime });
		}
		if (req.method === 'GET' && /\/documents\/[^/:]+\/[^/:]+$/.test(req.url)) {
			const { table, id } = locate(req.url);
			stats.reads.push(`get ${/\/documents\/([^/]+)\//.exec(req.url)[1]}`);
			const doc = table.get(id);
			return doc ? reply(200, { name: doc.name, fields: doc.fields, updateTime: doc.updateTime }) : reply(404, { error: { status: 'NOT_FOUND' } });
		}
		reply(404, { error: { status: 'NOT_FOUND', message: `fake firestore does not do ${req.url}` } });
	});
	await new Promise((resolve) => server.listen(0, resolve));
	return {
		host: `localhost:${server.address().port}`,
		stats,
		close: () => new Promise((resolve) => server.close(resolve)),
	};
}
