/**
 * Prim's minimum spanning tree, CLRS style: MST-PRIM(G, w, r) grows one tree from the root r.
 * Every vertex not yet in the tree waits in a min-priority queue Q, keyed by the weight of the
 * lightest edge that joins it to the tree (∞ when there is none). Each round extracts the
 * vertex with the smallest key, adds it to the tree with the edge (π, u), and lowers the keys
 * of its neighbours that are still in Q.
 *
 * Settings
 *   queue  'decrease'  CLRS: every vertex is in Q from the start, and a lighter edge lowers a key
 *                      with DECREASE-KEY
 *          'lazy'      r goes in alone; a lighter edge inserts a new entry, and an entry for a
 *                      vertex already in the tree is stale and skipped (what heap code does)
 *   start  the root r, A to L. A graph without that vertex starts at its first vertex.
 *   layout the drawing only
 * Both queues add the vertices in the same order (smallest key first, ties in name order) and
 * find the same π. On a graph in several pieces, CLRS's queue extracts a vertex at ∞ when one
 * piece is done, and it starts a new tree; the lazy queue starts one at the first vertex left.
 * Either way the result is a minimum spanning forest.
 *
 * The state is just the graph; a run's bookkeeping travels in the steps' `extra`.
 */
import type { Mark, OpSpec, PseudoBlock, Scalar, Step } from '../../engine/types';
import type { GraphTemplate } from '../../layouts/graph';
import { edgeId, vertexId, weightId } from '../../layouts/graph';
import {
  adjacency,
  compareNames,
  describeGraph,
  edgeKey,
  findEdge,
  listWords,
  type Edge,
  type Graph,
} from '../_graph/graph';
import { graphVars, loadOp, type GraphState } from '../_graph/kit';
import { directedRefusal, readyText, startMstGraph, treeWords } from '../_graph/mst';

export type PrimState = GraphState;
export type QueueKind = 'decrease' | 'lazy';

export interface PrimSettings {
  [key: string]: Scalar;
  queue: QueueKind;
  start: string;
  layout: GraphTemplate;
}

export const START_CHOICES = 'ABCDEFGHIJKL'.split('');

export const defaults: PrimSettings = { queue: 'decrease', start: 'A', layout: 'force' };

export interface QEntry {
  /** The vertex in CLRS's queue; vertex.n for the n-th entry of a vertex in the lazy one. */
  uid: string;
  v: string;
  /** The key; null is ∞. */
  k: number | null;
}

export interface PrimRun {
  /** The root of the first tree. */
  r: string;
  key: Record<string, number | null>;
  pi: Record<string, string | null>;
  /** Vertices in the tree, in the order they were added. */
  T: string[];
  /** Roots of the trees so far (more than one when the graph is in pieces). */
  roots: string[];
  /** The priority queue, smallest key first (∞ last), ties in name order. */
  Q: QEntry[];
  /** Edges looked at, by edge key. */
  seen: Record<string, true>;
  u?: string;
  v?: string;
  /** Edges looked at, and how many lowered a key. */
  checks: number;
  lowered: number;
  /** Total weight of the tree edges so far. */
  weight: number;
  /** The most cells T and Q hold together during this run, so the panel keeps one size. */
  room: number;
  final?: boolean;
}

export interface PrimExtra {
  run?: PrimRun;
}

type S = PrimState;
type X = PrimExtra;
type Op = OpSpec<S, PrimSettings, X>;
type PStep = Step<S, X>;

export function init(): S {
  return { graph: startMstGraph() };
}

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });

/** Panel ids (see view.ts). */
export const cellId = (row: 'key' | 'pi', v: string) => `tbl-${row}-${v}`;
export const queueId = (uid: string) => `pq-${uid}`;

export function byKey(a: QEntry, b: QEntry): number {
  if (a.k !== b.k) {
    if (a.k === null) return 1;
    if (b.k === null) return -1;
    return a.k - b.k;
  }
  return compareNames(a.v, b.v) || compareNames(a.uid, b.uid);
}

/** A lazy-queue entry that no longer counts: its vertex is in the tree or has a smaller key. */
export const isStale = (r: PrimRun, q: QEntry) =>
  q.uid !== q.v && (r.T.includes(q.v) || q.k !== r.key[q.v]);

function clone(r: PrimRun): PrimRun {
  return {
    ...r,
    key: { ...r.key },
    pi: { ...r.pi },
    T: [...r.T],
    roots: [...r.roots],
    Q: r.Q.map((q) => ({ ...q })),
    seen: { ...r.seen },
  };
}

function runVars(g: Graph, r: PrimRun): Record<string, Scalar> {
  return {
    ...graphVars(g),
    r: r.r,
    u: r.u ?? '–',
    v: r.v ?? '–',
    T: r.T.length,
    Q: r.Q.length,
    checks: r.checks,
    lowered: r.lowered,
    weight: r.weight,
  };
}

