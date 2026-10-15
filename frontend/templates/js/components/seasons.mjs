// What is in season in Nairobi, for the month the reader is in.
//
// The page arrives complete: every item with its photo, its twelve months and
// its facts, and the year as a table. What a static page cannot know is which
// month it is being read in, so everything that depends on "now" is done here,
// against the reader's own clock:
//
//   * each card's status - at its best, in season, all year, coming soon, out
//     of season, or not confirmed - and the cards grouped by it;
//   * this month's rains and what the farms are doing;
//   * filters, a search, and a list the reader keeps on this device;
//   * a sheet with the full item, which `#mango` opens on arrival and which
//     the back button closes, like the series sheet on /data.
//
// Months live in the page's JSON; words live in the HTML. The sheet clones
// the card's own facts rather than carrying them twice.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
	'August', 'September', 'October', 'November', 'December'];
const SHORT = MONTHS.map((m) => m.slice(0, 3));
const KEY_SAVED = 'aa:seasons:saved';
// "Coming soon" is within two months. Three months away is not soon, and the
// card says when it is back instead.
const SOON = 2;

const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
// The phone layout's line, the same 40rem the stylesheet draws.
const phone = window.matchMedia('(max-width: 40rem)');

const store = {
	get() {
		try {
			const value = JSON.parse(window.localStorage.getItem(KEY_SAVED) || '[]');
			return Array.isArray(value) ? value : [];
		} catch {
			return [];
		}
	},
	set(ids) {
		try {
			window.localStorage.setItem(KEY_SAVED, JSON.stringify(ids));
		} catch {
			/* private mode or blocked storage: the list lasts as long as the page */
		}
	},
};

function element(tag, props = {}, ...children) {
	const node = document.createElement(tag);
	for (const [key, value] of Object.entries(props)) {
		if (value == null || value === false) continue;
		if (key === 'className') node.className = value;
		else if (key === 'text') node.textContent = value;
		else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
		else node.setAttribute(key, value === true ? '' : value);
	}
	for (const child of children) if (child) node.append(child);
	return node;
}

// Where an item stands in month `m`.
export function standing(item, m) {
	if (item.basis === 'unknown') return { status: 'unk', peak: false };
	const peak = item.peak.includes(m);
	if (item.year) return { status: 'in', peak, year: !peak };
	if (item.supply.includes(m)) return { status: 'in', peak };
	for (let k = 1; k <= 12; k++) {
		const next = ((m - 1 + k) % 12) + 1;
		if (item.supply.includes(next)) {
			return k <= SOON ? { status: 'soon', peak: false, next, k } : { status: 'out', peak: false, next };
		}
	}
	return { status: 'out', peak: false };
}

function pillText(s) {
	if (s.status === 'in') return s.peak ? 'At its best' : s.year ? 'All year' : 'In season';
	if (s.status === 'soon') return s.k === 1 ? 'Next month' : `From ${MONTHS[s.next - 1]}`;
	if (s.status === 'out') return s.next ? `Back in ${MONTHS[s.next - 1]}` : 'Out of season';
	return 'Not confirmed';
}

// The groups the cards fall into, in order.
const GROUPS = [
	{ id: 'in', label: (m) => `In season in ${MONTHS[m - 1]}` },
	{ id: 'year', label: () => 'On sale all year' },
	{ id: 'soon', label: () => 'Coming soon' },
	{ id: 'out', label: (m) => `Out of season in ${MONTHS[m - 1]}` },
	{ id: 'unk', label: () => 'Season not confirmed' },
];
const groupOf = (s) => (s.status === 'in' && s.year ? 'year' : s.status);

