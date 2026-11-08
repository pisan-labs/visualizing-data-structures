import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeRng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import { orient, writePoints, type Vec } from '../../layouts/plane';
import { smallestText } from '../../render/text-size';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { inCircle } from '../_spatial/kit';
import { delaunay, parseInput } from '.';
import { realTris, triangleList, vertex } from './model';
import { cocircular } from './practice';

const pointArb = fc.record({
  x: fc.integer({ min: 0, max: 12 }),
  y: fc.integer({ min: 0, max: 12 }),
});

/** Points on the boundary of the convex hull, collinear ones on edges included (brute force). */
function hullCount(pts: Vec[]): number {
  let count = 0;
  for (const p of pts) {
    // p is on the boundary when some line through p has every point on one side.
    const others = pts.filter((q) => q !== p);
    const onBoundary = others.some((q) =>
      [1, -1].some((side) => others.every((r) => side * orient(p, q, r) >= 0)),
    );
    if (onBoundary || others.length === 0) count++;
  }
  return count;
}

describe('Delaunay triangulation', () => {
  it('splits a square into two triangles and a triangle point into three', () => {
    const t = new Timeline(delaunay, delaunay.defaults, 1, [
      ['insert', '2,2 10,3 6,10'],
      ['insert', '6,5'],
    ]);
    expect(triangleList(t.endState())).toHaveLength(3);
  });

  it('has empty circles, 2n − 2 − h triangles, and covers the hull, for any points', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(pointArb, { minLength: 1, maxLength: 14, selector: (p) => `${p.x},${p.y}` }),
        (pts) => {
          const t = new Timeline(delaunay, delaunay.defaults, 1, [['insert', writePoints(pts)]]);
          const s = t.endState();
          const tris = realTris(s);
          for (const tri of tris) {
            const [a, b, c] = tri.v.map((v) => vertex(s, v));
            expect(orient(a!, b!, c!)).toBeGreaterThan(0);
            for (const p of s.points)
              if (!tri.v.includes(p.id)) expect(inCircle(a!, b!, c!, p)).toBeLessThanOrEqual(0);
          }
          const collinear = pts.every((p) => orient(pts[0]!, pts[1] ?? p, p) === 0);
          if (collinear) expect(tris).toHaveLength(0);
          else expect(tris.length).toBe(2 * pts.length - 2 - hullCount(pts));
          // On every step the scaffolding and the real triangles tile the super triangle: all are
          // counter-clockwise.
          for (let i = 0; i < t.length; i++)
            for (const tri of t.at(i).step.state.tris) {
              const st = t.at(i).step.state;
              const [a, b, c] = tri.v.map((v) => vertex(st, v));
              expect(orient(a!, b!, c!)).toBeGreaterThan(0);
            }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('says "it" for one bad triangle, "together they" for several', () => {
    const t = new Timeline(delaunay, delaunay.defaults, 1, [['insert', '2,2 10,1 6,10']]);
    const says = t.entries[0]!.steps.map((st) => st.say);
    expect(says).toContain(
      '1 bad triangle. It forms a hole around A with 3 edges on its boundary.',
    );
    expect(says.some((x) => x.includes('1 bad triangle. Together'))).toBe(false);
  });

  it('parses points', () => {
    expect(parseInput('1,2 3,4')).toBe('1,2 3,4');
    expect(parseInput('1,13')).toBeInstanceOf(Error);
  });
});

describe('practice', () => {
  it('asks for neighbours only when the triangulation is unique', () => {
    const kind = delaunay.practice!.find((k) => k.id === 'neighbours')!;
    for (let seed = 0; seed < 300; seed++) {
      const q = kind.make(makeRng(seed));
      const end = new Timeline(delaunay, delaunay.defaults, 1, q.setup).endState();
      expect(cocircular(end), `seed ${seed}`).toBe(false);
    }
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(delaunay, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(delaunay, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
