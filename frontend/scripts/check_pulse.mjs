// End-to-end checks of Accra Pulse: the geography, then every route through the
// real serverless functions, twice - against a throwaway JSON file, and against
// the stand-in Firestore (fake_firestore.mjs) that refuses any query the
// declared indexes could not serve.
//
//   node scripts/check_pulse.mjs        (or: mise check-pulse)
//
// What it holds Pulse to: the district outlines match the map; a position
// outside Greater Accra, an imprecise one or a connection from outside Ghana
// gets no pass; a pass works only for the browser it was given to and only
// until it runs out; one vote a device a question, changeable, never doubled;
// the tally always equals the votes behind it; a district's answers stay
// unpublished below the threshold; no public answer carries a device, a vote
// key, an IP hash or a position; and the admin's rules - answers locked once
// voted on, a typed reference to delete, the daily job settling and pruning.
// And the bank: every entry a question the admin could have typed, each
// switch writing, opening, drafting or closing exactly one question, the
// limit on open questions, and a public list that costs two documents however
// many are open.
// Run it after any change to api/_pulse/ or to the store.

import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import handler from '../api/pulse.mjs';
import adminHandler from '../api/admin.mjs';
import { sessionCookie } from '../api/_admin/auth.mjs';
import { configuredStore } from '../api/_lostfound/store.mjs';
import { forgetSettings } from '../api/_lostfound/handlers.mjs';
import { DISTRICTS } from '../api/_pulse/districts.mjs';
import { locate, unproject } from '../api/_pulse/geo.mjs';
import { forgetIndex, forgetQuestions, issuePass, rebuildIndex, tallyChange } from '../api/_pulse/handlers.mjs';
import { fromBank, validQuestion } from '../api/_pulse/admin.mjs';
import vocab from '../api/_pulse/vocab.mjs';
import bank from '../api/_pulse/bank.mjs';
import { startFakeFirestore } from './fake_firestore.mjs';

