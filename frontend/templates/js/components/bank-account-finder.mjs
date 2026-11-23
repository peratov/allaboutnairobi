// The bank account finder: a few taps, then the accounts to ask for and one
// list of what to bring.
//
// The page arrives with every account rendered in full, each with its own
// documents (_blocks/bankAccountFinder.html) - that is the page without
// scripting. This shows the questions, keeps the accounts that fit, and merges
// their documents into one list. The rules, from content/geo/bank-accounts.yaml:
//
// - An account fits when it is for where the reader is (`data-scope`) and any
//   of its `data-when` answers is given; an empty list means always.
// - In Kenya with no account matched, savings.
// - A foreign resident also brings a permit or pass, and proof of address.
// - Abroad, an account with `data-docs-abroad` rides on the non-resident
//   account's documents and adds only its own.
//
// Answers are kept on this device as aan:bank-finder; nothing is sent.

const KEY = 'aan:bank-finder';

function load() {
	try { return JSON.parse(localStorage.getItem(KEY) || 'null') || {}; } catch { return {}; }
}

function save(answers) {
	try { localStorage.setItem(KEY, JSON.stringify(answers)); } catch { /* fine for the visit */ }
}

export default function initializeBankAccountFinder() {
	const root = document.querySelector('[data-bank-finder]');
	if (!root || root.dataset.ready) return;
	root.dataset.ready = 'true';
	root.classList.add('is-enhanced');

	const form = root.querySelector('[data-baf-form]');
	const result = root.querySelector('[data-baf-result]');
	const accounts = [...root.querySelectorAll('[data-account]')];
	const docItems = [...root.querySelectorAll('[data-doc]')];
	const questions = [...form.querySelectorAll('[data-baf-question]')];
	form.hidden = false;
	result.hidden = false;
	root.querySelector('[data-baf-accounts-heading]').textContent = 'The accounts, and why';

	// Put back this reader's answers.
	const saved = load();
	form.querySelectorAll('input').forEach((input) => {
		const id = input.name.slice('baf-'.length);
		if (!(id in saved)) return;
		const value = saved[id];
		input.checked = Array.isArray(value) ? value.includes(input.value) : value === input.value;
	});

	function answers() {
		const out = {};
		questions.forEach((fieldset) => {
			const id = fieldset.dataset.bafQuestion;
			const checked = [...fieldset.querySelectorAll('input:checked')].map((i) => i.value);
			out[id] = fieldset.classList.contains('is-multiple') ? checked : (checked[0] ?? null);
		});
		return out;
	}

	function update() {
		const a = answers();
		save(a);
		const where = a.where || 'kenya';

		// A question that only applies in Kenya is hidden abroad.
		questions.forEach((fieldset) => {
			const only = fieldset.dataset.only ? JSON.parse(fieldset.dataset.only) : {};
			fieldset.hidden = !Object.entries(only).every(([q, v]) => a[q] === v);
		});

		const given = new Set([where, ...(a.uses || [])]);
		let fits = accounts.filter((el) => {
			const scope = el.dataset.scope;
			if (scope !== 'both' && scope !== where) return false;
			const when = JSON.parse(el.dataset.when);
			return when.length === 0 || when.some((v) => given.has(v));
		});
		if (where === 'kenya' && !fits.length) fits = accounts.filter((el) => el.dataset.account === 'savings');
		// Abroad, the account that makes the rest possible is named first.
		fits.sort((x, y) => (y.dataset.scope === 'abroad') - (x.dataset.scope === 'abroad'));

		accounts.forEach((el) => { el.hidden = !fits.includes(el); });

		const asks = fits.map((el) => el.dataset.ask);
		const ask = asks.length > 1 ? `${asks.slice(0, -1).join(', ')} and ${asks[asks.length - 1]}` : asks[0] || '';
		root.querySelector('[data-baf-ask]').textContent = ask.charAt(0).toUpperCase() + ask.slice(1);

		// One list to bring, in the order the documents are defined.
		const needed = new Set();
		fits.forEach((el) => {
			const docs = where === 'abroad' && el.dataset.docsAbroad ? el.dataset.docsAbroad : el.dataset.docs;
			JSON.parse(docs).forEach((key) => needed.add(key));
		});
		if (where === 'kenya' && a.who === 'resident') { needed.add('permit'); needed.add('address'); }
		docItems.forEach((li) => { li.hidden = !needed.has(li.dataset.doc); });

		root.querySelector('[data-baf-nocard]').hidden = !(where === 'kenya' && a.card === 'no');

		const online = root.querySelector('[data-baf-online]');
		online.replaceChildren();
		const notes = [...new Set(fits.map((el) => el.dataset.online))];
		if (notes.length) {
			const label = document.createElement('strong');
			label.textContent = fits.length > 1 ? 'Online or at a branch: ' : 'Online or at a branch? ';
			online.append(label, notes.join(' '));
		}
	}

	form.addEventListener('change', update);
	form.addEventListener('submit', (event) => event.preventDefault());
	update();
}
