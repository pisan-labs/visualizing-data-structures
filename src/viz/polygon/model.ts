import type { Rng } from '../../engine/rng';
import type { Mark, OpSpec, PseudoBlock, Scalar, Step, Value } from '../../engine/types';
import { fmtNum, orient, readPoints, type Vec } from '../../layouts/plane';

/** Coordinates are whole numbers in [0, MAX]. */
export const MAX = 12;
export const MOST = 16;

export type Where = 'inside' | 'outside' | 'boundary';

export type PolyResult =
  | { kind: 'area'; sum: number }
  | { kind: 'orient'; turn: number }
  | { kind: 'convex'; convex: boolean; why: string }
  | { kind: 'inside'; where: Where; count: number };

export interface PolyState {
  verts: Vec[];
  /** Whether no two edges cross (checked when the polygon is loaded). */
  simple: boolean;
  /** The query point of the last inside test. */
  query: Vec | null;
  result: PolyResult | null;
  /** Edges or vertices examined by the last operation. */
  tests: number;
}

export interface PolySettings {
  [key: string]: Scalar;
  /** ray: even-odd rule by ray casting. winding: nonzero winding number. */
  inside: 'ray' | 'winding';
}

export interface PolyExtra {
  /** Shoelace: the edge i → i+1 being added (its triangle with the origin is drawn). */
  edge?: number;
  /** Running shoelace sum. */
  sum?: number;
  /** A vertex being tested (convexity, orientation). */
  vertex?: number;
  /** Ray casting: crossings found so far, as x positions on the ray, with their edge. */
  hits?: { edge: number; x: number; up: boolean }[];
}

type S = PolyState;
type X = PolyExtra;
type Op = OpSpec<S, PolySettings, X>;
type PStep = Step<S, X>;

export const defaults: PolySettings = { inside: 'ray' };

export const SQUARE: Vec[] = [
  { x: 2, y: 2 },
  { x: 10, y: 2 },
  { x: 10, y: 9 },
  { x: 2, y: 9 },
];

export function init(): S {
  return { verts: SQUARE, simple: true, query: null, result: null, tests: 0 };
}

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });
export const vId = (i: number) => `v-${i}`;
export const eId = (s: S, i: number) => `e-${i}-${(i + 1) % s.verts.length}`;
export const nameOf = (i: number) => String.fromCharCode(65 + i);
const at = (p: Vec, i: number) => `${nameOf(i)}(${p.x}, ${p.y})`;
const p = (n: number) => (n < 0 ? `(${n})` : String(n));

/** Half of |sum|, written as a whole number or with .5. */
export const half = (sum: number) => fmtNum(Math.abs(sum) / 2, 1);

function vars(s: S, more: Record<string, Scalar> = {}): Record<string, Scalar> {
  return { n: s.verts.length, ...more, tests: s.tests };
}

/** Do segments ab and cd cross or touch? */
export function segmentsMeet(a: Vec, b: Vec, c: Vec, d: Vec): boolean {
  const d1 = orient(a, b, c);
  const d2 = orient(a, b, d);
  const d3 = orient(c, d, a);
  const d4 = orient(c, d, b);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0)))
    return true;
  const on = (p0: Vec, q0: Vec, r: Vec) =>
    orient(p0, q0, r) === 0 &&
    Math.min(p0.x, q0.x) <= r.x &&
    r.x <= Math.max(p0.x, q0.x) &&
    Math.min(p0.y, q0.y) <= r.y &&
    r.y <= Math.max(p0.y, q0.y);
  return on(a, b, c) || on(a, b, d) || on(c, d, a) || on(c, d, b);
}

