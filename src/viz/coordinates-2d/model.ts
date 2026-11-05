import type { Mark, OpSpec, PseudoBlock, Scalar, Step, Value } from '../../engine/types';
import { fmtNum, fmtVec, type Vec } from '../../layouts/plane';

/** The drawing shows world coordinates from -R to R. */
export const R = 7;

export interface CoordState {
  /** Frame B: its origin and axes, in world coordinates. */
  o: Vec;
  u: Vec;
  v: Vec;
  /** The angle of u when the frame was set by angle(); null for general axes. */
  angle: number | null;
  /** A point, in world coordinates and in B's coordinates. */
  p: Vec | null;
  local: Vec | null;
  /** Conversions done so far, and arithmetic (multiplications and divisions) they took. */
  conversions: number;
  mults: number;
}

export interface CoordSettings {
  [key: string]: Scalar;
  /** affine: p = o + M q with a 2×2 M. homogeneous: one 3×3 matrix on (x, y, 1). */
  form: 'affine' | 'homogeneous';
}

export interface CoordExtra {
  /** toLocal: d = p − o is drawn. */
  d?: boolean;
  /** Draw the walk o → o + a·u → o + a·u + b·v, up to this many legs. */
  walk?: 1 | 2;
  /** Show the inverse matrix in the panel. */
  inverse?: boolean;
  /** Where toWorld has got to (before adding o, it is a·u + b·v from the world origin). */
  partial?: Vec;
}

type S = CoordState;
type X = CoordExtra;
type Op = OpSpec<S, CoordSettings, X>;
type CStep = Step<S, X>;

export const defaults: CoordSettings = { form: 'affine' };

const rad = (deg: number) => (deg * Math.PI) / 180;

export function axesFor(deg: number): { u: Vec; v: Vec } {
  const c = Math.cos(rad(deg));
  const s = Math.sin(rad(deg));
  return { u: { x: c, y: s }, v: { x: -s, y: c } };
}

export function init(): S {
  return {
    o: { x: 2, y: 1 },
    ...axesFor(30),
    angle: 30,
    p: null,
    local: null,
    conversions: 0,
    mults: 0,
  };
}

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });

export const det = (u: Vec, v: Vec) => u.x * v.y - v.x * u.y;

/** p in the frame's coordinates, by Cramer's rule (the same arithmetic as the code tabs). */
export function toLocalOf(o: Vec, u: Vec, v: Vec, p: Vec): Vec {
  const dt = u.x * v.y - v.x * u.y;
  const dx = p.x - o.x;
  const dy = p.y - o.y;
  return { x: (dx * v.y - v.x * dy) / dt, y: (u.x * dy - dx * u.y) / dt };
}

/** The world point with frame coordinates q. */
export function toWorldOf(o: Vec, u: Vec, v: Vec, q: Vec): Vec {
  return { x: o.x + q.x * u.x + q.y * v.x, y: o.y + q.x * u.y + q.y * v.y };
}

/** Whether u, v are perpendicular unit vectors (so M is a rotation, maybe with a flip). */
export const orthonormal = (u: Vec, v: Vec) =>
  Math.abs(u.x * u.x + u.y * u.y - 1) < 1e-9 &&
  Math.abs(v.x * v.x + v.y * v.y - 1) < 1e-9 &&
  Math.abs(u.x * v.x + u.y * v.y) < 1e-9;

const n = fmtNum;

/** The frame's matrix as rows of text, 2×2 or 3×3. */
export function frameMatrix(s: S, settings: CoordSettings): string[][] {
  const rows = [
    [n(s.u.x), n(s.v.x)],
    [n(s.u.y), n(s.v.y)],
  ];
  if (settings.form === 'affine') return rows;
  return [
    [...rows[0]!, n(s.o.x)],
    [...rows[1]!, n(s.o.y)],
    ['0', '0', '1'],
  ];
}

/** The inverse, 2×2 or 3×3. */
export function inverseMatrix(s: S, settings: CoordSettings): string[][] {
  const dt = det(s.u, s.v);
  const m = [
    [s.v.y / dt, -s.v.x / dt],
    [-s.u.y / dt, s.u.x / dt],
  ];
  const rows = m.map((r) => r.map((x) => n(x)));
  if (settings.form === 'affine') return rows;
  const t = [-(m[0]![0]! * s.o.x + m[0]![1]! * s.o.y), -(m[1]![0]! * s.o.x + m[1]![1]! * s.o.y)];
  return [
    [...rows[0]!, n(t[0]!)],
    [...rows[1]!, n(t[1]!)],
    ['0', '0', '1'],
  ];
}