/** The root a run uses: the start setting, or the first vertex when there is no such vertex. */
export function rootFor(g: Graph, start: string): string {
  return g.vertices.includes(start) ? start : g.vertices[0]!;
}

/** The tree edges of a run, in the order their lower ends joined the tree. */
export function treeEdges(g: Graph, r: { T: string[]; pi: Record<string, string | null> }): Edge[] {
  return r.T.filter((v) => r.pi[v]).map((v) => findEdge(g, r.pi[v]!, v)!);
}

/** The final answer of a run, in the code tabs' words: total weight | π per vertex. */
export function runSummary(g: Graph, r: PrimRun): string {
  return `${r.weight} | ${g.vertices.map((v) => r.pi[v] ?? '-').join(' ')}`;
}

/**
 * Prim's algorithm without steps: the order vertices join, π, and the most cells T and the
 * lazy queue hold at once. Tests and practice use it, and the lazy run sizes its panel with it.
 */
export function primPlain(g: Graph, root: string) {
  const key = new Map<string, number>();
  const pi = new Map<string, string>();
  const done = new Set<string>();
  const order: string[] = [];
  let most = 1;
  const starts = [root, ...g.vertices];
  let n = 0;
  for (const s of starts) {
    if (done.has(s)) continue;
    let q: QEntry[] = [{ uid: `${s}.${n++}`, v: s, k: null }];
    while (q.length) {
      const top = q.shift()!;
      if (done.has(top.v)) continue;
      done.add(top.v);
      order.push(top.v);
      for (const a of adjacency(g).get(top.v)!) {
        if (done.has(a.v)) continue;
        if (!key.has(a.v) || a.w < key.get(a.v)!) {
          key.set(a.v, a.w);
          pi.set(a.v, top.v);
          q = [...q, { uid: `${a.v}.${n++}`, v: a.v, k: a.w }].sort(byKey);
          most = Math.max(most, done.size + q.length);
        }
      }
    }
  }
  return { order, pi, most };
}

