// What a freelancer or consultant receives after a Kenyan client withholds tax
// on professional fees, and what to invoice to receive a set amount.

import constants from '/js/utils/constants.mjs';
import { mount, numberField, choice, headline, breakdown, note, money } from '/js/utils/tool-ui.mjs';

class WithholdingTaxCalculator extends HTMLElement {
	connectedCallback() {
		if (this.ready) return;
		this.ready = true;
		const c = constants();
		const state = { amount: 100000, residence: 'resident', mode: 'invoice' };
		const redraw = mount(this, 'Withholding tax on fees', () => [
			choice({
				label: 'Who are you?', value: state.residence,
				options: [['resident', 'Resident in Kenya'], ['nonresident', 'Non-resident']],
				onChange: (v) => { state.residence = v; redraw(); },
			}),
			choice({
				label: 'What do you know?', value: state.mode,
				options: [['invoice', 'The fee I invoice'], ['net', 'The amount I want to receive']],
				onChange: (v) => { state.mode = v; redraw(); },
			}),
			numberField({ label: 'Amount, before VAT', value: state.amount, step: '1000', onInput: (v) => { state.amount = v; redraw(); } }),
		], () => {
			if (state.amount <= 0) return [note('Enter an amount.')];
			const resident = state.residence === 'resident';
			const rate = resident ? c.WHT_PROFESSIONAL_RESIDENT : c.WHT_PROFESSIONAL_NONRESIDENT;
			const fee = state.mode === 'invoice' ? state.amount : state.amount / (1 - rate / 100);
			const exempt = resident && fee <= c.WHT_PROFESSIONAL_THRESHOLD;
			const tax = exempt ? 0 : fee * rate / 100;
			return [
				state.mode === 'invoice'
					? headline(money(fee - tax), 'you receive')
					: headline(money(fee), 'to invoice'),
				breakdown([
					['Fee', money(fee)],
					[exempt ? 'Withholding tax (below the threshold)' : `Withholding tax at ${rate}%`, `− ${money(tax)}`],
					['You receive', money(fee - tax), 'total'],
				]),
				resident
					? note(`The client pays the tax to KRA and gives you a withholding certificate. For residents it is not a final tax: claim it against your income tax on your annual return. Fees to one client totalling ${money(c.WHT_PROFESSIONAL_THRESHOLD)} or less in a month are not subject to it.`)
					: note('For non-residents the tax is usually final. A tax treaty between Kenya and your country may reduce it.'),
				note('Withholding applies when the client is a Kenyan business or organisation that is required to withhold, not when an individual pays you privately. VAT, if you charge it, is separate.'),
			];
		});
	}
}

customElements.define('withholding-tax-calculator', WithholdingTaxCalculator);
