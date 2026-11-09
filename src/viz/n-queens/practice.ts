import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { and, choice, plural, shuffle } from '../_recursion/kit';
import {
  advance,
  attackers,
  defaults,
  init,
  safeColumns,
  type QueenExtra,
  type QueenSettings,
  type QueenState,
} from './model';

type Def = VizDef<QueenState, QueenSettings, QueenExtra>;

const moves = (k: number): OpCall[] => Array.from({ length: k }, () => ['step'] as OpCall);

/** Moves of the search before its first solution, for a board size. */
function movesToFirst(n: number): number {
  let s = init({ n, goal: 'first' });
  for (let k = 1; ; k++) {
    const m = advance(s);
    s = m.next;
    if (m.solution || m.kind === 'over') return k;
  }
}

const placeText = (row: number, col: number) => `Put a queen in row ${row + 1}, column ${col + 1}`;
const backText = (row: number) => `Take back the queen in row ${row + 1}`;

/**
 * Practice questions for N-Queens. Every answer comes from running the model, so it always
 * agrees with the drawing. `def` is a getter to avoid an import cycle.
 */
export function queensPractice(def: () => Def): PracticeKind[] {
  const after = (settings: QueenSettings, calls: OpCall[]) =>
    new Timeline(def(), settings, 1, calls).endState();
  /** Settings and a number of moves that leave the search part way to its first solution. */
  const midway = (rng: Rng, sizes: number[], want: 'any' | 'placed' | 'square' = 'any') => {
    const n = sizes[rng.int(0, sizes.length - 1)]!;
    const settings: QueenSettings = { ...defaults, n, goal: 'first' };
    const last = movesToFirst(n) - 1;
    let k = rng.int(1, Math.max(1, last));
    // Some questions want the last move to be a placement, so the next row is fresh, or a row
    // that still has a square to try. The first move is always a placement.
    const ok = (s: QueenState) => want === 'any' || (want === 'placed' ? s.from === 0 : s.from < n);
    while (k > 1 && !ok(after(settings, moves(k)))) k--;
    return { n, settings, k, state: after(settings, moves(k)) };
  };

  return [
    {
      id: 'next-move',
      title: 'What does backtracking do next?',
      make(rng) {
        const { n, settings, k, state } = midway(rng, [4, 5, 6]);
        const m = advance(state);
        const row = state.queens.length;
        const right = m.kind === 'place' ? placeText(m.row, m.col) : backText(m.row);
        const wrong = [
          ...Array.from({ length: n }, (_, c) => placeText(row, c)),
          ...(row > 0 ? [backText(row - 1)] : []),
        ].filter((w) => w !== right);
        const tried = m.conflicts.map((c) => String(c.col + 1));
        const start = state.from > 0 ? ` from column ${state.from + 1} on` : '';
        return {
          prompt: `Backtracking has made the moves shown on this ${n} × ${n} board, trying columns left to right in each row. What does it do next?`,
          setup: moves(k),
          settings,
          answer: choice(rng, right, shuffle(rng, wrong)),
          explain:
            m.kind === 'place'
              ? `Row ${row + 1} is tried${start}. ${tried.length ? `${tried.length === 1 ? 'Column' : 'Columns'} ${and(tried)} ${tried.length === 1 ? 'is' : 'are'} attacked, so ` : ''}column ${m.col + 1} is the first safe square: ${right.toLowerCase()}.`
              : `Every square of row ${row + 1}${start} is attacked, so this path is a dead end. The search backtracks: ${right.toLowerCase()} and tries its next column.`,
          watch: [['step']],
        };
      },
    },
    {
      id: 'safe-squares',
      title: 'Safe squares in the next row',
      make(rng) {
        const { n, settings, k, state } = midway(rng, [5, 6], 'placed');
        const row = state.queens.length;
        const safe = safeColumns(state.queens, n, row);
        return {
          prompt: `${row === 1 ? 'The queen shown sits in row 1' : `The queens shown sit in rows 1 to ${row}`}. How many squares of row ${row + 1} does no queen attack?`,
          setup: moves(k),
          settings,
          answer: { kind: 'number', value: safe.length },
          explain: safe.length
            ? `Cross out every square a queen reaches along its column or a diagonal. In row ${row + 1} that leaves ${plural(safe.length, 'square')}: ${safe.length === 1 ? 'column' : 'columns'} ${and(safe.map((c) => String(c + 1)))}.`
            : `Every square of row ${row + 1} is on a queen's column or diagonal, so the search has hit a dead end and must backtrack.`,
          watch: [['step']],
        };
      },
    },
    {
      id: 'first-solution',
      title: 'The first solution',
      make(rng) {
        const n = rng.int(4, 5);
        const settings: QueenSettings = { ...defaults, n, goal: 'first' };
        const end = after(settings, [['solve']]);
        const cols = end.queens.map((c) => String(c + 1));
        return {
          prompt: `Backtracking fills an empty ${n} × ${n} board one row at a time, trying the columns of each row left to right. Type the columns of the first solution it finds, row 1 first, separated by spaces.`,
          setup: [],
          settings,
          answer: { kind: 'sequence', value: cols },
          explain: end.backtracks
            ? `It reaches ${cols.join(' ')} after ${plural(end.placements, 'placement')} and ${plural(end.backtracks, 'backtrack')}. Every earlier choice in row 1 led to a dead end.`
            : `It reaches ${cols.join(' ')} after ${plural(end.placements, 'placement')} and no backtracks: the first safe square in every row was already the right one.`,
          watch: [['solve']],
        };
      },
    },
    {
      id: 'attackers',
      title: 'Who attacks this square?',
      make(rng) {
        const { settings, k, state } = midway(rng, [5, 6], 'square');
        const row = state.queens.length;
        const col = state.from;
        const by = attackers(state.queens, row, col);
        return {
          prompt: `The search is about to try row ${row + 1}, column ${col + 1}. How many of the queens shown attack that square?`,
          setup: moves(k),
          settings,
          answer: { kind: 'number', value: by.length },
          explain: by.length
            ? `A queen attacks along its column and both diagonals. ${by.length === 1 ? 'One queen reaches' : `${by.length} queens reach`} row ${row + 1}, column ${col + 1}, so the search will skip it.`
            : `No queen shares its column or a diagonal, so the search can place a queen there.`,
          watch: [['step']],
        };
      },
    },
  ];
}
