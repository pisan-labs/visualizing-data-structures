import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeRng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { policyOptimization as def } from '.';
import {
  advantages,
  ANSWERS,
  dpoStep,
  G,
  init,
  kl,
  LR,
  parseRewards,
  pass,
  policy,
  REF,
  REF_LOGITS,
  type DpoRec,
  type PoSettings,
  type RlRec,
} from './model';

const logp = (z: number[], k: number) => {
  const m = Math.max(...z);
  const lse = m + Math.log(z.reduce((t, x) => t + Math.exp(x - m), 0));
  return z[k]! - lse;
};

/**
 * The objective each method climbs, written from the papers and independent of the page:
 * REINFORCE (1/G) Σ A_i log π(a_i); PPO and GRPO (1/G) Σ min(ρ_i A_i, clip(ρ_i) A_i), GRPO
 * minus β (1/G) Σ (π_ref/π − log(π_ref/π) − 1).
 */
function objective(
  method: 'reinforce' | 'ppo' | 'grpo',
  z: number[],
  pOld: number[],
  group: number[],
  adv: number[],
  eps: number,
  beta: number,
) {
  let j = 0;
  group.forEach((a, i) => {
    const lp = logp(z, a);
    if (method === 'reinforce') j += adv[i]! * lp;
    else {
      const rho = Math.exp(lp) / pOld[a]!;
      const c = Math.min(1 + eps, Math.max(1 - eps, rho));
      j += Math.min(rho * adv[i]!, c * adv[i]!);
    }
    if (method === 'grpo') {
      const q = REF[a]! / Math.exp(lp);
      j -= beta * (q - Math.log(q) - 1);
    }
  });
  return j / group.length;
}

const numericGrad = (f: (z: number[]) => number, z: number[]) =>
  z.map((_, k) => {
    const h = 1e-6;
    const up = [...z];
    const down = [...z];
    up[k]! += h;
    down[k]! -= h;
    return (f(up) - f(down)) / (2 * h);
  });

const logitArb = fc.array(
  fc.integer({ min: -20, max: 20 }).map((k) => k / 10),
  { minLength: 4, maxLength: 4 },
);
const rewardArb = fc.array(
  fc.integer({ min: -4, max: 4 }).map((k) => k / 4),
  { minLength: 4, maxLength: 4 },
);
const groupArb = fc.array(fc.integer({ min: 0, max: 3 }), { minLength: 4, maxLength: 4 });

