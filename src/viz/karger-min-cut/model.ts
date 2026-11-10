/**
 * Karger's minimum cut: contract a random edge, again and again, until two super-vertices are
 * left. The edges between them are a cut. Contracting merges the two ends into one super-vertex
 * and keeps every other edge, so parallel edges pile up (a multigraph) and the edges between
 * the two ends would become self-loops, which go. One trial finds a given minimum cut with
 * probability at least 2/(n(n−1)) = 1/C(n, 2), so repeat it and keep the smallest cut.
 *
 * The page keeps the graph as loaded and each vertex's super-vertex (named by its first member
 * in name order), so the drawing can keep every original vertex and edge: the multigraph's
 * edges are the original edges whose ends are in different super-vertices.
 *
 * Settings
 *   pick     'edge' (default): each step picks one of the edges still left, every parallel edge
 *            counting once (Karger; Kleinberg and Tardos).
 *            'shuffle': shuffle the edges once and contract them in that order, skipping any
 *            whose ends are already together (Kruskal's algorithm on random weights, with a
 *            union-find; the same distribution of cuts).
 *   trials   how many trials Run trials makes.
 *   layout   the drawing only.
 *
 * Operations: load (a graph), merge (contract one edge by hand, such as A-B), contract (one
 * random trial from single vertices), trials (many, counting how often the minimum is found),
 * reset (single vertices again). The true minimum cut is found by trying every split, once per
 * load, and stays hidden until a trial ends.
 */
import type { Rng } from '../../engine/rng';
import type { Mark, OpSpec, PseudoBlock, Scalar, Step } from '../../engine/types';
import { vertexId } from '../../layouts/graph';
import {
  compareNames,
  components,
  keyOf,
  listWords,
  makeGraph,
  plural,
  type Edge,
  type Graph,
} from '../_graph/graph';
import { parseEdge, parseGraph, readGraph } from '../_graph/parse';

export type PickRule = 'edge' | 'shuffle';

export interface KgSettings {
  [key: string]: Scalar;
  pick: PickRule;
  trials: number;
  layout: string;
}

export const defaults: KgSettings = { pick: 'edge', trials: 100, layout: 'force' };

export const MAX_V = 12;
export const MAX_E = 30;
export const MIN_TRIALS = 10;
export const MAX_TRIALS = 1000;

/** Two squares joined by one edge: the minimum cut is that bridge, and a trial finds it often. */
export const START_TEXT = 'A-B, A-C, B-C, B-D, C-D, A-D, D-E, E-F, E-G, F-G, F-H, G-H, E-H';

export interface TrialStats {
  runs: number;
  /** Trials whose cut was a minimum one. */
  found: number;
  /** How many trials found a cut of each size, by size. */
  sizes: number[];
}

export interface KgState {
  graph: Graph;
  /** Each vertex's super-vertex: its first member in name order. */
  group: Record<string, string>;
  /** The size of a minimum cut (null for fewer than two vertices). */
  minCut: number | null;
  /** The draws of the last random trial, for the code tabs. */
  draws: number[];
  /** shuffle: the edge order, and how far along it the trial is. */
  order: string[] | null;
  at: number | null;
  /** The edge just picked, and the edges it makes into self-loops (itself among them). */
  picked: string | null;
  loops: string[];
  /** When a trial ends: the edges of its cut. */
  cut: string[] | null;
  /** Contractions so far in this trial. */
  merges: number;
  /** The minimum cut, once a trial has ended (so practice pictures do not give it away). */
  shown: boolean;
  stats: TrialStats | null;
}

type S = KgState;
type KStep = Step<S, undefined>;
type Op = OpSpec<S, KgSettings, undefined>;

export const startGraph = (): Graph => parseGraph(START_TEXT) as Graph;

const singletons = (g: Graph): Record<string, string> =>
  Object.fromEntries(g.vertices.map((v) => [v, v]));

