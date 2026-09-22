// The figures from content/constants.yaml, as the tool page embedded them.
let cache;

export default function constants() {
	if (!cache) {
		const node = document.getElementById('site-constants');
		cache = node ? JSON.parse(node.textContent) : {};
	}
	return cache;
}
