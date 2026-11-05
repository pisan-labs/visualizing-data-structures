/**
 * Strongly connected components: maximal sets of vertices that can all reach each other.
 *
 * Setting `algorithm`:
 *   'kosaraju' (CLRS's STRONGLY-CONNECTED-COMPONENTS, the default): DFS(G) to get finish
 *              times; compute the transpose G^T; DFS(G^T) with the main loop in decreasing
 *              finish time. Each tree of the second search is one component, and they come
 *              out in topological order of the component graph.
 *   'tarjan'   one DFS. Each vertex gets an index d and a low-link, the smallest d it can reach
 *              through its subtree plus one arc to a vertex still on the stack. A vertex whose
 *              low equals its d roots a component: pop the stack down to it. Components come
 *              out in reverse topological order.
 * Setting `condense` also draws the component graph (the condensation), which is always a DAG.
 *
 * An undirected graph works too: each edge goes both ways, and the components are its
 * connected components. The outer loops go in name order and neighbours in name order, so the
 * result matches the code tabs.
 *
 * The state is just the graph; a run's bookkeeping travels in the steps' `extra`, with the
 * run's final components (`final`), so the view can keep room for them from the first step.
 */
import type { Mark, OpSpec, PseudoBlock, Scalar, Step } from '../../engine/types';
import type { GraphTemplate } from '../../layouts/graph';
import { edgeId, vertexId } from '../../layouts/graph';
import {
  compareNames,
  describeGraph,
  edgeKey,
  listWords,
  makeGraph,
  neighbours,
  plural,
  sortNames,
  type Graph,
} from '../_graph/graph';
import { parseGraph } from '../_graph/parse';
import { graphVars, loadOp, type GraphState } from '../_graph/kit';

export type SccState = GraphState;
export type Algorithm = 'kosaraju' | 'tarjan';
export type Color = 'white' | 'gray' | 'black';
export type Phase = 'first' | 'transpose' | 'second' | 'tarjan' | 'done';

export interface SccSettings {
  [key: string]: Scalar;
  algorithm: Algorithm;
  condense: boolean;
  layout: GraphTemplate;
}

export const defaults: SccSettings = { algorithm: 'kosaraju', condense: true, layout: 'force' };

/** Directed, 8 vertices: components {A, B, E}, {C, D}, {F, G} and {H}. */
export const SCC_TEXT = 'A>B, B>C, B>E, B>F, C>D, C>G, D>C, D>H, E>A, E>F, F>G, G>F, G>H';
export const SCC_GRAPH = parseGraph(SCC_TEXT) as Graph;

/** One run's bookkeeping, as it stands at a step. */
export interface SccRun {
  algorithm: Algorithm;
  phase: Phase;
  color: Record<string, Color>;
  d: Record<string, number | null>;
  /** Kosaraju's first-pass finish times. */
  f: Record<string, number | null>;
  /** Tarjan's low-links. */
  low: Record<string, number | null>;
  pi: Record<string, string | null>;
  time: number;
  /** Open DFS-VISIT calls, bottom first. */
  calls: string[];
  /** Kosaraju: vertices in the order they finished the first pass (the top is last). */
  finished: string[];
  /** Tarjan's stack, bottom first. */
  stack: string[];
  /** Each vertex's component (its index in comps), once known. */
  comp: Record<string, number | null>;
  /** Components in the order found, each in name order. */
  comps: string[][];
  /** Edges explored in the current pass, by key in the graph being searched. */
  tree: Record<string, true>;
  seen: Record<string, true>;
  u?: string;
  v?: string;
  checks: number;
}

export interface SccExtra {
  run?: SccRun;
  /** The components this run ends with. */
  final?: string[][];
}

type S = SccState;
type X = SccExtra;
type Op = OpSpec<S, SccSettings, X>;
type SccStep = Step<S, X>;

export function init(): S {
  return { graph: makeGraph(SCC_GRAPH) };
}

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });

/** Panel ids (see view.ts). */
export const cellId = (row: 'd' | 'f' | 'low', v: string) => `tbl-${row}-${v}`;
export const finId = (v: string) => `F-${v}`;
export const stackId = (v: string) => `S-${v}`;
export const compId = (k: number) => `scc-${k}`;

