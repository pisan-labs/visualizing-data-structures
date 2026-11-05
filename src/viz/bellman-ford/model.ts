/**
 * Bellman-Ford, CLRS style: BELLMAN-FORD(G, w, s) relaxes every edge, in one fixed order, in
 * each of V - 1 passes. Weights may be negative. One more pass then checks every edge: if one
 * can still be relaxed, a negative cycle can be reached from s and there are no shortest paths
 * to the vertices it reaches. The page relaxes that edge once more and follows π back from its
 * head until a vertex repeats, which finds the cycle, and draws it.
 *
 * The edge order is arcs(g): every arc u -> v sorted by u, then v, in name order (an undirected
 * edge counts as two arcs, one each way). The order is drawn as a row, and a table counts the
 * distances each pass changed.
 *
 * Settings: `early` stops after the first pass that changes nothing (CLRS always makes all
 * V - 1 passes). Such a pass is the negative-cycle check already, so the check is skipped too.
 *
 * The state is just the graph; a run's bookkeeping travels in the steps' `extra`.
 */
import type { Mark, OpSpec, PseudoBlock, Scalar, Step } from '../../engine/types';
import type { GraphTemplate } from '../../layouts/graph';
import { edgeId, labelId, vertexId, weightId } from '../../layouts/graph';
import { describeGraph, edgeKey, listWords, plural, type Graph } from '../_graph/graph';
import { graphVars, loadOp, vertexArg, type GraphState } from '../_graph/kit';
import {
  arcKey,
  arcs,
  arrow,
  cycleFrom,
  cycleWeight,
  cycleWords,
  dist,
  pathOf,
  pathWords,
  plus,
  readyText,
  rotateCycle,
  startPathsGraph,
  type Arc,
} from '../_paths/kit';

export type BfState = GraphState;

export interface BfSettings {
  [key: string]: Scalar;
  early: boolean;
  layout: GraphTemplate;
}

export const defaults: BfSettings = { early: false, layout: 'force' };

/** One run's bookkeeping, as it stands at a step. */
export interface BfRun {
  s: string;
  /** null is ∞. */
  d: Record<string, number | null>;
  pi: Record<string, string | null>;
  /** The pass being made: 1 to V - 1, then V for the check; 0 before the first. */
  pass: number;
  /** The arc being relaxed or checked, as an index into arcs(g); -1 between arcs. */
  i: number;
  /** How many distances each pass changed so far (index 0 is pass 1). */
  changes: number[];
  /** Arcs that lowered a d in the current pass, by arc key. */
  lowered: Record<string, true>;
  /** Edges RELAX has looked at, by edge key. */
  relaxed: Record<string, true>;
  u?: string;
  v?: string;
  relax: number;
  updates: number;
  /** In the check pass. */
  checking?: boolean;
  /** The negative cycle, in arc order, once found. */
  cycle?: string[];
  /** How the run ended. */
  result?: 'true' | 'false';
}

export interface BfExtra {
  run?: BfRun;
}

type S = BfState;
type X = BfExtra;
type Op = OpSpec<S, BfSettings, X>;
type BfStep = Step<S, X>;

export function init(): S {
  return { graph: startPathsGraph() };
}

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });
const vmark = (v: string, role: Mark['role']) => [mark(vertexId(v), role)];

/** Panel ids (see view.ts). */
export const cellId = (row: 'd' | 'pi', v: string) => `tbl-${row}-${v}`;
export const orderId = (a: { u: string; v: string }) => `ord-${arcKey(a.u, a.v)}`;
export const passId = (k: number) => `ps-n-${k}`;

function clone(r: BfRun): BfRun {
  return {
    ...r,
    d: { ...r.d },
    pi: { ...r.pi },
    changes: [...r.changes],
    lowered: { ...r.lowered },
    relaxed: { ...r.relaxed },
    cycle: r.cycle && [...r.cycle],
  };
}

