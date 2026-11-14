import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeRng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { embed } from '../_lm/vocab';
import { animalFirst, rnnLstm, twoAnimals } from '.';
import {
  memoryOf,
  parseSentence,
  pullText,
  readAll,
  type LstmRow,
  type Model,
  type RnnSettings,
} from './model';
import { practiceSentence } from './practice';

/**
 * The networks written independently of the page: whole weight matrices, the gates computed
 * from h as well (their weights on h are 0 here), and the pull as a numerical derivative.
 */
function reference(words: string[], model: Model, w: number) {
  const sig = (z: number) => 1 / (1 + Math.exp(-z));
  const lin = (x: number[], u: number[], wh: number, h: number, b: number) =>
    x.reduce((t, v, k) => t + v * u[k]!, 0) + wh * h + b;
  // Run from step `from` with the memory after it nudged by eps.
  const run = (from = -1, eps = 0) => {
    let h = 0;
    let c = 0;
    const out: { h: number; c: number }[] = [];
    words.forEach((word, t) => {
      const x = embed(word);
      if (model === 'rnn') h = Math.tanh(w * h + lin(x, [1, 0, 0, 0], 0, 0, 0));
      else {
        const f = model === 'lstm' ? sig(lin(x, [-6, 0, 0, 0], 0, h, 3)) : 1;
        const i = sig(lin(x, [6, 0, 0, 0], 0, h, -3));
        const g = Math.tanh(lin(x, [2, 0, 0, 0], 0, h, 0));
        const o = sig(lin(x, [0, 0, 4, 0], 0, h, -2));
        c = f * c + i * g;
        h = o * Math.tanh(c);
      }
      if (t === from) {
        if (model === 'rnn') h += eps;
        else c += eps;
      }
      out.push({ h, c });
    });
    return out;
  };
  const base = run();
  const eps = 1e-6;
  const up = run(0, eps);
  const down = run(0, -eps);
  const m = (s: { h: number; c: number }) => (model === 'rnn' ? s.h : s.c);
  return base.map((s, t) => ({ ...s, pull: (m(up[t]!) - m(down[t]!)) / (2 * eps) }));
}

const wordArb = fc.constantFrom(
  ...'the a cat dog fox bird sat ran saw on under mat ball it and slept zorp q'.split(' '),
);
const sentenceArb = fc.array(wordArb, { minLength: 1, maxLength: 8 }).map((w) => w.join(' '));
const settingsArb = fc.record({
  model: fc.constantFrom('rnn' as const, 'lstm' as const, 'lstm97' as const),
  w: fc.constantFrom('0.5' as const, '0.8' as const, '1.5' as const),
});

