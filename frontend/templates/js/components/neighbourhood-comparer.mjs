// The neighbourhood comparer: two Nairobi neighbourhoods side by side, from
// the map's own data, joined at build time (extensions/context_processors/
// compare.py).
//
// The figures come at three sizes, and the page says which:
//   - the neighbourhood itself: its rent band and its distances, measured from
//     its own point on the map;
//   - its constituency (17): the crowding estimate and relative wealth;
//   - its census sub-county (11): homes, water, cooking, internet and age.
// Two neighbourhoods in the same constituency or sub-county share those
// figures, and the comparer says so rather than showing them as twins.
//
// The data is in the page, so nothing is fetched. The choice is kept in the
// address as #a=...&b=..., so a comparison can be shared.

const DEFAULTS = ['kilimani', 'westlands'];

const fmt = new Intl.NumberFormat('en-GB');

function ordinal(n) {
	const s = ['th', 'st', 'nd', 'rd'];
	const v = n % 100;
	return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// A rank reads from whichever end is nearer: "3rd least crowded", not "15th
// most crowded". Both ends come from the build, so ties share a rank.
function rankText(rank, most, least, of) {
	if (!rank) return '';
	const [high, low] = rank;
	const [n, word] = high <= low ? [high, most] : [low, least];
	return n === 1 ? `The ${word} of ${of}` : `${ordinal(n)} ${word} of ${of}`;
}

function el(tag, attrs = {}, children = []) {
	const node = document.createElement(tag);
	for (const [k, v] of Object.entries(attrs)) {
		if (k === 'class') node.className = v;
		else if (k === 'text') node.textContent = v;
		else node.setAttribute(k, v);
	}
	for (const child of [].concat(children)) if (child != null && child !== false) node.append(child);
	return node;
}

function list(parts) {
	return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0];
}

