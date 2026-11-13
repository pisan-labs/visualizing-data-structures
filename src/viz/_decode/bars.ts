/**
 * Probability bars for the decoding pages (ngram-lm, sampling): one row per token, the tokens
 * down the left, then columns side by side, each either number cells (a count, a logit) or bars
 * (a probability). Groups of columns go one under another, each with the tokens down its left,
 * as the matrix panels do (src/viz/_matrix/matrix.ts), so a phone can stack what a laptop puts
 * in one row.
 *
 * A bars column can be stacked: each bar starts where the one above it ends, so together they
 * tile 0 to 1, the cumulative distribution a uniform number u lands in, and the line of u
 * crosses exactly one bar. A cut (top-k, top-p, min-p) is a dashed line under the last row
 * kept, across the whole group.
 *
 * Rows are keyed, so a token keeps its shapes when the rows reorder (a table of counts that
 * grows) and the renderer moves it. Shape ids, for marks:
 *   w-<key>            a row's label (in later groups w-<g>-<key>, which takes the mark of w-<key>)
 *   <col>-<key>        a cell or a bar; its number is <col>-<key>-t
 *   <col>-title        a column's title
 *   cut-<g>, cut-<g>-t the cut line of group g and its label
 *   u-<col>, u-<col>-t the line of u and its label
 */
import type { MarkRole, StageSize } from '../../engine/types';
import { padBounds, unionBounds } from '../../layouts/graph';
import type { Bounds, Shape } from '../../render/scene';

export const ROW_H = 30;
export const FONT = 15;
export const SMALL = 14;
const BAR_H = 20;
const CELL_W = 52;
const TITLE_H = 28;
const GAP_X = 18;
const GAP_Y = 24;
/** The lane under a group for the label of u. */
const LANE_H = 24;
/** Room left clear at the top for the stage's zoom buttons when they have no strip of their own. */
export const ZOOM_PAD = 58;

export interface Row {
  key: string;
  label: string;
}

export interface CellLook {
  text: string;
  /** −1 to 1: the heat map (src/render/scene.ts). */
  shade?: number;
  /** Gray text and a dashed outline: a value that is out of play. */
  dim?: boolean;
}

export interface BarLook {
  /** The bar's length as a fraction of the track (0 to 1). */
  value: number;
  /** The number printed after the bar. */
  text: string;
  /** Stacked: where the bar starts, as a fraction of the track. Default 0. */
  offset?: number;
  /** A dropped token: an outline only, and gray text. */
  dim?: boolean;
}

export interface CellsColumn {
  kind: 'cells';
  id: string;
  title: string;
  w?: number;
  cell(r: number): CellLook | null;
}

export interface BarsColumn {
  kind: 'bars';
  id: string;
  title: string;
  /** Length of a bar of value 1. Default 160. */
  track?: number;
  bar(r: number): BarLook | null;
  /** Reserve a lane under the column for the label of u, so the frame stays still. */
  draws?: boolean;
  /** The line of u, across rows `rows[0]` to `rows[1]`. */
  u?: { value: number; label: string; rows: [number, number] };
}

export type Column = CellsColumn | BarsColumn;

export interface Cut {
  /** The last row kept (0-based); the line goes under it. */
  after: number;
  label: string;
}

const textW = (text: string, size = FONT) => [...text].length * size * 0.6;

/** A column's width: the bars' track plus room for the number after the longest bar. */
export function columnWidth(c: Column): number {
  if (c.kind === 'cells') return c.w ?? CELL_W;
  return (c.track ?? 160) + 50;
}

export interface TableOptions {
  /** Width of the label lane on the left. Default fits the longest label. */
  labelW?: number;
  /** Top of the drawing. Default: clear of the zoom buttons unless they have a strip. */
  top?: number;
  stage?: StageSize;
  cut?: Cut | null;
}

