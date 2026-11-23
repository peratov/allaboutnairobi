export function shillings(value, decimals = 2) {
	if (!Number.isFinite(value)) return 'KES 0';
	const rounded = Math.round(value * 100) / 100;
	const text = rounded.toLocaleString('en-KE', {
		minimumFractionDigits: Number.isInteger(rounded) ? 0 : decimals,
		maximumFractionDigits: decimals,
	});
	return 'KES ' + text;
}

export function percent(value) {
	const rounded = Math.round(value * 100) / 100;
	return String(rounded) + '%';
}

export function parseAmount(value) {
	const parsed = parseFloat(String(value).replace(/[^0-9.\-]/g, ''));
	return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function element(tag, attributes = {}, children = []) {
	const node = document.createElement(tag);
	for (const [key, value] of Object.entries(attributes)) {
		if (key === 'class') node.className = value;
		else if (key === 'text') node.textContent = value;
		else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
		else node.setAttribute(key, value);
	}
	for (const child of [].concat(children)) {
		if (child) node.append(child);
	}
	return node;
}

// A calculator titles itself with an h4 and its parts with h5, wherever it is
// mounted: under a guide's h2, or straight under a tool page's h1. Lighthouse
// counts that as skipping levels (All About Accra, 2026-11). This sets each
// heading's aria-level to follow the last heading before the calculator,
// keeping the tags - and so every style - as they are, and re-applies as
// results redraw.
export function fitHeadings(host) {
	const levelOf = (h) => Number(h.getAttribute('aria-level')) || Number(h.tagName.slice(1)) || 2;
	let before = null;
	for (const h of document.querySelectorAll('h1, h2, h3, h4, h5, h6')) {
		if (host.contains(h)) continue;
		if (h.compareDocumentPosition(host) & Node.DOCUMENT_POSITION_FOLLOWING) before = h;
		else break;
	}
	const title = Math.min(6, (before ? levelOf(before) : 1) + 1);
	const apply = () => {
		for (const h of host.querySelectorAll('h4, h5, h6')) {
			const level = String(Math.min(6, title + Number(h.tagName.slice(1)) - 4));
			if (h.getAttribute('aria-level') !== level) h.setAttribute('aria-level', level);
		}
	};
	apply();
	new MutationObserver(apply).observe(host, { childList: true, subtree: true });
}
