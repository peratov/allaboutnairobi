// Which Nairobi district a position is in - or that it is in none.
//
// The point is projected into the map's own units (see districts.mjs) and
// tested against each district's outline by ray casting. The outlines are the
// simplified ones /map draws, and Nairobi's edge is mostly a coastline,
// so a phone on Labadi Beach can fall a few metres outside the drawn shape.
// A position outside every outline but within `edgeMetres` of one is given to
// the nearest; further out it is outside Nairobi.
//
// Nothing here keeps the position. It arrives, picks a district, and is gone.

import { DISTRICTS, PROJECTION } from './districts.mjs';

// One map unit, in metres: a degree of latitude is about 111.32km, and the map
// scales latitude by `scale` units a degree. Longitude was scaled by the cosine
// of Nairobi's latitude, which is what makes the units square.
export const METRES_PER_UNIT = 111320 / PROJECTION.scale;

export function project(lat, lon) {
	const { west, south, scale, cosLat, height } = PROJECTION;
	return { x: (lon - west) * cosLat * scale, y: height - (lat - south) * scale };
}

/** The inverse, for the checks: a district's centre back to a position. */
export function unproject(x, y) {
	const { west, south, scale, cosLat, height } = PROJECTION;
	return { lat: south + (height - y) / scale, lon: west + x / (cosLat * scale) };
}

function inside(ring, x, y) {
	let hit = false;
	for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
		const xi = ring[i], yi = ring[i + 1], xj = ring[j], yj = ring[j + 1];
		if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
	}
	return hit;
}

function distanceToRing(ring, x, y) {
	let best = Infinity;
	for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
		const ax = ring[j], ay = ring[j + 1], bx = ring[i], by = ring[i + 1];
		const dx = bx - ax, dy = by - ay;
		const t = dx || dy ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy))) : 0;
		best = Math.min(best, Math.hypot(x - (ax + t * dx), y - (ay + t * dy)));
	}
	return best;
}

// Each district's box, worked out once, so most districts are ruled out with
// four comparisons rather than a walk round their outline.
const BOXES = DISTRICTS.map((d) => {
	const xs = d.rings.flatMap((r) => r.filter((_, i) => i % 2 === 0));
	const ys = d.rings.flatMap((r) => r.filter((_, i) => i % 2 === 1));
	return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
});

/**
 * The district a position falls in, as { id, name, edge }, where `edge` is
 * true when it was given to the nearest district from just outside - or null
 * when it is outside Nairobi.
 */
export function locate(lat, lon, edgeMetres = 500) {
	if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
	const { x, y } = project(lat, lon);
	for (let i = 0; i < DISTRICTS.length; i++) {
		const box = BOXES[i];
		if (x < box.minX || x > box.maxX || y < box.minY || y > box.maxY) continue;
		// Rings are even-odd: a hole is a ring the point is also inside.
		let hits = 0;
		for (const ring of DISTRICTS[i].rings) if (inside(ring, x, y)) hits++;
		if (hits % 2) return { id: DISTRICTS[i].id, name: DISTRICTS[i].name, edge: false };
	}
	const reach = edgeMetres / METRES_PER_UNIT;
	let nearest = null;
	let best = Infinity;
	for (let i = 0; i < DISTRICTS.length; i++) {
		const box = BOXES[i];
		if (x < box.minX - reach || x > box.maxX + reach || y < box.minY - reach || y > box.maxY + reach) continue;
		for (const ring of DISTRICTS[i].rings) {
			const d = distanceToRing(ring, x, y);
			if (d < best) { best = d; nearest = DISTRICTS[i]; }
		}
	}
	return nearest && best <= reach ? { id: nearest.id, name: nearest.name, edge: true } : null;
}

export const districtName = (id) => DISTRICTS.find((d) => d.id === id)?.name || null;
export const districtIds = () => DISTRICTS.map((d) => d.id);
