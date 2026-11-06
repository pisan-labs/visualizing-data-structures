import type { Mark, OpSpec, PseudoBlock, Scalar, Step, Value } from '../../engine/types';
import { fmtNum } from '../../layouts/plane';
import {
  IDENTITY3,
  apply3,
  column3,
  det3,
  fmtVec3,
  mat3Text,
  matMul3,
  rotation3,
  scaling3,
  type Axis,
  type Mat3,
  type Vec3,
} from '../../layouts/space';

/** The drawing fits −R to R on every axis; transforms that push a vertex further are refused. */
export const R = 4;

export type ShapeName = 'cube' | 'wedge';

export interface RsState {
  base: Vec3[];
  /** Everything applied so far, p' = M p (column vectors). */
  m: Mat3;
  pts: Vec3[];
  transforms: number;
  mults: number;
}

export interface Rs3Settings {
  [key: string]: Scalar;
  projection: 'isometric' | 'oblique';
  /** column: p' = M p. row: p' = p M (every matrix transposed). */
  convention: 'column' | 'row';
  shape: ShapeName;
}

export interface Rs3Extra {
  /** The operation's matrix and its name. */
  op?: { name: string; m: Mat3 };
  /** Draw where the operation's matrix sends e1, e2, e3. */
  basis?: boolean;
  /** Rotate about x then y, against y then x, from the same shape. */
  compare?: { xy: Vec3[]; yx: Vec3[]; xyM: Mat3; yxM: Mat3; same: boolean };
}

type S = RsState;
type X = Rs3Extra;
type Op = OpSpec<S, Rs3Settings, X>;
type RStep = Step<S, X>;

const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

export interface ShapeDef {
  pts: Vec3[];
  edges: [number, number][];
  /** The vertex labelled A. */
  a: number;
}

export const SHAPES: Record<ShapeName, ShapeDef> = {
  cube: {
    pts: [
      v(0, 0, 0),
      v(2, 0, 0),
      v(2, 2, 0),
      v(0, 2, 0),
      v(0, 0, 2),
      v(2, 0, 2),
      v(2, 2, 2),
      v(0, 2, 2),
    ],
    edges: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0],
      [4, 5],
      [5, 6],
      [6, 7],
      [7, 4],
      [0, 4],
      [1, 5],
      [2, 6],
      [3, 7],
    ],
    a: 5,
  },
  wedge: {
    pts: [v(0, 0, 0), v(3, 0, 0), v(3, 1, 0), v(0, 1, 0), v(0, 0, 2), v(0, 1, 2)],
    edges: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0],
      [0, 4],
      [3, 5],
      [4, 5],
      [1, 4],
      [2, 5],
    ],
    a: 4,
  },
};

export const defaults: Rs3Settings = {
  projection: 'isometric',
  convention: 'column',
  shape: 'cube',
};

export function init(settings: Rs3Settings): S {
  const base = (SHAPES[settings.shape] ?? SHAPES.cube).pts;
  return { base, m: IDENTITY3, pts: base, transforms: 0, mults: 0 };
}

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });
const n = fmtNum;
const row = (settings: Rs3Settings) => settings.convention === 'row';
const mt = (m: Mat3, settings: Rs3Settings) => mat3Text(m, row(settings));

function vars(s: S, settings: Rs3Settings, more: Record<string, Scalar> = {}) {
  return {
    ...more,
    M: mt(s.m, settings),
    'det M': n(det3(s.m)),
    transforms: s.transforms,
    multiplications: s.mults,
  };
}

/** A number from a call in [lo, hi] with at most one decimal place. */
export function numArg(x: Value | undefined, lo: number, hi: number): number | null {
  const t = typeof x === 'number' ? String(x) : typeof x === 'string' ? x.trim() : '';
  if (!/^-?\d+(\.\d)?$/.test(t)) return null;
  const k = Number(t);
  return k >= lo && k <= hi ? k : null;
}

export const fits = (ps: Vec3[]) =>
  ps.every((p) => Math.max(Math.abs(p.x), Math.abs(p.y), Math.abs(p.z)) <= R + 1e-9);

