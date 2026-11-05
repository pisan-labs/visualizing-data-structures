/**
 * Grid layout: a board of square cells, open or wall, with column letters above and row
 * numbers to the left. Used by the grid-bfs and a-star pages; any page that searches a grid
 * (flood fill, a maze, a game board) can reuse it.
 *
 * Call `gridScene(frame, content)` from a view and wrap the result in a Scene with a label.
 * Pages that draw more under the grid (a queue, a priority queue) reserve room with
 * `frame.below` and place their shapes from `gridGeometry(frame).belowTop`.
 *
 * - `frame` fixes the framing. Keep it the same for every step of an operation, so the camera
 *   stays still: `rows` x `cols` cells of `cell` units (default 40), and `below` units of room
 *   under the grid.
 * - `content` is what this step shows:
 *   - `wall(r, c)`: whether a cell is a wall. Walls are drawn gray and hatched with three
 *     diagonal lines, so they do not rest on color alone.
 *   - `cell(r, c)`: an open cell's look: `text` in the middle (a distance, f), small corner
 *     labels (`tl`, `tr`, `bl`, `br`: g, h), a bold `tag` at the bottom left (S, T), a `role`
 *     that stays (frontier, closed, path), and `dim` to fade it.
 *   - `arrows`: short arrows between neighbouring cells (8 directions), across their shared
 *     edge or corner, clear of the middle text: parent pointers, or the steps of a path.
 *   - `colNames`, `rowNames`: the header labels. Default A, B, C... and 1, 2, 3...
 *   - `roles`: the step's marks by shape id. A mark beats the role from `cell`.
 *
 * Shape ids (use them as mark ids):
 * - `cell-<r>-<c>`: a cell. Marking it colors its box and its middle text (`cell-<r>-<c>-t`)
 *   unless that text has a mark of its own. Corner labels are `cell-<r>-<c>-tl` and so on, the tag `cell-<r>-<c>-tag`.
 * - `wall-<r>-<c>-<k>`: the hatch lines of a wall, k = 0, 1, 2.
 * - `<arrow id>`: an arrow, with the id the page gave it.
 * - `gcol-<c>`, `grow-<r>`: the header labels.
 *
 * Sizes are in scene units. A 10 x 14 grid of 40-unit cells is 600 units wide with its
 * headers, so a phone in portrait (about 362 px of drawing) shows the middle text near 10 px
 * and a laptop shows it bigger.
 */
import type { MarkRole } from '../engine/types';
import type { Bounds, Shape } from '../render/scene';

/** A cell position: [row, column]. */
export type GridCell = readonly [r: number, c: number];

export interface GridFrame {
  rows: number;
  cols: number;
  /** Cell size. Default 40. */
  cell?: number;
  /** Units reserved under the grid. Default 0. */
  below?: number;
  /** The drawing is at least this wide (the grid is centered in it). Default 0. */
  minWidth?: number;
}

export interface GridCellLook {
  text?: string;
  /** Font size of the middle text. Default: about 0.4 of the cell. */
  size?: number;
  tl?: string;
  tr?: string;
  bl?: string;
  br?: string;
  /** A bold label at the bottom left, such as S or T. */
  tag?: string;
  role?: MarkRole;
  dim?: boolean;
}

export interface GridArrow {
  id: string;
  from: GridCell;
  /** A neighbour of `from`, up to one row and one column away. */
  to: GridCell;
  role?: MarkRole;
  dashed?: boolean;
}

export interface GridContent {
  wall(r: number, c: number): boolean;
  cell?(r: number, c: number): GridCellLook | undefined;
  arrows?: readonly GridArrow[];
  colNames?: readonly string[];
  rowNames?: readonly string[];
  roles?: ReadonlyMap<string, MarkRole>;
}

export interface GridGeometry {
  cell: number;
  width: number;
  height: number;
  /** Left and top edges of column c and row r, and their centers. */
  left(c: number): number;
  top(r: number): number;
  cx(c: number): number;
  cy(r: number): number;
  gridLeft: number;
  gridTop: number;
  gridRight: number;
  gridBottom: number;
  /** Top of the room reserved below. */
  belowTop: number;
}

const PAD = 10;
/** Room for the column letters above the grid and the row numbers left of it. */
const HEAD = 26;

export const cellShapeId = (r: number, c: number) => `cell-${r}-${c}`;

