// The /lost-and-found hub: search, filters, the listings, the places, and a
// sheet for one listing with "this is mine" / "I found this".
//
// A listing opens from #item=REF, so a link to one can be shared - on a
// WhatsApp group, which is where most of these will travel - and opens
// straight onto it.

import {
	ApiError, api, categoryLabel, categoryOptions, copy, districtName, districtOptions,
	element, field, itemCard, kindBadge, placeKindLabel, say, select, skeletonCards, stagger, unavailable, whenLabel,
} from '/js/lostfound/common.mjs';

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const browse = document.querySelector('[data-lf-hub]');
const placesBox = document.querySelector('[data-lf-places]');

const state = { kind: '', category: '', district: '', q: '', page: 0 };

// The home page's search is a plain GET form, so a search arrives as ?q= and
// starts filled in. The API validates every one of these again.
{
	const given = new URLSearchParams(location.search);
	state.q = (given.get('q') || '').trim().slice(0, 80);
	if (['lost', 'found'].includes(given.get('kind'))) state.kind = given.get('kind');
	for (const key of ['category', 'district']) state[key] = given.get(key) || '';
}
let searchTimer = null;

// --- the listings ---------------------------------------------------------------------

const results = element('div', { class: 'lf-results', 'aria-live': 'polite' });
const more = element('button', { type: 'button', class: 'lf-more', hidden: '', text: 'Show more', onclick: () => load({ append: true }) });

function filters() {
	const kinds = element('div', { class: 'lf-segmented', role: 'group', 'aria-label': 'Show' },
		[['', 'Everything'], ['lost', 'Lost'], ['found', 'Found']].map(([value, label]) => element('button', {
			type: 'button',
			'aria-pressed': String(state.kind === value),
			'data-kind': value,
			text: label,
			onclick: (event) => {
				state.kind = value;
				for (const b of kinds.children) b.setAttribute('aria-pressed', String(b === event.currentTarget));
				load();
			},
		})));

	const search = field({ name: 'q', label: 'Search', placeholder: 'e.g. Samsung, black wallet, Westlands', type: 'search', value: state.q });
	search.input.addEventListener('input', () => {
		clearTimeout(searchTimer);
		searchTimer = setTimeout(() => { state.q = search.input.value.trim(); load(); }, 300);
	});

	const category = select({ name: 'category', label: 'What', options: categoryOptions(), blank: 'Anything', value: state.category });
	state.category = category.input.value; // drops a ?category= that is not one
	category.input.addEventListener('change', () => { state.category = category.input.value; load(); });
	const district = select({ name: 'district', label: 'Where', options: districtOptions(), blank: 'All of Nairobi', value: state.district });
	state.district = district.input.value;
	district.input.addEventListener('change', () => { state.district = district.input.value; load(); });

	return element('div', { class: 'lf-filters' }, [
		kinds,
		search.node,
		element('div', { class: 'lf-filter-pair' }, [category.node, district.node]),
	]);
}

async function load({ append = false } = {}) {
	state.page = append ? state.page + 1 : 0;
	if (!append) {
		results.setAttribute('aria-busy', 'true');
		// Grey cards only if the answer is slow: a flash of them is worse than none.
		clearTimeout(load.slow);
		load.slow = setTimeout(() => { if (results.getAttribute('aria-busy')) results.replaceChildren(skeletonCards(3)); }, 180);
	}
	try {
		const params = { page: String(state.page) };
		for (const key of ['kind', 'category', 'district', 'q']) if (state[key]) params[key] = state[key];
		const { items, more: hasMore } = await api('items', { params });
		const cards = items.map((item) => element('li', {}, [itemCard(item)]));
		const filtered = state.q || state.category || state.district || state.kind;
		if (append) {
			const list = results.querySelector('ul');
			list?.append(...cards);
			cards.forEach((li, i) => { li.classList.add('lf-in'); li.style.setProperty('--i', String(i)); });
		} else {
			results.replaceChildren(items.length
				? element('div', {}, [
					element('p', { class: 'lf-count', text: `${hasMore ? `${items.length}+` : items.length} ${items.length === 1 && !hasMore ? 'listing' : 'listings'}${filtered ? ' match' : ''}` }),
					stagger(element('ul', { class: 'lf-list' }, cards)),
				])
				: element('div', { class: 'lf-empty-state' }, [
					element('p', { class: 'lf-empty', text: filtered
						? 'Nothing matches that yet. Listings arrive every day - or list yours, and anyone who finds it can reply.'
						: 'Nothing listed yet. Be the first.' }),
					element('div', { class: 'lf-share' }, [
						element('a', { class: 'lf-primary', href: '/lost-and-found/report?kind=lost', text: 'List what I lost' }),
						element('a', { class: 'lf-secondary', href: '/lost-and-found/report?kind=found', text: 'List what I found' }),
					]),
				]));
		}
		more.hidden = !hasMore;
	} catch (error) {
		if (!append) browse.replaceChildren(unavailable(error));
	} finally {
		clearTimeout(load.slow);
		results.removeAttribute('aria-busy');
	}
}

