import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import { makeGraph, type Graph } from '../_graph/graph';
import { formatGraph } from '../_graph/parse';
import { generalMatching } from '.';
import { matchedPairs, matchingSize, type BlRun } from './model';

/** Reference: the largest matching, by trying every subset of edges recursively. */
function brute(g: Graph): number {
  let best = 0;
  const used = new Set<string>();
  const go = (k: number, size: number) => {
    best = Math.max(best, size);
    for (let t = k; t < g.edges.length; t++) {
      const { u, v } = g.edges[t]!;
      if (used.has(u) || used.has(v)) continue;
      used.add(u);
      used.add(v);
      go(t + 1, size + 1);
      used.delete(u);
      used.delete(v);
    }
  };
  go(0, 0);
  return best;
}

function solve(g: Graph) {
  const t = new Timeline(generalMatching, generalMatching.defaults, 1, [
    ['load', formatGraph(g)],
    ['run'],
  ]);
  return t.entries[1]!.steps;
}

const L = (i: number) => String.fromCharCode(65 + i);

const graphArb = fc.integer({ min: 2, max: 9 }).chain((n) => {
  const all = Array.from({ length: n }, (_, a) =>
    Array.from({ length: n - a - 1 }, (_, k) => [a, a + k + 1] as const),
  ).flat();
  return fc.subarray(all, { minLength: 1, maxLength: Math.min(16, all.length) }).map((pairs) =>
    makeGraph({
      directed: false,
      weighted: false,
      edges: pairs.map(([a, b]) => ({ u: L(a), v: L(b), w: 1 })),
    }),
  );
});

describe('general matching (blossom)', () => {
  it('needs two blossoms on the starting graph and matches everything', () => {
    const t = new Timeline(generalMatching, generalMatching.defaults, 1, [['run']]);
    const steps = t.entries[0]!.steps;
    const r = steps.at(-1)!.extra!.run!;
    expect(r.blossoms).toBe(2);
    expect(matchingSize(t.initial.state.graph, r.mate)).toBe(4);
    expect(steps.some((s) => s.lines.includes('expand'))).toBe(true);
  });

  it('contracts the whole of an odd ring and stops', () => {
    const t = new Timeline(generalMatching, generalMatching.defaults, 1, [
      ['load', 'A-B, B-C, C-D, D-E, A-E'],
      ['run'],
    ]);
    const r = t.entries[1]!.steps.at(-1)!.extra!.run!;
    expect(r.blossoms).toBe(1);
    expect(r.augmentations).toBe(2);
  });

  it('expands the triangle in "a path through a triangle", and never contracts a bipartite graph', () => {
    const t = new Timeline(generalMatching, generalMatching.defaults, 1, [
      ['load', 'A-B, A-C, A-D, B-D, B-E, C-F, E-F'],
      ['run'],
      ['load', 'A-D, A-E, B-D, B-F, C-E, C-F'],
      ['run'],
    ]);
    const tri = t.entries[1]!.steps;
    expect(tri.at(-1)!.extra!.run!.blossoms).toBe(1);
    expect(tri.some((s) => s.lines.includes('expand'))).toBe(true);
    expect(t.entries[3]!.steps.at(-1)!.extra!.run!.blossoms).toBe(0);
  });

  it('reads arcs as edges', () => {
    const t = new Timeline(generalMatching, generalMatching.defaults, 1, [['load', 'A>B, B>A']]);
    const g = t.endState().graph;
    expect(g.directed).toBe(false);
    expect(g.edges).toHaveLength(1);
  });

  it('matches brute force, and every step holds a valid matching', () => {
    fc.assert(
      fc.property(graphArb, (g) => {
        const steps = solve(g);
        let size = 0;
        for (const s of steps) {
          const r: BlRun = s.extra!.run!;
          for (const v of g.vertices) {
            const m = r.mate[v];
            if (!m) continue;
            expect(r.mate[m]).toBe(v);
            expect(g.edges.some((e) => (e.u === v && e.v === m) || (e.u === m && e.v === v))).toBe(
              true,
            );
          }
          const k = matchedPairs(g, r.mate).length;
          expect(k).toBeGreaterThanOrEqual(size);
          size = k;
        }
        const r = steps.at(-1)!.extra!.run!;
        expect(matchingSize(g, r.mate)).toBe(brute(g));
        expect(r.augmentations).toBe(matchingSize(g, r.mate));
      }),
      { numRuns: 400 },
    );
  });
});
