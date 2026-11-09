/**
 * Steiner tree: connect the terminals, a chosen set of vertices, by the lightest tree. The tree
 * may use other vertices (Steiner vertices) when that helps. Every run ends by setting the tree
 * it found against the optimum (found by brute force, without steps) and giving the ratio.
 *
 * Settings
 *   method  'approx'  the metric-closure 2-approximation: shortest paths between every two
 *                     terminals, a minimum spanning tree over those distances (the closure), each
 *                     of its edges expanded back into its path, a minimum spanning tree of what
 *                     that gives, and Steiner vertices that end up as leaves pruned. At most
 *                     twice the optimum (2 − 2/t, for t terminals).
 *           'exact'   brute force: for every set S of Steiner vertices (fewest first), a minimum
 *                     spanning tree of the graph induced by the terminals and S. The lightest one
 *                     is a minimum Steiner tree. 2^(V − t) sets.
 *   layout  the drawing only
 *
 * Ties are broken by name everywhere, as the code tabs do: Prim with an array (./kit.ts
 * arrayPrim), and a shortest path from s to t is traced back from t, each time through the
 * neighbour with the earliest name that lies on a shortest path.
 *
 * Weights must be positive. A directed graph is refused. The state is the graph and its
 * terminals; a run's bookkeeping travels in the steps' `extra`.
 */
import type { Mark, OpSpec, PseudoBlock, Scalar, Step } from '../../engine/types';
import type { GraphTemplate } from '../../layouts/graph';
import { edgeId, vertexId } from '../../layouts/graph';
import { arrayPrim, ratioText, subsetsBySize } from '../_approx/kit';
import {
  adjacency,
  compareNames,
  describeGraph,
  edgeKey,
  findEdge,
  listWords,
  makeGraph,
  plural,
  sortNames,
  summary,
  type Graph,
} from '../_graph/graph';
import { graphVars } from '../_graph/kit';
import { FORMAT_NAMES, parseGraph, readGraph } from '../_graph/parse';

export interface StState {
  graph: Graph;
  /** In name order. */
  terminals: string[];
}

export type StMethod = 'approx' | 'exact';

export interface StSettings {
  [key: string]: Scalar;
  method: StMethod;
  layout: GraphTemplate;
}

export const defaults: StSettings = { method: 'approx', layout: 'force' };

export const MAX_TERMINALS = 8;

/** 8 vertices, terminals A, E, G and H. */
export const START_TEXT =
  'A-B:3, A-C:4, B-C:2, B-D:3, C-E:4, C-F:2, D-F:2, D-G:4, E-F:3, F-H:3, G-H:3';
export const START_TERMINALS = ['A', 'E', 'G', 'H'];

export function init(): StState {
  return { graph: makeGraph(parseGraph(START_TEXT) as Graph), terminals: [...START_TERMINALS] };
}

export interface StRun {
  method: StMethod;
  T: string[];
  /** Closure distances found so far, by "a|b" with a before b. */
  dist: Record<string, number>;
  /** The closure's minimum spanning tree so far: terminal pairs with their distance. */
  closure: { a: string; b: string; w: number }[];
  /** The edges of the graph in the tree (or subgraph) so far, by key. */
  tree: string[];
  /** The edges of the path being looked at. */
  path: string[];
  /** Edges taken out (a cycle, a pruned leaf). */
  removed: string[];
  weight: number;
  /** The optimum, a minimum tree and its Steiner vertices. */
  opt: number;
  optTree: string[];
  /** Exact: sets tried, the current set of Steiner vertices, the best weight so far. */
  tried: number;
  S: string[];
  best: number | null;
  /** A vertex being looked at. */
  at?: string;
  final?: boolean;
}

export interface StExtra {
  run?: StRun;
}

type S = StState;
type X = StExtra;
type Op = OpSpec<S, StSettings, X>;
type TStep = Step<S, X>;

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });
export const pairKey = (a: string, b: string) =>
  compareNames(a, b) <= 0 ? `${a}|${b}` : `${b}|${a}`;

