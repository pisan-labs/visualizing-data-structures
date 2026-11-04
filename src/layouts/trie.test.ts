import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Bounds } from '../render/scene';
import { drawTrie, layoutTrie, trieEdgeId, trieLabelId, trieNodeId, trieRingId } from './trie';

/** A random ordered tree: each node's parent is an earlier node, and each edge gets a label. */
const treeArb = fc
  .array(
    fc.record({
      parent: fc.nat(),
      label: fc.string({ unit: fc.constantFrom('a', 'b', 'c', 'd'), minLength: 1, maxLength: 5 }),
      end: fc.boolean(),
    }),
    { maxLength: 30 },
  )
  .map((rows) => {
    const kids: number[][] = [[]];
    const labels = [''];
    const ends = [false];
    rows.forEach((r, i) => {
      const id = i + 1;
      kids.push([]);
      kids[r.parent % id]!.push(id);
      labels.push(r.label);
      ends.push(r.end);
    });
    return { kids, labels, ends };
  });

const overlap = (a: Bounds, b: Bounds) =>
  a.x < b.x + b.w - 1e-6 &&
  b.x < a.x + a.w - 1e-6 &&
  a.y < b.y + b.h - 1e-6 &&
  b.y < a.y + a.h - 1e-6;

describe('trie layout', () => {
  it('never overlaps nodes or labels, keeps children in order and parents centered', () => {
    fc.assert(
      fc.property(treeArb, ({ kids, labels, ends }) => {
        const r = 10;
        const half = (u: number) => (ends[u] ? r + 4 : r);
        const layout = layoutTrie<number>(0, (u) => kids[u]!, {
          label: (u) => labels[u]!,
          halfWidth: half,
          radius: r,
        });
        expect(layout.nodes.size).toBe(kids.length);
        const boxes: { id: string; b: Bounds }[] = [];
        for (const n of layout.nodes.values()) {
          const h = half(n.id);
          boxes.push({ id: `node ${n.id}`, b: { x: n.x - h, y: n.y - h, w: 2 * h, h: 2 * h } });
          if (n.label) boxes.push({ id: `label ${n.id}`, b: n.label });
          const ks = kids[n.id]!;
          const xs = ks.map((k) => layout.nodes.get(k)!.x);
          for (let i = 1; i < xs.length; i++) expect(xs[i]!).toBeGreaterThan(xs[i - 1]!);
          if (xs.length) expect(n.x).toBeCloseTo((xs[0]! + xs[xs.length - 1]!) / 2, 6);
          for (const k of ks) expect(layout.nodes.get(k)!.y).toBeCloseTo(n.y + layout.levelGap, 6);
        }
        for (let i = 0; i < boxes.length; i++)
          for (let j = i + 1; j < boxes.length; j++)
            expect(overlap(boxes[i]!.b, boxes[j]!.b), `${boxes[i]!.id} and ${boxes[j]!.id}`).toBe(
              false,
            );
        // Everything drawn is inside the bounds.
        const B = layout.bounds;
        for (const { b } of boxes) {
          expect(b.x).toBeGreaterThanOrEqual(B.x - 1e-6);
          expect(b.x + b.w).toBeLessThanOrEqual(B.x + B.w + 1e-6);
          expect(b.y + b.h).toBeLessThanOrEqual(B.y + B.h + 1e-6);
        }
      }),
      { numRuns: 300 },
    );
  });

  it('draws every node, ring, edge and label with ids keyed by node', () => {
    const kids = [[1, 2], [3], [], []];
    const layout = layoutTrie<number>(0, (u) => kids[u]!, {
      label: (u) => ['', 'ca', 'd', 't'][u]!,
    });
    const shapes = drawTrie(layout, { isEnd: (u) => u === 2 || u === 3 });
    const ids = shapes.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const u of [0, 1, 2, 3]) expect(ids).toContain(trieNodeId(u));
    for (const u of [1, 2, 3]) {
      expect(ids).toContain(trieEdgeId(u));
      expect(ids).toContain(`${trieEdgeId(u)}-low`);
      expect(ids).toContain(trieLabelId(u));
    }
    expect(ids.filter((id) => id.startsWith('tr-')).sort()).toEqual([trieRingId(2), trieRingId(3)]);
    // A lone child hangs straight down, and its label sits on the edge between the two.
    const one = layout.nodes.get(1)!;
    const three = layout.nodes.get(3)!;
    expect(three.x).toBeCloseTo(one.x, 6);
    expect(three.label!.x + three.label!.w / 2).toBeCloseTo(one.x, 6);
  });
});
