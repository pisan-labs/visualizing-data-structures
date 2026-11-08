/**
 * PageRank by power iteration. Every vertex starts with rank 1/N. In each iteration every
 * vertex shares its rank equally among the vertices it links to, and a random surfer who gets
 * bored (with probability 1 − d) jumps anywhere:
 *
 *   PR'(v) = (1 − d)/N + d · ( Σ over u → v of PR(u)/out(u)  +  D/N )
 *
 * where D is the rank sitting on dangling vertices (no links out). The iteration stops when the
 * ranks change by less than TOLERANCE in total (the L1 distance), or after MAX_ITER iterations.
 *
 * Settings
 *   damping   d: '0.85' (Brin and Page's value, the default), '0.5', '0.7', '0.95' or '1'
 *   dangling  'spread'  a dangling vertex's rank goes to every vertex equally (the usual fix)
 *             'drop'    it leaks away, so the ranks add up to less than 1
 *   layout    the drawing only
 * An undirected edge links both ways.
 *
 * The arithmetic is done in this exact order (vertices in name order, in-neighbours in name
 * order, the dangling sum once per iteration), so the code tabs get bit-identical numbers.
 * The state is just the graph; a run travels in the steps' `extra`.
 */
import type { Mark, OpSpec, PseudoBlock, Scalar, Step } from '../../engine/types';
import type { GraphTemplate } from '../../layouts/graph';
import { vertexId } from '../../layouts/graph';
import {
  describeGraph,
  inNeighbours,
  listWords,
  neighbours,
  plural,
  type Graph,
} from '../_graph/graph';
import { graphVars, loadOp, type GraphState } from '../_graph/kit';
import { parseGraph } from '../_graph/parse';

export type PrState = GraphState;
export type Dangling = 'spread' | 'drop';

export interface PrSettings {
  [key: string]: Scalar;
  damping: string;
  dangling: Dangling;
  layout: GraphTemplate;
}

export const DAMPINGS = ['0.5', '0.7', '0.85', '0.95', '1'];
export const defaults: PrSettings = { damping: '0.85', dangling: 'spread', layout: 'force' };

export const TOLERANCE = 0.001;
export const MAX_ITER = 100;
/** Iterations shown vertex by vertex. */
export const DETAILED = 3;

/** Six pages: C is linked from almost everywhere, and F links nowhere (dangling). */
export const START_TEXT = 'A>B, A>C, B>C, B>F, C>A, D>A, D>C, E>A, E>D';

export interface PrRun {
  d: number;
  /** Ranks now, by vertex. */
  rank: Record<string, number>;
  /** Ranks before this iteration (while one is in progress). */
  prev?: Record<string, number>;
  iter: number;
  /** L1 change of the last finished iteration. */
  change?: number;
  /** The vertex being updated. */
  v?: string;
  /** The largest rank in the whole run, so the bars keep one scale. */
  top: number;
  dangling: string[];
  converged?: boolean;
  final?: boolean;
}

export interface PrExtra {
  run?: PrRun;
}

type S = PrState;
type X = PrExtra;
type Op = OpSpec<S, PrSettings, X>;
type PStep = Step<S, X>;

export function init(): S {
  return { graph: parseGraph(START_TEXT) as Graph };
}

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });
export const barId = (v: string) => `bar-${v}`;

/** Three decimals, like .245 (and 1.000). */
export const r3 = (x: number) => {
  const s = round3(x);
  return s.startsWith('0.') ? s.slice(1) : s;
};

/** Three decimals by rounding x · 1000 half up, the same way in every code tab. */
export function round3(x: number): string {
  const k = Math.floor(x * 1000 + 0.5);
  return `${Math.floor(k / 1000)}.${String(k % 1000).padStart(3, '0')}`;
}

const outOf = (g: Graph, u: string) => neighbours(g, u).length;
const into = (g: Graph, v: string) => inNeighbours(g, v);

