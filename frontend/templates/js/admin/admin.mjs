// The admin, at /admin: the site owner's dashboard.
//
// Three groups. Analytics - traffic and search from Google, reader ratings,
// and lost and found's own trends. Manage - listings, places, reports, the
// events calendar, Nairobi Pulse's questions and the newsletter. Site - the
// notice, the settings, the activity log and the deployment's health.
//
// One page, routed by its #fragment (#traffic, #item=REF, #place=slug...), so
// the back button works and any view can be bookmarked. The frame - sidebar,
// top bar, phone tab bar, drawer, command palette - is HTML in
// admin.html.jinja; this file fills it. A listing or a place opens in the
// drawer, over the list it came from, rather than replacing it.
//
// Every answer comes from /api/admin, which checks the session on every call;
// this file decides nothing about who may see what.

import { element } from '/js/utils/format.mjs';
import { categoryLabel, categoryOptions, copy, districtName, districtOptions, placeKindLabel, vocab } from '/js/lostfound/common.mjs';
import { barList, fmt, kpi, lineChart, splitBar, table } from '/js/admin/charts.mjs';

const root = document.querySelector('[data-admin]');
const $ = (selector) => root?.querySelector(selector);
const $$ = (selector) => [...(root?.querySelectorAll(selector) || [])];

// Each view's title in the top bar, and the line above it.
const VIEWS = {
	overview: ['Overview', 'Today'],
	goals: ['Goals', 'Analytics · how we are doing against our targets'],
	traffic: ['Traffic', 'Analytics · Google Analytics'],
	search: ['Search', 'Analytics · Search Console'],
	ratings: ['Ratings', 'Analytics · reader votes'],
	trends: ['Lost & found', 'Analytics · trends'],
	prompts: ['Prompts', 'Analytics · Pulse and ratings, asked and answered'],
	listings: ['Listings', 'Manage'],
	places: ['Places', 'Manage'],
	reports: ['Reports', 'Manage'],
	events: ['Events', 'Manage · sent in, and the calendar'],
	pulse: ['Nairobi Pulse', 'Manage · questions, and how Nairobi answers'],
	newsletter: ['Newsletter', 'Manage · the list, issues and sending'],
	settings: ['Settings', 'Site'],
	activity: ['Activity', 'Site · every admin action'],
	site: ['Health', 'Site'],
};
const ANALYTICS = ['goals', 'traffic', 'search', 'ratings', 'prompts', 'trends'];
// The phone's tab bar has five places; everything else is under More.
const TABBAR = { overview: 'overview', goals: 'analytics', traffic: 'analytics', search: 'analytics', ratings: 'analytics', trends: 'analytics', prompts: 'analytics', listings: 'listings', events: 'events' };

const ITEM_STATUS = { open: 'Open', expired: 'Expired', returned: 'Back with owner', closed: 'Closed', hidden: 'Taken down' };
const PLACE_STATUS = { pending: 'Waiting', active: 'Active', suspended: 'Suspended', rejected: 'Turned down' };
const SIGNIN_ERRORS = {
	denied: 'Only the site owner can sign in here. You were signed in to Google with a different account.',
	state: 'That sign-in had expired. Try again.',
	cancelled: 'The sign-in was cancelled.',
	exchange: 'Google would not confirm that sign-in. Try again.',
	token: 'That sign-in did not check out. Try again.',
	'not-configured': 'Google sign-in is not set up yet: the client ID, secret and session secret are missing from the deployment.',
	server: 'Something went wrong signing in. Try again.',
};

// --- talking to the API -----------------------------------------------------------------

class AdminError extends Error {
	constructor(message, status, code) {
		super(message);
		this.status = status;
		this.code = code;
	}
}

let refreshing = false;
const FRESHABLE = new Set(['traffic', 'search', 'ratings', 'lostfound', 'live', 'prompts', 'goals']);

async function api(route, { params = {}, body } = {}) {
	if (refreshing && FRESHABLE.has(route)) params = { ...params, fresh: '1' };
	let response;
	try {
		response = await fetch(`/api/admin?${new URLSearchParams({ r: route, ...params })}`, {
			method: body ? 'POST' : 'GET',
			headers: body ? { 'Content-Type': 'application/json' } : {},
			body: body ? JSON.stringify(body) : undefined,
			cache: 'no-store',
			credentials: 'same-origin',
		});
	} catch {
		throw new AdminError('No connection.', 0, 'offline');
	}
	let payload = {};
	try { payload = await response.json(); } catch { /* not JSON */ }
	if (response.status === 401) {
		showSignIn();
		throw new AdminError('Signed out.', 401, 'auth');
	}
	if (!response.ok) throw new AdminError(payload.error || 'Something went wrong.', response.status, payload.code || 'server');
	return payload;
}

// --- small pieces ---------------------------------------------------------------------------

const when = (iso) => (iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
const day = (iso) => (iso ? new Date(`${String(iso).slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const daysUntil = (iso) => Math.round((new Date(`${iso}T00:00:00Z`) - new Date(new Date().toISOString().slice(0, 10))) / 86400000);

const chip = (text, tone = '') => element('span', { class: `admin-chip${tone ? ` is-${tone}` : ''}`, text });
const statusChip = (status) => chip(ITEM_STATUS[status] || status, { open: 'good', expired: 'muted', returned: 'good', closed: 'muted', hidden: 'bad' }[status] || '');
const placeChip = (status) => chip(PLACE_STATUS[status] || status, { pending: 'warn', active: 'good', suspended: 'bad', rejected: 'muted' }[status] || '');
const kindChip = (kind) => element('span', { class: `lf-kind lf-kind-${kind}`, text: kind === 'lost' ? 'Lost' : 'Found' });

function section(title, children, extra = {}) {
	return element('section', { class: 'section admin-panel', ...extra }, [title ? element('h2', { text: title }) : null, ...[].concat(children)]);
}

function empty(text) {
	return element('p', { class: 'admin-empty', text });
}

function fact(label, value) {
	if (value === null || value === undefined || value === '') return null;
	return element('div', {}, [element('dt', { text: label }), element('dd', {}, [value])]);
}

function notice(message, tone = 'error') {
	return element('p', { class: `admin-notice is-${tone}`, role: tone === 'error' ? 'alert' : 'status', text: message });
}

function itemRow(item) {
	return element('li', {}, [
		element('a', { class: 'admin-row', href: `#item=${item.ref}` }, [
			element('span', { class: 'admin-row-top' }, [
				kindChip(item.kind),
				element('span', { class: 'admin-ref', text: item.ref }),
				statusChip(item.status),
				item.flags ? chip(`${item.flags} report${item.flags === 1 ? '' : 's'}`, 'bad') : null,
			]),
			element('strong', { text: item.title }),
			element('span', { class: 'admin-row-meta', text: [categoryLabel(item.category), item.place ? `Held at ${item.place.name}` : item.place_text, `listed ${when(item.created_at)}`].filter(Boolean).join(' · ') }),
		]),
	]);
}

function placeRow(place) {
	return element('li', {}, [
		element('a', { class: 'admin-row', href: `#place=${place.slug}` }, [
			element('span', { class: 'admin-row-top' }, [placeChip(place.status), element('span', { class: 'admin-ref', text: placeKindLabel(place.kind) })]),
			element('strong', { text: place.name }),
			element('span', { class: 'admin-row-meta', text: [place.address, districtName(place.district), `asked ${when(place.created_at)}`].filter(Boolean).join(' · ') }),
		]),
	]);
}

const list = (rows, render, none) => (rows.length ? element('ul', { class: 'admin-list' }, rows.map(render)) : empty(none));

function segmented(options, value, onChange, label) {
	const group = element('div', { class: 'admin-segmented', role: 'group', 'aria-label': label });
	for (const [id, text] of options) {
		group.append(element('button', {
			type: 'button',
			'aria-pressed': String(id === value),
			text,
			onclick: (event) => {
				for (const b of group.children) b.setAttribute('aria-pressed', String(b === event.currentTarget));
				onChange(id);
			},
		}));
	}
	return group;
}

function selectBox(label, options, value, onChange, blank) {
	const input = element('select', { 'data-clarity-mask': 'true', 'aria-label': label }, [
		element('option', { value: '', text: blank }),
		...options.map(([v, l]) => element('option', { value: v, text: l })),
	]);
	input.value = value || '';
	input.addEventListener('change', () => onChange(input.value));
	return input;
}

// Buttons that run an action, then redraw the view with the answer.
function actions(buttons, { onDone, noteFor } = {}) {
	const status = element('div', { class: 'admin-action-status', 'aria-live': 'polite' });
	const note = noteFor ? element('input', { type: 'text', class: 'admin-note', placeholder: 'Note for the activity log (optional)', maxlength: '300', 'data-clarity-mask': 'true', 'aria-label': 'Note for the activity log' }) : null;
	const bar = element('div', { class: 'admin-actions' });
	for (const b of buttons.filter(Boolean)) {
		bar.append(element('button', {
			type: 'button',
			class: `admin-button${b.tone ? ` is-${b.tone}` : ''}`,
			text: b.label,
			onclick: async (event) => {
				if (b.confirm && !window.confirm(b.confirm)) return;
				const button = event.currentTarget;
				for (const x of bar.querySelectorAll('button')) x.disabled = true;
				status.replaceChildren(notice('Working…', 'info'));
				try {
					const result = await b.run(note?.value.trim() || '');
					status.replaceChildren();
					if (result) toast(b.done || `${b.label}: done.`, 'good');
					onDone?.(result, b);
					refreshBadges();
				} catch (error) {
					if (error.code !== 'auth') status.replaceChildren(notice(error.message));
				} finally {
					for (const x of bar.querySelectorAll('button')) x.disabled = false;
					button.blur();
				}
			},
		}));
	}
	return element('div', { class: 'admin-action-block' }, [note, bar, status]);
}

// --- the views --------------------------------------------------------------------------------

const view = $('[data-admin-view]');
const panel = $('[data-drawer-body]');

// --- toasts -----------------------------------------------------------------------------------------

function toast(message, tone = 'info') {
	const box = $('[data-toasts]');
	if (!box) return;
	const item = element('div', { class: `aa-toast is-${tone}`, role: tone === 'error' ? 'alert' : 'status' }, [
		element('span', { text: message }),
		element('button', { type: 'button', class: 'aa-toast-close', 'aria-label': 'Dismiss', text: '×', onclick: () => item.remove() }),
	]);
	box.append(item);
	setTimeout(() => item.classList.add('is-leaving'), 4200);
	setTimeout(() => item.remove(), 4700);
}

// --- loading --------------------------------------------------------------------------------------------

function skeleton() {
	const block = (cls) => element('div', { class: `aa-skel ${cls}` });
	return element('div', { class: 'aa-skeleton', 'aria-hidden': 'true' }, [
		element('div', { class: 'kpis' }, [1, 2, 3, 4].map(() => block('is-kpi'))),
		block('is-chart'),
		block('is-rows'),
	]);
}

// Sub-navigation for the analytics views, shown on a phone where the four
// share one tab.
function analyticsNav(current) {
	return element('nav', { class: 'aa-subnav aa-only-narrow', 'aria-label': 'Analytics' }, ANALYTICS.map((id) => element('a', {
		href: `#${id}`, text: VIEWS[id][0], ...(id === current ? { 'aria-current': 'page' } : {}),
	})));
}

// How long each analytics view looks back. Remembered for the session.
let rangeDays = 28;
try { rangeDays = Number(sessionStorage.getItem('admin-range')) || 28; } catch { /* fine */ }

function rangePicker(onChange) {
	return segmented([[7, '7 days'], [28, '28 days'], [90, '90 days']].map(([v, l]) => [String(v), l]), String(rangeDays), (v) => {
		rangeDays = Number(v);
		try { sessionStorage.setItem('admin-range', v); } catch { /* fine */ }
		onChange();
	}, 'Period');
}

// What to say when Google is not connected yet: exactly what to do.
function notReady(result, what) {
	const steps = {
		credentials: 'The service account key (FIRESTORE_CREDENTIALS) is not set in Vercel.',
		property: 'Set GA4_PROPERTY_ID in Vercel to the property number: Google Analytics → Admin → Property details → Property ID. Then redeploy.',
		access: what === 'search'
			? `Search Console → Settings → Users and permissions → Add user: ${result.account}, permission Restricted.`
			: `Google Analytics → Admin → Property access management → add ${result.account} as a Viewer.`,
		dimensions: 'In Google Analytics → Admin → Custom definitions, create two event-scoped custom dimensions named guide and score. Ratings collected before that are not recoverable.',
		api: `The ${what === 'search' ? 'Search Console' : 'Google Analytics Data'} API is switched off in the site's Google Cloud project. Turn it on, wait a minute, and refresh.`,
		error: result.message || 'Google answered with an error.',
	};
	return section('Not connected yet', [
		element('p', { text: steps[result.reason] || steps.error }),
		result.reason === 'api' && result.link ? element('p', {}, [element('a', { class: 'admin-button is-primary', href: result.link, target: '_blank', rel: 'noopener', text: 'Turn on the API in Google Cloud' })]) : null,
		element('p', { class: 'admin-hint', text: 'Nothing is stored from Google: once access is granted, this page reads it live, five minutes at a time.' }),
	]);
}

