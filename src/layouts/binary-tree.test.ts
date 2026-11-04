import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  drawBinaryTree,
  edgeShapeId,
  keyShapeId,
  layoutBinaryTree,
  nilSpot,
  nodeShapeId,
  nullShapeId,
  type BinaryTreeAccess,
} from './binary-tree';

interface T {
  left: Record<number, number | null>;
  right: Record<number, number | null>;
  root: number | null;
  n: number;
}

/** Random tree on ids 0..n-1: each new node takes a free child spot. */
const treeArb: fc.Arbitrary<T> = fc.array(fc.nat(), { maxLength: 40 }).map((picks) => {
  const t: T = { left: {}, right: {}, root: null, n: 0 };
  if (picks.length === 0) return t;
  t.root = 0;
  t.left[0] = null;
  t.right[0] = null;
  const spots: [number, 'left' | 'right'][] = [
    [0, 'left'],
    [0, 'right'],
  ];
  picks.slice(1).forEach((p, i) => {
    const id = i + 1;
    const [parent, side] = spots.splice(p % spots.length, 1)[0]!;
    t[side][parent] = id;
    t.left[id] = null;
    t.right[id] = null;
    spots.push([id, 'left'], [id, 'right']);
  });
  t.n = picks.length;
  return t;
});

const access = (t: T): BinaryTreeAccess<number> => ({
  left: (u) => t.left[u] ?? null,
  right: (u) => t.right[u] ?? null,
});

function subtreeIds(t: T, u: number | null, out: number[] = []): number[] {
  if (u === null) return out;
  out.push(u);
  subtreeIds(t, t.left[u] ?? null, out);
  subtreeIds(t, t.right[u] ?? null, out);
  return out;
}

