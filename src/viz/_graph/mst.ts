/**
 * Helpers the two minimum-spanning-tree pages share (prim and kruskal), on top of graph.ts, parse.ts and presets.ts here.
 *
 * Both pages start from the same weighted undirected graph (MST_TEXT), so compare mode puts
 * Prim and Kruskal side by side on it from the first step. Its weights are such that the
 * minimum spanning tree is unique, so both pages end with the same tree.
 *
 * API
 *   MST_TEXT, startMstGraph()   the starting graph
 *   directedRefusal(page)       why a directed graph is refused
 *   readyText(g, page)          what to say after a good load
 *   edgeName(e), edgeWords(e)   "A-B" and "A-B (4)"
 *   treeWords(g, edges)         "7 edges, total weight 19" plus the forest note
 *   mstPresets(run)             presets that load a graph and run
 *   weighted graphs for presets, practice and tests: randomMst, distinctWeights, fewWeights,
 *   twoPiecesMst, gridMst, completeMst, negativeMst
 */
import type { Rng } from '../../engine/rng';
import type { OpCall, Preset } from '../../engine/types';
import { components, listWords, makeGraph, plural, type Edge, type Graph } from './graph';
import { parseGraph } from './parse';
import { completeGraph, gridGraph, loadCall, randomGraph, shuffle, twoComponents } from './presets';

/** Undirected, 8 vertices and 14 edges, one minimum spanning tree of weight 19. */
export const MST_TEXT =
  'A-B:4, A-C:2, A-D:6, B-D:5, B-E:3, C-D:1, C-F:7, D-E:8, D-F:4, D-G:6, E-G:2, F-G:5, F-H:3, G-H:9';
export const MST_GRAPH: Graph = parseGraph(MST_TEXT) as Graph;
export const startMstGraph = (): Graph => makeGraph(MST_GRAPH);

export type MstPage = 'prim' | 'kruskal';
const NAMES: Record<MstPage, string> = { prim: "Prim's algorithm", kruskal: "Kruskal's algorithm" };

export function directedRefusal(page: MstPage): string {
  return `${NAMES[page]} needs an undirected graph: a spanning tree joins vertices, and its edges have no direction. This graph is directed. Load it with - instead of >, such as A-B:4, and run again.`;
}

export function readyText(g: Graph, page: MstPage): string {
  if (g.directed) return `This graph is directed, and ${NAMES[page]} needs an undirected one.`;
  const notes = [
    page === 'prim'
      ? 'Press Run to grow a minimum spanning tree from the start vertex in the options.'
      : 'Press Run to build a minimum spanning tree, lightest edge first.',
  ];
  if (!g.weighted && g.edges.length > 0)
    notes.push(
      'Every edge has weight 1 here, so every spanning tree is a minimum one. Give edges weights such as A-B:4.',
    );
  const pieces = components(g).length;
  if (pieces > 1)
    notes.push(
      `The graph has ${pieces} separate pieces, so the result is a spanning forest: one tree per piece.`,
    );
  return notes.join(' ');
}

export const edgeName = (e: { u: string; v: string }) => `${e.u}-${e.v}`;
export const edgeWords = (e: Edge) => `${e.u}-${e.v} (${e.w})`;

/** "7 edges, total weight 19", and whether it is a tree or a forest. */
export function treeWords(g: Graph, edges: Edge[]): string {
  const total = edges.reduce((a, e) => a + e.w, 0);
  const pieces = components(g).length;
  const what =
    g.vertices.length <= 1
      ? 'With one vertex, the spanning tree has no edges.'
      : pieces === 1
        ? `The minimum spanning tree has ${plural(edges.length, 'edge')}, V − 1 = ${g.vertices.length - 1}, with total weight ${total}: ${listWords(edges.map(edgeWords))}.`
        : `The graph has ${pieces} pieces, so this is a minimum spanning forest of ${pieces} trees: ${plural(edges.length, 'edge')}, V − ${pieces} = ${g.vertices.length - pieces}, total weight ${total}${edges.length ? `: ${listWords(edges.map(edgeWords))}` : ''}.`;
  return what;
}

// ---------------------------------------------------------------------------------------------
// Graphs for presets, practice and tests (undirected, weighted)

function reweigh(g: Graph, weights: number[]): Graph {
  return makeGraph({
    directed: false,
    weighted: true,
    vertices: g.vertices,
    edges: g.edges.map((e, i) => ({ ...e, w: weights[i]! })),
  });
}

const randomWeights = (rng: Rng, g: Graph, lo = 1, hi = 9) => g.edges.map(() => rng.int(lo, hi));

export function randomMst(rng: Rng, n: number, density = 0.25): Graph {
  const g = randomGraph(rng, Math.max(2, n), { density });
  return reweigh(g, randomWeights(rng, g));
}

/** Every weight different, so there is exactly one minimum spanning tree. */
export function distinctWeights(rng: Rng, n: number): Graph {
  const g = randomGraph(rng, Math.max(2, n), { density: 0.3 });
  return reweigh(
    g,
    shuffle(
      rng,
      g.edges.map((_, i) => i + 1),
    ),
  );
}

/** Weights 1 to 3: lots of ties, so ties decide which tree comes out. */
export function fewWeights(rng: Rng, n: number): Graph {
  const g = randomGraph(rng, Math.max(2, n), { density: 0.35 });
  return reweigh(g, randomWeights(rng, g, 1, 3));
}

export function twoPiecesMst(rng: Rng, n: number): Graph {
  const g = twoComponents(rng, Math.max(4, n));
  return reweigh(g, randomWeights(rng, g));
}

export function gridMst(rng: Rng, n: number): Graph {
  const g = gridGraph(Math.max(4, n));
  return reweigh(g, randomWeights(rng, g));
}

export function completeMst(rng: Rng, n: number): Graph {
  const g = completeGraph(Math.max(3, n));
  return reweigh(g, randomWeights(rng, g));
}

export function negativeMst(rng: Rng, n: number): Graph {
  const g = randomGraph(rng, Math.max(3, n), { density: 0.3 });
  return reweigh(g, randomWeights(rng, g, -5, 9));
}

export function mstPresets(): Preset[] {
  const p = (label: string, make: (rng: Rng, n: number) => Graph): Preset => ({
    label,
    make: (rng, n) => [loadCall(make(rng, n)), ['run'] as OpCall],
  });
  return [
    p('Random graph', (rng, n) => randomMst(rng, n)),
    p('Dense graph', (rng, n) => randomMst(rng, n, 0.6)),
    p('Every weight different (one MST)', distinctWeights),
    p('Weights 1 to 3 (many ties)', fewWeights),
    p('Two pieces (a spanning forest)', twoPiecesMst),
    p('Grid', gridMst),
    p('Complete graph (8 vertices at most)', completeMst),
    p('Negative weights (still fine)', negativeMst),
  ];
}
