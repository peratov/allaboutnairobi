// How much annual leave has built up, and how much is left.

import constants from '/js/utils/constants.mjs';
import { mount, numberField, headline, breakdown, note } from '/js/utils/tool-ui.mjs';

const days = (n) => `${Math.round(n * 10) / 10} day${Math.round(n * 10) === 10 ? '' : 's'}`;

class LeaveCalculator extends HTMLElement {
	connectedCallback() {
		if (this.ready) return;
		this.ready = true;
		const c = constants();
		const state = { entitlement: c.ANNUAL_LEAVE_DAYS, months: 7, carried: 0, taken: 5 };
		const redraw = mount(this, 'Annual leave', () => [
			numberField({
				label: 'Leave days a year in your contract', value: state.entitlement, step: '1', prefix: '',
				onInput: (v) => { state.entitlement = v; redraw(); },
				hint: `The legal minimum is ${c.ANNUAL_LEAVE_DAYS} working days.`,
			}),
			numberField({ label: 'Months worked in this leave year', value: state.months, step: '1', prefix: '', onInput: (v) => { state.months = Math.min(12, v); redraw(); } }),
			numberField({ label: 'Days carried over from last year', value: state.carried, step: '1', prefix: '', onInput: (v) => { state.carried = v; redraw(); } }),
			numberField({ label: 'Days taken so far this year', value: state.taken, step: '1', prefix: '', onInput: (v) => { state.taken = v; redraw(); } }),
		], () => {
			const rate = state.entitlement / 12;
			const earned = rate * state.months;
			const left = earned + state.carried - state.taken;
			const yearEnd = state.entitlement + state.carried - state.taken;
			return [
				headline(days(Math.max(0, left)), 'of leave built up and not yet taken'),
				breakdown([
					['Earned each month', days(rate)],
					['Earned so far this year', days(earned)],
					state.carried ? ['Carried over', days(state.carried)] : null,
					['Taken', `− ${days(state.taken)}`],
					['Available now', days(left), 'total'],
					['Left to take by the end of the leave year', days(yearEnd), 'subtle'],
				]),
				left < 0 ? note('You have taken more than you have earned so far, which is usually fine if your employer agreed, but it can be deducted from final pay if you leave.') : null,
				note('Leave cannot be paid off while you are still employed, only when the job ends. See the final dues calculator.'),
			];
		});
	}
}

customElements.define('leave-calculator', LeaveCalculator);
