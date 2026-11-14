/**
 * Paths on a grid. A robot starts in the top left cell (0, 0) and moves only right or down to
 * the bottom right cell; some cells are walls. Two questions on the same grid (a setting):
 *
 * - count: how many paths reach the target? P[r][c] = P[r − 1][c] + P[r][c − 1], with
 *   P[0][0] = 1, and 0 for a wall or outside the grid.
 * - mincost: every open cell has a cost (0 to 9); what is the cheapest path, adding the cost of
 *   every cell it enters, the start's included? M[r][c] = cost + min(M[r − 1][c], M[r][c − 1]),
 *   with M[0][0] = its cost, and ∞ for a wall or outside the grid. The path is traced back from
 *   the target: from each cell to the neighbour above or to the left it came from (a tie goes
 *   up).
 *
 * Each cell needs only the one above and the one to its left. The naive approach is plain
 * recursion on that rule from the target: nothing is stored, so a cell is worked out again
 * every time a later cell asks for it, once per path from it to the target. The pattern is the
 * table, filled bottom-up row by row (the default), or top-down with a memo: the same recursion,
 * remembering each answer. Work units (../_dp2/kit.ts): `calls` and `cells`.
 */
import type { Mark, MarkRole, OpSpec, PseudoBlock, PseudoLine, Scalar, Step, Value } from '../../engine/types';
import { approachOf, workVars, type Approach, type Totals } from '../_patterns/kit';
import { copy2, dpWork, fmt, nthTime, zeros } from '../_dp2/kit';

export const MAX_ROWS = 5;
export const MAX_COLS = 6;
/** The cost stored for a wall. */
export const WALL = -1;

export type Problem = 'count' | 'mincost';
export type Fill = 'bottomup' | 'memo';

export interface GPSettings {
  [key: string]: Scalar;
  approach: Approach;
  problem: Problem;
  fill: Fill;
}

export const defaults: GPSettings = { approach: 'pattern', problem: 'count', fill: 'bottomup' };

/** A cell: [row, column]. */
export type Cell = readonly [r: number, c: number];

export interface GPState {
  /** Each cell's cost, row by row: 0 to 9, or WALL. */
  grid: number[][];
  /** The table, P (count) or M (mincost); null where not filled. ∞ means no way in. */
  T: (number | null)[][];
}

export interface GPExtra {
  /** Recursion: how many calls each cell has had so far. */
  calls?: number[][];
  /** Plain recursion: what each cell's last call returned. Nothing is stored; this is shown. */
  seen?: (number | null)[][];
  /** Recursion: the cells of the calls on the stack, outermost (the target) first. */
  stack?: Cell[];
  /** The cells a value was just made from, and whether each one won (for the cheaper one). */
  reads?: { from: Cell; to: Cell; win: boolean }[];
  /** The path traced back so far, from the target. */
  path?: Cell[];
}

type S = GPState;
type X = GPExtra;
export type GPStep = Step<S, X>;
type Op = OpSpec<S, GPSettings, X>;
type Gen = Generator<GPStep, S, void>;

/** The grid the page starts with: 4 x 5, two walls. Costs matter only for the cheapest path. */
export const START_TEXT = '13121/2#311/1123#/41211';

const mark = (id: string, role: MarkRole): Mark => ({ id, role });
export const cellId = (r: number, c: number) => `cell-${r}-${c}`;
const at = (cell: Cell) => cellId(cell[0], cell[1]);

export const rows = (s: S) => s.grid.length;
export const cols = (s: S) => s.grid[0]?.length ?? 0;
export const isWall = (grid: number[][], r: number, c: number) => grid[r]![c] === WALL;
export const emptyTable = (grid: number[][]): (number | null)[][] =>
  grid.map((row) => row.map(() => null));

// ----- Input -----

const HOW =
  'Type the rows split by /, one character per cell: a digit 0 to 9 is a cost, . is an open cell of cost 1, # is a wall. For example 11#/111/#11.';

