import type { MarkRole, StageSize, Step } from '../../engine/types';
import { pickLayout } from '../../layouts/arrange';
import type { Scene, Shape } from '../../render/scene';
import {
  boxRow,
  tableGeometry,
  tableScene,
  type TableFrame,
  type TableLink,
} from '../../layouts/table';
import { describe, frameId, type FibExtra, type FibSettings, type FibState } from './model';

const FRAMES_H = 44;
/** The narrowest cell the table draws (src/layouts/table.ts), for a phone. */
const NARROW_CELL = 44;

/**
 * One row, F[0..n], with the indices under it and arcs over it from the two cells a value
 * reads. Top-down, the calls on the stack sit in a row below, each under its own cell. On a
 * narrow stage (a phone) the cells are narrower, the narrowest the table allows, so the row is
 * drawn larger.
 */
export function view(
  step: Step<FibState, FibExtra>,
  settings: FibSettings,
  stage?: StageSize,
): Scene {
  const { state, extra = {} } = step;
  const memo = settings.style === 'memo';
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const frameFor = (cellW?: number): TableFrame => ({
    rows: 1,
    cols: state.n + 1,
    colHeads: 1,
    colHeadsAt: 'below',
    rowHeads: [memo ? 70 : 48],
    arcLanes: 2,
    below: memo ? FRAMES_H + 4 : 0,
    cellW,
  });
  const frame = pickLayout(
    stage,
    [frameFor(), frameFor(NARROW_CELL)].map((f) => {
      const t = tableGeometry(f);
      return { f, bounds: { x: 0, y: 0, w: t.width, h: t.height } };
    }),
  ).f;
  const g = tableGeometry(frame);
  const links: TableLink[] = (extra.reads ?? []).map((from, k) => ({
    id: `read-${k}`,
    from: [0, from],
    to: [0, extra.at ?? 0],
    route: 'arc',
    lane: k,
    role: 'active',
  }));
  const { shapes, bounds } = tableScene(frame, {
    values: [state.F.map((v) => (v === null ? null : String(v)))],
    colHeads: [state.F.map((_, i) => String(i))],
    rowHeads: [[memo ? 'memo' : 'F']],
    links,
    roles,
  });

  const out: Shape[] = shapes;
  if (memo) {
    const stack = extra.stack ?? [];
    const running = stack[stack.length - 1];
    const y = g.belowTop;
    const boxes = state.F.map((_, k) =>
      stack.includes(k)
        ? {
            text: String(k),
            x: g.cx(k),
            role:
              roles.get(frameId(k)) ??
              (k === extra.hit ? 'found' : k === running ? 'active' : undefined),
          }
        : null,
    );
    out.push(
      ...boxRow('frame', y, boxes, {
        w: g.cellW - 6,
        h: FRAMES_H,
        label: 'calls',
        labelX: g.gridLeft - 10,
      }),
    );
    // A value handed back by a call rises from its frame into the memo.
    if (extra.returned !== undefined) {
      const v = out.find((s) => s.id === `val-0-${extra.returned}`);
      if (v) v.enterFrom = { x: g.cx(extra.returned), y: y + FRAMES_H / 2 };
    }
  }
  return { shapes: out, bounds, label: label(step) };
}

function label(step: Step<FibState, FibExtra>): string {
  const parts = [describe(step.state)];
  const stack = step.extra?.stack ?? [];
  if (stack.length)
    parts.push(`Calls on the stack: ${stack.map((k) => `memoFib(${k})`).join(', ')}.`);
  return parts.join(' ');
}
