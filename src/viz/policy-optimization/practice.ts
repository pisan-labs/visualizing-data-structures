import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { round3, two } from '../_lm/numbers';
import {
  ANSWERS,
  defaults,
  LR,
  policy,
  type DpoRec,
  type Method,
  type PoExtra,
  type PoSettings,
  type PoState,
  type Rec,
  type RlRec,
} from './model';

type Def = VizDef<PoState, PoSettings, PoExtra>;

const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[rng.int(0, xs.length - 1)]!;
const REWARDS = [
  '1 0.3 0.2 0.5',
  '1 0 0 0',
  '1 -1 -1 0',
  '0.8 0.2 0.4 0.6',
  '1 0.5 0 0.25',
  '0.9 0.1 0.3 0.5',
  '1 0.2 0.2 0.6',
  '0.7 0.4 0 0.2',
];
const num = (x: number) => String(Math.round(x * 100) / 100).replace('-', '−');
const signed = (x: number) => (x > 0 ? `+${two(x)}` : two(x));
const three = (x: number) => round3(x).replace('-', '−');

/**
 * Practice for policy optimization. The picture shows the policy after the setup (some rewards
 * and a step or two); the questions ask about the next step, whose group or pair is drawn by
 * the model and named in the prompt. Every answer comes from running the model.
 */
