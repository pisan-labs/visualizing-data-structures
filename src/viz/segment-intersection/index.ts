import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import type { Vec } from '../../layouts/plane';
import { shuffled } from '../_spatial/kit';
import cppSource from './code/cpp/segments.hpp?raw';
import javaSource from './code/java/Segments.java?raw';
import pythonSource from './code/python/segments.py?raw';
import crossingFound from './examples/crossing-found.json';
import fan from './examples/shared-end-point.json';
import lattice from './examples/report-every-crossing.json';
import neighbours from './examples/neighbours-only.json';
import noCrossings from './examples/no-crossings.json';
import threeAtOnce from './examples/three-at-one-point.json';
import explain from './explain.md?raw';
import {
  MAX,
  MOST,
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  randomSegs,
  readSegs,
  writeSegs,
  type SIExtra,
  type SISettings,
  type SIState,
} from './model';
import { segmentPractice } from './practice';
import { view } from './view';

/** End points in pairs "1,2 5,6 3,1 4,7", or a count of random segments. */
export function parseInput(token: string): Value | Error {
  const t = token.trim();
  if (/^\d+$/.test(t)) {
    const n = Number(t);
    if (n < 1 || n > MOST) return new Error(`For random segments, pick a count from 1 to ${MOST}.`);
    return n;
  }
  const segs = readSegs(t);
  if (typeof segs === 'string') return new Error(segs);
  return writeSegs(segs);
}

const loadAndRun = (segs: [Vec, Vec][]): OpCall[] => [['load', writeSegs(segs)], ['sweep']];

