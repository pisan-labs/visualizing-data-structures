import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeRng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { writePoints } from '../../layouts/plane';
import { kMeans } from '../k-means';
import type { KmState } from '../k-means/model';
import { productQuantization as pq } from '.';
import { lloyd, seedPlus } from './kmeans';
import { decode, K, writeVectors, type PqSearch, type PqSettings, type PqState } from './model';

/** Written independently of the page: plain loops over arrays. */
const sq = (a: number[], b: number[]) => a.reduce((t, x, i) => t + (x - b[i]!) ** 2, 0);
const argmin = (xs: number[]) => xs.reduce((best, x, i) => (x < xs[best]! ? i : best), 0);

function referenceTrain(vs: number[][], m: number, ks: number, draws: number[]) {
  const w = 4 / m;
  return Array.from({ length: m }, (_, j) => {
    const sub = vs.map((v) => v.slice(j * w, (j + 1) * w));
    const us = draws.slice(j * ks, (j + 1) * ks);
    // k-means++ by the page's rule.
    const chosen: number[] = [];
    for (const u of us) {
      const dd = sub.map((p) =>
        chosen.length ? Math.min(...chosen.map((c) => sq(p, sub[c]!))) : 0,
      );
      const total = dd.reduce((a, b) => a + b, 0);
      if (chosen.length && total > 0) {
        let run = 0;
        chosen.push(dd.findIndex((x) => (run += x) > u * total));
      } else {
        const pool = sub.map((_, i) => i).filter((i) => !chosen.includes(i));
        chosen.push(pool[Math.floor(u * pool.length)]!);
      }
    }
    let cs = chosen.map((i) => [...sub[i]!]);
    let labels: number[] = [];
    for (let r = 0; r < 20; r++) {
      const next = sub.map((p) => argmin(cs.map((c) => sq(p, c))));
      if (r > 0 && next.every((l, i) => l === labels[i])) break;
      labels = next;
      const moved = cs.map((c, k) => {
        const mine = sub.filter((_, i) => labels[i] === k);
        return mine.length ? c.map((_, d) => mine.reduce((t, p) => t + p[d]!, 0) / mine.length) : c;
      });
      const taken = new Set<number>();
      cs.forEach((_, k) => {
        if (labels.includes(k)) return;
        let far = -1;
        let farD = 0;
        sub.forEach((p, i) => {
          const d = sq(p, moved[labels[i]!]!);
          if (!taken.has(i) && d > farD) {
            far = i;
            farD = d;
          }
        });
        if (far >= 0) {
          taken.add(far);
          moved[k] = [...sub[far]!];
        }
      });
      cs = moved;
    }
    return cs;
  });
}

const vecArb = fc.array(fc.integer({ min: 0, max: 10 }), { minLength: 4, maxLength: 4 });
const vecsArb = fc.array(vecArb, { minLength: 1, maxLength: 10 });
const settingsArb = fc.record({
  pieces: fc.constantFrom('1' as const, '2' as const, '4' as const),
  size: fc.constantFrom('2' as const, '4' as const, '8' as const),
});

