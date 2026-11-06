import type { Mark, OpSpec, PseudoBlock, Scalar, Step, Value } from '../../engine/types';
import { fmtNum } from '../../layouts/plane';
import {
  column3,
  cross3,
  dot3,
  fmtVec3,
  fromColumns,
  matMul3,
  orthonormal3,
  rotation3,
  sub3,
  type Vec3,
} from '../../layouts/space';

/** Points and origins are typed from −R to R; the drawing fits that cube. */
export const R = 4;

export interface Coord3State {
  /** Frame B: its origin and three axes, in world coordinates. */
  o: Vec3;
  u: Vec3;
  v: Vec3;
  w: Vec3;
  /** A point, in world coordinates and in B's coordinates. */
  p: Vec3 | null;
  local: Vec3 | null;
  conversions: number;
  /** Multiplications and divisions the conversions took. */
  mults: number;
}

export interface Coord3Settings {
  [key: string]: Scalar;
  /** affine: p = o + M q with a 3×3 M. homogeneous: one 4×4 matrix on (x, y, z, 1). */
  form: 'affine' | 'homogeneous';
  projection: 'isometric' | 'oblique';
}

export interface Coord3Extra {
  /** toLocal: draw d = p − o. */
  d?: boolean;
  /** Draw the walk o → +a·u → +b·v → +c·w, up to this many legs. */
  walk?: 1 | 2 | 3;
  /** Show the inverse matrix. */
  inverse?: boolean;
}

type S = Coord3State;
type X = Coord3Extra;
type Op = OpSpec<S, Coord3Settings, X>;
type CStep = Step<S, X>;

export const defaults: Coord3Settings = { form: 'affine', projection: 'isometric' };

/** Axes turned by `turn` degrees about z, after tilting by `tilt` degrees about x. */
export function axesFor(turn: number, tilt: number): { u: Vec3; v: Vec3; w: Vec3 } {
  const m = matMul3(rotation3('z', turn), rotation3('x', tilt));
  return { u: column3(m, 0), v: column3(m, 1), w: column3(m, 2) };
}

export function init(): S {
  return {
    o: { x: 1, y: 1, z: 0 },
    ...axesFor(30, 0),
    p: null,
    local: null,
    conversions: 0,
    mults: 0,
  };
}

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });
const n = fmtNum;
const f3 = fmtVec3;

/** det [u v w] = u · (v × w). */
export const det = (u: Vec3, v: Vec3, w: Vec3) => dot3(u, cross3(v, w));

/** p in the frame's coordinates by Cramer's rule, the same arithmetic as the code tabs. */
export function toLocalOf(o: Vec3, u: Vec3, v: Vec3, w: Vec3, p: Vec3): Vec3 {
  const dt = dot3(u, cross3(v, w));
  const d = sub3(p, o);
  return {
    x: dot3(d, cross3(v, w)) / dt,
    y: dot3(d, cross3(w, u)) / dt,
    z: dot3(d, cross3(u, v)) / dt,
  };
}

/** The world point with frame coordinates q: o + a u + b v + c w, summed left to right. */
export function toWorldOf(o: Vec3, u: Vec3, v: Vec3, w: Vec3, q: Vec3): Vec3 {
  return {
    x: o.x + q.x * u.x + q.y * v.x + q.z * w.x,
    y: o.y + q.x * u.y + q.y * v.y + q.z * w.y,
    z: o.z + q.x * u.z + q.y * v.z + q.z * w.z,
  };
}

export const isOrthonormal = (s: S) => orthonormal3(fromColumns(s.u, s.v, s.w));

/** The frame's matrix as rows of text, 3×3 (M) or 4×4 (T). */
export function frameMatrix(s: S, settings: Coord3Settings): string[][] {
  const cols = [s.u, s.v, s.w];
  const rows = (['x', 'y', 'z'] as const).map((k) => cols.map((c) => n(c[k])));
  if (settings.form === 'affine') return rows;
  return [...rows.map((r, i) => [...r, n([s.o.x, s.o.y, s.o.z][i]!)]), ['0', '0', '0', '1']];
}

/** The inverse: rows (v×w, w×u, u×v) / det, plus −M⁻¹ o in the 4×4 form. */
export function inverseRows(s: S): Vec3[] {
  const dt = det(s.u, s.v, s.w);
  return [cross3(s.v, s.w), cross3(s.w, s.u), cross3(s.u, s.v)].map((r) => ({
    x: r.x / dt,
    y: r.y / dt,
    z: r.z / dt,
  }));
}

export function inverseMatrix(s: S, settings: Coord3Settings): string[][] {
  const inv = inverseRows(s);
  const rows = inv.map((r) => [n(r.x), n(r.y), n(r.z)]);
  if (settings.form === 'affine') return rows;
  return [...rows.map((r, i) => [...r, n(-dot3(inv[i]!, s.o))]), ['0', '0', '0', '1']];
}

