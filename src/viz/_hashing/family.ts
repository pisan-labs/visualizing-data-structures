/**
 * Hash functions for the sketch pages (bloom-filter, count-min-sketch, hyperloglog,
 * consistent-hashing), written so a learner can follow them and the code tabs can copy them.
 *
 * - `familyHash(i, x, m)`: the i-th member of the universal family of CLRS,
 *   hᵢ(x) = ((aᵢ·x + bᵢ) mod p) mod m with p = 1009, a prime above every key (0 to 999).
 *   The constants are fixed, so the same key always lands in the same place.
 * - `mix16(x)`: a 16-bit hash with well-mixed bits, for HyperLogLog, which reads the bits
 *   themselves: MurmurHash3's 32-bit finalizer, keeping the top 16 bits.
 */

/** The prime of the universal family: larger than every key. */
export const FAMILY_P = 1009;
/** aᵢ and bᵢ for h1 … h6 (0-based here). Chosen once; any 1 ≤ a < p and 0 ≤ b < p work. */
export const FAMILY_A = [71, 113, 157, 211, 263, 307] as const;
export const FAMILY_B = [5, 17, 29, 43, 61, 83] as const;
export const FAMILY_SIZE = FAMILY_A.length;

export interface FamilyHash {
  /** hᵢ(x), in 0 … m − 1. */
  value: number;
  /** (aᵢ·x + bᵢ) mod p, before the final mod m. */
  raw: number;
  /** "h2(42) = (113·42 + 17) mod 1009 mod 16 = 707 mod 16 = 3", for narration. */
  say: string;
  /** "h2(42) = 707 mod 16 = 3", for the drawing. */
  short: string;
}

/** The i-th hash (i from 0; shown as h1, h2, …) of key x into m buckets. */
export function familyHash(i: number, x: number, m: number): FamilyHash {
  const a = FAMILY_A[i]!;
  const b = FAMILY_B[i]!;
  const raw = (a * x + b) % FAMILY_P;
  const value = raw % m;
  const name = `h${i + 1}(${x})`;
  return {
    value,
    raw,
    say: `${name} = (${a}·${x} + ${b}) mod ${FAMILY_P} mod ${m} = ${raw} mod ${m} = ${value}`,
    short: `${name} = ${raw} mod ${m} = ${value}`,
  };
}

/** The formula of hᵢ, for pseudocode and help text. */
export const familyFormula = (i: number) =>
  `h${i + 1}(x) = (${FAMILY_A[i]}·x + ${FAMILY_B[i]}) mod ${FAMILY_P}`;

/** MurmurHash3's finalizer: a bijection on 32-bit numbers that spreads nearby inputs apart. */
export function fmix32(x: number): number {
  let h = x >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** A 16-bit hash: the top 16 bits of fmix32(x). */
export const mix16 = (x: number): number => fmix32(x) >>> 16;

/** x in binary, padded to `bits` digits. */
export const binary = (x: number, bits: number): string => x.toString(2).padStart(bits, '0');
