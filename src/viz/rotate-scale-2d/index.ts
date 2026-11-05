import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import cppSource from './code/cpp/transform.hpp?raw';
import javaSource from './code/java/Transform.java?raw';
import pythonSource from './code/python/transform.py?raw';
import aboutAPoint from './examples/about-a-point.json';
import mirror from './examples/mirror.json';
import orderMatters from './examples/order-matters.json';
import quarterTurn from './examples/quarter-turn.json';
import rowVectors from './examples/row-vectors.json';
import stretch from './examples/stretch.json';
import tooBig from './examples/too-big.json';
import uniformCommutes from './examples/uniform-commutes.json';
import uniformScale from './examples/uniform-scale.json';
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
  type RsExtra,
  type RsSettings,
  type RsState,
} from './model';
import { rotateScalePractice } from './practice';
import { view } from './view';

/** An angle or a scale factor: a number with at most one decimal place. */
export function parseNumber(token: string): Value | Error {
  const t = token.trim();
  if (!t) return new Error('Type a number first.');
  if (!/^-?\d+(\.\d)?$/.test(t))
    return new Error('Use numbers with at most one decimal place, such as 30 or 1.5.');
  const x = Number(t);
  if (Math.abs(x) > 360) return new Error('Keep numbers from -360 to 360.');
  return x;
}

export const rotateScale2d: VizDef<RsState, RsSettings, RsExtra> = {
  id: 'rotate-scale-2d',
  title: '2D rotation and scale',
  family: 'Geometry',
  blurb:
    'Rotate and scale a shape with a 2×2 matrix, watch where the basis vectors go, and see why rotate-then-scale is not scale-then-rotate.',
  settings: [
    {
      kind: 'choice',
      key: 'about',
      label: 'Rotate and scale about',
      options: [
        { value: 'origin', label: 'The origin' },
        { value: 'pivot', label: 'A pivot point c' },
      ],
      help: 'About a point c means: slide c to the origin, apply the matrix, slide back.',
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
        { value: 'letter', label: 'The letter F' },
        { value: 'house', label: 'A house' },
        { value: 'square', label: 'A square' },
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
      placeholder: 'e.g. 30, or 2 1',
      maxLength: 60,
      sample: '2',
      parse: parseNumber,
    },
    buttons: [
      { op: 'rotate', label: 'Rotate (degrees)', usesInput: true, primary: true },
      { op: 'scale', label: 'Scale', usesInput: true, args: ['sx', 'sy'] },
      { op: 'order', label: 'Compare orders', usesInput: true, args: ['an angle', 'sx', 'sy'] },
      { op: 'reset', label: 'Reset', usesInput: false },
      { op: 'pivot', label: 'Set pivot', usesInput: true, args: ['x', 'y'], more: true },
    ],
    random: {
      label: 'Random rotation',
      make: (rng) => [['rotate', rng.int(-12, 12) * 15]],
    },
    // The size picked next to a preset is an angle in degrees.
    presets: [
      { label: 'Rotate by the angle', make: (_rng, deg) => [['rotate', deg]] },
      {
        label: 'Rotate, then stretch x by 2',
        make: (_rng, deg) => [
          ['rotate', deg],
          ['scale', 2, 1],
        ],
      },
      { label: 'Compare both orders', make: (_rng, deg) => [['order', deg, 2, 1]] },
      {
        label: 'Turn about the pivot (3, 2)',
        make: (_rng, deg) => [
          ['pivot', 3, 2],
          ['rotate', deg],
        ],
      },
      {
        label: 'Random rotations and scales',
        make: (rng) =>
          Array.from({ length: 3 }, (): OpCall =>
            rng.int(0, 1)
              ? ['rotate', rng.int(-6, 6) * 15]
              : ['scale', rng.int(5, 15) / 10, rng.int(5, 15) / 10],
          ),
      },
    ],
    sizes: [30, 45, 90],
  },
  explain,
  complexity: [
    {
      op: 'rotate(θ) a shape of n vertices',
      best: {
        cost: 'O(n)',
        why: 'One cos and one sin, then 4 multiplications per vertex.',
        example: 'quarter-turn',
      },
      average: { cost: 'O(n)', why: 'Every vertex is multiplied by the same R.' },
      worst: {
        cost: 'O(n)',
        why: 'About a point adds 4 additions per vertex, still O(1) each.',
        example: 'about-a-point',
      },
    },
    {
      op: 'scale(sx, sy) a shape of n vertices',
      best: {
        cost: 'O(n)',
        why: 'S is diagonal: 2 multiplications per vertex.',
        example: 'uniform-scale',
      },
      average: { cost: 'O(n)', why: 'Uniform or not, the same work.', example: 'stretch' },
      worst: { cost: 'O(n)', why: 'A flip (negative factor) costs the same.', example: 'mirror' },
    },
    {
      op: 'composing two 2×2 matrices',
      best: { cost: 'O(1)', why: '8 multiplications and 4 additions.', example: 'order-matters' },
      average: { cost: 'O(1)', why: 'The size of the matrix is fixed.', example: 'row-vectors' },
      worst: {
        cost: 'O(1)',
        why: 'Fixed cost, but the order of the factors changes the answer.',
        example: 'uniform-commutes',
      },
    },
    {
      op: 'k transforms on n vertices',
      best: {
        cost: 'O(k + n)',
        why: 'Multiply the k matrices into one M, then apply M once per vertex.',
      },
      average: { cost: 'O(k + n)', why: 'This is why graphics code keeps one running matrix.' },
      worst: {
        cost: 'O(kn)',
        why: 'Applying each transform to every vertex in turn, as this page does.',
      },
    },
  ],
  practice: rotateScalePractice(() => rotateScale2d),
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as RsSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    quarterTurn,
    uniformScale,
    stretch,
    orderMatters,
    uniformCommutes,
    aboutAPoint,
    mirror,
    rowVectors,
    tooBig,
  ] as unknown as SavedExample[],
};