/** G^T: every arc reversed (the same graph when undirected). */
export function transpose(g: Graph): Graph {
  if (!g.directed) return g;
  return makeGraph({ ...g, edges: g.edges.map((e) => ({ u: e.v, v: e.u, w: e.w })) });
}

function clone(r: SccRun): SccRun {
  return {
    ...r,
    color: { ...r.color },
    d: { ...r.d },
    f: { ...r.f },
    low: { ...r.low },
    pi: { ...r.pi },
    calls: [...r.calls],
    finished: [...r.finished],
    stack: [...r.stack],
    comp: { ...r.comp },
    comps: r.comps.map((c) => [...c]),
    tree: { ...r.tree },
    seen: { ...r.seen },
  };
}

/** A component as a set: {A, B}. A lone vertex gets spaces, { A }, so it never reads as a
 * template placeholder. */
export const braces = (c: string[]) => (c.length === 1 ? `{ ${c[0]} }` : `{${c.join(', ')}}`);

/** The component graph: one vertex per component (named 1, 2, ...), an arc per pair joined. */
export function condensation(g: Graph, comps: string[][]): Graph {
  const of = new Map<string, number>();
  comps.forEach((c, k) => c.forEach((v) => of.set(v, k)));
  const arcs = new Map<string, { u: string; v: string; w: number }>();
  for (const e of g.edges) {
    const a = of.get(e.u);
    const b = of.get(e.v);
    if (a === undefined || b === undefined || a === b) continue;
    const u = String(a + 1);
    const v = String(b + 1);
    arcs.set(`${u}>${v}`, { u, v, w: 1 });
  }
  return makeGraph({
    directed: g.directed,
    weighted: false,
    vertices: comps.map((_, k) => String(k + 1)),
    edges: [...arcs.values()],
  });
}

function runVars(g: Graph, r: SccRun): Record<string, Scalar> {
  return {
    ...graphVars(g),
    u: r.u ?? '–',
    v: r.v ?? '–',
    time: r.time,
    SCCs: r.comps.length,
    checks: r.checks,
  };
}

/** The answer in the code tabs' words: components in the order found, " | " between them. */
export function runSummary(r: SccRun): string {
  return r.comps.map((c) => c.join(' ')).join(' | ');
}

function newRun(g: Graph, algorithm: Algorithm): SccRun {
  const none = () => Object.fromEntries(g.vertices.map((v) => [v, null]));
  return {
    algorithm,
    phase: algorithm === 'kosaraju' ? 'first' : 'tarjan',
    color: Object.fromEntries(g.vertices.map((v) => [v, 'white' as Color])),
    d: none(),
    f: none(),
    low: none(),
    pi: none(),
    time: 0,
    calls: [],
    finished: [],
    stack: [],
    comp: none(),
    comps: [],
    tree: {},
    seen: {},
    checks: 0,
  };
}

