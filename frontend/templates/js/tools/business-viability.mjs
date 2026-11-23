// Business viability checker.
//
// Pick a trade and a sub-county, and see how that sub-county ranks for it on
// the 2019 census figures. The number is a ranking against Nairobi's other
// census sub-counties, not a forecast, and the tool says so in three places:
// under the score, in every factor row, and in the report it writes. Ported
// from All About Accra.
//
// The whole breakdown is on screen because a single score with no workings is
// exactly what this site exists to refuse. Somebody who disagrees with the
// weighting should be able to see which factor did it.

import { element, fitHeadings } from '/js/utils/format.mjs';
import { PdfDocument } from '/js/utils/pdf.mjs';
import { BUSINESSES, findBusiness, rankDistricts, scoreDistrict } from '/js/utils/viability.mjs';

const STATS_URL = '/geo/nairobi-map.json';

const integer = (value) => Number(value).toLocaleString('en-GB');

// The census figures shown for the chosen sub-county, as [label, value].
const FIGURES = [
	['People', (d) => integer(d.population)],
	['People per km²', (d) => integer(d.density)],
	['Area', (d) => `${d.areaKm2} km²`],
	['Under 15', (d) => `${d.under15Pct}%`],
	['Aged 20 to 34', (d) => `${d.age20to34Pct}%`],
	['Households renting', (d) => `${d.rentingPct}%`],
	['Households with a computer', (d) => `${d.computerPct}%`],
	['People using the internet', (d) => `${d.internetPct}%`],
	['Homes on piped water', (d) => `${d.pipedPct}%`],
];

class BusinessViability extends HTMLElement {
	async connectedCallback() {
		fitHeadings(this);
		if (this.rendered) return;
		this.rendered = true;

		// Holds the checker's space while the figures load (see .tool.is-loading).
		this.classList.add('is-loading');
		this.replaceChildren(element('p', { class: 'tool-note', text: 'Loading the census figures…' }));

		try {
			const response = await fetch(STATS_URL);
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			const payload = await response.json();
			this.districts = payload.subcounties;
			if (!Array.isArray(this.districts) || !this.districts.length) throw new Error('No sub-counties');
		} catch (error) {
			this.replaceChildren(element('p', { class: 'tool-note' }, [
				element('strong', { text: 'The census figures could not be loaded. ' }),
				document.createTextNode('Every one of them is on the map page instead. '),
				element('a', { href: '/map', text: 'Open the map ➞' }),
			]));
			console.warn('Viability checker:', error);
			this.classList.remove('is-loading');
			return;
		}

		this.state = {
			business: this.businessFromHash() ?? 'kibanda',
			district: this.districts.find((d) => d.id === 'starehe')?.id ?? this.districts[0].id,
		};

		this.build();
		this.update();

		// So a trade guide can link straight to its own trade rather than
		// dropping the reader on a barbershop and hoping they notice the menu.
		window.addEventListener('hashchange', () => {
			const id = this.businessFromHash();
			if (!id || id === this.state.business) return;
			this.state.business = id;
			this.businessSelect.value = id;
			this.update();
		});
	}

	/** `#business=salon`, if it names a trade we actually have. */
	businessFromHash() {
		const match = /^#business=([a-z0-9-]+)$/.exec(window.location.hash);
		return match && findBusiness(match[1]) ? match[1] : null;
	}

