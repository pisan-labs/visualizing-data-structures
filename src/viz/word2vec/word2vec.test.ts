import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeRng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { randomSentence, word2vec } from '.';
import {
  applyUpdate,
  cosine,
  drawNegatives,
  init,
  NOISE,
  parsePair,
  parseSentence,
  VOCAB,
  windowPairs,
  wordId,
  type Vec2,
  type W2vSettings,
  type W2vState,
} from './model';

const sig = (x: number) => 1 / (1 + Math.exp(-x));
const dot = (a: Vec2, b: Vec2) => a[0] * b[0] + a[1] * b[1];

/** SLP3's update, every term from the old vectors, written independently of the page. */
function reference(s: W2vState, center: number, context: number, negs: number[], lr: number) {
  const w = s.w[center]!;
  const cp = s.c[context]!;
  const gp = sig(dot(w, cp)) - 1;
  const c = s.c.map((v) => [...v] as [number, number]);
  c[context] = [cp[0] - lr * gp * w[0], cp[1] - lr * gp * w[1]];
  let gw: [number, number] = [gp * cp[0], gp * cp[1]];
  for (const n of negs) {
    const cn = s.c[n]!;
    const g = sig(dot(w, cn));
    c[n] = [cn[0] - lr * g * w[0], cn[1] - lr * g * w[1]];
    gw = [gw[0] + g * cn[0], gw[1] + g * cn[1]];
  }
  return { w: [w[0] - lr * gw[0], w[1] - lr * gw[1]], c };
}

const coord = fc.integer({ min: -20, max: 20 }).map((k) => k / 10);
const vecArb = fc.tuple(coord, coord) as fc.Arbitrary<Vec2>;
const stateArb = fc
  .record({
    w: fc.array(vecArb, { minLength: 8, maxLength: 8 }),
    c: fc.array(vecArb, { minLength: 8, maxLength: 8 }),
  })
  .map((v): W2vState => ({ ...v, pairs: 0, passes: 0, reach: 3 }));
const wordArb = fc.constantFrom(...VOCAB);
const sentenceArb = fc.array(wordArb, { minLength: 1, maxLength: 8 }).map((w) => w.join(' '));
const settingsArb = fc.record({
  window: fc.integer({ min: 1, max: 3 }),
  negatives: fc.integer({ min: 0, max: 4 }),
  lr: fc.constantFrom('0.05', '0.1', '0.25', '0.5'),
});

