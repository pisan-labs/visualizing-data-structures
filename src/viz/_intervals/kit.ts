/**
 * Shared code for the interval-scheduling pages (activity selection, interval partitioning):
 * reading intervals typed as start-finish, and drawing them as bars over a time axis. This
 * folder has no index.ts, so the registry does not treat it as a page.
 */
import type { MarkRole, Value } from '../../engine/types';
import { textWidth } from '../../layouts/text';
import type { Shape } from '../../render/scene';

export interface Interval {
  /** 1-based, in the order typed: the interval's identity wherever it is drawn. */
  id: number;
  s: number;
  f: number;
}

export const MAX_TIME = 24;

export const intervalText = (iv: { s: number; f: number }) => `${iv.s}-${iv.f}`;
export const intervalsText = (ivs: Interval[]) =>
  [...ivs]
    .sort((a, b) => a.id - b.id)
    .map(intervalText)
    .join(' ');

/** Read "1-4 3-5 0-6" into intervals, or say what is wrong. */
export function intervalsFromArg(
  arg: Value | undefined,
  max: number,
  what: string,
  whats = `${what}s`,
): Interval[] | string {
  const tokens = String(arg ?? '')
    .split(/[\s,;]+/)
    .filter(Boolean);
  const how = `Type each ${what} as start-finish, such as 1-4 3-5 0-6, with times from 0 to ${MAX_TIME}.`;
  if (tokens.length === 0) return how;
  if (tokens.length > max) return `That is ${tokens.length} ${whats}. Use at most ${max}.`;
  const out: Interval[] = [];
  for (const t of tokens) {
    const m = /^(\d+)[-–:](\d+)$/.exec(t);
    if (!m) return `"${t}" is not start-finish. ${how}`;
    const s = Number(m[1]);
    const f = Number(m[2]);
    if (f > MAX_TIME) return `In "${t}", use times from 0 to ${MAX_TIME}.`;
    if (f <= s) return `In "${t}", the finish must come after the start.`;
    out.push({ id: out.length + 1, s, f });
  }
  return out;
}

/** Do two intervals overlap? Half-open [s, f) by default: touching ends do not overlap. */
export const overlaps = (a: Interval, b: Interval, closed = false) =>
  closed ? a.s <= b.f && b.s <= a.f : a.s < b.f && b.s < a.f;

/** The largest number of intervals that share a moment, and the first moment it happens. */
export function depthOf(ivs: Interval[], closed = false): { depth: number; at: number } {
  let depth = 0;
  let at = 0;
  // Every maximum is reached at some interval's start.
  for (const a of ivs) {
    const d = ivs.filter((b) =>
      closed ? b.s <= a.s && a.s <= b.f : b.s <= a.s && a.s < b.f,
    ).length;
    if (d > depth || (d === depth && a.s < at)) {
      depth = d;
      at = a.s;
    }
  }
  return { depth, at };
}

/** The time axis's geometry: where time t is drawn. */
export interface Axis {
  x0: number;
  unit: number;
  /** Last time on the axis. */
  T: number;
  /** First time on the axis, drawn at x0. Default 0. */
  t0?: number;
}

export const xAt = (ax: Axis, t: number) => ax.x0 + (t - (ax.t0 ?? 0)) * ax.unit;

/** The first time to draw: the earliest start, rounded down to an even number. */
export const axisStart = (ivs: { s: number }[]) =>
  2 * Math.floor(Math.min(...ivs.map((iv) => iv.s)) / 2);

/** The last time to draw: the latest finish, rounded up to an even number, at least 8. */
export const axisEnd = (ivs: { f: number }[]) =>
  Math.max(8, 2 * Math.ceil(Math.max(0, ...ivs.map((iv) => iv.f)) / 2));

export const AXIS_SIZE = 15;

/** The axis line, a tick at every time and a number at every second (or every) time. */
export function timeAxis(ax: Axis, y: number): Shape[] {
  const out: Shape[] = [
    {
      kind: 'arrow',
      id: 'axis',
      x1: xAt(ax, ax.t0 ?? 0),
      y1: y,
      x2: xAt(ax, ax.T),
      y2: y,
      head: 'none',
      cls: 'axis',
    },
  ];
  const every = ax.unit >= 30 ? 1 : 2;
  for (let t = ax.t0 ?? 0; t <= ax.T; t++) {
    out.push({
      kind: 'arrow',
      id: `tick-${t}`,
      x1: xAt(ax, t),
      y1: y,
      x2: xAt(ax, t),
      y2: y + (t % every ? 4 : 7),
      head: 'none',
      cls: 'axis',
    });
    if (t % every === 0)
      out.push({
        kind: 'text',
        id: `time-${t}`,
        x: xAt(ax, t),
        y: y + 9 + AXIS_SIZE,
        text: String(t),
        size: AXIS_SIZE,
        anchor: 'middle',
        cls: 'index',
        mono: true,
      });
  }
  return out;
}

export const BAR_TEXT = 16;

/**
 * An interval as a bar in a lane: the rectangle `<id>` and its times `<id>-t`, inside the bar
 * when they fit, else beside it. Keep `id` the same wherever the interval goes, so it moves.
 */
export function intervalBar(
  ax: Axis,
  id: string,
  iv: { s: number; f: number },
  y: number,
  h: number,
  role?: MarkRole,
  text = `${iv.s}–${iv.f}`,
): Shape[] {
  const x1 = xAt(ax, iv.s);
  const x2 = xAt(ax, iv.f);
  const w = textWidth(text, BAR_TEXT, true);
  const inside = w + 6 <= x2 - x1;
  const right = xAt(ax, ax.T) - x2 >= w + 8;
  return [
    {
      kind: 'rect',
      id,
      x: x1 + 1,
      y,
      w: Math.max(2, x2 - x1 - 2),
      h,
      r: 5,
      cls: 'cell live',
      role,
    },
    {
      kind: 'text',
      id: `${id}-t`,
      x: inside ? (x1 + x2) / 2 : right ? x2 + 6 : x1 - 6,
      y: y + h / 2 + BAR_TEXT * 0.36,
      text,
      size: BAR_TEXT,
      anchor: inside ? 'middle' : right ? 'start' : 'end',
      mono: true,
      weight: 'bold',
      role,
    },
  ];
}

/** A vertical dashed line at time t across [y1, y2], with a label at its top. */
export function timeMarker(
  ax: Axis,
  id: string,
  t: number,
  y1: number,
  y2: number,
  label: string,
  role?: MarkRole,
): Shape[] {
  const x = xAt(ax, t);
  return [
    { kind: 'arrow', id, x1: x, y1, x2: x, y2, head: 'none', dashed: true, role },
    {
      kind: 'text',
      id: `${id}-label`,
      x,
      y: y1 - 6,
      text: label,
      size: 15,
      anchor: 'middle',
      cls: 'label',
      role,
    },
  ];
}
