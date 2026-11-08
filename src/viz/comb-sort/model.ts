/**
 * Comb sort: bubble sort with a gap. Each pass compares values `gap` apart and swaps them if
 * they are out of order; the gap shrinks by a factor (1.3 by default) after every pass until it
 * reaches 1, and then passes of plain bubble sort run until one makes no swap.
 *
 * Bubble sort's problem is turtles: small values near the end crawl left one slot per pass.
 * A big gap carries them most of the way in a few swaps. The gap is computed in whole numbers
 * (gap · 10 / 13 for 1.3, gap · 10 / 11 for 1.1), so 33 / 1.1 is 30 here, not the 29.999...
 * that floating point gives.
 */
import type { OpSpec, PseudoBlock, PseudoLine, Scalar } from '../../engine/types';
import {
  at,
  doneRegions,
  loadOp,
  makeState,
  mark,
  plural,
  Run,
  SORT_START,
  stabilityNote,
  type ArrayExtra,
  type ArrayState,
  type Draw,
} from '../_sorting/kit';

export type Shrink = '1.3' | '2' | '1.1';

export interface CombSettings {
  [key: string]: Scalar;
  shrink: Shrink;
  draw: Draw;
}

export const defaults: CombSettings = { shrink: '1.3', draw: 'bars' };

/** The shrink factor as a fraction num / den, so gap · den / num stays a whole number. */
const FACTOR: Record<Shrink, { num: number; den: number }> = {
  '1.3': { num: 13, den: 10 },
  '2': { num: 2, den: 1 },
  '1.1': { num: 11, den: 10 },
};

/** The next gap: floor(gap / factor), computed in whole numbers. */
export const nextGap = (gap: number, shrink: Shrink): number =>
  Math.floor((gap * FACTOR[shrink].den) / FACTOR[shrink].num);

type Op = OpSpec<ArrayState, CombSettings, ArrayExtra>;

export function init(): ArrayState {
  return makeState(SORT_START);
}

/** What bubble sort (from the front, stopping after a pass with no swaps) does on vs. */
export function bubbleCost(vs: readonly number[]): {
  comparisons: number;
  swaps: number;
  passes: number;
} {
  const a = [...vs];
  let comparisons = 0;
  let swaps = 0;
  let passes = 0;
  for (let end = a.length - 1; end > 0; end--) {
    passes++;
    let swapped = false;
    for (let j = 0; j < end; j++) {
      comparisons++;
      if (a[j]! > a[j + 1]!) {
        [a[j], a[j + 1]] = [a[j + 1]!, a[j]!];
        swaps++;
        swapped = true;
      }
    }
    if (!swapped) break;
  }
  return { comparisons, swaps, passes };
}

