import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import type { Vec3 } from '../../layouts/space';
import cppSource from './code/cpp/transform3d.hpp?raw';
import javaSource from './code/java/Transform3d.java?raw';
import pythonSource from './code/python/transform3d.py?raw';
import flatten from './examples/flatten.json';
import halfTurns from './examples/half-turns.json';
import mirror from './examples/mirror.json';
import obliqueView from './examples/oblique-view.json';
import orderMatters from './examples/order-matters.json';
import quarterTurn from './examples/quarter-turn.json';
import rowVectors from './examples/row-vectors.json';
import stretch from './examples/stretch.json';
import tooBig from './examples/too-big.json';
import tumblingWedge from './examples/tumbling-wedge.json';
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
  type Rs3Extra,
  type Rs3Settings,
  type RsState,
} from './model';
import { rotateScale3dPractice } from './practice';
import { view } from './view';

/** An angle or a scale factor: a number with at most one decimal place. */
export function parseNumber(token: string): Value | Error {
  const t = token.trim();
  if (!t) return new Error('Type a number first.');
  if (!/^-?\d+(\.\d)?$/.test(t))
    return new Error('Use numbers with at most one decimal place, such as 90 or 1.5.');
  const x = Number(t);
  if (Math.abs(x) > 360) return new Error('Keep numbers from -360 to 360.');
  return x;
}

export const rotateScale3d: VizDef<RsState, Rs3Settings, Rs3Extra> = {
  id: 'rotate-scale-3d',
  title: '3D rotation and scale',
  family: 'Geometry',
  blurb:
    'Turn a cube about x, y and z and stretch it with 3×3 matrices, watch where the basis vectors go, and see why two rotations in 3D do not commute.',
  settings: [
    {
      kind: 'choice',
      key: 'projection',
      label: 'Drawn with',
      options: [
        { value: 'isometric', label: 'An isometric view (from the corner (1, 1, 1))' },
        { value: 'oblique', label: 'An oblique view (x right, z up, y into the page)' },
      ],
      help: 'Only the drawing changes. Both are fixed parallel projections: no perspective, so parallel edges stay parallel.',
    },
    {
      kind: 'choice',
      key: 'convention',
      label: 'Vectors are',
      options: [
        { value: 'column', label: "Columns: p' = M p (math books, OpenGL)" },
        { value: 'row', label: "Rows: p' = p M (DirectX)" },
      ],
      help: 'The same transformation. Row vectors write every matrix transposed and composition in the opposite order.',
    },
    {
      kind: 'choice',
      key: 'shape',
      label: 'Shape',
      options: [
        { value: 'cube', label: 'A cube' },
        { value: 'wedge', label: 'A wedge' },
      ],
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
      placeholder: 'e.g. 90, or 1 1 2',
      maxLength: 60,
      sample: '2',
      parse: parseNumber,
    },
    buttons: [
      { op: 'rotateX', label: 'Rotate about x', usesInput: true, primary: true },
      { op: 'rotateY', label: 'Rotate about y', usesInput: true },
      { op: 'rotateZ', label: 'Rotate about z', usesInput: true },
      { op: 'scale', label: 'Scale', usesInput: true, args: ['sx', 'sy', 'sz'] },
      { op: 'order', label: 'Compare orders (x, y)', usesInput: true, more: true },
      { op: 'reset', label: 'Reset', usesInput: false, more: true },
    ],
    random: {
      label: 'Random rotation',
      make: (rng) => [
        [(['rotateX', 'rotateY', 'rotateZ'] as const)[rng.int(0, 2)]!, rng.int(-12, 12) * 15],
      ],
    },
    // The size picked next to a preset is an angle in degrees.
    presets: [
      { label: 'Rotate about z by the angle', make: (_rng, deg) => [['rotateZ', deg]] },
      {
        label: 'About x, then about y',
        make: (_rng, deg) => [
          ['rotateX', deg],
          ['rotateY', deg],
        ],
      },
      { label: 'Compare both orders', make: (_rng, deg) => [['order', deg]] },
      {
        label: 'Rotate, then stretch z by 1.5',
        make: (_rng, deg) => [
          ['rotateX', deg],
          ['scale', 1, 1, 1.5],
        ],
      },
      {
        label: 'Random rotations',
        make: (rng) =>
          Array.from({ length: 3 }, (): OpCall => [
            (['rotateX', 'rotateY', 'rotateZ'] as const)[rng.int(0, 2)]!,
            rng.int(-6, 6) * 15,
          ]),
      },
    ],
    sizes: [30, 45, 90],
  },
  explain,
  complexity: [
    {
      op: 'rotate a shape of n vertices',
      best: {
        cost: 'O(n)',
        why: 'One cos and one sin, then a 3×3 product per vertex.',
        example: 'quarter-turn',
      },
      average: {
        cost: 'O(n)',
        why: '9 multiplications per vertex with the full matrix (4 if you skip the zeros).',
        example: 'tumbling-wedge',
      },
      worst: {
        cost: 'O(n)',
        why: 'Any axis and any angle cost the same; a refused move still checks every vertex.',
        example: 'too-big',
      },
    },
    {
      op: 'scale a shape of n vertices',
      best: {
        cost: 'O(n)',
        why: 'S is diagonal: 3 multiplications per vertex if you use that.',
        example: 'stretch',
      },
      average: { cost: 'O(n)', why: 'Uniform or not, the same work.', example: 'mirror' },
      worst: {
        cost: 'O(n)',
        why: 'Squashing to zero costs the same, but cannot be undone.',
        example: 'flatten',
      },
    },
    {
      op: 'composing two 3×3 matrices',
      best: {
        cost: 'O(1)',
        why: '27 multiplications and 18 additions.',
        example: 'half-turns',
      },
      average: { cost: 'O(1)', why: 'The size of the matrix is fixed.', example: 'row-vectors' },
      worst: {
        cost: 'O(1)',
        why: 'Fixed cost, but the order of the factors changes the answer.',
        example: 'order-matters',
      },
    },
    {
      op: 'k transforms on n vertices',
      best: {
        cost: 'O(k + n)',
        why: 'Multiply the k matrices into one M, then apply M once per vertex.',
        example: 'oblique-view',
      },
      average: { cost: 'O(k + n)', why: 'This is why graphics code keeps one running matrix.' },
      worst: {
        cost: 'O(kn)',
        why: 'Applying each transform to every vertex in turn.',
      },
    },
  ],
  practice: rotateScale3dPractice(() => rotateScale3d),
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as Rs3Settings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    quarterTurn,
    orderMatters,
    halfTurns,
    stretch,
    mirror,
    flatten,
    tooBig,
    obliqueView,
    rowVectors,
    tumblingWedge,
  ] as unknown as SavedExample[],
  preview: { example: 'tumbling-wedge', level: 3, hide: ['op-', 'mt-'] },
};

