// AFCON 2027 matchday planner: when to leave for a Nairobi stadium, roughly how
// long the trip takes, what it costs the group, and the kickoff in Swahili time.
//
// The venues and starting points come from content/geo/afcon.yaml, embedded by
// the tool page as #afcon-data. Travel times are a model, not a route planner:
// straight-line distance stretched by a road factor, at a Nairobi traffic
// speed, plus the parts of a big match people forget - the walk from the
// drop-off, security and the queue at the gate.

import { mount, numberField, choice, headline, breakdown, note, money, element } from '/js/utils/tool-ui.mjs';

const ROAD_FACTOR = 1.4;      // road distance over straight-line distance, typical in Nairobi
const SPEED = { normal: 22, big: 15 };   // km/h door to drop-off, in traffic
const WALK_SPEED = 4.5;
const MATATU_WAIT = 20;       // minutes waiting and changing
const LAST_MILE = { normal: 20, big: 35 };
const SECURITY = { normal: 30, big: 60 };
const IN_SEAT_BUFFER = 30;

const NUMBERS = ['kumi na mbili', 'moja', 'mbili', 'tatu', 'nne', 'tano', 'sita', 'saba', 'nane', 'tisa', 'kumi', 'kumi na moja'];

function afconData() {
	const node = document.getElementById('afcon-data');
	return node ? JSON.parse(node.textContent) : { nairobi_venues: [], stay_areas: [] };
}

function haversineKm(a, b) {
	const rad = (d) => d * Math.PI / 180;
	const dLat = rad(b.lat - a.lat);
	const dLon = rad(b.lon - a.lon);
	const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
	return 2 * 6371 * Math.asin(Math.sqrt(h));
}

