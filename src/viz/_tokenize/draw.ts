/**
 * Drawing for the tokenizer pages: tokens as chips (a box with the token's text), the training
 * words as rows of chips with their counts, a table of pairs, and the vocabulary. Every text is
 * 15 units, so it stays at least 11 px on a laptop and 9 px on a phone at the scales these
 * pictures are drawn at.
 *
 * Panels are drawn with their top left corner at (0, 0) and return their size; a view moves
 * them into place with `place`.
 *
 * Shape ids, for marks:
 *   <id>, <id>-t          a chip and its text
 *   wc-<r>                 the count of training word r
 *   p-<piece id>           a piece of a training word (from drawWords)
 *   <panel>-title          a panel's title
 */
import type { MarkRole } from '../../engine/types';
import { translate } from '../../layouts/arrange';
import type { Bounds, Shape } from '../../render/scene';
import type { Piece, Row } from './pieces';

export const FONT = 15;
export const CHAR_W = FONT * 0.6;
export const CHIP_H = 24;
export const PITCH = 28;
export const TITLE_H = 28;
/** Between the chips of one word. */
export const CHIP_GAP = 3;
export const PANEL_GAP = 24;

export interface Panel {
  shapes: Shape[];
  w: number;
  h: number;
}

/** Width of a chip for a text. */
export const chipW = (text: string): number => Math.max(1, [...text].length) * CHAR_W + 8;

/** Width of a row of chips. */
export const chipsW = (texts: readonly string[]): number =>
  texts.reduce((s, t) => s + chipW(t), 0) + Math.max(0, texts.length - 1) * CHIP_GAP;

export function chip(
  out: Shape[],
  id: string,
  x: number,
  y: number,
  text: string,
  role?: MarkRole,
  cls = 'live',
): number {
  const w = chipW(text);
  out.push({ kind: 'rect', id, x, y, w, h: CHIP_H, r: 4, cls, role });
  out.push({
    kind: 'text',
    id: `${id}-t`,
    x: x + w / 2,
    y: y + CHIP_H / 2 + 5,
    text,
    size: FONT,
    anchor: 'middle',
    mono: true,
    role: role === 'error' ? 'error' : undefined,
  });
  return w;
}

export function label(
  out: Shape[],
  id: string,
  x: number,
  y: number,
  text: string,
  o: { anchor?: 'start' | 'middle' | 'end'; bold?: boolean; dim?: boolean; role?: MarkRole } = {},
): void {
  out.push({
    kind: 'text',
    id,
    x,
    y,
    text,
    size: FONT,
    anchor: o.anchor ?? 'start',
    weight: o.bold ? 'bold' : undefined,
    mono: true,
    cls: o.dim ? 'label' : undefined,
    role: o.role,
  });
}

export const textW = (text: string): number => [...text].length * CHAR_W;

/** A panel's title, bold, at the top left. */
export function title(out: Shape[], id: string, text: string): void {
  label(out, `${id}-title`, 0, 17, text, { bold: true });
}

// ---------------------------------------------------------------------------------------------
// Training words

export interface WordsOptions {
  title: string;
  /** How a piece is written on its chip. */
  show(p: Piece, r: number, k: number): string;
  roles: ReadonlyMap<string, MarkRole>;
  /** Width kept for the chips of each word: the widest the row will be during the operation. */
  chipsWidth: number;
  /** Words per column. */
  perCol: number;
  /** Role for a word's count when no mark names it. */
  countRole?(r: number): MarkRole | undefined;
}

