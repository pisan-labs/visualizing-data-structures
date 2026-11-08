import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeRng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import type { Graph } from '../_graph/graph';
import { parseGraph } from '../_graph/parse';
import { dijkstra } from '.';
import { pseudocode, type DijkstraRun, type DijkstraSettings } from './model';
import { smallestText } from '../../render/text-size';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import textSizeDef from './index';

// ---------------------------------------------------------------------------------------------
// References, written independently of the page.

type Arcs = Map<string, { v: string; w: number }[]>;

function arcsOf(g: Graph): Arcs {
  const adj: Arcs = new Map(g.vertices.map((v) => [v, []]));
  for (const e of g.edges) {
    adj.get(e.u)!.push({ v: e.v, w: e.w });
    if (!g.directed) adj.get(e.v)!.push({ v: e.u, w: e.w });
  }
  return adj;
}

/** True distances by relaxing every arc V times (no queue at all). */
function bellmanFord(g: Graph, s: string): Map<string, number> {
  const d = new Map([[s, 0]]);
  const adj = arcsOf(g);
  for (let i = 0; i < g.vertices.length; i++)
    for (const [u, list] of adj)
      for (const { v, w } of list)
        if (d.has(u) && (!d.has(v) || d.get(u)! + w < d.get(v)!)) d.set(v, d.get(u)! + w);
  return d;
}

/** Dijkstra with an array: scan for the smallest d, ties by vertex order; relax in name order. */
function arrayDijkstra(g: Graph, s: string) {
  const adj = arcsOf(g);
  for (const list of adj.values())
    list.sort((a, b) => g.vertices.indexOf(a.v) - g.vertices.indexOf(b.v));
  const d = new Map<string, number>([[s, 0]]);
  const pi = new Map<string, string>();
  const done = new Set<string>();
  const order: string[] = [];
  for (;;) {
    let u: string | null = null;
    for (const v of g.vertices)
      if (!done.has(v) && d.has(v) && (u === null || d.get(v)! < d.get(u)!)) u = v;
    if (u === null) break;
    done.add(u);
    order.push(u);
    for (const { v, w } of adj.get(u)!) {
      if (!d.has(v) || d.get(u)! + w < d.get(v)!) {
        d.set(v, d.get(u)! + w);
        pi.set(v, u);
      }
    }
  }
  return { d, pi, order };
}

// ---------------------------------------------------------------------------------------------

const letters = 'ABCDEFGHI'.split('');
const graphArb = fc
  .record({
    n: fc.integer({ min: 1, max: 9 }),
    directed: fc.boolean(),
    negative: fc.integer({ min: 0, max: 5 }),
    pairs: fc.array(fc.tuple(fc.nat(8), fc.nat(8), fc.integer({ min: 0, max: 9 })), {
      maxLength: 20,
    }),
  })
  .map(({ n, directed, negative, pairs }) => {
    const names = letters.slice(0, n);
    const seen = new Set<string>();
    const items: string[] = [];
    pairs.forEach(([a, b, w], i) => {
      const u = names[a % n]!;
      const v = names[b % n]!;
      const key = directed ? `${u}>${v}` : [u, v].sort().join('-');
      if (u === v || seen.has(key)) return;
      seen.add(key);
      // Now and then a negative weight, which Dijkstra must refuse.
      const weight = negative === 0 && i === 0 ? -w - 1 : w;
      items.push(`${u}${directed ? '>' : '-'}${v}:${weight}`);
    });
    return [...items, ...names].join(', ');
  });

