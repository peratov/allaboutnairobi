// What a month of commuting costs by matatu, ride-hailing or your own car.

import { mount, numberField, headline, breakdown, note, money } from '/js/utils/tool-ui.mjs';

class CommuteCostCalculator extends HTMLElement {
	connectedCallback() {
		if (this.ready) return;
		this.ready = true;
		const state = { km: 12, days: 22, matatu: 80, rideKm: 45, rideBase: 150, fuel: 180, consumption: 9, parking: 300 };
		const redraw = mount(this, 'Commuting costs', () => [
			numberField({ label: 'Distance from home to work', value: state.km, step: '1', prefix: 'km', onInput: (v) => { state.km = v; redraw(); } }),
			numberField({ label: 'Days a month you commute', value: state.days, step: '1', prefix: '', onInput: (v) => { state.days = v; redraw(); } }),
			numberField({ label: 'Matatu fare, each way', value: state.matatu, step: '10', onInput: (v) => { state.matatu = v; redraw(); },
				hint: 'Add both fares if you change matatus on the way.' }),
			numberField({ label: 'Ride-hailing: price per km', value: state.rideKm, step: '5', onInput: (v) => { state.rideKm = v; redraw(); } }),
			numberField({ label: 'Ride-hailing: base fare per trip', value: state.rideBase, step: '10', onInput: (v) => { state.rideBase = v; redraw(); } }),
			numberField({ label: 'Petrol, per litre', value: state.fuel, step: '1', onInput: (v) => { state.fuel = v; redraw(); },
				hint: 'Use this month’s pump price, which EPRA sets on the 15th.' }),
			numberField({ label: 'Your car uses, per 100 km', value: state.consumption, step: '0.5', prefix: 'L', onInput: (v) => { state.consumption = v; redraw(); } }),
			numberField({ label: 'Parking a day', value: state.parking, step: '50', onInput: (v) => { state.parking = v; redraw(); } }),
		], () => {
			const trips = state.days * 2;
			const matatu = trips * state.matatu;
			const ride = trips * (state.rideBase + state.km * state.rideKm);
			const car = (trips * state.km) * state.consumption / 100 * state.fuel + state.days * state.parking;
			const cheapest = Math.min(matatu, ride, car);
			return [
				headline(money(cheapest), 'a month, the cheapest way'),
				breakdown([
					['Matatu', money(matatu), matatu === cheapest ? 'total' : ''],
					['Ride-hailing', money(ride), ride === cheapest ? 'total' : ''],
					['Your own car: fuel and parking', money(car), car === cheapest ? 'total' : ''],
				]),
				note('Ride-hailing prices rise with traffic, demand and rain, and the car figure leaves out insurance, servicing and wear, which usually add a lot. Time matters too: see Getting around Nairobi.'),
			];
		});
	}
}

customElements.define('commute-cost-calculator', CommuteCostCalculator);
