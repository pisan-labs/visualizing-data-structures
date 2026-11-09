import type { Mark, OpSpec, PseudoBlock, Scalar, Step, Value } from '../../engine/types';
import { fmtNum, fmtVec, type Vec } from '../../layouts/plane';

/** The drawing shows -R to R; transforms that would push a vertex further are refused. */
export const R = 10;

/** A 2×2 matrix [[a, b], [c, d]] acting on column vectors. */
export type Mat = [a: number, b: number, c: number, d: number];

export type ShapeName = 'letter' | 'house' | 'square';

export interface RsState {
  /** The shape's vertices now. */
  pts: Vec[];
  /** Everything applied so far, as p' = M p + t (column vectors). */
  m: Mat;
  t: Vec;
  /** The point to rotate and scale about, when the setting says so. */
  pivot: Vec;
  transforms: number;
  mults: number;
}

export interface RsSettings {
  [key: string]: Scalar;
  /** origin: rotate and scale about (0, 0). pivot: about the pivot point. */
  about: 'origin' | 'pivot';
  /** column: p' = M p, as in most math books and OpenGL. row: p' = p M, as in DirectX. */
  convention: 'column' | 'row';
  shape: ShapeName;
}

export interface RsExtra {
  /** The matrix of the operation in progress, and its name. */
  op?: { name: string; m: Mat };
  /** Draw where the operation's matrix sends e1 and e2. */
  basis?: boolean;
  /** The shape moved so the pivot sits at the origin (step 1 of 3 about a point). */
  shifted?: Vec[];
  /** Composition order: rotate then scale, and scale then rotate, from the same shape. */
  compare?: { rs: Vec[]; sr: Vec[]; rsM: Mat; srM: Mat; same: boolean };
}

type S = RsState;
type X = RsExtra;
type Op = OpSpec<S, RsSettings, X>;
type RStep = Step<S, X>;

export const SHAPES: Record<ShapeName, Vec[]> = {
  letter: [
    [1, 1],
    [2, 1],
    [2, 3],
    [3, 3],
    [3, 4],
    [2, 4],
    [2, 5],
    [4, 5],
    [4, 6],
    [1, 6],
  ].map(([x, y]) => ({ x: x!, y: y! })),
  house: [
    [1, 1],
    [4, 1],
    [4, 3],
    [2.5, 4.5],
    [1, 3],
  ].map(([x, y]) => ({ x: x!, y: y! })),
  square: [
    [1, 1],
    [3, 1],
    [3, 3],
    [1, 3],
  ].map(([x, y]) => ({ x: x!, y: y! })),
};

export const defaults: RsSettings = { about: 'origin', convention: 'column', shape: 'letter' };

export const IDENTITY: Mat = [1, 0, 0, 1];

export function init(settings: RsSettings): S {
  return {
    pts: SHAPES[settings.shape] ?? SHAPES.letter,
    m: IDENTITY,
    t: { x: 0, y: 0 },
    pivot: { x: 3, y: 2 },
    transforms: 0,
    mults: 0,
  };
}

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });
const n = fmtNum;
const rad = (deg: number) => (deg * Math.PI) / 180;

export const matMul = (p: Mat, q: Mat): Mat => [
  p[0] * q[0] + p[1] * q[2],
  p[0] * q[1] + p[1] * q[3],
  p[2] * q[0] + p[3] * q[2],
  p[2] * q[1] + p[3] * q[3],
];
export const apply = (m: Mat, v: Vec): Vec => ({
  x: m[0] * v.x + m[1] * v.y,
  y: m[2] * v.x + m[3] * v.y,
});
export const detOf = (m: Mat) => m[0] * m[3] - m[1] * m[2];
export const rotation = (deg: number): Mat => {
  const c = Math.cos(rad(deg));
  const s = Math.sin(rad(deg));
  return [c, -s, s, c];
};
export const scaling = (sx: number, sy: number): Mat => [sx, 0, 0, sy];

