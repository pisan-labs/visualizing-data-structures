/**
 * The coordinate plane, shared by the geometry and transform pages (convex hull, polygons,
 * 2D change of coordinates, 2D rotation and scale, and later the other 2D/3D transform pages).
 *
 * A Plane maps world coordinates (y up) to scene units (y down). Everything else here draws
 * onto a plane and appends shapes with ids you choose, so the same value keeps the same shape
 * from step to step and the renderer animates it:
 *
 *   makePlane({ xmin, xmax, ymin, ymax, unit, x, y })   the window onto the world
 *   drawGrid(shapes, plane, { id })                     faint grid, axes with arrows, tick numbers
 *   drawFrameGrid(shapes, plane, { id, origin, u, v })  the grid of another frame (o + a u + b v),
 *                                                       clipped to the window; lines "id-a-k", "id-b-k"
 *   drawPoint(shapes, plane, { id, at, label })         a dot ("id") and its label ("id-l")
 *   drawSegment(shapes, plane, { id, a, b })            a plain line
 *   drawVector(shapes, plane, { id, from, to, label })  an arrow ("id") and its label ("id-l")
 *   drawPolygon(shapes, plane, { id, pts })             edges "id-<key a>-<key b>", keyed by vertex
 *   drawMatrix(shapes, { id, x, y, rows })              a bracketed matrix of text, cells "id-r0c1"
 *
 * Math helpers (add, sub, mul, dot, cross, orient, clipLine) and fmtNum (short numbers, no -0)
 * live here too, so pages agree on how coordinates read.
 *
 * Styling uses what every scene has: roles color circles, text and (active, error) lines;
 * opacity and dashes tell the rest apart (grid lines are faint, the other frame's grid dashed).
 */
import type { MarkRole } from '../engine/types';
import type { Bounds, Shape } from '../render/scene';

export interface Vec {
  x: number;
  y: number;
}

export const vec = (x: number, y: number): Vec => ({ x, y });
export const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
export const mul = (a: Vec, k: number): Vec => ({ x: a.x * k, y: a.y * k });
export const dot = (a: Vec, b: Vec): number => a.x * b.x + a.y * b.y;
/** The z part of a × b: positive when b is counter-clockwise from a. */
export const cross = (a: Vec, b: Vec): number => a.x * b.y - a.y * b.x;
/**
 * Twice the signed area of triangle a, b, c: positive for a left (counter-clockwise) turn at b,
 * negative for a right turn, zero when the three points are collinear.
 */
