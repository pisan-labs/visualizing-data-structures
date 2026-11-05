import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeRng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { isAcyclic, type Graph } from '../_graph/graph';
import { parseGraph } from '../_graph/parse';
import { topoDfs } from '.';
import { cycleEdges, pseudocode, type OnCycle, type TopoRun, type TopoSettings } from './model';

// ---------------------------------------------------------------------------------------------
// Reference: a plain recursive DFS over sorted out-lists, written independently of the page.

function refTopo(g: Graph): { order: string[]; back?: [string, string]; f: Map<string, number> } {
  const adj = new Map(g.vertices.map((v) => [v, [] as string[]]));
  for (const e of g.edges) adj.get(e.u)!.push(e.v);
  for (const l of adj.values()) l.sort();
  const state = new Map<string, number>();
  const f = new Map<string, number>();
  const order: string[] = [];
  let time = 0;
  let back: [string, string] | undefined;
  const visit = (u: string): boolean => {
    state.set(u, 1);
    time++;
    for (const v of adj.get(u)!) {
      if (!state.has(v)) {
        if (!visit(v)) return false;
      } else if (state.get(v) === 1) {
        back = [u, v];
        return false;
      }
    }
    state.set(u, 2);
    f.set(u, ++time);
    order.unshift(u);
    return true;
  };
  for (const u of [...g.vertices].sort()) if (!state.has(u) && !visit(u)) break;
  return { order, back, f };
}

function checkStep(g: Graph, r: TopoRun) {
  // L is exactly the black vertices, by decreasing finish time.
  const black = g.vertices.filter((v) => r.color[v] === 'black');
  expect([...r.order].sort()).toEqual([...black].sort());
  for (let i = 1; i < r.order.length; i++)
    expect(r.f[r.order[i - 1]!]! > r.f[r.order[i]!]!).toBe(true);
  // The calls are the gray vertices, a chain of parents.
  const gray = g.vertices.filter((v) => r.color[v] === 'gray').sort((a, b) => r.d[a]! - r.d[b]!);
  expect(r.calls).toEqual(gray);
  for (let i = 1; i < gray.length; i++) expect(r.pi[gray[i]!]).toBe(gray[i - 1]);
  // An arc between two placed vertices points forward in L unless it is a back edge.
  for (const e of g.edges) {
    const a = r.order.indexOf(e.u);
    const b = r.order.indexOf(e.v);
    if (a >= 0 && b >= 0 && r.edges[`${e.u}-${e.v}`] !== 'back') expect(a < b).toBe(true);
  }
  if (r.cycle) {
    const arcs = new Set(g.edges.map((e) => `${e.u}-${e.v}`));
    for (const k of cycleEdges(r.cycle)) expect(arcs.has(k), k).toBe(true);
  }
}

const letters = 'ABCDEFGH'.split('');
const graphArb = fc
  .record({
    n: fc.integer({ min: 1, max: 8 }),
    pairs: fc.array(fc.tuple(fc.nat(7), fc.nat(7)), { maxLength: 18 }),
    dagOnly: fc.boolean(),
  })
  .map(({ n, pairs, dagOnly }) => {
    const names = letters.slice(0, n);
    const items = new Set<string>();
    for (const [a, b] of pairs) {
      let [x, y] = [a % n, b % n];
      if (x === y) continue;
      if (dagOnly && x > y) [x, y] = [y, x];
      items.add(`${names[x]}>${names[y]}`);
    }
    // A lone ">" keeps the graph directed even with no other arcs.
    return [...items, ...names].join(', ') || 'A';
  });

describe('topological sort by DFS', () => {
  it('matches a reference DFS and keeps its invariants on every step', () => {
    fc.assert(
      fc.property(graphArb, fc.constantFrom<OnCycle>('stop', 'finish'), (text, onCycle) => {
        const settings: TopoSettings = { ...topoDfs.defaults, onCycle };
        const calls: OpCall[] = [['load', text], ['run']];
        const t = new Timeline(topoDfs, settings, 1, calls);
        const g = t.entries[0]!.end.graph;
        const steps = t.entries[1]!.steps;
        if (!g.directed) {
          expect(steps).toHaveLength(1);
          expect(steps[0]!.say).toContain('directed graph');
          return;
        }
        for (const st of steps) checkStep(g, st.extra!.run!);
        const r = steps.at(-1)!.extra!.run!;
        const ref = refTopo(g);
        expect(r.backs.length > 0).toBe(!isAcyclic(g));
        if (onCycle === 'stop' && ref.back) {
          expect(r.stopped).toBe(true);
          expect(r.backs).toEqual([ref.back.join('-')]);
        } else if (!ref.back) {
          expect(r.order).toEqual(ref.order);
          for (const v of g.vertices) expect(r.f[v]).toBe(ref.f.get(v));
        } else {
          // Kept going: every vertex is placed, by finish time.
          expect(r.order).toHaveLength(g.vertices.length);
        }
      }),
      { numRuns: 300 },
    );
  });

  it('keeps pseudocode lines short enough for a phone', () => {
    for (const onCycle of ['stop', 'finish'] as const)
      for (const block of pseudocode({ ...topoDfs.defaults, onCycle }))
        for (const l of block.lines)
          expect(2 * l.indent + l.text.length, `${l.id}: ${l.text}`).toBeLessThanOrEqual(33);
  });

  it('sorts the starting graph with G in front', () => {
    const t = new Timeline(topoDfs, topoDfs.defaults, 1, [['run']]);
    expect(t.entries[0]!.steps.at(-1)!.extra!.run!.order).toEqual('G A D E B C F'.split(' '));
  });
});

describe('topological sort practice', () => {
  it('has answers that agree with the reference', () => {
    const kinds = topoDfs.practice!;
    for (let seed = 1; seed <= 120; seed++) {
      for (const kind of kinds) {
        const q = kind.make(makeRng(seed));
        const where = `${kind.id} seed ${seed}`;
        const g = parseGraph(String(q.setup[0]![1])) as Graph;
        const ref = refTopo(g);
        const a = q.answer;
        if (kind.id === 'order') {
          expect(a.kind === 'sequence' && a.value, where).toEqual(ref.order);
        } else if (kind.id === 'first-in') {
          expect(a.kind === 'choice' && a.options[a.correct], where).toBe(ref.order.at(-1));
        } else if (kind.id === 'back-edge') {
          const want = ref.back ? ref.back.join('>') : 'None: the graph is a DAG';
          expect(a.kind === 'choice' && a.options[a.correct], where).toBe(want);
        } else if (kind.id === 'finish-time') {
          const v = /What is `(\w+)\.f`/.exec(q.prompt)![1]!;
          expect(a.kind === 'number' && a.value, where).toBe(ref.f.get(v));
        } else {
          throw new Error(`untested kind ${kind.id}`);
        }
      }
    }
  });
});
