/**
 * Numbers for the AI and LLM pages (PLAN.md section 20): matrix products, a stable softmax, and
 * the ways numbers are written. The arithmetic runs in a fixed order (left to right, starting
 * from 0), the same order as the Python, Java and C++ tabs, so all four agree to the last bit
 * wherever no `exp` is involved, and to three decimals everywhere.
 */

/** a (n × m) times b (m × p), each sum from 0 in index order. */
export function matmul(a: readonly (readonly number[])[], b: readonly (readonly number[])[]) {
  const m = b.length;
  const p = b[0]?.length ?? 0;
  return a.map((row) => {
    const out: number[] = [];
    for (let j = 0; j < p; j++) {
      let s = 0;
      for (let t = 0; t < m; t++) s += row[t]! * b[t]![j]!;
      out.push(s);
    }
    return out;
  });
}

/** The dot product, summed from 0 in index order. */
export function dot(a: readonly number[], b: readonly number[]): number {
  let s = 0;
  for (let t = 0; t < a.length; t++) s += a[t]! * b[t]!;
  return s;
}

/**
 * Softmax with the row's largest value subtracted first, so `exp` never overflows; −∞ entries
 * get 0. Exponentials and their sum also come back, for narration.
 */
export function softmax(row: readonly number[]): {
  p: number[];
  e: number[];
  max: number;
  sum: number;
} {
  const max = Math.max(...row);
  const e = row.map((s) => Math.exp(s - max));
  let sum = 0;
  for (const x of e) sum += x;
  return { p: e.map((x) => x / sum), e, max, sum };
}

/**
 * Three decimals by rounding |x| · 1000 half up, with the sign in front: the code tabs' format
 * (as on the PageRank page, which needs no sign). −0.0004 prints as 0.000.
 */
export function round3(x: number): string {
  const k = Math.floor(Math.abs(x) * 1000 + 0.5);
  const sign = x < 0 && k > 0 ? '-' : '';
  return `${sign}${Math.floor(k / 1000)}.${String(k % 1000).padStart(3, '0')}`;
}

/**
 * At most two decimals, short enough for a matrix cell: 1.80 → 1.8, 0.83 → .83, 2.00 → 2,
 * −0.37 → −.37 (a real minus sign), −∞ for minus infinity.
 */
export function short(x: number): string {
  if (x === -Infinity) return '−∞';
  if (x === Infinity) return '∞';
  const k = Math.round(Math.abs(x) * 100);
  if (k === 0) return '0';
  let s = (k / 100).toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  if (s.startsWith('0.')) s = s.slice(1);
  return x < 0 ? `−${s}` : s;
}

/** Two decimals for narration: 0.8266 → 0.83, −1.2 → −1.20. */
export const two = (x: number): string =>
  x === -Infinity
    ? '−∞'
    : `${x < 0 && Math.round(Math.abs(x) * 100) > 0 ? '−' : ''}${Math.abs(x).toFixed(2)}`;