function checkStep(
  g: Graph,
  r: DijkstraRun,
  prev: DijkstraRun | null,
  truth: Map<string, number>,
  lazy: boolean,
  vars: Record<string, unknown>,
) {
  const adj = arcsOf(g);
  for (const v of g.vertices) {
    // d never increases, and never goes below the true distance.
    if (prev && prev.d[v] !== null) expect(r.d[v], `d[${v}] stays set`).not.toBeNull();
    if (prev && prev.d[v] !== null) expect(r.d[v]!).toBeLessThanOrEqual(prev.d[v]!);
    if (r.d[v] !== null) expect(r.d[v]!).toBeGreaterThanOrEqual(truth.get(v)!);
    // A settled vertex's d is final.
    if (r.S.includes(v)) expect(r.d[v]).toBe(truth.has(v) ? truth.get(v)! : null);
    // π agrees with d.
    if (r.pi[v] !== null) {
      const u = r.pi[v]!;
      const w = adj.get(u)!.find((a) => a.v === v)!.w;
      expect(r.d[v]).toBe(r.d[u]! + w);
    }
  }
  // Every edge relaxed from a settled vertex keeps d[v] <= d[u] + w(u, v).
  for (const u of r.S) {
    if (r.d[u] === null) continue;
    const relaxedAll = u !== r.u;
    for (const { v, w } of adj.get(u)!) {
      if (!relaxedAll) continue;
      expect(r.d[v], `${u}->${v} relaxed`).not.toBeNull();
      expect(r.d[v]!).toBeLessThanOrEqual(r.d[u]! + w);
    }
  }
  const unsettled = g.vertices.filter((v) => !r.S.includes(v));
  if (!lazy) {
    // Q holds exactly the vertices not settled, keyed by d, smallest first.
    expect(r.Q.map((q) => q.v).sort()).toEqual([...unsettled].sort());
    for (const q of r.Q) expect(q.k).toBe(r.d[q.v]);
  } else {
    for (const v of unsettled)
      if (r.d[v] !== null) expect(r.Q.some((q) => q.v === v && q.k === r.d[v])).toBe(true);
  }
  const keys = r.Q.map((q) => (q.k === null ? Infinity : q.k));
  for (let i = 1; i < keys.length; i++) expect(keys[i]!).toBeGreaterThanOrEqual(keys[i - 1]!);
  expect(r.Q.length).toBeLessThanOrEqual(r.room);
  expect(vars.Q).toBe(r.Q.length);
  expect(vars.relax).toBe(r.relax);
}