class FoodSeasons extends HTMLElement {
	connectedCallback() {
		if (this.dataset.ready) return;
		let data;
		try {
			data = JSON.parse(this.querySelector('[data-seasons]').textContent);
		} catch {
			return;
		}
		this.dataset.ready = 'true';

		this.items = new Map(data.items.map((item, order) => [item.id, { ...item, order }]));
		this.rains = data.rains;
		this.calendar = data.calendar;
		this.today = new Date().getMonth() + 1;
		this.month = this.today;
		this.status = 'all';
		this.kind = 'all';
		this.query = '';
		this.tab = 'produce';
		this.saved = new Set(store.get().filter((id) => this.items.has(id)));
		this.cards = new Map([...this.querySelectorAll('.season-card')].map((card) => [card.dataset.id, card]));

		this.panels = Object.fromEntries([...this.querySelectorAll('[data-panel]')].map((p) => [p.dataset.panel, p]));
		this.empty = this.querySelector('[data-empty]');

		this.setUpNow();
		this.setUpTabs();
		this.setUpFilters();
		this.setUpCards();
		this.setUpGroups();
		this.dialog = this.buildSheet();
		this.setUpDock();

		this.classList.add('is-live');
		this.setTab('produce', { quiet: true });
		this.render({ animate: false });
		this.applyHash({ arriving: true });

		window.addEventListener('hashchange', () => this.applyHash());
		window.addEventListener('popstate', (event) => {
			if (this.dialog.open && !(event.state && event.state.seasonsItem)) this.closeSheet({ fromHistory: true });
		});
	}

	// --- this month -----------------------------------------------------------

	setUpNow() {
		const now = this.querySelector('[data-now]');
		now.hidden = false;
		this.ribbon = now.querySelector('.seasons-ribbon');
		this.monthButtons = [...now.querySelectorAll('[data-month]')];
		for (const button of this.monthButtons) {
			const m = Number(button.dataset.month);
			if (m === this.today) {
				button.classList.add('is-today');
				button.querySelector('[data-today]').hidden = false;
			}
			button.addEventListener('click', () => this.setMonth(m));
		}
		this.ribbon.addEventListener('keydown', (event) => {
			const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
			if (!step) return;
			event.preventDefault();
			const m = ((this.month - 1 + step + 12) % 12) + 1;
			this.setMonth(m);
			this.monthButtons[m - 1].focus();
		});
		this.nowParts = {
			rain: now.querySelector('[data-rain]'),
			title: now.querySelector('[data-title]'),
			weather: now.querySelector('[data-weather]'),
			activity: now.querySelector('[data-activity]'),
			counts: Object.fromEntries([...now.querySelectorAll('[data-count]')].map((n) => [n.dataset.count, n])),
			peak: now.querySelector('[data-peak]'),
			peakLabel: now.querySelector('[data-peak-label]'),
			peakList: now.querySelector('[data-peak-list]'),
			farm: now.querySelector('[data-farm]'),
			farmMore: now.querySelector('[data-farm-more]'),
		};

		// What the farms are doing is two lines on a phone, with More for the
		// rest; the button only appears when there is a rest to show.
		{
			const { farm, farmMore } = this.nowParts;
			farmMore.addEventListener('click', () => {
				const open = !farm.classList.contains('is-open');
				farm.classList.toggle('is-open', open);
				farmMore.setAttribute('aria-expanded', String(open));
				farmMore.textContent = open ? 'Less' : 'More';
			});
		}

		// A count is also the way in: "2 coming soon" shows those two.
		for (const button of now.querySelectorAll('[data-goto]')) {
			button.addEventListener('click', () => {
				this.status = button.dataset.goto;
				this.kind = 'all';
				if (this.tab !== 'produce') this.setTab('produce', { quiet: true });
				this.render({ animate: true });
				this.scrollToList();
			});
		}
	}

	// Bring the list's top under the header, if the reader is above or past it.
	scrollToList() {
		const tabs = this.querySelector('[data-tabs]');
		const header = document.querySelector('.site-header')?.getBoundingClientRect().height || 56;
		const top = tabs.getBoundingClientRect().top + window.scrollY - header - 8;
		window.scrollTo({ top, behavior: reduceMotion() ? 'auto' : 'smooth' });
	}

	setMonth(m) {
		if (m === this.month) return;
		this.month = m;
		this.render({ animate: true });
	}

