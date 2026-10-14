// Proves that the built modules mean exactly what their sources mean.
//
// The build strips comments and indentation from every module (see
// extensions/jsstrip.py) and stamps ?v=<commit> onto their imports. This
// parses each source in templates/js and its built copy in output/js with the
// JavaScript parser that ships inside Node, drops positions, removes the
// version stamp, and compares the trees. Equal trees mean the build changed
// layout and nothing else - the check rjsmin failed, in ten modules, by
// dropping the spaces inside nested template literals.
//
// Run after `mise build`:  mise check-js
//
// The parser is Node's own copy of acorn, reached with --expose-internals,
// because this repository installs no JavaScript packages. If a future Node
// moves it, this says so rather than passing.

import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);

let acorn;
try {
	acorn = require('internal/deps/acorn/acorn/dist/acorn');
} catch {
	console.error('Run with node --expose-internals (mise check-js does). If it was, this Node keeps acorn somewhere else now.');
	process.exit(2);
}

const sources = join(root, 'templates', 'js');
const built = join(root, 'output', 'js');
const options = { ecmaVersion: 'latest', sourceType: 'module' };
const stamp = /\?v=[\w-]+/g;

const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
	entry.isDirectory() ? walk(join(dir, entry.name)) : entry.name.endsWith('.mjs') ? [join(dir, entry.name)] : []);

// Positions differ by design; the version stamp differs by design, and only
// inside string values, where it is removed before comparing.
const normalise = (node) => {
	if (Array.isArray(node)) return node.map(normalise);
	if (node && typeof node === 'object') {
		const out = {};
		for (const [key, value] of Object.entries(node)) {
			if (key === 'start' || key === 'end' || key === 'loc' || key === 'range') continue;
			out[key] = typeof value === 'string' && (key === 'value' || key === 'raw') ? value.replace(stamp, '') : normalise(value);
		}
		return out;
	}
	return node;
};

let failures = 0;
let before = 0;
let after = 0;
const files = walk(sources);
for (const file of files) {
	const name = relative(sources, file);
	const source = readFileSync(file, 'utf8');
	let output;
	try {
		output = readFileSync(join(built, name), 'utf8');
	} catch {
		console.log(`MISSING  ${name} - build first`);
		failures++;
		continue;
	}
	before += Buffer.byteLength(source);
	after += Buffer.byteLength(output);
	const a = JSON.stringify(normalise(acorn.parse(source, options)));
	let b;
	try {
		b = JSON.stringify(normalise(acorn.parse(output, options)));
	} catch (error) {
		console.log(`BROKEN   ${name}: ${error.message}`);
		failures++;
		continue;
	}
	if (a !== b) {
		console.log(`CHANGED  ${name}`);
		failures++;
	}
}

console.log(`${files.length} modules, ${failures} differ. ${Math.round(before / 1024)}KB as written, ${Math.round(after / 1024)}KB built.`);
process.exit(failures ? 1 : 0);