const sinceLabel = (iso) => (iso ? `Updated ${new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : '');

async function showOverview() {
	const [data, trafficData, searchData, site, goalsData] = await Promise.all([
		api('overview'),
		api('traffic', { params: { days: '28' } }).catch(() => ({ ready: false })),
		api('search', { params: { days: '28' } }).catch(() => ({ ready: false })),
		api('site').catch(() => null),
		api('goals').catch(() => null),
	]);
	const c = data.counts;
	const needs = [];
	if (c.pending) needs.push([`${c.pending} place${c.pending === 1 ? '' : 's'} waiting for approval`, '#places=pending', 'warn']);
	if (c.eventsPending) needs.push([`${c.eventsPending} event${c.eventsPending === 1 ? '' : 's'} sent in, waiting for approval`, '#events', 'warn']);
	if (data.flagged.length) needs.push([`${data.flagged.length} reported listing${data.flagged.length === 1 ? '' : 's'}`, '#reports', 'bad']);
	if (site?.latest && site.deploy.sha && site.latest.sha !== site.deploy.sha) needs.push(['The live site is behind master: a build may have failed', '#site', 'bad']);
	if (site) for (const [key, label] of [['database', 'the database'], ['dailyPurge', 'the daily purge']]) if (!site.settings[key]) needs.push([`${label} is not set up`, '#site', 'bad']);
	if (!trafficData.ready) needs.push(['Google Analytics is not connected', '#traffic', 'warn']);
	if (!searchData.ready) needs.push(['Search Console is not connected', '#search', 'warn']);

	const t = trafficData.ready ? trafficData.totals : null;
	const sc = searchData.ready ? searchData.totals : null;
	const tile = (n, label, href, tone = '') => element('a', { class: `admin-stat${tone ? ` is-${tone}` : ''}`, href }, [element('strong', { text: String(n) }), element('span', { text: label })]);
	return [
		element('div', { class: 'kpis' }, [
			t ? kpi('Visitors, 28 days', t.current.activeUsers, { previous: t.previous.activeUsers, spark: trafficData.daily.map((x) => x.users), href: '#traffic' }) : null,
			t ? kpi('Page views', t.current.screenPageViews, { previous: t.previous.screenPageViews, spark: trafficData.daily.map((x) => x.views), href: '#traffic' }) : null,
			sc ? kpi('Search clicks', sc.current.clicks, { previous: sc.previous.clicks, spark: searchData.daily.map((x) => x.clicks), href: '#search' }) : null,
			sc ? kpi('Search impressions', sc.current.impressions, { previous: sc.previous.impressions, format: fmt.compact, spark: searchData.daily.map((x) => x.impressions), href: '#search' }) : null,
			trafficData.ready ? kpi('On the site now', trafficData.realtime.users, { note: 'last 30 minutes', live: true }) : null,
		]),
		goalsGlance(goalsData),
		section('Needs you', needs.length
			? element('ul', { class: 'admin-needs' }, needs.map(([text, href, tone]) => element('li', { class: `is-${tone}` }, [element('a', { href, text })])))
			: element('p', { class: 'admin-empty', text: 'Nothing. Every place and event is decided, nothing is reported, and the site is up to date.' })),
		trafficData.ready ? section('Visitors', lineChart({ dates: trafficData.daily.map((d) => d.date), series: [{ name: 'Visitors', values: trafficData.daily.map((d) => d.users), tone: 'a' }, { name: 'Page views', values: trafficData.daily.map((d) => d.views), tone: 'b' }] })) : null,
		section('Lost and found', [
			element('div', { class: 'admin-stats' }, [
				tile(c.open, 'open listings', '#listings=open'),
				tile(c.pending, 'places waiting', '#places=pending', c.pending ? 'warn' : ''),
				tile(data.flagged.length, 'reported', '#reports', data.flagged.length ? 'bad' : ''),
				tile(c.itemsWeek, 'listed this week', '#listings'),
				tile(c.claimsWeek, 'replies this week', '#trends'),
				tile(c.returned, 'back with owners', '#listings=returned', 'good'),
				tile(c.active, 'active places', '#places=active'),
				tile(c.expired, 'expired, still open', '#listings=expired'),
				tile(c.eventsPending || 0, 'events waiting', '#events', c.eventsPending ? 'warn' : ''),
			]),
		]),
		c.pending ? section('Waiting for approval', list(data.pending, placeRow, '')) : null,
		section('Latest listings', list(data.recent, itemRow, 'Nothing has been listed yet.')),
	];
}

// --- analytics ------------------------------------------------------------------------------------

async function showTraffic() {
	const holder = element('div');
	const draw = async (fresh = false) => {
		holder.setAttribute('aria-busy', 'true');
		const d = await api('traffic', { params: { days: String(rangeDays), ...(fresh ? { fresh: '1' } : {}) } });
		holder.removeAttribute('aria-busy');
		if (!d.ready) return holder.replaceChildren(notReady(d, 'traffic'));
		const cur = d.totals.current;
		const prev = d.totals.previous;
		holder.replaceChildren(
			element('div', { class: 'kpis' }, [
				kpi('Visitors', cur.activeUsers, { previous: prev.activeUsers, spark: d.daily.map((x) => x.users) }),
				kpi('New visitors', cur.newUsers, { previous: prev.newUsers }),
				kpi('Sessions', cur.sessions, { previous: prev.sessions }),
				kpi('Page views', cur.screenPageViews, { previous: prev.screenPageViews, spark: d.daily.map((x) => x.views) }),
				kpi('Engaged sessions', cur.engagementRate, { previous: prev.engagementRate, format: (n) => fmt.pct(n, 0) }),
				kpi('Average session', cur.averageSessionDuration, { previous: prev.averageSessionDuration, format: fmt.secs }),
			]),
			element('section', { class: 'section admin-panel' }, [
				element('h2', {}, [element('span', { class: 'aa-live-dot', 'aria-hidden': 'true' }), 'On the site now: ', element('span', { 'data-live-users': '', text: fmt.int(d.realtime.users) })]),
				element('div', { 'data-live-pages': '' }, [d.realtime.pages.length ? barList(d.realtime.pages) : element('p', { class: 'admin-empty', text: 'Nobody in the last 30 minutes.' })]),
			]),
			section('Every day', lineChart({ dates: d.daily.map((x) => x.date), series: [{ name: 'Visitors', values: d.daily.map((x) => x.users), tone: 'a' }, { name: 'Page views', values: d.daily.map((x) => x.views), tone: 'b' }] })),
			section('Top pages', table([
				{ label: 'Page', value: (r) => r.path, href: (r) => r.path, external: true },
				{ label: 'Views', value: (r) => r.views, numeric: true, format: fmt.int },
				{ label: 'Visitors', value: (r) => r.users, numeric: true, format: fmt.int },
				{ label: 'Time per visitor', value: (r) => r.engagedSeconds, numeric: true, format: fmt.secs },
			], d.pages, { filename: `top-pages-${d.days}d` })),
			element('div', { class: 'admin-pair' }, [
				section('How they arrive', [splitBar(d.channels), element('h3', { text: 'Sources' }), barList(d.sources)]),
				section('Devices', [splitBar(d.devices), element('h3', { text: 'Countries' }), barList(d.countries), element('h3', { text: 'Cities' }), barList(d.cities)]),
			]),
			section('Where visits start', barList(d.landing.map((r) => ({ ...r, href: r.label, external: true })))),
			element('p', { class: 'admin-hint' }, [sinceLabel(d.cachedAt), ' · ', element('button', { type: 'button', class: 'admin-link-button', text: 'Refresh now', onclick: () => draw(true) })]),
		);
	};
	await draw();
	return [analyticsNav('traffic'), element('div', { class: 'admin-toolbar' }, [rangePicker(() => draw())]), holder];
}

async function showSearch() {
	const holder = element('div');
	const draw = async (fresh = false) => {
		const d = await api('search', { params: { days: String(rangeDays), ...(fresh ? { fresh: '1' } : {}) } });
		if (!d.ready) return holder.replaceChildren(notReady(d, 'search'));
		const cur = d.totals.current;
		const prev = d.totals.previous;
		const qCols = [
			{ label: 'Query', value: (r) => r.key ?? r.query },
			{ label: 'Clicks', value: (r) => r.clicks, numeric: true, format: fmt.int },
			{ label: 'Impressions', value: (r) => r.impressions, numeric: true, format: fmt.int },
			{ label: 'CTR', value: (r) => r.ctr, numeric: true, format: (n) => fmt.pct(n) },
			{ label: 'Position', value: (r) => r.position, numeric: true, format: fmt.pos },
		];
		const withPage = [qCols[0], { label: 'Page', value: (r) => new URL(r.page).pathname, href: (r) => r.page, external: true }, ...qCols.slice(1)];
		holder.replaceChildren(
			element('p', { class: 'admin-hint', text: `${fmt.day(d.window.startDate)} – ${fmt.day(d.window.endDate)}, against the ${d.days} days before. Search Console runs about two days behind, so the window ends three days ago and every day in it is complete.` }),
			element('div', { class: 'kpis' }, [
				kpi('Clicks', cur.clicks, { previous: prev.clicks, spark: d.daily.map((x) => x.clicks) }),
				kpi('Impressions', cur.impressions, { previous: prev.impressions, format: fmt.compact, spark: d.daily.map((x) => x.impressions) }),
				kpi('Click-through', cur.ctr, { previous: prev.ctr, format: (n) => fmt.pct(n) }),
				kpi('Average position', cur.position, { previous: prev.position, format: fmt.pos, invert: true }),
			]),
			section('Every day', lineChart({ dates: d.daily.map((x) => x.date), series: [{ name: 'Clicks', values: d.daily.map((x) => x.clicks), tone: 'a' }, { name: 'Impressions', values: d.daily.map((x) => x.impressions), tone: 'b' }] })),
			section('Ranking, not clicked', [
				element('p', { class: 'admin-hint', text: 'On page one, seen at least 20 times, chosen under 2% of the time. When a page ranks and nobody clicks, the title and description are usually the bug - unless the results page is a map pack or a shopping carousel, which no title beats.' }),
				table(withPage, d.unclicked, { filename: `unclicked-${d.days}d`, empty: 'None: every page-one result is being chosen.' }),
			]),
			section('Nearly on page one', [
				element('p', { class: 'admin-hint', text: 'Positions 11 to 20, seen at least 20 times. A better page moves these most.' }),
				table(withPage, d.nearlyThere, { filename: `page-two-${d.days}d`, empty: 'None right now.' }),
			]),
			section('Top queries', table(qCols, d.queries, { filename: `queries-${d.days}d` })),
			section('Top pages', table([{ label: 'Page', value: (r) => new URL(r.key).pathname, href: (r) => r.key, external: true }, ...qCols.slice(1)], d.pages, { filename: `search-pages-${d.days}d` })),
			section('Devices', splitBar(d.devices.map((x) => ({ label: x.key.toLowerCase(), value: x.clicks })))),
			element('p', { class: 'admin-hint' }, [`Property ${d.site}. `, sinceLabel(d.cachedAt), ' · ', element('button', { type: 'button', class: 'admin-link-button', text: 'Refresh now', onclick: () => draw(true) })]),
		);
	};
	await draw();
	return [analyticsNav('search'), element('div', { class: 'admin-toolbar' }, [rangePicker(() => draw())]), holder];
}

async function showRatings() {
	const d = await api('ratings');
	if (!d.ready) return [analyticsNav('ratings'), notReady(d, 'ratings')];
	const stars = (n) => `${n.toFixed(2)} / 5`;
	return [
		analyticsNav('ratings'),
		element('div', { class: 'kpis' }, [
			kpi('Votes', d.votes),
			kpi('Mean score', d.mean, { format: (n) => (d.votes ? stars(n) : '–') }),
			kpi('Guides with a published score', d.guides.filter((g) => g.enough).length, { note: `${d.minVotes}+ votes each` }),
		]),
		section('Every vote', splitBar(d.spread.map((n, i) => ({ label: `${i + 1}★`, value: n })))),
		section('By guide', [
			element('p', { class: 'admin-hint', text: `Lowest first among guides with ${d.minVotes} or more votes - the ones most worth rewriting. Under ${d.minVotes} votes a mean is noise, and the site publishes none.` }),
			table([
				{ label: 'Guide', value: (r) => r.guide, href: (r) => `/${r.guide}`, external: true },
				{ label: 'Votes', value: (r) => r.votes, numeric: true, format: fmt.int },
				{ label: 'Mean', value: (r) => (r.enough ? r.mean : null), numeric: true, format: (v) => (v === null ? 'too few' : stars(v)) },
				{ label: '1★ 2★ 3★ 4★ 5★', value: (r) => r.spread.join('  ') },
			], d.guides, { filename: 'ratings', empty: 'No ratings yet.' }),
		]),
	];
}

async function showTrends() {
	const holder = element('div');
	const draw = async () => {
		const d = await api('lostfound', { params: { days: String(rangeDays) } });
		if (!d.ready) return holder.replaceChildren(notReady(d, 'lostfound'));
		const t = d.totals;
		const rate = (g) => (g.listed ? `${Math.round((g.returned / g.listed) * 100)}% back` : '');
		holder.replaceChildren(
			element('div', { class: 'kpis' }, [
				kpi('Listed', t.listed, { note: `${t.lost} lost · ${t.found} found` }),
				kpi('Back with owners', t.returned, { note: t.listed ? `${Math.round((t.returned / t.listed) * 100)}% of listings` : '' }),
				kpi('Listings with a reply', t.withReply, { note: t.listed ? `${Math.round((t.withReply / t.listed) * 100)}%` : '' }),
				kpi('Replies', t.replies),
				kpi('Median time to return', t.medianDaysToReturn ?? 0, { format: (n) => (t.medianDaysToReturn === null ? '–' : `${n} days`), note: t.timedReturns ? `from ${t.timedReturns} returns` : 'counted from returns marked from now on' }),
			]),
			section('Listed every day', lineChart({ dates: d.daily.map((x) => x.date), series: [{ name: 'Lost', values: d.daily.map((x) => x.lost), tone: 'lost' }, { name: 'Found', values: d.daily.map((x) => x.found), tone: 'found' }] })),
			element('div', { class: 'admin-pair' }, [
				section('By category', barList(d.categories.map((g) => ({ label: categoryLabel(g.key), value: g.listed, sub: rate(g) })))),
				section('By district', barList(d.districts.map((g) => ({ label: districtName(g.key) || 'No district given', value: g.listed, sub: rate(g) })))),
			]),
			section('Places', table([
				{ label: 'Place', value: (r) => r.name, href: (r) => `#place=${r.slug}` },
				{ label: 'Listed', value: (r) => r.listed, numeric: true, format: fmt.int },
				{ label: 'Back with owners', value: (r) => r.returned, numeric: true, format: fmt.int },
			], d.places, { filename: `places-${d.days}d`, empty: 'No places have joined yet.' })),
			element('p', { class: 'admin-hint', text: `All time: ${fmt.int(d.allTime.listed)} listed, ${fmt.int(d.allTime.returned)} back with their owners.` }),
		);
	};
	await draw();
	return [analyticsNav('trends'), element('div', { class: 'admin-toolbar' }, [rangePicker(() => draw())]), holder];
}

// --- Prompts: the Pulse card and the rating prompt, shown and answered -----------------------------
//
// From the counts /api/prompts adds up, one document a day (_prompts/handlers.mjs):
// what opened each card, what readers did with it, and how the location check
// went; how often the rating prompt was shown and what it got. Counts only.

const PULSE_WHY = { reading: 'After reading a while', leaving: 'Heading for the tabs', back: 'The back gesture', page: '/pulse\'s own button', test: '?pulse=ask (you)' };
const PULSE_OUTCOME = { answered: 'Answered', notnow: 'Not now', close: 'Closed', never: "Don't ask me again", ignored: 'Left it open' };
const RATING_OUTCOME = { scored: 'Rated the guide', dismissed: 'Dismissed', ignored: 'Left it open' };

// --- goals ------------------------------------------------------------------------------------------
//
// Baseline, now and target for each of the site's goals, from /api/admin's
// `goals` route (see _admin/goals.mjs). Every number but the targets is
// measured; a target can be moved here, and the default is always shown
// beside it.

const GOAL_STATUS = {
	reached: ['Reached', 'good'], 'on-track': ['On track', 'good'], behind: ['Behind', 'warn'], 'off-track': ['Off track', 'bad'],
	early: ['Too early to say', 'muted'], missed: ['Missed', 'bad'], unknown: ['Not measured', 'muted'],
};
const GOAL_GROUPS = { search: 'Search: being found and chosen on Google', audience: 'Readers', owned: 'The newsletter list' };
const goalChip = (status) => chip(...(GOAL_STATUS[status] || [status, '']));

function goalFormat(format) {
	if (format === 'pct') return (n) => fmt.pct(n, n < 0.01 ? 2 : 1);
	if (format === 'perDay') return (n) => (Math.abs(n) < 10 ? (Number(n) || 0).toFixed(1) : fmt.int(n));
	return fmt.int;
}
const goalUnit = (format) => (format === 'perDay' ? ' a day' : '');

function goalBar(g) {
	const fill = Math.max(0, Math.min(1, g.progress ?? 0));
	return element('div', { class: `goal-bar is-${(GOAL_STATUS[g.status] || [])[1] || 'muted'}`, role: 'img', 'aria-label': g.progress === undefined ? 'Not measured' : `${Math.round(fill * 100)}% of the way, against ${Math.round((g.expected || 0) * 100)}% expected by today` }, [
		element('span', { class: 'goal-fill', style: `width:${(fill * 100).toFixed(1)}%` }),
		g.expected !== undefined ? element('span', { class: 'goal-expected', style: `left:${(Math.min(1, g.expected) * 100).toFixed(1)}%`, title: 'Where it should be by today' }) : null,
	]);
}

function goalDelta(g, f) {
	if (g.previous === null || g.previous === undefined || g.current === null) return null;
	if (!g.previous) return g.current ? 'none in the 28 days before' : null;
	const change = (g.current - g.previous) / g.previous;
	if (Math.abs(change) < 0.005) return 'no change on the 28 days before';
	return `${change > 0 ? '▲' : '▼'} ${Math.abs(change * 100).toFixed(Math.abs(change) < 0.1 ? 1 : 0)}% on the 28 days before (${f(g.previous)})`;
}

function goalOutlook(g, f) {
	if (g.status === 'reached') return 'Reached. Keep it there, or raise the target.';
	if (g.status === 'unknown') return null;
	if (g.status === 'missed') return `Its date has passed. Set a new one.`;
	const parts = [];
	if (g.pace !== undefined && g.status !== 'early') parts.push(`Should be about ${f(g.pace)}${goalUnit(g.format)} by now`);
	if (g.projected) parts.push(`at this pace, reached ${day(g.projected)}`);
	else if ((g.progress ?? 0) <= 0) parts.push('not moving toward it yet');
	if (g.needed) {
		const w = g.needed.perWeek;
		if (g.needed.kind === 'growth') parts.push(`needs ${w > 0 ? '+' : ''}${(w * 100).toFixed(0)}% a week from here`);
		else if (g.format === 'pct') parts.push(`needs ${Math.abs(w * 100).toFixed(w * 100 < 1 ? 2 : 1)} points ${w < 0 ? 'less' : 'more'} a week from here`);
		else parts.push(`needs ${f(Math.abs(w))} ${w < 0 ? 'fewer' : 'more'} a week from here`);
	}
	return parts.length ? `${parts.join('; ')}.`.replace(/^./, (c) => c.toUpperCase()) : null;
}

function goalEditor(g, onSaved) {
	const pct = g.format === 'pct';
	const target = element('input', { type: 'number', min: '0', step: pct ? '0.1' : g.format === 'perDay' ? '0.5' : '1', 'aria-label': `Target for ${g.label}${pct ? ', in percent' : ''}` });
	target.value = g.target === null ? '' : String(pct ? Math.round(g.target * 1000) / 10 : g.target);
	const by = element('input', { type: 'date', 'aria-label': 'By' });
	by.value = g.by;
	const status = element('div', { 'aria-live': 'polite' });
	const save = async (body) => {
		try {
			onSaved(await api('goals', { body: { id: g.id, ...body } }));
			toast('Saved.', 'good');
		} catch (error) {
			if (error.code !== 'auth') status.replaceChildren(notice(error.message));
		}
	};
	const d = g.defaults;
	return element('div', { class: 'admin-form goal-editor' }, [
		element('div', { class: 'admin-filter-pair' }, [
			element('label', {}, [element('span', { text: `Target${pct ? ' (%)' : goalUnit(g.format)}` }), target]),
			element('label', {}, [element('span', { text: 'By' }), by]),
		]),
		element('p', { class: 'admin-hint', text: `The default is ${d.target === null ? 'set from the baseline' : goalFormat(g.format)(d.target)}${goalUnit(g.format)}${d.rule ? ` (${d.rule})` : ''} by ${day(d.by)}.` }),
		element('div', { class: 'admin-actions' }, [
			element('button', { type: 'button', class: 'admin-button is-primary', text: 'Save target', onclick: () => save({ action: 'target', target: pct ? Number(target.value) / 100 : Number(target.value), by: by.value }) }),
			g.changed ? element('button', { type: 'button', class: 'admin-button', text: 'Back to the default', onclick: () => save({ action: 'reset' }) }) : null,
		]),
		status,
	]);
}

function goalCard(g, onSaved) {
	const f = goalFormat(g.format);
	const editor = element('div', { hidden: '' });
	const toggle = element('button', { type: 'button', class: 'admin-link-button', text: 'Change the target', 'aria-expanded': 'false', onclick: () => {
		const open = editor.hidden;
		editor.hidden = !open;
		toggle.setAttribute('aria-expanded', String(open));
		if (open && !editor.childElementCount) editor.append(goalEditor(g, onSaved));
	} });
	return element('li', { class: 'goal' }, [
		element('div', { class: 'goal-head' }, [element('h3', { text: g.label }), goalChip(g.status)]),
		g.ready ? element('p', { class: 'goal-figures' }, [
			element('strong', { class: 'goal-now', text: g.current === null ? '-' : `${f(g.current)}${goalUnit(g.format)}` }),
			element('span', { class: 'goal-target', text: g.target === null ? 'no target yet' : `target ${f(g.target)} by ${day(g.by)}${g.changed ? ' (yours)' : ''}` }),
		]) : element('p', { class: 'admin-hint', text: { sc: 'Connect Search Console to measure this.', ga: 'Connect Google Analytics to measure this.', site: 'Needs the database.' }[g.source] }),
		g.ready ? goalBar(g) : null,
		g.ready ? element('p', { class: 'goal-meta', text: [
			g.baseline === null ? null : g.from && g.from !== goalsBaselineEnd ? `From ${f(g.baseline)} when it began, ${day(g.from)}` : `From ${f(g.baseline)} at the baseline`,
			goalDelta(g, f),
		].filter(Boolean).join(' · ') }) : null,
		g.ready && goalOutlook(g, f) ? element('p', { class: 'goal-outlook', text: goalOutlook(g, f) }) : null,
		element('details', { class: 'goal-why' }, [element('summary', { text: 'Why this goal' }), element('p', { text: g.why })]),
		toggle,
		editor,
	]);
}

function goalsSummary(d) {
	const n = (s) => d.summary[s] || 0;
	const good = n('reached') + n('on-track');
	const measured = d.goals.length - n('unknown');
	const left = Math.max(0, Math.ceil((Date.parse(`${d.calendarEnd}T00:00:00Z`) - Date.now()) / 86400000));
	return element('div', { class: 'goal-summary' }, [
		element('p', { class: 'goal-headline' }, measured
			? [element('strong', { text: `${good} of ${measured}` }), ` ${measured === d.goals.length ? '' : 'measured '}goals reached or on track`]
			: ['No goal can be measured until Search Console and Google Analytics are connected']),
		element('p', { class: 'admin-hint', text: `${left ? `${left} days to ${day(d.calendarEnd)}, the end of the 90-day calendar` : `The 90-day calendar ended on ${day(d.calendarEnd)}`}. Measured against ${d.baseline.label}.` }),
		element('div', { class: 'goal-counts' }, Object.keys(GOAL_STATUS).filter((s) => n(s)).map((s) => element('span', {}, [goalChip(s), ` ${n(s)}`]))),
	]);
}

// The baseline's last day, from the last answer: a goal that started later says so.
let goalsBaselineEnd = null;

async function showGoals() {
	const holder = element('div');
	const draw = (d) => {
		goalsBaselineEnd = d.baseline.end;
		const byGroup = (group) => d.goals.filter((g) => g.group === group);
		const kpiOf = (id, label) => {
			const g = d.goals.find((x) => x.id === id);
			if (!g?.ready || g.current === null) return null;
			// A rise from nothing is not a percentage: the tile says "new" instead.
			return kpi(label, g.current, { previous: g.previous ? g.previous : undefined, format: goalFormat(g.format), note: [g.previous === 0 && g.current ? 'new this month' : '', g.target === null ? '' : `target ${goalFormat(g.format)(g.target)}`].filter(Boolean).join(' · ') });
		};
		const chartOf = (t, title, format) => (t ? section(title, [
			lineChart({ dates: t.dates, series: [{ name: t.name, values: t.values, tone: 'a' }, ...(t.pace.some((v) => v !== null) ? [{ name: 'The pace the goal needs', values: t.pace, tone: 'b' }] : [])], format, label: `${t.name}, a seven-day average, against the pace the goal needs` }),
			element('p', { class: 'admin-hint', text: 'A seven-day average. Above the pace line is ahead; below it is behind.' }),
		]) : null);
		const sources = d.sources;
		holder.replaceChildren(...[
			section('', goalsSummary(d)),
			element('div', { class: 'kpis' }, [
				kpiOf('clicks', 'Clicks from Google a day'),
				kpiOf('impressions', 'Winnable impressions a day'),
				kpiOf('ctr', 'Winnable click-through'),
				kpiOf('visitors', 'Visitors a day'),
				kpiOf('searchShare', 'Visits from search'),
				kpiOf('subscribers', 'Newsletter subscribers'),
			].filter(Boolean)),
			// One notice when both are missing for the same reason - the key, say.
			!sources.sc.ready ? notReady(sources.sc, 'search') : null,
			!sources.ga.ready && !(sources.sc.ready === false && sources.sc.reason === sources.ga.reason && sources.ga.reason === 'credentials') ? notReady(sources.ga, 'traffic') : null,
			...Object.entries(GOAL_GROUPS).map(([group, title]) => section(title, element('ul', { class: 'goal-list' }, byGroup(group).map((g) => goalCard(g, draw))))),
			element('div', { class: 'admin-pair' }, [
				chartOf(d.trends.clicks, 'Clicks a day, against the pace', (n) => (n < 10 ? n.toFixed(1) : fmt.int(n))),
				chartOf(d.trends.visitors, 'Visitors a day, against the pace', fmt.int),
			].filter(Boolean)),
			section('How these are measured', element('ul', { class: 'admin-reasons' }, [
				`Baseline: ${d.baseline.label} - the window seo/guide-pipeline-2026-09.md was drawn from. Search Console first saw the site on 9 September, so a baseline "a day" is over the days it had.`,
				d.windows.sc ? `Now: Search Console ${fmt.day(d.windows.sc.current.start)} – ${fmt.day(d.windows.sc.current.end)} (it runs about two days behind), Google Analytics to ${fmt.day(d.windows.ga?.current.end || d.windows.sc.current.end)}; each against the 28 days before.` : null,
				'Winnable searches leave out somebody else\'s site by name (icums, portals, logins), "near me", and glossary pages, which Google answers on the results page. Three quarters of September\'s impressions were those.',
				'On track compares how far each goal has come with how far it should have by today. Counts that grow by multiplying are judged on a log scale, rates on a straight line.',
				'Targets are decisions, not measurements. Change any of them above; the default stays beside it.',
			].filter(Boolean).map((t) => element('li', { text: t })))),
			element('p', { class: 'admin-hint' }, [sinceLabel(d.cachedAt), d.cachedAt ? ' · ' : '', 'Search and analytics figures are kept for half an hour; the refresh button asks again.']),
		].filter(Boolean));
	};
	draw(await api('goals'));
	return [analyticsNav('goals'), holder];
}

