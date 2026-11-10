// Nairobi County land rates: a flat percentage of the plot's unimproved site
// value in the 2019 Draft Valuation Roll. Penalties on arrears are left out,
// because the county sets and waives them.

import constants from '/js/utils/constants.mjs';
import { mount, numberField, headline, breakdown, note, money } from '/js/utils/tool-ui.mjs';

class LandRatesCalculator extends HTMLElement {
	connectedCallback() {
		if (this.ready) return;
		this.ready = true;
		const c = constants();
		const state = { value: 10000000, years: 0 };

		const redraw = mount(this, 'Nairobi land rates', () => [
			numberField({
				label: 'Unimproved site value of the plot', value: state.value, step: '500000',
				hint: "The value of the land alone, from the county's valuation roll or your bill - not what the plot would sell for with a house on it.",
				onInput: (v) => { state.value = v; redraw(); },
			}),
			numberField({
				label: 'Years unpaid, if any', value: state.years, step: '1', prefix: '',
				onInput: (v) => { state.years = Math.floor(v); redraw(); },
			}),
		], () => {
			const rate = c.NAIROBI_LAND_RATE;
			if (!Number.isFinite(rate)) return [note('The rate could not be loaded. Reload the page.')];
			if (state.value <= 0) return [note('Enter the value.')];
			const yearly = state.value * rate / 100;
			return [
				headline(money(yearly), `a year, at ${rate}%`),
				breakdown([
					['Unimproved site value', money(state.value)],
					[`Rates a year (${rate}%)`, money(yearly), 'total'],
					['A month, if you set it aside', money(yearly / 12), 'subtle'],
					state.years > 0 ? [`${state.years} unpaid year${state.years === 1 ? '' : 's'}, before penalties`, money(yearly * state.years)] : null,
				]),
				note('Owners who objected to the 2019 roll pay the old amount until the Valuation Board decides. Arrears also carry penalties and interest, which the county sets and sometimes waives. To sell, you need a rates clearance certificate.'),
			];
		});
	}
}

customElements.define('land-rates-calculator', LandRatesCalculator);
