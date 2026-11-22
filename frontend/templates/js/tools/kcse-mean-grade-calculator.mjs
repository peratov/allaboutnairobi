// KCSE mean grade calculator.
//
// Since the 2023 exam, KNEC builds the mean grade from seven subjects:
// Mathematics, the best of the languages (English, Kiswahili or Kenyan Sign
// Language), and the best five of everything else. Students often still add
// up all eight or nine subjects, or count both languages, and get the wrong
// answer. This counts the way KNEC does and shows which subjects were dropped.

import { element } from '/js/utils/format.mjs';
import constants from '/js/utils/constants.mjs';

const GRADES = ['A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'E'];
const POINTS = Object.fromEntries(GRADES.map((grade, i) => [grade, 12 - i]));

// Total points over seven subjects, to mean grade (KNEC's bands).
const BANDS = [
	[81, 'A'], [74, 'A-'], [67, 'B+'], [60, 'B'], [53, 'B-'], [46, 'C+'],
	[39, 'C'], [32, 'C-'], [25, 'D+'], [18, 'D'], [11, 'D-'], [0, 'E'],
];

const meanGrade = (total) => BANDS.find(([min]) => total >= min)[1];

const DEFAULT_OTHERS = [
	['Biology', 'B'], ['Chemistry', 'C+'], ['Physics', 'C'],
	['History and Government', 'B-'], ['Business Studies', 'B'], ['Geography', 'C+'],
];

class KcseMeanGradeCalculator extends HTMLElement {
	connectedCallback() {
		if (this.rendered) return;
		this.rendered = true;
		this.state = {
			maths: 'C+',
			english: 'B-',
			kiswahili: 'C+',
			others: DEFAULT_OTHERS.map(([name, grade]) => ({ name, grade })),
		};
		this.replaceChildren();
		this.build();
		this.update();
	}

	gradeSelect(id, label, value, onchange, allowNone = false) {
		const select = element('select', { id, onchange });
		if (allowNone) select.append(element('option', { value: '', text: 'Not taken' }));
		GRADES.forEach((grade) => {
			const option = element('option', { value: grade, text: `${grade} (${POINTS[grade]} points)` });
			if (grade === value) option.selected = true;
			select.append(option);
		});
		if (allowNone && !value) select.value = '';
		return element('div', { class: 'form-group' }, [
			element('label', { for: id, text: label }),
			element('div', { class: 'input-group' }, [select]),
		]);
	}

	build() {
		const uid = Math.random().toString(36).slice(2, 7);
		const set = (key) => (event) => { this.state[key] = event.target.value; this.update(); };

		const fields = [
			this.gradeSelect(`maths-${uid}`, 'Mathematics', this.state.maths, set('maths')),
			this.gradeSelect(`english-${uid}`, 'English', this.state.english, set('english'), true),
			this.gradeSelect(`kiswahili-${uid}`, 'Kiswahili or Kenyan Sign Language', this.state.kiswahili, set('kiswahili'), true),
			...this.state.others.map((subject, index) =>
				this.gradeSelect(`other-${index}-${uid}`, subject.name, subject.grade, (event) => {
					this.state.others[index].grade = event.target.value;
					this.update();
				}, true)
			),
		];

		const form = element('form', {}, [
			element('h4', { text: 'Enter your grades' }),
			element('p', {
				class: 'input-instructions',
				text: 'Mathematics and your languages, then up to six other subjects. Choose "Not taken" for any you did not sit; the names do not change the result.',
			}),
			...fields,
		]);
		form.addEventListener('submit', (event) => event.preventDefault());

		this.results = element('div', { class: 'tool-results', role: 'status', 'aria-live': 'polite' });
		this.append(form, this.results);
	}

	update() {
		const c = constants();
		const entryGrade = String(c.KCSE_UNIVERSITY_ENTRY_GRADE || 'C+');
		const { maths, english, kiswahili, others } = this.state;

		const languages = [['English', english], ['Kiswahili', kiswahili]].filter(([, g]) => g);
		const taken = others.filter((s) => s.grade);

		this.results.replaceChildren();

		if (!languages.length || taken.length < 5) {
			this.results.append(element('p', {
				class: 'tool-note',
				text: 'The mean grade needs Mathematics, at least one language and at least five other subjects.',
			}));
			return;
		}

		languages.sort((a, b) => POINTS[b[1]] - POINTS[a[1]]);
		const bestLanguage = languages[0];
		// The language not counted as "the language" can still be one of the
		// best five, like any other subject.
		const pool = [
			...languages.slice(1).map(([name, grade]) => ({ name, grade })),
			...taken,
		].sort((a, b) => POINTS[b.grade] - POINTS[a.grade]);
		const counted = pool.slice(0, 5);
		const dropped = pool.slice(5);

		const total = POINTS[maths] + POINTS[bestLanguage[1]] + counted.reduce((sum, s) => sum + POINTS[s.grade], 0);
		const grade = meanGrade(total);

		this.results.append(element('div', { class: 'tool-headline' }, [
			element('span', { class: 'tool-headline-value', text: grade }),
			element('span', { class: 'tool-headline-label', text: `mean grade, from ${total} points out of 84` }),
		]));

		const row = (label, value, className = '') => element('tr', { class: className }, [
			element('th', { scope: 'row', text: label }),
			element('td', { text: value }),
		]);
		this.results.append(element('div', { class: 'table-wrapper' }, [
			element('table', { class: 'tool-breakdown' }, [
				element('tbody', {}, [
					row('Mathematics', `${maths} - ${POINTS[maths]}`),
					row(`Best language (${bestLanguage[0]})`, `${bestLanguage[1]} - ${POINTS[bestLanguage[1]]}`),
					...counted.map((s) => row(s.name, `${s.grade} - ${POINTS[s.grade]}`)),
					row('Total points', String(total), 'total'),
					row('Not counted', dropped.length ? dropped.map((s) => `${s.name} (${s.grade})`).join(', ') : 'Nothing'),
				]),
			]),
		]));

		const meets = POINTS[grade] >= POINTS[entryGrade];
		this.results.append(element('p', {
			class: 'tool-note',
			text: meets
				? `${grade} meets the ${entryGrade} that usually qualifies you for a university degree through KUCCPS. Each course also has its own cluster subject requirements, and popular courses ask for much more.`
				: `${grade} is below the ${entryGrade} usually needed for a university degree, but it can still open diploma, certificate and TVET courses through KUCCPS, and many lead on to a degree later.`,
		}));
		this.results.append(element('p', {
			class: 'tool-note',
			text: 'This is an estimate from the grades you enter. Your official mean grade is the one on your KNEC result slip.',
		}));
	}
}

customElements.define('kcse-mean-grade-calculator', KcseMeanGradeCalculator);
