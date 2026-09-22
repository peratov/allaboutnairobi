// Monthly repayments on a loan, on a reducing balance or at a flat rate. Kenyan
// lenders quote both, and a flat rate costs far more than it sounds.

import { mount, numberField, choice, headline, breakdown, note, money } from '/js/utils/tool-ui.mjs';

function reducingPayment(amount, annualRate, months) {
	const r = annualRate / 100 / 12;
	return r === 0 ? amount / months : amount * r / (1 - Math.pow(1 + r, -months));
}

class LoanRepaymentCalculator extends HTMLElement {
	connectedCallback() {
		if (this.ready) return;
		this.ready = true;
		const state = { amount: 500000, rate: 14, months: 36, method: 'reducing' };
		const redraw = mount(this, 'Loan repayments', () => [
			numberField({ label: 'Amount borrowed', value: state.amount, step: '10000', onInput: (v) => { state.amount = v; redraw(); } }),
			numberField({ label: 'Interest rate, per year', value: state.rate, step: '0.5', prefix: '%', onInput: (v) => { state.rate = v; redraw(); } }),
			numberField({ label: 'Term, in months', value: state.months, step: '1', prefix: '', onInput: (v) => { state.months = Math.round(v); redraw(); } }),
			choice({
				label: 'How the rate is quoted', value: state.method,
				options: [['reducing', 'Reducing balance'], ['flat', 'Flat rate']],
				onChange: (v) => { state.method = v; redraw(); },
			}),
		], () => {
			const { amount, rate, months } = state;
			if (amount <= 0 || months <= 0) return [note('Enter an amount and a term.')];
			const monthly = state.method === 'flat'
				? (amount + amount * (rate / 100) * (months / 12)) / months
				: reducingPayment(amount, rate, months);
			const total = monthly * months;

			// For a flat quote, the reducing-balance rate that gives the same payment.
			let equivalent = null;
			if (state.method === 'flat' && rate > 0) {
				let low = 0;
				let high = 300;
				for (let i = 0; i < 80; i += 1) {
					const mid = (low + high) / 2;
					if (reducingPayment(amount, mid, months) < monthly) low = mid; else high = mid;
				}
				equivalent = (low + high) / 2;
			}

			return [
				headline(money(monthly), `a month for ${months} months`),
				breakdown([
					['Amount borrowed', money(amount)],
					['Total interest', money(total - amount)],
					['Total repaid', money(total), 'total'],
					equivalent ? ['Same as a reducing-balance rate of', `${equivalent.toFixed(1)}% a year`, 'subtle'] : null,
				]),
				note('Before fees. Banks and SACCOs usually add processing fees, insurance and excise duty, so ask for the total cost of credit in writing before you sign.'),
			];
		});
	}
}

customElements.define('loan-repayment-calculator', LoanRepaymentCalculator);
