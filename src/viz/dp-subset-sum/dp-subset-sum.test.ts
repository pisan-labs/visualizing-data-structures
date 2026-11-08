import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { practiceSet } from '../../engine/practice';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeQuestion } from '../../engine/types';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { dpSubsetSum, parseSubset } from '.';
import { MAX_TARGET } from './model';

/** The reference: can some of the first i numbers make t? Every subset, by brute force. */
function brute(xs: number[], i: number, t: number): boolean {
  for (let mask = 0; mask < 1 << i; mask++) {
    let sum = 0;
    for (let k = 0; k < i; k++) if (mask & (1 << k)) sum += xs[k]!;
    if (sum === t) return true;
  }
  return false;
}

const run = (ops: OpCall[]) => new Timeline(dpSubsetSum, {}, 1, ops);

describe('subset sum', { timeout: 60_000 }, () => {
  it('fills every cell like brute force and finds a subset exactly when one exists', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 15 }), { minLength: 1, maxLength: 6 }),
        fc.integer({ min: 0, max: MAX_TARGET }),
        fc.integer({ min: 0, max: 3 }),
        (xs, T, rows) => {
          const t = run([
            ['numbers', xs.join(' ')],
            ['target', T],
            ...Array.from({ length: rows }, () => ['row'] as OpCall),
            ['fill'],
            ['trace'],
          ]);
          for (let k = 0; k < t.length; k++) {
            const { step } = t.at(k);
            if (step.state.xs.join() !== xs.join() || step.state.T !== T) continue;
            step.state.S.forEach((r, i) =>
              r.forEach((v, c) => {
                if (v !== null) expect(v, `S[${i}][${c}]`).toBe(brute(xs, i, c));
              }),
            );
            const path = step.extra?.path ?? [];
            for (let p = 0; p + 1 < path.length; p++) {
              expect(path[p + 1]![0]).toBe(path[p]![0] - 1);
              expect(step.state.S[path[p + 1]![0]]![path[p + 1]![1]]).toBe(true);
            }
          }
          const end = t.entries.at(-1)!.steps.at(-1)!;
          const can = brute(xs, xs.length, T);
          expect(end.vars?.found).toBe(can);
          if (can) {
            const subset = String(end.vars?.subset).split(' ').filter(Boolean).map(Number);
            expect(subset.reduce((a, b) => a + b, 0)).toBe(T);
            // A sub-multiset of xs, in order.
            let at = 0;
            for (const v of subset) {
              while (at < xs.length && xs[at] !== v) at++;
              expect(at, `${v} is in order`).toBeLessThan(xs.length);
              at++;
            }
          }
        },
      ),
      { numRuns: 150 },
    );
  });

  it('finds 4 + 5 for 3 4 5 2 and target 9', () => {
    const end = run([['numbers', '3 4 5 2'], ['target', 9], ['fill'], ['trace']])
      .entries.at(-1)!
      .steps.at(-1)!;
    expect(end.say).toBe('4 + 5 = 9.');
  });

  it('reads numbers and targets, and refuses what it cannot use', () => {
    expect(parseSubset('9')).toBe(9);
    expect(parseSubset('3, 4 5')).toBe('3 4 5');
    expect(parseSubset('15')).toBe('15');
    expect(parseSubset('0 3')).toBeInstanceOf(Error);
    expect(parseSubset('16')).toBeInstanceOf(Error);
    const t = run([['numbers', 'cat'], ['target', 15], ['target', 'zebra'], ['trace']]);
    for (const e of t.entries) expect(e.end).toBe(t.initial.state);
    expect(t.entries.at(-1)!.steps[0]!.say).toMatch(/^Fill the table first/);
  });
});

describe('subset sum practice', () => {
  function questions(kind: string): PracticeQuestion[] {
    const out: PracticeQuestion[] = [];
    for (let seed = 1; out.length < 20 && seed < 400; seed++)
      for (const item of practiceSet(dpSubsetSum, seed, 4))
        if (item.kind.id === kind) out.push(item.question);
    expect(out.length).toBeGreaterThan(5);
    return out;
  }
  const problem = (q: PracticeQuestion) => ({
    xs: String(q.setup[0]![1]).split(' ').map(Number),
    T: Number(q.setup[1]![1]),
  });

  it('expects the brute-force answer', () => {
    for (const q of questions('cell')) {
      const { xs } = problem(q);
      const [, i, t] = /S\[(\d+)\]\[(\d+)\]/.exec(q.prompt)!.map(Number);
      expect(q.answer).toMatchObject({ correct: brute(xs, i!, t!) ? 0 : 1 });
    }
    for (const q of questions('subset')) {
      const { T } = problem(q);
      const a = q.answer as { value: string[] };
      expect(a.value.length).toBeGreaterThan(0);
      expect(a.value.reduce((s, v) => s + Number(v), 0)).toBe(T);
    }
    for (const q of questions('cells')) {
      const { xs, T } = problem(q);
      expect(q.answer).toEqual({ kind: 'number', value: (xs.length + 1) * (T + 1) });
    }
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(dpSubsetSum, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(dpSubsetSum, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
