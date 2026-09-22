// The guides mega-menu in the header.
export default function initializeMenu() {
	const button = document.querySelector('.menu-toggle');
	const menu = document.getElementById('menu-guides');
	if (!button || !menu) return;

	const setOpen = (open) => {
		button.setAttribute('aria-expanded', String(open));
		menu.hidden = !open;
	};

	button.addEventListener('click', () => {
		setOpen(button.getAttribute('aria-expanded') !== 'true');
	});

	// Escape closes it, and focus returns to the button that opened it.
	document.addEventListener('keydown', (event) => {
		if (event.key === 'Escape' && button.getAttribute('aria-expanded') === 'true') {
			setOpen(false);
			button.focus();
		}
	});

	document.addEventListener('click', (event) => {
		if (!menu.contains(event.target) && !button.contains(event.target)) setOpen(false);
	});
}
