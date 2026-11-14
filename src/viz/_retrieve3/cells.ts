/**
 * Voronoi cells of a few centres in a box, for the IVF and product-quantization pages: the part
 * of the box nearer to one centre than to any other (squared distance; a tie goes to the centre
 * with the lower index, as in k-means), and the borders between neighbouring cells.
 *
 *   cell(centres, i, box)    centre i's cell, a convex polygon (empty when an earlier centre
 *                            sits on the same spot)
 *   borders(centres, box)    each border as a segment, with the two centres it separates
 *
 * Both are plain geometry on a handful of centres: half-planes clipped one at a time.
 */
import type { Vec } from '../../layouts/plane';

export interface Box {
  xmin: number;
  xmax: number;
  ymin: number;
  ymax: number;
}

const EPS = 1e-9;
const same = (a: Vec, b: Vec) => Math.abs(a.x - b.x) < EPS && Math.abs(a.y - b.y) < EPS;

/** The polygon cut to the half-plane a·p ≤ b (Sutherland–Hodgman, one edge). */
function clipHalf(poly: Vec[], a: Vec, b: number): Vec[] {
  const side = (p: Vec) => a.x * p.x + a.y * p.y - b;
  const out: Vec[] = [];
  poly.forEach((q, i) => {
    const p = poly[(i + poly.length - 1) % poly.length]!;
    const sp = side(p);
    const sq = side(q);
    const meet = () => {
      const t = sp / (sp - sq);
      return { x: p.x + t * (q.x - p.x), y: p.y + t * (q.y - p.y) };
    };
    if (sq <= EPS) {
      if (sp > EPS) out.push(meet());
      out.push(q);
    } else if (sp <= EPS) out.push(meet());
  });
  return out;
}

/** The half-plane of points nearer to c than to o: 2p·(o − c) ≤ |o|² − |c|². */
const nearerTo = (c: Vec, o: Vec): [Vec, number] => [
  { x: 2 * (o.x - c.x), y: 2 * (o.y - c.y) },
  o.x * o.x + o.y * o.y - c.x * c.x - c.y * c.y,
];

/** Centre i's cell in the box, corners in order; empty when it has no room of its own. */
export function cell(centres: readonly Vec[], i: number, box: Box): Vec[] {
  const c = centres[i]!;
  let poly: Vec[] = [
    { x: box.xmin, y: box.ymin },
    { x: box.xmax, y: box.ymin },
    { x: box.xmax, y: box.ymax },
    { x: box.xmin, y: box.ymax },
  ];
  for (const [j, o] of centres.entries()) {
    if (j === i) continue;
    if (same(c, o)) {
      if (j < i) return [];
      continue;
    }
    const [a, b] = nearerTo(c, o);
    poly = clipHalf(poly, a, b);
    if (poly.length < 3) return [];
  }
  return poly;
}

export interface Border {
  /** The two centres (indices, i < j) the border separates. */
  i: number;
  j: number;
  a: Vec;
  b: Vec;
}

/**
 * The borders between cells: for each pair of centres, the stretch of their perpendicular
 * bisector inside the box that is no nearer to any third centre. Pairs whose cells only touch
 * at a corner, or not at all, have none.
 */
export function borders(centres: readonly Vec[], box: Box): Border[] {
  const out: Border[] = [];
  for (let i = 0; i < centres.length; i++)
    for (let j = i + 1; j < centres.length; j++) {
      const ci = centres[i]!;
      const cj = centres[j]!;
      if (same(ci, cj)) continue;
      // A centre with an earlier twin has no cell of its own, so no border either.
      if (centres.some((o, k) => (k < i && same(o, ci)) || (k < j && k !== i && same(o, cj))))
        continue;
      const m = { x: (ci.x + cj.x) / 2, y: (ci.y + cj.y) / 2 };
      const d = { x: -(cj.y - ci.y), y: cj.x - ci.x };
      let lo = -Infinity;
      let hi = Infinity;
      // Keep the t where a·(m + t d) ≤ b.
      const keep = (a: Vec, b: number) => {
        const k = a.x * d.x + a.y * d.y;
        const r = b - (a.x * m.x + a.y * m.y);
        if (Math.abs(k) < EPS) {
          if (r < -EPS) hi = -Infinity;
        } else if (k > 0) hi = Math.min(hi, r / k);
        else lo = Math.max(lo, r / k);
      };
      keep({ x: 1, y: 0 }, box.xmax);
      keep({ x: -1, y: 0 }, -box.xmin);
      keep({ x: 0, y: 1 }, box.ymax);
      keep({ x: 0, y: -1 }, -box.ymin);
      centres.forEach((o, k) => {
        if (k === i || k === j) return;
        // A centre on the same spot as i or j takes nothing from their border.
        if (same(o, ci) || same(o, cj)) return;
        const [a, b] = nearerTo(ci, o);
        keep(a, b);
      });
      if (!(hi - lo > 1e-6)) continue;
      out.push({
        i,
        j,
        a: { x: m.x + lo * d.x, y: m.y + lo * d.y },
        b: { x: m.x + hi * d.x, y: m.y + hi * d.y },
      });
    }
  return out;
}
