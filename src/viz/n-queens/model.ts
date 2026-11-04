import type { OpSpec, PseudoBlock, Scalar, Step } from '../../engine/types';
import { L, and, mark, plural } from '../_recursion/kit';

export type Goal = 'first' | 'all';

export interface QueenSettings {
  [key: string]: Scalar;
  n: number;
  /** first: stop at the first solution. all: keep going and count every solution. */
  goal: Goal;
}

export const defaults: QueenSettings = { n: 4, goal: 'first' };

/** From this size on, counting every solution shows only the solutions, not every move. */
export const SUMMARY_FROM = 7;
/** How many solutions the state keeps for drawing. */
const KEEP = 12;

/**
 * The search state of row-by-row backtracking. queens[r] is the column of the queen in row r
 * (0-based), so the queens are the calls on the stack. `from` is the next column to try in the
 * first empty row: 0 for a fresh row, one past the old queen after a backtrack.
 */
export interface QueenState {
  n: number;
  queens: number[];
  from: number;
  placements: number;
  backtracks: number;
  solutions: number;
  /** The first solutions found, for drawing. */
  found: number[][];
  /** Every column of row 1 has been tried: the search is over. */
  done: boolean;
}

export interface Conflict {
  col: number;
  by: number;
  how: 'column' | 'diagonal';
}

export interface QueenExtra {
  /** A square being tried and the queen that attacks it. */
  trying?: { row: number; col: number; by: number; how: Conflict['how'] };
  /** A row with no safe square left. */
  deadEnd?: number;
  /** A queen just taken back, drawn fading. */
  removed?: { row: number; col: number };
  /** A queen placed after a backtrack slides from its old column. */
  slidFrom?: { row: number; col: number };
}

type S = QueenState;
type X = QueenExtra;
type Op = OpSpec<S, QueenSettings, X>;
type QueenStep = Step<S, X>;

export function init(settings: QueenSettings): S {
  return {
    n: settings.n,
    queens: [],
    from: 0,
    placements: 0,
    backtracks: 0,
    solutions: 0,
    found: [],
    done: false,
  };
}

/** The first queen (top row first) that attacks (row, col), or null if the square is safe. */
export function attacker(
  queens: readonly number[],
  row: number,
  col: number,
): { row: number; how: Conflict['how'] } | null {
  for (let r = 0; r < queens.length && r < row; r++) {
    const c = queens[r]!;
    if (c === col) return { row: r, how: 'column' };
    if (Math.abs(c - col) === row - r) return { row: r, how: 'diagonal' };
  }
  return null;
}

/** Rows of every queen above `row` that attacks (row, col), top first. */
export function attackers(queens: readonly number[], row: number, col: number): number[] {
  return queens
    .map((c, r) => (r < row && (c === col || Math.abs(c - col) === row - r) ? r : -1))
    .filter((r) => r >= 0);
}

/** Columns of `row` that no queen above it attacks. */
export function safeColumns(queens: readonly number[], n: number, row = queens.length): number[] {
  return Array.from({ length: n }, (_, c) => c).filter((c) => attacker(queens, row, c) === null);
}

export interface Move {
  kind: 'place' | 'backtrack' | 'over';
  /** The row a queen went into, or the row whose queen was taken back. */
  row: number;
  col: number;
  /** Squares tried and rejected before the outcome, in order. */
  conflicts: Conflict[];
  /** The placement filled the board. */
  solution: boolean;
  next: S;
}

/** One move of the search: place the next queen, or take one back. */
export function advance(s: S): Move {
  const n = s.n;
  if (s.done) return { kind: 'over', row: -1, col: -1, conflicts: [], solution: false, next: s };
  if (s.queens.length === n) {
    // A full board was a solution; take back its last queen to look for the next one.
    const row = n - 1;
    const col = s.queens[row]!;
    const next = {
      ...s,
      queens: s.queens.slice(0, -1),
      from: col + 1,
      backtracks: s.backtracks + 1,
    };
    return { kind: 'backtrack', row, col, conflicts: [], solution: false, next };
  }
  const row = s.queens.length;
  const conflicts: Conflict[] = [];
  for (let col = s.from; col < n; col++) {
    const by = attacker(s.queens, row, col);
    if (by) {
      conflicts.push({ col, by: by.row, how: by.how });
      continue;
    }
    const queens = [...s.queens, col];
    const solution = queens.length === n;
    const next: S = {
      ...s,
      queens,
      from: 0,
      placements: s.placements + 1,
      solutions: s.solutions + (solution ? 1 : 0),
      found: solution && s.found.length < KEEP ? [...s.found, queens] : s.found,
    };
    return { kind: 'place', row, col, conflicts, solution, next };
  }
  if (row === 0) {
    return {
      kind: 'over',
      row: 0,
      col: -1,
      conflicts,
      solution: false,
      next: { ...s, done: true },
    };
  }
  const col = s.queens[row - 1]!;
  const next = {
    ...s,
    queens: s.queens.slice(0, -1),
    from: col + 1,
    backtracks: s.backtracks + 1,
  };
  return { kind: 'backtrack', row: row - 1, col, conflicts, solution: false, next };
}

