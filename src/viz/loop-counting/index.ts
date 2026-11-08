import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import { parseWhole } from '../_recursion/kit';
import cppSource from './code/cpp/loops.hpp?raw';
import javaSource from './code/java/Loops.java?raw';
import pythonSource from './code/python/loops.py?raw';
import doublingInner from './examples/doubling-inner.json';
import doublingOuter from './examples/doubling-outer.json';
import earlyExitBest from './examples/early-exit-best.json';
import earlyExitWorst from './examples/early-exit-worst.json';
import growLog from './examples/grow-log.json';
import growQuadratic from './examples/grow-quadratic.json';
import halvingN1 from './examples/halving-n1.json';
import halving from './examples/halving.json';
import headerVsBody from './examples/header-vs-body.json';
import pairs from './examples/pairs.json';
import sequenceAdds from './examples/sequence-adds.json';
import squareRoot from './examples/square-root.json';
import square from './examples/square.json';
import triangle from './examples/triangle.json';
import triple from './examples/triple.json';
import explain from './explain.md?raw';
import {
  MAX_N,
  defaults,
  describe,
  init,
  initialSay,
  ops,
  patternOf,
  pseudocode,
  type LcSettings,
  type LcState,
} from './model';
import { PATTERN, PATTERNS } from './patterns';
import { loopPractice } from './practice';
import { view } from './view';

export const parseN = (token: string): Value | Error => parseWhole(token, 1, MAX_N, 'n');

/** The largest n a run of the chosen loops draws, capped at `size`. */
const fit = (size: number, settings?: Settings) =>
  Math.min(size, patternOf({ ...defaults, ...settings } as LcSettings).maxN);

