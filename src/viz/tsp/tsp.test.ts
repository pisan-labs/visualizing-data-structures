import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeRng } from '../../engine/rng';
import { validateExample } from '../../engine/example';
import { Timeline } from '../../engine/timeline';
import { textWidth } from '../../layouts/text';
import { LAPTOP_STAGE } from '../../render/stage';
import { tsp } from '.';
import { citiesText, distances, readCities, type Points } from './cities';
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

  it('does not claim the factor-2 bound or free shortcuts without the triangle inequality', () => {
    const { steps, r } = runOf(
      'A-B:60, A-C:1, A-D:1, A-E:3, B-C:2, B-D:1, B-E:3, C-D:2, C-E:1, D-E:57',
      { method: 'mst' },
    );
    const says = steps.map((s) => s.say);
    // Was "length 120 ≤ 8, twice the tree" and "a shortcut, no longer than the walk".
    expect(says.join(' ')).not.toMatch(/length 120 ≤/);
    expect(says.some((say) => say.includes(`length ${r.cost}, more than 8, twice the tree`))).toBe(
      true,
    );
    expect(says.some((say) => say.includes("(57): longer than the walk's"))).toBe(true);
  });

  it('asks for a tree-walk tour only when the spanning tree has no tie', () => {
    // 19 of 200 questions had two right answers: another minimum spanning tree, as light, walked
    // to a tour of another length. Prim here breaks ties at random.
    const kind = tsp.practice!.find((k) => k.id === 'tree-walk')!;
    for (let seed = 1; seed <= 100; seed++) {
      const q = kind.make(makeRng(seed));
      const g = new Timeline(tsp, tsp.defaults, 1, q.setup).endState().graph;
      const d = distances(g);
      const vs = g.vertices;
      const rng = makeRng(seed + 500);
      for (let k = 0; k < 20; k++) {
        const kids = new Map<string, string[]>(vs.map((v) => [v, []]));
        const inTree = [vs[0]!];
        while (inTree.length < vs.length) {
          const pairs = inTree.flatMap((a) =>
            vs.filter((b) => !inTree.includes(b)).map((b) => [a, b]),
          );
          const best = Math.min(...pairs.map(([a, b]) => d(a!, b!)));
          const ties = pairs.filter(([a, b]) => d(a!, b!) === best);
          const [a, b] = ties[rng.int(0, ties.length - 1)]!;
          inTree.push(b!);
          kids.get(a!)!.push(b!);
        }
        const order: string[] = [];
        const walk = (v: string): void => {
          order.push(v);
          for (const c of [...kids.get(v)!].sort()) walk(c);
        };
        walk(vs[0]!);
        expect(length(d, order), `seed ${seed}`).toBe(
          q.answer.kind === 'number' ? q.answer.value : NaN,
        );
      }
    }
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

// ---------------------------------------------------------------------------------------------
// Weights clear of arrowheads. The stage draws a head 7 stroke widths long and wide, its tip
// a tenth of that past the line's end (src/ui/Shapes.svelte); a tour edge's stroke is 4.

type P = { x: number; y: number };

/** Whether two convex polygons overlap (separating axis test). */
function polygonsOverlap(a: P[], b: P[]): boolean {
  for (const poly of [a, b])
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i]!;
      const q = poly[(i + 1) % poly.length]!;
      const n = { x: q.y - p.y, y: p.x - q.x };
      const span = (ps: P[]) => ps.map((s) => s.x * n.x + s.y * n.y);
      const [sa, sb] = [span(a), span(b)];
      if (Math.max(...sa) <= Math.min(...sb) || Math.max(...sb) <= Math.min(...sa)) return false;
    }
  return true;
}

function headOf(s: { x1: number; y1: number; x2: number; y2: number }): P[] {
  const size = 7 * 4;
  const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1) || 1;
  const [ux, uy] = [(s.x2 - s.x1) / len, (s.y2 - s.y1) / len];
  const tip = { x: s.x2 + ux * size * 0.1, y: s.y2 + uy * size * 0.1 };
  const base = { x: s.x2 - ux * size * 0.9, y: s.y2 - uy * size * 0.9 };
  return [
    tip,
    { x: base.x - uy * (size / 2), y: base.y + ux * (size / 2) },
    { x: base.x + uy * (size / 2), y: base.y - ux * (size / 2) },
  ];
}

describe('drawing', () => {
  // In "No triangle inequality, no guarantee" the 57 on E → D sat under that edge's arrowhead.
  it('keeps every weight clear of the arrowheads', () => {
    for (const raw of tsp.examples) {
      const ex = validateExample(tsp, raw);
      const t = new Timeline(tsp, ex.settings, ex.seed, ex.ops);
      for (let i = 0; i < t.length; i++) {
        const shapes = tsp.view(t.at(i).step, t.settings as TspSettings, LAPTOP_STAGE).shapes;
        const heads = shapes.flatMap((s) =>
          s.kind === 'arrow' && (s.head ?? 'end') !== 'none' && !s.via
            ? [{ id: s.id, poly: headOf(s) }]
            : [],
        );
        for (const w of shapes) {
          if (w.kind !== 'text' || !w.id.startsWith('ew-')) continue;
          const tw = textWidth(String(w.text), 13);
          const [x0, y0] = [w.x - tw / 2, w.y - 4.5 - 5.5];
          const box = [
            { x: x0, y: y0 },
            { x: x0 + tw, y: y0 },
            { x: x0 + tw, y: y0 + 12 },
            { x: x0, y: y0 + 12 },
          ];
          for (const h of heads)
            expect(polygonsOverlap(box, h.poly), `${ex.id} step ${i}: ${w.id} on ${h.id}`).toBe(
              false,
            );
        }
      }
    }
  });
});
