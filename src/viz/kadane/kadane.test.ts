import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { kadane as def } from '.';
import { kadane as pass, type KSettings } from './model';

/**
 * The reference: every subarray summed from scratch. The answer is the one with the largest
 * sum that starts first and, of those, ends first; with `empty`, the empty one unless some
 * subarray is strictly positive.
 */
function reference(a: number[], empty: boolean) {
  let best = empty ? { sum: 0, lo: 0, hi: -1 } : null;
  for (let i = 0; i < a.length; i++)
    for (let j = i; j < a.length; j++) {
      let s = 0;
      for (let t = i; t <= j; t++) s += a[t]!;
      if (!best || s > best.sum) best = { sum: s, lo: i, hi: j };
    }
  return best!;
}

/** The best sum of a subarray ending at j. */
function endingAt(a: number[], j: number): number {
  let best = -Infinity;
  for (let i = 0; i <= j; i++) {
    let s = 0;
    for (let t = i; t <= j; t++) s += a[t]!;
    best = Math.max(best, s);
  }
  return best;
}

const arrays = fc.array(fc.integer({ min: -9, max: 9 }), { minLength: 1, maxLength: 12 });
const approaches = fc.constantFrom('pattern' as const, 'naive' as const);

function runFind(a: number[], settings: KSettings) {
  const t = new Timeline(def, settings, 1, [['load', a.join(' ')], ['find']]);
  return t.entries[1]!.steps;
}

describe('kadane', () => {
  it('gives the reference answer both ways, and keeps every step consistent', () => {
    fc.assert(
      fc.property(arrays, approaches, fc.boolean(), (a, approach, empty) => {
        const steps = runFind(a, { approach, empty });
        const ref = reference(a, empty);
        const n = a.length;
        const last = steps.at(-1)!;
        expect(last.vars?.best).toBe(ref.sum);
        expect([last.vars?.lo, last.vars?.hi]).toEqual([ref.lo, ref.hi]);
        expect(last.extra?.best).toEqual({ lo: ref.lo, hi: ref.hi, sum: ref.sum });
        expect(pass(a, empty).best).toEqual({ lo: ref.lo, hi: ref.hi, sum: ref.sum });
        // The work: n sums and 2n comparisons, or n(n + 1)/2 of each.
        expect(last.vars?.['naive total']).toBe(n * (n + 1));
        expect(last.vars?.['pattern total']).toBe(3 * n);
        const pairs = (n * (n + 1)) / 2;
        expect(last.vars?.sums).toBe(approach === 'pattern' ? n : pairs);
        expect(last.vars?.comparisons).toBe(approach === 'pattern' ? 2 * n : pairs);
        for (const step of steps) {
          const e = step.extra!;
          if (approach === 'pattern') {
            const run = e.run!;
            const known = run.filter((v) => v !== null);
            // run[j] is the best sum ending at j, and best is the best of those so far.
            known.forEach((v, j) => expect(v).toBe(endingAt(a, j)));
            const top = Math.max(empty ? 0 : -Infinity, ...(known as number[]));
            if (e.best) expect(e.best.sum).toBe(top);
            else expect(known).toEqual([]);
            // A run starts at 0 and wherever the run before it was negative.
            const starts = [0, ...known.flatMap((_, j) => (j > 0 && run[j - 1]! < 0 ? [j] : []))];
            expect(e.starts).toEqual(starts);
            if (e.cur) {
              let s = 0;
              for (let t = e.cur.lo; t <= e.cur.hi; t++) s += a[t]!;
              expect(e.cur.sum).toBe(s);
              expect(e.cur.lo).toBe(starts.at(-1));
            }
          } else {
            for (const [i, row] of e.tri!.entries())
              row.forEach((v, j) => {
                if (v === null) return;
                let s = 0;
                for (let t = i; t <= j; t++) s += a[t]!;
                expect(v).toBe(s);
              });
          }
          if (e.best && e.best.hi >= e.best.lo) {
            let s = 0;
            for (let t = e.best.lo; t <= e.best.hi; t++) s += a[t]!;
            expect(e.best.sum).toBe(s);
          }
        }
      }),
      { numRuns: 300 },
    );
  });

  it('gives the largest value when every value is negative, and 0 with the empty subarray', () => {
    const neg = [-3, -1, -4, -2, -5];
    expect(runFind(neg, { approach: 'pattern', empty: false }).at(-1)!.vars?.best).toBe(-1);
    const withEmpty = runFind(neg, { approach: 'pattern', empty: true }).at(-1)!;
    expect(withEmpty.vars?.best).toBe(0);
    expect(withEmpty.vars?.length).toBe(0);
    expect(withEmpty.say).toMatch(/empty subarray/);
  });

  it('keeps a run at exactly 0 going, so the earlier start wins a tie', () => {
    const last = runFind([2, -2, 3, -1], { approach: 'pattern', empty: false }).at(-1)!;
    expect([last.vars?.lo, last.vars?.hi]).toEqual([0, 2]);
  });

  it('refuses values it cannot read', () => {
    const t = new Timeline(def, { approach: 'pattern', empty: false }, 1, [
      ['load', '1 2 300'],
      ['load', Array(13).fill(1).join(' ')],
      ['load', 'cat'],
    ]);
    expect(t.entries[0]!.steps[0]!.say).toMatch(/300 is out of range/);
    expect(t.entries[1]!.steps[0]!.say).toMatch(/at most 12/);
    expect(t.entries[2]!.steps[0]!.say).toMatch(/not a whole number/);
    expect(t.endState().a).toEqual([3, -4, 5, -2, -1, 6, -7, 2, 1]);
  });

  it('reads the input box as a list of values', () => {
    const parse = def.controls.input!.parse;
    expect(parse('3, -4, 5')).toBe('3 -4 5');
    expect(parse('−4')).toBe('-4');
    expect(parse('1 2 x')).toBeInstanceOf(Error);
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(def, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(def, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