export function vars(s: S, more: Record<string, Scalar> = {}): Record<string, Scalar> {
  return {
    o: fmtVec(s.o),
    u: fmtVec(s.u),
    v: fmtVec(s.v),
    'det M': n(det(s.u, s.v)),
    ...(s.p ? { 'p (world)': fmtVec(s.p) } : {}),
    ...(s.local ? { 'p (in B)': fmtVec(s.local) } : {}),
    ...more,
    conversions: s.conversions,
    'multiplications and divisions': s.mults,
  };
}

/** A number from a call, in [lo, hi], with at most one decimal place. */
export function numArg(v: Value | undefined, lo: number, hi: number): number | null {
  const t = typeof v === 'number' ? String(v) : typeof v === 'string' ? v.trim() : '';
  if (!/^-?\d+(\.\d)?$/.test(t)) return null;
  const x = Number(t);
  return x >= lo && x <= hi ? x : null;
}

function* bad(s: S, what: string): Generator<CStep, S, void> {
  yield { state: s, marks: [], say: what, lines: [], vars: vars(s), level: 1 };
  return s;
}

/** After the frame moves, the point stays put in the world and gets new frame coordinates. */
function recompute(s: S): S {
  if (!s.p) return s;
  return { ...s, local: toLocalOf(s.o, s.u, s.v, s.p) };
}

function* frameChanged(s: S, say: string, line: string): Generator<CStep, S, void> {
  const end = recompute(s);
  yield {
    state: end,
    marks: [mark('u', 'active'), mark('v', 'active'), mark('o', 'active')],
    say: end.p
      ? `${say} p has not moved in the world, but in B it is now ${fmtVec(end.local!)}.`
      : say,
    lines: [line],
    vars: vars(end),
    level: 1,
  };
  return end;
}

const origin: Op = {
  label: 'Move origin',
  arity: 2,
  *run(s, [vx, vy]) {
    const x = numArg(vx, -R, R);
    const y = numArg(vy, -R, R);
    if (x === null || y === null)
      return yield* bad(s, `origin: type x and y from −${R} to ${R}, such as 2 1.`);
    return yield* frameChanged(
      { ...s, o: { x, y } },
      `Move B's origin to o = (${n(x)}, ${n(y)}). Its axes keep their directions.`,
      'fr.o',
    );
  },
};

const angle: Op = {
  label: 'Turn axes',
  arity: 1,
  *run(s, [va]) {
    const a = numArg(va, -360, 360);
    if (a === null) return yield* bad(s, 'angle: type an angle in degrees, such as 30.');
    const { u, v } = axesFor(a);
    return yield* frameChanged(
      { ...s, u, v, angle: a },
      `Turn B's axes to ${n(a)}°: u = (cos ${n(a)}°, sin ${n(a)}°) = ${fmtVec(u)} and v = (−sin ${n(a)}°, cos ${n(a)}°) = ${fmtVec(v)}. Both have length 1 and are perpendicular.`,
      'fr.angle',
    );
  },
};

const axes: Op = {
  label: 'Set axes',
  arity: 4,
  *run(s, args) {
    const [ux, uy, vx, vy] = args.map((a) => numArg(a, -4, 4));
    if (ux === null || uy === null || vx === null || vy === null || ux === undefined)
      return yield* bad(s, 'axes: type u.x u.y v.x v.y, each from −4 to 4, such as 1 0 1 1.');
    const u = { x: ux, y: uy! };
    const v = { x: vx!, y: vy! };
    const dt = det(u, v);
    if (Math.abs(dt) < 1e-9) {
      yield {
        state: s,
        marks: [mark('u', 'error'), mark('v', 'error')],
        say: `u = ${fmtVec(u)} and v = ${fmtVec(v)} point along one line, so det M = u.x·v.y − v.x·u.y = 0. They cannot reach every point, and M has no inverse. The frame stays as it was.`,
        lines: ['fr.det'],
        vars: vars(s, { 'det M': 0 }),
        level: 1,
      } satisfies CStep;
      return s;
    }
    return yield* frameChanged(
      { ...s, u, v, angle: null },
      `Set B's axes to u = ${fmtVec(u)} and v = ${fmtVec(v)}. det M = ${n(ux)}·${n(vy!)} − ${n(vx!)}·${n(uy!)} = ${n(dt)}${orthonormal(u, v) ? '' : ', and the axes are not perpendicular unit vectors, so B stretches or skews the plane'}.`,
      'fr.axes',
    );
  },
};

