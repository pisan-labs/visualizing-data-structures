import { Timeline } from '../../engine/timeline';
import type { OpCall, Preset, SavedExample, Settings, VizDef } from '../../engine/types';
import type { Rng } from '../../engine/rng';
import { layoutSettingFlow, networkInput } from '../_flow/kit';
import { parseNetwork, type Network } from '../_flow/network';
import {
  bottleneckNetwork,
  loadText,
  matchingNetwork,
  parallelPaths,
  randomNetwork,
} from '../_flow/presets';
import cppSource from './code/cpp/push_relabel.hpp?raw';
import javaSource from './code/java/PushRelabel.java?raw';
import pythonSource from './code/python/push_relabel.py?raw';
import backToSource from './examples/back-to-source.json';
import fifoOrder from './examples/fifo-order.json';
import funnel from './examples/funnel.json';
import highestFirst from './examples/highest-first.json';
import longChain from './examples/long-chain.json';
import relabelToFront from './examples/relabel-to-front.json';
import residualHeights from './examples/residual-heights.json';
import straightToT from './examples/straight-to-t.json';
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
  type PrExtra,
  type PrSettings,
  type PrState,
} from './model';
import { pushRelabelPractice } from './practice';
import { view } from './view';

const preset = (label: string, make: (rng: Rng, n: number) => Network): Preset => ({
  label,
  make: (rng, n) => [loadText(make(rng, n)), ['run']],
});

/** s, then a chain a → b → … → t: every unit of flow walks the whole chain. */
function chainNetwork(rng: Rng, n: number): Network {
  const mid = 'abcdefghijklmn'.slice(0, Math.max(0, Math.min(14, n - 2))).split('');
  const chain = ['s', ...mid, 't'];
  const items = chain.slice(1).map((v, i) => `${chain[i]}>${v}:${rng.int(3, 9)}`);
  return parseNetwork(items.join(', ')) as Network;
}

