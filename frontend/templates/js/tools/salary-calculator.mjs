// Ghanaian net salary calculator: PAYE, SSNIT and Tier 3.
//
// Registers a <salary-calculator> custom element. The {% tool %} Jinja tag
// renders the element with a static placeholder inside it; this module
// replaces that content once it runs. If the module never runs, the reader
// still sees a heading, a description and a note telling them the underlying
// numbers are on the page anyway.

import { cedis, element, parseAmount, percent } from '/js/utils/format.mjs';
import { netPay } from '/js/utils/tax.mjs';

class SalaryCalculator extends HTMLElement {
	connectedCallback() {
		if (this.rendered) return;
		this.rendered = true;

		this.state = {
			basic: parseAmount(this.getAttribute('initial-basic')) || 3000,
			allowances: parseAmount(this.getAttribute('initial-allowances')) || 0,
			tier3: 0,
		};

		this.replaceChildren();
		this.build();
		this.update();
	}

	build() {
		const uid = Math.random().toString(36).slice(2, 7);
		const ids = {
			basic: `basic-${uid}`,
			allowances: `allowances-${uid}`,
			tier3: `tier3-${uid}`,
		};

		const field = (id, label, hint, value, onInput) =>
			element('div', { class: 'form-group' }, [
				element('label', { for: id, text: label }),
				element('div', { class: 'input-group' }, [
					element('span', { text: '₵' }),
					element('input', {
						id,
						type: 'number',
						min: '0',
						step: '50',
						inputmode: 'decimal',
						value: String(value),
						oninput: onInput,
					}),
				]),
				element('span', { class: 'input-instructions', text: hint }),
			]);

		const form = element('form', { class: 'salary-form' }, [
			element('h4', { text: 'Your monthly pay' }),
			field(
				ids.basic,
				'Basic salary',
				'Your basic pay before anything is taken off. SSNIT is calculated on this figure only.',
				this.state.basic,
				(event) => {
					this.state.basic = parseAmount(event.target.value);
					this.update();
				}
			),
			field(
				ids.allowances,
				'Allowances',
				'Transport, rent, fuel and other cash allowances. These are taxed, but SSNIT is not charged on them.',
				this.state.allowances,
				(event) => {
					this.state.allowances = parseAmount(event.target.value);
					this.update();
				}
			),
			field(
				ids.tier3,
				'Tier 3 contribution',
				'Voluntary provident fund contributions, if you make any. Leave at zero if unsure.',
				this.state.tier3,
				(event) => {
					this.state.tier3 = parseAmount(event.target.value);
					this.update();
				}
			),
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
		const result = netPay(this.state);
		const constants = window.accraConstants || {};
		this.results.replaceChildren();

		if (result.gross <= 0) {
			this.results.append(
				element('p', {
					class: 'tool-note',
					text: 'Enter a basic salary to see your take-home pay.',
				})
			);
			return;
		}

		this.results.append(
			element('div', { class: 'tool-headline' }, [
				element('span', { class: 'tool-headline-value', text: cedis(result.net) }),
				element('span', {
					class: 'tool-headline-label',
					text: 'take-home each month, from ' + cedis(result.gross) + ' gross',
				}),
			])
		);

		// A stacked bar, with the same three segments named in the legend below,
		// so the meaning never depends on telling the colours apart.
		const share = (value) => (value / result.gross) * 100 + '%';
		this.results.append(
			element('div', { class: 'tool-bar', 'aria-hidden': 'true' }, [
				element('span', { class: 'seg-net', style: `width:${share(result.net)}` }),
				element('span', { class: 'seg-tax', style: `width:${share(result.paye)}` }),
				element('span', {
					class: 'seg-pension',
					style: `width:${share(result.ssnitEmployee + result.tier3)}`,
				}),
			]),
			element('ul', { class: 'tool-legend' }, [
				element('li', {}, [
					element('span', { class: 'swatch seg-net' }),
					element('span', { text: 'Take-home' }),
				]),
				element('li', {}, [
					element('span', { class: 'swatch seg-tax' }),
					element('span', { text: 'PAYE' }),
				]),
				element('li', {}, [
					element('span', { class: 'swatch seg-pension' }),
					element('span', { text: 'Pension' }),
				]),
			])
		);

		const row = (label, value, className = '') =>
			element('tr', { class: className }, [
				element('th', { scope: 'row', text: label }),
				element('td', { text: value }),
			]);

		const rows = [
			row('Basic salary', cedis(result.basic)),
			result.allowances > 0 ? row('Allowances', cedis(result.allowances)) : null,
			row(
				`SSNIT (${percent(constants.SSNIT_EMPLOYEE_RATE)} of basic)`,
				'−' + cedis(result.ssnitEmployee)
			),
			result.tier3Deductible > 0
				? row('Tier 3 (tax deductible)', '−' + cedis(result.tier3Deductible))
				: null,
			result.tier3Excess > 0
				? row('Tier 3 above the relief cap', '−' + cedis(result.tier3Excess), 'subtle')
				: null,
			row('Taxable income', cedis(result.taxableIncome), 'subtle'),
			row('PAYE', '−' + cedis(result.paye)),
			row('Take-home pay', cedis(result.net), 'total'),
		].filter(Boolean);

		this.results.append(
			element('div', { class: 'table-wrapper' }, [
				element('table', { class: 'tool-breakdown' }, [element('tbody', {}, rows)]),
			])
		);

		// The band-by-band view. This is the part that answers "why is my tax
		// that much", and it is why the calculator exists rather than a table.
		const bandRows = result.breakdown
			.filter((band) => band.amount > 0)
			.map((band) =>
				element('tr', {}, [
					element('th', {
						scope: 'row',
						text: cedis(band.amount) + ' at ' + percent(band.rate),
					}),
					element('td', { text: cedis(band.tax) }),
				])
			);

		if (bandRows.length) {
			const details = element('details', {}, [
				element('summary', { text: 'How the PAYE breaks down by band' }),
				element('div', { class: 'table-wrapper' }, [
					element('table', { class: 'tool-breakdown' }, [element('tbody', {}, bandRows)]),
				]),
			]);
			this.results.append(details);
		}

		this.results.append(
			element('p', {
				class: 'tool-note',
				text:
					'Your employer also pays ' +
					cedis(result.ssnitEmployer) +
					' in SSNIT on top of your salary, so you cost them ' +
					cedis(result.costToEmployer) +
					' a month. Your effective tax rate is ' +
					percent(result.effectiveRate) +
					' of gross pay.',
			}),
			element('p', {
				class: 'tool-note',
				text:
					'This covers the ordinary case: a resident employee on a single ' +
					'employment. It does not model overtime tax, bonus tax, or the ' +
					'personal reliefs you can claim from the GRA for dependants, ' +
					'education or old age.',
			})
		);
	}
}

customElements.define('salary-calculator', SalaryCalculator);
