import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { CountingHeap, type HItem, type Order } from './heap';
import { mergeSort, mergeSortComparisons } from './merge-sort';

const keys = fc.array(fc.integer({ min: 0, max: 20 }), { maxLength: 30 });
const orders = fc.constantFrom<Order>('min', 'max');

const items = (ks: number[]): HItem[] => ks.map((key, uid) => ({ uid, key, tie: uid % 3 }));

function inOrder(h: CountingHeap): boolean {
  return h.items.every((x, p) => p === 0 || !h.above(x, h.items[Math.floor((p - 1) / 2)]!));
}

describe('CountingHeap', () => {
  it('stays in order, reports one event per comparison, and pops in order', () => {
    fc.assert(
      fc.property(keys, orders, (ks, order) => {
        const h = new CountingHeap(order);
        let events = 0;
        for (const x of items(ks)) {
          const evs = h.push(x);
          events += evs.length;
          expect(inOrder(h)).toBe(true);
          if (evs.length) expect(evs.at(-1)!.items).toEqual(h.items);
        }
        expect(events).toBe(h.comparisons);
        const out: number[] = [];
        while (h.size) {
          const before = h.comparisons;
          const { top, events: evs } = h.pop();
          expect(evs.length).toBe(h.comparisons - before);
          expect(inOrder(h)).toBe(true);
          out.push(top.key);
        }
        const want = [...ks].sort((a, b) => (order === 'min' ? a - b : b - a));
        expect(out).toEqual(want);
      }),
    );
  });

  it('replaces the top and sifts it down', () => {
    fc.assert(
      fc.property(keys, fc.integer({ min: 0, max: 20 }), (ks, k) => {
        if (ks.length === 0) return;
        const h = new CountingHeap('min', []);
        for (const x of items(ks)) h.push(x);
        h.replaceTop({ uid: 999, key: k });
        expect(inOrder(h)).toBe(true);
        expect(h.size).toBe(ks.length);
      }),
    );
  });
});

describe('mergeSort', () => {
  it('sorts stably both ways and counts what mergeSortComparisons counts', () => {
    fc.assert(
      fc.property(keys, fc.constantFrom('asc' as const, 'desc' as const), (ks, order) => {
        const run = mergeSort(items(ks), order);
        const want = [...ks].sort((a, b) => (order === 'asc' ? a - b : b - a));
        expect(run.sorted.map((x) => x.key)).toEqual(want);
        // Stable: equal keys keep their input order.
        for (let i = 1; i < run.sorted.length; i++)
          if (run.sorted[i]!.key === run.sorted[i - 1]!.key)
            expect(run.sorted[i]!.uid).toBeGreaterThan(run.sorted[i - 1]!.uid);
        expect(mergeSortComparisons(ks, order)).toBe(run.comparisons);
        // Every value is in exactly one row at every event.
        for (const e of run.events) {
          const live = [...e.rows[0], ...e.rows[1]].filter((x) => x !== null);
          expect(live.length).toBe(ks.length);
        }
      }),
    );
  });
});