function runVars(g: Graph, r: BfRun): Record<string, Scalar> {
  const n = g.vertices.length;
  return {
    ...graphVars(g),
    s: r.s,
    pass: r.result ? 'done' : r.checking ? 'check' : r.pass === 0 ? '–' : `${r.pass} of ${n - 1}`,
    edge: r.i >= 0 ? `${r.i + 1} of ${arcs(g).length}` : '–',
    u: r.u ?? '–',
    v: r.v ?? '–',
    changed: r.result || r.checking || r.pass === 0 ? '–' : (r.changes[r.pass - 1] ?? 0),
    relax: r.relax,
    updates: r.updates,
  };
}

/** The final answer of a run, in the code tabs' words. */
export function runSummary(g: Graph, r: BfRun): string {
  const d = g.vertices.map((v) => (r.d[v] === null ? 'inf' : String(r.d[v]))).join(' ');
  const pi = g.vertices.map((v) => r.pi[v] ?? '-').join(' ');
  const tail = r.cycle ? ` | negative cycle ${rotateCycle(r.cycle).join(' ')}` : '';
  return `${d} | ${pi}${tail}`;
}

/**
 * A negative cycle anywhere in the graph (as if every vertex were a source), or null. For the
 * last step's note about cycles s cannot reach.
 */
export function anyNegativeCycle(g: Graph): string[] | null {
  const d: Record<string, number> = Object.fromEntries(g.vertices.map((v) => [v, 0]));
  const pi: Record<string, string | null> = Object.fromEntries(g.vertices.map((v) => [v, null]));
  const list = arcs(g);
  for (let pass = 0; pass < g.vertices.length; pass++)
    for (const a of list)
      if (d[a.u]! + a.w < d[a.v]!) {
        d[a.v] = d[a.u]! + a.w;
        pi[a.v] = a.u;
      }
  for (const a of list)
    if (d[a.u]! + a.w < d[a.v]!) {
      pi[a.v] = a.u;
      return cycleFrom(pi, a.v);
    }
  return null;
}

const relaxLine = (a: Arc, du: number, nd: number) =>
  `d[${a.u}] + w(${a.u}, ${a.v}) = ${plus(du, a.w)} = ${nd}`;

