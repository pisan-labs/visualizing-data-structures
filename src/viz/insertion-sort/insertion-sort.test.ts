import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import { checkSort, counters, inversions, repeatsArb, valuesArb } from '../_sorting/check';
import { insertionSort } from '.';
import type { InsertionSettings } from './model';

const settings = (s: Partial<InsertionSettings> = {}): InsertionSettings =>
  ({ ...insertionSort.defaults, ...s }) as InsertionSettings;

describe('insertion sort', () => {
  it('sorts like the built-in sort, keeps every value and is stable', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('shift' as const, 'swap' as const),
        fc.constantFrom('bars' as const, 'cells' as const),
        fc.oneof(valuesArb(), repeatsArb),
        (move, draw, values) => {
          const c = counters(
            checkSort(insertionSort, settings({ move, draw }), values, { stable: true }),
          );
          const n = values.length;
          // One shift (or swap) per out-of-order pair, and at most one extra comparison per value.
          const moved = move === 'shift' ? c.shifts : c.swaps;
          expect(moved).toBe(inversions(values));
          expect(c.comparisons).toBeGreaterThanOrEqual(inversions(values));
          expect(c.comparisons).toBeLessThanOrEqual(inversions(values) + n - 1);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('makes the same comparisons whether it shifts or swaps', () => {
    fc.assert(
      fc.property(valuesArb(), (values) => {
        const shift = counters(checkSort(insertionSort, settings({ move: 'shift' }), values));
        const swap = counters(checkSort(insertionSort, settings({ move: 'swap' }), values));
        expect(shift.comparisons).toBe(swap.comparisons);
      }),
      { numRuns: 100 },
    );
  });

  it('holds the key outside the array, leaving exactly one gap behind', () => {
    const t = new Timeline(insertionSort, settings(), 1, [
      ['load', '47 15 63 28 90 36 71'],
      ['sort'],
    ]);
    for (const step of t.entries[1]!.steps) {
      const gaps = step.state.a.filter((x) => x.stale).length;
      expect(gaps).toBe(step.extra?.held ? 1 : 0);
      if (step.extra?.held) {
        // The key hovers over the gap.
        expect(step.state.a[step.extra.held.at]!.stale).toBe(true);
      }
    }
  });

  it('takes n - 1 comparisons on sorted input and n(n - 1)/2 on reverse input', () => {
    const sorted = counters(checkSort(insertionSort, settings(), [14, 26, 38, 41, 57, 69, 72, 85]));
    expect(sorted).toMatchObject({ comparisons: 7, shifts: 0 });
    const reverse = counters(
      checkSort(insertionSort, settings(), [80, 70, 60, 50, 40, 30, 20, 10]),
    );
    expect(reverse).toMatchObject({ comparisons: 28, shifts: 28 });
    const nearly = counters(checkSort(insertionSort, settings(), [12, 25, 18, 37, 44, 41, 59, 66]));
    expect(nearly.shifts).toBe(2);
  });

  it('drops each key as a milestone and compares at level 3', () => {
    const t = new Timeline(insertionSort, settings(), 1, [['load', '5 3 8 1'], ['sort']]);
    const steps = t.entries[1]!.steps;
    expect(steps.filter((s) => s.lines.includes('drop'))).toHaveLength(3);
    expect(steps.filter((s) => s.lines.includes('drop')).every((s) => s.level === 1)).toBe(true);
    expect(steps.filter((s) => s.say.startsWith('Is ')).every((s) => s.level === 3)).toBe(true);
  });

  it('follows the setting in its pseudocode', () => {
    const text = (s: Partial<InsertionSettings>) =>
      insertionSort.pseudocode(settings(s))[0]!.lines.map((l) => l.text);
    expect(text({})).toContain('A[j + 1] = key');
    expect(text({ move: 'swap' })).toContain('swap A[j - 1] and A[j]');
  });
});
