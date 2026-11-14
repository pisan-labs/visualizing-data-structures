/**
 * The drawing: what is running at the top left ("spiral order: shrink four bounds"), the
 * matrix M as a grid (src/layouts/grid.ts) with row and column indices, and the panels the
 * operation needs:
 *
 * - spiral: the path so far as arrows between cells, the dashed box of the four bounds (the
 *   part not visited yet), and the order list, one slot per cell, filling as cells are visited;
 *   walking adds the grid of seen marks, the extra m × n cells;
 * - rotate: the ring being turned (dashed), the diagonal while transposing or the middle line
 *   while reversing rows; copying adds the new matrix B.
 *
 * Values are drawn by uid (`v<uid>`), not by cell, so a rotation shows each value travel to its
 * new cell, and copying shows it fly into B. The panels sit right of M on a wide stage and under
 * it on a tall one; the choice depends only on the operation and the matrix size, so the camera
 * holds still while an operation runs.
 */
import type { MarkRole, StageSize } from '../../engine/types';
import { pickLayout, translate } from '../../layouts/arrange';
import { gridGeometry, gridScene, type GridGeometry } from '../../layouts/grid';
import type { Bounds, Scene, Shape } from '../../render/scene';
import { approachOf } from '../_patterns/kit';
import {
  describe,
  size,
  type Cell,
  type MatrixExtra,
  type MatrixSettings,
  type MatrixStep,
} from './model';

const PAD = 10;
/** Room for the heading above the matrix. */
const TOP = 40;
const HEADING = 20;
const TITLE = 19;
const GAP = 28;
/** Beside M, panels start under the stage's zoom buttons. */
const BESIDE_TOP = 52;
const SLOT = { w: 40, h: 34, pitch: 44, index: 14, value: 18 };
const PER_ROW = 8;

/** Cell size: smaller for bigger matrices, so 6 × 6 still fits a phone. */
const cellFor = (side: number) => (side <= 3 ? 56 : side === 4 ? 52 : side === 5 ? 46 : 40);

const indices = (k: number) => Array.from({ length: k }, (_, i) => String(i));

interface Panel {
  shapes: Shape[];
  w: number;
  h: number;
}

/** Text in a marked cell takes the colors that read well on its tint (as grid.ts does). */
function textRole(role: MarkRole | undefined): MarkRole | undefined {
  return role === 'active' || role === 'error' || role === 'found' || role === 'new'
    ? role
    : undefined;
}

/** A grid of values at (0, 0): the cells from grid.ts, the values drawn by uid. */
function matrixGrid(
  cells: readonly (readonly (Cell | null)[])[],
  rows: number,
  cols: number,
  cell: number,
  roles: ReadonlyMap<string, MarkRole>,
  o: {
    prefix?: string;
    look?: (r: number, c: number) => MarkRole | undefined;
    arrows?: { id: string; from: readonly [number, number]; to: readonly [number, number] }[];
  } = {},
): { shapes: Shape[]; g: GridGeometry; bounds: Bounds } {
  const pre = o.prefix ?? '';
  const frame = { rows, cols, cell };
  const grid = gridScene(frame, {
    wall: () => false,
    cell: (r, c) => {
      const role = o.look?.(r, c);
      return role ? { role } : undefined;
    },
    colNames: indices(cols),
    rowNames: indices(rows),
    roles,
    prefix: pre,
    arrows: o.arrows,
  });
  const g = grid.geometry;
  const shapes = [...grid.shapes];
  const size = Math.round(cell * 0.4);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const x = cells[r]?.[c];
      if (!x) continue;
      const boxRole = roles.get(`${pre}cell-${r}-${c}`) ?? o.look?.(r, c);
      shapes.push({
        kind: 'text',
        id: x.stale ? `${pre}ghost-${r}-${c}` : `v${x.uid}`,
        x: g.cx(c),
        y: g.cy(r) + size * 0.36,
        text: String(x.value),
        size,
        anchor: 'middle',
        weight: x.stale ? 'normal' : 'bold',
        mono: true,
        role: x.stale ? 'stale' : (roles.get(`v${x.uid}`) ?? textRole(boxRole)),
        z: 2.2,
      });
    }
  return { shapes, g, bounds: grid.bounds };
}

const title = (id: string, text: string, dx: number, dy: number): Shape => ({
  kind: 'text',
  id,
  x: dx + PAD,
  y: dy + 20,
  text,
  size: TITLE,
  cls: 'label',
  mono: true,
});

