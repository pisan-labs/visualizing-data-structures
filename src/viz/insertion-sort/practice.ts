import type { PracticeKind } from '../../engine/types';
import { nearlySorted } from '../_sorting/kit';
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

/** Practice questions for insertion sort. Every answer comes from running the model. */
export function insertionPractice(def: () => ArrayDef): PracticeKind[] {
  return [
    {
      id: 'after-keys',
      title: 'The array after a few keys',
      make(rng) {
        const k = rng.int(2, 3);
        const values = distinct(rng, rng.int(5, 7));
        const setup = [load(values)];
        const after = valuesAt(milestones(stepsOf(def(), {}, [...setup, ['sort']]))[k - 1]!);
        return {
          prompt: `Insertion sort takes A[1], A[2], ... in turn and inserts each into the sorted part to its left. Type A after it has inserted A[1] through A[${k}].`,
          setup,
          answer: { kind: 'sequence', value: after },
          explain: `A[0..${k}] is now sorted: ${list(after.slice(0, k + 1))}. The rest, ${list(after.slice(k + 1))}, has not been touched yet.`,
          watch: [['sort']],
        };
      },
    },
    {
      id: 'shifts',
      title: 'How far does a key move?',
      make(rng) {
        const values = distinct(rng, rng.int(5, 7));
        const i = rng.int(2, values.length - 1);
        const setup = [load(values)];
        const ms = milestones(stepsOf(def(), {}, [...setup, ['sort']]));
        const shifts = counter(ms[i - 1]!, 'shifts') - counter(ms[i - 2]!, 'shifts');
        const key = values[i]!;
        return {
          prompt: `Insertion sort holds each key and shifts bigger values right to make room. When it gets to the key ${key} (A[${i}] in the picture), how many values shift right?`,
          setup,
          answer: { kind: 'number', value: shifts },
          explain: `By then A[0..${i - 1}] holds ${list(values.slice(0, i).sort((p, q) => p - q))}, sorted. ${shifts === 0 ? `None of them is bigger than ${key}, so nothing shifts` : `${shifts} of them ${shifts === 1 ? 'is' : 'are'} bigger than ${key}, and each shifts one place right`}.`,
          watch: [['sort']],
        };
      },
    },
    {
      id: 'comparisons',
      title: 'Nearly sorted input',
      make(rng) {
        const n = rng.int(6, 9);
        const values = nearlySorted(rng, n);
        const setup = [load(values)];
        const end = stepsOf(def(), {}, [...setup, ['sort']]).at(-1)!;
        const comparisons = counter(end, 'comparisons');
        const shifts = counter(end, 'shifts');
        return {
          prompt: `A is nearly sorted. How many comparisons does insertion sort make on it?`,
          setup,
          answer: { kind: 'number', value: comparisons },
          explain: `Each key is compared with the values to its left until it meets one that is not bigger. Most keys stop after one comparison. In all: ${comparisons} comparisons and ${shifts} ${shifts === 1 ? 'shift' : 'shifts'}, close to the best case of ${n - 1}.`,
          watch: [['sort']],
        };
      },
    },
    twinKind(def, {
      name: 'Insertion sort',
      why: (kept) =>
        kept
          ? 'A key stops as soon as it meets a value that is not bigger, so it never passes its twin. Insertion sort is stable.'
          : 'A shift moved one copy past the other.',
    }),
  ];
}
