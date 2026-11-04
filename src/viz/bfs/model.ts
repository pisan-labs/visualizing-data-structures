/**
 * Breadth-first search, CLRS style: BFS(G, s) discovers vertices in rings around s, using a
 * FIFO queue. Each vertex gets d (its distance in edges from s, or ∞) and π (the vertex it was
 * discovered from, or NIL); the π edges form the breadth-first tree.
 *
 * Settings: `marking` is CLRS's white, gray and black, or a visited flag (one bit, where gray
 * and black are both "visited"). The pseudocode, the narration and the table follow it.
 *
 * The state is just the graph. A run's bookkeeping (colors, d, π, the queue) travels in the
 * steps' `extra`, so the last step of a run shows the result and a plain state draws the bare
 * graph. Neighbours come in name order, so every run, practice answer and code tab agrees.
 */
import type { Mark, OpSpec, PseudoBlock, Scalar, Step } from '../../engine/types';
import type { GraphTemplate } from '../../layouts/graph';
import { edgeId, labelId, vertexId } from '../../layouts/graph';
import {
  describeGraph,
  edgeKey,
  edgeText,
  listWords,
  neighbours,
  plural,
  type Graph,
} from '../_graph/graph';
import { graphVars, loadOp, startGraph, vertexArg, type GraphState } from '../_graph/kit';

export type BfsState = GraphState;
export type Marking = 'colors' | 'visited';
export type Color = 'white' | 'gray' | 'black';

export interface BfsSettings {
  [key: string]: Scalar;
  marking: Marking;
  layout: GraphTemplate;
}

export const defaults: BfsSettings = { marking: 'colors', layout: 'force' };

/** One run's bookkeeping, as it stands at a step. */
export interface BfsRun {
  s: string;
  /** In visited mode, white means "not visited" and gray and black both mean visited. */
  color: Record<string, Color>;
  /** null is ∞. */
  d: Record<string, number | null>;
  pi: Record<string, string | null>;
  /** Front first. */
  queue: string[];
  /** Vertices in the order they were dequeued. */
  order: string[];
  /** Edges looked at so far, by key: part of the tree, or seen and passed over. */
  edges: Record<string, 'tree' | 'seen'>;
  /** The vertex being scanned, and the neighbour being looked at. */
  u?: string;
  v?: string;
  /** Edge checks so far (each (u, v) in an adjacency list counts once). */
  checks: number;
}

export interface BfsExtra {
  run?: BfsRun;
}

type S = BfsState;
type X = BfsExtra;
type Op = OpSpec<S, BfsSettings, X>;
type BfsStep = Step<S, X>;

export function init(): S {
  return { graph: startGraph() };
}

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });
const vmark = (v: string, role: Mark['role']) => [mark(vertexId(v), role)];

/** Table cell ids (see view.ts): `tbl-<row>-<vertex>`. */
export const cellId = (row: 'color' | 'd' | 'pi', v: string) => `tbl-${row}-${v}`;
export const queueId = (v: string) => `q-${v}`;

export const dText = (d: number | null) => (d === null ? '∞' : String(d));

function clone(r: BfsRun): BfsRun {
  return {
    ...r,
    color: { ...r.color },
    d: { ...r.d },
    pi: { ...r.pi },
    queue: [...r.queue],
    order: [...r.order],
    edges: { ...r.edges },
  };
}

function runVars(g: Graph, r: BfsRun | undefined): Record<string, Scalar> {
  if (!r) return graphVars(g);
  const found = Object.values(r.d).filter((x) => x !== null).length;
  return {
    ...graphVars(g),
    s: r.s,
    u: r.u ?? '–',
    v: r.v ?? '–',
    Q: r.queue.length ? r.queue.join(' ') : 'empty',
    found,
    checks: r.checks,
  };
}

/** The final answer of a run, in the code tabs' words: order | d | π (in vertex order). */
export function runSummary(g: Graph, r: BfsRun): { order: string; d: string; pi: string } {
  return {
    order: r.order.join(' '),
    d: g.vertices.map((v) => (r.d[v] === null ? 'inf' : String(r.d[v]))).join(' '),
    pi: g.vertices.map((v) => r.pi[v] ?? '-').join(' '),
  };
}