	build() {
		const uid = Math.random().toString(36).slice(2, 7);

		// Trades are grouped, because fifteen flat options is a wall.
		const businessSelect = this.businessSelect = element('select', {
			id: `trade-${uid}`,
			onchange: (event) => { this.state.business = event.target.value; this.update(); },
		});
		for (const group of [...new Set(BUSINESSES.map((b) => b.group))]) {
			const optgroup = element('optgroup', { label: group });
			for (const business of BUSINESSES.filter((b) => b.group === group)) {
				const option = element('option', { value: business.id, text: business.name });
				if (business.id === this.state.business) option.selected = true;
				optgroup.append(option);
			}
			businessSelect.append(optgroup);
		}

		const districtSelect = this.districtSelect = element('select', {
			id: `district-${uid}`,
			onchange: (event) => { this.state.district = event.target.value; this.update(); },
		});
		for (const district of [...this.districts].sort((a, b) => a.name.localeCompare(b.name))) {
			const option = element('option', { value: district.id, text: district.name });
			if (district.id === this.state.district) option.selected = true;
			districtSelect.append(option);
		}

		this.output = element('div', { class: 'viability-output' });

		// On a phone the answer runs to several screens, and changing the trade
		// or the district meant scrolling all the way back to the two menus.
		// This keeps what is being checked, and the way to change it, in sight.
		this.bar = element('div', { class: 'viability-bar-sticky', hidden: '' }, [
			element('div', { class: 'viability-bar-text' }, [
				element('strong', { class: 'viability-bar-score' }),
				element('span', { class: 'viability-bar-what' }),
			]),
			element('button', {
				type: 'button', class: 'viability-bar-change', text: 'Change',
				onclick: () => {
					// Focus once the scroll has finished: focusing straight away
					// cancels a smooth scroll in Chrome, and the page stayed put.
					const focus = () => this.districtSelect.focus({ preventScroll: true });
					if ('onscrollend' in window) window.addEventListener('scrollend', focus, { once: true });
					else setTimeout(focus, 600);
					this.form.scrollIntoView({ block: 'start', behavior: 'smooth' });
				},
			}),
		]);

		this.form = element('form', { class: 'viability-form', onsubmit: (event) => event.preventDefault() }, [
			element('h4', { text: 'Check a trade against a sub-county' }),
			element('div', { class: 'viability-controls' }, [
				element('div', { class: 'form-group' }, [
					element('label', { for: `trade-${uid}`, text: 'Business' }),
					element('div', { class: 'input-group' }, [businessSelect]),
				]),
				element('div', { class: 'form-group' }, [
					element('label', { for: `district-${uid}`, text: 'Sub-county' }),
					element('div', { class: 'input-group' }, [districtSelect]),
				]),
			]),
			this.output,
		]);
		this.replaceChildren(this.form, this.bar);
		this.classList.remove('is-loading');
		this.watchBar();
	}

	watchBar() {
		if (!('IntersectionObserver' in window)) return;
		const seen = { controls: true, output: false };
		const controls = this.form.querySelector('.viability-controls');
		const show = () => {
			const narrow = window.matchMedia('(max-width: 40rem)').matches;
			const on = narrow && !seen.controls && seen.output;
			this.bar.hidden = !on;
		};
		// Scrolling is not the only change: a tablet turned on its side crosses
		// the breakpoint with nothing entering or leaving view.
		window.matchMedia('(max-width: 40rem)').addEventListener?.('change', show);
		new IntersectionObserver((entries) => {
			for (const entry of entries) seen.controls = entry.isIntersecting;
			show();
		}).observe(controls);
		new IntersectionObserver((entries) => {
			for (const entry of entries) seen.output = entry.isIntersecting;
			show();
		}, { rootMargin: '0px 0px -20% 0px' }).observe(this.output);
	}

	/** Pick a sub-county from anywhere in the results, and keep the menu honest. */
	pick(id) {
		this.state.district = id;
		// It used to set `select:last-of-type`, which - each select being alone
		// in its own wrapper - was the trade menu. Tapping a top district left
		// the trade blank and the district menu naming the old one.
		this.districtSelect.value = id;
		this.update();
		this.output.querySelector('.viability-score')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
	}

	update() {
		const business = findBusiness(this.state.business);
		const district = this.districts.find((d) => d.id === this.state.district);
		const result = scoreDistrict(business, district, this.districts);
		const ranked = rankDistricts(business, this.districts);
		const position = ranked.findIndex((r) => r.district.id === district.id) + 1;

		this.result = { ...result, position, total: ranked.length, ranked };
		this.bar.querySelector('.viability-bar-score').textContent = `${result.score}/100`;
		this.bar.querySelector('.viability-bar-what').textContent =
			`${business.name} · ${district.name} · ${position} of ${ranked.length}`;

		this.output.replaceChildren(
			this.scoreBlock(result, position, ranked.length),
			this.factorBlock(result),
			this.figuresBlock(district),
			this.blindBlock(business),
			this.bestBlock(ranked, district),
			this.actionsBlock(business, district)
		);
	}

