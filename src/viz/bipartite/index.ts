import { Timeline } from '../../engine/timeline';
import type { OpCall, Preset, SavedExample, Settings, VizDef } from '../../engine/types';
import { layoutSetting } from '../../layouts/graph';
import type { Graph } from '../_graph/graph';
import { graphInput } from '../_graph/kit';
import { cycleGraph, graphPresets, loadCall } from '../_graph/presets';
import cppSource from './code/cpp/bipartite.hpp?raw';
import javaSource from './code/java/Bipartite.java?raw';
import pythonSource from './code/python/bipartite.py?raw';
import dfsCheck from './examples/dfs-check.json';
import evenCycle from './examples/even-cycle.json';
import grid from './examples/grid.json';
import oddCycle from './examples/odd-cycle.json';
import pentagon from './examples/pentagon.json';
import triangle from './examples/triangle.json';
import twoPieces from './examples/two-pieces.json';
import explain from './explain.md?raw';
import { randomBipartite, treePlusOdd } from './graphs';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  runSummary,
  type BipExtra,
  type BipSettings,
  type BipState,
} from './model';
import { bipartitePractice } from './practice';
import { view } from './view';

const then = (): OpCall[] => [['run']];

const extraPresets: Preset[] = [
  {
    label: 'Random bipartite graph',
    make: (rng, n) => [loadCall(randomBipartite(rng, n)), ...then()],
  },
  {
    label: 'Tree plus one odd cycle',
    make: (rng, n) => [loadCall(treePlusOdd(rng, n)), ...then()],
  },
  {
    label: 'Even cycle',
    make: (_rng, n) => [loadCall(cycleGraph(Math.max(4, n - (n % 2)))), ...then()],
  },
  {
    label: 'Odd cycle',
    make: (_rng, n) => [loadCall(cycleGraph(Math.max(3, n % 2 ? n : n - 1))), ...then()],
  },
];

export const bipartite: VizDef<BipState, BipSettings, BipExtra> = {
  id: 'bipartite',
  title: 'Bipartite check',
  family: 'Graphs',
  blurb:
    'Split the vertices into two sides so every edge crosses, by two-coloring with a search, or find the odd cycle that makes it impossible.',
  settings: [
    {
      kind: 'choice',
      key: 'method',
      label: 'Two-color with',
      options: [
        { value: 'bfs', label: 'Breadth-first search, a queue' },
        { value: 'dfs', label: 'Depth-first search, recursion' },
      ],
      help: 'Both give the right answer. They visit vertices in a different order, so on a graph that is not bipartite they can stop at a different edge and show a different odd cycle.',
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
    input: graphInput('A-B, B-C, C-D, A-D'),
    buttons: [
      { op: 'load', label: 'Load', usesInput: true, primary: true },
      { op: 'run', label: 'Check', usesInput: false },
    ],
    random: {
      label: 'Random graph',
      make: (rng) => [
        loadCall(
          rng.int(0, 1) ? randomBipartite(rng, rng.int(6, 9)) : treePlusOdd(rng, rng.int(6, 9)),
        ),
      ],
    },
    presets: [...extraPresets, ...graphPresets({ then })],
    sizes: [5, 8, 10, 12],
  },
  explain,
  complexity: [
    {
      op: 'Two-coloring with BFS or DFS, adjacency lists',
      best: {
        cost: 'Θ(V)',
        why: 'The first few edges close a triangle: the check stops after setting up the sides.',
        example: 'triangle',
      },
      average: {
        cost: 'O(V + E)',
        why: 'Each vertex gets a side once, and each list is read at most once.',
        example: 'pentagon',
      },
      worst: {
        cost: 'Θ(V + E)',
        why: 'A bipartite graph: every edge is checked from both ends before the answer is yes.',
        example: 'grid',
      },
    },
    {
      op: 'Finding the odd cycle',
      best: {
        cost: 'O(1)',
        why: 'The clashing ends share a parent: a triangle.',
        example: 'triangle',
      },
      average: {
        cost: 'O(V)',
        why: 'Walk π up from both ends to where they meet.',
        example: 'pentagon',
      },
      worst: {
        cost: 'O(V)',
        why: 'The cycle can run through every vertex, as in an odd cycle.',
        example: 'odd-cycle',
      },
    },
    {
      op: 'Extra space',
      best: { cost: 'O(V)', why: 'A side and a parent per vertex.', example: 'even-cycle' },
      average: { cost: 'O(V)', why: 'The queue holds at most V vertices.' },
      worst: {
        cost: 'O(V)',
        why: 'DFS on a long cycle keeps every vertex open on the call stack.',
        example: 'dfs-check',
      },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as BipSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    evenCycle,
    oddCycle,
    pentagon,
    triangle,
    grid,
    twoPieces,
    dfsCheck,
  ] as unknown as SavedExample[],
  practice: bipartitePractice(() => bipartite),
};

const graphLines = (g: Graph) => [
  `graph ${g.directed ? 'directed' : 'undirected'} ${g.vertices.join(' ')}`,
  ...g.edges.map((e) => `edge ${e.u} ${e.v}`),
];

/**
 * Driver protocol for the code tabs. "graph <directed|undirected> <names>" starts a graph (the
 * code numbers the names 0..n-1 in that order) and "edge u v" adds an edge; neither prints.
 * "check" prints "yes | <side per vertex>" or "no | <odd cycle>". The code uses BFS, so only
 * runs with BFS are checked against it.
 */
function codeScript(calls: OpCall[], settings: BipSettings) {
  const t = new Timeline(bipartite, { ...settings, method: 'bfs' }, 1, calls);
  const input = graphLines(t.initial.state.graph);
  const expected: string[] = [];
  let before = t.initial.state.graph;
  for (const e of t.entries) {
    const g = e.end.graph;
    if (g !== before) input.push(...graphLines(g));
    before = g;
    const r = e.steps.at(-1)!.extra?.run;
    if (e.call[0] === 'run' && r) {
      input.push('check');
      expected.push(runSummary(g, r));
    }
  }
  return { input, expected };
}

export default bipartite;
