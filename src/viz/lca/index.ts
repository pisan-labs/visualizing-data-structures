import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, Preset, SavedExample, Settings, VizDef } from '../../engine/types';
import type { Graph } from '../_graph/graph';
import { graphInput } from '../_graph/kit';
import { loadCall, pathGraph, randomTree, starGraph } from '../_graph/presets';
import cppSource from './code/cpp/lca.hpp?raw';
import javaSource from './code/java/BinaryLifting.java?raw';
import pythonSource from './code/python/lca.py?raw';
import ancestor from './examples/ancestor.json';
import buildTable from './examples/build-table.json';
import longPath from './examples/long-path.json';
import otherRoot from './examples/other-root.json';
import siblings from './examples/siblings.json';
import twoBranches from './examples/two-branches.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  ROOT_CHOICES,
  type LcaExtra,
  type LcaSettings,
  type LcaState,
} from './model';
import { lcaPractice } from './practice';
import { view } from './view';

/** Load a tree, build its table, and query two random vertices. */
const preset = (label: string, make: (rng: Rng, n: number) => Graph): Preset => ({
  label,
  make: (rng, n) => {
    const g = make(rng, n);
    const a = g.vertices[rng.int(0, g.vertices.length - 1)]!;
    const b = g.vertices[rng.int(0, g.vertices.length - 1)]!;
    return [loadCall(g), ['build'], ['query', a, b]];
  },
});

export const lca: VizDef<LcaState, LcaSettings, LcaExtra> = {
  id: 'lca',
  title: 'Lowest common ancestor (binary lifting)',
  family: 'Graphs',
  blurb:
    'Store each vertex’s ancestors 1, 2, 4, 8, ... steps up, and any two vertices find their lowest common ancestor in O(log n) jumps.',
  settings: [
    {
      kind: 'choice',
      key: 'root',
      label: 'Root',
      options: ROOT_CHOICES.map((v) => ({ value: v, label: v })),
      help: 'The same tree rooted somewhere else has different ancestors, so different answers. A tree without this vertex is rooted at its first vertex.',
    },
    {
      kind: 'choice',
      key: 'above',
      label: 'Above the root',
      options: [
        { value: 'nil', label: 'NIL: nothing above the root' },
        { value: 'self', label: 'The root is its own ancestor' },
      ],
      help: 'Many programs let up[k][root] = root, so a jump past the root stays at the root. The answers are the same.',
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
    input: graphInput('A'),
    buttons: [
      { op: 'load', label: 'Load', usesInput: true, primary: true },
      { op: 'build', label: 'Build table', usesInput: false },
      { op: 'query', label: 'Query', usesInput: true, args: ['a vertex u', 'a vertex v'] },
    ],
    random: {
      label: 'Random tree',
      make: (rng) => preset('', randomTree).make(rng, rng.int(8, 12)),
    },
    presets: [
      preset('Random tree', randomTree),
      preset('Path (deepest tree)', (_rng, n) => pathGraph(n)),
      preset('Star (shallowest tree)', (_rng, n) => starGraph(n)),
    ],
    sizes: [5, 8, 10, 12],
  },
  explain,
  complexity: [
    {
      op: 'Building the table',
      best: {
        cost: 'Θ(n log n)',
        why: 'n columns and ⌈log₂ n⌉ rows, one O(1) lookup per cell.',
        example: 'build-table',
      },
      average: { cost: 'Θ(n log n)', why: 'Every cell is filled, whatever the tree looks like.' },
      worst: {
        cost: 'Θ(n log n)',
        why: 'Time and memory both; a path needs every row.',
        example: 'long-path',
      },
    },
    {
      op: 'One query LCA(u, v)',
      best: {
        cost: 'O(1)',
        why: 'v is u’s parent: one jump lifts u onto v.',
        example: 'ancestor',
      },
      average: {
        cost: 'O(log n)',
        why: 'At most one jump per bit of the depth difference, then one try per row.',
        example: 'two-branches',
      },
      worst: {
        cost: 'O(log n)',
        why: 'Even on a path of n vertices, ⌈log₂ n⌉ rows bound the jumps.',
        example: 'long-path',
      },
    },
    {
      op: 'Naive LCA: walk up one step at a time',
      best: { cost: 'O(1)', why: 'The two vertices are siblings.', example: 'siblings' },
      average: { cost: 'O(height)', why: 'Lift the deeper one, then step both up together.' },
      worst: { cost: 'O(n)', why: 'On a path the height is n − 1.', example: 'long-path' },
      note: 'Binary lifting trades Θ(n log n) memory for O(log n) queries.',
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as LcaSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    buildTable,
    twoBranches,
    ancestor,
    siblings,
    longPath,
    otherRoot,
  ] as unknown as SavedExample[],
  practice: lcaPractice(() => lca),
  preview: { example: 'build-table', level: 3, hide: ['vn-', 'ptr-'] },
};

const graphLines = (g: Graph) => [
  `graph ${g.vertices.join(' ')}`,
  ...g.edges.map((e) => `edge ${e.u} ${e.v}`),
];

/**
 * Driver protocol for the code tabs. "graph <names>" starts a tree (the code numbers the names
 * 0..n-1 in that order), "edge u v" joins two vertices and "build r" builds the table rooted at
 * r; none prints. "lca u v" prints the answer. Each answered query is sent as build, then lca.
 */
function codeScript(calls: OpCall[], settings: LcaSettings) {
  const t = new Timeline(lca, settings, 1, calls);
  const input = graphLines(t.initial.state.graph);
  const expected: string[] = [];
  let before = t.initial.state.graph;
  for (const e of t.entries) {
    const g = e.end.graph;
    if (g !== before) input.push(...graphLines(g));
    before = g;
    if (e.call[0] !== 'query') continue;
    const q = e.steps.at(-1)!.extra?.query;
    if (!q?.answer) continue;
    input.push(`build ${q.root}`, `lca ${q.u0} ${q.v0}`);
    expected.push(q.answer);
  }
  return { input, expected };
}

export default lca;
