import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { spotItKind, type SpotRow } from '../_patterns/kit';
import {
  defaults,
  prefixSums,
  span,
  spans,
  START_K,
  type PSExtra,
  type PSSettings,
  type PSState,
} from './model';

type Def = VizDef<PSState, PSSettings, PSExtra>;

const load = (vs: number[]): OpCall => ['load', vs.join(' ')];

/** n small values, some negative. */
function values(rng: Rng, n: number): number[] {
  return Array.from({ length: n }, () => {
    const v = rng.int(-3, 5);
    return v === 0 ? 1 : v;
  });
}

/** The sum of a random subarray, so at least one subarray has it. */
function someSum(rng: Rng, vs: number[]): number {
  const i = rng.int(0, vs.length - 1);
  const j = rng.int(i, vs.length - 1);
  return vs.slice(i, j + 1).reduce((x, y) => x + y, 0);
}

/**
 * Our own problem statements, for "spot it": three that call for this pattern, and some that
 * look alike and call for another.
 */
export const SPOT_ROWS: SpotRow[] = [
  {
    problem:
      'A sensor logs how much the temperature changed each hour, up or down. In how many stretches of consecutive hours did it rise by exactly k in total?',
    pattern: 'prefix-sum-hashmap',
    cue: ['stretches of consecutive hours', 'exactly k', 'up or down'],
    why: 'A stretch’s total is the difference of two running sums, so count the earlier running sums equal to the current one minus k. Changes can be negative, so a sliding window will not do.',
    near: ['sliding-window', 'kadane', 'two-pointers'],
  },
  {
    problem:
      'A team’s season is a list of games, each a win or a loss. Find the longest run of consecutive games with as many wins as losses.',
    pattern: 'prefix-sum-hashmap',
    cue: ['longest run of consecutive games', 'as many wins as losses'],
    why: 'Count a win as +1 and a loss as −1: the run sums to 0, so its two ends have equal running sums. Keep where each running sum first appeared.',
    near: ['sliding-window', 'kadane', 'two-pointers'],
  },
  {
    problem:
      'Given a list of whole numbers, count the stretches of consecutive values whose total is a multiple of 5.',
    pattern: 'prefix-sum-hashmap',
    cue: ['stretches of consecutive values', 'a multiple of 5'],
    why: 'Two running sums with the same remainder mod 5 differ by a multiple of 5, so the map counts remainders instead of sums.',
    near: ['sliding-window', 'difference-array', 'kadane'],
  },
  {
    problem:
      'A list of prices, all positive. Find the longest stretch of consecutive items whose total stays within a budget b.',
    pattern: 'sliding-window',
    cue: ['all positive', 'stays within a budget'],
    why: 'With no negatives, growing a window only raises its total, so shrink it from the left whenever it goes over: one pass and no map.',
    near: ['prefix-sum-hashmap', 'kadane'],
    alsoFits: ['binary-search'],
  },
  {
    problem:
      'A shop’s daily profits and losses for a year. Which stretch of consecutive days made the most money?',
    pattern: 'kadane',
    cue: 'made the most money',
    why: 'The question asks for the best total, not a given one: carry the best sum of a stretch ending today, and start again when it drops below zero.',
    near: ['prefix-sum-hashmap', 'sliding-window'],
  },
  {
    problem:
      'Each of many bookings adds x guests to every night from night l to night r. After all of them, how many guests are there each night?',
    pattern: 'difference-array',
    cue: ['adds x', 'every night from night l to night r', 'after all of them'],
    why: 'Write +x at l and −x at r + 1, then one running sum gives every night: prefix sums run the other way.',
    near: ['prefix-sum-hashmap', 'sweep-line'],
  },
  {
    problem: 'In a sorted list of numbers, find two values that add up to exactly k.',
    pattern: 'two-pointers',
    cue: ['sorted', 'two values'],
    why: 'Two values, not a stretch. Sorted means one index at each end can move inward, ruling out a whole row of pairs at each step.',
    near: ['prefix-sum-hashmap', 'sliding-window'],
    alsoFits: ['binary-search'],
  },
];

