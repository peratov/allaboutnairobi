// How savings grow in a money market fund, deposit account or government
// paper, after Kenya's withholding tax on interest.

import constants from '/js/utils/constants.mjs';
import { mount, numberField, choice, headline, breakdown, note, money } from '/js/utils/tool-ui.mjs';

class SavingsCalculator extends HTMLElement {
	connectedCallback() {
		if (this.ready) return;
		this.ready = true;
		const c = constants();
		const state = { start: 50000, monthly: 10000, rate: 10, years: 5, tax: 'taxed' };
		const redraw = mount(this, 'Savings growth', () => [
			numberField({ label: 'Starting amount', value: state.start, step: '1000', onInput: (v) => { state.start = v; redraw(); } }),
			numberField({ label: 'Added every month', value: state.monthly, step: '500', onInput: (v) => { state.monthly = v; redraw(); } }),
			numberField({
				label: 'Interest rate, per year, before tax', value: state.rate, step: '0.25', prefix: '%',
				onInput: (v) => { state.rate = v; redraw(); },
				hint: 'Use the rate your fund or bank quotes today. Rates change.',
			}),
			numberField({ label: 'Years', value: state.years, step: '1', prefix: '', onInput: (v) => { state.years = Math.round(v); redraw(); } }),
			choice({
				label: 'Tax on the interest', value: state.tax,
				options: [['taxed', `${c.INTEREST_WHT_RATE}% withholding tax`], ['exempt', 'Tax-free (infrastructure bond)']],
				onChange: (v) => { state.tax = v; redraw(); },
			}),
		], () => {
			const months = state.years * 12;
			if (months <= 0) return [note('Enter a number of years.')];
			const r = state.rate / 100 / 12;
			const keep = state.tax === 'taxed' ? 1 - c.INTEREST_WHT_RATE / 100 : 1;
			let balance = state.start;
			let interest = 0;
			for (let m = 0; m < months; m += 1) {
				const earned = balance * r;
				interest += earned;
				balance += earned * keep + state.monthly;
			}
			const paidIn = state.start + state.monthly * months;
			const tax = interest * (1 - keep);
			return [
				headline(money(balance), `after ${state.years} year${state.years === 1 ? '' : 's'}`),
				breakdown([
					['You pay in', money(paidIn)],
					['Interest earned', money(interest)],
					state.tax === 'taxed' ? ['Withholding tax', `− ${money(tax)}`] : null,
					['Final balance', money(balance), 'total'],
				]),
				note('Assumes the rate stays the same and interest is added monthly. Money market funds pay a daily rate that moves with the market, and some charge fees. This is arithmetic, not advice about where to invest.'),
			];
		});
	}
}

customElements.define('savings-calculator', SavingsCalculator);
