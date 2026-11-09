import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import { writePoints, type Vec } from '../../layouts/plane';
import {
  clusteredPoints,
  collinearPoints,
  gridPoints,
  parsePointList,
  randomPoints,
  shuffled,
} from '../_spatial/kit';
import cppSource from './code/cpp/quadtree.hpp?raw';
import javaSource from './code/java/QuadTree.java?raw';
import pythonSource from './code/python/quadtree.py?raw';
import bucketsOfThree from './examples/buckets-of-three.json';
import closePair from './examples/close-pair-goes-deep.json';
import clusters from './examples/clusters.json';
import rangeQuery from './examples/range-query.json';
import splitOnOverflow from './examples/split-on-overflow.json';
import explain from './explain.md?raw';
import {
  MAX,
  MOST,
  defaults,
  describe,
  heightOf,
  init,
  initialSay,
  initialVars,
  ops,
  point,
  pseudocode,
  type QExtra,
  type QSettings,
  type QState,
} from './model';
import { quadPractice } from './practice';
import { view } from './view';

/** Points "1,2 3,4", a count of random points, or two corners for a query. */
export function parseInput(token: string): Value | Error {
  return parsePointList(token, MAX, MOST);
}

const fresh = (pts: Vec[]): OpCall[] => [['clear'], ['insert', writePoints(pts)]];

export const quadtree: VizDef<QState, QSettings, QExtra> = {
  id: 'quadtree',
  title: 'Quadtree',
  family: 'Trees',
  blurb:
    'Split a square into four whenever it holds too many points: a 4-way tree for points in the plane, with range queries that skip whole squares.',
  settings: [
    {
      kind: 'number',
      key: 'capacity',
      label: 'Leaf capacity (bucket size)',
      min: 1,
      max: 3,
      help: 'How many points a leaf holds before it splits into four. 1 is the classic point-region quadtree; bigger buckets give a shallower tree.',
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
      placeholder: 'e.g. 3,12 12,13 6,5 (0 to 15); two corners for Range query',
      maxLength: 160,
      sample: '3,12 12,13 6,5 13,3',
      parse: parseInput,
    },
    buttons: [
      { op: 'insert', label: 'Insert', usesInput: true, primary: true },
      { op: 'query', label: 'Range query', usesInput: true },
      { op: 'clear', label: 'Clear', usesInput: false, more: true },
    ],
    random: {
      label: 'Random points',
      make: (rng) => fresh(randomPoints(rng, rng.int(6, 10), 0, MAX)),
    },
    presets: [
      { label: 'Random points', make: (rng, n) => fresh(randomPoints(rng, n, 0, MAX)) },
      { label: 'Spread on a grid (shallow)', make: (rng, n) => fresh(gridPoints(rng, n, 1, 14)) },
      { label: 'Two clusters (deep)', make: (rng, n) => fresh(clusteredPoints(rng, n, 0, MAX)) },
      { label: 'On a diagonal', make: (rng, n) => fresh(collinearPoints(rng, n, 0, MAX)) },
      {
        label: 'Neighbours one apart (worst case)',
        make: (rng, n) =>
          fresh(
            shuffled(
              rng,
              Array.from({ length: Math.min(n, 8) }, (_, i) => ({
                x: 7 + (i % 2),
                y: 4 + Math.floor(i / 2),
              })),
            ),
          ),
      },
    ],
    sizes: [6, 10, 14],
  },
  explain,
  complexity: [
    {
      op: 'insert(p)',
      best: {
        cost: 'O(1)',
        why: 'The leaf p falls into has room: no split.',
        example: 'split-on-overflow',
      },
      average: {
        cost: 'O(d)',
        why: 'Walk down d levels; d is about log₄ n for evenly spread points.',
        example: 'split-on-overflow',
      },
      worst: {
        cost: 'O(lg(s/δ))',
        why: 'Two points δ apart in a square of side s keep splitting until they part.',
        example: 'close-pair-goes-deep',
      },
      note: 'The depth depends on how close points are, not on how many there are.',
    },
    {
      op: 'range query',
      best: {
        cost: 'O(d)',
        why: 'A small rectangle overlaps one square per level.',
        example: 'range-query',
      },
      average: {
        cost: 'O(√n + m)',
        why: 'For spread-out points, the rectangle’s edges cross about √n leaves; m are reported.',
        example: 'range-query',
      },
      worst: {
        cost: 'O(n)',
        why: 'A rectangle covering everything visits every node.',
        example: 'clusters',
      },
    },
    {
      op: 'size of the tree',
      best: {
        cost: 'O(n)',
        why: 'Spread-out points: each split separates them.',
        example: 'buckets-of-three',
      },
      average: { cost: 'O(n)', why: 'About n / capacity leaves for random points.' },
      worst: {
        cost: 'O(n · lg(s/δ))',
        why: 'Close pairs leave chains of splits with three empty leaves each.',
        example: 'close-pair-goes-deep',
      },
    },
  ],
  practice: quadPractice(() => quadtree),
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as QSettings),
  },
  examples: [
    splitOnOverflow,
    bucketsOfThree,
    closePair,
    rangeQuery,
    clusters,
  ] as unknown as SavedExample[],
  opening: 'split-on-overflow',
  preview: { example: 'split-on-overflow', level: 2 },
};

/**
 * Driver protocol: "capacity c" first, then "insert x y" and "clear" (print nothing), "stats"
 * after each insert (prints "nodes=N height=H"), and "query x1 y1 x2 y2" (prints the points
 * inside, sorted by x then y, or "none").
 */
function codeScript(calls: OpCall[], settings: QSettings) {
  const t = new Timeline(quadtree, settings, 1, calls);
  const input: string[] = [`capacity ${settings.capacity}`];
  const expected: string[] = [];
  let before = init();
  for (const e of t.entries) {
    const end = e.end;
    const op = e.call[0];
    if (op === 'clear') input.push('clear');
    if (op === 'insert') {
      const old = new Set(before.points.map((p) => p.id));
      for (const p of end.points) if (!old.has(p.id)) input.push(`insert ${p.x} ${p.y}`);
      input.push('stats');
      expected.push(`nodes=${end.nodes.length} height=${heightOf(end)}`);
    }
    if (op === 'query' && end.box) {
      const { lo, hi } = end.box;
      input.push(`query ${lo.x} ${lo.y} ${hi.x} ${hi.y}`);
      const pts = end.found.map((id) => point(end, id)).sort((a, b) => a.x - b.x || a.y - b.y);
      expected.push(pts.length ? pts.map((p) => `${p.x},${p.y}`).join(' ') : 'none');
    }
    before = end;
  }
  return { input, expected };
}

export default quadtree;
