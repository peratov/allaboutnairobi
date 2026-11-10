// The money market fund comparer: what each fund would pay on your amount.
//
// The page arrives with both tables rendered at default amounts
// (_blocks/mmfComparer.html). This adds the amount, a switch between shilling
// and dollar funds, sorting, and hiding funds whose confirmed minimum is above
// the amount. The amount and currency are kept on this device as aan:mmf;
// nothing is sent.

const KEY = 'aan:mmf';
const DEFAULTS = { KES: 100000, USD: 1000 };

function load() {
	try {
		const data = JSON.parse(localStorage.getItem(KEY) || 'null') || {};
		return {
			currency: data.currency === 'USD' ? 'USD' : 'KES',
			amounts: { ...DEFAULTS, ...(data.amounts || {}) },
		};
	} catch {
		return { currency: 'KES', amounts: { ...DEFAULTS } };
	}
}

function store(state) {
	try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private mode */ }
}

const format = (n) => Math.round(n).toLocaleString('en-KE');

export default function init(root = document.querySelector('[data-mmf]')) {
	if (!root || root.dataset.ready) return;
	root.dataset.ready = '1';

	const state = load();
	const controls = root.querySelector('[data-mmf-controls]');
	const amountInput = root.querySelector('[data-mmf-amount]');
	const symbol = root.querySelector('[data-mmf-symbol]');
	const joinable = root.querySelector('[data-mmf-joinable]');
	const sort = root.querySelector('[data-mmf-sort]');
	const empty = root.querySelector('[data-mmf-empty]');
	const tables = [...root.querySelectorAll('[data-mmf-table]')];
	const buttons = [...root.querySelectorAll('[data-mmf-currency]')];

	function draw() {
		const amount = state.amounts[state.currency] || 0;
		symbol.textContent = state.currency;
		if (Number(amountInput.value) !== amount) amountInput.value = String(amount);
		buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mmfCurrency === state.currency)));

		let shown = 0;
		for (const table of tables) {
			const on = table.dataset.mmfTable === state.currency;
			table.hidden = !on;
			if (!on) continue;
			table.querySelector('[data-mmf-earn-head]').textContent = `${state.currency} ${format(amount)}`;

			const body = table.querySelector('tbody');
			const rows = [...body.querySelectorAll('[data-mmf-fund]')];
			const num = (row, key) => (row.dataset[key] === '' ? null : Number(row.dataset[key]));
			rows.sort((a, b) => {
				if (sort.value === 'name') return a.dataset.name.localeCompare(b.dataset.name);
				if (sort.value === 'minimum') return (num(a, 'minimum') ?? Infinity) - (num(b, 'minimum') ?? Infinity);
				return (num(b, 'yield') ?? -1) - (num(a, 'yield') ?? -1);
			});
			for (const row of rows) {
				const net = num(row, 'net');
				const minimum = num(row, 'minimum');
				row.querySelector('[data-mmf-earn]').textContent = net === null ? '-' : `${state.currency} ${format(amount * net / 100)}`;
				const tooSmall = minimum !== null && amount < minimum;
				row.classList.toggle('is-below-minimum', tooSmall);
				row.hidden = joinable.checked && tooSmall;
				if (!row.hidden) shown += 1;
				body.append(row);
			}
		}
		empty.hidden = shown > 0;
		store(state);
	}

	buttons.forEach((b) => b.addEventListener('click', () => { state.currency = b.dataset.mmfCurrency; draw(); }));
	amountInput.addEventListener('input', () => {
		state.amounts[state.currency] = Math.max(0, parseFloat(amountInput.value) || 0);
		draw();
	});
	joinable.addEventListener('change', draw);
	sort.addEventListener('change', draw);

	controls.hidden = false;
	root.classList.add('is-enhanced');
	draw();
}