export const pushRelabel: VizDef<PrState, PrSettings, PrExtra> = {
  id: 'push-relabel',
  title: 'Push-relabel max flow',
  family: 'Flow and matching',
  blurb:
    'Flood the arcs out of the source, then let the extra run downhill one arc at a time, lifting any vertex that gets stuck. No augmenting paths at all.',
  settings: [
    {
      kind: 'choice',
      key: 'rule',
      label: 'Which overflowing vertex next',
      options: [
        { value: 'fifo', label: 'FIFO: a queue of overflowing vertices' },
        { value: 'highest', label: 'Highest label: the highest one first' },
        { value: 'front', label: 'Relabel-to-front: a list, risers to the front (CLRS 26.5)' },
      ],
      help: 'Any order gives a maximum flow; the rule only changes how much work it takes. FIFO and relabel-to-front are O(V³), highest label O(V²√E).',
    },
    {
      kind: 'boolean',
      key: 'residual',
      label: 'Draw the residual network',
      help: 'Each arc shows the room left on it. Dashed arcs are reverse arcs: flow that can be pushed back.',
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
      make: (rng) => [loadText(randomNetwork(rng, rng.int(5, 7), { density: 0.2 })), ['run']],
    },
    presets: [
      preset('Random network', (rng, n) => randomNetwork(rng, n, { density: 0.2 })),
      preset('Dense random network', (rng, n) => randomNetwork(rng, n, { density: 0.5 })),
      preset('Unit capacities', (rng, n) => randomNetwork(rng, n, { density: 0.3, unit: true })),
      preset('One narrow arc: most flow goes back', bottleneckNetwork),
      preset('Separate paths', parallelPaths),
      preset('A long chain', chainNetwork),
      preset('Bipartite matching as a flow', matchingNetwork),
    ],
    sizes: [5, 8, 10],
  },
  explain,
  complexity: [
    {
      op: 'Generic push-relabel (any order)',
      best: {
        cost: 'O(V + E)',
        why: 'When each vertex next to s has its own wide arc to t, it rises once and pushes everything there.',
        example: 'straight-to-t',
      },
      average: {
        cost: 'O(V²E)',
        why: 'At most 2V² relabels and 2VE saturating pushes; the non-saturating pushes are bounded by 4V²(V + E).',
        example: 'fifo-order',
      },
      worst: {
        cost: 'O(V²E)',
        why: 'Each vertex rises at most 2V − 1 times, and between rises it can push a little many times.',
        example: 'back-to-source',
      },
    },
    {
      op: 'FIFO or relabel-to-front order',
      best: {
        cost: 'O(V + E)',
        why: 'Each vertex rises once, to just above t, and pushes all its excess there.',
        example: 'straight-to-t',
      },
      average: {
        cost: 'O(V³)',
        why: 'Work goes in passes over the overflowing vertices, and there are O(V²) passes.',
        example: 'relabel-to-front',
      },
      worst: {
        cost: 'O(V³)',
        why: 'Each pass ends at most one non-saturating push per vertex, which bounds them by O(V³).',
        example: 'back-to-source',
      },
    },
    {
      op: 'Highest-label order',
      best: {
        cost: 'O(V + E)',
        why: 'As for FIFO: one rise and one push per vertex.',
        example: 'straight-to-t',
      },
      average: {
        cost: 'O(V²√E)',
        why: 'Working from the top keeps excess moving down in waves, so fewer small pushes.',
        example: 'highest-first',
      },
      worst: {
        cost: 'O(V²√E)',
        why: 'The bound on non-saturating pushes drops to O(V²√E) (Cheriyan and Maheshwari).',
        example: 'long-chain',
      },
    },
    {
      op: 'One push or relabel',
      best: {
        cost: 'O(1)',
        why: 'A push changes the flow on one arc and two excesses.',
        example: 'fifo-order',
      },
      average: {
        cost: 'O(1) / O(deg u)',
        why: 'A relabel looks at every residual arc out of u for the lowest neighbour.',
        example: 'residual-heights',
      },
      worst: {
        cost: 'O(V)',
        why: 'A vertex joined to every other one has V − 1 neighbours to look at when it relabels.',
        example: 'back-to-source',
      },
      note: 'The current-neighbour pointer means each vertex scans its list once per height.',
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as PrSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    fifoOrder,
    backToSource,
    highestFirst,
    relabelToFront,
    residualHeights,
    funnel,
    straightToT,
    longChain,
  ] as unknown as SavedExample[],
  practice: pushRelabelPractice(() => pushRelabel),
  preview: { example: 'fifo-order', level: 2, hide: ['ht-', 'q-', 'cut-', 'cmp-'] },
};

const netLines = (net: Network) => [
  `graph ${net.graph.vertices.join(' ')}`,
  ...net.graph.edges.map((e) => `arc ${e.u} ${e.v} ${e.w}`),
];

/**
 * Driver protocol for the code tabs. "graph <names>" starts a network (the code numbers the
 * names 0..n-1 in that order) and "arc u v c" adds an arc; neither prints. "push-relabel s t"
 * prints "<flow> | <pushes> | <relabels> | <s side of the cut> | <u>v:flow for each arc>". The
 * code uses the FIFO rule, so the model does too here.
 */
function codeScript(calls: OpCall[], settings: PrSettings) {
  const t = new Timeline(pushRelabel, { ...settings, rule: 'fifo' }, 1, calls);
  const input = netLines(t.initial.state.net);
  const expected: string[] = [];
  let before = t.initial.state.net;
  for (const e of t.entries) {
    const net = e.end.net;
    if (net !== before) input.push(...netLines(net));
    before = net;
    const r = e.steps.at(-1)!.extra?.run;
    if (e.call[0] === 'run' && r?.done) {
      input.push(`push-relabel ${r.s} ${r.t}`);
      expected.push(runSummary(net, r));
    }
  }
  return { input, expected };
}

export default pushRelabel;
