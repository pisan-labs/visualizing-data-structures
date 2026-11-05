/** Graphs for the bipartite page's presets and practice. */
import type { Rng } from '../../engine/rng';
import { letters, makeGraph, type Edge, type Graph } from '../_graph/graph';
import { randomTree } from '../_graph/presets';

/**
 * A random bipartite graph: each vertex gets a side at random (A on side 0), and each pair on
 * opposite sides is an edge with probability `density`. Not always connected.
 */
export function randomBipartite(rng: Rng, n: number, density = 0.35): Graph {
  const names = letters(Math.max(2, Math.min(16, n)));
  const side = names.map((_, i) => (i === 0 ? 0 : rng.int(0, 1)));
  if (!side.includes(1)) side[names.length - 1] = 1;
  const edges: Edge[] = [];
  for (let i = 0; i < names.length; i++)
    for (let j = i + 1; j < names.length; j++)
      if (side[i] !== side[j] && rng.int(1, 100) <= density * 100 && edges.length < 50)
        edges.push({ u: names[i]!, v: names[j]!, w: 1 });
  return makeGraph({ directed: false, weighted: false, vertices: names, edges });
}

/** A tree with one extra edge between two vertices at the same depth: one odd cycle. */
export function treePlusOdd(rng: Rng, n: number): Graph {
  for (;;) {
    const t = randomTree(rng, Math.max(4, n));
    const depth: Record<string, number> = { A: 0 };
    for (const e of t.edges) depth[e.v] = depth[e.u]! + 1;
    const pairs: [string, string][] = [];
    for (const a of t.vertices)
      for (const b of t.vertices)
        if (a < b && depth[a] === depth[b] && !t.edges.some((e) => e.u === a && e.v === b))
          pairs.push([a, b]);
    if (pairs.length === 0) continue;
    const [u, v] = pairs[rng.int(0, pairs.length - 1)]!;
    return makeGraph({ ...t, edges: [...t.edges, { u, v, w: 1 }] });
  }
}