describe('rnn-lstm', () => {
  it('matches an independent reference, the pull included', () => {
    fc.assert(
      fc.property(sentenceArb, settingsArb, (text, set) => {
        const words = parseSentence(text) as string[];
        const rows = readAll(words, set.model, Number(set.w));
        const ref = reference(words, set.model, Number(set.w));
        rows.forEach((r, t) => {
          expect(r.h).toBeCloseTo(ref[t]!.h, 12);
          if (r.kind === 'lstm') expect(r.c).toBeCloseTo(ref[t]!.c, 12);
          expect(r.pull).toBeCloseTo(ref[t]!.pull, 6);
        });
      }),
      { numRuns: 200 },
    );
  });

  it('keeps its invariants on every step of random runs', () => {
    fc.assert(
      fc.property(sentenceArb, settingsArb, fc.integer({ min: 0, max: 9 }), (text, set, steps) => {
        const settings: RnnSettings = { ...set };
        const calls = [['load', text], ...Array(steps).fill(['step']), ['run']] as [
          string,
          ...string[],
        ][];
        const t = new Timeline(rnnLstm, settings, 1, calls);
        const n = (parseSentence(text) as string[]).length;
        let read = 0;
        for (const e of t.entries) {
          // Each step reads at most one word, and run reads the rest.
          const now = e.end.rows.length;
          expect(now - read).toBeLessThanOrEqual(e.call[0] === 'step' ? 1 : n);
          read = now;
          for (const step of e.steps) {
            const x = step.extra;
            if (x?.t !== undefined) expect(x.t).toBe(step.state.rows.length);
          }
        }
        const rows = t.endState().rows;
        expect(rows).toHaveLength(n);
        rows.forEach((r, k) => {
          expect(Math.abs(r.h)).toBeLessThan(1);
          // Every factor is in [0, max(1, w)]: the pull grows only while a plain RNN with
          // w > 1 sits near h = 0.
          const w = settings.model === 'rnn' ? Number(settings.w) : 1;
          expect(r.factor).toBeGreaterThanOrEqual(0);
          expect(r.factor).toBeLessThanOrEqual(Math.max(1, w));
          if (k > 0 && w <= 1) expect(r.pull).toBeLessThanOrEqual(rows[k - 1]!.pull);
          if (r.kind === 'lstm') {
            for (const g of [r.f, r.i, r.o]) {
              expect(g).toBeGreaterThan(0);
              expect(g).toBeLessThanOrEqual(1);
            }
            if (settings.model === 'lstm97') expect(r.pull).toBe(1);
          }
        });
        expect(rows[0]!.pull).toBe(1);
      }),
      { numRuns: 80 },
    );
  });

  it('tells the story the examples and the concept page tell', () => {
    const words = parseSentence('cat sat on the mat and it slept') as string[];
    const rnn = readAll(words, 'rnn', 0.8);
    expect(rnn.map((r) => r.h.toFixed(2))).toEqual([
      '0.76',
      '0.54',
      '0.41',
      '0.32',
      '0.25',
      '0.20',
      '0.16',
      '0.12',
    ]);
    expect(rnn[1]!.factor.toFixed(2)).toBe('0.56');
    expect(pullText(rnn.at(-1)!.pull)).toBe('0.096');
    expect(pullText(readAll(words, 'rnn', 0.5).at(-1)!.pull)).toBe('0.0065');
    const latch = readAll(words, 'rnn', 1.5);
    expect(latch.at(-1)!.h.toFixed(2)).toBe('0.86');
    expect(pullText(latch.at(-1)!.pull)).toBe('0.0023');
    const lstm = readAll(words, 'lstm', 0) as LstmRow[];
    expect([lstm[0]!.f, lstm[0]!.i, lstm[0]!.g, lstm[0]!.c].map((v) => v.toFixed(2))).toEqual([
      '0.05',
      '0.95',
      '0.96',
      '0.92',
    ]);
    expect(lstm.at(-1)!.c.toFixed(2)).toBe('0.65');
    expect(lstm.at(-1)!.pull.toFixed(2)).toBe('0.71');
    expect([lstm[1]!.h, lstm[7]!.h].map((v) => v.toFixed(2))).toEqual(['0.62', '0.48']);
    const dog = readAll(parseSentence('cat sat and the dog ate it') as string[], 'lstm', 0);
    expect([dog[3]!.pull, (dog[4] as LstmRow).f, dog[4]!.pull].map((v) => v.toFixed(2))).toEqual([
      '0.86',
      '0.08',
      '0.07',
    ]);
    const grows = readAll(parseSentence('cat saw a dog and a fox') as string[], 'lstm97', 0);
    expect([0, 3, 6].map((t) => memoryOf(grows[t]!).toFixed(2))).toEqual(['0.92', '1.80', '2.72']);
  });

  it('parses sentences and refuses what does not fit', () => {
    expect(parseSentence('Cat, sat!')).toEqual(['cat', 'sat']);
    expect(parseSentence('')).toBeInstanceOf(Error);
    expect(parseSentence('a b c d e f g h i')).toBeInstanceOf(Error);
    expect(parseSentence('the elephant')).toBeInstanceOf(Error);
    for (let seed = 1; seed < 30; seed++) {
      const rng = makeRng(seed);
      for (const text of [animalFirst(rng), twoAnimals(rng), practiceSentence(rng)])
        expect(parseSentence(text)).not.toBeInstanceOf(Error);
    }
  });

  it('stays readable on a laptop and a phone', () => {
    expect(smallestText(rnnLstm, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(rnnLstm, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