let failures = 0;
const check = (label, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`); if (!ok) failures++; };
const day = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

// --- the geography ----------------------------------------------------------------------------

// Nairobi's map: its 17 constituencies stand in for Accra's districts, each
// with its label point (inside the shape) as the centre.
const nairobi = JSON.parse(readFileSync(new URL('../templates/geo/nairobi-map.json', import.meta.url), 'utf8'));
const map = { districts: nairobi.constituencies.map((c) => ({ id: c.id, name: c.name, cx: c.label[0], cy: c.label[1] })), landmarks: nairobi.landmarks };
check('districts.mjs has the map\'s 17 constituencies, in step', DISTRICTS.length === map.districts.length && map.districts.every((d) => DISTRICTS.some((x) => x.id === d.id)),
	'run scripts/build_pulse_districts.py after scripts/build_nairobi_map.py');
const centres = map.districts.filter((d) => locate(unproject(d.cx, d.cy).lat, unproject(d.cx, d.cy).lon)?.id === d.id);
check('every district\'s centre is found in that district', centres.length === map.districts.length, `${centres.length}/${map.districts.length}`);
check('every landmark on /map is inside Nairobi', map.landmarks.every((l) => locate(l.lat, l.lon)));
for (const [label, lat, lon] of [['Mombasa', -4.0435, 39.6682], ['Kisumu', -0.0917, 34.768], ['Thika', -1.0332, 37.0693], ['Machakos', -1.5177, 37.2634], ['Kampala', 0.3476, 32.5825]]) {
	check(`${label} is outside`, locate(lat, lon, vocab.edgeMetres) === null);
}
check('The KICC, in the CBD, is in Starehe', locate(-1.2885, 36.823, vocab.edgeMetres)?.id === 'starehe');
// --- the bank -------------------------------------------------------------------------------------

const unfit = bank.flatMap((entry) => { try { validQuestion(fromBank(entry)); return []; } catch (error) { return [`${entry.key}: ${error.message}`]; } });
check(`all ${bank.length} questions in the bank pass the rules a typed question does`, unfit.length === 0, unfit.join('; '));
check('every bank key is unique, a slug, and every question asked once', new Set(bank.map((e) => e.key)).size === bank.length
	&& bank.every((e) => /^[a-z0-9-]{8,48}$/.test(e.key)) && new Set(bank.map((e) => e.text.toLowerCase())).size === bank.length);
check('every topic has questions in the bank', vocab.topics.every((t) => bank.some((e) => e.topic === t.id)));

const moved = tallyChange({ option: 'a', district: 'x' }, { option: 'b', district: 'x' });
check('changing an answer moves one vote and leaves the total', JSON.stringify(moved) === JSON.stringify({ 'options.a': -1, 'districts.x.a': -1, 'options.b': 1, 'districts.x.b': 1 }), JSON.stringify(moved));

// A position in the middle of a district, as a phone would send it.
const at = (id) => {
	const d = map.districts.find((x) => x.id === id);
	const p = unproject(d.cx, d.cy);
	return { lat: Math.round(p.lat * 10000) / 10000, lon: Math.round(p.lon * 10000) / 10000, accuracy: 30 };
};
const device = (n) => `check-device-${String(n).padStart(4, '0')}-abcdefgh`;

// --- the routes ---------------------------------------------------------------------------------

const common = {
	LOSTFOUND_SALT: 'check', CRON_SECRET: 'check-cron', PULSE_SECRET: 'check-pulse-secret',
	ADMIN_SESSION_SECRET: 'check-session-secret-that-is-long-enough', GOOGLE_CLIENT_ID: 'x', GOOGLE_CLIENT_SECRET: 'y',
};

async function serve(env) {
	const server = createServer((req, res) => (req.url.startsWith('/api/admin') ? adminHandler : handler)(req, res, env));
	await new Promise((resolve) => server.listen(0, resolve));
	const port = server.address().port;
	const B = `http://localhost:${port}/api/pulse`;
	const A = `http://localhost:${port}/api/admin`;
	const owner = sessionCookie(env).split(';')[0];
	const read = async (res) => ({ status: res.status, body: await res.json(), cache: res.headers.get('cache-control') });
	return {
		get: async (r, params = {}, headers = {}) => read(await fetch(`${B}?r=${r}&${new URLSearchParams(params)}`, { headers })),
		post: async (r, body, headers = {}) => read(await fetch(`${B}?r=${r}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) })),
		raw: (r, init) => fetch(`${B}?r=${r}`, init),
		purge: async (secret) => read(await fetch(`${B}?r=purge`, { headers: secret ? { Authorization: `Bearer ${secret}` } : {} })),
		aget: async (r, params = {}, cookie = owner) => read(await fetch(`${A}?r=${r}&${new URLSearchParams(params)}`, { headers: cookie ? { Cookie: cookie } : {} })),
		apost: async (r, body, cookie = owner) => read(await fetch(`${A}?r=${r}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) })),
		close: () => new Promise((resolve) => server.close(resolve)),
	};
}

