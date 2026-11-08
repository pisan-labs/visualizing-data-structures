import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import { parseWhole } from '../_recursion/kit';
import cppSource from './code/cpp/amortized.hpp?raw';
import javaSource from './code/java/Amortized.java?raw';
import pythonSource from './code/python/amortized.py?raw';
import chargeTooSmall from './examples/charge-too-small.json';
import constantGrowthBank from './examples/constant-growth-bank.json';
import constantGrowth from './examples/constant-growth.json';
import counterCoins from './examples/counter-coins.json';
import counterFlips from './examples/counter-flips.json';
import counterOneCoin from './examples/counter-one-coin.json';
import counterPotential from './examples/counter-potential.json';
import doublingAverage from './examples/doubling-average.json';
import doublingCoins from './examples/doubling-coins.json';
import doublingPotential from './examples/doubling-potential.json';
import expensiveAppend from './examples/expensive-append.json';
import growthNeedsFour from './examples/growth-needs-four.json';
import potentialBelowStart from './examples/potential-below-start.json';
import explain from './explain.md?raw';
import {
  MAX_OPS,
  chargeOf,
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  simulate,
  type AmExtra,
  type AmSettings,
  type AmState,
} from './model';
import { amortizedPractice } from './practice';
import { view } from './view';

export const parseK = (token: string): Value | Error => parseWhole(token, 1, MAX_OPS, 'k');

/**
 * The number of operations, at most `limit`, whose last one is the most expensive so far (the
 * worst case) or costs 1 (the best case), from the model's own plan.
 */
function endingOn(which: 'worst' | 'best', limit: number, settings?: Settings): number {
  const st = { ...defaults, ...settings } as AmSettings;
  const { costs } = simulate(init(st), st, Math.min(limit, MAX_OPS)).plan;
  let pick = 1;
  costs.forEach((c, j) => {
    if (which === 'best' ? c === 1 : c >= costs[pick - 1]!) pick = j + 1;
  });
  return pick;
}