	renderNow() {
		const m = this.month;
		const parts = this.nowParts;
		for (const button of this.monthButtons) {
			button.setAttribute('aria-pressed', String(Number(button.dataset.month) === m));
		}
		this.centreRibbon();

		const rain = this.rains.find((r) => r.month === m);
		parts.rain.textContent = rain ? rain.label : '';
		parts.rain.className = `seasons-rain rain-${rain ? rain.season : 'dry'}`;
		parts.title.textContent = m === this.today ? `${MONTHS[m - 1]}, this month` : MONTHS[m - 1];
		const stretch = this.calendar.find((c) => c.months.includes(m));
		parts.weather.textContent = stretch ? stretch.weather : '';
		parts.activity.textContent = stretch ? stretch.activity : '';
		this.measureFarm();

		// The counts are for food, which is what a reader is shopping for -
		// "34 in season" with every chicken and goat in it says nothing.
		const counts = { in: 0, soon: 0, out: 0 };
		for (const item of this.items.values()) {
			if (item.group !== 'produce') continue;
			const s = standing(item, m);
			if (s.status in counts) counts[s.status] += 1;
		}
		for (const [key, node] of Object.entries(parts.counts)) this.countTo(node, counts[key]);
		this.counts = counts;

		const best = [...this.items.values()].filter((item) => item.basis !== 'unknown' && item.peak.includes(m));
		parts.peakList.replaceChildren(...best.map((item, i) => {
			const card = this.cards.get(item.id);
			const img = card.querySelector('img');
			return element('li', { style: `--i:${i}` }, element('button', {
				type: 'button',
				className: 'seasons-peak-item',
				onclick: () => this.openSheet(item.id),
			}, element('img', { src: img.getAttribute('src'), alt: '', width: 56, height: 56, loading: 'lazy', decoding: 'async' }),
			element('span', { text: item.name })));
		}));
		parts.peak.hidden = !best.length;
		parts.peakLabel.textContent = `At their best in ${MONTHS[m - 1]}`;
	}

	// Whether the farm notes overflow their two lines, read after the text
	// changes and whenever the width does.
	measureFarm() {
		const { farm, farmMore } = this.nowParts;
		const text = farm.querySelector('.seasons-farm-text');
		const clamped = !farm.classList.contains('is-open');
		farmMore.hidden = clamped && text.scrollHeight <= text.clientHeight + 1;
	}

	centreRibbon() {
		const button = this.monthButtons[this.month - 1];
		const ribbon = this.ribbon;
		if (ribbon.scrollWidth <= ribbon.clientWidth) return;
		// From the boxes, not offsetLeft: the ribbon is not the buttons' offset parent.
		const box = button.getBoundingClientRect();
		const frame = ribbon.getBoundingClientRect();
		const left = ribbon.scrollLeft + box.left - frame.left - (frame.width - box.width) / 2;
		ribbon.scrollTo({ left, behavior: reduceMotion() || !this.rendered ? 'auto' : 'smooth' });
	}

	countTo(node, target) {
		const from = Number(node.textContent) || 0;
		if (from === target || reduceMotion() || !this.rendered) {
			node.textContent = target;
			return;
		}
		const start = performance.now();
		const step = (time) => {
			const p = Math.min(1, (time - start) / 420);
			node.textContent = Math.round(from + (target - from) * (1 - (1 - p) ** 3));
			if (p < 1) requestAnimationFrame(step);
		};
		requestAnimationFrame(step);
		// A tab that is not painting never runs a frame; the number still lands.
		clearTimeout(node.countTimer);
		node.countTimer = setTimeout(() => { node.textContent = target; }, 600);
	}

	// --- tabs -----------------------------------------------------------------

	setUpTabs() {
		const tabs = this.querySelector('[data-tabs]');
		tabs.hidden = false;
		// Panels only once there are tabs: without scripting they are sections.
		for (const panel of Object.values(this.panels)) panel.setAttribute('role', 'tabpanel');
		this.tabButtons = [...tabs.querySelectorAll('[data-tab]')];
		for (const button of this.tabButtons) {
			button.addEventListener('click', () => this.setTab(button.dataset.tab));
		}
		tabs.addEventListener('keydown', (event) => {
			const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
			if (!step) return;
			event.preventDefault();
			const i = this.tabButtons.findIndex((b) => b.dataset.tab === this.tab);
			const next = this.tabButtons[(i + step + this.tabButtons.length) % this.tabButtons.length];
			this.setTab(next.dataset.tab);
			next.focus();
		});
	}

	setTab(tab, { quiet = false } = {}) {
		if (!(tab in this.panels)) return;
		this.tab = tab;
		for (const button of this.tabButtons) {
			const on = button.dataset.tab === tab;
			button.setAttribute('aria-selected', String(on));
			button.tabIndex = on ? 0 : -1;
		}
		for (const [id, panel] of Object.entries(this.panels)) panel.hidden = id !== tab;
		this.filters.hidden = tab === 'calendar';
		this.kindChips.hidden = tab !== 'produce';
		if (!quiet) this.render({ animate: true });
	}

