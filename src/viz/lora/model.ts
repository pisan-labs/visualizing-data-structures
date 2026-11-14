/**
 * LoRA, low-rank adaptation (Hu et al. 2021), on one 4 × 4 layer.
 *
 *   W                 the pretrained weights, frozen: no gradient, no update
 *   B (4 × r)         the adapter's two small matrices, the only numbers that train
 *   A (r × 4)
 *   ΔW = (α/r)·B·A    the adapter's update, added to W: the layer computes with W + ΔW
 *   D                 the target: the update full fine-tuning would make (it trains all 16)
 *   loss              Σ (ΔW − D)², the squared differences added up
 *
 * Training takes Adam steps on B and A (learning rate 0.1, β₁ = 0.9, β₂ = 0.999, ε = 10⁻⁸; the
 * paper trains with Adam too), twenty per press. B·A has rank at most r, so when D has a larger
 * rank, ΔW cannot reach it: the best it can do leaves the part of D outside its r strongest
 * directions (Eckart and Young), reported as "best loss at rank r". Merge folds ΔW into W, so
 * serving costs what it did before.
 *
 *   target(k or 16 numbers)   a random update of rank k (1 to 4), or one typed row by row;
 *                             a new adapter too
 *   train                     twenty Adam steps
 *   merge                     W' = W + ΔW
 *
 * Settings
 *   rank   r, 1 to 4 (default 1: at 4 × 4, rank 2 already trains as many numbers as W has)
 *   alpha  α: '1' (the default: the paper sets α to the first r it tries), '2', '4' or '8'
 *   init   'paper' (A random, B = 0, so ΔW starts at 0), 'random' (both random: the model starts
 *          changed) or 'zero' (both 0: no gradient ever reaches either)
 *
 * The arithmetic runs in the same order as the code tabs: sums from 0 in index order, and Adam's
 * β powers kept as running products, so all four agree to the last bit.
 */
import { makeRng, type Rng } from '../../engine/rng';
import type { Mark, OpSpec, PseudoBlock, Scalar, Step } from '../../engine/types';
import { two } from '../_lm/numbers';

export const DIM = 4;
export const MAX_RANK = 4;
export const STEPS = 20;
export const LR = 0.1;
export const BETA1 = 0.9;
export const BETA2 = 0.999;
export const EPS = 1e-8;
/** The width the "same r, d = 4096" readout compares with. */
export const REAL_D = 4096;
/** The largest entry a typed target may have. */
export const MAX_TARGET = 9;

export type Init = 'paper' | 'random' | 'zero';
export type Alpha = '1' | '2' | '4' | '8';

export interface LoraSettings {
  [key: string]: Scalar;
  rank: number;
  alpha: Alpha;
  init: Init;
}

export const defaults: LoraSettings = { rank: 1, alpha: '1', init: 'paper' };

type M = number[][];

/** Adam's state for B and A: running averages of the gradient and its square. */
export interface Adam {
  mb: M;
  vb: M;
  ma: M;
  va: M;
  /** β₁ᵗ and β₂ᵗ, as running products. */
  p1: number;
  p2: number;
}

export interface LoraState {
  w: M;
  target: M;
  b: M;
  a: M;
  opt: Adam;
  /** Counts the adapters made, so the code tabs know when to start a new one. */
  adapter: number;
  /** Adam steps taken by this adapter. */
  steps: number;
  /** ΔW, once training has formed it. */
  dw: M | null;
  loss: number | null;
  /** W + ΔW, after a merge (until training changes B and A again). */
  merged: M | null;
}

type S = LoraState;
type Op = OpSpec<S, LoraSettings, unknown>;
type LStep = Step<S, unknown>;

// ---------------------------------------------------------------------------------------------
// The arithmetic

export const zeros = (rows: number, cols: number): M =>
  Array.from({ length: rows }, () => Array<number>(cols).fill(0));

/** a (n × m) times b (m × p), each sum from 0 in index order. */
export function mul(a: M, b: M): M {
  return a.map((row) =>
    Array.from({ length: b[0]!.length }, (_, j) => {
      let s = 0;
      for (let t = 0; t < b.length; t++) s += row[t]! * b[t]![j]!;
      return s;
    }),
  );
}

export const scaleOf = (settings: LoraSettings): number => Number(settings.alpha) / settings.rank;

