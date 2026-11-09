import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, VizDef } from '../../engine/types';
import { layoutSetting } from '../../layouts/graph';
import type { Graph } from '../_graph/graph';
import { graphInput } from '../_graph/kit';
import { graphPresets, loadCall, randomGraph } from '../_graph/presets';
import cppSource from './code/cpp/bfs.hpp?raw';
import javaSource from './code/java/Bfs.java?raw';
import pythonSource from './code/python/bfs.py?raw';
import dense from './examples/dense.json';
import directed from './examples/directed.json';
import disconnected from './examples/disconnected.json';
import grid from './examples/grid.json';
import layers from './examples/layers.json';
import middleStart from './examples/middle-start.json';
import path from './examples/path.json';
import star from './examples/star.json';
import visitedFlag from './examples/visited-flag.json';
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
  type BfsExtra,
  type BfsSettings,
  type BfsState,
} from './model';
import { bfsPractice } from './practice';
import { view } from './view';

export const bfs: VizDef<BfsState, BfsSettings, BfsExtra> = {
  id: 'bfs',
  title: 'Breadth-first search',
  family: 'Graphs',
  blurb:
    'Explore a graph in rings around a start vertex with a queue, and find how many edges away every vertex is.',
  settings: [
    {
      kind: 'choice',
      key: 'marking',
      label: 'Keep track with',
      options: [
        { value: 'colors', label: 'Colors: white, gray, black (CLRS)' },
        { value: 'visited', label: 'A visited flag: true or false' },
      ],
      help: 'Gray means "in the queue" and black means "done". BFS only needs to know whether a vertex has been seen, so one flag does the same job.',
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
    input: graphInput('A'),
    buttons: [
      { op: 'load', label: 'Load', usesInput: true, primary: true },
      { op: 'run', label: 'Run BFS from', usesInput: true },
    ],
    random: {
      label: 'Random graph',
      make: (rng) => [loadCall(randomGraph(rng, rng.int(6, 10), { density: 0.18 }))],
    },
    presets: graphPresets({ then: (g) => [['run', g.vertices[0]!]] }),
    sizes: [5, 8, 10, 12],
  },
  explain,
  complexity: [
    {
      op: 'BFS(G, s), adjacency lists',
      best: {
        cost: 'O(V)',
        why: 's has no edges: setting up d, π and the colors is the only work.',
      },
      average: {
        cost: 'O(V + E)',
        why: 'Each vertex goes through the queue at most once, and each list is read once.',
        example: 'layers',
      },
      worst: {
        cost: 'O(V + E)',
        why: 'Everything is reachable: V dequeues and 2E edge checks (E when directed).',
        example: 'dense',
      },
    },
    {
      op: 'BFS(G, s), adjacency matrix',
      best: {
        cost: 'O(V)',
        why: 's has no edges: one row of V cells, after O(V) setup.',
      },
      average: {
        cost: 'O(V²)',
        why: 'Each vertex that leaves the queue reads its whole row of V cells.',
      },
      worst: {
        cost: 'Θ(V²)',
        why: 'All V vertices are reachable, and each one reads V cells, edges or not.',
        example: 'path',
      },
      note: 'On a path of 1000 vertices, that is a million cells for 999 edges.',
    },
    {
      op: 'ENQUEUE and DEQUEUE',
      best: { cost: 'O(1)', why: 'A queue adds at the back and takes from the front.' },
      average: { cost: 'O(1)', why: 'No searching or shifting.', example: 'layers' },
      worst: {
        cost: 'O(1)',
        why: 'Even a long queue, as in the star, costs the same per operation.',
        example: 'star',
      },
      note: 'Each vertex is enqueued at most once, so the queue work is O(V) in total.',
    },
    {
      op: 'Extra space',
      best: { cost: 'O(V)', why: 'Colors, d and π take one slot per vertex.', example: 'path' },
      average: { cost: 'O(V)', why: 'The queue holds at most V - 1 vertices.' },
      worst: {
        cost: 'O(V)',
        why: 'A star puts every other vertex in the queue at once.',
        example: 'star',
      },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as BfsSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    layers,
    disconnected,
    directed,
    star,
    path,
    grid,
    middleStart,
    visitedFlag,
    dense,
  ] as unknown as SavedExample[],
  practice: bfsPractice(() => bfs),
  preview: { example: 'layers', level: 2, hide: ['vn-', 'q-', 'tbl-'] },
};

const graphLines = (g: Graph) => [
  `graph ${g.directed ? 'directed' : 'undirected'} ${g.vertices.join(' ')}`,
  ...g.edges.map((e) => `edge ${e.u} ${e.v}`),
];

/**
 * Driver protocol for the code tabs. "graph <directed|undirected> <names>" starts a graph (the
 * code numbers the names 0..n-1 in that order) and "edge u v" adds an edge; neither prints.
 * "bfs s" prints "<dequeue order> | <d per vertex> | <π per vertex>", with inf and - for ∞
 * and NIL. Runs from a vertex that is not there are left out.
 */
function codeScript(calls: OpCall[], settings: BfsSettings) {
  const t = new Timeline(bfs, settings, 1, calls);
  const input = graphLines(t.initial.state.graph);
  const expected: string[] = [];
  let before = t.initial.state.graph;
  for (const e of t.entries) {
    const g = e.end.graph;
    if (g !== before) input.push(...graphLines(g));
    before = g;
    const r = e.steps.at(-1)!.extra?.run;
    if (e.call[0] === 'run' && r) {
      const out = runSummary(g, r);
      input.push(`bfs ${r.s}`);
      expected.push(`${out.order} | ${out.d} | ${out.pi}`);
    }
  }
  return { input, expected };
}

export default bfs;
