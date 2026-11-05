/**
 * Topological sort by depth-first search, CLRS style: run DFS(G) and, as each vertex finishes,
 * insert it onto the front of a list L. When the search is done, L lists the vertices by
 * decreasing finish time, and every edge points from earlier in L to later.
 *
 * That holds only for a DAG. A back edge (u, v), to a vertex v that is still gray, closes a
 * cycle, and then no order works. Setting `onCycle`: 'stop' (the default) reports the first back
 * edge with the cycle it closes and stops; 'finish' keeps going, so the learner sees that the
 * finish-time order exists but each back edge points backward in it.
 *
 * The outer loop goes through the vertices in name order, and neighbours come in name order
 * (src/viz/_graph/graph.ts), so the result is deterministic and matches the code tabs.
 *
 * The state is just the graph; a run's bookkeeping travels in the steps' `extra`.
 */
import type { Mark, OpSpec, PseudoBlock, Scalar, Step } from '../../engine/types';
import type { GraphTemplate } from '../../layouts/graph';
import { edgeId, kindId, vertexId } from '../../layouts/graph';
import {
  describeGraph,
  edgeKey,
  listWords,
  makeGraph,
  neighbours,
  plural,
  type Graph,
} from '../_graph/graph';
import { parseGraph } from '../_graph/parse';
import { graphVars, loadOp, type GraphState } from '../_graph/kit';

export type TopoState = GraphState;
export type OnCycle = 'stop' | 'finish';
export type Color = 'white' | 'gray' | 'black';
export type EdgeKind = 'tree' | 'back' | 'forward' | 'cross';

export interface TopoSettings {
  [key: string]: Scalar;
  onCycle: OnCycle;
  layout: GraphTemplate;
}

export const defaults: TopoSettings = { onCycle: 'stop', layout: 'layered' };

/**
 * The starting graph: a DAG of 7 vertices whose names are not in topological order. G comes
 * last in name order, starts the last depth-first tree, finishes last and so goes to the front.
 */
export const TOPO_TEXT = 'A>B, A>D, B>C, C>F, D>C, D>E, E>F, G>D, G>E';
export const TOPO_GRAPH = parseGraph(TOPO_TEXT) as Graph;

/** One run's bookkeeping, as it stands at a step. */
export interface TopoRun {
  color: Record<string, Color>;
  d: Record<string, number | null>;
  f: Record<string, number | null>;
  pi: Record<string, string | null>;
  time: number;
  edges: Record<string, EdgeKind>;
  /** Open DFS-VISIT calls, bottom first. */
  calls: string[];
  /** The list L, front first. */
  order: string[];
  roots: string[];
  /** Back edges found, in order (edge keys). */
  backs: string[];
  /** The cycle the first back edge closes: its vertices in arc order, v first. */
  cycle?: string[];
  /** The search stopped at a back edge. */
  stopped: boolean;
  done: boolean;
  u?: string;
  v?: string;
  checks: number;
}

export interface TopoExtra {
  run?: TopoRun;
}

type S = TopoState;
type X = TopoExtra;
type Op = OpSpec<S, TopoSettings, X>;
type TopoStep = Step<S, X>;

export function init(): S {
  return { graph: makeGraph(TOPO_GRAPH) };
}

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });

/** Panel ids (see view.ts): table cells `tbl-<row>-<v>`, list cells `L-<v>`, calls `cs-<v>`. */
export const cellId = (row: 'd' | 'f', v: string) => `tbl-${row}-${v}`;
export const listId = (v: string) => `L-${v}`;

function clone(r: TopoRun): TopoRun {
  return {
    ...r,
    color: { ...r.color },
    d: { ...r.d },
    f: { ...r.f },
    pi: { ...r.pi },
    edges: { ...r.edges },
    calls: [...r.calls],
    order: [...r.order],
    roots: [...r.roots],
    backs: [...r.backs],
    cycle: r.cycle && [...r.cycle],
  };
}

/** The edge keys around a cycle given as vertices in arc order. */
export function cycleEdges(cycle: string[]): string[] {
  return cycle.map((x, i) => `${x}-${cycle[(i + 1) % cycle.length]}`);
}

