import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { smallestText } from '../../render/text-size';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { det3, project, type Vec3 } from '../../layouts/space';
import { parseNumber, rotateScale3d } from '.';
import { R, SHAPES, fixed2, type Rs3Settings } from './model';

const settings = (s: Partial<Rs3Settings> = {}): Rs3Settings =>
  ({ ...rotateScale3d.defaults, ...s }) as Rs3Settings;

/** Reference: turn a point about an axis with Rodrigues' formula, no matrices. */
function turn(p: Vec3, axis: 'x' | 'y' | 'z', deg: number): Vec3 {
  const k = { x: axis === 'x' ? 1 : 0, y: axis === 'y' ? 1 : 0, z: axis === 'z' ? 1 : 0 };
  const t = (deg * Math.PI) / 180;
  const c = Math.cos(t);
  const s = Math.sin(t);
  const kxp = { x: k.y * p.z - k.z * p.y, y: k.z * p.x - k.x * p.z, z: k.x * p.y - k.y * p.x };
  const kp = k.x * p.x + k.y * p.y + k.z * p.z;
  return {
    x: p.x * c + kxp.x * s + k.x * kp * (1 - c),
    y: p.y * c + kxp.y * s + k.y * kp * (1 - c),
    z: p.z * c + kxp.z * s + k.z * kp * (1 - c),
  };
}
const dist = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const close = (a: Vec3, b: Vec3, digits = 8) => {
  expect(a.x).toBeCloseTo(b.x, digits);
  expect(a.y).toBeCloseTo(b.y, digits);
  expect(a.z).toBeCloseTo(b.z, digits);
};

describe('3D rotation and scale', () => {
  it('a quarter turn about z sends (x, y, z) to (-y, x, z)', () => {
    const t = new Timeline(rotateScale3d, settings(), 1, [['rotateZ', 90]]);
    t.endState().pts.forEach((p, i) => {
      const q = SHAPES.cube.pts[i]!;
      close(p, { x: -q.y, y: q.x, z: q.z }, 12);
    });
  });

  it('rotations about x and y do not commute, except for half turns', () => {
    const same = (deg: number) =>
      new Timeline(rotateScale3d, settings(), 1, [['order', deg]]).entries[0]!.steps.at(-1)!.vars
        ?.same;
    expect(same(90)).toBe('no');
    expect(same(180)).toBe('yes');
    expect(same(360)).toBe('yes');
  });

  it('refuses a scale that leaves the drawing', () => {
    const t = new Timeline(rotateScale3d, settings(), 1, [['scale', 3, 3, 3]]);
    expect(t.endState().pts).toEqual(SHAPES.cube.pts);
  });

  it('refuses the first scale of the too-big example and applies the second', () => {
    // The second scale was 1.5, which also leaves the drawing: (3, 3, 3) is 5.2 from the origin.
    const ex = rotateScale3d.examples.find((e) => e.id === 'too-big')!;
    const t = new Timeline(rotateScale3d, settings(), 1, ex.ops);
    expect(t.entries[0]!.end).toBe(t.initial.state);
    expect(t.entries[1]!.end.transforms).toBe(1);
  });

  it('projects with z up in both views', () => {
    for (const kind of ['isometric', 'oblique'] as const) {
      expect(project({ x: 0, y: 0, z: 1 }, kind).y).toBeGreaterThan(0);
      expect(project({ x: 0, y: 0, z: 1 }, kind).x).toBeCloseTo(0, 12);
    }
  });

  it('matches a point-by-point reference on every step', () => {
    const op = fc.oneof(
      fc
        .tuple(fc.constantFrom('rotateX', 'rotateY', 'rotateZ'), fc.integer({ min: -36, max: 36 }))
        .map(([name, k]) => [name, k * 10] as OpCall),
      fc
        .tuple(
          fc.integer({ min: -20, max: 20 }),
          fc.integer({ min: -20, max: 20 }),
          fc.integer({ min: -20, max: 20 }),
        )
        .map(([a, b, c]) => ['scale', a / 10, b / 10, c / 10] as OpCall),
      fc.integer({ min: -36, max: 36 }).map((k) => ['order', k * 10] as OpCall),
      fc.constant(['reset'] as OpCall),
    );
    fc.assert(
      fc.property(
        fc.constantFrom<Rs3Settings['projection']>('isometric', 'oblique'),
        fc.constantFrom<Rs3Settings['convention']>('column', 'row'),
        fc.constantFrom<Rs3Settings['shape']>('cube', 'wedge'),
        fc.array(op, { maxLength: 8 }),
        (projection, convention, shape, calls) => {
          const t = new Timeline(
            rotateScale3d,
            settings({ projection, convention, shape }),
            1,
            calls,
          );
          const base = SHAPES[shape].pts;
          let ref: Vec3[] = base;
          let vol = 1;
          let prev = t.initial.state;
          t.entries.forEach((e, k) => {
            const [name, a, b, c] = calls[k]!;
            const changed = e.end !== prev;
            const before = ref;
            prev = e.end;
            if (changed && name.startsWith('rotate')) {
              const axis = name.slice(-1).toLowerCase() as 'x' | 'y' | 'z';
              ref = ref.map((p) => turn(p, axis, a as number));
              // A rotation keeps every edge length.
              for (const [i, j] of SHAPES[shape].edges)
                expect(dist(e.end.pts[i]!, e.end.pts[j]!)).toBeCloseTo(
                  dist(before[i]!, before[j]!),
                  8,
                );
            }
            if (changed && name === 'scale') {
              const [sx, sy, sz] = [a, b, c] as number[];
              ref = ref.map((p) => ({ x: p.x * sx!, y: p.y * sy!, z: p.z * sz! }));
              vol *= sx! * sy! * sz!;
            }
            if (changed && name === 'reset') {
              ref = base;
              vol = 1;
            }
            if (name === 'order') {
              const cmp = e.steps.at(-1)!.extra?.compare;
              if (cmp) {
                cmp.xy.forEach((p, i) =>
                  close(p, turn(turn(ref[i]!, 'x', a as number), 'y', a as number), 7),
                );
                cmp.yx.forEach((p, i) =>
                  close(p, turn(turn(ref[i]!, 'y', a as number), 'x', a as number), 7),
                );
              }
            }
            e.end.pts.forEach((p, i) => {
              close(p, ref[i]!, 7);
              expect(Math.hypot(p.x, p.y, p.z)).toBeLessThanOrEqual(R + 1e-9);
            });
            expect(det3(e.end.m)).toBeCloseTo(vol, 7);
          });
        },
      ),
      { numRuns: 300 },
    );
  });

  it('rounds like the code tabs and parses numbers', () => {
    expect(fixed2(-0.004)).toBe('0.00');
    expect(fixed2(1.005 + 1e-9)).toBe('1.01');
    expect(parseNumber('1.5')).toBe(1.5);
    expect(parseNumber('1.25')).toBeInstanceOf(Error);
  });
});

describe('drawn text size', () => {
  // Vector labels were 12 units (10.9 px on a laptop): now 14.
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(rotateScale3d, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(rotateScale3d, PHONE_STAGE).px).toBeGreaterThanOrEqual(11);
  });
});