const fmtQueens = (qs: readonly number[]) => qs.map((c) => c + 1).join(' ');

const vars = (s: S, more: Record<string, Scalar> = {}): Record<string, Scalar> => ({
  ...more,
  placements: s.placements,
  backtracks: s.backtracks,
  solutions: s.solutions,
});

const howText = (how: Conflict['how']) => (how === 'column' ? 'same column' : 'same diagonal');

/** The steps of one move, every rejected square included. */
function* moveSteps(s: S, m: Move, goal: Goal): Generator<QueenStep, S, void> {
  const n = s.n;
  for (const c of m.conflicts) {
    const row = m.kind === 'backtrack' ? m.row + 1 : m.row;
    yield {
      state: s,
      marks: [
        mark(`queen-${c.by}`, 'error'),
        mark('attack-line', 'error'),
        mark(`cell-${row}-${c.col}`, 'error'),
      ],
      say: `Try row ${row + 1}, column ${c.col + 1}: the queen in row ${c.by + 1} attacks it (${howText(c.how)}).`,
      lines: ['loop', 'safe'],
      vars: vars(s, { row: row + 1, col: c.col + 1 }),
      level: 3,
      extra: { trying: { row, col: c.col, by: c.by, how: c.how } },
    };
  }
  const skipped = m.conflicts.map((c) => String(c.col + 1));
  const past = skipped.length
    ? ` ${skipped.length === 1 ? 'Column' : 'Columns'} ${and(skipped)} ${skipped.length === 1 ? 'is' : 'are'} attacked.`
    : '';
  const next = m.next;
  if (m.kind === 'place') {
    const slid = s.from > 0 ? { row: m.row, col: s.from - 1 } : undefined;
    const say = m.solution
      ? `${past} Row ${m.row + 1}, column ${m.col + 1} is safe. That is all ${n} queens: solution ${next.solutions}, columns ${fmtQueens(next.queens)}.${goal === 'first' ? ' Stop at the first solution.' : ''}`
      : `${past} Row ${m.row + 1}, column ${m.col + 1} is safe: place a queen and go on to row ${m.row + 2}.`;
    yield {
      state: next,
      marks: [mark(`queen-${m.row}`, m.solution ? 'found' : 'new')],
      say: say.trim(),
      lines: m.solution ? ['put', 'full', 'yes'] : ['safe', 'put', 'rec'],
      vars: vars(next, { row: m.row + 1, col: m.col + 1 }),
      level: m.solution ? 1 : 2,
      extra: slid ? { slidFrom: slid } : {},
    };
  } else if (m.kind === 'backtrack') {
    const afterSolution = m.conflicts.length === 0 && s.queens.length === n;
    const dead = m.row + 1;
    if (!afterSolution) {
      // First the dead end itself, with every queen still on the board.
      yield {
        state: s,
        marks: [mark(`row-${dead}`, 'error')],
        say: (m.conflicts.length
          ? `${past} Row ${dead + 1} has no safe column left to try, so this path is a dead end: place(${dead + 1}) returns false.`
          : `Row ${dead + 1} has no columns left to try, so this path is a dead end too: place(${dead + 1}) returns false.`
        ).trim(),
        lines: ['no'],
        vars: vars(s, { row: dead + 1 }),
        level: 2,
        extra: { deadEnd: dead },
      };
    }
    yield {
      state: next,
      marks: [mark(`queen-gone`, 'remove')],
      say: afterSolution
        ? `Look for the next solution: take back the queen in row ${m.row + 1} (column ${m.col + 1}) and try the next column in its row.`
        : `Backtrack: take back the queen in row ${m.row + 1} (column ${m.col + 1}) and try the next column in its row.`,
      lines: ['remove'],
      vars: vars(next, { row: m.row + 1 }),
      level: 2,
      extra: { removed: { row: m.row, col: m.col } },
    };
  } else {
    yield {
      state: next,
      marks: [],
      say: `${past} Row 1 has no column left to try, so the search is over. It found ${plural(next.solutions, 'solution')} for ${n} queens, with ${plural(next.placements, 'placement')} and ${plural(next.backtracks, 'backtrack')}.`.trim(),
      lines: ['no'],
      vars: vars(next),
      level: 1,
      extra: {},
    };
  }
  return next;
}

const over = (s: S): QueenStep => ({
  state: s,
  marks: [],
  say: `The search is over: it found ${plural(s.solutions, 'solution')}. Clear the board to start again.`,
  lines: [],
  vars: vars(s),
  level: 1,
});

const step: Op = {
  label: 'Next move',
  arity: 0,
  *run(s, _args, { settings }) {
    if (s.done) {
      yield over(s);
      return s;
    }
    return yield* moveSteps(s, advance(s), settings.goal);
  },
};

