/**
 * Directed graphs for the topological sort page's presets, practice questions and tests.
 * Vertices are named A, B, C, ...; in the DAGs a hidden shuffled order decides which way each
 * arc points, so name order is not a topological order.
 *
 *   shuffledDag(rng, n, density)  a DAG: every vertex but the first in the hidden order has an
 *                                 arc in from an earlier one, plus `density` of the other pairs
 *   dagWithCycle(rng, n)          a shuffled DAG plus one arc that closes a cycle
 *   denseDag(rng, n)              every pair joined (at most 10 vertices, 45 arcs)
 *   backwardChain(n)              B>A, C>B, ...: name order is the reverse of the only order
 */
import type { Rng } from '../../engine/rng';
import { MAX_EDGES, MAX_VERTICES, letters, makeGraph, type Graph } from '../_graph/graph';
import { shuffle } from '../_graph/presets';

const clampN = (n: number, hi = MAX_VERTICES) => Math.max(2, Math.min(hi, Math.round(n)));

function build(names: string[], pairs: [string, string][]): Graph {
  const seen = new Set<string>();
  const edges = [];
  for (const [u, v] of pairs) {
    if (u === v || seen.has(`${u}>${v}`)) continue;
    seen.add(`${u}>${v}`);
    edges.push({ u, v, w: 1 });
  }
  return makeGraph({ directed: true, weighted: false, vertices: names, edges });
}

/** The hidden order and each vertex's parent in it (an arc parent -> vertex). */
function hidden(rng: Rng, n: number) {
  const names = letters(n);
  const order = shuffle(rng, names);
  const parent = new Map<string, string>();
  for (let i = 1; i < order.length; i++) parent.set(order[i]!, order[rng.int(0, i - 1)]!);
  return { names, order, parent };
}

export function shuffledDag(rng: Rng, n: number, density = 0.2): Graph {
  const { names, order, parent } = hidden(rng, clampN(n));
  const pairs: [string, string][] = [...parent].map(([v, p]) => [p, v]);
  const used = new Set(pairs.map(([a, b]) => `${a}>${b}`));
  const extra: [string, string][] = [];
  for (let i = 0; i < order.length; i++)
    for (let j = i + 1; j < order.length; j++)
      if (!used.has(`${order[i]}>${order[j]}`)) extra.push([order[i]!, order[j]!]);
  const want = Math.min(MAX_EDGES - pairs.length, Math.round(density * extra.length));
  return build(names, [...pairs, ...shuffle(rng, extra).slice(0, want)]);
}

export function dagWithCycle(rng: Rng, n: number): Graph {
  const m = clampN(n);
  const { names, order, parent } = hidden(rng, m);
  const pairs: [string, string][] = [...parent].map(([v, p]) => [p, v]);
  // The deepest vertex in the hidden tree points back to an ancestor.
  const depth = (v: string): number => (parent.has(v) ? 1 + depth(parent.get(v)!) : 0);
  const deepest = [...order].sort((a, b) => depth(b) - depth(a))[0]!;
  const up = [deepest];
  while (parent.has(up.at(-1)!)) up.push(parent.get(up.at(-1)!)!);
  const target = up[rng.int(1, up.length - 1)]!;
  const extra: [string, string][] = [];
  for (let i = 0; i < order.length; i++)
    for (let j = i + 1; j < order.length; j++) extra.push([order[i]!, order[j]!]);
  const more = shuffle(rng, extra).slice(0, Math.round(m / 3));
  return build(names, [...pairs, ...more, [deepest, target]]);
}

export function denseDag(rng: Rng, n: number): Graph {
  const order = shuffle(rng, letters(clampN(n, 10)));
  const pairs: [string, string][] = [];
  for (let i = 0; i < order.length; i++)
    for (let j = i + 1; j < order.length; j++) pairs.push([order[i]!, order[j]!]);
  return build(letters(order.length), pairs);
}

export function backwardChain(n: number): Graph {
  const names = letters(clampN(n));
  return build(
    names,
    names.slice(1).map((v, i) => [v, names[i]!]),
  );
}