describe('binary tree layout', () => {
  it('never overlaps, centers parents and keeps lone children to their side', () => {
    fc.assert(
      fc.property(treeArb, (t) => {
        const L = layoutBinaryTree(t.root, access(t));
        const r = L.radius;
        expect(L.nodes.size).toBe(t.n);
        const byDepth = new Map<number, number[]>();
        for (const p of L.nodes.values()) {
          expect(p.y).toBe(p.depth * L.levelGap);
          byDepth.set(p.depth, [...(byDepth.get(p.depth) ?? []), p.x]);
          const a = t.left[p.id as number] ?? null;
          const b = t.right[p.id as number] ?? null;
          const pa = a === null ? null : L.nodes.get(a)!;
          const pb = b === null ? null : L.nodes.get(b)!;
          if (pa && pb) expect(p.x).toBeCloseTo((pa.x + pb.x) / 2, 9);
          else if (pa) expect(pa.x).toBeCloseTo(p.x - (r + L.gap / 2), 9);
          else if (pb) expect(pb.x).toBeCloseTo(p.x + (r + L.gap / 2), 9);
          // Bounds hold every circle.
          expect(p.x - r).toBeGreaterThanOrEqual(L.bounds.x - 1e-9);
          expect(p.x + r).toBeLessThanOrEqual(L.bounds.x + L.bounds.w + 1e-9);
          expect(p.y + r).toBeLessThanOrEqual(L.bounds.y + L.bounds.h + 1e-9);
        }
        for (const xs of byDepth.values()) {
          xs.sort((p, q) => p - q);
          for (let i = 1; i < xs.length; i++)
            expect(xs[i]! - xs[i - 1]!).toBeGreaterThanOrEqual(2 * r + L.gap - 1e-9);
        }
        expect(L.height).toBe(t.n ? Math.max(...[...L.nodes.values()].map((p) => p.depth)) : -1);
      }),
      { numRuns: 300 },
    );
  });

  it('draws a subtree the same way wherever it appears', () => {
    fc.assert(
      fc.property(treeArb, fc.nat(), (t, pick) => {
        if (t.root === null) return;
        const whole = layoutBinaryTree(t.root, access(t));
        const ids = subtreeIds(t, t.root);
        const sub = ids[pick % ids.length]!;
        const alone = layoutBinaryTree(sub, access(t));
        const origin = whole.nodes.get(sub)!;
        for (const u of subtreeIds(t, sub)) {
          const a = alone.nodes.get(u)!;
          const w = whole.nodes.get(u)!;
          expect(w.x - origin.x).toBeCloseTo(a.x, 9);
          expect(w.y - origin.y).toBeCloseTo(a.y, 9);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('lays out null children as squares that take room', () => {
    fc.assert(
      fc.property(treeArb, (t) => {
        const L = layoutBinaryTree(t.root, access(t), { nulls: true });
        expect(L.nulls.length).toBe(t.root === null ? 0 : t.n + 1);
        // Real nodes and null squares at the same depth never overlap.
        const items = [
          ...[...L.nodes.values()].map((p) => ({
            d: p.depth,
            lo: p.x - L.radius,
            hi: p.x + L.radius,
          })),
          ...L.nulls.map((z) => ({
            d: z.depth,
            lo: z.x - L.nullSize / 2,
            hi: z.x + L.nullSize / 2,
          })),
        ];
        const depths = new Set(items.map((i) => i.d));
        for (const d of depths) {
          const row = items.filter((i) => i.d === d).sort((a, b) => a.lo - b.lo);
          for (let i = 1; i < row.length; i++)
            expect(row[i]!.lo - row[i - 1]!.hi).toBeGreaterThanOrEqual(L.gap - 1e-9);
        }
        for (const z of L.nulls) {
          const p = L.nodes.get(z.parent)!;
          expect(z.x < p.x).toBe(z.side === 'left');
          expect(z.y).toBeGreaterThan(p.y);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('is deterministic and gives each shape a stable id', () => {
    const t: T = {
      root: 5,
      left: { 5: 3, 3: null, 8: null },
      right: { 5: 8, 3: null, 8: null },
      n: 3,
    };
    const a = layoutBinaryTree(t.root, access(t));
    const b = layoutBinaryTree(t.root, access(t));
    expect([...a.nodes.values()]).toEqual([...b.nodes.values()]);
    const shapes = drawBinaryTree(a, { label: (u) => String(u) });
    const ids = shapes.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(
      expect.arrayContaining([nodeShapeId(5), keyShapeId(5), edgeShapeId(3), edgeShapeId(8)]),
    );
    expect(ids).not.toContain(edgeShapeId(5));
    for (const s of shapes) if (s.kind === 'arrow') expect(s.head).toBe('none');
    const withNulls = drawBinaryTree(layoutBinaryTree(t.root, access(t), { nulls: true }), {
      label: String,
    });
    expect(withNulls.map((s) => s.id)).toContain(nullShapeId(3, 'left'));
    expect(layoutBinaryTree(null, access(t)).bounds).toEqual({ x: 0, y: 0, w: 0, h: 0 });
  });

  it('puts a nil marker clear of every node', () => {
    fc.assert(
      fc.property(treeArb, (t) => {
        const L = layoutBinaryTree(t.root, access(t));
        for (const p of L.nodes.values()) {
          for (const side of ['left', 'right'] as const) {
            if ((side === 'left' ? t.left : t.right)[p.id as number] !== null) continue;
            const spot = nilSpot(L, p.id, side);
            for (const q of L.nodes.values()) {
              // The marker is a square of side 12: keep its corners outside every circle.
              expect(Math.hypot(spot.x - q.x, spot.y - q.y)).toBeGreaterThan(
                L.radius + 6 * Math.SQRT2 - 1,
              );
            }
          }
        }
      }),
      { numRuns: 200 },
    );
  });

  it('rejects a structure that is not a tree', () => {
    const cyclic: BinaryTreeAccess<number> = { left: () => 1, right: () => null };
    expect(() => layoutBinaryTree(1, cyclic)).toThrow(/not a tree/);
  });
});
