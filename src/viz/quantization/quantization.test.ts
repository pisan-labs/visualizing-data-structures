import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { quantization, resultLine } from '.';
import {
  bitsPerWeight,
  COLS,
  errorStats,
  fine,
  quantizeMatrix,
  ROWS,
  sig3,
  type Bits,
  type Grouping,
  type QuantSettings,
  type Scheme,
} from './model';

const settingsArb = fc.record({
  bits: fc.constantFrom<Bits>('8', '4'),
  scheme: fc.constantFrom<Scheme>('absmax', 'zeropoint'),
  group: fc.constantFrom<Grouping>('tensor', 'row', '3'),
});
const weightArb = fc.integer({ min: -999, max: 999 }).map((k) => k / 100);
const matrixArb = fc.oneof(
  fc.array(weightArb, { minLength: ROWS * COLS, maxLength: ROWS * COLS }),
  // Small weights with one outlier, and all-positive ones.
  fc
    .tuple(
      fc.array(fc.integer({ min: -90, max: 90 }), { minLength: ROWS * COLS, maxLength: ROWS * COLS }),
      fc.integer({ min: 0, max: ROWS * COLS - 1 }),
      fc.integer({ min: 300, max: 999 }),
    )
    .map(([xs, at, big]) => xs.map((k, i) => (i === at ? big : k) / 100)),
  fc
    .array(fc.integer({ min: 0, max: 200 }), { minLength: ROWS * COLS, maxLength: ROWS * COLS })
    .map((xs) => xs.map((k) => k / 100)),
);

const asMatrix = (xs: number[]) =>
  Array.from({ length: ROWS }, (_, r) => xs.slice(r * COLS, (r + 1) * COLS));

/** The groups worked out again: which cells share a scale. */
function sameGroup(group: Grouping, a: [number, number], b: [number, number]) {
  if (group === 'tensor') return true;
  if (group === 'row') return a[0] === b[0];
  return a[0] === b[0] && Math.floor(a[1] / 3) === Math.floor(b[1] / 3);
}

