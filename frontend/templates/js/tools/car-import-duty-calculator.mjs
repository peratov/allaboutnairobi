// An estimate of the taxes on importing a used car into Kenya.
//
// KRA works the customs value out from its Current Retail Selling Price (CRSP)
// list, depreciated by age, or from the invoice if that is higher. Published
// calculators disagree at the margins, so this says it is an estimate.

import constants from '/js/utils/constants.mjs';
import { mount, numberField, choice, headline, breakdown, note, money, element } from '/js/utils/tool-ui.mjs';

// Share of CRSP a car is valued at, by age in whole years.
const DEPRECIATION = [1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.45, 0.4, 0.35];

function exciseRate(fuel, cc) {
	if (fuel === 'hybrid') return 10;
	if (fuel === 'diesel') return cc > 2500 ? 35 : 25;
	if (cc <= 1500) return 20;
	return cc <= 3000 ? 25 : 35;
}

class CarImportDutyCalculator extends HTMLElement {
	connectedCallback() {
		if (this.ready) return;
		this.ready = true;
		const c = constants();
		const state = { mode: 'crsp', crsp: 3500000, age: '5', value: 1500000, fuel: 'petrol', cc: 1500 };

		const redraw = mount(this, 'Used car import duty (estimate)', () => [
			choice({
				label: 'What do you have?', value: state.mode,
				options: [['crsp', "KRA's CRSP price for the model"], ['value', 'The customs value already']],
				onChange: (v) => { state.mode = v; redraw(); },
			}),
			numberField({
				label: 'CRSP, or customs value', value: state.mode === 'crsp' ? state.crsp : state.value, step: '50000',
				onInput: (v) => { if (state.mode === 'crsp') state.crsp = v; else state.value = v; redraw(); },
				hint: "KRA publishes the CRSP list. Use the value for your model, engine and year.",
			}),
			choice({
				label: 'Age, from first registration', value: state.age,
				options: DEPRECIATION.map((_, i) => [String(i), i === 0 ? 'Under 1' : `${i}`]),
				onChange: (v) => { state.age = v; redraw(); },
			}),
			choice({
				label: 'Fuel', value: state.fuel,
				options: [['petrol', 'Petrol'], ['diesel', 'Diesel'], ['hybrid', 'Hybrid or electric']],
				onChange: (v) => { state.fuel = v; redraw(); },
			}),
			numberField({ label: 'Engine size', value: state.cc, step: '100', prefix: 'cc', onInput: (v) => { state.cc = v; redraw(); } }),
		], () => {
			const customs = state.mode === 'crsp' ? state.crsp * DEPRECIATION[Number(state.age)] : state.value;
			if (customs <= 0) return [note('Enter a price.')];
			const excise = exciseRate(state.fuel, state.cc);
			const importDuty = customs * c.CAR_IMPORT_DUTY_RATE / 100;
			const exciseDuty = (customs + importDuty) * excise / 100;
			const vat = (customs + importDuty + exciseDuty) * c.VAT_RATE / 100;
			const idf = Math.max(customs * c.CAR_IDF_RATE / 100, 5000);
			const rdl = customs * c.CAR_RDL_RATE / 100;
			const total = importDuty + exciseDuty + vat + idf + rdl;
			return [
				headline(money(total), 'in taxes, roughly'),
				breakdown([
					state.mode === 'crsp' ? [`Customs value (${Math.round(DEPRECIATION[Number(state.age)] * 100)}% of CRSP)`, money(customs)] : ['Customs value', money(customs)],
					[`Import duty (${c.CAR_IMPORT_DUTY_RATE}%)`, money(importDuty)],
					[`Excise duty (${excise}%)`, money(exciseDuty)],
					[`VAT (${c.VAT_RATE}%)`, money(vat)],
					[`Import Declaration Fee (${c.CAR_IDF_RATE}%)`, money(idf)],
					[`Railway Development Levy (${c.CAR_RDL_RATE}%)`, money(rdl)],
					['Total taxes', money(total), 'total'],
				]),
				element('p', { class: 'tool-warning', text: 'An estimate. KRA assesses the duty itself, from its own CRSP list and depreciation, and published calculators differ in the details. Get a quote from your clearing agent before you buy.' }),
				note('Not included: the car, shipping and insurance to Mombasa, port and clearing charges, KEBS inspection, and NTSA registration and number plates. Cars must be right-hand drive and within the eight-year age limit.'),
			];
		});
	}
}

customElements.define('car-import-duty-calculator', CarImportDutyCalculator);
