// WASSCE aggregate calculator.
//
// The aggregate is the single number Ghanaian university admission runs on, and
// it is counter-intuitive twice over: lower is better, and only six of your
// subjects count - the three core ones and your best three electives. Students
// routinely add up all eight and frighten themselves.

import { element } from '/js/utils/format.mjs';

const GRADES = [
	{ code: 'A1', value: 1, label: 'A1 - Excellent' },
	{ code: 'B2', value: 2, label: 'B2 - Very good' },
	{ code: 'B3', value: 3, label: 'B3 - Good' },
	{ code: 'C4', value: 4, label: 'C4 - Credit' },
	{ code: 'C5', value: 5, label: 'C5 - Credit' },
	{ code: 'C6', value: 6, label: 'C6 - Credit' },
	{ code: 'D7', value: 7, label: 'D7 - Pass, not a credit' },
	{ code: 'E8', value: 8, label: 'E8 - Pass, not a credit' },
	{ code: 'F9', value: 9, label: 'F9 - Fail' },
];

const CORE = ['English Language', 'Core Mathematics', 'Integrated Science or Social Studies'];

class WassceAggregateCalculator extends HTMLElement {
	connectedCallback() {
		if (this.rendered) return;
		this.rendered = true;

		// Four electives entered, best three counted - which is the rule, and
		// also the part that surprises people.
		this.state = { core: [3, 4, 4], electives: [3, 4, 5, 6] };

		this.replaceChildren();
		this.build();
		this.update();
	}

	gradeSelect(uid, label, value, onchange) {
		const select = element('select', { id: `${uid}`, onchange });
		GRADES.forEach((grade) => {
			const option = element('option', { value: String(grade.value), text: grade.label });
			if (grade.value === value) option.selected = true;
			select.append(option);
		});

		return element('div', { class: 'form-group' }, [
			element('label', { for: uid, text: label }),
			element('div', { class: 'input-group' }, [select]),
		]);
	}

	build() {
		const uid = Math.random().toString(36).slice(2, 7);

		const coreFields = CORE.map((subject, index) =>
			this.gradeSelect(`core-${index}-${uid}`, subject, this.state.core[index], (event) => {
				this.state.core[index] = parseInt(event.target.value, 10);
				this.update();
			})
		);

		const electiveFields = this.state.electives.map((grade, index) =>
			this.gradeSelect(`elective-${index}-${uid}`, `Elective ${index + 1}`, grade, (event) => {
				this.state.electives[index] = parseInt(event.target.value, 10);
				this.update();
			})
		);

		const form = element('form', {}, [
			element('h4', { text: 'Work out your aggregate' }),
			element('p', {
				class: 'input-instructions',
				text: 'Three core subjects, then your electives. The best three electives are counted.',
			}),
			...coreFields,
			...electiveFields,
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
		const credit = c.WASSCE_CREDIT_GRADE || 6;
		const cutoff = c.UNIVERSITY_GENERAL_CUTOFF_AGGREGATE || 24;

		const counted = [...this.state.electives].sort((a, b) => a - b).slice(0, 3);
		const core = this.state.core;
		const aggregate = core.reduce((a, b) => a + b, 0) + counted.reduce((a, b) => a + b, 0);

		const allSix = [...core, ...counted];
		const nonCredits = allSix.filter((grade) => grade > credit).length;
		const coreNonCredits = core.filter((grade) => grade > credit).length;

		this.results.replaceChildren();

		this.results.append(
			element('div', { class: 'tool-headline' }, [
				element('span', { class: 'tool-headline-value', text: String(aggregate) }),
				element('span', {
					class: 'tool-headline-label',
					text: 'aggregate, over six subjects. Lower is better.',
				}),
			])
		);

		const row = (label, value, className = '') =>
			element('tr', { class: className }, [
				element('th', { scope: 'row', text: label }),
				element('td', { text: value }),
			]);

		this.results.append(
			element('div', { class: 'table-wrapper' }, [
				element('table', { class: 'tool-breakdown' }, [
					element('tbody', {}, [
						row('Core subjects', String(core.reduce((a, b) => a + b, 0))),
						row('Best three electives', String(counted.reduce((a, b) => a + b, 0))),
						row('Electives not counted', this.state.electives.length > 3 ? 'The weakest one is dropped' : 'None'),
						row('Aggregate', String(aggregate), 'total'),
					]),
				]),
			])
		);

		// Credits matter independently of the aggregate: six credits including
		// the core is the gate, and a good aggregate does not open it if a core
		// subject failed.
		if (coreNonCredits > 0) {
			this.results.append(
				element('p', {
					class: 'tool-note',
					text:
						`${coreNonCredits === 1 ? 'One core subject is' : `${coreNonCredits} core subjects are`} ` +
						'below C6, so it is not a credit pass. Public universities require credits in the core ' +
						'subjects regardless of the aggregate. Resitting that subject changes more than the number does.',
				})
			);
		} else if (nonCredits > 0) {
			this.results.append(
				element('p', {
					class: 'tool-note',
					text:
						`${nonCredits} of the six counted subjects ${nonCredits === 1 ? 'is' : 'are'} below C6. ` +
						'You need six credit passes, so a stronger elective would have to replace it.',
				})
			);
		} else if (aggregate <= cutoff) {
			this.results.append(
				element('p', {
					class: 'tool-note',
					text:
						`Six credit passes and an aggregate of ${aggregate}, which is within the general ` +
						`cut-off of ${cutoff} for a public university. Competitive programmes - medicine, law, ` +
						'pharmacy, engineering - cut off far lower, often in single figures.',
				})
			);
		} else {
			this.results.append(
				element('p', {
					class: 'tool-note',
					text:
						`An aggregate of ${aggregate} is outside the general cut-off of ${cutoff} for a public ` +
						'university. A resit, an access course, a technical university or a private university ' +
						'are all real routes, and none of them are dead ends.',
				})
			);
		}

		this.results.append(
			element('p', {
				class: 'tool-note',
				text:
					'Which science or social science counts as your third core subject depends on the programme ' +
					'you apply for. Check the specific requirements of each programme, not just the aggregate.',
			})
		);
	}
}

customElements.define('wassce-aggregate-calculator', WassceAggregateCalculator);
