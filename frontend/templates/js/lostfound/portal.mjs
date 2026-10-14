// /lost-and-found/portal#t=KEY: a place's own desk.
//
// Built for whoever is behind a customer service counter with a box of
// phones: logging an item is four fields and a button, replies arrive with
// the owner's description so staff can check it before anyone turns up, and
// an item is marked collected in one tap.

import {
	api, categoryOptions, chips, element, field, keyFromHash, say, todayIso, unavailable, vocab, whenLabel,
} from '/js/lostfound/common.mjs';

const root = document.querySelector('[data-lf-portal]');
const key = keyFromHash();

function addForm(refresh) {
	const { limits } = vocab();
	const category = chips({ name: 'category', label: 'What kind of thing?', options: categoryOptions() });
	const title = field({ name: 'title', label: 'What is it?', required: true, max: limits.titleMax, placeholder: 'e.g. Brown leather handbag' });
	const details = field({ name: 'details', label: 'Describe it', multiline: true, max: limits.detailsMax, hint: 'Keep one detail back - what is inside, a mark - and ask anyone who claims it.' });
	const where = field({ name: 'place_text', label: 'Where in the building?', max: limits.placeTextMax, placeholder: 'e.g. Food court, level 1' });
	const when = field({ name: 'happened_on', label: 'Handed in on', type: 'date', value: todayIso() });
	when.input.max = todayIso();
	const out = element('div');
	const submit = element('button', { type: 'submit', class: 'lf-primary', text: 'Log it' });
	const form = element('form', { class: 'lf-form', novalidate: '' }, [
		category.node, title.node, details.node,
		element('div', { class: 'lf-pair' }, [where.node, when.node]),
		submit, out,
	]);
	form.addEventListener('submit', async (event) => {
		event.preventDefault();
		say(out, '');
		if (!category.value()) return say(out, 'Pick what kind of thing it is.');
		submit.disabled = true;
		try {
			refresh(await api('portal', { key, body: {
				action: 'add', category: category.value(), title: title.input.value, details: details.input.value,
				place_text: where.input.value, happened_on: when.input.value,
			} }), 'Logged. It is on your page and in every search now.');
		} catch (error) {
			say(out, error.message);
			submit.disabled = false;
		}
	});
	return form;
}

function detailsForm(place, refresh) {
	const hours = field({ name: 'hours', label: 'When people can collect', max: 100, value: place.hours || '' });
	const collect = field({ name: 'collect_note', label: 'Where to collect', max: 200, value: place.collect_note || '' });
	const contact = field({ name: 'contact_public', label: 'Public contact', max: 60, value: place.contact_public || '' });
	const out = element('div');
	const submit = element('button', { type: 'submit', class: 'lf-secondary', text: 'Save' });
	const form = element('form', { class: 'lf-form', novalidate: '' }, [hours.node, collect.node, contact.node, submit, out]);
	form.addEventListener('submit', async (event) => {
		event.preventDefault();
		submit.disabled = true;
		try {
			refresh(await api('portal', { key, body: { action: 'details', hours: hours.input.value, collect_note: collect.input.value, contact_public: contact.input.value } }), 'Saved.');
		} catch (error) { say(out, error.message); submit.disabled = false; }
	});
	return form;
}

function render(data, flash) {
	const { place, items, claims } = data;
	const refresh = (next, message) => render(next, message);
	const act = async (body, button) => {
		button.disabled = true;
		try { render(await api('portal', { key, body })); }
		catch (error) { button.disabled = false; alert(error.message); }
	};

	document.querySelector('.lf-page h1').textContent = `Lost and found: ${place.name}`;
	const open = items.filter((i) => i.status === 'open');
	const done = items.filter((i) => i.status !== 'open');
	const newClaims = claims.filter((c) => c.status === 'new');

	const itemRow = (item) => element('li', { class: 'lf-portal-item' }, [
		element('div', {}, [
			element('strong', { text: item.title }),
			element('span', { class: 'lf-hint', text: `${item.ref} · ${item.place_text || ''} · handed in ${whenLabel(item.happened_on)}` }),
		]),
		element('div', { class: 'lf-share' }, item.status === 'open'
			? [
				element('button', { type: 'button', class: 'lf-secondary', text: 'Collected', onclick: (e) => act({ action: 'returned', ref: item.ref }, e.currentTarget) }),
				element('button', { type: 'button', class: 'lf-link', text: 'Remove', onclick: (e) => act({ action: 'close', ref: item.ref }, e.currentTarget) }),
			]
			: [element('span', { class: 'lf-hint', text: item.status === 'returned' ? 'Collected' : 'Removed' }),
				element('button', { type: 'button', class: 'lf-link', text: 'Put back', onclick: (e) => act({ action: 'reopen', ref: item.ref }, e.currentTarget) })]),
	]);

	root.replaceChildren(
		flash ? element('p', { class: 'lf-say lf-say-ok', role: 'status', text: flash }) : '',
		element('p', { class: 'lf-hint' }, [
			document.createTextNode('Your public page: '),
			element('a', { href: place.page, text: place.page }),
			document.createTextNode(' - link it from your site, or print it by your desk.'),
		]),
		element('div', { class: 'lf-portal-grid' }, [
			element('section', {}, [element('h2', { text: 'Log something handed in' }), addForm(refresh)]),
			element('section', { class: 'lf-claims' }, [
				element('h2', { text: newClaims.length ? `Replies to check (${newClaims.length})` : 'Replies' }),
				claims.length ? element('ul', {}, claims.map((c) => element('li', { class: `lf-claim lf-claim-${c.status}` }, [
					element('p', { class: 'lf-claim-meta', text: `${c.ref} · ${c.contact_name || 'Someone'} · ${whenLabel(c.created_at)}${c.status !== 'new' ? ` · ${c.status}` : ''}` }),
					element('p', { class: 'lf-claim-message', text: c.message }),
					element('p', { class: 'lf-reach', text: [c.contact_phone, c.contact_email].filter(Boolean).join(' · ') }),
					c.status === 'new' ? element('div', { class: 'lf-share' }, [
						element('button', { type: 'button', class: 'lf-secondary', text: 'Matches - we will call', onclick: (e) => act({ action: 'accept', claim: c.id }, e.currentTarget) }),
						element('button', { type: 'button', class: 'lf-link', text: 'Does not match', onclick: (e) => act({ action: 'decline', claim: c.id }, e.currentTarget) }),
					]) : null,
				]))) : element('p', { class: 'lf-empty', text: 'No replies yet.' }),
			]),
		]),
		element('section', {}, [
			element('h2', { text: `Holding (${open.length})` }),
			open.length ? element('ul', { class: 'lf-portal-items' }, open.map(itemRow)) : element('p', { class: 'lf-empty', text: 'Nothing listed.' }),
			done.length ? element('details', {}, [element('summary', { text: `Collected or removed (${done.length})` }), element('ul', { class: 'lf-portal-items' }, done.map(itemRow))]) : null,
		]),
		element('details', { class: 'lf-portal-details' }, [element('summary', { text: 'Opening hours and where to collect' }), detailsForm(place, refresh)]),
	);
}

if (root) {
	if (!key) root.replaceChildren(element('p', { class: 'lf-notice', text: 'This portal opens from the private link sent when your place was approved.' }));
	else api('portal', { key }).then((data) => render(data)).catch((error) => {
		root.replaceChildren(error.code === 'auth' ? element('p', { class: 'lf-notice', text: error.message }) : unavailable(error));
	});
}
