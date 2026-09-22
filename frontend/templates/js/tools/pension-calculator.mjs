// Ghana pension calculator.
//
// Answers the two questions people actually search for, which are different
// questions and usually get conflated:
//
//   "What is coming out of my pay?"  - the 5.5% employee share, the 13% the
//   employer adds, how the 18.5% splits between Tier 1 and Tier 2, and what a
//   voluntary Tier 3 contribution costs after tax relief.
//
//   "What will SSNIT pay me?"  - the best-36 average times a pension right
//   that grows with your record, cut by an age factor if you go before 60.
//
// The honest limit is stated on screen rather than in a footnote: the pension
// is computed from the best 36 months of contribution salary at retirement,
// and a calculator can only be given today's salary. So the answer is in
// today's money, and it is not a SSNIT quotation.

import { cedis, element, parseAmount } from '/js/utils/format.mjs';
import { netPay, pensionContributions, ssnitPension } from '/js/utils/tax.mjs';

class PensionCalculator extends HTMLElement {
	connectedCallback() {
		if (this.rendered) return;
		this.rendered = true;

		const c = window.accraConstants || {};
		this.state = {
			basic: 4000,
			years: 20,
			age: c.SSNIT_PENSION_AGE || 60,
			tier3Rate: 0,
		};

		this.replaceChildren();
		this.build();
		this.update();
	}

	field(uid, label, hint, control) {
		return element('div', { class: 'form-group' }, [
			element('label', { for: uid }, [
				document.createTextNode(label),
				hint ? element('small', { class: 'form-hint', text: hint }) : null,
			]),
			element('div', { class: 'input-group' }, [control]),
		]);
	}

	build() {
		const c = window.accraConstants || {};
		const uid = Math.random().toString(36).slice(2, 7);
		const minYears = c.SSNIT_MIN_CONTRIBUTION_YEARS || 15;
		const maxYears = c.SSNIT_MAX_CONTRIBUTION_YEARS || 35;
		const earlyAge = c.SSNIT_EARLY_PENSION_AGE || 55;
		const fullAge = c.SSNIT_PENSION_AGE || 60;
		const tier3Cap = c.TIER_3_MAX_RELIEF_RATE || 16.5;

		const basic = element('input', {
			id: `basic-${uid}`,
			type: 'text',
			inputmode: 'decimal',
			value: String(this.state.basic),
			'data-clarity-mask': 'true',
			oninput: (event) => {
				this.state.basic = parseAmount(event.target.value);
				this.update();
			},
		});

		const years = element('input', {
			id: `years-${uid}`,
			type: 'number',
			min: '0',
			max: '50',
			step: '1',
			value: String(this.state.years),
			oninput: (event) => {
				this.state.years = Math.max(0, parseInt(event.target.value, 10) || 0);
				this.update();
			},
		});

		const age = element('select', {
			id: `age-${uid}`,
			onchange: (event) => {
				this.state.age = parseInt(event.target.value, 10);
				this.update();
			},
		});
		for (let a = earlyAge; a <= fullAge; a += 1) {
			const option = element('option', {
				value: String(a),
				text: a === fullAge ? `${a} - full pension` : `${a} - reduced`,
			});
			if (a === this.state.age) option.selected = true;
			age.append(option);
		}

		const tier3 = element('input', {
			id: `tier3-${uid}`,
			type: 'number',
			min: '0',
			max: String(tier3Cap),
			step: '0.5',
			value: String(this.state.tier3Rate),
			oninput: (event) => {
				this.state.tier3Rate = Math.max(0, parseFloat(event.target.value) || 0);
				this.update();
			},
		});

		const form = element('form', {}, [
			element('h4', { text: 'Your contributions and your pension' }),
			element('p', {
				class: 'input-instructions',
				text: 'Basic salary only - SSNIT is charged on basic pay, not on allowances.',
			}),
			this.field(`basic-${uid}`, 'Monthly basic salary (₵)', null, basic),
			this.field(
				`years-${uid}`,
				'Years contributed by the time you retire',
				`${minYears} is the minimum for any pension; ${maxYears} reaches the ceiling`,
				years
			),
			this.field(`age-${uid}`, 'Age you take the pension', null, age),
			this.field(
				`tier3-${uid}`,
				'Voluntary Tier 3 (% of basic)',
				`Up to ${tier3Cap}% is deducted before tax`,
				tier3
			),
		]);

		form.addEventListener('submit', (event) => event.preventDefault());

		this.results = element('div', {
			class: 'tool-results',
			role: 'status',
			'aria-live': 'polite',
		});

		this.append(form, this.results);
	}

