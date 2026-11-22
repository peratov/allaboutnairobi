/**
 * Scoring a business idea against a Nairobi sub-county, honestly.
 *
 * The score is a RANKING, not a forecast. Each factor becomes the
 * sub-county's percentile position among Nairobi's 11 census sub-counties,
 * and the score is a weighted mean of those positions. So 80 means "this
 * sub-county is near the top of Nairobi on the things this trade needs",
 * never "you have an 80% chance". Nothing here knows about your street, your
 * landlord, your competition or you.
 *
 * It uses ranks rather than raw values because the units do not compare.
 * Density runs from a few thousand to tens of thousands of people per km²,
 * while the others are percentages. Averaging them directly would let density
 * decide everything.
 *
 * Every figure is from the 2019 Kenya Population and Housing Census (KNBS),
 * for the census sub-counties: the same figures /map shows. Nothing is mixed
 * in from constituencies or listings, so all 11 are measured the same way.
 *
 * The weights are the invented part. They are small integers on purpose:
 * each is a claim about what a trade needs, they are arguable, and the tool
 * shows every factor's contribution so a reader can disagree with a specific
 * number rather than the whole answer. Ported from All About Accra.
 */

/**
 * The measures, and what a high value means for a business.
 *
 * Household computer ownership appears twice on purpose. It is the census's
 * best sign of spending power. It also points, the other way round, to where
 * premises are likely cheaper. Which of the two matters depends on the trade,
 * so each is its own factor and each trade weights them itself.
 */
export const FACTORS = {
	footfall: {
		field: 'density',
		label: 'Passing trade',
		high: 'Dense - many people within walking distance',
		low: 'Spread out - customers have to travel to you',
	},
	marketSize: {
		field: 'population',
		label: 'Market size',
		high: 'A large population in the sub-county',
		low: 'A smaller population in the sub-county',
	},
	spendingPower: {
		field: 'computerPct',
		label: 'Spending power nearby',
		high: 'More households own a computer - more money about',
		low: 'Fewer households own a computer - customers who count every shilling',
	},
	premisesCost: {
		field: 'computerPct',
		invert: true,
		label: 'Cost of premises',
		high: 'A lower-income area, where premises tend to be cheaper',
		low: 'A better-off area, where premises tend to cost more',
	},
	children: {
		field: 'under15Pct',
		label: 'Children',
		high: 'A young sub-county, with many children',
		low: 'Fewer children than the Nairobi average',
	},
	women: {
		field: 'femalePct',
		label: 'Women',
		high: 'More women than the Nairobi average',
		low: 'Fewer women than the Nairobi average',
	},
	youngAdults: {
		field: 'age20to34Pct',
		label: 'Young adults',
		high: 'Many people aged 20 to 34',
		low: 'Fewer people aged 20 to 34',
	},
	renters: {
		field: 'rentingPct',
		label: 'Renting households',
		high: 'Mostly renters - people in flats who buy services in',
		low: 'More owner-occupiers',
	},
	online: {
		field: 'internetPct',
		label: 'Internet use',
		high: 'Most people use the internet - easy to reach online',
		low: 'Fewer people online - word of mouth and the shopfront matter more',
	},
	offline: {
		field: 'internetPct',
		invert: true,
		label: 'People without their own internet',
		high: 'Many people not online at home - they need somewhere to print, browse and pay',
		low: 'Most people already online at home',
	},
	water: {
		field: 'pipedPct',
		label: 'Piped water',
		high: 'More homes on piped water - a sign water is easier to get',
		low: 'Fewer homes on piped water - plan for buying or storing water',
	},
	gasUsers: {
		field: 'cleanCookingPct',
		label: 'Homes cooking with gas or electricity',
		high: 'Most homes cook with gas or electricity - steady refills',
		low: 'Fewer homes on gas or electricity yet',
	},
	space: {
		field: 'density',
		invert: true,
		label: 'Space to operate',
		high: 'Room, and neighbours further away',
		low: 'Too dense for anything that needs land',
	},
};

const SMALL = '/guides/small-business-ideas-in-nairobi';

/**
 * The trades.
 *
 * `weights` is what this trade needs. `blind` is what the census cannot see.
 * It is printed with every result, because a screening score that does not say
 * what it left out invites being read as a verdict.
 */
