import type { Rng } from '../../engine/rng';
import type { PracticeKind } from '../../engine/types';
import { ascending, nearlySorted } from '../_sorting/kit';
import { distinct, list, load, ordered, stepsOf, type ArrayDef } from '../_sorting/practice';

/** A value to look for: usually one that is there, sometimes one that is not. */
function target(rng: Rng, values: number[]): number {
  if (rng.int(0, 2)) return values[rng.int(0, values.length - 1)]!;
  return rng.int(1, 99);
}

/** Sorted values drawn from a few distinct ones, so there are repeats. */
function withRepeats(rng: Rng, n: number): number[] {
  const pool = distinct(rng, 4);
  return ascending(Array.from({ length: n }, () => pool[rng.int(0, 3)]!));
}

/** Practice questions for binary search. Every answer comes from running the model. */
export function binaryPractice(def: () => ArrayDef): PracticeKind[] {
  return [
    {
      id: 'probes',
      title: 'Where does it look?',
      make(rng) {
        const values = ascending(distinct(rng, rng.int(7, 12)));
        const x = target(rng, values);
        const setup = [load(values)];
        const steps = stepsOf(def(), {}, [...setup, ['search', x]]);
        const mids = steps.filter((s) => s.lines.includes('mid')).map((s) => String(s.vars?.mid));
        const result = Number(steps.at(-1)!.vars?.result);
        return {
          prompt: `Binary search runs \`search(${x})\` on the array shown. Type the indices of the values it compares with ${x}, in order.`,
          setup,
          answer: { kind: 'sequence', value: mids },
          explain: `Each probe looks at mid = floor((lo + hi) / 2) and keeps the half where ${x} could be: ${list(mids)}. ${result >= 0 ? `It finds ${x} at index ${result}.` : `Then the window is empty: ${x} is not there.`}`,
          watch: [['search', x]],
        };
      },
    },
    {
      id: 'bounds',
      title: 'Lower and upper bound',
      make(rng) {
        const variant = rng.int(0, 1) ? 'lower' : 'upper';
        const settings = { variant };
        const values = withRepeats(rng, rng.int(7, 10));
        const x = rng.int(0, 3) ? values[rng.int(0, values.length - 1)]! : rng.int(1, 99);
        const setup = [load(values)];
        const result = Number(
          stepsOf(def(), settings, [...setup, ['search', x]]).at(-1)!.vars?.result,
        );
        const rel = variant === 'lower' ? '≥' : '>';
        const name = variant === 'lower' ? 'lowerBound' : 'upperBound';
        return {
          prompt: `\`${name}(${x})\` returns the index of the first value ${rel} ${x}, or n if there is none. What does it return here?`,
          setup,
          settings,
          answer: { kind: 'number', value: result },
          explain:
            result < values.length
              ? `A[${result}] = ${values[result]} is the first value ${rel} ${x}${result > 0 ? `; A[${result - 1}] = ${values[result - 1]} is not` : ''}. So it returns ${result}.`
              : `No value is ${rel} ${x}, so it returns n = ${values.length}, one past the end.`,
          watch: [['search', x]],
        };
      },
    },
    {
      id: 'locate',
      title: 'Found, or where it would go',
      make(rng) {
        const settings = { variant: 'insert' };
        const values = ascending(distinct(rng, rng.int(6, 10)));
        const x = target(rng, values);
        const setup = [load(values)];
        const result = Number(
          stepsOf(def(), settings, [...setup, ['search', x]]).at(-1)!.vars?.result,
        );
        return {
          prompt: `\`locate(${x})\` returns an index of ${x}, or -(lo + 1) if ${x} is not there, where lo is the index it would go to. What does it return?`,
          setup,
          settings,
          answer: { kind: 'number', value: result },
          explain:
            result >= 0
              ? `${x} is at index ${result}, so it returns ${result}.`
              : `${x} is not there. It would go at index ${-result - 1}, so it returns -(${-result - 1} + 1) = ${result}.`,
          watch: [['search', x]],
        };
      },
    },
    {
      id: 'sorted',
      title: 'Can it search this?',
      make(rng) {
        const n = rng.int(6, 9);
        const values = rng.int(0, 1) ? ascending(distinct(rng, n)) : nearlySorted(rng, n);
        const x = values[rng.int(0, n - 1)]!;
        const setup = [load(values)];
        const end = stepsOf(def(), {}, [...setup, ['search', x]]).at(-1)!;
        const runs = typeof end.vars?.result === 'number';
        const yes = 'Yes, A is sorted';
        const no = 'No, A is not sorted';
        let i = 0;
        while (i + 1 < n && values[i]! <= values[i + 1]!) i++;
        return {
          prompt: `Binary search refuses to run on an unsorted array. Does \`search(${x})\` run on this A?`,
          setup,
          answer: ordered([yes, no], runs ? yes : no),
          explain: runs
            ? 'Every value is at least as big as the one before it, so A is sorted and the search runs.'
            : `A[${i}] = ${values[i]} comes before A[${i + 1}] = ${values[i + 1]}, which is smaller. One comparison can no longer rule out half of A, so the search refuses.`,
          watch: [['search', x]],
        };
      },
    },
  ];
}
