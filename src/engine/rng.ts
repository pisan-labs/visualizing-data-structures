/** Seeded random numbers so every replay of an example is identical. */
export interface Rng {
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [lo, hi], inclusive. */
  int(lo: number, hi: number): number;
}

/** mulberry32: small, fast, good enough for teaching randomness. */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
  };
}

/** The MurmurHash3 finalizer: a bijection on 32 bits in which nearby inputs land far apart. */
function mix(x: number): number {
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return (x ^ (x >>> 16)) >>> 0;
}

/**
 * Derive an independent seed for operation `index`, so replaying one op never shifts another.
 * The seed is mixed before the index joins it: combining them first (seed ^ index) made nearby
 * seeds share numbers, so practice set 12346 repeated a question of set 12345.
 */
export function deriveSeed(seed: number, index: number): number {
  return mix((mix(seed >>> 0) + Math.imul(index + 1, 0x9e3779b9)) >>> 0);
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}
