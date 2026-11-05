/**
 * Topological sort by in-degree (Kahn's algorithm). Count each vertex's in-degree. Every vertex
 * with in-degree 0 is ready: nothing has to come before it. Take a ready vertex, put it next
 * in the order, and remove its arcs; a vertex whose in-degree drops to 0 becomes ready. When
 * nothing is ready, either every vertex is in the order, or the ones left over all wait on
 * each other: the graph has a cycle, and no topological order exists.
 *
 * Settings: `ready` keeps the ready vertices in a FIFO queue (the default) or a min-priority
 * queue that always takes the smallest name first. Both orders are correct; they are often
 * different, which shows that a DAG can have many topological orders. The smallest-first
 * order is the unique smallest one in dictionary order.
 *
 * The state is just the graph; a run's bookkeeping travels in the steps' `extra`. An
 * undirected graph is refused: each of its edges goes both ways, a cycle of two.
 */
import type { Mark, OpSpec, PseudoBlock, Scalar, Step } from '../../engine/types';
import type { GraphTemplate } from '../../layouts/graph';
import { edgeId, labelId, vertexId } from '../../layouts/graph';
import {
  compareNames,
  describeGraph,
  inNeighbours,
  listWords,
  makeGraph,
  neighbours,
  plural,
  type Graph,
} from '../_graph/graph';
import { graphVars, loadOp, type GraphState } from '../_graph/kit';
import { parseGraph } from '../_graph/parse';

export type TopoState = GraphState;
export type Ready = 'fifo' | 'smallest';

export interface TopoSettings {
  [key: string]: Scalar;
  ready: Ready;
  layout: GraphTemplate;
}

export const defaults: TopoSettings = { ready: 'fifo', layout: 'force' };

/**
 * The starting DAG: the directed graph the shortest-path pages start on, without weights.
 * Its names are not in topological order (C comes before B).
 */
export const TOPO_TEXT = 'A>B, A>C, B>D, B>E, C>B, C>D, D>G, E>D, E>F, F>G';
const TOPO_GRAPH = parseGraph(TOPO_TEXT) as Graph;

