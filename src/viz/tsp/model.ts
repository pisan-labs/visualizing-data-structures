/**
 * The traveling salesperson problem, exact against approximate. The cities form a complete
 * graph whose weights are distances (see ./cities.ts). A tour starts at the first city, visits
 * every other city once, and comes back. Every run ends by setting the tour it found against
 * the optimum (found with Held-Karp, without steps) and giving the ratio.
 *
 * Settings
 *   method  'mst'      CLRS's APPROX-TSP-TOUR: a minimum spanning tree from the first city
 *                      (Prim, ties to the earlier name), a preorder walk of it (children in name
 *                      order), and the cities in the order the walk first meets them. With the
 *                      triangle inequality the tour costs at most twice the optimum.
 *           'nearest'  nearest neighbour: from the current city go to the closest one not yet
 *                      visited (ties to the earlier name), then home. No constant bound.
 *           'exact'    Held-Karp dynamic programming over subsets: C(S, j) is the shortest path
 *                      from the first city through every city of S, ending at j. O(2ⁿ n²). The
 *                      table is drawn when there are at most TABLE_MAX cities.
 *   improve  2-opt after the heuristic: while swapping two edges of the tour for the two that
 *            reconnect it the other way shortens it, do it (first improvement, scanning from the
 *            start). Ignored by the exact method.
 *
 * The state is the cities; a run's bookkeeping travels in the steps' `extra`.
 */
import type { Mark, OpSpec, PseudoBlock, Scalar, Step, Value } from '../../engine/types';
import { edgeId, vertexId, weightId } from '../../layouts/graph';
import { arrayPrim, ratioText, subsetsBySize, type TreeEdge } from '../_approx/kit';
import { compareNames, edgeKey, listWords, plural, type Graph } from '../_graph/graph';
import { FORMAT_NAMES, readGraph } from '../_graph/parse';
import { citiesText, distances, readCities, tourCost, triangleBreak, type Points } from './cities';

export interface TspState {
  graph: Graph;
  /** Where each city is, when the cities came as points; null for graph text. */
  pts: Points | null;
}

export type TspMethod = 'mst' | 'nearest' | 'exact';

export interface TspSettings {
  [key: string]: Scalar;
  method: TspMethod;
  improve: boolean;
}

export const defaults: TspSettings = { method: 'mst', improve: false };

/** Held-Karp draws its table up to this many cities (15 subsets of the 4 others). */
export const TABLE_MAX = 5;

export interface HkTable {
  /** Subsets of the cities other than the start, as their names run together ("BC"). */
  cols: string[];
  /** End cities. */
  rows: string[];
  /** `${row}|${col}` -> text; "–" where the end city is not in the subset. */
  cells: Record<string, string>;
}

export interface TspRun {
  method: TspMethod;
  /** The cities in tour order so far: a path while it grows, a tour once `closed`. */
  tour: string[];
  closed: boolean;
  /** The length of the path or tour so far. */
  cost: number;
  /** The optimum, and one optimal tour. */
  opt: number;
  optTour: string[];
  /** The current city, drawn as u. */
  at?: string;
  /** The minimum spanning tree so far (mst method). */
  tree?: TreeEdge[];
  /** The walk around the tree with repeats (mst method). */
  walk?: string[];
  /** Held-Karp's table (exact method, small n). */
  table?: HkTable;
  /** Held-Karp entries filled. */
  filled: number;
  /** 2-opt: pairs of edges looked at and swaps made; the tour's cost before 2-opt. */
  checks: number;
  swaps: number;
  before?: number;
  /** 2-opt: the two edges a-b and c-d being looked at. */
  pair?: [string, string, string, string];
  final?: boolean;
}

export interface TspExtra {
  run?: TspRun;
}

type S = TspState;
type X = TspExtra;
type Op = OpSpec<S, TspSettings, X>;
type TStep = Step<S, X>;

/** Seven cities where nearest neighbour and the tree walk both miss the optimum. */
export const START_TEXT = 'A(10,50) B(30,90) C(60,80) D(90,90) E(80,40) F(50,10) G(40,50)';

export function startState(): S {
  const r = readCities(START_TEXT);
  if (r instanceof Error) throw r;
  return r;
}

