// The insurance checker: tick what you own and do, and see the cover the law
// requires, the cover to ask about, and the cover worth weighing.
//
// The page arrives with every cover rendered, grouped by what the law says
// (_blocks/insuranceChecker.html) - that is the page without scripting. This
// shows the ticks and keeps the covers that fit. The rules, from
// content/geo/insurance-checker.yaml:
//
// - A cover fits when any of its `data-when` answers is ticked; an empty list
//   means always (NHIS).
// - A note shows only when its own answer is ticked.
// - A group with nothing left in it is hidden.
//
// Answers are kept on this device as aan:insurance-checker; nothing is sent.

const KEY = 'aan:insurance-checker';

function load() {
	try { return JSON.parse(localStorage.getItem(KEY) || 'null') || []; } catch { return []; }
}

function save(ticked) {
	try { localStorage.setItem(KEY, JSON.stringify(ticked)); } catch { /* fine for the visit */ }
}

function list(names) {
	return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0] || '';
}

export default function initializeInsuranceChecker() {
	const root = document.querySelector('[data-insurance-checker]');
	if (!root || root.dataset.ready) return;
	root.dataset.ready = 'true';
	root.classList.add('is-enhanced');

	const form = root.querySelector('[data-ins-form]');
	const answer = root.querySelector('[data-ins-answer]');
	const groups = [...root.querySelectorAll('[data-ins-group]')];
	const covers = [...root.querySelectorAll('[data-cover]')];
	const inputs = [...form.querySelectorAll('input')];
	form.hidden = false;
	answer.hidden = false;

	const saved = new Set(load());
	inputs.forEach((input) => { input.checked = saved.has(input.value); });

	function update() {
		const ticked = new Set(inputs.filter((i) => i.checked).map((i) => i.value));
		save([...ticked]);

		covers.forEach((el) => {
			const when = JSON.parse(el.dataset.when);
			el.hidden = !(when.length === 0 || when.some((v) => ticked.has(v)));
			el.querySelectorAll('[data-note]').forEach((note) => { note.hidden = !ticked.has(note.dataset.note); });
		});
		groups.forEach((g) => { g.hidden = !g.querySelector('[data-cover]:not([hidden])'); });

		const shown = (kind) => covers.filter((el) => !el.hidden && el.classList.contains(`is-${kind}`));
		const required = shown('required').map((el) => el.dataset.short);
		const check = shown('check').length;
		const consider = shown('consider').length;

		const value = root.querySelector('[data-ins-required]');
		const detail = root.querySelector('[data-ins-detail]');
		const label = root.querySelector('[data-ins-label]');
		label.textContent = ticked.size ? 'The law requires you to have' : 'What insurance do you need?';
		answer.classList.toggle('is-none', !required.length);
		if (!ticked.size) {
			value.textContent = 'Tick what applies to you';
			detail.textContent = 'Until then, the one cover everyone should hold is below.';
			return;
		}
		const sentence = `${list(required)} insurance`;
		value.textContent = required.length ? sentence.charAt(0).toUpperCase() + sentence.slice(1) : 'Nothing you ticked';
		const parts = [];
		if (check) parts.push(`${check} more to ask about`);
		if (consider) parts.push(`${consider} worth considering`);
		detail.textContent = parts.length ? `Plus ${list(parts)}, below.` : '';
	}

	form.addEventListener('change', update);
	form.addEventListener('submit', (event) => event.preventDefault());
	update();
}
