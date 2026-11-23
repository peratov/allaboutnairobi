// Kenya pension calculator.
//
// Two questions people mix up. What goes into my pension each month, and
// what does adding more of my own cost after tax relief? And roughly what
// will it all add up to by retirement, in today's money? The first is law:
// NSSF tiers, PAYE and the pension deduction cap, all from constants.yaml.
// The second rests on assumptions, so they are fields the reader can change,
// and the answer is shown in today's shillings so it means something.
// Ported from All About Accra's SSNIT calculator, rebuilt for Kenyan rules.

import constants from '/js/utils/constants.mjs';
import { nssf, payslip, paye } from '/js/utils/payroll.mjs';
import { mount, numberField, headline, breakdown, note, money, element } from '/js/utils/tool-ui.mjs';

class PensionCalculator extends HTMLElement {
	connectedCallback() {
		if (this.ready) return;
		this.ready = true;
		const c = constants();
		const state = {
			gross: 80000,
			own: 5000,
			employer: 0,
			age: 30,
			retire: c.NSSF_PENSIONABLE_AGE || 60,
			saved: 100000,
			ret: 8,
			growth: 5,
			years: 20,
		};
		const set = (key, round = false) => (v) => { state[key] = round ? Math.round(v) : v; redraw(); };

		const redraw = mount(this, 'Your pension', () => [
			element('p', { class: 'input-instructions', text: 'This month' }),
			numberField({ label: 'Gross monthly pay', value: state.gross, step: '1000', onInput: set('gross') }),
			numberField({
				label: 'You pay into a pension scheme or plan, a month', value: state.own, step: '500', onInput: set('own'),
				hint: 'On top of NSSF - an employer scheme or a personal plan. 0 if none.',
			}),
			numberField({ label: 'Your employer pays into the scheme, a month', value: state.employer, step: '500', onInput: set('employer'), hint: 'On top of its NSSF match. 0 if none.' }),
			element('p', { class: 'input-instructions', text: 'Looking ahead' }),
			numberField({ label: 'Your age', value: state.age, step: '1', prefix: '', onInput: set('age', true) }),
			numberField({ label: 'Age you retire', value: state.retire, step: '1', prefix: '', onInput: set('retire', true), hint: `NSSF's pension age is ${c.NSSF_PENSIONABLE_AGE || 60}.` }),
			numberField({ label: 'Saved so far, NSSF and schemes together', value: state.saved, step: '10000', onInput: set('saved'), hint: 'Your latest statements show it.' }),
			numberField({
				label: 'Return a year, before inflation', value: state.ret, step: '0.5', prefix: '%', onInput: set('ret'),
				hint: 'An assumption. Schemes declare different rates each year, and past rates do not promise future ones.',
			}),
			numberField({ label: 'Pay rise a year', value: state.growth, step: '0.5', prefix: '%', onInput: set('growth') }),
			numberField({ label: 'Years the money has to last', value: state.years, step: '1', prefix: '', onInput: set('years', true) }),
		], () => {
			const gross = state.gross;
			if (gross <= 0) return [note('Enter your gross monthly pay.')];

			// This month: NSSF, and the tax relief on what you add yourself.
			const fund = nssf(gross);
			const base = payslip(gross);
			const cap = Math.min(c.PENSION_DEDUCTION_MONTHLY, gross * 0.3);
			const room = Math.max(0, cap - fund.total);
			const deductible = Math.min(state.own, room);
			const taxWith = paye(Math.max(0, base.taxable - deductible)).tax;
			const relief = Math.max(0, base.paye.tax - taxWith);
			const monthly = fund.total * 2 + state.own + state.employer;

			const out = [
				headline(money(monthly), 'goes towards your retirement every month'),
				breakdown([
					['NSSF, you', money(fund.total)],
					['NSSF, your employer', money(fund.total)],
					state.own ? ['Your scheme or plan', money(state.own)] : null,
					state.employer ? ["Your employer's scheme contribution", money(state.employer)] : null,
					['Total a month', money(monthly), 'total'],
					state.own ? ['Tax you save on your own contribution', money(relief)] : null,
					state.own ? ['What it really costs you', money(state.own - relief)] : null,
				]),
			];
			if (state.own > room) {
				out.push(note(`Only ${money(room)} of it is tax-deductible. Pension relief stops at ${money(cap)} a month (the lower of KES ${c.PENSION_DEDUCTION_MONTHLY.toLocaleString('en-KE')} or 30% of pay), and NSSF already uses ${money(fund.total)} of that.`));
			}

			// Looking ahead.
			const years = state.retire - state.age;
			if (years <= 0) {
				out.push(note('Your retirement age is not after your age, so there is nothing to project.'));
				return out;
			}
			const r = state.ret / 100 / 12;
			let pot = state.saved;
			let paidIn = state.saved;
			let contribution = monthly;
			for (let y = 0; y < years; y += 1) {
				for (let m = 0; m < 12; m += 1) {
					pot = pot * (1 + r) + contribution;
					paidIn += contribution;
				}
				contribution *= 1 + state.growth / 100;
			}
			const inflation = (c.CBK_INFLATION_TARGET || 5) / 100;
			const today = pot / (1 + inflation) ** years;
			// Drawn down evenly over the years chosen, earning the real return.
			const real = (1 + state.ret / 100) / (1 + inflation) - 1;
			const n = Math.max(1, state.years) * 12;
			const rm = (1 + real) ** (1 / 12) - 1;
			const income = rm > 0 ? today * rm / (1 - (1 + rm) ** -n) : today / n;
			const share = Math.round((income / gross) * 100);

			out.push(
				headline(money(today), `by age ${state.retire}, in today's money`),
				breakdown([
					['Pot at retirement, in the shillings of the day', money(pot)],
					['Of which paid in', money(paidIn)],
					[`The same pot in today's money (${c.CBK_INFLATION_TARGET}% inflation a year)`, money(today), 'total'],
					[`A monthly income for ${state.years} years, in today's money`, money(income)],
					['That is, of your pay today', `${share}%`],
				]),
				note(`Assumes contributions rise with your pay, the return stays at ${state.ret}% a year, and inflation runs at the Central Bank's ${c.CBK_INFLATION_TARGET}% target. Fees, tax on withdrawal and changes to NSSF limits are left out. It is arithmetic to plan with, not a quote or advice.`),
			);
			if (share < 50) {
				out.push(note('Many planners aim for a retirement income of around half to two-thirds of your final pay. Starting earlier, paying in more, or retiring later each closes the gap.'));
			}
			return out;
		});
	}
}

customElements.define('pension-calculator', PensionCalculator);