export function init(): S {
  return startState();
}

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });

/** Ids of panel cells (see view.ts). */
export const tableId = (row: string, col: string) => `hk-${row}-${col}`;
export const tourCellId = (v: string) => `tour-${v}`;

export const methodName: Record<TspMethod, string> = {
  mst: 'The tree walk (APPROX-TSP-TOUR)',
  nearest: 'Nearest neighbour',
  exact: 'Held-Karp',
};

// ---------------------------------------------------------------------------------------------
// The algorithms without steps. Tests, practice and the optimum use these.

/** Held-Karp: the optimum and an optimal tour (ties to the earlier city). */
export function heldKarp(g: Graph): { cost: number; tour: string[] } {
  const d = distances(g);
  const [s, ...rest] = g.vertices;
  if (s === undefined) return { cost: 0, tour: [] };
  const m = rest.length;
  if (m === 0) return { cost: 0, tour: [s] };
  const full = (1 << m) - 1;
  const C: number[][] = Array.from({ length: 1 << m }, () => Array<number>(m).fill(Infinity));
  const P: number[][] = Array.from({ length: 1 << m }, () => Array<number>(m).fill(-1));
  for (let j = 0; j < m; j++) C[1 << j]![j] = d(s, rest[j]!);
  for (let mask = 1; mask <= full; mask++) {
    if ((mask & (mask - 1)) === 0) continue;
    for (let j = 0; j < m; j++) {
      if (!(mask & (1 << j))) continue;
      const prev = mask ^ (1 << j);
      for (let k = 0; k < m; k++) {
        if (!(prev & (1 << k))) continue;
        const c = C[prev]![k]! + d(rest[k]!, rest[j]!);
        if (c < C[mask]![j]!) {
          C[mask]![j] = c;
          P[mask]![j] = k;
        }
      }
    }
  }
  let best = 0;
  for (let j = 1; j < m; j++)
    if (C[full]![j]! + d(rest[j]!, s) < C[full]![best]! + d(rest[best]!, s)) best = j;
  const cost = C[full]![best]! + d(rest[best]!, s);
  const path: string[] = [];
  let mask = full;
  let j = best;
  while (j >= 0) {
    path.unshift(rest[j]!);
    const k = P[mask]![j]!;
    mask ^= 1 << j;
    j = k;
  }
  return { cost, tour: [s, ...path] };
}

export function nearestTour(g: Graph): string[] {
  const d = distances(g);
  const [s] = g.vertices;
  if (s === undefined) return [];
  const tour = [s];
  const left = new Set(g.vertices.slice(1));
  while (left.size) {
    const at = tour.at(-1)!;
    let next: string | null = null;
    for (const v of g.vertices)
      if (left.has(v) && (next === null || d(at, v) < d(at, next))) next = v;
    tour.push(next!);
    left.delete(next!);
  }
  return tour;
}

export function mstOf(g: Graph): TreeEdge[] {
  const d = distances(g);
  return arrayPrim(g.vertices, (u, v) => d(u, v)).edges;
}

/** The walk around a tree from its root: each vertex, and the vertex again after each child. */
export function treeWalk(root: string, tree: TreeEdge[]): string[] {
  const kids = (v: string) =>
    tree
      .filter((e) => e.parent === v)
      .map((e) => e.child)
      .sort(compareNames);
  const walk: string[] = [];
  const go = (v: string) => {
    walk.push(v);
    for (const c of kids(v)) {
      go(c);
      walk.push(v);
    }
  };
  go(root);
  return walk;
}

export function mstTour(g: Graph): string[] {
  const [s] = g.vertices;
  if (s === undefined) return [];
  return [...new Set(treeWalk(s, mstOf(g)))];
}

/** One 2-opt move: the first pair (i, j) whose swap shortens the tour, or null. */
export function firstImprovement(g: Graph, t: string[]): [number, number] | null {
  const d = distances(g);
  const n = t.length;
  for (let i = 0; i + 2 < n; i++)
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const a = t[i]!;
      const b = t[i + 1]!;
      const c = t[j]!;
      const e = t[(j + 1) % n]!;
      if (d(a, c) + d(b, e) < d(a, b) + d(c, e)) return [i, j];
    }
  return null;
}

