import type { Mark, OpSpec, PseudoBlock, Scalar, Step, Value } from '../../engine/types';
import { fmtNum, fmtVec, type Vec } from '../../layouts/plane';
import { IDENTITY3, matMul3, type Mat3 } from '../../layouts/space';

/** The drawing shows -R to R; motions that would push a vertex further are refused. */
export const R = 10;

export type ShapeName = 'letter' | 'house';

/**
 * A rigid motion as one 3×3 homogeneous matrix on (x, y, 1), row-major:
 * [cos −sin tx; sin cos ty; 0 0 1]. The shape is always the motion applied to the start shape.
 */
export interface RtState {
  base: Vec[];
  m: Mat3;
  pts: Vec[];
  transforms: number;
  mults: number;
}

export interface RtSettings {
  [key: string]: Scalar;
  /** homogeneous: one 3×3 matrix. affine: a 2×2 rotation R plus an offset t. */
  form: 'homogeneous' | 'affine';
  /** column: p' = M p. row: p' = p M (every matrix transposed). */
  convention: 'column' | 'row';
  shape: ShapeName;
}

export interface RtExtra {
  /** The matrix of the operation in progress, and its name. */
  op?: { name: string; m: Mat3 };
  /** Draw the translation vector t from the origin. */
  t?: Vec;
  /** A point to rotate about. */
  c?: Vec;
  /** An in-between shape (about a point: after sliding c to the origin, after rotating). */
  ghost?: Vec[];
  /** Both orders from the same shape. */
  compare?: { rt: Vec[]; tr: Vec[]; rtM: Mat3; trM: Mat3; same: boolean };
}

type S = RtState;
type X = RtExtra;
type Op = OpSpec<S, RtSettings, X>;
type RStep = Step<S, X>;

const pts = (xs: number[][]) => xs.map(([x, y]) => ({ x: x!, y: y! }));

export const SHAPES: Record<ShapeName, Vec[]> = {
  letter: pts([
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
  ]),
  house: pts([
    [1, 1],
    [4, 1],
    [4, 3],
    [2.5, 4.5],
    [1, 3],
  ]),
};

export const defaults: RtSettings = { form: 'homogeneous', convention: 'column', shape: 'letter' };

/** p' = M p on (x, y, 1), the same arithmetic as the code tabs. */
export const applyH = (m: Mat3, p: Vec): Vec => ({
  x: m[0] * p.x + m[1] * p.y + m[2],
  y: m[3] * p.x + m[4] * p.y + m[5],
});

const rad = (deg: number) => (deg * Math.PI) / 180;

export function rotation(deg: number): Mat3 {
  const c = Math.cos(rad(deg));
  const s = Math.sin(rad(deg));
  return [c, -s, 0, s, c, 0, 0, 0, 1];
}

export const translation = (tx: number, ty: number): Mat3 => [1, 0, tx, 0, 1, ty, 0, 0, 1];

/** The inverse of a rigid motion: [Rᵀ  −Rᵀt; 0 0 1]. No division needed. */
export function rigidInverse(m: Mat3): Mat3 {
  return [
    m[0],
    m[3],
    -(m[0] * m[2] + m[3] * m[5]),
    m[1],
    m[4],
    -(m[1] * m[2] + m[4] * m[5]),
    0,
    0,
    1,
  ];
}

/** Rotation about c: T(c) · (R · T(−c)), multiplied in that order, as in the code tabs. */
export const aboutMatrix = (deg: number, c: Vec): Mat3 =>
  matMul3(translation(c.x, c.y), matMul3(rotation(deg), translation(-c.x, -c.y)));

export function init(settings: RtSettings): S {
  const base = SHAPES[settings.shape] ?? SHAPES.letter;
  return { base, m: IDENTITY3, pts: base, transforms: 0, mults: 0 };
}

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });
const n = fmtNum;

/** The angle of the motion's rotation, in degrees from −180 to 180. */
export const angleOf = (m: Mat3) => (Math.atan2(m[3], m[0]) * 180) / Math.PI;
export const offsetOf = (m: Mat3): Vec => ({ x: m[2], y: m[5] });

/** A 3×3 matrix as text rows in the page's convention (row vectors see the transpose). */
export function mat3RowsFor(m: Mat3, settings: RtSettings): string[][] {
  const row = settings.convention === 'row';
  return [0, 1, 2].map((i) => [0, 1, 2].map((j) => n(row ? m[j * 3 + i]! : m[i * 3 + j]!)));
}