const show = (pts: { x: number; y: number }[]) =>
  pts.map((p) => `${fixed2(p.x)},${fixed2(p.y)}`).join(' ');

/**
 * Driver protocol for the code tabs: "shape x1 y1 ..." sets the vertices; "rotate deg cx cy"
 * and "scale sx sy cx cy" transform them about (cx, cy) and print them to two decimals;
 * "order deg sx sy cx cy" prints rotate-then-scale and scale-then-rotate, joined by " | ".
 * Refused calls (off the drawing, bad numbers) change nothing and are left out.
 */
function codeScript(calls: OpCall[], settings: RsSettings) {
  const t = new Timeline(rotateScale2d, settings, 1, calls);
  const start = t.initial.state;
  const input: string[] = [`shape ${start.pts.flatMap((p) => [p.x, p.y]).join(' ')}`];
  const expected: string[] = [];
  let prev = start;
  for (const e of t.entries) {
    const s = e.end;
    const before = prev;
    prev = s;
    const [op, ...args] = e.call;
    const c = settings.about === 'pivot' ? before.pivot : { x: 0, y: 0 };
    if (op === 'reset') {
      input.push(`shape ${s.pts.flatMap((p) => [p.x, p.y]).join(' ')}`);
    } else if (op === 'order') {
      const last = e.steps.at(-1)!;
      const cmp = last.extra?.compare;
      if (!cmp) continue;
      input.push(`order ${args.join(' ')} ${c.x} ${c.y}`);
      expected.push(`${show(cmp.rs)} | ${show(cmp.sr)}`);
    } else if ((op === 'rotate' || op === 'scale') && s !== before) {
      input.push(`${op} ${args.join(' ')} ${c.x} ${c.y}`);
      expected.push(show(s.pts));
    }
  }
  return { input, expected };
}

export default rotateScale2d;
