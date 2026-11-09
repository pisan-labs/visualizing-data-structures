import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { smallestText } from '../../render/text-size';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { parseNumber, sortedArray } from '.';
import { items, type SortedSettings, type SortedState } from './model';
import { view } from './view';

const settings = (s: Partial<SortedSettings> = {}): SortedSettings =>
  ({ ...sortedArray.defaults, ...s }) as SortedSettings;

const run = (st: SortedSettings, calls: OpCall[]) => new Timeline(sortedArray, st, 1, calls);
const lastStep = (t: ReturnType<typeof run>, k: number) => t.entries[k]!.steps.at(-1)!;
const inserts = (...values: number[]): OpCall[] => values.map((v) => ['insert', v]);

/** Binary search exactly as the page does it, counting comparisons the same way. */
function binary(a: number[], x: number) {
  let lo = 0;
  let hi = a.length - 1;
  let comparisons = 0;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    comparisons++;
    if (a[mid] === x) return { index: mid, comparisons };
    comparisons++;
    if (a[mid]! < x) lo = mid + 1;
    else hi = mid - 1;
  }
  return { index: -1, comparisons };
}

function bound(a: number[], x: number, upper: boolean) {
  let lo = 0;
  let hi = a.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (upper ? a[mid]! <= x : a[mid]! < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

describe('sorted vs unsorted array', () => {
  it('finds a value with binary search in 3 comparisons, and needs 7 when unsorted', () => {
    const calls: OpCall[] = [...inserts(10, 20, 30, 40, 50, 60, 70, 80, 90), ['search', 70]];
    const sorted = lastStep(run(settings(), calls), 9);
    expect(sorted.vars?.returned).toBe(6);
    expect(sorted.vars?.comparisons).toBe(3);
    const unsorted = lastStep(run(settings({ mode: 'unsorted' }), calls), 9);
    expect(unsorted.vars?.returned).toBe(6);
    expect(unsorted.vars?.comparisons).toBe(7);
  });

  // The "missing" example called search(55), 6 comparisons, the worst case; 95 takes 8.
  it('needs 6 comparisons to miss 55 among nine values, and at most 8 for any search', () => {
    const nine = inserts(10, 20, 30, 40, 50, 60, 70, 80, 90);
    const count = (x: number) => lastStep(run(settings(), [...nine, ['search', x]]), 9).vars;
    expect(count(55)?.comparisons).toBe(6);
    expect(count(95)?.comparisons).toBe(8);
    const most = Math.max(...Array.from({ length: 101 }, (_, x) => Number(count(x)?.comparisons)));
    expect(most).toBe(8);
  });

  it('links a miss that checks every item as the worst case of unsorted search', () => {
    const row = sortedArray.complexity!.find((r) => r.op === 'search(x), unsorted')!;
    const ex = sortedArray.examples.find((e) => e.id === row.worst.example)!;
    const n = ex.ops.filter(([op]) => op === 'insert').length;
    const end = (st: SortedSettings) => lastStep(run(st, ex.ops), ex.ops.length - 1).vars;
    const unsorted = end(ex.settings as SortedSettings);
    expect(unsorted?.returned).toBe(-1);
    expect(unsorted?.comparisons).toBe(n);
    // The notes say the same miss takes 6 comparisons when sorted.
    expect(end(settings({ mode: 'sorted' }))?.comparisons).toBe(6);
  });

  it('keeps order by shifting the bigger items', () => {
    const t = run(settings(), inserts(20, 40, 60, 80, 10, 90));
    expect(items(t.endState())).toEqual([10, 20, 40, 60, 80, 90]);
    expect(lastStep(t, 4).vars?.moves).toBe(4);
    expect(lastStep(t, 5).vars?.moves).toBe(0);
    expect(lastStep(t, 5).vars?.comparisons).toBe(1);
  });

  it('brackets duplicates with lower and upper bound, and refuses them unsorted', () => {
    const calls: OpCall[] = [
      ...inserts(10, 20, 20, 20, 30),
      ['lowerBound', 20],
      ['upperBound', 20],
      ['lowerBound', 99],
    ];
    const t = run(settings(), calls);
    expect([5, 6, 7].map((k) => lastStep(t, k).vars?.returned)).toEqual([1, 4, 5]);
    const u = run(settings({ mode: 'unsorted' }), calls);
    expect(lastStep(u, 5).lines).toEqual(['lowerBound.sorted']);
    expect(lastStep(u, 5).marks.some((m) => m.role === 'error')).toBe(true);
  });

  it('refuses values that are not whole numbers', () => {
    const t = run(settings(), [
      ['insert', 'cat'],
      ['search', 2.5],
    ]);
    expect(t.endState().size).toBe(0);
    expect(lastStep(t, 0).say).toContain('whole numbers');
    expect(lastStep(t, 1).say).toContain('cannot be compared');
  });

  it('matches reference arrays, with invariants on every step', () => {
    const value = fc.integer({ min: -5, max: 25 });
    const call = fc.oneof(
      { weight: 4, arbitrary: value.map((v) => ['insert', v] as OpCall) },
      value.map((v) => ['delete', v] as OpCall),
      { weight: 2, arbitrary: value.map((v) => ['search', v] as OpCall) },
      fc.constant(['min'] as OpCall),
      fc.constant(['max'] as OpCall),
      value.map((v) => ['lowerBound', v] as OpCall),
      value.map((v) => ['upperBound', v] as OpCall),
    );
    fc.assert(
      fc.property(
        fc.constantFrom('sorted' as const, 'unsorted' as const),
        fc.integer({ min: 2, max: 12 }),
        fc.array(call, { maxLength: 40 }),
        (mode, capacity, calls) => {
          const st = settings({ mode, capacity });
          const t = run(st, calls);
          const ref: number[] = [];
          calls.forEach(([op, a], k) => {
            const x = a as number;
            const last = lastStep(t, k);
            const ret = last.vars?.returned;
            if (op === 'insert') {
              if (ref.length === capacity) expect(last.lines).toEqual(['insert.full']);
              else if (mode === 'sorted') ref.splice(bound(ref, x, true), 0, x);
              else ref.push(x);
            } else if (op === 'search' || op === 'delete') {
              const found =
                mode === 'sorted'
                  ? binary(ref, x)
                  : { index: ref.indexOf(x), comparisons: ref.indexOf(x) + 1 || ref.length };
              if (op === 'search') expect(ret).toBe(found.index);
              expect(last.vars?.comparisons).toBe(found.comparisons);
              if (op === 'delete') {
                if (found.index < 0) expect(last.lines).toEqual(['delete.missing']);
                else {
                  expect(last.vars?.moves).toBe(ref.length - 1 - found.index);
                  ref.splice(found.index, 1);
                }
              }
            } else if (op === 'min' || op === 'max') {
              if (ref.length === 0) expect(last.lines).toEqual([`${op}.empty`]);
              else expect(ret).toBe(op === 'min' ? Math.min(...ref) : Math.max(...ref));
              expect(last.vars?.comparisons).toBe(
                mode === 'sorted' || ref.length === 0 ? 0 : ref.length - 1,
              );
            } else if (mode === 'unsorted') {
              expect(last.lines).toEqual([`${op}.sorted`]);
            } else {
              expect(ret).toBe(bound(ref, x, op === 'upperBound'));
            }
            expect(items(t.entries[k]!.end)).toEqual(ref);
          });
          for (let i = 0; i < t.length; i++) {
            const { step } = t.at(i);
            const s: SortedState = step.state;
            expect(s.size).toBeGreaterThanOrEqual(0);
            expect(s.size).toBeLessThanOrEqual(capacity);
            expect(s.slots).toHaveLength(capacity);
            const live = step.extra?.live ?? s.size;
            for (let k = 0; k < live; k++) expect(s.slots[k]).not.toBeNull();
            expect(step.vars?.size).toBe(s.size);
            expect(Number(step.vars?.comparisons)).toBeGreaterThanOrEqual(0);
            const range = step.extra?.range;
            if (range) expect(range[0]).toBeGreaterThanOrEqual(0);
            const scene = view(step, st);
            expect(scene.shapes.filter((sh) => sh.id.startsWith('cell-'))).toHaveLength(capacity);
          }
          if (mode === 'sorted')
            for (const e of t.entries) {
              const a = items(e.end);
              expect(a).toEqual([...a].sort((p, q) => p - q));
            }
        },
      ),
      { numRuns: 300 },
    );
  });

  it('asks the code tabs only what a sorted array can answer when the page is unsorted', () => {
    const calls: OpCall[] = [...inserts(5, 3), ['search', 3], ['lowerBound', 4], ['min']];
    const plain = sortedArray.code!.script(calls, settings());
    expect(plain.input).toEqual([
      'new 10',
      'insert 5',
      'insert 3',
      'search 3',
      'lowerBound 4',
      'min',
    ]);
    expect(plain.expected).toEqual(['ok', 'ok', '0', '1', '3']);
    const unsorted = sortedArray.code!.script(calls, settings({ mode: 'unsorted' }));
    expect(unsorted.input).toEqual(['new 10', 'insert 5', 'insert 3', 'contains 3', 'min']);
    expect(unsorted.expected).toEqual(['ok', 'ok', 'true', '3']);
  });

  it('parses whole numbers only', () => {
    expect(parseNumber('42')).toBe(42);
    expect(parseNumber('-7')).toBe(-7);
    expect(parseNumber('2.5')).toBeInstanceOf(Error);
    expect(parseNumber('cat')).toBeInstanceOf(Error);
    expect(parseNumber('1000')).toBeInstanceOf(Error);
  });
});

describe('drawn text size', () => {
  // Labels were 14 and 15 units (8.6 px on a phone): now 16.
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(sortedArray, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(sortedArray, PHONE_STAGE).px).toBeGreaterThanOrEqual(9.5);
  });
});
