import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeRng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import type { Graph } from '../_graph/graph';
import { parseGraph } from '../_graph/parse';
import { bipartite } from '.';
import { pseudocode, type BipRun, type BipSettings, type Method } from './model';

// ---------------------------------------------------------------------------------------------
// Reference: try every split of the vertices into two sides (graphs here have at most 9
// vertices, so at most 256 splits with the first vertex fixed). No search at all.

function undirectedPairs(g: Graph): [string, string][] {
  return g.edges.map((e) => [e.u, e.v]);
}

function refBipartite(g: Graph): boolean {
  const n = g.vertices.length;
  const index = new Map(g.vertices.map((v, i) => [v, i]));
  const pairs = undirectedPairs(g);
  for (let mask = 0; mask < 1 << Math.max(0, n - 1); mask++) {
    const side = (v: string) => (index.get(v)! === 0 ? 0 : (mask >> (index.get(v)! - 1)) & 1);
    if (pairs.every(([a, b]) => side(a) !== side(b))) return true;
  }
  return false;
}

const joined = (g: Graph, a: string, b: string) =>
  g.edges.some((e) => (e.u === a && e.v === b) || (e.u === b && e.v === a));

/** Invariants every step keeps. */
function checkRun(g: Graph, r: BipRun, vars: Record<string, unknown>) {
  for (const v of g.vertices) {
    if (r.pi[v] !== null) {
      const p = r.pi[v]!;
      expect(joined(g, p, v), `${p}-${v} is an edge`).toBe(true);
      expect(r.side[v]).toBe(1 - r.side[p]!);
    }
    if (r.side[v] === null) expect(r.pi[v]).toBeNull();
  }
  // Until a clash, every edge between two vertices with sides crosses... except the clash.
  if (r.verdict !== 'no') {
    for (const e of g.edges) {
      const a = r.side[e.u];
      const b = r.side[e.v];
      const looked = r.edges[`${e.u}-${e.v}`];
      if (looked && a !== null && b !== null) expect(a).not.toBe(b);
    }
  }
  expect(new Set(r.frontier).size).toBe(r.frontier.length);
  expect(vars.colored).toBe(r.order.length);
}

const letters = 'ABCDEFGHI'.split('');
const graphArb = fc
  .record({
    n: fc.integer({ min: 1, max: 9 }),
    directed: fc.boolean(),
    pairs: fc.array(fc.tuple(fc.nat(8), fc.nat(8)), { maxLength: 12 }),
  })
  .map(({ n, directed, pairs }) => {
    const names = letters.slice(0, n);
    const seen = new Set<string>();
    const items: string[] = [];
    for (const [a, b] of pairs) {
      const u = names[a % n]!;
      const v = names[b % n]!;
      const key = directed ? `${u}>${v}` : [u, v].sort().join('-');
      if (u === v || seen.has(key)) continue;
      seen.add(key);
      items.push(directed ? `${u}>${v}` : `${u}-${v}`);
    }
    return [...items, ...names].join(', ');
  });

describe('bipartite check', () => {
  it('agrees with trying every split, and proves a no with an odd cycle', () => {
    fc.assert(
      fc.property(graphArb, fc.constantFrom<Method>('bfs', 'dfs'), (text, method) => {
        const settings: BipSettings = { ...bipartite.defaults, method };
        const calls: OpCall[] = [['load', text], ['run']];
        const t = new Timeline(bipartite, settings, 1, calls);
        const g = t.entries[0]!.end.graph;
        const entry = t.entries[1]!;
        for (const st of entry.steps) {
          expect(st.state.graph).toBe(g);
          checkRun(g, st.extra!.run!, st.vars ?? {});
        }
        const r = entry.steps.at(-1)!.extra!.run!;
        const truth = refBipartite(g);
        expect(r.verdict).toBe(truth ? 'yes' : 'no');
        if (truth) {
          for (const v of g.vertices) expect(r.side[v]).not.toBeNull();
          for (const e of g.edges) expect(r.side[e.u]).not.toBe(r.side[e.v]);
        } else {
          const c = r.cycle!;
          expect(c.length % 2, `odd cycle ${c.join(' ')}`).toBe(1);
          expect(new Set(c).size).toBe(c.length);
          for (let i = 0; i < c.length; i++)
            expect(joined(g, c[i]!, c[(i + 1) % c.length]!), c.join(' ')).toBe(true);
          expect(c[0]).toBe(r.clash!.u);
          expect(c.at(-1)).toBe(r.clash!.v);
        }
      }),
      { numRuns: 400 },
    );
  });

  it('can find different odd cycles with BFS and DFS', () => {
    const calls: OpCall[] = [['load', 'A-B, A-C, B-D, C-E, D-E, E-F'], ['run']];
    const end = (method: Method) =>
      new Timeline(bipartite, { ...bipartite.defaults, method }, 1, calls).entries[1]!.steps.at(-1)!
        .extra!.run!;
    expect(end('bfs').cycle).toEqual(['D', 'B', 'A', 'C', 'E']);
    expect(end('dfs').cycle).toEqual(['C', 'E', 'D', 'B', 'A']);
  });

  it('keeps pseudocode lines short enough for a phone', () => {
    for (const method of ['bfs', 'dfs'] as const)
      for (const block of pseudocode({ ...bipartite.defaults, method }))
        for (const l of block.lines)
          expect(2 * l.indent + l.text.length, `${l.id}: ${l.text}`).toBeLessThanOrEqual(33);
  });
});

