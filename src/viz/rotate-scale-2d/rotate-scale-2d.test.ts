import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import type { Vec } from '../../layouts/plane';
import { parseNumber, rotateScale2d } from '.';
import { SHAPES, fixed2, type RsSettings } from './model';
import { smallestText } from '../../render/text-size';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';

const settings = (s: Partial<RsSettings> = {}): RsSettings =>
  ({ ...rotateScale2d.defaults, ...s }) as RsSettings;

/** Shoelace area, signed. */
const area = (pts: Vec[]) =>
  pts.reduce((t, p, i) => {
    const q = pts[(i + 1) % pts.length]!;
    return t + p.x * q.y - q.x * p.y;
  }, 0) / 2;

/** Reference: each transform written as a plain 3×3 homogeneous matrix product. */
type M3 = number[][];
const mul3 = (a: M3, b: M3): M3 =>
  a.map((row) => b[0]!.map((_, j) => row.reduce((t, x, k) => t + x * b[k]![j]!, 0)));
const translate = (x: number, y: number): M3 => [
  [1, 0, x],
  [0, 1, y],
  [0, 0, 1],
];

describe('2D rotation and scale', () => {
  it('a quarter turn sends (x, y) to (-y, x)', () => {
    const t = new Timeline(rotateScale2d, settings(), 1, [['rotate', 90]]);
    t.endState().pts.forEach((p, i) => {
      const q = SHAPES.letter[i]!;
      expect(p.x).toBeCloseTo(-q.y, 12);
      expect(p.y).toBeCloseTo(q.x, 12);
    });
  });

  it('order matters for a non-uniform scale and not for a uniform one', () => {
    const run = (c: OpCall) =>
      new Timeline(rotateScale2d, settings(), 1, [c]).entries[0]!.steps.at(-1)!.vars?.same;
    expect(run(['order', 90, 2, 1])).toBe('no');
    expect(run(['order', 45, 2, 2])).toBe('yes');
    expect(run(['order', 180, 2, 1])).toBe('yes');
  });

  it('gives the true reason when the two orders agree', () => {
    const say = (c: OpCall) =>
      new Timeline(rotateScale2d, settings(), 1, [c]).entries[0]!.steps.at(-1)!.say;
    expect(say(['order', 180, 2, 1])).toContain('a multiple of 180°');
    // A tiny angle matches to two decimals; it was said to be "a multiple of 180°".
    const tiny = say(['order', 0.1, 1, 1.1]);
    expect(tiny).toContain('the same shape');
    expect(tiny).not.toContain('multiple of 180°');
  });

  it('says a scale by 0 and 0 squashes the shape to a point', () => {
    const last = (c: OpCall) =>
      new Timeline(rotateScale2d, settings(), 1, [c]).entries[0]!.steps.at(-1)!.say;
    // Was "squashed flat onto a line" for both factors 0.
    expect(last(['scale', 0, 0])).toContain('onto a single point');
    expect(last(['scale', 0, 1])).toContain('onto a line');
  });

  it('refuses a transform that leaves the drawing', () => {
    const t = new Timeline(rotateScale2d, settings(), 1, [['scale', 3, 3]]);
    expect(t.endState().pts).toEqual(SHAPES.letter);
  });

  it('matches a homogeneous-matrix reference for any sequence of transforms', () => {
    const op = fc.oneof(
      fc.integer({ min: -36, max: 36 }).map((k) => ['rotate', k * 10] as OpCall),
      fc
        .tuple(fc.integer({ min: -20, max: 20 }), fc.integer({ min: -20, max: 20 }))
        .map(([a, b]) => ['scale', a / 10, b / 10] as OpCall),
      fc
        .tuple(fc.integer({ min: -5, max: 5 }), fc.integer({ min: -5, max: 5 }))
        .map(([x, y]) => ['pivot', x, y] as OpCall),
      fc.constant(['reset'] as OpCall),
    );
    fc.assert(
      fc.property(
        fc.constantFrom<RsSettings['about']>('origin', 'pivot'),
        fc.constantFrom<RsSettings['shape']>('letter', 'house', 'square'),
        fc.array(op, { maxLength: 8 }),
        (about, shape, calls) => {
          const st = settings({ about, shape });
          const t = new Timeline(rotateScale2d, st, 1, calls);
          let ref: M3 = translate(0, 0);
          let pivot = { x: 3, y: 2 };
          let prev = t.initial.state;
          t.entries.forEach((e, k) => {
            const [name, a, b] = calls[k]!;
            const changed = e.end !== prev && e.end.pts !== prev.pts;
            prev = e.end;
            if (name === 'pivot') pivot = { x: a as number, y: b as number };
            if (name === 'reset') ref = translate(0, 0);
            if (!changed || (name !== 'rotate' && name !== 'scale')) return;
            const c = about === 'pivot' ? pivot : { x: 0, y: 0 };
            const th = ((a as number) * Math.PI) / 180;
            const lin: M3 =
              name === 'rotate'
                ? [
                    [Math.cos(th), -Math.sin(th), 0],
                    [Math.sin(th), Math.cos(th), 0],
                    [0, 0, 1],
                  ]
                : [
                    [a as number, 0, 0],
                    [0, b as number, 0],
                    [0, 0, 1],
                  ];
            ref = mul3(translate(c.x, c.y), mul3(lin, mul3(translate(-c.x, -c.y), ref)));
          });
          const s = t.endState();
          const base = SHAPES[shape];
          s.pts.forEach((p, i) => {
            const q = base[i]!;
            expect(p.x).toBeCloseTo(ref[0]![0]! * q.x + ref[0]![1]! * q.y + ref[0]![2]!, 9);
            expect(p.y).toBeCloseTo(ref[1]![0]! * q.x + ref[1]![1]! * q.y + ref[1]![2]!, 9);
            // The page's own running matrix agrees too.
            expect(p.x).toBeCloseTo(s.m[0] * q.x + s.m[1] * q.y + s.t.x, 9);
            expect(Math.abs(p.x)).toBeLessThanOrEqual(10 + 1e-9);
          });
          // Areas scale by det M.
          const d = s.m[0] * s.m[3] - s.m[1] * s.m[2];
          expect(area(s.pts)).toBeCloseTo(d * area(base), 6);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('rounds like the code tabs and parses numbers', () => {
    expect(fixed2(-0.004)).toBe('0.00');
    expect(fixed2(2.5)).toBe('2.50');
    expect(parseNumber('1.5')).toBe(1.5);
    expect(parseNumber('1.25')).toBeInstanceOf(Error);
  });
});

describe('drawn text size', () => {
  // Axis numbers were 11 units: now 13.
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(rotateScale2d, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(rotateScale2d, PHONE_STAGE).px).toBeGreaterThanOrEqual(9.5);
  });
});
