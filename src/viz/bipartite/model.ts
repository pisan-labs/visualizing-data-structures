/**
 * Bipartite check: can the vertices be split into two sides so that every edge joins the two
 * sides? Two-color the graph with a search. The first vertex of each piece goes on side 0, and
 * each vertex it finds goes on the other side from the vertex that found it. If an edge ever
 * joins two vertices on the same side, the graph is not bipartite, and the two tree paths up
 * from its ends to where they meet, plus that edge, make an odd cycle that proves it.
 *
 * The outer loop takes the vertices in name order, so every piece is checked. A directed
 * graph's arcs count both ways (bipartite is about the edges, not their direction).
 *
 * Settings: `method` searches breadth-first with a queue (the default), or depth-first by
 * recursion. Both give a correct answer; they can stop at different edges and show different
 * odd cycles.
 *
 * The state is just the graph; a run's bookkeeping travels in the steps' `extra`.
 */
import type { Mark, OpSpec, PseudoBlock, Scalar, Step } from '../../engine/types';
import type { GraphTemplate } from '../../layouts/graph';
import { edgeId, vertexId } from '../../layouts/graph';
import {
  compareNames,
  describeGraph,
  findEdge,
  inNeighbours,
  listWords,
  neighbours,
  plural,
  type Graph,
} from '../_graph/graph';
import { graphVars, loadOp, startGraph, type GraphState } from '../_graph/kit';

export type BipState = GraphState;
export type Method = 'bfs' | 'dfs';
export type Side = 0 | 1;

export interface BipSettings {
  [key: string]: Scalar;
  method: Method;
  layout: GraphTemplate;
}

export const defaults: BipSettings = { method: 'bfs', layout: 'force' };

/** One run's bookkeeping, as it stands at a step. */
export interface BipRun {
  method: Method;
  side: Record<string, Side | null>;
  pi: Record<string, string | null>;
  /** BFS: the queue, front first. DFS: the open VISIT calls, bottom first. */
  frontier: string[];
  /** Vertices in the order they got a side. */
  order: string[];
  edges: Record<string, 'tree' | 'seen'>;
  s?: string;
  u?: string;
  v?: string;
  checks: number;
  /** The answer, once known. */
  verdict?: 'yes' | 'no';
  /** When the answer is no: the edge that broke it, and the odd cycle (closed by v-u). */
  clash?: { u: string; v: string };
  cycle?: string[];
}

export interface BipExtra {
  run?: BipRun;
}

type S = BipState;
type X = BipExtra;
type Op = OpSpec<S, BipSettings, X>;
type BipStep = Step<S, X>;

export function init(): S {
  return { graph: startGraph() };
}

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });
const vmark = (v: string, role: Mark['role']) => [mark(vertexId(v), role)];

/** Table cell ids (see view.ts): `tbl-<row>-<vertex>`; queue and call cells `q-<v>`. */
export const cellId = (row: 'side' | 'pi', v: string) => `tbl-${row}-${v}`;
export const frontierId = (v: string) => `q-${v}`;

/** Neighbours in name order, ignoring direction. */
export function linked(g: Graph, u: string): string[] {
  if (!g.directed) return neighbours(g, u);
  return [...new Set([...neighbours(g, u), ...inNeighbours(g, u)])].sort(compareNames);
}

/** The key of the stored edge between u and v (either direction when directed). */
export function linkKey(g: Graph, u: string, v: string): string {
  const e = findEdge(g, u, v) ?? findEdge(g, v, u)!;
  return `${e.u}-${e.v}`;
}

function linkText(g: Graph, u: string, v: string): string {
  const e = findEdge(g, u, v) ?? findEdge(g, v, u)!;
  return g.directed ? `${e.u}>${e.v}` : `${e.u}-${e.v}`;
}

/** "Its neighbours, B and C, belong on side 1." */
const belong = (adj: string[], side: Side) =>
  adj.length === 1
    ? `Its neighbour, ${adj[0]}, belongs on side ${1 - side}.`
    : `Its neighbours, ${listWords(adj)}, belong on side ${1 - side}.`;

/**
 * The odd cycle an edge u-v between two vertices on the same side closes: up the tree from u
 * to the lowest common ancestor, then down to v. Its last vertex, v, joins the first, u.
 */
export function oddCycle(
  pi: Record<string, string | null>,
  u: string,
  v: string,
): { cycle: string[]; lca: string } {
  const up = [u];
  while (pi[up.at(-1)!]) up.push(pi[up.at(-1)!]!);
  const vp = [v];
  while (pi[vp.at(-1)!]) vp.push(pi[vp.at(-1)!]!);
  const lca = vp.find((x) => up.includes(x))!;
  return {
    cycle: [...up.slice(0, up.indexOf(lca) + 1), ...vp.slice(0, vp.indexOf(lca)).reverse()],
    lca,
  };
}

