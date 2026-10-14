// The /guides index: subjects that open on a phone, and a filter over titles.
//
// The page was twelve screens on a phone - sixteen subjects and 180 links, each
// 22px tall, with a block of wrapped chips in front of the first one. Now each
// subject is a row that opens (the CSS draws that form only below 40rem, and
// only with scripting), and a filter narrows all 165 titles at once, which is
// faster than scrolling for anyone who knows roughly what they want.
//
// The filter reads the links already on the page, so it needs no index and no
// request. It matches each guide's short title, full title and description
// (`data-terms`), not its text; the empty state points at /search, which does.

const fold = (text) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default function initializeGuideIndex() {
	const grid = document.querySelector('.guide-grid');
	if (!grid || grid.dataset.ready) return;
	grid.dataset.ready = 'true';

	const groups = [...grid.querySelectorAll('.guide-group')];
	const input = document.getElementById('guide-filter-input');
	const status = document.querySelector('.guide-filter-status');
	const empty = grid.querySelector('.guide-filter-empty');
	const search = grid.querySelector('.guide-filter-search');

	const setOpen = (group, open) => {
		group.classList.toggle('is-open', open);
		group.querySelector('.guide-group-toggle')?.setAttribute('aria-expanded', String(open));
	};

	for (const group of groups) {
		group.querySelector('.guide-group-toggle')?.addEventListener('click', () => {
			setOpen(group, !group.classList.contains('is-open'));
		});
	}

	// A link to /guides#money opens that subject, on arrival and after.
	const applyHash = () => {
		const group = groups.find((g) => `#${g.id}` === location.hash);
		if (!group) return;
		setOpen(group, true);
		group.scrollIntoView({ block: 'start' });
	};
	window.addEventListener('hashchange', applyHash);
	applyHash();

	if (!input) return;

	// Each list item knows its own words and its subject's, so "tax" finds the
	// money guides and "housing" finds every guide filed under it.
	const items = groups.flatMap((group) => {
		const subject = fold(group.querySelector('.guide-group-link')?.textContent || '');
		return [...group.querySelectorAll('li')].map((li) => {
			const own = li.querySelector(':scope > a, :scope > .collection-heading');
			const words = own ? `${own.textContent} ${own.dataset.terms || ''}` : '';
			return { li, group, words: fold(words), subject, isLink: Boolean(li.querySelector(':scope > a')) };
		});
	});

	const run = () => {
		const terms = fold(input.value).split(/\s+/).filter(Boolean);
		const filtering = terms.length > 0;
		grid.classList.toggle('is-filtering', filtering);
		// "Start here" and "New and updated" step aside while filtering, so the
		// matches are the first thing below the box.
		grid.closest('main')?.classList.toggle('is-filtering', filtering);

		if (!filtering) {
			for (const { li } of items) li.hidden = false;
			for (const group of groups) {
				group.hidden = false;
				// Back to how the reader left it before typing.
				setOpen(group, group.dataset.wasOpen === 'true');
				delete group.dataset.wasOpen;
			}
			status.textContent = '';
			empty.hidden = true;
			return;
		}

		for (const group of groups) {
			if (!('wasOpen' in group.dataset)) group.dataset.wasOpen = String(group.classList.contains('is-open'));
		}

		// Decide each item on its own words, then walk back up so a heading or a
		// parent guide stays visible when something under it matches.
		const shown = new Set();
		for (const item of items) {
			const hay = `${item.words} ${item.subject}`;
			if (item.isLink && terms.every((term) => hay.includes(term))) shown.add(item.li);
		}
		for (const li of [...shown]) {
			let parent = li.parentElement?.closest('li');
			while (parent) { shown.add(parent); parent = parent.parentElement?.closest('li'); }
		}

		let count = 0;
		for (const item of items) {
			item.li.hidden = !shown.has(item.li);
			if (item.isLink && shown.has(item.li) && terms.every((t) => `${item.words} ${item.subject}`.includes(t))) count += 1;
		}
		for (const group of groups) {
			const any = [...group.querySelectorAll('li')].some((li) => !li.hidden);
			group.hidden = !any;
			setOpen(group, any);
		}

		status.textContent = count ? `${count} guide${count === 1 ? '' : 's'}` : '';
		empty.hidden = count > 0;
		if (search) search.href = `${search.href.split('?')[0]}?q=${encodeURIComponent(input.value.trim())}`;
	};

	input.addEventListener('input', run);
	input.addEventListener('keydown', (event) => {
		if (event.key === 'Escape' && input.value) { input.value = ''; run(); }
	});
	// A browser restoring the field on back should restore the result too.
	if (input.value) run();
}
