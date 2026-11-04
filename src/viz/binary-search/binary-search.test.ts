import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { checkSortStep, counters, valuesArb } from '../_sorting/check';
import { MAX_VALUE, valuesOf, type ArrayStep } from '../_sorting/kit';
import { binarySearch } from '.';
import type { BinarySettings, Style, Variant } from './model';

const settings = (s: Partial<BinarySettings> = {}): BinarySettings =>
  ({ ...binarySearch.defaults, ...s }) as BinarySettings;

const timeline = (st: BinarySettings, calls: OpCall[]) => new Timeline(binarySearch, st, 1, calls);

const search = (st: BinarySettings, values: number[], x: number) =>
  timeline(st, [
    ['load', values.join(' ')],
    ['search', x],
  ]);

const VARIANTS: Variant[] = ['exact', 'first', 'lower', 'upper', 'insert'];
const STYLES: Style[] = ['iterative', 'recursive'];

const sortedArb = valuesArb().map((vs) => [...vs].sort((p, q) => p - q));
/** Few distinct values, so repeats are common. */
const repeatsArb = fc
  .array(fc.integer({ min: 1, max: 6 }), { minLength: 1, maxLength: 20 })
  .map((vs) => [...vs].sort((p, q) => p - q));
const targetArb = fc.integer({ min: 0, max: MAX_VALUE });

/** Is r a right answer for this variant? Checked against plain scans of a. */
function correct(variant: Variant, a: number[], x: number, r: number): boolean {
  const below = a.filter((v) => v < x).length;
  const atMost = a.filter((v) => v <= x).length;
  switch (variant) {
    case 'first':
      return r === a.indexOf(x);
    case 'lower':
      return r === below;
    case 'upper':
      return r === atMost;
    case 'exact':
      return a.includes(x) ? a[r] === x : r === -1;
    case 'insert':
      return a.includes(x) ? a[r] === x : r === -(below + 1);
  }
}

const result = (steps: ArrayStep[]) => steps.at(-1)!.vars?.result as number;
const mids = (steps: ArrayStep[]) =>
  steps.filter((s) => s.lines.includes('mid')).map((s) => s.vars?.mid as number);