const run: Op = {
  label: 'Run Prim',
  arity: 0,
  *run(s, _args, { settings }) {
    const g = s.graph;
    const lazy = settings.queue === 'lazy';
    if (g.directed) {
      yield {
        state: s,
        marks: [],
        say: directedRefusal('prim'),
        lines: ['sig'],
        level: 1,
        vars: graphVars(g),
      } satisfies PStep;
      return s;
    }
    const root = rootFor(g, String(settings.start));
    const moved =
      root === settings.start
        ? ''
        : ` This graph has no vertex ${settings.start}, the start vertex in the options, so Prim starts at ${root}, its first vertex.`;
    const r: PrimRun = {
      r: root,
      key: Object.fromEntries(g.vertices.map((v) => [v, null])),
      pi: Object.fromEntries(g.vertices.map((v) => [v, null])),
      T: [],
      roots: [],
      Q: [],
      seen: {},
      checks: 0,
      lowered: 0,
      weight: 0,
      room: lazy ? primPlain(g, root).most : g.vertices.length,
    };
    const step = (say: string, lines: string[], level: 1 | 2 | 3, marks: Mark[] = []): PStep => ({
      state: s,
      marks,
      say,
      lines,
      level,
      vars: runVars(g, r),
      extra: { run: clone(r) },
    });
    const inserts = new Map<string, number>();
    const insert = (v: string, k: number | null) => {
      const n = (inserts.get(v) ?? 0) + 1;
      inserts.set(v, n);
      const uid = `${v}.${n}`;
      r.Q = [...r.Q, { uid, v, k }].sort(byKey);
      return uid;
    };

    r.key[root] = 0;
    let first: string;
    if (lazy) first = insert(root, 0);
    else {
      r.Q = g.vertices.map((v) => ({ uid: v, v, k: r.key[v] ?? null })).sort(byKey);
      first = root;
    }
    yield step(
      `Prim from ${root}.${moved} Every vertex starts with key = ∞ and π = NIL, then ${root}.key = 0, so ${root} comes out first. A vertex's key is the weight of the lightest edge joining it to the tree. ${
        lazy
          ? `Q starts with one entry: ${root}, with key 0.`
          : `Q holds every vertex, keyed by key: ${root} at the front, the rest at ∞.`
      }`,
      ['init', 'init2', 'root', 'Q'],
      2,
      [
        mark(vertexId(root), 'visit'),
        mark(cellId('key', root), 'visit'),
        mark(queueId(first), 'visit'),
      ],
    );

    for (;;) {
      if (r.Q.length === 0) {
        const left = g.vertices.find((v) => !r.T.includes(v));
        if (!left || !lazy) break;
        r.u = undefined;
        r.v = undefined;
        const uid = insert(left, null);
        const rest = g.vertices.filter((v) => !r.T.includes(v));
        const one = rest.length === 1;
        yield step(
          `Q is empty, but ${listWords(rest)} ${one ? 'is' : 'are'} not in the tree yet, and no edge reaches ${one ? 'it' : 'them'} from the tree: the graph is not connected. Start a new tree at ${left}, the first vertex left.`,
          ['while', 'restart'],
          2,
          [mark(vertexId(left), 'visit'), mark(queueId(uid), 'visit')],
        );
        continue;
      }
      if (lazy && r.T.length === g.vertices.length) break;
      const top = r.Q.shift()!;
      const u = top.v;
      r.u = u;
      r.v = undefined;
      if (lazy && r.T.includes(u)) {
        yield step(
          `Extract (${u}, ${top.k}), the smallest key in Q. But ${u} is in the tree already: this entry went in before a lighter edge to ${u} turned up. It is stale, so skip it.`,
          ['while', 'extract', 'stale'],
          2,
          [mark(vertexId(u), 'compare')],
        );
        continue;
      }
      r.T.push(u);
      const adj = adjacency(g).get(u)!;
      const noEdges = adj.length ? '' : ` ${u} has no edges.`;
      if (r.pi[u] === null) {
        r.roots.push(u);
        const why =
          u === root
            ? `Extract ${u}, the root, with key 0. It starts the tree on its own.${noEdges}`
            : `Extract ${u}${lazy ? '' : ' with key ∞, the smallest left in Q'}: no edge joins ${u} to the tree, so it starts a new tree of its own. Prim builds a spanning forest here, one tree per piece.${noEdges}`;
        yield step(why, ['while', 'extract', 'addT'], 2, [
          mark(vertexId(u), 'active'),
          mark(queueId(u), 'active'),
        ]);
      } else {
        const p = r.pi[u]!;
        const key = edgeKey(g, p, u);
        r.weight += top.k!;
        const tie = r.Q.filter((q) => q.k === top.k && !isStale(r, q)).map((q) => q.v);
        const tieText = tie.length
          ? ` ${listWords([u, ...tie])} ${tie.length === 1 ? 'both' : 'all'} have key ${top.k}; ${u} comes first in name order.`
          : '';
        yield step(
          `Extract ${u}, the smallest key in Q (${top.k}).${tieText} The lightest edge joining ${u} to the tree is ${p}-${u} (${top.k}), so ${u} joins the tree with that edge. Tree weight so far: ${r.weight}.${noEdges}`,
          ['while', 'extract', 'addT'],
          2,
          [
            mark(vertexId(u), 'active'),
            mark(edgeId(key), 'active'),
            mark(weightId(key), 'active'),
            mark(queueId(u), 'active'),
            mark(cellId('key', u), 'done'),
          ],
        );
      }
      for (const { v, w } of adj) {
        r.v = v;
        r.checks++;
        const key = edgeKey(g, u, v);
        r.seen[key] = true;
        const edgeMarks = [mark(edgeId(key), 'active'), mark(weightId(key), 'active')];
        if (r.T.includes(v)) {
          yield step(
            `Edge ${u}-${v} (${w}): ${v} is in the tree already${r.pi[u] === v ? `, joined by this very edge` : ''}, so skip it.`,
            ['for', 'if'],
            3,
            [mark(vertexId(u), 'active'), mark(vertexId(v), 'compare'), ...edgeMarks],
          );
          continue;
        }
        const old = r.key[v] ?? null;
        if (old === null || w < old) {
          r.key[v] = w;
          r.pi[v] = u;
          r.lowered++;
          let qid: string;
          if (lazy) qid = insert(v, w);
          else {
            r.Q = r.Q.map((q) => (q.v === v ? { ...q, k: w } : q)).sort(byKey);
            qid = v;
          }
          const queueText = lazy
            ? `(${v}, ${w}) goes into Q.${old !== null ? ` The old entry (${v}, ${old}) stays behind, stale.` : ''}`
            : `${v}'s key in Q drops to ${w}.`;
          yield step(
            `Edge ${u}-${v} (${w}): ${v} is not in the tree, and ${w} is less than ${v}.key = ${old === null ? '∞' : old}. So ${v}.key = ${w}, π[${v}] = ${u}, and ${queueText}`,
            ['for', 'if', 'set.pi', 'set.key', lazy ? 'push' : 'dec'],
            2,
            [
              mark(vertexId(u), 'active'),
              mark(vertexId(v), 'visit'),
              ...edgeMarks,
              mark(cellId('key', v), 'visit'),
              mark(cellId('pi', v), 'visit'),
              mark(queueId(qid), 'visit'),
            ],
          );
        } else {
          yield step(
            `Edge ${u}-${v} (${w}): ${w} is not less than ${v}.key = ${old}, so ${v} keeps its lighter edge, ${r.pi[v]}-${v}. Nothing changes.`,
            ['for', 'if'],
            2,
            [mark(vertexId(u), 'active'), mark(vertexId(v), 'compare'), ...edgeMarks],
          );
        }
      }
      r.v = undefined;
    }
    r.u = undefined;
    r.final = true;
    const stale =
      lazy && r.Q.length
        ? ` The ${r.Q.length === 1 ? 'entry' : `${r.Q.length} entries`} left in Q ${r.Q.length === 1 ? 'is' : 'are'} stale, so it can stop.`
        : '';
    yield step(
      `${lazy ? 'Every vertex is in the tree' : 'Q is empty: every vertex is in the tree'}, so Prim is done.${stale} ${treeWords(g, treeEdges(g, r))} The π pointers lead from each vertex to its parent in the tree.`,
      ['while'],
      1,
    );
    return s;
  },
};