/** The keys of a cycle's edges, in order, closing edge last. */
export function cycleKeys(g: Graph, cycle: string[]): string[] {
  return cycle.map((x, i) => linkKey(g, x, cycle[(i + 1) % cycle.length]!));
}

function clone(r: BipRun): BipRun {
  return {
    ...r,
    side: { ...r.side },
    pi: { ...r.pi },
    frontier: [...r.frontier],
    order: [...r.order],
    edges: { ...r.edges },
    clash: r.clash && { ...r.clash },
    cycle: r.cycle && [...r.cycle],
  };
}

function runVars(g: Graph, r: BipRun): Record<string, Scalar> {
  return {
    ...graphVars(g),
    s: r.s ?? '–',
    u: r.u ?? '–',
    v: r.v ?? '–',
    [r.method === 'bfs' ? 'Q' : 'calls']: r.frontier.length ? r.frontier.join(' ') : 'empty',
    colored: r.order.length,
    checks: r.checks,
    bipartite: r.verdict ?? '–',
    ...(r.cycle ? { 'odd cycle': r.cycle.length } : {}),
  };
}

export const sideList = (g: Graph, r: BipRun, k: Side) => g.vertices.filter((v) => r.side[v] === k);

/** The final answer, in the code tabs' words: "yes | side per vertex" or "no | cycle". */
export function runSummary(g: Graph, r: BipRun): string {
  if (r.verdict === 'no') return `no | ${r.cycle!.join(' ')}`;
  return `yes | ${g.vertices.map((v) => r.side[v]).join(' ')}`.trimEnd();
}

