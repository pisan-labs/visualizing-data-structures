/**
 * Arrows between circles that keep clear of what is in their way: the geometry under the state
 * diagrams (src/layouts/automaton.ts) and the regex-to-NFA picture. Everything is in scene
 * units; an arrow is a line, or a quadratic curve through a control point `via`.
 *
 *   curvePoint(seg, t), curveTangent(seg, t), curveSamples(seg, n)   points along an arrow
 *   clipArrow(P, Q, via, r)     the arrow between two circles' centers, cut at their edges
 *   loopArrow(P, d, r)          a loop on a circle, on the side d points to
 *   routeArrow(P, Q, o)         the control point that takes an arrow clear of obstacles
 *                               (none when the straight line is clear and o.force is unset)
 *   loopRoute(P, obstacles, r)  a loop on the side with the most room
 */

export interface Pt {
  x: number;
  y: number;
}

/** One piece of an arrow: a line from a to b, or a quadratic curve through via. */
export interface Seg {
  a: Pt;
  b: Pt;
  via?: Pt;
}

/** Something an arrow keeps clear of: a circle around a point. */
export interface Obstacle {
  x: number;
  y: number;
  r: number;
}

export type Hint = 'up' | 'down' | 'auto';

export const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
export const mul = (a: Pt, k: number): Pt => ({ x: a.x * k, y: a.y * k });
export const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);
export const unit = (v: Pt): Pt => {
  const l = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / l, y: v.y / l };
};
const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** The point at t (0 to 1) along the arrow. */
export function curvePoint(s: Seg, t: number): Pt {
  if (!s.via) return add(s.a, mul(sub(s.b, s.a), t));
  const u = 1 - t;
  return {
    x: u * u * s.a.x + 2 * u * t * s.via.x + t * t * s.b.x,
    y: u * u * s.a.y + 2 * u * t * s.via.y + t * t * s.b.y,
  };
}

/** The arrow's direction at t, as a unit vector. */
export function curveTangent(s: Seg, t: number): Pt {
  if (!s.via) return unit(sub(s.b, s.a));
  return unit(add(mul(sub(s.via, s.a), 2 * (1 - t)), mul(sub(s.b, s.via), 2 * t)));
}

/** The arrow's length, roughly (the control polygon's, for a curve). */
export const curveLength = (s: Seg): number =>
  s.via ? dist(s.a, s.via) + dist(s.via, s.b) : dist(s.a, s.b);

/** n + 1 points along the arrow, from a to b. */
export function curveSamples(s: Seg, n = 24): Pt[] {
  return Array.from({ length: n + 1 }, (_, i) => curvePoint(s, i / n));
}

/** Enough points along an arrow that none is more than about 8 units from the next. */
const density = (s: Seg) => Math.min(240, Math.max(16, Math.ceil(curveLength(s) / 8)));

/**
 * How much room an arrow leaves the obstacles: the least distance past an obstacle's radius
 * (negative when it cuts into one). Points within `skip` of either end are left out. Stops
 * early below `enough`.
 */
function room(s: Seg, obstacles: Obstacle[], skip: number, enough = -Infinity): number {
  const n = density(s);
  let least = Infinity;
  for (let i = 1; i < n; i++) {
    const p = curvePoint(s, i / n);
    if (dist(p, s.a) < skip || dist(p, s.b) < skip) continue;
    for (const o of obstacles) {
      if (Math.abs(p.x - o.x) >= o.r + 40 || Math.abs(p.y - o.y) >= o.r + 40) continue;
      least = Math.min(least, dist(p, o) - o.r);
      if (least < enough) return least;
    }
  }
  return least;
}

/** Does the arrow between two circles' centers keep clear of the obstacles? */
export const isClear = (s: Seg, obstacles: Obstacle[], r = 22): boolean =>
  room(s, obstacles, r + 2, 0) >= 0;

export interface RouteOptions {
  /** States and anything else the arrow must not cross. */
  obstacles: Obstacle[];
  /** Labels and the like: kept clear when a curve can clear them too, crossed when not. */
  soft?: Obstacle[];
  /** Points on curves already drawn: avoided when possible, crossed when not. */
  curves?: Obstacle[];
  /** Which side to bulge to: above or below the line from P to Q (as drawn), or either. */
  hint?: Hint;
  /** Curve even when the straight line is clear (an arrow that repeats or skips a part). */
  force?: boolean;
  /** The radius of the circles the arrow joins. */
  r?: number;
}

/**
 * The control point for an arrow from P to Q (circles' centers), or none for a straight one:
 * the least bulge that clears the obstacles, on the hinted side or the side that needs less.
 * Obstacles at P or Q are ignored. It tries to clear everything, then the obstacles and the
 * soft ones (bulging the other way too, if need be), then the obstacles alone. When
 * nothing clears the obstacles, the curve with the most room from them, also trying lopsided
 * ones that come down onto a circle from one side.
 */
