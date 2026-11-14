/**
 * Matrix traversal: two moves every grid problem is built from.
 *
 * - Spiral order: visit an m × n matrix clockwise from the top left, ring by ring inward.
 *   The pattern keeps four bounds, top, bottom, left and right, around the part not visited yet:
 *   walk the top row and move top down, walk the right column and move right in, and so on,
 *   with a check before the bottom row and the left column so a single row or column is not
 *   walked twice. O(mn) time, O(1) extra space. The naive way walks with a direction and a
 *   second m × n grid of seen marks, turning right whenever the next cell is off the grid or
 *   seen: the same order, with mn extra cells and a check per move.
 * - Rotation by 90° clockwise of an n × n matrix: the cell in row i, column j goes to row j,
 *   column n − 1 − i. The pattern rotates in place: by rings, where each four-way swap moves one
 *   cell of each side a quarter turn (each cell is moved once), or by transposing (swap across
 *   the diagonal) and then reversing each row (each cell is moved about twice). The naive way
 *   writes each cell into a new matrix B: the same n² reads and writes as the rings, plus n²
 *   extra cells. The gain of rotating in place is space, not time, and the page says so.
 *
 * Work, in the units of src/viz/_patterns/kit.ts: a read takes one value out of a cell, a write
 * puts one in (a seen mark counts as a write), a check tests a bound or whether a cell is free.
 * Values carry uids, so a rotation animates the values, not the slots.
 */
import type {
  Mark,
  MarkRole,
  OpSpec,
  PseudoBlock,
  PseudoLine,
  Scalar,
  Step,
  Value,
} from '../../engine/types';
import { approachOf, Work, workVars, type Approach, type Totals } from '../_patterns/kit';

export const MAX_SIDE = 6;
export const MAX_VALUE = 99;

export interface Cell {
  uid: number;
  value: number;
  /** An old copy left behind (copying into B): drawn faded. */
  stale?: boolean;
}

export interface MatrixState {
  m: Cell[][];
  nextUid: number;
}

export type RotateBy = 'layers' | 'transpose';

export interface MatrixSettings {
  [key: string]: Scalar;
  approach: Approach;
  rotate: RotateBy;
}

export const defaults: MatrixSettings = { approach: 'pattern', rotate: 'layers' };

export type Pos = readonly [r: number, c: number];

export interface Bounds4 {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** View-only data for a step of spiral or rotate. */
export interface MatrixExtra {
  op: 'spiral' | 'rotate';
  heading: string;
  /** Spiral: the cells visited so far, in order, and how many there will be. */
  path?: Pos[];
  /** Spiral: the values in the order visited. */
  out?: number[];
  total?: number;
  /** Spiral by bounds: the part not visited yet. */
  bounds?: Bounds4;
  /** Spiral by walking: the seen marks, the extra grid. */
  seen?: boolean[][];
  /** Rotate into a copy: the new matrix B. */
  b?: (Cell | null)[][];
  /** Rotate by rings: the ring being rotated. */
  ring?: { first: number; last: number };
  /** Rotate by transposing: draw the diagonal (transpose) or the middle line (reverse). */
  guide?: 'diagonal' | 'middle';
}

export type MatrixStep = Step<MatrixState, MatrixExtra>;
type Op = OpSpec<MatrixState, MatrixSettings, MatrixExtra>;
type Gen = Generator<MatrixStep, MatrixState, void>;

export const UNITS = ['reads', 'writes', 'checks'] as const;

export const cellId = (r: number, c: number) => `cell-${r}-${c}`;
export const vid = (x: Cell) => `v${x.uid}`;
const mark = (id: string, role: MarkRole): Mark => ({ id, role });

export function makeState(rows: number[][], firstUid = 1): MatrixState {
  let uid = firstUid;
  return { m: rows.map((row) => row.map((value) => ({ uid: uid++, value }))), nextUid: uid };
}

/** 1 to rows × cols, row by row. */
export const counting = (rows: number, cols: number): number[][] =>
  Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => r * cols + c + 1));

export const START = counting(4, 4);

export const init = (): MatrixState => makeState(START);

export const valuesOf = (s: MatrixState): number[][] => s.m.map((row) => row.map((x) => x.value));

export const size = (s: MatrixState) => ({ rows: s.m.length, cols: s.m[0]?.length ?? 0 });

