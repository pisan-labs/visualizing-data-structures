import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { lora } from '.';
import {
  bestLoss,
  delta,
  DIM,
  frozenW,
  lossOf,
  parseTarget,
  rankOf,
  scaleOf,
  STEPS,
  type Init,
  type LoraSettings,
} from './model';

/**
 * LoRA training written independently of the page: the parameters as one flat list (B, then
 * A), the gradient by the chain rule entry by entry, and Adam with β powers from Math.pow.
 */
function reference(b0: number[][], a0: number[][], target: number[][], s: number, steps: number) {
  const d = b0.length;
  const r = a0.length;
  const p = [...b0.flat(), ...a0.flat()];
  const B = (i: number, k: number) => p[i * r + k]!;
  const A = (k: number, j: number) => p[d * r + k * d + j]!;
  const m = p.map(() => 0);
  const v = p.map(() => 0);
  for (let t = 1; t <= steps; t++) {
    // Sums in index order, as the page adds them: Adam turns a gradient that is exactly 0 in one
    // and 1e-17 in the other into a whole step, so the order of the additions has to agree.
    const g = p.map(() => 0);
    for (let i = 0; i < d; i++)
      for (let j = 0; j < d; j++) {
        let ba = 0;
        for (let k = 0; k < r; k++) ba += B(i, k) * A(k, j);
        const e = 2 * (s * ba - target[i]![j]!);
        for (let k = 0; k < r; k++) {
          g[i * r + k]! += e * A(k, j);
          g[d * r + k * d + j]! += B(i, k) * e;
        }
      }
    for (let n = 0; n < g.length; n++) g[n] = s * g[n]!;
    for (let n = 0; n < p.length; n++) {
      m[n] = 0.9 * m[n]! + 0.1 * g[n]!;
      v[n] = 0.999 * v[n]! + 0.001 * g[n]! * g[n]!;
      const mh = m[n]! / (1 - 0.9 ** t);
      const vh = v[n]! / (1 - 0.999 ** t);
      p[n] = p[n]! - (0.1 * mh) / (Math.sqrt(vh) + 1e-8);
    }
  }
  const b = Array.from({ length: d }, (_, i) => Array.from({ length: r }, (_, k) => B(i, k)));
  const a = Array.from({ length: r }, (_, k) => Array.from({ length: d }, (_, j) => A(k, j)));
  return { b, a };
}

const settingsArb = fc.record({
  rank: fc.integer({ min: 1, max: 4 }),
  alpha: fc.constantFrom('1' as const, '2' as const, '4' as const, '8' as const),
  init: fc.constantFrom('paper' as Init, 'random' as Init, 'zero' as Init),
});
const targetArb = fc.oneof(
  fc.integer({ min: 1, max: 4 }).map(String),
  fc
    .array(fc.integer({ min: -30, max: 30 }), { minLength: 16, maxLength: 16 })
    .map((xs) => xs.map((x) => x / 10).join(' ')),
);
const callArb: fc.Arbitrary<OpCall> = fc.oneof(
  targetArb.map((t) => ['target', t] as OpCall),
  fc.constant(['train'] as OpCall),
  fc.constant(['merge'] as OpCall),
);

