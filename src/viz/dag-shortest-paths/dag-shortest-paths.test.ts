import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeRng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import type { Graph } from '../_graph/graph';
import { parseGraph } from '../_graph/parse';
import { dagShortestPaths as dag } from '.';
import { pseudocode, type DagRun, type DagSettings } from './model';
import { smallestText } from '../../render/text-size';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import textSizeDef from './index';

// ---------------------------------------------------------------------------------------------
// References, written independently of the page.

type Arc = [string, string, number];

const arcList = (g: Graph): Arc[] =>
  g.edges.flatMap((e): Arc[] =>
    g.directed
      ? [[e.u, e.v, e.w]]
      : [
          [e.u, e.v, e.w],
          [e.v, e.u, e.w],
        ],
  );

/** Whether a directed graph has a cycle, by repeatedly removing vertices with no edges in. */
function hasCycle(g: Graph): boolean {
  if (!g.directed) return g.edges.length > 0;
  const indeg = new Map(g.vertices.map((v) => [v, 0]));
  for (const [, v] of arcList(g)) indeg.set(v, indeg.get(v)! + 1);
  const ready = g.vertices.filter((v) => indeg.get(v) === 0);
  let seen = 0;
  while (ready.length) {
    const u = ready.pop()!;
    seen++;
    for (const [a, b] of arcList(g))
      if (a === u) {
        indeg.set(b, indeg.get(b)! - 1);
        if (indeg.get(b) === 0) ready.push(b);
      }
  }
  return seen < g.vertices.length;
}

/** Shortest (or, with sign -1, longest) distances by relaxing every arc V times. */
function distances(g: Graph, s: string, sign = 1): Map<string, number> {
  const d = new Map([[s, 0]]);
  for (let i = 0; i < g.vertices.length; i++)
    for (const [u, v, w] of arcList(g))
      if (d.has(u) && (!d.has(v) || sign * (d.get(u)! + w) < sign * d.get(v)!))
        d.set(v, d.get(u)! + w);
  return d;
}

const weight = (g: Graph, u: string, v: string) =>
  g.edges.find((e) => (e.u === u && e.v === v) || (!g.directed && e.u === v && e.v === u))!.w;

// ---------------------------------------------------------------------------------------------

const letters = 'ABCDEFGH'.split('');
const graphArb = fc
  .record({
    n: fc.integer({ min: 1, max: 8 }),
    directed: fc.integer({ min: 0, max: 7 }),
    acyclic: fc.boolean(),
    pairs: fc.array(fc.tuple(fc.nat(7), fc.nat(7), fc.integer({ min: -5, max: 9 })), {
      maxLength: 16,
    }),
  })
  .map(({ n, directed, acyclic, pairs }) => {
    const names = letters.slice(0, n);
    const isDirected = directed > 0;
    const seen = new Set<string>();
    const items: string[] = [];
    for (const [a, b, w] of pairs) {
      // Half of the directed graphs are DAGs: arcs from earlier to later letters.
      let [x, y] = [a % n, b % n];
      if (isDirected && acyclic && x > y) [x, y] = [y, x];
      const u = names[x]!;
      const v = names[y]!;
      const key = isDirected ? `${u}>${v}` : [u, v].sort().join('-');
      if (u === v || seen.has(key)) continue;
      seen.add(key);
      items.push(`${u}${isDirected ? '>' : '-'}${v}:${w}`);
    }
    return [...items, ...names].join(', ');
  });

