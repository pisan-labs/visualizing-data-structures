import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import cppSource from './code/cpp/shuffle.hpp?raw';
import javaSource from './code/java/Shuffle.java?raw';
import pythonSource from './code/python/shuffle.py?raw';
import evenCounts from './examples/even-counts.json';
import naiveBias from './examples/naive-bias.json';
import naiveOne from './examples/naive-one-shuffle.json';
import oneShuffle from './examples/one-shuffle.json';
import rightToLeft from './examples/right-to-left.json';
import twoItems from './examples/two-items.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  MAX_ITEMS,
  ops,
  pseudocode,
  type FySettings,
  type FyState,
} from './model';
import { fisherYatesPractice } from './practice';
import { view } from './view';

/** Values separated by spaces (for Load), or one number (for Run trials). */
export function parseValues(token: string): Value | Error {
  const t = token.trim().replace(/\s+/g, ' ');
  if (!t) return new Error('Type some values first, such as A B C D, or a number of trials.');
  if (t.split(/[ ,]+/).some((v) => v.length > 3))
    return new Error('Keep each value to 3 characters.');
  if (t.includes('|')) return new Error('Values cannot contain |.');
  return t;
}

const nums = (n: number) => Array.from({ length: n }, (_, k) => String(k + 1)).join(' ');

export const fisherYates: VizDef<FyState, FySettings, undefined> = {
  id: 'fisher-yates',
  title: 'Fisher-Yates shuffle',
  family: 'Randomized algorithms',
  blurb:
    'Shuffle in place by moving a random unshuffled item into each position, and see why swapping with any position is biased.',
  settings: [
    {
      kind: 'choice',
      key: 'method',
      label: 'Swap with',
      options: [
        { value: 'correct', label: 'A random unshuffled position (Fisher-Yates)' },
        { value: 'naive', label: 'Any position at all (naive, biased)' },
      ],
      help: 'The naive version makes nⁿ equally likely runs for n! orders. nⁿ is not a multiple of n! (for n > 2), so the orders cannot all be equally likely.',
    },
    {
      kind: 'choice',
      key: 'direction',
      label: 'Direction',
      options: [
        { value: 'forward', label: 'Left to right: j from i to n − 1 (CLRS)' },
        { value: 'backward', label: 'Right to left: j from 0 to i (Durstenfeld, most libraries)' },
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
      label: 'values or trials',
      placeholder: `e.g. A B C D E (up to ${MAX_ITEMS}), or 6000 trials`,
      maxLength: 40,
      sample: 'A B C D E',
      parse: parseValues,
    },
    buttons: [
      { op: 'shuffle', label: 'Shuffle', usesInput: false, primary: true },
      { op: 'load', label: 'Load values', usesInput: true },
      { op: 'trials', label: 'Run trials', usesInput: true },
    ],
    random: { label: 'Shuffle 1 to 8', make: () => [['load', nums(8)], ['shuffle']] },
    presets: [
      {
        label: 'Numbers 1 to n, shuffled',
        make: (_rng, size) => [['load', nums(size)], ['shuffle']],
      },
      {
        label: 'Shuffle twice',
        make: (_rng, size) => [['load', nums(size)], ['shuffle'], ['shuffle']],
      },
      { label: '600 trials of 1 2 3', make: () => [['trials', 600]] },
      { label: '6000 trials of 1 2 3', make: () => [['trials', 6000]] },
    ],
    sizes: [4, 6, 8],
  },
  explain,
  complexity: [
    {
      op: 'shuffle n items',
      best: {
        cost: 'O(n)',
        why: 'n − 1 random picks and swaps, whatever comes up.',
        example: 'two-items',
      },
      average: {
        cost: 'O(n)',
        why: 'One pass; every step does a constant amount of work.',
        example: 'one-shuffle',
      },
      worst: {
        cost: 'O(n)',
        why: 'No retries, no rejection: the same n − 1 steps every time.',
        example: 'right-to-left',
      },
      note: 'Assuming a random number in a range costs O(1). The extra memory is O(1): it shuffles in place.',
    },
    {
      op: 'naive shuffle (swap with any position)',
      best: { cost: 'O(n)', why: 'n swaps: just as fast.', example: 'naive-one-shuffle' },
      average: {
        cost: 'O(n)',
        why: 'Just as fast, and wrong: nⁿ runs spread unevenly over n! orders.',
        example: 'naive-bias',
      },
      worst: {
        cost: 'O(n)',
        why: 'Speed is not the problem; the bias is, and it gets worse as n grows.',
        example: 'naive-bias',
      },
    },
  ],
  practice: fisherYatesPractice(() => fisherYates),
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as FySettings),
  },
  examples: [
    oneShuffle,
    evenCounts,
    naiveBias,
    rightToLeft,
    naiveOne,
    twoItems,
  ] as unknown as SavedExample[],
  preview: { example: 'one-shuffle', level: 2 },
};

/**
 * Driver protocol: "shuffle x1 ... xn | j1 j2 ..." gives the values and the picks the model made,
 * and prints the result. The code is left to right and correct, so the model runs that way.
 */
function codeScript(calls: OpCall[], settings: FySettings) {
  const t = new Timeline(fisherYates, { ...settings, ...defaults }, 1, calls);
  const input: string[] = [];
  const expected: string[] = [];
  let before = t.at(0).step.state.items;
  for (const e of t.entries) {
    if (e.call[0] === 'shuffle') {
      input.push(`shuffle ${before.map((x) => x.v).join(' ')} | ${e.end.picks.join(' ')}`);
      expected.push(e.end.items.map((x) => x.v).join(' '));
    }
    before = e.end.items;
  }
  return { input, expected };
}

export default fisherYates;
