/**
 * Points in the plane for the retrieval pages (k-means, HNSW; later IVF and product
 * quantization): whole-number coordinates from 0 to MAX, each point named A, B, C... in the
 * order it arrives, with an id so the drawing follows it. Distances are squared Euclidean
 * distances, so for whole-number points every distance a learner works out is a whole number.
 *
 *   parsePoints(token, most)     the input box: "1,2 3,4", or a count of random points
 *   pointsFrom(arg, rng, most)   an operation's argument as points (a list, or a count)
 *   blobs(rng, n, k)             n points in k round groups, for the presets
 *   d2(a, b)                     squared distance
 */
import type { Rng } from '../../engine/rng';
import type { Value } from '../../engine/types';
import type { Vec } from '../../layouts/plane';
import { nameOf, parsePointList, pointsArg, randomPoints, shuffled } from '../_spatial/kit';

export { nameOf, randomPoints, shuffled };

/** Coordinates run from 0 to MAX. */
export const MAX = 10;

/** A named point with an identity. */
export interface Pt {
  id: number;
  name: string;
  x: number;
  y: number;
}

/** Squared distance, as dx·dx + dy·dy (the code tabs compute it the same way, to the last bit). */
export function d2(a: Vec, b: Vec): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

/** "A(1, 2)". */
export const ptText = (p: Pt) => `${p.name}(${p.x}, ${p.y})`;

/** The input box: a list "1,2 3,4", or a whole number, that many random points. */
export const parsePoints = (token: string, most: number): Value | Error =>
  parsePointList(token, MAX, most);

/** An operation's argument as points: a list, or a count of random distinct points. */
export const pointsFrom = (v: Value | undefined, rng: Rng, most: number): Vec[] | string =>
  pointsArg(v, rng, MAX, most, 0, MAX);

/** Points A, B, C... from coordinates, ids from `first`. */
export const named = (pts: readonly Vec[], first = 0): Pt[] =>
  pts.map((p, i) => ({ id: first + i, name: nameOf(first + i + 1), x: p.x, y: p.y }));

/** Group centres for `blobs`, spread over the window: the first k of them are used. */
const HUBS: Vec[] = [
  { x: 2, y: 2 },
  { x: 8, y: 7 },
  { x: 2, y: 8 },
  { x: 8, y: 2 },
  { x: 5, y: 5 },
];

/** n distinct points in k round groups (at most 5), dealt out in turn, shuffled. */
export function blobs(rng: Rng, n: number, k: number): Vec[] {
  const hubs = HUBS.slice(0, Math.max(1, Math.min(HUBS.length, k)));
  const seen = new Set<string>();
  const out: Vec[] = [];
  let guard = 0;
  while (out.length < n && guard++ < 2000) {
    const h = hubs[out.length % hubs.length]!;
    const p = {
      x: Math.max(0, Math.min(MAX, h.x + rng.int(-1, 1))),
      y: Math.max(0, Math.min(MAX, h.y + rng.int(-1, 1))),
    };
    const key = `${p.x},${p.y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return shuffled(rng, out);
}
