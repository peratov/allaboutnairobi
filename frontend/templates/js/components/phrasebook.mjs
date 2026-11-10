// The Swahili phrasebook: find a phrase, show Swahili or Sheng, keep a list.
//
// The page arrives with every phrase rendered (_blocks/phrasebook.html), which
// is the page without scripting. This adds:
//
// - A filter over the English, the Swahili, the Sheng, the sound guide and the note,
//   all already on each row as data-terms, case and spacing folded.
// - Swahili and Sheng, Swahili only, or Sheng only. Sheng only hides the
//   phrases with no lasting Sheng form, rather than showing them blank.
// - A star on each phrase. The saved ids are kept on this device as
//   aan:phrasebook; nothing is sent. A phrase's id is its key, so renaming one
//   in the YAML drops it from readers' lists.

const KEY = 'aan:phrasebook';

function load() {
	try {
		const data = JSON.parse(localStorage.getItem(KEY) || 'null') || {};
		return { lang: data.lang || 'both', saved: new Set(Array.isArray(data.saved) ? data.saved : []) };
	} catch {
		return { lang: 'both', saved: new Set() };
	}
}

function store(state) {
	try {
		localStorage.setItem(KEY, JSON.stringify({ lang: state.lang, saved: [...state.saved] }));
	} catch { /* fine for the visit */ }
}

function fold(text) {
	return text
		.toLowerCase()
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/\s+/g, ' ')
		.trim();
}

const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg>';

export default function initializePhrasebook() {
	const root = document.querySelector('[data-phrasebook]');
	if (!root || root.dataset.ready) return;
	root.dataset.ready = 'true';
	root.classList.add('is-enhanced');

	const controls = root.querySelector('[data-pb-controls]');
	const filter = root.querySelector('[data-pb-filter]');
	const savedButton = root.querySelector('[data-pb-saved]');
	const savedCount = root.querySelector('[data-pb-saved-count]');
	const status = root.querySelector('[data-pb-status]');
	const empty = root.querySelector('[data-pb-empty]');
	const searchLink = root.querySelector('[data-pb-search]');
	const langButtons = [...root.querySelectorAll('[data-pb-lang]')];
	const sections = [...root.querySelectorAll('[data-pb-section]')];
	const phrases = [...root.querySelectorAll('[data-phrase]')];
	controls.hidden = false;

	const state = load();
	let onlySaved = false;
	const terms = new Map(phrases.map((li) => [li, fold(li.dataset.terms)]));

	phrases.forEach((li) => {
		const button = document.createElement('button');
		button.type = 'button';
		button.className = 'pb-star';
		button.innerHTML = STAR;
		const english = li.querySelector('.pb-en').textContent;
		button.setAttribute('aria-label', `Save "${english}"`);
		button.addEventListener('click', () => {
			const id = li.dataset.phrase;
			if (state.saved.has(id)) state.saved.delete(id);
			else state.saved.add(id);
			store(state);
			update();
		});
		li.append(button);
	});

	function update() {
		const query = fold(filter.value);
		const lang = state.lang;
		root.dataset.lang = lang;
		langButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.pbLang === lang)));

		let shown = 0;
		phrases.forEach((li) => {
			const saved = state.saved.has(li.dataset.phrase);
			li.classList.toggle('is-saved', saved);
			li.querySelector('.pb-star').setAttribute('aria-pressed', String(saved));
			const visible = (!query || terms.get(li).includes(query))
				&& (!onlySaved || saved)
				&& (lang !== 'sheng' || li.hasAttribute('data-has-sheng'));
			li.hidden = !visible;
			if (visible) shown += 1;
		});
		sections.forEach((section) => {
			section.hidden = !section.querySelector('[data-phrase]:not([hidden])');
		});

		savedCount.textContent = String(state.saved.size);
		savedButton.setAttribute('aria-pressed', String(onlySaved));

		const filtered = query || onlySaved || lang === 'sheng';
		root.classList.toggle('is-filtering', Boolean(query || onlySaved));
		status.textContent = filtered ? `${shown} ${shown === 1 ? 'phrase' : 'phrases'}` : '';
		empty.hidden = shown > 0;
		if (onlySaved && !state.saved.size) {
			empty.firstChild.textContent = 'Nothing saved yet. Tap the star on a phrase to keep it here. ';
		} else {
			empty.firstChild.textContent = 'Nothing here matches. ';
		}
		searchLink.href = `/search${filter.value.trim() ? `?q=${encodeURIComponent(filter.value.trim())}` : ''}`;
	}

	filter.addEventListener('input', update);
	filter.addEventListener('keydown', (event) => {
		if (event.key === 'Escape' && filter.value) {
			filter.value = '';
			update();
		}
	});
	langButtons.forEach((b) => b.addEventListener('click', () => {
		state.lang = b.dataset.pbLang;
		store(state);
		update();
	}));
	savedButton.addEventListener('click', () => {
		onlySaved = !onlySaved;
		update();
	});
	// A section chip clears the filter, or it could jump to a hidden section.
	root.querySelectorAll('.pb-chip[href]').forEach((a) => a.addEventListener('click', () => {
		if (!filter.value && !onlySaved) return;
		filter.value = '';
		onlySaved = false;
		update();
	}));

	update();
}
