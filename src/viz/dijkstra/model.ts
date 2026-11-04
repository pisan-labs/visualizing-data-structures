/**
 * Dijkstra's algorithm, CLRS style: DIJKSTRA(G, w, s) settles vertices in order of their
 * distance from s. A min-priority queue Q holds the vertices not yet settled, keyed by d; each
 * round extracts the smallest, adds it to the settled set S, and relaxes its edges. The π edges
 * form the shortest-path tree.
 *
 * Settings: `queue` is CLRS's queue (every vertex goes in at the start, keyed by d, and a
 * successful relaxation lowers a key with DECREASE-KEY) or a lazy queue (s goes in alone, a
 * successful relaxation inserts a new entry, and an entry for a vertex that is already settled
 * is stale and skipped). The lazy queue is what code with a binary heap usually does. Both
 * settle the reachable vertices in the same order, smallest d first and ties in name order.
 *
 * Dijkstra needs every weight to be at least 0. A graph with a negative edge is refused with
 * the reason, and, when it can be found, the vertex the greedy choice would get wrong. The
 * input is never changed.
 *
 * The state is just the graph; a run's bookkeeping travels in the steps' `extra`, so a plain
 * state draws the bare graph.
 */
import type { Mark, OpSpec, PseudoBlock, Scalar, Step } from '../../engine/types';
import type { GraphTemplate } from '../../layouts/graph';
import { edgeId, labelId, vertexId, weightId } from '../../layouts/graph';
import {
  adjacency,
  compareNames,
  describeGraph,
  edgeKey,
  keyOf,
  listWords,
  plural,
  type Edge,
  type Graph,
} from '../_graph/graph';
import { graphVars, loadOp, vertexArg, type GraphState } from '../_graph/kit';
import {
  arrow,
  cycleWeight,
  cycleWords,
  dist,
  edgeWords,
  greedy,
  negativeEdges,
  pathOf,
  pathWords,
  plus,
  readyText,
  rotateCycle,
  shortest,
  startPathsGraph,
} from '../_paths/kit';

export type DijkstraState = GraphState;
export type QueueKind = 'decrease' | 'lazy';

export interface DijkstraSettings {
  [key: string]: Scalar;
  queue: QueueKind;
  layout: GraphTemplate;
}

export const defaults: DijkstraSettings = { queue: 'decrease', layout: 'force' };

export interface QEntry {
  /** The vertex in CLRS's queue; vertex.n for the n-th entry of a vertex in the lazy one. */
  uid: string;
  v: string;
  /** The key; null is ∞. */
  k: number | null;
}

/** One run's bookkeeping, as it stands at a step. */
export interface DijkstraRun {
  s: string;
  /** null is ∞. */
  d: Record<string, number | null>;
  pi: Record<string, string | null>;
  /** Settled vertices, in the order they were extracted. */
  S: string[];
  /** The priority queue, smallest key first, ties in name order. */
  Q: QEntry[];
  /** Edges RELAX has looked at, by edge key. */
  relaxed: Record<string, true>;
  /** The vertex whose edges are being relaxed, and the other end of the edge. */
  u?: string;
  v?: string;
  /** RELAX calls so far, and how many of them lowered a d. */
  relax: number;
  lowered: number;
  /** The most cells S and Q hold together during this run, so their panel keeps one size. */
  room: number;
  /** The run is over: the shortest-path tree is drawn on its own. */
  final?: boolean;
}

export interface DijkstraExtra {
  run?: DijkstraRun;
}

type S = DijkstraState;
type X = DijkstraExtra;
type Op = OpSpec<S, DijkstraSettings, X>;
type DStep = Step<S, X>;

export function init(): S {
  return { graph: startPathsGraph() };
}

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });
const vmark = (v: string, role: Mark['role']) => [mark(vertexId(v), role)];

/** Panel ids (see view.ts). */
export const cellId = (row: 'd' | 'pi', v: string) => `tbl-${row}-${v}`;
export const queueId = (uid: string) => `pq-${uid}`;
/** A settled vertex's cell in the S | Q row (in CLRS's queue, the same cell it had in Q). */
export const settledId = (v: string) => `pq-${v}`;

