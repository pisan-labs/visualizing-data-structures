import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, Preset, SavedExample, Settings, VizDef } from '../../engine/types';
import { layoutSetting } from '../../layouts/graph';
import type { Graph } from '../_graph/graph';
import { graphInput } from '../_graph/kit';
import { formatGraph } from '../_graph/parse';
import { completeGraph, cycleGraph, gridGraph, randomGraph, randomTree } from '../_graph/presets';
import { clustersGraph } from './graphs';
import cppSource from './code/cpp/karger.hpp?raw';
import javaSource from './code/java/Karger.java?raw';
import pythonSource from './code/python/karger.py?raw';
import bridge from './examples/bridge.json';
import byHand from './examples/by-hand.json';
import cycleCuts from './examples/cycle-cuts.json';
import manyTrials from './examples/many-trials.json';
import missed from './examples/missed.json';
import shuffled from './examples/shuffled.json';
import treeAlways from './examples/tree-always.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  groupsOf,
  init,
  initialSay,
  initialVars,
  MAX_TRIALS,
  MIN_TRIALS,
  ops,
  pseudocode,
  type KgSettings,
  type KgState,
} from './model';
import { kargerPractice } from './practice';
import { view } from './view';

const loadCall = (g: Graph): OpCall => ['load', formatGraph(g)];

const preset = (label: string, make: (rng: Rng, n: number) => Graph, then: OpCall): Preset => ({
  label,
  make: (rng, n) => [loadCall(make(rng, n)), then],
});