/** Rows of column groups, one under another. Returns the shapes and the drawing's bounds. */
export function drawTable(
  groups: readonly (readonly Column[])[],
  rows: readonly Row[],
  roles: ReadonlyMap<string, MarkRole>,
  opts: TableOptions = {},
): { shapes: Shape[]; bounds: Bounds } {
  const shapes: Shape[] = [];
  const boxes: Bounds[] = [];
  const labelW = opts.labelW ?? Math.max(48, ...rows.map((r) => textW(r.label))) + 14;
  let y = opts.top ?? (opts.stage?.strip ? 0 : ZOOM_PAD);
  groups.forEach((cols, g) => {
    const top = y + TITLE_H;
    rows.forEach((row, r) =>
      shapes.push({
        kind: 'text',
        id: g === 0 ? `w-${row.key}` : `w-${g}-${row.key}`,
        x: labelW - 10,
        y: top + r * ROW_H + ROW_H / 2 + 5,
        text: row.label,
        size: FONT,
        anchor: 'end',
        weight: 'bold',
        mono: true,
        role: roles.get(`w-${row.key}`),
      }),
    );
    let x = labelW;
    let cutLabel = false;
    const bottom = top + rows.length * ROW_H;
    let lane = false;
    for (const c of cols) {
      const w = columnWidth(c);
      shapes.push({
        kind: 'text',
        id: `${c.id}-title`,
        x,
        y: y + 18,
        text: c.title,
        size: FONT,
        weight: 'bold',
        mono: true,
        role: roles.get(`${c.id}-title`),
      });
      if (c.kind === 'cells') drawCells(shapes, c, rows, x, top, roles);
      else {
        drawBars(shapes, c, rows, x, top, roles);
        if (c.draws) lane = true;
        if (opts.cut && !cutLabel) {
          cutLabel = true;
          shapes.push({
            kind: 'text',
            id: `cut-${g}-t`,
            x: x + (c.track ?? 160) + 40,
            y: top + (opts.cut.after + 1) * ROW_H + 16,
            text: opts.cut.label,
            size: SMALL,
            anchor: 'end',
            mono: true,
            cls: 'label',
          });
        }
      }
      x += w + GAP_X;
    }
    const right = x - GAP_X;
    if (opts.cut && opts.cut.after < rows.length - 1) {
      const cy = top + (opts.cut.after + 1) * ROW_H;
      shapes.push({
        kind: 'arrow',
        id: `cut-${g}`,
        x1: 6,
        y1: cy,
        x2: right,
        y2: cy,
        head: 'none',
        dashed: true,
        role: roles.get('cut') ?? 'error',
      });
    }
    const h = bottom - y + (lane ? LANE_H : 0);
    boxes.push({ x: 0, y, w: right, h });
    y += h + GAP_Y;
  });
  if (!opts.stage?.strip && opts.top === undefined) boxes.push({ x: 0, y: 0, w: 1, h: 1 });
  return { shapes, bounds: padBounds(unionBounds(...boxes), 12) };
}

function drawCells(
  out: Shape[],
  c: CellsColumn,
  rows: readonly Row[],
  x: number,
  top: number,
  roles: ReadonlyMap<string, MarkRole>,
) {
  const w = c.w ?? CELL_W;
  rows.forEach((row, r) => {
    const id = `${c.id}-${row.key}`;
    const look = c.cell(r);
    const y = top + r * ROW_H + 2;
    out.push({
      kind: 'rect',
      id,
      x,
      y,
      w: w - 4,
      h: ROW_H - 4,
      r: 2,
      cls: look ? (look.dim ? 'ghost' : 'live') : undefined,
      shade: look && !look.dim ? look.shade : undefined,
      role: roles.get(id),
    });
    if (look?.text)
      out.push({
        kind: 'text',
        id: `${id}-t`,
        x: x + (w - 4) / 2,
        y: y + (ROW_H - 4) / 2 + 5,
        text: look.text,
        size: FONT,
        anchor: 'middle',
        mono: true,
        cls: look.dim ? 'label' : undefined,
      });
  });
}

function drawBars(
  out: Shape[],
  c: BarsColumn,
  rows: readonly Row[],
  x: number,
  top: number,
  roles: ReadonlyMap<string, MarkRole>,
) {
  const track = c.track ?? 160;
  // The axis: where 0 is (and 1, when the bars are stacked to tile 0 to 1).
  out.push({
    kind: 'arrow',
    id: `${c.id}-axis`,
    x1: x,
    y1: top,
    x2: x,
    y2: top + rows.length * ROW_H,
    head: 'none',
    opacity: 0.6,
  });
  rows.forEach((row, r) => {
    const id = `${c.id}-${row.key}`;
    const look = c.bar(r);
    const y = top + r * ROW_H + (ROW_H - BAR_H) / 2;
    const bx = x + (look?.offset ?? 0) * track;
    const w = look ? Math.max(0, Math.min(1, look.value)) * track : 0;
    out.push({
      kind: 'rect',
      id,
      x: bx,
      y,
      w,
      h: BAR_H,
      r: 2,
      cls: look?.dim ? 'ghost' : 'live',
      shade: look && !look.dim ? 0.8 : undefined,
      role: roles.get(id),
      opacity: look && w > 0 ? 1 : 0,
    });
    if (look?.text)
      out.push({
        kind: 'text',
        id: `${id}-t`,
        x: bx + w + 5,
        y: y + BAR_H / 2 + 5,
        text: look.text,
        size: SMALL,
        mono: true,
        cls: look.dim ? 'label' : undefined,
        role: look.dim ? undefined : roles.get(id) === 'found' ? 'found' : undefined,
      });
  });
  if (c.u) {
    const ux = x + c.u.value * track;
    const [a, b] = c.u.rows;
    out.push({
      kind: 'arrow',
      id: `u-${c.id}`,
      x1: ux,
      y1: top + a * ROW_H - 4,
      x2: ux,
      y2: top + (b + 1) * ROW_H + 4,
      head: 'none',
      role: 'active',
    });
    out.push({
      kind: 'text',
      id: `u-${c.id}-t`,
      x: ux,
      y: top + rows.length * ROW_H + 18,
      text: c.u.label,
      size: SMALL,
      anchor: 'middle',
      weight: 'bold',
      mono: true,
      role: 'active',
    });
  }
}
