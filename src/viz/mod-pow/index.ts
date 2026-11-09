import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, VizDef } from '../../engine/types';
import { parseWhole } from '../_recursion/kit';
import cppSource from './code/cpp/mod_pow.hpp?raw';
import javaSource from './code/java/ModPow.java?raw';
import pythonSource from './code/python/mod_pow.py?raw';
import allOnes from './examples/all-ones.json';
import fermatLiar from './examples/fermat-liar.json';
import powerOfTwo from './examples/power-of-two-exponent.json';
import rightToLeft from './examples/right-to-left.json';
import squareAndMultiply from './examples/square-and-multiply.json';
import zeroExponent from './examples/zero-exponent.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  MAX_B,
  ops,
  pseudocode,
  type PowSettings,
  type PowState,
} from './model';
import { modPowPractice } from './practice';
import { view } from './view';

const MODS = [7, 11, 13, 97, 101, 561, 997];

export const modPow: VizDef<PowState, PowSettings, undefined> = {
  id: 'mod-pow',
  title: 'Fast modular exponentiation',
  family: 'Number theory',
  blurb:
    'a^b mod m by squaring and multiplying over the bits of b: about 2 log b multiplications instead of b.',
  settings: [
    {
      kind: 'choice',
      key: 'order',
      label: 'Read the bits of b',
      options: [
        { value: 'ltr', label: 'From the left, highest first (CLRS)' },
        { value: 'rtl', label: 'From the right, lowest first' },
      ],
      help: 'Left to right squares the result itself. Right to left keeps a second number, a to the 2^i, and multiplies it in where the bit is 1. Both make about the same number of multiplications.',
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
      label: 'a b m',
      placeholder: `e.g. 7 13 11 (b up to ${MAX_B})`,
      maxLength: 20,
      sample: '7',
      parse: (t) => parseWhole(t, 0, MAX_B, 'Each number'),
    },
    buttons: [
      {
        op: 'pow',
        label: 'Compute a^b mod m',
        usesInput: true,
        primary: true,
        args: ['a', 'b', 'm'],
      },
    ],
    random: {
      label: 'Random power',
      make: (rng) => [['pow', rng.int(2, 99), rng.int(5, 200), MODS[rng.int(0, MODS.length - 1)]!]],
    },
    presets: [
      {
        label: 'Random exponent of about n bits',
        make: (rng, size) => [['pow', rng.int(2, 50), rng.int(2 ** (size - 1), 2 ** size - 1), 97]],
      },
      {
        label: 'All ones (most multiplies)',
        make: (_rng, size) => [['pow', 3, 2 ** size - 1, 101]],
      },
      {
        label: 'A power of two (one multiply)',
        make: (_rng, size) => [['pow', 3, 2 ** size, 101]],
      },
      { label: 'Exponent 0', make: () => [['pow', 5, 0, 7]] },
    ],
    sizes: [4, 6, 9],
  },
  explain,
  complexity: [
    {
      op: 'a^b mod m: multiplications',
      best: {
        cost: 'O(log b)',
        why: 'A power of two: one squaring per bit and a single multiply.',
        example: 'power-of-two-exponent',
      },
      average: {
        cost: 'O(log b)',
        why: 'One squaring per bit, and a multiply for about half of them: about 1.5 log₂ b.',
        example: 'square-and-multiply',
      },
      worst: {
        cost: 'O(log b)',
        why: 'All ones: a squaring and a multiply for every bit, 2 log₂ b.',
        example: 'all-ones',
      },
      note: 'The naive loop makes b − 1. For a 2048-bit b that is the difference between about 3,000 multiplications and more than there are atoms in the universe.',
    },
    {
      op: 'a^b mod m: bit operations, β-bit numbers',
      best: {
        cost: 'O(β³)',
        why: 'β multiplications of β-bit numbers, each O(β²) done by hand.',
        example: 'power-of-two-exponent',
      },
      average: { cost: 'O(β³)', why: 'The same count of multiplications, give or take half.' },
      worst: {
        cost: 'O(β³)',
        why: '2β multiplications, each followed by a mod that keeps the numbers under m.',
        example: 'fermat-liar',
      },
      note: 'Reducing mod m after every multiplication keeps every number below m², however big b gets.',
    },
  ],
  practice: modPowPractice(() => modPow),
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as PowSettings),
  },
  examples: [
    squareAndMultiply,
    rightToLeft,
    fermatLiar,
    powerOfTwo,
    allOnes,
    zeroExponent,
  ] as unknown as SavedExample[],
  opening: 'square-and-multiply',
  preview: { example: 'square-and-multiply', level: 2 },
};

/** Driver protocol: "pow a b m" prints a^b mod m. */
function codeScript(calls: OpCall[], settings: PowSettings) {
  const t = new Timeline(modPow, settings, 1, calls);
  const input: string[] = [];
  const expected: string[] = [];
  for (const e of t.entries) {
    const end = e.steps[e.steps.length - 1]!.state;
    if (e.steps.length < 2 || !end.done) continue;
    input.push(`pow ${end.a} ${end.b} ${end.m}`);
    expected.push(String(end.result));
  }
  return { input, expected };
}

export default modPow;
