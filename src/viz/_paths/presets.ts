/**
 * Weighted graphs for the shortest-path pages' presets, practice questions and tests.
 *
 *   randomWeighted(rng, n, opts)   connected from A (a tree from A plus extra edges), weights
 *                                  1 to 9, directed or not
 *   randomWeightedDag(rng, n)      a DAG in which A reaches everything, with the other names
 *                                  shuffled so name order is not a topological order
 *   withNegativeEdges(rng, n)      directed, with cycles and negative edges but no negative
 *                                  cycle (weights shifted by vertex potentials, which leaves
 *                                  every cycle's weight as it was)
 *   negativeDag(rng, n)            a DAG with some negative weights
 *   withNegativeCycle(rng, n)      directed, with a negative cycle that A can reach
 *   cycleOutOfReach(rng, n)        directed, with a negative cycle that A cannot reach
 *   twoPieces(rng, n)              directed, connected from A in its first half only
 *   lowersEveryKey(n)              every edge lowers a key in Dijkstra (at most 10 vertices)
 *   backwardsPath(n)               a path whose edges are listed against its direction: the
 *                                  worst order for Bellman-Ford, run from its first vertex
 *   pathOrder(n)                   the same path listed along its direction: the best order
 *   withCycle(rng, n)              a DAG plus one arc that closes a cycle
 *   completeDag(n)                 every arc from earlier to later in a shuffled order
 *   equalWeights(rng, n)           every weight 1
 *
 * `pathsPreset(label, make, { from, allPairs })` makes a preset that loads one of these and runs
 * the page's algorithm from `from(g)` (default the first vertex), or with no start vertex.
 */
import type { Rng } from '../../engine/rng';
import type { OpCall, Preset } from '../../engine/types';
import {
  MAX_EDGES,
  MAX_VERTICES,
  letters,
  makeGraph,
  type Edge,
  type Graph,
} from '../_graph/graph';
import { loadCall, randomGraph, shuffle } from '../_graph/presets';

const clampN = (n: number, lo = 2, hi = MAX_VERTICES) => Math.max(lo, Math.min(hi, Math.round(n)));

function build(directed: boolean, names: string[], edges: Edge[]): Graph {
  const byKey = new Map<string, Edge>();
  for (const e of edges) {
    const key = directed ? `${e.u}>${e.v}` : [e.u, e.v].sort().join('-');
    if (e.u !== e.v) byKey.set(key, e);
  }
  return makeGraph({ directed, weighted: true, vertices: names, edges: [...byKey.values()] });
}

export interface WeightedOptions {
  directed?: boolean;
  density?: number;
  lo?: number;
  hi?: number;
}

/** Connected from A: every vertex hangs off an earlier one, plus extra edges. */
export function randomWeighted(rng: Rng, n: number, o: WeightedOptions = {}): Graph {
  const g = randomGraph(rng, clampN(n), {
    density: o.density ?? 0.2,
    directed: !!o.directed,
    weighted: true,
  });
  const lo = o.lo ?? 1;
  const hi = o.hi ?? 9;
  if (lo === 1 && hi === 9) return g;
  return build(
    g.directed,
    g.vertices,
    g.edges.map((e) => ({ ...e, w: rng.int(lo, hi) })),
  );
}

/** Index pairs a < b: a tree from 0 plus a share of the other pairs. */
function dagPairs(rng: Rng, m: number, density: number): [number, number][] {
  const pairs: [number, number][] = [];
  const used = new Set<string>();
  for (let i = 1; i < m; i++) {
    const a = rng.int(0, i - 1);
    pairs.push([a, i]);
    used.add(`${a},${i}`);
  }
  const extra: [number, number][] = [];
  for (let a = 0; a < m; a++)
    for (let b = a + 1; b < m; b++) if (!used.has(`${a},${b}`)) extra.push([a, b]);
  const want = Math.min(MAX_EDGES - pairs.length, Math.round(density * extra.length));
  return [...pairs, ...shuffle(rng, extra).slice(0, Math.max(0, want))];
}

/** The names for a DAG's topological positions: A first, the rest shuffled. */
function dagNames(rng: Rng, m: number): string[] {
  const names = letters(m);
  return [names[0]!, ...shuffle(rng, names.slice(1))];
}