/** Read a grid, or say what is wrong with it. */
export function readGrid(arg: Value | undefined): number[][] | string {
  const text = String(arg ?? '').trim();
  if (!text) return HOW;
  const lines = text
    .split(/[/\n|]+/)
    .map((l) => l.replace(/[\s,]+/g, ''))
    .filter(Boolean);
  if (lines.length === 0) return HOW;
  if (lines.length > MAX_ROWS) return `That is ${lines.length} rows. Use at most ${MAX_ROWS}.`;
  const grid: number[][] = [];
  for (const [r, line] of lines.entries()) {
    if (line.length > MAX_COLS)
      return `Row ${r} has ${line.length} cells. Use at most ${MAX_COLS} in a row.`;
    const row: number[] = [];
    for (const ch of line) {
      if (/^\d$/.test(ch)) row.push(Number(ch));
      else if (ch === '.') row.push(1);
      else if (ch === '#' || ch === 'x' || ch === 'X') row.push(WALL);
      else return `"${ch}" is not a cell. ${HOW}`;
    }
    grid.push(row);
  }
  const width = grid[0]!.length;
  const odd = grid.findIndex((row) => row.length !== width);
  if (odd >= 0)
    return `Every row needs the same number of cells: row 0 has ${width} and row ${odd} has ${grid[odd]!.length}.`;
  if (grid[0]![0] === WALL || grid.at(-1)!.at(-1) === WALL)
    return 'The start (top left) and the target (bottom right) must be open cells, not walls.';
  return grid;
}

/** A grid as the input box takes it: "13#/111". */
export const gridText = (grid: number[][]): string =>
  grid.map((row) => row.map((v) => (v === WALL ? '#' : String(v))).join('')).join('/');

// ----- The recurrence, without steps (for totals, tests and practice) -----

/** The table filled bottom-up: P (count) or M (mincost). */
export function solveTable(grid: number[][], problem: Problem): number[][] {
  const R = grid.length;
  const C = grid[0]!.length;
  const count = problem === 'count';
  const T: number[][] = zeros(R, C);
  for (let r = 0; r < R; r++)
    for (let c = 0; c < C; c++) {
      if (isWall(grid, r, c)) T[r]![c] = count ? 0 : Infinity;
      else if (r === 0 && c === 0) T[r]![c] = count ? 1 : grid[0]![0]!;
      else {
        const up = r > 0 ? T[r - 1]![c]! : count ? 0 : Infinity;
        const left = c > 0 ? T[r]![c - 1]! : count ? 0 : Infinity;
        T[r]![c] = count ? up + left : grid[r]![c]! + Math.min(up, left);
      }
    }
  return T;
}

/** The cheapest path's cells from the start to the target, or null when none gets there. */
export function cheapestPath(grid: number[][], T: readonly (readonly (number | null)[])[]): Cell[] | null {
  const R = grid.length;
  const C = grid[0]!.length;
  const v = (r: number, c: number) => T[r]?.[c] ?? Infinity;
  if (v(R - 1, C - 1) === Infinity) return null;
  let r = R - 1;
  let c = C - 1;
  const back: Cell[] = [[r, c]];
  while (r > 0 || c > 0) {
    if (r > 0 && (c === 0 || v(r - 1, c) <= v(r, c - 1))) r--;
    else c--;
    back.push([r, c]);
  }
  return back.reverse();
}

/** Moves along a path, from the start: "D R R D". */
export function moves(path: readonly Cell[]): string[] {
  const out: string[] = [];
  for (let k = 1; k < path.length; k++) out.push(path[k]![0] > path[k - 1]![0] ? 'D' : 'R');
  return out;
}

/** Open neighbours a cell's value is made from: the one above, then the one to the left. */
export function sources(grid: number[][], r: number, c: number): Cell[] {
  const out: Cell[] = [];
  if (r > 0 && !isWall(grid, r - 1, c)) out.push([r - 1, c]);
  if (c > 0 && !isWall(grid, r, c - 1)) out.push([r, c - 1]);
  return out;
}

/** Calls plain recursion makes on each cell: one per path from that cell to the target. */
export function naiveCalls(grid: number[][]): number[][] {
  const R = grid.length;
  const C = grid[0]!.length;
  const k = zeros(R, C);
  k[R - 1]![C - 1] = 1;
  for (let r = R - 1; r >= 0; r--)
    for (let c = C - 1; c >= 0; c--) {
      if (isWall(grid, r, c) || (r === R - 1 && c === C - 1)) continue;
      // Each call on the cell below or to the right asks for this one (the start asks nobody,
      // and it is never below or to the right of a cell).
      const below = r + 1 < R && !isWall(grid, r + 1, c) ? k[r + 1]![c]! : 0;
      const right = c + 1 < C && !isWall(grid, r, c + 1) ? k[r]![c + 1]! : 0;
      k[r]![c] = below + right;
    }
  return k;
}