export default function initializeNeighbourhoodComparer() {
	const root = document.querySelector('[data-compare]');
	if (!root || root.dataset.ready) return;
	root.dataset.ready = 'true';

	const data = JSON.parse(root.querySelector('[data-nbc-data]').textContent);
	const places = new Map(data.places.map((p) => [p.key, p]));
	const constituencies = new Map(data.constituencies.map((c) => [c.id, c]));
	const subcounties = new Map(data.subcounties.map((s) => [s.id, s]));
	const selects = {
		a: root.querySelector('[data-nbc-select="a"]'),
		b: root.querySelector('[data-nbc-select="b"]'),
	};
	const out = root.querySelector('[data-nbc-out]');
	root.querySelector('[data-nbc-pick]').hidden = false;
	root.classList.add('is-enhanced');

	const nPlaces = data.places.length;
	const nCon = data.constituencies.length;
	const nSub = data.subcounties.length;

	// A neighbourhood with everything it is measured by.
	function resolve(key) {
		const place = places.get(key);
		if (!place) return null;
		return { ...place, con: constituencies.get(place.constituency), sub: subcounties.get(place.subcounty) };
	}

	function fromHash() {
		const params = new URLSearchParams(location.hash.slice(1));
		return [params.get('a'), params.get('b')];
	}

	// Where a value falls in its set, 0 to 1, by rank, so a field that spans
	// orders of magnitude (crowding) spreads as evenly as a percentage. Ties
	// share the middle of their run.
	function position(values, value) {
		const all = values.filter((v) => v != null);
		const below = all.filter((v) => v < value).length;
		const equal = all.filter((v) => v === value).length;
		return all.length > 1 ? (below + (equal - 1) / 2) / (all.length - 1) : 0.5;
	}

	// One line for both places: A's marker above it, B's below, so the two
	// never cover each other, and the two ends say which way is which.
	function strip(values, va, vb, low, high, of) {
		const pins = [[va, 'a'], [vb, 'b']].map(([v, side]) => {
			const pct = Math.round(position(values, v) * 1000) / 10;
			return el('span', { class: `nbc-pin nbc-pin-${side}`, style: `left:${pct}%` }, [el('span', { text: side.toUpperCase() })]);
		});
		return el('div', { class: 'nbc-strip', 'aria-hidden': 'true' }, [
			el('div', { class: 'nbc-track', style: `--nbc-steps:${Math.max(values.length - 1, 1)}` }, pins),
			el('div', { class: 'nbc-ends' }, [el('span', { text: low }), el('span', { text: of }), el('span', { text: high })]),
		]);
	}

	function dots(band) {
		return el('span', { class: 'nbc-dots', 'aria-hidden': 'true' },
			[1, 2, 3, 4, 5].map((n) => el('span', { class: n <= band ? 'is-on' : '' })));
	}

	// One row: a label, each side's value and detail, then what spans both -
	// the strip and any note.
	function row(label, cells, { visual = null, note = null } = {}) {
		return el('div', { class: 'nbc-row', role: 'row' }, [
			el('div', { class: 'nbc-label', role: 'rowheader', text: label }),
			...cells.map((c, i) => el('div', { class: `nbc-cell nbc-cell-${i ? 'b' : 'a'}`, role: 'cell' }, [
				el('strong', { class: 'nbc-value' }, c.value),
				c.visual || null,
				c.detail ? el('span', { class: 'nbc-detail', text: c.detail }) : null,
			])),
			visual ? el('div', { class: 'nbc-span' }, visual) : null,
			note ? el('p', { class: 'nbc-note', text: note }) : null,
		]);
	}

	function group(title, rows) {
		return el('div', { class: 'nbc-group', role: 'rowgroup' }, [
			el('div', { class: 'nbc-group-title', role: 'row' }, [el('span', { role: 'columnheader', text: title })]),
			...rows,
		]);
	}

	// A census row: a sub-county share, its rank of 11 and a strip.
	function censusRow(A, B, label, field, [most, least], [low, high], format, note) {
		const values = data.subcounties.map((s) => s[field]);
		return row(label, [A, B].map((p) => ({
			value: format(p.sub[field]),
			detail: rankText(p.sub.rank[field], most, least, nSub),
		})), { visual: strip(values, A.sub[field], B.sub[field], low, high, `of ${nSub} sub-counties`), note });
	}

	// One sentence that says what the rows add up to.
	function summary(A, B) {
		const parts = [];
		if (A.rent && B.rent && A.rent !== B.rent) parts.push(A.rent > B.rent ? 'dearer to rent in' : 'cheaper to rent in');
		if (Math.abs(A.km.cbd - B.km.cbd) >= 1.5) parts.push(A.km.cbd < B.km.cbd ? 'nearer the CBD' : 'further from the CBD');
		if (A.con.id !== B.con.id) {
			const da = A.con.density;
			const db = B.con.density;
			if (da && db && Math.abs(da - db) / Math.max(da, db) > 0.2) parts.push(da > db ? 'more crowded' : 'less crowded');
		}
		if (Math.abs(A.km.jkia - B.km.jkia) >= 3) parts.push(A.km.jkia < B.km.jkia ? 'nearer the airport' : 'further from the airport');
		if (!parts.length) return `${A.name} and ${B.name} look much alike on these figures.`;
		return `${A.name} is ${list(parts)} than ${B.name}.`;
	}

	// The four questions people bring, each answered with a name. Lower wins
	// on every one; a tie says so rather than picking.
	function verdicts(A, B) {
		const sameCon = A.con.id === B.con.id;
		const tiles = [
			['Cheaper rent', A.rent, B.rent, (p) => (p.rent ? `band ${p.rent}` : 'no band'), ''],
			['Nearer the CBD', A.km.cbd, B.km.cbd, (p) => p.km.cbd, ' km'],
			['Nearer JKIA', A.km.jkia, B.km.jkia, (p) => p.km.jkia, ' km'],
			['Less crowded', sameCon ? 0 : A.con.density, sameCon ? 0 : B.con.density, (p) => fmt.format(p.con.density), ' a km²'],
		];
		return el('div', { class: 'nbc-verdicts' }, tiles.map(([label, va, vb, say, unit]) => {
			const unknown = va == null || vb == null;
			const tie = unknown || va === vb;
			const side = tie ? null : (va < vb ? 'a' : 'b');
			const win = side === 'a' ? A : B;
			const lose = side === 'a' ? B : A;
			let detail;
			if (unknown) detail = `No rent band for ${[A, B].filter((p) => !p.rent).map((p) => p.name).join(' or ')}`;
			else if (tie) detail = label === 'Less crowded' && sameCon ? 'Same constituency' : `${say(A)}${unit} each`;
			else detail = `${say(win)} against ${say(lose)}${unit}`;
			return el('div', { class: `nbc-verdict${side ? ` is-${side}` : ' is-tie'}` }, [
				el('span', { class: 'nbc-verdict-label', text: label }),
				el('strong', { class: 'nbc-verdict-name', text: unknown ? 'Unknown' : (tie ? 'Level' : win.name) }),
				el('span', { class: 'nbc-verdict-detail', text: detail }),
			]);
		}));
	}

	function draw({ initial = false } = {}) {
		const A = resolve(selects.a.value);
		const B = resolve(selects.b.value);
		if (!A || !B) return;
		const pair = [A, B];
		const same = A.key === B.key;
		const sameCon = A.con.id === B.con.id;
		const sameSub = A.sub.id === B.sub.id;

		// On arrival, leave an anchor that is not ours (#every-neighbourhood) alone.
		if (!initial || !location.hash || location.hash.startsWith('#a=')) {
			history.replaceState(history.state, '', `#a=${A.key}&b=${B.key}`);
		}

		const head = el('div', { class: 'nbc-head', role: 'row' }, [
			el('div', { class: 'nbc-label', role: 'columnheader' }),
			...pair.map((p, i) => el('div', { class: `nbc-cell nbc-cell-${i ? 'b' : 'a'}`, role: 'columnheader' }, [
				el('strong', { class: 'nbc-name' }, [el('span', { class: `nbc-key nbc-key-${i ? 'b' : 'a'}`, 'aria-hidden': 'true', text: i ? 'B' : 'A' }), p.name]),
				el('span', { class: 'nbc-detail', text: `${p.con.name} constituency` }),
			])),
		]);

		const placeKm = (key) => data.places.map((p) => p.km[key]);
		const living = group('Rent and wealth', [
			row('Rent', pair.map((p) => ({
				value: p.rent ? data.bands[p.rent].label : 'No band yet',
				visual: p.rent ? dots(p.rent) : null,
				detail: p.rent ? data.bands[p.rent].note : 'Not enough listings to place it',
			})), { note: 'An indicative band from 2026 rental listings, for this neighbourhood - a judgement, not a measurement. Inside a neighbourhood rents vary more than between bands.' }),
			row('Relative wealth', pair.map((p) => ({
				value: rankText(p.con.rank.rwi, 'wealthiest', 'least wealthy', nCon),
				detail: `${p.con.name} constituency`,
			})), {
				visual: strip(data.constituencies.map((c) => c.rwi), A.con.rwi, B.con.rwi, 'Least wealthy', 'Wealthiest', `of ${nCon} constituencies`),
				note: "Meta's Relative Wealth Index, modelled from satellite and phone data. A ranking, not an income.",
			}),
		]);

		const distance = group('Getting about', [
			['To the CBD', 'cbd'], ['To JKIA', 'jkia'], [`To ${data.anchors.westlands}`, 'westlands'],
		].map(([label, key], i, all) => row(label, pair.map((p) => ({ value: `${p.km[key]} km` })), {
			visual: strip(placeKm(key), A.km[key], B.km[key], 'Nearest', 'Furthest', `of ${nPlaces} neighbourhoods`),
			note: i === all.length - 1 ? 'In a straight line from the neighbourhood\'s point on the map. By road it is further, and in traffic much longer - try the trip at the hour you would make it.' : null,
		})));

		const crowding = group('Crowding', [
			row('People per km²', pair.map((p) => ({
				value: fmt.format(p.con.density),
				detail: rankText(p.con.rank.density, 'most crowded', 'least crowded', nCon),
			})), {
				visual: strip(data.constituencies.map((c) => c.density), A.con.density, B.con.density, 'Least crowded', 'Most crowded', `of ${nCon} constituencies`),
				note: 'WorldPop\'s 2020 estimate for the whole constituency, rounded. Large constituencies like Lang\'ata and Kasarani include parkland and open ground, so their homes are more crowded than this.',
			}),
		]);

		const pct = (n) => `${n}%`;
		const homes = group(`Homes, 2019 census${sameSub ? ` - both in ${A.sub.name}` : ''}`, [
			censusRow(A, B, 'Renting', 'rentingPct', ['most renting', 'least renting'], ['Fewest', 'Most'], pct, 'Share of households renting rather than owning.'),
			censusRow(A, B, 'People per household', 'householdSize', ['largest', 'smallest'], ['Smallest', 'Largest'], (n) => n.toFixed(1)),
			censusRow(A, B, 'Piped water at home', 'pipedPct', ['most', 'fewest'], ['Fewest', 'Most'], pct, 'Piped into the home, yard or plot.'),
			censusRow(A, B, 'On the main sewer', 'sewerPct', ['most', 'fewest'], ['Fewest', 'Most'], pct),
			censusRow(A, B, 'Cooking with gas or electricity', 'cleanCookingPct', ['most', 'fewest'], ['Fewest', 'Most'], pct),
			censusRow(A, B, 'Using the internet', 'internetPct', ['most online', 'least online'], ['Fewest', 'Most'], pct, 'People aged 3 and over.'),
		]);

		const people = group('Who lives there, 2019 census', [
			censusRow(A, B, 'Children under 15', 'under15Pct', ['most', 'fewest'], ['Fewest', 'Most'], pct),
			censusRow(A, B, 'Aged 20 to 34', 'age20to34Pct', ['most', 'fewest'], ['Fewest', 'Most'], pct),
			censusRow(A, B, 'Aged 65 and over', 'over64Pct', ['most', 'fewest'], ['Fewest', 'Most'], pct),
		]);

		const notes = [];
		if (same) {
			notes.push(el('p', { class: 'nbc-same' }, [el('strong', { text: 'That is the same neighbourhood twice. ' }), 'Pick another for one side.']));
		} else if (sameSub) {
			notes.push(el('p', { class: 'nbc-same' }, [
				el('strong', { text: `Both are in the census's ${A.sub.name} sub-county. ` }),
				`The census is published by sub-county, so its rows are the same for the two. ${sameCon ? `They share ${A.con.name} constituency too, so the crowding and wealth rows match as well. ` : ''}What tells them apart here is the rent band and the distances - and on the ground, a visit.`,
			]));
		} else if (sameCon) {
			notes.push(el('p', { class: 'nbc-same' }, [
				el('strong', { text: `Both are in ${A.con.name} constituency, ` }),
				'so the crowding and wealth rows are the same for the two.',
			]));
		}

		const said = same ? null : summary(A, B);
		const links = [];
		pair.forEach((p, i) => {
			if (p.guide && !links.some((l) => l.href === p.guide)) links.push({ href: p.guide, kind: 'Guide', text: `Living in ${p.name}`, side: i ? 'b' : 'a' });
		});
		pair.forEach((p, i) => {
			if (i && same) return;
			links.push({ href: `/map${p.map}`, kind: 'Map', text: `${p.name} on the map`, side: i ? 'b' : 'a' });
		});

		out.replaceChildren(
			said ? el('div', { class: 'nbc-glance' }, [el('p', { class: 'nbc-summary', text: said }), verdicts(A, B)]) : null,
			...notes,
			el('div', { class: 'nbc-grid', role: 'table', 'aria-label': `${A.name} and ${B.name} compared` }, [head, living, distance, crowding, homes, people]),
			el('ul', { class: 'nbc-links' }, links.map((l) => el('li', {}, [
				el('a', { href: l.href, class: `nbc-link is-${l.side}` }, [el('span', { class: 'nbc-link-kind', text: l.kind }), el('span', { text: l.text })]),
			]))),
		);
	}

	const [ha, hb] = fromHash();
	selects.a.value = resolve(ha) ? ha : DEFAULTS[0];
	selects.b.value = resolve(hb) ? hb : DEFAULTS[1];

	selects.a.addEventListener('change', () => draw());
	selects.b.addEventListener('change', () => draw());
	root.querySelector('[data-nbc-swap]').addEventListener('click', () => {
		[selects.a.value, selects.b.value] = [selects.b.value, selects.a.value];
		draw();
	});
	window.addEventListener('hashchange', () => {
		const [na, nb] = fromHash();
		if (resolve(na) && resolve(nb) && (na !== selects.a.value || nb !== selects.b.value)) {
			selects.a.value = na;
			selects.b.value = nb;
			draw();
		}
	});
	draw({ initial: true });
}
