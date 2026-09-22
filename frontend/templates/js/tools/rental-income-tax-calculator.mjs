// Monthly residential rental income tax for resident landlords in Kenya.

import constants from '/js/utils/constants.mjs';
import { mount, numberField, headline, breakdown, note, money, element } from '/js/utils/tool-ui.mjs';

class RentalIncomeTaxCalculator extends HTMLElement {
	connectedCallback() {
		if (this.ready) return;
		this.ready = true;
		const c = constants();
		const state = { rent: 60000, rate: c.MRI_RATE };
		const redraw = mount(this, 'Rental income tax', () => [
			numberField({
				label: 'Rent received this month, all residential units', value: state.rent, step: '1000',
				onInput: (v) => { state.rent = v; redraw(); },
			}),
			numberField({
				label: 'Tax rate', value: state.rate, step: '0.5', prefix: '%',
				onInput: (v) => { state.rate = v; redraw(); },
				hint: `KRA's published rate is ${c.MRI_RATE}%. Change it here if the law changes.`,
			}),
		], () => {
			if (state.rent <= 0) return [note('Enter the rent received.')];
			const tax = state.rent * state.rate / 100;
			const annual = state.rent * 12;
			let status = null;
			if (annual <= c.MRI_LOWER_LIMIT) {
				status = `At this rent your year's total is about ${money(annual)}, at or below the ${money(c.MRI_LOWER_LIMIT)} threshold, so the monthly regime does not apply.`;
			} else if (annual > c.MRI_UPPER_LIMIT) {
				status = `At this rent your year's total is about ${money(annual)}, above ${money(c.MRI_UPPER_LIMIT)}, so rental income goes on your ordinary annual return instead.`;
			}
			const outside = annual <= c.MRI_LOWER_LIMIT || annual > c.MRI_UPPER_LIMIT;
			return [
				outside
					? headline('Not this tax', 'at this level of rent')
					: headline(money(tax), 'to pay for this month'),
				status ? element('p', { class: 'tool-warning', text: status }) : null,
				breakdown([
					['Gross rent received', money(state.rent)],
					outside ? null : [`Tax at ${state.rate}% of gross`, money(tax), 'total'],
					outside ? null : ['What you keep', money(state.rent - tax), 'subtle'],
					outside ? null : ['Over a full year at this rent', money(tax * 12), 'subtle'],
				]),
				note('Tax is on the rent actually received, with no deductions for repairs, mortgage interest or agent fees. File and pay on iTax by the 20th of the following month, including a nil return in months with no rent.'),
			];
		});
	}
}

customElements.define('rental-income-tax-calculator', RentalIncomeTaxCalculator);
