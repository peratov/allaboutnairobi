// Gross and net rental yield on a Nairobi property, after costs, voids and
// monthly rental income tax.

import constants from '/js/utils/constants.mjs';
import { mount, numberField, headline, breakdown, note, money } from '/js/utils/tool-ui.mjs';

const pct = (n) => `${(Math.round(n * 10) / 10).toFixed(1)}%`;

class RentalYieldCalculator extends HTMLElement {
	connectedCallback() {
		if (this.ready) return;
		this.ready = true;
		const c = constants();
		const state = { price: 8000000, rent: 50000, vacant: 1, service: 5000, agent: 10, repairs: 30000 };
		const redraw = mount(this, 'Rental yield', () => [
			numberField({ label: 'Purchase price, with buying costs', value: state.price, step: '100000', onInput: (v) => { state.price = v; redraw(); } }),
			numberField({ label: 'Monthly rent', value: state.rent, step: '1000', onInput: (v) => { state.rent = v; redraw(); } }),
			numberField({ label: 'Months empty each year', value: state.vacant, step: '0.5', prefix: '', onInput: (v) => { state.vacant = Math.min(12, v); redraw(); } }),
			numberField({ label: 'Service charge you pay, a month', value: state.service, step: '500', onInput: (v) => { state.service = v; redraw(); } }),
			numberField({ label: 'Agent or management fee, % of rent', value: state.agent, step: '1', prefix: '%', onInput: (v) => { state.agent = v; redraw(); } }),
			numberField({ label: 'Repairs and upkeep, a year', value: state.repairs, step: '5000', onInput: (v) => { state.repairs = v; redraw(); } }),
		], () => {
			if (state.price <= 0 || state.rent <= 0) return [note('Enter the price and the rent.')];
			const gross = state.rent * 12;
			const collected = state.rent * (12 - state.vacant);
			const tax = collected >= c.MRI_LOWER_LIMIT && collected <= c.MRI_UPPER_LIMIT ? collected * c.MRI_RATE / 100 : 0;
			const agent = collected * state.agent / 100;
			const service = state.service * 12;
			const net = collected - tax - agent - service - state.repairs;
			return [
				headline(pct(100 * net / state.price), 'net yield a year'),
				breakdown([
					['Gross yield (full year, no costs)', pct(100 * gross / state.price), 'subtle'],
					['Rent collected', money(collected)],
					[`Rental income tax (${c.MRI_RATE}%)`, `− ${money(tax)}`],
					['Agent or management fee', `− ${money(agent)}`],
					['Service charge', `− ${money(service)}`],
					['Repairs and upkeep', `− ${money(state.repairs)}`],
					['Net income a year', money(net), 'total'],
				]),
				note('Before mortgage interest, and before any rise or fall in the property’s value. Rental income tax is charged on gross rent with no deductions, which is why costs matter so much to the net figure.'),
			];
		});
	}
}

customElements.define('rental-yield-calculator', RentalYieldCalculator);
