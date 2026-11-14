/**
 * Two pictures, by the goal.
 *
 * - The most overlap: one lane per interval over a time axis (src/viz/_intervals2), the open
 *   ones colored, the sweep line dashed at the current time. Under the axis, the pattern's
 *   events in sorted order as chips ("2+" a start at 2, "5−" an end at 5), the done ones faded.
 * - The skyline: the buildings standing on the axis, their outline so far drawn over them with
 *   a dot at each key point, the sweep line, then (the pattern) the max-heap as a row of boxes,
 *   tallest first, each with its height and where it ends, and the key points as chips.
 *
 * Each operation fixes its frame (the events, the heap's most entries, the key points' room),
 * so the camera holds still while it runs.
 */
import type { MarkRole, StageSize } from '../../engine/types';
import { pickBest } from '../../layouts/arrange';
import { chip, chipSize } from '../../layouts/columns';
import type { Scene, Shape } from '../../render/scene';
import { timeAxis, timeMarker, xAt, type Axis } from '../_intervals/kit';
import { axisRange, drawLanes, ivText, type LanePicture } from '../_intervals2/kit';
import {
  describe,
  evId,
  evText,
  heapId,
  ivId,
  keyId,
  keyText,
  type SLExtra,
  type SLSettings,
  type SLState,
  type SLStep,
} from './model';

const CHIP = 16;
const CHIP_PITCH = 50;
const CHIP_ROW = 32;
const PAD = 12;

export function view(step: SLStep, settings: SLSettings, stage?: StageSize): Scene {
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const goal = step.extra?.goal ?? settings.goal;
  return goal === 'skyline' ? skyline(step, roles, stage) : overlap(step, roles, stage, settings);
}

// ----- The most overlap -----

function overlap(
  step: SLStep,
  roles: ReadonlyMap<string, MarkRole>,
  stage: StageSize | undefined,
  settings: SLSettings,
): Scene {
  const st = step.state;
  const e = step.extra;
  const open = new Set(e?.open ?? []);
  const ended = new Set<number>();
  if (e?.events) e.events.slice(0, e.done).forEach((ev) => ev.kind === 'end' && ended.add(ev.id));
  const final = step.lines.includes('ret');
  const { t0, T } = axisRange(st.ivs);
  const pic: LanePicture = {
    lanes: st.ivs.map((b) => ({
      bars: [
        {
          id: ivId(b.id),
          s: b.s,
          f: b.f,
          role: open.has(b.id) ? (final ? 'found' : 'visit') : undefined,
          dim: ended.has(b.id) && !final,
        },
      ],
    })),
    t0,
    T,
    markers:
      e?.at !== undefined
        ? [
            {
              id: 'sweep',
              t: e.at,
              label: final && e.best ? `most ${e.best.count}` : `t = ${e.at}`,
              role: final ? 'found' : 'active',
            },
          ]
        : [],
  };
  const events = e?.events ?? [];
  const rows = (w: number) =>
    Math.ceil(events.length / Math.max(1, Math.floor((w - 2 * PAD) / CHIP_PITCH)));
  const widthFor = (unit: number) => 16 + (T - t0) * unit + 26;
  const lay = drawLanes(pic, roles, stage, (unit) => ({
    w: 0,
    h: events.length ? 14 + rows(widthFor(unit)) * CHIP_ROW : 0,
  }));
  const shapes = [...lay.shapes];
  let bottom = lay.bottom;
  if (events.length) {
    const per = Math.max(1, Math.floor((lay.width - 2 * PAD) / CHIP_PITCH));
    const y0 = lay.bottom + 14;
    events.forEach((ev, k) => {
      const row = Math.floor(k / per);
      const col = k % per;
      const id = evId(k);
      const c = chip({
        id,
        x: PAD + col * CHIP_PITCH + CHIP_PITCH / 2,
        y: y0 + row * CHIP_ROW + CHIP_ROW / 2,
        text: evText(ev),
        size: CHIP,
        role: roles.get(id),
      });
      if (k < e!.done && !roles.has(id)) for (const s of c) s.opacity = 0.45;
      shapes.push(...c);
    });
    bottom = y0 + rows(lay.width) * CHIP_ROW;
  }
  return {
    shapes,
    bounds: { x: 0, y: 0, w: lay.width, h: bottom + 8 },
    label: overlapLabel(step, settings),
  };
}

