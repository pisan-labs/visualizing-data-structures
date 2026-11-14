/**
 * Policy optimization, the step after pretraining that tunes a model with rewards or
 * preferences, on a toy you can follow with a calculator: one prompt, four answers, a policy
 * π = softmax(z) over them, a fixed reference policy π_ref (where training started), and a
 * reward for each answer. Every method moves the four logits z by explicit gradient steps
 * (learning rate η = 0.5).
 *
 *   REINFORCE  draw a group of G = 4 answers from π; advantage A_i = r_i − β·log(π(a_i)/π_ref(a_i))
 *              (the raw reward, with the KL penalty folded in); one step
 *              Δz_k = (1/G) Σ_i A_i (1[a_i = k] − π_k)
 *   PPO        the same rewards, minus a critic's value V: A_i = r_i − β·log(π/π_ref) − V; two passes
 *              over the group; from the second pass the ratio ρ_i = π(a_i)/π_old(a_i) is not 1,
 *              and a sample whose ratio has left [1 − ε, 1 + ε] in the direction its advantage
 *              pushes is clipped: it adds nothing (Schulman et al. 2017). Unclipped, a sample adds
 *              A_i ρ_i (1[a_i = k] − π_k). After the step V moves halfway to the group's mean.
 *   GRPO       no critic: A_i = (r_i − mean r) / std r over the group (std divides by G; all
 *              equal rewards give A = 0); two clipped passes as in PPO; the KL penalty is in the
 *              loss, not the reward: each sample adds −β(1 − π_ref(a_i)/π(a_i)) (1[a_i = k] − π_k),
 *              the gradient of Shao et al.'s estimator π_ref/π − log(π_ref/π) − 1 (2024).
 *   DPO        no reward model and no sampling from π: a pair of different answers drawn from
 *              π_ref, the one with the higher reward preferred (a labeler's choice); with
 *              h = β[(z_w − z_ref,w) − (z_l − z_ref,l)], the loss −log σ(h) moves
 *              z_w up and z_l down by β(1 − σ(h)) (Rafailov et al. 2023).
 *
 * Draws walk the answers in order, adding up π, and take the first whose running total passes
 * a uniform u from the seeded RNG. The code tabs do the same arithmetic in the same order.
 *
 * Operations: rewards (set the four rewards; back to the reference policy), step (one update),
 * run (ten), reset (back to the reference policy, rewards kept).
 */
import type { Rng } from '../../engine/rng';
import type { Mark, OpSpec, PseudoBlock, Scalar, Step } from '../../engine/types';
import { round3, softmax, two } from '../_lm/numbers';

export const PROMPT = 'What is the capital of Australia?';
export const ANSWERS = ['Canberra', 'Sydney', 'Melbourne', 'not sure'] as const;
/** The reference policy's logits: about 0.30, 0.40, 0.20 and 0.10. */
export const REF_LOGITS: readonly number[] = [0.4, 0.7, 0, -0.7];
/** A reward model's scores: right, a famous wrong city, a less famous one, an honest shrug. */
export const START_REWARDS: readonly number[] = [1, 0.3, 0.2, 0.5];
export const G = 4;
export const PASSES = 2;
export const LR = 0.5;
export const CRITIC_RATE = 0.5;
export const RUN_STEPS = 10;

export type Method = 'reinforce' | 'ppo' | 'grpo' | 'dpo';

export interface PoSettings {
  [key: string]: Scalar;
  method: Method;
  clip: string;
  beta: string;
}

export const defaults: PoSettings = { method: 'grpo', clip: '0.2', beta: '0.1' };
export const CLIPS = ['0.1', '0.2', '0.3'];
export const BETAS = ['0', '0.04', '0.1', '0.5', '1'];

export interface PoState {
  /** The policy's logits, one per answer. */
  z: number[];
  rewards: number[];
  /** PPO's critic: its guess at the reward of an answer to this prompt. */
  v: number;
  steps: number;
}

/** A draw: the uniform number and the answer it picked. */
export interface Draw {
  u: number;
  a: number;
}

