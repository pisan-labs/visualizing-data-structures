import { Timeline } from '../../engine/timeline';
import type { OpCall, Preset, SavedExample, Settings, VizDef } from '../../engine/types';
import type { Rng } from '../../engine/rng';
import { approachSetting } from '../_patterns/kit';
import cppSource from './code/cpp/top_k.hpp?raw';
import javaSource from './code/java/TopK.java?raw';
import pythonSource from './code/python/top_k.py?raw';
import bestThree from './examples/best-three.json';
import fallingValues from './examples/falling-values.json';
import kthLargest from './examples/kth-largest.json';
import quickselectCopy from './examples/quickselect-copy.json';
import quickselectWorst from './examples/quickselect-worst.json';
import risingValues from './examples/rising-values.json';
import sortEverything from './examples/sort-everything.json';
import tiesAtTheRoot from './examples/ties-at-the-root.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  MAX_K,
  MAX_N,
  ops,
  parseInput,
  pseudocode,
  readValues,
  type TopExtra,
  type TopSettings,
  type TopState,
} from './model';
import { topPractice } from './practice';
import { view } from './view';

const load = (vs: number[]): OpCall => ['load', vs.join(' ')];

function between(rng: Rng, n: number, lo: number, hi: number): number[] {
  return Array.from({ length: n }, () => rng.int(lo, hi));
}

/** n distinct values from 1 to 99, in random order. */
function distinct(rng: Rng, n: number): number[] {
  const pool = Array.from({ length: 99 }, (_, i) => i + 1);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool.slice(0, n);
}

const kFor = (rng: Rng, n: number) => rng.int(2, Math.min(4, n));

const presets: Preset[] = [
  {
    label: 'Random',
    make: (rng, n) => [load(between(rng, n, 1, 99)), ['top', kFor(rng, n)]],
  },
  {
    label: 'Rising (the heap’s worst case: every value wins)',
    make: (rng, n) => [load(distinct(rng, n).sort((x, y) => x - y)), ['top', 3]],
  },
  {
    label: 'Falling (the heap’s best case; quickselect’s worst)',
    make: (rng, n) => [load(distinct(rng, n).sort((x, y) => y - x)), ['top', 3]],
  },
  {
    label: 'Nearly sorted',
    make: (rng, n) => {
      const vs = distinct(rng, n).sort((x, y) => x - y);
      for (let t = 0; t < Math.max(1, Math.round(n / 5)); t++) {
        const i = rng.int(0, n - 2);
        [vs[i], vs[i + 1]] = [vs[i + 1]!, vs[i]!];
      }
      return [load(vs), ['top', kFor(rng, n)]];
    },
  },
  {
    label: 'Many duplicates',
    make: (rng, n) => {
      const pool = distinct(rng, 3);
      return [load(Array.from({ length: n }, () => pool[rng.int(0, 2)]!)), ['top', kFor(rng, n)]];
    },
  },
  {
    label: 'k = 1: just the largest',
    make: (rng, n) => [load(between(rng, n, 1, 99)), ['top', 1]],
  },
  {
    label: `k = ${MAX_K}: a big heap`,
    make: (rng, n) => [load(between(rng, Math.max(n, MAX_K), 1, 99)), ['top', MAX_K]],
  },
];

