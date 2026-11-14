import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import { writePoints, type Vec } from '../../layouts/plane';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { cell } from '../_retrieve3/cells';
import { ivfIndex } from '.';
import { K, type IvfSettings, type IvfState, type SearchDone } from './model';

/** Written independently of the page: plain loops, full sorts. */
const sq = (a: Vec, b: Vec) => (a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y);
function closest(p: Vec, cs: Vec[]) {
  let best = 0;
  cs.forEach((c, j) => {
    if (sq(p, c) < sq(p, cs[best]!)) best = j;
  });
  return best;
}

/** Lloyd's algorithm from the seeds: assign, move to the mean (an empty centre jumps). */
function lloyd(pts: Vec[], start: Vec[]): Vec[] {
  let cs = start.map((c) => ({ ...c }));
  let labels: number[] | null = null;
  for (let round = 0; round < 20; round++) {
    const next = pts.map((p) => closest(p, cs));
    if (labels && next.every((l, i) => l === labels![i])) break;
    labels = next;
    const moved = cs.map((c, j) => {
      const mine = pts.filter((_, i) => next[i] === j);
      if (!mine.length) return c;
      let x = 0;
      let y = 0;
      for (const p of mine) {
        x += p.x;
        y += p.y;
      }
      return { x: x / mine.length, y: y / mine.length };
    });
    const taken = new Set<number>();
    cs.forEach((_, j) => {
      if (next.some((l) => l === j)) return;
      let far = -1;
      let farD = 0;
      pts.forEach((p, i) => {
        const d = sq(p, moved[next[i]!]!);
        if (!taken.has(i) && d > farD) {
          far = i;
          farD = d;
        }
      });
      if (far >= 0) {
        taken.add(far);
        moved[j] = { ...pts[far]! };
      }
    });
    cs = moved;
  }
  return cs;
}

function reference(pts: Vec[], cs: Vec[], q: Vec, nprobe: number) {
  const lists = cs.map((_, j) => pts.flatMap((p, i) => (closest(p, cs) === j ? [i] : [])));
  const order = cs
    .map((c, j) => ({ d: sq(q, c), j }))
    .sort((a, b) => a.d - b.d || a.j - b.j)
    .map((o) => o.j);
  const pool = order.slice(0, nprobe).flatMap((j) => lists[j]!);
  const found = pool
    .map((i) => ({ d: sq(q, pts[i]!), i }))
    .sort((a, b) => a.d - b.d || a.i - b.i)
    .slice(0, K)
    .map((o) => o.i);
  const truth = pts
    .map((p, i) => ({ d: sq(q, p), i }))
    .sort((a, b) => a.d - b.d || a.i - b.i)
    .slice(0, K)
    .map((o) => o.i);
  return { lists, order, found, truth, dists: cs.length + pool.length };
}

const ptArb = fc.record({ x: fc.integer({ min: 0, max: 10 }), y: fc.integer({ min: 0, max: 10 }) });
const ptsArb = fc.array(ptArb, { minLength: 1, maxLength: 12 });
const settingsArb = fc.record({
  lists: fc.integer({ min: 1, max: 5 }),
  nprobe: fc.integer({ min: 1, max: 5 }),
});

