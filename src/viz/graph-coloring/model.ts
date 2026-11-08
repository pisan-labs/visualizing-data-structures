/**
 * Greedy graph coloring. Take the vertices one at a time and give each the smallest color
 * (1, 2, 3, ...) that none of its colored neighbours has. The order decides how many colors
 * come out, so the order is the setting:
 *
 *   order  'given'    name order (the order the graph lists its vertices)
 *          'largest'  largest degree first, ties in name order (Welsh-Powell)
 *          'dsatur'   DSatur (Brélaz): next, the uncolored vertex whose neighbours already
 *                     use the most different colors (its saturation); ties go to the larger
 *                     degree, then name order
 *   layout the drawing only
 *
 * Coloring ignores edge directions: A>B and A-B both keep A and B apart.
 *
 * After the run the page compares the colors used with two bounds: a largest clique (found
 * exactly, the graphs are small) needs that many colors, and greedy never needs more than the
 * largest degree + 1. A graph with an edge and no odd cycle (bipartite) needs exactly 2.
 *
 * The state is just the graph; a run's bookkeeping travels in the steps' `extra`.
 */
import type { Mark, OpSpec, PseudoBlock, Scalar, Step } from '../../engine/types';
import type { GraphTemplate } from '../../layouts/graph';
import { edgeId, labelId, vertexId } from '../../layouts/graph';
import {
  compareNames,
  describeGraph,
  edgeKey,
  findEdge,
  keyOf,
  listWords,
  makeGraph,
  neighbours,
  plural,
  type Graph,
} from '../_graph/graph';
import { graphVars, loadOp, startGraph, type GraphState } from '../_graph/kit';

export type ColoringState = GraphState;
export type Order = 'given' | 'largest' | 'dsatur';

export interface ColoringSettings {
  [key: string]: Scalar;
  order: Order;
  layout: GraphTemplate;
}

export const defaults: ColoringSettings = { order: 'given', layout: 'force' };

export interface ColoringRun {
  order: Order;
  /** Color per vertex, from 1; 0 while uncolored. */
  color: Record<string, number>;
  /** The vertices in the order they were colored (for 'given' and 'largest', the plan). */
  plan: string[];
  /** How many have been colored. */
  done: number;
  /** The vertex being colored, and the neighbour being looked at. */
  u?: string;
  v?: string;
  /** Colors the current vertex's colored neighbours use. */
  used?: number[];
  /** Neighbour colors looked at. */
  checks: number;
  /** Colors used so far. */
  colors: number;
  /** Set at the end: a largest clique and the largest degree. */
  clique?: string[];
  maxDegree?: number;
  bipartite?: boolean;
  final?: boolean;
}

export interface ColoringExtra {
  run?: ColoringRun;
}

type S = ColoringState;
type X = ColoringExtra;
type Op = OpSpec<S, ColoringSettings, X>;
type PStep = Step<S, X>;

export function init(): S {
  return { graph: startGraph() };
}

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });

/** Panel ids (see view.ts). */
export const orderId = (v: string) => `ord-${v}`;
export const cellId = (row: 'c' | 'deg' | 'sat', v: string) => `tbl-${row}-${v}`;

// ---------------------------------------------------------------------------------------------
// Plain helpers (tests and practice use them too)

