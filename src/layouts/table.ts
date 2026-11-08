/**
 * Table layout: a dynamic-programming table, 1D (one row, like F[0..n]) or 2D (like c[i][j]),
 * with row and column headers, the cell being filled, arrows from the cells it depends on, and
 * a traceback path through the table. Used by the dp-* pages.
 *
 * Call `tableScene(frame, content)` from a view and wrap the result in a Scene with a label.
 * Pages that draw more under the table (an alignment, the chosen items, call frames) reserve
 * room with `frame.below` and place their shapes with `tableGeometry(frame)`; `boxRow` draws a
 * row of labeled boxes there. `placeStrip` (table-strip.ts) moves that room beside the grid
 * when the stage is wide and that draws larger.
 *
 * - `frame` fixes the framing. Keep it the same for every step of an operation, so the camera
 *   stays still while cells fill: the grid size, the header lanes, the arc lanes and the room
 *   below.
 *   - `rows` x `cols` data cells. A 1D table has one row (or a second row for choices, such
 *     as the coin each amount used).
 *   - `colHeads`: lanes of column headers (an index lane "j", a label lane "Y[j]"), drawn
 *     `above` the grid (2D tables) or `below` it (1D tables, which keep the space above for
 *     arcs).
 *   - `rowHeads`: the widths of the row-header lanes left of the grid, left to right (an index
 *     lane "i", a label lane "X[i]").
 *   - `arcLanes`: lanes above the grid for arcs, the links between cells of a 1D row.
 *   - `below`: height reserved under the grid and its headers.
 *   - `cellW`, `cellH`: cell size. The default width shrinks with the column count, from 64
 *     down to 44 units, so 16 columns fit a phone at about 11 px per digit.
 * - `content` is what this step shows:
 *   - `values[r][c]`: the text in each cell; null or '' leaves it unfilled (drawn empty).
 *   - `colHeads[lane][c]` and `rowHeads[lane][r]`: header text, drawn as small gray indices
 *     or bold labels (`colStyles`, `rowStyles`; column lane 0 is an index lane by default).
 *     `corner[colLane][rowLane]` names the lanes in the top-left corner ("j" left of the
 *     column indices, "i" above the row indices).
 *   - `links`: arrows from a cell to the cell that reads it (`from` is the dependency). With
 *     `route: 'arc'` the arrow goes up from the top of `from`, over the row in arc lane
 *     `lane`, and down into `to`, so it never crosses a value. Otherwise the route depends on
 *     where the cells are: neighbors get a short arrow across their shared edge or corner
 *     (beside the values, never through them); cells in one row are joined along the bottom
 *     band of that row, cells in one column along its right band, and cells one row apart
 *     along the grid line between the two rows.
 *   - `path`: the traceback, a list of cells, drawn as arrows from each cell to the next with
 *     the same routes as links.
 *   - `roles`: the step's marks by shape id.
 *
 * Shape ids (use them as mark ids):
 * - `cell-<r>-<c>`: a cell. Marking it colors its box and its value (`val-<r>-<c>`), unless
 *   the value has a mark of its own.
 * - `ch-<lane>-<c>` and `rh-<lane>-<r>`: header text. `corner-<colLane>-<rowLane>`.
 * - `link-<id>`: a link (for arcs, also `link-<id>-up` and `link-<id>-over`), and
 *   `link-<id>-label` (on a chip, `link-<id>-chip`, for links that are not arcs).
 * - `path-<k>`: the arrow from path cell k to path cell k + 1.
 * - `boxRow` shapes: `<id>-<k>` boxes and `<id>-<k>-t` their text, plus `<id>-label`.
 *
 * Sizes are in scene units, chosen so a 9 x 9 table (two strings of 8 characters) or 16
 * columns stay readable on a phone in portrait and on a 1366x768 laptop.
 */
import type { MarkRole } from '../engine/types';
import type { Bounds, Shape } from '../render/scene';

/** A cell position: [row, column]. */
export type Cell = readonly [r: number, c: number];

export interface TableFrame {
  rows: number;
  cols: number;
  /** Column-header lanes. Default 1. */
  colHeads?: number;
  /** Where column headers go. Default 'above'. */
  colHeadsAt?: 'above' | 'below';
  /** Widths of the row-header lanes, left to right. Default one lane of 40 units. */
  rowHeads?: readonly number[];
  /** Lanes above the grid for arcs. Default 0. */
  arcLanes?: number;
  /** Units reserved under the grid and its headers. Default 0. */
  below?: number;
  cellW?: number;
  cellH?: number;
}

