/**
 * The sorting network: one wire per index, the values riding on them, and the comparators as
 * columns across the wires, grouped by stage. A comparator is an arrow from the wire that gets
 * the smaller value to the wire that gets the larger. Values sit just after the columns done so
 * far, so they travel through the network as the sort runs, and swap wires at comparators.
 *
 * Wide stages get wires running left to right; tall ones (a phone) get them running top to
 * bottom. Both are built in (u, v) coordinates, u along the wires and v across them.
 */
import type { MarkRole, StageSize } from '../../engine/types';
import { pickLayout } from '../../layouts/arrange';
import { textWidth } from '../../layouts/text';
import type { Bounds, Scene, Shape } from '../../render/scene';
import { describeArray } from '../_sorting/view';
import type { ArrayStep } from '../_sorting/kit';
import { network, type BitonicExtra, type BitonicSettings } from './model';

const ROW = 36;
const SLOT = 40;
const LANE = 14;
const COLPAD = 16;
const GAP = 26;
const TOKEN_W = 46;
const TOKEN_H = 28;
const VALUE = 22;
const LABEL = 21;
const PAD = 14;

interface Built {
  shapes: Shape[];
  bounds: Bounds;
}

function build(step: ArrayStep, settings: BitonicSettings, vertical: boolean): Built {
  const a = step.state.a;
  const n = a.length;
  const extra = (step.extra ?? {}) as BitonicExtra;
  const cols = network(n, settings.network);
  const D = cols.length;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const labelRoom = textWidth(String(Math.max(0, n - 1)), LABEL) + 12;
  const headRoom = vertical ? textWidth('stage 4', LABEL) + 16 : 34;

  // u along the wires, v across them.
  const v = (i: number) => headRoom + TOKEN_H / 2 + i * ROW;
  // Comparators in a column that would overlap go side by side, in lanes.
  const lanes = cols.map((col) => {
    const ends: number[] = [];
    return col.comparators.map((cmp) => {
      const top = Math.min(cmp.min, cmp.max);
      const bottom = Math.max(cmp.min, cmp.max);
      let lane = ends.findIndex((e) => e < top);
      if (lane < 0) lane = ends.length;
      ends[lane] = bottom;
      return lane;
    });
  });
  // Along u: a slot for the values, then a column, a slot, a column, ... and a last slot.
  const u0 = labelRoom + TOKEN_W / 2 + 8;
  const slots: number[] = [u0];
  const colStart: number[] = [];
  const colWidth: number[] = [];
  let cursor = u0 + SLOT / 2;
  cols.forEach((col, c) => {
    if (c > 0 && col.stage !== cols[c - 1]!.stage) cursor += GAP;
    const w = (Math.max(...lanes[c]!, 0) + 1) * LANE + COLPAD;
    colStart.push(cursor);
    colWidth.push(w);
    cursor += w;
    slots.push(cursor + SLOT / 2);
    cursor += SLOT;
  });
  const colU = (c: number) => colStart[c]! + colWidth[c]! / 2;
  const laneU = (c: number, k: number) => colStart[c]! + COLPAD / 2 + (lanes[c]![k]! + 0.5) * LANE;
  const slotU = (p: number) => slots[Math.max(0, Math.min(D, p))]!;
  const uEnd = slotU(D) + TOKEN_W / 2 + 8;

  const P = (uu: number, vv: number) => (vertical ? { x: vv, y: uu } : { x: uu, y: vv });
  const shapes: Shape[] = [];
  const line = (
    id: string,
    u1: number,
    v1: number,
    u2: number,
    v2: number,
    more: Partial<Shape> = {},
  ) => {
    const p = P(u1, v1);
    const q = P(u2, v2);
    shapes.push({
      kind: 'arrow',
      id,
      x1: p.x,
      y1: p.y,
      x2: q.x,
      y2: q.y,
      head: 'none',
      ...more,
    } as Shape);
  };
  const rect = (
    id: string,
    uc: number,
    vc: number,
    du: number,
    dv: number,
    more: Partial<Shape> = {},
  ) => {
    const c = P(uc, vc);
    const [w, h] = vertical ? [dv, du] : [du, dv];
    shapes.push({ kind: 'rect', id, x: c.x - w / 2, y: c.y - h / 2, w, h, ...more } as Shape);
  };

  // The active column, behind everything.
  if (extra.active !== undefined && cols[extra.active] && n > 0)
    rect(
      'col-active',
      colU(extra.active),
      (v(0) + v(n - 1)) / 2,
      colWidth[extra.active]!,
      (n - 1) * ROW + TOKEN_H,
      {
        r: 8,
        z: 0,
        role: 'visit',
        opacity: 0.35,
      },
    );

  // Wires and their indices.
  for (let i = 0; i < n; i++) {
    line(`wire-${i}`, u0 - TOKEN_W / 2, v(i), uEnd, v(i), { cls: 'ghost', z: 0.2 });
    const p = vertical ? P(u0 - TOKEN_W / 2 - 10, v(i)) : P(u0 - TOKEN_W / 2 - 8, v(i) + 7);
    shapes.push({
      kind: 'text',
      id: `wire-label-${i}`,
      x: p.x,
      y: p.y,
      text: String(i),
      size: LABEL,
      anchor: vertical ? 'middle' : 'end',
      cls: 'index',
      mono: true,
    });
  }

  // The array's name over the wire indices (load errors mark it).
  {
    const p = vertical
      ? P(u0 - TOKEN_W / 2 - 10, headRoom - 12)
      : P(u0 - TOKEN_W / 2 - 8, headRoom - 10);
    shapes.push({
      kind: 'text',
      id: 'row-a',
      x: p.x,
      y: p.y,
      text: 'A',
      size: LABEL,
      anchor: 'end',
      cls: 'label',
      mono: true,
      role: roles.get('row-a'),
    });
  }

  // Comparators, column by column, and stage labels.
  cols.forEach((col, c) => {
    col.comparators.forEach((cmp, k) => {
      const id = `cmp-${c}-${k}`;
      const done = extra.done !== undefined && c < extra.done;
      const role = roles.get(id);
      line(id, laneU(c, k), v(cmp.min), laneU(c, k), v(cmp.max), {
        head: 'end',
        role,
        opacity: role ? 1 : done ? 0.55 : 1,
        z: 0.5,
      });
      const d = P(laneU(c, k), v(cmp.min));
      shapes.push({ kind: 'circle', id: `dot-${c}-${k}`, x: d.x, y: d.y, r: 5, role, z: 0.6 });
    });
  });
  const stages = [...new Set(cols.map((c) => c.stage))];
  for (const s of stages) {
    const idx = cols.map((c, k) => (c.stage === s ? k : -1)).filter((k) => k >= 0);
    const mid = (colU(idx[0]!) + colU(idx[idx.length - 1]!)) / 2;
    const p = vertical ? P(mid + 7, headRoom - 12) : P(mid, headRoom - 10);
    shapes.push({
      kind: 'text',
      id: `stage-${s}`,
      x: p.x,
      y: p.y,
      text: vertical ? `stage ${s}` : idx.length > 1 ? `stage ${s}` : `s${s}`,
      size: LABEL,
      anchor: vertical ? 'end' : 'middle',
      cls: 'label',
    });
  }

  // The values, just after the columns done so far.
  const slot = slotU(Math.max(0, Math.min(D, extra.done ?? 0)));
  a.forEach((item, i) => {
    const id = `v${item.uid}`;
    const role = roles.get(id);
    rect(`box-${item.uid}`, slot, v(i), TOKEN_W, TOKEN_H, { r: 6, cls: 'cell live', role, z: 2 });
    const c = P(slot, v(i));
    shapes.push({
      kind: 'text',
      id,
      x: c.x,
      y: c.y + 7,
      text: String(item.value),
      size: VALUE,
      anchor: 'middle',
      weight: 'bold',
      role,
      z: 3,
    });
  });

  const uMax = uEnd + 4;
  const vMax = (n > 0 ? v(n - 1) : headRoom) + TOKEN_H / 2 + 4;
  const lo = P(0, 0);
  const hi = P(uMax, vMax);
  return {
    shapes,
    bounds: { x: lo.x - PAD, y: lo.y - PAD, w: hi.x - lo.x + 2 * PAD, h: hi.y - lo.y + 2 * PAD },
  };
}

export function view(step: ArrayStep, settings: BitonicSettings, stage?: StageSize): Scene {
  const wide = build(step, settings, false);
  const tall = build(step, settings, true);
  const best = pickLayout(stage, [wide, tall]);
  return { ...best, label: describeStep(step) };
}

function describeStep(step: ArrayStep): string {
  const extra = (step.extra ?? {}) as BitonicExtra;
  const base = describeArray(step.state);
  return extra.done !== undefined ? `${base} Columns done: ${extra.done}.` : base;
}
