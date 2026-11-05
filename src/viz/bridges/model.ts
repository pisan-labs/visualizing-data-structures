/**
 * Cut vertices (articulation points) and bridges of an undirected graph, by Tarjan's low-link
 * depth-first search.
 *
 * DFS gives each vertex a discovery time d. Its low value is the smallest d it can reach by
 * going down the DFS tree and then along one back edge: u.low = min(u.d, w.d for each back edge
 * (u, w), c.low for each child c). Then, for a tree edge u -> v:
 *   - (u, v) is a bridge exactly when v.low > u.d: nothing below v climbs back to u or above.
 *   - a non-root u is a cut vertex when some child v has v.low >= u.d.
 *   - a root is a cut vertex exactly when it has two or more DFS children.
 * The edge back to the parent is skipped (the graph has no parallel edges, so skipping the
 * parent vertex is the same as skipping that edge).
 *
 * The outer loop and every adjacency list go in name order, so the result matches the code
 * tabs. A directed graph is refused: cut vertices and bridges are about undirected graphs.
 *
 * The state is just the graph; a run's bookkeeping travels in the steps' `extra`.
 */
import type { Mark, OpSpec, PseudoBlock, Scalar, Step } from '../../engine/types';
import type { GraphTemplate } from '../../layouts/graph';
import { edgeId, kindId, vertexId } from '../../layouts/graph';
import {
  describeGraph,
  edgeKey,
  edgeText,
  listWords,
  makeGraph,
  neighbours,
  plural,
  sortNames,
  type Graph,
} from '../_graph/graph';
import { parseGraph } from '../_graph/parse';
import { graphVars, loadOp, type GraphState } from '../_graph/kit';

export type BridgesState = GraphState;
export type Color = 'white' | 'gray' | 'black';

export interface BridgesSettings {
  [key: string]: Scalar;
  layout: GraphTemplate;
}

export const defaults: BridgesSettings = { layout: 'force' };

/** Two triangles joined by a bridge, and a tail: cut vertices C, D, F, G; bridges C-D, F-G, G-H. */
export const BRIDGES_TEXT = 'A-B, A-C, B-C, C-D, D-E, D-F, E-F, F-G, G-H';
export const BRIDGES_GRAPH = parseGraph(BRIDGES_TEXT) as Graph;

export interface BridgesRun {
  color: Record<string, Color>;
  d: Record<string, number | null>;
  low: Record<string, number | null>;
  pi: Record<string, string | null>;
  /** DFS children so far. */
  kids: Record<string, number>;
  time: number;
  calls: string[];
  roots: string[];
  /** Edge kinds by key: tree edges and back edges. */
  edges: Record<string, 'tree' | 'back'>;
  /** Cut vertices found, in name order. */
  cuts: string[];
  /** Bridges found, by key, in the order the graph stores edges. */
  bridges: string[];
  done: boolean;
  u?: string;
  v?: string;
  checks: number;
}

export interface BridgesExtra {
  run?: BridgesRun;
}

type S = BridgesState;
type X = BridgesExtra;
type Op = OpSpec<S, BridgesSettings, X>;
type BStep = Step<S, X>;

export function init(): S {
  return { graph: makeGraph(BRIDGES_GRAPH) };
}

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });

/** Panel ids (see view.ts). */
export const cellId = (row: 'd' | 'low', v: string) => `tbl-${row}-${v}`;
export const cutId = (v: string) => `cut-${v}`;
export const bridgeId = (key: string) => `br-${key}`;

function clone(r: BridgesRun): BridgesRun {
  return {
    ...r,
    color: { ...r.color },
    d: { ...r.d },
    low: { ...r.low },
    pi: { ...r.pi },
    kids: { ...r.kids },
    calls: [...r.calls],
    roots: [...r.roots],
    edges: { ...r.edges },
    cuts: [...r.cuts],
    bridges: [...r.bridges],
  };
}

function runVars(g: Graph, r: BridgesRun): Record<string, Scalar> {
  return {
    ...graphVars(g),
    u: r.u ?? '–',
    v: r.v ?? '–',
    time: r.time,
    cuts: r.cuts.length,
    bridges: r.bridges.length,
    checks: r.checks,
  };
}

