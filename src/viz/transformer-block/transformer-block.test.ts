import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeRng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { parseSentence } from '../self-attention/model';
import { randomSentence, transformerBlock } from '.';
import {
  B_1,
  B_2,
  D,
  EPS,
  HEAD,
  normalize,
  OUT_WORDS,
  paramCount,
  rowKeys,
  runBlock,
  stream,
  U,
  W_1,
  W_2,
  W_DOWN,
  W_GATE,
  W_O,
  W_UP,
  type BlockSettings,
} from './model';

/**
 * The block written independently of the page: whole-vector steps with reduce, a plain
 * variance, exp without subtracting the max, and the exact GELU form GPT-2 uses.
 */
function reference(x: number[][], set: BlockSettings) {
  const mul = (a: number[][], b: number[][]) =>
    a.map((r) => b[0]!.map((_, j) => r.reduce((t, v, k) => t + v * b[k]![j]!, 0)));
  const plus = (a: number[], b: number[]) => a.map((v, i) => v + b[i]!);
  const norm = (v: number[]) => {
    const mean = set.norm === 'layer' ? v.reduce((t, y) => t + y, 0) / v.length : 0;
    const spread =
      set.norm === 'layer'
        ? v.reduce((t, y) => t + (y - mean) ** 2, 0) / v.length
        : v.reduce((t, y) => t + y * y, 0) / v.length;
    return v.map((y) => (y - mean) / Math.sqrt(spread + 1e-5));
  };
  const n = x.length;
  const attend = (inp: number[][]) => {
    const q = mul(inp, HEAD.wq);
    const k = mul(inp, HEAD.wk);
    const v = mul(inp, HEAD.wv);
    const i = n - 1;
    const e = k.map((kj) => Math.exp((q[i]![0]! * kj[0]! + q[i]![1]! * kj[1]!) / Math.SQRT2));
    const total = e.reduce((t, y) => t + y, 0);
    const a = e.map((y) => y / total);
    const z = [0, 1].map((c) => a.reduce((t, w, j) => t + w * v[j]![c]!, 0));
    return { a, o: mul([z], W_O)[0]! };
  };
  const act = (g: number) =>
    set.act === 'relu'
      ? Math.max(0, g)
      : 0.5 * g * (1 + Math.tanh(Math.sqrt(2 / Math.PI) * (g + 0.044715 * g ** 3)));
  const ffn = (v: number[]) => {
    if (set.act === 'swiglu') {
      const g = mul([v], W_GATE)[0]!;
      const u = mul([v], W_UP)[0]!;
      return mul([g.map((t, i) => (t / (1 + Math.exp(-t))) * u[i]!)], W_DOWN)[0]!;
    }
    const h = plus(mul([v], W_1)[0]!, B_1).map(act);
    return plus(mul([h], W_2)[0]!, B_2);
  };
  const xl = x[n - 1]!;
  let x1: number[];
  let x2: number[];
  let h: number[];
  let a: number[];
  if (set.order === 'pre') {
    const at = attend(x.map(norm));
    a = at.a;
    x1 = plus(xl, at.o);
    x2 = plus(x1, ffn(norm(x1)));
    h = norm(x2);
  } else {
    const at = attend(x);
    a = at.a;
    x1 = norm(plus(xl, at.o));
    x2 = norm(plus(x1, ffn(x1)));
    h = x2;
  }
  return { a, x1, x2, logits: mul([h], U)[0]! };
}

const wordArb = fc.constantFrom(
  ...'the a cat dog fox bird sat ran saw ate on under mat ball box it and zorp'.split(' '),
);
const sentenceArb = fc.array(wordArb, { minLength: 1, maxLength: 7 }).map((w) => w.join(' '));
const settingsArb: fc.Arbitrary<BlockSettings> = fc.record({
  order: fc.constantFrom('pre' as const, 'post' as const),
  norm: fc.constantFrom('layer' as const, 'rms' as const),
  act: fc.constantFrom('relu' as const, 'gelu' as const, 'swiglu' as const),
});

