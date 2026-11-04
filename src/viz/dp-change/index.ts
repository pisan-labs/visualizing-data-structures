import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import cppSource from './code/cpp/change.hpp?raw';
import javaSource from './code/java/Change.java?raw';
import pythonSource from './code/python/change.py?raw';
import countWays from './examples/count-ways.json';
import greedyFails from './examples/greedy-fails.json';
import greedyStuck from './examples/greedy-stuck.json';
import greedyWorks from './examples/greedy-works.json';
import manyWays from './examples/many-ways.json';
import mostWork from './examples/most-work.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  MAX_AMOUNT,
  MAX_COINS,
  ops,
  pseudocode,
  type ChangeExtra,
  type ChangeSettings,
  type ChangeState,
} from './model';
import { changePractice } from './practice';
import { view } from './view';

/** The input box holds an amount, or the coins: whole numbers from 0 to 12. */
export function parseChange(text: string): Value | Error {
  const tokens = text.split(/[\s,;]+/).filter(Boolean);
  if (tokens.length === 0) return new Error('Type an amount, such as 6, or coins, such as 1 3 4.');
  if (tokens.length > MAX_COINS)
    return new Error(`That is ${tokens.length} numbers. Use at most ${MAX_COINS} coins.`);
  for (const t of tokens) {
    if (!/^\d+$/.test(t) || Number(t) > MAX_AMOUNT)
      return new Error(`"${t}" is not a whole number from 0 to ${MAX_AMOUNT}.`);
  }
  return tokens.length === 1 ? Number(tokens[0]) : tokens.map(Number).join(' ');
}

const coinsCall = (coins: number[]): OpCall => ['coins', coins.join(' ')];

function randomCoins(rng: Rng, withOne: boolean): number[] {
  const out = new Set<number>(withOne ? [1] : []);
  const n = rng.int(2, 4);
  while (out.size < n) out.add(rng.int(2, 9));
  return [...out].sort((a, b) => a - b);
}

export const dpChange: VizDef<ChangeState, ChangeSettings, ChangeExtra> = {
  id: 'dp-change',
  title: 'Making change',
  family: 'Dynamic programming',
  blurb:
    'Pay an amount with the fewest coins, or count the ways to make it, by filling a table from 0 up.',
  settings: [
    {
      kind: 'choice',
      key: 'goal',
      label: 'Find',
      options: [
        { value: 'fewest', label: 'The fewest coins (and which coins)' },
        { value: 'ways', label: 'The number of ways to make the amount' },
      ],
      help: 'Same idea, a different rule per cell: the smallest of the choices, or their sum.',
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
      label: 'Amount or coins',
      placeholder: `e.g. 6, or coins 1 3 4`,
      maxLength: 40,
      sample: '6',
      parse: parseChange,
    },
    buttons: [
      { op: 'change', label: 'Make change', usesInput: true, primary: true },
      { op: 'coins', label: 'Set coins', usesInput: true },
    ],
    random: { label: 'Random amount', make: (rng) => [['change', rng.int(1, MAX_AMOUNT)]] },
    presets: [
      {
        label: 'Coins 1, 3, 4 (greedy fails at 6)',
        make: () => [coinsCall([1, 3, 4]), ['change', 6]],
      },
      {
        label: 'Coins 1, 5, 10 (greedy works)',
        make: (_rng, size) => [coinsCall([1, 5, 10]), ['change', size]],
      },
      {
        label: 'Random coins with a 1',
        make: (rng, size) => [coinsCall(randomCoins(rng, true)), ['change', size]],
      },
      {
        label: 'Random coins, no 1 (some amounts fail)',
        make: (rng, size) => [coinsCall(randomCoins(rng, false)), ['change', size]],
      },
      {
        label: 'Five coins (the most work)',
        make: (_rng, size) => [coinsCall([1, 2, 3, 4, 5]), ['change', size]],
      },
    ],
    sizes: [6, 8, 10, 12],
  },
  explain,
  complexity: [
    {
      op: 'change(A), fewest coins',
      best: {
        cost: 'O(A)',
        why: 'When only one coin fits most amounts, each cell tries one coin.',
        example: 'greedy-stuck',
      },
      average: {
        cost: 'O(A·k)',
        why: 'Each of the A amounts tries each of the k coins that fits.',
        example: 'greedy-fails',
      },
      worst: {
        cost: 'O(A·k)',
        why: 'Every coin fits nearly every amount: 50 tries for 5 coins and amount 12.',
        example: 'most-work',
      },
      note: 'Space: O(A) for F and the coin row. Tracing back the coins adds O(F[A]).',
    },
    {
      op: 'change(A), number of ways',
      best: {
        cost: 'O(A·k)',
        why: 'Every row fills every amount, whatever the coins.',
        example: 'count-ways',
      },
      average: { cost: 'O(A·k)', why: 'One addition per cell, (k + 1)(A + 1) cells.' },
      worst: {
        cost: 'O(A·k)',
        why: 'Large counts cost nothing extra: 13 ways to make 12 are added, never listed.',
        example: 'many-ways',
      },
      note: 'Space: O(A·k) for the table, or O(A) with one row updated a coin at a time, as in the code.',
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as ChangeSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    greedyFails,
    greedyStuck,
    greedyWorks,
    countWays,
    manyWays,
    mostWork,
  ] as unknown as SavedExample[],
  practice: changePractice(() => dpChange),
};

/**
 * Driver protocol for the code tabs: "coins c1 c2 ..." sets the coins; "change a" prints the
 * number of coins, then the coins in the order the traceback takes them, or "none"; "ways a"
 * prints the number of ways. The page's goal picks change or ways. Calls the model rejects are
 * left out.
 */
function codeScript(calls: OpCall[], settings: ChangeSettings) {
  const t = new Timeline(dpChange, settings, 1, calls);
  const input = [`coins ${t.initial.state.coins.join(' ')}`];
  const expected: string[] = [];
  let before = t.initial.state;
  for (const e of t.entries) {
    if (e.end !== before) {
      const amount = e.end.amount;
      const last = e.steps.at(-1)!;
      if (e.call[0] === 'coins') {
        input.push(`coins ${e.end.coins.join(' ')}`);
      } else if (settings.goal === 'ways') {
        input.push(`ways ${amount}`);
        expected.push(String(last.vars?.ways));
      } else {
        input.push(`change ${amount}`);
        const fewest = e.end.table[0]![amount]!;
        const paid = (last.extra?.taken ?? []).map((x) => x.coin);
        expected.push(fewest === Infinity ? 'none' : [fewest, ...paid].join(' '));
      }
    }
    before = e.end;
  }
  return { input, expected };
}

export default dpChange;
