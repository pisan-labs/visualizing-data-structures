import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, VizDef } from '../../engine/types';
import type { Graph } from '../_graph/graph';
import { MAX_INPUT } from '../_graph/kit';
import cppSource from './code/cpp/tsp.hpp?raw';
import javaSource from './code/java/Tsp.java?raw';
import pythonSource from './code/python/tsp.py?raw';
import eightCities from './examples/eight-cities.json';
import exactTable from './examples/exact-table.json';
import nearestTrap from './examples/nearest-trap.json';
import notMetric from './examples/not-metric.json';
import onACircle from './examples/on-a-circle.json';
import treeTrap from './examples/tree-trap.json';
import treeWalk from './examples/tree-walk.json';
import twoOptFix from './examples/two-opt-fix.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  ops,
  parseCities,
  pseudocode,
  type TspExtra,
  type TspSettings,
  type TspState,
} from './model';
import { tspPractice } from './practice';
import { loadCities, randomCities, tspPresets } from './presets';
import { view } from './view';

export const tsp: VizDef<TspState, TspSettings, TspExtra> = {
  id: 'tsp',
  title: 'Traveling salesperson: exact vs approximate',
  family: 'Hard problems',
  blurb:
    'Visit every city once and come home by the shortest tour: Held-Karp finds the best one in exponential time, and the tree walk and nearest neighbour find good ones fast.',
  settings: [
    {
      kind: 'choice',
      key: 'method',
      label: 'Method',
      options: [
        { value: 'mst', label: 'Walk a minimum spanning tree (CLRS, at most 2 × best)' },
        { value: 'nearest', label: 'Nearest neighbour (greedy, no guarantee)' },
        { value: 'exact', label: 'Held-Karp dynamic programming (exact)' },
      ],
      help: 'Every run ends by comparing its tour with the best tour, which the page finds with Held-Karp.',
    },
    {
      kind: 'boolean',
      key: 'improve',
      label: 'Improve the tour with 2-opt',
      help: 'After the tree walk or nearest neighbour, swap pairs of edges while that shortens the tour. Held-Karp needs no help.',
    },
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
    input: {
      label: 'Cities or graph',
      placeholder: 'e.g. A(0,0) B(30,40) C(60,0)',
      maxLength: MAX_INPUT,
      sample: 'A(0,0) B(30,40) C(60,0) D(30,90)',
      parse: parseCities,
    },
    buttons: [
      { op: 'load', label: 'Load', usesInput: true, primary: true },
      { op: 'run', label: 'Find a tour', usesInput: false },
    ],
    random: {
      label: 'Random cities',
      make: (rng) => [loadCities(randomCities(rng, rng.int(5, 7))), ['run']],
    },
    presets: tspPresets(),
    sizes: [5, 6, 8],
  },
  explain,
  complexity: [
    {
      op: 'Trying every tour',
      best: {
        cost: 'Θ(n!)',
        why: 'With the start fixed there are (n − 1)!/2 tours, and each one has to be added up.',
        example: 'eight-cities',
      },
      average: {
        cost: 'Θ(n!)',
        why: 'Nothing lets you skip a tour without looking at it.',
      },
      worst: {
        cost: 'Θ(n!)',
        why: 'Eight cities give 2520 tours; twenty give about 6 × 10¹⁶.',
        example: 'eight-cities',
      },
    },
    {
      op: 'Held-Karp',
      best: {
        cost: 'Θ(2ⁿ n²)',
        why: 'It fills every entry C(S, j), about 2ⁿ n of them, at O(n) each, whatever the distances.',
        example: 'exact-table',
      },
      average: {
        cost: 'Θ(2ⁿ n²)',
        why: 'The same table every time. It also needs Θ(2ⁿ n) memory.',
        example: 'exact-table',
      },
      worst: {
        cost: 'Θ(2ⁿ n²)',
        why: 'Exponential, but far below n!: 8 cities need 448 entries, not 2520 tours.',
        example: 'eight-cities',
      },
    },
    {
      op: 'Tree walk (APPROX-TSP-TOUR)',
      best: {
        cost: 'Θ(n²)',
        why: 'Prim with an array on the complete graph, n² edges; the walk is O(n).',
        example: 'tree-walk',
      },
      average: {
        cost: 'Θ(n²)',
        why: 'The same work for any distances.',
        example: 'tree-trap',
      },
      worst: {
        cost: 'Θ(n²)',
        why: 'Fast, and with the triangle inequality the tour is at most twice the best.',
        example: 'not-metric',
      },
      note: 'The time never changes. What changes is how good the tour is: at most 2 × best with the triangle inequality, unbounded without it.',
    },
    {
      op: 'Nearest neighbour',
      best: {
        cost: 'Θ(n²)',
        why: 'Each of n moves scans the cities left.',
        example: 'on-a-circle',
      },
      average: {
        cost: 'Θ(n²)',
        why: 'n moves, each over up to n cities.',
        example: 'nearest-trap',
      },
      worst: {
        cost: 'Θ(n²)',
        why: 'Still fast, but the tour can be Θ(log n) times the best on bad inputs.',
        example: 'nearest-trap',
      },
    },
    {
      op: 'One 2-opt pass',
      best: {
        cost: 'O(n)',
        why: 'The first pair of edges looked at already shortens the tour.',
        example: 'two-opt-fix',
      },
      average: {
        cost: 'O(n²)',
        why: 'A pass looks at up to n(n − 3)/2 pairs of edges before it finds a swap or stops.',
        example: 'two-opt-fix',
      },
      worst: {
        cost: 'O(n²)',
        why: 'Every pair is looked at; that is how 2-opt knows it is done.',
      },
      note: 'Each swap shortens the tour, so 2-opt stops. On some inputs it needs exponentially many swaps, but in practice it stops quickly.',
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as TspSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    treeWalk,
    nearestTrap,
    treeTrap,
    exactTable,
    eightCities,
    twoOptFix,
    notMetric,
    onACircle,
  ] as unknown as SavedExample[],
  practice: tspPractice(() => tsp),
  preview: { example: 'two-opt-fix', level: 2, hide: ['tour-'] },
};

const graphLines = (g: Graph) => [
  `graph ${g.vertices.join(' ')}`,
  ...g.edges.map((e) => `edge ${e.u} ${e.v} ${e.w}`),
];

/**
 * Driver protocol for the code tabs. "graph <names>" starts the cities (the code numbers them
 * 0..n-1 in that order) and "edge u v w" sets a distance; neither prints. "tsp" prints
 * "<the tree-walk tour> | <its length> | <the optimum>". The code follows the default method,
 * the tree walk without 2-opt, whatever the settings.
 */
function codeScript(calls: OpCall[], settings: TspSettings) {
  const t = new Timeline(tsp, { ...settings, method: 'mst', improve: false }, 1, calls);
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
    input.push('tsp');
    expected.push(`${r.tour.join(' ')} | ${r.cost} | ${r.opt}`);
  }
  return { input, expected };
}

export default tsp;
