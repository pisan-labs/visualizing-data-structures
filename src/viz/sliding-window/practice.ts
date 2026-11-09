import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { load, randomValues, type ArrayState } from '../_sorting/kit';
import { defaults, type WindowExtra, type WindowSettings } from './model';

type Def = VizDef<ArrayState, WindowSettings, WindowExtra>;

/** Small values, so sums stay easy to add in your head. */
const small = (rng: Rng, n: number) => randomValues(rng, n, 1, 9);

/**
 * Practice questions for the sliding window. Every answer comes from running the model.
 * `def` is a getter to avoid an import cycle.
 */
export function windowPractice(def: () => Def): PracticeKind[] {
  const run = (ops: OpCall[]) => new Timeline(def(), defaults, 1, ops);
  const last = (t: Timeline<ArrayState, WindowSettings, WindowExtra>) =>
    t.entries.at(-1)!.steps.at(-1)!.vars ?? {};

  return [
    {
      id: 'max-sum',
      title: 'Largest sum of k in a row',
      make(rng) {
        const vs = small(rng, rng.int(7, 10));
        const k = rng.int(2, 4);
        const best = Number(last(run([load(vs), ['fixed', k]])).result);
        return {
          prompt: `What is the largest sum of ${k} consecutive values in A?`,
          setup: [load(vs)],
          answer: { kind: 'number', value: best },
          explain: `Slide a window of ${k} across A, adding the value that enters and subtracting the one that leaves. The largest sum it sees is ${best}.`,
          watch: [['fixed', k]],
        };
      },
    },
    {
      id: 'shortest',
      title: 'Shortest window with a big enough sum',
      make(rng) {
        const vs = small(rng, rng.int(7, 10));
        const total = vs.reduce((a, b) => a + b, 0);
        const S = rng.int(8, Math.max(9, Math.floor(total / 2)));
        const best = Number(last(run([load(vs), ['atLeast', S]])).result);
        return {
          prompt: `How long is the shortest window of A whose sum is at least ${S}? Type 0 if there is none.`,
          setup: [load(vs)],
          answer: { kind: 'number', value: best },
          explain: best
            ? `Grow the window until its sum reaches ${S}, then shrink it from the left while it stays at least ${S}. The shortest window that works has ${best} values.`
            : `All of A sums to ${total}, less than ${S}, so no window works.`,
          watch: [['atLeast', S]],
        };
      },
    },
    {
      id: 'distinct',
      title: 'Longest stretch with no repeat',
      make(rng) {
        const vs = randomValues(rng, rng.int(8, 11), 1, rng.int(4, 7));
        const best = Number(last(run([load(vs), ['distinct']])).result);
        return {
          prompt: `How long is the longest window of A in which no value appears twice?`,
          setup: [load(vs)],
          answer: { kind: 'number', value: best },
          explain: `Grow the window on the right; when a value repeats, shrink from the left until it does not. The longest window without a repeat has ${best} values.`,
          watch: [['distinct']],
        };
      },
    },
    {
      id: 'leaves',
      title: 'How often does the left end move?',
      make(rng) {
        const vs = small(rng, rng.int(7, 10));
        const total = vs.reduce((a, b) => a + b, 0);
        const S = rng.int(6, Math.max(7, Math.floor(total / 3)));
        const leaves = Number(last(run([load(vs), ['atLeast', S]])).leaves);
        return {
          prompt: `Run \`shortest(A, ${S})\`. How many times does a value leave the window on the left?`,
          setup: [load(vs)],
          answer: { kind: 'number', value: leaves },
          explain: `A value leaves each time the window's sum is still at least ${S}: ${leaves} times. It can never be more than n = ${vs.length}, since each value leaves at most once.`,
          watch: [['atLeast', S]],
        };
      },
    },
  ];
}
