import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import { readPoints, writePoints, type Vec } from '../../layouts/plane';
import cppSource from './code/cpp/polygon.hpp?raw';
import javaSource from './code/java/Polygon.java?raw';
import pythonSource from './code/python/polygon.py?raw';
import clockwise from './examples/clockwise.json';
import lShape from './examples/l-shape.json';
import onTheBoundary from './examples/on-the-boundary.json';
import outsideTheDent from './examples/outside-the-dent.json';
import rayThroughVertex from './examples/ray-through-vertex.json';
import rectangleArea from './examples/rectangle-area.json';
import starEvenOdd from './examples/star-even-odd.json';
import starWinding from './examples/star-winding.json';
import explain from './explain.md?raw';
import {
  MAX,
  MOST,
  defaults,
  describe,
  half,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  randomPolygon,
  type PolyExtra,
  type PolySettings,
  type PolyState,
} from './model';
import { polygonPractice } from './practice';
import { view } from './view';

/**
 * One box serves every button: a list of vertices "1,1 5,1 3,4" for Load polygon, a count for
 * a random polygon, and two numbers "4 5" (or "4,5") for the point that Inside? tests.
 */
export function parsePolygonInput(token: string): Value | Error {
  const t = token.trim();
  if (/^-?\d+$/.test(t)) {
    const n = Number(t);
    if (n < 0 || n > MAX) return new Error(`Use whole numbers from 0 to ${MAX}.`);
    return n;
  }
  const pts = readPoints(t, 0, MAX, MOST);
  if (typeof pts === 'string') return new Error(pts);
  return writePoints(pts);
}

const shape = (pts: number[][]): Vec[] => pts.map(([x, y]) => ({ x: x!, y: y! }));
const L_SHAPE = shape([
  [2, 2],
  [10, 2],
  [10, 5],
  [5, 5],
  [5, 10],
  [2, 10],
]);
const STAR = shape([
  [6, 11],
  [9, 2],
  [1, 7],
  [11, 7],
  [3, 2],
]);
/** Lattice points on the circle of radius 5 around (6, 6), counter-clockwise. */
const CIRCLE = shape([
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
]);

export function convexPolygon(n: number, offset = 0): Vec[] {
  const k = Math.max(3, Math.min(n, CIRCLE.length));
  return Array.from({ length: k }, (_, i) => CIRCLE[(Math.floor((i * 12) / k) + offset) % 12]!);
}

const loadThen = (pts: Vec[], ...more: OpCall[]): OpCall[] => [['load', writePoints(pts)], ...more];

