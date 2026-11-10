import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeRng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import type { Graph } from '../_graph/graph';
import { parseGraph } from '../_graph/parse';
import { topoIndegree as topo } from '.';
import { pseudocode, type Ready, type TopoRun, type TopoSettings } from './model';
import { smallestText } from '../../render/text-size';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import textSizeDef from './index';

// ---------------------------------------------------------------------------------------------
// References, written independently of the page.

const hasArc = (g: Graph, u: string, v: string) => g.edges.some((e) => e.u === u && e.v === v);

/** reach[u] holds every vertex reachable from u by one or more arcs (a transitive closure). */
function closure(g: Graph): Map<string, Set<string>> {
  const reach = new Map(g.vertices.map((v) => [v, new Set<string>()]));
  for (const e of g.edges) reach.get(e.u)!.add(e.v);
  for (const k of g.vertices)
    for (const i of g.vertices)
      if (reach.get(i)!.has(k)) for (const j of reach.get(k)!) reach.get(i)!.add(j);
  return reach;
}

/** Vertices no topological sort can place: those reachable from a vertex on a cycle. */
function stuck(g: Graph): string[] {
  const reach = closure(g);
  const onCycle = g.vertices.filter((v) => reach.get(v)!.has(v));
  return g.vertices.filter((v) => onCycle.some((c) => c === v || reach.get(c)!.has(v)));
}

/** Repeatedly take the smallest vertex whose in-neighbours are all placed. */
function smallestOrder(g: Graph): string[] {
  const placed: string[] = [];
  for (;;) {
    const next = g.vertices.find(
      (v) => !placed.includes(v) && g.edges.every((e) => e.v !== v || placed.includes(e.u)),
    );
    if (!next) return placed;
    placed.push(next);
  }
}

/** Invariants every step keeps. */
function checkRun(g: Graph, r: TopoRun, vars: Record<string, unknown>) {
  for (const v of g.vertices) {
    if (r.indeg[v] === null) continue;
    const left = g.edges.filter((e) => e.v === v && !r.order.includes(e.u)).length;
    // A decrement happens arc by arc, so the vertex being scanned may not be done yet.
    if (r.u === undefined) expect(r.indeg[v], `in[${v}]`).toBe(left);
    expect(r.indeg[v]!).toBeGreaterThanOrEqual(left);
  }
  for (const v of r.queue) {
    expect(r.indeg[v]).toBe(0);
    expect(r.order).not.toContain(v);
  }
  expect(new Set([...r.queue, ...r.order]).size).toBe(r.queue.length + r.order.length);
  // Everything before a vertex in the order... every arc into an output vertex comes from
  // an earlier one.
  r.order.forEach((v, i) => {
    for (const e of g.edges) if (e.v === v) expect(r.order.slice(0, i)).toContain(e.u);
  });
  if (r.ready === 'smallest') {
    const sorted = [...r.queue].sort();
    expect(r.queue).toEqual(sorted);
  }
  expect(vars.output).toBe(r.order.length);
}

const letters = 'ABCDEFGHI'.split('');
const graphArb = fc
  .record({
    n: fc.integer({ min: 1, max: 9 }),
    dag: fc.boolean(),
    pairs: fc.array(fc.tuple(fc.nat(8), fc.nat(8)), { maxLength: 14 }),
  })
  .map(({ n, dag, pairs }) => {
    const names = letters.slice(0, n);
    const seen = new Set<string>();
    const items: string[] = [];
    for (const [a, b] of pairs) {
      let u = names[a % n]!;
      let v = names[b % n]!;
      // Half the graphs only have arcs from later to earlier letters: DAGs out of name order.
      if (dag && u < v) [u, v] = [v, u];
      if (u === v || seen.has(`${u}>${v}`)) continue;
      seen.add(`${u}>${v}`);
      items.push(`${u}>${v}`);
    }
    return [...items, ...names].join(', ');
  })
  .filter((t) => t.includes('>'));