/** The Overview's line on goals: each one's status and bar, linking through. */
function goalsGlance(d) {
	if (!d?.goals) return null;
	return section('Goals', [
		goalsSummary(d),
		element('ul', { class: 'goal-glance' }, d.goals.map((g) => {
			const f = goalFormat(g.format);
			return element('li', {}, [
				element('a', { href: '#goals', class: 'goal-glance-row' }, [
					element('span', { class: 'goal-glance-label', text: g.label }),
					goalChip(g.status),
					element('span', { class: 'goal-glance-value', text: g.ready && g.current !== null ? `${f(g.current)} of ${g.target === null ? '-' : f(g.target)}` : '-' }),
				]),
				g.ready ? goalBar(g) : null,
			]);
		})),
		element('p', {}, [element('a', { href: '#goals', text: 'Every goal, with what it needs ➞' })]),
	]);
}

async function showPrompts() {
	const holder = element('div');
	const draw = async () => {
		const d = await api('prompts', { params: { days: String(rangeDays) } });
		if (!d.first) {
			holder.replaceChildren(section('Nothing counted yet', [
				element('p', { text: 'Each Pulse card and each rating prompt reports once, when it closes, what opened it and what the reader did. The first reports appear here within a minute of the first card.' }),
			]));
			return;
		}
		const total = (map) => Object.values(map || {}).reduce((a, n) => a + (typeof n === 'number' ? n : 0), 0);
		const share = (n, of) => (of ? `${Math.round((n / of) * 100)}%` : '');
		const c = d.current;
		const p = d.previous;
		const pulse = c.pulse || {};
		const rating = c.rating || {};
		const shown = total(pulse.shown);
		const answered = total(pulse.answeredBy);
		const scores = rating.score || {};
		const scored = total(scores);
		const mean = scored ? Object.entries(scores).reduce((a, [k, n]) => a + Number(k) * n, 0) / scored : 0;
		const locate = pulse.locate || {};
		holder.replaceChildren(
			element('div', { class: 'kpis' }, [
				kpi('Pulse cards shown', shown, { previous: total(p.pulse?.shown), spark: d.daily.map((x) => x.pulseShown) }),
				kpi('Answered', answered, { previous: total(p.pulse?.answeredBy), note: shown ? `${share(answered, shown)} of cards shown` : '' }),
				kpi('Votes from cards', pulse.answers || 0, { previous: p.pulse?.answers || 0, note: answered ? `${(pulse.answers / answered).toFixed(1)} a card answered` : '' }),
				kpi("Don't ask me again", pulse.outcome?.never || 0, { previous: p.pulse?.outcome?.never || 0, invert: true, note: shown ? `${share(pulse.outcome?.never || 0, shown)} of cards` : '' }),
				kpi('Rating prompts shown', rating.shown || 0, { previous: p.rating?.shown || 0, spark: d.daily.map((x) => x.ratingShown) }),
				kpi('Rated', scored, { previous: total(p.rating?.score), note: rating.shown ? `${share(scored, rating.shown)} of prompts` : '' }),
				kpi('Mean rating', mean, { format: (n) => (scored ? `${n.toFixed(2)} / 5` : '-') }),
				kpi('Asked to say more', rating.contact || 0, { note: 'followed the link under a low score' }),
			]),
			section('Every day', lineChart({
				dates: d.daily.map((x) => x.date),
				series: [
					{ name: 'Cards shown', values: d.daily.map((x) => x.pulseShown), tone: 'b' },
					{ name: 'Cards answered', values: d.daily.map((x) => x.pulseAnswered), tone: 'a' },
				],
				label: 'Pulse cards shown and answered by day',
			})),
			section('Which moment works', [
				element('p', { class: 'admin-hint', text: 'What opened each card, and how many of those were answered. A moment that is shown often and rarely answered is one readers find in the way.' }),
				table([
					{ label: 'What opened it', value: (r) => r.label },
					{ label: 'Shown', value: (r) => r.shown, numeric: true, format: fmt.int },
					{ label: 'Answered', value: (r) => r.answered, numeric: true, format: fmt.int },
					{ label: 'Rate', value: (r) => (r.shown ? r.answered / r.shown : 0), numeric: true, format: (v) => fmt.pct(v, 0) },
				], Object.keys(PULSE_WHY).map((id) => ({ label: PULSE_WHY[id], shown: pulse.shown?.[id] || 0, answered: pulse.answeredBy?.[id] || 0 })).filter((r) => r.shown), { filename: `pulse-moments-${d.days}d`, empty: 'No cards shown in this period.' }),
			]),
			element('div', { class: 'admin-pair' }, [
				section('What readers did with the card', shown
					? splitBar(Object.keys(PULSE_OUTCOME).map((id) => ({ label: PULSE_OUTCOME[id], value: pulse.outcome?.[id] || 0 })).filter((r) => r.value))
					: empty('No cards shown in this period.')),
				section('Answers in a row', [
					element('p', { class: 'admin-hint', text: 'How many questions a card got through, offering the next after each answer.' }),
					barList(['1', '2', '3', '4'].map((k) => ({ label: k === '4' ? 'Four or more' : `${k} ${k === '1' ? 'question' : 'questions'}`, value: pulse.chain?.[k] || 0, sub: share(pulse.chain?.[k] || 0, answered) })), { empty: 'Nothing answered yet.' }),
				]),
			]),
			section('The location check', [
				element('p', { class: 'admin-hint', text: 'Asked once, before a reader\'s first vote. Of those asked: shared and inside Nairobi, outside it, refused by the browser, or no fix.' }),
				barList([
					{ label: 'Asked', value: locate.asked || 0 },
					{ label: 'Shared, in Nairobi', value: locate.ok || 0, sub: share(locate.ok || 0, locate.asked) },
					{ label: 'Outside Nairobi', value: locate.outside || 0, sub: share(locate.outside || 0, locate.asked) },
					{ label: 'Refused by the browser', value: locate.refused || 0, sub: share(locate.refused || 0, locate.asked) },
					{ label: 'No fix, or no connection', value: locate.failed || 0, sub: share(locate.failed || 0, locate.asked) },
				].filter((r, i) => i === 0 || r.value), { empty: 'Nobody asked yet.' }),
				pulse.checkin ? element('p', { class: 'admin-hint', text: `${fmt.int(pulse.checkin)} checked where they were from /pulse's own "Check in".` }) : null,
			]),
			element('div', { class: 'admin-pair' }, [
				section('The rating prompt', rating.shown
					? splitBar(Object.keys(RATING_OUTCOME).map((id) => ({ label: RATING_OUTCOME[id], value: rating.outcome?.[id] || 0 })).filter((r) => r.value))
					: empty('Not shown in this period.')),
				section('Scores given', barList(['5', '4', '3', '2', '1'].map((k) => ({ label: `${k} out of 5`, value: scores[k] || 0, sub: share(scores[k] || 0, scored) })), { empty: 'No scores yet.' })),
			]),
			element('p', { class: 'admin-hint', text: `Since counting began on ${day(d.first)}: ${count(total(d.allTime.pulse?.shown), 'card')} shown and ${count(d.allTime.pulse?.answers || 0, 'vote')} from them; ${count(d.allTime.rating?.shown || 0, 'rating prompt')} and ${count(total(d.allTime.rating?.score), 'rating')}. Which guide a rating was for is in Ratings, from GA4.` }),
		);
	};
	await draw();
	return [analyticsNav('prompts'), element('div', { class: 'admin-toolbar' }, [rangePicker(() => draw())]), holder];
}

const listingState = { status: '', kind: '', category: '', q: '', page: 0 };

async function showListings(preset) {
	if (preset !== undefined) Object.assign(listingState, { status: preset, page: 0 });
	const results = element('div', { 'aria-live': 'polite' });
	const more = element('button', { type: 'button', class: 'admin-button', hidden: '', text: 'Show more' });
	let searchTimer = null;

	async function load(append = false) {
		listingState.page = append ? listingState.page + 1 : 0;
		const params = { page: String(listingState.page) };
		for (const key of ['status', 'kind', 'category', 'q']) if (listingState[key]) params[key] = listingState[key];
		try {
			const data = await api('items', { params });
			const rows = data.items.map(itemRow);
			if (append) results.querySelector('ul')?.append(...rows);
			else results.replaceChildren(data.items.length ? element('ul', { class: 'admin-list' }, rows) : empty('Nothing matches.'));
			more.hidden = !data.more;
		} catch (error) {
			if (error.code !== 'auth') results.replaceChildren(notice(error.message));
		}
	}
	more.addEventListener('click', () => load(true));

	const search = element('input', { type: 'search', placeholder: 'Words, or a reference like F-ABC23', 'data-clarity-mask': 'true', 'aria-label': 'Search listings' });
	search.value = listingState.q;
	search.addEventListener('input', () => {
		clearTimeout(searchTimer);
		searchTimer = setTimeout(() => { listingState.q = search.value.trim(); load(); }, 300);
	});

	const filters = element('div', { class: 'admin-filters' }, [
		segmented([['', 'All'], ...Object.entries(ITEM_STATUS)], listingState.status, (v) => { listingState.status = v; load(); }, 'Status'),
		search,
		element('div', { class: 'admin-filter-pair' }, [
			selectBox('Lost or found', [['lost', 'Lost'], ['found', 'Found']], listingState.kind, (v) => { listingState.kind = v; load(); }, 'Lost and found'),
			selectBox('Category', categoryOptions(), listingState.category, (v) => { listingState.category = v; load(); }, 'Any category'),
		]),
	]);
	load();
	return [section('', [filters, results, more])];
}

async function showItem(ref) {
	const data = await api('item', { params: { ref } });
	const draw = (d) => {
		const i = d.item;
		const replies = d.claims.reduce((n, c) => ({ ...n, [c.status]: (n[c.status] || 0) + 1 }), {});
		const open = i.status === 'open';
		return [
			section('', [
				element('div', { class: 'admin-row-top' }, [kindChip(i.kind), element('span', { class: 'admin-ref', text: i.ref }), statusChip(i.status), i.flags ? chip(`${i.flags} report${i.flags === 1 ? '' : 's'}`, 'bad') : null]),
				element('h2', { class: 'admin-title', text: i.title }),
				i.details ? element('p', { text: i.details }) : null,
				element('dl', { class: 'admin-facts' }, [
					fact('Category', categoryLabel(i.category)),
					fact('Where', [i.place_text, districtName(i.district)].filter(Boolean).join(' · ')),
					fact('Held at', i.place ? element('a', { href: `#place=${i.place.slug}`, text: i.place.name }) : null),
					fact(i.kind === 'lost' ? 'Lost on' : 'Found on', day(i.happened_on)),
					fact('Listed', when(i.created_at)),
					fact('Closes', when(i.expires_at)),
					fact('Replies', d.claims.length ? Object.entries(replies).map(([s, n]) => `${n} ${s}`).join(', ') : 'none'),
					fact('Contact details', i.has_contact ? 'held - not shown here' : 'erased'),
				]),
				element('p', {}, [element('a', { href: `/lost-and-found#item=${i.ref}`, text: 'See it on the site ➞' })]),
			]),
			d.reports.length ? section('Reports', element('ul', { class: 'admin-reasons' }, d.reports.map((r) => element('li', { text: `${r.reason || 'No reason given'} - ${when(r.created_at)}` })))) : null,
			section('Actions', [
				actions([
					i.status !== 'hidden' && { label: 'Take down', tone: 'bad', confirm: 'Take this listing down? It leaves the site until you restore it.', run: (note) => api('item', { body: { action: 'hide', ref: i.ref, note } }) },
					(i.status === 'hidden' || i.status === 'closed' || i.status === 'expired') && { label: 'Restore', run: (note) => api('item', { body: { action: 'restore', ref: i.ref, note } }) },
					open && { label: 'Close', run: (note) => api('item', { body: { action: 'close', ref: i.ref, note } }) },
					(open || i.status === 'expired') && { label: 'Extend', run: (note) => api('item', { body: { action: 'extend', ref: i.ref, note } }) },
					i.flags > 0 && { label: 'Clear reports', run: (note) => api('item', { body: { action: 'clearReports', ref: i.ref, note } }) },
					i.has_contact && { label: 'Erase personal details', tone: 'bad', confirm: 'Erase the name, phone and email on this listing and on every reply to it? This cannot be undone. An open listing is closed too.', run: (note) => api('item', { body: { action: 'erase', ref: i.ref, note } }) },
				], { noteFor: true, onDone: (next) => panel.replaceChildren(...draw(next).filter(Boolean)) }),
				element('p', { class: 'admin-hint', text: 'Erase when someone asks for their details to be removed, as /terms says they can.' }),
			]),
			section('Edit', itemEditor(i, (next) => panel.replaceChildren(...draw(next).filter(Boolean)))),
			section('Delete for good', itemDeleter(i)),
		];
	};
	return draw(data);
}

function itemEditor(item, onSaved) {
	const input = (key, label, max, value = item[key] || '', type = 'text') => {
		const node = element('input', { type, maxlength: String(max), 'data-clarity-mask': 'true' });
		node.value = value;
		return [key, label, node];
	};
	const fields = [
		input('title', 'What it is', 80),
		['details', 'Description', (() => { const t = element('textarea', { rows: '3', maxlength: '600', 'data-clarity-mask': 'true' }); t.value = item.details || ''; return t; })()],
		input('place_text', 'Where', 120),
		input('happened_on', 'Date', 10, String(item.happened_on || '').slice(0, 10), 'date'),
		['category', 'Category', selectBox('Category', categoryOptions(), item.category, () => {}, 'Category')],
		['district', 'District', selectBox('District', districtOptions(), item.district, () => {}, 'No district')],
	];
	const status = element('div', { 'aria-live': 'polite' });
	const form = element('form', { class: 'admin-form' }, [
		...fields.map(([, label, node]) => element('label', {}, [element('span', { text: label }), node])),
		element('div', { class: 'admin-actions' }, [element('button', { type: 'submit', class: 'admin-button is-primary', text: 'Save changes' })]),
		status,
		element('p', { class: 'admin-hint', text: 'The same rules as the public form: no long numbers, emails or links.' }),
	]);
	form.addEventListener('submit', async (event) => {
		event.preventDefault();
		try {
			onSaved(await api('item', { body: { action: 'edit', ref: item.ref, fields: Object.fromEntries(fields.map(([key, , node]) => [key, node.value])) } }));
		} catch (error) {
			if (error.code !== 'auth') status.replaceChildren(notice(error.message));
		}
	});
	return form;
}

function itemDeleter(item) {
	const confirmBox = element('input', { type: 'text', placeholder: item.ref, 'aria-label': `Type ${item.ref} to confirm`, 'data-clarity-mask': 'true' });
	const status = element('div', { 'aria-live': 'polite' });
	return element('div', { class: 'admin-action-block' }, [
		element('p', { text: `Removes the listing, every reply to it and every report about it, permanently. Taking it down is usually enough. Type ${item.ref} to confirm.` }),
		confirmBox,
		element('div', { class: 'admin-actions' }, [element('button', {
			type: 'button', class: 'admin-button is-bad', text: 'Delete for good',
			onclick: async () => {
				try {
					await api('item', { body: { action: 'delete', ref: item.ref, confirm: confirmBox.value.trim().toUpperCase() } });
					location.hash = 'listings';
				} catch (error) {
					if (error.code !== 'auth') status.replaceChildren(notice(error.message));
				}
			},
		})]),
		status,
	]);
}

let placeFilter = 'pending';

async function showPlaces(preset) {
	if (preset !== undefined) placeFilter = preset;
	const results = element('div', { 'aria-live': 'polite' });
	async function load() {
		try {
			const data = await api('places', { params: placeFilter ? { status: placeFilter } : {} });
			results.replaceChildren(list(data.places, placeRow, placeFilter === 'pending' ? 'No places are waiting.' : 'None.'));
		} catch (error) {
			if (error.code !== 'auth') results.replaceChildren(notice(error.message));
		}
	}
	load();
	return [section('', [
		segmented([['pending', 'Waiting'], ['active', 'Active'], ['suspended', 'Suspended'], ['rejected', 'Turned down'], ['', 'All']], placeFilter, (v) => { placeFilter = v; load(); }, 'Status'),
		results,
	])];
}

function placeEditor(place, onSaved) {
	const fields = [
		['name', 'Name', 80], ['address', 'Address', 140], ['hours', 'Opening hours', 100],
		['collect_note', 'Where to collect', 200], ['contact_public', 'Public contact', 60],
	];
	const inputs = {};
	const form = element('form', { class: 'admin-form', hidden: '' });
	for (const [key, label, max] of fields) {
		inputs[key] = element('input', { type: 'text', maxlength: String(max), 'data-clarity-mask': 'true' });
		inputs[key].value = place[key] || '';
		form.append(element('label', {}, [element('span', { text: label }), inputs[key]]));
	}
	inputs.kind = selectBox('Kind of place', vocab().placeKinds.map((k) => [k.id, k.label]), place.kind, () => {}, 'Kind of place');
	inputs.district = selectBox('District', districtOptions(), place.district, () => {}, 'No district');
	form.append(element('label', {}, [element('span', { text: 'Kind of place' }), inputs.kind]), element('label', {}, [element('span', { text: 'District' }), inputs.district]));
	const status = element('div', { 'aria-live': 'polite' });
	form.append(element('div', { class: 'admin-actions' }, [
		element('button', { type: 'submit', class: 'admin-button is-primary', text: 'Save' }),
		element('button', { type: 'button', class: 'admin-button', text: 'Cancel', onclick: () => { form.hidden = true; } }),
	]), status);
	form.addEventListener('submit', async (event) => {
		event.preventDefault();
		const values = Object.fromEntries(Object.entries(inputs).map(([k, input]) => [k, input.value]));
		try {
			onSaved(await api('place', { body: { action: 'edit', slug: place.slug, fields: values } }));
		} catch (error) {
			if (error.code !== 'auth') status.replaceChildren(notice(error.message));
		}
	});
	return form;
}

async function showPlace(slug) {
	const data = await api('place', { params: { slug } });
	const draw = (d) => {
		const p = d.place;
		const linkBox = d.link ? section('Portal link - shown once', [
			element('p', { text: p.contact_email ? `Emailed to ${p.contact_email} if email is set up. It is not stored anywhere: copy it now if you need to send it yourself.` : 'It is not stored anywhere: copy it now and send it to the place yourself.' }),
			element('div', { class: 'admin-link' }, [
				element('input', { type: 'text', readonly: '', value: d.link, 'data-clarity-mask': 'true', 'aria-label': 'Portal link' }),
				element('button', { type: 'button', class: 'admin-button is-primary', text: 'Copy', onclick: (e) => copy(d.link, e.currentTarget) }),
			]),
		], { class: 'section admin-panel is-highlight' }) : null;
		const editor = placeEditor(p, (next) => panel.replaceChildren(...draw(next).filter(Boolean)));
		return [
			linkBox,
			section('', [
				element('div', { class: 'admin-row-top' }, [placeChip(p.status), element('span', { class: 'admin-ref', text: placeKindLabel(p.kind) })]),
				element('h2', { class: 'admin-title', text: p.name }),
				element('dl', { class: 'admin-facts' }, [
					fact('Address', p.address),
					fact('District', districtName(p.district)),
					fact('Hours', p.hours),
					fact('Collect from', p.collect_note),
					fact('Public contact', p.contact_public),
					fact('Asked by', p.contact_name),
					fact('Phone', p.contact_phone ? element('a', { href: `tel:${p.contact_phone}`, text: p.contact_phone }) : null),
					fact('Email', p.contact_email ? element('a', { href: `mailto:${p.contact_email}`, text: p.contact_email }) : null),
					fact('Asked', when(p.created_at)),
					fact('Holding now', `${d.holding} item${d.holding === 1 ? '' : 's'}`),
					fact('Portal', p.has_portal ? 'issued' : 'never issued'),
				]),
				p.status === 'active' ? element('p', {}, [element('a', { href: `/lost-and-found/place?p=${p.slug}`, text: 'See its page on the site ➞' })]) : null,
				p.status === 'pending' ? element('p', { class: 'admin-hint', text: 'Check it is real before approving: call the number, or check the email is the business\'s own. "Held at" on a listing has to mean the place put it there.' }) : null,
			]),
			section('Actions', [
				actions([
					p.status === 'pending' && { label: 'Approve and issue portal', tone: 'primary', run: (note) => api('place', { body: { action: 'approve', slug: p.slug, note } }) },
					p.status === 'pending' && { label: 'Turn down', tone: 'bad', confirm: `Turn down ${p.name}?`, run: (note) => api('place', { body: { action: 'reject', slug: p.slug, note } }) },
					p.status === 'rejected' && { label: 'Reopen request', run: (note) => api('place', { body: { action: 'reopen', slug: p.slug, note } }) },
					p.status === 'active' && { label: 'New portal link', confirm: 'Issue a new portal link? The old one stops working at once.', run: (note) => api('place', { body: { action: 'relink', slug: p.slug, note } }) },
					p.status === 'active' && { label: 'Suspend', tone: 'bad', confirm: `Suspend ${p.name}? Its page and portal stop working until you reactivate it.`, run: (note) => api('place', { body: { action: 'suspend', slug: p.slug, note } }) },
					p.status === 'suspended' && { label: 'Reactivate', run: (note) => api('place', { body: { action: 'reactivate', slug: p.slug, note } }) },
					{ label: 'Edit details', run: async () => { editor.hidden = false; editor.querySelector('input')?.focus(); return null; } },
				], { noteFor: true, onDone: (next) => { if (next) panel.replaceChildren(...draw(next).filter(Boolean)); } }),
				editor,
			]),
			section(`Its listings`, list(d.items, itemRow, 'Nothing listed by this place yet.')),
		];
	};
	return draw(data);
}