export interface TableLink {
  id: string;
  /** The cell that is read. */
  from: Cell;
  /** The cell that reads it. */
  to: Cell;
  role?: MarkRole;
  /** A short label: over the arc for arcs, on a chip in the middle of the arrow otherwise. */
  label?: string;
  route?: 'auto' | 'arc';
  /** Arc lane, 0 nearest the grid. */
  lane?: number;
}

export type HeadStyle = 'index' | 'label';

export interface TableContent {
  values: readonly (readonly (string | null | undefined)[])[];
  colHeads?: readonly (readonly string[])[];
  rowHeads?: readonly (readonly string[])[];
  /**
   * How each header lane is drawn: 'index' (small, gray) or 'label' (bold). Default: column
   * lane 0 is the index lane; row lane 0 is one when there is more than one row lane.
   */
  colStyles?: readonly HeadStyle[];
  rowStyles?: readonly HeadStyle[];
  corner?: readonly (readonly string[])[];
  links?: readonly TableLink[];
  path?: readonly Cell[];
  /** Role for the path arrows. Default 'active'. */
  pathRole?: MarkRole;
  roles?: ReadonlyMap<string, MarkRole>;
}

const PAD = 10;
/** The stage's zoom buttons sit over the top right corner; keep content below them. */
const PAD_TOP = 46;
const PAD_TALL = 16;
const MIN_W = 480;
const HEAD_H = 30;
const ARC_LANE = 24;
const ARC_BASE = 14;

/** Default cell width for a table with this many columns (plus its row headers). */
export function cellWidthFor(cols: number): number {
  return Math.max(44, Math.min(64, Math.floor(760 / (cols + 1))));
}

/**
 * Font size for a cell value: up to 28 units for one character and 26 for two, so small
 * numbers stay big on a phone; smaller for long text in a narrow cell.
 */
export function valueSize(text: string, cellW: number): number {
  const n = Math.max(1, text.length);
  const fit = Math.floor((cellW - 6) / (n * 0.6));
  return Math.max(12, Math.min(n === 1 ? 28 : n === 2 ? 26 : 24, fit));
}

export interface TableGeometry {
  width: number;
  height: number;
  cellW: number;
  cellH: number;
  /** Left and top edges of cell column c and row r. */
  left(c: number): number;
  top(r: number): number;
  /** Centers. */
  cx(c: number): number;
  cy(r: number): number;
  /** Center x of row-header lane k. */
  headX(k: number): number;
  /** Baseline of column-header lane k. */
  headY(k: number): number;
  /** Top and bottom of the grid. */
  gridTop: number;
  gridBottom: number;
  gridLeft: number;
  gridRight: number;
  /** Height of arc lane k (its horizontal run). */
  arcY(k: number): number;
  /** Top of the room reserved below. */
  belowTop: number;
}