export const orient = (a: Vec, b: Vec, c: Vec): number =>
  (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
export const len = (a: Vec): number => Math.hypot(a.x, a.y);

/**
 * A number as learners read it: at most `digits` decimals, trailing zeros dropped, never "-0".
 * 0.5000000000000001 reads 0.5 and 6e-17 reads 0.
 */
export function fmtNum(n: number, digits = 2): string {
  const k = 10 ** digits;
  const r = Math.round(n * k) / k;
  if (Object.is(r, -0) || r === 0) return '0';
  return String(Number(r.toFixed(digits)));
}

/** "(x, y)" with short numbers. */
export const fmtVec = (p: Vec, digits = 2): string =>
  `(${fmtNum(p.x, digits)}, ${fmtNum(p.y, digits)})`;

export interface PlaneOptions {
  xmin: number;
  xmax: number;
  ymin: number;
  ymax: number;
  /** Scene units per world unit. */
  unit: number;
  /** Where the window's top-left corner goes in the scene. Default (40, 20). */
  x?: number;
  y?: number;
}

export interface Plane {
  readonly o: Required<PlaneOptions>;
  /** World point to scene point. */
  at(p: Vec): Vec;
  /** The window in scene units. */
  rect: Bounds;
  /** Whether a world point is inside the window (with a small tolerance). */
  contains(p: Vec, margin?: number): boolean;
}

export function makePlane(opts: PlaneOptions): Plane {
  const o: Required<PlaneOptions> = { x: 40, y: 20, ...opts };
  const at = (p: Vec): Vec => ({
    x: o.x + (p.x - o.xmin) * o.unit,
    y: o.y + (o.ymax - p.y) * o.unit,
  });
  return {
    o,
    at,
    rect: { x: o.x, y: o.y, w: (o.xmax - o.xmin) * o.unit, h: (o.ymax - o.ymin) * o.unit },
    contains: (p, margin = 1e-9) =>
      p.x >= o.xmin - margin &&
      p.x <= o.xmax + margin &&
      p.y >= o.ymin - margin &&
      p.y <= o.ymax + margin,
  };
}

/**
 * Clip the line p + t d (t from tmin to tmax, infinite by default) to the world box.
 * Returns the two end points, or null when it misses the box.
 */
export function clipLine(
  p: Vec,
  d: Vec,
  box: { xmin: number; xmax: number; ymin: number; ymax: number },
  tmin = -Infinity,
  tmax = Infinity,
): [Vec, Vec] | null {
  let t0 = tmin;
  let t1 = tmax;
  const edges: [number, number][] = [
    [-d.x, p.x - box.xmin],
    [d.x, box.xmax - p.x],
    [-d.y, p.y - box.ymin],
    [d.y, box.ymax - p.y],
  ];
  for (const [q, r] of edges) {
    if (Math.abs(q) < 1e-12) {
      if (r < 0) return null;
      continue;
    }
    const t = r / q;
    if (q < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return null;
  }
  if (!Number.isFinite(t0) || !Number.isFinite(t1) || t1 - t0 < 1e-9) return null;
  return [add(p, mul(d, t0)), add(p, mul(d, t1))];
}

export interface GridOptions {
  id: string;
  /** Distance between grid lines, in world units. Default 1. */
  step?: number;
  /** Number every this many units along the axes (0 for none). Default 2. */
  labelEvery?: number;
  /** Names at the positive ends of the axes. Default ['x', 'y']. */
  names?: [string, string];
  /** Opacity of the grid lines. Default 0.22. */
  opacity?: number;
  role?: MarkRole;
}

/** The world grid: faint lines, the two axes through the origin (when in view), tick numbers. */
export function drawGrid(shapes: Shape[], plane: Plane, g: GridOptions): void {
  const { xmin, xmax, ymin, ymax } = plane.o;
  const step = g.step ?? 1;
  const every = g.labelEvery ?? 2;
  const opacity = g.opacity ?? 0.22;
  const [nx, ny] = g.names ?? ['x', 'y'];
  for (let k = Math.ceil(xmin / step); k * step <= xmax + 1e-9; k++) {
    const x = k * step;
    if (Math.abs(x) < 1e-9 && ymin <= 0 && ymax >= 0) continue;
    const a = plane.at({ x, y: ymin });
    const b = plane.at({ x, y: ymax });
    shapes.push(line(`${g.id}-v${k}`, a, b, { opacity, role: g.role }));
  }
  for (let k = Math.ceil(ymin / step); k * step <= ymax + 1e-9; k++) {
    const y = k * step;
    if (Math.abs(y) < 1e-9 && xmin <= 0 && xmax >= 0) continue;
    const a = plane.at({ x: xmin, y });
    const b = plane.at({ x: xmax, y });
    shapes.push(line(`${g.id}-h${k}`, a, b, { opacity, role: g.role }));
  }
  // Axes, when the origin's lines are in view; otherwise the window's lower and left edges.
  const ax = ymin <= 0 && ymax >= 0 ? 0 : ymin;
  const ay = xmin <= 0 && xmax >= 0 ? 0 : xmin;
  const x1 = plane.at({ x: xmin, y: ax });
  const x2 = plane.at({ x: xmax, y: ax });
  const y1 = plane.at({ x: ay, y: ymin });
  const y2 = plane.at({ x: ay, y: ymax });
  shapes.push({ kind: 'arrow', id: `${g.id}-x`, ...ends(x1, x2), opacity: 0.6, role: g.role });
  shapes.push({ kind: 'arrow', id: `${g.id}-y`, ...ends(y1, y2), opacity: 0.6, role: g.role });
  shapes.push(text(`${g.id}-xn`, { x: x2.x - 4, y: x2.y - 8 }, nx, { anchor: 'end', size: 14 }));
  shapes.push(text(`${g.id}-yn`, { x: y2.x + 9, y: y2.y + 13 }, ny, { size: 14 }));
  if (every > 0) {
    for (let k = Math.ceil(xmin / every); k * every <= xmax - every / 2; k++) {
      const x = k * every;
      if (x === ay) continue;
      const p = plane.at({ x, y: ax });
      shapes.push(
        text(`${g.id}-tx${k}`, { x: p.x, y: p.y + 15 }, fmtNum(x), {
          anchor: 'middle',
          size: 14,
        }),
      );
    }
    for (let k = Math.ceil(ymin / every); k * every <= ymax - every / 2; k++) {
      const y = k * every;
      if (y === ax) continue;
      const p = plane.at({ x: ay, y });
      shapes.push(
        text(`${g.id}-ty${k}`, { x: p.x - 5, y: p.y + 4 }, fmtNum(y), {
          anchor: 'end',
          size: 14,
        }),
      );
    }
    const o = plane.at({ x: ay, y: ax });
    shapes.push(
      text(`${g.id}-t0`, { x: o.x - 5, y: o.y + 15 }, ay === 0 && ax === 0 ? '0' : '', {
        anchor: 'end',
        size: 14,
      }),
    );
  }
}

export interface FrameGridOptions {
  id: string;
  origin: Vec;
  /** The frame's axes in world coordinates. */
  u: Vec;
  v: Vec;
  /** Default 0.45. */
  opacity?: number;
  /** Default true. */
  dashed?: boolean;
  /** At most this many lines each way from the origin. Default 24. */
  reach?: number;
}

/**
 * The grid of a second frame: the lines o + k u + t v and o + t u + k v for whole k, clipped
 * to the window. Line ids are `${id}-a${k}` (constant first coordinate) and `${id}-b${k}`, so
 * moving or turning the frame slides its lines. A degenerate frame (u, v parallel) draws none.
 */
export function drawFrameGrid(shapes: Shape[], plane: Plane, g: FrameGridOptions): void {
  const det = cross(g.u, g.v);
  if (Math.abs(det) < 1e-9) return;
  const reach = g.reach ?? 24;
  const opacity = g.opacity ?? 0.45;
  const dashed = g.dashed ?? true;
  for (const [axis, along, across] of [
    ['a', g.u, g.v],
    ['b', g.v, g.u],
  ] as const) {
    for (let k = -reach; k <= reach; k++) {
      if (k === 0) continue;
      const seg = clipLine(add(g.origin, mul(along, k)), across, plane.o);
      if (!seg) continue;
      shapes.push(
        line(`${g.id}-${axis}${k}`, plane.at(seg[0]), plane.at(seg[1]), { opacity, dashed }),
      );
    }
  }
}

export interface PointOptions {
  id: string;
  at: Vec;
  /** Radius in scene units. Default 6. */
  r?: number;
  role?: MarkRole;
  cls?: string;
  label?: string;
  /** Label offset in scene units from the dot. Default (9, -9). */
  dx?: number;
  dy?: number;
  labelRole?: MarkRole;
  size?: number;
  anchor?: 'start' | 'middle' | 'end';
  opacity?: number;
  z?: number;
}

/** A dot with an optional label. Ids: `id` (the circle) and `${id}-l` (the label). */
export function drawPoint(shapes: Shape[], plane: Plane, p: PointOptions): void {
  const c = plane.at(p.at);
  shapes.push({
    kind: 'circle',
    id: p.id,
    x: c.x,
    y: c.y,
    r: p.r ?? 6,
    role: p.role,
    cls: p.cls ?? 'live',
    opacity: p.opacity,
    z: p.z,
  });
  if (p.label !== undefined) {
    shapes.push(
      text(`${p.id}-l`, { x: c.x + (p.dx ?? 9), y: c.y + (p.dy ?? -9) }, p.label, {
        size: p.size ?? 13,
        role: p.labelRole ?? p.role,
        anchor: p.anchor,
        opacity: p.opacity,
        bold: true,
      }),
    );
  }
}

export interface SegmentOptions {
  id: string;
  a: Vec;
  b: Vec;
  role?: MarkRole;
  dashed?: boolean;
  opacity?: number;
  head?: 'end' | 'none' | 'both';
  z?: number;
}

/** A line between two world points (no arrowhead unless asked). */
export function drawSegment(shapes: Shape[], plane: Plane, s: SegmentOptions): void {
  shapes.push({
    kind: 'arrow',
    id: s.id,
    ...ends(plane.at(s.a), plane.at(s.b)),
    head: s.head ?? 'none',
    role: s.role,
    dashed: s.dashed,
    opacity: s.opacity,
    z: s.z,
  });
}

export interface VectorOptions {
  id: string;
  from: Vec;
  to: Vec;
  role?: MarkRole;
  dashed?: boolean;
  opacity?: number;
  label?: string;
  /** Label offset from the tip, in scene units. Default: a little beyond the tip. */
  dx?: number;
  dy?: number;
  size?: number;
}

/** An arrow from one world point to another, with an optional label past its tip. */
export function drawVector(shapes: Shape[], plane: Plane, v: VectorOptions): void {
  const a = plane.at(v.from);
  const b = plane.at(v.to);
  const zero = Math.hypot(b.x - a.x, b.y - a.y) < 1;
  shapes.push({
    kind: 'arrow',
    id: v.id,
    ...ends(a, b),
    head: zero ? 'none' : 'end',
    role: v.role,
    dashed: v.dashed,
    opacity: v.opacity,
  });
  if (v.label !== undefined) {
    const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const dx = v.dx ?? ((b.x - a.x) / d) * 14;
    const dy = v.dy ?? ((b.y - a.y) / d) * 14 + 5;
    shapes.push(
      text(`${v.id}-l`, { x: b.x + dx, y: b.y + dy }, v.label, {
        size: v.size ?? 14,
        anchor: 'middle',
        role: v.role,
        bold: true,
        opacity: v.opacity,
      }),
    );
  }
}

export interface PolygonOptions {
  id: string;
  /** Vertices in order, each with a stable key (a uid or a name). */
  pts: { key: string | number; at: Vec }[];
  /** Join the last vertex back to the first. Default true. */
  closed?: boolean;
  role?: MarkRole;
  /** Roles for single edges, by edge id. */
  roles?: ReadonlyMap<string, MarkRole>;
  dashed?: boolean;
  opacity?: number;
  z?: number;
  /** Tint the inside: true for the default tint, or a role for its color. Id `${id}-fill`. */
  fill?: boolean | MarkRole;
}

/** Edge id of the edge from vertex key a to vertex key b. */
export const edgeKey = (id: string, a: string | number, b: string | number) => `${id}-${a}-${b}`;

/** A polygon (or polyline) as lines between consecutive vertices. Returns the edge ids. */
export function drawPolygon(shapes: Shape[], plane: Plane, g: PolygonOptions): string[] {
  const n = g.pts.length;
  const closed = g.closed ?? true;
  const ids: string[] = [];
  const count = closed && n > 2 ? n : n - 1;
  if (g.fill && closed && n > 2)
    shapes.push({
      kind: 'polygon',
      id: `${g.id}-fill`,
      points: g.pts.map((p) => plane.at(p.at)),
      role: g.fill === true ? undefined : g.fill,
      opacity: g.opacity,
    });
  for (let i = 0; i < count; i++) {
    const a = g.pts[i]!;
    const b = g.pts[(i + 1) % n]!;
    const id = edgeKey(g.id, a.key, b.key);
    if (ids.includes(id)) continue;
    ids.push(id);
    drawSegment(shapes, plane, {
      id,
      a: a.at,
      b: b.at,
      role: g.roles?.get(id) ?? g.role,
      dashed: g.dashed,
      opacity: g.opacity,
      z: g.z,
    });
  }
  return ids;
}

export interface MatrixOptions {
  id: string;
  /** Top-left corner in scene units. */
  x: number;
  y: number;
  rows: string[][];
  /** Written before the bracket, such as "R =". */
  name?: string;
  /** Roles for single cells, by [row, column] key "r0c1". */
  roles?: ReadonlyMap<string, MarkRole>;
  role?: MarkRole;
  size?: number;
}

/**
 * A matrix of text with brackets drawn as lines. Cell ids are `${id}-r${i}c${j}`, the name
 * `${id}-name`, the brackets `${id}-lb*` and `${id}-rb*`. Returns its bounds.
 */
export function drawMatrix(shapes: Shape[], m: MatrixOptions): Bounds {
  const size = m.size ?? 14;
  const rowH = size + 8;
  const cols = Math.max(0, ...m.rows.map((r) => r.length));
  const colW = Array.from({ length: cols }, (_, j) =>
    Math.max(24, ...m.rows.map((r) => textW(r[j] ?? '', size))),
  );
  let x = m.x;
  if (m.name) {
    const h = m.rows.length * rowH;
    shapes.push(
      text(`${m.id}-name`, { x, y: m.y + h / 2 + size / 2 - 2 }, m.name, {
        size,
        role: m.role,
        mono: true,
      }),
    );
    x += textW(m.name, size) + 8;
  }
  const h = m.rows.length * rowH + 4;
  const top = m.y;
  const bottom = m.y + h;
  const bracket = (key: string, bx: number, dir: 1 | -1) => {
    shapes.push({
      kind: 'arrow',
      id: `${m.id}-${key}`,
      x1: bx,
      y1: top,
      x2: bx,
      y2: bottom,
      head: 'none',
      role: m.role,
    });
    shapes.push({
      kind: 'arrow',
      id: `${m.id}-${key}t`,
      x1: bx,
      y1: top,
      x2: bx + 6 * dir,
      y2: top,
      head: 'none',
      role: m.role,
    });
    shapes.push({
      kind: 'arrow',
      id: `${m.id}-${key}b`,
      x1: bx,
      y1: bottom,
      x2: bx + 6 * dir,
      y2: bottom,
      head: 'none',
      role: m.role,
    });
  };
  bracket('lb', x, 1);
  let cx = x + 10;
  for (let j = 0; j < cols; j++) {
    m.rows.forEach((r, i) => {
      const key = `r${i}c${j}`;
      shapes.push(
        text(`${m.id}-${key}`, { x: cx + colW[j]!, y: top + 2 + (i + 1) * rowH - 6 }, r[j] ?? '', {
          size,
          anchor: 'end',
          mono: true,
          role: m.roles?.get(key) ?? m.role,
        }),
      );
    });
    cx += colW[j]! + 14;
  }
  const right = cx - 4;
  bracket('rb', right, -1);
  return { x: m.x, y: m.y, w: right - m.x + 2, h };
}

/** Estimated width of text in scene units (monospace digits). */
export const textW = (s: string, size: number) => s.length * size * 0.62;

function ends(a: Vec, b: Vec) {
  return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
}

function line(
  id: string,
  a: Vec,
  b: Vec,
  o: { opacity?: number; dashed?: boolean; role?: MarkRole },
): Shape {
  return { kind: 'arrow', id, ...ends(a, b), head: 'none', ...o };
}

/** A text shape in scene units. */
export function text(
  id: string,
  at: Vec,
  s: string,
  o: {
    size?: number;
    anchor?: 'start' | 'middle' | 'end';
    role?: MarkRole;
    bold?: boolean;
    mono?: boolean;
    opacity?: number;
    cls?: string;
  } = {},
): Shape {
  return {
    kind: 'text',
    id,
    x: at.x,
    y: at.y,
    text: s,
    size: o.size ?? 13,
    anchor: o.anchor,
    weight: o.bold ? 'bold' : undefined,
    mono: o.mono,
    role: o.role,
    opacity: o.opacity,
    cls: o.cls ?? (o.role ? undefined : 'label'),
  };
}

/**
 * Read a list of points such as "1,2 3,4" or "(1, 2) (3, 4)". Whole numbers in [min, max].
 * Returns the points or a message a learner can act on.
 */
export function readPoints(text: string, min: number, max: number, most = 20): Vec[] | string {
  const t = text.trim();
  if (!t) return 'Type points such as 1,2 3,4.';
  const found = [...t.matchAll(/\(?\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)?/g)];
  const rest = t.replace(/\(?\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)?/g, '').trim();
  if (rest.replace(/[\s;]+/g, '') !== '' || found.length === 0)
    return 'Write each point as x,y and separate points with spaces, such as 1,2 3,4.';
  const pts = found.map((m) => ({ x: Number(m[1]), y: Number(m[2]) }));
  if (pts.some((p) => !Number.isInteger(p.x) || !Number.isInteger(p.y)))
    return 'Use whole-number coordinates, such as 3,4.';
  if (pts.some((p) => p.x < min || p.x > max || p.y < min || p.y > max))
    return `Keep coordinates from ${min} to ${max}.`;
  if (pts.length > most) return `At most ${most} points.`;
  return pts;
}

/** Points back to the canonical text "1,2 3,4". */
export const writePoints = (pts: Vec[]) => pts.map((p) => `${p.x},${p.y}`).join(' ');