async function showReports() {
	const data = await api('reports');
	return [section('', [
		element('p', { class: 'admin-hint', text: 'Three reports take a listing down until you look at it. Restore it, or leave it down.' }),
		data.items.length ? element('ul', { class: 'admin-list' }, data.items.map((item) => {
			const row = itemRow(item);
			if (item.reasons.length) row.firstChild.append(element('span', { class: 'admin-row-meta', text: `"${item.reasons.slice(0, 3).join('", "')}"` }));
			return row;
		})) : empty('Nothing has been reported.'),
	])];
}

// --- the events calendar ----------------------------------------------------------------------------
//
// Two halves. What organisers have sent in, waiting for a decision - each one
// opens in the drawer (#submission=REF), where approving it commits it to the
// calendar - and the calendar itself, edited directly.

const EVENT_CATEGORY_LABELS = { culture: 'Culture', music: 'Music', tech: 'Tech', business: 'Business', sport: 'Sport', food: 'Food', family: 'Family', civic: 'Civic' };
const SUBMISSION_STATUS = { pending: 'Waiting', approved: 'Listed', rejected: 'Turned down' };
const submissionChip = (status) => chip(SUBMISSION_STATUS[status] || status, { pending: 'warn', approved: 'good', rejected: 'muted' }[status] || '');
const dateRange = (e) => `${day(e.starts)}${e.ends ? ` – ${day(e.ends)}` : ''}${e.time ? `, ${e.time}` : ''}`;

/**
 * The fields of one calendar entry, as a form. Shared by the calendar's own
 * editor and by approving an event someone sent in, so the two cannot drift.
 * `allowAnnual` is off for a submission: an organiser's event has a date.
 */
function eventForm(event, { categories, submitLabel, onSubmit, onCancel, allowAnnual = true }) {
	const e = event || { category: 'culture', last_verified: new Date().toISOString().slice(0, 10) };
	const field = (key, label, { type = 'text', max = 200, hint } = {}) => {
		const node = type === 'textarea' ? element('textarea', { rows: '5', maxlength: String(max) }) : element('input', { type, ...(type === 'text' || type === 'url' ? { maxlength: String(max) } : {}) });
		node.value = e[key] || '';
		node.name = key;
		return element('label', {}, [element('span', { text: label }), node, hint ? element('small', { class: 'admin-hint', text: hint }) : null]);
	};
	const annual = element('input', { type: 'checkbox', name: 'annual' });
	annual.checked = Boolean(e.annual);
	const category = selectBox('Category', categories.map((c) => [c, EVENT_CATEGORY_LABELS[c] || c]), e.category, () => {}, 'Category');
	category.name = 'category';
	const dates = element('div', { class: 'admin-filter-pair' }, [field('starts', 'Starts', { type: 'date' }), field('ends', 'Ends (if more than one day)', { type: 'date' })]);
	const time = field('time', 'Time', { max: 40, hint: 'In words: "7pm", "Doors 6pm, music from 8".' });
	const when = field('when', 'When it usually happens', { max: 80, hint: 'For a yearly event whose dates are not announced. No invented dates.' });
	const sync = () => { dates.hidden = annual.checked; time.hidden = annual.checked; when.hidden = !annual.checked; };
	annual.addEventListener('change', sync);
	const status = element('div', { 'aria-live': 'polite' });
	const submit = element('button', { type: 'submit', class: 'admin-button is-primary', text: submitLabel });
	const form = element('form', { class: 'admin-form' }, [
		field('title', 'Title', { max: 100 }),
		allowAnnual ? element('label', { class: 'admin-check' }, [annual, element('span', { text: 'Yearly, dates not announced yet' })]) : null,
		dates, time, when,
		field('venue', 'Venue', { max: 140 }),
		element('div', { class: 'admin-filter-pair' }, [field('area', 'Area', { max: 80 }), element('label', {}, [element('span', { text: 'Category' }), category])]),
		field('organiser', 'Organiser', { max: 100 }),
		field('price', 'Price', { max: 60, hint: 'Words are fine: "Free", "Paid entry", "From GH₵100".' }),
		field('url', 'Link', { type: 'url', max: 300 }),
		field('description', 'Description', { type: 'textarea', max: 900 }),
		element('div', { class: 'admin-filter-pair' }, [field('source', 'Source', { max: 200 }), field('last_verified', 'Checked on', { type: 'date' })]),
		element('div', { class: 'admin-actions' }, [
			submit,
			onCancel ? element('button', { type: 'button', class: 'admin-button', text: 'Cancel', onclick: onCancel }) : null,
		]),
		status,
	].filter(Boolean));
	sync();
	form.addEventListener('submit', async (ev) => {
		ev.preventDefault();
		const values = Object.fromEntries([...form.querySelectorAll('[name]')].map((n) => [n.name, n.type === 'checkbox' ? n.checked : n.value]));
		if (values.annual) { delete values.starts; delete values.ends; delete values.time; } else delete values.when;
		submit.disabled = true;
		status.replaceChildren(notice('Committing to GitHub…', 'info'));
		try {
			await onSubmit(values);
			status.replaceChildren();
		} catch (error) {
			if (error.code !== 'auth') status.replaceChildren(notice(error.message));
		} finally {
			submit.disabled = false;
		}
	});
	return form;
}

function submissionRow(s) {
	return element('li', {}, [
		element('a', { class: 'admin-row', href: `#submission=${s.ref}` }, [
			element('span', { class: 'admin-row-top' }, [
				submissionChip(s.status),
				chip(EVENT_CATEGORY_LABELS[s.category] || s.category),
				element('span', { class: 'admin-ref', text: dateRange(s) }),
			]),
			element('strong', { text: s.title }),
			element('span', { class: 'admin-row-meta', text: [s.venue, s.organiser ? `by ${s.organiser}` : '', `sent ${when(s.created_at)}`].filter(Boolean).join(' · ') }),
		]),
	]);
}

let submissionFilter = 'pending';

async function showEvents() {
	const status = element('div', { 'aria-live': 'polite' });
	const sent = element('div', { 'aria-live': 'polite' });
	const holder = element('div');
	let data = null;

	async function loadSent() {
		try {
			const d = await api('submissions', { params: { status: submissionFilter || 'all' } });
			sent.replaceChildren(list(d.submissions, submissionRow, submissionFilter === 'pending' ? 'Nothing is waiting. Events organisers send in from /events/submit appear here.' : 'None.'));
		} catch (error) {
			if (error.code !== 'auth') sent.replaceChildren(notice(error.message));
		}
	}

	const publish = async (body) => {
		toast('Committing to GitHub…');
		const answer = await api('event', { body: { ...body, sha: data.sha } });
		data = answer;
		status.replaceChildren(notice(`Committed ${answer.commit.commit.slice(0, 7)}. The site rebuilds itself; it is usually live in about two minutes. Health shows when it is.`, 'good'));
		toast(`Committed ${answer.commit.commit.slice(0, 7)} - live in about two minutes.`, 'good');
		drawList();
	};

	const editor = (event, index) => {
		const form = eventForm(event, {
			categories: data.categories,
			submitLabel: index === null ? 'Add and publish' : 'Save and publish',
			onSubmit: (values) => publish({ action: index === null ? 'add' : 'edit', index, event: values }),
			onCancel: () => drawList(),
		});
		holder.replaceChildren(section(index === null ? 'New event' : `Edit: ${event.title}`, form));
		form.querySelector('input')?.focus();
	};

	const drawList = () => {
		const today = new Date().toISOString().slice(0, 10);
		const rows = data.events.map((e, index) => ({ e, index }));
		const dated = rows.filter(({ e }) => e.starts).sort((a, b) => (a.e.starts < b.e.starts ? -1 : 1));
		const yearly = rows.filter(({ e }) => !e.starts);
		const row = ({ e, index }) => {
			const past = e.starts && (e.ends || e.starts) < today;
			const stale = e.last_verified && daysUntil(e.last_verified) < -365;
			return element('li', { class: 'admin-event' }, [
				element('div', {}, [
					element('div', { class: 'admin-row-top' }, [
						chip(EVENT_CATEGORY_LABELS[e.category] || e.category),
						e.starts ? element('span', { class: 'admin-ref', text: dateRange(e) }) : element('span', { class: 'admin-ref', text: e.when || 'Yearly' }),
						past ? chip('Over', 'muted') : null,
						stale ? chip('Not checked in a year', 'warn') : null,
					]),
					element('strong', { text: e.title }),
					element('span', { class: 'admin-row-meta', text: [e.venue, e.area, e.organiser ? `by ${e.organiser}` : ''].filter(Boolean).join(' · ') }),
				]),
				element('div', { class: 'admin-actions' }, [
					element('button', { type: 'button', class: 'admin-button is-small', text: 'Edit', onclick: () => editor(e, index) }),
					element('button', {
						type: 'button', class: 'admin-button is-small is-bad', text: 'Remove',
						onclick: async () => {
							if (!window.confirm(`Remove "${e.title}" from the calendar?`)) return;
							try { await publish({ action: 'remove', index, title: e.title }); } catch (error) { if (error.code !== 'auth') status.replaceChildren(notice(error.message)); }
						},
					}),
				]),
			]);
		};
		holder.replaceChildren(
			section('The calendar', [
				element('div', { class: 'admin-actions' }, [element('button', { type: 'button', class: 'admin-button is-primary', text: 'Add an event', onclick: () => editor(null, null) })]),
				element('p', { class: 'admin-hint', text: 'Every change is a commit to content/events-calendar.yaml on GitHub, so it goes through the normal build and its checks. Past events drop off the site by themselves; removing them here is tidying, not required.' }),
			]),
			section('Dated', dated.length ? element('ul', { class: 'admin-list' }, dated.map(row)) : empty('No dated events.')),
			section('Every year', yearly.length ? element('ul', { class: 'admin-list' }, yearly.map(row)) : empty('None.')),
		);
	};

	loadSent();
	// The calendar needs GitHub; what was sent in does not. One not being set
	// up must not hide the other.
	try {
		data = await api('events');
		drawList();
	} catch (error) {
		if (error.code === 'auth') throw error;
		holder.replaceChildren(section('The calendar', notice(error.message)));
	}

	return [
		section('Sent in by organisers', [
			element('p', { class: 'admin-hint', text: 'Organisers send events from the site. Nothing they send is shown until you approve it here, which adds it to the calendar.' }),
			segmented([['pending', 'Waiting'], ['approved', 'Listed'], ['rejected', 'Turned down'], ['', 'All']], submissionFilter, (v) => { submissionFilter = v; loadSent(); }, 'Status'),
			sent,
		]),
		status,
		holder,
	];
}

// One event sent in, in the drawer: what it says, who sent it, what in the
// calendar it might duplicate, and the decision.
async function showSubmission(ref) {
	const draw = (d) => {
		const s = d.submission;
		const approving = element('div', { hidden: '' });
		const approve = () => {
			approving.replaceChildren(section('Check it, then publish', [
				element('p', { class: 'admin-hint', text: 'This is what will go in the calendar. Tidy the wording if it needs it - no capitals for emphasis, no prices in the description - then publish.' }),
				eventForm(d.event, {
					categories: d.categories,
					allowAnnual: false,
					submitLabel: 'Approve and publish',
					onCancel: () => { approving.hidden = true; },
					onSubmit: async (values) => {
						const next = await api('submission', { body: { action: 'approve', ref: s.ref, event: values, tell: tell.checked } });
						toast(`Listed. Committed ${next.commit.slice(0, 7)} - live in about two minutes.`, 'good');
						panel.replaceChildren(...draw(next).filter(Boolean));
						refreshBadges();
					},
				}),
			], { class: 'section admin-panel is-highlight' }));
			approving.hidden = false;
			approving.querySelector('input')?.focus();
		};

		const tell = element('input', { type: 'checkbox' });
		tell.checked = Boolean(s.contact_email);
		tell.disabled = !s.contact_email;
		const reason = element('textarea', { rows: '2', maxlength: '300', placeholder: 'Optional, and sent to them: why it cannot be listed', 'data-clarity-mask': 'true' });
		const similar = d.similar === null
			? notice(`Could not check the calendar for duplicates: ${d.calendar}`, 'info')
			: d.similar.length
				? element('ul', { class: 'admin-list' }, d.similar.map((e) => element('li', { class: 'admin-row' }, [element('strong', { text: e.title }), element('span', { class: 'admin-row-meta', text: [e.starts ? day(e.starts) : e.when, e.venue].filter(Boolean).join(' · ') })])))
				: element('p', { class: 'admin-empty', text: 'Nothing in the calendar on that day or with that name.' });

		return [
			section('', [
				element('div', { class: 'admin-row-top' }, [submissionChip(s.status), chip(EVENT_CATEGORY_LABELS[s.category] || s.category), element('span', { class: 'admin-ref', text: s.ref })]),
				element('h2', { class: 'admin-title', text: s.title }),
				element('dl', { class: 'admin-facts' }, [
					fact('When', dateRange(s)),
					fact('Venue', s.venue),
					fact('Area', s.area),
					fact('Organiser', s.organiser),
					fact('Price', s.price),
					fact('Link', s.url ? element('a', { href: s.url, rel: 'noopener', target: '_blank', text: s.url }) : null),
				]),
				element('p', { class: 'admin-quote', text: s.description }),
			]),
			section('Who sent it', [
				element('dl', { class: 'admin-facts' }, [
					fact('Name', s.contact_name),
					fact('Email', s.contact_email ? element('a', { href: `mailto:${s.contact_email}`, text: s.contact_email }) : null),
					fact('Phone', s.contact_phone ? element('a', { href: `tel:${s.contact_phone}`, text: s.contact_phone }) : null),
					fact('Sent', when(s.created_at)),
					fact('Decided', when(s.decided_at)),
					fact('Reason given', s.reason),
					fact('Commit', s.commit),
				]),
				!s.contact_name && !s.contact_email && !s.contact_phone ? element('p', { class: 'admin-hint', text: 'Their contact details have been erased.' }) : null,
				s.status === 'pending' ? element('p', { class: 'admin-hint', text: 'Check it is real before approving: open the link, look the organiser up, or call. A wrong date on this page sends people to an empty venue.' }) : null,
			]),
			section('Already in the calendar?', similar),
			section('Decision', [
				s.status === 'pending' ? element('label', { class: 'admin-check' }, [tell, element('span', { text: s.contact_email ? `Email ${s.contact_email} the outcome` : 'No email to tell them at' })]) : null,
				s.status === 'pending' ? element('label', {}, [element('span', { class: 'admin-hint', text: 'Reason, if you turn it down' }), reason]) : null,
				actions([
					s.status === 'pending' && { label: 'Approve…', tone: 'primary', run: async () => { approve(); return null; } },
					s.status === 'pending' && { label: 'Turn down', tone: 'bad', confirm: `Turn down "${s.title}"?`, done: 'Turned down.', run: (note) => api('submission', { body: { action: 'reject', ref: s.ref, reason: reason.value, tell: tell.checked, note } }) },
					s.status === 'rejected' && { label: 'Reopen', run: (note) => api('submission', { body: { action: 'reopen', ref: s.ref, note } }) },
					(s.contact_name || s.contact_email || s.contact_phone) && s.status !== 'pending' && { label: 'Erase their contact details', confirm: 'Erase the name, email and phone on this submission?', run: (note) => api('submission', { body: { action: 'erase', ref: s.ref, note } }) },
				], { noteFor: true, onDone: (next) => { if (next) panel.replaceChildren(...draw(next).filter(Boolean)); } }),
				approving,
				s.status === 'approved' ? element('p', {}, [element('a', { href: '/events', target: '_blank', rel: 'noopener', text: 'See the events page ➞' })]) : null,
			]),
		];
	};
	return draw(await api('submission', { params: { ref } }));
}

// --- settings: the notice and lost and found ----------------------------------------------------------

// --- Nairobi Pulse: questions, and every count behind the map ------------------------------------

const PULSE_STATUS = { draft: 'Draft', live: 'Open', closed: 'Closed' };
const pulseChip = (status) => chip(PULSE_STATUS[status] || status, { draft: 'muted', live: 'good', closed: '' }[status] || '');
const sharePct = (n, total) => (total ? `${Math.round((n / total) * 100)}%` : '');

// The bank's filters, kept while the admin moves about.
const pulseState = { show: '', topic: '', q: '' };

/**
 * An On/Off switch: a button with role="switch", so a screen reader says
 * which it is, and the word beside it so nobody reads state from colour.
 * `key` lets the view find it again after a redraw and put focus back.
 */
function onOff(on, label, key, flip) {
	const button = element('button', { type: 'button', role: 'switch', class: 'aa-switch', 'aria-checked': String(on), 'aria-label': label, 'data-switch': key }, [
		element('span', { class: 'aa-switch-track', 'aria-hidden': 'true' }, [element('span', { class: 'aa-switch-knob' })]),
		element('span', { class: 'aa-switch-text', 'aria-hidden': 'true', text: on ? 'On' : 'Off' }),
	]);
	if (flip) button.addEventListener('click', () => flip(button));
	else button.disabled = true;
	return button;
}

const rowError = () => element('p', { class: 'admin-notice is-error pulse-row-error', role: 'alert', hidden: '' });

const PULSE_DONE = {
	on: 'On - it is on /pulse now.',
	open: 'On - it is on /pulse now.',
	reopen: 'On again - its count carries on from where it stopped.',
	close: 'Off - closed, and its result is final.',
	off: 'Off - nobody had voted, so it is waiting again.',
};

/** Switch a question or a bank entry, then redraw with the answer. */
async function pulseFlip(button, body, { votes = 0 } = {}) {
	const on = button.getAttribute('aria-checked') !== 'true';
	if (!on && votes && !window.confirm(`Switch this off? ${fmt.int(votes)} ${votes === 1 ? 'person has' : 'people have'} voted, so it closes and its result becomes final. You can switch it on again.`)) return;
	const error = button.closest('li')?.querySelector('.pulse-row-error');
	if (error) error.hidden = true;
	button.disabled = true;
	button.setAttribute('aria-busy', 'true');
	try {
		const data = await api('pulse', { body: { action: 'toggle', on, ...body } });
		toast(PULSE_DONE[data.toggled.action] || 'Nothing to change.', data.toggled.action ? 'good' : 'info');
		drawPulse(data, button.dataset.switch);
		refreshBadges();
	} catch (err) {
		button.disabled = false;
		button.removeAttribute('aria-busy');
		if (err.code !== 'auth' && error) { error.textContent = err.message; error.hidden = false; }
	}
}

function pulseRow(q) {
	const meta = [
		`${fmt.int(q.votes)} votes`,
		q.coverage && q.status === 'live' ? `${q.coverage.shown} of 29 districts on the map` : null,
		q.status === 'live' && q.closes_at ? `closes ${day(q.closes_at)}` : null,
		q.status === 'closed' ? `closed ${day(q.closed_at || q.closes_at)}` : null,
		q.featured ? 'featured' : null,
	].filter(Boolean).join(' · ');
	// A closed question whose votes are gone cannot take more; one from the
	// bank can, as a new question.
	const stuck = q.status === 'closed' && q.votes_deleted && !q.bank_key;
	return element('li', { class: 'pulse-switch-row' }, [
		onOff(q.status === 'live', q.text, `id:${q.id}`, stuck ? null : (b) => pulseFlip(b, { id: q.id }, { votes: q.status === 'live' ? q.votes : 0 })),
		element('a', { class: 'admin-row', href: `#question=${q.id}` }, [
			element('span', { class: 'admin-row-top' }, [pulseChip(q.status), element('span', { class: 'admin-ref', text: q.ref }), q.bank_key ? chip('Bank', 'muted') : null]),
			element('strong', { text: q.text }),
			element('span', { class: 'admin-row-meta', text: meta }),
		]),
		rowError(),
	]);
}

