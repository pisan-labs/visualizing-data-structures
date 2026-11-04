import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import { checkSort, counters, repeatsArb, valuesArb } from '../_sorting/check';
import { selectionSort } from '.';
import type { SelectionSettings } from './model';

const settings = (s: Partial<SelectionSettings> = {}): SelectionSettings =>
  ({ ...selectionSort.defaults, ...s }) as SelectionSettings;

const variants = fc.record({
  select: fc.constantFrom('min' as const, 'max' as const),
  draw: fc.constantFrom('bars' as const, 'cells' as const),
});

/** Selection sort by hand, tracking uids, to know which runs keep equal values in order. */
function reference(values: number[], useMin: boolean): number[] {
  const a = values.map((v, uid) => ({ v, uid }));
  const n = a.length;
  for (let pass = 0; pass < n - 1; pass++) {
    const slot = useMin ? pass : n - 1 - pass;
    let best = useMin ? pass : 0;
    const [from, to] = useMin ? [pass + 1, n - 1] : [1, slot];
    for (let j = from; j <= to; j++)
      if (useMin ? a[j]!.v < a[best]!.v : a[j]!.v > a[best]!.v) best = j;
    [a[slot], a[best]] = [a[best]!, a[slot]!];
  }
  return a.map((x) => x.uid);
}

// Property tests run thousands of steps; give them room on a busy machine.
describe('selection sort', { timeout: 60_000 }, () => {
  it('sorts like the built-in sort with n(n - 1)/2 comparisons and n - 1 swaps', () => {
    fc.assert(
      fc.property(variants, fc.oneof(valuesArb(), repeatsArb), (st, values) => {
        const c = counters(checkSort(selectionSort, st, values));
        const n = values.length;
        expect(c.comparisons).toBe((n * (n - 1)) / 2);
        expect(c.swaps).toBe(Math.max(0, n - 1));
      }),
      { numRuns: 120 },
    );
  });

  it('moves values exactly like a hand-written selection sort, and says when it was not stable', () => {
    fc.assert(
      fc.property(variants, repeatsArb, (st, values) => {
        const t = new Timeline(selectionSort, st, 1, [['load', values.join(' ')], ['sort']]);
        const firstUid = t.entries[0]!.end.a[0]!.uid;
        const uids = t.endState().a.map((x) => x.uid - firstUid);
        const ref = reference(values, st.select === 'min');
        expect(uids).toEqual(ref);
        const stable = values.every((v, i) =>
          values.every((w, j) => i >= j || v !== w || ref.indexOf(i) < ref.indexOf(j)),
        );
        const last = t.entries[1]!.steps.at(-1)!.say;
        expect(last.includes('was not stable')).toBe(!stable);
      }),
      { numRuns: 120 },
    );
  });

  it('changes the order of the two 27s in the curated example', () => {
    const t = new Timeline(selectionSort, settings({ draw: 'cells' }), 1, [
      ['load', '27 27 9 41 33'],
      ['sort'],
    ]);
    const [first, second] = t.entries[0]!.end.a;
    const end = t.endState().a.map((x) => x.uid);
    expect(end.indexOf(second!.uid)).toBeLessThan(end.indexOf(first!.uid));
    expect(t.entries[1]!.steps.some((s) => s.say.includes('not stable'))).toBe(true);
  });

  it('makes every swap a milestone and shows each comparison once', () => {
    const t = new Timeline(selectionSort, settings(), 1, [['load', '5 3 8 1'], ['sort']]);
    const steps = t.entries[1]!.steps;
    expect(steps.filter((s) => s.lines.includes('swap')).every((s) => s.level === 1)).toBe(true);
    const questions = steps.filter((s) => s.say.startsWith('Is '));
    expect(questions).toHaveLength(steps.at(-1)!.vars!.comparisons as number);
    expect(questions.every((s) => s.level === 2 || s.level === 3)).toBe(true);
  });

  it('follows the setting in its pseudocode', () => {
    const text = (s: Partial<SelectionSettings>) =>
      selectionSort.pseudocode(settings(s))[0]!.lines.map((l) => l.text);
    expect(text({})).toContain('swap A[i] and A[min]');
    expect(text({ select: 'max' })).toContain('swap A[last] and A[max]');
  });
});
