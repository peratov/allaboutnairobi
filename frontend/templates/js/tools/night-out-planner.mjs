// Night out planner: what an evening out in Nairobi will cost, each and as a
// group, with the ride home set aside first.
//
// All About Accra's planner builds itineraries from a file of real venues.
// Nairobi has no such file, and venue prices are not something to guess at,
// so this does the part that holds anywhere. You put in the prices you see on
// the menu and the ride-hailing app, and it works out the shares, a buffer,
// and the money to keep back for getting home. The starting prices are
// labelled as examples everywhere they appear.

import { mount, numberField, choice, headline, breakdown, note, money } from '/js/utils/tool-ui.mjs';

class NightOutPlanner extends HTMLElement {
	connectedCallback() {
		if (this.ready) return;
		this.ready = true;
		const state = {
			people: 4,
			drinks: 4,
			drinkPrice: 400,
			food: 1500,
			entry: 0,
			ride: 'ride',
			fare: 800,
			perCar: 4,
			buffer: 10,
		};
		const set = (key, round = false) => (v) => { state[key] = round ? Math.round(v) : v; redraw(); };

		const redraw = mount(this, 'Plan the night', () => [
			numberField({ label: 'People going', value: state.people, step: '1', prefix: '', onInput: set('people', true) }),
			numberField({ label: 'Drinks each', value: state.drinks, step: '1', prefix: '', onInput: set('drinks', true) }),
			numberField({ label: 'Price of a drink', value: state.drinkPrice, step: '50', onInput: set('drinkPrice'), hint: 'An example - use the menu price.' }),
			numberField({ label: 'Food each', value: state.food, step: '100', onInput: set('food'), hint: 'An example - a plate of nyama choma, or dinner first. 0 if none.' }),
			numberField({ label: 'Entry or cover charge each', value: state.entry, step: '100', onInput: set('entry'), hint: 'Clubs and events often charge at the door. 0 if none.' }),
			choice({
				label: 'Getting there and back', value: state.ride,
				options: [['ride', 'Ride-hailing or taxi'], ['matatu', 'Matatu'], ['driver', 'A sober driver']],
				onChange: (v) => { state.ride = v; redraw(); },
			}),
			numberField({ label: 'Fare each way, per car or per person on a matatu', value: state.fare, step: '50', onInput: set('fare'), hint: 'An example - check the app for your route. Late at night and in the rain it rises.' }),
			numberField({ label: 'People sharing a car', value: state.perCar, step: '1', prefix: '', onInput: set('perCar', true) }),
			numberField({ label: 'Buffer for rounds and surprises', value: state.buffer, step: '5', prefix: '%', onInput: set('buffer') }),
		], () => {
			const people = Math.max(1, state.people);
			// A sober driver has no fare; everyone still pays for food and the door.
			const drinks = state.drinks * state.drinkPrice;
			const out = drinks + state.food + state.entry;
			let fare = 0;
			if (state.ride === 'ride') fare = (state.fare * 2) / Math.max(1, Math.min(state.perCar, people));
			if (state.ride === 'matatu') fare = state.fare * 2;
			const buffer = (out * state.buffer) / 100;
			const each = out + fare + buffer;
			const homeFare = fare / 2;

			return [
				headline(money(each), 'each, for the night'),
				breakdown([
					[`Drinks (${state.drinks} at ${money(state.drinkPrice)})`, money(drinks)],
					state.food ? ['Food', money(state.food)] : null,
					state.entry ? ['Entry', money(state.entry)] : null,
					fare ? ['Getting there and back, your share', money(fare)] : null,
					state.buffer ? [`Buffer (${state.buffer}%)`, money(buffer)] : null,
					['Each', money(each), 'total'],
					people > 1 ? [`The group of ${people}`, money(each * people)] : null,
					homeFare ? ['Keep back for the ride home, each', money(homeFare)] : null,
				]),
				note('Set aside the fare home before the first round, in M-Pesa or cash you will not spend, and book the ride from inside the venue. Check the car and plate before you get in.'),
				state.ride === 'driver'
					? note('Whoever drives does not drink. Police run breathalyser checks at night, at weekends and over holidays.')
					: note('Do not drive after drinking. Police run breathalyser checks at night, at weekends and over holidays.'),
				note('The starting prices are examples, not quotes. Prices vary a lot between a local in the estates and a rooftop in Westlands, so put in what you see on the menu and in the app.'),
			];
		});
	}
}

customElements.define('night-out-planner', NightOutPlanner);
