import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import { checkSortStep, counters, valuesArb } from '../_sorting/check';
import { MAX_VALUE } from '../_sorting/kit';
import { linearSearch } from '.';
import type { LinearSettings } from './model';

const settings = (s: Partial<LinearSettings> = {}): LinearSettings =>
  ({ ...linearSearch.defaults, ...s }) as LinearSettings;

const search = (st: LinearSettings, values: number[], x: number) =>
  new Timeline(linearSearch, st, 1, [
    ['load', values.join(' ')],
    ['search', x],
  ]);

// Property tests run thousands of steps; give them room on a busy machine.
describe('linear search', { timeout: 60_000 }, () => {
  it('returns the first index of x, or -1, like indexOf, with and without a sentinel', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        valuesArb(),
        fc.oneof(fc.nat(19), fc.integer({ min: 0, max: MAX_VALUE })),
        (sentinel, values, pick) => {
          // Half the time look for a value that is there.
          const x = pick < values.length && pick % 2 === 0 ? values[pick]! : pick;
          const t = search(settings({ sentinel }), values, x);
          const steps = t.entries[1]!.steps;
          const want = values.indexOf(x);
          const c = counters(steps);
          expect(steps.at(-1)!.vars?.result).toBe(want);
          // The search never changes A.
          expect(t.endState()).toEqual(t.entries[0]!.end);
          for (const step of steps) checkSortStep(step, values);
          const n = values.length;
          if (sentinel) {
            expect(c.comparisons).toBe(want >= 0 ? want + 1 : n + 1);
            expect(c.indexChecks).toBe(1);
          } else {
            expect(c.comparisons).toBe(want >= 0 ? want + 1 : n);
            expect(c.indexChecks).toBe(want >= 0 ? want + 1 : n + 1);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('keeps x over the slot it is checking and fades the slots already checked', () => {
    const t = search(settings(), [42, 17, 63, 8, 35, 24], 35);
    for (const step of t.entries[1]!.steps) {
      const i = step.vars?.i as number;
      expect(step.extra?.held?.at).toBe(i);
      expect(step.extra?.faded ?? []).toEqual(i > 0 ? [{ from: 0, to: i - 1 }] : []);
    }
  });

  it('matches the numbers in the examples and rejects a list as the target', () => {
    const miss = counters(search(settings(), [42, 17, 63, 8, 35, 24], 50).entries[1]!.steps);
    expect(miss).toMatchObject({ comparisons: 6, indexChecks: 7 });
    const guarded = counters(
      search(settings({ sentinel: true }), [42, 17, 63, 8, 35, 24], 50).entries[1]!.steps,
    );
    expect(guarded).toMatchObject({ comparisons: 7, indexChecks: 1 });
    const t = new Timeline(linearSearch, settings(), 1, [['search', '5 6']]);
    expect(t.endState()).toBe(t.initial.state);
    expect(t.entries[0]!.steps[0]!.marks[0]!.role).toBe('error');
  });

  it('follows the setting in its pseudocode', () => {
    const text = (s: Partial<LinearSettings>) =>
      linearSearch.pseudocode(settings(s))[0]!.lines.map((l) => l.text);
    expect(text({})).toContain('for i = 0 to n - 1');
    expect(text({ sentinel: true })).toContain('A[n] = x');
    expect(text({ sentinel: true })).toContain('while A[i] != x');
  });
});
