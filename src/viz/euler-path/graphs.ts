/**
 * Random graphs that have an Euler circuit (or path), for presets and practice: a cycle through
 * every vertex in a random order, plus a few triangles on edges not used yet, so every degree
 * stays even (or every vertex balanced, when directed). For a path, one edge of the big cycle
 * goes, which leaves its two ends odd and the graph in one piece.
 */
import type { Rng } from '../../engine/rng';
import { letters, makeGraph, type Edge, type Graph } from '../_graph/graph';
import { shuffle } from '../_graph/presets';

export function eulerianGraph(rng: Rng, n: number, path: boolean, directed = false): Graph {
  const names = shuffle(rng, letters(Math.max(3, Math.min(12, n))));
  const edges: Edge[] = names.map((u, i) => ({ u, v: names[(i + 1) % names.length]!, w: 1 }));
  const has = (a: string, b: string) =>
    edges.some((e) => (e.u === a && e.v === b) || (e.u === b && e.v === a));
  for (let tries = 0; tries < 30 && edges.length < names.length + 6; tries++) {
    const [a, b, c] = shuffle(rng, names).slice(0, 3) as [string, string, string];
    if (has(a, b) || has(b, c) || has(c, a)) continue;
    edges.push({ u: a, v: b, w: 1 }, { u: b, v: c, w: 1 }, { u: c, v: a, w: 1 });
  }
  if (path) edges.splice(rng.int(0, names.length - 1), 1);
  return makeGraph({ directed, weighted: false, vertices: names, edges });
}
