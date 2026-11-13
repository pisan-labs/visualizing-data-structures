import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, Preset, SavedExample, Settings, VizDef } from '../../engine/types';
import { writePoints, type Vec } from '../../layouts/plane';
import { blobs, MAX, parsePoints, randomPoints, shuffled } from '../_retrieve/points';
import { circlePoints, collinearPoints, gridPoints } from '../_spatial/kit';
import cppSource from './code/cpp/hnsw.hpp?raw';
import javaSource from './code/java/Hnsw.java?raw';
import pythonSource from './code/python/hnsw.py?raw';
import beamFinds from './examples/beam-finds.json';
import firstPoint from './examples/first-point.json';
import greedyMisses from './examples/greedy-misses.json';
import linksDropped from './examples/links-dropped.json';
import newTop from './examples/new-top.json';
import twelvePoints from './examples/twelve-points.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  efOf,
  init,
  initialSay,
  initialVars,
  K,
  mOf,
  MOST,
  ops,
  pseudocode,
  type HnswExtra,
  type HnswSettings,
  type HnswState,
} from './model';
import { hnswPractice } from './practice';
import { view } from './view';

const query = (rng: Rng) => `${rng.int(0, MAX)},${rng.int(0, MAX)}`;
const build = (pts: Vec[], rng: Rng): OpCall[] => [
  ['clear'],
  ['insert', writePoints(pts)],
  ['search', query(rng)],
];
const preset = (label: string, make: (rng: Rng, n: number) => Vec[]): Preset => ({
  label,
  make: (rng, n) => build(make(rng, n), rng),
});