describe('DAG shortest paths', () => {
  it('matches the references and keeps its invariants on every step', () => {
    fc.assert(
      fc.property(
        graphArb,
        fc.constantFrom(...letters, 'Z'),
        fc.constantFrom<DagSettings['goal']>('shortest', 'longest'),
        (text, s, goal) => {
          const settings: DagSettings = { ...dag.defaults, goal };
          const longest = goal === 'longest';
          const calls: OpCall[] = [
            ['load', text],
            ['run', s],
          ];
          const t = new Timeline(dag, settings, 1, calls);
          const g = t.entries[0]!.end.graph;
          const entry = t.entries[1]!;
          if (!g.vertices.includes(s)) {
            expect(entry.steps).toHaveLength(1);
            expect(entry.steps[0]!.say).toContain(`There is no vertex ${s}.`);
            return;
          }
          const last = entry.steps.at(-1)!.extra!.run!;
          if (hasCycle(g)) {
            // Refused, with a real cycle named.
            expect(last.phase).toBe('cycle');
            const c = last.cycle!;
            expect(c.length).toBeGreaterThanOrEqual(2);
            expect(new Set(c).size).toBe(c.length);
            for (let k = 0; k < c.length; k++)
              expect(
                arcList(g).some(([u, v]) => u === c[k] && v === c[(k + 1) % c.length]),
                `${c[k]} -> ${c[(k + 1) % c.length]}`,
              ).toBe(true);
            expect(entry.steps.at(-1)!.say).toMatch(/cannot run here|will not run/);
            return;
          }
          const truth = distances(g, s, longest ? -1 : 1);
          let prev: DagRun | null = null;
          for (const st of entry.steps) {
            expect(st.state.graph).toBe(g);
            const r = st.extra!.run!;
            // L only ever holds finished vertices, and every arc out of one of them goes to a
            // vertex that finished before it (later in L).
            for (const v of r.order) expect(r.color[v]).toBe('black');
            for (const [u, v] of arcList(g))
              if (r.order.includes(u))
                expect(r.order.indexOf(v)).toBeGreaterThan(r.order.indexOf(u));
            for (const v of g.vertices) {
              if (prev && prev.d[v] !== null) {
                expect(r.d[v]).not.toBeNull();
                if (longest) expect(r.d[v]!).toBeGreaterThanOrEqual(prev.d[v]!);
                else expect(r.d[v]!).toBeLessThanOrEqual(prev.d[v]!);
              }
              if (r.pi[v] !== null) expect(r.d[v]).toBe(r.d[r.pi[v]!]! + weight(g, r.pi[v]!, v));
            }
            // The vertex whose edges are being relaxed already has its final d.
            if (r.phase === 'relax' && r.k >= 0) {
              const u = r.order[r.k]!;
              expect(r.d[u]).toBe(truth.has(u) ? truth.get(u)! : null);
            }
            // Right after RELAX(u, v), v is at least as good as going through u.
            if (st.lines.includes('relax') && r.u && r.v && r.d[r.u] !== null) {
              const via = r.d[r.u]! + weight(g, r.u, r.v);
              if (longest) expect(r.d[r.v]!).toBeGreaterThanOrEqual(via);
              else expect(r.d[r.v]!).toBeLessThanOrEqual(via);
            }
            prev = r;
          }
          expect(last.phase).toBe('done');
          expect(last.order).toHaveLength(g.vertices.length);
          for (const v of g.vertices) expect(last.d[v], `d[${v}]`).toBe(truth.get(v) ?? null);
          const arcs = arcList(g).length;
          expect(last.relax).toBe(arcs);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('refuses an undirected graph, naming its first edge as a cycle', () => {
    const t = new Timeline(dag, dag.defaults, 1, [
      ['load', 'B-C:1, A-C:2'],
      ['run', 'A'],
    ]);
    const st = t.entries[1]!.steps.at(-1)!;
    expect(st.say).toContain('A-C alone is the cycle A → C → A');
    expect(st.extra!.run!.cycle).toEqual(['A', 'C']);
  });

  it('finds the critical path with longest paths', () => {
    const t = new Timeline(dag, { ...dag.defaults, goal: 'longest' }, 1, [
      ['load', 'A>B:3, A>C:2, B>D:4, C>D:6, C>E:3, D>F:3, E>F:5, F>G:1'],
      ['run', 'A'],
    ]);
    expect(t.entries[1]!.steps.at(-1)!.say).toContain(
      'The critical path is A → C → D → F → G, total 12',
    );
  });

  it('keeps pseudocode lines short enough for a phone', () => {
    for (const goal of ['shortest', 'longest'] as const)
      for (const block of pseudocode({ ...dag.defaults, goal }))
        for (const l of block.lines)
          expect(2 * l.indent + l.text.length, `${l.id}: ${l.text}`).toBeLessThanOrEqual(33);
  });
});

/** The topological order CLRS's DFS gives: name order for vertices and neighbours. */
function dfsOrder(g: Graph): string[] {
  const adj = new Map(g.vertices.map((v) => [v, [] as string[]]));
  for (const [u, v] of arcList(g)) adj.get(u)!.push(v);
  for (const list of adj.values()) list.sort();
  const done = new Set<string>();
  const out: string[] = [];
  const visit = (u: string) => {
    done.add(u);
    for (const v of adj.get(u)!) if (!done.has(v)) visit(v);
    out.unshift(u);
  };
  for (const v of g.vertices) if (!done.has(v)) visit(v);
  return out;
}

describe('DAG shortest paths practice', () => {
  it('has answers that agree with the reference', () => {
    const kinds = dag.practice!;
    expect(kinds.length).toBeGreaterThanOrEqual(3);
    expect(kinds.length).toBeLessThanOrEqual(4);
    for (let seed = 1; seed <= 150; seed++) {
      for (const kind of kinds) {
        const q = kind.make(makeRng(seed));
        const where = `${kind.id} seed ${seed}`;
        const g = parseGraph(String(q.setup[0]![1])) as Graph;
        expect(hasCycle(g)).toBe(false);
        expect(q.watch).toEqual([['run', 'A']]);
        const a = q.answer;
        if (kind.id === 'order') {
          expect(a.kind === 'sequence' && a.value, where).toEqual(dfsOrder(g));
        } else if (kind.id === 'distance') {
          const v = /`(\w+)\.d`/.exec(q.prompt)![1]!;
          expect(a.kind === 'number' && a.value, where).toBe(distances(g, 'A').get(v));
        } else if (kind.id === 'parent') {
          const v = /`(\w+)\.π`/.exec(q.prompt)![1]!;
          const d = distances(g, 'A');
          const p = a.kind === 'choice' ? a.options[a.correct]! : '';
          expect(d.get(p)! + weight(g, p, v), where).toBe(d.get(v));
          // No other option is a way in with the same total: one right answer.
          for (const o of a.kind === 'choice' ? a.options : [])
            if (o !== p && d.has(o) && g.edges.some((e) => e.u === o && e.v === v))
              expect(d.get(o)! + weight(g, o, v), where).toBeGreaterThan(d.get(v)!);
        } else if (kind.id === 'critical') {
          expect(q.settings?.goal).toBe('longest');
          const best = Math.max(...distances(g, 'A', -1).values());
          expect(a.kind === 'number' && a.value, where).toBe(best);
        } else {
          throw new Error(`untested kind ${kind.id}`);
        }
      }
    }
  });
});

describe('drawn text size', () => {
  // The layered example stood 466 units tall (10.7 px on a laptop); turned on its side it reads at 17.
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(textSizeDef, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(textSizeDef, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