function pulseBankRow(entry, vocab) {
	const preset = vocab.presets.find((p) => p.id === entry.preset);
	const answers = (entry.options || preset?.options.map((o) => o.label) || []).join(' · ');
	const state = {
		live: `On · ${fmt.int(entry.votes)} votes`,
		closed: `Closed · ${fmt.int(entry.votes)} votes`,
		draft: 'Off · waiting',
	}[entry.status] || 'Never asked';
	const body = [
		element('span', { class: 'admin-row-top' }, [
			chip(vocab.topics.find((t) => t.id === entry.topic)?.label || entry.topic, entry.on ? 'good' : ''),
			element('span', { class: 'admin-ref', text: entry.ref ? `${entry.ref} · ${state}` : state }),
		]),
		element('strong', { text: entry.text }),
		element('span', { class: 'admin-row-meta', text: answers }),
	];
	return element('li', { class: 'pulse-switch-row' }, [
		onOff(entry.on, entry.text, `key:${entry.key}`, (b) => pulseFlip(b, { key: entry.key }, { votes: entry.on ? entry.votes : 0 })),
		entry.id ? element('a', { class: 'admin-row', href: `#question=${entry.id}` }, body) : element('div', { class: 'admin-row' }, body),
		rowError(),
	]);
}

/** Put the view back with fresh data, keeping the switch just pressed under the finger. */
function drawPulse(data, focusKey) {
	if (mainTab !== 'pulse') return;
	const find = () => (focusKey ? view.querySelector(`[data-switch="${CSS.escape(focusKey)}"]`) : null);
	const before = find()?.getBoundingClientRect().top;
	view.replaceChildren(...pulseView(data));
	const button = find();
	if (!button) return;
	if (before !== undefined) window.scrollBy({ top: button.getBoundingClientRect().top - before, behavior: 'instant' });
	button.focus({ preventScroll: true });
}

function pulseView(data) {
	const { settings: s, vocab } = data;
	const by = (status) => data.questions.filter((q) => q.status === status);
	const live = by('live');

	// Voting itself, for every question at once: the same pause as Settings.
	const masterError = element('div', { 'aria-live': 'polite' });
	const saveSettings = async (patch, done) => {
		const next = { paused: s.paused, message: s.message, limits: { ...s.limits }, ...patch };
		await api('settings', { body: { what: 'pulse', pulse: next } });
		toast(done, 'good');
		// The settings are cached for a minute by whichever function answers
		// next, so the view takes what was saved rather than asking again.
		Object.assign(s, next, { cap: next.limits.maxLive || s.defaults.maxLive });
	};
	const master = onOff(!s.paused, 'Voting on /pulse', 'voting', async (button) => {
		const on = button.getAttribute('aria-checked') !== 'true';
		if (!on && !window.confirm('Pause voting? Nobody can check where they are or vote until you switch it back on. The results stay up.')) return;
		button.disabled = true;
		try {
			await saveSettings({ paused: !on }, on ? 'Voting is on.' : 'Voting is paused. /pulse says so within a minute.');
			drawPulse(data, 'voting');
		} catch (error) {
			button.disabled = false;
			if (error.code !== 'auth') masterError.replaceChildren(notice(error.message));
		}
	});
	const cap = element('input', { type: 'number', min: '1', max: '100', step: '1', inputmode: 'numeric', 'aria-label': 'Questions open at once, at most' });
	cap.value = String(s.cap);
	const saveCap = element('button', {
		type: 'button', class: 'admin-button', text: 'Save',
		onclick: async () => {
			const n = Number(cap.value);
			if (!Number.isInteger(n) || n < 1 || n > 100) { masterError.replaceChildren(notice('Give a whole number from 1 to 100.')); return; }
			saveCap.disabled = true;
			try {
				await saveSettings({ limits: { ...s.limits, maxLive: n } }, `Up to ${n} open at once.`);
				drawPulse(data);
			} catch (error) {
				saveCap.disabled = false;
				if (error.code !== 'auth') masterError.replaceChildren(notice(error.message));
			}
		},
	});

	const top = section('', [
		element('div', { class: `pulse-master${s.paused ? ' is-paused' : ''}` }, [
			element('div', {}, [
				element('strong', { text: s.paused ? 'Voting is paused' : 'Voting is on' }),
				element('p', { class: 'admin-hint', text: s.paused
					? `Nobody can vote. /pulse shows the results and says: "${s.message || 'Voting is paused for a short while.'}"`
					: 'Anyone in Nairobi can check where they are and vote on the questions switched on below.' }),
			]),
			master,
		]),
		element('div', { class: 'pulse-cap' }, [
			element('label', {}, [element('span', { text: 'Open at once, at most' }), cap]),
			saveCap,
			element('p', { class: 'admin-hint', text: `${live.length} open now; ${s.defaults.maxLive} is the default. A district's answers reach the map at ${vocab.min} votes, so the more that are open, the slower any one of them fills it.` }),
		]),
		masterError,
		element('div', { class: 'admin-actions' }, [
			element('a', { class: 'admin-button is-primary', href: '#question=new', text: 'Write a question' }),
			element('a', { class: 'admin-button', href: '/pulse', target: '_blank', rel: 'noopener', text: 'Open the public page' }),
		]),
	]);

	// Asking readers on every page (pulse-prompt.mjs): whether, whom, and when.
	const pr = { ...s.prompt };
	const askError = element('div', { 'aria-live': 'polite' });
	const savePrompt = async (patch, done) => {
		const next = { ...pr, ...patch };
		await saveSettings({ prompt: next }, done);
		Object.assign(pr, next);
		s.prompt = { ...pr };
	};
	const asking = onOff(pr.on, 'Ask readers across the site', 'asking', async (button) => {
		const on = button.getAttribute('aria-checked') !== 'true';
		button.disabled = true;
		try {
			await savePrompt({ on }, on ? 'Readers will be asked again.' : 'Readers will not be asked. /pulse still works.');
			drawPulse(data, 'asking');
		} catch (error) {
			button.disabled = false;
			if (error.code !== 'auth') askError.replaceChildren(notice(error.message));
		}
	});
	const audience = element('select', { 'aria-label': 'Who is asked' }, s.defaults.prompt.audiences.map((a) => element('option', { value: a.id, text: a.label })));
	audience.value = pr.audience;
	const number = (key, label) => {
		const [min, max] = s.defaults.prompt.bounds[key];
		const input = element('input', { type: 'number', min: String(min), max: String(max), step: '1', inputmode: 'numeric' });
		input.value = String(pr[key]);
		return [key, label, input, min, max];
	};
	const numbers = [number('delay', 'First question after (seconds of reading)'), number('again', 'Next one after (seconds more)'), number('perVisit', 'At most, a visit')];
	const leave = element('input', { type: 'checkbox' });
	leave.checked = pr.leave;
	const saveAsk = element('button', {
		type: 'button', class: 'admin-button is-primary', text: 'Save',
		onclick: async () => {
			const patch = { audience: audience.value, leave: leave.checked };
			for (const [key, label, input, min, max] of numbers) {
				const n = Number(input.value);
				if (!Number.isInteger(n) || n < min || n > max) { askError.replaceChildren(notice(`${label}: a whole number from ${min} to ${max}.`)); return; }
				patch[key] = n;
			}
			saveAsk.disabled = true;
			try {
				await savePrompt(patch, 'Saved. Readers already told when to be asked pick it up within six hours.');
				askError.replaceChildren();
			} catch (error) {
				if (error.code !== 'auth') askError.replaceChildren(notice(error.message));
			} finally {
				saveAsk.disabled = false;
			}
		},
	});
	const askSection = section('Asking readers', [
		element('div', { class: `pulse-master${pr.on ? '' : ' is-paused'}` }, [
			element('div', {}, [
				element('strong', { text: pr.on ? 'Readers are being asked' : 'Readers are not being asked' }),
				element('p', { class: 'admin-hint', text: 'A question at a time, on any page of the site: after a while of reading, again a while later, and as someone leaves. Their first answer asks for the phone\'s location once; after that each one is a tap.' }),
			]),
			asking,
		]),
		element('div', { class: 'admin-form pulse-ask-form' }, [
			element('label', {}, [element('span', { text: 'Who is asked' }), audience]),
			element('div', { class: 'admin-limits' }, numbers.map(([, label, input]) => element('label', {}, [element('span', { text: label }), input]))),
			element('label', { class: 'admin-check' }, [leave, element('span', { text: 'Also ask as someone leaves: the pointer heading for the tabs on a computer, and the back gesture on a phone - once a visit, and the next back always leaves' })]),
			element('div', { class: 'admin-actions' }, [
				saveAsk,
				element('a', { class: 'admin-button', href: '/?pulse=ask', target: '_blank', rel: 'noopener', text: 'See the card' }),
			]),
			element('p', { class: 'admin-hint', text: 'Who is asked is decided from what the host says about each connection: "Nairobi" is the region, the town or the position it gives. That is a guess, good enough for choosing whom to ask - a vote still needs the phone\'s own position, so nobody outside Accra can add one. "See the card" opens it on the home page whoever and wherever you are.' }),
			askError,
		]),
	]);

	// The bank: a hundred questions, filtered here without asking the server.
	const results = element('div', { 'aria-live': 'polite' });
	const counts = { '': data.bank.length, on: data.bank.filter((e) => e.on).length };
	counts.off = counts[''] - counts.on;
	const drawBank = () => {
		const words = pulseState.q.toLowerCase();
		const shown = data.bank.filter((e) => (!pulseState.show || (pulseState.show === 'on') === e.on)
			&& (!pulseState.topic || e.topic === pulseState.topic)
			&& (!words || `${e.text} ${e.context} ${(e.options || []).join(' ')}`.toLowerCase().includes(words)));
		results.replaceChildren(
			element('p', { class: 'admin-hint', text: shown.length === data.bank.length ? `All ${shown.length}.` : `${shown.length} of ${data.bank.length}.` }),
			shown.length ? element('ul', { class: 'admin-list' }, shown.map((e) => pulseBankRow(e, vocab))) : empty('Nothing matches.'),
		);
	};
	const search = element('input', { type: 'search', placeholder: 'Words in a question', 'aria-label': 'Search the question bank' });
	search.value = pulseState.q;
	search.addEventListener('input', () => { pulseState.q = search.value.trim(); drawBank(); });
	drawBank();
	const bankSection = section(`Question bank · ${counts.on} on`, [
		element('p', { class: 'admin-hint', text: 'Ready to ask. Switch one on and it is on /pulse at once. Switch it off and it closes with its result final - or, if nobody has voted, goes back to waiting. Switched on again, a closed question carries on counting.' }),
		element('div', { class: 'admin-filters' }, [
			segmented([['', `All ${counts['']}`], ['on', `On ${counts.on}`], ['off', `Off ${counts.off}`]], pulseState.show, (v) => { pulseState.show = v; drawBank(); }, 'Show'),
			element('div', { class: 'admin-filter-pair' }, [
				search,
				selectBox('Topic', vocab.topics.map((t) => [t.id, t.label]), pulseState.topic, (v) => { pulseState.topic = v; drawBank(); }, 'Every topic'),
			]),
		]),
		results,
	]);

	const own = by('draft').filter((q) => !q.bank_key);
	return [
		top,
		askSection,
		section(`Open now · ${live.length} of ${s.cap}`, list(live, pulseRow, 'Nothing is open. Switch a question on from the bank, or write one.'), { 'data-pulse-open': '' }),
		bankSection,
		own.length ? section('Your drafts', list(own, pulseRow, '')) : null,
		section('Closed', list(by('closed'), pulseRow, 'Nothing has closed yet.')),
	];
}

async function showPulse() {
	return pulseView(await api('pulse'));
}

/**
 * The question editor: the words, a topic, the answers and their kind, a
 * closing day. Once people have voted, the answers' shape is locked and only
 * their words can change - the server holds that rule; this only says so.
 */
function pulseEditor(vocab, current, { locked = false, buttons }) {
	const q = current || { text: '', context: '', topic: '', kind: 'choice', options: [{ label: 'Yes' }, { label: 'No' }], closes_at: '', featured: false };
	const text = element('textarea', { rows: '2', maxlength: String(vocab.limits.questionMax), 'data-clarity-mask': 'true' });
	text.value = q.text;
	const counter = element('small', { class: 'admin-hint' });
	const count = () => { counter.textContent = `${text.value.length} of ${vocab.limits.questionMax}. Ask one thing, in plain words, that anyone in Nairobi could answer.`; };
	text.addEventListener('input', count);
	count();
	const context = element('textarea', { rows: '2', maxlength: String(vocab.limits.contextMax), 'data-clarity-mask': 'true' });
	context.value = q.context || '';
	const topic = selectBox('Topic', vocab.topics.map((t) => [t.id, t.label]), q.topic, () => {}, 'Pick a topic');
	const closes = element('input', { type: 'date' });
	closes.value = q.closes_at || '';
	const featured = element('input', { type: 'checkbox' });
	featured.checked = Boolean(q.featured);

	let kind = q.kind;
	const rows = element('ol', { class: 'pulse-answers' });
	const addRow = (o = { label: '' }) => {
		const label = element('input', { type: 'text', maxlength: String(vocab.limits.optionMax), placeholder: 'An answer', 'data-clarity-mask': 'true', 'aria-label': 'Answer' });
		label.value = o.label || '';
		const value = element('input', { type: 'number', min: '-3', max: '3', step: '1', 'aria-label': 'Its place on the scale', title: 'From -3 (bad) to 3 (good)' });
		value.value = o.value ?? '';
		value.hidden = kind !== 'scale';
		if (locked) value.disabled = true;
		const remove = element('button', { type: 'button', class: 'admin-button is-small', text: 'Remove', onclick: () => { row.remove(); sync(); } });
		remove.hidden = locked;
		const row = element('li', { class: 'pulse-answer' }, [label, value, remove]);
		rows.append(row);
		sync();
	};
	const add = element('button', { type: 'button', class: 'admin-button is-small', text: 'Add an answer', onclick: () => addRow() });
	const sync = () => {
		add.hidden = locked || rows.children.length >= vocab.limits.maxOptions;
		for (const r of rows.children) r.querySelector('input[type="number"]').hidden = kind !== 'scale';
	};
	const fill = (options) => { rows.replaceChildren(); for (const o of options) addRow(o); };
	fill(q.options);

	const kindPick = segmented([['choice', 'Choices'], ['scale', 'A scale']], kind, (k) => { kind = k; sync(); }, 'Kind of answers');
	const presets = selectBox('Start from', vocab.presets.map((p) => [p.id, p.label]), '', (id) => {
		const preset = vocab.presets.find((p) => p.id === id);
		if (!preset) return;
		kind = preset.kind;
		for (const b of kindPick.children) b.setAttribute('aria-pressed', String(b.textContent === (kind === 'scale' ? 'A scale' : 'Choices')));
		fill(preset.options);
	}, 'Answers from a preset…');

	const collect = () => ({
		text: text.value,
		context: context.value,
		topic: topic.value,
		kind,
		options: [...rows.children].map((r) => ({ label: r.querySelector('input[type="text"]').value, value: r.querySelector('input[type="number"]').value === '' ? undefined : Number(r.querySelector('input[type="number"]').value) })),
		closes_at: closes.value,
		featured: featured.checked,
	});

	const status = element('div', { 'aria-live': 'polite' });
	const form = element('form', { class: 'admin-form pulse-editor', onsubmit: (event) => event.preventDefault() }, [
		element('label', {}, [element('span', { text: 'The question' }), text, counter]),
		element('label', {}, [element('span', { text: 'A line under it (optional)' }), context, element('small', { class: 'admin-hint', text: 'Context a voter needs - never an argument for one answer.' })]),
		element('div', { class: 'admin-filter-pair' }, [
			element('label', {}, [element('span', { text: 'Topic' }), topic]),
			element('label', {}, [element('span', { text: 'Closes on (optional)' }), closes]),
		]),
		element('fieldset', { class: 'pulse-answers-set' }, [
			element('legend', { text: 'The answers' }),
			locked
				? element('p', { class: 'admin-hint', text: 'People have voted on this, so its answers can be reworded but not added, removed or reordered.' })
				: element('div', { class: 'admin-filter-pair' }, [kindPick, presets]),
			element('p', { class: 'admin-hint', text: 'On a scale, give each answer a number from -3 to 3: the map colours good answers green and bad ones laterite, and works out each district\'s mood.' }),
			rows,
			add,
		]),
		element('label', { class: 'admin-check' }, [featured, element('span', { text: 'Feature it first on the page' })]),
		element('div', { class: 'admin-actions' }, buttons.map((b) => element('button', {
			type: 'button',
			class: `admin-button${b.primary ? ' is-primary' : ''}`,
			text: b.label,
			onclick: async (event) => {
				const button = event.currentTarget;
				button.disabled = true;
				status.replaceChildren(notice('Saving…', 'info'));
				try {
					await b.run(collect());
					status.replaceChildren();
				} catch (error) {
					if (error.code !== 'auth') status.replaceChildren(notice(error.message));
				} finally {
					button.disabled = false;
				}
			},
		}))),
		status,
	]);
	return { form, fillFrom: (s) => {
		text.value = s.text; count();
		context.value = s.context || '';
		topic.value = s.topic;
		const preset = vocab.presets.find((p) => p.id === s.preset);
		kind = preset?.kind || 'choice';
		for (const b of kindPick.children) b.setAttribute('aria-pressed', String(b.textContent === (kind === 'scale' ? 'A scale' : 'Choices')));
		fill(s.options ? s.options.map((label) => ({ label })) : preset.options);
		text.focus();
	} };
}

