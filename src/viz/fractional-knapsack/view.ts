import { groupRole, type MarkRole, type StageSize, type Step } from '../../engine/types';
import { pickBest } from '../../layouts/arrange';
import type { Scene, Shape } from '../../render/scene';
import {
  describe,
  frac,
  fracText,
  itemId,
  partId,
  ratioText,
  valueOf,
  type FracExtra,
  type FracSettings,
  type FracState,
} from './model';

const UNITS = [64, 54, 44, 38, 32, 26, 22];
const ROWS = [44, 38];
const COL = { id: 26, wv: 82, ratio: 72 };
const TEXT = 17;
const HEAD = 15;

/**
 * One row per item, in value-per-weight order once sorted: its weight and value, its value per
 * unit, and a bar as long as its weight. The part taken fills in and moves into the knapsack,
 * the bar along the bottom as long as the capacity, where the pieces line up in the order taken.
 */
export function view(
  step: Step<FracState, FracExtra>,
  _settings: FracSettings,
  stage?: StageSize,
): Scene {
  const { state } = step;
  const n = state.items.length;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const maxW = Math.max(state.W, ...state.items.map((it) => it.w));
  const top = stage?.strip ? 34 : 50;
  const x0 = 10 + COL.id + COL.wv + COL.ratio + 10;
  const options = UNITS.flatMap((unit) =>
    ROWS.map((row) => ({
      unit,
      row,
      bounds: { x: 0, y: 0, w: x0 + maxW * unit + 20, h: top + (n + 1) * row + 62 },
    })),
  );
  const { unit, row, bounds } = pickBest(options, stage);
  const out: Shape[] = [];
  const text = (
    id: string,
    x: number,
    y: number,
    t: string,
    more: Partial<Extract<Shape, { kind: 'text' }>> = {},
  ): Shape => ({
    kind: 'text',
    id,
    x,
    y,
    text: t,
    size: TEXT,
    anchor: 'middle',
    mono: true,
    ...more,
  });
  const cx = {
    id: 10 + COL.id / 2,
    wv: 10 + COL.id + COL.wv / 2,
    ratio: 10 + COL.id + COL.wv + COL.ratio / 2,
  };
  out.push(
    text('head-id', cx.id, top - 10, '#', { size: HEAD, cls: 'label' }),
    text('head-wv', cx.wv, top - 10, 'w:v', { size: HEAD, cls: 'label' }),
    text('head-ratio', cx.ratio, top - 10, 'v/w', { size: HEAD, cls: 'label' }),
    text('head-bar', x0, top - 10, 'weight', { size: HEAD, cls: 'label', anchor: 'start' }),
  );
  const h = row - 12;
  state.order.forEach((id, k) => {
    const it = state.items[id - 1]!;
    const y = top + k * row;
    const t = state.taken[id - 1];
    const role = roles.get(itemId(id));
    const mid = y + row / 2 + TEXT * 0.36;
    out.push(
      text(`${itemId(id)}-id`, cx.id, mid, String(id), { weight: 'bold', role }),
      text(`${itemId(id)}-wv`, cx.wv, mid, `${it.w}:${it.v}`, { role }),
      text(`${itemId(id)}-ratio`, cx.ratio, mid, ratioText(it), { role }),
      {
        kind: 'rect',
        id: itemId(id),
        x: x0,
        y: y + 6,
        w: it.w * unit,
        h,
        r: 4,
        cls: 'cell',
        role,
        opacity: t === it.w && !role ? 0.4 : undefined,
      },
    );
    // What is left of the item after the part taken moves to the knapsack.
    if (t !== null && t < it.w && t > 0)
      out.push({
        kind: 'text',
        id: `${itemId(id)}-rest`,
        x: x0 + (t + (it.w - t) / 2) * unit,
        y: mid,
        text: `${it.w - t} left`,
        size: 15,
        anchor: 'middle',
        cls: 'label',
      });
  });
  // The knapsack.
  const by = top + n * row + 28;
  out.push(
    text('bag-label', x0 - 10, by + row / 2 + TEXT * 0.36, 'knapsack', {
      anchor: 'end',
      size: 16,
      cls: 'label',
    }),
    { kind: 'rect', id: 'bag', x: x0, y: by + 4, w: state.W * unit, h: row - 8, r: 4, cls: 'cell' },
  );
  let off = 0;
  state.order.forEach((id) => {
    const t = state.taken[id - 1];
    if (!t) return;
    const it = state.items[id - 1]!;
    const k = state.order.indexOf(id);
    const role = roles.get(itemId(id)) === 'new' ? 'new' : groupRole(id);
    const label = t === it.w ? `#${id}` : `${fracText(frac(t, it.w))}`;
    out.push(
      {
        kind: 'rect',
        id: partId(id),
        x: x0 + off * unit + 1,
        y: by + 6,
        w: t * unit - 2,
        h: row - 12,
        r: 4,
        cls: 'cell live',
        role,
        enterFrom: { x: x0, y: top + k * row + 6 },
      },
      {
        kind: 'text',
        id: `${partId(id)}-t`,
        x: x0 + (off + t / 2) * unit,
        y: by + row / 2 + 15 * 0.36,
        text: label,
        size: Math.min(16, Math.max(11, Math.floor((t * unit - 4) / (label.length * 0.6)))),
        anchor: 'middle',
        mono: true,
        weight: 'bold',
        role,
      },
    );
    off += t;
  });
  out.push(
    text('total', x0, by + row + 22, `value ${fracText(valueOf(state))}`, {
      anchor: 'start',
      size: 16,
      weight: 'bold',
    }),
  );
  return { shapes: out, bounds, label: describe(state) };
}