function* bad(s: S, settings: Rs3Settings, say: string): Generator<RStep, S, void> {
  yield { state: s, marks: [], say, lines: [], vars: vars(s, settings), level: 1 };
  return s;
}

/** M = A·M, and the shape is M applied to the start shape (the same arithmetic as the code). */
function compose(s: S, a: Mat3): S {
  const m = matMul3(a, s.m);
  return {
    ...s,
    m,
    pts: s.base.map((p) => apply3(m, p)),
    transforms: s.transforms + 1,
    mults: s.mults + 27 + 9 * s.base.length,
  };
}

const AXIS_NAME: Record<Axis, string> = { x: 'Rx', y: 'Ry', z: 'Rz' };
const STAYS: Record<Axis, string> = { x: 'e₁', y: 'e₂', z: 'e₃' };

/** The shared steps of a rotation or a scale: the matrix and its columns, then apply it. */
function* transform(
  s: S,
  settings: Rs3Settings,
  a: Mat3,
  name: string,
  intro: string,
  line: string,
  after: string,
): Generator<RStep, S, void> {
  const op = { name, m: a };
  const end = compose(s, a);
  if (!fits(end.pts)) {
    yield {
      state: s,
      marks: [mark('sh', 'error')],
      say: `${intro} That would move the shape off the drawing (beyond ±${R}), so it is not applied. Press Reset to start again.`,
      lines: [`${line}.m`],
      vars: vars(s, settings),
      level: 1,
      extra: { op },
    } satisfies RStep;
    return s;
  }
  const cols = [0, 1, 2].map((j) => fmtVec3(column3(a, j)));
  yield {
    state: s,
    marks: [mark('b1', 'active'), mark('b2', 'active'), mark('b3', 'active')],
    say: `${intro} Its columns are where the basis vectors go: e₁ → ${cols[0]}, e₂ → ${cols[1]}, e₃ → ${cols[2]}${row(settings) ? ' (rows, for row vectors)' : ''}. Every point x·e₁ + y·e₂ + z·e₃ goes to the same mix of those three.`,
    lines: [`${line}.m`],
    vars: vars(s, settings, { [name]: mt(a, settings), [`det ${name}`]: n(det3(a)) }),
    level: 2,
    extra: { op, basis: true },
  } satisfies RStep;
  yield {
    state: end,
    marks: [mark('sh', 'active'), mark('m1', 'active'), mark('m2', 'active'), mark('m3', 'active')],
    say: `${after} Everything so far is one matrix: ${row(settings) ? `M = M·${name}` : `M = ${name}·M`} = ${mt(end.m, settings)}.`,
    lines: [`${line}.apply`],
    vars: vars(end, settings),
    level: 1,
  } satisfies RStep;
  return end;
}

const DIR: Record<Axis, string> = {
  x: 'y toward z',
  y: 'z toward x',
  z: 'x toward y',
};

function rotateOp(axis: Axis): Op {
  return {
    label: `Rotate about ${axis}`,
    arity: 1,
    *run(s, [va], { settings }) {
      const deg = numArg(va, -360, 360);
      if (deg === null)
        return yield* bad(s, settings, `rotate ${axis}: type an angle in degrees, such as 90.`);
      const a = rotation3(axis, deg);
      return yield* transform(
        s,
        settings,
        a,
        AXIS_NAME[axis],
        `Rotate by ${n(deg)}° about the ${axis} axis (turning ${DIR[axis]}, counter-clockwise when the ${axis} axis points at you).`,
        `r${axis}`,
        `Every vertex turns about the ${axis} axis. Points on that axis stay put, and ${STAYS[axis]} is its own column. Lengths and angles do not change, and det ${AXIS_NAME[axis]} = 1.`,
      );
    },
  };
}

