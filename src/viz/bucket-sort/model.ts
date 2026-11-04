import type { OpSpec, PseudoBlock, PseudoLine, Scalar, Value } from '../../engine/types';
import {
  doneRegions,
  makeState,
  mark,
  plural,
  Run,
  stabilityNote,
  type ArrayExtra,
  type ArrayState,
  type ArrayStep,
  type Draw,
  type Item,
} from '../_sorting/kit';
import { loadIn } from '../_sorting/linear';

/** At most 10 values, so 10 buckets fit under A. */
export const MAX_N = 10;

export interface BucketSettings {
  [key: string]: Scalar;
  /** fraction: values in [0, 1), bucket floor(n·x) (CLRS). integer: 0 to 99, buckets over [min, max]. */
  values: 'fraction' | 'integer';
  draw: Draw;
}

/** View-only data: the buckets, and where the insertion sort is. */
export interface BucketExtra extends ArrayExtra {
  buckets?: Item[][];
  /** The deepest any bucket gets during this sort, so the frame stays the same. */
  depth?: number;
}

export type BucketStep = ArrayStep & { extra?: BucketExtra };

type Op = OpSpec<ArrayState, BucketSettings, BucketExtra>;

export const defaults: BucketSettings = { values: 'fraction', draw: 'cells' };

export const START_FRACTIONS = [0.78, 0.17, 0.39, 0.26, 0.72, 0.94, 0.21, 0.12, 0.23, 0.68];
export const START_INTEGERS = [29, 25, 3, 49, 9, 37, 21, 43];

export function init(settings: BucketSettings): ArrayState {
  return makeState(settings.values === 'integer' ? START_INTEGERS : START_FRACTIONS);
}

/** How a value is written: 0.78 stays 0.78; whole numbers stay whole. */
export const show = (v: number) => String(v);

/** The bucket a value goes to: floor(n·x) for fractions, an equal share of [min, max] otherwise. */
export function bucketOf(v: number, n: number, lo: number, hi: number): number {
  return Math.min(n - 1, Math.floor((n * (v - lo)) / (hi - lo)));
}

/** The range the buckets split: [0, 1), or [min, max + 1) for whole numbers. */
export function rangeOf(values: readonly number[], settings: BucketSettings): [number, number] {
  if (settings.values === 'fraction') return [0, 1];
  return [Math.min(...values), Math.max(...values) + 1];
}

/** Read the values for the current setting: fractions with up to two decimals, or 0 to 99. */
export function valuesFromArg(arg: Value | undefined, settings: BucketSettings): number[] | string {
  const tokens = String(arg ?? '')
    .split(/[\s,;]+/)
    .filter(Boolean);
  const fractions = settings.values === 'fraction';
  const how = fractions
    ? 'Use values from 0 up to 1, not including 1, with at most two decimals, such as 0.78.'
    : 'Use whole numbers from 0 to 99.';
  if (tokens.length === 0) return `Type some values first. ${how}`;
  if (tokens.length > MAX_N)
    return `That is ${tokens.length} values. Use at most ${MAX_N}, one bucket each.`;
  const out: number[] = [];
  for (const t of tokens) {
    const ok = fractions ? /^(0|0?\.\d{1,2})$/.test(t) : /^\d{1,2}$/.test(t);
    if (!ok) return `"${t}" does not fit. ${how}`;
    out.push(Number(t));
  }
  return out;
}