/** Top-down with a memo: the calls made and the cells filled. */
export function memoWork(grid: number[][]): { calls: number; cells: number } {
  const R = grid.length;
  const C = grid[0]!.length;
  const done = zeros(R, C);
  let calls = 0;
  let cells = 0;
  const visit = (r: number, c: number) => {
    calls++;
    if (done[r]![c]) return;
    for (const [pr, pc] of r === 0 && c === 0 ? [] : sources(grid, r, c)) visit(pr, pc);
    done[r]![c] = 1;
    cells++;
  };
  visit(R - 1, C - 1);
  return { calls, cells };
}

const sum2 = (g: number[][]) => g.reduce((a, row) => a + row.reduce((x, y) => x + y, 0), 0);

/** What each approach costs on this grid; the pattern's total follows the fill setting. */
export function totals(grid: number[][], fill: Fill): Totals {
  const naive = sum2(naiveCalls(grid));
  if (fill === 'memo') {
    const m = memoWork(grid);
    return { naive, pattern: m.calls + m.cells };
  }
  return { naive, pattern: grid.length * grid[0]!.length };
}

// ----- Text -----

export const name = (cell: Cell) => `(${cell[0]}, ${cell[1]})`;
const tableName = (p: Problem) => (p === 'count' ? 'P' : 'M');
const fnName = (p: Problem) => (p === 'count' ? 'paths' : 'cheapest');
const ref = (p: Problem, r: number, c: number) => `${tableName(p)}[${r}][${c}]`;
const call = (p: Problem, cell: Cell) => `${fnName(p)}(${cell[0]}, ${cell[1]})`;

/** How a cell's value is made from its sources, in words and numbers. */
function rule(
  p: Problem,
  grid: number[][],
  r: number,
  c: number,
  get: (cell: Cell) => number,
  form: (cell: Cell) => string,
): { value: number; text: string; win: Cell | null } {
  const src = sources(grid, r, c);
  const cost = grid[r]![c]!;
  if (p === 'count') {
    const value = src.reduce((a, cell) => a + get(cell), 0);
    if (src.length === 0)
      return { value: 0, text: 'no open cell above it or to its left, so 0 paths come in', win: null };
    if (src.length === 1) {
      const from = src[0]![0] < r ? 'above' : 'the left';
      return {
        value,
        text: `${form(src[0]!)} = ${value}: paths come in only from ${from}`,
        win: null,
      };
    }
    return {
      value,
      text: `${form(src[0]!)} + ${form(src[1]!)} = ${get(src[0]!)} + ${get(src[1]!)} = ${value}: the paths from above plus the paths from the left`,
      win: null,
    };
  }
  if (src.length === 0)
    return { value: Infinity, text: `${cost} + ∞ = ∞: no open cell above it or to its left, so no way in`, win: null };
  if (src.length === 1) {
    const v = get(src[0]!);
    const from = src[0]![0] < r ? 'above' : 'the left';
    return {
      value: cost + v,
      text: `${cost} + ${form(src[0]!)} = ${cost} + ${fmt(v)} = ${fmt(cost + v)}: the only way in is from ${from}`,
      win: v === Infinity ? null : src[0]!,
    };
  }
  const a = get(src[0]!);
  const b = get(src[1]!);
  const best = Math.min(a, b);
  const win = best === Infinity ? null : a <= b ? src[0]! : src[1]!;
  return {
    value: cost + best,
    text: `${cost} + min(${form(src[0]!)}, ${form(src[1]!)}) = ${cost} + min(${fmt(a)}, ${fmt(b)}) = ${fmt(cost + best)}${
      win === null
        ? ': no way in'
        : a === b
          ? ': a tie, so either way in costs the same'
          : `: the cheaper way in is from ${win[0] < r ? 'above' : 'the left'}`
    }`,
    win,
  };
}

