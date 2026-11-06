/**
 * Minimum vertex cover: the fewest vertices such that every edge has at least one end among
 * them. Every run ends by setting the cover it found against the optimum (found by brute force,
 * without steps) and giving the ratio.
 *
 * Settings
 *   method  'matching'  CLRS's APPROX-VERTEX-COVER: take an edge with neither end covered (the
 *                       first in edge order), put both ends in the cover, repeat. The edges taken
 *                       form a matching, and any cover needs one end of each, so the cover is at
 *                       most twice the optimum.
 *           'greedy'    take the vertex that covers the most uncovered edges (ties to the earlier
 *                       name), repeat. Sounds better, but it can be Θ(log n) times the optimum.
 *           'branch'    exact: pick the first uncovered edge u-v; any cover holds u or v, so try
 *                       both (u first). Stop a branch that cannot beat the best cover so far.
 *           'brute'     exact: try every set of 0 vertices, then 1, then 2, ... in name order, and
 *                       stop at the first set that covers every edge.
 *   layout  the drawing only
 *
 * Weights are ignored: a cover counts vertices. A directed graph is refused.
 * The state is just the graph; a run's bookkeeping travels in the steps' `extra`.
 */
import type { Mark, OpSpec, PseudoBlock, Scalar, Step } from '../../engine/types';
import type { GraphTemplate } from '../../layouts/graph';
import { edgeId, vertexId } from '../../layouts/graph';
import { ratioText } from '../_approx/kit';
import {
  describeGraph,
  listWords,
  makeGraph,
  plural,
  type Edge,
  type Graph,
} from '../_graph/graph';
import { graphVars, loadOp, type GraphState } from '../_graph/kit';
import { parseGraph } from '../_graph/parse';

export type VcState = GraphState;
export type VcMethod = 'matching' | 'greedy' | 'branch' | 'brute';

export interface VcSettings {
  [key: string]: Scalar;
  method: VcMethod;
  layout: GraphTemplate;
}

export const defaults: VcSettings = { method: 'matching', layout: 'force' };

/**
 * Undirected, 8 vertices and 10 edges. A minimum cover has 4 vertices (A, C, E, G); the
 * matching method takes all 8, twice the optimum, and greedy finds 4.
 */
export const START_TEXT = 'A-B, A-D, B-C, B-E, C-F, D-E, D-G, E-H, F-G, G-H';
export const startGraph = (): Graph => makeGraph(parseGraph(START_TEXT) as Graph);

export interface VcRun {
  method: VcMethod;
  /** The cover so far, in the order vertices joined it. */
  C: string[];
  /** The optimum, and one minimum cover. */
  opt: number;
  optCover: string[];
  /** Edges with an end in C, by key. */
  covered: Record<string, true>;
  /** Matching: the edges taken. */
  M: string[];
  /** Greedy: how many uncovered edges each vertex has. */
  deg?: Record<string, number>;
  /** Exact: the best cover found so far (null: none yet), and sets or branches tried. */
  best: string[] | null;
  tried: number;
  pruned: number;
  /** The edge and vertex being looked at. */
  e?: string;
  u?: string;
  final?: boolean;
}

export interface VcExtra {
  run?: VcRun;
}

type S = VcState;
type X = VcExtra;
type Op = OpSpec<S, VcSettings, X>;
type VStep = Step<S, X>;

export function init(): S {
  return { graph: startGraph() };
}

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });
const key = (e: Edge) => `${e.u}-${e.v}`;

/** Panel ids (see view.ts). */
export const coverCellId = (v: string) => `cover-${v}`;
export const degCellId = (v: string) => `deg-deg-${v}`;
export const matchCellId = (k: string) => `match-${k}`;

export const methodName: Record<VcMethod, string> = {
  matching: 'The matching method (APPROX-VERTEX-COVER)',
  greedy: 'Greedy by degree',
  branch: 'Branching on an edge',
  brute: 'Brute force',
};

/** Show the steps of at most this many sets of one size (brute force) or branches. */
export const SHOWN = 60;

// ---------------------------------------------------------------------------------------------
// The algorithms without steps. Tests, practice and the optimum use these.

export const covers = (g: Graph, c: Iterable<string>): boolean => {
  const set = new Set(c);
  return g.edges.every((e) => set.has(e.u) || set.has(e.v));
};

