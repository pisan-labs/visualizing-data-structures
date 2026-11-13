import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeRng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { sampling } from '.';
import {
  parseLogits,
  parseU,
  randomLogits,
  REPEATS,
  runPass,
  START_LOGITS,
  type SampSettings,
  type Strategy,
} from './model';

/** Sampling written independently of the page: plain exp, a sorted copy, a running total. */
function reference(logits: number[], s: SampSettings, u: number) {
  const t = Number(s.temperature);
  const e = logits.map((l) => Math.exp(l / t));
  const total = e.reduce((a, b) => a + b, 0);
  const p = e.map((x) => x / total);
  const ranked = p.map((v, i) => ({ v, i })).sort((a, b) => (b.v !== a.v ? b.v - a.v : a.i - b.i));
  let keep: number;
  if (s.strategy === 'greedy') keep = 1;
  else if (s.strategy === 'pure') keep = p.length;
  else if (s.strategy === 'top-k') keep = Math.min(s.k, p.length);
  else if (s.strategy === 'min-p')
    keep = ranked.filter((r) => r.v >= Number(s.minP) * ranked[0]!.v).length;
  else {
    keep = 0;
    let cum = 0;
    while (keep < p.length && cum < Number(s.p) - 1e-12) cum += ranked[keep++]!.v;
  }
  const kept = ranked.slice(0, keep);
  const mass = kept.reduce((a, r) => a + r.v, 0);
  let pick = kept[0]!.i;
  if (s.strategy !== 'greedy') {
    let cum = 0;
    for (const r of kept) {
      cum += r.v / mass;
      if (u < cum) {
        pick = r.i;
        break;
      }
      pick = r.i;
    }
  }
  return { p, keep, kept: kept.map((r) => r.i), q: kept.map((r) => r.v / mass), pick };
}

const settingsArb = fc.record({
  strategy: fc.constantFrom<Strategy>('greedy', 'pure', 'top-k', 'top-p', 'min-p'),
  temperature: fc.constantFrom('0.5', '0.7', '1', '1.5', '2'),
  k: fc.integer({ min: 1, max: 8 }),
  p: fc.constantFrom('0.5', '0.75', '0.9', '0.95'),
  minP: fc.constantFrom('0.05', '0.1', '0.2', '0.3'),
});
const logitsArb = fc
  .array(fc.integer({ min: -30, max: 40 }), { minLength: 2, maxLength: 8 })
  .map((xs) => xs.map((x) => x / 10));

describe('sampling', () => {
  it('matches an independent reference on random logits and settings', () => {
    fc.assert(
      fc.property(
        logitsArb,
        settingsArb,
        fc.double({ min: 0, max: 0.999, noNaN: true }),
        (logits, s, u) => {
          const pass = runPass(logits, s, u);
          const ref = reference(logits, s, u);
          pass.p.forEach((v, i) => expect(v).toBeCloseTo(ref.p[i]!, 12));
          // Away from a knife edge of top-p, the cut agrees.
          expect(pass.keep).toBe(ref.keep);
          expect(pass.order.slice(0, pass.keep)).toEqual(ref.kept);
          ref.kept.forEach((i, k) => expect(pass.q[i]).toBeCloseTo(ref.q[k]!, 12));
          // Away from a stretch's edge, the draw agrees.
          const edge = pass.to.some((t) => Math.abs(t - u) < 1e-9);
          if (!edge) expect(pass.order[pass.at]).toBe(ref.pick);
        },
      ),
      { numRuns: 400 },
    );
  });

  it('keeps its invariants on every step of random runs', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 4, max: 8 }), { minLength: 1, maxLength: 3 }),
        settingsArb,
        fc.integer({ min: 1, max: 1000 }),
        (sizes, s, seed) => {
          const rng = makeRng(seed);
          const calls = sizes.flatMap((n): OpCall[] => [
            ['load', randomLogits(rng, n)],
            ['softmax'],
            ['sample'],
            ['repeat'],
          ]);
          const t = new Timeline(sampling, s, seed, calls);
          for (const e of t.entries)
            for (const step of e.steps) {
              const pass = step.extra?.work?.pass ?? step.state.pass;
              if (!pass) continue;
              expect(pass.p.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
              expect(pass.keep).toBeGreaterThanOrEqual(1);
              expect(pass.keep).toBeLessThanOrEqual(pass.p.length);
              // The survivors are the most likely words, and they add up to 1 again.
              const kept = pass.order.slice(0, pass.keep);
              const dropped = pass.order.slice(pass.keep);
              for (const i of dropped) expect(pass.q[i]).toBe(0);
              expect(kept.reduce((a, i) => a + pass.q[i]!, 0)).toBeCloseTo(1, 12);
              if (dropped.length)
                expect(Math.min(...kept.map((i) => pass.p[i]!))).toBeGreaterThanOrEqual(
                  Math.max(...dropped.map((i) => pass.p[i]!)),
                );
              // The word drawn survived the cut.
              expect(pass.at).toBeLessThan(pass.keep);
              if (s.strategy === 'greedy') expect(pass.at).toBe(0);
            }
          const end = t.endState();
          expect(end.tally.reduce((a, b) => a + b, 0)).toBe(1 + REPEATS);
        },
      ),
      { numRuns: 80 },
    );
  });

  it('cuts the start logits as the concept page says', () => {
    const at = (strategy: Strategy, extra: Partial<SampSettings> = {}) =>
      runPass(START_LOGITS, { ...sampling.defaults, strategy, ...extra }, 0.5);
    expect(at('top-p').keep).toBe(4);
    expect(at('top-k').keep).toBe(3);
    expect(at('min-p').keep).toBe(4);
    expect(at('min-p', { minP: '0.2' }).keep).toBe(3);
    expect(at('greedy').keep).toBe(1);
    expect(at('pure', { temperature: '2' }).p[7]).toBeCloseTo(0.0293, 4);
    expect(at('pure', { temperature: '0.5' }).p[0]).toBeCloseTo(0.7697, 4);
  });

  it('parses logits and u, and refuses what does not fit', () => {
    expect(parseLogits('3.2, 2.4 −1')).toEqual([3.2, 2.4, -1]);
    expect(parseLogits('1')).toBeInstanceOf(Error);
    expect(parseLogits('1 2 3 4 5 6 7 8 9')).toBeInstanceOf(Error);
    expect(parseLogits('1 cat')).toBeInstanceOf(Error);
    expect(parseLogits('1 11')).toBeInstanceOf(Error);
    expect(parseU('0.62')).toBe(0.62);
    expect(parseU('.5')).toBe(0.5);
    expect(parseU('1')).toBeInstanceOf(Error);
    expect(parseU('-0.1')).toBeInstanceOf(Error);
    expect(sampling.controls.input!.parse('0.3')).toBe('0.3');
    expect(sampling.controls.input!.parse(sampling.controls.input!.sample!)).toBe(
      START_LOGITS.join(' '),
    );
  });

  it('stays readable on a laptop and a phone', () => {
    expect(smallestText(sampling, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(sampling, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