const run: Op = {
  label: 'Run BFS from',
  arity: 1,
  *run(s, [arg], { settings }) {
    const g = s.graph;
    const flags = settings.marking === 'visited';
    const a = vertexArg(g, arg);
    if ('error' in a) {
      yield {
        state: s,
        marks: [],
        say: `BFS needs a start vertex. ${a.error}`,
        lines: ['sig'],
        level: 1,
        vars: graphVars(g),
      } satisfies BfsStep;
      return s;
    }
    const src = a.v;
    const r: BfsRun = {
      s: src,
      color: Object.fromEntries(g.vertices.map((v) => [v, 'white' as Color])),
      d: Object.fromEntries(g.vertices.map((v) => [v, null])),
      pi: Object.fromEntries(g.vertices.map((v) => [v, null])),
      queue: [],
      order: [],
      edges: {},
      checks: 0,
    };
    const step = (say: string, lines: string[], level: 1 | 2 | 3, marks: Mark[] = []): BfsStep => ({
      state: s,
      marks,
      say,
      lines,
      level,
      vars: runVars(g, r),
      extra: { run: clone(r) },
    });
    const white = flags ? 'not visited' : 'white';

    yield step(
      `BFS from ${src}. To start, every vertex is ${white}, with d = ∞ and π = NIL.${g.directed ? ' The graph is directed, so BFS only follows edges forward.' : ''}`,
      ['init.for', 'init.color', 'init.d', 'init.pi'],
      2,
    );

    r.color[src] = 'gray';
    r.d[src] = 0;
    r.queue.push(src);
    yield step(
      flags
        ? `Mark ${src} visited, set d = 0, and put it in the queue: Q = [${src}].`
        : `Discover ${src}: color it gray, set d = 0, and put it in the queue: Q = [${src}].`,
      ['src.color', 'src.d', 'q.init', 'q.enq'],
      2,
      [...vmark(src, 'new'), mark(queueId(src), 'new'), mark(cellId('d', src), 'new')],
    );

    while (r.queue.length > 0) {
      const u = r.queue.shift()!;
      r.order.push(u);
      r.u = u;
      r.v = undefined;
      const adj = neighbours(g, u);
      yield step(
        adj.length
          ? `Dequeue ${u} from the front (d = ${r.d[u]}). Now look at its ${g.directed ? 'out-' : ''}neighbours in order: ${listWords(adj)}.`
          : `Dequeue ${u} from the front (d = ${r.d[u]}). It has no ${g.directed ? 'edges out' : 'neighbours'}.`,
        ['while', 'deq'],
        2,
        [...vmark(u, 'active')],
      );
      for (const v of adj) {
        r.v = v;
        r.checks++;
        const key = edgeKey(g, u, v);
        const e = edgeText(g, u, v);
        if (r.color[v] === 'white') {
          r.color[v] = 'gray';
          r.d[v] = r.d[u]! + 1;
          r.pi[v] = u;
          r.queue.push(v);
          r.edges[key] = 'tree';
          yield step(
            flags
              ? `${e}: ${v} is not visited yet. Mark it visited, set d[${v}] = d[${u}] + 1 = ${r.d[v]} and π[${v}] = ${u}, and add it to the back of the queue.`
              : `${e}: ${v} is white, so this discovers it. ${v} turns gray, d[${v}] = d[${u}] + 1 = ${r.d[v]}, π[${v}] = ${u}, and ${v} joins the back of the queue.`,
            ['for', 'if', 'v.color', 'v.d', 'v.pi', 'enq'],
            2,
            [
              ...vmark(u, 'active'),
              ...vmark(v, 'new'),
              mark(edgeId(key), 'active'),
              mark(queueId(v), 'new'),
              mark(cellId('d', v), 'new'),
              mark(cellId('pi', v), 'new'),
            ],
          );
        } else {
          if (!r.edges[key]) r.edges[key] = 'seen';
          const why = flags
            ? `${v} is already visited`
            : r.color[v] === 'gray'
              ? `${v} is gray: it is already in the queue`
              : `${v} is black: it is already done`;
          yield step(
            `${e}: ${why}, so skip it.${r.pi[u] === v ? ` (${v} is where ${u} came from.)` : ''}`,
            ['for', 'if'],
            3,
            [...vmark(u, 'active'), ...vmark(v, 'compare'), mark(edgeId(key), 'active')],
          );
        }
      }
      r.v = undefined;
      if (!flags) {
        r.color[u] = 'black';
        yield step(
          `${adj.length ? `Every neighbour of ${u} has been looked at, so ${u}` : u} is done: color it black.${r.queue.length ? ` The queue is now ${r.queue.join(', ')}.` : ' The queue is empty.'}`,
          ['black'],
          2,
          [...vmark(u, 'done'), mark(cellId('color', u), 'new')],
        );
      } else {
        r.color[u] = 'black';
      }
    }
    r.u = undefined;
    const lost = g.vertices.filter((v) => r.d[v] === null);
    const reached = g.vertices.length - lost.length;
    const far = Math.max(...g.vertices.map((v) => r.d[v] ?? 0));
    const farthest = g.vertices.filter((v) => r.d[v] === far);
    const tail = lost.length
      ? ` ${listWords(lost)} ${lost.length === 1 ? 'is' : 'are'} not reachable from ${src}${g.directed ? ' along the edges’ directions' : ''}, so ${lost.length === 1 ? 'it stays' : 'they stay'} ${white}, with d = ∞ and no parent.`
      : '';
    const what =
      reached === 1
        ? `It reached only ${src} itself: ${src} has no ${g.directed ? 'edges out' : 'neighbours'}.`
        : `It reached ${reached} of ${plural(g.vertices.length, 'vertex', 'vertices')}, in the order ${r.order.join(', ')}. The farthest ${farthest.length === 1 ? 'is' : 'are'} ${listWords(farthest)}, ${plural(far, 'edge')} away, and the π edges form the breadth-first tree.`;
    yield step(
      `The queue is empty, so BFS is done. ${what}${tail}`,
      ['while'],
      1,
      lost.map((v) => mark(labelId(v), 'stale')),
    );
    return s;
  },
};

