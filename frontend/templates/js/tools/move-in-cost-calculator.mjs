// How much cash a Nairobi rental needs before you get the keys.

import { mount, numberField, choice, headline, breakdown, note, money } from '/js/utils/tool-ui.mjs';

class MoveInCostCalculator extends HTMLElement {
	connectedCallback() {
		if (this.ready) return;
		this.ready = true;
		const state = { rent: 45000, depositMonths: '1', agency: '0', water: 2000, power: 0, service: 0, moving: 8000 };
		const redraw = mount(this, 'Move-in costs', () => [
			numberField({ label: 'Monthly rent', value: state.rent, step: '1000', onInput: (v) => { state.rent = v; redraw(); } }),
			choice({
				label: 'Deposit', value: state.depositMonths,
				options: [['1', '1 month'], ['2', '2 months'], ['3', '3 months']],
				onChange: (v) => { state.depositMonths = v; redraw(); },
			}),
			choice({
				label: 'Agency fee', value: state.agency,
				options: [['0', 'None'], ['0.5', 'Half a month'], ['1', 'One month']],
				onChange: (v) => { state.agency = v; redraw(); },
			}),
			numberField({ label: 'Water deposit', value: state.water, step: '500', onInput: (v) => { state.water = v; redraw(); } }),
			numberField({
				label: 'Electricity deposit', value: state.power, step: '500', onInput: (v) => { state.power = v; redraw(); },
				hint: 'Usually nothing on a prepaid meter.',
			}),
			numberField({ label: 'Monthly service charge, if separate', value: state.service, step: '500', onInput: (v) => { state.service = v; redraw(); } }),
			numberField({
				label: 'Moving and set-up', value: state.moving, step: '1000', onInput: (v) => { state.moving = v; redraw(); },
				hint: 'Truck or pick-up, curtains, a gas cylinder, the first tokens.',
			}),
		], () => {
			if (state.rent <= 0) return [note('Enter the monthly rent.')];
			const months = Number(state.depositMonths);
			const deposit = state.rent * months;
			const agency = state.rent * Number(state.agency);
			const upfront = state.rent + state.service + deposit + agency + state.water + state.power + state.moving;
			const refundable = deposit + state.water + state.power;
			return [
				headline(money(upfront), 'in cash before you move in'),
				breakdown([
					["First month's rent", money(state.rent)],
					state.service ? ["First month's service charge", money(state.service)] : null,
					[`Deposit (${months} month${months === 1 ? '' : 's'})`, money(deposit)],
					agency ? ['Agency fee', money(agency)] : null,
					state.water ? ['Water deposit', money(state.water)] : null,
					state.power ? ['Electricity deposit', money(state.power)] : null,
					state.moving ? ['Moving and set-up', money(state.moving)] : null,
					['Total up front', money(upfront), 'total'],
					['Of which refundable when you leave', money(refundable), 'subtle'],
					['Rent and service charge for the first year', money((state.rent + state.service) * 12), 'subtle'],
				]),
				note('Get a receipt that says which payments are deposits. Never pay before you have seen the flat and met the landlord or a verified agent.'),
			];
		});
	}
}

customElements.define('move-in-cost-calculator', MoveInCostCalculator);
