import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeRng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import { writePoints, type Vec } from '../../layouts/plane';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { kMeans, strips } from '.';
import { mean, nearest, pickByD2, seedPicks, wcss, type KmSettings } from './model';

const dd = (a: Vec, b: Vec) => (a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y);

/** Lloyd's algorithm written independently: whole arrays, plain loops, no steps. */
function reference(pts: Vec[], start: Vec[], empty: 'farthest' | 'stay') {
  let centres = start.map((c) => ({ ...c }));
  let labels: number[] | null = null;
  for (let round = 1; round <= 20; round++) {
    const next = pts.map((p) => {
      let best = 0;
      centres.forEach((c, j) => {
        if (dd(p, c) < dd(p, centres[best]!)) best = j;
      });
      return best;
    });
    if (labels && next.every((l, i) => l === labels![i])) return { centres, labels, round };
    labels = next;
    const lab = labels;
    const moved = centres.map((c, j) => {
      const m = pts.filter((_, i) => lab[i] === j);
      return m.length ? { x: m.reduce((t, p) => t + p.x, 0) / m.length, y: m.reduce((t, p) => t + p.y, 0) / m.length } : null;
    });
    const taken = new Set<number>();
    centres = moved.map((m, j) => {
      if (m) return m;
      if (empty === 'stay') return centres[j]!;
      let far = -1;
      let farD = 0;
      pts.forEach((p, i) => {
        const d = dd(p, moved[lab[i]!]!);
        if (!taken.has(i) && d > farD) {
          far = i;
          farD = d;
        }
      });
      if (far < 0) return centres[j]!;
      taken.add(far);
      return { ...pts[far]! };
    });
  }
  return { centres, labels: labels!, round: 20 };
}

const ptArb = fc.record({ x: fc.integer({ min: 0, max: 10 }), y: fc.integer({ min: 0, max: 10 }) });
const settingsArb = fc.record({
  k: fc.integer({ min: 1, max: 5 }),
  seeding: fc.constantFrom('plus' as const, 'random' as const),
  empty: fc.constantFrom('farthest' as const, 'stay' as const),
});

describe('k-means', () => {
  it('matches an independent Lloyd from centres placed by hand', () => {
    fc.assert(
      fc.property(
        fc.array(ptArb, { minLength: 1, maxLength: 12 }),
        fc.array(ptArb, { minLength: 1, maxLength: 5 }),
        fc.constantFrom('farthest' as const, 'stay' as const),
        (pts, start, empty) => {
          const settings: KmSettings = { k: 3, seeding: 'plus', empty };
          const t = new Timeline(kMeans, settings, 1, [
            ['load', writePoints(pts)],
            ['place', writePoints(start)],
            ['run'],
          ]);
          const s = t.endState();
          const ref = reference(pts, start, empty);
          expect(s.assign).toEqual(ref.labels);
          s.centres.forEach((c, j) => {
            expect(c.x).toBeCloseTo(ref.centres[j]!.x, 12);
            expect(c.y).toBeCloseTo(ref.centres[j]!.y, 12);
          });
          if (s.converged) expect(s.round).toBe(ref.round);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('keeps its invariants on every step of random runs', () => {
    fc.assert(
      fc.property(
        fc.array(ptArb, { minLength: 1, maxLength: 12 }),
        settingsArb,
        fc.integer({ min: 1, max: 1000 }),
        (pts, settings, seed) => {
          const t = new Timeline(kMeans, settings, seed, [['load', writePoints(pts)], ['run']]);
          let last = Infinity;
          for (const e of t.entries)
            for (const step of e.steps) {
              const s = step.state;
              expect(s.assign).toHaveLength(s.points.length);
              // WCSS never goes up, once every point has a cluster.
              if (s.assign.every((a) => a !== null) && s.centres.length) {
                const w = wcss(s);
                if (step.lines.includes('aret') || step.lines.includes('uret')) {
                  expect(w).toBeLessThanOrEqual(last + 1e-9);
                  last = w;
                }
              }
            }
          const s = t.endState();
          if (pts.length < settings.k) {
            expect(s.centres).toHaveLength(0);
            return;
          }
          expect(s.centres).toHaveLength(settings.k);
          if (!s.converged) return;
          // At the end every point is with its nearest centre, and every centre with points is
          // their mean.
          s.points.forEach((p, i) => expect(s.assign[i]).toBe(nearest(p, s.centres).best));
          s.centres.forEach((c, j) => {
            const members = s.points.filter((_, i) => s.assign[i] === j);
            if (members.length) expect(c).toMatchObject(mean(members));
          });
        },
      ),
      { numRuns: 100 },
    );
  });

  it('seeds from distinct points, and k-means++ never picks a point already a centre', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(ptArb, { minLength: 5, maxLength: 12, selector: (p) => `${p.x},${p.y}` }),
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 1, max: 1000 }),
        (pts, k, seed) => {
          const rng = makeRng(seed);
          const us = Array.from({ length: k }, () => rng.next());
          for (const mode of ['plus', 'random'] as const) {
            const picks = seedPicks(pts, k, mode, us).map((d) => d.pick);
            expect(new Set(picks).size).toBe(k);
          }
        },
      ),
    );
  });

  it('draws by D² as the running total says', () => {
    // D² = 0, 4, 1, 9: running totals 0, 4, 5, 14.
    expect(pickByD2([0, 4, 1, 9], 0).pick).toBe(1);
    expect(pickByD2([0, 4, 1, 9], 0.3).pick).toBe(2); // target 4.2
    expect(pickByD2([0, 4, 1, 9], 0.5).pick).toBe(3); // target 7
    expect(pickByD2([0, 4, 1, 9], 0.999).pick).toBe(3);
  });

  it('tells the story the examples tell', () => {
    const run = (id: string) => {
      const ex = kMeans.examples.find((e) => e.id === id)!;
      return new Timeline(kMeans, { ...kMeans.defaults, ...ex.settings } as KmSettings, ex.seed, ex.ops).endState();
    };
    expect(wcss(run('three-groups'))).toBeCloseTo(28 / 3, 9);
    expect(wcss(run('plus-spreads'))).toBeCloseTo(28 / 3, 9);
    expect(wcss(run('bad-start'))).toBeCloseTo(63.5, 9);
    expect(wcss(run('by-hand'))).toBeCloseTo(6, 9);
    expect(wcss(run('too-many-centres'))).toBeLessThan(28 / 3);
    const strip = run('long-strips');
    expect(wcss(strip)).toBe(59);
    // Left against right beats top against bottom (140): k-means minimizes WCSS, not "shape".
    expect(strip.centres.map((c) => c.y)).toEqual([4.5, 4.5]);
    const jump = run('empty-cluster');
    const stay = run('empty-stays');
    expect(stay.assign.filter((a) => a === 2)).toHaveLength(0);
    expect(jump.assign.filter((a) => a === 2).length).toBeGreaterThan(0);
    expect(wcss(jump)).toBeLessThan(wcss(stay));
  });

  it('makes presets of the size asked', () => {
    for (const n of [6, 9, 12]) expect(strips(makeRng(n), n)).toHaveLength(n);
  });

  it('stays readable on a laptop and a phone', () => {
    expect(smallestText(kMeans, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(kMeans, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
