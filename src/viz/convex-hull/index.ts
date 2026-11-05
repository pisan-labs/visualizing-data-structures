import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import { readPoints, writePoints, type Vec } from '../../layouts/plane';
import cppSource from './code/cpp/convex_hull.hpp?raw';
import javaSource from './code/java/ConvexHull.java?raw';
import pythonSource from './code/python/convex_hull.py?raw';
import allCollinear from './examples/all-collinear.json';
import allOnHull from './examples/all-on-hull.json';
import collinearEdge from './examples/collinear-edge.json';
import duplicates from './examples/duplicates.json';
import fewCorners from './examples/few-corners.json';
import monotoneChain from './examples/monotone-chain.json';
import smallSet from './examples/small-set.json';
import explain from './explain.md?raw';
import {
  MAX,
  MOST,
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  normalizedHull,
  ops,
  pseudocode,
  randomPoints,
  type HullExtra,
  type HullSettings,
  type HullState,
} from './model';
import { hullPractice } from './practice';
import { view } from './view';

/** A list of points "1,2 3,4", or a whole number: that many random points. */
export function parsePoints(token: string): Value | Error {
  const t = token.trim();
  if (/^\d+$/.test(t)) {
    const n = Number(t);
    if (n < 1 || n > 20) return new Error('For random points, pick a count from 1 to 20.');
    return n;
  }
  const pts = readPoints(t, 0, MAX, MOST);
  if (typeof pts === 'string') return new Error(pts);
  return writePoints(pts);
}

const loadAndRun = (pts: Vec[]): OpCall[] => [['load', writePoints(pts)], ['hull']];

/** Lattice points on the circle of radius 5 around (6, 6), counter-clockwise from the right. */
const CIRCLE: Vec[] = [
  [11, 6],
  [10, 9],
  [9, 10],
  [6, 11],
  [3, 10],
  [2, 9],
  [1, 6],
  [2, 3],
  [3, 2],
  [6, 1],
  [9, 2],
  [10, 3],
].map(([x, y]) => ({ x: x!, y: y! }));

