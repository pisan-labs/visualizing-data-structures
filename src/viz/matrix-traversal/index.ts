import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, Preset, SavedExample, Settings, VizDef } from '../../engine/types';
import { approachSetting } from '../_patterns/kit';
import cppSource from './code/cpp/matrix.hpp?raw';
import javaSource from './code/java/Matrix.java?raw';
import pythonSource from './code/python/matrix.py?raw';
import middleStays from './examples/middle-stays.json';
import oneRowLeft from './examples/one-row-left.json';
import rotateCopy from './examples/rotate-copy.json';
import rotateRings from './examples/rotate-rings.json';
import rotateTranspose from './examples/rotate-transpose.json';
import spiralBounds from './examples/spiral-bounds.json';
import spiralWalk from './examples/spiral-walk.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  MAX_SIDE,
  ops,
  parseInput,
  pseudocode,
  size,
  spiralOrder,
  valuesOf,
  type MatrixExtra,
  type MatrixSettings,
  type MatrixState,
} from './model';
import { matrixPractice } from './practice';
import { view } from './view';

const rowsText = (vs: number[][]) => vs.map((r) => r.join(' ')).join(' / ');

/** An r × c matrix of distinct values from 1 to 99. */
export function randomMatrix(rng: Rng, rows: number, cols: number): number[][] {
  const pool = Array.from({ length: 99 }, (_, i) => i + 1);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return Array.from({ length: rows }, (_, r) => pool.slice(r * cols, (r + 1) * cols));
}

const presets: Preset[] = [
  { label: 'Square of 1 to n², spiral', make: (_rng, n) => [['load', `${n}x${n}`], ['spiral']] },
  { label: 'Square of 1 to n², rotate', make: (_rng, n) => [['load', `${n}x${n}`], ['rotate']] },
  {
    label: 'Random values, spiral, then rotate',
    make: (rng, n) => [['load', rowsText(randomMatrix(rng, n, n))], ['spiral'], ['rotate']],
  },
  {
    label: 'Two rows, spiral (the bottom row is walked back)',
    make: (_rng, n) => [['load', `2x${n}`], ['spiral']],
  },
  {
    label: 'Three rows, spiral (one row is left in the middle)',
    make: (_rng, n) => [['load', `3x${n}`], ['spiral']],
  },
  { label: 'One column, spiral', make: (_rng, n) => [['load', `${n}x1`], ['spiral']] },
  {
    label: 'Odd size, rotate (the middle stays put)',
    make: (_rng, n) => {
      const odd = n % 2 ? n : n - 1;
      return [['load', `${odd}x${odd}`], ['rotate']];
    },
  },
];

