import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { modPow } from '.';
import type { Order, PowSettings } from './model';

/** a^b mod m with big integers, the slow and obvious way. */
const reference = (a: number, b: number, m: number) => Number(BigInt(a) ** BigInt(b) % BigInt(m));

describe('mod-pow', () => {
  it('matches a reference, with d = a^c mod m after every bit (left to right)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 999 }),
        fc.integer({ min: 0, max: 1023 }),
        fc.integer({ min: 2, max: 999 }),
        fc.constantFrom<Order>('ltr', 'rtl'),
        (a, b, m, order) => {
          const settings: PowSettings = { order };
          const t = new Timeline(modPow, settings, 1, [['pow', a, b, m]]);
          const steps = t.entries[0]!.steps;
          const end = steps.at(-1)!.state;
          expect(end.result).toBe(reference(a, b, m));
          const bits = b.toString(2).length;
          const ones = b.toString(2).split('1').length - 1;
          expect(end.squarings).toBe(bits);
          expect(end.multiplies).toBe(ones);
          for (const s of steps)
            for (const r of s.state.rows) {
              if (order === 'ltr' && r.c !== null) {
                const d = r.multiplied ?? r.squared;
                if (d !== null && (r.bit === 0 || r.multiplied !== null))
                  expect(d).toBe(reference(a, r.c, m));
              }
              if (order === 'rtl') expect(r.power).toBe(reference(a, 2 ** r.i, m));
            }
        },
      ),
      { numRuns: 300 },
    );
  });

  it('compares squarings with plain multiplication honestly for tiny exponents', () => {
    const first = (b: number) =>
      new Timeline(modPow, modPow.defaults, 1, [['pow', 3, b, 7]]).entries[0]!.steps[0]!.say;
    expect(first(1)).toMatch(
      /1 bit, so about 1 squaring\. Multiplying by 3 directly takes 0 multiplications, so for an exponent this small squaring saves nothing/,
    );
    expect(first(2)).toMatch(
      /about 2 squarings\. Multiplying by 3 directly takes 1 multiplication,/,
    );
    expect(first(100)).toMatch(/about 7 squarings instead of 99 multiplications\./);
  });

  it('rejects input out of range', () => {
    const t = new Timeline(modPow, modPow.defaults, 1, [['pow', 2, 2000, 7]]);
    expect(t.entries[0]!.steps).toHaveLength(1);
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(modPow, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(modPow, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