export function randomWeightedDag(
  rng: Rng,
  n: number,
  o: { density?: number; lo?: number; hi?: number } = {},
): Graph {
  const m = clampN(n);
  const order = dagNames(rng, m);
  const edges = dagPairs(rng, m, o.density ?? 0.25).map(([a, b]) => ({
    u: order[a]!,
    v: order[b]!,
    w: rng.int(o.lo ?? 1, o.hi ?? 9),
  }));
  return build(true, letters(m), edges);
}

/** A DAG with weights from -4 to 9. */
export function negativeDag(rng: Rng, n: number): Graph {
  const g = randomWeightedDag(rng, n, { lo: -4, hi: 9 });
  if (g.edges.some((e) => e.w < 0) || g.edges.length === 0) return g;
  // Make sure at least one weight is negative.
  const k = rng.int(0, g.edges.length - 1);
  return build(
    true,
    g.vertices,
    g.edges.map((e, i) => (i === k ? { ...e, w: -rng.int(1, 4) } : e)),
  );
}

/**
 * Directed, with cycles, with negative edges and no negative cycle: weights 1 to 9 shifted by
 * potentials, w'(u, v) = w(u, v) + h(u) - h(v). Around any cycle the h terms cancel.
 */
export function withNegativeEdges(rng: Rng, n: number): Graph {
  const g = randomWeighted(rng, n, { directed: true, density: 0.15 });
  for (let tries = 0; tries < 20; tries++) {
    const h = new Map(g.vertices.map((v) => [v, rng.int(0, 6)]));
    const edges = g.edges.map((e) => ({ ...e, w: e.w + h.get(e.u)! - h.get(e.v)! }));
    if (edges.some((e) => e.w < 0)) return build(true, g.vertices, edges);
  }
  const k = g.edges.findIndex((e) => e.u !== 'A');
  return build(
    true,
    g.vertices,
    g.edges.map((e, i) => (i === k ? { ...e, w: -1 } : e)),
  );
}

/** Three distinct vertices other than A, for a cycle. */
function threeOthers(rng: Rng, names: string[]): [string, string, string] {
  const pick = shuffle(rng, names.slice(1)).slice(0, 3);
  return [pick[0]!, pick[1]!, pick[2]!];
}

/** Directed, connected from A, with a cycle of weight -1 to -3 through three other vertices. */
export function withNegativeCycle(rng: Rng, n: number): Graph {
  const g = randomWeighted(rng, Math.max(4, n), { directed: true, density: 0.1 });
  const [x, y, z] = threeOthers(rng, g.vertices);
  const a = rng.int(2, 5);
  const b = rng.int(1, 4);
  const c = -(a + b + rng.int(1, 3));
  return build(true, g.vertices, [
    ...g.edges,
    { u: x, v: y, w: a },
    { u: y, v: z, w: b },
    { u: z, v: x, w: c },
  ]);
}

/**
 * Directed: A's half is connected from A; the other half holds a negative cycle and an arc
 * into A's half, so the cycle can reach A but A cannot reach the cycle.
 */
export function cycleOutOfReach(rng: Rng, n: number): Graph {
  const m = clampN(n, 6);
  const names = letters(m);
  const half = Math.ceil(m / 2);
  const mine = names.slice(0, half);
  const rest = names.slice(half);
  const edges: Edge[] = [];
  for (let i = 1; i < mine.length; i++)
    edges.push({ u: mine[rng.int(0, i - 1)]!, v: mine[i]!, w: rng.int(1, 9) });
  const [x, y, z] = [rest[0]!, rest[1]!, rest[2]!];
  edges.push({ u: x, v: y, w: 2 }, { u: y, v: z, w: 1 }, { u: z, v: x, w: -5 });
  for (const v of rest.slice(3)) edges.push({ u: x, v, w: rng.int(1, 9) });
  edges.push({ u: rest[rng.int(0, rest.length - 1)]!, v: mine[rng.int(1, half - 1)]!, w: 2 });
  return build(true, names, edges);
}

/** Directed: A reaches the first half; the second half is a piece of its own. */
export function twoPieces(rng: Rng, n: number): Graph {
  const m = clampN(n, 4);
  const names = letters(m);
  const half = Math.ceil(m / 2);
  const edges: Edge[] = [];
  const piece = (from: number, to: number) => {
    for (let i = from + 1; i < to; i++)
      edges.push({ u: names[rng.int(from, i - 1)]!, v: names[i]!, w: rng.int(1, 9) });
  };
  piece(0, half);
  piece(half, m);
  if (half >= 3) edges.push({ u: names[1]!, v: names[half - 1]!, w: rng.int(1, 9) });
  return build(true, names, edges);
}

