import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeRng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { Graph } from '../_graph/graph';
import { parseGraph } from '../_graph/parse';
import { overlaps } from '../_paths/overlap';
import { floydWarshall as fw } from '.';
import { pseudocode, type FwRun, type FwSettings } from './model';

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

/**
 * Shortest distances from s whose inner vertices all come from `allowed`, by relaxing every arc
 * V times (an arc may start at s itself or at an allowed vertex).
 */
function restricted(g: Graph, s: string, allowed: Set<string>): Map<string, number> {
  const d = new Map([[s, 0]]);
  for (let pass = 0; pass < g.vertices.length; pass++)
    for (const [u, v, w] of arcList(g))
      if ((u === s || allowed.has(u)) && d.has(u) && (!d.has(v) || d.get(u)! + w < d.get(v)!))
        d.set(v, d.get(u)! + w);
  return d;
}

/** Whether the graph has a negative cycle anywhere: Bellman-Ford with every d starting at 0. */
function hasNegativeCycle(g: Graph): boolean {
  const d = new Map(g.vertices.map((v) => [v, 0]));
  for (let pass = 0; pass < g.vertices.length; pass++)
    for (const [u, v, w] of arcList(g)) if (d.get(u)! + w < d.get(v)!) d.set(v, d.get(u)! + w);
  return arcList(g).some(([u, v, w]) => d.get(u)! + w < d.get(v)!);
}

const weight = (g: Graph, u: string, v: string) =>
  g.edges.find((e) => (e.u === u && e.v === v) || (!g.directed && e.u === v && e.v === u))!.w;

// ---------------------------------------------------------------------------------------------

const letters = 'ABCDEF'.split('');
const graphArb = fc
  .record({
    n: fc.integer({ min: 1, max: 6 }),
    directed: fc.integer({ min: 0, max: 3 }),
    negatives: fc.boolean(),
    pairs: fc.array(fc.tuple(fc.nat(5), fc.nat(5), fc.integer({ min: 1, max: 9 })), {
      maxLength: 12,
    }),
  })
  .map(({ n, directed, negatives, pairs }) => {
    const names = letters.slice(0, n);
    const seen = new Set<string>();
    const items: string[] = [];
    pairs.forEach(([a, b, w], k) => {
      const u = names[a % n]!;
      const v = names[b % n]!;
      const key = directed ? `${u}>${v}` : [u, v].sort().join('-');
      if (u === v || seen.has(key)) return;
      seen.add(key);
      // Now and then a negative weight, which may or may not close a negative cycle.
      const weightNow = negatives && k % 3 === 0 ? -w + 3 : w;
      items.push(`${u}${directed ? '>' : '-'}${v}:${weightNow}`);
    });
    return [...items, ...names].join(', ');
  });

