/**
 * 3D space drawn on the 2D plane, for the 3D transform pages (3D rotation and scale, 3D change
 * of coordinates). No WebGL: every point is projected to the plane with a fixed projection and
 * drawn with the helpers in plane.ts, so shapes keep their ids and the renderer animates them.
 *
 *   project(p, kind)                                    3D point to 2D world point
 *   makeSpace({ kind, reach, unit, x, y })              a plane window that fits the ball |p| ≤ reach
 *   drawAxes3(shapes, space, { id, reach })             x, y, z axes with names, and a faint floor grid
 *   drawSegment3 / drawVector3 / drawPoint3             plane.ts shapes at projected points
 *
 * Projections, with z up and right-handed axes:
 *   isometric: seen from (1, 1, 1). x runs down-left, y down-right, z up, all foreshortened alike.
 *   oblique (cabinet): x right, z up, y goes into the page at 45° at half length.
 *
 * Math on 3-vectors and 3×3 matrices (row-major, 9 numbers) lives here too. The sums are
 * written out left to right, the same way the code tabs write them, so results agree to the bit.
 */
import type { MarkRole } from '../engine/types';
import type { Shape } from '../render/scene';
import {
  drawPoint,
  drawSegment,
  drawVector,
  fmtNum,
  makePlane,
  text,
  type Plane,
  type Vec,
} from './plane';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const vec3 = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
export const add3 = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub3 = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const mul3 = (a: Vec3, k: number): Vec3 => ({ x: a.x * k, y: a.y * k, z: a.z * k });
export const dot3 = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross3 = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
export const len3 = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);

/** "(x, y, z)" with short numbers. */
export const fmtVec3 = (p: Vec3, digits = 2): string =>
  `(${fmtNum(p.x, digits)}, ${fmtNum(p.y, digits)}, ${fmtNum(p.z, digits)})`;

/** A 3×3 matrix, row-major: [m00, m01, m02, m10, m11, m12, m20, m21, m22]. */
export type Mat3 = [number, number, number, number, number, number, number, number, number];

export const IDENTITY3: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** a · b, each entry summed left to right. */
export function matMul3(a: Mat3, b: Mat3): Mat3 {
  const out = [] as unknown as Mat3;
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      out[i * 3 + j] = a[i * 3]! * b[j]! + a[i * 3 + 1]! * b[3 + j]! + a[i * 3 + 2]! * b[6 + j]!;
  return out;
}

/** m p for a column vector p. */
export const apply3 = (m: Mat3, p: Vec3): Vec3 => ({
  x: m[0] * p.x + m[1] * p.y + m[2] * p.z,
  y: m[3] * p.x + m[4] * p.y + m[5] * p.z,
  z: m[6] * p.x + m[7] * p.y + m[8] * p.z,
});

export const transpose3 = (m: Mat3): Mat3 => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];

/** Column j of m as a vector: where m sends the j-th basis vector. */
export const column3 = (m: Mat3, j: number): Vec3 => ({ x: m[j]!, y: m[3 + j]!, z: m[6 + j]! });

/** The matrix with columns u, v, w. */
export const fromColumns = (u: Vec3, v: Vec3, w: Vec3): Mat3 => [
  u.x,
  v.x,
  w.x,
  u.y,
  v.y,
  w.y,
  u.z,
  v.z,
  w.z,
];

/** det [u v w] = u · (v × w). */
export const det3 = (m: Mat3): number => dot3(column3(m, 0), cross3(column3(m, 1), column3(m, 2)));

/** The inverse, by cross products (rows v×w, w×u, u×v over det); null when det is 0. */
export function inverse3(m: Mat3): Mat3 | null {
  const u = column3(m, 0);
  const v = column3(m, 1);
  const w = column3(m, 2);
  const d = dot3(u, cross3(v, w));
  if (Math.abs(d) < 1e-9) return null;
  const r = [cross3(v, w), cross3(w, u), cross3(u, v)].map((c) => mul3(c, 1 / d));
  return [r[0]!.x, r[0]!.y, r[0]!.z, r[1]!.x, r[1]!.y, r[1]!.z, r[2]!.x, r[2]!.y, r[2]!.z];
}

