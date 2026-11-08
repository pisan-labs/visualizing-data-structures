/**
 * One graph, three ways to store it: an adjacency list, an adjacency matrix and an edge list.
 * Every operation runs on all three and counts the entries each one touches (reads plus
 * writes), so the costs can be compared side by side:
 *
 *   hasEdge(u, v)     list: scan Adj[u]            matrix: one cell   edge list: scan the rows
 *   neighbours(u)     list: Adj[u]                 matrix: row u      edge list: every row
 *   addEdge(u, v)     each checks for the edge first, then writes it
 *   removeEdge(u, v)  each finds the edge, then removes it
 *   addVertex(x)      list: a new empty list       matrix: copy into an (n+1) x (n+1) matrix
 *   removeVertex(x)   list: drop Adj[x] and x from every list
 *                     matrix: copy into an (n-1) x (n-1) matrix   edge list: drop its rows
 *
 * Lists are kept in name order, so neighbours come out in the same order everywhere.
 */
import type { Mark, OpSpec, PseudoBlock, Scalar, Step } from '../../engine/types';
import type { GraphTemplate } from '../../layouts/graph';
import { edgeId, vertexId } from '../../layouts/graph';
import {
  MAX_EDGES,
  MAX_VERTICES,
  adjacency,
  describeGraph,
  edgeKey,
  edgeText,
  findEdge,
  hasVertex,
  listWords,
  neighbours,
  plural,
  withEdge,
  withVertex,
  withoutEdge,
  withoutVertex,
  type Graph,
} from '../_graph/graph';
import { graphVars, loadOp, startGraph, vertexArg, type GraphState } from '../_graph/kit';
import { parseEdge, parseVertex } from '../_graph/parse';

export type RepState = GraphState;

export interface RepSettings {
  [key: string]: Scalar;
  layout: GraphTemplate;
  /** Three columns side by side, or stacked for a phone in portrait. */
  arrange: 'fit' | 'wide' | 'tall';
}

export const defaults: RepSettings = { layout: 'force', arrange: 'fit' };

/** Running costs of the current operation, per representation. */
export interface Costs {
  list: number;
  matrix: number;
  edges: number;
}

export interface RepExtra {
  /** The call being made, shown above the drawing: "hasEdge(A, D)". */
  ask?: string;
  /** A vertex being removed, drawn faded. */
  leaving?: string;
}

type S = RepState;
type X = RepExtra;
type Op = OpSpec<S, RepSettings, X>;
type RepStep = Step<S, X>;
type Gen = Generator<RepStep, S, void>;

export function init(): S {
  return { graph: startGraph() };
}

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });
const zero = (): Costs => ({ list: 0, matrix: 0, edges: 0 });

/** Shape ids in the three panels (see src/layouts/graph.ts). */
export const listHead = (u: string) => `al-${u}`;
export const listEntry = (u: string, v: string) => `al-${u}-${v}`;
export const matrixCell = (u: string, v: string) => `am-m-${u}-${v}`;
export const matrixRow = (u: string) => `am-r-${u}`;
export const edgeRow = (key: string) => `el-${key}`;

export function costVars(g: Graph, c: Costs, more: Record<string, Scalar> = {}) {
  return { ...more, ...graphVars(g), list: c.list, matrix: c.matrix, 'edge list': c.edges };
}

function step(
  s: S,
  c: Costs,
  say: string,
  lines: string[],
  level: 1 | 2 | 3,
  marks: Mark[] = [],
  extra?: X,
  more?: Record<string, Scalar>,
): RepStep {
  return { state: s, marks, say, lines, level, vars: costVars(s.graph, c, more), extra };
}

/** Show the last step and end the operation with its state. */
function* finish(st: RepStep): Gen {
  yield st;
  return st.state;
}

const costLine = (c: Costs) =>
  `Entries touched: adjacency list ${c.list}, matrix ${c.matrix}, edge list ${c.edges}.`;

const refuse = (s: S, say: string, op: string) => finish(step(s, zero(), say, [`${op}.sig`], 1));

interface EdgeArg {
  u: string;
  v: string;
  w: number | null;
  /** Typed with ">". */
  oneWay: boolean;
  /** A sentence when the typed direction does not match the graph's. */
  note: string;
}