export function vars(s: S, more: Record<string, Scalar> = {}): Record<string, Scalar> {
  return {
    o: f3(s.o),
    u: f3(s.u),
    v: f3(s.v),
    w: f3(s.w),
    'det M': n(det(s.u, s.v, s.w)),
    ...(s.p ? { 'p (world)': f3(s.p) } : {}),
    ...(s.local ? { 'p (in B)': f3(s.local) } : {}),
    ...more,
    conversions: s.conversions,
    'multiplications and divisions': s.mults,
  };
}

/** A number from a call, in [lo, hi], with at most one decimal place. */
export function numArg(x: Value | undefined, lo: number, hi: number): number | null {
  const t = typeof x === 'number' ? String(x) : typeof x === 'string' ? x.trim() : '';
  if (!/^-?\d+(\.\d)?$/.test(t)) return null;
  const k = Number(t);
  return k >= lo && k <= hi ? k : null;
}

function* bad(s: S, what: string): Generator<CStep, S, void> {
  yield { state: s, marks: [], say: what, lines: [], vars: vars(s), level: 1 };
  return s;
}

/** After the frame changes, the point stays put in the world and gets new frame coordinates. */
function* frameChanged(s0: S, say: string, line: string): Generator<CStep, S, void> {
  const s = s0.p ? { ...s0, local: toLocalOf(s0.o, s0.u, s0.v, s0.w, s0.p) } : s0;
  yield {
    state: s,
    marks: [mark('u', 'active'), mark('v', 'active'), mark('w', 'active'), mark('o', 'active')],
    say: s.p ? `${say} p has not moved in the world, but in B it is now ${f3(s.local!)}.` : say,
    lines: [line],
    vars: vars(s),
    level: 1,
  };
  return s;
}

const origin: Op = {
  label: 'Move origin',
  arity: 3,
  *run(s, args) {
    const [x, y, z] = args.map((a) => numArg(a, -R, R));
    if (x == null || y == null || z == null)
      return yield* bad(s, `origin: type x, y and z from −${R} to ${R}, such as 1 2 0.`);
    return yield* frameChanged(
      { ...s, o: { x, y, z } },
      `Move B's origin to o = (${n(x)}, ${n(y)}, ${n(z)}). Its axes keep their directions.`,
      'fr.o',
    );
  },
};

const turn: Op = {
  label: 'Turn axes',
  arity: 2,
  *run(s, [va, vb]) {
    const a = numArg(va, -360, 360);
    const b = numArg(vb, -360, 360);
    if (a === null || b === null)
      return yield* bad(
        s,
        'turn: type a turn about z and a tilt about x in degrees, such as 30 45.',
      );
    const axes = axesFor(a, b);
    return yield* frameChanged(
      { ...s, ...axes },
      `Tilt B's axes by ${n(b)}° about x, then turn them by ${n(a)}° about z: u = ${f3(axes.u)}, v = ${f3(axes.v)}, w = ${f3(axes.w)}. They are the columns of a rotation matrix, so they have length 1 and are perpendicular.`,
      'fr.turn',
    );
  },
};

const axes: Op = {
  label: 'Set axes',
  arity: 9,
  *run(s, args) {
    const k = args.map((a) => numArg(a, -4, 4));
    if (k.length < 9 || k.some((x) => x === null))
      return yield* bad(
        s,
        'axes: type u, v and w as nine numbers from −4 to 4, such as 1 0 0 1 1 0 0 0 1.',
      );
    const [ux, uy, uz, vx, vy, vz, wx, wy, wz] = k as number[];
    const u = { x: ux!, y: uy!, z: uz! };
    const v = { x: vx!, y: vy!, z: vz! };
    const w = { x: wx!, y: wy!, z: wz! };
    const dt = det(u, v, w);
    if (Math.abs(dt) < 1e-9) {
      yield {
        state: s,
        marks: [mark('u', 'error'), mark('v', 'error'), mark('w', 'error')],
        say: `u = ${f3(u)}, v = ${f3(v)} and w = ${f3(w)} lie in one plane (or on one line), so det M = u · (v × w) = 0. Their combinations cannot reach every point in space, and M has no inverse. The frame stays as it was.`,
        lines: ['fr.det'],
        vars: vars(s, { 'det of those axes': 0 }),
        level: 1,
      } satisfies CStep;
      return s;
    }
    const ok = orthonormal3(fromColumns(u, v, w));
    return yield* frameChanged(
      { ...s, u, v, w },
      `Set B's axes to u = ${f3(u)}, v = ${f3(v)} and w = ${f3(w)}. det M = u · (v × w) = ${n(dt)}${ok ? ', and the axes are perpendicular unit vectors' : ', and the axes are not perpendicular unit vectors, so B stretches or skews space'}${dt < 0 ? '. The determinant is negative: B is a left-handed frame' : ''}.`,
      'fr.axes',
    );
  },
};

