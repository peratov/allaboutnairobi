// Night out planner.
//
// You say what you have and when, and it builds two or three real itineraries
// from the venues in content/geo/nightlife.yaml - times, stops, fares between
// them, and a total measured against the budget you gave it.
//
// The arithmetic is in js/utils/nightplan.mjs and is tested from Node. This
// file is the form and the results, and its one job beyond rendering is to
// keep saying that every cost is an estimate. A planner that prints
// "GHS 1,918" in a big font has implied a precision the underlying data does
// not have, so the figure is always framed as an estimate and the basis line
// from the data file is printed under every result.

import { cedis, element, parseAmount } from '/js/utils/format.mjs';
import { buildPlans, cheapestPossible } from '/js/utils/nightplan.mjs';

const DATA_URL = '/api/nightlife.json';

const VIBES = [
	['drinks', 'Drinks'],
	['food', 'Eat properly'],
	['live_music', 'Live music'],
	['dancing', 'Dancing'],
	['party', 'Big night'],
	['chill', 'Somewhere quiet'],
	['date', 'A date'],
	['social', 'With friends'],
	['premium', 'Somewhere smart'],
];

const TRANSPORT = [
	['ride', 'Ride-hailing'],
	['taxi', 'Taxi'],
	['trotro', 'Trotro'],
	['driving', 'Driving myself'],
	['walking', 'On foot'],
];

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const CATEGORY_LABEL = {
	restaurant: 'Restaurant',
	bar: 'Bar',
	lounge: 'Lounge',
	club: 'Club',
	live_music: 'Live music',
	entertainment: 'Entertainment',
};

function todayName() {
	// Ghana is on GMT year round, so the browser's own day is the right day.
	return DAYS[(new Date().getDay() + 6) % 7];
}

class NightOutPlanner extends HTMLElement {
	async connectedCallback() {
		if (this.rendered) return;
		this.rendered = true;

		this.replaceChildren(element('p', { class: 'tool-note', text: 'Loading the venues…' }));

		try {
			const response = await fetch(DATA_URL);
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			this.data = await response.json();
		} catch (error) {
			this.replaceChildren(element('p', { class: 'tool-note', text:
				'The venue list could not load. Every venue is listed further down this page.' }));
			console.warn('Night planner:', error);
			return;
		}

		this.state = {
			budget: 800,
			people: 2,
			day: todayName(),
			start: '19:30',
			end: '00:30',
			area: 'Osu',
			vibes: new Set(['drinks', 'social']),
			transport: 'ride',
			eatOut: true,
			active: 0,
		};

		this.replaceChildren();
		this.build();
		this.update();
	}

	field(uid, label, hint, control) {
		return element('div', { class: 'form-group' }, [
			element('label', { for: uid }, [
				document.createTextNode(label),
				hint ? element('small', { class: 'form-hint', text: hint }) : null,
			]),
			element('div', { class: 'input-group' }, [control]),
		]);
	}