/** The 2×2 rotation part as text rows. */
export function rotRowsFor(m: Mat3, settings: RtSettings): string[][] {
  return mat3RowsFor(m, settings)
    .slice(0, 2)
    .map((r) => r.slice(0, 2));
}

export function matText(m: Mat3, settings: RtSettings): string {
  if (settings.form === 'affine')
    return `R = [${rotRowsFor(m, settings)
      .map((r) => r.join(' '))
      .join('; ')}], t = ${fmtVec(offsetOf(m))}`;
  return `[${mat3RowsFor(m, settings)
    .map((r) => r.join(' '))
    .join('; ')}]`;
}

function vars(s: S, settings: RtSettings, more: Record<string, Scalar> = {}) {
  return {
    ...more,
    M: matText(s.m, settings),
    'angle θ': `${n(angleOf(s.m))}°`,
    't (where the origin goes)': fmtVec(offsetOf(s.m)),
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

export const fits = (ps: Vec[]) =>
  ps.every((p) => Math.abs(p.x) <= R + 1e-9 && Math.abs(p.y) <= R + 1e-9);

function* bad(s: S, settings: RtSettings, say: string): Generator<RStep, S, void> {
  yield { state: s, marks: [], say, lines: [], vars: vars(s, settings), level: 1 };
  return s;
}

/** Compose a motion A onto the running matrix: column vectors write M = A·M. */
function compose(s: S, a: Mat3): S {
  const m = matMul3(a, s.m);
  return {
    ...s,
    m,
    pts: s.base.map((p) => applyH(m, p)),
    transforms: s.transforms + 1,
    mults: s.mults + 27 + 4 * s.base.length,
  };
}

/** " = " before a 3×3 matrix; ": " before "R = …, t = …", which already has its own "=". */
const is = (settings: RtSettings) => (settings.form === 'affine' ? ': ' : ' = ');

const composeText = (name: string, settings: RtSettings) =>
  settings.convention === 'row' ? `M = M·${name}` : `M = ${name}·M`;

function* offDrawing(s: S, settings: RtSettings, say: string, line: string, op: X['op']) {
  yield {
    state: s,
    marks: [mark('sh', 'error')],
    say: `${say} That would move the shape off the drawing (beyond ±${R}), so it is not applied. Press Reset to start again.`,
    lines: [line],
    vars: vars(s, settings),
    level: 1,
    extra: { op },
  } satisfies RStep;
  return s;
}

const rotate: Op = {
  label: 'Rotate',
  arity: 1,
  *run(s, [va], { settings }) {
    const deg = numArg(va, -360, 360);
    if (deg === null)
      return yield* bad(s, settings, 'rotate: type an angle in degrees, such as 90.');
    const a = rotation(deg);
    const op = { name: 'R', m: a };
    const intro = `Rotate by ${n(deg)}° ${deg >= 0 ? 'counter-clockwise' : 'clockwise'} about the origin.`;
    const end = compose(s, a);
    if (!fits(end.pts)) return yield* offDrawing(s, settings, intro, 'rot.m', op);
    yield {
      state: s,
      marks: [mark('op-name', 'active')],
      say: `${intro} ${settings.form === 'homogeneous' ? 'In the 3×3 form, R has the 2×2 rotation in its top-left corner and 0, 0, 1 around it: it moves nothing but angles.' : 'R = [cos θ −sin θ; sin θ cos θ].'}`,
      lines: ['rot.m'],
      vars: vars(s, settings, { R: matText(a, settings) }),
      level: 2,
      extra: { op },
    } satisfies RStep;
    yield {
      state: end,
      marks: [mark('sh', 'active'), mark('m1', 'active'), mark('m2', 'active')],
      say: `Every vertex turns about the origin, so the whole shape swings around it${s.m[2] || s.m[5] ? ', and so does the offset t' : ''}. Lengths and angles stay the same. ${composeText('R', settings)}${is(settings)}${matText(end.m, settings)}.`,
      lines: ['rot.apply'],
      vars: vars(end, settings),
      level: 1,
    } satisfies RStep;
    return end;
  },
};

const translate: Op = {
  label: 'Translate',
  arity: 2,
  *run(s, [vx, vy], { settings }) {
    const tx = numArg(vx, -2 * R, 2 * R);
    const ty = numArg(vy, -2 * R, 2 * R);
    if (tx === null || ty === null)
      return yield* bad(s, settings, 'translate: type tx and ty, such as 3 1.');
    const a = translation(tx, ty);
    const op = { name: 'T', m: a };
    const t = { x: tx, y: ty };
    const intro = `Translate by t = ${fmtVec(t)}.`;
    const end = compose(s, a);
    if (!fits(end.pts)) return yield* offDrawing(s, settings, intro, 'trn.m', op);
    yield {
      state: s,
      marks: [mark('tv', 'active')],
      say: `${intro} ${settings.form === 'homogeneous' ? 'A slide is not linear (it moves the origin), so no 2×2 matrix can do it. On (x, y, 1) it can: T puts tx and ty in the last column, and the 1 picks them up.' : 'Add t to every vertex.'}`,
      lines: ['trn.m'],
      vars: vars(s, settings, { T: matText(a, settings) }),
      level: 2,
      extra: { op, t },
    } satisfies RStep;
    yield {
      state: end,
      marks: [mark('sh', 'active')],
      say: `Every vertex moves by the same ${fmtVec(t)}. Nothing turns. ${composeText('T', settings)}${is(settings)}${matText(end.m, settings)}.`,
      lines: ['trn.apply'],
      vars: vars(end, settings),
      level: 1,
    } satisfies RStep;
    return end;
  },
};

const about: Op = {
  label: 'Rotate about a point',
  arity: 3,
  *run(s, [va, vx, vy], { settings }) {
    const deg = numArg(va, -360, 360);
    const cx = numArg(vx, -R, R);
    const cy = numArg(vy, -R, R);
    if (deg === null || cx === null || cy === null)
      return yield* bad(
        s,
        settings,
        `about: type an angle and the point c, such as 90 2 1 (c from −${R} to ${R}).`,
      );
    const c = { x: cx, y: cy };
    const a = aboutMatrix(deg, c);
    const op = { name: 'A', m: a };
    const intro = `Rotate by ${n(deg)}° about c = ${fmtVec(c)}.`;
    const end = compose(s, a);
    if (!fits(end.pts)) return yield* offDrawing(s, settings, intro, 'abt.m', op);
    const shifted = s.pts.map((p) => ({ x: p.x - c.x, y: p.y - c.y }));
    const turned = shifted.map((p) => applyH(rotation(deg), p));
    yield {
      state: s,
      marks: [mark('c', 'active')],
      say: `${intro} Rotation matrices turn about the origin, so first slide c to the origin: T(−c) moves every vertex by −${fmtVec(c)}.`,
      lines: ['abt.shift'],
      vars: vars(s, settings),
      level: 2,
      extra: { c, ghost: shifted },
    } satisfies RStep;
    yield {
      state: s,
      marks: [mark('c', 'active'), mark('ghost', 'active')],
      say: `Now rotate by ${n(deg)}° about the origin, which is where c sits for the moment.`,
      lines: ['abt.rot'],
      vars: vars(s, settings),
      level: 2,
      extra: { c, ghost: turned },
    } satisfies RStep;
    yield {
      state: s,
      marks: [mark('op-name', 'active')],
      say: `Slide back by +${fmtVec(c)}. The three moves multiply into one matrix: A = T(c)·R·T(−c)${is(settings)}${matText(a, settings)}. ${settings.form === 'affine' ? 'Its offset t' : 'Its last column'} is not c: it is where A sends the origin.`,
      lines: ['abt.back', 'abt.m'],
      vars: vars(s, settings, { A: matText(a, settings) }),
      level: 2,
      extra: { c, ghost: turned, op },
    } satisfies RStep;
    yield {
      state: end,
      marks: [mark('sh', 'active'), mark('c', 'found')],
      say: `Done: the shape turned about c, and c itself did not move. ${composeText('A', settings)}${is(settings)}${matText(end.m, settings)}.`,
      lines: ['abt.apply'],
      vars: vars(end, settings),
      level: 1,
      extra: { c },
    } satisfies RStep;
    return end;
  },
};

/** Whether two point lists read the same to two decimals. */
const sameShape = (a: Vec[], b: Vec[]) =>
  a.every((p, i) => n(p.x) === n(b[i]!.x) && n(p.y) === n(b[i]!.y));

const order: Op = {
  label: 'Compare orders',
  arity: 3,
  *run(s, [va, vx, vy], { settings }) {
    const deg = numArg(va, -360, 360);
    const tx = numArg(vx, -2 * R, 2 * R);
    const ty = numArg(vy, -2 * R, 2 * R);
    if (deg === null || tx === null || ty === null)
      return yield* bad(s, settings, 'order: type an angle and a translation, such as 90 4 0.');
    const r = rotation(deg);
    const t = translation(tx, ty);
    const rtM = matMul3(t, matMul3(r, s.m));
    const trM = matMul3(r, matMul3(t, s.m));
    const rt = s.base.map((p) => applyH(rtM, p));
    const tr = s.base.map((p) => applyH(trM, p));
    const same = sameShape(rt, tr);
    const col = settings.convention === 'column';
    yield {
      state: s,
      marks: [mark('rt', 'active')],
      say: `Rotate by ${n(deg)}°, then translate by (${n(tx)}, ${n(ty)}). ${col ? 'With column vectors the first move sits on the right: T·R' : 'With row vectors the first move sits on the left: R·T'}. The rotation turns the shape about the origin, then the slide carries it off.`,
      lines: ['ord.rt'],
      vars: vars(s, settings, { 'rotate, then translate': matText(matMul3(t, r), settings) }),
      level: 2,
      extra: { compare: { rt, tr: [], rtM, trM, same } },
    } satisfies RStep;
    yield {
      state: s,
      marks: [mark('rt', 'active'), mark('tr', 'error')],
      say: `Now translate first, then rotate: ${col ? 'R·T' : 'T·R'}. The slide happens first, and then the rotation swings the moved shape, slide and all, about the origin.`,
      lines: ['ord.tr'],
      vars: vars(s, settings, {
        'rotate, then translate': matText(matMul3(t, r), settings),
        'translate, then rotate': matText(matMul3(r, t), settings),
      }),
      level: 2,
      extra: { compare: { rt, tr, rtM, trM, same } },
    } satisfies RStep;
    const turnedT = applyH(r, { x: tx, y: ty });
    yield {
      state: s,
      marks: [mark('rt', same ? 'found' : 'active'), mark('tr', same ? 'found' : 'error')],
      say: same
        ? `The two orders agree here. ${tx === 0 && ty === 0 ? 'A zero slide moves nothing, so there is nothing for the rotation to turn.' : deg % 360 === 0 ? 'The rotation is a whole number of turns, so it leaves the slide alone.' : `At least to two decimals: R t = ${fmtVec(turnedT)} is so close to t that the difference does not show.`}`
        : `Different places. Both are turned by ${n(deg)}°, but translate-then-rotate also turns the slide: it moves by R t = ${fmtVec(turnedT)} instead of t = (${n(tx)}, ${n(ty)}).`,
      lines: ['ord.cmp'],
      vars: vars(s, settings, {
        'rotate, then translate': matText(matMul3(t, r), settings),
        'translate, then rotate': matText(matMul3(r, t), settings),
        same: same ? 'yes' : 'no',
      }),
      level: 1,
      extra: { compare: { rt, tr, rtM, trM, same } },
    } satisfies RStep;
    return s;
  },
};

const invert: Op = {
  label: 'Undo all (inverse)',
  arity: 0,
  *run(s, _args, { settings }) {
    const inv = rigidInverse(s.m);
    const op = { name: 'M⁻¹', m: inv };
    const t = offsetOf(s.m);
    yield {
      state: s,
      marks: [mark('op-name', 'active')],
      say: `To undo p' = R p + t, solve for p: p = Rᵀ (p' − t) = Rᵀ p' − Rᵀ t. A rotation's inverse is its transpose, so no division is needed: M⁻¹${is(settings)}${matText(inv, settings)}${t.x || t.y ? `, whose offset is −Rᵀ t = ${fmtVec(offsetOf(inv))}, not just −t` : ''}.`,
      lines: ['inv.m'],
      vars: vars(s, settings, { 'M⁻¹': matText(inv, settings) }),
      level: 2,
      extra: { op },
    } satisfies RStep;
    const end = compose(s, inv);
    yield {
      state: end,
      marks: [mark('sh', 'found')],
      say: `Apply M⁻¹ and every vertex is back where it started: M⁻¹·M = I (up to rounding: ${matText(end.m, settings)}).`,
      lines: ['inv.apply'],
      vars: vars(end, settings),
      level: 1,
    } satisfies RStep;
    return end;
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

export const ops = { rotate, translate, about, order, invert, reset };

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: RtSettings): PseudoBlock[] {
  const col = settings.convention === 'column';
  const homo = settings.form === 'homogeneous';
  const apply = (name: string) =>
    homo
      ? col
        ? `for each vertex p: (p, 1) = ${name} (p, 1);  M = ${name} M`
        : `for each vertex p: (p, 1) = (p, 1) ${name};  M = M ${name}`
      : `for each vertex p: p = ${name === 'T' ? 'p + t' : col ? 'R p' : 'p R'}`;
  const R3 = col
    ? 'R = [cos θ  −sin θ  0; sin θ  cos θ  0; 0  0  1]'
    : 'R = [cos θ  sin θ  0; −sin θ  cos θ  0; 0  0  1]';
  const R2 = col ? 'R = [cos θ  −sin θ; sin θ  cos θ]' : 'R = [cos θ  sin θ; −sin θ  cos θ]';
  const T3 = col ? 'T = [1  0  tx; 0  1  ty; 0  0  1]' : 'T = [1  0  0; 0  1  0; tx  ty  1]';
  return [
    {
      op: 'rotate',
      lines: [
        L('rot.sig', 0, 'ROTATE(θ)', 'To turn the shape about the origin:'),
        L('rot.m', 1, homo ? R3 : R2, 'Build the rotation matrix.'),
        L('rot.apply', 1, apply('R'), 'Turn every vertex.'),
      ],
    },
    {
      op: 'translate',
      lines: [
        L('trn.sig', 0, 'TRANSLATE(tx, ty)', 'To slide the shape:'),
        L(
          'trn.m',
          1,
          homo ? T3 : 't = (tx, ty)',
          homo
            ? 'Put the slide in the last column (row, for row vectors).'
            : 'The slide is a vector.',
        ),
        L('trn.apply', 1, apply('T'), 'Move every vertex by the same amount.'),
      ],
    },
    {
      op: 'about',
      lines: [
        L('abt.sig', 0, 'ROTATE-ABOUT(θ, c)', 'To turn the shape about the point c:'),
        L('abt.shift', 1, 'T(−c): p = p − c', 'Slide c to the origin.'),
        L('abt.rot', 1, homo ? 'R: p = R p' : 'p = R p', 'Turn about the origin.'),
        L('abt.back', 1, 'T(c): p = p + c', 'Slide back.'),
        L(
          'abt.m',
          1,
          homo
            ? col
              ? 'A = T(c) R T(−c)'
              : 'A = T(−c) R T(c)'
            : 'A: p = R (p − c) + c = R p + (c − R c)',
          'All three moves are one rigid motion.',
        ),
        L('abt.apply', 1, apply('A'), 'Apply it to every vertex.'),
      ],
    },
    {
      op: 'order',
      lines: [
        L('ord.sig', 0, 'COMPARE(θ, tx, ty)', 'To see whether the order matters:'),
        L(
          'ord.rt',
          1,
          homo
            ? col
              ? 'A = T R    (rotate first)'
              : 'A = R T    (rotate first)'
            : 'A: p = R p + t',
          'Rotate, then translate.',
        ),
        L(
          'ord.tr',
          1,
          homo
            ? col
              ? 'B = R T    (translate first)'
              : 'B = T R    (translate first)'
            : 'B: p = R (p + t) = R p + R t',
          'Translate, then rotate.',
        ),
        L('ord.cmp', 1, 'return A == B', 'Compare the two results.'),
      ],
    },
    {
      op: 'invert',
      lines: [
        L('inv.sig', 0, 'INVERT()', 'To undo every motion so far:'),
        L(
          'inv.m',
          1,
          homo
            ? col
              ? 'M⁻¹ = [Rᵀ  −Rᵀ t; 0  0  1]'
              : 'M⁻¹ = [Rᵀ  0; −t Rᵀ  1]'
            : "p = Rᵀ (p' − t)",
          'Undo the slide, then turn back with the transpose: no division.',
        ),
        L(
          'inv.apply',
          1,
          homo ? apply('M⁻¹') : 'for each vertex p: apply the line above',
          'Every vertex goes home.',
        ),
      ],
    },
    {
      op: 'reset',
      lines: [
        L('rst.sig', 0, 'RESET()', 'To start over:'),
        L('rst.id', 1, 'M = I; restore the shape', 'Forget every motion.'),
      ],
    },
  ];
}

export function initialSay(): string {
  return 'A shape and the world axes. Rotations and translations move it without changing its size or shape: rigid motions. Type an angle such as 90 and press Rotate, or a vector such as 3 1 and press Translate.';
}

export function initialVars(s: S, settings: RtSettings) {
  return vars(s, settings);
}

export function describe(s: S): string {
  return `A shape with ${s.pts.length} vertices: ${s.pts.map((p) => fmtVec(p)).join(', ')}. Turned by ${n(angleOf(s.m))}° and moved by ${fmtVec(offsetOf(s.m))}.`;
}

/** Two decimals, rounded half up, the same way as the code tabs. Never "-0.00". */
export function fixed2(x: number): string {
  const r = Math.floor(x * 100 + 0.5);
  const a = Math.abs(r);
  return `${r < 0 ? '-' : ''}${Math.floor(a / 100)}.${String(a % 100).padStart(2, '0')}`;
}
