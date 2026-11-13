/**
 * Gradient descent on a curve of one variable or a surface of two: work out the gradient, step
 * against it, repeat. With a learning rate that is too small the steps crawl; just right, they
 * converge; too large, they overshoot and diverge. Momentum keeps a velocity that builds up
 * along a valley and damps the zigzag across it; Adam (Kingma and Ba 2015) divides each
 * coordinate's step by a running size of its gradients, with bias correction.
 *
 *   plain       x ← x − η·g
 *   momentum    v ← β·v − η·g;  x ← x + v                      (Polyak's heavy ball)
 *   Adam        m ← β₁·m + (1 − β₁)·g;  s ← β₂·s + (1 − β₂)·g²
 *               m̂ = m/(1 − β₁ᵗ);  ŝ = s/(1 − β₂ᵗ)             (bias correction)
 *               x ← x − η·m̂/(√ŝ + ε),  ε = 10⁻⁸
 *
 * β₁ᵗ and β₂ᵗ are kept as running products, as the code tabs do, so all four agree.
 *
 * Operations: start (a point, or the surface's own start), step (one step) and run (up to 50,
 * stopping when the run converges or diverges). Converged: the gradient and the last step are
 * both shorter than 0.01. Diverged: the point is four times the plot's reach away.
 */
import type { Mark, OpSpec, PseudoBlock, Scalar, Step } from '../../engine/types';
import { far, SURFACES, type Surface, type SurfaceId } from './surfaces';

export type Method = 'gd' | 'momentum' | 'adam';

export interface GdSettings {
  [key: string]: Scalar;
  surface: SurfaceId;
  method: Method;
  lr: string;
  beta1: string;
  beta2: string;
  bias: boolean;
}

export const defaults: GdSettings = {
  surface: 'bowl',
  method: 'gd',
  lr: '0.1',
  beta1: '0.9',
  beta2: '0.999',
  bias: true,
};

export const LEARNING_RATES = [
  '0.01',
  '0.05',
  '0.1',
  '0.15',
  '0.19',
  '0.21',
  '0.3',
  '0.5',
  '0.9',
  '1',
  '1.1',
];
export const BETA1 = ['0', '0.5', '0.9', '0.99'];
export const BETA2 = ['0.9', '0.99', '0.999'];
export const EPS = 1e-8;
export const RUN_STEPS = 50;
export const MAX_STEPS = 200;
export const TOL = 0.01;

export type Status = 'ready' | 'converged' | 'diverged';

export interface GdState {
  surface: SurfaceId;
  x: number[];
  /** Every point so far, the current one last. */
  path: number[][];
  t: number;
  /** Momentum's velocity, or Adam's first moment. */
  m: number[];
  /** Adam's second moment. */
  s: number[];
  /** β₁ᵗ and β₂ᵗ. */
  b1t: number;
  b2t: number;
  status: Status;
}

/** What a step in the middle of an update shows. */
export interface GdExtra {
  /** The gradient at the current point. */
  grad?: number[];
  /** Where the update is about to move the point. */
  to?: number[];
  /** Adam's bias-corrected moments. */
  mhat?: number[];
  shat?: number[];
}

type S = GdState;
type X = GdExtra;
type Op = OpSpec<S, GdSettings, X>;
type GStep = Step<S, X>;

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });

export const surfaceOf = (s: S | GdSettings): Surface => SURFACES[s.surface];

/** At most two decimals, trailing zeros dropped, a real minus sign; three when two read as 0. */
export function num(x: number): string {
  const r = Math.round(x * 100) / 100;
  if (r === 0 && x !== 0 && Math.abs(x) >= 0.0005) {
    const t = Math.round(x * 1000) / 1000;
    return t < 0 ? `−${-t}` : String(t);
  }
  if (r === 0) return '0';
  return r < 0 ? `−${-r}` : String(r);
}

/** A value of f: "almost 0" rather than a bare 0 that is not quite 0. */
const fval = (f: number) => (num(f) === '0' && f !== 0 ? 'almost 0' : num(f));

/** A number as the second operand of + or ×: negatives in brackets. */
export const par = (x: number): string => (x < 0 && num(x) !== '0' ? `(${num(x)})` : num(x));

export const pt = (p: readonly number[]) =>
  p.length === 1 ? num(p[0]!) : `(${p.map(num).join(', ')})`;
const norm = (v: readonly number[]) => Math.sqrt(v.reduce((t, x) => t + x * x, 0));

