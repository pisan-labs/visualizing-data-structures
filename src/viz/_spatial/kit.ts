/**
 * Shared pieces of the spatial and geometry pages (k-d tree, quadtree, closest pair, segment
 * intersection, Delaunay): reading point lists, seeded point sets for the presets (random,
 * grid, collinear, cocircular, clustered), exact predicates, and circles and boxes drawn on a
 * plane from src/layouts/plane.ts.
 */
import type { Rng } from '../../engine/rng';
import type { MarkRole, Value } from '../../engine/types';
import type { Shape } from '../../render/scene';
import {
  clipLine,
  drawSegment,
  readPoints,
  writePoints,
  type Plane,
  type Vec,
} from '../../layouts/plane';

/** A named point with an identity, so the drawing follows it. */
export interface NPt {
  id: number;
  name: string;
  x: number;
  y: number;
}

/** A, B, ..., Z, then A again. */
export const nameOf = (k: number) => String.fromCharCode(65 + ((k - 1) % 26));
export const at = (p: NPt) => `${p.name}(${p.x}, ${p.y})`;
export const same = (a: Vec, b: Vec) => a.x === b.x && a.y === b.y;
export const dist2 = (a: Vec, b: Vec) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

/**
 * The input box of a points page: a list "1,2 3,4", or a whole number, that many random
 * points. Returns the canonical list, the count, or an error a learner can act on.
 */
export function parsePointList(token: string, max: number, most: number): Value | Error {
  const t = token.trim();
  if (/^\d+$/.test(t)) {
    const n = Number(t);
    if (n < 1 || n > most) return new Error(`For random points, pick a count from 1 to ${most}.`);
    return n;
  }
  const pts = readPoints(t, 0, max, most);
  if (typeof pts === 'string') return new Error(pts);
  return writePoints(pts);
}

/** An operation's argument as points: a list, or a count of random distinct points. */
export function pointsArg(
  v: Value | undefined,
  rng: Rng,
  max: number,
  most: number,
  lo = 1,
  hi = max - 1,
): Vec[] | string {
  if (typeof v === 'number') {
    if (!Number.isInteger(v) || v < 1 || v > most)
      return `${v} is not a list of points. Type points such as 1,2 3,4, or a count from 1 to ${most} for random points.`;
    return randomPoints(rng, v, lo, hi);
  }
  if (typeof v !== 'string') return 'Type points such as 1,2 3,4.';
  if (/^\s*\d+\s*$/.test(v)) return pointsArg(Number(v), rng, max, most, lo, hi);
  return readPoints(v, 0, max, most);
}

