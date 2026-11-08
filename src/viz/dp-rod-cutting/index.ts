import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import cppSource from './code/cpp/rod.hpp?raw';
import javaSource from './code/java/RodCutting.java?raw';
import pythonSource from './code/python/rod.py?raw';
import allOnes from './examples/all-ones.json';
import densityFails from './examples/density-fails.json';
import longest from './examples/longest.json';
import memoCalls from './examples/memo-calls.json';
import sellWhole from './examples/sell-whole.json';
import twoAndSix from './examples/two-and-six.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  MAX_N,
  ops,
  pricesFromArg,
  pricesText,
  pseudocode,
  type RodExtra,
  type RodSettings,
  type RodState,
} from './model';
import { randomPrices, rodPractice } from './practice';
import { view } from './view';

export function parsePrices(text: string): Value | Error {
  const prices = pricesFromArg(text);
  if (typeof prices === 'string') return new Error(prices);
  return prices.join(' ');
}

const solve = (prices: number[]): OpCall[] => [['prices', prices.join(' ')], ['fill'], ['cut']];

export const dpRodCutting: VizDef<RodState, RodSettings, RodExtra> = {
  id: 'dp-rod-cutting',
  title: 'Rod cutting',
  family: 'Dynamic programming',
  blurb:
    'Cut a rod into pieces to earn the most, from a table of the best revenue for every shorter length.',
  settings: [
    {
      kind: 'choice',
      key: 'style',
      label: 'How to fill the table',
      options: [
        { value: 'bottomup', label: 'Bottom-up: shortest length first (CLRS)' },
        { value: 'memo', label: 'Top-down with a memo: recurse, and remember each answer' },
      ],
      help: 'Both fill the same table. Top-down shows the calls on the stack.',
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
      placeholder: 'e.g. 1 5 8 9 10 17 17 20',
      maxLength: 40,
      sample: '1 5 8 9',
      parse: parsePrices,
    },
    buttons: [
      { op: 'prices', label: 'Set prices', usesInput: true, primary: true },
      { op: 'fill', label: 'Fill the table', usesInput: false },
      { op: 'cut', label: 'Cut the rod', usesInput: false },
      { op: 'next', label: 'Fill the next length', usesInput: false, more: true },
    ],
    random: {
      label: 'Random prices',
      make: (rng) => solve(randomPrices(rng, rng.int(4, 8))),
    },
    presets: [
      {
        label: 'Random prices',
        make: (rng, size) => solve(randomPrices(rng, Math.min(size, MAX_N))),
      },
      {
        label: 'Longer pieces worth more (sell whole)',
        make: (_rng, size) =>
          solve(Array.from({ length: Math.min(size, MAX_N) }, (_, k) => ((k + 1) * (k + 2)) / 2)),
      },
      {
        label: 'Short pieces worth more (cut it all)',
        make: (_rng, size) =>
          solve(Array.from({ length: Math.min(size, MAX_N) }, (_, k) => 3 + 2 * k)),
      },
      {
        label: 'Price equal to length (every cut ties)',
        make: (_rng, size) => solve(Array.from({ length: Math.min(size, MAX_N) }, (_, k) => k + 1)),
      },
      {
        label: 'Longest rod (the most work)',
        make: (rng) => solve(randomPrices(rng, MAX_N)),
      },
    ],
    sizes: [4, 6, 8, 10],
  },
  explain,
  complexity: [
    {
      op: 'fill the table (bottom-up)',
      best: {
        cost: 'Θ(n²)',
        why: 'Length j always tries all j first pieces, whatever the prices.',
        example: 'sell-whole',
      },
      average: {
        cost: 'Θ(n²)',
        why: '1 + 2 + ... + n = n(n + 1)/2 sums.',
        example: 'two-and-six',
      },
      worst: { cost: 'Θ(n²)', why: 'Length 10 takes 55 sums.', example: 'longest' },
      note: 'Space Θ(n) for r and s. Plain recursion with no memo is Θ(2ⁿ): it solves each length again and again.',
    },
    {
      op: 'fill the table (top-down memo)',
      best: {
        cost: 'Θ(n²)',
        why: 'Each length is worked out once, and length j makes j calls.',
        example: 'memo-calls',
      },
      average: { cost: 'Θ(n²)', why: 'n(n + 1)/2 + 1 calls, most of them memo hits.' },
      worst: {
        cost: 'Θ(n²)',
        why: 'The same as bottom-up, plus a recursion n calls deep.',
        example: 'memo-calls',
      },
    },
    {
      op: 'cut the rod',
      best: { cost: 'O(1)', why: 'Selling it whole: s[n] = n, one step.', example: 'sell-whole' },
      average: { cost: 'O(n)', why: 'One step per piece.' },
      worst: { cost: 'O(n)', why: 'n pieces of length 1.', example: 'all-ones' },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as RodSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    twoAndSix,
    densityFails,
    sellWhole,
    allOnes,
    memoCalls,
    longest,
  ] as unknown as SavedExample[],
  practice: rodPractice(() => dpRodCutting),
  preview: { example: 'two-and-six', level: 2 },
};

/**
 * Driver protocol for the code tabs: "revenue p1 ... pn" prints r[n] (after Fill the table or
 * the last Fill the next length); "cut p1 ... pn" prints r[n] and the pieces (after Cut the rod).
 * Both styles fill the same table, so the code (bottom-up) matches either.
 */
function codeScript(calls: OpCall[], settings: RodSettings) {
  const t = new Timeline(dpRodCutting, settings, 1, calls);
  const input: string[] = [];
  const expected: string[] = [];
  for (const e of t.entries) {
    const vars = e.steps.at(-1)!.vars ?? {};
    const n = e.end.p.length - 1;
    if (e.call[0] === 'fill' && vars.best !== undefined) {
      input.push(`revenue ${pricesText(e.end)}`);
      expected.push(String(vars.best));
    } else if (e.call[0] === 'cut' && vars.pieces !== undefined) {
      input.push(`cut ${pricesText(e.end)}`);
      expected.push(`${String(vars.revenue)} ${String(vars.pieces)}`);
    } else if (
      e.call[0] === 'next' &&
      e.end.r[n] !== null &&
      vars.q !== undefined &&
      vars.j === n
    ) {
      input.push(`revenue ${pricesText(e.end)}`);
      expected.push(String(e.end.r[n]));
    }
  }
  return { input, expected };
}

export default dpRodCutting;
