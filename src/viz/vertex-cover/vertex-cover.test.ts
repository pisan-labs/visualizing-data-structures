import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import type { Graph } from '../_graph/graph';
import { formatGraph, parseGraph } from '../_graph/parse';
import { vertexCover } from '.';
import type { VcMethod, VcRun, VcSettings } from './model';
import { disjointEdges, GREEDY_TRAP_TEXT, greedyTrap } from './presets';

// ---------------------------------------------------------------------------------------------
// A reference written independently of the page: every set of vertices, as a bitmask.

function bruteMinimum(g: Graph): number {
  const n = g.vertices.length;
  const at = new Map(g.vertices.map((v, i) => [v, i]));
  let best = n;
  for (let mask = 0; mask < 1 << n; mask++) {
    let k = 0;
    for (let x = mask; x; x &= x - 1) k++;
    if (k >= best) continue;
    if (g.edges.every((e) => (mask >> at.get(e.u)!) & 1 || (mask >> at.get(e.v)!) & 1)) best = k;
  }
  return best;
}

const isCover = (g: Graph, c: string[]) => g.edges.every((e) => c.includes(e.u) || c.includes(e.v));

/** The greedy bound H(Δ): 1 + 1/2 + ... + 1/Δ for the largest degree Δ. */
function harmonic(g: Graph): number {
  const deg = Math.max(
    1,
    ...g.vertices.map((v) => g.edges.filter((e) => e.u === v || e.v === v).length),
  );
  let h = 0;
  for (let i = 1; i <= deg; i++) h += 1 / i;
  return h;
}

// ---------------------------------------------------------------------------------------------

const letters = 'ABCDEFGHIJ'.split('');
const graphArb = fc
  .record({
    n: fc.integer({ min: 1, max: 10 }),
    pairs: fc.array(fc.tuple(fc.nat(9), fc.nat(9)), { maxLength: 22 }),
  })
  .map(({ n, pairs }) => {
    const names = letters.slice(0, n);
    const items = new Set<string>(names);
    for (const [a, b] of pairs) {
      const u = names[a % n]!;
      const v = names[b % n]!;
      if (u !== v) items.add([u, v].sort().join('-'));
    }
    return parseGraph([...items].join(', ')) as Graph;
  });

function runOf(g: Graph, method: VcMethod) {
  const t = new Timeline(vertexCover, { ...vertexCover.defaults, method } as VcSettings, 1, [
    ['load', formatGraph(g)],
    ['run'],
  ]);
  const steps = t.entries.at(-1)!.steps;
  return { steps, r: steps.at(-1)!.extra!.run! as VcRun };
}

describe('vertex-cover', () => {
  it('finds covers, exact ones of the smallest size, approximations within their bounds', () => {
    fc.assert(
      fc.property(
        graphArb,
        fc.constantFrom<VcMethod>('matching', 'greedy', 'branch', 'brute'),
        (g, method) => {
          const { steps, r } = runOf(g, method);
          const opt = bruteMinimum(g);
          expect(r.opt).toBe(opt);
          expect(isCover(g, r.optCover)).toBe(true);
          expect(r.optCover.length).toBe(opt);
          expect(isCover(g, r.C)).toBe(true);
          expect(new Set(r.C).size).toBe(r.C.length);
          expect(r.C.length).toBeGreaterThanOrEqual(opt);
          if (method === 'branch' || method === 'brute') expect(r.C.length).toBe(opt);
          if (method === 'matching') {
            expect(r.C.length).toBe(2 * r.M.length);
            expect(r.C.length).toBeLessThanOrEqual(2 * opt);
            // The edges taken share no vertex.
            const ends = r.M.flatMap((k) => k.split('-'));
            expect(new Set(ends).size).toBe(ends.length);
          }
          if (method === 'greedy') expect(r.C.length).toBeLessThanOrEqual(harmonic(g) * opt + 1e-9);
          // On every step: covered edges are exactly the edges with an end in C.
          for (const st of steps) {
            const run = st.extra?.run;
            if (!run) continue;
            for (const e of g.edges) {
              const k = `${e.u}-${e.v}`;
              expect(!!run.covered[k]).toBe(run.C.includes(e.u) || run.C.includes(e.v));
            }
            if (run.best) expect(isCover(g, run.best)).toBe(true);
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it('hits the factor 2 on disjoint edges, and greedy misses on its trap', () => {
    const g = disjointEdges(8);
    expect(runOf(g, 'matching').r.C.length).toBe(8);
    expect(runOf(g, 'matching').r.opt).toBe(4);
    const trap = greedyTrap(6);
    expect(formatGraph(trap)).toBe(GREEDY_TRAP_TEXT);
    const { r } = runOf(trap, 'greedy');
    expect(r.C.length).toBe(8);
    expect(r.opt).toBe(6);
  });

  it('refuses a directed graph', () => {
    const t = new Timeline(vertexCover, vertexCover.defaults, 1, [['load', 'A>B, B>C'], ['run']]);
    expect(t.entries[1]!.steps.at(-1)!.say).toContain('This graph is directed');
  });
});