const at = (r: number, c: number, v: number) => `M[${r}][${c}] = ${v}`;

/** "1st", "2nd", "3rd", "11th", "22nd". */
export function ordinal(k: number): string {
  const t = k % 100;
  if (t >= 11 && t <= 13) return `${k}th`;
  return `${k}${['th', 'st', 'nd', 'rd'][k % 10] ?? 'th'}`;
}

// ----- Input -----

const SIZE = /^(\d+)\s*[x×*]\s*(\d+)$/i;

/**
 * An operation's matrix, or why it cannot be read: "4x5" (filled with 1 to 20), or rows
 * separated by slashes, "1 2 3 / 4 5 6" (so "7" is the 1 × 1 matrix holding 7).
 */
export function readMatrix(arg: Value | undefined): number[][] | string {
  const text = String(arg ?? '').trim();
  const sideError = `Use 1 to ${MAX_SIDE} rows and 1 to ${MAX_SIDE} columns.`;
  if (text === '') return 'Type a size such as 4x4, or rows such as 1 2 3 / 4 5 6.';
  const sized = SIZE.exec(text);
  if (sized) {
    const rows = Number(sized[1]);
    const cols = Number(sized[2]);
    if (rows < 1 || cols < 1 || rows > MAX_SIDE || cols > MAX_SIDE)
      return `${rows} × ${cols} is out of range. ${sideError}`;
    return counting(rows, cols);
  }
  const lines = text
    .split(/[/;|]/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length > MAX_SIDE) return `That is ${lines.length} rows. ${sideError}`;
  const rows: number[][] = [];
  for (const line of lines) {
    const row: number[] = [];
    for (const t of line.split(/[\s,]+/).filter(Boolean)) {
      if (!/^\d+$/.test(t)) return `"${t}" is not a whole number from 0 to ${MAX_VALUE}.`;
      const v = Number(t);
      if (v > MAX_VALUE) return `${t} is out of range. Use whole numbers from 0 to ${MAX_VALUE}.`;
      row.push(v);
    }
    if (row.length > MAX_SIDE) return `A row has ${row.length} values. ${sideError}`;
    rows.push(row);
  }
  if (rows.some((r) => r.length !== rows[0]!.length))
    return 'Every row needs the same number of values.';
  return rows;
}

/** For the input box: the text as typed, once it reads as a matrix. */
export function parseInput(token: string): Value | Error {
  const m = readMatrix(token);
  return typeof m === 'string' ? new Error(m) : token.trim();
}

// ----- The answers and the costs, computed first -----

/** Spiral order by four bounds: the cells in order, and the bound checks it makes. */
export function spiralOrder(rows: number, cols: number): { order: Pos[]; checks: number } {
  const order: Pos[] = [];
  let checks = 0;
  let top = 0;
  let bottom = rows - 1;
  let left = 0;
  let right = cols - 1;
  for (;;) {
    checks++;
    if (!(top <= bottom && left <= right)) break;
    for (let c = left; c <= right; c++) order.push([top, c]);
    top++;
    for (let r = top; r <= bottom; r++) order.push([r, right]);
    right--;
    checks++;
    if (top <= bottom) {
      for (let c = right; c >= left; c--) order.push([bottom, c]);
      bottom--;
    }
    checks++;
    if (left <= right) {
      for (let r = bottom; r >= top; r--) order.push([r, left]);
      left++;
    }
  }
  return { order, checks };
}

/** What each approach costs. */
export function spiralTotals(rows: number, cols: number): Totals {
  const mn = rows * cols;
  return { naive: mn + mn + (mn - 1), pattern: mn + spiralOrder(rows, cols).checks };
}

/** Four-way swaps in the rings of an n × n matrix: (n − 1) + (n − 3) + …, which is ⌊n²/4⌋. */
export const ringSwaps = (n: number) => Math.floor((n * n) / 4);

/** Two-way swaps when transposing, then reversing each row. */
export const transposeSwaps = (n: number) => (n * (n - 1)) / 2 + n * Math.floor(n / 2);

export function rotateTotals(n: number, by: RotateBy): Totals {
  return {
    naive: 2 * n * n,
    pattern: by === 'layers' ? 8 * ringSwaps(n) : 4 * transposeSwaps(n),
  };
}

