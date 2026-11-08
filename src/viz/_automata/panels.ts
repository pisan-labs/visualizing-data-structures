/**
 * The drawing around a state diagram, shared by the automata pages: the input as a tape, the
 * accept or reject badge, a batch test's table, a table with one row per state, and the choice
 * of how to arrange a diagram with its panels on the stage (pickBest, for choosing among whole
 * arrangements, is in src/layouts/arrange.ts).
 *
 *   faScene(a, opts, stage, nominal, block)  the diagram across or down, whichever draws larger
 *                                             with a block of the nominal size, and the block
 *                                             placed beside or under it (placePanels)
 *   stack(parts)                              panels stacked top to bottom, as one block
 *   drawInputTape, drawVerdict, drawTestTable the run's panels; describeTest for screen readers
 *   drawGrid(shapes, o), gridWidths(columns)  a table, one row per state, room kept for rows
 */
import type { MarkRole, StageSize } from '../../engine/types';
import { onStage } from '../../layouts/arrange';
import { drawAutomaton, layoutStates, type DrawOptions } from '../../layouts/automaton';
import { below, padBounds, placePanels, textWidth, unionBounds } from '../../layouts/graph';
import { CELL_W, drawTape, tapeWindow } from '../../layouts/tape';
import type { Bounds, Shape } from '../../render/scene';
import type { Automaton } from './automaton';
import { automatonKey, plural, wordText, type Verdict } from './page';

const BADGE_H = 30;
const GAP = 14;

/** Tape cells shown at most; a longer word scrolls under the head. */
export const TAPE_CELLS = 12;

export interface TapeView {
  word: string;
  /** Symbols read so far (greyed). */
  read: number;
  /** The head's cell, or null for none. */
  head: number | null;
  headLabel?: string;
  /** Reserve room for a word this long, so the block keeps its size through a batch. */
  room: number;
  roles: ReadonlyMap<string, MarkRole>;
}

/** Cells the tape shows for a word of this length: the word and one cell past its end. */
export const tapeCells = (n: number): number => Math.min(n + 1, TAPE_CELLS);

/**
 * The input as a tape: the word, then one empty cell where the head stops when the input runs
 * out. A word longer than the tape scrolls in half-tape steps, and near its end the window
 * stops at that empty cell with all its cells, so the tape never shrinks.
 */
export function drawInputTape(out: Shape[], x: number, y: number, t: TapeView): Bounds {
  const n = t.word.length;
  const win = tapeWindow(t.head ?? n, TAPE_CELLS, { lo: 0, hi: n });
  const b = drawTape(out, {
    x,
    y,
    cells: [...t.word],
    from: win.from,
    to: win.to,
    head: t.head,
    headLabel: t.headLabel,
    read: t.read,
    roles: t.roles,
    blank: ' ',
  });
  return { x, y, w: Math.max(b.w, tapeCells(t.room) * CELL_W), h: b.h };
}

export const verdictId = 'verdict';

/** The accept or reject badge, with its room kept when there is no verdict yet. */
export function drawVerdict(
  out: Shape[],
  x: number,
  y: number,
  verdict: Verdict | undefined,
  roles: ReadonlyMap<string, MarkRole>,
): Bounds {
  const w = 96;
  if (verdict) {
    const role = roles.get(verdictId) ?? (verdict === 'accept' ? 'found' : 'error');
    out.push({ kind: 'rect', id: verdictId, x, y, w, h: BADGE_H, r: 15, cls: 'live', role });
    out.push({
      kind: 'text',
      id: `${verdictId}-t`,
      x: x + w / 2,
      y: y + BADGE_H / 2 + 6,
      text: verdict === 'accept' ? '✓ accept' : '✗ reject',
      size: 16,
      anchor: 'middle',
      weight: 'bold',
      role,
    });
  }
  return { x, y, w, h: BADGE_H };
}

export interface TestRow {
  word: string;
  expect: Verdict | null;
  /** What the machine did, once the row has been run. */
  got?: Verdict;
}

export interface TestTable {
  rows: TestRow[];
  /** The row being run, or -1 before the first and rows.length after the last. */
  at: number;
}

export const testRowId = (i: number): string => `test-${i}`;
export const rowOk = (r: TestRow): boolean | null =>
  r.got === undefined || r.expect === null ? null : r.got === r.expect;

const TEST_SIZE = 14;
const ROW_H = 24;

