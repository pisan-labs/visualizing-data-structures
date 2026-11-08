import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, Preset, SavedExample, Settings, VizDef } from '../../engine/types';
import { layoutSetting } from '../../layouts/graph';
import type { Graph } from '../_graph/graph';
import { graphInput } from '../_graph/kit';
import { loadCall } from '../_graph/presets';
import { randomWeighted, twoPieces, withNegativeCycle, withNegativeEdges } from '../_paths/presets';
import cppSource from './code/cpp/johnson.hpp?raw';
import javaSource from './code/java/Johnson.java?raw';
import pythonSource from './code/python/johnson.py?raw';
import allPositive from './examples/all-positive.json';
import negativeCycle from './examples/negative-cycle.json';
import negativeEdges from './examples/negative-edges.json';
import unreachable from './examples/unreachable.json';
import zeroOnPath from './examples/zero-on-path.json';
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
  type JohnsonExtra,
  type JohnsonSettings,
  type JohnsonState,
} from './model';
import { johnsonPractice } from './practice';
import { view } from './view';

const preset = (label: string, make: (rng: Rng, n: number) => Graph): Preset => ({
  label,
  make: (rng, n) => [loadCall(make(rng, n)), ['run'] as OpCall],
});

export const johnson: VizDef<JohnsonState, JohnsonSettings, JohnsonExtra> = {
  id: 'johnson',
  title: 'Johnson all-pairs shortest paths',
  family: 'Graphs',
  blurb:
    'Make every weight nonnegative with one Bellman-Ford run from a new vertex, then run Dijkstra from every vertex: all pairs, even with negative edges.',
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
    input: graphInput('A>B:2, B>C:-1, A>C:3, C>D:1'),
    buttons: [
      { op: 'load', label: 'Load', usesInput: true, primary: true },
      { op: 'run', label: 'Run Johnson', usesInput: false },
    ],
    random: {
      label: 'Random graph with negative edges',
      make: (rng) => [loadCall(withNegativeEdges(rng, rng.int(4, 6))), ['run']],
    },
    presets: [
      preset('Negative edges, no negative cycle', (rng, n) =>
        withNegativeEdges(rng, Math.min(n, 8)),
      ),
      preset('All weights positive', (rng, n) =>
        randomWeighted(rng, Math.min(n, 8), { directed: true }),
      ),
      preset('A negative cycle', (rng, n) => withNegativeCycle(rng, Math.min(n, 8))),
      preset('Two pieces (unreachable pairs)', (rng, n) => twoPieces(rng, Math.min(n, 8))),
    ],
    sizes: [4, 5, 6, 8],
  },
  explain,
  complexity: [
    {
      op: 'Johnson with a binary heap',
      best: {
        cost: 'O(VE log V)',
        why: 'V Dijkstras at O(E log V) each dominate the one Bellman-Ford.',
        example: 'all-positive',
      },
      average: {
        cost: 'O(VE log V)',
        why: 'Bellman-Ford O(VE), reweighting O(E), then V Dijkstras.',
        example: 'negative-edges',
      },
      worst: {
        cost: 'O(VE log V)',
        why: 'On a dense graph E ≈ V², so O(V³ log V): Floyd-Warshall’s O(V³) wins there.',
        example: 'negative-edges',
      },
      note: 'With a Fibonacci heap it is O(V² log V + VE).',
    },
    {
      op: 'Bellman-Ford from q',
      best: {
        cost: 'O(E)',
        why: 'No negative weight: one pass changes nothing and h is 0 everywhere.',
        example: 'all-positive',
      },
      average: {
        cost: 'O(VE)',
        why: 'Up to V passes over all the arcs.',
        example: 'negative-edges',
      },
      worst: {
        cost: 'O(VE)',
        why: 'A negative cycle keeps every pass busy until the check.',
        example: 'negative-cycle',
      },
    },
    {
      op: 'Floyd-Warshall, for comparison',
      best: { cost: 'Θ(V³)', why: 'Three nested loops, whatever the graph.' },
      average: { cost: 'Θ(V³)', why: 'Better than Johnson on dense graphs, worse on sparse ones.' },
      worst: { cost: 'Θ(V³)', why: 'The same on every graph.', example: 'zero-on-path' },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as JohnsonSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    negativeEdges,
    zeroOnPath,
    allPositive,
    unreachable,
    negativeCycle,
  ] as unknown as SavedExample[],
  practice: johnsonPractice(() => johnson),
  preview: { example: 'negative-edges', level: 2, hide: ['vn-', 'tbl-', 'D-', 'ptr-', 'jq-w'] },
};

const graphLines = (g: Graph) => [
  `graph ${g.directed ? 'd' : 'u'} ${g.vertices.join(' ')}`,
  ...g.edges.map((e) => `edge ${e.u} ${e.v} ${e.w}`),
];

/**
 * Driver protocol for the code tabs. "graph d|u <names>" starts a graph (the code numbers the
 * names 0..n-1 in that order) and "edge u v w" adds an arc (two arcs when u); neither prints.
 * "johnson" prints the result matrix, rows separated by " | " and INF for no path, or
 * "negative cycle".
 */
function codeScript(calls: OpCall[], settings: JohnsonSettings) {
  const t = new Timeline(johnson, settings, 1, calls);
  const input = graphLines(t.initial.state.graph);
  const expected: string[] = [];
  let before = t.initial.state.graph;
  for (const e of t.entries) {
    const g = e.end.graph;
    if (g !== before) input.push(...graphLines(g));
    before = g;
    if (e.call[0] !== 'run') continue;
    const r = e.steps.at(-1)!.extra?.run;
    if (!r) continue;
    input.push('johnson');
    expected.push(runSummary(g, r));
  }
  return { input, expected };
}

export default johnson;