export const reverseBetween = (t: string[], i: number, j: number): string[] => [
  ...t.slice(0, i + 1),
  ...t.slice(i + 1, j + 1).reverse(),
  ...t.slice(j + 1),
];

export function twoOpt(g: Graph, start: string[]): string[] {
  let t = start;
  for (let m = firstImprovement(g, t); m; m = firstImprovement(g, t))
    t = reverseBetween(t, m[0], m[1]);
  return t;
}

/** The tour a method finds, without steps. */
export function solve(g: Graph, method: TspMethod, improve: boolean): string[] {
  if (method === 'exact') return heldKarp(g).tour;
  const t = method === 'nearest' ? nearestTour(g) : mstTour(g);
  return improve ? twoOpt(g, t) : t;
}

// ---------------------------------------------------------------------------------------------
// Words

export const tourText = (t: string[], closed = true): string =>
  t.length === 0 ? 'none' : [...t, ...(closed && t.length > 1 ? [t[0]!] : [])].join(' → ');

const setName = (xs: string[]) => (xs.length ? xs.join('') : '∅');

function verdict(cost: number, opt: number): string {
  if (cost === opt) return `That is the optimum: ratio 1.`;
  return `The optimum is ${opt}, so this tour is ${cost - opt} longer: ratio ${ratioText(cost, opt)}.`;
}

function runVars(g: Graph, r: TspRun): Record<string, Scalar> {
  const vars: Record<string, Scalar> = {
    n: g.vertices.length,
    cost: r.cost,
    optimum: r.opt,
    ratio: r.closed ? ratioText(r.cost, r.opt) : '–',
  };
  if (r.method === 'exact') vars.entries = r.filled;
  if (r.method === 'mst') vars.MST = r.tree ? r.tree.reduce((a, e) => a + e.w, 0) : 0;
  if (r.method !== 'exact' && r.before !== undefined) {
    vars.checks = r.checks;
    vars.swaps = r.swaps;
  }
  return vars;
}

function clone(r: TspRun): TspRun {
  return {
    ...r,
    tour: [...r.tour],
    tree: r.tree?.map((e) => ({ ...e })),
    walk: r.walk && [...r.walk],
    table: r.table && { ...r.table, cells: { ...r.table.cells } },
    pair: r.pair && [...r.pair],
  };
}

// ---------------------------------------------------------------------------------------------
// The run

