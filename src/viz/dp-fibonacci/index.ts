import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import { wholeFromArg } from '../_dp/kit';
import cppSource from './code/cpp/fibonacci.hpp?raw';
import javaSource from './code/java/Fibonacci.java?raw';
import pythonSource from './code/python/fibonacci.py?raw';
import baseCases from './examples/base-cases.json';
import bottomUp from './examples/bottom-up.json';
import largest from './examples/largest.json';
import memoHits from './examples/memo-hits.json';
import memoOrder from './examples/memo-order.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  MAX_N,
  ops,
  pseudocode,
  type FibExtra,
  type FibSettings,
  type FibState,
} from './model';
import { fibPractice } from './practice';
import { view } from './view';

/** The input box holds n. */
export function parseN(token: string): Value | Error {
  const n = wholeFromArg(token, 0, MAX_N, 'n');
  return typeof n === 'string' ? new Error(n) : n;
}

export const dpFibonacci: VizDef<FibState, FibSettings, FibExtra> = {
  id: 'dp-fibonacci',
  title: 'Fibonacci numbers',
  family: 'Dynamic programming',
  blurb:
    'Fill a table of Fibonacci numbers bottom-up, or recurse top-down and remember each answer.',
  settings: [
    {
      kind: 'choice',
      key: 'style',
      label: 'Style',
      options: [
        { value: 'bottomup', label: 'Bottom-up: fill F[0..n] from the left (CLRS)' },
        { value: 'memo', label: 'Top-down with a memo: recurse, and remember each answer' },
      ],
      help: 'Same values and the same O(n). Top-down fills the cells in the order the calls finish.',
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
      label: 'n',
      placeholder: `0 to ${MAX_N}, e.g. 10`,
      maxLength: 6,
      sample: '6',
      parse: parseN,
    },
    buttons: [{ op: 'fib', label: 'Compute F(n)', usesInput: true, primary: true }],
    random: { label: 'Random n', make: (rng) => [['fib', rng.int(2, MAX_N)]] },
    presets: [
      {
        label: 'F(n), n from the size list',
        make: (_rng, size) => [['fib', Math.min(size, MAX_N)]],
      },
      {
        label: 'The base cases, then F(2)',
        make: () => [
          ['fib', 0],
          ['fib', 1],
          ['fib', 2],
        ],
      },
      { label: 'Random n', make: (rng) => [['fib', rng.int(2, MAX_N)]] },
      { label: `The largest table, n = ${MAX_N}`, make: () => [['fib', MAX_N]] },
    ],
    sizes: [5, 8, 12, 15],
  },
  explain,
  complexity: [
    {
      op: 'fib(n), bottom-up',
      best: {
        cost: 'O(n)',
        why: 'One addition per cell after the base cases: n - 1 of them.',
        example: 'bottom-up',
      },
      average: { cost: 'O(n)', why: 'Every run fills the same n + 1 cells, left to right.' },
      worst: {
        cost: 'O(n)',
        why: 'F(15) takes 14 additions. The plain recursion makes 1973 calls for it.',
        example: 'largest',
      },
      note: 'Space: O(n) for the table. Keeping only the last two values cuts it to O(1).',
    },
    {
      op: 'fib(n), top-down with a memo',
      best: {
        cost: 'O(n)',
        why: 'Each value is worked out once: n + 1 calls fill a cell.',
        example: 'memo-order',
      },
      average: {
        cost: 'O(n)',
        why: 'Every other call is a memo hit and returns at once: n - 2 of them.',
      },
      worst: {
        cost: 'O(n)',
        why: '2n - 1 calls in all, 17 for F(9), against 109 without the memo.',
        example: 'memo-hits',
      },
      note: 'Space: O(n) for the memo, plus up to n calls waiting on the stack.',
    },
    {
      op: 'fib(n), plain recursion',
      best: {
        cost: 'O(φⁿ)',
        why: 'No memo, so the same values are worked out again and again: 2F(n + 1) - 1 calls.',
        example: 'base-cases',
      },
      average: { cost: 'O(φⁿ)', why: 'The call count grows like F(n) itself, about 1.618ⁿ.' },
      worst: { cost: 'O(φⁿ)', why: 'F(30) takes 2,692,537 calls. The table needs 29 additions.' },
      note: 'φ = (1 + √5)/2 ≈ 1.618. The Fibonacci call tree page draws these calls.',
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as FibSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [bottomUp, memoOrder, memoHits, baseCases, largest] as unknown as SavedExample[],
  practice: fibPractice(() => dpFibonacci),
  preview: { example: 'bottom-up' },
};

/**
 * Driver protocol for the code tabs: "fib n" prints F(n) bottom-up and "memo n" prints it
 * top-down, following the page's style. Calls the model rejects are left out.
 */
function codeScript(calls: OpCall[], settings: FibSettings) {
  const t = new Timeline(dpFibonacci, settings, 1, calls);
  const input: string[] = [];
  const expected: string[] = [];
  for (const e of t.entries) {
    const result = e.steps.at(-1)!.vars?.result;
    if (result === undefined) continue;
    input.push(`${settings.style === 'memo' ? 'memo' : 'fib'} ${e.end.n}`);
    expected.push(String(result));
  }
  return { input, expected };
}

export default dpFibonacci;