/** The values of an n × n matrix turned 90° clockwise: new[r][c] = old[n − 1 − c][r]. */
export function rotated(vs: number[][]): number[][] {
  const n = vs.length;
  return vs.map((_, r) => vs.map((__, c) => vs[n - 1 - c]![r]!));
}

// ----- Steps -----

function refuse(s: MatrixState, why: string): MatrixStep {
  return { state: s, marks: [], say: why, lines: [], level: 1, vars: sizeVars(s) };
}

const sizeVars = (s: MatrixState): Record<string, Scalar> => {
  const { rows, cols } = size(s);
  return { rows, cols };
};

const load: Op = {
  label: 'Load',
  arity: 1,
  *run(s, [arg]) {
    const rows = readMatrix(arg);
    if (typeof rows === 'string') {
      yield refuse(s, `Nothing loaded. ${rows} The matrix stays as it was.`);
      return s;
    }
    const next = makeState(rows, s.nextUid);
    const { rows: m, cols: n } = size(next);
    yield {
      state: next,
      marks: [],
      say: `Loaded a ${m} × ${n} matrix. Press Spiral order${m === n ? ' or Rotate' : ''}.${m === n ? '' : ' Rotate needs a square one.'}`,
      lines: [],
      level: 1,
      vars: sizeVars(next),
    };
    return next;
  },
};

const DIRS = [
  { dr: 0, dc: 1, name: 'right' },
  { dr: 1, dc: 0, name: 'down' },
  { dr: 0, dc: -1, name: 'left' },
  { dr: -1, dc: 0, name: 'up' },
] as const;

/** Spiral order with four bounds around the part not visited yet. */
function* spiralBounds(s: MatrixState): Gen {
  const { rows: m, cols: n } = size(s);
  const tot = spiralTotals(m, n);
  const work = new Work(UNITS);
  const b: Bounds4 = { top: 0, bottom: m - 1, left: 0, right: n - 1 };
  const path: Pos[] = [];
  const out: number[] = [];
  const heading = 'spiral order: shrink four bounds';
  const extra = (): MatrixExtra => ({
    op: 'spiral',
    heading,
    path: [...path],
    out: [...out],
    total: m * n,
    bounds: { ...b },
  });
  const vars = (): Record<string, Scalar> => ({
    rows: m,
    cols: n,
    ...b,
    visited: out.length,
    'extra cells': 0,
    ...workVars(work, tot),
  });
  const step = (
    say: string,
    lines: string[],
    marks: Mark[] = [],
    level: 1 | 2 = 2,
  ): MatrixStep => ({
    state: s,
    marks,
    say,
    lines,
    level,
    vars: vars(),
    extra: extra(),
  });
  function* visit(r: number, c: number, side: string, lines: string[]): Gen {
    const v = s.m[r]![c]!.value;
    work.add('reads');
    path.push([r, c]);
    out.push(v);
    yield step(`${side}: visit ${at(r, c, v)}, the ${ordinal(out.length)} value.`, lines, [
      mark(cellId(r, c), 'active'),
      mark(`out-${out.length - 1}`, 'new'),
    ]);
    return s;
  }

  /** "Column 3 is done: right = 2.", or just the move when that side had no cells left. */
  const done = (side: string, empty: string, bound: string, to: number, walked: boolean) =>
    walked
      ? `${side} is done: ${bound} = ${to}.`
      : `The ${empty} had no cells left: ${bound} = ${to}.`;

  work.add('checks');
  yield step(
    `Spiral order goes clockwise round the outside ring, then the next ring in. Four bounds mark the part not visited yet: top = 0, bottom = ${m - 1}, left = 0, right = ${n - 1}. top ≤ bottom and left ≤ right, so start along the top row.`,
    ['init', 'loop'],
  );

  for (;;) {
    for (let c = b.left; c <= b.right; c++)
      yield* visit(b.top, c, 'The top row, left to right', ['top']);
    b.top++;
    yield step(`Row ${b.top - 1} is done: top = ${b.top}.`, ['incTop']);
    for (let r = b.top; r <= b.bottom; r++)
      yield* visit(r, b.right, 'The right column, top to bottom', ['right']);
    b.right--;
    let say = done(`Column ${b.right + 1}`, 'right column', 'right', b.right, b.top <= b.bottom);
    let lines = ['decRight'];
    work.add('checks');
    if (b.top <= b.bottom) {
      say +=
        b.right >= b.left
          ? ` top ≤ bottom, so walk the bottom row back.`
          : ` top ≤ bottom, but right < left: the bottom row has no cells left.`;
      yield step(say, [...lines, 'guardBottom']);
      for (let c = b.right; c >= b.left; c--)
        yield* visit(b.bottom, c, 'The bottom row, right to left', ['bottom']);
      b.bottom--;
      say = done(`Row ${b.bottom + 1}`, 'bottom row', 'bottom', b.bottom, b.right >= b.left);
      lines = ['decBottom'];
    } else {
      say += ` top = ${b.top} > bottom = ${b.bottom}: no row is left for a bottom side.`;
      lines = [...lines, 'guardBottom'];
    }
    work.add('checks');
    if (b.left <= b.right) {
      say +=
        b.bottom >= b.top
          ? ` left ≤ right, so walk the left column up.`
          : ` left ≤ right, but bottom < top: the left column has no cells left.`;
      yield step(say, [...lines, 'guardLeft']);
      for (let r = b.bottom; r >= b.top; r--)
        yield* visit(r, b.left, 'The left column, bottom to top', ['left']);
      b.left++;
      say = done(`Column ${b.left - 1}`, 'left column', 'left', b.left, b.bottom >= b.top);
      lines = ['incLeft'];
    } else {
      say += ` left = ${b.left} > right = ${b.right}: no column is left for a left side.`;
      lines = [...lines, 'guardLeft'];
    }
    work.add('checks');
    if (b.top <= b.bottom && b.left <= b.right) {
      yield step(`${say} Something is left inside the bounds: go round again, one ring in.`, [
        ...lines,
        'loop',
      ]);
      continue;
    }
    yield step(
      `${say} Nothing is left inside the bounds: all ${m * n} values are visited, in ${work.tally()}. Walking with a grid of seen marks takes ${tot.naive}, and ${m * n} extra cells.`,
      [...lines, 'loop', 'ret'],
      [],
      1,
    );
    return s;
  }
}