const run: Op = {
  label: 'Find a tour',
  arity: 0,
  *run(s, _args, { settings }) {
    const g = s.graph;
    const d = distances(g);
    const method = settings.method;
    const improve = settings.improve && method !== 'exact';
    const best = heldKarp(g);
    const r: TspRun = {
      method,
      tour: [],
      closed: false,
      cost: 0,
      opt: best.cost,
      optTour: best.tour,
      filled: 0,
      checks: 0,
      swaps: 0,
    };
    const step = (say: string, lines: string[], level: 1 | 2 | 3, marks: Mark[] = []): TStep => ({
      state: s,
      marks,
      say,
      lines,
      level,
      vars: runVars(g, r),
      extra: { run: clone(r) },
    });
    const edgeMarks = (u: string, v: string, role: Mark['role']) => [
      mark(edgeId(edgeKey(g, u, v)), role),
      mark(weightId(edgeKey(g, u, v)), role),
    ];
    const n = g.vertices.length;
    const start = g.vertices[0]!;

    if (n <= 2) {
      r.tour = [...g.vertices];
      r.closed = true;
      r.cost = tourCost(g, r.tour);
      r.final = true;
      yield step(
        n === 1
          ? `There is only one city, ${start}, so the tour is just ${start}: length 0. Load more cities to have something to choose.`
          : `With two cities there is only one tour: ${tourText(r.tour)}, length ${r.cost}. Load more cities to have something to choose.`,
        ['sig'],
        1,
      );
      return s;
    }

    if (method === 'exact') yield* heldKarpSteps(g, r, step);
    else if (method === 'nearest') {
      r.tour = [start];
      r.at = start;
      yield step(
        `Nearest neighbour starts at ${start}. Each move goes to the closest city not visited yet.`,
        ['nn.start'],
        2,
        [mark(vertexId(start), 'active')],
      );
      while (r.tour.length < n) {
        const at = r.tour.at(-1)!;
        const left = g.vertices.filter((v) => !r.tour.includes(v));
        let next = left[0]!;
        for (const v of left) if (d(at, v) < d(at, next)) next = v;
        r.checks += left.length;
        const others = left.filter((v) => v !== next);
        const tie = others.filter((v) => d(at, v) === d(at, next));
        r.tour.push(next);
        r.cost += d(at, next);
        r.at = next;
        yield step(
          `From ${at}, the closest city not visited yet is ${next} (${d(at, next)}).${
            others.length ? ` The others: ${others.map((v) => `${v} ${d(at, v)}`).join(', ')}.` : ''
          }${tie.length ? ` ${listWords([next, ...tie])} tie; ${next} comes first in name order.` : ''} Path so far: ${r.cost}.`,
          ['nn.while', 'nn.pick', 'nn.go'],
          2,
          [
            mark(vertexId(at), 'compare'),
            mark(vertexId(next), 'active'),
            ...edgeMarks(at, next, 'new'),
          ],
        );
      }
      const last = r.tour.at(-1)!;
      r.closed = true;
      r.cost = tourCost(g, r.tour);
      r.at = start;
      yield step(
        `Every city is visited, so go home from ${last} to ${start} (${d(last, start)}). The tour: ${tourText(r.tour)}, length ${r.cost}. Nearest neighbour never looks ahead: that last edge home can be long.`,
        ['nn.home'],
        2,
        [mark(vertexId(start), 'active'), ...edgeMarks(last, start, 'new')],
      );
    } else {
      yield* treeSteps(g, r, step, edgeMarks);
    }

    if (improve) yield* twoOptSteps(g, r, step, edgeMarks);

    r.at = undefined;
    r.pair = undefined;
    r.final = true;
    const note =
      method === 'mst'
        ? triangleBreak(g)
          ? ` These distances break the triangle inequality, so the factor-2 guarantee does not apply.`
          : ` The guarantee says at most 2 × ${r.opt} = ${2 * r.opt}.`
        : '';
    const gained =
      improve && r.before !== undefined
        ? ` 2-opt took it from ${r.before} to ${r.cost} with ${plural(r.swaps, 'swap')}.`
        : '';
    yield step(
      `${methodName[method]}${improve ? ' plus 2-opt' : ''} found ${tourText(r.tour)}, length ${r.cost}.${gained} ${verdict(r.cost, r.opt)}${note}`,
      method === 'exact'
        ? ['hk.tour']
        : improve
          ? ['opt.done']
          : [method === 'mst' ? 'mst.tour' : 'nn.home'],
      1,
      r.tour.map((v) => mark(tourCellId(v), 'done')),
    );
    return s;
  },
};

type StepFn = (say: string, lines: string[], level: 1 | 2 | 3, marks?: Mark[]) => TStep;
type EdgeMarks = (u: string, v: string, role: Mark['role']) => Mark[];