/** A, B, ... Z, then AA, AB... */
export function columnName(c: number): string {
  let s = '';
  let n = c + 1;
  while (n > 0) {
    const k = (n - 1) % 26;
    s = String.fromCharCode(65 + k) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export function gridGeometry(frame: GridFrame): GridGeometry {
  const cell = frame.cell ?? 40;
  const natural = HEAD + frame.cols * cell + 2 * PAD;
  const width = Math.max(natural, frame.minWidth ?? 0);
  const gridLeft = (width - natural) / 2 + PAD + HEAD;
  const gridTop = PAD + HEAD;
  const gridRight = gridLeft + frame.cols * cell;
  const gridBottom = gridTop + frame.rows * cell;
  const belowTop = gridBottom + 14;
  const height = (frame.below ? belowTop + frame.below : gridBottom) + PAD;
  return {
    cell,
    width,
    height,
    left: (c) => gridLeft + c * cell,
    top: (r) => gridTop + r * cell,
    cx: (c) => gridLeft + c * cell + cell / 2,
    cy: (r) => gridTop + r * cell + cell / 2,
    gridLeft,
    gridTop,
    gridRight,
    gridBottom,
    belowTop,
  };
}

/**
 * Where an arrow between two neighbouring cells starts and ends: across the shared edge (or
 * corner), from just outside the middle text of one cell to just outside that of the other.
 */
export function arrowEnds(
  g: GridGeometry,
  from: GridCell,
  to: GridCell,
): { x1: number; y1: number; x2: number; y2: number } {
  const ax = g.cx(from[1]);
  const ay = g.cy(from[0]);
  const bx = g.cx(to[1]);
  const by = g.cy(to[0]);
  const len = Math.hypot(bx - ax, by - ay) || 1;
  const ux = (bx - ax) / len;
  const uy = (by - ay) / len;
  const diagonal = from[0] !== to[0] && from[1] !== to[1];
  // Orthogonal: 0.36 of a cell from each center, so the arrow is mostly its head. Diagonal: closer to the shared corner.
  const trim = g.cell * (diagonal ? 0.5 : 0.36);
  return {
    x1: ax + ux * trim,
    y1: ay + uy * trim,
    x2: bx - ux * trim,
    y2: by - uy * trim,
  };
}

export function gridScene(
  frame: GridFrame,
  content: GridContent,
): { shapes: Shape[]; bounds: Bounds; geometry: GridGeometry } {
  const g = gridGeometry(frame);
  const roles = content.roles ?? new Map<string, MarkRole>();
  const shapes: Shape[] = [];
  const cell = g.cell;
  const small = Math.max(10, Math.round(cell * 0.28));

  for (let c = 0; c < frame.cols; c++) {
    shapes.push({
      kind: 'text',
      id: `gcol-${c}`,
      x: g.cx(c),
      y: g.gridTop - 8,
      text: content.colNames?.[c] ?? columnName(c),
      size: 13,
      anchor: 'middle',
      cls: 'index',
      mono: true,
    });
  }
  for (let r = 0; r < frame.rows; r++) {
    shapes.push({
      kind: 'text',
      id: `grow-${r}`,
      x: g.gridLeft - 8,
      y: g.cy(r) + 4.5,
      text: content.rowNames?.[r] ?? String(r + 1),
      size: 13,
      anchor: 'end',
      cls: 'index',
      mono: true,
    });
  }

  for (let r = 0; r < frame.rows; r++) {
    for (let c = 0; c < frame.cols; c++) {
      const id = cellShapeId(r, c);
      const x = g.left(c);
      const y = g.top(r);
      if (content.wall(r, c)) {
        shapes.push({ kind: 'rect', id, x, y, w: cell, h: cell, r: 0, role: roles.get(id) });
        // Three hatch lines, corner to corner and halfway either side.
        const lines: [number, number, number, number][] = [
          [x + 3, y + cell / 2, x + cell / 2, y + 3],
          [x + 3, y + cell - 3, x + cell - 3, y + 3],
          [x + cell / 2, y + cell - 3, x + cell - 3, y + cell / 2],
        ];
        lines.forEach(([x1, y1, x2, y2], k) =>
          shapes.push({
            kind: 'arrow',
            id: `wall-${r}-${c}-${k}`,
            x1,
            y1,
            x2,
            y2,
            head: 'none',
            cls: 'hatch',
            z: 1.5,
          }),
        );
        continue;
      }
      const look = content.cell?.(r, c);
      const role = roles.get(id) ?? look?.role;
      const opacity = look?.dim ? 0.5 : undefined;
      shapes.push({ kind: 'rect', id, x, y, w: cell, h: cell, r: 0, cls: 'live', role });
      if (look?.text) {
        const size = look.size ?? Math.round(cell * 0.4);
        const tid = `${id}-t`;
        shapes.push({
          kind: 'text',
          id: tid,
          x: g.cx(c),
          y: g.cy(r) + size * 0.36,
          text: look.text,
          size,
          anchor: 'middle',
          weight: 'bold',
          mono: true,
          role: roles.get(tid) ?? textRole(role),
          opacity,
        });
      }
      const corner = (key: 'tl' | 'tr' | 'bl' | 'br', text: string | undefined) => {
        if (!text) return;
        const right = key[1] === 'r';
        const bottom = key[0] === 'b';
        const cid = `${id}-${key}`;
        shapes.push({
          kind: 'text',
          id: cid,
          x: right ? x + cell - 3 : x + 3,
          y: bottom ? y + cell - 4 : y + small,
          text,
          size: small,
          anchor: right ? 'end' : 'start',
          mono: true,
          cls: roles.has(cid) ? undefined : 'label',
          role: roles.get(cid),
          opacity,
        });
      };
      if (look?.tag) {
        shapes.push({
          kind: 'text',
          id: `${id}-tag`,
          x: x + 3,
          y: y + cell - 4,
          text: look.tag,
          size: small + 1,
          weight: 'bold',
          mono: true,
          role: roles.get(`${id}-tag`),
          opacity,
        });
      }
      corner('tl', look?.tl);
      corner('tr', look?.tr);
      corner('bl', look?.bl);
      corner('br', look?.br);
    }
  }

  for (const a of content.arrows ?? []) {
    shapes.push({
      kind: 'arrow',
      id: a.id,
      ...arrowEnds(g, a.from, a.to),
      role: roles.get(a.id) ?? a.role,
      dashed: a.dashed,
      z: 3,
    });
  }

  return { shapes, bounds: { x: 0, y: 0, w: g.width, h: g.height }, geometry: g };
}

/** Text in a marked cell takes the colors that read well on its tint. */
function textRole(role: MarkRole | undefined): MarkRole | undefined {
  return role === 'active' || role === 'error' || role === 'found' || role === 'new'
    ? role
    : undefined;
}
