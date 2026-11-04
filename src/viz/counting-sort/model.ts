import type { OpSpec, PseudoBlock, PseudoLine, Scalar } from '../../engine/types';
import type { BarsPointer } from '../../layouts/bars';
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

/** Values from 0 to 20, at most 20 of them: C then has at most 21 slots, like A. */
export const RANGE: Range = { lo: 0, hi: 20, max: 20 };

export interface CountSettings {
  [key: string]: Scalar;
  draw: Draw;
}

/** View-only data: the count array C, with the output array B in `aux`. */
export interface CountExtra extends ArrayExtra {
  counts?: { values: number[] };
}

export type CountStep = ArrayStep & { extra?: CountExtra };

type Op = OpSpec<ArrayState, CountSettings, CountExtra>;

export const defaults: CountSettings = { draw: 'cells' };

/** Shape id of the count C[i] (the bars layout draws it like a value with this uid). */
export const COUNT_UID = 1_000_000;
export const countId = (i: number) => `v${COUNT_UID + i}`;

export const START = [2, 5, 3, 0, 2, 3, 0, 3];

export function init(): ArrayState {
  return makeState(START);
}

const sort: Op = {
  label: 'Sort',
  arity: 0,
  *run(s) {
    const run = new Run(s, ['comparisons']);
    const n = run.n;
    if (n === 0) {
      yield run.step({ say: 'A is empty.', lines: ['sig'], level: 1, vars: { n } });
      return run.state();
    }
    const start = [...run.a];
    const k = Math.max(...run.a.map((x) => x.value));
    const C: number[] = Array(k + 1).fill(0);
    const B: (Item | null)[] = Array(n).fill(null);
    let steps = 0;
    const extra = (pointers: BarsPointer[] = []): CountExtra => ({
      counts: { values: [...C] },
      aux: { items: [...B], from: 0, to: n - 1 },
      pointers,
    });
    const vars = (more: Record<string, Scalar> = {}) => ({ n, k, ...more, steps });

    yield run.step({
      say: `The largest value is k = ${k}. Make a count array C[0..${k}], all 0, and an output array B with room for ${plural(n, 'value')}.`,
      lines: ['sig', 'new'],
      level: 2,
      vars: vars(),
      extra: extra(),
    });

    // Count each value.
    for (let j = 0; j < n; j++) {
      const v = run.v(j);
      C[v]!++;
      steps++;
      const last = j === n - 1;
      yield run.step({
        say:
          `A[${j}] = ${v}: add 1 to C[${v}], which is now ${C[v]}.` +
          (last ? ` Counting is done: C[i] says how many values equal i.` : ''),
        lines: ['count'],
        level: last ? 1 : 2,
        marks: [mark(run.id(j), 'active'), mark(countId(v), 'active')],
        vars: vars({ j, 'C[A[j]]': C[v]! }),
        extra: extra([{ name: 'j', at: j }]),
      });
    }

    // Prefix sums: C[i] becomes the number of values <= i.
    if (k === 0) {
      yield run.step({
        say: 'k = 0, so there is nothing to add up: every value is 0.',
        lines: ['prefix'],
        level: 1,
        vars: vars(),
        extra: extra(),
      });
    }
    for (let i = 1; i <= k; i++) {
      const before = C[i]!;
      C[i] = before + C[i - 1]!;
      steps++;
      const last = i === k;
      yield run.step({
        say:
          `C[${i}] = C[${i}] + C[${i - 1}] = ${before} + ${C[i - 1]} = ${C[i]}: ${plural(C[i]!, 'value is', 'values are')} ≤ ${i}.` +
          (last
            ? ` Now C[v] says where the values equal to v end: the last v belongs in B[C[v] − 1].`
            : ''),
        lines: ['prefix'],
        level: last ? 1 : 2,
        marks: [mark(countId(i), 'active'), mark(countId(i - 1), 'compare')],
        vars: vars({ i, 'C[i]': C[i]! }),
        extra: extra([{ name: 'i', at: i, row: 'c' }]),
      });
    }

    // Place from the right, so equal values keep their order.
    for (let j = n - 1; j >= 0; j--) {
      const item = run.a[j]!;
      const v = item.value;
      C[v]!--;
      const p = C[v]!;
      B[p] = item;
      run.a[j] = { uid: 0, value: v, stale: true };
      steps++;
      const last = j === 0;
      yield run.step({
        say:
          `A[${j}] = ${v}: take 1 from C[${v}], leaving ${p}, and put the ${v} in B[${p}].` +
          (last
            ? ` B is sorted. The values went in from the right, so equal values kept the order they had in A: counting sort is stable.`
            : ''),
        lines: ['place', 'dec', 'put'],
        level: last ? 1 : 2,
        marks: [mark(`v${item.uid}`, 'active'), mark(countId(v), 'active')],
        vars: vars({ j, 'C[A[j]]': p }),
        extra: extra([
          { name: 'j', at: j },
          { name: 'p', at: p, row: 'aux' },
        ]),
      });
    }

    // Copy B back into A.
    for (let p = 0; p < n; p++) {
      run.a[p] = B[p]!;
      B[p] = null;
    }
    steps += n;
    for (let p = 0; p < n; p++) run.done.add(p);
    yield run.step({
      say: 'Copy B back into A.',
      lines: ['copy'],
      level: 2,
      vars: vars(),
      extra: extra(),
    });
    yield run.step({
      say:
        `Sorted: ${run.a.map((x) => x.value).join(', ')}. No comparisons at all: ${n} counts, ${k} additions, ${n} placements and ${n} copies, ${steps} steps for n = ${n} and k = ${k}.` +
        stabilityNote(start, run.a),
      lines: [],
      level: 1,
      vars: vars(),
      extra: { ...extra(), regions: doneRegions(run) },
    });
    return run.state();
  },
};

export const ops = {
  load: loadIn<CountSettings>({
    range: () => RANGE,
    ready: 'Ready to sort.',
    vars: (s) => ({ k: s.a.length ? Math.max(...s.a.map((x) => x.value)) : 0 }),
  }),
  sort,
};

const L = (id: string, indent: number, text: string, plain: string): PseudoLine => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(): PseudoBlock[] {
  return [
    {
      op: 'sort',
      lines: [
        L('sig', 0, 'countingSort(A, n, k)', 'To sort n values from 0 to k:'),
        L(
          'new',
          1,
          'C[0..k] = 0; B = new array [0..n - 1]',
          'make a count for every value, all 0.',
        ),
        L(
          'count',
          1,
          'for j = 0 to n - 1: C[A[j]] = C[A[j]] + 1',
          'Count how often each value occurs.',
        ),
        L(
          'prefix',
          1,
          'for i = 1 to k: C[i] = C[i] + C[i - 1]',
          'Add up: C[i] is now how many are ≤ i.',
        ),
        L('place', 1, 'for j = n - 1 down to 0', 'Then, from the right end of A,'),
        L('dec', 2, 'C[A[j]] = C[A[j]] - 1', 'step back one place for that value'),
        L('put', 2, 'B[C[A[j]]] = A[j]', 'and put it there in B.'),
        L('copy', 1, 'copy B into A', 'B is sorted; copy it back.'),
      ],
    },
  ];
}

export function initialSay(state: ArrayState): string {
  return `A holds ${plural(state.a.length, 'value')}: ${state.a.map((x) => x.value).join(', ')}. Sort them, or load your own (up to ${RANGE.max} whole numbers from 0 to ${RANGE.hi}).`;
}

export function initialVars(state: ArrayState) {
  return { n: state.a.length, k: state.a.length ? Math.max(...state.a.map((x) => x.value)) : 0 };
}
