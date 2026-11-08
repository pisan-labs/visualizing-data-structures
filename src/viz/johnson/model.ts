/**
 * Johnson's all-pairs shortest paths, CLRS style: JOHNSON(G, w).
 *   1. Add a new vertex q with a 0-weight arc to every vertex.
 *   2. Bellman-Ford from q gives h(v) = δ(q, v) ≤ 0, or finds a negative cycle and stops.
 *   3. Reweight every arc: w'(u, v) = w(u, v) + h(u) − h(v). By the triangle inequality
 *      h(v) ≤ h(u) + w(u, v), so every w' is at least 0, and every path from s to t changes by
 *      the same h(s) − h(t), so shortest paths stay shortest.
 *   4. Dijkstra from every vertex s on w', then un-reweight: D[s][t] = d'(s, t) − h(s) + h(t).
 *
 * Bellman-Ford here relaxes the arcs out of q first, then the graph's arcs in name order, and
 * stops early after a pass that changes nothing (then checks no arc can still be relaxed, the
 * negative-cycle test). Dijkstra extracts the smallest d' (ties in name order). An undirected
 * edge is two arcs, so a negative undirected edge is a negative cycle.
 *
 * Settings: layout (the drawing only). The state is just the graph; a run travels in `extra`.
 */
import type { Mark, OpSpec, PseudoBlock, Scalar, Step } from '../../engine/types';
import type { GraphTemplate } from '../../layouts/graph';
import { edgeId, vertexId, weightId } from '../../layouts/graph';
import { describeGraph, keyOf, listWords, plural, type Graph } from '../_graph/graph';
import { graphVars, loadOp, type GraphState } from '../_graph/kit';
import { parseGraph } from '../_graph/parse';
import { arcs, type Arc } from '../_paths/kit';

export type JohnsonState = GraphState;

export interface JohnsonSettings {
  [key: string]: Scalar;
  layout: GraphTemplate;
}

export const defaults: JohnsonSettings = { layout: 'force' };

/** Five vertices with two negative arcs and no negative cycle. */
export const START_TEXT = 'A>B:3, A>C:8, A>E:-4, B>D:1, B>E:7, C>B:4, D>A:2, D>C:-5, E>D:6';

export type Phase = 'q' | 'bf' | 'reweight' | 'dijkstra' | 'done' | 'negative';

export interface JohnsonRun {
  phase: Phase;
  /** h(v); null is ∞ (before Bellman-Ford reaches it). */
  h: Record<string, number | null>;
  /** Arcs reweighted so far, by edge key, with w'. */
  w2: Record<string, number>;
  /** The current Dijkstra source and its d' (null is ∞), and the vertices settled. */
  s?: string;
  d2?: Record<string, number | null>;
  settled?: string[];
  u?: string;
  /** Result rows filled so far: D[s][t], null is ∞. */
  D: Record<string, Record<string, number | null>>;
  pass: number;
  relax: number;
  /** A negative cycle, when found. */
  cycle?: string[];
  final?: boolean;
}

export interface JohnsonExtra {
  run?: JohnsonRun;
}

type S = JohnsonState;
type X = JohnsonExtra;
type Op = OpSpec<S, JohnsonSettings, X>;
type PStep = Step<S, X>;

export function init(): S {
  return { graph: parseGraph(START_TEXT) as Graph };
}

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });
export const Q = 'q';
export const qId = 'jq';
export const qArcId = (v: string) => `jq-a-${v}`;
export const hCellId = (v: string) => `tbl-hv-${v}`;
export const d2CellId = (v: string) => `tbl-d-${v}`;
export const matrixId = (s: string, t: string) => `D-r${s}-${t}`;

export function edgeKeyOf(g: Graph, a: Arc): string {
  const e = g.edges.find(
    (x) => (x.u === a.u && x.v === a.v) || (!g.directed && x.u === a.v && x.v === a.u),
  )!;
  return keyOf(e);
}

/** Johnson without steps: h, or a negative cycle; and the result matrix. */
export function johnsonPlain(g: Graph) {
  const A = arcs(g);
  const h: Record<string, number> = Object.fromEntries(g.vertices.map((v) => [v, 0]));
  // After q's arcs, every h(v) is 0; then V − 1 more passes over the graph's arcs suffice.
  for (let pass = 0; pass < g.vertices.length; pass++) {
    let changed = false;
    for (const a of A)
      if (h[a.u]! + a.w < h[a.v]!) {
        h[a.v] = h[a.u]! + a.w;
        changed = true;
      }
    if (!changed) break;
  }
  if (A.some((a) => h[a.u]! + a.w < h[a.v]!)) return { negative: true as const };
  const D: Record<string, Record<string, number | null>> = {};
  for (const s of g.vertices) {
    const d = dijkstra(g, s, (a) => a.w + h[a.u]! - h[a.v]!).d;
    D[s] = Object.fromEntries(
      g.vertices.map((t) => [t, d[t] === null ? null : d[t]! - h[s]! + h[t]!]),
    );
  }
  return { negative: false as const, h, D };
}

