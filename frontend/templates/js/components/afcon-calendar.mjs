// "Add to calendar" for the AFCON 2027 key dates, built in the browser.
//
//   <afcon-calendar>
//     <script type="application/json">[{"date":"2027-06-19","label":"...","detail":"..."}]</script>
//   </afcon-calendar>
//
// Adds one button that downloads every dated item as an .ics file, and a small
// "Add" button to each row marked [data-ics-index]. Nothing is sent anywhere:
// the file is made on the device and handed straight to the calendar app.

const PRODID = '-//All About Nairobi//AFCON 2027//EN';

function escapeText(text) {
	return String(text).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function compact(date) {
	return date.replace(/-/g, '');
}

function nextDay(date) {
	const d = new Date(`${date}T12:00:00Z`);
	d.setUTCDate(d.getUTCDate() + 1);
	return d.toISOString().slice(0, 10);
}

function stamp() {
	return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
}

function vevent(item) {
	return [
		'BEGIN:VEVENT',
		`UID:afcon2027-${compact(item.date)}-${item.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}@allaboutnairobi.com`,
		`DTSTAMP:${stamp()}`,
		`DTSTART;VALUE=DATE:${compact(item.date)}`,
		`DTEND;VALUE=DATE:${compact(nextDay(item.date))}`,
		`SUMMARY:${escapeText(item.label)}`,
		`DESCRIPTION:${escapeText(`${item.detail || ''}\n\nhttps://www.allaboutnairobi.com/afcon`)}`,
		'URL:https://www.allaboutnairobi.com/afcon',
		'END:VEVENT',
	].join('\r\n');
}

function download(items, filename) {
	const body = ['BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:${PRODID}`, 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:AFCON 2027',
		...items.map(vevent), 'END:VCALENDAR'].join('\r\n');
	const url = URL.createObjectURL(new Blob([body], { type: 'text/calendar;charset=utf-8' }));
	const link = document.createElement('a');
	link.href = url;
	link.download = filename;
	document.body.append(link);
	link.click();
	link.remove();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

class AfconCalendar extends HTMLElement {
	connectedCallback() {
		if (this.ready) return;
		this.ready = true;
		const source = this.querySelector('script[type="application/json"]');
		const items = source ? JSON.parse(source.textContent) : [];
		const today = new Date().toISOString().slice(0, 10);
		const upcoming = items.filter((item) => item.date && item.date >= today);
		if (!upcoming.length) return;

		const all = document.createElement('button');
		all.type = 'button';
		all.className = 'button afcon-calendar-all';
		all.textContent = `Add ${upcoming.length} upcoming dates to your calendar`;
		all.addEventListener('click', () => download(upcoming, 'afcon-2027.ics'));
		this.prepend(all);

		this.querySelectorAll('[data-ics-index]').forEach((row) => {
			const item = items[Number(row.dataset.icsIndex)];
			if (!item || !item.date || item.date < today) return;
			const add = document.createElement('button');
			add.type = 'button';
			add.className = 'afcon-calendar-add';
			add.textContent = 'Add';
			add.setAttribute('aria-label', `Add ${item.label} to your calendar`);
			add.addEventListener('click', () => download([item], `${item.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.ics`));
			row.append(add);
		});
	}
}

customElements.define('afcon-calendar', AfconCalendar);
