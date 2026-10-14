// Fills the local dev server's file with Accra Pulse questions and a few
// hundred votes spread across the districts, so the map has something to draw
// while it is being worked on.
//
//   node scripts/pulse_dev_seed.mjs        then: mise lostfound-dev
//
// It writes only to frontend/.lostfound-dev.json, which is git-ignored, and
// refuses to run against any other store. Stop `mise lostfound-dev` first: two
// processes saving one file each write over the other's changes. The votes are
// invented, for a developer's eyes only: nothing here may ever reach the real
// database or the published site - the same rule as not seeding ratings.yaml.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { configuredStore } from '../api/_lostfound/store.mjs';
import { routes } from '../api/_pulse/handlers.mjs';
import { pulseRoutes } from '../api/_pulse/admin.mjs';
import { unproject } from '../api/_pulse/geo.mjs';
import vocab from '../api/_pulse/vocab.mjs';
import bank from '../api/_pulse/bank.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const env = { LOSTFOUND_FILE: path.resolve(here, '..', '.lostfound-dev.json'), ADMIN_SESSION_SECRET: 'a-local-development-secret-only-for-localhost', LOSTFOUND_SALT: 'dev' };
const store = configuredStore(env);
if (store.kind !== 'file') throw new Error('file store only');
const map = JSON.parse(readFileSync(path.resolve(here, '..', 'templates/geo/accra-map.json'), 'utf8'));

const create = async (question, status) => (await pulseRoutes.pulseAction({ store, body: { action: 'create', status, question } })).question;
const preset = (id) => vocab.presets.find((p) => p.id === id);
const okada = await create({ text: 'Should okada be made legal in Accra?', context: 'Motorbike taxis carry people all over the city, whatever the rules say.', topic: 'transport', kind: 'choice', options: preset('yesnounsure').options, featured: true }, 'live');
const power = await create({ text: 'How has your power supply been this past week?', context: 'Think of the lights in your own home, not the news.', topic: 'utilities', kind: 'scale', options: preset('rating').options }, 'live');
const fix = await create({ text: 'What should the city fix first?', topic: 'government', kind: 'choice', options: ['Roads', 'Drains and flooding', 'Rubbish', 'Street lights', 'Traffic', 'Housing'].map((label) => ({ label })) }, 'live');
const old = await create({ text: 'Is rubbish collected regularly on your street?', topic: 'environment', kind: 'choice', options: ['Yes, every week', 'Sometimes', 'No, hardly ever'].map((label) => ({ label })) }, 'live');

let seed = 7;
const rand = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
const pick = (weights) => { let r = rand() * weights.reduce((a, b) => a + b, 0); for (let i = 0; i < weights.length; i++) { if ((r -= weights[i]) < 0) return i; } return weights.length - 1; };
// Busier near the centre, quieter on the plains - a believable spread.
const busy = { 'accra-metropolitan': 60, 'la-dade-kotopon-municipal': 45, 'ayawaso-west-wuogon-municipal': 40, 'tema-metropolitan': 35, 'ga-east-municipal': 30, 'adenta-municipal': 28, 'ledzokuku-municipal': 25, 'korle-klottey-municipal': 30, 'krowor-municipal': 22, 'ga-west-municipal': 18, 'weija-gbawe-municipal': 16, 'kpone-katamanso-municipal': 14, 'ashaiman-municipal': 20, 'la-nkwantanang-madina-municipal': 24, 'okaikwei-north-municipal': 12 };
let n = 0;
for (const d of map.districts) {
	const voters = busy[d.id] ?? Math.floor(rand() * 9);
	const p = unproject(d.cx, d.cy);
	const east = d.cx > 9600;
	for (let i = 0; i < voters; i++) {
		const device = `seed-${d.id.slice(0, 10)}-${String(i).padStart(4, '0')}-xyz`;
		const { pass } = await routes.pass({ store, env, ip: `seed-${n}`, body: { device, lat: p.lat, lon: p.lon, accuracy: 20 } });
		const vote = (q, weights) => routes.vote({ store, env, body: { device, pass, question: q.id, option: q.options[pick(weights)].id } });
		await vote(okada, east ? [60, 30, 10] : [35, 50, 15]);
		await vote(power, d.id.startsWith('ga-') || d.id.startsWith('weija') ? [2, 8, 20, 40, 30] : [10, 25, 35, 20, 10]);
		if (rand() < 0.8) await vote(fix, d.type === 'District' ? [40, 15, 10, 15, 5, 15] : [15, 35, 20, 10, 15, 5]);
		if (rand() < 0.7) await vote(old, east ? [50, 30, 20] : [20, 35, 45]);
		n++;
	}
}
await pulseRoutes.pulseAction({ store, body: { action: 'close', id: old.id } });
// Five more from the bank, one a topic, so the page has enough open to show
// its topic filter. Nobody has voted on these.
const topics = new Set([okada, power, fix].map((q) => q.topic));
for (const entry of bank) {
	if (topics.size >= 8) break;
	if (topics.has(entry.topic) || [okada, power, fix, old].some((q) => q.text === entry.text)) continue;
	topics.add(entry.topic);
	await pulseRoutes.pulseAction({ store, body: { action: 'toggle', on: true, key: entry.key } });
}
console.log(`seeded ${n} voters across ${map.districts.length} districts; questions ${okada.id} ${power.id} ${fix.id}, closed ${old.id}`);
