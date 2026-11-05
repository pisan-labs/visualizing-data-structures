/**
 * Undirected graphs for the cut vertices and bridges page: presets, practice and tests.
 *
 *   blocks(rng, n)   cycles of 3 or 4 vertices strung together, each joined to the one before
 *                    either at a shared vertex (a cut vertex) or by a single edge (a bridge),
 *                    with an occasional leaf hanging off. Vertices are A, B, C, ... in order.
 *   rootInMiddle(n)  two cycles that meet at A, so the DFS root has two children
 */
import type { Rng } from '../../engine/rng';
import { MAX_VERTICES, letters, makeGraph, type Edge, type Graph } from '../_graph/graph';

const clampN = (n: number) => Math.max(3, Math.min(MAX_VERTICES, Math.round(n)));

function build(names: string[], pairs: [string, string][]): Graph {
  const seen = new Set<string>();
  const edges: Edge[] = [];
  for (const [u, v] of pairs) {
    const k = [u, v].sort().join('-');
    if (u === v || seen.has(k)) continue;
    seen.add(k);
    edges.push({ u, v, w: 1 });
  }
  return makeGraph({ directed: false, weighted: false, vertices: names, edges });
}

export function blocks(rng: Rng, n: number): Graph {
  const names = letters(clampN(n));
  const pairs: [string, string][] = [];
  let i = 0;
  let last: string | null = null;
  while (i < names.length) {
    const left = names.length - i;
    if (left <= 2) {
      // A tail: each remaining vertex hangs off the one before.
      for (; i < names.length; i++) {
        if (last) pairs.push([last, names[i]!]);
        last = names[i]!;
      }
      break;
    }
    const size = Math.min(left, rng.int(3, 4));
    const shared: boolean = last !== null && rng.int(0, 1) === 0;
    const ring: string[] = shared
      ? [last!, ...names.slice(i, i + size - 1)]
      : names.slice(i, i + size);
    i += shared ? size - 1 : size;
    if (last !== null && !shared) pairs.push([last, ring[0]!]);
    ring.forEach((v, k) => pairs.push([v, ring[(k + 1) % ring.length]!]));
    last = ring[ring.length - 1]!;
  }
  return build(names, pairs);
}

export function rootInMiddle(n: number): Graph {
  const names = letters(clampN(n));
  const half = Math.ceil((names.length - 1) / 2);
  const a = names.slice(1, 1 + half);
  const b = names.slice(1 + half);
  const pairs: [string, string][] = [];
  for (const ring of [a, b]) {
    const cyc = ['A', ...ring];
    if (cyc.length < 2) continue;
    cyc.forEach((v, k) => {
      if (k + 1 < cyc.length) pairs.push([v, cyc[k + 1]!]);
    });
    if (cyc.length >= 3) pairs.push([cyc[cyc.length - 1]!, 'A']);
  }
  return build(names, pairs);
}
