/**
 * Flow networks, shared by the max-flow and min-cost-flow pages (and the bipartite-matching
 * page's concept of a unit network).
 *
 * A network is a directed graph (src/viz/_graph/graph.ts) whose weights are capacities, plus a
 * cost per arc, a source s and a sink t. It is plain data, so it can sit in a step's state.
 *
 * Text: the graph formats of ../_graph/parse.ts, where a weight is a capacity:
 *   s>a:16, s>b:13, a>c:12      arcs with capacities (a missing capacity is 1)
 *   a-b:5                        an undirected edge: an arc each way, each with capacity 5
 *   s>a:4:2                      capacity 4 and cost 2 per unit (edge lists only). A missing
 *                                cost is 1, so on its own the cheapest path is the shortest.
 * The adjacency-list and matrix formats work too, without costs.
 *
 * The source is the vertex named s (or S), else the first in name order. The sink is the
 * vertex named t (or T), else the last in name order. Capacities are whole numbers from 1 to
 * MAX_CAP and costs from 0 to MAX_COST.
 *
 * Flow is kept per arc. For a pair of arcs u -> v and v -> u, at most one carries flow: pushing
 * along u -> v first cancels flow on v -> u. So the residual capacity of u -> v is
 *   r(u, v) = c(u, v) - f(u, v) + f(v, u),
 * the same as with one net flow per pair of vertices (CLRS 26.2, and the code tabs' matrix).
 *
 * API
 *   parseNetwork(text, { costs })   -> Network or an Error that names the bad token
 *   formatNetwork(net, { costs })   -> edge-list text that parses back to the same network
 *   residual(net, flow, u, v)       r(u, v)
 *   residualArcs(net, flow)         every (u, v) with r(u, v) > 0, by u then v in name order
 *   push(net, flow, path, b)        a new flow: b more units along a residual path
 *   flowValue(net, flow)            the flow out of s minus the flow into s
 *   cutCapacity(net, side)          the capacity of the arcs from side to the rest
 *   costOf(net, flow)               the total cost of a flow
 *   order(net)                      s first, t last, the rest in name order (for tables)
 */
import { compareNames, keyOf, listWords, makeGraph, type Graph } from '../_graph/graph';
import { readGraph } from '../_graph/parse';

export const MAX_CAP = 99;
export const MAX_COST = 99;
export const MAX_ARCS = 50;

export interface Network {
  /** Directed and weighted: w is the capacity. */
  graph: Graph;
  /** Cost per unit of flow, by arc key "u-v". */
  cost: Record<string, number>;
  /** null when the network has fewer than two vertices. */
  s: string | null;
  t: string | null;
}

/** Flow per arc, by arc key "u-v". Missing means 0. */
export type Flow = Record<string, number>;

export const arcId = (u: string, v: string) => `${u}-${v}`;
export const arrow = (u: string, v: string) => `${u}→${v}`;
export const pathText = (p: string[]) => p.join(' → ');

const fail = (m: string) => new Error(m);

/** The vertex named like `name` (either case), else undefined. */
const named = (vs: string[], name: string) =>
  vs.find((v) => v === name) ?? vs.find((v) => v === name.toUpperCase());

export function pickEnds(vertices: string[]): { s: string | null; t: string | null } {
  if (vertices.length < 2) return { s: vertices[0] ?? null, t: null };
  const s = named(vertices, 's') ?? vertices[0]!;
  const t = named(vertices, 't') ?? [...vertices].reverse().find((v) => v !== s)!;
  return { s, t: t === s ? null : t };
}

export function makeNetwork(graph: Graph, cost: Record<string, number> = {}): Network {
  const g = makeGraph({ ...graph, directed: true, weighted: true });
  const c: Record<string, number> = {};
  for (const e of g.edges) c[keyOf(e)] = cost[keyOf(e)] ?? 1;
  return { graph: g, cost: c, ...pickEnds(g.vertices) };
}

const COST_ITEM =
  /([A-Za-z0-9_]+)\s*(->|>|-)\s*([A-Za-z0-9_]+)\s*:\s*(-?\d+)\s*:\s*(-?\d+(?:\.\d+)?)/g;

