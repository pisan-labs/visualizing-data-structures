import type { Rng } from '../../engine/rng';
import type { PracticeKind } from '../../engine/types';
import { counter, distinct, load, stepsOf, type ArrayDef } from '../_sorting/practice';

/** A value to look for: usually one that is there, sometimes one that is not. */
function target(rng: Rng, values: number[]): number {
  if (rng.int(0, 2)) return values[rng.int(0, values.length - 1)]!;
  let x = rng.int(1, 99);
  while (values.includes(x)) x = rng.int(1, 99);
  return x;
}

/** Practice questions for linear search. Every answer comes from running the model. */
export function linearPractice(def: () => ArrayDef): PracticeKind[] {
  return [
    {
      id: 'returns',
      title: 'What does search return?',
      make(rng) {
        // Repeats, so "the first one" matters.
        const pool = distinct(rng, 3);
        const values = Array.from({ length: rng.int(6, 8) }, () => pool[rng.int(0, 2)]!);
        const x = rng.int(0, 3) ? pool[rng.int(0, 2)]! : target(rng, pool);
        const setup = [load(values)];
        const result = Number(stepsOf(def(), {}, [...setup, ['search', x]]).at(-1)!.vars?.result);
        return {
          prompt: `What does \`search(${x})\` return on the array shown?`,
          setup,
          answer: { kind: 'number', value: result },
          explain:
            result >= 0
              ? `The search stops at the first ${x} it meets, A[${result}], and returns ${result}. Any later ${x}s are never looked at.`
              : `${x} is not in A, so the search looks at every value and returns -1.`,
          watch: [['search', x]],
        };
      },
    },
    {
      id: 'comparisons',
      title: 'How many comparisons?',
      make(rng) {
        const values = distinct(rng, rng.int(6, 10));
        const x = target(rng, values);
        const setup = [load(values)];
        const end = stepsOf(def(), {}, [...setup, ['search', x]]).at(-1)!;
        const comparisons = counter(end, 'comparisons');
        const result = Number(end.vars?.result);
        return {
          prompt: `How many times does \`search(${x})\` compare a value with ${x}?`,
          setup,
          answer: { kind: 'number', value: comparisons },
          explain:
            result >= 0
              ? `${x} is in A[${result}], so the search compares A[0] through A[${result}]: ${comparisons} ${comparisons === 1 ? 'comparison' : 'comparisons'}.`
              : `${x} is not there, and the only way to know is to compare it with all ${values.length} values.`,
          watch: [['search', x]],
        };
      },
    },
    {
      id: 'index-checks',
      title: 'How many index checks?',
      make(rng) {
        const sentinel = rng.int(0, 1) === 1;
        const settings = { sentinel };
        const values = distinct(rng, rng.int(5, 8));
        const x = target(rng, values);
        const setup = [load(values)];
        const end = stepsOf(def(), settings, [...setup, ['search', x]]).at(-1)!;
        const checks = counter(end, 'indexChecks');
        const result = Number(end.vars?.result);
        return {
          prompt: sentinel
            ? `This search puts x in a spare slot past the end first (a sentinel). How many times does \`search(${x})\` check i < n?`
            : `The loop checks i < n before each comparison. How many times does \`search(${x})\` check i < n?`,
          setup,
          settings,
          answer: { kind: 'number', value: checks },
          explain: sentinel
            ? `With the sentinel the loop is sure to stop, so it never checks i < n while it runs. It checks once at the end, to tell a real match from the sentinel: 1.`
            : result >= 0
              ? `${x} is in A[${result}]. The loop checks i < n for i = 0 through ${result}: ${checks} ${checks === 1 ? 'check' : 'checks'}.`
              : `${x} is not there. The loop checks i < n for i = 0 through ${values.length}, and the last check, ${values.length} < ${values.length}, ends it: ${checks} checks.`,
          watch: [['search', x]],
        };
      },
    },
  ];
}
