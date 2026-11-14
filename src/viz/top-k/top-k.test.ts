import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { topK as def } from '.';
import { heapCost, selectCost, sortCost, type Goal, type Method, type TopSettings } from './model';

/** The reference: sort a copy from largest down and read it. */
const reference = (a: number[], k: number) => [...a].sort((x, y) => y - x).slice(0, k);

const arrays = fc.array(fc.integer({ min: 0, max: 30 }), { minLength: 1, maxLength: 12 });
const methods = fc.constantFrom<Method>('pattern', 'naive', 'select');
const goals = fc.constantFrom<Goal>('top', 'kth');

function runTop(a: number[], k: number, settings: TopSettings) {
  const t = new Timeline(def, settings, 1, [
    ['load', a.join(' ')],
    ['top', k],
  ]);
  return t.entries[1]!.steps;
}

/** A min-heap array is in order: no child smaller than its parent. */
const inOrder = (h: number[]) => h.every((v, p) => p === 0 || h[Math.floor((p - 1) / 2)]! <= v);

describe('top-k', () => {
  it('finds the reference answer three ways, and keeps every step consistent', () => {
    fc.assert(
      fc.property(arrays, methods, goals, fc.nat(), (a, approach, goal, kr) => {
        const k = 1 + (kr % Math.min(a.length, 7));
        const steps = runTop(a, k, { approach, goal });
        const want = reference(a, k);
        const last = steps.at(-1)!;
        expect(last.vars?.answer).toEqual(goal === 'kth' ? want[k - 1] : want.join(' '));
        // The marked answer is the answer.
        const byUid = new Map(steps[0]!.state.a.map((x) => [x.uid, x.key]));
        const marked = (last.extra?.answer ?? []).map((u) => byUid.get(u)!).sort((x, y) => y - x);
        expect(marked).toEqual(goal === 'kth' ? [want[k - 1]] : want);
        // The counter ends at this way's total, and the totals match the cost functions.
        const own = { pattern: 'pattern total', naive: 'naive total', select: 'quickselect total' };
        expect(last.vars?.comparisons).toBe(last.vars?.[own[approach]]);
        expect(last.vars?.['pattern total']).toBe(heapCost(a, k));
        expect(last.vars?.['naive total']).toBe(sortCost(a));
        expect(last.vars?.['quickselect total']).toBe(selectCost(a, k));
        let before = 0;
        for (const step of steps) {
          const c = Number(step.vars?.comparisons ?? 0);
          expect(c).toBeGreaterThanOrEqual(before);
          before = c;
          const e = step.extra!;
          // A stays as it was: every way works on a copy.
          expect(step.state.a.map((x) => x.key)).toEqual(a);
          if (approach === 'pattern') {
            const h = e.heap!.map((x) => x.key);
            expect(h.length).toBeLessThanOrEqual(k);
            // Between sift steps the heap is in order once the step settles; the last is.
            if (step === last) expect(inOrder(h)).toBe(true);
            // Every value is in the heap, out, or not read yet: never two of these.
            const inHeap = new Set(e.heap!.map((x) => x.uid));
            for (const u of e.out ?? []) expect(inHeap.has(u)).toBe(false);
          } else if (approach === 'naive') {
            const vals = [...e.rows![0], ...e.rows![1]]
              .filter((x) => x !== null)
              .map((x) => x!.key);
            expect(vals.sort()).toEqual([...a].sort());
          } else {
            expect(e.work!.map((x) => x.key).sort()).toEqual([...a].sort());
          }
        }
      }),
      { numRuns: 300 },
    );
  });

  it('keeps the heap of the best k so far at the end of each value', () => {
    fc.assert(
      fc.property(arrays, fc.nat(), (a, kr) => {
        const k = 1 + (kr % Math.min(a.length, 7));
        const steps = runTop(a, k, { approach: 'pattern', goal: 'top' });
        for (let i = 0; i < a.length; i++) {
          const after = steps.filter((s) => s.extra?.i === i).at(-1)!;
          const h = after.extra!.heap!.map((x) => x.key);
          expect(inOrder(h)).toBe(true);
          expect([...h].sort((x, y) => y - x)).toEqual(reference(a.slice(0, i + 1), k));
        }
      }),
    );
  });

  it('refuses a k it cannot use and values out of range', () => {
    const t = new Timeline(def, { approach: 'pattern', goal: 'top' }, 1, [
      ['top', 'cat'],
      ['top', 8],
      ['load', '1 2 300'],
      ['load', '4 5'],
      ['top', 3],
    ]);
    expect(t.entries[0]!.steps[0]!.say).toMatch(/Type k as one whole number/);
    expect(t.entries[1]!.steps[0]!.say).toMatch(/At most 7/);
    expect(t.entries[2]!.steps[0]!.say).toMatch(/300 is out of range/);
    expect(t.entries[4]!.steps[0]!.say).toMatch(/holds only 2 values/);
  });

  it('reads the input box: one number is k, a list is values', () => {
    const parse = def.controls.input!.parse;
    expect(parse('3')).toBe(3);
    expect(parse('5, 12, 3')).toBe('5 12 3');
    expect(parse('100')).toBeInstanceOf(Error);
    expect(parse('1 2 x')).toBeInstanceOf(Error);
  });

  it('shows the cost the concept page quotes', () => {
    const a = [5, 12, 3, 18, 7, 21, 9, 14, 2];
    expect([heapCost(a, 3), sortCost(a), selectCost(a, 3)]).toEqual([16, 24, 23]);
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(def, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(def, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
