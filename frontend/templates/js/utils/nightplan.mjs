// Build a night out in Accra from a budget, a clock and a mood.
//
// Pure arithmetic, no DOM, so it can be driven from Node - the same
// arrangement as viability.mjs, and for the same reason: a planner that
// quietly stops respecting the budget should be caught by a test rather than
// by somebody in Osu at midnight.
//
// The shape of the problem: pick two to four real venues that are open when
// you want them, suit the mood you asked for, are near enough to each other to
// move between, and together cost less than you said you had. That is a small
// bin-packing problem with a clock attached, and it is solved greedily here
// rather than optimally - an optimal itinerary is not what anybody wants at
// 8pm, and greedy with a sensible ordering gets there.
//
// Every cost is an ESTIMATE. The venue data says so, the tool says so on
// screen, and nothing in here should imply otherwise.

// Accra roads are not straight. Multiplying the straight-line distance gets
// far closer to a real journey than the crow flies does, and it costs nothing.
const ROAD_FACTOR = 1.35;

const TRANSPORT = {
	// kmh is the average including traffic and waiting, not a road speed.
	//
	// maxKm is how far that mode will actually carry you between two stops.
	// Walking needs it most: walking costs nothing, so the scoring had no
	// reason to avoid it, and the first version cheerfully planned an
	// 81-minute walk from Jamestown to Osu. Nobody does that at night on roads
	// with no pavement.
	walking: { kmh: 4.5, perKm: 0, base: 0, maxKm: 1.6, label: 'Walking' },
	trotro: { kmh: 12, perKm: 0.8, base: 3, maxKm: 14, label: 'Trotro' },
	taxi: { kmh: 16, perKm: 6, base: 10, maxKm: 30, label: 'Taxi' },
	ride: { kmh: 16, perKm: 5, base: 8, maxKm: 30, label: 'Ride-hailing' },
	driving: { kmh: 18, perKm: 2.2, base: 0, maxKm: 30, label: 'Driving' },
};

// How the three offered plans differ. Same engine, different priorities.
export const PLAN_STYLES = [
	{
		key: 'best_match',
		title: 'Best match',
		blurb: 'Closest to the mood you asked for.',
		weights: { vibe: 1.0, value: 0.35, travel: 0.5 },
	},
	{
		key: 'best_value',
		title: 'Best value',
		blurb: 'The same night for less.',
		weights: { vibe: 0.6, value: 1.0, travel: 0.4 },
	},
	{
		key: 'least_moving',
		title: 'Least moving about',
		blurb: 'Stays in one area. Less time in traffic.',
		weights: { vibe: 0.7, value: 0.3, travel: 1.2 },
	},
];

export function distanceKm(a, b) {
	const R = 6371;
	const dLat = ((b.lat - a.lat) * Math.PI) / 180;
	const dLng = ((b.lng - a.lng) * Math.PI) / 180;
	const lat1 = (a.lat * Math.PI) / 180;
	const lat2 = (b.lat * Math.PI) / 180;
	const h =
		Math.sin(dLat / 2) ** 2 +
		Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
	return 2 * R * Math.asin(Math.sqrt(h));
}

export function leg(from, to, mode) {
	const t = TRANSPORT[mode] || TRANSPORT.ride;
	const km = distanceKm(from, to) * ROAD_FACTOR;
	return {
		mode,
		label: t.label,
		km: Math.round(km * 10) / 10,
		minutes: Math.max(5, Math.round((km / t.kmh) * 60)),
		cost: km <= 0.05 ? 0 : Math.round(t.base + km * t.perKm),
		// The planner drops any stop this says is out of reach.
		tooFar: km > t.maxKm,
	};
}

export function toMinutes(hhmm) {
	const [h, m] = hhmm.split(':').map(Number);
	return h * 60 + m;
}