const load = loadOp<S, PrimSettings, X>({
  make: (graph) => ({ graph }),
  ready: (g) => readyText(g, 'prim'),
});

export const ops = { load, run };

// ---------------------------------------------------------------------------------------------
// Pseudocode, after CLRS. Lines stay short for a phone.

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: PrimSettings): PseudoBlock[] {
  const lazy = settings.queue === 'lazy';
  const lines = [
    L('sig', 0, 'MST-PRIM(G, w, r)', 'Grow a minimum spanning tree from r:'),
    L('init', 1, 'for each u ∈ G.V', 'For every vertex u,'),
    L('init2', 2, 'u.key = ∞; u.π = NIL', 'no edge joins it to the tree yet.'),
    L('root', 1, 'r.key = 0', 'The root r comes out first.'),
    lazy
      ? L('Q', 1, 'Q = {(r, 0)}', 'Q starts with r, key 0.')
      : L('Q', 1, 'Q = G.V  // keyed by key', 'Put every vertex in Q, keyed by key.'),
    lazy
      ? L('while', 1, 'while some u ∉ T', 'While some vertex is not in the tree T,')
      : L('while', 1, 'while Q ≠ ∅', 'While Q is not empty,'),
    ...(lazy
      ? [L('restart', 2, 'if Q = ∅: Q = {(x, ∞)}', 'if Q ran dry, start a tree at x ∉ T.')]
      : []),
    lazy
      ? L('extract', 2, '(u, k) = EXTRACT-MIN(Q)', 'take the entry with the smallest key.')
      : L('extract', 2, 'u = EXTRACT-MIN(Q)', 'take the vertex with the smallest key'),
    ...(lazy ? [L('stale', 2, 'if u ∈ T: continue', 'If u is in the tree already, skip it.')] : []),
    lazy
      ? L('addT', 2, 'T = T ∪ {u}', 'Add u to the tree, with edge (u.π, u).')
      : L('addT', 2, '// u joins with (u.π, u)', 'and add it to the tree with edge (u.π, u).'),
    L('for', 2, 'for each v ∈ G.Adj[u]', 'For each edge u-v,'),
    lazy
      ? L('if', 3, 'if v ∉ T and w(u, v) < v.key', 'if v is not in the tree and u-v is lighter,')
      : L('if', 3, 'if v ∈ Q and w(u, v) < v.key', 'if v is not in the tree and u-v is lighter,'),
    L('set.pi', 4, 'v.π = u', 'make u the parent of v,'),
    L('set.key', 4, 'v.key = w(u, v)', 'lower v.key to w(u, v),'),
    lazy
      ? L('push', 4, 'INSERT(Q, (v, v.key))', 'and put v in Q with its new key.')
      : L('dec', 4, 'DECREASE-KEY(Q, v, v.key)', "and lower v's key in Q."),
  ];
  return [{ op: 'run', lines }];
}

export function initialSay(s: S): string {
  return `${describeGraph(s.graph).split('. ')[0]}. Press Run: Prim's algorithm grows a minimum spanning tree from A, the start vertex in the options, one lightest edge at a time.`;
}

export function initialVars(s: S) {
  return graphVars(s.graph);
}

export function describe(s: S): string {
  return describeGraph(s.graph);
}

/** The scene label: where a run stands. */
export function describeRun(g: Graph, r: PrimRun): string {
  const queue = r.Q.filter((q) => !isStale(r, q))
    .map((q) => `${q.v} ${q.k === null ? '∞' : q.k}`)
    .join(', ');
  const edges = treeEdges(g, r).map((e) => `${e.u}-${e.v}`);
  return `Prim from ${r.r}. In the tree: ${r.T.length ? r.T.join(', ') : 'none'}. Queue: ${queue || 'empty'}. Tree edges: ${edges.length ? edges.join(', ') : 'none'}. Weight ${r.weight}.`;
}
