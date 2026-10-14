// End-to-end checks of the prompt counts: what one report from a Pulse card or
// a rating prompt counts, then the real function against a throwaway file and
// against the stand-in Firestore, then the admin's view.
//
//   node scripts/check_prompts.mjs        (or: mise check-prompts)
//
// What it holds them to: a report moves only the counters it may name, with
// every number clamped; answers decide "answered" and a score decides "scored",
// whatever the outcome claims; nothing stored is about a person; writes are
// JSON from this site; one connection cannot flood it; only the owner sees it.

import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import handler from '../api/prompts.mjs';
import adminHandler from '../api/admin.mjs';
import { sessionCookie } from '../api/_admin/auth.mjs';
import { configuredStore } from '../api/_lostfound/store.mjs';
import { forgetLimits, forgetSummaries, increments, isoDay, vocab } from '../api/_prompts/handlers.mjs';
import { startFakeFirestore } from './fake_firestore.mjs';

let failures = 0;
const check = (label, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`); if (!ok) failures++; };
const throws = (fn) => { try { fn(); return false; } catch { return true; } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// --- what one report counts ----------------------------------------------------------------

check('an answered card counts what opened it, the answers and the chain', same(increments({ kind: 'pulse', why: 'leaving', outcome: 'close', answers: 2, map: true }),
	{ 'pulse.shown.leaving': 1, 'pulse.outcome.answered': 1, 'pulse.answers': 2, 'pulse.answeredBy.leaving': 1, 'pulse.chain.2': 1, 'pulse.map': 1 }));
check('a card that claims "answered" with no answers was not answered', increments({ kind: 'pulse', why: 'reading', outcome: 'answered' })['pulse.outcome.ignored'] === 1);
check('a run of answers past four counts as four or more', increments({ kind: 'pulse', why: 'back', answers: 40 })['pulse.chain.4'] === 1);
check('the answers are clamped', increments({ kind: 'pulse', why: 'back', answers: 1e9 })['pulse.answers'] === 50);
check('a dismissal counts how', increments({ kind: 'pulse', why: 'reading', outcome: 'never' })['pulse.outcome.never'] === 1);
check('an unknown moment and outcome fall back, never stored as sent', same(increments({ kind: 'pulse', why: '<script>', outcome: 'exploded' }), { 'pulse.shown.reading': 1, 'pulse.outcome.ignored': 1 }));
check('the location check counts when asked and how it went', same(increments({ kind: 'pulse', why: 'reading', outcome: 'notnow', asked: true, located: 'outside' }),
	{ 'pulse.shown.reading': 1, 'pulse.outcome.notnow': 1, 'pulse.locate.asked': 1, 'pulse.locate.outside': 1 }));
check('a check-in is not a card shown', same(increments({ kind: 'pulse', why: 'checkin', asked: true, located: 'ok' }), { 'pulse.checkin': 1, 'pulse.locate.asked': 1, 'pulse.locate.ok': 1 }));
check('a rating counts the score, clamped to five', same(increments({ kind: 'rating', outcome: 'dismissed', score: 9, contact: true }), { 'rating.shown': 1, 'rating.outcome.scored': 1, 'rating.score.5': 1, 'rating.contact': 1 }));
check('a rating that claims "scored" with no score was not scored', increments({ kind: 'rating', outcome: 'scored' })['rating.outcome.ignored'] === 1);
check('a report of anything else is refused', throws(() => increments({ kind: 'nonsense' })) && throws(() => increments(null)));

// --- the function -----------------------------------------------------------------------------

const common = { LOSTFOUND_SALT: 'check', ADMIN_SESSION_SECRET: 'check-session-secret-that-is-long-enough', GOOGLE_CLIENT_ID: 'x', GOOGLE_CLIENT_SECRET: 'y' };

async function serve(env) {
	const server = createServer((req, res) => (req.url.startsWith('/api/admin') ? adminHandler : handler)(req, res, env));
	await new Promise((resolve) => server.listen(0, resolve));
	const port = server.address().port;
	const owner = sessionCookie(env).split(';')[0];
	const read = async (res) => ({ status: res.status, body: await res.json() });
	return {
		report: async (body, headers = {}) => read(await fetch(`http://localhost:${port}/api/prompts?r=report`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) })),
		raw: (init) => fetch(`http://localhost:${port}/api/prompts?r=report`, init),
		admin: async (params = {}, cookie = owner) => read(await fetch(`http://localhost:${port}/api/admin?r=prompts&${new URLSearchParams(params)}`, { headers: cookie ? { Cookie: cookie } : {} })),
		close: () => new Promise((resolve) => server.close(resolve)),
	};
}