/** An edge from the argument, read in the graph's direction, or a sentence saying why not. */
function edgeArg(g: Graph, arg: unknown): EdgeArg | { error: string } {
  const e = parseEdge(String(arg ?? ''));
  if (e instanceof Error) return { error: e.message };
  for (const x of [e.u, e.v]) if (!hasVertex(g, x)) return { error: `There is no vertex ${x}.` };
  let note = '';
  if (g.directed && !e.directed)
    note = ` This graph is directed, so ${e.u}-${e.v} means the arc ${e.u}>${e.v}.`;
  if (!g.directed && e.directed)
    note = ` This graph is undirected, so ${e.u}>${e.v} is the edge ${edgeText(g, e.u, e.v)}.`;
  return { u: e.u, v: e.v, w: e.w, oneWay: e.directed, note };
}

// ---------------------------------------------------------------------------------------------
// The three lookups, shared by hasEdge, addEdge and removeEdge.

interface Found {
  list: boolean;
  /** Position of the edge in the stored edge list, or -1. */
  row: number;
}

type LineKind = 'list' | 'listYes' | 'listNo' | 'matrix' | 'edges' | 'edgesYes' | 'edgesNo';

/** Look for u -> v in each representation: a step per entry checked. */
function* lookup(
  s: S,
  u: string,
  v: string,
  c: Costs,
  lines: (k: LineKind) => string[],
  ask: string,
): Generator<RepStep, Found, void> {
  const g = s.graph;
  const extra = { ask };
  const label = edgeText(g, u, v);
  // Adjacency list: walk Adj[u].
  const list = neighbours(g, u);
  let inList = false;
  for (const x of list) {
    c.list++;
    if (x === v) {
      inList = true;
      yield step(
        s,
        c,
        `Adjacency list: entry ${c.list} of Adj[${u}] is ${v}. Found after ${plural(c.list, 'check')}.`,
        lines('listYes'),
        2,
        [mark(listEntry(u, v), 'found'), mark(listHead(u), 'active')],
        extra,
      );
      break;
    }
    yield step(
      s,
      c,
      `Adjacency list: entry ${c.list} of Adj[${u}] is ${x}, not ${v}.`,
      lines('list'),
      3,
      [mark(listEntry(u, x), 'compare'), mark(listHead(u), 'active')],
      extra,
    );
  }
  if (!inList) {
    yield step(
      s,
      c,
      list.length === 0
        ? `Adjacency list: Adj[${u}] is empty, so there is nothing to check. No ${label}.`
        : `Adjacency list: Adj[${u}] ends after ${plural(c.list, 'check')} without ${v}. No ${label}.`,
      lines('listNo'),
      2,
      [mark(listHead(u), 'active')],
      extra,
    );
  }
  // Matrix: one cell.
  c.matrix++;
  const e = findEdge(g, u, v);
  const cell = e
    ? `M[${u}][${v}] = ${e.w}`
    : g.weighted
      ? `M[${u}][${v}] is empty`
      : `M[${u}][${v}] = 0`;
  yield step(
    s,
    c,
    `Adjacency matrix: one check, ${cell}. ${e ? 'There is an edge.' : 'No edge.'}`,
    lines('matrix'),
    2,
    [mark(matrixCell(u, v), e ? 'found' : 'compare')],
    extra,
  );
  // Edge list: scan the rows in order.
  let row = -1;
  for (let i = 0; i < g.edges.length; i++) {
    const x = g.edges[i]!;
    c.edges++;
    const key = `${x.u}-${x.v}`;
    if ((x.u === u && x.v === v) || (!g.directed && x.u === v && x.v === u)) {
      row = i;
      yield step(
        s,
        c,
        `Edge list: row ${i + 1} is ${label}. Found after ${plural(c.edges, 'check')}.`,
        lines('edgesYes'),
        2,
        [mark(edgeRow(key), 'found')],
        extra,
      );
      break;
    }
    yield step(
      s,
      c,
      `Edge list: row ${i + 1} is ${edgeText(g, x.u, x.v)}, not ${label}.`,
      lines('edges'),
      3,
      [mark(edgeRow(key), 'compare')],
      extra,
    );
  }
  if (row < 0) {
    yield step(
      s,
      c,
      g.edges.length === 0
        ? `Edge list: there are no rows, so no ${label}.`
        : `Edge list: all ${plural(g.edges.length, 'row')} checked. No ${label}.`,
      lines('edgesNo'),
      2,
      [],
      extra,
    );
  }
  return { list: inList, row };
}

// ---------------------------------------------------------------------------------------------
// Operations

