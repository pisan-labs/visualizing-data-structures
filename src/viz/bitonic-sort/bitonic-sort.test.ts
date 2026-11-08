import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { checkSort, counters } from '../_sorting/check';
import { bitonicSort } from '.';
import { network, size, type BitonicSettings, type Network } from './model';

const settings = (s: Partial<BitonicSettings> = {}): BitonicSettings =>
  ({ ...bitonicSort.defaults, ...s }) as BitonicSettings;

/** Batcher's recursive bitonic sort, written plainly: sort halves in opposite directions, merge. */
function reference(vs: number[]): { a: number[]; comparisons: number } {
  const a = [...vs];
  let comparisons = 0;
  const merge = (lo: number, n: number, up: boolean) => {
    if (n < 2) return;
    const h = n / 2;
    for (let i = lo; i < lo + h; i++) {
      comparisons++;
      if (a[i]! > a[i + h]! === up) [a[i], a[i + h]] = [a[i + h]!, a[i]!];
    }
    merge(lo, h, up);
    merge(lo + h, h, up);
  };
  const sort = (lo: number, n: number, up: boolean) => {
    if (n < 2) return;
    sort(lo, n / 2, true);
    sort(lo + n / 2, n / 2, false);
    merge(lo, n, up);
  };
  sort(0, a.length, true);
  return { a, comparisons };
}

const powerArb = fc
  .constantFrom(1, 2, 4, 8, 16)
  .chain((n) => fc.array(fc.integer({ min: 0, max: 99 }), { minLength: n, maxLength: n }));

describe('bitonic sorting network', { timeout: 60_000 }, () => {
  it('sorts every power-of-two input with exactly the network comparators, in both layouts', () => {
    fc.assert(
      fc.property(fc.constantFrom<Network>('flip', 'alternating'), powerArb, (kind, values) => {
        const steps = checkSort(bitonicSort, settings({ network: kind }), values);
        const ref = reference(values);
        const n = values.length;
        if (n > 1) expect(counters(steps).comparisons).toBe(ref.comparisons);
        expect(ref.comparisons).toBe(size(n).comparators);
        // Within a column, no wire is used twice: the column can run in parallel.
        for (const col of network(n, kind)) {
          const wires = col.comparators.flatMap((c) => [c.min, c.max]);
          expect(new Set(wires).size).toBe(wires.length);
          expect(col.comparators).toHaveLength(n / 2);
        }
        // After each stage, blocks are sorted (up, or up and down in turn).
        for (const s of steps.filter((x) => x.level === 1 && typeof x.vars?.stage === 'number')) {
          const block = 2 ** Number(s.vars!.stage);
          const vs = s.state.a.map((x) => x.value);
          for (let b = 0; b * block < n; b++) {
            const part = vs.slice(b * block, (b + 1) * block);
            const up = kind === 'flip' || b % 2 === 0;
            const want = [...part].sort((p, q) => (up ? p - q : q - p));
            expect(part).toEqual(want);
          }
        }
      }),
      { numRuns: 200 },
    );
  });

  it('has log n (log n + 1) / 2 columns', () => {
    expect(size(4)).toEqual({ depth: 3, comparators: 6 });
    expect(size(8)).toEqual({ depth: 6, comparators: 24 });
    expect(size(16)).toEqual({ depth: 10, comparators: 80 });
    expect(network(16, 'flip')).toHaveLength(10);
  });

  it('refuses a length that is not a power of two', () => {
    const t = new Timeline(bitonicSort, settings(), 1, [['load', '1 2 3 4 5 6'], ['sort']]);
    const steps = t.entries[1]!.steps;
    expect(steps).toHaveLength(1);
    expect(steps[0]!.say).toContain('power of two');
  });

  it('draws the network wide on a laptop and tall on a phone', () => {
    const t = new Timeline(bitonicSort, settings(), 1, [['load', '5 3 8 1 9 2 7 4'], ['sort']]);
    const step = t.entries[1]!.steps[3]!;
    const wide = bitonicSort.view(step, settings(), LAPTOP_STAGE).bounds;
    const tall = bitonicSort.view(step, settings(), PHONE_STAGE).bounds;
    expect(wide.w).toBeGreaterThan(wide.h);
    expect(tall.h).toBeGreaterThan(tall.w);
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(bitonicSort, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(bitonicSort, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
