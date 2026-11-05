/**
 * What the grid pages share (grid-bfs, a-star): the grid, reading it from text, the start grid,
 * cell names, neighbours, the `load` operation and the presets. Drawing lives in
 * src/layouts/grid.ts. This folder has no index.ts, so the registry does not treat it as a page.
 *
 * A grid is typed as rows of cells: `.` open, `#` wall, `S` the start and `T` the target, with
 * rows separated by spaces, slashes or commas: "S..# .#.. ...T". Both pages have the same
 * operations, so compare mode can put them side by side on the same grid: `load` (the grid
 * text, the primary button) and `run` (no value).
 *
 * Cells are named like a spreadsheet: column letter, then row number, so the top-left cell is
 * A1 and the cell below it is A2. Cells are numbered k = r * cols + c in the runs.
 */
import type { Rng } from '../../engine/rng';
import type { Controls, OpCall, OpSpec, Scalar, Step, Value } from '../../engine/types';

export interface Grid {
  /** One string per row, of '.', '#', 'S' and 'T'. */
  lines: string[];
}

export interface GridState {
  grid: Grid;
}

export const MAX_ROWS = 10;
export const MAX_COLS = 14;
export const MAX_INPUT = 200;

/**
 * Where both pages start: a wall between S and T with a way around below it. BFS fills the
 * grid ring by ring; A* with the Manhattan distance heads for T and works around the wall.
 */
export const START_LINES = [
  '...........',
  '.S.....#...',
  '.......#...',
  '...#...#.T.',
  '...#...#...',
  '...#####...',
  '...........',
];
export const START_TEXT = START_LINES.join(' ');

export const rowsOf = (g: Grid) => g.lines.length;
export const colsOf = (g: Grid) => g.lines[0]!.length;
export const isWall = (g: Grid, r: number, c: number) => g.lines[r]![c] === '#';

export function find(g: Grid, ch: 'S' | 'T'): number {
  const cols = colsOf(g);
  for (let r = 0; r < g.lines.length; r++) {
    const c = g.lines[r]!.indexOf(ch);
    if (c >= 0) return r * cols + c;
  }
  return -1;
}

export const startOf = (g: Grid) => find(g, 'S');
export const targetOf = (g: Grid) => find(g, 'T');

export const rc = (g: Grid, k: number): [number, number] => [
  Math.floor(k / colsOf(g)),
  k % colsOf(g),
];

/** A, B, ... then the row number from 1: the top-left cell is A1. */
export function cellName(g: Grid, k: number): string {
  const [r, c] = rc(g, k);
  return `${String.fromCharCode(65 + c)}${r + 1}`;
}

export const names = (g: Grid, ks: readonly number[]) => ks.map((k) => cellName(g, k));

/** "A, B and C". */
export function listWords(xs: readonly string[]): string {
  if (xs.length <= 1) return xs[0] ?? '';
  return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
}

export const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

export type Moves = '4' | '8';

/** Clockwise from north: N, E, S, W, or N, NE, E, SE, S, SW, W, NW. */
const DIRS4: [number, number][] = [
  [-1, 0],
  [0, 1],
  [1, 0],
  [0, -1],
];
const DIRS8: [number, number][] = [
  [-1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, -1],
];

/** The open neighbours of cell k, clockwise from north. */
export function neighbours(g: Grid, k: number, moves: Moves): number[] {
  const [r, c] = rc(g, k);
  const rows = rowsOf(g);
  const cols = colsOf(g);
  const out: number[] = [];
  for (const [dr, dc] of moves === '8' ? DIRS8 : DIRS4) {
    const nr = r + dr;
    const nc = c + dc;
    if (nr < 0 || nc < 0 || nr >= rows || nc >= cols || isWall(g, nr, nc)) continue;
    out.push(nr * cols + nc);
  }
  return out;
}

