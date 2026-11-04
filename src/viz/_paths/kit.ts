/**
 * Helpers the shortest-path pages share (dijkstra, bellman-ford, dag-shortest-paths and
 * floyd-warshall), on top of the graph model in ../_graph.
 *
 * All four pages start from the same weighted graph (PATHS_TEXT), so compare mode puts any two
 * of them side by side on the same graph from the first step. It is a DAG with weights of at
 * least 0, so every one of the four can run on it, and its names are not in topological order,
 * so Bellman-Ford needs several passes over its edges.
 *
 * API
 *   PATHS_TEXT, startPathsGraph()   the starting graph
 *   arcs(g)                         every arc u -> v (both ways for an undirected edge), sorted
 *                                   by u, then v, in name order: Bellman-Ford's edge order
 *   arrow(u, v), arcKey(u, v)       "A→B" for narration and "A>B" for ids
 *   num(n), plus(a, w), dist(d)     numbers for narration: "(-2)" in sums, "∞" for null
 *   negativeEdges(g), edgeWords(g, e)
 *   pathOf(pi, v)                   the path back along π, s first (null if π loops)
 *   pathWords(path)                 "A → C → B"
 *   pathWeight(g, path)             the sum of the arc weights along a path
 *   greedy(g, s)                    Dijkstra without its precondition, for the refusal message
 *   shortest(g, s)                  Bellman-Ford distances, π, and a reachable negative cycle
 *   cycleWeight(g, cycle)           the weight of a cycle given as its vertices in order
 *   rotateCycle(cycle)              the same cycle, starting at its first vertex in name order
 *   readyText(g, page)              what to say after a good load on each page
 */
import {
  adjacency,
  compareNames,
  findEdge,
  listWords,
  makeGraph,
  type Edge,
  type Graph,
} from '../_graph/graph';
import { parseGraph } from '../_graph/parse';

/** Weighted, directed and acyclic, 7 vertices: D's distance drops three times in Dijkstra. */
export const PATHS_TEXT = 'A>B:5, A>C:2, B>D:4, B>E:2, C>B:1, C>D:6, D>G:3, E>D:1, E>F:4, F>G:1';
export const PATHS_GRAPH: Graph = parseGraph(PATHS_TEXT) as Graph;

export const startPathsGraph = (): Graph => makeGraph(PATHS_GRAPH);

export interface Arc {
  u: string;
  v: string;
  w: number;
}

const arcCache = new WeakMap<Graph, Arc[]>();

/** Every arc, sorted by tail then head in name order (an undirected edge gives two arcs). */
export function arcs(g: Graph): Arc[] {
  const hit = arcCache.get(g);
  if (hit) return hit;
  const out: Arc[] = [];
  for (const [u, list] of adjacency(g)) for (const a of list) out.push({ u, v: a.v, w: a.w });
  out.sort((a, b) => compareNames(a.u, b.u) || compareNames(a.v, b.v));
  arcCache.set(g, out);
  return out;
}

export const arrow = (u: string, v: string) => `${u}→${v}`;
export const arcKey = (u: string, v: string) => `${u}>${v}`;

/** A number for narration. */
export const num = (n: number) => String(n);
/** "4 + 3" or "4 + (-2)". */
export const plus = (a: number, w: number) => `${a} + ${w < 0 ? `(${w})` : w}`;
/** A distance: null is ∞. */
export const dist = (d: number | null | undefined) =>
  d === null || d === undefined ? '∞' : num(d);

export function negativeEdges(g: Graph): Edge[] {
  return g.edges.filter((e) => e.w < 0);
}

/** How an edge is written in narration: A→B (directed) or A-B (undirected), with its weight. */
export function edgeWords(g: Graph, e: Edge): string {
  return `${g.directed ? arrow(e.u, e.v) : `${e.u}-${e.v}`} (${e.w})`;
}

/** The path from the root to v along π, or null when π goes round a cycle. */
export function pathOf(pi: Record<string, string | null>, v: string): string[] | null {
  const path = [v];
  const seen = new Set(path);
  let x = pi[v] ?? null;
  while (x !== null) {
    if (seen.has(x)) return null;
    seen.add(x);
    path.unshift(x);
    x = pi[x] ?? null;
  }
  return path;
}

export const pathWords = (path: string[]) => path.join(' → ');

/** The weight of an arc u -> v (either way round when undirected). */
export function weightOf(g: Graph, u: string, v: string): number {
  const e = findEdge(g, u, v);
  if (!e) throw new Error(`no edge ${u} ${v}`);
  return e.w;
}

export function pathWeight(g: Graph, path: string[]): number {
  let s = 0;
  for (let i = 0; i + 1 < path.length; i++) s += weightOf(g, path[i]!, path[i + 1]!);
  return s;
}

/** A cycle given as its vertices in order (the last one has an arc back to the first). */
export function cycleWeight(g: Graph, cycle: string[]): number {
  return pathWeight(g, [...cycle, cycle[0]!]);
}

