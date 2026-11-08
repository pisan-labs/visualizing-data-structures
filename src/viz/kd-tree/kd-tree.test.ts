import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { writePoints } from '../../layouts/plane';
import { smallestText } from '../../render/text-size';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { dist2 } from '../_spatial/kit';
import { kdTree, medianFirst, parseInput } from '.';
import { axisOf, byId, height, subtree, type KdState } from './model';

const pointArb = fc.record({
  x: fc.integer({ min: 0, max: 12 }),
  y: fc.integer({ min: 0, max: 12 }),
});

/** Every node splits its subtree: smaller coordinates on its axis to the left, the rest right. */
function checkInvariant(s: KdState) {
  for (const n of s.nodes) {
    const a = axisOf(n.depth);
    for (const id of subtree(s, n.left)) expect(byId(s, id)[a]).toBeLessThan(n[a]);
    for (const id of subtree(s, n.right)) expect(byId(s, id)[a]).toBeGreaterThanOrEqual(n[a]);
    for (const c of [n.left, n.right]) if (c !== null) expect(byId(s, c).depth).toBe(n.depth + 1);
  }
  const keys = s.nodes.map((n) => `${n.x},${n.y}`);
  expect(new Set(keys).size).toBe(keys.length);
}

describe('k-d tree', () => {
  it('builds the tree of the textbook example and splits x, then y', () => {
    const t = new Timeline(kdTree, kdTree.defaults, 1, [['insert', '6,5 3,8 9,2 2,3']]);
    const s = t.endState();
    const root = byId(s, s.root!);
    expect([root.x, root.y]).toEqual([6, 5]);
    expect(byId(s, root.left!).name).toBe('B');
    expect(byId(s, root.right!).name).toBe('C');
    expect(byId(s, byId(s, root.left!).left!).name).toBe('D');
  });

  it('balances when medians go first', () => {
    const diag = Array.from({ length: 8 }, (_, i) => ({ x: i + 1, y: i + 1 }));
    const path = new Timeline(kdTree, kdTree.defaults, 1, [['insert', writePoints(diag)]]);
    const bal = new Timeline(kdTree, kdTree.defaults, 1, [
      ['insert', writePoints(medianFirst(diag))],
    ]);
    expect(height(path.endState())).toBe(7);
    expect(height(bal.endState())).toBe(3);
  });

  it('matches brute force for nearest and range, with or without pruning', () => {
    fc.assert(
      fc.property(
        fc.array(pointArb, { minLength: 1, maxLength: 15 }),
        pointArb,
        pointArb,
        pointArb,
        fc.boolean(),
        (pts, q, c1, c2, prune) => {
          const calls: OpCall[] = [
            ['insert', writePoints(pts)],
            ['nearest', `${q.x},${q.y}`],
            ['range', `${c1.x},${c1.y} ${c2.x},${c2.y}`],
          ];
          const t = new Timeline(kdTree, { prune }, 1, calls);
          for (let i = 0; i < t.length; i++) checkInvariant(t.at(i).step.state);
          const [, near, rng] = t.entries;
          const best = Math.min(...pts.map((p) => dist2(p, q)));
          expect(near!.end.bestD2).toBe(best);
          const lo = { x: Math.min(c1.x, c2.x), y: Math.min(c1.y, c2.y) };
          const hi = { x: Math.max(c1.x, c2.x), y: Math.max(c1.y, c2.y) };
          const inside = new Set(
            pts
              .filter((p) => p.x >= lo.x && p.x <= hi.x && p.y >= lo.y && p.y <= hi.y)
              .map((p) => `${p.x},${p.y}`),
          );
          const found = rng!.end.found.map((id) => {
            const n = byId(rng!.end, id);
            return `${n.x},${n.y}`;
          });
          expect(new Set(found)).toEqual(inside);
          expect(found.length).toBe(inside.size);
          // Without pruning, every node is visited; with it, never more.
          const n = near!.end.nodes.length;
          if (!prune) expect(near!.end.visited.length).toBe(n);
          else expect(near!.end.visited.length).toBeLessThanOrEqual(n);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('parses points, counts and corners', () => {
    expect(parseInput('1,2 3,4')).toBe('1,2 3,4');
    expect(parseInput('7')).toBe(7);
    expect(parseInput('1,2 13,4')).toBeInstanceOf(Error);
    expect(parseInput('99')).toBeInstanceOf(Error);
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(kdTree, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(kdTree, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