const sort: Op = {
  label: 'Sort',
  arity: 0,
  *run(s, _args, { settings }) {
    const run = new Run(s, ['comparisons', 'shifts']);
    const n = run.n;
    if (n === 0) {
      yield run.step({ say: 'A is empty.', lines: ['sig'], level: 1, vars: { n } });
      return run.state();
    }
    const start = [...run.a];
    const values = start.map((x) => x.value);
    const [lo, hi] = rangeOf(values, settings);
    const fractions = settings.values === 'fraction';
    const sizes: number[] = Array(n).fill(0);
    for (const v of values) sizes[bucketOf(v, n, lo, hi)]!++;
    const depth = Math.max(1, ...sizes);
    const buckets: Item[][] = Array.from({ length: n }, () => []);
    const extra = (): BucketExtra => ({ buckets: buckets.map((b) => [...b]), depth });
    const vars = (more: Record<string, Scalar> = {}) => ({ n, ...more });

    yield run.step({
      say: fractions
        ? `${plural(n, 'value')} in [0, 1), so ${plural(n, 'bucket')}. Bucket i takes the values from i/${n} up to (i + 1)/${n}, so a value x goes to bucket floor(${n} × x).`
        : `${plural(n, 'value')} from ${lo} to ${hi - 1}, so ${plural(n, 'bucket')}, each taking an equal share of that range: a value v goes to bucket floor(${n} × (v − ${lo}) / ${hi - lo}).`,
      lines: ['sig', 'new'],
      level: 2,
      vars: vars(),
      extra: extra(),
    });

    // Scatter: each value to the back of its bucket.
    for (let j = 0; j < n; j++) {
      const item = run.a[j]!;
      const v = item.value;
      const b = bucketOf(v, n, lo, hi);
      buckets[b]!.push(item);
      run.a[j] = { uid: 0, value: v, stale: true };
      const how = fractions
        ? `${n} × ${v} = ${Number((n * v).toFixed(2))}`
        : `${n} × (${v} − ${lo}) / ${hi - lo} = ${Number(((n * (v - lo)) / (hi - lo)).toFixed(2))}`;
      yield run.step({
        say: `A[${j}] = ${v}: ${how}, so it goes to the back of bucket ${b}.`,
        lines: ['scatter'],
        level: 2,
        marks: [mark(`v${item.uid}`, 'active')],
        vars: vars({ j, bucket: b }),
        extra: extra(),
      });
    }

    // Sort each bucket with insertion sort.
    const full = buckets.filter((b) => b.length > 1).length;
    yield run.step({
      say:
        full === 0
          ? 'Every bucket holds at most one value, so every bucket is already sorted.'
          : `Now sort each bucket with insertion sort. ${full === 1 ? 'One bucket holds' : `${full} buckets hold`} more than one value.`,
      lines: ['each'],
      level: 2,
      vars: vars(),
      extra: extra(),
    });
    for (let b = 0; b < n; b++) {
      const list = buckets[b]!;
      if (list.length < 2) continue;
      const before = run.counts.comparisons ?? 0;
      for (let i = 1; i < list.length; i++) {
        const key = list[i]!;
        let k = i - 1;
        let moved = 0;
        for (;;) {
          if (k < 0) break;
          run.count('comparisons');
          const bigger = list[k]!.value > key.value;
          yield run.step({
            say: `Bucket ${b}: compare ${key.value} with ${list[k]!.value}${bigger ? `: ${list[k]!.value} is bigger, so it moves back one place.` : `: ${list[k]!.value} is not bigger, so ${key.value} stays after it.`}`,
            lines: ['insert'],
            level: 3,
            marks: [mark(`v${key.uid}`, 'active'), mark(`v${list[k]!.uid}`, 'compare')],
            vars: vars({ bucket: b }),
            extra: extra(),
          });
          if (!bigger) break;
          list[k + 1] = list[k]!;
          list[k] = key;
          run.count('shifts');
          moved++;
          k--;
        }
        yield run.step({
          say:
            moved === 0
              ? `Bucket ${b}: ${key.value} is already in place.`
              : `Bucket ${b}: ${key.value} moves in front of ${plural(moved, 'bigger value')}.`,
          lines: ['insert'],
          level: 2,
          marks: [mark(`v${key.uid}`, 'active')],
          vars: vars({ bucket: b }),
          extra: extra(),
        });
      }
      const made = (run.counts.comparisons ?? 0) - before;
      yield run.step({
        say: `Bucket ${b} is sorted: ${list.map((x) => x.value).join(', ')}, after ${plural(made, 'comparison')}.`,
        lines: ['insert'],
        level: 2,
        vars: vars({ bucket: b }),
        extra: extra(),
      });
    }

    // Gather the buckets in order.
    let k = 0;
    for (let b = 0; b < n; b++) {
      const list = buckets[b]!;
      if (list.length === 0) continue;
      const from = k;
      const moved = [...list];
      for (const item of moved) run.a[k++] = item;
      list.length = 0;
      yield run.step({
        say: `Bucket ${b} goes back into ${from === k - 1 ? `A[${from}]` : `A[${from}..${k - 1}]`}: ${moved.map((x) => x.value).join(', ')}.`,
        lines: ['join'],
        level: 2,
        marks: moved.map((x) => mark(`v${x.uid}`, 'active')),
        vars: vars({ bucket: b }),
        extra: extra(),
      });
    }
    for (let i = 0; i < n; i++) run.done.add(i);
    const c = run.counts.comparisons ?? 0;
    const crowded = Math.max(...sizes);
    yield run.step({
      say:
        `Sorted: ${run.a.map((x) => x.value).join(', ')}. Insertion sort made ${plural(c, 'comparison')} in all` +
        (crowded === n
          ? `: every value landed in one bucket, so this was a plain insertion sort, the worst case.`
          : crowded <= 2
            ? `: no bucket held more than ${plural(crowded, 'value')}.`
            : `; the fullest bucket held ${crowded} values.`) +
        stabilityNote(start, run.a),
      lines: [],
      level: 1,
      vars: vars({ fullest: crowded }),
      extra: { ...extra(), regions: doneRegions(run) },
    });
    return run.state();
  },
};

export const ops = {
  load: loadIn<BucketSettings>({
    range: () => ({ lo: 0, hi: 99, max: MAX_N }),
    parse: valuesFromArg,
    ready: 'Ready to sort.',
  }),
  sort,
};

const L = (id: string, indent: number, text: string, plain: string): PseudoLine => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: BucketSettings): PseudoBlock[] {
  const fractions = settings.values === 'fraction';
  return [
    {
      op: 'sort',
      lines: [
        L(
          'sig',
          0,
          'bucketSort(A, n)',
          fractions ? 'To sort n values in [0, 1):' : 'To sort n whole numbers:',
        ),
        L('new', 1, 'make n empty buckets B[0..n - 1]', 'make one empty bucket per value.'),
        L(
          'scatter',
          1,
          fractions
            ? 'for each x in A: append x to B[floor(n * x)]'
            : 'for each v in A: append v to B[floor(n * (v - min) / (max - min + 1))]',
          'Put each value at the back of the bucket for its part of the range.',
        ),
        L('each', 1, 'for i = 0 to n - 1', 'Then, bucket by bucket,'),
        L('insert', 2, 'insertion sort B[i]', 'sort it with insertion sort.'),
        L('join', 1, 'A = B[0] + B[1] + ... + B[n - 1]', 'Join the buckets in order.'),
      ],
    },
  ];
}

export function initialSay(state: ArrayState, settings: BucketSettings): string {
  return settings.values === 'fraction'
    ? `A holds ${plural(state.a.length, 'value')} in [0, 1): ${state.a.map((x) => x.value).join(', ')}. Sort them, or load your own (up to ${MAX_N} values like 0.78).`
    : `A holds ${plural(state.a.length, 'value')}: ${state.a.map((x) => x.value).join(', ')}. Sort them, or load your own (up to ${MAX_N} whole numbers from 0 to 99).`;
}

export function initialVars(state: ArrayState) {
  return { n: state.a.length };
}
