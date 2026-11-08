import type { MarkRole, StageSize, Step } from '../../engine/types';
import { pickBest } from '../../layouts/arrange';
import { textWidth } from '../../layouts/text';
import type { Scene, Shape } from '../../render/scene';
import { groupRole } from '../../engine/types';
import {
  axisEnd,
  axisStart,
  depthOf,
  intervalBar,
  timeAxis,
  timeMarker,
  xAt,
  type Axis,
} from '../_intervals/kit';
import {
  describe,
  heapId,
  lectId,
  name,
  type PartExtra,
  type PartSettings,
  type PartState,
} from './model';

const LABEL_W = 44;
const UNITS = [44, 38, 32, 28, 24];
const ROWS = [34, 30, 27];
const GAP = 22;
const AXIS_H = 40;
const BOX_W = 74;
const BOX_H = 32;
const HEAP_TEXT = 16;

/**
 * Rooms on top, one lane each, and the lectures waiting below, one row each over a time axis.
 * Sorting by start time slides the waiting rows into order; placing a lecture moves its bar up
 * into its room's lane. The min-heap of rooms, keyed by when each is free, sits beside the
 * picture on a wide stage and under it on a tall one; its first entry is the room free soonest.
 * At the end, the dashed line marks the moment with the most lectures on at once.
 */
export function view(
  step: Step<PartState, PartExtra>,
  settings: PartSettings,
  stage?: StageSize,
): Scene {
  const { state, extra = {} } = step;
  const n = state.lects.length;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const closed = settings.touch === 'conflict';
  const R = depthOf(state.lects, closed).depth;
  const t0 = axisStart(state.lects);
  const T = Math.max(axisEnd(state.lects), t0 + 8);
  const top = stage?.strip ? 30 : 46;
  const heapH = R * (BOX_H + 6);
  type Option = {
    unit: number;
    row: number;
    beside: boolean;
    bounds: { x: number; y: number; w: number; h: number };
  };
  const options: Option[] = [];
  for (const unit of UNITS)
    for (const row of ROWS)
      for (const beside of [true, false]) {
        const picW = LABEL_W + 10 + (T - t0) * unit + 20;
        const picH = top + R * row + GAP + n * row + AXIS_H;
        options.push({
          unit,
          row,
          beside,
          bounds: beside
            ? { x: 0, y: 0, w: picW + 24 + BOX_W + 10, h: Math.max(picH, top + 30 + heapH) }
            : {
                x: 0,
                y: 0,
                w: Math.max(picW, LABEL_W + R * (BOX_W + 6) + 10),
                h: picH + 30 + BOX_H + 10,
              },
        });
      }
  const o = pickBest(options, stage);
  const { unit, row } = o;
  const ax: Axis = { x0: LABEL_W + 10, unit, T, t0 };
  const out: Shape[] = [];
  const laneY = (r: number) => top + (r - 1) * row;
  const waitTop = top + R * row + GAP;
  const right = xAt(ax, T);
  for (let r = 1; r <= R; r++) {
    out.push(
      {
        kind: 'rect',
        id: `lane-${r}`,
        x: ax.x0,
        y: laneY(r) + 1,
        w: right - ax.x0,
        h: row - 2,
        r: 4,
        cls: 'cell',
        opacity: 0.6,
      },
      {
        kind: 'text',
        id: `lane-${r}-name`,
        x: LABEL_W,
        y: laneY(r) + row / 2 + 6,
        text: `R${r}`,
        size: 16,
        anchor: 'end',
        mono: true,
        weight: 'bold',
      },
    );
  }
  state.order.forEach((id, k) => {
    const l = state.lects[id - 1]!;
    const y = waitTop + k * row;
    const r = state.room[id - 1];
    out.push({
      kind: 'text',
      id: `${lectId(id)}-name`,
      x: LABEL_W,
      y: y + row / 2 + 6,
      text: name(id),
      size: 16,
      anchor: 'end',
      mono: true,
      cls: 'label',
      role: roles.get(lectId(id)),
    });
    const role = roles.get(lectId(id)) ?? (r ? groupRole(r) : undefined);
    const by = r ? laneY(r) + 4 : y + 4;
    out.push(
      ...intervalBar(
        ax,
        lectId(id),
        l,
        by,
        row - 8,
        role,
        r ? name(id) : `${name(id)} ${l.s}–${l.f}`,
      ),
    );
  });
  const axisY = waitTop + n * row + 6;
  out.push(...timeAxis(ax, axisY));
  if (extra.depth)
    out.push(
      ...timeMarker(
        ax,
        'depth',
        extra.depth.at,
        top - 2,
        axisY,
        `depth ${extra.depth.depth}`,
        'active',
      ),
    );

  // The heap: its array order, the room free soonest first.
  const hx = o.beside ? right + 24 : LABEL_W + 10;
  const hy = o.beside ? top + 26 : axisY + AXIS_H + 4;
  out.push({
    kind: 'text',
    id: 'heap-label',
    x: o.beside ? hx : hx - 8,
    y: o.beside ? hy - 8 : hy + BOX_H / 2 + 6,
    text: 'heap',
    size: 16,
    anchor: o.beside ? 'start' : 'end',
    mono: true,
    cls: 'label',
  });
  state.heap.forEach((e, k) => {
    const x = o.beside ? hx : hx + k * (BOX_W + 6);
    const y = o.beside ? hy + k * (BOX_H + 6) : hy;
    const text = `R${e.room}·${e.end}`;
    const role = roles.get(heapId(k));
    out.push(
      { kind: 'rect', id: heapId(k), x, y, w: BOX_W, h: BOX_H, r: 6, cls: 'cell live', role },
      {
        kind: 'text',
        id: `${heapId(k)}-t`,
        x: x + BOX_W / 2,
        y: y + BOX_H / 2 + HEAP_TEXT * 0.36,
        text,
        size: Math.min(HEAP_TEXT, ((BOX_W - 8) / textWidth(text, 1, true)) | 0),
        anchor: 'middle',
        mono: true,
        weight: 'bold',
        role,
      },
    );
  });
  return { shapes: out, bounds: o.bounds, label: label(step) };
}

function label(step: Step<PartState, PartExtra>): string {
  return describe(step.state);
}