export const BUSINESSES = [
	{
		id: 'barbershop',
		name: 'Barbershop',
		group: 'Everyday services',
		weights: { footfall: 3, premisesCost: 2, youngAdults: 1, marketSize: 1 },
		blind: ['How many barbers are already on that street', 'Whether the spot has reliable power, or a backup', 'Your own following - barbering is a repeat trade built on trust'],
		guide: '/guides/hair-salons-and-barbers-in-nairobi',
	},
	{
		id: 'salon',
		name: 'Hair and beauty salon',
		group: 'Everyday services',
		weights: { spendingPower: 3, footfall: 2, women: 1, water: 1 },
		blind: ['Whether the area already has a salon everyone goes to', 'Water at the premises, which decides whether you can wash hair at all', 'How much trade goes to stylists who visit clients at home'],
		guide: '/guides/hair-salons-and-barbers-in-nairobi',
	},
	{
		id: 'laundry',
		name: 'Laundry and dry cleaning',
		group: 'Everyday services',
		weights: { renters: 2, youngAdults: 2, spendingPower: 2, water: 2, footfall: 1 },
		blind: ['Whether mama fua already do most of the washing locally', 'Water and power costs, which make or break the margin', 'Pick-up and delivery, which matter more than the shopfront'],
		guide: '/guides/laundry-and-dry-cleaning-in-nairobi',
	},
	{
		id: 'kibanda',
		name: 'Food kiosk or kibanda',
		group: 'Food',
		weights: { footfall: 3, premisesCost: 3, youngAdults: 1, marketSize: 1 },
		blind: ['Who already sells on that corner, and how long they have', 'The county hygiene licence and medical certificates', 'Lunchtime foot traffic, which is not the same as population'],
		guide: '/guides/starting-a-food-business-in-nairobi',
	},
	{
		id: 'cafe',
		name: 'Café or restaurant',
		group: 'Food',
		weights: { spendingPower: 3, footfall: 2, youngAdults: 1, online: 1 },
		blind: ['Daytime office workers, which census figures for residents miss', 'Kitchen space, ventilation and the fire certificate', 'How much trade comes through delivery apps instead'],
		guide: '/guides/starting-a-food-business-in-nairobi',
	},
	{
		id: 'duka',
		name: 'Duka or provisions shop',
		group: 'Retail',
		weights: { footfall: 3, marketSize: 2, premisesCost: 2, renters: 1 },
		blind: ['How many dukas are already on the street', 'Your buying price, which decides the whole margin', 'Whether a supermarket or market nearby undercuts you'],
		guide: SMALL,
	},
	{
		id: 'mitumba',
		name: 'Mitumba (second-hand clothes)',
		group: 'Retail',
		weights: { footfall: 3, premisesCost: 2, youngAdults: 1, marketSize: 1 },
		blind: ['The quality of the bales you buy, which is most of the profit', 'Whether you can trade near a busy market or stage', 'County fees and the spot you are allowed to sell from'],
		guide: '/guides/starting-a-mitumba-business',
	},
	{
		id: 'phone',
		name: 'Phone accessories and repair',
		group: 'Retail',
		weights: { footfall: 2, youngAdults: 2, online: 2, marketSize: 1 },
		blind: ['Whether there is a repair cluster nearby - these trades gain from being together', 'Your parts supply, and genuine versus fake stock', 'Your actual skill, which customers judge fast'],
		guide: SMALL,
	},
	{
		id: 'gas',
		name: 'Cooking gas (LPG) shop',
		group: 'Retail',
		weights: { gasUsers: 3, footfall: 2, marketSize: 2 },
		blind: ['Licensing and storage rules for gas, which are strict', 'Delivery by boda boda, which can matter more than location', 'Which cylinder brands people nearby already use'],
		guide: SMALL,
	},
	{
		id: 'mpesa',
		name: 'M-Pesa agent',
		group: 'Money and services',
		weights: { footfall: 3, marketSize: 2, premisesCost: 1, offline: 1 },
		blind: ['How many agents are already within sight', 'Your float, which limits how much business you can take', 'Security, since you hold cash'],
		guide: '/guides/becoming-an-mpesa-agent',
	},
	{
		id: 'cyber',
		name: 'Cyber café and printing',
		group: 'Money and services',
		weights: { offline: 3, footfall: 2, youngAdults: 2 },
		blind: ['Nearby schools, colleges and government offices, which bring most of the printing', 'Power cuts, and whether you can afford a backup', 'How many people now do the same on their phones'],
		guide: SMALL,
	},
	{
		id: 'daycare',
		name: 'Daycare or preschool',
		group: 'Regulated',
		weights: { children: 3, spendingPower: 2, youngAdults: 2, marketSize: 1 },
		blind: ['Registration and inspection, which are not optional', 'Whether parents in the area work away from home', 'Safe outdoor space, which the census cannot see'],
		guide: '/guides/daycare-and-preschool-in-nairobi',
	},
	{
		id: 'chemist',
		name: 'Chemist or pharmacy',
		group: 'Regulated',
		weights: { marketSize: 3, footfall: 2, children: 1, spendingPower: 1 },
		blind: ['Pharmacy and Poisons Board licensing, which decides whether you may open at all', 'Distance to the nearest existing chemist', 'Whether a pharmacist or pharmaceutical technologist is on the premises'],
		guide: '/guides/pharmacies-and-medicines-in-nairobi',
	},
	{
		id: 'car-wash',
		name: 'Car wash',
		group: 'Vehicle and land',
		weights: { spendingPower: 2, water: 3, space: 2 },
		blind: ['Car ownership, which the census figures used here do not include', 'Water supply and drainage, the binding constraint', 'Whether the site is visible from a main road'],
		guide: SMALL,
	},
	{
		id: 'poultry',
		name: 'Poultry and eggs',
		group: 'Vehicle and land',
		weights: { space: 3, premisesCost: 2, marketSize: 1 },
		blind: ['Feed cost, which is most of the economics', 'County rules on keeping livestock in town', 'Veterinary access and disease risk'],
		guide: '/guides/starting-a-poultry-farm-near-nairobi',
	},
];

