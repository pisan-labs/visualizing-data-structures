import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeRng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { gradientDescent } from '.';
import {
  BETA1,
  BETA2,
  defaults,
  LEARNING_RATES,
  MAX_STEPS,
  parsePoint,
  RUN_STEPS,
  TOL,
  type GdSettings,
  type Method,
} from './model';
import { far, SURFACE_IDS, SURFACES, type SurfaceId } from './surfaces';

/**
 * The three methods written apart from the page: plain loops, and Adam's bias correction with
 * Math.pow instead of running products.
 */
function reference(settings: GdSettings, start: number[], steps: number): number[][] {
  const sf = SURFACES[settings.surface];
  const lr = Number(settings.lr);
  const b1 = Number(settings.beta1);
  const b2 = Number(settings.beta2);
  let x = [...start];
  const v = x.map(() => 0);
  const m = x.map(() => 0);
  const s = x.map(() => 0);
  const out: number[][] = [];
  for (let t = 1; t <= steps; t++) {
    const g = sf.grad(x);
    if (settings.method === 'gd') x = x.map((xi, i) => xi - lr * g[i]!);
    else if (settings.method === 'momentum') {
      for (let i = 0; i < x.length; i++) v[i] = b1 * v[i]! - lr * g[i]!;
      x = x.map((xi, i) => xi + v[i]!);
    } else {
      for (let i = 0; i < x.length; i++) {
        m[i] = b1 * m[i]! + (1 - b1) * g[i]!;
        s[i] = b2 * s[i]! + (1 - b2) * g[i]! ** 2;
      }
      const c1 = settings.bias ? 1 - b1 ** t : 1;
      const c2 = settings.bias ? 1 - b2 ** t : 1;
      x = x.map((xi, i) => xi - (lr * (m[i]! / c1)) / (Math.sqrt(s[i]! / c2) + 1e-8));
    }
    out.push(x);
    if (far(sf, x)) break;
  }
  return out;
}

const settingsArb: fc.Arbitrary<GdSettings> = fc.record({
  surface: fc.constantFrom(...SURFACE_IDS),
  method: fc.constantFrom<Method>('gd', 'momentum', 'adam'),
  lr: fc.constantFrom(...LEARNING_RATES),
  beta1: fc.constantFrom(...BETA1),
  beta2: fc.constantFrom(...BETA2),
  bias: fc.boolean(),
});

const startArb = (surface: SurfaceId) => {
  const sf = SURFACES[surface];
  const coord = ([lo, hi]: [number, number]) =>
    fc.integer({ min: lo * 4, max: hi * 4 }).map((k) => k / 4);
  return sf.dims === 1 ? coord(sf.xr).map((x) => [x]) : fc.tuple(coord(sf.xr), coord(sf.yr));
};

const run = (settings: GdSettings, start: string, ops: string[]) =>
  new Timeline(gradientDescent, settings, 1, [
    ['start', start],
    ...ops.map((o) => [o] as [string]),
  ]);

