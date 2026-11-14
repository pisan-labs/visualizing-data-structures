import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, Preset, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import { approachSetting } from '../_patterns/kit';
import cppSource from './code/cpp/trading.hpp?raw';
import javaSource from './code/java/Trading.java?raw';
import pythonSource from './code/python/trading.py?raw';
import cooldownSellEarly from './examples/cooldown-sell-early.json';
import fallingPrices from './examples/falling-prices.json';
import feeMergesTrades from './examples/fee-merges-trades.json';
import freeTrading from './examples/free-trading.json';
import recursionRepeats from './examples/recursion-repeats.json';
import risingPrices from './examples/rising-prices.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  feeOf,
  init,
  initialSay,
  initialVars,
  MAX_DAYS,
  MAX_FEE,
  MAX_PRICE,
  ops,
  pseudocode,
  readPrices,
  type SMExtra,
  type SMSettings,
  type SMState,
} from './model';
import { smPractice } from './practice';
import { view } from './view';

/** The input box holds prices, one per day. */
export function parsePrices(text: string): Value | Error {
  const prices = readPrices(text);
  return typeof prices === 'string' ? new Error(prices) : prices.join(' ');
}

const between = (rng: Rng, n: number, lo: number, hi: number) =>
  Array.from({ length: n }, () => rng.int(lo, hi));

const solveIt = (prices: number[]): OpCall[] => [['load', prices.join(' ')], ['solve'], ['trace']];

const presets: Preset[] = [
  { label: 'Random prices', make: (rng, n) => solveIt(between(rng, n, 1, 9)) },
  {
    label: 'Up and down (the rules matter most)',
    make: (rng, n) => solveIt(Array.from({ length: n }, (_, i) => (i % 2 ? rng.int(6, 9) : rng.int(1, 4)))),
  },
  {
    label: 'Rising (one trade, first day to last)',
    make: (rng, n) => solveIt(between(rng, n, 1, 9).sort((a, b) => a - b)),
  },
  {
    label: 'Falling (never trade)',
    make: (rng, n) => solveIt(between(rng, n, 1, 9).sort((a, b) => b - a)),
  },
  {
    label: 'Small wiggles (a fee wipes them out)',
    make: (rng, n) => solveIt(Array.from({ length: n }, (_, i) => 5 + (i % 2 ? rng.int(0, 1) : -rng.int(0, 1)))),
  },
  { label: 'Every price the same', make: (rng, n) => solveIt(Array(n).fill(rng.int(1, 9))) },
];

export const dpStateMachine: VizDef<SMState, SMSettings, SMExtra> = {
  id: 'dp-state-machine',
  title: 'DP: states over time (buy and sell)',
  family: 'DP patterns',
  blurb:
    'Trade one item over days of prices, with a rest day after each sale or a fee on it: a small state machine (free, holding, cooling down) and a table with one row per state and one column per day, then the best plan traced back. The table takes one cell per state per day; plain recursion doubles its calls with every day.',
  settings: [
    approachSetting({
      pattern: 'The table, O(n)',
      naive: 'Plain recursion, exponential',
    }),
    {
      kind: 'boolean',
      key: 'cooldown',
      label: 'Cooldown: rest the day after each sale',
      help: 'On, a sale moves you to a third state, cooling down, and the next day must be a rest. Off, you may buy again the day after you sell.',
    },
    {
      kind: 'number',
      key: 'fee',
      label: 'Fee per sale',
      min: 0,
      max: MAX_FEE,
      help: 'Taken off every sale. A fee makes small trades lose money, so the best plan trades less.',
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
      label: 'Prices',
      placeholder: `one per day, e.g. 6 1 4 9 (1 to ${MAX_PRICE})`,
      maxLength: 40,
      sample: '6 1 4 9 1 7',
      parse: parsePrices,
    },
    buttons: [
      { op: 'solve', label: 'Solve', usesInput: false },
      { op: 'trace', label: 'Trace the plan', usesInput: false },
      { op: 'load', label: 'Load prices', usesInput: true, primary: true },
    ],
    random: { label: 'Random prices', make: (rng) => solveIt(between(rng, 6, 1, 9)) },
    presets,
    sizes: [4, 5, 6, MAX_DAYS],
  },
  explain,
  complexity: [
    {
      op: 'solve, the table',
      best: {
        cost: 'Θ(n)',
        why: 'One cell per state per day, each a max of at most two cells from the day before.',
        example: 'falling-prices',
      },
      average: {
        cost: 'Θ(n)',
        why: '3 states and 6 days: 21 cells, start column included.',
        example: 'cooldown-sell-early',
      },
      worst: {
        cost: 'Θ(n)',
        why: 'The prices never change the work: the same cells whatever they are.',
        example: 'rising-prices',
      },
      note: 'Space Θ(n) for the table; the profit alone needs only yesterday’s column, three numbers.',
    },
    {
      op: 'solve, plain recursion',
      best: {
        cost: 'Θ(1)',
        why: 'One day: each state asks only for day 0.',
      },
      average: {
        cost: 'exponential',
        why: 'Each call asks for one or two states of the day before, again and again.',
        example: 'recursion-repeats',
      },
      worst: {
        cost: 'Θ(2ⁿ)',
        why: 'Without the cooldown, free and hold each ask for both: 2ⁿ⁺¹ − 1 calls, 127 for 6 days.',
        example: 'free-trading',
      },
      note: 'With the cooldown it grows a little slower: 112 calls for 6 days, against 21 cells.',
    },
    {
      op: 'trace the plan',
      best: { cost: 'Θ(n)', why: 'One step back per day.', example: 'falling-prices' },
      average: {
        cost: 'Θ(n)',
        why: 'Each step checks which way in made the cell, at most two.',
        example: 'cooldown-sell-early',
      },
      worst: { cost: 'Θ(n)', why: 'Still one step per day, however many trades.', example: 'free-trading' },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as SMSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    cooldownSellEarly,
    freeTrading,
    feeMergesTrades,
    recursionRepeats,
    fallingPrices,
    risingPrices,
  ] as unknown as SavedExample[],
  practice: smPractice(() => dpStateMachine),
  preview: { example: 'cooldown-sell-early', level: 2 },
};

/**
 * Driver protocol for the code tabs: "best c f p1 ..." prints the most money (after Solve) and
 * "plan c f p1 ..." prints it and the trades (after Trace the plan), with c = 1 for the
 * cooldown and f the fee. Both approaches give the same answer; refused operations are left out.
 */
function codeScript(calls: OpCall[], settings: SMSettings) {
  const t = new Timeline(dpStateMachine, settings, 1, calls);
  const rules = `${settings.cooldown !== false ? 1 : 0} ${feeOf(settings)}`;
  const input: string[] = [];
  const expected: string[] = [];
  for (const e of t.entries) {
    const v = e.steps.at(-1)!.vars ?? {};
    const prices = e.end.prices.join(' ');
    if (e.call[0] === 'solve' && v.profit !== undefined) {
      input.push(`best ${rules} ${prices}`);
      expected.push(String(v.profit));
    } else if (e.call[0] === 'trace' && v.plan !== undefined) {
      input.push(`plan ${rules} ${prices}`);
      expected.push(`${v.profit} ${v.plan}`);
    }
  }
  return { input, expected };
}

export default dpStateMachine;
