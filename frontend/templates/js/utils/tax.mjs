// Ghanaian payroll arithmetic.
//
// The band widths and rates come from window.accraConstants, which is written
// by _layout.html from content/constants.yaml. When the budget moves a band,
// this file does not change.

const constants = () => window.accraConstants || {};

/**
 * PAYE on a monthly taxable income, using the graduated bands in the First
 * Schedule of the Income Tax Act 2015 (Act 896).
 *
 * Returns the total tax and the per-band breakdown, because "why is my tax
 * that much" is the actual question people arrive with.
 */
export function payeOnMonthlyIncome(taxableIncome) {
	const bands = constants().PAYE_BANDS || [];
	let remaining = Math.max(0, taxableIncome);
	let total = 0;
	const breakdown = [];

	for (const band of bands) {
		if (remaining <= 0) break;
		// The final entry has a null width: everything above it, at the top rate.
		const width = band.width === null ? remaining : Math.min(remaining, band.width);
		const tax = (width * band.rate) / 100;

		breakdown.push({ amount: width, rate: band.rate, tax });
		total += tax;
		remaining -= width;
	}

	return { total, breakdown, untaxedRemainder: Math.max(0, remaining) };
}

/**
 * Full net pay calculation for an employee.
 *
 * Order matters, and it is the part people get wrong: SSNIT comes off the
 * BASIC salary first, and PAYE is charged on what is left plus any allowances.
 * Tier 3 contributions are deducted before tax too, up to the relief cap.
 */
export function netPay({ basic, allowances = 0, tier3 = 0 }) {
	const c = constants();

	const ssnitEmployee = (basic * c.SSNIT_EMPLOYEE_RATE) / 100;
	const ssnitEmployer = (basic * c.SSNIT_EMPLOYER_RATE) / 100;

	// Tier 3 relief is capped as a share of basic salary. Anything above the cap
	// still leaves your pocket, it simply is not deductible.
	const tier3Cap = (basic * c.TIER_3_MAX_RELIEF_RATE) / 100;
	const tier3Deductible = Math.min(tier3, tier3Cap);
	const tier3Excess = Math.max(0, tier3 - tier3Cap);

	const taxableIncome = Math.max(0, basic + allowances - ssnitEmployee - tier3Deductible);
	const { total: paye, breakdown } = payeOnMonthlyIncome(taxableIncome);

	const net = basic + allowances - ssnitEmployee - tier3Deductible - tier3Excess - paye;
	const gross = basic + allowances;

	return {
		gross,
		basic,
		allowances,
		ssnitEmployee,
		ssnitEmployer,
		tier3: tier3Deductible + tier3Excess,
		tier3Deductible,
		tier3Excess,
		taxableIncome,
		paye,
		breakdown,
		net,
		effectiveRate: gross > 0 ? (paye / gross) * 100 : 0,
		totalDeductions: ssnitEmployee + paye + tier3Deductible + tier3Excess,
		costToEmployer: gross + ssnitEmployer,
	};
}

/**
 * VAT and its two levies on a net price.
 *
 * Under the Value Added Tax Act 2025 (Act 1151), from 1 January 2026, VAT,
 * NHIL and GETFund are all charged on the same base - the value of the supply
 * - so nothing compounds and the effective rate is their plain sum. Under the
 * 2013 Act the levies came first and VAT was charged on top of them; this
 * function did that until 2026-09-22.
 */
export function vatBreakdown(netPrice) {
	const c = constants();
	const nhil = (netPrice * c.NHIL_RATE) / 100;
	const getfund = (netPrice * c.GETFUND_RATE) / 100;
	const vat = (netPrice * c.VAT_RATE) / 100;
	const total = netPrice + nhil + getfund + vat;

	return {
		net: netPrice,
		nhil,
		getfund,
		levies: nhil + getfund,
		vatBase: netPrice,
		vat,
		total,
		effectiveRate: netPrice > 0 ? ((total - netPrice) / netPrice) * 100 : 0,
	};
}

/** Work back from a VAT-inclusive shelf price to the net price. */
export function vatFromGross(grossPrice) {
	const c = constants();
	const multiplier = 1 + c.VAT_EFFECTIVE_RATE / 100;
	return vatBreakdown(grossPrice / multiplier);
}

/**
 * The SSNIT old-age pension, as SSNIT actually computes it.
 *
 * Two things drive it and neither is your final salary:
 *
 *   The pension right - a percentage that starts at 37.5% once you have the
 *   180-month minimum and grows 1.125% for every further year, to a 60%
 *   ceiling. Contributing past the ceiling year buys nothing.
 *
 *   The best-36-months average - not your last salary, not your average
 *   salary. The best 36 months of contribution salary in your record.
 *
 * Taking it before 60 cuts it permanently, by a factor per age.
 *
 * `averageSalary` is whatever the caller can supply for that best-36 average.
 * A calculator can only offer today's basic salary, which answers "what would
 * this be worth in today's money" rather than "what will I be paid" - the
 * difference is decades of inflation, and the page has to say so.
 */
export function ssnitPension({ averageSalary, yearsContributed, retirementAge }) {
	const c = constants();

	const minYears = c.SSNIT_MIN_CONTRIBUTION_YEARS;
	const years = Math.max(0, yearsContributed);
	const qualifies = years >= minYears;

	// Below the minimum there is no pension at all - the contributions come
	// back as a lump sum instead, which is a different benefit and not this.
	const pensionRight = qualifies
		? Math.min(
			c.SSNIT_PENSION_RIGHT_MAX,
			c.SSNIT_PENSION_RIGHT_MIN + (years - minYears) * c.SSNIT_PENSION_RIGHT_PER_YEAR
		)
		: 0;

	const atCeiling = pensionRight >= c.SSNIT_PENSION_RIGHT_MAX;
	const yearsToCeiling = Math.max(0, c.SSNIT_MAX_CONTRIBUTION_YEARS - years);

	const factors = c.SSNIT_EARLY_FACTORS || {};
	const ageFactor = factors[String(retirementAge)] ?? 100;

	const fullPension = (averageSalary * pensionRight) / 100;
	const pension = (fullPension * ageFactor) / 100;

	return {
		qualifies,
		minYears,
		years,
		pensionRight,
		atCeiling,
		yearsToCeiling,
		ageFactor,
		reduced: ageFactor < 100,
		fullPension,
		pension,
		replacementRate: averageSalary > 0 ? (pension / averageSalary) * 100 : 0,
	};
}

/**
 * What the three tiers take each month, and who pays which part.
 *
 * The 18.5% is split 13.5% to SSNIT itself and 5% to a privately managed Tier
 * 2 scheme. The split that matters to a payslip is a different one: 5.5% comes
 * out of your pay and 13% is paid by the employer on top of it.
 */
export function pensionContributions({ basic, tier3Rate = 0 }) {
	const c = constants();
	const tier3 = (basic * Math.max(0, tier3Rate)) / 100;

	return {
		employee: (basic * c.SSNIT_EMPLOYEE_RATE) / 100,
		employer: (basic * c.SSNIT_EMPLOYER_RATE) / 100,
		total: (basic * c.SSNIT_TOTAL_RATE) / 100,
		tier1: (basic * c.TIER_1_RATE) / 100,
		tier2: (basic * c.TIER_2_RATE) / 100,
		tier3,
		tier3Cap: (basic * c.TIER_3_MAX_RELIEF_RATE) / 100,
		tier3Deductible: Math.min(tier3, (basic * c.TIER_3_MAX_RELIEF_RATE) / 100),
	};
}