	// --- filters --------------------------------------------------------------

	setUpFilters() {
		this.filters = this.querySelector('[data-filters]');
		this.filters.hidden = false;
		this.search = this.filters.querySelector('[data-search]');
		this.search.addEventListener('input', () => {
			this.query = this.search.value.trim().toLowerCase();
			this.render({ animate: false });
		});
		this.statusChips = [...this.filters.querySelectorAll('[data-status]')];
		for (const chip of this.statusChips) {
			chip.addEventListener('click', () => {
				this.status = chip.dataset.status;
				this.render({ animate: true });
			});
		}
		this.kindChips = this.filters.querySelector('[data-kind-chips]');
		this.kindButtons = [...this.kindChips.querySelectorAll('[data-kind]')];
		for (const chip of this.kindButtons) {
			chip.addEventListener('click', () => {
				this.kind = this.kind === chip.dataset.kind ? 'all' : chip.dataset.kind;
				this.render({ animate: true });
			});
		}
		this.savedCount = this.filters.querySelector('[data-saved-count]');
		this.querySelector('[data-clear]').addEventListener('click', () => {
			this.status = 'all';
			this.kind = 'all';
			this.query = '';
			this.search.value = '';
			this.render({ animate: true });
		});
	}

	matches(item, s) {
		if (this.status === 'saved' && !this.saved.has(item.id)) return false;
		if (this.status === 'in' && s.status !== 'in') return false;
		if (this.status === 'soon' && s.status !== 'soon') return false;
		if (this.status === 'out' && s.status !== 'out') return false;
		if (item.group === 'produce' && this.kind !== 'all' && item.kind !== this.kind) return false;
		if (this.query && !`${item.name} ${item.kind}`.toLowerCase().includes(this.query)) return false;
		return true;
	}

	// --- cards ----------------------------------------------------------------

	setUpCards() {
		for (const [id, card] of this.cards) {
			const item = this.items.get(id);
			card.querySelector('.season-link').addEventListener('click', (event) => {
				event.preventDefault();
				this.openSheet(id);
			});
			const save = card.querySelector('.season-save');
			save.hidden = false;
			save.addEventListener('click', () => this.toggleSaved(id));
			item.card = card;
			item.pill = card.querySelector('[data-pill]');
			item.pill.hidden = false;
			item.save = save;
		}
		for (const link of this.querySelectorAll('[data-open]')) {
			link.addEventListener('click', (event) => {
				event.preventDefault();
				this.openSheet(link.dataset.open);
			});
		}
	}

	toggleSaved(id) {
		if (this.saved.has(id)) this.saved.delete(id);
		else this.saved.add(id);
		store.set([...this.saved]);
		this.render({ animate: this.status === 'saved' });
		if (this.dialog.open && this.openId === id) this.fillSheetSave();
	}

	// Each grid's cards are moved into groups - in season, all year, coming
	// soon, out - rebuilt on every change of month or filter. The original
	// list stays as the container, so nothing outside this element moves.
	setUpGroups() {
		this.groupHolders = [];
		for (const panel of [this.panels.produce, this.panels.animals]) {
			const grid = panel.querySelector('[data-grid]');
			const holder = element('div', { className: 'season-groups' });
			const groups = Object.fromEntries(GROUPS.map((g) => {
				const title = element('p', { className: `season-group-title is-${g.id}`, id: `group-${panel.dataset.panel}-${g.id}` });
				const list = element('ul', { className: 'seasons-grid', 'aria-labelledby': title.id });
				// "All year" and "not confirmed" do not move with the month, so on
				// a phone they are a row to swipe rather than screens of grid.
				const row = g.id === 'year' || g.id === 'unk';
				const box = element('div', { className: `season-group${row ? ' is-row' : ''}` }, title, list);
				holder.append(box);
				return [g.id, { box, title, list, label: g.label }];
			}));
			grid.replaceWith(holder);
			this.groupHolders.push({ panel: panel.dataset.panel, groups });
		}
	}

