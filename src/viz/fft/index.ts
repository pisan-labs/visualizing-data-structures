import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import cppSource from './code/cpp/fft.hpp?raw';
import javaSource from './code/java/Fft.java?raw';
import pythonSource from './code/python/fft.py?raw';
import constant from './examples/constant.json';
import eightPoints from './examples/eight-points.json';
import fourPoints from './examples/four-points.json';
import impulse from './examples/impulse.json';
import multiplyQuadratics from './examples/multiply-quadratics.json';
import multiplyTwoLines from './examples/multiply-two-lines.json';
import otherSign from './examples/other-sign.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  type FftSettings,
  type FftState,
} from './model';
import { fftPractice } from './practice';
import { view } from './view';

/** Numbers separated by spaces or commas, with one | between two polynomials. */
export function parseNumbers(token: string): Value | Error {
  const t = token.trim().replace(/\s+/g, ' ');
  if (!t) return new Error('Type some numbers first, such as 1 2 3 4.');
  if (!/^[-+\d\s,|;]+$/.test(t))
    return new Error('Use whole numbers separated by spaces, and | between two polynomials.');
  return t;
}

const randomList = (rng: { int(a: number, b: number): number }, n: number) =>
  Array.from({ length: n }, () => rng.int(-5, 9)).join(' ');

export const fft: VizDef<FftState, FftSettings, undefined> = {
  id: 'fft',
  title: 'Fast Fourier transform',
  family: 'Divide and conquer',
  blurb:
    'Recursive radix-2 FFT as a butterfly network over the roots of unity, and polynomial multiplication by evaluate, multiply, interpolate.',
  settings: [
    {
      kind: 'choice',
      key: 'sign',
      label: 'Root of unity',
      options: [
        { value: 'clrs', label: 'ω = e^(2πi/n), as in CLRS' },
        { value: 'numpy', label: 'ω = e^(−2πi/n), as in numpy and signal processing' },
      ],
      help: 'Both conventions are in use; the inverse transform uses the other one. Outputs 1 and n − 1, 2 and n − 2, ... swap places.',
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
      label: 'numbers',
      placeholder: 'e.g. 1 2 3 4, or 1 2 | 3 4 to multiply',
      maxLength: 60,
      sample: '1 2 3 4',
      parse: parseNumbers,
    },
    buttons: [
      { op: 'fft', label: 'Transform', usesInput: true, primary: true },
      { op: 'multiply', label: 'Multiply polynomials', usesInput: true },
    ],
    random: { label: 'Random 8 values', make: (rng) => [['fft', randomList(rng, 8)]] },
    presets: [
      { label: 'Random values', make: (rng, size) => [['fft', randomList(rng, size)]] },
      {
        label: 'A single 1 (impulse)',
        make: (_rng, size) => [['fft', ['1', ...Array(size - 1).fill('0')].join(' ')]],
      },
      { label: 'All ones', make: (_rng, size) => [['fft', Array(size).fill('1').join(' ')]] },
      {
        label: 'Multiply two random polynomials',
        make: (rng, size) => [
          ['multiply', `${randomList(rng, size / 2)} | ${randomList(rng, size / 2)}`],
        ],
      },
    ],
    sizes: [2, 4, 8],
  },
  explain,
  complexity: [
    {
      op: 'FFT of n values',
      best: {
        cost: 'O(n log n)',
        why: 'Always log₂ n levels of n/2 butterflies, whatever the values are.',
        example: 'impulse',
      },
      average: {
        cost: 'O(n log n)',
        why: 'T(n) = 2T(n/2) + O(n): two half-size transforms and n/2 butterflies to combine them.',
        example: 'four-points',
      },
      worst: {
        cost: 'O(n log n)',
        why: 'The same network for every input of length n.',
        example: 'eight-points',
      },
      note: 'Evaluating a polynomial of degree n − 1 at n points one by one takes O(n²).',
    },
    {
      op: 'multiply two polynomials of degree < n',
      best: {
        cost: 'O(n log n)',
        why: 'Two FFTs, n pointwise products and one inverse FFT, on 2n points.',
        example: 'multiply-two-lines',
      },
      average: {
        cost: 'O(n log n)',
        why: 'The transforms dominate; the pointwise step is O(n).',
        example: 'multiply-quadratics',
      },
      worst: {
        cost: 'O(n log n)',
        why: 'Padding up to a power of 2 at most doubles the length.',
        example: 'multiply-quadratics',
      },
      note: 'Multiplying the coefficients directly takes O(n²).',
    },
  ],
  practice: fftPractice(() => fft),
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as FftSettings),
  },
  examples: [
    fourPoints,
    eightPoints,
    impulse,
    constant,
    multiplyTwoLines,
    multiplyQuadratics,
    otherSign,
  ] as unknown as SavedExample[],
  opening: 'eight-points',
  preview: {
    example: 'eight-points',
    level: 2,
    hide: ['circle', 'unit', 'axis', 'root', 'fft-note'],
  },
};

/**
 * Driver protocol: "fft a0 a1 ..." (padded to a power of 2) prints each output as real and
 * imaginary parts in hundredths; "multiply a.. | b.." prints the product's coefficients. The
 * code uses ω = e^(2πi/n), so the model runs with it.
 */
function codeScript(calls: OpCall[], settings: FftSettings) {
  const t = new Timeline(fft, { ...settings, sign: 'clrs' }, 1, calls);
  const input: string[] = [];
  const expected: string[] = [];
  const h = (x: number) => String(Math.round(x * 100) + 0);
  for (const e of t.entries) {
    const end = e.end;
    if (e.steps.length < 2 || end.phase !== 'done') continue;
    if (end.mode === 'fft') {
      input.push(`fft ${end.a.join(' ')}`);
      expected.push(end.y!.map((z) => `${h(z[0])} ${h(z[1])}`).join(' '));
    } else {
      const parts = String(e.call[1])
        .split(/[|;]/)
        .map((p) =>
          p
            .trim()
            .split(/[\s,]+/)
            .map(Number),
        );
      input.push(`multiply ${parts[0]!.join(' ')} | ${parts[1]!.join(' ')}`);
      expected.push(end.c!.join(' '));
    }
  }
  return { input, expected };
}

export default fft;
