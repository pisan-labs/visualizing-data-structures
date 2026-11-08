import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { clipToBox, fitSize, powerOfTen, type PlotBox } from './chart';

const BOX: PlotBox = { x0: 10, x1: 110, y0: 20, y1: 220 };
const inside = (x: number, y: number) =>
  x >= BOX.x0 - 1e-9 && x <= BOX.x1 + 1e-9 && y >= BOX.y0 - 1e-9 && y <= BOX.y1 + 1e-9;

describe('clipToBox', () => {
  it('keeps a segment inside the box as it is', () => {
    expect(clipToBox(BOX, 20, 30, 100, 200)).toEqual({ x1: 20, y1: 30, x2: 100, y2: 200 });
  });

  it('cuts a segment at the edge it crosses', () => {
    expect(clipToBox(BOX, 60, 120, 60, 0)).toEqual({ x1: 60, y1: 120, x2: 60, y2: 20 });
  });

  it('drops a segment wholly outside, or one only touching an edge', () => {
    expect(clipToBox(BOX, 0, 0, 5, 300)).toBeNull();
    expect(clipToBox(BOX, 10, 0, 10, 0)).toBeNull();
  });

  it('returns a piece of the segment that lies in the box', () => {
    const coord = fc.double({ min: -200, max: 400, noNaN: true });
    fc.assert(
      fc.property(coord, coord, coord, coord, (xa, ya, xb, yb) => {
        const seg = clipToBox(BOX, xa, ya, xb, yb);
        if (!seg) return;
        expect(inside(seg.x1, seg.y1) && inside(seg.x2, seg.y2)).toBe(true);
        // Both ends lie on the original line (cross product near 0).
        for (const [x, y] of [
          [seg.x1, seg.y1],
          [seg.x2, seg.y2],
        ] as const) {
          const cross = (xb - xa) * (y - ya) - (yb - ya) * (x - xa);
          expect(Math.abs(cross)).toBeLessThan(1e-6 * (1 + Math.hypot(xb - xa, yb - ya) ** 2));
        }
      }),
    );
  });
});

describe('powerOfTen', () => {
  it('writes small powers plainly and the rest with a superscript', () => {
    expect([0, 1, 2, 30, -3].map(powerOfTen)).toEqual(['1', '10', '10²', '10³⁰', '10⁻³']);
  });
});

describe('fitSize', () => {
  const width = (t: string) => t.length * 0.5;
  it('caps at the largest size and shrinks in half steps to fit', () => {
    expect(fitSize('abcd', 15, 100, width)).toBe(15);
    expect(fitSize('abcd', 15, 21, width)).toBe(10.5);
  });
});