export const loopCounting: VizDef<LcState, LcSettings, undefined> = {
  id: 'loop-counting',
  title: 'Counting steps in loops',
  family: 'Foundations',
  blurb:
    'Run a loop pattern for a chosen n, light a cell each time its innermost line runs, then turn the count into a formula and the formula into a Big-O.',
  settings: [
    {
      kind: 'choice',
      key: 'pattern',
      label: 'Loops',
      options: PATTERNS.map((id) => ({ value: id, label: PATTERN[id].label })),
      help: 'The code to count. Its counted line is highlighted in the drawing.',
    },
    {
      kind: 'choice',
      key: 'found',
      label: 'Early exit: where x is',
      options: [
        { value: 'first', label: 'First in A (the best case)' },
        { value: 'middle', label: 'In the middle of A' },
        { value: 'missing', label: 'Not in A (the worst case)' },
      ],
      help: 'Only the early-exit search looks at this.',
    },
  ],
  defaults,
  init,
  initialSay,
  ops,
  pseudocode,
  view,
  describe,
  controls: {
    input: {
      label: 'n',
      placeholder: `1 to ${MAX_N}`,
      maxLength: 3,
      sample: '6',
      parse: parseN,
    },
    buttons: [
      { op: 'run', label: 'Run', usesInput: true, primary: true },
      { op: 'grow', label: 'Grow: n, 2n, 4n, 8n', usesInput: true },
    ],
    presets: [
      { label: 'Run for this n', make: (_rng, size, st) => [['run', fit(size, st)]] },
      { label: 'Grow from this n', make: (_rng, size) => [['grow', size]] },
      {
        label: 'Run, then grow',
        make: (_rng, size, st) => [
          ['run', fit(size, st)],
          ['grow', size],
        ],
      },
      { label: 'Random n', make: (rng, _size, st) => [['run', rng.int(2, fit(MAX_N, st))]] },
      { label: 'The edge case, n = 1', make: () => [['run', 1]] },
    ],
    sizes: [4, 8, 16],
  },
  explain,
  complexity: [
    {
      op: 'for i = 1 to n, for j = 1 to n',
      best: { cost: 'O(n²)', why: 'n rows of n: the inner loop ignores i.', example: 'square' },
      average: { cost: 'O(n²)', why: 'The count is n² for every input of size n.' },
      worst: { cost: 'O(n²)', why: 'n · n, exactly.', example: 'square' },
    },
    {
      op: 'for i = 1 to n, for j = i to n',
      best: {
        cost: 'O(n²)',
        why: 'n(n+1)/2: half a square is still quadratic.',
        example: 'triangle',
      },
      average: { cost: 'O(n²)', why: 'Drop n/2 and the factor ½ from n²/2 + n/2.' },
      worst: { cost: 'O(n²)', why: 'Same loops, same count.', example: 'pairs' },
    },
    {
      op: 'two loops to n, one after the other',
      best: { cost: 'O(n)', why: 'n + n = 2n: loops in a row add.', example: 'sequence-adds' },
      average: { cost: 'O(n)', why: 'Drop the factor 2.' },
      worst: { cost: 'O(n)', why: 'Still 2n, never n².', example: 'sequence-adds' },
    },
    {
      op: 'i = n, while i > 1: i = i / 2',
      best: { cost: 'O(log n)', why: '⌊log₂ n⌋ halvings, for every n.', example: 'halving' },
      average: { cost: 'O(log n)', why: 'Doubling n adds one pass.', example: 'grow-log' },
      worst: {
        cost: 'O(log n)',
        why: 'n = 1,000,000 takes 19 passes.',
        example: 'halving',
      },
      note: 'For n = 1 it runs 0 times (example: halving-n1).',
    },
    {
      op: 'for i = 1 to n, j = 1, 2, 4, … up to n',
      best: {
        cost: 'O(n log n)',
        why: 'n rows of ⌊log₂ n⌋ + 1 cells.',
        example: 'doubling-inner',
      },
      average: { cost: 'O(n log n)', why: 'Drop the + n from n log n + n.' },
      worst: { cost: 'O(n log n)', why: 'The inner loop never gets longer than log n.' },
    },
    {
      op: 'i = 1, 2, 4, … up to n, for j = 1 to i',
      best: {
        cost: 'O(n)',
        why: '1 + 2 + 4 + … + 2ᵏ is less than 2n.',
        example: 'doubling-outer',
      },
      average: { cost: 'O(n)', why: 'The last row does about half of all the work.' },
      worst: { cost: 'O(n)', why: 'Not n log n: the rows are not all n long.' },
    },
    {
      op: 'i = 1, while i · i ≤ n',
      best: { cost: 'O(√n)', why: 'i stops at ⌊√n⌋.', example: 'square-root' },
      average: { cost: 'O(√n)', why: 'Four times the n, twice the count.' },
      worst: { cost: 'O(√n)', why: 'n = 1,000,000 takes 1,000 passes.' },
    },
    {
      op: 'search for x with an early exit',
      best: {
        cost: 'O(1)',
        why: 'x is the first item: one comparison.',
        example: 'early-exit-best',
      },
      average: { cost: 'O(n)', why: 'About n/2 comparisons when x could be anywhere.' },
      worst: {
        cost: 'O(n)',
        why: 'x is missing: all n comparisons.',
        example: 'early-exit-worst',
      },
    },
    {
      op: 'for i = 1 to n, j = i to n, k = j to n',
      best: { cost: 'O(n³)', why: 'n(n+1)(n+2)/6 triples.', example: 'triple' },
      average: { cost: 'O(n³)', why: 'Keep n³/6, drop the rest and the factor 1/6.' },
      worst: { cost: 'O(n³)', why: 'Doubling n multiplies the count by about 8.' },
    },
  ],
  practice: loopPractice(() => loopCounting),
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as LcSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    triangle,
    square,
    pairs,
    sequenceAdds,
    headerVsBody,
    halving,
    halvingN1,
    squareRoot,
    doublingInner,
    doublingOuter,
    earlyExitBest,
    earlyExitWorst,
    triple,
    growQuadratic,
    growLog,
  ] as unknown as SavedExample[],
  preview: { example: 'triangle', level: 2, hide: ['code-', 'f-'] },
  opening: 'triangle',
};

/**
 * Driver protocol for the code tabs: "triangle 8" prints how many times that pattern's
 * innermost line runs for n = 8; "search 8 missing" runs the early-exit search with x first,
 * in the middle, or missing. Each run becomes one line, each growth test one line per size.
 * Rejected calls (one step, nothing changed) are left out.
 */
function codeScript(calls: OpCall[], settings: LcSettings) {
  const t = new Timeline(loopCounting, settings, 1, calls);
  const p = patternOf(settings);
  const line = (n: number) =>
    p.id === 'search' ? `search ${n} ${settings.found}` : `${p.id} ${n}`;
  const input: string[] = [];
  const expected: string[] = [];
  for (const e of t.entries) {
    if (e.steps.length === 1) continue;
    if (e.call[0] === 'run' && e.end.run) {
      input.push(line(e.end.run.n));
      expected.push(String(e.end.run.count));
    }
    if (e.call[0] === 'grow' && e.end.grow) {
      const g = e.end.grow;
      g.sizes.forEach((m, k) => {
        input.push(line(m));
        expected.push(String(g.counts[k]));
      });
    }
  }
  return { input, expected };
}

export default loopCounting;
