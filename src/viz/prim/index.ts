import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, VizDef } from '../../engine/types';
import { layoutSetting } from '../../layouts/graph';
import type { Graph } from '../_graph/graph';
import { graphInput } from '../_graph/kit';
import { loadCall } from '../_graph/presets';
import cppSource from './code/cpp/prim.hpp?raw';
import javaSource from './code/java/Prim.java?raw';
import pythonSource from './code/python/prim.py?raw';
import alreadyATree from './examples/already-a-tree.json';
import dense from './examples/dense.json';
import forest from './examples/forest.json';
import keyDrops from './examples/key-drops.json';
import lazyQueue from './examples/lazy-queue.json';
import otherRoot from './examples/other-root.json';
import ties from './examples/ties.json';
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
  START_CHOICES,
  type PrimExtra,
  type PrimSettings,
  type PrimState,
} from './model';
import { mstPresets, randomMst } from './mst';
import { primPractice } from './practice';
import { view } from './view';

export const prim: VizDef<PrimState, PrimSettings, PrimExtra> = {
  id: 'prim',
  title: "Prim's minimum spanning tree",
  family: 'Graphs',
  blurb:
    'Grow one tree from a start vertex: keep the waiting vertices in a priority queue, keyed by their lightest edge to the tree, and add the lightest each time.',
  settings: [
    {
      kind: 'choice',
      key: 'queue',
      label: 'Priority queue',
      options: [
        { value: 'decrease', label: 'Every vertex, with DECREASE-KEY (CLRS)' },
        { value: 'lazy', label: 'Insert again, skip stale entries (heap code)' },
      ],
      help: 'Both add the vertices in the same order and build the same tree. The lazy queue never changes a key: it adds a new entry, and skips old ones when they come out.',
    },
    {
      kind: 'choice',
      key: 'start',
      label: 'Start vertex r',
      options: START_CHOICES.map((v) => ({ value: v, label: v })),
      help: 'Any vertex works, and with distinct weights every start gives the same tree. A graph without this vertex starts at its first one.',
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
    input: graphInput('A-B:4, A-C:1, B-C:2, B-D:5, C-D:8'),
    buttons: [
      { op: 'load', label: 'Load', usesInput: true, primary: true },
      { op: 'run', label: 'Run Prim', usesInput: false },
    ],
    random: {
      label: 'Random graph',
      make: (rng) => [loadCall(randomMst(rng, rng.int(6, 9))), ['run']],
    },
    presets: mstPresets(),
    sizes: [5, 8, 10, 12],
  },
  explain,
  complexity: [
    {
      op: 'Prim with a binary heap',
      best: {
        cost: 'O(V log V)',
        why: 'A tree or a path: few edges, so the work is V EXTRACT-MINs at O(log V) each.',
        example: 'already-a-tree',
      },
      average: {
        cost: 'O(E log V)',
        why: 'V EXTRACT-MINs, plus a DECREASE-KEY (or an insert) for each edge that lowers a key.',
        example: 'key-drops',
      },
      worst: {
        cost: 'O(E log V)',
        why: 'Every edge lowers a key, and each heap update costs O(log V).',
        example: 'dense',
      },
      note: 'The lazy queue can hold one entry per edge, so its heap has up to E entries: O(log E) = O(log V) per operation.',
    },
    {
      op: 'Prim with an unsorted array (or a matrix)',
      best: {
        cost: 'Θ(V²)',
        why: 'Every EXTRACT-MIN scans the keys of all waiting vertices, edges or not.',
        example: 'already-a-tree',
      },
      average: {
        cost: 'Θ(V²)',
        why: 'Lowering a key is O(1), so the E checks add only O(E) ≤ O(V²).',
      },
      worst: {
        cost: 'Θ(V²)',
        why: 'On a dense graph this beats the heap: Θ(V²) against O(V² log V).',
        example: 'dense',
      },
    },
    {
      op: 'Prim with a Fibonacci heap',
      best: { cost: 'O(E + V log V)', why: 'V EXTRACT-MINs at O(log V) amortized each.' },
      average: {
        cost: 'O(E + V log V)',
        why: 'DECREASE-KEY is O(1) amortized, so the edges cost O(E) in total.',
        example: 'key-drops',
      },
      worst: {
        cost: 'O(E + V log V)',
        why: 'Even when every edge lowers a key, each one costs O(1) amortized.',
        example: 'dense',
      },
    },
    {
      op: 'Checking one edge u-v',
      best: {
        cost: 'O(1)',
        why: 'v is in the tree already, or the edge is no lighter than v.key.',
        example: 'ties',
      },
      average: { cost: 'O(log V)', why: 'When it lowers v.key, v moves up the heap.' },
      worst: {
        cost: 'O(log V)',
        why: 'v climbs from the bottom of the heap to the top.',
        example: 'key-drops',
      },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as PrimSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    keyDrops,
    alreadyATree,
    lazyQueue,
    otherRoot,
    forest,
    ties,
    dense,
  ] as unknown as SavedExample[],
  practice: primPractice(() => prim),
};

const graphLines = (g: Graph) => [
  `graph ${g.vertices.join(' ')}`,
  ...g.edges.map((e) => `edge ${e.u} ${e.v} ${e.w}`),
];

/**
 * Driver protocol for the code tabs. "graph <names>" starts an undirected graph (the code
 * numbers the names 0..n-1 in that order) and "edge u v w" adds an edge; neither prints.
 * "prim r" prints "<total weight> | <π per vertex>", with - for NIL. The code uses a lazy
 * binary heap; both queue settings give the same π. Runs on a directed graph, which the page
 * refuses, are left out.
 */
function codeScript(calls: OpCall[], settings: PrimSettings) {
  const t = new Timeline(prim, { ...settings, queue: 'decrease' }, 1, calls);
  const input = graphLines(t.initial.state.graph);
  const expected: string[] = [];
  let before = t.initial.state.graph;
  for (const e of t.entries) {
    const g = e.end.graph;
    if (g !== before && !g.directed) input.push(...graphLines(g));
    before = g;
    if (e.call[0] !== 'run') continue;
    const r = e.steps.at(-1)!.extra?.run;
    if (!r) continue;
    input.push(`prim ${r.r}`);
    expected.push(runSummary(g, r));
  }
  return { input, expected };
}

export default prim;