/** The size of a minimum cut, by trying every split with the first vertex on one side. */
export function minCutSize(g: Graph): number | null {
  const n = g.vertices.length;
  if (n < 2) return null;
  const idx = new Map(g.vertices.map((v, i) => [v, i]));
  let best = Infinity;
  for (let mask = 1; mask < 1 << (n - 1); mask++) {
    // Bit i of mask puts vertex i + 1 on the other side.
    let c = 0;
    for (const e of g.edges) {
      const a = idx.get(e.u)!;
      const b = idx.get(e.v)!;
      const sa = a === 0 ? 0 : (mask >> (a - 1)) & 1;
      const sb = b === 0 ? 0 : (mask >> (b - 1)) & 1;
      if (sa !== sb) c++;
    }
    best = Math.min(best, c);
  }
  return best;
}

export function init(): S {
  return fresh(startGraph());
}

function fresh(graph: Graph): S {
  return {
    graph,
    group: singletons(graph),
    minCut: minCutSize(graph),
    draws: [],
    order: null,
    at: null,
    picked: null,
    loops: [],
    cut: null,
    merges: 0,
    shown: false,
    stats: null,
  };
}

const snap = (s: S): S => ({
  ...s,
  group: { ...s.group },
  draws: [...s.draws],
  order: s.order && [...s.order],
  loops: [...s.loops],
  cut: s.cut && [...s.cut],
  stats: s.stats && { ...s.stats, sizes: [...s.stats.sizes] },
});

/** The super-vertices: first member, then all members, in name order. */
export function groupsOf(s: Pick<S, 'graph' | 'group'>): [string, string[]][] {
  const m = new Map<string, string[]>();
  for (const v of s.graph.vertices) {
    const r = s.group[v] ?? v;
    m.set(r, [...(m.get(r) ?? []), v]);
  }
  return [...m.entries()].sort((a, b) => compareNames(a[0], b[0]));
}

/** The multigraph's edges: the original edges whose ends are in different super-vertices. */
export const crossing = (s: Pick<S, 'graph' | 'group'>): Edge[] =>
  s.graph.edges.filter((e) => s.group[e.u] !== s.group[e.v]);

export const groupText = (members: string[]): string => `{${members.join(', ')}}`;

const groupOfText = (s: S, v: string): string =>
  groupText(s.graph.vertices.filter((x) => s.group[x] === s.group[v]));

/** Merge the super-vertices of u and v; the new one is named by its first member. */
function mergeGroups(s: S, u: string, v: string) {
  const a = s.group[u]!;
  const b = s.group[v]!;
  const keep = compareNames(a, b) <= 0 ? a : b;
  const gone = keep === a ? b : a;
  for (const x of s.graph.vertices) if (s.group[x] === gone) s.group[x] = keep;
}

/** Edges between the super-vertices of u and v: they become self-loops when the two merge. */
const between = (s: S, u: string, v: string): string[] =>
  crossing(s)
    .filter(
      (e) =>
        (s.group[e.u] === s.group[u] && s.group[e.v] === s.group[v]) ||
        (s.group[e.u] === s.group[v] && s.group[e.v] === s.group[u]),
    )
    .map(keyOf);

function vars(s: S): Record<string, Scalar> {
  const n = s.graph.vertices.length;
  const out: Record<string, Scalar> = {
    n,
    m: s.graph.edges.length,
    'super-vertices': groupsOf(s).length,
    'edges left': crossing(s).length,
  };
  if (s.cut) out.cut = s.cut.length;
  if (s.shown && s.minCut !== null) out['min cut'] = s.minCut;
  if (s.stats) {
    out.trials = s.stats.runs;
    out.found = s.stats.found;
  }
  return out;
}

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });
const vm = (vs: string[], role: Mark['role']) => vs.map((v) => mark(vertexId(v), role));

function makeStep(s: S, say: string, lines: string[], level: 1 | 2 | 3, marks: Mark[] = []): KStep {
  return { state: snap(s), marks, say, lines, level, vars: vars(s) };
}

const pct = (x: number) => {
  const p = x * 100;
  return p >= 10 ? `${Math.round(p)}%` : `${Math.round(p * 10) / 10}%`;
};