export function routeArrow(P: Pt, Q: Pt, o: RouteOptions): Pt | undefined {
  const r = o.r ?? 22;
  const hint = o.hint ?? 'auto';
  const force = o.force ?? false;
  const away = (x: Obstacle) => dist(x, P) > 1 && dist(x, Q) > 1;
  const hard = o.obstacles.filter(away);
  const others = [...hard, ...(o.soft ?? []).filter(away)];
  // Judge the arrow as drawn: cut at the circles' edges, which bends a curve a little.
  const fits = (via: Pt | undefined, obs: Obstacle[]) =>
    room(clipArrow(P, Q, via, r), obs, 0, 0) >= 0;
  if (!force && fits(undefined, others)) return undefined;
  const d = dist(P, Q);
  const n0 = unit({ x: -(Q.y - P.y), y: Q.x - P.x });
  const m = mid(P, Q);
  const upSide = n0.y < 0 || (n0.y === 0 && n0.x < 0) ? 1 : -1;
  const sides = hint === 'auto' ? [-upSide, upSide] : [hint === 'up' ? upSide : -upSide];
  const c0 = force ? Math.max(30, 0.3 * d) : 0.2 * d;
  const cmax = 2.5 * d + 260;
  const find = (side: number, obs: Obstacle[]) => {
    const n = mul(n0, side);
    for (let c = c0; c <= cmax; c += 6) {
      const via = add(m, mul(n, c));
      if (fits(via, obs)) return { via, c };
    }
    return null;
  };
  // Clearing the obstacles comes before the hint: the last pass may bulge the other way.
  const both = [sides[0]!, -sides[0]!];
  const passes: [Obstacle[], number[]][] = [
    [[...others, ...(o.curves ?? [])], sides],
    [others, sides],
    [others, both],
    [hard, sides],
    [hard, both],
  ];
  for (const [obs, ss] of passes) {
    const found = ss.map((s) => find(s, obs)).filter((f) => f !== null);
    if (found.length) return found.reduce((b, f) => (f.c < b.c - 18 ? f : b)).via;
  }
  let best = { via: add(m, mul(n0, sides[0]! * Math.max(c0, 0.45 * d))), room: -Infinity };
  for (const side of both)
    for (const t of [0.5, 0.3, 0.7, 0.15, 0.85])
      for (let c = c0; c <= cmax; c += 12) {
        const via = add(add(P, mul(sub(Q, P), t)), mul(n0, side * c));
        const rm = room(clipArrow(P, Q, via, r), hard, 0, best.room);
        if (rm > best.room + 0.5) best = { via, room: rm };
      }
  return best.via;
}

/** The arrow between two circles' centers (radius r), cut at the circles' edges. */
export function clipArrow(P: Pt, Q: Pt, via?: Pt, r = 22): Seg {
  const a = add(P, mul(unit(sub(via ?? Q, P)), r));
  const b = add(Q, mul(unit(sub(via ?? P, Q)), r + 1));
  return via ? { a, b, via } : { a, b };
}

/** A loop on the circle at P (radius r), on the side the unit vector d points to. */
export function loopArrow(P: Pt, d: Pt, r = 22): Seg {
  const n = { x: -d.y, y: d.x };
  const s = add(add(P, mul(d, r * 0.8)), mul(n, -r * 0.6));
  const e = add(add(P, mul(d, r * 0.8)), mul(n, r * 0.6));
  return {
    a: add(P, mul(unit(sub(s, P)), r)),
    b: add(P, mul(unit(sub(e, P)), r + 1)),
    via: add(P, mul(d, r * 3.3)),
  };
}

export const SIDES4: Pt[] = [
  { x: 0, y: -1 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 1, y: 0 },
];

/**
 * A loop on the circle at P, on the side (of up, down, left, right) with the most room for the
 * loop and a label just past it. Returns the loop and the side.
 */
export function loopRoute(P: Pt, obstacles: Obstacle[], r = 22): { seg: Seg; dir: Pt } {
  const others = obstacles.filter((o) => dist(o, P) > 1);
  const roomOf = (d: Pt) =>
    Math.min(
      400,
      ...[...curveSamples(loopArrow(P, d, r), 8), add(P, mul(d, r * 2.2 + 12))].flatMap((q) =>
        others.map((o) => dist(q, o) - o.r),
      ),
    );
  const dir = SIDES4.reduce((best, d) => (roomOf(d) > roomOf(best) + 4 ? d : best));
  return { seg: loopArrow(P, dir, r), dir };
}