describe('word2vec', () => {
  it('matches SLP3’s update on random vectors and pairs', () => {
    fc.assert(
      fc.property(
        stateArb,
        fc.integer({ min: 0, max: 7 }),
        fc.integer({ min: 0, max: 7 }),
        fc.integer({ min: 0, max: 4 }),
        fc.integer({ min: 1, max: 1000 }),
        fc.constantFrom(0.05, 0.1, 0.25, 0.5),
        (s, center, context, k, seed, lr) => {
          const { negs } = drawNegatives(makeRng(seed), k, center, context);
          const r = applyUpdate(s, center, context, negs, lr);
          const ref = reference(s, center, context, negs, lr);
          const end = r.states.at(-1)!;
          end.w[center]!.forEach((x, i) => expect(x).toBeCloseTo(ref.w[i]!, 12));
          end.c.forEach((v, t) => v.forEach((x, i) => expect(x).toBeCloseTo(ref.c[t]![i]!, 12)));
          // Only the center's word vector moves.
          end.w.forEach((v, t) => t !== center && expect(v).toEqual(s.w[t]));
          // The context is pulled along w, the noise words pushed against it.
          expect(r.coefs[0]).toBeGreaterThan(0);
          for (const c of r.coefs.slice(1)) expect(c).toBeLessThan(0);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('draws distinct noise words, never the pair’s own, in proportion to count^0.75', () => {
    expect(NOISE.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    // the (8 of 22 words): 8^0.75 / (8^0.75 + 2 · 3^0.75 + 3 · 2^0.75 + 2) = 0.291.
    expect(NOISE[wordId('the')]).toBeCloseTo(0.291, 3);
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 7 }),
        fc.integer({ min: 0, max: 7 }),
        fc.integer({ min: 0, max: 4 }),
        fc.integer({ min: 1, max: 10_000 }),
        (center, context, k, seed) => {
          const { negs, draws } = drawNegatives(makeRng(seed), k, center, context);
          expect(negs).toHaveLength(k);
          expect(new Set(negs).size).toBe(k);
          expect(negs).not.toContain(center);
          expect(negs).not.toContain(context);
          expect(draws.filter((d) => d.kept).map((d) => d.word)).toEqual(negs);
        },
      ),
    );
    // Over many draws, "the" (8 of 22 words) comes up about 29% of the time, not 36%.
    const rng = makeRng(7);
    let the = 0;
    for (let i = 0; i < 20_000; i++) if (drawNegatives(rng, 1, 1, 2).draws[0]!.word === 0) the++;
    expect(the / 20_000).toBeCloseTo(NOISE[0]!, 1);
  });

  it('counts the pairs a window makes', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 8 }), fc.integer({ min: 1, max: 3 }), (n, L) => {
        const ps = windowPairs(n, L);
        let want = 0;
        for (let i = 0; i < n; i++) want += Math.min(n - 1, i + L) - Math.max(0, i - L);
        expect(ps).toHaveLength(want);
        for (const [i, j] of ps) expect(Math.abs(i - j)).toBeGreaterThan(0);
        for (const [i, j] of ps) expect(Math.abs(i - j)).toBeLessThanOrEqual(L);
        // Every pair appears both ways round.
        for (const [i, j] of ps) expect(ps).toContainEqual([j, i]);
      }),
    );
  });

  it('keeps its invariants on every step of random runs', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.oneof(
            sentenceArb.map((s) => ['train', s] as [string, string]),
            sentenceArb.map((s) => ['pairs', s] as [string, string]),
            fc.tuple(wordArb, wordArb).map(([a, b]) => ['pair', `${a} ${b}`] as [string, string]),
            fc.constant(['epoch'] as [string]),
            fc.constant(['reset'] as [string]),
          ),
          { maxLength: 5 },
        ),
        settingsArb,
        fc.integer({ min: 1, max: 1000 }),
        (calls, settings: W2vSettings, seed) => {
          const t = new Timeline(word2vec, settings, seed, calls);
          let pairs = 0;
          for (const e of t.entries) {
            for (const step of e.steps) {
              const s = step.state;
              // The plane holds every vector.
              for (const v of [...s.w, ...s.c])
                for (const x of v) expect(Math.abs(x)).toBeLessThanOrEqual(s.reach);
              const r = step.extra?.work?.rec;
              if (r) {
                expect(r.negs).toHaveLength(settings.negatives);
                // With no noise words, the real context's σ never goes down.
                if (settings.negatives === 0) expect(r.after[0]).toBeGreaterThanOrEqual(r.sigs[0]! - 1e-12);
              }
            }
            const log = e.steps.at(-1)!.extra?.log ?? [];
            pairs = e.call[0] === 'reset' ? 0 : pairs + log.length;
            expect(e.end.pairs).toBe(pairs);
          }
        },
      ),
      { numRuns: 60 },
    );
  });

  it('tells the story the examples tell', () => {
    const run = (ops: [string, ...string[]][], set: Partial<W2vSettings> = {}) =>
      new Timeline(word2vec, { ...word2vec.defaults, ...set }, 1, ops);
    const cos = (s: W2vState, a: string, b: string) => cosine(s.w[wordId(a)]!, s.w[wordId(b)]!);
    const start = init();
    expect(cos(start, 'cat', 'dog')).toBeLessThan(0);
    expect(cos(start, 'mat', 'rug')).toBeLessThan(0);
    const trained = run([['run'], ['run']]).endState();
    expect(trained.passes).toBe(20);
    expect(trained.pairs).toBe(20 * 64);
    expect(cos(trained, 'cat', 'dog')).toBeGreaterThan(0.99);
    expect(cos(trained, 'mat', 'rug')).toBeGreaterThan(0.95);
    expect(cos(trained, 'cat', 'mat')).toBeLessThan(0.6);
    // With no noise words the loss falls to almost 0 and every word points the same way.
    const collapsed = run([['run'], ['run']], { negatives: 0 });
    const last = collapsed.at(collapsed.length - 1).step.vars!.loss as number;
    expect(last).toBeLessThan(0.05);
    const ws = collapsed.endState().w;
    for (const a of ws) for (const b of ws) expect(cosine(a, b)).toBeGreaterThan(0);
    expect(run([['pairs', 'the cat sat on the mat']], { window: 1 }).at(8).step.vars!.listed).toBe(10);
  });

  it('parses sentences and pairs, and refuses what does not fit', () => {
    expect(parseSentence('The cat, sat!')).toEqual(['the', 'cat', 'sat']);
    expect(parseSentence('')).toBeInstanceOf(Error);
    expect(parseSentence('the cat sat on the mat the cat sat')).toBeInstanceOf(Error);
    expect(parseSentence('the bird')).toBeInstanceOf(Error);
    expect(parsePair('cat sat')).toEqual([1, 2]);
    expect(parsePair('cat')).toBeInstanceOf(Error);
    for (let size = 1; size <= 8; size++)
      expect((parseSentence(randomSentence(makeRng(size), size)) as string[]).length).toBe(size);
  });

  it('stays readable on a laptop and a phone', () => {
    expect(smallestText(word2vec, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(word2vec, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
