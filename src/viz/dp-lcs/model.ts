import type { OpSpec, PseudoBlock, PseudoLine, Scalar, Step } from '../../engine/types';
import type { Cell } from '../../layouts/table';
import { cellId, mark, plural, wordFromArg } from '../_dp/kit';

export const MAX_LEN = 10;

export interface LcsState {
  /** The first string: rows, X[1..m]. */
  x: string;
  /** The second string: columns, Y[1..n]. */
  y: string;
  /** c[i][j], the length of an LCS of X[1..i] and Y[1..j]; null where not filled yet. */
  c: (number | null)[][];
}

export interface LcsSettings {
  [key: string]: Scalar;
  /** Where to go when the cell above and the cell to the left tie. CLRS goes up. */
  tie: 'up' | 'left';
}

/** View-only data for one step. */
export interface LcsExtra {
  /** The cells read for the cell being filled, and which one gave its value. */
  reads?: { from: Cell; to: Cell; win: boolean }[];
  /** The traceback so far, from c[m][n]. */
  path?: Cell[];
  /** LCS characters found so far: where they sit in the LCS, and the row they came from. */
  found?: { ch: string; k: number; i: number }[];
  /** The LCS length, so the view can lay out its slots. */
  length?: number;
  /** Header characters being compared. */
  compare?: { i: number; j: number };
}

type S = LcsState;
type X = LcsExtra;
type Op = OpSpec<S, LcsSettings, X>;
type LcsStep = Step<S, X>;
type Gen = Generator<LcsStep, S, void>;

export const defaults: LcsSettings = { tie: 'up' };

export const START_X = 'ABCBDAB';
export const START_Y = 'BDCABA';

export const emptyTable = (m: number, n: number): (number | null)[][] =>
  Array.from({ length: m + 1 }, () => Array<number | null>(n + 1).fill(null));

export function init(): S {
  return { x: START_X, y: START_Y, c: emptyTable(START_X.length, START_Y.length) };
}

/** Shape ids of the header characters X[i] and Y[j]. */
export const xId = (i: number) => `rh-1-${i}`;
export const yId = (j: number) => `ch-1-${j}`;

/** Rows filled so far: -1 before the base cases, then the last complete row. */
export function filledRows(s: S): number {
  let r = -1;
  for (let i = 0; i < s.c.length; i++) {
    if (s.c[i]!.every((v) => v !== null)) r = i;
    else break;
  }
  return r;
}

export const isFull = (s: S) => filledRows(s) === s.x.length;

/** The direction c[i][j] takes its value from, under the tie rule. */
export function move(s: S, i: number, j: number, tie: LcsSettings['tie']): 'diag' | 'up' | 'left' {
  if (s.x[i - 1] === s.y[j - 1]) return 'diag';
  const up = s.c[i - 1]![j]!;
  const left = s.c[i]![j - 1]!;
  if (up === left) return tie;
  return up > left ? 'up' : 'left';
}

const q = (ch: string) => `'${ch}'`;