/** Spiral order by walking: a direction, and a grid of seen marks. */
function* spiralWalk(s: MatrixState): Gen {
  const { rows: m, cols: n } = size(s);
  const tot = spiralTotals(m, n);
  const work = new Work(UNITS);
  const seen = s.m.map((row) => row.map(() => false));
  const path: Pos[] = [];
  const out: number[] = [];
  let d = 0;
  let r = 0;
  let c = 0;
  const heading = 'spiral walk: turn when blocked';
  const extra = (): MatrixExtra => ({
    op: 'spiral',
    heading,
    path: [...path],
    out: [...out],
    total: m * n,
    seen: seen.map((row) => [...row]),
  });
  const vars = (): Record<string, Scalar> => ({
    rows: m,
    cols: n,
    r,
    c,
    direction: DIRS[d]!.name,
    visited: out.length,
    'extra cells': m * n,
    ...workVars(work, tot),
  });
  const step = (
    say: string,
    lines: string[],
    marks: Mark[] = [],
    level: 1 | 2 = 2,
  ): MatrixStep => ({
    state: s,
    marks,
    say,
    lines,
    level,
    vars: vars(),
    extra: extra(),
  });

  yield step(
    `Walk the matrix with a direction, starting right from the top left, and a second ${m} × ${n} grid of seen marks: ${m * n} extra cells. Turn right whenever the next cell is off the matrix or seen.`,
    ['init'],
  );
  let turned = false;
  for (let k = 1; k <= m * n; k++) {
    const v = s.m[r]![c]!.value;
    work.add('reads');
    seen[r]![c] = true;
    work.add('writes');
    path.push([r, c]);
    out.push(v);
    yield step(
      `Visit ${at(r, c, v)}, the ${ordinal(k)} value, and mark it seen.`,
      // The check of the cell ahead and the step forward that led here, unless it was a turn.
      k === 1
        ? ['loop', 'visit']
        : turned
          ? ['step', 'loop', 'visit']
          : ['check', 'step', 'loop', 'visit'],
      [
        mark(cellId(r, c), 'active'),
        mark(`seen-cell-${r}-${c}`, 'new'),
        mark(`out-${k - 1}`, 'new'),
      ],
    );
    if (k === m * n) break;
    work.add('checks');
    const nr = r + DIRS[d]!.dr;
    const nc = c + DIRS[d]!.dc;
    const free = nr >= 0 && nr < m && nc >= 0 && nc < n && !seen[nr]![nc];
    turned = !free;
    if (!free) {
      const was = DIRS[d]!.name;
      d = (d + 1) % 4;
      const off = nr < 0 || nr >= m || nc < 0 || nc >= n;
      yield step(
        `Going ${was}, the next cell${off ? ' is off the matrix' : `, M[${nr}][${nc}], is seen already`}. Turn right: now go ${DIRS[d]!.name}.`,
        ['check', 'turn'],
        [mark(cellId(r, c), 'compare')],
      );
    }
    r += DIRS[d]!.dr;
    c += DIRS[d]!.dc;
  }
  yield step(
    `All ${m * n} values are visited, in ${work.tally()}. Four bounds give the same order in ${tot.pattern}, with no extra grid.`,
    ['ret'],
    [],
    1,
  );
  return s;
}