/** ΔW = s · (B·A). */
export const delta = (b: M, a: M, s: number): M => mul(b, a).map((row) => row.map((x) => s * x));

/** Σ (ΔW − D)², row by row. */
export function lossOf(dw: M, target: M): number {
  let sum = 0;
  for (let i = 0; i < dw.length; i++)
    for (let j = 0; j < dw[i]!.length; j++) {
      const e = dw[i]![j]! - target[i]![j]!;
      sum += e * e;
    }
  return sum;
}

export const freshAdam = (r: number): Adam => ({
  mb: zeros(DIM, r),
  vb: zeros(DIM, r),
  ma: zeros(r, DIM),
  va: zeros(r, DIM),
  p1: 1,
  p2: 1,
});

/** The gradients of the loss for B and A, both from the current B and A. */
export function gradients(b: M, a: M, target: M, s: number): { gb: M; ga: M } {
  const dw = delta(b, a, s);
  const g = dw.map((row, i) => row.map((x, j) => 2 * (x - target[i]![j]!)));
  const r = a.length;
  const gb = zeros(DIM, r);
  for (let i = 0; i < DIM; i++)
    for (let k = 0; k < r; k++) {
      let sum = 0;
      for (let j = 0; j < DIM; j++) sum += g[i]![j]! * a[k]![j]!;
      gb[i]![k] = s * sum;
    }
  const ga = zeros(r, DIM);
  for (let k = 0; k < r; k++)
    for (let j = 0; j < DIM; j++) {
      let sum = 0;
      for (let i = 0; i < DIM; i++) sum += b[i]![k]! * g[i]![j]!;
      ga[k]![j] = s * sum;
    }
  return { gb, ga };
}

/** One Adam step on B and A together. */
export function adamStep(b: M, a: M, opt: Adam, target: M, s: number): { b: M; a: M; opt: Adam } {
  const { gb, ga } = gradients(b, a, target, s);
  const p1 = opt.p1 * BETA1;
  const p2 = opt.p2 * BETA2;
  const move = (p: M, g: M, m: M, v: M) => {
    const m2 = m.map((row, i) => row.map((x, j) => BETA1 * x + (1 - BETA1) * g[i]![j]!));
    const v2 = v.map((row, i) =>
      row.map((x, j) => BETA2 * x + (1 - BETA2) * g[i]![j]! * g[i]![j]!),
    );
    const p2m = p.map((row, i) =>
      row.map((x, j) => {
        const mh = m2[i]![j]! / (1 - p1);
        const vh = v2[i]![j]! / (1 - p2);
        return x - (LR * mh) / (Math.sqrt(vh) + EPS);
      }),
    );
    return { p: p2m, m: m2, v: v2 };
  };
  const nb = move(b, gb, opt.mb, opt.vb);
  const na = move(a, ga, opt.ma, opt.va);
  return { b: nb.p, a: na.p, opt: { mb: nb.m, vb: nb.v, ma: na.m, va: na.v, p1, p2 } };
}

const transpose = (m: M): M => m[0]!.map((_, j) => m.map((row) => row[j]!));

/** The eigenvalues of a small symmetric matrix, largest first (Jacobi rotations). */
export function eigenvalues(sym: M): number[] {
  const n = sym.length;
  const a = sym.map((row) => [...row]);
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += a[p]![q]! ** 2;
    if (off < 1e-24) break;
    for (let p = 0; p < n; p++)
      for (let q = p + 1; q < n; q++) {
        const apq = a[p]![q]!;
        if (Math.abs(apq) < 1e-300) continue;
        const theta = (a[q]![q]! - a[p]![p]!) / (2 * apq);
        const t = (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const sn = t * c;
        for (let k = 0; k < n; k++) {
          const akp = a[k]![p]!;
          const akq = a[k]![q]!;
          a[k]![p] = c * akp - sn * akq;
          a[k]![q] = sn * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = a[p]![k]!;
          const aqk = a[q]![k]!;
          a[p]![k] = c * apk - sn * aqk;
          a[q]![k] = sn * apk + c * aqk;
        }
      }
  }
  return a.map((row, i) => Math.max(0, row[i]!)).sort((x, y) => y - x);
}

/** Squared singular values of m, largest first. */
export const squaredSingular = (m: M): number[] => eigenvalues(mul(transpose(m), m));

