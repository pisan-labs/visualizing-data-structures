import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, VizDef } from '../../engine/types';
import { parseWhole } from '../_recursion/kit';
import cppSource from './code/cpp/factorial.hpp?raw';
import javaSource from './code/java/Factorial.java?raw';
import pythonSource from './code/python/factorial.py?raw';
import baseCase from './examples/base-case.json';
import baseOne from './examples/base-one.json';
import deepStack from './examples/deep-stack.json';
import downAndBack from './examples/down-and-back.json';
import frameReused from './examples/frame-reused.json';
import missingBase from './examples/missing-base.json';
import negative from './examples/negative.json';
import tail from './examples/tail.json';
import tooDeep from './examples/too-deep.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  MAX_N,
  MIN_N,
  ops,
  pseudocode,
  type FactSettings,
  type FactState,
} from './model';
import { factorialPractice } from './practice';
import { view } from './view';

export const factorial: VizDef<FactState, FactSettings, undefined> = {
  id: 'factorial',
  title: 'Factorial',
  family: 'Recursion',
  blurb:
    'Watch frames pile up on the call stack down to the base case, then the products come back.',
  settings: [
    {
      kind: 'choice',
      key: 'style',
      label: 'Recursion',
      options: [
        { value: 'plain', label: 'Plain: n * factorial(n - 1)' },
        { value: 'tail', label: 'Tail call with an accumulator, one frame per call' },
        { value: 'tco', label: 'Tail call with an accumulator, frame reused' },
      ],
      help: 'Most languages, including Python and Java, do not optimize tail calls: every call still gets its own frame. Scheme must reuse the frame, and C and C++ compilers may when optimizing.',
    },
    {
      kind: 'choice',
      key: 'base',
      label: 'Base case',
      options: [
        { value: 'zero', label: 'n == 0 (0! = 1, as in CLRS)' },
        { value: 'one', label: 'n <= 1 (one call fewer)' },
        { value: 'none', label: 'None: a bug, the calls never stop' },
      ],
    },
    { kind: 'number', key: 'limit', label: 'Frames that fit on the stack', min: 4, max: 12 },
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
      placeholder: `e.g. 4 (${MIN_N} to ${MAX_N})`,
      maxLength: 20,
      sample: '4',
      parse: (t) => parseWhole(t, MIN_N, MAX_N),
    },
    buttons: [
      { op: 'factorial', label: 'Call factorial', usesInput: true, primary: true, bulk: true },
    ],
    random: { label: 'Random n', make: (rng) => [['factorial', rng.int(2, 7)]] },
    presets: [
      { label: 'factorial(n)', make: (_rng, size) => [['factorial', size]] },
      {
        label: 'factorial(1) up to factorial(n)',
        make: (_rng, size) =>
          Array.from({ length: size }, (_, i) => ['factorial', i + 1] as OpCall),
      },
      { label: 'The base case: factorial(0)', make: () => [['factorial', 0]] },
      { label: 'A negative n', make: (_rng, size) => [['factorial', -Math.min(size, 3)]] },
    ],
    sizes: [3, 5, 8],
  },
  explain,
  complexity: [
    {
      op: 'factorial(n): time',
      best: {
        cost: 'O(1)',
        why: 'n = 0 is the base case: one call and no recursion.',
        example: 'base-case',
      },
      average: {
        cost: 'O(n)',
        why: 'One call for each value from n down to 0, each with one test and one multiplication.',
        example: 'down-and-back',
      },
      worst: {
        cost: 'O(n)',
        why: 'Still one call per value: nothing is ever computed twice.',
        example: 'deep-stack',
      },
      note: 'Counting each multiplication as one step. With very big numbers the multiplications themselves get slower.',
    },
    {
      op: 'factorial(n): stack depth',
      best: { cost: 'O(1)', why: 'The base case needs only its own frame.', example: 'base-case' },
      average: {
        cost: 'O(n)',
        why: 'All n + 1 frames wait at once, each holding a multiplication it cannot do yet.',
        example: 'down-and-back',
      },
      worst: {
        cost: 'O(n)',
        why: 'n + 1 frames; a stack that holds fewer overflows.',
        example: 'too-deep',
      },
      note: 'The tail version uses the same O(n) frames in Python and Java, which do not optimize tail calls.',
    },
    {
      op: 'factorial(n, acc) with the frame reused: stack depth',
      best: { cost: 'O(1)', why: 'One frame, whatever n is.', example: 'frame-reused' },
      average: { cost: 'O(1)', why: 'Each tail call takes over the frame before it.' },
      worst: {
        cost: 'O(1)',
        why: 'The recursion has become a loop: it never needs a second frame.',
        example: 'frame-reused',
      },
    },
  ],
  practice: factorialPractice(() => factorial),
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as FactSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    downAndBack,
    baseCase,
    deepStack,
    baseOne,
    tail,
    frameReused,
    missingBase,
    negative,
    tooDeep,
  ] as unknown as SavedExample[],
  opening: 'down-and-back',
  preview: { example: 'down-and-back', level: 2 },
};

/**
 * Driver protocol for the code tabs: "factorial n" or "tail n" prints the value. The code
 * follows the default base case (n == 0) and the stack of a real program, so the model runs
 * with those. Negative n is left out: it never reaches the base case, and while Python and
 * Java report the overflow, a C++ program just crashes.
 */
function codeScript(calls: OpCall[], settings: FactSettings) {
  const same: FactSettings = { ...settings, base: defaults.base, limit: 12 };
  const op = settings.style === 'plain' ? 'factorial' : 'tail';
  const t = new Timeline(factorial, same, 1, calls);
  const input: string[] = [];
  const expected: string[] = [];
  t.entries.forEach((e) => {
    const result = e.steps[e.steps.length - 1]!.vars?.result;
    const n = Number(e.call[1]);
    if (typeof result !== 'number' || n < 0) return;
    input.push(`${op} ${n}`);
    expected.push(String(result));
  });
  return { input, expected };
}

export default factorial;