function overlapLabel(step: SLStep, settings: SLSettings): string {
  const parts = [describe(step.state, settings)];
  const e = step.extra;
  if (e?.at !== undefined) {
    const open = step.state.ivs.filter((b) => e.open.includes(b.id));
    parts.push(
      `At time ${e.at}, ${open.length ? `open: ${open.map(ivText).join(', ')}` : 'nothing is open'}.`,
    );
  }
  if (e?.best) parts.push(`Most so far: ${e.best.count}, at time ${e.best.t}.`);
  return parts.join(' ');
}

// ----- The skyline -----

const UNITS = [44, 38, 32, 28, 24, 20];
const HEIGHT_UNITS = [22, 18, 15, 12];
const AXIS_H = 34;
const BOX = { w: 54, h: 46, gap: 6 };
const LEFT = 16;

interface SkyFrame {
  unit: number;
  hu: number;
  top: number;
  width: number;
  groundY: number;
  heapY: number;
  chipsY: number;
  perRow: number;
  height: number;
}

function skyFrame(st: SLState, e: SLExtra | undefined, stage: StageSize | undefined): SkyFrame {
  const { t0, T } = axisRange(st.ivs);
  const maxH = Math.max(1, ...st.ivs.map((b) => b.h));
  const top = stage?.strip ? 30 : 50;
  const heapN = e?.frame.heap ?? 0;
  const keysN = e ? e.frame.keys : 0;
  const options = UNITS.flatMap((unit) =>
    HEIGHT_UNITS.map((hu) => {
      const width = Math.max(
        LEFT + (T - t0) * unit + 26,
        heapN ? 70 + heapN * (BOX.w + BOX.gap) : 0,
      );
      const groundY = top + maxH * hu + 22;
      const heapY = groundY + AXIS_H + 10;
      const chipsY = heapY + (heapN ? BOX.h + 16 : 0);
      const chipW = chipSize('(24, 12)', CHIP).w + 8;
      const perRow = Math.max(1, Math.floor((width - 2 * PAD) / chipW));
      const height = chipsY + (keysN ? Math.ceil(keysN / perRow) * CHIP_ROW : 0) + 6;
      return {
        unit,
        hu,
        top,
        width,
        groundY,
        heapY,
        chipsY,
        perRow,
        height,
        bounds: { x: 0, y: 0, w: width, h: height },
      };
    }),
  );
  return pickBest(options, stage);
}

