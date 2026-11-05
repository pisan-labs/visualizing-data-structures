/**
 * Kruskal's minimum spanning tree, CLRS style: MST-KRUSKAL(G, w) sorts the edges by weight and
 * takes them lightest first. An edge whose ends are in different trees of the forest A so far
 * joins A; an edge whose ends are in the same tree would close a cycle, so it is rejected. A
 * disjoint-set forest (union by rank with path compression, as in CLRS) tells the two apart.
 *
 * Ties in weight go in the order the graph stores its edges: by first end, then second end, in
 * name order, so A-D:2 comes before B-C:2.
 *
 * Settings
 *   stop    false (CLRS): look at every edge. true: stop as soon as A has V − 1 edges, which
 *           many implementations do; the result is the same tree.
 *   layout  the drawing only
 *
 * The state is just the graph; a run's bookkeeping travels in the steps' `extra`.
 */
import type { Mark, OpSpec, PseudoBlock, Scalar, Step } from '../../engine/types';
import type { GraphTemplate } from '../../layouts/graph';
import { edgeId, vertexId, weightId } from '../../layouts/graph';
import {
  compareNames,
  components,
  describeGraph,
  keyOf,
  listWords,
  type Edge,
  type Graph,
} from '../_graph/graph';
import { graphVars, loadOp, type GraphState } from '../_graph/kit';
import { directedRefusal, edgeWords, readyText, startMstGraph, treeWords } from '../prim/mst';

export type KruskalState = GraphState;

export interface KruskalSettings {
  [key: string]: Scalar;
  stop: boolean;
  layout: GraphTemplate;
}

export const defaults: KruskalSettings = { stop: false, layout: 'force' };

export type EdgeStatus = 'tree' | 'cycle';

export interface KruskalRun {
  /** The edges in the order Kruskal looks at them. */
  sorted: Edge[];
  /** Index in `sorted` of the edge being looked at; -1 before the loop. */
  at: number;
  status: Record<string, EdgeStatus>;
  /** The disjoint-set forest: parent and rank of every vertex. */
  p: Record<string, string>;
  rank: Record<string, number>;
  /** Tree edges, in the order they joined A. */
  A: string[];
  weight: number;
  finds: number;
  rejected: number;
  /** The roots FIND-SET gave for the current edge. */
  ru?: string;
  rv?: string;
  /** Edges were sorted (the list panel shows them in sorted order from then on). */
  isSorted: boolean;
  final?: boolean;
  /** Stopped early, at V − 1 edges. */
  stopped?: boolean;
}

export interface KruskalExtra {
  run?: KruskalRun;
}

type S = KruskalState;
type X = KruskalExtra;
type Op = OpSpec<S, KruskalSettings, X>;
type KStep = Step<S, X>;

export function init(): S {
  return { graph: startMstGraph() };
}

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });

/** Panel ids (see view.ts). */
export const listId = (key: string) => `el-${key}`;
export const ufNodeId = (v: string) => `uf-${v}`;
export const ufPtrId = (v: string) => `ufp-${v}`;

/** Lightest first; ties in the order the graph stores edges (u, then v, in name order). */
export function sortEdges(g: Graph): Edge[] {
  return [...g.edges].sort((a, b) => a.w - b.w || compareNames(a.u, b.u) || compareNames(a.v, b.v));
}

function clone(r: KruskalRun): KruskalRun {
  return { ...r, status: { ...r.status }, p: { ...r.p }, rank: { ...r.rank }, A: [...r.A] };
}

function runVars(g: Graph, r: KruskalRun): Record<string, Scalar> {
  const e = r.at >= 0 ? r.sorted[r.at] : undefined;
  return {
    ...graphVars(g),
    edge: e ? `${e.u}-${e.v}` : '–',
    A: r.A.length,
    weight: r.weight,
    finds: r.finds,
    rejected: r.rejected,
  };
}

/** The final answer of a run, in the code tabs' words: total weight | tree edges in order. */
export function runSummary(r: KruskalRun): string {
  return `${r.weight} |${r.A.map((k) => ` ${k}`).join('')}`;
}