/** One iteration, in the fixed order. */
export function iterate(g: Graph, rank: Record<string, number>, d: number, dangling: Dangling) {
  const n = g.vertices.length;
  let D = 0;
  for (const u of g.vertices) if (outOf(g, u) === 0) D += rank[u]!;
  const next: Record<string, number> = {};
  for (const v of g.vertices) {
    let s = 0;
    for (const u of into(g, v)) s += rank[u]! / outOf(g, u);
    next[v] = (1 - d) / n + d * (dangling === 'spread' ? s + D / n : s);
  }
  let change = 0;
  for (const v of g.vertices) change += Math.abs(next[v]! - rank[v]!);
  return { next, change, D };
}

/** The whole power iteration without steps. */
export function pagerankPlain(g: Graph, d: number, dangling: Dangling) {
  const n = g.vertices.length;
  let rank: Record<string, number> = Object.fromEntries(g.vertices.map((v) => [v, 1 / n]));
  let top = 1 / n;
  let iter = 0;
  let change = Infinity;
  while (iter < MAX_ITER && change >= TOLERANCE) {
    const r = iterate(g, rank, d, dangling);
    rank = r.next;
    change = r.change;
    iter++;
    top = Math.max(top, ...Object.values(rank));
  }
  return { rank, iter, change, top, converged: change < TOLERANCE };
}

/** Ranks closer than this are a tie: equal pages can differ in the last bits of a float. */
export const TIE = 1e-9;

/** Vertices by rank, highest first (ties in name order). */
export const ranking = (g: Graph, rank: Record<string, number>) =>
  [...g.vertices].sort((a, b) => {
    const diff = rank[b]! - rank[a]!;
    return Math.abs(diff) > TIE ? diff : g.vertices.indexOf(a) - g.vertices.indexOf(b);
  });

function clone(r: PrRun): PrRun {
  return { ...r, rank: { ...r.rank }, prev: r.prev && { ...r.prev }, dangling: [...r.dangling] };
}

const sum = (rank: Record<string, number>) => Object.values(rank).reduce((a, b) => a + b, 0);

function runVars(g: Graph, r: PrRun): Record<string, Scalar> {
  return {
    ...graphVars(g),
    d: r.d,
    iteration: r.iter,
    change: r.change === undefined ? '–' : Number(r.change.toFixed(5)),
    'Σ rank': Number(sum(r.rank).toFixed(3)),
    dangling: r.dangling.length,
  };
}