export const segmentIntersection: VizDef<SIState, SISettings, SIExtra> = {
  id: 'segment-intersection',
  title: 'Segment intersection (sweep line)',
  family: 'Geometry',
  blurb:
    'Sweep a vertical line across segments, keep the ones it crosses in order by height, and test only neighbours: any intersection (CLRS), or every one (Bentley–Ottmann).',
  settings: [
    {
      kind: 'choice',
      key: 'mode',
      label: 'Question',
      options: [
        { value: 'any', label: 'Do any two intersect? (CLRS, Shamos–Hoey)' },
        { value: 'all', label: 'Report every intersection (Bentley–Ottmann)' },
      ],
      help: 'The first stops at the first intersection it finds, in O(n lg n). The second keeps going and adds crossings to the event queue: O((n + k) lg n) for k intersections.',
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
      label: 'Segments',
      placeholder: 'end points in pairs, e.g. 1,2 9,8 2,9 10,3, or 5 for random',
      maxLength: 200,
      sample: '1,2 9,8 2,9 10,3 0,5 6,6',
      parse: parseInput,
    },
    buttons: [
      { op: 'load', label: 'Load segments', usesInput: true, primary: true },
      { op: 'sweep', label: 'Sweep', usesInput: false },
      { op: 'clear', label: 'Clear', usesInput: false, more: true },
    ],
    random: {
      label: 'Random segments',
      make: (rng) => loadAndRun(randomSegs(rng, rng.int(4, 7))),
    },
    presets: [
      { label: 'Random segments', make: (rng, n) => loadAndRun(randomSegs(rng, n)) },
      {
        label: 'A lattice (many crossings)',
        make: (rng, n) => {
          const k = Math.max(1, Math.floor(n / 2));
          const segs: [Vec, Vec][] = [];
          for (let i = 0; i < k; i++) {
            const y = 2 + Math.round((i * 8) / Math.max(1, k - 1));
            segs.push([
              { x: 0, y },
              { x: 12, y: Math.min(MAX, y + 1) },
            ]);
            segs.push([
              { x: 1 + i, y: 0 },
              { x: 4 + i, y: 12 },
            ]);
          }
          return loadAndRun(shuffled(rng, segs).slice(0, n));
        },
      },
      {
        label: 'Parallel (no crossings)',
        make: (rng, n) =>
          loadAndRun(
            shuffled(
              rng,
              Array.from({ length: n }, (_, i): [Vec, Vec] => {
                const x = rng.int(0, 2);
                return [
                  { x, y: i },
                  { x: x + 9, y: i + 3 },
                ];
              }),
            ),
          ),
      },
      {
        label: 'A fan from one end point',
        make: (_rng, n) =>
          loadAndRun(
            Array.from({ length: n }, (_, i): [Vec, Vec] => [
              { x: 1, y: 6 },
              { x: 11, y: Math.round((i * 12) / Math.max(1, n - 1)) },
            ]).filter((g, i, all) => all.findIndex((h) => h[1].y === g[1].y) === i),
          ),
      },
      {
        label: 'Many through one point',
        make: (rng, n) =>
          loadAndRun(
            shuffled(rng, [
              [
                { x: 2, y: 2 },
                { x: 10, y: 10 },
              ],
              [
                { x: 2, y: 10 },
                { x: 10, y: 2 },
              ],
              [
                { x: 0, y: 6 },
                { x: 12, y: 6 },
              ],
              [
                { x: 3, y: 0 },
                { x: 9, y: 12 },
              ],
              [
                { x: 3, y: 12 },
                { x: 9, y: 0 },
              ],
              [
                { x: 0, y: 3 },
                { x: 12, y: 9 },
              ],
              [
                { x: 0, y: 9 },
                { x: 12, y: 3 },
              ],
              [
                { x: 1, y: 1 },
                { x: 4, y: 0 },
              ],
            ] as [Vec, Vec][]).slice(0, Math.min(n, MOST)),
          ),
      },
    ],
    sizes: [4, 6, 8],
  },
  explain,
  complexity: [
    {
      op: 'any intersection (CLRS)',
      best: {
        cost: 'O(n lg n)',
        why: 'Sorting the 2n end points; it can stop early once a crossing turns up.',
        example: 'crossing-found',
      },
      average: {
        cost: 'O(n lg n)',
        why: '2n events, each an O(lg n) insert or delete in a balanced status tree.',
        example: 'neighbours-only',
      },
      worst: {
        cost: 'O(n lg n)',
        why: 'With no intersection it visits every event, still lg n each.',
        example: 'no-crossings',
      },
    },
    {
      op: 'every intersection (Bentley–Ottmann)',
      best: {
        cost: 'O(n lg n)',
        why: 'With k = 0 only the end points are events.',
        example: 'no-crossings',
      },
      average: {
        cost: 'O((n + k) lg n)',
        why: '2n + k events, each costing O(lg n) in the queue and the status.',
        example: 'report-every-crossing',
      },
      worst: {
        cost: 'O(n² lg n)',
        why: 'k can be as large as n(n − 1)/2: then brute force O(n²) is better.',
        example: 'report-every-crossing',
      },
      note: 'Output-sensitive: the cost grows with k, the number of intersections.',
    },
    {
      op: 'brute force (every pair)',
      best: { cost: 'Θ(n²)', why: 'n(n − 1)/2 segment tests, whatever the input.' },
      average: { cost: 'Θ(n²)', why: 'Same for every input.' },
      worst: { cost: 'Θ(n²)', why: 'Optimal only when nearly every pair crosses.' },
    },
  ],
  practice: segmentPractice(() => segmentIntersection),
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as SISettings),
  },
  examples: [
    crossingFound,
    neighbours,
    noCrossings,
    lattice,
    threeAtOnce,
    fan,
  ] as unknown as SavedExample[],
  opening: 'neighbours-only',
  preview: { example: 'report-every-crossing', level: 2, hide: ['st-', 'q-', 'counts'] },
};

/**
 * Driver protocol: "segments x1 y1 x2 y2 ..." prints "yes" if any two of the segments meet
 * (touching counts) and "no" otherwise.
 */
function codeScript(calls: OpCall[], settings: SISettings) {
  const t = new Timeline(segmentIntersection, settings, 1, calls);
  const input: string[] = [];
  const expected: string[] = [];
  for (const e of t.entries) {
    if (e.call[0] !== 'sweep' || e.end.segs.length < 2) continue;
    input.push(['segments', ...e.end.segs.flatMap((g) => [g.p.x, g.p.y, g.q.x, g.q.y])].join(' '));
    expected.push(e.end.answer ? 'yes' : 'no');
  }
  return { input, expected };
}

export default segmentIntersection;
