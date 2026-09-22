// Remember that the reader dismissed the support button.
//
// The button is rendered visible and this hides it, rather than the reverse -
// so with JavaScript off, or before this module runs, the button is still
// there. Asking for support should never be the thing that needs scripting to
// work.
const STORAGE_KEY = 'aaa:supportDismissed';

export default function initializeSupportButton() {
	const container = document.querySelector('[data-support]');
	if (!container) return;

	let dismissed = false;
	try {
		dismissed = localStorage.getItem(STORAGE_KEY) === '1';
	} catch (error) {
		// Private browsing, or storage disabled. Show the button.
	}

	if (dismissed) {
		container.remove();
		return;
	}

	const button = container.querySelector('[data-support-dismiss]');
	if (button) {
		button.addEventListener('click', () => {
			container.remove();
			try {
				localStorage.setItem(STORAGE_KEY, '1');
			} catch (error) {
				// It stays hidden for this page view either way.
			}
		});
	}

	yieldToSidebarCard(container);
}

// On a wide screen the guide sidebar carries its own support card, and the
// floating button then sits directly on top of it - two identical yellow
// buttons in the same corner, asking twice. Fade the floating one out while
// the card is on screen; it comes back as soon as the card scrolls away.
function yieldToSidebarCard(container) {
	const card = document.querySelector('.support-card');
	if (!card || !('IntersectionObserver' in window)) return;

	const observer = new IntersectionObserver(
		([entry]) => container.classList.toggle('is-superseded', entry.isIntersecting),
		{ threshold: 0.4 }
	);

	observer.observe(card);
}
