// Local development server for lost and found.
//
// Serves the built site from output/ the way Vercel does (extensionless URLs,
// then index.html, then the 404 page) and routes /api/lost-found, /api/pulse
// and /api/admin to the real serverless functions, with a JSON file standing in
// for the database. So the whole system - reporting, claiming, the manage
// link, a place's portal, the admin - can be driven end to end with no
// database and no network.
//
//   node scripts/lostfound-dev.mjs [port]
//
// The data file is .lostfound-dev.json beside this script's parent folder,
// git-ignored. Delete it to start empty. /admin signs in as the owner
// without Google - ADMIN_DEV_LOGIN, which only works off Vercel, on localhost.
//
// The newsletter's email goes to a mailbox here rather than to Resend, unless
// RESEND_API_KEY is set: /__mail lists every email the functions sent, newest
// first, and opens each as its reader would see it - so a sign-up can be
// confirmed, and an issue sent and read, with no account anywhere. It is kept
// in memory and empties when the server stops.

import { createServer } from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import handler from '../api/lost-found.mjs';
import adminHandler from '../api/admin.mjs';
import pulseHandler from '../api/pulse.mjs';
import playHandler from '../api/play.mjs';
import promptsHandler from '../api/prompts.mjs';
import newsHandler from '../api/news.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', 'output');
const port = Number(process.argv[2]) || 8815;

const env = {
	...process.env,
	LOSTFOUND_FILE: process.env.LOSTFOUND_FILE || path.resolve(here, '..', '.lostfound-dev.json'),
	ADMIN_DEV_LOGIN: '1',
	ADMIN_SESSION_SECRET: 'a-local-development-secret-only-for-localhost',
	LOSTFOUND_SALT: 'dev',
	LOSTFOUND_BASE_URL: `http://localhost:${port}`,
};
const mailbox = [];
if (!env.RESEND_API_KEY) {
	Object.assign(env, {
		RESEND_API_KEY: 're_local',
		RESEND_API_BASE: `http://localhost:${port}/__mail`,
		NEWSLETTER_FROM: 'All About Accra <newsletter@localhost.test>',
		NEWSLETTER_SECRET: 'a-local-newsletter-secret-only-for-localhost',
	});
}

const escapeHtml = (text) => String(text ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** The stand-in for Resend's /emails and /emails/batch, and a page to read them. */
async function mail(req, res) {
	if (req.method === 'POST') {
		let raw = '';
		for await (const chunk of req) raw += chunk;
		const body = JSON.parse(raw || '{}');
		const messages = req.url.endsWith('/batch') ? body : [body];
		for (const m of messages) mailbox.unshift({ ...m, at: new Date().toISOString() });
		res.setHeader('Content-Type', 'application/json');
		return res.end(JSON.stringify(req.url.endsWith('/batch') ? { data: messages.map((_, i) => ({ id: `local-${mailbox.length - i}` })) } : { id: `local-${mailbox.length}` }));
	}
	const n = /^\/__mail\/(\d+)/.exec(req.url)?.[1];
	res.setHeader('Content-Type', 'text/html; charset=utf-8');
	res.setHeader('Cache-Control', 'no-store');
	if (n !== undefined) return res.end(mailbox[Number(n)]?.html || 'No such email.');
	res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Local mailbox</title>
<body style="font:16px/1.5 system-ui;max-width:40rem;margin:2rem auto;padding:0 1rem"><h1>Local mailbox</h1>
<p>Every email the functions sent since this server started, newest first.</p><ol reversed>${mailbox.map((m, i) =>
	`<li><a href="/__mail/${i}">${escapeHtml(m.subject)}</a><br><small>to ${escapeHtml([].concat(m.to).join(', '))} · ${m.at.slice(11, 19)}</small></li>`).join('') || '<li>Nothing yet.</li>'}</ol></body>`);
}

// The file, always: never the real database from a laptop by accident.
delete env.FIRESTORE_CREDENTIALS;
delete env.FIRESTORE_EMULATOR_HOST;

const TYPES = {
	'.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript',
	'.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
	'.webmanifest': 'application/manifest+json', '.xml': 'application/xml', '.txt': 'text/plain',
};

async function file(urlPath) {
	const clean = decodeURIComponent(urlPath.split('?')[0]).replace(/^\/+/, '');
	const base = path.resolve(root, clean);
	if (!base.startsWith(root)) return null;
	for (const candidate of [base, `${base}.html`, path.join(base, 'index.html')]) {
		try {
			if ((await fs.stat(candidate)).isFile()) return candidate;
		} catch { /* next */ }
	}
	return null;
}

// Each function answers its own path and nothing under it, as on Vercel:
// /api/newsletter-issues.json is a file, not the newsletter's function.
const FUNCTIONS = {
	'/api/lost-found': handler, '/api/admin': adminHandler, '/api/pulse': pulseHandler,
	'/api/play': playHandler, '/api/prompts': promptsHandler, '/api/news': newsHandler,
};

createServer(async (req, res) => {
	const fn = FUNCTIONS[new URL(req.url, 'http://localhost').pathname];
	if (fn) return fn(req, res, env);
	if (req.url.startsWith('/__mail')) return mail(req, res);
	const found = await file(req.url);
	const target = found || path.join(root, '404.html');
	res.statusCode = found ? 200 : 404;
	res.setHeader('Content-Type', TYPES[path.extname(target)] || 'application/octet-stream');
	res.setHeader('Cache-Control', 'no-store');
	res.end(await fs.readFile(target));
}).listen(port, () => console.log(`Lost and found dev server on http://localhost:${port} - the admin is at /admin, no Google needed here`));
