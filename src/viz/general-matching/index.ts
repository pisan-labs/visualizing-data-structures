import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, Preset, SavedExample, Settings, VizDef } from '../../engine/types';
import { layoutSetting } from '../../layouts/graph';
import { makeGraph, type Graph } from '../_graph/graph';
import { graphInput } from '../_graph/kit';
import { completeGraph, cycleGraph, loadCall, randomGraph, randomTree } from '../_graph/presets';
import cppSource from './code/cpp/blossom.hpp?raw';
import javaSource from './code/java/Blossom.java?raw';
import pythonSource from './code/python/blossom.py?raw';
import bipartite from './examples/bipartite.json';
import oddCycle from './examples/odd-cycle.json';
import throughBlossom from './examples/through-a-blossom.json';
import twoBlossoms from './examples/two-blossoms.json';
import star from './examples/star.json';
import explain from './explain.md?raw';
import {
  BLOSSOM_TEXT,
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  matchedPairs,
  ops,
  pseudocode,
  type BlExtra,
  type BlSettings,
  type BlState,
} from './model';
import { blossomPractice } from './practice';
import { view } from './view';

const L = (i: number) => String.fromCharCode(65 + i);

/** Odd cycles hanging off a path: a triangle at every other vertex, so blossoms appear. */
export function triangles(n: number): Graph {
  const m = Math.max(3, Math.min(n, 16));
  const edges: Graph['edges'] = [];
  for (let i = 0; i + 1 < m; i++) edges.push({ u: L(i), v: L(i + 1), w: 1 });
  for (let i = 0; i + 2 < m; i += 2) edges.push({ u: L(i), v: L(i + 2), w: 1 });
  return makeGraph({ directed: false, weighted: false, edges });
}

/** Two odd cycles joined by one edge: a perfect matching must use the bridge. */
export function twoOddCycles(n: number): Graph {
  const a = Math.max(3, Math.floor(n / 2) | 1);
  const b = Math.max(3, Math.min(16 - a, n - a) | 1);
  const edges: Graph['edges'] = [];
  for (let i = 0; i < a; i++) edges.push({ u: L(i), v: L((i + 1) % a), w: 1 });
  for (let i = 0; i < b; i++) edges.push({ u: L(a + i), v: L(a + ((i + 1) % b)), w: 1 });
  edges.push({ u: L(a - 1), v: L(a), w: 1 });
  return makeGraph({ directed: false, weighted: false, edges });
}

const preset = (label: string, make: (rng: Rng, n: number) => Graph): Preset => ({
  label,
  make: (rng, n) => [loadCall(make(rng, n)), ['run']],
});

export const generalMatching: VizDef<BlState, BlSettings, BlExtra> = {
  id: 'general-matching',
  title: 'General matching (blossom)',
  family: 'Flow and matching',
  blurb:
    "Edmonds' blossom algorithm: a maximum matching in any undirected graph, by shrinking odd cycles into single vertices and expanding them again on the way out.",
  settings: [layoutSetting()],
  defaults,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  view,
  describe,
  controls: {
    input: graphInput(BLOSSOM_TEXT),
    buttons: [
      { op: 'load', label: 'Load', usesInput: true, primary: true },
      { op: 'run', label: 'Find a maximum matching', usesInput: false },
    ],
    random: {
      label: 'Random graph',
      make: (rng) => [loadCall(randomGraph(rng, rng.int(6, 9), { density: 0.2 }))],
    },
    presets: [
      preset('Random graph', (rng, n) => randomGraph(rng, n, { density: 0.2 })),
      preset('Triangles along a path', (_rng, n) => triangles(n)),
      preset('Two odd cycles', (_rng, n) => twoOddCycles(n)),
      preset('Odd cycle', (_rng, n) => cycleGraph(n % 2 ? n : n + 1)),
      preset('Complete graph', (_rng, n) => completeGraph(Math.min(n, 7))),
      preset('Random tree', (rng, n) => randomTree(rng, n)),
    ],
    sizes: [5, 6, 8, 10],
  },
  explain,
  complexity: [
    {
      op: "Edmonds' algorithm, as drawn",
      best: {
        cost: 'Θ(V + E)',
        why: 'A star: the first phase matches the centre and the second finds nothing. Two searches.',
        example: 'star',
      },
      average: {
        cost: 'O(V · E)',
        why: 'At most V/2 phases, and a phase without blossoms is one search of the graph.',
        example: 'bipartite',
      },
      worst: {
        cost: 'O(V³)',
        why: 'A phase can contract up to V/2 blossoms, each relabeling O(V) vertices: O(V²) per phase.',
        example: 'two-blossoms',
      },
      note: 'Micali and Vazirani bring this down to O(E √V), the same as Hopcroft-Karp for bipartite graphs.',
    },
    {
      op: 'Contracting one blossom',
      best: {
        cost: 'O(1)',
        why: 'A triangle: the base and two vertices.',
        example: 'through-a-blossom',
      },
      average: {
        cost: 'O(V)',
        why: 'Find the base (the lowest common ancestor) and relabel the cycle.',
      },
      worst: {
        cost: 'O(V)',
        why: 'This version scans every vertex to update the bases.',
        example: 'two-blossoms',
      },
    },
    {
      op: 'Extra memory',
      best: { cost: 'Θ(V)', why: 'mate, base, parent, labels and a queue.' },
      average: { cost: 'Θ(V)', why: 'Blossoms are never built as new graphs: base[] stands in.' },
      worst: {
        cost: 'Θ(V)',
        why: 'Nested blossoms share one base array too.',
        example: 'odd-cycle',
      },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as BlSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [twoBlossoms, throughBlossom, oddCycle, bipartite, star] as unknown as SavedExample[],
  practice: blossomPractice(() => generalMatching),
  preview: { example: 'two-blossoms', level: 2, hide: ['vn-', 'q-', 'tbl-'] },
};

const graphLines = (g: Graph) => [
  `graph ${g.vertices.join(' ')}`,
  ...g.edges.map((e) => `edge ${e.u} ${e.v}`),
];

/**
 * Driver protocol for the code tabs: "graph <names>" starts a graph (numbered 0..n-1 in that
 * order), "edge u v" adds an edge, and "match" prints "<size> | <pairs>", each pair as u-v with
 * u first in name order, the pairs in order of u.
 */
function codeScript(calls: OpCall[], settings: BlSettings) {
  const t = new Timeline(generalMatching, settings, 1, calls);
  const input = graphLines(t.initial.state.graph);
  const expected: string[] = [];
  let before = t.initial.state.graph;
  for (const e of t.entries) {
    const g = e.end.graph;
    if (g !== before) input.push(...graphLines(g));
    before = g;
    const r = e.steps.at(-1)!.extra?.run;
    if (e.call[0] === 'run' && r) {
      input.push('match');
      const pairs = matchedPairs(g, r.mate).map(([a, b]) => `${a}-${b}`);
      expected.push(`${pairs.length} |${pairs.length ? ` ${pairs.join(' ')}` : ''}`);
    }
  }
  return { input, expected };
}

export default generalMatching;
