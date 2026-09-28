// AFCON 2027 trip budget: what a fan trip to Nairobi costs a group, in
// shillings and dollars. Official fees (the eTA, park entry) come from
// content/constants.yaml through #site-constants; everything that depends on
// the traveller - rooms, tickets, food - is theirs to set, because CAF has not
// yet published ticket prices and hotel rates will move before June 2027.

import constants from '/js/utils/constants.mjs';
import { mount, numberField, choice, checkbox, headline, breakdown, note, money, element } from '/js/utils/tool-ui.mjs';

function usd(value) {
	return 'US$ ' + Math.round(value).toLocaleString('en-US');
}

class AfconTripBudget extends HTMLElement {
	connectedCallback() {
		if (this.ready) return;
		this.ready = true;
		const c = constants();
		const state = {
			people: 2, nights: 7, room: 9000, rooms: 1, matches: 3, ticket: 3000,
			transport: 2500, food: 3500, sim: 1000, eta: true, rate: 129,
			park: false, parkTour: 12000, mara: false, maraDays: 2, maraPackage: 45000, month: 'june',
		};

		// The park and Mara fields appear only when ticked, so those checkboxes
		// rebuild the form rather than just redrawing the results.
		let redraw;
		const build = () => { redraw = mount(this, 'Your AFCON trip to Nairobi', form, results); };
		const form = () => [
			numberField({ label: 'Travellers', value: state.people, step: '1', prefix: '', min: '1', onInput: (v) => { state.people = Math.max(1, Math.round(v)); redraw(); } }),
			numberField({ label: 'Nights in Nairobi', value: state.nights, step: '1', prefix: '', onInput: (v) => { state.nights = Math.round(v); redraw(); } }),
			numberField({ label: 'Rooms', value: state.rooms, step: '1', prefix: '', min: '1', onInput: (v) => { state.rooms = Math.max(1, Math.round(v)); redraw(); } }),
			numberField({ label: 'Price per room per night', value: state.room, step: '500', onInput: (v) => { state.room = v; redraw(); },
				hint: 'Book early - rooms near the stadiums and in Westlands will fill up for Kenya matches.' }),
			numberField({ label: 'Matches you will attend', value: state.matches, step: '1', prefix: '', onInput: (v) => { state.matches = Math.round(v); redraw(); } }),
			numberField({ label: 'Ticket price per person per match', value: state.ticket, step: '500', onInput: (v) => { state.ticket = v; redraw(); },
				hint: 'CAF has not published AFCON 2027 prices yet. Put in your own guess, and update it when sales open.' }),
			numberField({ label: 'Getting around, for the group, per day', value: state.transport, step: '250', onInput: (v) => { state.transport = v; redraw(); },
				hint: 'Ride-hailing to matches and around town. Try the matchday planner for stadium trips.' }),
			numberField({ label: 'Food and drinks, per person per day', value: state.food, step: '250', onInput: (v) => { state.food = v; redraw(); } }),
			numberField({ label: 'SIM card and data, per person', value: state.sim, step: '100', onInput: (v) => { state.sim = v; redraw(); } }),
			checkbox({ label: `Kenya eTA for each traveller (US$ ${c.ETA_FEE_USD}; most African passports are exempt)`, checked: state.eta, onChange: (v) => { state.eta = v; redraw(); } }),
			checkbox({ label: 'A morning in Nairobi National Park', checked: state.park, onChange: (v) => { state.park = v; build(); } }),
			state.park ? numberField({ label: 'Park tour or vehicle, for the group', value: state.parkTour, step: '1000', onInput: (v) => { state.parkTour = v; redraw(); } }) : null,
			checkbox({ label: 'A trip to the Maasai Mara between matches', checked: state.mara, onChange: (v) => { state.mara = v; build(); } }),
			state.mara ? choice({ label: 'When?', value: state.month, options: [['june', 'Before 1 July'], ['july', 'From 1 July']], onChange: (v) => { state.month = v; redraw(); } }) : null,
			state.mara ? numberField({ label: 'Days in the Mara', value: state.maraDays, step: '1', prefix: '', onInput: (v) => { state.maraDays = Math.round(v); redraw(); } }) : null,
			state.mara ? numberField({ label: 'Safari package per person, excluding reserve fees', value: state.maraPackage, step: '5000', onInput: (v) => { state.maraPackage = v; redraw(); } }) : null,
			numberField({ label: 'Shillings to the US dollar', value: state.rate, step: '0.5', prefix: 'KES', onInput: (v) => { state.rate = Math.max(1, v); redraw(); },
				hint: 'Check today’s rate - it moves.' }),
		].filter(Boolean);
		const results = () => {
			const p = state.people;
			const rows = [];
			const add = (label, kes) => { if (kes > 0) rows.push([label, money(kes)]); return kes; };

			let total = 0;
			total += add(`Accommodation: ${state.rooms} room${state.rooms > 1 ? 's' : ''} × ${state.nights} nights`, state.rooms * state.nights * state.room);
			total += add(`Match tickets: ${state.matches} × ${p}`, state.matches * p * state.ticket);
			total += add(`Getting around: ${state.nights} days`, state.nights * state.transport);
			total += add(`Food and drinks: ${p} × ${state.nights} days`, p * state.nights * state.food);
			total += add('SIM cards and data', p * state.sim);
			if (state.eta) total += add(`eTA: ${p} × US$ ${c.ETA_FEE_USD}`, p * c.ETA_FEE_USD * state.rate);
			if (state.park) {
				total += add(`Nairobi National Park fees: ${p} × US$ ${c.NNP_FEE_NONRESIDENT_USD}`, p * c.NNP_FEE_NONRESIDENT_USD * state.rate);
				total += add('Park tour or vehicle', state.parkTour);
			}
			if (state.mara) {
				const fee = state.month === 'july' ? c.MARA_FEE_PEAK_USD : c.MARA_FEE_LOW_USD;
				total += add(`Maasai Mara reserve fees: ${p} × ${state.maraDays} days × US$ ${fee}`, p * state.maraDays * fee * state.rate);
				total += add('Safari package', p * state.maraPackage);
			}
			rows.push(['Total', money(total), 'total']);

			return [
				headline(money(total), `for ${p} traveller${p > 1 ? 's' : ''}, about ${usd(total / state.rate)}`),
				breakdown(rows),
				headline(money(total / p), `per person, about ${usd(total / p / state.rate)}`),
				note('Flights to Nairobi are not included. Park and reserve fees are the published non-resident adult rates; citizens, residents and children pay less. Book accommodation with free cancellation until the fixtures and ticket prices are confirmed.'),
				element('p', { class: 'afcon-tool-links' }, [
					element('a', { href: '/tools/afcon-matchday-planner', text: 'Matchday planner' }),
					document.createTextNode(' · '),
					element('a', { href: '/guides/visiting-nairobi-for-afcon-2027', text: 'Visiting Nairobi for AFCON' }),
					document.createTextNode(' · '),
					element('a', { href: '/afcon', text: 'AFCON 2027 hub' }),
				]),
			];
		};
		build();
	}
}

customElements.define('afcon-trip-budget', AfconTripBudget);
