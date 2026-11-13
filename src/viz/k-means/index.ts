import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, Preset, SavedExample, Settings, VizDef } from '../../engine/types';
import { writePoints, type Vec } from '../../layouts/plane';
import { round3 } from '../_lm/numbers';
import { blobs, MAX, parsePoints, randomPoints, shuffled } from '../_retrieve/points';
import cppSource from './code/cpp/kmeans.hpp?raw';
import javaSource from './code/java/KMeans.java?raw';
import pythonSource from './code/python/kmeans.py?raw';
import badStart from './examples/bad-start.json';
import byHand from './examples/by-hand.json';
import emptyCluster from './examples/empty-cluster.json';
import emptyStays from './examples/empty-stays.json';
import longStrips from './examples/long-strips.json';
import plusSpreads from './examples/plus-spreads.json';
import threeGroups from './examples/three-groups.json';
import tooManyCentres from './examples/too-many-centres.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  MOST,
  ops,
  pseudocode,
  wcss,
  type KmExtra,
  type KmSettings,
  type KmState,
} from './model';
import { kmeansPractice } from './practice';
import { view } from './view';

const load = (pts: Vec[]): OpCall[] => [['load', writePoints(pts)]];
const preset = (label: string, make: (rng: Rng, n: number) => Vec[]): Preset => ({
  label,
  make: (rng, n) => load(make(rng, n)),
});

/** Two long strips side by side: what k-means splits the wrong way. */
export function strips(rng: Rng, n: number): Vec[] {
  const xs = shuffled(
    rng,
    Array.from({ length: MAX + 1 }, (_, i) => i),
  );
  const pts: Vec[] = [];
  for (let i = 0; pts.length < n && i < 2 * xs.length; i++)
    pts.push({ x: xs[Math.floor(i / 2)]!, y: i % 2 === 0 ? 3 : 6 });
  return shuffled(rng, pts);
}