/** The rank of m: how many independent directions it has. */
export function rankOf(m: M): number {
  const sv = squaredSingular(m);
  const top = sv[0] ?? 0;
  return sv.filter((x) => x > 1e-9 * Math.max(1, top)).length;
}

/**
 * The smallest loss any ΔW of rank at most r can reach: the squared singular values of D past
 * the r-th, added up (Eckart and Young).
 */
export function bestLoss(target: M, r: number): number {
  const sv = squaredSingular(target);
  let sum = 0;
  for (const x of sv.slice(r)) sum += x;
  return sum < 1e-9 ? 0 : sum;
}

export const adapterParams = (d: number, r: number): number => 2 * d * r;

// ---------------------------------------------------------------------------------------------
// Making targets and adapters

const one = (rng: Rng) => rng.int(-10, 10) / 10;

/** A random update of rank k: k outer products of vectors of −1, 0 and 1, entries at most 3. */
export function randomTarget(rng: Rng, k: number): M {
  for (;;) {
    const t = zeros(DIM, DIM);
    for (let m = 0; m < k; m++) {
      const u = Array.from({ length: DIM }, () => rng.int(-1, 1));
      const v = Array.from({ length: DIM }, () => rng.int(-1, 1));
      for (let i = 0; i < DIM; i++) for (let j = 0; j < DIM; j++) t[i]![j]! += u[i]! * v[j]!;
    }
    if (rankOf(t) === k && Math.max(...t.flat().map(Math.abs)) <= 3)
      return t.map((row) => row.map((x) => x + 0));
  }
}

/** A seed mixed from the target, so a new target also gets its own adapter. */
function seedFrom(rng: Rng, t: M): number {
  let h = rng.int(0, 0x3fffffff) ^ 0x811c9dc5;
  for (const x of t.flat()) h = Math.imul(h ^ (Math.round(x * 10) + 128), 0x01000193) >>> 0;
  return h >>> 0;
}

/** A new adapter as the setting says: A random and B zero (the paper), both random, or both 0. */
export function newAdapter(rng: Rng, r: number, init: Init): { b: M; a: M } {
  const a = init === 'zero' ? zeros(r, DIM) : zeros(r, DIM).map((row) => row.map(() => one(rng)));
  const b = init === 'random' ? zeros(DIM, r).map((row) => row.map(() => one(rng))) : zeros(DIM, r);
  return { b, a };
}

/** The pretrained layer: one decimal per weight, the same on every visit. */
export function frozenW(): M {
  const rng = makeRng(11);
  return zeros(DIM, DIM).map((row) => row.map(() => one(rng)));
}

function adapted(base: S, target: M, rng: Rng, settings: LoraSettings): S {
  const { b, a } = newAdapter(makeRng(seedFrom(rng, target)), settings.rank, settings.init);
  return {
    ...base,
    target,
    b,
    a,
    opt: freshAdam(settings.rank),
    adapter: base.adapter + 1,
    steps: 0,
    dw: null,
    loss: null,
    merged: null,
  };
}

export function init(settings: LoraSettings): S {
  const base: S = {
    w: frozenW(),
    target: [],
    b: [],
    a: [],
    opt: freshAdam(settings.rank),
    adapter: 0,
    steps: 0,
    dw: null,
    loss: null,
    merged: null,
  };
  const rng = makeRng(1);
  return adapted(base, randomTarget(rng, 2), rng, settings);
}

/** A typed target: a rank (1 to 4), or 16 numbers row by row. An Error says what is wrong. */
export function parseTarget(text: string): { rank: number } | { m: M } | Error {
  const parts = String(text)
    .replace(/[,;/|]/g, ' ')
    .replace(/−/g, '-')
    .split(/\s+/)
    .filter(Boolean);
  const nums = parts.map(Number);
  const help = `Type a rank from 1 to ${MAX_RANK} for a random update, or ${DIM * DIM} numbers row by row.`;
  if (parts.length === 1) {
    const k = nums[0]!;
    return Number.isInteger(k) && k >= 1 && k <= MAX_RANK ? { rank: k } : new Error(help);
  }
  if (parts.length !== DIM * DIM || nums.some((x) => !Number.isFinite(x))) return new Error(help);
  if (nums.some((x) => Math.abs(x) > MAX_TARGET || Math.round(x * 10) !== x * 10))
    return new Error(
      `Keep each number between −${MAX_TARGET} and ${MAX_TARGET}, with at most one decimal.`,
    );
  return { m: Array.from({ length: DIM }, (_, i) => nums.slice(i * DIM, i * DIM + DIM)) };
}