const run: Op = {
  label: 'Run PageRank',
  arity: 0,
  *run(s, _args, { settings }) {
    const g = s.graph;
    const n = g.vertices.length;
    const d = Number(settings.damping);
    const plan = pagerankPlain(g, d, settings.dangling);
    const r: PrRun = {
      d,
      rank: Object.fromEntries(g.vertices.map((v) => [v, 1 / n])),
      iter: 0,
      top: plan.top,
      dangling: g.vertices.filter((u) => outOf(g, u) === 0),
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
    const dang = r.dangling.length
      ? ` ${listWords(r.dangling)} ${r.dangling.length === 1 ? 'links' : 'link'} nowhere (dangling): ${
          settings.dangling === 'spread'
            ? 'that rank is spread over every vertex.'
            : 'that rank leaks away, so the total drops below 1.'
        }`
      : '';
    const undirected = g.directed ? '' : ' The graph is undirected, so each edge links both ways.';
    yield step(
      `Every vertex starts with rank 1/N = 1/${n} = ${r3(1 / n)}. Each iteration, every vertex shares its rank among the vertices it links to; with probability 1 − d = ${round3(
        1 - d,
      )
        .replace(/0+$/, '')
        .replace(/\.$/, '')} the surfer jumps anywhere instead.${dang}${undirected}`,
      ['init'],
      2,
    );
    const base = (1 - d) / n;
    while (r.iter < MAX_ITER) {
      const { next, change, D } = iterate(g, r.rank, d, settings.dangling);
      const prev = { ...r.rank };
      r.prev = prev;
      const k = r.iter + 1;
      // Every vertex's sum for the first few iterations; after that, one step per iteration.
      for (const v of g.vertices) {
        if (k > DETAILED) {
          r.rank[v] = next[v]!;
          continue;
        }
        r.v = v;
        const parts = into(g, v).map((u) => `${u} ${r3(prev[u]!)}/${outOf(g, u)}`);
        const spread = settings.dangling === 'spread' && D > 0 ? ` + dangling ${r3(D)}/${n}` : '';
        r.rank[v] = next[v]!;
        yield step(
          `Iteration ${k}, ${v}: ${r3(base)} for the random jump + ${d} × (${parts.length ? parts.join(' + ') : 'no links in'}${spread}) = ${r3(next[v]!)}.`,
          ['for', 'pr'],
          3,
          [
            mark(vertexId(v), 'active'),
            mark(barId(v), 'active'),
            ...into(g, v).map((u) => mark(vertexId(u), 'visit')),
          ],
        );
      }
      r.v = undefined;
      r.prev = undefined;
      r.iter = k;
      r.change = change;
      const top = ranking(g, r.rank)[0]!;
      if (change < TOLERANCE) {
        r.converged = true;
        break;
      }
      yield step(
        `Iteration ${k} done. The ranks moved by ${change.toFixed(5)} in total, not yet under ${TOLERANCE}. ${top} leads with ${r3(r.rank[top]!)}.`,
        ['iter', 'change'],
        2,
        [mark(vertexId(top), 'found')],
      );
    }
    r.final = true;
    const order = ranking(g, r.rank);
    yield step(
      `${
        r.converged
          ? `Converged after ${plural(r.iter, 'iteration')}: the last one moved the ranks by only ${r.change!.toFixed(5)}.`
          : `Stopped after ${MAX_ITER} iterations without settling (the last change was ${r.change!.toFixed(5)}). ${d === 1 ? 'With d = 1 there is no random jump, and the ranks can slosh back and forth forever.' : `With d = ${d} the random jump is rare, so the ranks settle slowly.`}`
      } Ranking: ${order.map((v) => `${v} ${r3(r.rank[v]!)}`).join(', ')}.${
        settings.dangling === 'drop' && r.dangling.length
          ? ` The ranks add up to ${round3(sum(r.rank))}: the dangling rank leaked away.`
          : ''
      }`,
      ['ret'],
      1,
      [mark(vertexId(order[0]!), 'found')],
    );
    return s;
  },
};

const load = loadOp<S, PrSettings, X>({
  make: (graph) => ({ graph }),
  ready: (g) =>
    `Press Run to compute PageRank.${g.directed ? '' : ' The graph is undirected: each edge counts as a link both ways. Use > for one-way links.'}`,
});

export const ops = { load, run };

// ---------------------------------------------------------------------------------------------
// Pseudocode

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: PrSettings): PseudoBlock[] {
  const spread = settings.dangling === 'spread';
  const lines = [
    L('sig', 0, `PAGERANK(G, d = ${settings.damping})`, 'Rank the vertices by power iteration:'),
    L('init', 1, 'PR(v) = 1/N for each v', 'every vertex starts with an equal share.'),
    L('iter', 1, 'repeat', 'Repeat:'),
    L('for', 2, 'for each v ∈ G.V', 'for each vertex v,'),
    spread
      ? L(
          'pr',
          3,
          "PR'(v) = (1−d)/N + d·(Σ PR(u)/out(u) + D/N)",
          'it gets the jump share plus its links’ shares (and the dangling share).',
        )
      : L(
          'pr',
          3,
          "PR'(v) = (1−d)/N + d·Σ PR(u)/out(u)",
          'it gets the jump share plus each linking vertex’s share.',
        ),
    L('change', 2, `until Σ|PR' − PR| < ${TOLERANCE}`, 'Stop when the ranks barely move.'),
    L('ret', 1, 'return PR', 'PR is the PageRank.'),
  ];
  return [{ op: 'run', lines }];
}

export function initialSay(s: S): string {
  return `${describeGraph(s.graph).split('. ')[0]}. Press Run: rank flows along the links until it settles, and the vertices linked from important vertices end up important.`;
}

export const initialVars = (s: S) => graphVars(s.graph);

export const describe = (s: S): string => describeGraph(s.graph);

export function describeRun(g: Graph, r: PrRun): string {
  return `Iteration ${r.iter}. Ranks: ${g.vertices.map((v) => `${v} ${r3(r.rank[v]!)}`).join(', ')}.`;
}

/** The code tabs' line: iterations | rank per vertex, three decimals. */
export const runSummary = (g: Graph, r: PrRun): string =>
  `${r.iter} | ${g.vertices.map((v) => round3(r.rank[v]!)).join(' ')}`;
