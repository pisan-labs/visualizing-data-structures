/**
 * Lowest common ancestor by binary lifting. On a rooted tree, up[k][v] is the ancestor 2^k steps
 * above v. Row 0 is the parent; each next row doubles: up[k][v] = up[k−1][up[k−1][v]]. With the
 * table, a query LCA(u, v) takes O(log n) jumps:
 *   1. make u the deeper one, and lift it by depth(u) − depth(v), one jump per 1-bit;
 *   2. if u = v now, that is the answer;
 *   3. else for k from the top row down: if up[k][u] ≠ up[k][v], jump both;
 *   4. the answer is up[0][u], the parent where they meet.
 *
 * Operations: `load` (a tree as graph text), `build` (fill the table, row by row) and
 * `query u v` (which builds the table first if it is not built).
 *
 * Settings
 *   root   the root, A to L; a tree without that vertex is rooted at its first vertex
 *   above  'nil'   jumping past the root gives NIL (–)
 *          'self'  the root is its own ancestor (up[k][root] = root), as many programs do
 * The tree must be undirected and connected with V − 1 edges; anything else is refused with
 * the reason. The table has LOG = ⌈log₂ V⌉ rows (at least 1).
 */
import type { Mark, OpSpec, PseudoBlock, Scalar, Step } from '../../engine/types';
import { edgeId, vertexId } from '../../layouts/graph';
import {
  components,
  describeGraph,
  findEdge,
  keyOf,
  neighbours,
  plural,
  type Graph,
} from '../_graph/graph';
import { graphVars, loadOp, vertexArg } from '../_graph/kit';
import { parseGraph } from '../_graph/parse';

export interface LcaState {
  graph: Graph;
  /** The table is built (for the root and setting the timeline runs with). */
  built: boolean;
}

export type Above = 'nil' | 'self';

export interface LcaSettings {
  [key: string]: Scalar;
  root: string;
  above: Above;
}

export const ROOT_CHOICES = 'ABCDEFGHIJKL'.split('');
export const defaults: LcaSettings = { root: 'A', above: 'nil' };

/** Ten vertices, depths 0 to 3. */
export const START_TEXT = 'A-B, A-C, B-D, B-E, C-F, D-G, D-H, E-I, F-J';

/** A table cell: a vertex, null for NIL, undefined while not filled yet. */
export type Cell = string | null | undefined;

export interface Tree {
  root: string;
  depth: Record<string, number>;
  /** BFS order from the root. */
  order: string[];
  /** up[k][v]. */
  up: Record<string, string | null>[];
  log: number;
}

export interface LcaBuild {
  root: string;
  /** Rows filled so far (cells undefined until filled). */
  table: Record<string, Cell>[];
  depth: Record<string, number>;
  k?: number;
  v?: string;
}

export interface LcaQuery {
  root: string;
  u0: string;
  v0: string;
  u: string;
  v: string;
  /** Jumps made, and the row being tried. */
  jumps: number;
  k?: number;
  /** Vertices u and v passed on their last jump (for marking the path). */
  answer?: string;
}

export interface LcaExtra {
  build?: LcaBuild;
  query?: LcaQuery;
  /** Shown during a query: the whole table. */
  tree?: Tree;
}

type S = LcaState;
type X = LcaExtra;
type Op = OpSpec<S, LcaSettings, X>;
type PStep = Step<S, X>;

export function init(): S {
  return { graph: parseGraph(START_TEXT) as Graph, built: false };
}

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });
export const cellId = (k: number, v: string) => `tbl-up${k}-${v}`;
export const depthCellId = (v: string) => `tbl-d-${v}`;

export const rootFor = (g: Graph, root: string) =>
  g.vertices.includes(root) ? root : g.vertices[0]!;

