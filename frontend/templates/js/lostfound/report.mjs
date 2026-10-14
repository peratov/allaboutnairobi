// /lost-and-found/report: list something lost or found.
//
// Four short steps instead of one long form, in the order people think about
// it: what happened, what it looks like, when and where, how to reach you.
// Each step checks itself before the next, so a mistake is caught beside the
// field it is about rather than at the bottom of a long page; the last step
// shows everything once more before it is listed. If the server still refuses
// something - a long number in the title, say - the form goes back to the
// step that holds it.
//
// It is one <form> throughout: the steps only show and hide fieldsets, so
// nothing typed is lost going back and forth, and the browser's own
// autocomplete still works.
//
// The end is the part that matters most - the private link is the only key to
// the listing, so it is shown with a copy button and a "send it to yourself on
// WhatsApp" link, and any likely matches are shown at once.

import { api, categoryLabel, categoryOptions, chips, copy, districtName, districtOptions, element, field, itemCard, pausedNotice, say, select, stagger, todayIso, unavailable, vocab } from '/js/lostfound/common.mjs';

const root = document.querySelector('[data-lf-report]');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const isoDaysAgo = (n) => {
	const d = new Date(Date.now() - n * 86400000);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function build() {
	const startKind = new URLSearchParams(location.search).get('kind') === 'found' ? 'found' : 'lost';
	const { limits } = vocab();

	const kind = chips({ name: 'kind', label: 'Did you lose it or find it?', options: [['lost', 'I lost something'], ['found', 'I found something']], value: startKind, variant: 'kinds' });
	const category = chips({ name: 'category', label: 'What kind of thing?', options: categoryOptions(), variant: 'tiles' });
	const title = field({ name: 'title', label: 'What is it?', required: true, max: limits.titleMax, placeholder: 'e.g. Black Samsung A54 in a blue case' });
	const details = field({ name: 'details', label: 'Describe it', multiline: true, max: limits.detailsMax });
	const when = field({ name: 'happened_on', label: 'When?', type: 'date', value: todayIso() });
	when.input.max = todayIso();
	const district = select({ name: 'district', label: 'Which constituency?', options: districtOptions(), blank: 'Not sure' });
	const where = field({ name: 'place_text', label: 'Where exactly?', required: true, max: limits.placeTextMax, placeholder: 'e.g. Matatu from the CBD to Rongai' });
	const name = field({ name: 'contact_name', label: 'Your name', max: 60, autocomplete: 'name' });
	const phone = field({ name: 'contact_phone', label: 'Phone or WhatsApp', type: 'tel', inputmode: 'tel', autocomplete: 'tel' });
	const email = field({ name: 'contact_email', label: 'Or email', type: 'email', autocomplete: 'email' });

	// A field no person sees and a bot fills in.
	const trap = element('input', { type: 'text', name: 'website', tabindex: '-1', autocomplete: 'off', class: 'lf-trap', 'aria-hidden': 'true' });

	// Most things are lost today or yesterday: one tap instead of a calendar.
	const quick = element('div', { class: 'lf-quick', role: 'group', 'aria-label': 'Quick dates' }, [['Today', 0], ['Yesterday', 1], ['2 days ago', 2]].map(([label, n]) => element('button', {
		type: 'button', class: 'lf-quick-date', text: label,
		onclick: () => { when.input.value = isoDaysAgo(n); markQuick(); },
	})));
	const markQuick = () => {
		for (const [i, b] of [...quick.children].entries()) b.setAttribute('aria-pressed', String(when.input.value === isoDaysAgo(i)));
	};
	when.input.addEventListener('input', markQuick);
	when.node.append(quick);
	markQuick();

	const tip = element('p', { class: 'lf-tip', hidden: '' });
	const out = element('div', { class: 'lf-step-error', 'aria-live': 'assertive' });
	const review = element('dl', { class: 'lf-review' });
	const submit = element('button', { type: 'submit', class: 'lf-primary lf-next', text: 'List it' });

	// The guidance changes with what you are listing.
	const refresh = () => {
		const found = kind.value() === 'found';
		details.node.querySelector('.lf-hint')?.remove();
		details.node.append(element('span', { class: 'lf-hint', text: found
			? 'Describe it, but keep one detail back - something only the owner would know. You will ask anyone who says it is theirs.'
			: 'Colour, make, marks, what was inside. The more someone can recognise, the better.' }));
		const docs = category.value() === 'documents';
		tip.hidden = !docs;
		tip.textContent = found
			? 'Found an ID card? Hand it to the nearest police station or NIA office as well, and list it by the name on it only - never the number.'
			: 'Lost an ID? Report it to the police too: replacing a national ID, Maisha Card, passport or licence starts with a police abstract.';
		submit.textContent = found ? 'List what I found' : 'List what I lost';
		when.node.querySelector('label').textContent = found ? 'When did you find it?' : 'When did you lose it?';
		where.node.querySelector('label').textContent = found ? 'Where did you find it?' : 'Where did you last have it?';
	};
	kind.node.addEventListener('change', refresh);
	category.node.addEventListener('change', () => {
		refresh();
		// Choosing a category is the answer to the step: move on by itself.
		if (current === 0) setTimeout(() => go(1), reduceMotion.matches ? 0 : 220);
	});

	const steps = [
		{
			label: 'What',
			heading: 'What happened?',
			nodes: [kind.node, category.node, tip],
			check: () => (category.value() ? null : ['Pick what kind of thing it is.', category.node]),
		},
		{
			label: 'Describe',
			heading: 'Describe it',
			nodes: [title.node, details.node],
			check: () => (title.input.value.trim() ? null : ['Say what it is - a few words is enough.', title.input]),
		},
		{
			label: 'Where',
			heading: 'When and where',
			nodes: [element('div', { class: 'lf-pair' }, [when.node, district.node]), where.node],
			check: () => (!when.input.value ? ['Pick the date.', when.input]
				: !where.input.value.trim() ? ['Say where - a street, a matatu route, a building.', where.input] : null),
		},
		{
			label: 'Contact',
			heading: 'How can they reach you?',
			nodes: [
				element('p', { class: 'lf-private-note' }, [element('strong', { text: 'Never shown on the listing. ' }), 'Replies come to a private link you get at the end, with how to reach the person - you decide who to call.']),
				name.node,
				element('div', { class: 'lf-pair' }, [phone.node, email.node]),
				element('h3', { class: 'lf-review-title', text: 'Check it before it goes up' }),
				review,
			],
			check: () => (phone.input.value.trim() || email.input.value.trim() ? null : ['Leave a phone number or an email, so replies can reach you.', phone.input]),
		},
	];

	const progress = element('div', { class: 'lf-progress' }, [
		element('div', { class: 'lf-progress-bar' }, [element('span', { class: 'lf-progress-fill' })]),
		element('ol', { class: 'lf-progress-steps' }, steps.map((s, i) => element('li', { 'data-step': String(i) }, [element('span', { class: 'lf-progress-dot', text: String(i + 1) }), element('span', { class: 'lf-progress-label', text: s.label })]))),
	]);
	const panels = steps.map((s, i) => element('fieldset', { class: 'lf-step', 'data-step': String(i), hidden: '' }, [
		element('legend', { class: 'lf-step-title', text: s.heading }),
		...s.nodes,
	]));
	const back = element('button', { type: 'button', class: 'lf-secondary lf-back', text: 'Back', onclick: () => go(current - 1) });
	const next = element('button', { type: 'button', class: 'lf-primary lf-next', text: 'Next', onclick: () => go(current + 1) });

	const form = element('form', { class: 'lf-form lf-wizard', novalidate: '' }, [
		progress,
		...panels,
		trap,
		out,
		element('div', { class: 'lf-step-nav' }, [back, next, submit]),
	]);

	function fillReview() {
		const rows = [
			['Listing', `${kind.value() === 'found' ? 'Found' : 'Lost'} · ${categoryLabel(category.value())}`, 0],
			['What', title.input.value.trim(), 1],
			['When', when.input.value ? new Date(`${when.input.value}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '', 2],
			['Where', [where.input.value.trim(), districtName(district.input.value)].filter(Boolean).join(' · '), 2],
		];
		review.replaceChildren(...rows.flatMap(([label, value, step]) => [
			element('dt', { text: label }),
			element('dd', {}, [element('span', { text: value || '-' }), element('button', { type: 'button', class: 'lf-link lf-edit', text: 'Change', onclick: () => go(step) })]),
		]));
	}

	let current = -1;
	function go(target, { skipCheck = false } = {}) {
		if (target < 0 || target >= steps.length) return;
		// Forward only past steps that are complete.
		if (target > current && !skipCheck) {
			for (let i = Math.max(current, 0); i < target; i++) {
				const problem = steps[i].check();
				if (problem) return show(i, problem);
			}
		}
		say(out, '');
		const forward = target > current;
		current = target;
		panels.forEach((panel, i) => {
			panel.hidden = i !== current;
			panel.classList.remove('is-forward', 'is-backward');
			if (i === current) {
				void panel.offsetWidth; // restart the entrance
				panel.classList.add(forward ? 'is-forward' : 'is-backward');
			}
		});
		for (const li of progress.querySelectorAll('li')) {
			const i = Number(li.dataset.step);
			li.classList.toggle('is-done', i < current);
			li.classList.toggle('is-current', i === current);
		}
		progress.querySelector('.lf-progress-fill').style.width = `${((current + 1) / steps.length) * 100}%`;
		back.hidden = current === 0;
		next.hidden = current === steps.length - 1;
		submit.hidden = current !== steps.length - 1;
		if (current === steps.length - 1) fillReview();
		const top = form.getBoundingClientRect().top;
		if (top < 0) form.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'start' });
		const first = panels[current].querySelector('input:not([type=radio]), textarea, select');
		if (first && current > 0) first.focus({ preventScroll: true });
	}

	function show(step, [message, target]) {
		if (step !== current) go(step, { skipCheck: true });
		say(out, message);
		target?.focus?.({ preventScroll: false });
		target?.classList?.add('is-invalid');
		setTimeout(() => target?.classList?.remove('is-invalid'), 1600);
	}

	// Enter moves on rather than submitting half a form.
	form.addEventListener('keydown', (event) => {
		if (event.key === 'Enter' && event.target.tagName === 'INPUT' && current < steps.length - 1) {
			event.preventDefault();
			go(current + 1);
		}
	});

	form.addEventListener('submit', async (event) => {
		event.preventDefault();
		for (let i = 0; i < steps.length; i++) {
			const problem = steps[i].check();
			if (problem) return show(i, problem);
		}
		say(out, '');
		submit.disabled = true;
		submit.classList.add('is-busy');
		try {
			const result = await api('report', { body: {
				kind: kind.value(), category: category.value(),
				title: title.input.value, details: details.input.value,
				happened_on: when.input.value, district: district.input.value, place_text: where.input.value,
				contact_name: name.input.value, contact_phone: phone.input.value, contact_email: email.input.value,
				website: trap.value,
			} });
			done(result, kind.value());
		} catch (error) {
			// Send them back to the step the server's complaint is about.
			const message = error.message || '';
			const step = /What it is|description/i.test(message) ? 1 : /Where|date/i.test(message) ? 2 : /phone|email|reach/i.test(message) ? 3 : current;
			const target = step === 1 ? (/description/i.test(message) ? details.input : title.input) : step === 2 ? where.input : step === 3 ? phone.input : null;
			show(step, [message, target]);
			submit.disabled = false;
			submit.classList.remove('is-busy');
		}
	});

	refresh();
	root.replaceChildren(form);
	go(0);
	// The coffee button would sit on the pinned Next button; it steps aside,
	// the way it does for the rating prompt.
	document.querySelector('.support-float')?.classList.add('is-yielding');
}

function done({ ref, manage, matches }, kind) {
	const message = `My All About Nairobi lost and found listing ${ref}. Private link - do not share: ${manage}`;
	const tick = element('div', { class: 'lf-tick', 'aria-hidden': 'true' });
	tick.innerHTML = '<svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="24"/><path d="M15 27l7 7 15-16"/></svg>';
	const list = matches.length ? stagger(element('ul', { class: 'lf-list' }, matches.map((m) => element('li', {}, [itemCard(m)])))) : null;
	root.replaceChildren(element('div', { class: 'lf-success', 'data-clarity-mask': 'true' }, [
		tick,
		element('p', { class: 'lf-success-ref' }, [element('span', { text: 'Listed as ' }), element('strong', { text: ref })]),
		element('h2', { text: 'Save your private link now' }),
		element('p', { text: 'It is the only way to read replies and to close the listing when it is sorted. We cannot show it to you again, and we do not know who you are.' }),
		element('div', { class: 'lf-key' }, [
			element('code', { text: manage }),
			element('div', { class: 'lf-share' }, [
				element('button', { type: 'button', class: 'lf-primary', text: 'Copy the link', onclick: (event) => copy(manage, event.currentTarget) }),
				element('a', { class: 'lf-secondary', href: `https://wa.me/?text=${encodeURIComponent(message)}`, target: '_blank', rel: 'noopener', text: 'Send it to myself on WhatsApp' }),
			]),
		]),
		element('p', { class: 'lf-success-links' }, [
			element('a', { href: `/lost-and-found#item=${ref}`, text: 'See your listing' }),
			element('a', { href: manage, text: 'Open your private page' }),
		]),
		list ? element('section', { class: 'lf-matches' }, [
			element('h3', { text: kind === 'lost' ? 'Already found - could one of these be yours?' : 'Someone may be looking for this' }),
			list,
		]) : null,
	]));
	root.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'start' });
}

if (root) {
	// Check the service is there before asking anyone to type two minutes of form.
	api('meta').then((meta) => (meta.paused ? root.replaceChildren(pausedNotice(meta.paused)) : build(meta))).catch((error) => root.replaceChildren(unavailable(error)));
}
