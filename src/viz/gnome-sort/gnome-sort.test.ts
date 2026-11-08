import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { checkSort, counters, inversions, repeatsArb, valuesArb } from '../_sorting/check';
import { gnomeSort } from '.';
import { insertionCost, type GnomeSettings } from './model';

const settings = (s: Partial<GnomeSettings> = {}): GnomeSettings =>
  ({ ...gnomeSort.defaults, ...s }) as GnomeSettings;

/** The textbook loop, counting the work. */
function reference(vs: number[], jump: boolean) {
  const a = [...vs];
  let pos = 0;
  let far = 0;
  let comparisons = 0;
  let swaps = 0;
  while (pos < a.length) {
    if (pos > 0) comparisons++;
    if (pos === 0 || a[pos - 1]! <= a[pos]!) {
      if (jump) pos = ++far;
      else pos++;
    } else {
      [a[pos - 1], a[pos]] = [a[pos]!, a[pos - 1]!];
      swaps++;
      pos--;
    }
  }
  return { a, comparisons, swaps };
}

describe('gnome sort', { timeout: 60_000 }, () => {
  it('sorts like the plain loop, keeps every value and is stable, with and without jumps', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.constantFrom('bars' as const, 'cells' as const),
        fc.oneof(valuesArb(), repeatsArb),
        (jump, draw, values) => {
          const steps = checkSort(gnomeSort, settings({ jump, draw }), values, { stable: true });
          const c = counters(steps);
          const ref = reference(values, jump);
          if (values.length < 2) return;
          expect(c.comparisons).toBe(ref.comparisons);
          expect(c.swaps).toBe(ref.swaps);
          // One swap per inversion, as insertion sort.
          expect(c.swaps).toBe(inversions(values));
          if (jump) expect(c.comparisons).toBe(insertionCost(values).comparisons);
          // Everything left of pos is sorted at every step.
          for (const s of steps) {
            const pos = s.vars?.pos;
            if (typeof pos !== 'number') continue;
            const left = s.state.a.slice(0, pos).map((x) => x.value);
            expect(left).toEqual([...left].sort((p, q) => p - q));
          }
        },
      ),
      { numRuns: 150 },
    );
  });

  it('matches the numbers on the concept page', () => {
    const run = (s: Partial<GnomeSettings>, vs: number[]) =>
      counters(checkSort(gnomeSort, settings(s), vs));
    expect(run({}, [20, 30, 40, 50, 60, 5])).toMatchObject({ comparisons: 14, swaps: 5 });
    expect(run({ jump: true }, [20, 30, 40, 50, 60, 5])).toMatchObject({
      comparisons: 9,
      swaps: 5,
    });
    expect(run({}, [11, 23, 35, 47, 59, 71, 83])).toMatchObject({ comparisons: 6, swaps: 0 });
    expect(run({}, [60, 50, 40, 30, 20, 10])).toMatchObject({ swaps: 15 });
  });

  it('says so when the gnome jumps back past the end', () => {
    // [20 30 40 50 60 5] with jumps: after carrying 5 home, pos = 0 jumps to far = 6 = n.
    const steps = checkSort(gnomeSort, settings({ jump: true }), [20, 30, 40, 50, 60, 5]);
    const last = steps.filter((s) => s.lines.includes('fwd')).at(-1)!;
    expect(last.say).toContain('Jump back');
    expect(last.say).toContain('= n');
  });

  it('follows the setting in its pseudocode', () => {
    const text = (s: Partial<GnomeSettings>) =>
      gnomeSort.pseudocode(settings(s))[0]!.lines.map((l) => l.text);
    expect(text({})).toContain('pos = pos + 1');
    expect(text({ jump: true })).toContain('pos = far');
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(gnomeSort, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(gnomeSort, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
