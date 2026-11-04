import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, VizDef } from '../../engine/types';
import { layoutSetting } from '../../layouts/graph';
import type { Graph } from '../_graph/graph';
import { graphInput } from '../_graph/kit';
import { loadCall } from '../_graph/presets';
import {
  equalWeights,
  lowersEveryKey,
  pathsPreset,
  randomWeighted,
  randomWeightedDag,
  twoPieces,
  withNegativeEdges,
} from '../_paths/presets';
import cppSource from './code/cpp/dijkstra.hpp?raw';
import javaSource from './code/java/Dijkstra.java?raw';
import pythonSource from './code/python/dijkstra.py?raw';
import closestFirst from './examples/closest-first.json';
import fewestEdges from './examples/fewest-edges.json';
import lazyQueue from './examples/lazy-queue.json';
import lowersEveryKeyExample from './examples/lowers-every-key.json';
import negativeEdge from './examples/negative-edge.json';
import roads from './examples/roads.json';
import unreachable from './examples/unreachable.json';
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
  type DijkstraExtra,
  type DijkstraSettings,
  type DijkstraState,
} from './model';
import { dijkstraPractice } from './practice';
import { view } from './view';

export const dijkstra: VizDef<DijkstraState, DijkstraSettings, DijkstraExtra> = {
  id: 'dijkstra',
  title: "Dijkstra's shortest paths",
  family: 'Graphs',
  blurb:
    'Find the lightest path from one vertex to every other: settle the closest vertex in a priority queue, then relax its edges.',
  settings: [
    {
      kind: 'choice',
      key: 'queue',
      label: 'Priority queue',
      options: [
        { value: 'decrease', label: 'Every vertex, with DECREASE-KEY (CLRS)' },
        { value: 'lazy', label: 'Insert again, skip stale entries (heap code)' },
      ],
      help: 'Both settle the vertices in the same order. The lazy queue never changes a key: it adds a new entry, and skips old ones when they come out.',
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
      { op: 'run', label: 'Run Dijkstra from', usesInput: true },
    ],
    random: {
      label: 'Random graph',
      make: (rng) => [loadCall(randomWeighted(rng, rng.int(6, 9), { density: 0.18 }))],
    },
    presets: [
      pathsPreset('Random graph', (rng, n) => randomWeighted(rng, n, { density: 0.2 })),
      pathsPreset('Random directed graph', (rng, n) =>
        randomWeighted(rng, n, { directed: true, density: 0.15 }),
      ),
      pathsPreset('Dense graph', (rng, n) => randomWeighted(rng, n, { density: 0.6 })),
      pathsPreset('DAG (directed, no cycles)', (rng, n) => randomWeightedDag(rng, n)),
      pathsPreset('Two pieces (unreachable vertices)', twoPieces),
      pathsPreset('Every weight 1 (like BFS)', equalWeights),
      pathsPreset('Worst case (at most 10 vertices)', (_rng, n) => lowersEveryKey(n)),
      pathsPreset('Negative edges (Dijkstra refuses)', withNegativeEdges),
    ],
    sizes: [5, 8, 10, 12],
  },
  explain,
  complexity: [
    {
      op: 'Dijkstra with a binary heap',
      best: {
        cost: 'O(V log V)',
        why: 'No key ever drops: the work is V EXTRACT-MINs at O(log V) each.',
        example: 'unreachable',
      },
      average: {
        cost: 'O((V + E) log V)',
        why: 'V EXTRACT-MINs, plus a DECREASE-KEY (or an insert) for each edge that lowers a d.',
        example: 'closest-first',
      },
      worst: {
        cost: 'O(E log V)',
        why: 'Every edge lowers a key, and each of those E heap updates costs O(log V).',
        example: 'lowers-every-key',
      },
      note: 'The lazy queue can hold one entry per edge, so its heap has up to E entries: O(log E) = O(log V) per operation.',
    },
    {
      op: 'Dijkstra with an unsorted array',
      best: {
        cost: 'Θ(V²)',
        why: 'Every EXTRACT-MIN scans what is left of Q, so V extractions cost Θ(V²), edges or not.',
        example: 'unreachable',
      },
      average: {
        cost: 'Θ(V²)',
        why: 'Lowering a key is O(1) in an array, so the E relaxations add only O(E) ≤ O(V²).',
      },
      worst: {
        cost: 'Θ(V²)',
        why: 'Even when every edge lowers a key, the scans still dominate.',
        example: 'lowers-every-key',
      },
      note: 'On a dense graph, with E near V², the array beats the binary heap: Θ(V²) against O(V² log V).',
    },
    {
      op: 'Dijkstra with a Fibonacci heap',
      best: {
        cost: 'O(E + V log V)',
        why: 'V EXTRACT-MINs at O(log V) amortized each, and each edge costs O(1).',
      },
      average: {
        cost: 'O(E + V log V)',
        why: 'DECREASE-KEY is O(1) amortized, so relaxing all E edges costs O(E) in total.',
        example: 'closest-first',
      },
      worst: {
        cost: 'O(E + V log V)',
        why: 'Every edge lowering a key still costs O(1) amortized each.',
        example: 'lowers-every-key',
      },
      note: 'The best bound in theory; in practice a binary heap is usually faster.',
    },
    {
      op: 'RELAX(u, v, w) with a binary heap',
      best: {
        cost: 'O(1)',
        why: 'The test fails: going through u is no shorter, so nothing changes.',
        example: 'closest-first',
      },
      average: {
        cost: 'O(log V)',
        why: 'When it lowers v.d, v moves up the heap.',
      },
      worst: {
        cost: 'O(log V)',
        why: 'v climbs from the bottom of the heap to the top.',
        example: 'lowers-every-key',
      },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) =>
      codeScript(calls, settings as DijkstraSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    closestFirst,
    negativeEdge,
    unreachable,
    lowersEveryKeyExample,
    lazyQueue,
    roads,
    fewestEdges,
  ] as unknown as SavedExample[],
  practice: dijkstraPractice(() => dijkstra),
};

const graphLines = (g: Graph) => [
  `graph ${g.directed ? 'directed' : 'undirected'} ${g.vertices.join(' ')}`,
  ...g.edges.map((e) => `edge ${e.u} ${e.v} ${e.w}`),
];

/**
 * Driver protocol for the code tabs. "graph <directed|undirected> <names>" starts a graph (the
 * code numbers the names 0..n-1 in that order) and "edge u v w" adds an edge; neither prints.
 * "dijkstra s" prints "<d per vertex> | <π per vertex>", with inf and - for ∞ and NIL, or
 * "negative edge" when the graph has one. Runs from a vertex that is not there are left out.
 * The code uses a lazy binary heap; both queue settings give the same d and π.
 */
function codeScript(calls: OpCall[], settings: DijkstraSettings) {
  const t = new Timeline(dijkstra, { ...settings, queue: 'decrease' }, 1, calls);
  const input = graphLines(t.initial.state.graph);
  const expected: string[] = [];
  let before = t.initial.state.graph;
  for (const e of t.entries) {
    const g = e.end.graph;
    if (g !== before) input.push(...graphLines(g));
    before = g;
    if (e.call[0] !== 'run') continue;
    const last = e.steps.at(-1)!;
    const r = last.extra?.run;
    if (r) {
      input.push(`dijkstra ${r.s}`);
      expected.push(runSummary(g, r));
    } else if (last.lines.includes('pre')) {
      input.push(`dijkstra ${last.vars!.s}`);
      expected.push('negative edge');
    }
  }
  return { input, expected };
}

export default dijkstra;