describe('Floyd-Warshall', () => {
  it('holds the shortest paths through the first k vertices after round k', () => {
    fc.assert(
      fc.property(graphArb, fc.constantFrom<FwSettings['paths']>('pred', 'next'), (text, paths) => {
        const settings: FwSettings = { ...fw.defaults, paths };
        const t = new Timeline(fw, settings, 1, [['load', text], ['run']]);
        const g = t.entries[0]!.end.graph;
        const V = g.vertices;
        const steps = t.entries[1]!.steps;
        const negative = hasNegativeCycle(g);
        let prev: FwRun | null = null;
        for (const st of steps) {
          expect(st.state.graph).toBe(g);
          const r = st.extra!.run!;
          // Entries only ever go down.
          if (prev)
            V.forEach((_, i) =>
              V.forEach((__, j) => {
                if (prev!.D[i]![j] !== null) {
                  expect(r.D[i]![j]).not.toBeNull();
                  expect(r.D[i]![j]!).toBeLessThanOrEqual(prev!.D[i]![j]!);
                }
              }),
            );
          prev = r;
        }
        if (!negative) {
          // The last step of each round: D(k) is the shortest paths through V[0..k] only.
          for (let k = -1; k < V.length; k++) {
            const at = steps
              .map((st) => st.extra!.run!)
              .filter((r) => r.k === k)
              .at(-1)!;
            const allowed = new Set(V.slice(0, k + 1));
            V.forEach((s, i) => {
              const d = restricted(g, s, allowed);
              V.forEach((v, j) =>
                expect(at.D[i]![j], `D(${k})[${s}][${v}]`).toBe(d.get(v) ?? null),
              );
            });
          }
        }
        const r = steps.at(-1)!.extra!.run!;
        // A negative cycle shows up on the diagonal, and only then.
        expect(V.some((_, x) => r.D[x]![x]! < 0)).toBe(negative);
        if (!negative) {
          // The path matrix agrees with D: one step of the path at a time.
          V.forEach((u, i) =>
            V.forEach((v, j) => {
              if (i === j || r.D[i]![j] === null) {
                expect(r.P[i]![j]).toBeNull();
                return;
              }
              const p = r.P[i]![j]!;
              const x = V.indexOf(p);
              if (paths === 'pred') expect(r.D[i]![j]).toBe(r.D[i]![x]! + weight(g, p, v));
              else expect(r.D[i]![j]).toBe(weight(g, u, p) + r.D[x]![j]!);
            }),
          );
        }
      }),
      { numRuns: 200 },
    );
  });

  it('reads valid paths, says when there is none, and refuses pairs a negative cycle breaks', () => {
    fc.assert(
      fc.property(
        graphArb,
        fc.constantFrom(...letters),
        fc.constantFrom(...letters),
        fc.constantFrom<FwSettings['paths']>('pred', 'next'),
        (text, a, b, paths) => {
          const settings: FwSettings = { ...fw.defaults, paths };
          const t = new Timeline(fw, settings, 1, [
            ['load', text],
            ['path', a, b],
          ]);
          const g = t.entries[0]!.end.graph;
          const last = t.entries[1]!.steps.at(-1)!;
          if (!g.vertices.includes(a) || !g.vertices.includes(b)) {
            expect(last.say).toContain('There is no vertex');
            return;
          }
          const p = last.extra!.path!;
          const reach = restricted(g, a, new Set(g.vertices));
          if (p.result === 'none') {
            expect(reach.has(b)).toBe(false);
          } else if (p.result === 'cycle') {
            expect(hasNegativeCycle(g)).toBe(true);
          } else {
            expect(p.done).toBe(true);
            expect(p.path[0]).toBe(a);
            expect(p.path.at(-1)).toBe(b);
            let total = 0;
            for (let k = 0; k + 1 < p.path.length; k++)
              total += weight(g, p.path[k]!, p.path[k + 1]!);
            if (!hasNegativeCycle(g)) expect(total).toBe(reach.get(b));
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('says when a negative cycle appears on the diagonal', () => {
    const t = new Timeline(fw, fw.defaults, 1, [['load', 'A>B:1, B>C:-2, C>A:-1, C>D:2'], ['run']]);
    const says = t.entries[1]!.steps.map((st) => st.say);
    expect(says.some((s) => s.includes('is below 0: a path from C back to C'))).toBe(true);
    expect(says.at(-1)).toContain('lie on a negative cycle');
  });

  it('draws every curated example without labels on top of each other', () => {
    for (const ex of fw.examples) {
      const settings = { ...fw.defaults, ...ex.settings } as FwSettings;
      const t = new Timeline(fw, settings, 1, ex.ops);
      for (let i = 0; i < t.length; i++)
        expect(overlaps(fw.view(t.at(i).step, settings).shapes), `${ex.id} step ${i}`).toEqual([]);
    }
  });

  it('keeps pseudocode lines short enough for a phone', () => {
    for (const paths of ['pred', 'next'] as const)
      for (const block of pseudocode({ ...fw.defaults, paths }))
        for (const l of block.lines)
          expect(2 * l.indent + l.text.length, `${l.id}: ${l.text}`).toBeLessThanOrEqual(33);
  });
});

describe('Floyd-Warshall practice', () => {
  it('has answers that agree with the reference', () => {
    const kinds = fw.practice!;
    expect(kinds.length).toBeGreaterThanOrEqual(3);
    expect(kinds.length).toBeLessThanOrEqual(4);
    for (let seed = 1; seed <= 150; seed++) {
      for (const kind of kinds) {
        const q = kind.make(makeRng(seed));
        const where = `${kind.id} seed ${seed}`;
        const g = parseGraph(String(q.setup[0]![1])) as Graph;
        const V = g.vertices;
        expect(q.watch).toEqual([['run']]);
        const a = q.answer;
        if (kind.id === 'after-round') {
          const [, s, v, k] = /`D\[(\w+)\]\[(\w+)\]` right after round (\d+)/.exec(q.prompt)!;
          const d = restricted(g, s!, new Set(V.slice(0, Number(k))));
          expect(a.kind === 'number' && a.value, where).toBe(d.get(v!));
        } else if (kind.id === 'final') {
          const [, s, v] = /`D\[(\w+)\]\[(\w+)\]` at the end/.exec(q.prompt)!;
          expect(a.kind === 'number' && a.value, where).toBe(restricted(g, s!, new Set(V)).get(v!));
        } else if (kind.id === 'pred') {
          const [, s, v] = /`Π\[(\w+)\]\[(\w+)\]`/.exec(q.prompt)!;
          const d = restricted(g, s!, new Set(V));
          const p = a.kind === 'choice' ? a.options[a.correct]! : '';
          expect(d.get(p)! + weight(g, p, v!), where).toBe(d.get(v!));
          // No other option is a way in with the same total: one right answer.
          const into = (x: string) =>
            g.edges.some(
              (e) => (e.u === x && e.v === v) || (!g.directed && e.u === v && e.v === x),
            );
          for (const o of a.kind === 'choice' ? a.options : [])
            if (o !== p && o !== v && d.has(o) && into(o))
              expect(d.get(o)! + weight(g, o, v!), where).toBeGreaterThan(d.get(v!)!);
        } else if (kind.id === 'round-changes') {
          const k = Number(/round (\d+), k =/.exec(q.prompt)![1]) - 1;
          const before = new Set(V.slice(0, k));
          const after = new Set(V.slice(0, k + 1));
          let n = 0;
          for (const s of V) {
            const x = restricted(g, s, before);
            const y = restricted(g, s, after);
            for (const v of V) if (x.get(v) !== y.get(v)) n++;
          }
          expect(a.kind === 'number' && a.value, where).toBe(n);
        } else {
          throw new Error(`untested kind ${kind.id}`);
        }
      }
    }
  });
});
