import type { MarkRole, StageSize, Step } from '../../engine/types';
import { pickBest } from '../../layouts/arrange';
import type { Scene, Shape } from '../../render/scene';
import { axisEnd, intervalBar, timeAxis, timeMarker, type Axis } from '../_intervals/kit';
import { actId, describe, name, type ActExtra, type ActSettings, type ActState } from './model';

const LABEL_W = 46;
const UNITS = [40, 34, 28, 24, 20];
const ROWS = [36, 30];
const AXIS_H = 40;

/**
 * One lane per activity, a bar from its start to its finish over a time axis. Lanes are in the
 * order the rule looks at them, so sorting slides the bars into place. Chosen bars are marked,
 * skipped ones gray; the dashed line is the finish of the last chosen activity (earliest finish
 * first), which the next one must not start before.
 */
export function view(
  step: Step<ActState, ActExtra>,
  _settings: ActSettings,
  stage?: StageSize,
): Scene {
  const { state, extra = {} } = step;
  const n = state.acts.length;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const T = axisEnd(state.acts);
  const top = stage?.strip ? 30 : 46;
  const options = UNITS.flatMap((unit) =>
    ROWS.map((row) => ({
      unit,
      row,
      bounds: { x: 0, y: 0, w: LABEL_W + T * unit + 30, h: top + n * row + AXIS_H },
    })),
  );
  const { unit, row } = pickBest(options, stage);
  const ax: Axis = { x0: LABEL_W + 10, unit, T };
  const out: Shape[] = [];
  const barH = row - 8;
  state.order.forEach((id, k) => {
    const a = state.acts[id - 1]!;
    const y = top + k * row;
    const status = state.status[id - 1];
    const role =
      roles.get(actId(id)) ??
      (status === 'chosen' ? 'found' : status === 'skipped' ? 'stale' : undefined);
    const bar = intervalBar(ax, actId(id), a, y + 4, barH, role);
    if (status === 'skipped' && !roles.has(actId(id))) bar[0]!.opacity = 0.5;
    out.push(
      {
        kind: 'text',
        id: `${actId(id)}-name`,
        x: LABEL_W,
        y: y + row / 2 + 6,
        text: name(id),
        size: 16,
        anchor: 'end',
        mono: true,
        cls: role ? undefined : 'label',
        role,
      },
      ...bar,
    );
  });
  const axisY = top + n * row + 6;
  out.push(...timeAxis(ax, axisY));
  if (extra.last !== undefined)
    out.push(...timeMarker(ax, 'last', extra.last, top - 2, axisY, 'last finish', 'active'));
  return {
    shapes: out,
    bounds: { x: 0, y: 0, w: LABEL_W + T * unit + 30, h: top + n * row + AXIS_H },
    label: label(step),
  };
}

function label(step: Step<ActState, ActExtra>): string {
  const parts = [describe(step.state)];
  const chosen = step.state.order.filter((id) => step.state.status[id - 1] === 'chosen');
  if (chosen.length) parts.push(`Chosen: ${chosen.map(name).join(', ')}.`);
  return parts.join(' ');
}