// --- places -------------------------------------------------------------------------------

async function loadPlaces() {
	if (!placesBox) return;
	try {
		const { places } = await api('places');
		placesBox.replaceChildren(places.length
			? stagger(element('ul', { class: 'lf-places' }, places.map((place) => element('li', {}, [
				element('a', { class: 'lf-place', href: `/lost-and-found/place?p=${encodeURIComponent(place.slug)}` }, [
					element('strong', { text: place.name }),
					element('span', { text: [placeKindLabel(place.kind), districtName(place.district)].filter(Boolean).join(' · ') }),
					element('span', { class: 'lf-place-count', text: place.holding === 1 ? 'Holding 1 item' : `Holding ${place.holding} items` }),
				]),
			]))))
			: element('p', { class: 'lf-empty', text: 'No places have joined yet.' }));
	} catch {
		placesBox.replaceChildren();
	}
}

// --- one listing, in a sheet -------------------------------------------------------------------

const sheet = element('dialog', { class: 'lf-sheet', 'aria-labelledby': 'lf-sheet-title' });
document.body.append(sheet);
sheet.addEventListener('click', (event) => { if (event.target === sheet) closeSheet(); });
sheet.addEventListener('cancel', (event) => { event.preventDefault(); closeSheet(); });

// It slides up on a phone and settles in on a wide screen, and leaves the
// same way: the class drives the CSS, and the dialog only closes once the
// motion has finished.
function closeSheet() {
	if (!sheet.open) return;
	sheet.classList.remove('is-open');
	document.documentElement.classList.remove('lf-sheet-open');
	if (location.hash.startsWith('#item=')) history.replaceState(history.state, '', location.pathname + location.search);
	setTimeout(() => { if (!sheet.classList.contains('is-open')) sheet.close(); }, reduceMotion.matches ? 0 : 220);
}

function replyForm(item) {
	const mine = item.kind === 'found';
	const box = element('div', { class: 'lf-reply' });
	const message = field({
		name: 'message', multiline: true, required: true, max: 600,
		label: mine ? 'What makes it yours?' : 'Where did you find it, and where is it now?',
		hint: mine
			? 'Describe something only the owner would know - what is inside, a mark, the lock screen. The finder will ask.'
			: 'Say where you found it and how they can get it back.',
	});
	const name = field({ name: 'contact_name', label: 'Your name', autocomplete: 'name', max: 60 });
	const phone = field({ name: 'contact_phone', label: 'Phone or WhatsApp', type: 'tel', inputmode: 'tel', autocomplete: 'tel' });
	const email = field({ name: 'contact_email', label: 'Or email', type: 'email', autocomplete: 'email' });
	const out = element('div');
	const send = element('button', { type: 'submit', class: 'lf-primary', text: mine ? 'Send to the finder' : 'Send to the owner' });

	const form = element('form', { class: 'lf-form', novalidate: '' }, [
		message.node, name.node,
		element('div', { class: 'lf-pair' }, [phone.node, email.node]),
		element('p', { class: 'lf-hint', text: 'Only the person who listed this sees your number or email.' }),
		send, out,
	]);
	form.addEventListener('submit', async (event) => {
		event.preventDefault();
		send.disabled = true;
		say(out, '');
		try {
			await api('claim', { body: {
				ref: item.ref, message: message.input.value,
				contact_name: name.input.value, contact_phone: phone.input.value, contact_email: email.input.value,
			} });
			box.replaceChildren(element('div', { class: 'lf-done' }, [
				element('strong', { text: 'Sent.' }),
				element('p', { text: mine
					? 'If it is yours, the finder will contact you. Never pay anyone before you see your item, and meet somewhere busy.'
					: 'The owner will see your message and how to reach you. Thank you.' }),
			]));
		} catch (error) {
			say(out, error.message);
			send.disabled = false;
		}
	});

	const open = element('button', { type: 'button', class: 'lf-primary', text: mine ? 'This is mine' : 'I found this', onclick: () => {
		form.classList.add('lf-fade');
		open.replaceWith(form);
		message.input.focus();
	} });
	box.append(open);
	return box;
}

