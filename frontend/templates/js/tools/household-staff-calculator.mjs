// What it costs to employ a house manager, nanny, gardener or askari in
// Nairobi, and what they take home, checked against the minimum wage.

import constants from '/js/utils/constants.mjs';
import { payslip } from '/js/utils/payroll.mjs';
import { mount, numberField, checkbox, headline, breakdown, note, money, element } from '/js/utils/tool-ui.mjs';

class HouseholdStaffCalculator extends HTMLElement {
	connectedCallback() {
		if (this.ready) return;
		this.ready = true;
		const c = constants();
		const state = { basic: Math.ceil(c.NAIROBI_MIN_WAGE_GENERAL_LABOURER / 500) * 500 + 2000, housed: false };
		const redraw = mount(this, 'Household staff: pay and cost', () => [
			numberField({
				label: 'Basic monthly pay', value: state.basic, step: '500',
				onInput: (value) => { state.basic = value; redraw(); },
				hint: `The Nairobi minimum for a general labourer is ${money(c.NAIROBI_MIN_WAGE_GENERAL_LABOURER)} a month.`,
			}),
			checkbox({
				label: 'They live in, with housing I provide', checked: state.housed,
				onChange: (value) => { state.housed = value; redraw(); },
			}),
		], () => {
			if (state.basic <= 0) return [note('Enter the monthly pay.')];
			const allowance = state.housed ? 0 : state.basic * c.HOUSING_ALLOWANCE_RATE / 100;
			const gross = state.basic + allowance;
			const p = payslip(gross);
			const below = state.basic < c.NAIROBI_MIN_WAGE_GENERAL_LABOURER;
			return [
				headline(money(p.employer.total), 'a month in total, including your contributions'),
				below ? element('p', { class: 'tool-warning', text: `This is below the Nairobi minimum wage of ${money(c.NAIROBI_MIN_WAGE_GENERAL_LABOURER)} for a general labourer.` }) : null,
				element('h5', { class: 'tool-section-heading', text: 'Their payslip' }),
				breakdown([
					['Basic pay', money(state.basic)],
					state.housed ? null : [`Housing allowance (${c.HOUSING_ALLOWANCE_RATE}%)`, money(allowance)],
					['Gross pay', money(gross), 'subtle'],
					['NSSF', `− ${money(p.nssf.total)}`],
					['SHIF', `− ${money(p.shif)}`],
					['Housing Levy', `− ${money(p.housingLevy)}`],
					['PAYE', `− ${money(p.paye.tax)}`],
					['What they take home', money(p.net), 'total'],
				]),
				element('h5', { class: 'tool-section-heading', text: 'What you pay' }),
				breakdown([
					['Gross pay', money(gross)],
					['Your NSSF share', money(p.employer.nssf)],
					['Your Housing Levy share', money(p.employer.housingLevy)],
					['Total a month', money(p.employer.total), 'total'],
					['Total a year', money(p.employer.total * 12), 'subtle'],
				]),
				note('You deduct their share and pay it over with yours: NSSF through the NSSF employer portal, SHIF through SHA, and the Housing Levy and any PAYE through KRA iTax. Leave, public holidays and any overtime are on top.'),
			];
		});
	}
}

customElements.define('household-staff-calculator', HouseholdStaffCalculator);
