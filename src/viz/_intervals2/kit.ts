/**
 * Shared code for the interval pattern pages (merge-intervals, sweep-line), on top of the
 * interval-scheduling kit (../_intervals/kit.ts, which this reuses by import and never edits).
 * This folder has no index.ts, so the registry does not treat it as a page.
 *
 * - `mergeSortCount`: a stable merge sort that counts its comparisons, so a page can show what
 *   "sort by start" costs (a merge sort's comparisons, about n log n).
 * - `ivText` / `ivInput`: an interval as narration shows it ("2–6") and as typed ("2-6").
 * - A lane picture: intervals as bars in lanes over a time axis, as on /activity-selection/ and
 *   /interval-partitioning/. A model describes the lanes (`LanePicture`); `drawLanes` places them
 *   for the stage and draws them. Bar ids are the model's, so a bar that changes lane slides
 *   there, and marks can name it.
 */
import type { MarkRole, StageSize } from '../../engine/types';
import { pickBest } from '../../layouts/arrange';
import { fitSize } from '../../layouts/columns';
import { textWidth } from '../../layouts/text';
import type { Shape } from '../../render/scene';
import { BAR_TEXT, timeAxis, timeMarker, xAt, type Axis } from '../_intervals/kit';

// ----- Sorting with a count -----

/** A stable top-down merge sort; `comparisons` counts calls to `less`. */
export function mergeSortCount<T>(
  xs: readonly T[],
  less: (a: T, b: T) => boolean,
): { sorted: T[]; comparisons: number } {
  let comparisons = 0;
  const sort = (a: T[]): T[] => {
    if (a.length <= 1) return a;
    const mid = a.length >> 1;
    const l = sort(a.slice(0, mid));
    const r = sort(a.slice(mid));
    const out: T[] = [];
    let i = 0;
    let j = 0;
    while (i < l.length && j < r.length) {
      comparisons++;
      // Take from the right only when it is strictly smaller: stable.
      if (less(r[j]!, l[i]!)) out.push(r[j++]!);
      else out.push(l[i++]!);
    }
    while (i < l.length) out.push(l[i++]!);
    while (j < r.length) out.push(r[j++]!);
    return out;
  };
  const sorted = sort([...xs]);
  return { sorted, comparisons };
}

// ----- Text -----

/** An interval as narration shows it: "2–6". */
export const ivText = (iv: { s: number; f: number }) => `${iv.s}–${iv.f}`;
/** An interval as typed and as the code drivers read it: "2-6". */
export const ivInput = (iv: { s: number; f: number }) => `${iv.s}-${iv.f}`;

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "a", "a and b", "a, b and c". */
export function andList(xs: readonly (string | number)[]): string {
  const s = xs.map(String);
  if (s.length <= 1) return s[0] ?? '';
  return `${s.slice(0, -1).join(', ')} and ${s[s.length - 1]}`;
}

// ----- The lane picture -----

export interface Bar {
  /** Shape id: keep it the same wherever the interval goes, so it slides there. */
  id: string;
  s: number;
  f: number;
  /** Role when no mark names the bar. */
  role?: MarkRole;
  /** Drawn faded: an input interval already dealt with. */
  dim?: boolean;
  /** The label; default "s–f". */
  text?: string;
}

export interface Lane {
  /** Drawn left of the lane ("out", "x", "A"); a lane with a name gets a light background. */
  name?: string;
  bars: Bar[];
}

/** A dashed vertical line across the lanes at time t, labeled at its top. */
export interface Marker {
  id: string;
  t: number;
  label: string;
  role?: MarkRole;
}

export interface LanePicture {
  lanes: Lane[];
  /** The axis runs from t0 to T. Keep both fixed for an operation, so the frame holds still. */
  t0: number;
  T: number;
  markers?: Marker[];
}

/** Room a page asks for under the axis (events, a list), for the layout to choose with. */
export interface Below {
  w: number;
  h: number;
}

export interface LaneLayout {
  shapes: Shape[];
  ax: Axis;
  /** Top of lane k, and the lane pitch. */
  laneY(k: number): number;
  row: number;
  /** The axis line's y, and the y under its numbers, where a page's own parts can start. */
  axisY: number;
  bottom: number;
  /** The drawing's width: the axis and its labels, or `below.w` if wider. */
  width: number;
}

const UNITS = [44, 38, 32, 28, 24, 20];
const ROWS = [34, 30];
const NAME_SIZE = 16;
const AXIS_H = 34;
const MIN_BAR_TEXT = 13;

/** The left edge of the time axis: room for the lane names. */
function axisLeft(pic: LanePicture): number {
  const names = pic.lanes.map((l) => l.name ?? '').filter(Boolean);
  if (!names.length) return 16;
  return 14 + Math.max(...names.map((n) => textWidth(n, NAME_SIZE, true, true))) + 10;
}

/** The layout's choices for a stage: how wide a time unit is, and the lane pitch. */
export function chooseLanes(
  pic: LanePicture,
  stage: StageSize | undefined,
  below: (unit: number) => Below = () => ({ w: 0, h: 0 }),
): { unit: number; row: number; top: number } {
  const top = stage?.strip ? 26 : 48;
  const x0 = axisLeft(pic);
  const n = pic.lanes.length;
  const options = UNITS.flatMap((unit) =>
    ROWS.map((row) => {
      const b = below(unit);
      const w = Math.max(x0 + (pic.T - pic.t0) * unit + 26, b.w);
      const h = top + n * row + 6 + AXIS_H + b.h;
      return { unit, row, top, bounds: { x: 0, y: 0, w, h } };
    }),
  );
  return pickBest(options, stage);
}

