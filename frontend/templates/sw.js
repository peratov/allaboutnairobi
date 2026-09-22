/**
 * The service worker.
 *
 * Its one job is to make the site work with no connection. It is deliberately
 * not a performance cache, because this repository has already been bitten
 * once by serving something stale: /js/* used to go out with `immutable`, and
 * a browser holding that copy could not be reached by any header sent
 * afterwards - only by a URL it had never seen. A service worker is that same
 * failure with a longer reach, so the rules here are cautious.
 *
 *   Pages          network first, always. The cache is only ever consulted
 *                  when the network fails. A reader online sees today's
 *                  figures, never a fortnight-old cedi amount.
 *
 *   Versioned      cache first, and safe to do so: /js/*.mjs and /geo/*.json
 *   assets         carry ?v=<commit>, so a deploy changes the URL rather than
 *                  the contents of one. Fonts are content-stable too.
 *
 *   Everything     network, falling back to whatever was cached.
 *   else
 *
 * Nothing is precached except the offline page and the icon it shows, both of
 * which are almost static. Precaching guides would mean shipping a snapshot of
 * numbers that go out of date.
 */

const VERSION = 'v1';
const CACHE = `allaboutaccra-${VERSION}`;
const OFFLINE_URL = '/offline';

const PRECACHE = [OFFLINE_URL, '/staticimages/icon-192.png'];

// Anything whose URL changes when its content does. Safe to serve from cache
// without asking the network first.
function isVersioned(url) {
	return url.searchParams.has('v') || url.pathname.startsWith('/fonts/');
}

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE)
			// Individually, so one 404 does not abort the whole install and
			// leave the worker permanently unable to activate.
			.then((cache) => Promise.allSettled(PRECACHE.map((url) => cache.add(url))))
			.then(() => self.skipWaiting())
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((names) =>
				Promise.all(
					names
						.filter((name) => name.startsWith('allaboutaccra-') && name !== CACHE)
						.map((name) => caches.delete(name))
				)
			)
			.then(() => self.clients.claim())
	);
});

/** Network first, and remember what came back so it is there when offline. */
async function pageFromNetwork(request) {
	const cache = await caches.open(CACHE);

	try {
		const response = await fetch(request);
		if (response.ok) cache.put(request, response.clone());
		return response;
	} catch {
		const cached = await cache.match(request);
		if (cached) return cached;

		const offline = await cache.match(OFFLINE_URL);
		if (offline) return offline;

		return new Response('Offline, and this page was never opened online.', {
			status: 503,
			headers: { 'Content-Type': 'text/plain; charset=utf-8' },
		});
	}
}

/** Cache first, for URLs that change when their contents do. */
async function assetFromCache(request) {
	const cache = await caches.open(CACHE);
	const cached = await cache.match(request);
	if (cached) return cached;

	const response = await fetch(request);
	if (response.ok) cache.put(request, response.clone());
	return response;
}

self.addEventListener('fetch', (event) => {
	const { request } = event;

	// Never touch anything but our own GETs. A POST here would break the
	// newsletter form, which posts cross-origin to the provider on purpose.
	if (request.method !== 'GET') return;

	const url = new URL(request.url);
	if (url.origin !== self.location.origin) return;

	// /drive is Home Ride, proxied to its own deployment by a rewrite. It is
	// about 31MB of WebGL models, map data and a three.js bundle, none of it
	// carrying ?v=, so it would fall through to the catch-all below and get
	// opportunistically cached - filling a reader's storage with a game they
	// opened once. It is also useless offline: it streams street photos from
	// Mapillary. Its own deployment sets its own cache headers; leave it alone.
	if (url.pathname === '/drive' || url.pathname.startsWith('/drive/')) return;

	if (request.mode === 'navigate') {
		event.respondWith(pageFromNetwork(request));
		return;
	}

	if (isVersioned(url)) {
		event.respondWith(assetFromCache(request));
		return;
	}

	event.respondWith(
		fetch(request).catch(async () => {
			const cached = await caches.match(request);
			if (cached) return cached;
			throw new Error('Offline and not cached');
		})
	);
});