/** The state with each cell's value and uid, as plain rows the steps can change. */
const copyRows = (s: MatrixState): Cell[][] => s.m.map((row) => [...row]);

function* rotateRings(s: MatrixState): Gen {
  const n = s.m.length;
  const tot = rotateTotals(n, 'layers');
  const work = new Work(UNITS);
  const m = copyRows(s);
  const heading = 'rotate 90° clockwise, ring by ring';
  let ring = { first: 0, last: n - 1 };
  const state = (): MatrixState => ({ m: m.map((row) => [...row]), nextUid: s.nextUid });
  const vars = (more: Record<string, Scalar> = {}): Record<string, Scalar> => ({
    n,
    ...more,
    'extra cells': 1,
    ...workVars(work, tot),
  });
  const extra = (): MatrixExtra => ({ op: 'rotate', heading, ring: { ...ring } });
  yield {
    state: state(),
    marks: [],
    say: `Rotate in place, one ring at a time from the outside in. Each four-way swap takes one cell from each side of the ring and moves it a quarter turn: left to top, bottom to left, right to bottom, top to right, with one spare cell to hold the top value.`,
    lines: ['init'],
    level: 2,
    vars: vars({ ring: 0 }),
    extra: extra(),
  };
  for (let layer = 0; layer < Math.floor(n / 2); layer++) {
    const first = layer;
    const last = n - 1 - layer;
    ring = { first, last };
    for (let k = 0; k < last - first; k++) {
      const cells: Pos[] = [
        [first, first + k],
        [first + k, last],
        [last, last - k],
        [last - k, first],
      ];
      const [t, rt, bt, lt] = cells.map(([r, c]) => m[r]![c]!);
      m[first]![first + k] = lt!;
      m[last - k]![first] = bt!;
      m[last]![last - k] = rt!;
      m[first + k]![last] = t!;
      work.add('reads', 4);
      work.add('writes', 4);
      yield {
        state: state(),
        marks: cells.map(([r, c]) => mark(cellId(r, c), 'active')),
        say: `Ring ${layer}, k = ${k}: ${t!.value} goes to M[${first + k}][${last}], ${rt!.value} to M[${last}][${last - k}], ${bt!.value} to M[${last - k}][${first}] and ${lt!.value} to M[${first}][${first + k}]. Four reads and four writes.`,
        lines: ['layer', 'cycle', 'save', 'moveLeft', 'moveBottom', 'moveRight', 'moveTop'],
        level: 2,
        vars: vars({ ring: layer, first, last, k }),
        extra: extra(),
      };
    }
  }
  return yield* rotateDone(state(), work, tot, heading, vars(), 'layers');
}

