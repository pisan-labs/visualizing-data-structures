import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import type { Graph } from '../_graph/graph';
import { formatGraph, parseGraph } from '../_graph/parse';
import { graphColoring } from '.';
import type { ColoringRun, ColoringSettings, Order } from './model';

const letters = 'ABCDEFGHI'.split('');
const graphArb = fc
  .record({
    n: fc.integer({ min: 1, max: 9 }),
    directed: fc.boolean(),
    pairs: fc.array(fc.tuple(fc.nat(8), fc.nat(8)), { maxLength: 22 }),
  })
  .map(({ n, directed, pairs }) => {
    const names = letters.slice(0, n);
    const seen = new Set<string>();
    const items: string[] = [...names];
    for (const [a, b] of pairs) {
      const u = names[a % n]!;
      const v = names[b % n]!;
      const key = directed ? `${u}>${v}` : [u, v].sort().join('-');
      if (u === v || seen.has(key)) continue;
      seen.add(key);
      items.push(key);
    }
    return parseGraph(items.join(', ')) as Graph;
  });

/** Neighbours with directions dropped, written independently of the page. */
function adjOf(g: Graph): Map<string, Set<string>> {
  const adj = new Map(g.vertices.map((v) => [v, new Set<string>()]));
  for (const e of g.edges) {
    adj.get(e.u)!.add(e.v);
    adj.get(e.v)!.add(e.u);
  }
  return adj;
}

/** A reference greedy coloring in a given order. */
function reference(g: Graph, order: string[]): Record<string, number> {
  const adj = adjOf(g);
  const color: Record<string, number> = {};
  for (const v of order) {
    let c = 1;
    while ([...adj.get(v)!].some((w) => color[w] === c)) c++;
    color[v] = c;
  }
  return color;
}

/** The fewest colors, by trying k = 1, 2, ... (graphs of at most 9 vertices). */
function chromatic(g: Graph): number {
  const adj = adjOf(g);
  const n = g.vertices.length;
  for (let k = 1; k <= n; k++) {
    const c: Record<string, number> = {};
    const go = (i: number): boolean => {
      if (i === n) return true;
      const v = g.vertices[i]!;
      for (let x = 1; x <= k; x++) {
        if ([...adj.get(v)!].some((w) => c[w] === x)) continue;
        c[v] = x;
        if (go(i + 1)) return true;
        delete c[v];
      }
      return false;
    };
    if (go(0)) return k;
  }
  return n;
}

function runOf(g: Graph, order: Order) {
  const t = new Timeline(
    graphColoring,
    { ...graphColoring.defaults, order } as ColoringSettings,
    1,
    [['load', formatGraph(g)], ['run']],
  );
  const steps = t.entries.at(-1)!.steps;
  return { steps, r: steps.at(-1)!.extra!.run! as ColoringRun };
}

describe('graph coloring', () => {
  it('matches a reference greedy coloring and stays proper on every step', () => {
    fc.assert(
      fc.property(graphArb, fc.constantFrom<Order>('given', 'largest', 'dsatur'), (g, order) => {
        const { steps, r } = runOf(g, order);
        const adj = adjOf(g);
        // The order is a permutation; fixed orders follow their rule.
        expect([...r.plan].sort()).toEqual([...g.vertices].sort());
        if (order === 'given') expect(r.plan).toEqual(g.vertices);
        if (order === 'largest')
          for (let i = 1; i < r.plan.length; i++)
            expect(adj.get(r.plan[i - 1]!)!.size).toBeGreaterThanOrEqual(adj.get(r.plan[i]!)!.size);
        expect(r.color).toEqual(reference(g, r.plan));
        const k = r.colors;
        // Bounds: clique ≤ χ ≤ colors used ≤ Δ + 1.
        const chi = chromatic(g);
        expect(r.clique!.length).toBeLessThanOrEqual(chi);
        expect(chi).toBeLessThanOrEqual(k);
        expect(k).toBeLessThanOrEqual(r.maxDegree! + 1);
        if (order === 'dsatur' && r.bipartite) expect(k).toBeLessThanOrEqual(2);
        for (const st of steps) {
          const run = st.extra?.run;
          if (!run) continue;
          // The coloring so far is proper, and colors are 1..colors with none skipped.
          for (const [u, set] of adj)
            for (const w of set)
              if (run.color[u] && run.color[w]) expect(run.color[u]).not.toBe(run.color[w]);
          const used = new Set(Object.values(run.color).filter((c) => c > 0));
          expect(used.size).toBe(run.colors);
        }
      }),
      { numRuns: 300 },
    );
  });

  it('wastes colors on a bipartite graph in a bad order, and DSatur does not', () => {
    const crown = parseGraph('A-D, A-F, A-H, B-C, B-E, B-G, C-F, C-H, D-E, D-G, E-H, F-G') as Graph;
    expect(runOf(crown, 'given').r.colors).toBe(4);
    expect(runOf(crown, 'dsatur').r.colors).toBe(2);
    expect(runOf(crown, 'given').steps.at(-1)!.say).toContain('2 colors are enough');
  });

  it('knows an odd cycle needs 3, so 3 colors on it is optimal', () => {
    const c5 = parseGraph('A-B, B-C, C-D, D-E, A-E') as Graph;
    const say = runOf(c5, 'given').steps.at(-1)!.say;
    expect(say).toContain('odd cycle');
    expect(say).toContain('as good as it gets');
    expect(say).not.toContain('Maybe fewer');
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(graphColoring, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(graphColoring, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
