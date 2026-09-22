export const CEDI = '₵';

export function cedis(value, decimals = 2) {
	if (!Number.isFinite(value)) return CEDI + '0';
	const rounded = Math.round(value * 100) / 100;
	const text = rounded.toLocaleString('en-GH', {
		minimumFractionDigits: Number.isInteger(rounded) ? 0 : decimals,
		maximumFractionDigits: decimals,
	});
	return CEDI + text;
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
