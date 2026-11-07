import { describe, expect, it } from 'vitest';
import { interpolate } from './interpolate';
import { shapesBounds, type Scene } from './scene';

const scene = (via: { x: number; y: number }): Scene => ({
  label: 'a loop',
  bounds: { x: 0, y: 0, w: 100, h: 100 },
  shapes: [{ kind: 'arrow', id: 'loop', x1: 40, y1: 50, x2: 60, y2: 50, via }],
});

describe('curved arrows', () => {
  it('bend smoothly from one control point to another', () => {
    const mid = interpolate(scene({ x: 50, y: 0 }), scene({ x: 50, y: 100 }), 0.5);
    const arrow = mid.shapes[0]!;
    expect(arrow.kind === 'arrow' && arrow.via).toEqual({ x: 50, y: 50 });
  });

  it('count the top of the curve in the drawn box', () => {
    // The curve's highest point is halfway from the chord (y 50) to the control point (y 0).
    const b = shapesBounds(scene({ x: 50, y: 0 }).shapes, 0)!;
    expect(b.y).toBeCloseTo(25);
    expect(b.h).toBeCloseTo(25);
  });
});