/** Rotate points about c, with the same arithmetic as the code tabs. */
export function rotatePts(pts: Vec[], deg: number, c: Vec): Vec[] {
  const co = Math.cos(rad(deg));
  const si = Math.sin(rad(deg));
  return pts.map((p) => {
    const dx = p.x - c.x;
    const dy = p.y - c.y;
    return { x: c.x + (co * dx - si * dy), y: c.y + (si * dx + co * dy) };
  });
}

/** Scale points about c, with the same arithmetic as the code tabs. */
export function scalePts(pts: Vec[], sx: number, sy: number, c: Vec): Vec[] {
  return pts.map((p) => ({ x: c.x + sx * (p.x - c.x), y: c.y + sy * (p.y - c.y) }));
}

/** A matrix as text rows, in the page's convention (row vectors see the transpose). */
export function matRows(m: Mat, settings: RsSettings): string[][] {
  const [a, b, c, d] = m;
  return settings.convention === 'row'
    ? [
        [n(a), n(c)],
        [n(b), n(d)],
      ]
    : [
        [n(a), n(b)],
        [n(c), n(d)],
      ];
}

const matText = (m: Mat, settings: RsSettings) =>
  `[${matRows(m, settings)
    .map((r) => r.join(' '))
    .join('; ')}]`;

function vars(s: S, settings: RsSettings, more: Record<string, Scalar> = {}) {
  return {
    ...more,
    M: matText(s.m, settings),
    ...(s.t.x || s.t.y ? { t: fmtVec(s.t) } : {}),
    'det M': n(detOf(s.m)),
    ...(settings.about === 'pivot' ? { pivot: fmtVec(s.pivot) } : {}),
    transforms: s.transforms,
    multiplications: s.mults,
  };
}

/** A number from a call in [lo, hi] with at most one decimal place. */
export function numArg(v: Value | undefined, lo: number, hi: number): number | null {
  const t = typeof v === 'number' ? String(v) : typeof v === 'string' ? v.trim() : '';
  if (!/^-?\d+(\.\d)?$/.test(t)) return null;
  const x = Number(t);
  return x >= lo && x <= hi ? x : null;
}

const fits = (pts: Vec[]) =>
  pts.every((p) => Math.abs(p.x) <= R + 1e-9 && Math.abs(p.y) <= R + 1e-9);

function* bad(s: S, settings: RsSettings, say: string): Generator<RStep, S, void> {
  yield { state: s, marks: [], say, lines: [], vars: vars(s, settings), level: 1 };
  return s;
}

/**
 * Apply a linear map about the centre c: the shared steps of rotate and scale. About a point,
 * the picture shows the three moves: shift c to the origin, apply the matrix, shift back.
 */
