import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, Preset, SavedExample, Settings, VizDef } from '../../engine/types';
import { layoutSetting } from '../../layouts/graph';
import { letters, makeGraph, type Graph } from '../_graph/graph';
import { graphInput } from '../_graph/kit';
import { loadCall, randomGraph, starGraph } from '../_graph/presets';
import cppSource from './code/cpp/pagerank.hpp?raw';
import javaSource from './code/java/PageRank.java?raw';
import pythonSource from './code/python/pagerank.py?raw';
import danglingDrop from './examples/dangling-drop.json';
import fewPages from './examples/few-pages.json';
import hub from './examples/hub.json';
import noJump from './examples/no-jump.json';
import ring from './examples/ring.json';
import trap from './examples/trap.json';
import explain from './explain.md?raw';
import {
  DAMPINGS,
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  runSummary,
  type PrExtra,
  type PrSettings,
  type PrState,
} from './model';
import { pagerankPractice } from './practice';
import { view } from './view';

const preset = (label: string, make: (rng: Rng, n: number) => Graph): Preset => ({
  label,
  make: (rng, n) => [loadCall(make(rng, n)), ['run'] as OpCall],
});

export const pagerank: VizDef<PrState, PrSettings, PrExtra> = {
  id: 'pagerank',
  title: 'PageRank',
  family: 'Graphs',
  blurb:
    'A random surfer follows links and now and then jumps anywhere. Pass rank along the links until it settles: pages linked from important pages are important.',
  settings: [
    {
      kind: 'choice',
      key: 'damping',
      label: 'Damping d',
      options: DAMPINGS.map((d) => ({
        value: d,
        label: d === '0.85' ? '0.85 (Brin and Page)' : d,
      })),
      help: 'The chance the surfer follows a link instead of jumping anywhere. Larger d trusts the links more and takes more iterations.',
    },
    {
      kind: 'choice',
      key: 'dangling',
      label: 'A page with no links out',
      options: [
        { value: 'spread', label: 'Spreads its rank over every page' },
        { value: 'drop', label: 'Loses its rank (it leaks away)' },
      ],
      help: 'A dangling page has nowhere to send its rank. The usual fix treats it as linking to every page.',
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
    input: graphInput('A>B, B>C, C>A, C>D'),
    buttons: [
      { op: 'load', label: 'Load', usesInput: true, primary: true },
      { op: 'run', label: 'Run PageRank', usesInput: false },
    ],
    random: {
      label: 'Random web',
      make: (rng) => [
        loadCall(randomGraph(rng, rng.int(5, 8), { directed: true, density: 0.2 })),
        ['run'],
      ],
    },
    presets: [
      preset('Random web (directed)', (rng, n) =>
        randomGraph(rng, n, { directed: true, density: 0.2 }),
      ),
      preset('Dense web', (rng, n) => randomGraph(rng, n, { directed: true, density: 0.45 })),
      preset('Ring (every rank equal)', (_rng, n) => {
        const names = letters(Math.max(3, Math.min(12, n)));
        const edges = names.map((u, i) => ({ u, v: names[(i + 1) % names.length]!, w: 1 }));
        return makeGraph({ directed: true, weighted: false, vertices: names, edges });
      }),
      preset('Star (undirected)', (_rng, n) => starGraph(n)),
      preset('Random undirected graph', (rng, n) => randomGraph(rng, n, { density: 0.25 })),
    ],
    sizes: [5, 8, 10, 12],
  },
  explain,
  complexity: [
    {
      op: 'One iteration',
      best: {
        cost: 'Θ(V + E)',
        why: 'Every vertex sums the shares of its in-links once.',
        example: 'few-pages',
      },
      average: {
        cost: 'Θ(V + E)',
        why: 'Each link carries one share per iteration.',
        example: 'hub',
      },
      worst: { cost: 'Θ(V + E)', why: 'The same, whatever the graph.', example: 'hub' },
    },
    {
      op: 'Power iteration to tolerance ε',
      best: {
        cost: 'O((V + E) · log(1/ε) / log(1/d))',
        why: 'The error shrinks by a factor d (or better) each iteration.',
        example: 'ring',
      },
      average: {
        cost: 'about 20 to 50 iterations',
        why: 'With d = 0.85 and ε = 0.001, a handful of dozen iterations, even for the whole web.',
        example: 'few-pages',
      },
      worst: {
        cost: 'no convergence at d = 1',
        why: 'With no random jump, rank can slosh around a cycle forever.',
        example: 'no-jump',
      },
    },
    {
      op: 'Exact answer by solving the linear system',
      best: { cost: 'O(V³)', why: 'Gaussian elimination on V equations.' },
      average: { cost: 'O(V³)', why: 'Fine for this page; hopeless for billions of pages.' },
      worst: { cost: 'O(V³)', why: 'That is why everyone iterates.', example: 'trap' },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as PrSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [fewPages, hub, ring, trap, danglingDrop, noJump] as unknown as SavedExample[],
  practice: pagerankPractice(() => pagerank),
  preview: { example: 'few-pages', level: 2, hide: ['vn-', 'ptr-', 'bars-label'] },
};

const graphLines = (g: Graph) => [
  `graph ${g.directed ? 'd' : 'u'} ${g.vertices.join(' ')}`,
  ...g.edges.map((e) => `edge ${e.u} ${e.v}`),
];

/**
 * Driver protocol for the code tabs. "graph d|u <names>" starts a graph (the code numbers the
 * names 0..n-1 in that order) and "edge u v" adds a link (both ways when u); neither prints.
 * "pagerank d spread|drop" prints "<iterations> | <rank per vertex, three decimals>".
 */
function codeScript(calls: OpCall[], settings: PrSettings) {
  const t = new Timeline(pagerank, settings, 1, calls);
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
    input.push(`pagerank ${settings.damping} ${settings.dangling}`);
    expected.push(runSummary(g, r));
  }
  return { input, expected };
}

export default pagerank;
