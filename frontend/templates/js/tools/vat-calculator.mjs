// VAT and levies calculator.
//
// Ghana's headline VAT rate is 15%, but that is not what you pay: NHIL and
// GETFund are charged alongside it. Since the Value Added Tax Act 2025 (Act
// 1151) all three sit on the same base, the price before tax, so the effective
// rate is their plain sum. Until 2026 the levies came first and VAT was charged
// on top of them, and this calculator showed that compounding.

import { cedis, element, parseAmount, percent } from '/js/utils/format.mjs';
import { vatBreakdown, vatFromGross } from '/js/utils/tax.mjs';

class VatCalculator extends HTMLElement {
	connectedCallback() {
		if (this.rendered) return;
		this.rendered = true;

		this.state = { amount: 1000, mode: 'net' };

		this.replaceChildren();
		this.build();
		this.update();
	}

	build() {
		const uid = Math.random().toString(36).slice(2, 7);

		this.modeButtons = ['net', 'gross'].map((mode) =>
			element('button', {
				type: 'button',
				class: 'toggle',
				'aria-pressed': String(this.state.mode === mode),
				text: mode === 'net' ? 'Add VAT to a price' : 'Find the VAT in a price',
				onclick: () => {
					this.state.mode = mode;
					this.modeButtons.forEach((button, index) =>
						button.setAttribute('aria-pressed', String(['net', 'gross'][index] === mode))
					);
					this.update();
				},
			})
		);

		const form = element('form', {}, [
			element('h4', { text: 'VAT and levies' }),
			element('div', { class: 'form-group' }, [
				element('span', { class: 'label', text: 'What do you have?' }),
				element('div', { class: 'input-group' }, this.modeButtons),
			]),
			element('div', { class: 'form-group' }, [
				element('label', { for: `amount-${uid}`, text: 'Amount' }),
				element('div', { class: 'input-group' }, [
					element('span', { text: '₵' }),
					element('input', {
						id: `amount-${uid}`,
						type: 'number',
						min: '0',
						step: '10',
						inputmode: 'decimal',
						value: String(this.state.amount),
						oninput: (event) => {
							this.state.amount = parseAmount(event.target.value);
							this.update();
						},
					}),
				]),
				element('span', {
					class: 'input-instructions',
					text: 'Standard-rated supplies only. The VAT Flat Rate Scheme for small retailers works differently.',
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

	update() {
		const constants = window.accraConstants || {};
		const result =
			this.state.mode === 'net'
				? vatBreakdown(this.state.amount)
				: vatFromGross(this.state.amount);

		this.results.replaceChildren();

		if (this.state.amount <= 0) {
			this.results.append(
				element('p', { class: 'tool-note', text: 'Enter an amount.' })
			);
			return;
		}

		this.results.append(
			element('div', { class: 'tool-headline' }, [
				element('span', { class: 'tool-headline-value', text: cedis(result.total) }),
				element('span', {
					class: 'tool-headline-label',
					text: `total, of which ${cedis(result.total - result.net)} is tax`,
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
						row('Price before tax', cedis(result.net)),
						row(`NHIL (${percent(constants.NHIL_RATE)})`, cedis(result.nhil)),
						row(`GETFund (${percent(constants.GETFUND_RATE)})`, cedis(result.getfund)),
						row(`VAT (${percent(constants.VAT_RATE)})`, cedis(result.vat)),
						row('Total payable', cedis(result.total), 'total'),
					]),
				]),
			]),
			element('p', {
				class: 'tool-note',
				text:
					`VAT, NHIL and GETFund are all charged on the price before tax, so they simply add up: ` +
					`the effective rate is ${percent(result.effectiveRate)}, not the headline ${percent(constants.VAT_RATE)}.`,
			})
		);
	}
}

customElements.define('vat-calculator', VatCalculator);
