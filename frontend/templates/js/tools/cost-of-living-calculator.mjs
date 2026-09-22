// Monthly cost of living in Accra.
//
// The defaults are a single person in a mid-range suburb - Madina, Dansoman,
// Adenta - who takes trotros, cooks some meals and buys others, and treats the
// polytank as a solved problem. Every line is editable, because the range in
// Accra between Nima and Cantonments is enormous and no single number is
// honest for both.

import { cedis, element, parseAmount } from '/js/utils/format.mjs';

const LINES = [
	{ id: 'rent', label: 'Rent', fromConstant: 'ACCRA_ONE_BED_RENT_MID', fallback: 2500,
	  hint: 'Spread the advance over the months it covers. A year of advance on a ₵2,500 room is still ₵2,500 a month.' },
	{ id: 'food', label: 'Food and market', fallback: 1400,
	  hint: 'Market shopping plus a few bought lunches. Chop bar waakye runs around ₵20 a plate.' },
	{ id: 'transport', label: 'Transport', fallback: 500,
	  hint: 'Trotro to work and back most days, with occasional Bolt trips.' },
	{ id: 'electricity', label: 'Electricity', fallback: 350,
	  hint: 'Prepaid ECG credit. Air conditioning changes this figure more than anything else.' },
	{ id: 'water', label: 'Water', fallback: 120,
	  hint: 'Mains water, plus sachet water. Add a tanker delivery if your area rations.' },
	{ id: 'data', label: 'Mobile data and airtime', fallback: 200,
	  hint: 'A monthly bundle on MTN, Telecel or AT.' },
	{ id: 'gas', label: 'Cooking gas', fallback: 180,
	  hint: 'An LPG cylinder refill lasts a single person roughly two months.' },
	{ id: 'health', label: 'Health', fallback: 100,
	  hint: 'NHIS renewal spread monthly, plus the medicines NHIS does not cover.' },
	{ id: 'other', label: 'Everything else', fallback: 600,
	  hint: 'Airtime top-ups, church or mosque, funerals, family obligations, haircuts, a night out.' },
];

class CostOfLivingCalculator extends HTMLElement {
	connectedCallback() {
		if (this.rendered) return;
		this.rendered = true;

		const constants = window.accraConstants || {};
		this.state = {};
		for (const line of LINES) {
			const fromConstant = line.fromConstant ? Number(constants[line.fromConstant]) : NaN;
			this.state[line.id] = Number.isFinite(fromConstant) ? fromConstant : line.fallback;
		}

		this.replaceChildren();
		this.build();
		this.update();
	}

	build() {
		const uid = Math.random().toString(36).slice(2, 7);

		const fields = LINES.map((line) =>
			element('div', { class: 'form-group' }, [
				element('label', { for: `${line.id}-${uid}`, text: line.label }),
				element('div', { class: 'input-group' }, [
					element('span', { text: '₵' }),
					element('input', {
						id: `${line.id}-${uid}`,
						type: 'number',
						min: '0',
						step: '50',
						inputmode: 'decimal',
						value: String(this.state[line.id]),
						oninput: (event) => {
							this.state[line.id] = parseAmount(event.target.value);
							this.update();
						},
					}),
				]),
				element('span', { class: 'input-instructions', text: line.hint }),
			])
		);

		const form = element('form', {}, [
			element('h4', { text: 'A month in Accra' }),
			...fields,
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
		const constants = window.accraConstants || {};
		const total = LINES.reduce((sum, line) => sum + (this.state[line.id] || 0), 0);

		this.results.replaceChildren();

		this.results.append(
			element('div', { class: 'tool-headline' }, [
				element('span', { class: 'tool-headline-value', text: cedis(total) }),
				element('span', { class: 'tool-headline-label', text: 'a month, and ' + cedis(total * 12) + ' a year' }),
			])
		);

		const rows = LINES.filter((line) => this.state[line.id] > 0).map((line) => {
			const value = this.state[line.id];
			const share = total > 0 ? Math.round((value / total) * 100) : 0;
			return element('tr', {}, [
				element('th', { scope: 'row', text: line.label }),
				element('td', { text: `${cedis(value)} (${share}%)` }),
			]);
		});

		rows.push(
			element('tr', { class: 'total' }, [
				element('th', { scope: 'row', text: 'Total' }),
				element('td', { text: cedis(total) }),
			])
		);

		this.results.append(
			element('div', { class: 'table-wrapper' }, [
				element('table', { class: 'tool-breakdown' }, [element('tbody', {}, rows)]),
			])
		);

		const minimumWage = Number(constants.MONTHLY_MINIMUM_WAGE_APPROX);
		const median = Number(constants.GHANA_MEDIAN_MONTHLY_EARNINGS);

		if (Number.isFinite(minimumWage) && minimumWage > 0 && total > 0) {
			const wages = total / minimumWage;
			this.results.append(
				element('p', {
					class: 'tool-note',
					text:
						`This budget costs ${wages.toFixed(1)} times the monthly minimum wage of ` +
						`${cedis(minimumWage)}. It is a useful reminder that a "modest" Accra budget ` +
						'is out of reach on minimum-wage work, which is why households pool income ' +
						'and why so many people run a side hustle.',
				})
			);
		}

		if (Number.isFinite(median) && median > 0 && total > 0) {
			this.results.append(
				element('p', {
					class: 'tool-note',
					text:
						`Against median earnings of about ${cedis(median)} a month, you would need ` +
						`${(total / median).toFixed(1)} median salaries to cover it.`,
				})
			);
		}
	}
}

customElements.define('cost-of-living-calculator', CostOfLivingCalculator);