/** Why this graph is not a tree, or null when it is one. */
export function notATree(g: Graph): string | null {
  if (g.directed)
    return 'Binary lifting needs an undirected tree. This graph is directed: load it with - instead of >.';
  const pieces = components(g).length;
  if (pieces > 1) return `This graph is in ${pieces} pieces, so it is not one tree.`;
  if (g.edges.length !== g.vertices.length - 1)
    return `This graph has a cycle: a tree on ${plural(g.vertices.length, 'vertex', 'vertices')} has ${g.vertices.length - 1} edges, and it has ${g.edges.length}.`;
  return null;
}

export const logOf = (n: number) => Math.max(1, Math.ceil(Math.log2(n)));

/** Depths, BFS order and the full table, without steps. */
export function treeOf(g: Graph, root: string, above: Above): Tree {
  const depth: Record<string, number> = { [root]: 0 };
  const parent: Record<string, string | null> = { [root]: above === 'self' ? root : null };
  const order = [root];
  for (let i = 0; i < order.length; i++) {
    const u = order[i]!;
    for (const w of neighbours(g, u))
      if (depth[w] === undefined) {
        depth[w] = depth[u]! + 1;
        parent[w] = u;
        order.push(w);
      }
  }
  const log = logOf(g.vertices.length);
  const up: Record<string, string | null>[] = [parent];
  for (let k = 1; k < log; k++) {
    const row: Record<string, string | null> = {};
    for (const v of g.vertices) {
      const mid = up[k - 1]![v]!;
      row[v] = mid === null ? null : up[k - 1]![mid]!;
    }
    up.push(row);
  }
  return { root, depth, order, up, log };
}

/** LCA by binary lifting, without steps: the answer and the jumps made. */
export function lcaPlain(t: Tree, a: string, b: string) {
  let u = t.depth[a]! >= t.depth[b]! ? a : b;
  let v = u === a ? b : a;
  let jumps = 0;
  let diff = t.depth[u]! - t.depth[v]!;
  for (let k = 0; diff > 0; k++, diff >>= 1)
    if (diff & 1) {
      u = t.up[k]![u]!;
      jumps++;
    }
  if (u === v) return { answer: u, jumps };
  for (let k = t.log - 1; k >= 0; k--) {
    if (t.up[k]![u] !== t.up[k]![v]) {
      u = t.up[k]![u]!;
      v = t.up[k]![v]!;
      jumps++;
    }
  }
  return { answer: t.up[0]![u]!, jumps };
}

const show = (c: Cell) => (c === undefined ? ' ' : c === null ? 'NIL' : c);

function cloneBuild(b: LcaBuild): LcaBuild {
  return { ...b, table: b.table.map((row) => ({ ...row })), depth: { ...b.depth } };
}

