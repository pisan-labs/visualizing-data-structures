import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import { checkSort, counters, inversions, repeatsArb, valuesArb } from '../_sorting/check';
import { parseInput } from '../_sorting/kit';
import { bubbleSort } from '.';
import type { BubbleSettings } from './model';

const settings = (s: Partial<BubbleSettings> = {}): BubbleSettings =>
  ({ ...bubbleSort.defaults, ...s }) as BubbleSettings;

const variants = fc.record({
  direction: fc.constantFrom('down' as const, 'up' as const),
  earlyExit: fc.boolean(),
  lastSwap: fc.boolean(),
  draw: fc.constantFrom('bars' as const, 'cells' as const),
});

// Property tests run thousands of steps; give them room on a busy machine.
describe('bubble sort', { timeout: 60_000 }, () => {
  it('sorts like the built-in sort, keeps every value, and is stable, in every variant', () => {
    fc.assert(
      fc.property(variants, fc.oneof(valuesArb(), repeatsArb), (st, values) => {
        const steps = checkSort(bubbleSort, st, values, { stable: true });
        const c = counters(steps);
        const n = values.length;
        // Every swap fixes exactly one out-of-order pair.
        expect(c.swaps).toBe(inversions(values));
        if (!st.earlyExit && !st.lastSwap) expect(c.comparisons).toBe((n * (n - 1)) / 2);
        else expect(c.comparisons).toBeLessThanOrEqual((n * (n - 1)) / 2);
      }),
      { numRuns: 120 },
    );
  });

  it('takes one pass on sorted input with early exit, and all passes without it', () => {
    const sorted = [11, 23, 35, 47, 59, 71, 83];
    const early = counters(checkSort(bubbleSort, settings({ earlyExit: true }), sorted));
    const plain = counters(checkSort(bubbleSort, settings(), sorted));
    expect(early).toMatchObject({ comparisons: 6, swaps: 0 });
    expect(plain).toMatchObject({ comparisons: 21, swaps: 0 });
  });

  it('never compares more with the last-swap rule than with early exit alone', () => {
    fc.assert(
      fc.property(fc.constantFrom('down' as const, 'up' as const), valuesArb(), (direction, vs) => {
        const last = counters(checkSort(bubbleSort, settings({ direction, lastSwap: true }), vs));
        const early = counters(checkSort(bubbleSort, settings({ direction, earlyExit: true }), vs));
        expect(last.comparisons).toBeLessThanOrEqual(early.comparisons!);
      }),
      { numRuns: 80 },
    );
  });

  it('moves the smallest value to the front in the first CLRS pass', () => {
    const t = new Timeline(bubbleSort, settings(), 1, [['load', '29 64 51 18 73 4 36'], ['sort']]);
    const firstPass = t.entries[1]!.steps.find((s) => s.say.startsWith('End of pass 1'))!;
    expect(firstPass.state.a[0]!.value).toBe(4);
    const up = new Timeline(bubbleSort, settings({ direction: 'up' }), 1, [
      ['load', '29 64 51 18 73 4 36'],
      ['sort'],
    ]);
    const upPass = up.entries[1]!.steps.find((s) => s.say.startsWith('End of pass 1'))!;
    expect(upPass.state.a[6]!.value).toBe(73);
  });

  it('shows each comparison once, at level 2 or 3, and each pass end at level 1', () => {
    const t = new Timeline(bubbleSort, settings(), 1, [['load', '5 3 8 1'], ['sort']]);
    const steps = t.entries[1]!.steps;
    const compares = steps.filter((s) => s.say.startsWith('Compare'));
    expect(compares).toHaveLength(6);
    expect(compares.every((s) => s.level === 2 || s.level === 3)).toBe(true);
    // A pair that swaps is shown first (level 3); a pair already in order is one level-2 step.
    expect(compares.filter((s) => s.level === 3)).toHaveLength(steps.at(-1)!.vars!.swaps as number);
    expect(steps.filter((s) => s.say.startsWith('End of pass')).every((s) => s.level === 1)).toBe(
      true,
    );
  });

  it('follows the settings in its pseudocode', () => {
    const ids = (s: Partial<BubbleSettings>) =>
      bubbleSort.pseudocode(settings(s))[0]!.lines.map((l) => l.id);
    expect(ids({})).toEqual(['sig', 'outer', 'inner', 'cmp', 'swap']);
    expect(ids({ earlyExit: true })).toContain('exit');
    expect(ids({ lastSwap: true })).toContain('bound');
    const text = (s: Partial<BubbleSettings>) =>
      bubbleSort
        .pseudocode(settings(s))[0]!
        .lines.map((l) => l.text)
        .join('\n');
    expect(text({})).toContain('downto');
    expect(text({ direction: 'up' })).toContain('A[j] > A[j + 1]');
  });

  it('rejects bad input and keeps the array', () => {
    expect(parseInput('5 3 8 1')).toBe('5 3 8 1');
    expect(parseInput('5, 3,8')).toBe('5 3 8');
    expect(parseInput('7')).toBe(7);
    expect(parseInput('cat')).toBeInstanceOf(Error);
    expect(parseInput('100')).toBeInstanceOf(Error);
    expect(parseInput('-1')).toBeInstanceOf(Error);
    expect(parseInput(Array(21).fill('1').join(' '))).toBeInstanceOf(Error);
    const t = new Timeline(bubbleSort, settings(), 1, [['load', 'cat']]);
    expect(t.endState()).toBe(t.initial.state);
    expect(t.entries[0]!.steps[0]!.marks[0]!.role).toBe('error');
  });
});
