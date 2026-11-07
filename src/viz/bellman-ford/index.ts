import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, VizDef } from '../../engine/types';
import { layoutSetting } from '../../layouts/graph';
import type { Graph } from '../_graph/graph';
import { graphInput } from '../_graph/kit';
import { loadCall } from '../_graph/presets';
import {
  backwardsPath,
  cycleOutOfReach,
  lastVertex,
  pathOrder,
  pathsPreset,
  randomWeighted,
  twoPieces,
  withNegativeCycle,
  withNegativeEdges,
} from '../_paths/presets';
import cppSource from './code/cpp/bellman_ford.hpp?raw';
import javaSource from './code/java/BellmanFord.java?raw';
import pythonSource from './code/python/bellman_ford.py?raw';
import bestOrder from './examples/best-order.json';
import cycleOutOfReachExample from './examples/cycle-out-of-reach.json';
import negativeCycle from './examples/negative-cycle.json';
import negativeEdge from './examples/negative-edge.json';
import passes from './examples/passes.json';
import undirectedNegative from './examples/undirected-negative.json';
import worstOrder from './examples/worst-order.json';
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
  type BfExtra,
  type BfSettings,
  type BfState,
} from './model';
import { bellmanFordPractice } from './practice';
import { view } from './view';

export const bellmanFord: VizDef<BfState, BfSettings, BfExtra> = {
  id: 'bellman-ford',
  title: 'Bellman-Ford',
  family: 'Graphs',
  blurb:
    'Relax every edge, V - 1 times over: shortest paths even with negative weights, and a check that finds negative cycles.',
  settings: [
    {
      kind: 'boolean',
      key: 'early',
      label: 'Stop early when a pass changes nothing',
      help: 'CLRS always makes V - 1 passes. A pass that changes nothing means no later pass can, so most code stops there.',
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
      { op: 'run', label: 'Run Bellman-Ford from', usesInput: true },
    ],
    random: {
      label: 'Random graph',
      make: (rng) => [loadCall(withNegativeEdges(rng, rng.int(5, 8)))],
    },
    presets: [
      pathsPreset('Negative edges, no cycle', withNegativeEdges),
      pathsPreset('A negative cycle', withNegativeCycle),
      pathsPreset('A cycle A cannot reach', cycleOutOfReach),
      pathsPreset('Random directed graph', (rng, n) =>
        randomWeighted(rng, n, { directed: true, density: 0.15 }),
      ),
      pathsPreset('Random graph', (rng, n) => randomWeighted(rng, n, { density: 0.2 })),
      pathsPreset('Two pieces (unreachable vertices)', twoPieces),
      pathsPreset('Worst order: a path backwards', backwardsPath, { from: lastVertex }),
      pathsPreset('Best order: a path forwards', pathOrder),
    ],
    sizes: [5, 8, 10, 12],
  },
  explain,
  complexity: [
    {
      op: 'BELLMAN-FORD, all V - 1 passes',
      best: {
        cost: 'Θ(VE)',
        why: 'CLRS always makes V - 1 passes over all E edges, then one more to check.',
        example: 'passes',
      },
      average: {
        cost: 'Θ(VE)',
        why: 'The number of passes does not depend on the graph, only on V.',
        example: 'negative-edge',
      },
      worst: {
        cost: 'Θ(VE)',
        why: 'V - 1 passes of E relaxations each, plus E checks.',
        example: 'worst-order',
      },
    },
    {
      op: 'Bellman-Ford, stopping early',
      best: {
        cost: 'Θ(E)',
        why: 'With the edges in path order, one pass finds everything and the next changes nothing.',
        example: 'best-order',
      },
      average: {
        cost: 'O(VE)',
        why: 'It stops after one pass more than the most edges on any shortest path.',
        example: 'passes',
      },
      worst: {
        cost: 'Θ(VE)',
        why: 'With the edges listed against a long path, each pass gets one more vertex right.',
        example: 'worst-order',
      },
    },
    {
      op: 'The negative-cycle check',
      best: {
        cost: 'O(1)',
        why: 'The first edge it checks can still be relaxed.',
        example: 'undirected-negative',
      },
      average: {
        cost: 'O(E)',
        why: 'One pass over the edges, stopping at the first that can be relaxed.',
        example: 'negative-cycle',
      },
      worst: {
        cost: 'Θ(E)',
        why: 'With no negative cycle, every edge has to be checked.',
        example: 'passes',
      },
      note: 'Following π back to the cycle adds O(V).',
    },
    {
      op: 'Extra space',
      best: { cost: 'Θ(V)', why: 'One d and one π per vertex.', example: 'best-order' },
      average: { cost: 'Θ(V)', why: 'Nothing else is stored: no queue, no heap.' },
      worst: {
        cost: 'Θ(V)',
        why: 'Even with a negative cycle, the walk back along π visits each vertex at most once.',
        example: 'negative-cycle',
      },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as BfSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    passes,
    negativeEdge,
    negativeCycle,
    cycleOutOfReachExample,
    worstOrder,
    bestOrder,
    undirectedNegative,
  ] as unknown as SavedExample[],
  practice: bellmanFordPractice(() => bellmanFord),
  preview: { example: 'passes', level: 2, hide: ['vn-', 'ord-', 'ps-', 'tbl-'] },
};

const graphLines = (g: Graph) => [
  `graph ${g.directed ? 'directed' : 'undirected'} ${g.vertices.join(' ')}`,
  ...g.edges.map((e) => `edge ${e.u} ${e.v} ${e.w}`),
];

/**
 * Driver protocol for the code tabs. "graph <directed|undirected> <names>" starts a graph (the
 * code numbers the names 0..n-1 in that order) and "edge u v w" adds an edge; neither prints.
 * "bellman-ford s" prints "<d per vertex> | <π per vertex>", with inf and - for ∞ and NIL, and
 * then " | negative cycle <vertices>" (starting from its first vertex in name order) when one
 * can be reached. The code makes all V - 1 passes, as CLRS does, so the model does too here.
 */
function codeScript(calls: OpCall[], settings: BfSettings) {
  const t = new Timeline(bellmanFord, { ...settings, early: false }, 1, calls);
  const input = graphLines(t.initial.state.graph);
  const expected: string[] = [];
  let before = t.initial.state.graph;
  for (const e of t.entries) {
    const g = e.end.graph;
    if (g !== before) input.push(...graphLines(g));
    before = g;
    const r = e.steps.at(-1)!.extra?.run;
    if (e.call[0] === 'run' && r) {
      input.push(`bellman-ford ${r.s}`);
      expected.push(runSummary(g, r));
    }
  }
  return { input, expected };
}

export default bellmanFord;