const solve: Op = {
  label: 'Solve',
  arity: 0,
  *run(s0, _args, { settings }) {
    let s = s0;
    if (s.done) {
      yield over(s);
      return s;
    }
    const goal = settings.goal;
    if (goal === 'all' && s.n >= SUMMARY_FROM) {
      // Too many moves to show one by one: stop at each solution instead.
      let since = 0;
      for (;;) {
        const m = advance(s);
        s = m.next;
        since++;
        if (m.solution) {
          yield {
            state: s,
            marks: [mark(`queen-${s.n - 1}`, 'found')],
            say: `Solution ${s.solutions}: columns ${fmtQueens(s.queens)}, after ${plural(since, 'more move')}. (With ${s.n} queens the search is too long to show move by move; Next move steps through it.)`,
            lines: ['full', 'yes'],
            vars: vars(s),
            level: 1,
          };
          since = 0;
        }
        if (m.kind === 'over') {
          yield {
            state: s,
            marks: [],
            say: `Row 1 has no column left to try, so the search is over. It found ${plural(s.solutions, 'solution')} for ${s.n} queens, with ${plural(s.placements, 'placement')} and ${plural(s.backtracks, 'backtrack')}.`,
            lines: ['no'],
            vars: vars(s),
            level: 1,
          };
          return s;
        }
      }
    }
    for (;;) {
      const m = advance(s);
      s = yield* moveSteps(s, m, goal);
      if (m.kind === 'over' || (goal === 'first' && m.solution)) return s;
    }
  },
};

const clear: Op = {
  label: 'Clear board',
  arity: 0,
  *run(s, _args, { settings }) {
    const empty = init({ ...settings, n: s.n });
    yield {
      state: empty,
      marks: [],
      say: `An empty ${s.n} × ${s.n} board. The search starts again from row 1, column 1.`,
      lines: ['clear'],
      vars: vars(empty),
      level: 1,
    };
    return empty;
  },
};

export const ops = { solve, step, clear };

export function pseudocode(s: QueenSettings): PseudoBlock[] {
  const lines =
    s.goal === 'first'
      ? [
          L('sig', 0, 'place(row)', 'To fill the board from this row down:'),
          L('full', 1, 'if row > n', 'If every row has a queen,'),
          L('yes', 2, 'return true', 'that is a solution: stop.'),
          L('loop', 1, 'for col = 1 to n', 'Try each column of this row in turn:'),
          L(
            'safe',
            2,
            'if no queen attacks (row, col)',
            'if no queen above can reach that square,',
          ),
          L('put', 3, 'put a queen at (row, col)', 'put a queen there'),
          L(
            'rec',
            3,
            'if place(row + 1): return true',
            'and fill the rows below; stop if that worked.',
          ),
          L('remove', 3, 'remove the queen at (row, col)', 'Otherwise take the queen back.'),
          L('no', 1, 'return false', 'No column worked: report a dead end.'),
        ]
      : [
          L('sig', 0, 'place(row)', 'To fill the board from this row down:'),
          L('full', 1, 'if row > n', 'If every row has a queen,'),
          L('yes', 2, 'count a solution; return', 'count a solution and go back for more.'),
          L('loop', 1, 'for col = 1 to n', 'Try each column of this row in turn:'),
          L(
            'safe',
            2,
            'if no queen attacks (row, col)',
            'if no queen above can reach that square,',
          ),
          L('put', 3, 'put a queen at (row, col)', 'put a queen there,'),
          L('rec', 3, 'place(row + 1)', 'fill the rows below,'),
          L(
            'remove',
            3,
            'remove the queen at (row, col)',
            'and take the queen back to try the next column.',
          ),
          L('no', 1, 'return', 'Every column is tried: go back up.'),
        ];
  return [
    { op: 'solve', lines },
    { op: 'step', lines },
    {
      op: 'clear',
      lines: [L('clear', 0, 'remove every queen', 'Start again with an empty board.')],
    },
  ];
}

export function initialSay(state: S, s: QueenSettings): string {
  return `An empty ${state.n} × ${state.n} board. Press Solve to place queens row by row, ${s.goal === 'first' ? 'stopping at the first solution' : 'counting every solution'}, or Next move to go one move at a time.`;
}

export function initialVars(state: S): Record<string, Scalar> {
  return vars(state);
}

export function describe(state: S): string {
  const n = state.n;
  const placed = state.queens.map((c, r) => `row ${r + 1} column ${c + 1}`);
  const where = placed.length ? `Queens at ${and(placed)}.` : 'No queens yet.';
  const status = state.done
    ? ` The search is over: ${plural(state.solutions, 'solution')}.`
    : state.queens.length === n
      ? ` That is a solution.`
      : '';
  return `${n} × ${n} board. ${where}${status}`;
}
