// The paperwork planner: one plan at a time, tailored by a question or two,
// with ticks that stay on this device.
//
// The page arrives with every plan rendered in full (_blocks/paperworkPlanner.html),
// which is what a reader without scripting and a crawler see. This shows a
// chooser, then the chosen plan alone. A step whose `data-when` names an
// answer the reader has not given is hidden, and the numbering skips it.
// Answers and ticks are kept in localStorage as aan:paperwork, keyed by plan
// and step id, and nothing is sent anywhere.

const KEY = 'aan:paperwork';

function load() {
	try {
		const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
		return saved && typeof saved === 'object' ? saved : {};
	} catch {
		return {};
	}
}

function save(state) {
	try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private window: ticks last the visit */ }
}

export default function initializePaperworkPlanner() {
	const root = document.querySelector('[data-paperwork]');
	if (!root || root.dataset.ready) return;
	root.dataset.ready = 'true';
	root.classList.add('is-enhanced');

	const state = load();
	const plans = new Map([...root.querySelectorAll('[data-plan]')].map((el) => [el.dataset.plan, el]));
	const chooser = root.querySelector('[data-pw-choose]');
	const current = chooser.querySelector('[data-pw-current]');
	const change = chooser.querySelector('[data-pw-change]');
	let open = null;
	chooser.hidden = false;
	root.querySelectorAll('[data-pw-questions], [data-pw-progress], [data-pw-actions], [data-pw-tick]')
		.forEach((el) => { el.hidden = false; });

	const record = (id) => {
		state[id] ||= { answers: {}, done: [] };
		state[id].answers ||= {};
		state[id].done ||= [];
		return state[id];
	};

	function answersOf(plan) {
		const out = {};
		plan.querySelectorAll('input[data-pw-q]:checked').forEach((input) => { out[input.dataset.pwQ] = input.value; });
		return out;
	}

	// Show the steps that apply, mark the ticked ones, and count.
	function refresh(id) {
		const plan = plans.get(id);
		const saved = record(id);
		const answers = answersOf(plan);
		let shown = 0;
		let done = 0;
		plan.querySelectorAll('.pw-step').forEach((step) => {
			const when = step.dataset.when ? JSON.parse(step.dataset.when) : {};
			const applies = Object.entries(when).every(([q, v]) => answers[q] === v);
			step.hidden = !applies;
			const isDone = saved.done.includes(step.dataset.step);
			step.classList.toggle('is-done', isDone);
			step.querySelector('[data-pw-tick]').setAttribute('aria-pressed', String(isDone));
			if (applies) {
				shown += 1;
				if (isDone) done += 1;
			}
		});
		const pct = `${shown ? (done / shown) * 100 : 0}%`;
		const complete = shown > 0 && done === shown;
		plan.querySelector('[data-pw-progress-text]').textContent =
			complete ? `All ${shown} steps done` : `${done} of ${shown} steps done`;
		plan.querySelector('[data-pw-progress-fill]').style.width = pct;
		plan.classList.toggle('is-complete', complete);

		// The first step that applies and is not ticked is the one to do now.
		const steps = [...plan.querySelectorAll('.pw-step')];
		const next = steps.find((step) => !step.hidden && !step.classList.contains('is-done'));
		steps.forEach((step) => step.classList.toggle('is-next', step === next));
		const nextLine = plan.querySelector('[data-pw-next]');
		nextLine.hidden = !next;
		if (next) {
			const link = nextLine.querySelector('[data-pw-next-link]');
			link.textContent = next.querySelector('h3').textContent;
			link.href = `#${next.id}`;
		}

		const count = chooser.querySelector(`[data-pw-count="${id}"]`);
		if (count) count.textContent = complete ? 'All done' : done ? `${done} of ${shown} done` : `${shown} steps`;
		const fill = chooser.querySelector(`[data-pw-task-fill="${id}"]`);
		if (fill) {
			fill.style.width = pct;
			fill.closest('.pw-task').classList.toggle('is-started', done > 0);
		}

		if (id === open) {
			current.querySelector('[data-pw-current-count]').textContent =
				complete ? `All ${shown} steps done` : `${done} of ${shown} steps done`;
			current.querySelector('[data-pw-current-fill]').style.width = pct;
		}
	}

	// With a plan open, the grid of tasks folds away behind a bar that names
	// the plan, and Change opens it again.
	function setChoosing(on) {
		root.classList.toggle('is-choosing', on);
		change.setAttribute('aria-expanded', String(on));
		change.textContent = on ? 'Close' : 'Change';
	}
	change.addEventListener('click', () => {
		const on = !root.classList.contains('is-choosing');
		setChoosing(on);
		if (on) chooser.querySelector('.pw-task[aria-current]')?.focus();
	});

	function choose(id, { scroll = true, push = true } = {}) {
		if (!plans.has(id)) return;
		plans.forEach((plan, key) => { plan.hidden = key !== id; });
		chooser.querySelectorAll('[data-pw-pick]').forEach((a) => {
			a.toggleAttribute('aria-current', a.dataset.pwPick === id);
		});
		root.classList.add('has-plan');
		open = id;
		current.hidden = false;
		current.querySelector('[data-pw-current-title]').textContent = plans.get(id).dataset.short;
		const icon = chooser.querySelector(`[data-pw-pick="${id}"] .icon-stamp`);
		current.querySelector('[data-pw-current-icon]').replaceChildren(...(icon ? [icon.cloneNode(true)] : []));
		setChoosing(false);
		refresh(id);
		if (push) history.replaceState(history.state, '', `#plan=${id}`);
		if (scroll) {
			const plan = plans.get(id);
			const top = plan.getBoundingClientRect().top + scrollY - 150;
			window.scrollTo({ top, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
			plan.querySelector('h2').focus({ preventScroll: true });
		}
	}

	plans.forEach((plan, id) => {
		plan.querySelector('h2').tabIndex = -1;
		const saved = record(id);

		// Put back this reader's answers.
		plan.querySelectorAll('input[data-pw-q]').forEach((input) => {
			if (saved.answers[input.dataset.pwQ] === input.value) input.checked = true;
			input.addEventListener('change', () => {
				saved.answers[input.dataset.pwQ] = input.value;
				save(state);
				refresh(id);
			});
		});

		plan.querySelectorAll('[data-pw-tick]').forEach((button) => {
			button.addEventListener('click', () => {
				const step = button.closest('.pw-step').dataset.step;
				saved.done = saved.done.includes(step)
					? saved.done.filter((s) => s !== step)
					: [...saved.done, step];
				save(state);
				refresh(id);
			});
		});

		plan.querySelector('[data-pw-reset]').addEventListener('click', () => {
			saved.done = [];
			save(state);
			refresh(id);
		});

		plan.querySelector('[data-pw-print]').addEventListener('click', () => {
			document.documentElement.classList.add('is-printing-plan');
			const done = () => document.documentElement.classList.remove('is-printing-plan');
			window.addEventListener('afterprint', done, { once: true });
			window.print();
			setTimeout(() => document.addEventListener('pointerdown', done, { once: true }), 500);
		});

		refresh(id);
	});

	// On a phone the support chip sat on the ticks at the right edge; it steps
	// aside while a plan's steps are on screen, as it does for the calculators.
	const phone = window.matchMedia('(max-width: 40rem)');
	const seen = new Set();
	const yieldChip = () =>
		document.querySelector('.support-float')?.classList.toggle('is-yielding-tool', seen.size > 0 && phone.matches);
	if ('IntersectionObserver' in window) {
		const observer = new IntersectionObserver((entries) => {
			entries.forEach((entry) => {
				if (entry.isIntersecting) seen.add(entry.target);
				else seen.delete(entry.target);
			});
			yieldChip();
		});
		root.querySelectorAll('.pw-steps').forEach((list) => observer.observe(list));
		phone.addEventListener?.('change', yieldChip);
	}

	// A tile, or a "see the plan for ..." link inside a step.
	root.addEventListener('click', (event) => {
		const link = event.target.closest('[data-pw-pick]');
		if (link) {
			event.preventDefault();
			choose(link.dataset.pwPick);
			return;
		}
		// "Next": scroll to the step without writing its id over #plan=.
		const next = event.target.closest('[data-pw-next-link]');
		if (next) {
			event.preventDefault();
			const step = document.getElementById(next.getAttribute('href').slice(1));
			if (!step) return;
			const top = step.getBoundingClientRect().top + scrollY - 160;
			window.scrollTo({ top, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
			step.querySelector('[data-pw-tick]').focus({ preventScroll: true });
		}
	});

	// #plan=kra-pin opens that plan; with no plan named, the chooser waits and
	// every plan stays hidden under it.
	const fromHash = () => {
		const match = location.hash.match(/^#plan=([\w-]+)/);
		return match && plans.has(match[1]) ? match[1] : null;
	};
	window.addEventListener('hashchange', () => {
		const id = fromHash();
		if (id) choose(id, { push: false });
	});

	const first = fromHash();
	if (first) {
		choose(first, { push: false });
	} else {
		plans.forEach((plan) => { plan.hidden = true; });
	}
}
