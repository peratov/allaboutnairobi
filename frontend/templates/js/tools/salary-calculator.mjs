// Kenyan take-home pay: NSSF, SHIF, the Housing Levy and PAYE from a gross
// salary, or the gross salary you need for a take-home figure.

import { payslip, grossForNet } from '/js/utils/payroll.mjs';
import { mount, numberField, choice, headline, breakdown, note, money, element } from '/js/utils/tool-ui.mjs';

class SalaryCalculator extends HTMLElement {
	connectedCallback() {
		if (this.ready) return;
		this.ready = true;
		const state = { amount: 100000, mode: 'gross' };
		const redraw = mount(this, 'Salary and take-home pay', () => [
			choice({
				label: 'What do you know?', value: state.mode,
				options: [['gross', 'My gross salary'], ['net', 'The take-home I want']],
				onChange: (mode) => { state.mode = mode; redraw(); },
			}),
			numberField({
				label: 'Amount a month', value: state.amount, step: '1000',
				onInput: (value) => { state.amount = value; redraw(); },
				hint: 'Monthly, before anything is deducted if you chose gross.',
			}),
		], () => {
			if (state.amount <= 0) return [note('Enter an amount.')];
			const gross = state.mode === 'gross' ? state.amount : grossForNet(state.amount);
			const p = payslip(gross);
			const lines = p.paye.lines.map((line) => [
				`  PAYE ${line.rate}% on ${money(line.from)} to ${money(line.to)}`, money(line.amount), 'subtle']);
			return [
				state.mode === 'gross'
					? headline(money(p.net), `take-home a month, from ${money(gross)} gross`)
					: headline(money(gross), `gross a month, for about ${money(p.net)} take-home`),
				breakdown([
					['Gross pay', money(gross)],
					['NSSF (Tier I and II)', `− ${money(p.nssf.total)}`],
					['SHIF', `− ${money(p.shif)}`],
					['Housing Levy', `− ${money(p.housingLevy)}`],
					['Taxable pay', money(p.taxable), 'subtle'],
					...lines,
					['  Less personal relief', `− ${money(Math.min(p.paye.relief, p.paye.beforeRelief))}`, 'subtle'],
					['PAYE', `− ${money(p.paye.tax)}`],
					['Take-home pay', money(p.net), 'total'],
				]),
				element('h5', { class: 'tool-section-heading', text: 'What it costs your employer' }),
				breakdown([
					['Gross pay', money(gross)],
					['Employer NSSF', money(p.employer.nssf)],
					['Employer Housing Levy', money(p.employer.housingLevy)],
					['Total cost', money(p.employer.total), 'total'],
				]),
				note('Assumes a resident employee with no other reliefs, and NSSF on the whole gross. If only part of your pay is pensionable, NSSF will be lower. Payroll software may differ by a few shillings.'),
			];
		});
	}
}

customElements.define('salary-calculator', SalaryCalculator);