/** Whether no two edges meet except neighbours at their shared vertex. */
export function isSimple(v: Vec[]): boolean {
  const n = v.length;
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      const adjacent = j === i + 1 || (i === 0 && j === n - 1);
      if (adjacent) {
        // Neighbours share a vertex; they must not fold back over each other.
        const [a, b, c] = j === i + 1 ? [v[i]!, v[j]!, v[(j + 1) % n]!] : [v[j]!, v[0]!, v[1]!];
        const backtrack =
          orient(a, b, c) === 0 && (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y) < 0;
        if (backtrack) return false;
        continue;
      }
      if (segmentsMeet(v[i]!, v[(i + 1) % n]!, v[j]!, v[(j + 1) % n]!)) return false;
    }
  return true;
}

/** A random star-shaped (so simple) polygon with about n vertices, counter-clockwise. */
export function randomPolygon(rng: Rng, n: number): Vec[] {
  const c = { x: 6.13, y: 6.07 };
  const out = new Map<string, { p: Vec; a: number }>();
  for (let k = 0; k < n; k++) {
    const a = ((k + rng.int(1, 8) / 10) / n) * 2 * Math.PI;
    const r = rng.int(20, 55) / 10;
    const pt = { x: Math.round(c.x + r * Math.cos(a)), y: Math.round(c.y + r * Math.sin(a)) };
    const angle = Math.atan2(pt.y - c.y, pt.x - c.x);
    out.set(`${pt.x},${pt.y}`, { p: pt, a: angle });
  }
  const pts = [...out.values()].sort((u, w) => u.a - w.a).map((e) => e.p);
  // Rounding can line points up; drop any vertex that sits on the line of its neighbours.
  const kept = pts.filter(
    (q, i) => orient(pts[(i - 1 + pts.length) % pts.length]!, q, pts[(i + 1) % pts.length]!) !== 0,
  );
  return kept.length >= 3 && isSimple(kept) ? kept : SQUARE;
}

function readArg(v: Value | undefined, rng: Rng): Vec[] | string {
  if (typeof v === 'number' || (typeof v === 'string' && /^\s*\d+\s*$/.test(v))) {
    const n = Number(v);
    if (!Number.isInteger(n) || n < 3 || n > 12)
      return `${n} is not a polygon. Type its vertices in order, such as 1,1 5,1 3,4, or a count from 3 to 12 for a random polygon.`;
    return randomPolygon(rng, n);
  }
  if (typeof v !== 'string') return 'Type the vertices in order, such as 1,1 5,1 3,4.';
  const pts = readPoints(v, 0, MAX, MOST);
  if (typeof pts === 'string') return pts;
  if (pts.length < 3) return 'A polygon needs at least 3 vertices.';
  const rep = pts.findIndex((q, i) => {
    const r = pts[(i + 1) % pts.length]!;
    return q.x === r.x && q.y === r.y;
  });
  if (rep >= 0) return `Vertex ${rep + 1} repeats the next one. Leave out the repeat.`;
  return pts;
}

const load: Op = {
  label: 'Load polygon',
  arity: 1,
  *run(s, [v], { rng }) {
    const pts = readArg(v, rng);
    if (typeof pts === 'string') {
      yield { state: s, marks: [], say: `load: ${pts}`, lines: [], vars: vars(s), level: 1 };
      return s;
    }
    const simple = isSimple(pts);
    const end: S = { verts: pts, simple, query: null, result: null, tests: 0 };
    yield {
      state: end,
      marks: pts.map((_, i) => mark(vId(i), 'new')),
      say: `A polygon with ${pts.length} vertices: ${pts.map(at).join(', ')}.${simple ? '' : ' Some of its edges cross, so it is not a simple polygon. Area and inside tests mean less for it, and the two inside rules can disagree.'}`,
      lines: [],
      vars: vars(end),
      level: 1,
    } satisfies PStep;
    return end;
  },
};

const fresh = (s: S): S => ({ ...s, query: null, result: null, tests: 0 });