	render({ animate }) {
		const m = this.month;
		this.style.setProperty('--month', m);
		this.dataset.month = m;
		this.renderNow();

		for (const chip of this.statusChips) chip.setAttribute('aria-pressed', String(chip.dataset.status === this.status));
		for (const chip of this.kindButtons) chip.setAttribute('aria-pressed', String(chip.dataset.kind === this.kind));
		this.savedCount.textContent = this.saved.size ? `(${this.saved.size})` : '';

		let shownInTab = 0;
		for (const { panel, groups } of this.groupHolders) {
			const items = [...this.items.values()].filter((item) => item.group === panel);
			const sorted = items.map((item) => ({ item, s: standing(item, m) }))
				.sort((a, b) => Number(b.s.peak) - Number(a.s.peak) || (a.s.k || 0) - (b.s.k || 0) || a.item.order - b.item.order);
			for (const g of Object.values(groups)) g.count = 0;
			let n = 0;
			for (const { item, s } of sorted) {
				const card = item.card;
				const shown = this.matches(item, s);
				card.className = `season-card basis-${item.basis} is-${s.status}${s.peak ? ' is-peak' : ''}`;
				item.pill.textContent = pillText(s);
				const saved = this.saved.has(item.id);
				item.save.setAttribute('aria-pressed', String(saved));
				item.save.querySelector('.visually-hidden').textContent = `${saved ? 'Remove' : 'Save'} ${item.name} ${saved ? 'from' : 'to'} my list`;
				card.hidden = !shown;
				const group = groups[groupOf(s)];
				group.list.append(card);
				if (shown) {
					group.count += 1;
					if (animate && !reduceMotion()) {
						card.style.setProperty('--i', Math.min(n, 11));
						card.classList.add('season-arrive');
					}
					n += 1;
				}
			}
			for (const g of Object.values(groups)) {
				g.box.hidden = !g.count;
				g.title.textContent = g.label(m);
				g.title.append(element('span', { className: 'season-group-count', text: String(g.count) }));
			}
			if (panel === this.tab) shownInTab = n;
		}
		this.empty.hidden = this.tab === 'calendar' || shownInTab > 0;
		if (this.dialog?.open) this.fillSheetStatus();
		if (this.dock) this.fillDock();
		this.rendered = true;
	}

	// --- the month, at the thumb ------------------------------------------------
	//
	// On a phone the month ribbon is a screen and more above the cards, so once
	// it has scrolled away a bar at the bottom carries the month: previous,
	// which month and how much is in season, next. It steps aside while the
	// ribbon is on screen, while the sheet is open and off a phone, and the
	// coffee button yields to it, as it does to the radio's bar.

