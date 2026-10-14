// The newsletter's email: Resend's REST API with `fetch`, no SDK, and the
// three messages the list sends - "confirm your address", "welcome", and an
// issue.
//
// Every email is plain HTML with its styles inline, because that is the only
// styling every mail client keeps, and has a text part beside it. Every one
// sent to a subscriber carries two ways out: a link in the footer to a page
// that asks before it unsubscribes (a link scanner that follows every URL in
// an inbox must not unsubscribe anybody), and the List-Unsubscribe header with
// List-Unsubscribe-Post, which mail apps show as their own "Unsubscribe" and
// which Gmail and Yahoo require of anyone sending in bulk.
//
// There is no tracking pixel and no link is rewritten: an email reports
// nothing back about its reader. /terms#newsletter says so - turning on
// open or click tracking in Resend's own settings would make that untrue.

import { HttpError } from '../_lostfound/http.mjs';

// --- sending ------------------------------------------------------------------------------

const apiBase = (env) => (env.RESEND_API_BASE || 'https://api.resend.com').replace(/\/$/, '');
export const fromOf = (env) => env.NEWSLETTER_FROM || env.LOSTFOUND_FROM || '';
export const sendingReady = (env) => Boolean(env.RESEND_API_KEY && fromOf(env));

async function resend(env, path, payload, headers = {}) {
	if (!sendingReady(env)) throw new HttpError(503, 'Sending is not set up: RESEND_API_KEY and NEWSLETTER_FROM are needed in Vercel.', 'not-configured');
	let response;
	try {
		response = await fetch(`${apiBase(env)}${path}`, {
			method: 'POST',
			headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json', ...headers },
			body: JSON.stringify(payload),
		});
	} catch {
		throw new HttpError(502, 'Resend could not be reached. Try again in a minute.', 'resend');
	}
	const answer = await response.json().catch(() => ({}));
	if (!response.ok) throw new HttpError(502, `Resend said no: ${answer.message || answer.name || response.status}`, 'resend');
	return answer;
}

/** One email. `message` is { to, subject, html, text, headers?, tags? }. */
export function sendOne(env, message) {
	return resend(env, '/emails', { from: fromOf(env), ...message });
}

/**
 * Up to a hundred emails in one request. The idempotency key makes a retry
 * of the same batch - after a timeout, say - send nothing twice.
 */
export function sendBatch(env, messages, key) {
	return resend(env, '/emails/batch', messages.map((m) => ({ from: fromOf(env), ...m })), key ? { 'Idempotency-Key': key } : {});
}

// --- the look of it ---------------------------------------------------------------------------