/** The training words in columns, each a count ("×29") and its pieces as chips. */
export function drawWords(rows: readonly Row[], o: WordsOptions): Panel {
  const out: Shape[] = [];
  title(out, 'words', o.title);
  const most = Math.max(1, ...rows.map((r) => r.count));
  const countW = textW(`×${most}`) + 2;
  const colW = countW + 8 + o.chipsWidth;
  const cols = Math.max(1, Math.ceil(rows.length / o.perCol));
  rows.forEach((row, r) => {
    const x0 = Math.floor(r / o.perCol) * (colW + PANEL_GAP);
    const y = TITLE_H + (r % o.perCol) * PITCH;
    label(out, `wc-${r}`, x0 + countW, y + CHIP_H / 2 + 5, `×${row.count}`, {
      anchor: 'end',
      dim: true,
      role: o.roles.get(`wc-${r}`) ?? o.countRole?.(r),
    });
    let x = x0 + countW + 8;
    row.pieces.forEach((p, k) => {
      const id = `p-${p.id}`;
      x += chip(out, id, x, y, o.show(p, r, k), o.roles.get(id)) + CHIP_GAP;
    });
  });
  const shown = Math.min(rows.length, o.perCol);
  return {
    shapes: out,
    w: Math.max(textW(o.title), cols * colW + (cols - 1) * PANEL_GAP),
    h: TITLE_H + Math.max(1, shown) * PITCH - (PITCH - CHIP_H),
  };
}

// ---------------------------------------------------------------------------------------------
// Pairs

export interface PairLine {
  a: string;
  b: string;
  /** Numbers in the columns after the pair, right-aligned. */
  nums: string[];
  role?: MarkRole;
}

export interface PairOptions {
  title: string;
  /** Column heads for the numbers. */
  heads: string[];
  /** Width of each number column. */
  numW: number[];
  /** Rows kept, so the panel keeps its size while it fills. */
  rows: number;
  /** Width kept for the two chips. */
  pairW: number;
  roles: ReadonlyMap<string, MarkRole>;
  /** Shown when there are no lines yet. */
  empty: string;
  /** Lines from this index on are set apart (a row that is not in the ranking)... */
  splitAt?: number;
  /** ...under this caption. */
  splitLabel?: string;
}

/** A table of pairs: the two chips, then numbers. Ids pr-<k>-a, pr-<k>-b, pr-<k>-n<j>. */
export function drawPairs(lines: readonly PairLine[], o: PairOptions): Panel {
  const out: Shape[] = [];
  title(out, 'pairs', o.title);
  const headY = TITLE_H + 12;
  const top = TITLE_H + (o.heads.length ? 22 : 0);
  let nx = o.pairW + 10;
  const colX = o.numW.map((w) => (nx += w));
  o.heads.forEach((h, j) =>
    label(out, `pairs-h-${j}`, colX[j]!, headY, h, { anchor: 'end', dim: true }),
  );
  const SPLIT = 30;
  const gap = (k: number) => (o.splitAt !== undefined && k >= o.splitAt ? SPLIT : 0);
  if (o.splitAt !== undefined && o.splitLabel && lines.length > o.splitAt)
    label(out, 'pairs-split', 0, top + o.splitAt * PITCH + SPLIT - 10, o.splitLabel, { dim: true });
  lines.forEach((ln, k) => {
    const y = top + k * PITCH + gap(k);
    const role = o.roles.get(`pr-${k}`) ?? ln.role;
    const wa = chip(out, `pr-${k}-a`, 0, y, ln.a, o.roles.get(`pr-${k}-a`) ?? role);
    chip(out, `pr-${k}-b`, wa + 4, y, ln.b, o.roles.get(`pr-${k}-b`) ?? role);
    ln.nums.forEach((t, j) =>
      label(out, `pr-${k}-n${j}`, colX[j]!, y + CHIP_H / 2 + 5, t, { anchor: 'end' }),
    );
  });
  // The mark for the best pair names the row; give it a shape of its own to point at.
  for (let k = 0; k < o.rows; k++) {
    if (k < lines.length && o.roles.has(`pr-${k}`))
      out.push({
        kind: 'rect',
        id: `pr-${k}`,
        x: -4,
        y: top + k * PITCH + gap(k) - 2,
        w: colX.at(-1)! + 8,
        h: CHIP_H + 4,
        r: 6,
        cls: 'ghost',
        role: o.roles.get(`pr-${k}`),
        z: -1,
      });
  }
  if (lines.length === 0)
    label(out, 'pairs-empty', 0, top + CHIP_H / 2 + 5, o.empty, { dim: true });
  const w = Math.max(colX.at(-1) ?? o.pairW, textW(o.title), textW(o.empty), textW(o.splitLabel ?? ''));
  const extra = o.splitAt !== undefined ? SPLIT : 0;
  return { shapes: out, w, h: top + o.rows * PITCH + extra - (PITCH - CHIP_H) };
}

