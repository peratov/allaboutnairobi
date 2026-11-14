// The home page's quick take-home box: a gross salary in, take-home pay out.
//
// The arithmetic is the salary calculator's own payslip(), reading the same
// constants (embedded on the home page as #site-constants), so the home page
// and the calculator cannot disagree. Nothing typed leaves the browser. "See
// the full breakdown" submits the form as a plain GET, and the calculator
// reads ?gross= to carry the figure on.

import { shillings, parseAmount } from '/js/utils/format.mjs';
import { payslip } from '/js/utils/payroll.mjs';

export default function initializeQuickPay() {
	const form = document.querySelector('[data-quick-pay]');
	if (!form || form.dataset.ready) return;
	form.dataset.ready = 'true';

	const input = form.querySelector('input[name="gross"]');
	const answer = form.querySelector('[data-quick-pay-answer]');
	const out = (name) => form.querySelector(`[data-qp-${name}]`);
	const bar = (name) => form.querySelector(`[data-qp-bar="${name}"]`);
	const kes = (value) => shillings(Math.round(value), 0);

	function update() {
		const gross = parseAmount(input.value);
		answer.hidden = !(gross > 0);
		if (!(gross > 0)) return;

		const p = payslip(gross);
		const parts = { net: p.net, nssf: p.nssf.total, levies: p.shif + p.housingLevy, paye: p.paye.tax };
		out('net').textContent = kes(parts.net);
		out('nssf').textContent = kes(parts.nssf);
		out('levies').textContent = kes(parts.levies);
		out('paye').textContent = kes(parts.paye);
		for (const [name, value] of Object.entries(parts)) {
			bar(name).style.width = `${Math.max(0, (value / gross) * 100)}%`;
		}
	}

	input.addEventListener('input', update);
	form.addEventListener('submit', () => {
		// Hand over a clean number, not "100,000 bob".
		const gross = parseAmount(input.value);
		input.value = gross > 0 ? String(gross) : '';
		if (!input.value) input.disabled = true; // no empty ?gross=
	});
	window.addEventListener('pageshow', () => { input.disabled = false; });

	// On a phone the support chip sat on the answer while it was being read;
	// it steps aside while the box is on screen, as it does for the calculators.
	const phone = window.matchMedia('(max-width: 40rem)');
	let onScreen = false;
	const yieldChip = () =>
		document.querySelector('.support-float')?.classList.toggle('is-yielding-tool', onScreen && phone.matches);
	if ('IntersectionObserver' in window) {
		new IntersectionObserver(([entry]) => {
			onScreen = entry.isIntersecting;
			yieldChip();
		}, { threshold: 0.2 }).observe(form);
		phone.addEventListener?.('change', yieldChip);
	}

	update();
}

initializeQuickPay();
