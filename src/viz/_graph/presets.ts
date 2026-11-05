/**
 * Graphs for presets, practice questions and tests. Vertices are named A, B, C, ... in order.
 *
 * Named shapes: pathGraph, cycleGraph, starGraph (A in the middle), completeGraph (at most 8
 * vertices, 28 edges), gridGraph (rows of ceil(sqrt n)), and the seeded randomTree,
 * twoComponents, randomDag (arcs only go from earlier to later letters) and randomGraph
 * (connected or not, directed or not, with a density from 0 to 1: the share of the possible
 * extra edges that are there).
 *
 * graphPresets(opts) is the list a graph page puts in `controls.presets`: each preset loads one
 * of these graphs (as edge-list text) and then runs `opts.then(graph)`, for example a search
 * from the first vertex. `loadCall(g)` is the load operation for a graph.
 */
import type { Rng } from '../../engine/rng';
import type { OpCall, Preset } from '../../engine/types';
import { MAX_EDGES, MAX_VERTICES, letters, makeGraph, type Edge, type Graph } from './graph';
import { formatGraph } from './parse';

const clampN = (n: number) => Math.max(1, Math.min(MAX_VERTICES, Math.round(n)));

function graph(n: number, pairs: [number, number][], directed = false, weights?: number[]): Graph {
  const names = letters(clampN(n));
  const edges: Edge[] = pairs.map(([a, b], i) => ({
    u: names[a]!,
    v: names[b]!,
    w: weights?.[i] ?? 1,
  }));
  return makeGraph({ directed, weighted: !!weights, vertices: names, edges });
}