function* kosaraju(g: Graph, r: SccRun, step: StepFn): Generator<SccStep, void, void> {
  const gt = transpose(g);
  const both = !g.directed;
  // ----- Pass 1: DFS(G), recording finish times.
  const visit1 = function* (u: string): Generator<SccStep, void, void> {
    r.time++;
    r.d[u] = r.time;
    r.color[u] = 'gray';
    r.calls.push(u);
    r.u = u;
    r.v = undefined;
    yield step(
      `DFS-VISIT(${u}): ${u}.d = ${r.time}, and ${u} turns gray.`,
      ['visit', 'v.time', 'v.gray'],
      2,
      [mark(vertexId(u), 'active'), mark(cellId('d', u), 'new')],
    );
    for (const v of neighbours(g, u)) {
      r.u = u;
      r.v = v;
      r.checks++;
      const key = edgeKey(g, u, v);
      if (r.color[v] === 'white') {
        r.pi[v] = u;
        r.tree[key] = true;
        yield step(
          `${u}${both ? '-' : '>'}${v}: ${v} is white, so explore it from ${u}.`,
          ['v.for', 'v.if', 'v.call'],
          2,
          [mark(vertexId(u), 'active'), mark(vertexId(v), 'compare'), mark(edgeId(key), 'active')],
        );
        yield* visit1(v);
        r.u = u;
        r.v = undefined;
        continue;
      }
      if (!r.tree[key]) r.seen[key] = true;
      yield step(
        `${u}${both ? '-' : '>'}${v}: ${v} is ${r.color[v]}, already found. Nothing to do.`,
        ['v.for', 'v.if'],
        3,
        [mark(vertexId(u), 'active'), mark(vertexId(v), 'compare'), mark(edgeId(key), 'active')],
      );
    }
    r.u = u;
    r.v = undefined;
    r.time++;
    r.f[u] = r.time;
    r.color[u] = 'black';
    r.calls.pop();
    r.finished.push(u);
    yield step(
      `${u} is done: ${u}.f = ${r.time}. It goes on top of the finished stack. Whatever ${u} reaches that was not found before is below it.`,
      ['v.f', 'v.fin1'],
      2,
      [mark(vertexId(u), 'done'), mark(cellId('f', u), 'new'), mark(finId(u), 'new')],
    );
  };
  yield step(
    `Kosaraju's algorithm, pass 1: run DFS on G and record when each vertex finishes.${both ? ' The graph is undirected, so each edge goes both ways and the components are the connected pieces.' : ''}`,
    ['sig', 'p1'],
    2,
  );
  for (const x of g.vertices) {
    r.u = undefined;
    r.v = undefined;
    if (r.color[x] !== 'white') continue;
    yield step(
      r.time === 0
        ? `Start at ${x}, the first vertex.`
        : `${x} is still white: start a new search from it.`,
      ['p1', 'p1.call'],
      3,
      [mark(vertexId(x), 'active')],
    );
    yield* visit1(x);
  }
  r.u = undefined;
  r.v = undefined;
  const top = r.finished.at(-1);
  // ----- Transpose.
  r.phase = 'transpose';
  r.tree = {};
  r.seen = {};
  yield step(
    g.directed
      ? `Pass 1 is done, and ${top} finished last. Now reverse every arc: that is G^T. A component of G is still a component of G^T, since a cycle reversed is still a cycle. But the arcs between components now point the other way.`
      : `Pass 1 is done, and ${top} finished last. Reversing an undirected edge changes nothing, so G^T is G.`,
    ['tr'],
    2,
  );
  // ----- Pass 2: DFS(G^T), roots in decreasing finish time.
  r.phase = 'second';
  for (const v of g.vertices) {
    r.color[v] = 'white';
    r.pi[v] = null;
  }
  const visit2 = function* (u: string, k: number, root: string): Generator<SccStep, void, void> {
    r.color[u] = 'gray';
    r.comp[u] = k;
    r.comps[k]!.push(u);
    r.comps[k]!.sort(compareNames);
    r.calls.push(u);
    r.u = u;
    r.v = undefined;
    yield step(
      `Visit ${u} in G^T: it joins component ${k + 1}, ${braces(r.comps[k]!)}.`,
      ['visit', 'v.gray', 'v.join'],
      2,
      [mark(vertexId(u), 'active'), mark(compId(k), 'new')],
    );
    for (const v of neighbours(gt, u)) {
      r.u = u;
      r.v = v;
      r.checks++;
      const key = edgeKey(gt, u, v);
      if (r.color[v] === 'white') {
        r.pi[v] = u;
        r.tree[key] = true;
        yield step(
          `${u}${both ? '-' : '>'}${v} in G^T (${v}${both ? '-' : '>'}${u} in G): ${v} can reach ${u}, and so ${root}, in G. ${v} is in no component yet, so it is in ${root}'s. Explore ${v}.`,
          ['v.for', 'v.if', 'v.call'],
          2,
          [mark(vertexId(u), 'active'), mark(vertexId(v), 'compare'), mark(edgeId(key), 'active')],
        );
        yield* visit2(v, k, root);
        r.u = u;
        r.v = undefined;
        continue;
      }
      if (!r.tree[key]) r.seen[key] = true;
      const other = r.comp[v] ?? null;
      yield step(
        other !== null && other !== k
          ? `${u}${both ? '-' : '>'}${v} in G^T: ${v} is already in component ${other + 1}. The search stays inside component ${k + 1}.`
          : `${u}${both ? '-' : '>'}${v} in G^T: ${v} is already found. Nothing to do.`,
        ['v.for', 'v.if'],
        3,
        [mark(vertexId(u), 'active'), mark(vertexId(v), 'compare'), mark(edgeId(key), 'active')],
      );
    }
    r.u = u;
    r.v = undefined;
    r.color[u] = 'black';
    r.calls.pop();
    yield step(`${u} is done in G^T.`, ['v.black'], 3, [mark(vertexId(u), 'done')]);
  };
  const byF = [...g.vertices].sort((a, b) => r.f[b]! - r.f[a]!);
  for (const x of byF) {
    r.u = undefined;
    r.v = undefined;
    if (r.color[x] !== 'white') {
      yield step(
        `${x} (f = ${r.f[x]}) is next by finish time, but it is already in component ${r.comp[x]! + 1}.`,
        ['p2', 'p2.if'],
        3,
        [mark(vertexId(x), 'compare'), mark(finId(x), 'compare')],
      );
      continue;
    }
    const k = r.comps.length;
    r.comps.push([]);
    yield step(
      `${x} has the largest finish time of the vertices left (f = ${r.f[x]}). Search G^T from it: everything it finds is component ${k + 1}.`,
      ['p2', 'p2.if', 'p2.call'],
      2,
      [mark(vertexId(x), 'active'), mark(finId(x), 'active')],
    );
    yield* visit2(x, k, x);
    r.u = undefined;
    yield step(
      `The search from ${x} is over: component ${k + 1} is ${braces(r.comps[k]!)}. Any arc out of it in G^T leads to a component already found.`,
      ['p2.call'],
      2,
      r.comps[k]!.map((v) => mark(vertexId(v), 'found')),
    );
  }
}

