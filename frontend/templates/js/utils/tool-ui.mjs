// Small building blocks the calculators share, so they look and behave alike.

import { element, shillings } from '/js/utils/format.mjs';

let counter = 0;
const uid = () => `t${(counter += 1)}`;

export { element, shillings };

export function money(value) {
	return shillings(value, value >= 1000 ? 0 : 2);
}

export function numberField({ label, value, onInput, prefix = 'KES', step = '100', hint, min = '0' }) {
	const id = uid();
	const input = element('input', {
		id, type: 'number', min, step, inputmode: 'decimal', value: String(value),
		oninput: (event) => onInput(Math.max(0, parseFloat(event.target.value) || 0)),
	});
	return element('div', { class: 'form-group' }, [
		element('label', { for: id, text: label }),
		element('div', { class: 'input-group' }, [prefix ? element('span', { text: prefix }) : null, input].filter(Boolean)),
		hint ? element('span', { class: 'input-instructions', text: hint }) : null,
	]);
}

export function choice({ label, options, value, onChange }) {
	const buttons = options.map(([key, text]) => element('button', {
		type: 'button', class: 'toggle', 'aria-pressed': String(key === value), text,
		onclick: () => {
			buttons.forEach((button, i) => button.setAttribute('aria-pressed', String(options[i][0] === key)));
			onChange(key);
		},
	}));
	return element('div', { class: 'form-group' }, [
		element('span', { class: 'label', text: label }),
		element('div', { class: 'input-group' }, buttons),
	]);
}

export function checkbox({ label, checked, onChange }) {
	const id = uid();
	return element('div', { class: 'form-group' }, [
		element('label', { for: id, class: 'checkbox-label' }, [
			element('input', { id, type: 'checkbox', ...(checked ? { checked: 'checked' } : {}), onchange: (e) => onChange(e.target.checked) }),
			document.createTextNode(` ${label}`),
		]),
	]);
}

export function headline(value, label) {
	return element('div', { class: 'tool-headline' }, [
		element('span', { class: 'tool-headline-value', text: value }),
		element('span', { class: 'tool-headline-label', text: label }),
	]);
}

export function breakdown(rows) {
	return element('div', { class: 'table-wrapper' }, [
		element('table', { class: 'tool-breakdown' }, [
			element('tbody', {}, rows.filter(Boolean).map(([label, value, className = '']) =>
				element('tr', { class: className }, [
					element('th', { scope: 'row', text: label }),
					element('td', { text: value }),
				]))),
		]),
	]);
}

export function note(text) {
	return element('p', { class: 'tool-note', text });
}

// Mount a calculator: a form built once, and results redrawn on every change.
export function mount(host, title, buildForm, render) {
	const form = element('form', {}, [element('h4', { text: title }), ...buildForm()]);
	form.addEventListener('submit', (event) => event.preventDefault());
	const results = element('div', { class: 'tool-results', role: 'status', 'aria-live': 'polite' });
	host.replaceChildren(form, results);
	const redraw = () => results.replaceChildren(...render().filter(Boolean));
	redraw();
	return redraw;
}