const toLocal: Op = {
  label: 'World to B',
  arity: 2,
  *run(s0, [vx, vy], { settings }) {
    const x = numArg(vx, -R, R);
    const y = numArg(vy, -R, R);
    if (x === null || y === null)
      return yield* bad(
        s0,
        `toLocal: type the world point's x and y from −${R} to ${R}, such as 5 4.`,
      );
    const homo = settings.form === 'homogeneous';
    const p = { x, y };
    let s: S = { ...s0, p, local: null };
    yield {
      state: s,
      marks: [mark('p', 'active')],
      say: `p = (${n(x)}, ${n(y)}) in world coordinates. Which a and b give p = o + a·u + b·v?`,
      lines: ['loc.sig'],
      vars: vars(s),
      level: 2,
    } satisfies CStep;
    const d = { x: x - s.o.x, y: y - s.o.y };
    yield {
      state: s,
      marks: [mark('d', 'active'), mark('o', 'active')],
      say: `Measure from B's origin: d = p − o = (${n(x)} − ${n(s.o.x)}, ${n(y)} − ${n(s.o.y)}) = ${fmtVec(d)}.${homo ? ' In the 3×3 form this subtraction is the last column of T⁻¹.' : ''}`,
      lines: [homo ? 'loc.inv' : 'loc.d'],
      vars: vars(s, { d: fmtVec(d) }),
      level: 2,
      extra: { d: true },
    } satisfies CStep;
    const dt = det(s.u, s.v);
    const rot = orthonormal(s.u, s.v);
    yield {
      state: s,
      marks: [mark('d', 'active'), mark('inv', 'active')],
      say: rot
        ? `Undo M. Its columns u and v are perpendicular unit vectors, so M⁻¹ is just Mᵀ (det M = ${n(dt)}): a = u·d and b = v·d.`
        : `Undo M with its inverse: swap the diagonal, negate the other two, and divide by det M = ${n(dt)}.`,
      lines: ['loc.inv'],
      vars: vars(s, { d: fmtVec(d), 'M⁻¹ = Mᵀ': rot ? 'yes' : 'no' }),
      level: 2,
      extra: { d: true, inverse: true },
    } satisfies CStep;
    const local = toLocalOf(s.o, s.u, s.v, p);
    s = { ...s, local, conversions: s.conversions + 1, mults: s.mults + 8 };
    yield {
      state: s,
      marks: [mark('p', 'found'), mark('pa', 'active'), mark('pb', 'active')],
      say: `(a, b) = M⁻¹ d = ${fmtVec(local)}. Check: start at o, go ${n(local.x)} along u, then ${n(local.y)} along v, and you land on p.`,
      lines: ['loc.solve', 'loc.ret'],
      vars: vars(s, { d: fmtVec(d) }),
      level: 1,
      extra: { walk: 2, inverse: true },
    } satisfies CStep;
    return s;
  },
};

const toWorld: Op = {
  label: 'B to world',
  arity: 2,
  *run(s0, [va, vb], { settings }) {
    const a = numArg(va, -R, R);
    const b = numArg(vb, -R, R);
    if (a === null || b === null)
      return yield* bad(s0, `toWorld: type a and b from −${R} to ${R}, such as 3 2.`);
    const homo = settings.form === 'homogeneous';
    let s: S = { ...s0, local: { x: a, y: b }, p: null };
    const au = { x: a * s.u.x, y: a * s.u.y };
    yield {
      state: s,
      marks: [mark('pa', 'active'), mark('u', 'active')],
      say: `(${n(a)}, ${n(b)}) in B means: from o, go ${n(a)} along u, then ${n(b)} along v. First a·u = ${n(a)}·${fmtVec(s.u)} = ${fmtVec(au)}.`,
      lines: ['wld.sig', 'wld.mul'],
      vars: vars(s),
      level: 2,
      extra: { walk: 1 },
    } satisfies CStep;
    const q = { x: au.x + b * s.v.x, y: au.y + b * s.v.y };
    yield {
      state: s,
      marks: [mark('pb', 'active'), mark('v', 'active')],
      say: `Add b·v = ${n(b)}·${fmtVec(s.v)}: M (a, b) = a·u + b·v = ${fmtVec(q)}. That is the offset from o.`,
      lines: ['wld.mul'],
      vars: vars(s),
      level: 2,
      extra: { walk: 2 },
    } satisfies CStep;
    const p = toWorldOf(s.o, s.u, s.v, { x: a, y: b });
    const outside = Math.abs(p.x) > R || Math.abs(p.y) > R;
    s = { ...s, p, conversions: s.conversions + 1, mults: s.mults + 4 };
    yield {
      state: s,
      marks: [mark('p', 'found')],
      say: `Add the origin: p = o + M (a, b) = ${fmtVec(s.o)} + ${fmtVec(q)} = ${fmtVec(p)} in world coordinates.${homo ? ' The 3×3 matrix does the multiply and the add at once: its last column is o.' : ''}${outside ? ' That is outside the drawing.' : ''}`,
      lines: ['wld.add', 'wld.ret'],
      vars: vars(s),
      level: 1,
      extra: { walk: 2 },
    } satisfies CStep;
    return s;
  },
};