describe('quantization', () => {
  it('gives each weight the nearest code its group can decode to', () => {
    fc.assert(
      fc.property(settingsArb, matrixArb, (settings, xs) => {
        const w = asMatrix(xs);
        const { groups, q, deq } = quantizeMatrix(w, settings);
        const b = Number(settings.bits);
        const [lo, hi] = settings.scheme === 'absmax' ? [-(2 ** (b - 1) - 1), 2 ** (b - 1) - 1] : [0, 2 ** b - 1];
        // The groups cover every cell once, as the setting says.
        const seen = new Set<string>();
        for (const g of groups) {
          for (const cell of g.cells) {
            seen.add(cell.join());
            for (const other of g.cells) expect(sameGroup(settings.group, cell, other)).toBe(true);
          }
          // The scale comes from the group's own extremes.
          const vals = g.cells.map(([r, c]) => w[r]![c]!);
          if (settings.scheme === 'absmax') {
            const m = Math.max(...vals.map(Math.abs));
            if (m > 0) expect(g.s).toBeCloseTo((2 ** (b - 1) - 1) / m, 9);
          } else {
            expect(g.lo).toBe(Math.min(0, ...vals));
            expect(g.hi).toBe(Math.max(0, ...vals));
            // 0 decodes exactly.
            expect((g.z - g.z) / g.s).toBe(0);
          }
          // Brute force: no code in range decodes closer to the weight.
          for (const [r, c] of g.cells) {
            const x = w[r]![c]!;
            const code = q[r]![c]!;
            expect(code).toBeGreaterThanOrEqual(lo);
            expect(code).toBeLessThanOrEqual(hi);
            const dist = (k: number) => Math.abs((k - g.z) / g.s - x);
            let best = Infinity;
            for (let k = lo; k <= hi; k++) best = Math.min(best, dist(k));
            expect(dist(code)).toBeLessThanOrEqual(best + 1e-9);
            expect(deq[r]![c]).toBe((code - g.z) / g.s);
            expect(Math.abs(deq[r]![c]! - x)).toBeLessThanOrEqual(0.5 / g.s + 1e-9);
          }
        }
        expect(seen.size).toBe(ROWS * COLS);
      }),
      { numRuns: 500 },
    );
  });

  it('runs the same arithmetic step by step as all at once', () => {
    fc.assert(
      fc.property(settingsArb, matrixArb, (settings, xs) => {
        const t = new Timeline(quantization, settings, 1, [['load', xs.join(' ')], ['quantize']]);
        const s = t.endState();
        const all = quantizeMatrix(s.w!, settings);
        expect(s.q).toEqual(all.q);
        expect(s.deq).toEqual(all.deq);
        // Codes fill in as the steps go, and never change once written.
        let filled = 0;
        for (let i = 0; i < t.length; i++) {
          const now = t.at(i).step.state.q.flat().filter((v) => v !== null).length;
          expect(now).toBeGreaterThanOrEqual(filled);
          filled = now;
        }
      }),
      { numRuns: 100 },
    );
  });

  it('tells the story the examples and the concept page tell', () => {
    const end = (id: string) => {
      const ex = quantization.examples.find((e) => e.id === id)!;
      return new Timeline(quantization, ex.settings as QuantSettings, 1, ex.ops).endState();
    };
    const stats = (id: string) => {
      const e = errorStats(end(id))!;
      return [Number(e.max.toFixed(3)), Number(e.total.toFixed(3)), e.zeroed];
    };
    expect(stats('int8-round-trip')).toEqual([0.003, 0.04, 0]);
    expect(stats('int4-rough')).toEqual([0.057, 0.71, 2]);
    expect(stats('outlier-tensor')).toEqual([0.45, 5.39, 16]);
    expect(stats('outlier-int8')).toEqual([0.025, 0.285, 0]);
    expect(stats('outlier-rows')).toEqual([0.39, 1.72, 6]);
    expect(stats('outlier-blocks')).toEqual([0.27, 0.687, 4]);
    expect(stats('positive-absmax')).toEqual([0.057, 0.71, 2]);
    expect(stats('positive-zeropoint')).toEqual([0.026, 0.312, 0]);
    expect(end('int8-round-trip').q[0]).toEqual([49, -82, 13, 121, -22, 71]);
    expect(end('outlier-tensor').q[1]).toEqual([-1, 0, 0, 0, 7, 0]);
    expect(bitsPerWeight({ bits: '4', scheme: 'absmax', group: 'tensor' }).toFixed(2)).toBe('5.33');
    expect(bitsPerWeight({ bits: '4', scheme: 'absmax', group: '3' }).toFixed(2)).toBe('14.67');
    expect(resultLine(end('int4-rough')).split(' | ')[0]).toBe(
      '3 -4 1 7 -1 4 -6 2 -3 1 5 -2 0 -7 3 -1 2 5 4 0 -6 2 -4 1',
    );
  });

  it('writes scales and small numbers so they fit a cell', () => {
    expect([157, 19.84, 8.642, 0.7007, 12700].map(sig3)).toEqual(['157', '19.8', '8.64', '.701', '12700']);
    expect([0.0031, -0.0569, 0, -0.0004, 0.45, 6.4, -4.567].map(fine)).toEqual([
      '.003',
      '−.057',
      '0',
      '0',
      '.45',
      '6.4',
      '−4.57',
    ]);
  });

  it('refuses what does not fit', () => {
    const say = (calls: OpCall[]) => {
      const t = new Timeline(quantization, { bits: '8', scheme: 'absmax', group: 'tensor' }, 1, calls);
      return t.at(t.length - 1).step.say;
    };
    expect(say([['quantize']])).toMatch(/Load some weights first/);
    expect(say([['load', 'cat']])).toMatch(/up to 24 weights/);
    expect(say([['load', '12']])).toMatch(/up to 24 weights/);
    expect(say([['load', Array(25).fill('1').join(' ')]])).toMatch(/up to 24 weights/);
    expect(say([['set', 1, 1, 1]])).toMatch(/Load some weights first/);
    expect(say([['load', '1 2'], ['set', 5, 1, 1]])).toMatch(/a row \(1 to 4\)/);
    expect(say([['load', '1 2']])).toMatch(/the other 22 are 0/);
    // Every weight 0: any scale will do, and nothing is lost.
    const t = new Timeline(quantization, { bits: '4', scheme: 'zeropoint', group: 'row' }, 1, [
      ['load', '0'],
      ['quantize'],
    ]);
    expect(errorStats(t.endState())!.total).toBe(0);
  });

  it('stays readable on a laptop and a phone', () => {
    expect(smallestText(quantization, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(quantization, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
