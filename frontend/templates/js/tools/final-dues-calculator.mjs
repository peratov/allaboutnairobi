// What an employee is owed when a job ends: salary to the last day, untaken
// leave, pay in lieu of notice and, on redundancy, severance.

import constants from '/js/utils/constants.mjs';
import { mount, numberField, choice, checkbox, headline, breakdown, note, money } from '/js/utils/tool-ui.mjs';

class FinalDuesCalculator extends HTMLElement {
	connectedCallback() {
		if (this.ready) return;
		this.ready = true;
		const c = constants();
		const state = {
			pay: 60000, reason: 'redundancy', years: 4, daysWorked: 10, leave: 7,
			notice: c.NOTICE_DAYS_MONTHLY_PAID, inLieu: true, divisor: '30',
		};
		const redraw = mount(this, 'Final dues when a job ends', () => [
			choice({
				label: 'Why is the job ending?', value: state.reason,
				options: [['redundancy', 'Redundancy'], ['termination', 'Termination'], ['resignation', 'Resignation']],
				onChange: (v) => { state.reason = v; redraw(); },
			}),
			numberField({ label: 'Monthly basic pay', value: state.pay, step: '1000', onInput: (v) => { state.pay = v; redraw(); } }),
			numberField({ label: 'Completed years of service', value: state.years, step: '1', prefix: '', onInput: (v) => { state.years = Math.floor(v); redraw(); } }),
			numberField({ label: 'Days worked in the final month and not yet paid', value: state.daysWorked, step: '1', prefix: '', onInput: (v) => { state.daysWorked = v; redraw(); } }),
			numberField({ label: 'Annual leave days earned but not taken', value: state.leave, step: '1', prefix: '', onInput: (v) => { state.leave = v; redraw(); } }),
			numberField({ label: 'Notice period, in days', value: state.notice, step: '1', prefix: '', onInput: (v) => { state.notice = v; redraw(); } }),
			checkbox({ label: 'Notice is paid instead of worked', checked: state.inLieu, onChange: (v) => { state.inLieu = v; redraw(); } }),
			choice({
				label: "How a day's pay is worked out", value: state.divisor,
				options: [['30', 'Monthly pay ÷ 30'], ['26', 'Monthly pay ÷ 26 working days']],
				onChange: (v) => { state.divisor = v; redraw(); },
			}),
		], () => {
			if (state.pay <= 0) return [note('Enter the monthly pay.')];
			const day = state.pay / Number(state.divisor);
			const salary = day * state.daysWorked;
			const leave = day * state.leave;
			const notice = state.inLieu ? day * state.notice : 0;
			const severance = state.reason === 'redundancy' ? day * c.SEVERANCE_DAYS_PER_YEAR * state.years : 0;
			const total = salary + leave + notice + severance;
			return [
				headline(money(total), 'before tax and deductions'),
				breakdown([
					["A day's pay", money(day), 'subtle'],
					['Salary for days worked', money(salary)],
					['Untaken annual leave', money(leave)],
					state.inLieu ? ['Pay in lieu of notice', money(notice)] : null,
					state.reason === 'redundancy'
						? [`Severance (${c.SEVERANCE_DAYS_PER_YEAR} days × ${state.years} years)`, money(severance)]
						: null,
					['Total', money(total), 'total'],
				]),
				note(`These are the legal minimums; a contract or collective agreement can give more. Redundancy also needs a month's notice to you and the labour officer. Payments are taxed through PAYE, and employers differ on dividing by 30 or 26. You are also owed a certificate of service.`),
			];
		});
	}
}

customElements.define('final-dues-calculator', FinalDuesCalculator);