const load = loadOp<S, RepSettings, X>({
  make: (graph) => ({ graph }),
  vars: () => ({ list: 0, matrix: 0, 'edge list': 0 }),
  ready: (g) =>
    `The adjacency list has ${plural(g.vertices.length, 'list')}, the matrix ${g.vertices.length} × ${g.vertices.length} cells and the edge list ${plural(g.edges.length, 'row')}.`,
});

const hasEdge: Op = {
  label: 'Has edge?',
  arity: 1,
  *run(s, [arg]) {
    const g = s.graph;
    const a = edgeArg(g, arg);
    if ('error' in a) return yield* refuse(s, `hasEdge: ${a.error}`, 'has');
    const { u, v } = a;
    const label = edgeText(g, u, v);
    const ask = `hasEdge(${u}, ${v})`;
    const c = zero();
    yield step(
      s,
      c,
      `Is there an edge ${label}? Ask each representation in turn.${a.note}`,
      ['has.sig'],
      2,
      [mark(vertexId(u), 'active'), mark(vertexId(v), 'compare')],
      { ask },
    );
    const found = yield* lookup(s, u, v, c, (k) => [`has.${k}`], ask);
    const yes = found.list;
    const deg = adjacency(g).get(u)!.length;
    return yield* finish(
      step(
        s,
        c,
        `${yes ? 'Yes' : 'No'}: ${label} ${yes ? 'is' : 'is not'} an edge. ${costLine(c)} The matrix always needs one check; the list at most the ${g.directed ? 'out-degree' : 'degree'} of ${u}, ${deg}; the edge list at most E = ${g.edges.length}.`,
        [],
        1,
        yes ? [mark(edgeId(edgeKey(g, u, v)), 'found')] : [],
        { ask },
        { answer: yes ? 'yes' : 'no' },
      ),
    );
  },
};

const neighboursOp: Op = {
  label: 'Neighbours of',
  arity: 1,
  *run(s, [arg]) {
    const g = s.graph;
    const a = vertexArg(g, arg);
    if ('error' in a) return yield* refuse(s, `neighbours: ${a.error}`, 'nbrs');
    const u = a.v;
    const ask = `neighbours(${u})`;
    const c = zero();
    const list = neighbours(g, u);
    const what = g.directed ? 'out-neighbours' : 'neighbours';
    c.list = list.length;
    yield step(
      s,
      c,
      `Adjacency list: Adj[${u}] is exactly the ${what}: ${list.length ? listWords(list) : 'none'}. ${plural(list.length, 'entry', 'entries')} to read.`,
      ['nbrs.list'],
      2,
      [mark(listHead(u), 'active'), ...list.map((v) => mark(listEntry(u, v), 'found'))],
      { ask },
    );
    c.matrix = g.vertices.length;
    yield step(
      s,
      c,
      `Adjacency matrix: read all of row ${u}, ${plural(g.vertices.length, 'cell')}, and keep the ones that are not 0.`,
      ['nbrs.matrix'],
      2,
      [
        mark(matrixRow(u), 'active'),
        ...g.vertices.map((v) => mark(matrixCell(u, v), list.includes(v) ? 'found' : 'compare')),
      ],
      { ask },
    );
    c.edges = g.edges.length;
    const rows = g.edges.filter((e) => e.u === u || (!g.directed && e.v === u));
    yield step(
      s,
      c,
      `Edge list: read every row, all ${g.edges.length}, and keep the ${plural(rows.length, 'edge')} ${g.directed ? 'leaving' : 'touching'} ${u}.`,
      ['nbrs.edges'],
      2,
      rows.map((e) => mark(edgeRow(`${e.u}-${e.v}`), 'found')),
      { ask },
    );
    return yield* finish(
      step(
        s,
        c,
        `The ${what} of ${u}: ${list.length ? listWords(list) : 'none'}. ${costLine(c)} The list pays only for the ${what}, the matrix for a whole row, the edge list for every edge.`,
        [],
        1,
        list.map((v) => mark(vertexId(v), 'found')),
        { ask },
        { answer: list.join(' ') || 'none' },
      ),
    );
  },
};