/** One pass of PPO or GRPO (REINFORCE has one, with no ratios). */
export interface Pass {
  /** π at the start of the pass. */
  p: number[];
  /** π(a_i) / π_old(a_i), per sample. */
  ratio: number[];
  clipped: boolean[];
  /** GRPO's KL factor per sample, −β(1 − π_ref/π); 0 elsewhere. */
  kl: number[];
  /** The change to each logit, η·g. */
  dz: number[];
  /** The logits after the pass. */
  z: number[];
}

export interface RlRec {
  kind: 'rl';
  method: Exclude<Method, 'dpo'>;
  pOld: number[];
  draws: Draw[];
  /** The rewards of the group, and the rewards with the KL penalty (REINFORCE, PPO). */
  r: number[];
  shaped: number[];
  mean: number;
  std: number;
  /** The critic's value before the step (PPO). */
  v: number;
  adv: number[];
  passes: Pass[];
  vAfter: number;
}

export interface DpoRec {
  kind: 'dpo';
  draws: Draw[];
  /** Winner and loser. */
  w: number;
  l: number;
  /** z − z_ref of the winner and the loser, h, σ(h) and the step. */
  dw: number;
  dl: number;
  h: number;
  sig: number;
  step: number;
  z: number[];
}

export type Rec = RlRec | DpoRec;

export interface PoWork {
  rec: Rec;
  stage: 'draw' | 'adv' | 'pass' | 'critic' | 'done';
  /** During 'pass', which pass (0-based). */
  pass?: number;
}

export interface PoExtra {
  work?: PoWork;
  /** On the last step of an operation: every update it made, in order. */
  log?: Rec[];
}

type S = PoState;
type X = PoExtra;
type Op = OpSpec<S, PoSettings, X>;
type PStep = Step<S, X>;

// ---------------------------------------------------------------------------------------------
// Arithmetic

export const policy = (z: readonly number[]): number[] => softmax(z).p;
export const REF: readonly number[] = policy(REF_LOGITS);
export const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));

/** The answer whose stretch of 0 to 1, in answer order, holds u. */
export function pick(p: readonly number[], u: number): number {
  let cum = 0;
  for (let k = 0; k < p.length; k++) {
    cum += p[k]!;
    if (u < cum) return k;
  }
  let k = p.length - 1;
  while (k > 0 && p[k]! <= 0) k--;
  return k;
}

/** KL(π ‖ π_ref), summed in answer order. */
export function kl(p: readonly number[]): number {
  let s = 0;
  for (let k = 0; k < p.length; k++) if (p[k]! > 0) s += p[k]! * Math.log(p[k]! / REF[k]!);
  return s;
}

/** The expected reward of the policy. */
export function expected(p: readonly number[], r: readonly number[]): number {
  let s = 0;
  for (let k = 0; k < p.length; k++) s += p[k]! * r[k]!;
  return s;
}

/** Advantages for a group, given its rewards (and, for PPO, the critic's value). */
export function advantages(
  method: Exclude<Method, 'dpo'>,
  pOld: readonly number[],
  group: readonly number[],
  rewards: readonly number[],
  beta: number,
  v: number,
) {
  const r = group.map((a) => rewards[a]!);
  const shaped =
    method === 'grpo' ? [...r] : group.map((a, i) => r[i]! - beta * Math.log(pOld[a]! / REF[a]!));
  let mean = 0;
  for (const x of r) mean += x;
  mean /= G;
  let sq = 0;
  for (const x of r) sq += (x - mean) * (x - mean);
  const std = Math.sqrt(sq / G);
  const adv =
    method === 'reinforce'
      ? [...shaped]
      : method === 'ppo'
        ? shaped.map((s) => s - v)
        : r.map((x) => (std > 0 ? (x - mean) / std : 0));
  return { r, shaped, mean, std, adv };
}

