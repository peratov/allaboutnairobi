// A number with − and + either side: the shared control behind .tool-stepper.
//
// Used where a calculator wants a small whole-ish number - months of rent
// advance, years of contributions, a Tier 3 percentage - and a 14px number box
// is a fiddle on a phone that also zooms the page on iOS. The buttons step by
// `step`; typing works too.
//
// The box being typed in is never written back to while you type, or the
// cursor jumps on every keystroke. Only a button press, or `set()` from the
// calling code (a preset, say), rewrites it.

import { element, parseAmount } from '/js/utils/format.mjs';

export function stepper({ id, value, min, max, step = 1, unit, fewer, more, onChange }) {
	const decimals = String(step).includes('.') ? String(step).split('.')[1].length : 0;
	const clamp = (v) => Math.min(max, Math.max(min, Math.round(v / step) * step));
	const show = (v) => String(Number(v.toFixed(decimals)));

	let current = clamp(value);

	const input = element('input', {
		id,
		type: 'number',
		min: String(min),
		max: String(max),
		step: String(step),
		inputmode: decimals ? 'decimal' : 'numeric',
		value: show(current),
		oninput: (event) => {
			if (event.target.value.trim() === '') return;
			current = clamp(parseAmount(event.target.value));
			onChange(current);
		},
	});

	const set = (v) => {
		current = clamp(v);
		input.value = show(current);
		onChange(current);
	};

	const node = element('div', { class: 'tool-stepper' }, [
		element('button', { type: 'button', 'aria-label': fewer, text: '−', onclick: () => set(current - step) }),
		input,
		element('span', { class: 'tool-stepper-unit', text: unit }),
		element('button', { type: 'button', 'aria-label': more, text: '+', onclick: () => set(current + step) }),
	]);

	return { node, set, input };
}
