import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { spotItKind, type SpotRow } from '../_patterns/kit';
import {
  defaults,
  fits,
  plan,
  plural,
  range,
  spreads,
  START_D,
  type BAExtra,
  type BASettings,
  type BAState,
  type Problem,
} from './model';

type Def = VizDef<BAState, BASettings, BAExtra>;

const load = (vs: number[]): OpCall => ['load', vs.join(' ')];

/** A small puzzle of either kind: the values, and d or k. */
function puzzle(rng: Rng, problem: Problem): { values: number[]; param: number } {
  const n = rng.int(5, 7);
  if (problem === 'ship') {
    const values = Array.from({ length: n }, () => rng.int(1, 9));
    return { values, param: rng.int(2, 3) };
  }
  const set = new Set<number>();
  while (set.size < n) set.add(rng.int(0, 30));
  const values = [...set].sort((a, b) => a - b);
  return { values, param: rng.int(3, 4) };
}

const stateOf = (problem: Problem, values: number[]): BAState =>
  problem === 'ship' ? { w: values, p: [0, 1] } : { w: [1, 1], p: values };

/** "22 fits, 15 fails". */
const triesText = (tries: { x: number; run: { ok: boolean } }[]) =>
  tries.map((t) => `${t.x} ${t.run.ok ? 'fits' : 'fails'}`).join(', ');

const ask = (problem: Problem, param: number) =>
  problem === 'ship'
    ? `the smallest capacity that ships these packages, in order, in d = ${param} days`
    : `the largest gap that k = ${param} items can keep on these positions`;

/** Our own problem statements, for "spot it". */
export const SPOT_ROWS: SpotRow[] = [
  {
    problem:
      'A printer must print n chapters in order, each a known number of pages, and finish within d days. What is the smallest number of pages a day that is enough?',
    pattern: 'binary-search-answer',
    cue: ['smallest number of pages a day', 'within d days', 'in order'],
    why: 'If p pages a day is enough, any larger p is too, and checking one p is a single greedy pass over the chapters. So binary search over p, not over the chapters.',
    near: ['binary-search', 'sliding-window', 'prefix-sum-hashmap'],
  },
  {
    problem:
      'A road has n marked posts. Put k sensors on k of them so that the two closest sensors are as far apart as possible.',
    pattern: 'binary-search-answer',
    cue: ['as far apart as possible', 'the two closest'],
    why: 'It maximizes a minimum. If every gap can be at least g, it can be at least anything smaller, and a greedy pass checks one g.',
    near: ['two-pointers', 'sweep-line', 'merge-intervals'],
  },
  {
    problem:
      'Cut n boards into pieces of one length L; a board of length b gives b / L pieces, rounded down. What is the longest L that gives at least m pieces?',
    pattern: 'binary-search-answer',
    cue: ['the longest L', 'at least m pieces'],
    why: 'A shorter L never gives fewer pieces, so “at least m pieces” flips once as L grows. Count the pieces for one L in a pass, and binary search L.',
    near: ['binary-search', 'dp-grid-paths', 'top-k'],
  },
  {
    problem:
      'Each of n machines makes one part every t minutes, its own t. Working together, what is the least time in which they make m parts?',
    pattern: 'binary-search-answer',
    cue: ['the least time', 'make m parts'],
    why: 'In T minutes a machine makes T / t parts, rounded down; more time never makes fewer. Add them up for one T, and binary search T.',
    near: ['two-heaps-median', 'k-way-merge', 'top-k'],
  },
  {
    problem: 'In a sorted list of numbers, find the first value that is at least x.',
    pattern: 'binary-search',
    cue: ['sorted list', 'the first value that is at least x'],
    why: 'The list itself is sorted, so search its indices: a lower bound. There is no answer range to build and no check to run.',
    near: ['binary-search-answer', 'two-pointers'],
  },
  {
    problem:
      'Daily rainfall, never negative. Find the longest stretch of consecutive days whose total stays within b.',
    pattern: 'sliding-window',
    cue: ['longest stretch of consecutive days', 'never negative', 'stays within b'],
    why: 'Grow a window on the right and shrink it from the left while it is over b: one pass. Binary search on the length also works, with a log n factor more.',
    near: ['prefix-sum-hashmap', 'kadane'],
    alsoFits: ['binary-search-answer'],
  },
  {
    problem: 'A sorted list of prices. Is there a pair that adds up to exactly x?',
    pattern: 'two-pointers',
    cue: ['sorted', 'a pair', 'exactly x'],
    why: 'Two values, not a smallest or largest answer to search for. Start one index at each end and move the one that brings the sum closer to x.',
    near: ['binary-search-answer', 'sliding-window'],
    alsoFits: ['binary-search'],
  },
];