export const topK: VizDef<TopState, TopSettings, TopExtra> = {
  id: 'top-k',
  title: 'Top k elements',
  family: 'Heap patterns',
  blurb:
    'The k largest of n values: keep the best k so far in a min-heap and let each new value challenge its root. O(n log k) comparisons, against O(n log n) for sorting everything and O(n) on average for quickselect.',
  settings: [
    {
      ...approachSetting({
        pattern: 'A min-heap of size k, O(n log k)',
        naive: 'Sort everything, O(n log n)',
        help: 'All three give the same answer. Watch the comparisons, or use Compare with this same page to run two side by side.',
      }),
      options: [
        { value: 'pattern', label: 'A min-heap of size k, O(n log k)' },
        { value: 'naive', label: 'Sort everything, O(n log n)' },
        { value: 'select', label: 'Quickselect, O(n) on average' },
      ],
    },
    {
      kind: 'choice',
      key: 'goal',
      label: 'Find',
      options: [
        { value: 'top', label: 'The k largest values' },
        { value: 'kth', label: 'The k-th largest value' },
      ],
      help: 'The same work either way: the k-th largest is the smallest of the k largest.',
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
      label: 'k, or values',
      placeholder: 'e.g. 3, or 5 12 3 18 to load',
      maxLength: 60,
      sample: '3',
      parse: parseInput,
    },
    buttons: [
      { op: 'top', label: 'Top k', usesInput: true, primary: true },
      { op: 'load', label: 'Load', usesInput: true },
    ],
    random: {
      label: 'Random values',
      make: (rng) => [load(between(rng, 9, 1, 99)), ['top', 3]],
    },
    presets,
    sizes: [6, 8, 10, MAX_N],
  },
  explain,
  complexity: [
    {
      op: 'top k, a min-heap of size k',
      best: {
        cost: 'Θ(n)',
        why: 'Falling values: after the first k, each loses to the root at once, one comparison each.',
        example: 'falling-values',
      },
      average: {
        cost: 'O(n log k)',
        why: 'Each value costs one comparison with the root, plus a sift-down of at most 2 log k when it wins.',
        example: 'best-three',
      },
      worst: {
        cost: 'Θ(n log k)',
        why: 'Rising values: every one beats the root and sinks to a leaf.',
        example: 'rising-values',
      },
      note: 'Extra space is O(k): the heap. The values can stream past; they never all need to be in memory.',
    },
    {
      op: 'top k, sort everything',
      best: {
        cost: 'Θ(n log n)',
        why: 'Merge sort does the whole sort whatever k is, even for k = 1.',
        example: 'sort-everything',
      },
      average: { cost: 'Θ(n log n)', why: 'Every pass touches every value, and there are about log n passes.' },
      worst: { cost: 'Θ(n log n)', why: 'The same passes; at most n − 1 comparisons each.' },
      note: 'Sorting gives the k largest in order for free, and every other rank too.',
    },
    {
      op: 'top k, quickselect',
      best: {
        cost: 'Θ(n)',
        why: 'The first pivot lands on the target: one partition, n − 1 comparisons.',
      },
      average: {
        cost: 'O(n)',
        why: 'Each partition throws one side away, so the ranges shrink geometrically.',
        example: 'quickselect-copy',
      },
      worst: {
        cost: 'Θ(n²)',
        why: 'Falling values with the last value as pivot: the pivots peel off one value at a time.',
        example: 'quickselect-worst',
      },
      note: 'A random pivot (CLRS’s RANDOMIZED-SELECT) makes the worst case unlikely on any input. It needs all of A in memory and rearranges it.',
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => {
      const s = settings as TopSettings;
      const t = new Timeline(topK, s, 1, calls);
      const input = [`load ${t.initial.state.a.map((x) => x.key).join(' ')}`];
      const expected: string[] = [];
      for (const e of t.entries) {
        const v = e.steps.at(-1)!.vars ?? {};
        if (e.call[0] === 'load') {
          if (typeof readValues(e.call[1]) !== 'string')
            input.push(`load ${e.end.a.map((x) => x.key).join(' ')}`);
        } else if (e.call[0] === 'top' && v.answer !== undefined) {
          input.push(`${s.goal === 'kth' ? 'kth' : 'top'} ${v.k}`);
          expected.push(String(v.answer));
        }
      }
      return { input, expected };
    },
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    bestThree,
    sortEverything,
    quickselectCopy,
    fallingValues,
    risingValues,
    kthLargest,
    quickselectWorst,
    tiesAtTheRoot,
  ] as unknown as SavedExample[],
  practice: topPractice(() => topK),
  preview: { example: 'best-three', level: 2 },
};

export default topK;