describe('transformer-block', () => {
  it('matches an independent reference on random sentences and settings', () => {
    fc.assert(
      fc.property(sentenceArb, settingsArb, (text, set) => {
        const x = stream(parseSentence(text) as string[]);
        const r = runBlock(x, set);
        const ref = reference(x, set);
        const close = (a: readonly number[], b: readonly number[]) =>
          a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, 9));
        close(r.att.a[x.length - 1]!, ref.a);
        close(r.rows.x1!, ref.x1);
        close(r.rows.x2!, ref.x2);
        close(r.logits, ref.logits);
      }),
      { numRuns: 300 },
    );
  });

  it('keeps its invariants on every step of random runs', () => {
    fc.assert(
      fc.property(sentenceArb, settingsArb, (text, set) => {
        const t = new Timeline(transformerBlock, set, 1, [['load', text], ['run']]);
        const keys = rowKeys(set);
        let before = 0;
        for (const e of t.entries)
          for (const step of e.steps) {
            const w = step.extra?.work;
            if (!w) continue;
            // Stages fill in drawing order and never go away.
            expect(w.shown).toEqual(keys.slice(0, w.shown.length));
            expect(w.shown.length).toBeGreaterThanOrEqual(before);
            before = w.shown.length;
            // The output table shows logits only once the stream is finished.
            if (w.out !== 'none') expect(w.shown).toEqual(keys);
          }
        const r = t.endState().result!;
        const x = r.rows.x!;
        // The residual stream: in pre-norm neither sublayer touches this word's half.
        if (set.order === 'pre') {
          expect(r.rows.x1!.slice(0, 4)).toEqual(x.slice(0, 4));
          expect(r.rows.x2!.slice(0, 4)).toEqual(x.slice(0, 4));
        }
        // Each sublayer adds: x₁ − x is attention's output (before any post-norm).
        const sum1 = set.order === 'pre' ? r.rows.x1! : r.rows.s1!;
        sum1.forEach((v, i) => expect(v).toBeCloseTo(x[i]! + r.rows.attn![i]!, 12));
        expect(r.att.a.at(-1)!.reduce((s, v) => s + v, 0)).toBeCloseTo(1, 12);
        expect(r.probs.reduce((s, v) => s + v, 0)).toBeCloseTo(1, 12);
        expect(r.logits[r.guess]).toBe(Math.max(...r.logits));
        expect(t.at(t.length - 1).step.vars?.guess).toBe(OUT_WORDS[r.guess]);
      }),
      { numRuns: 120 },
    );
  });

  it('normalizes to mean 0 and spread 1, or to a root mean square of 1', () => {
    // With ε under the square root the output's mean square is q / (q + ε), where q is the
    // input's variance (LayerNorm) or mean square (RMSNorm): 1 for any real spread, less for a
    // nearly constant vector such as (0, 0, 0.1, 0, ...), whose variance is only 0.0011.
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: -3, max: 3, noNaN: true }), { minLength: D, maxLength: D }),
        (v) => {
          const m = v.reduce((s, t) => s + t, 0) / D;
          const variance = v.reduce((s, t) => s + (t - m) ** 2, 0) / D;
          const square = v.reduce((s, t) => s + t * t, 0) / D;
          const ln = normalize(v, 'layer').out;
          const mean = ln.reduce((s, t) => s + t, 0) / D;
          expect(mean).toBeCloseTo(0, 9);
          expect(ln.reduce((s, t) => s + t * t, 0) / D).toBeCloseTo(variance / (variance + EPS), 9);
          const rms = normalize(v, 'rms').out;
          expect(rms.reduce((s, t) => s + t * t, 0) / D).toBeCloseTo(square / (square + EPS), 9);
          if (variance > 0.01) expect(ln.reduce((s, t) => s + t * t, 0) / D).toBeCloseTo(1, 2);
        },
      ),
    );
    const flat = normalize([0, 0, 0.1, 0, 0, 0, 0, 0], 'layer').out;
    expect(flat.reduce((s, t) => s + t * t, 0) / D).toBeCloseTo(0.991, 3);
  });

  it('counts the parameters of every setting from the weights themselves', () => {
    for (const order of ['pre', 'post'] as const)
      for (const norm of ['layer', 'rms'] as const)
        for (const act of ['relu', 'gelu', 'swiglu'] as const) {
          const set = { order, norm, act };
          const size = (m: number[][]) => m.length * m[0]!.length;
          const attn = size(HEAD.wq) + size(HEAD.wk) + size(HEAD.wv) + size(W_O);
          const ffn =
            act === 'swiglu'
              ? size(W_GATE) + size(W_UP) + size(W_DOWN)
              : size(W_1) + B_1.length + size(W_2) + B_2.length;
          const oneNorm = norm === 'layer' ? 2 * D : D;
          const p = paramCount(set);
          expect(p.block).toBe(2 * oneNorm + attn + ffn);
          expect(p.final).toBe(order === 'pre' ? oneNorm : 0);
        }
    expect(paramCount({ order: 'pre', norm: 'layer', act: 'gelu' }).block).toBe(172);
    expect(paramCount({ order: 'pre', norm: 'rms', act: 'swiglu' }).block).toBe(176);
  });

  it('guesses sensible next words on the curated sentences in every setting', () => {
    const kinds: Record<string, readonly string[]> = {
      the: ['cat', 'dog', 'fox', 'bird'],
      'the dog': ['sat', 'ran', 'saw', 'ate', 'slept', 'chased'],
      'the cat sat': ['on', 'under'],
      'the cat sat on the': ['mat', 'ball', 'box', 'rug', 'tree'],
      'the dog saw the': ['mat', 'ball', 'box', 'rug', 'tree'],
      'the cat sat on the mat': ['and'],
    };
    for (const order of ['pre', 'post'] as const)
      for (const norm of ['layer', 'rms'] as const)
        for (const act of ['relu', 'gelu', 'swiglu'] as const)
          for (const [text, ok] of Object.entries(kinds)) {
            const r = runBlock(stream(text.split(' ')), { order, norm, act });
            expect(ok, `${text} (${order}, ${norm}, ${act})`).toContain(OUT_WORDS[r.guess]);
          }
  });

  it('tells the story the examples tell', () => {
    const r = runBlock(stream('the cat sat on the'.split(' ')), transformerBlock.defaults);
    expect(r.att.a[4]![1]).toBeGreaterThan(0.99);
    expect(r.rows.attn!.slice(4, 6).map((v) => Math.round(v * 100) / 100)).toEqual([-2.75, 2.75]);
    expect(OUT_WORDS[r.guess]).toBe('mat');
    for (let size = 1; size <= 7; size++)
      expect((parseSentence(randomSentence(makeRng(size), size)) as string[]).length).toBe(size);
  });

  it('stays readable on a laptop and a phone', () => {
    expect(smallestText(transformerBlock, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(transformerBlock, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
