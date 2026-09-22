/**
 * A very small PDF writer.
 *
 * The site's CSP allows no external scripts, so jsPDF and its relatives are
 * out - and vendoring 350KB of library to lay out two pages of text would be a
 * poor trade on a Ghanaian data bundle. A PDF is a text format, and text on a
 * page with one built-in font is the easy end of it.
 *
 * What this does: A4 pages, Helvetica and Helvetica-Bold, headings, wrapped
 * paragraphs, label/value rows, bullets, rules and a footer, with automatic
 * pagination. What it deliberately does not do: images, tables, colour beyond
 * greys, embedded fonts, or anything needing a font subset.
 *
 * The two built-in Helvetica faces use WinAnsiEncoding, which has no cedi
 * sign. Rather than emit a wrong glyph, `sanitise` turns the ones that matter
 * into words - a report that says "GHS 400" is right, one that says "?400" is
 * not.
 */

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 56;
const LINE_GAP = 1.35;

/**
 * Helvetica character widths in 1/1000 em, for printable ASCII.
 *
 * Needed because wrapping without real metrics either overflows the margin or
 * wastes half the line. Bold is a little wider; rather than carry a second
 * table, bold wraps against a slightly narrower column.
 */
const WIDTHS = {
	' ': 278, '!': 278, '"': 355, '#': 556, $: 556, '%': 889, '&': 667, "'": 191,
	'(': 333, ')': 333, '*': 389, '+': 584, ',': 278, '-': 333, '.': 278, '/': 278,
	0: 556, 1: 556, 2: 556, 3: 556, 4: 556, 5: 556, 6: 556, 7: 556, 8: 556, 9: 556,
	':': 278, ';': 278, '<': 584, '=': 584, '>': 584, '?': 556, '@': 1015,
	A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 500,
	K: 667, L: 556, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611,
	U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
	'[': 278, '\\': 278, ']': 278, '^': 469, _: 556, '`': 333,
	a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222, j: 222,
	k: 500, l: 222, m: 833, n: 556, o: 556, p: 556, q: 556, r: 333, s: 500, t: 278,
	u: 556, v: 500, w: 722, x: 500, y: 500, z: 500,
	'{': 334, '|': 260, '}': 334, '~': 584,
};

const BOLD_SAFETY = 0.94;

/** Characters the built-in fonts cannot draw, spelled out instead. */
const REPLACEMENTS = [
	[/₵/g, 'GHS '],   // cedi
	[/[‘’]/g, "'"],
	[/[“”]/g, '"'],
	[/—/g, ' - '],    // em dash
	[/–/g, '-'],
	[/…/g, '...'],
	[/ /g, ' '],
	[/→|➞/g, '->'],
	[/≤/g, '<='],
	[/≥/g, '>='],
];

function sanitise(text) {
	let out = String(text ?? '');
	for (const [pattern, with_] of REPLACEMENTS) out = out.replace(pattern, with_);
	// Anything still outside WinAnsi's Latin range would render as a wrong
	// glyph, so it goes rather than lies.
	return out.replace(/[^\x20-\x7e¡-ÿ]/g, '');
}

/** Escape the three characters that mean something inside a PDF string. */
const escape = (text) => text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

function widthOf(text, size, bold) {
	let units = 0;
	for (const character of text) units += WIDTHS[character] ?? 556;
	return (units / 1000) * size * (bold ? 1 / BOLD_SAFETY : 1);
}

function wrap(text, size, bold, maxWidth) {
	const words = text.split(/\s+/).filter(Boolean);
	const lines = [];
	let line = '';

	for (const word of words) {
		const candidate = line ? `${line} ${word}` : word;
		if (widthOf(candidate, size, bold) <= maxWidth || !line) {
			line = candidate;
		} else {
			lines.push(line);
			line = word;
		}
	}
	if (line) lines.push(line);
	return lines.length ? lines : [''];
}

export class PdfDocument {
	constructor({ title = '', subtitle = '', footer = '' } = {}) {
		this.meta = { title: sanitise(title), subtitle: sanitise(subtitle), footer: sanitise(footer) };
		this.pages = [];
		this.column = A4.width - MARGIN * 2;
		this.newPage();

		if (this.meta.title) this.heading(this.meta.title, 18);
		if (this.meta.subtitle) this.text(this.meta.subtitle, { grey: 0.4 });
	}

	newPage() {
		this.current = [];
		this.pages.push(this.current);
		this.y = A4.height - MARGIN;
	}

	/** Make room for `needed` points, starting a page if there is not any. */
	reserve(needed) {
		if (this.y - needed < MARGIN + 28) this.newPage();
	}

