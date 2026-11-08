import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, VizDef } from '../../engine/types';
import { layoutSetting } from '../../layouts/graph';
import type { Graph } from '../_graph/graph';
import { graphInput } from '../_graph/kit';
import { graphPresets, loadCall, randomGraph } from '../_graph/presets';
import cppSource from './code/cpp/coloring.hpp?raw';
import javaSource from './code/java/Coloring.java?raw';
import pythonSource from './code/python/coloring.py?raw';
import badOrder from './examples/bad-order.json';
import clique from './examples/clique.json';
import dsaturFixes from './examples/dsatur-fixes.json';
import evenCycle from './examples/even-cycle.json';
import oddCycle from './examples/odd-cycle.json';
import oneAtATime from './examples/one-at-a-time.json';
import welshPowell from './examples/welsh-powell.json';
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
  undirected,
  type ColoringExtra,
  type ColoringSettings,
  type ColoringState,
} from './model';
import { coloringPractice } from './practice';
import { view } from './view';

export const graphColoring: VizDef<ColoringState, ColoringSettings, ColoringExtra> = {
  id: 'graph-coloring',
  title: 'Graph coloring',
  family: 'Graphs',
  blurb:
    'Give each vertex the smallest color its neighbours do not have. The order you go in decides how many colors you need.',
  settings: [
    {
      kind: 'choice',
      key: 'order',
      label: 'Vertex order',
      options: [
        { value: 'given', label: 'As given (name order)' },
        { value: 'largest', label: 'Largest degree first (Welsh-Powell)' },
        { value: 'dsatur', label: 'DSatur: most neighbour colors first' },
      ],
      help: 'Greedy coloring is the same in all three; only the order changes. Ties go to the larger degree, then name order.',
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
    input: graphInput('A-B, A-C, B-C, C-D, D-E, E-A'),
    buttons: [
      { op: 'load', label: 'Load', usesInput: true, primary: true },
      { op: 'run', label: 'Color', usesInput: false },
    ],
    random: {
      label: 'Random graph',
      make: (rng) => [loadCall(randomGraph(rng, rng.int(6, 9), { density: 0.3 })), ['run']],
    },
    presets: graphPresets({ then: () => [['run']] }),
    sizes: [5, 8, 10, 12],
  },
  explain,
  complexity: [
    {
      op: 'Greedy coloring, adjacency lists',
      best: {
        cost: 'O(V + E)',
        why: 'Each vertex looks at its neighbours once, and the smallest free color is found in O(degree).',
        example: 'one-at-a-time',
      },
      average: {
        cost: 'O(V + E)',
        why: 'Every edge is looked at twice, once from each end.',
        example: 'bad-order',
      },
      worst: {
        cost: 'O(V + E)',
        why: 'Even a complete graph is O(V²) = O(E): no edge is looked at more than twice.',
        example: 'clique',
      },
    },
    {
      op: 'Welsh-Powell (largest degree first)',
      best: {
        cost: 'O(V log V + E)',
        why: 'Sorting by degree, then the same greedy pass.',
        example: 'welsh-powell',
      },
      average: { cost: 'O(V log V + E)', why: 'The sort adds V log V to the greedy pass.' },
      worst: {
        cost: 'O(V log V + E)',
        why: 'The order is fixed before coloring starts, so nothing is redone.',
        example: 'welsh-powell',
      },
    },
    {
      op: 'DSatur, scanning for the next vertex',
      best: {
        cost: 'O(V²)',
        why: 'Every pick scans the uncolored vertices for the largest saturation.',
        example: 'dsatur-fixes',
      },
      average: {
        cost: 'O(V² + E)',
        why: 'V picks at O(V) each, plus each edge updating a saturation.',
      },
      worst: {
        cost: 'O(V² + E)',
        why: 'A heap keyed by saturation brings it down to O((V + E) log V).',
        example: 'dsatur-fixes',
      },
    },
    {
      op: 'The fewest colors (chromatic number)',
      best: {
        cost: 'O(V + E)',
        why: 'Two colors: one BFS checks for an odd cycle.',
        example: 'even-cycle',
      },
      average: {
        cost: 'exponential',
        why: 'Deciding whether 3 colors are enough is NP-complete.',
        example: 'odd-cycle',
      },
      worst: {
        cost: 'O(2ⁿ · n)',
        why: 'The best known exact algorithms take exponential time; greedy is only a guess.',
      },
      note: 'Greedy always finishes fast. It just might use more colors than needed.',
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) =>
      codeScript(calls, settings as ColoringSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    oneAtATime,
    badOrder,
    dsaturFixes,
    welshPowell,
    evenCycle,
    oddCycle,
    clique,
  ] as unknown as SavedExample[],
  practice: coloringPractice(() => graphColoring),
  preview: { example: 'one-at-a-time', level: 2, hide: ['vn-', 'ord-', 'tbl-', 'ptr-'] },
};

const graphLines = (g0: Graph) => {
  const g = undirected(g0);
  return [`graph ${g.vertices.join(' ')}`, ...g.edges.map((e) => `edge ${e.u} ${e.v}`)];
};

/**
 * Driver protocol for the code tabs. "graph <names>" starts a graph (the code numbers the names
 * 0..n-1 in that order) and "edge u v" joins two vertices; neither prints. "color" prints
 * "<colors used> | <color per vertex>". The code colors in the given (name) order, so the
 * model runs with that order.
 */
function codeScript(calls: OpCall[], settings: ColoringSettings) {
  const t = new Timeline(graphColoring, { ...settings, order: 'given' }, 1, calls);
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
    input.push('color');
    expected.push(runSummary(g, r));
  }
  return { input, expected };
}

export default graphColoring;