/**
 * Where each bar's label goes in one lane: inside the bar when it fits (shrunk a little if
 * need be), else right or left of it when nothing else is there, else nowhere (the narration
 * and the screen-reader label still give its times).
 */
function placeLabels(
  ax: Axis,
  bars: Bar[],
  right: number,
  left: number,
): Map<string, { x: number; anchor: 'start' | 'middle' | 'end'; size: number } | null> {
  const out = new Map<
    string,
    { x: number; anchor: 'start' | 'middle' | 'end'; size: number } | null
  >();
  const sorted = [...bars].sort((a, b) => a.s - b.s || a.f - b.f);
  let used = left;
  sorted.forEach((b, k) => {
    const text = b.text ?? ivText(b);
    const x1 = xAt(ax, b.s);
    const x2 = xAt(ax, b.f);
    const w = x2 - x1;
    const size = fitSize(text, w - 6, BAR_TEXT, MIN_BAR_TEXT);
    const fits = textWidth(text, size, true, true) + 6 <= w;
    const tw = textWidth(text, BAR_TEXT, true, true);
    const next = sorted[k + 1];
    const limit = next ? xAt(ax, next.s) - 4 : right;
    if (fits) {
      out.set(b.id, { x: (x1 + x2) / 2, anchor: 'middle', size });
      used = x2;
    } else if (x2 + 5 + tw <= limit) {
      out.set(b.id, { x: x2 + 5, anchor: 'start', size: BAR_TEXT });
      used = x2 + 5 + tw;
    } else if (x1 - 5 - tw >= used + 4) {
      out.set(b.id, { x: x1 - 5, anchor: 'end', size: BAR_TEXT });
      used = Math.max(x2, used);
    } else {
      out.set(b.id, null);
      used = Math.max(x2, used);
    }
  });
  return out;
}

/** Draw the lanes, the axis and the markers for the stage. */
export function drawLanes(
  pic: LanePicture,
  roles: ReadonlyMap<string, MarkRole>,
  stage: StageSize | undefined,
  below?: (unit: number) => Below,
): LaneLayout {
  const { unit, row, top } = chooseLanes(pic, stage, below);
  const x0 = axisLeft(pic);
  const ax: Axis = { x0, unit, T: pic.T, t0: pic.t0 };
  const right = xAt(ax, pic.T);
  const width = Math.max(right + 26, below?.(unit).w ?? 0);
  const laneY = (k: number) => top + k * row;
  const shapes: Shape[] = [];
  pic.lanes.forEach((lane, k) => {
    const y = laneY(k);
    if (lane.name) {
      shapes.push(
        {
          kind: 'rect',
          id: `lane-${k}`,
          x: x0 - 4,
          y: y + 1,
          w: right - x0 + 8,
          h: row - 2,
          r: 4,
          cls: 'cell',
          opacity: 0.6,
        },
        {
          kind: 'text',
          id: `lane-${k}-name`,
          x: x0 - 10,
          y: y + row / 2 + NAME_SIZE * 0.36,
          text: lane.name,
          size: NAME_SIZE,
          anchor: 'end',
          mono: true,
          weight: 'bold',
          cls: 'label',
        },
      );
    }
    const labels = placeLabels(ax, lane.bars, width - 4, x0 - 8);
    for (const b of lane.bars) {
      const role = roles.get(b.id) ?? b.role;
      const opacity = b.dim && !roles.has(b.id) ? 0.45 : undefined;
      const x1 = xAt(ax, b.s);
      const x2 = xAt(ax, b.f);
      const point = b.f - b.s === 0;
      const h = row - 10;
      shapes.push({
        kind: 'rect',
        id: b.id,
        x: point ? x1 - 3 : x1 + 1,
        y: y + 5,
        w: point ? 6 : Math.max(2, x2 - x1 - 2),
        h,
        r: point ? 3 : 5,
        cls: 'cell live',
        role,
        opacity,
      });
      const at = labels.get(b.id);
      if (at)
        shapes.push({
          kind: 'text',
          id: `${b.id}-t`,
          x: at.x,
          y: y + 5 + h / 2 + at.size * 0.36,
          text: b.text ?? ivText(b),
          size: at.size,
          anchor: at.anchor,
          mono: true,
          weight: 'bold',
          role,
          opacity,
        });
    }
  });
  const axisY = top + pic.lanes.length * row + 6;
  shapes.push(...timeAxis(ax, axisY));
  for (const m of pic.markers ?? [])
    shapes.push(...timeMarker(ax, m.id, m.t, top - 2, axisY, m.label, roles.get(m.id) ?? m.role));
  return { shapes, ax, laneY, row, axisY, bottom: axisY + AXIS_H, width };
}

/** The axis range for some intervals: from an even time at or before the first start to an
 * even time at or after the last finish, at least 8 long. */
export function axisRange(ivs: readonly { s: number; f: number }[]): { t0: number; T: number } {
  if (!ivs.length) return { t0: 0, T: 8 };
  const t0 = 2 * Math.floor(Math.min(...ivs.map((v) => v.s)) / 2);
  const T = Math.max(t0 + 8, 2 * Math.ceil(Math.max(...ivs.map((v) => v.f)) / 2));
  return { t0, T };
}
