// Overtime pay under Kenya's general wage regulations.

import constants from '/js/utils/constants.mjs';
import { mount, numberField, headline, breakdown, note, money } from '/js/utils/tool-ui.mjs';

class OvertimeCalculator extends HTMLElement {
	connectedCallback() {
		if (this.ready) return;
		this.ready = true;
		const c = constants();
		const state = { pay: 30000, hours: c.NORMAL_WEEKLY_HOURS, normal: 10, rest: 4 };
		const redraw = mount(this, 'Overtime pay', () => [
			numberField({ label: 'Monthly basic pay', value: state.pay, step: '1000', onInput: (v) => { state.pay = v; redraw(); } }),
			numberField({
				label: 'Normal hours a week', value: state.hours, step: '1', prefix: '',
				onInput: (v) => { state.hours = v; redraw(); },
				hint: `${c.NORMAL_WEEKLY_HOURS} under the general wage regulations; many office contracts set fewer.`,
			}),
			numberField({ label: 'Overtime hours on normal working days, this month', value: state.normal, step: '1', prefix: '', onInput: (v) => { state.normal = v; redraw(); } }),
			numberField({ label: 'Hours worked on rest days and public holidays', value: state.rest, step: '1', prefix: '', onInput: (v) => { state.rest = v; redraw(); } }),
		], () => {
			if (state.pay <= 0 || state.hours <= 0) return [note('Enter your pay and hours.')];
			const hourly = state.pay / (state.hours * 52 / 12);
			const normal = state.normal * hourly * c.OVERTIME_RATE_NORMAL;
			const rest = state.rest * hourly * c.OVERTIME_RATE_REST_DAY;
			return [
				headline(money(normal + rest), 'overtime pay this month'),
				breakdown([
					['Hourly rate', money(hourly), 'subtle'],
					[`${state.normal} hours at ${c.OVERTIME_RATE_NORMAL}×`, money(normal)],
					[`${state.rest} hours at ${c.OVERTIME_RATE_REST_DAY}×`, money(rest)],
					['Overtime pay', money(normal + rest), 'total'],
					['Basic plus overtime', money(state.pay + normal + rest), 'subtle'],
				]),
				note('These are the minimum rates in the general wage regulations. Your contract or a collective agreement may pay more, and senior staff are often excluded from overtime. Overtime is taxed through PAYE.'),
			];
		});
	}
}

customElements.define('overtime-calculator', OvertimeCalculator);