	build() {
		const uid = Math.random().toString(36).slice(2, 7);
		const areas = [...new Set(this.data.venues.map((v) => v.area))].sort();

		const budget = element('input', {
			id: `budget-${uid}`,
			type: 'text',
			inputmode: 'numeric',
			value: String(this.state.budget),
			'data-clarity-mask': 'true',
			oninput: (event) => { this.state.budget = parseAmount(event.target.value); this.update(); },
		});

		const people = element('input', {
			id: `people-${uid}`,
			type: 'number', min: '1', max: '20', step: '1',
			value: String(this.state.people),
			oninput: (event) => {
				this.state.people = Math.max(1, parseInt(event.target.value, 10) || 1);
				this.update();
			},
		});

		const select = (id, options, selected, onchange) => {
			const el = element('select', { id, onchange });
			for (const [value, label] of options) {
				const option = element('option', { value, text: label });
				if (value === selected) option.selected = true;
				el.append(option);
			}
			return el;
		};

		const day = select(`day-${uid}`, DAYS.map((d) => [d, d]), this.state.day,
			(event) => { this.state.day = event.target.value; this.update(); });

		const area = select(`area-${uid}`, areas.map((a) => [a, a]), this.state.area,
			(event) => { this.state.area = event.target.value; this.update(); });

		const transport = select(`transport-${uid}`, TRANSPORT, this.state.transport,
			(event) => { this.state.transport = event.target.value; this.update(); });

		const time = (id, value, key) => element('input', {
			id, type: 'time', value,
			oninput: (event) => {
				if (event.target.value) { this.state[key] = event.target.value; this.update(); }
			},
		});

		// Vibes are checkboxes rather than a multi-select: a multi-select is
		// close to unusable on a phone, and this needs to work on one.
		const vibes = element('div', { class: 'night-vibes', role: 'group', 'aria-label': 'What kind of night' },
			VIBES.map(([value, label]) => {
				const box = element('input', {
					type: 'checkbox', id: `vibe-${value}-${uid}`, value,
					onchange: (event) => {
						if (event.target.checked) this.state.vibes.add(value);
						else this.state.vibes.delete(value);
						this.update();
					},
				});
				if (this.state.vibes.has(value)) box.checked = true;
				return element('label', { class: 'night-vibe', for: `vibe-${value}-${uid}` }, [
					box, document.createTextNode(label),
				]);
			})
		);

		const form = element('form', {}, [
			element('h4', { text: 'Plan the night' }),
			element('p', { class: 'input-instructions', text:
				'Everything below is an estimate. Nobody has checked these prices at the door.' }),
			this.field(`budget-${uid}`, 'Budget for the group (₵)', 'Everything: entry, drinks, food, fares', budget),
			this.field(`people-${uid}`, 'How many of you', null, people),
			this.field(`day-${uid}`, 'Which night', 'Some places only open at the weekend', day),
			this.field(`start-${uid}`, 'Out from', null, time(`start-${uid}`, this.state.start, 'start')),
			this.field(`end-${uid}`, 'Home by', null, time(`end-${uid}`, this.state.end, 'end')),
			this.field(`area-${uid}`, 'Starting from', null, area),
			this.field(`transport-${uid}`, 'Getting about by', null, transport),
			element('div', { class: 'form-group' }, [
				element('span', { class: 'label', text: 'What kind of night' }),
				vibes,
			]),
		]);

		form.addEventListener('submit', (event) => event.preventDefault());

		this.results = element('div', { class: 'tool-results', role: 'status', 'aria-live': 'polite' });
		this.append(form, this.results);
	}

	update() {
		const request = {
			budget: this.state.budget,
			people: this.state.people,
			start: this.state.start,
			end: this.state.end,
			day: this.state.day,
			startArea: this.state.area,
			transport: this.state.transport,
			vibes: [...this.state.vibes],
			eatOut: this.state.vibes.has('food'),
			hotspots: this.data.hotspots,
		};

		const plans = buildPlans(this.data.venues, request);
		this.results.replaceChildren();

		if (!plans.length) {
			this.renderNothing(request);
			return;
		}

		if (this.state.active >= plans.length) this.state.active = 0;
		const plan = plans[this.state.active];

		if (plans.length > 1) {
			this.results.append(
				element('div', { class: 'night-tabs', role: 'tablist', 'aria-label': 'Plan options' },
					plans.map((p, index) => element('button', {
						type: 'button',
						role: 'tab',
						class: `night-tab${index === this.state.active ? ' is-on' : ''}`,
						'aria-selected': String(index === this.state.active),
						onclick: () => { this.state.active = index; this.update(); },
					}, [
						element('strong', { text: p.title }),
						element('span', { text: `${cedis(p.totals.total)}` }),
					]))
				)
			);
		}

		this.renderPlan(plan, request);
	}

	renderNothing(request) {
		const floor = cheapestPossible(this.data.venues, request);

		this.results.append(
			element('div', { class: 'tool-headline' }, [
				element('span', { class: 'tool-headline-value', text: 'Nothing fits' }),
				element('span', { class: 'tool-headline-label', text: floor
					? 'Not on that budget, anyway'
					: 'Not in that window' }),
			])
		);

		if (floor) {
			this.results.append(
				element('p', { class: 'tool-note', text:
					`The cheapest version of this night is about ${cedis(floor.total)} for ` +
					`${floor.stops} stops` +
					(floor.withoutFood < floor.total
						? `, or ${cedis(floor.withoutFood)} if you eat before you come out.`
						: '.') }),
				element('p', { class: 'tool-note', text:
					'Fewer people, an earlier start or a cheaper area all move that figure more ' +
					'than changing the mood does.' })
			);
		} else {
			this.results.append(
				element('p', { class: 'tool-note', text:
					'No amount of money fixes this one. Either the window is too short for two ' +
					'stops, or the places that suit what you asked for are shut on a ' +
					`${request.day}. Try a longer evening or another night.` })
			);
		}
		this.appendBasis();
	}

