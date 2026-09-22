// Client-side search over the index Ursus generates at build time.
//
// The index file also ships a serialised Lunr index, but loading Lunr costs
// ~30 KB before a single result appears. The corpus here is a few hundred
// short documents, so a scored substring match is both faster to first result
// and cheaper on a metered connection.

const INDEX_URL = '/search-index.json';
const MAX_RESULTS = 25;

let documentsPromise = null;

function loadDocuments() {
	if (!documentsPromise) {
		documentsPromise = fetch(INDEX_URL)
			.then((response) => (response.ok ? response.json() : { documents: {} }))
			.then((data) => Object.values(data.documents || {}))
			.catch(() => []);
	}
	return documentsPromise;
}

function score(doc, needle) {
	const fields = [
		[doc.title, 3],
		[doc.short_title, 3],
		[doc.local_term, 4],
		[doc.english_term, 2],
		[doc.url, 1],
	];

	let total = 0;
	for (const [value, weight] of fields) {
		if (!value) continue;
		const haystack = String(value).toLowerCase();
		const position = haystack.indexOf(needle);
		if (position === -1) continue;

		// An exact match beats a prefix match beats a match buried mid-string.
		if (haystack === needle) total += weight * 4;
		else if (position === 0) total += weight * 2;
		else total += weight;
	}
	return total;
}

function render(results, list, status, query) {
	list.replaceChildren();

	if (!query) {
		status.textContent = '';
		return;
	}

	if (!results.length) {
		status.textContent = 'Nothing matches "' + query + '".';
		return;
	}

	status.textContent =
		results.length + (results.length === 1 ? ' result' : ' results') + ' for "' + query + '"';

	for (const doc of results) {
		const item = document.createElement('li');
		const link = document.createElement('a');
		link.href = doc.url || '#';

		const heading = document.createElement('h3');
		heading.textContent = doc.short_title || doc.title || doc.local_term || doc.url;
		link.append(heading);

		if (doc.english_term) {
			const description = document.createElement('p');
			description.textContent = doc.english_term;
			link.append(description);
		}

		item.append(link);
		list.append(item);
	}
}

export default function initializeSearch() {
	const form = document.getElementById('search-page-form');
	const input = document.getElementById('search-page-input');
	const list = document.getElementById('search-results');
	const status = document.getElementById('search-status');
	if (!form || !input || !list || !status) return;

	form.addEventListener('submit', (event) => event.preventDefault());

	const run = async () => {
		const query = input.value.trim().toLowerCase();
		if (!query) return render([], list, status, '');

		const documents = await loadDocuments();
		const results = documents
			.map((doc) => ({ doc, value: score(doc, query) }))
			.filter((result) => result.value > 0)
			.sort((a, b) => b.value - a.value)
			.slice(0, MAX_RESULTS)
			.map((result) => result.doc);

		render(results, list, status, input.value.trim());
	};

	input.addEventListener('input', run);

	// A query in the URL means the reader arrived from the header search box.
	const initial = new URLSearchParams(window.location.search).get('q');
	if (initial) {
		input.value = initial;
		run();
	}
}
