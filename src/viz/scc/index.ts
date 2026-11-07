import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, Preset, SavedExample, Settings, VizDef } from '../../engine/types';
import { layoutSetting } from '../../layouts/graph';
import type { Graph } from '../_graph/graph';
import { graphInput } from '../_graph/kit';
import { loadCall, randomDag, randomGraph, twoComponents } from '../_graph/presets';
import cppSource from './code/cpp/scc.hpp?raw';
import javaSource from './code/java/Scc.java?raw';
import pythonSource from './code/python/scc.py?raw';
import dag from './examples/dag.json';
import fourTarjan from './examples/four-components-tarjan.json';
import four from './examples/four-components.json';
import lowLinks from './examples/low-links.json';
import oneCycle from './examples/one-cycle.json';
import undirected from './examples/undirected.json';
import whyTranspose from './examples/why-transpose.json';
import explain from './explain.md?raw';
import { bigCycle, clusters, reversedCycle } from './graphs';
import {
  SCC_TEXT,
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  runSummary,
  type SccExtra,
  type SccSettings,
  type SccState,
} from './model';
import { sccPractice } from './practice';
import { view } from './view';

const preset = (label: string, make: (rng: Rng, n: number) => Graph): Preset => ({
  label,
  make: (rng, n) => [loadCall(make(rng, n)), ['run']],
});

export const scc: VizDef<SccState, SccSettings, SccExtra> = {
  id: 'scc',
  title: 'Strongly connected components',
  family: 'Graphs',
  blurb:
    "Split a directed graph into groups that can all reach each other: Kosaraju's two searches, or Tarjan's one search with low-links, and the DAG of components that is left.",
  settings: [
    {
      kind: 'choice',
      key: 'algorithm',
      label: 'Algorithm',
      options: [
        { value: 'kosaraju', label: 'Kosaraju: DFS, transpose, DFS by finish time (CLRS)' },
        { value: 'tarjan', label: 'Tarjan: one DFS with low-links and a stack' },
      ],
      help: 'Both take Θ(V + E) and find the same components. Kosaraju finds them in topological order of the component graph, Tarjan in reverse.',
    },
    {
      kind: 'boolean',
      key: 'condense',
      label: 'Show the component graph',
      help: 'One vertex per component and an arc where the graph joins two of them. It is always a DAG.',
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
    input: graphInput(SCC_TEXT),
    buttons: [
      { op: 'load', label: 'Load', usesInput: true, primary: true },
      { op: 'run', label: 'Find SCCs', usesInput: false },
    ],
    random: {
      label: 'Random graph with cycles',
      make: (rng) => [loadCall(clusters(rng, rng.int(6, 9)))],
    },
    presets: [
      preset('Groups joined one way', (rng, n) => clusters(rng, n)),
      preset('Random directed graph', (rng, n) =>
        randomGraph(rng, n, { density: 0.15, directed: true }),
      ),
      preset('One big cycle', (_rng, n) => bigCycle(n)),
      preset('One big cycle, reversed', (_rng, n) => reversedCycle(n)),
      preset('DAG (every vertex alone)', (rng, n) => randomDag(rng, n)),
      preset('Undirected, two pieces', (rng, n) => twoComponents(rng, n)),
    ],
    sizes: [5, 8, 10, 12],
  },
  explain,
  complexity: [
    {
      op: "Kosaraju's algorithm",
      best: {
        cost: 'Θ(V + E)',
        why: 'Two searches and a transpose, even when every vertex is alone.',
        example: 'dag',
      },
      average: {
        cost: 'Θ(V + E)',
        why: 'Each search visits every vertex once and every arc once.',
        example: 'four-components',
      },
      worst: {
        cost: 'Θ(V + E)',
        why: 'Building G^T is one more pass over the arcs; nothing is repeated.',
        example: 'one-cycle',
      },
    },
    {
      op: "Tarjan's algorithm",
      best: {
        cost: 'Θ(V + E)',
        why: 'One search: each vertex is pushed and popped once.',
        example: 'four-components-tarjan',
      },
      average: {
        cost: 'Θ(V + E)',
        why: 'Each arc updates a low-link at most once, in O(1).',
        example: 'low-links',
      },
      worst: {
        cost: 'Θ(V + E)',
        why: 'Still one search, however the components nest.',
        example: 'low-links',
      },
    },
    {
      op: 'Extra memory',
      best: {
        cost: 'Θ(V)',
        why: 'Tarjan keeps d, low and a stack: no second copy of the graph.',
        example: 'four-components-tarjan',
      },
      average: { cost: 'Θ(V + E)', why: 'Kosaraju builds G^T, a second copy of every arc.' },
      worst: {
        cost: 'Θ(V + E)',
        why: 'G^T has as many arcs as G.',
        example: 'why-transpose',
      },
      note: 'Both recurse as deep as the longest DFS path, up to V calls.',
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as SccSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    four,
    fourTarjan,
    whyTranspose,
    lowLinks,
    oneCycle,
    dag,
    undirected,
  ] as unknown as SavedExample[],
  practice: sccPractice(() => scc),
  preview: { example: 'four-components', level: 2, hide: ['vn-', 'cs-', 'F-', 'tbl-'] },
};

const graphLines = (g: Graph) => [
  `graph ${g.directed ? 'directed' : 'undirected'} ${g.vertices.join(' ')}`,
  ...g.edges.map((e) => `edge ${e.u} ${e.v}`),
];

/**
 * Driver protocol for the code tabs. "graph <directed|undirected> <names>" starts a graph (the
 * code numbers the names 0..n-1 in that order) and "edge u v" adds an edge; neither prints.
 * "scc" prints the components in the order found, each in name order, with " | " between them.
 * The code is Kosaraju's (the default), so the model runs it here whatever the example's
 * setting.
 */
function codeScript(calls: OpCall[], settings: SccSettings) {
  const same: SccSettings = { ...settings, algorithm: 'kosaraju' };
  const t = new Timeline(scc, same, 1, calls);
  const input = graphLines(t.initial.state.graph);
  const expected: string[] = [];
  let before = t.initial.state.graph;
  for (const e of t.entries) {
    const g = e.end.graph;
    if (g !== before) input.push(...graphLines(g));
    before = g;
    const r = e.steps.at(-1)!.extra?.run;
    if (e.call[0] === 'run' && r) {
      input.push('scc');
      expected.push(runSummary(r));
    }
  }
  return { input, expected };
}

export default scc;