const addEdge: Op = {
  label: 'Add edge',
  arity: 1,
  *run(s, [arg]) {
    const g = s.graph;
    const a = edgeArg(g, arg);
    if ('error' in a) return yield* refuse(s, `addEdge: ${a.error}`, 'add');
    const { u, v } = a;
    if (!g.directed && a.oneWay)
      return yield* refuse(
        s,
        `addEdge: this graph is undirected, so it has no one-way edges. Add ${edgeText(g, u, v)} instead, or load a directed graph.`,
        'add',
      );
    if (g.directed && !a.oneWay)
      return yield* refuse(
        s,
        `addEdge: this graph is directed. Add ${u}>${v} or ${v}>${u}, one arc at a time.`,
        'add',
      );
    if (!g.weighted && a.w !== null)
      return yield* refuse(
        s,
        `addEdge: this graph has no weights. Add ${edgeText(g, u, v)} without ":${a.w}", or load a weighted graph.`,
        'add',
      );
    if (g.edges.length >= MAX_EDGES)
      return yield* refuse(
        s,
        `addEdge: the graph already has ${MAX_EDGES} edges, the most it can draw.`,
        'add',
      );
    const w = a.w ?? 1;
    const label = edgeText(g, u, v);
    const ask = `addEdge(${u}, ${v})`;
    const c = zero();
    yield step(
      s,
      c,
      `Add ${label}${g.weighted ? ` with weight ${w}` : ''}. First, each representation checks that it is not there already.`,
      ['add.sig', 'add.check'],
      2,
      [mark(vertexId(u), 'active'), mark(vertexId(v), 'active')],
      { ask },
    );
    const found = yield* lookup(s, u, v, c, () => ['add.check'], ask);
    if (found.list)
      return yield* finish(
        step(
          s,
          c,
          `${label} is already an edge, so nothing changes. ${costLine(c)}`,
          ['add.check', 'add.exists'],
          1,
          [mark(edgeId(edgeKey(g, u, v)), 'found')],
          { ask },
        ),
      );
    const next: S = { graph: withEdge(g, u, v, w) };
    const both = !g.directed;
    c.list += both ? 2 : 1;
    c.matrix += both ? 2 : 1;
    c.edges += 1;
    const key = edgeKey(next.graph, u, v);
    return yield* finish(
      step(
        next,
        c,
        `Added ${label}. Adjacency list: ${v} goes into Adj[${u}]${both ? ` and ${u} into Adj[${v}]` : ''}, in name order. Matrix: M[${u}][${v}] = ${w}${both ? ` and M[${v}][${u}] = ${w}` : ''}. Edge list: one new row. ${costLine(c)}`,
        ['add.list', 'add.matrix', 'add.edges'],
        1,
        [
          mark(edgeId(key), 'new'),
          mark(listEntry(u, v), 'new'),
          mark(matrixCell(u, v), 'new'),
          ...(both ? [mark(listEntry(v, u), 'new'), mark(matrixCell(v, u), 'new')] : []),
          mark(edgeRow(key), 'new'),
        ],
        { ask },
      ),
    );
  },
};

const removeEdge: Op = {
  label: 'Remove edge',
  arity: 1,
  *run(s, [arg]) {
    const g = s.graph;
    const a = edgeArg(g, arg);
    if ('error' in a) return yield* refuse(s, `removeEdge: ${a.error}`, 'rem');
    const { u, v } = a;
    const label = edgeText(g, u, v);
    const ask = `removeEdge(${u}, ${v})`;
    const c = zero();
    yield step(
      s,
      c,
      `Remove ${label}. Each representation has to find it first.${a.note}`,
      ['rem.sig'],
      2,
      [mark(vertexId(u), 'active'), mark(vertexId(v), 'active')],
      { ask },
    );
    const found = yield* lookup(s, u, v, c, () => ['rem.check'], ask);
    if (!found.list)
      return yield* finish(
        step(
          s,
          c,
          `${label} is not an edge, so there is nothing to remove. ${costLine(c)}`,
          ['rem.check', 'rem.missing'],
          1,
          [],
          { ask },
        ),
      );
    const both = !g.directed;
    // Undirected: the list also has to find u in Adj[v] before unlinking it.
    if (both) c.list += neighbours(g, v).indexOf(u) + 1;
    c.list += both ? 2 : 1;
    c.matrix += both ? 2 : 1;
    c.edges += 1;
    const next: S = { graph: withoutEdge(g, u, v) };
    return yield* finish(
      step(
        next,
        c,
        `Removed ${label}. Adjacency list: ${v} leaves Adj[${u}]${both ? `, and ${u} leaves Adj[${v}] after another scan` : ''}. Matrix: M[${u}][${v}] = 0${both ? ` and M[${v}][${u}] = 0` : ''}. Edge list: row ${found.row + 1} goes. ${costLine(c)}`,
        ['rem.list', 'rem.matrix', 'rem.edges'],
        1,
        [
          mark(listHead(u), 'remove'),
          mark(matrixCell(u, v), 'remove'),
          ...(both ? [mark(listHead(v), 'remove'), mark(matrixCell(v, u), 'remove')] : []),
        ],
        { ask },
      ),
    );
  },
};