// ---------------------------------------------------------------------------------------------
// Words

const isZero = (m: M) => m.every((row) => row.every((x) => x === 0));

/** α/r as text: "2/2 = 1", "1/3 = 0.33". */
export function scaleText(settings: LoraSettings): string {
  const s = scaleOf(settings);
  const v = Number.isInteger(s) ? String(s) : two(s);
  return `${settings.alpha}/${settings.rank} = ${v}`;
}

/** Two decimals as a number, for the readouts. */
const round2 = (x: number) => Math.round(x * 100) / 100;

export function baseVars(s: S, settings: LoraSettings): Record<string, Scalar> {
  const r = settings.rank;
  return {
    'α/r': round2(scaleOf(settings)),
    'trained numbers': adapterParams(DIM, r),
    'full fine-tuning': DIM * DIM,
    '% of full at d = 4096': round2((100 * adapterParams(REAL_D, r)) / (REAL_D * REAL_D)),
    'rank of D': rankOf(s.target),
    steps: s.steps,
    ...(s.loss === null ? {} : { loss: round2(s.loss) }),
    'best loss at rank r': round2(bestLoss(s.target, r)),
    'multiply-adds per input': s.merged ? DIM * DIM : DIM * DIM + adapterParams(DIM, r),
  };
}

const cellMarks = (id: string, rows: number, cols: number, role: Mark['role']): Mark[] =>
  Array.from({ length: rows }, (_, i) =>
    Array.from({ length: cols }, (_, j) => ({ id: `${id}-${i}-${j}`, role })),
  ).flat();

const initText: Record<Init, string> = {
  paper:
    'A new adapter: A gets small random numbers and B starts at zero, so ΔW = B·A = 0 and the layer starts exactly as it was.',
  random:
    'A new adapter, both B and A random: ΔW is not zero, so the layer starts changed before it has learned anything.',
  zero: 'A new adapter, both B and A zero. ΔW = 0, but watch what training does with that.',
};

// ---------------------------------------------------------------------------------------------
// Operations

const targetOp: Op = {
  label: 'Target',
  arity: 1,
  *run(s, args, { settings, rng }) {
    const parsed = parseTarget(String(args[0]));
    if (parsed instanceof Error) {
      yield {
        state: s,
        marks: [],
        say: parsed.message,
        lines: [],
        level: 1,
        vars: baseVars(s, settings),
      };
      return s;
    }
    const target = 'rank' in parsed ? randomTarget(rng, parsed.rank) : parsed.m;
    const next = adapted(s, target, rng, settings);
    const k = rankOf(target);
    const r = settings.rank;
    const reach =
      k <= r
        ? `Its rank is ${k}, so a rank-${r} adapter can express it exactly.`
        : `Its rank is ${k}, more than the adapter's ${r}: no rank-${r} ΔW can equal it.`;
    yield {
      state: next,
      marks: cellMarks('D', DIM, DIM, 'new'),
      say: `D is the update full fine-tuning would make to W, training all ${DIM * DIM} weights. ${reach} ${initText[settings.init]}`,
      lines: ['tset', 'tinit'],
      level: 1,
      vars: baseVars(next, settings),
    };
    return next;
  },
};