describe('bipartite practice', () => {
  it('has answers that agree with the reference', () => {
    const kinds = bipartite.practice!;
    expect(kinds.length).toBeGreaterThanOrEqual(3);
    expect(kinds.length).toBeLessThanOrEqual(4);
    for (let seed = 1; seed <= 120; seed++) {
      for (const kind of kinds) {
        const q = kind.make(makeRng(seed));
        const where = `${kind.id} seed ${seed}`;
        const g = parseGraph(String(q.setup[0]![1])) as Graph;
        const a = q.answer;
        if (kind.id === 'verdict') {
          expect(a.kind === 'choice' && a.correct, where).toBe(refBipartite(g) ? 0 : 1);
        } else if (kind.id === 'side') {
          // Parity of the BFS distance from A decides the side in a bipartite graph.
          const v = /does (\w+) end up/.exec(q.prompt)![1]!;
          const d = new Map([['A', 0]]);
          const queue = ['A'];
          while (queue.length) {
            const u = queue.shift()!;
            for (const e of g.edges) {
              const w = e.u === u ? e.v : e.v === u ? e.u : null;
              if (w && !d.has(w)) {
                d.set(w, d.get(u)! + 1);
                queue.push(w);
              }
            }
          }
          expect(refBipartite(g), where).toBe(true);
          expect(a.kind === 'choice' && a.correct, where).toBe(d.get(v)! % 2);
        } else if (kind.id === 'clash') {
          expect(refBipartite(g), where).toBe(false);
          expect(a.kind === 'choice' && a.options[a.correct], where).toMatch(/^\w+-\w+$/);
        } else if (kind.id === 'cycle') {
          expect(refBipartite(g), where).toBe(false);
          expect(a.kind === 'number' && a.value % 2, where).toBe(1);
        } else {
          throw new Error(`untested kind ${kind.id}`);
        }
      }
    }
  });

  // A learner should not be able to guess the length. Over 300 seeds no length comes up in more
  // than half the questions. Each graph has exactly one odd cycle, so the answer is not a matter
  // of which odd cycle the search happens to find: an edge lies on every odd cycle exactly when
  // removing it leaves the graph bipartite, and there are as many such edges as the answer.
  it('asks for odd cycles of different lengths, each the only odd cycle', () => {
    const kind = bipartite.practice!.find((k) => k.id === 'cycle')!;
    const counts = new Map<number, number>();
    for (let seed = 1; seed <= 300; seed++) {
      const q = kind.make(makeRng(seed));
      const g = parseGraph(String(q.setup[0]![1])) as Graph;
      if (q.answer.kind !== 'number') throw new Error('expected a number');
      const n = q.answer.value;
      counts.set(n, (counts.get(n) ?? 0) + 1);
      const onEvery = g.edges.filter((e) =>
        refBipartite({ ...g, edges: g.edges.filter((x) => x !== e) }),
      );
      expect(onEvery.length, `seed ${seed}`).toBe(n);
    }
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(150);
    expect([...counts.keys()].sort()).toEqual([3, 5, 7]);
  });
});
