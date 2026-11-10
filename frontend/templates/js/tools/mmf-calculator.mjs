// What a money market fund pays: a day, a month, a year, and over time with
// monthly top-ups, after the withholding tax on interest.
//
// Funds quote an effective annual yield after their fee. Interest accrues
// daily and is compounded, usually monthly, so this turns the annual figure
// into an equivalent monthly rate, takes the tax off each month's interest, and
// adds the top-up at the end of each month.

import constants from '/js/utils/constants.mjs';
import { mount, numberField, headline, breakdown, note, money, element } from '/js/utils/tool-ui.mjs';

class MmfCalculator extends HTMLElement {
	connectedCallback() {
		if (this.ready) return;
		this.ready = true;
		const c = constants();
		const state = { start: 100000, monthly: 5000, rate: Number(c.MMF_AVERAGE_YIELD) || 0, months: 12 };

		const redraw = mount(this, 'Money market fund interest', () => [
			numberField({ label: 'Amount in the fund now', value: state.start, step: '1000', onInput: (v) => { state.start = v; redraw(); } }),
			numberField({ label: 'Added every month', value: state.monthly, step: '500', onInput: (v) => { state.monthly = v; redraw(); } }),
			numberField({
				label: "Fund's yield, per year, before tax", value: state.rate, step: '0.1', prefix: '%',
				hint: 'The effective annual yield the fund publishes. Compare funds in the comparer.',
				onInput: (v) => { state.rate = v; redraw(); },
			}),
			numberField({ label: 'For how many months', value: state.months, step: '1', prefix: '', onInput: (v) => { state.months = Math.round(v); redraw(); } }),
		], () => {
			if (!Number.isFinite(c.INTEREST_WHT_RATE)) return [note('The tax rate could not be loaded. Reload the page.')];
			if (state.rate <= 0) return [note('Enter the yield.')];
			const keep = 1 - c.INTEREST_WHT_RATE / 100;
			const monthlyRate = (1 + state.rate / 100) ** (1 / 12) - 1;
			// A year's after-tax interest on today's balance, the figure funds'
			// effective annual yield describes; a day and a month are shares of it.
			const yearly = state.start * (state.rate / 100) * keep;

			let balance = state.start;
			let gross = 0;
			for (let m = 0; m < state.months; m += 1) {
				const interest = balance * monthlyRate;
				gross += interest;
				balance += interest * keep + state.monthly;
			}
			const tax = gross * (1 - keep);
			const paidIn = state.start + state.monthly * state.months;

			return [
				headline(money(balance), `after ${state.months} month${state.months === 1 ? '' : 's'}`),
				element('p', { class: 'tool-note', text: `On ${money(state.start)} today the fund pays about ${money(yearly / 365)} a day, ${money(yearly / 12)} a month, or ${money(yearly)} a year, after tax.` }),
				breakdown([
					['You put in', money(paidIn)],
					['Interest earned, before tax', money(gross)],
					[`Withholding tax (${c.INTEREST_WHT_RATE}%)`, money(tax)],
					['Interest you keep', money(gross - tax), 'total'],
					['Balance at the end', money(balance), 'subtle'],
				]),
				note('Yields change every week, so this is a projection at today\'s rate, not a promise. The fund\'s fee is already taken out of the yield it publishes. The withholding tax is final: there is nothing more to pay on it.'),
			];
		});
	}
}

customElements.define('mmf-calculator', MmfCalculator);
