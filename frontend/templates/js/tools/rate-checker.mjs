// Is this a good rate? What a money transfer, a bank or a forex bureau really
// costs.
//
// The reader types what a service offers - its rate, or what it says will
// arrive - and its fee. This compares it with the mid-market rate from
// /api/fx, the midpoint banks trade at. The answer is what is lost, in
// shillings and as a share, judged against the UN's yardstick for remittance
// costs (SDG 10.c: under 3%, and no corridor over 5%), both constants.
//
// It never quotes a provider's prices: they change by the minute and differ
// by amount, and a table of them would be wrong the day it shipped. The
// reader brings the quote; the page only does the arithmetic.
//
// Two directions. "Into shillings": money sent to Kenya, or dollars sold at a
// bureau - the reader pays foreign money plus a fee in it, and shillings
// arrive. "Out of shillings": buying another currency - the reader pays
// shillings at the service's rate plus a fee in shillings. Either way the
// loss is the gap between what the money is worth at mid-market and what the
// service gives, so the fee and the margin hidden in the rate count together.

import constants from '/js/utils/constants.mjs';
import { element, money, breakdown, note, headline } from '/js/utils/tool-ui.mjs';
import { percent } from '/js/utils/format.mjs';

const FX_KEY = 'aan:fx';
// Short enough for a half-width menu on a phone.
const CURRENCIES = {
	USD: 'US',
	GBP: 'UK',
	EUR: 'euro',
	AED: 'UAE',
	CAD: 'Canada',
	ZAR: 'S. Africa',
	CNY: 'China',
	INR: 'India',
	UGX: 'Uganda',
	TZS: 'Tanzania',
};

const DIRECTIONS = {
	in: {
		button: 'Into shillings',
		hint: 'Sending money to Kenya, or selling foreign money for shillings.',
		amount: 'Amount converted',
		amountHint: 'What is changed into shillings, not counting the fee.',
		quote: { rate: 'A rate', result: 'What arrives' },
		result: 'Shillings that arrive',
		fee: 'Their fee',
	},
	out: {
		button: 'Out of shillings',
		hint: 'Buying dollars, pounds or another currency with shillings.',
		amount: 'Amount you are buying',
		amountHint: 'The foreign money you want to end up with.',
		quote: { rate: 'A rate', result: 'What it costs' },
		result: 'Shillings you pay, before any fee',
		fee: 'Their fee, in shillings',
	},
};

function foreign(value, currency) {
	try {
		return new Intl.NumberFormat('en-GB', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value);
	} catch {
		return `${currency} ${value.toFixed(2)}`;
	}
}

// Rates of a shilling or more read to two places; the Ugandan and Tanzanian
// shillings are fractions of one and need their significant figures.
function rate(value) {
	if (!(value > 0)) return '-';
	return value >= 1 ? value.toFixed(2) : String(Number(value.toPrecision(4)));
}

function readSaved() {
	try { return JSON.parse(localStorage.getItem(FX_KEY) || 'null'); } catch { return null; }
}

/** The arithmetic, pure: what was lost, and to what. */
export function assess({ direction, amount, fee, theirRate, mid }) {
	if (direction === 'in') {
		const worth = (amount + fee) * mid; // what the money paid in is worth
		const got = amount * theirRate; // the shillings that arrive
		const feeShillings = fee * mid;
		const margin = amount * (mid - theirRate);
		const lost = worth - got;
		return { worth, got, feeShillings, margin, lost, share: worth > 0 ? (lost / worth) * 100 : 0, effective: amount + fee > 0 ? got / (amount + fee) : 0 };
	}
	const fair = amount * mid; // what the currency costs at mid-market
	const paid = amount * theirRate + fee;
	const margin = amount * (theirRate - mid);
	const lost = paid - fair;
	return { worth: fair, got: paid, feeShillings: fee, margin, lost, share: fair > 0 ? (lost / fair) * 100 : 0, effective: amount > 0 ? paid / amount : 0 };
}

