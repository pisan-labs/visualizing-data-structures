import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { writePoints } from '../../layouts/plane';
import { smallestText } from '../../render/text-size';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { quadtree, parseInput } from '.';
import { heightOf, node, point, type QState } from './model';

const pointArb = fc.record({
  x: fc.integer({ min: 0, max: 15 }),
  y: fc.integer({ min: 0, max: 15 }),
});

/** Squares tile their parent, every point sits in the leaf whose square holds it, leaves fit. */
function checkInvariant(s: QState, capacity: number) {
  const placed: number[] = [];
  for (const n of s.nodes) {
    if (n.kids) {
      const kids = n.kids.map((k) => node(s, k));
      for (const c of kids) {
        expect(c.size).toBe(n.size / 2);
        expect(c.depth).toBe(n.depth + 1);
        expect(c.x0 >= n.x0 && c.x0 + c.size <= n.x0 + n.size).toBe(true);
        expect(c.y0 >= n.y0 && c.y0 + c.size <= n.y0 + n.size).toBe(true);
      }
      expect(new Set(kids.map((c) => `${c.x0},${c.y0}`)).size).toBe(4);
    } else {
      // Mid-insert a leaf may hold one point too many, just before it splits.
      expect(n.points!.length).toBeLessThanOrEqual(capacity + 1);
      for (const pid of n.points!) {
        const p = point(s, pid);
        expect(p.x >= n.x0 && p.x < n.x0 + n.size && p.y >= n.y0 && p.y < n.y0 + n.size).toBe(true);
        placed.push(pid);
      }
    }
  }
  expect(placed.length).toBe(s.points.length);
}

describe('quadtree', () => {
  it('splits a full leaf until two close points part', () => {
    const t = new Timeline(quadtree, { capacity: 1 }, 1, [['insert', '8,8 9,9']]);
    const s = t.endState();
    expect(heightOf(s)).toBe(4);
    expect(s.nodes.length).toBe(1 + 4 * 4);
  });

  it('matches brute force for range queries, and keeps leaves within capacity', () => {
    fc.assert(
      fc.property(
        fc.array(pointArb, { minLength: 1, maxLength: 16 }),
        pointArb,
        pointArb,
        fc.integer({ min: 1, max: 3 }),
        (pts, c1, c2, capacity) => {
          const calls: OpCall[] = [
            ['insert', writePoints(pts)],
            ['query', `${c1.x},${c1.y} ${c2.x},${c2.y}`],
          ];
          const t = new Timeline(quadtree, { capacity }, 1, calls);
          for (let i = 0; i < t.length; i++) checkInvariant(t.at(i).step.state, capacity);
          const end = t.endState();
          // After an operation, every leaf holds at most `capacity` points.
          for (const n of t.entries[0]!.end.nodes)
            if (n.points) expect(n.points.length).toBeLessThanOrEqual(capacity);
          // Every inner node exists because its square once held more than `capacity` points.
          for (const n of end.nodes)
            if (n.kids) {
              const count = (id: number): number => {
                const m = node(end, id);
                return m.kids ? m.kids.reduce((a, k) => a + count(k), 0) : m.points!.length;
              };
              expect(count(n.id)).toBeGreaterThan(capacity);
            }
          const lo = { x: Math.min(c1.x, c2.x), y: Math.min(c1.y, c2.y) };
          const hi = { x: Math.max(c1.x, c2.x), y: Math.max(c1.y, c2.y) };
          const inside = new Set(
            pts
              .filter((p) => p.x >= lo.x && p.x <= hi.x && p.y >= lo.y && p.y <= hi.y)
              .map((p) => `${p.x},${p.y}`),
          );
          const found = end.found.map((id) => `${point(end, id).x},${point(end, id).y}`);
          expect(new Set(found)).toEqual(inside);
          expect(found.length).toBe(inside.size);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('parses points and rejects coordinates past 15', () => {
    expect(parseInput('1,2 3,4')).toBe('1,2 3,4');
    expect(parseInput('1,16')).toBeInstanceOf(Error);
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(quadtree, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(quadtree, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