export function tableGeometry(frame: TableFrame): TableGeometry {
  const cellW = frame.cellW ?? cellWidthFor(frame.cols);
  const cellH = frame.cellH ?? Math.round(Math.min(50, cellW * 0.8));
  const heads = frame.rowHeads ?? [40];
  const headsW = heads.reduce((a, b) => a + b, 0);
  const colLanes = frame.colHeads ?? 1;
  const above = (frame.colHeadsAt ?? 'above') === 'above';
  const natural = headsW + frame.cols * cellW + 2 * PAD;
  const width = Math.max(MIN_W, natural);
  // Center the table (headers and grid together) in the frame.
  const x0 = (width - natural) / 2 + PAD;
  const gridLeft = x0 + headsW;

  const arcLanes = frame.arcLanes ?? 0;
  const arcH = arcLanes ? ARC_BASE + arcLanes * ARC_LANE : 0;
  const bodyH = arcH + colLanes * HEAD_H + 8 + frame.rows * cellH + 10 + (frame.below ?? 0) + PAD;
  // A wide drawing fills the stage's width, so its top right corner sits under the zoom
  // buttons: keep that clear. A tall one is drawn narrower than the stage, so the corner is
  // empty anyway, and the room is better spent on bigger cells.
  let y = bodyH > width * 0.55 ? PAD_TALL : PAD_TOP;
  y += arcH;
  const headsTop = y;
  if (above) y += colLanes * HEAD_H;
  const gridTop = y + (above ? 4 : 0);
  const gridBottom = gridTop + frame.rows * cellH;
  y = gridBottom;
  const belowHeads = y + 4;
  if (!above) y += colLanes * HEAD_H + 4;
  const belowTop = y + 10;
  const height = belowTop + (frame.below ?? 0) + PAD;

  const laneLeft = (k: number) => x0 + heads.slice(0, k).reduce((a, b) => a + b, 0);
  return {
    width,
    height,
    cellW,
    cellH,
    left: (c) => gridLeft + c * cellW,
    top: (r) => gridTop + r * cellH,
    cx: (c) => gridLeft + (c + 0.5) * cellW,
    cy: (r) => gridTop + (r + 0.5) * cellH,
    headX: (k) => laneLeft(k) + (heads[k] ?? 0) / 2,
    headY: (k) => (above ? headsTop : belowHeads) + k * HEAD_H + 21,
    gridTop,
    gridBottom,
    gridLeft,
    gridRight: gridLeft + frame.cols * cellW,
    arcY: (k) => gridTop - ARC_BASE - k * ARC_LANE,
    belowTop,
  };
}