	setUpDock() {
		const dock = element('div', { className: 'seasons-dock', role: 'group', 'aria-label': 'Month' });
		dock.inert = true;
		this.dockPrev = element('button', { type: 'button', className: 'seasons-dock-step', onclick: () => this.stepMonth(-1) });
		this.dockNow = element('button', {
			type: 'button',
			className: 'seasons-dock-now',
			onclick: () => this.querySelector('[data-now]').scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'center' }),
		});
		this.dockNext = element('button', { type: 'button', className: 'seasons-dock-step is-next', onclick: () => this.stepMonth(1) });
		dock.append(this.dockPrev, this.dockNow, this.dockNext);
		this.append(dock);
		this.dock = dock;
		this.fillDock();

		this.nowVisible = true;
		this.selfVisible = false;
		if ('IntersectionObserver' in window) {
			const watch = new IntersectionObserver((entries) => {
				for (const entry of entries) {
					if (entry.target === this) this.selfVisible = entry.isIntersecting;
					else this.nowVisible = entry.isIntersecting;
				}
				this.updateDock();
			// The site header covers the top of the screen; anything under it
			// is out of sight, not on screen.
			}, { rootMargin: '-64px 0px 0px 0px' });
			watch.observe(this.querySelector('[data-now]'));
			watch.observe(this);
		}
		phone.addEventListener?.('change', () => {
			this.updateDock();
			this.measureFarm();
		});
		if ('ResizeObserver' in window) new ResizeObserver(() => this.measureFarm()).observe(this.nowParts.farm);
	}

	stepMonth(by) {
		this.setMonth(((this.month - 1 + by + 12) % 12) + 1);
		// Mid-list, the groups have just re-sorted under the reader: start them
		// at the top of the new month rather than somewhere in the middle of it.
		if (this.querySelector('[data-tabs]').getBoundingClientRect().top < 0) this.scrollToList();
	}

	fillDock() {
		const m = this.month;
		const prev = ((m + 10) % 12) + 1;
		const next = (m % 12) + 1;
		this.dockPrev.textContent = `‹ ${SHORT[prev - 1]}`;
		this.dockPrev.setAttribute('aria-label', `Previous month, ${MONTHS[prev - 1]}`);
		this.dockNext.textContent = `${SHORT[next - 1]} ›`;
		this.dockNext.setAttribute('aria-label', `Next month, ${MONTHS[next - 1]}`);
		const inSeason = this.counts ? this.counts.in : 0;
		this.dockNow.replaceChildren(
			element('strong', { text: MONTHS[m - 1] + (m === this.today ? ' · now' : '') }),
			element('span', { text: `${inSeason} foods in season` }),
		);
	}

	updateDock() {
		const show = phone.matches && this.selfVisible && !this.nowVisible && !this.dialog.open;
		if (show === this.dockShown) return;
		this.dockShown = show;
		this.dock.classList.toggle('is-shown', show);
		this.dock.inert = !show;
		document.querySelector('.support-float')?.classList.toggle('is-yielding', show);
	}

	// --- the sheet ------------------------------------------------------------

	buildSheet() {
		this.sheet = {
			photo: element('img', { className: 'season-sheet-photo', alt: '' }),
			pill: element('span', { className: 'season-pill' }),
			title: element('h2', { className: 'season-sheet-title', id: 'season-sheet-title' }),
			when: element('p', { className: 'season-when' }),
			strip: element('div', { className: 'season-sheet-strip' }),
			facts: element('div', { className: 'season-sheet-facts' }),
			save: element('button', { type: 'button', className: 'season-sheet-save', 'aria-pressed': 'false', onclick: () => this.toggleSaved(this.openId) }),
			prev: element('button', { type: 'button', className: 'season-sheet-step', onclick: () => this.step(-1) }),
			next: element('button', { type: 'button', className: 'season-sheet-step is-next', onclick: () => this.step(1) }),
		};
		const s = this.sheet;
		const close = element('button', {
			type: 'button',
			className: 'season-sheet-close',
			'aria-label': 'Close',
			onclick: () => this.closeSheet(),
		}, '×');
		const dialog = element('dialog', {
			className: 'season-sheet',
			'aria-labelledby': 'season-sheet-title',
			// A click on the backdrop lands on the dialog element itself.
			onclick: (event) => { if (event.target === dialog) this.closeSheet(); },
			oncancel: (event) => { event.preventDefault(); this.closeSheet(); },
		});
		s.figure = element('div', { className: 'season-sheet-figure' }, s.photo, s.pill);
		s.body = element('div', { className: 'season-sheet-body' }, s.title, s.when, s.strip, s.facts);
		dialog.append(element('div', { className: 'season-sheet-inner' },
			element('span', { className: 'season-sheet-grip', 'aria-hidden': 'true' }),
			close,
			s.figure,
			s.body,
			// Pinned to the bottom of the sheet, where a thumb is: the item
			// before, saving this one, and the item after.
			element('nav', { className: 'season-sheet-foot', 'aria-label': 'This item and the others' }, s.prev, s.save, s.next)));
		document.body.append(dialog);
		this.setUpGestures(dialog);
		return dialog;
	}

	// On a phone: drag the sheet down from its top to close it, and swipe the
	// photo sideways for the next item. Touch events rather than pointer ones,
	// because only a non-passive touchmove can stop the page scrolling - the
	// same reason /map uses them.
	setUpGestures(dialog) {
		const inner = dialog.querySelector('.season-sheet-inner');
		let start = null;
		let mode = null;
		let dy = 0;
		dialog.addEventListener('touchstart', (event) => {
			if (event.touches.length !== 1 || !phone.matches) return;
			const t = event.touches[0];
			start = { x: t.clientX, y: t.clientY, dx: 0, top: inner.scrollTop <= 0, onPhoto: this.sheet.figure.contains(event.target) };
			mode = null;
			dy = 0;
		}, { passive: true });
		dialog.addEventListener('touchmove', (event) => {
			if (!start) return;
			const t = event.touches[0];
			const dx = t.clientX - start.x;
			const moved = t.clientY - start.y;
			if (!mode) {
				if (Math.abs(dx) < 8 && Math.abs(moved) < 8) return;
				if (start.onPhoto && Math.abs(dx) > Math.abs(moved) * 1.4) mode = 'swipe';
				else if (start.top && moved > 0) mode = 'drag';
				else mode = 'scroll';
			}
			if (mode === 'drag') {
				event.preventDefault();
				dy = Math.max(0, moved);
				dialog.style.transition = 'none';
				dialog.style.transform = `translateY(${dy}px)`;
			} else if (mode === 'swipe') {
				event.preventDefault();
				start.dx = dx;
				this.sheet.figure.style.transform = `translateX(${dx * 0.4}px)`;
			}
		}, { passive: false });
		const end = () => {
			if (!start) return;
			if (mode === 'drag') {
				dialog.style.transition = '';
				dialog.style.transform = '';
				if (dy > 110) this.closeSheet();
			} else if (mode === 'swipe') {
				this.sheet.figure.style.transform = '';
				if (Math.abs(start.dx) > 60) this.step(start.dx < 0 ? 1 : -1);
			}
			start = null;
			mode = null;
		};
		dialog.addEventListener('touchend', end);
		dialog.addEventListener('touchcancel', end);
	}

	// The order the reader is looking at, so next and previous follow the
	// groups on screen rather than the order of the data file.
	visibleOrder() {
		const order = [];
		for (const { panel, groups } of this.groupHolders) {
			for (const g of Object.values(groups)) {
				for (const card of g.list.children) if (!card.hidden) order.push({ id: card.dataset.id, panel });
			}
		}
		const panel = this.items.get(this.openId)?.group;
		const inPanel = order.filter((o) => o.panel === panel).map((o) => o.id);
		return inPanel.includes(this.openId) ? inPanel : [...this.items.keys()].filter((id) => this.items.get(id).group === panel);
	}

	step(by) {
		const order = this.visibleOrder();
		const i = order.indexOf(this.openId);
		const id = order[(i + by + order.length) % order.length];
		this.fillSheet(id);
		if (!reduceMotion()) {
			const inner = this.dialog.querySelector('.season-sheet-inner');
			inner.classList.remove('is-step-next', 'is-step-prev');
			void inner.offsetWidth; // restart the animation
			inner.classList.add(by > 0 ? 'is-step-next' : 'is-step-prev');
		}
		history.replaceState({ ...(history.state || {}), seasonsItem: true }, '', `#${id}`);
	}

	openSheet(id) {
		if (!this.items.has(id)) return;
		// Opened again while it was sliding away: keep it.
		if (this.dialog.classList.contains('is-closing')) {
			clearTimeout(this.closeTimer);
			this.dialog.classList.remove('is-closing');
			this.dialog.classList.add('is-open');
		}
		this.fillSheet(id);
		if (!this.dialog.open) {
			if (typeof this.dialog.showModal === 'function') this.dialog.showModal();
			else this.dialog.setAttribute('open', '');
			document.documentElement.classList.add('has-season-sheet');
			this.updateDock();
			// Two frames so the closed state paints and the slide is seen; the
			// timer for a tab that is not painting, which never gets a frame.
			const open = () => this.dialog.classList.add('is-open');
			requestAnimationFrame(() => requestAnimationFrame(open));
			setTimeout(open, 120);
		}
		if (!(history.state && history.state.seasonsItem)) {
			history.pushState({ ...(history.state || {}), seasonsItem: true }, '', `#${id}`);
			this.pushed = true;
		} else {
			history.replaceState(history.state, '', `#${id}`);
		}
	}

	closeSheet({ fromHistory = false } = {}) {
		// Going back fires popstate and hashchange both; close once.
		if (!this.dialog.open || this.dialog.classList.contains('is-closing')) return;
		const finish = () => {
			this.dialog.close();
			this.dialog.classList.remove('is-closing');
			document.documentElement.classList.remove('has-season-sheet');
			this.updateDock();
			const card = this.items.get(this.openId)?.card;
			if (card && !card.hidden) card.querySelector('.season-link').focus({ preventScroll: true });
		};
		this.dialog.classList.remove('is-open');
		this.dialog.classList.add('is-closing');
		this.closeTimer = setTimeout(finish, reduceMotion() ? 0 : 200);
		if (fromHistory) return;
		if (this.pushed) {
			this.pushed = false;
			history.back();
		} else {
			// Arrived on #mango: there is nothing behind it to go back to.
			history.replaceState({ ...(history.state || {}), seasonsItem: false }, '', location.pathname + location.search);
		}
	}

	fillSheet(id) {
		const item = this.items.get(id);
		const s = this.sheet;
		this.openId = id;
		const img = item.card.querySelector('img');
		const w = Number(img.getAttribute('width'));
		const h = Number(img.getAttribute('height'));
		s.photo.src = `/staticimages/food/${id}-full.webp`;
		s.photo.width = 760;
		s.photo.height = Math.round((760 * h) / w);
		s.photo.alt = img.alt;
		s.title.textContent = item.name;
		s.when.textContent = item.card.querySelector('.season-when').textContent;
		const strip = item.card.querySelector('.season-strip').cloneNode(true);
		strip.classList.add('is-big');
		s.strip.replaceChildren(strip);
		s.facts.replaceChildren(item.card.querySelector('.season-facts').cloneNode(true));
		// Source links point at the list at the foot of the page: close first.
		for (const link of s.facts.querySelectorAll('a[href^="#source-"]')) {
			link.addEventListener('click', (event) => {
				event.preventDefault();
				const target = link.getAttribute('href');
				this.closeSheet();
				setTimeout(() => document.querySelector(target)?.scrollIntoView({ block: 'center' }), 260);
			});
		}
		this.fillSheetStatus();
		this.fillSheetSave();
		const order = this.visibleOrder();
		const i = order.indexOf(id);
		const name = (other) => this.items.get(other).name;
		const prev = order[(i - 1 + order.length) % order.length];
		const next = order[(i + 1) % order.length];
		s.prev.replaceChildren(element('span', { 'aria-hidden': 'true', text: '‹' }), element('span', { className: 'season-sheet-step-name', text: name(prev) }));
		s.next.replaceChildren(element('span', { className: 'season-sheet-step-name', text: name(next) }), element('span', { 'aria-hidden': 'true', text: '›' }));
		s.prev.setAttribute('aria-label', `Previous: ${name(prev)}`);
		s.next.setAttribute('aria-label', `Next: ${name(next)}`);
		s.prev.hidden = s.next.hidden = order.length < 2;
		this.dialog.querySelector('.season-sheet-inner').scrollTop = 0;
	}

	fillSheetStatus() {
		const item = this.items.get(this.openId);
		const st = standing(item, this.month);
		this.dialog.dataset.month = this.month;
		this.sheet.pill.textContent = `${pillText(st)}${this.month === this.today ? '' : ` in ${SHORT[this.month - 1]}`}`;
		this.dialog.className = `season-sheet is-${st.status}${st.peak ? ' is-peak' : ''}${this.dialog.classList.contains('is-open') ? ' is-open' : ''}`;
	}

	fillSheetSave() {
		const saved = this.saved.has(this.openId);
		this.sheet.save.textContent = saved ? '♥ Saved' : '♡ Save';
		this.sheet.save.setAttribute('aria-label', saved ? 'Saved to my list. Remove' : 'Save to my list');
		this.sheet.save.setAttribute('aria-pressed', String(saved));
	}

	// --- the address ----------------------------------------------------------

	applyHash({ arriving = false } = {}) {
		const id = decodeURIComponent(location.hash.slice(1));
		if (this.items.has(id)) {
			const item = this.items.get(id);
			if (item.group !== this.tab) this.setTab(item.group);
			// The hash already made its own history entry - a link to #mango, or
			// the address it arrived on - so mark that one rather than push a
			// second. Followed from this page, going back leaves the item; on
			// arrival there is nothing behind it, and closing drops the hash.
			history.replaceState({ ...(history.state || {}), seasonsItem: true }, '', location.href);
			this.openSheet(id);
			this.pushed = !arriving;
			return;
		}
		if (id in this.panels) {
			this.setTab(id);
			this.querySelector('[data-tabs]').scrollIntoView({ block: 'start' });
		}
		if (!id && this.dialog.open) this.closeSheet({ fromHistory: true });
	}
}

if (!customElements.get('food-seasons')) customElements.define('food-seasons', FoodSeasons);