/** The first set of the smallest size, in name order, that covers every edge. */
export function minCover(g: Graph): string[] {
  const vs = g.vertices;
  const n = vs.length;
  for (let k = 0; k <= n; k++) {
    const pick: number[] = [];
    let found: string[] | null = null;
    const go = (from: number): boolean => {
      if (pick.length === k) {
        const c = pick.map((i) => vs[i]!);
        if (covers(g, c)) found = c;
        return found !== null;
      }
      for (let i = from; i <= n - (k - pick.length); i++) {
        pick.push(i);
        if (go(i + 1)) return true;
        pick.pop();
      }
      return false;
    };
    go(0);
    if (found) return found;
  }
  return [...vs];
}

export function matchingCover(g: Graph): { cover: string[]; matching: Edge[] } {
  const cover: string[] = [];
  const matching: Edge[] = [];
  for (const e of g.edges) {
    if (cover.includes(e.u) || cover.includes(e.v)) continue;
    matching.push(e);
    cover.push(e.u, e.v);
  }
  return { cover, matching };
}

export function greedyCover(g: Graph): string[] {
  const cover: string[] = [];
  const open = () => g.edges.filter((e) => !cover.includes(e.u) && !cover.includes(e.v));
  for (let left = open(); left.length; left = open()) {
    let best = '';
    let most = -1;
    for (const v of g.vertices) {
      const d = left.filter((e) => e.u === v || e.v === v).length;
      if (d > most) {
        best = v;
        most = d;
      }
    }
    cover.push(best);
  }
  return cover;
}

// ---------------------------------------------------------------------------------------------
// Words

export const setText = (c: string[]) => (c.length ? `{ ${c.join(', ')} }` : '∅');

function runVars(g: Graph, r: VcRun): Record<string, Scalar> {
  const open = g.edges.filter((e) => !r.covered[key(e)]).length;
  const vars: Record<string, Scalar> = {
    ...graphVars(g),
    '|C|': r.C.length,
    uncovered: open,
    optimum: r.opt,
    ratio: r.final ? ratioText(r.C.length, r.opt) : '–',
  };
  if (r.method === 'matching') vars['|M|'] = r.M.length;
  if (r.method === 'branch' || r.method === 'brute') {
    vars.best = r.best ? r.best.length : '∞';
    vars[r.method === 'branch' ? 'branches' : 'sets'] = r.tried;
  }
  if (r.method === 'branch') vars.pruned = r.pruned;
  return vars;
}

function clone(r: VcRun): VcRun {
  return {
    ...r,
    C: [...r.C],
    optCover: [...r.optCover],
    covered: { ...r.covered },
    M: [...r.M],
    deg: r.deg && { ...r.deg },
    best: r.best && [...r.best],
  };
}

export function directedRefusal(): string {
  return 'A vertex cover is about edges with two ends, and here direction does not matter. This graph is directed: load it with - instead of >, such as A-B, and run again.';
}

// ---------------------------------------------------------------------------------------------
// The run

type StepFn = (say: string, lines: string[], level: 1 | 2 | 3, marks?: Mark[]) => VStep;