describe('policy-optimization', () => {
  it('each pass is a gradient step on the method’s objective', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('reinforce' as const, 'ppo' as const, 'grpo' as const),
        logitArb,
        logitArb,
        groupArb,
        rewardArb,
        fc.constantFrom(0.1, 0.2, 0.3),
        fc.constantFrom(0, 0.1, 0.5),
        (method, zOld, drift, group, rewards, eps, beta) => {
          const pOld = policy(zOld);
          const z = zOld.map((x, k) => x + drift[k]! / 4);
          const { adv } = advantages(method, pOld, group, rewards, beta, 0.25);
          const ps = pass(method, z, pOld, group, adv, eps, beta);
          // Away from the clip's corners, where the objective has a kink.
          const p = policy(z);
          const nearKink = group.some((a) => {
            const rho = p[a]! / pOld[a]!;
            return Math.abs(rho - 1 - eps) < 1e-3 || Math.abs(rho - 1 + eps) < 1e-3;
          });
          if (nearKink) return;
          const g = numericGrad((zz) => objective(method, zz, pOld, group, adv, eps, beta), z);
          ps.dz.forEach((d, k) => expect(d).toBeCloseTo(LR * g[k]!, 5));
        },
      ),
      { numRuns: 400 },
    );
  });

  it('DPO is a gradient step on −log σ(h)', () => {
    fc.assert(
      fc.property(
        logitArb,
        fc.constantFrom(0.1, 0.5, 1),
        fc.integer({ min: 1, max: 1000 }),
        (z, beta, seed) => {
          const s = { ...init(), z };
          const r = dpoStep(s, { method: 'dpo', clip: '0.2', beta: String(beta) }, makeRng(seed));
          const loss = (zz: number[]) => {
            const h = beta * (zz[r.w]! - REF_LOGITS[r.w]! - (zz[r.l]! - REF_LOGITS[r.l]!));
            return Math.log(1 + Math.exp(-h));
          };
          const g = numericGrad(loss, z);
          r.z.forEach((x, k) => expect(x - z[k]!).toBeCloseTo(-LR * g[k]!, 6));
          // The winner has the higher reward, and only two logits move.
          expect(s.rewards[r.w]!).toBeGreaterThan(s.rewards[r.l]!);
          expect(r.z.filter((x, k) => x !== z[k]).length).toBeLessThanOrEqual(2);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('keeps its invariants on every step of random runs', () => {
    const callArb: fc.Arbitrary<OpCall> = fc.oneof(
      { weight: 4, arbitrary: fc.constant(['step'] as OpCall) },
      fc.constant(['run'] as OpCall),
      fc.constant(['reset'] as OpCall),
      rewardArb.map((r) => ['rewards', r.join(' ')] as OpCall),
    );
    fc.assert(
      fc.property(
        fc.array(callArb, { maxLength: 6 }),
        fc.record({
          method: fc.constantFrom('reinforce', 'ppo', 'grpo', 'dpo'),
          clip: fc.constantFrom('0.1', '0.2', '0.3'),
          beta: fc.constantFrom('0', '0.04', '0.1', '0.5', '1'),
        }),
        fc.integer({ min: 1, max: 1000 }),
        (calls, settings: PoSettings, seed) => {
          const t = new Timeline(def, settings, seed, calls);
          for (const e of t.entries)
            for (const step of e.steps) {
              const p = policy(step.state.z);
              expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
              expect(kl(p)).toBeGreaterThanOrEqual(-1e-12);
              for (const x of step.state.z) expect(Number.isFinite(x)).toBe(true);
              const rec = step.extra?.work?.rec;
              if (rec?.kind === 'rl') checkRl(rec, settings);
              if (rec?.kind === 'dpo') checkDpo(rec);
            }
        },
      ),
      { numRuns: 80 },
    );
  });

  function checkRl(r: RlRec, settings: PoSettings) {
    expect(r.draws).toHaveLength(G);
    if (r.method === 'grpo' && r.std > 0) {
      expect(r.adv.reduce((a, b) => a + b, 0)).toBeCloseTo(0, 9);
      expect(Math.sqrt(r.adv.reduce((a, b) => a + b * b, 0) / G)).toBeCloseTo(1, 9);
    }
    // The first pass starts from the old policy: every ratio is 1 and nothing is clipped.
    expect(r.passes[0]!.ratio.every((x) => Math.abs(x - 1) < 1e-12)).toBe(true);
    expect(r.passes[0]!.clipped.some(Boolean)).toBe(false);
    const eps = Number(settings.clip);
    for (const ps of r.passes)
      ps.clipped.forEach((c, i) => {
        const A = r.adv[i]!;
        const rho = ps.ratio[i]!;
        expect(c).toBe((A > 0 && rho > 1 + eps) || (A < 0 && rho < 1 - eps));
      });
    expect(r.passes).toHaveLength(r.method === 'reinforce' ? 1 : 2);
  }

  function checkDpo(r: DpoRec) {
    expect(r.w).not.toBe(r.l);
    expect(r.step).toBeGreaterThanOrEqual(0);
  }

  it('tells the story the examples tell', () => {
    const end = (id: string) => {
      const ex = def.examples.find((e) => e.id === id)!;
      return new Timeline(def, { ...def.defaults, ...ex.settings }, ex.seed, ex.ops);
    };
    const p = (id: string) => policy(end(id).endState().z);
    const two = (x: number) => Math.round(x * 100) / 100;
    expect(REF.map(two)).toEqual([0.3, 0.4, 0.2, 0.1]);
    // GRPO: one step lifts Canberra; ten make it nearly certain.
    expect(two(p('grpo-step')[0]!)).toBe(0.39);
    expect(two(p('grpo-run')[0]!)).toBe(0.89);
    // Raw rewards: a group of wrong answers pushes a wrong answer up.
    expect(p('reinforce-raw')[2]!).toBeGreaterThan(REF[2]!);
    expect(p('reinforce-raw')[0]!).toBeLessThan(REF[0]!);
    // The clip: in the second pass the Canberra samples add nothing.
    const clip = end('ppo-clip').entries[1]!.steps.at(-1)!.extra!.log![0] as RlRec;
    expect(clip.passes[1]!.clipped.filter(Boolean)).toHaveLength(3);
    // A heavy KL weight holds the policy back.
    expect(p('kl-leash')[0]!).toBeLessThan(0.75);
    // Equal rewards: nothing moves.
    expect(end('all-equal').endState().z).toEqual(REF_LOGITS);
    expect(two(p('dpo-run')[0]!)).toBe(0.71);
  });

  it('parses rewards and refuses what does not fit', () => {
    expect(parseRewards('1 0.3, 0.2 0.5')).toEqual([1, 0.3, 0.2, 0.5]);
    expect(parseRewards('1 0 0')).toBeInstanceOf(Error);
    expect(parseRewards('1 0 0 2')).toBeInstanceOf(Error);
    expect(parseRewards('1 0 0 0.125')).toBeInstanceOf(Error);
    expect(parseRewards('a b c d')).toBeInstanceOf(Error);
    expect(ANSWERS).toHaveLength(4);
  });

  it('stays readable on a laptop and a phone', () => {
    expect(smallestText(def, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(def, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