export type Axis = 'x' | 'y' | 'z';

/** Rotation by deg degrees about an axis, counter-clockwise looking down the axis at the origin. */
export function rotation3(axis: Axis, deg: number): Mat3 {
  const t = (deg * Math.PI) / 180;
  const c = Math.cos(t);
  const s = Math.sin(t);
  if (axis === 'x') return [1, 0, 0, 0, c, -s, 0, s, c];
  if (axis === 'y') return [c, 0, s, 0, 1, 0, -s, 0, c];
  return [c, -s, 0, s, c, 0, 0, 0, 1];
}

export const scaling3 = (sx: number, sy: number, sz: number): Mat3 => [
  sx,
  0,
  0,
  0,
  sy,
  0,
  0,
  0,
  sz,
];

/** Whether the columns are perpendicular unit vectors (so the inverse is the transpose). */
export function orthonormal3(m: Mat3, eps = 1e-9): boolean {
  const c = [0, 1, 2].map((j) => column3(m, j));
  for (let i = 0; i < 3; i++)
    for (let j = i; j < 3; j++)
      if (Math.abs(dot3(c[i]!, c[j]!) - (i === j ? 1 : 0)) > eps) return false;
  return true;
}

export type Projection = 'isometric' | 'oblique';

const C30 = Math.cos(Math.PI / 6);
const OB = 0.5 * Math.SQRT1_2;

/** A 3D point as a 2D world point (y up), ready for a Plane. */
export function project(p: Vec3, kind: Projection): Vec {
  if (kind === 'oblique') return { x: p.x + OB * p.y, y: p.z + OB * p.y };
  return { x: (p.y - p.x) * C30, y: p.z - (p.x + p.y) / 2 };
}

export interface Space {
  plane: Plane;
  kind: Projection;
  /** 3D point to scene point. */
  at(p: Vec3): Vec;
}

export interface SpaceOptions {
  kind: Projection;
  /** The window fits every point within this distance of the origin. */
  reach: number;
  /** Scene units per world unit. */
  unit: number;
  x?: number;
  y?: number;
}

/**
 * A plane window just big enough for the ball of radius `reach` under the projection. The
 * projection is linear, so the ball's shadow reaches r·|row| along each screen axis.
 */
export function makeSpace(o: SpaceOptions): Space {
  const e = [
    project({ x: 1, y: 0, z: 0 }, o.kind),
    project({ x: 0, y: 1, z: 0 }, o.kind),
    project({ x: 0, y: 0, z: 1 }, o.kind),
  ];
  const hx = o.reach * Math.hypot(e[0]!.x, e[1]!.x, e[2]!.x);
  const hy = o.reach * Math.hypot(e[0]!.y, e[1]!.y, e[2]!.y);
  const plane = makePlane({
    xmin: -hx,
    xmax: hx,
    ymin: -hy,
    ymax: hy,
    unit: o.unit,
    x: o.x,
    y: o.y,
  });
  return { plane, kind: o.kind, at: (p) => plane.at(project(p, o.kind)) };
}

/** Whether a 3D point is inside the ball the window was made for. */
export const inBall = (p: Vec3, r: number) => len3(p) <= r + 1e-9;

export interface Axes3Options {
  id: string;
  /** Axis length on the positive side. */
  reach: number;
  /** Draw a faint grid on the floor z = 0, from −floor to floor. 0 for none. */
  floor?: number;
  /** Names at the positive ends. Default ['x', 'y', 'z']. */
  names?: [string, string, string];
  opacity?: number;
}

/**
 * The world axes through the origin: a faint negative half, an arrow on the positive half and
 * its name, plus an optional floor grid. Ids: `${id}-x`, `${id}-xn` (name), `${id}-x-` (the
 * negative half), likewise for y and z, and floor lines `${id}-fx${k}`, `${id}-fy${k}`.
 */