const run: Op = {
  label: 'Find a cover',
  arity: 0,
  *run(s, _args, { settings }) {
    const g = s.graph;
    if (g.directed) {
      yield {
        state: s,
        marks: [],
        say: directedRefusal(),
        lines: ['sig'],
        level: 1,
        vars: graphVars(g),
      } satisfies VStep;
      return s;
    }
    const method = settings.method;
    const best = minCover(g);
    const r: VcRun = {
      method,
      C: [],
      opt: best.length,
      optCover: best,
      covered: {},
      M: [],
      best: null,
      tried: 0,
      pruned: 0,
    };
    const step: StepFn = (say, lines, level, marks = []) => ({
      state: s,
      marks,
      say,
      lines,
      level,
      vars: runVars(g, r),
      extra: { run: clone(r) },
    });
    const take = (v: string) => {
      r.C.push(v);
      for (const e of g.edges) if (e.u === v || e.v === v) r.covered[key(e)] = true;
    };
    const weights = g.weighted ? ' Weights do not matter here: a cover counts vertices.' : '';

    if (g.edges.length === 0) {
      r.final = true;
      yield step(
        `${plural(g.vertices.length, 'vertex', 'vertices')} and no edges: there is nothing to cover, so the empty set is a cover, and the smallest.`,
        ['sig'],
        1,
      );
      return s;
    }

    if (method === 'matching') {
      yield step(
        `APPROX-VERTEX-COVER starts with an empty cover C. It takes any edge with neither end in C (here the first in edge order) and puts both ends in C.${weights}`,
        ['sig', 'm.init'],
        2,
      );
      for (const e of g.edges) {
        if (r.covered[key(e)]) continue;
        r.e = key(e);
        r.M.push(key(e));
        take(e.u);
        take(e.v);
        const gone = g.edges.filter(
          (x) => x !== e && (x.u === e.u || x.v === e.u || x.u === e.v || x.v === e.v),
        );
        yield step(
          `${key(e)} has neither end in C, so take both: C = ${setText(r.C)}. ${
            gone.length
              ? `That also covers ${listWords(gone.map(key))}.`
              : 'No other edge touches them.'
          } A cover needs ${e.u} or ${e.v} for this edge, so at least one of the two was needed anyway.`,
          ['m.while', 'm.pick', 'm.add', 'm.remove'],
          2,
          [
            mark(edgeId(key(e)), 'active'),
            mark(vertexId(e.u), 'new'),
            mark(vertexId(e.v), 'new'),
            mark(matchCellId(key(e)), 'new'),
          ],
        );
      }
      r.e = undefined;
    } else if (method === 'greedy') {
      const open = () => g.edges.filter((e) => !r.covered[key(e)]);
      const degrees = () =>
        Object.fromEntries(
          g.vertices.map((v) => [v, open().filter((e) => e.u === v || e.v === v).length]),
        );
      r.deg = degrees();
      yield step(
        `Greedy starts with an empty cover C and counts each vertex's uncovered edges (the deg row). Each round it takes the vertex that covers the most.${weights}`,
        ['sig', 'g.init'],
        2,
      );
      while (open().length) {
        const deg = r.deg!;
        let u = g.vertices[0]!;
        for (const v of g.vertices) if (deg[v]! > deg[u]!) u = v;
        const tie = g.vertices.filter((v) => v !== u && deg[v] === deg[u]);
        const mine = open().filter((e) => e.u === u || e.v === u);
        r.u = u;
        take(u);
        r.deg = degrees();
        yield step(
          `${u} has the most uncovered edges, ${deg[u]}${tie.length ? ` (tied with ${listWords(tie)}; ${u} comes first in name order)` : ''}. Take it: C = ${setText(r.C)}, covering ${listWords(mine.map(key))}.`,
          ['g.while', 'g.pick', 'g.add'],
          2,
          [
            mark(vertexId(u), 'active'),
            mark(degCellId(u), 'active'),
            ...mine.map((e) => mark(edgeId(key(e)), 'new')),
          ],
        );
      }
      r.u = undefined;
    } else if (method === 'brute') {
      yield* bruteSteps(g, r, step, weights);
    } else {
      yield* branchSteps(g, r, step, weights);
    }

    r.final = true;
    r.e = undefined;
    r.u = undefined;
    const size = r.C.length;
    const why =
      method === 'matching'
        ? r.M.length === 1
          ? ` A cover needs an end of the one edge taken, so the optimum is at least 1, and C is at most twice the optimum.`
          : ` The ${r.M.length} edges taken share no vertex (they are a matching), and a cover needs a different vertex for each, so the optimum is at least ${r.M.length}, and C is at most twice the optimum.`
        : method === 'greedy'
          ? ' Greedy has no factor-2 guarantee: on bad graphs it is about ln n times the optimum.'
          : '';
    const verdict =
      size === r.opt
        ? `That is a minimum cover: ratio 1.`
        : `A minimum cover has ${r.opt}, such as ${setText(r.optCover)}: ratio ${ratioText(size, r.opt)}.`;
    yield step(
      `${methodName[method]} found the cover ${setText(r.C)}, ${plural(size, 'vertex', 'vertices')}. ${verdict}${why}`,
      [
        method === 'matching'
          ? 'm.ret'
          : method === 'greedy'
            ? 'g.ret'
            : method === 'brute'
              ? 'b.ret'
              : 'x.ret',
      ],
      1,
      r.C.map((v) => mark(coverCellId(v), 'done')),
    );
    return s;
  },
};

