import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { embed } from '../_lm/vocab';
import { attention, DESIGNED, parseSentence } from '../self-attention/model';
import { multiHeadAttention } from '.';
import { cachePerWord, config, multiHead, PATTERNS, W_O, weights, type MhaSettings } from './model';

/**
 * Multi-head attention written independently of the page, from the patterns: per-head weight
 * matrices, key heads averaged over their groups, exp without subtracting the max.
 */
function reference(x: number[][], set: MhaSettings) {
  const h = Number(set.heads);
  const d = 4 / h;
  const hkv = set.kv === 'mha' ? h : set.kv === 'gqa' ? Math.max(1, h / 2) : 1;
  const mul = (a: number[][], b: number[][]) =>
    a.map((r) => b[0]!.map((_, j) => r.reduce((t, v, k) => t + v * b[k]![j]!, 0)));
  const headW = (m: 'q' | 'k' | 'v', i: number) =>
    [0, 1, 2, 3].map((f) => PATTERNS.slice(i * d, i * d + d).map((p) => p[m][f]!));
  const kvW = (m: 'k' | 'v', g: number) => {
    const members = Array.from({ length: h / hkv }, (_, t) => g * (h / hkv) + t);
    const ws = members.map((i) => headW(m, i));
    return ws[0]!.map((row, f) =>
      row.map((_, c) => ws.reduce((t, w) => t + w[f]![c]!, 0) / ws.length),
    );
  };
  const heads = Array.from({ length: h }, (_, i) => {
    const g = Math.floor(i / (h / hkv));
    const q = mul(x, headW('q', i));
    const k = mul(x, kvW('k', g));
    const v = mul(x, kvW('v', g));
    const a = q.map((qi, r) => {
      const e = k.map((kj, c) =>
        c > r ? 0 : Math.exp(qi.reduce((t, y, u) => t + y * kj[u]!, 0) / Math.sqrt(d)),
      );
      const total = e.reduce((t, y) => t + y, 0);
      return e.map((y) => y / total);
    });
    return { a, z: mul(a, v) };
  });
  const z = x.map((_, r) => heads.flatMap((hd) => hd.z[r]!));
  return {
    heads,
    o: mul(
      z,
      W_O.map((r) => [...r]),
    ),
  };
}

const wordArb = fc.constantFrom(
  ...'the a cat dog fox sat ran saw on under mat ball it and zorp qq'.split(' '),
);
const sentenceArb = fc.array(wordArb, { minLength: 1, maxLength: 7 }).map((w) => w.join(' '));
const settingsArb = fc.record({
  heads: fc.constantFrom('1' as const, '2' as const, '4' as const),
  kv: fc.constantFrom('mha' as const, 'gqa' as const, 'mqa' as const),
});

describe('multi-head attention', () => {
  it('matches an independent reference on random sentences and settings', () => {
    fc.assert(
      fc.property(sentenceArb, settingsArb, (text, set) => {
        const x = (parseSentence(text) as string[]).map(embed);
        const cfg = config(set);
        const r = multiHead(x, weights(cfg), cfg);
        const ref = reference(x, set);
        r.heads.forEach((hd, i) =>
          hd.a.forEach((row, a) =>
            row.forEach((w, b) => expect(w).toBeCloseTo(ref.heads[i]!.a[a]![b]!, 9)),
          ),
        );
        r.o.forEach((row, a) => row.forEach((y, c) => expect(y).toBeCloseTo(ref.o[a]![c]!, 9)));
      }),
      { numRuns: 200 },
    );
  });

  it('with two heads, head 1 is the self-attention page’s head', () => {
    fc.assert(
      fc.property(sentenceArb, (text) => {
        const x = (parseSentence(text) as string[]).map(embed);
        const cfg = config({ heads: '2', kv: 'mha' });
        const mine = multiHead(x, weights(cfg), cfg).heads[0]!;
        const theirs = attention(x, DESIGNED, true, true);
        expect(mine.a).toEqual(theirs.a);
        expect(mine.z).toEqual(theirs.z);
      }),
      { numRuns: 60 },
    );
  });

  it('keeps its invariants on every step of random runs', () => {
    fc.assert(
      fc.property(sentenceArb, settingsArb, (text, set) => {
        const t = new Timeline(multiHeadAttention, set, 1, [
          ['load', text],
          ['project'],
          ['attend'],
        ]);
        const n = (parseSentence(text) as string[]).length;
        const cfg = config(set);
        let lastHead = 0;
        for (const e of t.entries)
          for (const step of e.steps) {
            const w = step.extra?.work;
            if (!w) continue;
            // Heads go in order, and each head's table is the size of the sentence.
            expect(w.head).toBeGreaterThanOrEqual(lastHead);
            lastHead = w.head;
            expect(w.cells).toHaveLength(n);
            expect(w.zHeads).toBeLessThanOrEqual(cfg.h);
          }
        const r = t.endState().result!;
        expect(r.k[0]).toHaveLength(cfg.hkv * cfg.d);
        for (const hd of r.heads)
          for (let i = 0; i < n; i++) {
            expect(hd.a[i]!.reduce((s, v) => s + v, 0)).toBeCloseTo(1, 12);
            for (let j = i + 1; j < n; j++) expect(hd.a[i]![j]).toBe(0);
          }
        const vars = t.at(t.length - 1).step.vars!;
        expect(vars['KV cache']).toBe(n * cachePerWord(cfg));
        expect(vars['dot products']).toBe(cfg.h * n * n);
      }),
      { numRuns: 60 },
    );
  });

  it('shares key heads by averaging, and the cache shrinks with them', () => {
    const per = (heads: '1' | '2' | '4', kv: 'mha' | 'gqa' | 'mqa') =>
      cachePerWord(config({ heads, kv }));
    expect([per('4', 'mha'), per('4', 'gqa'), per('4', 'mqa')]).toEqual([8, 4, 2]);
    expect([per('2', 'mha'), per('2', 'gqa'), per('2', 'mqa')]).toEqual([8, 4, 4]);
    expect(per('1', 'mqa')).toBe(8);
    const w = weights(config({ heads: '4', kv: 'mqa' }));
    expect(w.wk.map((r) => r[0])).toEqual([0.5, 0.5, 0.5, 0]);
  });

  it('tells the story the examples tell', () => {
    const top = (text: string, set: MhaSettings) => {
      const x = (parseSentence(text) as string[]).map(embed);
      const cfg = config(set);
      return multiHead(x, weights(cfg), cfg).heads.map((hd) => hd.a);
    };
    const mha = top('the cat sat on the mat', { heads: '4', kv: 'mha' });
    expect(mha[0]![2]![1]).toBeCloseTo(0.98, 2);
    expect(mha[2]![5]![2]).toBeCloseTo(0.92, 2);
    expect(mha[3]![1]![0]).toBeCloseTo(0.9, 2);
    const gqa = top('the cat sat on the mat', { heads: '4', kv: 'gqa' });
    expect(gqa[0]![2]![1]).toBeCloseTo(0.89, 2);
    expect(gqa[2]![5]![2]).toBeLessThan(0.3);
    const one = top('the cat sat on the mat', { heads: '1', kv: 'mha' });
    expect(one[0]![2]![1]).toBeCloseTo(0.84, 2);
    expect(one[0]![5]![2]).toBeCloseTo(0.43, 2);
  });

  it('stays readable on a laptop and a phone', () => {
    expect(smallestText(multiHeadAttention, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(multiHeadAttention, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