async function suite(name, env) {
	console.log(`\n--- ${name} ---`);
	forgetLimits();
	forgetSummaries();
	const store = configuredStore(env);
	const { report, raw, admin, close } = await serve(env);
	const reports = [
		{ kind: 'pulse', why: 'reading', outcome: 'notnow' },
		{ kind: 'pulse', why: 'reading', answers: 3, asked: true, located: 'ok' },
		{ kind: 'pulse', why: 'back', outcome: 'never' },
		{ kind: 'pulse', why: 'leaving', answers: 1, map: true },
		{ kind: 'pulse', why: 'reading', outcome: 'ignored', asked: true, located: 'refused' },
		{ kind: 'rating', score: 4 },
		{ kind: 'rating', score: 2, contact: true },
		{ kind: 'rating', outcome: 'dismissed' },
	];
	const answers = [];
	for (const body of reports) answers.push(await report(body));
	check('reports are counted', answers.every((a) => a.status === 200));
	const doc = await store.get('prompt_days', isoDay(0));
	check('the day adds them up', doc.pulse.shown.reading === 3 && doc.pulse.shown.back === 1 && doc.pulse.answers === 4 && doc.pulse.outcome.answered === 2 && doc.pulse.locate.asked === 2 && doc.rating.shown === 3 && doc.rating.score['4'] === 1 && doc.rating.contact === 1, JSON.stringify(doc).slice(0, 200));
	check('nothing stored is about a person', !/ip|device|guide|slug|email|"id":"(?!\d{4}-)/.test(JSON.stringify(await store.select('prompt_days', {})).replace(/"id":"\d{4}-\d{2}-\d{2}"/g, '')));
	check('a report that is not one is refused', (await report({ kind: 'nonsense' })).status === 400);
	check('a report that is not JSON is refused', (await raw({ method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}' })).status === 415);
	check('a report from another site is refused', (await report({ kind: 'rating', score: 5 }, { Origin: 'https://evil.example' })).status === 403);
	check('a GET is refused', (await raw({ method: 'GET' })).status === 405);
	forgetLimits();
	let refused = null;
	for (let i = 0; i < vocab.perHour + 1; i++) {
		const r = await report({ kind: 'rating', outcome: 'ignored' });
		if (r.status !== 200) { refused = r; break; }
	}
	check(`one connection is held to ${vocab.perHour} reports an hour`, refused?.status === 429);
	forgetLimits();
	check('the admin view needs the owner', (await admin({}, '')).status === 401);
	forgetSummaries();
	const v = (await admin({ days: '7' })).body;
	check('the admin sees the period day by day, and all time', v.days === 7 && v.daily.length === 7 && v.daily.at(-1).pulseShown === 5 && v.daily.at(-1).pulseAnswered === 2 && v.current.pulse.answers === 4 && v.first === isoDay(0), JSON.stringify(v.daily.at(-1)));
	await close();
}

const file = path.join(os.tmpdir(), `prompts-check-${process.pid}-${Date.now()}.json`);
await suite('a JSON file', { ...common, LOSTFOUND_FILE: file });
const fake = await startFakeFirestore();
await suite('the stand-in Firestore', { ...common, FIRESTORE_EMULATOR_HOST: fake.host, FIRESTORE_PROJECT: 'check' });
check('no query needed an index nobody declared', fake.stats.refused === 0);
await fake.close();

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