/** The order list: one slot per cell, filled with the values visited so far. */
function orderPanel(
  e: MatrixExtra,
  roles: ReadonlyMap<string, MarkRole>,
  from: (k: number) => { x: number; y: number },
): (dx: number, dy: number) => Panel {
  const total = e.total ?? 0;
  const per = Math.min(PER_ROW, total);
  const lines = Math.ceil(total / per);
  const w = PAD + per * SLOT.pitch + PAD;
  const h = 30 + lines * (SLOT.h + SLOT.index + 10);
  return (dx, dy) => {
    const shapes: Shape[] = [title('order-title', 'order visited', dx, dy)];
    for (let k = 0; k < total; k++) {
      const x = dx + PAD + (k % per) * SLOT.pitch;
      const y = dy + 30 + Math.floor(k / per) * (SLOT.h + SLOT.index + 10);
      const id = `out-${k}`;
      const v = e.out?.[k];
      const role = roles.get(id);
      shapes.push({
        kind: 'rect',
        id,
        x,
        y,
        w: SLOT.w,
        h: SLOT.h,
        r: 4,
        cls: v === undefined ? 'cell' : 'live',
        role,
      });
      if (v !== undefined)
        shapes.push({
          kind: 'text',
          id: `${id}-t`,
          x: x + SLOT.w / 2,
          y: y + SLOT.h / 2 + SLOT.value * 0.36,
          text: String(v),
          size: SLOT.value,
          anchor: 'middle',
          weight: 'bold',
          mono: true,
          role: textRole(role),
          enterFrom: from(k),
        });
      shapes.push({
        kind: 'text',
        id: `${id}-i`,
        x: x + SLOT.w / 2,
        y: y + SLOT.h + SLOT.index + 1,
        text: String(k + 1),
        size: SLOT.index,
        anchor: 'middle',
        cls: 'index',
        mono: true,
      });
    }
    return { shapes, w, h };
  };
}

