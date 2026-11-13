/**
 * Drawing points on the plane for the retrieval pages: the window from 0 to MAX (points.ts),
 * either with axes and numbers (drawAxes, the plane.ts grid) or as a plain framed box for small
 * panels (drawWindow), and a named point (drawPt).
 */
import type { MarkRole } from '../../engine/types';
import { drawGrid, drawSegment, makePlane, text, type Plane, type Vec } from '../../layouts/plane';
import type { Shape } from '../../render/scene';
import { MAX } from './points';

/** The window from 0 to MAX, `unit` scene units per world unit, its top left corner at (x, y). */
export const field = (unit: number, x: number, y: number): Plane =>
  makePlane({ xmin: 0, xmax: MAX, ymin: 0, ymax: MAX, unit, x, y });

/** Faint grid lines, the axes, and numbers every two units. */
export function drawAxes(shapes: Shape[], plane: Plane, id: string): void {
  drawGrid(shapes, plane, { id, step: 1, labelEvery: 2, opacity: 0.16 });
}

/**
 * A framed box with a faint grid every `grid` units and a title above it, for a small panel.
 * Ids: `${id}-s|e|n|w` (the frame), `${id}-gx<k>` and `${id}-gy<k>` (grid lines), `${id}-t`.
 */
export function drawWindow(
  shapes: Shape[],
  plane: Plane,
  id: string,
  o: { grid?: number; title?: string; role?: MarkRole; size?: number } = {},
): void {
  const grid = o.grid ?? 2;
  for (let k = grid; k < MAX; k += grid) {
    drawSegment(shapes, plane, { id: `${id}-gx${k}`, a: { x: k, y: 0 }, b: { x: k, y: MAX }, opacity: 0.12 });
    drawSegment(shapes, plane, { id: `${id}-gy${k}`, a: { x: 0, y: k }, b: { x: MAX, y: k }, opacity: 0.12 });
  }
  const c: Vec[] = [
    { x: 0, y: 0 },
    { x: MAX, y: 0 },
    { x: MAX, y: MAX },
    { x: 0, y: MAX },
  ];
  ['s', 'e', 'n', 'w'].forEach((side, i) =>
    drawSegment(shapes, plane, {
      id: `${id}-${side}`,
      a: c[i]!,
      b: c[(i + 1) % 4]!,
      opacity: 0.55,
      role: o.role,
    }),
  );
  if (o.title !== undefined) {
    const at = plane.at({ x: 0, y: MAX });
    shapes.push(
      text(`${id}-t`, { x: at.x, y: at.y - 6 }, o.title, {
        size: o.size ?? 13,
        bold: true,
        role: o.role,
        cls: o.role ? undefined : '',
      }),
    );
  }
}

export interface PtLook {
  id: string;
  at: Vec;
  r?: number;
  role?: MarkRole;
  /** The circle's class: 'live' (filled) by default. */
  cls?: string;
  label?: string;
  size?: number;
  opacity?: number;
  /** Label offset from the dot in scene units. Default (7, −7). */
  dx?: number;
  dy?: number;
  z?: number;
}

/** A dot (id) and its label (id-l): the label in the text color, bold, so it reads on any role. */
export function drawPt(shapes: Shape[], plane: Plane, p: PtLook): void {
  const c = plane.at(p.at);
  shapes.push({
    kind: 'circle',
    id: p.id,
    x: c.x,
    y: c.y,
    r: p.r ?? 6,
    role: p.role,
    cls: p.cls ?? 'live',
    opacity: p.opacity,
    z: p.z,
  });
  if (p.label !== undefined)
    shapes.push(
      text(`${p.id}-l`, { x: c.x + (p.dx ?? 7), y: c.y + (p.dy ?? -7) }, p.label, {
        size: p.size ?? 13,
        bold: true,
        opacity: p.opacity,
        cls: '',
      }),
    );
}
