import type { MarkRole } from '../engine/types';

/**
 * A scene is what a view produces for one step: shapes in abstract units with stable ids.
 * The renderer matches shapes by id between scenes and animates the difference.
 */

interface ShapeBase {
  id: string;
  role?: MarkRole;
  /** Extra CSS class names. */
  cls?: string;
  opacity?: number;
  /** Paint order; higher is on top. Default: polygons -1, arrows 0, rects/circles 1, text 2. */
  z?: number;
  /** When the shape first appears, slide in from this point instead of only fading in. */
  enterFrom?: { x: number; y: number };
}

export interface RectShape extends ShapeBase {
  kind: 'rect';
  x: number;
  y: number;
  w: number;
  h: number;
  r?: number;
}

export interface TextShape extends ShapeBase {
  kind: 'text';
  x: number;
  y: number;
  text: string;
  size?: number;
  anchor?: 'start' | 'middle' | 'end';
  weight?: 'normal' | 'bold';
  /** Monospace for code-like labels. */
  mono?: boolean;
}

export interface ArrowShape extends ShapeBase {
  kind: 'arrow';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  dashed?: boolean;
  /** Which ends get an arrowhead. Default 'end'; 'none' draws a plain line (undirected edge). */
  head?: 'end' | 'none' | 'both';
  /**
   * Curve through this control point (a quadratic Bézier from (x1, y1) to (x2, y2)) instead of
   * a straight line: a self-loop on a state, or one of two opposite transitions side by side.
   */
  via?: { x: number; y: number };
}

export interface CircleShape extends ShapeBase {
  kind: 'circle';
  x: number;
  y: number;
  r: number;
}

/** A filled area, such as a triangle in the shoelace formula; drawn behind lines by default. */
export interface PolygonShape extends ShapeBase {
  kind: 'polygon';
  points: { x: number; y: number }[];
}

export type Shape = RectShape | TextShape | ArrowShape | CircleShape | PolygonShape;

export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Scene {
  shapes: Shape[];
  /** Fixed framing keeps the camera still while elements move. */
  bounds: Bounds;
  /** Plain-text description for screen readers. */
  label: string;
}

export function defaultZ(s: Shape): number {
  if (s.z !== undefined) return s.z;
  return s.kind === 'polygon' ? -1 : s.kind === 'arrow' ? 0 : s.kind === 'text' ? 2 : 1;
}

/**
 * The box around the shapes actually drawn (text width estimated), with padding. Static
 * pictures use it so space a view reserves for animation does not show as blank bands.
 */
export function shapesBounds(shapes: Shape[], pad = 10): Bounds | null {
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  const add = (ax: number, ay: number, bx: number, by: number) => {
    x1 = Math.min(x1, ax, bx);
    y1 = Math.min(y1, ay, by);
    x2 = Math.max(x2, ax, bx);
    y2 = Math.max(y2, ay, by);
  };
  for (const s of shapes) {
    if ((s.opacity ?? 1) <= 0) continue;
    if (s.kind === 'rect') add(s.x, s.y, s.x + s.w, s.y + s.h);
    else if (s.kind === 'circle') add(s.x - s.r, s.y - s.r, s.x + s.r, s.y + s.r);
    else if (s.kind === 'arrow') {
      add(s.x1, s.y1, s.x2, s.y2);
      // The curve stays inside the triangle of its ends and control point, and reaches
      // halfway from the chord's middle to the control point.
      if (s.via) {
        const mx = (s.x1 + s.x2) / 4 + s.via.x / 2;
        const my = (s.y1 + s.y2) / 4 + s.via.y / 2;
        add(mx, my, mx, my);
      }
    } else if (s.kind === 'polygon') for (const q of s.points) add(q.x, q.y, q.x, q.y);
    else {
      const size = s.size ?? 16;
      const w = s.text.length * size * 0.6;
      const left = s.anchor === 'middle' ? s.x - w / 2 : s.anchor === 'end' ? s.x - w : s.x;
      add(left, s.y - size, left + w, s.y + size * 0.3);
    }
  }
  if (!Number.isFinite(x1)) return null;
  return { x: x1 - pad, y: y1 - pad, w: x2 - x1 + 2 * pad, h: y2 - y1 + 2 * pad };
}