/** FIND-SET with path compression; returns the root and the path it walked (x first). */
function findSet(r: KruskalRun, x: string): { root: string; path: string[] } {
  r.finds++;
  const path = [x];
  let y = x;
  while (r.p[y] !== y) {
    y = r.p[y]!;
    path.push(y);
  }
  for (const z of path) r.p[z] = y;
  return { root: y, path };
}

const pathText = (path: string[]) =>
  path.length === 1
    ? `${path[0]} is a root`
    : `${path.join(' → ')}${path.length > 2 ? `, and path compression points ${listWords(path.slice(0, -2))} straight at ${path.at(-1)}` : ''}`;

const run: Op = {
  label: 'Run Kruskal',
  arity: 0,
  *run(s, _args, { settings }) {
    const g = s.graph;
    if (g.directed) {
      yield {
        state: s,
        marks: [],
        say: directedRefusal('kruskal'),
        lines: ['sig'],
        level: 1,
        vars: graphVars(g),
      } satisfies KStep;
      return s;
    }
    const r: KruskalRun = {
      sorted: [...g.edges],
      at: -1,
      status: {},
      p: Object.fromEntries(g.vertices.map((v) => [v, v])),
      rank: Object.fromEntries(g.vertices.map((v) => [v, 0])),
      A: [],
      weight: 0,
      finds: 0,
      rejected: 0,
      isSorted: false,
    };
    const step = (say: string, lines: string[], level: 1 | 2 | 3, marks: Mark[] = []): KStep => ({
      state: s,
      marks,
      say,
      lines,
      level,
      vars: runVars(g, r),
      extra: { run: clone(r) },
    });
    yield step(
      `Kruskal starts with A = ∅, no edges at all, and MAKE-SET for each of the ${g.vertices.length} vertices: every vertex is a tree of its own in the union-find forest.`,
      ['A', 'make.for', 'make'],
      2,
    );
    r.sorted = sortEdges(g);
    r.isSorted = true;
    const ties = r.sorted.some((e, i) => i > 0 && r.sorted[i - 1]!.w === e.w);
    yield step(
      g.edges.length === 0
        ? 'There are no edges to sort.'
        : `Sort the ${g.edges.length} edges by weight, lightest first: ${r.sorted.map((e) => `${e.u}-${e.v}:${e.w}`).join(', ')}.${ties ? ' Equal weights stay in name order.' : ''}`,
      ['sort'],
      2,
      r.sorted.map((e) => mark(listId(keyOf(e)), 'visit')),
    );
    const want = g.vertices.length - components(g).length;
    for (let i = 0; i < r.sorted.length; i++) {
      if (settings.stop && r.A.length === want && want === g.vertices.length - 1) {
        r.stopped = true;
        yield step(
          `A has V − 1 = ${want} edges, so it is a spanning tree already. Every edge left would close a cycle, so stop here and skip the other ${r.sorted.length - i}.`,
          ['stop'],
          2,
        );
        break;
      }
      const e = r.sorted[i]!;
      const key = keyOf(e);
      r.at = i;
      const fu = findSet(r, e.u);
      const fv = findSet(r, e.v);
      r.ru = fu.root;
      r.rv = fv.root;
      const edgeMarks = [
        mark(edgeId(key), 'active'),
        mark(weightId(key), 'active'),
        mark(listId(key), 'active'),
      ];
      const ends = [mark(vertexId(e.u), 'visit'), mark(vertexId(e.v), 'visit')];
      // The finds (with any compression they did), then the decision.
      yield step(
        `Next, ${edgeWords(e)}. FIND-SET(${e.u}): ${pathText(fu.path)}. FIND-SET(${e.v}): ${pathText(fv.path)}.`,
        ['for', 'if'],
        3,
        [...edgeMarks, ...ends, mark(ufNodeId(fu.root), 'found'), mark(ufNodeId(fv.root), 'found')],
      );
      if (fu.root !== fv.root) {
        r.status[key] = 'tree';
        r.A.push(`${e.u}-${e.v}`);
        r.weight += e.w;
        const a = fu.root;
        const b = fv.root;
        let link: string;
        let under: string;
        if (r.rank[a]! > r.rank[b]!) {
          r.p[b] = a;
          under = b;
          link = `${b} has the smaller rank, so it goes under ${a}`;
        } else {
          r.p[a] = b;
          under = a;
          if (r.rank[a] === r.rank[b]) {
            r.rank[b] = r.rank[b]! + 1;
            link = `Both roots have rank ${r.rank[a]}, so ${a} goes under ${b} and ${b}'s rank grows to ${r.rank[b]}`;
          } else link = `${a} has the smaller rank, so it goes under ${b}`;
        }
        yield step(
          `${edgeWords(e)}: the roots are ${a} and ${b}, so ${e.u} and ${e.v} are in different trees. Add ${e.u}-${e.v} to A and UNION(${e.u}, ${e.v}): ${link}. A has ${r.A.length} ${r.A.length === 1 ? 'edge' : 'edges'}, weight ${r.weight}.`,
          ['for', 'if', 'add', 'union'],
          2,
          [
            mark(edgeId(key), 'active'),
            mark(weightId(key), 'active'),
            mark(listId(key), 'active'),
            ...ends,
            mark(ufPtrId(under), 'active'),
          ],
        );
      } else {
        r.status[key] = 'cycle';
        r.rejected++;
        yield step(
          `${edgeWords(e)}: FIND-SET gives ${fu.root} for both ends, so ${e.u} and ${e.v} are in the same tree already. Adding ${e.u}-${e.v} would close a cycle, so skip it. ✗`,
          ['for', 'if'],
          2,
          [
            mark(vertexId(e.u), 'compare'),
            mark(vertexId(e.v), 'compare'),
            mark(ufNodeId(fu.root), 'found'),
          ],
        );
      }
      r.ru = undefined;
      r.rv = undefined;
    }
    r.at = -1;
    r.final = true;
    const edges = r.A.map((k) => g.edges.find((e) => keyOf(e) === k)!);
    const skipped = r.rejected
      ? ` ${r.rejected} ${r.rejected === 1 ? 'edge was' : 'edges were'} rejected because ${r.rejected === 1 ? 'it' : 'they'} would close a cycle.`
      : '';
    yield step(
      `${r.stopped ? 'Stopped early.' : 'Every edge has been looked at, so Kruskal is done.'} ${treeWords(g, edges)}${skipped}`,
      ['ret'],
      1,
    );
    return s;
  },
};

