import { Timeline } from '../../engine/timeline';
import type { OpCall, Preset, SavedExample, Settings, VizDef } from '../../engine/types';
import { layoutSetting } from '../../layouts/graph';
import { letters, makeGraph, type Graph } from '../_graph/graph';
import { graphInput } from '../_graph/kit';
import { graphPresets, loadCall, randomGraph } from '../_graph/presets';
import cppSource from './code/cpp/components.hpp?raw';
import javaSource from './code/java/Components.java?raw';
import pythonSource from './code/python/components.py?raw';
import deepPath from './examples/deep-path.json';
import directedWeak from './examples/directed-weak.json';
import isolated from './examples/isolated.json';
import lateMerge from './examples/late-merge.json';
import onePiece from './examples/one-piece.json';
import threePieces from './examples/three-pieces.json';
import unionFind from './examples/union-find.json';
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
  type CcExtra,
  type CcSettings,
  type CcState,
} from './model';
import { ccPractice } from './practice';
import { view } from './view';

const then = (): OpCall[] => [['run']];

/** Pieces with no spanning tree to hold them together: usually several components. */
const extraPresets: Preset[] = [
  {
    label: 'Scattered pieces',
    make: (rng, n) => [
      loadCall(randomGraph(rng, n, { connected: false, density: 0.12 })),
      ...then(),
    ],
  },
  {
    label: 'No edges at all',
    make: (_rng, n) => [
      loadCall(makeGraph({ directed: false, weighted: false, vertices: letters(n) })),
      ...then(),
    ],
  },
];

export const connectedComponents: VizDef<CcState, CcSettings, CcExtra> = {
  id: 'connected-components',
  title: 'Connected components',
  family: 'Graphs',
  blurb:
    'Split an undirected graph into its pieces: a search from each vertex not yet labeled, or union-find over the edges.',
  settings: [
    {
      kind: 'choice',
      key: 'method',
      label: 'Find them with',
      options: [
        { value: 'bfs', label: 'Breadth-first search, a queue' },
        { value: 'dfs', label: 'Depth-first search, recursion' },
        { value: 'union-find', label: 'Union-find over the edges (CLRS)' },
      ],
      help: 'Any search labels everything it reaches, so BFS and DFS find the same pieces in a different order. Union-find never searches: it reads each edge once and merges sets.',
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
    input: graphInput('A-B, C-D, E'),
    buttons: [
      { op: 'load', label: 'Load', usesInput: true, primary: true },
      { op: 'run', label: 'Find components', usesInput: false },
    ],
    random: {
      label: 'Random graph',
      make: (rng) => [
        loadCall(randomGraph(rng, rng.int(7, 10), { connected: false, density: 0.12 })),
      ],
    },
    presets: [...extraPresets, ...graphPresets({ then })],
    sizes: [5, 8, 10, 12],
  },
  explain,
  complexity: [
    {
      op: 'BFS or DFS from every unlabeled vertex',
      best: {
        cost: 'Θ(V)',
        why: 'No edges: each vertex is its own component, found by the outer loop alone.',
        example: 'isolated',
      },
      average: {
        cost: 'Θ(V + E)',
        why: 'Each vertex is labeled once, and each adjacency list is read once.',
        example: 'three-pieces',
      },
      worst: {
        cost: 'Θ(V + E)',
        why: 'Every edge is checked from both ends: 2E checks in all, never more.',
        example: 'one-piece',
      },
    },
    {
      op: 'Union-find over the edges',
      best: {
        cost: 'Θ(V)',
        why: 'No edges: V MAKE-SETs and nothing to merge.',
        example: 'isolated',
      },
      average: {
        cost: 'O((V + E) α(V))',
        why: 'Two FIND-SETs per edge; with rank and path compression each is nearly O(1).',
        example: 'union-find',
      },
      worst: {
        cost: 'O((V + E) α(V))',
        why: 'Long chains are squashed by path compression as they are walked.',
        example: 'late-merge',
      },
      note: 'α(V) is the inverse Ackermann function: at most 4 for any graph that fits in memory.',
    },
    {
      op: 'Extra space',
      best: {
        cost: 'O(V)',
        why: 'One number per vertex, plus a queue or call stack.',
        example: 'isolated',
      },
      average: { cost: 'O(V)', why: 'The queue holds at most one component at a time.' },
      worst: {
        cost: 'O(V)',
        why: 'On a path, DFS has every vertex open on the call stack at once.',
        example: 'deep-path',
      },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as CcSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    threePieces,
    onePiece,
    isolated,
    deepPath,
    unionFind,
    lateMerge,
    directedWeak,
  ] as unknown as SavedExample[],
  practice: ccPractice(() => connectedComponents),
  preview: { example: 'three-pieces', level: 2, hide: ['vn-', 'q-', 'tbl-'] },
};

const graphLines = (g: Graph) => [
  `graph ${g.directed ? 'directed' : 'undirected'} ${g.vertices.join(' ')}`,
  ...g.edges.map((e) => `edge ${e.u} ${e.v}`),
];

/**
 * Driver protocol for the code tabs. "graph <directed|undirected> <names>" starts a graph (the
 * code numbers the names 0..n-1 in that order) and "edge u v" adds an edge; neither prints.
 * "components" prints "<count> | <component per vertex>". Every method gives the same answer.
 */
function codeScript(calls: OpCall[], settings: CcSettings) {
  const t = new Timeline(connectedComponents, settings, 1, calls);
  const input = graphLines(t.initial.state.graph);
  const expected: string[] = [];
  let before = t.initial.state.graph;
  for (const e of t.entries) {
    const g = e.end.graph;
    if (g !== before) input.push(...graphLines(g));
    before = g;
    const r = e.steps.at(-1)!.extra?.run;
    if (e.call[0] === 'run' && r) {
      input.push('components');
      expected.push(runSummary(g, r));
    }
  }
  return { input, expected };
}

export default connectedComponents;