const arrows = (cycle: string[]) => [...cycle, cycle[0]].join(' → ');

function runVars(g: Graph, r: TopoRun): Record<string, Scalar> {
  return {
    ...graphVars(g),
    u: r.u ?? '–',
    v: r.v ?? '–',
    time: r.time,
    placed: r.order.length,
    back: r.backs.length,
    checks: r.checks,
  };
}

/** The answer in the code tabs' words: the order, or "cycle u v" for the first back edge. */
export function runSummary(r: TopoRun): string {
  if (r.stopped && r.backs.length) return `cycle ${r.backs[0]!.split('-').join(' ')}`;
  return r.order.join(' ');
}

export function newRun(g: Graph): TopoRun {
  return {
    color: Object.fromEntries(g.vertices.map((v) => [v, 'white' as Color])),
    d: Object.fromEntries(g.vertices.map((v) => [v, null])),
    f: Object.fromEntries(g.vertices.map((v) => [v, null])),
    pi: Object.fromEntries(g.vertices.map((v) => [v, null])),
    time: 0,
    edges: {},
    calls: [],
    order: [],
    roots: [],
    backs: [],
    stopped: false,
    done: false,
    checks: 0,
  };
}

const run: Op = {
  label: 'Sort',
  arity: 0,
  *run(s, _args, { settings }) {
    const g = s.graph;
    if (!g.directed) {
      yield {
        state: s,
        marks: [],
        say: `A topological order is for a directed graph. An undirected edge goes both ways, so neither end can come first. Load arcs such as A>B, B>C.`,
        lines: ['sig'],
        level: 1,
        vars: graphVars(g),
      } satisfies TopoStep;
      return s;
    }
    const keepGoing = settings.onCycle === 'finish';
    const r = newRun(g);
    const step = (
      say: string,
      lines: string[],
      level: 1 | 2 | 3,
      marks: Mark[] = [],
    ): TopoStep => ({
      state: s,
      marks,
      say,
      lines,
      level,
      vars: runVars(g, r),
      extra: { run: clone(r) },
    });
    const edgeMarks = (u: string, v: string, role: Mark['role'] = 'active'): Mark[] => {
      const key = edgeKey(g, u, v);
      const kind = r.edges[key];
      return [
        mark(vertexId(u), 'active'),
        mark(vertexId(v), 'compare'),
        mark(edgeId(key), role),
        ...(kind && kind !== 'tree' ? [mark(kindId(key), role)] : []),
      ];
    };

    /** DFS-VISIT; returns false when it stopped at a cycle. */
    const visit = function* (u: string): Generator<TopoStep, boolean, void> {
      r.time++;
      r.d[u] = r.time;
      r.color[u] = 'gray';
      r.calls.push(u);
      r.u = u;
      r.v = undefined;
      yield step(
        `DFS-VISIT(${u}): time = ${r.time}, so ${u}.d = ${r.time}, and ${u} turns gray.`,
        ['visit', 'v.time', 'v.d', 'v.gray'],
        2,
        [mark(vertexId(u), 'active'), mark(cellId('d', u), 'new')],
      );
      for (const v of neighbours(g, u)) {
        r.u = u;
        r.v = v;
        r.checks++;
        const key = edgeKey(g, u, v);
        if (r.color[v] === 'white') {
          r.pi[v] = u;
          r.edges[key] = 'tree';
          yield step(
            `${u}>${v}: ${v} is white, so (${u}, ${v}) is a tree edge. ${v}.π = ${u}; call DFS-VISIT(${v}). ${v} has to be placed after ${u}, and it will be: ${v} finishes first.`,
            ['v.for', 'v.white', 'v.pi', 'v.call'],
            2,
            edgeMarks(u, v),
          );
          if (!(yield* visit(v))) return false;
          r.u = u;
          r.v = undefined;
          continue;
        }
        if (r.color[v] === 'gray') {
          r.edges[key] = 'back';
          r.backs.push(key);
          if (!r.cycle) {
            const path = [u];
            while (path[0] !== v) path.unshift(r.pi[path[0]!]!);
            r.cycle = path;
          }
          const cyc = `${arrows(r.cycle)}`;
          if (!keepGoing) {
            r.stopped = true;
            yield step(
              `${u}>${v}: ${v} is gray, still being explored, so ${v} is an ancestor of ${u}. (${u}, ${v}) is a back edge, and it closes the cycle ${cyc}. ${v} would have to come before ${u} and after it. There is no topological order: stop.`,
              ['v.for', 'v.ifgray', 'v.cycle'],
              2,
              [
                ...r.cycle.map((x) => mark(vertexId(x), 'error')),
                ...cycleEdges(r.cycle).map((k) => mark(edgeId(k), 'error')),
                mark(kindId(key), 'error'),
              ],
            );
            return false;
          }
          yield step(
            `${u}>${v}: ${v} is gray, an ancestor of ${u}, so (${u}, ${v}) is a back edge${r.backs.length === 1 ? `: it closes the cycle ${cyc}` : ''}. ${v} will finish after ${u} and land in front of it, so this edge will point backward in L. Keep going.`,
            ['v.for', 'v.ifgray', 'v.note'],
            2,
            edgeMarks(u, v, 'error'),
          );
          continue;
        }
        const forward = r.d[u]! < r.d[v]!;
        r.edges[key] = forward ? 'forward' : 'cross';
        yield step(
          `${u}>${v}: ${v} is black, already done and already in L. ${forward ? `It was found below ${u}: a forward edge.` : `It was in a branch that finished earlier: a cross edge.`} ${u} will go in front of ${v}, so the edge points the right way.`,
          ['v.for'],
          3,
          edgeMarks(u, v),
        );
      }
      r.u = u;
      r.v = undefined;
      r.time++;
      r.f[u] = r.time;
      r.color[u] = 'black';
      r.calls.pop();
      r.order.unshift(u);
      const back = r.calls.at(-1);
      const none = neighbours(g, u).length === 0;
      yield step(
        `${none ? `${u} has no edges out` : `${u} has looked at every edge out`}: ${u}.f = ${r.time}, ${u} turns black, and ${u} goes onto the front of L: ${r.order.join(', ')}.${back ? ` Return to DFS-VISIT(${back}).` : ''}`,
        ['v.time2', 'v.f', 'v.black', 'v.front'],
        2,
        [mark(vertexId(u), 'done'), mark(cellId('f', u), 'new'), mark(listId(u), 'new')],
      );
      return true;
    };

    yield step(
      `Topological sort: L starts empty, every vertex is white, and time = 0. Run DFS, and put each vertex on the front of L as it finishes.`,
      ['sig', 'init.L', 'init.for', 'init.color', 'init.time'],
      2,
    );
    let ok = true;
    for (const x of g.vertices) {
      r.u = undefined;
      r.v = undefined;
      if (r.color[x] !== 'white') {
        yield step(`${x} is already black, so it starts nothing.`, ['loop', 'loop.if'], 3, [
          mark(vertexId(x), 'compare'),
        ]);
        continue;
      }
      r.roots.push(x);
      yield step(
        r.roots.length === 1
          ? `Start at ${x}, the first vertex: it is white, so it roots the first depth-first tree.`
          : `${x} is still white: nothing explored so far reaches it. It starts a new depth-first tree. Whatever it finds is already in L or goes in front.`,
        ['loop', 'loop.if', 'loop.call'],
        2,
        [mark(vertexId(x), 'active')],
      );
      ok = yield* visit(x);
      if (!ok) break;
    }
    r.u = undefined;
    r.v = undefined;
    r.done = true;
    if (!ok) {
      const cycle = r.cycle!;
      yield step(
        `Not a DAG: the cycle ${arrows(cycle)} means no order can put every edge forward. A topological sort exists exactly when DFS finds no back edge.`,
        ['ret'],
        1,
        [
          ...cycle.map((x) => mark(vertexId(x), 'error')),
          ...cycleEdges(cycle).map((k) => mark(edgeId(k), 'error')),
        ],
      );
      return s;
    }
    if (r.backs.length) {
      const words = r.backs.map((k) => k.replace('-', '>'));
      yield step(
        `DFS is done, and L = ${r.order.join(', ')}, by decreasing finish time. But ${plural(r.backs.length, 'back edge')} (${listWords(words)}) ${r.backs.length === 1 ? 'points' : 'point'} backward in L: the graph has a cycle, so this is not a topological order.`,
        ['ret'],
        1,
        r.backs.map((k) => mark(edgeId(k), 'error')),
      );
      return s;
    }
    yield step(
      g.vertices.length === 0
        ? 'There are no vertices, so L is empty.'
        : `Done: L = ${r.order.join(', ')}. That is the vertices by decreasing finish time, and every edge points from left to right in L. No back edge, so the graph is a DAG.`,
      ['ret'],
      1,
      r.order.map((v) => mark(listId(v), 'done')),
    );
    return s;
  },
};

