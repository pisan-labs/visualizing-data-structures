import { Timeline } from '../../engine/timeline';
import type { OpCall, Preset, SavedExample, Settings, VizDef } from '../../engine/types';
import { layoutSettingFlow, networkInput } from '../_flow/kit';
import type { Network } from '../_flow/network';
import {
  bottleneckNetwork,
  loadText,
  matchingNetwork,
  parallelPaths,
  randomNetwork,
} from '../_flow/presets';
import type { Rng } from '../../engine/rng';
import cppSource from './code/cpp/max_flow.hpp?raw';
import javaSource from './code/java/MaxFlow.java?raw';
import pythonSource from './code/python/max_flow.py?raw';
import dfsDetours from './examples/dfs-detours.json';
import narrowArc from './examples/narrow-arc.json';
import noPath from './examples/no-path.json';
import residualView from './examples/residual-view.json';
import takeFlowBack from './examples/take-flow-back.json';
import threePaths from './examples/three-paths.json';
import unitPaths from './examples/unit-paths.json';
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
  type MfExtra,
  type MfSettings,
  type MfState,
} from './model';
import { maxFlowPractice } from './practice';
import { view } from './view';

const preset = (label: string, make: (rng: Rng, n: number) => Network): Preset => ({
  label,
  make: (rng, n) => [loadText(make(rng, n)), ['run']],
});

export const maxFlow: VizDef<MfState, MfSettings, MfExtra> = {
  id: 'max-flow',
  title: 'Maximum flow and minimum cut',
  family: 'Flow and matching',
  blurb:
    'Push flow along paths that still have room until none is left. The last search marks a cut whose capacity equals the flow.',
  settings: [
    {
      kind: 'choice',
      key: 'method',
      label: 'How to find each path',
      options: [
        { value: 'bfs', label: 'Edmonds-Karp: breadth-first, fewest arcs (CLRS)' },
        { value: 'dfs', label: 'Ford-Fulkerson with depth-first search' },
      ],
      help: 'Any augmenting path gives a maximum flow in the end. Breadth-first search bounds the number of paths by O(VE); depth-first search can need as many as the flow is large.',
    },
    {
      kind: 'boolean',
      key: 'residual',
      label: 'Draw the residual network',
      help: 'Each arc shows the room left on it. Dashed arcs are reverse arcs: flow that can be taken back.',
    },
    layoutSettingFlow(),
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
    input: networkInput('s>a:4, s>b:2, a>b:3, a>t:1, b>t:5'),
    buttons: [
      { op: 'load', label: 'Load', usesInput: true, primary: true },
      { op: 'run', label: 'Find max flow', usesInput: false },
    ],
    random: {
      label: 'Random network',
      make: (rng) => [loadText(randomNetwork(rng, rng.int(6, 8), { density: 0.2 })), ['run']],
    },
    presets: [
      preset('Random network', (rng, n) => randomNetwork(rng, n, { density: 0.2 })),
      preset('Dense random network', (rng, n) => randomNetwork(rng, n, { density: 0.5 })),
      preset('Unit capacities', (rng, n) => randomNetwork(rng, n, { density: 0.3, unit: true })),
      preset('One narrow arc in the middle', bottleneckNetwork),
      preset('Separate paths', parallelPaths),
      preset('Bipartite matching as a flow', matchingNetwork),
      preset('Wide capacities (up to 99)', (rng, n) =>
        randomNetwork(rng, n, { density: 0.3, maxCap: 99 }),
      ),
    ],
    sizes: [5, 8, 10, 12],
  },
  explain,
  complexity: [
    {
      op: 'Edmonds-Karp (BFS paths)',
      best: {
        cost: 'O(V + E)',
        why: 'When t cannot be reached, the first search shows it and the flow is 0.',
        example: 'no-path',
      },
      average: {
        cost: 'O(k · E)',
        why: 'Each of the k augmenting paths costs one breadth-first search; k is usually small.',
        example: 'three-paths',
      },
      worst: {
        cost: 'O(VE²)',
        why: 'Shortest-path lengths never shrink, so there are at most O(VE) paths, each O(E) to find.',
        example: 'take-flow-back',
      },
      note: 'The code tabs keep capacities in a V × V matrix, so each search there is O(V²).',
    },
    {
      op: 'Ford-Fulkerson (DFS paths)',
      best: {
        cost: 'O(V + E)',
        why: 'One failed search, as with BFS.',
        example: 'no-path',
      },
      average: {
        cost: 'O(k · E)',
        why: 'k paths, one search each, but DFS paths are often long and narrow, so k grows.',
        example: 'dfs-detours',
      },
      worst: {
        cost: 'O(E · |f*|)',
        why: 'Each path adds at least 1 unit, so there can be as many paths as the maximum flow |f*|.',
        example: 'dfs-detours',
      },
    },
    {
      op: 'The minimum cut, once the flow is maximum',
      best: {
        cost: 'O(V + E)',
        why: 'It is the last, failed search: whatever s still reaches is S.',
        example: 'narrow-arc',
      },
      average: {
        cost: 'O(V + E)',
        why: 'One search, then a pass over the arcs to find those from S to T.',
        example: 'three-paths',
      },
      worst: {
        cost: 'O(V + E)',
        why: 'Every vertex and arc is looked at once.',
        example: 'unit-paths',
      },
    },
    {
      op: 'Extra space',
      best: { cost: 'Θ(V + E)', why: 'A flow per arc, plus a parent and a mark per vertex.' },
      average: {
        cost: 'Θ(V + E)',
        why: 'The residual network is never stored: it comes from the capacities and the flow.',
        example: 'residual-view',
      },
      worst: {
        cost: 'Θ(V + E)',
        why: 'The queue or stack holds at most V vertices.',
        example: 'dfs-detours',
      },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as MfSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    threePaths,
    residualView,
    takeFlowBack,
    dfsDetours,
    narrowArc,
    noPath,
    unitPaths,
  ] as unknown as SavedExample[],
  practice: maxFlowPractice(() => maxFlow),
};

const netLines = (net: Network) => [
  `graph ${net.graph.vertices.join(' ')}`,
  ...net.graph.edges.map((e) => `arc ${e.u} ${e.v} ${e.w}`),
];

/**
 * Driver protocol for the code tabs. "graph <names>" starts a network (the code numbers the
 * names 0..n-1 in that order) and "arc u v c" adds an arc; neither prints. "max-flow s t"
 * prints "<flow> | <paths> | <s side of the cut> | <u>v:flow for each arc>". The code uses
 * breadth-first search (Edmonds-Karp), so the model does too here.
 */
function codeScript(calls: OpCall[], settings: MfSettings) {
  const t = new Timeline(maxFlow, { ...settings, method: 'bfs' }, 1, calls);
  const input = netLines(t.initial.state.net);
  const expected: string[] = [];
  let before = t.initial.state.net;
  for (const e of t.entries) {
    const net = e.end.net;
    if (net !== before) input.push(...netLines(net));
    before = net;
    const r = e.steps.at(-1)!.extra?.run;
    if (e.call[0] === 'run' && r) {
      input.push(`max-flow ${r.s} ${r.t}`);
      expected.push(runSummary(net, r));
    }
  }
  return { input, expected };
}

export default maxFlow;
