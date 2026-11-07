import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, VizDef } from '../../engine/types';
import { layoutSetting } from '../../layouts/graph';
import type { Graph } from '../_graph/graph';
import { graphInput } from '../_graph/kit';
import { loadCall } from '../_graph/presets';
import {
  completeDag,
  negativeDag,
  pathOrder,
  pathsPreset,
  randomWeightedDag,
  withCycle,
} from '../_paths/presets';
import cppSource from './code/cpp/dag_shortest_paths.hpp?raw';
import javaSource from './code/java/DagShortestPaths.java?raw';
import pythonSource from './code/python/dag_shortest_paths.py?raw';
import criticalPath from './examples/critical-path.json';
import cycle from './examples/cycle.json';
import dense from './examples/dense.json';
import middleStart from './examples/middle-start.json';
import negativeWeights from './examples/negative-weights.json';
import sortThenRelax from './examples/sort-then-relax.json';
import undirected from './examples/undirected.json';
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
  type DagExtra,
  type DagSettings,
  type DagState,
} from './model';
import { dagPractice } from './practice';
import { view } from './view';

export const dagShortestPaths: VizDef<DagState, DagSettings, DagExtra> = {
  id: 'dag-shortest-paths',
  title: 'Shortest paths in a DAG',
  family: 'Graphs',
  blurb:
    'Sort the vertices topologically, then relax each edge exactly once: shortest (or longest) paths in O(V + E), negative weights and all.',
  settings: [
    {
      kind: 'choice',
      key: 'goal',
      label: 'Find',
      options: [
        { value: 'shortest', label: 'Shortest paths (CLRS)' },
        { value: 'longest', label: 'Longest paths: the critical path' },
      ],
      help: 'Longest paths start every d at -∞ and keep the larger total, the same as negating every weight. That is only safe because a DAG has no cycles.',
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
      { op: 'run', label: 'Run from', usesInput: true },
    ],
    random: {
      label: 'Random DAG',
      make: (rng) => [loadCall(randomWeightedDag(rng, rng.int(5, 8)))],
    },
    presets: [
      pathsPreset('Random DAG', (rng, n) => randomWeightedDag(rng, n)),
      pathsPreset('DAG with negative weights', negativeDag),
      pathsPreset('Dense DAG (at most 10 vertices)', completeDag),
      pathsPreset('A path', pathOrder),
      pathsPreset('A cycle (refused)', withCycle),
    ],
    sizes: [5, 8, 10, 12],
  },
  explain,
  complexity: [
    {
      op: 'DAG-SHORTEST-PATHS(G, w, s)',
      best: {
        cost: 'Θ(V + E)',
        why: 'One depth-first search to sort, then each edge relaxed exactly once.',
        example: 'sort-then-relax',
      },
      average: {
        cost: 'Θ(V + E)',
        why: 'Nothing depends on the weights: negative ones cost the same.',
        example: 'negative-weights',
      },
      worst: {
        cost: 'Θ(V + E)',
        why: 'With every pair joined, E = V(V - 1)/2, so Θ(V²): still linear in the size of the graph.',
        example: 'dense',
      },
    },
    {
      op: 'Topological sort (DFS)',
      best: {
        cost: 'O(V + E)',
        why: 'It can stop at the first cycle it meets.',
        example: 'cycle',
      },
      average: {
        cost: 'Θ(V + E)',
        why: 'Each vertex is visited once and each edge looked at once.',
        example: 'sort-then-relax',
      },
      worst: {
        cost: 'Θ(V + E)',
        why: 'A DAG needs the whole search: every vertex has to finish.',
        example: 'dense',
      },
    },
    {
      op: 'Longest paths (critical path)',
      best: {
        cost: 'Θ(V + E)',
        why: 'The same algorithm with -∞ and the larger total.',
        example: 'critical-path',
      },
      average: {
        cost: 'Θ(V + E)',
        why: 'One relaxation per edge, in topological order.',
        example: 'critical-path',
      },
      worst: {
        cost: 'Θ(V + E)',
        why: 'In a general graph longest simple paths are NP-hard; the DAG makes them easy.',
      },
    },
    {
      op: 'Extra space',
      best: { cost: 'Θ(V)', why: 'A color, d and π per vertex, and the list L.' },
      average: { cost: 'Θ(V)', why: 'The recursion is at most V calls deep.' },
      worst: {
        cost: 'Θ(V)',
        why: 'A path makes the deepest recursion: V calls.',
      },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as DagSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    sortThenRelax,
    cycle,
    middleStart,
    negativeWeights,
    criticalPath,
    dense,
    undirected,
  ] as unknown as SavedExample[],
  practice: dagPractice(() => dagShortestPaths),
  preview: { example: 'sort-then-relax', level: 2, hide: ['vn-', 'L-', 'tbl-'] },
};

const graphLines = (g: Graph) => [
  `graph ${g.directed ? 'directed' : 'undirected'} ${g.vertices.join(' ')}`,
  ...g.edges.map((e) => `edge ${e.u} ${e.v} ${e.w}`),
];

/**
 * Driver protocol for the code tabs. "graph <directed|undirected> <names>" starts a graph (the
 * code numbers the names 0..n-1 in that order) and "edge u v w" adds an edge; neither prints.
 * "dag s" prints "<d per vertex> | <π per vertex>", with inf and - for ∞ and NIL, or
 * "cycle <vertices>" (starting from its first vertex in name order) when the depth-first
 * search meets one. The code finds shortest paths, so the model does too here.
 */
function codeScript(calls: OpCall[], settings: DagSettings) {
  const t = new Timeline(dagShortestPaths, { ...settings, goal: 'shortest' }, 1, calls);
  const input = graphLines(t.initial.state.graph);
  const expected: string[] = [];
  let before = t.initial.state.graph;
  for (const e of t.entries) {
    const g = e.end.graph;
    if (g !== before) input.push(...graphLines(g));
    before = g;
    const r = e.steps.at(-1)!.extra?.run;
    if (e.call[0] === 'run' && r) {
      input.push(`dag ${r.s}`);
      expected.push(runSummary(g, r));
    }
  }
  return { input, expected };
}

export default dagShortestPaths;