/**
 * Practice questions. Every answer comes from running the model. `def` is a getter to avoid an
 * import cycle.
 */
export function prefixPractice(def: () => Def): PracticeKind[] {
  const run = (ops: OpCall[], settings: PSSettings = defaults) =>
    new Timeline(def(), settings, 1, ops);

  return [
    {
      id: 'count',
      title: 'How many subarrays sum to k?',
      make(rng) {
        const vs = values(rng, rng.int(6, 8));
        const k = someSum(rng, vs);
        const t = run([load(vs), ['find', k]]);
        const last = t.entries.at(-1)!.steps.at(-1)!;
        const count = Number(last.vars?.count);
        const found = last.extra?.found ?? [];
        return {
          prompt: `How many subarrays of A (stretches of one or more values in a row) sum to k = ${k}?`,
          setup: [load(vs)],
          answer: { kind: 'number', value: count },
          explain: `Keep a running sum, and at each value add seen[sum − ${k}]: the earlier running sums that are ${k} less. ${count === 1 ? 'One subarray sums' : `${count} subarrays sum`} to ${k}: ${spans(found, 6)}.`,
          watch: [['find', k]],
        };
      },
    },
    {
      id: 'map-after',
      title: 'What does the map hold?',
      make(rng) {
        // Repeats of small values make running sums come back, so counts above 1 are common.
        const vs = Array.from(
          { length: rng.int(6, 8) },
          () => [1, -1, 2, -2, 1, 3][rng.int(0, 5)]!,
        );
        const k = someSum(rng, vs);
        const i = rng.int(3, vs.length);
        const t = run([load(vs), ['find', k]]);
        const record = t.entries
          .at(-1)!
          .steps.find((s) => s.lines.includes('record') && s.vars?.j === i)!;
        const map = record.extra!.map!;
        const top = Math.max(...map.map((m) => m.value));
        const pick = rng.int(0, 1)
          ? map.find((m) => m.value === top)!
          : map[rng.int(0, map.length - 1)]!;
        const sums = prefixSums(vs).slice(0, i + 1);
        return {
          prompt: `Run the pattern with k = ${k}. After the first ${i} values have been added (and their running sums recorded), what is seen[${pick.key}]?`,
          setup: [load(vs)],
          answer: { kind: 'number', value: pick.value },
          explain: `After ${i} values the running sums are ${sums.join(', ')}, the empty prefix’s 0 first. ${pick.key} is among them ${pick.value === 1 ? 'once' : `${pick.value} times`}, so seen[${pick.key}] = ${pick.value}. k plays no part in what is recorded, only in what is looked up.`,
          watch: [['find', k]],
        };
      },
    },
    {
      id: 'longest',
      title: 'The longest subarray with sum k',
      make(rng) {
        const settings: PSSettings = { ...defaults, goal: 'longest' };
        const vs = values(rng, rng.int(6, 8));
        const k = rng.int(0, 3) ? someSum(rng, vs) : rng.int(-2, 6);
        const t = run([load(vs), ['find', k]], settings);
        const last = t.entries.at(-1)!.steps.at(-1)!;
        const best = Number(last.vars?.best);
        const at = last.extra?.best;
        return {
          prompt: `How long is the longest subarray of A whose sum is k = ${k}? Type 0 if none sums to ${k}.`,
          setup: [load(vs)],
          settings,
          answer: { kind: 'number', value: best },
          explain: at
            ? `Keep where each running sum first appeared. The longest subarray with sum ${k} is ${span(at)}: from the first time the running sum was ${prefixSums(vs)[at.lo]} to the time it was ${prefixSums(vs)[at.hi + 1]}, ${best} values.`
            : `No two running sums differ by exactly ${k}, so no subarray sums to ${k}.`,
          watch: [['find', k]],
        };
      },
    },
    spotItKind({ page: 'prefix-sum-hashmap', rows: SPOT_ROWS, watch: [['find', START_K]] }),
  ];
}
