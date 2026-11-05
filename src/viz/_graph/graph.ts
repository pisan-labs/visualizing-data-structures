/**
 * The graph model shared by every graph page (representations, BFS, DFS, and the shortest-path,
 * spanning-tree, flow and matching pages that follow).
 *
 * A graph is plain data, so it can sit in a step's state and compare with toEqual:
 *
 *   interface Graph { directed; weighted; vertices: string[]; edges: Edge[] }
 *   interface Edge  { u; v; w }
 *
 * - Vertex names are 1 to 3 letters, digits or underscores (`NAME`). They are kept in name
 *   order (`compareNames`): numbers by value, everything else alphabetically, capitals first.
 *   So 2 comes before 10, and B before C.
 * - Edges are kept sorted by (u, v) in name order. In an undirected graph each edge is stored
 *   once, with u before v. A directed graph stores each arc u -> v; an edge both ways is two arcs.
 * - An unweighted graph gives every edge weight 1. A weighted graph draws and prints weights.
 * - There are no loops (u -> u) and no parallel edges.
 *
 * Neighbours always come in name order (`neighbours`, `adjacency`), so every page, every
 * practice answer and every code tab visits them in the same order.
 *
 * API
 *   makeGraph({ directed, weighted, vertices, edges })  normalized copy (sorted, canonical u-v)
 *   neighbours(g, u), adjacency(g)    out-neighbours in name order (with weights)
 *   inNeighbours(g, v)                in-neighbours in name order
 *   findEdge(g, u, v), hasVertex(g, v), edgeKey(g, u, v) ("A-B": u before v when undirected)
 *   withVertex / withoutVertex / withEdge / withoutEdge   pure updates
 *   degree, outDegree, inDegree, components (weak), isAcyclic, isForest
 *   letters(n)                         A, B, C, ... for generated graphs
 *   summary(g), describeGraph(g)       short and screen-reader descriptions
 *
 * Text input and output live in ./parse.ts, presets in ./presets.ts, page helpers in ./kit.ts,
 * and the drawing in src/layouts/graph.ts.
 */

export interface Edge {
  /** The tail of an arc; in an undirected graph, the end that comes first in name order. */
  u: string;
  v: string;
  /** The weight; 1 when the graph is unweighted. */
  w: number;
}

export interface Graph {
  directed: boolean;
  weighted: boolean;
  /** In name order. */
  vertices: string[];
  /** Sorted by u, then v, in name order. */
  edges: Edge[];
}

/** Limits that keep a graph readable on a phone. */
export const MAX_VERTICES = 16;
export const MAX_EDGES = 50;
export const MAX_NAME = 3;
export const MIN_WEIGHT = -99;
export const MAX_WEIGHT = 999;
export const NAME = /^[A-Za-z0-9_]{1,3}$/;

// ---------------------------------------------------------------------------------------------
// Name order

/** Runs of digits and of everything else: "v10" -> ["v", "10"]. */
function runs(s: string): string[] {
  return s.match(/\d+|\D+/g) ?? [];
}

/**
 * Natural order: digit runs compare by value, other runs by character code, and a digit run
 * comes before a letter run. "2" < "10", "B" < "C", "v2" < "v10". Ties (such as "01" and "1")
 * fall back to plain string order, so this is a total order.
 */
