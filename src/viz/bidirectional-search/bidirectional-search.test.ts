import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import type { Graph } from '../_graph/graph';
import { formatGraph, parseGraph } from '../_graph/parse';
import { bidirectionalSearch } from '.';
import type { BiRun, BiSettings, Side } from './model';

const letters = 'ABCDEFGHIJ'.split('');
const graphArb = fc
  .record({
    n: fc.integer({ min: 1, max: 10 }),
    directed: fc.boolean(),
    pairs: fc.array(fc.tuple(fc.nat(9), fc.nat(9)), { maxLength: 18 }),
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

/** Distances by plain BFS, forwards from x or backwards into x; written independently. */
function bfs(g: Graph, x: string, backwards: boolean): Map<string, number> {
  const d = new Map([[x, 0]]);
  const queue = [x];
  while (queue.length) {
    const u = queue.shift()!;
    for (const e of g.edges) {
      const pairs: [string, string][] = g.directed
        ? [backwards ? [e.v, e.u] : [e.u, e.v]]
        : [
            [e.u, e.v],
            [e.v, e.u],
          ];
      for (const [a, b] of pairs)
        if (a === u && !d.has(b)) {
          d.set(b, d.get(u)! + 1);
          queue.push(b);
        }
    }
  }
  return d;
}

const hasArc = (g: Graph, u: string, v: string) =>
  g.edges.some((e) => (e.u === u && e.v === v) || (!g.directed && e.u === v && e.v === u));

function runOf(g: Graph, s: string, t: string, side: Side) {
  const tl = new Timeline(
    bidirectionalSearch,
    { ...bidirectionalSearch.defaults, side } as BiSettings,
    1,
    [
      ['load', formatGraph(g)],
      ['run', s, t],
    ],
  );
  const steps = tl.entries.at(-1)!.steps;
  return { steps, r: steps.at(-1)!.extra!.run! as BiRun };
}

describe('bidirectional search', () => {
  it('finds a shortest path, with true distances on both sides at every step', () => {
    fc.assert(
      fc.property(
        graphArb,
        fc.nat(9),
        fc.nat(9),
        fc.constantFrom<Side>('alternate', 'smaller'),
        (g, a, b, side) => {
          const s = g.vertices[a % g.vertices.length]!;
          const t = g.vertices[b % g.vertices.length]!;
          const { steps, r } = runOf(g, s, t, side);
          const fromS = bfs(g, s, false);
          const toT = bfs(g, t, true);
          for (const st of steps) {
            const run = st.extra?.run;
            if (!run) continue;
            for (const [v, d] of Object.entries(run.ds)) expect(d).toBe(fromS.get(v));
            for (const [v, d] of Object.entries(run.dt)) expect(d).toBe(toT.get(v));
          }
          if (!fromS.has(t)) {
            expect(r.path).toBeNull();
            return;
          }
          expect(r.path![0]).toBe(s);
          expect(r.path!.at(-1)).toBe(t);
          expect(r.path!.length - 1).toBe(fromS.get(t));
          for (let i = 1; i < r.path!.length; i++)
            expect(hasArc(g, r.path![i - 1]!, r.path![i]!)).toBe(true);
          // Never more than every vertex, once per side.
          expect(r.expanded).toBeLessThanOrEqual(2 * g.vertices.length);
        },
      ),
      { numRuns: 400 },
    );
  });

  it('saves work on a bushy graph and none on a path', () => {
    const bushy = parseGraph(
      'A-B, A-C, A-D, B-E, B-F, C-G, C-H, D-I, E-J, F-J, G-K, I-L, J-M, K-M, L-M, H-N',
    ) as Graph;
    const b = runOf(bushy, 'A', 'M', 'alternate').r;
    expect(b.expanded).toBeLessThan(b.plain);
    const path = parseGraph('A-B, B-C, C-D, D-E, E-F, F-G, G-H') as Graph;
    const p = runOf(path, 'A', 'H', 'alternate').r;
    expect(p.expanded).toBe(p.plain);
  });

  it('refuses a vertex the graph does not have', () => {
    const t = new Timeline(bidirectionalSearch, bidirectionalSearch.defaults, 1, [
      ['run', 'A', 'Z'],
    ]);
    expect(t.entries[0]!.steps.at(-1)!.say).toContain('There is no vertex Z');
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(bidirectionalSearch, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(bidirectionalSearch, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
