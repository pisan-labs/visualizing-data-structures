/**
 * Bidirectional search: breadth-first search from s and from t at the same time, until the
 * two searches meet. Each turn expands a whole layer of one side (every vertex of its frontier).
 * The meeting is checked when a vertex is discovered, so the first meeting is a shortest path:
 * every vertex either side has seen was discovered at its true distance, and a shorter path
 * would have met in an earlier turn (the property test checks this against plain BFS).
 *
 * In a directed graph the search from t walks arcs backwards (in-neighbours).
 *
 * Settings
 *   side   'alternate'  the s side, then the t side, then the s side, ...
 *          'smaller'    the side whose frontier is smaller (ties: the s side)
 *   layout the drawing only
 *
 * `run s t` searches. The vars compare the vertices expanded (neighbours scanned) with what a
 * plain BFS from s expands before it discovers t.
 *
 * The state is just the graph; a run's bookkeeping travels in the steps' `extra`.
 */
import type { Mark, OpSpec, PseudoBlock, Scalar, Step } from '../../engine/types';
import type { GraphTemplate } from '../../layouts/graph';
import { edgeId, vertexId } from '../../layouts/graph';
import {
  describeGraph,
  findEdge,
  inNeighbours,
  keyOf,
  listWords,
  neighbours,
  plural,
  type Graph,
} from '../_graph/graph';
import { graphVars, loadOp, startGraph, vertexArg, type GraphState } from '../_graph/kit';

export type BiState = GraphState;
export type Side = 'alternate' | 'smaller';
export type Dir = 's' | 't';

export interface BiSettings {
  [key: string]: Scalar;
  side: Side;
  layout: GraphTemplate;
}

export const defaults: BiSettings = { side: 'alternate', layout: 'force' };

export interface BiRun {
  s: string;
  t: string;
  /** Distance from s (forward) and to t (backward); missing when not seen. */
  ds: Record<string, number>;
  dt: Record<string, number>;
  ps: Record<string, string>;
  pt: Record<string, string>;
  /** The frontiers: the last layer each side found, in the order found. */
  Fs: string[];
  Ft: string[];
  /** The side expanding now. */
  dir?: Dir;
  u?: string;
  v?: string;
  /** The best meeting vertex so far, and the length through it. */
  meet?: string;
  best?: number;
  /** Vertices expanded by this search, and by a plain BFS from s that stops at t. */
  expanded: number;
  plain: number;
  rounds: number;
  /** The path at the end (null: none). */
  path?: string[] | null;
  final?: boolean;
}

export interface BiExtra {
  run?: BiRun;
}

type S = BiState;
type X = BiExtra;
type Op = OpSpec<S, BiSettings, X>;
type PStep = Step<S, X>;

export function init(): S {
  return { graph: startGraph() };
}

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });
export const frontierId = (d: Dir, v: string) => `F${d}-${v}`;
export const cellId = (d: Dir, v: string) => `tbl-d${d}-${v}`;

/** The key of the stored edge between u and v (u -> v when directed). */
export const arcKey = (g: Graph, u: string, v: string) => keyOf(findEdge(g, u, v)!);

const step1 = (g: Graph, d: Dir, u: string) =>
  d === 's' ? neighbours(g, u) : g.directed ? inNeighbours(g, u) : neighbours(g, u);

/** Vertices a plain BFS from s expands before it discovers t (all it reaches if never). */
export function plainBfs(g: Graph, s: string, t: string): number {
  if (s === t) return 0;
  const seen = new Set([s]);
  const queue = [s];
  let n = 0;
  while (queue.length) {
    const u = queue.shift()!;
    n++;
    for (const v of neighbours(g, u)) {
      if (v === t) return n;
      if (!seen.has(v)) {
        seen.add(v);
        queue.push(v);
      }
    }
  }
  return n;
}

/** The path s .. meet .. t from the two parent maps. */
export function joinPath(r: Pick<BiRun, 'ps' | 'pt'>, meet: string): string[] {
  const left = [meet];
  while (r.ps[left[0]!] !== undefined) left.unshift(r.ps[left[0]!]!);
  const right: string[] = [];
  let x = meet;
  while (r.pt[x] !== undefined) {
    x = r.pt[x]!;
    right.push(x);
  }
  return [...left, ...right];
}

function clone(r: BiRun): BiRun {
  return {
    ...r,
    ds: { ...r.ds },
    dt: { ...r.dt },
    ps: { ...r.ps },
    pt: { ...r.pt },
    Fs: [...r.Fs],
    Ft: [...r.Ft],
    path: r.path ? [...r.path] : r.path,
  };
}