/** One pass over the group: the clipped surrogate (and GRPO's KL term) and a step. */
export function pass(
  method: Exclude<Method, 'dpo'>,
  z: readonly number[],
  pOld: readonly number[],
  group: readonly number[],
  adv: readonly number[],
  eps: number,
  beta: number,
): Pass {
  const p = policy(z);
  const g = [0, 0, 0, 0];
  const ratio: number[] = [];
  const clipped: boolean[] = [];
  const kls: number[] = [];
  group.forEach((a, i) => {
    const rho = method === 'reinforce' ? 1 : p[a]! / pOld[a]!;
    const A = adv[i]!;
    const clip = method !== 'reinforce' && ((A > 0 && rho > 1 + eps) || (A < 0 && rho < 1 - eps));
    ratio.push(rho);
    clipped.push(clip);
    if (!clip) {
      const coef = A * rho;
      for (let k = 0; k < 4; k++) g[k]! += coef * ((k === a ? 1 : 0) - p[k]!);
    }
    const kc = method === 'grpo' ? -beta * (1 - REF[a]! / p[a]!) : 0;
    kls.push(kc);
    if (method === 'grpo') for (let k = 0; k < 4; k++) g[k]! += kc * ((k === a ? 1 : 0) - p[k]!);
  });
  const dz = g.map((x) => LR * (x / G));
  return { p, ratio, clipped, kl: kls, dz, z: z.map((x, k) => x + dz[k]!) };
}

/** Draw a group of G answers from p. */
export function drawGroup(rng: Rng, p: readonly number[]): Draw[] {
  return Array.from({ length: G }, () => {
    const u = rng.next();
    return { u, a: pick(p, u) };
  });
}

export function rlStep(s: S, settings: PoSettings, rng: Rng): RlRec {
  const method = settings.method as Exclude<Method, 'dpo'>;
  const beta = Number(settings.beta);
  const eps = Number(settings.clip);
  const pOld = policy(s.z);
  const draws = drawGroup(rng, pOld);
  const group = draws.map((d) => d.a);
  const a = advantages(method, pOld, group, s.rewards, beta, s.v);
  const passes: Pass[] = [];
  let z = s.z;
  for (let k = 0; k < (method === 'reinforce' ? 1 : PASSES); k++) {
    const ps = pass(method, z, pOld, group, a.adv, eps, beta);
    passes.push(ps);
    z = ps.z;
  }
  let target = 0;
  for (const x of a.shaped) target += x;
  target /= G;
  const vAfter = method === 'ppo' ? s.v + CRITIC_RATE * (target - s.v) : s.v;
  return { kind: 'rl', method, pOld, draws, ...a, v: s.v, passes, vAfter };
}

/** Whether a preference can be made: two answers with different rewards. */
export const canPrefer = (rewards: readonly number[]) => new Set(rewards).size > 1;

export function dpoStep(s: S, settings: PoSettings, rng: Rng): DpoRec {
  const beta = Number(settings.beta);
  const draws: Draw[] = [];
  const one = () => {
    const u = rng.next();
    const d = { u, a: pick(REF, u) };
    draws.push(d);
    return d.a;
  };
  let x = one();
  let y = one();
  while (s.rewards[x] === s.rewards[y]) {
    x = one();
    y = one();
  }
  const [w, l] = s.rewards[x]! > s.rewards[y]! ? [x, y] : [y, x];
  const dw = s.z[w]! - REF_LOGITS[w]!;
  const dl = s.z[l]! - REF_LOGITS[l]!;
  const h = beta * (dw - dl);
  const sig = sigmoid(h);
  const step = LR * beta * (1 - sig);
  const z = [...s.z];
  z[w] = z[w]! + step;
  z[l] = z[l]! - step;
  return { kind: 'dpo', draws, w, l, dw, dl, h, sig, step, z };
}

export const endOf = (s: S, r: Rec): S =>
  r.kind === 'dpo'
    ? { ...s, z: r.z, steps: s.steps + 1 }
    : { ...s, z: r.passes.at(-1)!.z, v: r.vAfter, steps: s.steps + 1 };

// ---------------------------------------------------------------------------------------------
// Input

