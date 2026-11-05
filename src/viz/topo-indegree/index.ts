import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, Preset, SavedExample, Settings, VizDef } from '../../engine/types';
import { layoutSetting } from '../../layouts/graph';
import type { Graph } from '../_graph/graph';
import { graphInput } from '../_graph/kit';
import { loadCall, randomGraph } from '../_graph/presets';
import cppSource from './code/cpp/topo.hpp?raw';
import javaSource from './code/java/Topo.java?raw';
import pythonSource from './code/python/topo.py?raw';
import chainEx from './examples/chain.json';
import cycle from './examples/cycle.json';
import fifoOrder from './examples/fifo-order.json';
import noSources from './examples/no-sources.json';
import pathsDag from './examples/paths-dag.json';
import smallestFirst from './examples/smallest-first.json';
import wide from './examples/wide.json';
import explain from './explain.md?raw';
import { chain, dagWithCycle, fanIn, mixedDag } from './graphs';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  runSummary,
  type TopoExtra,
  type TopoSettings,
  type TopoState,
} from './model';
import { topoPractice } from './practice';
import { view } from './view';

const then: OpCall[] = [['run']];
const preset = (label: string, build: (rng: Rng, n: number) => Graph): Preset => ({
  label,
  make: (rng, n) => [loadCall(build(rng, n)), ...then],
});

export const topoIndegree: VizDef<TopoState, TopoSettings, TopoExtra> = {
  id: 'topo-indegree',
  title: 'Topological sort (indegree)',
  family: 'Graphs',
  blurb:
    "Kahn's algorithm: count the arcs into each vertex, take the vertices with none left, and find a cycle when nothing is ready.",
  settings: [
    {
      kind: 'choice',
      key: 'ready',
      label: 'Ready vertices wait in',
      options: [
        { value: 'fifo', label: 'A queue: first ready, first out' },
        { value: 'smallest', label: 'A priority queue: smallest name first' },
      ],
      help: 'Any ready vertex can go next, so a DAG can have many topological orders. A queue takes them in the order they became ready; a priority queue gives the order that comes first alphabetically.',
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
    input: graphInput('A>B, A>C, C>B'),
    buttons: [
      { op: 'load', label: 'Load', usesInput: true, primary: true },
      { op: 'run', label: 'Sort', usesInput: false },
    ],
    random: {
      label: 'Random DAG',
      make: (rng) => [loadCall(mixedDag(rng, rng.int(6, 9)))],
    },
    presets: [
      preset('Random DAG', (rng, n) => mixedDag(rng, n)),
      preset('Dense DAG', (rng, n) => mixedDag(rng, n, 0.5)),
      preset('DAG plus one arc back (a cycle)', (rng, n) => dagWithCycle(rng, n)),
      preset('Random directed graph (may have cycles)', (rng, n) =>
        randomGraph(rng, n, { directed: true, density: 0.12 }),
      ),
      preset('Chain: one order only', (_rng, n) => chain(n)),
      preset('Many sources, one sink', (_rng, n) => fanIn(n)),
    ],
    sizes: [5, 8, 10, 12],
  },
  explain,
  complexity: [
    {
      op: 'Kahn’s algorithm, queue, adjacency lists',
      best: {
        cost: 'Θ(V + E)',
        why: 'Counting in-degrees reads every arc once, even on a chain.',
        example: 'chain',
      },
      average: {
        cost: 'Θ(V + E)',
        why: 'Each vertex is queued once, and each arc is removed once.',
        example: 'paths-dag',
      },
      worst: {
        cost: 'Θ(V + E)',
        why: 'A cycle stops it early, but the count already read every arc.',
        example: 'cycle',
      },
    },
    {
      op: 'With a min-priority queue (smallest first)',
      best: {
        cost: 'Θ(V + E)',
        why: 'On a chain the heap holds one vertex at a time.',
        example: 'chain',
      },
      average: {
        cost: 'O(V log V + E)',
        why: 'V inserts and V extract-mins, each O(log V) in a binary heap.',
        example: 'smallest-first',
      },
      worst: {
        cost: 'O(V log V + E)',
        why: 'Many sources fill the heap at once.',
        example: 'wide',
      },
    },
    {
      op: 'Extra space',
      best: { cost: 'O(V)', why: 'An in-degree per vertex, plus the order.', example: 'chain' },
      average: { cost: 'O(V)', why: 'The queue holds the ready vertices only.' },
      worst: {
        cost: 'O(V)',
        why: 'Every source is ready at once.',
        example: 'wide',
      },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as TopoSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    pathsDag,
    fifoOrder,
    smallestFirst,
    cycle,
    noSources,
    chainEx,
    wide,
  ] as unknown as SavedExample[],
  practice: topoPractice(() => topoIndegree),
};

const graphLines = (g: Graph) => [
  `graph ${g.directed ? 'directed' : 'undirected'} ${g.vertices.join(' ')}`,
  ...g.edges.map((e) => `edge ${e.u} ${e.v}`),
];

/**
 * Driver protocol for the code tabs. "graph <directed|undirected> <names>" starts a graph (the
 * code numbers the names 0..n-1 in that order) and "edge u v" adds the arc u -> v; neither
 * prints. "sort" prints "<order> | <vertices left over, or ->". The code uses a FIFO queue,
 * so runs are checked with that setting. Sorting an undirected graph is refused, so it is
 * left out.
 */
function codeScript(calls: OpCall[], settings: TopoSettings) {
  const t = new Timeline(topoIndegree, { ...settings, ready: 'fifo' }, 1, calls);
  const input = graphLines(t.initial.state.graph);
  const expected: string[] = [];
  let before = t.initial.state.graph;
  for (const e of t.entries) {
    const g = e.end.graph;
    if (g !== before) input.push(...graphLines(g));
    before = g;
    const r = e.steps.at(-1)!.extra?.run;
    if (e.call[0] === 'run' && r) {
      input.push('sort');
      expected.push(runSummary(r));
    }
  }
  return { input, expected };
}

export default topoIndegree;
