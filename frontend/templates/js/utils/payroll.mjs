// Kenyan payroll arithmetic, shared by the salary and household staff
// calculators. The rates come from content/constants.yaml via constants.mjs.

import constants from '/js/utils/constants.mjs';

const round2 = (n) => Math.round(n * 100) / 100;

export function nssf(pensionable) {
	const c = constants();
	const rate = c.NSSF_RATE / 100;
	const tier1 = Math.min(pensionable, c.NSSF_LOWER_EARNINGS_LIMIT) * rate;
	const tier2 = Math.max(0, Math.min(pensionable, c.NSSF_UPPER_EARNINGS_LIMIT) - c.NSSF_LOWER_EARNINGS_LIMIT) * rate;
	return { tier1: round2(tier1), tier2: round2(tier2), total: round2(tier1 + tier2) };
}

export function shif(gross) {
	const c = constants();
	return round2(Math.max(gross * c.SHIF_RATE / 100, c.SHIF_MINIMUM));
}

export function housingLevy(gross) {
	return round2(gross * constants().HOUSING_LEVY_RATE / 100);
}

export function payeBands() {
	const c = constants();
	return [
		{ upTo: c.PAYE_BAND_1_LIMIT, rate: c.PAYE_RATE_1 },
		{ upTo: c.PAYE_BAND_2_LIMIT, rate: c.PAYE_RATE_2 },
		{ upTo: c.PAYE_BAND_3_LIMIT, rate: c.PAYE_RATE_3 },
		{ upTo: c.PAYE_BAND_4_LIMIT, rate: c.PAYE_RATE_4 },
		{ upTo: Infinity, rate: c.PAYE_TOP_RATE },
	];
}

export function paye(taxable) {
	let previous = 0;
	let tax = 0;
	const lines = [];
	for (const band of payeBands()) {
		if (taxable <= previous) break;
		const slice = Math.min(taxable, band.upTo) - previous;
		const amount = slice * band.rate / 100;
		lines.push({ from: previous, to: Math.min(taxable, band.upTo), rate: band.rate, amount: round2(amount) });
		tax += amount;
		previous = band.upTo;
	}
	const relief = constants().PERSONAL_RELIEF_MONTHLY;
	return { beforeRelief: round2(tax), relief, tax: round2(Math.max(0, tax - relief)), lines };
}

// A monthly payslip from gross pay. NSSF, SHIF and the Housing Levy are
// deducted before PAYE is worked out, as the Tax Laws (Amendment) Act 2024
// provides.
export function payslip(gross, pensionable = gross) {
	const pension = nssf(pensionable);
	const health = shif(gross);
	const levy = housingLevy(gross);
	const taxable = Math.max(0, gross - pension.total - health - levy);
	const tax = paye(taxable);
	const net = gross - pension.total - health - levy - tax.tax;
	return {
		gross,
		nssf: pension,
		shif: health,
		housingLevy: levy,
		taxable: round2(taxable),
		paye: tax,
		net: round2(net),
		employer: { nssf: pension.total, housingLevy: levy, total: round2(gross + pension.total + levy) },
	};
}

// The gross pay that gives a wanted net, by bisection. Net rises with gross
// everywhere, so this always converges.
export function grossForNet(target) {
	let low = 0;
	let high = Math.max(target * 3, 10000);
	for (let i = 0; i < 80; i += 1) {
		const mid = (low + high) / 2;
		if (payslip(mid).net < target) low = mid; else high = mid;
	}
	return Math.ceil(high);
}
