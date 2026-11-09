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

const DIRECTION = {
  down: 'This bubble sort works from the back (CLRS): each pass carries the smallest value left to the front.',
  up: 'This bubble sort works from the front: each pass carries the largest value right to the end.',
};

/** Practice questions for bubble sort. Every answer comes from running the model. */
export function bubblePractice(def: () => ArrayDef): PracticeKind[] {
  return [
    {
      id: 'first-pass',
      title: 'The array after one pass',
      make(rng) {
        const direction = rng.int(0, 1) ? 'down' : 'up';
        const settings = { direction };
        const values = distinct(rng, rng.int(5, 7));
        const setup = [load(values)];
        const after = valuesAt(milestones(stepsOf(def(), settings, [...setup, ['sort']]))[0]!);
        const moved = direction === 'down' ? Math.min(...values) : Math.max(...values);
        const dest = direction === 'down' ? 0 : values.length - 1;
        const travel =
          values[dest] === moved
            ? `stays in A[${dest}], where it started`
            : `rides all the way to A[${dest}]`;
        return {
          prompt: `${DIRECTION[direction]} Type A after the first pass.`,
          setup,
          settings,
          answer: { kind: 'sequence', value: after },
          explain: `After pass 1, A is ${list(after)}. Each swap moves the ${direction === 'down' ? 'smaller' : 'larger'} value of a pair one step ${direction === 'down' ? 'left' : 'right'}, so ${moved} ${travel}.`,
          watch: [['sort']],
        };
      },
    },
    {
      id: 'swaps',
      title: 'Swaps in the first pass',
      make(rng) {
        const values = distinct(rng, rng.int(5, 7));
        const setup = [load(values)];
        const pass = milestones(stepsOf(def(), {}, [...setup, ['sort']]))[0]!;
        const swaps = counter(pass, 'swaps');
        return {
          prompt: `${DIRECTION.down} How many swaps does the first pass make?`,
          setup,
          answer: { kind: 'number', value: swaps },
          explain: `The first pass compares ${values.length - 1} neighbor pairs, from the back. ${swaps === 0 ? 'None of them is out of order when it is compared' : `${swaps} of them ${swaps === 1 ? 'is' : 'are'} out of order when ${swaps === 1 ? 'it is' : 'they are'} compared`}, so it makes ${swaps} ${swaps === 1 ? 'swap' : 'swaps'}. It ends with ${list(valuesAt(pass))}.`,
          watch: [['sort']],
        };
      },
    },
    {
      id: 'passes',
      title: 'When does early exit stop?',
      make(rng) {
        const settings = { earlyExit: true };
        const n = rng.int(5, 7);
        const values = rng.int(0, 3) ? nearlySorted(rng, n) : distinct(rng, n);
        const setup = [load(values)];
        const ms = milestones(stepsOf(def(), settings, [...setup, ['sort']]));
        const passes = ms.filter((s) => typeof s.vars?.i === 'number').length;
        const stopped = ms.some((s) => s.lines.includes('exit'));
        return {
          prompt: `${DIRECTION.down} With early exit on, it stops after a pass that makes no swaps. How many passes does it make on A?`,
          setup,
          settings,
          answer: { kind: 'number', value: passes },
          explain: stopped
            ? `Pass ${passes} is the first one with no swaps, so A is sorted and it stops there: ${passes} of the ${n - 1} passes it would otherwise make.`
            : `Every pass swaps something, so it makes all ${n - 1} passes.`,
          watch: [['sort']],
        };
      },
    },
    twinKind(def, {
      name: 'Bubble sort',
      why: (kept) =>
        kept
          ? 'Bubble sort only swaps neighbors when the left one is bigger, so equal values never pass each other. It is stable.'
          : 'A swap moved one copy past the other.',
    }),
  ];
}
