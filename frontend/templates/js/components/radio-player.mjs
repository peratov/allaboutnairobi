// Live radio from Nairobi's own stations.
//
// The page arrives as a plain list of stations, each linking to its own site,
// so it works with JavaScript off and is what a crawler indexes. This element
// turns each row into a play button driving ONE <audio> element.
//
// Three rules shape everything here:
//
//   * Nothing loads until someone presses play. The audio element has no src
//     and preload="none" until then, so a reader browsing the list has made no
//     request to any broadcaster. The stream comes from the station's own
//     server, never through this site, and only after a click.
//   * A stream that does not answer is said plainly. Radio streams fail -
//     transmitter down, server overloaded - and a spinner that spins forever
//     reads as a broken page rather than a quiet station.
//   * A static site stops audio on every navigation, so the only way to keep
//     listening while reading the rest of the site is a small separate window.
//     "Pop out" opens this same page in one, compact, and the main tab is free.
//
// It also answers the lock screen, the notification shade and headset buttons
// through the Media Session API, which is how most people on a phone will
// actually control it.

const STALL_MS = 15000;
const KEY_STATION = 'aa:radio:station';
const KEY_VOLUME = 'aa:radio:volume';
const KEY_FILTER = 'aa:radio:filter';

const store = {
	get(key) {
		try {
			return window.localStorage.getItem(key);
		} catch {
			return null;
		}
	},
	set(key, value) {
		try {
			window.localStorage.setItem(key, value);
		} catch {
			/* private mode, blocked storage: the player still works */
		}
	},
};

class RadioPlayer extends HTMLElement {
	connectedCallback() {
		this.rows = [...this.querySelectorAll('[data-stream]')];
		if (!this.rows.length) return;

		this.popout = window.location.hash === '#popout';
		if (this.popout) document.documentElement.classList.add('radio-popout');

		this.audio = document.createElement('audio');
		this.audio.preload = 'none';
		this.audio.setAttribute('aria-hidden', 'true');
		this.append(this.audio);

		this.current = null;
		this.stallTimer = null;

		this.buildRows();
		this.buildBar();
		this.buildFilters();
		this.bindAudio();
		this.bindMediaSession();

		const volume = Number(store.get(KEY_VOLUME));
		this.audio.volume = volume > 0 && volume <= 1 ? volume : 0.8;
		this.volumeInput.value = String(this.audio.volume);

		// Remember the last station, but never start playing by itself: that
		// would be a request to a broadcaster nobody asked for.
		const last = this.rows.find((row) => row.dataset.id === store.get(KEY_STATION));
		if (last) this.select(last, { play: false });

		this.classList.add('is-ready');
	}

	buildRows() {
		for (const row of this.rows) {
			const button = document.createElement('button');
			button.type = 'button';
			button.className = 'radio-play';
			button.setAttribute('aria-pressed', 'false');
			button.innerHTML = '<span class="radio-play-icon" aria-hidden="true"></span>';
			button.append(Object.assign(document.createElement('span'), {
				className: 'visually-hidden',
				textContent: `Play ${row.dataset.name}`,
			}));
			button.addEventListener('click', () => this.toggle(row));
			row.prepend(button);
			row.button = button;
		}
	}

	buildBar() {
		this.bar = document.createElement('div');
		this.bar.className = 'radio-bar';
		this.bar.hidden = true;
		this.bar.innerHTML = `
			<button type="button" class="radio-bar-toggle" aria-label="Pause"><span class="radio-play-icon" aria-hidden="true"></span></button>
			<div class="radio-bar-now">
				<strong class="radio-bar-name"></strong>
				<span class="radio-bar-status" role="status" aria-live="polite"></span>
			</div>
			<label class="radio-bar-volume">
				<span class="visually-hidden">Volume</span>
				<input type="range" min="0" max="1" step="0.05">
			</label>
			<button type="button" class="radio-bar-popout">Pop out</button>
		`;
		this.nameEl = this.bar.querySelector('.radio-bar-name');
		this.statusEl = this.bar.querySelector('.radio-bar-status');
		this.toggleButton = this.bar.querySelector('.radio-bar-toggle');
		this.volumeInput = this.bar.querySelector('input[type=range]');
		const popoutButton = this.bar.querySelector('.radio-bar-popout');

		this.toggleButton.addEventListener('click', () => this.current && this.toggle(this.current));
		this.volumeInput.addEventListener('input', () => {
			this.audio.volume = Number(this.volumeInput.value);
			store.set(KEY_VOLUME, String(this.audio.volume));
		});

		if (this.popout) {
			popoutButton.remove();
		} else {
			popoutButton.addEventListener('click', () => this.openPopout());
		}
		this.append(this.bar);
	}

