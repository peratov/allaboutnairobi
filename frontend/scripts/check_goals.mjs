// Checks of the admin's goals: what counts as a winnable search, how each
// goal is measured for a window, how on track it is judged, and the route
// itself - against stand-ins for Search Console and GA4 that answer like the
// real thing, with a site that grows the way this one did.
//
//   node scripts/check_goals.mjs            (or: mise check-goals)
//   node scripts/check_goals.mjs --dump F   also writes the view to F, to look at
//
// What it holds them to: only winnable searches count toward the search goals;
// a baseline "a day" is over the days the site existed, not the whole window;
// every status follows from the numbers; a target can be moved, checked and
// put back, and only by the owner; a source that is not connected says so
// for its own goals and leaves the others alone; Google is asked once per
// half hour, not once per view.

import { createServer } from 'node:http';
import { generateKeyPairSync } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import adminHandler from '../api/admin.mjs';
import { sessionCookie } from '../api/_admin/auth.mjs';
import { configuredStore } from '../api/_lostfound/store.mjs';
import { BASELINE, GOALS, assess, audienceMetrics, resolveTarget, searchMetrics, winnable } from '../api/_admin/goals.mjs';
import { startFakeFirestore } from './fake_firestore.mjs';

let failures = 0;
const check = (label, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`); if (!ok) failures++; };
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;
const DAY = 86400000;
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const at = (d) => Date.parse(`${d}T00:00:00Z`);

// --- winnable -------------------------------------------------------------------------------

const page = (p) => `https://www.allaboutnairobi.com${p}`;
check('a portal\'s name is not winnable', !winnable({ query: 'icums', page: page('/glossary/icums') }) && !winnable({ query: 'icums ghana login', page: page('/guides/using-icums-ghana') }));
check('"near me" is not winnable', !winnable({ query: 'pharmacy near me', page: page('/guides/pharmacies') }) && !winnable({ query: 'chop bar nearby', page: page('/guides/chop-bars-in-accra') }));
check('a glossary page is not winnable', !winnable({ query: 'what is chop money', page: page('/glossary/chop-money') }));
check('a guide answering a task is', winnable({ query: 'how to open a bank account online in ghana', page: page('/guides/open-a-bank-account') }) && winnable({ query: 'rent advance law ghana', page: page('/guides/rent-advance') }));

// --- measuring one window --------------------------------------------------------------------

const w = { start: '2026-08-27', end: '2026-09-23' };
const daily = [{ date: '2026-09-09', clicks: 1, impressions: 50 }, { date: '2026-09-20', clicks: 4, impressions: 900 }, { date: '2026-09-24', clicks: 99, impressions: 9999 }];
const pairs = [
	{ query: 'icums', page: page('/glossary/icums'), clicks: 2, impressions: 9000, position: 7 },
	{ query: 'pharmacy near me', page: page('/guides/pharmacies'), clicks: 0, impressions: 300, position: 8 },
	{ query: 'rent advance', page: page('/guides/rent-advance'), clicks: 3, impressions: 400, position: 6 },
	{ query: 'birth certificate ghana', page: page('/guides/birth-certificate'), clicks: 0, impressions: 200, position: 10 },
	{ query: 'birth certificate ghana', page: page('/guides/death-certificate'), clicks: 0, impressions: 40, position: 40 },
	{ query: 'open bank account', page: page('/guides/open-a-bank-account'), clicks: 0, impressions: 5, position: 3 },
];
const pagesRows = [{ page: page('/a'), clicks: 1, impressions: 9 }, { page: page('/b'), clicks: 0, impressions: 3 }, { page: page('/c'), clicks: 0, impressions: 0 }];
const m = searchMetrics({ daily, pairs, pages: pagesRows, window: w, first: '2026-09-09' });
check('clicks a day count only the window, over the days the site existed', near(m.clicks, 5 / 15), String(m.clicks));
check('winnable impressions leave out the portal, near me and the glossary', near(m.impressions, (400 + 200 + 40 + 5) / 15));
check('winnable click-through is winnable clicks over winnable impressions', near(m.ctr, 3 / 645));
check('page one is a winnable query at ten or better, seen ten times', m.pageOne === 2);
check('pages seen and pages clicked', m.pagesSeen === 2 && m.pagesClicked === 1);
check('a window before the site existed has no "a day"', searchMetrics({ daily, pairs: [], pages: [], window: { start: '2026-08-01', end: '2026-08-28' }, first: '2026-09-09' }).clicks === null);
const a = audienceMetrics({ daily: [{ date: '2026-09-22', users: 30 }, { date: '2026-09-23', users: 50 }], channels: [{ channel: 'Organic Search', sessions: 30 }, { channel: 'Direct', sessions: 70 }], window: w, first: '2026-09-22' });
check('visitors a day, and the share from search', near(a.visitors, 40) && near(a.searchShare, 0.3));

// --- judging -----------------------------------------------------------------------------------

const goal = (id) => GOALS.find((g) => g.id === id);
const mid = at(BASELINE.end) + (at('2026-12-15') - at(BASELINE.end)) / 2;
const clicksAt = (current) => assess(goal('clicks'), { baseline: 1, current, target: 9 }, mid);
check('halfway in time and three times up on a log scale is on track', clicksAt(3).status === 'on-track' && near(clicksAt(3).progress, 0.5, 1e-9));
check('halfway in time and a third of the way is behind', clicksAt(2).status === 'behind');
check('halfway in time and barely moved is off track', clicksAt(1.1).status === 'off-track');
check('at the target it is reached', clicksAt(9).status === 'reached');
check('the pace by halfway is the geometric middle', near(clicksAt(1).pace, 3, 1e-9));
check('the projection carries the line from the baseline on', clicksAt(2).projected === iso(at(BASELINE.end) + (mid - at(BASELINE.end)) / (Math.log(2) / Math.log(9))));
check('what it needs is a weekly multiple for a count', clicksAt(3).needed.kind === 'growth' && clicksAt(3).needed.perWeek > 0);
const ctrAt = (current, when = mid) => assess(goal('ctr'), { baseline: 0.002, current, target: 0.012 }, when);
check('a rate is judged on a straight line', near(ctrAt(0.007).progress, 0.5) && ctrAt(0.007).status === 'on-track' && ctrAt(0.007).needed.kind === 'step');
check('days after the baseline it is too early to say', ctrAt(0.002, at(BASELINE.end) + 3 * DAY).status === 'early');
check('past its date and short of it, missed', ctrAt(0.005, at('2027-01-10')).status === 'missed');
check('no measurement, no verdict', assess(goal('ctr'), { baseline: null, current: 0.01, target: 0.012 }).status === 'unknown');
check('a target of three times the baseline is worked out from it', resolveTarget(goal('pageOne'), 11) === 33 && resolveTarget(goal('pageOne'), null) === null);

// --- the route, against stand-ins for Google -----------------------------------------------------

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const key = JSON.stringify({ type: 'service_account', project_id: 'check', client_email: 'site@check.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) });

// A site that appeared in search on 9 September and has grown since: clicks
// and impressions a day rising, most impressions on a portal's name early on.
const FIRST = '2026-09-09';
const growth = (d) => Math.max(0, (at(d) - at(FIRST)) / DAY);
const clicksOn = (d) => (d < FIRST ? 0 : Math.round(0.3 * 1.045 ** growth(d)));
const impressionsOn = (d) => (d < FIRST ? 0 : Math.round(300 * 1.03 ** growth(d)));
function scAnswer(body) {
	const dims = body.dimensions || [];
	const days = [];
	for (let d = body.startDate; d <= body.endDate; d = iso(at(d) + DAY)) if (d >= FIRST) days.push(d);
	if (dims.join() === 'date') return { rows: days.map((d) => ({ keys: [d], clicks: clicksOn(d), impressions: impressionsOn(d) })) };
	const scale = days.length ? days.reduce((n, d) => n + impressionsOn(d), 0) / 1000 : 0;
	const clicks = days.reduce((n, d) => n + clicksOn(d), 0);
	if (dims.join() === 'query,page') {
		const rows = [
			{ keys: ['icums', page('/glossary/icums')], clicks: 0, impressions: Math.round(700 * scale), position: 7.2 },
			{ keys: ['pharmacy near me', page('/guides/pharmacies-in-accra')], clicks: 0, impressions: Math.round(30 * scale), position: 8 },
		];
		const pageOne = Math.round(scale * 2);
		for (let i = 0; i < pageOne; i++) rows.push({ keys: [`winnable query ${i}`, page(`/guides/g${i % 40}`)], clicks: i < clicks ? 1 : 0, impressions: 12, position: 4 + (i % 6) });
		rows.push({ keys: ['page two query', page('/guides/rent-in-accra')], clicks: 0, impressions: Math.round(40 * scale), position: 14 });
		return { rows };
	}
	if (dims.join() === 'page') return { rows: Array.from({ length: Math.min(340, Math.round(60 + scale * 8)) }, (_, i) => ({ keys: [page(`/guides/p${i}`)], clicks: i < clicks / 2 ? 1 : 0, impressions: 5 })) };
	return { rows: [] };
}
function gaAnswer(req) {
	const dims = (req.dimensions || []).map((d) => d.name);
	const { startDate, endDate } = req.dateRanges[0];
	const days = [];
	for (let d = startDate; d <= endDate; d = iso(at(d) + DAY)) days.push(d);
	const users = (d) => Math.round(40 * 1.02 ** growth(d));
	if (dims[0] === 'date') return { rows: days.map((d) => ({ dimensionValues: [{ value: d.replace(/-/g, '') }], metricValues: [{ value: String(users(d)) }, { value: String(users(d) + 5) }] })) };
	const total = days.reduce((n, d) => n + users(d), 0);
	const organicShare = 0.12 + 0.002 * growth(endDate);
	return { rows: [['Organic Search', organicShare], ['Direct', 0.6], ['Referral', 0.28 - 0.002 * growth(endDate)]].map(([c, s]) => ({ dimensionValues: [{ value: c }], metricValues: [{ value: String(Math.round(total * s)) }] })) };
}
const realFetch = globalThis.fetch;
const calls = { sc: 0, ga: 0 };
const stand = { scAccess: true, gaProperty: '123' };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
globalThis.fetch = async (url, init = {}) => {
	const u = String(url);
	if (u === 'https://oauth2.googleapis.com/token') return json({ access_token: 'sa-token', expires_in: 3600 });
	if (u.startsWith('https://searchconsole.googleapis.com/')) {
		calls.sc++;
		if (!stand.scAccess) return json({ error: { message: 'User does not have sufficient permission for site' } }, 403);
		return json(scAnswer(JSON.parse(init.body)));
	}
	if (u.startsWith('https://analyticsdata.googleapis.com/')) {
		calls.ga++;
		if (!u.includes(`/properties/${stand.gaProperty}:`)) return json({ error: { message: 'no access' } }, 403);
		return json({ reports: JSON.parse(init.body).requests.map(gaAnswer) });
	}
	if (u.startsWith('http://localhost') || u.startsWith('http://127.0.0.1')) return realFetch(url, init);
	throw new Error(`unexpected fetch ${u}`);
};

// The stand-in Firestore holds the data; the key is there for Google, as on
// Vercel, where one service account is both.
const fake = await startFakeFirestore();
const env = { FIRESTORE_EMULATOR_HOST: fake.host, FIRESTORE_PROJECT: 'check', FIRESTORE_CREDENTIALS: key, GA4_PROPERTY_ID: '123', ADMIN_SESSION_SECRET: 'check-session-secret-that-is-long-enough', GOOGLE_CLIENT_ID: 'x', GOOGLE_CLIENT_SECRET: 'y', LOSTFOUND_SALT: 'check' };
const store = configuredStore(env);
const server = createServer((req, res) => adminHandler(req, res, env));
await new Promise((resolve) => server.listen(0, resolve));
const base = `http://localhost:${server.address().port}`;
const owner = sessionCookie(env).split(';')[0];
const get = async (query = '', cookie = owner) => {
	const res = await fetch(`${base}/api/admin?r=goals${query}`, { headers: cookie ? { Cookie: cookie } : {} });
	return { status: res.status, body: await res.json() };
};
const post = async (body, cookie = owner) => {
	const res = await fetch(`${base}/api/admin?r=goals`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) });
	return { status: res.status, body: await res.json() };
};

// The newsletter list: three confirmed, one of them this week.
for (const [i, status] of ['subscribed', 'subscribed', 'subscribed', 'pending'].entries()) await store.insert('nl_subscribers', { id: `s${i}`, status, list_key: `${status}|2026-10-0${i + 1}|s${i}` });
await store.write([{ table: 'nl_days', id: iso(Date.now()), add: { confirmed: 1 }, merge: { day: iso(Date.now()) } }]);

check('only the owner sees the goals', (await get('', '')).status === 401);
const first = await get();
const v = first.body;
const g = (id) => v.goals.find((x) => x.id === id);
check('every goal comes back, with a status', first.status === 200 && v.goals.length === GOALS.length && v.goals.every((x) => x.status), JSON.stringify(v.summary));
check('the summary counts every goal once', Object.values(v.summary).reduce((n, x) => n + x, 0) === GOALS.length);
const expectBaselineClicks = (() => { let n = 0; for (let d = FIRST; d <= BASELINE.end; d = iso(at(d) + DAY)) n += clicksOn(d); return n / 15; })();
check('the baseline is read from Google for the fixed window', near(g('clicks').baseline, expectBaselineClicks, 1e-9), `${g('clicks').baseline} vs ${expectBaselineClicks}`);
check('now is the latest complete 28 days, three days back', v.windows.sc.current.end === iso(Date.now() - 3 * DAY) && v.windows.sc.current.start === iso(Date.now() - 30 * DAY));
check('and is compared with the 28 days before', v.windows.sc.previous.end === iso(Date.now() - 31 * DAY));
check('clicks are measured now and before, and have grown', g('clicks').current > g('clicks').previous && g('clicks').current > g('clicks').baseline && g('clicks').previous !== null);
check('the portal and near me never count toward impressions', g('impressions').current < impressionsOn(iso(Date.now() - 3 * DAY)));
check('a target of three times the baseline is set from the measurement', g('pageOne').target === Math.max(1, Math.ceil(g('pageOne').baseline * 3)) && g('pageOne').defaults.rule === '3 times the baseline');
check('visitors and the search share come from GA4', g('visitors').ready && g('visitors').current > g('visitors').baseline && g('searchShare').current > g('searchShare').baseline);
check('subscribers are the site\'s own count, and the 28 days before', g('subscribers').current === 3 && g('subscribers').previous === 2 && g('subscribers').baseline === 0);
check('a status follows from the numbers', v.goals.filter((x) => x.ready).every((x) => x.status === assess({ scale: x.scale, by: x.by, from: x.from }, { baseline: x.baseline, current: x.current, target: x.target }).status));
check('the list is judged from the day it began, not from September', g('subscribers').from === iso(Date.now()) && g('clicks').from === BASELINE.end);
const t = v.trends.clicks;
check('the clicks trend runs every day from the first, with the pace beside it', t.dates[0] === FIRST && t.dates.every((d, i) => !i || at(d) - at(t.dates[i - 1]) === DAY) && t.pace.length === t.dates.length);
check('the pace starts at the baseline and climbs toward the target', near(t.pace[0], g('clicks').baseline, 1e-9) && t.pace.every((p, i) => !i || p >= t.pace[i - 1] - 1e-12));

const before = { ...calls };
await get();
check('a second look within the half hour asks Google nothing', calls.sc === before.sc && calls.ga === before.ga);
await get('&fresh=1');
check('the refresh button asks again', calls.sc > before.sc && calls.ga > before.ga);

// Moving a target.
const moved = await post({ action: 'target', id: 'clicks', target: 20, by: '2027-03-31' });
check('a target can be moved', moved.status === 200 && moved.body.goals.find((x) => x.id === 'clicks').target === 20 && moved.body.goals.find((x) => x.id === 'clicks').by === '2027-03-31');
check('and says it is the owner\'s, with the default beside it', moved.body.goals.find((x) => x.id === 'clicks').changed === true && moved.body.goals.find((x) => x.id === 'clicks').defaults.target === 10);
check('a share over 100% is refused', (await post({ action: 'target', id: 'ctr', target: 1.5, by: '2027-01-01' })).status === 400);
check('a date in the past is refused', (await post({ action: 'target', id: 'clicks', target: 5, by: '2026-01-01' })).status === 400);
check('an unknown goal is refused', (await post({ action: 'target', id: 'nope', target: 5, by: '2027-01-01' })).status === 400);
check('nobody but the owner can move one', (await post({ action: 'target', id: 'clicks', target: 1, by: '2027-01-01' }, '')).status === 401);
const reset = await post({ action: 'reset', id: 'clicks' });
check('and the default can be put back', reset.body.goals.find((x) => x.id === 'clicks').target === 10 && !reset.body.goals.find((x) => x.id === 'clicks').changed);
const logRows = await store.select('lf_admin_log', {});
check('every change is in the activity log', logRows.filter((r) => r.action === 'goals.target').length === 2);

if (process.argv.includes('--dump')) writeFileSync(process.argv[process.argv.indexOf('--dump') + 1], JSON.stringify((await get()).body, null, '\t'));

// A source not connected says so for its own goals only.
stand.scAccess = false;
const noSearch = (await get('&fresh=1')).body;
check('without Search Console, its goals say so and the rest still measure', noSearch.sources.sc.ready === false && noSearch.sources.sc.reason === 'access' && noSearch.goals.filter((x) => x.source === 'sc').every((x) => !x.ready && x.status === 'unknown') && noSearch.goals.find((x) => x.id === 'visitors').ready);
stand.scAccess = true;
stand.gaProperty = '999';
const noGa = (await get('&fresh=1')).body;
check('without GA4, the same', noGa.sources.ga.ready === false && noGa.goals.filter((x) => x.source === 'ga').every((x) => !x.ready) && noGa.goals.find((x) => x.id === 'clicks').ready && noGa.trends.visitors === null);

check('no query needed an index nobody declared', fake.stats.refused === 0);
await new Promise((resolve) => server.close(resolve));
await fake.close();
console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
