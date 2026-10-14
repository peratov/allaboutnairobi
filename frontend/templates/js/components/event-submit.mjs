// /events/submit: an organiser sends an event for the calendar.
//
// Nothing sent here is published by sending it. It waits for the site's owner
// to check it in the admin, and approving it there commits it to the events
// calendar, which is when it appears on /events. So the form says plainly
// what happens next, and shows the event as its card will look - the same
// markup as the events page draws - while it is being typed, with a list of
// what is still missing.
//
// On a wide screen the preview and the list sit beside the form and stay in
// view; on a phone they sit above the send button, where the last look before
// sending is.
//
// The request goes to /api/lost-found?r=event: the function lost and found
// already runs, with its hourly limits, its honeypot and its same-origin check.

import { api, chips, element, field, say } from '/js/lostfound/common.mjs';

const root = document.querySelector('[data-event-submit]');
const aside = document.querySelector('[data-event-submit-aside]');
const wide = window.matchMedia('(min-width: 60rem)');
const DESCRIPTION_MIN = 40;

const weekday = (d) => d.toLocaleDateString('en-GB', { weekday: 'short' });
const month = (d) => d.toLocaleDateString('en-GB', { month: 'short' });
const asDay = (iso) => {
	const [y, m, d] = String(iso).split('-').map(Number);
	return y && m && d ? new Date(y, m - 1, d) : null;
};
const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// The days most events are: this Saturday, this Sunday, next Saturday.
function quickDays() {
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const ahead = (weekdayIndex, weeks = 0) => {
		const d = new Date(today);
		d.setDate(d.getDate() + ((weekdayIndex - d.getDay() + 7) % 7) + weeks * 7);
		return d;
	};
	return [['This Saturday', ahead(6)], ['This Sunday', ahead(0)], ['Next Saturday', ahead(6, 1)]];
}

const legend = (n, text) => element('legend', {}, [element('span', { class: 'event-submit-step', 'aria-hidden': 'true', text: String(n) }), text]);

