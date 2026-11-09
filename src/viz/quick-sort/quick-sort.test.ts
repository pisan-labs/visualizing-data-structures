import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeRng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import { checkSort, counters, repeatsArb, valuesArb } from '../_sorting/check';
import type { PivotRule, Scheme } from '../_sorting/partition';
import { quickSort } from '.';
import type { QuickSettings } from './model';

const settings = (s: Partial<QuickSettings> = {}): QuickSettings =>
  ({ ...quickSort.defaults, ...s }) as QuickSettings;

const schemes = fc.constantFrom('lomuto' as const, 'hoare' as const);
const rules = fc.constantFrom(
  'last' as const,
  'first' as const,
  'middle' as const,
  'median3' as const,
  'random' as const,
);

/** Quicksort by hand, on (value, uid) pairs, counting comparisons. No random pivots. */
function reference(values: number[], scheme: Scheme, rule: Exclude<PivotRule, 'random'>) {
  const a = values.map((v, uid) => ({ v, uid }));
  let comparisons = 0;
  const swap = (i: number, j: number) => ([a[i], a[j]] = [a[j]!, a[i]!]);
  const choose = (p: number, r: number) => {
    const mid = Math.floor((p + r) / 2);
    if (rule === 'last') return r;
    if (rule === 'first') return p;
    if (rule === 'middle') return mid;
    return [p, mid, r].sort((x, y) => a[x]!.v - a[y]!.v || x - y)[1]!;
  };
  const sort = (p: number, r: number): void => {
    if (p >= r) return;
    if (scheme === 'lomuto') {
      swap(choose(p, r), r);
      const x = a[r]!.v;
      let i = p - 1;
      for (let j = p; j < r; j++) {
        comparisons++;
        if (a[j]!.v <= x) swap(++i, j);
      }
      swap(i + 1, r);
      sort(p, i);
      sort(i + 2, r);
    } else {
      swap(choose(p, r), p);
      const x = a[p]!.v;
      let i = p - 1;
      let j = r + 1;
      for (;;) {
        do comparisons++;
        while (a[--j]!.v > x);
        do comparisons++;
        while (a[++i]!.v < x);
        if (i < j) swap(i, j);
        else break;
      }
      sort(p, j);
      sort(j + 1, r);
    }
  };
  sort(0, a.length - 1);
  return { uids: a.map((x) => x.uid), comparisons };
}

