import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, VizDef } from '../../engine/types';
import { layoutSetting } from '../../layouts/graph';
import type { Graph } from '../_graph/graph';
import { graphInput } from '../_graph/kit';
import cppSource from './code/cpp/steiner.hpp?raw';
import javaSource from './code/java/Steiner.java?raw';
import pythonSource from './code/python/steiner.py?raw';
import approxSpanning from './examples/approx-spanning.json';
import closureDetour from './examples/closure-detour.json';
import everyVertex from './examples/every-vertex.json';
import exactSearch from './examples/exact-search.json';
import hiddenHubExample from './examples/hidden-hub.json';
import sharedPaths from './examples/shared-paths.json';
import twoTerminals from './examples/two-terminals.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  type StExtra,
  type StSettings,
  type StState,
} from './model';
import { stPractice } from './practice';
import { randomSteiner, setup, stPresets } from './presets';
import { view } from './view';

export const steinerTree: VizDef<StState, StSettings, StExtra> = {
  id: 'steiner-tree',
  title: 'Steiner tree',
  family: 'Hard problems',
  blurb:
    'Join a few chosen vertices by the lightest tree, free to pass through any others. Exact is exponential; spanning the shortest paths between them is at most twice too heavy.',
  settings: [
    {
      kind: 'choice',
      key: 'method',
      label: 'Method',
      options: [
        { value: 'approx', label: 'Shortest paths, then a spanning tree (at most 2 × best)' },
        { value: 'exact', label: 'Exact: try every set of Steiner vertices' },
      ],
      help: 'Every run ends by comparing its tree with a minimum Steiner tree, which the page finds by brute force.',
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
    input: { ...graphInput('A-B:2, A-C:3, B-C:1, B-D:4, C-D:2'), label: 'Graph or terminals' },
    buttons: [
      { op: 'load', label: 'Load', usesInput: true, primary: true },
      { op: 'terminals', label: 'Set terminals', usesInput: true },
      { op: 'run', label: 'Find a tree', usesInput: false },
    ],
    random: {
      label: 'Random graph',
      make: (rng) => {
        const { graph, terminals } = randomSteiner(rng, rng.int(6, 9));
        return [...setup(graph, terminals), ['run']];
      },
    },
    presets: stPresets(),
    sizes: [5, 7, 9],
  },
  explain,
  complexity: [
    {
      op: 'Metric-closure approximation',
      best: {
        cost: 'O(t (E + V log V))',
        why: 'Dominated by one Dijkstra per terminal for the closure; the two spanning trees are small.',
        example: 'approx-spanning',
      },
      average: {
        cost: 'O(t (E + V log V))',
        why: 'The same work for any weights: t shortest-path runs, then trees over t² and E edges.',
        example: 'closure-detour',
      },
      worst: {
        cost: 'O(t (E + V log V))',
        why: 'Fast, and at most (2 − 2/t) times the optimum. The hub graph reaches that bound.',
        example: 'hidden-hub',
      },
    },
    {
      op: 'Brute force over Steiner vertices',
      best: {
        cost: 'O(V²)',
        why: 'Every vertex is a terminal: one set S (the empty one) and one spanning tree.',
        example: 'every-vertex',
      },
      average: {
        cost: 'O(2^(V − t) V²)',
        why: 'Each set S of the V − t other vertices costs a spanning tree, O(V²) with an array.',
        example: 'exact-search',
      },
      worst: {
        cost: 'O(2^(V − t) V²)',
        why: 'Two terminals in a big graph: almost every vertex may or may not be in the tree.',
        example: 'two-terminals',
      },
      note: 'With two terminals the answer is just a shortest path, and Dijkstra finds it fast. Brute force does not know that.',
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as StSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    closureDetour,
    hiddenHubExample,
    sharedPaths,
    exactSearch,
    twoTerminals,
    everyVertex,
    approxSpanning,
  ] as unknown as SavedExample[],
  practice: stPractice(() => steinerTree),
  preview: { example: 'hidden-hub', level: 2, hide: ['cl-', 'cm-'] },
};

const graphLines = (g: Graph) => [
  `graph ${g.vertices.join(' ')}`,
  ...g.edges.map((e) => `edge ${e.u} ${e.v} ${e.w}`),
];

/**
 * Driver protocol for the code tabs. "graph <names>" starts an undirected graph (the code
 * numbers the names 0..n-1 in that order), "edge u v w" adds an edge and "terminals <names>"
 * sets the terminals; none of them prints. "steiner" prints "<the approximation's weight> |
 * <its edges, in edge order> | <the optimum>", with - for no edges. The code follows the
 * default method, whatever the settings. Runs the page refuses (a directed graph, a weight
 * of 0 or less, terminals in different pieces) are left out.
 */
function codeScript(calls: OpCall[], settings: StSettings) {
  const t = new Timeline(steinerTree, { ...settings, method: 'approx' }, 1, calls);
  const s0 = t.initial.state;
  const input = [...graphLines(s0.graph), `terminals ${s0.terminals.join(' ')}`];
  const expected: string[] = [];
  let before = s0;
  for (const e of t.entries) {
    const s = e.end;
    if (s.graph !== before.graph) input.push(...graphLines(s.graph));
    if (s.graph !== before.graph || s.terminals.join(' ') !== before.terminals.join(' '))
      input.push(`terminals ${s.terminals.join(' ')}`);
    before = s;
    if (e.call[0] !== 'run') continue;
    const r = e.steps.at(-1)!.extra?.run;
    if (!r) continue;
    input.push('steiner');
    expected.push(`${r.weight} | ${r.tree.join(' ') || '-'} | ${r.opt}`);
  }
  return { input, expected };
}

export default steinerTree;
