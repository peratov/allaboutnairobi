// /lost-and-found/manage#t=KEY: the private page for one listing.
//
// The key is in the #fragment, which browsers never send to any server, and
// travels to the API in a header. Replies are shown with how to reach each
// person; the owner of the listing decides who to call.

import { api, element, itemCard, kindBadge, keyFromHash, say, unavailable, whenLabel } from '/js/lostfound/common.mjs';

const root = document.querySelector('[data-lf-manage]');
const key = keyFromHash();

const STATUS_TEXT = {
	open: 'Open - showing to everyone',
	returned: 'Sorted - back with its owner',
	closed: 'Closed',
	hidden: 'Taken down after reports',
};

function reach(c) {
	const lines = [];
	if (c.contact_phone) {
		lines.push(element('a', { href: `tel:${c.contact_phone}`, text: c.contact_phone }));
		lines.push(element('a', { href: `https://wa.me/${c.contact_phone.replace(/\D/g, '')}`, target: '_blank', rel: 'noopener', text: 'WhatsApp' }));
	}
	if (c.contact_email) lines.push(element('a', { href: `mailto:${c.contact_email}`, text: c.contact_email }));
	return element('p', { class: 'lf-reach' }, lines.flatMap((l, i) => (i ? [document.createTextNode(' · '), l] : [l])));
}

function render({ item, claims, matches }) {
	const act = async (body, button) => {
		button.disabled = true;
		try { render(await api('manage', { key, body })); }
		catch (error) { say(out, error.message); button.disabled = false; }
	};
	const out = element('div');
	const button = (label, action, cls = 'lf-secondary') => element('button', { type: 'button', class: cls, text: label, onclick: (e) => act({ action }, e.currentTarget) });

	const actions = item.status === 'open'
		? [button(item.kind === 'lost' ? 'I got it back' : 'It is back with its owner', 'returned', 'lf-primary'), button('Close the listing', 'close')]
		: item.status === 'hidden' ? [] : [button('Open it again', 'reopen')];

	root.replaceChildren(
		element('div', { class: 'lf-manage-item' }, [
			element('span', { class: 'lf-sheet-top' }, [kindBadge(item.kind), element('span', { text: item.ref })]),
			element('h2', { text: item.title }),
			element('p', { class: 'lf-status', text: STATUS_TEXT[item.status] || item.status }),
			element('p', { class: 'lf-hint', text: item.status === 'open'
				? `It closes by itself on ${new Date(item.expires_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}.`
				: '' }),
			element('div', { class: 'lf-share' }, actions),
			element('p', {}, [element('a', { href: `/lost-and-found#item=${item.ref}`, text: 'See it as everyone else does' })]),
			out,
		]),
		element('section', { class: 'lf-claims' }, [
			element('h2', { text: claims.length ? `Replies (${claims.length})` : 'Replies' }),
			claims.length
				? element('ul', {}, claims.map((c) => element('li', { class: `lf-claim lf-claim-${c.status}` }, [
					element('p', { class: 'lf-claim-meta', text: `${c.contact_name || 'Someone'} · ${whenLabel(c.created_at)}${c.status !== 'new' ? ` · ${c.status}` : ''}` }),
					element('p', { class: 'lf-claim-message', text: c.message }),
					reach(c),
					c.status === 'new' ? element('div', { class: 'lf-share' }, [
						element('button', { type: 'button', class: 'lf-secondary', text: 'This is the one', onclick: (e) => act({ action: 'accept', claim: c.id }, e.currentTarget) }),
						element('button', { type: 'button', class: 'lf-link', text: 'Not a match', onclick: (e) => act({ action: 'decline', claim: c.id }, e.currentTarget) }),
					]) : null,
				])))
				: element('p', { class: 'lf-empty', text: 'No replies yet. Share your listing - most things are found because someone saw a link.' }),
			element('p', { class: 'lf-hint', text: item.kind === 'found'
				? 'Ask anyone who says it is theirs for the detail you kept back. Never hand it over to someone who cannot describe it, and meet somewhere busy.'
				: 'Never pay anyone before you see your item. A real finder does not need money up front.' }),
		]),
		matches.length ? element('section', { class: 'lf-matches' }, [
			element('h2', { text: item.kind === 'lost' ? 'Found items that could be yours' : 'Lost items this could be' }),
			element('ul', { class: 'lf-list' }, matches.map((m) => element('li', {}, [itemCard(m)]))),
		]) : null,
	);
}

if (root) {
	if (!key) {
		root.replaceChildren(element('p', { class: 'lf-notice', text: 'This page opens from the private link you were given when you listed your item. That link is the only key to it.' }));
	} else {
		api('manage', { key }).then(render).catch((error) => {
			root.replaceChildren(error.code === 'auth' ? element('p', { class: 'lf-notice', text: error.message }) : unavailable(error));
		});
	}
}