// Property tests run thousands of steps; give them room on a busy machine.
describe('quicksort', { timeout: 60_000 }, () => {
  it('sorts like the built-in sort and keeps every value, with every scheme and pivot rule', () => {
    fc.assert(
      fc.property(schemes, rules, fc.oneof(valuesArb(), repeatsArb), (partition, pivot, values) => {
        checkSort(quickSort, settings({ partition, pivot }), values);
      }),
      { numRuns: 120 },
    );
  });

  it('moves values and compares exactly like a hand-written quicksort', () => {
    fc.assert(
      fc.property(
        schemes,
        fc.constantFrom('last' as const, 'first' as const, 'middle' as const, 'median3' as const),
        fc.oneof(valuesArb(), repeatsArb),
        (partition, pivot, values) => {
          const t = new Timeline(quickSort, settings({ partition, pivot }), 1, [
            ['load', values.join(' ')],
            ['sort'],
          ]);
          const first = t.entries[0]!.end.a[0]!.uid;
          const ref = reference(values, partition, pivot);
          expect(t.endState().a.map((x) => x.uid - first)).toEqual(ref.uids);
          expect(t.entries[1]!.steps.at(-1)!.vars?.comparisons ?? 0).toBe(ref.comparisons);
        },
      ),
      { numRuns: 120 },
    );
  });

  it('labels the partition parts truthfully on every step', () => {
    fc.assert(
      fc.property(schemes, rules, valuesArb(2), (partition, pivot, values) => {
        const t = new Timeline(quickSort, settings({ partition, pivot }), 3, [
          ['load', values.join(' ')],
          ['sort'],
        ]);
        for (const step of t.entries[1]!.steps) {
          const x = step.vars?.x;
          if (typeof x !== 'number') continue;
          for (const r of step.extra?.regions ?? []) {
            const vs = step.state.a.slice(r.from, r.to + 1).map((v) => v.value);
            if (r.id === 'low') expect(vs.every((v) => v <= x)).toBe(true);
            if (r.id === 'high')
              expect(vs.every((v) => (partition === 'lomuto' ? v > x : v >= x))).toBe(true);
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  it('goes n - 1 levels deep on sorted input with the last pivot, and stays shallow with median of three', () => {
    for (let n = 2; n <= 20; n++) {
      const sorted = Array.from({ length: n }, (_, i) => 4 * i + 3);
      const worst = counters(checkSort(quickSort, settings(), sorted));
      expect(worst.comparisons).toBe((n * (n - 1)) / 2);
      expect(worst.maxDepth).toBe(n - 1);
      const median = counters(checkSort(quickSort, settings({ pivot: 'median3' }), sorted));
      expect(median.maxDepth).toBeLessThanOrEqual(Math.ceil(Math.log2(n)) + 1);
    }
    const equal = counters(checkSort(quickSort, settings(), Array(8).fill(25)));
    expect(equal).toMatchObject({ comparisons: 28, maxDepth: 7 });
    const hoare = counters(
      checkSort(quickSort, settings({ partition: 'hoare' }), Array(8).fill(25)),
    );
    expect(hoare.maxDepth).toBeLessThanOrEqual(3);
  });

  it('matches the numbers in the examples', () => {
    const hoare = counters(
      checkSort(
        quickSort,
        settings({ partition: 'hoare', pivot: 'first' }),
        [50, 90, 10, 80, 20, 70, 30, 60],
      ),
    );
    const lomuto = counters(
      checkSort(quickSort, settings({ pivot: 'first' }), [50, 90, 10, 80, 20, 70, 30, 60]),
    );
    expect(hoare).toMatchObject({ swaps: 7, comparisons: 37 });
    expect(lomuto).toMatchObject({ swaps: 13, comparisons: 16 });
    const random = counters(
      checkSort(quickSort, settings({ pivot: 'random' }), [10, 20, 30, 40, 50, 60, 70, 80], {
        seed: 39,
      }),
    );
    expect(random).toMatchObject({ comparisons: 15, maxDepth: 4 });
  });

  // The concept page says a value swapped with itself is not counted, unlike selection sort.
  it('counts only swaps that move a value, so sorted input shows 0 swaps', () => {
    const sorted = [10, 20, 30, 40, 50, 60, 70, 80];
    expect(counters(checkSort(quickSort, settings(), sorted)).swaps).toBe(0);
    const hoare = settings({ partition: 'hoare', pivot: 'first' });
    expect(counters(checkSort(quickSort, hoare, sorted)).swaps).toBe(0);
    fc.assert(
      fc.property(schemes, rules, fc.oneof(valuesArb(), repeatsArb), (partition, pivot, values) => {
        const t = new Timeline(quickSort, settings({ partition, pivot }), 1, [
          ['load', values.join(' ')],
          ['sort'],
        ]);
        let order = t.entries[0]!.end.a.map((x) => x.uid).join();
        let swaps = 0;
        for (const st of t.entries[1]!.steps) {
          const now = st.state.a.map((x) => x.uid).join();
          const count = Number(st.vars?.swaps ?? swaps);
          if (count > swaps) expect(now).not.toBe(order);
          [order, swaps] = [now, count];
        }
      }),
      { numRuns: 60 },
    );
  });

  it('makes each finished partition a milestone and follows the settings in its pseudocode', () => {
    const t = new Timeline(quickSort, settings(), 1, [['load', '5 3 8 1'], ['sort']]);
    const parts = t.entries[1]!.steps.filter((s) => s.say.startsWith('Partition done'));
    expect(parts.length).toBeGreaterThan(0);
    expect(parts.every((s) => s.level === 1)).toBe(true);
    const text = (s: Partial<QuickSettings>) =>
      quickSort.pseudocode(settings(s))[0]!.lines.map((l) => l.text);
    expect(text({})).toContain('swap A[i + 1] and A[r]');
    expect(text({})).not.toContain('swap A[r] and A[p]');
    expect(text({ pivot: 'first' })).toContain('swap A[r] and A[p]');
    expect(text({ partition: 'hoare' })).toContain('repeat j = j - 1 until A[j] <= x');
    expect(text({ partition: 'hoare' })).toContain('quicksort(A, p, q)');
  });

  it('names a one-slot left part A[0], not A[0..0], in the practice explanation', () => {
    const kind = quickSort.practice!.find((k) => k.id === 'after-partition')!;
    let one = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const q = kind.make(makeRng(seed));
      expect(q.explain).not.toContain('A[0..0]');
      if (q.explain.includes('end up in A[0],')) one++;
    }
    expect(one).toBeGreaterThan(0);
  });
});