function* treeSteps(g: Graph, r: TspRun, step: StepFn, edgeMarks: EdgeMarks) {
  const start = g.vertices[0]!;
  const tree = mstOf(g);
  r.tree = [];
  r.at = start;
  yield step(
    `Step 1: build a minimum spanning tree from ${start} with Prim's algorithm. A tour minus any one edge is a spanning tree, so the tree weighs no more than the best tour.`,
    ['mst.sig', 'mst.tree'],
    2,
    [mark(vertexId(start), 'active')],
  );
  for (const e of tree) {
    r.tree.push(e);
    r.at = e.child;
    const total = r.tree.reduce((a, x) => a + x.w, 0);
    yield step(
      `The lightest edge from the tree to a city outside it is ${e.parent}-${e.child} (${e.w}). Add it. Tree weight: ${total}.`,
      ['mst.tree'],
      3,
      [mark(vertexId(e.child), 'active'), ...edgeMarks(e.parent, e.child, 'new')],
    );
  }
  const w = tree.reduce((a, x) => a + x.w, 0);
  const walk = treeWalk(start, tree);
  r.walk = [];
  r.at = start;
  yield step(
    `The tree weighs ${w}. Step 2: walk around it from ${start}, children in name order: ${walk.join(' ')}. That walk uses every tree edge twice, so it costs 2 × ${w} = ${2 * w}.`,
    ['mst.walk'],
    2,
    [mark(vertexId(start), 'active')],
  );
  r.tour = [];
  for (const v of walk) {
    r.walk.push(v);
    if (r.tour.includes(v)) continue;
    const prev = r.tour.at(-1);
    r.tour.push(v);
    r.at = v;
    if (prev === undefined) {
      yield step(`The tour starts at ${v}, the root.`, ['mst.list'], 3, [
        mark(vertexId(v), 'active'),
      ]);
      continue;
    }
    r.cost += distances(g)(prev, v);
    const back = r.walk.slice(r.walk.lastIndexOf(prev) + 1, -1);
    yield step(
      back.length
        ? `The walk goes back through ${back.join(', ')} to reach ${v}. ${back.length === 1 ? 'That city is' : 'Those cities are'} visited already, so the tour skips ${back.length === 1 ? 'it' : 'them'} and goes straight from ${prev} to ${v} (${distances(g)(prev, v)}): a shortcut, no longer than the walk, by the triangle inequality.`
        : `The walk goes from ${prev} down to ${v}, a tree edge (${distances(g)(prev, v)}). ${v} is new, so it joins the tour.`,
      ['mst.list'],
      2,
      [mark(vertexId(v), 'active'), ...edgeMarks(prev, v, 'new')],
    );
  }
  const last = r.tour.at(-1)!;
  r.closed = true;
  r.cost = tourCost(g, r.tour);
  r.at = start;
  yield step(
    `Every city is on the list, in the order the walk first met it: a preorder walk of the tree. Go home from ${last} to ${start}. The tour: ${tourText(r.tour)}, length ${r.cost} ≤ ${2 * w}, twice the tree.`,
    ['mst.tour'],
    2,
    [mark(vertexId(start), 'active'), ...edgeMarks(last, start, 'new')],
  );
}

