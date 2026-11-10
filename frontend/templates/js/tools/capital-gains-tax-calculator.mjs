// Capital gains tax on selling land or a house in Kenya.
//
// The gain is the sale price less the adjusted cost: what was paid, the costs
// of buying, improvements, and the costs of selling. The rate comes from
// constants; the exemptions are a choice because they turn on facts only the
// seller knows.

import constants from '/js/utils/constants.mjs';
import { mount, numberField, choice, headline, breakdown, note, money, element } from '/js/utils/tool-ui.mjs';

class CapitalGainsTaxCalculator extends HTMLElement {
	connectedCallback() {
		if (this.ready) return;
		this.ready = true;
		const c = constants();
		const state = { sale: 6000000, bought: 3000000, buyingCosts: 200000, improvements: 0, sellingCosts: 150000, exempt: 'no' };

		const redraw = mount(this, 'Capital gains tax on a property sale', () => [
			numberField({ label: 'Sale price', value: state.sale, step: '100000', onInput: (v) => { state.sale = v; redraw(); } }),
			numberField({ label: 'What you paid for it', value: state.bought, step: '100000', onInput: (v) => { state.bought = v; redraw(); } }),
			numberField({
				label: 'Costs of buying', value: state.buyingCosts, step: '10000',
				hint: 'Stamp duty, legal, valuation and survey fees when you bought.',
				onInput: (v) => { state.buyingCosts = v; redraw(); },
			}),
			numberField({
				label: 'Improvements', value: state.improvements, step: '50000',
				hint: 'Building, extensions, a borehole, fencing. Not repairs or upkeep.',
				onInput: (v) => { state.improvements = v; redraw(); },
			}),
			numberField({
				label: 'Costs of selling', value: state.sellingCosts, step: '10000',
				hint: "Agent's commission and legal fees on the sale.",
				onInput: (v) => { state.sellingCosts = v; redraw(); },
			}),
			choice({
				label: 'Does an exemption apply?', value: state.exempt,
				options: [
					['no', 'No'],
					['home', 'My home for the last 3 years'],
					['family', 'To a spouse, close family or heirs'],
				],
				onChange: (v) => { state.exempt = v; redraw(); },
			}),
		], () => {
			if (!Number.isFinite(c.CAPITAL_GAINS_TAX_RATE)) return [note('The rate could not be loaded. Reload the page.')];
			if (state.sale <= 0) return [note('Enter the sale price.')];
			const cost = state.bought + state.buyingCosts + state.improvements + state.sellingCosts;
			const gain = state.sale - cost;
			const exempt = state.exempt !== 'no';
			const tax = gain > 0 && !exempt ? gain * c.CAPITAL_GAINS_TAX_RATE / 100 : 0;
			const label = exempt ? 'if the exemption applies'
				: gain > 0 ? `capital gains tax at ${c.CAPITAL_GAINS_TAX_RATE}%`
				: 'no gain, so no tax';
			return [
				headline(money(tax), label),
				breakdown([
					['Sale price', money(state.sale)],
					['Adjusted cost (price, costs and improvements)', money(cost), 'subtle'],
					[gain >= 0 ? 'Gain' : 'Loss', money(Math.abs(gain))],
					[`Capital gains tax (${c.CAPITAL_GAINS_TAX_RATE}%)`, money(tax), 'total'],
					['You keep, after costs and tax', money(state.sale - state.sellingCosts - tax), 'subtle'],
				]),
				exempt ? element('p', { class: 'tool-warning', text: 'Exemptions have strict conditions. Confirm with your advocate or a tax adviser that this one fits before you rely on it.' }) : null,
				note('The seller pays, on iTax, on or before the transfer - usually through the advocate handling the sale. Keep receipts for every cost: without them KRA can treat most of the price as gain.'),
			];
		});
	}
}

customElements.define('capital-gains-tax-calculator', CapitalGainsTaxCalculator);
