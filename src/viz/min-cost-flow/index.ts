import type { Rng } from '../../engine/rng';
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
import cppSource from './code/cpp/min_cost_flow.hpp?raw';
import javaSource from './code/java/MinCostFlow.java?raw';
import pythonSource from './code/python/min_cost_flow.py?raw';
import cheapButNarrow from './examples/cheap-but-narrow.json';
import cheapestFirst from './examples/cheapest-first.json';
import noRoute from './examples/no-route.json';
import potentials from './examples/potentials.json';
import residualCosts from './examples/residual-costs.json';
import sendBack from './examples/send-back.json';
import target from './examples/target.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  ops,
  PARSE,
  pseudocode,
  runSummary,
  type McExtra,
  type McSettings,
  type McState,
} from './model';
import { minCostPractice } from './practice';
import { view } from './view';

const preset = (label: string, make: (rng: Rng, n: number) => Network): Preset => ({
  label,
  make: (rng, n) => [loadText(make(rng, n), true), ['run']],
});

export const minCostFlow: VizDef<McState, McSettings, McExtra> = {
  id: 'min-cost-flow',
  title: 'Min-cost flow',
  family: 'Flow and matching',
  blurb:
    'Every arc has a capacity and a price per unit. Push flow along the cheapest path left, again and again, and the flow stays the cheapest of its size.',
  settings: [
    {
      kind: 'choice',
      key: 'method',
      label: 'How to find each cheapest path',
      options: [
        { value: 'bellman-ford', label: 'Bellman-Ford (handles the negative reverse arcs)' },
        { value: 'dijkstra', label: 'Dijkstra with potentials (reduced costs)' },
      ],
      help: 'Both find the same cheapest paths. Potentials make every reduced cost at least 0, so the faster Dijkstra can do it.',
    },
    {
      kind: 'number',
      key: 'target',
      label: 'Units to send (0 for as many as possible)',
      min: 0,
      max: 99,
      help: 'Stop once this much flow reaches t. It is still the cheapest flow of that size.',
    },
    {
      kind: 'boolean',
      key: 'residual',
      label: 'Draw the residual network',
      help: 'Each arc shows the room left and the cost per unit. Dashed reverse arcs cost minus the cost of their arc.',
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
    input: networkInput('s>a:3:2, s>b:2:1, a>b:1:1, a>t:2:3, b>t:3:4', PARSE),
    buttons: [
      { op: 'load', label: 'Load', usesInput: true, primary: true },
      { op: 'run', label: 'Find min-cost flow', usesInput: false },
    ],
    random: {
      label: 'Random network',
      make: (rng) => [loadText(randomNetwork(rng, rng.int(6, 7), { density: 0.2 }), true), ['run']],
    },
    presets: [
      preset('Random network', (rng, n) => randomNetwork(rng, n, { density: 0.2 })),
      preset('Dense random network', (rng, n) => randomNetwork(rng, n, { density: 0.5 })),
      preset('Separate paths, different prices', parallelPaths),
      preset('One narrow arc in the middle', bottleneckNetwork),
      preset('Assignment: workers to jobs', (rng, n) => {
        const net = matchingNetwork(rng, n);
        // Only the middle arcs (worker to job) cost anything.
        const cost = Object.fromEntries(
          net.graph.edges.map((e) => [
            `${e.u}-${e.v}`,
            e.u === net.s || e.v === net.t ? 0 : (net.cost[`${e.u}-${e.v}`] ?? 1),
          ]),
        );
        return { ...net, cost };
      }),
      preset('Free arcs (cost 0 everywhere)', (rng, n) =>
        randomNetwork(rng, n, { density: 0.25, maxCost: 0 }),
      ),
    ],
    sizes: [5, 7, 9, 11],
  },
  explain,
  complexity: [
    {
      op: 'Successive shortest paths, Bellman-Ford',
      best: {
        cost: 'O(E)',
        why: 'When t cannot be reached, one search shows it: one pass sets what s reaches, the next changes nothing.',
        example: 'no-route',
      },
      average: {
        cost: 'O(k · VE)',
        why: 'k cheapest paths, each found by Bellman-Ford in up to V - 1 passes over the E residual arcs.',
        example: 'cheapest-first',
      },
      worst: {
        cost: 'O(|f*| · VE)',
        why: 'Each path carries at least 1 unit, so there can be as many paths as the flow is large.',
        example: 'cheap-but-narrow',
      },
    },
    {
      op: 'Successive shortest paths, Dijkstra with potentials',
      best: {
        cost: 'O(E log V)',
        why: 'One search, which finds t out of reach.',
        example: 'no-route',
      },
      average: {
        cost: 'O(k · E log V)',
        why: 'k paths, each one Dijkstra (with a heap) on reduced costs, plus O(V) to update h.',
        example: 'potentials',
      },
      worst: {
        cost: 'O(|f*| · E log V)',
        why: 'Again at least 1 unit per path; only the cost of each search drops.',
        example: 'potentials',
      },
      note: 'This page scans for the closest vertex, O(V²) per search, as small graphs allow.',
    },
    {
      op: 'Stopping at a target of k units',
      best: {
        cost: 'O(VE)',
        why: 'The first cheapest path has room for all k units.',
        example: 'target',
      },
      average: {
        cost: 'O(p · VE)',
        why: 'p paths until k units have gone, each Bellman-Ford.',
        example: 'target',
      },
      worst: {
        cost: 'O(k · VE)',
        why: 'Every path may add only 1 unit.',
        example: 'cheap-but-narrow',
      },
    },
    {
      op: 'Extra space',
      best: {
        cost: 'Θ(V + E)',
        why: 'A flow per arc, and a distance and parent per vertex.',
        example: 'send-back',
      },
      average: {
        cost: 'Θ(V + E)',
        why: 'The residual network comes from the capacities and the flow; it is never stored.',
        example: 'residual-costs',
      },
      worst: {
        cost: 'Θ(V + E)',
        why: 'Potentials add one number per vertex.',
        example: 'potentials',
      },
      note: 'The code tabs keep V × V matrices, Θ(V²), which is simplest for small networks.',
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as McSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    cheapestFirst,
    sendBack,
    residualCosts,
    potentials,
    target,
    cheapButNarrow,
    noRoute,
  ] as unknown as SavedExample[],
  practice: minCostPractice(() => minCostFlow),
  preview: { example: 'cheapest-first', level: 2, hide: ['vn-', 'tbl-'] },
};

const netLines = (net: Network) => [
  `graph ${net.graph.vertices.join(' ')}`,
  ...net.graph.edges.map((e) => `arc ${e.u} ${e.v} ${e.w} ${net.cost[`${e.u}-${e.v}`] ?? 1}`),
];

/**
 * Driver protocol for the code tabs. "graph <names>" starts a network (the code numbers the
 * names 0..n-1 in that order) and "arc u v cap cost" adds an arc; neither prints.
 * "min-cost-flow s t k" sends k units (0: as many as possible) and prints
 * "<flow> <cost> | <paths> | <u>v:flow for each arc>". The code uses Bellman-Ford, so the model
 * does too here.
 */
function codeScript(calls: OpCall[], settings: McSettings) {
  const t = new Timeline(minCostFlow, { ...settings, method: 'bellman-ford' }, 1, calls);
  const input = netLines(t.initial.state.net);
  const expected: string[] = [];
  let before = t.initial.state.net;
  for (const e of t.entries) {
    const net = e.end.net;
    if (net !== before) input.push(...netLines(net));
    before = net;
    const r = e.steps.at(-1)!.extra?.run;
    if (e.call[0] === 'run' && r) {
      input.push(
        `min-cost-flow ${r.s} ${r.t} ${Math.max(0, Math.round(Number(settings.target) || 0))}`,
      );
      expected.push(runSummary(net, r));
    }
  }
  return { input, expected };
}

export default minCostFlow;
