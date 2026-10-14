// Nairobi Pulse's side of the browser that the map page and the question card
// on every other page share: talking to /api/pulse, the three things this
// browser keeps, the location check and the vote.
//
// Kept on the device and nowhere else: a random id for this browser (so a
// second vote is a change, not a new vote), the signed pass the location
// check returned (so the check is asked once a week, not once a vote), and
// which answer this browser gave to each question (so it can be shown back).

const API = '/api/pulse';
export const KEYS = { device: 'aaa:pulse:device', pass: 'aaa:pulse:pass', votes: 'aaa:pulse:votes' };

// --- this browser's memory -------------------------------------------------------

export const remember = (key, fallback) => {
	try {
		const raw = localStorage.getItem(key);
		return raw ? JSON.parse(raw) : fallback;
	} catch {
		return fallback;
	}
};

export const keep = (key, value) => {
	try {
		if (value === null) localStorage.removeItem(key);
		else localStorage.setItem(key, JSON.stringify(value));
	} catch { /* private mode: the page still works for this visit */ }
};

let memoryDevice = null;
export function deviceId() {
	let id = remember(KEYS.device, null) || memoryDevice;
	if (!/^[A-Za-z0-9_-]{16,64}$/.test(id || '')) {
		const bytes = crypto.getRandomValues(new Uint8Array(18));
		id = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
		keep(KEYS.device, id);
	}
	memoryDevice = id;
	return id;
}

export function currentPass() {
	const pass = remember(KEYS.pass, null);
	return pass?.pass && pass.expires > new Date().toISOString() ? pass : null;
}

/** Which answer this browser gave to each question, by question id. */
export const myVotes = () => remember(KEYS.votes, {});

// --- talking to the API ----------------------------------------------------------------

export class PulseError extends Error {
	constructor(message, status, code) {
		super(message);
		this.status = status;
		this.code = code;
	}
}

export async function api(route, { params = {}, body } = {}) {
	let response;
	try {
		response = await fetch(`${API}?${new URLSearchParams({ r: route, ...params })}`, {
			method: body ? 'POST' : 'GET',
			headers: body ? { 'Content-Type': 'application/json' } : {},
			body: body ? JSON.stringify(body) : undefined,
			credentials: 'same-origin',
		});
	} catch {
		throw new PulseError('No connection. Check your data and try again.', 0, 'offline');
	}
	let payload = {};
	try { payload = await response.json(); } catch { /* not JSON */ }
	if (!response.ok) throw new PulseError(payload.error || 'Something went wrong. Try again in a minute.', response.status, payload.code || 'server');
	return payload;
}

// --- the location check -------------------------------------------------------------------

/**
 * Asks the phone where it is, once, and trades the position for a pass: the
 * district, signed, for a week. Throws a PulseError whose `code` says what
 * went wrong - outside, country, accuracy, rate, offline, or the browser's own
 * refusals: blocked, timeout, unavailable, unsupported.
 */
export function checkLocation() {
	return new Promise((resolve, reject) => {
		if (!('geolocation' in navigator) || !window.isSecureContext) {
			reject(new PulseError('This browser cannot share where it is. Open the page in your phone\'s usual browser, with location on.', 0, 'unsupported'));
			return;
		}
		navigator.geolocation.getCurrentPosition(async (position) => {
			const { latitude, longitude, accuracy } = position.coords;
			try {
				const answer = await api('pass', { body: {
					device: deviceId(),
					// Three decimal places, about a hundred metres: enough to find a
					// district, and all the precision that ever leaves the phone.
					lat: Math.round(latitude * 1000) / 1000,
					lon: Math.round(longitude * 1000) / 1000,
					accuracy: Math.round(accuracy || 0),
				} });
				keep(KEYS.pass, answer);
				window.dispatchEvent(new CustomEvent('pulse:pass', { detail: answer }));
				resolve(answer);
			} catch (error) {
				reject(error);
			}
		}, (error) => {
			reject(error.code === 1
				? new PulseError('Location is blocked for this site. Allow it in your browser\'s site settings, then try again. Nothing else on the site asks for it.', 0, 'blocked')
				: error.code === 3
					? new PulseError('Your phone could not find itself in time. Turn on location, step near a window or outdoors, and try again.', 0, 'timeout')
					: new PulseError('Your phone could not find itself. Turn on location (GPS) and try again.', 0, 'unavailable'));
		}, { enableHighAccuracy: true, timeout: 20000, maximumAge: 600000 });
	});
}

// --- the vote ----------------------------------------------------------------------------------

/**
 * Casts this browser's answer with its pass, remembers it, and tells the
 * page: a `pulse:voted` event carries the question, the answer and the fresh
 * tally, so a map on screen can redraw without asking again.
 */
export async function vote(question, option) {
	const pass = currentPass();
	if (!pass) throw new PulseError('Check where you are first - it takes a second.', 401, 'pass');
	try {
		const answer = await api('vote', { body: { device: deviceId(), pass: pass.pass, question: question.id, option } });
		const votes = myVotes();
		votes[question.id] = option;
		keep(KEYS.votes, votes);
		window.dispatchEvent(new CustomEvent('pulse:voted', { detail: { question: question.id, option, answer } }));
		return answer;
	} catch (error) {
		// A pass the server will not take is a pass to forget.
		if (error.code === 'pass') keep(KEYS.pass, null);
		throw error;
	}
}
