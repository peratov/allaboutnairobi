// The /glossary A-Z: a filter, language chips, and a letter strip that follows.
//
// Measured at 393x851 it was 18 screens of 113 definitions, and the only way
// to find a word was a sticky block of 24 letter buttons wrapped over three
// rows - 114px of the screen, 27px targets. Somebody arriving here usually has
// one word in mind, so the filter is the main control: it matches the term,
// its English meaning and the definition, all of which are already on the page.

const fold = (text) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function initializeGlossaryIndex() {
	const index = document.querySelector('.glossary-index');
	if (!index || index.dataset.ready) return;
	index.dataset.ready = 'true';

	const input = document.getElementById('glossary-filter-input');
	const status = document.querySelector('.glossary-filter-status');
	const chips = [...document.querySelectorAll('.glossary-lang')];
	const jump = document.querySelector('.glossary-jump');
	const letters = jump ? [...jump.querySelectorAll('a[data-letter]')] : [];
	const groups = [...index.querySelectorAll('.glossary-group')];
	const empty = index.querySelector('.glossary-empty');
	const search = index.querySelector('.glossary-empty-search');

	const terms = [...index.querySelectorAll('.glossary-term')].map((term) => ({
		term,
		language: term.dataset.language,
		words: fold(`${term.textContent} ${term.dataset.english || ''}`),
		// A match in the word itself should beat one deep in a definition.
		name: fold(term.querySelector('dt a')?.textContent || ''),
	}));

	let language = '';

	const run = () => {
		const query = fold(input?.value || '').trim();
		const words = query.split(/\s+/).filter(Boolean);
		let count = 0;

		for (const item of terms) {
			const show = (!language || item.language === language)
				&& words.every((word) => item.words.includes(word));
			item.term.hidden = !show;
			if (show) count += 1;
		}

		for (const group of groups) {
			const any = group.querySelector('.glossary-term:not([hidden])');
			group.hidden = !any;
			const link = letters.find((a) => a.dataset.letter === group.dataset.letter);
			if (link) {
				link.classList.toggle('is-empty', !any);
				if (any) link.removeAttribute('aria-disabled');
				else link.setAttribute('aria-disabled', 'true');
			}
		}

		const filtering = Boolean(words.length || language);
		status.textContent = filtering ? (count ? `${count} word${count === 1 ? '' : 's'}` : '') : '';
		empty.hidden = count > 0;
		if (search) search.href = `${search.href.split('?')[0]}${query ? `?q=${encodeURIComponent(input.value.trim())}` : ''}`;
		spy();
	};

	if (input) {
		input.addEventListener('input', run);
		input.addEventListener('keydown', (event) => {
			if (event.key === 'Escape' && input.value) { input.value = ''; run(); }
			// Enter on a filter that leaves one word, or names one exactly, opens it.
			if (event.key === 'Enter') {
				const visible = terms.filter((item) => !item.term.hidden);
				const query = fold(input.value).trim();
				const target = visible.find((item) => item.name === query) || (visible.length === 1 ? visible[0] : null);
				if (target) {
					event.preventDefault();
					location.href = target.term.querySelector('dt a').href;
				}
			}
		});
	}

	for (const chip of chips) {
		chip.addEventListener('click', () => {
			language = chip.dataset.language === language ? '' : chip.dataset.language;
			for (const other of chips) {
				const on = other.dataset.language === language;
				other.classList.toggle('is-on', on);
				other.setAttribute('aria-pressed', String(on));
			}
			run();
		});
	}

	// A letter whose group the filter emptied goes nowhere.
	for (const link of letters) {
		link.addEventListener('click', (event) => {
			if (link.classList.contains('is-empty')) event.preventDefault();
		});
	}

	// The letter strip lights the letter being read and, on a phone where it is
	// one scrolling row, keeps that letter in view.
	let current = null;
	function mark(letter) {
		if (letter === current) return;
		current = letter;
		for (const link of letters) {
			const on = link.dataset.letter === letter;
			link.classList.toggle('is-current', on);
			if (on) {
				link.setAttribute('aria-current', 'true');
				if (jump.scrollWidth > jump.clientWidth) {
					const left = link.offsetLeft - jump.clientWidth / 2 + link.offsetWidth / 2;
					jump.scrollTo({ left: Math.max(0, left), behavior: reducedMotion() ? 'auto' : 'smooth' });
				}
			} else link.removeAttribute('aria-current');
		}
	}

	// The current group is the last whose heading has passed under the strip.
	// Measured on scroll, at most once a frame.
	let queued = false;
	function spy() {
		if (!jump) return;
		const line = jump.getBoundingClientRect().bottom + 8;
		let found = null;
		for (const group of groups) {
			if (group.hidden) continue;
			if (group.getBoundingClientRect().top <= line) found = group.dataset.letter;
			else break;
		}
		mark(found);
	}
	window.addEventListener('scroll', () => {
		if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; spy(); }); }
	}, { passive: true });

	// A browser restoring the field on back should restore the result too.
	if (input?.value) run();
	else spy();
}