interface Seg {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const sign = (n: number) => (n > 0 ? 1 : n < 0 ? -1 : 0);

/**
 * The arrow from cell a to cell b, kept clear of the values in both. Values sit in the middle
 * of their cells, so arrows run beside them: the right band for vertical moves, the bottom band
 * for horizontal ones, across the shared corner for diagonal neighbors.
 */
function route(g: TableGeometry, a: Cell, b: Cell): Seg {
  const [r1, c1] = a;
  const [r2, c2] = b;
  const dr = r2 - r1;
  const dc = c2 - c1;
  const { cellW: w, cellH: h } = g;
  if (dr === 0 && dc === 0) {
    return { x1: g.cx(c1), y1: g.top(r1) + 2, x2: g.cx(c1), y2: g.top(r1) + h * 0.3 };
  }
  if (dc === 0) {
    // One column: along its right band.
    const x = g.cx(c1) + w * 0.3;
    if (Math.abs(dr) === 1) {
      const edge = dr > 0 ? g.top(r2) : g.top(r1);
      return { x1: x, y1: edge - dr * h * 0.32, x2: x, y2: edge + dr * h * 0.32 };
    }
    return {
      x1: x,
      y1: g.cy(r1) + dr * h * 0.2,
      x2: x,
      y2: (dr > 0 ? g.top(r2) : g.top(r2) + h) + dr * h * 0.3,
    };
  }
  if (dr === 0) {
    // One row: along its bottom band.
    const y = g.cy(r1) + h * 0.3;
    if (Math.abs(dc) === 1) {
      const edge = dc > 0 ? g.left(c2) : g.left(c1);
      return { x1: edge - dc * w * 0.3, y1: y, x2: edge + dc * w * 0.3, y2: y };
    }
    return {
      x1: g.cx(c1) + dc * 0.05 * w,
      y1: y,
      x2: (dc > 0 ? g.left(c2) : g.left(c2) + w) + sign(dc) * w * 0.3,
      y2: y,
    };
  }
  if (Math.abs(dr) === 1 && Math.abs(dc) === 1) {
    // Diagonal neighbors: across the shared corner.
    const x = dc > 0 ? g.left(c2) : g.left(c1);
    const y = dr > 0 ? g.top(r2) : g.top(r1);
    return {
      x1: x - dc * w * 0.24,
      y1: y - dr * h * 0.24,
      x2: x + dc * w * 0.24,
      y2: y + dr * h * 0.24,
    };
  }
  if (Math.abs(dr) === 1) {
    // One row apart and further across: along the grid line between the two rows.
    const line = dr > 0 ? g.top(r2) : g.top(r1);
    return {
      x1: g.cx(c1) + sign(dc) * w * 0.28,
      y1: line - dr * h * 0.2,
      x2: g.cx(c2) - sign(dc) * w * 0.3,
      y2: line + dr * h * 0.24,
    };
  }
  // Far apart in both directions: a straight line, short of both values.
  const x1 = g.cx(c1);
  const y1 = g.cy(r1);
  const x2 = g.cx(c2);
  const y2 = g.cy(r2);
  const len = Math.hypot(x2 - x1, y2 - y1);
  const ux = (x2 - x1) / len;
  const uy = (y2 - y1) / len;
  const trim = Math.min(w, h) * 0.42;
  return { x1: x1 + ux * trim, y1: y1 + uy * trim, x2: x2 - ux * trim, y2: y2 - uy * trim };
}

function text(
  id: string,
  x: number,
  y: number,
  t: string,
  size: number,
  more: Partial<Extract<Shape, { kind: 'text' }>> = {},
): Shape {
  return { kind: 'text', id, x, y, text: t, size, anchor: 'middle', ...more };
}

export function tableScene(
  frame: TableFrame,
  content: TableContent,
): { shapes: Shape[]; bounds: Bounds } {
  const g = tableGeometry(frame);
  const roles = content.roles ?? new Map<string, MarkRole>();
  const shapes: Shape[] = [];
  const { cellW: w, cellH: h } = g;

  // Headers.
  const colLanes = frame.colHeads ?? 1;
  const rowLanes = (frame.rowHeads ?? [40]).length;
  const colStyle = (k: number): HeadStyle =>
    content.colStyles?.[k] ?? (k === 0 ? 'index' : 'label');
  const rowStyle = (k: number): HeadStyle =>
    content.rowStyles?.[k] ?? (k === 0 && rowLanes > 1 ? 'index' : 'label');
  (content.colHeads ?? []).slice(0, colLanes).forEach((lane, k) => {
    lane.slice(0, frame.cols).forEach((t, c) => {
      if (!t) return;
      const id = `ch-${k}-${c}`;
      const isIndex = colStyle(k) === 'index';
      shapes.push(
        text(id, g.cx(c), g.headY(k), t, isIndex ? 20 : Math.min(24, valueSize(t, w) - 2), {
          mono: true,
          cls: isIndex ? 'index' : undefined,
          weight: isIndex ? 'normal' : 'bold',
          role: roles.get(id),
        }),
      );
    });
  });
  (content.rowHeads ?? []).slice(0, rowLanes).forEach((lane, k) => {
    const lw = (frame.rowHeads ?? [40])[k] ?? 40;
    lane.slice(0, frame.rows).forEach((t, r) => {
      if (!t) return;
      const id = `rh-${k}-${r}`;
      const isIndex = rowStyle(k) === 'index';
      const size = isIndex ? 20 : Math.min(24, valueSize(t, lw));
      shapes.push(
        text(id, g.headX(k), g.cy(r) + size * 0.36, t, size, {
          mono: true,
          cls: isIndex ? 'index' : undefined,
          weight: isIndex ? 'normal' : 'bold',
          role: roles.get(id),
        }),
      );
    });
  });
  (content.corner ?? []).forEach((lane, k) => {
    lane.forEach((t, j) => {
      if (!t) return;
      shapes.push(
        text(`corner-${k}-${j}`, g.headX(j), g.headY(k), t, 17, {
          mono: true,
          cls: 'label',
        }),
      );
    });
  });

  // Cells.
  for (let r = 0; r < frame.rows; r++) {
    for (let c = 0; c < frame.cols; c++) {
      const id = `cell-${r}-${c}`;
      const t = content.values[r]?.[c];
      const filled = t !== null && t !== undefined && t !== '';
      const role = roles.get(id);
      shapes.push({
        kind: 'rect',
        id,
        x: g.left(c),
        y: g.top(r),
        w,
        h,
        r: 2,
        cls: filled ? 'cell live' : 'cell',
        role,
      });
      if (filled) {
        const vid = `val-${r}-${c}`;
        const size = valueSize(t, w);
        shapes.push(
          text(vid, g.cx(c), g.cy(r) + size * 0.36, t, size, {
            weight: 'bold',
            role: roles.get(vid) ?? role,
          }),
        );
      }
    }
  }

  // Links: dependencies of the cell being filled.
  for (const link of content.links ?? []) {
    const id = `link-${link.id}`;
    const role = roles.get(id) ?? link.role;
    if (link.route === 'arc') {
      const lane = link.lane ?? 0;
      const y = g.arcY(lane);
      const top = g.gridTop - 3;
      // Arcs into one cell come down side by side, so they stay apart.
      const x1 = g.cx(link.from[1]) + (lane % 2 ? -1 : 1) * w * 0.2;
      const x2 = g.cx(link.to[1]) + (lane % 2 ? 1 : -1) * w * 0.25;
      const z = 1.5;
      shapes.push({
        kind: 'arrow',
        id: `${id}-up`,
        x1,
        y1: top,
        x2: x1,
        y2: y,
        head: 'none',
        role,
        z,
      });
      shapes.push({ kind: 'arrow', id: `${id}-over`, x1, y1: y, x2, y2: y, head: 'none', role, z });
      shapes.push({ kind: 'arrow', id, x1: x2, y1: y, x2, y2: top, role, z });
      if (link.label) {
        shapes.push(
          text(`${id}-label`, (x1 + x2) / 2, y - 6, link.label, 16, {
            cls: 'label',
            mono: true,
            role,
          }),
        );
      }
      continue;
    }
    const s = route(g, link.from, link.to);
    shapes.push({ kind: 'arrow', id, ...s, role, z: 1.5 });
    if (link.label) {
      // A chip on the middle of the arrow. Routes keep arrows on grid lines and corners, away
      // from the values, so the chip never covers one.
      const mx = (s.x1 + s.x2) / 2;
      const my = (s.y1 + s.y2) / 2;
      const cw = link.label.length * 15 * 0.62 + 10;
      shapes.push({
        kind: 'rect',
        id: `${id}-chip`,
        x: mx - cw / 2,
        y: my - 10,
        w: cw,
        h: 20,
        r: 6,
        cls: 'cell live',
        z: 1.7,
      });
      shapes.push(
        text(`${id}-label`, mx, my + 5, link.label, 15, {
          cls: 'label',
          mono: true,
          weight: 'bold',
          role,
          z: 2.1,
        }),
      );
    }
  }

  // The traceback path.
  const path = content.path ?? [];
  for (let k = 0; k + 1 < path.length; k++) {
    const s = route(g, path[k]!, path[k + 1]!);
    shapes.push({
      kind: 'arrow',
      id: `path-${k}`,
      ...s,
      role: content.pathRole ?? 'active',
      z: 1.6,
    });
  }

  return { shapes, bounds: { x: 0, y: 0, w: g.width, h: g.height } };
}

export interface RowBox {
  text: string;
  /** Center x. */
  x: number;
  role?: MarkRole;
  /** Slide in from here when the box first appears (a value carried down from the table). */
  from?: { x: number; y: number };
  /** Draw only the text, without a box. */
  bare?: boolean;
}

/**
 * A row of boxes under the table: an LCS, an alignment row, the chosen items, call frames.
 * Ids are `<id>-<k>` (box) and `<id>-<k>-t` (text), so give boxes that should keep their
 * identity from step to step the same position k.
 */
export function boxRow(
  id: string,
  y: number,
  boxes: readonly (RowBox | null)[],
  opts: { w: number; h?: number; label?: string; labelX?: number; size?: number },
): Shape[] {
  const h = opts.h ?? 40;
  const shapes: Shape[] = [];
  if (opts.label) {
    shapes.push(
      text(`${id}-label`, opts.labelX ?? 0, y + h / 2 + 6, opts.label, 17, {
        anchor: 'end',
        cls: 'label',
        mono: true,
      }),
    );
  }
  boxes.forEach((b, k) => {
    if (!b) return;
    if (!b.bare) {
      shapes.push({
        kind: 'rect',
        id: `${id}-${k}`,
        x: b.x - opts.w / 2,
        y,
        w: opts.w,
        h,
        r: 6,
        cls: 'cell live',
        role: b.role,
        enterFrom: b.from ? { x: b.from.x - opts.w / 2, y: b.from.y - h / 2 } : undefined,
      });
    }
    const size = opts.size ?? valueSize(b.text, opts.w);
    shapes.push(
      text(`${id}-${k}-t`, b.x, y + h / 2 + size * 0.36, b.text, size, {
        weight: 'bold',
        mono: true,
        role: b.role,
        enterFrom: b.from ? { x: b.from.x, y: b.from.y + size * 0.36 } : undefined,
      }),
    );
  });
  return shapes;
}
