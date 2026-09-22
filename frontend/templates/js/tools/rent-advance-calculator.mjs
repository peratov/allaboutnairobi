// Rent advance calculator.
//
// The single biggest financial shock of moving in Accra is not the rent, it is
// being asked for one or two years of it before you get the keys. This tool
// makes the size of that demand concrete, shows what the Rent Act actually
// allows, and works out what you would have to save each month to meet it.

import { cedis, element, parseAmount } from '/js/utils/format.mjs';

class RentAdvanceCalculator extends HTMLElement {
	connectedCallback() {
		if (this.rendered) return;
		this.rendered = true;

		const constants = window.accraConstants || {};
		this.state = {
			rent: parseAmount(this.getAttribute('initial-rent')) || constants.ACCRA_ONE_BED_RENT_MID || 2500,
			months: constants.TYPICAL_RENT_ADVANCE_MONTHS || 12,
			saveMonths: 12,
		};

		this.replaceChildren();
		this.build();
		this.update();
	}

	build() {
		const uid = Math.random().toString(36).slice(2, 7);
		const form = element('form', {}, [
			element('h4', { text: 'What the landlord is asking for' }),

			element('div', { class: 'form-group' }, [
				element('label', { for: `rent-${uid}`, text: 'Monthly rent' }),
				element('div', { class: 'input-group' }, [
					element('span', { text: '₵' }),
					element('input', {
						id: `rent-${uid}`,
						type: 'number',
						min: '0',
						step: '100',
						inputmode: 'decimal',
						value: String(this.state.rent),
						oninput: (event) => {
							this.state.rent = parseAmount(event.target.value);
							this.update();
						},
					}),
				]),
				element('span', {
					class: 'input-instructions',
					text: 'If the rent is quoted in dollars, convert it first. You will pay in cedis at the landlord’s rate, not the bank’s.',
				}),
			]),

			element('div', { class: 'form-group' }, [
				element('label', { for: `months-${uid}`, text: 'Months of advance demanded' }),
				element('div', { class: 'input-group' }, [
					element('input', {
						id: `months-${uid}`,
						type: 'number',
						min: '1',
						max: '48',
						step: '1',
						value: String(this.state.months),
						oninput: (event) => {
							this.state.months = Math.max(1, Math.round(parseAmount(event.target.value)));
							this.update();
						},
					}),
					element('span', { text: 'months' }),
				]),
			]),

			element('div', { class: 'form-group' }, [
				element('label', { for: `save-${uid}`, text: 'Months you have to save' }),
				element('div', { class: 'input-group' }, [
					element('input', {
						id: `save-${uid}`,
						type: 'number',
						min: '1',
						max: '60',
						step: '1',
						value: String(this.state.saveMonths),
						oninput: (event) => {
							this.state.saveMonths = Math.max(1, Math.round(parseAmount(event.target.value)));
							this.update();
						},
					}),
					element('span', { text: 'months' }),
				]),
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

	update() {
		const constants = window.accraConstants || {};
		const legalMonths = constants.MAX_LEGAL_RENT_ADVANCE_MONTHS || 6;
		const { rent, months, saveMonths } = this.state;

		const total = rent * months;
		const legalTotal = rent * legalMonths;
		const excessMonths = Math.max(0, months - legalMonths);
		const excess = rent * excessMonths;
		const perMonth = total / saveMonths;

		this.results.replaceChildren();

		if (rent <= 0) {
			this.results.append(
				element('p', { class: 'tool-note', text: 'Enter a monthly rent to see the total.' })
			);
			return;
		}

		this.results.append(
			element('div', { class: 'tool-headline' }, [
				element('span', { class: 'tool-headline-value', text: cedis(total) }),
				element('span', {
					class: 'tool-headline-label',
					text: `due before you get the keys (${months} months at ${cedis(rent)})`,
				}),
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
						row(`Maximum the Rent Act allows (${legalMonths} months)`, cedis(legalTotal)),
						row(
							excessMonths > 0
								? `Demanded above the legal maximum (${excessMonths} months)`
								: 'Demanded above the legal maximum',
							excessMonths > 0 ? cedis(excess) : 'None',
							excessMonths > 0 ? '' : 'subtle'
						),
						row(`To save over ${saveMonths} months`, cedis(perMonth) + ' a month', 'total'),
					]),
				]),
			])
		);

		if (excessMonths > 0) {
			this.results.append(
				element('p', { class: 'tool-note' }, [
					element('strong', { text: 'This demand exceeds what the law permits. ' }),
					document.createTextNode(
						`Section 25(5) of the Rent Act 1963 (Act 220) caps advance rent at ${legalMonths} months on a monthly tenancy. ` +
							'Almost every landlord in Accra ignores this, and tenants pay because the alternative is no house. ' +
							'Knowing the number still helps: it is grounds for a complaint to the Rent Control Department, and it is ' +
							'leverage when you negotiate.'
					),
				])
			);
		}

		const medianSalary = constants.GHANA_MEDIAN_MONTHLY_EARNINGS;
		if (medianSalary) {
			const salaries = total / medianSalary;
			this.results.append(
				element('p', {
					class: 'tool-note',
					text:
						`That is about ${salaries.toFixed(1)} months of the median Ghanaian salary, ` +
						'before you have eaten, moved or paid an agent. Budget separately for the ' +
						'agent commission, which is usually one month.',
				})
			);
		}
	}
}

customElements.define('rent-advance-calculator', RentAdvanceCalculator);