/** The batch: one row per word, with what it should give and what it gave. */
export function drawTestTable(
  out: Shape[],
  x: number,
  y: number,
  t: TestTable,
  roles: ReadonlyMap<string, MarkRole>,
): Bounds {
  const wordW =
    Math.max(
      textWidth('word', 13),
      ...t.rows.map((r) => textWidth(wordText(r.word), TEST_SIZE, true)),
    ) + 16;
  const verdictW = textWidth('expected', 13) + 14;
  const okW = 30;
  const cols = [
    { key: 'w', head: 'word', x, w: wordW },
    { key: 'e', head: 'expected', x: x + wordW + 4, w: verdictW },
    { key: 'g', head: 'got', x: x + wordW + verdictW + 8, w: verdictW },
    { key: 'ok', head: '', x: x + wordW + 2 * verdictW + 12, w: okW },
  ];
  const right = x + wordW + 2 * verdictW + 12 + okW;
  for (const c of cols)
    if (c.head)
      out.push({
        kind: 'text',
        id: `test-h-${c.key}`,
        x: c.x + 6,
        y: y + 15,
        text: c.head,
        size: 13,
        cls: 'label',
      });
  t.rows.forEach((r, i) => {
    const ry = y + 22 + i * (ROW_H + 4);
    const id = testRowId(i);
    const ok = rowOk(r);
    const role =
      roles.get(id) ?? (i === t.at ? 'active' : ok === false ? 'error' : ok ? 'found' : undefined);
    out.push({ kind: 'rect', id, x, y: ry, w: right - x, h: ROW_H, r: 4, cls: 'live', role });
    const textRole = role === 'error' || role === 'active' ? role : undefined;
    const cell = (key: string, text: string, mono = true) =>
      out.push({
        kind: 'text',
        id: `${id}-${key}`,
        x: cols.find((c) => c.key === key)!.x + 6,
        y: ry + ROW_H / 2 + 5,
        text,
        size: TEST_SIZE,
        mono,
        role: textRole,
        weight: key === 'w' ? 'bold' : undefined,
      });
    cell('w', wordText(r.word));
    cell('e', r.expect ?? '?');
    cell('g', r.got ?? '');
    cell('ok', ok === null ? '' : ok ? '✓' : '✗', false);
  });
  return { x, y, w: right - x, h: 22 + t.rows.length * (ROW_H + 4) - 4 };
}

/** A sentence about a batch, for screen readers. */
export function describeTest(t: TestTable): string {
  const rows = t.rows.map((r) => {
    const want = r.expect ? `should ${r.expect}` : 'no expectation';
    const got = r.got ? `, ${r.got}ed${rowOk(r) === false ? ', a mismatch' : ''}` : '';
    return `${wordText(r.word)} (${want}${got})`;
  });
  return `Test of ${plural(t.rows.length, 'word')}: ${rows.join('; ')}.`;
}

/** A block of panels stacked top to bottom, each drawn at (x, y) and returning its box. */
export function stack(
  parts: ((out: Shape[], x: number, y: number) => Bounds)[],
): (out: Shape[], x: number, y: number) => Bounds {
  return (out, x, y) => {
    const boxes: Bounds[] = [];
    let at = y;
    for (const p of parts) {
      const b = p(out, x, at);
      boxes.push(b);
      at = below(b, GAP);
    }
    return unionBounds(...boxes);
  };
}

/** The height a tape (with a label over its head) and a badge take together. */
export const RUN_BLOCK_H = 46 + 36 + GAP + BADGE_H;

/**
 * The state diagram, with a block of panels under it or beside it. The diagram runs across
 * (layers left to right) or down (top to bottom), whichever draws larger on the stage once a
 * block of the `nominal` size is placed, so the direction depends only on the machine and the
 * screen and stays put while runs come and go. With no stage (tests, thumbnails, practice
 * pictures) it runs across. The block itself goes wherever placePanels finds room.
 */
export function faScene(
  a: Automaton,
  opts: DrawOptions,
  stage: StageSize | undefined,
  nominal: { w: number; h: number },
  block?: (out: Shape[], x: number, y: number) => Bounds,
): { shapes: Shape[]; bounds: Bounds } {
  const across =
    !stage ||
    acrossFits(`fa|${automatonKey(a)}`, (dir) => drawAutomaton(a, layoutStates(a, dir)).bounds, {
      stage,
      nominal,
    });
  const d = drawAutomaton(a, layoutStates(a, across), opts);
  const shapes = [...d.shapes];
  const boxes = [d.bounds];
  if (block) boxes.push(placePanels(shapes, d.bounds, stage, block));
  return { shapes, bounds: padBounds(unionBounds(...boxes), 14) };
}