function readsFor(src: Cell[], to: Cell, win: Cell | null, p: Problem): NonNullable<X["reads"]> {
  return src.map((from) => ({
    from,
    to,
    win: p === 'count' || (win !== null && from[0] === win[0] && from[1] === win[1]),
  }));
}

// ----- Steps -----

function refuse(s: S, why: string): GPStep {
  return { state: s, marks: [], say: why, lines: [], level: 1, vars: { rows: rows(s), cols: cols(s) } };
}

const load: Op = {
  label: 'Load grid',
  arity: 1,
  *run(s, [arg]) {
    const grid = readGrid(arg);
    if (typeof grid === 'string') {
      yield refuse(s, `The grid stays as it was. ${grid}`);
      return s;
    }
    const next: S = { grid, T: emptyTable(grid) };
    const walls = grid.flat().filter((v) => v === WALL).length;
    yield {
      state: next,
      marks: [],
      say: `A ${grid.length} × ${grid[0]!.length} grid with ${walls === 0 ? 'no walls' : walls === 1 ? 'one wall' : `${walls} walls`}: ${gridText(grid)}. Press Solve.`,
      lines: [],
      level: 1,
      vars: { rows: grid.length, cols: grid[0]!.length },
    };
    return next;
  },
};

/** The answer's vars: paths (count) or cost (mincost), "∞" when nothing gets there. */
const answerVars = (p: Problem, v: number): Record<string, Scalar> =>
  p === 'count' ? { paths: v } : { cost: v === Infinity ? '∞' : v };

const answerText = (p: Problem, v: number, R: number, C: number) =>
  p === 'count'
    ? `${v === 0 ? 'No path reaches' : v === 1 ? 'One path reaches' : `${v} paths reach`} the target (${R - 1}, ${C - 1})`
    : v === Infinity
      ? `No path reaches the target (${R - 1}, ${C - 1}): its cost is ∞`
      : `The cheapest path to the target (${R - 1}, ${C - 1}) costs ${v}`;

/** The pattern, bottom-up: row by row, left to right. */
function* bottomUp(s: S, settings: GPSettings): Gen {
  const p = settings.problem;
  const { grid } = s;
  const R = grid.length;
  const C = grid[0]!.length;
  const T = emptyTable(grid);
  const tot = totals(grid, 'bottomup');
  const work = dpWork();
  const state = (): S => ({ grid, T: copy2(T) });
  const vars = (r: number, c: number, extra: Record<string, Scalar> = {}) => ({
    r,
    c,
    ...extra,
    ...workVars(work, tot),
  });
  yield {
    state: state(),
    marks: [],
    say: `Fill ${tableName(p)} row by row, left to right. Each cell needs only the cell above it and the cell to its left, and both are filled by the time it comes up.`,
    lines: ['b.sig'],
    level: 2,
    vars: vars(0, 0),
  };
  for (let r = 0; r < R; r++)
    for (let c = 0; c < C; c++) {
      const here: Cell = [r, c];
      let say: string;
      let lines: string[];
      let reads: NonNullable<X['reads']> = [];
      if (isWall(grid, r, c)) {
        T[r]![c] = p === 'count' ? 0 : Infinity;
        say =
          p === 'count'
            ? `${name(here)} is a wall: no path goes through it, so ${ref(p, r, c)} = 0.`
            : `${name(here)} is a wall: there is no way in, so ${ref(p, r, c)} = ∞.`;
        lines = ['b.loop', 'b.wall'];
      } else if (r === 0 && c === 0) {
        T[0]![0] = p === 'count' ? 1 : grid[0]![0]!;
        say =
          p === 'count'
            ? `${name(here)} is the start: one path, the one that has not moved yet. ${ref(p, 0, 0)} = 1.`
            : `${name(here)} is the start: the path pays its cost, so ${ref(p, 0, 0)} = ${grid[0]![0]}.`;
        lines = ['b.loop', 'b.start'];
      } else {
        const res = rule(p, grid, r, c, ([a, b]) => T[a]![b]!, ([a, b]) => ref(p, a, b));
        T[r]![c] = res.value;
        say = `${ref(p, r, c)} = ${res.text}.`;
        reads = readsFor(sources(grid, r, c), here, res.win, p);
        lines = ['b.loop', 'b.rule'];
      }
      work.add('cells');
      const rowDone = c === C - 1;
      if (rowDone && !(r === R - 1)) say += ` Row ${r} is done.`;
      yield {
        state: state(),
        marks: [mark(cellId(r, c), 'active'), ...reads.map((x) => mark(at(x.from), 'compare'))],
        say,
        lines,
        level: rowDone && r < R - 1 ? 1 : 2,
        vars: vars(r, c, { [tableName(p)]: fmt(T[r]![c]!) }),
        extra: { reads },
      };
    }
  const end = state();
  const v = T[R - 1]![C - 1]!;
  yield {
    state: end,
    marks: [mark(cellId(R - 1, C - 1), 'found')],
    say: `${answerText(p, v, R, C)}. The table filled each of the ${R * C} cells once; plain recursion would make ${tot.naive} calls.${p === 'mincost' && v !== Infinity ? ' Press Trace the path to see it.' : ''}`,
    lines: ['b.ret'],
    level: 1,
    vars: { rows: R, cols: C, ...answerVars(p, v), ...workVars(work, tot) },
  };
  return end;
}