/** Four rewards, each from −1 to 1 with at most two decimals; an Error says what is wrong. */
export function parseRewards(text: string): number[] | Error {
  const parts = text
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean);
  if (parts.length !== 4)
    return new Error(
      `Type four rewards, one per answer (${ANSWERS.join(', ')}), such as "1 0.3 0.2 0.5".`,
    );
  const xs = parts.map(Number);
  if (xs.some((x) => !Number.isFinite(x) || x < -1 || x > 1))
    return new Error('Keep each reward between −1 and 1.');
  if (xs.some((x) => Math.abs(x * 100 - Math.round(x * 100)) > 1e-9))
    return new Error('Use at most two decimals, such as 0.25.');
  return xs.map((x) => Math.round(x * 100) / 100);
}

export const rewardsText = (r: readonly number[]) => r.map((x) => String(x)).join(' ');

export function init(): S {
  return { z: [...REF_LOGITS], rewards: [...START_REWARDS], v: 0, steps: 0 };
}

// ---------------------------------------------------------------------------------------------
// Steps

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });
const name = (a: number) => ANSWERS[a]!;
/** An answer at the start of a sentence. */
const Name = (a: number) => name(a).charAt(0).toUpperCase() + name(a).slice(1);
const r3 = (x: number) => Math.round(x * 1000) / 1000;
/** Signed, two decimals: +0.43, −0.10. */
export const signed = (x: number) =>
  Math.round(x * 100) === 0 ? '0.00' : x > 0 ? `+${two(x)}` : two(x);
/** A number as the second operand of + or ×: negatives in brackets. */
const par = (x: number) => (x < 0 && Math.round(x * 100) !== 0 ? `(${two(x)})` : two(x));
const num = (x: number) => String(Math.round(x * 100) / 100).replace('-', '−');

export function baseVars(s: S, settings: PoSettings, extra: Record<string, Scalar> = {}) {
  const p = policy(s.z);
  const out: Record<string, Scalar> = { step: s.steps, 'E[r]': r3(expected(p, s.rewards)) };
  out.KL = r3(kl(p));
  if (settings.method === 'ppo') out.V = r3(s.v);
  return { ...out, ...extra };
}

const drawSay = (draws: readonly Draw[], p: readonly number[], from: string) => {
  const cum: string[] = [];
  let c = 0;
  for (let k = 0; k < 4; k++) {
    const lo = c;
    c += p[k]!;
    cum.push(`${name(k)} ${two(lo)}–${two(c)}`);
  }
  return `Lay ${from} end to end (${cum.join(', ')}) and draw: ${draws.map((d) => `u = ${round3(d.u)} → ${name(d.a)}`).join('; ')}.`;
};

function advSay(r: RlRec, settings: PoSettings): string {
  const beta = Number(settings.beta);
  const list = r.draws.map((d, i) => `${name(d.a)} ${signed(r.adv[i]!)}`).join(', ');
  if (r.method === 'grpo') {
    if (r.std === 0)
      return `Rewards ${r.r.map(num).join(', ')}: all the same, so every advantage is 0. This group says nothing about which answer is better.`;
    return `Rewards ${r.r.map(num).join(', ')}: mean ${two(r.mean)}, standard deviation ${two(r.std)}. Advantage = (reward − mean) / std: ${list}. Above the group's average is good, below is bad.`;
  }
  const kl =
    beta > 0 && r.shaped.some((x, i) => Math.abs(x - r.r[i]!) > 0.005)
      ? ` The KL penalty takes β·log(π/π_ref) off each reward: ${r.shaped.map(two).join(', ')}.`
      : '';
  if (r.method === 'reinforce')
    return `Rewards ${r.r.map(num).join(', ')}.${kl} REINFORCE uses them as they are: ${list}.${r.adv.every((x) => x > 0) ? ' Every one is positive, so each sample pushes its own answer up, wrong or right; only the sizes differ.' : ''}`;
  return `Rewards ${r.r.map(num).join(', ')}.${kl} The critic expects V = ${two(r.v)}, and advantage = reward − V: ${list}.`;
}