/** One run's bookkeeping, as it stands at a step. */
export interface TopoRun {
  ready: Ready;
  /** In-degree before anything is removed (filled in as it is counted). */
  start: Record<string, number | null>;
  /** In-degree counting only arcs from vertices not yet in the order. */
  indeg: Record<string, number | null>;
  /** Ready vertices: front first (FIFO), or smallest first. */
  queue: string[];
  /** The topological order so far. */
  order: string[];
  /** Arcs removed so far, by key. */
  edges: Record<string, 'seen'>;
  u?: string;
  v?: string;
  /** In-degree decrements so far (one per arc out of an output vertex). */
  decrements: number;
  /** When the queue empties early: the vertices left, and one cycle among them, in order. */
  leftover?: string[];
  cycle?: string[];
  done?: boolean;
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
const vmark = (v: string, role: Mark['role']) => [mark(vertexId(v), role)];

/** Panel ids (see view.ts): table cells `tbl-in-<v>`, queue cells `q-<v>`, order `L-<v>`. */
export const cellId = (v: string) => `tbl-in-${v}`;
export const queueId = (v: string) => `q-${v}`;
export const orderId = (v: string) => `L-${v}`;

const arc = (u: string, v: string) => `${u}→${v}`;

function clone(r: TopoRun): TopoRun {
  return {
    ...r,
    start: { ...r.start },
    indeg: { ...r.indeg },
    queue: [...r.queue],
    order: [...r.order],
    edges: { ...r.edges },
    leftover: r.leftover && [...r.leftover],
    cycle: r.cycle && [...r.cycle],
  };
}

function runVars(g: Graph, r: TopoRun): Record<string, Scalar> {
  return {
    ...graphVars(g),
    u: r.u ?? '–',
    v: r.v ?? '–',
    Q: r.queue.length ? r.queue.join(' ') : 'empty',
    output: r.order.length,
    left: g.vertices.length - r.order.length,
    decrements: r.decrements,
  };
}

/**
 * One cycle among the leftover vertices. Each of them has an arc in from another leftover
 * vertex, so walking arcs backwards (to the smallest such in-neighbour) must repeat a vertex.
 * Returned in the arcs' direction, starting from its smallest name.
 */
export function findCycle(g: Graph, left: string[]): string[] {
  const inLeft = new Set(left);
  const walk = [left[0]!];
  for (;;) {
    const x = walk.at(-1)!;
    const p = inNeighbours(g, x).find((y) => inLeft.has(y))!;
    const at = walk.indexOf(p);
    if (at >= 0) {
      const back = walk.slice(at);
      const cycle = [back[0]!, ...back.slice(1).reverse()];
      const k = cycle.indexOf([...cycle].sort(compareNames)[0]!);
      return [...cycle.slice(k), ...cycle.slice(0, k)];
    }
    walk.push(p);
  }
}

/** The final answer, in the code tabs' words: "<order> | <leftover vertices, or ->". */
export function runSummary(r: TopoRun): string {
  return `${r.order.join(' ')} | ${r.leftover?.length ? r.leftover.join(' ') : '-'}`.trimStart();
}

const run: Op = {
  label: 'Sort',
  arity: 0,
  *run(s, _args, { settings }) {
    const g = s.graph;
    const smallest = settings.ready === 'smallest';
    if (!g.directed) {
      yield {
        state: s,
        marks: [],
        say: 'A topological order needs a directed graph. An undirected edge goes both ways, so every edge is a cycle of two. Load arcs, such as A>B, B>C.',
        lines: ['sig'],
        level: 1,
        vars: graphVars(g),
      } satisfies TopoStep;
      return s;
    }
    const r: TopoRun = {
      ready: settings.ready,
      start: Object.fromEntries(g.vertices.map((v) => [v, null])),
      indeg: Object.fromEntries(g.vertices.map((v) => [v, null])),
      queue: [],
      order: [],
      edges: {},
      decrements: 0,
    };
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
    const add = (v: string) => {
      r.queue.push(v);
      if (smallest) r.queue.sort(compareNames);
    };
    const Q = () => (r.queue.length ? `[${r.queue.join(', ')}]` : 'empty');

    // Count in-degrees.
    for (const v of g.vertices) {
      const from = inNeighbours(g, v);
      r.start[v] = from.length;
      r.indeg[v] = from.length;
      yield step(
        from.length
          ? `in[${v}] = ${from.length}: ${plural(from.length, 'arc')} in, from ${listWords(from)}.`
          : `in[${v}] = 0: no arc comes into ${v}.`,
        ['in.edges', 'in.inc'],
        3,
        [...vmark(v, 'active'), mark(cellId(v), 'new')],
      );
    }
    const sources = g.vertices.filter((v) => r.indeg[v] === 0);
    yield step(
      `In-degrees counted, in one pass over the ${plural(g.edges.length, 'arc')}: ${g.vertices.map((v) => `${v} ${r.indeg[v]}`).join(', ')}.`,
      ['in.for', 'in.zero', 'in.edges', 'in.inc'],
      2,
    );

    for (const v of sources) add(v);
    yield step(
      sources.length
        ? `${listWords(sources)} ${sources.length === 1 ? 'has' : 'have'} in-degree 0: nothing has to come before ${sources.length === 1 ? 'it' : 'them'}. ${sources.length === 1 ? 'It goes' : 'They go'} in the ${smallest ? 'priority queue' : 'queue'}: Q = ${Q()}.`
        : 'No vertex has in-degree 0. Every vertex waits on another, so nothing can go first: the graph has a cycle.',
      ['q.init', 'src.for', 'src.if', 'src.enq', 'l.init'],
      2,
      sources.flatMap((v) => [...vmark(v, 'new'), mark(queueId(v), 'new')]),
    );

    while (r.queue.length) {
      const u = r.queue.shift()!;
      r.order.push(u);
      r.u = u;
      r.v = undefined;
      const out = neighbours(g, u);
      const pick = smallest
        ? r.queue.length
          ? `the smallest of the ready vertices`
          : 'the only ready vertex'
        : 'the front of the queue';
      yield step(
        `Take ${u}, ${pick}, and put it next in the order: ${r.order.join(', ')}.${out.length ? ` Now remove its ${out.length === 1 ? 'arc' : `${out.length} arcs`} out, to ${listWords(out)}.` : ` It has no arcs out.`}`,
        ['while', 'deq', 'out'],
        2,
        [...vmark(u, 'active'), mark(orderId(u), 'new')],
      );
      for (const v of out) {
        r.v = v;
        r.indeg[v]!--;
        r.decrements++;
        const key = `${u}-${v}`;
        r.edges[key] = 'seen';
        if (r.indeg[v] === 0) {
          add(v);
          yield step(
            `Remove ${arc(u, v)}: in[${v}] drops to 0, so ${v} is ready. It joins the ${smallest ? 'priority queue' : 'back of the queue'}: Q = ${Q()}.`,
            ['for', 'dec', 'if', 'enq'],
            2,
            [
              ...vmark(u, 'active'),
              ...vmark(v, 'new'),
              mark(edgeId(key), 'active'),
              mark(cellId(v), 'new'),
              mark(queueId(v), 'new'),
            ],
          );
        } else {
          const waits = inNeighbours(g, v).filter((x) => !r.order.includes(x));
          yield step(
            `Remove ${arc(u, v)}: in[${v}] drops to ${r.indeg[v]}. ${v} still waits on ${listWords(waits)}.`,
            ['for', 'dec', 'if'],
            3,
            [
              ...vmark(u, 'active'),
              ...vmark(v, 'compare'),
              mark(edgeId(key), 'active'),
              mark(cellId(v), 'new'),
            ],
          );
        }
      }
    }
    r.u = undefined;
    r.v = undefined;

    const left = g.vertices.filter((v) => !r.order.includes(v));
    if (left.length === 0) {
      r.done = true;
      yield step(
        `The queue is empty and all ${plural(g.vertices.length, 'vertex', 'vertices')} are in the order: ${r.order.join(', ')}. Every arc goes from earlier to later in it, so this is a topological order.`,
        ['check', 'ret'],
        1,
      );
      return s;
    }
    r.leftover = left;
    const cycle = findCycle(g, left);
    r.cycle = cycle;
    r.done = true;
    const ring = [...cycle, cycle[0]!];
    const arcs = cycle.map((x, i) => `${x}-${cycle[(i + 1) % cycle.length]}`);
    yield step(
      `The queue is empty, but ${listWords(left)} ${left.length === 1 ? 'is' : 'are'} left, each still with an arc in from another vertex left over. ${ring.join(' → ')} is a cycle: each vertex on it waits for the one before it, so none can go first. The graph has no topological order.`,
      ['check', 'cycle'],
      1,
      [
        ...left.map((v) => mark(labelId(v), 'error')),
        ...cycle.map((v) => mark(vertexId(v), 'error')),
        ...arcs.map((k) => mark(edgeId(k), 'error')),
      ],
    );
    return s;
  },
};

const load = loadOp<S, TopoSettings, X>({
  make: (graph) => ({ graph }),
  ready: (g) =>
    g.directed
      ? 'Press Sort to put its vertices in topological order.'
      : 'It is undirected, so it has no topological order: use arcs such as A>B.',
});

export const ops = { load, run };

// ---------------------------------------------------------------------------------------------
// Pseudocode. Lines stay short (33 characters with their indent) for a phone.

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: TopoSettings): PseudoBlock[] {
  const pq = settings.ready === 'smallest';
  return [
    {
      op: 'run',
      lines: [
        L('sig', 0, 'TOPOLOGICAL-SORT(G)', 'Order G so every arc goes forward:'),
        L('in.for', 1, 'for each vertex v in G.V', 'Every vertex'),
        L('in.zero', 2, 'v.in = 0', 'starts with in-degree 0.'),
        L('in.edges', 1, 'for each edge (u, v) in G.E', 'For each arc u → v,'),
        L('in.inc', 2, 'v.in = v.in + 1', 'v has one more arc in.'),
        pq
          ? L('q.init', 1, 'Q = empty min-priority queue', 'Ready vertices, smallest first:')
          : L('q.init', 1, 'Q = ∅', 'Ready vertices wait in a queue:'),
        L('src.for', 1, 'for each vertex v in G.V', 'every vertex'),
        L('src.if', 2, 'if v.in == 0', 'with nothing before it'),
        pq
          ? L('src.enq', 3, 'INSERT(Q, v)', 'is ready.')
          : L('src.enq', 3, 'ENQUEUE(Q, v)', 'is ready.'),
        L('l.init', 1, 'L = empty list', 'The order starts empty.'),
        L('while', 1, 'while Q ≠ ∅', 'While some vertex is ready,'),
        pq
          ? L('deq', 2, 'u = EXTRACT-MIN(Q)', 'take the smallest one,')
          : L('deq', 2, 'u = DEQUEUE(Q)', 'take the one in front,'),
        L('out', 2, 'append u to L', 'put it next in the order,'),
        L('for', 2, 'for each v in G.Adj[u]', 'and remove each arc u → v:'),
        L('dec', 3, 'v.in = v.in - 1', 'v waits on one fewer vertex,'),
        L('if', 3, 'if v.in == 0', 'and if it waits on none,'),
        pq
          ? L('enq', 4, 'INSERT(Q, v)', 'it is ready.')
          : L('enq', 4, 'ENQUEUE(Q, v)', 'it is ready.'),
        L('check', 1, 'if |L| < |G.V|', 'If some vertex never got out,'),
        L('cycle', 2, 'error "G has a cycle"', 'the graph has a cycle.'),
        L('ret', 1, 'return L', 'Otherwise L is the order.'),
      ],
    },
  ];
}

export function initialSay(s: S): string {
  const g = s.graph;
  return `${describeGraph(g).split('. ')[0]}. Press Sort: list the vertices so that every arc goes from earlier to later, by taking vertices with nothing left before them.`;
}

export function initialVars(s: S) {
  return graphVars(s.graph);
}

export function describe(s: S): string {
  return describeGraph(s.graph);
}

/** The scene label: where a run stands. */
export function describeRun(g: Graph, r: TopoRun): string {
  const ins = g.vertices
    .filter((v) => !r.order.includes(v) && r.indeg[v] !== null)
    .map((v) => `${v} ${r.indeg[v]}`);
  const where = `Order so far: ${r.order.length ? r.order.join(', ') : 'empty'}. Ready: ${r.queue.length ? r.queue.join(', ') : 'none'}.${ins.length ? ` In-degrees left: ${ins.join(', ')}.` : ''}`;
  return r.cycle ? `${where} Cycle: ${r.cycle.join(', ')}.` : where;
}