function* formSteps(s: S, settings: LoraSettings): Generator<LStep, S, void> {
  const sc = scaleOf(settings);
  const dw = delta(s.b, s.a, sc);
  const loss = lossOf(dw, s.target);
  const r = settings.rank;
  const formed: S = { ...s, dw, loss };
  if (isZero(s.b) || isZero(s.a)) {
    const which = isZero(s.b) && isZero(s.a) ? 'B and A are' : isZero(s.b) ? 'B is' : 'A is';
    yield {
      state: formed,
      marks: cellMarks('dW', DIM, DIM, 'new'),
      say: `ΔW = (α/r)·B·A, and ${which} all zeros, so ΔW = 0: the layer computes with W alone. The loss, Σ (ΔW − D)², is the whole of D squared: ${two(loss)}.`,
      lines: ['fwd', 'err'],
      level: 2,
      vars: baseVars(formed, settings),
    };
    return formed;
  }
  // Both random: every entry of ΔW, one at a time, at the finest level.
  const shown = zeros(DIM, DIM).map((row) => row.map(() => NaN));
  for (let i = 0; i < DIM; i++)
    for (let j = 0; j < DIM; j++) {
      shown[i]![j] = dw[i]![j]!;
      const terms = Array.from(
        { length: r },
        (_, k) => `${two(s.b[i]![k]!)} × ${two(s.a[k]![j]!)}`,
      ).join(' + ');
      const part: S = { ...s, dw: shown.map((row) => [...row]) };
      yield {
        state: part,
        marks: [
          ...Array.from({ length: r }, (_, k) => ({ id: `B-${i}-${k}`, role: 'active' as const })),
          ...Array.from({ length: r }, (_, k) => ({ id: `A-${k}-${j}`, role: 'compare' as const })),
          { id: `dW-${i}-${j}`, role: 'new' },
        ],
        say: `ΔW row ${i + 1}, column ${j + 1}: row ${i + 1} of B times column ${j + 1} of A, then times α/r = ${scaleText(settings)}: (${terms}) × ${two(sc)} = ${two(dw[i]![j]!)}.`,
        lines: ['fwd'],
        level: 3,
        vars: baseVars(s, settings),
      };
    }
  yield {
    state: formed,
    marks: [],
    say: `ΔW = (α/r)·B·A is not zero: the layer already computes with W + ΔW, before any training. The loss, Σ (ΔW − D)², is ${two(loss)}${loss > lossOf(zeros(DIM, DIM), s.target) ? `, more than the ${two(lossOf(zeros(DIM, DIM), s.target))} of no change at all` : ''}.`,
    lines: ['fwd', 'err'],
    level: 2,
    vars: baseVars(formed, settings),
  };
  return formed;
}

/** The ΔW cell farthest from D. */
function worstCell(dw: M, target: M): [number, number] {
  let best: [number, number] = [0, 0];
  let gap = -1;
  for (let i = 0; i < DIM; i++)
    for (let j = 0; j < DIM; j++) {
      const g = Math.abs(dw[i]![j]! - target[i]![j]!);
      if (g > gap + 1e-12) {
        gap = g;
        best = [i, j];
      }
    }
  return best;
}