const load = loadOp<S, TopoSettings, X>({
  make: (graph) => ({ graph }),
  ready: (g) =>
    g.directed
      ? 'Press Sort to put the vertices in topological order.'
      : 'It is undirected, so it has no topological order. Use arcs such as A>B to make it directed.',
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

export function pseudocode(settings: TopoSettings): PseudoBlock[] {
  const keepGoing = settings.onCycle === 'finish';
  return [
    {
      op: 'run',
      lines: [
        L('sig', 0, 'TOPOLOGICAL-SORT(G)', 'Put the vertices in order:'),
        L('init.L', 1, 'L = empty list', 'Start with an empty list.'),
        L('init.for', 1, 'for each vertex u in G.V', 'For every vertex,'),
        L('init.color', 2, 'u.color = WHITE', 'it is undiscovered (white).'),
        L('init.time', 1, 'time = 0', 'The clock starts at 0.'),
        L('loop', 1, 'for each vertex u in G.V', 'Try every vertex in name order:'),
        L('loop.if', 2, 'if u.color == WHITE', 'if it is still undiscovered,'),
        L('loop.call', 3, 'DFS-VISIT(G, u)', 'search from it: a new tree.'),
        L('ret', 1, 'return L', 'L is the order.'),
        L('visit', 0, 'DFS-VISIT(G, u)', 'Explore from u:'),
        L('v.time', 1, 'time = time + 1', 'tick the clock,'),
        L('v.d', 1, 'u.d = time', 'u is discovered now,'),
        L('v.gray', 1, 'u.color = GRAY', 'and is being explored (gray).'),
        L('v.for', 1, 'for each v in G.Adj[u]', 'For each vertex v that u points to:'),
        L('v.white', 2, 'if v.color == WHITE', 'if v is undiscovered,'),
        L('v.pi', 3, 'v.π = u', '(u, v) is a tree edge;'),
        L('v.call', 3, 'DFS-VISIT(G, v)', 'explore from v first.'),
        L('v.ifgray', 2, 'elseif v.color == GRAY', 'If v is still being explored,'),
        keepGoing
          ? L('v.note', 3, 'note back edge (u, v)', 'remember it: a cycle.')
          : L('v.cycle', 3, 'error "cycle"', 'there is a cycle: stop.'),
        L('v.time2', 1, 'time = time + 1', 'Tick the clock:'),
        L('v.f', 1, 'u.f = time', 'u finishes now'),
        L('v.black', 1, 'u.color = BLACK', 'and is done (black).'),
        L('v.front', 1, 'insert u at the front of L', 'Put u at the front of the list.'),
      ],
    },
  ];
}

export function initialSay(s: S): string {
  return `${describeGraph(s.graph).split('. ')[0]}. Press Sort: depth-first search puts each vertex on the front of a list as it finishes, and the list ends up in topological order.`;
}

export function initialVars(s: S) {
  return graphVars(s.graph);
}

export function describe(s: S): string {
  return describeGraph(s.graph);
}

/** The scene label: where a run stands. */
export function describeRun(r: TopoRun): string {
  const list = r.order.length ? r.order.join(', ') : 'empty';
  const cycle = r.cycle ? ` Cycle: ${arrows(r.cycle)}.` : '';
  return `Topological sort, time ${r.time}. L = ${list}.${cycle}`;
}
