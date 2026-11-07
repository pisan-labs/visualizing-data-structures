import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, VizDef } from '../../engine/types';
import { layoutSetting } from '../../layouts/graph';
import type { Graph } from '../_graph/graph';
import { graphInput } from '../_graph/kit';
import { loadCall } from '../_graph/presets';
import { mstPresets, randomMst } from '../prim/mst';
import cppSource from './code/cpp/kruskal.hpp?raw';
import javaSource from './code/java/Kruskal.java?raw';
import pythonSource from './code/python/kruskal.py?raw';
import compression from './examples/compression.json';
import cycle from './examples/cycle.json';
import dense from './examples/dense.json';
import forest from './examples/forest.json';
import lightestFirst from './examples/lightest-first.json';
import stopEarly from './examples/stop-early.json';
import ties from './examples/ties.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  runSummary,
  type KruskalExtra,
  type KruskalSettings,
  type KruskalState,
} from './model';
import { kruskalPractice } from './practice';
import { view } from './view';

export const kruskal: VizDef<KruskalState, KruskalSettings, KruskalExtra> = {
  id: 'kruskal',
  title: "Kruskal's minimum spanning tree",
  family: 'Graphs',
  blurb:
    'Sort the edges, then take them lightest first, skipping any edge that would close a cycle. A union-find forest says which is which.',
  settings: [
    {
      kind: 'boolean',
      key: 'stop',
      label: 'Stop as soon as the tree has V − 1 edges',
      help: 'CLRS looks at every edge. Stopping early gives the same tree and skips edges that could only close cycles.',
    },
    layoutSetting(),
  ],
  defaults,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  view,
  describe,
  controls: {
    input: graphInput('A-B:4, A-C:1, B-C:2, B-D:5, C-D:8'),
    buttons: [
      { op: 'load', label: 'Load', usesInput: true, primary: true },
      { op: 'run', label: 'Run Kruskal', usesInput: false },
    ],
    random: {
      label: 'Random graph',
      make: (rng) => [loadCall(randomMst(rng, rng.int(6, 9))), ['run']],
    },
    presets: mstPresets(),
    sizes: [5, 8, 10, 12],
  },
  explain,
  complexity: [
    {
      op: 'Kruskal (sort, then union-find)',
      best: {
        cost: 'O(E log E)',
        why: 'Sorting the edges costs this however the weights fall, unless they are sorted already.',
        example: 'cycle',
      },
      average: {
        cost: 'O(E log V)',
        why: 'The sort, O(E log E) = O(E log V) since E < V², plus E union-find checks at almost O(1) each.',
        example: 'lightest-first',
      },
      worst: {
        cost: 'O(E log V)',
        why: 'A dense graph: many edges to sort, and most of them rejected.',
        example: 'dense',
      },
      note: 'When the weights are small integers, a counting or radix sort makes the sort linear, and union-find dominates: O(E α(V)).',
    },
    {
      op: 'Checking one edge (two FIND-SETs)',
      best: {
        cost: 'O(1)',
        why: 'Both ends are roots, or point straight at one.',
        example: 'lightest-first',
      },
      average: {
        cost: 'O(α(V)) amortized',
        why: 'Union by rank with path compression: α(V) is at most 4 in practice.',
        example: 'compression',
      },
      worst: {
        cost: 'O(log V)',
        why: 'By rank, no tree in the forest is taller than log₂ V.',
        example: 'compression',
      },
    },
    {
      op: 'All the UNIONs',
      best: {
        cost: 'O(V)',
        why: 'Only V − 1 edges ever join A, and each link is O(1) after its finds.',
        example: 'stop-early',
      },
      average: {
        cost: 'O(V α(V))',
        why: 'V − 1 unions, each with two finds.',
        example: 'lightest-first',
      },
      worst: {
        cost: 'O(V log V)',
        why: 'Each union’s finds walk at most log₂ V pointers.',
        example: 'forest',
      },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[]) => codeScript(calls),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    lightestFirst,
    cycle,
    compression,
    stopEarly,
    forest,
    ties,
    dense,
  ] as unknown as SavedExample[],
  practice: kruskalPractice(() => kruskal),
  preview: { example: 'lightest-first', level: 2, hide: ['el-', 'uf-', 'ufp-'] },
};

const graphLines = (g: Graph) => [
  `graph ${g.vertices.join(' ')}`,
  ...g.edges.map((e) => `edge ${e.u} ${e.v} ${e.w}`),
];

/**
 * Driver protocol for the code tabs. "graph <names>" starts an undirected graph (the code
 * numbers the names 0..n-1 in that order) and "edge u v w" adds an edge (u before v); neither
 * prints. "kruskal" prints "<total weight> | <tree edges in the order they joined>". The code
 * looks at every edge, as CLRS does; stopping early gives the same tree. Runs on a directed
 * graph, which the page refuses, are left out.
 */
function codeScript(calls: OpCall[]) {
  const t = new Timeline(kruskal, defaults, 1, calls);
  const input = graphLines(t.initial.state.graph);
  const expected: string[] = [];
  let before = t.initial.state.graph;
  for (const e of t.entries) {
    const g = e.end.graph;
    if (g !== before && !g.directed) input.push(...graphLines(g));
    before = g;
    if (e.call[0] !== 'run') continue;
    const r = e.steps.at(-1)!.extra?.run;
    if (!r) continue;
    input.push('kruskal');
    expected.push(runSummary(r));
  }
  return { input, expected };
}

export default kruskal;
