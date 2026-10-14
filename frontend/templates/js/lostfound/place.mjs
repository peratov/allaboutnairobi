// /lost-and-found/place?p=SLUG: what one place is holding, and how to collect.
//
// The page a mall or a station links to from its own site or a sign at its
// desk: "lost something here? look first".

import { api, districtName, element, itemCard, placeKindLabel, unavailable } from '/js/lostfound/common.mjs';

const root = document.querySelector('[data-lf-place]');
const slug = new URLSearchParams(location.search).get('p') || '';

function render({ place, items }) {
	document.title = `${place.name}: lost and found - All About Nairobi`;
	document.querySelector('.lf-page h1').textContent = `Lost and found at ${place.name}`;
	const facts = [
		['What', [placeKindLabel(place.kind), districtName(place.district)].filter(Boolean).join(' · ')],
		['Address', place.address],
		['Open', place.hours],
		['Collect from', place.collect_note],
		['Ask at', place.contact_public],
	].filter(([, v]) => v);

	root.replaceChildren(
		element('dl', { class: 'lf-facts lf-place-facts' }, facts.flatMap(([k, v]) => [element('dt', { text: k }), element('dd', { text: v })])),
		element('p', { class: 'lf-hint', text: 'To collect, describe the item to the staff - what it looks like, what is inside. Bring ID.' }),
		element('h2', { text: items.length ? `Holding ${items.length} item${items.length === 1 ? '' : 's'}` : 'Holding nothing listed right now' }),
		items.length
			? element('ul', { class: 'lf-list' }, items.map((item) => element('li', {}, [itemCard(item)])))
			: element('p', { class: 'lf-empty', text: 'If you lost something here recently, list it - the staff see lost listings too.' }),
		element('p', {}, [element('a', { href: '/lost-and-found/report?kind=lost', text: 'List something you lost ➔' })]),
	);
}

if (root) {
	if (!slug) root.replaceChildren(element('p', { class: 'lf-notice', text: 'Which place? Pick one on the lost and found page.' }));
	else api('place', { params: { slug } }).then(render).catch((error) => root.replaceChildren(
		error.code === 'gone' ? element('p', { class: 'lf-notice', text: error.message }) : unavailable(error)));
}