function flagLink(item) {
	const wrap = element('div', { class: 'lf-flag' });
	const button = element('button', { type: 'button', class: 'lf-link', text: 'Report this listing', onclick: () => {
		const reason = select({ name: 'reason', label: 'What is wrong with it?', options: [
			['scam', 'Looks like a scam'], ['personal', 'Shows someone’s personal details'],
			['offensive', 'Offensive or not a real listing'], ['other', 'Something else'],
		] });
		const out = element('div');
		const go = element('button', { type: 'button', class: 'lf-secondary', text: 'Report it', onclick: async () => {
			go.disabled = true;
			try {
				await api('flag', { body: { ref: item.ref, reason: reason.input.value } });
				wrap.replaceChildren(element('p', { class: 'lf-hint', text: 'Thank you. Three reports take a listing down until it is checked.' }));
			} catch (error) { say(out, error.message); go.disabled = false; }
		} });
		wrap.replaceChildren(reason.node, go, out);
	} });
	wrap.append(button);
	return wrap;
}

async function openItem(ref) {
	sheet.replaceChildren(element('div', { class: 'lf-sheet-inner' }, [element('span', { class: 'lf-grip', 'aria-hidden': 'true' }), skeletonCards(1)]));
	if (!sheet.open) {
		if (typeof sheet.showModal === 'function') sheet.showModal();
		else sheet.setAttribute('open', '');
	}
	// Every time, not only the first: a listing opened while the last one was
	// still sliding away has to come back.
	document.documentElement.classList.add('lf-sheet-open');
	// Two frames so the closed state paints first and the slide is seen; a
	// timer as well, because a tab that is not painting never gets a frame.
	const show = () => sheet.classList.add('is-open');
	requestAnimationFrame(() => requestAnimationFrame(show));
	setTimeout(show, 120);
	try {
		const { item, matches } = await api('item', { params: { ref } });
		const link = `${location.origin}/lost-and-found#item=${item.ref}`;
		const verb = item.kind === 'lost' ? 'Lost' : 'Found';
		const share = `${verb} in Nairobi: ${item.title}. ${link}`;
		const where = item.place
			? element('a', { href: `/lost-and-found/place?p=${encodeURIComponent(item.place.slug)}`, text: item.place.name })
			: document.createTextNode(item.place_text || '');

		sheet.replaceChildren(element('div', { class: 'lf-sheet-inner lf-fade' }, [
			element('span', { class: 'lf-grip', 'aria-hidden': 'true' }),
			element('div', { class: 'lf-sheet-head' }, [
				element('div', {}, [
					element('span', { class: 'lf-sheet-top' }, [kindBadge(item.kind), element('span', { text: `${item.ref} · ${categoryLabel(item.category)}` })]),
					element('h2', { id: 'lf-sheet-title', text: item.title }),
				]),
				element('button', { type: 'button', class: 'lf-close', 'aria-label': 'Close', text: '×', onclick: closeSheet }),
			]),
			element('dl', { class: 'lf-facts' }, [
				element('dt', { text: item.kind === 'lost' ? 'Lost' : 'Found' }), element('dd', { text: whenLabel(item.happened_on) }),
				element('dt', { text: 'Where' }), element('dd', {}, [where, districtName(item.district) ? document.createTextNode(` · ${districtName(item.district)}`) : null]),
			]),
			item.details ? element('p', { class: 'lf-details', text: item.details }) : null,
			item.status === 'open'
				? replyForm(item)
				: element('p', { class: 'lf-done', text: item.status === 'returned' ? 'This one is back with its owner.' : 'This listing is closed.' }),
			element('div', { class: 'lf-share' }, [
				element('a', { class: 'lf-secondary', href: `https://wa.me/?text=${encodeURIComponent(share)}`, target: '_blank', rel: 'noopener', text: 'Share on WhatsApp' }),
				element('button', { type: 'button', class: 'lf-secondary', text: 'Copy link', onclick: (event) => copy(link, event.currentTarget) }),
			]),
			matches.length ? element('section', { class: 'lf-matches' }, [
				element('h3', { text: item.kind === 'lost' ? 'Found items that could be this' : 'Lost items that could be this' }),
				stagger(element('ul', { class: 'lf-list' }, matches.map((m) => element('li', {}, [itemCard(m)])))),
			]) : null,
			flagLink(item),
		]));
	} catch (error) {
		sheet.replaceChildren(element('div', { class: 'lf-sheet-inner' }, [
			element('button', { type: 'button', class: 'lf-close', 'aria-label': 'Close', text: '×', onclick: closeSheet }),
			element('p', { class: 'lf-notice', text: error instanceof ApiError ? error.message : 'That listing could not load.' }),
		]));
	}
}

function applyHash() {
	const match = /^#item=([A-Z]-[A-Z0-9]{5})$/i.exec(location.hash);
	if (match) openItem(match[1].toUpperCase());
	else closeSheet();
}

// --- start -----------------------------------------------------------------------------------

if (browse) {
	browse.replaceChildren(filters(), results, more);
	load();
	loadPlaces();
	window.addEventListener('hashchange', applyHash);
	applyHash();
}
