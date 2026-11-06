import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import cppSource from './code/cpp/motion.hpp?raw';
import javaSource from './code/java/Motion.java?raw';
import pythonSource from './code/python/motion.py?raw';
import aboutAPoint from './examples/about-a-point.json';
import fullTurn from './examples/full-turn.json';
import matrixPlusOffset from './examples/matrix-plus-offset.json';
import offTheDrawing from './examples/off-the-drawing.json';
import orderMatters from './examples/order-matters.json';
import rowVectors from './examples/row-vectors.json';
import slideOnly from './examples/slide-only.json';
import undoItAll from './examples/undo-it-all.json';
import zeroSlide from './examples/zero-slide.json';
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
  type RtExtra,
  type RtSettings,
  type RtState,
} from './model';
import { rotateTranslatePractice } from './practice';
import { view } from './view';

/** An angle, a coordinate or an offset: a number with at most one decimal place. */
export function parseNumber(token: string): Value | Error {
  const t = token.trim();
  if (!t) return new Error('Type a number first.');
  if (!/^-?\d+(\.\d)?$/.test(t))
    return new Error('Use numbers with at most one decimal place, such as 90 or 1.5.');
  const x = Number(t);
  if (Math.abs(x) > 360) return new Error('Keep numbers from -360 to 360.');
  return x;
}

