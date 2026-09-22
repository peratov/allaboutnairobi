// Import duty calculator for general goods.
//
// The purpose is to stop people budgeting on the invoice. Between the price of
// the goods and the goods in your hands sit duty, five levies, VAT charged on
// most of that, and the shipping you already paid. The headline duty rate is
// usually a little under half the total.

import { cedis, element, parseAmount, percent } from '/js/utils/format.mjs';
import { importCharges } from '/js/utils/customs.mjs';

class ImportDutyCalculator extends HTMLElement {
	connectedCallback() {
		if (this.rendered) return;
		this.rendered = true;

		this.state = {
			goods: 5000,
			freight: 1500,
			insurance: 100,
			dutyRate: null, // filled from constants on first update
			specialLevy: false,
		};

		this.replaceChildren();
		this.build();
		this.update();
	}

	bands() {
		const c = window.accraConstants || {};
		return [
			{ rate: c.CET_BAND_SOCIAL, label: 'Essential social goods' },
			{ rate: c.CET_BAND_RAW_MATERIALS, label: 'Raw materials, capital goods' },
			{ rate: c.CET_BAND_INTERMEDIATE, label: 'Intermediate goods' },
			{ rate: c.CET_BAND_FINISHED, label: 'Finished consumer goods' },
			{ rate: c.CET_BAND_SPECIFIC, label: 'Specific protected goods' },
		].filter((band) => Number.isFinite(band.rate));
	}

	amountField(uid, key, label, hint) {
		return element('div', { class: 'form-group' }, [
			element('label', { for: `${key}-${uid}`, text: label }),
			element('div', { class: 'input-group' }, [
				element('span', { text: '₵' }),
				element('input', {
					id: `${key}-${uid}`,
					type: 'number',
					min: '0',
					step: '50',
					inputmode: 'decimal',
					value: String(this.state[key]),
					oninput: (event) => {
						this.state[key] = parseAmount(event.target.value);
						this.update();
					},
				}),
			]),
			hint ? element('span', { class: 'input-instructions', text: hint }) : null,
		]);
	}

	build() {
		const uid = Math.random().toString(36).slice(2, 7);
		const bands = this.bands();
		this.state.dutyRate = bands.length ? bands[bands.length - 2].rate : 20;

		const select = element('select', {
			id: `band-${uid}`,
			onchange: (event) => {
				this.state.dutyRate = parseFloat(event.target.value);
				this.update();
			},
		});
		bands.forEach((band) => {
			const option = element('option', {
				value: String(band.rate),
				text: `${percent(band.rate)} - ${band.label}`,
			});
			if (band.rate === this.state.dutyRate) option.selected = true;
			select.append(option);
		});

		const form = element('form', {}, [
			element('h4', { text: 'What will it cost to land?' }),
			this.amountField(uid, 'goods', 'Price of the goods', 'What you paid the seller.'),
			this.amountField(uid, 'freight', 'Freight', 'Shipping to Tema or Kotoka. Customs charges duty on this too.'),
			this.amountField(uid, 'insurance', 'Insurance', 'Marine or air cargo insurance on the shipment.'),
			element('div', { class: 'form-group' }, [
				element('label', { for: `band-${uid}`, text: 'Tariff band' }),
				element('div', { class: 'input-group' }, [select]),
				element('span', {
					class: 'input-instructions',
					text: 'Set by the HS code, not by your description of the item. Most personal imports are finished consumer goods.',
				}),
			]),
			element('div', { class: 'form-group' }, [
				element('label', { class: 'checkbox-label', for: `special-${uid}` }, [
					element('input', {
						id: `special-${uid}`,
						type: 'checkbox',
						onchange: (event) => {
							this.state.specialLevy = event.target.checked;
							this.update();
						},
					}),
					element('span', { text: ' Special Import Levy applies' }),
				]),
				element('span', {
					class: 'input-instructions',
					text: 'Applies to selected goods only. Leave it unticked if you do not know.',
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
		const c = window.accraConstants || {};
		const cif = this.state.goods + this.state.freight + this.state.insurance;
		const result = importCharges({
			cif,
			dutyRate: this.state.dutyRate,
			specialLevy: this.state.specialLevy,
		});

		this.results.replaceChildren();

		if (cif <= 0) {
			this.results.append(element('p', { class: 'tool-note', text: 'Enter a value.' }));
			return;
		}

		this.results.append(
			element('div', { class: 'tool-headline' }, [
				element('span', { class: 'tool-headline-value', text: cedis(result.total) }),
				element('span', {
					class: 'tool-headline-label',
					text: `landed cost, of which ${cedis(result.charges)} is duty, levies and tax`,
				}),
			])
		);

		const row = (label, value, className = '') =>
			element('tr', { class: className }, [
				element('th', { scope: 'row', text: label }),
				element('td', { text: value }),
			]);

		const rows = [
			row('CIF value (goods + freight + insurance)', cedis(result.cif), 'subtle'),
			row(`Import duty (${percent(this.state.dutyRate)})`, cedis(result.duty)),
			row(`ECOWAS Levy (${percent(c.ECOWAS_LEVY_RATE)})`, cedis(result.ecowas)),
			row(`AU Import Levy (${percent(c.AU_IMPORT_LEVY_RATE)})`, cedis(result.au)),
			row(`EXIM Levy (${percent(c.EXIM_LEVY_RATE)})`, cedis(result.exim)),
		];

		if (result.special > 0) {
			rows.push(row(`Special Import Levy (${percent(c.SPECIAL_IMPORT_LEVY_RATE)})`, cedis(result.special)));
		}

		rows.push(
			row('Value the VAT is charged on', cedis(result.vatBase), 'subtle'),
			row(`NHIL (${percent(c.NHIL_RATE)})`, cedis(result.nhil)),
			row(`GETFund (${percent(c.GETFUND_RATE)})`, cedis(result.getfund)),
			row(`VAT (${percent(c.VAT_RATE)})`, cedis(result.vat)),
			row(`Inspection fee (${percent(c.IMPORT_INSPECTION_FEE_RATE)})`, cedis(result.inspection)),
			row(`Network charge (${percent(c.IMPORT_NETWORK_CHARGE_RATE)})`, cedis(result.network)),
			row('Total landed cost', cedis(result.total), 'total')
		);

		this.results.append(
			element('div', { class: 'table-wrapper' }, [
				element('table', { class: 'tool-breakdown' }, [element('tbody', {}, rows)]),
			]),
			element('p', {
				class: 'tool-note',
				text:
					`Charges come to ${percent(result.effectiveRate)} of the CIF value, on a headline duty ` +
					`rate of ${percent(this.state.dutyRate)}. That gap is the levies, and VAT charged on ` +
					`a base that already includes the duty.`,
			}),
			element('p', {
				class: 'tool-note',
				text:
					'Customs values goods against its own database. Where your invoice looks low for the ' +
					'item, the higher figure wins. Port charges, demurrage and your clearing agent are on top of this.',
			})
		);
	}
}

customElements.define('import-duty-calculator', ImportDutyCalculator);