const show = (pts: Vec3[]) =>
  pts.map((p) => `${fixed2(p.x)},${fixed2(p.y)},${fixed2(p.z)}`).join(' ');

/**
 * Driver protocol for the code tabs: "shape x1 y1 z1 ..." sets the vertices and M = I;
 * "rotate x deg" (or y, z) and "scale sx sy sz" compose onto M and print the moved vertices to
 * two decimals; "order deg" prints about-x-then-y and about-y-then-x, joined by " | ".
 * Refused calls change nothing and are left out.
 */
function codeScript(calls: OpCall[], settings: Rs3Settings) {
  const t = new Timeline(rotateScale3d, settings, 1, calls);
  const shapeLine = (s: RsState) => `shape ${s.base.flatMap((p) => [p.x, p.y, p.z]).join(' ')}`;
  const input: string[] = [shapeLine(t.initial.state)];
  const expected: string[] = [];
  let prev = t.initial.state;
  for (const e of t.entries) {
    const s = e.end;
    const changed = s !== prev;
    prev = s;
    const [op, ...args] = e.call;
    if (op === 'reset') {
      input.push(shapeLine(s));
    } else if (op === 'order') {
      const cmp = e.steps.at(-1)!.extra?.compare;
      if (!cmp) continue;
      input.push(`order ${args[0]}`);
      expected.push(`${show(cmp.xy)} | ${show(cmp.yx)}`);
    } else if (changed) {
      input.push(
        op === 'scale'
          ? `scale ${args.join(' ')}`
          : `rotate ${op.slice(-1).toLowerCase()} ${args[0]}`,
      );
      expected.push(show(s.pts));
    }
  }
  return { input, expected };
}

export default rotateScale3d;