describe('lora', () => {
  it('trains like an independent reference', () => {
    fc.assert(
      fc.property(settingsArb, targetArb, fc.integer({ min: 1, max: 500 }), (set, text, seed) => {
        const settings: LoraSettings = { ...set };
        const t = new Timeline(lora, settings, seed, [['target', text], ['train'], ['train']]);
        const start = t.entries[0]!.end;
        const end = t.endState();
        const ref = reference(start.b, start.a, start.target, scaleOf(settings), 2 * STEPS);
        end.b.forEach((row, i) => row.forEach((x, k) => expect(x).toBeCloseTo(ref.b[i]![k]!, 6)));
        end.a.forEach((row, k) => row.forEach((x, j) => expect(x).toBeCloseTo(ref.a[k]![j]!, 6)));
      }),
      { numRuns: 200 },
    );
  });

  it('keeps its invariants on every step of random runs', () => {
    fc.assert(
      fc.property(
        settingsArb,
        fc.array(callArb, { maxLength: 8 }),
        fc.integer({ min: 1, max: 500 }),
        (set, calls, seed) => {
          const settings: LoraSettings = { ...set };
          const r = settings.rank;
          const sc = scaleOf(settings);
          const w = frozenW();
          const t = new Timeline(lora, settings, seed, calls);
          for (let i = 0; i < t.length; i++) {
            const s = t.at(i).step.state;
            // W is frozen: training never touches it; a merge shows W + ΔW beside it.
            expect(s.w).toEqual(w);
            expect(s.b).toHaveLength(DIM);
            for (const row of s.b) expect(row).toHaveLength(r);
            expect(s.a).toHaveLength(r);
            const formed = s.dw?.every((row) => row.every(Number.isFinite));
            if (formed && s.loss !== null) {
              // ΔW is (α/r)·B·A, its rank is at most r, and the loss never beats the floor.
              const dw = delta(s.b, s.a, sc);
              s.dw!.forEach((row, a) => row.forEach((x, c) => expect(x).toBe(dw[a]![c])));
              expect(s.loss).toBe(lossOf(dw, s.target));
              expect(rankOf(dw)).toBeLessThanOrEqual(r);
              expect(s.loss).toBeGreaterThanOrEqual(bestLoss(s.target, r) - 1e-6);
            }
          }
          // A merge fills W + ΔW row by row; once done, every row is merged.
          for (const { end: s } of t.entries)
            if (s.merged)
              s.merged.forEach((row, a) =>
                row.forEach((x, c) => expect(x).toBeCloseTo(w[a]![c]! + s.dw![a]![c]!, 12)),
              );
        },
      ),
      { numRuns: 80 },
    );
  });

  it('starts unchanged with the paper start, and moves only B on the first step', () => {
    const t = new Timeline(lora, { rank: 2, alpha: '2', init: 'paper' }, 3, [
      ['target', '2'],
      ['train'],
    ]);
    const made = t.entries[0]!.end;
    expect(made.b.flat().every((x) => x === 0)).toBe(true);
    const steps = t.entries[1]!.steps;
    const formed = steps.find((s) => s.state.dw)!.state;
    expect(formed.dw!.flat().every((x) => x === 0)).toBe(true);
    expect(formed.loss).toBe(lossOf(formed.dw!, made.target));
    const first = steps.find((s) => s.state.steps === 1)!.state;
    expect(first.a).toEqual(made.a);
    expect(first.b).not.toEqual(made.b);
    const second = steps.find((s) => s.state.steps === 2)!.state;
    expect(second.a).not.toEqual(made.a);
  });

  it('never moves when B and A both start at zero', () => {
    const t = new Timeline(lora, { rank: 2, alpha: '2', init: 'zero' }, 3, [
      ['target', '2'],
      ['train'],
      ['train'],
    ]);
    const end = t.endState();
    expect(end.b.flat().every((x) => x === 0)).toBe(true);
    expect(end.a.flat().every((x) => x === 0)).toBe(true);
    expect(end.steps).toBe(2 * STEPS);
  });

  it('tells the story the examples tell', () => {
    const end = (id: string) => {
      const ex = lora.examples.find((e) => e.id === id)!;
      return new Timeline(lora, ex.settings as LoraSettings, ex.seed, ex.ops).endState();
    };
    const fixed = (x: number) => x.toFixed(2);
    expect(fixed(end('rank-one-target').loss!)).toBe('0.00');
    expect(fixed(end('rank-one-falls-short').loss!)).toBe('4.01');
    expect(fixed(bestLoss(end('rank-one-falls-short').target, 1))).toBe('4.00');
    expect(fixed(end('rank-two-reaches').loss!)).toBe('0.02');
    expect(fixed(end('full-rank-target').loss!)).toBe('5.36');
    expect(fixed(bestLoss(end('full-rank-target').target, 2))).toBe('5.33');
    expect(end('both-zero').loss).toBe(16);
    expect(end('merge-for-serving').merged).not.toBeNull();
    const rnd = lora.examples.find((e) => e.id === 'both-random')!;
    const t = new Timeline(lora, rnd.settings as LoraSettings, rnd.seed, rnd.ops);
    expect(fixed(t.entries[1]!.steps.find((s) => s.state.loss !== null)!.state.loss!)).toBe(
      '18.81',
    );
    const big = lora.examples.find((e) => e.id === 'alpha-large')!;
    const tb = new Timeline(lora, big.settings as LoraSettings, big.seed, big.ops);
    expect(fixed(tb.entries[1]!.steps.find((s) => s.state.steps === 1)!.state.loss!)).toBe('16.97');
  });

  it('knows the rank of a matrix and the best a rank-r update can do', () => {
    const id = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const m = (xs: number[]) => Array.from({ length: 4 }, (_, i) => xs.slice(4 * i, 4 * i + 4));
    expect(rankOf(m(id))).toBe(4);
    expect(bestLoss(m(id), 1)).toBeCloseTo(3, 9);
    expect(bestLoss(m(id), 4)).toBe(0);
    const row = [1, -2, 0, 3];
    expect(rankOf(m([...row, ...row.map((x) => 2 * x), ...row, ...row.map((x) => -x)]))).toBe(1);
    expect(rankOf(m(Array(16).fill(0)))).toBe(0);
  });

  it('parses targets and refuses what does not fit', () => {
    expect(parseTarget('2')).toEqual({ rank: 2 });
    expect(parseTarget('5')).toBeInstanceOf(Error);
    expect(parseTarget('0')).toBeInstanceOf(Error);
    expect(parseTarget('1 2 3')).toBeInstanceOf(Error);
    expect(parseTarget('cat')).toBeInstanceOf(Error);
    expect(parseTarget(Array(16).fill('0.25').join(' '))).toBeInstanceOf(Error);
    expect(parseTarget(Array(16).fill('10').join(' '))).toBeInstanceOf(Error);
    const ok = parseTarget('1, 0, 0, 0; 0 1 0 0 / 0 0 1 0 | 0 0 0 −1');
    expect(ok).toEqual({
      m: [
        [1, 0, 0, 0],
        [0, 1, 0, 0],
        [0, 0, 1, 0],
        [0, 0, 0, -1],
      ],
    });
  });

  it('stays readable on a laptop and a phone', () => {
    expect(smallestText(lora, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(lora, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
