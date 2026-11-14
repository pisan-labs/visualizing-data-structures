/**
 * Bottom-up merge sort as a list of events, for the "sort everything" side of the heap pattern
 * pages: top-k sorts from largest to smallest, k-way-merge from smallest to largest.
 *
 * Two rows, A (0) and B (1). Pass 1 merges runs of 1 from A into B, pass 2 runs of 2 from B back
 * into A, and so on (no copying back), until one run covers everything. Each comparison of two
 * heads is one event; taking a head moves the value down (or up) to the other row, so a value is
 * always in exactly one place. When one run is used up, the rest of the other follows in one
 * event with no comparison. A run with no partner at the end of a pass moves over as it is.
 * Equal keys take the left run first, so the sort is stable.
 */
import type { HItem } from './heap';

export type SortOrder = 'asc' | 'desc';

export type Rows = [(HItem | null)[], (HItem | null)[]];

interface Base {
  /** The pass, from 1, and the run width it merges. */
  pass: number;
  width: number;
  /** Row the pass reads from (0 = A, 1 = B); it writes into the other. */
  from: 0 | 1;
  rows: Rows;
  comparisons: number;
}

export type MergeEvent =
  | (Base & { kind: 'pass' })
  | (Base & {
      kind: 'take';
      lo: number;
      mid: number;
      hi: number;
      /** The head taken, the head it beat, and where the taken one went. */
      taken: HItem;
      other: HItem;
      side: 'left' | 'right';
      dest: number;
    })
  | (Base & {
      kind: 'rest';
      lo: number;
      mid: number;
      hi: number;
      side: 'left' | 'right';
      moved: HItem[];
      dest: number;
    })
  | (Base & { kind: 'alone'; lo: number; hi: number; moved: HItem[] });

export interface MergeSortRun {
  events: MergeEvent[];
  /** The row the sorted values end in. */
  result: 0 | 1;
  sorted: HItem[];
  comparisons: number;
}

const copy = (rows: Rows): Rows => [[...rows[0]], [...rows[1]]];

export function mergeSort(items: readonly HItem[], order: SortOrder): MergeSortRun {
  const n = items.length;
  const rows: Rows = [[...items], Array<HItem | null>(n).fill(null)];
  const events: MergeEvent[] = [];
  let comparisons = 0;
  let from: 0 | 1 = 0;
  let pass = 0;
  // a goes first: smaller (asc) or larger (desc); on a tie, the left run's head.
  const first = (a: HItem, b: HItem) => (order === 'asc' ? a.key <= b.key : a.key >= b.key);
  for (let width = 1; width < n; width *= 2) {
    pass++;
    const to: 0 | 1 = from === 0 ? 1 : 0;
    const src = rows[from];
    const dst = rows[to];
    const base = () => ({ pass, width, from, rows: copy(rows), comparisons });
    events.push({ kind: 'pass', ...base() });
    for (let lo = 0; lo < n; lo += 2 * width) {
      const mid = Math.min(lo + width - 1, n - 1);
      const hi = Math.min(lo + 2 * width - 1, n - 1);
      if (mid >= hi) {
        const moved: HItem[] = [];
        for (let t = lo; t <= hi; t++) {
          dst[t] = src[t]!;
          src[t] = null;
          moved.push(dst[t]!);
        }
        events.push({ kind: 'alone', lo, hi, moved, ...base() });
        continue;
      }
      let i = lo;
      let j = mid + 1;
      let d = lo;
      while (i <= mid && j <= hi) {
        const a = src[i]!;
        const b = src[j]!;
        comparisons++;
        const left = first(a, b);
        const taken = left ? a : b;
        dst[d] = taken;
        if (left) src[i++] = null;
        else src[j++] = null;
        events.push({
          kind: 'take',
          lo,
          mid,
          hi,
          taken,
          other: left ? b : a,
          side: left ? 'left' : 'right',
          dest: d,
          ...base(),
        });
        d++;
      }
      const side = i <= mid ? 'left' : 'right';
      const [s, e] = i <= mid ? [i, mid] : [j, hi];
      const moved: HItem[] = [];
      const dest = d;
      for (let t = s; t <= e; t++) {
        dst[d++] = src[t]!;
        src[t] = null;
        moved.push(dst[d - 1]!);
      }
      if (moved.length) events.push({ kind: 'rest', lo, mid, hi, side, moved, dest, ...base() });
    }
    from = to;
  }
  return {
    events,
    result: from,
    sorted: rows[from].filter((x): x is HItem => x !== null),
    comparisons,
  };
}

/** The comparisons `mergeSort` makes, without recording its events (for large inputs). */
export function mergeSortComparisons(keys: readonly number[], order: SortOrder): number {
  const n = keys.length;
  let src = [...keys];
  let dst = Array<number>(n).fill(0);
  let c = 0;
  const first = (a: number, b: number) => (order === 'asc' ? a <= b : a >= b);
  for (let width = 1; width < n; width *= 2) {
    for (let lo = 0; lo < n; lo += 2 * width) {
      const mid = Math.min(lo + width - 1, n - 1);
      const hi = Math.min(lo + 2 * width - 1, n - 1);
      let i = lo;
      let j = mid + 1;
      let d = lo;
      while (i <= mid && j <= hi) {
        c++;
        dst[d++] = first(src[i]!, src[j]!) ? src[i++]! : src[j++]!;
      }
      while (i <= mid) dst[d++] = src[i++]!;
      while (j <= hi) dst[d++] = src[j++]!;
    }
    [src, dst] = [dst, src];
  }
  return c;
}
