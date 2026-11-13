import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { embed } from '../_lm/vocab';
import { attention, DESIGNED, parseSentence } from '../self-attention/model';
import { positionalEncoding } from '.';
import {
  alibiAttention,
  content,
  rotate,
  ropeScores,
  scoreTable,
  sinusoidal,
  type PosSettings,
} from './model';

/** Written independently: the formulas straight from the papers, with complex numbers for RoPE. */
const refPE = (pos: number, dim: number) => {
  const i = Math.floor(dim / 2);
  const a = pos / 10000 ** ((2 * i) / 8);
  return dim % 2 === 0 ? Math.sin(a) : Math.cos(a);
};
/** RoPE as complex multiplication: (x + iy) · e^{iθ}; the score is the real part of q · conj(k). */
function refRope(q: number[], k: number[], m: number, n: number): number {
  let s = 0;
  for (let i = 0; i < 4; i++) {
    const th = (m - n) / 10000 ** ((2 * i) / 8);
    // Re[(q1 + i q2) e^{i m θ} · conj((k1 + i k2) e^{i n θ})] = Re[(q1 + i q2)(k1 − i k2) e^{i (m−n) θ}]
    const re = q[0]! * k[0]! + q[1]! * k[1]!;
    const im = q[1]! * k[0]! - q[0]! * k[1]!;
    s += re * Math.cos(th) - im * Math.sin(th);
  }
  return s;
}

const wordArb = fc.constantFrom(
  ...'the a cat dog fox sat ran saw on under mat ball it and zorp qq'.split(' '),
);
const sentenceArb = fc.array(wordArb, { minLength: 1, maxLength: 7 }).map((w) => w.join(' '));
const schemeArb = fc.constantFrom('sinusoidal' as const, 'rope' as const, 'alibi' as const);

describe('positional encoding', () => {
  it('matches the formulas of the papers', () => {
    fc.assert(
      fc.property(sentenceArb, (text) => {
        const x = (parseSentence(text) as string[]).map(embed);
        const n = x.length;
        const pe = sinusoidal(n);
        pe.forEach((row, p) => row.forEach((v, d) => expect(v).toBeCloseTo(refPE(p, d), 12)));
        const c = content(x);
        const r = ropeScores(c);
        for (let m = 0; m < n; m++)
          for (let k = 0; k < n; k++)
            expect(r.s[m]![k]).toBeCloseTo(refRope(c.q[m]!, c.k[k]!, m, k), 9);
        const al = alibiAttention(x);
        for (let i = 0; i < n; i++) {
          const e = Array.from({ length: n }, (_, j) =>
            j > i ? 0 : Math.exp(al.content[i]![j]! - 0.5 * (i - j)),
          );
          const total = e.reduce((t, v) => t + v, 0);
          e.forEach((v, j) => expect(al.a[i]![j]).toBeCloseTo(v / total, 12));
        }
      }),
      { numRuns: 150 },
    );
  });

  it('makes scores that depend only on the distance', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: -20, max: 20 }), { minLength: 4, maxLength: 4 }),
        fc.integer({ min: 0, max: 40 }),
        fc.integer({ min: 0, max: 40 }),
        fc.integer({ min: 1, max: 30 }),
        (v, m, n, shift) => {
          const q = [v[0]! / 10, v[1]! / 10, v[0]! / 10, v[1]! / 10, 0.3, -0.2, 1, 0.5];
          const k = [v[2]! / 10, v[3]! / 10, 0.4, 0.1, v[2]! / 10, v[3]! / 10, -1, 0.2];
          const dot = (a: number[], b: number[]) => a.reduce((t, x, i) => t + x * b[i]!, 0);
          const s1 = dot(rotate(q, m), rotate(k, n));
          const s2 = dot(rotate(q, m + shift), rotate(k, n + shift));
          expect(s2).toBeCloseTo(s1, 9);
          // Turning keeps the length of every pair.
          const len = (a: number[]) => Math.hypot(...a);
          expect(len(rotate(q, m))).toBeCloseTo(len(q), 12);
        },
      ),
      { numRuns: 200 },
    );
    const pe = sinusoidal(7);
    const pp = scoreTable(
      'sinusoidal',
      pe.map(() => [0, 0, 0, 0]),
    );
    for (let m = 0; m < 7; m++)
      for (let n = 0; n < 7; n++) expect(pp[m]![n]).toBeCloseTo(pp[Math.abs(m - n)]![0]!, 12);
  });

  it('keeps its invariants on every step of random runs', () => {
    fc.assert(
      fc.property(sentenceArb, schemeArb, (text, scheme) => {
        const settings: PosSettings = { scheme };
        const t = new Timeline(positionalEncoding, settings, 1, [
          ['load', text],
          ['encode'],
          ['score'],
        ]);
        const n = (parseSentence(text) as string[]).length;
        let filled = 0;
        let scored = 0;
        for (const e of t.entries)
          for (const step of e.steps) {
            const x = step.extra;
            // Tables fill in order and never run backwards within an operation.
            if (x?.filled !== undefined && e.call[0] === 'encode') {
              expect(x.filled).toBeGreaterThanOrEqual(filled);
              filled = x.filled;
            }
            if (x?.scored !== undefined) {
              expect(x.scored).toBeGreaterThanOrEqual(scored);
              expect(x.scored).toBeLessThanOrEqual(n * n);
              scored = x.scored;
            }
          }
        const end = t.endState();
        expect(end.table).toHaveLength(n);
        expect(end.scores).toHaveLength(n);
        if (scheme === 'alibi')
          for (let i = 0; i < n; i++) {
            expect(end.scores![i]!.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
            for (let j = i + 1; j < n; j++) expect(end.scores![i]![j]).toBe(0);
          }
        if (scheme === 'sinusoidal')
          for (let i = 0; i < n; i++) expect(end.scores![i]![i]).toBeCloseTo(4, 12);
      }),
      { numRuns: 60 },
    );
  });

  it('with RoPE at one position, the score is the self-attention score four times over', () => {
    const x = (parseSentence('the dog saw the ball and it') as string[]).map(embed);
    const plain = attention(x, DESIGNED, false, false).raw;
    const r = ropeScores(content(x));
    for (let m = 0; m < x.length; m++) expect(r.s[m]![m]).toBeCloseTo(4 * plain[m]![m]!, 12);
  });

  it('tells the story the examples tell', () => {
    const words = (t: string) => (parseSentence(t) as string[]).map(embed);
    const rope = ropeScores(content(words('the dog saw the dog saw'))).s;
    expect(rope[2]![1]).toBeCloseTo(12.14, 2);
    expect(rope[5]![4]).toBeCloseTo(rope[2]![1]!, 12);
    const cats = ropeScores(content(words('the cat saw the cat'))).s;
    expect(cats[2]![1]).toBeCloseTo(13.07, 2);
    expect(cats[2]![4]).toBeCloseTo(8.82, 2);
    const al = alibiAttention(words('the dog saw the ball and it'));
    expect(al.a[6]![4]).toBeCloseTo(0.36, 2);
    expect(al.a[6]![1]).toBeCloseTo(0.15, 2);
    expect(al.content[6]![1]).toBeGreaterThan(al.content[6]![4]!);
    const pe = scoreTable('sinusoidal', words('the cat sat on the mat and'));
    expect(pe[1]![0]).toBeCloseTo(3.54, 2);
    expect(pe[6]![0]).toBeCloseTo(3.78, 2);
  });

  it('stays readable on a laptop and a phone', () => {
    expect(smallestText(positionalEncoding, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(positionalEncoding, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