const load = loadOp<S, BfsSettings, X>({
  make: (graph) => ({ graph }),
  ready: (g) => `Type a vertex and press Run to search from it, such as ${g.vertices[0]}.`,
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

export function pseudocode(settings: BfsSettings): PseudoBlock[] {
  const lines =
    settings.marking === 'visited'
      ? [
          L('sig', 0, 'BFS(G, s)', 'Breadth-first search from s:'),
          L('init.for', 1, 'for each vertex u in G.V', 'For every vertex,'),
          L('init.color', 2, 'u.visited = false', 'it is not visited yet,'),
          L('init.d', 2, 'u.d = ∞', 'its distance is unknown,'),
          L('init.pi', 2, 'u.π = NIL', 'and it has no parent.'),
          L('src.color', 1, 's.visited = true', 'Mark s visited,'),
          L('src.d', 1, 's.d = 0', 'zero steps from itself.'),
          L('q.init', 1, 'Q = empty queue', 'Start an empty queue'),
          L('q.enq', 1, 'ENQUEUE(Q, s)', 'and put s in it.'),
          L('while', 1, 'while Q is not empty', 'While the queue has vertices,'),
          L('deq', 2, 'u = DEQUEUE(Q)', 'take u from the front.'),
          L('for', 2, 'for each v in G.Adj[u]', 'For each neighbour v of u:'),
          L('if', 3, 'if not v.visited', 'if v is new,'),
          L('v.color', 4, 'v.visited = true', 'mark it visited,'),
          L('v.d', 4, 'v.d = u.d + 1', 'one step further than u,'),
          L('v.pi', 4, 'v.π = u', 'found from u,'),
          L('enq', 4, 'ENQUEUE(Q, v)', 'and put it at the back.'),
        ]
      : [
          L('sig', 0, 'BFS(G, s)', 'Breadth-first search from s:'),
          L('init.for', 1, 'for each vertex u in G.V', 'For every vertex,'),
          L('init.color', 2, 'u.color = WHITE', 'it is undiscovered (white),'),
          L('init.d', 2, 'u.d = ∞', 'its distance is unknown,'),
          L('init.pi', 2, 'u.π = NIL', 'and it has no parent.'),
          L('src.color', 1, 's.color = GRAY', 's is discovered (gray),'),
          L('src.d', 1, 's.d = 0', 'zero steps from itself.'),
          L('q.init', 1, 'Q = ∅', 'Start an empty queue'),
          L('q.enq', 1, 'ENQUEUE(Q, s)', 'and put s in it.'),
          L('while', 1, 'while Q ≠ ∅', 'While the queue has vertices,'),
          L('deq', 2, 'u = DEQUEUE(Q)', 'take u from the front.'),
          L('for', 2, 'for each v in G.Adj[u]', 'For each neighbour v of u:'),
          L('if', 3, 'if v.color == WHITE', 'if v is undiscovered,'),
          L('v.color', 4, 'v.color = GRAY', 'discover it (gray),'),
          L('v.d', 4, 'v.d = u.d + 1', 'one step further than u,'),
          L('v.pi', 4, 'v.π = u', 'found from u,'),
          L('enq', 4, 'ENQUEUE(Q, v)', 'and put it at the back.'),
          L('black', 2, 'u.color = BLACK', 'u is done (black).'),
        ];
  return [{ op: 'run', lines }];
}

export function initialSay(s: S): string {
  return `${describeGraph(s.graph).split('. ')[0]}. Type a start vertex, such as ${s.graph.vertices[0]}, and press Run: breadth-first search finds how many edges each vertex is from it.`;
}

export function initialVars(s: S) {
  return graphVars(s.graph);
}

export function describe(s: S): string {
  return describeGraph(s.graph);
}

/** The scene label: the graph, plus where a run stands. */
export function describeRun(g: Graph, r: BfsRun): string {
  const seen = g.vertices.filter((v) => r.d[v] !== null);
  const dist = seen.map((v) => `${v} ${r.d[v]}`).join(', ');
  return `BFS from ${r.s}. Queue: ${r.queue.length ? r.queue.join(', ') : 'empty'}. Distances so far: ${dist}.`;
}