function* tarjan(g: Graph, r: SccRun, step: StepFn): Generator<SccStep, void, void> {
  const onStack = new Set<string>();
  const both = !g.directed;
  const sep = both ? '-' : '>';
  const connect = function* (u: string): Generator<SccStep, void, void> {
    r.time++;
    r.d[u] = r.time;
    r.low[u] = r.time;
    r.color[u] = 'gray';
    r.calls.push(u);
    r.stack.push(u);
    onStack.add(u);
    r.u = u;
    r.v = undefined;
    yield step(
      `STRONGCONNECT(${u}): ${u}.d = ${u}.low = ${r.time}. Push ${u} on the stack.`,
      ['visit', 'v.time', 'v.dl', 'v.push'],
      2,
      [mark(vertexId(u), 'active'), mark(cellId('d', u), 'new'), mark(stackId(u), 'new')],
    );
    for (const v of neighbours(g, u)) {
      r.u = u;
      r.v = v;
      r.checks++;
      const key = edgeKey(g, u, v);
      const marks = [
        mark(vertexId(u), 'active'),
        mark(vertexId(v), 'compare'),
        mark(edgeId(key), 'active'),
      ];
      if (r.d[v] === null) {
        r.pi[v] = u;
        r.tree[key] = true;
        yield step(
          `${u}${sep}${v}: ${v} is new. Call STRONGCONNECT(${v}).`,
          ['v.for', 'v.new', 'v.call'],
          2,
          marks,
        );
        yield* connect(v);
        r.u = u;
        r.v = v;
        const before = r.low[u]!;
        r.low[u] = Math.min(before, r.low[v]!);
        yield step(
          r.low[u]! < before
            ? `Back in ${u}: ${v}.low = ${r.low[v]} is smaller, so ${u}.low = ${r.low[u]}. ${v}'s subtree reaches something above ${u}.`
            : `Back in ${u}: ${v}.low = ${r.low[v]} is not smaller than ${u}.low = ${before}, so ${u}.low stays.`,
          ['v.min1'],
          r.low[u]! < before ? 2 : 3,
          [
            mark(vertexId(u), 'active'),
            mark(cellId('low', u), r.low[u]! < before ? 'new' : 'compare'),
          ],
        );
        continue;
      }
      if (!r.tree[key]) r.seen[key] = true;
      if (onStack.has(v)) {
        const before = r.low[u]!;
        r.low[u] = Math.min(before, r.d[v]!);
        yield step(
          r.low[u]! < before
            ? `${u}${sep}${v}: ${v} is on the stack, so it is in the component being built. ${u}.low = min(${before}, ${v}.d = ${r.d[v]}) = ${r.low[u]}.`
            : `${u}${sep}${v}: ${v} is on the stack, but ${v}.d = ${r.d[v]} is not smaller than ${u}.low = ${before}.`,
          ['v.for', 'v.on', 'v.min2'],
          r.low[u]! < before ? 2 : 3,
          [...marks, mark(cellId('low', u), r.low[u]! < before ? 'new' : 'compare')],
        );
        continue;
      }
      yield step(
        `${u}${sep}${v}: ${v} is already in component ${r.comp[v]! + 1}, which is finished. Ignore it.`,
        ['v.for', 'v.on'],
        3,
        marks,
      );
    }
    r.u = u;
    r.v = undefined;
    r.color[u] = 'black';
    r.calls.pop();
    if (r.low[u] !== r.d[u]) {
      yield step(
        `${u} is done, and ${u}.low = ${r.low[u]} < ${u}.d = ${r.d[u]}: ${u} reaches a vertex above it that is still on the stack. ${u} stays on the stack.`,
        ['v.root'],
        2,
        [mark(vertexId(u), 'done'), mark(stackId(u), 'compare')],
      );
      return;
    }
    const k = r.comps.length;
    const c: string[] = [];
    for (;;) {
      const w = r.stack.pop()!;
      onStack.delete(w);
      c.push(w);
      r.comp[w] = k;
      if (w === u) break;
    }
    r.comps.push(sortNames(c));
    yield step(
      `${u} is done, and ${u}.low = ${u}.d = ${r.d[u]}: nothing in ${u}'s subtree reaches above ${u}. ${u} roots a component. Pop the stack down to ${u}: component ${k + 1} is ${braces(r.comps[k]!)}.`,
      ['v.root', 'v.pop', 'v.scc'],
      2,
      [...c.map((w) => mark(vertexId(w), 'found')), mark(compId(k), 'new')],
    );
  };
  yield step(
    `Tarjan's algorithm: one DFS. Each vertex gets an index d and a low-link, the smallest index it can reach that is still on the stack.${both ? ' The graph is undirected, so each edge goes both ways.' : ''}`,
    ['sig', 'init'],
    2,
  );
  for (const x of g.vertices) {
    r.u = undefined;
    r.v = undefined;
    if (r.d[x] !== null) continue;
    yield step(
      r.time === 0 ? `Start at ${x}, the first vertex.` : `${x} has no index yet: start from it.`,
      ['loop', 'loop.if', 'loop.call'],
      3,
      [mark(vertexId(x), 'active')],
    );
    yield* connect(x);
  }
}

