import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import type { Vec } from '../../layouts/plane';
import { parseNumber, rotateTranslate2d } from '.';
import { R, SHAPES, fixed2, type RtSettings } from './model';
import { smallestText } from '../../render/text-size';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';

const settings = (s: Partial<RtSettings> = {}): RtSettings =>
  ({ ...rotateTranslate2d.defaults, ...s }) as RtSettings;

/** Reference: a rigid motion kept as an angle and an offset, updated with plain trigonometry. */
interface Ref {
  deg: number;
  t: Vec;
}
const turn = (deg: number, p: Vec): Vec => {
  const a = (deg * Math.PI) / 180;
  return { x: Math.cos(a) * p.x - Math.sin(a) * p.y, y: Math.sin(a) * p.x + Math.cos(a) * p.y };
};
const place = (r: Ref, p: Vec): Vec => {
  const q = turn(r.deg, p);
  return { x: q.x + r.t.x, y: q.y + r.t.y };
};
const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);

describe('2D rotation and translation', () => {
  it('rotate-then-translate differs from translate-then-rotate', () => {
    const t = new Timeline(rotateTranslate2d, settings(), 1, [['order', 90, 4, 0]]);
    const last = t.entries[0]!.steps.at(-1)!;
    expect(last.vars?.same).toBe('no');
    const { rt, tr } = last.extra!.compare!;
    // A = (1, 1): rotate gives (-1, 1), then slide: (3, 1). Slide first: (5, 1), rotate: (-1, 5).
    expect(rt[0]!.x).toBeCloseTo(3, 12);
    expect(rt[0]!.y).toBeCloseTo(1, 12);
    expect(tr[0]!.x).toBeCloseTo(-1, 12);
    expect(tr[0]!.y).toBeCloseTo(5, 12);
  });

  it('gives the true reason when the two orders agree', () => {
    const say = (c: OpCall) =>
      new Timeline(rotateTranslate2d, settings(), 1, [c]).entries[0]!.steps.at(-1)!.say;
    expect(say(['order', 360, 4, 0])).toContain('a whole number of turns');
    expect(say(['order', 90, 0, 0])).toContain('A zero slide moves nothing');
    // A tiny angle matches to two decimals; it was said to be "a whole number of turns".
    const tiny = say(['order', 0.1, 0.1, 0]);
    expect(tiny).toContain('The two orders agree here.');
    expect(tiny).not.toContain('whole number of turns');
  });

  it('rotating about a point keeps that point fixed', () => {
    const t = new Timeline(rotateTranslate2d, settings(), 1, [['about', 90, 1, 1]]);
    const a = t.endState().pts[0]!;
    expect(a.x).toBeCloseTo(1, 12);
    expect(a.y).toBeCloseTo(1, 12);
  });

  it('the inverse sends every vertex home', () => {
    const t = new Timeline(rotateTranslate2d, settings(), 1, [
      ['rotate', 37],
      ['translate', 3, -2],
      ['about', -50, 2, 2],
      ['invert'],
    ]);
    t.endState().pts.forEach((p, i) => {
      expect(p.x).toBeCloseTo(SHAPES.letter[i]!.x, 9);
      expect(p.y).toBeCloseTo(SHAPES.letter[i]!.y, 9);
    });
  });

  it('refuses a move that leaves the drawing', () => {
    const t = new Timeline(rotateTranslate2d, settings(), 1, [['translate', 12, 0]]);
    expect(t.endState().pts).toEqual(SHAPES.letter);
  });

  it('matches an angle-and-offset reference, and stays rigid, on every step', () => {
    const op = fc.oneof(
      fc.integer({ min: -36, max: 36 }).map((k) => ['rotate', k * 10] as OpCall),
      fc
        .tuple(fc.integer({ min: -40, max: 40 }), fc.integer({ min: -40, max: 40 }))
        .map(([a, b]) => ['translate', a / 10, b / 10] as OpCall),
      fc
        .tuple(
          fc.integer({ min: -36, max: 36 }),
          fc.integer({ min: -5, max: 5 }),
          fc.integer({ min: -5, max: 5 }),
        )
        .map(([a, x, y]) => ['about', a * 10, x, y] as OpCall),
      fc
        .tuple(fc.integer({ min: -36, max: 36 }), fc.integer({ min: -4, max: 4 }))
        .map(([a, x]) => ['order', a * 10, x, 0] as OpCall),
      fc.constant(['invert'] as OpCall),
      fc.constant(['reset'] as OpCall),
    );
    fc.assert(
      fc.property(
        fc.constantFrom<RtSettings['form']>('homogeneous', 'affine'),
        fc.constantFrom<RtSettings['convention']>('column', 'row'),
        fc.constantFrom<RtSettings['shape']>('letter', 'house'),
        fc.array(op, { maxLength: 10 }),
        (form, convention, shape, calls) => {
          const t = new Timeline(
            rotateTranslate2d,
            settings({ form, convention, shape }),
            1,
            calls,
          );
          const base = SHAPES[shape];
          let ref: Ref = { deg: 0, t: { x: 0, y: 0 } };
          let prev = t.initial.state;
          t.entries.forEach((e, k) => {
            const [name, a, b, c] = calls[k]!;
            const changed = e.end !== prev;
            prev = e.end;
            if (changed) {
              if (name === 'rotate')
                ref = { deg: ref.deg + (a as number), t: turn(a as number, ref.t) };
              if (name === 'translate')
                ref = {
                  deg: ref.deg,
                  t: { x: ref.t.x + (a as number), y: ref.t.y + (b as number) },
                };
              if (name === 'about') {
                const cc = { x: b as number, y: c as number };
                const q = turn(a as number, { x: ref.t.x - cc.x, y: ref.t.y - cc.y });
                ref = { deg: ref.deg + (a as number), t: { x: q.x + cc.x, y: q.y + cc.y } };
              }
              if (name === 'invert' || name === 'reset') ref = { deg: 0, t: { x: 0, y: 0 } };
            }
            if (name === 'order') {
              const cmp = e.steps.at(-1)!.extra?.compare;
              if (!cmp) return;
              const tv = { x: b as number, y: c as number };
              const rt: Ref = { deg: ref.deg + (a as number), t: turn(a as number, ref.t) };
              rt.t = { x: rt.t.x + tv.x, y: rt.t.y + tv.y };
              const tr: Ref = {
                deg: ref.deg + (a as number),
                t: turn(a as number, { x: ref.t.x + tv.x, y: ref.t.y + tv.y }),
              };
              base.forEach((p, i) => {
                expect(cmp.rt[i]!.x).toBeCloseTo(place(rt, p).x, 8);
                expect(cmp.tr[i]!.y).toBeCloseTo(place(tr, p).y, 8);
              });
            }
            // Every step: the shape is the reference motion applied to the start shape, it
            // stays on the drawing, and it is rigid (edge lengths kept, det M = 1).
            const s = e.end;
            s.pts.forEach((p, i) => {
              const q = place(ref, base[i]!);
              expect(p.x).toBeCloseTo(q.x, 8);
              expect(p.y).toBeCloseTo(q.y, 8);
              expect(Math.abs(p.x)).toBeLessThanOrEqual(R + 1e-9);
              const j = (i + 1) % base.length;
              expect(dist(p, s.pts[j]!)).toBeCloseTo(dist(base[i]!, base[j]!), 9);
            });
            expect(s.m[0] * s.m[4] - s.m[1] * s.m[3]).toBeCloseTo(1, 9);
            expect([s.m[6], s.m[7], s.m[8]]).toEqual([0, 0, 1]);
          });
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
    expect(smallestText(rotateTranslate2d, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(rotateTranslate2d, PHONE_STAGE).px).toBeGreaterThanOrEqual(9.5);
  });
});