export function fresh(surface: SurfaceId, x: number[]): S {
  return {
    surface,
    x,
    path: [x],
    t: 0,
    m: x.map(() => 0),
    s: x.map(() => 0),
    b1t: 1,
    b2t: 1,
    status: 'ready',
  };
}

export function init(settings: GdSettings): S {
  const sf = SURFACES[settings.surface] ?? SURFACES.bowl;
  return fresh(sf.id, [...sf.start]);
}

export interface Update {
  g: number[];
  m: number[];
  s: number[];
  b1t: number;
  b2t: number;
  mhat: number[];
  shat: number[];
  x: number[];
}

/** One update, in the code tabs' order. */
export function update(st: S, settings: GdSettings): Update {
  const sf = surfaceOf(st);
  const lr = Number(settings.lr);
  const b1 = Number(settings.beta1);
  const b2 = Number(settings.beta2);
  const g = sf.grad(st.x);
  if (settings.method === 'gd')
    return {
      g,
      m: st.m,
      s: st.s,
      b1t: st.b1t,
      b2t: st.b2t,
      mhat: [],
      shat: [],
      x: st.x.map((xi, i) => xi - lr * g[i]!),
    };
  if (settings.method === 'momentum') {
    const m = st.m.map((mi, i) => b1 * mi - lr * g[i]!);
    return {
      g,
      m,
      s: st.s,
      b1t: st.b1t,
      b2t: st.b2t,
      mhat: [],
      shat: [],
      x: st.x.map((xi, i) => xi + m[i]!),
    };
  }
  const b1t = st.b1t * b1;
  const b2t = st.b2t * b2;
  const m = st.m.map((mi, i) => b1 * mi + (1 - b1) * g[i]!);
  const s = st.s.map((si, i) => b2 * si + (1 - b2) * g[i]! * g[i]!);
  const mhat = m.map((mi) => (settings.bias ? mi / (1 - b1t) : mi));
  const shat = s.map((si) => (settings.bias ? si / (1 - b2t) : si));
  const x = st.x.map((xi, i) => xi - (lr * mhat[i]!) / (Math.sqrt(shat[i]!) + EPS));
  return { g, m, s, b1t, b2t, mhat, shat, x };
}

/** Three decimals, as a number for the readouts (−0 reads 0). */
const r3 = (x: number) => Math.round(x * 1000) / 1000 || 0;