async function suite(name, env, stats = null) {
	console.log(`\n--- ${name} ---`);
	forgetQuestions();
	forgetIndex();
	forgetSettings();
	const store = configuredStore(env);
	const { get, post, raw, purge, aget, apost, close } = await serve(env);
	const leaks = [];
	const watch = (r) => { leaks.push(JSON.stringify(r.body)); return r; };

	check('no questions to begin with', (await get('questions')).body.live.length === 0);
	check('the admin needs a session', (await aget('pulse', {}, '')).status === 401);

	// Writing a question.
	const yesno = { text: "Should boda bodas be allowed in Nairobi's CBD?", context: 'Motorbike taxis carry people all over the city.', topic: 'transport', kind: 'choice', options: [{ label: 'Yes' }, { label: 'No' }, { label: 'Not sure' }] };
	const draft = await apost('pulse', { action: 'create', question: yesno });
	check('a question is created as a draft', draft.status === 200 && draft.body.question.status === 'draft' && /^P-[A-Z2-9]{6}$/.test(draft.body.question.ref), JSON.stringify(draft.body).slice(0, 160));
	const qid = draft.body.question.id;
	check('a draft is not public', (await get('questions')).body.live.length === 0 && (await get('results', { q: qid })).status === 404);
	for (const [label, q] of [
		['one answer', { ...yesno, options: [{ label: 'Yes' }] }],
		['seven answers', { ...yesno, options: 'abcdefg'.split('').map((l) => ({ label: l })) }],
		['the same answer twice', { ...yesno, options: [{ label: 'Yes' }, { label: 'yes' }] }],
		['a link', { ...yesno, text: 'Is www.example.com any good for Nairobi?' }],
		['no topic', { ...yesno, topic: 'nonsense' }],
		['a scale with no bad end', { ...yesno, kind: 'scale', options: [{ label: 'Good', value: 1 }, { label: 'Great', value: 2 }] }],
	]) check(`a question with ${label} is refused`, (await apost('pulse', { action: 'create', question: q })).status === 400);
	const opened = await apost('pulse', { action: 'open', id: qid });
	check('opening it makes it live', opened.body.question.status === 'live' && opened.body.question.opened_at);
	const list = await get('questions');
	check('a live question is public, with its total, cached briefly at the edge', list.body.live.length === 1 && list.body.live[0].total === 0 && /s-maxage=20/.test(list.cache));

	// Checking where you are.
	const accra = at('starehe');
	const pass1 = watch(await post('pass', { device: device(1), ...accra }));
	check('a phone in Starehe gets a pass for it', pass1.status === 200 && pass1.body.district.id === 'starehe' && pass1.body.pass, JSON.stringify(pass1.body).slice(0, 120));
	check('a phone in Mombasa gets none', (await post('pass', { device: device(2), lat: -4.0435, lon: 39.6682, accuracy: 20 })).body.code === 'outside');
	check('a position the device is unsure of gets none', (await post('pass', { device: device(2), ...accra, accuracy: 20000 })).body.code === 'accuracy');
	check('a browser without an id gets none', (await post('pass', { device: 'short', ...accra })).body.code === 'device');
	check('nor does a bot that fills the honeypot', (await post('pass', { device: device(2), ...accra, website: 'x' })).status === 400);

	// Voting.
	const noPass = await post('vote', { device: device(1), question: qid, option: 'a' });
	check('a vote without a pass is refused', noPass.status === 401 && noPass.body.code === 'pass');
	// The signature's first character, not its last: the last carries two bits
	// of padding, so changing it can decode to the very same signature.
	const [payload, signature] = pass1.body.pass.split('.');
	const forged = `${payload}.${signature[0] === 'A' ? 'B' : 'A'}${signature.slice(1)}`;
	check('a tampered pass is refused', (await post('vote', { device: device(1), pass: forged, question: qid, option: 'a' })).body.code === 'pass');
	check('a pass from another browser is refused', (await post('vote', { device: device(9), pass: pass1.body.pass, question: qid, option: 'a' })).body.code === 'pass');
	check('a pass past its time is refused', (await post('vote', { device: device(1), pass: issuePass(env, device(1), 'starehe', -1), question: qid, option: 'a' })).body.code === 'pass');
	check('an answer that is not one is refused', (await post('vote', { device: device(1), pass: pass1.body.pass, question: qid, option: 'z' })).status === 400);

	const v1 = watch(await post('vote', { device: device(1), pass: pass1.body.pass, question: qid, option: 'a' }));
	check('a vote counts', v1.status === 200 && v1.body.results.total === 1 && v1.body.results.options[0].count === 1, JSON.stringify(v1.body).slice(0, 200));
	check('its district shows a total and no answers below the threshold', JSON.stringify(v1.body.results.districts['starehe']) === '{"total":1}');
	check('the same vote again changes nothing', (await post('vote', { device: device(1), pass: pass1.body.pass, question: qid, option: 'a' })).body.unchanged === true);
	const changed = await post('vote', { device: device(1), pass: pass1.body.pass, question: qid, option: 'b' });
	check('changing it moves it, and the total stays one', changed.body.changed === true && changed.body.results.total === 1 && changed.body.results.options[0].count === 0 && changed.body.results.options[1].count === 1);
	const la = watch(await post('pass', { device: device(1), ...at('westlands') }));
	const movedVote = await post('vote', { device: device(1), pass: la.body.pass, question: qid, option: 'b' });
	check('voting again from another district moves it there', movedVote.body.results.total === 1 && !movedVote.body.results.districts['starehe'] && movedVote.body.results.districts['westlands']?.total === 1, JSON.stringify(movedVote.body.results.districts));

	// Ten more in La: the district's answers are published at the threshold.
	const min = vocab.minDistrictVotes;
	let last;
	for (let n = 10; n < 10 + min - 1; n++) {
		const p = await post('pass', { device: device(n), ...at('westlands') });
		last = watch(await post('vote', { device: device(n), pass: p.body.pass, question: qid, option: n % 3 ? 'a' : 'c' }));
	}
	const laResults = last.body.results.districts['westlands'];
	check(`at ${min} votes a district's answers are published`, laResults.total === min && laResults.counts && laResults.counts.a + laResults.counts.b + laResults.counts.c === min, JSON.stringify(laResults));
	const results = watch(await get('results', { q: qid }));
	check('results are public and cached briefly', results.status === 200 && results.body.results.total === min && /s-maxage=10/.test(results.cache));
	const tally = await store.get('pulse_tallies', qid);
	const sum = Object.values(tally.options).reduce((a, b) => a + b, 0);
	check('the tally adds up', sum === tally.total && tally.total === min);
	forgetIndex();
	check('the page lists it with the same count, from the totals', (await get('questions')).body.live.find((q) => q.id === qid)?.total === min);

	// Changing a vote too often.
	const p3 = await post('pass', { device: device(3), ...accra });
	await post('vote', { device: device(3), pass: p3.body.pass, question: qid, option: 'a' });
	let refused = null;
	for (let i = 0; i < vocab.limits.maxChanges + 1; i++) {
		const r = await post('vote', { device: device(3), pass: p3.body.pass, question: qid, option: i % 2 ? 'a' : 'b' });
		if (r.status !== 200) { refused = r; break; }
	}
	check(`a vote cannot be changed more than ${vocab.limits.maxChanges} times`, refused?.body.code === 'changes');

	// Privacy: nothing public carries a device, a key, a hash or a position.
	const everything = leaks.join(' ') + JSON.stringify((await get('questions')).body);
	check('no public answer carries a device id, a vote key, an IP hash or a position', !/check-device|ip_hash|_version|"lat"|"lon"|[0-9a-f]{40}/.test(everything));

	// Writes must be JSON from this site.
	check('a vote that is not JSON is refused', (await raw('vote', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'x' })).status === 415);
	check('a vote from another site is refused', (await post('vote', { device: device(1) }, { Origin: 'https://evil.example' })).status === 403);

	// Settings: pausing, and the hour's limit on location checks.
	await apost('settings', { what: 'pulse', pulse: { paused: true, message: 'Back at noon.', limits: { passesPerHour: 1000 } } });
	forgetSettings();
	check('paused, a vote is refused with the message', (await post('vote', { device: device(1), pass: la.body.pass, question: qid, option: 'a' })).body.error === 'Back at noon.');
	check('and the page is told', (await get('questions')).body.paused === 'Back at noon.');
	const used = await store.count('lf_events', [['action', 'eq', 'pulse-pass']]);
	await apost('settings', { what: 'pulse', pulse: { paused: false, limits: { passesPerHour: used + 1 } } });
	forgetSettings();
	check('one more location check this hour is allowed', (await post('pass', { device: device(4), ...accra })).status === 200);
	check('and the next is refused', (await post('pass', { device: device(5), ...accra })).body.code === 'rate');
	await apost('settings', { what: 'pulse', pulse: { paused: false, limits: {} } });
	forgetSettings();

	// The country check, as on Vercel.
	{
		const vercel = await serve({ ...env, VERCEL: '1' });
		const abroad = await vercel.post('pass', { device: device(6), ...accra }, { 'x-vercel-ip-country': 'NG' });
		check('on Vercel, a connection from outside Ghana gets no pass', abroad.status === 403 && abroad.body.code === 'country');
		check('and one from Kenya does', (await vercel.post('pass', { device: device(6), ...accra }, { 'x-vercel-ip-country': 'KE' })).status === 200);
		await vercel.close();
	}

	// Asking readers on other pages: whom, from what Vercel says of a connection.
	{
		const conn = {
			accra: { 'x-vercel-ip-country': 'KE', 'x-vercel-ip-country-region': '30', 'x-vercel-ip-city': 'Nairobi' },
			tema: { 'x-vercel-ip-country': 'KE', 'x-vercel-ip-city': 'Westlands' },
			centre: { 'x-vercel-ip-country': 'KE', 'x-vercel-ip-latitude': '-1.2864', 'x-vercel-ip-longitude': '36.8172' },
			kumasi: { 'x-vercel-ip-country': 'KE', 'x-vercel-ip-country-region': '28', 'x-vercel-ip-city': 'Mombasa', 'x-vercel-ip-latitude': '-4.0435', 'x-vercel-ip-longitude': '39.6682' },
			lagos: { 'x-vercel-ip-country': 'NG', 'x-vercel-ip-country-region': 'LA', 'x-vercel-ip-city': 'Lagos' },
		};
		const where = async (who) => (await get('where', {}, conn[who])).body;
		const first = await get('where', {}, conn.accra);
		check('a connection in Nairobi is asked, by default', first.status === 200 && first.body.ask === true && first.body.place === 'nairobi' && first.body.delay === vocab.prompt.delay);
		check('the answer is never cached for anyone else', /no-store/.test(first.cache));
		check('a town or a position in Nairobi counts too', (await where('tema')).ask === true && (await where('centre')).place === 'nairobi');
		check('Mombasa and Lagos are not asked, by default', (await where('kumasi')).ask === false && (await where('kumasi')).place === 'kenya' && (await where('lagos')).place === 'elsewhere');
		check('nothing about the connection comes back but the place', !/Nairobi"|Mombasa|-1\.28|"30"/.test(JSON.stringify(first.body)), JSON.stringify(first.body));
		const askWith = (prompt) => apost('settings', { what: 'pulse', pulse: { paused: false, limits: {}, prompt } }).then(() => forgetSettings());
		await askWith({ audience: 'kenya' });
		check('"anyone in Kenya" asks Mombasa and not Lagos', (await where('kumasi')).ask === true && (await where('lagos')).ask === false);
		await askWith({ audience: 'everyone', delay: 15, again: 60, perVisit: 3, leave: false });
		const everyone = await where('lagos');
		check('"everyone" asks Lagos, with the timings set', everyone.ask === true && everyone.delay === 15 && everyone.again === 60 && everyone.perVisit === 3 && everyone.leave === false);
		await askWith({ on: false });
		check('switched off, nobody is asked', (await where('accra')).ask === false);
		check('and the questions say so, for a browser told yes earlier', (await get('questions')).body.asking === false);
		await askWith({ on: true, audience: 'nonsense', delay: 1, perVisit: 999 });
		const fixed = (await aget('settings')).body.pulse.prompt;
		check('settings out of bounds fall back to the defaults', fixed.audience === vocab.prompt.audience && fixed.delay === vocab.prompt.delay && fixed.perVisit === vocab.prompt.perVisit, JSON.stringify(fixed));
		await apost('settings', { what: 'pulse', pulse: { paused: true, limits: {} } });
		forgetSettings();
		check('a save that does not send them keeps them', (await aget('settings')).body.pulse.prompt?.on === true);
		check('paused, nobody is asked', (await where('accra')).ask === false);
		await apost('settings', { what: 'pulse', pulse: { paused: false, limits: {} } });
		forgetSettings();
		check('the admin\'s view carries them', (await aget('pulse')).body.settings.prompt?.audience === vocab.prompt.audience);
	}

	// The admin's view and rules.
	const listed = await aget('pulse');
	const row = listed.body.questions.find((q) => q.id === qid);
	check('the admin lists it with its votes and how many districts show', row.votes === min + 1 && row.coverage.shown === 1 && row.coverage.voting === 2, JSON.stringify(row?.coverage));
	const detail = await aget('pulse-question', { id: qid });
	check('the admin sees every district, under the threshold too', detail.body.districts.find((d) => d.id === 'starehe').total === 1 && detail.body.days.length >= 1);
	check('answers can be reworded once voted on', (await apost('pulse', { action: 'update', id: qid, question: { ...yesno, options: [{ label: 'Yes, legalise' }, { label: 'No' }, { label: 'Not sure' }] } })).status === 200);
	const reshaped = await apost('pulse', { action: 'update', id: qid, question: { ...yesno, options: [{ label: 'Yes' }, { label: 'No' }] } });
	check('but not added, removed or reordered', reshaped.status === 400 && reshaped.body.code === 'locked');
	check('it can be featured', (await apost('pulse', { action: 'feature', id: qid, featured: true })).body.question.featured === true);
	const recount = await apost('pulse', { action: 'recount', id: qid });
	check('a recount from the votes agrees with the tally', recount.body.recount.before === recount.body.recount.after, JSON.stringify(recount.body.recount));

	// A scale, opened straight away.
	const scale = await apost('pulse', { action: 'create', status: 'live', question: { text: 'How has your power supply been this past week?', topic: 'utilities', kind: 'scale', options: vocab.presets.find((p) => p.id === 'rating').options } });
	check('a scale question goes live with its values', scale.body.question.status === 'live' && scale.body.question.options[0].value === 2);

	// Closing: the final count is written onto the question.
	const closed = await apost('pulse', { action: 'close', id: qid });
	check('closing it writes its final count', closed.body.question.status === 'closed' && closed.body.question.final.total === min + 1);
	forgetQuestions();
	const archive = (await get('questions')).body;
	check('it moves to the archive with its final count', archive.closed.some((q) => q.id === qid && q.final.total === min + 1) && !archive.live.some((q) => q.id === qid));
	check('a closed question takes no votes', (await post('vote', { device: device(1), pass: la.body.pass, question: qid, option: 'a' })).body.code === 'closed');
	check('it can be reopened', (await apost('pulse', { action: 'reopen', id: qid })).body.question.status === 'live');

	// The daily job: a closing day passed, then votes a month after closing.
	await store.update('pulse_questions', [['id', 'eq', qid]], { closes_at: day(-1) });
	forgetQuestions();
	// Written straight to the store, so the index is rebuilt by hand. The admin's
	// own changes rebuild it; this one stands in for a date set long ago.
	await rebuildIndex(store);
	check('a question past its closing day reads as closed', (await get('questions')).body.closed.some((q) => q.id === qid));
	check('the daily job needs its secret', (await purge('')).status === 401);
	const settled = await purge('check-cron');
	const after = (await aget('pulse-question', { id: qid })).body.question;
	check('the daily job closes it for good, with its final count', settled.body.settled === 1 && after.raw_status === 'closed' && after.final.total === min + 1, JSON.stringify(settled.body));
	await store.update('pulse_questions', [['id', 'eq', qid]], { closed_at: new Date(Date.now() - (vocab.keepVotesDays + 1) * 86400000).toISOString() });
	forgetQuestions();
	const pruned = await purge('check-cron');
	check('a month after closing its votes are deleted, and the tally stays', pruned.body.deleted === min + 1 && (await store.count('pulse_votes', [['question_id', 'eq', qid]])) === 0 && (await store.get('pulse_tallies', qid)).total === min + 1, JSON.stringify(pruned.body));
	check('and it cannot be reopened to take more', (await apost('pulse', { action: 'reopen', id: qid })).status === 400);

	// The bank.
	const sameText = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();
	const flip = (on, target) => apost('pulse', { action: 'toggle', on, ...target });
	const entryOf = (body, key) => body.bank.find((e) => e.key === key);
	const listing = (await aget('pulse')).body;
	check('the admin lists the whole bank, each with its state', listing.bank.length === bank.length && listing.bank.every((e) => typeof e.on === 'boolean') && listing.settings.cap === vocab.limits.maxLive);
	const okada = listing.bank.find((e) => sameText(e.text, yesno.text));
	check('a question typed with an entry\'s words is that entry\'s', okada?.id === qid && okada.status === 'closed' && !okada.on, JSON.stringify(okada));
	const fresh = await flip(true, { key: okada.key });
	const okadaNow = entryOf(fresh.body, okada.key);
	check('switched on with its votes long gone, an entry starts a new question', fresh.body.toggled?.action === 'on' && okadaNow.on && okadaNow.id !== qid, JSON.stringify(fresh.body.toggled));

	const [e1, e2, e3] = bank.filter((e) => e.key !== okada.key && !e.options && vocab.presets.find((p) => p.id === e.preset).kind === 'scale').slice(0, 3);
	const on1 = await flip(true, { key: e1.key });
	const id1 = on1.body.toggled.id;
	const pub1 = (await get('questions')).body.live.find((q) => q.id === id1);
	const preset1 = vocab.presets.find((p) => p.id === e1.preset);
	check('switching an entry on puts it on the page, answers from its preset', on1.body.toggled.action === 'on' && pub1?.text === e1.text && pub1.options.length === preset1.options.length && pub1.options[0].value === preset1.options[0].value);
	const again = await flip(true, { key: e1.key });
	check('switching it on again changes nothing and writes nothing', again.status === 200 && again.body.toggled.action === null
		&& (await store.select('pulse_questions', { filters: [['bank_key', 'eq', e1.key]] })).length === 1);
	const off1 = await flip(false, { key: e1.key });
	check('switched off before anyone voted, it goes back to waiting', off1.body.toggled.action === 'off' && entryOf(off1.body, e1.key).status === 'draft'
		&& !(await get('questions')).body.live.some((q) => q.id === id1) && (await get('results', { q: id1 })).status === 404);
	const reon1 = await flip(true, { key: e1.key });
	check('switched on again, it is the same question', reon1.body.toggled.action === 'open' && reon1.body.toggled.id === id1);
	const p30 = await post('pass', { device: device(30), ...accra });
	await post('vote', { device: device(30), pass: p30.body.pass, question: id1, option: 'a' });
	const closed1 = await flip(false, { key: e1.key });
	check('switched off after a vote, it closes with its result final', closed1.body.toggled.action === 'close'
		&& (await get('questions')).body.closed.some((q) => q.id === id1 && q.final.total === 1));
	const reopened1 = await flip(true, { key: e1.key });
	const p31 = await post('pass', { device: device(31), ...accra });
	const v31 = await post('vote', { device: device(31), pass: p31.body.pass, question: id1, option: 'b' });
	check('switched on again, its count carries on', reopened1.body.toggled.action === 'reopen' && reopened1.body.toggled.id === id1 && v31.body.results.total === 2);
	check('a question switches by its id too', (await flip(false, { id: id1 })).body.toggled.action === 'close');
	check('an entry that is not in the bank is refused', (await flip(true, { key: 'no-such-question' })).status === 404);

	// The limit on open questions is the admin's.
	const openNow = (await get('questions')).body.live.length;
	await apost('settings', { what: 'pulse', pulse: { paused: false, limits: { maxLive: openNow + 1 } } });
	forgetSettings();
	check('the limit can be set', (await aget('pulse')).body.settings.cap === openNow + 1);
	check('up to the limit, an entry switches on', (await flip(true, { key: e2.key })).body.toggled?.action === 'on');
	const full = await flip(true, { key: e3.key });
	check('past it, it is refused and says why', full.status === 400 && full.body.code === 'full', JSON.stringify(full.body));
	check('a limit outside 1 to 100 is not saved', (await apost('settings', { what: 'pulse', pulse: { paused: false, limits: { maxLive: 500 } } })).body.pulse.limits.maxLive === undefined);
	forgetSettings();

	// What the public list costs, however many are open.
	if (stats) {
		forgetIndex();
		forgetSettings();
		const before = stats.reads.length;
		const page = (await get('questions')).body;
		const reads = stats.reads.slice(before);
		check(`listing ${page.live.length + page.closed.length} questions reads no question and no tally`, !reads.some((r) => /pulse_questions|pulse_tallies/.test(r)) && reads.filter((r) => r.startsWith('get')).length <= 2, reads.join(', '));
	}

	// The page's count of votes and every tally agree, after all of it.
	const totals = (await store.get('pulse_meta', 'totals'))?.counts || {};
	const disagree = [];
	for (const q of await store.select('pulse_questions', {})) {
		const t = Math.max(0, (await store.get('pulse_tallies', q.id))?.total || 0);
		if (Math.max(0, totals[q.id] || 0) !== t) disagree.push(`${q.id} ${totals[q.id]} vs ${t}`);
	}
	check('every question\'s count on the page equals its tally', disagree.length === 0, disagree.join('; '));
	for (const key of [e2.key, okada.key]) await flip(false, { key });

	// Too many open at once.
	const opens = [];
	for (let i = 0; i < vocab.limits.maxLive; i++) opens.push(await apost('pulse', { action: 'create', status: 'live', question: { ...yesno, text: `Is question number ${i} worth asking?` } }));
	check(`no more than ${vocab.limits.maxLive} questions open at once`, opens.some((r) => r.status === 400));

	// Deleting needs the reference typed.
	const sid = scale.body.question.id;
	check('deleting without the reference is refused', (await apost('pulse', { action: 'delete', id: sid })).status === 400);
	check('deleting with it removes it', (await apost('pulse', { action: 'delete', id: sid, confirm: `P-${sid.toUpperCase()}` })).body.deleted === sid && !(await store.get('pulse_tallies', sid)));
	check('and from the page and its count', !(await get('questions')).body.live.some((q) => q.id === sid) && !((await store.get('pulse_meta', 'totals'))?.counts?.[sid] > 0));
	check('every admin change is in the log', (await aget('log')).body.entries.filter((e) => e.action.startsWith('pulse.')).length >= 8);

	await close();
}

const file = path.join(os.tmpdir(), `pulse-check-${process.pid}-${Date.now()}.json`);
await suite('a JSON file', { ...common, LOSTFOUND_FILE: file });
const fake = await startFakeFirestore();
await suite('the stand-in Firestore', { ...common, FIRESTORE_EMULATOR_HOST: fake.host, FIRESTORE_PROJECT: 'check' }, fake.stats);
check('no query needed an index nobody declared', fake.stats.refused === 0, `${fake.stats.refused} refused of ${fake.stats.queries}`);
await fake.close();

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