describe('ivf-index', () => {
  it('trains and searches as an independent reference does', () => {
    fc.assert(
      fc.property(
        ptsArb,
        fc.array(ptArb, { minLength: 1, maxLength: 3 }),
        settingsArb,
        fc.integer({ min: 1, max: 1000 }),
        (pts, qs, set, seed) => {
          const settings: IvfSettings = { ...set };
          const t = new Timeline(ivfIndex, settings, seed, [
            ['load', writePoints(pts)],
            ['train'],
            ...qs.map((q) => ['search', `${q.x},${q.y}`] as [string, string]),
          ]);
          const trained = t.entries[1]!.end;
          if (pts.length < set.lists) {
            expect(trained.centres).toEqual([]);
            return;
          }
          // k-means++ seeds are points; Lloyd's algorithm from them gives the same centres.
          expect(trained.seeds).toHaveLength(set.lists);
          const cs = lloyd(
            pts,
            trained.seeds.map((i) => pts[i]!),
          );
          trained.centres.forEach((c, j) => {
            expect(c.x).toBe(cs[j]!.x);
            expect(c.y).toBe(cs[j]!.y);
          });
          t.entries.slice(2).forEach((e, i) => {
            const ref = reference(pts, cs, qs[i]!, set.nprobe);
            const last = e.end.last as SearchDone;
            expect(e.end.lists).toEqual(ref.lists);
            expect(last.order).toEqual(ref.order);
            expect(last.found).toEqual(ref.found);
            expect(last.truth).toEqual(ref.truth);
            expect(last.dists).toBe(ref.dists);
          });
        },
      ),
      { numRuns: 200 },
    );
  });

  it('keeps its invariants on every step of random runs', () => {
    fc.assert(
      fc.property(
        ptsArb,
        settingsArb,
        ptArb,
        fc.integer({ min: 1, max: 1000 }),
        (pts, set, q, seed) => {
          const t = new Timeline(ivfIndex, { ...set }, seed, [
            ['load', writePoints(pts)],
            ['train'],
            ['search', `${q.x},${q.y}`],
          ]);
          const trained = t.entries[1]!.end as IvfState;
          for (const e of t.entries)
            for (const step of e.steps) {
              const s = step.state;
              // Every point is in at most one list; once trained, in exactly one.
              const all = s.lists.flat();
              expect(new Set(all).size).toBe(all.length);
              if (s === trained && s.centres.length) {
                expect(all.sort((a, b) => a - b)).toEqual(pts.map((_, i) => i));
                // Each point sits in its centre's cell.
                s.lists.forEach((l, j) => {
                  for (const i of l) {
                    const d = s.centres.map((c) => sq(pts[i]!, c));
                    expect(d[j]).toBe(Math.min(...d));
                  }
                });
              }
              const x = step.extra;
              if (x?.top) {
                expect(x.top.length).toBeLessThanOrEqual(K);
                expect(x.dists).toBe(s.centres.length + (x.scanned?.length ?? 0));
              }
            }
          const last = t.endState().last;
          if (!last) return;
          const probed = new Set(last.probed.flatMap((j) => trained.lists[j]!));
          for (const i of last.found) expect(probed.has(i)).toBe(true);
          expect(last.found.length).toBe(Math.min(K, probed.size));
          // Searching every list is exact.
          if (set.nprobe >= trained.centres.length) expect(last.found).toEqual(last.truth);
        },
      ),
      { numRuns: 120 },
    );
  });

  it('draws cells that cover the window, each around its own centre', () => {
    const cs = [
      { x: 2, y: 2.5 },
      { x: 7.5, y: 2.75 },
      { x: 4.75, y: 8 },
    ];
    const box = { xmin: 0, xmax: 10, ymin: 0, ymax: 10 };
    let area = 0;
    cs.forEach((c, j) => {
      const poly = cell(cs, j, box);
      let a = 0;
      poly.forEach((p, i) => {
        const r = poly[(i + 1) % poly.length]!;
        a += p.x * r.y - r.x * p.y;
      });
      area += Math.abs(a) / 2;
      // Every corner of the cell is no nearer to another centre.
      for (const p of poly)
        for (const o of cs) expect(sq(p, c)).toBeLessThanOrEqual(sq(p, o) + 1e-9);
    });
    expect(area).toBeCloseTo(100, 9);
  });

  it('tells the story the examples tell', () => {
    const run = (id: string) => {
      const ex = ivfIndex.examples.find((e) => e.id === id)!;
      return new Timeline(
        ivfIndex,
        { ...ivfIndex.defaults, ...ex.settings } as IvfSettings,
        ex.seed,
        ex.ops,
      ).endState().last as SearchDone;
    };
    const miss = run('across-the-border');
    const two = run('two-probes');
    const every = run('every-list');
    expect(miss.truth[0]).not.toBe(miss.found[0]);
    expect(miss.dists).toBe(7);
    expect(two.found).toEqual(two.truth);
    expect(two.dists).toBe(11);
    expect(every.dists).toBe(15);
    expect(run('crowded-list').dists).toBe(12);
    expect(run('one-list').dists).toBe(13);
  });

  it('stays readable on a laptop and a phone', () => {
    expect(smallestText(ivfIndex, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(ivfIndex, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