const area: Op = {
  label: 'Area',
  arity: 0,
  *run(s0) {
    let s = fresh(s0);
    const v = s.verts;
    let sum = 0;
    yield {
      state: s,
      marks: [],
      say: `Shoelace formula: walk around the polygon and add x_i·y_(i+1) − x_(i+1)·y_i for every edge. Each term is twice the signed area of the triangle the edge makes with the origin.`,
      lines: ['area.init'],
      vars: vars(s, { sum }),
      level: 2,
      extra: { sum },
    } satisfies PStep;
    for (let i = 0; i < v.length; i++) {
      const a = v[i]!;
      const b = v[(i + 1) % v.length]!;
      const term = a.x * b.y - b.x * a.y;
      sum += term;
      s = { ...s, tests: s.tests + 1 };
      yield {
        state: s,
        marks: [mark(eId(s, i), 'active'), mark('tri', term >= 0 ? 'new' : 'error')],
        say: `Edge ${nameOf(i)} → ${nameOf((i + 1) % v.length)}: ${p(a.x)}·${p(b.y)} − ${p(b.x)}·${p(a.y)} = ${term}. ${term > 0 ? 'The origin sees this edge go counter-clockwise, so its triangle counts plus.' : term < 0 ? 'The origin sees this edge go clockwise, so its triangle counts minus.' : 'The edge points at the origin, so its triangle is flat.'} Sum = ${sum}.`,
        lines: ['area.loop', 'area.term'],
        vars: vars(s, { term, sum }),
        level: 2,
        extra: { edge: i, sum },
      } satisfies PStep;
    }
    s = { ...s, result: { kind: 'area', sum } };
    yield {
      state: s,
      marks: v.map((_, i) => mark(eId(s, i), sum >= 0 ? 'active' : 'error')),
      say: `Area = |${sum}| / 2 = ${half(sum)}. The triangles outside the polygon cancel out. The sign tells the direction: ${sum > 0 ? 'positive, so the vertices go counter-clockwise' : sum < 0 ? 'negative, so the vertices go clockwise' : 'zero, so the polygon is flat'}.${s.simple ? '' : ' This polygon is not simple, so the parts it wraps twice count twice.'}`,
      lines: ['area.ret'],
      vars: vars(s, { sum, area: Math.abs(sum) / 2 }),
      level: 1,
      extra: { sum },
    } satisfies PStep;
    return s;
  },
};

const orientation: Op = {
  label: 'Orientation',
  arity: 0,
  *run(s0) {
    let s = fresh(s0);
    const v = s.verts;
    let k = 0;
    v.forEach((q, i) => {
      const m = v[k]!;
      if (q.y < m.y || (q.y === m.y && q.x < m.x)) k = i;
    });
    const n = v.length;
    const a = v[(k - 1 + n) % n]!;
    const b = v[k]!;
    const c = v[(k + 1) % n]!;
    yield {
      state: s,
      marks: [mark(vId(k), 'found')],
      say: `Find the lowest vertex (leftmost if tied): ${at(b, k)}. It is a corner of the convex hull, so the polygon turns the same way there as it does overall.`,
      lines: ['or.low'],
      vars: vars(s),
      level: 2,
      extra: { vertex: k },
    } satisfies PStep;
    const turn = orient(a, b, c);
    s = { ...s, tests: 1, result: { kind: 'orient', turn } };
    const word = turn > 0 ? 'counter-clockwise' : turn < 0 ? 'clockwise' : null;
    yield {
      state: s,
      marks: [
        mark(vId(k), 'found'),
        mark(vId((k - 1 + n) % n), 'active'),
        mark(vId((k + 1) % n), 'active'),
      ],
      say: `TURN(${nameOf((k - 1 + n) % n)}, ${nameOf(k)}, ${nameOf((k + 1) % n)}) = ${turn}. ${word ? `${turn > 0 ? 'A left turn' : 'A right turn'} at the lowest vertex: the polygon goes ${word}.${s.simple ? '' : ' (The polygon is not simple, so "its direction" is not well defined.)'}` : 'The neighbours are on one line through it, so this polygon is degenerate there.'}`,
      lines: ['or.turn', word ? (turn > 0 ? 'or.ccw' : 'or.cw') : 'or.flat'],
      vars: vars(s, { turn, orientation: word ?? 'degenerate' }),
      level: 1,
      extra: { vertex: k },
    } satisfies PStep;
    return s;
  },
};

