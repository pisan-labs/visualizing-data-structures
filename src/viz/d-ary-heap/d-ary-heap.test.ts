import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { dAryHeap } from '.';
import { childrenOf, heightOf, parentOf, type DHeapSettings } from './model';

const settings = (s: Partial<DHeapSettings> = {}): DHeapSettings =>
  ({ ...dAryHeap.defaults, ...s }) as DHeapSettings;

const keysOf = (t: Timeline<ReturnType<typeof dAryHeap.init>, DHeapSettings, unknown>) =>
  t.endState().items.map((x) => x.key);

describe('d-ary heap', () => {
  it('finds parents and children for any d', () => {
    for (const d of [2, 3, 4, 5])
      for (let p = 1; p < 40; p++) expect(childrenOf(parentOf(p, d), d, 99)).toContain(p);
    expect(heightOf(13, 3)).toBe(2);
    expect(heightOf(14, 3)).toBe(3);
    expect(heightOf(1, 4)).toBe(0);
  });

  it('costs one comparison a level going up and up to d going down', () => {
    const climb = new Timeline(dAryHeap, settings({ d: 4 }), 1, [
      ['build', '50 40 30 20 10'],
      ['insert', 99],
    ]);
    const ins = climb.entries[1]!.steps.at(-1)!;
    expect(ins.vars?.comparisons).toBe(2);
    expect(climb.endState().items[0]!.key).toBe(99);
    const ext = new Timeline(dAryHeap, settings({ d: 4 }), 1, [
      ['build', '50 40 30 20 10'],
      ['extract'],
    ]).entries[1]!.steps.at(-1)!;
    expect(ext.vars?.returned).toBe(50);
    expect(ext.vars?.comparisons).toBe(3);
  });

  it('matches a reference priority queue and keeps heap order on every step', () => {
    const call = fc.oneof(
      fc.integer({ min: -20, max: 120 }).map((k) => ['insert', k] as OpCall),
      fc.constant(['extract'] as OpCall),
      fc
        .tuple(fc.integer({ min: 0, max: 12 }), fc.integer({ min: -20, max: 120 }))
        .map(([i, k]) => ['update', i, k] as OpCall),
      fc
        .array(fc.integer({ min: 0, max: 99 }), { minLength: 1, maxLength: 14 })
        .map((ks) => ['build', ks.join(' ')] as OpCall),
    );
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 5 }),
        fc.constantFrom('max' as const, 'min' as const),
        fc.constantFrom('one' as const, 'zero' as const),
        fc.array(call, { maxLength: 30 }),
        (d, order, index, calls) => {
          const st = settings({ d, order, index });
          const t = new Timeline(dAryHeap, st, 1, calls);
          const better = (a: number, b: number) => (order === 'max' ? a > b : a < b);
          let ref: number[] = [];
          calls.forEach((c, k) => {
            const last = t.entries[k]!.steps.at(-1)!;
            const before = k === 0 ? [] : t.entries[k - 1]!.end.items;
            if (c[0] === 'insert' && ref.length < 31) ref.push(c[1] as number);
            if (c[0] === 'build') ref = String(c[1]).split(' ').map(Number);
            if (c[0] === 'extract' && ref.length) {
              ref.sort((a, b) => (better(a, b) ? -1 : better(b, a) ? 1 : 0));
              expect(last.vars?.returned).toBe(ref.shift());
            }
            if (c[0] === 'update') {
              const p = (c[1] as number) - (index === 'one' ? 1 : 0);
              if (p >= 0 && p < before.length) {
                ref.splice(ref.indexOf(before[p]!.key), 1, c[2] as number);
              }
            }
          });
          expect([...keysOf(t)].sort((a, b) => a - b)).toEqual([...ref].sort((a, b) => a - b));
          for (let i = 0; i < t.length; i++) {
            const { step } = t.at(i);
            const its = step.state.items;
            expect(step.vars?.N).toBe(its.length);
            expect(new Set(its.map((x) => x.uid)).size).toBe(its.length);
          }
          for (const e of t.entries) {
            const its = e.end.items;
            for (let p = 1; p < its.length; p++)
              expect(better(its[p]!.key, its[parentOf(p, d)]!.key)).toBe(false);
          }
        },
      ),
      { numRuns: 300 },
    );
  });
});

describe('drawn text size', () => {
  // The array's indices are the smallest text: 16.6 px on a laptop, 11.7 on a phone.
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(dAryHeap, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(14);
    expect(smallestText(dAryHeap, PHONE_STAGE).px).toBeGreaterThanOrEqual(11);
  });
});
