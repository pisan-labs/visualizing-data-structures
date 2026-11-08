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
} from '../_spatial/kit';
import cppSource from './code/cpp/delaunay.hpp?raw';
import javaSource from './code/java/Delaunay.java?raw';
import pythonSource from './code/python/delaunay.py?raw';
import addAPoint from './examples/add-a-point.json';
import circleCheck from './examples/empty-circle-check.json';
import cocircular from './examples/four-on-a-circle.json';
import collinear from './examples/collinear-start.json';
import tenPoints from './examples/ten-points.json';
import voronoi from './examples/voronoi-dual.json';
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
  triangleList,
  type DExtra,
  type DSettings,
  type DState,
} from './model';
import { delaunayPractice } from './practice';
import { view } from './view';

export function parseInput(token: string): Value | Error {
  return parsePointList(token, MAX, MOST);
}

const fresh = (pts: Vec[]): OpCall[] => [['clear'], ['insert', writePoints(pts)]];

export const delaunay: VizDef<DState, DSettings, DExtra> = {
  id: 'delaunay',
  title: 'Delaunay triangulation and Voronoi',
  family: 'Geometry',
  blurb:
    'Add points one at a time (Bowyer–Watson): remove every triangle whose circumcircle holds the new point, then fill the hole. The Voronoi diagram is its dual.',
  settings: [
    {
      kind: 'boolean',
      key: 'voronoi',
      label: 'Show the Voronoi diagram',
      help: 'Each Voronoi edge joins the circumcentres of two triangles that share an edge. Each cell holds the places closer to its point than to any other.',
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
      placeholder: 'e.g. 2,2 9,3 5,9 6,5, or 8 for random points',
      maxLength: 200,
      sample: '2,2 9,3 5,9 6,5',
      parse: parseInput,
    },
    buttons: [
      { op: 'insert', label: 'Insert', usesInput: true, primary: true },
      { op: 'check', label: 'Check empty circles', usesInput: false },
      { op: 'clear', label: 'Clear', usesInput: false, more: true },
    ],
    random: {
      label: 'Random points',
      make: (rng) => fresh(randomPoints(rng, rng.int(6, 10), 0, MAX)),
    },
    presets: [
      { label: 'Random points', make: (rng, n) => fresh(randomPoints(rng, n, 0, MAX)) },
      { label: 'A grid (cocircular fours)', make: (rng, n) => fresh(gridPoints(rng, n, 1, 11)) },
      { label: 'On one circle', make: (rng, n) => fresh(cocircularPoints(rng, n, 6, 6)) },
      { label: 'All on one line', make: (rng, n) => fresh(collinearPoints(rng, n, 0, MAX)) },
      { label: 'Two clusters', make: (rng, n) => fresh(clusteredPoints(rng, n, 0, MAX)) },
    ],
    sizes: [6, 10, 14],
  },
  explain,
  complexity: [
    {
      op: 'insert one point',
      best: {
        cost: 'O(1)',
        why: 'With a point-location structure, a point that spoils a few triangles costs a few steps.',
        example: 'add-a-point',
      },
      average: {
        cost: 'O(lg n)',
        why: 'In random order, each insert removes O(1) triangles on average; finding the first takes O(lg n).',
        example: 'ten-points',
      },
      worst: {
        cost: 'O(n)',
        why: 'A point can spoil almost every triangle, such as points added along a circle.',
        example: 'four-on-a-circle',
      },
      note: 'This page tests every triangle for each new point, O(n) per insert, so you can watch each test.',
    },
    {
      op: 'whole triangulation',
      best: {
        cost: 'O(n lg n)',
        why: 'Randomized incremental insertion, expected; divide and conquer matches it in the worst case.',
        example: 'ten-points',
      },
      average: { cost: 'O(n lg n)', why: 'Expected, with points added in random order.' },
      worst: {
        cost: 'O(n²)',
        why: 'A bad insertion order makes each insert rebuild a large part.',
        example: 'collinear-start',
      },
    },
    {
      op: 'size of the result',
      best: {
        cost: '2n − 2 − h triangles',
        why: 'For n points with h of them on the hull, never more.',
        example: 'empty-circle-check',
      },
      average: { cost: 'O(n)', why: 'About 3n edges and 2n triangles: planar graphs are sparse.' },
      worst: {
        cost: 'O(n)',
        why: 'The Voronoi diagram, its dual, also has O(n) vertices and edges.',
        example: 'voronoi-dual',
      },
    },
  ],
  practice: delaunayPractice(() => delaunay),
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as DSettings),
  },
  examples: [
    addAPoint,
    tenPoints,
    voronoi,
    circleCheck,
    cocircular,
    collinear,
  ] as unknown as SavedExample[],
  preview: { example: 'ten-points', level: 2, hide: ['counts', 'tri-', 'cc-'] },
};

/**
 * Driver protocol: after each insert, "delaunay x1 y1 x2 y2 ..." with every point so far, in
 * insertion order. It prints the triangles, each as its corners sorted by x then y, the
 * triangles sorted as text and joined by " | ", or "none".
 */
function codeScript(calls: OpCall[], settings: DSettings) {
  const t = new Timeline(delaunay, settings, 1, calls);
  const input: string[] = [];
  const expected: string[] = [];
  for (const e of t.entries) {
    if (e.call[0] !== 'insert' || e.end.points.length === 0) continue;
    input.push(['delaunay', ...e.end.points.flatMap((p) => [p.x, p.y])].join(' '));
    const list = triangleList(e.end);
    expected.push(list.length ? list.join(' | ') : 'none');
  }
  return { input, expected };
}

export default delaunay;
