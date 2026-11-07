import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, VizDef } from '../../engine/types';
import { parseWhole } from '../_recursion/kit';
import cppSource from './code/cpp/fibonacci.hpp?raw';
import javaSource from './code/java/Fibonacci.java?raw';
import pythonSource from './code/python/fibonacci.py?raw';
import baseCases from './examples/base-cases.json';
import explosion from './examples/explosion.json';
import fibFour from './examples/fib-four.json';
import fifteenCalls from './examples/fifteen-calls.json';
import memoEight from './examples/memo-eight.json';
import memoFive from './examples/memo-five.json';
import threeTimes from './examples/three-times.json';
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
  type FibSettings,
  type FibState,
} from './model';
import { fibPractice } from './practice';
import { view } from './view';

export const fibonacciCalls: VizDef<FibState, FibSettings, undefined> = {
  id: 'fibonacci-calls',
  title: 'Fibonacci call tree',
  family: 'Recursion',
  blurb:
    'Every call of the naive fib(n) makes two more. Count them, find the repeats, then add a memo.',
  settings: [
    {
      kind: 'choice',
      key: 'memo',
      label: 'Remember answers',
      options: [
        { value: 'none', label: 'No: every call computes its answer' },
        { value: 'memo', label: 'Yes: look n up in a memo first' },
      ],
      help: 'The tree keeps the shape of the plain recursion, so with the memo on, the calls it cuts off are drawn dashed.',
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
      placeholder: `e.g. 5 (0 to ${MAX_N})`,
      maxLength: 20,
      sample: '4',
      parse: (t) => parseWhole(t, 0, MAX_N),
    },
    buttons: [{ op: 'fib', label: 'Call fib', usesInput: true, primary: true, bulk: true }],
    random: { label: 'Random n', make: (rng) => [['fib', rng.int(3, 6)]] },
    presets: [
      { label: 'fib(n)', make: (_rng, size) => [['fib', size]] },
      {
        label: 'fib(1) up to fib(n)',
        make: (_rng, size) => Array.from({ length: size }, (_, i) => ['fib', i + 1] as OpCall),
      },
      {
        label: 'The base cases',
        make: () => [
          ['fib', 0],
          ['fib', 1],
        ],
      },
    ],
    sizes: [3, 5, 8],
  },
  explain,
  complexity: [
    {
      op: 'fib(n) without a memo: time',
      best: { cost: 'O(1)', why: 'n = 0 or 1: one call.', example: 'base-cases' },
      average: {
        cost: 'Θ(φⁿ)',
        why: 'fib(n) makes 2 fib(n + 1) - 1 calls, and fib(n) grows like 1.618ⁿ.',
        example: 'fifteen-calls',
      },
      worst: {
        cost: 'Θ(φⁿ)',
        why: 'Every subproblem is solved again each time it is reached: fib(8) makes 67 calls.',
        example: 'explosion',
      },
      note: 'φ = (1 + √5) / 2 ≈ 1.618, the golden ratio. Each step up in n costs about 1.6 times as much.',
    },
    {
      op: 'fib(n) without a memo: stack depth',
      best: { cost: 'O(1)', why: 'A base case is one frame.', example: 'base-cases' },
      average: {
        cost: 'O(n)',
        why: 'The stack only ever holds one path down the tree.',
        example: 'fib-four',
      },
      worst: {
        cost: 'O(n)',
        why: 'The longest path, fib(n) down to fib(1), has n frames.',
        example: 'explosion',
      },
      note: 'The tree is exponential, but the stack is not: the space cost is only the deepest path.',
    },
    {
      op: 'fib(n) with a memo: time',
      best: { cost: 'O(1)', why: 'n = 0 or 1: one call.', example: 'base-cases' },
      average: {
        cost: 'O(n)',
        why: 'Each fib(k) is computed once; the other calls are answered at once.',
        example: 'memo-five',
      },
      worst: {
        cost: 'O(n)',
        why: '2n - 1 calls for n ≥ 1: fib(8) makes 15 instead of 67.',
        example: 'memo-eight',
      },
      note: 'Space: O(n) for the memo, and O(n) for the stack.',
    },
  ],
  practice: fibPractice(() => fibonacciCalls),
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as FibSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    fifteenCalls,
    baseCases,
    fibFour,
    threeTimes,
    explosion,
    memoFive,
    memoEight,
  ] as unknown as SavedExample[],
  preview: { example: 'fifteen-calls', level: 2 },
};

/**
 * Driver protocol for the code tabs: "fib n" (no memo) or "memo n" prints the value and the
 * number of calls, "5 15". Rejected calls print nothing, so they are left out.
 */
function codeScript(calls: OpCall[], settings: FibSettings) {
  const t = new Timeline(fibonacciCalls, settings, 1, calls);
  const op = settings.memo === 'memo' ? 'memo' : 'fib';
  const input: string[] = [];
  const expected: string[] = [];
  t.entries.forEach((e) => {
    const vars = e.steps[e.steps.length - 1]!.vars;
    if (typeof vars?.result !== 'number') return;
    input.push(`${op} ${Number(e.call[1])}`);
    expected.push(`${vars.result} ${vars.calls}`);
  });
  return { input, expected };
}

export default fibonacciCalls;