export function shuffle<T>(rng: Rng, xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export function pathGraph(n: number): Graph {
  const m = clampN(n);
  return graph(
    m,
    Array.from({ length: m - 1 }, (_, i) => [i, i + 1]),
  );
}

export function cycleGraph(n: number): Graph {
  const m = Math.max(3, clampN(n));
  return graph(
    m,
    Array.from({ length: m }, (_, i) => [i, (i + 1) % m]),
  );
}

export function starGraph(n: number): Graph {
  const m = clampN(n);
  return graph(
    m,
    Array.from({ length: m - 1 }, (_, i) => [0, i + 1]),
  );
}

export function completeGraph(n: number): Graph {
  const m = Math.min(8, clampN(n));
  const pairs: [number, number][] = [];
  for (let i = 0; i < m; i++) for (let j = i + 1; j < m; j++) pairs.push([i, j]);
  return graph(m, pairs);
}

export function gridGraph(n: number): Graph {
  const m = clampN(n);
  const cols = Math.ceil(Math.sqrt(m));
  const pairs: [number, number][] = [];
  for (let i = 0; i < m; i++) {
    if ((i % cols) + 1 < cols && i + 1 < m) pairs.push([i, i + 1]);
    if (i + cols < m) pairs.push([i, i + cols]);
  }
  return graph(m, pairs);
}

/** Each vertex after A hangs off a random earlier one, so A is the root. */
function treePairs(rng: Rng, n: number, offset = 0): [number, number][] {
  return Array.from({ length: n - 1 }, (_, i) => [offset + rng.int(0, i), offset + i + 1]);
}

export function randomTree(rng: Rng, n: number): Graph {
  const m = clampN(n);
  return graph(m, treePairs(rng, m));
}

/** Extra pairs drawn from `candidates`: `density` of them, within the edge limit. */
function extras(
  rng: Rng,
  candidates: [number, number][],
  density: number,
  room: number,
): [number, number][] {
  const want = Math.min(room, Math.round(Math.max(0, Math.min(1, density)) * candidates.length));
  return shuffle(rng, candidates).slice(0, Math.max(0, want));
}

export interface RandomOptions {
  /** Share of the possible extra edges (beyond a spanning tree when connected), 0 to 1. */
  density?: number;
  directed?: boolean;
  /** Start from a spanning tree, so every vertex can be reached from A. Default true. */
  connected?: boolean;
  /** Weights from 1 to 9 instead of an unweighted graph. */
  weighted?: boolean;
}

export function randomGraph(rng: Rng, n: number, opts: RandomOptions = {}): Graph {
  const m = clampN(n);
  const density = opts.density ?? 0.25;
  const directed = !!opts.directed;
  const base = opts.connected === false ? [] : treePairs(rng, m);
  const used = new Set(base.map(([a, b]) => `${a},${b}`));
  const candidates: [number, number][] = [];
  for (let a = 0; a < m; a++) {
    for (let b = directed ? 0 : a + 1; b < m; b++) {
      if (a === b || used.has(`${a},${b}`) || (!directed && used.has(`${b},${a}`))) continue;
      candidates.push([a, b]);
    }
  }
  const pairs = [...base, ...extras(rng, candidates, density, MAX_EDGES - base.length)];
  const weights = opts.weighted ? pairs.map(() => rng.int(1, 9)) : undefined;
  return graph(m, pairs, directed, weights);
}

/** Two connected pieces: the first half of the letters and the rest. */
export function twoComponents(rng: Rng, n: number): Graph {
  const m = Math.max(2, clampN(n));
  const a = Math.ceil(m / 2);
  const b = m - a;
  const pairs = [...treePairs(rng, a), ...treePairs(rng, b, a)];
  // One extra edge in the bigger piece makes a cycle when there is room for one.
  if (a >= 3) {
    const x = rng.int(0, a - 3);
    const y = rng.int(x + 2, a - 1);
    if (!pairs.some(([p, q]) => (p === x && q === y) || (p === y && q === x))) pairs.push([x, y]);
  }
  return graph(m, pairs);
}

/** A DAG: arcs only from earlier to later letters, and every vertex after A has one in. */
export function randomDag(rng: Rng, n: number, density = 0.2): Graph {
  const m = clampN(n);
  const base = treePairs(rng, m);
  const used = new Set(base.map(([a, b]) => `${a},${b}`));
  const candidates: [number, number][] = [];
  for (let a = 0; a < m; a++)
    for (let b = a + 1; b < m; b++) if (!used.has(`${a},${b}`)) candidates.push([a, b]);
  return graph(m, [...base, ...extras(rng, candidates, density, MAX_EDGES - base.length)], true);
}

export const loadCall = (g: Graph): OpCall => ['load', formatGraph(g)];

export interface GraphPresetOptions {
  /** Operations to run after the graph loads, such as a search from its first vertex. */
  then?(g: Graph): OpCall[];
  /** Give the random graphs weights from 1 to 9. */
  weighted?: boolean;
}

/** The presets every graph page offers, in the order they appear. */
export function graphPresets(opts: GraphPresetOptions = {}): Preset[] {
  const make =
    (build: (rng: Rng, n: number) => Graph) =>
    (rng: Rng, n: number): OpCall[] => {
      const g = build(rng, n);
      return [loadCall(g), ...(opts.then?.(g) ?? [])];
    };
  const weighted = !!opts.weighted;
  return [
    {
      label: 'Random graph',
      make: make((rng, n) => randomGraph(rng, n, { density: 0.2, weighted })),
    },
    {
      label: 'Random directed graph',
      make: make((rng, n) => randomGraph(rng, n, { density: 0.12, directed: true, weighted })),
    },
    {
      label: 'Dense random graph',
      make: make((rng, n) => randomGraph(rng, n, { density: 0.55, weighted })),
    },
    { label: 'Path', make: make((_rng, n) => pathGraph(n)) },
    { label: 'Cycle', make: make((_rng, n) => cycleGraph(n)) },
    { label: 'Star', make: make((_rng, n) => starGraph(n)) },
    { label: 'Complete graph (8 vertices at most)', make: make((_rng, n) => completeGraph(n)) },
    { label: 'Grid', make: make((_rng, n) => gridGraph(n)) },
    { label: 'Tree', make: make((rng, n) => randomTree(rng, n)) },
    { label: 'Two components', make: make((rng, n) => twoComponents(rng, n)) },
    { label: 'DAG (directed, no cycles)', make: make((rng, n) => randomDag(rng, n)) },
  ];
}
