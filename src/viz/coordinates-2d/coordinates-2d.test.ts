import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeRng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { coordinates2d, parseCoordinate } from '.';
import { fixed2, type CoordSettings } from './model';
import { smallestText } from '../../render/text-size';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';

const run = (calls: OpCall[], form: CoordSettings['form'] = 'affine') =>
  new Timeline(coordinates2d, { form }, 1, calls).endState();

/** Reference: solve o + a u + b v = p by elimination with partial pivoting. */
function solve(o: number[], u: number[], v: number[], p: number[]): [number, number] {
  let rows = [
    [u[0]!, v[0]!, p[0]! - o[0]!],
    [u[1]!, v[1]!, p[1]! - o[1]!],
  ];
  if (Math.abs(rows[1]![0]!) > Math.abs(rows[0]![0]!)) rows = [rows[1]!, rows[0]!];
  const [r0, r1] = rows as [number[], number[]];
  const f = r1[0]! / r0[0]!;
  const b = (r1[2]! - f * r0[2]!) / (r1[1]! - f * r0[1]!);
  const a = (r0[2]! - r0[1]! * b) / r0[0]!;
  return [a, b];
}

const tenth = (lo: number, hi: number) =>
  fc.integer({ min: lo * 10, max: hi * 10 }).map((k) => k / 10);

describe('2D change of coordinates', () => {
  it('converts in a skewed frame', () => {
    const s = run([
      ['origin', 0, 0],
      ['axes', 1, 0, 1, 1],
      ['toLocal', 3, 2],
    ]);
    expect(s.local).toEqual({ x: 1, y: 2 });
  });

  it('refuses parallel axes and keeps the old frame', () => {
    const before = run([]);
    const s = run([['axes', 1, 1, 2, 2]]);
    expect(s.u).toEqual(before.u);
  });

  it('moving the frame keeps the point where it is in the world', () => {
    const s = run([
      ['toLocal', 5, 4],
      ['origin', 5, 4],
    ]);
    expect(s.p).toEqual({ x: 5, y: 4 });
    expect(Math.abs(s.local!.x) + Math.abs(s.local!.y)).toBeLessThan(1e-12);
  });

  it('agrees with elimination, and the two directions undo each other', () => {
    fc.assert(
      fc.property(
        tenth(-7, 7),
        tenth(-7, 7),
        fc.oneof(
          fc.integer({ min: -360, max: 360 }).map((d) => ['angle', d] as OpCall),
          fc
            .tuple(tenth(-4, 4), tenth(-4, 4), tenth(-4, 4), tenth(-4, 4))
            .map((a) => ['axes', ...a] as OpCall),
        ),
        tenth(-7, 7),
        tenth(-7, 7),
        fc.constantFrom<CoordSettings['form']>('affine', 'homogeneous'),
        (ox, oy, frame, px, py, form) => {
          const s = run([['origin', ox, oy], frame, ['toLocal', px, py]], form);
          const det = s.u.x * s.v.y - s.v.x * s.u.y;
          if (Math.abs(det) < 1e-9) return;
          // Skip nearly singular frames, where any method loses digits.
          if (Math.abs(det) < 0.05) return;
          const [a, b] = solve([s.o.x, s.o.y], [s.u.x, s.u.y], [s.v.x, s.v.y], [px, py]);
          const scale = 1 + Math.abs(a) + Math.abs(b);
          expect(Math.abs(s.local!.x - a)).toBeLessThan(1e-9 * scale);
          expect(Math.abs(s.local!.y - b)).toBeLessThan(1e-9 * scale);
          // Back again: B to world lands on p (within the input range only).
          if (Math.abs(a) <= 7 && Math.abs(b) <= 7) {
            const t = new Timeline(coordinates2d, { form }, 1, [
              ['origin', ox, oy],
              frame,
              ['toWorld', Number(a.toFixed(1)), Number(b.toFixed(1))],
            ]).endState();
            const x = ox + Number(a.toFixed(1)) * s.u.x + Number(b.toFixed(1)) * s.v.x;
            expect(Math.abs(t.p!.x - x)).toBeLessThan(1e-9);
          }
          expect(s.conversions).toBe(1);
        },
      ),
      { numRuns: 400 },
    );
  });

  it('rounds the same way as the code tabs', () => {
    expect(fixed2(0.125)).toBe('0.13');
    expect(fixed2(-0.125)).toBe('-0.12');
    expect(fixed2(-0.001)).toBe('0.00');
    expect(fixed2(6.123233995736766e-17)).toBe('0.00');
    expect(fixed2(-3.456)).toBe('-3.46');
  });

  it('parses numbers with one decimal place', () => {
    expect(parseCoordinate('2.5')).toBe(2.5);
    expect(parseCoordinate('-3')).toBe(-3);
    expect(parseCoordinate('2.25')).toBeInstanceOf(Error);
    expect(parseCoordinate('400')).toBeInstanceOf(Error);
  });
});

describe('2D change of coordinates practice', () => {
  it('calls a perpendicular flip a mirror, not a rotation', () => {
    const kind = coordinates2d.practice!.find((k) => k.id === 'transpose')!;
    let mirrors = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const q = kind.make(makeRng(seed));
      if (!q.prompt.includes('u = (0, 1) and v = (1, 0)')) continue;
      mirrors++;
      // Was "so M is a rotation and its inverse is its transpose" for u = (0, 1), v = (1, 0).
      expect(q.explain).toContain('M is a mirror (det M = −1)');
    }
    expect(mirrors).toBeGreaterThan(0);
  });
});

describe('drawn text size', () => {
  // Axis numbers were 11 units: now 13.
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(coordinates2d, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(12);
    expect(smallestText(coordinates2d, PHONE_STAGE).px).toBeGreaterThanOrEqual(10.5);
  });
});
