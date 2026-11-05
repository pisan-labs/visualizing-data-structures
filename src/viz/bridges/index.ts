import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, Preset, SavedExample, Settings, VizDef } from '../../engine/types';
import { layoutSetting } from '../../layouts/graph';
import type { Graph } from '../_graph/graph';
import { graphInput } from '../_graph/kit';
import {
  cycleGraph,
  gridGraph,
  loadCall,
  pathGraph,
  randomGraph,
  randomTree,
  starGraph,
  twoComponents,
} from '../_graph/presets';
import cppSource from './code/cpp/bridges.hpp?raw';
import javaSource from './code/java/Bridges.java?raw';
import pythonSource from './code/python/bridges.py?raw';
import bowtie from './examples/bowtie.json';
import cycle from './examples/cycle.json';
import longBackEdge from './examples/long-back-edge.json';
import tree from './examples/tree.json';
import twoPieces from './examples/two-pieces.json';
import twoTriangles from './examples/two-triangles.json';
import explain from './explain.md?raw';
import { blocks, rootInMiddle } from './graphs';
import {
  BRIDGES_TEXT,
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  runSummary,
  type BridgesExtra,
  type BridgesSettings,
  type BridgesState,
} from './model';
import { bridgesPractice } from './practice';
import { view } from './view';

const preset = (label: string, make: (rng: Rng, n: number) => Graph): Preset => ({
  label,
  make: (rng, n) => [loadCall(make(rng, n)), ['run']],
});

export const bridges: VizDef<BridgesState, BridgesSettings, BridgesExtra> = {
  id: 'bridges',
  title: 'Cut vertices and bridges',
  family: 'Graphs',
  blurb:
    'Which single vertex or edge holds an undirected graph together? One depth-first search with low values finds every cut vertex and every bridge.',
  settings: [layoutSetting()],
  defaults,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  view,
  describe,
  controls: {
    input: graphInput(BRIDGES_TEXT),
    buttons: [
      { op: 'load', label: 'Load', usesInput: true, primary: true },
      { op: 'run', label: 'Find', usesInput: false },
    ],
    random: {
      label: 'Random graph',
      make: (rng) => [loadCall(blocks(rng, rng.int(7, 10)))],
    },
    presets: [
      preset('Cycles joined in a chain', (rng, n) => blocks(rng, n)),
      preset('Sparse random graph', (rng, n) => randomGraph(rng, n, { density: 0.12 })),
      preset('Tree (every edge a bridge)', (rng, n) => randomTree(rng, n)),
      preset('Path', (_rng, n) => pathGraph(n)),
      preset('Star (the root has many children)', (_rng, n) => starGraph(n)),
      preset('Two cycles meeting at the root', (_rng, n) => rootInMiddle(n)),
      preset('Cycle (nothing to find)', (_rng, n) => cycleGraph(n)),
      preset('Grid (nothing to find)', (_rng, n) => gridGraph(n)),
      preset('Two components', (rng, n) => twoComponents(rng, n)),
    ],
    sizes: [5, 8, 10, 12],
  },
  explain,
  complexity: [
    {
      op: 'Cut vertices and bridges, adjacency lists',
      best: {
        cost: 'Θ(V + E)',
        why: 'One DFS. A tree has the fewest edges, E = V - 1, and still every vertex is visited.',
        example: 'tree',
      },
      average: {
        cost: 'Θ(V + E)',
        why: 'Each vertex is visited once and each edge looked at from both ends, O(1) each time.',
        example: 'two-triangles',
      },
      worst: {
        cost: 'Θ(V + E)',
        why: 'More edges only mean more back edges to take a min over.',
        example: 'cycle',
      },
    },
    {
      op: 'The naive way: remove each vertex, test connectivity',
      best: {
        cost: 'Θ(V(V + E))',
        why: 'One BFS or DFS per vertex removed, even on a tree.',
        example: 'tree',
      },
      average: {
        cost: 'Θ(V(V + E))',
        why: 'V searches of the whole graph.',
        example: 'two-triangles',
      },
      worst: {
        cost: 'Θ(E(V + E))',
        why: 'For bridges, one search per edge removed.',
        example: 'long-back-edge',
      },
    },
    {
      op: 'Is the root a cut vertex?',
      best: { cost: 'O(1)', why: 'Count its DFS children.', example: 'bowtie' },
      average: {
        cost: 'O(1)',
        why: 'Two or more children: yes. One: no.',
        example: 'two-triangles',
      },
      worst: {
        cost: 'O(1)',
        why: 'The low test does not work for the root, and is not needed.',
        example: 'two-pieces',
      },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as BridgesSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    twoTriangles,
    bowtie,
    tree,
    cycle,
    longBackEdge,
    twoPieces,
  ] as unknown as SavedExample[],
  practice: bridgesPractice(() => bridges),
};

const graphLines = (g: Graph) => [
  `graph ${g.directed ? 'directed' : 'undirected'} ${g.vertices.join(' ')}`,
  ...g.edges.map((e) => `edge ${e.u} ${e.v}`),
];

/**
 * Driver protocol for the code tabs. "graph undirected <names>" starts a graph (the code
 * numbers the names 0..n-1 in that order) and "edge u v" adds an edge; neither prints. "cuts"
 * prints "<cut vertices in name order> | <bridges in the order they were given>", with "-" for
 * none. A run on a directed graph is refused by the page and left out of the script.
 */
function codeScript(calls: OpCall[], settings: BridgesSettings) {
  const t = new Timeline(bridges, settings, 1, calls);
  const input = graphLines(t.initial.state.graph);
  const expected: string[] = [];
  let before = t.initial.state.graph;
  for (const e of t.entries) {
    const g = e.end.graph;
    if (g !== before) input.push(...graphLines(g));
    before = g;
    const r = e.steps.at(-1)!.extra?.run;
    if (e.call[0] === 'run' && r) {
      input.push('cuts');
      expected.push(runSummary(g, r));
    }
  }
  return { input, expected };
}

export default bridges;
