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
  /** Paint order; higher is on top. Default: arrows 0, rects/circles 1, text 2. */
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
}

export interface CircleShape extends ShapeBase {
  kind: 'circle';
  x: number;
  y: number;
  r: number;
}

export type Shape = RectShape | TextShape | ArrowShape | CircleShape;

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
  return s.kind === 'arrow' ? 0 : s.kind === 'text' ? 2 : 1;
}
