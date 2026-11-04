import type { PracticeKind } from '../../engine/types';
import {
  counter,
  distinct,
  list,
  load,
  milestones,
  stepsOf,
  twinKind,
  valuesAt,
  type ArrayDef,
} from '../_sorting/practice';

/** Practice questions for selection sort. Every answer comes from running the model. */
export function selectionPractice(def: () => ArrayDef): PracticeKind[] {
  return [
    {
      id: 'passes',
      title: 'The array after a pass or two',
      make(rng) {
        const select = rng.int(0, 1) ? 'min' : 'max';
        const settings = { select };
        const passes = rng.int(1, 2);
        const values = distinct(rng, rng.int(5, 7));
        const setup = [load(values)];
        const after = valuesAt(
          milestones(stepsOf(def(), settings, [...setup, ['sort']]))[passes - 1]!,
        );
        const how =
          select === 'min'
            ? 'Each pass finds the smallest value left and swaps it to the front of the unsorted part.'
            : 'This version finds the largest value left and swaps it to the end of the unsorted part.';
        return {
          prompt: `${how} Type A after ${passes === 1 ? 'the first pass' : 'two passes'}.`,
          setup,
          settings,
          answer: { kind: 'sequence', value: after },
          explain: `After ${passes === 1 ? 'one pass' : 'two passes'}, A is ${list(after)}. Only the swapped values move; everything else stays put.`,
          watch: [['sort']],
        };
      },
    },
    {
      id: 'comparisons',
      title: 'How many comparisons?',
      make(rng) {
        const n = rng.int(5, 9);
        const values = distinct(rng, n);
        const setup = [load(values)];
        const end = stepsOf(def(), {}, [...setup, ['sort']]).at(-1)!;
        const comparisons = counter(end, 'comparisons');
        return {
          prompt: `How many comparisons does selection sort make to sort these ${n} values?`,
          setup,
          answer: { kind: 'number', value: comparisons },
          explain: `Pass 1 compares against the other ${n - 1} values, pass 2 against ${n - 2}, and so on down to 1: ${n - 1} + ... + 1 = ${comparisons}. The order of the values makes no difference.`,
          watch: [['sort']],
        };
      },
    },
    twinKind(def, {
      name: 'Selection sort',
      why: (kept) =>
        kept
          ? 'Here no swap happened to jump one copy over the other. Other inputs can break the tie, though: selection sort is not stable.'
          : 'A long swap jumped one copy over the other. Selection sort is not stable.',
    }),
  ];
}
