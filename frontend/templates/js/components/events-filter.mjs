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
 * 3. Say how far away each date is - "Tomorrow", "This Sunday", "In 3 weeks" -
 *    against the reader's clock, because a static page cannot, and write a
 *    calendar file for any dated event so it lands in the phone's own calendar.
 *    The file is built here from the card's attributes; nothing is fetched and
 *    nothing is sent anywhere.
 *
 * Everything here is enhancement. With no JavaScript the page is already
 * correct as at the last build, the filter bar never appears (it ships
 * `hidden` and is revealed here), and nothing is lost but the chips.
 */

const filterBar = document.querySelector('[data-event-filters]');
const emptyNote = document.querySelector('[data-event-empty]');
const annualOnlyNote = document.querySelector('[data-event-annual-only]');
const months = [...document.querySelectorAll('[data-event-month]')];
const next = document.querySelector('[data-event-next]');
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
	const featured = Boolean(next?.dataset.filled);
	for (const card of document.querySelectorAll('.event:not(.is-next)')) {
		// The featured event's own card stands aside while it is shown at the top,
		// and comes back when a filter hides the top.
		card.hidden = category === 'all' ? (featured && card.dataset.featured === 'true') : card.dataset.category !== category;
	}
	// "Next up" is the next of everything; under a filter the list says it.
	if (next?.dataset.filled) next.hidden = category !== 'all';
	pruneEmptyMonths();

	const dated = document.querySelectorAll('[data-event-month] .event:not([hidden])').length;
	const annual = document.querySelectorAll('.event-annual:not([hidden])').length;

	if (emptyNote) emptyNote.hidden = dated + annual > 0;

	// Music, for one, is all yearly fixtures with no announced date, so the
	// dated list went blank with no word as to why. Point down the page.
	if (annualOnlyNote) {
		annualOnlyNote.hidden = !(dated === 0 && annual > 0);
		const link = annualOnlyNote.querySelector('[data-event-annual-link]');
		if (link) link.textContent = `${annual} come${annual === 1 ? 's' : ''} round every year ↓`;
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

const DAY = 24 * 60 * 60 * 1000;

/** Whole days from today to a date, by calendar day rather than by hours. */
function daysUntil(date) {
	return Math.round((date - startOfToday()) / DAY);
}

/**
 * "Today", "Tomorrow", "This Saturday", "In 9 days", "In 3 weeks", "In 4 months".
 * A multi-day event that has started is "On now".
 */
function relativeLabel(starts, ends) {
	const days = daysUntil(starts);
	if (days <= 0) return ends && daysUntil(ends) > 0 ? 'On now' : 'Today';
	if (days === 1) return 'Tomorrow';
	if (days < 7) {
		return `This ${starts.toLocaleDateString('en-GB', { weekday: 'long' })}`;
	}
	if (days < 14) return `In ${days} days`;
	if (days < 60) return `In ${Math.round(days / 7)} weeks`;
	return `In ${Math.round(days / 30.4)} months`;
}

function labelDates() {
	for (const card of document.querySelectorAll('.event[data-starts]')) {
		const starts = parseISO(card.dataset.starts);
		const ends = card.dataset.ends ? parseISO(card.dataset.ends) : null;
		const label = relativeLabel(starts, ends);
		const meta = card.querySelector('.event-meta');
		if (!meta) continue;
		const pill = document.createElement('span');
		pill.className = 'event-relative';
		const days = daysUntil(starts);
		if (days < 7) pill.classList.add('is-soon');
		pill.textContent = label;
		meta.prepend(pill);
	}
}

// --- calendar files ---------------------------------------------------------------

/** Escape a value for an iCalendar text property (RFC 5545 3.3.11). */
function icsText(value) {
	return String(value)
		.replace(/\\/g, '\\\\')
		.replace(/;/g, '\\;')
		.replace(/,/g, '\\,')
		.replace(/\r?\n/g, '\\n');
}

/**
 * Fold long lines, as the format asks. Its limit is 75 octets, not
 * characters, and a shilling sign is three; 60 characters stays under it.
 */
function fold(line) {
	const parts = [];
	let rest = line;
	while (rest.length > 60) {
		parts.push(rest.slice(0, 60));
		rest = ' ' + rest.slice(60);
	}
	parts.push(rest);
	return parts.join('\r\n');
}

const compact = (date) => `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;

function calendarFile(card) {
	const starts = parseISO(card.dataset.starts);
	const ends = parseISO(card.dataset.ends || card.dataset.starts);
	// All-day events end the day after their last day: DTEND is exclusive.
	const after = new Date(ends.getFullYear(), ends.getMonth(), ends.getDate() + 1);
	const title = card.dataset.title;
	const description = card.querySelector('.event-description')?.textContent.trim().replace(/\s+/g, ' ') || '';
	const slug = title.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
	const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

	const lines = [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'PRODID:-//All About Nairobi//Events//EN',
		'CALSCALE:GREGORIAN',
		'BEGIN:VEVENT',
		`UID:${slug}-${card.dataset.starts}@allaboutnairobi.com`,
		`DTSTAMP:${stamp}`,
		`DTSTART;VALUE=DATE:${compact(starts)}`,
		`DTEND;VALUE=DATE:${compact(after)}`,
		`SUMMARY:${icsText(title)}`,
		card.dataset.place ? `LOCATION:${icsText(card.dataset.place)}` : null,
		`DESCRIPTION:${icsText(`${description}\n\nCheck the organiser's own page before travelling: dates in Nairobi move. ${location.origin}/events`)}`,
		card.dataset.url ? `URL:${card.dataset.url}` : null,
		'END:VEVENT',
		'END:VCALENDAR',
	].filter(Boolean);

	return { name: `${slug}.ics`, body: lines.map(fold).join('\r\n') + '\r\n' };
}

function wireCalendar() {
	for (const button of document.querySelectorAll('[data-event-calendar]')) {
		const card = button.closest('.event');
		if (!card?.dataset.starts) continue;
		button.hidden = false;
		button.setAttribute('aria-label', `Add ${card.dataset.title} to your calendar`);
		button.addEventListener('click', () => {
			const { name, body } = calendarFile(card);
			const url = URL.createObjectURL(new Blob([body], { type: 'text/calendar;charset=utf-8' }));
			const link = document.createElement('a');
			link.href = url;
			link.download = name;
			document.body.append(link);
			link.click();
			link.remove();
			setTimeout(() => URL.revokeObjectURL(url), 10000);
		});
	}
}

/** A count on every chip, of what is left after expiry. */
function countChips() {
	if (!filterBar) return;
	for (const chip of filterBar.querySelectorAll('[data-filter]')) {
		const category = chip.dataset.filter;
		const count = [...document.querySelectorAll('.event:not(.is-next)')]
			.filter((card) => category === 'all' || card.dataset.category === category).length;
		const badge = document.createElement('span');
		badge.className = 'event-chip-count';
		badge.textContent = String(count);
		chip.append(' ', badge);
	}
}

/**
 * The next real event, copied into "Next up" at the top. A public holiday is
 * not something to go to, so it is passed over. The copy is a copy: it keeps
 * the card's dates, so it gets its own "In 3 weeks" and calendar button, and
 * is left out of the filters and the counts.
 */
function showNext() {
	if (!next) return;
	const first = document.querySelector('[data-event-month] .event:not(.event-holiday):not([hidden])');
	if (!first) return;
	const copy = first.cloneNode(true);
	copy.classList.add('is-next');
	copy.removeAttribute('id');
	next.querySelector('[data-event-next-list]').append(copy);
	next.dataset.filled = 'true';
	next.hidden = false;
	// Shown at the top, it is not shown twice.
	first.dataset.featured = 'true';
	first.hidden = true;
	pruneEmptyMonths();
}

const removed = removeExpired();
if (removed) {
	// Worth saying out loud: it means the deploy is behind, and the page is
	// carrying the difference rather than the reader.
	console.info(`Events: hid ${removed} listing(s) that ended before today.`);
}

pruneEmptyMonths();
showNext();
labelDates();
countChips();
wireFilters();
wireCalendar();
