// Business viability checker.
//
// Pick a trade and a district, and see how that district ranks for it on the
// 2021 census figures. The number is a ranking against the other 28 Greater
// Accra assemblies, not a forecast, and the tool says so in three places:
// under the score, in every factor row, and in the report it writes.
//
// The whole breakdown is on screen because a single score with no workings is
// exactly what this site exists to refuse. Somebody who disagrees with the
// weighting should be able to see which factor did it.

import { element } from '/js/utils/format.mjs';
import { PdfDocument } from '/js/utils/pdf.mjs';
import { BUSINESSES, findBusiness, rankDistricts, scoreDistrict } from '/js/utils/viability.mjs';

const STATS_URL = '/geo/district-stats.json';

const integer = (value) => Number(value).toLocaleString('en-GB');
const RENT_BANDS = ['', 'lowest', 'below median', 'around the median', 'above median', 'highest'];

class BusinessViability extends HTMLElement {
	async connectedCallback() {
		if (this.rendered) return;
		this.rendered = true;

		this.replaceChildren(element('p', { class: 'tool-note', text: 'Loading district figures…' }));

		try {
			const response = await fetch(STATS_URL);
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			const payload = await response.json();
			this.districts = payload.districts;
			this.meta = payload.meta;
		} catch (error) {
			this.replaceChildren(element('p', { class: 'tool-note' }, [
				element('strong', { text: 'The district figures could not be loaded. ' }),
				document.createTextNode('Every one of them is on the map page instead. '),
				element('a', { href: '/map', text: 'Open the map ➞' }),
			]));
			console.warn('Viability checker:', error);
			return;
		}

		this.state = {
			business: this.businessFromHash() ?? 'barbershop',
			district: this.districts.find((d) => d.id === 'accra-metropolitan')?.id ?? this.districts[0].id,
		};

		this.build();
		this.update();

		// So a trade guide can link straight to its own trade rather than
		// dropping the reader on a barbershop and hoping they notice the menu.
		window.addEventListener('hashchange', () => {
			const id = this.businessFromHash();
			if (!id || id === this.state.business) return;
			this.state.business = id;
			this.querySelector('select').value = id;
			this.update();
		});
	}

	/** `#business=hair-salon`, if it names a trade we actually have. */
	businessFromHash() {
		const match = /^#business=([a-z0-9-]+)$/.exec(window.location.hash);
		return match && findBusiness(match[1]) ? match[1] : null;
	}