const load = loadOp<S, KruskalSettings, X>({
  make: (graph) => ({ graph }),
  ready: (g) => readyText(g, 'kruskal'),
});

export const ops = { load, run };

// ---------------------------------------------------------------------------------------------
// Pseudocode, after CLRS.

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: KruskalSettings): PseudoBlock[] {
  const lines = [
    L('sig', 0, 'MST-KRUSKAL(G, w)', 'Build a minimum spanning tree:'),
    L('A', 1, 'A = ∅', 'Start with no edges.'),
    L('make.for', 1, 'for each v ∈ G.V', 'For every vertex,'),
    L('make', 2, 'MAKE-SET(v)', 'make a tree of its own.'),
    L('sort', 1, 'sort G.E by weight w', 'Sort the edges, lightest first.'),
    L('for', 1, 'for each (u, v) in that order', 'For each edge u-v in that order,'),
    ...(settings.stop
      ? [L('stop', 2, 'if |A| == |V| − 1: break', 'stop once A has V − 1 edges.')]
      : []),
    L('if', 2, 'if FIND-SET(u) ≠ FIND-SET(v)', 'if u and v are in different trees,'),
    L('add', 3, 'A = A ∪ {(u, v)}', 'add u-v to the tree'),
    L('union', 3, 'UNION(u, v)', 'and join their two trees.'),
    L('ret', 1, 'return A', 'A is a minimum spanning tree.'),
  ];
  return [{ op: 'run', lines }];
}

export function initialSay(s: S): string {
  return `${describeGraph(s.graph).split('. ')[0]}. Press Run: Kruskal's algorithm takes the edges lightest first and keeps each one that does not close a cycle.`;
}

export function initialVars(s: S) {
  return graphVars(s.graph);
}

export function describe(s: S): string {
  return describeGraph(s.graph);
}

/** The scene label: where a run stands. */
export function describeRun(r: KruskalRun): string {
  const cycle = Object.keys(r.status).filter((k) => r.status[k] === 'cycle');
  return `Kruskal. Tree edges: ${r.A.length ? r.A.join(', ') : 'none'}, weight ${r.weight}. Rejected (cycle): ${cycle.length ? cycle.join(', ') : 'none'}.`;
}