function* rotateTranspose(s: MatrixState): Gen {
  const n = s.m.length;
  const tot = rotateTotals(n, 'transpose');
  const work = new Work(UNITS);
  const m = copyRows(s);
  const heading = 'rotate: transpose, then reverse rows';
  const state = (): MatrixState => ({ m: m.map((row) => [...row]), nextUid: s.nextUid });
  const vars = (more: Record<string, Scalar> = {}): Record<string, Scalar> => ({
    n,
    ...more,
    'extra cells': 1,
    ...workVars(work, tot),
  });
  const swap = (a: Pos, b: Pos) => {
    const x = m[a[0]]![a[1]]!;
    m[a[0]]![a[1]] = m[b[0]]![b[1]]!;
    m[b[0]]![b[1]] = x;
    work.add('reads', 2);
    work.add('writes', 2);
  };
  yield {
    state: state(),
    marks: [],
    say: `Rotate in two moves. First transpose: swap each cell above the diagonal with its mirror below it, so row i becomes column i. Then reverse each row.`,
    lines: ['init'],
    level: 2,
    vars: vars(),
    extra: { op: 'rotate', heading, guide: 'diagonal' },
  };
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      const x = m[i]![j]!.value;
      const y = m[j]![i]!.value;
      swap([i, j], [j, i]);
      yield {
        state: state(),
        marks: [mark(cellId(i, j), 'active'), mark(cellId(j, i), 'active')],
        say: `Swap M[${i}][${j}] = ${x} and M[${j}][${i}] = ${y} across the diagonal.`,
        lines: ['tLoop', 'tSwap'],
        level: 2,
        vars: vars({ i, j }),
        extra: { op: 'rotate', heading, guide: 'diagonal' },
      };
    }
  yield {
    state: state(),
    marks: [],
    say: `Transposed: what was row i is now column i, read top to bottom. That is the rotation with each row backwards, so reverse each row.`,
    lines: ['rLoop'],
    level: 2,
    vars: vars(),
    extra: { op: 'rotate', heading, guide: 'middle' },
  };
  for (let i = 0; i < n; i++)
    for (let j = 0; j < Math.floor(n / 2); j++) {
      const x = m[i]![j]!.value;
      const y = m[i]![n - 1 - j]!.value;
      swap([i, j], [i, n - 1 - j]);
      yield {
        state: state(),
        marks: [mark(cellId(i, j), 'active'), mark(cellId(i, n - 1 - j), 'active')],
        say: `Row ${i}: swap M[${i}][${j}] = ${x} and M[${i}][${n - 1 - j}] = ${y}.`,
        lines: ['rLoop', 'rSwap'],
        level: 2,
        vars: vars({ i, j }),
        extra: { op: 'rotate', heading, guide: 'middle' },
      };
    }
  return yield* rotateDone(state(), work, tot, heading, vars(), 'transpose');
}

function* rotateCopy(s: MatrixState, by: RotateBy): Gen {
  const n = s.m.length;
  const tot = rotateTotals(n, by);
  const work = new Work(UNITS);
  const m = copyRows(s);
  const b: (Cell | null)[][] = m.map((row) => row.map(() => null));
  const heading = 'rotate into a new matrix B';
  const state = (): MatrixState => ({ m: m.map((row) => [...row]), nextUid: s.nextUid });
  const vars = (more: Record<string, Scalar> = {}): Record<string, Scalar> => ({
    n,
    ...more,
    'extra cells': n * n,
    ...workVars(work, tot),
  });
  const extra = (): MatrixExtra => ({ op: 'rotate', heading, b: b.map((row) => [...row]) });
  yield {
    state: state(),
    marks: [],
    say: `Rotate into a new ${n} × ${n} matrix B: the value in row i, column j goes to row j, column ${n - 1} − i. That needs ${n * n} extra cells.`,
    lines: ['init'],
    level: 2,
    vars: vars(),
    extra: extra(),
  };
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const x = m[i]![j]!;
      b[j]![n - 1 - i] = x;
      m[i]![j] = { uid: 0, value: x.value, stale: true };
      work.add('reads');
      work.add('writes');
      yield {
        state: state(),
        marks: [mark(cellId(i, j), 'compare'), mark(`b-cell-${j}-${n - 1 - i}`, 'new')],
        say: `${at(i, j, x.value)} goes to B[${j}][${n - 1 - i}].`,
        lines: ['loop', 'copy'],
        level: 2,
        vars: vars({ i, j }),
        extra: extra(),
      };
    }
  // A now names the new matrix.
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) m[r]![c] = b[r]![c]!;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) b[r]![c] = null;
  return yield* rotateDone(state(), work, tot, heading, vars(), by, extra(), true);
}