	update() {
		const c = window.accraConstants || {};
		const { basic, years, age, tier3Rate } = this.state;

		const contributions = pensionContributions({ basic, tier3Rate });
		const pension = ssnitPension({
			averageSalary: basic,
			yearsContributed: years,
			retirementAge: age,
		});

		// What Tier 3 really costs: the contribution less the PAYE it saves.
		const without = netPay({ basic });
		const with3 = netPay({ basic, tier3: contributions.tier3 });
		const taxSaved = Math.max(0, without.paye - with3.paye);
		const netCost = Math.max(0, contributions.tier3 - taxSaved);

		this.results.replaceChildren();

		this.results.append(
			element('div', { class: 'tool-headline' }, [
				element('span', {
					class: 'tool-headline-value',
					text: pension.qualifies ? `${cedis(pension.pension)}` : 'No pension',
				}),
				element('span', {
					class: 'tool-headline-label',
					text: pension.qualifies
						? `a month from SSNIT, in today's money, at ${age}`
						: `${pension.minYears} years of contributions is the minimum for a pension`,
				}),
			])
		);

		const row = (label, value, className = '') =>
			element('tr', { class: className }, [
				element('th', { scope: 'row', text: label }),
				element('td', { text: value }),
			]);

		// ---- the pension
		if (pension.qualifies) {
			const rows = [
				row(`Best-${c.SSNIT_BEST_MONTHS || 36}-months average used`, `${cedis(basic)}`),
				row('Pension right earned', `${pension.pensionRight}%`),
			];
			if (pension.reduced) {
				rows.push(row(`Full pension at ${c.SSNIT_PENSION_AGE || 60}`, `${cedis(pension.fullPension)}`));
				rows.push(row(`Reduction for retiring at ${age}`, `paid at ${pension.ageFactor}%`));
			}
			rows.push(row('Monthly pension', `${cedis(pension.pension)}`, 'total'));
			rows.push(row('As a share of your salary', `${pension.replacementRate.toFixed(1)}%`));

			this.results.append(
				element('h5', { class: 'tool-section-heading', text: 'What SSNIT would pay' }),
				element('div', { class: 'table-wrapper' }, [
					element('table', { class: 'tool-breakdown' }, [element('tbody', {}, rows)]),
				])
			);

			if (pension.atCeiling) {
				this.results.append(
					element('p', {
						class: 'tool-note',
						text:
							`You are at the ${c.SSNIT_PENSION_RIGHT_MAX || 60}% ceiling. Contributing beyond ` +
							`${c.SSNIT_MAX_CONTRIBUTION_YEARS || 35} years does not raise the pension right any ` +
							'further, though a higher salary in your best 36 months still would.',
					})
				);
			} else {
				this.results.append(
					element('p', {
						class: 'tool-note',
						text:
							`Each further year adds ${c.SSNIT_PENSION_RIGHT_PER_YEAR || 1.125} percentage ` +
							`points to the pension right. ${pension.yearsToCeiling} more would reach the ` +
							`${c.SSNIT_PENSION_RIGHT_MAX || 60}% ceiling.`,
					})
				);
			}

			if (pension.reduced) {
				this.results.append(
					element('p', {
						class: 'tool-note',
						text:
							`Taking it at ${age} is a permanent cut, not an advance. The ${pension.ageFactor}% ` +
							'does not go back up when you reach 60.',
					})
				);
			}
		} else {
			this.results.append(
				element('p', {
					class: 'tool-note',
					text:
						`With fewer than ${pension.minYears} years of contributions there is no monthly ` +
						'pension. SSNIT instead refunds your own contributions as a lump sum, which is ' +
						'worth far less than the pension it replaces.',
				})
			);
		}

		// ---- the contributions
		this.results.append(
			element('h5', { class: 'tool-section-heading', text: 'What goes in every month' }),
			element('div', { class: 'table-wrapper' }, [
				element('table', { class: 'tool-breakdown' }, [
					element('tbody', {}, [
						row(`Your share (${c.SSNIT_EMPLOYEE_RATE || 5.5}% of basic)`, `${cedis(contributions.employee)}`),
						row(`Employer's share (${c.SSNIT_EMPLOYER_RATE || 13}%)`, `${cedis(contributions.employer)}`),
						row(`Tier 1, to SSNIT (${c.TIER_1_RATE || 13.5}%)`, `${cedis(contributions.tier1)}`),
						row(`Tier 2, your own fund (${c.TIER_2_RATE || 5}%)`, `${cedis(contributions.tier2)}`),
						row('Total into the two mandatory tiers', `${cedis(contributions.total)}`, 'total'),
					]),
				]),
			]),
			element('p', {
				class: 'tool-note',
				text:
					`Only the ${c.SSNIT_EMPLOYEE_RATE || 5.5}% leaves your payslip. The ` +
					`${c.SSNIT_EMPLOYER_RATE || 13}% is paid on top of your salary by the employer, so the ` +
					'real cost of employing you is higher than your gross.',
			})
		);

		// ---- tier 3
		if (contributions.tier3 > 0) {
			this.results.append(
				element('h5', { class: 'tool-section-heading', text: 'Your voluntary Tier 3' }),
				element('div', { class: 'table-wrapper' }, [
					element('table', { class: 'tool-breakdown' }, [
						element('tbody', {}, [
							row('You contribute', `${cedis(contributions.tier3)}`),
							row('PAYE it saves you', `${cedis(taxSaved)}`),
							row('What it actually costs you', `${cedis(netCost)}`, 'total'),
						]),
					]),
				]),
				element('p', {
					class: 'tool-note',
					text:
						contributions.tier3 > contributions.tier3Deductible
							? `Only ${cedis(contributions.tier3Deductible)} of that is deductible - the cap is ` +
								`${c.TIER_3_MAX_RELIEF_RATE || 16.5}% of basic salary. The rest is still saving, ` +
								'it simply gets no relief.'
							: `Every cedi of it is deducted before PAYE, so ${cedis(contributions.tier3)} of ` +
								`saving costs you ${cedis(netCost)}.`,
				})
			);
		}

		this.results.append(
			element('p', {
				class: 'tool-note',
				text:
					'This is an estimate in today’s money, not a SSNIT quotation. SSNIT uses the best ' +
					`${c.SSNIT_BEST_MONTHS || 36} months of your actual contribution record at retirement, ` +
					'which for most people is higher than today’s salary in cedis and lower after ' +
					'inflation. Check your real record on the SSNIT self-service portal.',
			})
		);
	}
}

customElements.define('pension-calculator', PensionCalculator);
