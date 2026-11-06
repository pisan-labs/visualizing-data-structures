/**
 * Networks for presets, practice questions and tests. The source is s, the sink t, and the
 * vertices in between a, b, c, ... No pair of vertices has arcs both ways, so every network
 * here works on the min-cost-flow page too.
 *
 *   randomNetwork(rng, n, o)   n vertices in all: every vertex lies on some path from s to t
 *                              (each gets an arc in from earlier and an arc out to later in a
 *                              random order), plus extra arcs, a few of them backwards
 *   bottleneckNetwork(rng, n)  two clusters joined by one arc: the minimum cut is that arc
 *   parallelPaths(rng, n)      disjoint paths s -> x -> ... -> t of different widths
 *   matchingNetwork(rng, n)    s -> left, left -> right, right -> t, every capacity 1
 *   loadText(net, costs)       the load call for a network
 */
import type { Rng } from '../../engine/rng';
import type { OpCall } from '../../engine/types';
import { makeGraph, type Edge } from '../_graph/graph';
import { shuffle } from '../_graph/presets';
import { formatNetwork, makeNetwork, MAX_ARCS, type Network } from './network';

export interface NetOptions {
  /** Share of the possible extra arcs, 0 to 1. */
  density?: number;
  /** Capacities from 1 to maxCap. Default 9. */
  maxCap?: number;
  /** Costs from 0 to maxCost. Default 9. */
  maxCost?: number;
  /** Every capacity 1. */
  unit?: boolean;
}

const inner = (k: number) => 'abcdefghijklmn'.slice(0, Math.max(0, Math.min(14, k))).split('');

function build(rng: Rng, vertices: string[], pairs: [string, string][], o: NetOptions): Network {
  const seen = new Set<string>();
  const edges: Edge[] = [];
  for (const [u, v] of pairs) {
    if (u === v || seen.has(`${u}-${v}`) || seen.has(`${v}-${u}`)) continue;
    if (edges.length >= MAX_ARCS) break;
    seen.add(`${u}-${v}`);
    edges.push({ u, v, w: o.unit ? 1 : rng.int(1, o.maxCap ?? 9) });
  }
  const cost: Record<string, number> = {};
  for (const e of edges) cost[`${e.u}-${e.v}`] = rng.int(0, o.maxCost ?? 9);
  return makeNetwork(makeGraph({ directed: true, weighted: true, vertices, edges }), cost);
}

export function randomNetwork(rng: Rng, n: number, o: NetOptions = {}): Network {
  const mid = shuffle(rng, inner(n - 2));
  const chain = ['s', ...mid, 't'];
  const pairs: [string, string][] = [];
  // Each inner vertex: an arc in from an earlier vertex and an arc out to a later one.
  for (let i = 1; i < chain.length - 1; i++) {
    pairs.push([chain[rng.int(0, i - 1)]!, chain[i]!]);
    pairs.push([chain[i]!, chain[rng.int(i + 1, chain.length - 1)]!]);
  }
  if (mid.length === 0) pairs.push(['s', 't']);
  const extra: [string, string][] = [];
  for (let i = 0; i < chain.length; i++)
    for (let j = i + 1; j < chain.length; j++) {
      if (chain[i] === 's' && chain[j] === 't') continue;
      // Mostly forward; now and then backwards between inner vertices, which makes cycles.
      const back = chain[i] !== 's' && chain[j] !== 't' && rng.int(0, 4) === 0;
      extra.push(back ? [chain[j]!, chain[i]!] : [chain[i]!, chain[j]!]);
    }
  const want = Math.round((o.density ?? 0.2) * extra.length);
  pairs.push(...shuffle(rng, extra).slice(0, want));
  return build(rng, ['s', ...inner(n - 2), 't'], pairs, o);
}

/** Two clusters, s's and t's, joined by one narrow arc. */
export function bottleneckNetwork(rng: Rng, n: number): Network {
  const mid = inner(n - 2);
  const half = Math.ceil(mid.length / 2);
  const left = mid.slice(0, half);
  const right = mid.slice(half);
  const pairs: [string, string][] = [];
  const caps: Record<string, number> = {};
  const add = (u: string, v: string, w: number) => {
    pairs.push([u, v]);
    caps[`${u}-${v}`] = w;
  };
  for (const v of left) add('s', v, rng.int(5, 9));
  for (let i = 0; i + 1 < left.length; i++) add(left[i]!, left[i + 1]!, rng.int(3, 9));
  for (const v of right) add(v, 't', rng.int(5, 9));
  for (let i = 0; i + 1 < right.length; i++) add(right[i]!, right[i + 1]!, rng.int(3, 9));
  const a = left.at(-1) ?? 's';
  const b = right[0] ?? 't';
  add(a, b, rng.int(2, 4));
  const net = build(rng, ['s', ...mid, 't'], pairs, {});
  const edges = net.graph.edges.map((e) => ({ ...e, w: caps[`${e.u}-${e.v}`] ?? e.w }));
  return makeNetwork(makeGraph({ ...net.graph, edges }), net.cost);
}

/** Disjoint paths from s to t through the inner vertices, two or three vertices long. */
export function parallelPaths(rng: Rng, n: number): Network {
  const mid = inner(n - 2);
  const pairs: [string, string][] = [];
  let i = 0;
  while (i < mid.length) {
    const len = Math.min(mid.length - i, rng.int(1, 2));
    const run = mid.slice(i, i + len);
    pairs.push(['s', run[0]!]);
    for (let k = 0; k + 1 < run.length; k++) pairs.push([run[k]!, run[k + 1]!]);
    pairs.push([run.at(-1)!, 't']);
    i += len;
  }
  if (mid.length === 0) pairs.push(['s', 't']);
  return build(rng, ['s', ...mid, 't'], pairs, {});
}

/** A bipartite graph as a unit network: s -> left, left -> right, right -> t. */
export function matchingNetwork(rng: Rng, n: number): Network {
  const mid = inner(n - 2);
  const half = Math.ceil(mid.length / 2);
  const left = mid.slice(0, half);
  const right = mid.slice(half);
  const pairs: [string, string][] = [];
  for (const u of left) pairs.push(['s', u]);
  for (const v of right) pairs.push([v, 't']);
  for (const u of left) {
    const picks = shuffle(rng, right).slice(0, Math.min(right.length, rng.int(1, 2)));
    for (const v of picks) pairs.push([u, v]);
  }
  if (mid.length === 0) pairs.push(['s', 't']);
  return build(rng, ['s', ...mid, 't'], pairs, { unit: true });
}

export const loadText = (net: Network, costs = false): OpCall => [
  'load',
  formatNetwork(net, { costs }),
];
