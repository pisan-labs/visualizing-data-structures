import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { minStack as def } from '.';
import { callCost, MAX_SIZE, minsOf, type MSSettings, type Track } from './model';

const calls = fc.array(
  fc.oneof(
    fc.integer({ min: -20, max: 20 }).map((v): OpCall => ['push', v]),
    fc.constantFrom<OpCall>(['pop'], ['top'], ['min']),
  ),
  { maxLength: 30 },
);
const settingsArb = fc.record({
  approach: fc.constantFrom('pattern' as const, 'naive' as const),
  track: fc.constantFrom<Track>('le', 'every'),
});

/** The reference: a plain list, and the minimum found by looking at every value. */
function reference(cs: OpCall[], track: Track) {
  const a: number[] = [];
  const results: (number | null)[] = [];
  const cost = { naive: 0, pattern: 0 };
  for (const [op, x] of cs) {
    if (op === 'push' && a.length < MAX_SIZE) {
      const c = callCost('push', a.length, track);
      cost.naive += c.naive;
      cost.pattern += c.pattern;
      a.push(Number(x));
      continue;
    }
    if (op === 'push') continue;
    if (!a.length) {
      results.push(null);
      continue;
    }
    const c = callCost(op, a.length, track);
    cost.naive += c.naive;
    cost.pattern += c.pattern;
    if (op === 'pop') results.push(a.pop()!);
    else if (op === 'top') results.push(a[a.length - 1]!);
    else results.push(Math.min(...a));
  }
  return { a, results, cost };
}

describe('min-stack', () => {
  it('answers like a plain list, both ways, and mins always tops out at the minimum', () => {
    fc.assert(
      fc.property(settingsArb, calls, (settings: MSSettings, cs) => {
        const t = new Timeline(def, settings, 1, cs);
        const ref = reference(cs, settings.track);
        const got = t.entries
          .filter((e) => e.call[0] !== 'push')
          .map((e) => {
            const r = e.steps.at(-1)!.vars?.returned;
            return r === undefined ? null : Number(r);
          });
        expect(got).toEqual(ref.results);
        const end = t.endState();
        expect(end.items.map((i) => i.value)).toEqual(ref.a);
        expect(end.cost).toEqual(ref.cost);
        const last = t.entries.at(-1)?.steps.at(-1);
        if (last) {
          expect(last.vars?.['naive total']).toBe(ref.cost.naive);
          expect(last.vars?.['pattern total']).toBe(ref.cost.pattern);
          expect(last.vars?.comparisons).toBe(ref.cost[settings.approach]);
        }
        for (const e of t.entries) {
          const s = e.end;
          const vs = s.items.map((i) => i.value);
          if (settings.approach === 'naive') {
            expect(s.mins).toEqual([]);
            continue;
          }
          // Between operations, mins is exactly what the pattern keeps for these values.
          expect(s.mins.map((m) => m.value)).toEqual(minsOf(vs, settings.track));
          if (vs.length) expect(s.mins.at(-1)!.value).toBe(Math.min(...vs));
          // Every entry of mins came from a value still in the stack.
          for (const m of s.mins) expect(s.items.some((i) => i.uid === m.from)).toBe(true);
          if (settings.track === 'every') expect(s.mins.length).toBe(vs.length);
          // The live counter only ever grows, one comparison per step at most.
          let was = Number(e.steps[0]!.vars?.comparisons);
          for (const st of e.steps) {
            const now = Number(st.vars?.comparisons);
            expect(now - was).toBeGreaterThanOrEqual(0);
            expect(now - was).toBeLessThanOrEqual(1);
            was = now;
          }
        }
      }),
      { numRuns: 300 },
    );
  });

  it('scans n − 1 comparisons for min in the plain stack', () => {
    const t = new Timeline(def, { approach: 'naive', track: 'le' }, 1, [
      ['push', 4],
      ['push', 9],
      ['push', 1],
      ['push', 7],
      ['min'],
    ]);
    const steps = t.entries.at(-1)!.steps;
    expect(steps.at(-1)!.vars?.returned).toBe(1);
    expect(steps.at(-1)!.vars?.comparisons).toBe(3);
    expect(steps.filter((s) => s.lines.includes('min.cmp'))).toHaveLength(3);
  });

  it('keeps a tie on mins, so popping one copy keeps the other as the minimum', () => {
    const t = new Timeline(def, def.defaults, 1, [
      ['push', 4],
      ['push', 2],
      ['push', 2],
      ['pop'],
      ['min'],
    ]);
    expect(t.endState().mins.map((m) => m.value)).toEqual([4, 2]);
    expect(t.entries.at(-1)!.steps.at(-1)!.vars?.returned).toBe(2);
  });

  it('refuses values it cannot read and an eleventh push', () => {
    const t = new Timeline(def, def.defaults, 1, [
      ['push', 'cat'],
      ['push', 500],
      ...Array.from({ length: MAX_SIZE + 1 }, (_, i): OpCall => ['push', i]),
    ]);
    expect(t.entries[0]!.steps[0]!.say).toMatch(/not a whole number/);
    expect(t.entries[1]!.steps[0]!.say).toMatch(/500 is out of range/);
    expect(t.entries.at(-1)!.steps[0]!.say).toMatch(/at most 10 values/);
    expect(t.endState().items).toHaveLength(MAX_SIZE);
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(def, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(def, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