function* transform(
  s: S,
  settings: RsSettings,
  m: Mat,
  name: string,
  intro: string,
  result: Vec[],
  prefix: 'rot' | 'scl',
  mults: number,
): Generator<RStep, S, void> {
  const pivot = settings.about === 'pivot';
  const c = pivot ? s.pivot : { x: 0, y: 0 };
  const op = { name, m };
  if (!fits(result)) {
    yield {
      state: s,
      marks: [mark('sh', 'error')],
      say: `${intro} That would move the shape off the drawing (beyond ±${R}), so it is not applied. Press Reset to start again.`,
      lines: [`${prefix}.m`],
      vars: vars(s, settings),
      level: 1,
      extra: { op },
    } satisfies RStep;
    return s;
  }
  const e1 = { x: m[0], y: m[2] };
  const e2 = { x: m[1], y: m[3] };
  yield {
    state: s,
    marks: [mark('b1', 'active'), mark('b2', 'active')],
    say: `${intro} Its columns are where the basis vectors go: e₁ = (1, 0) → ${fmtVec(e1)} and e₂ = (0, 1) → ${fmtVec(e2)}. Every point (x, y) = x·e₁ + y·e₂ goes to x·${fmtVec(e1)} + y·${fmtVec(e2)}.`,
    lines: [`${prefix}.m`],
    vars: vars(s, settings, { [name]: matText(m, settings), ['det ' + name]: n(detOf(m)) }),
    level: 2,
    extra: { op, basis: true },
  } satisfies RStep;
  if (pivot) {
    const shifted = s.pts.map((p) => ({ x: p.x - c.x, y: p.y - c.y }));
    yield {
      state: s,
      marks: [mark('pivot', 'active')],
      say: `To turn about the pivot ${fmtVec(c)} instead of the origin, first slide everything by −${fmtVec(c)}, so the pivot sits on the origin.`,
      lines: [`${prefix}.shift`],
      vars: vars(s, settings, { [name]: matText(m, settings) }),
      level: 2,
      extra: { op, shifted },
    } satisfies RStep;
  }
  // Compose: p' = m (M p + t − c) + c = (m M) p + (m (t − c) + c).
  const mm = matMul(m, s.m);
  const tc = apply(m, { x: s.t.x - c.x, y: s.t.y - c.y });
  const end: S = {
    ...s,
    pts: result,
    m: mm,
    t: { x: tc.x + c.x, y: tc.y + c.y },
    transforms: s.transforms + 1,
    mults: s.mults + mults * s.pts.length,
  };
  const d = detOf(m);
  yield {
    state: end,
    marks: [mark('sh', 'active'), mark('m1', 'active'), mark('m2', 'active')],
    say: `${pivot ? `Apply ${name}, then slide back by +${fmtVec(c)}.` : `Multiply every vertex by ${name}.`} ${
      prefix === 'rot'
        ? 'Lengths and angles stay the same: only the direction changes.'
        : d < 0
          ? `det ${name} = ${n(d)} is negative, so the shape is flipped over, and its area is scaled by ${n(Math.abs(d))}.`
          : d === 0
            ? `det ${name} = 0: the shape is squashed flat onto ${m[0] === 0 && m[3] === 0 ? 'a single point' : 'a line'}.`
            : `Areas are scaled by det ${name} = ${n(d)}.`
    } Everything so far is one matrix: ${settings.convention === 'row' ? `M = M·${name}` : `M = ${name}·M`} = ${matText(mm, settings)}.`,
    lines: pivot ? [`${prefix}.apply`, `${prefix}.back`] : [`${prefix}.apply`],
    vars: vars(end, settings),
    level: 1,
  } satisfies RStep;
  return end;
}

const rotate: Op = {
  label: 'Rotate',
  arity: 1,
  *run(s, [va], { settings }) {
    const deg = numArg(va, -360, 360);
    if (deg === null)
      return yield* bad(s, settings, 'rotate: type an angle in degrees, such as 30.');
    const m = rotation(deg);
    const c = settings.about === 'pivot' ? s.pivot : { x: 0, y: 0 };
    return yield* transform(
      s,
      settings,
      m,
      'R',
      `Rotate by ${n(deg)}° ${deg >= 0 ? 'counter-clockwise' : 'clockwise'}: R = [cos θ −sin θ; sin θ cos θ]${settings.convention === 'row' ? ', written transposed for row vectors' : ''}.`,
      rotatePts(s.pts, deg, c),
      'rot',
      4,
    );
  },
};

const scale: Op = {
  label: 'Scale',
  arity: 2,
  *run(s, [vx, vy], { settings }) {
    const sx = numArg(vx, -4, 4);
    const sy = numArg(vy, -4, 4);
    if (sx === null || sy === null)
      return yield* bad(s, settings, 'scale: type sx and sy from −4 to 4, such as 2 1.');
    const c = settings.about === 'pivot' ? s.pivot : { x: 0, y: 0 };
    return yield* transform(
      s,
      settings,
      scaling(sx, sy),
      'S',
      `Scale by ${n(sx)} in x and ${n(sy)} in y${sx === sy ? ' (uniform: the shape keeps its proportions)' : ' (non-uniform: the shape is stretched)'}: S = [sx 0; 0 sy].`,
      scalePts(s.pts, sx, sy, c),
      'scl',
      2,
    );
  },
};

