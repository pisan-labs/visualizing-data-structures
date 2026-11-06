import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import type { Graph } from '../_graph/graph';
import { formatGraph, parseGraph } from '../_graph/parse';
import { steinerTree } from '.';
import type { StMethod, StRun, StSettings } from './model';
import { hiddenHub } from './presets';

// ---------------------------------------------------------------------------------------------
// References written independently of the page.

/** Do these edges join every terminal? (Union-find over the chosen edges.) */
function joins(g: Graph, T: string[], mask: number): boolean {
  const up = new Map(g.vertices.map((v) => [v, v]));
  const find = (v: string): string => (up.get(v) === v ? v : find(up.get(v)!));
  g.edges.forEach((e, i) => {
    if ((mask >> i) & 1) up.set(find(e.u), find(e.v));
  });
  return T.every((t) => find(t) === find(T[0]!));
}

/** The lightest set of edges that joins the terminals: with positive weights, a Steiner tree. */
function bruteSteiner(g: Graph, T: string[]): number | null {
  if (T.length <= 1) return 0;
  let best: number | null = null;
  for (let mask = 0; mask < 1 << g.edges.length; mask++) {
    let w = 0;
    g.edges.forEach((e, i) => {
      if ((mask >> i) & 1) w += e.w;
    });
    if (best !== null && w >= best) continue;
    if (joins(g, T, mask)) best = w;
  }
  return best;
}

/** All-pairs shortest distances (Floyd-Warshall). */
function floyd(g: Graph): (a: string, b: string) => number {
  const d = new Map<string, number>();
  const k = (a: string, b: string) => `${a}|${b}`;
  for (const a of g.vertices) for (const b of g.vertices) d.set(k(a, b), a === b ? 0 : Infinity);
  for (const e of g.edges) {
    d.set(k(e.u, e.v), Math.min(d.get(k(e.u, e.v))!, e.w));
    d.set(k(e.v, e.u), Math.min(d.get(k(e.v, e.u))!, e.w));
  }
  for (const m of g.vertices)
    for (const a of g.vertices)
      for (const b of g.vertices)
        d.set(k(a, b), Math.min(d.get(k(a, b))!, d.get(k(a, m))! + d.get(k(m, b))!));
  return (a, b) => d.get(k(a, b))!;
}

// ---------------------------------------------------------------------------------------------

const letters = 'ABCDEFG'.split('');
const caseArb = fc
  .record({
    n: fc.integer({ min: 1, max: 7 }),
    pairs: fc.array(fc.tuple(fc.nat(6), fc.nat(6), fc.integer({ min: 1, max: 6 })), {
      maxLength: 13,
    }),
    pick: fc.array(fc.nat(6), { minLength: 1, maxLength: 5 }),
  })
  .map(({ n, pairs, pick }) => {
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
    const g = parseGraph(items.join(', ')) as Graph;
    const T = [...new Set(pick.map((i) => names[i % n]!))].sort();
    return { g, T };
  });

function runOf(g: Graph, T: string[], method: StMethod) {
  const t = new Timeline(steinerTree, { ...steinerTree.defaults, method } as StSettings, 1, [
    ['load', formatGraph(g)],
    ['terminals', T.join(' ')],
    ['run'],
  ]);
  const steps = t.entries.at(-1)!.steps;
  return { steps, r: steps.at(-1)!.extra?.run as StRun | undefined };
}

describe('steiner-tree', () => {
  it('finds trees that join the terminals, exact ones minimum, the approximation within 2 − 2/t', () => {
    fc.assert(
      fc.property(caseArb, fc.constantFrom<StMethod>('approx', 'exact'), ({ g, T }, method) => {
        const { steps, r } = runOf(g, T, method);
        const opt = bruteSteiner(g, T);
        if (opt === null) {
          expect(r).toBeUndefined();
          expect(steps.at(-1)!.say).toContain('different pieces');
          return;
        }
        expect(r).toBeDefined();
        const run = r!;
        expect(run.opt).toBe(opt);
        // The tree: real edges, its weight, connected, no cycle, every terminal in it.
        const keys = new Set(g.edges.map((e) => `${e.u}-${e.v}`));
        for (const k of run.tree) expect(keys.has(k)).toBe(true);
        const w = run.tree.reduce((a, k) => a + g.edges.find((e) => `${e.u}-${e.v}` === k)!.w, 0);
        expect(run.weight).toBe(w);
        const mask = g.edges.reduce(
          (m, e, i) => (run.tree.includes(`${e.u}-${e.v}`) ? m | (1 << i) : m),
          0,
        );
        expect(joins(g, T, mask)).toBe(true);
        const ends = new Set(run.tree.flatMap((k) => k.split('-')));
        if (run.tree.length) expect(run.tree.length).toBe(ends.size - 1);
        expect(run.weight).toBeGreaterThanOrEqual(opt);
        if (method === 'exact') expect(run.weight).toBe(opt);
        else {
          expect(run.weight).toBeLessThanOrEqual((2 - 2 / Math.max(1, T.length)) * opt + 1e-9);
          // Every leaf is a terminal.
          for (const v of ends) {
            const deg = run.tree.filter((k) => k.split('-').includes(v)).length;
            if (deg === 1) expect(T).toContain(v);
          }
          // The closure distances are shortest-path distances.
          const d = floyd(g);
          for (const [k, x] of Object.entries(run.dist)) {
            const [a, b] = k.split('|') as [string, string];
            expect(x).toBe(d(a, b));
          }
        }
        // On every step the tree so far uses real edges only.
        for (const st of steps) {
          const s = st.extra?.run;
          if (s)
            for (const k of [...s.tree, ...s.path, ...s.removed]) expect(keys.has(k)).toBe(true);
        }
      }),
      { numRuns: 300 },
    );
  });

  it('reaches the bound 2 − 2/t on the hidden hub', () => {
    for (const k of [3, 5, 7]) {
      const { graph, terminals } = hiddenHub(k);
      const { r } = runOf(graph, terminals, 'approx');
      expect(r!.weight).toBe(2 * (k - 1));
      expect(r!.opt).toBe(k);
    }
  });

  it('refuses directed graphs and weights of 0 or less', () => {
    const t = new Timeline(steinerTree, steinerTree.defaults, 1, [
      ['load', 'A>B:1, B>C:2'],
      ['run'],
    ]);
    expect(t.entries[1]!.steps.at(-1)!.say).toContain('This graph is directed');
    const u = new Timeline(steinerTree, steinerTree.defaults, 1, [
      ['load', 'A-B:0, B-C:2'],
      ['run'],
    ]);
    expect(u.entries[1]!.steps.at(-1)!.say).toContain('positive weights');
  });

  it('keeps the terminals when they are in the new graph, and refuses unknown ones', () => {
    const t = new Timeline(steinerTree, steinerTree.defaults, 1, [
      ['load', 'A-B:1, B-E:2, E-G:1, G-H:1'],
      ['terminals', 'A Z'],
    ]);
    expect(t.entries[0]!.end.terminals).toEqual(['A', 'E', 'G', 'H']);
    expect(t.entries[1]!.steps.at(-1)!.say).toContain('no vertex Z');
    expect(t.entries[1]!.end.terminals).toEqual(['A', 'E', 'G', 'H']);
  });
});
