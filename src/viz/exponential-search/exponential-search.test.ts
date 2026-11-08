import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { practiceSet } from '../../engine/practice';
import { Timeline } from '../../engine/timeline';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { ascending, valuesArb } from '../_sorting/check';
import type { ArrayStep } from '../_sorting/kit';
import { exponentialSearch } from '.';
import type { ExponentialSettings } from './model';

const settings = (s: Partial<ExponentialSettings> = {}): ExponentialSettings =>
  ({ ...exponentialSearch.defaults, ...s }) as ExponentialSettings;

/** The textbook version, written plainly, counting probes. */
function reference(a: number[], x: number): { result: number; probes: number } {
  const n = a.length;
  let probes = 0;
  let bound = 1;
  while (bound < n) {
    probes++;
    if (a[bound]! >= x) break;
    bound *= 2;
  }
  let lo = Math.floor(bound / 2);
  let hi = Math.min(bound, n - 1);
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    probes++;
    if (a[mid] === x) return { result: mid, probes };
    if (a[mid]! > x) hi = mid - 1;
    else lo = mid + 1;
  }
  return { result: -1, probes };
}

function search(values: number[], x: number, s = settings()): ArrayStep[] {
  const t = new Timeline(exponentialSearch, s, 1, [
    ['load', values.join(' ')],
    ['search', x],
  ]);
  return t.entries[1]!.steps as ArrayStep[];
}

describe('exponential search', { timeout: 60_000 }, () => {
  it('returns what the plain version returns, with doubling bounds and x inside the window', () => {
    fc.assert(
      fc.property(
        valuesArb(),
        fc.integer({ min: 0, max: 99 }),
        fc.boolean(),
        fc.constantFrom('bars' as const, 'cells' as const),
        (raw, x0, pick, draw) => {
          const a = ascending(raw);
          const x = pick ? a[x0 % a.length]! : x0;
          const steps = search(a, x, settings({ draw }));
          const ref = reference(a, x);
          const end = steps.at(-1)!;
          expect(end.vars?.result).toBe(ref.result);
          expect(end.vars?.probes).toBe(ref.probes);
          if (ref.result >= 0) expect(a[ref.result]).toBe(x);
          else expect(a).not.toContain(x);
          const bounds = steps.map((s) => Number(s.vars?.bound));
          for (const b of bounds) expect(Math.log2(b) % 1).toBe(0);
          for (let k = 1; k < bounds.length; k++)
            expect(bounds[k]).toBeGreaterThanOrEqual(bounds[k - 1]!);
          for (const s of steps) {
            if (typeof s.vars?.lo === 'number' && a.includes(x)) {
              const lo = s.vars.lo;
              const hi = Number(s.vars.hi);
              expect(a.slice(lo, hi + 1)).toContain(x);
            }
          }
          // Probes grow with the position of x, not with n: at most 2 log2(i + 1) + 2.
          if (ref.result >= 0) {
            const first = a.indexOf(x);
            expect(ref.probes).toBeLessThanOrEqual(2 * Math.ceil(Math.log2(first + 2)) + 2);
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it('matches the numbers on the concept page', () => {
    const a = [3, 7, 12, 18, 21, 26, 30, 35, 41, 47, 52, 58, 64, 71, 79, 83, 88, 91, 95, 98];
    expect(search(a, 3).at(-1)!.vars).toMatchObject({ probes: 2, binary: 4, result: 0 });
    expect(search(a, 26).at(-1)!.vars).toMatchObject({ result: 5 });
    expect(search(a, 58).at(-1)!.vars).toMatchObject({ probes: 9, binary: 3, result: 11 });
    expect(search(a, 99).at(-1)!.vars).toMatchObject({ result: -1, bound: 32 });
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(exponentialSearch, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(exponentialSearch, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});

describe('exponential search practice', () => {
  it('lists the indices phase 1 looks at: 1, 2, 4, ... while they are inside A', () => {
    let seen = 0;
    for (let seed = 1; seed < 200; seed++) {
      for (const { kind, question: q } of practiceSet(exponentialSearch, seed, 4)) {
        if (kind.id !== 'jumps') continue;
        seen++;
        const a = String(q.setup[0]![1]).split(' ').map(Number);
        const x = Number(/search\((-?\d+)\)/.exec(q.prompt)![1]);
        const looked: string[] = [];
        for (let bound = 1; bound < a.length; bound *= 2) {
          looked.push(String(bound));
          if (a[bound]! >= x) break;
        }
        expect(q.answer, q.prompt).toEqual({
          kind: 'sequence',
          value: looked.length ? looked : ['none'],
        });
      }
    }
    expect(seen).toBeGreaterThan(5);
  });
});