const C = { text: '#2b2118', light: '#6b5d50', accent: '#9c4113', page: '#fffdf9', ground: '#f4efe6', line: '#e5dccd' };
const SERIF = "Georgia,'Times New Roman',serif";
const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export const escapeHtml = (text) => String(text ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const STYLE = {
	h1: `margin:0 0 12px;font-family:${SERIF};font-size:28px;line-height:1.2;color:${C.text}`,
	h2: `margin:28px 0 10px;font-family:${SERIF};font-size:22px;line-height:1.3;color:${C.text}`,
	h3: `margin:22px 0 8px;font-family:${SERIF};font-size:18px;line-height:1.3;color:${C.text}`,
	p: 'margin:0 0 14px;line-height:1.6',
	ul: 'margin:0 0 14px;padding-left:22px;line-height:1.6',
	ol: 'margin:0 0 14px;padding-left:22px;line-height:1.6',
	li: 'margin:0 0 6px',
	a: `color:${C.accent};text-decoration:underline`,
	blockquote: `margin:0 0 14px;padding:4px 0 4px 14px;border-left:3px solid ${C.line};color:${C.light}`,
	hr: `border:0;border-top:1px solid ${C.line};margin:24px 0`,
	button: `display:inline-block;padding:12px 22px;font-family:${SANS};font-weight:700;color:#fffdf9;background:${C.accent};border-radius:999px;text-decoration:none`,
	table: 'width:100%;margin:0 0 16px;border-collapse:collapse;font-size:15px',
	th: `padding:6px 8px;border-bottom:2px solid ${C.line};text-align:left`,
	td: `padding:6px 8px;border-bottom:1px solid ${C.line};vertical-align:top`,
	code: `font-family:Consolas,Menlo,monospace;font-size:14px;background:${C.ground};padding:1px 4px;border-radius:3px`,
};

/**
 * An issue's body, as the build wrote it (api/newsletter-issues.json: bare
 * tags, no attributes but a link's address), with the styles put on inline.
 * The look of every email is decided here and nowhere else.
 */
export const styled = (html) => String(html || '').replace(/<(h2|h3|p|ul|ol|li|a|blockquote|hr|table|th|td|code)(\s[^>]*)?>/g,
	(whole, tag, attrs = '') => `<${tag}${attrs} style="${STYLE[tag]}">`);

/** The frame every email shares: a hidden preheader, the body, a footer. */
export function layout({ preheader = '', body, footer }) {
	return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>All About Nairobi</title></head>
<body style="margin:0;padding:0;background:${C.ground}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preheader)}</div>
<div style="max-width:600px;margin:0 auto;padding:24px 16px">
<div style="padding:28px 24px;background:${C.page};border-radius:14px;font-family:${SANS};font-size:16px;color:${C.text}">
<p style="margin:0 0 20px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${C.accent}">All About Nairobi</p>
${body}
</div>
<div style="padding:18px 24px;font-family:${SANS};font-size:13px;line-height:1.55;color:${C.light}">${footer}</div>
</div>
</body></html>`;
}

/** A link in an email: the colour and the underline inline, the address escaped. */
export const link = (href, text, style = STYLE.a) => `<a href="${escapeHtml(href)}" style="${style}">${escapeHtml(text)}</a>`;

/**
 * Markdown, the small part of it a newsletter needs, as email HTML: headings,
 * paragraphs, lists, quotes, rules, bold, italics and links. Everything is
 * escaped first, so nothing typed can become markup it did not ask for, and a
 * link is kept only if it goes to http(s) or mailto.
 */
export function markdown(source, origin = '') {
	const inline = (text) => escapeHtml(text)
		.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (whole, label, href) => {
			const url = href.replace(/&amp;/g, '&');
			const absolute = url.startsWith('/') ? `${origin}${url}` : url;
			return /^(https?:|mailto:)/i.test(absolute) ? `<a href="${escapeHtml(absolute)}" style="${STYLE.a}">${label}</a>` : label;
		})
		.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
		.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
	const blocks = String(source || '').replace(/\r\n/g, '\n').split(/\n{2,}/);
	return blocks.map((block) => {
		const lines = block.split('\n').filter((l) => l.trim() !== '');
		if (!lines.length) return '';
		const first = lines[0];
		const heading = /^(#{1,3})\s+(.*)$/.exec(first);
		if (heading && lines.length === 1) {
			const tag = ['h2', 'h2', 'h3'][heading[1].length - 1];
			return `<${tag} style="${STYLE[tag]}">${inline(heading[2])}</${tag}>`;
		}
		if (/^(-{3,}|\*{3,})$/.test(first.trim()) && lines.length === 1) return `<hr style="${STYLE.hr}">`;
		if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
			return `<ul style="${STYLE.ul}">${lines.map((l) => `<li style="${STYLE.li}">${inline(l.replace(/^\s*[-*]\s+/, ''))}</li>`).join('')}</ul>`;
		}
		if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l))) {
			return `<ol style="${STYLE.ol}">${lines.map((l) => `<li style="${STYLE.li}">${inline(l.replace(/^\s*\d+[.)]\s+/, ''))}</li>`).join('')}</ol>`;
		}
		if (lines.every((l) => /^>\s?/.test(l))) {
			return `<blockquote style="${STYLE.blockquote}">${lines.map((l) => inline(l.replace(/^>\s?/, ''))).join('<br>')}</blockquote>`;
		}
		return `<p style="${STYLE.p}">${lines.map(inline).join('<br>')}</p>`;
	}).join('\n');
}

/** The text part of an email, from its HTML: links kept as "text (address)". */
export function textOf(html) {
	return String(html || '')
		.replace(/<div style="display:none[^>]*>.*?<\/div>/s, '')
		.replace(/<a [^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gs, (whole, href, label) => {
			const text = label.replace(/<[^>]+>/g, '');
			return text === href ? href : `${text} (${href})`;
		})
		.replace(/<(h1|h2|h3)[^>]*>(.*?)<\/\1>/gs, (whole, tag, inner) => `\n\n${inner.toUpperCase()}\n`)
		.replace(/<li[^>]*>/g, '\n- ')
		.replace(/<(br|hr)[^>]*>/g, '\n')
		.replace(/<\/(p|ul|ol|blockquote|div)>/g, '\n\n')
		.replace(/<[^>]+>/g, '')
		.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
		.replace(/[ \t]+\n/g, '\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

// --- the three messages ------------------------------------------------------------------------

const footerFor = ({ unsubscribe, origin }) => `You are getting this because this address was subscribed to the All About Nairobi newsletter at ${link(origin, origin.replace(/^https?:\/\//, ''), `color:${C.light}`)}.<br>${link(unsubscribe, 'Unsubscribe', `color:${C.light}`)} - one click, and you are off the list.`;

/** The headers that let a mail app unsubscribe in one tap (RFC 8058). */
export const unsubscribeHeaders = (oneClick) => ({
	'List-Unsubscribe': `<${oneClick}>`,
	'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
});

export function confirmationEmail({ origin, confirm }) {
	const html = layout({
		preheader: 'One tap to confirm, and the first issue is on its way.',
		body: `<h1 style="${STYLE.h1}">Confirm your subscription</h1>
<p style="${STYLE.p}">Someone - we hope you - asked for the monthly All About Nairobi newsletter to come to this address. Tap below to confirm it was you.</p>
<p style="margin:22px 0">${link(confirm, 'Yes, subscribe me', STYLE.button)}</p>
<p style="${STYLE.p};color:${C.light};font-size:14px">If it was not you, do nothing: without a tap here this address is never added, and nothing more is sent. The link works for seven days.</p>`,
		footer: `Sent once, because this address was entered on ${link(origin, origin.replace(/^https?:\/\//, ''), `color:${C.light}`)}.`,
	});
	return { subject: 'Confirm your subscription to All About Nairobi', html, text: textOf(html) };
}

export function welcomeEmail({ origin, unsubscribe, subject, body }) {
	const html = layout({
		preheader: 'You are on the list.',
		body: `<h1 style="${STYLE.h1}">${escapeHtml(subject)}</h1>\n${markdown(body, origin)}`,
		footer: footerFor({ unsubscribe, origin }),
	});
	return { subject, html, text: textOf(html) };
}

export function campaignEmail({ origin, unsubscribe, campaign }) {
	const content = campaign.format === 'issue' ? styled(campaign.html) : markdown(campaign.body, origin);
	const web = campaign.format === 'issue' && campaign.url ? `<p style="${STYLE.p};font-size:14px">${link(campaign.url, 'Read this issue on the site')}</p>` : '';
	const html = layout({
		preheader: campaign.preheader || '',
		body: `<h1 style="${STYLE.h1}">${escapeHtml(campaign.subject)}</h1>\n${content}\n${web}`,
		footer: footerFor({ unsubscribe, origin }),
	});
	return { subject: campaign.subject, html, text: textOf(html) };
}
