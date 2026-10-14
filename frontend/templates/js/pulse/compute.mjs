// Nairobi Pulse's arithmetic: from a question's tally to what each district is
// coloured, what the city as a whole says, and which districts stand out.
//
// Pure - no DOM, no fetching - so it can be driven from Node the way
// viability.mjs and map-placement.mjs are. Everything that decides what a
// reader is told is here, and every rule in it is about not overclaiming:
//
//   - A district below the threshold has no answers to colour, only a count.
//     The server does not send its answers at all (see api/_pulse/handlers.mjs);
//     this never invents them.
//   - The city's answer is held back until the city has the same number of
//     votes, for the same reason.
//   - An insight needs at least two districts above the threshold to compare,
//     and says nothing rather than something thin.
//   - Shades are steps, not a smooth ramp. Five steps can be told apart on a
//     phone in sunlight; a hundred cannot, and would claim a precision that
//     a few dozen votes do not have.

/** A count per answer, each with its share of the total. */
export function shares(question, counts = {}) {
	const total = question.options.reduce((sum, o) => sum + (counts[o.id] || 0), 0);
	return question.options.map((o, index) => ({
		id: o.id,
		label: o.label,
		value: o.value,
		index,
		count: counts[o.id] || 0,
		share: total ? (counts[o.id] || 0) / total : 0,
	}));
}

/** The answer with the most votes, its share, its lead over the next, and whether it is a tie. */
export function leading(question, counts = {}) {
	const ranked = shares(question, counts).sort((a, b) => b.count - a.count);
	const [first, second] = ranked;
	if (!first || !first.count) return null;
	return { ...first, margin: first.share - (second?.share || 0), tie: Boolean(second && second.count === first.count) };
}

/**
 * For a scale: the average answer, from -1 (every vote at the bad end) to +1
 * (every vote at the good end). Null for a choice, or with no votes.
 */
export function mood(question, counts = {}) {
	if (question.kind !== 'scale') return null;
	const top = Math.max(...question.options.map((o) => Math.abs(o.value || 0))) || 1;
	let total = 0;
	let sum = 0;
	for (const o of question.options) {
		const n = counts[o.id] || 0;
		total += n;
		sum += n * (o.value || 0);
	}
	return total ? sum / total / top : null;
}

export const moodWord = (score) => (score === null ? '' : score > 0.25 ? 'leans good' : score < -0.25 ? 'leans bad' : 'is split');

/** Five steps from 0 to 1: 0.2, 0.4 ... 1.0. A share is never shown as zero ink if it is above zero. */
export const step = (x) => (x <= 0 ? 0 : Math.min(1, Math.ceil(x * 5) / 5));

/**
 * Everything the page says about one district for one question.
 *   shown   its answers are published (it has reached the threshold)
 *   needs   how many more votes until they are
 */
export function districtView(question, results, id, population = 0) {
	const d = results?.districts?.[id];
	const total = d?.total || 0;
	const min = results?.min || 10;
	const view = {
		id,
		total,
		shown: Boolean(d?.counts),
		needs: d?.counts ? 0 : Math.max(0, min - total),
		perHundredThousand: population ? (total / population) * 100000 : null,
	};
	if (d?.counts) {
		view.shares = shares(question, d.counts);
		view.leading = leading(question, d.counts);
		view.mood = mood(question, d.counts);
	}
	return view;
}

/** The city as a whole: the same, from the question's overall counts. */
export function cityView(question, results) {
	const counts = Object.fromEntries((results?.options || []).map((o) => [o.id, o.count]));
	const total = results?.total || 0;
	const min = results?.min || 10;
	return {
		total,
		shown: total >= min,
		needs: Math.max(0, min - total),
		shares: shares(question, counts),
		leading: leading(question, counts),
		mood: mood(question, counts),
		districtsHeard: Object.keys(results?.districts || {}).length,
		districtsShown: Object.values(results?.districts || {}).filter((d) => d.counts).length,
	};
}

/**
 * The colour an answer is drawn in, everywhere it appears: its button, its
 * bars, and the map. A choice's answers are told apart by hue, in order. A
 * scale's are coloured by what they mean - green at the good end, laterite at
 * the bad, gold for the middle - so "Very good" never shares a colour family
 * with "Very bad", however many steps the scale has.
 */
export function toneOf(question, index) {
	if (question.kind !== 'scale') return `o${index + 1}`;
	const value = question.options[index]?.value || 0;
	const top = Math.max(...question.options.map((o) => Math.abs(o.value || 0))) || 1;
	if (value === 0) return 'mid';
	const strong = Math.abs(value) === top;
	return value > 0 ? (strong ? 'good' : 'good2') : (strong ? 'bad' : 'bad2');
}

/** The map's ways of colouring, for this question. */
export function modesFor(question) {
	const answers = question.options.map((o, index) => ({ id: `option:${o.id}`, label: o.label, index }));
	return question.kind === 'scale'
		? [{ id: 'mood', label: 'Mood' }, { id: 'leading', label: 'Top answer' }, { id: 'turnout', label: 'Turnout' }]
		: [{ id: 'leading', label: 'Top answer' }, ...answers, { id: 'turnout', label: 'Turnout' }];
}

