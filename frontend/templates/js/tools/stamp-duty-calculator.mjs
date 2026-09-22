// The main government cost of buying property in Kenya: stamp duty.

import constants from '/js/utils/constants.mjs';
import { mount, numberField, choice, headline, breakdown, note, money } from '/js/utils/tool-ui.mjs';

class StampDutyCalculator extends HTMLElement {
	connectedCallback() {
		if (this.ready) return;
		this.ready = true;
		const c = constants();
		const state = { value: 8000000, area: 'urban', legal: 0, other: 0 };
		const redraw = mount(this, 'Stamp duty and buying costs', () => [
			numberField({
				label: 'Price, or the government valuation if higher', value: state.value, step: '100000',
				onInput: (v) => { state.value = v; redraw(); },
			}),
			choice({
				label: 'Where is it?', value: state.area,
				options: [['urban', `In a town or city (${c.STAMP_DUTY_URBAN}%)`], ['rural', `Rural land (${c.STAMP_DUTY_RURAL}%)`]],
				onChange: (v) => { state.area = v; redraw(); },
			}),
			numberField({
				label: "Advocate's fees", value: state.legal, step: '10000', onInput: (v) => { state.legal = v; redraw(); },
				hint: 'Ask your advocate for a written quote.',
			}),
			numberField({ label: 'Searches, valuation and registration', value: state.other, step: '1000', onInput: (v) => { state.other = v; redraw(); } }),
		], () => {
			if (state.value <= 0) return [note('Enter the price.')];
			const rate = state.area === 'urban' ? c.STAMP_DUTY_URBAN : c.STAMP_DUTY_RURAL;
			const duty = state.value * rate / 100;
			const costs = duty + state.legal + state.other;
			return [
				headline(money(duty), `stamp duty at ${rate}%`),
				breakdown([
					['Price', money(state.value)],
					[`Stamp duty (${rate}%)`, money(duty)],
					state.legal ? ["Advocate's fees", money(state.legal)] : null,
					state.other ? ['Searches, valuation and registration', money(state.other)] : null,
					['Buying costs', money(costs), 'total'],
					['Price plus costs', money(state.value + costs), 'subtle'],
				]),
				note('All of Nairobi counts as urban. The buyer pays stamp duty, on the higher of the price and the government valuation, through Ardhisasa before the transfer is registered.'),
			];
		});
	}
}

customElements.define('stamp-duty-calculator', StampDutyCalculator);
