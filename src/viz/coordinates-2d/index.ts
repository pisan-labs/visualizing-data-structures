import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import cppSource from './code/cpp/frame.hpp?raw';
import javaSource from './code/java/Frame.java?raw';
import pythonSource from './code/python/frames.py?raw';
import homogeneous from './examples/homogeneous.json';
import movingTheFrame from './examples/moving-the-frame.json';
import parallelAxes from './examples/parallel-axes.json';
import skewedFrame from './examples/skewed-frame.json';
import stretchedAxes from './examples/stretched-axes.json';
import translateOnly from './examples/translate-only.json';
import turnedFrame from './examples/turned-frame.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  fixed2,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  type CoordExtra,
  type CoordSettings,
  type CoordState,
} from './model';
import { coordinatesPractice } from './practice';
import { view } from './view';

/** A number with at most one decimal place: a coordinate, an angle or an axis component. */
export function parseCoordinate(token: string): Value | Error {
  const t = token.trim();
  if (!t) return new Error('Type a number first.');
  if (!/^-?\d+(\.\d)?$/.test(t))
    return new Error('Use numbers with at most one decimal place, such as 3 or -1.5.');
  const x = Number(t);
  if (Math.abs(x) > 360) return new Error('Keep numbers from -360 to 360.');
  return x;
}

export const coordinates2d: VizDef<CoordState, CoordSettings, CoordExtra> = {
  id: 'coordinates-2d',
  title: '2D change of coordinates',
  family: 'Geometry',
  blurb:
    'One point, two frames: convert between world coordinates and a frame with its own origin and axes, with the matrix and both grids drawn.',
  settings: [
    {
      kind: 'choice',
      key: 'form',
      label: 'Matrix form',
      options: [
        { value: 'affine', label: '2×2 matrix plus the origin: p = o + M q' },
        { value: 'homogeneous', label: 'One 3×3 matrix on (x, y, 1)' },
      ],
      help: 'The same arithmetic. Graphics code uses the 3×3 form, so a whole chain of frames multiplies into one matrix.',
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
      label: 'Numbers',
      placeholder: 'e.g. 5 4',
      maxLength: 60,
      sample: '2',
      parse: parseCoordinate,
    },
    buttons: [
      { op: 'toLocal', label: 'World to B', usesInput: true, primary: true, args: ['x', 'y'] },
      { op: 'toWorld', label: 'B to world', usesInput: true, args: ['a', 'b'] },
      { op: 'origin', label: 'Move origin', usesInput: true, args: ['x', 'y'] },
      { op: 'angle', label: 'Turn axes (degrees)', usesInput: true },
      {
        op: 'axes',
        label: 'Set axes',
        usesInput: true,
        args: ['u.x', 'u.y', 'v.x', 'v.y'],
        more: true,
      },
    ],
    random: {
      label: 'Random point',
      make: (rng) => [['toLocal', rng.int(-6, 6), rng.int(-6, 6)]],
    },
    // The size picked next to a preset is an angle in degrees.
    presets: [
      {
        label: 'Turn B, then convert a point',
        make: (rng, deg) => [
          ['origin', rng.int(-3, 3), rng.int(-3, 3)],
          ['angle', deg],
          ['toLocal', rng.int(-6, 6), rng.int(-6, 6)],
        ],
      },
      {
        label: 'Turn B, then go back to the world',
        make: (rng, deg) => [
          ['origin', rng.int(-3, 3), rng.int(-3, 3)],
          ['angle', deg],
          ['toWorld', rng.int(-4, 4), rng.int(-4, 4)],
        ],
      },
      {
        label: 'A skewed frame',
        make: (rng) => [
          ['origin', 0, 0],
          ['axes', 1, 0, 1, 1],
          ['toLocal', rng.int(-5, 5), rng.int(-5, 5)],
        ],
      },
      {
        label: 'Only a translation',
        make: (rng) => [
          ['angle', 0],
          ['origin', rng.int(-4, 4), rng.int(-4, 4)],
          ['toLocal', rng.int(-6, 6), rng.int(-6, 6)],
        ],
      },
    ],
    sizes: [30, 45, 90],
  },
  explain,
  complexity: [
    {
      op: 'B to world: o + M q',
      best: {
        cost: 'O(1)',
        why: 'Four multiplications and four additions.',
        example: 'translate-only',
      },
      average: {
        cost: 'O(1)',
        why: 'The same eight operations for any frame.',
        example: 'homogeneous',
      },
      worst: {
        cost: 'O(1)',
        why: 'A skewed frame costs the same as a turned one.',
        example: 'stretched-axes',
      },
    },
    {
      op: 'world to B: M⁻¹ (p − o)',
      best: {
        cost: 'O(1)',
        why: 'For perpendicular unit axes, M⁻¹ = Mᵀ: two dot products.',
        example: 'turned-frame',
      },
      average: {
        cost: 'O(1)',
        why: 'det M once, then four multiplications and two divisions.',
        example: 'skewed-frame',
      },
      worst: {
        cost: 'no answer',
        why: 'When det M = 0 there is no inverse: the axes do not span the plane.',
        example: 'parallel-axes',
      },
    },
    {
      op: 'converting n points',
      best: { cost: 'O(n)', why: 'Invert M once, then O(1) per point.' },
      average: { cost: 'O(n)', why: 'Each point is independent of the others.' },
      worst: {
        cost: 'O(n)',
        why: 'Inverting M again for every point is wasteful, but still O(1) each.',
      },
    },
    {
      op: 'a chain of k frames',
      best: {
        cost: 'O(k)',
        why: 'Multiply the k 3×3 matrices once; each point then costs O(1).',
        example: 'homogeneous',
      },
      average: { cost: 'O(k)', why: 'Each 3×3 product is a fixed 27 multiplications.' },
      worst: {
        cost: 'O(k + n)',
        why: 'With n points: compose once, apply n times, rather than O(kn).',
      },
    },
  ],
  practice: coordinatesPractice(() => coordinates2d),
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as CoordSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    turnedFrame,
    translateOnly,
    skewedFrame,
    stretchedAxes,
    parallelAxes,
    homogeneous,
    movingTheFrame,
  ] as unknown as SavedExample[],
};

/**
 * Driver protocol for the code tabs: "frame ox oy ux uy vx vy" (the model's exact numbers),
 * then "local x y" or "world a b", which print the converted point to two decimals
 * (rounded half up). Frame changes and rejected calls print nothing.
 */
function codeScript(calls: OpCall[], settings: CoordSettings) {
  const t = new Timeline(coordinates2d, settings, 1, calls);
  const input: string[] = [];
  const expected: string[] = [];
  let prev = t.initial.state;
  for (const e of t.entries) {
    const s = e.end;
    const changed = s !== prev;
    prev = s;
    const op = e.call[0];
    if (!changed || (op !== 'toLocal' && op !== 'toWorld')) continue;
    input.push(['frame', s.o.x, s.o.y, s.u.x, s.u.y, s.v.x, s.v.y].map(String).join(' '));
    if (op === 'toLocal') {
      input.push(`local ${s.p!.x} ${s.p!.y}`);
      expected.push(`${fixed2(s.local!.x)} ${fixed2(s.local!.y)}`);
    } else {
      input.push(`world ${s.local!.x} ${s.local!.y}`);
      expected.push(`${fixed2(s.p!.x)} ${fixed2(s.p!.y)}`);
    }
  }
  return { input, expected };
}

export default coordinates2d;