const run: Op = {
  label: 'Check',
  arity: 0,
  *run(s, _args, { settings }) {
    const g = s.graph;
    const bfs = settings.method === 'bfs';
    const r: BipRun = {
      method: settings.method,
      side: Object.fromEntries(g.vertices.map((v) => [v, null])),
      pi: Object.fromEntries(g.vertices.map((v) => [v, null])),
      frontier: [],
      order: [],
      edges: {},
      checks: 0,
    };
    const step = (say: string, lines: string[], level: 1 | 2 | 3, marks: Mark[] = []): BipStep => ({
      state: s,
      marks,
      say,
      lines,
      level,
      vars: runVars(g, r),
      extra: { run: clone(r) },
    });
    const dir = g.directed
      ? ' The graph is directed, but here an arc joins its two ends either way: sides are about edges, not their direction.'
      : '';

    yield step(
      `Every vertex starts with no side (side = NIL). Each piece's first vertex goes on side 0, and every vertex found from it goes on the other side from the vertex that found it.${dir}`,
      ['init.for', 'init.side'],
      2,
    );

    /** The clash: say what it means and record the odd cycle. */
    const clashStep = (u: string, v: string): BipStep => {
      r.verdict = 'no';
      r.clash = { u, v };
      const { cycle, lca } = oddCycle(r.pi, u, v);
      r.cycle = cycle;
      const e = linkText(g, u, v);
      const keys = cycleKeys(g, cycle);
      return step(
        `${e}: ${v} is on side ${r.side[v]}, the same side as ${u}. Follow π up from both ends to where they meet, at ${lca}: with ${e}, that closes the cycle ${[...cycle, cycle[0]].join(' → ')}, ${plural(cycle.length, 'edge')}. Around a cycle the sides alternate, so an odd cycle cannot be split in two. The graph is not bipartite.`,
        [bfs ? 'clash.if' : 'v.clash.if', bfs ? 'clash' : 'v.clash'],
        2,
        [
          ...cycle.map((x) => mark(vertexId(x), 'error')),
          ...keys.map((k) => mark(edgeId(k), 'error')),
          mark(cellId('side', u), 'error'),
          mark(cellId('side', v), 'error'),
        ],
      );
    };

    /** Look at the edge u-v: true when it breaks the two-coloring. */
    const examine = (u: string, v: string): 'new' | 'ok' | 'clash' => {
      r.u = u;
      r.v = v;
      r.checks++;
      const key = linkKey(g, u, v);
      if (r.side[v] === null) {
        r.side[v] = r.side[u] === 0 ? 1 : 0;
        r.pi[v] = u;
        r.order.push(v);
        r.edges[key] = 'tree';
        return 'new';
      }
      if (!r.edges[key]) r.edges[key] = 'seen';
      return r.side[v] === r.side[u] ? 'clash' : 'ok';
    };
    const newMarks = (u: string, v: string) => [
      ...vmark(u, 'active'),
      ...vmark(v, 'new'),
      mark(edgeId(linkKey(g, u, v)), 'active'),
      mark(cellId('side', v), 'new'),
      mark(frontierId(v), 'new'),
    ];
    const okMarks = (u: string, v: string) => [
      ...vmark(u, 'active'),
      ...vmark(v, 'compare'),
      mark(edgeId(linkKey(g, u, v)), 'active'),
    ];

    /** BFS from src; true when it finds a clash. */
    function* search(src: string): Generator<BipStep, boolean, void> {
      r.frontier.push(src);
      yield step(`${src} goes in the queue: Q = [${src}].`, ['q.init'], 3, [
        mark(frontierId(src), 'new'),
      ]);
      while (r.frontier.length) {
        const u = r.frontier.shift()!;
        r.u = u;
        r.v = undefined;
        const adj = linked(g, u);
        yield step(
          adj.length
            ? `Dequeue ${u}, on side ${r.side[u]}. ${belong(adj, r.side[u]!)}`
            : `Dequeue ${u}. It has no neighbours.`,
          ['while', 'deq'],
          2,
          vmark(u, 'active'),
        );
        for (const v of adj) {
          const e = linkText(g, u, v);
          const what = examine(u, v);
          if (what === 'new') {
            r.frontier.push(v);
            yield step(
              `${e}: ${v} has no side yet. It goes on side ${r.side[v]}, the other side from ${u}, with π = ${u}, and joins the back of the queue.`,
              ['for', 'if', 'v.side', 'v.pi', 'enq'],
              2,
              newMarks(u, v),
            );
          } else if (what === 'ok') {
            yield step(
              `${e}: ${v} is on side ${r.side[v]} and ${u} on side ${r.side[u]}. Different sides: fine.`,
              ['for', 'if', 'clash.if'],
              3,
              okMarks(u, v),
            );
          } else {
            yield clashStep(u, v);
            return true;
          }
        }
      }
      return false;
    }

    /** DFS VISIT(u); true when it finds a clash. */
    function* visit(u: string): Generator<BipStep, boolean, void> {
      r.frontier.push(u);
      r.u = u;
      r.v = undefined;
      const adj = linked(g, u);
      yield step(
        `VISIT(${u}): ${u} is on side ${r.side[u]}. ${adj.length ? belong(adj, r.side[u]!) : 'It has no neighbours.'}`,
        ['v.sig'],
        2,
        [...vmark(u, 'active'), mark(frontierId(u), 'new')],
      );
      for (const v of adj) {
        const e = linkText(g, u, v);
        const what = examine(u, v);
        if (what === 'new') {
          yield step(
            `${e}: ${v} has no side yet. It goes on side ${r.side[v]}, with π = ${u}. Call VISIT(${v}); ${u}'s call waits.`,
            ['v.for', 'v.if', 'v.side', 'v.pi', 'v.rec'],
            2,
            newMarks(u, v).filter((m) => m.id !== frontierId(v)),
          );
          if (yield* visit(v)) return true;
          r.u = u;
          r.v = undefined;
        } else if (what === 'ok') {
          yield step(
            `${e}: ${v} is on side ${r.side[v]} and ${u} on side ${r.side[u]}. Different sides: fine.`,
            ['v.for', 'v.if', 'v.clash.if'],
            3,
            okMarks(u, v),
          );
        } else {
          yield clashStep(u, v);
          return true;
        }
      }
      r.frontier.pop();
      r.u = r.frontier.at(-1);
      r.v = undefined;
      yield step(
        `Every edge at ${u} joins the two sides. VISIT(${u}) returns${r.u ? ` to ${r.u}` : ''}.`,
        ['v.ok'],
        3,
        vmark(u, 'done'),
      );
      return false;
    }

    for (const src of g.vertices) {
      r.s = src;
      if (r.side[src] !== null) {
        yield step(
          `${src} already has a side (${r.side[src]}). Move on.`,
          ['outer', 'if.new'],
          3,
          vmark(src, 'compare'),
        );
        continue;
      }
      r.side[src] = 0;
      r.order.push(src);
      r.u = undefined;
      r.v = undefined;
      yield step(
        `${src} has no side yet, so it starts a new piece: put it on side 0.${r.order.length > 1 ? ' Nothing found so far can reach it, so this choice is free.' : ''}`,
        ['outer', 'if.new', 's.side'],
        2,
        [...vmark(src, 'new'), mark(cellId('side', src), 'new')],
      );
      const broke = bfs ? yield* search(src) : yield* visit(src);
      if (broke) {
        const cycle = r.cycle!;
        r.u = undefined;
        r.v = undefined;
        r.s = undefined;
        yield step(
          `Not bipartite. The odd cycle ${[...cycle, cycle[0]].join(' → ')} (${plural(cycle.length, 'edge')}) is the proof: no split into two sides works for it.`,
          [bfs ? 'clash' : 'false'],
          1,
          [
            ...cycle.map((x) => mark(vertexId(x), 'error')),
            ...cycleKeys(g, cycle).map((k) => mark(edgeId(k), 'error')),
          ],
        );
        return s;
      }
    }
    r.s = undefined;
    r.u = undefined;
    r.v = undefined;
    r.verdict = 'yes';
    const a = sideList(g, r, 0);
    const b = sideList(g, r, 1);
    yield step(
      `Bipartite. Side 0: ${listWords(a)}. Side 1: ${b.length ? listWords(b) : 'nobody'}. Every edge joins the two sides${g.edges.length ? '' : ' (there are no edges)'}.`,
      ['yes'],
      1,
    );
    return s;
  },
};

