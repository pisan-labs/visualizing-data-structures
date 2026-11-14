import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { kWayMerge as def } from '.';
import {
  formatLists,
  heapCost,
  pairsCost,
  readLists,
  sortCost,
  type Method,
} from './model';

/** k sorted lists, 1 to 5 values each, at most 12 in all. */
const lists = fc
  .array(fc.array(fc.integer({ min: 0, max: 20 }), { minLength: 1, maxLength: 4 }), {
    minLength: 1,
    maxLength: 5,
  })
  .map((ls) => {
    const out: number[][] = [];
    let total = 0;
    for (const l of ls) {
      if (total + l.length > 12) break;
      total += l.length;
      out.push([...l].sort((x, y) => x - y));
    }
    return out;
  });
const methods = fc.constantFrom<Method>('pattern', 'naive', 'pairs');

function runMerge(ls: number[][], approach: Method) {
  const t = new Timeline(def, { approach }, 1, [['load', formatLists(ls)], ['merge']]);
  return t.entries[1]!.steps;
}

/** A min-heap array (by key, then list) is in order. */
const inOrder = (h: { key: number; src?: number }[]) =>
  h.every((v, p) => {
    if (p === 0) return true;
    const q = h[Math.floor((p - 1) / 2)]!;
    return q.key < v.key || (q.key === v.key && (q.src ?? 0) <= (v.src ?? 0));
  });

describe('k-way-merge', () => {
  it('merges to the reference three ways, and keeps every step consistent', () => {
    fc.assert(
      fc.property(lists, methods, (ls, approach) => {
        const steps = runMerge(ls, approach);
        const want = ls.flat().sort((x, y) => x - y);
        const last = steps.at(-1)!;
        expect(last.vars?.merged).toBe(want.join(' '));
        const own = { pattern: 'pattern total', naive: 'naive total', pairs: 'pairs total' };
        expect(last.vars?.comparisons).toBe(last.vars?.[own[approach]]);
        expect(last.vars?.['pattern total']).toBe(heapCost(ls));
        expect(last.vars?.['pairs total']).toBe(pairsCost(ls));
        expect(last.vars?.['naive total']).toBe(sortCost(ls));
        const n = want.length;
        for (const step of steps) {
          const e = step.extra!;
          // Every value is in exactly one place.
          const places = [
            ...(e.rows ?? []).flat(),
            ...(e.heap ?? []),
            ...(e.out ?? []),
            ...(e.sort ?? [[], []]).flat(),
          ].filter((x) => x !== null);
          expect(new Set(places.map((x) => x!.uid)).size).toBe(places.length);
          expect(places.length).toBe(n);
          if (approach === 'pattern') {
            const out = (e.out ?? []).map((x) => x.key);
            expect(out).toEqual(want.slice(0, out.length));
            expect(e.heap!.length).toBeLessThanOrEqual(ls.length);
            // The heap holds at most one value from each list.
            const srcs = e.heap!.map((x) => x.src);
            expect(new Set(srcs).size).toBe(srcs.length);
          }
          if (approach === 'pairs') {
            for (const r of e.rows ?? []) {
              const ks = r.filter((x) => x !== null).map((x) => x!.key);
              expect(ks).toEqual([...ks].sort((x, y) => x - y));
            }
          }
        }
      }),
      { numRuns: 300 },
    );
  });

  it('keeps the heap in order once each value has gone out', () => {
    fc.assert(
      fc.property(lists, (ls) => {
        const steps = runMerge(ls, 'pattern');
        const n = ls.flat().length;
        for (let m = 1; m < n; m++) {
          const settled = steps.filter((s) => s.extra?.out?.length === m).at(-1)!;
          expect(inOrder(settled.extra!.heap!)).toBe(true);
        }
      }),
    );
  });

  it('refuses lists it cannot use', () => {
    expect(readLists('3 1 | 2')).toMatch(/List 1 is not sorted/);
    expect(readLists('1 | 2 | 3 | 4 | 5 | 6')).toMatch(/at most 5/);
    expect(readLists('1 2 3 4 5 6')).toMatch(/at most 5 per list/);
    expect(readLists('1 2 3 4 5 | 1 2 3 4 5 | 1 2 3')).toMatch(/at most 12/);
    expect(readLists('1 x')).toMatch(/not a whole number/);
    expect(readLists('1 4; 2 3 / 5')).toEqual([[1, 4], [2, 3], [5]]);
    const t = new Timeline(def, { approach: 'pattern' }, 1, [['load', '9 1']]);
    expect(t.entries[0]!.steps[0]!.say).toMatch(/not sorted/);
  });

  it('shows the costs the concept page quotes', () => {
    const start = [
      [1, 8, 12],
      [3, 4, 10, 15],
      [2, 9, 11],
    ];
    expect([heapCost(start), pairsCost(start), sortCost(start)]).toEqual([17, 14, 26]);
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(def, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(def, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