describe("Dijkstra's algorithm", () => {
  it('matches the references and keeps its invariants on every step', () => {
    fc.assert(
      fc.property(
        graphArb,
        fc.constantFrom(...letters, 'Z'),
        fc.constantFrom<DijkstraSettings['queue']>('decrease', 'lazy'),
        (text, s, queue) => {
          const settings: DijkstraSettings = { ...dijkstra.defaults, queue };
          const calls: OpCall[] = [
            ['load', text],
            ['run', s],
          ];
          const t = new Timeline(dijkstra, settings, 1, calls);
          const g = t.entries[0]!.end.graph;
          const entry = t.entries[1]!;
          if (!g.vertices.includes(s)) {
            expect(entry.steps).toHaveLength(1);
            expect(entry.steps[0]!.say).toContain(`There is no vertex ${s}.`);
            return;
          }
          if (g.edges.some((e) => e.w < 0)) {
            // Refused, with the reason, and nothing run.
            expect(entry.steps).toHaveLength(1);
            const say = entry.steps[0]!.say;
            expect(say).toContain('Dijkstra will not run on this graph');
            expect(say).toContain('/bellman-ford/');
            expect(entry.steps[0]!.extra?.run).toBeUndefined();
            expect(entry.steps[0]!.marks.every((m) => m.role === 'error')).toBe(true);
            return;
          }
          const truth = bellmanFord(g, s);
          let prev: DijkstraRun | null = null;
          for (const st of entry.steps) {
            expect(st.state.graph).toBe(g);
            const r = st.extra!.run!;
            checkStep(g, r, prev, truth, queue === 'lazy', st.vars ?? {});
            prev = r;
          }
          const r = entry.steps.at(-1)!.extra!.run!;
          const ref = arrayDijkstra(g, s);
          expect(r.Q).toEqual([]);
          for (const v of g.vertices) {
            expect(r.d[v], `d[${v}]`).toBe(truth.has(v) ? truth.get(v)! : null);
            expect(r.pi[v], `π[${v}]`).toBe(ref.pi.get(v) ?? null);
          }
          // The reachable vertices are settled in the reference's order; CLRS's queue then
          // empties the unreachable ones in name order.
          expect(r.S.filter((v) => r.d[v] !== null)).toEqual(ref.order);
          const arcs = [...arcsOf(g).values()].reduce((n, l) => n + l.length, 0);
          const reachedArcs = ref.order.reduce((n, u) => n + arcsOf(g).get(u)!.length, 0);
          expect(r.relax).toBe(queue === 'decrease' ? arcs : reachedArcs);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('settles the same order with either queue', () => {
    const calls: OpCall[] = [
      ['load', 'A>B:5, A>C:2, B>D:4, B>E:2, C>B:1, C>D:6, D>G:3, E>D:1, E>F:4, F>G:1'],
      ['run', 'A'],
    ];
    const end = (queue: DijkstraSettings['queue']) =>
      new Timeline(dijkstra, { ...dijkstra.defaults, queue }, 1, calls).entries[1]!.steps.at(-1)!
        .extra!.run!;
    const a = end('decrease');
    const b = end('lazy');
    expect([a.S, a.d, a.pi]).toEqual([b.S, b.d, b.pi]);
    expect(a.S).toEqual(['A', 'C', 'B', 'E', 'D', 'F', 'G']);
  });

  it('names what goes wrong with a negative edge', () => {
    const say = (text: string) =>
      new Timeline(dijkstra, dijkstra.defaults, 1, [
        ['load', text],
        ['run', 'A'],
      ]).entries[1]!.steps[0]!.say;
    expect(say('A>B:2, A>C:4, C>B:-3, B>D:2')).toContain(
      'Here it would settle B with d = 2, but A → C → B costs 1.',
    );
    expect(say('A>B:1, B>C:2, C>B:-3')).toContain('negative cycle, B → C → B');
    expect(say('A>B:1, C>D:-2')).toContain('happens to give the right distances');
    expect(say('A-B:1, B-C:-1')).toContain('an undirected edge goes both ways');
  });

  it('keeps pseudocode lines short enough for a phone', () => {
    for (const queue of ['decrease', 'lazy'] as const)
      for (const block of pseudocode({ ...dijkstra.defaults, queue }))
        for (const l of block.lines)
          expect(2 * l.indent + l.text.length, `${l.id}: ${l.text}`).toBeLessThanOrEqual(33);
  });
});

describe('Dijkstra practice', () => {
  it('has answers that agree with the reference', () => {
    const kinds = dijkstra.practice!;
    expect(kinds.length).toBeGreaterThanOrEqual(3);
    expect(kinds.length).toBeLessThanOrEqual(4);
    for (let seed = 1; seed <= 150; seed++) {
      for (const kind of kinds) {
        const q = kind.make(makeRng(seed));
        const where = `${kind.id} seed ${seed}`;
        const g = parseGraph(String(q.setup[0]![1])) as Graph;
        expect(q.watch).toEqual([['run', 'A']]);
        const ref = arrayDijkstra(g, 'A');
        const a = q.answer;
        if (kind.id === 'next') {
          const u = /Right after (\w+) is settled/.exec(q.prompt)![1]!;
          const next = ref.order[ref.order.indexOf(u) + 1];
          expect(a.kind === 'choice' && a.options[a.correct], where).toBe(next);
        } else if (kind.id === 'distance') {
          const v = /`(\w+)\.d`/.exec(q.prompt)![1]!;
          expect(a.kind === 'number' && a.value, where).toBe(ref.d.get(v));
          expect(ref.d.get(v)).toBe(bellmanFord(g, 'A').get(v));
        } else if (kind.id === 'path') {
          const v = /from A to (\w+) that/.exec(q.prompt)![1]!;
          const path = [v];
          while (ref.pi.has(path[0]!)) path.unshift(ref.pi.get(path[0]!)!);
          expect(a.kind === 'sequence' && a.value, where).toEqual(path);
        } else if (kind.id === 'key') {
          const [, u, v] =
            /Right after (\w+) is settled and its edges are relaxed, what is (\w+)'s key/.exec(
              q.prompt,
            )!;
          // The key after u: the lightest path to v whose vertices before v are settled by then.
          const settled = ref.order.slice(0, ref.order.indexOf(u!) + 1);
          const adj = arcsOf(g);
          let best = Infinity;
          for (const x of settled)
            for (const arc of adj.get(x)!)
              if (arc.v === v) best = Math.min(best, ref.d.get(x)! + arc.w);
          expect(a.kind === 'number' && a.value, where).toBe(best);
        } else {
          throw new Error(`untested kind ${kind.id}`);
        }
      }
    }
  });
});

describe('drawn text size', () => {
  // A long layered chain stood 466 units tall under its panels (9.9 px on a laptop); turned on its side it reads at 16.
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(textSizeDef, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(textSizeDef, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
