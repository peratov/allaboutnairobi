// Withholding tax calculator, for anyone who invoices.
//
// Two things trip up freelancers and small suppliers in Ghana. The first is
// that a client withholds tax from the invoice and pays you less than you
// billed - which is not a deduction, it is a credit against your own tax bill,
// and the certificate is what makes it real. The second is that VAT goes ON
// the invoice while WHT comes OFF it, and it comes off the amount before VAT.

import { cedis, element, parseAmount, percent } from '/js/utils/format.mjs';
import { vatBreakdown } from '/js/utils/tax.mjs';

class WithholdingTaxCalculator extends HTMLElement {
	connectedCallback() {
		if (this.rendered) return;
		this.rendered = true;

		this.state = { amount: 10000, kind: 'services', charging: false };

		this.replaceChildren();
		this.build();
		this.update();
	}

	kinds() {
		const c = window.accraConstants || {};
		return [
			{ id: 'services', label: 'Services (resident)', rate: c.WHT_SERVICES_RESIDENT },
			{ id: 'goods', label: 'Supply of goods', rate: c.WHT_GOODS },
			{ id: 'works', label: 'Works and contracts', rate: c.WHT_WORKS },
			{ id: 'rent-residential', label: 'Rent - residential', rate: c.WHT_RENT_RESIDENTIAL },
			{ id: 'rent-commercial', label: 'Rent - commercial', rate: c.WHT_RENT_COMMERCIAL },
			{ id: 'dividends', label: 'Dividends', rate: c.WHT_DIVIDENDS },
		].filter((kind) => Number.isFinite(kind.rate));
	}

	currentRate() {
		const found = this.kinds().find((kind) => kind.id === this.state.kind);
		return found ? found.rate : 0;
	}

	build() {
		const uid = Math.random().toString(36).slice(2, 7);

		const select = element('select', {
			id: `kind-${uid}`,
			onchange: (event) => {
				this.state.kind = event.target.value;
				this.update();
			},
		});
		this.kinds().forEach((kind) => {
			const option = element('option', {
				value: kind.id,
				text: `${kind.label} - ${percent(kind.rate)}`,
			});
			if (kind.id === this.state.kind) option.selected = true;
			select.append(option);
		});

		const form = element('form', {}, [
			element('h4', { text: 'What will actually reach your account?' }),
			element('div', { class: 'form-group' }, [
				element('label', { for: `amount-${uid}`, text: 'Invoice amount, before VAT' }),
				element('div', { class: 'input-group' }, [
					element('span', { text: '₵' }),
					element('input', {
						id: `amount-${uid}`,
						type: 'number',
						min: '0',
						step: '100',
						inputmode: 'decimal',
						value: String(this.state.amount),
						oninput: (event) => {
							this.state.amount = parseAmount(event.target.value);
							this.update();
						},
					}),
				]),
			]),
			element('div', { class: 'form-group' }, [
				element('label', { for: `kind-${uid}`, text: 'What is being paid for' }),
				element('div', { class: 'input-group' }, [select]),
				element('span', {
					class: 'input-instructions',
					text: 'Rates differ by the kind of payment. A non-resident supplier is withheld differently again.',
				}),
			]),
			element('div', { class: 'form-group' }, [
				element('label', { class: 'checkbox-label', for: `vat-${uid}` }, [
					element('input', {
						id: `vat-${uid}`,
						type: 'checkbox',
						onchange: (event) => {
							this.state.charging = event.target.checked;
							this.update();
						},
					}),
					element('span', { text: ' I am VAT registered and charging VAT' }),
				]),
				element('span', {
					class: 'input-instructions',
					text: 'Registration is compulsory above the turnover threshold.',
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
		const net = this.state.amount;
		const rate = this.currentRate();
		const vat = this.state.charging ? vatBreakdown(net) : null;
		const invoiced = vat ? vat.total : net;

		// WHT is charged on the amount before VAT, not on the invoice total.
		const withheld = (net * rate) / 100;
		const received = invoiced - withheld;

		this.results.replaceChildren();

		if (net <= 0) {
			this.results.append(element('p', { class: 'tool-note', text: 'Enter an amount.' }));
			return;
		}

		this.results.append(
			element('div', { class: 'tool-headline' }, [
				element('span', { class: 'tool-headline-value', text: cedis(received) }),
				element('span', {
					class: 'tool-headline-label',
					text: `reaches your account on a ${cedis(net)} invoice`,
				}),
			])
		);

		const row = (label, value, className = '') =>
			element('tr', { class: className }, [
				element('th', { scope: 'row', text: label }),
				element('td', { text: value }),
			]);

		const rows = [row('Fee before VAT', cedis(net))];

		if (vat) {
			rows.push(
				row('NHIL, GETFund and COVID levies', cedis(vat.levies)),
				row('VAT', cedis(vat.vat)),
				row('Invoice total', cedis(invoiced), 'subtle')
			);
		}

		rows.push(
			row(`Withholding tax (${percent(rate)} of the fee before VAT)`, '-' + cedis(withheld)),
			row('Paid to you', cedis(received), 'total')
		);

		this.results.append(
			element('div', { class: 'table-wrapper' }, [
				element('table', { class: 'tool-breakdown' }, [element('tbody', {}, rows)]),
			]),
			element('p', {
				class: 'tool-note',
				text:
					`The ${cedis(withheld)} withheld is not lost. It is tax paid on your behalf, and it is credited ` +
					'against your own bill when you file - but only if you have the withholding tax certificate. ' +
					'Ask for it at the time you are paid, not at the end of the year.',
			})
		);

		if (vat) {
			this.results.append(
				element('p', {
					class: 'tool-note',
					text:
						`The VAT and levies of ${cedis(invoiced - net)} are never yours. You collected them and you ` +
						'owe them to the GRA. Do not spend them.',
				})
			);
		}
	}
}

customElements.define('withholding-tax-calculator', WithholdingTaxCalculator);