export const polygon: VizDef<PolyState, PolySettings, PolyExtra> = {
  id: 'polygon',
  title: 'Polygon algorithms',
  family: 'Geometry',
  blurb:
    'Area by the shoelace formula, inside or outside by ray casting or the winding number, convex or not, clockwise or not.',
  settings: [
    {
      kind: 'choice',
      key: 'inside',
      label: 'Inside test',
      options: [
        { value: 'ray', label: 'Ray casting (even-odd rule)' },
        { value: 'winding', label: 'Winding number (nonzero rule)' },
      ],
      help: 'They agree for simple polygons. When edges cross, a region wrapped twice is outside by even-odd and inside by winding.',
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
      label: 'Vertices or point',
      placeholder: 'e.g. 1,1 9,1 5,8 to load; 4 5 to test',
      maxLength: 200,
      sample: '5',
      parse: parsePolygonInput,
    },
    buttons: [
      { op: 'load', label: 'Load polygon', usesInput: true, primary: true },
      { op: 'area', label: 'Area', usesInput: false },
      { op: 'inside', label: 'Inside?', usesInput: true, args: ['x', 'y'] },
      { op: 'convex', label: 'Convex?', usesInput: false, more: true },
      { op: 'orientation', label: 'Orientation', usesInput: false },
    ],
    random: {
      label: 'Random polygon',
      make: (rng) => loadThen(randomPolygon(rng, rng.int(5, 9)), ['area']),
    },
    presets: [
      {
        label: 'Random star-shaped polygon',
        make: (rng, n) => loadThen(randomPolygon(rng, n), ['area']),
      },
      { label: 'Convex polygon', make: (_rng, n) => loadThen(convexPolygon(n), ['convex']) },
      {
        label: 'Convex polygon, clockwise',
        make: (_rng, n) => loadThen([...convexPolygon(n)].reverse(), ['orientation']),
      },
      {
        label: 'An L-shape and a point in its dent',
        make: () => loadThen(L_SHAPE, ['convex'], ['inside', 7, 8]),
      },
      {
        label: 'A five-pointed star (edges cross)',
        make: () => loadThen(STAR, ['convex'], ['inside', 6, 6]),
      },
    ],
    sizes: [5, 8, 12],
  },
  explain,
  complexity: [
    {
      op: 'area (shoelace)',
      best: {
        cost: 'O(n)',
        why: 'One term per edge, even for a triangle.',
        example: 'rectangle-area',
      },
      average: { cost: 'O(n)', why: 'Two multiplications and a subtraction per edge.' },
      worst: {
        cost: 'O(n)',
        why: 'Still one pass, whatever the shape.',
        example: 'l-shape',
      },
    },
    {
      op: 'point in polygon',
      best: {
        cost: 'O(1)',
        why: 'q on the first edge ends the test at once.',
        example: 'on-the-boundary',
      },
      average: {
        cost: 'O(n)',
        why: 'Every edge has to be checked against the ray.',
        example: 'outside-the-dent',
      },
      worst: { cost: 'O(n)', why: 'One pass over the edges.', example: 'ray-through-vertex' },
      note: 'For a convex polygon, binary search on the angle answers in O(lg n).',
    },
    {
      op: 'convex?',
      best: {
        cost: 'O(1)',
        why: 'A dent at the second vertex ends the test early.',
        example: 'l-shape',
      },
      average: { cost: 'O(n)', why: 'One turn test per vertex.' },
      worst: {
        cost: 'O(n)',
        why: 'A convex polygon, or a star, needs every turn.',
        example: 'star-even-odd',
      },
    },
    {
      op: 'orientation',
      best: { cost: 'O(n)', why: 'Finding the lowest vertex looks at all of them.' },
      average: { cost: 'O(n)', why: 'One pass, then one turn test.', example: 'clockwise' },
      worst: {
        cost: 'O(n)',
        why: 'Same pass; the shoelace sign would also take O(n).',
        example: 'clockwise',
      },
    },
  ],
  practice: polygonPractice(() => polygon, convexPolygon),
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as PolySettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    rectangleArea,
    lShape,
    clockwise,
    rayThroughVertex,
    onTheBoundary,
    outsideTheDent,
    starEvenOdd,
    starWinding,
  ] as unknown as SavedExample[],
  preview: { example: 'star-winding', level: 2 },
};

/**
 * Driver protocol for the code tabs: "area", "orient" and "convex" followed by the vertices,
 * and "inside qx qy" (ray casting) or "winding qx qy" followed by the vertices. They print the
 * area (with .5 when it has a half), ccw | cw | degenerate, yes | no, and
 * inside | outside | boundary. Loading and rejected calls print nothing.
 */
function codeScript(calls: OpCall[], settings: PolySettings) {
  const t = new Timeline(polygon, settings, 1, calls);
  const input: string[] = [];
  const expected: string[] = [];
  let prev = t.initial.state;
  for (const e of t.entries) {
    const r = e.end.result;
    const changed = e.end !== prev;
    prev = e.end;
    if (!r || !changed) continue;
    const pts = e.end.verts.flatMap((p) => [p.x, p.y]).join(' ');
    if (r.kind === 'area') {
      input.push(`area ${pts}`);
      expected.push(half(r.sum));
    } else if (r.kind === 'orient') {
      input.push(`orient ${pts}`);
      expected.push(r.turn > 0 ? 'ccw' : r.turn < 0 ? 'cw' : 'degenerate');
    } else if (r.kind === 'convex') {
      input.push(`convex ${pts}`);
      expected.push(r.convex ? 'yes' : 'no');
    } else {
      const q = e.end.query!;
      input.push(`${settings.inside === 'ray' ? 'inside' : 'winding'} ${q.x} ${q.y} ${pts}`);
      expected.push(r.where);
    }
  }
  return { input, expected };
}

export default polygon;