const trainOp: Op = {
  label: 'Train',
  arity: 0,
  *run(s0, _args, { settings }) {
    const sc = scaleOf(settings);
    const r = settings.rank;
    let s = s0;
    if (s.merged) {
      s = { ...s, merged: null };
      yield {
        state: s,
        marks: [],
        say: 'Training changes B and A, so the merged copy of W is out of date. Serving goes back to W plus the adapter until you merge again.',
        lines: ['sig'],
        level: 2,
        vars: baseVars(s, settings),
      };
    }
    if (!s.dw) s = yield* formSteps(s, settings);
    const startLoss = s.loss!;

    if (isZero(s.b) && isZero(s.a)) {
      // Nothing can move: run the steps (they change nothing) and say so once.
      let cur = s;
      for (let t = 0; t < STEPS; t++) {
        const n = adamStep(cur.b, cur.a, cur.opt, cur.target, sc);
        cur = { ...cur, b: n.b, a: n.a, opt: n.opt, steps: cur.steps + 1 };
      }
      const dw = delta(cur.b, cur.a, sc);
      const next: S = { ...cur, dw, loss: lossOf(dw, cur.target) };
      yield {
        state: next,
        marks: [...cellMarks('B', DIM, r, 'error'), ...cellMarks('A', r, DIM, 'error')],
        say: `Stuck. B's gradient is (α/r)·2E·Aᵀ and A's is (α/r)·Bᵀ·2E: each needs the other to be nonzero, and both are 0. After ${STEPS} steps nothing has moved, and nothing ever will. That is why one of them starts random.`,
        lines: ['grad', 'adam'],
        level: 2,
        vars: baseVars(next, settings),
      };
      yield {
        state: next,
        marks: [],
        say: `Still ΔW = 0 and loss ${two(next.loss!)} after ${next.steps} steps. Pick the paper's start (A random, B zero) and press Target again.`,
        lines: ['for'],
        level: 1,
        vars: baseVars(next, settings),
      };
      return next;
    }

    let cur = s;
    for (let t = 1; t <= STEPS; t++) {
      const before = cur.loss!;
      const bZero = isZero(cur.b);
      const n = adamStep(cur.b, cur.a, cur.opt, cur.target, sc);
      const dw = delta(n.b, n.a, sc);
      const loss = lossOf(dw, cur.target);
      cur = { ...cur, b: n.b, a: n.a, opt: n.opt, steps: cur.steps + 1, dw, loss };
      const where = loss < before ? `down from ${two(before)}` : `up from ${two(before)}`;
      const say = bZero
        ? `Step ${cur.steps}: only B moves. A's gradient is (α/r)·Bᵀ·2E, and B is all zeros, so A gets no push yet; B's gradient uses A, which is random. Loss ${two(loss)}, ${where}.`
        : loss < before
          ? `Step ${cur.steps}: B and A each take one Adam step downhill; W does not change. Loss ${two(loss)}, ${where}.`
          : `Step ${cur.steps}: loss ${two(loss)}, ${where}. Adam's steps stay about the learning rate in size, so near the bottom it overshoots a little.`;
      yield {
        state: cur,
        marks: bZero
          ? cellMarks('B', DIM, r, 'active')
          : [...cellMarks('B', DIM, r, 'active'), ...cellMarks('A', r, DIM, 'active')],
        say,
        lines: ['fwd', 'err', 'grad', 'adam'],
        // The first step (where only B moves) and every fifth; the rest at the finest level.
        level: bZero || t === 1 || t % 5 === 0 ? 2 : 3,
        vars: baseVars(cur, settings),
      };
    }

    const floor = bestLoss(cur.target, r);
    const k = rankOf(cur.target);
    const [i, j] = worstCell(cur.dw!, cur.target);
    const gap = Math.abs(cur.dw![i]![j]! - cur.target[i]![j]!);
    const close = floor === 0 && gap < 0.05;
    const head = `After ${cur.steps} steps the loss is ${two(cur.loss!)} (it was ${two(startLoss)} before these ${STEPS}).`;
    let tail: string;
    if (floor === 0)
      tail = close
        ? ` Every entry of ΔW is within ${two(gap)} of D: a rank-${r} adapter can express this rank-${k} update${adapterParams(DIM, r) < DIM * DIM ? `, with ${adapterParams(DIM, r)} numbers instead of ${DIM * DIM}` : ''}.`
        : ` D has rank ${k}, no more than ${r}, so ΔW can match it exactly; more training gets closer. The largest gap left, ${two(gap)}, is in row ${i + 1}, column ${j + 1}.`;
    else
      tail = ` D has rank ${k} and the adapter only ${r}. The best any rank-${r} ΔW can do is loss ${two(floor)}: the part of D outside its ${r === 1 ? 'strongest direction' : `${r} strongest directions`}. The largest gap, ${two(gap)}, is in row ${i + 1}, column ${j + 1}.`;
    yield {
      state: cur,
      marks: close
        ? []
        : [
            { id: `dW-${i}-${j}`, role: 'compare' },
            { id: `D-${i}-${j}`, role: 'compare' },
          ],
      say: head + tail,
      lines: ['for'],
      level: 1,
      vars: baseVars(cur, settings),
    };
    return cur;
  },
};

const mergeOp: Op = {
  label: 'Merge',
  arity: 0,
  *run(s, _args, { settings }) {
    if (s.merged) {
      yield {
        state: s,
        marks: [],
        say: 'Already merged: W holds W + ΔW, and serving uses it alone.',
        lines: ['mserve'],
        level: 1,
        vars: baseVars(s, settings),
      };
      return s;
    }
    const sc = scaleOf(settings);
    const dw = s.dw ?? delta(s.b, s.a, sc);
    const merged = s.w.map((row, i) => row.map((x, j) => x + dw[i]![j]!));
    const r = settings.rank;
    const rows: M = s.w.map((row) => [...row]);
    for (let i = 0; i < DIM; i++) {
      rows[i] = merged[i]!;
      const part: S = { ...s, dw, merged: rows.map((row) => [...row]) };
      yield {
        state: part,
        marks: [
          ...Array.from({ length: DIM }, (_, j) => ({ id: `W-${i}-${j}`, role: 'new' as const })),
          ...Array.from({ length: DIM }, (_, j) => ({
            id: `dW-${i}-${j}`,
            role: 'active' as const,
          })),
        ],
        say: `Row ${i + 1}: W + ΔW = ${merged[i]!.map(two).join(', ')}. ${i === 0 ? 'Adding the update into the weights happens once, before serving.' : ''}`.trim(),
        lines: ['madd'],
        level: 3,
        vars: baseVars(s, settings),
      };
    }
    const next: S = { ...s, dw, merged };
    yield {
      state: next,
      marks: [{ id: 'W-title', role: 'found' }],
      say: isZero(dw)
        ? 'Merged, though ΔW is still 0, so W is unchanged. Train first to have something to merge.'
        : `Merged: the layer is one ${DIM} × ${DIM} matrix again, so each input costs ${DIM * DIM} multiply-adds, as before LoRA (unmerged it costs ${DIM * DIM + adapterParams(DIM, r)}). To switch tasks, subtract ΔW and add another adapter's.`,
      lines: ['madd', 'mserve'],
      level: 1,
      vars: baseVars(next, settings),
    };
    return next;
  },
};

