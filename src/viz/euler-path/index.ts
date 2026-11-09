import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, Preset, SavedExample, Settings, VizDef } from '../../engine/types';
import { layoutSetting } from '../../layouts/graph';
import type { Graph } from '../_graph/graph';
import { graphInput } from '../_graph/kit';
import { cycleGraph, gridGraph, loadCall, randomGraph } from '../_graph/presets';
import cppSource from './code/cpp/euler.hpp?raw';
import javaSource from './code/java/Euler.java?raw';
import pythonSource from './code/python/euler.py?raw';
import bridges from './examples/bridges.json';
import detour from './examples/detour.json';
import directed from './examples/directed.json';
import envelope from './examples/envelope.json';
import ignoreArrows from './examples/ignore-arrows.json';
import pieces from './examples/pieces.json';
import twoDetours from './examples/two-detours.json';
import explain from './explain.md?raw';
import { eulerianGraph } from './graphs';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  runSummary,
  type EulerExtra,
  type EulerSettings,
  type EulerState,
} from './model';
import { eulerPractice } from './practice';
import { view } from './view';

const preset = (label: string, make: (rng: Rng, n: number) => Graph): Preset => ({
  label,
  make: (rng, n) => [loadCall(make(rng, n)), ['run'] as OpCall],
});

export const eulerPath: VizDef<EulerState, EulerSettings, EulerExtra> = {
  id: 'euler-path',
  title: 'Euler paths (Hierholzer)',
  family: 'Graphs',
  blurb:
    'Walk every edge exactly once. Count the odd degrees to know if you can, then let Hierholzer splice small loops into one big walk.',
  settings: [
    {
      kind: 'choice',
      key: 'arrows',
      label: 'In a directed graph',
      options: [
        { value: 'follow', label: 'Follow the arrows: compare in and out degrees' },
        { value: 'ignore', label: 'Ignore the arrows: every arc is an edge' },
      ],
      help: 'An undirected graph needs 0 or 2 odd degrees. A directed one needs in = out everywhere, except one start with one extra out and one end with one extra in.',
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
    input: graphInput('A-B, B-C, C-A, C-D, D-E, E-C'),
    buttons: [
      { op: 'load', label: 'Load', usesInput: true, primary: true },
      { op: 'run', label: 'Find Euler path', usesInput: false },
    ],
    random: {
      label: 'Random graph with an Euler circuit',
      make: (rng) => [loadCall(eulerianGraph(rng, rng.int(5, 8), false)), ['run']],
    },
    presets: [
      preset('Random Euler circuit', (rng, n) => eulerianGraph(rng, n, false)),
      preset('Random Euler path (two odd vertices)', (rng, n) => eulerianGraph(rng, n, true)),
      preset('Random directed Euler circuit', (rng, n) => eulerianGraph(rng, n, false, true)),
      preset('Random graph (often no path)', (rng, n) => randomGraph(rng, n, { density: 0.3 })),
      preset('Cycle', (_rng, n) => cycleGraph(n)),
      preset('Grid', (_rng, n) => gridGraph(n)),
    ],
    sizes: [5, 8, 10, 12],
  },
  explain,
  complexity: [
    {
      op: 'Checking the degrees and pieces',
      best: {
        cost: 'O(V + E)',
        why: 'Count the degrees, then one search for the pieces.',
        example: 'bridges',
      },
      average: {
        cost: 'O(V + E)',
        why: 'Each edge adds to two degrees and is looked at once in the search.',
      },
      worst: { cost: 'O(V + E)', why: 'The same, whatever the answer.', example: 'pieces' },
    },
    {
      op: 'Hierholzer with a stack',
      best: {
        cost: 'O(V + E)',
        why: 'One walk uses every edge and gets stuck only at the end.',
        example: 'envelope',
      },
      average: {
        cost: 'O(V + E)',
        why: 'Every edge is walked once and every vertex pushed and popped once per visit.',
        example: 'detour',
      },
      worst: {
        cost: 'O(V + E)',
        why: 'Keep a pointer to the next unused edge of each vertex, so no edge is looked at twice.',
        example: 'two-detours',
      },
      note: 'Fleury’s algorithm, which avoids bridges, is O(E²): it checks for a bridge before every step.',
    },
    {
      op: 'Splicing a detour into the circuit',
      best: {
        cost: 'O(1)',
        why: 'The stack does it: the detour comes off the stack right where it belongs.',
        example: 'detour',
      },
      average: { cost: 'O(1)', why: 'Prepending to a linked list or reversing at the end.' },
      worst: {
        cost: 'O(k)',
        why: 'Splicing by copying lists instead of using the stack costs the length k of the detour.',
      },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as EulerSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    envelope,
    detour,
    bridges,
    twoDetours,
    directed,
    ignoreArrows,
    pieces,
  ] as unknown as SavedExample[],
  practice: eulerPractice(() => eulerPath),
  preview: { example: 'envelope', level: 3, hide: ['vn-', 'h-', 'stk-', 'cir-', 'ptr-'] },
};

const graphLines = (g: Graph, settings: EulerSettings) => [
  `graph ${g.directed && settings.arrows === 'follow' ? 'd' : 'u'} ${g.vertices.join(' ')}`,
  ...g.edges.map((e) => `edge ${e.u} ${e.v}`),
];

/**
 * Driver protocol for the code tabs. "graph d|u <names>" starts a graph (the code numbers the
 * names 0..n-1 in that order) and "edge u v" adds an edge (an arc when d); neither prints.
 * "euler" prints the path's vertices, or "none". A directed graph with the arrows ignored is
 * sent as undirected, its arcs as edges.
 */
function codeScript(calls: OpCall[], settings: EulerSettings) {
  const t = new Timeline(eulerPath, settings, 1, calls);
  const input = graphLines(t.initial.state.graph, settings);
  const expected: string[] = [];
  let before = t.initial.state.graph;
  for (const e of t.entries) {
    const g = e.end.graph;
    if (g !== before) input.push(...graphLines(g, settings));
    before = g;
    if (e.call[0] !== 'run') continue;
    const r = e.steps.at(-1)!.extra?.run;
    if (!r) continue;
    input.push('euler');
    expected.push(runSummary(r));
  }
  return { input, expected };
}

export default eulerPath;
