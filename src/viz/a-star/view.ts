/**
 * A*: the grid, and under it the open set as a priority queue, least f first. On a stage, the
 * open set may wrap shorter lines under the grid (a phone) or stand beside it two to a line (a
 * laptop), whichever is drawn largest; it holds 14 entries in every arrangement.
 * Each cell found shows f in the middle, g at its top left and h at its top right. The cell
 * being expanded is blue, open cells are teal, closed cells are green, and once T comes out of
 * the open set the path is purple, with arrows from S on. A plain state (no run, as in
 * practice pictures) draws just the grid.
 */
import type { MarkRole, StageSize, Step } from '../../engine/types';
import { pickLayout } from '../../layouts/arrange';
import { clearOfButtons, drawRow, type PanelCell } from '../../layouts/graph';
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
/** Entries the open set shows (the last box says how many more there are). */
const MAX = 14;

/** Where the open set goes: under the grid (`perRow` boxes a line) or beside it. */
interface Arrangement {
  perRow: number;
  beside: boolean;
  /** Cell size: a little smaller to fit a phone's width. */
  cell: number;
}

const UNDER: Arrangement = { perRow: 7, beside: false, cell: CELL };
const ARRANGEMENTS: Arrangement[] = [
  UNDER,
  { perRow: 5, beside: false, cell: 42 },
  { perRow: 2, beside: true, cell: CELL },
];

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

export function view(
  step: Step<AStarState, AStarExtra>,
  settings: AStarSettings,
  stage?: StageSize,
): Scene {
  if (!stage) return draw(step, settings, UNDER);
  return pickLayout(
    stage,
    ARRANGEMENTS.map((a) => draw(step, settings, a, stage)),
  );
}

function draw(
  step: Step<AStarState, AStarExtra>,
  settings: AStarSettings,
  { perRow, beside, cell }: Arrangement,
  stage?: StageSize,
): Scene {
  const g = step.state.grid;
  const r = step.extra?.run;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const cols = colsOf(g);
  const eight = settings.moves === '8';
  const lines = Math.ceil(MAX / perRow);
  const panelW = Q_LABEL + perRow * (Q_CELL + 4) + 20;
  const drawn = gridScene(
    {
      rows: rowsOf(g),
      cols,
      cell,
      corner: 13,
      below: beside ? 0 : lines * 46,
      minWidth: beside ? 0 : panelW,
    },
    {
      wall: (row, c) => g.lines[row]![c] === '#',
      cell: (row, c) => cellLook(g, row * cols + c, r, eight),
      arrows: r ? pathArrows(g, r) : [],
      roles,
    },
  );
  const geo = drawn.geometry;
  const shapes: Shape[] = drawn.shapes;
  // Beside the grid, the open set starts at the grid's top, or lower to clear the zoom buttons.
  const block = beside
    ? clearOfButtons(
        { x: geo.width, y: geo.gridTop, w: panelW - 14, h: lines * 46 },
        // The grid, less the 14 units clearOfButtons pads a scene by: this one is not padded.
        { x: 14, y: 14, w: geo.width - 28, h: geo.height - 28 },
        stage ?? { w: 0, h: 0, strip: true },
      )
    : { x: 10, y: geo.belowTop, w: 0, h: 0 };
  if (r) {
    const shown = r.open.length > MAX ? r.open.slice(0, MAX - 1) : r.open;
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
      x: beside ? geo.width + 10 : 10,
      y: block.y,
      roles,
      perRow,
      cellW: Q_CELL,
      ends: ['least f', 'most f'],
    });
  }
  // Beside, the room for the open set is kept with or without a run, so the grid stays put.
  const bounds = beside
    ? { x: 0, y: 0, w: geo.width + panelW, h: Math.max(geo.height, block.y + block.h + 14) }
    : drawn.bounds;
  const label = r ? `${describe(step.state)} ${describeRun(g, r)}` : describe(step.state);
  return { shapes, bounds, label };
}