/** Panel ids (see view.ts). */
export const closureCellId = (row: string, col: string) => `cl-${row}-${col}`;
export const mstCellId = (a: string, b: string) => `cm-${a}-${b}`;

// ---------------------------------------------------------------------------------------------
// The algorithms without steps. Tests, practice and the optimum use these.

/** Shortest distances from s (Dijkstra with an array; weights are positive). */
export function distancesFrom(g: Graph, s: string): Map<string, number> {
  const d = new Map<string, number>([[s, 0]]);
  const done = new Set<string>();
  for (;;) {
    let u: string | null = null;
    for (const v of g.vertices)
      if (!done.has(v) && d.has(v) && (u === null || d.get(v)! < d.get(u)!)) u = v;
    if (u === null) return d;
    done.add(u);
    for (const a of adjacency(g).get(u)!) {
      const c = d.get(u)! + a.w;
      if (!d.has(a.v) || c < d.get(a.v)!) d.set(a.v, c);
    }
  }
}

/** A shortest path from s to t, traced back from t through the earliest-named neighbour. */
export function shortestPath(g: Graph, d: Map<string, number>, t: string): string[] {
  const path = [t];
  let v = t;
  while (d.get(v) !== 0) {
    const prev = adjacency(g)
      .get(v)!
      .find((a) => d.has(a.v) && d.get(a.v)! + a.w === d.get(v));
    v = prev!.v;
    path.unshift(v);
  }
  return path;
}

const pathEdges = (g: Graph, p: string[]) => p.slice(1).map((v, i) => edgeKey(g, p[i]!, v));

/** The weight of a minimum spanning tree of the graph induced by `names`, or null if it is not connected. */
export function inducedMst(g: Graph, names: string[]): { w: number; edges: string[] } | null {
  const inside = new Set(names);
  const r = arrayPrim(sortNames(names), (u, v) =>
    inside.has(u) && inside.has(v) ? (findEdge(g, u, v)?.w ?? null) : null,
  );
  if (!r.spans) return null;
  return {
    w: r.edges.reduce((a, e) => a + e.w, 0),
    edges: r.edges.map((e) => edgeKey(g, e.parent, e.child)),
  };
}

/** A minimum Steiner tree by brute force: the lightest induced MST, fewest Steiner vertices first. */
export function exactSteiner(g: Graph, T: string[]): { w: number; edges: string[] } {
  if (T.length <= 1) return { w: 0, edges: [] };
  const others = g.vertices.filter((v) => !T.includes(v));
  let best: { w: number; edges: string[] } | null = null;
  for (const S of subsetsBySize(others)) {
    const m = inducedMst(g, [...T, ...S]);
    if (m && (!best || m.w < best.w)) best = m;
  }
  return best ?? { w: Infinity, edges: [] };
}

/** Repeatedly drop a leaf that is not a terminal. Returns the edges left and those dropped. */
function prune(
  g: Graph,
  tree: string[],
  T: string[],
): { kept: string[]; gone: [string, string][] } {
  let kept = [...tree];
  const gone: [string, string][] = [];
  for (;;) {
    const deg = new Map<string, number>();
    for (const k of kept) for (const v of k.split('-')) deg.set(v, (deg.get(v) ?? 0) + 1);
    const leaf = sortNames(deg.keys()).find((v) => deg.get(v) === 1 && !T.includes(v));
    if (!leaf) return { kept, gone };
    const k = kept.find((x) => x.split('-').includes(leaf))!;
    kept = kept.filter((x) => x !== k);
    gone.push([leaf, k]);
  }
}

const byEdgeOrder = (g: Graph) => {
  const order = new Map(g.edges.map((e, i) => [`${e.u}-${e.v}`, i]));
  return (a: string, b: string) => order.get(a)! - order.get(b)!;
};

const weightOf = (g: Graph, keys: string[]) =>
  keys.reduce((a, k) => {
    const [u, v] = k.split('-') as [string, string];
    return a + findEdge(g, u, v)!.w;
  }, 0);

