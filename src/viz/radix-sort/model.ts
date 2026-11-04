import type { OpSpec, PseudoBlock, PseudoLine, Scalar } from '../../engine/types';
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
import { loadIn, type Range } from '../_sorting/linear';

/** Up to 12 values from 0 to 999: three digits in base 10, ten in base 2. */
export const RANGE: Range = { lo: 0, hi: 999, max: 12 };

export interface RadixSettings {
  [key: string]: Scalar;
  base: number;
  draw: Draw;
}

/** View-only data: the buckets of the current pass. */
export interface RadixExtra extends ArrayExtra {
  buckets?: Item[][];
  /** The deepest any bucket gets during this sort, so the frame stays the same. */
  depth?: number;
  /** The pass (1 = the last digit) and the place value of its digit. */
  pass?: number;
  place?: number;
}

export type RadixStep = ArrayStep & { extra?: RadixExtra };

type Op = OpSpec<ArrayState, RadixSettings, RadixExtra>;

export const defaults: RadixSettings = { base: 10, draw: 'cells' };

export const START = [329, 457, 657, 839, 436, 720, 355];

export function init(): ArrayState {
  return makeState(START);
}

/** A digit as it is written in base b: 0-9, then A-F. */
export const digitText = (d: number) => d.toString(16).toUpperCase();

export const digitOf = (v: number, place: number, base: number) => Math.floor(v / place) % base;

/** How many digits the largest value has in base b; at least 1. */
export function passesFor(values: readonly number[], base: number): number {
  let max = Math.max(0, ...values);
  let d = 1;
  while (max >= base) {
    max = Math.floor(max / base);
    d++;
  }
  return d;
}

/** The value written in base b, for narration ("329" in base 10, "101001001" in base 2). */
export const inBase = (v: number, base: number) => v.toString(base).toUpperCase();

/** "the 1s", "the 10s", "the 16s". */
const placeName = (place: number) => `the ${place}s`;

