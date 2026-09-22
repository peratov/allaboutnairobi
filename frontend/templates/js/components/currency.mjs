// Accra thinks in two currencies at once.
//
// Rent in Cantonments is quoted in dollars and paid in cedis; salaries are in
// cedis but savings are often in dollars. Every tagged amount offers the other
// currency, using a rate the reader can set once and reuse.
//
// The rate is deliberately NOT fetched from an API. A stale exchange rate
// presented as live is worse than an honest, user-supplied one, and the cedi
// moves too fast for a static site to keep up.
const STORAGE_KEY = 'aaa:usdRate';
const DEFAULT_RATE = 12;

function storedRate() {
	try {
		const value = parseFloat(localStorage.getItem(STORAGE_KEY));
		return Number.isFinite(value) && value > 0 ? value : DEFAULT_RATE;
	} catch (error) {
		return DEFAULT_RATE;
	}
}

const format = (value) =>
	value.toLocaleString('en-GH', { maximumFractionDigits: 0 });

export default function initializeCurrency() {
	const amounts = document.querySelectorAll('.currency[data-amount]');
	if (!amounts.length) return;

	const rate = storedRate();

	amounts.forEach((element) => {
		const amount = parseFloat(element.dataset.amount);
		if (!Number.isFinite(amount)) return;

		const converted =
			element.dataset.currency === 'USD' ? amount * rate : amount / rate;
		const symbol = element.dataset.currency === 'USD' ? '₵' : '$';

		element.title =
			'About ' + symbol + format(converted) + ' at 1 USD = ' +
			'₵' + rate + '. Rates move fast; check before you commit.';
	});
}