/** Dijkstra with weights w (all ≥ 0), smallest d first, ties in name order. */
export function dijkstra(g: Graph, s: string, w: (a: Arc) => number) {
  const d: Record<string, number | null> = Object.fromEntries(g.vertices.map((v) => [v, null]));
  d[s] = 0;
  const done = new Set<string>();
  const order: string[] = [];
  const out = new Map<string, Arc[]>(g.vertices.map((v) => [v, []]));
  for (const a of arcs(g)) out.get(a.u)!.push(a);
  for (;;) {
    let u: string | undefined;
    for (const v of g.vertices)
      if (!done.has(v) && d[v] !== null && (u === undefined || d[v]! < d[u]!)) u = v;
    if (u === undefined) break;
    done.add(u);
    order.push(u);
    for (const a of out.get(u)!) {
      const nd = d[u]! + w(a);
      if (d[a.v] === null || nd < d[a.v]!) d[a.v] = nd;
    }
  }
  return { d, order };
}

function clone(r: JohnsonRun): JohnsonRun {
  return {
    ...r,
    h: { ...r.h },
    w2: { ...r.w2 },
    d2: r.d2 && { ...r.d2 },
    settled: r.settled && [...r.settled],
    D: Object.fromEntries(Object.entries(r.D).map(([k, row]) => [k, { ...row }])),
    cycle: r.cycle && [...r.cycle],
  };
}

const PHASE_WORDS: Record<Phase, string> = {
  q: 'add q',
  bf: 'Bellman-Ford',
  reweight: 'reweight',
  dijkstra: 'Dijkstra',
  done: 'done',
  negative: 'negative cycle',
};

function runVars(g: Graph, r: JohnsonRun): Record<string, Scalar> {
  return {
    ...graphVars(g),
    phase: PHASE_WORDS[r.phase],
    pass: r.pass,
    relaxations: r.relax,
    s: r.s ?? '–',
    u: r.u ?? '–',
    rows: Object.keys(r.D).length,
  };
}

/**
 * Every number the page shows, in narration and in the drawing: a true minus sign (−, as in the
 * pseudocode) for negatives, ∞ for no value.
 */
export const fmt = (n: number | null | undefined): string =>
  n === null || n === undefined ? '∞' : n < 0 ? `−${-n}` : String(n);

/** A number inside a sum: negatives in parentheses, "(−2)". */
export const signed = (n: number) => (n < 0 ? `(${fmt(n)})` : fmt(n));

/** The cycle through v found by following predecessors back V times. */
function cycleThrough(pi: Record<string, string | null>, v: string, n: number): string[] {
  let x = v;
  for (let i = 0; i < n && pi[x] && pi[x] !== Q; i++) x = pi[x]!;
  const cyc = [x];
  for (let y = pi[x]; y && y !== Q && y !== x && cyc.length <= n; y = pi[y]) cyc.unshift(y);
  return cyc;
}