const acrossCache = new Map<string, boolean>();

/**
 * Does a diagram draw larger laid out across than down, once a block of the `nominal` size is
 * placed beside it by placePanels? `diagram(across)` gives the diagram's box either way; `key`
 * names the machine (prefixed by its kind) for the cache. Ties go across.
 */
export function acrossFits(
  key: string,
  diagram: (across: boolean) => Bounds,
  { stage, nominal }: { stage: StageSize | undefined; nominal: { w: number; h: number } },
): boolean {
  const full = `${stage ? `${stage.w}x${stage.h}` : '-'}|${nominal.w}x${nominal.h}|${key}`;
  const hit = acrossCache.get(full);
  if (hit !== undefined) return hit;
  const score = (across: boolean) => {
    const d = diagram(across);
    const b = placePanels([], d, stage, (_out, x, y) => ({ x, y, ...nominal }));
    return onStage(unionBounds(d, b), stage);
  };
  const out = score(true) >= score(false);
  if (acrossCache.size > 300) acrossCache.clear();
  acrossCache.set(full, out);
  return out;
}

// ---------------------------------------------------------------------------------------------
// A table, one row per state

export interface GridCell {
  text: string;
  role?: MarkRole;
  /** Faded: not worked out yet, or no longer counts. */
  dim?: boolean;
}

export interface GridOptions {
  /** Prefix for shape ids. */
  id: string;
  x: number;
  y: number;
  /**
   * One key per column, for ids: cell `${id}-${row}-${col}`, its text `-t`, and the header
   * `${id}--h-${col}` (a row key is never empty, so a header id never matches a cell's).
   */
  cols: string[];
  head: string[];
  /** Column widths; see gridWidths. */
  widths: number[];
  rows: { key: string; cells: GridCell[] }[];
  /** Keep room for this many rows, so the table's box stays the same as rows arrive. */
  reserve?: number;
  roles?: ReadonlyMap<string, MarkRole>;
}

export const GRID_ROW = 24;
const GRID_PITCH = GRID_ROW + 3;
const HEAD_H = 22;

/** Column widths that fit the longest text of each column (header included), in 14-unit mono. */
export function gridWidths(columns: string[][], min = 30): number[] {
  return columns.map((texts) =>
    Math.max(min, ...texts.map((t) => textWidth(t, t.length <= 3 ? 15 : 14, true) + 12)),
  );
}

export function drawGrid(shapes: Shape[], o: GridOptions): Bounds {
  const roles = o.roles ?? new Map<string, MarkRole>();
  const xs: number[] = [];
  let x = o.x;
  for (const w of o.widths) {
    xs.push(x);
    x += w + 3;
  }
  const width = x - 3 - o.x;
  o.cols.forEach((c, k) => {
    shapes.push({
      kind: 'text',
      id: `${o.id}--h-${c}`,
      x: xs[k]! + o.widths[k]! / 2,
      y: o.y + HEAD_H - 7,
      text: o.head[k]!,
      size: 14,
      anchor: 'middle',
      cls: 'label',
      role: roles.get(`${o.id}--h-${c}`),
    });
  });
  o.rows.forEach((row, r) => {
    const y = o.y + HEAD_H + r * GRID_PITCH;
    row.cells.forEach((cell, k) => {
      const id = `${o.id}-${row.key}-${o.cols[k]}`;
      const role = roles.get(id) ?? cell.role;
      const w = o.widths[k]!;
      shapes.push({
        kind: 'rect',
        id,
        x: xs[k]!,
        y,
        w,
        h: GRID_ROW,
        r: 3,
        cls: 'live',
        role,
        opacity: cell.dim ? 0.5 : undefined,
      });
      const size = cell.text.length <= 3 ? 15 : 14;
      shapes.push({
        kind: 'text',
        id: `${id}-t`,
        x: xs[k]! + w / 2,
        y: y + GRID_ROW / 2 + size * 0.36,
        text: cell.text,
        size,
        anchor: 'middle',
        mono: true,
        weight: k === 0 ? 'bold' : undefined,
        role: roles.get(`${id}-t`) ?? (role === 'active' || role === 'error' ? role : undefined),
        opacity: cell.dim ? 0.5 : undefined,
      });
    });
  });
  const n = Math.max(o.rows.length, o.reserve ?? 0, 1);
  return { x: o.x, y: o.y, w: width, h: HEAD_H + n * GRID_PITCH - 3 };
}