export const openCount = (g: Grid) => g.lines.join('').replace(/#/g, '').length;

// ----- Reading a grid -----

const HOW = 'Use . for open, # for a wall, S for the start and T for the target.';
const EXAMPLE = 'S..# .#.. ...T';

/** A grid from text, or a sentence saying what is wrong. */
export function parseGrid(raw: Value | undefined): Grid | string {
  const t = String(raw ?? '').trim();
  if (!t)
    return `Type a grid, one row at a time with spaces between rows, such as ${EXAMPLE}. ${HOW}`;
  const lines = t
    .split(/[\s/,;|]+/)
    .filter(Boolean)
    .map((l) => l.replace(/[sStT]/g, (ch) => ch.toUpperCase()));
  if (lines.length > MAX_ROWS)
    return `That is ${lines.length} rows. Keep it to ${MAX_ROWS}, so every cell stays readable.`;
  for (let r = 0; r < lines.length; r++) {
    const bad = /[^.#ST]/.exec(lines[r]!);
    if (bad) return `"${bad[0]}" in row ${r + 1} is not a cell. ${HOW}`;
  }
  const width = lines[0]!.length;
  if (width > MAX_COLS)
    return `Row 1 has ${width} cells. Keep rows to ${MAX_COLS} cells, so every cell stays readable.`;
  const odd = lines.findIndex((l) => l.length !== width);
  if (odd >= 0)
    return `Row ${odd + 1} has ${plural(lines[odd]!.length, 'cell')}, but row 1 has ${width}. Every row needs the same number of cells.`;
  const all = lines.join('');
  const count = (ch: string) => all.split(ch).length - 1;
  if (count('S') !== 1)
    return count('S') === 0
      ? `The grid needs a start: put one S in it.`
      : `The grid has ${count('S')} S cells. Put exactly one start in it.`;
  if (count('T') !== 1)
    return count('T') === 0
      ? `The grid needs a target: put one T in it.`
      : `The grid has ${count('T')} T cells. Put exactly one target in it.`;
  return { lines };
}

export const gridText = (g: Grid) => g.lines.join(' ');

/** For the input box: the grid in its plain form, rows separated by spaces. */
export function parseGridInput(token: string): Value | Error {
  const r = parseGrid(token);
  return typeof r === 'string' ? new Error(r) : gridText(r);
}

export function gridInput(sample = 'S...# .##.. ....T'): NonNullable<Controls['input']> {
  return {
    label: 'Grid',
    placeholder: 'rows of . # S T, e.g. S..# .#.. ...T',
    maxLength: MAX_INPUT,
    sample,
    parse: parseGridInput,
  };
}

export const loadCall = (g: Grid | string[]): ['load', string] => [
  'load',
  Array.isArray(g) ? g.join(' ') : gridText(g),
];

export const startGrid = (): Grid => ({ lines: [...START_LINES] });

export function gridVars(g: Grid): Record<string, Scalar> {
  return { rows: rowsOf(g), cols: colsOf(g), open: openCount(g) };
}

export function describeGrid(g: Grid): string {
  const walls = rowsOf(g) * colsOf(g) - openCount(g);
  return `A grid of ${rowsOf(g)} rows and ${colsOf(g)} columns with ${plural(walls, 'wall')}. The start S is at ${cellName(g, startOf(g))} and the target T at ${cellName(g, targetOf(g))}.`;
}

/** The `load` operation both pages have. */
export function loadOp<S extends GridState, Set, X>(o: {
  make(grid: Grid, old: S): S;
  ready: string;
}): OpSpec<S, Set, X> {
  return {
    label: 'Load',
    arity: 1,
    *run(s, [arg]) {
      const r = parseGrid(arg);
      if (typeof r === 'string') {
        yield {
          state: s,
          marks: [],
          say: `Nothing loaded. ${r} The grid stays as it was.`,
          lines: [],
          level: 1,
          vars: gridVars(s.grid),
        } satisfies Step<S, X>;
        return s;
      }
      const next = o.make(r, s);
      yield {
        state: next,
        marks: [],
        say: `Loaded ${describeGrid(r).replace(/^A grid/, 'a grid')} ${o.ready}`,
        lines: [],
        level: 1,
        vars: gridVars(r),
      } satisfies Step<S, X>;
      return next;
    },
  };
}

// ----- Breadth-first search, as a plain reference (tests, presets, practice) -----

/** Distances in moves from the start (-1: not reachable). */
export function bfsDistances(g: Grid, moves: Moves): number[] {
  const n = rowsOf(g) * colsOf(g);
  const d = Array<number>(n).fill(-1);
  const s = startOf(g);
  d[s] = 0;
  const q = [s];
  for (let i = 0; i < q.length; i++) {
    const u = q[i]!;
    for (const v of neighbours(g, u, moves)) {
      if (d[v] === -1) {
        d[v] = d[u]! + 1;
        q.push(v);
      }
    }
  }
  return d;
}

// ----- Grids for presets and practice -----

function blank(rows: number, cols: number, fill: string): string[][] {
  return Array.from({ length: rows }, () => Array<string>(cols).fill(fill));
}

const toGrid = (cells: string[][]): Grid => ({ lines: cells.map((r) => r.join('')) });

/** Columns for a preset of `rows` rows: wider than tall, up to MAX_COLS. */
export const colsFor = (rows: number) => Math.min(MAX_COLS, Math.round(rows * 1.4));

/** Random walls (about `density` of the cells), with S on the left and T on the right. */
export function randomGrid(rng: Rng, rows: number, cols: number, density = 0.25): Grid {
  for (let tries = 0; ; tries++) {
    const cells = blank(rows, cols, '.');
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) if (rng.next() < density) cells[r]![c] = '#';
    cells[rng.int(0, rows - 1)]![rng.int(0, Math.max(0, Math.floor(cols / 4) - 1))] = 'S';
    cells[rng.int(0, rows - 1)]![rng.int(Math.ceil((3 * cols) / 4), cols - 1)] = 'T';
    const g = toGrid(cells);
    // A few tries for one where T can be reached; then whatever came out.
    if (tries > 30 || bfsDistances(g, '4')[targetOf(g)]! >= 0) return g;
  }
}

/** No walls: S and T in opposite corners. */
export function openGrid(rows: number, cols: number): Grid {
  const cells = blank(rows, cols, '.');
  cells[0]![0] = 'S';
  cells[rows - 1]![cols - 1] = 'T';
  return toGrid(cells);
}

/** A wall down the middle with one gap, at a random height. */
export function gapGrid(rng: Rng, rows: number, cols: number): Grid {
  const cells = blank(rows, cols, '.');
  const mid = Math.floor(cols / 2);
  const gap = rng.int(0, rows - 1);
  for (let r = 0; r < rows; r++) if (r !== gap) cells[r]![mid] = '#';
  cells[Math.floor(rows / 2)]![0] = 'S';
  cells[Math.floor(rows / 2)]![cols - 1] = 'T';
  return toGrid(cells);
}

/** T walled in: no path at all. */
export function closedGrid(rng: Rng, rows: number, cols: number): Grid {
  const g = randomGrid(rng, rows, cols, 0.15);
  const cells = g.lines.map((l) => [...l]);
  const [tr, tc] = rc(g, targetOf(g));
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++) {
      const r = tr + dr;
      const c = tc + dc;
      if ((dr || dc) && r >= 0 && c >= 0 && r < rows && c < cols) cells[r]![c] = '#';
    }
  return toGrid(cells);
}