class RateChecker extends HTMLElement {
	connectedCallback() {
		if (this.ready) return;
		this.ready = true;

		const params = new URLSearchParams(location.search);
		const from = (params.get('from') || '').toUpperCase();
		this.state = {
			direction: params.get('direction') === 'out' ? 'out' : 'in',
			currency: CURRENCIES[from] ? from : 'USD',
			amount: parseFloat(params.get('amount')) > 0 ? parseFloat(params.get('amount')) : 500,
			quote: 'rate',
			quoted: 0,
			fee: 0,
			mids: null,
			midOverride: 0,
			source: null,
		};
		this.results = element('div', { class: 'tool-results', role: 'status', 'aria-live': 'polite' });
		this.form = element('form', {});
		this.form.addEventListener('submit', (event) => event.preventDefault());
		this.replaceChildren(this.form, this.results);
		this.drawForm();
		this.loadRates();
	}

	async loadRates() {
		const saved = readSaved();
		if (saved?.rates) {
			this.state.mids = saved.rates;
			this.state.source = { updated: saved.updated, saved: true, pending: true };
			this.drawForm();
		}
		try {
			const response = await fetch('/api/fx');
			if (!response.ok) throw new Error(String(response.status));
			const fx = await response.json();
			this.state.mids = fx.rates;
			this.state.source = { name: fx.source?.name, link: fx.source?.link, updated: fx.updated, stale: fx.stale };
			try { localStorage.setItem(FX_KEY, JSON.stringify({ rates: fx.rates, updated: fx.updated })); } catch { /* fine */ }
		} catch {
			if (this.state.mids) this.state.source = { ...this.state.source, pending: false };
			else this.state.source = { failed: true };
		}
		this.drawForm();
	}

	mid() {
		return this.state.midOverride || this.state.mids?.[this.state.currency] || 0;
	}

	// A number box. Typing redraws only the results, so focus stays put.
	field(id, label, hint, prefix, value, onInput, attrs = {}) {
		const input = element('input', {
			id, type: 'number', min: '0', step: 'any', inputmode: 'decimal',
			value: value ? String(value) : '', ...attrs,
			oninput: (event) => { onInput(Math.max(0, parseFloat(event.target.value) || 0)); this.drawResults(); },
		});
		return element('div', { class: 'form-group' }, [
			element('label', { for: id, text: label }),
			element('div', { class: 'input-group' }, [element('span', { text: prefix }), input]),
			hint ? element('span', { class: 'input-instructions', text: hint }) : null,
		]);
	}

	toggles(label, options, value, onChange) {
		return element('div', { class: 'form-group' }, [
			element('span', { class: 'label', text: label }),
			element('div', { class: 'input-group' }, options.map(([key, text]) => element('button', {
				type: 'button', class: 'toggle', 'aria-pressed': String(key === value), text,
				onclick: () => { if (key !== value) { onChange(key); this.drawForm(); } },
			}))),
		]);
	}

	// The form, rebuilt when its shape changes: direction, currency, what was
	// quoted, or the live rate arriving.
	drawForm() {
		const s = this.state;
		const words = DIRECTIONS[s.direction];
		const mid = this.mid();
		const focused = document.activeElement && this.form.contains(document.activeElement) ? document.activeElement.id : null;

		const currency = element('select', {
			id: 'rc-currency',
			// A fee typed in the old currency means nothing in the new one.
			onchange: (event) => { s.currency = event.target.value; s.midOverride = 0; if (s.direction === 'in') s.fee = 0; this.drawForm(); },
		}, Object.entries(CURRENCIES).map(([code, name]) => element('option', { value: code, text: `${code} (${name})` })));
		currency.value = s.currency;

		const quoteHint = s.quote === 'rate'
			? (mid ? `The mid-market rate now is KES ${rate(mid)}. A rate written the other way round (${s.currency} per shilling) is turned round for you.` : 'As shown on the app, the website or the bureau board.')
			: (s.direction === 'in' ? `The shillings they say will arrive for ${foreign(s.amount, s.currency)}.` : `The shillings they ask for ${foreign(s.amount, s.currency)}, not counting a separate fee.`);

		const feeInShillings = s.direction === 'out';
		const midField = this.field('rc-mid', 'Compare against this rate instead',
			`Shillings for 1 ${s.currency}: the Central Bank of Kenya's indicative rate, or another service's, to compare two quotes.`,
			'KES', s.midOverride, (v) => { s.midOverride = v; },
			{ placeholder: s.mids?.[s.currency] ? rate(s.mids[s.currency]) : '' });
		const details = element('details', { class: 'rate-mid' }, [element('summary', { text: 'Compare against another rate' }), midField]);
		if (s.midOverride) details.open = true;

		this.form.replaceChildren(
			element('h4', { text: 'Is this a good rate?' }),
			this.toggles('Which way is the money going?', Object.entries(DIRECTIONS).map(([k, d]) => [k, d.button]), s.direction, (v) => { s.direction = v; s.fee = 0; }),
			element('p', { class: 'input-instructions', text: words.hint }),
			element('div', { class: 'form-group' }, [element('label', { for: 'rc-currency', text: 'Currency' }), currency]),
			this.field('rc-amount', words.amount, words.amountHint, s.currency, s.amount, (v) => { s.amount = v; }),
			this.toggles('What did they quote?', Object.entries(words.quote), s.quote, (v) => { s.quote = v; s.quoted = 0; }),
			this.field('rc-quote', s.quote === 'rate' ? `Their rate: shillings for 1 ${s.currency}` : words.result, quoteHint, 'KES', s.quoted, (v) => { s.quoted = v; }),
			this.field('rc-fee', feeInShillings ? words.fee : `${words.fee}, in ${s.currency}`,
				'Leave at 0 if they charge none. Check the total you pay, not only the fee line.',
				feeInShillings ? 'KES' : s.currency, s.fee, (v) => { s.fee = v; }),
			details,
		);
		if (focused) document.getElementById(focused)?.focus();
		this.drawResults();
	}

