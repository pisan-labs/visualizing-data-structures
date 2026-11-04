import type { PracticeKind } from '../../engine/types';
import {
  counter,
  distinct,
  list,
  load,
  stepsOf,
  twinKind,
  valuesAt,
  type ArrayDef,
} from '../_sorting/practice';
import type { ArrayStep } from '../_sorting/kit';

/** The step that ends each merge: "A[p..r] is sorted". */
const merges = (steps: ArrayStep[]) =>
  steps.filter((s) => s.lines.length === 1 && s.lines[0] === 'merge');

const STYLE = {
  topdown: 'Top-down merge sort (CLRS) splits A in half, sorts each half the same way, and merges.',
  bottomup:
    'Bottom-up merge sort merges runs of 1 into runs of 2, then runs of 2 into runs of 4, and so on, left to right.',
};

/** Practice questions for merge sort. Every answer comes from running the model. */
export function mergePractice(def: () => ArrayDef): PracticeKind[] {
  return [
    {
      id: 'first-merges',
      title: 'The array after a few merges',
      make(rng) {
        const style = rng.int(0, 1) ? 'topdown' : 'bottomup';
        const settings = { style };
        const k = rng.int(2, 3);
        const values = distinct(rng, rng.int(6, 8));
        const setup = [load(values)];
        const done = merges(stepsOf(def(), settings, [...setup, ['sort']]));
        const after = valuesAt(done[k - 1]!);
        const ranges = done
          .slice(0, k)
          .map((s) => `A[${String(s.vars?.p)}..${String(s.vars?.r)}]`)
          .join(', ');
        return {
          prompt: `${STYLE[style]} Type A after the first ${k} merges.`,
          setup,
          settings,
          answer: { kind: 'sequence', value: after },
          explain: `The first ${k} merges sort ${ranges}, in that order. After them, A is ${list(after)}.`,
          watch: [['sort']],
        };
      },
    },
    {
      id: 'merges',
      title: 'How many merges?',
      make(rng) {
        const style = rng.int(0, 1) ? 'topdown' : 'bottomup';
        const settings = { style };
        const n = rng.int(5, 12);
        const values = distinct(rng, n);
        const setup = [load(values)];
        const count = merges(stepsOf(def(), settings, [...setup, ['sort']])).length;
        return {
          prompt: `${STYLE[style]} How many merges does it make to sort these ${n} values?`,
          setup,
          settings,
          answer: { kind: 'number', value: count },
          explain: `Each merge turns two sorted runs into one. A starts as ${n} runs of one value and ends as a single run, so it takes ${count} merges, whatever the values are.`,
          watch: [['sort']],
        };
      },
    },
    {
      id: 'comparisons',
      title: 'How many comparisons?',
      make(rng) {
        const values = distinct(rng, rng.int(4, 6));
        const setup = [load(values)];
        const steps = stepsOf(def(), {}, [...setup, ['sort']]);
        const comparisons = counter(steps.at(-1)!, 'comparisons');
        const each = merges(steps).map((s, i, all) => {
          const before = i === 0 ? 0 : counter(all[i - 1]!, 'comparisons');
          return counter(s, 'comparisons') - before;
        });
        return {
          prompt: `How many comparisons does top-down merge sort make to sort A?`,
          setup,
          answer: { kind: 'number', value: comparisons },
          explain: `A merge compares the fronts of L and R until one of them runs out; the rest is copied without comparing. The merges make ${each.join(' + ')} = ${comparisons} comparisons.`,
          watch: [['sort']],
        };
      },
    },
    twinKind(def, {
      name: 'Merge sort',
      why: (kept) =>
        kept
          ? 'When the fronts of L and R are equal, merge takes from L, so the copy that started on the left stays in front. Merge sort is stable.'
          : 'A merge took the copy from R first.',
    }),
  ];
}
