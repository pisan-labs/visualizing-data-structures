import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeRng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { ascending, valuesArb } from '../_sorting/check';
import { makeState, type ArrayStep } from '../_sorting/kit';
import { ternarySearch } from '.';
import { notUnimodal, unimodal, type TernarySettings } from './model';

const settings = (s: Partial<TernarySettings> = {}): TernarySettings =>
  ({ ...ternarySearch.defaults, ...s }) as TernarySettings;

/** The textbook loops, written plainly. */
function refSearch(
  a: number[],
  x: number,
): { result: number; comparisons: number; rounds: number } {
  let lo = 0;
  let hi = a.length - 1;
  let comparisons = 0;
  let rounds = 0;
  while (lo <= hi) {
    rounds++;
    const t = Math.floor((hi - lo) / 3);
    const [m1, m2] = [lo + t, hi - t];
    comparisons++;
    if (a[m1] === x) return { result: m1, comparisons, rounds };
    comparisons++;
    if (a[m2] === x) return { result: m2, comparisons, rounds };
    comparisons++;
    if (x < a[m1]!) hi = m1 - 1;
    else {
      comparisons++;
      if (x > a[m2]!) lo = m2 + 1;
      else [lo, hi] = [m1 + 1, m2 - 1];
    }
  }
  return { result: -1, comparisons, rounds };
}

function run(values: number[], call: [string, ...number[]], s = settings()): ArrayStep[] {
  const t = new Timeline(ternarySearch, s, 1, [['load', values.join(' ')], call]);
  return t.entries[1]!.steps as ArrayStep[];
}

describe('ternary search', { timeout: 60_000 }, () => {
  it('search returns what the plain loop returns and keeps x in the window', () => {
    fc.assert(
      fc.property(valuesArb(), fc.integer({ min: 0, max: 99 }), fc.boolean(), (raw, x0, pick) => {
        const a = ascending(raw);
        const x = pick ? a[x0 % a.length]! : x0;
        const steps = run(a, ['search', x]);
        const ref = refSearch(a, x);
        expect(steps.at(-1)!.vars).toMatchObject({
          result: ref.result,
          comparisons: ref.comparisons,
          rounds: ref.rounds,
        });
        if (ref.result >= 0) expect(a[ref.result]).toBe(x);
        else expect(a).not.toContain(x);
        for (const s of steps) {
          const lo = Number(s.vars?.lo);
          const hi = Number(s.vars?.hi);
          if (a.includes(x)) expect(a.slice(lo, hi + 1)).toContain(x);
          if (typeof s.vars?.m1 === 'number' && s.lines.includes('mid')) {
            expect(lo).toBeLessThanOrEqual(s.vars.m1);
            expect(s.vars.m1).toBeLessThanOrEqual(Number(s.vars.m2));
            expect(Number(s.vars.m2)).toBeLessThanOrEqual(hi);
          }
        }
      }),
      { numRuns: 300 },
    );
  });

  it('max finds the peak of any unimodal array', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 20 }), fc.integer(), (n, seed) => {
        const a = unimodal(makeRng(seed), n);
        expect(notUnimodal(makeState(a))).toBeNull();
        const steps = run(a, ['max'], settings({ goal: 'max' }));
        const end = steps.at(-1)!;
        expect(end.vars?.result).toBe(a.indexOf(Math.max(...a)));
        // One comparison per round; each round drops at least a third.
        expect(end.vars?.comparisons).toBe(end.vars?.rounds);
        expect(Number(end.vars?.rounds)).toBeLessThanOrEqual(
          Math.ceil(Math.log(n) / Math.log(1.5)) + 1,
        );
        for (const s of steps) {
          const lo = Number(s.vars?.lo);
          const hi = Number(s.vars?.hi);
          const peak = a.indexOf(Math.max(...a));
          expect(lo).toBeLessThanOrEqual(peak);
          expect(peak).toBeLessThanOrEqual(hi);
        }
      }),
      { numRuns: 300 },
    );
  });

  it('refuses arrays with two peaks or a flat stretch', () => {
    expect(run([10, 40, 25, 15, 50, 80, 30], ['max'])).toHaveLength(1);
    expect(notUnimodal(makeState([1, 5, 5, 2]))?.say).toContain('equal');
    expect(run([9, 3, 5], ['search', 5])[0]!.say).toContain('not sorted');
  });

  it('matches the numbers on the concept page', () => {
    const a = [4, 9, 15, 22, 27, 33, 40, 46, 51, 58, 64, 71, 77, 85, 92];
    expect(run(a, ['search', 58]).at(-1)!.vars).toMatchObject({ rounds: 3, result: 9 });
    expect(run(a, ['search', 20]).at(-1)!.vars).toMatchObject({
      rounds: 3,
      comparisons: 10,
      binary: 8,
    });
    expect(run(a, ['search', 27]).at(-1)!.vars).toMatchObject({ rounds: 1, comparisons: 1 });
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(ternarySearch, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(ternarySearch, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
