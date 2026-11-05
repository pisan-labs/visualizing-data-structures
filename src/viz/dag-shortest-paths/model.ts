/**
 * Shortest paths in a DAG, CLRS style: DAG-SHORTEST-PATHS(G, w, s) sorts the vertices
 * topologically, then relaxes the edges out of each vertex in that order. Every edge is relaxed
 * exactly once, negative weights are fine, and the whole thing is O(V + E).
 *
 * The topological sort is CLRS's: depth-first search over all vertices in name order (and
 * neighbours in name order), putting each vertex at the front of a list as it finishes. If the
 * search meets a gray vertex, the edge closes a cycle; the run stops there, names the cycle and
 * draws it. An undirected graph with an edge is refused at once: every edge goes both ways, so
 * its first edge is a cycle by itself.
 *
 * Settings: `goal` finds shortest paths (CLRS) or longest paths, the critical path of a
 * schedule: every d starts at -∞ and RELAX keeps the larger total. That is the same as negating
 * every weight and finding shortest paths, which is only safe because a DAG has no cycle.
 *
 * The state is just the graph; a run's bookkeeping travels in the steps' `extra`.
 */
import type { Mark, OpSpec, PseudoBlock, Scalar, Step } from '../../engine/types';
import type { GraphTemplate } from '../../layouts/graph';
import { edgeId, labelId, vertexId, weightId } from '../../layouts/graph';
import { adjacency, describeGraph, edgeKey, listWords, plural, type Graph } from '../_graph/graph';
import { graphVars, loadOp, vertexArg, type GraphState } from '../_graph/kit';
import {
  arrow,
  cycleWeight,
  cycleWords,
  pathOf,
  pathWords,
  plus,
  readyText,
  rotateCycle,
  startPathsGraph,
} from '../_paths/kit';
import { dText } from '../_paths/view';

export type DagState = GraphState;
export type Goal = 'shortest' | 'longest';
export type Color = 'white' | 'gray' | 'black';

export interface DagSettings {
  [key: string]: Scalar;
  goal: Goal;
  layout: GraphTemplate;
}

export const defaults: DagSettings = { goal: 'shortest', layout: 'force' };

/** One run's bookkeeping, as it stands at a step. */
export interface DagRun {
  s: string;
  longest: boolean;
  phase: 'sort' | 'relax' | 'done' | 'cycle';
  color: Record<string, Color>;
  /** The vertices DFS is inside of (gray), outermost first. */
  path: string[];
  /** The list: finished vertices, front first. In the end, the topological order. */
  order: string[];
  /** null is ∞ (or -∞ for longest paths). */
  d: Record<string, number | null>;
  pi: Record<string, string | null>;
  /** The position in the order of the vertex whose edges are relaxed, or -1. */
  k: number;
  /** Edges RELAX has looked at, by edge key. */
  relaxed: Record<string, true>;
  u?: string;
  v?: string;
  relax: number;
  updates: number;
  /** The cycle that stopped the sort, in arc order. */
  cycle?: string[];
}

export interface DagExtra {
  run?: DagRun;
}

type S = DagState;
type X = DagExtra;
type Op = OpSpec<S, DagSettings, X>;
type DagStep = Step<S, X>;

export function init(): S {
  return { graph: startPathsGraph() };
}

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });
const vmark = (v: string, role: Mark['role']) => [mark(vertexId(v), role)];

/** Panel ids (see view.ts). */
export const cellId = (row: 'd' | 'pi', v: string) => `tbl-${row}-${v}`;
export const listId = (v: string) => `L-${v}`;

function clone(r: DagRun): DagRun {
  return {
    ...r,
    color: { ...r.color },
    path: [...r.path],
    order: [...r.order],
    d: { ...r.d },
    pi: { ...r.pi },
    relaxed: { ...r.relaxed },
    cycle: r.cycle && [...r.cycle],
  };
}

function runVars(g: Graph, r: DagRun): Record<string, Scalar> {
  return {
    ...graphVars(g),
    s: r.s,
    phase: r.phase,
    u: r.u ?? '–',
    v: r.v ?? '–',
    L: r.order.length ? r.order.join(' ') : 'empty',
    relax: r.relax,
    updates: r.updates,
  };
}

/** The final answer of a run, in the code tabs' words. */
export function runSummary(g: Graph, r: DagRun): string {
  if (r.cycle) return `cycle ${rotateCycle(r.cycle).join(' ')}`;
  const inf = r.longest ? '-inf' : 'inf';
  const d = g.vertices.map((v) => (r.d[v] === null ? inf : String(r.d[v]))).join(' ');
  const pi = g.vertices.map((v) => r.pi[v] ?? '-').join(' ');
  return `${d} | ${pi}`;
}

