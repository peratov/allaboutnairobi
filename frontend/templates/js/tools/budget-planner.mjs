// A monthly budget for living in Nairobi. The figures are saved in this
// browser only, so a returning reader finds their own numbers.

import { mount, numberField, headline, breakdown, note, money, element } from '/js/utils/tool-ui.mjs';

const KEY = 'budget-planner-v1';

const LINES = [
	['rent', 'Rent', 45000],
	['service', 'Service charge, security, rubbish', 3000],
	['power', 'Electricity tokens', 3000],
	['water', 'Water', 1500],
	['gas', 'Cooking gas', 1500],
	['internet', 'Home internet', 3500],
	['phone', 'Airtime and data', 1500],
	['food', 'Food and household shopping', 25000],
	['eating', 'Eating out', 8000],
	['transport', 'Transport', 10000],
	['health', 'Health insurance and medicine', 5000],
	['family', 'Family, church and community', 5000],
	['other', 'Everything else', 5000],
];

function load() {
	try {
		return JSON.parse(localStorage.getItem(KEY)) || null;
	} catch {
		return null;
	}
}

function save(state) {
	try {
		localStorage.setItem(KEY, JSON.stringify(state));
	} catch {
		// Private mode or storage off: the planner still works, it just forgets.
	}
}

class BudgetPlanner extends HTMLElement {
	connectedCallback() {
		if (this.ready) return;
		this.ready = true;
		const saved = load();
		const state = saved || { income: 120000, ...Object.fromEntries(LINES.map(([key, , value]) => [key, value])) };
		const change = (key) => (value) => { state[key] = value; save(state); redraw(); };

		const redraw = mount(this, 'Monthly budget', () => [
			numberField({
				label: 'Take-home pay a month', value: state.income, step: '1000', onInput: change('income'),
				hint: 'After deductions. Work it out with the salary calculator.',
			}),
			...LINES.map(([key, label]) => numberField({ label, value: state[key] ?? 0, step: '500', onInput: change(key) })),
			element('button', {
				type: 'button', class: 'toggle', text: 'Reset to the example figures',
				onclick: () => {
					try { localStorage.removeItem(KEY); } catch { /* nothing to clear */ }
					this.ready = false;
					this.connectedCallback();
				},
			}),
		], () => {
			const spend = LINES.reduce((sum, [key]) => sum + (state[key] || 0), 0);
			const left = state.income - spend;
			const largest = [...LINES].sort((a, b) => (state[b[0]] || 0) - (state[a[0]] || 0))[0];
			return [
				headline(money(Math.abs(left)), left >= 0 ? 'left over each month' : 'short each month'),
				left < 0 ? element('p', { class: 'tool-warning', text: 'You are spending more than you earn.' }) : null,
				breakdown([
					['Take-home pay', money(state.income)],
					['Total spending', money(spend)],
					[left >= 0 ? 'Left to save' : 'Shortfall', money(Math.abs(left)), 'total'],
					state.income > 0 ? ['Rent as a share of take-home', `${Math.round(100 * (state.rent || 0) / state.income)}%`, 'subtle'] : null,
					state.income > 0 && left > 0 ? ['Savings rate', `${Math.round(100 * left / state.income)}%`, 'subtle'] : null,
					['Biggest line', `${largest[1]}: ${money(state[largest[0]] || 0)}`, 'subtle'],
				]),
				note('The example figures are a single person renting a one-bedroom in a mid-range area. Your numbers are saved in this browser only and never sent anywhere.'),
			];
		});
	}
}

customElements.define('budget-planner', BudgetPlanner);
