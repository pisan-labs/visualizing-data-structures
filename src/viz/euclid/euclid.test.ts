import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { euclid } from '.';
import { lameBound, type EuclidSettings } from './model';

const settings = (version: 'basic' | 'extended'): EuclidSettings => ({ version });

/** Iterative gcd and extended gcd, written the other way round from the model. */
function refGcd(a: number, b: number) {
  let calls = 0;
  while (b !== 0) {
    [a, b] = [b, a % b];
    calls++;
  }
  return { d: a, calls };
}

function refExt(a: number, b: number): [number, number, number] {
  let [r0, r1, s0, s1, t0, t1] = [a, b, 1, 0, 0, 1];
  while (r1 !== 0) {
    const q = Math.floor(r0 / r1);
    [r0, r1] = [r1, r0 - q * r1];
    [s0, s1] = [s1, s0 - q * s1];
    [t0, t1] = [t1, t0 - q * t1];
  }
  return [r0, s0, t0];
}

describe('euclid', () => {
  it('matches a reference on every pair, with every row keeping the gcd', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 999 }), fc.integer({ min: 0, max: 999 }), (a, b) => {
        const t = new Timeline(euclid, settings('extended'), 1, [['gcd', a, b]]);
        const steps = t.entries[0]!.steps;
        const end = steps.at(-1)!.state;
        const ref = refGcd(a, b);
        expect(end.d).toBe(ref.d);
        expect(end.rows.length - 1).toBe(ref.calls);
        expect(ref.calls).toBeLessThanOrEqual(lameBound(a, b));
        for (const step of steps) {
          for (const r of step.state.rows) {
            expect(refGcd(r.a, r.b).d).toBe(ref.d);
            if (r.x !== null && r.y !== null) expect(r.a * r.x + r.b * r.y).toBe(ref.d);
          }
        }
        // The x and y textbooks get from the iterative version are the same as the recursion's.
        const [d, x, y] = refExt(a, b);
        expect([end.d, end.rows[0]!.x, end.rows[0]!.y]).toEqual([d, x, y]);
      }),
      { numRuns: 300 },
    );
  });

  it('finds inverses exactly when the gcd is 1', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 999 }), fc.integer({ min: 2, max: 999 }), (a, m) => {
        const t = new Timeline(euclid, settings('basic'), 1, [['inverse', a, m]]);
        const end = t.entries[0]!.steps.at(-1)!.state;
        if (refGcd(a, m).d !== 1) expect(end.inverse).toBeNull();
        else {
          expect(end.inverse).toBeGreaterThanOrEqual(0);
          expect((a * end.inverse!) % m).toBe(1 % m);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('reaches Lamé’s bound on consecutive Fibonacci numbers', () => {
    const t = new Timeline(euclid, settings('basic'), 1, [['gcd', 144, 89]]);
    const end = t.entries[0]!.steps.at(-1)!;
    expect(end.vars?.calls).toBe(10);
    expect(end.vars?.['Lamé bound']).toBe(10);
  });

  it('rejects bad input without changing anything', () => {
    const t = new Timeline(euclid, settings('basic'), 1, [
      ['gcd', 12, 8],
      ['gcd', -1, 'cat'],
    ]);
    expect(t.entries[1]!.end).toEqual(t.entries[0]!.end);
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(euclid, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(euclid, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
