import { Timeline } from '../../engine/timeline';
import type { OpCall, Preset, SavedExample, Settings, VizDef } from '../../engine/types';
import type { Rng } from '../../engine/rng';
import { layoutSetting } from '../../layouts/graph';
import type { Graph } from '../_graph/graph';
import { parseGraph } from '../_graph/parse';
import { graphInput } from '../_graph/kit';
import { loadCall, randomGraph } from '../_graph/presets';
import cppSource from './code/cpp/topo.hpp?raw';
import javaSource from './code/java/Topo.java?raw';
import pythonSource from './code/python/topo.py?raw';
import backwardChain from './examples/backward-chain.json';
import cycle from './examples/cycle.json';
import dense from './examples/dense.json';
import gettingDressed from './examples/getting-dressed.json';
import keepGoing from './examples/keep-going.json';
import lastGoesFirst from './examples/last-goes-first.json';
import explain from './explain.md?raw';
import { backwardChain as chain, dagWithCycle, denseDag, shuffledDag } from './graphs';
import {
  LAST_FIRST_TEXT,
  TOPO_TEXT,
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

const preset = (label: string, make: (rng: Rng, n: number) => Graph): Preset => ({
  label,
  make: (rng, n) => [loadCall(make(rng, n)), ['run']],
});

export const topoDfs: VizDef<TopoState, TopoSettings, TopoExtra> = {
  id: 'topo-dfs',
  title: 'Topological sort (DFS)',
  family: 'Graphs',
  blurb:
    'Run depth-first search and put each vertex on the front of a list as it finishes: the list comes out in topological order, unless a back edge shows a cycle.',
  settings: [
    {
      kind: 'choice',
      key: 'onCycle',
      label: 'When DFS finds a back edge',
      options: [
        { value: 'stop', label: 'Stop: there is a cycle, so no order exists (CLRS)' },
        { value: 'finish', label: 'Keep going, and show which edges point backward' },
      ],
      help: 'A back edge means a cycle. Kept going, the search still lists the vertices by finish time, but each back edge points the wrong way in that list.',
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
    input: graphInput(TOPO_TEXT),
    buttons: [
      { op: 'load', label: 'Load', usesInput: true, primary: true },
      { op: 'run', label: 'Sort', usesInput: false },
    ],
    random: {
      label: 'Random DAG',
      make: (rng) => [loadCall(shuffledDag(rng, rng.int(6, 9)))],
    },
    presets: [
      preset('Random DAG', (rng, n) => shuffledDag(rng, n, 0.2)),
      preset('The last vertex goes to the front', () => parseGraph(LAST_FIRST_TEXT) as Graph),
      preset('Dense DAG (10 vertices at most)', (rng, n) => denseDag(rng, n)),
      preset('A chain named backwards', (_rng, n) => chain(n)),
      preset('A DAG plus one arc that makes a cycle', (rng, n) => dagWithCycle(rng, n)),
      preset('Random directed graph (may have cycles)', (rng, n) =>
        randomGraph(rng, n, { density: 0.12, directed: true }),
      ),
    ],
    sizes: [5, 8, 10, 12],
  },
  explain,
  complexity: [
    {
      op: 'TOPOLOGICAL-SORT(G), adjacency lists',
      best: {
        cost: 'Θ(V + E)',
        why: 'Even a chain needs every vertex visited and every arc looked at.',
        example: 'backward-chain',
      },
      average: {
        cost: 'Θ(V + E)',
        why: 'One depth-first search, plus O(1) per vertex to put it on the front of L.',
        example: 'last-goes-first',
      },
      worst: {
        cost: 'Θ(V + E)',
        why: 'With every pair joined, E = V(V - 1)/2, so Θ(V²): still linear in the size of the graph.',
        example: 'dense',
      },
    },
    {
      op: 'Find out there is a cycle',
      best: {
        cost: 'O(V + E)',
        why: 'It stops at the first back edge, which can come after a few steps.',
        example: 'cycle',
      },
      average: {
        cost: 'O(V + E)',
        why: 'At most one full depth-first search.',
        example: 'keep-going',
      },
      worst: {
        cost: 'Θ(V + E)',
        why: 'A DAG has no back edge, so the whole search runs before you know there is none.',
        example: 'getting-dressed',
      },
    },
    {
      op: 'Insert u at the front of L',
      best: { cost: 'O(1)', why: 'L is a linked list: a new head.', example: 'last-goes-first' },
      average: { cost: 'O(1)', why: 'The same for every vertex.' },
      worst: {
        cost: 'O(1)',
        why: 'With an array, append each vertex and reverse once at the end instead.',
      },
      note: 'Inserting at the front of an array shifts everything, O(V) each and O(V²) in all.',
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
    lastGoesFirst,
    gettingDressed,
    cycle,
    keepGoing,
    backwardChain,
    dense,
  ] as unknown as SavedExample[],
  practice: topoPractice(() => topoDfs),
  preview: { example: 'getting-dressed', level: 2, hide: ['vn-', 'L-', 'tbl-'] },
};

const graphLines = (g: Graph) => [
  `graph ${g.directed ? 'directed' : 'undirected'} ${g.vertices.join(' ')}`,
  ...g.edges.map((e) => `edge ${e.u} ${e.v}`),
];

/**
 * Driver protocol for the code tabs. "graph directed <names>" starts a graph (the code numbers
 * the names 0..n-1 in that order) and "edge u v" adds the arc u -> v; neither prints. "topo"
 * prints the order, or "cycle u v" for the first back edge u -> v. The code stops at a cycle
 * (the default), so the model runs that way here whatever the example's setting. A sort of an
 * undirected graph is refused by the page and left out of the script.
 */
function codeScript(calls: OpCall[], settings: TopoSettings) {
  const same: TopoSettings = { ...settings, onCycle: 'stop' };
  const t = new Timeline(topoDfs, same, 1, calls);
  const input = graphLines(t.initial.state.graph);
  const expected: string[] = [];
  let before = t.initial.state.graph;
  for (const e of t.entries) {
    const g = e.end.graph;
    if (g !== before) input.push(...graphLines(g));
    before = g;
    const r = e.steps.at(-1)!.extra?.run;
    if (e.call[0] === 'run' && r) {
      input.push('topo');
      expected.push(runSummary(r));
    }
  }
  return { input, expected };
}

export default topoDfs;