function* heldKarpSteps(g: Graph, r: TspRun, step: StepFn) {
  const d = distances(g);
  const [s, ...rest] = g.vertices as [string, ...string[]];
  const m = rest.length;
  const show = g.vertices.length <= TABLE_MAX;
  const subsets = subsetsBySize(rest.map((_, i) => i)).filter((x) => x.length > 0);
  const maskOf = (xs: number[]) => xs.reduce((a, i) => a | (1 << i), 0);
  const names = (mask: number) => rest.filter((_, i) => mask & (1 << i));
  const C = new Map<string, number>();
  const P = new Map<string, number>();
  const at = (mask: number, j: number) => `${mask}|${j}`;
  if (show) {
    const cols = subsets.map((x) => setName(x.map((i) => rest[i]!)));
    const cells: Record<string, string> = {};
    for (const x of subsets)
      for (let j = 0; j < m; j++)
        cells[`${rest[j]}|${setName(x.map((i) => rest[i]!))}`] = x.includes(j) ? '' : '–';
    r.table = { cols, rows: [...rest], cells };
  }
  const put = (mask: number, j: number, c: number) => {
    C.set(at(mask, j), c);
    r.filled++;
    if (r.table) r.table.cells[`${rest[j]}|${setName(names(mask))}`] = String(c);
  };
  /** The best path for an entry: start, then the cities of mask, ending at j. */
  const pathOf = (mask: number, j: number): string[] => {
    const out: string[] = [];
    let k = j;
    let msk = mask;
    while (k >= 0) {
      out.unshift(rest[k]!);
      const p = P.get(at(msk, k)) ?? -1;
      msk ^= 1 << k;
      k = p;
    }
    return [s, ...out];
  };

  r.at = s;
  yield step(
    `Held-Karp fixes ${s} as the start. C(S, j) is the length of the shortest path that leaves ${s}, visits every city in the set S once, and ends at j in S. ${
      show
        ? `The table has a column per set S and a row per end city j.`
        : `With ${g.vertices.length} cities the table has ${(2 ** m - 1) * m} slots (${2 ** m - 1} sets × ${m} ends), too many to draw, so the steps go one set size at a time.`
    }`,
    ['hk.sig'],
    2,
    [mark(vertexId(s), 'active')],
  );
  for (let j = 0; j < m; j++) put(1 << j, j, d(s, rest[j]!));
  yield step(
    `Sets of one city: the path goes straight from ${s}, so C(${rest[0]}, ${rest[0]}) = d(${s}, ${rest[0]}), and so on: ${rest.map((v) => `C(${v}, ${v}) = ${d(s, v)}`).join(', ')}.`,
    ['hk.base'],
    2,
    show ? rest.map((v) => mark(tableId(v, v), 'new')) : [],
  );
  for (let size = 2; size <= m; size++) {
    const ofSize = subsets.filter((x) => x.length === size);
    for (const x of ofSize) {
      const mask = maskOf(x);
      for (const j of x) {
        const prev = mask ^ (1 << j);
        let best = -1;
        let bestC = Infinity;
        const tries: string[] = [];
        for (const k of x) {
          if (k === j) continue;
          const c = C.get(at(prev, k))! + d(rest[k]!, rest[j]!);
          tries.push(`via ${rest[k]} ${C.get(at(prev, k))} + ${d(rest[k]!, rest[j]!)} = ${c}`);
          if (c < bestC) {
            bestC = c;
            best = k;
          }
        }
        P.set(at(mask, j), best);
        put(mask, j, bestC);
        if (!show) continue;
        const col = setName(names(mask));
        const from = setName(names(prev));
        r.tour = pathOf(mask, j);
        r.cost = bestC;
        r.at = rest[j];
        yield step(
          `C(${col}, ${rest[j]}): the path ends at ${rest[j]}, so just before it, it covered ${from} and ended at some k there. ${tries.join('; ')}. The smallest is ${bestC}, via ${rest[best]}: ${r.tour.join(' → ')}.`,
          ['hk.size', 'hk.set', 'hk.end', 'hk.min'],
          3,
          [
            mark(tableId(rest[j]!, col), 'new'),
            ...x.filter((k) => k !== j).map((k) => mark(tableId(rest[k]!, from), 'compare')),
            mark(vertexId(rest[j]!), 'active'),
          ],
        );
      }
    }
    r.tour = [];
    r.cost = 0;
    r.at = undefined;
    yield step(
      `All ${plural(ofSize.length, 'set')} of ${size} cities are done: ${ofSize.length * size} entries, each a minimum over ${size - 1} ${size - 1 === 1 ? 'choice' : 'choices'} of the city before the end. Each uses only entries for sets one smaller.`,
      ['hk.size'],
      2,
    );
  }
  const full = (1 << m) - 1;
  const col = setName(rest);
  const options = rest.map((v, j) => ({ v, j, c: C.get(at(full, j))! + d(v, s) }));
  let pick = options[0]!;
  for (const o of options) if (o.c < pick.c) pick = o;
  r.tour = pathOf(full, pick.j);
  r.closed = true;
  r.cost = pick.c;
  r.at = s;
  yield step(
    `Close the tour: the best tour is the smallest C(${col}, j) + d(j, ${s}). ${options.map((o) => `${o.v}: ${C.get(at(full, o.j))} + ${d(o.v, s)} = ${o.c}`).join('; ')}. The smallest is ${pick.c}, ending at ${pick.v}. Following the choices back gives ${tourText(r.tour)}.`,
    ['hk.close', 'hk.tour'],
    2,
    show ? rest.map((v) => mark(tableId(v, col), v === pick.v ? 'found' : 'compare')) : [],
  );
}

