import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, Preset, SavedExample, Settings, VizDef } from '../../engine/types';
import { writePoints, type Vec } from '../../layouts/plane';
import { round3 } from '../_lm/numbers';
import { blobs, MAX, parsePoints, randomPoints, shuffled } from '../_retrieve/points';
import { gridPoints } from '../_spatial/kit';
import cppSource from './code/cpp/ivf.hpp?raw';
import javaSource from './code/java/Ivf.java?raw';
import pythonSource from './code/python/ivf.py?raw';
import acrossTheBorder from './examples/across-the-border.json';
import crowdedList from './examples/crowded-list.json';
import everyList from './examples/every-list.json';
import oneList from './examples/one-list.json';
import threeCells from './examples/three-cells.json';
import twoProbes from './examples/two-probes.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  K,
  MOST,
  nprobeOf,
  ops,
  pseudocode,
  type IvfExtra,
  type IvfSettings,
  type IvfState,
} from './model';
import { ivfPractice } from './practice';
import { view } from './view';

const query = (rng: Rng) => `${rng.int(0, MAX)},${rng.int(0, MAX)}`;
const build = (pts: Vec[], rng: Rng): OpCall[] => [
  ['load', writePoints(pts)],
  ['train'],
  ['search', query(rng)],
];
const preset = (label: string, make: (rng: Rng, n: number) => Vec[]): Preset => ({
  label,
  make: (rng, n) => build(make(rng, n), rng),
});

/** Most points crowded into one corner, a few spread out: k-means gives uneven lists. */
export function crowded(rng: Rng, n: number): Vec[] {
  const few = Math.max(1, Math.round(n / 4));
  const dense = randomPoints(rng, n - few, 0, 3);
  const spread = randomPoints(rng, few + 4, 5, MAX)
    .filter((p) => !dense.some((d) => d.x === p.x && d.y === p.y))
    .slice(0, few);
  return shuffled(rng, [...dense, ...spread]);
}

