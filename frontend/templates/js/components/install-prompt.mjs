/**
 * The "install this" prompt.
 *
 * What is actually possible here is narrower than it sounds, and the honest
 * design follows from it:
 *
 *   Chromium (Android, Windows, macOS, Linux) fires `beforeinstallprompt`.
 *   That event is the only way any browser lets a page ask to be installed,
 *   and it only fires once the browser is already satisfied the site is
 *   installable. Catch it, show a button, and hand it back on the press.
 *
 *   iOS and iPadOS Safari have no such event and never will on Apple's current
 *   course. Installing is Share -> Add to Home Screen, done by hand. The most
 *   a page can do is notice it is on iOS, notice it is not already installed,
 *   and say where the button is.
 *
 *   Firefox on the desktop removed install support altogether. Firefox on
 *   Android has it in the menu. Neither can be prompted, so neither is.
 *
 * So there is no universal prompt to build, and pretending otherwise would
 * mean showing people instructions that do not match their browser. Every
 * branch here is something that browser can really do.
 *
 * Dismissal is remembered. Being asked twice is how a banner becomes an
 * advert.
 */

const DISMISSED_KEY = 'install-prompt-dismissed';

/** Already running as an installed app: never ask. */
function isInstalled() {
	return (
		window.matchMedia('(display-mode: standalone)').matches ||
		// iOS predates display-mode and uses its own flag.
		window.navigator.standalone === true
	);
}

function isIosSafari() {
	const ua = window.navigator.userAgent;
	const iOS = /iPad|iPhone|iPod/.test(ua) ||
		// iPadOS 13+ reports itself as a Mac; the touch points give it away.
		(navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

	// Chrome and Firefox on iOS are Safari underneath but cannot install at
	// all, so telling them about the Share menu would be a lie.
	const realSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
	return iOS && realSafari;
}

function wasDismissed() {
	try {
		return localStorage.getItem(DISMISSED_KEY) === 'yes';
	} catch {
		return false;
	}
}

function remember() {
	try {
		localStorage.setItem(DISMISSED_KEY, 'yes');
	} catch {
		// Private mode. It will ask again next time, which is the lesser evil.
	}
}

export default function initializeInstallPrompt() {
	const panel = document.querySelector('[data-install]');
	if (!panel || isInstalled() || wasDismissed()) return;

	const button = panel.querySelector('[data-install-button]');
	const dismiss = panel.querySelector('[data-install-dismiss]');
	const iosNote = panel.querySelector('[data-install-ios]');

	let deferred = null;

	function show() {
		panel.hidden = false;
	}

	function hide() {
		panel.hidden = true;
	}

	dismiss.addEventListener('click', () => {
		hide();
		remember();
	});

	// Chromium: the browser has decided the site is installable and is letting
	// us choose when to ask.
	window.addEventListener('beforeinstallprompt', (event) => {
		event.preventDefault();
		deferred = event;
		button.hidden = false;
		if (iosNote) iosNote.hidden = true;
		show();
	});

	button.addEventListener('click', async () => {
		if (!deferred) return;

		deferred.prompt();
		const { outcome } = await deferred.userChoice;
		deferred = null;
		hide();

		// A refusal is an answer. Asking again next week is what makes these
		// things hated.
		if (outcome === 'dismissed') remember();
	});

	window.addEventListener('appinstalled', () => {
		hide();
		remember();
	});

	// iOS Safari: no event is coming, so show the instructions instead - but
	// only after a moment, so it is never the first thing a reader meets.
	if (isIosSafari() && iosNote) {
		window.setTimeout(() => {
			if (deferred || panel.hidden === false) return;
			button.hidden = true;
			iosNote.hidden = false;
			show();
		}, 4000);
	}
}
