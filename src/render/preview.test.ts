import { describe, expect, it } from 'vitest';
import { vizzes } from '../viz/all';
import { makePreview, MAX_FRAMES } from './preview';

describe('catalog previews', () => {
  it('every page asks for a thumbnail', () => {
    expect(vizzes.filter((d) => !d.preview).map((d) => d.id)).toEqual([]);
  });

  for (const def of vizzes) {
    it(`${def.id}: bare shapes that move, inside one fixed frame`, () => {
      const p = makePreview(def)!;
      expect(p.frames.length).toBeGreaterThanOrEqual(4);
      expect(p.frames.length).toBeLessThanOrEqual(MAX_FRAMES);
      expect(p.poster).toBeGreaterThanOrEqual(0);
      expect(p.poster).toBeLessThan(p.frames.length);
      const b = p.bounds;
      const inside = (x: number, y: number) =>
        x >= b.x - 0.5 && x <= b.x + b.w + 0.5 && y >= b.y - 0.5 && y <= b.y + b.h + 0.5;
      let changes = 0;
      p.frames.forEach((shapes, i) => {
        expect(shapes.length, `frame ${i}`).toBeGreaterThan(0);
        expect(new Set(shapes.map((s) => s.id)).size, `frame ${i} ids`).toBe(shapes.length);
        for (const s of shapes) {
          expect(s.kind).not.toBe('text');
          if (s.kind === 'arrow') expect(inside(s.x1, s.y1) && inside(s.x2, s.y2), s.id).toBe(true);
          else if (s.kind === 'polygon') expect(s.points.every((q) => inside(q.x, q.y))).toBe(true);
          else expect(inside(s.x, s.y), s.id).toBe(true);
        }
        if (i > 0 && JSON.stringify(shapes) !== JSON.stringify(p.frames[i - 1])) changes++;
      });
      // A thumbnail that barely changes does not show the idea.
      expect(changes).toBeGreaterThanOrEqual(3);
    });
  }
});