/** The answer in the code tabs' words: "<cut vertices> | <bridges>", "-" for none. */
export function runSummary(g: Graph, r: BridgesRun): string {
  const order = new Map(g.edges.map((e, i) => [`${e.u}-${e.v}`, i]));
  const bridges = [...r.bridges].sort((a, b) => order.get(a)! - order.get(b)!);
  return `${r.cuts.join(' ') || '-'} | ${bridges.join(' ') || '-'}`;
}

const run: Op = {
  label: 'Find cut vertices and bridges',
  arity: 0,
  *run(s) {
    const g = s.graph;
    if (g.directed) {
      yield {
        state: s,
        marks: [],
        say: 'Cut vertices and bridges are about undirected graphs: what falls apart when a vertex or an edge is removed. Load edges such as A-B, B-C. (For a directed graph, try strongly connected components.)',
        lines: ['sig'],
        level: 1,
        vars: graphVars(g),
      } satisfies BStep;
      return s;
    }
    const none = () => Object.fromEntries(g.vertices.map((v) => [v, null]));
    const r: BridgesRun = {
      color: Object.fromEntries(g.vertices.map((v) => [v, 'white' as Color])),
      d: none(),
      low: none(),
      pi: none(),
      kids: Object.fromEntries(g.vertices.map((v) => [v, 0])),
      time: 0,
      calls: [],
      roots: [],
      edges: {},
      cuts: [],
      bridges: [],
      done: false,
      checks: 0,
    };
    const step = (say: string, lines: string[], level: 1 | 2 | 3, marks: Mark[] = []): BStep => ({
      state: s,
      marks,
      say,
      lines,
      level,
      vars: runVars(g, r),
      extra: { run: clone(r) },
    });
    const addCut = (u: string) => {
      if (!r.cuts.includes(u)) r.cuts = sortNames([...r.cuts, u]);
    };

    const visit = function* (u: string, p: string | null): Generator<BStep, void, void> {
      r.time++;
      r.d[u] = r.time;
      r.low[u] = r.time;
      r.color[u] = 'gray';
      r.calls.push(u);
      r.u = u;
      r.v = undefined;
      yield step(
        `VISIT(${u}): ${u}.d = ${u}.low = ${r.time}. So far ${u} can only reach itself.`,
        ['visit', 'v.time', 'v.dl'],
        2,
        [mark(vertexId(u), 'active'), mark(cellId('d', u), 'new'), mark(cellId('low', u), 'new')],
      );
      for (const v of neighbours(g, u)) {
        r.u = u;
        r.v = v;
        r.checks++;
        const key = edgeKey(g, u, v);
        const e = edgeText(g, u, v);
        const marks = [
          mark(vertexId(u), 'active'),
          mark(vertexId(v), 'compare'),
          mark(edgeId(key), 'active'),
        ];
        if (r.d[v] === null) {
          r.pi[v] = u;
          r.kids[u]!++;
          r.edges[key] = 'tree';
          yield step(
            `${e}: ${v} is new, so it is ${u}'s child ${r.kids[u] === 1 ? '' : `(child ${r.kids[u]}) `}in the DFS tree. Visit ${v}.`,
            ['v.for', 'v.new', 'v.kid', 'v.call'],
            2,
            marks,
          );
          yield* visit(v, u);
          r.u = u;
          r.v = v;
          const before = r.low[u]!;
          r.low[u] = Math.min(before, r.low[v]!);
          const lowSay =
            r.low[u]! < before
              ? `${v}.low = ${r.low[v]}, so ${u}.low drops to ${r.low[u]}.`
              : `${v}.low = ${r.low[v]} does not lower ${u}.low = ${before}.`;
          const lines = ['v.min1', 'v.ifb'];
          const back: Mark[] = [
            mark(vertexId(u), 'active'),
            mark(vertexId(v), 'compare'),
            mark(cellId('low', v), 'compare'),
            mark(cellId('d', u), 'compare'),
          ];
          let say = `Back in ${u} from ${v}: ${lowSay}`;
          if (r.low[v]! > r.d[u]!) {
            r.bridges.push(key);
            lines.push('v.bridge');
            back.push(mark(edgeId(key), 'error'));
            say += ` ${v}.low = ${r.low[v]} > ${u}.d = ${r.d[u]}: nothing below ${v} has a back edge to ${u} or above, so ${e} is a bridge.`;
          } else {
            say += ` ${v}.low = ${r.low[v]} ≤ ${u}.d = ${r.d[u]}: something below ${v} climbs back to ${r.low[v] === r.d[u] ? u : `above ${u}`}, so ${e} is on a cycle, not a bridge.`;
          }
          lines.push('v.ifc');
          if (p !== null && r.low[v]! >= r.d[u]!) {
            addCut(u);
            lines.push('v.cut');
            back.push(mark(vertexId(u), 'found'));
            say += ` And ${v}.low ≥ ${u}.d, with ${u} not a root: removing ${u} cuts ${v}'s subtree off. ${u} is a cut vertex.`;
          } else if (p === null) {
            say += ` ${u} is a root, so the test for ${u} waits: it counts children instead.`;
          }
          yield step(say, lines, 2, back);
          continue;
        }
        if (v === p) {
          yield step(
            `${e}: ${v} is ${u}'s parent. That is the tree edge ${u} came in on, so skip it.`,
            ['v.for', 'v.new', 'v.par'],
            3,
            marks,
          );
          continue;
        }
        if (r.d[v]! > r.d[u]!) {
          yield step(
            `${e}: ${v} is below ${u} and done. This back edge was already counted from ${v}'s end.`,
            ['v.for', 'v.new', 'v.par', 'v.min2'],
            3,
            [...marks, mark(kindId(key), 'active')],
          );
          continue;
        }
        r.edges[key] = 'back';
        const before = r.low[u]!;
        r.low[u] = Math.min(before, r.d[v]!);
        yield step(
          r.low[u]! < before
            ? `${e}: ${v} is an ancestor, so this is a back edge. ${u}.low = min(${before}, ${v}.d = ${r.d[v]}) = ${r.low[u]}.`
            : `${e}: a back edge to ${v}, but ${v}.d = ${r.d[v]} does not lower ${u}.low = ${before}.`,
          ['v.for', 'v.new', 'v.par', 'v.min2'],
          2,
          [...marks, mark(kindId(key), 'active'), mark(cellId('low', u), 'new')],
        );
      }
      r.u = u;
      r.v = undefined;
      r.color[u] = 'black';
      r.calls.pop();
      const up = r.calls.at(-1);
      yield step(
        `${u} is done, with ${u}.low = ${r.low[u]}.${up ? ` Return to ${up}.` : ''}`,
        ['v.done'],
        3,
        [mark(vertexId(u), 'done')],
      );
    };

    yield step(
      'Find cut vertices and bridges: run DFS, and give every vertex a low value, the smallest d it can reach down the tree plus one back edge.',
      ['sig', 'init'],
      2,
    );
    for (const x of g.vertices) {
      r.u = undefined;
      r.v = undefined;
      if (r.d[x] !== null) continue;
      r.roots.push(x);
      yield step(
        r.roots.length === 1
          ? `Start at ${x}, the first vertex: it is the root of a DFS tree.`
          : `${x} has not been found: it starts a new tree, in a different piece of the graph.`,
        ['loop', 'loop.if', 'loop.call'],
        2,
        [mark(vertexId(x), 'active')],
      );
      yield* visit(x, null);
      r.u = x;
      const k = r.kids[x]!;
      if (k >= 2) addCut(x);
      yield step(
        k >= 2
          ? `Root rule: ${x} has ${k} DFS children. The tree edges are the only way between their subtrees (an undirected DFS has no cross edges), so removing ${x} splits them. ${x} is a cut vertex.`
          : `Root rule: ${x} has ${k === 0 ? 'no children' : 'only one child'}. Removing it leaves ${k === 0 ? 'nothing to split' : 'that child’s subtree in one piece'}, so ${x} is not a cut vertex, whatever the low values say.`,
        ['loop.root', ...(k >= 2 ? ['loop.cut'] : [])],
        2,
        [mark(vertexId(x), k >= 2 ? 'found' : 'compare')],
      );
    }
    r.u = undefined;
    r.v = undefined;
    r.done = true;
    const cutWords = r.cuts.length
      ? `${r.cuts.length === 1 ? 'one cut vertex,' : 'cut vertices'} ${listWords(r.cuts)}`
      : 'no cut vertices';
    const order = new Map(g.edges.map((e, i) => [`${e.u}-${e.v}`, i]));
    const br = [...r.bridges].sort((a, b) => order.get(a)! - order.get(b)!);
    const brWords = br.length ? `${plural(br.length, 'bridge')}, ${listWords(br)}` : 'no bridges';
    yield step(
      g.vertices.length === 0
        ? 'There are no vertices.'
        : `Done: ${cutWords}, and ${brWords}.${!r.cuts.length && !br.length && g.edges.length ? ' Every edge is on a cycle and no single vertex holds the graph together.' : ''}`,
      ['ret'],
      1,
      [...r.cuts.map((v) => mark(cutId(v), 'found')), ...br.map((k) => mark(bridgeId(k), 'error'))],
    );
    return s;
  },
};