export function baseVars(st: S, settings: GdSettings): Record<string, Scalar> {
  const sf = surfaceOf(st);
  const out: Record<string, Scalar> = { t: st.t, x: r3(st.x[0]!) };
  if (sf.dims === 2) out.y = r3(st.x[1]!);
  out.f = r3(sf.f(st.x));
  out['|∇f|'] = r3(norm(sf.grad(st.x)));
  if (settings.method === 'momentum')
    if (sf.dims === 1) out.v = r3(st.m[0]!);
    else out['|v|'] = r3(norm(st.m));
  if (settings.method === 'adam' && sf.dims === 1) {
    out.m = r3(st.m[0]!);
    out.s = r3(st.s[0]!);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Steps

const vecText = (v: readonly number[]) => (v.length === 1 ? num(v[0]!) : pt(v));

/** The steps of one update: the gradient and (for momentum and Adam) the moments at `fine`, then the move. */
function* updateSteps(st: S, settings: GdSettings, fine: 2 | 3): Generator<GStep, S, void> {
  const sf = surfaceOf(st);
  const u = update(st, settings);
  const lr = Number(settings.lr);
  const b1 = settings.beta1;
  const b2 = settings.beta2;
  const one = sf.dims === 1;
  const g = vecText(u.g);
  const vars = baseVars(st, settings);
  const here = one ? `x = ${num(st.x[0]!)}` : `${pt(st.x)}`;
  const slope = one
    ? `At ${here}, the slope is ${sf.gradText} = ${g}${u.g[0]! > 0 ? ': uphill to the right, so downhill is to the left' : u.g[0]! < 0 ? ': uphill to the left, so downhill is to the right' : ''}.`
    : `At ${here}, the gradient is ${sf.gradText} = ${g}, pointing uphill; the step goes against it.`;
  const plainStep =
    settings.method === 'gd'
      ? ` The step is −η·${one ? 'f′' : '∇f'} = −${lr} × ${one ? par(u.g[0]!) : g} = ${vecText(u.x.map((xi, i) => xi - st.x[i]!))}.`
      : '';
  yield {
    state: st,
    marks: [mark('now', 'active'), mark('grad', 'compare')],
    say: slope + plainStep,
    lines: ['grad'],
    level: fine,
    vars,
    extra: { grad: u.g, to: settings.method === 'gd' ? u.x : undefined },
  };
  if (settings.method === 'momentum') {
    yield {
      state: st,
      marks: [mark('now', 'active'), mark('next', 'active')],
      say: `Velocity: v = β·v − η·${one ? 'f′' : '∇f'} = ${b1} × ${one ? par(st.m[0]!) : vecText(st.m)} − ${lr} × ${one ? par(u.g[0]!) : g} = ${vecText(u.m)}. The old velocity carries on, and the slope adds to it.`,
      lines: ['vel'],
      level: fine,
      vars,
      extra: { grad: u.g, to: u.x },
    };
  }
  if (settings.method === 'adam') {
    const t = st.t + 1;
    const corr = settings.bias
      ? ` Bias correction divides by 1 − β₁ᵗ = ${num(1 - u.b1t)} and 1 − β₂ᵗ = ${num(1 - u.b2t)} (t = ${t}), because both averages start at 0: m̂ = ${vecText(u.mhat)}, ŝ = ${vecText(u.shat)}.`
      : ` No bias correction: the averages started at 0, so early on they are too small.`;
    yield {
      state: st,
      marks: [mark('now', 'active'), mark('grad', 'compare')],
      say: `Adam keeps two running averages: m = ${b1}·m + (1 − ${b1})·g = ${vecText(u.m)}, the gradient, and s = ${b2}·s + (1 − ${b2})·g² = ${vecText(u.s)}, its square.${corr}`,
      lines: ['m', 's', ...(settings.bias ? ['hat'] : [])],
      level: fine,
      vars,
      extra: { grad: u.g, mhat: u.mhat, shat: u.shat, to: u.x },
    };
  }
  const next: S = {
    ...st,
    x: u.x,
    path: [...st.path, u.x],
    t: st.t + 1,
    m: settings.method === 'gd' ? st.m : u.m,
    s: settings.method === 'adam' ? u.s : st.s,
    b1t: settings.method === 'adam' ? u.b1t : st.b1t,
    b2t: settings.method === 'adam' ? u.b2t : st.b2t,
    status: 'ready',
  };
  const moved = u.x.map((xi, i) => xi - st.x[i]!);
  if (far(sf, u.x)) next.status = 'diverged';
  else if (norm(sf.grad(u.x)) < TOL && norm(moved) < TOL) next.status = 'converged';
  const f0 = sf.f(st.x);
  const f1 = sf.f(u.x);
  let adamStep = '';
  if (settings.method === 'adam') {
    const sizes = moved.map(Math.abs);
    adamStep = ` The step is −η·m̂/(√ŝ + ε) = ${vecText(moved)}`;
    if (sizes.every((d) => d > 0.8 * lr && d < 1.2 * lr))
      adamStep += ': about η in each coordinate, whatever the gradient’s size.';
    else if (!settings.bias && sizes.some((d) => d > 1.2 * lr))
      adamStep += `: bigger than η = ${lr}. Without bias correction s is still close to its start at 0, and dividing by its small square root blows the step up.`;
    else adamStep += '.';
  }
  const where = one ? `x = ${num(u.x[0]!)}` : `${pt(u.x)}`;
  let say = `Step ${next.t}: to ${where}. f goes from ${num(f0)} to ${num(f1)}${f1 > f0 ? ', up: the step overshot' : ''}.${adamStep}`;
  if (next.status === 'converged')
    say = `Step ${next.t}: to ${where}, and the run has converged: the gradient and the step are both below ${TOL}. f = ${fval(f1)}.`;
  if (next.status === 'diverged')
    say = `Step ${next.t}: to ${where}, far off the chart. The run diverged: each step overshot by more than the last, so the learning rate is too large for how steep the ${one ? 'curve' : 'surface'} is.`;
  yield {
    state: next,
    marks: [
      mark(
        'now',
        next.status === 'diverged' ? 'error' : next.status === 'converged' ? 'found' : 'new',
      ),
    ],
    say,
    lines: [settings.method === 'gd' ? 'move' : settings.method === 'momentum' ? 'mmove' : 'amove'],
    level: 2,
    vars: baseVars(next, settings),
  };
  return next;
}

/** Why a step cannot run, or nothing. */
function blocked(st: S): string | null {
  if (st.status === 'converged')
    return `This run has converged after ${st.t} steps. Press Start to begin again.`;
  if (st.status === 'diverged')
    return 'This run diverged. Pick a smaller learning rate and press Start.';
  if (st.t >= MAX_STEPS) return `That is ${MAX_STEPS} steps; press Start to begin again.`;
  return null;
}

const stepOp: Op = {
  label: 'Step',
  arity: 0,
  *run(st, _args, { settings }) {
    const why = blocked(st);
    if (why) {
      yield { state: st, marks: [], say: why, lines: [], level: 1, vars: baseVars(st, settings) };
      return st;
    }
    return yield* updateSteps(st, settings, 2);
  },
};

const runOp: Op = {
  label: 'Run',
  arity: 0,
  *run(st0, _args, { settings }) {
    const why = blocked(st0);
    if (why) {
      yield { state: st0, marks: [], say: why, lines: [], level: 1, vars: baseVars(st0, settings) };
      return st0;
    }
    const sf = surfaceOf(st0);
    let st = st0;
    for (let k = 0; k < RUN_STEPS && st.status === 'ready' && st.t < MAX_STEPS; k++)
      st = yield* updateSteps(st, settings, 3);
    const f0 = sf.f(st0.x);
    const f1 = sf.f(st.x);
    let say: string;
    if (st.status === 'converged')
      say = `Converged after ${st.t} steps, at ${sf.dims === 1 ? `x = ${num(st.x[0]!)}` : pt(st.x)}, where f = ${fval(f1)}.`;
    else if (st.status === 'diverged')
      say = `Diverged after ${st.t} steps: the learning rate is too large here.`;
    else if (f1 > f0 - 0.001 * Math.max(1, Math.abs(f0)))
      say = `${st.t - st0.t} steps and no closer: f is still ${num(f1)}. The steps jump across the valley and back, landing as high as they started.`;
    else
      say = `${st.t - st0.t} steps, and f went from ${num(f0)} to ${num(f1)}. Not converged yet: press Run again${Number(settings.lr) <= 0.01 ? ', or try a larger learning rate' : ''}.`;
    yield {
      state: st,
      marks: [
        mark(
          'now',
          st.status === 'diverged' ? 'error' : st.status === 'converged' ? 'found' : 'active',
        ),
      ],
      say,
      lines: [
        settings.method === 'gd' ? 'move' : settings.method === 'momentum' ? 'mmove' : 'amove',
      ],
      level: 1,
      vars: baseVars(st, settings),
    };
    return st;
  },
};

/** "3", "-3.5, 1" or "(−3.5, 1)" into numbers; an Error says what is wrong. */
export function parsePoint(text: string): number[] | Error {
  const parts = text
    .replace(/[()]/g, ' ')
    .replace(/−/g, '-')
    .split(/[,\s]+/)
    .filter(Boolean);
  if (parts.length === 0) return new Error('Type a starting point, such as 3 or -3.5, 1.');
  if (parts.length > 2) return new Error('Give one number (a curve) or two (a surface).');
  const xs = parts.map(Number);
  if (parts.some((p, i) => !/^-?(\d+(\.\d{1,2})?|\.\d{1,2})$/.test(p) || !Number.isFinite(xs[i])))
    return new Error('Use numbers with at most two decimals, such as 2.5 or -1.25.');
  return xs;
}

const startOp: Op = {
  label: 'Start',
  arity: 1,
  *run(st, args, { settings }) {
    const sf = surfaceOf(st);
    const xs = parsePoint(String(args[0]));
    let error = xs instanceof Error ? xs.message : null;
    if (!error && (xs as number[]).length !== sf.dims)
      error =
        sf.dims === 1
          ? `${sf.text} has one variable: give one number, such as ${sf.start[0]}.`
          : `${sf.text} has two variables: give two numbers, such as ${sf.start.join(', ')}.`;
    const p = xs as number[];
    if (!error) {
      const inside = (v: number, [lo, hi]: [number, number]) => v >= lo && v <= hi;
      if (!inside(p[0]!, sf.xr) || (sf.dims === 2 && !inside(p[1]!, sf.yr)))
        error = `Start inside the plot: x from ${sf.xr[0]} to ${sf.xr[1]}${sf.dims === 2 ? `, y from ${sf.yr[0]} to ${sf.yr[1]}` : ''}.`;
    }
    if (error) {
      yield { state: st, marks: [], say: error, lines: [], level: 1, vars: baseVars(st, settings) };
      return st;
    }
    const next = fresh(sf.id, p);
    yield {
      state: next,
      marks: [mark('now', 'new')],
      say: `Start at ${sf.dims === 1 ? `x = ${num(p[0]!)}` : pt(p)}, where f = ${num(sf.f(p))}. ${methodLine(settings)} Press Step or Run.`,
      lines: ['init'],
      level: 1,
      vars: baseVars(next, settings),
    };
    return next;
  },
};

function methodLine(settings: GdSettings): string {
  const lr = settings.lr;
  if (settings.method === 'momentum')
    return `Momentum with η = ${lr} and β = ${settings.beta1}: each step adds to a velocity that remembers the steps before.`;
  if (settings.method === 'adam')
    return `Adam with η = ${lr}, β₁ = ${settings.beta1} and β₂ = ${settings.beta2}${settings.bias ? '' : ', without bias correction'}: each coordinate's step is scaled by the size of its recent gradients.`;
  return `Plain gradient descent with learning rate η = ${lr}: each step moves η times the slope, downhill.`;
}

export const ops = { start: startOp, step: stepOp, run: runOp };

// ---------------------------------------------------------------------------------------------
// Pseudocode

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

function updateLines(settings: GdSettings) {
  if (settings.method === 'momentum')
    return [
      L('vel', 2, 'v = β·v − η·g', 'Keep β of the old velocity and add a step downhill.'),
      L('mmove', 2, 'x = x + v', 'Move by the velocity.'),
    ];
  if (settings.method === 'adam')
    return [
      L('m', 2, 'm = β₁·m + (1 − β₁)·g', 'Average the gradients,'),
      L('s', 2, 's = β₂·s + (1 − β₂)·g²', 'and their squares.'),
      ...(settings.bias
        ? [
            L(
              'hat',
              2,
              'm̂ = m / (1 − β₁ᵗ);  ŝ = s / (1 − β₂ᵗ)',
              'Scale both up early on, because they started at 0.',
            ),
          ]
        : []),
      L(
        'amove',
        2,
        settings.bias ? 'x = x − η·m̂ / (√ŝ + ε)' : 'x = x − η·m / (√s + ε)',
        'Step against the average gradient, divided by its typical size.',
      ),
    ];
  return [L('move', 2, 'x = x − η·g', 'Take a step downhill, η times the slope.')];
}

export function pseudocode(settings: GdSettings): PseudoBlock[] {
  const loop = [
    L('grad', 2, 'g = ∇f(x)', 'Work out the slope where you are.'),
    ...updateLines(settings),
  ];
  const init =
    settings.method === 'gd'
      ? 'x = x₀'
      : settings.method === 'momentum'
        ? 'x = x₀; v = 0'
        : 'x = x₀; m = 0; s = 0';
  return [
    {
      op: 'start',
      lines: [
        L('ssig', 0, 'START(x₀)', 'Begin a run:'),
        L(
          'init',
          1,
          init,
          settings.method === 'gd'
            ? 'stand at the starting point.'
            : 'stand at the starting point, at rest.',
        ),
      ],
    },
    {
      op: 'step',
      lines: [L('stsig', 0, 'STEP()', 'One step:'), ...loop.map((l) => ({ ...l, indent: 1 }))],
    },
    {
      op: 'run',
      lines: [
        L('rsig', 0, 'RUN()', 'Keep stepping:'),
        L(
          'rloop',
          1,
          `repeat up to ${RUN_STEPS} times, until |g| < ${TOL}`,
          'until the slope is flat or the steps run off the chart,',
        ),
        ...loop,
      ],
    },
  ];
}

// ---------------------------------------------------------------------------------------------
// Words for screen readers and narration

export function initialSay(st: S, settings: GdSettings): string {
  const sf = surfaceOf(st);
  return `${sf.text}, starting at ${sf.dims === 1 ? `x = ${num(st.x[0]!)}` : pt(st.x)}. ${methodLine(settings)} Press Step or Run.`;
}

export const initialVars = (st: S, settings: GdSettings) => baseVars(st, settings);

export function describe(st: S): string {
  const sf = surfaceOf(st);
  return `${sf.text}. After ${st.t} steps the point is ${pt(st.x)}, where f = ${num(sf.f(st.x))}${
    st.status === 'ready' ? '' : `; the run ${st.status}`
  }.`;
}
