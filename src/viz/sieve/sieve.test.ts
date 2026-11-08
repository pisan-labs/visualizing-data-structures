import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { sieve } from '.';
import { primesUpTo, type SieveSettings, type Start, type Stop } from './model';

const isPrime = (k: number) => k >= 2 && primesUpTo(k).at(-1) === k;

describe('sieve', () => {
  it('finds exactly the primes, and never crosses out a prime', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 120 }),
        fc.constantFrom<Start>('square', 'double'),
        fc.constantFrom<Stop>('sqrt', 'all'),
        (n, start, stop) => {
          const settings: SieveSettings = { start, stop };
          const steps = new Timeline(sieve, settings, 1, [['sieve', n]]).entries[0]!.steps;
          for (const s of steps)
            s.state.status.forEach((v, k) => {
              if (v === 'crossed') expect(isPrime(k)).toBe(false);
              if (v === 'prime') expect(isPrime(k)).toBe(true);
            });
          const end = steps.at(-1)!.state;
          const primes = end.status.flatMap((v, k) => (v === 'prime' ? [k] : []));
          expect(primes).toEqual(primesUpTo(n));
          // Every cross-out is counted once; distinct numbers crossed out are the composites.
          const composites = n - 1 - primes.length;
          expect(end.status.filter((v) => v === 'crossed').length).toBe(composites);
          let marks = 0;
          for (let p = 2; stop === 'sqrt' ? p * p <= n : p <= n; p++)
            if (isPrime(p))
              for (let j = start === 'square' ? p * p : 2 * p; j <= n; j += p) marks++;
          expect(end.marks).toBe(marks);
        },
      ),
      { numRuns: 150 },
    );
  });

  it('never names an empty range of smaller multiples', () => {
    const says = new Timeline(sieve, { start: 'square', stop: 'sqrt' }, 1, [
      ['sieve', 30],
    ]).entries[0]!.steps.map((s) => s.say).join(' ');
    expect(says).not.toMatch(/2·2 to 2·1|3·2 to 3·2/);
    expect(says).toMatch(/starting at 2² = 4\./);
    expect(says).toMatch(/the smaller ones, 5·2 to 5·4,/);
  });

  it('says "1 prime", not "1 primes"', () => {
    const t = new Timeline(sieve, { start: 'square', stop: 'sqrt' }, 1, [['sieve', 2]]);
    expect(t.entries[0]!.steps.at(-1)!.say).toMatch(/^There is 1 prime up to 2\./);
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(sieve, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(sieve, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
