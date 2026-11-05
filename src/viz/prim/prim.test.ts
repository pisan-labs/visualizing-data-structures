import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import type { Graph } from '../_graph/graph';
import { formatGraph, parseGraph } from '../_graph/parse';
import { prim } from '.';
import { treeEdges, type PrimRun, type PrimSettings } from './model';
import { MST_TEXT } from './mst';

// ---------------------------------------------------------------------------------------------
// References, written independently of the page.

/** The weight of a minimum spanning forest: edges by weight, joined with a label array. */
function mstWeight(g: Graph): number {
  const label = new Map(g.vertices.map((v) => [v, v]));
  let total = 0;
  for (const e of [...g.edges].sort((a, b) => a.w - b.w)) {
    const a = label.get(e.u)!;
    const b = label.get(e.v)!;
    if (a === b) continue;
    total += e.w;
    for (const [v, l] of label) if (l === a) label.set(v, b);
  }
  return total;
}

/** Prim with an array: scan for the smallest key, ties by vertex order. */
function arrayPrim(g: Graph, r: string) {
  const key = new Map<string, number>();
  const pi = new Map<string, string>();
  const done = new Set<string>();
  const order: string[] = [];
  const rest = [r, ...g.vertices.filter((v) => v !== r)];
  while (order.length < g.vertices.length) {
    let u: string | null = null;
    for (const v of g.vertices)
      if (!done.has(v) && key.has(v) && (u === null || key.get(v)! < key.get(u)!)) u = v;
    if (u === null) u = rest.find((v) => !done.has(v))!;
    done.add(u);
    order.push(u);
    for (const e of g.edges) {
      const v = e.u === u ? e.v : e.v === u ? e.u : null;
      if (v === null || done.has(v)) continue;
      if (!key.has(v) || e.w < key.get(v)!) {
        key.set(v, e.w);
        pi.set(v, u);
      }
    }
  }
  return { order, pi };
}

// ---------------------------------------------------------------------------------------------

const letters = 'ABCDEFGHI'.split('');
const graphArb = fc
  .record({
    n: fc.integer({ min: 1, max: 9 }),
    pairs: fc.array(fc.tuple(fc.nat(8), fc.nat(8), fc.integer({ min: -3, max: 9 })), {
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

function runOf(g: Graph, settings: Partial<PrimSettings> = {}) {
  const t = new Timeline(prim, { ...prim.defaults, ...settings } as PrimSettings, 1, [
    ['load', formatGraph(g)],
    ['run'],
  ]);
  const steps = t.entries.at(-1)!.steps;
  return { steps, r: steps.at(-1)!.extra!.run! as PrimRun };
}

describe('prim', () => {
  it('grows a minimum spanning forest, in either queue, from any start', () => {
    fc.assert(
      fc.property(
        graphArb,
        fc.constantFrom('decrease' as const, 'lazy' as const),
        fc.constantFrom(...'ABCDEJ'.split('')),
        (g, queue, start) => {
          const { steps, r } = runOf(g, { queue, start });
          const root = g.vertices.includes(start) ? start : g.vertices[0]!;
          const ref = arrayPrim(g, root);
          expect(r.T).toEqual(ref.order);
          for (const v of g.vertices) expect(r.pi[v] ?? undefined).toBe(ref.pi.get(v));
          expect(r.weight).toBe(mstWeight(g));
          const edges = treeEdges(g, r);
          expect(edges.reduce((a, e) => a + e.w, 0)).toBe(r.weight);
          // Invariants on every step: the tree only grows, and keys only drop.
          let size = 0;
          const keys = new Map<string, number>();
          for (const st of steps) {
            const run = st.extra!.run!;
            expect(run.T.length).toBeGreaterThanOrEqual(size);
            size = run.T.length;
            for (const v of g.vertices) {
              const k = run.key[v];
              if (k === null || v === root) continue;
              if (keys.has(v)) expect(k).toBeLessThanOrEqual(keys.get(v)!);
              keys.set(v, k!);
            }
            // The queue stays sorted.
            for (let i = 1; i < run.Q.length; i++) {
              const a = run.Q[i - 1]!.k;
              const b = run.Q[i]!.k;
              if (a !== null && b !== null) expect(a).toBeLessThanOrEqual(b);
              if (a === null) expect(b).toBeNull();
            }
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it('starts from the graph every MST page starts from', () => {
    const g = parseGraph(MST_TEXT) as Graph;
    const { r } = runOf(g);
    expect(r.T).toEqual(['A', 'C', 'D', 'B', 'E', 'G', 'F', 'H']);
    expect(r.weight).toBe(19);
  });

  it('refuses a directed graph', () => {
    const t = new Timeline(prim, prim.defaults, 1, [['load', 'A>B:1, B>C:2'], ['run']]);
    expect(t.entries[1]!.steps.at(-1)!.say).toContain('needs an undirected graph');
  });

  it('starts at the first vertex when the start vertex is missing', () => {
    const t = new Timeline(prim, { ...prim.defaults, start: 'K' } as PrimSettings, 1, [['run']]);
    const steps = t.entries[0]!.steps;
    expect(steps[0]!.say).toContain('no vertex K');
    expect(steps.at(-1)!.extra!.run!.r).toBe('A');
  });
});