/**
 * The complete DAG on A, B, C, ... with w(i, j) = 2(j - i) - 1. Dijkstra settles them in name
 * order, and each one lowers the key of every vertex after it: V(V - 1)/2 DECREASE-KEYs.
 */
export function lowersEveryKey(n: number): Graph {
  const m = clampN(n, 3, 10);
  const names = letters(m);
  const edges: Edge[] = [];
  for (let i = 0; i < m; i++)
    for (let j = i + 1; j < m; j++) edges.push({ u: names[i]!, v: names[j]!, w: 2 * (j - i) - 1 });
  return build(true, names, edges);
}

/**
 * A path that starts at the last letter and walks back to A: H>G, G>F, ..., B>A. Sorted by
 * tail, its edges come in the opposite order to the path, so Bellman-Ford from H finds one
 * more vertex per pass and needs all V - 1 passes.
 */
export function backwardsPath(rng: Rng, n: number): Graph {
  const m = clampN(n, 3);
  const names = letters(m);
  const edges: Edge[] = [];
  for (let i = m - 1; i > 0; i--) edges.push({ u: names[i]!, v: names[i - 1]!, w: rng.int(1, 9) });
  return build(true, names, edges);
}

/** A path from A to the last letter in name order: one pass of Bellman-Ford finds it all. */
export function pathOrder(rng: Rng, n: number): Graph {
  const m = clampN(n, 3);
  const names = letters(m);
  const edges: Edge[] = [];
  for (let i = 0; i + 1 < m; i++) edges.push({ u: names[i]!, v: names[i + 1]!, w: rng.int(1, 9) });
  return build(true, names, edges);
}

/**
 * A DAG from A plus one arc from a vertex back up to an ancestor other than A, which closes a
 * cycle (or, when every vertex hangs off A, two of A's children joined both ways).
 */
export function withCycle(rng: Rng, n: number): Graph {
  const m = clampN(n, 4);
  const order = dagNames(rng, m);
  const pairs = dagPairs(rng, m, 0.15);
  // The first m - 1 pairs are the tree from A.
  const parent = new Map(pairs.slice(0, m - 1).map(([a, b]) => [b, a]));
  const edges = pairs.map(([a, b]) => ({ u: order[a]!, v: order[b]!, w: rng.int(1, 9) }));
  for (let p = m - 1; p >= 2; p--) {
    let q = parent.get(p)!;
    if (q === 0) continue;
    while (parent.get(q) !== 0) q = parent.get(q)!;
    edges.push({ u: order[p]!, v: order[q]!, w: rng.int(1, 9) });
    return build(true, letters(m), edges);
  }
  edges.push(
    { u: order[1]!, v: order[2]!, w: rng.int(1, 9) },
    { u: order[2]!, v: order[1]!, w: rng.int(1, 9) },
  );
  return build(true, letters(m), edges);
}

/** Every arc from earlier to later in a shuffled order (A first): the densest DAG. */
export function completeDag(rng: Rng, n: number): Graph {
  const m = clampN(n, 2, 10);
  const order = dagNames(rng, m);
  const edges: Edge[] = [];
  for (let i = 0; i < m; i++)
    for (let j = i + 1; j < m; j++) edges.push({ u: order[i]!, v: order[j]!, w: rng.int(1, 9) });
  return build(true, letters(m), edges);
}

/** Directed and connected from A, every weight 1: the distances are BFS's edge counts. */
export function equalWeights(rng: Rng, n: number): Graph {
  const g = randomWeighted(rng, n, { directed: true, density: 0.15 });
  return build(
    true,
    g.vertices,
    g.edges.map((e) => ({ ...e, w: 1 })),
  );
}

export interface PathsPresetOptions {
  /** The vertex to run from; default the first vertex. */
  from?(g: Graph): string;
  /** Run without a start vertex (Floyd-Warshall). */
  allPairs?: boolean;
}

/** A preset that loads a graph and runs the page's algorithm on it. */
export function pathsPreset(
  label: string,
  make: (rng: Rng, n: number) => Graph,
  o: PathsPresetOptions = {},
): Preset {
  return {
    label,
    make: (rng, n) => {
      const g = make(rng, n);
      const run: OpCall = o.allPairs ? ['run'] : ['run', o.from?.(g) ?? g.vertices[0]!];
      return [loadCall(g), run];
    },
  };
}

/** The first vertex of a backwards path: the last letter. */
export const lastVertex = (g: Graph): string => g.vertices.at(-1)!;
