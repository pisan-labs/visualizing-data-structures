import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { countMinSketch } from '.';
import { estimateOf, trueCount, type CmsExtra, type CmsSettings, type CmsState } from './model';

type T = Timeline<CmsState, CmsSettings, CmsExtra>;
const run = (calls: OpCall[], s: Partial<CmsSettings> = {}): T =>
  new Timeline(countMinSketch, { ...countMinSketch.defaults, ...s } as CmsSettings, 1, calls);

/** A count-min sketch written separately from the model. */
function reference(d: number, w: number, conservative: boolean) {
  const a = [71, 113, 157, 211, 263];
  const b = [5, 17, 29, 43, 61];
  const C = Array.from({ length: d }, () => Array<number>(w).fill(0));
  const col = (i: number, x: number) => ((a[i]! * x + b[i]!) % 1009) % w;
  const est = (x: number) => Math.min(...C.map((r, i) => r[col(i, x)]!));
  return {
    C,
    est,
    add(x: number) {
      const e = est(x);
      C.forEach((r, i) => {
        const j = col(i, x);
        r[j] = conservative ? Math.max(r[j]!, e + 1) : r[j]! + 1;
      });
    },
  };
}

describe('count-min sketch', () => {
  it('shows each row with real numbers', () => {
    const t = run([['add', 42]]);
    expect(t.entries[0]!.steps[1]!.say).toContain(
      'Row 1: h1(42) = (71·42 + 5) mod 1009 mod 8 = 969 mod 8 = 1. C[1][1]: 0 → 1.',
    );
  });

  it('names the items behind an overestimate', () => {
    const t = run([5, 23, 17, 9].map((x): OpCall => ['add', x]).concat([['estimate', 50]]));
    const last = t.entries.at(-1)!.steps.at(-1)!;
    expect(last.vars!.true).toBe(0);
    expect(Number(last.vars!.error)).toBeGreaterThan(0);
    expect(last.say).toContain('row 1: 5');
  });

  it('matches a reference sketch and never estimates too low', () => {
    const item = fc.integer({ min: 0, max: 40 });
    const call: fc.Arbitrary<OpCall> = fc.oneof(
      { weight: 6, arbitrary: item.map((x) => ['add', x] as OpCall) },
      { weight: 3, arbitrary: item.map((x) => ['estimate', x] as OpCall) },
      { weight: 1, arbitrary: fc.constantFrom<OpCall>(['heavy'], ['clear'], ['add', -3]) },
    );
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 4, max: 16 }),
        fc.boolean(),
        fc.array(call, { maxLength: 40 }),
        (d, w, conservative, calls) => {
          const t = run(calls, { d, w, update: conservative ? 'conservative' : 'standard' });
          let ref = reference(d, w, conservative);
          calls.forEach(([op, x], i) => {
            const last = t.entries[i]!.steps.at(-1)!;
            if (op === 'clear') ref = reference(d, w, conservative);
            else if (op === 'add' && typeof x === 'number' && x >= 0) ref.add(x);
            else if (op === 'estimate') expect(last.vars!.estimate).toBe(ref.est(Number(x)));
            expect(t.entries[i]!.end.rows).toEqual(ref.C);
            // Every row's counters add up to N under standard update.
            const e = t.entries[i]!.end;
            if (!conservative)
              for (const r of e.rows) expect(r.reduce((p, q) => p + q, 0)).toBe(e.n);
          });
          for (let i = 0; i < t.length; i++) {
            const s = t.at(i).step.state;
            for (const [x, k] of s.counts) expect(estimateOf(s, x)).toBeGreaterThanOrEqual(k);
            expect(s.counts.reduce((p, [, k]) => p + k, 0)).toBe(s.n);
          }
          const end = t.endState();
          if (end.heavy) for (const x of end.heavy) expect(trueCount(end, x)).toBeGreaterThan(0);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('keeps its text readable on a laptop and a phone', () => {
    expect(smallestText(countMinSketch, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(countMinSketch, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
