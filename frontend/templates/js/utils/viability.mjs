/**
 * Scoring a business idea against a district, and being honest about it.
 *
 * The score is a RANKING, not a forecast. Every factor is turned into the
 * district's percentile position among the 29 Greater Accra assemblies, and
 * the score is a weighted mean of those positions. So 80 means "this district
 * is near the top of Greater Accra on the things this trade needs", never
 * "you have an 80% chance". Nothing here knows about your street, your
 * landlord, your competition or you.
 *
 * Ranks rather than raw values because the units do not compare: population
 * density spans three orders of magnitude across these districts and rent is
 * a five-point band. Averaging those directly would let density silently
 * decide everything, which is the same trap the map's noise layer avoids.
 *
 * The weights are the invented part, and they are small integers on purpose:
 * they are a claim about what a trade needs, they are arguable, and the tool
 * shows every factor's contribution so a reader can disagree with the
 * specific number rather than the whole answer.
 */

/**
 * The measures, and what a high value means for a business.
 *
 * `rent` appears twice on purpose. A high-rent district has more money about
 * AND costs more to open in; which of those matters depends entirely on what
 * you are selling, so the two readings are separate factors and each trade
 * weights them itself.
 */
export const FACTORS = {
	footfall: {
		field: 'peoplePerKm2',
		label: 'Passing trade',
		high: 'Dense - many people within walking distance',
		low: 'Sparse - customers have to travel to you',
	},
	marketSize: {
		field: 'population',
		label: 'Market size',
		high: 'A large population in the district',
		low: 'A small population in the district',
	},
	commerce: {
		field: 'premisesPerKm2',
		label: 'Commercial activity',
		high: 'Already a trading area',
		low: 'Mostly residential or rural',
	},
	spendingPower: {
		field: 'rent',
		label: 'Spending power nearby',
		high: 'Higher rents, so more disposable income about',
		low: 'Lower rents, and customers who count every cedi',
	},
	premisesCost: {
		field: 'rent',
		invert: true,
		label: 'Cost of premises',
		high: 'Cheap to rent a shop here',
		low: 'Dear to rent a shop here',
	},
	informalEconomy: {
		field: 'informalPct',
		label: 'Informal economy',
		high: 'Mostly cash, mostly self-employed',
		low: 'More formal employment',
	},
	workingPopulation: {
		field: 'participationPct',
		label: 'Working population',
		high: 'Many people in work, so weekday trade',
		low: 'Fewer people in work',
	},
	children: {
		field: 'under15Pct',
		label: 'Children',
		high: 'A young district',
		low: 'Fewer children than average',
	},
	women: {
		field: 'femalePct',
		label: 'Women',
		high: 'More women than the Accra average',
		low: 'Fewer women than the Accra average',
	},
	roads: {
		field: 'roadPerKm2',
		label: 'Major roads',
		high: 'Well served by main roads and vehicle traffic',
		low: 'Few major roads',
	},
	lowCompetition: {
		field: 'premisesPerKm2',
		invert: true,
		label: 'Room in the market',
		high: 'Few businesses per square kilometre',
		low: 'Crowded with other premises',
	},
	space: {
		field: 'peoplePerKm2',
		invert: true,
		label: 'Space to operate',
		high: 'Room, and neighbours further away',
		low: 'Too dense for anything that needs land',
	},
};

/**
 * The trades.
 *
 * `weights` are what this trade needs. `blind` is what the census cannot see
 * and is printed with every result, because a screening score that does not
 * say what it left out invites being read as a verdict.
 */