function build(meta) {
	const title = field({ name: 'title', label: 'Name of the event', required: true, max: 100, placeholder: 'e.g. Chale Wote Street Art Festival' });
	const category = chips({ name: 'category', label: 'What kind of event?', options: meta.categories.map((c) => [c.id, c.label]), variant: 'tiles' });
	const starts = field({ name: 'starts', label: 'First day', type: 'date', required: true });
	const ends = field({ name: 'ends', label: 'Last day (optional)', type: 'date' });
	const time = field({ name: 'time', label: 'Time (optional)', max: 40, placeholder: 'e.g. 7pm, or Doors 6pm' });
	for (const input of [starts.input, ends.input]) {
		input.min = meta.earliest;
		input.max = meta.latest;
	}
	const quick = element('div', { class: 'event-submit-quick', role: 'group', 'aria-label': 'Pick a day' }, quickDays().map(([text, day]) => element('button', {
		type: 'button',
		text,
		'data-day': isoOf(day),
		'aria-pressed': 'false',
		onclick: () => {
			starts.input.value = isoOf(day);
			starts.input.dispatchEvent(new Event('input', { bubbles: true }));
		},
	})));
	const venue = field({ name: 'venue', label: 'Venue', required: true, max: 140, placeholder: 'e.g. National Theatre' });
	const area = field({ name: 'area', label: 'Area (optional)', max: 80, placeholder: 'e.g. Osu, or East Legon' });
	const description = field({ name: 'description', label: 'What is it?', multiline: true, required: true, max: 900, hint: 'What happens, and who it is for. Two or three sentences. Leave links and phone numbers out - the link has its own box.' });
	description.input.rows = 5;
	const counter = element('span', { class: 'lf-hint event-submit-count', 'aria-live': 'polite' });
	description.node.append(counter);
	const price = field({ name: 'price', label: 'Price (optional)', max: 60, placeholder: 'e.g. Free, or GH₵150 at the door' });
	const url = field({ name: 'url', label: 'Link for tickets or details (optional)', type: 'url', max: 300, inputmode: 'url', placeholder: 'https://' });
	const organiser = field({ name: 'organiser', label: 'Who is organising it?', required: true, max: 100, hint: 'Shown on the listing.' });

	const person = field({ name: 'contact_name', label: 'Your name', max: 60, autocomplete: 'name' });
	const email = field({ name: 'contact_email', label: 'Your email', type: 'email', required: true, autocomplete: 'email', inputmode: 'email', hint: 'You hear here when it is listed.' });
	const phone = field({ name: 'contact_phone', label: 'Your phone (optional)', type: 'tel', inputmode: 'tel', autocomplete: 'tel', hint: 'In case we need to check something quickly.' });
	const trap = element('input', { type: 'text', name: 'website', tabindex: '-1', autocomplete: 'off', class: 'lf-trap', 'aria-hidden': 'true' });

	// The card as /events will draw it, from what has been typed so far.
	const preview = element('ul', { class: 'event-list event-submit-preview', 'aria-hidden': 'true' });
	const label = (id) => meta.categories.find((c) => c.id === id)?.label || 'Event';

	// What is still needed before it can be sent, ticked off as it comes.
	const needs = [
		['Its name', () => title.input.value.trim().length >= 4],
		['What kind of event', () => Boolean(category.value())],
		['The first day', () => Boolean(starts.input.value)],
		['The venue', () => Boolean(venue.input.value.trim())],
		['A description', () => description.input.value.trim().length >= DESCRIPTION_MIN],
		['Who is organising it', () => Boolean(organiser.input.value.trim())],
		['Your email', () => /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email.input.value.trim())],
	];
	const checks = element('ul', { class: 'event-submit-checks', 'aria-label': 'Still needed' }, needs.map(([text]) => element('li', { text })));

	const drawPreview = () => {
		const first = asDay(starts.input.value);
		const last = asDay(ends.input.value);
		const where = [venue.input.value.trim() || area.input.value.trim(), price.input.value.trim(), organiser.input.value.trim() ? `By ${organiser.input.value.trim()}` : ''].filter(Boolean);
		const cat = category.value() || 'culture';
		preview.replaceChildren(element('li', { class: 'event', 'data-category': cat }, [
			element('div', { class: 'event-side' }, [
				element('span', { class: 'event-date' }, first ? [
					element('span', { class: 'event-weekday', text: weekday(first) }),
					element('span', { class: 'event-day', text: String(first.getDate()) }),
					element('span', { class: 'event-month', text: month(first) }),
				] : [element('span', { class: 'event-day', text: '?' })]),
			]),
			element('div', { class: 'event-body' }, [
				element('h3', { class: 'event-title', text: title.input.value.trim() || 'Your event' }),
				element('p', { class: 'event-meta' }, [
					element('span', { class: `event-tag event-tag-${cat}`, text: label(category.value()) }),
					last && first && last > first ? element('span', { class: 'event-when', text: `until ${weekday(last)} ${last.getDate()} ${month(last)}` }) : null,
					time.input.value.trim() ? element('span', { class: 'event-when', text: time.input.value.trim() }) : null,
				]),
				// Spaces between, as the server-drawn card has: the separator dot is
				// drawn after each item and needs a space before the next.
				where.length ? element('p', { class: 'event-where' }, where.flatMap((w, i) => [i ? ' ' : null, element('span', { text: w })])) : null,
				element('p', { class: 'event-description', text: description.input.value.trim() || 'What happens, and who it is for.' }),
				url.input.value.trim() ? element('p', { class: 'event-links' }, [element('span', { text: 'Tickets and details ↗' })]) : null,
			]),
		]));
		const n = description.input.value.trim().length;
		counter.textContent = n < DESCRIPTION_MIN ? `${DESCRIPTION_MIN - n} more characters needed` : `${900 - n} characters left`;
		needs.forEach(([, done], i) => checks.children[i].classList.toggle('is-done', done()));
		for (const b of quick.children) b.setAttribute('aria-pressed', String(b.dataset.day === starts.input.value));
	};

	const out = element('div');
	const submit = element('button', { type: 'submit', class: 'lf-primary', text: 'Send it for checking' });
	const send = element('div', { class: 'event-submit-send' }, [submit, out]);
	const previewBox = element('section', { class: 'event-submit-preview-box', 'aria-label': 'How it will look' }, [
		element('p', { class: 'event-submit-preview-label', text: 'How it will look on the events page' }),
		preview,
		element('p', { class: 'event-submit-preview-label', text: 'Still needed' }),
		checks,
	]);

	const form = element('form', { class: 'lf-form event-submit-form', novalidate: '' }, [
		element('fieldset', { class: 'event-submit-group' }, [legend(1, 'The event'), title.node, category.node]),
		element('fieldset', { class: 'event-submit-group' }, [legend(2, 'When'), element('div', { class: 'event-submit-pair' }, [starts.node, ends.node]), quick, time.node]),
		element('fieldset', { class: 'event-submit-group' }, [legend(3, 'Where'), venue.node, area.node]),
		element('fieldset', { class: 'event-submit-group' }, [legend(4, 'About it'), description.node, price.node, url.node, organiser.node]),
		element('fieldset', { class: 'event-submit-group lf-private' }, [
			legend(5, 'You'),
			element('p', { class: 'lf-hint', text: 'Private. Never shown on the site - only to the person who checks the event - and erased thirty days after the decision.' }),
			person.node, email.node, phone.node,
		]),
		trap,
		send,
	]);

	// Beside the form on a wide screen, above the send button on a phone.
	const place = () => {
		if (wide.matches && aside) aside.append(previewBox);
		else form.insertBefore(previewBox, send);
	};
	place();
	wide.addEventListener?.('change', place);

	form.addEventListener('input', drawPreview);
	form.addEventListener('change', drawPreview);
	drawPreview();

	const problem = (message, input) => {
		say(out, message);
		(input || out).scrollIntoView({ block: 'center', behavior: 'smooth' });
		input?.focus({ preventScroll: true });
	};

	form.addEventListener('submit', async (event) => {
		event.preventDefault();
		say(out, '');
		// The few checks worth making before a round trip; the server makes them all.
		if (!title.input.value.trim()) return problem('Give the event its name.', title.input);
		if (!category.value()) return problem('Pick what kind of event it is.', category.node.querySelector('input'));
		if (!starts.input.value) return problem('Pick the day it starts.', starts.input);
		if (!venue.input.value.trim()) return problem('Say where it is.', venue.input);
		if (description.input.value.trim().length < DESCRIPTION_MIN) return problem('Say a little more about it - what happens, and who it is for.', description.input);
		if (!organiser.input.value.trim()) return problem('Say who is organising it.', organiser.input);
		if (!email.input.value.trim()) return problem('Leave your email, so you hear when it is listed.', email.input);
		submit.disabled = true;
		submit.classList.add('is-busy');
		try {
			const answer = await api('event', { body: {
				title: title.input.value, category: category.value(), starts: starts.input.value, ends: ends.input.value, time: time.input.value,
				venue: venue.input.value, area: area.input.value, description: description.input.value, price: price.input.value,
				url: url.input.value.trim(), organiser: organiser.input.value,
				contact_name: person.input.value, contact_email: email.input.value, contact_phone: phone.input.value,
				website: trap.value,
			} });
			done(title.input.value.trim(), email.input.value.trim(), answer.ref);
		} catch (error) {
			problem(error.message);
			submit.disabled = false;
			submit.classList.remove('is-busy');
		}
	});

	root.replaceChildren(form);
}

