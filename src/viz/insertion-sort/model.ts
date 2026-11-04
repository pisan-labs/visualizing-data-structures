import type { OpSpec, PseudoBlock, PseudoLine, Scalar } from '../../engine/types';
import type { BarsRegion } from '../../layouts/bars';
import {
  at,
  doneRegions,
  loadOp,
  makeState,
  mark,
  plural,
  Run,
  SORT_START,
  span,
  type ArrayExtra,
  type ArrayState,
  type ArrayStep,
  type Draw,
  type Item,
} from '../_sorting/kit';

export interface InsertionSettings {
  [key: string]: Scalar;
  /** shift: CLRS, hold the key and shift larger values right. swap: swap neighbors. */
  move: 'shift' | 'swap';
  draw: Draw;
}

export const defaults: InsertionSettings = { move: 'shift', draw: 'bars' };

type Op = OpSpec<ArrayState, InsertionSettings, ArrayExtra>;
type Gen = Generator<ArrayStep, ArrayState, void>;

export function init(): ArrayState {
  return makeState(SORT_START);
}

const sortedSoFar = (to: number): BarsRegion[] =>
  to >= 0 ? [{ id: 'sorted', from: 0, to, tone: 'plain', label: 'sorted so far' }] : [];

function* finish(r: Run): Gen {
  for (let k = 0; k < r.n; k++) r.done.add(k);
  yield r.step({
    say: `Sorted: ${r.a.map((x) => x.value).join(', ')}. That took ${r.tally()}.`,
    lines: [],
    level: 1,
    vars: { n: r.n },
    extra: { regions: doneRegions(r) },
  });
  return r.state();
}

/** CLRS: lift the key out, shift larger values right, drop the key into the hole. */
function* shifting(r: Run): Gen {
  const n = r.n;
  for (let i = 1; i < n; i++) {
    yield r.step({
      say: `i = ${i}: insert ${at(i, r.v(i))} into the sorted part, ${span(0, i - 1)}.`,
      lines: ['outer'],
      level: 2,
      marks: [mark(r.id(i), 'found')],
      vars: { i },
      extra: { pointers: [{ name: 'i', at: i }], regions: sortedSoFar(i - 1) },
    });
    const key: Item = r.a[i]!;
    r.a[i] = { uid: 0, value: key.value, stale: true };
    let j = i - 1;
    const held = () => ({ uid: key.uid, value: key.value, at: j + 1, label: 'key' });
    const extra = (): ArrayExtra => ({
      pointers: [
        { name: 'j', at: j },
        { name: 'i', at: i },
      ],
      regions: sortedSoFar(i),
      held: held(),
    });
    const vars = () => ({ i, key: key.value, j });
    yield r.step({
      say: `key = ${key.value}. Lift it out of A[${i}]; the old copy stays there until something overwrites it. Start with j = ${j}.`,
      lines: ['key', 'init'],
      level: 2,
      marks: [mark(`v${key.uid}`, 'found')],
      vars: vars(),
      extra: extra(),
    });
    for (;;) {
      if (j < 0) {
        yield r.step({
          say: `j = -1: every value in the sorted part was bigger, so ${key.value} goes to the front.`,
          lines: ['while'],
          level: 2,
          marks: [mark(`v${key.uid}`, 'found')],
          vars: vars(),
          extra: extra(),
        });
        break;
      }
      const v = r.v(j);
      r.count('comparisons');
      yield r.step({
        say: `Is ${at(j, v)} bigger than key = ${key.value}?`,
        lines: ['while'],
        level: 3,
        marks: [mark(r.id(j), 'compare'), mark(`v${key.uid}`, 'found')],
        vars: vars(),
        extra: extra(),
      });
      if (v <= key.value) {
        yield r.step({
          say: `${v} is not bigger than ${key.value}, so stop: ${key.value} belongs right after it, in A[${j + 1}].`,
          lines: ['while'],
          level: 2,
          marks: [mark(r.id(j), 'compare'), mark(`v${key.uid}`, 'found')],
          vars: vars(),
          extra: extra(),
        });
        break;
      }
      const moving = r.a[j]!;
      r.a[j + 1] = moving;
      r.a[j] = { uid: 0, value: moving.value, stale: true };
      r.count('shifts');
      j--;
      yield r.step({
        say: `${v} > ${key.value}, so shift ${v} right into A[${j + 2}] and move j left to ${j}.`,
        lines: ['shift', 'dec'],
        level: 2,
        marks: [mark(`v${moving.uid}`, 'active'), mark(`v${key.uid}`, 'found')],
        vars: vars(),
        extra: extra(),
      });
    }
    r.a[j + 1] = key;
    yield r.step({
      say: `A[${j + 1}] = key: ${key.value} drops into the gap. ${span(0, i)} is sorted so far.`,
      lines: ['drop'],
      level: 1,
      marks: [mark(`v${key.uid}`, 'found')],
      vars: { i, key: key.value, j },
      extra: {
        pointers: [
          { name: 'j', at: j },
          { name: 'i', at: i },
        ],
        regions: sortedSoFar(i),
      },
    });
  }
  return yield* finish(r);
}