export const kMeans: VizDef<KmState, KmSettings, KmExtra> = {
  id: 'k-means',
  title: 'k-means clustering',
  family: 'Retrieval and vector search',
  blurb:
    "Lloyd's algorithm: every point joins its nearest centre, every centre moves to the mean of its points, until nothing changes. k-means++ seeding, empty clusters, and the sum of squares that only goes down.",
  settings: [
    {
      kind: 'number',
      key: 'k',
      label: 'k, the number of centres Seed picks',
      min: 1,
      max: 5,
      help: 'Place centres sets them by hand instead, as many as you type.',
    },
    {
      kind: 'choice',
      key: 'seeding',
      label: 'Seeding',
      options: [
        { value: 'plus', label: 'k-means++: far points are more likely' },
        { value: 'random', label: 'Random: k points, each equally likely' },
      ],
      help: 'Arthur and Vassilvitskii (2007) pick each next centre with probability proportional to D², the squared distance to the nearest centre so far.',
    },
    {
      kind: 'choice',
      key: 'empty',
      label: 'A centre with no points',
      options: [
        { value: 'farthest', label: 'jumps to the point farthest from its centre' },
        { value: 'stay', label: 'stays where it is' },
      ],
      help: "Lloyd's algorithm does not say. Libraries differ: some move it, some leave it, some stop with an error.",
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
      placeholder: 'e.g. 1,1 2,1 8,8; a count for random points',
      maxLength: 120,
      sample: '1,1 2,1 1,2 8,8 9,8 8,9',
      parse: (t) => parsePoints(t, MOST),
    },
    buttons: [
      { op: 'load', label: 'Load', usesInput: true, primary: true },
      { op: 'seed', label: 'Seed', usesInput: false },
      { op: 'assign', label: 'Assign', usesInput: false },
      { op: 'update', label: 'Update', usesInput: false },
      { op: 'run', label: 'Run', usesInput: false },
      { op: 'place', label: 'Place centres', usesInput: true, more: true },
    ],
    random: {
      label: 'Random groups',
      make: (rng) => [...load(blobs(rng, rng.int(8, 12), rng.int(2, 4))), ['run']],
    },
    presets: [
      preset('Three round groups', (rng, n) => blobs(rng, n, 3)),
      preset('Two round groups', (rng, n) => blobs(rng, n, 2)),
      preset('Random points (no groups)', (rng, n) => randomPoints(rng, n, 0, MAX)),
      preset('Two long strips (k-means splits them wrong)', strips),
      preset('One far point (an outlier)', (rng, n) => [
        ...blobs(rng, Math.max(1, n - 1), 2),
        { x: 10, y: 0 },
      ]),
      preset('Repeated points (centres can coincide)', (rng, n) => {
        const base = blobs(rng, Math.max(2, Math.ceil(n / 2)), 2);
        return [...base, ...base].slice(0, n);
      }),
    ],
    sizes: [6, 9, 12],
  },
  explain,
  complexity: [
    {
      op: 'Assign: every point to its nearest centre',
      best: {
        cost: 'Θ(N·k)',
        why: 'Each of N points measures its distance to all k centres.',
        example: 'by-hand',
      },
      average: {
        cost: 'Θ(N·k)',
        why: 'The same work every round, wherever the centres are.',
        example: 'three-groups',
      },
      worst: {
        cost: 'Θ(N·k)',
        why: 'No shortcut in the plain algorithm: every distance is computed.',
        example: 'too-many-centres',
      },
      note: 'In d dimensions each distance costs Θ(d), so a round is Θ(N·k·d).',
    },
    {
      op: 'Update: every centre to its mean',
      best: {
        cost: 'Θ(N + k)',
        why: 'One pass adds each point to its cluster’s sum; then k divisions.',
        example: 'by-hand',
      },
      average: { cost: 'Θ(N + k)', why: 'Linear in the points.', example: 'three-groups' },
      worst: {
        cost: 'Θ(N + k)',
        why: 'An empty cluster adds one pass to find the farthest point.',
        example: 'empty-cluster',
      },
    },
    {
      op: 'Seed with k-means++',
      best: {
        cost: 'Θ(N·k)',
        why: 'Each new centre updates every point’s D² once.',
        example: 'plus-spreads',
      },
      average: {
        cost: 'Θ(N·k)',
        why: 'k draws, each a pass over the N points.',
        example: 'three-groups',
      },
      worst: {
        cost: 'Θ(N·k)',
        why: 'The same for any input; random seeding costs only Θ(k).',
        example: 'bad-start',
      },
    },
    {
      op: "Lloyd's algorithm until nothing changes",
      best: {
        cost: 'Θ(N·k)',
        why: 'Good centres: the second assignment changes nothing.',
        example: 'plus-spreads',
      },
      average: {
        cost: 'Θ(I·N·k)',
        why: 'I rounds; in practice I is small (a handful here).',
        example: 'three-groups',
      },
      worst: {
        cost: '2^Ω(N) rounds',
        why: 'Vattani (2011) built point sets in the plane that take exponentially many rounds.',
        example: 'long-strips',
      },
      note: 'The loop always ends: WCSS only goes down and there are finitely many ways to split the points.',
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as KmSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    threeGroups,
    byHand,
    badStart,
    plusSpreads,
    emptyCluster,
    emptyStays,
    tooManyCentres,
    longStrips,
  ] as unknown as SavedExample[],
  practice: kmeansPractice(() => kMeans),
  preview: { example: 'three-groups', level: 2, hide: ['tr-', 'cl-'] },
  opening: 'three-groups',
};

const pair = (v: Vec) => `${round3(v.x)} ${round3(v.y)}`;
const labels = (s: KmState) => s.assign.map((a) => String(a)).join(' ');
const centreLine = (s: KmState) => s.centres.map(pair).join(' / ');

/**
 * Driver protocol for the code tabs. "points x y x y ..." and "place x y ..." set the points and
 * the centres (no output). "seed plus|random k u1 ... uk" prints the indices of the points
 * chosen. "assign" prints the labels, a bar and WCSS; "update farthest|stay" the centres and
 * WCSS; "run farthest|stay" the rounds, the labels, the centres and WCSS. Three decimals.
 */
function codeScript(calls: OpCall[], settings: KmSettings) {
  const t = new Timeline(kMeans, settings, 1, calls);
  const input: string[] = [];
  const expected: string[] = [];
  let prev = t.initial.state;
  for (const e of t.entries) {
    const [op] = e.call;
    const end = e.end;
    if (end === prev) continue;
    if (op === 'load') input.push(`points ${end.points.map(pair).join(' ')}`.trimEnd());
    if (op === 'place') input.push(`place ${end.centres.map(pair).join(' ')}`);
    const draws = e.steps.flatMap((st) =>
      st.extra?.draw && st.extra.draw.pick >= 0 ? [st.extra.draw] : [],
    );
    if (draws.length) {
      input.push(
        `seed ${settings.seeding} ${draws.length} ${draws.map((d) => String(d.u)).join(' ')}`,
      );
      expected.push(draws.map((d) => d.pick).join(' '));
    }
    if (op === 'assign') {
      input.push('assign');
      expected.push(`${labels(end)} | ${round3(wcss(end))}`);
    }
    if (op === 'update') {
      input.push(`update ${settings.empty}`);
      expected.push(`${centreLine(end)} | ${round3(wcss(end))}`);
    }
    if (op === 'run' && end.centres.length) {
      const seeded = draws.length ? 0 : prev.round;
      input.push(`run ${settings.empty}`);
      expected.push(
        `${end.round - seeded} | ${labels(end)} | ${centreLine(end)} | ${round3(wcss(end))}`,
      );
    }
    prev = end;
  }
  return { input, expected };
}

export default kMeans;
