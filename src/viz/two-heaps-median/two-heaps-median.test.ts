import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { twoHeapsMedian as def } from '.';
import { streamCost, type Even, type MedianSettings } from './model';

/** The reference: sort what has come so far and read the middle. */
function reference(vs: number[], even: Even): number {
  const s = [...vs].sort((x, y) => x - y);
  const m = s.length;
  if (m % 2) return s[(m - 1) / 2]!;
  return even === 'lower' ? s[m / 2 - 1]! : (s[m / 2 - 1]! + s[m / 2]!) / 2;
}

const streams = fc.array(fc.integer({ min: 0, max: 30 }), { minLength: 1, maxLength: 12 });
const approaches = fc.constantFrom('pattern' as const, 'naive' as const);
const evens = fc.constantFrom<Even>('mean', 'lower');

const adds = (vs: number[]): OpCall[] => vs.map((v): OpCall => ['add', v]);

describe('two-heaps-median', () => {
  it('gives the reference median after every value, both ways, with the heaps in balance', () => {
    fc.assert(
      fc.property(streams, approaches, evens, (vs, approach, even) => {
        const settings: MedianSettings = { approach, even };
        const t = new Timeline(def, settings, 1, adds(vs));
        let before = 0;
        t.entries.forEach((e, i) => {
          const seen = vs.slice(0, i + 1);
          const last = e.steps.at(-1)!;
          expect(last.vars?.median).toBe(reference(seen, even));
          // The counters run over the whole stream and end at this way's total.
          const cost = streamCost(seen);
          expect(last.vars?.['pattern total']).toBe(cost.pattern);
          expect(last.vars?.['naive total']).toBe(cost.naive);
          expect(last.vars?.comparisons).toBe(approach === 'naive' ? cost.naive : cost.pattern);
          for (const s of e.steps) {
            const c = Number(s.vars?.comparisons);
            expect(c).toBeGreaterThanOrEqual(before);
            before = c;
          }
          const x = last.extra!;
          if (approach === 'pattern') {
            const low = x.low.map((y) => y.key);
            const high = x.high.map((y) => y.key);
            // Sizes differ by at most one, low holding the extra; every low value ≤ every high one.
            expect(low.length - high.length === 0 || low.length - high.length === 1).toBe(true);
            if (high.length) expect(Math.max(...low)).toBeLessThanOrEqual(Math.min(...high));
            expect(low.every((v, p) => p === 0 || low[Math.floor((p - 1) / 2)]! >= v)).toBe(true);
            expect(high.every((v, p) => p === 0 || high[Math.floor((p - 1) / 2)]! <= v)).toBe(true);
            expect([...low, ...high].sort((a, b) => a - b)).toEqual(
              [...seen].sort((a, b) => a - b),
            );
          } else {
            expect(x.sorted.map((y) => y.key)).toEqual([...seen].sort((a, b) => a - b));
          }
        });
      }),
      { numRuns: 200 },
    );
  });

  it('refuses values out of range and a full stream', () => {
    const t = new Timeline(def, { approach: 'pattern', even: 'mean' }, 1, [
      ['add', 'cat'],
      ['add', 150],
      ...adds(Array(12).fill(3)),
      ['add', 4],
      ['clear'],
    ]);
    expect(t.entries[0]!.steps[0]!.say).toMatch(/Type a whole number/);
    expect(t.entries[1]!.steps[0]!.say).toMatch(/out of range/);
    expect(t.entries[14]!.steps[0]!.say).toMatch(/already holds 12/);
    expect(t.endState().stream).toEqual([]);
  });

  it('shows the costs the concept page quotes', () => {
    expect(streamCost([5, 15, 1, 3, 8, 7, 9, 10, 6])).toEqual({ pattern: 25, naive: 21 });
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(def, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(def, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
