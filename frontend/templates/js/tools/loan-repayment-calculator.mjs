// Loan repayment calculator, with the flat-rate trap made visible.
//
// Ghanaian lenders quote two different things and call both "the rate". A
// reducing-balance rate charges interest on what you still owe. A flat rate
// charges interest on the whole original amount for the whole term, every
// month, even the last one - so a "2% a month flat" loan costs close to double
// what the number suggests.
//
// The single most useful thing this tool does is convert one into the other.

import { cedis, element, parseAmount, percent } from '/js/utils/format.mjs';

class LoanRepaymentCalculator extends HTMLElement {
	connectedCallback() {
		if (this.rendered) return;
		this.rendered = true;

		this.state = { principal: 20000, annualRate: 30, months: 24, basis: 'reducing' };

		this.replaceChildren();
		this.build();
		this.update();
	}

	field(uid, key, label, hint, { prefix = null, suffix = null, step = '1', min = '0' } = {}) {
		return element('div', { class: 'form-group' }, [
			element('label', { for: `${key}-${uid}`, text: label }),
			element('div', { class: 'input-group' }, [
				prefix ? element('span', { text: prefix }) : null,
				element('input', {
					id: `${key}-${uid}`,
					type: 'number',
					min,
					step,
					inputmode: 'decimal',
					value: String(this.state[key]),
					oninput: (event) => {
						this.state[key] = parseAmount(event.target.value);
						this.update();
					},
				}),
				suffix ? element('span', { text: suffix }) : null,
			]),
			hint ? element('span', { class: 'input-instructions', text: hint }) : null,
		]);
	}

	build() {
		const uid = Math.random().toString(36).slice(2, 7);

		this.basisButtons = ['reducing', 'flat'].map((basis) =>
			element('button', {
				type: 'button',
				class: 'toggle',
				'aria-pressed': String(this.state.basis === basis),
				text: basis === 'reducing' ? 'Reducing balance' : 'Flat rate',
				onclick: () => {
					this.state.basis = basis;
					this.basisButtons.forEach((button, index) =>
						button.setAttribute('aria-pressed', String(['reducing', 'flat'][index] === basis))
					);
					this.update();
				},
			})
		);

		const form = element('form', {}, [
			element('h4', { text: 'What will this loan actually cost?' }),
			this.field(uid, 'principal', 'Amount borrowed', null, { prefix: '₵', step: '500' }),
			this.field(uid, 'annualRate', 'Interest rate a year', 'As the lender quotes it.', {
				suffix: '%',
				step: '0.5',
			}),
			this.field(uid, 'months', 'Term', 'In months.', { suffix: 'months', step: '1', min: '1' }),
			element('div', { class: 'form-group' }, [
				element('span', { class: 'label', text: 'How is the interest charged?' }),
				element('div', { class: 'input-group' }, this.basisButtons),
				element('span', {
					class: 'input-instructions',
					text: 'Ask the lender which one they mean. It changes the cost enormously, and both get called "the rate".',
				}),
			]),
		]);

		form.addEventListener('submit', (event) => event.preventDefault());

		this.results = element('div', {
			class: 'tool-results',
			role: 'status',
			'aria-live': 'polite',
		});

		this.append(form, this.results);
	}

	/** Standard amortising payment. Handles a zero rate without dividing by zero. */
	reducingPayment(principal, monthlyRate, months) {
		if (monthlyRate === 0) return principal / months;
		const factor = Math.pow(1 + monthlyRate, months);
		return (principal * monthlyRate * factor) / (factor - 1);
	}

	update() {
		const { principal, annualRate, basis } = this.state;
		const months = Math.max(1, Math.round(this.state.months));
		const monthlyRate = annualRate / 100 / 12;

		this.results.replaceChildren();

		if (principal <= 0) {
			this.results.append(element('p', { class: 'tool-note', text: 'Enter an amount.' }));
			return;
		}

		let payment;
		let totalInterest;

		if (basis === 'flat') {
			// Interest on the ORIGINAL amount, every month, for the whole term.
			totalInterest = principal * (annualRate / 100) * (months / 12);
			payment = (principal + totalInterest) / months;
		} else {
			payment = this.reducingPayment(principal, monthlyRate, months);
			totalInterest = payment * months - principal;
		}

		const totalRepaid = principal + totalInterest;

		// What the same monthly payment costs expressed the other way, which is
		// the comparison a borrower is never shown.
		const equivalent = this.equivalentRate(principal, payment, months, basis);

		this.results.append(
			element('div', { class: 'tool-headline' }, [
				element('span', { class: 'tool-headline-value', text: cedis(payment) }),
				element('span', { class: 'tool-headline-label', text: `a month for ${months} months` }),
			])
		);

		const row = (label, value, className = '') =>
			element('tr', { class: className }, [
				element('th', { scope: 'row', text: label }),
				element('td', { text: value }),
			]);

		this.results.append(
			element('div', { class: 'table-wrapper' }, [
				element('table', { class: 'tool-breakdown' }, [
					element('tbody', {}, [
						row('Borrowed', cedis(principal)),
						row('Interest over the term', cedis(totalInterest)),
						row('Total repaid', cedis(totalRepaid), 'total'),
						row('Interest as a share of what you borrowed', percent((totalInterest / principal) * 100), 'subtle'),
					]),
				]),
			])
		);

		if (basis === 'flat' && Number.isFinite(equivalent)) {
			this.results.append(
				element('p', {
					class: 'tool-note',
					text:
						`A flat ${percent(annualRate)} a year is the same monthly payment as roughly ` +
						`${percent(equivalent)} a year on a reducing balance. That is the real cost of the money, ` +
						'and it is close to double the quoted rate on a term this length. Ask every lender to quote ' +
						'reducing balance so you can compare them.',
				})
			);
		} else if (basis === 'reducing') {
			this.results.append(
				element('p', {
					class: 'tool-note',
					text:
						'Reducing balance means interest is charged on what you still owe, so the interest portion ' +
						'of each payment falls over the term. If a lender quotes a lower number than a competitor, ' +
						'check they are not quoting a flat rate.',
				})
			);
		}

		this.results.append(
			element('p', {
				class: 'tool-note',
				text:
					'Processing fees, insurance, and any deduction made before the money reaches you are on top of ' +
					'this. Ask for the total amount repayable in cedis, in writing, and compare that number.',
			})
		);
	}

	/** Solve for the reducing-balance rate that produces the same payment. */
	equivalentRate(principal, payment, months, basis) {
		if (basis !== 'flat' || payment * months <= principal) return NaN;

		let low = 0;
		let high = 5; // 500% a month is far beyond any real quote
		for (let i = 0; i < 200; i += 1) {
			const mid = (low + high) / 2;
			const candidate = this.reducingPayment(principal, mid, months);
			if (candidate > payment) high = mid;
			else low = mid;
		}
		return ((low + high) / 2) * 12 * 100;
	}
}

customElements.define('loan-repayment-calculator', LoanRepaymentCalculator);