	renderPlan(plan, request) {
		const over = plan.totals.left < 0;

		this.results.append(
			element('div', { class: 'tool-headline' }, [
				element('span', { class: 'tool-headline-value', text: `${cedis(plan.totals.total)}` }),
				element('span', { class: 'tool-headline-label', text:
					`estimated for ${request.people === 1 ? 'you' : `${request.people} of you`}` +
					` · about ${cedis(plan.perPerson)} each` }),
			]),
			element('p', { class: `night-budget${over ? ' is-over' : ''}`, text: over
				? `That is ${cedis(Math.abs(plan.totals.left))} over your budget.`
				: `${cedis(plan.totals.left)} of your ${cedis(request.budget)} left over.` })
		);

		// ---- the night itself
		const items = [];
		plan.stops.forEach((stop, index) => {
			if (stop.travelIn && stop.travelIn.km > 0.1) {
				items.push(element('li', { class: 'night-move' }, [
					element('span', { class: 'night-move-time', text: `${stop.travelIn.minutes} min` }),
					element('span', { text:
						`${stop.travelIn.label}, ${stop.travelIn.km} km` +
						(stop.travelIn.cost > 0 ? ` · about ${cedis(stop.travelIn.cost)}` : ' · free') }),
				]));
			}

			const v = stop.venue;
			const bits = [`${stop.drinksEach} ${stop.drinksEach === 1 ? 'drink' : 'drinks'} each`];
			if (stop.ate) bits.push('a meal');
			if (v.entry > 0) bits.push(`${cedis(v.entry)} in`);

			items.push(element('li', { class: 'night-stop' }, [
				element('span', { class: 'night-stop-time', text: `${stop.arrive}–${stop.leave}` }),
				element('div', { class: 'night-stop-body' }, [
					element('h5', { class: 'night-stop-name' }, [
						document.createTextNode(`${index + 1}. ${v.name}`),
						element('span', { class: 'night-stop-area', text: v.area }),
					]),
					element('p', { class: 'night-stop-what', text:
						`${(v.categories || []).map((c) => CATEGORY_LABEL[c] || c).join(' · ')}` }),
					element('p', { class: 'night-stop-what', text: bits.join(', ') }),
					stop.cost.minimumApplied
						? element('p', { class: 'night-stop-flag', text:
							`Minimum spend of ${cedis(v.minimumSpend)} applies, so that is the floor.` })
						: null,
				]),
				element('span', { class: 'night-stop-cost', text: `${cedis(stop.cost.total)}` }),
			]));
		});

		items.push(element('li', { class: 'night-move' }, [
			element('span', { class: 'night-move-time', text: `${plan.home.minutes} min` }),
			element('span', { text: plan.home.cost > 0
				? `${plan.home.label} home, about ${cedis(plan.home.cost)}`
				: `${plan.home.label} home` }),
		]));

		this.results.append(
			element('h5', { class: 'tool-section-heading', text:
				`${plan.startsAt} to ${plan.endsAt} · ${plan.stops.length} stops` }),
			element('ol', { class: 'night-run' }, items)
		);

		// ---- where the money goes
		const row = (label, value, className = '') =>
			element('tr', { class: className }, [
				element('th', { scope: 'row', text: label }),
				element('td', { text: `${cedis(value)}` }),
			]);

		this.results.append(
			element('h5', { class: 'tool-section-heading', text: 'Where the money goes' }),
			element('div', { class: 'table-wrapper' }, [
				element('table', { class: 'tool-breakdown' }, [
					element('tbody', {}, [
						plan.totals.entry > 0 ? row('Entry', plan.totals.entry) : null,
						row('Drinks', plan.totals.drinks),
						plan.totals.food > 0 ? row('Food', plan.totals.food) : null,
						row('Getting about', plan.totals.travel),
						row('Estimated total', plan.totals.total, 'total'),
					].filter(Boolean)),
				]),
			])
		);

		for (const warning of plan.warnings) {
			this.results.append(element('p', { class: 'tool-note', text: warning }));
		}

		this.appendBasis();
	}

	appendBasis() {
		this.results.append(
			element('p', { class: 'tool-note', text: this.data.meta.basis }),
			element('p', { class: 'tool-note', text:
				`Venue list last checked ${this.data.meta.lastVerified}. Ring ahead for anything ` +
				'that matters - a cover charge, a dress code, or whether the live band is on.' })
		);
	}
}

customElements.define('night-out-planner', NightOutPlanner);