const pivot: Op = {
  label: 'Set pivot',
  arity: 2,
  *run(s, [vx, vy], { settings }) {
    const x = numArg(vx, -R, R);
    const y = numArg(vy, -R, R);
    if (x === null || y === null)
      return yield* bad(s, settings, `pivot: type x and y from −${R} to ${R}, such as 3 2.`);
    const end: S = { ...s, pivot: { x, y } };
    yield {
      state: end,
      marks: [mark('pivot', 'active')],
      say:
        settings.about === 'pivot'
          ? `Rotations and scales now turn about the pivot (${n(x)}, ${n(y)}).`
          : `The pivot is now (${n(x)}, ${n(y)}). It is used once the option says to rotate and scale about a point; for now they are about the origin.`,
      lines: ['piv.set'],
      vars: vars(end, settings),
      level: 1,
    } satisfies RStep;
    return end;
  },
};

const order: Op = {
  label: 'Compare orders',
  arity: 3,
  *run(s, [va, vx, vy], { settings }) {
    const deg = numArg(va, -360, 360);
    const sx = numArg(vx, -4, 4);
    const sy = numArg(vy, -4, 4);
    if (deg === null || sx === null || sy === null)
      return yield* bad(s, settings, 'order: type an angle and two scale factors, such as 90 2 1.');
    const c = settings.about === 'pivot' ? s.pivot : { x: 0, y: 0 };
    const r = rotation(deg);
    const sc = scaling(sx, sy);
    const rs = scalePts(rotatePts(s.pts, deg, c), sx, sy, c);
    const sr = rotatePts(scalePts(s.pts, sx, sy, c), deg, c);
    const rsM = matMul(sc, r);
    const srM = matMul(r, sc);
    const same = rs.every((p, i) => n(p.x) === n(sr[i]!.x) && n(p.y) === n(sr[i]!.y));
    const col = settings.convention === 'column';
    const half = { rs, sr: s.pts, rsM, srM, same };
    yield {
      state: s,
      marks: [mark('rs', 'active')],
      say: `Rotate by ${n(deg)}°, then scale by (${n(sx)}, ${n(sy)}). ${col ? 'With column vectors the first move sits on the right: S·R' : 'With row vectors the first move sits on the left: R·S'} = ${matText(rsM, settings)}.`,
      lines: ['ord.rs'],
      vars: vars(s, settings, { 'rotate, then scale': matText(rsM, settings) }),
      level: 2,
      extra: { compare: { ...half, sr: [] } },
    } satisfies RStep;
    yield {
      state: s,
      marks: [mark('rs', 'active'), mark('sr', 'error')],
      say: `Now the other order: scale first, then rotate. ${col ? 'R·S' : 'S·R'} = ${matText(srM, settings)}.`,
      lines: ['ord.sr'],
      vars: vars(s, settings, {
        'rotate, then scale': matText(rsM, settings),
        'scale, then rotate': matText(srM, settings),
      }),
      level: 2,
      extra: { compare: { rs, sr, rsM, srM, same } },
    } satisfies RStep;
    yield {
      state: s,
      marks: [mark('rs', same ? 'found' : 'active'), mark('sr', same ? 'found' : 'error')],
      say: same
        ? `The two orders give the same shape. ${sx === sy ? 'A uniform scale looks the same in every direction, so it does not matter whether the rotation comes first.' : deg % 180 === 0 ? 'Here the rotation is a multiple of 180°, so the stretch directions line up either way.' : 'At least to two decimals: the angle is so small that the difference does not show.'}`
        : `Different shapes: matrix multiplication is not commutative. Rotating first stretches the turned shape along the world's x and y; scaling first stretches it along its own axes, then turns it.`,
      lines: ['ord.cmp'],
      vars: vars(s, settings, {
        'rotate, then scale': matText(rsM, settings),
        'scale, then rotate': matText(srM, settings),
        same: same ? 'yes' : 'no',
      }),
      level: 1,
      extra: { compare: { rs, sr, rsM, srM, same } },
    } satisfies RStep;
    return s;
  },
};