function skyline(
  step: SLStep,
  roles: ReadonlyMap<string, MarkRole>,
  stage: StageSize | undefined,
): Scene {
  const st = step.state;
  const e = step.extra;
  const f = skyFrame(st, e, stage);
  const { t0, T } = axisRange(st.ivs);
  const ax: Axis = { x0: LEFT, unit: f.unit, T, t0 };
  const yAt = (h: number) => f.groundY - h * f.hu;
  const shapes: Shape[] = [];
  const open = new Set(e?.open ?? []);
  const gone = new Set(e?.gone ?? []);
  const final = step.lines.includes('ret');

  // Buildings, tallest first so the short ones' labels sit on top.
  const order = [...st.ivs].sort((a, b) => b.h - a.h || a.id - b.id);
  for (const b of order) {
    const id = ivId(b.id);
    const role = roles.get(id) ?? (open.has(b.id) && !final ? 'visit' : undefined);
    const x1 = xAt(ax, b.s);
    const x2 = xAt(ax, b.f);
    shapes.push(
      {
        kind: 'rect',
        id,
        x: x1 + 1,
        y: yAt(b.h),
        w: Math.max(2, x2 - x1 - 2),
        h: b.h * f.hu,
        r: 2,
        cls: 'cell live',
        role,
        opacity: gone.has(b.id) && !roles.has(id) ? 0.4 : 0.75,
      },
      {
        kind: 'text',
        id: `${id}-t`,
        x: (x1 + x2) / 2,
        y: yAt(b.h) + 17,
        text: String(b.h),
        size: 15,
        anchor: 'middle',
        mono: true,
        weight: 'bold',
        role,
      },
    );
  }
  shapes.push(...timeAxis(ax, f.groundY));

  // The outline so far.
  const keys = e?.keys ?? [];
  const reach = final ? undefined : e?.at;
  keys.forEach((k, i) => {
    const prevH = i === 0 ? 0 : keys[i - 1]!.h;
    shapes.push({
      kind: 'arrow',
      id: `sky-v-${i}`,
      x1: xAt(ax, k.x),
      y1: yAt(prevH),
      x2: xAt(ax, k.x),
      y2: yAt(k.h),
      head: 'none',
      role: 'found',
      z: 3,
    });
    const next = keys[i + 1];
    const toX = next ? next.x : (reach ?? k.x);
    if (toX > k.x)
      shapes.push({
        kind: 'arrow',
        id: `sky-h-${i}`,
        x1: xAt(ax, k.x),
        y1: yAt(k.h),
        x2: xAt(ax, toX),
        y2: yAt(k.h),
        head: 'none',
        role: 'found',
        z: 3,
      });
    shapes.push({
      kind: 'circle',
      id: keyId(i),
      x: xAt(ax, k.x),
      y: yAt(k.h),
      r: 5,
      role: roles.get(keyId(i)) ?? 'found',
      z: 4,
    });
  });
  if (e?.at !== undefined && !final)
    shapes.push(...timeMarker(ax, 'sweep', e.at, f.top - 2, f.groundY, `x = ${e.at}`, 'active'));

  // The heap, tallest first in array order.
  if (e?.heap) {
    shapes.push({
      kind: 'text',
      id: 'heap-name',
      x: PAD,
      y: f.heapY + BOX.h / 2 + 6,
      text: 'heap',
      size: 16,
      mono: true,
      weight: 'bold',
      cls: 'label',
    });
    e.heap.forEach((it, k) => {
      const id = heapId(k);
      const x = 70 + k * (BOX.w + BOX.gap);
      const role = roles.get(id);
      const stale = it.r <= (e.at ?? -Infinity);
      shapes.push(
        { kind: 'rect', id, x, y: f.heapY, w: BOX.w, h: BOX.h, r: 6, cls: 'cell live', role },
        {
          kind: 'text',
          id: `${id}-h`,
          x: x + BOX.w / 2,
          y: f.heapY + 21,
          text: String(it.h),
          size: 19,
          anchor: 'middle',
          mono: true,
          weight: 'bold',
          role,
        },
        {
          kind: 'text',
          id: `${id}-r`,
          x: x + BOX.w / 2,
          y: f.heapY + 39,
          text: `to ${it.r}`,
          size: 14,
          anchor: 'middle',
          mono: true,
          cls: stale && !role ? 'index' : 'label',
          role,
        },
      );
    });
    if (!e.heap.length)
      shapes.push({
        kind: 'text',
        id: 'heap-empty',
        x: 70,
        y: f.heapY + BOX.h / 2 + 6,
        text: 'empty',
        size: 16,
        mono: true,
        cls: 'label',
      });
  }

  // The key points as chips.
  if (e) {
    const chipW = chipSize('(24, 12)', CHIP).w + 8;
    keys.forEach((k, i) => {
      const row = Math.floor(i / f.perRow);
      const col = i % f.perRow;
      shapes.push(
        ...chip({
          id: `kc-${i}`,
          x: PAD + col * chipW + chipW / 2,
          y: f.chipsY + row * CHIP_ROW + CHIP_ROW / 2,
          text: keyText(k),
          size: CHIP,
          role: roles.get(keyId(i)) === 'new' ? 'active' : undefined,
        }),
      );
    });
  }
  return {
    shapes,
    bounds: { x: 0, y: 0, w: f.width, h: f.height },
    label: skylineLabel(step),
  };
}

function skylineLabel(step: SLStep): string {
  const e = step.extra;
  const parts = [
    `${step.state.ivs.length} buildings: ${step.state.ivs.map((b) => `${ivText(b)} height ${b.h}`).join(', ')}.`,
  ];
  if (e?.at !== undefined) parts.push(`The sweep is at x = ${e.at}, height ${e.height ?? 0}.`);
  if (e?.heap)
    parts.push(
      e.heap.length
        ? `Heap: ${e.heap.map((it) => `${it.h} until ${it.r}`).join(', ')}.`
        : 'The heap is empty.',
    );
  if (e?.keys?.length) parts.push(`Key points: ${e.keys.map(keyText).join(' ')}.`);
  return parts.join(' ');
}