const load = loadOp<S, BridgesSettings, X>({
  make: (graph) => ({ graph }),
  ready: (g) =>
    g.directed
      ? 'It is directed, so this page will not run on it. Use undirected edges such as A-B.'
      : 'Press Find to look for cut vertices and bridges.',
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

export function pseudocode(): PseudoBlock[] {
  return [
    {
      op: 'run',
      lines: [
        L('sig', 0, 'CUTS-AND-BRIDGES(G)', 'Find cut vertices and bridges:'),
        L('init', 1, 'time = 0; every u.d = NIL', 'Nothing is discovered yet.'),
        L('loop', 1, 'for each vertex u in G.V', 'Try every vertex in name order:'),
        L('loop.if', 2, 'if u.d == NIL', 'if it is undiscovered,'),
        L('loop.call', 3, 'VISIT(u, NIL)', 'it roots a new DFS tree.'),
        L('loop.root', 3, 'if u has 2+ children', 'A root with two or more children'),
        L('loop.cut', 4, 'u is a cut vertex', 'holds them together: a cut vertex.'),
        L('ret', 1, 'return cuts and bridges', 'Report what was found.'),
        L('visit', 0, 'VISIT(u, p)', 'Explore from u, found from p:'),
        L('v.time', 1, 'time = time + 1', 'tick the clock;'),
        L('v.dl', 1, 'u.d = u.low = time', 'low starts at u itself.'),
        L('v.for', 1, 'for each v in G.Adj[u]', 'For each neighbour v:'),
        L('v.new', 2, 'if v.d == NIL', 'if v is undiscovered,'),
        L('v.kid', 3, 'u.children += 1', 'it is a child of u;'),
        L('v.call', 3, 'VISIT(v, u)', 'explore it first,'),
        L('v.min1', 3, 'u.low = min(u.low, v.low)', 'take its low if smaller.'),
        L('v.ifb', 3, 'if v.low > u.d', 'If v cannot climb to u or above,'),
        L('v.bridge', 4, '(u, v) is a bridge', 'the edge u-v is a bridge.'),
        L('v.ifc', 3, 'if p ≠ NIL and v.low ≥ u.d', 'If u is not a root and v cannot'),
        L('v.cut', 4, 'u is a cut vertex', 'climb above u, u is a cut vertex.'),
        L('v.par', 2, 'elseif v ≠ p', 'Otherwise, unless v is the parent,'),
        L('v.min2', 3, 'u.low = min(u.low, v.d)', 'a back edge: take v.d if smaller.'),
        L('v.done', 1, 'u is done', 'u is finished.'),
      ],
    },
  ];
}

export function initialSay(s: S): string {
  return `${describeGraph(s.graph).split('. ')[0]}. Press Find: one depth-first search finds every vertex and every edge whose removal splits the graph.`;
}

export function initialVars(s: S) {
  return graphVars(s.graph);
}

export function describe(s: S): string {
  return describeGraph(s.graph);
}

/** The scene label: where a run stands. */
export function describeRun(g: Graph, r: BridgesRun): string {
  const times = g.vertices
    .filter((v) => r.d[v] !== null)
    .map((v) => `${v} ${r.d[v]}/${r.low[v]}`)
    .join(', ');
  return `DFS low-links, time ${r.time}. d/low so far: ${times || 'none'}. Cut vertices: ${r.cuts.join(', ') || 'none'}. Bridges: ${r.bridges.join(', ') || 'none'}.`;
}
