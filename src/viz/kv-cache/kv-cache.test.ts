import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeRng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { short } from '../_lm/numbers';
import { embed } from '../_lm/vocab';
import { attention } from '../self-attention/model';
import { kvCache } from '.';
import {
  DESIGNED,
  MAX_TOKENS,
  tokenCost,
  windowOf,
  type KvSettings,
  type WindowSetting,
} from './model';
import { randomWords, SENTENCES } from './texts';

/**
 * Attention written independently of the page: the whole matrix at once, a band mask (the
 * causal mask, and the window), exp without subtracting the max.
 */
function reference(words: string[], w: number) {
  const mul = (a: number[][], b: number[][]) =>
    a.map((r) => b[0]!.map((_, j) => r.reduce((t, v, k) => t + v * b[k]![j]!, 0)));
  const x = words.map(embed);
  const q = mul(x, DESIGNED.wq);
  const k = mul(x, DESIGNED.wk);
  const v = mul(x, DESIGNED.wv);
  const a = q.map((qi, i) => {
    const e = k.map((kj, j) =>
      j > i || j <= i - w ? 0 : Math.exp((qi[0]! * kj[0]! + qi[1]! * kj[1]!) / Math.SQRT2),
    );
    const total = e.reduce((t, y) => t + y, 0);
    return e.map((y) => y / total);
  });
  return { k, v, z: mul(a, v) };
}

const wordArb = fc.constantFrom(
  ...'the a cat dog fox sat ran saw on under mat ball it and zorp qq'.split(' '),
);
const textArb = fc
  .tuple(fc.array(wordArb, { minLength: 1, maxLength: MAX_TOKENS }), fc.integer({ min: 1, max: 7 }))
  .map(([words, p]) => ({ words, prompt: Math.min(p, words.length) }));
const windowArb = fc.constantFrom<WindowSetting>('all', '2', '3', '4');

const calls = (words: string[], prompt: number): OpCall[] => [
  ['prefill', words.slice(0, prompt).join(' ')],
  ...words.slice(prompt).map((w): OpCall => ['generate', w]),
];