function passSay(r: RlRec, k: number, eps: number): string {
  const ps = r.passes[k]!;
  const moves = ANSWERS.map((a, j) => `${a} ${signed(ps.dz[j]!)}`).join(', ');
  if (r.method === 'reinforce')
    return `Each sample adds A·(1 − π) to its own logit and −A·π to each of the others. η = ${LR} times the average over the ${G} samples moves the logits: ${moves}.`;
  if (k === 0)
    return `Pass 1: the policy has not moved yet, so every ratio π/π_old is 1 and nothing is clipped. Each sample adds A·(1 − π) to its own logit and −A·π to each of the others${r.method === 'grpo' && Number.isFinite(eps) && r.passes[0]!.kl.some((x) => Math.abs(x) > 1e-12) ? ', plus the KL pull' : ''}. η = ${LR} times the average over the ${G} samples moves the logits: ${moves}.`;
  const ratios = r.draws
    .map((d, i) => `${name(d.a)} ${two(ps.ratio[i]!)}${ps.clipped[i] ? ' (clipped)' : ''}`)
    .join(', ');
  const n = ps.clipped.filter(Boolean).length;
  const why = n
    ? ` ${n === 1 ? 'One sample has' : `${n} samples have`} moved past 1 ± ${eps} in the direction ${n === 1 ? 'its' : 'their'} advantage pushes, so ${n === 1 ? 'it adds' : 'they add'} nothing: no more credit for a change already made.`
    : ` All within 1 ± ${eps}, so nothing is clipped.`;
  return `Pass 2, the same group: ratios π/π_old ${ratios}.${why} Logits move ${moves}.`;
}

function* rlSteps(s: S, r: RlRec, settings: PoSettings): Generator<PStep, S, void> {
  {
    const eps = Number(settings.clip);
    const work = (stage: PoWork['stage'], pass?: number): X => ({ work: { rec: r, stage, pass } });
    const sampleMarks = (role: Mark['role']) => r.draws.map((_, i) => mark(`gr-g${i}`, role));
    yield {
      state: s,
      marks: [...sampleMarks('new'), ...r.draws.map((d) => mark(`pi-a${d.a}`, 'visit'))],
      say: `Draw a group of ${G} answers from the policy. ${drawSay(r.draws, r.pOld, 'π')}`,
      lines: ['draw'],
      level: 2,
      vars: baseVars(s, settings),
      extra: work('draw'),
    };
    yield {
      state: s,
      marks: r.draws.map((_, i) =>
        mark(`adv-g${i}`, r.adv[i]! > 0 ? 'found' : r.adv[i]! < 0 ? 'remove' : 'visit'),
      ),
      say: advSay(r, settings),
      lines: ['adv'],
      level: 2,
      vars: baseVars(s, settings),
      extra: work('adv'),
    };
    let cur = s;
    for (let k = 0; k < r.passes.length; k++) {
      const ps = r.passes[k]!;
      cur = { ...cur, z: ps.z };
      const clipped = ps.clipped.map((c, i) => (c ? mark(`rho-g${i}`, 'error') : null));
      yield {
        state: cur,
        marks: [
          ...clipped.filter((m): m is Mark => m !== null),
          ...ANSWERS.map((_, j) =>
            ps.dz[j]! > 0.005
              ? mark(`dz-a${j}`, 'found')
              : ps.dz[j]! < -0.005
                ? mark(`dz-a${j}`, 'remove')
                : null,
          ).filter((m): m is Mark => m !== null),
        ],
        say: passSay(r, k, eps),
        lines: k === 0 ? ['grad', 'move'] : ['ratio', 'clip', 'move'],
        level: 2,
        vars: baseVars(
          cur,
          settings,
          r.method === 'reinforce' ? {} : { clipped: ps.clipped.filter(Boolean).length },
        ),
        extra: work('pass', k),
      };
    }
    const end = endOf(s, r);
    if (r.method === 'ppo') {
      yield {
        state: end,
        marks: [],
        say: `The critic learns too: V moves halfway from ${two(r.v)} to the group's average reward ${two(meanOf(r.shaped))}, so V = ${two(r.vAfter)}. Next time, "better than expected" means better than that.`,
        lines: ['critic'],
        level: 2,
        vars: baseVars(end, settings),
        extra: work('critic'),
      };
    }
    return end;
  }
}

