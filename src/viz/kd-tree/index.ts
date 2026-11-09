import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import { writePoints, type Vec } from '../../layouts/plane';
import {
  clusteredPoints,
  collinearPoints,
  gridPoints,
  parsePointList,
  randomPoints,
} from '../_spatial/kit';
import cppSource from './code/cpp/kd_tree.hpp?raw';
import javaSource from './code/java/KdTree.java?raw';
import pythonSource from './code/python/kd_tree.py?raw';
import buildAndSplit from './examples/build-and-split.json';
import diagonal from './examples/diagonal-path.json';
import medianOrder from './examples/median-order.json';
import nearestAcross from './examples/nearest-across-a-line.json';
import nearestPrunes from './examples/nearest-prunes.json';
import noPruning from './examples/no-pruning.json';
import rangeSearch from './examples/range-search.json';
import explain from './explain.md?raw';
import {
  MAX,
  MOST,
  byId,
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  type KdExtra,
  type KdSettings,
  type KdState,
} from './model';
import { kdPractice } from './practice';
import { view } from './view';

/** Points "1,2 3,4", a count of random points, or one query point or two corners. */
export function parseInput(token: string): Value | Error {
  return parsePointList(token, MAX, MOST);
}

const fresh = (pts: Vec[]): OpCall[] => [['clear'], ['insert', writePoints(pts)]];

/** The points in the order that gives a balanced tree: the median on x, then on y, and so on. */
export function medianFirst(pts: Vec[], depth = 0): Vec[] {
  if (pts.length === 0) return [];
  const key = depth % 2 === 0 ? 'x' : 'y';
  const other = key === 'x' ? 'y' : 'x';
  const sorted = [...pts].sort((a, b) => a[key] - b[key] || a[other] - b[other]);
  // Equal coordinates go right, so take the first of a run of equal medians.
  let m = Math.floor(sorted.length / 2);
  while (m > 0 && sorted[m - 1]![key] === sorted[m]![key]) m--;
  return [
    sorted[m]!,
    ...medianFirst(sorted.slice(0, m), depth + 1),
    ...medianFirst(sorted.slice(m + 1), depth + 1),
  ];
}

