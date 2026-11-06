/**
 * Graphs for the vertex cover presets, practice and tests (undirected, unweighted).
 *
 *   disjointEdges(n)  n/2 edges with no shared vertex: the matching method takes twice the optimum
 *   greedyTrap(k)     the bipartite graph where greedy by degree takes the wrong side: k vertices
 *                     on the right (the optimum), and for each i from k down to 2, ⌊k/i⌋ vertices
 *                     on the left, each joined to i of them. Left vertices come first in name
 *                     order, so ties go against greedy too. greedyTrap(6) has 14 vertices: greedy
 *                     takes the 8 on the left, the optimum is the 6 on the right.
 *   vcPresets()       the page's presets
 */
import type { Rng } from '../../engine/rng';
import type { OpCall, Preset } from '../../engine/types';
import { letters, makeGraph, type Edge, type Graph } from '../_graph/graph';
import {
  completeGraph,
  cycleGraph,
  gridGraph,
  loadCall,
  pathGraph,
  randomGraph,
  randomTree,
  starGraph,
} from '../_graph/presets';

export function disjointEdges(n: number): Graph {
  const m = Math.max(1, Math.min(8, Math.floor(n / 2)));
  const names = letters(2 * m);
  const edges: Edge[] = Array.from({ length: m }, (_, i) => ({
    u: names[2 * i]!,
    v: names[2 * i + 1]!,
    w: 1,
  }));
  return makeGraph({ directed: false, weighted: false, vertices: names, edges });
}

export function greedyTrap(k = 6): Graph {
  const right: number[][] = [];
  for (let i = k; i >= 2; i--)
    for (let b = 0; b < Math.floor(k / i); b++)
      right.push(Array.from({ length: i }, (_, t) => b * i + t));
  const names = letters(right.length + k);
  const left = names.slice(0, right.length);
  const side = names.slice(right.length);
  const edges: Edge[] = [];
  right.forEach((ls, r) => ls.forEach((l) => edges.push({ u: left[r]!, v: side[l]!, w: 1 })));
  return makeGraph({ directed: false, weighted: false, vertices: names, edges });
}

export const GREEDY_TRAP_TEXT =
  'A-I, A-J, A-K, A-L, A-M, A-N, B-I, B-J, B-K, B-L, B-M, C-I, C-J, C-K, C-L, D-I, D-J, D-K, E-L, E-M, E-N, F-I, F-J, G-K, G-L, H-M, H-N';

export function vcPresets(): Preset[] {
  const p = (label: string, make: (rng: Rng, n: number) => Graph): Preset => ({
    label,
    make: (rng, n) => [loadCall(make(rng, n)), ['run'] as OpCall],
  });
  return [
    p('Random graph', (rng, n) => randomGraph(rng, n, { density: 0.25 })),
    p('Dense graph', (rng, n) => randomGraph(rng, n, { density: 0.6 })),
    p('Random tree', randomTree),
    p('Disjoint edges (the matching takes twice the optimum)', (_rng, n) => disjointEdges(n)),
    p('Star (one vertex covers it all)', (_rng, n) => starGraph(n)),
    p('Path', (_rng, n) => pathGraph(n)),
    p('Cycle', (_rng, n) => cycleGraph(n)),
    p('Grid', (_rng, n) => gridGraph(n)),
    p('Complete graph (8 vertices at most)', (_rng, n) => completeGraph(n)),
    p('Bad case for greedy (14 vertices)', () => greedyTrap(6)),
  ];
}
