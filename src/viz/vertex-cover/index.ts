import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, VizDef } from '../../engine/types';
import { layoutSetting } from '../../layouts/graph';
import type { Graph } from '../_graph/graph';
import { graphInput } from '../_graph/kit';
import { loadCall, randomGraph } from '../_graph/presets';
import cppSource from './code/cpp/vertex_cover.hpp?raw';
import javaSource from './code/java/VertexCover.java?raw';
import pythonSource from './code/python/vertex_cover.py?raw';
import branching from './examples/branching.json';
import bruteForce from './examples/brute-force.json';
import complete from './examples/complete.json';
import disjointEdgesExample from './examples/disjoint-edges.json';
import greedyTrapExample from './examples/greedy-trap.json';
import greedyWins from './examples/greedy-wins.json';
import matchingDoubles from './examples/matching-doubles.json';
import noEdges from './examples/no-edges.json';
import star from './examples/star.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  type VcExtra,
  type VcSettings,
  type VcState,
} from './model';
import { vcPractice } from './practice';
import { vcPresets } from './presets';
import { view } from './view';

export const vertexCover: VizDef<VcState, VcSettings, VcExtra> = {
  id: 'vertex-cover',
  title: 'Minimum vertex cover',
  family: 'Hard problems',
  blurb:
    'Pick the fewest vertices that touch every edge. Finding the smallest is NP-hard, but taking both ends of a matching is never more than twice too many.',
  settings: [
    {
      kind: 'choice',
      key: 'method',
      label: 'Method',
      options: [
        { value: 'matching', label: 'Both ends of a matching (CLRS, at most 2 × best)' },
        { value: 'greedy', label: 'Greedy: the vertex with most uncovered edges' },
        { value: 'branch', label: 'Exact: branch on an uncovered edge' },
        { value: 'brute', label: 'Exact: try every set, smallest first' },
      ],
      help: 'Every run ends by comparing its cover with a minimum cover, which the page finds by brute force.',
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
    input: graphInput('A-B, A-C, B-D, C-D, D-E'),
    buttons: [
      { op: 'load', label: 'Load', usesInput: true, primary: true },
      { op: 'run', label: 'Find a cover', usesInput: false },
    ],
    random: {
      label: 'Random graph',
      make: (rng) => [loadCall(randomGraph(rng, rng.int(6, 9), { density: 0.25 })), ['run']],
    },
    presets: vcPresets(),
    sizes: [5, 8, 10],
  },
  explain,
  complexity: [
    {
      op: 'APPROX-VERTEX-COVER (both ends of a matching)',
      best: {
        cost: 'O(V + E)',
        why: 'One pass over the edges; each edge is taken or crossed off once.',
        example: 'star',
      },
      average: {
        cost: 'O(V + E)',
        why: 'The same single pass, whatever the graph.',
        example: 'matching-doubles',
      },
      worst: {
        cost: 'O(V + E)',
        why: 'Fast, and never more than twice the optimum: here exactly twice.',
        example: 'disjoint-edges',
      },
    },
    {
      op: 'Greedy by degree',
      best: {
        cost: 'O(V + E)',
        why: 'With a bucket per degree, each pick and each crossed-off edge costs O(1).',
        example: 'star',
      },
      average: {
        cost: 'O(E log V)',
        why: 'With a heap keyed by degree: every crossed-off edge lowers a key.',
        example: 'greedy-wins',
      },
      worst: {
        cost: 'O(V · E)',
        why: 'Recounting every degree each round, as the steps here do. The cover can be about ln n times the optimum.',
        example: 'greedy-trap',
      },
    },
    {
      op: 'Branching on an uncovered edge',
      best: {
        cost: 'O(E)',
        why: 'No edges, or a graph where the first branch already finds a smallest cover and the rest stop at once.',
        example: 'no-edges',
      },
      average: {
        cost: 'O(2ᵏ E)',
        why: 'k = the size of a smallest cover: each level adds one vertex, and there are two choices per level.',
        example: 'branching',
      },
      worst: {
        cost: 'O(2ᵏ E)',
        why: 'Exponential in k but not in V: fine when the cover is small, even in a big graph.',
        example: 'branching',
      },
    },
    {
      op: 'Brute force, smallest set first',
      best: {
        cost: 'O(E)',
        why: 'No edges: the empty set is a cover.',
        example: 'no-edges',
      },
      average: {
        cost: 'O(Vᵏ E)',
        why: 'It tries every set of fewer than k vertices first, about Vᵏ of them.',
        example: 'brute-force',
      },
      worst: {
        cost: 'O(2ⱽ E)',
        why: 'A complete graph needs V − 1 vertices, so nearly every set is tried.',
        example: 'complete',
      },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as VcSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    matchingDoubles,
    greedyWins,
    greedyTrapExample,
    disjointEdgesExample,
    star,
    branching,
    bruteForce,
    complete,
    noEdges,
  ] as unknown as SavedExample[],
  practice: vcPractice(() => vertexCover),
};

const graphLines = (g: Graph) => [
  `graph ${g.vertices.join(' ')}`,
  ...g.edges.map((e) => `edge ${e.u} ${e.v} ${e.w}`),
];

/**
 * Driver protocol for the code tabs. "graph <names>" starts an undirected graph (the code
 * numbers the names 0..n-1 in that order) and "edge u v w" adds an edge (the weight is
 * ignored); neither prints. "cover" prints "<the matching cover, in the order it grew> | <the
 * size of a minimum cover>", with - for an empty cover. The code follows the default method,
 * whatever the settings. Runs on a directed graph, which the page refuses, are left out.
 */
function codeScript(calls: OpCall[], settings: VcSettings) {
  const t = new Timeline(vertexCover, { ...settings, method: 'matching' }, 1, calls);
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
    input.push('cover');
    expected.push(`${r.C.join(' ') || '-'} | ${r.opt}`);
  }
  return { input, expected };
}

export default vertexCover;