/** Fill rows of the table, starting where it left off, until row `last` is complete. */
function* fillRows(s: S, last: number, settings: LcsSettings): Gen {
  const { x, y } = s;
  const m = x.length;
  const n = y.length;
  const c = s.c.map((r) => [...r]);
  const state = (): S => ({ x, y, c: c.map((r) => [...r]) });
  let from = filledRows(s) + 1;
  if (from === 0) {
    for (let i = 0; i <= m; i++) c[i]![0] = 0;
    for (let j = 0; j <= n; j++) c[0]![j] = 0;
    yield {
      state: state(),
      marks: [
        ...Array.from({ length: n + 1 }, (_, j) => mark(cellId(0, j), 'new')),
        ...Array.from({ length: m }, (_, i) => mark(cellId(i + 1, 0), 'new')),
      ],
      say: `Row 0 and column 0 are 0: an empty string has nothing in common with anything.`,
      lines: ['l.base'],
      vars: { m, n, i: 0 },
      level: last === 0 ? 1 : 2,
    };
    from = 1;
  }
  for (let i = from; i <= last; i++) {
    for (let j = 1; j <= n; j++) {
      const xi = x[i - 1]!;
      const yj = y[j - 1]!;
      const vars = { m, n, i, j };
      yield {
        state: state(),
        marks: [mark(cellId(i, j), 'active'), mark(xId(i), 'compare'), mark(yId(j), 'compare')],
        say: `c[${i}][${j}]: compare X[${i}] = ${q(xi)} with Y[${j}] = ${q(yj)}.`,
        lines: ['l.loop', 'l.match'],
        vars,
        level: 3,
      };
      let say: string;
      let reads: X['reads'];
      let lines: string[];
      if (xi === yj) {
        const v = c[i - 1]![j - 1]! + 1;
        c[i]![j] = v;
        say = `X[${i}] = Y[${j}] = ${q(xi)}, a match: c[${i}][${j}] = c[${i - 1}][${j - 1}] + 1 = ${v}.`;
        reads = [{ from: [i - 1, j - 1], to: [i, j], win: true }];
        lines = ['l.match', 'l.diag'];
      } else {
        const up = c[i - 1]![j]!;
        const left = c[i]![j - 1]!;
        const dir = up === left ? settings.tie : up > left ? 'up' : 'left';
        c[i]![j] = Math.max(up, left);
        const which =
          up === left
            ? `a tie, so take the cell ${dir === 'up' ? 'above' : 'to the left'}${dir === 'up' ? ', as CLRS does' : ''}`
            : dir === 'up'
              ? 'from the cell above'
              : 'from the cell to the left';
        say = `${q(xi)} ≠ ${q(yj)}: c[${i}][${j}] = max(c[${i - 1}][${j}], c[${i}][${j - 1}]) = max(${up}, ${left}) = ${Math.max(up, left)}, ${which}.`;
        reads = [
          { from: [i - 1, j], to: [i, j], win: dir === 'up' },
          { from: [i, j - 1], to: [i, j], win: dir === 'left' },
        ];
        lines =
          dir === 'up' ? ['l.match', 'l.upcheck', 'l.up'] : ['l.match', 'l.upcheck', 'l.left'];
      }
      const rowDone = j === n;
      if (rowDone) say += ` Row ${i} is done: X[1..${i}] and Y have an LCS of length ${c[i]![n]}.`;
      yield {
        state: state(),
        marks: [
          mark(cellId(i, j), 'active'),
          ...reads.map((r) => mark(cellId(r.from[0], r.from[1]), 'compare')),
          ...(xi === yj ? [mark(xId(i), 'found'), mark(yId(j), 'found')] : []),
        ],
        say,
        lines,
        vars: { ...vars, 'c[i][j]': c[i]![j]! },
        level: rowDone ? 1 : 2,
        extra: { reads },
      };
    }
  }
  return state();
}

const fill: Op = {
  label: 'Fill the table',
  arity: 0,
  *run(s, _args, { settings }) {
    if (isFull(s)) {
      yield {
        state: s,
        marks: [mark(cellId(s.x.length, s.y.length), 'found')],
        say: `The table is already full: c[${s.x.length}][${s.y.length}] = ${s.c[s.x.length]![s.y.length]}. Press Trace back to find an LCS, or Load two new strings.`,
        lines: [],
        level: 1,
      };
      return s;
    }
    const end = yield* fillRows(s, s.x.length, settings);
    const m = s.x.length;
    const n = s.y.length;
    const len = end.c[m]![n]!;
    yield {
      state: end,
      marks: [mark(cellId(m, n), 'found')],
      say: `c[${m}][${n}] = ${len}: the longest common subsequence of ${q(s.x)} and ${q(s.y)} has length ${len}.${len ? ' Press Trace back to find one.' : ''}`,
      lines: ['l.ret'],
      vars: { m, n, length: len },
      level: 1,
    };
    return end;
  },
};

const row: Op = {
  label: 'Fill one row',
  arity: 0,
  *run(s, _args, { settings }) {
    const done = filledRows(s);
    if (done === s.x.length) {
      yield {
        state: s,
        marks: [],
        say: 'Every row is filled already. Press Trace back, or Load two new strings.',
        lines: [],
        level: 1,
      };
      return s;
    }
    return yield* fillRows(s, done + 1, settings);
  },
};

