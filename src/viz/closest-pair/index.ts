import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import { writePoints, type Vec } from '../../layouts/plane';
import {
  clusteredPoints,
  cocircularPoints,
  collinearPoints,
  gridPoints,
  parsePointList,
  randomPoints,
  shuffled,
} from '../_spatial/kit';
import cppSource from './code/cpp/closest_pair.hpp?raw';
import javaSource from './code/java/ClosestPair.java?raw';
import pythonSource from './code/python/closest_pair.py?raw';
import acrossTheLine from './examples/across-the-line.json';
import bruteForce from './examples/brute-force.json';
import evenGrid from './examples/even-grid.json';
import repeatedPoint from './examples/repeated-point.json';
import sixteenPoints from './examples/sixteen-points.json';
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
  type CPExtra,
  type CPSettings,
  type CPState,
} from './model';
import { closestPractice } from './practice';
import { view } from './view';

export function parseInput(token: string): Value | Error {
  return parsePointList(token, MAX, MOST);
}

const loadAndRun = (pts: Vec[]): OpCall[] => [['load', writePoints(pts)], ['closest']];

export const closestPair: VizDef<CPState, CPSettings, CPExtra> = {
  id: 'closest-pair',
  title: 'Closest pair of points',
  family: 'Geometry',
  blurb:
    'Divide and conquer on points sorted by x: split, solve each half, then check a thin strip around the line, a few comparisons per point.',
  settings: [
    {
      kind: 'choice',
      key: 'method',
      label: 'Method',
      options: [
        { value: 'divide', label: 'Divide and conquer, O(n lg n)' },
        { value: 'brute', label: 'Brute force, every pair' },
      ],
      help: 'Both find the same distance. Compare the comparisons counter with the brute force count.',
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
      placeholder: 'e.g. 1,2 5,1 3,4, or 10 for random points',
      maxLength: 200,
      sample: '1,1 6,1 3,3 5,5 1,4 9,8',
      parse: parseInput,
    },
    buttons: [
      { op: 'load', label: 'Load points', usesInput: true, primary: true },
      { op: 'closest', label: 'Find closest pair', usesInput: false },
      { op: 'add', label: 'Add points', usesInput: true, more: true },
      { op: 'clear', label: 'Clear', usesInput: false, more: true },
    ],
    random: {
      label: 'Random points',
      make: (rng) => loadAndRun(randomPoints(rng, rng.int(8, 14), 0, MAX)),
    },
    presets: [
      { label: 'Random points', make: (rng, n) => loadAndRun(randomPoints(rng, n, 0, MAX)) },
      { label: 'A grid (many ties)', make: (rng, n) => loadAndRun(gridPoints(rng, n, 0, MAX)) },
      { label: 'All on one line', make: (rng, n) => loadAndRun(collinearPoints(rng, n, 0, MAX)) },
      {
        label: 'On a circle',
        make: (rng, n) => loadAndRun(cocircularPoints(rng, n, 6, 6)),
      },
      { label: 'Two clusters', make: (rng, n) => loadAndRun(clusteredPoints(rng, n, 0, MAX)) },
      {
        label: 'A close pair across the middle',
        make: (rng, n) => {
          const far = randomPoints(rng, Math.max(2, n - 2), 0, MAX).filter(
            (p) => Math.abs(p.x - 6) > 2,
          );
          return loadAndRun(shuffled(rng, [...far, { x: 6, y: 6 }, { x: 7, y: 6 }]));
        },
      },
    ],
    sizes: [8, 12, 16],
  },
  explain,
  complexity: [
    {
      op: 'divide and conquer',
      best: {
        cost: 'O(n lg n)',
        why: 'Even with an empty strip, the sort and the lg n levels of splitting cost n lg n.',
        example: 'repeated-point',
      },
      average: {
        cost: 'O(n lg n)',
        why: 'T(n) = 2T(n/2) + O(n): the strip check is linear per level.',
        example: 'sixteen-points',
      },
      worst: {
        cost: 'O(n lg n)',
        why: 'At most 7 comparisons per strip point keeps every level linear.',
        example: 'even-grid',
      },
    },
    {
      op: 'brute force',
      best: { cost: 'Θ(n²)', why: 'It always tries all n(n − 1)/2 pairs.', example: 'brute-force' },
      average: { cost: 'Θ(n²)', why: 'Same work whatever the points look like.' },
      worst: { cost: 'Θ(n²)', why: '16 points: 120 pairs.', example: 'brute-force' },
    },
    {
      op: 'strip check, per point',
      best: {
        cost: 'O(1)',
        why: 'The loop stops at the first point δ or more above.',
        example: 'sixteen-points',
      },
      average: {
        cost: 'O(1)',
        why: 'Usually one or two neighbours are close enough in y.',
        example: 'even-grid',
      },
      worst: {
        cost: '7 comparisons',
        why: 'A δ × 2δ box holds at most 8 points that are δ apart within each half.',
      },
      note: 'Any comparison-based algorithm needs Ω(n lg n): it can tell whether n numbers are distinct.',
    },
  ],
  practice: closestPractice(() => closestPair),
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as CPSettings),
  },
  examples: [
    sixteenPoints,
    acrossTheLine,
    evenGrid,
    repeatedPoint,
    bruteForce,
  ] as unknown as SavedExample[],
  preview: { example: 'across-the-line', level: 2, hide: ['call', 'counts'] },
};

/**
 * Driver protocol: "closest x1 y1 x2 y2 ..." with every point prints the smallest squared
 * distance between two of them, or "none" for fewer than two points.
 */
function codeScript(calls: OpCall[], settings: CPSettings) {
  const t = new Timeline(closestPair, settings, 1, calls);
  const input: string[] = [];
  const expected: string[] = [];
  for (const e of t.entries) {
    if (e.call[0] !== 'closest') continue;
    input.push(['closest', ...e.end.points.flatMap((p) => [p.x, p.y])].join(' '));
    expected.push(e.end.d2 === null ? 'none' : String(e.end.d2));
  }
  return { input, expected };
}

export default closestPair;
