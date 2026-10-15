// The home page's two live pieces, both redone against the reader's clock in
// East Africa Time rather than the day the site was built:
//
//   <nairobi-now>   the strip under the hero - the time in Nairobi, this
//                   month's rains, the next public holiday, what is coming
//                   into season and the AFCON countdown;
//   <home-seasons>  the Explore card's photos of what is good this month.
//
// Both arrive rendered for the build day, so without JavaScript they are a
// day or a month stale rather than empty. Their data is in the page:
// #home-seasons-data (twelve months of tiles and the rains) and
// #home-holidays-data (the next year of public holidays).

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
	'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_MS = 86400000;

// Kenya keeps East Africa Time all year, UTC+3 with no summer time, so the
// UTC fields of a date shifted three hours are Nairobi's wall clock.
const eatNow = () => new Date(Date.now() + 3 * 3600000);

function json(id) {
	try {
		return JSON.parse(document.getElementById(id).textContent);
	} catch {
		return null;
	}
}

function element(tag, className, text) {
	const node = document.createElement(tag);
	if (className) node.className = className;
	if (text != null) node.textContent = text;
	return node;
}

// --- the seasons card ----------------------------------------------------------

function tile(t, base) {
	const node = element('span', `explore-food-tile is-${t.status}`);
	const img = new Image(t.w, t.h);
	img.src = `${base}/staticimages/food/${t.id}-thumb.webp`;
	img.alt = '';
	img.decoding = 'async';
	node.append(img, element('span', 'explore-food-name', t.name), element('span', 'explore-food-label', t.label));
	return node;
}

class HomeSeasons extends HTMLElement {
	connectedCallback() {
		const data = json('home-seasons-data');
		const m = eatNow().getUTCMonth() + 1;
		if (!data || String(m) === this.dataset.month) return;
		const tiles = data.months[m];
		if (!tiles || !tiles.length) return;
		this.querySelector('[data-tiles]').replaceChildren(...tiles.map((t) => tile(t, this.dataset.base || '')));
		this.closest('.explore-card')?.querySelectorAll('[data-month-name]').forEach((node) => {
			node.textContent = MONTHS[m - 1];
		});
		this.dataset.month = String(m);
	}
}

// --- the strip -----------------------------------------------------------------

function greeting(hour) {
	if (hour < 5) return 'Late night in Nairobi';
	if (hour < 12) return 'Morning in Nairobi';
	if (hour < 17) return 'Afternoon in Nairobi';
	if (hour < 21) return 'Evening in Nairobi';
	return 'Night in Nairobi';
}

function inDays(n) {
	if (n === 0) return 'today';
	if (n === 1) return 'tomorrow';
	if (n < 14) return `in ${n} days`;
	return `in ${Math.round(n / 7)} weeks`;
}

class NairobiNow extends HTMLElement {
	connectedCallback() {
		if (this.timer) return;
		this.seasons = json('home-seasons-data');
		this.holidays = json('home-holidays-data') || [];
		this.afcon = new Date(`${this.dataset.afcon}T00:00:00+03:00`).getTime();
		this.render();
		this.classList.add('is-live');
		// The clock shows minutes, so it needs to tick only on the minute.
		const tick = () => {
			this.render();
			this.timer = setTimeout(tick, 60000 - (Date.now() % 60000) + 50);
		};
		this.timer = setTimeout(tick, 60000 - (Date.now() % 60000) + 50);
		this.onVisible = () => { if (!document.hidden) this.render(); };
		document.addEventListener('visibilitychange', this.onVisible);
	}

	disconnectedCallback() {
		clearTimeout(this.timer);
		this.timer = null;
		document.removeEventListener('visibilitychange', this.onVisible);
	}

	set(name, text) {
		const node = this.querySelector(`[data-${name}]`);
		if (node && node.textContent !== text) node.textContent = text;
		return node;
	}

	render() {
		const now = eatNow();
		const hh = String(now.getUTCHours()).padStart(2, '0');
		const mm = String(now.getUTCMinutes()).padStart(2, '0');
		const month = now.getUTCMonth() + 1;
		this.set('greeting', greeting(now.getUTCHours()));
		this.set('clock', `${hh}:${mm}, ${DAYS[now.getUTCDay()]} ${now.getUTCDate()} ${MONTHS[month - 1].slice(0, 3)}`);

		// The rains: this month's label from /seasons' own data.
		if (this.seasons) {
			this.set('month', MONTHS[month - 1]);
			this.set('rain', this.seasons.rains[month] || '');
			// The first tile that is not a year-round staple: what is at its
			// best, in season, or coming.
			const lead = (this.seasons.months[month] || []).find((t) => t.status !== 'year');
			const item = this.querySelector('[data-season]')?.closest('.now-item');
			if (item) item.hidden = !lead;
			if (lead) {
				const what = { best: 'best now', in: 'in season' }[lead.status]
					|| lead.label.charAt(0).toLowerCase() + lead.label.slice(1);
				this.set('season', `${lead.name}, ${what}`);
				this.set('season-label', lead.status === 'soon' ? 'Coming soon' : 'In season');
			}
		}

		// The next public holiday on or after today, Nairobi's date.
		const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
		const next = this.holidays.find((h) => Date.parse(`${h.date}T00:00:00Z`) >= today);
		const holiday = this.querySelector('[data-holiday]')?.closest('.now-item');
		if (holiday) holiday.hidden = !next;
		if (next) {
			const day = new Date(`${next.date}T00:00:00Z`);
			const n = Math.round((day.getTime() - today) / DAY_MS);
			this.set('holiday', next.name.replace(' (estimated)', ''));
			this.set('holiday-when', `${DAYS[day.getUTCDay()]} ${day.getUTCDate()} ${MONTHS[day.getUTCMonth()].slice(0, 3)}, ${inDays(n)}`);
		}

		// AFCON: days to kickoff, and then nothing - the AFCON card says the rest.
		const afcon = this.querySelector('[data-afcon-days]')?.closest('.now-item');
		// Whole days left, as the AFCON card's countdown counts them.
		const days = Math.floor((this.afcon - Date.now()) / DAY_MS);
		if (afcon) afcon.hidden = !(days > 0);
		if (days > 0) this.set('afcon-days', `${days.toLocaleString('en-GB')} ${days === 1 ? 'day' : 'days'} to kickoff`);
	}
}

if (!customElements.get('home-seasons')) customElements.define('home-seasons', HomeSeasons);
if (!customElements.get('nairobi-now')) customElements.define('nairobi-now', NairobiNow);