export const amortizedAnalysis: VizDef<AmState, AmSettings, AmExtra> = {
  id: 'amortized-analysis',
  title: 'Amortized analysis',
  family: 'Foundations',
  blurb:
    'Append to a dynamic array or increment a binary counter, and find the cost per operation three ways: the aggregate average, coins in a bank, and a potential Φ.',
  settings: [
    {
      kind: 'choice',
      key: 'structure',
      label: 'Structure',
      options: [
        { value: 'array', label: 'Dynamic array: append' },
        { value: 'counter', label: 'Binary counter: increment' },
      ],
    },
    {
      kind: 'choice',
      key: 'method',
      label: 'Method',
      options: [
        { value: 'aggregate', label: 'Aggregate: total cost ÷ number of operations' },
        { value: 'accounting', label: 'Accounting: charge coins, bank the spares' },
        { value: 'potential', label: 'Potential: actual cost + change in Φ' },
      ],
      help: 'The three methods of CLRS (chapter 16, or 17 in older editions). They agree whenever each is done right.',
    },
    {
      kind: 'choice',
      key: 'growth',
      label: 'Array grows to',
      options: [
        { value: '2', label: '2 × capacity' },
        { value: '1.5', label: '⌈1.5 × capacity⌉' },
        { value: '4', label: 'capacity + 4 (a constant)' },
      ],
      help: 'Growing by a factor keeps append O(1) amortized; growing by a constant does not.',
    },
    {
      kind: 'choice',
      key: 'charge',
      label: 'Accounting charge',
      options: [
        { value: 'auto', label: 'Textbook: 3 per append (4 at 1.5), 2 per increment' },
        { value: '1', label: '1 coin' },
        { value: '2', label: '2 coins' },
        { value: '3', label: '3 coins' },
        { value: '4', label: '4 coins' },
      ],
      help: 'Too small a charge lets the bank go below zero: the page marks the operation where it happens.',
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
      label: 'k',
      placeholder: `1 to ${MAX_OPS}`,
      maxLength: 3,
      sample: '5',
      parse: parseK,
    },
    buttons: [
      { op: 'run', label: 'Run k operations', usesInput: true, primary: true },
      { op: 'once', label: 'One more', usesInput: false },
    ],
    presets: [
      { label: 'n operations', make: (_rng, size) => [['run', size]] },
      {
        label: 'n operations, one at a time',
        make: (_rng, size) => Array.from({ length: size }, () => ['once'] as OpCall),
      },
      {
        label: 'Ending on the most expensive one (worst case)',
        make: (_rng, size, st) => [['run', endingOn('worst', size + 1, st)]],
      },
      {
        label: 'Ending on a cheap one (best case)',
        make: (_rng, size, st) => [['run', endingOn('best', size, st)]],
      },
      { label: 'A random number of operations', make: (rng) => [['run', rng.int(2, MAX_OPS)]] },
    ],
    sizes: [4, 8, 16, 32],
  },
  explain,
  complexity: [
    {
      op: 'append(x), doubling',
      best: { cost: 'O(1)', why: 'There is room: one write.', example: 'doubling-coins' },
      average: {
        cost: 'O(1) amortized',
        why: 'n appends cost under 3n in total, so under 3 each.',
        example: 'doubling-average',
      },
      worst: {
        cost: 'O(n)',
        why: 'A full array copies all n items before the write.',
        example: 'expensive-append',
      },
      note: 'Amortized is a guarantee for every sequence of appends, not an average over inputs. One append can still cost n.',
    },
    {
      op: 'append(x), growing by a constant',
      best: { cost: 'O(1)', why: 'There is room: one write.', example: 'constant-growth' },
      average: {
        cost: 'O(n) amortized',
        why: 'Every 4th append copies everything: about n²/8 copies for n appends.',
        example: 'constant-growth',
      },
      worst: {
        cost: 'O(n)',
        why: 'A full array copies all n items.',
        example: 'constant-growth-bank',
      },
    },
    {
      op: 'increment()',
      best: { cost: 'O(1)', why: 'Bit 0 is 0: one flip.', example: 'counter-coins' },
      average: {
        cost: 'O(1) amortized',
        why: 'Bit i flips once every 2ⁱ increments: under 2n flips for n increments.',
        example: 'counter-flips',
      },
      worst: {
        cost: 'O(log n)',
        why: 'From 0111…1 to 1000…0 every bit flips.',
        example: 'counter-flips',
      },
      note: 'For a k-bit counter that never wraps, the worst single increment flips all k bits.',
    },
    {
      op: 'n operations from empty (doubling, or the counter)',
      best: { cost: 'O(n)', why: 'At least one unit of work each.', example: 'doubling-average' },
      average: { cost: 'O(n)', why: 'The same bound holds for every sequence.' },
      worst: {
        cost: 'O(n)',
        why: 'Under 3n for appends, under 2n for increments.',
        example: 'counter-flips',
      },
    },
  ],
  practice: amortizedPractice(() => amortizedAnalysis),
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as AmSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    doublingCoins,
    chargeTooSmall,
    doublingAverage,
    expensiveAppend,
    constantGrowth,
    constantGrowthBank,
    growthNeedsFour,
    doublingPotential,
    potentialBelowStart,
    counterCoins,
    counterOneCoin,
    counterFlips,
    counterPotential,
  ] as unknown as SavedExample[],
  preview: { example: 'doubling-coins', level: 2 },
  opening: 'doubling-coins',
};

/**
 * Driver protocol for the code tabs: "array 2" (or "array 1.5", "array 4") starts an empty
 * dynamic array with that growth rule, "counter" an 8-bit counter, and "charge 3" opens a bank
 * with that charge. Then "append" or "increment" once per operation, each printing the
 * operation's actual cost and the bank after it. A run is one line per operation it did.
 */
function codeScript(calls: OpCall[], settings: AmSettings) {
  const t = new Timeline(amortizedAnalysis, settings, 1, calls);
  const array = settings.structure === 'array';
  const input = [array ? `array ${settings.growth}` : 'counter', `charge ${chargeOf(settings)}`];
  const expected: string[] = [];
  let done = 0;
  for (const e of t.entries) {
    for (let j = done; j < e.end.costs.length; j++) {
      input.push(array ? 'append' : 'increment');
      expected.push(`${e.end.costs[j]} ${e.end.banks[j]}`);
    }
    done = e.end.costs.length;
  }
  return { input, expected };
}

export default amortizedAnalysis;