/** Degrees, rounded for narration. */
const deg = (r: number) => fmtNum((r * 180) / Math.PI, 1);

const convex: Op = {
  label: 'Convex?',
  arity: 0,
  *run(s0) {
    let s = fresh(s0);
    const v = s.verts;
    const n = v.length;
    let sign = 0;
    let total = 0;
    for (let i = 0; i < n; i++) {
      const a = v[(i - 1 + n) % n]!;
      const b = v[i]!;
      const c = v[(i + 1) % n]!;
      const turn = orient(a, b, c);
      const dotp = (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y);
      const ext = Math.atan2(turn, dotp);
      total += ext;
      s = { ...s, tests: s.tests + 1 };
      const kind = turn > 0 ? 'left' : turn < 0 ? 'right' : 'straight';
      const clash = (turn > 0 && sign < 0) || (turn < 0 && sign > 0);
      const spike = turn === 0 && dotp < 0;
      if (clash || spike) {
        const why = spike
          ? `the polygon doubles back on itself at ${nameOf(i)}`
          : `${nameOf(i)} turns ${kind} after earlier turns went the other way, so ${nameOf(i)} is a dent (a reflex vertex)`;
        s = { ...s, result: { kind: 'convex', convex: false, why } };
        yield {
          state: s,
          marks: [mark(vId(i), 'error')],
          say: `TURN(${nameOf((i - 1 + n) % n)}, ${nameOf(i)}, ${nameOf((i + 1) % n)}) = ${turn}: ${kind}. Not convex: ${why}.`,
          lines: ['cv.turn', 'cv.mixed'],
          vars: vars(s, { turn, convex: 'no' }),
          level: 1,
          extra: { vertex: i },
        } satisfies PStep;
        return s;
      }
      if (sign === 0 && turn !== 0) sign = Math.sign(turn);
      yield {
        state: s,
        marks: [mark(vId(i), turn === 0 ? 'compare' : 'active')],
        say: `TURN(${nameOf((i - 1 + n) % n)}, ${nameOf(i)}, ${nameOf((i + 1) % n)}) = ${turn}: ${turn === 0 ? 'no turn (a straight vertex, which does not decide anything)' : `a ${kind} turn of ${deg(Math.abs(ext))}°`}. ${turn !== 0 ? `Every turn so far is ${sign > 0 ? 'left' : 'right'}.` : ''}`.trim(),
        lines: ['cv.loop', 'cv.turn'],
        vars: vars(s, { turn, 'total turning': `${deg(total)}°` }),
        level: 2,
        extra: { vertex: i },
      } satisfies PStep;
    }
    const laps = Math.round(Math.abs(total) / (2 * Math.PI));
    const ok = laps === 1;
    const why = ok
      ? 'every turn goes the same way, and the turns add up to one full circle'
      : laps === 0
        ? 'the polygon has no area'
        : `every turn goes the same way, but they add up to ${laps} full circles: the boundary winds around ${laps} times, so its edges cross`;
    s = { ...s, result: { kind: 'convex', convex: ok, why } };
    yield {
      state: s,
      marks: v.map((_, i) => mark(vId(i), ok ? 'done' : 'error')),
      say: `The turns add up to ${deg(total)}°. ${ok ? 'Convex' : 'Not convex'}: ${why}.`,
      lines: ['cv.total', ok ? 'cv.yes' : 'cv.no'],
      vars: vars(s, { 'total turning': `${deg(total)}°`, convex: ok ? 'yes' : 'no' }),
      level: 1,
    } satisfies PStep;
    return s;
  },
};

const coord = (v: Value | undefined): number | null => {
  const n =
    typeof v === 'number' ? v : typeof v === 'string' && /^-?\d+$/.test(v.trim()) ? Number(v) : NaN;
  return Number.isInteger(n) && n >= 0 && n <= MAX ? n : null;
};