const run: Op = {
  label: 'Run Bellman-Ford from',
  arity: 1,
  *run(s, [arg], { settings }) {
    const g = s.graph;
    const a0 = vertexArg(g, arg);
    if ('error' in a0) {
      yield {
        state: s,
        marks: [],
        say: `Bellman-Ford needs a start vertex. ${a0.error}`,
        lines: ['sig'],
        level: 1,
        vars: graphVars(g),
      } satisfies BfStep;
      return s;
    }
    const src = a0.v;
    const list = arcs(g);
    const n = g.vertices.length;
    const r: BfRun = {
      s: src,
      d: Object.fromEntries(g.vertices.map((v) => [v, null])),
      pi: Object.fromEntries(g.vertices.map((v) => [v, null])),
      pass: 0,
      i: -1,
      changes: [],
      lowered: {},
      relaxed: {},
      relax: 0,
      updates: 0,
    };
    const step = (say: string, lines: string[], level: 1 | 2 | 3, marks: Mark[] = []): BfStep => ({
      state: s,
      marks,
      say,
      lines,
      level,
      vars: runVars(g, r),
      extra: { run: clone(r) },
    });
    const arcMarks = (a: Arc, role: Mark['role']) => {
      const key = edgeKey(g, a.u, a.v);
      return [mark(edgeId(key), role), mark(weightId(key), role), mark(orderId(a), role)];
    };

    r.d[src] = 0;
    const both = g.directed ? '' : ' Each undirected edge counts twice, once each way.';
    yield step(
      `Bellman-Ford from ${src}. Every vertex starts with d = ∞ and π = NIL, then ${src}.d = 0. ${
        n > 1
          ? `Now ${plural(n - 1, 'pass', 'passes')} over all ${plural(list.length, 'edge')}, always in the order shown: ${list
              .slice(0, 6)
              .map((a) => arrow(a.u, a.v))
              .join(', ')}${list.length > 6 ? ', and so on' : ''}.${both}`
          : 'With one vertex there is nothing to relax.'
      }`,
      ['init'],
      2,
      [...vmark(src, 'visit'), mark(cellId('d', src), 'visit')],
    );

    let stopped = false;
    for (let pass = 1; pass <= n - 1; pass++) {
      r.pass = pass;
      r.i = -1;
      r.u = undefined;
      r.v = undefined;
      r.lowered = {};
      r.changes.push(0);
      yield step(
        pass === 1
          ? `Pass 1 of ${n - 1}: relax every edge, in order.`
          : r.changes[pass - 2] === 0
            ? `Pass ${pass} of ${n - 1}. Pass ${pass - 1} changed nothing, so nothing will change from here on, but CLRS makes all ${n - 1} passes anyway.`
            : `Pass ${pass} of ${n - 1}. Pass ${pass - 1} changed ${plural(r.changes[pass - 2]!, 'distance')}, so go round again.`,
        ['pass'],
        2,
        [mark(passId(pass), 'active')],
      );
      for (let i = 0; i < list.length; i++) {
        const a = list[i]!;
        r.i = i;
        r.u = a.u;
        r.v = a.v;
        r.relax++;
        r.relaxed[edgeKey(g, a.u, a.v)] = true;
        const du = r.d[a.u] ?? null;
        if (du === null) {
          yield step(
            `Relax ${arrow(a.u, a.v)}: d[${a.u}] = ∞, so ${a.u} has not been reached yet and this edge cannot help.`,
            ['relax', 'if'],
            3,
            [...vmark(a.u, 'compare'), ...arcMarks(a, 'active')],
          );
          continue;
        }
        const nd = du + a.w;
        const old = r.d[a.v] ?? null;
        if (old === null || nd < old) {
          r.d[a.v] = nd;
          r.pi[a.v] = a.u;
          r.updates++;
          r.changes[pass - 1]!++;
          r.lowered[arcKey(a.u, a.v)] = true;
          yield step(
            `Relax ${arrow(a.u, a.v)}: ${relaxLine(a, du, nd)}, less than d[${a.v}] = ${dist(old)}. So d[${a.v}] = ${nd} and π[${a.v}] = ${a.u}. That is change ${r.changes[pass - 1]} in pass ${pass}.`,
            ['relax', 'if', 'set.d', 'set.pi'],
            2,
            [
              ...vmark(a.u, 'active'),
              ...vmark(a.v, 'visit'),
              ...arcMarks(a, 'active'),
              mark(cellId('d', a.v), 'visit'),
              mark(cellId('pi', a.v), 'visit'),
              mark(passId(pass), 'visit'),
            ],
          );
        } else {
          yield step(
            `Relax ${arrow(a.u, a.v)}: ${relaxLine(a, du, nd)}, not less than d[${a.v}] = ${old}. Nothing changes.`,
            ['relax', 'if'],
            3,
            [...vmark(a.u, 'active'), ...vmark(a.v, 'compare'), ...arcMarks(a, 'active')],
          );
        }
      }
      r.i = -1;
      r.u = undefined;
      r.v = undefined;
      const changed = r.changes[pass - 1]!;
      if (changed === 0 && settings.early) {
        stopped = true;
        r.result = 'true';
        yield step(
          `Pass ${pass} changed nothing, so no later pass can change anything either: every edge already has d[v] ≤ d[u] + w(u, v). That is the negative-cycle check too, so stop here and return TRUE. ${ending(g, r, n)}`,
          ['stop'],
          1,
          unreachedMarks(g, r),
        );
        break;
      }
      if (pass === n - 1) {
        yield step(
          `Pass ${pass} changed ${changed ? plural(changed, 'distance') : 'nothing'}. That was the last of the ${plural(n - 1, 'pass', 'passes')}: a shortest path without a cycle has at most ${n - 1} ${n - 1 === 1 ? 'edge' : 'edges'}, and each pass makes at least one more edge of it right.`,
          ['pass'],
          2,
          [mark(passId(pass), 'active')],
        );
      }
    }
    if (stopped) return s;

    // The check: one more pass, which changes nothing unless a negative cycle can be reached.
    r.checking = true;
    r.pass = n;
    r.lowered = {};
    yield step(
      `Now check every edge once more. If no negative cycle can be reached from ${src}, every d is final and no edge can be relaxed. One that still can means a negative cycle.`,
      ['check'],
      2,
    );
    for (let i = 0; i < list.length; i++) {
      const a = list[i]!;
      r.i = i;
      r.u = a.u;
      r.v = a.v;
      const du = r.d[a.u] ?? null;
      const old = r.d[a.v] ?? null;
      if (du === null || (old !== null && du + a.w >= old)) {
        yield step(
          du === null
            ? `Check ${arrow(a.u, a.v)}: d[${a.u}] = ∞, so it cannot be relaxed.`
            : `Check ${arrow(a.u, a.v)}: ${relaxLine(a, du, du + a.w)}, not less than d[${a.v}] = ${old}. Fine.`,
          ['check', 'check.if'],
          3,
          [...arcMarks(a, 'active')],
        );
        continue;
      }
      const nd = du + a.w;
      yield step(
        `Check ${arrow(a.u, a.v)}: ${relaxLine(a, du, nd)}, less than d[${a.v}] = ${dist(old)}. After ${plural(n - 1, 'pass', 'passes')} that can only happen when a negative cycle can be reached from ${src}.`,
        ['check', 'check.if'],
        2,
        [...vmark(a.v, 'error'), ...arcMarks(a, 'error'), mark(cellId('d', a.v), 'error')],
      );
      r.d[a.v] = nd;
      r.pi[a.v] = a.u;
      const cycle = cycleFrom(r.pi, a.v)!;
      r.cycle = cycle;
      r.result = 'false';
      r.u = undefined;
      r.v = undefined;
      r.i = -1;
      // The walk back along π from v, to the first repeated vertex.
      const walk: string[] = [a.v];
      while (!walk.slice(0, -1).includes(walk.at(-1)!)) walk.push(r.pi[walk.at(-1)!]!);
      const c = rotateCycle(cycle);
      const lap = c.length === 2 && !g.directed ? ' (an undirected edge goes both ways)' : '';
      const cycleMarks = cycle.flatMap((v, k) => {
        const next = cycle[(k + 1) % cycle.length]!;
        const key = edgeKey(g, v, next);
        return [
          mark(vertexId(v), 'error'),
          mark(edgeId(key), 'error'),
          mark(weightId(key), 'error'),
        ];
      });
      yield step(
        `Relax it once more, so π[${a.v}] = ${a.u}, and follow π back from ${a.v} until a vertex repeats: ${walk.join(' ← ')}. That closes the cycle ${cycleWords(c)}${lap}, of weight ${cycleWeight(g, c)}. Each lap around it makes paths lighter, so the vertices it reaches have no shortest path. Bellman-Ford returns FALSE.`,
        ['cycle', 'walk', 'false'],
        1,
        cycleMarks,
      );
      return s;
    }
    r.checking = false;
    r.i = -1;
    r.u = undefined;
    r.v = undefined;
    r.result = 'true';
    yield step(
      `No edge can be relaxed, so no negative cycle can be reached from ${src}. Bellman-Ford returns TRUE. ${ending(g, r, n)}`,
      ['true'],
      1,
      unreachedMarks(g, r),
    );
    return s;
  },
};

