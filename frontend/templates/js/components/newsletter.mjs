// The newsletter, in the browser: the sign-up form answered in place, and the
// three pages an email or the form lands on.
//
// Every one of these works without this module - the form is a plain POST the
// API answers with a redirect - so this only makes them quicker and clearer.
// The tokens in an email's links travel in the #fragment, which no server ever
// sees, and are taken out of the address bar the moment the page reads them, so
// a link copied from the bar cannot unsubscribe anybody.

const API = '/api/news';

async function call(route, body = null, query = '') {
	const response = await fetch(`${API}?r=${route}${query}`, body ? {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
	} : {});
	const answer = await response.json().catch(() => ({}));
	if (!response.ok) throw Object.assign(new Error(answer.error || 'Something went wrong. Try again in a minute.'), { code: answer.code });
	return answer;
}

const element = (tag, attrs = {}, ...children) => {
	const node = document.createElement(tag);
	for (const [key, value] of Object.entries(attrs)) {
		if (key === 'class') node.className = value;
		else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
		else node.setAttribute(key, value);
	}
	node.append(...children.filter((c) => c !== null && c !== undefined && c !== false));
	return node;
};

/** The token from the address, read once and then taken out of it. */
function takeToken() {
	const token = new URLSearchParams(location.hash.slice(1)).get('t');
	if (location.hash) history.replaceState(history.state, '', location.pathname + location.search);
	return token;
}

// --- the form ------------------------------------------------------------------

function enhanceForm(form) {
	if (form.dataset.ready) return;
	form.dataset.ready = '1';
	const status = form.nextElementSibling?.matches('.subscribe-status') ? form.nextElementSibling : null;
	const source = form.querySelector('input[name="source"]');
	if (source && !source.value) source.value = location.pathname;
	const say = (text, error = false) => {
		if (!status) return;
		status.textContent = text;
		status.classList.toggle('is-error', error);
		status.hidden = false;
	};
	form.addEventListener('submit', async (event) => {
		event.preventDefault();
		if (form.classList.contains('is-busy')) return;
		const data = new FormData(form);
		form.classList.add('is-busy');
		try {
			const answer = await call('subscribe', {
				email: String(data.get('email') || ''),
				source: String(data.get('source') || location.pathname),
				website: String(data.get('website') || ''),
			});
			say(answer.message);
			form.hidden = true;
		} catch (error) {
			say(error.message, true);
			form.querySelector('input[type="email"]')?.focus();
		} finally {
			form.classList.remove('is-busy');
		}
	});
}

// --- the pages -----------------------------------------------------------------

function confirmPage(page) {
	const body = page.querySelector('[data-newsletter-body]');
	const token = takeToken();
	if (!token) {
		body.replaceChildren(element('p', {}, 'This page opens from the button in a confirmation email. To subscribe, use ', element('a', { href: '/newsletter' }, 'the newsletter page'), '.'));
		return;
	}
	const button = element('button', { type: 'button', class: 'newsletter-button' }, 'Yes, subscribe me');
	const message = element('p', { role: 'status', 'aria-live': 'polite' });
	button.addEventListener('click', async () => {
		button.disabled = true;
		try {
			const answer = await call('confirm', { token });
			page.querySelector('h1').textContent = answer.already ? 'You were already on the list' : 'You are on the list';
			body.replaceChildren(
				element('p', {}, `${answer.email || 'Your address'} will get the next issue. `, answer.already ? '' : 'A short welcome is on its way too.'),
				element('p', {}, 'Every past issue is in ', element('a', { href: '/newsletter' }, 'the archive'), ', and every email has a link at the bottom to leave.'),
			);
		} catch (error) {
			button.disabled = false;
			message.textContent = error.message;
		}
	});
	body.replaceChildren(element('p', {}, 'Tap the button to add your address to the monthly newsletter.'), element('p', {}, button), message);
	button.focus();
}

async function unsubscribePage(page) {
	const body = page.querySelector('[data-newsletter-body]');
	const token = takeToken();
	if (!token) {
		body.replaceChildren(element('p', {}, 'This page opens from the Unsubscribe link at the bottom of an email. Use that link, or your mail app\'s own Unsubscribe button.'));
		return;
	}
	let who;
	try {
		who = await call('who', null, `&t=${encodeURIComponent(token)}`);
	} catch (error) {
		body.replaceChildren(element('p', {}, error.message));
		return;
	}
	if (who.status !== 'subscribed') {
		page.querySelector('h1').textContent = 'You are not on the list';
		body.replaceChildren(
			element('p', {}, who.email ? `${who.email} gets nothing from us.` : 'That address gets nothing from us.'),
			element('p', {}, 'Changed your mind? ', element('a', { href: '/newsletter' }, 'Subscribe again'), '.'),
		);
		return;
	}
	const reasons = element('fieldset', { class: 'newsletter-reasons' }, element('legend', {}, 'Why are you leaving? (optional)'));
	for (const [value, label] of Object.entries({ many: 'Too many emails', relevant: 'Not what I expected', never: 'I never signed up', other: 'Something else' })) {
		reasons.append(element('label', {}, element('input', { type: 'radio', name: 'reason', value }), label));
	}
	const button = element('button', { type: 'button', class: 'newsletter-button' }, 'Unsubscribe');
	const message = element('p', { role: 'status', 'aria-live': 'polite' });
	button.addEventListener('click', async () => {
		button.disabled = true;
		try {
			const reason = reasons.querySelector('input:checked')?.value || null;
			const answer = await call('unsubscribe', { token, reason });
			page.querySelector('h1').textContent = 'You are off the list';
			body.replaceChildren(
				element('p', {}, `${answer.email || 'That address'} will get nothing more from us - not this newsletter, not anything else.`),
				element('p', {}, 'Left by mistake? ', element('a', { href: '/newsletter' }, 'Subscribe again'), ' - it takes one confirmation.'),
			);
			page.querySelector('h1').focus?.();
		} catch (error) {
			button.disabled = false;
			message.textContent = error.message;
		}
	});
	body.replaceChildren(element('p', {}, `Take ${who.email} off the monthly newsletter?`), reasons, element('p', {}, button), message);
}

const ERRORS = {
	paused: 'Sign-ups are paused for a short while. Try again later.',
	'not-configured': 'The newsletter is not taking sign-ups yet.',
	email: 'That did not look like an email address.',
	rate: 'A lot of sign-ups have come from your connection this hour. Try again a little later.',
	origin: 'That sign-up did not come from this site.',
};

function checkPage(page) {
	const params = new URLSearchParams(location.search);
	const title = page.querySelector('[data-newsletter-title]');
	const body = page.querySelector('[data-newsletter-body]');
	if (params.get('subscribed') === '1') {
		title.textContent = 'You are on the list';
		body.replaceChildren(element('p', {}, 'The next issue comes to your inbox. Every past one is in ', element('a', { href: '/newsletter' }, 'the archive'), '.'));
	} else if (params.get('error')) {
		title.textContent = 'That did not work';
		body.replaceChildren(
			element('p', {}, ERRORS[params.get('error')] || 'Something went wrong on our side. Try again in a minute.'),
			element('p', {}, element('a', { href: '/newsletter' }, 'Back to the newsletter')),
		);
	}
}

export default function initializeNewsletter() {
	document.querySelectorAll('[data-newsletter-form]').forEach(enhanceForm);
	const page = document.querySelector('[data-newsletter-page]');
	if (!page || page.dataset.ready) return;
	page.dataset.ready = '1';
	({ confirm: confirmPage, unsubscribe: unsubscribePage, check: checkPage })[page.dataset.newsletterPage]?.(page);
}