/** The graph with directions dropped: A>B and B>A become one edge A-B. */
export function undirected(g: Graph): Graph {
  if (!g.directed) return g;
  const seen = new Set<string>();
  const edges = g.edges.filter((e) => {
    const k = edgeKey({ ...g, directed: false }, e.u, e.v);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return makeGraph({ directed: false, weighted: false, vertices: g.vertices, edges });
}

/** The key of the stored edge between u and v, whichever way an arc points. */
export function edgeBetween(g: Graph, u: string, v: string): string {
  const e = findEdge(g, u, v) ?? findEdge(g, v, u)!;
  return keyOf(e);
}

export const degreeOf = (g: Graph, v: string) => neighbours(g, v).length;

/** The fixed orders: name order, or largest degree first (ties in name order). */
export function fixedOrder(g: Graph, order: Order): string[] {
  if (order !== 'largest') return [...g.vertices];
  return [...g.vertices].sort((a, b) => degreeOf(g, b) - degreeOf(g, a) || compareNames(a, b));
}

export function saturation(g: Graph, color: Record<string, number>, v: string): number {
  return new Set(
    neighbours(g, v)
      .map((w) => color[w]!)
      .filter((c) => c > 0),
  ).size;
}

/** DSatur's next vertex: most neighbour colors, then largest degree, then name order. */
export function dsaturNext(g: Graph, color: Record<string, number>): string | undefined {
  let best: string | undefined;
  for (const v of g.vertices) {
    if (color[v]) continue;
    if (best === undefined) {
      best = v;
      continue;
    }
    const ds = saturation(g, color, v) - saturation(g, color, best);
    if (ds > 0 || (ds === 0 && degreeOf(g, v) > degreeOf(g, best))) best = v;
  }
  return best;
}

/** The smallest color from 1 that is not in `used`. */
export function smallestFree(used: Iterable<number>): number {
  const set = new Set(used);
  let c = 1;
  while (set.has(c)) c++;
  return c;
}

/** A largest clique, by backtracking (graphs here have at most 16 vertices). */
export function largestClique(g: Graph): string[] {
  let best: string[] = g.vertices.length ? [g.vertices[0]!] : [];
  const adj = new Map(g.vertices.map((v) => [v, new Set(neighbours(g, v))]));
  const grow = (clique: string[], cands: string[]) => {
    if (clique.length > best.length) best = [...clique];
    if (clique.length + cands.length <= best.length) return;
    cands.forEach((v, i) => {
      grow(
        [...clique, v],
        cands.slice(i + 1).filter((w) => adj.get(v)!.has(w)),
      );
    });
  };
  grow([], [...g.vertices]);
  return best;
}

/** Two-colorable: no odd cycle. */
export function isBipartite(g: Graph): boolean {
  const side = new Map<string, number>();
  for (const s of g.vertices) {
    if (side.has(s)) continue;
    side.set(s, 0);
    const queue = [s];
    while (queue.length) {
      const u = queue.shift()!;
      for (const w of neighbours(g, u)) {
        if (!side.has(w)) {
          side.set(w, 1 - side.get(u)!);
          queue.push(w);
        } else if (side.get(w) === side.get(u)) return false;
      }
    }
  }
  return true;
}

/** Greedy coloring without steps: the color of each vertex and the order they were colored. */
export function colorPlain(g0: Graph, order: Order) {
  const g = undirected(g0);
  const color: Record<string, number> = Object.fromEntries(g.vertices.map((v) => [v, 0]));
  const seq: string[] = [];
  const plan = fixedOrder(g, order);
  for (let i = 0; i < g.vertices.length; i++) {
    const v = order === 'dsatur' ? dsaturNext(g, color)! : plan[i]!;
    color[v] = smallestFree(neighbours(g, v).map((w) => color[w]!));
    seq.push(v);
  }
  return { color, order: seq, colors: Math.max(0, ...Object.values(color)) };
}

function clone(r: ColoringRun): ColoringRun {
  return { ...r, color: { ...r.color }, plan: [...r.plan], used: r.used && [...r.used] };
}

function runVars(g: Graph, r: ColoringRun): Record<string, Scalar> {
  const vars: Record<string, Scalar> = {
    ...graphVars(g),
    v: r.u ?? '–',
    colored: r.done,
    colors: r.colors,
    checks: r.checks,
  };
  if (r.clique) vars.clique = r.clique.length;
  if (r.maxDegree !== undefined) vars['Δ + 1'] = r.maxDegree + 1;
  return vars;
}

const ORDER_WORDS: Record<Order, string> = {
  given: 'in name order',
  largest: 'largest degree first (Welsh-Powell)',
  dsatur: 'by DSatur: most neighbour colors first',
};

const run: Op = {
  label: 'Color',
  arity: 0,
  *run(s, _args, { settings }) {
    const g0 = s.graph;
    const g = undirected(g0);
    const order = settings.order;
    const r: ColoringRun = {
      order,
      color: Object.fromEntries(g.vertices.map((v) => [v, 0])),
      plan: order === 'dsatur' ? [] : fixedOrder(g, order),
      done: 0,
      checks: 0,
      colors: 0,
    };
    const step = (say: string, lines: string[], level: 1 | 2 | 3, marks: Mark[] = []): PStep => ({
      state: s,
      marks,
      say,
      lines,
      level,
      vars: runVars(g0, r),
      extra: { run: clone(r) },
    });
    const dir = g0.directed ? ' Coloring ignores directions: an arc keeps its two ends apart.' : '';
    if (g.vertices.length === 0) {
      r.final = true;
      yield step('The graph has no vertices, so there is nothing to color.', ['sig'], 1);
      return s;
    }
    const planText =
      order === 'dsatur'
        ? 'DSatur picks each next vertex as it goes: the one whose neighbours already use the most colors.'
        : `The order is ${r.plan.join(', ')}${order === 'largest' ? ': largest degree first, ties in name order' : ''}.`;
    yield step(
      `Greedy coloring, ${ORDER_WORDS[order]}. Each vertex gets the smallest color its colored neighbours do not use. ${planText}${dir}`,
      ['sig', 'order'],
      2,
      r.plan.length ? [mark(orderId(r.plan[0]!), 'visit')] : [],
    );

    for (let i = 0; i < g.vertices.length; i++) {
      let u: string;
      if (order === 'dsatur') {
        u = dsaturNext(g, r.color)!;
        r.plan.push(u);
        r.u = u;
        r.v = undefined;
        r.used = [];
        const sat = saturation(g, r.color, u);
        const rivals = g.vertices.filter(
          (w) => !r.color[w] && w !== u && saturation(g, r.color, w) === sat,
        );
        const tie = rivals.length
          ? ` ${listWords(rivals)} ${rivals.length === 1 ? 'has' : 'have'} that many too; ${u} wins on ${rivals.some((w) => degreeOf(g, w) === degreeOf(g, u)) ? 'degree, then name' : 'degree'} (degree ${degreeOf(g, u)}).`
          : '';
        yield step(
          `Next is ${u}: its neighbours use ${plural(sat, 'different color')}, the most of any uncolored vertex.${tie}`,
          ['for', 'pick'],
          2,
          [
            mark(vertexId(u), 'active'),
            mark(orderId(u), 'active'),
            mark(cellId('sat', u), 'active'),
          ],
        );
      } else {
        u = r.plan[i]!;
        r.u = u;
        r.v = undefined;
        r.used = [];
        yield step(`Next in the order: ${u}, with degree ${degreeOf(g, u)}.`, ['for'], 3, [
          mark(vertexId(u), 'active'),
          mark(orderId(u), 'active'),
        ]);
      }
      const used = new Set<number>();
      for (const v of neighbours(g, u)) {
        r.v = v;
        r.checks++;
        const c = r.color[v]!;
        if (c) used.add(c);
        r.used = [...used].sort((a, b) => a - b);
        yield step(
          c
            ? `${u}'s neighbour ${v} has color ${c}, so ${u} cannot have ${c}.`
            : `${u}'s neighbour ${v} has no color yet, so it rules nothing out.`,
          ['used'],
          3,
          [
            mark(vertexId(u), 'active'),
            mark(vertexId(v), c ? 'compare' : 'visit'),
            mark(edgeId(edgeBetween(g0, u, v)), 'compare'),
          ],
        );
      }
      r.v = undefined;
      const c = smallestFree(used);
      r.color[u] = c;
      r.done++;
      const fresh = c > r.colors;
      r.colors = Math.max(r.colors, c);
      const usedText = used.size
        ? `Its colored neighbours use ${listWords(r.used.map(String))}`
        : neighbours(g, u).length
          ? 'None of its neighbours has a color yet'
          : `${u} has no neighbours`;
      yield step(
        `${usedText}, so ${u} gets color ${c}, the smallest free one.${fresh ? ` That is a new color: ${plural(r.colors, 'color')} so far.` : ''}`,
        ['set'],
        2,
        [mark(vertexId(u), 'active'), mark(cellId('c', u), 'active'), mark(labelId(u), 'active')],
      );
    }
    r.u = undefined;
    r.used = undefined;
    r.clique = largestClique(g);
    r.maxDegree = Math.max(0, ...g.vertices.map((v) => degreeOf(g, v)));
    r.bipartite = isBipartite(g);
    r.final = true;
    yield step(finalWords(g, r), ['ret'], 1);
    return s;
  },
};

/** The verdict: colors used against the clique bound, Δ + 1, and the bipartite case. */
export function finalWords(g: Graph, r: ColoringRun): string {
  const k = r.colors;
  const q = r.clique ?? [];
  const parts = [
    `Done: ${plural(k, 'color')} for ${plural(g.vertices.length, 'vertex', 'vertices')}.`,
  ];
  if (r.bipartite && g.edges.length > 0) {
    parts.push(
      k === 2
        ? 'The graph has no odd cycle (it is bipartite), and 2 is the fewest any coloring can use. Greedy found it.'
        : `But the graph has no odd cycle (it is bipartite), so 2 colors are enough: this order cost ${k - 2} extra.`,
    );
  } else if (q.length > 1) {
    const exact = k === q.length;
    parts.push(
      `${listWords(q)} are all joined to each other (a clique), so any coloring needs at least ${q.length}. ${
        exact
          ? `Greedy used exactly ${k}, so this coloring is as good as it gets.`
          : `Greedy used ${k}. Maybe fewer would do, maybe not: the clique only proves ${q.length} is needed.`
      }`,
    );
  } else if (g.edges.length === 0) {
    parts.push('With no edges, one color is enough.');
  }
  parts.push(`Greedy never needs more than the largest degree + 1 = ${(r.maxDegree ?? 0) + 1}.`);
  return parts.join(' ');
}

const load = loadOp<S, ColoringSettings, X>({
  make: (graph) => ({ graph }),
  ready: (g) =>
    `Press Color to color it greedily.${g.directed ? ' Directions are ignored: coloring only cares which vertices are joined.' : ''}`,
});

export const ops = { load, run };

// ---------------------------------------------------------------------------------------------
// Pseudocode. Lines stay short for a phone.

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: ColoringSettings): PseudoBlock[] {
  const ds = settings.order === 'dsatur';
  const lines = [
    L('sig', 0, 'GREEDY-COLOR(G)', 'Color the vertices one at a time:'),
    settings.order === 'largest'
      ? L('order', 1, 'sort G.V by degree, largest first', 'put the busiest vertices first.')
      : ds
        ? L('order', 1, 'every v.color = 0', 'start with every vertex uncolored.')
        : L('order', 1, 'take G.V in the given order', 'take the vertices in the order given.'),
    ds
      ? L('for', 1, 'repeat |V| times', 'Until every vertex has a color,')
      : L('for', 1, 'for each v in that order', 'For each vertex v in that order,'),
    ...(ds
      ? [
          L(
            'pick',
            2,
            'v = uncolored, max saturation',
            'pick the uncolored vertex whose neighbours use the most colors.',
          ),
        ]
      : []),
    L('used', 2, 'used = {u.color : u ∈ Adj[v]}', "collect its neighbours' colors,"),
    L('set', 2, 'v.color = min{c ≥ 1 : c ∉ used}', 'and give v the smallest color not among them.'),
    L('ret', 1, 'return max v.color', 'The biggest color is how many were used.'),
  ];
  return [{ op: 'run', lines }];
}

export function initialSay(s: S): string {
  return `${describeGraph(s.graph).split('. ')[0]}. Press Color: each vertex in turn gets the smallest color its neighbours do not have.`;
}

export const initialVars = (s: S) => graphVars(s.graph);

export const describe = (s: S): string => describeGraph(s.graph);

export function describeRun(r: ColoringRun): string {
  const colored = r.plan
    .filter((v) => r.color[v])
    .map((v) => `${v} ${r.color[v]}`)
    .join(', ');
  return `Colors so far: ${colored || 'none'}. ${plural(r.colors, 'color')} used.`;
}

/** The code tabs' summary: colors used | color per vertex in name order. */
export function runSummary(g: Graph, r: ColoringRun): string {
  return `${r.colors} | ${g.vertices.map((v) => r.color[v]).join(' ')}`;
}