	scoreBlock(result, position, total) {
		return element('div', { class: `viability-score tone-${result.band.tone}` }, [
			element('div', { class: 'viability-number' }, [
				element('strong', { text: String(result.score) }),
				element('span', { class: 'viability-outof', text: '/100' }),
			]),
			element('div', {}, [
				element('p', { class: 'viability-band', text: result.band.label }),
				element('p', {
					class: 'viability-rank',
					text: `${result.district.name} ranks ${position} of ${total} Nairobi sub-counties for this trade.`,
				}),
				this.rankStrip(position, total),
				element('p', { class: 'viability-caveat' }, [
					element('strong', { text: 'This is a ranking, not a forecast. ' }),
					document.createTextNode(
						'It compares census figures across sub-counties. It knows nothing about your street, your rent, your competition or you.'
					),
				]),
			]),
		]);
	}

	/**
	 * Every district as a tick, best on the left, this one marked. "Ranks 17 of
	 * 29" is a sentence to work out; a mark two-thirds along is not.
	 */
	rankStrip(position, total) {
		return element('div', {
			class: 'viability-strip',
			role: 'img',
			'aria-label': `Position ${position} of ${total}, best on the left`,
		}, Array.from({ length: total }, (_, index) =>
			element('span', { class: index + 1 === position ? 'is-here' : '' })
		));
	}

	factorBlock(result) {
		const rows = result.factors.map((factor) =>
			element('li', {}, [
				element('div', { class: 'viability-factor-head' }, [
					element('span', { class: 'viability-factor-label', text: factor.label }),
					element('span', { class: 'viability-factor-weight', text: `weight ${factor.weight}` }),
					element('span', { class: 'viability-factor-percent', text: `${factor.percent}%` }),
				]),
				element('div', { class: 'viability-bar' }, [
					element('span', { class: 'viability-bar-fill', style: `width:${factor.percent}%` }),
				]),
				element('p', { class: 'viability-factor-reading', text: factor.reading }),
			])
		);

		return element('section', { class: 'viability-section' }, [
			element('h5', { text: 'What produced that score' }),
			element('p', { class: 'viability-hint', text: `Each bar is where this sub-county sits among all ${this.districts.length}, on that measure. The weights are our judgement of what the trade needs - argue with them.` }),
			element('ul', { class: 'viability-factors' }, rows),
		]);
	}

	figuresBlock(district) {
		const figures = [
			...FIGURES.map(([label, show]) => [label, show(district)]),
		];

		return element('section', { class: 'viability-section' }, [
			element('h5', { text: `The real figures for ${district.name}` }),
			element('dl', { class: 'viability-figures' },
				figures.map(([label, value]) => element('div', {}, [
					element('dt', { text: label }),
					element('dd', { text: value }),
				]))
			),
			element('p', { class: 'viability-hint' }, [
				document.createTextNode('From the 2019 Kenya Population and Housing Census (KNBS), as published for the census sub-counties. Computer ownership stands in for spending power: the census publishes no incomes at this level. '),
				element('a', { href: `/map#subcounty/${district.id}`, text: 'See it on the map ➞' }),
			]),
		]);
	}

	blindBlock(business) {
		return element('section', { class: 'viability-section viability-blind' }, [
			element('h5', { text: 'What this cannot see' }),
			element('ul', {}, business.blind.map((item) => element('li', { text: item }))),
			element('p', { class: 'viability-hint', text: 'Go and stand on the street at the hour you would be trading. No dataset replaces that.' }),
		]);
	}

