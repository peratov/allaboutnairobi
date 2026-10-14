// Adding up day documents of counters, for the prompts' and the newsletter's
// statistics. Each day is one document of numbers, nested maps allowed; this
// adds a list of them together, maps and all, skipping the document's own
// bookkeeping fields.
//
// (In All About Accra this lived with Home Ride's play counts. Nairobi has no
// Home Ride, so the helper stands on its own.)

const COUNTER_SKIP = new Set(['id', 'day', 'updated_at', '_version']);

/** Every counter in a list of day documents, added up, maps and all. */
export function sum(rows) {
	const out = {};
	const into = (target, source) => {
		for (const [key, value] of Object.entries(source || {})) {
			if (COUNTER_SKIP.has(key)) continue;
			if (typeof value === 'number') target[key] = (target[key] || 0) + value;
			else if (value && typeof value === 'object') into((target[key] ||= {}), value);
		}
	};
	for (const row of rows) into(out, row);
	return out;
}