const load = loadOp<S, BipSettings, X>({
  make: (graph) => ({ graph }),
  ready: () => 'Press Check to try to split it into two sides.',
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

export function pseudocode(settings: BipSettings): PseudoBlock[] {
  const head = [
    L('sig', 0, 'BIPARTITE(G)', 'Can G be split in two sides?'),
    L('init.for', 1, 'for each vertex u in G.V', 'Every vertex'),
    L('init.side', 2, 'u.side = NIL', 'starts with no side.'),
    L('outer', 1, 'for each vertex s in G.V', 'Take each vertex s in order:'),
    L('if.new', 2, 'if s.side == NIL', 'if it has no side yet,'),
    L('s.side', 3, 's.side = 0', 'put it on side 0.'),
  ];
  if (settings.method === 'dfs') {
    return [
      {
        op: 'run',
        lines: [
          ...head,
          L('call', 3, 'if not VISIT(s)', 'If its piece clashes,'),
          L('false', 4, 'return FALSE', 'G is not bipartite.'),
          L('yes', 1, 'return TRUE', 'No clash anywhere: bipartite.'),
          L('v.sig', 0, 'VISIT(u)', 'Two-color from u:'),
          L('v.for', 1, 'for each v in G.Adj[u]', 'For each neighbour v:'),
          L('v.if', 2, 'if v.side == NIL', 'if it has no side,'),
          L('v.side', 3, 'v.side = 1 - u.side', 'it goes on the other side,'),
          L('v.pi', 3, 'v.π = u', 'found from u,'),
          L('v.rec', 3, 'if not VISIT(v)', 'and if its part clashes,'),
          L('v.fail', 4, 'return FALSE', 'give up.'),
          L('v.clash.if', 2, 'elseif v.side == u.side', 'If v is on u’s side,'),
          L('v.clash', 3, 'return FALSE', 'an odd cycle: give up.'),
          L('v.ok', 1, 'return TRUE', 'All of u’s edges are fine.'),
        ],
      },
    ];
  }
  return [
    {
      op: 'run',
      lines: [
        ...head,
        L('q.init', 3, 'Q = ⟨s⟩', 'Start a queue with s.'),
        L('while', 3, 'while Q ≠ ∅', 'While the queue has vertices,'),
        L('deq', 4, 'u = DEQUEUE(Q)', 'take u from the front.'),
        L('for', 4, 'for each v in G.Adj[u]', 'For each neighbour v:'),
        L('if', 5, 'if v.side == NIL', 'if it has no side,'),
        L('v.side', 6, 'v.side = 1 - u.side', 'it goes on the other side,'),
        L('v.pi', 6, 'v.π = u', 'found from u,'),
        L('enq', 6, 'ENQUEUE(Q, v)', 'and joins the queue.'),
        L('clash.if', 5, 'elseif v.side == u.side', 'If v is on u’s side,'),
        L('clash', 6, 'return FALSE', 'an odd cycle: not bipartite.'),
        L('yes', 1, 'return TRUE', 'No clash anywhere: bipartite.'),
      ],
    },
  ];
}

export function initialSay(s: S): string {
  return `${describeGraph(s.graph).split('. ')[0]}. Press Check: can its vertices be split into two sides so that every edge goes from one side to the other?`;
}

export function initialVars(s: S) {
  return graphVars(s.graph);
}

export function describe(s: S): string {
  return describeGraph(s.graph);
}

/** The scene label: where a run stands. */
export function describeRun(g: Graph, r: BipRun): string {
  if (r.verdict === 'no')
    return `Not bipartite: odd cycle ${r.cycle!.join(', ')}, back to ${r.cycle![0]}.`;
  const a = sideList(g, r, 0);
  const b = sideList(g, r, 1);
  return `${r.verdict === 'yes' ? 'Bipartite. ' : ''}Side 0: ${a.length ? a.join(', ') : 'none'}. Side 1: ${b.length ? b.join(', ') : 'none'}.`;
}