const toLocal: Op = {
  label: 'World to B',
  arity: 3,
  *run(s0, args, { settings }) {
    const [x, y, z] = args.map((a) => numArg(a, -R, R));
    if (x == null || y == null || z == null)
      return yield* bad(
        s0,
        `toLocal: type the world point's x, y and z from −${R} to ${R}, such as 3 2 1.`,
      );
    const homo = settings.form === 'homogeneous';
    const p = { x, y, z };
    let s: S = { ...s0, p, local: null };
    yield {
      state: s,
      marks: [mark('p', 'active')],
      say: `p = ${f3(p)} in world coordinates. Which a, b and c give p = o + a·u + b·v + c·w?`,
      lines: ['loc.sig'],
      vars: vars(s),
      level: 2,
    } satisfies CStep;
    const d = sub3(p, s.o);
    yield {
      state: s,
      marks: [mark('d', 'active'), mark('o', 'active')],
      say: `Measure from B's origin: d = p − o = ${f3(d)}.${homo ? ' In the 4×4 form this subtraction is folded into the last column of T⁻¹.' : ''}`,
      lines: [homo ? 'loc.inv' : 'loc.d'],
      vars: vars(s, { d: f3(d) }),
      level: 2,
      extra: { d: true },
    } satisfies CStep;
    const dt = det(s.u, s.v, s.w);
    const rot = isOrthonormal(s);
    yield {
      state: s,
      marks: [mark('d', 'active'), mark('inv', 'active')],
      say: rot
        ? `Undo M. Its columns are perpendicular unit vectors, so M⁻¹ = Mᵀ: its rows are u, v and w, and a = u·d, b = v·d, c = w·d. Three dot products, no division.`
        : `Undo M. Its axes are not perpendicular unit vectors, so the transpose will not do. Each row of M⁻¹ is a cross product of the other two axes, divided by det M = ${n(dt)}: (v×w, w×u, u×v) / det M.`,
      lines: ['loc.inv'],
      vars: vars(s, { d: f3(d), 'M⁻¹ = Mᵀ': rot ? 'yes' : 'no' }),
      level: 2,
      extra: { d: true, inverse: true },
    } satisfies CStep;
    const local = toLocalOf(s.o, s.u, s.v, s.w, p);
    s = { ...s, local, conversions: s.conversions + 1, mults: s.mults + 33 };
    yield {
      state: s,
      marks: [mark('p', 'found'), mark('pa', 'active'), mark('pb', 'active'), mark('pc', 'active')],
      say: `(a, b, c) = M⁻¹ d = ${f3(local)}. Check: start at o, go ${n(local.x)} along u, ${n(local.y)} along v and ${n(local.z)} along w, and you land on p.`,
      lines: ['loc.solve', 'loc.ret'],
      vars: vars(s, { d: f3(d), 'M⁻¹ = Mᵀ': rot ? 'yes' : 'no' }),
      level: 1,
      extra: { walk: 3, inverse: true },
    } satisfies CStep;
    return s;
  },
};

const toWorld: Op = {
  label: 'B to world',
  arity: 3,
  *run(s0, args, { settings }) {
    const [a, b, c] = args.map((x) => numArg(x, -R, R));
    if (a == null || b == null || c == null)
      return yield* bad(s0, `toWorld: type a, b and c from −${R} to ${R}, such as 2 1 1.`);
    const homo = settings.form === 'homogeneous';
    let s: S = { ...s0, local: { x: a, y: b, z: c }, p: null };
    yield {
      state: s,
      marks: [mark('pa', 'active'), mark('u', 'active')],
      say: `(${n(a)}, ${n(b)}, ${n(c)}) in B means: from o, go ${n(a)} along u, ${n(b)} along v and ${n(c)} along w. First a·u = ${f3({ x: a * s.u.x, y: a * s.u.y, z: a * s.u.z })}.`,
      lines: ['wld.sig', 'wld.mul'],
      vars: vars(s),
      level: 2,
      extra: { walk: 1 },
    } satisfies CStep;
    yield {
      state: s,
      marks: [mark('pb', 'active'), mark('v', 'active')],
      say: `Then b·v = ${f3({ x: b * s.v.x, y: b * s.v.y, z: b * s.v.z })}.`,
      lines: ['wld.mul'],
      vars: vars(s),
      level: 2,
      extra: { walk: 2 },
    } satisfies CStep;
    const p = toWorldOf(s.o, s.u, s.v, s.w, { x: a, y: b, z: c });
    const q = sub3(p, s.o);
    const outside = Math.max(Math.abs(p.x), Math.abs(p.y), Math.abs(p.z)) > R;
    s = { ...s, p, conversions: s.conversions + 1, mults: s.mults + 9 };
    yield {
      state: s,
      marks: [mark('pc', 'active'), mark('w', 'active'), mark('p', 'found')],
      say: `Then c·w, and add the origin: p = o + M (a, b, c) = ${f3(s.o)} + ${f3(q)} = ${f3(p)} in world coordinates.${homo ? ' The 4×4 matrix does the multiply and the add at once: its last column is o.' : ''}${outside ? ' That is outside the drawing.' : ''}`,
      lines: ['wld.add', 'wld.ret'],
      vars: vars(s),
      level: 1,
      extra: { walk: 3 },
    } satisfies CStep;
    return s;
  },
};

