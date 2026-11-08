import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, VizDef } from '../../engine/types';
import { parseWhole } from '../_recursion/kit';
import cppSource from './code/cpp/euclid.hpp?raw';
import javaSource from './code/java/Euclid.java?raw';
import pythonSource from './code/python/euclid.py?raw';
import bezout from './examples/bezout.json';
import consecutiveFibonacci from './examples/consecutive-fibonacci.json';
import dividesEvenly from './examples/divides-evenly.json';
import inverseExists from './examples/inverse-exists.json';
import noInverse from './examples/no-inverse.json';
import remainders from './examples/remainders.json';
import smallerFirst from './examples/smaller-first.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  fib,
  init,
  initialSay,
  initialVars,
  MAX,
  ops,
  pseudocode,
  type EuclidSettings,
  type EuState,
} from './model';
import { euclidPractice } from './practice';
import { view } from './view';

export const euclid: VizDef<EuState, EuclidSettings, undefined> = {
  id: 'euclid',
  title: 'Euclid and extended Euclid',
  family: 'Number theory',
  blurb:
    'gcd by repeated remainders, then x and y with ax + by = gcd by back-substitution, and modular inverses.',
  settings: [
    {
      kind: 'choice',
      key: 'version',
      label: 'Version',
      options: [
        { value: 'basic', label: 'Euclid: the gcd only' },
        { value: 'extended', label: 'Extended Euclid: the gcd and x, y with ax + by = gcd' },
      ],
      help: 'Both are the recursive versions in CLRS. The extended one fills x and y on the way back up.',
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
      label: 'a b',
      placeholder: `two numbers, e.g. 240 46 (0 to ${MAX})`,
      maxLength: 20,
      sample: '240 46',
      parse: (t) => parseWhole(t, 0, MAX, 'Each number'),
    },
    buttons: [
      { op: 'gcd', label: 'gcd(a, b)', usesInput: true, primary: true, args: ['a', 'b'] },
      { op: 'inverse', label: 'Inverse of a mod b', usesInput: true, args: ['a', 'the modulus'] },
    ],
    random: {
      label: 'Random pair',
      make: (rng) => [['gcd', rng.int(20, 999), rng.int(2, 300)]],
    },
    presets: [
      { label: 'Random pair', make: (rng) => [['gcd', rng.int(100, 999), rng.int(10, 99)]] },
      {
        label: 'Consecutive Fibonacci numbers (worst case)',
        make: (_rng, size) => [['gcd', fib(size + 3), fib(size + 2)]],
      },
      {
        label: 'b divides a (best case)',
        make: (rng) => {
          const b = rng.int(3, 40);
          return [['gcd', b * rng.int(2, 20), b]];
        },
      },
      {
        label: 'Coprime numbers',
        make: (_rng, size) => [['gcd', 10 * size + 1, 3 * size + 1]],
      },
      {
        label: 'A modular inverse',
        make: (rng) => [['inverse', rng.int(2, 40), [41, 43, 47, 53][rng.int(0, 3)]!]],
      },
    ],
    sizes: [5, 8, 12],
  },
  explain,
  complexity: [
    {
      op: 'gcd(a, b), a > b: recursive calls',
      best: {
        cost: 'O(1)',
        why: 'When b divides a the first remainder is 0: one call and done.',
        example: 'divides-evenly',
      },
      average: {
        cost: 'O(log b)',
        why: 'Every two calls at least halve the first number, so the numbers lose about a digit every few calls.',
        example: 'remainders',
      },
      worst: {
        cost: 'O(log b)',
        why: 'Consecutive Fibonacci numbers: every quotient is 1. Lamé: k calls need b ≥ F(k+1), and Fibonacci numbers grow like 1.618^k.',
        example: 'consecutive-fibonacci',
      },
      note: 'Counting each division as one step. For β-bit numbers it is O(β) divisions, O(β³) bit operations done naively.',
    },
    {
      op: 'extended gcd and modular inverse',
      best: {
        cost: 'O(1)',
        why: 'The same calls as gcd, plus one step per call back up.',
        example: 'no-inverse',
      },
      average: {
        cost: 'O(log b)',
        why: 'Back-substitution visits each row once more, so it at most doubles the work.',
        example: 'bezout',
      },
      worst: {
        cost: 'O(log b)',
        why: 'Fibonacci pairs again: the same number of rows, filled twice.',
        example: 'inverse-exists',
      },
    },
  ],
  practice: euclidPractice(() => euclid),
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as EuclidSettings),
  },
  examples: [
    remainders,
    consecutiveFibonacci,
    dividesEvenly,
    smallerFirst,
    bezout,
    inverseExists,
    noInverse,
  ] as unknown as SavedExample[],
  preview: { example: 'bezout', level: 2 },
};

/**
 * Driver protocol: "gcd a b" prints d, "ext a b" prints "d x y", "inverse a m" prints the
 * inverse or "none".
 */
function codeScript(calls: OpCall[], settings: EuclidSettings) {
  const t = new Timeline(euclid, settings, 1, calls);
  const input: string[] = [];
  const expected: string[] = [];
  for (const e of t.entries) {
    const end = e.steps[e.steps.length - 1]!.state;
    // A rejected input yields one step and leaves the last run in place.
    if (!end.kind || !end.done || e.steps.length < 2) continue;
    const top = end.rows[0]!;
    if (end.kind === 'inverse') {
      input.push(`inverse ${end.a0} ${end.b0}`);
      expected.push(end.inverse === null ? 'none' : String(end.inverse));
    } else if (end.extended) {
      input.push(`ext ${end.a0} ${end.b0}`);
      expected.push(`${end.d} ${top.x} ${top.y}`);
    } else {
      input.push(`gcd ${end.a0} ${end.b0}`);
      expected.push(String(end.d));
    }
  }
  return { input, expected };
}

export default euclid;
