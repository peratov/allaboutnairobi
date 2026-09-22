// Vehicle import duty calculator.
//
// Separate from the general import calculator because vehicles are charged
// differently in two ways that matter enormously: duty follows engine capacity
// rather than a tariff band, and anything over ten years old carries an age
// penalty that steps up sharply. A cheap old car abroad is not a cheap car in
// Tema, and this is where people find that out too late.

import { cedis, element, parseAmount, percent } from '/js/utils/format.mjs';
import { importCharges, overagePenaltyRate, vehicleDutyRate } from '/js/utils/customs.mjs';

class VehicleImportDutyCalculator extends HTMLElement {
	connectedCallback() {
		if (this.rendered) return;
		this.rendered = true;

		const thisYear = new Date().getFullYear();
		this.state = {
			price: 60000,
			freight: 20000,
			cc: 1800,
			year: thisYear - 8,
		};

		this.replaceChildren();
		this.build();
		this.update();
	}

	numberField(uid, key, label, hint, { step = '100', prefix = null, min = '0', max = null } = {}) {
		const input = element('input', {
			id: `${key}-${uid}`,
			type: 'number',
			min,
			step,
			inputmode: 'numeric',
			value: String(this.state[key]),
			oninput: (event) => {
				this.state[key] = parseAmount(event.target.value);
				this.update();
			},
		});
		if (max) input.setAttribute('max', max);

		return element('div', { class: 'form-group' }, [
			element('label', { for: `${key}-${uid}`, text: label }),
			element('div', { class: 'input-group' }, [
				prefix ? element('span', { text: prefix }) : null,
				input,
			]),
			hint ? element('span', { class: 'input-instructions', text: hint }) : null,
		]);
	}

	build() {
		const uid = Math.random().toString(36).slice(2, 7);
		const thisYear = new Date().getFullYear();

		const form = element('form', {}, [
			element('h4', { text: 'What will this car cost to land?' }),
			this.numberField(uid, 'price', 'Price of the vehicle', 'What you paid, converted to cedis.', {
				prefix: '₵',
				step: '1000',
			}),
			this.numberField(uid, 'freight', 'Shipping and insurance', 'Freight to Tema plus marine insurance. Duty is charged on this too.', {
				prefix: '₵',
				step: '1000',
			}),
			this.numberField(uid, 'cc', 'Engine capacity (cc)', 'Duty follows engine size for passenger vehicles.', {
				step: '100',
			}),
			this.numberField(uid, 'year', 'Year of manufacture', 'The year it was built, not the year you bought it.', {
				step: '1',
				min: '1970',
				max: String(thisYear + 1),
			}),
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
		const cif = this.state.price + this.state.freight;
		const dutyRate = vehicleDutyRate(this.state.cc);
		const overageRate = overagePenaltyRate(this.state.year);
		const age = new Date().getFullYear() - this.state.year;

		const result = importCharges({ cif, dutyRate, overageRate });

		this.results.replaceChildren();

		if (cif <= 0 || !this.state.year) {
			this.results.append(
				element('p', { class: 'tool-note', text: 'Enter a value and a year of manufacture.' })
			);
			return;
		}

		this.results.append(
			element('div', { class: 'tool-headline' }, [
				element('span', { class: 'tool-headline-value', text: cedis(result.total) }),
				element('span', {
					class: 'tool-headline-label',
					text: `to land, of which ${cedis(result.charges)} is duty, penalty, levies and tax`,
				}),
			])
		);

		const row = (label, value, className = '') =>
			element('tr', { class: className }, [
				element('th', { scope: 'row', text: label }),
				element('td', { text: value }),
			]);

		const rows = [
			row('CIF value (vehicle + shipping + insurance)', cedis(result.cif), 'subtle'),
			row(`Import duty (${percent(dutyRate)}, ${this.state.cc}cc)`, cedis(result.duty)),
		];

		if (result.overage > 0) {
			rows.push(row(`Overage penalty (${percent(overageRate)}, ${age} years old)`, cedis(result.overage)));
		}

		rows.push(
			row(`ECOWAS Levy (${percent(c.ECOWAS_LEVY_RATE)})`, cedis(result.ecowas)),
			row(`AU Import Levy (${percent(c.AU_IMPORT_LEVY_RATE)})`, cedis(result.au)),
			row(`EXIM Levy (${percent(c.EXIM_LEVY_RATE)})`, cedis(result.exim)),
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
			])
		);

		// The age warning is the whole reason this tool is separate from the
		// general one, so say it plainly rather than leaving it in a table row.
		if (overageRate > 0) {
			const threshold = c.VEHICLE_OVERAGE_THRESHOLD_YEARS || 10;
			this.results.append(
				element('p', {
					class: 'tool-note',
					text:
						`This vehicle is ${age} years old, so it is over the ${threshold}-year threshold and ` +
						`carries a ${percent(overageRate)} penalty on its CIF value - ${cedis(result.overage)}. ` +
						'A newer vehicle with a higher price can land cheaper. Try one.',
				})
			);
		}

		this.results.append(
			element('p', {
				class: 'tool-note',
				text:
					`Charges come to ${percent(result.effectiveRate)} of the CIF value. Customs values vehicles ` +
					'against its own database, so a low invoice does not lower the duty - it lengthens the query. ' +
					'Port charges, demurrage, your clearing agent and DVLA registration are all on top of this.',
			})
		);
	}
}

customElements.define('vehicle-import-duty-calculator', VehicleImportDutyCalculator);
