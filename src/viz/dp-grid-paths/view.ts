import type { MarkRole, StageSize, Step } from '../../engine/types';
import { gridScene, type GridArrow, type GridFrame } from '../../layouts/grid';
import type { Scene } from '../../render/scene';
import { approachOf } from '../_patterns/kit';
import { callsLabel, fmt } from '../_dp2/kit';
import { describe, name, WALL, type GPExtra, type GPSettings, type GPState } from './model';

const CELL = 66;
const CORNER = 14;
const VALUE = 24;

/**
 * The grid is the table: each open cell shows its value in the middle, its cost at the top
 * left (for the cheapest path), and how many calls it has had at the top right (recursion). The
 * start is tagged S and the target T. Filling a cell draws arrows in from the cell above and
 * the cell to the left (the cheaper one highlighted); recursion draws the calls on the stack as
 * dashed arrows from each caller to the cell it asks; the trace draws the path, start to target.
 */
export function view(step: Step<GPState, GPExtra>, settings: GPSettings, _stage?: StageSize): Scene {
  const { state, extra = {} } = step;
  const R = state.grid.length;
  const C = state.grid[0]!.length;
  const mincost = settings.problem === 'mincost';
  const recursion = approachOf(settings) === 'naive' || settings.fill === 'memo';
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const frame: GridFrame = { rows: R, cols: C, cell: CELL, corner: CORNER };
  const arrows: GridArrow[] = [];
  const stack = extra.stack ?? [];
  for (let k = 1; k < stack.length; k++)
    arrows.push({
      id: `call-${k}`,
      from: stack[k - 1]!,
      to: stack[k]!,
      dashed: true,
      role: k === stack.length - 1 ? 'active' : undefined,
    });
  for (const rd of extra.reads ?? [])
    arrows.push({
      id: rd.from[0] < rd.to[0] ? 'in-up' : 'in-left',
      from: rd.from,
      to: rd.to,
      role: rd.win ? 'active' : undefined,
    });
  const path = extra.path ?? [];
  // The walk goes back from the target; its arrows point the way the robot moves.
  for (let k = 0; k + 1 < path.length; k++)
    arrows.push({ id: `path-${k}`, from: path[k + 1]!, to: path[k]!, role: 'found' });

  const { shapes, bounds } = gridScene(frame, {
    wall: (r, c) => state.grid[r]![c] === WALL,
    cell: (r, c) => {
      const t = state.T[r]![c] ?? extra.seen?.[r]?.[c] ?? null;
      const k = extra.calls?.[r]?.[c] ?? 0;
      return {
        text: t === null ? undefined : fmt(t),
        size: VALUE,
        tl: mincost ? `+${state.grid[r]![c]}` : undefined,
        tr: recursion && k > 0 ? callsLabel(k) : undefined,
        tag: r === 0 && c === 0 ? 'S' : r === R - 1 && c === C - 1 ? 'T' : undefined,
      };
    },
    arrows,
    colNames: Array.from({ length: C }, (_, c) => String(c)),
    rowNames: Array.from({ length: R }, (_, r) => String(r)),
    roles,
  });
  return { shapes, bounds, label: label(step, settings) };
}

function label(step: Step<GPState, GPExtra>, settings: GPSettings): string {
  const parts = [describe(step.state, settings)];
  const stack = step.extra?.stack ?? [];
  if (stack.length) parts.push(`Calls on the stack, from the target: ${stack.map(name).join(', ')}.`);
  const path = step.extra?.path ?? [];
  if (path.length) parts.push(`Path traced back so far: ${path.map(name).join(', ')}.`);
  return parts.join(' ');
}
