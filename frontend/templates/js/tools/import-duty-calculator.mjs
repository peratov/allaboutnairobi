// What it costs to land goods in Kenya: import duty, excise, VAT, the Import
// Declaration Fee and the Railway Development Levy, from the CIF value.
//
// The point is to stop people budgeting on the invoice. The headline duty rate
// is well under the total, because VAT is charged on a base that already holds
// the duty. Every rate comes from constants; with none loaded there is no
// answer rather than a guessed one.

import constants from '/js/utils/constants.mjs';
import { mount, numberField, choice, headline, breakdown, note, money, element } from '/js/utils/tool-ui.mjs';

class ImportDutyCalculator extends HTMLElement {
	connectedCallback() {
		if (this.ready) return;
		this.ready = true;
		const c = constants();
		const bands = {
			zero: { rate: c.IMPORT_DUTY_BAND_ZERO, label: 'Raw materials, machinery, medicines' },
			intermediate: { rate: c.IMPORT_DUTY_BAND_INTERMEDIATE, label: 'Part-made goods and inputs' },
			finished: { rate: c.IMPORT_DUTY_BAND_FINISHED, label: 'Finished goods - most things people buy' },
			top: { rate: c.IMPORT_DUTY_BAND_TOP, label: 'Clothes, textiles, furniture, steel, some foods' },
			phone: { rate: c.PHONE_IMPORT_DUTY_RATE, label: 'Mobile phones' },
		};
		const state = { goods: 100000, freight: 15000, insurance: 1500, band: 'finished', excise: 0, vat: 'standard' };

		const redraw = mount(this, 'Import duty on goods (estimate)', () => [
			numberField({
				label: 'Price of the goods', value: state.goods, step: '1000',
				hint: 'What you paid the seller, in shillings. Customs converts at its own rate for the week.',
				onInput: (v) => { state.goods = v; redraw(); },
			}),
			numberField({
				label: 'Shipping to Kenya', value: state.freight, step: '1000',
				hint: 'Freight to Mombasa or JKIA. Duty is charged on it too.',
				onInput: (v) => { state.freight = v; redraw(); },
			}),
			numberField({
				label: 'Insurance', value: state.insurance, step: '100',
				onInput: (v) => { state.insurance = v; redraw(); },
			}),
			choice({
				label: 'What are the goods? (sets the duty rate)', value: state.band,
				options: Object.entries(bands)
					.filter(([, band]) => Number.isFinite(band.rate))
					.map(([key, band]) => [key, `${band.rate}% · ${band.label}`]),
				onChange: (v) => { state.band = v; redraw(); },
			}),
			numberField({
				label: 'Excise duty, if any', value: state.excise, step: '1', prefix: '%',
				hint: 'Leave at 0 for most goods. Alcohol, tobacco, some foods, cosmetics and a few others carry it.',
				onInput: (v) => { state.excise = v; redraw(); },
			}),
			choice({
				label: 'VAT', value: state.vat,
				options: [['standard', `Standard, ${c.VAT_RATE}%`], ['none', 'Exempt or zero-rated']],
				onChange: (v) => { state.vat = v; redraw(); },
			}),
		], () => {
			const rate = bands[state.band] && bands[state.band].rate;
			const cif = state.goods + state.freight + state.insurance;
			if (!Number.isFinite(rate) || !Number.isFinite(c.VAT_RATE)) return [note('The rates could not be loaded. Reload the page.')];
			if (cif <= 0) return [note('Enter a price.')];

			const duty = cif * rate / 100;
			const excise = (cif + duty) * state.excise / 100;
			const vatBase = cif + duty + excise;
			const vat = state.vat === 'standard' ? vatBase * c.VAT_RATE / 100 : 0;
			const idf = cif * c.CAR_IDF_RATE / 100;
			const rdl = cif * c.CAR_RDL_RATE / 100;
			const taxes = duty + excise + vat + idf + rdl;
			const share = Math.round((taxes / cif) * 100);

			return [
				headline(money(cif + taxes), 'landed, before port and agent charges'),
				breakdown([
					['Customs value (goods + shipping + insurance)', money(cif), 'subtle'],
					[`Import duty (${rate}%)`, money(duty)],
					state.excise > 0 ? [`Excise duty (${state.excise}%)`, money(excise)] : null,
					state.vat === 'standard' ? [`VAT (${c.VAT_RATE}% of ${money(vatBase)})`, money(vat)] : ['VAT', money(0)],
					[`Import Declaration Fee (${c.CAR_IDF_RATE}%)`, money(idf)],
					[`Railway Development Levy (${c.CAR_RDL_RATE}%)`, money(rdl)],
					['Taxes and levies', money(taxes), 'total'],
					['Goods landed in Kenya', money(cif + taxes), 'total'],
				]),
				note(`The taxes come to ${share}% of the customs value, on a duty rate of ${rate}%. The gap is VAT charged on a value that already includes the duty, plus the two levies.`),
				element('p', { class: 'tool-warning', text: 'An estimate. KRA classifies the goods by HS code and values them itself; where your invoice looks low, its figure wins. Ask your clearing agent or courier for a quote before you order.' }),
				note('Not included: port or airport storage, the clearing agent\'s or courier\'s fee, KEBS inspection where the goods need a certificate of conformity, and delivery from the port.'),
			];
		});
	}
}

customElements.define('import-duty-calculator', ImportDutyCalculator);