export const defaultMode = (question) => (question.kind === 'scale' ? 'mood' : 'leading');

/**
 * How to paint one district: a class naming the colour and an opacity, or
 * `thin` (votes, but too few to show) or `empty` (none).
 */
export function paint(question, mode, view, turnoutScale = 1) {
	if (!view.total) return { tone: 'empty', opacity: 1 };
	if (mode === 'turnout') {
		return { tone: 'turnout', opacity: Math.max(0.2, step((view.perHundredThousand || 0) / (turnoutScale || 1))) };
	}
	if (!view.shown) return { tone: 'thin', opacity: 1 };
	if (mode === 'mood') {
		if (view.mood === null) return { tone: 'thin', opacity: 1 };
		const strength = Math.max(0.2, step(Math.abs(view.mood)));
		return { tone: view.mood > 0.05 ? 'good' : view.mood < -0.05 ? 'bad' : 'mid', opacity: Math.abs(view.mood) <= 0.05 ? 0.6 : strength };
	}
	if (mode.startsWith('option:')) {
		const option = view.shares.find((s) => s.id === mode.slice(7));
		return { tone: toneOf(question, option.index), opacity: Math.max(0.12, step(option.share)) };
	}
	// The top answer, darker the wider it won. A tie shows as split.
	const top = view.leading;
	if (!top || top.tie) return { tone: 'split', opacity: 0.6 };
	return { tone: toneOf(question, top.index), opacity: Math.max(0.35, Math.min(1, 0.35 + step(top.margin) * 0.65)) };
}

/** The busiest district's turnout, which the turnout shading is relative to. */
export function turnoutScale(views) {
	return Math.max(0, ...views.map((v) => v.perHundredThousand || 0));
}

const pct = (x) => `${Math.round(x * 100)}%`;

/**
 * A few plain sentences about how districts differ, from those above the
 * threshold only, and only when there are at least two of them.
 */
export function insights(question, views, city, names) {
	const shown = views.filter((v) => v.shown && v.leading);
	if (shown.length < 2) return [];
	const name = (v) => names[v.id] || v.id;
	const out = [];

	const united = [...shown].sort((a, b) => b.leading.share - a.leading.share)[0];
	out.push({ kind: 'united', district: united.id, title: 'Most of one mind', text: `${name(united)}: ${pct(united.leading.share)} say ${united.leading.label}.` });

	const contested = shown.filter((v) => v.shares.filter((s) => s.count).length > 1);
	if (contested.length) {
		const divided = [...contested].sort((a, b) => a.leading.margin - b.leading.margin)[0];
		if (divided.id !== united.id) {
			const [a, b] = [...divided.shares].sort((x, y) => y.count - x.count);
			out.push({ kind: 'divided', district: divided.id, title: 'Most divided', text: `${name(divided)}: ${a.label} ${pct(a.share)}, ${b.label} ${pct(b.share)}.` });
		}
	}

	if (question.kind === 'scale') {
		const moods = shown.filter((v) => v.mood !== null).sort((a, b) => b.mood - a.mood);
		if (moods.length >= 2 && moods[0].mood - moods[moods.length - 1].mood >= 0.2) {
			out.push({ kind: 'best', district: moods[0].id, title: 'Feels best', text: `${name(moods[0])} ${moodWord(moods[0].mood)}.` });
			out.push({ kind: 'worst', district: moods[moods.length - 1].id, title: 'Feels worst', text: `${name(moods[moods.length - 1])} ${moodWord(moods[moods.length - 1].mood)}.` });
		}
	} else if (city.leading) {
		const strongest = [...shown].sort((a, b) => (b.shares[city.leading.index].share - a.shares[city.leading.index].share))[0];
		if (strongest.id !== united.id) {
			out.push({ kind: 'strongest', district: strongest.id, title: `Strongest for ${city.leading.label}`, text: `${name(strongest)}: ${pct(strongest.shares[city.leading.index].share)}.` });
		}
	}

	// The district furthest from the city's own answer: half the summed gaps
	// between its shares and the city's, which reads as "how much of the vote
	// would have to move" to make them match.
	if (city.shown) {
		const gap = (v) => v.shares.reduce((sum, s, i) => sum + Math.abs(s.share - city.shares[i].share), 0) / 2;
		const outlier = [...shown].sort((a, b) => gap(b) - gap(a))[0];
		if (gap(outlier) >= 0.15 && !out.some((o) => o.district === outlier.id)) {
			out.push({ kind: 'outlier', district: outlier.id, title: 'Least like Nairobi', text: `${name(outlier)} differs from the city by ${pct(gap(outlier))} of its vote.` });
		}
	}
	return out;
}

/**
 * Two tallies of the same question, the newer kept. The edge serves results up
 * to ten seconds old, so a poll can come back behind the answer a vote just
 * returned; the page must never step backwards.
 */
export function newer(current, next) {
	if (!current || current.question !== next.question) return next;
	if (!next.updated_at) return current.updated_at ? current : next;
	if (!current.updated_at) return next;
	return next.updated_at >= current.updated_at ? next : current;
}
