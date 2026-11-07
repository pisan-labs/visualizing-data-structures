import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import cppSource from './code/cpp/frame3d.hpp?raw';
import javaSource from './code/java/Frame3d.java?raw';
import pythonSource from './code/python/frames3d.py?raw';
import flatAxes from './examples/flat-axes.json';
import homogeneous from './examples/homogeneous.json';
import leftHanded from './examples/left-handed.json';
import movingTheFrame from './examples/moving-the-frame.json';
import obliqueView from './examples/oblique-view.json';
import skewedFrame from './examples/skewed-frame.json';
import tiltedFrame from './examples/tilted-frame.json';
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
  type Coord3Extra,
  type Coord3Settings,
  type Coord3State,
} from './model';
import { coordinates3dPractice } from './practice';
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

export const coordinates3d: VizDef<Coord3State, Coord3Settings, Coord3Extra> = {
  id: 'coordinates-3d',
  title: '3D change of coordinates',
  family: 'Geometry',
  blurb:
    'One point, two frames in space: convert between world coordinates and a frame with its own origin and three axes, and see when the inverse is just the transpose.',
  settings: [
    {
      kind: 'choice',
      key: 'form',
      label: 'Matrix form',
      options: [
        { value: 'affine', label: '3×3 matrix plus the origin: p = o + M q' },
        { value: 'homogeneous', label: 'One 4×4 matrix on (x, y, z, 1)' },
      ],
      help: 'The same arithmetic. Graphics code uses the 4×4 form, so a chain of frames multiplies into one matrix.',
    },
    {
      kind: 'choice',
      key: 'projection',
      label: 'Drawn with',
      options: [
        { value: 'isometric', label: 'An isometric view (from the corner (1, 1, 1))' },
        { value: 'oblique', label: 'An oblique view (x right, z up, y into the page)' },
      ],
      help: 'Only the drawing changes; the numbers are the same.',
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
      placeholder: 'e.g. 3 2 1',
      maxLength: 80,
      sample: '2',
      parse: parseCoordinate,
    },
    buttons: [
      {
        op: 'toLocal',
        label: 'World to B',
        usesInput: true,
        primary: true,
        args: ['x', 'y', 'z'],
      },
      { op: 'toWorld', label: 'B to world', usesInput: true, args: ['a', 'b', 'c'] },
      { op: 'origin', label: 'Move origin', usesInput: true, args: ['x', 'y', 'z'] },
      {
        op: 'turn',
        label: 'Turn axes (degrees)',
        usesInput: true,
        args: ['about z', 'tilt about x'],
      },
      {
        op: 'axes',
        label: 'Set axes',
        usesInput: true,
        args: ['u.x', 'u.y', 'u.z', 'v.x', 'v.y', 'v.z', 'w.x', 'w.y', 'w.z'],
        more: true,
      },
    ],
    random: {
      label: 'Random point',
      make: (rng) => [['toLocal', rng.int(-3, 3), rng.int(-3, 3), rng.int(-3, 3)]],
    },
    // The size picked next to a preset is an angle in degrees.
    presets: [
      {
        label: 'Turn B, then convert a point',
        make: (rng, deg) => [
          ['origin', rng.int(-2, 2), rng.int(-2, 2), rng.int(0, 2)],
          ['turn', deg, 0],
          ['toLocal', rng.int(-3, 3), rng.int(-3, 3), rng.int(-3, 3)],
        ],
      },
      {
        label: 'Tilt B, then go back to the world',
        make: (rng, deg) => [
          ['turn', deg, deg],
          ['toWorld', rng.int(-2, 2), rng.int(-2, 2), rng.int(-2, 2)],
        ],
      },
      {
        label: 'A skewed frame',
        make: (rng) => [
          ['origin', 0, 0, 0],
          ['axes', 1, 0, 0, 1, 1, 0, 0, 0, 1],
          ['toLocal', rng.int(-3, 3), rng.int(-3, 3), rng.int(-3, 3)],
        ],
      },
      {
        label: 'Only a translation',
        make: (rng) => [
          ['turn', 0, 0],
          ['origin', rng.int(-3, 3), rng.int(-3, 3), rng.int(-3, 3)],
          ['toLocal', rng.int(-3, 3), rng.int(-3, 3), rng.int(-3, 3)],
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
        why: 'Nine multiplications and nine additions.',
        example: 'translate-only',
      },
      average: {
        cost: 'O(1)',
        why: 'The same eighteen operations for any frame.',
        example: 'tilted-frame',
      },
      worst: {
        cost: 'O(1)',
        why: 'A skewed frame costs the same as a turned one.',
        example: 'homogeneous',
      },
    },
    {
      op: 'world to B: M⁻¹ (p − o)',
      best: {
        cost: 'O(1)',
        why: 'For perpendicular unit axes, M⁻¹ = Mᵀ: three dot products, no division.',
        example: 'turned-frame',
      },
      average: {
        cost: 'O(1)',
        why: 'Three cross products, a determinant and three divisions: about 33 operations.',
        example: 'skewed-frame',
      },
      worst: {
        cost: 'no answer',
        why: 'When det M = 0 there is no inverse: the axes do not span space.',
        example: 'flat-axes',
      },
    },
    {
      op: 'converting n points',
      best: { cost: 'O(n)', why: 'Invert M once, then 9 multiplications per point.' },
      average: {
        cost: 'O(n)',
        why: 'Each point is independent of the others.',
        example: 'moving-the-frame',
      },
      worst: {
        cost: 'O(n)',
        why: 'Inverting M again for every point is wasteful, but still O(1) each.',
      },
    },
    {
      op: 'a chain of k frames',
      best: {
        cost: 'O(k)',
        why: 'Multiply the k 4×4 matrices once; each point then costs O(1).',
        example: 'homogeneous',
      },
      average: { cost: 'O(k)', why: 'Each 4×4 product is a fixed 64 multiplications.' },
      worst: {
        cost: 'O(k + n)',
        why: 'With n points: compose once, apply n times, rather than O(kn).',
      },
    },
  ],
  practice: coordinates3dPractice(() => coordinates3d),
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as Coord3Settings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    turnedFrame,
    translateOnly,
    tiltedFrame,
    skewedFrame,
    flatAxes,
    homogeneous,
    movingTheFrame,
    leftHanded,
    obliqueView,
  ] as unknown as SavedExample[],
  preview: { example: 'moving-the-frame', level: 3, hide: ['m-', 'mi-'] },
};

/**
 * Driver protocol for the code tabs: "frame ox oy oz ux uy uz vx vy vz wx wy wz" (the model's
 * exact numbers), then "local x y z" or "world a b c", which print the converted point to two
 * decimals (rounded half up). Frame changes and refused calls print nothing.
 */
function codeScript(calls: OpCall[], settings: Coord3Settings) {
  const t = new Timeline(coordinates3d, settings, 1, calls);
  const input: string[] = [];
  const expected: string[] = [];
  const three = (p: { x: number; y: number; z: number }) => [p.x, p.y, p.z];
  let prev = t.initial.state;
  for (const e of t.entries) {
    const s = e.end;
    const changed = s !== prev;
    prev = s;
    const op = e.call[0];
    if (!changed || (op !== 'toLocal' && op !== 'toWorld')) continue;
    input.push(['frame', ...[s.o, s.u, s.v, s.w].flatMap(three)].map(String).join(' '));
    const [from, to] = op === 'toLocal' ? [s.p!, s.local!] : [s.local!, s.p!];
    input.push(`${op === 'toLocal' ? 'local' : 'world'} ${three(from).join(' ')}`);
    expected.push(three(to).map(fixed2).join(' '));
  }
  return { input, expected };
}

export default coordinates3d;
