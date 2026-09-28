// Monthly turnover tax for a small business in Kenya.

import constants from '/js/utils/constants.mjs';
import { mount, numberField, headline, breakdown, note, money, element } from '/js/utils/tool-ui.mjs';

class TurnoverTaxCalculator extends HTMLElement {
	connectedCallback() {
		if (this.ready) return;
		this.ready = true;
		const c = constants();
		const state = { sales: 250000, rate: c.TURNOVER_TAX_RATE };
		const redraw = mount(this, 'Turnover tax', () => [
			numberField({
				label: 'Gross sales this month', value: state.sales, step: '5000',
				onInput: (v) => { state.sales = v; redraw(); },
				hint: 'Everything the business took in, before any costs.',
			}),
			numberField({
				label: 'Turnover tax rate', value: state.rate, step: '0.5', prefix: '%',
				onInput: (v) => { state.rate = v; redraw(); },
				hint: `KRA's published rate is ${c.TURNOVER_TAX_RATE}%.`,
			}),
		], () => {
			if (state.sales <= 0) return [note('Enter this month’s sales.')];
			const tax = state.sales * state.rate / 100;
			const yearly = state.sales * 12;
			let warning = null;
			if (yearly <= c.TURNOVER_TAX_LOWER) {
				warning = `At this level your year's turnover is about ${money(yearly)}, not above ${money(c.TURNOVER_TAX_LOWER)}, so turnover tax does not apply.`;
			} else if (yearly > c.TURNOVER_TAX_UPPER) {
				warning = `At this level your year's turnover is about ${money(yearly)}, above ${money(c.TURNOVER_TAX_UPPER)}, so the business is outside turnover tax and files ordinary income tax.`;
			}
			return [
				headline(money(tax), 'turnover tax for this month'),
				warning ? element('p', { class: 'tool-warning', text: warning }) : null,
				breakdown([
					['Gross sales', money(state.sales)],
					[`Turnover tax at ${state.rate}%`, money(tax), 'total'],
					['Over a year at this level', money(tax * 12), 'subtle'],
				]),
				yearly > c.VAT_REGISTRATION_THRESHOLD
					? note(`At about ${money(yearly)} a year you are also over the VAT registration threshold of ${money(c.VAT_REGISTRATION_THRESHOLD)}.`)
					: null,
				note('Turnover tax is charged on sales, not profit, and is a final tax. File and pay on iTax by the 20th of the following month. A business can choose ordinary income tax instead; an accountant can say which is cheaper for you.'),
			];
		});
	}
}

customElements.define('turnover-tax-calculator', TurnoverTaxCalculator);
