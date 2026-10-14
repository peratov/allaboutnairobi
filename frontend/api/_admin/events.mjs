// The events calendar, edited from the admin and committed to GitHub.
//
// content/events-calendar.yaml is hand-maintained, with comments that explain
// the rules, so it is never round-tripped through a YAML library that would
// strip them. Each event is a block beginning "  - title:", and an edit
// replaces, adds or removes exactly one block: every other byte of the file,
// comments included, is left as it was. A new or changed block is written in
// one canonical shape, and the result is parsed back and compared before
// anything is committed - a block that would not read back as written is
// refused rather than published.
//
// The commit is an ordinary push to master, made with GITHUB_TOKEN (a
// fine-grained token with Contents read and write on this repository only),
// so Vercel builds it like any other change and the build's own checks still
// run. If the build fails, the site keeps serving the last good one and the
// Site tab says the live commit is behind master.

import { HttpError } from '../_lostfound/http.mjs';

export const PATH = 'frontend/content/events-calendar.yaml';
export const CATEGORIES = ['culture', 'music', 'tech', 'business', 'sport', 'food', 'family', 'civic'];
export const CATEGORY_LABELS = { culture: 'Culture', music: 'Music', tech: 'Tech', business: 'Business', sport: 'Sport', food: 'Food', family: 'Family', civic: 'Civic' };
// `time` and `organiser` arrived with submissions from organisers: a start
// time in words ("7pm", "Doors 6pm") and who runs it. Both optional.
const FIELDS = ['title', 'starts', 'ends', 'time', 'annual', 'when', 'venue', 'area', 'organiser', 'category', 'price', 'url', 'description', 'source', 'last_verified'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

// --- reading ----------------------------------------------------------------------------

function scalar(raw) {
	const value = raw.trim();
	if (value === '') return '';
	if (value === 'true') return true;
	if (value === 'false') return false;
	if (value.startsWith('"')) return JSON.parse(value);
	if (value.startsWith("'")) return value.slice(1, -1).replace(/''/g, "'");
	return value.replace(/\s+#.*$/, '');
}

/** Every event block in the file: where it starts and ends, and what it says. */
export function parseEvents(text) {
	// A Windows checkout has CRLF; GitHub's copy has LF. Either reads the same,
	// and a change is written back in whichever the file already uses.
	const eol = text.includes('\r\n') ? '\r\n' : '\n';
	const lines = text.split(/\r?\n/);
	const startOfList = lines.findIndex((l) => l.startsWith('events:'));
	if (startOfList < 0) throw new Error('No events: list in the calendar file.');
	const blocks = [];
	let i = startOfList + 1;
	while (i < lines.length) {
		if (!lines[i].startsWith('  - title:')) { i++; continue; }
		const start = i;
		const fields = {};
		let key = null;
		let folded = null;
		const take = (line) => {
			const m = /^ {2}(?:- | {2})([a-z_]+):(.*)$/.exec(line);
			if (m) {
				key = m[1];
				if (m[2].trim() === '>-' || m[2].trim() === '>') { folded = []; fields[key] = ''; } else { folded = null; fields[key] = scalar(m[2]); }
				return true;
			}
			if (folded && /^ {6}\S/.test(line)) {
				folded.push(line.trim());
				fields[key] = folded.join(' ');
				return true;
			}
			return false;
		};
		take(lines[i]);
		i++;
		while (i < lines.length && lines[i] !== '' && !lines[i].startsWith('  - ') && !/^\s*#/.test(lines[i]) && take(lines[i])) i++;
		blocks.push({ start, end: i, event: fields });
	}
	return { lines, blocks, eol };
}

// --- writing --------------------------------------------------------------------------------

const PLAIN = /^[A-Za-z0-9][A-Za-z0-9 ,.()/&'+-]*$/;
const quote = (value) => (PLAIN.test(value) && !/: |\s#/.test(value) && !/^(true|false|null|yes|no|on|off)$/i.test(value) ? value : JSON.stringify(value));

function wrap(text, width = 76) {
	const out = [];
	let line = '';
	for (const word of text.split(/\s+/).filter(Boolean)) {
		if (line && (line.length + 1 + word.length) > width) { out.push(line); line = word; } else line = line ? `${line} ${word}` : word;
	}
	if (line) out.push(line);
	return out;
}

export function renderEvent(event) {
	const out = [];
	for (const key of FIELDS) {
		const value = event[key];
		if (value === undefined || value === null || value === '' || value === false) continue;
		const lead = out.length ? '    ' : '  - ';
		if (key === 'description') {
			out.push(`${lead}description: >-`, ...wrap(String(value)).map((l) => `      ${l}`));
		} else if (value === true) {
			out.push(`${lead}${key}: true`);
		} else if (key === 'starts' || key === 'ends' || key === 'last_verified') {
			out.push(`${lead}${key}: ${value}`);
		} else {
			out.push(`${lead}${key}: ${quote(String(value))}`);
		}
	}
	return out;
}

// --- checking what comes in -------------------------------------------------------------------

const clean = (value, max, label, required = false) => {
	const text = String(value ?? '').replace(/\s+/g, ' ').trim();
	if (required && !text) throw new HttpError(400, `${label} is missing.`, 'invalid');
	if (text.length > max) throw new HttpError(400, `${label} is too long - keep it under ${max} characters.`, 'invalid');
	return text;
};

export function validEvent(input) {
	const e = {
		title: clean(input.title, 100, 'The title', true),
		venue: clean(input.venue, 140, 'The venue', true),
		area: clean(input.area, 80, 'The area'),
		organiser: clean(input.organiser, 100, 'The organiser'),
		category: CATEGORIES.includes(input.category) ? input.category : null,
		price: clean(input.price, 60, 'The price note'),
		url: clean(input.url, 300, 'The link'),
		description: clean(input.description, 900, 'The description', true),
		source: clean(input.source, 200, 'The source', true),
		last_verified: String(input.last_verified || ''),
	};
	if (!e.category) throw new HttpError(400, 'Pick a category.', 'invalid');
	if (e.url && !/^https:\/\/[^\s]+$/.test(e.url)) throw new HttpError(400, 'The link has to start with https://', 'invalid');
	if (!DATE.test(e.last_verified)) throw new HttpError(400, 'Say when the details were last checked.', 'invalid');
	if (input.annual) {
		// The rule the file states at the top: an annual fixture with no
		// announced date carries a note, never an invented date.
		e.annual = true;
		e.when = clean(input.when, 80, 'When it usually happens', true);
		if (input.starts) throw new HttpError(400, 'An annual event without confirmed dates takes a "when" note, not a date. Add the date once it is announced.', 'invalid');
	} else {
		e.starts = String(input.starts || '');
		if (!DATE.test(e.starts)) throw new HttpError(400, 'Give the date it starts.', 'invalid');
		e.time = clean(input.time, 40, 'The time');
		if (input.ends) {
			e.ends = String(input.ends);
			if (!DATE.test(e.ends) || e.ends < e.starts) throw new HttpError(400, 'The end date has to be on or after the start.', 'invalid');
			if (e.ends === e.starts) delete e.ends;
		}
	}
	return e;
}

/** The new file text, after one change - checked by reading it back. */
export function applyChange(text, { action, index, event }) {
	const { lines, blocks, eol } = parseEvents(text);
	const target = Number.isInteger(index) ? blocks[index] : null;
	if ((action === 'edit' || action === 'remove') && !target) throw new HttpError(409, 'That event has moved. Reload and try again.', 'stale');
	let next;
	if (action === 'add') {
		const body = renderEvent(event);
		const tail = lines.length && lines[lines.length - 1] === '' ? lines.slice(0, -1) : lines;
		next = [...tail, '', ...body, ''];
	} else if (action === 'edit') {
		next = [...lines.slice(0, target.start), ...renderEvent(event), ...lines.slice(target.end)];
	} else if (action === 'remove') {
		const from = target.start > 0 && lines[target.start - 1] === '' ? target.start - 1 : target.start;
		next = [...lines.slice(0, from), ...lines.slice(target.end)];
	} else throw new HttpError(400, 'Unknown action.', 'invalid');

	const result = next.join(eol);
	const after = parseEvents(result).blocks.map((b) => b.event);
	const before = blocks.map((b) => b.event);
	const expected = action === 'add' ? [...before, event] : action === 'edit' ? before.map((e, i) => (i === index ? event : e)) : before.filter((_, i) => i !== index);
	const norm = (v) => (v === undefined || v === null || v === '' || v === false ? null : v);
	const same = (a, b) => JSON.stringify(FIELDS.map((k) => norm(a[k]))) === JSON.stringify(FIELDS.map((k) => norm(b[k])));
	if (after.length !== expected.length || !after.every((e, i) => same(e, expected[i]))) {
		throw new HttpError(500, 'That change would not read back as written, so it was not committed.', 'roundtrip');
	}
	return result;
}

// --- GitHub ---------------------------------------------------------------------------------------

export function repoOf(env) {
	return env.VERCEL_GIT_REPO_OWNER && env.VERCEL_GIT_REPO_SLUG ? `${env.VERCEL_GIT_REPO_OWNER}/${env.VERCEL_GIT_REPO_SLUG}` : 'peratov/allaboutnairobi';
}

async function github(env, path, init = {}) {
	if (!env.GITHUB_TOKEN) throw new HttpError(503, 'Set GITHUB_TOKEN in Vercel - a fine-grained token with Contents read and write on this repository - to edit events from here.', 'not-configured');
	const response = await fetch(`https://api.github.com/repos/${repoOf(env)}/${path}`, {
		...init,
		headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'allaboutnairobi-admin', Authorization: `Bearer ${env.GITHUB_TOKEN}`, ...(init.headers || {}) },
		signal: AbortSignal.timeout(10000),
	});
	const payload = await response.json().catch(() => ({}));
	if (response.status === 409 || response.status === 422) throw new HttpError(409, 'The calendar changed since you opened it. Reload and make the change again.', 'stale');
	if (response.status === 401 || response.status === 403 || response.status === 404) {
		throw new HttpError(503, init.method === 'PUT' ? 'GitHub refused the commit: GITHUB_TOKEN needs Contents read and write on this repository.' : 'GitHub refused: check GITHUB_TOKEN can read this repository.', 'github');
	}
	if (!response.ok) throw new HttpError(502, `GitHub answered ${response.status}.`, 'github');
	return payload;
}

export async function readCalendar(env) {
	const file = await github(env, `contents/${PATH}?ref=master`);
	const text = Buffer.from(file.content, 'base64').toString('utf8');
	return { text, sha: file.sha, events: parseEvents(text).blocks.map((b) => b.event) };
}

export async function commitCalendar(env, { text, sha, message }) {
	const answer = await github(env, `contents/${PATH}`, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ message, content: Buffer.from(text, 'utf8').toString('base64'), sha, branch: 'master' }),
	});
	return { commit: answer.commit?.sha || '', url: answer.commit?.html_url || '' };
}
