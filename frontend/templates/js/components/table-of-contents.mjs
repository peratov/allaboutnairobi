// The table of contents.
//
// On a wide screen it sits in the rail and highlights the section the reader is
// in. Below 1100px it used to move above the article as the full list, which
// on a phone put 400px of links before the title: a reader arriving from a
// search result saw a list of headings and had to scroll to find out whether
// they were on the right page. It is now a bar that sticks under the header,
// names the section being read, shows how far through the article you are,
// and opens the list on a tap. The CSS decides which form applies; this file
// only handles the press and keeps the label current.

export default function initializeTableOfContents() {
	const toc = document.querySelector('.table-of-contents');
	if (!toc) return;

	const toggle = toc.querySelector('.toc-toggle');
	const current = toc.querySelector('.toc-current');
	const progress = toc.querySelector('.toc-progress');

	// Something else pinned under the header - the salary calculator's answer -
	// needs to know the bar is there to sit below it. The CSS decides whether the
	// bar is showing; this only says it exists.
	if (toggle) document.documentElement.classList.add('has-toc-bar');

	const setOpen = (open) => {
		toc.classList.toggle('is-open', open);
		toggle?.setAttribute('aria-expanded', String(open));
	};

	if (toggle) {
		toggle.addEventListener('click', () => setOpen(!toc.classList.contains('is-open')));

		// Choosing a section closes the list; the browser does the scrolling.
		toc.addEventListener('click', (event) => {
			if (event.target.closest('a[href^="#"]')) setOpen(false);
		});

		document.addEventListener('keydown', (event) => {
			if (event.key === 'Escape' && toc.classList.contains('is-open')) {
				setOpen(false);
				toggle.focus();
			}
		});

		// A tap anywhere else closes it, as a menu would.
		document.addEventListener('pointerdown', (event) => {
			if (toc.classList.contains('is-open') && !toc.contains(event.target)) setOpen(false);
		});
	}

	// How far through the article the reader is, as a hairline under the bar.
	// One read of layout per frame at most, and only while scrolling.
	const article = document.querySelector('main > article');
	if (progress && article) {
		let queued = false;
		const update = () => {
			queued = false;
			const box = article.getBoundingClientRect();
			const span = box.height - window.innerHeight * 0.6;
			const done = span > 0 ? Math.min(1, Math.max(0, -box.top / span)) : 0;
			progress.style.transform = `scaleX(${done.toFixed(3)})`;
		};
		window.addEventListener('scroll', () => {
			if (!queued) { queued = true; requestAnimationFrame(update); }
		}, { passive: true });
		update();
	}

	if (!('IntersectionObserver' in window)) return;

	const links = new Map();
	toc.querySelectorAll('a[href^="#"]').forEach((link) => {
		const id = decodeURIComponent(link.getAttribute('href').slice(1));
		const heading = document.getElementById(id);
		if (heading) links.set(heading, link);
	});

	if (!links.size) return;

	const visible = new Set();
	let last = null;

	const observer = new IntersectionObserver(
		(entries) => {
			entries.forEach((entry) => {
				if (entry.isIntersecting) visible.add(entry.target);
				else visible.delete(entry.target);
			});

			// Mark the topmost heading currently on screen. Marking every visible
			// one lights up half the list on a long screen and tells you nothing.
			// With none on screen, the reader is still in the last one passed.
			const headings = [...links.keys()];
			let marked = headings.find((heading) => visible.has(heading));
			if (!marked) {
				// Not .at(-1): this runs on every guide, and iOS Safari before
				// 15.4 has no Array#at - the whole bar stopped there.
				const passed = headings.filter((heading) => heading.getBoundingClientRect().top < 0);
				marked = passed[passed.length - 1] || null;
			}
			if (marked === last) return;
			last = marked;

			links.forEach((link, heading) => {
				if (heading === marked) link.setAttribute('aria-current', 'true');
				else link.removeAttribute('aria-current');
			});
			if (current) current.textContent = marked ? links.get(marked).textContent : '';
			toc.classList.toggle('has-current', Boolean(marked));
		},
		{ rootMargin: '-15% 0px -70% 0px' }
	);

	links.forEach((_link, heading) => observer.observe(heading));
}
