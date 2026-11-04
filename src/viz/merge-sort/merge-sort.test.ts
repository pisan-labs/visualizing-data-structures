import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import { checkSort, counters, repeatsArb, valuesArb } from '../_sorting/check';
import { mergeSort, mostComparisons } from '.';
import type { MergeSettings } from './model';

const settings = (s: Partial<MergeSettings> = {}): MergeSettings =>
  ({ ...mergeSort.defaults, ...s }) as MergeSettings;

const lg = (n: number) => Math.ceil(Math.log2(n));
/** The most comparisons top-down merge sort can make on n values. */
const maxComparisons = (n: number) => (n < 2 ? 0 : n * lg(n) - 2 ** lg(n) + 1);

/** Writes into A by top-down merge sort: every merge writes its whole range. */
function topDownWrites(p: number, r: number): number {
  if (p >= r) return 0;
  const q = Math.floor((p + r) / 2);
  return topDownWrites(p, q) + topDownWrites(q + 1, r) + (r - p + 1);
}

// Property tests run thousands of steps; give them room on a busy machine.
describe('merge sort', { timeout: 60_000 }, () => {
  it('sorts like the built-in sort, keeps every value (in A, L and R) and is stable', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('topdown' as const, 'bottomup' as const),
        fc.constantFrom('bars' as const, 'cells' as const),
        fc.oneof(valuesArb(), repeatsArb),
        (style, draw, values) => {
          const c = counters(
            checkSort(mergeSort, settings({ style, draw }), values, { stable: true }),
          );
          const n = values.length;
          if (style === 'topdown') {
            expect(c.comparisons).toBeLessThanOrEqual(maxComparisons(n));
            expect(c.writes).toBe(topDownWrites(0, n - 1));
          } else {
            expect(c.comparisons).toBeLessThanOrEqual(n * lg(Math.max(n, 2)));
          }
        },
      ),
      { numRuns: 120 },
    );
  });

  it('keeps the call stack about log n deep and the merged part of A sorted', () => {
    fc.assert(
      fc.property(valuesArb(2), (values) => {
        const t = new Timeline(mergeSort, settings(), 1, [['load', values.join(' ')], ['sort']]);
        for (const step of t.entries[1]!.steps) {
          const calls = step.extra?.calls ?? [];
          expect(calls.length).toBeLessThanOrEqual(lg(values.length) + 1);
          // Each call's range sits inside its caller's.
          for (let d = 1; d < calls.length; d++) {
            expect(calls[d]!.from).toBeGreaterThanOrEqual(calls[d - 1]!.from);
            expect(calls[d]!.to).toBeLessThanOrEqual(calls[d - 1]!.to);
          }
          // While merging, A[p..k-1] already holds the smallest values in order.
          const aux = step.extra?.aux;
          const k = step.vars?.k;
          if (aux && typeof k === 'number') {
            const written = step.state.a.slice(aux.from, k).map((x) => x.value);
            expect(written).toEqual([...written].sort((x, y) => x - y));
            expect(step.state.a.slice(k, aux.to + 1).every((x) => x.stale)).toBe(true);
          }
        }
      }),
      { numRuns: 60 },
    );
  });

  it('reaches the most comparisons on interleaved input, and needs about half on sorted input', () => {
    for (let n = 1; n <= 20; n++) {
      const sorted = Array.from({ length: n }, (_, i) => 3 * i + 2);
      const worst = counters(checkSort(mergeSort, settings(), mostComparisons(sorted)));
      expect(worst.comparisons ?? 0).toBe(maxComparisons(n));
    }
    expect(
      counters(checkSort(mergeSort, settings(), [10, 20, 30, 40, 50, 60, 70, 80])),
    ).toMatchObject({
      comparisons: 12,
      writes: 24,
    });
    expect(mostComparisons([10, 20, 30, 40, 50, 60, 70, 80])).toEqual([
      10, 50, 30, 70, 20, 60, 40, 80,
    ]);
    // The concept check: reverse order needs as few comparisons as sorted input.
    const reverse = counters(checkSort(mergeSort, settings(), [80, 70, 60, 50, 40, 30, 20, 10]));
    expect(reverse).toMatchObject({ comparisons: 12, writes: 24 });
    const typical = counters(checkSort(mergeSort, settings(), [74, 52, 19, 8, 33, 61, 25, 47]));
    expect(typical.comparisons).toBe(16);
  });

  it('makes each finished merge a milestone (top-down) and each width a milestone (bottom-up)', () => {
    const run = (style: MergeSettings['style']) =>
      new Timeline(mergeSort, settings({ style }), 1, [
        ['load', '74 52 19 8 33 61 25 47'],
        ['sort'],
      ]).entries[1]!.steps;
    const top = run('topdown').filter((s) => s.level === 1);
    expect(top.filter((s) => / is sorted: /.test(s.say))).toHaveLength(7);
    const bottom = run('bottomup').filter((s) => s.level === 1);
    expect(bottom.map((s) => s.vars?.width).filter(Boolean)).toEqual([1, 2, 4]);
  });

  it('follows the setting in its pseudocode', () => {
    const text = (s: Partial<MergeSettings>) =>
      mergeSort.pseudocode(settings(s))[0]!.lines.map((l) => l.text);
    expect(text({})).toContain('mergeSort(A, q + 1, r)');
    expect(text({ style: 'bottomup' })).toContain('width = 2 * width');
    expect(text({ style: 'bottomup' })).toContain('if L[i] <= R[j]');
  });
});
