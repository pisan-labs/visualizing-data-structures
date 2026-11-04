import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import { checkSort, counters, inversions, repeatsArb, valuesArb } from '../_sorting/check';
import { bubbleSort } from '../bubble-sort';
import type { BubbleSettings } from '../bubble-sort/model';
import { cocktailSort } from '.';
import type { CocktailSettings } from './model';

const settings = (s: Partial<CocktailSettings> = {}): CocktailSettings =>
  ({ ...cocktailSort.defaults, ...s }) as CocktailSettings;

const run = (st: CocktailSettings, values: string) =>
  counters(checkSort(cocktailSort, st, values.split(' ').map(Number)));

describe('cocktail shaker sort', () => {
  it('sorts like the built-in sort, keeps every value and is stable, in both variants', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('one' as const, 'last' as const),
        fc.constantFrom('bars' as const, 'cells' as const),
        fc.oneof(valuesArb(), repeatsArb),
        (shrink, draw, values) => {
          const c = counters(
            checkSort(cocktailSort, settings({ shrink, draw }), values, { stable: true }),
          );
          const n = values.length;
          expect(c.swaps).toBe(inversions(values));
          expect(c.comparisons).toBeLessThanOrEqual((n * (n - 1)) / 2);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('never compares more when it shrinks to the last swap', () => {
    fc.assert(
      fc.property(valuesArb(), (values) => {
        const one = counters(checkSort(cocktailSort, settings({ shrink: 'one' }), values));
        const last = counters(checkSort(cocktailSort, settings({ shrink: 'last' }), values));
        expect(last.comparisons).toBeLessThanOrEqual(one.comparisons!);
      }),
      { numRuns: 150 },
    );
  });

  it('moves a small value from the end in one backward pass', () => {
    expect(run(settings(), '20 30 40 50 60 70 80 10')).toMatchObject({
      comparisons: 18,
      swaps: 7,
    });
    const bubble = new Timeline(
      bubbleSort,
      { ...bubbleSort.defaults, direction: 'up', earlyExit: true } as BubbleSettings,
      1,
      [['load', '20 30 40 50 60 70 80 10'], ['sort']],
    );
    expect(bubble.entries[1]!.steps.at(-1)!.vars?.comparisons).toBe(28);
  });

  it('matches the numbers on the concept page', () => {
    expect(run(settings(), '14 26 38 41 57 69 72 85')).toMatchObject({ comparisons: 7, swaps: 0 });
    expect(run(settings(), '90 80 70 60 50 40 30 20 10')).toMatchObject({
      comparisons: 36,
      swaps: 36,
    });
    const middle = '11 19 27 52 38 45 33 60 74 86';
    expect(run(settings({ shrink: 'last' }), middle).comparisons).toBe(15);
    expect(run(settings({ shrink: 'one' }), middle).comparisons).toBe(24);
  });

  it('alternates direction, with each pass end as a milestone', () => {
    const t = new Timeline(cocktailSort, settings(), 1, [
      ['load', '37 82 15 64 9 51 26 73'],
      ['sort'],
    ]);
    const ends = t.entries[1]!.steps.filter((s) => s.say.startsWith('End of the'));
    expect(ends.map((s) => s.say.split(':')[0])).toEqual([
      'End of the forward pass',
      'End of the backward pass',
      'End of the forward pass',
      'End of the backward pass',
    ]);
    expect(ends.every((s) => s.level === 1)).toBe(true);
    const compares = t.entries[1]!.steps.filter((s) => s.say.startsWith('Compare'));
    expect(compares.every((s) => s.level === 3)).toBe(true);
  });

  it('follows the setting in its pseudocode', () => {
    const text = (s: Partial<CocktailSettings>) =>
      cocktailSort.pseudocode(settings(s))[0]!.lines.map((l) => l.text);
    expect(text({})).toContain('hi = hi - 1');
    expect(text({ shrink: 'last' })).toContain('hi = last');
  });
});