const run: Op = {
  label: 'Run Johnson',
  arity: 0,
  *run(s0) {
    const g = s0.graph;
    const A = arcs(g);
    const n = g.vertices.length;
    const r: JohnsonRun = {
      phase: 'q',
      h: Object.fromEntries(g.vertices.map((v) => [v, null])),
      w2: {},
      D: {},
      pass: 0,
      relax: 0,
    };
    const step = (say: string, lines: string[], level: 1 | 2 | 3, marks: Mark[] = []): PStep => ({
      state: s0,
      marks,
      say,
      lines,
      level,
      vars: runVars(g, r),
      extra: { run: clone(r) },
    });
    // 1. q.
    yield step(
      `Add a new vertex q with an arc of weight 0 to every vertex. Now every vertex can be reached, and h(v) = δ(q, v) will be at most 0.${
        A.some((a) => a.w < 0)
          ? ''
          : ' No weight is negative, so h will be 0 everywhere and nothing changes: plain Dijkstra from every vertex would do.'
      }`,
      ['sig', 'q'],
      2,
      [mark(qId, 'active')],
    );
    // 2. Bellman-Ford from q.
    r.phase = 'bf';
    const pi: Record<string, string | null> = Object.fromEntries(g.vertices.map((v) => [v, null]));
    r.pass = 1;
    for (const v of g.vertices) {
      r.h[v] = 0;
      pi[v] = Q;
    }
    r.relax += n;
    yield step(
      `Bellman-Ford from q, pass 1. The arcs out of q come first: every h(v) drops from ∞ to 0.`,
      ['bf', 'pass', 'relax'],
      2,
      [mark(qId, 'active'), ...g.vertices.map((v) => mark(hCellId(v), 'visit'))],
    );
    let pass = 1;
    for (;;) {
      let changed = false;
      for (const a of A) {
        const nh = r.h[a.u]! + a.w;
        if (nh < r.h[a.v]!) {
          const old = r.h[a.v]!;
          r.h[a.v] = nh;
          pi[a.v] = a.u;
          r.relax++;
          changed = true;
          const k = edgeKeyOf(g, a);
          yield step(
            `Pass ${pass}: h(${a.u}) + w(${a.u}, ${a.v}) = ${fmt(r.h[a.u])} + ${signed(a.w)} = ${fmt(nh)} is less than h(${a.v}) = ${fmt(old)}, so h(${a.v}) = ${fmt(nh)}.`,
            ['pass', 'relax'],
            3,
            [
              mark(edgeId(k), 'active'),
              mark(weightId(k), 'active'),
              mark(vertexId(a.v), 'visit'),
              mark(hCellId(a.v), 'active'),
            ],
          );
        }
      }
      if (!changed) {
        yield step(
          `Pass ${pass} changed nothing${pass === 1 ? ' beyond the arcs out of q' : ''}, so the h values are final. Check every arc once more for a negative cycle.`,
          ['pass', 'check'],
          2,
        );
        break;
      }
      if (pass >= n) break;
      pass++;
      r.pass = pass;
      yield step(
        `Pass ${pass - 1} lowered some h values: run pass ${pass}. h is now ${g.vertices.map((v) => `${v} ${fmt(r.h[v])}`).join(', ')}.`,
        ['pass'],
        2,
        g.vertices.map((v) => mark(hCellId(v), 'visit')),
      );
    }
    const bad = A.find((a) => r.h[a.u]! + a.w < r.h[a.v]!);
    if (bad) {
      r.phase = 'negative';
      r.cycle = cycleThrough({ ...pi, [bad.v]: bad.u }, bad.v, n + 1);
      r.final = true;
      const k = edgeKeyOf(g, bad);
      yield step(
        `After ${plural(n, 'pass', 'passes')}, ${bad.u}→${bad.v} can still lower h(${bad.v}): there is a negative cycle, ${r.cycle.join(' → ')} → ${r.cycle[0]}. Shortest paths through it are not defined, so Johnson stops.`,
        ['check', 'neg'],
        1,
        [
          mark(edgeId(k), 'error'),
          mark(weightId(k), 'error'),
          ...r.cycle.map((v) => mark(vertexId(v), 'error')),
        ],
      );
      return s0;
    }
    // 3. Reweight.
    r.phase = 'reweight';
    yield step(
      `h = ${g.vertices.map((v) => `${v} ${fmt(r.h[v])}`).join(', ')}. Reweight every arc: w'(u, v) = w(u, v) + h(u) − h(v). The triangle inequality h(v) ≤ h(u) + w(u, v) makes every w' at least 0.`,
      ['rw'],
      2,
      g.vertices.map((v) => mark(hCellId(v), 'done')),
    );
    for (const e of g.edges) {
      const w2 = e.w + r.h[e.u]! - r.h[e.v]!;
      const k = keyOf(e);
      r.w2[k] = w2;
      yield step(
        `w'(${e.u}, ${e.v}) = ${fmt(e.w)} + ${signed(r.h[e.u]!)} − ${signed(r.h[e.v]!)} = ${fmt(w2)}.${w2 === 0 ? ' An arc on a shortest path from q gets weight 0.' : ''}`,
        ['rw', 'rw.e'],
        3,
        [mark(edgeId(k), 'active'), mark(weightId(k), 'active')],
      );
    }
    // 4. Dijkstra from every vertex.
    r.phase = 'dijkstra';
    for (const s of g.vertices) {
      r.s = s;
      r.d2 = Object.fromEntries(g.vertices.map((v) => [v, null]));
      r.d2[s] = 0;
      r.settled = [];
      const res = dijkstra(g, s, (a) => r.w2[edgeKeyOf(g, a)] ?? a.w + r.h[a.u]! - r.h[a.v]!);
      for (const u of res.order) {
        r.u = u;
        r.settled.push(u);
        r.d2[u] = res.d[u]!;
        yield step(
          `Dijkstra from ${s} on w': settle ${u} with d' = ${fmt(res.d[u])}.`,
          ['dij', 'dij.s'],
          3,
          [mark(vertexId(u), 'active'), mark(d2CellId(u), 'active')],
        );
      }
      r.u = undefined;
      r.d2 = res.d;
      const row = Object.fromEntries(
        g.vertices.map((t) => [t, res.d[t] === null ? null : res.d[t]! - r.h[s]! + r.h[t]!]),
      );
      r.D[s] = row;
      const sample = g.vertices.find((t) => t !== s && res.d[t] !== null && r.h[t] !== r.h[s]);
      yield step(
        `Row ${s}: un-reweight each d'(${s}, t) by − h(${s}) + h(t).${
          sample
            ? ` For example D[${s}][${sample}] = ${fmt(res.d[sample])} − ${signed(r.h[s]!)} + ${signed(r.h[sample]!)} = ${fmt(row[sample])}.`
            : ''
        }${g.vertices.some((t) => res.d[t] === null) ? ` ${listWords(g.vertices.filter((t) => res.d[t] === null))} cannot be reached from ${s}: ∞.` : ''}`,
        ['dij', 'unrw'],
        2,
        g.vertices.map((t) => mark(matrixId(s, t), 'active')),
      );
    }
    r.phase = 'done';
    r.s = undefined;
    r.d2 = undefined;
    r.settled = undefined;
    r.final = true;
    yield step(
      `Done: the matrix holds the shortest distance from every row vertex to every column vertex. One Bellman-Ford, ${plural(n, 'Dijkstra')} and the reweighting: O(VE log V) with a binary heap.`,
      ['ret'],
      1,
    );
    return s0;
  },
};