// ---------------------------------------------------------------------------------------------
// Vocabulary

export interface VocabOptions {
  title: string;
  /** The starting symbols as chips, or a line of text instead (all 256 bytes). */
  base: string[];
  baseNote?: string;
  /** Tokens added by training, in order. */
  added: string[];
  /** Room kept for this many added tokens. */
  reserve: number;
  perCol: number;
  /** Width of the panel. */
  width: number;
  /** Width kept for an added token's chip. */
  tokenW: number;
  roles: ReadonlyMap<string, MarkRole>;
}

/** The vocabulary: starting symbols (vb-<j>), then numbered added tokens (vm-<i>). */
export function drawVocab(o: VocabOptions): Panel {
  const out: Shape[] = [];
  title(out, 'vocab', o.title);
  let y = TITLE_H;
  if (o.baseNote) {
    label(out, 'vocab-note', 0, y + CHIP_H / 2 + 5, o.baseNote, { dim: true });
    y += PITCH;
  }
  let x = 0;
  o.base.forEach((t, j) => {
    const w = chipW(t);
    if (x > 0 && x + w > o.width) {
      x = 0;
      y += PITCH;
    }
    chip(out, `vb-${j}`, x, y, t, o.roles.get(`vb-${j}`));
    x += w + CHIP_GAP;
  });
  if (o.base.length) y += PITCH + 8;
  const numW = textW(String(Math.max(o.reserve, o.added.length))) + 6;
  const colW = numW + o.tokenW + 14;
  o.added.forEach((t, i) => {
    const cx = Math.floor(i / o.perCol) * colW;
    const cy = y + (i % o.perCol) * PITCH;
    label(out, `vm-${i}-i`, cx + numW - 6, cy + CHIP_H / 2 + 5, String(i + 1), {
      anchor: 'end',
      dim: true,
    });
    chip(out, `vm-${i}`, cx + numW, cy, t, o.roles.get(`vm-${i}`));
  });
  const kept = Math.max(o.reserve, o.added.length);
  const rows = Math.min(kept, o.perCol);
  const cols = Math.ceil(kept / o.perCol);
  return {
    shapes: out,
    w: Math.max(o.width, cols * colW - 14, textW(o.title), textW(o.baseNote ?? '')),
    h: y + Math.max(1, rows) * PITCH - (PITCH - CHIP_H),
  };
}

// ---------------------------------------------------------------------------------------------
// Placing panels

export interface Placed {
  shapes: Shape[];
  bounds: Bounds;
}

/** Panels moved to their places, with the box around them. */
export function place(parts: readonly { p: Panel; x: number; y: number }[]): Placed {
  const shapes: Shape[] = [];
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (const { p, x, y } of parts) {
    shapes.push(...translate(p.shapes, x, y));
    x1 = Math.min(x1, x);
    y1 = Math.min(y1, y);
    x2 = Math.max(x2, x + p.w);
    y2 = Math.max(y2, y + p.h);
  }
  const pad = 12;
  return { shapes, bounds: { x: x1 - pad, y: y1 - pad, w: x2 - x1 + 2 * pad, h: y2 - y1 + 2 * pad } };
}

/** Panels side by side, top-aligned, with `drop` extra room above the last (the zoom buttons). */
export function inRow(panels: readonly Panel[], drop = 0): { p: Panel; x: number; y: number }[] {
  let x = 0;
  return panels.map((p, i) => {
    const at = { p, x, y: i === panels.length - 1 ? drop : 0 };
    x += p.w + PANEL_GAP;
    return at;
  });
}

/** Rows of panels, one under another. */
export function inRows(rows: readonly (readonly Panel[])[]): { p: Panel; x: number; y: number }[] {
  const out: { p: Panel; x: number; y: number }[] = [];
  let y = 0;
  for (const row of rows) {
    let x = 0;
    for (const p of row) {
      out.push({ p, x, y });
      x += p.w + PANEL_GAP;
    }
    y += Math.max(0, ...row.map((p) => p.h)) + PANEL_GAP;
  }
  return out;
}