/** The table-building steps (shared by `build` and a query that builds first). */
function* buildSteps(s: S, settings: LcaSettings): Generator<PStep, void, void> {
  const g = s.graph;
  const root = rootFor(g, settings.root);
  const t = treeOf(g, root, settings.above);
  const b: LcaBuild = { root, table: [], depth: {} };
  const step = (say: string, lines: string[], level: 1 | 2 | 3, marks: Mark[] = []): PStep => ({
    state: s,
    marks,
    say,
    lines,
    level,
    vars: { ...graphVars(g), root, LOG: t.log, k: b.k ?? '–', v: b.v ?? '–' },
    extra: { build: cloneBuild(b) },
  });
  const moved =
    root === settings.root
      ? ''
      : ` This tree has no vertex ${settings.root}, the root in the options, so it is rooted at ${root}.`;
  b.depth = { ...t.depth };
  b.table = [Object.fromEntries(t.order.map((v) => [v, t.up[0]![v]]))];
  b.k = 0;
  const deepest = Math.max(...Object.values(t.depth));
  yield step(
    `Root the tree at ${root}.${moved} One breadth-first search gives every vertex its depth (0 to ${deepest}) and its parent: row up[0]. ${
      settings.above === 'self'
        ? `${root}'s parent is ${root} itself.`
        : `${root} has no parent: NIL.`
    }`,
    ['sig', 'bfs', 'row0'],
    2,
    [mark(vertexId(root), 'active')],
  );
  for (let k = 1; k < t.log; k++) {
    b.k = k;
    b.table.push({});
    for (const v of g.vertices) {
      b.v = v;
      const mid = t.up[k - 1]![v]!;
      b.table[k]![v] = t.up[k]![v]!;
      yield step(
        mid === null
          ? `up[${k}][${v}]: ${v} has no ancestor 2^${k - 1} = ${2 ** (k - 1)} up, so none 2^${k} = ${2 ** k} up either: NIL.`
          : `up[${k}][${v}] = up[${k - 1}][up[${k - 1}][${v}]] = up[${k - 1}][${mid}] = ${show(t.up[k]![v]!)}: ${2 ** (k - 1)} steps up and ${2 ** (k - 1)} more.`,
        ['for.k', 'for.v', 'double'],
        3,
        [
          mark(vertexId(v), 'active'),
          mark(cellId(k, v), 'active'),
          ...(mid === null
            ? []
            : [mark(cellId(k - 1, v), 'compare'), mark(cellId(k - 1, mid), 'compare')]),
        ],
      );
    }
    b.v = undefined;
    yield step(
      `Row ${k} done: each vertex's ancestor ${2 ** k} steps up, from two jumps of ${2 ** (k - 1)}.`,
      ['for.k'],
      2,
      g.vertices.map((v) => mark(cellId(k, v), 'visit')),
    );
  }
  b.k = undefined;
}

function refusal(s: S, say: string): PStep {
  return { state: s, marks: [], say, lines: ['sig'], level: 1, vars: graphVars(s.graph) };
}

const build: Op = {
  label: 'Build table',
  arity: 0,
  *run(s, _args, { settings }) {
    const why = notATree(s.graph);
    if (why) {
      yield refusal(s, `No table. ${why}`);
      return s;
    }
    let last: PStep | undefined;
    for (const st of buildSteps(s, settings)) {
      last = st;
      yield st;
    }
    const next: S = { ...s, built: true };
    const t = treeOf(s.graph, rootFor(s.graph, settings.root), settings.above);
    yield {
      state: next,
      marks: [],
      say: `The table is built: ${t.log} ${t.log === 1 ? 'row' : 'rows'} for ${plural(s.graph.vertices.length, 'vertex', 'vertices')}, O(n log n) cells. Now any query takes O(log n) jumps. Type two vertices and press Query.`,
      lines: ['ret.build'],
      level: 1,
      vars: last?.vars,
      extra: { tree: t },
    };
    return next;
  },
};