export const matrixTraversal: VizDef<MatrixState, MatrixSettings, MatrixExtra> = {
  id: 'matrix-traversal',
  title: 'Matrix traversal (spiral, rotate)',
  family: 'Array and string tricks',
  blurb:
    'Walk a matrix in spiral order by shrinking four bounds, and turn a square matrix a quarter turn in place, ring by ring or by transposing and reversing rows. Against a grid of seen marks and a copy: the same O(n²) time, without the extra n² cells.',
  settings: [
    approachSetting({
      pattern: 'In place: four bounds, or rotate in place',
      naive: 'Extra grid: seen marks, or a rotated copy',
      help: 'Both give the same order and the same rotation. Watch reads, writes and checks, and the extra cells, or use Compare with this same page.',
    }),
    {
      kind: 'choice',
      key: 'rotate',
      label: 'Rotate in place by',
      options: [
        { value: 'layers', label: 'Rings: four-way swaps, each cell moved once' },
        { value: 'transpose', label: 'Transpose, then reverse each row' },
      ],
      help: 'Both turn the matrix clockwise. Rings move each cell once; transposing and reversing moves most cells twice, with simpler loops.',
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
      label: 'Matrix',
      placeholder: 'e.g. 4x4, or 1 2 3 / 4 5 6',
      maxLength: 140,
      sample: '3x3',
      parse: parseInput,
    },
    buttons: [
      { op: 'spiral', label: 'Spiral order', usesInput: false, primary: true },
      { op: 'rotate', label: 'Rotate', usesInput: false },
      { op: 'load', label: 'Load', usesInput: true },
    ],
    random: {
      label: 'Random values',
      make: (rng) => [['load', rowsText(randomMatrix(rng, 4, 4))], ['spiral']],
    },
    presets,
    sizes: [3, 4, 5, MAX_SIDE],
  },
  explain,
  complexity: [
    {
      op: 'spiral order, four bounds',
      best: {
        cost: 'Θ(mn)',
        why: 'Every cell is read once, whatever the shape.',
        example: 'spiral-bounds',
      },
      average: {
        cost: 'Θ(mn)',
        why: '4 × 4: 16 reads and 7 bound checks, about three checks per ring.',
        example: 'spiral-bounds',
      },
      worst: {
        cost: 'Θ(mn)',
        why: 'A thin middle row, as in 3 × 5, still costs one read per cell; the checks stop it walking the row twice.',
        example: 'one-row-left',
      },
      note: 'Extra space O(1): four indices.',
    },
    {
      op: 'spiral order, seen marks',
      best: {
        cost: 'Θ(mn)',
        why: 'A read, a seen mark and a check per cell.',
        example: 'spiral-walk',
      },
      average: {
        cost: 'Θ(mn)',
        why: '4 × 4: 16 reads, 16 writes and 15 checks.',
        example: 'spiral-walk',
      },
      worst: {
        cost: 'Θ(mn)',
        why: 'The same order and the same time as the bounds, plus mn extra cells.',
        example: 'spiral-walk',
      },
    },
    {
      op: 'rotate in place, rings',
      best: {
        cost: 'Θ(n²)',
        why: 'Every cell but the middle one moves exactly once: ⌊n²/4⌋ four-way swaps.',
        example: 'rotate-rings',
      },
      average: {
        cost: 'Θ(n²)',
        why: '4 × 4: 4 four-way swaps, 16 reads and 16 writes.',
        example: 'rotate-rings',
      },
      worst: {
        cost: 'Θ(n²)',
        why: 'An odd size leaves the middle cell where it is: 3 × 3 takes 2 four-way swaps.',
        example: 'middle-stays',
      },
      note: 'Extra space O(1): one spare cell.',
    },
    {
      op: 'rotate in place, transpose and reverse',
      best: {
        cost: 'Θ(n²)',
        why: 'n(n − 1)/2 swaps to transpose, then n⌊n/2⌋ to reverse the rows.',
      },
      average: {
        cost: 'Θ(n²)',
        why: '4 × 4: 6 + 8 = 14 swaps, 56 reads and writes, against 32 for rings.',
        example: 'rotate-transpose',
      },
      worst: {
        cost: 'Θ(n²)',
        why: 'Most cells move twice, once in each pass.',
        example: 'rotate-transpose',
      },
    },
    {
      op: 'rotate into a copy',
      best: { cost: 'Θ(n²)', why: 'One read and one write per cell.', example: 'rotate-copy' },
      average: {
        cost: 'Θ(n²)',
        why: '4 × 4: 16 reads and 16 writes, the same as rings.',
        example: 'rotate-copy',
      },
      worst: {
        cost: 'Θ(n²)',
        why: 'The time is fine; the n² extra cells for B are the cost.',
        example: 'rotate-copy',
      },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => {
      const t = new Timeline(matrixTraversal, settings as MatrixSettings, 1, calls);
      const loadLine = (s: MatrixState) => {
        const { rows, cols } = size(s);
        return `load ${rows} ${cols} ${valuesOf(s).flat().join(' ')}`;
      };
      const input = [loadLine(t.initial.state)];
      const expected: string[] = [];
      let before = t.initial.state;
      for (const e of t.entries) {
        const name = e.call[0];
        if (name === 'load' && e.end !== before) input.push(loadLine(e.end));
        if (name === 'spiral') {
          const { rows, cols } = size(before);
          const vs = valuesOf(before);
          input.push('spiral');
          expected.push(
            spiralOrder(rows, cols)
              .order.map(([r, c]) => vs[r]![c])
              .join(' '),
          );
        }
        if (name === 'rotate' && e.end !== before) {
          input.push('rotate');
          expected.push(rowsText(valuesOf(e.end)));
        }
        before = e.end;
      }
      return { input, expected };
    },
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    spiralBounds,
    spiralWalk,
    oneRowLeft,
    rotateRings,
    rotateTranspose,
    rotateCopy,
    middleStays,
  ] as unknown as SavedExample[],
  practice: matrixPractice(() => matrixTraversal),
  preview: { example: 'spiral-bounds', level: 2, hide: ['heading', 'order-', 'out-'] },
};

export default matrixTraversal;
