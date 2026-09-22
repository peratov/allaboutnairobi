// Highlight the section the reader is currently in.
export default function initializeTableOfContents() {
	const toc = document.querySelector('.table-of-contents');
	if (!toc || !('IntersectionObserver' in window)) return;

	const links = new Map();
	toc.querySelectorAll('a[href^="#"]').forEach((link) => {
		const id = decodeURIComponent(link.getAttribute('href').slice(1));
		const heading = document.getElementById(id);
		if (heading) links.set(heading, link);
	});

	if (!links.size) return;

	const visible = new Set();

	const observer = new IntersectionObserver(
		(entries) => {
			entries.forEach((entry) => {
				if (entry.isIntersecting) visible.add(entry.target);
				else visible.delete(entry.target);
			});

			// Mark the topmost heading currently on screen. Marking every visible
			// one lights up half the list on a long screen and tells you nothing.
			const current = [...links.keys()].find((heading) => visible.has(heading));
			links.forEach((link, heading) => {
				if (heading === current) link.setAttribute('aria-current', 'true');
				else link.removeAttribute('aria-current');
			});
		},
		{ rootMargin: '-15% 0px -70% 0px' }
	);

	links.forEach((_link, heading) => observer.observe(heading));
}