const load = loadOp<S, JohnsonSettings, X>({
  make: (graph) => ({ graph }),
  ready: (g) =>
    `Press Run for the shortest distances between every pair.${
      !g.directed && g.edges.some((e) => e.w < 0)
        ? ' This graph is undirected with a negative edge: walking it there and back is a negative cycle.'
        : ''
    }`,
});

export const ops = { load, run };

// ---------------------------------------------------------------------------------------------
// Pseudocode, after CLRS

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(): PseudoBlock[] {
  const lines = [
    L('sig', 0, 'JOHNSON(G, w)', 'All-pairs shortest paths:'),
    L('q', 1, "G' = G + q, w(q, v) = 0 for all v", 'add a vertex q with a 0 arc to every vertex.'),
    L('bf', 1, "BELLMAN-FORD(G', w, q)", 'Run Bellman-Ford from q:'),
    L('pass', 2, 'repeat passes over every arc', 'pass over every arc,'),
    L(
      'relax',
      3,
      'if h(u) + w(u,v) < h(v): h(v) = h(u) + w(u,v)',
      'lowering h(v) when u gives a shorter way.',
    ),
    L('check', 2, 'if some arc still relaxes', 'If any arc can still lower an h,'),
    L('neg', 3, 'error "negative cycle"', 'there is a negative cycle: stop.'),
    L('rw', 1, 'for each arc (u, v)', 'Reweight every arc:'),
    L(
      'rw.e',
      2,
      "w'(u,v) = w(u,v) + h(u) − h(v)",
      'add h(u), subtract h(v); the result is never negative.',
    ),
    L('dij', 1, 'for each s ∈ G.V', 'For every vertex s,'),
    L('dij.s', 2, "DIJKSTRA(G, w', s)", 'run Dijkstra on the new weights,'),
    L('unrw', 2, "D[s][t] = d'(s,t) − h(s) + h(t)", 'and undo the reweighting for each t.'),
    L('ret', 1, 'return D', 'D holds every shortest distance.'),
  ];
  return [{ op: 'run', lines }];
}

export function initialSay(s: S): string {
  return `${describeGraph(s.graph).split('. ')[0]}. Press Run: Johnson makes every weight nonnegative with Bellman-Ford, then runs Dijkstra from every vertex.`;
}

export const initialVars = (s: S) => graphVars(s.graph);

export const describe = (s: S): string => describeGraph(s.graph);

export function describeRun(g: Graph, r: JohnsonRun): string {
  const h = g.vertices.map((v) => `${v} ${fmt(r.h[v])}`).join(', ');
  const rows = Object.entries(r.D)
    .map(([s, row]) => `${s}: ${g.vertices.map((t) => fmt(row[t])).join(' ')}`)
    .join('; ');
  return `Phase: ${PHASE_WORDS[r.phase]}. h: ${h}.${rows ? ` Rows: ${rows}.` : ''}${
    r.cycle ? ` Negative cycle: ${r.cycle.join(', ')}.` : ''
  }`;
}

/** The code tabs' line: the matrix rows, or "negative cycle". */
export function runSummary(g: Graph, r: JohnsonRun): string {
  if (r.phase === 'negative') return 'negative cycle';
  return g.vertices
    .map((s) => g.vertices.map((t) => (r.D[s]![t] === null ? 'INF' : String(r.D[s]![t]))).join(' '))
    .join(' | ');
}
