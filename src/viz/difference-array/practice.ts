import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { spotItKind, type SpotRow } from '../_patterns/kit';
import {
  defaults,
  fmt,
  updateText,
  type DExtra,
  type DSettings,
  type DState,
  type Update,
} from './model';

type Def = VizDef<DState, DSettings, DExtra>;

const load = (vs: number[]): OpCall => ['load', vs.join(' ')];
const addCall = (u: Update): OpCall => ['add', u.l, u.r, u.x];

/** q random updates on n values, x from −3 to 5 and never 0. */
function batch(rng: Rng, n: number, q: number): Update[] {
  return Array.from({ length: q }, () => {
    const l = rng.int(0, n - 1);
    const r = rng.int(l, n - 1);
    const x = rng.int(-3, 4);
    return { l, r, x: x === 0 ? 5 : x };
  });
}

/**
 * Our own problem statements, for "spot it": three that call for this pattern, and some that
 * look alike and call for another.
 */
export const SPOT_ROWS: SpotRow[] = [
  {
    problem:
      'A cinema takes group bookings: each one reserves k seats in every row from row l to row r. After all the bookings, how many seats are reserved in each row?',
    pattern: 'difference-array',
    cue: ['in every row from row l to row r', 'after all the bookings'],
    why: 'Many range additions, and the totals only at the end: +k at l and −k after r, then one running sum gives every row.',
    near: ['prefix-sum-hashmap', 'merge-intervals', 'kadane'],
    alsoFits: ['sweep-line'],
  },
  {
    problem:
      'Crews each add one coat of paint to the fence boards from l to r. How many coats does each board have when they are all done?',
    pattern: 'difference-array',
    cue: ['from l to r', 'when they are all done'],
    why: 'Each crew is a range addition of 1. Two writes per crew and one pass at the end, however long the stretches are.',
    near: ['prefix-sum-hashmap', 'merge-intervals'],
    alsoFits: ['sweep-line'],
  },
  {
    problem:
      'Visitors to a museum each arrive at minute a and leave at minute b. Given every visit, how many people are inside at each minute of the day?',
    pattern: 'difference-array',
    cue: ['arrive at minute a and leave at minute b', 'at each minute'],
    why: '+1 at the minute a visitor arrives and −1 at the minute they leave; the running sum over the minutes is the crowd.',
    near: ['prefix-sum-hashmap', 'merge-intervals', 'sliding-window'],
    alsoFits: ['sweep-line'],
  },
  {
    problem:
      'Meetings are given as start and end times. Combine the overlapping ones and list the busy times as few separate ranges as possible.',
    pattern: 'merge-intervals',
    cue: ['combine the overlapping ones', 'as few separate ranges as possible'],
    why: 'The answer is a list of ranges, not a count per moment: sort by start, then grow the current range or start a new one.',
    near: ['difference-array', 'prefix-sum-hashmap'],
    alsoFits: ['sweep-line'],
  },
  {
    problem:
      'A list of how much the river rose or fell each day. Count the stretches of consecutive days whose total change is exactly k.',
    pattern: 'prefix-sum-hashmap',
    cue: ['count the stretches', 'exactly k'],
    why: 'Nothing is added to the list; it asks about its stretches. A stretch totals k when two running sums differ by k, and a hash map of the running sums seen so far counts them.',
    near: ['difference-array', 'sliding-window'],
  },
  {
    problem:
      'A list of daily profits and losses. Which stretch of consecutive days earned the most?',
    pattern: 'kadane',
    cue: 'which stretch … earned the most',
    why: 'A best stretch, not a batch of updates: extend the run or restart it, and keep the best.',
    near: ['difference-array', 'prefix-sum-hashmap'],
  },
];

/**
 * Practice questions. Every answer comes from running the model. `def` is a getter to avoid an
 * import cycle.
 */
export function differencePractice(def: () => Def): PracticeKind[] {
  const run = (ops: OpCall[], settings: DSettings = defaults) =>
    new Timeline(def(), settings, 1, ops);

  return [
    {
      id: 'entry',
      title: 'A value after the updates',
      make(rng) {
        const n = rng.int(6, 8);
        const zeros = rng.int(0, 2) > 0;
        const start = zeros ? Array(n).fill(0) : Array.from({ length: n }, () => rng.int(0, 5));
        const us = batch(rng, n, rng.int(3, 4));
        const t = run([load(start), ...us.map(addCall), ['apply']]);
        const a = t.endState().a;
        // Mostly a value more than one update covers.
        const covered = (i: number) => us.filter((u) => u.l <= i && i <= u.r).length;
        const most = Math.max(...a.map((_, i) => covered(i)));
        const choices = a.map((_, i) => i).filter((i) => covered(i) >= Math.min(2, most));
        const i = choices[rng.int(0, choices.length - 1)]!;
        const hits = us.filter((u) => u.l <= i && i <= u.r);
        return {
          prompt: `The updates shown are applied to A. After all of them, what is A[${i}]?`,
          setup: [load(start), ...us.map(addCall)],
          answer: { kind: 'number', value: a[i]! },
          explain: hits.length
            ? `A[${i}] starts at ${fmt(start[i]!)}. ${hits.length === 1 ? 'One update covers' : `${hits.length} updates cover`} it: ${hits.map(updateText).join(', ')}. ${fmt(start[i]!)} ${hits.map((u) => (u.x < 0 ? `− ${-u.x}` : `+ ${u.x}`)).join(' ')} = ${fmt(a[i]!)}. With a difference array, that change is the running sum D[0] + … + D[${i}].`
            : `No update covers A[${i}], so it stays ${fmt(a[i]!)}.`,
          watch: [['apply']],
        };
      },
    },
    {
      id: 'diff',
      title: 'The difference array',
      make(rng) {
        const n = rng.int(5, 7);
        const us = batch(rng, n, rng.int(2, 3));
        const t = run([load(Array(n).fill(0)), ...us.map(addCall), ['apply']]);
        const d = t.entries.at(-1)!.steps.at(-1)!.extra!.d!;
        return {
          prompt: `Write the updates shown into a difference array D of ${n + 1} zeros (one more than A has values), before the final pass. What is D? Type all ${n + 1} entries, D[0] first.`,
          setup: [load(Array(n).fill(0)), ...us.map(addCall)],
          answer: { kind: 'sequence', value: d.map(String) },
          explain: `Each update adds x at D[l] and takes it away at D[r + 1]: ${us
            .map((u) => `${updateText(u)} writes ${fmt(u.x)} at D[${u.l}] and ${fmt(-u.x)} at D[${u.r + 1}]`)
            .join('; ')}. Where two land on the same cell they add up: D = ${d.map(fmt).join(', ')}.`,
          watch: [['apply']],
        };
      },
    },
    spotItKind({ page: 'difference-array', rows: SPOT_ROWS, watch: [['apply']] }),
  ];
}
