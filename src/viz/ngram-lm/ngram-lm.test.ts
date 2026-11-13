import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { CORPUS } from '../_lm/corpus';
import { ngramLm } from '.';
import {
  contextOf,
  countsFor,
  dist,
  EOS,
  MAX_GEN,
  parseWords,
  prob,
  type LmSettings,
  type Smoothing,
} from './model';

/** Counts written independently: scan the padded corpus as one string per sentence. */
function reference(n: number) {
  const grams = new Map<string, number>();
  const ctx = new Map<string, number>();
  const vocab = new Set<string>();
  for (const s of CORPUS) {
    const t = `${'<s> '.repeat(n - 1)}${s} </s>`.split(' ');
    for (let i = n - 1; i < t.length; i++) {
      const c = t.slice(i - n + 1, i).join(' ');
      grams.set(`${c}|${t[i]}`, (grams.get(`${c}|${t[i]}`) ?? 0) + 1);
      ctx.set(c, (ctx.get(c) ?? 0) + 1);
      vocab.add(t[i]!);
    }
  }
  const p = (c: string[], w: string, k: number) => {
    const total = ctx.get(c.join(' ')) ?? 0;
    if (total === 0 && k === 0) return 0;
    return ((grams.get(`${c.join(' ')}|${w}`) ?? 0) + k) / (total + k * vocab.size);
  };
  return { p, vocab };
}

const K: Record<Smoothing, number> = { none: 0, laplace: 1, 'add-k': 0.1 };
const vocabWords = [...countsFor(2).words];
const sentenceArb = fc
  .array(fc.constantFrom(...vocabWords), { minLength: 1, maxLength: 8 })
  .map((w) => w.join(' '));
const settingsArb = fc.record({
  n: fc.constantFrom('2', '3'),
  smoothing: fc.constantFrom<Smoothing>('none', 'laplace', 'add-k'),
});

describe('n-gram language model', () => {
  it('matches an independent count of the corpus', () => {
    fc.assert(
      fc.property(settingsArb, sentenceArb, (s, text) => {
        const n = Number(s.n);
        const ref = reference(n);
        const c = countsFor(n);
        expect(c.vocab.length).toBe(ref.vocab.size);
        const words = text.split(' ');
        const t = [...Array<string>(n - 1).fill('<s>'), ...words, EOS];
        for (let i = n - 1; i < t.length; i++) {
          const ctx = t.slice(i - n + 1, i);
          expect(prob(c, ctx, t[i]!, K[s.smoothing])).toBeCloseTo(
            ref.p(ctx, t[i]!, K[s.smoothing]),
            12,
          );
        }
      }),
      { numRuns: 200 },
    );
  });

  it('gives distributions that add up to 1, most likely first', () => {
    fc.assert(
      fc.property(settingsArb, sentenceArb, (s, text) => {
        const n = Number(s.n);
        const d = dist(countsFor(n), contextOf(text.split(' '), n), K[s.smoothing]);
        if (d.total === 0 && s.smoothing === 'none') expect(d.order).toEqual([]);
        else expect(d.p.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
        for (let i = 1; i < d.p.length; i++) expect(d.p[i]!).toBeLessThanOrEqual(d.p[i - 1]!);
        // Every table fits the frame the view keeps: at most nine words seen after a context.
        expect(d.seen.length).toBeLessThanOrEqual(9);
      }),
      { numRuns: 200 },
    );
  });

  it('keeps its invariants on every step of random runs', () => {
    fc.assert(
      fc.property(settingsArb, sentenceArb, fc.integer({ min: 1, max: 500 }), (s, text, seed) => {
        const settings: LmSettings = { ...s };
        const t = new Timeline(ngramLm, settings, seed, [
          ['next', text],
          ['generate'],
          ['score', text],
        ]);
        for (const e of t.entries)
          for (const step of e.steps) {
            const table = step.extra?.picture?.table;
            if (table?.kind === 'top') expect(table.rows.length).toBeLessThanOrEqual(10);
          }
        const gen = t.entries[1]!.end.view;
        if (gen.kind !== 'generate') throw new Error('generate');
        expect(gen.words.length).toBeLessThanOrEqual(MAX_GEN);
        expect(gen.us.length).toBe(gen.words.length + (gen.ended ? 1 : 0));
        // Without smoothing every pair drawn was seen, so the sentence scores a finite perplexity.
        if (settings.smoothing === 'none' && gen.ended && gen.words.length) {
          const g = new Timeline(ngramLm, settings, 1, [['score', gen.words.join(' ')]]);
          const v = g.endState().view;
          expect(v.kind === 'score' && Number.isFinite(v.pp)).toBe(true);
        }
        const sc = t.endState().view;
        if (sc.kind !== 'score') throw new Error('score');
        expect(sc.probs).toHaveLength(text.split(' ').length + 1);
        if (sc.probs.every((p) => p > 0))
          expect(sc.pp).toBeCloseTo(
            Math.exp(-sc.probs.reduce((a, p) => a + Math.log(p), 0) / sc.probs.length),
            9,
          );
        else expect(sc.pp).toBe(Infinity);
      }),
      { numRuns: 120 },
    );
  });

  it('counts the corpus as the concept page says', () => {
    const c2 = countsFor(2);
    expect(CORPUS.length).toBe(18);
    expect(c2.tokens).toBe(117);
    expect(c2.ngrams.length).toBe(67);
    expect(c2.vocab.length).toBe(30);
    expect(c2.ngrams.slice(0, 3)).toEqual([
      ['<s> the', 16],
      ['the cat', 9],
      ['the dog', 8],
    ]);
    expect(prob(c2, ['the'], 'cat', 0)).toBeCloseTo(9 / 29, 12);
    expect(prob(c2, ['the'], 'cat', 1)).toBeCloseTo(10 / 59, 12);
    const score = (text: string, smoothing: Smoothing = 'none') => {
      const v = new Timeline(ngramLm, { n: '2', smoothing }, 1, [['score', text]]).endState().view;
      return v.kind === 'score' ? v.pp : NaN;
    };
    expect(score('the cat sat on the mat')).toBeCloseTo(2.31, 2);
    expect(score('the dog sat on the mat')).toBeCloseTo(2.55, 2);
    expect(score('the cat ate the ball')).toBe(Infinity);
    expect(score('the cat ate the ball', 'laplace')).toBeCloseTo(12.95, 2);
  });

  it('reads words and contexts', () => {
    expect(parseWords('The cat, sat!')).toEqual(['the', 'cat', 'sat']);
    expect(parseWords('')).toBeInstanceOf(Error);
    expect(parseWords('the zebra')).toBeInstanceOf(Error);
    expect(parseWords('a a a a a a a a a a a')).toBeInstanceOf(Error);
    expect(contextOf(['the'], 3)).toEqual(['<s>', 'the']);
    expect(contextOf(['the', 'cat', 'sat'], 2)).toEqual(['sat']);
  });

  it('stays readable on a laptop and a phone', () => {
    expect(smallestText(ngramLm, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(ngramLm, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
