import type { PracticeKind } from '../../engine/types';
import { ascending } from '../_sorting/kit';
import {
  distinct,
  list,
  load,
  ordered,
  stepsOf,
  twinKind,
  type ArrayDef,
} from '../_sorting/practice';

/** Practice questions for Timsort. Every answer comes from running the model. */
export function timPractice(def: () => ArrayDef): PracticeKind[] {
  return [
    {
      id: 'first-run',
      title: 'How long is the first run?',
      make(rng) {
        const up = rng.int(0, 1) === 1;
        const len = rng.int(2, 5);
        const head = ascending(distinct(rng, len));
        const tail = distinct(rng, rng.int(3, 5));
        const values = [...(up ? head : [...head].reverse()), ...tail];
        // Make sure the run ends where intended: the next value breaks the pattern.
        values[len] = up ? Math.max(0, head[len - 1]! - 1) : Math.min(99, head[0]! + 1);
        const setup = [load(values)];
        const steps = stepsOf(def(), {}, [...setup, ['sort']]);
        const first = steps.find((s) => s.lines.includes('count'))!;
        const n = Number((first.say.match(/(\d+) values?\./) ?? [])[1] ?? 1);
        const down = first.say.includes('strictly goes down');
        return {
          prompt:
            'Timsort starts by finding the natural run at A[0]: values that never go down, or that strictly go down. How many values are in it?',
          setup,
          answer: { kind: 'number', value: n },
          explain: `A[0..${n - 1}] ${down ? 'strictly goes down, so it is a run (Timsort reverses it)' : 'never goes down'}, and A[${n}] breaks the pattern. So ${n}.`,
          watch: [['sort']],
        };
      },
    },
    {
      id: 'stack',
      title: 'Merge or not?',
      make(rng) {
        const z = rng.int(2, 9);
        const y = rng.int(1, 8);
        const x = rng.int(1, 8);
        const zBad = z <= y + x;
        const yBad = y <= x;
        const right = zBad
          ? z < x
            ? 'Merge Z and Y'
            : 'Merge Y and X'
          : yBad
            ? 'Merge Y and X'
            : 'Nothing: the stack is in order';
        const options = ['Merge Y and X', 'Merge Z and Y', 'Nothing: the stack is in order'];
        return {
          prompt: `The top three runs on Timsort's stack have lengths |Z| = ${z}, |Y| = ${y} and |X| = ${x}, with X on top (and nothing below Z). What happens next?`,
          setup: [],
          answer: ordered(options, right),
          explain: zBad
            ? `|Z| = ${z} ≤ |Y| + |X| = ${y + x}, so Y merges with the shorter of X and Z: ${right.toLowerCase()}.`
            : yBad
              ? `|Z| > |Y| + |X|, but |Y| = ${y} ≤ |X| = ${x}, so Y and X merge.`
              : `|Z| = ${z} > ${y + x} = |Y| + |X| and |Y| > |X|: both rules hold, so nothing merges until the next run arrives.`,
        };
      },
    },
    twinKind(def, {
      name: 'Timsort',
      why: () =>
        'Timsort is stable: it reverses only runs that strictly go down, and a merge takes from the left run on ties.',
    }),
    {
      id: 'runs',
      title: 'Which runs does it push?',
      make(rng) {
        const values = distinct(rng, rng.int(8, 12));
        const minrun = 3;
        const settings = { minrun };
        const setup = [load(values)];
        const steps = stepsOf(def(), settings, [...setup, ['sort']]);
        const lens = steps
          .filter((s) => s.lines.includes('push'))
          .map((s) => String((s.say.match(/\((\d+)\) on the stack/) ?? [])[1]));
        return {
          prompt: `Timsort with minrun = 3 sorts A. Type the lengths of the runs it pushes, in order.`,
          setup,
          settings,
          answer: { kind: 'sequence', value: lens },
          explain: `Each natural run shorter than 3 is grown to 3 (or to the end of A): ${list(lens)}.`,
          watch: [['sort']],
        };
      },
    },
  ];
}