const addVertex: Op = {
  label: 'Add vertex',
  arity: 1,
  *run(s, [arg]) {
    const g = s.graph;
    const x = parseVertex(String(arg ?? ''));
    if (x instanceof Error) return yield* refuse(s, `addVertex: ${x.message}`, 'addv');
    if (hasVertex(g, x))
      return yield* refuse(s, `addVertex: ${x} is already a vertex, so nothing changes.`, 'addv');
    if (g.vertices.length >= MAX_VERTICES)
      return yield* refuse(
        s,
        `addVertex: the graph already has ${MAX_VERTICES} vertices, the most it can draw.`,
        'addv',
      );
    const n = g.vertices.length;
    const next: S = { graph: withVertex(g, x) };
    const c: Costs = { list: 1, matrix: (n + 1) * (n + 1), edges: 1 };
    return yield* finish(
      step(
        next,
        c,
        `Added ${x}, with no edges yet. Adjacency list: one new, empty list. Matrix: there is no room for another row and column, so the ${n * n} cells are copied into a ${n + 1} × ${n + 1} matrix and the ${2 * n + 1} new cells set to 0. Edge list: rows only hold edges, so ${x} goes on the separate list of vertices. ${costLine(c)}`,
        ['addv.list', 'addv.matrix', 'addv.edges'],
        1,
        [
          mark(vertexId(x), 'new'),
          mark(listHead(x), 'new'),
          ...next.graph.vertices.map((v) => mark(matrixCell(x, v), 'new')),
          ...g.vertices.map((v) => mark(matrixCell(v, x), 'new')),
        ],
        { ask: `addVertex(${x})` },
      ),
    );
  },
};

const removeVertex: Op = {
  label: 'Remove vertex',
  arity: 1,
  *run(s, [arg]) {
    const g = s.graph;
    const a = vertexArg(g, arg);
    if ('error' in a) return yield* refuse(s, `removeVertex: ${a.error}`, 'remv');
    const x = a.v;
    if (g.vertices.length === 1)
      return yield* refuse(s, `removeVertex: ${x} is the only vertex. Keep at least one.`, 'remv');
    const ask = `removeVertex(${x})`;
    const n = g.vertices.length;
    const touching = g.edges.filter((e) => e.u === x || e.v === x).map((e) => `${e.u}-${e.v}`);
    const entries = [...adjacency(g).values()].reduce((t, l) => t + l.length, 0);
    const c = zero();
    const extra = { ask, leaving: x };
    yield step(
      s,
      c,
      `Remove ${x} and its ${plural(touching.length, 'edge')}. Each representation has to find them.`,
      ['remv.sig'],
      2,
      [mark(vertexId(x), 'remove'), ...touching.map((k) => mark(edgeId(k), 'remove'))],
      extra,
    );
    c.list = 1 + entries;
    yield step(
      s,
      c,
      `Adjacency list: drop Adj[${x}], then look through every other list for ${x}: ${plural(entries, 'entry', 'entries')} in all.`,
      ['remv.list'],
      2,
      [
        mark(listHead(x), 'remove'),
        ...g.vertices
          .filter((v) => neighbours(g, v).includes(x))
          .map((v) => mark(listEntry(v, x), 'remove')),
      ],
      extra,
    );
    c.matrix = (n - 1) * (n - 1);
    yield step(
      s,
      c,
      `Adjacency matrix: copy the ${(n - 1) * (n - 1)} cells that stay into a ${n - 1} × ${n - 1} matrix, leaving out row ${x} and column ${x}.`,
      ['remv.matrix'],
      2,
      g.vertices.flatMap((v) => [
        mark(matrixCell(x, v), 'remove'),
        mark(matrixCell(v, x), 'remove'),
      ]),
      extra,
    );
    c.edges = g.edges.length + 1;
    yield step(
      s,
      c,
      `Edge list: check all ${plural(g.edges.length, 'row')}, drop the ${plural(touching.length, 'one')} with ${x}, and take ${x} off the list of vertices.`,
      ['remv.edges'],
      2,
      touching.map((k) => mark(edgeRow(k), 'remove')),
      extra,
    );
    const next: S = { graph: withoutVertex(g, x) };
    const words = touching.map((k) => (g.directed ? k.replace('-', '>') : k));
    return yield* finish(
      step(
        next,
        c,
        `Removed ${x}${words.length ? ` and ${listWords(words)}` : ''}. ${costLine(c)}`,
        [],
        1,
        [],
        { ask },
      ),
    );
  },
};