/** The metric-closure 2-approximation without steps: the tree's edges and weight. */
export function approxSteiner(g: Graph, T: string[]): { w: number; edges: string[] } {
  if (T.length <= 1) return { w: 0, edges: [] };
  const d = new Map(T.map((t) => [t, distancesFrom(g, t)]));
  const closure = arrayPrim(T, (a, b) => d.get(a)!.get(b) ?? null).edges;
  const H = new Set<string>();
  for (const e of closure)
    for (const k of pathEdges(g, shortestPath(g, d.get(e.parent)!, e.child))) H.add(k);
  const names = sortNames(new Set([...T, ...[...H].flatMap((k) => k.split('-'))]));
  const r = arrayPrim(names, (u, v) => (H.has(edgeKey(g, u, v)) ? findEdge(g, u, v)!.w : null));
  const tree = r.edges.map((e) => edgeKey(g, e.parent, e.child));
  const kept = prune(g, tree, T).kept.sort(byEdgeOrder(g));
  return { w: weightOf(g, kept), edges: kept };
}

// ---------------------------------------------------------------------------------------------
// Words

const edgesText = (keys: string[]) => (keys.length ? listWords(keys) : 'none');

function runVars(g: Graph, r: StRun): Record<string, Scalar> {
  const vars: Record<string, Scalar> = {
    ...graphVars(g),
    t: r.T.length,
    weight: r.weight,
    optimum: r.opt,
    ratio: r.final ? ratioText(r.weight, r.opt) : '–',
  };
  if (r.method === 'exact') {
    vars.sets = r.tried;
    vars.best = r.best ?? '∞';
  }
  return vars;
}

function clone(r: StRun): StRun {
  return {
    ...r,
    T: [...r.T],
    dist: { ...r.dist },
    closure: r.closure.map((c) => ({ ...c })),
    tree: [...r.tree],
    path: [...r.path],
    removed: [...r.removed],
    optTree: [...r.optTree],
    S: [...r.S],
  };
}

/** Steiner vertices in a set of edges: their ends that are not terminals. */
export function steinerIn(keys: string[], T: string[]): string[] {
  return sortNames(new Set(keys.flatMap((k) => k.split('-')).filter((v) => !T.includes(v))));
}

