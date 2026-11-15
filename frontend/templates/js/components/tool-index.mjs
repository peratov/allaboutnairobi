// The /tools filter. Every card already carries its words as data-terms (the
// title, the card's line and the page's own description), so nothing is
// fetched. Accents are folded, so "ete sen" finds the phrasebook.

function fold(text) {
	return text
		.toLowerCase()
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/ɛ/g, 'e')
		.replace(/ɔ/g, 'o')
		.replace(/\s+/g, ' ')
		.trim();
}

export default function initializeToolIndex() {
	const root = document.querySelector('[data-tool-index]');
	if (!root || root.dataset.ready) return;
	root.dataset.ready = 'true';

	const find = root.querySelector('[data-tix-find]');
	const input = root.querySelector('[data-tix-filter]');
	const empty = root.querySelector('[data-tix-empty]');
	const search = root.querySelector('[data-tix-search]');
	const groups = [...root.querySelectorAll('[data-tix-group]')];
	// Each typed word must start a word on the card, so "rent" does not find
	// "parent" or "different".
	const items = [...root.querySelectorAll('[data-tix-item]')].map((li) => [li, fold(li.dataset.terms).split(/[^a-z0-9]+/)]);
	find.hidden = false;

	function update() {
		const words = fold(input.value).split(/[^a-z0-9]+/).filter(Boolean);
		let shown = 0;
		items.forEach(([li, terms]) => {
			const match = words.every((w) => terms.some((t) => t.startsWith(w)));
			li.hidden = !match;
			if (match) shown += 1;
		});
		groups.forEach((g) => { g.hidden = !g.querySelector('[data-tix-item]:not([hidden])'); });
		root.classList.toggle('is-filtering', words.length > 0);
		empty.hidden = shown > 0;
		const q = input.value.trim();
		search.href = `/search${q ? `?q=${encodeURIComponent(q)}` : ''}`;
	}

	input.addEventListener('input', update);
	input.addEventListener('keydown', (event) => {
		if (event.key === 'Escape' && input.value) {
			input.value = '';
			update();
		}
	});
}