/** The path from the critical path's end back to s: the reached vertex with the largest d. */
export function criticalEnd(g: Graph, r: DagRun): string | null {
  let best: string | null = null;
  for (const v of g.vertices)
    if (r.d[v] !== null && (best === null || r.d[v]! > r.d[best]!)) best = v;
  return best;
}

const run: Op = {
  label: 'Run from',
  arity: 1,
  *run(s, [arg], { settings }) {
    const g = s.graph;
    const longest = settings.goal === 'longest';
    const name = longest ? 'Longest paths' : 'DAG shortest paths';
    const a0 = vertexArg(g, arg);
    if ('error' in a0) {
      yield {
        state: s,
        marks: [],
        say: `${name} needs a start vertex. ${a0.error}`,
        lines: ['sig'],
        level: 1,
        vars: graphVars(g),
      } satisfies DagStep;
      return s;
    }
    const src = a0.v;
    const r: DagRun = {
      s: src,
      longest,
      phase: 'sort',
      color: Object.fromEntries(g.vertices.map((v) => [v, 'white' as Color])),
      path: [],
      order: [],
      d: Object.fromEntries(g.vertices.map((v) => [v, null])),
      pi: Object.fromEntries(g.vertices.map((v) => [v, null])),
      k: -1,
      relaxed: {},
      relax: 0,
      updates: 0,
    };
    const step = (say: string, lines: string[], level: 1 | 2 | 3, marks: Mark[] = []): DagStep => ({
      state: s,
      marks,
      say,
      lines,
      level,
      vars: runVars(g, r),
      extra: { run: clone(r) },
    });
    const elsewhere = 'Dijkstra (/dijkstra/) and Bellman-Ford (/bellman-ford/) work with cycles.';

    if (!g.directed && g.edges.length > 0) {
      const e = g.edges[0]!;
      r.cycle = [e.u, e.v];
      r.phase = 'cycle';
      yield step(
        `${name} will not run: this graph is undirected, so every edge goes both ways, and ${e.u}-${e.v} alone is the cycle ${e.u} → ${e.v} → ${e.u}. A topological order needs a directed graph with no cycles. ${elsewhere}`,
        ['sig'],
        1,
        [
          ...vmark(e.u, 'error'),
          ...vmark(e.v, 'error'),
          mark(edgeId(`${e.u}-${e.v}`), 'error'),
          mark(weightId(`${e.u}-${e.v}`), 'error'),
        ],
      );
      return s;
    }

    yield step(
      `${name} from ${src}. First, put the vertices in topological order: run depth-first search over the whole graph, in name order, and put each vertex at the front of a list L as it finishes.`,
      ['topo', 'topo.if'],
      2,
    );

    // CLRS's DFS(G), recursive, stopping at the first edge back to a gray vertex.
    const visit = function* (u: string, from: string | null): Generator<DagStep, boolean, void> {
      r.color[u] = 'gray';
      r.path.push(u);
      r.u = u;
      r.v = undefined;
      yield step(
        from === null
          ? `${u} is still white: start a search there. Color ${u} gray.`
          : `Visit ${u} from ${from}: color it gray.`,
        from === null ? ['topo.if', 'visit', 'gray'] : ['for', 'white', 'visit', 'gray'],
        from === null ? 2 : 3,
        [...vmark(u, 'visit')],
      );
      for (const { v } of adjacency(g).get(u)!) {
        r.u = u;
        r.v = v;
        const key = edgeKey(g, u, v);
        if (r.color[v] === 'gray') {
          r.cycle = r.path.slice(r.path.indexOf(v));
          r.phase = 'cycle';
          const c = rotateCycle(r.cycle);
          const marks = r.cycle.flatMap((x, k) => {
            const y = r.cycle![(k + 1) % r.cycle!.length]!;
            const ek = edgeKey(g, x, y);
            return [
              mark(vertexId(x), 'error'),
              mark(edgeId(ek), 'error'),
              mark(weightId(ek), 'error'),
            ];
          });
          yield step(
            `${arrow(u, v)} goes back to ${v}, which is still gray: the search reached ${u} from ${v} along ${pathWords(r.cycle)}. So ${cycleWords(c)} is a cycle${g.weighted ? ` (of weight ${cycleWeight(g, c)})` : ''}, and a graph with a cycle has no topological order, so ${longest ? 'longest paths' : 'DAG shortest paths'} cannot run here. ${elsewhere}`,
            ['for', 'cycle'],
            1,
            marks,
          );
          return false;
        }
        if (r.color[v] === 'black') {
          yield step(
            `${arrow(u, v)}: ${v} is black, already finished and in the list. Nothing to do.`,
            ['for', 'cycle', 'white'],
            3,
            [...vmark(u, 'active'), mark(edgeId(key), 'active')],
          );
          continue;
        }
        const ok = yield* visit(v, u);
        if (!ok) return false;
        r.u = u;
      }
      r.color[u] = 'black';
      r.path.pop();
      r.order.unshift(u);
      r.v = undefined;
      yield step(
        `${u} has no white ${g.directed ? 'out-' : ''}neighbours left, so it finishes: color it black and put it at the front of L. L = ${r.order.join(', ')}.`,
        ['black', 'front'],
        2,
        [...vmark(u, 'done'), mark(listId(u), 'visit')],
      );
      return true;
    };
    for (const u of g.vertices) {
      if (r.color[u] !== 'white') continue;
      const ok = yield* visit(u, null);
      if (!ok) return s;
    }
    r.u = undefined;
    r.v = undefined;
    r.phase = 'relax';
    r.d[src] = 0;
    yield step(
      `Every vertex has finished, so L = ${r.order.join(', ')} is a topological order: every edge goes from left to right in it. Now ${
        longest
          ? `every d starts at -∞ and π at NIL, and ${src}.d = 0. Longest paths keep the larger total, which is the same as negating every weight and keeping the smaller: the heaviest path with w is the lightest with -w. That trick is only safe because a DAG has no cycle to go round.`
          : `every d starts at ∞ and π at NIL, and ${src}.d = 0.`
      }`,
      ['init', ...(longest ? ['neg'] : [])],
      2,
      [mark(cellId('d', src), 'visit'), ...vmark(src, 'visit')],
    );

    const better = (nd: number, old: number | null) =>
      old === null || (longest ? nd > old : nd < old);
    const inf = longest ? '-∞' : '∞';
    for (let k = 0; k < r.order.length; k++) {
      const u = r.order[k]!;
      r.k = k;
      r.u = u;
      r.v = undefined;
      const adj = adjacency(g).get(u)!;
      const du = r.d[u] ?? null;
      if (du === null) {
        r.relax += adj.length;
        yield step(
          `Next in L: ${u}, with d = ${inf}: ${src} cannot reach ${u}${r.order.indexOf(src) > k ? `, because ${u} comes before ${src} in the order` : ''}. ${adj.length ? `Relaxing its ${plural(adj.length, 'edge')} changes nothing.` : `${u} has no edges out.`}`,
          ['order', 'relax', 'if'],
          2,
          [mark(labelId(u), 'stale'), mark(listId(u), 'active')],
        );
        continue;
      }
      yield step(
        `Next in L: ${u}, with d = ${du}. Every edge into ${u} comes from earlier in L, so d[${u}] is final already.${adj.length ? ` Relax its edges: ${listWords(adj.map((x) => arrow(u, x.v)))}.` : ` ${u} has no edges out.`}`,
        ['order'],
        2,
        [...vmark(u, 'active'), mark(listId(u), 'active'), mark(cellId('d', u), 'done')],
      );
      for (const { v, w } of adj) {
        r.v = v;
        r.relax++;
        const key = edgeKey(g, u, v);
        r.relaxed[key] = true;
        const nd = du + w;
        const old = r.d[v] ?? null;
        const edgeMarks = [mark(edgeId(key), 'active'), mark(weightId(key), 'active')];
        const sum = `d[${u}] + w(${u}, ${v}) = ${plus(du, w)} = ${nd}`;
        if (better(nd, old)) {
          r.d[v] = nd;
          r.pi[v] = u;
          r.updates++;
          yield step(
            `Relax ${arrow(u, v)}: ${sum}, ${longest ? 'more' : 'less'} than d[${v}] = ${dText(old, longest)}. So d[${v}] = ${nd} and π[${v}] = ${u}.`,
            ['relax', 'if', 'set.d', 'set.pi'],
            2,
            [
              ...vmark(u, 'active'),
              ...vmark(v, 'visit'),
              ...edgeMarks,
              mark(cellId('d', v), 'visit'),
              mark(cellId('pi', v), 'visit'),
            ],
          );
        } else {
          yield step(
            `Relax ${arrow(u, v)}: ${sum}, not ${longest ? 'more' : 'less'} than d[${v}] = ${old}. Nothing changes.`,
            ['relax', 'if'],
            2,
            [...vmark(u, 'active'), ...vmark(v, 'compare'), ...edgeMarks],
          );
        }
      }
    }
    r.k = -1;
    r.u = undefined;
    r.v = undefined;
    r.phase = 'done';
    // Longest paths: the critical path stands out.
    const end = longest ? criticalEnd(g, r) : null;
    const critical = end ? pathOf(r.pi, end)! : [];
    yield step(ending(g, r), ['order'], 1, [
      ...g.vertices.filter((v) => r.d[v] === null).map((v) => mark(labelId(v), 'stale')),
      ...critical.slice(1).flatMap((v, k) => {
        const key = edgeKey(g, critical[k]!, v);
        return [mark(edgeId(key), 'active'), mark(weightId(key), 'active')];
      }),
    ]);
    return s;
  },
};