function clock(minutes) {
	const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
	return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

function duration(minutes) {
	const m = Math.round(minutes);
	if (m < 60) return `${m} min`;
	return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
}

// Kiswahili time counts from sunrise: 7am is saa moja (the first hour).
export function swahiliTime(hours, minutes) {
	let h = hours;
	let tail = '';
	if (minutes === 15) tail = ' na robo';
	else if (minutes === 30) tail = ' na nusu';
	else if (minutes === 45) { tail = ' kasoro robo'; h = (h + 1) % 24; }
	else if (minutes) tail = ` na dakika ${minutes}`;
	const period = h >= 5 && h < 12 ? 'asubuhi' : h >= 12 && h < 16 ? 'mchana' : h >= 16 && h < 19 ? 'jioni' : 'usiku';
	return `saa ${NUMBERS[((h - 6) % 12 + 12) % 12]}${tail} ${period}`;
}

class AfconMatchdayPlanner extends HTMLElement {
	connectedCallback() {
		if (this.ready) return;
		this.ready = true;
		const data = afconData();
		const venues = data.nairobi_venues;
		const areas = data.stay_areas;
		if (!venues.length || !areas.length) return;

		const state = { area: 'Westlands', venue: venues[0].id, kickoff: '19:00', match: 'big', mode: 'ride', people: 2, farePerKm: 45, base: 150, surge: 1.3, matatu: 100 };

		const areaSelect = element('select', { id: 'afcon-area', onchange: (e) => { state.area = e.target.value; redraw(); } },
			areas.map((a) => element('option', { value: a.name, text: a.name, ...(a.name === state.area ? { selected: 'selected' } : {}) })));
		const timeInput = element('input', { id: 'afcon-kickoff', type: 'time', value: state.kickoff, step: '900',
			oninput: (e) => { state.kickoff = e.target.value || '19:00'; redraw(); } });

		const redraw = mount(this, 'Plan your matchday', () => [
			choice({ label: 'Stadium', value: state.venue,
				options: venues.map((v) => [v.id, v.name.replace(/, Kasarani$/, '').replace('International Sports Centre', 'Intl Sports Centre')]),
				onChange: (v) => { state.venue = v; redraw(); } }),
			element('div', { class: 'form-group' }, [element('label', { for: 'afcon-area', text: 'Where you are setting off from' }), areaSelect]),
			element('div', { class: 'form-group' }, [element('label', { for: 'afcon-kickoff', text: 'Kickoff time' }), timeInput,
				element('span', { class: 'input-instructions', text: 'Use the time on your ticket or the official fixture list.' })]),
			choice({ label: 'What kind of match?', value: state.match,
				options: [['big', 'Sell-out: Kenya, opening, knockout'], ['normal', 'Group match, not Kenya']],
				onChange: (v) => { state.match = v; redraw(); } }),
			choice({ label: 'How you are getting there', value: state.mode,
				options: [['ride', 'Ride-hailing or taxi'], ['matatu', 'Matatu'], ['walk', 'Walking']],
				onChange: (v) => { state.mode = v; redraw(); } }),
			numberField({ label: 'People in your group', value: state.people, step: '1', prefix: '', min: '1', onInput: (v) => { state.people = Math.max(1, Math.round(v)); redraw(); } }),
			numberField({ label: 'Ride-hailing: price per km', value: state.farePerKm, step: '5', onInput: (v) => { state.farePerKm = v; redraw(); } }),
			numberField({ label: 'Ride-hailing: base fare', value: state.base, step: '10', onInput: (v) => { state.base = v; redraw(); } }),
			numberField({ label: 'Matchday price surge', value: state.surge, step: '0.1', prefix: '×', onInput: (v) => { state.surge = Math.max(1, v); redraw(); },
				hint: 'Prices rise when thousands leave at once. 1.3 means 30% more.' }),
			numberField({ label: 'Matatu fare, each ride', value: state.matatu, step: '10', onInput: (v) => { state.matatu = v; redraw(); } }),
		], () => {
			const venue = venues.find((v) => v.id === state.venue) || venues[0];
			const area = areas.find((a) => a.name === state.area) || areas[0];
			const km = haversineKm(area, venue) * ROAD_FACTOR;
			const big = state.match === 'big';
			const [kh, km2] = state.kickoff.split(':').map(Number);
			const kickoff = kh * 60 + km2;

			let travel;
			let cost;
			let costLabel;
			const walkable = km <= 5;
			if (state.mode === 'walk') {
				travel = km / WALK_SPEED * 60;
				cost = 0;
				costLabel = 'Walking, both ways';
			} else if (state.mode === 'matatu') {
				travel = km / (big ? SPEED.big : SPEED.normal) * 60 + MATATU_WAIT;
				const rides = km > 8 ? 2 : 1;
				cost = state.matatu * rides * 2 * state.people;
				costLabel = `Matatu, ${rides} ride${rides > 1 ? 's' : ''} each way, for ${state.people}`;
			} else {
				travel = km / (big ? SPEED.big : SPEED.normal) * 60;
				const cars = Math.ceil(state.people / 4);
				const oneWay = (state.base + km * state.farePerKm) * state.surge;
				cost = oneWay * 2 * cars;
				costLabel = `Ride-hailing, ${cars} car${cars > 1 ? 's' : ''} there and back`;
			}

			const lastMile = state.mode === 'walk' ? 0 : (big ? LAST_MILE.big : LAST_MILE.normal);
			const security = big ? SECURITY.big : SECURITY.normal;
			const total = travel + lastMile + security + IN_SEAT_BUFFER;
			const leave = Math.floor((kickoff - total) / 5) * 5;
			const gate = kickoff - IN_SEAT_BUFFER - security;

			const rows = [
				[`Distance by road, roughly`, `${km.toFixed(1)} km`],
				[state.mode === 'walk' ? 'Walk' : 'Journey to the drop-off point', duration(travel)],
				lastMile ? ['Drop-off to the gates, through the crowds', duration(lastMile)] : null,
				['Security and queueing at the gate', duration(security)],
				['Finding your seat before kickoff', duration(IN_SEAT_BUFFER)],
				['Join the queue at the gates by', clock(gate)],
				['Kickoff', clock(kickoff), 'total'],
			];

			return [
				headline(clock(leave), `leave ${area.name} for ${venue.name}`),
				breakdown(rows),
				headline(money(cost), costLabel),
				element('p', { class: 'afcon-swahili-time' }, [
					element('strong', { text: 'Kickoff in Swahili time: ' }),
					document.createTextNode(swahiliTime(kh, km2)),
					element('span', { class: 'tool-note', text: ' - Kenyans count the hours from sunrise, so saa moja (the first hour) is 7am or 7pm. Worth knowing when someone says the match is at "saa tatu".' }),
				]),
				state.mode === 'walk' && !walkable
					? note('That is a long walk. Walking suits Nyayo from the CBD, South B or Madaraka; for anything further, take a matatu or ride-hailing to a drop-off point.')
					: null,
				element('p', { class: 'afcon-tool-links' }, [
					element('a', { href: `/map#place/${venue.map_id}`, text: `${venue.name} on the map` }),
					document.createTextNode(' · '),
					element('a', { href: '/guides/afcon-2027-stadiums-in-nairobi', text: 'Stadium guide' }),
				]),
				note('An estimate from distance and typical Nairobi traffic, not a live route. Organisers set road closures and drop-off zones on matchdays - follow their instructions and the police on the day. After the final whistle, expect 45 to 90 minutes to get clear of the stadium area.'),
			];
		});
	}
}

customElements.define('afcon-matchday-planner', AfconMatchdayPlanner);