/** Karger's bound: one trial finds a given minimum cut with at least this chance. */
export const bound = (n: number): number => (n < 2 ? 1 : 2 / (n * (n - 1)));

/** The words for how a trial ended. */
function endText(s: S, who = 'this trial'): string {
  const groups = groupsOf(s);
  const cut = s.cut ?? [];
  const sides =
    groups.length === 2
      ? `Two super-vertices are left, ${groupText(groups[0]![1])} and ${groupText(groups[1]![1])}`
      : `No edges are left between the ${groups.length} super-vertices: the graph is not connected`;
  const verdict =
    s.minCut === null
      ? ''
      : cut.length === s.minCut
        ? ` The minimum cut has ${plural(s.minCut, 'edge')}, so ${who} found one.`
        : ` The minimum cut has only ${plural(s.minCut, 'edge')}, so ${who} missed it.`;
  return `${sides}. The ${plural(cut.length, 'edge')} between them ${cut.length === 1 ? 'is' : 'are'} the cut${cut.length ? `: ${listWords(cut)}` : ''}.${verdict}`;
}

/** One random trial from single vertices, as steps (or quietly, for trials). */
function* trial(s: S, pick: PickRule, rng: Rng, quiet: boolean): Generator<KStep, void, void> {
  const g = s.graph;
  s.group = singletons(g);
  s.draws = [];
  s.cut = null;
  s.picked = null;
  s.loops = [];
  s.merges = 0;
  s.order = null;
  s.at = null;
  const count = () => groupsOf(s).length;
  if (!quiet)
    yield makeStep(
      s,
      `Every vertex starts as its own super-vertex: ${plural(g.vertices.length, 'super-vertex', 'super-vertices')} and ${plural(g.edges.length, 'edge')}. Contract random edges until two are left.`,
      ['init'],
      2,
    );
  const contract = function* (e: Edge, of: number): Generator<KStep, void, void> {
    const k = keyOf(e);
    const loops = between(s, e.u, e.v);
    s.picked = k;
    s.loops = loops;
    const before = `${groupOfText(s, e.u)} and ${groupOfText(s, e.v)}`;
    if (!quiet)
      yield makeStep(
        s,
        pick === 'edge'
          ? `Pick one of the ${plural(of, 'edge')} left at random: ${k}. It joins ${before}${loops.length > 1 ? `, and ${loops.length - 1} more ${loops.length === 2 ? 'edge joins' : 'edges join'} the same two` : ''}.`
          : `Next in the shuffled order: ${k}. It joins ${before}, two different super-vertices, so contract it.`,
        pick === 'edge' ? ['pick'] : ['next', 'diff'],
        3,
        vm([e.u, e.v], 'active'),
      );
    mergeGroups(s, e.u, e.v);
    s.merges++;
    s.picked = null;
    const merged = groupOfText(s, e.u);
    const left = crossing(s).length;
    if (!quiet)
      yield makeStep(
        s,
        `Contract ${k}: ${before} become one super-vertex, ${merged}. ${loops.length === 1 ? `${k} would be a self-loop, so it goes` : `The ${loops.length} edges between them (${listWords(loops)}) would be self-loops, so they go`}. ${plural(left, 'edge')} and ${plural(count(), 'super-vertex', 'super-vertices')} left.`,
        ['merge', 'loops'],
        2,
        vm(
          g.vertices.filter((x) => s.group[x] === s.group[e.u]),
          'new',
        ),
      );
    s.loops = [];
  };

  if (pick === 'edge') {
    while (count() > 2) {
      const left = crossing(s);
      if (!left.length) break;
      const i = rng.int(0, left.length - 1);
      s.draws.push(i);
      yield* contract(left[i]!, left.length);
    }
  } else {
    // Fisher-Yates on the edges, then go through them in that order.
    const order = g.edges.map(keyOf);
    for (let i = order.length - 1; i > 0; i--) {
      const j = rng.int(0, i);
      s.draws.push(j);
      [order[i], order[j]] = [order[j]!, order[i]!];
    }
    s.order = order;
    s.at = null;
    if (!quiet)
      yield makeStep(
        s,
        `Shuffle the ${plural(order.length, 'edge')} into a random order: ${order.join(', ')}. Go through them in that order.`,
        ['shuffle'],
        2,
      );
    const byKey = new Map(g.edges.map((e) => [keyOf(e), e]));
    for (let i = 0; i < order.length && count() > 2; i++) {
      s.at = i;
      const e = byKey.get(order[i]!)!;
      if (s.group[e.u] === s.group[e.v]) {
        s.picked = order[i]!;
        if (!quiet)
          yield makeStep(
            s,
            `Next: ${order[i]}. Both ends are already in ${groupOfText(s, e.u)}, so it is a self-loop by now: skip it.`,
            ['next', 'skip'],
            3,
            vm([e.u, e.v], 'compare'),
          );
        s.picked = null;
        continue;
      }
      yield* contract(e, crossing(s).length);
    }
    s.at = null;
  }
  s.cut = crossing(s).map(keyOf);
  s.shown = true;
}