describe('topological sort by in-degree', () => {
  it('finds a topological order, or exactly the vertices a cycle blocks', () => {
    fc.assert(
      fc.property(graphArb, fc.constantFrom<Ready>('fifo', 'smallest'), (text, ready) => {
        const settings: TopoSettings = { ...topo.defaults, ready };
        const calls: OpCall[] = [['load', text], ['run']];
        const t = new Timeline(topo, settings, 1, calls);
        const g = t.entries[0]!.end.graph;
        const entry = t.entries[1]!;
        for (const st of entry.steps) {
          expect(st.state.graph).toBe(g);
          checkRun(g, st.extra!.run!, st.vars ?? {});
        }
        const r = entry.steps.at(-1)!.extra!.run!;
        const blocked = stuck(g);
        expect(r.leftover ?? []).toEqual(blocked);
        expect(r.order.length + blocked.length).toBe(g.vertices.length);
        // Every arc between two placed vertices goes forward.
        for (const e of g.edges)
          if (r.order.includes(e.u) && r.order.includes(e.v))
            expect(r.order.indexOf(e.u)).toBeLessThan(r.order.indexOf(e.v));
        if (ready === 'smallest') expect(r.order).toEqual(smallestOrder(g));
        if (r.cycle) {
          const c = r.cycle;
          expect(c.length).toBeGreaterThanOrEqual(2);
          expect(new Set(c).size).toBe(c.length);
          for (let i = 0; i < c.length; i++)
            expect(hasArc(g, c[i]!, c[(i + 1) % c.length]!), c.join(' ')).toBe(true);
        }
        expect(entry.steps.at(-1)!.vars!.decrements).toBe(
          g.edges.filter((e) => r.order.includes(e.u)).length,
        );
      }),
      { numRuns: 400 },
    );
  });

  it('refuses an undirected graph', () => {
    const t = new Timeline(topo, topo.defaults, 1, [['load', 'A-B, B-C'], ['run']]);
    const steps = t.entries[1]!.steps;
    expect(steps).toHaveLength(1);
    expect(steps[0]!.say).toContain('needs a directed graph');
  });

  it('gives different, valid orders with a queue and with smallest first', () => {
    const calls: OpCall[] = [['load', 'A>D, B>C, C>E, D>E'], ['run']];
    const end = (ready: Ready) =>
      new Timeline(topo, { ...topo.defaults, ready }, 1, calls).entries[1]!.steps.at(-1)!.extra!
        .run!.order;
    expect(end('fifo')).toEqual(['A', 'B', 'D', 'C', 'E']);
    expect(end('smallest')).toEqual(['A', 'B', 'C', 'D', 'E']);
  });

  it('keeps pseudocode lines short enough for a phone', () => {
    for (const ready of ['fifo', 'smallest'] as const)
      for (const block of pseudocode({ ...topo.defaults, ready }))
        for (const l of block.lines)
          expect(2 * l.indent + l.text.length, `${l.id}: ${l.text}`).toBeLessThanOrEqual(33);
  });
});

describe('topological sort practice', () => {
  it('has answers that agree with the references', () => {
    const kinds = topo.practice!;
    expect(kinds.length).toBeGreaterThanOrEqual(3);
    expect(kinds.length).toBeLessThanOrEqual(4);
    for (let seed = 1; seed <= 120; seed++) {
      for (const kind of kinds) {
        const q = kind.make(makeRng(seed));
        const where = `${kind.id} seed ${seed}`;
        const g = parseGraph(String(q.setup[0]![1])) as Graph;
        const a = q.answer;
        if (kind.id === 'order' || kind.id === 'smallest') {
          expect(stuck(g), where).toEqual([]);
          const order = a.kind === 'sequence' ? a.value : [];
          expect([...order].sort(), where).toEqual([...g.vertices].sort());
          for (const e of g.edges)
            expect(order.indexOf(e.u), where).toBeLessThan(order.indexOf(e.v));
          if (kind.id === 'smallest') expect(order, where).toEqual(smallestOrder(g));
        } else if (kind.id === 'indegree') {
          const [, start, x] = /order starts ([\w, ]+)\. Right after \w+ is taken.*of (\w+)\?/.exec(
            q.prompt,
          )!;
          const placed = start!.split(', ');
          const left = g.edges.filter((e) => e.v === x && !placed.includes(e.u)).length;
          expect(a.kind === 'number' && a.value, where).toBe(left);
          // The explanation names only arcs into x as gone, never vertices with no arc to x.
          const gone = /The ones? from ([\w, ]+?) (is|are) gone/.exec(q.explain);
          const into = g.edges.filter((e) => e.v === x).map((e) => e.u);
          for (const v of gone ? gone[1]!.split(/, | and /) : []) expect(into, where).toContain(v);
          if (!gone) expect(q.explain, where).toContain('no vertex taken so far is one of them');
        } else if (kind.id === 'leftover') {
          expect(a.kind === 'sequence' && a.value, where).toEqual(stuck(g));
        } else {
          throw new Error(`untested kind ${kind.id}`);
        }
      }
    }
  });

  // A learner should not be able to guess: over 300 seeds no in-degree comes up in more than
  // half the questions, and every answer is the arcs into x from vertices not yet placed.
  it('asks for in-degrees that vary', () => {
    const kind = topo.practice!.find((k) => k.id === 'indegree')!;
    const counts = new Map<number, number>();
    for (let seed = 1; seed <= 300; seed++) {
      const q = kind.make(makeRng(seed));
      const g = parseGraph(String(q.setup[0]![1])) as Graph;
      const [, start, x] = /order starts ([\w, ]+)\. Right after \w+ is taken.*of (\w+)\?/.exec(
        q.prompt,
      )!;
      const placed = start!.split(', ');
      const left = g.edges.filter((e) => e.v === x && !placed.includes(e.u)).length;
      if (q.answer.kind !== 'number') throw new Error('expected a number');
      expect(q.answer.value, `seed ${seed}`).toBe(left);
      expect(left).toBeGreaterThan(0);
      counts.set(left, (counts.get(left) ?? 0) + 1);
    }
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(150);
    expect(counts.size).toBeGreaterThanOrEqual(3);
  });
});

describe('drawn text size', () => {
  // The layered example stood 466 units tall (10.7 px on a laptop); turned on its side it reads at 15.
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(textSizeDef, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(textSizeDef, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