const scale: Op = {
  label: 'Scale',
  arity: 3,
  *run(s, [vx, vy, vz], { settings }) {
    const sx = numArg(vx, -4, 4);
    const sy = numArg(vy, -4, 4);
    const sz = numArg(vz, -4, 4);
    if (sx === null || sy === null || sz === null)
      return yield* bad(s, settings, 'scale: type sx, sy and sz from −4 to 4, such as 1 1 2.');
    const d = sx * sy * sz;
    return yield* transform(
      s,
      settings,
      scaling3(sx, sy, sz),
      'S',
      `Scale by ${n(sx)} in x, ${n(sy)} in y and ${n(sz)} in z${sx === sy && sy === sz ? ' (uniform: the shape keeps its proportions)' : ''}. S is diagonal.`,
      'scl',
      d === 0
        ? 'det S = 0: the shape is squashed flat, and nothing can bring it back.'
        : d < 0
          ? `det S = ${n(d)} is negative: the shape is mirrored, and volumes scale by ${n(Math.abs(d))}.`
          : `Volumes scale by det S = sx·sy·sz = ${n(d)}.`,
    );
  },
};

/** Whether two point lists read the same to two decimals. */
const sameShape = (a: Vec3[], b: Vec3[]) =>
  a.every((p, i) => n(p.x) === n(b[i]!.x) && n(p.y) === n(b[i]!.y) && n(p.z) === n(b[i]!.z));

const order: Op = {
  label: 'Compare orders',
  arity: 1,
  *run(s, [va], { settings }) {
    const deg = numArg(va, -360, 360);
    if (deg === null)
      return yield* bad(s, settings, 'order: type an angle in degrees, such as 90.');
    const rx = rotation3('x', deg);
    const ry = rotation3('y', deg);
    const xyM = matMul3(ry, matMul3(rx, s.m));
    const yxM = matMul3(rx, matMul3(ry, s.m));
    const xy = s.base.map((p) => apply3(xyM, p));
    const yx = s.base.map((p) => apply3(yxM, p));
    const same = sameShape(xy, yx);
    const col = !row(settings);
    yield {
      state: s,
      marks: [mark('xy', 'active')],
      say: `Rotate by ${n(deg)}° about x, then by ${n(deg)}° about y. ${col ? 'With column vectors the first rotation sits on the right: Ry·Rx' : 'With row vectors the first rotation sits on the left: Rx·Ry'} = ${mt(matMul3(ry, rx), settings)}.`,
      lines: ['ord.xy'],
      vars: vars(s, settings, { 'x, then y': mt(matMul3(ry, rx), settings) }),
      level: 2,
      extra: { compare: { xy, yx: [], xyM, yxM, same } },
    } satisfies RStep;
    yield {
      state: s,
      marks: [mark('xy', 'active'), mark('yx', 'error')],
      say: `Now the other order: about y first, then about x. ${col ? 'Rx·Ry' : 'Ry·Rx'} = ${mt(matMul3(rx, ry), settings)}.`,
      lines: ['ord.yx'],
      vars: vars(s, settings, {
        'x, then y': mt(matMul3(ry, rx), settings),
        'y, then x': mt(matMul3(rx, ry), settings),
      }),
      level: 2,
      extra: { compare: { xy, yx, xyM, yxM, same } },
    } satisfies RStep;
    yield {
      state: s,
      marks: [mark('xy', same ? 'found' : 'active'), mark('yx', same ? 'found' : 'error')],
      say: same
        ? deg % 180 === 0
          ? 'The two orders give the same shape here: the angle is a multiple of 180°, and half turns about perpendicular axes commute.'
          : 'The two orders agree to two decimals, but only because the angle is tiny. Make it bigger and they come apart.'
        : 'Different shapes. In 2D any two rotations commute; in 3D, rotations about different axes do not. Try it with a book: tip it forward and then turn it, against turn then tip.',
      lines: ['ord.cmp'],
      vars: vars(s, settings, {
        'x, then y': mt(matMul3(ry, rx), settings),
        'y, then x': mt(matMul3(rx, ry), settings),
        same: same ? 'yes' : 'no',
      }),
      level: 1,
      extra: { compare: { xy, yx, xyM, yxM, same } },
    } satisfies RStep;
    return s;
  },
};

const reset: Op = {
  label: 'Reset',
  arity: 0,
  *run(_s, _args, { settings }) {
    const end = init(settings);
    yield {
      state: end,
      marks: [mark('sh', 'active')],
      say: 'Back to the original shape: M is the identity again.',
      lines: ['rst.id'],
      vars: vars(end, settings),
      level: 1,
    } satisfies RStep;
    return end;
  },
};

