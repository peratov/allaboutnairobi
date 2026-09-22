/**
 * The events page, enhanced.
 *
 * Two jobs, and the first one matters more than it looks.
 *
 * 1. Re-check expiry against the reader's clock. This is a static site: the
 *    build filtered out everything that had finished on the day it ran, and
 *    from then on that judgement ages. A deploy that goes quiet for a
 *    fortnight, or a page sitting in a browser cache, would otherwise show a
 *    date that has been and gone. Every card carries its own ISO dates, so the
 *    browser can settle it locally with no network and no API.
 *
 * 2. Filter by category, and hide a month heading once its last card goes.
 *
 * Everything here is enhancement. With no JavaScript the page is already
 * correct as at the last build, the filter bar never appears (it ships
 * `hidden` and is revealed here), and nothing is lost but the chips.
 */

const filterBar = document.querySelector('[data-event-filters]');
const emptyNote = document.querySelector('[data-event-empty]');
const months = [...document.querySelectorAll('[data-event-month]')];
const cards = [...document.querySelectorAll('.event')];

/** Today at midnight, so an event finishing today still counts as on. */
function startOfToday() {
	const now = new Date();
	return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/**
 * Parse `2026-09-21` as a LOCAL date.
 *
 * `new Date('2026-09-21')` parses as UTC, which in a timezone behind UTC
 * lands on the 20th and expires an event a day early for a reader in a
 * timezone behind UTC - someone planning a Nairobi trip from New York, say.
 */
function parseISO(value) {
	const [year, month, day] = value.split('-').map(Number);
	return new Date(year, month - 1, day);
}

/** Drop anything that finished before today, whatever the build thought. */
function removeExpired() {
	const today = startOfToday();
	let removed = 0;

	for (const card of cards) {
		const ends = card.dataset.ends || card.dataset.starts;
		if (!ends) continue; // an annual fixture with no date never expires
		if (parseISO(ends) < today) {
			card.remove();
			removed += 1;
		}
	}

	return removed;
}

/** A month with nothing left in it should not keep its heading. */
function pruneEmptyMonths() {
	for (const month of months) {
		const visible = month.querySelectorAll('.event:not([hidden])').length;
		month.hidden = visible === 0;
	}
}

function apply(category) {
	for (const card of document.querySelectorAll('.event')) {
		card.hidden = category !== 'all' && card.dataset.category !== category;
	}
	pruneEmptyMonths();

	if (emptyNote) {
		const anyVisible = document.querySelectorAll('.event:not([hidden])').length > 0;
		emptyNote.hidden = anyVisible;
	}
}

function wireFilters() {
	if (!filterBar) return;
	const chips = [...filterBar.querySelectorAll('[data-filter]')];
	if (chips.length < 2) return; // one category is not a choice

	filterBar.hidden = false;

	filterBar.addEventListener('click', (event) => {
		const chip = event.target.closest('[data-filter]');
		if (!chip) return;

		for (const other of chips) {
			const on = other === chip;
			other.classList.toggle('is-on', on);
			other.setAttribute('aria-pressed', String(on));
		}

		apply(chip.dataset.filter);
	});
}

const removed = removeExpired();
if (removed) {
	// Worth saying out loud: it means the deploy is behind, and the page is
	// carrying the difference rather than the reader.
	console.info(`Events: hid ${removed} listing(s) that ended before today.`);
}

pruneEmptyMonths();
wireFilters();