describe('kv-cache', () => {
  it('matches an independent reference, with and without the cache', () => {
    fc.assert(
      fc.property(textArb, windowArb, fc.boolean(), ({ words, prompt }, window, cache) => {
        const settings: KvSettings = { cache, window };
        const w = windowOf(settings);
        const ref = reference(words, w);
        const t = new Timeline(kvCache, settings, 1, calls(words, prompt));
        const n = words.length;
        t.entries.forEach((e, i) => {
          const s = e.end;
          const last = s.words.length - 1;
          expect(s.words).toEqual(words.slice(0, prompt + i));
          s.last!.z.forEach((zv, c) => expect(zv).toBeCloseTo(ref.z[last]![c]!, 9));
        });
        const end = t.endState();
        // The cache holds the last w rows, exactly K and V of those tokens; none without one.
        const rows = cache ? Math.min(n, w) : 0;
        expect(end.k).toHaveLength(rows);
        expect(end.v).toHaveLength(rows);
        expect(end.from).toBe(cache ? n - rows : 0);
        end.k.forEach((row, i) => expect(row).toEqual(ref.k[end.from + i]));
        end.v.forEach((row, i) => expect(row).toEqual(ref.v[end.from + i]));
        // Work: each token pays for the tokens it sees; without a cache, decode recomputes.
        const seen = (i: number) => Math.min(i + 1, w);
        expect(end.work).toEqual(words.map((_, i) => tokenCost(seen(i), i < prompt || cache)));
        const again = cache
          ? 0
          : words.slice(prompt).reduce((t, _, j) => t + seen(prompt + j) - 1, 0);
        expect(end.recomputed).toBe(again);
      }),
      { numRuns: 300 },
    );
  });

  it('gives the same answers as the self-attention page when there is no window', () => {
    fc.assert(
      fc.property(textArb, fc.boolean(), ({ words, prompt }, cache) => {
        const t = new Timeline(kvCache, { cache, window: 'all' }, 1, calls(words, prompt));
        const r = attention(words.map(embed), DESIGNED, true, true);
        const end = t.endState();
        expect(end.last!.z).toEqual(r.z[words.length - 1]);
        expect(end.last!.a).toEqual(r.a[words.length - 1]!.slice(0, words.length));
      }),
      { numRuns: 100 },
    );
  });

  it('keeps its invariants on every step', () => {
    fc.assert(
      fc.property(textArb, windowArb, fc.boolean(), ({ words, prompt }, window, cache) => {
        const settings: KvSettings = { cache, window };
        const w = windowOf(settings);
        const t = new Timeline(kvCache, settings, 1, calls(words, prompt));
        let total = 0;
        for (let i = 0; i < t.length; i++) {
          const { step } = t.at(i);
          const s = step.state;
          expect(s.k.length).toBe(s.v.length);
          expect(s.k.length).toBeLessThanOrEqual(Math.min(w, s.words.length));
          if (!cache) expect(s.k).toHaveLength(0);
          expect(s.from + s.k.length).toBeLessThanOrEqual(s.words.length);
          expect(step.vars!['cache numbers']).toBe(4 * s.k.length);
          const now = Number(step.vars!['total multiply-adds']);
          expect(now).toBeGreaterThanOrEqual(total);
          total = now;
          const att = step.extra?.att;
          if (att) expect(att.upto).toBeLessThanOrEqual(att.t);
        }
        expect(total).toBe(t.endState().work.reduce((a, b) => a + b, 0));
      }),
      { numRuns: 100 },
    );
  });

  it('refuses what does not fit', () => {
    const say = (ops: OpCall[]) => {
      const t = new Timeline(kvCache, { cache: true, window: 'all' }, 1, ops);
      return t.at(t.length - 1).step.say;
    };
    expect(say([['generate', 'cat']])).toMatch(/Start with a prompt/);
    expect(say([['prefill', 'the elephant']])).toMatch(/six at most/);
    expect(
      say([
        ['prefill', 'the'],
        ['generate', 'the cat'],
      ]),
    ).toMatch(/one word at a time/);
    const eight = calls('the cat sat on the mat and it'.split(' '), 4);
    expect(say([...eight, ['generate', 'ran']])).toMatch(/stops at 8 tokens/);
    const t = new Timeline(kvCache, { cache: true, window: 'all' }, 1, [
      ...eight,
      ['generate', 'ran'],
    ]);
    expect(t.endState().words).toHaveLength(8);
  });

  it('tells the story the examples and the concept page tell', () => {
    const run = (ops: OpCall[], settings: Partial<KvSettings> = {}) =>
      new Timeline(kvCache, { cache: true, window: 'all', ...settings }, 1, ops).endState();
    const text = calls('the dog saw the ball and it ran'.split(' '), 5);
    const grows = run(text);
    expect(grows.work).toEqual([28, 32, 36, 40, 44, 48, 52, 56]);
    expect(grows.work.reduce((a, b) => a + b, 0)).toBe(336);
    expect(short(grows.last!.a[1]!)).toBe('.73');
    expect(grows.last!.z.map(short)).toEqual(['.67', '.22']);
    const none = run(text, { cache: false });
    expect(none.work.slice(5)).toEqual([128, 148, 168]);
    expect(none.work.reduce((a, b) => a + b, 0)).toBe(624);
    expect(none.recomputed).toBe(5 + 6 + 7);
    expect(none.last!.z).toEqual(grows.last!.z);
    const win = run(text, { window: '3' });
    expect(win.work).toEqual([28, 32, 36, 36, 36, 36, 36, 36]);
    expect(win.words.slice(win.from)).toEqual(['and', 'it', 'ran']);
    expect(win.last!.z.map(short)).toEqual(['0', '0']);
    expect(run(text, { cache: false, window: '3' }).work.slice(5)).toEqual([68, 68, 68]);
    // Prefill and decode do the same arithmetic with a cache, in one pass or in eight.
    const onePass = run(calls('the cat sat on the mat and it'.split(' '), 7));
    const oneByOne = run(calls('the cat sat on the mat and it'.split(' '), 1));
    expect(onePass.work).toEqual(oneByOne.work);
    expect(onePass.last!.z).toEqual(oneByOne.last!.z);
  });

  it('draws texts from the corpus', () => {
    expect(SENTENCES.length).toBeGreaterThan(5);
    for (let size = 1; size <= MAX_TOKENS; size++)
      expect(randomWords(makeRng(size), size)).toHaveLength(size);
  });

  it('stays readable on a laptop and a phone', () => {
    expect(smallestText(kvCache, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(kvCache, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
