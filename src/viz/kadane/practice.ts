import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { spotItKind, type SpotRow } from '../_patterns/kit';
import { defaults, fmt, span, type KExtra, type KSettings, type KState } from './model';

type Def = VizDef<KState, KSettings, KExtra>;

const load = (vs: number[]): OpCall => ['load', vs.join(' ')];

/** n small values, a few more positive than negative, never all positive. */
function values(rng: Rng, n: number): number[] {
  const vs = Array.from({ length: n }, () => {
    const v = rng.int(-6, 7);
    return v === 0 ? -1 : v;
  });
  if (vs.every((v) => v > 0)) vs[rng.int(0, n - 1)] = -rng.int(3, 6);
  return vs;
}

/**
 * Our own problem statements, for "spot it": four that call for this pattern, and some that
 * look alike and call for another.
 */
export const SPOT_ROWS: SpotRow[] = [
  {
    problem:
      'A hiker logs how much each kilometre of a trail climbs or drops. Which stretch of consecutive kilometres climbs the most in total?',
    pattern: 'kadane',
    cue: ['stretch of consecutive kilometres', 'climbs the most'],
    why: 'The largest total of a stretch, with no target given: carry the best total of a stretch ending here, and start again when it goes negative.',
    near: ['prefix-sum-hashmap', 'sliding-window', 'two-pointers'],
  },
  {
    problem:
      'Each song on a playlist has a score from −5 to 5. Choose one block of songs in a row with the highest total score.',
    pattern: 'kadane',
    cue: ['one block of songs in a row', 'highest total'],
    why: 'A block in a row is a subarray, and the highest total is the maximum subarray. Scores can be negative, so a block is worth extending only while its total stays at least 0.',
    near: ['sliding-window', 'prefix-sum-hashmap', 'top-k'],
  },
  {
    problem:
      'A game awards points or penalties each round. What is the best total over any run of consecutive rounds? If every round is a penalty, the answer is the smallest penalty.',
    pattern: 'kadane',
    cue: ['best total', 'any run of consecutive rounds', 'every round is a penalty'],
    why: 'The best total of a run of rounds is the maximum subarray. "Every round a penalty" tells you the run has at least one value: best starts at −∞, not 0.',
    near: ['prefix-sum-hashmap', 'sliding-window'],
  },
  {
    problem:
      'A list of whole numbers, some negative. Find the largest product of a stretch of consecutive values.',
    pattern: 'kadane',
    cue: ['largest product', 'stretch of consecutive values'],
    why: 'The same extend-or-restart pass, keeping both the largest and the smallest product ending here: a negative value swaps them.',
    near: ['prefix-sum-hashmap', 'sliding-window', 'two-pointers'],
  },
  {
    problem:
      'A list of daily gains and losses. On how many stretches of consecutive days is the total exactly 10?',
    pattern: 'prefix-sum-hashmap',
    cue: ['how many stretches', 'exactly 10'],
    why: 'An exact target, counted: a stretch totals 10 when two running sums differ by 10. Count the earlier running sums with a hash map.',
    near: ['kadane', 'sliding-window'],
  },
  {
    problem:
      'A café’s takings for each day of the year, all positive. Which 7 consecutive days took the most?',
    pattern: 'sliding-window',
    cue: ['7 consecutive days', 'all positive'],
    why: 'The stretch has a fixed length, so slide a window of 7: add the day that comes in, drop the one that leaves.',
    near: ['kadane', 'prefix-sum-hashmap'],
  },
  {
    problem:
      'Each of many crews adds one coat of paint to fence boards l to r. How many coats does each board end up with?',
    pattern: 'difference-array',
    cue: ['adds one coat to boards l to r', 'end up with'],
    why: 'Many range additions and one look at the end: +1 at l and −1 after r, then one running sum.',
    near: ['kadane', 'prefix-sum-hashmap'],
    alsoFits: ['sweep-line'],
  },
];

/**
 * Practice questions. Every answer comes from running the model. `def` is a getter to avoid an
 * import cycle.
 */
export function kadanePractice(def: () => Def): PracticeKind[] {
  const run = (ops: OpCall[], settings: KSettings = defaults) =>
    new Timeline(def(), settings, 1, ops);
  const result = (vs: number[], settings: KSettings = defaults) => {
    const t = run([load(vs), ['find']], settings);
    return t.entries.at(-1)!.steps.at(-1)!;
  };

  return [
    {
      id: 'best',
      title: 'The largest sum',
      make(rng) {
        const negative = rng.int(0, 4) === 0;
        const n = rng.int(6, 9);
        const vs = negative
          ? Array.from({ length: n }, () => -rng.int(1, 9))
          : values(rng, n);
        const last = result(vs);
        const b = last.extra!.best!;
        return {
          prompt:
            'What is the largest sum of a subarray of A (one or more values in a row)?',
          setup: [load(vs)],
          answer: { kind: 'number', value: b.sum },
          explain: negative
            ? `Every value is negative, so every longer subarray is worse than its best value alone: the answer is the largest value, ${span(b)} = ${fmt(b.sum)}. A best that starts at 0 would say 0, the empty subarray, which is not allowed here.`
            : `Keep the best sum of a subarray ending at each value, restarting whenever it goes negative. The best of those is ${span(b)}, with sum ${fmt(b.sum)}.`,
          watch: [['find']],
        };
      },
    },
    {
      id: 'restarts',
      title: 'Where does a run start?',
      make(rng) {
        const vs = values(rng, rng.int(7, 9));
        const last = result(vs);
        const starts = last.extra!.starts!;
        const runs = last.extra!.run!;
        const why = starts
          .slice(1)
          .map((s) => `${fmt(runs[s - 1]!)} before A[${s}]`)
          .join(', ');
        return {
          prompt:
            'The pass starts its first run at A[0], and restarts at A[j] whenever the run so far is negative. At which indices does a run start? Type them in order, 0 first.',
          setup: [load(vs)],
          answer: { kind: 'sequence', value: starts.map(String) },
          explain: starts.length > 1
            ? `Runs start at ${starts.join(', ')}. The run just before each restart is negative: ${why}. A run at exactly 0 keeps going.`
            : 'Only at 0: the run never goes negative, so it never restarts.',
          watch: [['find']],
        };
      },
    },
    {
      id: 'which',
      title: 'Which subarray?',
      make(rng) {
        // A unique best, so the question has one answer without the tie rule.
        let vs = values(rng, rng.int(6, 9));
        for (let tries = 0; tries < 50 && ties(vs); tries++) vs = values(rng, vs.length);
        const last = result(vs);
        const b = last.extra!.best!;
        return {
          prompt:
            'Which subarray of A has the largest sum? Type the index of its first value and of its last value, such as 2 5.',
          setup: [load(vs)],
          answer: { kind: 'sequence', value: [String(b.lo), String(b.hi)] },
          explain: `The pass reaches its best sum, ${fmt(b.sum)}, at A[${b.hi}], and the run it was on started at A[${b.lo}]: ${span(b)}. Keep the run's start, not just its sum, and the pass hands back the subarray too.`,
          watch: [['find']],
        };
      },
    },
    spotItKind({ page: 'kadane', rows: SPOT_ROWS, watch: [['find']] }),
  ];
}

/** Do two different subarrays share the largest sum? */
function ties(vs: number[]): boolean {
  let best = -Infinity;
  let count = 0;
  for (let i = 0; i < vs.length; i++) {
    let s = 0;
    for (let j = i; j < vs.length; j++) {
      s += vs[j]!;
      if (s > best) {
        best = s;
        count = 1;
      } else if (s === best) count++;
    }
  }
  return count > 1;
}