export const ops = { toLocal, toWorld, origin, turn, axes };

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: Coord3Settings): PseudoBlock[] {
  const homo = settings.form === 'homogeneous';
  const frame: PseudoBlock = {
    op: 'frame',
    lines: [
      L(
        'fr.sig',
        0,
        'frame B = (o, u, v, w), M = [u v w]',
        'A frame is an origin and three axis vectors; M has the axes as columns.',
      ),
      L('fr.o', 1, 'o = (x, y, z)', 'Move the origin.'),
      L(
        'fr.turn',
        1,
        '[u v w] = Rz(α) Rx(β)',
        'Turn the axes, keeping them perpendicular and of length 1.',
      ),
      L('fr.axes', 1, 'u, v, w = any three vectors', 'Use any three axes.'),
      L(
        'fr.det',
        1,
        'if det M = u · (v × w) = 0: error',
        'Three axes in one plane do not make a frame.',
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
            'T⁻¹ = [M⁻¹  −M⁻¹o; 0 0 0 1]',
            'Build the inverse 4×4 matrix: undo M, and subtract the origin first.',
          ),
          L('loc.solve', 1, '(a, b, c, 1) = T⁻¹ (x, y, z, 1)', 'Multiply.'),
          L('loc.ret', 1, 'return (a, b, c)', 'The first three numbers are p in B.'),
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
            'M⁻¹ = Mᵀ if orthonormal, else rows (v×w, w×u, u×v) / det M',
            'Undo the axes: the transpose for a turned frame, the real inverse otherwise.',
          ),
          L('loc.solve', 1, '(a, b, c) = M⁻¹ d', 'Multiply.'),
          L('loc.ret', 1, 'return (a, b, c)', 'That is p in B.'),
        ],
      };
  const world: PseudoBlock = homo
    ? {
        op: 'toWorld',
        lines: [
          L(
            'wld.sig',
            0,
            'TO-WORLD(a, b, c)',
            'To find the world point with B-coordinates (a, b, c):',
          ),
          L('wld.mul', 1, 'T = [M  o; 0 0 0 1]', 'Put the axes and the origin in one 4×4 matrix.'),
          L('wld.add', 1, '(x, y, z, 1) = T (a, b, c, 1)', 'Multiply: the last column adds o.'),
          L('wld.ret', 1, 'return (x, y, z)', 'That is the point in the world.'),
        ],
      }
    : {
        op: 'toWorld',
        lines: [
          L(
            'wld.sig',
            0,
            'TO-WORLD(a, b, c)',
            'To find the world point with B-coordinates (a, b, c):',
          ),
          L(
            'wld.mul',
            1,
            'q = M (a, b, c) = a·u + b·v + c·w',
            'Go a along u, b along v and c along w.',
          ),
          L('wld.add', 1, 'p = o + q', 'Start from B’s origin.'),
          L('wld.ret', 1, 'return p', 'That is the point in the world.'),
        ],
      };
  return [local, world, frame];
}

export function initialSay(state: S): string {
  return `Two frames in space. The world has its origin at (0, 0, 0) and the usual x, y, z axes. Frame B has origin o = ${f3(state.o)} and axes u, v, w turned 30° about z. Type a point such as 3 2 1 and press World to B, or B to world.`;
}

export function initialVars(state: S) {
  return vars(state);
}

export function describe(state: S): string {
  const frame = `Frame B: origin ${f3(state.o)}, u = ${f3(state.u)}, v = ${f3(state.v)}, w = ${f3(state.w)}.`;
  const pt =
    state.p && state.local
      ? ` Point p is ${f3(state.p)} in the world and ${f3(state.local)} in B.`
      : state.local
        ? ` Point ${f3(state.local)} in B.`
        : '';
  return frame + pt;
}

/** Two decimals, rounded half up, the same way as the code tabs. Never "-0.00". */
export function fixed2(x: number): string {
  const r = Math.floor(x * 100 + 0.5);
  const a = Math.abs(r);
  return `${r < 0 ? '-' : ''}${Math.floor(a / 100)}.${String(a % 100).padStart(2, '0')}`;
}