const meanOf = (xs: readonly number[]) => {
  let t = 0;
  for (const x of xs) t += x;
  return t / xs.length;
};

function* dpoSteps(s: S, r: DpoRec, settings: PoSettings): Generator<PStep, S, void> {
  const beta = Number(settings.beta);
  const work = (stage: PoWork['stage']): X => ({ work: { rec: r, stage } });
  const tries = r.draws.length / 2;
  yield {
    state: s,
    marks: [mark('gr-g0', 'found'), mark('gr-g1', 'remove')],
    say: `Draw two answers from the reference policy, as the data for DPO was made: ${r.draws.map((d) => `u = ${round3(d.u)} → ${name(d.a)}`).join('; ')}.${tries > 1 ? ' A pair with equal rewards has no preference, so it was drawn again.' : ''} The labeler prefers ${name(r.w)} to ${name(r.l)}. DPO never sees the rewards, only who won.`,
    lines: ['pair'],
    level: 2,
    vars: baseVars(s, settings),
    extra: work('draw'),
  };
  yield {
    state: s,
    marks: [mark('lr-g0', 'found'), mark('lr-g1', 'remove')],
    say: `How far has each moved from the reference? z − z_ref is ${two(r.dw)} for ${name(r.w)} and ${two(r.dl)} for ${name(r.l)}. h = β × (${two(r.dw)} − ${par(r.dl)}) = ${beta} × ${two(r.dw - r.dl)} = ${two(r.h)}, and σ(h) = ${two(r.sig)}: how sure the policy already is that ${name(r.w)} wins.`,
    lines: ['h'],
    level: 2,
    vars: baseVars(s, settings),
    extra: work('adv'),
  };
  const end = endOf(s, r);
  yield {
    state: end,
    marks: [mark(`dz-a${r.w}`, 'found'), mark(`dz-a${r.l}`, 'remove')],
    say: `The loss −log σ(h) moves ${name(r.w)}'s logit up and ${name(r.l)}'s down by η·β(1 − σ(h)) = ${LR} × ${beta} × ${two(1 - r.sig)} = ${two(r.step)}. The other two logits do not change.`,
    lines: ['move'],
    level: 2,
    vars: baseVars(end, settings),
    extra: work('pass'),
  };
  return end;
}

function* oneStep(
  s: S,
  settings: PoSettings,
  rng: Rng,
): Generator<PStep, { end: S; rec: Rec | null }, void> {
  if (settings.method === 'dpo') {
    if (!canPrefer(s.rewards)) {
      yield {
        state: s,
        marks: [],
        say: 'Every answer has the same reward, so no answer is preferred to another: DPO has no pairs to learn from.',
        lines: ['pair'],
        level: 1,
        vars: baseVars(s, settings),
      };
      return { end: s, rec: null };
    }
    const r = dpoStep(s, settings, rng);
    return { end: yield* dpoSteps(s, r, settings), rec: r };
  }
  const r = rlStep(s, settings, rng);
  return { end: yield* rlSteps(s, r, settings), rec: r };
}

function summary(before: S, end: S): string {
  const p0 = policy(before.z);
  const p1 = policy(end.z);
  const best = p1.indexOf(Math.max(...p1));
  const moves = ANSWERS.map((a, k) => `${a} ${two(p0[k]!)} → ${two(p1[k]!)}`).join(', ');
  return `${moves}. ${Name(best)} is now the most likely answer.`;
}

const stepOp: Op = {
  label: 'Step',
  arity: 0,
  *run(s, _args, { settings, rng }) {
    const { end, rec } = yield* oneStep(s, settings, rng);
    if (!rec) return s;
    yield {
      state: end,
      marks: [],
      say: `Step ${end.steps} done: ${summary(s, end)}`,
      lines: ['move'],
      level: 1,
      vars: baseVars(end, settings),
      extra: { work: { rec, stage: 'done' }, log: [rec] },
    };
    return end;
  },
};