export interface ParseOptions {
  /** Read costs and check them (min-cost flow). Otherwise costs are read and ignored. */
  costs?: boolean;
  /** Refuse a pair of opposite arcs (min-cost flow, as CLRS assumes). */
  noAntiparallel?: boolean;
}

export function parseNetwork(raw: string, o: ParseOptions = {}): Network | Error {
  const text = String(raw ?? '').trim();
  if (!text) return fail('Type a network first, such as s>a:3, a>t:2, s>t:1.');
  // Pull out the costs (u>v:cap:cost), leaving u>v:cap for the graph reader.
  const costs: { u: string; v: string; both: boolean; cost: string; item: string }[] = [];
  const stripped = text.replace(COST_ITEM, (item, u, op, v, cap, cost) => {
    costs.push({ u, v, both: op === '-', cost, item });
    return `${u}${op}${v}:${cap}`;
  });
  const r = readGraph(stripped);
  if (r instanceof Error) return r;
  const g0 = r.graph;
  // Undirected edges become an arc each way.
  const arcs = g0.directed ? g0.edges : g0.edges.flatMap((e) => [e, { u: e.v, v: e.u, w: e.w }]);
  if (arcs.length > MAX_ARCS)
    return fail(
      `That is ${arcs.length} arcs (an undirected edge counts twice). Keep it to ${MAX_ARCS} so the drawing stays readable.`,
    );
  const caps = arcs.map((e) => ({ ...e, w: g0.weighted ? e.w : 1 }));
  for (const e of caps)
    if (e.w < 1 || e.w > MAX_CAP)
      return fail(
        `${arrow(e.u, e.v)} has capacity ${e.w}. Capacities are whole numbers from 1 to ${MAX_CAP}.`,
      );
  const graph = makeGraph({ directed: true, weighted: true, vertices: g0.vertices, edges: caps });
  const cost: Record<string, number> = {};
  for (const c of costs) {
    if (o.costs) {
      const n = Number(c.cost);
      if (!Number.isInteger(n) || n < 0 || n > MAX_COST)
        return fail(`"${c.item}": costs are whole numbers from 0 to ${MAX_COST}.`);
    }
    cost[arcId(c.u, c.v)] = Number(c.cost);
    if (c.both) cost[arcId(c.v, c.u)] = Number(c.cost);
  }
  if (o.noAntiparallel) {
    const has = new Set(graph.edges.map(keyOf));
    const pair = graph.edges.find((e) => has.has(arcId(e.v, e.u)));
    if (pair)
      return fail(
        `${arrow(pair.u, pair.v)} and ${arrow(pair.v, pair.u)} go both ways. Here each pair of vertices takes one direction only; put a new vertex in the middle of one of them, as CLRS does.`,
      );
  }
  return makeNetwork(graph, cost);
}

/** Edge-list text: s>a:16 (and :cost with costs). */
export function formatNetwork(net: Network, o: { costs?: boolean } = {}): string {
  const items = net.graph.edges.map(
    (e) => `${e.u}>${e.v}:${e.w}${o.costs ? `:${net.cost[keyOf(e)] ?? 1}` : ''}`,
  );
  const lone = net.graph.vertices.filter(
    (v) => !net.graph.edges.some((e) => e.u === v || e.v === v),
  );
  return [...items, ...lone].join(', ');
}

// ---------------------------------------------------------------------------------------------
// Residual network

const capCache = new WeakMap<Graph, Map<string, number>>();

function caps(g: Graph): Map<string, number> {
  let m = capCache.get(g);
  if (!m) {
    m = new Map(g.edges.map((e) => [keyOf(e), e.w]));
    capCache.set(g, m);
  }
  return m;
}

export const capOf = (net: Network, u: string, v: string): number =>
  caps(net.graph).get(arcId(u, v)) ?? 0;

export const hasArc = (net: Network, u: string, v: string): boolean =>
  caps(net.graph).has(arcId(u, v));

export const flowOn = (flow: Flow, u: string, v: string): number => flow[arcId(u, v)] ?? 0;

export function residual(net: Network, flow: Flow, u: string, v: string): number {
  return capOf(net, u, v) - flowOn(flow, u, v) + flowOn(flow, v, u);
}