export const ops = {
  load,
  hasEdge,
  addEdge,
  removeEdge,
  addVertex,
  removeVertex,
  neighbours: neighboursOp,
};

// ---------------------------------------------------------------------------------------------
// Pseudocode. Lines stay short (33 characters with their indent) so they fit a phone.

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(): PseudoBlock[] {
  return [
    {
      op: 'hasEdge',
      lines: [
        L('has.sig', 0, 'hasEdge(u, v)', 'Is there an edge from u to v?'),
        L('has.list', 1, 'for each x in Adj[u]', 'List: walk down u’s list.'),
        L('has.listYes', 2, 'if x == v: true', 'Stop when it is v.'),
        L('has.listNo', 1, 'false', 'Reached the end: no.'),
        L('has.matrix', 1, 'M[u][v] ≠ 0', 'Matrix: read one cell.'),
        L('has.edges', 1, 'for each (a, b) in E', 'Edge list: walk the rows.'),
        L('has.edgesYes', 2, 'if (a,b) == (u,v): true', 'Stop at the row u-v.'),
        L('has.edgesNo', 1, 'false', 'No such row: no.'),
      ],
    },
    {
      op: 'neighbours',
      lines: [
        L('nbrs.sig', 0, 'neighbours(u)', 'Which vertices does u reach?'),
        L('nbrs.list', 1, 'Adj[u]', 'List: u’s list is the answer.'),
        L('nbrs.matrix', 1, '{v : M[u][v] ≠ 0}', 'Matrix: read the whole row.'),
        L('nbrs.edges', 1, '{b : (u, b) in E}', 'Edge list: read every row.'),
      ],
    },
    {
      op: 'addEdge',
      lines: [
        L('add.sig', 0, 'addEdge(u, v)', 'Add an edge from u to v:'),
        L('add.check', 1, 'if hasEdge(u, v)', 'If it is already there,'),
        L('add.exists', 2, 'return', 'change nothing.'),
        L('add.list', 1, 'insert v in Adj[u]', 'List: put v in u’s list.'),
        L('add.matrix', 1, 'M[u][v] = w', 'Matrix: set one cell.'),
        L('add.edges', 1, 'append (u, v) to E', 'Edge list: add a row.'),
      ],
    },
    {
      op: 'removeEdge',
      lines: [
        L('rem.sig', 0, 'removeEdge(u, v)', 'Remove the edge from u to v:'),
        L('rem.check', 1, 'if not hasEdge(u, v)', 'If it is not there,'),
        L('rem.missing', 2, 'return', 'there is nothing to do.'),
        L('rem.list', 1, 'delete v from Adj[u]', 'List: find v and unlink it.'),
        L('rem.matrix', 1, 'M[u][v] = 0', 'Matrix: clear one cell.'),
        L('rem.edges', 1, 'delete (u, v) from E', 'Edge list: find the row, drop it.'),
      ],
    },
    {
      op: 'addVertex',
      lines: [
        L('addv.sig', 0, 'addVertex(x)', 'Add a vertex x:'),
        L('addv.list', 1, 'Adj[x] = empty list', 'List: one new empty list.'),
        L('addv.matrix', 1, 'copy M to (n+1)×(n+1)', 'Matrix: copy into a bigger one.'),
        L('addv.edges', 1, 'append x to V', 'Edge list: note x as a vertex.'),
      ],
    },
    {
      op: 'removeVertex',
      lines: [
        L('remv.sig', 0, 'removeVertex(x)', 'Remove x and its edges:'),
        L('remv.list', 1, 'drop Adj[x], x from all', 'List: drop x’s list and x.'),
        L('remv.matrix', 1, 'copy M to (n-1)×(n-1)', 'Matrix: copy without x.'),
        L('remv.edges', 1, 'drop rows with x', 'Edge list: check every row.'),
      ],
    },
  ];
}

export function initialSay(s: S): string {
  const g = s.graph;
  const e = g.edges[0];
  return `One graph, stored three ways. The adjacency list keeps each vertex's neighbours in a list, the matrix has a cell for every pair, and the edge list keeps one row per edge. Try Has edge? with ${e ? edgeText(g, e.u, e.v) : 'an edge'} to compare them.`;
}

export function initialVars(s: S) {
  return costVars(s.graph, zero());
}

export function describe(s: S): string {
  return describeGraph(s.graph);
}
