import type { Rng } from '../../engine/rng';
import type { OpCall, Preset, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import {
  drawSetting,
  driverScript,
  valuesOf,
  type ArrayExtra,
  type ArrayState,
  type ArrayStep,
} from '../_sorting/kit';
import { loadCall } from '../_sorting/linear';
import { describeArray } from '../_sorting/view';
import cppSource from './code/cpp/bucket_sort.hpp?raw';
import javaSource from './code/java/BucketSort.java?raw';
import pythonSource from './code/python/bucket_sort.py?raw';
import even from './examples/even.json';
import integers from './examples/integers.json';
import oneBucket from './examples/one-bucket.json';
import outlier from './examples/outlier.json';
import spreadOut from './examples/spread-out.json';
import explain from './explain.md?raw';
import {
  defaults,
  init,
  initialSay,
  initialVars,
  MAX_N,
  ops,
  pseudocode,
  rangeOf,
  type BucketExtra,
  type BucketSettings,
} from './model';
import { bucketPractice } from './practice';
import { view } from './view';

/** The input box takes fractions like 0.78 or whole numbers up to 99; Load checks the setting. */
export function parseBucketInput(text: string): Value | Error {
  const tokens = text.split(/[\s,;]+/).filter(Boolean);
  if (tokens.length === 0) return new Error('Type some values first, such as 0.78 0.17 0.39.');
  if (tokens.length > MAX_N)
    return new Error(`That is ${tokens.length} values. Use at most ${MAX_N}, one bucket each.`);
  for (const t of tokens)
    if (!/^(\d{1,2}|0?\.\d{1,2})$/.test(t))
      return new Error(`"${t}" is not a value like 0.78, or a whole number from 0 to 99.`);
  return tokens.length === 1 ? Number(tokens[0]) : tokens.join(' ');
}

const shuffle = <T>(rng: Rng, xs: T[]): T[] => {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
};

/** n values for the page's setting: hundredths in [0, 1), or whole numbers. */
function values(rng: Rng, n: number, settings: Settings | undefined, lo = 0, hi = 99): number[] {
  const ints = settings?.values === 'integer';
  return Array.from({ length: n }, () => rng.int(lo, hi)).map((k) => (ints ? k : k / 100));
}

const presets: Preset[] = [
  { label: 'Random', make: (rng, n, s) => [loadCall(values(rng, n, s))] },
  {
    label: 'Evenly spread (one value per bucket)',
    make: (rng, n, s) => {
      const vs =
        s?.values === 'integer'
          ? Array.from({ length: n }, (_, i) => i * 10 + rng.int(0, 9))
          : Array.from({ length: n }, (_, i) => Math.round((100 * (i + 0.5)) / n) / 100);
      return [loadCall(shuffle(rng, vs))];
    },
  },
  {
    label: 'Clumped in one bucket (worst case)',
    make: (rng, n, s) =>
      s?.values === 'integer'
        ? [loadCall([...values(rng, n - 1, s, 0, 9), 99])]
        : [loadCall(values(rng, n, s, 0, Math.floor(99 / n)).sort((a, b) => b - a))],
  },
  {
    label: 'Sorted',
    make: (rng, n, s) => [loadCall(values(rng, n, s).sort((a, b) => a - b))],
  },
  {
    label: 'Reverse sorted',
    make: (rng, n, s) => [loadCall(values(rng, n, s).sort((a, b) => b - a))],
  },
  {
    label: 'All equal',
    make: (rng, n, s) => {
      const [v] = values(rng, 1, s);
      return [loadCall(Array<number>(n).fill(v!))];
    },
  },
];

export const bucketSort: VizDef<ArrayState, BucketSettings, BucketExtra> = {
  id: 'bucket-sort',
  title: 'Bucket sort',
  family: 'Searching and sorting',
  blurb:
    'Drop each value into one of n buckets by where it falls in the range, sort the buckets with insertion sort, and join them.',
  settings: [
    {
      kind: 'choice',
      key: 'values',
      label: 'Values',
      options: [
        { value: 'fraction', label: 'Fractions in [0, 1), bucket floor(n × x) (CLRS)' },
        { value: 'integer', label: 'Whole numbers, buckets split [min, max]' },
      ],
      help: 'Either way there is one bucket per value, each covering an equal part of the range.',
    },
    { ...drawSetting(), help: 'Values in buckets are always drawn as cells.' },
  ],
  defaults,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  view,
  describe: describeArray,
  controls: {
    input: {
      label: 'Values',
      placeholder: 'e.g. 0.78 0.17 0.39',
      maxLength: 60,
      sample: '0.78 0.17 0.39',
      parse: parseBucketInput,
    },
    buttons: [
      { op: 'load', label: 'Load', usesInput: true, primary: true },
      { op: 'sort', label: 'Sort', usesInput: false },
    ],
    random: {
      label: 'Random values',
      make: (rng) => [loadCall(Array.from({ length: 8 }, () => rng.int(0, 99) / 100))],
    },
    presets,
    sizes: [5, 8, 10],
  },
  explain,
  complexity: [
    {
      op: 'sort(A)',
      best: {
        cost: 'O(n)',
        why: 'One value per bucket: scatter and join, and no comparisons at all.',
        example: 'even',
      },
      average: {
        cost: 'O(n)',
        why: 'Evenly spread values put about one value in each bucket, so the insertion sorts cost O(1) each on average.',
        example: 'spread-out',
      },
      worst: {
        cost: 'O(n²)',
        why: 'Everything in one bucket is a plain insertion sort: 28 comparisons for 8 values in reverse.',
        example: 'one-bucket',
      },
      note: 'Extra space: O(n) for the buckets. Stable. The O(n) average assumes the values are spread evenly over the range.',
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) =>
      driverScript(
        bucketSort as unknown as VizDef<ArrayState, BucketSettings, ArrayExtra>,
        calls,
        settings as BucketSettings,
        (call, before, steps) => bucketQuery(call, before, steps, settings as BucketSettings),
      ),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [spreadOut, oneBucket, even, integers, outlier] as unknown as SavedExample[],
  practice: bucketPractice(() => bucketSort),
};

/**
 * Driver protocol for the code tabs: "load v1 v2 ..." as the sorting pages, then "sort lo hi d"
 * sorts with buckets over [lo, hi) and prints the values with d decimals: 2 for fractions, 0
 * for whole numbers.
 */
function bucketQuery(
  call: OpCall,
  before: ArrayState,
  steps: ArrayStep[],
  settings: BucketSettings,
) {
  if (call[0] !== 'sort' || before.a.length === 0) return null;
  const [lo, hi] = rangeOf(valuesOf(before), settings);
  const d = settings.values === 'fraction' ? 2 : 0;
  const sorted = valuesOf(steps[steps.length - 1]!.state);
  return { line: `sort ${lo} ${hi} ${d}`, out: sorted.map((v) => v.toFixed(d)).join(' ') };
}

export default bucketSort;