export function compareNames(a: string, b: string): number {
  if (a === b) return 0;
  const ra = runs(a);
  const rb = runs(b);
  for (let i = 0; i < Math.min(ra.length, rb.length); i++) {
    const x = ra[i]!;
    const y = rb[i]!;
    const dx = x.charCodeAt(0) >= 48 && x.charCodeAt(0) <= 57;
    const dy = y.charCodeAt(0) >= 48 && y.charCodeAt(0) <= 57;
    if (dx && dy) {
      const nx = x.replace(/^0+(?=\d)/, '');
      const ny = y.replace(/^0+(?=\d)/, '');
      if (nx.length !== ny.length) return nx.length - ny.length;
      if (nx !== ny) return nx < ny ? -1 : 1;
    } else if (dx !== dy) {
      return dx ? -1 : 1;
    } else if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  if (ra.length !== rb.length) return ra.length - rb.length;
  return a < b ? -1 : 1;
}

export const sortNames = (names: Iterable<string>): string[] => [...names].sort(compareNames);

/** A, B, C, ... for generated graphs (and the rows of a matrix). At most 26. */
export function letters(n: number): string[] {
  return Array.from({ length: Math.min(n, 26) }, (_, i) => String.fromCharCode(65 + i));
}

// ---------------------------------------------------------------------------------------------
// Building

export interface GraphSpec {
  directed: boolean;
  weighted: boolean;
  vertices?: Iterable<string>;
  edges?: Edge[];
}

const byEnds = (a: Edge, b: Edge) => compareNames(a.u, b.u) || compareNames(a.v, b.v);

/**
 * A normalized graph: vertices (plus every edge end) in name order, undirected edges with u
 * before v, edges sorted, weights 1 when unweighted. Validation is the parser's job.
 */
export function makeGraph(spec: GraphSpec): Graph {
  const names = new Set(spec.vertices ?? []);
  const edges = (spec.edges ?? []).map((e) => {
    names.add(e.u);
    names.add(e.v);
    const w = spec.weighted ? e.w : 1;
    return !spec.directed && compareNames(e.u, e.v) > 0 ? { u: e.v, v: e.u, w } : { ...e, w };
  });
  return {
    directed: spec.directed,
    weighted: spec.weighted,
    vertices: sortNames(names),
    edges: edges.sort(byEnds),
  };
}

export const emptyGraph = (directed = false, weighted = false): Graph =>
  makeGraph({ directed, weighted });

// ---------------------------------------------------------------------------------------------
// Queries

export interface Arc {
  v: string;
  w: number;
}

const adjCache = new WeakMap<Graph, Map<string, Arc[]>>();
const inCache = new WeakMap<Graph, Map<string, Arc[]>>();

/** Out-neighbours of every vertex, in name order, with weights. Cached per graph object. */
export function adjacency(g: Graph): Map<string, Arc[]> {
  let adj = adjCache.get(g);
  if (adj) return adj;
  adj = new Map(g.vertices.map((v) => [v, [] as Arc[]]));
  for (const e of g.edges) {
    adj.get(e.u)?.push({ v: e.v, w: e.w });
    if (!g.directed) adj.get(e.v)?.push({ v: e.u, w: e.w });
  }
  for (const list of adj.values()) list.sort((a, b) => compareNames(a.v, b.v));
  adjCache.set(g, adj);
  return adj;
}

/** In-neighbours of every vertex (the same as adjacency for an undirected graph). */
export function inAdjacency(g: Graph): Map<string, Arc[]> {
  if (!g.directed) return adjacency(g);
  let adj = inCache.get(g);
  if (adj) return adj;
  adj = new Map(g.vertices.map((v) => [v, [] as Arc[]]));
  for (const e of g.edges) adj.get(e.v)?.push({ v: e.u, w: e.w });
  for (const list of adj.values()) list.sort((a, b) => compareNames(a.v, b.v));
  inCache.set(g, adj);
  return adj;
}

/** Out-neighbours of u in name order (all neighbours when undirected). */
export function neighbours(g: Graph, u: string): string[] {
  return (adjacency(g).get(u) ?? []).map((a) => a.v);
}

export function inNeighbours(g: Graph, v: string): string[] {
  return (inAdjacency(g).get(v) ?? []).map((a) => a.v);
}

export const hasVertex = (g: Graph, v: string): boolean => g.vertices.includes(v);

/** The edge u -> v (either way round when undirected), or undefined. */
export function findEdge(g: Graph, u: string, v: string): Edge | undefined {
  return g.edges.find((e) => (e.u === u && e.v === v) || (!g.directed && e.u === v && e.v === u));
}

/** A stable key for the edge between u and v: "A-B", with u first when the graph is directed. */
export function edgeKey(g: Graph, u: string, v: string): string {
  return !g.directed && compareNames(u, v) > 0 ? `${v}-${u}` : `${u}-${v}`;
}

export const keyOf = (e: Edge): string => `${e.u}-${e.v}`;

/** How the edge is written: A-B (u before v) or A>B. */
export const edgeText = (g: Graph, u: string, v: string): string =>
  g.directed ? `${u}>${v}` : compareNames(u, v) > 0 ? `${v}-${u}` : `${u}-${v}`;

export const outDegree = (g: Graph, v: string): number => adjacency(g).get(v)?.length ?? 0;
export const inDegree = (g: Graph, v: string): number => inAdjacency(g).get(v)?.length ?? 0;
/** Number of edge ends at v (out plus in when directed). */
export const degree = (g: Graph, v: string): number =>
  g.directed ? outDegree(g, v) + inDegree(g, v) : outDegree(g, v);

/** Weakly connected components, each in name order, ordered by their first vertex. */
export function components(g: Graph): string[][] {
  const seen = new Set<string>();
  const out: string[][] = [];
  const both = (v: string) => [...neighbours(g, v), ...inNeighbours(g, v)];
  for (const s of g.vertices) {
    if (seen.has(s)) continue;
    const comp: string[] = [];
    const stack = [s];
    seen.add(s);
    while (stack.length) {
      const u = stack.pop()!;
      comp.push(u);
      for (const v of both(u)) {
        if (!seen.has(v)) {
          seen.add(v);
          stack.push(v);
        }
      }
    }
    out.push(sortNames(comp));
  }
  return out;
}

/** A directed graph with no cycle (a DAG). Undirected graphs count as acyclic when forests. */
export function isAcyclic(g: Graph): boolean {
  if (!g.directed) return isForest(g);
  const indeg = new Map(g.vertices.map((v) => [v, inDegree(g, v)]));
  const ready = g.vertices.filter((v) => indeg.get(v) === 0);
  let done = 0;
  while (ready.length) {
    const u = ready.pop()!;
    done++;
    for (const v of neighbours(g, u)) {
      const d = indeg.get(v)! - 1;
      indeg.set(v, d);
      if (d === 0) ready.push(v);
    }
  }
  return done === g.vertices.length;
}

/** An undirected graph with no cycle. */
export function isForest(g: Graph): boolean {
  return !g.directed && g.edges.length === g.vertices.length - components(g).length;
}

// ---------------------------------------------------------------------------------------------
// Pure updates (the parser and the pages validate first)

export function withVertex(g: Graph, name: string): Graph {
  return hasVertex(g, name) ? g : makeGraph({ ...g, vertices: [...g.vertices, name] });
}

export function withoutVertex(g: Graph, name: string): Graph {
  return makeGraph({
    ...g,
    vertices: g.vertices.filter((v) => v !== name),
    edges: g.edges.filter((e) => e.u !== name && e.v !== name),
  });
}

export function withEdge(g: Graph, u: string, v: string, w = 1): Graph {
  return makeGraph({ ...g, edges: [...g.edges, { u, v, w }] });
}

export function withoutEdge(g: Graph, u: string, v: string): Graph {
  const e = findEdge(g, u, v);
  return e ? makeGraph({ ...g, edges: g.edges.filter((x) => x !== e) }) : g;
}

// ---------------------------------------------------------------------------------------------
// Words

export const plural = (n: number, word: string, many = `${word}s`): string =>
  `${n} ${n === 1 ? word : many}`;

/** "an undirected graph with 6 vertices and 7 edges" */
export function summary(g: Graph): string {
  const kind = `${g.weighted ? 'weighted ' : ''}${g.directed ? 'directed' : 'undirected'}`;
  return `${/^[aeiou]/.test(kind) ? 'an' : 'a'} ${kind} graph with ${plural(
    g.vertices.length,
    'vertex',
    'vertices',
  )} and ${plural(g.edges.length, 'edge')}`;
}

/** "A, B and C" */
export function listWords(xs: string[]): string {
  if (xs.length <= 1) return xs.join('');
  return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
}

/** Screen-reader description: the summary, then each vertex's neighbours. */
export function describeGraph(g: Graph): string {
  const arrow = g.directed ? 'to' : 'with';
  const parts = g.vertices.map((v) => {
    const arcs = adjacency(g).get(v) ?? [];
    if (arcs.length === 0) return `${v} has no edges${g.directed ? ' out' : ''}`;
    const items = arcs.map((a) => (g.weighted ? `${a.v} (weight ${a.w})` : a.v));
    return `${v} ${arrow} ${items.join(', ')}`;
  });
  const s = summary(g);
  return `${s[0]!.toUpperCase()}${s.slice(1)}. ${parts.join('; ')}.`;
}
