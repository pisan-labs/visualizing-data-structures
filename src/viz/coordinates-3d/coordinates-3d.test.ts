import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { coordinates3d, parseCoordinate } from '.';
import { fixed2, type Coord3Settings } from './model';

const run = (calls: OpCall[], form: Coord3Settings['form'] = 'affine') =>
  new Timeline(coordinates3d, { form, projection: 'isometric' }, 1, calls);

/** Reference: solve o + a u + b v + c w = p by Gaussian elimination with partial pivoting. */
function solve(cols: number[][], rhs: number[]): number[] {
  const a = [0, 1, 2].map((i) => [cols[0]![i]!, cols[1]![i]!, cols[2]![i]!, rhs[i]!]);
  for (let k = 0; k < 3; k++) {
    let best = k;
    for (let i = k + 1; i < 3; i++) if (Math.abs(a[i]![k]!) > Math.abs(a[best]![k]!)) best = i;
    [a[k], a[best]] = [a[best]!, a[k]!];
    for (let i = k + 1; i < 3; i++) {
      const f = a[i]![k]! / a[k]![k]!;
      for (let j = k; j < 4; j++) a[i]![j]! -= f * a[k]![j]!;
    }
  }
  const x = [0, 0, 0];
  for (let i = 2; i >= 0; i--) {
    let t = a[i]![3]!;
    for (let j = i + 1; j < 3; j++) t -= a[i]![j]! * x[j]!;
    x[i] = t / a[i]![i]!;
  }
  return x;
}

const tenth = (lo: number, hi: number) =>
  fc.integer({ min: lo * 10, max: hi * 10 }).map((k) => k / 10);
const vec = (s: { x: number; y: number; z: number }) => [s.x, s.y, s.z];

describe('3D change of coordinates', () => {
  it('converts in a skewed frame', () => {
    const s = run([
      ['origin', 0, 0, 0],
      ['axes', 1, 0, 0, 1, 1, 0, 0, 0, 1],
      ['toLocal', 3, 2, 1],
    ]).endState();
    expect(s.local).toEqual({ x: 1, y: 2, z: 1 });
  });

  it('refuses axes in one plane and keeps the old frame', () => {
    const before = run([]).endState();
    const s = run([['axes', 1, 0, 0, 0, 1, 0, 1, 1, 0]]).endState();
    expect(s.w).toEqual(before.w);
  });

  it('uses the transpose for a turned frame', () => {
    const t = run([
      ['turn', 40, 25],
      ['toLocal', 1, 2, 3],
    ]);
    const steps = t.entries.at(-1)!.steps;
    expect(steps.some((st) => st.vars?.['M⁻¹ = Mᵀ'] === 'yes')).toBe(true);
    const s = t.endState();
    const d = [1 - s.o.x, 2 - s.o.y, 3 - s.o.z];
    const dotd = (a: number[]) => a[0]! * d[0]! + a[1]! * d[1]! + a[2]! * d[2]!;
    expect(s.local!.x).toBeCloseTo(dotd(vec(s.u)), 12);
    expect(s.local!.z).toBeCloseTo(dotd(vec(s.w)), 12);
  });

  it('agrees with elimination on every step, and the two directions undo each other', () => {
    const frameOp = fc.oneof(
      fc
        .tuple(fc.integer({ min: -36, max: 36 }), fc.integer({ min: -36, max: 36 }))
        .map(([a, b]) => ['turn', a * 10, b * 10] as OpCall),
      fc.array(tenth(-4, 4), { minLength: 9, maxLength: 9 }).map((a) => ['axes', ...a] as OpCall),
      fc.tuple(tenth(-4, 4), tenth(-4, 4), tenth(-4, 4)).map((a) => ['origin', ...a] as OpCall),
    );
    const convert = fc.oneof(
      fc.tuple(tenth(-4, 4), tenth(-4, 4), tenth(-4, 4)).map((a) => ['toLocal', ...a] as OpCall),
      fc.tuple(tenth(-4, 4), tenth(-4, 4), tenth(-4, 4)).map((a) => ['toWorld', ...a] as OpCall),
    );
    fc.assert(
      fc.property(
        fc.array(fc.oneof(frameOp, convert), { maxLength: 8 }),
        fc.constantFrom<Coord3Settings['form']>('affine', 'homogeneous'),
        (calls, form) => {
          const t = run(calls, form);
          t.entries.forEach((e) => {
            const s = e.end;
            const cols = [vec(s.u), vec(s.v), vec(s.w)];
            const det =
              s.u.x * (s.v.y * s.w.z - s.v.z * s.w.y) -
              s.v.x * (s.u.y * s.w.z - s.u.z * s.w.y) +
              s.w.x * (s.u.y * s.v.z - s.u.z * s.v.y);
            // The frame is never singular.
            expect(Math.abs(det)).toBeGreaterThan(1e-9);
            if (!s.p || !s.local) return;
            // Skip nearly singular frames, where any method loses digits.
            if (Math.abs(det) < 0.05) return;
            // On every step with a point: p = o + M local, and local solves the system.
            const x = solve(cols, [s.p.x - s.o.x, s.p.y - s.o.y, s.p.z - s.o.z]);
            const scale = 1 + Math.abs(x[0]!) + Math.abs(x[1]!) + Math.abs(x[2]!);
            expect(Math.abs(s.local.x - x[0]!)).toBeLessThan(1e-8 * scale);
            expect(Math.abs(s.local.y - x[1]!)).toBeLessThan(1e-8 * scale);
            expect(Math.abs(s.local.z - x[2]!)).toBeLessThan(1e-8 * scale);
          });
        },
      ),
      { numRuns: 400 },
    );
  });

  it('rounds the same way as the code tabs', () => {
    expect(fixed2(0.125)).toBe('0.13');
    expect(fixed2(-0.125)).toBe('-0.12');
    expect(fixed2(-0.001)).toBe('0.00');
  });

  it('parses numbers with one decimal place', () => {
    expect(parseCoordinate('2.5')).toBe(2.5);
    expect(parseCoordinate('2.25')).toBeInstanceOf(Error);
    expect(parseCoordinate('400')).toBeInstanceOf(Error);
  });
});
