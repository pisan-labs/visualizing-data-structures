/**
 * Pieces shared by the pages that draw a chart (big-o-definition, doubling-experiment,
 * amortized-analysis). Each page keeps its own scales and layout: one plots exact fractions on
 * a linear or log axis, one a log-log plot of measured times, one two lanes of bars. What they
 * share is drawn here so it looks and behaves the same:
 *
 *   axisLines(shapes, pre, box)       the x and y axes, ids "<pre>-axis-x" and "<pre>-axis-y"
 *   rule(id, x1, x2, y, opts?)        a horizontal line: a grid line, a zero line, a reference
 *   tickLabel(id, x, y, text, ...)    a gray axis label
 *   clipToBox(box, xa, ya, xb, yb)    the part of a segment inside the plot, or null
 *   powerOfTen(k)                     "1", "10", "10²", "10⁻³"
 *   fitSize(text, max, room, width)   the largest size, at most max, at which a text fits
 */
import type { MarkRole } from '../engine/types';
import type { Shape } from '../render/scene';
import { sup } from './text';

/** The plot area in scene units: x0 left, x1 right, y0 top, y1 bottom. */
export interface PlotBox {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/** Axis lines and their default opacity. */
const AXIS_OPACITY = 0.7;

/**
 * The x axis along the bottom of the box and the y axis up its left side, each running a little
 * past the box (`over.x` to the right, `over.y` above) so the last tick does not sit on its end.
 */
export function axisLines(
  shapes: Shape[],
  pre: string,
  box: PlotBox,
  over: { x: number; y: number } = { x: 6, y: 6 },
): void {
  shapes.push(
    {
      kind: 'arrow',
      id: `${pre}-axis-x`,
      x1: box.x0,
      y1: box.y1,
      x2: box.x1 + over.x,
      y2: box.y1,
      head: 'none',
      opacity: AXIS_OPACITY,
    },
    {
      kind: 'arrow',
      id: `${pre}-axis-y`,
      x1: box.x0,
      y1: box.y1,
      x2: box.x0,
      y2: box.y0 - over.y,
      head: 'none',
      opacity: AXIS_OPACITY,
    },
  );
}

/** A horizontal line from x1 to x2 at y: a grid line (faint), a zero line or a reference. */
export function rule(
  id: string,
  x1: number,
  x2: number,
  y: number,
  opts: { opacity?: number; dashed?: boolean; role?: MarkRole } = {},
): Shape {
  return { kind: 'arrow', id, x1, y1: y, x2, y2: y, head: 'none', ...opts };
}

/** A gray axis label (tick values, axis names). */
export function tickLabel(
  id: string,
  x: number,
  y: number,
  text: string,
  size: number,
  anchor?: 'start' | 'middle' | 'end',
  opts: { cls?: string; mono?: boolean } = {},
): Shape {
  return {
    kind: 'text',
    id,
    x,
    y,
    text,
    size,
    cls: opts.cls ?? 'label',
    ...(anchor ? { anchor } : {}),
    ...(opts.mono ? { mono: true } : {}),
  };
}

/**
 * The part of the segment from (xa, ya) to (xb, yb) inside the box, or null when none of it is
 * (Liang-Barsky). A segment that only touches the box, or whose inside part is a point, is null.
 */
export function clipToBox(
  box: PlotBox,
  xa: number,
  ya: number,
  xb: number,
  yb: number,
): { x1: number; y1: number; x2: number; y2: number } | null {
  let t0 = 0;
  let t1 = 1;
  const dx = xb - xa;
  const dy = yb - ya;
  for (const [p, q] of [
    [-dx, xa - box.x0],
    [dx, box.x1 - xa],
    [-dy, ya - box.y0],
    [dy, box.y1 - ya],
  ] as const) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
  }
  if (t1 - t0 <= 1e-9) return null;
  return { x1: xa + dx * t0, y1: ya + dy * t0, x2: xa + dx * t1, y2: ya + dy * t1 };
}

/** A power of ten as a tick label: "1", "10", "10²", "10⁻³". */
export const powerOfTen = (k: number): string => (k === 0 ? '1' : k === 1 ? '10' : `10${sup(k)}`);

/**
 * The largest size, at most `max` and in steps of a half, at which `text` fits in `room`, given
 * the text's width at size 1.
 */
export const fitSize = (text: string, max: number, room: number, widthAt1: (t: string) => number) =>
  Math.min(max, Math.floor((room / widthAt1(text)) * 2) / 2);
