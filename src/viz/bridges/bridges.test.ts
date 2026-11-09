import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeRng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import type { Graph } from '../_graph/graph';
import { parseGraph } from '../_graph/parse';
import { bridges } from '.';
import { pseudocode, type BridgesRun } from './model';

// ---------------------------------------------------------------------------------------------
// Reference: brute force. Remove each vertex (or edge) and count the pieces that are left.

function pieces(vertices: string[], edges: [string, string][]): number {
  const adj = new Map(vertices.map((v) => [v, [] as string[]]));
  for (const [u, v] of edges) {
    adj.get(u)!.push(v);
    adj.get(v)!.push(u);
  }
  const seen = new Set<string>();
  let n = 0;
  for (const s of vertices) {
    if (seen.has(s)) continue;
    n++;
    const todo = [s];
    seen.add(s);
    while (todo.length) {
      for (const v of adj.get(todo.pop()!)!) {
        if (!seen.has(v)) {
          seen.add(v);
          todo.push(v);
        }
      }
    }
  }
  return n;
}

function refCuts(g: Graph): { cuts: string[]; bridges: string[] } {
  const edges = g.edges.map((e): [string, string] => [e.u, e.v]);
  const base = pieces(g.vertices, edges);
  const cuts = g.vertices.filter(
    (x) =>
      pieces(
        g.vertices.filter((v) => v !== x),
        edges.filter(([u, v]) => u !== x && v !== x),
      ) > base,
  );
  const br = edges
    .filter(
      (e) =>
        pieces(
          g.vertices,
          edges.filter((f) => f !== e),
        ) > base,
    )
    .map(([u, v]) => `${u}-${v}`);
  return { cuts, bridges: br };
}

/** Low values by their definition: the smallest d reachable down the tree plus one back edge. */
function refLow(g: Graph): Map<string, number> {
  const adj = new Map(g.vertices.map((v) => [v, [] as string[]]));
  for (const e of g.edges) {
    adj.get(e.u)!.push(e.v);
    adj.get(e.v)!.push(e.u);
  }
  for (const l of adj.values()) l.sort();
  const d = new Map<string, number>();
  const parent = new Map<string, string>();
  let time = 0;
  const visit = (u: string) => {
    d.set(u, ++time);
    for (const v of adj.get(u)!)
      if (!d.has(v)) {
        parent.set(v, u);
        visit(v);
      }
  };
  for (const u of [...g.vertices].sort()) if (!d.has(u)) visit(u);
  const below = (u: string): string[] => [
    u,
    ...g.vertices.filter((v) => parent.get(v) === u).flatMap(below),
  ];
  const low = new Map<string, number>();
  for (const u of g.vertices) {
    let best = d.get(u)!;
    for (const x of below(u))
      for (const w of adj.get(x)!)
        if (parent.get(x) !== w && parent.get(w) !== x) best = Math.min(best, d.get(w)!);
    low.set(u, best);
  }
  return low;
}

function checkStep(g: Graph, r: BridgesRun, ref: { cuts: string[]; bridges: string[] }) {
  for (const v of g.vertices) {
    if (r.d[v] === null) expect(r.low[v]).toBeNull();
    else expect(r.low[v]! >= 1 && r.low[v]! <= r.d[v]!, v).toBe(true);
  }
  // Nothing is reported before it is true.
  for (const c of r.cuts) expect(ref.cuts, c).toContain(c);
  for (const b of r.bridges) expect(ref.bridges, b).toContain(b);
  // Bridges are tree edges.
  for (const b of r.bridges) expect(r.edges[b]).toBe('tree');
  // The calls are the gray vertices, a chain of parents.
  const gray = g.vertices.filter((v) => r.color[v] === 'gray').sort((a, b) => r.d[a]! - r.d[b]!);
  expect(r.calls).toEqual(gray);
}

const letters = 'ABCDEFGH'.split('');
const graphArb = fc
  .record({
    n: fc.integer({ min: 1, max: 8 }),
    pairs: fc.array(fc.tuple(fc.nat(7), fc.nat(7)), { maxLength: 14 }),
  })
  .map(({ n, pairs }) => {
    const names = letters.slice(0, n);
    const items = new Set<string>();
    for (const [a, b] of pairs) {
      const [u, v] = [names[a % n]!, names[b % n]!];
      if (u !== v) items.add(u < v ? `${u}-${v}` : `${v}-${u}`);
    }
    return [...items, ...names].join(', ');
  });

describe('cut vertices and bridges', () => {
  it('matches brute force and keeps its invariants on every step', () => {
    fc.assert(
      fc.property(graphArb, (text) => {
        const calls: OpCall[] = [['load', text], ['run']];
        const t = new Timeline(bridges, bridges.defaults, 1, calls);
        const g = t.entries[0]!.end.graph;
        const ref = refCuts(g);
        const steps = t.entries[1]!.steps;
        for (const st of steps) checkStep(g, st.extra!.run!, ref);
        const r = steps.at(-1)!.extra!.run!;
        expect(r.cuts).toEqual(ref.cuts);
        expect([...r.bridges].sort()).toEqual([...ref.bridges].sort());
        // The root rule: a root is a cut vertex exactly when it has two or more children.
        for (const root of r.roots) expect(r.cuts.includes(root)).toBe(r.kids[root]! >= 2);
      }),
      { numRuns: 300 },
    );
  });

  it('refuses a directed graph', () => {
    const t = new Timeline(bridges, bridges.defaults, 1, [['load', 'A>B, B>C'], ['run']]);
    const steps = t.entries[1]!.steps;
    expect(steps).toHaveLength(1);
    expect(steps[0]!.say).toContain('undirected');
  });

  it('keeps pseudocode lines short enough for a phone', () => {
    for (const block of pseudocode())
      for (const l of block.lines)
        expect(2 * l.indent + l.text.length, `${l.id}: ${l.text}`).toBeLessThanOrEqual(33);
  });
});

describe('cut vertices and bridges practice', () => {
  it('has answers that agree with brute force', () => {
    for (let seed = 1; seed <= 100; seed++) {
      for (const kind of bridges.practice!) {
        const q = kind.make(makeRng(seed));
        const where = `${kind.id} seed ${seed}`;
        const g = parseGraph(String(q.setup[0]![1])) as Graph;
        const ref = refCuts(g);
        const a = q.answer;
        if (kind.id === 'cuts') {
          expect(a.kind === 'sequence' && a.value, where).toEqual(ref.cuts);
          // "Each other cut vertex" only when the root is one of several.
          if (!ref.cuts.includes('A') || ref.cuts.length < 3)
            expect(q.explain, where).not.toMatch(/Each other/);
        } else if (kind.id === 'bridges') {
          expect(a.kind === 'number' && a.value, where).toBe(ref.bridges.length);
        } else if (kind.id === 'root') {
          expect(a.kind === 'choice' && a.options[a.correct], where).toBe(
            ref.cuts.includes('A') ? 'Yes' : 'No',
          );
        } else if (kind.id === 'low') {
          const v = /What is `(\w+)\.low`/.exec(q.prompt)![1]!;
          expect(a.kind === 'number' && a.value, where).toBe(refLow(g).get(v));
        } else {
          throw new Error(`untested kind ${kind.id}`);
        }
      }
    }
  });
});