export function drawAxes3(shapes: Shape[], space: Space, a: Axes3Options): void {
  const pl = space.plane;
  const floor = a.floor ?? 0;
  for (let k = -floor; k <= floor && floor > 0; k++) {
    if (k === 0) continue;
    for (const [key, from, to] of [
      ['fx', { x: k, y: -floor, z: 0 }, { x: k, y: floor, z: 0 }],
      ['fy', { x: -floor, y: k, z: 0 }, { x: floor, y: k, z: 0 }],
    ] as const) {
      drawSegment(shapes, pl, {
        id: `${a.id}-${key}${k}`,
        a: project(from, space.kind),
        b: project(to, space.kind),
        opacity: 0.16,
      });
    }
  }
  const names = a.names ?? ['x', 'y', 'z'];
  const ends: Vec3[] = [
    { x: 1, y: 0, z: 0 },
    { x: 0, y: 1, z: 0 },
    { x: 0, y: 0, z: 1 },
  ];
  (['x', 'y', 'z'] as const).forEach((ax, i) => {
    const e = ends[i]!;
    const neg = mul3(e, -a.reach);
    const pos = mul3(e, a.reach);
    drawSegment(shapes, pl, {
      id: `${a.id}-${ax}-`,
      a: project(neg, space.kind),
      b: project({ x: 0, y: 0, z: 0 }, space.kind),
      opacity: 0.25,
      dashed: true,
    });
    drawVector(shapes, pl, {
      id: `${a.id}-${ax}`,
      from: project({ x: 0, y: 0, z: 0 }, space.kind),
      to: project(pos, space.kind),
      opacity: a.opacity ?? 0.6,
    });
    const tip = space.at(pos);
    const dir = space.at(mul3(e, a.reach + 0.45));
    shapes.push(
      text(`${a.id}-${ax}n`, { x: dir.x + (dir.x - tip.x) * 0.2, y: dir.y + 5 }, names[i]!, {
        size: 14,
        anchor: 'middle',
        bold: true,
      }),
    );
  });
}

export function drawSegment3(
  shapes: Shape[],
  space: Space,
  s: { id: string; a: Vec3; b: Vec3; role?: MarkRole; dashed?: boolean; opacity?: number },
): void {
  drawSegment(shapes, space.plane, {
    ...s,
    a: project(s.a, space.kind),
    b: project(s.b, space.kind),
  });
}

export function drawVector3(
  shapes: Shape[],
  space: Space,
  v: {
    id: string;
    from: Vec3;
    to: Vec3;
    role?: MarkRole;
    dashed?: boolean;
    opacity?: number;
    label?: string;
    size?: number;
  },
): void {
  drawVector(shapes, space.plane, {
    ...v,
    from: project(v.from, space.kind),
    to: project(v.to, space.kind),
  });
}

export function drawPoint3(
  shapes: Shape[],
  space: Space,
  p: {
    id: string;
    at: Vec3;
    r?: number;
    role?: MarkRole;
    label?: string;
    dx?: number;
    dy?: number;
    size?: number;
    opacity?: number;
    anchor?: 'start' | 'middle' | 'end';
  },
): void {
  drawPoint(shapes, space.plane, { ...p, at: project(p.at, space.kind) });
}

/** A 3×3 matrix as rows of short numbers (or its transpose, for row vectors). */
export function mat3Rows(m: Mat3, transpose = false): string[][] {
  const t = transpose ? transpose3(m) : m;
  return [0, 1, 2].map((i) => [0, 1, 2].map((j) => fmtNum(t[i * 3 + j]!)));
}

/** "[a b c; d e f; g h i]" with short numbers. */
export const mat3Text = (m: Mat3, transpose = false): string =>
  `[${mat3Rows(m, transpose)
    .map((r) => r.join(' '))
    .join('; ')}]`;
