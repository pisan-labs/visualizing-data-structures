import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { checkSort, counters, repeatsArb, valuesArb } from '../_sorting/check';
import { timsort } from '.';
import type { TimSettings } from './model';

const settings = (s: Partial<TimSettings> = {}): TimSettings =>
  ({ ...timsort.defaults, ...s }) as TimSettings;

/** The runs Timsort pushes and how many merges it makes, written plainly (no galloping). */
function reference(vs: number[], minrun: number) {
  const a = [...vs];
  const n = a.length;
  const pushed: number[] = [];
  const stack: number[] = [];
  let merges = 0;
  const merge = (i: number) => {
    stack.splice(i, 2, stack[i]! + stack[i + 1]!);
    merges++;
  };
  let lo = 0;
  while (lo < n) {
    let end = lo + 1;
    if (end < n) {
      if (a[end]! < a[lo]!) while (end + 1 < n && a[end + 1]! < a[end]!) end++;
      else while (end + 1 < n && a[end + 1]! >= a[end]!) end++;
      end++;
    }
    let len = end - lo;
    if (len < minrun && end < n) len = Math.min(minrun, n - lo);
    // The values themselves do not matter for the shape from here on.
    a.splice(lo, len, ...a.slice(lo, lo + len).sort((x, y) => x - y));
    pushed.push(len);
    stack.push(len);
    lo += len;
    while (stack.length > 1) {
      let m = stack.length - 2;
      if (
        (m > 0 && stack[m - 1]! <= stack[m]! + stack[m + 1]!) ||
        (m > 1 && stack[m - 2]! <= stack[m - 1]! + stack[m]!)
      ) {
        if (stack[m - 1]! < stack[m + 1]!) m--;
      } else if (stack[m]! > stack[m + 1]!) break;
      merge(m);
    }
  }
  while (stack.length > 1) {
    let m = stack.length - 2;
    if (m > 0 && stack[m - 1]! < stack[m + 1]!) m--;
    merge(m);
  }
  return { pushed, merges };
}

const settingsArb = fc.record({
  minrun: fc.integer({ min: 2, max: 8 }),
  gallop: fc.boolean(),
  draw: fc.constantFrom('bars' as const, 'cells' as const),
});

describe('timsort', { timeout: 60_000 }, () => {
  it('sorts stably, pushes the same runs and makes the same merges as the plain version', () => {
    fc.assert(
      fc.property(settingsArb, fc.oneof(valuesArb(), repeatsArb), (st, values) => {
        const steps = checkSort(timsort, st, values, { stable: true });
        if (values.length < 2) return;
        const ref = reference(values, st.minrun);
        const pushes = steps
          .filter((s) => s.lines.includes('push'))
          .map((s) => Number(/\((\d+)\) on the stack/.exec(s.say)![1]));
        expect(pushes).toEqual(ref.pushed);
        expect(steps.at(-1)!.vars?.merges).toBe(ref.merges);
        // Whenever the stack is declared in order, the invariants hold.
        for (const s of steps) {
          if (!s.lines.includes('cstop')) continue;
          const lens = String(s.vars?.stack).split(', ').map(Number);
          for (let i = 0; i + 1 < lens.length; i++) expect(lens[i]).toBeGreaterThan(lens[i + 1]!);
          for (let i = 0; i + 2 < lens.length; i++)
            expect(lens[i]).toBeGreaterThan(lens[i + 1]! + lens[i + 2]!);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('galloping never costs more writes', () => {
    fc.assert(
      fc.property(valuesArb(2), (values) => {
        const on = counters(checkSort(timsort, settings({ gallop: true }), values));
        const off = counters(checkSort(timsort, settings({ gallop: false }), values));
        expect(on.writes).toBeLessThanOrEqual(off.writes!);
      }),
      { numRuns: 100 },
    );
  });

  it('matches the numbers on the concept page', () => {
    const sorted = [4, 9, 15, 22, 27, 33, 40, 46, 51, 58, 64, 71, 77, 85, 92];
    expect(counters(checkSort(timsort, settings(), sorted))).toMatchObject({
      comparisons: 14,
      merges: 0,
    });
    const steps = checkSort(
      timsort,
      settings(),
      [12, 25, 38, 51, 47, 33, 19, 6, 22, 29, 41, 15, 60, 70],
    );
    expect(steps.some((s) => s.lines.includes('rev'))).toBe(true);
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(timsort, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(timsort, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