async function showPulseQuestion(id) {
	if (id === 'new') {
		const { vocab, bank } = await api('pulse');
		// Started from the bank, the question remembers its entry, so that
		// entry's switch finds it rather than asking it a second time.
		let bankKey = null;
		const create = (status) => async (question) => {
			const saved = await api('pulse', { body: { action: 'create', status, question, bank_key: bankKey } });
			toast(status === 'live' ? 'Open - it is on /pulse now.' : 'Saved as a draft.', 'good');
			drawMain('pulse');
			location.hash = `question=${saved.question.id}`;
		};
		const editor = pulseEditor(vocab, null, { buttons: [{ label: 'Save as a draft', run: create('draft') }, { label: 'Save and open', primary: true, run: create('live') }] });
		const ideas = bank.filter((e) => !e.status);
		const ideaList = element('ul', { class: 'pulse-starters' });
		const drawIdeas = (topic) => ideaList.replaceChildren(...ideas.filter((e) => !topic || e.topic === topic).map((e) => element('li', {}, [
			element('button', { type: 'button', class: 'pulse-starter', onclick: () => { bankKey = e.key; editor.fillFrom(e); } }, [
				element('strong', { text: e.text }),
				element('span', { text: vocab.topics.find((t) => t.id === e.topic)?.label || '' }),
			]),
		])));
		drawIdeas('');
		return [
			section('Start from the bank', [
				element('p', { class: 'admin-hint', text: `${ideas.length} questions in the bank have never been asked. Start from one and change anything - or switch one straight on from the Pulse page. Questions that work are about everyday Accra, answerable by anyone, and likely to differ from one district to the next.` }),
				selectBox('Topic', vocab.topics.map((t) => [t.id, t.label]), '', drawIdeas, 'Every topic'),
				ideaList,
			]),
			section('The question', editor.form),
		];
	}

	const data = await api('pulse-question', { params: { id } });
	const q = data.question;
	const results = data.results;
	const refresh = (answer) => { drawMain('pulse'); if (answer?.question) openDetail('question', answer.question.id); };
	const run = (action, extra = {}) => () => api('pulse', { body: { action, id: q.id, ...extra } });

	const confirmDelete = element('input', { type: 'text', placeholder: q.ref, 'aria-label': `Type ${q.ref} to delete it`, 'data-clarity-mask': 'true' });
	const summary = section('', [
		element('p', { class: 'admin-row-top' }, [pulseChip(q.status), element('span', { class: 'admin-ref', text: q.ref }), q.featured ? chip('Featured', 'good') : null]),
		element('h3', { class: 'pulse-admin-text', text: q.text }),
		q.context ? element('p', { class: 'admin-hint', text: q.context }) : null,
		element('dl', { class: 'admin-facts' }, [
			fact('Votes', fmt.int(q.votes)),
			q.coverage ? fact('Districts voting', `${q.coverage.voting} of 29`) : null,
			q.coverage ? fact(`On the map (${data.vocab.min}+ votes)`, `${q.coverage.shown} of 29`) : null,
			q.bank_key ? fact('From', 'The question bank') : null,
			q.opened_at ? fact('Opened', when(q.opened_at)) : null,
			q.closes_at ? fact('Closes', day(q.closes_at)) : null,
			q.closed_at ? fact('Closed', when(q.closed_at)) : null,
			fact('Votes changed', fmt.int(data.changed)),
		]),
		q.status !== 'draft' ? element('p', {}, [element('a', { href: `/pulse#q=${q.id}`, target: '_blank', rel: 'noopener', text: 'See it on /pulse' })]) : null,
		actions([
			q.status === 'draft' ? { label: 'Open it', tone: 'primary', run: run('open'), done: 'Open - it is on /pulse now.' } : null,
			q.status === 'live' ? { label: 'Close it', run: run('close'), confirm: 'Close voting on this question? Its result becomes final.', done: 'Closed. The result is final.' } : null,
			q.status === 'closed' && !data.votes_deleted ? { label: 'Reopen it', run: run('reopen'), done: 'Reopened.' } : null,
			q.status !== 'draft' ? { label: q.featured ? 'Stop featuring it' : 'Feature it first', run: run('feature', { featured: !q.featured }) } : null,
			q.votes && !data.votes_deleted ? { label: 'Recount from the votes', run: run('recount'), done: 'Recounted.' } : null,
		], { onDone: refresh }),
		data.votes_deleted ? element('p', { class: 'admin-hint', text: 'Its individual votes were deleted a month after it closed. The totals here are all there is.' }) : null,
	]);

	const options = q.options.map((o) => ({ ...o, count: results.options.find((x) => x.id === o.id)?.count || 0 }));
	const counts = section('Nairobi as a whole', [
		barList(options.map((o) => ({ label: o.label, value: o.count, sub: sharePct(o.count, results.total) })), { empty: 'No votes yet.' }),
		data.days.length > 1 ? lineChart({ dates: data.days.map((d) => d.date), series: [{ name: 'Votes cast', values: data.days.map((d) => d.votes), tone: 'a' }], label: 'Votes by day' }) : null,
	]);

	const columns = [
		{ label: 'District', value: (d) => d.name },
		{ label: 'Votes', value: (d) => d.total, numeric: true },
		...q.options.map((o) => ({ label: o.label, value: (d) => d.counts[o.id], numeric: true })),
		{ label: 'Public', value: (d) => (d.total >= data.vocab.min ? 'Yes' : d.total ? `${data.vocab.min - d.total} more` : '') },
	];
	const districts = section('Every district', [
		element('p', { class: 'admin-hint', text: `Every count, including districts under ${data.vocab.min} votes that the public map hatches. A district that jumps overnight is worth a second look.` }),
		table(columns, data.districts.filter((d) => d.total), { filename: `pulse-${q.ref}`, empty: 'No votes yet.' }),
	]);

	const editor = pulseEditor(data.vocab, q.raw, {
		locked: q.votes > 0,
		buttons: [{ label: 'Save changes', primary: true, run: async (question) => {
			const answer = await api('pulse', { body: { action: 'update', id: q.id, question } });
			toast('Saved.', 'good');
			refresh(answer);
		} }],
	});

	const danger = section('Delete it', [
		element('p', { class: 'admin-hint', text: 'Deletes the question, its votes and its counts, for good. Closing it is almost always what you want.' }),
		element('div', { class: 'admin-form' }, [
			element('label', {}, [element('span', { text: `Type ${q.ref} to confirm` }), confirmDelete]),
			actions([{ label: 'Delete for good', tone: 'bad', run: () => api('pulse', { body: { action: 'delete', id: q.id, confirm: confirmDelete.value } }), done: 'Deleted.' }], {
				onDone: () => { drawMain('pulse'); location.hash = 'pulse'; },
			}),
		]),
	]);

	// A draft has nothing to count yet.
	return [summary, q.status === 'draft' ? null : counts, q.status === 'draft' ? null : districts, section('Edit', editor.form), danger];
}

// --- the newsletter ------------------------------------------------------------------------------------
//
// The list, issues and sending, from /api/admin's news routes. The admin sees
// addresses in full: the list is the owner's, and finding, helping or erasing
// one person is the job. Sending runs here, a batch at a time, for as long as
// the issue's drawer is open; close it and the issue waits, and opening it
// again carries on from where it stopped.

const NEWS_STATUS = { subscribed: 'Subscribed', pending: 'Waiting to confirm', unsubscribed: 'Left', bounced: 'Bounced', complained: 'Marked as spam' };
const newsChip = (status) => chip(NEWS_STATUS[status] || status, { subscribed: 'good', pending: 'warn', unsubscribed: 'muted', bounced: 'bad', complained: 'bad' }[status] || '');
const CAMPAIGN_STATUS = { draft: 'Draft', sending: 'Sending', stopped: 'Stopped', sent: 'Sent' };
const campaignChip = (status) => chip(CAMPAIGN_STATUS[status] || status, { draft: 'muted', sending: 'warn', stopped: 'bad', sent: 'good' }[status] || '');
const sourceLabel = (s) => ({ home: 'Home page', other: 'Elsewhere', admin: 'Added in the admin', import: 'Imported' }[s] || `/${s}`);
let newsStatus = 'subscribed';

function newsSetup(setup) {
	const rows = [
		[setup.sending, 'Sending', setup.sending ? `From ${setup.from}` : 'Set RESEND_API_KEY and NEWSLETTER_FROM in Vercel. The sender must be on a domain verified in Resend.'],
		[setup.webhook, 'Bounces and complaints', setup.webhook ? 'Resend reports them, and they come off the list' : 'In Resend, add a webhook to https://www.allaboutnairobi.com/api/news?r=webhook for email.bounced, email.complained and email.delivered, and set its signing secret as RESEND_WEBHOOK_SECRET.'],
		[setup.secret, 'Its own signing secret', setup.secret ? 'NEWSLETTER_SECRET is set' : 'Set NEWSLETTER_SECRET once and never change it: it signs every unsubscribe link already sent. Until then the admin session secret signs them.'],
		[setup.live, 'The form on the site', setup.live ? 'NEWSLETTER_LIVE is on: sign-ups come here' : 'NEWSLETTER_LIVE=1 in Vercel, then redeploy, points the site\'s form at this list.'],
	];
	if (rows.every(([ok]) => ok)) return null;
	return section('Setting it up', [
		element('ul', { class: 'admin-checks' }, rows.map(([ok, label, text]) => element('li', { class: ok ? 'is-on' : 'is-off' }, [
			element('span', { 'aria-hidden': 'true', text: ok ? '✓' : '✗' }),
			element('span', {}, [element('strong', { text: label }), ` - ${text}`]),
		]))),
	]);
}

function campaignRow(c) {
	return element('li', {}, [
		element('a', { class: 'admin-row', href: `#campaign=${c.id}` }, [
			element('span', { class: 'admin-row-top' }, [campaignChip(c.status), c.format === 'issue' && c.issue ? element('span', { class: 'admin-ref', text: 'From the archive' }) : null]),
			element('strong', { text: c.subject }),
			element('span', { class: 'admin-row-meta', text: [
				c.status === 'draft' ? `written ${when(c.created_at)}` : `${fmt.int(c.sent)} of ${fmt.int(c.total)} sent`,
				c.delivered ? `${fmt.int(c.delivered)} delivered` : '',
				c.bounced ? `${fmt.int(c.bounced)} bounced` : '',
				c.finished_at ? `finished ${when(c.finished_at)}` : '',
			].filter(Boolean).join(' · ') }),
		]),
	]);
}

function subscriberRow(s) {
	return element('li', {}, [
		element('a', { class: 'admin-row', href: `#subscriber=${s.id}` }, [
			element('span', { class: 'admin-row-top' }, [newsChip(s.status), ...(s.tags || []).map((t) => element('span', { class: 'admin-ref', text: t }))]),
			element('strong', { text: s.email, 'data-clarity-mask': 'true' }),
			element('span', { class: 'admin-row-meta', text: [sourceLabel(s.source), `joined ${day(s.created_at)}`, s.unsub_reason ? `left: ${s.unsub_reason}` : ''].filter(Boolean).join(' · ') }),
		]),
	]);
}

