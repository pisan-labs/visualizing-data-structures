/**
 * Matrices for the AI and LLM pages (PLAN.md 20.5): small labeled grids of numbers with shaded
 * cells (a heat map that always prints the number too), set side by side in rows of panels with
 * the words down the left. The attention pages, the KV cache and the transformer block share it.
 *
 * A panel is drawn at (x, y): its title, an optional lane of column headers, then the cells.
 * Shape ids, for marks:
 *   <id>-<r>-<c>     a cell (its text is <id>-<r>-<c>-t)
 *   <id>-title       the panel's title
 *   <id>-ch-<c>      a column header
 *   w-<r>            row label r (from `drawPanelRows`; in later panel rows w-<g>-<r>, which
 *                    take the mark of w-<r>)
 */
import type { MarkRole, StageSize } from '../../engine/types';
import { padBounds, unionBounds } from '../../layouts/graph';
import type { Bounds, Shape } from '../../render/scene';

export const CELL_W = 48;
export const CELL_H = 32;
export const VALUE_SIZE = 15;
export const TITLE_SIZE = 15;
const TITLE_H = 26;
const HEADS_H = 24;
const GAP_X = 24;
const GAP_Y = 22;
const LABEL_W = 66;
/** Room left clear at the top for the stage's zoom buttons when they have no strip of their own. */
const ZOOM_PAD = 58;

export interface CellLook {
  text: string;
  /** −1 to 1: the heat map (src/render/scene.ts). */
  shade?: number;
  /** 'ghost' for a cell that is masked out, for example. */
  cls?: string;
  /** Gray text (a masked or placeholder value). */
  dim?: boolean;
}

export interface Panel {
  id: string;
  title: string;
  rows: number;
  cols: number;
  /** What a cell shows; null draws it empty. */
  cell(r: number, c: number): CellLook | null;
  colHeads?: readonly string[];
  cellW?: number;
}

const widthOf = (p: Panel) => p.cols * (p.cellW ?? CELL_W);

/** Draw one panel with its cells' top edge at `cellsTop`. */
function drawPanel(
  out: Shape[],
  p: Panel,
  x: number,
  top: number,
  cellsTop: number,
  roles: ReadonlyMap<string, MarkRole>,
): Bounds {
  const w = p.cellW ?? CELL_W;
  out.push({
    kind: 'text',
    id: `${p.id}-title`,
    x,
    y: top + 17,
    text: p.title,
    size: TITLE_SIZE,
    weight: 'bold',
    mono: true,
    role: roles.get(`${p.id}-title`),
  });
  p.colHeads?.forEach((h, c) =>
    out.push({
      kind: 'text',
      id: `${p.id}-ch-${c}`,
      x: x + c * w + w / 2,
      y: cellsTop - 7,
      text: h,
      size: VALUE_SIZE,
      anchor: 'middle',
      mono: true,
      cls: 'label',
      role: roles.get(`${p.id}-ch-${c}`),
    }),
  );
  for (let r = 0; r < p.rows; r++) {
    for (let c = 0; c < p.cols; c++) {
      const id = `${p.id}-${r}-${c}`;
      const look = p.cell(r, c);
      out.push({
        kind: 'rect',
        id,
        x: x + c * w,
        y: cellsTop + r * CELL_H,
        w,
        h: CELL_H,
        r: 2,
        cls: look ? (look.cls ?? 'live') : undefined,
        shade: look?.shade,
        role: roles.get(id),
      });
      if (look?.text)
        out.push({
          kind: 'text',
          id: `${id}-t`,
          x: x + c * w + w / 2,
          y: cellsTop + r * CELL_H + CELL_H / 2 + 5,
          text: look.text,
          size: VALUE_SIZE,
          anchor: 'middle',
          mono: true,
          cls: look.dim ? 'label' : undefined,
        });
    }
  }
  return { x, y: top, w: widthOf(p), h: cellsTop - top + p.rows * CELL_H };
}

/**
 * Rows of panels, one under another, each row with the row labels down its left. Every panel
 * in a row has `labels.length` rows. Returns the shapes and the padded bounds of the drawing.
 */
export function drawPanelRows(
  groups: readonly (readonly Panel[])[],
  labels: readonly string[],
  roles: ReadonlyMap<string, MarkRole>,
  stage?: StageSize,
): { shapes: Shape[]; bounds: Bounds } {
  const shapes: Shape[] = [];
  const boxes: Bounds[] = [];
  let y = stage?.strip ? 0 : ZOOM_PAD;
  groups.forEach((panels, g) => {
    const heads = panels.some((p) => p.colHeads?.length) ? HEADS_H : 0;
    const cellsTop = y + TITLE_H + heads;
    labels.forEach((t, r) =>
      shapes.push({
        kind: 'text',
        id: g === 0 ? `w-${r}` : `w-${g}-${r}`,
        x: LABEL_W - 10,
        y: cellsTop + r * CELL_H + CELL_H / 2 + 5,
        text: t,
        size: VALUE_SIZE,
        anchor: 'end',
        weight: 'bold',
        mono: true,
        role: roles.get(`w-${r}`),
      }),
    );
    let x = LABEL_W;
    let bottom = cellsTop + labels.length * CELL_H;
    for (const p of panels) {
      const b = drawPanel(shapes, p, x, y, cellsTop, roles);
      boxes.push(b);
      bottom = Math.max(bottom, b.y + b.h);
      x += b.w + GAP_X;
    }
    boxes.push({ x: 0, y, w: LABEL_W, h: bottom - y });
    y = bottom + GAP_Y;
  });
  if (!stage?.strip) boxes.push({ x: 0, y: 0, w: 1, h: 1 });
  return { shapes, bounds: padBounds(unionBounds(...boxes), 12) };
}

/** A shade for v on a scale where `max` (the largest |value| shown) is full strength. */
export const shadeOf = (v: number, max: number): number =>
  max > 0 && Number.isFinite(v) ? Math.max(-1, Math.min(1, v / max)) : 0;
