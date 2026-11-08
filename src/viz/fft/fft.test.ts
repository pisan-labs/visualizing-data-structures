import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { fft } from '.';
import { bitReverse, dft, fmtC, type C, type FftSettings, type Sign } from './model';

const close = (a: C, b: C) => Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6;

describe('fft', () => {
  it('matches the DFT by its definition, and every block is the DFT of its inputs', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: -99, max: 99 }), { minLength: 1, maxLength: 8 }),
        fc.constantFrom<Sign>('clrs', 'numpy'),
        (xs, sign) => {
          const settings: FftSettings = { sign };
          const steps = new Timeline(fft, settings, 1, [['fft', xs.join(' ')]]).entries[0]!.steps;
          const end = steps.at(-1)!.state;
          const want = dft(
            end.a.map((v) => [v, 0] as C),
            sign,
          );
          end.y!.forEach((z, k) => expect(close(z, want[k]!), `y[${k}]`).toBe(true));
          // Every finished block at level L holds the DFT of the 2^L inputs it covers.
          const col0 = end.net[0]!;
          end.net.forEach((col, level) => {
            const m = 2 ** level;
            for (let j = 0; j < col.length / m; j++) {
              // The block's inputs sit bit-reversed in column 0, as they do for the whole input.
              const slice = col0.slice(j * m, (j + 1) * m) as C[];
              const block = dft(
                slice.map((_, i) => slice[bitReverse(i, level)]!),
                sign,
              );
              block.forEach((z, k) => expect(close(col[j * m + k]!, z)).toBe(true));
            }
          });
        },
      ),
      { numRuns: 200 },
    );
  });

  it('multiplies polynomials like the schoolbook method', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: -9, max: 9 }), { minLength: 1, maxLength: 4 }),
        fc.array(fc.integer({ min: -9, max: 9 }), { minLength: 1, maxLength: 4 }),
        fc.constantFrom<Sign>('clrs', 'numpy'),
        (a, b, sign) => {
          const t = new Timeline(fft, { sign }, 1, [
            ['multiply', `${a.join(' ')} | ${b.join(' ')}`],
          ]);
          const want = Array(a.length + b.length - 1).fill(0);
          a.forEach((x, i) => b.forEach((y, j) => (want[i + j] += x * y)));
          expect(t.entries[0]!.end.c).toEqual(want.map((v) => (v === 0 ? 0 : v)));
        },
      ),
      { numRuns: 150 },
    );
  });

  it('writes complex numbers readably', () => {
    expect(fmtC([2, 0])).toBe('2');
    expect(fmtC([-1, 2])).toBe('−1+2i');
    expect(fmtC([0, -1])).toBe('−i');
    expect(fmtC([Math.SQRT1_2, -Math.SQRT1_2])).toBe('0.71−0.71i');
    expect(fmtC([1e-17, -1e-17])).toBe('0');
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(fft, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(fft, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