export function view(step: MatrixStep, settings: MatrixSettings, stage?: StageSize): Scene {
  const s = step.state;
  const e = step.extra;
  const { rows, cols } = size(s);
  const cell = cellFor(Math.max(rows, cols));
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const naive = approachOf(settings) === 'naive';

  // The matrix, at (0, TOP).
  const visited = new Set((e?.path ?? []).map(([r, c]) => `${r}-${c}`));
  const path = e?.path ?? [];
  const main = matrixGrid(s.m, rows, cols, cell, roles, {
    look: (r, c) => (visited.has(`${r}-${c}`) ? 'visit' : undefined),
    arrows: path.slice(1).map((to, k) => ({ id: `path-${k}`, from: path[k]!, to })),
  });
  const g = main.g;
  const shapes: Shape[] = translate(main.shapes, 0, TOP);
  const cx = (c: number) => g.cx(c);
  const cy = (r: number) => g.cy(r) + TOP;

  if (e?.bounds && e.bounds.top <= e.bounds.bottom && e.bounds.left <= e.bounds.right) {
    const b = e.bounds;
    shapes.push({
      kind: 'rect',
      id: 'bounds',
      x: g.left(b.left) + 4,
      y: g.top(b.top) + TOP + 4,
      w: (b.right - b.left + 1) * cell - 8,
      h: (b.bottom - b.top + 1) * cell - 8,
      r: 6,
      cls: 'ghost',
      z: 2.1,
    });
  }
  if (e?.ring) {
    const { first, last } = e.ring;
    shapes.push({
      kind: 'rect',
      id: 'ring',
      x: g.left(first) - 4,
      y: g.top(first) + TOP - 4,
      w: (last - first + 1) * cell + 8,
      h: (last - first + 1) * cell + 8,
      r: 6,
      cls: 'ghost',
      z: 2.1,
    });
  }
  if (e?.guide === 'diagonal')
    shapes.push({
      kind: 'arrow',
      id: 'guide',
      x1: g.gridLeft,
      y1: g.gridTop + TOP,
      x2: g.gridRight,
      y2: g.gridBottom + TOP,
      head: 'none',
      dashed: true,
      z: 2.1,
    });
  if (e?.guide === 'middle')
    shapes.push({
      kind: 'arrow',
      id: 'guide',
      x1: (g.gridLeft + g.gridRight) / 2,
      y1: g.gridTop + TOP - 6,
      x2: (g.gridLeft + g.gridRight) / 2,
      y2: g.gridBottom + TOP + 6,
      head: 'none',
      dashed: true,
      z: 2.1,
    });

  // The panels, each drawn once it is placed.
  const makers: ((dx: number, dy: number) => Panel)[] = [];
  const sizes: { w: number; h: number }[] = [];
  if (e?.op === 'spiral' && naive && e.seen) {
    const seenCell = Math.round(cell * 0.6);
    const seen = e.seen;
    const geo = gridGeometry({ rows, cols, cell: seenCell });
    sizes.push({ w: geo.width, h: geo.height + 14 });
    makers.push((dx, dy) => {
      const grid = gridScene(
        { rows, cols, cell: seenCell },
        {
          wall: () => false,
          cell: (r, c) => (seen[r]?.[c] ? { text: '✓', role: 'visit' } : undefined),
          colNames: Array(cols).fill(''),
          rowNames: Array(rows).fill(''),
          roles,
          prefix: 'seen-',
        },
      );
      return {
        shapes: [
          title('seen-title', `seen: ${rows * cols} extra cells`, dx, dy),
          ...translate(grid.shapes, dx, dy + 14),
        ],
        w: geo.width,
        h: geo.height + 14,
      };
    });
  }
  if (e?.op === 'spiral') {
    const order = orderPanel(e, roles, (k) => {
      const [r, c] = path[k] ?? [0, 0];
      return { x: cx(c), y: cy(r) };
    });
    const probe = order(0, 0);
    sizes.push({ w: probe.w, h: probe.h });
    makers.push(order);
  }
  if (e?.b) {
    const b = e.b;
    const geo = gridGeometry({ rows, cols, cell });
    sizes.push({ w: geo.width, h: geo.height + 14 });
    makers.push((dx, dy) => {
      const grid = matrixGrid(b, rows, cols, cell, roles, { prefix: 'b-' });
      return {
        shapes: [
          title('b-title', 'B, the new matrix', dx, dy),
          ...translate(grid.shapes, dx, dy + 14),
        ],
        w: geo.width,
        h: geo.height + 14,
      };
    });
  }

  const heading = e?.heading ?? '';
  const headW = heading ? PAD + heading.length * HEADING * 0.6 + PAD : 0;
  const mainBox = { w: g.width, h: TOP + g.height };
  type Place = { bounds: Bounds; at: { x: number; y: number }[] };
  const place = (where: 'row' | 'column' | 'under'): Place => {
    const at: { x: number; y: number }[] = [];
    let x = mainBox.w + GAP;
    let y = where === 'under' ? mainBox.h + GAP / 2 : BESIDE_TOP;
    let w = Math.max(mainBox.w, headW);
    let h = mainBox.h;
    for (const p of sizes) {
      if (where === 'row') {
        at.push({ x, y });
        x += p.w + GAP;
      } else if (where === 'column') {
        at.push({ x: mainBox.w + GAP, y });
        y += p.h + GAP / 2;
      } else {
        at.push({ x: 0, y });
        y += p.h + GAP / 2;
      }
      const last = at[at.length - 1]!;
      w = Math.max(w, last.x + p.w);
      h = Math.max(h, last.y + p.h);
    }
    return { bounds: { x: 0, y: 0, w: w + PAD, h: h + PAD }, at };
  };
  const options = sizes.length ? [place('row'), place('column'), place('under')] : [place('row')];
  const chosen = pickLayout(stage, options);
  makers.forEach((make, k) => shapes.push(...make(chosen.at[k]!.x, chosen.at[k]!.y).shapes));

  if (heading)
    shapes.push({
      kind: 'text',
      id: 'heading',
      x: PAD,
      y: 28,
      text: heading,
      size: HEADING,
      weight: 'bold',
      mono: true,
    });

  return { shapes, bounds: chosen.bounds, label: label(step) };
}

function label(step: MatrixStep): string {
  const e = step.extra;
  const parts = [describe(step.state)];
  if (!e) return parts[0]!;
  if (e.out)
    parts.push(`Visited ${e.out.length} of ${e.total}: ${e.out.join(', ') || 'none yet'}.`);
  if (e.bounds) {
    const b = e.bounds;
    parts.push(`Bounds: top ${b.top}, bottom ${b.bottom}, left ${b.left}, right ${b.right}.`);
  }
  if (e.ring) parts.push(`Turning the ring from row and column ${e.ring.first} to ${e.ring.last}.`);
  if (e.b)
    parts.push(
      `B by rows: ${e.b.map((row) => row.map((x) => (x ? x.value : 'empty')).join(' ')).join('; ')}.`,
    );
  return parts.join(' ');
}
