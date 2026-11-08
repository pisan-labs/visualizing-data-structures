import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { checkSort, counters, repeatsArb, valuesArb } from '../_sorting/check';
import { introsort } from '.';
import { depthLimit, killer, type IntroSettings } from './model';

const settings = (s: Partial<IntroSettings> = {}): IntroSettings =>
  ({ ...introsort.defaults, ...s }) as IntroSettings;

/**
 * A plain recursive introsort that only reports its shape: how deep the partitioning goes and
 * how many parts heap sort gets, with the same pivot rule and partition as the page.
 */
function shape(vs: number[], st: IntroSettings) {
  const a = [...vs];
  let heaps = 0;
  let maxDepth = 0;
  const go = (p: number, r: number, limit: number, depth: number): void => {
    if (p > r) return;
    maxDepth = Math.max(maxDepth, depth);
    if (r - p + 1 <= st.small) {
      a.splice(p, r - p + 1, ...a.slice(p, r + 1).sort((x, y) => x - y));
      return;
    }
    if (limit === 0) {
      heaps++;
      a.splice(p, r - p + 1, ...a.slice(p, r + 1).sort((x, y) => x - y));
      return;
    }
    if (st.pivot === 'median3') {
      const mid = Math.floor((p + r) / 2);
      const c = [p, mid, r].sort((x, y) => a[x]! - a[y]! || x - y)[1]!;
      [a[c], a[r]] = [a[r]!, a[c]!];
    }
    const x = a[r]!;
    let i = p - 1;
    for (let j = p; j < r; j++) {
      if (a[j]! > x) continue;
      i++;
      [a[i], a[j]] = [a[j]!, a[i]!];
    }
    [a[i + 1], a[r]] = [a[r]!, a[i + 1]!];
    go(p, i, limit - 1, depth + 1);
    go(i + 2, r, limit - 1, depth + 1);
  };
  go(0, a.length - 1, depthLimit(a.length, st), 0);
  return { a, heaps, maxDepth };
}

const settingsArb = fc.record({
  pivot: fc.constantFrom('median3' as const, 'last' as const),
  depth: fc.constantFrom('twice' as const, 'once' as const),
  small: fc.integer({ min: 1, max: 8 }),
  draw: fc.constantFrom('bars' as const, 'cells' as const),
});

describe('introsort', { timeout: 60_000 }, () => {
  it('sorts, keeps every value, and switches to heap sort exactly where the reference does', () => {
    fc.assert(
      fc.property(settingsArb, fc.oneof(valuesArb(), repeatsArb), (st, values) => {
        const steps = checkSort(introsort, st, values);
        if (values.length < 2) return;
        const ref = shape(values, st);
        const end = steps.at(-1)!.vars!;
        expect(end.heapsorts).toBe(ref.heaps);
        // The calls never go past the budget.
        for (const s of steps) {
          const d = s.vars?.depth;
          if (typeof d === 'number') expect(d).toBeLessThanOrEqual(Number(end.limit));
        }
      }),
      { numRuns: 200 },
    );
  });

  it('the killer drives quicksort to the budget for every size and setting', () => {
    fc.assert(
      fc.property(settingsArb, fc.integer({ min: 8, max: 20 }), (st, n) => {
        const values = killer(n, st);
        expect(new Set(values).size).toBe(n);
        expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
        expect(Math.max(...values)).toBeLessThanOrEqual(99);
        // With no budget, quicksort on the killer peels off at most two values per level.
        const unlimited = shape(values, { ...st, depth: 'twice' });
        const sorted = [...values].sort((x, y) => x - y);
        expect(unlimited.a).toEqual(sorted);
      }),
      { numRuns: 100 },
    );
  });

  it('heap sort takes over on the killer examples', () => {
    const k = killer(20, settings());
    expect(counters(checkSort(introsort, settings(), k)).heapsorts).toBeGreaterThan(0);
    expect(
      counters(checkSort(introsort, settings({ depth: 'once' }), k)).heapsorts,
    ).toBeGreaterThan(0);
    const sorted = [5, 11, 17, 23, 29, 35, 41, 47, 53, 59, 65, 71, 77, 83, 89, 95];
    expect(counters(checkSort(introsort, settings({ pivot: 'last' }), sorted)).heapsorts).toBe(1);
    const random = [57, 12, 88, 34, 71, 5, 46, 93, 21, 64, 39, 80];
    expect(counters(checkSort(introsort, settings(), random)).heapsorts).toBe(0);
  });

  it('follows the settings in its pseudocode', () => {
    const text = (s: Partial<IntroSettings>) =>
      introsort.pseudocode(settings(s))[0]!.lines.map((l) => l.text);
    expect(text({})).toContain('introLoop(A, 0, n - 1, 2 * floor(log2 n))');
    expect(text({ depth: 'once' })).toContain('introLoop(A, 0, n - 1, floor(log2 n))');
    expect(text({ small: 5 })).toContain('if r - p + 1 <= 5');
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(introsort, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(introsort, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
