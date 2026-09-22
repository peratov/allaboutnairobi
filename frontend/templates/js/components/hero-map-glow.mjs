/**
 * The ambient cycle on the home page map.
 *
 * One district lights up at a time and its name crossfades into the caption,
 * so the hero shows the map is a thing you can touch rather than a picture.
 *
 * The whole design is about costing nothing:
 *
 *   * It ships in the deferred module bundle, so it cannot delay first paint.
 *     The map itself is inline SVG and is already on screen before this runs.
 *   * It stops dead when the map scrolls out of view, and when the tab is
 *     hidden. A home page left open in a background tab must not keep a timer
 *     and a repaint running for nothing.
 *   * It stops while the pointer is over the map. Once a reader is choosing a
 *     district, a thing that keeps lighting other ones up is interference.
 *   * `prefers-reduced-motion` turns it off entirely rather than speeding it
 *     up. It is decoration; the honest response to that setting is nothing.
 *   * One `setTimeout` at a time, never an interval, so a slow frame cannot
 *     queue work up behind itself.
 *   * Nothing in the loop reads layout, so it cannot cause a reflow. It sets
 *     one class and one string of text.
 *
 * The fade itself is a CSS transition on `fill`, which for 29 small paths with
 * one changing at a time is cheap.
 */

const HOLD_MS = 2600;       // how long a district stays lit
const GAP_MS = 900;         // darkness between two districts, so it breathes
const FIRST_DELAY_MS = 1200; // let the page settle before anything moves

export default function initializeHeroMapGlow() {
	const map = document.querySelector('.hero-map');
	const caption = document.querySelector('[data-hero-map-caption]');
	if (!map || !caption) return;

	const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
	if (reduceMotion.matches) return;

	const districts = [...map.querySelectorAll('.hero-map-svg a[data-name]')];
	if (districts.length < 2) return;

	let timer = null;
	let lit = null;
	let lastIndex = -1;
	let visible = false;
	let hovering = false;

	function clear() {
		if (lit) lit.querySelector('.hero-map-district')?.classList.remove('is-lit');
		lit = null;
		caption.classList.remove('is-visible');
	}

	function stop() {
		window.clearTimeout(timer);
		timer = null;
		clear();
	}

	/** A different district from last time, so it never blinks twice in place. */
	function pick() {
		let index = lastIndex;
		while (index === lastIndex) index = Math.floor(Math.random() * districts.length);
		lastIndex = index;
		return districts[index];
	}

	function light() {
		if (!visible || hovering) return;

		const next = pick();
		lit = next;
		next.querySelector('.hero-map-district')?.classList.add('is-lit');
		caption.textContent = next.dataset.name;
		caption.classList.add('is-visible');

		timer = window.setTimeout(() => {
			clear();
			// The gap is its own timeout rather than a longer transition, so
			// the caption has finished fading before the next name replaces it.
			timer = window.setTimeout(light, GAP_MS);
		}, HOLD_MS);
	}

	function start(delay = GAP_MS) {
		if (timer || !visible || hovering) return;
		timer = window.setTimeout(light, delay);
	}

	// Only while it is actually on screen.
	const observer = new IntersectionObserver((entries) => {
		visible = entries[0].isIntersecting;
		if (visible) start(FIRST_DELAY_MS);
		else stop();
	}, { threshold: 0.25 });

	observer.observe(map);

	// Not in a background tab.
	document.addEventListener('visibilitychange', () => {
		if (document.hidden) stop();
		else start();
	});

	// Hand over to the reader the moment they reach for it. `:hover` already
	// beats `.is-lit` on specificity, so this is about not lighting up
	// *other* districts while somebody is choosing one.
	map.addEventListener('pointerenter', () => { hovering = true; stop(); });
	map.addEventListener('pointerleave', () => { hovering = false; start(); });

	// Someone can turn reduced motion on while the page is open.
	reduceMotion.addEventListener('change', (event) => {
		if (event.matches) {
			observer.disconnect();
			stop();
		}
	});
}
