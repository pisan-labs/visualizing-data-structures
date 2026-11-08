import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, VizDef } from '../../engine/types';
import { layoutSetting } from '../../layouts/graph';
import type { Graph } from '../_graph/graph';
import { graphInput } from '../_graph/kit';
import { graphPresets, loadCall, randomGraph } from '../_graph/presets';
import cppSource from './code/cpp/bidirectional.hpp?raw';
import javaSource from './code/java/Bidirectional.java?raw';
import pythonSource from './code/python/bidirectional.py?raw';
import bushy from './examples/bushy.json';
import directed from './examples/directed.json';
import grid from './examples/grid.json';
import meetInTheMiddle from './examples/meet-in-the-middle.json';
import noPath from './examples/no-path.json';
import path from './examples/path.json';
import smallerSide from './examples/smaller-side.json';
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
  type BiExtra,
  type BiSettings,
  type BiState,
} from './model';
import { biPractice } from './practice';
import { view } from './view';

export const bidirectionalSearch: VizDef<BiState, BiSettings, BiExtra> = {
  id: 'bidirectional-search',
  title: 'Bidirectional search',
  family: 'Graphs',
  blurb:
    'Run breadth-first search from both ends at once and stop where the two frontiers meet: two small balls instead of one big one.',
  settings: [
    {
      kind: 'choice',
      key: 'side',
      label: 'Which side expands',
      options: [
        { value: 'alternate', label: 'Take turns: s, t, s, ...' },
        { value: 'smaller', label: 'The side with the smaller frontier' },
      ],
      help: 'Both find a shortest path. Expanding the smaller frontier keeps the work down when one end is much busier than the other.',
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
      {
        op: 'run',
        label: 'Search',
        usesInput: true,
        args: ['the start s', 'the target t'],
      },
    ],
    random: {
      label: 'Random graph',
      make: (rng) => {
        const g = randomGraph(rng, rng.int(8, 12), { density: 0.12 });
        return [loadCall(g), ['run', g.vertices[0]!, g.vertices.at(-1)!]];
      },
    },
    presets: graphPresets({ then: (g) => [['run', g.vertices[0]!, g.vertices.at(-1)!]] }),
    sizes: [5, 8, 10, 12],
  },
  explain,
  complexity: [
    {
      op: 'Bidirectional BFS, path of d edges',
      best: {
        cost: 'O(1)',
        why: 's and t are neighbours: the first layer meets.',
        example: 'meet-in-the-middle',
      },
      average: {
        cost: 'O(b^(d/2))',
        why: 'With branching factor b, each side reaches depth about d/2: two balls of b^(d/2) instead of one of b^d.',
        example: 'bushy',
      },
      worst: {
        cost: 'O(V + E)',
        why: 'No path, or a long thin graph: every reachable vertex gets expanded, as in plain BFS.',
        example: 'no-path',
      },
    },
    {
      op: 'Plain BFS from s to t',
      best: { cost: 'O(1)', why: 't is a neighbour of s.' },
      average: {
        cost: 'O(b^d)',
        why: 'Everything within distance d of s, which grows like b^d.',
        example: 'bushy',
      },
      worst: { cost: 'O(V + E)', why: 'Every vertex and edge, as in any BFS.', example: 'path' },
    },
    {
      op: 'Checking for a meeting',
      best: { cost: 'O(1)', why: 'A hash set (or a mark per vertex) per side.' },
      average: {
        cost: 'O(1)',
        why: 'Each newly found vertex is looked up once in the other side’s set.',
        example: 'grid',
      },
      worst: { cost: 'O(1)', why: 'Still one lookup per discovered vertex.', example: 'grid' },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as BiSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    meetInTheMiddle,
    bushy,
    grid,
    path,
    directed,
    smallerSide,
    noPath,
  ] as unknown as SavedExample[],
  practice: biPractice(() => bidirectionalSearch),
  preview: { example: 'bushy', level: 3, hide: ['vn-', 'Fs', 'Ft', 'tbl-', 'ptr-'] },
};

const graphLines = (g: Graph) => [
  `graph ${g.directed ? 'd' : 'u'} ${g.vertices.join(' ')}`,
  ...g.edges.map((e) => `edge ${e.u} ${e.v}`),
];

/**
 * Driver protocol for the code tabs. "graph d|u <names>" starts a graph (the code numbers the
 * names 0..n-1 in that order) and "edge u v" adds an edge (an arc when d); neither prints.
 * "search s t" prints "<edges> | <path> | <vertices expanded>", or "none | <expanded>". The
 * code takes turns, so the model runs with that setting.
 */
function codeScript(calls: OpCall[], settings: BiSettings) {
  const t = new Timeline(bidirectionalSearch, { ...settings, side: 'alternate' }, 1, calls);
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
    input.push(`search ${r.s} ${r.t}`);
    expected.push(runSummary(r));
  }
  return { input, expected };
}

export default bidirectionalSearch;