export const kargerMinCut: VizDef<KgState, KgSettings, undefined> = {
  id: 'karger-min-cut',
  title: "Karger's min cut",
  family: 'Randomized algorithms',
  blurb:
    'Contract random edges until two super-vertices are left: the edges between them are a cut. One trial is often wrong, so run many and keep the smallest.',
  settings: [
    {
      kind: 'choice',
      key: 'pick',
      label: 'How to pick edges',
      options: [
        { value: 'edge', label: 'A random edge each time (Karger)' },
        { value: 'shuffle', label: 'Shuffle once, skip self-loops (Kruskal style)' },
      ],
      help: 'Both give every cut the same chance. Shuffling the edges once and contracting them in order with a union-find is how real code does it: Kruskal’s algorithm on random weights.',
    },
    {
      kind: 'number',
      key: 'trials',
      label: 'Trials per run',
      min: MIN_TRIALS,
      max: MAX_TRIALS,
      help: 'How many independent trials Run trials makes. Each one finds a minimum cut with chance at least 2/(n(n−1)).',
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
    input: { ...graphInput('A-B, B-C, C-A, C-D, D-E, E-F, F-D'), label: 'Graph or edge' },
    buttons: [
      { op: 'load', label: 'Load', usesInput: true, primary: true },
      { op: 'contract', label: 'Random trial', usesInput: false },
      { op: 'trials', label: 'Run trials', usesInput: false },
      { op: 'merge', label: 'Contract edge', usesInput: true },
      { op: 'reset', label: 'Start over', usesInput: false, more: true },
    ],
    random: {
      label: 'Random graph',
      make: (rng) => [loadCall(randomGraph(rng, rng.int(6, 8), { density: 0.25 })), ['contract']],
    },
    presets: [
      preset('Two clusters, one bridge', (rng, n) => clustersGraph(rng, n, 1), ['contract']),
      preset('Two clusters, two bridges', (rng, n) => clustersGraph(rng, n, 2), ['trials']),
      preset('Random graph', (rng, n) => randomGraph(rng, n, { density: 0.25 }), ['contract']),
      preset('Dense random graph', (rng, n) => randomGraph(rng, n, { density: 0.6 }), ['trials']),
      preset('Cycle: every 2-cut is a minimum', (_rng, n) => cycleGraph(n), ['trials']),
      preset('Complete graph', (_rng, n) => completeGraph(n), ['trials']),
      preset('Tree: every cut is one edge', (rng, n) => randomTree(rng, n), ['contract']),
      preset('Grid', (_rng, n) => gridGraph(n), ['trials']),
    ],
    sizes: [6, 8, 10],
  },
  explain,
  complexity: [
    {
      op: 'one trial (contract to two super-vertices)',
      best: {
        cost: 'O(n)',
        why: 'A tree: every contraction joins two pieces and no self-loop ever has to be skipped.',
        example: 'tree-always',
      },
      average: {
        cost: 'O(m α(n))',
        why: 'Shuffle the edges once and contract with a union-find: one pass over the edges.',
        example: 'shuffled',
      },
      worst: {
        cost: 'O(n²)',
        why: 'Done the plain way, each of the n − 2 contractions rewrites an adjacency matrix row.',
        example: 'bridge',
      },
    },
    {
      op: 'chance one trial finds a given minimum cut',
      best: {
        cost: '1',
        why: 'In a tree every cut is one edge, so every trial ends on a minimum cut.',
        example: 'tree-always',
      },
      average: {
        cost: '≥ 2/(n(n−1))',
        why: 'Each contraction misses the cut with chance at most 2/k when k super-vertices are left.',
        example: 'many-trials',
      },
      worst: {
        cost: '2/(n(n−1))',
        why: 'A cycle has n(n−1)/2 minimum cuts, each found with exactly this chance.',
        example: 'cycle-cuts',
      },
    },
    {
      op: 'repeat until the minimum is found with chance 1 − 1/n',
      best: {
        cost: 'O(1) trials',
        why: 'When the minimum cut is one bridge between two dense halves, most trials find it.',
        example: 'bridge',
      },
      average: {
        cost: 'O(n² log n) trials',
        why: '(1 − 2/n²)^(n² ln n / 2) ≤ 1/n: that many trials all miss only rarely.',
        example: 'many-trials',
      },
      worst: {
        cost: 'O(n⁴ log n) time',
        why: 'O(n² log n) trials of O(n²) each. Karger-Stein shares work between trials: O(n² log³ n).',
        example: 'missed',
      },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as KgSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    bridge,
    missed,
    manyTrials,
    cycleCuts,
    byHand,
    shuffled,
    treeAlways,
  ] as unknown as SavedExample[],
  practice: kargerPractice(() => kargerMinCut),
  preview: { example: 'bridge', level: 3, hide: ['grp-', 'info-', 'hist-', 'stat-', 'ord-'] },
  opening: 'bridge',
};

/**
 * Driver protocol for the code tabs. "graph <names>" starts a graph (the code numbers the names
 * 0..n-1 in that order) and "edge u v" adds an edge; neither prints. "karger d1 d2 ..." runs one
 * trial, taking the i-th random index from the list (which of the edges left to contract), and
 * prints "<cut size> | <the side with the first vertex> | <the rest>". The code picks a random
 * edge each time, so the model does too here.
 */
function codeScript(calls: OpCall[], settings: KgSettings) {
  const t = new Timeline(kargerMinCut, { ...settings, pick: 'edge' }, 1, calls);
  const lines = (g: Graph) => [
    `graph ${g.vertices.join(' ')}`,
    ...g.edges.map((e) => `edge ${e.u} ${e.v}`),
  ];
  const input = lines(t.initial.state.graph);
  const expected: string[] = [];
  let before = t.initial.state.graph;
  for (const e of t.entries) {
    const s = e.end;
    if (s.graph !== before) input.push(...lines(s.graph));
    before = s.graph;
    if (e.call[0] !== 'contract' || !s.cut || s.graph.vertices.length < 2) continue;
    input.push(`karger ${s.draws.join(' ')}`.trimEnd());
    const first = s.group[s.graph.vertices[0]!];
    const groups = groupsOf(s);
    const a = groups.find(([rep]) => rep === first)![1];
    const b = s.graph.vertices.filter((v) => !a.includes(v));
    expected.push(`${s.cut.length} | ${a.join(' ')} | ${b.join(' ')}`.trimEnd());
  }
  return { input, expected };
}

export default kargerMinCut;
