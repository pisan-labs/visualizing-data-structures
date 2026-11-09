/** Graphs for the bipartite page's presets and practice. */
import type { Rng } from '../../engine/rng';
import { letters, makeGraph, type Edge, type Graph } from '../_graph/graph';
import { randomTree, shuffle } from '../_graph/presets';

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

/**
 * Connected, with exactly one odd cycle, of `len` edges: a cycle through `len` of the vertices,
 * the rest hung off it as trees, and sometimes one more edge inside a tree that closes an even
 * cycle. The names are shuffled, so A can be on the odd cycle or off it.
 */
export function oneOddCycle(rng: Rng, n: number, len: number): Graph {
  const m = Math.max(len, Math.min(16, n));
  const order = shuffle(rng, letters(m));
  const edges: Edge[] = [];
  for (let i = 0; i < len; i++) edges.push({ u: order[i]!, v: order[(i + 1) % len]!, w: 1 });
  // For each vertex off the cycle: its parent and the cycle vertex its tree hangs from.
  const parent = new Map<string, string>();
  const anchor = new Map<string, string>(order.slice(0, len).map((v) => [v, v]));
  for (let i = len; i < m; i++) {
    const v = order[i]!;
    const p = order[rng.int(0, i - 1)]!;
    parent.set(v, p);
    anchor.set(v, anchor.get(p)!);
    edges.push({ u: p, v, w: 1 });
  }
  const distance = (a: string, b: string) => {
    const up = new Map<string, number>();
    for (let x: string | undefined = a, k = 0; x; x = parent.get(x), k++) up.set(x, k);
    for (let x: string | undefined = b, k = 0; x; x = parent.get(x), k++)
      if (up.has(x)) return up.get(x)! + k;
    return -1;
  };
  const even: [string, string][] = [];
  for (let i = len; i < m; i++)
    for (let j = 0; j < m; j++) {
      const a = order[i]!;
      const b = order[j]!;
      const d = anchor.get(a) === anchor.get(b) ? distance(a, b) : -1;
      if (a !== b && d >= 3 && d % 2 === 1) even.push([a, b]);
    }
  if (even.length && rng.int(0, 1)) {
    const [u, v] = even[rng.int(0, even.length - 1)]!;
    edges.push({ u, v, w: 1 });
  }
  return makeGraph({ directed: false, weighted: false, vertices: order, edges });
}