const clamp01 = (value) => Math.min(1, Math.max(0, value));

/**
 * Where a value sits among all of them, from 0 (lowest) to 1 (highest). Ties
 * share the midpoint of the positions they occupy.
 */
export function percentileRank(values, value) {
	const numbers = values.filter((n) => typeof n === 'number' && Number.isFinite(n));
	if (numbers.length < 2 || typeof value !== 'number' || !Number.isFinite(value)) return 0.5;
	let below = 0;
	let equal = 0;
	for (const n of numbers) {
		if (n < value) below += 1;
		else if (n === value) equal += 1;
	}
	return clamp01((below + (equal - 1) / 2) / (numbers.length - 1));
}

function scoreFactor(key, places, place) {
	const factor = FACTORS[key];
	const raw = percentileRank(places.map((p) => p[factor.field]), place[factor.field]);
	const rank = factor.invert ? 1 - raw : raw;
	return {
		key,
		label: factor.label,
		rank,
		percent: Math.round(rank * 100),
		value: place[factor.field],
		reading: rank >= 0.6 ? factor.high : rank <= 0.4 ? factor.low : 'Around the Nairobi middle',
	};
}

export const BANDS = [
	{ min: 70, label: 'Among the better sub-counties for it', tone: 'strong' },
	{ min: 55, label: 'Above average for it', tone: 'good' },
	{ min: 45, label: 'Middling for it', tone: 'fair' },
	{ min: 30, label: 'Below average for it', tone: 'weak' },
	{ min: 0, label: 'Among the weaker sub-counties for it', tone: 'poor' },
];

export function bandFor(score) {
	return BANDS.find((band) => score >= band.min) ?? BANDS[BANDS.length - 1];
}

/** Score one sub-county for one trade, with every factor that produced it. */
export function scoreDistrict(business, district, districts) {
	const entries = Object.entries(business.weights);
	const totalWeight = entries.reduce((sum, [, weight]) => sum + weight, 0);
	const factors = entries
		.map(([key, weight]) => ({ ...scoreFactor(key, districts, district), weight }))
		.sort((a, b) => b.weight - a.weight || b.rank - a.rank);
	const weighted = factors.reduce((sum, factor) => sum + factor.rank * factor.weight, 0);
	const score = Math.round((weighted / totalWeight) * 100);
	return { district, business, score, band: bandFor(score), factors };
}

/** Every sub-county for one trade, best first. */
export function rankDistricts(business, districts) {
	return districts
		.map((district) => scoreDistrict(business, district, districts))
		.sort((a, b) => b.score - a.score || a.district.name.localeCompare(b.district.name));
}

export function findBusiness(id) {
	return BUSINESSES.find((business) => business.id === id);
}