const sort: Op = {
  label: 'Sort',
  arity: 0,
  *run(s, _args, { settings }) {
    const r = new Run(s, ['comparisons', 'swaps']);
    const n = r.n;
    const start = [...r.a];
    const bubble = bubbleCost(start.map((x) => x.value));
    if (n < 2) {
      for (let k = 0; k < n; k++) r.done.add(k);
      yield r.step({
        say: n === 1 ? 'A has one value, so it is already sorted.' : 'A is empty.',
        lines: ['sig'],
        level: 1,
        vars: { n },
      });
      return r.state();
    }
    const f = settings.shrink;
    let gap = n;
    let sorted = false;
    let pass = 0;
    let i = 0;
    const vars = (withI: boolean): Record<string, Scalar> => ({
      gap,
      ...(withI ? { i } : {}),
      pass,
      sorted,
    });
    const extra = (withI: boolean): ArrayExtra =>
      withI
        ? {
            pointers: [
              { name: 'i', at: i },
              { name: 'i+gap', at: i + gap },
            ],
          }
        : {};

    yield r.step({
      say: `Start with gap = n = ${n}. Each pass divides it by ${f} and compares values that far apart.`,
      lines: ['init'],
      level: 2,
      vars: vars(false),
    });
    while (!sorted) {
      const old = gap;
      gap = nextGap(gap, f);
      pass++;
      let clamp = '';
      if (gap <= 1) {
        clamp = gap < 1 ? ', which is less than 1, so gap = 1' : '';
        gap = 1;
        sorted = true;
      }
      yield r.step({
        say:
          `Pass ${pass}: gap = floor(${old} / ${f}) = ${nextGap(old, f)}${clamp}. ` +
          (gap === 1
            ? 'With gap 1 this is a pass of bubble sort; if it makes no swap, A is sorted.'
            : `Compare each A[i] with A[i + ${gap}].`),
        lines: gap === 1 ? ['loop', 'shrink', 'last'] : ['loop', 'shrink'],
        level: 2,
        vars: vars(false),
      });
      let passSwaps = 0;
      for (i = 0; i + gap < n; i++) {
        const j = i + gap;
        const [x, y] = [r.v(i), r.v(j)];
        r.count('comparisons');
        const pair = `${at(i, x)} and ${at(j, y)}`;
        if (x <= y) {
          yield r.step({
            say: `Compare ${pair}: in order, so leave them.`,
            lines: ['for', 'cmp'],
            level: 3,
            marks: [mark(r.id(i), 'compare'), mark(r.id(j), 'compare')],
            vars: vars(true),
            extra: extra(true),
          });
          continue;
        }
        yield r.step({
          say: `Compare ${pair}: ${x} > ${y}, out of order.`,
          lines: ['for', 'cmp'],
          level: 3,
          marks: [mark(r.id(i), 'compare'), mark(r.id(j), 'compare')],
          vars: vars(true),
          extra: extra(true),
        });
        r.swap(i, j);
        r.count('swaps');
        passSwaps++;
        sorted = false;
        yield r.step({
          say: `Swap them: ${y} jumps ${plural(gap, 'slot')} left to A[${i}], and ${x} jumps right to A[${j}].`,
          lines: ['swap', 'flag'],
          level: 2,
          marks: [mark(r.id(i), 'active'), mark(r.id(j), 'active')],
          vars: vars(true),
          extra: extra(true),
        });
      }
      const done = sorted;
      yield r.step({
        say:
          `End of pass ${pass} (gap ${gap}): ${passSwaps === 0 ? 'no swaps' : plural(passSwaps, 'swap')}.` +
          (done
            ? ' A pass with gap 1 and no swaps means every neighbor pair is in order: A is sorted.'
            : gap === 1
              ? ' The gap stays 1; run another pass.'
              : ''),
        lines: ['loop'],
        level: 1,
        vars: vars(false),
      });
    }
    for (let k = 0; k < n; k++) r.done.add(k);
    yield r.step({
      say:
        `Sorted: ${r.a.map((x) => x.value).join(', ')}. That took ${plural(pass, 'pass', 'passes')}, ${r.tally()}. ` +
        `Bubble sort would make ${plural(bubble.comparisons, 'comparison')} and ${plural(bubble.swaps, 'swap')} in ${plural(bubble.passes, 'pass', 'passes')}.` +
        stabilityNote(start, r.a),
      lines: [],
      level: 1,
      vars: { n, passes: pass, bubble: bubble.comparisons },
      extra: { regions: doneRegions(r) },
    });
    return r.state();
  },
};

export const ops = {
  load: loadOp<CombSettings>({ ready: 'Ready to sort.' }),
  sort,
};

const L = (id: string, indent: number, text: string, plain: string): PseudoLine => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(st: CombSettings): PseudoBlock[] {
  return [
    {
      op: 'sort',
      lines: [
        L('sig', 0, 'combSort(A, n)', 'To sort A[0..n-1]:'),
        L('init', 1, 'gap = n; sorted = false', 'Start with a gap as wide as the array.'),
        L('loop', 1, 'while not sorted', 'Until a pass with gap 1 makes no swap:'),
        L(
          'shrink',
          2,
          `gap = floor(gap / ${st.shrink})`,
          `shrink the gap by a factor of ${st.shrink},`,
        ),
        L(
          'last',
          2,
          'if gap <= 1: gap = 1; sorted = true',
          'and once it reaches 1, hope this pass is the last.',
        ),
        L('for', 2, 'for i = 0 to n - gap - 1', 'Walk i along the array:'),
        L(
          'cmp',
          3,
          'if A[i] > A[i + gap]',
          'if A[i] and the value gap slots later are out of order,',
        ),
        L('swap', 4, 'swap A[i] and A[i + gap]', 'swap them'),
        L('flag', 4, 'sorted = false', 'and remember that this pass was not the last.'),
      ],
    },
  ];
}

export function initialSay(state: ArrayState): string {
  return `A holds ${plural(state.a.length, 'value')}: ${state.a.map((x) => x.value).join(', ')}. Sort them, or load your own (up to 20 whole numbers from 0 to 99).`;
}

export function initialVars(state: ArrayState) {
  return { n: state.a.length };
}