export const kdTree: VizDef<KdState, KdSettings, KdExtra> = {
  id: 'kd-tree',
  title: 'k-d tree',
  family: 'Trees',
  blurb:
    'A binary search tree for points: each level splits the plane on x, then y. Insert, find the nearest neighbour with pruning, and search a rectangle.',
  settings: [
    {
      kind: 'boolean',
      key: 'prune',
      label: 'Prune in nearest-neighbour search',
      help: 'On: skip a subtree when the best circle does not cross its splitting line. Off: search every node, to see what pruning saves.',
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
      placeholder: 'e.g. 6,5 3,8 9,2; one point for Nearest; two corners for Range',
      maxLength: 160,
      sample: '6,5 3,8 9,2 2,3 8,9',
      parse: parseInput,
    },
    buttons: [
      { op: 'insert', label: 'Insert', usesInput: true, primary: true },
      { op: 'nearest', label: 'Nearest', usesInput: true },
      { op: 'range', label: 'Range search', usesInput: true },
      { op: 'clear', label: 'Clear', usesInput: false, more: true },
    ],
    random: {
      label: 'Random points',
      make: (rng) => fresh(randomPoints(rng, rng.int(6, 10), 0, MAX)),
    },
    presets: [
      { label: 'Random points', make: (rng, n) => fresh(randomPoints(rng, n, 0, MAX)) },
      {
        label: 'Medians first (balanced)',
        make: (rng, n) => fresh(medianFirst(randomPoints(rng, n, 0, MAX))),
      },
      {
        label: 'Sorted by x (lopsided)',
        make: (rng, n) =>
          fresh(randomPoints(rng, n, 0, MAX).sort((a, b) => a.x - b.x || a.y - b.y)),
      },
      {
        label: 'On a diagonal (worst case)',
        make: (rng, n) => fresh(collinearPoints(rng, n, 0, MAX).sort((a, b) => a.x - b.x)),
      },
      { label: 'A grid (many ties)', make: (rng, n) => fresh(gridPoints(rng, n, 1, 11)) },
      { label: 'Two clusters', make: (rng, n) => fresh(clusteredPoints(rng, n, 0, MAX)) },
    ],
    sizes: [7, 10, 14],
  },
  explain,
  complexity: [
    {
      op: 'insert(p)',
      best: { cost: 'O(1)', why: 'The first point becomes the root.', example: 'build-and-split' },
      average: {
        cost: 'O(lg n)',
        why: 'Random points give a tree of height about 2 lg n, as in a BST.',
        example: 'build-and-split',
      },
      worst: {
        cost: 'O(n)',
        why: 'Points sorted on both coordinates (a diagonal) all go right: the tree is a path.',
        example: 'diagonal-path',
      },
    },
    {
      op: 'nearest(q)',
      best: {
        cost: 'O(lg n)',
        why: 'One walk down, then every other subtree is pruned.',
        example: 'nearest-prunes',
      },
      average: {
        cost: 'O(lg n)',
        why: 'For random points, only a few subtrees near q are searched.',
        example: 'nearest-across-a-line',
      },
      worst: {
        cost: 'O(n)',
        why: 'If the circle keeps crossing lines (or pruning is off), every node is visited.',
        example: 'no-pruning',
      },
      note: 'In k dimensions pruning gets weaker: the worst case is O(k n^(1−1/k)) or worse.',
    },
    {
      op: 'range(R)',
      best: {
        cost: 'O(lg n)',
        why: 'A tiny rectangle follows about one path.',
        example: 'range-search',
      },
      average: {
        cost: 'O(√n + m)',
        why: 'On a balanced tree a rectangle’s edges cross O(√n) cells; m points are reported.',
        example: 'range-search',
      },
      worst: {
        cost: 'O(n)',
        why: 'A rectangle covering everything reports all n points; a path-shaped tree visits all.',
        example: 'diagonal-path',
      },
    },
    {
      op: 'build from n points',
      best: {
        cost: 'O(n lg n)',
        why: 'Insert medians first: each level needs a median split.',
        example: 'median-order',
      },
      average: { cost: 'O(n lg n)', why: 'n inserts of O(lg n) each in random order.' },
      worst: {
        cost: 'O(n²)',
        why: 'n inserts into a path, in sorted diagonal order.',
        example: 'diagonal-path',
      },
    },
  ],
  practice: kdPractice(() => kdTree),
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as KdSettings),
  },
  examples: [
    buildAndSplit,
    nearestPrunes,
    nearestAcross,
    rangeSearch,
    diagonal,
    noPruning,
    medianOrder,
  ] as unknown as SavedExample[],
  opening: 'build-and-split',
  preview: { example: 'build-and-split', level: 2 },
};

/**
 * Driver protocol: "insert x y" (prints nothing), "clear" (prints nothing), "nearest x y"
 * prints "x,y d2" for the nearest point and its squared distance (or "empty"), and
 * "range x1 y1 x2 y2" prints the points inside, sorted by x then y, as "x,y ..." (or "none").
 */
function codeScript(calls: OpCall[], settings: KdSettings) {
  const t = new Timeline(kdTree, settings, 1, calls);
  const input: string[] = [];
  const expected: string[] = [];
  let before = init();
  for (const e of t.entries) {
    const end = e.end;
    const op = e.call[0];
    if (op === 'clear') input.push('clear');
    if (op === 'insert') {
      const old = new Set(before.nodes.map((n) => n.id));
      for (const n of end.nodes) if (!old.has(n.id)) input.push(`insert ${n.x} ${n.y}`);
    }
    if (op === 'nearest' && end.query) {
      input.push(`nearest ${end.query.x} ${end.query.y}`);
      if (end.best === null) expected.push('empty');
      else {
        const b = byId(end, end.best);
        expected.push(`${b.x},${b.y} ${end.bestD2}`);
      }
    }
    if (op === 'range' && end.box) {
      const { lo, hi } = end.box;
      input.push(`range ${lo.x} ${lo.y} ${hi.x} ${hi.y}`);
      const pts = end.found.map((id) => byId(end, id)).sort((a, b) => a.x - b.x || a.y - b.y);
      expected.push(pts.length ? pts.map((p) => `${p.x},${p.y}`).join(' ') : 'none');
    }
    before = end;
  }
  return { input, expected };
}

export default kdTree;