type StepFn = (say: string, lines: string[], level: 1 | 2 | 3, marks?: Mark[]) => SccStep;

const run: Op = {
  label: 'Find SCCs',
  arity: 0,
  *run(s, _args, { settings }) {
    const g = s.graph;
    const r = newRun(g, settings.algorithm);
    const step: StepFn = (say, lines, level, marks = []) => ({
      state: s,
      marks,
      say,
      lines,
      level,
      vars: runVars(g, r),
      extra: { run: clone(r) },
    });
    const steps = [...(r.algorithm === 'kosaraju' ? kosaraju(g, r, step) : tarjan(g, r, step))];
    r.phase = 'done';
    r.u = undefined;
    r.v = undefined;
    const n = r.comps.length;
    const singles = r.comps.filter((c) => c.length === 1).length;
    const order =
      r.algorithm === 'kosaraju'
        ? 'Kosaraju finds them in topological order of the component graph'
        : 'Tarjan finds them in reverse topological order of the component graph';
    steps.push(
      step(
        g.vertices.length === 0
          ? 'There are no vertices, so there are no components.'
          : `Done: ${plural(n, 'strongly connected component')}, ${listWords(r.comps.map(braces))}.${singles ? ` ${singles === n ? 'Every' : plural(singles, 'vertex', 'vertices')} ${singles === n ? 'vertex is alone: the graph has no cycle' : `${singles === 1 ? 'is' : 'are'} alone, on no cycle`}.` : ''} ${order}.`,
        ['ret'],
        1,
      ),
    );
    const final = r.comps.map((c) => [...c]);
    for (const st of steps) yield { ...st, extra: { ...st.extra, final } };
    return s;
  },
};

const load = loadOp<S, SccSettings, X>({
  make: (graph) => ({ graph }),
  ready: () => 'Press Find SCCs.',
});

export const ops = { load, run };

