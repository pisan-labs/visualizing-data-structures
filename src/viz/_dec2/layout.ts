/**
 * Placing panels for the decoding and tokenization pages of wave 9C (speculative-decoding,
 * constrained-decoding): a panel is shapes with its top left corner at (0, 0) and a size; a
 * drawing made elsewhere with its own bounds (drawTable, drawAutomaton) becomes one with
 * `fromBounds`; `arrange` puts panels where a view says and returns the scene's shapes and
 * bounds, padded by 12 as views pad a scene.
 */
import type { Bounds, Shape } from '../../render/scene';

export interface Block {
  shapes: Shape[];
  w: number;
  h: number;
}

/** Shapes moved by (dx, dy), curves and polygons included. */
export function shift(shapes: readonly Shape[], dx: number, dy: number): Shape[] {
  return shapes.map((s) => {
    switch (s.kind) {
      case 'arrow':
        return {
          ...s,
          x1: s.x1 + dx,
          y1: s.y1 + dy,
          x2: s.x2 + dx,
          y2: s.y2 + dy,
          via: s.via && { x: s.via.x + dx, y: s.via.y + dy },
        };
      case 'polygon':
        return { ...s, points: s.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
      default:
        return { ...s, x: s.x + dx, y: s.y + dy };
    }
  });
}

/** A drawing with bounds, as a block whose corner is (0, 0); `pad` is what the bounds added. */
export function fromBounds(t: { shapes: Shape[]; bounds: Bounds }, pad = 12): Block {
  return {
    shapes: shift(t.shapes, -t.bounds.x - pad, -t.bounds.y - pad),
    w: t.bounds.w - 2 * pad,
    h: t.bounds.h - 2 * pad,
  };
}

/** Blocks at their places: the scene's shapes and its bounds, padded by 12. */
export function arrange(parts: readonly { b: Block; x: number; y: number }[]): {
  shapes: Shape[];
  bounds: Bounds;
} {
  const shapes = parts.flatMap(({ b, x, y }) => shift(b.shapes, x, y));
  const x2 = Math.max(...parts.map(({ b, x }) => x + b.w));
  const y2 = Math.max(...parts.map(({ b, y }) => y + b.h));
  return { shapes, bounds: { x: -12, y: -12, w: x2 + 24, h: y2 + 24 } };
}