/** Why the page cannot run on this state, or null. */
export function refusal(s: S): string | null {
  const g = s.graph;
  if (g.directed)
    return 'A Steiner tree joins vertices, and its edges have no direction. This graph is directed: load it with - instead of >, such as A-B:4, and run again.';
  const bad = g.edges.find((e) => e.w <= 0);
  if (bad)
    return `${bad.u}-${bad.v} has weight ${bad.w}. Steiner trees here need positive weights, so that a shortest path never runs in a circle.`;
  if (s.terminals.length > 1) {
    const d = distancesFrom(g, s.terminals[0]!);
    const cut = s.terminals.find((t) => !d.has(t));
    if (cut)
      return `No tree joins ${s.terminals[0]} and ${cut}: they are in different pieces of the graph. Pick terminals in one piece, or add an edge.`;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// The run

type StepFn = (say: string, lines: string[], level: 1 | 2 | 3, marks?: Mark[]) => TStep;

const run: Op = {
  label: 'Find a tree',
  arity: 0,
  *run(s, _args, { settings }) {
    const g = s.graph;
    const no = refusal(s);
    if (no) {
      yield { state: s, marks: [], say: no, lines: ['sig'], level: 1, vars: graphVars(g) };
      return s;
    }
    const T = s.terminals;
    const method = settings.method;
    const best = exactSteiner(g, T);
    const r: StRun = {
      method,
      T: [...T],
      dist: {},
      closure: [],
      tree: [],
      path: [],
      removed: [],
      weight: 0,
      opt: best.w,
      optTree: best.edges,
      tried: 0,
      S: [],
      best: null,
    };
    const step: StepFn = (say, lines, level, marks = []) => ({
      state: s,
      marks,
      say,
      lines,
      level,
      vars: runVars(g, r),
      extra: { run: clone(r) },
    });
    if (T.length <= 1) {
      r.final = true;
      yield step(
        T.length === 0
          ? 'There are no terminals, so there is nothing to connect. Set some with Set terminals, such as A D F.'
          : `There is one terminal, ${T[0]}, so the tree is just ${T[0]}: weight 0. Set more with Set terminals, such as A D F.`,
        ['sig'],
        1,
      );
      return s;
    }
    if (method === 'approx') yield* approxSteps(g, r, step);
    else yield* exactSteps(g, r, step);

    r.final = true;
    r.path = [];
    r.at = undefined;
    const steiner = steinerIn(r.tree, T);
    const verdict =
      r.weight === r.opt
        ? 'That is a minimum Steiner tree: ratio 1.'
        : `A minimum Steiner tree weighs ${r.opt} (${edgesText(r.optTree)}): ratio ${ratioText(r.weight, r.opt)}.`;
    const bound =
      method === 'approx'
        ? ` The guarantee says at most (2 − 2/${T.length}) × ${r.opt} = ${Math.round((2 - 2 / T.length) * r.opt * 100) / 100} for ${T.length} terminals, under 2 × ${r.opt}.`
        : '';
    yield step(
      `The tree joins ${listWords(T)} with ${plural(r.tree.length, 'edge')}, weight ${r.weight}${steiner.length ? `, through Steiner ${steiner.length === 1 ? 'vertex' : 'vertices'} ${listWords(steiner)}` : ', without Steiner vertices'}. ${verdict}${bound}`,
      [method === 'approx' ? 'a.ret' : 'x.ret'],
      1,
      [...r.tree.map((k) => mark(edgeId(k), 'done')), ...T.map((t) => mark(vertexId(t), 'done'))],
    );
    return s;
  },
};

function* approxSteps(g: Graph, r: StRun, step: StepFn) {
  const T = r.T;
  yield step(
    `Step 1: the distance between every two terminals, along a shortest path. That gives a complete graph on ${listWords(T)}, the metric closure.`,
    ['sig', 'a.dist'],
    2,
    T.map((t) => mark(vertexId(t), 'visit')),
  );
  const d = new Map(T.map((t) => [t, distancesFrom(g, t)]));
  const paths = new Map<string, string[]>();
  for (let i = 0; i < T.length; i++) {
    for (let j = i + 1; j < T.length; j++) {
      const a = T[i]!;
      const b = T[j]!;
      const p = shortestPath(g, d.get(a)!, b);
      const w = d.get(a)!.get(b)!;
      paths.set(pairKey(a, b), p);
      r.dist[pairKey(a, b)] = w;
      r.path = pathEdges(g, p);
      r.at = b;
      yield step(`A shortest path from ${a} to ${b}: ${p.join('-')}, length ${w}.`, ['a.dist'], 3, [
        ...r.path.map((k) => mark(edgeId(k), 'active')),
        mark(closureCellId(a, b), 'new'),
        mark(closureCellId(b, a), 'new'),
      ]);
    }
  }
  r.path = [];
  r.at = undefined;
  yield step(
    `The closure table holds ${T.length === 2 ? 'the one distance' : `all ${(T.length * (T.length - 1)) / 2} distances`}. Step 2: a minimum spanning tree of the closure, with Prim from ${T[0]}.`,
    ['a.dist', 'a.mst'],
    2,
  );
  const closure = arrayPrim(T, (a, b) => d.get(a)!.get(b) ?? null).edges;
  for (const e of closure) {
    r.closure.push({ a: e.parent, b: e.child, w: e.w });
    const p = paths.get(pairKey(e.parent, e.child))!;
    r.path = pathEdges(g, p);
    yield step(
      `The closest terminal to the closure tree is ${e.child}, at ${e.w} from ${e.parent}. Add ${e.parent}-${e.child} (${e.w}) to the closure tree. It stands for the path ${p.join('-')}.`,
      ['a.mst'],
      2,
      [...r.path.map((k) => mark(edgeId(k), 'active')), mark(mstCellId(e.parent, e.child), 'new')],
    );
  }
  const cw = closure.reduce((a, e) => a + e.w, 0);
  r.path = [];
  yield step(
    `The closure tree weighs ${cw}. Step 3: put each of its edges back as its path in the graph.`,
    ['a.expand'],
    2,
  );
  const H: string[] = [];
  for (const e of closure) {
    const p = paths.get(pairKey(e.parent, e.child))!;
    const keys = pathEdges(g, p);
    const fresh = keys.filter((k) => !H.includes(k));
    H.push(...fresh);
    r.tree = [...H];
    r.weight = weightOf(g, r.tree);
    r.path = keys;
    yield step(
      `${e.parent}-${e.child} becomes ${p.join('-')}.${fresh.length < keys.length ? ` ${listWords(keys.filter((k) => !fresh.includes(k)))} ${keys.length - fresh.length === 1 ? 'is' : 'are'} there already: paths can share edges, which is how the result can weigh less than the closure tree.` : ''} Edges so far weigh ${r.weight}.`,
      ['a.expand'],
      3,
      fresh.map((k) => mark(edgeId(k), 'new')),
    );
  }
  r.path = [];
  r.tree.sort(byEdgeOrder(g));
  r.weight = weightOf(g, r.tree);
  const names = sortNames(new Set([...T, ...r.tree.flatMap((k) => k.split('-'))]));
  const mst = arrayPrim(names, (u, v) =>
    r.tree.includes(edgeKey(g, u, v)) ? findEdge(g, u, v)!.w : null,
  ).edges.map((e) => edgeKey(g, e.parent, e.child));
  const cycle = r.tree.filter((k) => !mst.includes(k));
  yield step(
    `The paths give ${plural(r.tree.length, 'edge')}, weight ${r.weight} ≤ ${cw}. Step 4: a minimum spanning tree of just these edges, in case the paths made a cycle.`,
    ['a.expand', 'a.tree'],
    2,
    r.tree.map((k) => mark(edgeId(k), 'new')),
  );
  if (cycle.length) {
    r.tree = mst.sort(byEdgeOrder(g));
    r.removed.push(...cycle);
    r.weight = weightOf(g, r.tree);
    yield step(
      `They did: ${edgesText(cycle)} closed a cycle, so the tree leaves ${cycle.length === 1 ? 'it' : 'them'} out. Weight ${r.weight}.`,
      ['a.tree'],
      2,
      cycle.map((k) => mark(edgeId(k), 'remove')),
    );
  } else {
    yield step(`No cycle: the edges already form a tree, weight ${r.weight}.`, ['a.tree'], 3);
  }
  const { gone } = prune(g, r.tree, T);
  for (const [leaf, k] of gone) {
    r.tree = r.tree.filter((x) => x !== k);
    r.removed.push(k);
    r.weight = weightOf(g, r.tree);
    r.at = leaf;
    yield step(
      `${leaf} is a leaf but not a terminal, so its edge ${k} helps nobody. Prune it. Weight ${r.weight}.`,
      ['a.prune'],
      2,
      [mark(vertexId(leaf), 'remove'), mark(edgeId(k), 'remove')],
    );
  }
  r.at = undefined;
  if (gone.length === 0)
    yield step('Step 5: every leaf is a terminal, so there is nothing to prune.', ['a.prune'], 3);
}

/** Show the steps of at most this many sets. */
export const SHOWN = 60;

function* exactSteps(g: Graph, r: StRun, step: StepFn) {
  const T = r.T;
  const others = g.vertices.filter((v) => !T.includes(v));
  const all = subsetsBySize(others);
  yield step(
    `Brute force: a minimum Steiner tree uses the terminals and some set S of the other ${plural(others.length, 'vertex', 'vertices')}, and it is then a minimum spanning tree of those vertices. So try ${all.length === 1 ? 'the only set S, ∅' : `all ${all.length} sets S, fewest first`}, and keep the lightest tree.`,
    ['sig', 'x.init'],
    2,
    T.map((t) => mark(vertexId(t), 'visit')),
  );
  let shown = 0;
  let bestTree: string[] = [];
  let size = 0;
  for (const S of all) {
    if (S.length !== size) {
      yield step(
        `Done with ${plural(size, 'Steiner vertex', 'Steiner vertices')}: ${r.best === null ? 'no tree yet' : `the best tree so far weighs ${r.best}`}. Now sets of ${S.length}.`,
        ['x.for'],
        2,
      );
      size = S.length;
    }
    r.tried++;
    r.S = S;
    const m = inducedMst(g, [...T, ...S]);
    const name = S.length ? listWords(S) : 'no Steiner vertex';
    if (m && (r.best === null || m.w < r.best)) {
      r.best = m.w;
      bestTree = m.edges.sort(byEdgeOrder(g));
      r.tree = [...bestTree];
      r.weight = m.w;
      yield step(
        `S = ${S.length ? `{ ${S.join(', ')} }` : '∅'}: the terminals with ${name} are connected, and their minimum spanning tree weighs ${m.w}. That is the best so far.`,
        ['x.for', 'x.mst', 'x.best'],
        2,
        [
          ...S.map((v) => mark(vertexId(v), 'visit')),
          ...bestTree.map((k) => mark(edgeId(k), 'new')),
        ],
      );
      continue;
    }
    if (shown >= SHOWN) continue;
    shown++;
    const say = m
      ? `S = ${S.length ? `{ ${S.join(', ')} }` : '∅'}: a spanning tree of weight ${m.w}, no better than ${r.best}.`
      : `S = ${S.length ? `{ ${S.join(', ')} }` : '∅'}: the terminals with ${name} are not connected by their own edges. No tree.`;
    yield step(
      say,
      ['x.for', 'x.mst'],
      3,
      S.map((v) => mark(vertexId(v), 'compare')),
    );
  }
  r.S = steinerIn(bestTree, T);
  r.tree = bestTree;
  r.weight = r.best ?? 0;
  yield step(
    `All ${plural(all.length, 'set')} tried${r.tried > shown ? ` (the steps show the best ones and the first ${shown} others)` : ''}. The lightest tree weighs ${r.weight}.`,
    ['x.ret'],
    2,
  );
}

// ---------------------------------------------------------------------------------------------
// Loading a graph and setting terminals

/** Terminals for a newly loaded graph: the old ones still there, or a spread of vertices. */
export function keepTerminals(g: Graph, old: string[]): string[] {
  const kept = old.filter((t) => g.vertices.includes(t));
  if (kept.length >= 2) return kept.slice(0, MAX_TERMINALS);
  const vs = g.vertices;
  return sortNames(new Set([vs[0]!, vs[Math.floor(vs.length / 2)]!, vs[vs.length - 1]!]));
}

const load: Op = {
  label: 'Load',
  arity: 1,
  *run(s, [arg]) {
    const r = readGraph(String(arg ?? ''));
    if (r instanceof Error) {
      yield {
        state: s,
        marks: [],
        say: `Nothing loaded. ${r.message} The graph stays as it was.`,
        lines: [],
        level: 1,
        vars: graphVars(s.graph),
      };
      return s;
    }
    const g = r.graph;
    const next: S = { graph: g, terminals: keepTerminals(g, s.terminals) };
    const no = refusal(next);
    yield {
      state: next,
      marks: next.terminals.map((t) => mark(vertexId(t), 'visit')),
      say: `Loaded ${summary(g)}, read as ${FORMAT_NAMES[r.format]}. Terminals: ${listWords(next.terminals)}${sameAs(s.terminals, next.terminals) ? ', as before' : ''}. ${no ?? 'Press Find a tree, or change the terminals with Set terminals.'}`,
      lines: [],
      level: 1,
      vars: graphVars(g),
    };
    return next;
  },
};

const sameAs = (a: string[], b: string[]) => a.join(' ') === b.join(' ');

const terminals: Op = {
  label: 'Set terminals',
  arity: 1,
  *run(s, [arg]) {
    const r = readGraph(String(arg ?? ''));
    const fail = (why: string): TStep => ({
      state: s,
      marks: [],
      say: `${why} The terminals stay ${listWords(s.terminals)}.`,
      lines: [],
      level: 1,
      vars: graphVars(s.graph),
    });
    if (r instanceof Error) {
      yield fail(`Type the terminals as vertex names, such as A D F. ${r.message}`);
      return s;
    }
    const names = r.graph.vertices;
    const missing = names.filter((v) => !s.graph.vertices.includes(v));
    if (missing.length) {
      yield fail(
        `This graph has no ${plural(missing.length, 'vertex', 'vertices').replace(/^\d+ /, '')} ${listWords(missing)}.`,
      );
      return s;
    }
    if (names.length > MAX_TERMINALS) {
      yield fail(`That is ${names.length} terminals; this page takes at most ${MAX_TERMINALS}.`);
      return s;
    }
    const next: S = { graph: s.graph, terminals: sortNames(names) };
    const no = refusal(next);
    yield {
      state: next,
      marks: next.terminals.map((t) => mark(vertexId(t), 'visit')),
      say: `Terminals: ${listWords(next.terminals)}. ${no ?? 'Press Find a tree.'}`,
      lines: [],
      level: 1,
      vars: graphVars(s.graph),
    };
    return next;
  },
};

export const ops = { load, terminals, run };

// ---------------------------------------------------------------------------------------------
// Pseudocode

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: StSettings): PseudoBlock[] {
  const lines =
    settings.method === 'approx'
      ? [
          L('sig', 0, 'APPROX-STEINER(G, w, T)', 'Join the terminals T, at most twice too heavy:'),
          L(
            'a.dist',
            1,
            'd(a, b) = shortest path, a, b ∈ T',
            'Find the distance between every two terminals.',
          ),
          L('a.mst', 1, 'M = MST of (T, d)', 'Build a minimum spanning tree over those distances.'),
          L(
            'a.expand',
            1,
            "H = ∪ the paths of M's edges",
            'Put each of its edges back as its path.',
          ),
          L('a.tree', 1, 'H = MST of H', 'Take a minimum spanning tree of what that gives,'),
          L(
            'a.prune',
            1,
            'drop leaves of H not in T',
            'and cut off leaves that are not terminals.',
          ),
          L('a.ret', 1, 'return H', 'Return the tree.'),
        ]
      : [
          L('sig', 0, 'EXACT-STEINER(G, w, T)', 'Find a lightest tree that joins T:'),
          L('x.init', 1, 'best = ∞', 'No tree yet.'),
          L('x.for', 1, 'for each S ⊆ V − T, smallest first', 'For every set S of other vertices,'),
          L(
            'x.mst',
            2,
            'M = MST of G[T ∪ S], if connected',
            'span the terminals and S as cheaply as possible;',
          ),
          L('x.best', 2, 'if w(M) < w(best): best = M', 'keep the lightest tree.'),
          L('x.ret', 1, 'return best', 'Return it.'),
        ];
  return [{ op: 'run', lines }];
}

export function initialSay(s: S): string {
  return `${describeGraph(s.graph).split('. ')[0]}. Terminals: ${listWords(s.terminals)}. Press Find a tree: join the terminals by the lightest tree, with the method in the options.`;
}

export function initialVars(s: S) {
  return { ...graphVars(s.graph), t: s.terminals.length };
}

export function describe(s: S): string {
  return `${describeGraph(s.graph)} Terminals: ${s.terminals.length ? listWords(s.terminals) : 'none'}.`;
}

/** The scene label: where a run stands. */
export function describeRun(r: StRun): string {
  const what =
    r.method === 'approx' ? 'Metric closure approximation' : 'Brute force over Steiner vertices';
  return `${what}. Tree edges: ${r.tree.length ? r.tree.join(', ') : 'none'}. Weight ${r.weight}. Optimum ${r.opt}.${r.final ? ` Ratio ${ratioText(r.weight, r.opt)}.` : ''}`;
}