const runOp: Op = {
  label: `Run ${RUN_STEPS} steps`,
  arity: 0,
  *run(s, _args, { settings, rng }) {
    let cur = s;
    const log: Rec[] = [];
    for (let k = 0; k < RUN_STEPS; k++) {
      if (settings.method === 'dpo' && !canPrefer(cur.rewards)) {
        yield* oneStep(cur, settings, rng);
        return cur;
      }
      const r =
        settings.method === 'dpo' ? dpoStep(cur, settings, rng) : rlStep(cur, settings, rng);
      const next = endOf(cur, r);
      log.push(r);
      const last = k === RUN_STEPS - 1;
      yield {
        state: next,
        marks: [],
        say: last
          ? `${RUN_STEPS} steps done (${next.steps} in all): ${summary(s, next)}`
          : `Step ${next.steps}: ${ANSWERS.map((a, j) => `${a} ${two(policy(next.z)[j]!)}`).join(', ')}.`,
        lines: last ? ['rsig'] : ['rfor'],
        level: last ? 1 : 2,
        vars: baseVars(next, settings),
        extra: last
          ? { work: { rec: r, stage: 'done' }, log }
          : { work: { rec: r, stage: 'done' } },
      };
      cur = next;
    }
    return cur;
  },
};

const rewardsOp: Op = {
  label: 'Set rewards',
  arity: 1,
  *run(s, args, { settings }) {
    const r = parseRewards(String(args[0]));
    if (r instanceof Error) {
      yield {
        state: s,
        marks: [],
        say: r.message,
        lines: [],
        level: 1,
        vars: baseVars(s, settings),
      };
      return s;
    }
    const next: S = { z: [...REF_LOGITS], rewards: r, v: 0, steps: 0 };
    yield {
      state: next,
      marks: ANSWERS.map((_, k) => mark(`r-a${k}`, 'new')),
      say: `Rewards ${ANSWERS.map((a, k) => `${a} ${num(r[k]!)}`).join(', ')}. The policy starts again from the reference.`,
      lines: ['rset'],
      level: 1,
      vars: baseVars(next, settings),
    };
    return next;
  },
};

const resetOp: Op = {
  label: 'Back to the reference',
  arity: 0,
  *run(s, _args, { settings }) {
    const next: S = { ...s, z: [...REF_LOGITS], v: 0, steps: 0 };
    yield {
      state: next,
      marks: ANSWERS.map((_, k) => mark(`pi-a${k}`, 'new')),
      say: 'Back to the reference policy, the one training started from. The rewards stay.',
      lines: ['xsig'],
      level: 1,
      vars: baseVars(next, settings),
    };
    return next;
  },
};

export const ops = { step: stepOp, run: runOp, rewards: rewardsOp, reset: resetOp };

// ---------------------------------------------------------------------------------------------
// Pseudocode

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export const methodName: Record<Method, string> = {
  reinforce: 'REINFORCE',
  ppo: 'PPO',
  grpo: 'GRPO',
  dpo: 'DPO',
};