export const ops = { target: targetOp, train: trainOp, merge: mergeOp };

// ---------------------------------------------------------------------------------------------
// Pseudocode

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

const INIT_LINE: Record<Init, [string, string]> = {
  paper: [
    'B = 0;  A = small random numbers',
    'B starts at zero, so ΔW = 0 and nothing changes yet.',
  ],
  random: [
    'B = small random numbers;  A = small random numbers',
    'Both start random, so ΔW is not 0.',
  ],
  zero: ['B = 0;  A = 0', 'Both start at zero.'],
};

export function pseudocode(settings: LoraSettings): PseudoBlock[] {
  const [initText2, initPlain] = INIT_LINE[settings.init];
  return [
    {
      op: 'target',
      lines: [
        L('tsig', 0, 'TARGET(D)', 'Set what the layer should learn:'),
        L(
          'tset',
          1,
          'D = the update full fine-tuning would make',
          'the change to all of W that training every weight would make.',
        ),
        L('tinit', 1, initText2, `A new adapter. ${initPlain}`),
      ],
    },
    {
      op: 'train',
      lines: [
        L('sig', 0, 'TRAIN()', 'Train the adapter; W stays frozen:'),
        L('for', 1, `for t = 1 to ${STEPS}`, `${STEPS} times:`),
        L('fwd', 2, 'ΔW = (α/r)·B·A', "form the adapter's update,"),
        L('err', 2, 'E = ΔW − D;  loss = Σ E²', 'see how far it is from the target,'),
        L(
          'grad',
          2,
          'G_B = (α/r)·2E·Aᵀ;  G_A = (α/r)·Bᵀ·2E',
          'work out which way B and A should move (W gets no gradient),',
        ),
        L('adam', 2, 'B, A ← one Adam step each', 'and move both a little downhill.'),
      ],
    },
    {
      op: 'merge',
      lines: [
        L('msig', 0, 'MERGE()', 'Before serving:'),
        L('madd', 1, "W' = W + (α/r)·B·A", 'fold the update into the weights, once,'),
        L('mserve', 1, "serve with W' alone", 'so each input costs what it did before LoRA.'),
      ],
    },
  ];
}

// ---------------------------------------------------------------------------------------------
// Words for screen readers and narration

export function initialSay(s: S, settings: LoraSettings): string {
  const r = settings.rank;
  return `A frozen ${DIM} × ${DIM} layer W, and a target update D of rank ${rankOf(s.target)}. LoRA trains only B (${DIM} × ${r}) and A (${r} × ${DIM}), ${adapterParams(DIM, r)} numbers, and adds ΔW = (α/r)·B·A to W. Press Train.`;
}

export const initialVars = (s: S, settings: LoraSettings) => baseVars(s, settings);

const rowsText = (m: M) => m.map((row) => row.map(two).join(' ')).join('; ');

export function describe(s: S, settings: LoraSettings): string {
  const parts = [
    `W${s.merged ? ' merged with ΔW' : ' (frozen)'}: ${rowsText(s.merged ?? s.w)}.`,
    `Target D (rank ${rankOf(s.target)}): ${rowsText(s.target)}.`,
    `B: ${rowsText(s.b)}. A: ${rowsText(s.a)}.`,
    s.dw && s.dw.every((row) => row.every(Number.isFinite))
      ? `ΔW: ${rowsText(s.dw)}. Loss ${two(s.loss ?? lossOf(s.dw, s.target))} after ${s.steps} steps, rank ${settings.rank}.`
      : 'ΔW not formed yet.',
  ];
  return parts.join(' ');
}