function ending(g: Graph, r: DagRun): string {
  const lost = g.vertices.filter((v) => r.d[v] === null);
  const others = g.vertices.filter((v) => v !== r.s && r.d[v] !== null);
  const parts = [
    `Done: each of the ${plural(g.edges.length, 'edge')} was relaxed exactly once, in topological order.`,
  ];
  if (others.length === 0) parts.push(`Only ${r.s} itself is reachable, at d = 0.`);
  else {
    parts.push(
      `${r.longest ? 'Longest' : 'Shortest'} distances from ${r.s}: ${others.map((v) => `${v} ${r.d[v]}`).join(', ')}.`,
    );
    if (r.longest) {
      const end = criticalEnd(g, r)!;
      parts.push(
        `The critical path is ${pathWords(pathOf(r.pi, end)!)}, total ${r.d[end]}: nothing that depends on ${r.s} can finish sooner.`,
      );
    } else {
      parts.push('The π edges form the shortest-path tree.');
    }
  }
  if (lost.length)
    parts.push(
      `${listWords(lost)} cannot be reached from ${r.s}, so ${lost.length === 1 ? 'it keeps' : 'they keep'} d = ${r.longest ? '-∞' : '∞'}.`,
    );
  return parts.join(' ');
}

const load = loadOp<S, DagSettings, X>({
  make: (graph) => ({ graph }),
  ready: (g) => readyText(g, 'dag'),
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

export function pseudocode(settings: DagSettings): PseudoBlock[] {
  const longest = settings.goal === 'longest';
  const lines = [
    longest
      ? L('sig', 0, 'DAG-LONGEST-PATHS(G, w, s)', 'Longest paths from s in a DAG:')
      : L('sig', 0, 'DAG-SHORTEST-PATHS(G, w, s)', 'Shortest paths from s in a DAG:'),
    L('topo', 1, 'for each vertex u in G.V', 'Sort topologically: for each vertex,'),
    L('topo.if', 2, 'if u.color == WHITE: VISIT(u)', 'if it is unvisited, search from it.'),
    L('init', 1, 'INITIALIZE-SINGLE-SOURCE(G, s)', 'Every d = ∞ and π = NIL; s.d = 0.'),
    ...(longest ? [L('neg', 1, '// with -∞ in place of ∞', 'Here, start every d at -∞.')] : []),
    L('order', 1, 'for each u in L, in order', 'For each vertex in topological order,'),
    L('relax', 2, 'for each v in G.Adj[u]', 'for each edge u → v,'),
    longest
      ? L('if', 3, 'if v.d < u.d + w(u, v)', 'if going through u is longer,')
      : L('if', 3, 'if v.d > u.d + w(u, v)', 'if going through u is shorter,'),
    L('set.d', 4, 'v.d = u.d + w(u, v)', 'set v.d to that'),
    L('set.pi', 4, 'v.π = u', 'and make u the parent of v.'),
    L('visit', 0, 'VISIT(u)', 'Depth-first search from u:'),
    L('gray', 1, 'u.color = GRAY', 'u is in progress (gray).'),
    L('for', 1, 'for each v in G.Adj[u]', 'For each edge u → v:'),
    L('cycle', 2, 'if v.color == GRAY: cycle', 'back to a gray vertex is a cycle;'),
    L('white', 2, 'if v.color == WHITE: VISIT(v)', 'search from v if it is new.'),
    L('black', 1, 'u.color = BLACK', 'u is finished (black)'),
    L('front', 1, 'put u at the front of L', 'and goes to the front of the list.'),
  ];
  return [{ op: 'run', lines }];
}

export function initialSay(s: S): string {
  return `${describeGraph(s.graph).split('. ')[0]}. Type a start vertex, such as ${s.graph.vertices[0]}, and press Run: sort the vertices topologically, then relax each vertex's edges once, in that order.`;
}

export function initialVars(s: S) {
  return graphVars(s.graph);
}

export function describe(s: S): string {
  return describeGraph(s.graph);
}

/** The scene label: where a run stands. */
export function describeRun(g: Graph, r: DagRun): string {
  const seen = g.vertices.filter((v) => r.d[v] !== null);
  const head = `${r.longest ? 'Longest paths' : 'DAG shortest paths'} from ${r.s}.`;
  if (r.phase === 'sort' || r.phase === 'cycle') {
    const cycle = r.cycle ? ` Cycle: ${cycleWords(rotateCycle(r.cycle))}.` : '';
    return `${head} Sorting: L = ${r.order.length ? r.order.join(', ') : 'empty'}.${cycle}`;
  }
  return `${head} Order: ${r.order.join(', ')}. Distances so far: ${seen.map((v) => `${v} ${r.d[v]}`).join(', ')}.`;
}