/**
 * The recursion from the target, plain or with a memo. Plain: nothing is kept, and `seen` only
 * shows what each cell's last call returned. Memo: each answer goes into T, and a call on a
 * filled cell returns it at once.
 */
function* recursion(s: S, settings: GPSettings, memo: boolean): Gen {
  const p = settings.problem;
  const { grid } = s;
  const R = grid.length;
  const C = grid[0]!.length;
  const T = emptyTable(grid);
  const seen: (number | null)[][] = emptyTable(grid);
  const calls = zeros(R, C);
  const stack: Cell[] = [];
  const tot = totals(grid, memo ? 'memo' : settings.fill);
  const work = dpWork();
  const state = (): S => (memo ? { grid, T: copy2(T) } : s);
  const extra = (more: X = {}): X => ({
    calls: copy2(calls),
    ...(memo ? {} : { seen: copy2(seen) }),
    stack: [...stack],
    ...more,
  });
  const vars = (cell: Cell, more: Record<string, Scalar> = {}) => ({
    r: cell[0],
    c: cell[1],
    depth: stack.length,
    ...more,
    ...workVars(work, tot),
  });
  const P = memo ? 'm' : 'n';

  yield {
    state: state(),
    marks: [],
    say: memo
      ? `Top-down with a memo: call ${call(p, [R - 1, C - 1])} on the target. Each call looks in the memo first, and stores its answer there before it returns, so no cell is worked out twice.`
      : `Plain recursion: call ${call(p, [R - 1, C - 1])} on the target. It asks for the cell above and the cell to the left, and they ask for theirs. Nothing is stored, so a cell is worked out again every time it is asked for. The corner of each cell counts its calls.`,
    lines: [`${P}.top`],
    level: 2,
    vars: vars([R - 1, C - 1]),
    extra: extra(),
  };

  function* visit(cell: Cell, caller: Cell | null): Generator<GPStep, number, void> {
    const [r, c] = cell;
    work.add('calls');
    calls[r]![c]!++;
    stack.push(cell);
    const k = calls[r]![c]!;
    const who = caller ? `${call(p, caller)} calls ${call(p, cell)}` : call(p, cell);
    const times = k > 1 ? `, ${nthTime(k)} for this cell` : '';
    if (memo && T[r]![c] !== null) {
      const v = T[r]![c]!;
      yield {
        state: state(),
        marks: [mark(cellId(r, c), 'found')],
        say: `${who}${times}. ${ref(p, r, c)} = ${fmt(v)} is already in the memo, so it returns ${fmt(v)} at once.`,
        lines: ['m.sig', 'm.hit'],
        level: 2,
        vars: vars(cell),
        extra: extra(),
      };
      stack.pop();
      return v;
    }
    if (r === 0 && c === 0) {
      const v = p === 'count' ? 1 : grid[0]![0]!;
      if (memo) {
        T[0]![0] = v;
        work.add('cells');
      } else seen[0]![0] = v;
      yield {
        state: state(),
        marks: [mark(cellId(0, 0), 'new')],
        say: `${who}${times}. ${name(cell)} is the start: ${
          p === 'count' ? 'one path' : `its cost, ${v}`
        }.${memo ? ` Store ${ref(p, 0, 0)} = ${v} and return it.` : ` Return ${v}.`}`,
        lines: [`${P}.sig`, `${P}.start`],
        level: 2,
        vars: vars(cell),
        extra: extra(),
      };
      stack.pop();
      return v;
    }
    const src = sources(grid, r, c);
    // Plain recursion forgets: the cell's last answer is wiped while it is worked out again.
    if (!memo) seen[r]![c] = null;
    yield {
      state: state(),
      marks: [mark(cellId(r, c), 'active')],
      say: `${who}${times}.${k > 1 && !memo ? ' Nothing was kept, so it starts over.' : ''} ${
        src.length === 0
          ? 'It has no open cell above it or to its left.'
          : `It asks for ${src.map((x) => call(p, x)).join(' and ')}.`
      }`,
      lines: [`${P}.sig`],
      level: 2,
      vars: vars(cell),
      extra: extra(),
    };
    const got = new Map<string, number>();
    for (const x of src) got.set(name(x), yield* visit(x, cell));
    const res = rule(p, grid, r, c, (x) => got.get(name(x))!, (x) => call(p, x));
    if (memo) {
      T[r]![c] = res.value;
      work.add('cells');
    } else seen[r]![c] = res.value;
    const reads = readsFor(src, cell, res.win, p);
    yield {
      state: state(),
      marks: [mark(cellId(r, c), 'new'), ...reads.map((x) => mark(at(x.from), 'compare'))],
      say: `Back in ${call(p, cell)}: ${res.text}.${memo ? ` Store ${ref(p, r, c)} = ${fmt(res.value)} in the memo and return it.` : ` Return ${fmt(res.value)}.`}`,
      lines: [`${P}.rule`],
      // Storing a cell is a unit of work (level 2); plain recursion's return is fine detail.
      level: memo ? 2 : 3,
      vars: vars(cell, { [fnName(p)]: fmt(res.value) }),
      extra: extra({ reads }),
    };
    stack.pop();
    return res.value;
  }

  const v = yield* visit([R - 1, C - 1], null);
  const end = state();
  const most = Math.max(...calls.flat());
  const busiest = calls.flatMap((row, r) => row.flatMap((k, c) => (k === most ? [[r, c] as Cell] : [])))[0]!;
  yield {
    state: end,
    marks: [mark(cellId(R - 1, C - 1), 'found')],
    say: memo
      ? `${answerText(p, v, R, C)}. With the memo: ${work.tally()}. Plain recursion would make ${tot.naive} calls.${p === 'mincost' && v !== Infinity ? ' Press Trace the path to see it.' : ''}`
      : `${answerText(p, v, R, C)}. Plain recursion made ${work.get('calls')} calls for ${R * C} cells: ${name(busiest)} alone was called ${most === 1 ? 'once' : `${most} times`}, once for every path from it to the target. The table fills each cell once.`,
    lines: [`${P}.top`],
    level: 1,
    vars: { rows: R, cols: C, ...answerVars(p, v), ...workVars(work, tot) },
    extra: extra({ stack: [] }),
  };
  return end;
}