/** Smallest key first (∞ last), ties in name order. */
export function byKey(a: QEntry, b: QEntry): number {
  if (a.k !== b.k) {
    if (a.k === null) return 1;
    if (b.k === null) return -1;
    return a.k - b.k;
  }
  return compareNames(a.v, b.v) || compareNames(a.uid, b.uid);
}

/** A lazy-queue entry that no longer counts: its vertex is settled or has a smaller d now. */
export const isStale = (r: DijkstraRun, q: QEntry) =>
  q.uid !== q.v && (r.S.includes(q.v) || q.k !== r.d[q.v]);

function clone(r: DijkstraRun): DijkstraRun {
  return {
    ...r,
    d: { ...r.d },
    pi: { ...r.pi },
    S: [...r.S],
    Q: r.Q.map((q) => ({ ...q })),
    relaxed: { ...r.relaxed },
  };
}

function runVars(g: Graph, r: DijkstraRun): Record<string, Scalar> {
  return {
    ...graphVars(g),
    s: r.s,
    u: r.u ?? '–',
    v: r.v ?? '–',
    S: r.S.length ? r.S.join(' ') : 'empty',
    Q: r.Q.length,
    relax: r.relax,
    lowered: r.lowered,
  };
}

/**
 * The most cells S and the lazy queue hold together at once, found by running it without
 * steps (CLRS's queue always holds V together with S).
 */
function lazyRoom(g: Graph, s: string): number {
  const d = new Map<string, number>([[s, 0]]);
  const done = new Set<string>();
  let q: QEntry[] = [{ uid: s, v: s, k: 0 }];
  let most = 1;
  while (q.length) {
    const top = q.shift()!;
    if (done.has(top.v)) continue;
    done.add(top.v);
    for (const a of adjacency(g).get(top.v)!) {
      const nd = top.k! + a.w;
      if (!d.has(a.v) || nd < d.get(a.v)!) {
        d.set(a.v, nd);
        q = [...q, { uid: `${a.v}.${q.length}`, v: a.v, k: nd }].sort(byKey);
        most = Math.max(most, done.size + q.length);
      }
    }
  }
  return most;
}

/** The final answer of a run, in the code tabs' words: d | π (in vertex order). */
export function runSummary(g: Graph, r: DijkstraRun): string {
  const d = g.vertices.map((v) => (r.d[v] === null ? 'inf' : String(r.d[v]))).join(' ');
  const pi = g.vertices.map((v) => r.pi[v] ?? '-').join(' ');
  return `${d} | ${pi}`;
}

/** Why Dijkstra will not run, and what would go wrong on this graph if it did. */
function refusal(g: Graph, src: string, neg: Edge[]): string {
  const words = listWords(neg.map((e) => edgeWords(g, e)));
  const has = neg.length === 1 ? 'has a negative weight' : 'have negative weights';
  const why =
    'Dijkstra settles the vertex in Q with the smallest d and never looks at it again. That is safe only when no weight is negative: then a path can only get longer as it goes, so nothing found later can beat a settled distance.';
  const truth = shortest(g, src);
  let what: string;
  if (truth.cycle) {
    const c = rotateCycle(truth.cycle);
    const lap = c.length === 2 && !g.directed ? ' (an undirected edge goes both ways)' : '';
    what = `Worse, ${src} can reach a negative cycle, ${cycleWords(c)}${lap}, of weight ${cycleWeight(g, c)}. Going round it again and again makes paths as light as you like, so some vertices have no shortest path at all.`;
  } else {
    const gr = greedy(g, src);
    const wrong = gr.order.find((v) => gr.d[v] !== truth.d[v]);
    if (wrong) {
      const p = pathOf(truth.pi, wrong)!;
      what = `Here it would settle ${wrong} with d = ${gr.d[wrong]}, but ${pathWords(p)} costs ${truth.d[wrong]}.`;
    } else {
      what = `From ${src}, the greedy order happens to give the right distances on this graph, but only by luck: nothing in Dijkstra's argument covers negative weights.`;
    }
  }
  return `Dijkstra will not run on this graph: ${words} ${has}. ${why} ${what} Bellman-Ford handles negative weights: load the same graph at /bellman-ford/.`;
}