describe('product-quantization', () => {
  it('trains, encodes and searches as an independent reference does', () => {
    fc.assert(
      fc.property(
        vecsArb,
        vecArb,
        settingsArb,
        fc.integer({ min: 1, max: 1000 }),
        (vs, q, set, seed) => {
          const settings: PqSettings = { ...set };
          const t = new Timeline(pq, settings, seed, [
            ['load', writeVectors(vs)],
            ['train'],
            ['encode'],
            ['search', q.join(',')],
          ]);
          const trained = t.entries[1]!.end;
          const m = Number(set.pieces);
          const ks = Number(set.size);
          if (vs.length < ks) {
            expect(trained.books).toEqual([]);
            return;
          }
          const books = referenceTrain(vs, m, ks, trained.draws);
          trained.books.forEach((b, j) =>
            b.forEach((c, k) => c.forEach((x, d) => expect(x).toBeCloseTo(books[j]![k]![d]!, 9))),
          );
          const s = t.endState();
          const w = 4 / m;
          vs.forEach((v, i) => {
            // The code is the nearest centre of each piece.
            const code = books.map((b, j) =>
              argmin(b.map((c) => sq(v.slice(j * w, (j + 1) * w), c))),
            );
            expect(s.codes![i]).toEqual(code);
            // The table's distance is the exact distance from q to the reconstruction.
            const rec = code.flatMap((c, j) => books[j]![c]!);
            expect(s.last!.approx[i]).toBeCloseTo(sq(q, rec), 9);
            expect(s.last!.exact[i]).toBe(sq(q, v));
          });
          const order = (ds: number[]) =>
            ds
              .map((d, i) => [d, i])
              .sort((a, b) => a[0]! - b[0]! || a[1]! - b[1]!)
              .slice(0, K)
              .map(([, i]) => i);
          expect(s.last!.found).toEqual(order(s.last!.approx));
          expect(s.last!.truth).toEqual(order(s.last!.exact));
        },
      ),
      { numRuns: 200 },
    );
  });

  it('finds the same codebook as the k-means page on pieces of two numbers', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(vecArb, { minLength: 4, maxLength: 10, selector: (v) => v.join() }),
        fc.integer({ min: 1, max: 1000 }),
        (vs, seed) => {
          const pts = vs.map((v) => ({ x: v[0]!, y: v[1]! }));
          const t = new Timeline(kMeans, { k: 4, seeding: 'plus', empty: 'farthest' }, seed, [
            ['load', writePoints(pts)],
            ['run'],
          ]);
          const km = t.endState() as KmState;
          const draws = t.entries[1]!.steps.flatMap((st) =>
            st.extra?.draw && st.extra.draw.pick >= 0 ? [st.extra.draw.u] : [],
          );
          const sub = vs.map((v) => [v[0]!, v[1]!]);
          const ours = lloyd(
            sub,
            seedPlus(sub, draws).map((i) => sub[i]!),
          );
          expect(ours.centres).toEqual(km.centres.map((c) => [c.x, c.y]));
          expect(ours.rounds).toBe(km.round);
        },
      ),
      { numRuns: 150 },
    );
  });

  it('keeps its invariants on every step of random runs', () => {
    fc.assert(
      fc.property(
        vecsArb,
        vecArb,
        settingsArb,
        fc.integer({ min: 1, max: 1000 }),
        (vs, q, set, seed) => {
          const t = new Timeline(pq, { ...set }, seed, [
            ['load', writeVectors(vs)],
            ['train'],
            ['encode'],
            ['search', q.join(',')],
          ]);
          for (const e of t.entries)
            for (const step of e.steps) {
              const s = step.state as PqState;
              if (s.books.length) {
                // Training fills the codebooks one piece at a time.
                expect(s.books.length).toBeLessThanOrEqual(s.m);
                if (s.codes) expect(s.books).toHaveLength(s.m);
                for (const b of s.books) {
                  expect(b).toHaveLength(s.ks);
                  for (const c of b) expect(c).toHaveLength(4 / s.m);
                }
              }
              for (const code of s.codes ?? []) {
                expect(code).toHaveLength(s.m);
                for (const c of code) expect(c >= 0 && c < s.ks).toBe(true);
              }
              const tab = step.extra?.table;
              if (tab)
                for (const row of tab) for (const x of row) expect(x).toBeGreaterThanOrEqual(0);
            }
          const s = t.endState();
          const last = s.last as PqSearch | undefined;
          if (!last) return;
          // Triangle inequality: the table's distance is off by at most the reconstruction error.
          s.vecs.forEach((v, i) => {
            const err = Math.sqrt(sq(v.v, decode(s.codes![i]!, s.books)));
            expect(
              Math.abs(Math.sqrt(last.approx[i]!) - Math.sqrt(last.exact[i]!)),
            ).toBeLessThanOrEqual(err + 1e-9);
          });
        },
      ),
      { numRuns: 120 },
    );
  });

  it('draws the seeds k-means++ would, from the stored draws', () => {
    const rng = makeRng(3);
    const pts = Array.from({ length: 8 }, () => [rng.int(0, 10), rng.int(0, 10)]);
    const picks = seedPlus(pts, [0.1, 0.5, 0.9]);
    expect(new Set(picks).size).toBe(3);
  });

  it('tells the story the examples tell', () => {
    const run = (id: string) => {
      const ex = pq.examples.find((e) => e.id === id)!;
      return new Timeline(
        pq,
        { ...pq.defaults, ...ex.settings } as PqSettings,
        ex.seed,
        ex.ops,
      ).endState();
    };
    const flip = run('order-flips').last!;
    expect(flip.found[0]).not.toBe(flip.truth[0]);
    const exact = run('eight-centres');
    expect(exact.last!.approx).toEqual(exact.last!.exact);
    const one = run('one-piece');
    expect(one.codes![0]).toEqual(one.codes![4]);
    const two = run('two-centres');
    expect(two.codes![0]).toEqual(two.codes![2]);
    const copied = run('copied-pieces');
    expect(new Set(copied.codes!.map((c) => c.join())).size).toBe(4);
  });

  it('stays readable on a laptop and a phone', () => {
    expect(smallestText(pq, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(pq, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