function* bruteSteps(g: Graph, r: VcRun, step: StepFn, weights: string) {
  const vs = g.vertices;
  const n = vs.length;
  yield step(
    `Brute force tries every set of vertices, smallest first: all sets of 0 vertices, then 1, then 2, and so on. The first set that covers every edge is a minimum cover.${weights}`,
    ['sig', 'b.size'],
    2,
  );
  for (let k = 0; k <= n; k++) {
    let shown = 0;
    let count = 0;
    let found: string[] | null = null;
    const pick: number[] = [];
    const steps: VStep[] = [];
    const go = (from: number): boolean => {
      if (pick.length === k) {
        const c = pick.map((i) => vs[i]!);
        count++;
        r.tried++;
        r.C = c;
        r.covered = {};
        for (const e of g.edges) if (c.includes(e.u) || c.includes(e.v)) r.covered[key(e)] = true;
        const miss = g.edges.find((e) => !r.covered[key(e)]);
        if (!miss) {
          found = c;
          r.best = c;
          return true;
        }
        if (shown < SHOWN) {
          shown++;
          steps.push(
            step(
              `Try ${setText(c)}: ${key(miss)} has neither end in it, so it is not a cover.`,
              ['b.size', 'b.set', 'b.if'],
              3,
              [mark(edgeId(key(miss)), 'error'), ...c.map((v) => mark(vertexId(v), 'compare'))],
            ),
          );
        }
        return false;
      }
      for (let i = from; i <= n - (k - pick.length); i++) {
        pick.push(i);
        if (go(i + 1)) return true;
        pick.pop();
      }
      return false;
    };
    go(0);
    yield* steps;
    if (found) {
      const c: string[] = found;
      yield step(
        `${setText(c)} covers every edge. Every smaller set failed, so this is a minimum cover, found after ${plural(r.tried, 'set')}.`,
        ['b.set', 'b.if', 'b.ret'],
        2,
        c.map((v) => mark(vertexId(v), 'found')),
      );
      return;
    }
    r.C = [];
    r.covered = {};
    yield step(
      `None of the ${plural(count, 'set')} of ${plural(k, 'vertex', 'vertices')} covers every edge${count > shown ? ` (the steps show the first ${shown})` : ''}. Try sets one bigger.`,
      ['b.size'],
      2,
    );
  }
}

function* branchSteps(g: Graph, r: VcRun, step: StepFn, weights: string) {
  yield step(
    `Branching: any cover holds one end of every edge. So take the first edge u-v that is not covered yet and try two cases, C with u and C with v. A branch stops when it covers every edge, or when it cannot beat the best cover so far.${weights}`,
    ['sig', 'x.init'],
    2,
  );
  let shown = 0;
  let hidden = false;
  const show = (st: () => VStep) => {
    if (shown < SHOWN) {
      shown++;
      return [st()];
    }
    hidden = true;
    return [];
  };
  const set = (c: string[]) => {
    r.C = [...c];
    r.covered = {};
    for (const e of g.edges) if (c.includes(e.u) || c.includes(e.v)) r.covered[key(e)] = true;
  };
  function* branch(c: string[]): Generator<VStep, void, void> {
    r.tried++;
    set(c);
    const miss = g.edges.find((e) => !c.includes(e.u) && !c.includes(e.v));
    if (!miss) {
      r.best = [...c];
      yield step(
        `C = ${setText(c)} covers every edge. It is the best cover so far, with ${plural(c.length, 'vertex', 'vertices')}.`,
        ['x.sig', 'x.done', 'x.best'],
        2,
        c.map((v) => mark(vertexId(v), 'found')),
      );
      return;
    }
    if (r.best && c.length + 1 >= r.best.length) {
      r.pruned++;
      yield* show(() =>
        step(
          `C = ${setText(c)} leaves ${key(miss)} uncovered, so it needs at least one more vertex: ${c.length + 1} or more. The best cover so far has ${r.best!.length}. Stop this branch.`,
          ['x.sig', 'x.prune'],
          3,
          [mark(edgeId(key(miss)), 'error')],
        ),
      );
      return;
    }
    r.e = key(miss);
    yield* show(() =>
      step(
        `C = ${setText(c)}. The first uncovered edge is ${key(miss)}: try C with ${miss.u}, then C with ${miss.v}.`,
        ['x.sig', 'x.edge', 'x.try'],
        3,
        [mark(edgeId(key(miss)), 'active')],
      ),
    );
    yield* branch([...c, miss.u]);
    yield* branch([...c, miss.v]);
  }
  r.best = [...g.vertices];
  yield* branch([]);
  set(r.best ?? g.vertices);
  r.e = undefined;
  yield step(
    `Every branch is done: ${plural(r.tried, 'branch', 'branches')}, ${r.pruned} stopped early.${hidden ? ` (The steps show the first ${SHOWN}.)` : ''} The best cover found is a minimum one.`,
    ['x.ret'],
    2,
    r.C.map((v) => mark(vertexId(v), 'found')),
  );
}