const reject = (s: S, say: string): KStep => makeStep(s, say, [], 1);

const load: Op = {
  label: 'Load',
  arity: 1,
  *run(s, [arg]) {
    const r = readGraph(String(arg ?? ''));
    if (r instanceof Error) {
      yield reject(s, `Nothing loaded. ${r.message} The graph stays as it was.`);
      return s;
    }
    const g0 = r.graph;
    if (g0.directed) {
      yield reject(
        s,
        'Nothing loaded. A cut here counts edges either way, so type an undirected graph, such as A-B, B-C, C-A.',
      );
      return s;
    }
    if (g0.vertices.length > MAX_V || g0.edges.length > MAX_E) {
      yield reject(
        s,
        `Nothing loaded. Keep it to ${MAX_V} vertices and ${MAX_E} edges, so every super-vertex fits in the drawing. That one has ${g0.vertices.length} and ${g0.edges.length}.`,
      );
      return s;
    }
    const g = makeGraph({
      directed: false,
      weighted: false,
      vertices: g0.vertices,
      edges: g0.edges,
    });
    const next = fresh(g);
    const pieces = components(g).length;
    yield makeStep(
      next,
      `Loaded ${plural(g.vertices.length, 'vertex', 'vertices')} and ${plural(g.edges.length, 'edge')}${g0.weighted ? ' (weights are ignored: every edge counts once)' : ''}. ${
        g.vertices.length < 2
          ? 'A cut needs at least two vertices.'
          : pieces > 1
            ? `It is in ${pieces} pieces already, so its minimum cut is 0.`
            : 'Press Random trial, or contract edges yourself.'
      }`,
      [],
      1,
    );
    return next;
  },
};