const run: Op = {
  label: 'Run Dijkstra from',
  arity: 1,
  *run(s, [arg], { settings }) {
    const g = s.graph;
    const lazy = settings.queue === 'lazy';
    const a = vertexArg(g, arg);
    if ('error' in a) {
      yield {
        state: s,
        marks: [],
        say: `Dijkstra needs a start vertex. ${a.error}`,
        lines: ['sig'],
        level: 1,
        vars: graphVars(g),
      } satisfies DStep;
      return s;
    }
    const src = a.v;
    const neg = negativeEdges(g);
    if (neg.length > 0) {
      yield {
        state: s,
        marks: neg.flatMap((e) => [
          mark(edgeId(keyOf(e)), 'error'),
          mark(weightId(keyOf(e)), 'error'),
        ]),
        say: refusal(g, src, neg),
        lines: ['pre'],
        level: 1,
        vars: { ...graphVars(g), s: src, negative: neg.length },
      } satisfies DStep;
      return s;
    }

    const r: DijkstraRun = {
      s: src,
      d: Object.fromEntries(g.vertices.map((v) => [v, null])),
      pi: Object.fromEntries(g.vertices.map((v) => [v, null])),
      S: [],
      Q: [],
      relaxed: {},
      relax: 0,
      lowered: 0,
      room: lazy ? lazyRoom(g, src) : g.vertices.length,
    };
    const step = (say: string, lines: string[], level: 1 | 2 | 3, marks: Mark[] = []): DStep => ({
      state: s,
      marks,
      say,
      lines,
      level,
      vars: runVars(g, r),
      extra: { run: clone(r) },
    });
    const inserts = new Map<string, number>();
    const insert = (v: string, k: number) => {
      const n = (inserts.get(v) ?? 0) + 1;
      inserts.set(v, n);
      const uid = `${v}.${n}`;
      r.Q = [...r.Q, { uid, v, k }].sort(byKey);
      return uid;
    };

    r.d[src] = 0;
    let first: string;
    if (lazy) first = insert(src, 0);
    else {
      r.Q = g.vertices.map((v) => ({ uid: v, v, k: r.d[v] ?? null })).sort(byKey);
      first = src;
    }
    yield step(
      `Dijkstra from ${src}. Every vertex starts with d = ∞ and π = NIL, then ${src}.d = 0. S, the set of settled vertices, starts empty. ${
        lazy
          ? `Q starts with one entry: ${src}, with key 0.`
          : `Q holds every vertex, keyed by d, so ${src} is at the front and the rest wait at ∞.`
      }`,
      ['init', 'S', 'Q'],
      2,
      [...vmark(src, 'visit'), mark(cellId('d', src), 'visit'), mark(queueId(first), 'visit')],
    );

    let unreachable = 0;
    while (r.Q.length > 0) {
      const top = r.Q.shift()!;
      const u = top.v;
      r.u = u;
      r.v = undefined;
      if (lazy && r.S.includes(u)) {
        yield step(
          `Extract (${u}, ${top.k}), the smallest key in Q. But ${u} was settled already, with d = ${r.d[u]}: this entry went in before ${u}'s d dropped. It is stale, so skip it.`,
          ['while', 'extract', 'stale'],
          2,
          [...vmark(u, 'compare')],
        );
        continue;
      }
      r.S.push(u);
      const adj = adjacency(g).get(u)!;
      if (r.d[u] === null) {
        // Only CLRS's queue gets here: every key left is ∞.
        r.relax += adj.length;
        const nothing = adj.length
          ? ` Relaxing its ${plural(adj.length, 'edge')} changes nothing: ∞ + w is still ∞.`
          : '';
        yield step(
          unreachable === 0
            ? `Extract ${u}. Its key is ∞, and that is the smallest left in Q: no settled vertex has an edge to ${u}, so ${src} cannot reach it. ${u} joins S with d = ∞.${nothing}`
            : `Extract ${u}, also at ∞: ${src} cannot reach it either.${nothing}`,
          ['while', 'extract', 'addS'],
          2,
          [mark(labelId(u), 'stale'), mark(settledId(u), 'active')],
        );
        unreachable++;
        continue;
      }
      const tie = r.Q.filter((q) => q.k === r.d[u] && !isStale(r, q)).map((q) => q.v);
      const tieText = tie.length
        ? ` ${listWords([u, ...tie])} ${tie.length === 1 ? 'both' : 'all'} have key ${r.d[u]}; ${u} comes first in name order.`
        : '';
      const because =
        r.S.length === 2
          ? `: d[${u}] = ${r.d[u]} is final, because any other way to ${u} leaves S through a vertex in Q, and every key there is at least ${r.d[u]}`
          : `, so d[${u}] = ${r.d[u]} is final`;
      yield step(
        u === src
          ? `Extract ${u}, the smallest key in Q (0). ${u} joins S: its distance, 0, is final.${adj.length ? ` Now relax its edges: ${listWords(adj.map((x) => arrow(u, x.v)))}.` : ` It has no edges${g.directed ? ' out' : ''}.`}`
          : `Extract ${u}, the smallest key in Q (${r.d[u]}).${tieText} ${u} joins S${because}.${adj.length ? '' : ` ${u} has no edges${g.directed ? ' out' : ''}.`}`,
        ['while', 'extract', 'addS'],
        2,
        [...vmark(u, 'active'), mark(settledId(u), 'active'), mark(cellId('d', u), 'done')],
      );
      for (const { v, w } of adj) {
        r.v = v;
        r.relax++;
        const key = edgeKey(g, u, v);
        r.relaxed[key] = true;
        const du = r.d[u]!;
        const nd = du + w;
        const old = r.d[v] ?? null;
        const edgeMarks = [mark(edgeId(key), 'active'), mark(weightId(key), 'active')];
        if (old === null || nd < old) {
          r.d[v] = nd;
          r.pi[v] = u;
          r.lowered++;
          let qid: string;
          if (lazy) qid = insert(v, nd);
          else {
            r.Q = r.Q.map((q) => (q.v === v ? { ...q, k: nd } : q)).sort(byKey);
            qid = v;
          }
          const queueText = lazy
            ? `(${v}, ${nd}) goes into Q.${old !== null ? ` The old entry (${v}, ${old}) stays behind, stale.` : ''}`
            : `${v}'s key in Q drops to ${nd}.`;
          yield step(
            `Relax ${arrow(u, v)}: d[${u}] + w(${u}, ${v}) = ${plus(du, w)} = ${nd}, less than d[${v}] = ${dist(old)}. So d[${v}] = ${nd}, π[${v}] = ${u}, and ${queueText}`,
            ['for', 'if', 'set.d', 'set.pi', lazy ? 'push' : 'dec'],
            2,
            [
              ...vmark(u, 'active'),
              ...vmark(v, 'visit'),
              ...edgeMarks,
              mark(cellId('d', v), 'visit'),
              mark(cellId('pi', v), 'visit'),
              mark(queueId(qid), 'visit'),
            ],
          );
        } else {
          const settled = r.S.includes(v);
          const why = settled
            ? ` ${v} is settled already${r.pi[u] === v ? `: it is where ${u} came from` : ''}.`
            : '';
          yield step(
            `Relax ${arrow(u, v)}: d[${u}] + w(${u}, ${v}) = ${plus(du, w)} = ${nd}, not less than d[${v}] = ${old}. Nothing changes.${why}`,
            ['for', 'if'],
            settled ? 3 : 2,
            [...vmark(u, 'active'), ...vmark(v, 'compare'), ...edgeMarks],
          );
        }
      }
      r.v = undefined;
    }
    r.u = undefined;
    r.final = true;
    yield step(`Q is empty, so Dijkstra is done. ${ending(g, r)}`, ['while'], 1, [
      ...g.vertices.filter((v) => r.d[v] === null).map((v) => mark(labelId(v), 'stale')),
    ]);
    return s;
  },
};

