import { Timeline } from '../../engine/timeline';
import type { OpCall, Preset, SavedExample, Settings, VizDef } from '../../engine/types';
import { approachSetting } from '../_patterns/kit';
import cppSource from './code/cpp/xor_tricks.hpp?raw';
import javaSource from './code/java/XorTricks.java?raw';
import pythonSource from './code/python/xor_tricks.py?raw';
import missingSet from './examples/missing-set.json';
import missingXor from './examples/missing-xor.json';
import singleHashMap from './examples/single-hash-map.json';
import singleXor from './examples/single-xor.json';
import swapSelf from './examples/swap-self.json';
import swapTemp from './examples/swap-temp.json';
import swapXor from './examples/swap-xor.json';
import threeTimes from './examples/three-times.json';
import twoHashMap from './examples/two-hash-map.json';
import twoSingles from './examples/two-singles.json';
import explain from './explain.md?raw';
import { listFor, type ListOptions } from './lists';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  ops,
  parseInput,
  pseudocode,
  type Goal,
  type XExtra,
  type XSettings,
  type XState,
} from './model';
import { xorPractice } from './practice';
import { view } from './view';

const goalOf = (s?: Settings): Goal => (s?.goal as Goal) ?? 'single';

const fits =
  (o: ListOptions = {}) =>
  (rng: Parameters<Preset['make']>[0], n: number, s?: Settings): OpCall[] => [
    ['load', listFor(rng, goalOf(s), n, o).join(' ')],
    ['find'],
  ];

const presets: Preset[] = [
  { label: 'Random, to suit the goal', make: fits() },
  { label: 'Big values (six bits)', make: fits({ big: true }) },
  { label: 'The answer comes first (0 for the missing number)', make: fits({ at: 'first' }) },
  { label: 'The answer comes last (n for the missing number)', make: fits({ at: 'last' }) },
  { label: 'A single that appears three times', make: fits({ triple: true }) },
  {
    label: 'Then swap the first and last values',
    make: (rng, n, s) => {
      const vs = listFor(rng, goalOf(s), n);
      return [
        ['load', vs.join(' ')],
        ['swap', 0, vs.length - 1],
      ];
    },
  },
];

export const xorTricks: VizDef<XState, XSettings, XExtra> = {
  id: 'xor-tricks',
  title: 'XOR tricks',
  family: 'Bit tricks',
  blurb:
    'x ^ x = 0 and x ^ 0 = x: XOR a list together and the pairs cancel. The single number among pairs, the missing number in 0..n, two singles split by their lowest differing bit, and a swap without a temporary, against counting with a hash map.',
  settings: [
    approachSetting({
      pattern: 'XOR everything, O(1) extra space',
      naive: 'Count with a hash map, O(n) extra space',
      help: 'Both give the same answer in O(n) time. The difference is space: watch kept. Swap uses a temporary instead.',
    }),
    {
      kind: 'choice',
      key: 'goal',
      label: 'Find',
      options: [
        { value: 'single', label: 'The value without a pair' },
        { value: 'missing', label: 'The number missing from 0..n' },
        { value: 'two', label: 'The two values without a pair' },
      ],
      help: 'Each starts from a list that suits it.',
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
      label: 'Values',
      placeholder: 'e.g. 4 1 6 4 9 6 1, or 0 3 to swap',
      maxLength: 60,
      sample: '1',
      parse: parseInput,
    },
    buttons: [
      { op: 'find', label: 'Find', usesInput: false, primary: true },
      { op: 'swap', label: 'Swap', usesInput: true, args: ['an index', 'another index'] },
      { op: 'load', label: 'Load', usesInput: true },
    ],
    random: {
      label: 'Random values',
      make: (rng) => [['load', listFor(rng, 'single', rng.int(5, 9)).join(' ')], ['find']],
    },
    presets,
    sizes: [5, 7, 9],
  },
  explain,
  complexity: [
    {
      op: 'single number, XOR',
      best: {
        cost: 'Θ(n)',
        why: 'Every value is XORed in once, whatever the order.',
        example: 'single-xor',
      },
      average: {
        cost: 'Θ(n)',
        why: 'n XORs and one number kept: O(1) extra space.',
        example: 'single-xor',
      },
      worst: {
        cost: 'Θ(n)',
        why: 'A value three times still cancels to one copy: the same n XORs.',
        example: 'three-times',
      },
    },
    {
      op: 'single number, hash map',
      best: {
        cost: 'Θ(n)',
        why: 'Counting reads and writes the map once per value; the scan can stop at the first odd count.',
        example: 'single-hash-map',
      },
      average: {
        cost: 'Θ(n) expected',
        why: 'About n/2 counts kept: O(n) extra space.',
        example: 'single-hash-map',
      },
      worst: {
        cost: 'O(n²)',
        why: 'Only if the hash function sends every key to one bucket. Sorting instead is Θ(n log n).',
      },
    },
    {
      op: 'missing number, XOR',
      best: {
        cost: 'Θ(n)',
        why: '2n XORs, and nothing that can overflow.',
        example: 'missing-xor',
      },
      average: {
        cost: 'Θ(n)',
        why: 'Each index and each value goes in once.',
        example: 'missing-xor',
      },
      worst: { cost: 'Θ(n)', why: 'The same 2n XORs whichever number is missing.' },
      note: 'n(n + 1)/2 minus the sum also works, until the sum overflows a fixed-size integer.',
    },
    {
      op: 'two singles, XOR',
      best: {
        cost: 'Θ(n)',
        why: 'Two passes: one for a ^ b, one to split and XOR each group.',
        example: 'two-singles',
      },
      average: {
        cost: 'Θ(n)',
        why: '3n + 2 bit operations and four numbers kept.',
        example: 'two-singles',
      },
      worst: {
        cost: 'Θ(n)',
        why: 'Still two passes, whichever bit splits them.',
        example: 'two-hash-map',
      },
    },
    {
      op: 'swap without a temporary',
      best: { cost: 'Θ(1)', why: 'Three XORs.', example: 'swap-xor' },
      average: {
        cost: 'Θ(1)',
        why: 'Three copies with a temporary: no slower.',
        example: 'swap-temp',
      },
      worst: {
        cost: 'Θ(1)',
        why: 'Swapping a slot with itself must be skipped, or it becomes 0.',
        example: 'swap-self',
      },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as XSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    singleXor,
    singleHashMap,
    threeTimes,
    missingXor,
    missingSet,
    twoSingles,
    twoHashMap,
    swapXor,
    swapTemp,
    swapSelf,
  ] as unknown as SavedExample[],
  practice: xorPractice(() => xorTricks),
  preview: { example: 'two-singles', level: 2 },
};

/**
 * Driver protocol for the code tabs: "single v ...", "missing v ..." and "two v ..." print the
 * answer (the two singles smaller first); "swap i j v ..." prints the list after swapping.
 */
function codeScript(calls: OpCall[], settings: XSettings) {
  const t = new Timeline(xorTricks, settings, 1, calls);
  const input: string[] = [];
  const expected: string[] = [];
  let cur = t.initial.state.a;
  for (const e of t.entries) {
    const last = e.steps.at(-1)!;
    const result = last.extra?.result;
    if (e.call[0] === 'find' && result) {
      input.push(`${settings.goal} ${cur.join(' ')}`);
      expected.push(result.join(' '));
    } else if (e.call[0] === 'swap' && last.vars?.i !== undefined) {
      input.push(`swap ${last.vars.i} ${last.vars.j} ${cur.join(' ')}`);
      expected.push(e.end.a.join(' '));
    }
    cur = e.end.a;
  }
  return { input, expected };
}

export default xorTricks;