/** The same cycle, starting from its first vertex in name order. */
export function rotateCycle(cycle: string[]): string[] {
  if (cycle.length === 0) return cycle;
  let k = 0;
  cycle.forEach((v, i) => {
    if (compareNames(v, cycle[k]!) < 0) k = i;
  });
  return [...cycle.slice(k), ...cycle.slice(0, k)];
}

/** "A → B → C → A" for a cycle. */
export const cycleWords = (cycle: string[]) => pathWords([...cycle, cycle[0]!]);

export interface Distances {
  d: Record<string, number | null>;
  pi: Record<string, string | null>;
}

/**
 * Dijkstra's greedy order with no check on the weights: extract the smallest d (ties in name
 * order), relax its edges, never revisit it. Only used to say what would go wrong.
 */
export function greedy(g: Graph, s: string): Distances & { order: string[] } {
  const d: Record<string, number | null> = Object.fromEntries(g.vertices.map((v) => [v, null]));
  const pi: Record<string, string | null> = Object.fromEntries(g.vertices.map((v) => [v, null]));
  d[s] = 0;
  const done = new Set<string>();
  const order: string[] = [];
  for (;;) {
    let u: string | null = null;
    for (const v of g.vertices) {
      if (done.has(v) || d[v] === null) continue;
      if (u === null || d[v]! < d[u]!) u = v;
    }
    if (u === null) break;
    done.add(u);
    order.push(u);
    for (const a of adjacency(g).get(u)!) {
      if (done.has(a.v)) continue;
      const nd = d[u]! + a.w;
      if (d[a.v] === null || nd < d[a.v]!) {
        d[a.v] = nd;
        pi[a.v] = u;
      }
    }
  }
  return { d, pi, order };
}

/**
 * Bellman-Ford from s over arcs(g): the true distances when no negative cycle can be reached
 * from s, or that cycle (in arc order) when one can.
 */
export function shortest(g: Graph, s: string): Distances & { cycle: string[] | null } {
  const d: Record<string, number | null> = Object.fromEntries(g.vertices.map((v) => [v, null]));
  const pi: Record<string, string | null> = Object.fromEntries(g.vertices.map((v) => [v, null]));
  d[s] = 0;
  const list = arcs(g);
  for (let pass = 1; pass < g.vertices.length; pass++) {
    let changed = false;
    for (const a of list) {
      if (d[a.u] === null) continue;
      const nd = d[a.u]! + a.w;
      if (d[a.v] === null || nd < d[a.v]!) {
        d[a.v] = nd;
        pi[a.v] = a.u;
        changed = true;
      }
    }
    if (!changed) break;
  }
  for (const a of list) {
    if (d[a.u] === null) continue;
    if (d[a.v] === null || d[a.u]! + a.w < d[a.v]!) {
      pi[a.v] = a.u;
      return { d, pi, cycle: cycleFrom(pi, a.v) };
    }
  }
  return { d, pi, cycle: null };
}

/**
 * Follow π back from v until a vertex repeats. The vertices between the two visits are a cycle;
 * returned in arc order (each one's successor follows it), or null if the walk ends.
 */
export function cycleFrom(pi: Record<string, string | null>, v: string): string[] | null {
  const walk: string[] = [];
  const at = new Map<string, number>();
  let x: string | null = v;
  while (x !== null && !at.has(x)) {
    at.set(x, walk.length);
    walk.push(x);
    x = pi[x] ?? null;
  }
  if (x === null) return null;
  // walk[at(x)..] goes backwards along π; reversed, it follows the arcs.
  return walk.slice(at.get(x)!).reverse();
}

export type PathsPage = 'dijkstra' | 'bellman-ford' | 'dag' | 'floyd';

/** What to say after a good load. */
export function readyText(g: Graph, page: PathsPage): string {
  const first = g.vertices[0]!;
  const neg = negativeEdges(g);
  const press =
    page === 'floyd'
      ? 'Press Run to find the shortest path between every pair of vertices.'
      : `Type a start vertex, such as ${first}, and press Run.`;
  const notes: string[] = [];
  if (!g.weighted && g.edges.length > 0)
    notes.push(
      'Every edge has weight 1 here, so the distances count edges, as in BFS. Give edges weights such as A-B:4.',
    );
  if (neg.length > 0) {
    const words = listWords(neg.map((e) => edgeWords(g, e)));
    if (page === 'dijkstra')
      notes.push(
        `${words} ${neg.length === 1 ? 'has a negative weight' : 'have negative weights'}, and Dijkstra refuses those: press Run to see why.`,
      );
    else if (!g.directed)
      notes.push(
        `${words} ${neg.length === 1 ? 'is an undirected edge' : 'are undirected edges'} with negative weight: going back and forth makes a negative cycle.`,
      );
  }
  if (page === 'dag' && g.directed === false && g.edges.length > 0)
    notes.push('This graph is undirected, so it has cycles: DAG shortest paths needs a DAG.');
  return [press, ...notes].join(' ');
}
