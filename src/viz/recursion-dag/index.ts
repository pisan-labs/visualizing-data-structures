import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import cppSource from './code/cpp/recursion.hpp?raw';
import javaSource from './code/java/Recursion.java?raw';
import pythonSource from './code/python/recursion.py?raw';
import binomFourTwo from './examples/binom-four-two.json';
import binomSixThree from './examples/binom-six-three.json';
import fibBase from './examples/fib-base.json';
import fibEight from './examples/fib-eight.json';
import fibFive from './examples/fib-five.json';
import nothingShared from './examples/nothing-shared.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  MAX_BINOM,
  MAX_FIB,
  ops,
  pseudocode,
  readArgs,
  type DagSettings,
  type DagState,
} from './model';
import { dagPractice } from './practice';
import { view } from './view';

/** "5" or "5 2": whole numbers, read as one value. The problem decides how many it needs. */
export function parseNumbers(token: string): Value | Error {
  const words = token
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean);
  if (words.length === 0) return new Error('Type n, or n and k.');
  if (words.length > 2 || !words.every((w) => /^\d+$/.test(w)))
    return new Error('Type one whole number n, or two: n and k.');
  return words.join(' ');
}

const binomial = (settings?: Settings) => settings?.problem === 'binom';

export const recursionDag: VizDef<DagState, DagSettings, undefined> = {
  id: 'recursion-dag',
  title: 'Recursion tree vs memoized DAG',
  family: 'Recursion',
  blurb:
    'The same recursion twice: a tree with a box for every call, and a DAG with one box per subproblem.',
  settings: [
    {
      kind: 'choice',
      key: 'problem',
      label: 'Recursion',
      options: [
        { value: 'fib', label: 'Fibonacci: fib(n) = fib(n - 1) + fib(n - 2)' },
        { value: 'binom', label: 'Binomial coefficients: C(n, k) = C(n - 1, k - 1) + C(n - 1, k)' },
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
      label: 'n, or n k',
      placeholder: `e.g. 5 for fib, 5 2 for C(n, k)`,
      maxLength: 20,
      sample: '5',
      parse: parseNumbers,
    },
    buttons: [{ op: 'call', label: 'Run', usesInput: true, primary: true }],
    presets: [
      {
        label: 'fib(n), or C(n, n / 2)',
        make: (_rng, size, settings) => {
          if (!binomial(settings)) return [['call', String(Math.min(size, MAX_FIB))]];
          const n = Math.min(size, MAX_BINOM);
          return [['call', `${n} ${Math.floor(n / 2)}`]];
        },
      },
      {
        label: 'A base case',
        make: (_rng, size, settings) => [['call', binomial(settings) ? `${size} 0` : '1']],
      },
      {
        label: 'Growing: n = 2 up to n',
        make: (_rng, size, settings) =>
          Array.from(
            { length: Math.min(size, binomial(settings) ? MAX_BINOM : MAX_FIB) - 1 },
            (_, i) => ['call', binomial(settings) ? `${i + 2} 1` : String(i + 2)] as OpCall,
          ),
      },
    ],
    sizes: [3, 5, 8],
  },
  explain,
  complexity: [
    {
      op: 'fib(n): calls in the tree',
      best: { cost: 'O(1)', why: 'fib(0) and fib(1) are one call.', example: 'fib-base' },
      average: {
        cost: 'Θ(φⁿ)',
        why: '2 fib(n + 1) - 1 calls, growing about 1.6 times per step in n.',
        example: 'fib-five',
      },
      worst: { cost: 'Θ(φⁿ)', why: 'fib(8) already makes 67 calls.', example: 'fib-eight' },
    },
    {
      op: 'fib(n): calls with a memo (the DAG)',
      best: { cost: 'O(1)', why: 'A base case is one box.', example: 'fib-base' },
      average: {
        cost: 'O(n)',
        why: 'n + 1 boxes and 2(n - 1) arrows: one call per arrow, plus the first.',
        example: 'fib-five',
      },
      worst: { cost: 'O(n)', why: '2n - 1 calls: 15 for fib(8).', example: 'fib-eight' },
      note: 'Space: O(n) for the memo, and O(n) for the stack.',
    },
    {
      op: 'C(n, k): calls in the tree',
      best: { cost: 'O(1)', why: 'k = 0 or k = n is a base case.' },
      average: {
        cost: 'Θ(C(n, k))',
        why: 'Every leaf returns 1, so there are C(n, k) leaves and 2 C(n, k) - 1 calls.',
        example: 'binom-four-two',
      },
      worst: {
        cost: 'Θ(2ⁿ / √n)',
        why: 'k = n / 2 gives the largest C(n, k): 39 calls for C(6, 3).',
        example: 'binom-six-three',
      },
    },
    {
      op: 'C(n, k): calls with a memo (the DAG)',
      best: { cost: 'O(1)', why: 'k = 0 or k = n is one box.' },
      average: {
        cost: 'O(nk)',
        why: 'At most (k + 1)(n - k + 1) boxes, each computed once.',
        example: 'binom-four-two',
      },
      worst: {
        cost: 'O(n²)',
        why: 'k = n / 2 makes the lattice about n² / 4 boxes.',
        example: 'binom-six-three',
      },
      note: 'The DAG is Pascal’s triangle, cut down to the part C(n, k) needs. With k = 1 nothing is shared, and the memo saves nothing.',
    },
  ],
  practice: dagPractice(() => recursionDag),
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as DagSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    fibFive,
    fibBase,
    fibEight,
    binomFourTwo,
    binomSixThree,
    nothingShared,
  ] as unknown as SavedExample[],
  opening: 'fib-five',
  preview: { example: 'fib-five', level: 2 },
};

/**
 * Driver protocol for the code tabs: "fib n" or "binom n k" prints the value, the calls without
 * a memo and the calls with one: "5 15 9". Rejected calls print nothing, so they are left out.
 */
function codeScript(calls: OpCall[], settings: DagSettings) {
  const t = new Timeline(recursionDag, settings, 1, calls);
  const input: string[] = [];
  const expected: string[] = [];
  t.entries.forEach((e) => {
    const vars = e.steps[e.steps.length - 1]!.vars;
    const args = readArgs(settings.problem, e.call[1]);
    if (typeof vars?.result !== 'number' || typeof args === 'string') return;
    input.push(`${settings.problem} ${args.join(' ')}`);
    expected.push(`${vars.result} ${vars['tree calls']} ${vars['memo calls']}`);
  });
  return { input, expected };
}

export default recursionDag;