function done(title, email, ref) {
	const tick = element('div', { 'aria-hidden': 'true' });
	tick.innerHTML = '<svg class="event-submit-tick" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30"/><path d="M19 33l9 9 17-19"/></svg>';
	const box = element('div', { class: 'lf-success event-submit-done', tabindex: '-1' }, [
		tick,
		element('h2', { text: 'Thank you - it is with us' }),
		element('p', { text: `${title} has been sent. Your reference is ${ref}.` }),
		element('ol', { class: 'event-submit-next' }, [
			element('li', { text: 'A person checks it - the date, the venue, that it is open to the public. Usually within a day or two.' }),
			element('li', { text: `You get an email at ${email} when it is on the site, or if it cannot be listed.` }),
			element('li', { text: 'It appears on the events page, and drops off by itself the day after it ends.' }),
		]),
		element('p', {}, [element('a', { class: 'lf-secondary', href: '/events', text: 'See what is on' }), ' ', element('a', { class: 'lf-secondary', href: '/events/submit', text: 'Send another' })]),
	]);
	if (aside) { aside.replaceChildren(); aside.hidden = true; }
	root.parentElement?.classList.add('is-done');
	root.replaceChildren(box);
	box.scrollIntoView({ block: 'start', behavior: 'smooth' });
	box.focus({ preventScroll: true });
}

function paused(message) {
	return element('div', { class: 'lf-notice' }, [element('strong', { text: 'Event submissions are paused for now.' }), element('p', { text: message })]);
}

function unavailable(error) {
	return element('div', { class: 'lf-notice' }, [
		element('strong', { text: 'The form could not load.' }),
		element('p', { text: error.code === 'not-configured' ? 'Event submissions are not open yet. Check back shortly.' : error.message }),
	]);
}

if (root) {
	api('event-meta')
		.then((meta) => (meta.paused ? root.replaceChildren(paused(meta.paused)) : build(meta)))
		.catch((error) => root.replaceChildren(unavailable(error)));
}