/** A maze of corridors one cell wide, carved by a randomized depth-first search. */
export function mazeGrid(rng: Rng, rows: number, cols: number): Grid {
  const cells = blank(rows, cols, '#');
  const rMax = rows - 1 - ((rows - 1) % 2);
  const cMax = cols - 1 - ((cols - 1) % 2);
  const stack: [number, number][] = [[0, 0]];
  cells[0]![0] = '.';
  while (stack.length) {
    const [r, c] = stack[stack.length - 1]!;
    const next = (
      [
        [r - 2, c],
        [r, c + 2],
        [r + 2, c],
        [r, c - 2],
      ] as [number, number][]
    ).filter(([nr, nc]) => nr >= 0 && nc >= 0 && nr <= rMax && nc <= cMax && cells[nr]![nc] === '#');
    if (!next.length) {
      stack.pop();
      continue;
    }
    const [nr, nc] = next[rng.int(0, next.length - 1)]!;
    cells[(r + nr) / 2]![(c + nc) / 2] = '.';
    cells[nr]![nc] = '.';
    stack.push([nr, nc]);
  }
  cells[0]![0] = 'S';
  cells[rMax]![cMax] = 'T';
  return toGrid(cells);
}

/** The presets both pages offer. `then` adds the page's run. */
export function gridPresets(then: OpCall[]): NonNullable<Controls['presets']> {
  const with_ = (g: Grid): OpCall[] => [loadCall(g), ...then];
  return [
    { label: 'Random walls', make: (rng, size) => with_(randomGrid(rng, size, colsFor(size))) },
    { label: 'A maze', make: (rng, size) => with_(mazeGrid(rng, size + 1, colsFor(size) + 1)) },
    { label: 'Open field (best case)', make: (_rng, size) => with_(openGrid(size, colsFor(size))) },
    { label: 'A wall with one gap', make: (rng, size) => with_(gapGrid(rng, size, colsFor(size))) },
    {
      label: 'No way through (worst case)',
      make: (rng, size) => with_(closedGrid(rng, size, colsFor(size))),
    },
  ];
}