const trace: Op = {
  label: 'Trace back',
  arity: 0,
  *run(s, _args, { settings }): Gen {
    const m = s.x.length;
    const n = s.y.length;
    if (!isFull(s)) {
      yield {
        state: s,
        marks: [mark(cellId(m, n), 'error')],
        say: `Fill the table first. The traceback starts at c[${m}][${n}] and reads the cells on its way back.`,
        lines: [],
        level: 1,
      };
      return s;
    }
    const length = s.c[m]![n]!;
    let i = m;
    let j = n;
    const path: Cell[] = [[i, j]];
    const found: { ch: string; k: number; i: number }[] = [];
    /** The match cells the walk took a character from, for the last step. */
    const matched: Cell[] = [];
    const extra = (): X => ({ path: [...path], found: [...found], length });
    yield {
      state: s,
      marks: [mark(cellId(i, j), 'active')],
      say: `Start at the bottom-right corner, c[${m}][${n}] = ${length}, and walk back the way each value was made.`,
      lines: ['p.sig'],
      vars: { i, j, length },
      level: 2,
      extra: extra(),
    };
    while (i > 0 && j > 0) {
      const dir = move(s, i, j, settings.tie);
      const here = `c[${i}][${j}]`;
      let say: string;
      let lines: string[];
      const marks = [];
      if (dir === 'diag') {
        const ch = s.x[i - 1]!;
        found.push({ ch, k: length - found.length - 1, i });
        matched.push([i, j]);
        say = `X[${i}] = Y[${j}] = ${q(ch)}: ${here} came from a match, so ${q(ch)} is in the LCS. Take it and move diagonally to c[${i - 1}][${j - 1}].`;
        lines = ['p.match', 'p.diag'];
        marks.push(mark(xId(i), 'found'), mark(yId(j), 'found'), mark(cellId(i, j), 'found'));
        i--;
        j--;
      } else {
        const up = s.c[i - 1]![j]!;
        const left = s.c[i]![j - 1]!;
        const why =
          up === left
            ? `c[${i - 1}][${j}] = c[${i}][${j - 1}] = ${up}, a tie, so go ${dir}${dir === 'up' ? ' as CLRS does' : ''}`
            : dir === 'up'
              ? `c[${i - 1}][${j}] = ${up} is bigger than c[${i}][${j - 1}] = ${left}, so go up`
              : `c[${i}][${j - 1}] = ${left} is bigger than c[${i - 1}][${j}] = ${up}, so go left`;
        say = `${q(s.x[i - 1]!)} ≠ ${q(s.y[j - 1]!)} at ${here}: ${why}.`;
        lines = dir === 'up' ? ['p.match', 'p.up'] : ['p.match', 'p.left'];
        marks.push(mark(cellId(i, j), 'visit'));
        if (dir === 'up') i--;
        else j--;
      }
      path.push([i, j]);
      marks.push(mark(cellId(i, j), 'active'));
      yield {
        state: s,
        marks,
        say,
        lines,
        vars: { i, j, length, found: found.length },
        level: 2,
        extra: extra(),
      };
    }
    const lcs = [...found]
      .reverse()
      .map((f) => f.ch)
      .join('');
    yield {
      state: s,
      marks: [
        mark(cellId(i, j), 'visit'),
        ...matched.flatMap(([a, b]) => [
          mark(cellId(a, b), 'found'),
          mark(xId(a), 'found'),
          mark(yId(b), 'found'),
        ]),
      ],
      say:
        length === 0
          ? `Reached ${i === 0 ? 'row' : 'column'} 0. ${q(s.x)} and ${q(s.y)} have no character in common, so the LCS is empty.`
          : `Reached ${i === 0 ? 'row' : 'column'} 0, so the walk is over. Read the matches from left to right: the LCS is ${q(lcs)}, ${plural(length, 'character')}.`,
      lines: ['p.stop'],
      vars: { length, lcs },
      level: 1,
      extra: extra(),
    };
    return s;
  },
};

const load: Op = {
  label: 'Load',
  arity: 2,
  *run(s, [a, b]) {
    const x = wordFromArg(a, MAX_LEN, 'the first string');
    const y = wordFromArg(b, MAX_LEN, 'the second string');
    if ('error' in x || 'error' in y) {
      yield {
        state: s,
        marks: [],
        say: `Nothing loaded. ${'error' in x ? x.error : ''}${'error' in x && 'error' in y ? ' ' : ''}${'error' in y ? y.error : ''} The table stays as it was.`,
        lines: [],
        level: 1,
      };
      return s;
    }
    const next: S = { x: x.word, y: y.word, c: emptyTable(x.word.length, y.word.length) };
    yield {
      state: next,
      marks: [],
      say: `X = ${q(x.word)} gives the rows and Y = ${q(y.word)} the columns. c[i][j] will hold the length of an LCS of X[1..i] and Y[1..j]. Press Fill the table.`,
      lines: [],
      vars: { m: x.word.length, n: y.word.length },
      level: 1,
    };
    return next;
  },
};

