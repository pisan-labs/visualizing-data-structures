import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { practiceSet } from '../../engine/practice';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeQuestion } from '../../engine/types';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { dpRodCutting, parsePrices } from '.';
import { greedyCut, type RodSettings } from './model';

/** The reference: the best revenue over every way to cut, by brute force. */
function brute(p: number[], n: number): number {
  if (n === 0) return 0;
  let best = -1;
  for (let i = 1; i <= n; i++) best = Math.max(best, p[i]! + brute(p, n - i));
  return best;
}

const pricesArb = fc.array(fc.integer({ min: 0, max: 60 }), { minLength: 1, maxLength: 8 });
const run = (ops: OpCall[], style: RodSettings['style'] = 'bottomup') =>
  new Timeline(dpRodCutting, { style }, 1, ops);

describe('rod cutting', { timeout: 60_000 }, () => {
  it('fills r like the reference and cuts pieces that earn r[n]', () => {
    fc.assert(
      fc.property(
        pricesArb,
        fc.constantFrom<RodSettings['style']>('bottomup', 'memo'),
        fc.integer({ min: 0, max: 3 }),
        (prices, style, nexts) => {
          const p = [0, ...prices];
          const n = prices.length;
          const t = run(
            [
              ['prices', prices.join(' ')],
              ...Array.from({ length: nexts }, () => ['next'] as OpCall),
              ['fill'],
              ['cut'],
            ],
            style,
          );
          for (let k = 0; k < t.length; k++) {
            const { step } = t.at(k);
            if (step.state.p.join() !== p.join()) continue;
            step.state.r.forEach((v, j) => {
              if (v === null) return;
              expect(v, `r[${j}]`).toBe(brute(p, j));
              const s = step.state.s[j]!;
              if (j > 0) expect(p[s]! + step.state.r[j - s]!).toBe(v);
            });
          }
          const end = t.entries.at(-1)!.steps.at(-1)!;
          expect(end.vars?.revenue).toBe(brute(p, n));
          const pieces = String(end.vars?.pieces).split(' ').map(Number);
          expect(pieces.reduce((a, b) => a + b, 0)).toBe(n);
          expect(pieces.reduce((a, k) => a + p[k]!, 0)).toBe(brute(p, n));
          expect(Number(end.vars?.greedy)).toBeLessThanOrEqual(brute(p, n));
        },
      ),
      { numRuns: 120 },
    );
  });

  it('counts n(n + 1)/2 sums bottom-up and n(n + 1)/2 + 1 calls top-down', () => {
    for (let n = 1; n <= 10; n++) {
      const prices = Array.from({ length: n }, (_, k) => k + 1).join(' ');
      const b = run([['prices', prices], ['fill']])
        .entries.at(-1)!
        .steps.at(-1)!;
      expect(b.vars?.sums).toBe((n * (n + 1)) / 2);
      const m = run([['prices', prices], ['fill']], 'memo')
        .entries.at(-1)!
        .steps.at(-1)!;
      expect(m.vars?.calls).toBe((n * (n + 1)) / 2 + 1);
      expect(m.vars?.hits).toBe((n * (n - 1)) / 2);
    }
  });

  it('cuts the textbook rod into 2 and 6, where greedy earns less', () => {
    const end = run([['prices', '1 5 8 9 10 17 17 20'], ['fill'], ['cut']])
      .entries.at(-1)!
      .steps.at(-1)!;
    expect(end.vars).toMatchObject({ revenue: 22, pieces: '2 6' });
    const d = run([['prices', '1 5 8 9'], ['fill'], ['cut']])
      .entries.at(-1)!
      .steps.at(-1)!;
    expect(d.say).toBe(
      'Cut into 2 and 2: 5 + 5 = 10. Greedy by price per unit cuts 3 and 1 and earns only 9.',
    );
    expect(greedyCut([0, 1, 5, 8, 9], 4)).toEqual({ pieces: [3, 1], value: 9 });
  });

  it('reads prices, and refuses what it cannot use', () => {
    expect(parsePrices('1, 5 8')).toBe('1 5 8');
    expect(parsePrices('1 x')).toBeInstanceOf(Error);
    expect(parsePrices('61')).toBeInstanceOf(Error);
    expect(parsePrices('1 2 3 4 5 6 7 8 9 10 11')).toBeInstanceOf(Error);
    const t = run([['prices', 'cat'], ['prices', -3], ['cut']]);
    for (const e of t.entries) expect(e.end).toBe(t.initial.state);
    expect(t.entries.at(-1)!.steps[0]!.say).toMatch(/^Fill the table first/);
  });
});

describe('rod cutting practice', () => {
  function questions(kind: string): PracticeQuestion[] {
    const out: PracticeQuestion[] = [];
    for (let seed = 1; out.length < 20 && seed < 400; seed++)
      for (const item of practiceSet(dpRodCutting, seed, 4))
        if (item.kind.id === kind) out.push(item.question);
    expect(out.length).toBeGreaterThan(5);
    return out;
  }
  const pricesOf = (q: PracticeQuestion) => [0, ...String(q.setup[0]![1]).split(' ').map(Number)];

  it('expects the reference revenue and the reference greedy value', () => {
    for (const q of questions('next')) {
      const j = Number(/What is r\[(\d+)\]/.exec(q.prompt)![1]);
      expect(q.answer).toEqual({ kind: 'number', value: brute(pricesOf(q), j) });
    }
    for (const q of questions('greedy')) {
      const p = pricesOf(q);
      expect(q.answer).toEqual({ kind: 'number', value: greedyCut(p, p.length - 1).value });
    }
    for (const q of questions('calls')) {
      const n = pricesOf(q).length - 1;
      expect(q.answer).toEqual({ kind: 'number', value: (n * (n + 1)) / 2 + 1 });
    }
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(dpRodCutting, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(dpRodCutting, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