const unreachedMarks = (g: Graph, r: BfRun) =>
  g.vertices.filter((v) => r.d[v] === null).map((v) => mark(labelId(v), 'stale'));

function ending(g: Graph, r: BfRun, n: number): string {
  const lost = g.vertices.filter((v) => r.d[v] === null);
  const others = g.vertices.filter((v) => v !== r.s && r.d[v] !== null);
  const parts: string[] = [];
  if (others.length === 0) parts.push(`Only ${r.s} itself is reachable, at d = 0.`);
  else {
    parts.push(
      `Shortest distances from ${r.s}: ${others.map((v) => `${v} ${r.d[v]}`).join(', ')}.`,
    );
    const far = others.reduce((best, v) =>
      (pathOf(r.pi, v)?.length ?? 0) > (pathOf(r.pi, best)?.length ?? 0) ? v : best,
    );
    const p = pathOf(r.pi, far);
    if (p) parts.push(`The longest of the π paths is ${pathWords(p)}, total ${r.d[far]}.`);
  }
  const busy = r.changes.filter((c) => c > 0).length;
  const len = r.changes.length;
  if (n > 1)
    parts.push(
      busy === 0
        ? 'No pass changed anything.'
        : len === 1
          ? `The one pass changed ${plural(r.changes[0]!, 'distance')}.`
          : `${busy === len ? 'Every pass' : `${busy} of the ${len} passes`} changed something: ${r.changes.join(', ')}.`,
    );
  if (lost.length)
    parts.push(
      `${listWords(lost)} cannot be reached from ${r.s}, so ${lost.length === 1 ? 'it keeps' : 'they keep'} d = ∞.`,
    );
  const elsewhere = anyNegativeCycle(g);
  if (elsewhere) {
    const c = rotateCycle(elsewhere);
    parts.push(
      `The graph does have a negative cycle, ${cycleWords(c)}, but ${r.s} cannot reach it, so it changes no distance from ${r.s}.`,
    );
  }
  return parts.join(' ');
}

