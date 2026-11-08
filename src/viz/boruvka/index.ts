import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, VizDef } from '../../engine/types';
import { layoutSetting } from '../../layouts/graph';
import type { Graph } from '../_graph/graph';
import { graphInput } from '../_graph/kit';
import { mstPresets, randomMst } from '../_graph/mst';
import { loadCall } from '../_graph/presets';
import cppSource from './code/cpp/boruvka.hpp?raw';
import javaSource from './code/java/Boruvka.java?raw';
import pythonSource from './code/python/boruvka.py?raw';
import allAtOnce from './examples/all-at-once.json';
import forest from './examples/forest.json';
import halving from './examples/halving.json';
import path from './examples/path.json';
import sameEdge from './examples/same-edge.json';
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
  type BoruvkaExtra,
  type BoruvkaSettings,
  type BoruvkaState,
} from './model';
import { boruvkaPractice } from './practice';
import { view } from './view';

export const boruvka: VizDef<BoruvkaState, BoruvkaSettings, BoruvkaExtra> = {
  id: 'boruvka',
  title: 'Borůvka MST',
  family: 'Graphs',
  blurb:
    'Every component grabs its cheapest edge out, all at once, and the pieces merge. A minimum spanning tree in at most log V rounds.',
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
    input: graphInput('A-B:4, A-C:1, B-C:2, B-D:5, C-D:8'),
    buttons: [
      { op: 'load', label: 'Load', usesInput: true, primary: true },
      { op: 'run', label: 'Run Borůvka', usesInput: false },
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
      op: 'Borůvka, scanning the edge list each round',
      best: {
        cost: 'O(E)',
        why: 'One round: every vertex’s cheapest edge already forms the tree.',
        example: 'all-at-once',
      },
      average: {
        cost: 'O(E log V)',
        why: 'Each round costs O(E) and at least halves the number of components.',
        example: 'halving',
      },
      worst: {
        cost: 'O(E log V)',
        why: 'At most log₂ V rounds, because every component merges with at least one other.',
        example: 'path',
      },
    },
    {
      op: 'One round',
      best: { cost: 'O(V + E)', why: 'Scan every edge, then relabel the components.' },
      average: {
        cost: 'O(V + E)',
        why: 'Each edge is compared against two components’ picks.',
        example: 'ties',
      },
      worst: { cost: 'O(V + E)', why: 'The same work whatever the weights.', example: 'halving' },
    },
    {
      op: 'Number of rounds',
      best: {
        cost: '1',
        why: 'The cheapest edges out of each vertex already connect everything.',
        example: 'all-at-once',
      },
      average: {
        cost: 'about log₂ V',
        why: 'Components often merge in threes and fours, faster than halving.',
      },
      worst: {
        cost: '⌊log₂ V⌋',
        why: 'Components pair off exactly, so each round only halves them.',
        example: 'path',
      },
      note: 'Prim and Kruskal are O(E log V) too. Borůvka’s rounds are easy to run in parallel.',
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as BoruvkaSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [halving, allAtOnce, sameEdge, ties, path, forest] as unknown as SavedExample[],
  practice: boruvkaPractice(() => boruvka),
  preview: { example: 'halving', level: 2, hide: ['pk-', 'T-', 'tbl-'] },
};

const graphLines = (g: Graph) => [
  `graph ${g.vertices.join(' ')}`,
  ...g.edges.map((e) => `edge ${e.u} ${e.v} ${e.w}`),
];

/**
 * Driver protocol for the code tabs. "graph <names>" starts an undirected graph (the code
 * numbers the names 0..n-1 in that order) and "edge u v w" adds an edge; neither prints.
 * "boruvka" prints "<total weight> | <tree edges in the order they joined>". Runs on a directed
 * graph, which the page refuses, are left out.
 */
function codeScript(calls: OpCall[], settings: BoruvkaSettings) {
  const t = new Timeline(boruvka, settings, 1, calls);
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
    input.push('boruvka');
    expected.push(runSummary(r));
  }
  return { input, expected };
}

export default boruvka;