// Property tests run many searches; give them room on a busy machine.
describe('binary search', { timeout: 60_000 }, () => {
  it('returns what a plain scan says, in every variant and style, in at most log n + 1 probes', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...VARIANTS),
        fc.constantFrom(...STYLES),
        fc.oneof(sortedArb, repeatsArb),
        targetArb,
        fc.nat(19),
        (variant, style, values, other, pick) => {
          // Half the time look for a value that is there.
          const x = pick % 2 === 0 ? values[pick % values.length]! : other % 8;
          const t = search(settings({ variant, style }), values, x);
          const steps = t.entries[1]!.steps;
          const r = result(steps);
          expect(correct(variant, values, x, r), `${variant} returned ${r}`).toBe(true);
          expect(counters(steps).probes).toBeLessThanOrEqual(
            Math.floor(Math.log2(values.length)) + 1,
          );
          // The search never changes A.
          expect(valuesOf(t.endState())).toEqual(values);
          for (const step of steps) checkSortStep(step, values);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('never loses the answer: it stays inside the window at every step', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...VARIANTS),
        repeatsArb,
        fc.integer({ min: 0, max: 7 }),
        (variant, values, x) => {
          const steps = search(settings({ variant }), values, x).entries[1]!.steps;
          const first = values.indexOf(x);
          const below = values.filter((v) => v < x).length;
          const atMost = values.filter((v) => v <= x).length;
          for (const step of steps) {
            const { lo, hi, r } = step.vars as { lo: number; hi: number; r?: number };
            if (variant === 'lower') expect(lo <= below && below <= hi).toBe(true);
            else if (variant === 'upper') expect(lo <= atMost && atMost <= hi).toBe(true);
            else if (variant === 'first') {
              if (first >= 0) expect((lo <= first && first <= hi) || r === first).toBe(true);
            } else if (first >= 0) {
              // Some copy of x is still in A[lo..hi].
              expect(values.slice(lo, hi + 1)).toContain(x);
            }
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it('probes the same values whether it loops or calls itself', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...VARIANTS),
        repeatsArb,
        fc.integer({ min: 0, max: 7 }),
        (variant, values, x) => {
          const loop = search(settings({ variant }), values, x).entries[1]!.steps;
          const calls = search(settings({ variant, style: 'recursive' }), values, x).entries[1]!
            .steps;
          expect(mids(calls)).toEqual(mids(loop));
          expect(result(calls)).toBe(result(loop));
        },
      ),
      { numRuns: 200 },
    );
  });

  it('narrates a miss all the way to an empty window', () => {
    const steps = search(settings(), [8, 12, 17, 24, 31, 35, 42, 50, 57, 63], 40).entries[1]!.steps;
    expect(steps.at(-2)!.say).toContain('hi = mid - 1 = 5, and the window is now empty');
    expect(steps.at(-1)!.say).toBe(
      'lo = 6 > hi = 5: the window is empty, so 40 is not in A. Return -1.',
    );
    expect(steps.at(-1)!.extra?.regions).toEqual([]);
  });

  it('refuses an unsorted A, says why, and sorts only when asked', () => {
    const t = timeline(settings(), [
      ['load', '42 17 63 8 35 24'],
      ['search', 35],
      ['sort'],
      ['search', 35],
      ['sort'],
    ]);
    const [loaded, refused, sorted, found, again] = t.entries;
    expect(loaded!.steps[0]!.say).toContain('A is not sorted: A[0] = 42 comes before A[1] = 17');
    expect(loaded!.steps[0]!.marks.map((m) => m.role)).toEqual(['error', 'error']);
    // The refusal is one step and leaves A as it was.
    expect(refused!.steps).toHaveLength(1);
    expect(refused!.steps[0]!.say).toContain('Press Sort A');
    expect(refused!.end).toBe(loaded!.end);
    expect(valuesOf(sorted!.end)).toEqual([8, 17, 24, 35, 42, 63]);
    // Values keep their identities, so they visibly move into place.
    expect(sorted!.end.a.map((x) => x.uid).sort()).toEqual(loaded!.end.a.map((x) => x.uid).sort());
    expect(result(found!.steps)).toBe(3);
    expect(again!.steps[0]!.say).toBe('A is already sorted, so there is nothing to do.');
  });

  it('keeps equal values in their order when it sorts', () => {
    const t = timeline(settings(), [['load', '5 3 5 1 3'], ['sort']]);
    const before = t.entries[0]!.end.a;
    const after = t.entries[1]!.end.a;
    const order = (items: typeof before, v: number) =>
      items.filter((x) => x.value === v).map((x) => x.uid);
    for (const v of [3, 5]) expect(order(after, v)).toEqual(order(before, v));
  });

  it('matches the numbers in the examples', () => {
    for (const ex of binarySearch.examples) {
      const t = new Timeline(binarySearch, settings(ex.settings), ex.seed, ex.ops);
      const steps = t.entries.at(-1)!.steps;
      const want: Record<string, [number, number]> = {
        found: [6, 4],
        'first-probe': [4, 1],
        'not-found': [-1, 4],
        duplicates: [3, 1],
        'first-occurrence': [1, 3],
        'lower-bound': [1, 4],
        'upper-bound': [6, 3],
        'insertion-point': [-7, 4],
        unsorted: [3, 3],
        recursive: [-1, 5],
      };
      expect([result(steps), counters(steps).probes], ex.id).toEqual(want[ex.id!]);
    }
    const deepest = Math.max(
      ...timeline(settings({ style: 'recursive' }), [
        ['load', '3 9 14 20 27 31 38 42 47 53 58 64 69 71 76 80 85 90 94 99'],
        ['search', 70],
      ])
        .entries[1]!.steps.map((s) => s.vars?.depth)
        .filter((d): d is number => typeof d === 'number'),
    );
    expect(deepest).toBe(5);
  });

  it('follows the settings in its pseudocode', () => {
    const text = (s: Partial<BinarySettings>) =>
      binarySearch.pseudocode(settings(s))[0]!.lines.map((l) => l.text);
    expect(text({})).toContain('while lo <= hi');
    expect(text({ variant: 'first' })).toContain('r = mid; hi = mid - 1');
    expect(text({ variant: 'lower' })).toEqual(
      expect.arrayContaining(['lo = 0; hi = n', 'hi = mid']),
    );
    expect(text({ variant: 'upper' })).toContain('if A[mid] > x');
    expect(text({ variant: 'insert' })).toContain('return -(lo + 1)');
    expect(text({ style: 'recursive' })).toContain('return search(A, x, mid + 1, hi)');
    expect(text({ style: 'recursive', variant: 'first' })).toContain(
      'r = first(A, x, lo, mid - 1)',
    );
  });
});
