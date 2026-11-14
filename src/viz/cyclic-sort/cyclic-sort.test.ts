import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { cyclicSort as def } from '.';
import type { CyclicSettings } from './model';

/** n values, each from 1 to n. */
const values = fc
  .integer({ min: 2, max: 12 })
  .chain((n) => fc.array(fc.integer({ min: 1, max: n }), { minLength: n, maxLength: n }));
const approaches = fc.constantFrom('pattern' as const, 'naive' as const);

/** The reference: count each number. */
function reference(vs: number[]) {
  const missing: number[] = [];
  const repeated: number[] = [];
  for (let v = 1; v <= vs.length; v++) {
    const c = vs.filter((x) => x === v).length;
    if (c === 0) missing.push(v);
    for (let k = 1; k < c; k++) repeated.push(v);
  }
  return { missing, repeated };
}

const text = (xs: number[]) => (xs.length ? xs.join(' ') : 'none');
const sorted = (xs: number[]) => [...xs].sort((x, y) => x - y);

function run(vs: number[], settings: CyclicSettings) {
  return new Timeline(def, settings, 1, [['load', vs.join(' ')], ['sort']]).entries[1]!.steps;
}

describe('cyclic-sort', () => {
  it('finds what the reference finds both ways, and keeps every step consistent', () => {
    fc.assert(
      fc.property(values, approaches, (vs, approach) => {
        const steps = run(vs, { approach, draw: 'bars' });
        const n = vs.length;
        const ref = reference(vs);
        const last = steps.at(-1)!;
        expect(last.vars?.missing).toBe(text(ref.missing));
        expect(last.vars?.repeated).toBe(text(ref.repeated));
        const out = last.state.a.map((x) => x.value);
        expect(sorted(out)).toEqual(sorted(vs));
        // Totals are the same on both sides, and each side reaches its own.
        const total = Number(last.vars?.comparisons) + Number(last.vars?.swaps);
        expect(total).toBe(last.vars?.[approach === 'naive' ? 'naive total' : 'pattern total']);
        if (approach === 'pattern') {
          // Every value present is home; at most n − 1 swaps; n + swaps comparisons, then n.
          for (const v of new Set(vs)) expect(out[v - 1]).toBe(v);
          const swaps = Number(last.vars?.swaps);
          expect(swaps).toBeLessThanOrEqual(n - 1);
          expect(last.vars?.comparisons).toBe(n + swaps + n);
        } else {
          expect(out).toEqual(sorted(vs));
          expect(last.vars?.comparisons).toBe((n * (n - 1)) / 2 + n);
        }
        let home = new Set<number>();
        for (const step of steps) {
          const a = step.state.a;
          const uids = a.map((x) => x.uid);
          expect(new Set(uids).size).toBe(n);
          expect(sorted(a.map((x) => x.value))).toEqual(sorted(vs));
          if (approach === 'pattern') {
            // A value that reached home never leaves it.
            for (const k of home) expect(a[k]!.value).toBe(k + 1);
            home = new Set(a.flatMap((x, k) => (x.value === k + 1 ? [k] : [])));
          }
        }
      }),
      { numRuns: 300 },
    );
  });

  it('refuses values outside 1 to n and leaves A alone', () => {
    const t = new Timeline(def, def.defaults, 1, [
      ['load', '1 2 5'],
      ['load', '0 1'],
      ['load', '1'],
      ['load', Array(13).fill(1).join(' ')],
    ]);
    expect(t.entries[0]!.steps[0]!.say).toMatch(
      /5 is out of range: with 3 values, use whole numbers from 1 to 3/,
    );
    expect(t.entries[1]!.steps[0]!.say).toMatch(/0 is out of range/);
    expect(t.entries[2]!.steps[0]!.say).toMatch(/at least two values/);
    expect(t.entries[3]!.steps[0]!.say).toMatch(/at most 12/);
    expect(t.endState().a.map((x) => x.value)).toEqual([6, 4, 1, 8, 4, 2, 7, 3]);
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(def, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(def, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
