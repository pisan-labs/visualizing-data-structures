import type { PracticeKind } from '../../engine/types';
import { ascending, span } from '../_sorting/kit';
import {
  distinct,
  list,
  load,
  milestones,
  stepsOf,
  twinKind,
  valuesAt,
  type ArrayDef,
} from '../_sorting/practice';

const LOMUTO = "Quicksort uses Lomuto's partition (CLRS) with the last value as the pivot.";

/** Practice questions for quicksort. Every answer comes from running the model. */
export function quickPractice(def: () => ArrayDef): PracticeKind[] {
  return [
    {
      id: 'pivot',
      title: 'Where does the pivot land?',
      make(rng) {
        const values = distinct(rng, rng.int(5, 8));
        const setup = [load(values)];
        const first = milestones(stepsOf(def(), {}, [...setup, ['sort']]))[0]!;
        const q = Number(first.vars?.q);
        const x = values.at(-1)!;
        const smaller = values.filter((v) => v < x).length;
        return {
          prompt: `${LOMUTO} The first partition runs on all of A. Which index does it return, where the pivot ${x} lands?`,
          setup,
          answer: { kind: 'number', value: q },
          explain: `${smaller === 0 ? `No value is smaller than ${x}` : `${smaller} ${smaller === 1 ? 'value is' : 'values are'} smaller than ${x}`}, and partition puts ${smaller === 1 ? 'it' : 'them'} to the left of the pivot. So the pivot lands in A[${q}], its final place.`,
          watch: [['sort']],
        };
      },
    },
    {
      id: 'after-partition',
      title: 'The array after the first partition',
      make(rng) {
        const values = distinct(rng, rng.int(5, 7));
        const setup = [load(values)];
        const first = milestones(stepsOf(def(), {}, [...setup, ['sort']]))[0]!;
        const after = valuesAt(first);
        const q = Number(first.vars?.q);
        return {
          prompt: `${LOMUTO} Type A after the first partition.`,
          setup,
          answer: { kind: 'sequence', value: after },
          explain:
            q === 0
              ? `No value is smaller than the pivot ${after[0]}, so it lands in A[0], and the others stay in the order the walk left them: ${list(after)}.`
              : `The values smaller than the pivot end up in ${span(0, q - 1)}, in the order the walk swaps them there, and the pivot ${after[q]} lands in A[${q}]: ${list(after)}.`,
          watch: [['sort']],
        };
      },
    },
    {
      id: 'depth',
      title: 'How deep do the calls go?',
      make(rng) {
        const n = rng.int(5, 8);
        const sorted = rng.int(0, 2) === 0;
        const values = sorted ? ascending(distinct(rng, n)) : distinct(rng, n);
        const setup = [load(values)];
        const depth = Number(stepsOf(def(), {}, [...setup, ['sort']]).at(-1)!.vars?.maxDepth);
        return {
          prompt: `${LOMUTO} The first call is at depth 0, as in the call stack above the array. How deep do the calls go?`,
          setup,
          answer: { kind: 'number', value: depth },
          explain: sorted
            ? `A is already sorted, so every pivot is the largest value in its range and peels off just one value. The calls go ${depth} levels deep, the worst case.`
            : `Each partition splits its range around the pivot, and the deepest chain of calls goes ${depth} levels down. Even splits keep it near log₂ n; lopsided ones make it deeper.`,
          watch: [['sort']],
        };
      },
    },
    twinKind(def, {
      name: "Quicksort (Lomuto's partition)",
      why: (kept) =>
        kept
          ? "Here the two copies kept their order, but partition's long swaps can jump a value over its twin. Quicksort is not stable."
          : "Partition's long swaps jumped one copy over the other. Quicksort is not stable.",
    }),
  ];
}