function* twoOptSteps(g: Graph, r: TspRun, step: StepFn, edgeMarks: EdgeMarks) {
  const d = distances(g);
  r.before = r.cost;
  yield step(
    `Now 2-opt. Take out two edges of the tour, a-b and c-d, and put in a-c and b-d instead: the piece between them runs backwards. Keep a swap when it shortens the tour; stop when no swap does.`,
    ['opt.sig'],
    2,
  );
  for (;;) {
    const t = r.tour;
    const n = t.length;
    let moved = false;
    for (let i = 0; i + 2 < n && !moved; i++)
      for (let j = i + 2; j < n && !moved; j++) {
        if (i === 0 && j === n - 1) continue;
        const a = t[i]!;
        const b = t[i + 1]!;
        const c = t[j]!;
        const e = t[(j + 1) % n]!;
        r.checks++;
        r.pair = [a, b, c, e];
        const old = d(a, b) + d(c, e);
        const now = d(a, c) + d(b, e);
        if (now < old) {
          r.tour = reverseBetween(t, i, j);
          r.cost = tourCost(g, r.tour);
          r.swaps++;
          r.pair = undefined;
          moved = true;
          yield step(
            `Swap ${a}-${b} and ${c}-${e} (${d(a, b)} + ${d(c, e)} = ${old}) for ${a}-${c} and ${b}-${e} (${d(a, c)} + ${d(b, e)} = ${now}): ${old - now} shorter. ${b} to ${c} now runs backwards. Tour: ${tourText(r.tour)}, length ${r.cost}.`,
            ['opt.loop', 'opt.pair', 'opt.if', 'opt.swap'],
            2,
            [...edgeMarks(a, c, 'new'), ...edgeMarks(b, e, 'new')],
          );
        } else {
          yield step(
            `Try ${a}-${b} and ${c}-${e} (${old}) against ${a}-${c} and ${b}-${e} (${now}): ${now === old ? 'no shorter' : 'longer'}, keep the tour.`,
            ['opt.pair', 'opt.if'],
            3,
            [...edgeMarks(a, b, 'compare'), ...edgeMarks(c, e, 'compare')],
          );
        }
      }
    if (!moved) break;
  }
  r.pair = undefined;
  yield step(
    `No swap of two edges shortens the tour any more: it is 2-optimal, length ${r.cost}. That is a local optimum, not always the best tour.`,
    ['opt.loop', 'opt.done'],
    2,
  );
}

// ---------------------------------------------------------------------------------------------
// Loading cities

const load: Op = {
  label: 'Load',
  arity: 1,
  *run(s, [arg]) {
    const text = String(arg ?? '');
    const r = readCities(text);
    if (r instanceof Error) {
      yield {
        state: s,
        marks: [],
        say: `Nothing loaded. ${r.message} The cities stay as they were.`,
        lines: [],
        level: 1,
        vars: { n: s.graph.vertices.length },
      } satisfies TStep;
      return s;
    }
    const n = r.graph.vertices.length;
    const how = r.pts
      ? `${plural(n, 'city', 'cities')} as points; each distance is the straight line, rounded up`
      : `${plural(n, 'city', 'cities')} from ${FORMAT_NAMES[readGraphFormat(text)]}`;
    const tri = triangleBreak(r.graph);
    const warn = tri
      ? ` Note: ${tri[0]}-${tri[2]} (${distances(r.graph)(tri[0], tri[2])}) is longer than ${tri[0]}-${tri[1]}-${tri[2]} (${distances(r.graph)(tri[0], tri[1]) + distances(r.graph)(tri[1], tri[2])}), so the triangle inequality fails here.`
      : '';
    yield {
      state: r,
      marks: [],
      say: `Loaded ${how}. Press Find a tour.${warn}`,
      lines: [],
      level: 1,
      vars: { n },
    } satisfies TStep;
    return r;
  },
};

function readGraphFormat(text: string) {
  const r = readGraph(text);
  return r instanceof Error ? 'edges' : r.format;
}

export const ops = { load, run };

/** The input field takes cities as points or a complete graph. */
export function parseCities(token: string): Value | Error {
  const r = readCities(token);
  return r instanceof Error ? r : token.trim();
}

// ---------------------------------------------------------------------------------------------
// Pseudocode

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

const TWO_OPT = [
  L('opt.sig', 0, '2-OPT(H)', 'Improve tour H by swapping pairs of edges:'),
  L('opt.loop', 1, 'repeat until no swap helps', 'Keep going until no swap helps.'),
  L('opt.pair', 2, 'for edges (a, b), (c, d) of H', 'For every two edges a-b and c-d of the tour,'),
  L('opt.if', 3, 'if w(a,c) + w(b,d) < w(a,b) + w(c,d)', 'if a-c plus b-d is shorter,'),
  L('opt.swap', 4, 'reverse H from b to c', 'swap them in: b to c runs backwards.'),
  L('opt.done', 1, 'return H', 'Return the improved tour.'),
];