function* rotateDone(
  s: MatrixState,
  work: Work,
  tot: Totals,
  heading: string,
  vars: Record<string, Scalar>,
  by: RotateBy,
  extra: MatrixExtra = { op: 'rotate', heading },
  copy = false,
): Gen {
  const n = s.m.length;
  const rings = 8 * ringSwaps(n);
  const other = copy
    ? by === 'layers'
      ? `Rotating in place by rings takes ${rings}, about the same, with one spare cell instead of ${n * n}: the gain is space, not time.`
      : `Transposing and reversing in place takes ${tot.pattern}, more than copying, but with one spare cell instead of ${n * n}.`
    : by === 'layers'
      ? `Copying into a new matrix takes ${tot.naive}, about the same, but needs ${n * n} extra cells.`
      : `Rings move each cell once, ${rings}; copying takes ${tot.naive} and ${n * n} extra cells.`;
  yield {
    state: s,
    marks: [],
    say: `${copy ? 'B is the rotated matrix, and now it is A. ' : 'Rotated. '}The first row is now ${s.m[0]!.map((x) => x.value).join(' ')}, the old first column read upward. That took ${work.tally()}. ${other}`,
    lines: ['ret'],
    level: 1,
    vars,
    extra: { ...extra, heading },
  };
  return s;
}

const spiral: Op = {
  label: 'Spiral order',
  arity: 0,
  *run(s, _args, { settings }) {
    return approachOf(settings) === 'naive' ? yield* spiralWalk(s) : yield* spiralBounds(s);
  },
};

const rotate: Op = {
  label: 'Rotate',
  arity: 0,
  *run(s, _args, { settings }) {
    const { rows, cols } = size(s);
    if (rows !== cols) {
      yield refuse(
        s,
        `Nothing rotated. Rotating in place needs a square matrix, and this one is ${rows} × ${cols}. Load one such as 4x4.`,
      );
      return s;
    }
    if (approachOf(settings) === 'naive') return yield* rotateCopy(s, settings.rotate);
    return settings.rotate === 'transpose' ? yield* rotateTranspose(s) : yield* rotateRings(s);
  },
};

export const ops: Record<string, Op> = { spiral, rotate, load };

// ----- Pseudocode -----

