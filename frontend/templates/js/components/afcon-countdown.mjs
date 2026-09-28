// A live countdown to AFCON 2027 kickoff, in East Africa Time.
//
//   <afcon-countdown data-starts="2027-06-19" data-ends="2027-07-17">
//     ...fallback text, shown without JavaScript...
//   </afcon-countdown>
//
// Before kickoff it counts days, hours, minutes and seconds. During the
// tournament it shows which day it is; after the final, that it is over. It
// ticks once a second only while the page is visible.

const EAT_OFFSET = '+03:00';

function unit(value, label) {
	const cell = document.createElement('span');
	cell.className = 'afcon-countdown-unit';
	const number = document.createElement('span');
	number.className = 'afcon-countdown-value';
	number.textContent = String(value).padStart(2, '0');
	const text = document.createElement('span');
	text.className = 'afcon-countdown-label';
	text.textContent = label;
	cell.append(number, text);
	return cell;
}

class AfconCountdown extends HTMLElement {
	connectedCallback() {
		if (this.timer) return;
		// Kickoff day starts at 00:00 East Africa Time; the tournament is over at
		// the end of the final's day.
		this.start = new Date(`${this.dataset.starts}T00:00:00${EAT_OFFSET}`).getTime();
		this.end = new Date(`${this.dataset.ends}T23:59:59${EAT_OFFSET}`).getTime();
		if (Number.isNaN(this.start) || Number.isNaN(this.end)) return;

		this.setAttribute('role', 'timer');
		this.setAttribute('aria-live', 'off');
		this.render();
		this.timer = setInterval(() => { if (!document.hidden) this.render(); }, 1000);
	}

	disconnectedCallback() {
		clearInterval(this.timer);
		this.timer = null;
	}

	render() {
		const now = Date.now();
		if (now < this.start) {
			let s = Math.floor((this.start - now) / 1000);
			const days = Math.floor(s / 86400); s -= days * 86400;
			const hours = Math.floor(s / 3600); s -= hours * 3600;
			const minutes = Math.floor(s / 60); s -= minutes * 60;
			const grid = document.createElement('div');
			grid.className = 'afcon-countdown-grid';
			grid.append(unit(days, days === 1 ? 'day' : 'days'), unit(hours, 'hours'), unit(minutes, 'min'), unit(s, 'sec'));
			const caption = document.createElement('p');
			caption.className = 'afcon-countdown-caption';
			caption.textContent = 'until kickoff on 19 June 2027';
			this.setAttribute('aria-label', `${days} days, ${hours} hours and ${minutes} minutes until AFCON 2027 kicks off`);
			this.replaceChildren(grid, caption);
		} else if (now <= this.end) {
			const day = Math.floor((now - this.start) / 86400000) + 1;
			const total = Math.round((this.end - this.start) / 86400000);
			const p = document.createElement('p');
			p.className = 'afcon-countdown-live';
			p.textContent = `AFCON 2027 is on - day ${day} of ${total}.`;
			this.setAttribute('aria-label', p.textContent);
			this.replaceChildren(p);
		} else {
			const p = document.createElement('p');
			p.className = 'afcon-countdown-live';
			p.textContent = 'AFCON 2027 is over. Asanteni for coming, Afrika.';
			this.replaceChildren(p);
			clearInterval(this.timer);
		}
	}
}

customElements.define('afcon-countdown', AfconCountdown);
