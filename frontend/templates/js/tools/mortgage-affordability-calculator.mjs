// Roughly how large a mortgage and home a take-home income supports, using the
// share of income a lender lets go on repayments.

import constants from '/js/utils/constants.mjs';
import { mount, numberField, headline, breakdown, note, money } from '/js/utils/tool-ui.mjs';

class MortgageAffordabilityCalculator extends HTMLElement {
	connectedCallback() {
		if (this.ready) return;
		this.ready = true;
		const c = constants();
		const state = { income: 200000, debts: 0, share: 40, rate: 13, years: 20, deposit: 10 };
		const redraw = mount(this, 'How much can I borrow?', () => [
			numberField({ label: 'Take-home pay a month (both buyers)', value: state.income, step: '5000', onInput: (v) => { state.income = v; redraw(); } }),
			numberField({ label: 'Other loan repayments a month', value: state.debts, step: '1000', onInput: (v) => { state.debts = v; redraw(); } }),
			numberField({
				label: 'Most of your pay the lender allows for repayments', value: state.share, step: '5', prefix: '%',
				onInput: (v) => { state.share = v; redraw(); },
				hint: 'Lenders set their own limit. Ask yours.',
			}),
			numberField({ label: 'Mortgage interest rate, per year', value: state.rate, step: '0.25', prefix: '%', onInput: (v) => { state.rate = v; redraw(); } }),
			numberField({ label: 'Term, in years', value: state.years, step: '1', prefix: '', onInput: (v) => { state.years = Math.round(v); redraw(); } }),
			numberField({ label: 'Deposit you can put down', value: state.deposit, step: '5', prefix: '%', onInput: (v) => { state.deposit = Math.min(v, 95); redraw(); } }),
		], () => {
			const payment = Math.max(0, state.income * state.share / 100 - state.debts);
			const n = state.years * 12;
			if (payment <= 0 || n <= 0) return [note('Enter your income and a term.')];
			const r = state.rate / 100 / 12;
			const loan = r === 0 ? payment * n : payment * (1 - Math.pow(1 + r, -n)) / r;
			const price = loan / (1 - state.deposit / 100);
			const deposit = price - loan;
			const duty = price * c.STAMP_DUTY_URBAN / 100;
			return [
				headline(money(price), 'home price, roughly'),
				breakdown([
					['Monthly repayment you can afford', money(payment)],
					['Mortgage that repayment supports', money(loan)],
					[`Deposit (${state.deposit}%)`, money(deposit)],
					['Home price', money(price), 'total'],
					[`Stamp duty at ${c.STAMP_DUTY_URBAN}% on top`, money(duty), 'subtle'],
					['Cash needed up front, before fees', money(deposit + duty), 'subtle'],
					['Total repaid over the term', money(payment * n), 'subtle'],
				]),
				note('A rough guide. Lenders also look at your employment, credit record and the valuation of the property, and add insurance and fees. Rates on Kenyan mortgages are often variable.'),
			];
		});
	}
}

customElements.define('mortgage-affordability-calculator', MortgageAffordabilityCalculator);
