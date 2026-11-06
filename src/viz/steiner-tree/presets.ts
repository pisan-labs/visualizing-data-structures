/**
 * Graphs and terminals for the Steiner tree presets, practice and tests (undirected, weights
 * 1 to 9).
 *
 *   hiddenHub(k)          k terminals joined to each other by edges of weight 2, and a hub joined
 *                         to each by weight 1. The hub comes last in name order, so each shortest
 *                         path between two terminals is the direct edge (a tie with the way
 *                         through the hub). The approximation pays 2(k − 1), the star through the
 *                         hub k: the ratio 2 − 2/k, the worst the guarantee allows.
 *   randomSteiner(rng, n) a random weighted graph and about a third of its vertices as terminals
 *   setup(g, T)           the calls that load g, set T and run
 *   stPresets()           the page's presets
 */
import type { Rng } from '../../engine/rng';
import type { OpCall, Preset } from '../../engine/types';
import { letters, makeGraph, type Edge, type Graph } from '../_graph/graph';
import { gridGraph, loadCall, pathGraph, randomGraph, shuffle } from '../_graph/presets';

function reweigh(rng: Rng, g: Graph, lo = 1, hi = 9): Graph {
  return makeGraph({
    ...g,
    weighted: true,
    edges: g.edges.map((e) => ({ ...e, w: rng.int(lo, hi) })),
  });
}

export function hiddenHub(k: number): { graph: Graph; terminals: string[] } {
  const m = Math.max(3, Math.min(7, k));
  const names = letters(m + 1);
  const T = names.slice(0, m);
  const hub = names[m]!;
  const edges: Edge[] = [];
  for (let i = 0; i < m; i++) {
    for (let j = i + 1; j < m; j++) edges.push({ u: T[i]!, v: T[j]!, w: 2 });
    edges.push({ u: T[i]!, v: hub, w: 1 });
  }
  return {
    graph: makeGraph({ directed: false, weighted: true, vertices: names, edges }),
    terminals: T,
  };
}

export function randomSteiner(
  rng: Rng,
  n: number,
  density = 0.2,
): { graph: Graph; terminals: string[] } {
  const g = reweigh(rng, randomGraph(rng, Math.max(4, Math.min(12, n)), { density }));
  const k = Math.max(2, Math.round(g.vertices.length / 3));
  return { graph: g, terminals: shuffle(rng, g.vertices).slice(0, k).sort() };
}

export const setup = (g: Graph, T: string[]): OpCall[] => [loadCall(g), ['terminals', T.join(' ')]];

export function stPresets(): Preset[] {
  const p = (
    label: string,
    make: (rng: Rng, n: number) => { graph: Graph; terminals: string[] },
  ): Preset => ({
    label,
    make: (rng, n) => {
      const { graph, terminals } = make(rng, n);
      return [...setup(graph, terminals), ['run']];
    },
  });
  return [
    p('Random graph', (rng, n) => randomSteiner(rng, n)),
    p('Dense graph', (rng, n) => randomSteiner(rng, n, 0.5)),
    p('Bad case: a hidden hub', (_rng, n) => hiddenHub(n - 1)),
    p('Two terminals (a shortest path)', (rng, n) => {
      const g = reweigh(rng, randomGraph(rng, n, { density: 0.25 }));
      return { graph: g, terminals: [g.vertices[0]!, g.vertices.at(-1)!] };
    }),
    p('Every vertex a terminal (a spanning tree)', (rng, n) => {
      const g = reweigh(rng, randomGraph(rng, Math.min(n, 8), { density: 0.25 }));
      return { graph: g, terminals: g.vertices.slice(0, 8) };
    }),
    p('Grid, terminals at the corners', (rng, n) => {
      const g = reweigh(rng, gridGraph(Math.max(4, n)), 1, 4);
      const cols = Math.ceil(Math.sqrt(g.vertices.length));
      const vs = g.vertices;
      return {
        graph: g,
        terminals: [...new Set([vs[0]!, vs[cols - 1]!, vs[vs.length - 1]!])].sort(),
      };
    }),
    p('A path (the tree is forced)', (rng, n) => {
      const g = reweigh(rng, pathGraph(n));
      return {
        graph: g,
        terminals: [g.vertices[0]!, g.vertices[Math.floor(n / 2)]!, g.vertices.at(-1)!],
      };
    }),
  ];
}
