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
		const date = `${DAYS[now.getUTCDay()]} ${now.getUTCDate()} ${MONTHS[month - 1].slice(0, 3)}`;
		this.set('clock-time', `${hh}:${mm}`);
		this.set('clock-date', ` · ${date}`);
		this.titled('clock', `${greeting(now.getUTCHours())}: ${hh}:${mm}, ${date}`);

		// The rains: this month's label from /seasons' own data.
		if (this.seasons) {
			const rain = this.seasons.rains[month] || '';
			this.set('month', MONTHS[month - 1]);
			this.set('rain', rain);
			this.titled('rain', `${MONTHS[month - 1]} in Nairobi: ${rain.toLowerCase()}`);
			// The first tile that is not a year-round staple: what is at its
			// best, in season, or coming.
			const lead = (this.seasons.months[month] || []).find((t) => t.status !== 'year');
			const item = this.querySelector('[data-season]')?.closest('.now-item');
			if (item) item.hidden = !lead;
			if (lead) {
				const soon = lead.status === 'soon';
				this.set('season', soon ? `${lead.name} · ${lead.label.split(' ').pop().slice(0, 3)}` : lead.name);
				this.set('season-label', soon ? 'Coming' : 'In season');
				const what = { best: 'best now', in: 'in season' }[lead.status]
					|| lead.label.charAt(0).toLowerCase() + lead.label.slice(1);
				this.titled('season', `${lead.name}, ${what}`);
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
			const name = next.name.replace(' (estimated)', '');
			this.set('holiday', name);
			this.set('holiday-when', inDays(n));
			this.titled('holiday', `Next public holiday: ${name}, ${DAYS[day.getUTCDay()]} ${day.getUTCDate()} ${MONTHS[day.getUTCMonth()]}, ${inDays(n)}`);
		}

		// AFCON: whole days to kickoff, as the AFCON card's countdown counts them.
		const afcon = this.querySelector('[data-afcon-days]')?.closest('.now-item');
		const days = Math.floor((this.afcon - Date.now()) / DAY_MS);
		if (afcon) afcon.hidden = !(days > 0);
		if (days > 0) this.set('afcon-days', `${days.toLocaleString('en-GB')} ${days === 1 ? 'day' : 'days'}`);
		this.fades();
	}

	/** Each item's whole text, as its tooltip and accessible name. */
	titled(name, text) {
		const node = this.querySelector(`[data-title-${name}]`);
		if (node) {
			node.title = text;
			node.setAttribute('aria-label', text);
		}
	}

	/**
	 * A fade at whichever end of the bar has more to scroll to. Set from the
	 * scroll position, so a bar that fits has no fade at all.
	 */
	fades() {
		const list = this.querySelector('.now-list');
		if (!list) return;
		if (!this.watching) {
			this.watching = true;
			list.addEventListener('scroll', () => this.fades(), { passive: true });
			if ('ResizeObserver' in window) new ResizeObserver(() => this.fades()).observe(list);
		}
		const max = list.scrollWidth - list.clientWidth;
		this.classList.toggle('has-more-start', list.scrollLeft > 2);
		this.classList.toggle('has-more-end', max - list.scrollLeft > 2);
	}
}

if (!customElements.get('home-seasons')) customElements.define('home-seasons', HomeSeasons);
if (!customElements.get('nairobi-now')) customElements.define('nairobi-now', NairobiNow);