function runVars(g: Graph, r: BiRun): Record<string, Scalar> {
  return {
    ...graphVars(g),
    s: r.s,
    t: r.t,
    side: r.dir ? `from ${r.dir}` : '–',
    u: r.u ?? '–',
    '|Fs|': r.Fs.length,
    '|Ft|': r.Ft.length,
    expanded: r.expanded,
    'plain BFS': r.plain,
    path: r.path ? r.path.length - 1 : r.path === null ? 'none' : '–',
  };
}

const run: Op = {
  label: 'Search',
  arity: 2,
  *run(s0, [a, b], { settings }) {
    const g = s0.graph;
    const bad = (say: string): PStep => ({
      state: s0,
      marks: [],
      say,
      lines: ['sig'],
      level: 1,
      vars: graphVars(g),
    });
    const A = vertexArg(g, a);
    if ('error' in A) {
      yield bad(`No search. ${A.error}`);
      return s0;
    }
    const B = vertexArg(g, b);
    if ('error' in B) {
      yield bad(`No search. ${B.error}`);
      return s0;
    }
    const s = A.v;
    const t = B.v;
    const r: BiRun = {
      s,
      t,
      ds: { [s]: 0 },
      dt: { [t]: 0 },
      ps: {},
      pt: {},
      Fs: [s],
      Ft: [t],
      expanded: 0,
      plain: plainBfs(g, s, t),
      rounds: 0,
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
    if (s === t) {
      r.path = [s];
      r.final = true;
      yield step(
        `${s} is both the start and the target: the path is just ${s}, with 0 edges.`,
        ['init', 'same'],
        1,
        [mark(vertexId(s), 'found')],
      );
      return s0;
    }
    const back = g.directed ? ' In a directed graph the search from t follows arcs backwards.' : '';
    yield step(
      `Search from both ends: one BFS from ${s}, one from ${t}. Each side's frontier is the last layer it found, and the search stops when a layer reaches a vertex the other side has seen.${back}`,
      ['init'],
      2,
      [mark(vertexId(s), 'visit'), mark(vertexId(t), 'visit')],
    );

    let turn: Dir = 't';
    while (r.Fs.length && r.Ft.length) {
      const d: Dir =
        settings.side === 'smaller'
          ? r.Ft.length < r.Fs.length
            ? 't'
            : 's'
          : (turn = turn === 's' ? 't' : 's');
      const o: Dir = d === 's' ? 't' : 's';
      r.dir = d;
      r.rounds++;
      const mine = d === 's' ? r.ds : r.dt;
      const theirs = d === 's' ? r.dt : r.ds;
      const par = d === 's' ? r.ps : r.pt;
      const layer = d === 's' ? r.Fs : r.Ft;
      const why =
        settings.side === 'smaller'
          ? ` Its frontier has ${layer.length}, the other ${(o === 's' ? r.Fs : r.Ft).length}: the smaller one goes.`
          : '';
      yield step(
        `Expand the ${d} side's layer: ${listWords(layer)}, at distance ${mine[layer[0]!]} ${d === 's' ? `from ${s}` : `to ${t}`}.${why}`,
        ['while', 'pick'],
        2,
        layer.map((v) => mark(frontierId(d, v), 'active')),
      );
      const next: string[] = [];
      layers: for (const u of layer) {
        r.u = u;
        r.v = undefined;
        r.expanded++;
        for (const v of step1(g, d, u)) {
          r.v = v;
          const e = d === 's' ? arcKey(g, u, v) : arcKey(g, v, u);
          const em = [mark(edgeId(e), 'active')];
          if (mine[v] !== undefined) {
            yield step(
              `${u}: ${v} is already seen from ${d === 's' ? s : t}. Skip it.`,
              ['for', 'seen'],
              3,
              [mark(vertexId(u), 'active'), mark(vertexId(v), 'compare'), ...em],
            );
            continue;
          }
          mine[v] = mine[u]! + 1;
          par[v] = u;
          next.push(v);
          if (theirs[v] !== undefined) {
            r.meet = v;
            r.best = mine[v]! + theirs[v]!;
            yield step(
              `${u} finds ${v}, and the ${o} side has seen ${v} too: the searches meet. A path through ${v} has ${mine[v]} + ${theirs[v]} = ${r.best} edges.`,
              ['for', 'mark', 'meet'],
              2,
              [mark(vertexId(u), 'active'), mark(vertexId(v), 'found'), ...em],
            );
            break layers;
          } else {
            yield step(
              `${u} finds ${v}: distance ${mine[v]} ${d === 's' ? `from ${s}` : `to ${t}`}. ${v} joins the next layer.`,
              ['for', 'mark'],
              3,
              [mark(vertexId(u), 'active'), mark(vertexId(v), 'visit'), ...em],
            );
          }
        }
      }
      r.u = undefined;
      r.v = undefined;
      if (d === 's') r.Fs = next;
      else r.Ft = next;
      if (r.meet !== undefined) break;
      yield step(
        next.length
          ? `The ${d} side's new frontier: ${listWords(next)}. No meeting yet.`
          : `The ${d} side found nothing new: its frontier is empty.`,
        ['next'],
        3,
        next.map((v) => mark(frontierId(d, v), 'visit')),
      );
    }
    r.dir = undefined;
    r.final = true;
    if (r.meet === undefined) {
      r.path = null;
      const side = r.Fs.length ? t : s;
      yield step(
        `The search from ${side} ran out of vertices without meeting the other: there is no path from ${s} to ${t}. Expanded ${plural(r.expanded, 'vertex', 'vertices')}; a plain BFS from ${s} expands ${r.plain}.`,
        ['none'],
        1,
      );
      return s0;
    }
    r.path = joinPath(r, r.meet);
    const save =
      r.expanded < r.plain
        ? `, ${r.plain - r.expanded} fewer than`
        : r.expanded === r.plain
          ? ', the same as'
          : `, ${r.expanded - r.plain} more than`;
    yield step(
      `Shortest path: ${r.path.join(' → ')}, ${plural(r.path.length - 1, 'edge')}. Follow π from ${r.meet} back to ${s}, then from ${r.meet} on to ${t}. Expanded ${plural(r.expanded, 'vertex', 'vertices')}${save} a plain BFS from ${s} (${r.plain}).`,
      ['join'],
      1,
      [
        ...r.path.map((v) => mark(vertexId(v), 'found')),
        ...r.path.slice(1).map((v, i) => mark(edgeId(arcKey(g, r.path![i]!, v)), 'found')),
      ],
    );
    return s0;
  },
};

const load = loadOp<S, BiSettings, X>({
  make: (graph) => ({ graph }),
  ready: (g) =>
    `Type two vertices, such as ${g.vertices[0]} ${g.vertices.at(-1)}, and press Search to find a shortest path between them.`,
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

export function pseudocode(settings: BiSettings): PseudoBlock[] {
  const lines = [
    L('sig', 0, 'BIDIRECTIONAL-BFS(G, s, t)', 'Search from both ends:'),
    L('init', 1, 'Fs = [s]; Ft = [t]', 'each side starts at its own end.'),
    L('same', 1, 'if s == t: return [s]', 'If s is t, the path is just s.'),
    L('while', 1, 'while Fs ≠ ∅ and Ft ≠ ∅', 'While both sides have a frontier,'),
    settings.side === 'smaller'
      ? L('pick', 2, 'F = the smaller of Fs, Ft', 'expand the side with the smaller frontier.')
      : L('pick', 2, 'F = Fs, Ft in turn', 'expand the two sides in turn.'),
    L('for', 2, 'for each u ∈ F, v ∈ Adj[u]', 'For each edge out of the layer,'),
    L('seen', 3, 'if v seen by this side: skip', 'skip vertices this side has seen,'),
    L('mark', 3, 'v.d = u.d + 1; v.π = u', 'else record its distance and parent.'),
    L('meet', 3, 'if v seen by other side: met', 'If the other side saw it, the searches meet:'),
    L('join', 4, 'return s ⇝ v ⇝ t', 'join the two halves of the path.'),
    L('next', 2, 'F = the new layer', 'The new vertices are the next frontier.'),
    L('none', 1, 'return no path', 'A side ran dry: s cannot reach t.'),
  ];
  return [{ op: 'run', lines }];
}

export function initialSay(s: S): string {
  return `${describeGraph(s.graph).split('. ')[0]}. Type two vertices, such as A H, and press Search: BFS runs from both ends until they meet.`;
}

export const initialVars = (s: S) => graphVars(s.graph);

export const describe = (s: S): string => describeGraph(s.graph);

export function describeRun(r: BiRun): string {
  const seen = (m: Record<string, number>) =>
    Object.entries(m)
      .map(([v, d]) => `${v} ${d}`)
      .join(', ');
  const path = r.path ? ` Path: ${r.path.join(', ')}.` : r.path === null ? ' No path.' : '';
  return `Search from ${r.s} to ${r.t}. Seen from ${r.s}: ${seen(r.ds)}. Seen from ${r.t}: ${seen(r.dt)}.${path}`;
}

/** The code tabs' line: edges | path | vertices expanded (or "none | expanded"). */
export function runSummary(r: BiRun): string {
  return r.path
    ? `${r.path.length - 1} | ${r.path.join(' ')} | ${r.expanded}`
    : `none | ${r.expanded}`;
}
