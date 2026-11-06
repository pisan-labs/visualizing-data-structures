/**
 * Bipartite graphs for presets and practice: workers A, B, C, ... on the left and jobs 1, 2,
 * 3, ... on the right, written as edge-list text (A-1, A-2, ...). `n` is the number of vertices
 * in all; the left side gets the extra one when it is odd.
 *
 *   randomBipartite(rng, n, density)  each worker joins a random share of the jobs, at least one
 *   perfectBipartite(rng, n)          a hidden perfect matching, plus a few extra edges
 *   chainBipartite(n)                 worker k likes jobs k - 1 and k + 1: Kuhn's augmenting
 *                                     paths get longer and longer
 *   hallBipartite(rng, n)             a group of workers who between them like too few jobs
 *   starBipartite(n)                  every worker likes job 1 only
 */
import type { Rng } from '../../engine/rng';
import type { OpCall } from '../../engine/types';
import { letters } from '../_graph/graph';
import { shuffle } from '../_graph/presets';

const split = (n: number) => {
  const m = Math.max(2, Math.min(16, n));
  const l = Math.ceil(m / 2);
  return { left: letters(l), right: Array.from({ length: m - l }, (_, i) => String(i + 1)) };
};

const text = (pairs: [string, string][]) =>
  [...new Set(pairs.map(([u, v]) => `${u}-${v}`))].join(', ');

export function randomBipartite(rng: Rng, n: number, density = 0.35): string {
  const { left, right } = split(n);
  const pairs: [string, string][] = [];
  for (const u of left) {
    const k = Math.max(1, Math.round(density * right.length) + rng.int(-1, 1));
    for (const v of shuffle(rng, right).slice(0, Math.min(right.length, k))) pairs.push([u, v]);
  }
  return text(pairs);
}

export function perfectBipartite(rng: Rng, n: number): string {
  const { left, right } = split(n);
  const jobs = shuffle(rng, right);
  const pairs: [string, string][] = [];
  left.forEach((u, i) => {
    if (jobs[i]) pairs.push([u, jobs[i]!]);
    const extra = right[rng.int(0, right.length - 1)]!;
    pairs.push([u, extra]);
  });
  return text(shuffle(rng, pairs));
}

export function chainBipartite(n: number): string {
  const { left, right } = split(n);
  const pairs: [string, string][] = [];
  left.forEach((u, k) => {
    // Jobs k - 1 and k + 1 (1-based k + 1 for the k-th worker), where they exist.
    const a = right[k - 1] ?? right[0];
    const b = right[k + 1] ?? right[k] ?? right.at(-1);
    if (a) pairs.push([u, a]);
    if (b) pairs.push([u, b]);
  });
  return text(pairs);
}

export function hallBipartite(rng: Rng, n: number): string {
  const { left, right } = split(n);
  // The first three workers (or all, if fewer) like only the first two jobs.
  const few = right.slice(0, Math.min(2, right.length));
  const pairs: [string, string][] = [];
  left.forEach((u, i) => {
    const pool = i < 3 ? few : right;
    for (const v of shuffle(rng, pool).slice(0, Math.min(pool.length, 2))) pairs.push([u, v]);
  });
  return text(pairs);
}

export function starBipartite(n: number): string {
  const { left } = split(n);
  return text(left.map((u) => [u, '1']));
}

export const loadCall = (t: string): OpCall => ['load', t];