const load = loadOp<S, BfSettings, X>({
  make: (graph) => ({ graph }),
  ready: (g) => readyText(g, 'bellman-ford'),
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

export function pseudocode(settings: BfSettings): PseudoBlock[] {
  const lines = [
    L('sig', 0, 'BELLMAN-FORD(G, w, s)', 'Bellman-Ford from s:'),
    L('init', 1, 'INITIALIZE-SINGLE-SOURCE(G, s)', 'Every d = ∞ and π = NIL; s.d = 0.'),
    L('pass', 1, 'for i = 1 to |G.V| - 1', 'Make V - 1 passes.'),
    L('relax', 2, 'for each edge (u, v) in G.E', 'In each, take every edge in order:'),
    L('if', 3, 'if v.d > u.d + w(u, v)', 'if going through u is shorter,'),
    L('set.d', 4, 'v.d = u.d + w(u, v)', 'lower v.d to that'),
    L('set.pi', 4, 'v.π = u', 'and make u the parent of v.'),
    ...(settings.early
      ? [L('stop', 2, 'if no d changed: return TRUE', 'A quiet pass ends it: no cycle.')]
      : []),
    L('check', 1, 'for each edge (u, v) in G.E', 'Then check every edge once more:'),
    L('check.if', 2, 'if v.d > u.d + w(u, v)', 'if it can still be relaxed,'),
    L('cycle', 3, 'v.π = u', 'there is a negative cycle. Relax it,'),
    L('walk', 3, 'follow π from v to a repeat', 'follow π back to find the cycle,'),
    L('false', 3, 'return FALSE', 'and report it.'),
    L('true', 1, 'return TRUE', 'Otherwise every d is final.'),
  ];
  return [{ op: 'run', lines }];
}

export function initialSay(s: S): string {
  return `${describeGraph(s.graph).split('. ')[0]}. Type a start vertex, such as ${s.graph.vertices[0]}, and press Run: Bellman-Ford finds the lightest paths from it, even with negative weights, or a negative cycle that makes them meaningless.`;
}

export function initialVars(s: S) {
  return graphVars(s.graph);
}

export function describe(s: S): string {
  return describeGraph(s.graph);
}

/** The scene label: where a run stands. */
export function describeRun(g: Graph, r: BfRun): string {
  const seen = g.vertices.filter((v) => r.d[v] !== null);
  const where = r.result
    ? `It returned ${r.result === 'true' ? 'TRUE' : 'FALSE'}.`
    : r.checking
      ? 'Checking every edge.'
      : r.pass === 0
        ? 'Before the first pass.'
        : `Pass ${r.pass} of ${g.vertices.length - 1}, ${plural(r.changes[r.pass - 1] ?? 0, 'change')} so far.`;
  const cycle = r.cycle ? ` Negative cycle: ${cycleWords(rotateCycle(r.cycle))}.` : '';
  return `Bellman-Ford from ${r.s}. ${where} Distances so far: ${seen.map((v) => `${v} ${r.d[v]}`).join(', ')}.${cycle}`;
}