const solve: Op = {
  label: 'Solve',
  arity: 0,
  *run(s, _args, { settings }) {
    if (approachOf(settings) === 'naive') return yield* recursion(s, settings, false);
    return settings.fill === 'memo' ? yield* recursion(s, settings, true) : yield* bottomUp(s, settings);
  },
};

const trace: Op = {
  label: 'Trace the path',
  arity: 0,
  *run(s, _args, { settings }) {
    const p = settings.problem;
    const R = rows(s);
    const C = cols(s);
    if (p === 'count') {
      yield refuse(
        s,
        'Counting adds up every path, so there is no one path to trace. Set Problem to the cheapest path, then Solve and trace.',
      );
      return s;
    }
    if (s.T[R - 1]![C - 1] === null) {
      yield refuse(
        s,
        approachOf(settings) === 'naive'
          ? 'Plain recursion keeps no table, so there is nothing to read the path from. Set Approach to the table, then Solve and trace.'
          : 'Solve first: the trace reads the filled table back from the target.',
      );
      return s;
    }
    const total = s.T[R - 1]![C - 1]!;
    if (total === Infinity) {
      yield {
        state: s,
        marks: [mark(cellId(R - 1, C - 1), 'error')],
        say: `M[${R - 1}][${C - 1}] = ∞: walls cut off the target, so there is no path to trace.`,
        lines: ['t.sig'],
        level: 1,
        vars: { cost: '∞', path: 'none' },
      };
      return s;
    }
    const v = (r: number, c: number) => s.T[r]?.[c] ?? Infinity;
    let r = R - 1;
    let c = C - 1;
    const path: Cell[] = [[r, c]];
    yield {
      state: s,
      marks: [mark(cellId(r, c), 'active')],
      say: `Start at the target: M[${r}][${c}] = ${total}. Each cell came from the cheaper of the cell above and the cell to its left, so walk back to it.`,
      lines: ['t.sig'],
      level: 2,
      vars: { r, c, cost: total },
      extra: { path: [...path] },
    };
    while (r > 0 || c > 0) {
      const up = r > 0 ? v(r - 1, c) : Infinity;
      const left = c > 0 ? v(r, c - 1) : Infinity;
      const goUp = r > 0 && (c === 0 || up <= left);
      const was: Cell = [r, c];
      if (goUp) r--;
      else c--;
      path.push([r, c]);
      const why =
        up === Infinity || left === Infinity
          ? `the only way in is from ${goUp ? 'above' : 'the left'}`
          : up === left
            ? `a tie, ${fmt(up)} each, so go up`
            : `${fmt(Math.min(up, left))} is less than ${fmt(Math.max(up, left))}`;
      yield {
        state: s,
        marks: [mark(cellId(r, c), 'active'), mark(at(was), 'found')],
        say: `From ${name(was)} go ${goUp ? 'up' : 'left'} to ${name([r, c])}, M = ${fmt(v(r, c))}: ${why}.`,
        lines: ['t.loop', goUp ? 't.up' : 't.left'],
        level: 2,
        vars: { r, c, cost: total },
        extra: { path: [...path] },
      };
    }
    const forward = [...path].reverse();
    const ms = moves(forward);
    yield {
      state: s,
      marks: forward.map((x) => mark(at(x), 'found')),
      say: `The cheapest path, from the start: ${ms.join(' ')} (D is down, R is right). It enters ${forward.length} cells, ${forward
        .map(([a, b]) => s.grid[a]![b]!)
        .join(' + ')} = ${total}.`,
      lines: ['t.ret'],
      level: 1,
      vars: { cost: total, path: ms.join(' ') },
      extra: { path: [...path] },
    };
    return s;
  },
};