const load = loadOp<S, VcSettings, X>({
  make: (graph) => ({ graph }),
  ready: (g) =>
    g.directed
      ? 'This graph is directed, and a vertex cover needs an undirected one.'
      : `Press Find a cover.${g.weighted ? ' Weights do not matter here: a cover counts vertices.' : ''}`,
});

export const ops = { load, run };

// ---------------------------------------------------------------------------------------------
// Pseudocode, after CLRS for the matching method.

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: VcSettings): PseudoBlock[] {
  const lines = {
    matching: [
      L('sig', 0, 'APPROX-VERTEX-COVER(G)', 'Find a cover at most twice the smallest:'),
      L('m.init', 1, "C = ∅; E' = G.E", 'Start with no vertices; every edge is uncovered.'),
      L('m.while', 1, "while E' ≠ ∅", 'While some edge is uncovered,'),
      L('m.pick', 2, "let (u, v) be an edge of E'", 'pick one,'),
      L('m.add', 2, 'C = C ∪ {u, v}', 'put both of its ends in the cover,'),
      L(
        'm.remove',
        2,
        "remove from E' every edge on u or v",
        'and cross off every edge they touch.',
      ),
      L('m.ret', 1, 'return C', 'Return the cover.'),
    ],
    greedy: [
      L('sig', 0, 'GREEDY-VERTEX-COVER(G)', 'Find a cover greedily:'),
      L('g.init', 1, "C = ∅; E' = G.E", 'Start with no vertices; every edge is uncovered.'),
      L('g.while', 1, "while E' ≠ ∅", 'While some edge is uncovered,'),
      L('g.pick', 2, "u = a vertex with most edges in E'", 'take the vertex that covers the most,'),
      L('g.add', 2, "C = C ∪ {u}; remove u's edges from E'", 'add it and cross off its edges.'),
      L('g.ret', 1, 'return C', 'Return the cover.'),
    ],
    brute: [
      L('sig', 0, 'BRUTE-VERTEX-COVER(G)', 'Find a smallest cover by trying every set:'),
      L('b.size', 1, 'for k = 0 to |V|', 'For sizes 0, 1, 2, and up,'),
      L('b.set', 2, 'for each C ⊆ V with |C| = k', 'try every set of that many vertices:'),
      L('b.if', 3, 'if every edge has an end in C', 'if it covers every edge,'),
      L('b.ret', 4, 'return C', 'it is a smallest cover.'),
    ],
    branch: [
      L('sig', 0, 'VERTEX-COVER(G)', 'Find a smallest cover by branching:'),
      L('x.init', 1, 'best = V; BRANCH(∅)', 'Start from an empty cover.'),
      L('x.sig', 1, 'BRANCH(C):', 'To extend a partial cover C:'),
      L('x.done', 2, 'if C covers every edge', 'if it covers every edge,'),
      L('x.best', 3, 'if |C| < |best|: best = C', 'keep it if it is the smallest so far.'),
      L('x.prune', 2, 'else if |C| + 1 ≥ |best|: return', 'If it cannot beat the best, stop.'),
      L('x.edge', 2, 'else (u, v) = an uncovered edge', 'Otherwise pick an uncovered edge u-v:'),
      L('x.try', 3, 'BRANCH(C ∪ {u}); BRANCH(C ∪ {v})', 'a cover needs u or v, so try both.'),
      L('x.ret', 1, 'return best', 'Return the best cover found.'),
    ],
  }[settings.method];
  return [{ op: 'run', lines }];
}

export function initialSay(s: S): string {
  return `${describeGraph(s.graph).split('. ')[0]}. Press Find a cover: pick vertices so that every edge has an end among them, using the method in the options.`;
}

export function initialVars(s: S) {
  return graphVars(s.graph);
}

export function describe(s: S): string {
  return describeGraph(s.graph);
}

/** The scene label: where a run stands. */
export function describeRun(g: Graph, r: VcRun): string {
  const open = g.edges.filter((e) => !r.covered[key(e)]).map(key);
  return `${methodName[r.method]}. Cover: ${r.C.length ? r.C.join(', ') : 'none'}. Uncovered edges: ${open.length ? open.join(', ') : 'none'}. Optimum ${r.opt}.${r.final ? ` Ratio ${ratioText(r.C.length, r.opt)}.` : ''}`;
}