export const ops = { load, fill, row, trace };

const L = (id: string, indent: number, text: string, plain: string): PseudoLine => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: LcsSettings): PseudoBlock[] {
  const up = settings.tie === 'up';
  const fillLines = [
    L('l.sig', 0, 'lcsLength(X, Y)', 'To fill the table for X[1..m] and Y[1..n]:'),
    L('l.base', 1, 'c[i][0] = 0; c[0][j] = 0', 'An empty string matches nothing.'),
    L('l.loop', 1, 'for i = 1 to m, for j = 1 to n', 'Row by row, left to right:'),
    L('l.match', 2, 'if X[i] == Y[j]', 'if the two characters match,'),
    L('l.diag', 3, 'c[i][j] = c[i - 1][j - 1] + 1', 'add one to the cell up and to the left;'),
    up
      ? L(
          'l.upcheck',
          2,
          'else if c[i - 1][j] >= c[i][j - 1]',
          'otherwise, if the cell above is no smaller,',
        )
      : L(
          'l.upcheck',
          2,
          'else if c[i][j - 1] >= c[i - 1][j]',
          'otherwise, if the cell to the left is no smaller,',
        ),
    ...(up
      ? [
          L('l.up', 3, 'c[i][j] = c[i - 1][j]', 'copy the cell above;'),
          L('l.left', 2, 'else c[i][j] = c[i][j - 1]', 'else copy the cell to the left.'),
        ]
      : [
          L('l.left', 3, 'c[i][j] = c[i][j - 1]', 'copy the cell to the left;'),
          L('l.up', 2, 'else c[i][j] = c[i - 1][j]', 'else copy the cell above.'),
        ]),
    L('l.ret', 1, 'return c[m][n]', 'The bottom-right cell is the LCS length.'),
  ];
  const traceLines = [
    L('p.sig', 0, 'traceBack(i = m, j = n)', 'To find one LCS, start at the bottom-right:'),
    L(
      'p.match',
      1,
      'while i > 0 and j > 0: if X[i] == Y[j]',
      'while in the table, if the characters match,',
    ),
    L(
      'p.diag',
      2,
      'take X[i]; i = i - 1; j = j - 1',
      'that character is in the LCS: take it, go diagonally;',
    ),
    up
      ? L(
          'p.up',
          2,
          'else if c[i - 1][j] >= c[i][j - 1]: i = i - 1',
          'otherwise go up if that cell is no smaller,',
        )
      : L(
          'p.left',
          2,
          'else if c[i][j - 1] >= c[i - 1][j]: j = j - 1',
          'otherwise go left if that cell is no smaller,',
        ),
    up
      ? L('p.left', 2, 'else j = j - 1', 'else go left.')
      : L('p.up', 2, 'else i = i - 1', 'else go up.'),
    L(
      'p.stop',
      1,
      'return the characters taken, reversed',
      'The matches, read backwards, are the LCS.',
    ),
  ];
  // "Fill one row" runs the same procedure, so the code panel shows it the fill block.
  return [
    { op: 'fill', lines: fillLines },
    { op: 'trace', lines: traceLines },
  ];
}

export function initialSay(state: S): string {
  return `X = ${q(state.x)} and Y = ${q(state.y)}. Press Fill the table, or Load two words of your own (up to ${MAX_LEN} letters or digits each).`;
}

export function initialVars(state: S) {
  return { m: state.x.length, n: state.y.length };
}

export function describe(state: S): string {
  const rows = state.c.map(
    (r, i) =>
      `row ${i}${i ? ` (${state.x[i - 1]})` : ''}: ${r.map((v) => (v === null ? 'empty' : String(v))).join(' ')}`,
  );
  return `LCS table for X = ${state.x} and Y = ${state.y}. ${rows.join('; ')}.`;
}
