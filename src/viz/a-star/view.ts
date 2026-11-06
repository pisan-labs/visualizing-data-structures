/**
 * A*: the grid, and under it the open set as a priority queue, least f first.
 * Each cell found shows f in the middle, g at its top left and h at its top right. The cell
 * being expanded is blue, open cells are teal, closed cells are green, and once T comes out of
 * the open set the path is purple, with arrows from S on. A plain state (no run, as in
 * practice pictures) draws just the grid.
 */
import type { MarkRole, Step } from '../../engine/types';
import { drawRow, type PanelCell } from '../../layouts/graph';
import { gridScene, type GridArrow, type GridCellLook } from '../../layouts/grid';
import type { Scene, Shape } from '../../render/scene';
import { cellName, colsOf, rc, rowsOf, startOf, targetOf, type Grid } from '../_grid/grid';
import {
  describe,
  describeRun,
  fmt,
  type AStarExtra,
  type AStarRun,
  type AStarSettings,
  type AStarState,
} from './model';

const CELL = 46;
const Q_CELL = 66;
const Q_LABEL = 56;
const PER_ROW = 7;
const LINES = 2;

export const openId = (k: number) => `pq-${k}`;

function cellLook(g: Grid, k: number, r: AStarRun | undefined, eight: boolean): GridCellLook {
  const tag = k === startOf(g) ? 'S' : k === targetOf(g) ? 'T' : undefined;
  if (!r || r.g[k]! < 0) return { text: tag, size: 18 };
  const onPath = r.end === 'found' && r.path.includes(k);
  let role: MarkRole | undefined;
  if (onPath) role = 'found';
  else if (k === r.u) role = 'active';
  else if (r.open.some((e) => e.k === k)) role = 'visit';
  else if (r.closed.includes(k)) role = 'done';
  // Diagonal path arrows cross the corners, so the path's own cells drop g and h at the end.
  const corners = !(onPath && eight);
  return {
    text: fmt(r.f[k]!),
    size: 15,
    tl: corners ? fmt(r.g[k]!) : undefined,
    tr: corners ? fmt(r.h[k]!) : undefined,
    tag,
    role,
  };
}

function pathArrows(g: Grid, r: AStarRun): GridArrow[] {
  if (r.end !== 'found') return [];
  const out: GridArrow[] = [];
  for (let i = 0; i + 1 < r.path.length; i++)
    out.push({
      id: `path-${i}`,
      from: rc(g, r.path[i]!),
      to: rc(g, r.path[i + 1]!),
      role: 'found',
    });
  return out;
}

export function view(step: Step<AStarState, AStarExtra>, settings: AStarSettings): Scene {
  const g = step.state.grid;
  const r = step.extra?.run;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const cols = colsOf(g);
  const eight = settings.moves === '8';
  const drawn = gridScene(
    {
      rows: rowsOf(g),
      cols,
      cell: CELL,
      below: LINES * 46,
      minWidth: Q_LABEL + PER_ROW * (Q_CELL + 4) + 20,
    },
    {
      wall: (row, c) => g.lines[row]![c] === '#',
      cell: (row, c) => cellLook(g, row * cols + c, r, eight),
      arrows: r ? pathArrows(g, r) : [],
      roles,
    },
  );
  const shapes: Shape[] = drawn.shapes;
  if (r) {
    const geo = drawn.geometry;
    const max = PER_ROW * LINES;
    const shown = r.open.length > max ? r.open.slice(0, max - 1) : r.open;
    const cells: PanelCell[] = shown.map((e) => ({
      key: String(e.k),
      text: `${cellName(g, e.k)}:${fmt(e.f)}`,
      role: e.k === r.v ? 'new' : undefined,
      from: { x: geo.cx(e.k % cols), y: geo.cy(Math.floor(e.k / cols)) },
    }));
    if (shown.length < r.open.length)
      cells.push({ key: 'more', text: `+${r.open.length - shown.length}` });
    drawRow(shapes, {
      id: 'pq',
      label: 'OPEN',
      labelW: Q_LABEL,
      cells,
      x: 10,
      y: geo.belowTop,
      roles,
      perRow: PER_ROW,
      cellW: Q_CELL,
      ends: ['least f', 'most f'],
    });
  }
  const label = r ? `${describe(step.state)} ${describeRun(g, r)}` : describe(step.state);
  return { shapes, bounds: drawn.bounds, label };
}
