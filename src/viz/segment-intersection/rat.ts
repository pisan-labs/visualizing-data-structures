/**
 * Exact rational numbers for the sweep: intersection points of segments with whole-number end
 * points are rational, and the sweep has to order them exactly. Numerators and denominators
 * stay far below 2^53 for coordinates up to 12, so plain numbers are exact.
 */
export interface Rat {
  n: number;
  d: number;
}

const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));

export function rat(n: number, d = 1): Rat {
  if (d === 0) throw new Error('zero denominator');
  if (d < 0) {
    n = -n;
    d = -d;
  }
  const g = gcd(n, d) || 1;
  return { n: n / g, d: d / g };
}

export const cmp = (a: Rat, b: Rat): number => Math.sign(a.n * b.d - b.n * a.d);
export const eq = (a: Rat, b: Rat) => cmp(a, b) === 0;
export const toNum = (a: Rat) => a.n / a.d;

/** "3", or "4.33" for a fraction. */
export function fmt(a: Rat): string {
  if (a.d === 1) return String(a.n);
  const v = Math.round((a.n / a.d) * 100) / 100;
  return String(v);
}