const sort: Op = {
  label: 'Sort',
  arity: 0,
  *run(s, _args, { settings }) {
    const base = settings.base;
    const run = new Run(s, ['moves']);
    const n = run.n;
    if (n === 0) {
      yield run.step({ say: 'A is empty.', lines: ['sig'], level: 1, vars: { n, base } });
      return run.state();
    }
    const start = [...run.a];
    const passes = passesFor(
      start.map((x) => x.value),
      base,
    );
    // The deepest bucket over every pass, computed ahead so the frame never changes.
    let depth = 1;
    {
      let order = start.map((x) => x.value);
      for (let d = 0, place = 1; d < passes; d++, place *= base) {
        const sizes: number[] = Array(base).fill(0);
        for (const v of order) sizes[digitOf(v, place, base)]!++;
        depth = Math.max(depth, ...sizes);
        order = order
          .map((v, i) => ({ v, i, g: digitOf(v, place, base) }))
          .sort((p, q) => p.g - q.g || p.i - q.i)
          .map((x) => x.v);
      }
    }
    const max = Math.max(...start.map((x) => x.value));
    yield run.step({
      say: `The largest value, ${max}, has ${plural(passes, 'digit')} in base ${base}${base === 10 ? '' : ` (${inBase(max, base)})`}, so there will be ${plural(passes, 'pass', 'passes')}, one per digit, starting with the last digit. Each pass uses ${base} buckets, one per digit value.`,
      lines: ['sig'],
      level: 2,
      vars: { n, base, passes },
      extra: {
        depth,
        buckets: Array.from({ length: base }, () => []),
      } satisfies RadixExtra as RadixExtra,
    });

    let place = 1;
    for (let pass = 1; pass <= passes; pass++, place *= base) {
      const buckets: Item[][] = Array.from({ length: base }, () => []);
      const extra = (): RadixExtra => ({
        buckets: buckets.map((b) => [...b]),
        depth,
        pass,
        place,
      });
      const vars = (more: Record<string, Scalar> = {}) => ({ n, base, pass, place, ...more });
      yield run.step({
        say: `Pass ${pass} sorts by the digit worth ${placeName(place)}. Take the values from left to right and put each one at the back of the bucket for that digit.`,
        lines: ['pass'],
        level: 2,
        vars: vars(),
        extra: extra(),
      });
      for (let j = 0; j < n; j++) {
        const item = run.a[j]!;
        const g = digitOf(item.value, place, base);
        buckets[g]!.push(item);
        run.a[j] = { uid: 0, value: item.value, stale: true };
        run.count('moves');
        yield run.step({
          say: `A[${j}] = ${item.value}${base === 10 ? '' : ` (${inBase(item.value, base)} in base ${base})`}: its digit worth ${placeName(place)} is ${digitText(g)}, so it goes to the back of bucket ${digitText(g)}.`,
          lines: ['scatter', 'append'],
          level: 2,
          marks: [mark(`v${item.uid}`, 'active')],
          vars: vars({ j, digit: digitText(g) }),
          extra: extra(),
        });
      }
      // Collect the buckets in order, each from front to back.
      let k = 0;
      for (let g = 0; g < base; g++) {
        const bucket = buckets[g]!;
        if (bucket.length === 0) continue;
        const from = k;
        const moved = [...bucket];
        for (const item of moved) {
          run.a[k++] = item;
          run.count('moves');
        }
        bucket.length = 0;
        yield run.step({
          say: `Bucket ${digitText(g)} goes back into ${from === k - 1 ? `A[${from}]` : `A[${from}..${k - 1}]`}, front first: ${moved.map((x) => x.value).join(', ')}.`,
          lines: ['gather'],
          level: 2,
          marks: moved.map((x) => mark(`v${x.uid}`, 'active')),
          vars: vars(),
          extra: extra(),
        });
      }
      const last = pass === passes;
      if (last) for (let i = 0; i < n; i++) run.done.add(i);
      yield run.step({
        say: last
          ? `After pass ${pass}, A is sorted by every digit: ${run.a.map((x) => x.value).join(', ')}.`
          : `After pass ${pass}, A is sorted by its last ${pass === 1 ? 'digit' : `${pass} digits`}: ${run.a.map((x) => x.value).join(', ')}. Values with the same digit kept the order the earlier passes gave them.`,
        lines: ['gather'],
        level: 1,
        vars: vars(),
        extra: { ...extra(), regions: last ? doneRegions(run) : undefined },
      });
    }
    yield run.step({
      say:
        `Sorted: ${run.a.map((x) => x.value).join(', ')}. ${plural(passes, 'pass', 'passes')} of ${n} values and ${base} buckets, and not a single comparison.` +
        stabilityNote(start, run.a),
      lines: [],
      level: 1,
      vars: { n, base, passes, ...run.counts },
      extra: {
        regions: doneRegions(run),
        buckets: Array.from({ length: base }, () => []),
        depth,
      } satisfies RadixExtra as RadixExtra,
    });
    return run.state();
  },
};

export const ops = {
  load: loadIn<RadixSettings>({ range: () => RANGE, ready: 'Ready to sort.' }),
  sort,
};

const L = (id: string, indent: number, text: string, plain: string): PseudoLine => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: RadixSettings): PseudoBlock[] {
  const b = settings.base;
  return [
    {
      op: 'sort',
      lines: [
        L('sig', 0, `radixSort(A, n), base ${b}`, `To sort whole numbers in base ${b}:`),
        L(
          'pass',
          1,
          `for place = 1, ${b}, ${b * b}, ... while a value has that digit`,
          'for each digit, from the last to the first:',
        ),
        L('scatter', 2, 'for j = 0 to n - 1', 'take the values from left to right'),
        L(
          'append',
          3,
          `append A[j] to bucket[(A[j] / place) mod ${b}]`,
          'and put each at the back of the bucket for its digit;',
        ),
        L(
          'gather',
          2,
          `A = bucket[0] + bucket[1] + ... + bucket[${b - 1}]`,
          'then collect the buckets in order: a stable sort by this digit.',
        ),
      ],
    },
  ];
}

export function initialSay(state: ArrayState, settings: RadixSettings): string {
  return `A holds ${plural(state.a.length, 'value')}: ${state.a.map((x) => x.value).join(', ')}. Sort them one digit at a time in base ${settings.base}, or load your own (up to ${RANGE.max} whole numbers from 0 to ${RANGE.hi}).`;
}

export function initialVars(state: ArrayState, settings: RadixSettings) {
  return {
    n: state.a.length,
    base: settings.base,
    passes: passesFor(
      state.a.map((x) => x.value),
      settings.base,
    ),
  };
}
