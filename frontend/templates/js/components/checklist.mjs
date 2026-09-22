// Remember which checklist boxes are ticked, and show how far through you are.
//
// Most of these lists are things you do standing in a queue at the NIA or the
// DVLA, on a phone, over several visits. Losing your place because the page
// reloaded is genuinely annoying.
//
// Ticks are keyed by a hash of the item's own text, NOT by its position in the
// list. Position was the original scheme and it was quietly wrong: adding a
// document to a guide shifted every saved tick below it onto the wrong line,
// so somebody came back to a list claiming they had already collected things
// they had not. Keying on the text means an edited item loses its own tick and
// nothing else does, which is the correct behaviour - the item changed.

const STORAGE_PREFIX = 'aaa:checklist:';
const STORAGE_VERSION = 'v2';

/**
 * A short stable hash of an item's text.
 *
 * FNV-1a. Not cryptographic and does not need to be - it only has to be
 * stable across visits and distinct between the items of one list.
 */
function keyFor(text) {
	const normalised = text.replace(/\s+/g, ' ').trim().toLowerCase();
	let hash = 0x811c9dc5;
	for (let i = 0; i < normalised.length; i += 1) {
		hash ^= normalised.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(36);
}

function read(storageKey) {
	try {
		const raw = localStorage.getItem(storageKey);
		const parsed = raw ? JSON.parse(raw) : {};
		return parsed && typeof parsed === 'object' ? parsed : {};
	} catch (error) {
		// Private browsing, storage disabled, or corrupt JSON. The boxes still
		// work for this visit, which is the important part.
		return {};
	}
}

function write(storageKey, state) {
	try {
		const ticked = Object.keys(state).filter((key) => state[key]);
		if (ticked.length) {
			localStorage.setItem(storageKey, JSON.stringify(state));
		} else {
			// An empty list should not leave a key behind.
			localStorage.removeItem(storageKey);
		}
	} catch (error) {
		/* nothing to do, and nothing worth telling the reader */
	}
}

export default function initializeChecklists() {
	const boxes = document.querySelectorAll('li.checkbox input[type="checkbox"]');
	if (!boxes.length) return;

	const storageKey = `${STORAGE_PREFIX}${STORAGE_VERSION}:${window.location.pathname}`;
	const state = read(storageKey);

	// One page can hold several separate lists - "what to bring" and "before
	// you go" - and each gets its own progress line.
	const lists = new Set();

	boxes.forEach((box) => {
		const item = box.closest('li.checkbox');
		const label = item?.querySelector('label');

		// With JavaScript off the boxes still tick - they just forget, which is
		// a better fallback than a disabled box that looks broken. So there is
		// nothing to enable here; the label wrapper is added at build time by
		// ChecklistLabelProcessor, not from this file.
		box.dataset.key = keyFor(label?.textContent || item?.textContent || '');
		if (state[box.dataset.key]) box.checked = true;

		if (item?.parentElement) lists.add(item.parentElement);
	});

	const progressBars = new Map();

	function refresh(list) {
		const bar = progressBars.get(list);
		if (!bar) return;

		const listBoxes = list.querySelectorAll('li.checkbox input[type="checkbox"]');
		const done = [...listBoxes].filter((box) => box.checked).length;
		const total = listBoxes.length;

		bar.count.textContent = done === total
			? `All ${total} done`
			: `${done} of ${total} done`;
		bar.count.classList.toggle('is-complete', done === total && total > 0);
		bar.reset.hidden = done === 0;
	}

	lists.forEach((list) => {
		const count = document.createElement('span');
		count.className = 'checklist-count';

		const reset = document.createElement('button');
		reset.type = 'button';
		reset.className = 'checklist-reset';
		reset.textContent = 'Clear';
		reset.addEventListener('click', () => {
			list.querySelectorAll('li.checkbox input[type="checkbox"]').forEach((box) => {
				box.checked = false;
				delete state[box.dataset.key];
			});
			write(storageKey, state);
			refresh(list);
		});

		const bar = document.createElement('p');
		bar.className = 'checklist-progress';
		// It reads its own count out; announcing every tick would be noise.
		bar.setAttribute('aria-live', 'off');
		bar.append(count, reset);

		list.insertAdjacentElement('afterend', bar);
		progressBars.set(list, { count, reset });
		refresh(list);
	});

	// One listener rather than one per box. Change events from a checkbox
	// bubble, including when the label forwards the click.
	document.addEventListener('change', (event) => {
		const box = event.target;
		if (!(box instanceof HTMLInputElement) || box.type !== 'checkbox') return;
		const item = box.closest('li.checkbox');
		if (!item) return;

		state[box.dataset.key] = box.checked;
		write(storageKey, state);
		refresh(item.parentElement);
	});
}