	buildFilters() {
		const groups = [...new Set(this.rows.map((row) => row.dataset.group).filter(Boolean))];
		if (groups.length < 2) return;

		const wrap = document.createElement('div');
		wrap.className = 'radio-filters-wrap';

		const nav = document.createElement('div');
		nav.className = 'radio-filters';
		nav.setAttribute('role', 'group');
		nav.setAttribute('aria-label', 'Filter stations');

		// Announced politely, so a screen reader hears what the press did.
		this.resultEl = document.createElement('p');
		this.resultEl.className = 'radio-filter-result';
		this.resultEl.setAttribute('role', 'status');
		this.resultEl.setAttribute('aria-live', 'polite');

		const count = (value) => this.rows.filter((row) => value === null || row.dataset.group === value).length;
		this.chips = [null, ...groups].map((value) => {
			const chip = document.createElement('button');
			chip.type = 'button';
			chip.className = 'radio-filter';
			chip.dataset.value = value ?? '';
			chip.innerHTML = `<span class="radio-filter-label"></span><span class="radio-filter-count"></span>`;
			chip.querySelector('.radio-filter-label').textContent = value ?? 'All';
			chip.querySelector('.radio-filter-count').textContent = count(value);
			chip.addEventListener('click', () => this.applyFilter(value, { announce: true }));
			return chip;
		});

		nav.append(...this.chips);
		wrap.append(nav, this.resultEl);
		this.querySelector('.radio-list')?.before(wrap);

		const saved = store.get(KEY_FILTER);
		this.applyFilter(groups.includes(saved) ? saved : null, { announce: false });
	}

	applyFilter(value, { announce }) {
		for (const chip of this.chips) {
			chip.setAttribute('aria-pressed', String((chip.dataset.value || null) === value));
		}
		let shown = 0;
		for (const row of this.rows) {
			const visible = value === null || row.dataset.group === value;
			if (visible) shown++;
			// Replay the entrance only for rows that were hidden, so pressing the
			// chip you are already on does not make the list flicker.
			if (visible && row.hidden && announce) {
				row.classList.remove('is-entering');
				void row.offsetWidth;
				row.classList.add('is-entering');
			}
			row.hidden = !visible;
		}
		const noun = shown === 1 ? 'station' : 'stations';
		this.resultEl.textContent = value === null
			? `Showing all ${shown} ${noun}`
			: `Showing ${shown} ${value === 'Online only' ? 'online-only' : value} ${noun}`;
		store.set(KEY_FILTER, value ?? '');
	}

	bindAudio() {
		const audio = this.audio;
		// 'waiting' also fires as the element empties after a failed or stopped
		// stream. Only treat it as buffering while a stream is actually set, or it
		// overwrites the error a reader needs to see with a spinner.
		audio.addEventListener('waiting', () => {
			if (audio.getAttribute('src') && this.state !== 'error') this.setState('loading');
		});
		audio.addEventListener('playing', () => this.setState('playing'));
		audio.addEventListener('pause', () => {
			if (this.state !== 'error') this.setState('paused');
		});
		audio.addEventListener('error', () => {
			// pause() clears the source to close the connection, and some
			// browsers report that as an error. Only a real stream failing is one.
			if (audio.getAttribute('src')) this.fail();
		});
		audio.addEventListener('stalled', () => this.armStall());
	}

	bindMediaSession() {
		if (!('mediaSession' in navigator)) return;
		const session = navigator.mediaSession;
		const safely = (action, handler) => {
			try {
				session.setActionHandler(action, handler);
			} catch {
				/* not every browser supports every action */
			}
		};
		safely('play', () => this.current && this.play(this.current));
		safely('pause', () => this.pause());
		safely('stop', () => this.pause());
		safely('previoustrack', () => this.step(-1));
		safely('nexttrack', () => this.step(1));
	}

	step(direction) {
		const visible = this.rows.filter((row) => !row.hidden);
		if (!visible.length) return;
		const index = visible.indexOf(this.current);
		const next = visible[(index + direction + visible.length) % visible.length];
		this.play(next);
	}