export const ops = {
  rotateX: rotateOp('x'),
  rotateY: rotateOp('y'),
  rotateZ: rotateOp('z'),
  scale,
  order,
  reset,
};

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

const ROT_TEXT: Record<Axis, [string, string]> = {
  x: ['Rx = [1  0  0; 0  c  −s; 0  s  c]', 'Rx = [1  0  0; 0  c  s; 0  −s  c]'],
  y: ['Ry = [c  0  s; 0  1  0; −s  0  c]', 'Ry = [c  0  −s; 0  1  0; s  0  c]'],
  z: ['Rz = [c  −s  0; s  c  0; 0  0  1]', 'Rz = [c  s  0; −s  c  0; 0  0  1]'],
};

export function pseudocode(settings: Rs3Settings): PseudoBlock[] {
  const col = !row(settings);
  const apply = (name: string) =>
    col
      ? `for each vertex p: p = ${name} p;  M = ${name} M`
      : `for each vertex p: p = p ${name};  M = M ${name}`;
  const rot = (axis: Axis): PseudoBlock => ({
    op: `rotate${axis.toUpperCase()}`,
    lines: [
      L(
        `r${axis}.sig`,
        0,
        `ROTATE-${axis.toUpperCase()}(θ)`,
        `To turn the shape about the ${axis} axis:`,
      ),
      L(
        `r${axis}.m`,
        1,
        `c = cos θ, s = sin θ;  ${ROT_TEXT[axis][col ? 0 : 1]}`,
        `Build the rotation matrix; the ${axis} row and column stay as in the identity.`,
      ),
      L(`r${axis}.apply`, 1, apply(AXIS_NAME[axis]), 'Turn every vertex.'),
    ],
  });
  return [
    rot('x'),
    rot('y'),
    rot('z'),
    {
      op: 'scale',
      lines: [
        L('scl.sig', 0, 'SCALE(sx, sy, sz)', 'To stretch the shape:'),
        L('scl.m', 1, 'S = [sx  0  0; 0  sy  0; 0  0  sz]', 'Build the diagonal scaling matrix.'),
        L('scl.apply', 1, apply('S'), 'Stretch every vertex.'),
      ],
    },
    {
      op: 'order',
      lines: [
        L('ord.sig', 0, 'COMPARE(θ)', 'To see whether the order of two rotations matters:'),
        L(
          'ord.xy',
          1,
          col
            ? 'A = Ry(θ) Rx(θ)    (x first, on the right)'
            : 'A = Rx(θ) Ry(θ)    (x first, on the left)',
          'Combine about-x-then-about-y.',
        ),
        L(
          'ord.yx',
          1,
          col ? 'B = Rx(θ) Ry(θ)' : 'B = Ry(θ) Rx(θ)',
          'Combine about-y-then-about-x.',
        ),
        L('ord.cmp', 1, 'return A == B', 'Compare the two results.'),
      ],
    },
    {
      op: 'reset',
      lines: [
        L('rst.sig', 0, 'RESET()', 'To start over:'),
        L('rst.id', 1, 'M = I; restore the shape', 'Forget every transform.'),
      ],
    },
  ];
}

export function initialSay(_s: S, settings: Rs3Settings): string {
  return `A ${settings.shape === 'wedge' ? 'wedge' : 'cube'} and the x, y and z axes, drawn with ${settings.projection === 'oblique' ? 'an oblique' : 'an isometric'} projection. Type an angle such as 90 and press Rotate about x, y or z, or three factors such as 1 1 2 and press Scale.`;
}

export function initialVars(s: S, settings: Rs3Settings) {
  return vars(s, settings);
}

export function describe(s: S): string {
  return `A shape with ${s.pts.length} vertices: ${s.pts.map((p) => fmtVec3(p)).join(', ')}. M = ${mat3Text(s.m)}.`;
}

/** Two decimals, rounded half up, the same way as the code tabs. Never "-0.00". */
export function fixed2(x: number): string {
  const r = Math.floor(x * 100 + 0.5);
  const a = Math.abs(r);
  return `${r < 0 ? '-' : ''}${Math.floor(a / 100)}.${String(a % 100).padStart(2, '0')}`;
}