export const ops: Record<string, Op> = { load, solve, trace };

// ----- Pseudocode -----

const L = (id: string, indent: number, text: string, plain: string): PseudoLine => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: GPSettings): PseudoBlock[] {
  const count = settings.problem !== 'mincost';
  const T = count ? 'P' : 'M';
  const f = count ? 'paths' : 'cheapest';
  const traceBlock: PseudoBlock = {
    op: 'trace',
    lines: [
      L('t.sig', 0, 'tracePath(M)', 'To find the cheapest path, start at the target:'),
      L('t.loop', 1, 'while (r, c) is not the start', 'until the walk reaches the start,'),
      L(
        't.up',
        2,
        'if M[r − 1][c] ≤ M[r][c − 1]: r = r − 1',
        'step up if the cell above is no dearer than the cell to the left;',
      ),
      L('t.left', 2, 'else: c = c − 1', 'otherwise step left.'),
      L('t.ret', 1, 'return the cells, start first', 'The cells walked, reversed, are the path.'),
    ],
  };
  const join = count
    ? { text: `${T}[r − 1][c] + ${T}[r][c − 1]`, plain: 'the paths from above plus the paths from the left' }
    : {
        text: `cost[r][c] + min(${T}[r − 1][c], ${T}[r][c − 1])`,
        plain: 'the cell’s cost plus the cheaper of the cell above and the cell to the left',
      };
  if (approachOf(settings) === 'naive' || settings.fill === 'memo') {
    const memo = approachOf(settings) !== 'naive';
    const P = memo ? 'm' : 'n';
    const callJoin = count
      ? { text: `${f}(r − 1, c) + ${f}(r, c − 1)`, plain: 'ask for the paths into the cell above and into the cell to the left, and add them' }
      : {
          text: `cost[r][c] + min(${f}(r − 1, c), ${f}(r, c − 1))`,
          plain: 'ask for the cheapest way into the cell above and into the cell to the left, and add this cell’s cost to the cheaper',
        };
    return [
      {
        op: 'solve',
        lines: [
          L(
            `${P}.top`,
            0,
            `answer = ${f}(R − 1, C − 1)${memo ? '   // memo starts empty' : ''}`,
            memo ? 'Start with an empty memo and ask for the target.' : 'Ask for the target.',
          ),
          L(
            `${P}.sig`,
            0,
            `${f}(r, c)`,
            count ? 'To count the paths into cell (r, c):' : 'To find the cheapest way into cell (r, c):',
          ),
          ...(memo
            ? [L('m.hit', 1, `if ${T}[r][c] is filled: return ${T}[r][c]`, 'if the memo has it, hand it back at once;')]
            : []),
          L(
            `${P}.start`,
            1,
            `if (r, c) = (0, 0): return ${count ? '1' : 'cost[0][0]'}`,
            count ? 'the start has one path;' : 'the start costs its own cost;',
          ),
          L(
            `${P}.rule`,
            1,
            memo ? `${T}[r][c] = ${callJoin.text}; return it` : `return ${callJoin.text}`,
            `otherwise ${callJoin.plain}${count ? ' (0 for a wall or the edge)' : ' (∞ for a wall or the edge)'}${memo ? ', store it and hand it back' : ''}.`,
          ),
        ],
      },
      traceBlock,
    ];
  }
  return [
    {
      op: 'solve',
      lines: [
        L('b.sig', 0, `fill(grid)`, `To fill ${T} for the whole grid:`),
        L('b.loop', 1, 'for r = 0 to R − 1, for c = 0 to C − 1', 'row by row, left to right:'),
        L('b.wall', 2, `if (r, c) is a wall: ${T}[r][c] = ${count ? '0' : '∞'}`, count ? 'a wall lets no path through;' : 'a wall has no way in;'),
        L('b.start', 2, `else if (r, c) = (0, 0): ${T}[r][c] = ${count ? '1' : 'cost[0][0]'}`, count ? 'the start has one path;' : 'the start costs its own cost;'),
        L(
          'b.rule',
          2,
          `else: ${T}[r][c] = ${join.text}`,
          `any other cell is ${join.plain}${count ? ' (0 off the grid)' : ' (∞ off the grid)'}.`,
        ),
        L('b.ret', 1, `return ${T}[R − 1][C − 1]`, 'The target’s cell is the answer.'),
      ],
    },
    traceBlock,
  ];
}

