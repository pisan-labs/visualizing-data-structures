import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { checkSort, counters, repeatsArb, valuesArb } from '../_sorting/check';
import { combSort } from '.';
import { bubbleCost, nextGap, type CombSettings, type Shrink } from './model';

const settings = (s: Partial<CombSettings> = {}): CombSettings =>
  ({ ...combSort.defaults, ...s }) as CombSettings;

/** The textbook loop, with the gap in whole numbers, counting the work. */
function reference(vs: number[], shrink: Shrink) {
  const a = [...vs];
  const den = { '1.3': [13, 10], '2': [2, 1], '1.1': [11, 10] }[shrink];
  let gap = a.length;
  let sorted = false;
  let comparisons = 0;
  let swaps = 0;
  let passes = 0;
  while (!sorted && a.length > 1) {
    gap = Math.floor((gap * den[1]!) / den[0]!);
    passes++;
    if (gap <= 1) {
      gap = 1;
      sorted = true;
    }
    for (let i = 0; i + gap < a.length; i++) {
      comparisons++;
      if (a[i]! > a[i + gap]!) {
        [a[i], a[i + gap]] = [a[i + gap]!, a[i]!];
        swaps++;
        sorted = false;
      }
    }
  }
  return { a, comparisons, swaps, passes };
}

describe('comb sort', { timeout: 60_000 }, () => {
  it('sorts like the plain loop, keeping every value, for every shrink factor', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<Shrink>('1.3', '2', '1.1'),
        fc.constantFrom('bars' as const, 'cells' as const),
        fc.oneof(valuesArb(), repeatsArb),
        (shrink, draw, values) => {
          const steps = checkSort(combSort, settings({ shrink, draw }), values);
          const c = counters(steps);
          const ref = reference(values, shrink);
          expect(c.comparisons).toBe(ref.comparisons);
          expect(c.swaps).toBe(ref.swaps);
          if (values.length > 1) expect(c.passes).toBe(ref.passes);
          // Gaps never grow, and a swap always joins values exactly gap apart.
          let last = Infinity;
          for (const s of steps) {
            const g = s.vars?.gap;
            if (typeof g === 'number') {
              expect(g).toBeLessThanOrEqual(last);
              last = g;
            }
            const ptrs = s.extra?.pointers ?? [];
            if (ptrs.length === 2) expect(ptrs[1]!.at - ptrs[0]!.at).toBe(g);
          }
        },
      ),
      { numRuns: 150 },
    );
  });

  it('computes the gap in whole numbers', () => {
    expect(nextGap(13, '1.3')).toBe(10);
    expect(nextGap(20, '1.3')).toBe(15);
    expect(nextGap(8, '2')).toBe(4);
    expect(nextGap(10, '1.1')).toBe(9);
  });

  it('beats bubble sort on a turtle, and matches the concept page', () => {
    const turtle = [12, 18, 24, 30, 36, 42, 48, 54, 60, 66, 72, 78, 84, 90, 3, 5];
    const c = counters(checkSort(combSort, settings(), turtle));
    expect(bubbleCost(turtle)).toMatchObject({ comparisons: 120, swaps: 28, passes: 15 });
    expect(c).toMatchObject({ comparisons: 90, swaps: 20, passes: 8 });
    const reverse = [90, 80, 70, 60, 50, 40, 30, 20, 10, 5];
    expect(counters(checkSort(combSort, settings(), reverse)).swaps).toBeLessThan(45);
  });

  it('is not stable', () => {
    const t = new Timeline(combSort, settings(), 1, [['load', '30 30 10 20'], ['sort']]);
    expect(t.entries[1]!.steps.at(-1)!.say).toContain('not stable');
  });

  it('follows the setting in its pseudocode', () => {
    const text = (s: Partial<CombSettings>) =>
      combSort.pseudocode(settings(s))[0]!.lines.map((l) => l.text);
    expect(text({})).toContain('gap = floor(gap / 1.3)');
    const evens = [10, 55, 15, 60, 20, 65, 25, 70, 30, 75, 35, 80, 40, 85, 45, 90];
    expect(counters(checkSort(combSort, settings({ shrink: '2' }), evens))).toMatchObject({
      comparisons: 154,
      passes: 11,
    });
    expect(counters(checkSort(combSort, settings(), evens))).toMatchObject({
      comparisons: 90,
      passes: 8,
    });
    expect(text({ shrink: '2' })).toContain('gap = floor(gap / 2)');
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(combSort, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(combSort, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
