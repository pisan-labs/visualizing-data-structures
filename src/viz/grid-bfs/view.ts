/**
 * Grid BFS: the grid, and under it the queue, front first.
 * During a run each found cell carries its distance d, with a short arrow to its parent. The
 * cell being expanded is blue, cells waiting in the queue are teal, cells that have left it
 * are green, and once T leaves the queue the path from S to T is purple, with arrows from S
 * on. A plain state (no run, as in practice pictures) draws just the grid.
 */
import type { MarkRole, Step } from '../../engine/types';
import { drawRow, type PanelCell } from '../../layouts/graph';
import { gridScene, type GridArrow, type GridCellLook } from '../../layouts/grid';
import type { Scene, Shape } from '../../render/scene';
import { cellName, colsOf, rc, rowsOf, startOf, targetOf, type Grid } from '../_grid/grid';
import {
  describe,
  describeRun,
  type BfsGridExtra,
  type BfsGridSettings,
  type BfsGridState,
  type GridRun,
} from './model';

const CELL = 40;
const Q_CELL = 40;
const Q_LABEL = 30;

/** Queue boxes per line, and lines of them, reserved under the grid. */
const PER_ROW = 10;
const LINES = 2;

export function cellLook(g: Grid, k: number, r: GridRun | undefined): GridCellLook {
  const tag = k === startOf(g) ? 'S' : k === targetOf(g) ? 'T' : undefined;
  if (!r || r.d[k]! < 0) return { text: tag };
  let role: MarkRole | undefined;
  if (r.end === 'found' && r.path.includes(k)) role = 'found';
  else if (k === r.u) role = 'active';
  else if (r.queue.includes(k)) role = 'visit';
  else if (r.order.includes(k)) role = 'done';
  return { text: String(r.d[k]), tag, role };
}

export function parentArrows(g: Grid, r: GridRun): GridArrow[] {
  const onPath = new Set(r.end === 'found' ? r.path : []);
  const out: GridArrow[] = [];
  r.pi.forEach((p, k) => {
    if (p < 0 || onPath.has(k)) return;
    out.push({ id: `pi-${k}`, from: rc(g, k), to: rc(g, p) });
  });
  if (r.end === 'found') {
    for (let i = 0; i + 1 < r.path.length; i++) {
      out.push({
        id: `path-${i}`,
        from: rc(g, r.path[i]!),
        to: rc(g, r.path[i + 1]!),
        role: 'found',
      });
    }
  }
  return out;
}

export function view(step: Step<BfsGridState, BfsGridExtra>, _settings?: BfsGridSettings): Scene {
  const g = step.state.grid;
  const r = step.extra?.run;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const rows = rowsOf(g);
  const cols = colsOf(g);
  const drawn = gridScene(
    {
      rows,
      cols,
      cell: CELL,
      below: LINES * 46,
      minWidth: Q_LABEL + PER_ROW * (Q_CELL + 4) + 20,
    },
    {
      wall: (row, c) => g.lines[row]![c] === '#',
      cell: (row, c) => cellLook(g, row * cols + c, r),
      arrows: r ? parentArrows(g, r) : [],
      roles,
    },
  );
  const shapes: Shape[] = drawn.shapes;
  if (r) {
    const geo = drawn.geometry;
    // A long queue shows its front, how many are hidden, and its back (where cells join).
    const max = PER_ROW * LINES;
    const q = r.queue;
    const box = (k: number): PanelCell => ({
      key: String(k),
      text: cellName(g, k),
      from: { x: geo.cx(k % cols), y: geo.cy(Math.floor(k / cols)) },
    });
    const cells: PanelCell[] =
      q.length > max
        ? [
            ...q.slice(0, max - 2).map(box),
            { key: 'more', text: `+${q.length - max + 1}` },
            box(q[q.length - 1]!),
          ]
        : q.map(box);
    drawRow(shapes, {
      id: 'q',
      label: 'Q',
      labelW: Q_LABEL,
      cells,
      x: 10,
      y: geo.belowTop,
      roles,
      perRow: PER_ROW,
      cellW: Q_CELL,
      ends: ['front', 'back'],
    });
  }
  const label = r ? `${describe(step.state)} ${describeRun(g, r)}` : describe(step.state);
  return { shapes, bounds: drawn.bounds, label };
}
