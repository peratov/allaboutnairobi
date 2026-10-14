// The site-wide notice the owner sets in the admin: a tax change, an outage,
// anything every reader should see.
//
// It costs a reader almost nothing. The request goes after the page has
// painted, the answer is cached at Vercel's edge for a minute, and a tab asks
// at most every five minutes - the answer is kept in sessionStorage between
// pages. A reader who closes a notice does not see that one again; a new one,
// saved later, has a new version and shows.

import { element } from '/js/utils/format.mjs';

const KEEP = 5 * 60000;
const SESSION_KEY = 'aa-notice';
const CLOSED_KEY = 'aa-notice-closed';

function read(storage, key) {
	try { return JSON.parse(storage.getItem(key) || 'null'); } catch { return null; }
}

function write(storage, key, value) {
	try { storage.setItem(key, JSON.stringify(value)); } catch { /* private mode: fine */ }
}

async function current() {
	const kept = read(sessionStorage, SESSION_KEY);
	if (kept && Date.now() - kept.at < KEEP) return kept.banner;
	try {
		const response = await fetch('/api/lost-found?r=notice');
		if (!response.ok) return null;
		const { banner } = await response.json();
		write(sessionStorage, SESSION_KEY, { at: Date.now(), banner });
		return banner;
	} catch {
		return null;
	}
}

function show(banner) {
	const header = document.querySelector('.site-header');
	if (!header || document.querySelector('[data-site-notice]')) return;
	const close = element('button', {
		type: 'button',
		class: 'site-notice-close',
		'aria-label': 'Close this notice',
		text: '×',
		onclick: () => {
			write(localStorage, CLOSED_KEY, banner.version);
			bar.remove();
		},
	});
	const bar = element('aside', { class: `site-notice is-${banner.tone || 'info'} no-print`, 'data-site-notice': '', 'aria-label': 'Notice' }, [
		element('p', {}, [
			banner.text,
			banner.link ? ' ' : null,
			banner.link ? element('a', { href: banner.link, text: banner.link_text || 'Read more' }) : null,
		]),
		close,
	]);
	header.after(bar);
}

export default async function initializeSiteNotice() {
	// The admin is the one place the notice is set; it does not need telling.
	if (location.pathname === '/admin') return;
	const banner = await current();
	if (!banner?.text) return;
	if (read(localStorage, CLOSED_KEY) === banner.version) return;
	show(banner);
}