export function pseudocode(settings: PoSettings): PseudoBlock[] {
  const m = settings.method;
  const beta = settings.beta;
  const eps = settings.clip;
  const kl = Number(beta) > 0;
  let lines;
  if (m === 'dpo') {
    lines = [
      L('sig', 0, 'DPO-STEP()', 'Learn from one preference:'),
      L(
        'pair',
        1,
        'y_w ≻ y_l: two answers from π_ref, the better one preferred',
        'Take two answers and the one people preferred.',
      ),
      L(
        'h',
        1,
        `h = β[(z_w − z_ref,w) − (z_l − z_ref,l)]   (β = ${beta})`,
        'How much more the winner has grown than the loser, since the start.',
      ),
      L(
        'move',
        1,
        `z_w += η·β(1 − σ(h));  z_l −= η·β(1 − σ(h))   (η = ${LR})`,
        'Push the winner up and the loser down, less as the policy gets sure.',
      ),
    ];
  } else {
    const adv =
      m === 'grpo'
        ? L(
            'adv',
            1,
            'A_i = (r_i − mean(r)) / std(r)',
            'Score each answer against the rest of its group.',
          )
        : m === 'ppo'
          ? L(
              'adv',
              1,
              kl ? 'A_i = r_i − β·log(π(a_i)/π_ref(a_i)) − V' : 'A_i = r_i − V',
              'Score each answer against what the critic expected.',
            )
          : L(
              'adv',
              1,
              kl ? 'A_i = r_i − β·log(π(a_i)/π_ref(a_i))' : 'A_i = r_i',
              'Use the reward itself as the score.',
            );
    const clipLines =
      m === 'reinforce'
        ? [
            L(
              'grad',
              1,
              'g_k = (1/G) Σ_i A_i (1[a_i = k] − π_k)',
              'Raise each drawn answer by its score, the rest a little the other way.',
            ),
          ]
        : [
            L('for', 1, `repeat ${PASSES} times on the same group`, 'Learn from the group twice:'),
            L(
              'ratio',
              2,
              'ρ_i = π(a_i) / π_old(a_i)',
              'How much more likely each answer is than when it was drawn.',
            ),
            L(
              'clip',
              2,
              `skip i if A_i > 0, ρ_i > 1 + ${eps} or A_i < 0, ρ_i < 1 − ${eps}`,
              'Ignore answers already moved far enough the way their score wants.',
            ),
            L(
              'grad',
              2,
              'g_k = (1/G) Σ_i A_i ρ_i (1[a_i = k] − π_k)',
              'Raise good answers and lower bad ones.',
            ),
            ...(m === 'grpo' && kl
              ? [
                  L(
                    'kl',
                    2,
                    `g_k −= (β/G) Σ_i (1 − π_ref(a_i)/π(a_i)) (1[a_i = k] − π_k)   (β = ${beta})`,
                    'Pull back toward the reference policy.',
                  ),
                ]
              : []),
          ];
    lines = [
      L('sig', 0, `${methodName[m]}-STEP()`, 'Learn from one group of answers:'),
      L('draw', 1, `a_1 … a_${G} ~ π_old = π`, `Let the policy answer ${G} times.`),
      adv,
      ...clipLines,
      L('move', m === 'reinforce' ? 1 : 2, `z_k += η·g_k   (η = ${LR})`, 'Move every logit.'),
      ...(m === 'ppo'
        ? [L('critic', 1, 'V += ½(mean(r) − V)', 'The critic learns what to expect.')]
        : []),
    ];
  }
  return [
    { op: 'step', lines },
    {
      op: 'run',
      lines: [
        L('rsig', 0, 'RUN()', `Train for ${RUN_STEPS} steps:`),
        L(
          'rfor',
          1,
          `repeat ${RUN_STEPS} times: ${methodName[m]}-STEP()`,
          'one step after another.',
        ),
      ],
    },
    {
      op: 'rewards',
      lines: [
        L('rsetsig', 0, 'SET-REWARDS(r)', 'Change what each answer is worth:'),
        L('rset', 1, 'rewards ← r; z ← z_ref', 'and start again from the reference policy.'),
      ],
    },
    {
      op: 'reset',
      lines: [
        L('xsig', 0, 'RESET()', 'Start again:'),
        L('xz', 1, 'z ← z_ref', 'from the reference policy.'),
      ],
    },
  ];
}

// ---------------------------------------------------------------------------------------------
// Words for screen readers and narration

export function initialSay(s: S): string {
  const p = policy(s.z);
  return `One prompt, "${PROMPT}", and four answers. The policy starts as the reference: ${ANSWERS.map((a, k) => `${a} ${two(p[k]!)}`).join(', ')}. Only Canberra is right. Press Step: the policy answers, the answers are scored, and the bars move.`;
}

export const initialVars = (s: S, settings: PoSettings) => baseVars(s, settings);

export function describe(s: S): string {
  const p = policy(s.z);
  return `After ${s.steps} steps. ${ANSWERS.map((a, k) => `${a}: reward ${num(s.rewards[k]!)}, probability ${two(p[k]!)} (reference ${two(REF[k]!)})`).join('; ')}.`;
}
