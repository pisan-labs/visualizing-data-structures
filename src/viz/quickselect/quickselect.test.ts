import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import { ascending, checkSortStep, counters, valuesArb } from '../_sorting/check';
import { parseInput } from '../_sorting/kit';
import { quickselect } from '.';
import { ordinal, type SelectSettings } from './model';

const settings = (s: Partial<SelectSettings> = {}): SelectSettings =>
  ({ ...quickselect.defaults, ...s }) as SelectSettings;

const select = (st: SelectSettings, values: number[], k: number, seed = 1) => {
  const t = new Timeline(quickselect, st, seed, [
    ['load', values.join(' ')],
    ['select', k],
  ]);
  return { t, steps: t.entries[1]!.steps };
};

// Property tests run thousands of steps; give them room on a busy machine.
describe('quickselect', { timeout: 60_000 }, () => {
  it('finds the k-th smallest like sorting would, with every scheme and pivot rule', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('lomuto' as const, 'hoare' as const),
        fc.constantFrom(
          'last' as const,
          'first' as const,
          'middle' as const,
          'median3' as const,
          'random' as const,
        ),
        valuesArb(),
        fc.nat(),
        fc.nat(1000),
        (partition, pivot, values, pick, seed) => {
          const k = (pick % values.length) + 1;
          const { t, steps } = select(settings({ partition, pivot }), values, k, seed);
          const ref = ascending(values);
          expect(steps.at(-1)!.vars?.result).toBe(ref[k - 1]);
          for (const step of steps) checkSortStep(step, values);
          // Everything left of the target is no bigger, everything right is no smaller.
          const a = t.endState().a.map((x) => x.value);
          expect(a[k - 1]).toBe(ref[k - 1]);
          for (let i = 0; i < a.length; i++) {
            if (i < k - 1) expect(a[i]!).toBeLessThanOrEqual(a[k - 1]!);
            if (i > k - 1) expect(a[i]!).toBeGreaterThanOrEqual(a[k - 1]!);
          }
          expect(ascending(a)).toEqual(ref);
        },
      ),
      { numRuns: 150 },
    );
  });

  it('never looks outside the range that still holds the target', () => {
    fc.assert(
      fc.property(valuesArb(2), fc.nat(), (values, pick) => {
        const k = (pick % values.length) + 1;
        const { steps } = select(settings(), values, k);
        for (const step of steps) {
          const calls = step.extra?.calls ?? [];
          const top = calls.at(-1);
          if (!top) continue;
          expect(top.from).toBeLessThanOrEqual(k - 1);
          expect(top.to).toBeGreaterThanOrEqual(k - 1);
          for (const m of step.marks) {
            if (m.role !== 'compare') continue;
            const i = step.state.a.findIndex((x) => `v${x.uid}` === m.id);
            expect(i).toBeGreaterThanOrEqual(top.from);
            expect(i).toBeLessThanOrEqual(top.to);
          }
        }
      }),
      { numRuns: 80 },
    );
  });

  it('rejects a k that is not a rank and leaves A alone', () => {
    for (const k of [0, 7, 'cat', '3 4'] as const) {
      const t = new Timeline(quickselect, settings(), 1, [['select', k]]);
      expect(t.endState()).toBe(t.initial.state);
      expect(t.entries[0]!.steps[0]!.marks[0]!.role).toBe('error');
    }
    expect(parseInput('3')).toBe(3);
  });

  it('matches the numbers in the examples', () => {
    const worst = select(settings({ pivot: 'last' }), [10, 20, 30, 40, 50, 60, 70, 80], 1).steps;
    expect(counters(worst).comparisons).toBe(28);
    const lucky = select(settings({ pivot: 'last' }), [42, 17, 63, 8, 35, 91, 24, 30], 4).steps;
    expect(counters(lucky).comparisons).toBe(7);
    expect(lucky.at(-1)!.vars?.result).toBe(30);
    const median = select(settings(), [38, 81, 22, 57, 13, 64, 49], 4, 7).steps;
    expect(counters(median).comparisons).toBe(11);
    expect(ordinal(1)).toBe('1st');
    expect(ordinal(12)).toBe('12th');
    expect(ordinal(23)).toBe('23rd');
  });

  it('follows the settings in its pseudocode', () => {
    const text = (s: Partial<SelectSettings>) =>
      quickselect.pseudocode(settings(s))[0]!.lines.map((l) => l.text);
    expect(text({})).toContain('if k - 1 == q: return A[q]');
    expect(text({})).toContain('swap A[r] and A[random(p, r)]');
    expect(text({ partition: 'hoare' })).toContain('if k - 1 <= q');
    expect(text({ partition: 'hoare' })).toContain('return quickselect(A, p, q, k)');
    expect(text({ pivot: 'last' })).not.toContain('swap A[r] and A[random(p, r)]');
  });
});
