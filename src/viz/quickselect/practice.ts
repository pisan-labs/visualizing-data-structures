import type { PracticeKind } from '../../engine/types';
import { span } from '../_sorting/kit';
import { distinct, load, ordered, stepsOf, type ArrayDef } from '../_sorting/practice';
import { rank } from './model';

/** The last value as pivot, so every question has one answer to work out by hand. */
const settings = { pivot: 'last' };
const HOW = "Quickselect uses Lomuto's partition with the last value as the pivot.";

/** Practice questions for quickselect. Every answer comes from running the model. */
export function selectPractice(def: () => ArrayDef): PracticeKind[] {
  /** Load the values and run select(k). Each partition ends with a step that has q. */
  const question = (k: number, values: number[]) => {
    const setup = [load(values)];
    const steps = stepsOf(def(), settings, [...setup, ['select', k]]);
    const partitions = steps.filter((s) => s.level === 1 && typeof s.vars?.q === 'number');
    return { setup, partitions };
  };

  return [
    {
      id: 'first-pivot',
      title: 'Where does the first pivot land?',
      make(rng) {
        const n = rng.int(5, 8);
        const k = rng.int(1, n);
        const values = distinct(rng, n);
        const { setup, partitions } = question(k, values);
        const q = Number(partitions[0]!.vars?.q);
        const x = values.at(-1)!;
        return {
          prompt: `${HOW} It runs \`select(${k})\`. Where does the first partition put the pivot ${x}? Type the index.`,
          setup,
          settings,
          answer: { kind: 'number', value: q },
          explain: `${q === 0 ? `No value is smaller than ${x}` : `${q} ${q === 1 ? 'value is' : 'values are'} smaller than ${x}`}, so the pivot lands in A[${q}], exactly as in quicksort.`,
          watch: [['select', k]],
        };
      },
    },
    {
      id: 'next-range',
      title: 'Which side does it keep?',
      make(rng) {
        const n = rng.int(6, 8);
        const k = rng.int(1, n);
        const values = distinct(rng, n);
        const { setup, partitions } = question(k, values);
        const first = partitions[0]!;
        const q = Number(first.vars?.q);
        const left = `Only ${span(0, q - 1)}, left of the pivot`;
        const right = `Only ${span(q + 1, n - 1)}, right of the pivot`;
        const hit = 'Neither: the pivot is the answer';
        const options = [...(q > 0 ? [left] : []), ...(q < n - 1 ? [right] : []), hit];
        const answer = first.lines.includes('hit')
          ? hit
          : first.lines.includes('goleft')
            ? left
            : right;
        return {
          prompt: `${HOW} It runs \`select(${k})\`, looking for the ${rank(k)} value, which belongs in A[${k - 1}]. The first partition puts the pivot in A[${q}]. What happens next?`,
          setup,
          settings,
          answer: ordered(options, answer),
          explain:
            answer === hit
              ? `The pivot landed in A[${k - 1}], the target slot itself, so it is the ${rank(k)} value and quickselect stops.`
              : `The target slot A[${k - 1}] is ${answer === left ? 'left' : 'right'} of the pivot, so the answer is on that side. The other side is never looked at again.`,
          watch: [['select', k]],
        };
      },
    },
    {
      id: 'partitions',
      title: 'How many partitions?',
      make(rng) {
        const n = rng.int(5, 7);
        const k = rng.int(1, n);
        const values = distinct(rng, n);
        const { setup, partitions } = question(k, values);
        const count = partitions.length;
        return {
          prompt: `${HOW} How many partitions does \`select(${k})\` run before it has the ${rank(k)} value?`,
          setup,
          settings,
          answer: { kind: 'number', value: count },
          explain: `Each partition puts one pivot in its final place and keeps only the side that holds A[${k - 1}], until a pivot lands there or one value is left. Here that takes ${count} ${count === 1 ? 'partition' : 'partitions'}.`,
          watch: [['select', k]],
        };
      },
    },
  ];
}