/** Is q on the segment ab? */
const onEdge = (a: Vec, b: Vec, q: Vec) =>
  orient(a, b, q) === 0 &&
  Math.min(a.x, b.x) <= q.x &&
  q.x <= Math.max(a.x, b.x) &&
  Math.min(a.y, b.y) <= q.y &&
  q.y <= Math.max(a.y, b.y);

const inside: Op = {
  label: 'Inside?',
  arity: 2,
  *run(s0, [vx, vy], { settings }) {
    const x = coord(vx);
    const y = coord(vy);
    if (x === null || y === null) {
      yield {
        state: s0,
        marks: [],
        say: `inside: type the point as two whole numbers from 0 to ${MAX}, such as 4 5.`,
        lines: [],
        vars: vars(s0),
        level: 1,
      } satisfies PStep;
      return s0;
    }
    const q = { x, y };
    const ray = settings.inside === 'ray';
    let s: S = { ...fresh(s0), query: q };
    const v = s.verts;
    const n = v.length;
    const hits: { edge: number; x: number; up: boolean }[] = [];
    let count = 0;
    yield {
      state: s,
      marks: [mark('q', 'active')],
      say: ray
        ? `Is q = (${x}, ${y}) inside? Cast a ray from q to the right and count how many edges it crosses: odd means inside.`
        : `Is q = (${x}, ${y}) inside? Count how many times the boundary winds around q: add 1 for an edge crossing the ray upward with q on its left, subtract 1 for one crossing downward with q on its right.`,
      lines: [ray ? 'in.init' : 'wn.init'],
      vars: vars(s, ray ? { crossings: 0 } : { winding: 0 }),
      level: 2,
      extra: { hits: [] },
    } satisfies PStep;
    for (let i = 0; i < n; i++) {
      const a = v[i]!;
      const b = v[(i + 1) % n]!;
      const edge = `${nameOf(i)}${nameOf((i + 1) % n)}`;
      s = { ...s, tests: s.tests + 1 };
      if (onEdge(a, b, q)) {
        s = { ...s, result: { kind: 'inside', where: 'boundary', count } };
        yield {
          state: s,
          marks: [mark(eId(s, i), 'found'), mark('q', 'found')],
          say: `q lies on edge ${edge}, so it is on the boundary. Whether the boundary counts as inside is a choice each program makes; here we report it.`,
          lines: [ray ? 'in.on' : 'wn.on'],
          vars: vars(
            s,
            ray ? { crossings: count, where: 'boundary' } : { winding: count, where: 'boundary' },
          ),
          level: 1,
          extra: { hits: [...hits] },
        } satisfies PStep;
        return s;
      }
      const spans = a.y > y !== b.y > y;
      const xi = spans ? a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y) : NaN;
      const right = spans && x < xi;
      let say: string;
      let line: string;
      if (ray) {
        if (right) {
          count += 1;
          hits.push({ edge: i, x: xi, up: b.y > a.y });
          say = `Edge ${edge} goes from y = ${a.y} to y = ${b.y}, past y = ${y}, and meets the ray at x = ${fmtNum(xi)}, to the right of q. Crossings: ${count}.`;
        } else if (spans) {
          say = `Edge ${edge} crosses y = ${y} at x = ${fmtNum(xi)}, which is left of q, so the ray misses it.`;
        } else {
          say = `Edge ${edge} is entirely ${a.y > y ? 'above' : 'at or below'} y = ${y}, so the ray misses it.${a.y === y || b.y === y ? ' (An end exactly on the ray counts as below, so a ray through a vertex is counted once.)' : ''}`;
        }
        line = right ? 'in.count' : 'in.test';
      } else {
        const t = orient(a, b, q);
        let delta = 0;
        if (a.y <= y && b.y > y && t > 0) delta = 1;
        else if (a.y > y && b.y <= y && t < 0) delta = -1;
        count += delta;
        if (delta) hits.push({ edge: i, x: xi, up: delta > 0 });
        say = delta
          ? `Edge ${edge} crosses y = ${y} going ${delta > 0 ? 'up, with q on its left' : 'down, with q on its right'} (TURN = ${t}). Winding number: ${count}.`
          : spans
            ? `Edge ${edge} crosses y = ${y} at x = ${fmtNum(xi)}, left of q, so it does not change the winding number.`
            : `Edge ${edge} does not cross y = ${y}${a.y === y || b.y === y ? ' (an end exactly on the line counts as below)' : ''}.`;
        line = delta > 0 ? 'wn.up' : delta < 0 ? 'wn.down' : 'wn.test';
      }
      yield {
        state: s,
        marks: [
          mark(eId(s, i), delta(right, ray, hits, i) ? 'active' : 'compare'),
          mark('q', 'active'),
        ],
        say,
        lines: [line],
        vars: vars(s, ray ? { crossings: count } : { winding: count }),
        level: 2,
        extra: { hits: [...hits] },
      } satisfies PStep;
    }
    const where: Where = ray
      ? count % 2 === 1
        ? 'inside'
        : 'outside'
      : count !== 0
        ? 'inside'
        : 'outside';
    s = { ...s, result: { kind: 'inside', where, count } };
    yield {
      state: s,
      marks: [mark('q', where === 'inside' ? 'done' : 'error')],
      say: ray
        ? `${count} crossing${count === 1 ? '' : 's'}: ${count % 2 ? 'odd' : 'even'}, so q is ${where}. Every crossing switches between outside and inside.`
        : `The winding number is ${count}, so q is ${where}.${Math.abs(count) > 1 ? ' The boundary goes around q more than once; the even-odd rule would call it outside.' : ''}`,
      lines: [ray ? 'in.ret' : 'wn.ret'],
      vars: vars(s, ray ? { crossings: count, where } : { winding: count, where }),
      level: 1,
      extra: { hits },
    } satisfies PStep;
    return s;
  },
};