	build() {
		const uid = Math.random().toString(36).slice(2, 7);

		// Trades are grouped, because thirteen flat options is a wall.
		const businessSelect = element('select', {
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

		const districtSelect = element('select', {
			id: `district-${uid}`,
			onchange: (event) => { this.state.district = event.target.value; this.update(); },
		});
		for (const district of [...this.districts].sort((a, b) => a.name.localeCompare(b.name))) {
			const option = element('option', { value: district.id, text: district.name });
			if (district.id === this.state.district) option.selected = true;
			districtSelect.append(option);
		}

		this.output = element('div', { class: 'viability-output' });

		this.replaceChildren(element('form', { onsubmit: (event) => event.preventDefault() }, [
			element('h4', { text: 'Check a trade against a district' }),
			element('div', { class: 'viability-controls' }, [
				element('div', { class: 'form-group' }, [
					element('label', { for: `trade-${uid}`, text: 'Business' }),
					element('div', { class: 'input-group' }, [businessSelect]),
				]),
				element('div', { class: 'form-group' }, [
					element('label', { for: `district-${uid}`, text: 'District assembly' }),
					element('div', { class: 'input-group' }, [districtSelect]),
				]),
			]),
			this.output,
		]));
	}

	update() {
		const business = findBusiness(this.state.business);
		const district = this.districts.find((d) => d.id === this.state.district);
		const result = scoreDistrict(business, district, this.districts);
		const ranked = rankDistricts(business, this.districts);
		const position = ranked.findIndex((r) => r.district.id === district.id) + 1;

		this.result = { ...result, position, total: ranked.length, ranked };

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
					text: `${result.district.name} ranks ${position} of ${total} Greater Accra districts for a ${result.business.name.toLowerCase()}.`,
				}),
				element('p', { class: 'viability-caveat' }, [
					element('strong', { text: 'This is a ranking, not a forecast. ' }),
					document.createTextNode(
						'It compares census figures across districts. It knows nothing about your street, your rent, your competition or you.'
					),
				]),
			]),
		]);
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
			element('p', { class: 'viability-hint', text: 'Each bar is where this district sits among all 29, on that measure. The weights are our judgement of what the trade needs — argue with them.' }),
			element('ul', { class: 'viability-factors' }, rows),
		]);
	}

	figuresBlock(district) {
		const figures = [
			['People', integer(district.population)],
			['People per km²', integer(district.peoplePerKm2)],
			['Area', `${district.areaKm2} km²`],
			['Under 15', `${district.under15Pct}%`],
			['In the labour force', `${district.participationPct}%`],
			['Informally employed', `${district.informalPct}%`],
			['Unemployed', `${district.unemploymentPct}%`],
			['Typical rents', RENT_BANDS[district.rent] ?? 'unknown'],
		];

		return element('section', { class: 'viability-section' }, [
			element('h5', { text: `The real figures for ${district.name}` }),
			element('dl', { class: 'viability-figures' },
				figures.flatMap(([label, value]) => [
					element('dt', { text: label }),
					element('dd', { text: value }),
				])
			),
			element('p', { class: 'viability-hint' }, [
				document.createTextNode('Counts from the 2021 census, as published. Rent is an ordinal band, not a cedi figure — Ghana publishes none at this level. '),
				element('a', { href: `/map#district=${district.id}`, text: 'See it on the map ➞' }),
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
		const rows = ranked.slice(0, 5).map((result, index) =>
			element('li', { class: result.district.id === district.id ? 'is-current' : '' }, [
				element('span', { class: 'viability-place', text: String(index + 1) }),
				element('button', {
					type: 'button',
					class: 'viability-pick',
					text: result.district.name,
					onclick: () => {
						this.state.district = result.district.id;
						this.querySelector('select:last-of-type').value = result.district.id;
						this.update();
					},
				}),
				element('span', { class: 'viability-place-score', text: String(result.score) }),
			])
		);

		return element('section', { class: 'viability-section' }, [
			element('h5', { text: 'Districts that rank highest for this trade' }),
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
			element('a', { class: 'next-link', href: business.guide, text: `How to start a ${business.name.toLowerCase()} ➞` }),
		]);
	}

	/** Written in the browser. Nothing is uploaded to produce it. */
	downloadReport() {
		const { business, district, score, band, factors, position, total, ranked } = this.result;

		const doc = new PdfDocument({
			title: `${business.name} in ${district.name}`,
			subtitle: 'Screening report from allaboutaccra.com/tools/business-viability-checker',
			footer: 'allaboutaccra.com',
		});

		doc.heading('The short answer');
		doc.keyValue('Score out of 100', String(score), { bold: true });
		doc.keyValue('Reading', band.label);
		doc.keyValue('Rank in Greater Accra', `${position} of ${total}`);
		doc.text('This score is a ranking of census figures against the other Greater Accra districts. It is not a forecast, and it is not advice. It knows nothing about your street, your rent, your competition or you.');
		doc.rule();

		doc.heading('What produced the score');
		doc.text('Each percentage is where this district sits among all 29 assemblies on that measure. The weight is our judgement of what this trade needs.');
		for (const factor of factors) {
			doc.bullet(`${factor.label} — ${factor.percent}% (weight ${factor.weight}). ${factor.reading}.`);
		}
		doc.rule();

		doc.heading(`The figures for ${district.name}`);
		doc.keyValue('People', integer(district.population));
		doc.keyValue('People per sq km', integer(district.peoplePerKm2));
		doc.keyValue('Area', `${district.areaKm2} sq km`);
		doc.keyValue('Under 15', `${district.under15Pct}%`);
		doc.keyValue('In the labour force', `${district.participationPct}%`);
		doc.keyValue('Informally employed', `${district.informalPct}%`);
		doc.keyValue('Unemployed', `${district.unemploymentPct}%`);
		doc.keyValue('Typical rents', RENT_BANDS[district.rent] ?? 'unknown');
		doc.text('Counts from the Ghana Statistical Service 2021 Population and Housing Census, as published. Rent is a five-way ordinal band from listing observation, not a cedi figure: Ghana publishes none at district level.');
		doc.rule();

		doc.heading('What this report cannot see');
		for (const item of business.blind) doc.bullet(item);
		doc.rule();

		doc.heading('Districts ranking highest for this trade');
		for (const [index, result] of ranked.slice(0, 8).entries()) {
			doc.keyValue(`${index + 1}. ${result.district.name}`, String(result.score));
		}
		doc.rule();

		doc.heading('Before you sign anything');
		doc.bullet('Stand on the street at the hour you would be trading, and count.');
		doc.bullet('Register the business, and get a TIN — allaboutaccra.com/guides/register-a-business');
		doc.bullet('Work out the rent advance you will be asked for — allaboutaccra.com/tools/rent-advance-calculator');
		doc.bullet('Check whether you will cross the VAT threshold — allaboutaccra.com/guides/vat-in-ghana');
		doc.bullet(`Read the trade guide — allaboutaccra.com${business.guide}`);

		const slug = `${business.id}-${district.id}`;
		doc.download(`viability-${slug}.pdf`);
	}
}

customElements.define('business-viability', BusinessViability);