	toggle(row) {
		if (this.current === row && !this.audio.paused) {
			this.pause();
		} else {
			this.play(row);
		}
	}

	select(row, { play }) {
		if (this.current && this.current !== row) {
			this.current.classList.remove('is-current');
			this.current.button.setAttribute('aria-pressed', 'false');
		}
		this.current = row;
		row.classList.add('is-current');
		this.nameEl.textContent = row.dataset.freq
			? `${row.dataset.name} · ${row.dataset.freq} FM`
			: row.dataset.name;
		this.bar.hidden = false;
		store.set(KEY_STATION, row.dataset.id);
		if (!play) this.setState('paused', 'Press play to listen');
	}

	play(row) {
		const switching = this.current !== row || !this.audio.src;
		this.select(row, { play: true });
		if (switching) {
			// Assigning src is the first request to the broadcaster.
			this.audio.src = row.dataset.stream;
		} else {
			// A live stream resumed after a pause would replay a stale buffer, or
			// nothing. Reloading jumps back to live, which is what a radio does.
			this.audio.load();
		}
		this.setState('loading');
		this.armStall();

		if ('mediaSession' in navigator && 'MediaMetadata' in window) {
			navigator.mediaSession.metadata = new MediaMetadata({
				title: row.dataset.name,
				artist: row.dataset.freq ? `${row.dataset.freq} FM, Nairobi` : 'Online, from Nairobi',
				album: 'All About Nairobi radio',
				artwork: [{ src: '/staticimages/icon-512.png', sizes: '512x512', type: 'image/png' }],
			});
		}

		const attempt = this.audio.play();
		if (attempt && typeof attempt.catch === 'function') {
			attempt.catch((error) => {
				// AbortError is this element being given a new station before the
				// last one answered - not a failure of either.
				if (error?.name === 'AbortError') return;
				console.warn(`radio: ${row.dataset.name} would not play`, error);
				// NotAllowedError is the browser refusing sound without a press it
				// trusts, not the station failing, so say that instead.
				this.fail(error?.name === 'NotAllowedError'
					? 'Your browser held the sound back. Press play once more.'
					: undefined);
			});
		}
	}

	pause() {
		clearTimeout(this.stallTimer);
		this.audio.pause();
		// Drop the connection too. A paused live stream otherwise keeps
		// downloading, which on a mobile data bundle is money.
		this.audio.removeAttribute('src');
		this.audio.load();
		this.setState('paused');
	}

	armStall() {
		clearTimeout(this.stallTimer);
		this.stallTimer = setTimeout(() => {
			if (this.state === 'loading') this.fail();
		}, STALL_MS);
	}

	fail(message) {
		clearTimeout(this.stallTimer);
		if (!this.current) return;
		this.audio.removeAttribute('src');
		this.audio.load();
		this.setState('error', message);
	}

	setState(state, message) {
		this.state = state;
		if (state !== 'loading') clearTimeout(this.stallTimer);
		const row = this.current;
		const text = message || {
			loading: 'Connecting…',
			playing: 'Live',
			paused: 'Paused',
			error: 'This stream is not answering right now. Try again, or listen on the station’s own site.',
		}[state];

		this.statusEl.textContent = text;
		this.bar.dataset.state = state;
		this.toggleButton.setAttribute('aria-label', state === 'playing' || state === 'loading' ? 'Pause' : 'Play');

		for (const other of this.rows) {
			const active = other === row && (state === 'playing' || state === 'loading');
			other.button.setAttribute('aria-pressed', String(active));
			other.dataset.state = other === row ? state : '';
			other.button.querySelector('.visually-hidden').textContent =
				`${active ? 'Pause' : 'Play'} ${other.dataset.name}`;
		}

		if ('mediaSession' in navigator) {
			navigator.mediaSession.playbackState = state === 'playing' ? 'playing' : state === 'loading' ? 'playing' : 'paused';
		}
	}

	openPopout() {
		const wasPlaying = this.current && !this.audio.paused;
		const popup = window.open('/radio#popout', 'aa-radio', 'popup,width=420,height=680');
		if (!popup) {
			this.statusEl.textContent = 'Your browser blocked the pop-out window. Allow pop-ups for this site to use it.';
			return;
		}
		// One stream at a time: the pop-out takes over, and this tab goes quiet
		// rather than playing the same station twice, a second apart.
		if (wasPlaying) this.pause();
	}
}

customElements.define('radio-player', RadioPlayer);