/** Vertices joined to u by an arc either way, in name order. */
export function touching(net: Network, u: string): string[] {
  const out = new Set<string>();
  for (const e of net.graph.edges) {
    if (e.u === u) out.add(e.v);
    if (e.v === u) out.add(e.u);
  }
  return [...out].sort(compareNames);
}

/** Every residual arc (u, v, r), by u then v in name order. */
export function residualArcs(net: Network, flow: Flow): { u: string; v: string; r: number }[] {
  const out: { u: string; v: string; r: number }[] = [];
  for (const u of net.graph.vertices)
    for (const v of touching(net, u)) {
      const r = residual(net, flow, u, v);
      if (r > 0) out.push({ u, v, r });
    }
  return out;
}

/** b more units along the residual path p: cancel flow coming back first, then add. */
export function push(net: Network, flow: Flow, p: string[], b: number): Flow {
  const next = { ...flow };
  for (let i = 0; i + 1 < p.length; i++) {
    const u = p[i]!;
    const v = p[i + 1]!;
    const back = flowOn(next, v, u);
    const cancel = Math.min(back, b);
    if (cancel > 0) next[arcId(v, u)] = back - cancel;
    if (b - cancel > 0) next[arcId(u, v)] = flowOn(next, u, v) + b - cancel;
  }
  return next;
}

export function flowValue(net: Network, flow: Flow): number {
  const s = net.s;
  if (!s) return 0;
  let n = 0;
  for (const e of net.graph.edges) {
    if (e.u === s) n += flowOn(flow, e.u, e.v);
    if (e.v === s) n -= flowOn(flow, e.u, e.v);
  }
  return n;
}

export function cutArcs(net: Network, side: Iterable<string>) {
  const S = new Set(side);
  return net.graph.edges.filter((e) => S.has(e.u) && !S.has(e.v));
}

export function cutCapacity(net: Network, side: Iterable<string>): number {
  return cutArcs(net, side).reduce((n, e) => n + e.w, 0);
}

export function costOf(net: Network, flow: Flow): number {
  return net.graph.edges.reduce(
    (n, e) => n + flowOn(flow, e.u, e.v) * (net.cost[keyOf(e)] ?? 1),
    0,
  );
}

/** s first, t last, the rest in name order. */
export function order(net: Network): string[] {
  const rest = net.graph.vertices.filter((v) => v !== net.s && v !== net.t);
  return [...(net.s ? [net.s] : []), ...rest, ...(net.t ? [net.t] : [])];
}

/** Narration for a freshly loaded network. */
export function endsText(net: Network): string {
  if (!net.s || !net.t) return 'A network needs at least two vertices: a source and a sink.';
  const why = (v: string, name: string) =>
    v.toLowerCase() === name
      ? ''
      : ` (no vertex is named ${name}, so the ${name === 's' ? 'first' : 'last'} in name order)`;
  return `The source is ${net.s}${why(net.s, 's')} and the sink is ${net.t}${why(net.t, 't')}.`;
}

export function describeNetwork(net: Network, costs = false): string {
  const g = net.graph;
  const arcs = g.edges.map(
    (e) => `${arrow(e.u, e.v)} capacity ${e.w}${costs ? ` cost ${net.cost[keyOf(e)] ?? 1}` : ''}`,
  );
  const lone = g.vertices.filter((v) => !g.edges.some((e) => e.u === v || e.v === v));
  const ends = net.s && net.t ? ` Source ${net.s}, sink ${net.t}.` : '';
  const extra = lone.length
    ? ` ${listWords(lone)} ${lone.length === 1 ? 'has' : 'have'} no arcs.`
    : '';
  return `A flow network with ${g.vertices.length} ${g.vertices.length === 1 ? 'vertex' : 'vertices'} and ${g.edges.length} ${g.edges.length === 1 ? 'arc' : 'arcs'}.${ends} ${arcs.length ? `${arcs.join('; ')}.` : ''}${extra}`.trim();
}

/** A set of vertices: {s, a, b}, or { s } (spaced, so it never reads as a template slot). */
export const setText = (xs: string[]): string =>
  xs.length === 1 ? `{ ${xs[0]} }` : `{${xs.join(', ')}}`;
