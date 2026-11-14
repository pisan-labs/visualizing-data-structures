/**
 * Shared model code for the "DP patterns" pages of the Coding interviews pathway (dp-grid-paths,
 * dp-state-machine, dp-interval). This folder has no index.ts, so the registry does not treat it
 * as a page. The older dynamic-programming kit (../_dp/kit.ts) and the table layout
 * (src/layouts/table.ts) are reused by import, never edited.
 *
 * Every page here runs one recurrence two ways (src/viz/_patterns/kit.ts):
 * - the naive approach is plain recursion on the recurrence: nothing is stored, so a
 *   subproblem is solved again each time it is asked for. A call counter per cell of the table
 *   shows the repeats.
 * - the pattern is the table: each subproblem solved once, bottom-up (or top-down with a memo
 *   where the page offers it).
 *
 * Work units, the same keys in both approaches:
 * - `calls`: one call of the recursive function (plain or with a memo), O(1) besides its
 *   sub-calls;
 * - `cells`: one table cell written, O(1) besides the choices it tries.
 * Pages whose cells try many choices (dp-interval) add a third unit, `choices`.
 */
import { Work } from '../_patterns/kit';

export const DP_UNITS = ['calls', 'cells'] as const;

/** The work counters of a DP pattern page: calls and cells, and any more the page needs. */
export const dpWork = (...more: string[]): Work => new Work([...DP_UNITS, ...more]);

/** A number for narration and cells, with a true minus sign and ∞ for no way in. */
export function fmt(v: number): string {
  if (v === Infinity) return '∞';
  if (v === -Infinity) return '−∞';
  return v < 0 ? `−${-v}` : String(v);
}

/** "a + b", with a true minus for a negative b: "5 − 3". */
export const plus = (a: number, b: number): string =>
  b < 0 ? `${fmt(a)} − ${fmt(-b)}` : `${fmt(a)} + ${fmt(b)}`;

/** "1st", "2nd", "3rd", "4th", ... "11th", "12th", "13th", "21st". */
export function ordinal(k: number): string {
  const tens = k % 100;
  if (tens >= 11 && tens <= 13) return `${k}th`;
  const s = ['th', 'st', 'nd', 'rd'][k % 10] ?? 'th';
  return `${k}${s}`;
}

/** "the 3rd time" or "the first time". */
export const nthTime = (k: number): string => (k === 1 ? 'the first time' : `the ${ordinal(k)} time`);

/** "×3": how many calls a cell has had, for a corner label. */
export const callsLabel = (k: number): string => `×${k}`;

/** A grid of counters, all 0. */
export const zeros = (rows: number, cols: number): number[][] =>
  Array.from({ length: rows }, () => Array<number>(cols).fill(0));

export const copy2 = <T>(g: readonly (readonly T[])[]): T[][] => g.map((r) => [...r]);
