import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { spotItKind, type SpotRow } from '../_patterns/kit';
import {
  at,
  candidate,
  choicesFor,
  defaults,
  sides,
  solveTable,
  type IVExtra,
  type IVSettings,
  type IVState,
  type Problem,
} from './model';

type Def = VizDef<IVState, IVSettings, IVExtra>;

const row = (rng: Rng, n: number) => Array.from({ length: n }, () => rng.int(1, 6));

/** The candidates of stretch [a..b] (0-based) in a solved table. */
function candidates(v: number[], p: Problem, a: number, b: number): number[] {
  const { best } = solveTable(v, p);
  const get = (x: number, y: number) => (x > y ? 0 : best[x]![y]!);
  return choicesFor(p, a, b).map((k) => {
    const [l, r] = sides(p, a, b, k);
    return candidate(p, v, a, b, k, get(l.a, l.b), get(r.a, r.b));
  });
}

const rulesText = (p: Problem) =>
  p === 'merge'
    ? 'Merging two neighbouring piles costs their total size.'
    : 'Taking a tile scores its number times the numbers beside it at that moment (the ends of the row count as 1), and the row closes up.';

/**
 * Our own problem statements, for "spot it": three that call for this pattern, and some that
 * look alike and call for another.
 */
export const SPOT_ROWS: SpotRow[] = [
  {
    problem:
      'A sawmill charges for each cut by the length of the board it saws through. A plank is marked for cutting at several points. In which order should the cuts go to pay the least?',
    pattern: 'dp-interval',
    cue: ['in which order', 'by the length of the board it saws through'],
    why: 'The cost of a cut depends on what is left around it, so solve every stretch between two marks by the cut made first in it (or, the same thing, the merge done last): shorter stretches first.',
    near: ['merge-intervals', 'binary-search-answer', 'two-pointers'],
  },
  {
    problem:
      'Villages along a river join into towns two neighbours at a time, and joining two costs their total population. What is the least total cost to end with one town?',
    pattern: 'dp-interval',
    cue: ['two neighbours at a time', 'least total cost'],
    why: 'The last join splits the row in two, and each side was joined on its own: solve every stretch by where its last join splits it.',
    near: ['merge-intervals', 'top-k', 'sliding-window'],
  },
  {
    problem:
      'A row of matrices of different shapes must be multiplied in order. Where should the brackets go to do the fewest multiplications?',
    pattern: 'dp-interval',
    cue: ['where should the brackets go'],
    why: 'Brackets are a last multiplication splitting the row into two stretches, each bracketed on its own: the classic DP over intervals.',
    near: ['merge-intervals', 'two-pointers', 'combination-sum'],
  },
  {
    problem:
      'A calendar lists meetings as start and end times. Combine the meetings that overlap into single blocks.',
    pattern: 'merge-intervals',
    cue: ['overlap', 'combine'],
    why: 'These intervals are times, not stretches of a row to solve: sort by start, then extend the current block or start a new one.',
    near: ['dp-interval', 'sweep-line'],
  },
  {
    problem:
      'Split a row of book lengths among k shelves, in order, so that the longest shelf is as short as possible.',
    pattern: 'binary-search-answer',
    cue: ['as short as possible', 'k shelves'],
    why: 'Guess the longest shelf and check in one pass whether k shelves are enough; a bigger guess is never worse, so binary search the guess.',
    near: ['dp-interval', 'sliding-window', 'two-pointers'],
  },
  {
    problem:
      'Cards lie face up in a row. Two players take turns, each taking one card from either end. How many more points can the first player collect than the second, if both play their best?',
    pattern: 'dp-interval',
    cue: ['from either end'],
    why: 'Whatever has been taken, what is left is a stretch of the row, so the best for each stretch comes from the two stretches one card shorter.',
    near: ['two-pointers', 'sliding-window', 'backtracking'],
  },
  {
    problem:
      'A list of daily gains and losses. Which stretch of consecutive days has the largest total?',
    pattern: 'kadane',
    cue: ['the largest total', 'consecutive days'],
    why: 'A stretch, but nothing is ordered, merged or taken away: one pass that extends the best run ending today or starts again.',
    near: ['dp-interval', 'sliding-window', 'prefix-sum-hashmap'],
  },
];

