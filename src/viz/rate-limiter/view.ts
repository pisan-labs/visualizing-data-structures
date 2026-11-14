/**
 * The drawing, top to bottom:
 *
 * - the limiter and its rule ("sliding window counter: 3 per 10 s");
 * - the time line in whole seconds. Each request is a marker stacked over its second: a round
 *   marker while it is checked (active) and once let through (found), a square with a cross
 *   once refused. The fixed windows [kW, kW + W) are bands behind the markers (fixed window
 *   and sliding window counter), the current window tinted, and for the counter the previous
 *   window and the part of it the last W seconds still cover;
 * - under the axis, a bracket over the last W seconds, (t − W, t], with how many requests were
 *   let through in it: more than L shows the burst;
 * - what the limiter keeps, one cell per number: the window and its count, the log of times
 *   (with an empty slot for each one it could still hold), prev and curr and the estimate, or
 *   the tokens and the last refill with the bucket drawn as L squares.
 *
 * The time line runs to 20, 30 or 40 seconds, the first that holds every request so far, and
 * keeps the same width, so the frame holds still.
 */
import type { MarkRole } from '../../engine/types';
import type { Scene, Shape } from '../../render/scene';
import {
  busiestKey,
  dec,
  describe,
  KIND_NAME,
  MAX_SAME,
  params,
  passedIn,
  reqById,
  windowText,
  type RLSettings,
  type RLStep,
} from './model';

const PAD = 14;
const X0 = 24;
/** The time line's width, whatever its length in seconds. */
const TL_W = 500;
const HEAD_Y = 26;
const STACK_TOP = 46;
const PITCH = 15;
const AXIS_Y = STACK_TOP + MAX_SAME * PITCH + 8;
const ROLL_Y = AXIS_Y + 34;
const PANEL_Y = AXIS_Y + 74;
const CELL_Y = PANEL_Y + 20;
const CELL_H = 34;
const TEXT = 15;
const WIDTH = X0 + TL_W + 34;
const HEIGHT = CELL_Y + CELL_H + 12;
/** Monospace advance, as a fraction of the font size. */
const CHAR = 0.6;

/** 20, 30 or 40: the first ten seconds past every request. */
export function axisEnd(times: number[]): number {
  const t = times.length ? Math.max(...times) : 0;
  return Math.max(20, Math.min(40, Math.ceil((t + 1) / 10) * 10));
}

