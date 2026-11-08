import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import { components, keyOf, type Graph } from '../_graph/graph';
import { formatGraph, parseGraph } from '../_graph/parse';
import { kruskal } from '.';
import type { KruskalRun, KruskalSettings } from './model';
import { MST_TEXT } from '../_graph/mst';

// A reference written independently of the page: sort, then join with a label array.
function reference(g: Graph): { weight: number; tree: string[] } {
  const label = new Map(g.vertices.map((v) => [v, v]));
  const tree: string[] = [];
  let weight = 0;
  const order = [...g.edges].map((e, i) => ({ e, i })).sort((a, b) => a.e.w - b.e.w || a.i - b.i);
  for (const { e } of order) {
    const a = label.get(e.u)!;
    const b = label.get(e.v)!;
    if (a === b) continue;
    tree.push(`${e.u}-${e.v}`);
    weight += e.w;
    for (const [v, l] of label) if (l === a) label.set(v, b);
  }
  return { weight, tree };
}

/** Number of pieces of the graph made of these edges. */
function pieces(g: Graph, edges: string[]): number {
  const sub = parseGraph([...g.vertices, ...edges].join(', ')) as Graph;
  return components(sub).length;
}

const letters = 'ABCDEFGHI'.split('');
const graphArb = fc
  .record({
    n: fc.integer({ min: 1, max: 9 }),
    pairs: fc.array(fc.tuple(fc.nat(8), fc.nat(8), fc.integer({ min: -3, max: 6 })), {
      maxLength: 20,
    }),
  })
  .map(({ n, pairs }) => {
    const names = letters.slice(0, n);
    const seen = new Set<string>();
    const items: string[] = [...names];
    for (const [a, b, w] of pairs) {
      const u = names[a % n]!;
      const v = names[b % n]!;
      const key = [u, v].sort().join('-');
      if (u === v || seen.has(key)) continue;
      seen.add(key);
      items.push(`${u}-${v}:${w}`);
    }
    return parseGraph(items.join(', ')) as Graph;
  });

function runOf(g: Graph, settings: Partial<KruskalSettings> = {}) {
  const t = new Timeline(kruskal, { ...kruskal.defaults, ...settings } as KruskalSettings, 1, [
    ['load', formatGraph(g)],
    ['run'],
  ]);
  const steps = t.entries.at(-1)!.steps;
  return { steps, r: steps.at(-1)!.extra!.run! as KruskalRun };
}

describe('kruskal', () => {
  it('builds the same forest as a reference, and checks invariants on every step', () => {
    fc.assert(
      fc.property(graphArb, fc.boolean(), (g, stop) => {
        const { steps, r } = runOf(g, { stop });
        const ref = reference(g);
        expect(r.A).toEqual(ref.tree);
        expect(r.weight).toBe(ref.weight);
        for (const st of steps) {
          const run = st.extra!.run!;
          // A is always a forest: each tree edge joined two pieces.
          expect(pieces(g, run.A)).toBe(g.vertices.length - run.A.length);
          // The union-find forest has the same pieces as A.
          const root = (v: string) => {
            let x = v;
            while (run.p[x] !== x) x = run.p[x]!;
            return x;
          };
          for (const k of run.A) {
            const [u, v] = k.split('-') as [string, string];
            expect(root(u)).toBe(root(v));
          }
          expect(new Set(g.vertices.map(root)).size).toBe(g.vertices.length - run.A.length);
          // Ranks grow up the forest, so no tree is taller than log2 V.
          for (const v of g.vertices)
            if (run.p[v] !== v) expect(run.rank[run.p[v]!]).toBeGreaterThan(run.rank[v]!);
          // Every rejected edge has both ends in one tree.
          for (const [k, s] of Object.entries(run.status))
            if (s === 'cycle') {
              const [u, v] = k.split('-') as [string, string];
              expect(root(u)).toBe(root(v));
            }
        }
        if (!stop) expect(r.rejected).toBe(g.edges.length - r.A.length);
        expect(r.A.length).toBe(g.vertices.length - components(g).length);
      }),
      { numRuns: 300 },
    );
  });

  it('starts from the graph every MST page starts from', () => {
    const { r } = runOf(parseGraph(MST_TEXT) as Graph);
    expect(r.A).toEqual(['C-D', 'A-C', 'E-G', 'B-E', 'F-H', 'A-B', 'D-F']);
    expect(r.weight).toBe(19);
    expect(r.rejected).toBe(7);
    const early = runOf(parseGraph(MST_TEXT) as Graph, { stop: true }).r;
    expect(early.A).toEqual(r.A);
    expect(early.rejected).toBe(0);
    expect(Object.keys(early.status)).toHaveLength(7);
    expect(r.sorted.map(keyOf).slice(0, 3)).toEqual(['C-D', 'A-C', 'E-G']);
  });

  it('refuses a directed graph', () => {
    const t = new Timeline(kruskal, kruskal.defaults, 1, [['load', 'A>B:1, B>C:2'], ['run']]);
    expect(t.entries[1]!.steps.at(-1)!.say).toContain('needs an undirected graph');
  });
});