export function policyPractice(def: () => Def): PracticeKind[] {
  /** A setup, the state it ends in, and the record of the step after it. */
  function next(rng: Rng, settings: PoSettings, most = 3) {
    const least = settings.method === 'dpo' ? 1 : 0;
    const setup: OpCall[] = [
      ['rewards', pick(rng, REWARDS)],
      ...Array.from({ length: rng.int(least, most) }, () => ['step'] as OpCall),
    ];
    const watch: OpCall[] = [['step']];
    const before = new Timeline(def(), settings, 1, setup).endState();
    const t = new Timeline(def(), settings, 1, [...setup, ...watch]);
    const rec: Rec = t.entries.at(-1)!.steps.at(-1)!.extra!.log![0]!;
    return { setup, watch, before, after: t.endState(), rec };
  }

  const groupText = (r: RlRec) =>
    r.draws.map((d, i) => `${ANSWERS[d.a]} (${num(r.r[i]!)})`).join(', ');

  return [
    {
      id: 'advantages',
      title: 'The advantages for a group',
      make(rng) {
        for (let tries = 0; ; tries++) {
          const settings: PoSettings = { ...defaults, method: 'grpo' };
          const { setup, watch, rec } = next(rng, settings, 6);
          const r = rec as RlRec;
          if (r.std === 0) continue;
          // Prefer groups of three or four different rewards: one against three is always ±1.73.
          if (tries < 30 && new Set(r.r).size < 3) continue;
          const i = rng.int(0, 3);
          return {
            prompt: `Next, GRPO draws the group ${groupText(r)}, rewards in brackets. What is the advantage of sample ${i + 1}, **${ANSWERS[r.draws[i]!.a]}**: (reward − mean) / standard deviation, dividing by 4 for the deviation? Two decimals.`,
            setup,
            settings,
            answer: { kind: 'number', value: r.adv[i]!, tolerance: 0.005 },
            explain: `The mean of ${r.r.map(num).join(', ')} is ${two(r.mean)}; the standard deviation is ${two(r.std)}. So (${num(r.r[i]!)} − ${r.mean < 0 ? `(${two(r.mean)})` : two(r.mean)}) / ${two(r.std)} = ${signed(r.adv[i]!)}. The four advantages add up to 0: the group is graded against itself.`,
            watch,
          };
        }
      },
    },
    {
      id: 'grows',
      title: 'Which bar grows most?',
      make(rng) {
        for (;;) {
          const method = pick(rng, ['grpo', 'ppo', 'reinforce'] as Method[]);
          const settings: PoSettings = { ...defaults, method, beta: '0' };
          const { setup, watch, before, after, rec } = next(rng, settings);
          const r = rec as RlRec;
          const p0 = policy(before.z);
          const p1 = policy(after.z);
          const gain = p1.map((x, k) => x - p0[k]!);
          const sorted = [...gain].sort((a, b) => b - a);
          if (sorted[0]! - sorted[1]! < 0.02) continue;
          const best = gain.indexOf(sorted[0]!);
          const how =
            method === 'grpo'
              ? 'scores each answer against the group’s mean'
              : method === 'ppo'
                ? `scores each answer against the critic’s value V = ${two(r.v)}`
                : 'uses the raw rewards as the scores';
          return {
            prompt: `Next, ${method === 'reinforce' ? 'REINFORCE' : method.toUpperCase()} (which ${how}) draws the group ${groupText(r)}, rewards in brackets. After the step, whose probability has grown the most?`,
            setup,
            settings,
            answer: { kind: 'choice', options: [...ANSWERS], correct: best },
            explain: `The advantages are ${r.draws.map((d, i) => `${ANSWERS[d.a]} ${signed(r.adv[i]!)}`).join(', ')}. ${ANSWERS[best]} gains the most: ${two(p0[best]!)} → ${two(p1[best]!)}.${method === 'reinforce' && r.adv.every((a) => a >= 0) ? ' With no baseline every reward is positive, so every answer drawn is pushed up; the most drawn, best rewarded one wins.' : ''}`,
            watch,
          };
        }
      },
    },
    {
      id: 'ratio',
      title: 'A clipped ratio',
      make(rng) {
        const eps = pick(rng, ['0.1', '0.2', '0.3']);
        const settings: PoSettings = {
          ...defaults,
          method: pick(rng, ['grpo', 'ppo'] as Method[]),
          clip: eps,
        };
        const { setup, watch, rec } = next(rng, settings);
        const r = rec as RlRec;
        const i = rng.int(0, 3);
        const a = r.draws[i]!.a;
        const pOld = r.pOld[a]!;
        const pNow = r.passes[1]!.p[a]!;
        const rho = r.passes[1]!.ratio[i]!;
        const e = Number(eps);
        const clipped = Math.min(1 + e, Math.max(1 - e, rho));
        return {
          prompt: `Sample ${i + 1} of the next group is **${ANSWERS[a]}**, drawn when π_old(${ANSWERS[a]}) = ${three(pOld)}. After the first pass π(${ANSWERS[a]}) = ${three(pNow)}. With ε = ${eps}, what is the clipped ratio clip(π / π_old, ${num(1 - e)}, ${num(1 + e)})? Two decimals.`,
          setup,
          settings,
          answer: { kind: 'number', value: clipped, tolerance: 0.01 },
          explain: `ρ = ${three(pNow)} / ${three(pOld)} = ${two(rho)}${
            rho > 1 + e
              ? `, above ${num(1 + e)}, so the clip caps it at ${num(1 + e)}`
              : rho < 1 - e
                ? `, below ${num(1 - e)}, so the clip raises it to ${num(1 - e)}`
                : `, inside ${num(1 - e)} to ${num(1 + e)}, so the clip leaves it alone`
          }. Its advantage is ${signed(r.adv[i]!)}; ${r.passes[1]!.clipped[i] ? 'the ratio has already moved the way that advantage pushes, so in pass 2 this sample adds nothing' : 'pass 2 still learns from it'}.`,
          watch,
        };
      },
    },
    {
      id: 'dpo',
      title: 'A DPO step',
      make(rng) {
        const beta = pick(rng, ['0.5', '1']);
        const settings: PoSettings = { ...defaults, method: 'dpo', beta };
        const { setup, watch, rec } = next(rng, settings);
        const r = rec as DpoRec;
        const w = ANSWERS[r.w]!;
        const l = ANSWERS[r.l]!;
        return {
          prompt: `Next, DPO learns that **${w}** is preferred to **${l}**. Their logits have moved from the reference by z − z_ref = ${three(r.dw)} (${w}) and ${three(r.dl)} (${l}), and β = ${beta}. With h = β × (${three(r.dw)} − (${three(r.dl)})), how far does ${w}'s logit go up: η·β(1 − σ(h)) with η = ${LR}? Two decimals.`,
          setup,
          settings,
          answer: { kind: 'number', value: r.step, tolerance: 0.005 },
          explain: `h = ${beta} × ${two(r.dw - r.dl)} = ${two(r.h)}, σ(h) = ${two(r.sig)}, so the step is ${LR} × ${beta} × ${two(1 - r.sig)} = ${two(r.step)}. ${l}'s logit goes down by the same.`,
          watch,
        };
      },
    },
  ];
}
