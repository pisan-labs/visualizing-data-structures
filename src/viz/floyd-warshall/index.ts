import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, VizDef } from '../../engine/types';
import { layoutSetting } from '../../layouts/graph';
import type { Graph } from '../_graph/graph';
import { graphInput } from '../_graph/kit';
import { loadCall } from '../_graph/presets';
import {
  pathsPreset,
  randomWeighted,
  twoPieces,
  withNegativeCycle,
  withNegativeEdges,
} from '../_paths/presets';
import cppSource from './code/cpp/floyd_warshall.hpp?raw';
import javaSource from './code/java/FloydWarshall.java?raw';
import pythonSource from './code/python/floyd_warshall.py?raw';
import everyRound from './examples/every-round.json';
import negativeCycle from './examples/negative-cycle.json';
import negativeEdges from './examples/negative-edges.json';
import nextHop from './examples/next-hop.json';
import readAPath from './examples/read-a-path.json';
import undirected from './examples/undirected.json';
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
  type FwExtra,
  type FwSettings,
  type FwState,
} from './model';
import { floydPractice } from './practice';
import { view } from './view';

const allPairs = { allPairs: true };

export const floydWarshall: VizDef<FwState, FwSettings, FwExtra> = {
  id: 'floyd-warshall',
  title: 'Floyd-Warshall',
  family: 'Graphs',
  blurb:
    'Shortest paths between every pair of vertices: one round per vertex, each letting paths pass through it, in Θ(V³).',
  settings: [
    {
      kind: 'choice',
      key: 'paths',
      label: 'Keep paths with',
      options: [
        { value: 'pred', label: 'Π: the vertex before j (CLRS)' },
        { value: 'next', label: 'next: the first step from i' },
      ],
      help: 'Both record the same paths. Π reads a path backwards from its end; next reads it forwards from its start.',
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
      { op: 'run', label: 'Run Floyd-Warshall', usesInput: false },
      { op: 'path', label: 'Path', usesInput: true, args: ['a start vertex', 'an end vertex'] },
    ],
    random: {
      label: 'Random graph',
      make: (rng) => [
        loadCall(randomWeighted(rng, rng.int(4, 6), { directed: true, density: 0.25 })),
      ],
    },
    presets: [
      pathsPreset(
        'Random directed graph',
        (rng, n) => randomWeighted(rng, n, { directed: true, density: 0.25 }),
        allPairs,
      ),
      pathsPreset('Random graph', (rng, n) => randomWeighted(rng, n, { density: 0.3 }), allPairs),
      pathsPreset('Negative edges, no cycle', withNegativeEdges, allPairs),
      pathsPreset('A negative cycle', withNegativeCycle, allPairs),
      pathsPreset('Two pieces (some pairs at ∞)', twoPieces, allPairs),
    ],
    sizes: [4, 5, 6, 8],
  },
  explain,
  complexity: [
    {
      op: 'FLOYD-WARSHALL(W, n)',
      best: {
        cost: 'Θ(V³)',
        why: 'Three nested loops of V each, whatever the edges: no early exit.',
        example: 'unreachable',
      },
      average: {
        cost: 'Θ(V³)',
        why: 'Every round looks at all V² pairs, improving or not.',
        example: 'every-round',
      },
      worst: {
        cost: 'Θ(V³)',
        why: 'The same V³ checks; each is O(1).',
        example: 'negative-cycle',
      },
      note: 'Running Dijkstra from every vertex takes O(V (V + E) log V): better on sparse graphs, but it cannot take negative weights.',
    },
    {
      op: 'Reading one path from Π',
      best: {
        cost: 'O(1)',
        why: 'The shortest path is a single edge: Π[i][j] = i.',
      },
      average: {
        cost: 'O(V)',
        why: 'One step back per vertex on the path.',
        example: 'read-a-path',
      },
      worst: {
        cost: 'Θ(V)',
        why: 'The path passes through every vertex.',
        example: 'next-hop',
      },
    },
    {
      op: 'Extra space',
      best: { cost: 'Θ(V²)', why: 'D and Π hold V² entries each.', example: 'every-round' },
      average: {
        cost: 'Θ(V²)',
        why: 'Updating D in place needs no copy per round (CLRS writes a new D each time).',
      },
      worst: {
        cost: 'Θ(V²)',
        why: 'Even a graph with no edges gets its V² matrix.',
        example: 'unreachable',
      },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as FwSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    everyRound,
    readAPath,
    negativeCycle,
    unreachable,
    negativeEdges,
    undirected,
    nextHop,
  ] as unknown as SavedExample[],
  practice: floydPractice(() => floydWarshall),
};

const graphLines = (g: Graph) => [
  `graph ${g.directed ? 'directed' : 'undirected'} ${g.vertices.join(' ')}`,
  ...g.edges.map((e) => `edge ${e.u} ${e.v} ${e.w}`),
];

/**
 * Driver protocol for the code tabs. "graph <directed|undirected> <names>" starts a graph (the
 * code numbers the names 0..n-1 in that order) and "edge u v w" adds an edge; neither prints.
 * "floyd" prints D's rows, then Π's, each row's entries split by spaces and rows by "; ", with
 * inf and - for ∞ and NIL, then " | negative cycle <vertices>" for the vertices whose D[v][v]
 * ends below 0. "path i j" prints the path's vertices, "no path", or "negative cycle". The code
 * keeps Π, so the model does too here.
 */
function codeScript(calls: OpCall[], settings: FwSettings) {
  const t = new Timeline(floydWarshall, { ...settings, paths: 'pred' }, 1, calls);
  const input = graphLines(t.initial.state.graph);
  const expected: string[] = [];
  let before = t.initial.state.graph;
  for (const e of t.entries) {
    const g = e.end.graph;
    if (g !== before) input.push(...graphLines(g));
    before = g;
    const last = e.steps.at(-1)!.extra;
    if (e.call[0] === 'run' && last?.run) {
      input.push('floyd');
      expected.push(runSummary(g, last.run));
    } else if (e.call[0] === 'path' && last?.path) {
      const p = last.path;
      input.push(`path ${p.from} ${p.to}`);
      expected.push(
        p.result === 'cycle'
          ? 'negative cycle'
          : p.result === 'none'
            ? 'no path'
            : p.path.join(' '),
      );
    }
  }
  return { input, expected };
}

export default floydWarshall;