const query: Op = {
  label: 'Query LCA',
  arity: 2,
  *run(s0, [a, b], { settings }) {
    const g = s0.graph;
    const why = notATree(g);
    if (why) {
      yield refusal(s0, `No query. ${why}`);
      return s0;
    }
    const A = vertexArg(g, a);
    if ('error' in A) {
      yield refusal(s0, `No query. ${A.error}`);
      return s0;
    }
    const B = vertexArg(g, b);
    if ('error' in B) {
      yield refusal(s0, `No query. ${B.error}`);
      return s0;
    }
    const s: S = { ...s0, built: true };
    const root = rootFor(g, settings.root);
    const t = treeOf(g, root, settings.above);
    const built = s0.built
      ? ''
      : 'The table was not built yet, so it is built first (press Build to watch). ';
    let u = A.v;
    let v = B.v;
    const q: LcaQuery = { root, u0: u, v0: v, u, v, jumps: 0 };
    const step = (say: string, lines: string[], level: 1 | 2 | 3, marks: Mark[] = []): PStep => ({
      state: s,
      marks,
      say,
      lines,
      level,
      vars: {
        ...graphVars(g),
        root,
        LOG: t.log,
        'depth(u)': t.depth[q.u]!,
        'depth(v)': t.depth[q.v]!,
        k: q.k ?? '–',
        jumps: q.jumps,
      },
      extra: { tree: t, query: { ...q } },
    });
    const swap = t.depth[u]! < t.depth[v]!;
    if (swap) [u, v] = [v, u];
    q.u = u;
    q.v = v;
    yield step(
      `${built}LCA(${A.v}, ${B.v}). Depths: ${A.v} is at ${t.depth[A.v]}, ${B.v} at ${t.depth[B.v]}.${
        swap ? ` Swap so that u = ${u} is the deeper one.` : ''
      }`,
      ['qsig', 'swap'],
      2,
      [mark(vertexId(u), 'active'), mark(vertexId(v), 'active')],
    );
    let diff = t.depth[u]! - t.depth[v]!;
    if (diff > 0) {
      const bits = diff.toString(2);
      yield step(
        `Lift u by depth(u) − depth(v) = ${diff} = ${bits} in binary: one jump for each 1-bit.`,
        ['diff'],
        2,
        [mark(vertexId(u), 'active')],
      );
    }
    for (let k = 0; diff > 0; k++, diff >>= 1) {
      q.k = k;
      if (!(diff & 1)) continue;
      const to = t.up[k]![u]!;
      q.u = to;
      q.jumps++;
      yield step(
        `Bit ${k} is set: jump u up 2^${k} = ${2 ** k}, from ${u} to up[${k}][${u}] = ${to}.`,
        ['lift'],
        2,
        [mark(vertexId(to), 'active'), mark(cellId(k, u), 'active'), ...pathMarks(g, t, u, to)],
      );
      u = to;
    }
    q.k = undefined;
    if (u === v) {
      q.answer = u;
      yield step(
        `Now u = v = ${u}: ${u} is an ancestor of the other vertex, so it is the LCA. ${plural(q.jumps, 'jump')}.`,
        ['same'],
        1,
        [mark(vertexId(u), 'found')],
      );
      return s;
    }
    yield step(
      `u = ${u} and v = ${v} are at the same depth, ${t.depth[u]}, but differ. Now jump both, biggest jumps first, as long as they land on different vertices.`,
      ['same', 'fork'],
      2,
      [mark(vertexId(u), 'active'), mark(vertexId(v), 'active')],
    );
    for (let k = t.log - 1; k >= 0; k--) {
      q.k = k;
      const x = t.up[k]![u]!;
      const y = t.up[k]![v]!;
      if (x !== y) {
        q.u = x;
        q.v = y;
        q.jumps++;
        yield step(
          `k = ${k}: up[${k}][${u}] = ${x} and up[${k}][${v}] = ${y} differ, so the LCA is higher. Jump both ${2 ** k} up: u = ${x}, v = ${y}.`,
          ['fork', 'diffk', 'jump'],
          2,
          [
            mark(vertexId(x), 'active'),
            mark(vertexId(y), 'active'),
            mark(cellId(k, u), 'compare'),
            mark(cellId(k, v), 'compare'),
            ...pathMarks(g, t, u, x),
            ...pathMarks(g, t, v, y),
          ],
        );
        u = x;
        v = y;
      } else {
        yield step(
          `k = ${k}: up[${k}][${u}] = up[${k}][${v}] = ${show(x)}. Same place: that is at or above the LCA, so do not jump.`,
          ['fork', 'diffk'],
          3,
          [mark(cellId(k, u), 'compare'), mark(cellId(k, v), 'compare')],
        );
      }
    }
    q.k = undefined;
    const ans = t.up[0]![u]!;
    q.answer = ans;
    yield step(
      `u = ${u} and v = ${v} are children of the same vertex: LCA(${A.v}, ${B.v}) = up[0][${u}] = ${ans}. ${plural(q.jumps, 'jump')}.`,
      ['ret'],
      1,
      [mark(vertexId(ans), 'found'), mark(cellId(0, u), 'active')],
    );
    return s;
  },
};