export function toClock(minutes) {
	const m = ((minutes % 1440) + 1440) % 1440;
	return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/**
 * Is the venue open for the whole of [from, to)?
 *
 * Opening hours here cross midnight constantly - a club that opens at 23:00
 * and closes at 05:30 is the normal case, not the edge case - so everything is
 * worked in minutes from the start of the evening rather than clock time, and
 * a close time earlier than an open time simply means tomorrow.
 */
export function isOpen(venue, from, to) {
	const opens = toMinutes(venue.opens);
	let closes = toMinutes(venue.closes);
	if (closes <= opens) closes += 1440;

	// The window is measured from the same evening, so a 01:00 arrival is
	// 1500 rather than 60.
	let start = from;
	let end = to;
	if (start < opens - 720) { start += 1440; end += 1440; }

	return start >= opens && end <= closes;
}

export function isOpenOn(venue, day) {
	if (!day || !Array.isArray(venue.days) || !venue.days.length) return true;
	return venue.days.includes(day);
}

/** What one venue costs a group, for the stay the plan gives it. */
export function stopCost(venue, { people, drinksEach, eat }) {
	const entry = venue.entry * people;
	const drinks = venue.avgDrink * drinksEach * people;
	const food = eat && venue.avgFood > 0 ? venue.avgFood * people : 0;
	const spend = entry + drinks + food;

	// A minimum spend is a floor on the bill for the table, not a charge on
	// top of it, and it is per group rather than per head - which is why a
	// bottle-service minimum hurts two people far more than eight.
	const total = Math.max(spend, venue.minimumSpend || 0);
	return {
		entry,
		drinks,
		food,
		total: Math.round(total),
		minimumApplied: total > spend,
	};
}

function vibeScore(venue, wanted) {
	if (!wanted.length) return 0.5;
	const hits = wanted.filter((v) => venue.vibes.includes(v)).length;
	return hits / wanted.length;
}

// Cheap relative to the rest of the list, on a 0..1 scale.
function valueScore(venue, all) {
	const costs = all.map((v) => v.avgDrink + v.entry);
	const min = Math.min(...costs);
	const max = Math.max(...costs);
	if (max === min) return 0.5;
	return 1 - ((venue.avgDrink + venue.entry) - min) / (max - min);
}

/**
 * Build one plan.
 *
 * Greedy: start from the strongest candidate for the opening slot, then at
 * each step pick the best next venue given where you already are, what time it
 * is, and what is left of the budget. Reserves the fare home before spending
 * anything, because being unable to get home is a worse outcome than one fewer
 * stop.
 */
export function buildPlan(venues, request, style) {
	const {
		budget, people, start, end, vibes = [], transport = 'ride',
		startArea, day, eatOut = true, hotspots = [], maxStops = 4,
	} = request;

	const startMin = toMinutes(start);
	let endMin = toMinutes(end);
	if (endMin <= startMin) endMin += 1440;

	const open = venues.filter((v) => isOpenOn(v, day));
	if (!open.length) return null;

	// Where the night starts from. The hotspots list exists for exactly this -
	// "Osu Oxford Street" is where somebody means when they say they are
	// starting in Osu - and a venue in the right area is the fallback.
	const origin =
		(hotspots || []).find((h) => h.area === startArea) ||
		open.find((v) => v.area === startArea) ||
		open[0];
	const here0 = { lat: origin.lat, lng: origin.lng };
	let here = here0;

	// Hold back the fare home before anything is spent. Being stranded is a
	// worse outcome than one fewer stop, so this comes off the top.
	//
	// Reserved against a typical cross-town trip rather than the actual last
	// leg, because the last leg is not known until the plan is built - and
	// under-reserving is the failure that matters.
	const HOME_KM = 9;
	const homeReserve = Math.max(
		25,
		leg({ lat: 0, lng: 0 }, { lat: HOME_KM / 111, lng: 0 }, transport).cost,
	);
	let remaining = budget - homeReserve;

	const stops = [];
	const used = new Set();
	let clock = startMin;

	while (clock < endMin && stops.length < maxStops) {
		const timeLeft = endMin - clock;
		if (timeLeft < 45) break;

		let best = null;
		for (const venue of open) {
			if (used.has(venue.id)) continue;

			// The first leg is a real journey too. Treating it as free was what
			// let a walking night open in Jamestown and then have nowhere to
			// walk to - the reachability rule never applied to stop one.
			const move = leg(here, venue, transport);

			if (move.tooFar) continue;

			const arrive = clock + move.minutes;
			const stay = Math.min(venue.typicalStayMin, endMin - arrive);
			if (stay < 40) continue;
			if (!isOpen(venue, arrive, arrive + stay)) continue;

			// Eat at the first stop if it does food and the night is long
			// enough to bother - nobody wants a main course at 1am.
			const eat = eatOut && venue.avgFood > 0 && stops.length === 0;
			const drinksEach = Math.max(1, Math.round(stay / 55));
			const cost = stopCost(venue, { people, drinksEach, eat });

			if (cost.total + move.cost > remaining) continue;

			const spent = cost.total + move.cost;
			const score =
				style.weights.vibe * vibeScore(venue, vibes) +
				style.weights.value * valueScore(venue, open) +
				style.weights.travel * (1 / (1 + move.km)) -
				// A gentle push towards spending the budget across the night
				// rather than on the first door.
				0.15 * (spent / Math.max(1, remaining));

			if (!best || score > best.score) {
				best = { venue, move, arrive, stay, cost, drinksEach, eat, score };
			}
		}

		if (!best) break;

		stops.push({
			venue: best.venue,
			arrive: toClock(best.arrive),
			leave: toClock(best.arrive + best.stay),
			stayMin: best.stay,
			drinksEach: best.drinksEach,
			ate: best.eat,
			cost: best.cost,
			travelIn: best.move,
		});

		used.add(best.venue.id);
		remaining -= best.cost.total + best.move.cost;
		clock = best.arrive + best.stay;
		here = best.venue;
	}

	if (stops.length < 2) return null;

	const home = leg(here, here0, transport);
	const spend = stops.reduce((a, s) => a + s.cost.total, 0);
	const travel = stops.reduce((a, s) => a + (s.travelIn ? s.travelIn.cost : 0), 0) + home.cost;

	return {
		key: style.key,
		title: style.title,
		blurb: style.blurb,
		stops,
		home,
		startsAt: stops[0].arrive,
		endsAt: stops[stops.length - 1].leave,
		totals: {
			entry: stops.reduce((a, s) => a + s.cost.entry, 0),
			drinks: stops.reduce((a, s) => a + s.cost.drinks, 0),
			food: stops.reduce((a, s) => a + s.cost.food, 0),
			travel,
			total: spend + travel,
			left: budget - (spend + travel),
		},
		perPerson: Math.round((spend + travel) / Math.max(1, people)),
		warnings: warningsFor(stops, request, endMin),
	};
}

function warningsFor(stops, request, endMin) {
	const out = [];
	const last = stops[stops.length - 1];

	if (toMinutes(last.leave) < endMin - 90 && stops.length < 4) {
		out.push('This finishes earlier than your end time. A bigger budget would buy another stop.');
	}
	if (stops.some((s) => s.cost.minimumApplied)) {
		out.push('One of these has a minimum spend, so the figure is the floor rather than the bill.');
	}
	if (request.transport === 'trotro' && toMinutes(last.leave) > toMinutes('22:00')) {
		out.push('Trotros thin out late. Budget for a taxi or a ride home instead.');
	}
	if (request.transport === 'driving' && request.vibes.includes('drinks')) {
		out.push('Somebody has to drive. Ghana enforces drink-driving, and the cost of getting it wrong is not on this page.');
	}
	return out;
}

/** The three plans, worst-fitting ones dropped. */
export function buildPlans(venues, request) {
	const seen = new Set();
	const plans = [];

	for (const style of PLAN_STYLES) {
		const plan = buildPlan(venues, request, style);
		if (!plan) continue;
		// Two styles landing on the same venues is a duplicate, not a choice.
		const signature = plan.stops.map((s) => s.venue.id).join('>');
		if (seen.has(signature)) continue;
		seen.add(signature);
		plans.push(plan);
	}

	return plans;
}

/**
 * The cheapest night this request could buy, ignoring the budget.
 *
 * "No plan possible" on its own is a dead end. Knowing that the same night
 * needs about GHS 520 turns it into a decision - raise the budget, drop the
 * meal, go out earlier - which is the difference between a tool and a wall.
 *
 * Returns null when the request fails for a reason money cannot fix, such as
 * a one-hour window or a night when everything wanted is shut.
 */
export function cheapestPossible(venues, request) {
	// Two stops, because the question is "what is the floor", not "what is the
	// cheapest four-stop night" - with no budget the greedy loop keeps adding
	// stops and reports a number well above the real minimum.
	const relaxed = { ...request, budget: Infinity, maxStops: 2 };
	const style = {
		key: 'cheapest',
		title: 'Cheapest',
		blurb: '',
		weights: { vibe: 0.2, value: 2.0, travel: 0.4 },
	};
	const plan = buildPlan(venues, relaxed, style);
	if (!plan) return null;

	return {
		total: plan.totals.total,
		stops: plan.stops.length,
		withoutFood: plan.totals.total - plan.totals.food,
	};
}
