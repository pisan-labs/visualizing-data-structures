import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, Preset, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import cppSource from './code/cpp/strassen.hpp?raw';
import javaSource from './code/java/Strassen.java?raw';
import pythonSource from './code/python/strassen.py?raw';
import eightByEight from './examples/eight-by-eight.json';
import eightProducts from './examples/eight-products.json';
import fourByFour from './examples/four-by-four.json';
import mNames from './examples/m-names.json';
import oneByOne from './examples/one-by-one.json';
import padding from './examples/padding.json';
import sevenProducts from './examples/seven-products.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  matrixText,
  MAX_ENTRY,
  MAX_N,
  ops,
  parseMatrices,
  pseudocode,
  type Mat,
  type StSettings,
  type StState,
} from './model';
import { strassenPractice } from './practice';
import { view } from './view';

const random = (rng: Rng, n: number, lo: number, hi: number): Mat =>
  Array.from({ length: n }, () => Array.from({ length: n }, () => rng.int(lo, hi)));
const ones = (n: number): Mat => Array.from({ length: n }, () => Array<number>(n).fill(1));
const identity = (n: number): Mat =>
  Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));

export const multiplyCall = (A: Mat, B: Mat): OpCall => [
  'multiply',
  `${matrixText(A)} * ${matrixText(B)}`,
];

const preset = (label: string, make: (rng: Rng, n: number) => [Mat, Mat]): Preset => ({
  label,
  make: (rng, n) => [multiplyCall(...make(rng, n))],
});

export const strassen: VizDef<StState, StSettings, undefined> = {
  id: 'strassen',
  title: 'Strassen matrix multiplication',
  family: 'Divide and conquer',
  blurb:
    'Split both matrices into four blocks and multiply with seven half-size products instead of eight: n^2.81 multiplications instead of n³.',
  settings: [
    {
      kind: 'choice',
      key: 'method',
      label: 'Products per split',
      options: [
        { value: 'strassen', label: "Seven: Strassen's products" },
        { value: 'block', label: 'Eight: plain block multiplication' },
      ],
      help: 'Eight half-size products is no faster than the schoolbook method: T(n) = 8T(n/2) + Θ(n²) is still Θ(n³). The seventh product is the whole trick.',
    },
    {
      kind: 'choice',
      key: 'names',
      label: 'How the seven are written',
      options: [
        { value: 'clrs', label: 'CLRS: ten sums S1..S10, products P1..P7' },
        { value: 'm', label: 'M1..M7, each a product of two sums' },
      ],
      help: 'The same arithmetic, grouped differently. CLRS names the ten sums first; most slides write each product with its sums inside.',
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
      label: 'A * B',
      placeholder: 'e.g. 1 2; 3 4 * 5 6; 7 8',
      maxLength: 420,
      sample: '1 2; 3 4 * 5 6; 7 8',
      parse(token: string): Value | Error {
        const r = parseMatrices(token);
        return r instanceof Error ? r : token.trim();
      },
    },
    buttons: [{ op: 'multiply', label: 'Multiply A·B', usesInput: true, primary: true }],
    random: {
      label: 'Random 4 × 4',
      make: (rng) => [multiplyCall(random(rng, 4, 0, 9), random(rng, 4, 0, 9))],
    },
    presets: [
      preset('Random entries, 0 to 9', (rng, n) => [random(rng, n, 0, 9), random(rng, n, 0, 9)]),
      preset('Small entries, 0 to 3', (rng, n) => [random(rng, n, 0, 3), random(rng, n, 0, 3)]),
      preset('Negative entries too', (rng, n) => [
        random(rng, n, -MAX_ENTRY, MAX_ENTRY),
        random(rng, n, -MAX_ENTRY, MAX_ENTRY),
      ]),
      preset('The identity times a matrix', (rng, n) => [identity(n), random(rng, n, 0, 9)]),
      preset('All ones', (_rng, n) => [ones(n), ones(n)]),
    ],
    sizes: [2, 3, 4, MAX_N],
  },
  explain,
  complexity: [
    {
      op: 'Strassen, n × n: scalar multiplications',
      best: {
        cost: 'Θ(1)',
        why: 'A 1 × 1 product is one multiplication: no split at all.',
        example: 'one-by-one',
      },
      average: {
        cost: 'Θ(n^log₂7) ≈ n^2.81',
        why: 'T(n) = 7T(n/2) + Θ(n²): seven half-size products per level, so 7^(log₂ n) = n^(log₂ 7) leaves.',
        example: 'four-by-four',
      },
      worst: {
        cost: 'Θ(n^2.81)',
        why: 'Padding n up to the next power of 2 at most doubles it, which changes the constant (up to 7×), not the growth.',
        example: 'padding',
      },
      note: 'For 4 × 4 that is 49 instead of 64; for 1024 × 1024, about 282 million instead of a billion.',
    },
    {
      op: 'Strassen, n × n: scalar additions',
      best: { cost: 'Θ(1)', why: 'None at all for 1 × 1.', example: 'one-by-one' },
      average: {
        cost: 'Θ(n^2.81)',
        why: '18 additions of (n/2) × (n/2) blocks per call add up to 6(n^2.81 − n²): more than the schoolbook n³ for small n.',
        example: 'seven-products',
      },
      worst: {
        cost: 'Θ(n^2.81)',
        why: 'The same 18 block additions in every call, whatever the entries.',
        example: 'eight-by-eight',
      },
    },
    {
      op: 'eight products per split',
      best: { cost: 'Θ(1)', why: 'The same base case.', example: 'one-by-one' },
      average: {
        cost: 'Θ(n³)',
        why: 'T(n) = 8T(n/2) + Θ(n²): 8^(log₂ n) = n³ leaves, the schoolbook count.',
        example: 'eight-products',
      },
      worst: {
        cost: 'Θ(n³)',
        why: 'Every block of A meets every block of B, all the way down.',
        example: 'eight-products',
      },
    },
  ],
  practice: strassenPractice(() => strassen),
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as StSettings),
  },
  examples: [
    sevenProducts,
    fourByFour,
    eightProducts,
    mNames,
    padding,
    oneByOne,
    eightByEight,
  ] as unknown as SavedExample[],
  opening: 'four-by-four',
  preview: { example: 'four-by-four', level: 2, hide: ['f-', 'lvl-', 'mt'] },
};

/**
 * Driver protocol: "multiply n a11 a12 ... ann b11 ... bnn" (row by row) prints the product,
 * rows split by ";", then "|", the scalar multiplications and the scalar additions. The code uses
 * Strassen's seven products with CLRS's sums, so the model does too here.
 */
function codeScript(calls: OpCall[], settings: StSettings) {
  const t = new Timeline(strassen, { ...settings, method: 'strassen', names: 'clrs' }, 1, calls);
  const input: string[] = [];
  const expected: string[] = [];
  for (const e of t.entries) {
    const s = e.end;
    if (!s.done || e.steps.length < 2) continue;
    const root = s.calls[0]!;
    const n = s.size;
    const cut = (m: Mat) => m.slice(0, n).map((r) => r.slice(0, n));
    input.push(`multiply ${n} ${[...cut(root.A).flat(), ...cut(root.B).flat()].join(' ')}`);
    expected.push(`${matrixText(cut(root.C))} | ${s.mults} ${s.adds}`);
  }
  return { input, expected };
}

export default strassen;