/** The farthest vertex: largest d, then the most edges on its path, then name order. */
export function farthest(
  g: Graph,
  r: { d: Record<string, number | null>; pi: Record<string, string | null> },
) {
  let best: string | null = null;
  for (const v of g.vertices) {
    if (r.d[v] === null) continue;
    if (best === null) best = v;
    else if (r.d[v]! > r.d[best]!) best = v;
    else if (r.d[v] === r.d[best] && pathOf(r.pi, v)!.length > pathOf(r.pi, best)!.length) best = v;
  }
  return best;
}

function ending(g: Graph, r: DijkstraRun): string {
  const lost = g.vertices.filter((v) => r.d[v] === null);
  const others = g.vertices.filter((v) => v !== r.s && r.d[v] !== null);
  const tail = lost.length
    ? ` ${listWords(lost)} cannot be reached from ${r.s}, so ${lost.length === 1 ? 'it keeps' : 'they keep'} d = ∞.`
    : '';
  if (others.length === 0) return `Only ${r.s} itself is reachable, at d = 0.${tail}`;
  const far = farthest(g, r)!;
  const p = pathOf(r.pi, far)!;
  return `Shortest distances from ${r.s}: ${others.map((v) => `${v} ${r.d[v]}`).join(', ')}. The π edges form the shortest-path tree. Follow π back from a vertex to read its path, such as ${far}: ${pathWords(p)}, total ${r.d[far]}.${tail}`;
}