const reset: Op = {
  label: 'Reset',
  arity: 0,
  *run(s, _args, { settings }) {
    const end: S = { ...init(settings), pivot: s.pivot };
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

export const ops = { rotate, scale, order, pivot, reset };

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: RsSettings): PseudoBlock[] {
  const col = settings.convention === 'column';
  const piv = settings.about === 'pivot';
  const applyText = col ? "p' = M p" : "p' = p M";
  const block = (op: string, prefix: string, sig: string, m: string, mPlain: string) => ({
    op,
    lines: [
      L(
        `${prefix}.sig`,
        0,
        sig,
        op === 'rotate' ? 'To rotate the shape by θ:' : 'To scale the shape:',
      ),
      L(`${prefix}.m`, 1, m, mPlain),
      ...(piv
        ? [
            L(
              `${prefix}.shift`,
              1,
              'for each vertex p: p = p − c',
              'Slide the shape so the pivot c is at the origin.',
            ),
          ]
        : []),
      L(
        `${prefix}.apply`,
        1,
        `for each vertex p: ${applyText.replace('M', op === 'rotate' ? 'R' : 'S')}`,
        op === 'rotate' ? 'Turn every vertex.' : 'Stretch every vertex.',
      ),
      ...(piv ? [L(`${prefix}.back`, 1, 'for each vertex p: p = p + c', 'Slide back.')] : []),
    ],
  });
  return [
    block(
      'rotate',
      'rot',
      'ROTATE(θ)',
      col ? 'R = [cos θ  −sin θ; sin θ  cos θ]' : 'R = [cos θ  sin θ; −sin θ  cos θ]',
      'Build the rotation matrix; its columns are where e₁ and e₂ go.',
    ),
    block(
      'scale',
      'scl',
      'SCALE(sx, sy)',
      'S = [sx  0; 0  sy]',
      'Build the scaling matrix: x times sx, y times sy.',
    ),
    {
      op: 'order',
      lines: [
        L('ord.sig', 0, 'COMPARE(θ, sx, sy)', 'To see whether the order matters:'),
        L(
          'ord.rs',
          1,
          col
            ? 'A = S R    (rotate first: R is applied first, on the right)'
            : 'A = R S    (rotate first: R is applied first, on the left)',
          'Combine rotate-then-scale into one matrix.',
        ),
        L('ord.sr', 1, col ? 'B = R S' : 'B = S R', 'Combine scale-then-rotate.'),
        L('ord.cmp', 1, 'return A == B', 'Compare the two results.'),
      ],
    },
    {
      op: 'pivot',
      lines: [
        L('piv.sig', 0, 'PIVOT(x, y)', 'To choose the point to turn about:'),
        L('piv.set', 1, 'c = (x, y)', 'Remember it as c.'),
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

export function initialSay(_s: S, settings: RsSettings): string {
  return `A shape and the basis vectors e₁ = (1, 0) and e₂ = (0, 1). Type an angle such as 30 and press Rotate, or two factors such as 2 1 and press Scale.${settings.about === 'pivot' ? ' They turn about the pivot point.' : ''}`;
}

export function initialVars(s: S, settings: RsSettings) {
  return vars(s, settings);
}

export function describe(s: S): string {
  return `A shape with ${s.pts.length} vertices: ${s.pts.map((p) => fmtVec(p)).join(', ')}. M = [${n(s.m[0])} ${n(s.m[1])}; ${n(s.m[2])} ${n(s.m[3])}].`;
}

/** Two decimals, rounded half up, the same way as the code tabs. Never "-0.00". */
export function fixed2(x: number): string {
  const r = Math.floor(x * 100 + 0.5);
  const a = Math.abs(r);
  return `${r < 0 ? '-' : ''}${Math.floor(a / 100)}.${String(a % 100).padStart(2, '0')}`;
}
