import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeRng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { round3, short } from '../_lm/numbers';
import { embed } from '../_lm/vocab';
import { randomSentence, selfAttention } from '.';
import {
  attention,
  DESIGNED,
  parseSentence,
  randomHead,
  strongest,
  type AttnSettings,
  type Head,
} from './model';

/** Attention written independently of the page: whole-matrix steps, exp without the max. */
function reference(x: number[][], h: Head, causal: boolean, scale: boolean) {
  const mul = (a: number[][], b: number[][]) =>
    a.map((r) => b[0]!.map((_, j) => r.reduce((t, v, k) => t + v * b[k]![j]!, 0)));
  const q = mul(x, h.wq);
  const k = mul(x, h.wk);
  const v = mul(x, h.wv);
  const kt = k[0]!.map((_, c) => k.map((r) => r[c]!));
  const scores = mul(q, kt).map((r) => r.map((s) => (scale ? s / Math.sqrt(2) : s)));
  const a = scores.map((r, i) => {
    const e = r.map((s, j) => (causal && j > i ? 0 : Math.exp(s)));
    const total = e.reduce((t, y) => t + y, 0);
    return e.map((y) => y / total);
  });
  return { a, z: mul(a, v) };
}

const wordArb = fc.constantFrom(
  ...'the a cat dog fox sat ran saw on under mat ball it and zorp qq'.split(' '),
);
const sentenceArb = fc.array(wordArb, { minLength: 1, maxLength: 7 }).map((w) => w.join(' '));
const settingsArb = fc.record({
  causal: fc.boolean(),
  scale: fc.boolean(),
  weights: fc.constantFrom('designed' as const, 'random' as const),
});

describe('self-attention', () => {
  it('matches an independent reference on random sentences and heads', () => {
    fc.assert(
      fc.property(
        sentenceArb,
        settingsArb,
        fc.integer({ min: 1, max: 1000 }),
        (text, set, seed) => {
          const words = parseSentence(text) as string[];
          const x = words.map(embed);
          const h = set.weights === 'random' ? randomHead(makeRng(seed)) : DESIGNED;
          const r = attention(x, h, set.causal, set.scale);
          const ref = reference(x, h, set.causal, set.scale);
          r.a.forEach((row, i) => {
            row.forEach((w, j) => expect(w).toBeCloseTo(ref.a[i]![j]!, 9));
            r.z[i]!.forEach((zv, c) => expect(zv).toBeCloseTo(ref.z[i]![c]!, 9));
          });
        },
      ),
      { numRuns: 200 },
    );
  });

  it('keeps its invariants on every step of random runs', () => {
    fc.assert(
      fc.property(
        sentenceArb,
        settingsArb,
        fc.integer({ min: 1, max: 1000 }),
        (text, set, seed) => {
          const settings: AttnSettings = { ...set };
          const t = new Timeline(selfAttention, settings, seed, [
            ['load', text],
            ['project'],
            ['attend'],
          ]);
          const n = (parseSentence(text) as string[]).length;
          for (const e of t.entries)
            for (const step of e.steps) {
              const w = step.extra?.work;
              // The table never shows weights before every score is in.
              if (w?.stage === 'weights') expect(w.qkv).toBe(3);
              for (const row of w?.cells ?? []) expect(row).toHaveLength(n);
            }
          const end = t.endState();
          expect(end.words).toHaveLength(n);
          const r = end.result!;
          for (let i = 0; i < n; i++) {
            // Each row of weights adds up to 1, and the mask leaves 0 above the diagonal.
            expect(r.a[i]!.reduce((s, v) => s + v, 0)).toBeCloseTo(1, 12);
            for (let j = 0; j < n; j++) {
              expect(r.a[i]![j]!).toBeGreaterThanOrEqual(0);
              if (settings.causal && j > i) expect(r.a[i]![j]).toBe(0);
            }
          }
          // The first word under the mask sees only itself.
          if (settings.causal) expect(r.a[0]![0]).toBe(1);
          expect(t.at(t.length - 1).step.vars?.['dot products']).toBe(n * n);
        },
      ),
      { numRuns: 60 },
    );
  });

  it('without the mask, equal words get equal rows (attention ignores order)', () => {
    const r = attention(
      (parseSentence('the cat saw the cat') as string[]).map(embed),
      DESIGNED,
      false,
      true,
    );
    expect(r.a[1]).toEqual(r.a[4]);
    expect(r.z[0]).toEqual(r.z[3]);
  });

  it('tells the story the examples tell', () => {
    const run = (text: string, causal = true, scale = true) =>
      attention((parseSentence(text) as string[]).map(embed), DESIGNED, causal, scale);
    const cat = run('the cat sat on the mat');
    expect(short(cat.a[2]![1]!)).toBe('.93');
    expect(strongest(cat, 'the cat sat on the mat'.split(' '))).toEqual([[2, 1]]);
    expect(short(run('the cat sat on the mat', true, false).a[2]![1]!)).toBe('.98');
    expect(short(run('the cat sat on the mat', false).a[4]![5]!)).toBe('.52');
    const it2 = run('the dog saw the ball and it');
    expect(short(it2.a[6]![1]!)).toBe('.45');
    expect(short(it2.a[6]![4]!)).toBe('.24');
  });

  it('parses sentences and refuses what does not fit', () => {
    expect(parseSentence('The cat, sat!')).toEqual(['the', 'cat', 'sat']);
    expect(parseSentence('')).toBeInstanceOf(Error);
    expect(parseSentence('a b c d e f g h')).toBeInstanceOf(Error);
    expect(parseSentence('the elephant')).toBeInstanceOf(Error);
    expect(parseSentence('cat 42')).toBeInstanceOf(Error);
    for (let size = 1; size <= 7; size++)
      expect((parseSentence(randomSentence(makeRng(size), size)) as string[]).length).toBe(size);
  });

  it('writes three decimals with a sign, as the code tabs do', () => {
    expect(round3(0.8266)).toBe('0.827');
    expect(round3(-0.0004)).toBe('0.000');
    expect(round3(-1.2345)).toBe('-1.235');
    expect(round3(1)).toBe('1.000');
    expect(short(-0.37)).toBe('−.37');
    expect(short(2)).toBe('2');
    expect(short(-Infinity)).toBe('−∞');
  });

  it('stays readable on a laptop and a phone', () => {
    expect(smallestText(selfAttention, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(selfAttention, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