/**
 * Practice questions. Every answer comes from running the model. `def` is a getter to avoid an
 * import cycle.
 */
export function ivPractice(def: () => Def): PracticeKind[] {
  const run = (ops: OpCall[], settings: IVSettings) => new Timeline(def(), settings, 1, ops);

  return [
    {
      id: 'cell',
      title: 'A stretch’s value',
      make(rng) {
        const p: Problem = rng.int(0, 1) ? 'merge' : 'remove';
        const settings: IVSettings = { ...defaults, problem: p };
        const v = row(rng, 4);
        const setup: OpCall[] = [['load', v.join(' ')]];
        const state = run([...setup, ['solve']], settings).endState();
        const len = rng.int(2, 3);
        const a = rng.int(0, 4 - len);
        const b = a + len - 1;
        const value = state.best[a]![b]!;
        const k = state.K[a]![b]!;
        const cs = candidates(v, p, a, b);
        const T = p === 'merge' ? 'M' : 'B';
        return {
          prompt: `Row: ${v.join(', ')}. ${rulesText(p)} ${
            p === 'merge'
              ? `What is the least cost to merge piles ${a + 1} to ${b + 1} into one?`
              : `What is the best total for taking tiles ${a + 1} to ${b + 1}, while ${a === 0 ? 'the left post' : `tile ${a}`} and ${b === 3 ? 'the right post' : `tile ${b + 2}`} stay?`
          } That is ${T}[${a + 1}][${b + 1}].`,
          setup,
          settings,
          answer: { kind: 'number', value },
          explain:
            p === 'merge'
              ? `Try every split for the last merge: ${cs.join(', ')}. The least is ${value}, splitting after pile ${k + 1}.`
              : `Try every tile as the last one taken, scored with ${at(v, a - 1)} and ${at(v, b + 1)}: ${cs.join(', ')}. The best is ${value}, with tile ${k + 1} last.`,
          watch: [['solve']],
        };
      },
    },
    {
      id: 'last',
      title: 'Which goes last?',
      make(rng) {
        const p: Problem = rng.int(0, 1) ? 'merge' : 'remove';
        const settings: IVSettings = { ...defaults, problem: p };
        const unique = (xs: number[]) => {
          const cs = candidates(xs, p, 0, xs.length - 1);
          const top = p === 'merge' ? Math.min(...cs) : Math.max(...cs);
          return cs.filter((c) => c === top).length === 1;
        };
        let v = row(rng, 4);
        for (let tries = 0; tries < 50 && !unique(v); tries++) v = row(rng, 4);
        const setup: OpCall[] = [['load', v.join(' ')]];
        const state = run([...setup, ['solve']], settings).endState();
        const k = state.K[0]![3]!;
        const cs = candidates(v, p, 0, 3);
        return {
          prompt:
            p === 'merge'
              ? `Piles: ${v.join(', ')}. ${rulesText(p)} In the cheapest way to merge them all, the last merge joins piles 1 to k with piles k + 1 to 4. What is k?`
              : `Tiles: ${v.join(', ')}. ${rulesText(p)} In the best order for the whole row, which tile (by position, 1 to 4) is taken last?`,
          setup,
          settings,
          answer: { kind: 'number', value: k + 1 },
          explain:
            p === 'merge'
              ? `Each split k costs M[1][k] + M[k + 1][4] + ${v.reduce((x, y) => x + y, 0)}: ${cs.join(', ')} for k = 1 to 3. The least is k = ${k + 1}.`
              : `The tile taken last scores itself with the two posts, plus the best for each side of it: ${cs.join(', ')} for tiles 1 to 4. The best is tile ${k + 1}.`,
          watch: [['solve'], ['trace']],
        };
      },
    },
    spotItKind({ page: 'dp-interval', rows: SPOT_ROWS, watch: [['solve'], ['trace']] }),
  ];
}
