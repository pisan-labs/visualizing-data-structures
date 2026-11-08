import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { rsa } from '.';
import { isPrime, type RsaSettings, type Totient } from './model';

const PRIMES = Array.from({ length: 98 }, (_, k) => k).filter(isPrime);

const gcd = (a: bigint, b: bigint): bigint => (b === 0n ? a : gcd(b, a % b));
const powMod = (a: number, b: number, m: number) => Number(BigInt(a) ** BigInt(b) % BigInt(m));

describe('rsa', () => {
  it('makes keys with e·d ≡ 1, and decryption undoes encryption for every message', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...PRIMES),
        fc.constantFrom(...PRIMES),
        fc.constantFrom<Totient>('euler', 'carmichael'),
        fc.nat(),
        (p, q, phi, seed) => {
          const settings: RsaSettings = { phi };
          const t = new Timeline(rsa, settings, 1, [['keys', p, q]]);
          const k = t.entries[0]!.end.keys;
          const tot = phi === 'euler' ? (p - 1) * (q - 1) : lcm(p - 1, q - 1);
          if (p === q || tot <= 2 || !k) {
            // Refused: the state did not change.
            expect(t.entries[0]!.steps).toHaveLength(1);
            return;
          }
          expect(k.n).toBe(p * q);
          expect(k.phi).toBe(tot);
          expect(gcd(BigInt(k.e!), BigInt(tot))).toBe(1n);
          for (let e = 2; e < k.e!; e++) expect(gcd(BigInt(e), BigInt(tot))).not.toBe(1n);
          expect((k.e! * k.d!) % tot).toBe(1 % tot);
          const m = seed % k.n!;
          const t2 = new Timeline(rsa, settings, 1, [
            ['keys', p, q],
            ['encrypt', m],
          ]);
          const c = t2.entries[1]!.end.c!;
          expect(c).toBe(powMod(m, k.e!, k.n!));
          const t3 = new Timeline(rsa, settings, 1, [
            ['keys', p, q],
            ['encrypt', m],
            ['decrypt', c],
          ]);
          expect(t3.entries[2]!.end.back).toBe(m);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('refuses a message that is not below n, and an e that shares a factor with φ', () => {
    const t = new Timeline(rsa, rsa.defaults, 1, [
      ['keys', 11, 13],
      ['encrypt', 143],
      ['useE', 15],
    ]);
    expect(t.entries[1]!.end).toEqual(t.entries[0]!.end);
    expect(t.entries[2]!.end).toEqual(t.entries[0]!.end);
    expect(t.entries[1]!.steps[0]!.say).toContain('less than n = 143');
  });
});

function lcm(a: number, b: number) {
  return (a / Number(gcd(BigInt(a), BigInt(b)))) * b;
}

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(rsa, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(rsa, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
