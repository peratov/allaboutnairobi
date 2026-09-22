// Add Kenyan VAT to a price, or find the VAT inside one.

import constants from '/js/utils/constants.mjs';
import { mount, numberField, choice, headline, breakdown, note, money } from '/js/utils/tool-ui.mjs';

class VatCalculator extends HTMLElement {
	connectedCallback() {
		if (this.ready) return;
		this.ready = true;
		const rate = constants().VAT_RATE;
		const state = { amount: 10000, mode: 'add' };
		const redraw = mount(this, 'VAT', () => [
			choice({
				label: 'What do you have?', value: state.mode,
				options: [['add', 'A price before VAT'], ['remove', 'A price including VAT']],
				onChange: (v) => { state.mode = v; redraw(); },
			}),
			numberField({ label: 'Amount', value: state.amount, step: '100', onInput: (v) => { state.amount = v; redraw(); } }),
		], () => {
			if (state.amount <= 0) return [note('Enter an amount.')];
			const net = state.mode === 'add' ? state.amount : state.amount / (1 + rate / 100);
			const vat = net * rate / 100;
			return [
				headline(money(net + vat), `including ${money(vat)} VAT`),
				breakdown([
					['Price before VAT', money(net)],
					[`VAT at ${rate}%`, money(vat)],
					['Total', money(net + vat), 'total'],
				]),
				note('Standard-rated goods and services only. Some things are zero-rated or exempt, including many basic foods, and fuel is charged at a different rate.'),
			];
		});
	}
}

customElements.define('vat-calculator', VatCalculator);
