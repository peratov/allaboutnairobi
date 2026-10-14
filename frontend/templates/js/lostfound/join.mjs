// /lost-and-found/join: a mall, station or business asks for a portal.
//
// A person approves every place before it can list anything, so a page that
// says "held at Sarit Centre" was put there by Sarit Centre. The portal link goes
// to the email given here.

import { api, chips, districtOptions, element, field, say, select, unavailable, vocab, pausedNotice } from '/js/lostfound/common.mjs';

const root = document.querySelector('[data-lf-join]');

function build() {
	const name = field({ name: 'name', label: 'Name of the place', required: true, max: 80, placeholder: 'e.g. Sarit Centre' });
	const kind = chips({ name: 'kind', label: 'What kind of place?', options: vocab().placeKinds.map((k) => [k.id, k.label]), variant: 'tiles' });
	const district = select({ name: 'district', label: 'Which constituency?', options: districtOptions(), blank: 'Pick one' });
	const address = field({ name: 'address', label: 'Address', required: true, max: 140 });
	const hours = field({ name: 'hours', label: 'When people can collect', max: 100, placeholder: 'e.g. Daily, 9am to 9pm' });
	const collect = field({ name: 'collect_note', label: 'Where to collect', max: 200, placeholder: 'e.g. Customer service desk, ground floor' });
	const publicContact = field({ name: 'contact_public', label: 'A public contact (optional)', max: 60, hint: 'Shown on your page - a desk name or a front-desk number.' });
	const person = field({ name: 'contact_name', label: 'Your name', max: 60, autocomplete: 'name' });
	const email = field({ name: 'contact_email', label: 'Your work email', type: 'email', autocomplete: 'email', required: true, hint: 'Your private portal link is sent here.' });
	const phone = field({ name: 'contact_phone', label: 'Your phone', type: 'tel', inputmode: 'tel', autocomplete: 'tel', hint: 'So we can check you are who you say you are.' });
	const trap = element('input', { type: 'text', name: 'website', tabindex: '-1', autocomplete: 'off', class: 'lf-trap', 'aria-hidden': 'true' });
	const out = element('div');
	const submit = element('button', { type: 'submit', class: 'lf-primary', text: 'Ask for a portal' });

	const form = element('form', { class: 'lf-form', novalidate: '' }, [
		name.node, kind.node, district.node, address.node, hours.node, collect.node, publicContact.node,
		element('fieldset', { class: 'lf-private' }, [
			element('legend', { text: 'Who are you?' }),
			element('p', { class: 'lf-hint', text: 'Private. We check every place by hand before it goes live, so people can trust that "held at" means what it says.' }),
			person.node, email.node, phone.node,
		]),
		trap, submit, out,
	]);

	form.addEventListener('submit', async (event) => {
		event.preventDefault();
		say(out, '');
		if (!kind.value()) return say(out, 'Pick what kind of place it is.');
		submit.disabled = true;
		try {
			await api('join', { body: {
				name: name.input.value, kind: kind.value(), district: district.input.value, address: address.input.value,
				hours: hours.input.value, collect_note: collect.input.value, contact_public: publicContact.input.value,
				contact_name: person.input.value, contact_email: email.input.value, contact_phone: phone.input.value,
				website: trap.value,
			} });
			root.replaceChildren(element('div', { class: 'lf-success' }, [
				element('h2', { text: 'Thank you - we will be in touch' }),
				element('p', { text: `We check every place by hand. Once ${name.input.value} is approved, your private portal link goes to ${email.input.value}. Anyone with that link can list items for you, so keep it to the staff who handle lost property.` }),
			]));
		} catch (error) {
			say(out, error.message);
			submit.disabled = false;
		}
	});

	root.replaceChildren(
		element('ul', { class: 'lf-rules' }, [
			element('li', {}, [element('strong', { text: 'Log an item in seconds. ' }), document.createTextNode('What it is, roughly where it was found, the day. It appears on your page and in every search.')]),
			element('li', {}, [element('strong', { text: 'People describe before they come. ' }), document.createTextNode('Owners reply with what makes it theirs, so your staff can check before anyone turns up.')]),
			element('li', {}, [element('strong', { text: 'A page of your own. ' }), document.createTextNode('Link it from your site, or print it by your desk: "Lost something here? Look first."')]),
		]),
		form,
	);
}

if (root) api('meta').then((meta) => (meta.paused ? root.replaceChildren(pausedNotice(meta.paused)) : build(meta))).catch((error) => root.replaceChildren(unavailable(error)));