	drawResults() {
		const target = constants().REMITTANCE_COST_TARGET;
		const ceiling = constants().REMITTANCE_COST_CEILING;
		const { direction, currency, amount, quote, fee } = this.state;
		const words = DIRECTIONS[direction];
		const mid = this.mid();
		const out = [];
		const show = () => this.results.replaceChildren(...out.filter(Boolean));

		// What the service quoted, as shillings for one unit.
		let theirRate = quote === 'rate' ? this.state.quoted : (amount > 0 ? this.state.quoted / amount : 0);
		let flipped = false;
		if (quote === 'rate' && theirRate > 0 && mid > 0 && Math.abs(Math.log(theirRate * mid)) < Math.abs(Math.log(theirRate / mid))) {
			theirRate = 1 / theirRate;
			flipped = true;
		}

		if (!mid) {
			out.push(note(this.state.source?.failed
				? 'The live rate could not be fetched. Open "Compare against another rate" and type one - the Central Bank of Kenya publishes indicative rates every weekday.'
				: 'Fetching the live rate…'));
			return show();
		}
		if (!(amount > 0) || !(theirRate > 0)) {
			out.push(note(!(amount > 0) ? 'Enter an amount.' : (quote === 'rate' ? 'Enter their rate to see what it costs you.' : `Enter the ${words.result.toLowerCase()} to see what it costs you.`)));
			out.push(this.sourceNote(mid));
			return show();
		}

		const r = assess({ direction, amount, fee, theirRate, mid });
		const label = direction === 'in' ? 'lost to the rate and the fee' : 'paid over the mid-market rate';

		let verdict;
		let tone = '';
		if (r.lost < 0) {
			out.push(headline(money(0), `${label} - better than mid-market by ${money(-r.lost)}`));
			verdict = 'That is better than the mid-market rate, which no service offers for long. Check the quote is for today and that no fee is charged elsewhere - on collection, on withdrawal from M-Pesa, or by your bank.';
			tone = 'is-good';
		} else {
			out.push(headline(money(r.lost), direction === 'in'
				? `${label}: ${percent(r.share)} of its worth · ${money(r.got)} arrives`
				: `${label}: ${percent(r.share)} over mid-market · ${money(r.got)} in all`));
			if (direction === 'out') {
				const by = `There is no official yardstick for a bureau or a bank; by the UN's one for money transfers - under ${percent(target)}, never over ${percent(ceiling)} - `;
				verdict = r.share <= target ? `${by}that is good.`
					: r.share <= ceiling ? `${by}that is fair. Another bureau may beat it.`
					: `${by}that is expensive. Ask another bureau or your bank before you buy.`;
			} else if (r.share <= target) {
				verdict = `Good. That is within the UN's target of ${percent(target)} for what sending money home should cost, fee and rate together.`;
			} else if (r.share <= ceiling) {
				verdict = `Fair. That is over the UN's ${percent(target)} target for what sending money should cost, but under its ${percent(ceiling)} ceiling. Another quote may beat it.`;
			} else {
				verdict = `Expensive. That is over the ${percent(ceiling)} the UN says no money transfer route should cost. Get another quote before you pay.`;
			}
			tone = r.share <= target ? 'is-good' : r.share > ceiling ? 'is-over' : '';
		}
		out.push(element('p', { class: `rate-verdict ${tone}`.trim(), text: verdict }));
		if (flipped) out.push(note(`Read as KES ${rate(theirRate)} for 1 ${currency}: the rate you typed is written the other way round.`));

		// Where the money goes, as one bar.
		if (r.lost > 0) {
			const total = direction === 'in' ? r.worth : r.got;
			const share = (part) => `${Math.max(0, (part / total) * 100)}%`;
			const kept = direction === 'in' ? r.got : r.worth;
			out.push(
				element('div', { class: 'tool-bar', 'aria-hidden': 'true' }, [
					element('span', { class: 'seg-net', style: `width:${share(kept)}` }),
					element('span', { class: 'seg-tax', style: `width:${share(Math.max(0, r.margin))}` }),
					element('span', { class: 'seg-pension', style: `width:${share(r.feeShillings)}` }),
				]),
				element('ul', { class: 'tool-legend' }, [
					element('li', {}, [element('span', { class: 'swatch seg-net' }), element('span', { text: direction === 'in' ? 'Arrives' : 'Worth at mid-market' })]),
					element('li', {}, [element('span', { class: 'swatch seg-tax' }), element('span', { text: 'Hidden in the rate' })]),
					element('li', {}, [element('span', { class: 'swatch seg-pension' }), element('span', { text: 'The fee' })]),
				]),
			);
		}

		out.push(breakdown(direction === 'in'
			? [
				['You pay', foreign(amount + fee, currency)],
				[`Worth at mid-market (KES ${rate(mid)})`, money(r.worth)],
				[`Their rate (KES ${rate(theirRate)})`, money(r.got)],
				['Hidden in the rate', money(r.margin)],
				[`The fee (${foreign(fee, currency)})`, money(r.feeShillings)],
				['Lost in all', money(r.lost), 'total'],
			]
			: [
				['You get', foreign(amount, currency)],
				[`Cost at mid-market (KES ${rate(mid)})`, money(r.worth)],
				[`At their rate (KES ${rate(theirRate)})`, money(amount * theirRate)],
				['Hidden in the rate', money(r.margin)],
				['The fee', money(fee)],
				['Paid over mid-market', money(r.lost), 'total'],
			]));
		out.push(note(direction === 'in'
			? `With the fee counted, you are getting KES ${rate(r.effective)} for each ${currency} you pay. Compare that figure - or simply the shillings that arrive - between services, not the fee.`
			: `With the fee counted, each ${currency} costs you KES ${rate(r.effective)}. Compare that figure between bureaus and banks, not the rate on the board alone.`));
		out.push(this.sourceNote(mid));
		show();
	}

	sourceNote(mid) {
		const { source, midOverride, currency } = this.state;
		if (midOverride) return note(`Compared against the rate you typed, KES ${rate(mid)} for 1 ${currency}.`);
		const when = source?.updated
			? new Date(source.updated).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Nairobi' }) + ' EAT'
			: null;
		const node = element('p', { class: 'tool-note' });
		node.append(`Mid-market rate: KES ${rate(mid)} for 1 ${currency}`);
		if (source?.name) {
			node.append(', from ');
			node.append(source.link ? element('a', { href: source.link, rel: 'noopener', text: source.name }) : source.name);
		}
		if (when) node.append(`, set ${when}`);
		node.append((source?.saved && !source.pending) || source?.stale
			? '. This is the last rate saved on this device - the live one could not be fetched. '
			: '. ');
		node.append("It is the midpoint banks trade at between themselves; no one sells to the public at it, so a small gap is normal. It is not the Central Bank of Kenya's indicative rate.");
		return node;
	}
}

customElements.define('rate-checker', RateChecker);