export const hnsw: VizDef<HnswState, HnswSettings, HnswExtra> = {
  id: 'hnsw',
  title: 'HNSW graph search',
  family: 'Retrieval and vector search',
  blurb:
    'Approximate nearest neighbours on a layered graph: each point joins a random number of layers, as in a skip list; a search goes greedily down the sparse layers, then keeps a list of ef candidates on the bottom one. Recall and work against brute force.',
  settings: [
    {
      kind: 'number',
      key: 'M',
      label: 'M, links per node on a layer',
      min: 2,
      max: 4,
      help: 'A new point links to its M nearest on each layer; a node keeps at most M links (2M on layer 0). A larger M also makes fewer upper layers: a point reaches layer 1 with chance 1/M.',
    },
    {
      kind: 'number',
      key: 'ef',
      label: 'ef, the search list on layer 0',
      min: 1,
      max: 8,
      help: `How many nearest-so-far the search keeps on layer 0. ef = 1 is plain greedy search. The answer is the ${K} nearest of the list, so ef below ${K} returns fewer.`,
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
    input: {
      label: 'Points',
      placeholder: 'e.g. 2,3 7,8 5,1 to insert; 4,6 to search',
      maxLength: 120,
      sample: '4,6',
      parse: (t) => parsePoints(t, MOST),
    },
    buttons: [
      { op: 'insert', label: 'Insert', usesInput: true, primary: true },
      { op: 'search', label: 'Search', usesInput: true },
      { op: 'clear', label: 'Clear', usesInput: false, more: true },
    ],
    random: {
      label: 'Random points',
      make: (rng) => build(randomPoints(rng, rng.int(8, 12), 0, MAX), rng),
    },
    presets: [
      preset('Random points', (rng, n) => randomPoints(rng, n, 0, MAX)),
      preset('Two groups (greedy can get stuck)', (rng, n) => blobs(rng, n, 2)),
      preset('Three groups', (rng, n) => blobs(rng, n, 3)),
      preset('A grid (many ties)', (rng, n) => gridPoints(rng, n, 1, 9)),
      preset('On a line', (rng, n) => collinearPoints(rng, n, 0, MAX)),
      preset('Around a circle', (rng, n) => shuffled(rng, circlePoints(5, 5)).slice(0, n)),
    ],
    sizes: [6, 9, 12],
  },
  explain,
  complexity: [
    {
      op: `Search for the ${K} nearest (HNSW)`,
      best: {
        cost: 'Θ(1)',
        why: 'The entry point and its neighbours are the answer: a handful of distances.',
        example: 'first-point',
      },
      average: {
        cost: 'O(log N)',
        why: 'A few hops on each of about log_M N layers; Malkov and Yashunin measured this scaling.',
        example: 'twelve-points',
      },
      worst: {
        cost: 'Θ(N)',
        why: 'With a large ef, or a poorly linked graph, the search can measure every point.',
        example: 'beam-finds',
      },
      note: 'Approximate: the answer can miss a true neighbour (recall below 1).',
    },
    {
      op: `Search for the ${K} nearest (brute force)`,
      best: { cost: 'Θ(N)', why: 'Measure every point, always.', example: 'first-point' },
      average: { cost: 'Θ(N)', why: 'N distances, then keep the nearest K.', example: 'twelve-points' },
      worst: { cost: 'Θ(N)', why: 'Exact, and never cheaper.', example: 'greedy-misses' },
      note: 'In d dimensions each distance costs Θ(d).',
    },
    {
      op: 'Insert a point',
      best: { cost: 'Θ(1)', why: 'The first point: it just becomes the entry point.', example: 'first-point' },
      average: {
        cost: 'O(log N)',
        why: 'A search on each layer it joins, with efConstruction and M as constants.',
        example: 'twelve-points',
      },
      worst: { cost: 'Θ(N)', why: 'A search that wanders over most of the graph.', example: 'links-dropped' },
    },
    {
      op: 'Memory for the links',
      best: { cost: 'Θ(N·M)', why: 'Up to 2M links per node on layer 0.', example: 'twelve-points' },
      average: {
        cost: 'Θ(N·M)',
        why: 'A node is on M/(M − 1) layers on average, with at most M links on each upper one.',
        example: 'new-top',
      },
      worst: { cost: 'Θ(N·M)', why: 'Bounded by the limits on links, whatever the points.', example: 'links-dropped' },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as HnswSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    twelvePoints,
    greedyMisses,
    beamFinds,
    firstPoint,
    newTop,
    linksDropped,
  ] as unknown as SavedExample[],
  practice: hnswPractice(() => hnsw),
  preview: { example: 'twelve-points', level: 2, hide: ['lh-', 'li-', 'lr'] },
  opening: 'twelve-points',
};

const ids = (xs: readonly number[]) => (xs.length ? xs.join(' ') : '-');

/**
 * Driver protocol for the code tabs. "m M" starts an empty graph with that M; "insert x y level"
 * inserts a point at the level the page drew and prints the distances it computed, a bar, and its
 * links on each layer from the top down ("-" for none); "search x y k ef" prints the ids found
 * and the distances computed. Ids count from 0 in the order points were inserted.
 */
function codeScript(calls: OpCall[], settings: HnswSettings) {
  const t = new Timeline(hnsw, settings, 1, calls);
  const input: string[] = [`m ${mOf(settings)}`];
  const expected: string[] = [];
  let prev = t.initial.state;
  for (const e of t.entries) {
    const [op] = e.call;
    if (op === 'clear') input.push(`m ${mOf(settings)}`);
    for (const st of e.steps) {
      const done = st.extra?.done;
      if (!done) continue;
      const n = st.state.nodes[done.id]!;
      input.push(`insert ${n.x} ${n.y} ${n.level}`);
      expected.push(`${done.dists} | ${[...done.links].reverse().map(ids).join(' / ')}`);
    }
    const last = e.end.last;
    if (op === 'search' && last?.kind === 'search' && e.end !== prev) {
      input.push(`search ${last.q.x} ${last.q.y} ${K} ${efOf(settings)}`);
      expected.push(`${ids(last.found)} | ${last.dists}`);
    }
    prev = e.end;
  }
  return { input, expected };
}

export default hnsw;
