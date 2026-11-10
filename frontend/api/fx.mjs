// The Kenyan shilling against the currencies Nairobi deals in, at /api/fx.
//
// The browser never talks to a rates provider: the CSP is connect-src 'self',
// and a reader's page asking a third party for rates would tell it who reads
// this site. The function asks instead, once an hour at most, and the edge
// keeps its answer, so a busy day costs the provider a request an hour.
//
// Two free sources, the second only when the first fails: ExchangeRate-API's
// open endpoint (daily, attribution required - the page names it) and the
// open currency-api published through jsDelivr. Neither is the Central Bank of Kenya's
// reference rate, and a forex bureau's or a bank's price will differ by its
// margin; the page says both. The answer carries when the rates were last set
// at source, so a stale one is shown as stale, never as live.

const CURRENCIES = ['USD', 'GBP', 'EUR', 'AED', 'ZAR', 'CNY', 'INR', 'CAD', 'UGX', 'TZS'];
const HOUR = 3600000;
let cache = null;

const SOURCES = [
	{
		name: 'ExchangeRate-API',
		link: 'https://www.exchangerate-api.com',
		async read() {
			const r = await fetch('https://open.er-api.com/v6/latest/USD', { signal: AbortSignal.timeout(6000) });
			const d = await r.json();
			if (d.result !== 'success' || !d.rates?.KES) throw new Error('no KES');
			return { perUsd: d.rates, updated: new Date(d.time_last_update_unix * 1000).toISOString() };
		},
	},
	{
		name: 'currency-api',
		link: 'https://github.com/fawazahmed0/exchange-api',
		async read() {
			const r = await fetch('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.min.json', { signal: AbortSignal.timeout(6000) });
			const d = await r.json();
			if (!d.usd?.kes) throw new Error('no KES');
			return { perUsd: Object.fromEntries(Object.entries(d.usd).map(([k, v]) => [k.toUpperCase(), v])), updated: `${d.date}T00:00:00.000Z` };
		},
	},
];

/** Shillings for one unit of each currency, from rates against the dollar. Pure, for the checks. */
export function shillingRates(perUsd) {
	const kes = Number(perUsd.KES);
	if (!(kes > 0)) throw new Error('no KES');
	const rates = {};
	for (const c of CURRENCIES) {
		const v = Number(perUsd[c]);
		if (v > 0) rates[c] = Number((kes / v).toPrecision(6));
	}
	return rates;
}

export async function latest({ fresh = false } = {}) {
	if (!fresh && cache && Date.now() - cache.at < HOUR) return cache.value;
	let lastError;
	for (const source of SOURCES) {
		try {
			const { perUsd, updated } = await source.read();
			const value = { base: 'KES', rates: shillingRates(perUsd), updated, fetched: new Date().toISOString(), source: { name: source.name, link: source.link } };
			cache = { at: Date.now(), value };
			return value;
		} catch (error) {
			lastError = error;
		}
	}
	// Both down: the last good answer, marked as such, rather than nothing.
	if (cache) return { ...cache.value, stale: true };
	throw lastError || new Error('no source');
}

export default async function handler(req, res) {
	res.setHeader('Content-Type', 'application/json; charset=utf-8');
	if (req.method !== 'GET') {
		res.statusCode = 405;
		return res.end(JSON.stringify({ error: 'Reads only.', code: 'method' }));
	}
	try {
		const value = await latest();
		res.statusCode = 200;
		res.setHeader('Cache-Control', 'public, max-age=600, s-maxage=3600, stale-while-revalidate=86400');
		res.end(JSON.stringify(value));
	} catch {
		res.statusCode = 503;
		res.setHeader('Cache-Control', 'no-store');
		res.end(JSON.stringify({ error: 'Exchange rates are not available just now.', code: 'unavailable' }));
	}
}