export function view(step: RLStep, settings: RLSettings): Scene {
  const s = step.state;
  const x = step.extra ?? {};
  const p = params(settings);
  const { kind, L, W } = p;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const T = axisEnd(s.reqs.map((r) => r.t));
  const px = TL_W / T;
  const at = (t: number) => X0 + t * px;
  const shapes: Shape[] = [];
  const text = (
    id: string,
    tx: number,
    ty: number,
    t: string,
    o: Partial<Extract<Shape, { kind: 'text' }>> = {},
  ) => shapes.push({ kind: 'text', id, x: tx, y: ty, text: t, size: TEXT, ...o });

  text('heading', PAD, HEAD_Y, `${KIND_NAME[kind]}: ${L} per ${W} s`, {
    size: 17,
    weight: 'bold',
  });

  // Fixed windows behind the markers.
  if (kind === 'fixed' || kind === 'counter') {
    for (let k = 0; k * W < T; k++) {
      const a = k * W;
      const b = Math.min(T, a + W);
      const id = `band-${a}`;
      const base: MarkRole | undefined =
        a === s.start ? 'active' : kind === 'counter' && a === s.start - W ? 'compare' : undefined;
      const role = roles.get(id) ?? base;
      shapes.push({
        kind: 'polygon',
        id,
        points: [
          { x: at(a), y: STACK_TOP - 6 },
          { x: at(b), y: STACK_TOP - 6 },
          { x: at(b), y: AXIS_Y },
          { x: at(a), y: AXIS_Y },
        ],
        role,
        opacity: role || k % 2 === 0 ? 1 : 0.45,
      });
      if (kind === 'fixed' && (b - a) * px >= 30) {
        const n = s.reqs.filter((r) => r.ok && r.t >= a && r.t < b).length;
        text(`wc-${a}`, (at(a) + at(b)) / 2, STACK_TOP + 8, `${n}/${L}`, {
          anchor: 'middle',
          cls: 'label',
          mono: true,
        });
      }
    }
  }
  const now = x.at === undefined ? undefined : reqById(s, x.at);
  if (kind === 'counter' && now && roles.has('overlap')) {
    const a = Math.max(0, now.t - W);
    const b = Math.max(a, s.start);
    shapes.push({
      kind: 'polygon',
      id: 'overlap',
      points: [
        { x: at(a), y: STACK_TOP - 6 },
        { x: at(b), y: STACK_TOP - 6 },
        { x: at(b), y: AXIS_Y },
        { x: at(a), y: AXIS_Y },
      ],
      role: roles.get('overlap'),
    });
  }

  // The axis, with a tick every second and a label every window (or every 10 s).
  shapes.push({
    kind: 'arrow',
    id: 'axis',
    x1: at(0) - 6,
    y1: AXIS_Y,
    x2: at(T) + 14,
    y2: AXIS_Y,
  });
  text('axis-s', at(T) + 18, AXIS_Y + 5, 's', { cls: 'label' });
  const every = W >= 4 ? W : 10;
  for (let t = 0; t <= T; t++) {
    const edge = t % W === 0;
    shapes.push({
      kind: 'arrow',
      id: `tk-${t}`,
      x1: at(t),
      y1: edge ? AXIS_Y - 4 : AXIS_Y,
      x2: at(t),
      y2: AXIS_Y + (edge ? 8 : 4),
      head: 'none',
    });
    if (t % every === 0)
      text(`tl-${t}`, at(t), AXIS_Y + 23, String(t), { anchor: 'middle', cls: 'index' });
  }

  // The requests, stacked over their second.
  const m = Math.min(11, px - 3);
  const seen = new Map<number, number>();
  for (const r of s.reqs) {
    const k = seen.get(r.t) ?? 0;
    seen.set(r.t, k + 1);
    const cx = at(r.t);
    const cy = AXIS_Y - 9 - k * PITCH;
    const id = `r-${r.uid}`;
    const role = roles.get(id) ?? (r.ok === true ? 'found' : r.ok === false ? 'error' : 'active');
    shapes.push({
      kind: 'rect',
      id,
      x: cx - m / 2,
      y: cy - m / 2,
      w: m,
      h: m,
      r: r.ok === false ? 2 : m / 2,
      cls: 'live',
      role,
    });
    if (r.ok === false) {
      const d = m / 2 - 2;
      for (const [suffix, sy] of [
        ['a', 1],
        ['b', -1],
      ] as const)
        shapes.push({
          kind: 'arrow',
          id: `${id}-${suffix}`,
          x1: cx - d,
          y1: cy - d * sy,
          x2: cx + d,
          y2: cy + d * sy,
          head: 'none',
          role: 'error',
          z: 1.5,
        });
    }
  }

  // The last W seconds.
  if (now) {
    const a = at(Math.max(0, now.t - W));
    const b = at(now.t);
    const n = passedIn(s, now.t - W, now.t);
    const role = roles.get('roll') ?? (n > L ? 'error' : undefined);
    shapes.push({ kind: 'rect', id: 'roll', x: a, y: ROLL_Y - 1.5, w: b - a, h: 3, role });
    shapes.push({ kind: 'rect', id: 'roll-a', x: a - 1.5, y: ROLL_Y - 6, w: 3, h: 12, role });
    shapes.push({ kind: 'rect', id: 'roll-b', x: b - 1.5, y: ROLL_Y - 6, w: 3, h: 12, role });
    const label = `last ${W} s: ${n} let through`;
    const w = label.length * TEXT * CHAR;
    const cx = Math.max(PAD + w / 2, Math.min(WIDTH - PAD - w / 2, (a + b) / 2));
    text('roll-t', cx, ROLL_Y + 22, label, { anchor: 'middle', role: role === 'error' ? 'error' : undefined });
  }

  // What the limiter keeps.
  let cx = PAD;
  const cell = (id: string, name: string, value: string, w: number, base?: MarkRole) => {
    const role = roles.get(id) ?? base;
    text(`${id}-n`, cx, PANEL_Y + 12, name, { cls: 'label' });
    shapes.push({ kind: 'rect', id, x: cx, y: CELL_Y, w, h: CELL_H, r: 5, cls: 'live', role });
    text(`${id}-v`, cx + w / 2, CELL_Y + CELL_H / 2 + 6, value, {
      size: 17,
      anchor: 'middle',
      weight: 'bold',
      role,
    });
    cx += w + 12;
  };
  if (kind === 'fixed') {
    cell('m-start', 'window', windowText(s.start, W), 96);
    cell('m-count', 'count', String(s.count), 64);
  } else if (kind === 'counter') {
    cell('m-start', 'window', windowText(s.start, W), 96);
    cell('m-prev', 'prev', String(s.prev), 64);
    cell('m-curr', 'curr', String(s.count), 64);
    cx += 16;
    cell('m-est', 'estimate', x.est === undefined ? '–' : dec(x.est, W), 80);
  } else if (kind === 'log') {
    text('log-n', cx, PANEL_Y + 12, `log, oldest first: room for ${L}`, { cls: 'label' });
    const w = 48;
    s.log.forEach((u, i) => {
      const id = `log-${u}`;
      const role = roles.get(id);
      const lx = PAD + i * (w + 8);
      shapes.push({ kind: 'rect', id, x: lx, y: CELL_Y, w, h: CELL_H, r: 5, cls: 'live', role });
      text(`${id}-v`, lx + w / 2, CELL_Y + CELL_H / 2 + 6, String(reqById(s, u).t), {
        size: 17,
        anchor: 'middle',
        weight: 'bold',
        role,
      });
    });
    for (let i = s.log.length; i < L; i++) {
      shapes.push({
        kind: 'rect',
        id: `slot-${i}`,
        x: PAD + i * (w + 8),
        y: CELL_Y,
        w,
        h: CELL_H,
        r: 5,
        cls: 'ghost',
      });
    }
  } else {
    cell('m-tokens', 'tokens', dec(s.units, W), 80);
    cell('m-last', 'last refill', String(s.last), 96);
    cx += 16;
    text('bucket-n', cx, PANEL_Y + 12, `bucket: ${L} at most, ${dec(L, W)} per s`, {
      cls: 'label',
    });
    const size = 24;
    const whole = Math.floor(s.units / W);
    const part = (s.units % W) / W;
    for (let i = 0; i < L; i++) {
      const bx = cx + i * (size + 6);
      const by = CELL_Y + (CELL_H - size) / 2;
      shapes.push({
        kind: 'rect',
        id: `tok-${i}`,
        x: bx,
        y: by,
        w: size,
        h: size,
        r: 3,
        cls: i < whole ? 'live' : 'ghost',
        role: i < whole ? 'found' : undefined,
      });
      if (i === whole && part > 0)
        shapes.push({
          kind: 'rect',
          id: `tok-${i}-p`,
          x: bx + 3,
          y: by + 3,
          w: (size - 6) * part,
          h: size - 6,
          r: 2,
          role: 'found',
        });
    }
  }

  return {
    shapes,
    bounds: { x: 0, y: 0, w: WIDTH, h: HEIGHT },
    label: label(step, settings),
  };
}

function label(step: RLStep, settings: RLSettings): string {
  const s = step.state;
  const { L, W } = params(settings);
  const parts = [describe(s, settings)];
  const at = step.extra?.at;
  if (at !== undefined) {
    const r = reqById(s, at);
    parts.push(
      `The request at ${r.t} is ${r.ok === null ? 'being checked' : r.ok ? 'let through' : 'refused'}; ${passedIn(s, r.t - W, r.t)} let through in the last ${W} seconds.`,
    );
  }
  const most = step.vars?.[busiestKey(W)];
  if (typeof most === 'number' && most > L)
    parts.push(`At most ${most} were let through in some ${W} seconds.`);
  return parts.join(' ');
}