const merge: Op = {
  label: 'Contract edge',
  arity: 1,
  *run(s0, [arg]) {
    const e = parseEdge(String(arg ?? ''));
    if (e instanceof Error) {
      yield reject(s0, `${e.message} Nothing was contracted.`);
      return s0;
    }
    const g = s0.graph;
    for (const v of [e.u, e.v])
      if (!g.vertices.includes(v)) {
        yield reject(s0, `There is no vertex ${v}. Nothing was contracted.`);
        return s0;
      }
    const s = snap(s0);
    // A hand merge carries on from the picture; a finished trial's cut and counts go.
    s.cut = null;
    s.stats = null;
    s.order = null;
    s.at = null;
    if (s.group[e.u] === s.group[e.v]) {
      yield reject(
        s0,
        `${e.u} and ${e.v} are already in the same super-vertex, ${groupOfText(s, e.u)}. Nothing was contracted.`,
      );
      return s0;
    }
    if (groupsOf(s).length <= 2) {
      yield reject(
        s0,
        'Only two super-vertices are left: the edges between them are the cut. Press Start over to contract again.',
      );
      return s0;
    }
    const loops = between(s, e.u, e.v);
    if (!loops.length) {
      yield reject(
        s0,
        `No edge joins ${groupOfText(s, e.u)} and ${groupOfText(s, e.v)}. Contraction merges the two ends of an edge, so pick two super-vertices with an edge between them.`,
      );
      return s0;
    }
    const before = `${groupOfText(s, e.u)} and ${groupOfText(s, e.v)}`;
    mergeGroups(s, e.u, e.v);
    s.merges++;
    const left = crossing(s).length;
    const count = groupsOf(s).length;
    const done = count <= 2 || left === 0;
    if (done) {
      s.cut = crossing(s).map(keyOf);
      s.shown = true;
    }
    yield makeStep(
      s,
      `Contract ${e.u}-${e.v}: ${before} become ${groupOfText(s, e.u)}. ${loops.length === 1 ? `The edge between them would be a self-loop, so it goes` : `The ${loops.length} edges between them (${listWords(loops)}) would be self-loops, so they go`}. ${plural(left, 'edge')} and ${plural(count, 'super-vertex', 'super-vertices')} left.${done ? ` ${endText(s, 'these contractions')}` : ''}`,
      ['merge', 'loops'],
      1,
      vm(
        g.vertices.filter((x) => s.group[x] === s.group[e.u]),
        'new',
      ),
    );
    return s;
  },
};

const contractOp: Op = {
  label: 'Random trial',
  arity: 0,
  *run(s0, _args, { settings, rng }) {
    const s = snap(s0);
    s.stats = null;
    if (s.graph.vertices.length < 2) {
      yield reject(s0, 'A cut needs at least two vertices. Load a graph, such as A-B, B-C, C-A.');
      return s0;
    }
    yield* trial(s, settings.pick, rng, false);
    yield makeStep(s, `${endText(s)}`, ['ret'], 1);
    return snap(s);
  },
};

const trialsOp: Op = {
  label: 'Run trials',
  arity: 0,
  *run(s0, _args, { settings, rng }) {
    if (s0.graph.vertices.length < 2) {
      yield reject(s0, 'A cut needs at least two vertices. Load a graph, such as A-B, B-C, C-A.');
      return s0;
    }
    const t = Math.max(MIN_TRIALS, Math.min(MAX_TRIALS, Math.round(Number(settings.trials) || 0)));
    const s = snap(s0);
    const n = s.graph.vertices.length;
    const stats: TrialStats = { runs: 0, found: 0, sizes: [] };
    s.stats = stats;
    s.shown = true;
    const p = bound(n);
    yield makeStep(
      s,
      `Run ${t} independent trials and keep the smallest cut. Karger's bound says each trial finds a given minimum cut with chance at least 2/(n(n−1)) = 2/${n * (n - 1)}, about ${pct(p)}.`,
      ['repeat'],
      2,
    );
    let best: S | null = null;
    const checkpoints = [10, 100].filter((c) => c < t);
    for (let k = 1; k <= t; k++) {
      const one = snap(s);
      const gen = trial(one, settings.pick, rng, true);
      while (!gen.next().done);
      const size = one.cut!.length;
      while (stats.sizes.length <= size) stats.sizes.push(0);
      stats.sizes[size]!++;
      if (size === s.minCut) stats.found++;
      stats.runs = k;
      if (!best || size < best.cut!.length) best = one;
      if (checkpoints.includes(k)) {
        Object.assign(s, { group: best.group, cut: best.cut, draws: best.draws });
        yield makeStep(
          s,
          `After ${k} trials: the minimum cut came up ${plural(stats.found, 'time')}, ${pct(stats.found / k)}.`,
          ['repeat', 'keep'],
          2,
        );
      }
    }
    Object.assign(s, { group: best!.group, cut: best!.cut, draws: best!.draws });
    const miss = Math.pow(1 - p, t);
    yield makeStep(
      s,
      `${t} trials: a minimum cut (${plural(s.minCut ?? 0, 'edge')}) came up ${plural(stats.found, 'time')}, ${pct(stats.found / t)}, against the bound of at least ${pct(p)}. Even at the bound, all ${t} trials miss with chance at most ${miss < 0.001 ? 'under 0.1%' : pct(miss)}. The picture shows the smallest cut found.`,
      ['ret'],
      1,
    );
    return snap(s);
  },
};

