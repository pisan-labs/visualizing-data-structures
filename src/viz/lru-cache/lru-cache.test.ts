import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { lruCache } from '.';
import { keysOf, node, order, type LruExtra, type LruSettings, type LruState } from './model';

type T = Timeline<LruState, LruSettings, LruExtra>;

const run = (calls: OpCall[], capacity = 3): T => new Timeline(lruCache, { capacity }, 1, calls);
const lastStep = (t: T, k: number) => t.entries[k]!.steps.at(-1)!;

/** An LRU cache on JavaScript's Map, which keeps keys in insertion order (oldest first). */
class Reference {
  map = new Map<number, number>();
  hits = 0;
  misses = 0;
  constructor(readonly capacity: number) {}
  get(k: number): number {
    if (!this.map.has(k)) {
      this.misses++;
      return -1;
    }
    this.hits++;
    const v = this.map.get(k)!;
    this.map.delete(k);
    this.map.set(k, v);
    return v;
  }
  put(k: number, v: number): number | null {
    if (this.map.has(k)) {
      this.map.delete(k);
      this.map.set(k, v);
      return null;
    }
    let evicted: number | null = null;
    if (this.map.size === this.capacity) {
      evicted = this.map.keys().next().value!;
      this.map.delete(evicted);
    }
    this.map.set(k, v);
    return evicted;
  }
  /** Most recent first, as the drawing shows it. */
  keys(): number[] {
    return [...this.map.keys()].reverse();
  }
}

/** Between operations the list and the map agree, and prev mirrors next. */
function checkEnd(s: LruState) {
  const ids = order(s);
  expect(
    s.nodes.map((n) => n.uid),
    'drawn in list order',
  ).toEqual(ids);
  const mapped = s.map.filter((u): u is number => u !== null);
  expect([...mapped].sort((a, b) => a - b)).toEqual([...ids].sort((a, b) => a - b));
  ids.forEach((u, i) => {
    const n = node(s, u);
    expect(n.prev).toBe(i === 0 ? null : ids[i - 1]);
    expect(n.next).toBe(i === ids.length - 1 ? null : ids[i + 1]);
  });
  expect(s.head).toBe(ids[0] ?? null);
  expect(s.tail).toBe(ids.at(-1) ?? null);
  const keys = ids.map((u) => node(s, u).key);
  expect(new Set(keys).size, 'no key twice').toBe(keys.length);
}

describe('LRU cache', () => {
  it('moves a hit to the front with six pointer steps', () => {
    const t = run([
      ['put', 1, 10],
      ['put', 2, 20],
      ['put', 3, 30],
      ['get', 1],
    ]);
    const steps = t.entries[3]!.steps;
    const pointerSteps = steps.filter((s) => s.marks.some((m) => m.role === 'active'));
    expect(pointerSteps.map((s) => s.say)).toEqual([
      'Unlink x: 2.next = x.next, which is null. The list now skips x going forward.',
      'x was last, so tail = x.prev, which is 2.',
      'x.next = head, which is 3.',
      'x.prev = null: nothing comes before the front.',
      'head.prev = x: 3 now points back at x.',
      'head = x: x is the most recently used.',
    ]);
    expect(keysOf(t.endState())).toEqual([1, 3, 2]);
    expect(lastStep(t, 3).vars?.returned).toBe(10);
  });

  it('evicts the least recently used, not the oldest', () => {
    const t = run(
      [
        ['put', 1, 1],
        ['put', 2, 2],
        ['get', 1],
        ['put', 3, 3],
        ['get', 2],
      ],
      2,
    );
    expect(keysOf(t.entries[3]!.end)).toEqual([3, 1]);
    expect(lastStep(t, 4).vars?.returned).toBe(-1);
    expect(lastStep(t, 4).vars).toMatchObject({ hits: 1, misses: 1 });
  });

  it('handles a cache of one, where head and tail are the same node', () => {
    const t = run(
      [
        ['put', 1, 10],
        ['put', 2, 20],
      ],
      1,
    );
    const says = t.entries[1]!.steps.map((s) => s.say);
    expect(says.some((s) => s.includes('y was first, so head = y.next, which is null'))).toBe(true);
    expect(keysOf(t.endState())).toEqual([2]);
  });

  it('matches a reference cache for any sequence of operations', () => {
    const key = fc.integer({ min: 0, max: 6 });
    const call: fc.Arbitrary<OpCall> = fc.oneof(
      {
        weight: 3,
        arbitrary: fc
          .tuple(key, fc.integer({ min: 0, max: 99 }))
          .map(([k, v]) => ['put', k, v] as OpCall),
      },
      { weight: 3, arbitrary: key.map((k) => ['get', k] as OpCall) },
      { weight: 1, arbitrary: fc.constantFrom<OpCall>(['clear'], ['get', 'x'], ['put', 1, -5]) },
    );
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 4 }),
        fc.array(call, { maxLength: 40 }),
        (cap, calls) => {
          const t = run(calls, cap);
          let ref = new Reference(cap);
          calls.forEach(([op, a, b], idx) => {
            const last = lastStep(t, idx);
            const end = t.entries[idx]!.end;
            if (op === 'clear') {
              ref = new Reference(cap);
            } else if (
              typeof a !== 'number' ||
              (op === 'put' && (typeof b !== 'number' || b < 0))
            ) {
              expect(last.lines[0]).toMatch(/\.sig$/);
            } else if (op === 'get') {
              expect(last.vars?.returned).toBe(ref.get(a));
            } else {
              const before = t.entries[idx - 1]?.end ?? t.initial.state;
              const evicted = ref.put(a, b as number);
              const gone = before.map.find((u) => u !== null && !end.map.includes(u));
              expect(gone === undefined || gone === null ? null : node(before, gone).key).toBe(
                evicted,
              );
            }
            expect(keysOf(end)).toEqual(ref.keys());
            for (const u of order(end))
              expect(node(end, u).value).toBe(ref.map.get(node(end, u).key));
            expect(end.hits).toBe(ref.hits);
            expect(end.misses).toBe(ref.misses);
            checkEnd(end);
          });
          for (let i = 0; i < t.length; i++) {
            const { step } = t.at(i);
            const s = step.state;
            const uids = s.nodes.map((n) => n.uid);
            expect(new Set(uids).size).toBe(uids.length);
            for (const n of s.nodes) {
              if (n.next !== null) expect(uids).toContain(n.next);
              if (n.prev !== null) expect(uids).toContain(n.prev);
            }
            for (const u of s.map) if (u !== null) expect(uids).toContain(u);
            expect(s.map.filter((u) => u !== null).length).toBeLessThanOrEqual(cap);
            expect(step.vars?.hits).toBe(s.hits);
            expect(step.vars?.misses).toBe(s.misses);
          }
        },
      ),
      { numRuns: 300 },
    );
  });
});