// ---------------------------------------------------------------------------------------------
// Pseudocode. Lines stay short (33 characters with their indent) for a phone.

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: SccSettings): PseudoBlock[] {
  if (settings.algorithm === 'kosaraju') {
    return [
      {
        op: 'run',
        lines: [
          L('sig', 0, 'SCC(G)', 'Find the strongly connected components:'),
          L('p1', 1, 'DFS(G): every u gets u.f', 'Search G and record finish times.'),
          L('p1.call', 2, 'DFS-VISIT(G, u)', 'Each start explores what it can reach.'),
          L('tr', 1, 'compute G^T', 'Reverse every arc.'),
          L('p2', 1, 'for each u by decreasing u.f', 'Take vertices latest finish first:'),
          L('p2.if', 2, 'if u.color == WHITE', 'if not yet in a component,'),
          L('p2.call', 3, 'DFS-VISIT(G^T, u)', 'what it finds in G^T is one SCC.'),
          L('ret', 1, 'return the trees of pass 2', 'Each tree is one component.'),
          L('visit', 0, 'DFS-VISIT(G, u)', 'Explore from u:'),
          L('v.time', 1, 'time = time + 1; u.d = time', 'u is discovered now'),
          L('v.gray', 1, 'u.color = GRAY', 'and is being explored.'),
          L('v.join', 1, 'add u to the current SCC', 'In pass 2, u joins this component.'),
          L('v.for', 1, 'for each v in G.Adj[u]', 'For each vertex v that u points to:'),
          L('v.if', 2, 'if v.color == WHITE', 'if v is undiscovered,'),
          L('v.call', 3, 'DFS-VISIT(G, v)', 'explore from v first.'),
          L('v.black', 1, 'u.color = BLACK', 'u is done.'),
          L('v.f', 1, 'time = time + 1; u.f = time', 'In pass 1, u finishes now'),
          L('v.fin1', 1, 'push u onto F', 'and goes on the finished stack.'),
        ],
      },
    ];
  }
  return [
    {
      op: 'run',
      lines: [
        L('sig', 0, 'TARJAN-SCC(G)', 'Find the strongly connected components:'),
        L('init', 1, 'time = 0; S = empty stack', 'Start the clock and an empty stack.'),
        L('loop', 1, 'for each vertex u in G.V', 'Try every vertex in name order:'),
        L('loop.if', 2, 'if u.d == NIL', 'if it has no index yet,'),
        L('loop.call', 3, 'STRONGCONNECT(u)', 'search from it.'),
        L('ret', 1, 'return the SCCs popped', 'Each pop gave one component.'),
        L('visit', 0, 'STRONGCONNECT(u)', 'Explore from u:'),
        L('v.time', 1, 'time = time + 1', 'tick the clock,'),
        L('v.dl', 1, 'u.d = u.low = time', 'u gets its index; low starts there.'),
        L('v.push', 1, 'PUSH(S, u)', 'Put u on the stack.'),
        L('v.for', 1, 'for each v in G.Adj[u]', 'For each vertex v that u points to:'),
        L('v.new', 2, 'if v.d == NIL', 'if v has no index,'),
        L('v.call', 3, 'STRONGCONNECT(v)', 'explore from v first,'),
        L('v.min1', 3, 'u.low = min(u.low, v.low)', 'then take its low if smaller.'),
        L('v.on', 2, 'elseif v is on S', 'If v is on the stack,'),
        L('v.min2', 3, 'u.low = min(u.low, v.d)', 'take its index if smaller.'),
        L('v.root', 1, 'if u.low == u.d', 'If u reaches nothing above it,'),
        L('v.pop', 2, 'pop S down to u', 'take everything down to u off'),
        L('v.scc', 2, 'those form one SCC', 'and call it one component.'),
      ],
    },
  ];
}

export function initialSay(s: S): string {
  return `${describeGraph(s.graph).split('. ')[0]}. Press Find SCCs to split it into groups of vertices that can all reach each other.`;
}

export function initialVars(s: S) {
  return graphVars(s.graph);
}

export function describe(s: S): string {
  return describeGraph(s.graph);
}

const PHASE: Record<Phase, string> = {
  first: 'pass 1, DFS on G',
  transpose: 'transposing G',
  second: 'pass 2, DFS on G^T',
  tarjan: 'one DFS with low-links',
  done: 'done',
};

/** The scene label: where a run stands. */
export function describeRun(r: SccRun): string {
  const found = r.comps.length ? r.comps.map(braces).join(', ') : 'none yet';
  return `${r.algorithm === 'kosaraju' ? 'Kosaraju' : 'Tarjan'}, ${PHASE[r.phase]}. Components: ${found}.`;
}
