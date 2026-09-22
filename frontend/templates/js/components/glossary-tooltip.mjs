// Show a definition when the reader hovers or focuses a [[glossary]] link.
let termsPromise = null;

function loadTerms() {
	if (!termsPromise) {
		termsPromise = fetch('/api/glossary.json')
			.then((response) => (response.ok ? response.json() : {}))
			.catch(() => ({}));
	}
	return termsPromise;
}

function termFromHref(href) {
	const match = href.match(/\/glossary\/(.+)$/);
	return match ? decodeURIComponent(match[1]) : null;
}

export default function initializeGlossaryTooltips() {
	const links = document.querySelectorAll('a.glossary-link');
	if (!links.length) return;

	let tooltip = null;

	const hide = () => {
		if (tooltip) {
			tooltip.remove();
			tooltip = null;
		}
	};

	const show = async (link) => {
		const term = termFromHref(link.getAttribute('href') || '');
		if (!term) return;

		const terms = await loadTerms();
		const record = terms[term];
		if (!record || !record.description) return;

		hide();

		tooltip = document.createElement('div');
		tooltip.className = 'glossary-tooltip';
		tooltip.setAttribute('role', 'tooltip');

		const name = document.createElement('strong');
		name.textContent = record.local_term || term;
		tooltip.append(name);

		if (record.language) {
			const language = document.createElement('span');
			language.className = 'glossary-language';
			language.textContent = record.language;
			tooltip.append(language);
		}

		tooltip.append(document.createTextNode(record.description));
		document.body.append(tooltip);

		// Position under the link, nudged back inside the viewport if it would
		// otherwise run off the right edge on a narrow phone.
		const rect = link.getBoundingClientRect();
		const width = tooltip.offsetWidth;
		const left = Math.min(
			rect.left + window.scrollX,
			window.scrollX + document.documentElement.clientWidth - width - 8
		);
		tooltip.style.left = Math.max(8, left) + 'px';
		tooltip.style.top = rect.bottom + window.scrollY + 6 + 'px';
	};

	links.forEach((link) => {
		link.addEventListener('mouseenter', () => show(link));
		link.addEventListener('focus', () => show(link));
		link.addEventListener('mouseleave', hide);
		link.addEventListener('blur', hide);
	});

	document.addEventListener('keydown', (event) => {
		if (event.key === 'Escape') hide();
	});

	window.addEventListener('scroll', hide, { passive: true });
}
