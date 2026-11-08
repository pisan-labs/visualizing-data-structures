import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { ascending, valuesArb } from '../_sorting/check';
import type { ArrayStep } from '../_sorting/kit';
import { interpolationSearch } from '.';
import type { InterpolationExtra, InterpolationSettings } from './model';
import { why } from './practice';

const settings = (s: Partial<InterpolationSettings> = {}): InterpolationSettings =>
  ({ ...interpolationSearch.defaults, ...s }) as InterpolationSettings;

/** The textbook loop, written plainly. */
function reference(a: number[], x: number): { result: number; probes: number } {
  let lo = 0;
  let hi = a.length - 1;
  let probes = 0;
  while (lo <= hi && a[lo]! <= x && x <= a[hi]!) {
    probes++;
    if (a[lo] === a[hi]) return { result: lo, probes };
    const pos = lo + Math.floor(((x - a[lo]!) * (hi - lo)) / (a[hi]! - a[lo]!));
    if (a[pos] === x) return { result: pos, probes };
    if (a[pos]! < x) lo = pos + 1;
    else hi = pos - 1;
  }
  return { result: -1, probes };
}

function search(values: number[], x: number, s = settings()): ArrayStep[] {
  const t = new Timeline(interpolationSearch, s, 1, [
    ['load', values.join(' ')],
    ['search', x],
  ]);
  return t.entries[1]!.steps as ArrayStep[];
}

describe('interpolation search', { timeout: 60_000 }, () => {
  it('returns what the plain loop returns, keeping x inside the window', () => {
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
          for (const s of steps) {
            const lo = Number(s.vars?.lo ?? 0);
            const hi = Number(s.vars?.hi ?? a.length - 1);
            // Whenever x is in A, some copy of it is inside the window.
            if (a.includes(x)) expect(a.slice(lo, hi + 1)).toContain(x);
            const pos = s.vars?.pos;
            if (typeof pos === 'number' && s.lines.includes('pos')) {
              expect(pos).toBeGreaterThanOrEqual(lo);
              expect(pos).toBeLessThanOrEqual(hi);
              const g = (s.extra as InterpolationExtra).guide!;
              expect(Math.floor(g.at)).toBe(pos);
            }
            // The array never changes during a search.
            expect(s.state.a.map((v) => v.value)).toEqual(a);
          }
          expect(ref.probes).toBeLessThanOrEqual(a.length);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('finds any value of an evenly spaced array on the first probe', () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 20 }), fc.integer({ min: 1, max: 4 }), (n, d) => {
        const a = Array.from({ length: n }, (_, i) => 3 + i * d);
        for (const x of a) expect(search(a, x).at(-1)!.vars?.probes).toBe(1);
      }),
    );
  });

  it('crawls on skewed values: the numbers on the concept page', () => {
    const skewed = [...Array.from({ length: 19 }, (_, i) => i + 1), 99];
    const end = search(skewed, 19).at(-1)!;
    expect(end.vars).toMatchObject({ probes: 12, binary: 4, result: 18 });
    const even = [5, 13, 21, 30, 38, 46, 55, 63, 71, 80, 88, 96];
    expect(search(even, 55).at(-1)!.vars).toMatchObject({ probes: 1, binary: 3 });
    expect(search(even, 71).at(-1)!.vars).toMatchObject({ probes: 2 });
    expect(search(even, 50).at(-1)!.vars).toMatchObject({ probes: 1, result: -1 });
  });

  it('refuses unsorted input and leaves A alone', () => {
    const t = new Timeline(interpolationSearch, settings(), 1, [
      ['load', '9 3 5'],
      ['search', 5],
    ]);
    const steps = t.entries[1]!.steps;
    expect(steps).toHaveLength(1);
    expect(steps[0]!.say).toContain('not sorted');
  });

  it('draws the straight line only in bars mode with the option on', () => {
    const step = search([5, 13, 21, 30, 38, 46, 55, 63, 71, 80, 88, 96], 71)[1]!;
    const ids = (s: InterpolationSettings) =>
      interpolationSearch.view(step, s).shapes.map((x) => x.id);
    expect(ids(settings())).toContain('guide-line');
    expect(ids(settings({ guide: false }))).not.toContain('guide-line');
    expect(ids(settings({ draw: 'cells' }))).not.toContain('guide-line');
  });
});

describe('drawn text size', () => {
  it('explains a tie in the versus question as a tie', () => {
    expect(why(3, 3, false)).toMatch(/^A tie/);
    expect(why(3, 3, true)).toMatch(/^A tie/);
    expect(why(1, 4, false)).toMatch(/Evenly spread values make the guess land close/);
    expect(why(6, 3, true)).toMatch(/Skewed values throw off/);
    for (const [m, b] of [
      [3, 3],
      [6, 3],
      [1, 4],
    ] as const)
      for (const sk of [false, true]) {
        if (m >= b) expect(why(m, b, sk)).not.toMatch(/land close/);
        if (m <= b) expect(why(m, b, sk)).not.toMatch(/throw off/);
      }
  });

  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(interpolationSearch, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(interpolationSearch, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