// ----- Start -----

export function init(): S {
  const grid = readGrid(START_TEXT) as number[][];
  return { grid, T: emptyTable(grid) };
}

export function describe(s: S, settings?: GPSettings): string {
  const p = settings?.problem ?? 'count';
  const cellsText = s.grid
    .map(
      (row, r) =>
        `row ${r}: ${row
          .map((v, c) => {
            if (v === WALL) return 'wall';
            const t = s.T[r]![c];
            const cost = p === 'mincost' ? `cost ${v}` : 'open';
            return t === null || t === undefined ? cost : `${cost}, ${tableName(p)} ${fmt(t)}`;
          })
          .join('; ')}`,
    )
    .join('. ');
  return `A ${rows(s)} by ${cols(s)} grid, from (0, 0) to (${rows(s) - 1}, ${cols(s) - 1}). ${cellsText}.`;
}

export function initialSay(s: S, settings: GPSettings): string {
  return settings.problem === 'mincost'
    ? `Move only right or down from the top left to the bottom right, paying each cell’s cost. # is a wall. Press Solve for the cheapest path, or type a grid and press Load grid.`
    : `Move only right or down from the top left to the bottom right; # is a wall. Press Solve to count the paths, or type a grid and press Load grid.`;
}

export const initialVars = (s: S) => ({ rows: rows(s), cols: cols(s) });