/** Swap the new value left, one neighbor at a time, until it fits. */
function* swapping(r: Run): Gen {
  const n = r.n;
  for (let i = 1; i < n; i++) {
    let j = i;
    // The new value travels through the sorted part, so only what is left of it is shaded.
    const extra = (): ArrayExtra => ({
      pointers: [
        { name: 'j', at: j },
        { name: 'i', at: i },
      ],
      regions: sortedSoFar(j - 1),
    });
    yield r.step({
      say: `i = ${i}: move ${at(i, r.v(i))} left until it fits into the sorted part, ${span(0, i - 1)}. Start with j = ${i}.`,
      lines: ['outer', 'init'],
      level: 2,
      marks: [mark(r.id(i), 'found')],
      vars: { i, j },
      extra: extra(),
    });
    const value = r.v(i);
    for (;;) {
      if (j === 0) {
        yield r.step({
          say: `j = 0: ${value} has reached the front. ${span(0, i)} is sorted so far.`,
          lines: ['while'],
          level: 1,
          marks: [mark(r.id(0), 'found')],
          vars: { i, j },
          extra: { ...extra(), regions: sortedSoFar(i) },
        });
        break;
      }
      const [x, y] = [r.v(j - 1), r.v(j)];
      r.count('comparisons');
      yield r.step({
        say: `Is ${at(j - 1, x)} bigger than ${at(j, y)}?`,
        lines: ['while'],
        level: 3,
        marks: [mark(r.id(j - 1), 'compare'), mark(r.id(j), 'found')],
        vars: { i, j },
        extra: extra(),
      });
      if (x <= y) {
        yield r.step({
          say: `${x} is not bigger than ${y}, so ${y} is in place. ${span(0, i)} is sorted so far.`,
          lines: ['while'],
          level: 1,
          marks: [mark(r.id(j), 'found')],
          vars: { i, j },
          extra: { ...extra(), regions: sortedSoFar(i) },
        });
        break;
      }
      r.swap(j - 1, j);
      r.count('swaps');
      j--;
      yield r.step({
        say: `${x} > ${y}, so swap them: ${y} moves left to A[${j}]. j = ${j}.`,
        lines: ['swap', 'dec'],
        level: 2,
        marks: [mark(r.id(j), 'found'), mark(r.id(j + 1), 'active')],
        vars: { i, j },
        extra: extra(),
      });
    }
  }
  return yield* finish(r);
}

const sort: Op = {
  label: 'Sort',
  arity: 0,
  *run(s, _args, { settings }) {
    const shift = settings.move === 'shift';
    const r = new Run(s, ['comparisons', shift ? 'shifts' : 'swaps']);
    if (r.n < 2) {
      for (let k = 0; k < r.n; k++) r.done.add(k);
      yield r.step({
        say: r.n === 1 ? 'A has one value, so it is already sorted.' : 'A is empty.',
        lines: ['sig'],
        level: 1,
        vars: { n: r.n },
      });
      return r.state();
    }
    return yield* shift ? shifting(r) : swapping(r);
  },
};

export const ops = {
  load: loadOp<InsertionSettings>({ ready: 'Ready to sort.' }),
  sort,
};

const L = (id: string, indent: number, text: string, plain: string): PseudoLine => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(st: InsertionSettings): PseudoBlock[] {
  const sig = L('sig', 0, 'insertionSort(A, n)', 'To insertion sort the n values in A:');
  const outer = L('outer', 1, 'for i = 1 to n - 1', 'Take the values one at a time, from A[1] on.');
  if (st.move === 'swap') {
    return [
      {
        op: 'sort',
        lines: [
          sig,
          outer,
          L('init', 2, 'j = i', 'Start with the new value at j = i.'),
          L('while', 2, 'while j > 0 and A[j - 1] > A[j]', 'While its left neighbor is bigger,'),
          L('swap', 3, 'swap A[j - 1] and A[j]', 'swap them,'),
          L('dec', 3, 'j = j - 1', 'and follow the new value to the left.'),
        ],
      },
    ];
  }
  return [
    {
      op: 'sort',
      lines: [
        sig,
        outer,
        L('key', 2, 'key = A[i]', 'Lift the new value out.'),
        L('init', 2, 'j = i - 1', 'Start at the end of the sorted part.'),
        L('while', 2, 'while j >= 0 and A[j] > key', 'While the value at j is bigger than key,'),
        L('shift', 3, 'A[j + 1] = A[j]', 'shift it one slot to the right,'),
        L('dec', 3, 'j = j - 1', 'and look one slot further left.'),
        L('drop', 2, 'A[j + 1] = key', 'Drop key into the gap.'),
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