const L = (id: string, indent: number, text: string, plain: string): PseudoLine => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: MatrixSettings): PseudoBlock[] {
  const naive = approachOf(settings) === 'naive';
  const spiralBlock: PseudoBlock = naive
    ? {
        op: 'spiral',
        lines: [
          L('sig', 0, 'spiralWalk(M)', 'To list the values of M in spiral order by walking:'),
          L(
            'init',
            1,
            'seen = m × n grid of false; r = c = 0; d = right',
            'Start at the top left facing right, with nothing seen.',
          ),
          L('loop', 1, 'repeat m · n times', 'For every cell:'),
          L('visit', 2, 'out.add(M[r][c]); seen[r][c] = true', 'visit it and mark it seen;'),
          L(
            'check',
            2,
            'if the next cell in d is off M or seen',
            'if the cell ahead is off the matrix or seen,',
          ),
          L('turn', 3, 'd = turn right', 'turn right;'),
          L('step', 2, '(r, c) = next cell in d', 'step forward.'),
          L('ret', 1, 'return out', 'Hand back the values in the order visited.'),
        ],
      }
    : {
        op: 'spiral',
        lines: [
          L('sig', 0, 'spiralOrder(M)', 'To list the values of M in spiral order:'),
          L(
            'init',
            1,
            'top = 0; bottom = m − 1; left = 0; right = n − 1',
            'The bounds start at the four edges.',
          ),
          L(
            'loop',
            1,
            'while top ≤ bottom and left ≤ right',
            'While some cell is inside the bounds:',
          ),
          L(
            'top',
            2,
            'for c = left to right: out.add(M[top][c])',
            'walk the top row, left to right,',
          ),
          L('incTop', 2, 'top = top + 1', 'and move top down;'),
          L(
            'right',
            2,
            'for r = top to bottom: out.add(M[r][right])',
            'walk the right column down,',
          ),
          L('decRight', 2, 'right = right − 1', 'and move right in;'),
          L('guardBottom', 2, 'if top ≤ bottom', 'if a row is left,'),
          L(
            'bottom',
            3,
            'for c = right downto left: out.add(M[bottom][c])',
            'walk the bottom row back,',
          ),
          L('decBottom', 3, 'bottom = bottom − 1', 'and move bottom up;'),
          L('guardLeft', 2, 'if left ≤ right', 'if a column is left,'),
          L(
            'left',
            3,
            'for r = bottom downto top: out.add(M[r][left])',
            'walk the left column up,',
          ),
          L('incLeft', 3, 'left = left + 1', 'and move left in.'),
          L('ret', 1, 'return out', 'Hand back the values in the order visited.'),
        ],
      };
  const rotateBlock: PseudoBlock = naive
    ? {
        op: 'rotate',
        lines: [
          L(
            'sig',
            0,
            'rotateCopy(M)',
            'To turn the n × n matrix M a quarter turn clockwise, into a copy:',
          ),
          L('init', 1, 'B = new n × n matrix', 'Make a new matrix B.'),
          L('loop', 1, 'for i = 0 to n − 1, j = 0 to n − 1', 'For every cell of M,'),
          L(
            'copy',
            2,
            'B[j][n − 1 − i] = M[i][j]',
            'row i, column j goes to row j, column n − 1 − i of B.',
          ),
          L('ret', 1, 'return B', 'B is the rotated matrix.'),
        ],
      }
    : settings.rotate === 'transpose'
      ? {
          op: 'rotate',
          lines: [
            L(
              'sig',
              0,
              'rotate(M)   // transpose, then reverse rows',
              'To turn the n × n matrix M a quarter turn clockwise, in place:',
            ),
            L('init', 1, '// transpose', 'First swap across the diagonal:'),
            L(
              'tLoop',
              1,
              'for i = 0 to n − 1, j = i + 1 to n − 1',
              'for each cell above the diagonal,',
            ),
            L('tSwap', 2, 'swap M[i][j] and M[j][i]', 'swap it with its mirror below.'),
            L(
              'rLoop',
              1,
              'for i = 0 to n − 1, j = 0 to ⌊n/2⌋ − 1',
              'Then for each row, from both ends to the middle,',
            ),
            L(
              'rSwap',
              2,
              'swap M[i][j] and M[i][n − 1 − j]',
              'swap the two values, reversing the row.',
            ),
            L('ret', 1, 'return M', 'M is rotated.'),
          ],
        }
      : {
          op: 'rotate',
          lines: [
            L(
              'sig',
              0,
              'rotate(M)   // ring by ring',
              'To turn the n × n matrix M a quarter turn clockwise, in place:',
            ),
            L('init', 1, 'for layer = 0 to ⌊n/2⌋ − 1', 'For each ring, from the outside in,'),
            L(
              'layer',
              2,
              'first = layer; last = n − 1 − layer',
              'whose rows and columns run from first to last,',
            ),
            L('cycle', 2, 'for k = 0 to last − first − 1', 'and for each position along a side:'),
            L('save', 3, 'tmp = M[first][first + k]', 'keep the top value aside;'),
            L(
              'moveLeft',
              3,
              'M[first][first + k] = M[last − k][first]',
              'move the left value to the top,',
            ),
            L(
              'moveBottom',
              3,
              'M[last − k][first] = M[last][last − k]',
              'the bottom value to the left,',
            ),
            L(
              'moveRight',
              3,
              'M[last][last − k] = M[first + k][last]',
              'the right value to the bottom,',
            ),
            L('moveTop', 3, 'M[first + k][last] = tmp', 'and the top value to the right.'),
            L('ret', 1, 'return M', 'M is rotated.'),
          ],
        };
  return [spiralBlock, rotateBlock];
}

// ----- Start -----

export function describe(s: MatrixState): string {
  const { rows, cols } = size(s);
  return `A ${rows} × ${cols} matrix M, by rows: ${s.m.map((row) => row.map((x) => (x.stale ? `(old ${x.value})` : x.value)).join(' ')).join('; ')}.`;
}

export function initialSay(s: MatrixState): string {
  const { rows, cols } = size(s);
  return `M is a ${rows} × ${cols} matrix holding 1 to ${rows * cols}. Press Spiral order to walk it clockwise from the outside in, or Rotate to turn it a quarter turn clockwise. Load another, such as 3x5 or 1 2 3 / 4 5 6.`;
}

export const initialVars = sizeVars;