const load = loadOp<S, DijkstraSettings, X>({
  make: (graph) => ({ graph }),
  ready: (g) => readyText(g, 'dijkstra'),
});

export const ops = { load, run };

// ---------------------------------------------------------------------------------------------
// Pseudocode, after CLRS. Lines stay short (33 characters with their indent) for a phone.

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: DijkstraSettings): PseudoBlock[] {
  const lazy = settings.queue === 'lazy';
  const lines = [
    L('sig', 0, 'DIJKSTRA(G, w, s)', "Dijkstra's shortest paths from s:"),
    L('pre', 1, '// needs every w(u, v) ≥ 0', 'Every weight must be 0 or more.'),
    L('init', 1, 'INITIALIZE-SINGLE-SOURCE(G, s)', 'Every d = ∞ and π = NIL; s.d = 0.'),
    L('S', 1, 'S = ∅', 'No vertex is settled yet.'),
    lazy
      ? L('Q', 1, 'Q = {(s, 0)}', 'Q starts with s, key 0.')
      : L('Q', 1, 'Q = G.V  // keyed by d', 'Put every vertex in Q, keyed by d.'),
    L('while', 1, 'while Q ≠ ∅', 'While Q is not empty,'),
    lazy
      ? L('extract', 2, '(u, k) = EXTRACT-MIN(Q)', 'take the entry with the smallest key.')
      : L('extract', 2, 'u = EXTRACT-MIN(Q)', 'take the vertex with the smallest d'),
    ...(lazy ? [L('stale', 2, 'if u ∈ S: continue', 'If u is settled already, skip it.')] : []),
    L('addS', 2, 'S = S ∪ {u}', 'and settle it: u.d is final.'),
    L('for', 2, 'for each v in G.Adj[u]', 'For each edge u → v,'),
    L('if', 3, 'if v.d > u.d + w(u, v)', 'if going through u is shorter,'),
    L('set.d', 4, 'v.d = u.d + w(u, v)', 'lower v.d to that,'),
    L('set.pi', 4, 'v.π = u', 'make u the parent of v,'),
    lazy
      ? L('push', 4, 'INSERT(Q, (v, v.d))', 'and put v in Q with its new key.')
      : L('dec', 4, 'DECREASE-KEY(Q, v, v.d)', "and lower v's key in Q."),
  ];
  return [{ op: 'run', lines }];
}

export function initialSay(s: S): string {
  return `${describeGraph(s.graph).split('. ')[0]}. Type a start vertex, such as ${s.graph.vertices[0]}, and press Run: Dijkstra's algorithm finds the lightest path from it to every vertex.`;
}

export function initialVars(s: S) {
  return graphVars(s.graph);
}

export function describe(s: S): string {
  return describeGraph(s.graph);
}

/** The scene label: where a run stands. */
export function describeRun(g: Graph, r: DijkstraRun): string {
  const seen = g.vertices.filter((v) => r.d[v] !== null);
  const queue = r.Q.filter((q) => !isStale(r, q))
    .map((q) => `${q.v} ${dist(q.k)}`)
    .join(', ');
  return `Dijkstra from ${r.s}. Settled: ${r.S.length ? r.S.join(', ') : 'none'}. Queue: ${queue || 'empty'}. Distances so far: ${seen.map((v) => `${v} ${r.d[v]}`).join(', ')}.`;
}
