/**
 * The light/dark toggle.
 *
 * Deliberately small, because most of the work is done elsewhere. The blocking
 * script in the head applies the saved theme before the first paint; CSS
 * decides which icon to show. All that is left is the press, what to remember,
 * and keeping the browser chrome in step.
 *
 * There are only two states on purpose. A three-way light / dark / system
 * control is more faithful to what a browser can express, and it makes the
 * reader press a button twice to find out what it does. Once you have touched
 * this, you have chosen; clearing the site's storage restores the system
 * preference.
 */

const STORAGE_KEY = 'theme';

/**
 * The theme actually in force: an explicit choice if there is one, otherwise
 * whatever the system asked for.
 */
function currentTheme() {
	const chosen = document.documentElement.getAttribute('data-theme');
	if (chosen === 'dark' || chosen === 'light') return chosen;
	return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Keep the mobile browser's own chrome in step.
 *
 * The two `theme-color` metas in the head are keyed to `prefers-color-scheme`,
 * which stops being the answer the moment a reader overrides it - a dark page
 * under a light address bar. A single unconditional meta wins over both, so
 * one is written on first use and updated thereafter.
 */
function syncBrowserChrome(theme) {
	const colour = theme === 'dark' ? '#7d3a14' : '#b3541e';
	let meta = document.querySelector('meta[name="theme-color"][data-theme-color]');

	if (!meta) {
		meta = document.createElement('meta');
		meta.setAttribute('name', 'theme-color');
		meta.setAttribute('data-theme-color', '');
		document.head.append(meta);
	}

	meta.setAttribute('content', colour);
}

export default function initializeThemeToggle() {
	const button = document.querySelector('[data-theme-toggle]');
	if (!button) return;

	button.addEventListener('click', () => {
		const next = currentTheme() === 'dark' ? 'light' : 'dark';

		document.documentElement.setAttribute('data-theme', next);
		syncBrowserChrome(next);

		try {
			localStorage.setItem(STORAGE_KEY, next);
		} catch {
			// Private mode, or storage disabled. The choice still holds for
			// this page; it just will not survive a reload.
		}
	});
}
