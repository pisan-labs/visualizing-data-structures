import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import { tsp } from '.';
import { citiesText, readCities, type Points } from './cities';
import type { TspMethod, TspRun, TspSettings } from './model';

// ---------------------------------------------------------------------------------------------
// A reference written independently of the page: every ordering of the cities after the first.

type D = (u: string, v: string) => number;

function permutations<T>(xs: T[]): T[][] {
  if (xs.length <= 1) return [xs];
  return xs.flatMap((x, i) =>
    permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]),
  );
}

function length(d: D, tour: string[]): number {
  if (tour.length < 2) return 0;
  return tour.reduce((a, v, i) => a + d(v, tour[(i + 1) % tour.length]!), 0);
}

function bruteOptimum(names: string[], d: D): number {
  const [s, ...rest] = names;
  return Math.min(...permutations(rest).map((p) => length(d, [s!, ...p])));
}

/** The shortest path from s through every city of set, ending at j. */
function brutePath(s: string, set: string[], j: string, d: D): number {
  const others = set.filter((v) => v !== j);
  return Math.min(...permutations(others).map((p) => length(d, [s, ...p, j]) - d(j, s)));
}

// ---------------------------------------------------------------------------------------------

const pointsArb = fc
  .uniqueArray(fc.tuple(fc.integer({ min: 0, max: 20 }), fc.integer({ min: 0, max: 20 })), {
    minLength: 1,
    maxLength: 7,
    selector: ([x, y]) => `${x},${y}`,
  })
  .map((xy) => {
    const pts: Points = {};
    xy.forEach(([x, y], i) => (pts[String.fromCharCode(65 + i)] = { x: x * 4, y: y * 4 }));
    return pts;
  });

function runOf(text: string, settings: Partial<TspSettings>) {
  const t = new Timeline(tsp, { ...tsp.defaults, ...settings } as TspSettings, 1, [
    ['load', text],
    ['run'],
  ]);
  const g = t.entries[0]!.end.graph;
  const steps = t.entries[1]!.steps;
  return { g, steps, r: steps.at(-1)!.extra!.run! as TspRun };
}

const methods: TspMethod[] = ['mst', 'nearest', 'exact'];

describe('tsp', () => {
  it('finds tours that are never better than the optimum, within the guarantee', () => {
    fc.assert(
      fc.property(pointsArb, fc.constantFrom(...methods), fc.boolean(), (pts, method, improve) => {
        const text = citiesText(pts);
        const { g, steps, r } = runOf(text, { method, improve });
        const d: D = (u, v) => {
          if (u === v) return 0;
          const e = g.edges.find((x) => (x.u === u && x.v === v) || (x.u === v && x.v === u))!;
          return e.w;
        };
        const opt = bruteOptimum(g.vertices, d);
        expect(r.opt).toBe(opt);
        expect([...r.tour].sort()).toEqual([...g.vertices].sort());
        expect(r.tour[0]).toBe(g.vertices[0]);
        expect(r.closed).toBe(true);
        expect(r.cost).toBe(length(d, r.tour));
        expect(r.cost).toBeGreaterThanOrEqual(opt);
        if (method === 'exact') expect(r.cost).toBe(opt);
        // Rounded-up distances keep the triangle inequality, so the factor 2 holds.
        if (method === 'mst') expect(r.cost).toBeLessThanOrEqual(2 * opt);
        if (improve && method !== 'exact' && g.vertices.length > 2) {
          const plain = runOf(text, { method, improve: false }).r;
          expect(r.cost).toBeLessThanOrEqual(plain.cost);
          expect(r.before).toBe(plain.cost);
        }
        // On every step: the tour or path has no repeats, and its length is what it says.
        for (const st of steps) {
          const run = st.extra!.run!;
          expect(new Set(run.tour).size).toBe(run.tour.length);
          if (run.tour.length > 0) {
            const open =
              length(d, run.tour) - (run.tour.length > 1 ? d(run.tour.at(-1)!, run.tour[0]!) : 0);
            expect(run.cost).toBe(run.closed ? length(d, run.tour) : open);
          }
          if (run.tree) {
            const w = run.tree.reduce((a, e) => a + e.w, 0);
            expect(w).toBeLessThanOrEqual(opt);
          }
        }
        // Held-Karp's table holds the shortest paths, checked against every ordering.
        const table = r.table;
        if (table) {
          const s = g.vertices[0]!;
          for (const col of table.cols)
            for (const j of table.rows) {
              const set = col.split('');
              const cell = table.cells[`${j}|${col}`];
              if (!set.includes(j)) expect(cell).toBe('–');
              else expect(Number(cell)).toBe(brutePath(s, set, j, d));
            }
        }
      }),
      { numRuns: 250 },
    );
  });

  it('is exact on distances without the triangle inequality, where the tree walk may not be', () => {
    const { r } = runOf('A-B:60, A-C:1, A-D:1, A-E:3, B-C:2, B-D:1, B-E:3, C-D:2, C-E:1, D-E:57', {
      method: 'mst',
    });
    expect(r.opt).toBe(7);
    expect(r.cost).toBeGreaterThan(2 * r.opt);
    expect(
      runOf('A-B:60, A-C:1, A-D:1, A-E:3, B-C:2, B-D:1, B-E:3, C-D:2, C-E:1, D-E:57', {
        method: 'exact',
      }).r.cost,
    ).toBe(7);
  });

  it('starts from seven cities where both heuristics miss the optimum', () => {
    const t = new Timeline(tsp, tsp.defaults, 1, [['run']]);
    const r = t.entries[0]!.steps.at(-1)!.extra!.run!;
    expect(r.opt).toBe(275);
    expect(r.cost).toBe(310);
  });

  it('refuses cities it cannot take, and keeps the old ones', () => {
    for (const [text, why] of [
      ['A-B:1, B-C:2', 'A-C is missing'],
      ['A>B:1, B>A:1', 'needs an undirected graph'],
      ['A-B:-1', 'cannot be negative'],
      ['A(0,0) B(1,1) C(2,2) D(3,3) E(4,4) F(5,5) G(6,6) H(7,7) I(8,8)', 'at most 8'],
      ['A(0,0) A(1,1)', 'appears twice'],
      ['A(0,0) B(200,1)', 'from -99 to 99'],
      ['A(0,0) junk', '"junk" is not a city'],
    ] as const) {
      expect(readCities(text)).toBeInstanceOf(Error);
      const t = new Timeline(tsp, tsp.defaults, 1, [['load', text]]);
      const st = t.entries[0]!.steps.at(-1)!;
      expect(st.say).toContain(why);
      expect(st.state).toEqual(t.initial.state);
    }
  });
});
