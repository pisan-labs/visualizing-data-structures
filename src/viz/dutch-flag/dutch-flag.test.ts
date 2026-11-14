import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { dutchFlag as def } from '.';
import { kindOf, partitionValues, type FlagSettings, type FlagStep } from './model';

const values = fc.array(fc.integer({ min: 0, max: 12 }), { minLength: 1, maxLength: 14 });
const pivots = fc.integer({ min: 0, max: 12 });
const approaches = fc.constantFrom('pattern' as const, 'naive' as const);

function run(vs: number[], p: number, settings: FlagSettings): FlagStep[] {
  const t = new Timeline(def, settings, 1, [
    ['load', vs.join(' ')],
    ['partition', p],
  ]);
  return t.entries[1]!.steps;
}

const sorted = (xs: number[]) => [...xs].sort((x, y) => x - y);
const rank = { below: 0, equal: 1, above: 2 } as const;

describe('dutch-flag', () => {
  it('partitions like the reference both ways, and keeps the four regions on every step', () => {
    fc.assert(
      fc.property(values, pivots, approaches, (vs, p, approach) => {
        const steps = run(vs, p, { approach, draw: 'bars' });
        const n = vs.length;
        const below = vs.filter((v) => v < p).length;
        const equal = vs.filter((v) => v === p).length;
        const last = steps.at(-1)!;
        const out = last.state.a.map((x) => x.value);
        // The same values, grouped by kind, and the same bounds both ways.
        expect(sorted(out)).toEqual(sorted(vs));
        expect(out.map((v) => rank[kindOf(v, p)])).toEqual(
          sorted(vs.map((v) => rank[kindOf(v, p)])),
        );
        expect(last.vars?.low).toBe(below);
        expect(last.vars?.high).toBe(below + equal - 1);
        // The work: n comparisons and a swap per value not equal to p, or 2n and 2n.
        expect(last.vars?.['naive total']).toBe(4 * n);
        expect(last.vars?.['pattern total']).toBe(n + n - equal);
        if (approach === 'pattern') {
          expect(out).toEqual(partitionValues(vs, p).a);
          expect(last.vars?.comparisons).toBe(n);
          expect(last.vars?.swaps).toBe(n - equal);
          expect(last.vars?.writes).toBe(0);
        } else {
          // Counting then rewriting is stable: each kind keeps its order.
          expect(out).toEqual([
            ...vs.filter((v) => v < p),
            ...vs.filter((v) => v === p),
            ...vs.filter((v) => v > p),
          ]);
          expect(last.vars?.comparisons).toBe(2 * n);
          expect(last.vars?.writes).toBe(2 * n);
          expect(last.vars?.swaps).toBe(0);
        }
        for (const step of steps) {
          const live = step.state.a.filter((x) => !x.stale);
          const fromB = (step.extra?.b ?? []).filter((x) => x && !x.stale);
          // Nothing is lost or duplicated, and live values keep distinct uids.
          expect(sorted([...live, ...fromB].map((x) => x!.value))).toEqual(sorted(vs));
          const uids = [...live, ...fromB].map((x) => x!.uid);
          expect(new Set(uids).size).toBe(uids.length);
          if (approach === 'pattern') {
            const { low, mid, high } = step.vars as { low: number; mid: number; high: number };
            const a = step.state.a.map((x) => x.value);
            expect(0 <= low && low <= mid && mid <= high + 1 && high < n).toBe(true);
            a.slice(0, low).forEach((v) => expect(v).toBeLessThan(p));
            a.slice(low, mid).forEach((v) => expect(v).toBe(p));
            a.slice(high + 1).forEach((v) => expect(v).toBeGreaterThan(p));
            expect(step.vars?.comparisons).toBe(mid + (n - 1 - high));
          }
        }
      }),
      { numRuns: 300 },
    );
  });

  it('refuses a pivot it cannot read and leaves A alone', () => {
    const t = new Timeline(def, def.defaults, 1, [
      ['partition', 'cat'],
      ['partition', 500],
    ]);
    expect(t.entries[0]!.steps[0]!.say).toMatch(/whole number/);
    expect(t.entries[1]!.steps[0]!.say).toMatch(/from 0 to 99/);
    expect(t.endState().a.map((x) => x.value)).toEqual([7, 2, 5, 9, 5, 1, 8, 5, 3]);
  });

  it('reads the input box: one number is the pivot, a list is values', () => {
    const parse = def.controls.input!.parse;
    expect(parse('5')).toBe(5);
    expect(parse('7, 2, 5')).toBe('7 2 5');
    expect(parse('100')).toBeInstanceOf(Error);
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(def, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(def, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
