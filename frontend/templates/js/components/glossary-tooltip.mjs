// Definitions for [[glossary]] links in the guides.
//
// With a mouse, hovering or focusing a link shows the definition under it.
//
// A touchscreen has no hover, so on a phone the tooltip never really worked:
// a tap fired a fake hover, the tooltip flashed, and the link navigated away
// from the guide - to read one sentence, then come back and find your place.
// Now the first tap on a glossary link shows the definition in a card at the
// bottom of the screen, with a link to the full entry, and the reader stays
// where they were. A second tap on the same link follows it.

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
	const match = href.match(/\/glossary\/([^?#]+)/);
	return match ? decodeURIComponent(match[1]) : null;
}

export default function initializeGlossaryTooltips() {
	const links = document.querySelectorAll('a.glossary-link');
	if (!links.length) return;

	// --- the mouse and keyboard tooltip -------------------------------------------

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

	// --- the touch card -------------------------------------------------------------

	let card = null;
	let cardLink = null;
	let lastPointer = 'mouse';

	// Which kind of pointer is about to click. Captured, so it is known before
	// the link's own handlers run.
	document.addEventListener('pointerdown', (event) => { lastPointer = event.pointerType; }, true);

	const closeCard = () => {
		if (!card) return;
		card.remove();
		card = null;
		cardLink = null;
		document.querySelector('.support-float')?.classList.remove('is-yielding-glossary');
	};

	const openCard = async (link) => {
		const term = termFromHref(link.getAttribute('href') || '');
		if (!term) return false;

		const terms = await loadTerms();
		const record = terms[term];
		// Nothing to show: let the link do what a link does.
		if (!record || !record.description) return false;

		closeCard();
		hide();

		card = document.createElement('aside');
		card.className = 'glossary-card';
		card.setAttribute('role', 'dialog');
		card.setAttribute('aria-label', `${record.local_term || term}, from the glossary`);

		const head = document.createElement('div');
		head.className = 'glossary-card-head';

		const name = document.createElement('strong');
		name.className = 'glossary-card-term';
		name.textContent = record.local_term || term;
		head.append(name);

		if (record.language) {
			const language = document.createElement('span');
			language.className = 'term-language';
			language.textContent = record.language;
			head.append(language);
		}

		const close = document.createElement('button');
		close.type = 'button';
		close.className = 'glossary-card-close';
		close.setAttribute('aria-label', 'Close');
		close.textContent = '×';
		close.addEventListener('click', closeCard);
		head.append(close);

		const text = document.createElement('p');
		text.textContent = record.description;

		const more = document.createElement('a');
		more.className = 'glossary-card-more';
		more.href = link.href;
		more.textContent = `More about ${record.local_term || term} ➞`;

		card.append(head, text, more);
		document.body.append(card);
		cardLink = link;

		// The card takes the bottom of the screen, where the coffee button sits.
		document.querySelector('.support-float')?.classList.add('is-yielding-glossary');
		close.focus({ preventScroll: true });
		return true;
	};

	links.forEach((link) => {
		// A tap fires compatibility mouse events too; only a real mouse hovers.
		link.addEventListener('mouseenter', () => { if (lastPointer === 'mouse') show(link); });
		link.addEventListener('focus', () => { if (lastPointer === 'mouse') show(link); });
		link.addEventListener('mouseleave', hide);
		link.addEventListener('blur', hide);

		link.addEventListener('click', async (event) => {
			if (lastPointer !== 'touch' && lastPointer !== 'pen') return;
			// A second tap on the link whose card is open follows it.
			if (card && cardLink === link) return;
			// Modified clicks open a tab as usual.
			if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

			event.preventDefault();
			const shown = await openCard(link);
			if (!shown) location.href = link.href;
		});
	});

	// A tap anywhere outside the card closes it, unless it lands on another
	// glossary link, which opens its own.
	document.addEventListener('pointerdown', (event) => {
		if (card && !card.contains(event.target) && !event.target.closest?.('a.glossary-link')) closeCard();
	});

	document.addEventListener('keydown', (event) => {
		if (event.key === 'Escape') {
			hide();
			if (card) {
				const link = cardLink;
				closeCard();
				link?.focus({ preventScroll: true });
			}
		}
	});

	window.addEventListener('scroll', hide, { passive: true });
}