const reset: Op = {
  label: 'Start over',
  arity: 0,
  *run(s0) {
    const s = { ...fresh(s0.graph) };
    yield makeStep(
      s,
      'Back to single vertices: every vertex is its own super-vertex again.',
      ['init'],
      1,
    );
    return s;
  },
};

export const ops = { load, merge, contract: contractOp, trials: trialsOp, reset };

// ---------------------------------------------------------------------------------------------
// Pseudocode. Lines stay short for a phone.

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: KgSettings): PseudoBlock[] {
  const one =
    settings.pick === 'shuffle'
      ? [
          L('sig', 0, 'KARGER(G)', 'One trial:'),
          L('init', 1, 'each v is its own set', 'Every vertex is its own super-vertex.'),
          L('shuffle', 1, 'shuffle the edges of G', 'Put the edges in a random order.'),
          L('next', 1, 'for (u, v) in that order', 'Go through them one by one.'),
          L('stop', 2, 'if 2 sets left: break', 'Stop at two super-vertices.'),
          L('skip', 2, 'if FIND(u) == FIND(v): skip', 'Skip an edge inside one set,'),
          L('diff', 2, 'else', 'otherwise'),
          L('merge', 3, 'UNION(u, v)', 'merge its two ends'),
          L('loops', 3, '(edges inside: self-loops)', 'and drop the edges now inside.'),
          L('ret', 1, 'return edges between sets', 'What crosses between the two is the cut.'),
        ]
      : [
          L('sig', 0, 'KARGER(G)', 'One trial:'),
          L('init', 1, 'each v is a super-vertex', 'Every vertex is its own super-vertex.'),
          L('while', 1, 'while > 2 super-vertices', 'While more than two are left,'),
          L('pick', 2, '(u, v) = random edge', 'pick any edge left, at random,'),
          L('merge', 2, 'contract u and v', 'merge its two ends into one,'),
          L('loops', 2, 'remove self-loops', 'and drop the edges between them.'),
          L('ret', 1, 'return edges left', 'The edges still left are the cut.'),
        ];
  return [
    { op: 'contract', lines: one },
    { op: 'merge', lines: one },
    {
      op: 'trials',
      lines: [
        L('repeat', 0, 'repeat T times: KARGER(G)', 'Run many independent trials'),
        L('keep', 1, 'keep the smallest cut', 'and keep the smallest cut found.'),
        L('ret', 0, 'return it', 'With enough trials it is a minimum cut.'),
      ],
    },
    { op: 'reset', lines: [one[1]!] },
  ];
}

export function initialSay(s: S): string {
  return `A graph with ${plural(s.graph.vertices.length, 'vertex', 'vertices')} and ${plural(s.graph.edges.length, 'edge')}. Press Random trial to contract random edges until two super-vertices are left, or type an edge such as ${s.graph.edges[0] ? keyOf(s.graph.edges[0]) : 'A-B'} and press Contract edge.`;
}

export function initialVars(s: S): Record<string, Scalar> {
  return vars(s);
}

export function describe(s: S): string {
  const groups = groupsOf(s);
  const parts = [
    `A graph with ${plural(s.graph.vertices.length, 'vertex', 'vertices')} and ${plural(s.graph.edges.length, 'edge')}.`,
    `Super-vertices: ${groups.map(([, m]) => groupText(m)).join(', ')}.`,
    `${plural(crossing(s).length, 'edge')} between them.`,
  ];
  if (s.cut) parts.push(`Cut: ${plural(s.cut.length, 'edge')}.`);
  if (s.shown && s.minCut !== null) parts.push(`Minimum cut: ${plural(s.minCut, 'edge')}.`);
  if (s.stats)
    parts.push(`Trials: ${s.stats.runs}, minimum found ${plural(s.stats.found, 'time')}.`);
  return parts.join(' ');
}