function shuffled<T>(rng: Rng, xs: readonly T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export const convexHull: VizDef<HullState, HullSettings, HullExtra> = {
  id: 'convex-hull',
  title: 'Convex hull',
  family: 'Geometry',
  blurb:
    'Wrap a rubber band around points in the plane: Graham scan, the monotone chain and gift wrapping, one turn test at a time.',
  settings: [
    {
      kind: 'choice',
      key: 'algorithm',
      label: 'Algorithm',
      options: [
        { value: 'graham', label: 'Graham scan (sort by angle)' },
        { value: 'monotone', label: "Andrew's monotone chain (sort by x)" },
        { value: 'jarvis', label: 'Gift wrapping (Jarvis march)' },
      ],
      help: 'All three find the same corners. Graham and the monotone chain sort first and cost O(n lg n); gift wrapping costs O(nh) for h corners.',
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
      placeholder: 'e.g. 1,2 5,1 3,4, or 8 for random points',
      maxLength: 200,
      sample: '1,1 6,1 3,3 5,5 1,4 3,3',
      parse: parsePoints,
    },
    buttons: [
      { op: 'load', label: 'Load points', usesInput: true, primary: true },
      { op: 'hull', label: 'Find hull', usesInput: false },
      { op: 'add', label: 'Add points', usesInput: true, more: true },
      { op: 'clear', label: 'Clear', usesInput: false, more: true },
    ],
    random: {
      label: 'Random points',
      make: (rng) => loadAndRun(randomPoints(rng, rng.int(6, 12))),
    },
    presets: [
      { label: 'Random points', make: (rng, n) => loadAndRun(randomPoints(rng, n)) },
      {
        label: 'Every point a corner (a circle)',
        make: (rng, n) => {
          const step = CIRCLE.length / Math.min(n, CIRCLE.length);
          const pick = Array.from(
            { length: Math.min(n, CIRCLE.length) },
            (_, i) => CIRCLE[Math.floor(i * step)]!,
          );
          return loadAndRun(shuffled(rng, pick));
        },
      },
      {
        label: 'Four corners, the rest inside',
        make: (rng, n) =>
          loadAndRun(
            shuffled(rng, [
              { x: 1, y: 1 },
              { x: 11, y: 1 },
              { x: 11, y: 11 },
              { x: 1, y: 11 },
              ...Array.from({ length: Math.max(0, n - 4) }, () => ({
                x: rng.int(2, 10),
                y: rng.int(2, 10),
              })),
            ]),
          ),
      },
      {
        label: 'All on one line',
        make: (rng, n) =>
          loadAndRun(
            shuffled(
              rng,
              // Every other lattice point on y = 11 - x, then the ones between.
              [0, 2, 4, 6, 8, 10, 1, 3, 5, 7, 9, 11]
                .slice(0, Math.min(n, 12))
                .map((x) => ({ x: x + 1, y: 11 - x })),
            ),
          ),
      },
      {
        label: 'Points on the edges, and repeats',
        make: (rng, n) => {
          const square: Vec[] = [];
          for (let k = 1; k <= 11; k += 2) {
            square.push({ x: k, y: 1 }, { x: 11, y: k }, { x: 12 - k, y: 11 }, { x: 1, y: 12 - k });
          }
          const pick = shuffled(rng, square).slice(0, Math.max(3, n - 2));
          return loadAndRun(shuffled(rng, [...pick, pick[0]!, pick[1]!]));
        },
      },
    ],
    sizes: [6, 10, 14],
  },
  explain,
  complexity: [
    {
      op: 'Graham scan',
      best: {
        cost: 'O(n lg n)',
        why: 'The sort by angle costs n lg n even when the scan pops nothing.',
        example: 'all-collinear',
      },
      average: {
        cost: 'O(n lg n)',
        why: 'Sorting dominates; the scan after it is O(n).',
        example: 'small-set',
      },
      worst: {
        cost: 'O(n lg n)',
        why: 'Each point is pushed once and popped at most once, so the scan stays O(n).',
        example: 'collinear-edge',
      },
    },
    {
      op: "Andrew's monotone chain",
      best: {
        cost: 'O(n lg n)',
        why: 'Sorting by x is the cost; it is skipped only if the points arrive sorted.',
        example: 'monotone-chain',
      },
      average: { cost: 'O(n lg n)', why: 'Sort, then two O(n) passes.', example: 'monotone-chain' },
      worst: {
        cost: 'O(n lg n)',
        why: 'Every point is pushed and popped at most once in each pass.',
      },
    },
    {
      op: 'Gift wrapping (Jarvis march)',
      best: {
        cost: 'O(n)',
        why: 'With a constant number of corners h, it makes h passes of n − 2 tests.',
        example: 'few-corners',
      },
      average: {
        cost: 'O(nh)',
        why: 'One pass over all points for each of the h corners.',
        example: 'few-corners',
      },
      worst: {
        cost: 'O(n²)',
        why: 'When every point is a corner, h = n.',
        example: 'all-on-hull',
      },
      note: 'Output-sensitive: the cost depends on h, the size of the answer.',
    },
    {
      op: 'one turn test TURN(a, b, c)',
      best: { cost: 'O(1)', why: 'Two multiplications and a subtraction.' },
      average: { cost: 'O(1)', why: 'No angles, no square roots, no division.' },
      worst: {
        cost: 'O(1)',
        why: 'Whole-number inputs give an exact answer, even for collinear points.',
        example: 'collinear-edge',
      },
      note: 'Any comparison-based hull algorithm needs Ω(n lg n) in the worst case: it can be used to sort.',
    },
  ],
  practice: hullPractice(() => convexHull),
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as HullSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    smallSet,
    collinearEdge,
    duplicates,
    allCollinear,
    allOnHull,
    fewCorners,
    monotoneChain,
  ] as unknown as SavedExample[],
};

/**
 * Driver protocol for the code tabs: "hull x1 y1 x2 y2 ..." with every point, repeats
 * included, prints the corners counter-clockwise from the lowest point (leftmost if tied) as
 * "x,y x,y ...", or "empty". Each Find hull becomes one line; loading points prints nothing.
 */
function codeScript(calls: OpCall[], settings: HullSettings) {
  const t = new Timeline(convexHull, settings, 1, calls);
  const input: string[] = [];
  const expected: string[] = [];
  for (const e of t.entries) {
    if (e.call[0] !== 'hull') continue;
    input.push(['hull', ...e.end.points.flatMap((p) => [p.x, p.y])].join(' '));
    const h = normalizedHull(e.end);
    expected.push(h.length ? h.join(' ') : 'empty');
  }
  return { input, expected };
}

export default convexHull;