describe('gradient-descent', () => {
  it('matches an independent reference for every method and setting', () => {
    fc.assert(
      fc.property(
        settingsArb.chain((s) => fc.tuple(fc.constant(s), startArb(s.surface))),
        ([settings, start]) => {
          const t = run(settings, start.join(', '), ['run']);
          const path = t.endState().path.slice(1);
          const ref = reference(settings, start, path.length);
          expect(path).toHaveLength(ref.length);
          // Plain and momentum steps are the same arithmetic, so they agree exactly. Adam's
          // powers differ from running products in the last bits, which a long unstable run
          // magnifies: compare its first 8 steps.
          path
            .slice(0, settings.method === 'adam' ? 8 : undefined)
            .forEach((p, k) =>
              p.forEach((v, i) =>
                settings.method === 'adam'
                  ? expect(Math.abs(v - ref[k]![i]!)).toBeLessThan(1e-9 * Math.max(1, Math.abs(v)))
                  : expect(v).toBe(ref[k]![i]),
              ),
            );
        },
      ),
      { numRuns: 300 },
    );
  });

  it('keeps its invariants on every step of random runs', () => {
    fc.assert(
      fc.property(
        settingsArb.chain((s) => fc.tuple(fc.constant(s), startArb(s.surface))),
        fc.array(fc.constantFrom('step', 'run'), { minLength: 1, maxLength: 5 }),
        ([settings, start], ops) => {
          const t = run(settings, start.join(', '), ops);
          const sf = SURFACES[settings.surface];
          for (const e of t.entries) {
            for (const step of e.steps) {
              const s = step.state;
              expect(s.path).toHaveLength(s.t + 1);
              expect(s.path[s.t]).toEqual(s.x);
              expect(s.t).toBeLessThanOrEqual(MAX_STEPS);
            }
            const s = e.end;
            if (s.status === 'diverged') expect(far(sf, s.x)).toBe(true);
            if (s.status === 'converged') {
              const g = sf.grad(s.x);
              expect(Math.hypot(...g)).toBeLessThan(TOL);
            }
            // A run stops early only when the run has ended.
            const before = t.entries[t.entries.indexOf(e) - 1]?.end ?? t.initial.state;
            if (e.call[0] === 'run' && s.status === 'ready' && before.status === 'ready')
              expect(s.t - before.t).toBe(Math.min(RUN_STEPS, MAX_STEPS - before.t));
          }
        },
      ),
      { numRuns: 120 },
    );
  });

  it('follows (1 − 2η)ᵗ on x² with plain steps', () => {
    for (const lr of ['0.1', '0.3', '0.9', '1', '1.1']) {
      const t = run({ ...defaults, lr }, '3', ['run']);
      t.endState().path.forEach((p, k) =>
        expect(p[0]).toBeCloseTo(3 * (1 - 2 * Number(lr)) ** k, 9),
      );
    }
  });

  it('has gradients that match the slopes of the losses', () => {
    const rng = makeRng(5);
    for (const sf of Object.values(SURFACES))
      for (let k = 0; k < 20; k++) {
        const p = [sf.xr, sf.yr].slice(0, sf.dims).map(([lo, hi]) => lo + rng.next() * (hi - lo));
        const g = sf.grad(p);
        p.forEach((_, i) => {
          const h = 1e-6;
          const up = [...p];
          const down = [...p];
          up[i]! += h;
          down[i]! -= h;
          expect(g[i]!).toBeCloseTo((sf.f(up) - sf.f(down)) / (2 * h), 4);
        });
      }
  });

  it('draws contours on their levels and marks the true minimum', () => {
    for (const sf of Object.values(SURFACES)) {
      if (sf.dims === 2)
        for (const c of sf.levels!)
          for (let k = 0; k < 12; k++) expect(sf.f(sf.contour!(c, k / 2))).toBeCloseTo(c, 9);
      expect(Math.hypot(...sf.grad(sf.min))).toBeLessThan(0.01);
    }
  });

  it('tells the story the examples tell', () => {
    const end = (s: Partial<GdSettings>, start: string, ops: string[]) =>
      run({ ...defaults, ...s } as GdSettings, start, ops).endState();
    expect(end({}, '3', ['run'])).toMatchObject({ status: 'converged', t: 29 });
    expect(end({ lr: '0.01' }, '3', ['run']).x[0]).toBeCloseTo(3 * 0.98 ** 50, 9);
    expect(end({ lr: '1' }, '3', ['run'])).toMatchObject({ status: 'ready', x: [3] });
    expect(end({ lr: '1.1' }, '3', ['run'])).toMatchObject({ status: 'diverged', t: 10 });
    const narrow = { surface: 'narrow' as const };
    expect(end({ ...narrow, lr: '0.19' }, '-3.5, 1', ['run', 'run']).t).toBe(66);
    expect(end({ ...narrow, lr: '0.15' }, '-3.5, 1', ['run']).t).toBe(37);
    expect(end({ ...narrow, lr: '0.21' }, '-3.5, 1', ['run'])).toMatchObject({
      status: 'diverged',
      t: 19,
    });
    expect(
      end({ ...narrow, method: 'momentum', lr: '0.1', beta1: '0.5' }, '-3.5, 1', ['run']).t,
    ).toBe(19);
    const adam = end({ ...narrow, method: 'adam' }, '-3.5, 1', ['step']).x;
    expect(adam[0]).toBeCloseTo(-3.4, 6);
    expect(adam[1]).toBeCloseTo(0.9, 6);
    const raw = end({ ...narrow, method: 'adam', bias: false }, '-3.5, 1', ['step']).x;
    expect(raw[0]! + 3.5).toBeCloseTo(0.1 * (0.1 / Math.sqrt(0.001)), 6);
    const wells = { surface: 'wells' as const };
    expect(end(wells, '2.5', ['run']).x[0]).toBeCloseTo(1.33, 2);
    expect(
      end({ ...wells, method: 'momentum', lr: '0.05' }, '2.5', ['run', 'run']).x[0],
    ).toBeCloseTo(-1.48, 2);
    expect(end({ lr: '0.1', method: 'momentum' }, '3', ['run', 'run']).t).toBe(99);
    expect(end({ surface: 'valley', method: 'adam' }, '-1.5, 2', ['run', 'run'])).toMatchObject({
      status: 'converged',
      t: 92,
    });
    expect(end({ surface: 'valley', lr: '0.05' }, '-1.5, 2', ['run'])).toMatchObject({
      status: 'diverged',
      t: 5,
    });
  });

  it('parses points and refuses what does not fit', () => {
    expect(parsePoint('(−3.5, 1)')).toEqual([-3.5, 1]);
    expect(parsePoint('2')).toEqual([2]);
    for (const bad of ['', 'a', '1 2 3', '1.234', '--1'])
      expect(parsePoint(bad)).toBeInstanceOf(Error);
    const said = (start: string, s: Partial<GdSettings> = {}) =>
      run({ ...defaults, ...s } as GdSettings, start, []).at(1).step.say;
    expect(said('1, 2')).toContain('one variable');
    expect(said('1', { surface: 'narrow' })).toContain('two variables');
    expect(said('9')).toContain('inside the plot');
  });

  it('stays readable on a laptop and a phone', () => {
    expect(smallestText(gradientDescent, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(gradientDescent, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