export const BUSINESSES = [
	{
		id: 'barbershop',
		name: 'Barbershop',
		group: 'Everyday services',
		summary: 'A chair, clippers, power and a spot people walk past.',
		weights: { footfall: 3, premisesCost: 2, informalEconomy: 1, marketSize: 1 },
		blind: ['How many barbers are already on that street', 'Whether the spot has reliable power', 'Your own following - barbering is a repeat trade built on trust'],
		guide: '/guides/start-a-barbershop-in-accra',
	},
	{
		id: 'hair-salon',
		name: 'Hair salon',
		group: 'Everyday services',
		summary: 'Braiding, relaxing and styling, at a higher ticket than a barbershop.',
		weights: { footfall: 2, spendingPower: 3, women: 1, marketSize: 1 },
		blind: ['Whether the district already has a salon everyone goes to', 'Water supply, which decides whether you can wash hair at all', 'How much of your trade will come to your home instead'],
		guide: '/guides/start-a-hair-salon-in-accra',
	},
	{
		id: 'kenkey',
		name: 'Kenkey or waakye seller',
		group: 'Food',
		summary: 'Cooked staples sold from a stand, a table or a window.',
		weights: { footfall: 3, premisesCost: 3, informalEconomy: 2, workingPopulation: 1 },
		blind: ['Who already sells on that corner, and how long they have', 'Access to water and fuel', 'Whether the spot is yours to trade on'],
		guide: '/guides/start-a-kenkey-business-in-accra',
	},
	{
		id: 'chop-bar',
		name: 'Chop bar',
		group: 'Food',
		summary: 'Sit-down local food, cooked in quantity, sold at lunch.',
		weights: { workingPopulation: 3, footfall: 2, premisesCost: 2, informalEconomy: 1 },
		blind: ['Lunchtime foot traffic specifically, which is not the same as population', 'Kitchen space and extraction', 'FDA and assembly requirements for food premises'],
		guide: '/guides/start-a-chop-bar-in-accra',
	},
	{
		id: 'provisions',
		name: 'Provisions shop',
		group: 'Retail',
		summary: 'A container or a room selling everyday household goods.',
		weights: { footfall: 3, premisesCost: 2, marketSize: 2, lowCompetition: 1 },
		blind: ['How many shops are already on the street', 'Your buying price, which decides the whole margin', 'Whether a nearby market undercuts you'],
		guide: '/guides/start-a-provisions-shop-in-accra',
	},
	{
		id: 'phone-repair',
		name: 'Phone repair and accessories',
		group: 'Retail',
		summary: 'Screens, batteries, cases, and unlocking.',
		weights: { footfall: 2, commerce: 3, marketSize: 2 },
		blind: ['Whether there is a repair cluster nearby - these trades gain from being together, not apart', 'Your parts supply', 'Your actual skill, which customers judge fast'],
		guide: '/guides/start-a-phone-repair-business-in-accra',
	},
	{
		id: 'tailoring',
		name: 'Tailoring and dressmaking',
		group: 'Everyday services',
		summary: 'Sewing to measure, repairs and uniforms.',
		weights: { spendingPower: 2, marketSize: 2, footfall: 1, premisesCost: 2 },
		blind: ['Your finishing, which is the whole reputation', 'Whether you can hold a delivery date', 'Funeral and wedding seasons, which do more for this trade than geography'],
		guide: '/guides/start-a-tailoring-business-in-accra',
	},
	{
		id: 'creche',
		name: 'Creche or daycare',
		group: 'Regulated',
		summary: 'Daytime care for children too young for school.',
		weights: { children: 3, spendingPower: 2, marketSize: 2, workingPopulation: 2 },
		blind: ['Registration and inspection, which are not optional', 'Whether parents in the district work away from home', 'Safe outdoor space, which the census cannot see'],
		guide: '/guides/start-a-creche-in-accra',
	},
	{
		id: 'pharmacy',
		name: 'Chemical shop or pharmacy',
		group: 'Regulated',
		summary: 'Over-the-counter medicines, and dispensing if licensed.',
		weights: { marketSize: 3, footfall: 2, spendingPower: 1, lowCompetition: 1 },
		blind: ['Pharmacy Council licensing, which decides whether you may open at all', 'Distance to the nearest existing chemical shop', 'Whether a pharmacist is on the premises'],
		guide: '/guides/start-a-chemical-shop-in-accra',
	},
	{
		id: 'car-wash',
		name: 'Car wash',
		group: 'Vehicle trades',
		summary: 'Washing and detailing, usually off a main road.',
		weights: { roads: 3, spendingPower: 2, premisesCost: 1, space: 1 },
		blind: ['Water supply and drainage, which is the binding constraint', 'Whether the site is visible from the road', 'Car ownership, which the census does not record here'],
		guide: '/guides/start-a-car-wash-in-accra',
	},
	{
		id: 'boutique',
		name: 'Fashion boutique',
		group: 'Retail',
		summary: 'Ready-to-wear clothing, often sold on Instagram as much as in the shop.',
		weights: { spendingPower: 3, footfall: 2, commerce: 1 },
		blind: ['That much of this trade now happens on Instagram, where the district matters far less', 'Your buying trips and stock cost', 'Whether Kantamanto undercuts your price point'],
		guide: '/guides/start-a-boutique-in-accra',
	},
	{
		id: 'poultry',
		name: 'Poultry or egg production',
		group: 'Land-based',
		summary: 'Birds for eggs or meat, which needs land rather than footfall.',
		weights: { space: 3, premisesCost: 3, marketSize: 1 },
		blind: ['Feed cost, which is most of the economics and moves with the cedi', 'Veterinary access and disease risk', 'How far the eggs have to travel to a buyer'],
		guide: '/guides/start-a-poultry-farm-near-accra',
	},
];

const clamp01 = (value) => Math.min(1, Math.max(0, value));

/**
 * Where a value sits among all of them, from 0 (lowest) to 1 (highest).
 *
 * Ties share the midpoint of the positions they occupy, so five districts
 * with no major roads at all do not get five different ranks for the same
 * fact. Ayawaso Central genuinely has no motorway, trunk, primary or
 * secondary road in OpenStreetMap, so this case is real, not theoretical.
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

/** One factor's contribution for one district. */
function scoreFactor(key, districts, district) {
	const factor = FACTORS[key];
	const values = districts.map((d) => d[factor.field]);
	const raw = percentileRank(values, district[factor.field]);
	const rank = factor.invert ? 1 - raw : raw;

	return {
		key,
		label: factor.label,
		rank,
		percent: Math.round(rank * 100),
		value: district[factor.field],
		reading: rank >= 0.6 ? factor.high : rank <= 0.4 ? factor.low : 'Around the Accra middle',
	};
}

export const BANDS = [
	{ min: 70, label: 'Among the better districts for it', tone: 'strong' },
	{ min: 55, label: 'Above average for it', tone: 'good' },
	{ min: 45, label: 'Middling for it', tone: 'fair' },
	{ min: 30, label: 'Below average for it', tone: 'weak' },
	{ min: 0, label: 'Among the weaker districts for it', tone: 'poor' },
];

export function bandFor(score) {
	return BANDS.find((band) => score >= band.min) ?? BANDS[BANDS.length - 1];
}

/**
 * Score one district for one trade.
 *
 * Returns the score, its band, and every factor that produced it - the
 * breakdown is not decoration, it is the argument. A single number with no
 * workings is exactly the kind of thing this site exists to refuse.
 */
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

/** Every district for one trade, best first. */
export function rankDistricts(business, districts) {
	return districts
		.map((district) => scoreDistrict(business, district, districts))
		.sort((a, b) => b.score - a.score || a.district.name.localeCompare(b.district.name));
}

export function findBusiness(id) {
	return BUSINESSES.find((business) => business.id === id);
}
