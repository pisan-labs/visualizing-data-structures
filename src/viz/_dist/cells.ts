/**
 * Grids of number cells for the training pages LoRA and ring all-reduce: the cells, the numbers
 * and the shading of src/viz/_matrix/matrix.ts, but placed anywhere, so a page can set a matrix
 * above another (A over ΔW, as in a matrix product drawn by hand) or a worker's chunks on a ring.
 *
 * Shape ids, for marks:
 *   <id>-<r>-<c>     a cell (its text is <id>-<r>-<c>-t)
 *   <id>-title       the grid's title
 *   <id>-ch-<c>      a column header
 *   <id>-rh-<r>      a row header
 */
import type { MarkRole } from '../../engine/types';
import type { Bounds, Shape } from '../../render/scene';
import { CELL_H, CELL_W, TITLE_SIZE, VALUE_SIZE, type CellLook } from '../_matrix/matrix';

export { CELL_H, CELL_W, VALUE_SIZE, TITLE_SIZE, shadeOf, type CellLook } from '../_matrix/matrix';

/** Room above the cells for a title, and for a lane of column headers. */
export const TITLE_H = 26;
export const HEADS_H = 22;
/** Room left of the cells for row headers. */
export const ROW_HEAD_W = 26;

export interface Grid {
  id: string;
  title?: string;
  rows: number;
  cols: number;
  cell(r: number, c: number): CellLook | null;
  colHeads?: readonly string[];
  rowHeads?: readonly string[];
  cellW?: number;
  /** The title's role (a mark on `<id>-title` wins). */
  titleRole?: MarkRole;
  /** A cell's own role when no mark names it (a complete chunk, say). */
  cellRole?(r: number, c: number): MarkRole | undefined;
}

export const gridWidth = (g: Grid) => g.cols * (g.cellW ?? CELL_W);
export const gridHeight = (g: Grid) => g.rows * CELL_H;
/** From the top of the title to the top of the cells. */
export const headRoom = (g: Grid) => (g.title ? TITLE_H : 0) + (g.colHeads?.length ? HEADS_H : 0);

/**
 * Draw a grid whose cells start at (x, y), its title and column headers above them and its row
 * headers to their left. Returns the box of everything drawn.
 */
export function drawGrid(
  out: Shape[],
  g: Grid,
  x: number,
  y: number,
  roles: ReadonlyMap<string, MarkRole>,
): Bounds {
  const w = g.cellW ?? CELL_W;
  const top = y - headRoom(g);
  if (g.title)
    out.push({
      kind: 'text',
      id: `${g.id}-title`,
      x,
      y: top + 17,
      text: g.title,
      size: TITLE_SIZE,
      weight: 'bold',
      mono: true,
      role: roles.get(`${g.id}-title`) ?? g.titleRole,
    });
  g.colHeads?.forEach((h, c) =>
    out.push({
      kind: 'text',
      id: `${g.id}-ch-${c}`,
      x: x + c * w + w / 2,
      y: y - 7,
      text: h,
      size: VALUE_SIZE,
      anchor: 'middle',
      mono: true,
      cls: 'label',
      role: roles.get(`${g.id}-ch-${c}`),
    }),
  );
  g.rowHeads?.forEach((h, r) =>
    out.push({
      kind: 'text',
      id: `${g.id}-rh-${r}`,
      x: x - 8,
      y: y + r * CELL_H + CELL_H / 2 + 5,
      text: h,
      size: VALUE_SIZE,
      anchor: 'end',
      mono: true,
      cls: 'label',
      role: roles.get(`${g.id}-rh-${r}`),
    }),
  );
  for (let r = 0; r < g.rows; r++)
    for (let c = 0; c < g.cols; c++) {
      const id = `${g.id}-${r}-${c}`;
      const look = g.cell(r, c);
      out.push({
        kind: 'rect',
        id,
        x: x + c * w,
        y: y + r * CELL_H,
        w,
        h: CELL_H,
        r: 2,
        cls: look ? (look.cls ?? 'live') : undefined,
        shade: look?.shade,
        role: roles.get(id) ?? g.cellRole?.(r, c),
      });
      if (look?.text)
        out.push({
          kind: 'text',
          id: `${id}-t`,
          x: x + c * w + w / 2,
          y: y + r * CELL_H + CELL_H / 2 + 5,
          text: look.text,
          size: VALUE_SIZE,
          anchor: 'middle',
          mono: true,
          cls: look.dim ? 'label' : undefined,
        });
    }
  const left = g.rowHeads?.length ? x - ROW_HEAD_W : x;
  const titleW = g.title ? g.title.length * TITLE_SIZE * 0.6 : 0;
  return {
    x: left,
    y: top,
    w: Math.max(x + gridWidth(g), x + titleW) - left,
    h: y + gridHeight(g) - top,
  };
}