export function shuffled<T>(rng: Rng, xs: readonly T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** n distinct random whole-number points with coordinates in [lo, hi]. */
export function randomPoints(rng: Rng, n: number, lo: number, hi: number): Vec[] {
  const room = (hi - lo + 1) ** 2;
  const seen = new Set<string>();
  const out: Vec[] = [];
  while (out.length < Math.min(n, room)) {
    const p = { x: rng.int(lo, hi), y: rng.int(lo, hi) };
    const k = `${p.x},${p.y}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out;
}

/** A regular grid of about n points spread over [lo, hi], in a shuffled order. */
export function gridPoints(rng: Rng, n: number, lo: number, hi: number): Vec[] {
  const k = Math.max(2, Math.ceil(Math.sqrt(n)));
  const step = Math.max(1, Math.floor((hi - lo) / (k - 1)));
  const pts: Vec[] = [];
  for (let i = 0; i < k; i++)
    for (let j = 0; j < k; j++) pts.push({ x: lo + i * step, y: lo + j * step });
  return shuffled(rng, pts).slice(0, n);
}

/** n points on one line (y = x + c or a gentler slope), shuffled: a degenerate input. */
export function collinearPoints(rng: Rng, n: number, lo: number, hi: number): Vec[] {
  const span = hi - lo;
  const gentle = n <= Math.floor(span / 2) + 1 && rng.int(0, 1) === 0;
  const pts: Vec[] = [];
  if (gentle) {
    const y0 = lo + rng.int(0, Math.floor(span / 2));
    for (let i = 0; i <= span && pts.length < n; i += 2) pts.push({ x: lo + i, y: y0 + i / 2 });
  } else {
    for (let i = 0; i <= span && pts.length < n; i++) pts.push({ x: lo + i, y: lo + i });
  }
  return shuffled(rng, pts);
}

/** The 12 whole-number points on the circle of radius 5 around (cx, cy). */
export function circlePoints(cx: number, cy: number): Vec[] {
  return [
    [5, 0],
    [4, 3],
    [3, 4],
    [0, 5],
    [-3, 4],
    [-4, 3],
    [-5, 0],
    [-4, -3],
    [-3, -4],
    [0, -5],
    [3, -4],
    [4, -3],
  ].map(([x, y]) => ({ x: cx + x!, y: cy + y! }));
}

/** Up to 12 points on one circle, shuffled: every four of them are cocircular. */
export function cocircularPoints(rng: Rng, n: number, cx: number, cy: number): Vec[] {
  const all = circlePoints(cx, cy);
  const m = Math.min(n, all.length);
  const step = all.length / m;
  return shuffled(
    rng,
    Array.from({ length: m }, (_, i) => all[Math.floor(i * step)]!),
  );
}

/** Two tight clusters far apart, so one region gets crowded. */
export function clusteredPoints(rng: Rng, n: number, lo: number, hi: number): Vec[] {
  const seen = new Set<string>();
  const out: Vec[] = [];
  const centers = [
    { x: lo + 2, y: lo + 2 },
    { x: hi - 2, y: hi - 3 },
  ];
  let guard = 0;
  while (out.length < n && guard++ < 1000) {
    const c = centers[out.length % 2 === 0 || out.length > (2 * n) / 3 ? 0 : 1]!;
    const p = {
      x: Math.min(hi, Math.max(lo, c.x + rng.int(-2, 2))),
      y: Math.min(hi, Math.max(lo, c.y + rng.int(-2, 2))),
    };
    const k = `${p.x},${p.y}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out;
}

/**
 * Whether d lies inside the circle through a, b, c (counter-clockwise): positive inside, zero on
 * it, negative outside. Exact for whole numbers of any size: the determinant is worked out with
 * BigInt, since its terms grow with the fourth power of the coordinates.
 */
export function inCircle(a: Vec, b: Vec, c: Vec, d: Vec): number {
  const B = BigInt;
  const adx = B(a.x - d.x);
  const ady = B(a.y - d.y);
  const bdx = B(b.x - d.x);
  const bdy = B(b.y - d.y);
  const cdx = B(c.x - d.x);
  const cdy = B(c.y - d.y);
  const det =
    (adx * adx + ady * ady) * (bdx * cdy - cdx * bdy) -
    (bdx * bdx + bdy * bdy) * (adx * cdy - cdx * ady) +
    (cdx * cdx + cdy * cdy) * (adx * bdy - bdx * ady);
  return det > 0n ? 1 : det < 0n ? -1 : 0;
}

/** The center of the circle through a, b, c (for drawing; null when they are collinear). */
export function circumcenter(a: Vec, b: Vec, c: Vec): Vec | null {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (d === 0) return null;
  const a2 = a.x * a.x + a.y * a.y;
  const b2 = b.x * b.x + b.y * b.y;
  const c2 = c.x * c.x + c.y * c.y;
  return {
    x: (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d,
    y: (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d,
  };
}

export interface CircleOptions {
  id: string;
  /** Center and radius in world units. */
  c: Vec;
  r: number;
  role?: MarkRole;
  dashed?: boolean;
  opacity?: number;
}

/** An outline circle (no fill) on the plane. */
export function drawCircle(shapes: Shape[], plane: Plane, o: CircleOptions): void {
  const c = plane.at(o.c);
  shapes.push({
    kind: 'circle',
    id: o.id,
    x: c.x,
    y: c.y,
    r: Math.max(0, o.r * plane.o.unit),
    role: o.role,
    cls: o.dashed ? 'ghost' : 'ring',
    opacity: o.opacity,
    z: 0,
  });
}

/**
 * A circle drawn as short chords clipped to the plane's window, so a big circle never spills
 * over the drawing beside the plane. Chord ids are `${id}-k`.
 */
export function drawClippedCircle(
  shapes: Shape[],
  plane: Plane,
  o: CircleOptions & { chords?: number },
): void {
  const n = o.chords ?? 72;
  const pt = (k: number) => ({
    x: o.c.x + o.r * Math.cos((2 * Math.PI * k) / n),
    y: o.c.y + o.r * Math.sin((2 * Math.PI * k) / n),
  });
  for (let k = 0; k < n; k++) {
    const p = pt(k);
    const q = pt(k + 1);
    const seg = clipLine(p, { x: q.x - p.x, y: q.y - p.y }, plane.o, 0, 1);
    if (!seg) continue;
    drawSegment(shapes, plane, {
      id: `${o.id}-${k}`,
      a: seg[0],
      b: seg[1],
      role: o.role,
      opacity: o.opacity,
      dashed: o.dashed,
    });
  }
}

export interface BoxOptions {
  id: string;
  /** Opposite corners in world units. */
  lo: Vec;
  hi: Vec;
  role?: MarkRole;
  dashed?: boolean;
  opacity?: number;
  /** Tint the inside (id `${id}-fill`): true for the plain tint, or a role. */
  fill?: boolean | MarkRole;
  /** Leave the outline out (only the tint). */
  noEdges?: boolean;
}

/** An axis-parallel box: four edges `${id}-s|e|n|w` and an optional tint. */
export function drawBox(shapes: Shape[], plane: Plane, o: BoxOptions): void {
  const a = plane.at({ x: o.lo.x, y: o.hi.y });
  const b = plane.at({ x: o.hi.x, y: o.lo.y });
  if (o.fill)
    shapes.push({
      kind: 'polygon',
      id: `${o.id}-fill`,
      points: [
        { x: a.x, y: a.y },
        { x: b.x, y: a.y },
        { x: b.x, y: b.y },
        { x: a.x, y: b.y },
      ],
      role: o.fill === true ? undefined : o.fill,
    });
  if (o.noEdges) return;
  const { lo, hi } = o;
  const edge = (k: string, p: Vec, q: Vec) =>
    drawSegment(shapes, plane, {
      id: `${o.id}-${k}`,
      a: p,
      b: q,
      role: o.role,
      dashed: o.dashed,
      opacity: o.opacity,
    });
  edge('s', lo, { x: hi.x, y: lo.y });
  edge('e', { x: hi.x, y: lo.y }, hi);
  edge('n', hi, { x: lo.x, y: hi.y });
  edge('w', { x: lo.x, y: hi.y }, lo);
}

/** A rectangle typed as two corners, "x1,y1 x2,y2", normalized so lo ≤ hi. */
export function readBox(v: Value | undefined, max: number): { lo: Vec; hi: Vec } | string {
  if (typeof v !== 'string') return 'Type a rectangle as two corners, such as 2,3 8,9.';
  const pts = readPoints(v, 0, max, 2);
  if (typeof pts === 'string') return pts;
  if (pts.length !== 2) return 'Type a rectangle as two corners, such as 2,3 8,9.';
  const [p, q] = pts as [Vec, Vec];
  return {
    lo: { x: Math.min(p.x, q.x), y: Math.min(p.y, q.y) },
    hi: { x: Math.max(p.x, q.x), y: Math.max(p.y, q.y) },
  };
}

/** One query point typed as "x,y". */
export function readPoint(v: Value | undefined, max: number): Vec | string {
  if (typeof v !== 'string') return 'Type one point, such as 4,7.';
  const pts = readPoints(v, 0, max, 1);
  if (typeof pts === 'string')
    return pts.startsWith('At most') ? 'Type one point, such as 4,7.' : pts;
  return pts[0]!;
}
