import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, VizDef } from '../../engine/types';
import { layoutSetting } from '../../layouts/graph';
import type { Graph } from '../_graph/graph';
import { graphInput } from '../_graph/kit';
import { graphPresets, loadCall, randomGraph } from '../_graph/presets';
import cppSource from './code/cpp/dfs.hpp?raw';
import javaSource from './code/java/Dfs.java?raw';
import pythonSource from './code/python/dfs.py?raw';
import dag from './examples/dag.json';
import deep from './examples/deep.json';
import disconnected from './examples/disconnected.json';
import everyKind from './examples/every-kind.json';
import middleStart from './examples/middle-start.json';
import path from './examples/path.json';
import stackOrder from './examples/stack-order.json';
import stackReversed from './examples/stack-reversed.json';
import star from './examples/star.json';
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
  type DfsExtra,
  type DfsSettings,
  type DfsState,
} from './model';
import { dfsPractice } from './practice';
import { view } from './view';

export const dfs: VizDef<DfsState, DfsSettings, DfsExtra> = {
  id: 'dfs',
  title: 'Depth-first search',
  family: 'Graphs',
  blurb:
    'Go as deep as you can, then back up: discovery and finish times, tree, back, forward and cross edges, and the nesting of the times.',
  settings: [
    {
      kind: 'choice',
      key: 'style',
      label: 'Keep track with',
      options: [
        { value: 'recursive', label: 'Recursion: DFS-VISIT calls itself (CLRS)' },
        { value: 'stack', label: 'An explicit stack, neighbours pushed A to Z' },
        { value: 'stackrev', label: 'An explicit stack, neighbours pushed Z to A' },
      ],
      help: 'A stack pops the last neighbour pushed first. Pushed A to Z, the search takes Z first and the order changes; pushed Z to A, it matches the recursion.',
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
      { op: 'run', label: 'Run DFS from', usesInput: true },
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
      op: 'DFS(G), adjacency lists',
      best: {
        cost: 'Θ(V)',
        why: 'No edges: every vertex is still discovered and finished once.',
        example: 'disconnected',
      },
      average: {
        cost: 'Θ(V + E)',
        why: 'Each vertex is visited once, and each list is read once when its vertex is.',
        example: 'deep',
      },
      worst: {
        cost: 'Θ(V + E)',
        why: 'Each edge is explored once from each end (once when directed).',
        example: 'every-kind',
      },
    },
    {
      op: 'DFS(G), adjacency matrix',
      best: { cost: 'Θ(V²)', why: 'Every vertex reads its whole row of V cells, edges or not.' },
      average: { cost: 'Θ(V²)', why: 'V rows of V cells.', example: 'deep' },
      worst: { cost: 'Θ(V²)', why: 'V rows of V cells.', example: 'path' },
    },
    {
      op: 'Call stack depth',
      best: {
        cost: 'O(1)',
        why: 'From the middle of a star, every call returns at once: 2 deep.',
        example: 'star',
      },
      average: {
        cost: 'O(height of the tree)',
        why: 'The open calls are the path from the root to the current vertex.',
        example: 'deep',
      },
      worst: {
        cost: 'O(V)',
        why: 'On a path every vertex is open at once.',
        example: 'path',
      },
      note: 'A deep recursion can overflow the call stack on a big graph. An explicit stack moves that memory to the heap.',
    },
    {
      op: 'Classify an edge (u, v)',
      best: { cost: 'O(1)', why: 'Look at v.color: white, gray or black.', example: 'every-kind' },
      average: { cost: 'O(1)', why: 'For a black v, compare u.d with v.d.' },
      worst: { cost: 'O(1)', why: 'One color and at most one comparison.' },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as DfsSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    deep,
    everyKind,
    disconnected,
    stackOrder,
    stackReversed,
    dag,
    path,
    star,
    middleStart,
  ] as unknown as SavedExample[],
  practice: dfsPractice(() => dfs),
};

const graphLines = (g: Graph) => [
  `graph ${g.directed ? 'directed' : 'undirected'} ${g.vertices.join(' ')}`,
  ...g.edges.map((e) => `edge ${e.u} ${e.v}`),
];

/**
 * Driver protocol for the code tabs. "graph <directed|undirected> <names>" starts a graph (the
 * code numbers the names 0..n-1 in that order) and "edge u v" adds an edge; neither prints.
 * "dfs s" prints "<d per vertex> | <f per vertex> | <π per vertex> | <u-v:K per edge>", with K
 * one of T, B, F, C and edges in the order they were given. The code is the recursive search
 * (the default), so the model runs recursively here whatever the example's setting.
 */
function codeScript(calls: OpCall[], settings: DfsSettings) {
  const same: DfsSettings = { ...settings, style: 'recursive' };
  const t = new Timeline(dfs, same, 1, calls);
  const input = graphLines(t.initial.state.graph);
  const expected: string[] = [];
  let before = t.initial.state.graph;
  for (const e of t.entries) {
    const g = e.end.graph;
    if (g !== before) input.push(...graphLines(g));
    before = g;
    const r = e.steps.at(-1)!.extra?.run;
    if (e.call[0] === 'run' && r) {
      input.push(`dfs ${r.s}`);
      expected.push(runSummary(g, r));
    }
  }
  return { input, expected };
}

export default dfs;