export const ops = { toLocal, toWorld, origin, angle, axes };

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: CoordSettings): PseudoBlock[] {
  const homo = settings.form === 'homogeneous';
  const frame: PseudoBlock = {
    op: 'frame',
    lines: [
      L(
        'fr.sig',
        0,
        'frame B = (o, u, v), M = [u v]',
        'A frame is an origin and two axis vectors; M has the axes as columns.',
      ),
      L('fr.o', 1, 'o = (x, y)', 'Move the origin.'),
      L(
        'fr.angle',
        1,
        'u = (cos θ, sin θ), v = (−sin θ, cos θ)',
        'Turn the axes by θ, keeping them perpendicular and of length 1.',
      ),
      L('fr.axes', 1, 'u = (u.x, u.y), v = (v.x, v.y)', 'Use any two axes.'),
      L(
        'fr.det',
        1,
        'if det M = u.x·v.y − v.x·u.y = 0: error',
        'Axes on one line do not make a frame.',
      ),
    ],
  };
  const local: PseudoBlock = homo
    ? {
        op: 'toLocal',
        lines: [
          L('loc.sig', 0, 'TO-LOCAL(p)', 'To find p in B’s coordinates:'),
          L(
            'loc.inv',
            1,
            'T⁻¹ = [M⁻¹  −M⁻¹o; 0 0 1]',
            'Build the inverse 3×3 matrix: undo M, and subtract the origin first.',
          ),
          L('loc.solve', 1, '(a, b, 1) = T⁻¹ (p.x, p.y, 1)', 'Multiply.'),
          L('loc.ret', 1, 'return (a, b)', 'The first two numbers are p in B.'),
        ],
      }
    : {
        op: 'toLocal',
        lines: [
          L('loc.sig', 0, 'TO-LOCAL(p)', 'To find p in B’s coordinates:'),
          L('loc.d', 1, 'd = p − o', 'Measure p from B’s origin.'),
          L(
            'loc.inv',
            1,
            'M⁻¹ = (1 / det M) [v.y  −v.x; −u.y  u.x]',
            'Undo the axes: the inverse of M.',
          ),
          L('loc.solve', 1, '(a, b) = M⁻¹ d', 'Multiply.'),
          L('loc.ret', 1, 'return (a, b)', 'That is p in B.'),
        ],
      };
  const world: PseudoBlock = homo
    ? {
        op: 'toWorld',
        lines: [
          L('wld.sig', 0, 'TO-WORLD(a, b)', 'To find the world point with B-coordinates (a, b):'),
          L('wld.mul', 1, 'T = [M  o; 0 0 1]', 'Put the axes and the origin in one 3×3 matrix.'),
          L('wld.add', 1, '(x, y, 1) = T (a, b, 1)', 'Multiply: the last column adds o.'),
          L('wld.ret', 1, 'return (x, y)', 'That is the point in the world.'),
        ],
      }
    : {
        op: 'toWorld',
        lines: [
          L('wld.sig', 0, 'TO-WORLD(a, b)', 'To find the world point with B-coordinates (a, b):'),
          L('wld.mul', 1, 'q = M (a, b) = a·u + b·v', 'Go a along u and b along v.'),
          L('wld.add', 1, 'p = o + q', 'Start from B’s origin.'),
          L('wld.ret', 1, 'return p', 'That is the point in the world.'),
        ],
      };
  return [local, world, frame];
}

export function initialSay(state: S): string {
  return `Two frames. The world has its origin at (0, 0) and axes along the grid. Frame B has origin o = ${fmtVec(state.o)} and axes turned 30°. Type a point such as 5 4 and press World to B, or B to world.`;
}

export function initialVars(state: S) {
  return vars(state);
}

export function describe(state: S): string {
  const frame = `Frame B: origin ${fmtVec(state.o)}, u = ${fmtVec(state.u)}, v = ${fmtVec(state.v)}.`;
  const pt =
    state.p && state.local
      ? ` Point p is ${fmtVec(state.p)} in the world and ${fmtVec(state.local)} in B.`
      : state.local
        ? ` Point (${fmtVec(state.local)}) in B.`
        : '';
  return frame + pt;
}

/**
 * A number rounded to two decimals, the same way in every language: floor(100x + 0.5), then
 * the digits. Never "-0.00".
 */
export function fixed2(x: number): string {
  const r = Math.floor(x * 100 + 0.5);
  const sign = r < 0 ? '-' : '';
  const a = Math.abs(r);
  return `${sign}${Math.floor(a / 100)}.${String(a % 100).padStart(2, '0')}`;
}