	bestBlock(ranked, district) {
		// The whole row is the button, with the score as a bar, so the five
		// compare at a glance and each is a full-width target rather than a
		// 28px underlined name.
		const row = (result, place) =>
			element('li', { class: result.district.id === district.id ? 'is-current' : '' }, [
				element('button', {
					type: 'button',
					class: 'viability-pick',
					// element() writes every attribute it is given, so a null here
					// would read aria-current="null".
					...(result.district.id === district.id ? { 'aria-current': 'true' } : {}),
					onclick: () => this.pick(result.district.id),
				}, [
					element('span', { class: 'viability-place', text: String(place) }),
					element('span', { class: 'viability-pick-name', text: result.district.name }),
					element('span', { class: 'viability-pick-bar', 'aria-hidden': 'true' }, [
						element('span', { style: `width:${result.score}%` }),
					]),
					element('span', { class: 'viability-place-score', text: String(result.score) }),
				]),
			]);

		const rows = ranked.slice(0, 5).map((result, index) => row(result, index + 1));
		const here = ranked.findIndex((r) => r.district.id === district.id);
		// The sub-county being checked, under the top five when it is not in them,
		// so the comparison the reader actually wants is on screen.
		if (here >= 5) {
			rows.push(element('li', { class: 'viability-gap', 'aria-hidden': 'true', text: '…' }));
			rows.push(row(ranked[here], here + 1));
		}

		return element('section', { class: 'viability-section' }, [
			element('h5', { text: 'Sub-counties that rank highest for this trade' }),
			element('ol', { class: 'viability-best' }, rows),
		]);
	}

	actionsBlock(business, district) {
		return element('div', { class: 'viability-actions' }, [
			element('button', {
				type: 'button',
				class: 'viability-download',
				text: 'Download the report (PDF)',
				onclick: () => this.downloadReport(),
			}),
			element('a', { class: 'next-link', href: business.guide, text: `Read the guide: ${business.name} ➞` }),
		]);
	}

	/** Written in the browser. Nothing is uploaded to produce it. */
	downloadReport() {
		const { business, district, score, band, factors, position, total, ranked } = this.result;

		const doc = new PdfDocument({
			title: `${business.name} in ${district.name}`,
			subtitle: 'Screening report from allaboutnairobi.com/tools/business-viability-checker',
			footer: 'allaboutnairobi.com',
		});

		doc.heading('The short answer');
		doc.keyValue('Score out of 100', String(score), { bold: true });
		doc.keyValue('Reading', band.label);
		doc.keyValue('Rank in Nairobi', `${position} of ${total}`);
		doc.text('This score is a ranking of census figures against the other Nairobi sub-counties. It is not a forecast, and it is not advice. It knows nothing about your street, your rent, your competition or you.');
		doc.rule();

		doc.heading('What produced the score');
		doc.text(`Each percentage is where this sub-county sits among all ${total} on that measure. The weight is our judgement of what this trade needs.`);
		for (const factor of factors) {
			doc.bullet(`${factor.label} — ${factor.percent}% (weight ${factor.weight}). ${factor.reading}.`);
		}
		doc.rule();

		doc.heading(`The figures for ${district.name}`);
		for (const [label, show] of FIGURES) doc.keyValue(label.replace('km²', 'sq km'), show(district).replace('km²', 'sq km'));
		doc.text('From the Kenya National Bureau of Statistics 2019 Kenya Population and Housing Census, as published for the census sub-counties. Household computer ownership stands in for spending power: the census publishes no incomes at this level.');
		doc.rule();

		doc.heading('What this report cannot see');
		for (const item of business.blind) doc.bullet(item);
		doc.rule();

		doc.heading('Sub-counties ranking highest for this trade');
		for (const [index, result] of ranked.slice(0, 8).entries()) {
			doc.keyValue(`${index + 1}. ${result.district.name}`, String(result.score));
		}
		doc.rule();

		doc.heading('Before you sign anything');
		doc.bullet('Stand on the street at the hour you would be trading, and count.');
		doc.bullet('Register the business - allaboutnairobi.com/guides/registering-a-business-in-kenya');
		doc.bullet('Get the county business permit - allaboutnairobi.com/guides/nairobi-business-permit');
		doc.bullet('Check which tax fits your turnover - allaboutnairobi.com/tools/turnover-tax-calculator');
		doc.bullet(`Read the trade guide - allaboutnairobi.com${business.guide}`);

		const slug = `${business.id}-${district.id}`;
		doc.download(`viability-${slug}.pdf`);
	}
}

customElements.define('business-viability', BusinessViability);