export const ivfIndex: VizDef<IvfState, IvfSettings, IvfExtra> = {
  id: 'ivf-index',
  title: 'IVF index',
  family: 'Retrieval and vector search',
  blurb:
    'The inverted file index: k-means splits the points into lists, one per centre; a search compares the query with the centres and measures only the points in the nprobe nearest lists. Fast, and now and then it misses the true nearest neighbour across a border.',
  settings: [
    {
      kind: 'number',
      key: 'lists',
      label: 'nlist, the number of lists',
      min: 1,
      max: 5,
      help: 'Train runs k-means with this many centres, and each centre owns a list: the points nearer to it than to any other centre.',
    },
    {
      kind: 'number',
      key: 'nprobe',
      label: 'nprobe, the lists a search looks in',
      min: 1,
      max: 5,
      help: 'A search measures every point in the nprobe lists whose centres are nearest the query, and no others. With nprobe = nlist it measures every point: exact, and no saving.',
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
      placeholder: 'e.g. 1,1 2,1 8,8 to load; 6,3 to search',
      maxLength: 120,
      sample: '6,3',
      parse: (t) => parsePoints(t, MOST),
    },
    buttons: [
      { op: 'load', label: 'Load', usesInput: true, primary: true },
      { op: 'train', label: 'Train', usesInput: false },
      { op: 'search', label: 'Search', usesInput: true },
    ],
    random: {
      label: 'Random groups',
      make: (rng) => build(blobs(rng, rng.int(9, 12), rng.int(2, 4)), rng),
    },
    presets: [
      preset('Three round groups', (rng, n) => blobs(rng, n, 3)),
      preset('Two round groups', (rng, n) => blobs(rng, n, 2)),
      preset('Random points (no groups)', (rng, n) => randomPoints(rng, n, 0, MAX)),
      preset('A grid (many points near a border)', (rng, n) => gridPoints(rng, n, 1, 9)),
      preset('One crowded corner (uneven lists)', crowded),
    ],
    sizes: [6, 9, 12],
  },
  explain,
  complexity: [
    {
      op: `Search for the ${K} nearest (IVF)`,
      best: {
        cost: 'Θ(nlist)',
        why: 'The probed lists are nearly empty: the work is comparing q with the centres.',
        example: 'three-cells',
      },
      average: {
        cost: 'Θ(nlist + nprobe·N/nlist)',
        why: 'With lists of about N/nlist points each, nprobe of them are measured.',
        example: 'across-the-border',
      },
      worst: {
        cost: 'Θ(nlist + N)',
        why: 'Every point sits in a probed list (uneven lists, or nprobe = nlist).',
        example: 'every-list',
      },
      note: 'Approximate unless every list is searched. In d dimensions each distance costs Θ(d).',
    },
    {
      op: `Search for the ${K} nearest (brute force)`,
      best: { cost: 'Θ(N)', why: 'Measure every point, always.', example: 'one-list' },
      average: {
        cost: 'Θ(N)',
        why: 'N distances, then keep the nearest 3.',
        example: 'three-cells',
      },
      worst: { cost: 'Θ(N)', why: 'Exact, and never cheaper.', example: 'crowded-list' },
    },
    {
      op: 'Train: k-means for the centres, then fill the lists',
      best: {
        cost: 'Θ(N·nlist)',
        why: 'k-means++ seeding, and Lloyd settles in its second round.',
        example: 'three-cells',
      },
      average: {
        cost: 'Θ(I·N·nlist)',
        why: 'I rounds of k-means, each measuring every point against every centre.',
        example: 'across-the-border',
      },
      worst: {
        cost: 'Θ(I·N·nlist)',
        why: 'The same, with more rounds; filling the lists adds one pass.',
        example: 'crowded-list',
      },
      note: 'Done once. Real indexes often train on a sample of the vectors and add the rest later.',
    },
    {
      op: 'Memory',
      best: {
        cost: 'Θ(N + nlist)',
        why: 'Each point is stored once, in one list.',
        example: 'one-list',
      },
      average: {
        cost: 'Θ(N + nlist)',
        why: 'The vectors, plus nlist centres.',
        example: 'three-cells',
      },
      worst: {
        cost: 'Θ(N + nlist)',
        why: 'However uneven the lists, every point is in exactly one.',
        example: 'crowded-list',
      },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as IvfSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    threeCells,
    acrossTheBorder,
    twoProbes,
    everyList,
    oneList,
    crowdedList,
  ] as unknown as SavedExample[],
  practice: ivfPractice(() => ivfIndex),
  preview: { example: 'across-the-border', level: 2, hide: ['ls-', 'rs-'] },
  opening: 'across-the-border',
};

const ids = (xs: readonly number[]) => (xs.length ? xs.join(' ') : '-');

/**
 * Driver protocol for the code tabs. "points x y x y ..." sets the points (no output). "train
 * i1 ... ik" runs Lloyd's algorithm from the points the page's k-means++ chose and prints the
 * centres (three decimals) and the lists (point indices, "-" for an empty one). "search x y k
 * nprobe" prints the indices found, nearest first, and the distance computations.
 */
function codeScript(calls: OpCall[], settings: IvfSettings) {
  const t = new Timeline(ivfIndex, settings, 1, calls);
  const input: string[] = [];
  const expected: string[] = [];
  let prev = t.initial.state;
  for (const e of t.entries) {
    const [op] = e.call;
    const end = e.end;
    if (end === prev) continue;
    if (op === 'load') input.push(`points ${end.points.map((p) => `${p.x} ${p.y}`).join(' ')}`);
    if (op === 'train') {
      input.push(`train ${end.seeds.join(' ')}`);
      expected.push(
        `${end.centres.map((c) => `${round3(c.x)} ${round3(c.y)}`).join(' / ')} | ${end.lists.map(ids).join(' / ')}`,
      );
    }
    if (op === 'search' && end.last) {
      input.push(`search ${end.last.q.x} ${end.last.q.y} ${K} ${nprobeOf(settings)}`);
      expected.push(`${ids(end.last.found)} | ${end.last.dists}`);
    }
    prev = end;
  }
  return { input, expected };
}

export default ivfIndex;