/** Practice questions. Every answer comes from running the model. */
export function searchAnswerPractice(def: () => Def): PracticeKind[] {
  const run = (problem: Problem, values: number[], param: number) =>
    new Timeline(def(), { ...defaults, problem }, 1, [load(values), ['search', param]]);
  const pick = (rng: Rng): Problem => (rng.int(0, 1) ? 'spread' : 'ship');

  return [
    {
      id: 'next-mid',
      title: 'The next mid',
      make(rng) {
        // A puzzle whose search takes at least two checks.
        let problem = pick(rng);
        let { values, param } = puzzle(rng, problem);
        let p = plan(stateOf(problem, values), problem, param, 'pattern');
        while (p.tries.length < 2) {
          problem = pick(rng);
          ({ values, param } = puzzle(rng, problem));
          p = plan(stateOf(problem, values), problem, param, 'pattern');
        }
        const t = rng.int(1, p.tries.length - 1);
        const next = p.tries[t]!;
        const { lo0, hi0 } = range(stateOf(problem, values), problem);
        const ship = problem === 'ship';
        const steps = run(problem, values, param).entries[1]!.steps;
        const mids = steps.filter((s) => s.lines.includes('mid')).map((s) => Number(s.vars?.mid));
        return {
          prompt: `Binary search on the answer looks for ${ask(problem, param)}. It starts with lo = ${lo0} and hi = ${hi0}. The checks so far: ${triesText(p.tries.slice(0, t))}. What is the next mid?`,
          setup: [load(values)],
          settings: { ...defaults, problem },
          answer: { kind: 'number', value: mids[t]! },
          explain: `After those checks lo = ${next.lo} and hi = ${next.hi}, so mid = (${next.lo} + ${next.hi}${ship ? '' : ' + 1'}) / 2 = ${next.x}, rounded down.${ship ? '' : ' The + 1 rounds up, so lo = mid always moves.'}`,
          watch: [['search', param]],
        };
      },
    },
    {
      id: 'answer',
      title: 'The answer',
      make(rng) {
        const problem = pick(rng);
        const { values, param } = puzzle(rng, problem);
        const t = run(problem, values, param);
        const last = t.entries[1]!.steps.at(-1)!;
        const answer = Number(last.vars?.answer);
        const ship = problem === 'ship';
        const s = stateOf(problem, values);
        const below = ship ? fits(values, param, answer - 1) : spreads(values, param, answer + 1);
        return {
          prompt: `What is ${ask(problem, param)}?`,
          setup: [load(values)],
          settings: { ...defaults, problem },
          answer: { kind: 'number', value: answer },
          explain: ship
            ? `Capacity ${answer} ships them in ${plural(fits(values, values.length, answer).count, 'day')}${answer > Math.max(...s.w) ? `, and ${answer - 1} needs more than ${param} days` : ', and nothing smaller carries the heaviest package'}. So ${answer} is the smallest.`
            : `With gaps of at least ${answer}, all ${param} items fit${answer < values[values.length - 1]! - values[0]! ? `; with ${answer + 1}, only ${plural(below.count, 'item')} ${below.count === 1 ? 'fits' : 'fit'}` : ', and no gap is wider than the whole span'}. So ${answer} is the largest.`,
          watch: [['search', param]],
        };
      },
    },
    {
      id: 'check',
      title: 'One check',
      make(rng) {
        const problem = pick(rng);
        const { values } = puzzle(rng, problem);
        const ship = problem === 'ship';
        const { lo0, hi0 } = range(stateOf(problem, values), problem);
        const x = rng.int(lo0, Math.max(lo0, Math.min(hi0, ship ? lo0 + 8 : 12)));
        // Run the check to the end, with no limit on days or items.
        const full = ship ? fits(values, values.length, x) : spreads(values, values.length + 1, x);
        const param = ship ? START_D : Math.min(values.length, 3);
        const parts = ship
          ? groups(
              values,
              full.reads.map((r) => r.tag),
            )
          : full.reads.filter((r) => r.event).map((r) => String(values[r.i]));
        return {
          prompt: ship
            ? `Load these packages greedily, in order, with capacity c = ${x}: each day takes packages until the next one would go over ${x}. How many days does it take?`
            : `Place items greedily with gaps of at least g = ${x}: the first on the first position, each next one on the first position at least ${x} past the last. How many items fit?`,
          setup: [load(values)],
          settings: { ...defaults, problem },
          answer: { kind: 'number', value: full.count },
          explain: ship
            ? `The days are ${parts.join(', ')}: ${plural(full.count, 'day')}. Binary search on the answer runs exactly this check at every mid.`
            : `Items go on ${parts.join(', ')}: ${plural(full.count, 'item')}. Binary search on the answer runs exactly this check at every mid.`,
          watch: [['search', param]],
        };
      },
    },
    spotItKind({
      page: 'binary-search-answer',
      rows: SPOT_ROWS,
      watch: [['search', START_D]],
    }),
  ];
}

/** "[4, 7] [2, 6]": the packages of each day. */
function groups(values: number[], days: number[]): string[] {
  const out: number[][] = [];
  days.forEach((d, i) => {
    (out[d - 1] ??= []).push(values[i]!);
  });
  return out.map((g) => `[${g.join(', ')}]`);
}