	write(text, { size = 10.5, bold = false, grey = 0, indent = 0, gapAfter = 0 } = {}) {
		const clean = sanitise(text);
		const lines = wrap(clean, size, bold, this.column - indent);
		const leading = size * LINE_GAP;

		for (const line of lines) {
			this.reserve(leading);
			this.current.push(
				'BT',
				`/${bold ? 'F2' : 'F1'} ${size} Tf`,
				`${grey} g`,
				`1 0 0 1 ${(MARGIN + indent).toFixed(2)} ${(this.y - size).toFixed(2)} Tm`,
				`(${escape(line)}) Tj`,
				'ET'
			);
			this.y -= leading;
		}

		this.y -= gapAfter;
		return this;
	}

	heading(text, size = 13) {
		this.reserve(size * 2.4);
		this.y -= size * 0.5;
		return this.write(text, { size, bold: true, gapAfter: size * 0.35 });
	}

	text(text, options = {}) {
		return this.write(text, { gapAfter: 5, ...options });
	}

	bullet(text) {
		const y = this.y;
		this.write('-', { indent: 4 });
		this.y = y;
		return this.write(text, { indent: 16, gapAfter: 2 });
	}

	/** A label on the left, its value right-aligned on the same line. */
	keyValue(label, value, { bold = false } = {}) {
		const size = 10.5;
		const leading = size * LINE_GAP;
		this.reserve(leading);

		const cleanValue = sanitise(String(value));
		const valueWidth = widthOf(cleanValue, size, bold);

		this.current.push(
			'BT', `/F1 ${size} Tf`, '0.35 g',
			`1 0 0 1 ${MARGIN} ${(this.y - size).toFixed(2)} Tm`,
			`(${escape(sanitise(label))}) Tj`, 'ET',
			'BT', `/${bold ? 'F2' : 'F1'} ${size} Tf`, '0 g',
			`1 0 0 1 ${(A4.width - MARGIN - valueWidth).toFixed(2)} ${(this.y - size).toFixed(2)} Tm`,
			`(${escape(cleanValue)}) Tj`, 'ET'
		);

		this.y -= leading;
		return this;
	}

	rule() {
		this.reserve(12);
		this.y -= 6;
		this.current.push(
			'0.8 G', '0.6 w',
			`${MARGIN} ${this.y.toFixed(2)} m ${(A4.width - MARGIN).toFixed(2)} ${this.y.toFixed(2)} l S`
		);
		this.y -= 8;
		return this;
	}

	/** Page numbers and the standing footer, added once at the end. */
	stampFooters() {
		this.pages.forEach((page, index) => {
			const label = `${this.meta.footer}${this.meta.footer ? '   ' : ''}Page ${index + 1} of ${this.pages.length}`;
			page.push(
				'BT', '/F1 8 Tf', '0.5 g',
				`1 0 0 1 ${MARGIN} ${(MARGIN - 18).toFixed(2)} Tm`,
				`(${escape(label)}) Tj`, 'ET'
			);
		});
	}

	toBytes() {
		this.stampFooters();

		const objects = [];
		const add = (body) => { objects.push(body); return objects.length; };

		// Reserve 1 and 2 for the catalog and the page tree, whose contents
		// depend on ids allocated below.
		add('');
		add('');
		const fontRegular = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
		const fontBold = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');

		const pageIds = [];
		for (const page of this.pages) {
			const stream = page.join('\n');
			const contentId = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
			pageIds.push(add(
				`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4.width} ${A4.height}] ` +
				`/Resources << /Font << /F1 ${fontRegular} 0 R /F2 ${fontBold} 0 R >> >> ` +
				`/Contents ${contentId} 0 R >>`
			));
		}

		objects[0] = '<< /Type /Catalog /Pages 2 0 R >>';
		objects[1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;

		let pdf = '%PDF-1.4\n';
		const offsets = [];
		objects.forEach((body, index) => {
			offsets.push(pdf.length);
			pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
		});

		const xref = pdf.length;
		pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
		for (const offset of offsets) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
		pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;

		// Latin-1, one byte per code unit, which is what the offsets above
		// counted. Encoding as UTF-8 here would shift every one of them.
		const bytes = new Uint8Array(pdf.length);
		for (let i = 0; i < pdf.length; i += 1) bytes[i] = pdf.charCodeAt(i) & 0xff;
		return bytes;
	}

	toBlob() {
		return new Blob([this.toBytes()], { type: 'application/pdf' });
	}

	/** Hand the file to the reader. Nothing is uploaded anywhere. */
	download(filename) {
		const url = URL.createObjectURL(this.toBlob());
		const link = document.createElement('a');
		link.href = url;
		link.download = filename;
		document.body.append(link);
		link.click();
		link.remove();
		// Revoked late: Safari has been known to cancel the download if the
		// URL disappears in the same tick.
		setTimeout(() => URL.revokeObjectURL(url), 10_000);
	}
}
