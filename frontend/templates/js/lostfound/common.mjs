// Lost and found: what every page shares.
//
// The API wrapper, the vocabulary (categories, districts, limits - rendered
// into the page from the same JSON the server enforces), item cards, and form
// fields. Every input built here carries data-clarity-mask, because /terms
// promises Clarity cannot see what is typed, and a contact box is the last
// place to break that promise.

import { element } from '/js/utils/format.mjs';

export { element };

let vocabCache = null;

export function vocab() {
	if (!vocabCache) {
		const node = document.getElementById('lf-vocab');
		vocabCache = node ? JSON.parse(node.textContent) : { categories: [], placeKinds: [], districts: [], limits: {} };
	}
	return vocabCache;
}

export const categoryLabel = (id) => vocab().categories.find((c) => c.id === id)?.label || 'Something else';
export const districtName = (id) => vocab().districts.find((d) => d.id === id)?.name || '';
export const placeKindLabel = (id) => vocab().placeKinds.find((k) => k.id === id)?.label || '';

/** The private key a manage link, portal link or admin page carries in its #fragment. */
export function keyFromHash() {
	const match = /[#&]t=([A-Za-z0-9_-]+)/.exec(location.hash);
	return match ? match[1] : '';
}

export class ApiError extends Error {
	constructor(message, status, code) {
		super(message);
		this.status = status;
		this.code = code;
	}
}

export async function api(route, { params = {}, body, key } = {}) {
	const query = new URLSearchParams({ r: route, ...params });
	const headers = {};
	if (key) headers['X-LostFound-Key'] = key;
	if (body) headers['Content-Type'] = 'application/json';
	let response;
	try {
		response = await fetch(`/api/lost-found?${query}`, {
			method: body ? 'POST' : 'GET',
			headers,
			body: body ? JSON.stringify(body) : undefined,
			cache: 'no-store',
		});
	} catch {
		throw new ApiError('No connection. Check your data or wifi and try again.', 0, 'offline');
	}
	let payload = {};
	try { payload = await response.json(); } catch { /* not JSON: a 404 page, say */ }
	if (!response.ok) {
		throw new ApiError(payload.error || 'Something went wrong. Try again in a minute.', response.status, payload.code || (response.status === 404 ? 'route' : 'server'));
	}
	return payload;
}

/** Shown in place of a form while the owner has paused lost and found. */
export function pausedNotice(message) {
	return element('div', { class: 'lf-notice' }, [
		element('strong', { text: 'Lost and found is paused for now.' }),
		element('p', { text: message }),
	]);
}

/** The panel shown instead of a page that needs the service, when it cannot be reached. */
export function unavailable(error) {
	const notReady = error.code === 'not-configured' || error.code === 'route';
	return element('div', { class: 'lf-notice' }, [
		element('strong', { text: notReady ? 'Lost and found is opening soon.' : 'Lost and found could not load.' }),
		element('p', { text: notReady
			? 'The listings are not live yet. Check back shortly.'
			: error.message }),
	]);
}

// --- dates -----------------------------------------------------------------------

const DAY = 86400000;
const parseDay = (iso) => {
	const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
	return new Date(y, m - 1, d);
};

export function whenLabel(iso) {
	const today = new Date();
	const days = Math.round((new Date(today.getFullYear(), today.getMonth(), today.getDate()) - parseDay(iso)) / DAY);
	if (days <= 0) return 'today';
	if (days === 1) return 'yesterday';
	if (days < 7) return `${days} days ago`;
	return parseDay(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export const todayIso = () => {
	const d = new Date();
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// --- items ----------------------------------------------------------------------------

export function kindBadge(kind) {
	return element('span', { class: `lf-kind lf-kind-${kind}`, text: kind === 'lost' ? 'Lost' : 'Found' });
}

const STATUS = { returned: 'Back with its owner', closed: 'Closed', hidden: 'Taken down' };

/** One listing as a card linking to its detail. */
export function itemCard(item, { href } = {}) {
	const where = [item.place ? item.place.name : item.place_text, districtName(item.district)].filter(Boolean);
	const verb = item.kind === 'lost' ? 'Lost' : 'Found';
	return element('a', {
		class: `lf-card lf-card-${item.kind}${item.status !== 'open' ? ' is-done' : ''}`,
		href: href || `/lost-and-found#item=${item.ref}`,
	}, [
		element('span', { class: 'lf-card-top' }, [
			kindBadge(item.kind),
			element('span', { class: 'lf-card-cat', text: categoryLabel(item.category) }),
			item.status !== 'open' ? element('span', { class: 'lf-card-status', text: STATUS[item.status] || item.status }) : null,
		]),
		element('strong', { class: 'lf-card-title', text: item.title }),
		element('span', { class: 'lf-card-where', text: where.join(' · ') }),
		element('span', { class: 'lf-card-when', text: `${verb} ${whenLabel(item.happened_on)}` }),
		item.place ? element('span', { class: 'lf-card-held', text: `Held at ${item.place.name}` }) : null,
	]);
}

// --- form fields ----------------------------------------------------------------------------

let uidCounter = 0;
const uid = (name) => `lf-${name}-${++uidCounter}`;

/** A labelled input. Returns { node, input }. */
export function field({ name, label, hint, type = 'text', value = '', required, max, multiline, inputmode, autocomplete, placeholder }) {
	const id = uid(name);
	const input = element(multiline ? 'textarea' : 'input', {
		id, name,
		...(multiline ? { rows: '4' } : { type }),
		...(required ? { required: '' } : {}),
		...(max ? { maxlength: String(max) } : {}),
		...(inputmode ? { inputmode } : {}),
		...(autocomplete ? { autocomplete } : {}),
		...(placeholder ? { placeholder } : {}),
		'data-clarity-mask': 'true',
	});
	input.value = value;
	return {
		input,
		node: element('div', { class: 'lf-field' }, [
			element('label', { for: id, text: label }),
			input,
			hint ? element('span', { class: 'lf-hint', text: hint }) : null,
		]),
	};
}

/** A select. Options are [value, label] pairs. */
export function select({ name, label, options, value = '', hint, blank }) {
	const id = uid(name);
	const input = element('select', { id, name, 'data-clarity-mask': 'true' }, [
		blank ? element('option', { value: '', text: blank }) : null,
		...options.map(([v, l]) => element('option', { value: v, text: l })),
	]);
	input.value = value;
	return {
		input,
		node: element('div', { class: 'lf-field' }, [
			element('label', { for: id, text: label }),
			input,
			hint ? element('span', { class: 'lf-hint', text: hint }) : null,
		]),
	};
}

/**
 * One-of-many as tappable chips (radios). Returns { node, value() }.
 * `variant` lays them out differently: 'tiles' for an even grid, 'kinds' for
 * the two big lost-or-found choices in their own colours.
 */
export function chips({ name, label, options, value = '', variant }) {
	const group = uid(name);
	const node = element('fieldset', { class: `lf-chips${variant ? ` is-${variant}` : ''}` }, [
		element('legend', { text: label }),
		element('div', { class: 'lf-chip-row' }, options.map(([v, l]) => {
			const id = `${group}-${v}`;
			const radio = element('input', { type: 'radio', name: group, id, value: v, 'data-clarity-mask': 'true' });
			if (v === value) radio.checked = true;
			return element('label', { class: `lf-chip lf-chip-${v}`, for: id }, [radio, element('span', { text: l })]);
		})),
	]);
	return { node, value: () => node.querySelector('input:checked')?.value || '' };
}

export const districtOptions = () => vocab().districts.map((d) => [d.id, d.name]);
export const categoryOptions = () => vocab().categories.map((c) => [c.id, c.label]);

/** Grey stand-ins for cards while listings load, so the page does not jump. */
export function skeletonCards(n = 3) {
	return element('ul', { class: 'lf-list', 'aria-hidden': 'true' }, Array.from({ length: n }, () => element('li', {}, [
		element('div', { class: 'lf-card lf-card-skeleton' }, [
			element('span', { class: 'lf-skel is-short' }), element('span', { class: 'lf-skel is-title' }), element('span', { class: 'lf-skel' }), element('span', { class: 'lf-skel is-mid' }),
		]),
	])));
}

/** Cards arrive one after another rather than all at once. */
export function stagger(list) {
	[...list.children].forEach((li, i) => { li.classList.add('lf-in'); li.style.setProperty('--i', String(Math.min(i, 12))); });
	return list;
}

/** A message under a form: error, or success. */
export function say(target, message, tone = 'error') {
	target.replaceChildren(message ? element('p', { class: `lf-say lf-say-${tone}`, role: tone === 'error' ? 'alert' : 'status', text: message }) : '');
}

/** Copy to the clipboard, with a fallback for browsers that refuse. */
export async function copy(text, button) {
	try {
		await navigator.clipboard.writeText(text);
		const was = button.textContent;
		button.textContent = 'Copied ✓';
		button.classList.add('is-copied');
		setTimeout(() => { button.textContent = was; button.classList.remove('is-copied'); }, 1800);
	} catch {
		window.prompt('Copy this link:', text);
	}
}
