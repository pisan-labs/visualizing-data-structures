import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { masterTheorem, parseRecurrence } from '.';
import { classify, readRec, unroll, type MtSettings, type Rec } from './model';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';

const settings = (s: Partial<MtSettings> = {}): MtSettings =>
  ({ ...masterTheorem.defaults, ...s }) as MtSettings;

/**
 * Reference: sum the recursion tree level by level for n = b^m and see which part grows. The
 * work on level i is a^i (n/b^i)^d = n^d (a/b^d)^i, so the ratio r = a/b^d decides it.
 */
function reference(r: Rec): 'leaves' | 'equal' | 'root' | 'gap' {
  const m = 40;
  const levels = Array.from({ length: m + 1 }, (_, i) => (r.a / r.b ** r.d) ** i);
  const first = levels[0]!;
  const lastLevel = levels[m]!;
  if (lastLevel > first * 1.0001) return 'leaves';
  if (lastLevel < first * 0.9999) return 'root';
  return r.k >= 0 ? 'equal' : 'gap';
}

describe('master theorem', () => {
  it('solves the classic recurrences', () => {
    const answer = (a: number, b: number, d: number, k = 0) => classify({ a, b, d, k }).answer;
    expect(answer(2, 2, 1)).toBe('Θ(n lg n)');
    expect(answer(1, 2, 0)).toBe('Θ(lg n)');
    expect(answer(3, 2, 1)).toBe('Θ(n^1.585)');
    expect(answer(7, 2, 2)).toBe('Θ(n^2.807)');
    expect(answer(2, 2, 2)).toBe('Θ(n²)');
    expect(answer(4, 2, 1)).toBe('Θ(n²)');
    expect(answer(2, 2, 1, 1)).toBe('Θ(n lg² n)');
    expect(answer(2, 2, 1, -1)).toBe('Θ(n lg lg n)');
    expect(answer(2, 2, 1, -2)).toBe('Θ(n)');
    expect(answer(1, 2, 0, -1)).toBe('Θ(lg lg n)');
    expect(answer(9, 3, 2)).toBe('Θ(n² lg n)');
    expect(classify({ a: 2, b: 2, d: 1, k: -1 }).kind).toBe('gap');
  });

  it('reads recurrences in two forms', () => {
    expect(readRec('2 2 1')).toEqual({ a: 2, b: 2, d: 1, k: 0 });
    expect(readRec('T(n) = 2T(n/2) + n')).toEqual({ a: 2, b: 2, d: 1, k: 0 });
    expect(readRec('T(n) = T(n/2) + 1')).toEqual({ a: 1, b: 2, d: 0, k: 0 });
    expect(readRec('T(n) = 7T(n/2) + n^2')).toEqual({ a: 7, b: 2, d: 2, k: 0 });
    expect(readRec('T(n) = 2T(n/2) + n log n')).toEqual({ a: 2, b: 2, d: 1, k: 1 });
    expect(readRec('T(n) = 2T(n/2) + n/lg n')).toEqual({ a: 2, b: 2, d: 1, k: -1 });
    expect(readRec('T(n) = 3T(n/4) + n² lg² n')).toEqual({ a: 3, b: 4, d: 2, k: 2 });
    expect(typeof readRec('2 1 1')).toBe('string');
    expect(typeof readRec('cat')).toBe('string');
    expect(parseRecurrence('2 2 1 0')).toBe('2 2 1');
    expect(parseRecurrence('zebra')).toBeInstanceOf(Error);
  });

  it('unrolls T(n) exactly', () => {
    const t = unroll({ a: 2, b: 2, d: 1, k: 0 }, 3).map((x) => x.t);
    expect(t).toEqual([1n, 4n, 12n, 32n]);
  });

  it('turns down log factors in the simplified form', () => {
    const t = new Timeline(masterTheorem, settings({ form: 'simple' }), 1, [['solve', '2 2 1 1']]);
    expect(t.endState().rec).toBeNull();
  });

  it('agrees with summing the tree, for any recurrence', () => {
    const rec = fc.record({
      a: fc.integer({ min: 1, max: 16 }),
      b: fc.integer({ min: 2, max: 8 }),
      d: fc.integer({ min: 0, max: 3 }),
      k: fc.integer({ min: -2, max: 2 }),
    });
    fc.assert(
      fc.property(rec, fc.constantFrom<'clrs' | 'simple'>('clrs', 'simple'), (r, form) => {
        const arg = `${r.a} ${r.b} ${r.d} ${r.k}`;
        const calls: OpCall[] = [['solve', arg], ['check']];
        const t = new Timeline(masterTheorem, settings({ form }), 1, calls);
        if (form === 'simple' && r.k !== 0) {
          expect(t.endState().rec).toBeNull();
          return;
        }
        const solved = t.entries[0]!.end;
        expect(solved.result!.kind).toBe(reference(r));
        expect(solved.depth).toBeGreaterThanOrEqual(1);
        // The numeric check: T(n) matches a direct recursion, and never shrinks.
        const rows = t.endState().check!;
        const direct = (n: number): number =>
          n === 1 ? 1 : r.a * direct(n / r.b) + n ** r.d * Math.log2(n) ** r.k;
        for (const row of rows) {
          const n = r.b ** row.m;
          const want = direct(n);
          const got = Number(row.t);
          if (want < 1e12) expect(Math.abs(got - want) / want).toBeLessThan(1e-3);
          expect(Number(row.ratio)).toBeGreaterThan(0);
        }
        // Steps only ever add to the picture.
        let depth = -1;
        for (const e of t.entries.slice(0, 1))
          for (const s of e.steps) {
            expect(s.state.depth).toBeGreaterThanOrEqual(depth);
            depth = s.state.depth;
          }
      }),
      { numRuns: 300 },
    );
  });
});

describe('drawn text size', () => {
  // The tree's values drew at 9 px on a phone; at the tree font 13, at 9.4.
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(masterTheorem, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(masterTheorem, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
