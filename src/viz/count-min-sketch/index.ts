import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, VizDef } from '../../engine/types';
import { parseNumberInput, readNumber, shuffle } from '../_hashing/hashing';
import cppSource from './code/cpp/count_min_sketch.hpp?raw';
import javaSource from './code/java/CountMinSketch.java?raw';
import pythonSource from './code/python/count_min_sketch.py?raw';
import conservativeUpdate from './examples/conservative-update.json';
import heavyHitters from './examples/heavy-hitters.json';
import narrowSketch from './examples/narrow-sketch.json';
import oneRow from './examples/one-row.json';
import overestimate from './examples/overestimate.json';
import explain from './explain.md?raw';
import {
  columns,
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  type CmsExtra,
  type CmsSettings,
  type CmsState,
} from './model';
import { cmsPractice } from './practice';
import { view } from './view';

const adds = (xs: number[]): OpCall[] => xs.map((x) => ['add', x] as OpCall);

/** A stream of n items where a few items make up most of it (Zipf-like). */
export function skewedStream(next: () => number, n: number): number[] {
  const pool = shuffle(
    next,
    Array.from({ length: 90 }, (_, i) => i + 1),
  ).slice(0, 12);
  const weights = pool.map((_, r) => 1 / (r + 1));
  const total = weights.reduce((a, b) => a + b, 0);
  return Array.from({ length: n }, () => {
    let u = next() * total;
    for (let r = 0; r < pool.length; r++) {
      u -= weights[r]!;
      if (u <= 0) return pool[r]!;
    }
    return pool[0]!;
  });
}

export const countMinSketch: VizDef<CmsState, CmsSettings, CmsExtra> = {
  id: 'count-min-sketch',
  title: 'Count-min sketch',
  family: 'Hashing and maps',
  blurb:
    'Counts how often each item appears in a stream, in d rows of w counters. Every add bumps one counter per row; the estimate is the smallest of them, never too low and sometimes too high.',
  settings: [
    { kind: 'number', key: 'd', label: 'Rows d (hash functions)', min: 1, max: 5 },
    { kind: 'number', key: 'w', label: 'Counters per row w', min: 4, max: 16 },
    {
      kind: 'choice',
      key: 'update',
      label: 'Update',
      options: [
        { value: 'standard', label: 'Add 1 to every row (Cormode and Muthukrishnan)' },
        { value: 'conservative', label: 'Conservative: raise only the counters at the minimum' },
      ],
      help: 'Conservative update gives closer estimates but cannot handle removals.',
    },
    {
      kind: 'choice',
      key: 'phi',
      label: 'Heavy hitter threshold φ',
      options: [
        { value: '0.1', label: '10% of the stream' },
        { value: '0.2', label: '20% of the stream' },
        { value: '0.25', label: '25% of the stream' },
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
      label: 'Item',
      placeholder: 'e.g. 42 or 7 7 3 7',
      maxLength: 160,
      sample: '42',
      parse: parseNumberInput,
    },
    buttons: [
      { op: 'add', label: 'Add', usesInput: true, bulk: true, primary: true },
      { op: 'estimate', label: 'Estimate', usesInput: true, bulk: true },
      { op: 'heavy', label: 'Heavy hitters', usesInput: false },
      { op: 'clear', label: 'Clear', usesInput: false, more: true },
    ],
    random: { label: 'Add random', make: (rng) => [['add', rng.int(1, 30)]] },
    presets: [
      { label: 'Skewed stream', make: (rng, n) => adds(skewedStream(rng.next, n)) },
      {
        label: 'Uniform stream',
        make: (rng, n) => adds(Array.from({ length: n }, () => rng.int(1, 40))),
      },
      {
        label: 'Skewed stream, then heavy hitters',
        make: (rng, n) => [...adds(skewedStream(rng.next, n)), ['heavy']],
      },
    ],
    sizes: [10, 20, 30],
  },
  explain,
  complexity: [
    {
      op: 'add(x)',
      best: { cost: 'O(d)', why: 'One hash and one increment per row.', example: 'overestimate' },
      average: { cost: 'O(d)', why: 'The same d steps whatever the stream.' },
      worst: {
        cost: 'O(d)',
        why: 'Conservative update reads the d counters first, then writes them: still O(d).',
        example: 'conservative-update',
      },
    },
    {
      op: 'estimate(x)',
      best: { cost: 'O(d)', why: 'Read d counters and take the minimum.', example: 'overestimate' },
      average: { cost: 'O(d)', why: 'No search: each row says exactly where to look.' },
      worst: { cost: 'O(d)', why: 'The work never depends on N or w.', example: 'narrow-sketch' },
      note: 'Accuracy: with w = ⌈e/ε⌉ and d = ⌈ln(1/δ)⌉, every estimate is at most the true count plus εN, with probability at least 1 − δ.',
    },
    {
      op: 'heavy()',
      best: {
        cost: 'O(u·d)',
        why: 'One estimate for each of the u distinct items seen.',
        example: 'heavy-hitters',
      },
      average: { cost: 'O(u·d)', why: 'Each estimate reads d counters.' },
      worst: {
        cost: 'O(u·d)',
        why: 'Real systems keep a small heap of candidates while streaming instead of every item.',
        example: 'heavy-hitters',
      },
      note: 'Space: d·w counters, however long the stream and however many distinct items.',
    },
  ],
  practice: cmsPractice(() => countMinSketch),
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as CmsSettings),
  },
  examples: [
    overestimate,
    heavyHitters,
    narrowSketch,
    oneRow,
    conservativeUpdate,
  ] as unknown as SavedExample[],
  opening: 'heavy-hitters',
  preview: { example: 'heavy-hitters', level: 1, hide: ['th-', 'tx-', 'tt-', 'te-', 'it-'] },
};

/**
 * Driver protocol for the code tabs (standard update, φ = 0.2 as in the defaults): "new d w",
 * then one operation per line. add -> the d columns; estimate -> the estimate; heavy -> the items
 * reported, largest estimate first, or "none"; clear -> ok.
 */
function codeScript(calls: OpCall[], settings: CmsSettings) {
  const same: CmsSettings = { ...defaults, d: settings.d, w: settings.w };
  const ok = calls.filter(
    ([op, x]) => op === 'heavy' || op === 'clear' || !(readNumber(x!) instanceof Error),
  );
  const t = new Timeline(countMinSketch, same, 1, ok);
  const input = [`new ${same.d} ${same.w}`, ...ok.map((c) => c.join(' '))];
  const expected = t.entries.map((e) => {
    const [op, x] = e.call;
    const last = e.steps.at(-1)!;
    if (op === 'add') return columns(Number(x), same).join(' ');
    if (op === 'estimate') return String(last.vars!.estimate);
    if (op === 'heavy') return e.end.heavy!.length ? e.end.heavy!.join(' ') : 'none';
    return 'ok';
  });
  return { input, expected };
}

export default countMinSketch;
