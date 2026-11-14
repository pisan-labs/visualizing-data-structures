import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { randomizedSet as def } from '.';
import { callCost, MAX_SIZE, values, type RSSettings } from './model';

const calls = fc.array(
  fc.oneof(
    fc.integer({ min: 0, max: 12 }).map((v): OpCall => ['insert', v]),
    fc.integer({ min: 0, max: 12 }).map((v): OpCall => ['remove', v]),
    fc.constant<OpCall>(['random']),
  ),
  { maxLength: 40 },
);
const approaches = fc.constantFrom('pattern' as const, 'naive' as const);

/** The reference: a JavaScript Set, for membership only (it keeps no array order). */
function reference(cs: OpCall[]) {
  const set = new Set<number>();
  const results: (boolean | null)[] = [];
  for (const [op, x] of cs) {
    if (op === 'insert') {
      if (set.size >= MAX_SIZE) continue;
      results.push(!set.has(Number(x)));
      set.add(Number(x));
    } else if (op === 'remove') results.push(set.delete(Number(x)));
  }
  return { set, results };
}

describe('randomized-set', () => {
  it('agrees with a set, both ways, and the map always matches the array', () => {
    fc.assert(
      fc.property(approaches, calls, fc.integer({ min: 1, max: 1000 }), (approach, cs, seed) => {
        const settings: RSSettings = { approach };
        const t = new Timeline(def, settings, seed, cs);
        const ref = reference(cs);
        const got = t.entries
          .filter((e) => e.call[0] !== 'random' && e.steps.at(-1)!.vars?.returned !== undefined)
          .map((e) => e.steps.at(-1)!.vars!.returned);
        expect(got).toEqual(ref.results);
        const end = t.endState();
        expect(new Set(values(end))).toEqual(ref.set);
        expect(values(end)).toHaveLength(ref.set.size);
        // The other design keeps the same array, so it draws the same values.
        const other = new Timeline(def, { approach: approach === 'naive' ? 'pattern' : 'naive' }, seed, cs);
        expect(values(other.endState())).toEqual(values(end));
        let cost = { naive: 0, pattern: 0 };
        for (const [k, e] of t.entries.entries()) {
          const before = k ? t.entries[k - 1]!.end : t.initial.state;
          const last = e.steps.at(-1)!;
          if (e.call[0] === 'random' && values(before).length) {
            const i = Number(last.vars?.i);
            expect(i).toBeGreaterThanOrEqual(0);
            expect(i).toBeLessThan(values(before).length);
            expect(last.vars?.returned).toBe(values(before)[i]);
            expect(last.vars?.returned).toBe(
              other.entries[k]!.steps.at(-1)!.vars?.returned,
            );
          }
          if (last.vars?.returned !== undefined && e.call[0] !== 'random') {
            const c = callCost(e.call[0], values(before), Number(e.call[1]));
            cost = { naive: cost.naive + c.naive, pattern: cost.pattern + c.pattern };
          }
          expect(e.end.cost).toEqual(cost);
          expect(last.vars?.['naive total']).toBe(cost.naive);
          expect(last.vars?.['pattern total']).toBe(cost.pattern);
          if (approach === 'pattern') {
            // Between operations, map[A[i]] = i for every i, and nothing else is in the map.
            const want = e.end.a.map((it, i) => [it.value, i]).sort((p, q) => p[0]! - q[0]!);
            const have = e.end.map.map((m) => [m.key, m.index]).sort((p, q) => p[0]! - q[0]!);
            expect(have).toEqual(want);
            expect(last.vars?.lookups).toBe(cost.pattern);
            expect(last.vars?.comparisons).toBe(0);
          } else {
            expect(e.end.map).toEqual([]);
            expect(last.vars?.comparisons).toBe(cost.naive);
            expect(last.vars?.lookups).toBe(0);
          }
        }
      }),
      { numRuns: 300 },
    );
  });

  it('fills the hole with the last value', () => {
    const t = new Timeline(def, def.defaults, 1, [
      ['insert', 4],
      ['insert', 7],
      ['insert', 2],
      ['insert', 9],
      ['insert', 5],
      ['remove', 7],
    ]);
    expect(values(t.endState())).toEqual([4, 5, 2, 9]);
    expect(t.endState().map.find((m) => m.key === 5)!.index).toBe(1);
    const lines = t.entries.at(-1)!.steps.flatMap((s) => s.lines);
    expect(lines).toEqual(['rm.find', 'rm.last', 'rm.move', 'rm.pop', 'rm.fix', 'rm.del', 'rm.ret']);
  });

  it('refuses values it cannot read and a ninth value', () => {
    const t = new Timeline(def, def.defaults, 1, [
      ['insert', 'cat'],
      ['remove', 300],
      ...Array.from({ length: MAX_SIZE + 1 }, (_, i): OpCall => ['insert', i]),
    ]);
    expect(t.entries[0]!.steps[0]!.say).toMatch(/not a whole number/);
    expect(t.entries[1]!.steps[0]!.say).toMatch(/300 is out of range/);
    expect(t.entries.at(-1)!.steps[0]!.say).toMatch(/at most 8 values/);
    expect(values(t.endState())).toHaveLength(MAX_SIZE);
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(def, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(def, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