export function pseudocode(settings: TspSettings): PseudoBlock[] {
  const lines =
    settings.method === 'exact'
      ? [
          L('sig', 0, 'HELD-KARP(G, d)', 'Find the shortest tour exactly:'),
          L(
            'hk.sig',
            1,
            's = G.V[1]; C(S, j) = ∞',
            'Start at s; C(S, j) is the best path s ⇝ j through S.',
          ),
          L(
            'hk.base',
            1,
            'for j ≠ s: C({j}, j) = d(s, j)',
            'A set of one city: go straight there.',
          ),
          L('hk.size', 1, 'for size = 2 to n − 1', 'For bigger and bigger sets,'),
          L('hk.set', 2, 'for each S ⊆ V − {s}, |S| = size', 'for each set S of that size'),
          L('hk.end', 3, 'for each j ∈ S', 'and each city j in S to end at,'),
          L(
            'hk.min',
            4,
            'C(S, j) = min C(S−{j}, k) + d(k, j)',
            'take the best city k to come from.',
          ),
          L(
            'hk.close',
            1,
            'best = min C(V−{s}, j) + d(j, s)',
            'Then add the trip home and take the best,',
          ),
          L(
            'hk.tour',
            1,
            'return the tour, following the choices',
            'and follow the choices back to the tour.',
          ),
        ]
      : settings.method === 'nearest'
        ? [
            L('sig', 0, 'NEAREST-NEIGHBOUR(G, d)', 'Build a tour greedily:'),
            L('nn.start', 1, 'H = ⟨s⟩, s = G.V[1]', 'Start at the first city.'),
            L('nn.while', 1, 'while some city is unvisited', 'While some city is not visited,'),
            L('nn.pick', 2, 'v = the unvisited city nearest to last(H)', 'find the closest one'),
            L('nn.go', 2, 'append v to H', 'and go there.'),
            L('nn.home', 1, 'return H (then back to s)', 'Then go home.'),
            ...(settings.improve ? TWO_OPT : []),
          ]
        : [
            L('sig', 0, 'APPROX-TSP-TOUR(G, d)', 'Build a tour from a spanning tree:'),
            L('mst.sig', 1, 'r = G.V[1]', 'Start at the first city.'),
            L('mst.tree', 1, 'T = MST-PRIM(G, d, r)', 'Build a minimum spanning tree from it.'),
            L(
              'mst.walk',
              1,
              'walk T from r in preorder',
              'Walk around the tree, children in name order,',
            ),
            L(
              'mst.list',
              1,
              'H = cities in order first met',
              'listing each city the first time you meet it.',
            ),
            L('mst.tour', 1, 'return H (then back to r)', 'That list, then home, is the tour.'),
            ...(settings.improve ? TWO_OPT : []),
          ];
  return [{ op: 'run', lines }];
}

export function initialSay(s: S): string {
  return `${describe(s)} Press Find a tour: the method in the options builds a tour, and the page sets its length against the best tour.`;
}

export function initialVars(s: S): Record<string, Scalar> {
  return { n: s.graph.vertices.length };
}

export function describe(s: S): string {
  const n = s.graph.vertices.length;
  if (s.pts) return `${plural(n, 'city', 'cities')}: ${citiesText(s.pts).split(' ').join(', ')}.`;
  return `${plural(n, 'city', 'cities')}, ${s.graph.vertices.join(', ')}, with distances ${s.graph.edges.map((e) => `${e.u}-${e.v} ${e.w}`).join(', ') || 'none'}.`;
}

/** The scene label: where a run stands. */
export function describeRun(r: TspRun): string {
  const what = r.closed
    ? `Tour ${tourText(r.tour)}, length ${r.cost}`
    : r.tour.length
      ? `Path ${tourText(r.tour, false)}, length ${r.cost}`
      : 'No tour yet';
  return `${methodName[r.method]}. ${what}. Optimum ${r.opt}.${r.closed ? ` Ratio ${ratioText(r.cost, r.opt)}.` : ''}`;
}