export const rotateTranslate2d: VizDef<RtState, RtSettings, RtExtra> = {
  id: 'rotate-translate-2d',
  title: '2D rotation and translation',
  family: 'Geometry',
  blurb:
    'Move a shape without bending it: rotations and translations as 3×3 matrices, why the order matters, turning about a point, and undoing it all.',
  settings: [
    {
      kind: 'choice',
      key: 'form',
      label: 'Matrix form',
      options: [
        { value: 'homogeneous', label: 'One 3×3 matrix on (x, y, 1)' },
        { value: 'affine', label: "A 2×2 rotation plus an offset: p' = R p + t" },
      ],
      help: 'The same motion. The 3×3 form makes a slide a matrix too, so a chain of motions multiplies into one.',
    },
    {
      kind: 'choice',
      key: 'convention',
      label: 'Vectors are',
      options: [
        { value: 'column', label: "Columns: p' = M p (math books, OpenGL)" },
        { value: 'row', label: "Rows: p' = p M (DirectX)" },
      ],
      help: 'Row vectors write every matrix transposed (the slide moves to the bottom row) and composition in the opposite order.',
    },
    {
      kind: 'choice',
      key: 'shape',
      label: 'Shape',
      options: [
        { value: 'letter', label: 'The letter F' },
        { value: 'house', label: 'A house' },
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
      placeholder: 'e.g. 90, or 3 1',
      maxLength: 60,
      sample: '2',
      parse: parseNumber,
    },
    buttons: [
      { op: 'rotate', label: 'Rotate (degrees)', usesInput: true, primary: true },
      { op: 'translate', label: 'Translate', usesInput: true, args: ['tx', 'ty'] },
      {
        op: 'about',
        label: 'Rotate about a point',
        usesInput: true,
        args: ['an angle', 'cx', 'cy'],
      },
      { op: 'order', label: 'Compare orders', usesInput: true, args: ['an angle', 'tx', 'ty'] },
      { op: 'invert', label: 'Undo all (inverse)', usesInput: false },
      { op: 'reset', label: 'Reset', usesInput: false },
    ],
    random: {
      label: 'Random motion',
      make: (rng) => [
        ['rotate', rng.int(-12, 12) * 15],
        ['translate', rng.int(-3, 3), rng.int(-3, 3)],
      ],
    },
    // The size picked next to a preset is an angle in degrees.
    presets: [
      {
        label: 'Rotate, then slide right by 4',
        make: (_rng, deg) => [
          ['rotate', deg],
          ['translate', 4, 0],
        ],
      },
      { label: 'Compare both orders', make: (_rng, deg) => [['order', deg, 4, 0]] },
      { label: 'Turn about the point (2, 1)', make: (_rng, deg) => [['about', deg, 2, 1]] },
      {
        label: 'Move, then undo it all',
        make: (rng, deg) => [
          ['rotate', deg],
          ['translate', rng.int(-3, 3), rng.int(-3, 3)],
          ['invert'],
        ],
      },
      {
        label: 'Random rotations and slides',
        make: (rng) =>
          Array.from({ length: 4 }, (): OpCall =>
            rng.int(0, 1)
              ? ['rotate', rng.int(-6, 6) * 15]
              : ['translate', rng.int(-2, 2), rng.int(-2, 2)],
          ),
      },
    ],
    sizes: [30, 45, 90],
  },
  explain,
  complexity: [
    {
      op: 'rotate or translate a shape of n vertices',
      best: {
        cost: 'O(n)',
        why: 'A slide is 2 additions per vertex; the matrix product is a fixed 27 multiplications.',
        example: 'slide-only',
      },
      average: {
        cost: 'O(n)',
        why: 'Each vertex costs 4 multiplications and 4 additions with the 3×3 matrix.',
        example: 'row-vectors',
      },
      worst: {
        cost: 'O(n)',
        why: 'The same work for any angle; a refused move still checks every vertex.',
        example: 'off-the-drawing',
      },
    },
    {
      op: 'rotate about a point c',
      best: {
        cost: 'O(n)',
        why: 'Three motions, but they multiply into one matrix first: O(1), then O(1) per vertex.',
        example: 'about-a-point',
      },
      average: { cost: 'O(n)', why: 'T(c)·R·T(−c) is two fixed 3×3 products.' },
      worst: {
        cost: 'O(n)',
        why: 'Sliding, turning and sliding back each vertex separately is 3n steps, still O(n).',
      },
    },
    {
      op: 'inverse of a rigid motion',
      best: {
        cost: 'O(1)',
        why: 'Transpose R and compute −Rᵀ t: 4 multiplications, no division.',
        example: 'undo-it-all',
      },
      average: {
        cost: 'O(1)',
        why: 'A general 3×3 inverse is also O(1), but needs a determinant and divisions.',
      },
      worst: {
        cost: 'O(1)',
        why: 'A rigid motion always has an inverse: det R = 1.',
        example: 'undo-it-all',
      },
    },
    {
      op: 'k motions on n vertices',
      best: {
        cost: 'O(k + n)',
        why: 'Multiply the k matrices into one M, then apply M once per vertex.',
        example: 'matrix-plus-offset',
      },
      average: {
        cost: 'O(k + n)',
        why: 'This is why graphics code keeps one running matrix.',
        example: 'order-matters',
      },
      worst: {
        cost: 'O(kn)',
        why: 'Applying each motion to every vertex in turn.',
        example: 'zero-slide',
      },
    },
  ],
  practice: rotateTranslatePractice(() => rotateTranslate2d),
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as RtSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    orderMatters,
    aboutAPoint,
    undoItAll,
    slideOnly,
    zeroSlide,
    fullTurn,
    offTheDrawing,
    matrixPlusOffset,
    rowVectors,
  ] as unknown as SavedExample[],
};

/**
 * Driver protocol for the code tabs: "shape x1 y1 ..." sets the vertices and M = I;
 * "rotate deg", "translate tx ty", "about deg cx cy" and "invert" compose onto M and print the
 * moved vertices to two decimals; "order deg tx ty" prints rotate-then-translate and
 * translate-then-rotate, joined by " | ". Refused calls change nothing and are left out.
 */
function codeScript(calls: OpCall[], settings: RtSettings) {
  const t = new Timeline(rotateTranslate2d, settings, 1, calls);
  const start = t.initial.state;
  const shapeLine = (s: RtState) => `shape ${s.base.flatMap((p) => [p.x, p.y]).join(' ')}`;
  const show = (pts: { x: number; y: number }[]) =>
    pts.map((p) => `${fixed2(p.x)},${fixed2(p.y)}`).join(' ');
  const input: string[] = [shapeLine(start)];
  const expected: string[] = [];
  let prev = start;
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
      input.push(`order ${args.join(' ')}`);
      expected.push(`${show(cmp.rt)} | ${show(cmp.tr)}`);
    } else if (changed) {
      input.push(op === 'invert' ? 'invert' : `${op} ${args.join(' ')}`);
      expected.push(show(s.pts));
    }
  }
  return { input, expected };
}

export default rotateTranslate2d;
