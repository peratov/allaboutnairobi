// What salary do you need to live in Nairobi?
//
// The other way round from the budget planner. The planner starts from what
// you earn and shows what is left. This starts from how you want to live and
// works back, through PAYE, NSSF, SHIF and the Housing Levy, to the gross pay
// that makes it possible. The two lifestyles are the midpoints of the rough
// ranges in the cost of living guide, and every line can be changed, because
// the gap between Kibera and Runda is too wide for any one number.
// Ported from All About Accra.

import constants from '/js/utils/constants.mjs';
import { grossForNet, payslip } from '/js/utils/payroll.mjs';
import { mount, numberField, choice, headline, breakdown, note, money } from '/js/utils/tool-ui.mjs';

// The midpoints of guides/cost-of-living-in-nairobi.md's two budgets, for a
// single person. Change them with the guide.
const LIFESTYLES = {
	modest: { rent: 22500, food: 16000, eating: 3500, transport: 6000, utilities: 3750, phone: 3000, service: 1000 },
	comfortable: { rent: 70000, food: 40000, eating: 22500, transport: 22500, utilities: 9000, phone: 6500, service: 6500 },
};

const LINES = [
	['rent', 'Rent', 'The biggest line by far. Put in a real rent for the area you want.'],
	['food', 'Food and household shopping', 'Markets and mama mboga cost far less than imported brands.'],
	['eating', 'Eating out', ''],
	['transport', 'Transport', 'Matatus for the modest budget; ride-hailing or a car for the comfortable one.'],
	['utilities', 'Electricity, water and gas', ''],
	['phone', 'Internet and phone', ''],
	['service', 'Service charge, rubbish and security', ''],
	['extras', 'Anything else', 'Health insurance, school fees, household staff, family and church.'],
];

class CostOfLivingCalculator extends HTMLElement {
	connectedCallback() {
		if (this.ready) return;
		this.ready = true;
		const c = constants();
		const state = { lifestyle: 'modest', ...LIFESTYLES.modest, extras: 0, save: 10 };
		let fields = [];

		const build = () => [
			choice({
				label: 'Start from', value: state.lifestyle,
				options: [['modest', 'A modest life'], ['comfortable', 'A comfortable life']],
				onChange: (v) => {
					state.lifestyle = v;
					Object.assign(state, LIFESTYLES[v]);
					fields.forEach(([key, input]) => { input.value = String(state[key]); });
					redraw();
				},
			}),
			...LINES.map(([key, label, hint]) => numberField({
				label, value: state[key], step: '500', hint: hint || undefined,
				onInput: (v) => { state[key] = v; redraw(); },
			})),
			numberField({ label: 'Save each month, as a share of take-home pay', value: state.save, step: '1', prefix: '%', onInput: (v) => { state.save = Math.min(v, 90); redraw(); } }),
		];

		const redraw = mount(this, 'A month in Nairobi', build, () => {
			const spend = LINES.reduce((sum, [key]) => sum + (state[key] || 0), 0);
			if (spend <= 0) return [note('Enter what you expect to spend.')];
			const takeHome = spend / (1 - state.save / 100);
			const gross = grossForNet(takeHome);
			const slip = payslip(gross);
			const deductions = gross - slip.net;
			const minWage = c.NAIROBI_MIN_WAGE_GENERAL_LABOURER;
			return [
				headline(money(gross), 'gross pay a month to live this way'),
				breakdown([
					['You spend', money(spend)],
					state.save ? [`You save (${state.save}%)`, money(takeHome - spend)] : null,
					['Take-home pay needed', money(takeHome), 'total'],
					['PAYE, NSSF, SHIF and Housing Levy on top', money(deductions)],
					['Gross pay needed', money(gross), 'total'],
					['A year, gross', money(gross * 12)],
				]),
				minWage ? note(`For comparison, the minimum wage for a general labourer in Nairobi is ${money(minWage)} a month.`) : null,
				note('The starting figures are rough 2026 ranges for a single person, not quotes. Prices move with inflation, fuel and the shilling, so replace them with real prices from where you will live.'),
			];
		});

		// numberField builds its own inputs. Keep a handle on them so choosing a
		// lifestyle can refill every line.
		const inputs = [...this.querySelectorAll('form input[type="number"]')];
		fields = LINES.map(([key], i) => [key, inputs[i]]);
	}
}

customElements.define('cost-of-living-calculator', CostOfLivingCalculator);
