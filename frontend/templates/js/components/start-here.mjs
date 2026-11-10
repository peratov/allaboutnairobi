// "Start here" on the home page: tick a step off, see how far along you are.
//
// The ticks are kept on this device only (localStorage), like a guide's
// checklist - nothing is sent anywhere. Without scripting, or with storage
// blocked, the steps are an ordinary numbered list and the ticks stay hidden.

const KEY = 'aan:start-here';

const read = () => {
	try { return new Set(JSON.parse(localStorage.getItem(KEY)) || []); } catch { return new Set(); }
};
const write = (done) => {
	try { localStorage.setItem(KEY, JSON.stringify([...done])); } catch { /* this visit only */ }
};

export default function initializeStartHere() {
	const root = document.querySelector('[data-start-here]');
	if (!root || root.dataset.ready) return;
	root.dataset.ready = 'true';

	const steps = [...root.querySelectorAll('[data-step]')];
	const progress = root.querySelector('[data-start-progress]');
	const count = root.querySelector('[data-start-count]');
	const fill = root.querySelector('[data-start-fill]');
	const done = read();

	function draw() {
		for (const step of steps) {
			const on = done.has(step.dataset.step);
			step.classList.toggle('is-done', on);
			const button = step.querySelector('[data-start-check]');
			button.setAttribute('aria-pressed', String(on));
			const title = step.querySelector('strong')?.textContent || 'This step';
			button.setAttribute('aria-label', on ? `${title}: done. Press to undo` : `${title}: mark as done`);
		}
		const n = steps.filter((s) => done.has(s.dataset.step)).length;
		count.textContent = n === steps.length ? `All ${n} done. Welcome to Nairobi.` : `${n} of ${steps.length} done`;
		fill.style.width = `${Math.round((n / steps.length) * 100)}%`;
		root.classList.toggle('is-complete', n === steps.length);
	}

	for (const step of steps) {
		const button = step.querySelector('[data-start-check]');
		button.hidden = false;
		button.addEventListener('click', () => {
			const id = step.dataset.step;
			if (done.has(id)) done.delete(id);
			else done.add(id);
			write(done);
			draw();
		});
	}
	progress.hidden = false;
	draw();
}