/** Edge marks for the tree path from a down-vertex up to its ancestor. */
function pathMarks(g: Graph, t: Tree, from: string, to: string): Mark[] {
  const out: Mark[] = [];
  let x = from;
  while (x !== to && t.up[0]![x] !== null && t.up[0]![x] !== x) {
    const p = t.up[0]![x]!;
    out.push(mark(edgeId(keyOf(findEdge(g, p, x)!)), 'active'));
    x = p;
  }
  return out;
}

const load = loadOp<S, LcaSettings, X>({
  make: (graph) => ({ graph, built: false }),
  ready: (g) => {
    const why = notATree(g);
    return why
      ? `${why} Binary lifting needs a tree.`
      : 'Press Build to fill the table, or type two vertices and press Query.';
  },
});

export const ops = { load, build, query };

// ---------------------------------------------------------------------------------------------
// Pseudocode

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: LcaSettings): PseudoBlock[] {
  const self = settings.above === 'self';
  return [
    {
      op: 'build',
      lines: [
        L('sig', 0, 'BUILD(T, r)', 'Fill the jump table:'),
        L('bfs', 1, 'BFS from r: v.depth, v.parent', 'one search finds depths and parents;'),
        self
          ? L(
              'row0',
              1,
              'up[0][v] = v.parent; up[0][r] = r',
              'row 0 is the parent, and r is its own parent.',
            )
          : L(
              'row0',
              1,
              'up[0][v] = v.parent (NIL at r)',
              'row 0 is the parent (none for the root).',
            ),
        L('for.k', 1, 'for k = 1 to LOG − 1', 'For each next row,'),
        L('for.v', 2, 'for each v', 'for each vertex v,'),
        self
          ? L('double', 3, 'up[k][v] = up[k−1][up[k−1][v]]', 'jump 2^(k−1) up, then 2^(k−1) more.')
          : L(
              'double',
              3,
              'up[k][v] = up[k−1][up[k−1][v]]',
              'jump 2^(k−1), then 2^(k−1) more (NIL stays NIL).',
            ),
        L('ret.build', 1, 'return up', 'The table is ready.'),
      ],
    },
    {
      op: 'query',
      lines: [
        L('qsig', 0, 'LCA(u, v)', 'Find the lowest common ancestor:'),
        L('swap', 1, 'if u.depth < v.depth: swap', 'make u the deeper vertex.'),
        L('diff', 1, 'd = u.depth − v.depth', 'Lift u by the difference in depth,'),
        L('lift', 1, 'for each bit k of d: u = up[k][u]', 'one jump per 1-bit.'),
        L('same', 1, 'if u == v: return u', 'If they meet, that is the answer.'),
        L('fork', 1, 'for k = LOG − 1 down to 0', 'Try the biggest jumps first:'),
        L('diffk', 2, 'if up[k][u] ≠ up[k][v]', 'if the jump lands them apart,'),
        L('jump', 3, 'u = up[k][u]; v = up[k][v]', 'take it with both.'),
        L('ret', 1, 'return up[0][u]', 'Their parent is the LCA.'),
      ],
    },
  ];
}

export function initialSay(s: S): string {
  return `A tree with ${plural(s.graph.vertices.length, 'vertex', 'vertices')}, rooted at A. Press Build to fill the binary lifting table, or type two vertices, such as G I, and press Query.`;
}

export const initialVars = (s: S) => graphVars(s.graph);

export const describe = (s: S): string => describeGraph(s.graph);

export function describeExtra(g: Graph, x: LcaExtra): string {
  if (x.query) {
    const q = x.query;
    return `LCA(${q.u0}, ${q.v0}): u = ${q.u}, v = ${q.v}.${q.answer ? ` Answer ${q.answer}.` : ''}`;
  }
  const rows = x.build?.table ?? x.tree?.up ?? [];
  return rows
    .map((row, k) => `up[${k}]: ${g.vertices.map((v) => `${v} ${show(row[v])}`).join(', ')}.`)
    .join(' ');
}