function download(name, text, type = 'text/csv') {
	const url = URL.createObjectURL(new Blob([text], { type }));
	const a = element('a', { href: url, download: name });
	document.body.append(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function newsSubscribers(counts) {
	const results = element('div', { 'aria-live': 'polite' });
	const more = element('button', { type: 'button', class: 'admin-button', hidden: '', text: 'Show more' });
	let next = null;
	const load = async (append = false) => {
		try {
			const d = await api('news-subscribers', { params: { status: newsStatus, ...(append && next ? { after: next } : {}) } });
			next = d.next;
			const rows = d.rows.map(subscriberRow);
			if (append) results.querySelector('ul')?.append(...rows);
			else results.replaceChildren(d.rows.length ? element('ul', { class: 'admin-list' }, rows) : empty(d.searched ? 'Nobody with that address.' : 'Nobody here.'));
			more.hidden = !next;
		} catch (error) {
			if (error.code !== 'auth') results.replaceChildren(notice(error.message));
		}
	};
	more.addEventListener('click', () => load(true));
	const search = element('input', { type: 'search', placeholder: 'An exact address', 'aria-label': 'Find a subscriber by address', 'data-clarity-mask': 'true' });
	search.addEventListener('keydown', async (event) => {
		if (event.key !== 'Enter') return;
		event.preventDefault();
		if (!search.value.trim()) return load();
		try {
			const d = await api('news-subscribers', { params: { email: search.value.trim() } });
			results.replaceChildren(d.rows.length ? element('ul', { class: 'admin-list' }, d.rows.map(subscriberRow)) : empty('Nobody with that address.'));
			more.hidden = true;
		} catch (error) {
			if (error.code !== 'auth') results.replaceChildren(notice(error.message));
		}
	});
	const exporter = element('button', {
		type: 'button', class: 'admin-button', text: 'Download as CSV',
		onclick: async (event) => {
			const button = event.currentTarget;
			button.disabled = true;
			try {
				const d = await api('news-export', { params: { status: newsStatus } });
				download(`newsletter-${d.status}-${new Date().toISOString().slice(0, 10)}.csv`, d.csv);
				toast(`${fmt.int(d.count)} addresses downloaded.`, 'good');
			} catch (error) {
				if (error.code !== 'auth') toast(error.message, 'error');
			} finally {
				button.disabled = false;
			}
		},
	});
	load();
	return section('Subscribers', [
		element('div', { class: 'admin-filters' }, [
			segmented(Object.entries(NEWS_STATUS).map(([id, label]) => [id, `${label} · ${fmt.int(counts[id] || 0)}`]), newsStatus, (v) => { newsStatus = v; search.value = ''; load(); }, 'Which subscribers'),
			element('div', { class: 'admin-filter-pair' }, [search, exporter]),
		]),
		results,
		more,
		element('p', { class: 'admin-hint', text: 'Search takes a whole address and finds it at once. The download is everyone in the state chosen above, with when and how each joined - keep it somewhere private.' }),
	]);
}

function newsAdder(onDone) {
	const box = element('textarea', { rows: '5', placeholder: 'One address a line, or pasted from a spreadsheet', 'data-clarity-mask': 'true' });
	const consent = element('input', { type: 'text', maxlength: '300', placeholder: 'e.g. Subscribed through Buttondown before October 2026' });
	const tags = element('input', { type: 'text', maxlength: '120', placeholder: 'Optional: buttondown, launch' });
	let mode = 'confirm';
	const status = element('div', { 'aria-live': 'polite' });
	const button = element('button', { type: 'submit', class: 'admin-button is-primary', text: 'Add them' });
	const form = element('form', { class: 'admin-form' }, [
		element('p', { class: 'admin-hint', text: 'Only people who asked for the newsletter. "Ask them to confirm" emails every address the same link a sign-up gets, and adds nobody who does not tap it. "Already agreed" adds them at once - for a list moved from another provider - and the note below is kept with each address as the record of how they agreed. Anyone who left, bounced or marked an issue as spam is skipped either way.' }),
		segmented([['confirm', 'Ask them to confirm'], ['subscribed', 'Already agreed']], mode, (v) => { mode = v; }, 'How they are added'),
		element('label', {}, [element('span', { text: 'Addresses' }), box]),
		element('label', {}, [element('span', { text: 'How they agreed' }), consent]),
		element('label', {}, [element('span', { text: 'Tags' }), tags]),
		element('div', { class: 'admin-actions' }, [button]),
		status,
	]);
	form.addEventListener('submit', async (event) => {
		event.preventDefault();
		const all = box.value.split(/[\n\r,;\t ]+/).filter((x) => x.includes('@'));
		if (!all.length) return status.replaceChildren(notice('Paste at least one address.'));
		const size = mode === 'confirm' ? 25 : 500;
		const total = {};
		button.disabled = true;
		try {
			for (let i = 0; i < all.length; i += size) {
				status.replaceChildren(notice(`Adding ${fmt.int(Math.min(i + size, all.length))} of ${fmt.int(all.length)}…`, 'info'));
				const d = await api('news', { body: { action: 'add', mode, emails: all.slice(i, i + size).join('\n'), consent: consent.value, tags: tags.value, source: all.length > 1 ? 'import' : 'admin' } });
				for (const [k, n] of Object.entries(d.tally)) total[k] = (total[k] || 0) + n;
			}
			const said = {
				subscribed: 'added', pending: 'sent a confirmation', resent: 'sent another confirmation', confirmed: 'were waiting and are now added',
				existing: 'already on the list', waiting: 'had a confirmation in the last ten minutes', suppressed: 'skipped - they left, bounced or complained', invalid: 'not addresses',
			};
			status.replaceChildren(notice(Object.entries(total).filter(([, n]) => n).map(([k, n]) => `${fmt.int(n)} ${said[k] || k}`).join('; ') || 'Nothing to do.', 'good'));
			box.value = '';
			onDone?.();
		} catch (error) {
			if (error.code !== 'auth') status.replaceChildren(notice(error.message));
		} finally {
			button.disabled = false;
		}
	});
	return form;
}

function newsSettingsForm(settings) {
	const paused = element('input', { type: 'checkbox' });
	paused.checked = settings.paused;
	const message = element('input', { type: 'text', maxlength: '200', placeholder: 'Sign-ups are paused for a short while. Try again later.' });
	message.value = settings.message || '';
	const double = element('input', { type: 'checkbox' });
	double.checked = settings.doubleOptIn;
	const welcome = element('input', { type: 'checkbox' });
	welcome.checked = settings.welcome;
	const subject = element('input', { type: 'text', maxlength: '150' });
	subject.value = settings.welcomeSubject;
	const body = element('textarea', { rows: '6', maxlength: '5000' });
	body.value = settings.welcomeBody;
	const status = element('div', { 'aria-live': 'polite' });
	return element('div', { class: 'admin-form' }, [
		element('label', { class: 'admin-check' }, [paused, element('span', { text: 'Pause sign-ups' })]),
		element('label', {}, [element('span', { text: 'Message while paused' }), message]),
		element('label', { class: 'admin-check' }, [double, element('span', { text: 'Ask every new address to confirm (double opt-in)' })]),
		element('p', { class: 'admin-hint', text: 'Leave this on. Anyone can type anyone\'s address; confirming proves it is theirs, keeps fake and mistyped addresses off the list, and is what keeps the emails out of spam. An address that once left always has to confirm, whatever this says.' }),
		element('label', { class: 'admin-check' }, [welcome, element('span', { text: 'Send a welcome when someone joins' })]),
		element('label', {}, [element('span', { text: 'Welcome subject' }), subject]),
		element('label', {}, [element('span', { text: 'Welcome text (Markdown: ## headings, **bold**, [links](/guides), - lists)' }), body]),
		element('div', { class: 'admin-actions' }, [element('button', {
			type: 'button', class: 'admin-button is-primary', text: 'Save newsletter settings',
			onclick: async () => {
				try {
					await api('news', { body: { action: 'settings', settings: { paused: paused.checked, message: message.value, doubleOptIn: double.checked, welcome: welcome.checked, welcomeSubject: subject.value, welcomeBody: body.value } } });
					status.replaceChildren();
					toast('Saved. Live within a minute.', 'good');
				} catch (error) {
					if (error.code !== 'auth') status.replaceChildren(notice(error.message));
				}
			},
		})]),
		status,
	]);
}

async function showNewsletter() {
	const holder = element('div');
	const draw = async () => {
		const d = await api('news', { params: { days: String(rangeDays) } });
		const c = d.current;
		const p = d.previous;
		const left = (x) => (x.unsubscribed || 0) + (x.bounced || 0) + (x.complained || 0);
		const sources = Object.entries(c.sources || {}).sort((a, b) => b[1] - a[1]).map(([s, n]) => ({ label: sourceLabel(s), value: n }));
		const reasons = Object.entries(c.reasons || {}).sort((a, b) => b[1] - a[1]).map(([r, n]) => ({ label: d.reasons[r] || r, value: n }));
		holder.replaceChildren(...[
			newsSetup(d.setup),
			element('div', { class: 'kpis' }, [
				kpi('Subscribers', d.counts.subscribed || 0, { note: d.counts.pending ? `${fmt.int(d.counts.pending)} waiting to confirm` : 'confirmed, and getting every issue' }),
				kpi('Joined', c.confirmed || 0, { previous: p.confirmed || 0, spark: d.daily.map((x) => x.confirmed) }),
				kpi('Left', left(c), { previous: left(p), invert: true, spark: d.daily.map((x) => x.unsubscribed), note: (c.bounced || c.complained) ? `${fmt.int(c.bounced || 0)} bounced, ${fmt.int(c.complained || 0)} spam` : '' }),
				kpi('Growth', (c.confirmed || 0) - left(c), { previous: (p.confirmed || 0) - left(p), format: (n) => `${n > 0 ? '+' : ''}${fmt.int(n)}` }),
				kpi('Sign-ups', c.signups || 0, { previous: p.signups || 0, note: c.signups ? `${Math.round(((c.confirmed || 0) - (c.added || 0)) / c.signups * 100)}% went on to confirm` : 'from the form' }),
				kpi('Emails sent', c.sent || 0, { previous: p.sent || 0, note: 'issues only' }),
			]),
			section('Every day', lineChart({
				dates: d.daily.map((x) => x.date),
				series: [
					{ name: 'Joined', values: d.daily.map((x) => x.confirmed), tone: 'a' },
					{ name: 'Left', values: d.daily.map((x) => x.unsubscribed), tone: 'b' },
				],
				label: 'Subscribers joining and leaving by day',
			})),
			element('div', { class: 'admin-pair' }, [
				section('Where they signed up', [
					element('p', { class: 'admin-hint', text: 'The page the form was on, for everyone who confirmed in this period.' }),
					barList(sources, { empty: 'Nobody joined in this period.' }),
				]),
				section('Why they left', [
					element('p', { class: 'admin-hint', text: 'From the unsubscribe page, for those who said. A mail app\'s own Unsubscribe button gives no reason.' }),
					barList(reasons, { empty: 'Nobody gave a reason in this period.' }),
				]),
			]),
			section('Issues', [
				element('div', { class: 'admin-actions' }, [element('a', { class: 'admin-button is-primary', href: '#campaign=new', text: 'Write an issue' })]),
				list(d.campaigns, campaignRow, 'Nothing written yet. An issue can be written here, or taken from one already published at /newsletter.'),
			]),
			newsSubscribers(d.counts),
			section('Add subscribers', newsAdder(() => draw())),
			section('Settings', newsSettingsForm(d.settings)),
			element('p', { class: 'admin-hint', text: 'No email reports back whether it was opened or what was clicked: there is no tracking pixel and no link is rewritten, as /terms promises. Delivered, bounced and spam come from Resend\'s webhook.' }),
		].filter(Boolean));
	};
	await draw();
	return [element('div', { class: 'admin-toolbar' }, [rangePicker(() => draw())]), holder];
}

async function showSubscriber(id) {
	const draw = ({ subscriber: s }) => {
		const run = (op, extra = {}) => (note) => api('news', { body: { action: 'subscriber', op, id: s.id, note, ...extra } });
		const redraw = (next) => { panel.replaceChildren(...draw(next).filter(Boolean)); drawMain('newsletter'); };
		const tagBox = element('input', { type: 'text', maxlength: '120', placeholder: 'launch, buttondown' });
		tagBox.value = (s.tags || []).join(', ');
		const confirmBox = element('input', { type: 'text', placeholder: s.email, 'aria-label': `Type ${s.email} to confirm`, 'data-clarity-mask': 'true' });
		const deleteStatus = element('div', { 'aria-live': 'polite' });
		return [
			section('', [
				element('div', { class: 'admin-row-top' }, [newsChip(s.status), ...(s.tags || []).map((t) => element('span', { class: 'admin-ref', text: t }))]),
				element('h2', { class: 'admin-title', text: s.email, 'data-clarity-mask': 'true' }),
				element('dl', { class: 'admin-facts' }, [
					fact('Signed up from', sourceLabel(s.source)),
					fact('Joined', when(s.created_at)),
					fact('Confirmed', when(s.confirmed_at)),
					fact('Confirmation sent', when(s.confirm_sent_at)),
					fact('Left', when(s.unsubscribed_at)),
					fact('Why', s.unsub_reason),
					fact('How they agreed', s.consent),
				]),
			]),
			section('What happened', s.history.length ? element('ol', { class: 'admin-log' }, s.history.slice().reverse().map((h) => element('li', {}, [
				element('span', { class: 'admin-log-when', text: when(h.at) }),
				element('span', { text: `${h.what}${h.note ? ` - ${h.note}` : ''}` }),
			]))) : empty('Nothing recorded.')),
			section('Actions', [
				actions([
					s.status === 'pending' && { label: 'Send another confirmation', run: run('resend'), done: 'Sent.' },
					s.status === 'pending' && { label: 'Mark subscribed', run: (note) => {
						const how = window.prompt('How did they agree to be emailed? This is kept as the record.');
						return how ? api('news', { body: { action: 'subscriber', op: 'subscribe', id: s.id, consent: how, note } }) : null;
					} },
					(s.status === 'subscribed' || s.status === 'pending') && { label: 'Unsubscribe', tone: 'bad', confirm: 'Take this address off the list? It stays off until its owner subscribes again.', run: run('unsubscribe') },
				], { onDone: (next) => next && redraw(next) }),
				element('p', { class: 'admin-hint', text: 'Someone who left, bounced or complained can only come back by subscribing again themselves.' }),
			]),
			section('Tags', element('div', { class: 'admin-form' }, [
				element('label', {}, [element('span', { text: 'Tags, to send an issue to some of the list' }), tagBox]),
				actions([{ label: 'Save tags', run: () => api('news', { body: { action: 'subscriber', op: 'tags', id: s.id, tags: tagBox.value } }) }], { onDone: (next) => next && redraw(next) }),
			])),
			section('Erase for good', element('div', { class: 'admin-action-block' }, [
				element('p', { text: `Deletes the address and its history. Use it when someone asks to be forgotten; to stop emails, unsubscribe instead - an erased address can be imported again, a left one cannot. Type ${s.email} to confirm.` }),
				confirmBox,
				element('div', { class: 'admin-actions' }, [element('button', {
					type: 'button', class: 'admin-button is-bad', text: 'Erase for good',
					onclick: async () => {
						try {
							await api('news', { body: { action: 'subscriber', op: 'delete', id: s.id, confirm: confirmBox.value } });
							toast('Erased.', 'good');
							location.hash = 'newsletter';
						} catch (error) {
							if (error.code !== 'auth') deleteStatus.replaceChildren(notice(error.message));
						}
					},
				})]),
				deleteStatus,
			])),
		];
	};
	return draw(await api('news-subscriber', { params: { id } }));
}

// The published issues, from the build, for "send an issue from the archive".
let issuesCache = null;
async function publishedIssues() {
	if (!issuesCache) {
		try { issuesCache = (await (await fetch('/api/newsletter-issues.json', { cache: 'no-store' })).json()).issues || []; } catch { issuesCache = []; }
	}
	return issuesCache;
}

function campaignEditor(c, issues, onSaved) {
	let format = c?.format || (issues.length ? 'issue' : 'markdown');
	const subject = element('input', { type: 'text', maxlength: '150', placeholder: 'What changed in October' });
	subject.value = c?.subject || '';
	const preheader = element('input', { type: 'text', maxlength: '200', placeholder: 'The line an inbox shows after the subject' });
	preheader.value = c?.preheader || '';
	const body = element('textarea', { rows: '14', maxlength: '60000', placeholder: '## A heading\n\nA paragraph, with a [link](/guides/rent-advance).\n\n- a list\n- of things' });
	body.value = c?.body || '';
	const issue = selectBox('Issue', issues.map((i) => [i.slug, `Issue ${String(i.issue).padStart(2, '0')}: ${i.title}`]), c?.issue || issues[0]?.slug || '', (v) => {
		const chosen = issues.find((i) => i.slug === v);
		if (chosen && (!subject.value || issues.some((i) => i.title === subject.value))) subject.value = chosen.title;
		if (chosen && (!preheader.value || issues.some((i) => i.description === preheader.value))) preheader.value = chosen.description;
	}, 'Choose an issue');
	if (!c && issues[0]) { subject.value = issues[0].title; preheader.value = issues[0].description; }
	const audience = element('input', { type: 'text', maxlength: '24', placeholder: 'Everyone' });
	audience.value = c?.audience && c.audience !== 'all' ? c.audience : '';
	const issueField = element('label', {}, [element('span', { text: 'Which published issue' }), issue]);
	const bodyField = element('label', {}, [element('span', { text: 'The issue (Markdown)' }), body]);
	const show = () => { issueField.hidden = format !== 'issue'; bodyField.hidden = format !== 'markdown'; };
	const status = element('div', { 'aria-live': 'polite' });
	const form = element('form', { class: 'admin-form' }, [
		issues.length ? segmented([['issue', 'A published issue'], ['markdown', 'Write it here']], format, (v) => { format = v; show(); }, 'What to send') : null,
		issueField,
		element('label', {}, [element('span', { text: 'Subject' }), subject]),
		element('label', {}, [element('span', { text: 'Preview line' }), preheader]),
		bodyField,
		element('label', {}, [element('span', { text: 'Only subscribers tagged (leave empty for everyone)' }), audience]),
		element('div', { class: 'admin-actions' }, [element('button', { type: 'submit', class: 'admin-button is-primary', text: c ? 'Save changes' : 'Save as a draft' })]),
		status,
	]);
	show();
	form.addEventListener('submit', async (event) => {
		event.preventDefault();
		try {
			const saved = await api('news', { body: {
				action: 'campaign', op: c ? 'update' : 'create', id: c?.id,
				format, subject: subject.value, preheader: preheader.value, body: body.value, issue: issue.value, audience: audience.value.trim() || 'all',
			} });
			onSaved(saved);
		} catch (error) {
			if (error.code !== 'auth') status.replaceChildren(notice(error.message));
		}
	});
	return form;
}

async function showCampaign(id) {
	const issues = await publishedIssues();
	if (id === 'new') {
		return [section('', campaignEditor(null, issues, (saved) => {
			toast('Saved as a draft. Send yourself a test next.', 'good');
			drawMain('newsletter');
			location.hash = `campaign=${saved.campaign.id}`;
		}))];
	}
	let sending = false;
	const draw = (d) => {
		const c = d.campaign;
		const redraw = (next) => { panel.replaceChildren(...draw(next).filter(Boolean)); };
		const progress = element('div', { class: 'admin-progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(c.total || 1), 'aria-valuenow': String(c.sent || 0) }, [
			element('span', { style: `width:${c.total ? Math.min(100, (c.sent / c.total) * 100).toFixed(1) : 0}%` }),
		]);
		const frame = element('iframe', { class: 'admin-email-preview', title: 'How the email looks', sandbox: '', loading: 'lazy' });
		api('news', { body: { action: 'campaign', op: 'preview', id: c.id } }).then((r) => { frame.srcdoc = r.html; }).catch(() => {});
		const keepSending = async () => {
			if (sending) return;
			sending = true;
			try {
				let next = d;
				while (next.campaign.status === 'sending' && !drawer.hidden && panel.contains(progress)) {
					next = await api('news', { body: { action: 'campaign', op: 'step', id: c.id } });
					if (!drawer.hidden) redraw(next);
				}
				if (next.campaign.status === 'sent') { toast(`Sent to ${fmt.int(next.campaign.sent)}.`, 'good'); drawMain('newsletter'); }
			} catch (error) {
				if (error.code !== 'auth') toast(`Sending paused: ${error.message} Open the issue again to carry on.`, 'error');
			} finally {
				sending = false;
			}
		};
		if (c.status === 'sending') setTimeout(keepSending, 300);
		return [
			section('', [
				element('div', { class: 'admin-row-top' }, [campaignChip(c.status), c.audience !== 'all' ? element('span', { class: 'admin-ref', text: `tagged ${c.audience}` }) : null]),
				element('h2', { class: 'admin-title', text: c.subject }),
				c.preheader ? element('p', { class: 'admin-hint', text: c.preheader }) : null,
				element('dl', { class: 'admin-facts' }, [
					fact('Goes to', c.status === 'draft' ? `${fmt.int(d.audience)} subscriber${d.audience === 1 ? '' : 's'}${c.audience !== 'all' ? ` tagged ${c.audience}` : ''}` : `${fmt.int(c.total)}, fixed when it started`),
					fact('Sent', c.status === 'draft' ? null : `${fmt.int(c.sent)} of ${fmt.int(c.total)}`),
					fact('Delivered', c.delivered ? fmt.int(c.delivered) : null),
					fact('Bounced', c.bounced ? fmt.int(c.bounced) : null),
					fact('Marked as spam', c.complained ? fmt.int(c.complained) : null),
					fact('Test sent', when(c.test_sent_at)),
					fact('Started', when(c.started_at)),
					fact('Finished', when(c.finished_at)),
					fact('On the site', c.url ? element('a', { href: c.url, target: '_blank', rel: 'noopener', text: 'The issue ➞' }) : null),
				]),
				c.status !== 'draft' ? progress : null,
				c.status === 'sending' ? notice('Sending, a hundred at a time. Keep this open until it says sent; closed, it waits, and opening it again carries on.', 'info') : null,
				c.error ? notice(`The last batch failed: ${c.error}`) : null,
			]),
			section('Actions', [
				actions([
					c.status === 'draft' && { label: 'Send me a test', run: () => api('news', { body: { action: 'campaign', op: 'test', id: c.id } }), done: 'Test sent to the owner\'s address.' },
					c.status === 'draft' && { label: `Send to ${fmt.int(d.audience)}`, tone: 'primary', confirm: `Send "${c.subject}" to ${fmt.int(d.audience)} subscriber${d.audience === 1 ? '' : 's'} now? This cannot be undone.`, run: () => api('news', { body: { action: 'campaign', op: 'start', id: c.id } }), done: 'Sending.' },
					c.status === 'sending' && { label: 'Stop sending', tone: 'bad', confirm: 'Stop here? Whoever has it, has it; the rest wait until you carry on.', run: () => api('news', { body: { action: 'campaign', op: 'stop', id: c.id } }) },
					c.status === 'stopped' && { label: 'Carry on sending', tone: 'primary', run: () => api('news', { body: { action: 'campaign', op: 'resume', id: c.id } }) },
					c.status === 'draft' && { label: 'Discard', tone: 'bad', confirm: 'Discard this draft?', run: async () => { await api('news', { body: { action: 'campaign', op: 'delete', id: c.id } }); location.hash = 'newsletter'; drawMain('newsletter'); return null; } },
				], { onDone: (next) => { if (next?.campaign) { redraw(next); drawMain('newsletter'); } } }),
				c.status === 'draft' ? element('p', { class: 'admin-hint', text: 'A test goes to the owner\'s address and must come first: read it on a phone before it goes to everyone.' }) : null,
			]),
			section('How it looks', [frame, element('p', { class: 'admin-hint', text: 'Every email carries an unsubscribe link at the foot and the List-Unsubscribe header, which mail apps show as their own button.' })]),
			c.status === 'draft' ? section('Edit', campaignEditor(c, issues, (next) => { toast('Saved.', 'good'); redraw(next); drawMain('newsletter'); })) : null,
		];
	};
	return draw(await api('news-campaign', { params: { id } }));
}

async function showSettings() {
	const s = await api('settings');
	const b = s.banner;
	const l = s.lostfound;

	const bannerText = element('textarea', { rows: '2', maxlength: '240' });
	bannerText.value = b.text || '';
	const bannerOn = element('input', { type: 'checkbox' });
	bannerOn.checked = Boolean(b.active);
	const tone = selectBox('Tone', [['info', 'Information'], ['warning', 'Warning'], ['good', 'Good news']], b.tone || 'info', () => {}, 'Tone');
	const link = element('input', { type: 'text', maxlength: '300', placeholder: '/guides/paye-and-taxes' });
	link.value = b.link || '';
	const linkText = element('input', { type: 'text', maxlength: '40', placeholder: 'Read more' });
	linkText.value = b.link_text || '';
	const until = element('input', { type: 'date' });
	until.value = b.until || '';
	const preview = element('aside', { class: 'site-notice is-info' }, [element('p')]);
	const updatePreview = () => {
		preview.className = `site-notice is-${tone.value || 'info'}`;
		preview.firstChild.replaceChildren(bannerText.value || 'Your notice', link.value ? ' ' : '', link.value ? element('a', { href: '#settings', text: linkText.value || 'Read more' }) : '');
	};
	for (const n of [bannerText, tone, link, linkText]) n.addEventListener('input', updatePreview);
	updatePreview();
	const bannerStatus = element('div', { 'aria-live': 'polite' });

	const paused = element('input', { type: 'checkbox' });
	paused.checked = Boolean(l.paused);
	const message = element('input', { type: 'text', maxlength: '200', placeholder: 'Lost and found is paused for a short while. Try again later.' });
	message.value = l.message || '';
	const limitInputs = Object.entries({ itemsPerHour: 'Listings', claimsPerHour: 'Replies', flagsPerHour: 'Reports', joinsPerHour: 'Place requests', eventsPerHour: 'Events sent in' }).map(([key, label]) => {
		const input = element('input', { type: 'number', min: '1', max: '500', step: '1', placeholder: String(s.defaults[key]) });
		input.value = l.limits?.[key] ?? '';
		return [key, label, input];
	});
	const lfStatus = element('div', { 'aria-live': 'polite' });
	const ev = s.events || {};
	const evPaused = element('input', { type: 'checkbox' });
	evPaused.checked = Boolean(ev.paused);
	const evMessage = element('input', { type: 'text', maxlength: '200', placeholder: 'Event submissions are paused for a short while. Try again later.' });
	evMessage.value = ev.message || '';
	const evStatus = element('div', { 'aria-live': 'polite' });
	const pu = s.pulse || {};
	const puPaused = element('input', { type: 'checkbox' });
	puPaused.checked = Boolean(pu.paused);
	const puMessage = element('input', { type: 'text', maxlength: '200', placeholder: 'Voting is paused for a short while. Results are still here.' });
	puMessage.value = pu.message || '';
	const puPasses = element('input', { type: 'number', min: '1', max: '1000', step: '1', placeholder: String(s.defaults.passesPerHour || '') });
	puPasses.value = pu.limits?.passesPerHour ?? '';
	const puCap = element('input', { type: 'number', min: '1', max: '100', step: '1', placeholder: String(s.defaults.maxLive || '') });
	puCap.value = pu.limits?.maxLive ?? '';
	const puStatus = element('div', { 'aria-live': 'polite' });

	const save = async (what, payload, where) => {
		try {
			await api('settings', { body: { what, [what]: payload } });
			where.replaceChildren();
			toast('Saved. Live within a minute.', 'good');
		} catch (error) {
			if (error.code !== 'auth') where.replaceChildren(notice(error.message));
		}
	};

	return [
		section('Site-wide notice', [
			element('p', { class: 'admin-hint', text: 'A strip under the header on every page. Saving it again shows it again to readers who closed the last one.' }),
			element('div', { class: 'admin-form' }, [
				element('label', { class: 'admin-check' }, [bannerOn, element('span', { text: 'Show the notice' })]),
				element('label', {}, [element('span', { text: 'Notice' }), bannerText]),
				element('div', { class: 'admin-filter-pair' }, [element('label', {}, [element('span', { text: 'Tone' }), tone]), element('label', {}, [element('span', { text: 'Until (optional)' }), until])]),
				element('div', { class: 'admin-filter-pair' }, [element('label', {}, [element('span', { text: 'Link (a page here, or https://)' }), link]), element('label', {}, [element('span', { text: 'Link text' }), linkText])]),
				element('span', { class: 'admin-hint', text: 'Preview' }),
				preview,
				element('div', { class: 'admin-actions' }, [element('button', {
					type: 'button', class: 'admin-button is-primary', text: 'Save notice',
					onclick: () => save('banner', { active: bannerOn.checked, text: bannerText.value, tone: tone.value, link: link.value, link_text: linkText.value, until: until.value }, bannerStatus),
				})]),
				bannerStatus,
			]),
		]),
		section('Lost and found', [
			element('div', { class: 'admin-form' }, [
				element('label', { class: 'admin-check' }, [paused, element('span', { text: 'Pause new listings, replies and place requests' })]),
				element('label', {}, [element('span', { text: 'Message while paused' }), message]),
				element('h3', { text: 'Limits per hour, per connection' }),
				element('p', { class: 'admin-hint', text: 'Leave a box empty for the default shown in it. Lower them during a spam wave; the counts reset every hour.' }),
				element('div', { class: 'admin-limits' }, limitInputs.map(([, label, input]) => element('label', {}, [element('span', { text: label }), input]))),
				element('div', { class: 'admin-actions' }, [element('button', {
					type: 'button', class: 'admin-button is-primary', text: 'Save lost and found settings',
					onclick: () => save('lostfound', { paused: paused.checked, message: message.value, limits: Object.fromEntries(limitInputs.filter(([, , i]) => i.value).map(([k, , i]) => [k, Number(i.value)])) }, lfStatus),
				})]),
				lfStatus,
			]),
		]),
		section('Events sent in', [
			element('div', { class: 'admin-form' }, [
				element('p', { class: 'admin-hint', text: 'The form at /events/submit. Paused, it shows this message instead; what was already sent stays in the queue. The hourly limit is with the others above.' }),
				element('label', { class: 'admin-check' }, [evPaused, element('span', { text: 'Pause new event submissions' })]),
				element('label', {}, [element('span', { text: 'Message while paused' }), evMessage]),
				element('div', { class: 'admin-actions' }, [element('button', {
					type: 'button', class: 'admin-button is-primary', text: 'Save event settings',
					onclick: () => save('events', { paused: evPaused.checked, message: evMessage.value }, evStatus),
				})]),
				evStatus,
			]),
		]),
		section('Nairobi Pulse', [
			element('div', { class: 'admin-form' }, [
				element('p', { class: 'admin-hint', text: 'Paused, nobody can check in or vote and /pulse says why; the results stay up. The same switch is at the top of the Pulse page. Location checks are limited per connection per hour - phone networks put many people behind one address, so keep it generous.' }),
				element('label', { class: 'admin-check' }, [puPaused, element('span', { text: 'Pause voting' })]),
				element('label', {}, [element('span', { text: 'Message while paused' }), puMessage]),
				element('div', { class: 'admin-filter-pair' }, [
					element('label', {}, [element('span', { text: 'Location checks per hour, per connection' }), puPasses]),
					element('label', {}, [element('span', { text: 'Questions open at once, at most' }), puCap]),
				]),
				element('div', { class: 'admin-actions' }, [element('button', {
					type: 'button', class: 'admin-button is-primary', text: 'Save Pulse settings',
					onclick: () => save('pulse', {
						paused: puPaused.checked,
						message: puMessage.value,
						limits: Object.fromEntries([['passesPerHour', puPasses.value], ['maxLive', puCap.value]].filter(([, v]) => v).map(([k, v]) => [k, Number(v)])),
					}, puStatus),
				})]),
				puStatus,
			]),
		]),
	];
}

const ACTION_LABELS = {
	'item.hide': 'Took down', 'item.restore': 'Restored', 'item.close': 'Closed', 'item.extend': 'Extended',
	'item.clearReports': 'Cleared reports on', 'item.erase': 'Erased personal details on',
	'place.approve': 'Approved', 'place.relink': 'Issued a new portal link for', 'place.suspend': 'Suspended',
	'place.reactivate': 'Reactivated', 'place.reject': 'Turned down', 'place.reopen': 'Reopened', 'place.edit': 'Edited',
	'item.edit': 'Edited', 'item.delete': 'Deleted',
	'settings.banner': 'Changed the notice:', 'settings.lostfound': 'Changed lost and found settings:',
	'event.add': 'Added the event', 'event.edit': 'Updated the event', 'event.remove': 'Removed the event',
	'submission.approve': 'Approved and listed', 'submission.reject': 'Turned down the event', 'submission.reopen': 'Reopened the event',
	'submission.erase': 'Erased the organiser\'s details on', 'settings.events': 'Changed event submissions:',
	'pulse.create': 'Wrote the question', 'pulse.update': 'Edited the question', 'pulse.open': 'Opened the question', 'pulse.close': 'Closed the question',
	'pulse.reopen': 'Reopened the question', 'pulse.feature': 'Changed featuring on', 'pulse.recount': 'Recounted', 'pulse.delete': 'Deleted the question',
	'pulse.on': 'Switched on, from the bank,', 'pulse.off': 'Switched off, before any vote,',
	'settings.pulse': 'Changed Nairobi Pulse settings:',
	'news.add': 'Added to the newsletter', 'news.resend': 'Sent another confirmation to', 'news.subscribe': 'Marked subscribed', 'news.unsubscribe': 'Unsubscribed',
	'news.tags': 'Changed the tags on', 'news.delete': 'Erased a subscriber', 'news.settings': 'Changed newsletter settings:',
	'news.create': 'Wrote the issue', 'news.update': 'Edited the issue', 'news.test': 'Sent a test of', 'news.start': 'Started sending',
	'news.sent': 'Finished sending', 'news.stop': 'Stopped sending', 'news.discard': 'Discarded the issue',
};

async function showActivity() {
	const data = await api('log');
	return [section('', data.entries.length ? element('ol', { class: 'admin-log' }, data.entries.map((e) => element('li', {}, [
		element('span', { class: 'admin-log-when', text: when(e.created_at) }),
		element('span', {}, [
			`${ACTION_LABELS[e.action] || e.action} `,
			e.action.startsWith('item.') && e.action !== 'item.delete' ? element('a', { href: `#item=${e.target}`, text: e.target })
				: e.action.startsWith('place.') ? element('a', { href: `#place=${e.target}`, text: e.target })
				: e.action.startsWith('event.') ? element('a', { href: '#events', text: e.target })
				: e.action.startsWith('settings.') ? null : element('span', { text: e.target }),
			e.note ? element('span', { class: 'admin-log-note', text: ` - ${e.note}` }) : null,
		]),
	]))) : empty('Nothing has been done here yet. Every action you take is recorded.'))];
}

async function showSite() {
	const [site, status] = await Promise.all([
		api('site'),
		fetch('/api/site-status.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
	]);
	const short = (sha) => (sha ? sha.slice(0, 7) : '');
	const live = site.deploy.sha;
	const behind = site.latest && live && site.latest.sha !== live;
	const due = (rows) => rows.filter((r) => r.fail_on && daysUntil(r.fail_on) <= 30);
	const settings = [
		['database', 'Database'], ['googleSignIn', 'Google sign-in'], ['dailyPurge', 'Daily purge of old contact details'],
		['ipSalt', 'Rate-limit salt'], ['email', 'Email (reply notices, portal links)'], ['github', 'GitHub token (live against master)'],
	];
	const expiry = (row, label) => {
		const left = daysUntil(row.fail_on);
		return element('li', {}, [
			element('span', { class: 'admin-expiry-name', text: label }),
			chip(left < 0 ? `expired ${-left} day${left === -1 ? '' : 's'} ago` : left === 0 ? 'expires today' : `expires in ${left} day${left === 1 ? '' : 's'}`, left <= 0 ? 'bad' : 'warn'),
			row.refresh ? element('code', { text: row.refresh }) : null,
		]);
	};
	const repo = `https://github.com/${site.deploy.repo}`;
	return [
		section('Deployment', element('dl', { class: 'admin-facts' }, [
			fact('Live', live ? element('a', { href: `${repo}/commit/${live}`, text: `${short(live)} ${site.deploy.message}` }) : 'not on Vercel'),
			fact('Latest on master', site.latest
				? element('a', { href: `${repo}/commit/${site.latest.sha}`, text: `${short(site.latest.sha)} ${site.latest.message}` })
				: site.settings.github ? 'GitHub could not be reached' : 'set GITHUB_TOKEN to compare'),
			fact('State', !site.latest || !live ? null : behind ? chip('Live is behind master: a build may have failed', 'bad') : chip('Up to date', 'good')),
			fact('Environment', `${site.deploy.environment}${site.deploy.region ? ` · ${site.deploy.region}` : ''}`),
			fact('Database', site.database),
		])),
		section('Settings', element('ul', { class: 'admin-checks' }, settings.map(([key, label]) => element('li', { class: site.settings[key] ? 'is-on' : 'is-off' }, [
			element('span', { 'aria-hidden': 'true', text: site.settings[key] ? '✓' : '✗' }),
			element('span', { text: `${label}: ${site.settings[key] ? 'set' : 'not set'}` }),
		])))),
		status ? section('Figures to re-check', [
			element('p', { class: 'admin-hint', text: 'Every figure on the site expires, and the build complains when one does. These are past their date or due within 30 days.' }),
			(() => {
				const rows = due(status.constants);
				const gone = rows.filter((c) => daysUntil(c.fail_on) <= 0).length;
				return rows.length ? element('p', {}, [element('strong', { text: `${gone} expired, ${rows.length - gone} due soon` }), ` of ${status.constants.length} figures.`]) : null;
			})(),
			due(status.constants).length ? element('ul', { class: 'admin-expiry' }, due(status.constants).map((c) => expiry(c, c.name))) : empty('No constant is due in the next 30 days.'),
			element('h3', { text: 'Data files' }),
			element('ul', { class: 'admin-expiry' }, status.files.map((f) => {
				const left = daysUntil(f.fail_on);
				return left <= 30 ? expiry(f, f.file) : element('li', {}, [element('span', { class: 'admin-expiry-name', text: f.file }), chip(`good until ${day(f.fail_on)}`, 'good')]);
			})),
		]) : null,
		status ? section('Pages', element('dl', { class: 'admin-facts' }, Object.entries(status.pages).map(([k, n]) => fact(k[0].toUpperCase() + k.slice(1), String(n))))) : null,
		section('Elsewhere', element('ul', { class: 'admin-links' }, [
			['Vercel: deployments and logs', 'https://vercel.com/dashboard'],
			['Firestore data', 'https://console.firebase.google.com/'],
			['Google Search Console', 'https://search.google.com/search-console'],
			['Google Analytics', 'https://analytics.google.com/'],
			['Microsoft Clarity', 'https://clarity.microsoft.com/'],
			['GitHub repository', repo],
		].map(([label, href]) => element('li', {}, [element('a', { href, rel: 'noopener', target: '_blank', text: label })])))),
	];
}

// --- routing -------------------------------------------------------------------------------------

const ROUTES = {
	overview: showOverview,
	goals: showGoals,
	traffic: showTraffic,
	search: showSearch,
	ratings: showRatings,
	trends: showTrends,
	prompts: showPrompts,
	events: showEvents,
	pulse: showPulse,
	newsletter: showNewsletter,
	settings: showSettings,
	listings: showListings,
	places: showPlaces,
	reports: showReports,
	activity: showActivity,
	site: showSite,
};

let drawing = 0;
let mainTab = null;
let livePoll = null;

const parse = () => {
	const hash = decodeURIComponent(location.hash.slice(1));
	const [name, arg] = hash.includes('=') ? hash.split(/=(.*)/s) : [hash || 'overview', undefined];
	if (['item', 'place', 'submission', 'question', 'subscriber', 'campaign'].includes(name)) return { detail: name, arg, tab: mainTab || { item: 'listings', place: 'places', submission: 'events', question: 'pulse', subscriber: 'newsletter', campaign: 'newsletter' }[name] };
	return { tab: ROUTES[name] ? name : 'overview', arg };
};

function markNav(tab) {
	for (const a of $$('[data-tab]')) {
		const on = a.closest('.aa-tabbar') ? (TABBAR[tab] || 'more') === a.dataset.tab : a.dataset.tab === tab;
		if (on) a.setAttribute('aria-current', 'page');
		else a.removeAttribute('aria-current');
	}
	const [title, eyebrow] = VIEWS[tab] || VIEWS.overview;
	$('[data-admin-title]').textContent = title;
	$('[data-admin-eyebrow]').textContent = eyebrow;
	document.title = `${title} - Admin`;
}

function stamp() {
	$('[data-admin-updated]').textContent = `Updated ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
}

// The live visitor count, every minute, on the views that show it.
function poll(tab) {
	clearInterval(livePoll);
	if (tab !== 'overview' && tab !== 'traffic') return;
	livePoll = setInterval(async () => {
		if (document.hidden || !$('[data-live-users]')) return;
		try {
			const d = await api('live');
			if (!d.ready) return;
			for (const n of $$('[data-live-users]')) n.textContent = fmt.int(d.users);
			const pages = $('[data-live-pages]');
			if (pages) pages.replaceChildren(d.pages.length ? barList(d.pages) : element('p', { class: 'admin-empty', text: 'Nobody in the last 30 minutes.' }));
		} catch { /* the next minute will do */ }
	}, 60000);
}

async function drawMain(tab, arg) {
	const mine = ++drawing;
	mainTab = tab;
	markNav(tab);
	view.setAttribute('aria-busy', 'true');
	const slow = setTimeout(() => { if (mine === drawing) view.replaceChildren(skeleton()); }, 150);
	try {
		const parts = await ROUTES[tab](arg);
		if (mine === drawing) {
			view.replaceChildren(...[].concat(parts).filter(Boolean));
			stamp();
			poll(tab);
		}
	} catch (error) {
		if (mine === drawing && error.code !== 'auth') view.replaceChildren(notice(error.status === 404 ? 'That is not here any more.' : error.message));
	} finally {
		clearTimeout(slow);
		if (mine === drawing) view.removeAttribute('aria-busy');
	}
}

// --- the drawer: one listing or place, over the list --------------------------------------------------

const drawer = $('[data-drawer]');
let drawerReturn = null;

async function openDetail(kind, arg) {
	drawerReturn = drawerReturn || document.activeElement;
	$('[data-drawer-title]').textContent = { item: `Listing ${arg}`, place: 'Place', submission: 'Event sent in', question: arg === 'new' ? 'A new question' : 'Question', subscriber: 'Subscriber', campaign: arg === 'new' ? 'A new issue' : 'Issue' }[kind];
	panel.replaceChildren(skeleton());
	drawer.hidden = false;
	requestAnimationFrame(() => drawer.classList.add('is-open'));
	document.documentElement.classList.add('aa-locked');
	try {
		const parts = await ({ item: showItem, place: showPlace, submission: showSubmission, question: showPulseQuestion, subscriber: showSubscriber, campaign: showCampaign }[kind])(arg);
		panel.replaceChildren(...[].concat(parts).filter(Boolean));
		$('[data-drawer-close]').focus();
	} catch (error) {
		if (error.code !== 'auth') panel.replaceChildren(notice(error.status === 404 ? 'That is not here any more.' : error.message));
	}
}

function closeDetail() {
	if (drawer.hidden) return;
	drawer.classList.remove('is-open');
	document.documentElement.classList.remove('aa-locked');
	setTimeout(() => { drawer.hidden = true; panel.replaceChildren(); }, 220);
	drawerReturn?.focus?.();
	drawerReturn = null;
}

$('[data-drawer-close]')?.addEventListener('click', () => { location.hash = mainTab || 'overview'; });
drawer?.addEventListener('click', (event) => { if (event.target === drawer) location.hash = mainTab || 'overview'; });

async function route() {
	closeMore();
	closePalette();
	const where = parse();
	if (where.detail) {
		if (!view.childElementCount || !mainTab) await drawMain(where.tab);
		openDetail(where.detail, where.arg);
		return;
	}
	closeDetail();
	if (where.tab === mainTab && view.childElementCount && !refreshing && where.arg === undefined) { markNav(where.tab); return; }
	await drawMain(where.tab, where.arg);
	$('#admin-main')?.focus({ preventScroll: true });
	window.scrollTo({ top: 0 });
}

// --- the phone's More sheet ----------------------------------------------------------------------------------

const more = $('[data-more]');
function openMore() {
	more.hidden = false;
	requestAnimationFrame(() => more.classList.add('is-open'));
	more.querySelector('a')?.focus();
}
function closeMore() {
	if (!more || more.hidden) return;
	more.classList.remove('is-open');
	setTimeout(() => { more.hidden = true; }, 200);
}
$('[data-more-open]')?.addEventListener('click', openMore);
more?.addEventListener('click', (event) => { if (event.target === more) closeMore(); });

// --- the command palette ----------------------------------------------------------------------------------------

const palette = $('[data-palette]');
const paletteInput = $('[data-palette-input]');
const paletteList = $('[data-palette-list]');
let paletteItems = [];
let paletteIndex = 0;
let placesCache = null;
let paletteTimer = null;

const COMMANDS = [
	...Object.entries(VIEWS).map(([id, [title, eyebrow]]) => ({ label: title, hint: eyebrow, go: `#${id}` })),
	{ label: 'Add an event', hint: 'Events', go: '#events', then: () => $$('.admin-view button, [data-admin-view] button').find((b) => b.textContent === 'Add an event')?.click() },
	{ label: 'Post a site-wide notice', hint: 'Settings', go: '#settings' },
	{ label: 'Write a Pulse question', hint: 'Nairobi Pulse', go: '#question=new' },
	{ label: 'Switch Pulse questions on or off', hint: 'Nairobi Pulse · the question bank', go: '#pulse' },
	{ label: 'Pause lost and found', hint: 'Settings', go: '#settings' },
	{ label: 'Write a newsletter issue', hint: 'Newsletter', go: '#campaign=new' },
	{ label: 'Add or import subscribers', hint: 'Newsletter', go: '#newsletter' },
	{ label: 'Places waiting for approval', hint: 'Places', go: '#places=pending' },
	{ label: 'Expired listings', hint: 'Listings', go: '#listings=expired' },
	{ label: 'Open the site', hint: 'allaboutnairobi.com', href: '/' },
];

function drawPalette() {
	paletteList.replaceChildren(...paletteItems.map((item, i) => element('li', {
		role: 'option', id: `aa-opt-${i}`, 'aria-selected': String(i === paletteIndex), class: i === paletteIndex ? 'is-active' : '',
		onclick: () => choose(i), onmousemove: () => { if (paletteIndex !== i) { paletteIndex = i; drawPalette(); } },
	}, [element('span', { class: 'aa-palette-label', text: item.label }), element('span', { class: 'aa-palette-hint', text: item.hint || '' })])));
	if (!paletteItems.length) paletteList.append(element('li', { class: 'aa-palette-empty', text: 'Nothing matches.' }));
	paletteInput.setAttribute('aria-activedescendant', paletteItems.length ? `aa-opt-${paletteIndex}` : '');
	paletteList.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' });
}

async function searchPalette(query) {
	const q = query.trim().toLowerCase();
	const matches = (text) => text.toLowerCase().includes(q);
	const base = q ? COMMANDS.filter((c) => matches(`${c.label} ${c.hint}`)) : COMMANDS.slice(0, 12);
	paletteItems = base;
	paletteIndex = 0;
	drawPalette();
	if (q.length < 2) return;
	const mine = query;
	try {
		placesCache = placesCache || (await api('places')).places;
		const ref = /^[lf]-[a-z0-9]{5}$/i.test(q) ? q.toUpperCase() : null;
		const items = (await api('items', { params: { q: ref || q } })).items.slice(0, 6);
		if (paletteInput.value !== mine) return;
		paletteItems = [
			...base,
			...items.map((i) => ({ label: i.title, hint: `${i.ref} · ${ITEM_STATUS[i.status] || i.status}`, go: `#item=${i.ref}` })),
			...placesCache.filter((p) => matches(`${p.name} ${p.address || ''}`)).slice(0, 4).map((p) => ({ label: p.name, hint: `Place · ${PLACE_STATUS[p.status] || p.status}`, go: `#place=${p.slug}` })),
		];
		drawPalette();
	} catch { /* the commands are still there */ }
}

function choose(i) {
	const item = paletteItems[i];
	if (!item) return;
	closePalette();
	if (item.href) { window.open(item.href, '_blank', 'noopener'); return; }
	if (location.hash === item.go) route(); else location.hash = item.go;
	if (item.then) setTimeout(item.then, 600);
}

function openPalette() {
	if (!palette || root.classList.contains('is-signed-out')) return;
	palette.hidden = false;
	requestAnimationFrame(() => palette.classList.add('is-open'));
	paletteInput.value = '';
	searchPalette('');
	paletteInput.focus();
}
function closePalette() {
	if (!palette || palette.hidden) return;
	palette.classList.remove('is-open');
	palette.hidden = true;
}

paletteInput?.addEventListener('input', () => {
	clearTimeout(paletteTimer);
	paletteTimer = setTimeout(() => searchPalette(paletteInput.value), 180);
});
paletteInput?.addEventListener('keydown', (event) => {
	if (event.key === 'ArrowDown') { event.preventDefault(); paletteIndex = Math.min(paletteItems.length - 1, paletteIndex + 1); drawPalette(); }
	else if (event.key === 'ArrowUp') { event.preventDefault(); paletteIndex = Math.max(0, paletteIndex - 1); drawPalette(); }
	else if (event.key === 'Enter') { event.preventDefault(); choose(paletteIndex); }
});
palette?.addEventListener('click', (event) => { if (event.target === palette) closePalette(); });
for (const b of $$('[data-palette-open]')) b.addEventListener('click', openPalette);

document.addEventListener('keydown', (event) => {
	const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
	if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); palette.hidden ? openPalette() : closePalette(); }
	else if (event.key === '/' && !typing) { event.preventDefault(); openPalette(); }
	else if (event.key === 'Escape') {
		if (!palette.hidden) closePalette();
		else if (!more.hidden) closeMore();
		else if (!drawer.hidden) location.hash = mainTab || 'overview';
	}
});

// --- counts on the navigation -------------------------------------------------------------------------------------

async function refreshBadges() {
	try {
		const o = await api('overview');
		const set = (key, n) => { for (const b of $$(`[data-badge="${key}"]`)) { b.hidden = !n; b.textContent = n > 99 ? '99+' : String(n); } };
		set('places', o.counts.pending);
		set('reports', o.flagged.length);
		set('events', o.counts.eventsPending || 0);
		set('more', o.counts.pending + o.flagged.length);
	} catch { /* badges are a courtesy */ }
}

$('[data-admin-refresh]')?.addEventListener('click', async (event) => {
	const button = event.currentTarget;
	button.classList.add('is-spinning');
	refreshing = true;
	try {
		await drawMain(mainTab || 'overview', parse().arg);
		if (!drawer.hidden) { const d = parse(); if (d.detail) await openDetail(d.detail, d.arg); }
		refreshBadges();
		toast('Up to date.');
	} finally {
		refreshing = false;
		button.classList.remove('is-spinning');
	}
});

// --- signing in and out --------------------------------------------------------------------------

function showSignIn() {
	const reason = /signin=([\w-]+)/.exec(location.hash)?.[1];
	if (reason) history.replaceState(history.state, '', location.pathname);
	clearInterval(livePoll);
	closeDetail();
	root.classList.add('is-signed-out');
	view.replaceChildren(element('section', { class: 'admin-signin' }, [
		element('span', { class: 'aa-brand-mark is-large', 'aria-hidden': 'true', text: 'aa' }),
		element('h1', { text: 'All About Nairobi admin' }),
		element('p', { text: 'For the owner of the site only.' }),
		reason ? notice(SIGNIN_ERRORS[reason] || SIGNIN_ERRORS.server) : null,
		element('a', { class: 'admin-button is-primary admin-google', href: '/api/admin?r=login' }, [
			element('span', { 'aria-hidden': 'true', class: 'admin-google-g', text: 'G' }),
			element('span', { text: 'Sign in with Google' }),
		]),
	]));
}

$('[data-sign-out]')?.addEventListener('click', async () => {
	await fetch('/api/admin?r=logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {});
	history.replaceState(history.state, '', location.pathname);
	mainTab = null;
	showSignIn();
});

async function start() {
	let me;
	try {
		if (/signin=/.test(location.hash)) throw new AdminError('', 401, 'auth');
		me = await api('me');
	} catch (error) {
		if (error.code === 'auth') return showSignIn();
		root.classList.add('is-signed-out');
		view.replaceChildren(notice(error.message));
		return;
	}
	root.classList.remove('is-signed-out');
	for (const n of $$('[data-admin-email]')) n.textContent = me.email;
	window.addEventListener('hashchange', route);
	route();
	refreshBadges();
	setInterval(() => { if (!document.hidden) refreshBadges(); }, 5 * 60000);
}

if (root) start();
