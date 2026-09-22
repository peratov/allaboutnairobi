// Ghanaian import charges, in the order customs applies them.
//
// The thing everyone gets wrong is that duty is not the cost. Duty is the
// first of about seven charges, and VAT is applied near the end to a base that
// already includes most of the others. A 20% duty rate lands well north of 20%.
//
// One assumption is worth stating, because it is a judgement call rather than
// arithmetic: the VAT base here is CIF + duty + overage penalty + the levies
// charged as taxes (ECOWAS, AU, EXIM, Special Import). The inspection fee and
// the network charge are service charges and are added afterwards, outside the
// VAT base. Real ICUMS assessments vary at the margin. This gets you the right
// order of magnitude, which is the number people actually need before they
// commit to a purchase.

import { vatBreakdown } from '/js/utils/tax.mjs';

function constants() {
	return window.accraConstants || {};
}

const rate = (value, percentage) => (value * (percentage || 0)) / 100;

/**
 * Every charge on an import, from a CIF value and a duty rate.
 *
 * @param {number} cif              Cost, insurance and freight, in cedis
 * @param {number} dutyRate         Import duty, as a percentage
 * @param {number} overageRate      Vehicle overage penalty on CIF, as a percentage
 * @param {boolean} specialLevy     Whether the Special Import Levy applies
 */
export function importCharges({ cif, dutyRate, overageRate = 0, specialLevy = false }) {
	const c = constants();

	const duty = rate(cif, dutyRate);
	const overage = rate(cif, overageRate);

	const ecowas = rate(cif, c.ECOWAS_LEVY_RATE);
	const au = rate(cif, c.AU_IMPORT_LEVY_RATE);
	const exim = rate(cif, c.EXIM_LEVY_RATE);
	const special = specialLevy ? rate(cif, c.SPECIAL_IMPORT_LEVY_RATE) : 0;

	// Service charges: outside the VAT base.
	const inspection = rate(cif, c.IMPORT_INSPECTION_FEE_RATE);
	const network = rate(cif, c.IMPORT_NETWORK_CHARGE_RATE);

	const taxLevies = ecowas + au + exim + special;
	const vatBase = cif + duty + overage + taxLevies;
	const vat = vatBreakdown(vatBase);

	const serviceCharges = inspection + network;
	const total = vat.total + serviceCharges;

	return {
		cif,
		duty,
		overage,
		ecowas,
		au,
		exim,
		special,
		taxLevies,
		inspection,
		network,
		serviceCharges,
		vatBase,
		nhil: vat.nhil,
		getfund: vat.getfund,
		vat: vat.vat,
		charges: total - cif,
		total,
		// What the whole stack costs as a percentage of CIF - the number worth
		// remembering, because it is roughly double the headline duty rate.
		effectiveRate: cif > 0 ? ((total - cif) / cif) * 100 : 0,
	};
}

/** Duty rate for a passenger vehicle, by engine capacity in cc. */
export function vehicleDutyRate(cc) {
	const c = constants();
	if (cc <= 1900) return c.VEHICLE_DUTY_UNDER_1900CC;
	if (cc <= 3000) return c.VEHICLE_DUTY_1900_TO_3000CC;
	return c.VEHICLE_DUTY_OVER_3000CC;
}

/**
 * Overage penalty rate, from the year of manufacture.
 *
 * Age is counted from the year the vehicle was built, not the year it was
 * bought, and the bands step rather than taper - being one year older can cost
 * a great deal more.
 */
export function overagePenaltyRate(yearOfManufacture, now = new Date()) {
	const c = constants();
	const age = now.getFullYear() - yearOfManufacture;

	if (age <= (c.VEHICLE_OVERAGE_THRESHOLD_YEARS || 10)) return 0;
	if (age <= 12) return c.VEHICLE_OVERAGE_PENALTY_10_TO_12;
	if (age <= 15) return c.VEHICLE_OVERAGE_PENALTY_12_TO_15;
	return c.VEHICLE_OVERAGE_PENALTY_OVER_15;
}