/** Whether the edge just tested counted (for its highlight). */
function delta(right: boolean, ray: boolean, hits: { edge: number }[], i: number): boolean {
  return ray ? right : hits.some((h) => h.edge === i);
}

export const ops = { load, area, orientation, convex, inside };

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: PolySettings): PseudoBlock[] {
  const insideBlock: PseudoBlock =
    settings.inside === 'winding'
      ? {
          op: 'inside',
          lines: [
            L('wn.sig', 0, 'WINDING-NUMBER(P, q)', 'To tell whether q is inside P:'),
            L('wn.init', 1, 'w = 0', 'Start the winding count at 0.'),
            L('wn.loop', 1, 'for each edge (a, b) of P', 'For each edge from a to b:'),
            L(
              'wn.on',
              2,
              'if q is on segment ab: return boundary',
              'If q is on the edge, it is on the boundary.',
            ),
            L(
              'wn.test',
              2,
              'if a.y ≤ q.y < b.y and TURN(a, b, q) > 0',
              'If the edge crosses q’s line going up with q on its left,',
            ),
            L('wn.up', 3, 'w = w + 1', 'it winds around q once more.'),
            L(
              'wn.down',
              2,
              'if b.y ≤ q.y < a.y and TURN(a, b, q) < 0: w = w − 1',
              'If it crosses going down with q on its right, it unwinds once.',
            ),
            L(
              'wn.ret',
              1,
              'return inside if w ≠ 0, else outside',
              'q is inside when the boundary winds around it at all.',
            ),
          ],
        }
      : {
          op: 'inside',
          lines: [
            L('in.sig', 0, 'RAY-CAST(P, q)', 'To tell whether q is inside P:'),
            L('in.init', 1, 'c = 0', 'Start counting crossings at 0.'),
            L('in.loop', 1, 'for each edge (a, b) of P', 'For each edge from a to b:'),
            L(
              'in.on',
              2,
              'if q is on segment ab: return boundary',
              'If q is on the edge, it is on the boundary.',
            ),
            L(
              'in.test',
              2,
              'if (a.y > q.y) ≠ (b.y > q.y) and q.x < x where ab meets y = q.y',
              'If the edge crosses the ray going right from q,',
            ),
            L('in.count', 3, 'c = c + 1', 'count one more crossing.'),
            L(
              'in.ret',
              1,
              'return inside if c is odd, else outside',
              'An odd count means q is inside.',
            ),
          ],
        };
  return [
    {
      op: 'area',
      lines: [
        L('area.sig', 0, 'AREA(P)', 'To find the area of polygon P:'),
        L('area.init', 1, 'sum = 0', 'Start a sum at 0.'),
        L('area.loop', 1, 'for i = 0 to n − 1', 'For each edge, from vertex i to the next one,'),
        L(
          'area.term',
          2,
          'sum = sum + x[i]·y[i+1] − x[i+1]·y[i]',
          'add the cross product of the two vertices (indexes wrap around).',
        ),
        L(
          'area.ret',
          1,
          'return |sum| / 2',
          'The area is half the size of the sum; its sign is the direction.',
        ),
      ],
    },
    insideBlock,
    {
      op: 'orientation',
      lines: [
        L('or.sig', 0, 'ORIENTATION(P)', 'To tell which way P goes round:'),
        L(
          'or.low',
          1,
          'b = the lowest vertex (leftmost if tied); a, c its neighbours',
          'Take the lowest vertex and the vertices before and after it.',
        ),
        L('or.turn', 1, 't = TURN(a, b, c)', 'See which way the boundary turns there.'),
        L(
          'or.ccw',
          1,
          'if t > 0: return counter-clockwise',
          'A left turn means counter-clockwise.',
        ),
        L('or.cw', 1, 'if t < 0: return clockwise', 'A right turn means clockwise.'),
        L('or.flat', 1, 'return degenerate', 'No turn means the polygon is flat there.'),
      ],
    },
    {
      op: 'convex',
      lines: [
        L('cv.sig', 0, 'IS-CONVEX(P)', 'To tell whether P is convex:'),
        L('cv.loop', 1, 'for each vertex b, with neighbours a and c', 'At every vertex,'),
        L(
          'cv.turn',
          2,
          't = TURN(a, b, c); total = total + the turn angle',
          'see which way the boundary turns, and add up the turning.',
        ),
        L(
          'cv.mixed',
          2,
          'if t has the opposite sign of an earlier turn: return false',
          'A turn the other way is a dent: not convex.',
        ),
        L(
          'cv.total',
          1,
          'if |total| ≠ 360°: return false',
          'All turns one way, but more than one lap means the edges cross.',
        ),
        L('cv.no', 2, 'return false', 'Not convex.'),
        L('cv.yes', 1, 'return true', 'Convex.'),
      ],
    },
  ];
}

export function initialSay(): string {
  return 'A rectangle with corners A to D, counter-clockwise. Ask for its area, its orientation or whether it is convex, or type a point such as 4 5 and press Inside?.';
}

export function initialVars(state: S) {
  return vars(state);
}

export function describe(state: S): string {
  const pts = state.verts.map(at).join(', ');
  const r = state.result;
  const res = !r
    ? ''
    : r.kind === 'area'
      ? ` Area ${half(r.sum)}.`
      : r.kind === 'orient'
        ? ` ${r.turn > 0 ? 'Counter-clockwise' : r.turn < 0 ? 'Clockwise' : 'Degenerate'}.`
        : r.kind === 'convex'
          ? ` ${r.convex ? 'Convex' : 'Not convex'}.`
          : ` The point (${state.query!.x}, ${state.query!.y}) is ${r.where === 'boundary' ? 'on the boundary' : r.where}.`;
  return `Polygon with ${state.verts.length} vertices: ${pts}.${state.simple ? '' : ' Its edges cross.'}${res}`;
}
