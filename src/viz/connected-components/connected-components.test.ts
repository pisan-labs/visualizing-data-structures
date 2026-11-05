import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeRng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import type { Graph } from '../_graph/graph';
import { parseGraph } from '../_graph/parse';
import { connectedComponents as cc } from '.';
import { pseudocode, type CcRun, type CcSettings, type Method } from './model';

// ---------------------------------------------------------------------------------------------
// Reference: label pieces by repeatedly spreading a number until nothing changes (no queue,
// no recursion, no union-find), written independently of the page.

function refComponents(g: Graph): Map<string, number> {
  const label = new Map<string, number>();
  let count = 0;
  for (const s of g.vertices) {
    if (label.has(s)) continue;
    label.set(s, ++count);
    for (let changed = true; changed;) {
      changed = false;
      for (const e of g.edges) {
        const a = label.get(e.u);
        const b = label.get(e.v);
        if (a === count && b === undefined) {
          label.set(e.v, count);
          changed = true;
        } else if (b === count && a === undefined) {
          label.set(e.u, count);
          changed = true;
        }
      }
    }
  }
  return label;
}

/** Invariants every step keeps. */
function checkRun(g: Graph, r: CcRun, vars: Record<string, unknown>) {
  const truth = refComponents(g);
  for (const v of g.vertices) {
    // A number, once given, is the final one: the search never crosses into another piece.
    if (r.cc[v] !== null) {
      for (const x of g.vertices)
        if (r.cc[x] !== null && truth.get(x) === truth.get(v)) expect(r.cc[x]).toBe(r.cc[v]);
    }
  }
  if (r.method === 'union-find') {
    // Union-find: every vertex's set is inside its true piece.
    for (const v of g.vertices) {
      let x = v;
      for (let i = 0; i <= g.vertices.length && r.p[x] !== x; i++) x = r.p[x]!;
      expect(r.p[x], `${v} reaches a root`).toBe(x);
      expect(truth.get(x)).toBe(truth.get(v));
      expect(r.rank[r.p[v]!]!).toBeGreaterThanOrEqual(r.p[v] === v ? 0 : r.rank[v]! + 1);
    }
  } else {
    expect(new Set(r.frontier).size).toBe(r.frontier.length);
    for (const v of r.frontier) expect(r.cc[v]).toBe(r.count);
    expect(vars.labeled).toBe(r.order.length);
  }
  expect(vars.components).toBe(r.count);
}

const letters = 'ABCDEFGHI'.split('');
const graphArb = fc
  .record({
    n: fc.integer({ min: 1, max: 9 }),
    directed: fc.boolean(),
    pairs: fc.array(fc.tuple(fc.nat(8), fc.nat(8)), { maxLength: 14 }),
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

describe('connected components', () => {
  it('matches a reference labeling and keeps the invariants on every step', () => {
    fc.assert(
      fc.property(graphArb, fc.constantFrom<Method>('bfs', 'dfs', 'union-find'), (text, method) => {
        const settings: CcSettings = { ...cc.defaults, method };
        const calls: OpCall[] = [['load', text], ['run']];
        const t = new Timeline(cc, settings, 1, calls);
        const g = t.entries[0]!.end.graph;
        const entry = t.entries[1]!;
        for (const st of entry.steps) {
          expect(st.state.graph).toBe(g);
          checkRun(g, st.extra!.run!, st.vars ?? {});
        }
        const r = entry.steps.at(-1)!.extra!.run!;
        const truth = refComponents(g);
        expect(r.count).toBe(new Set(truth.values()).size);
        for (const v of g.vertices) expect(r.cc[v], v).toBe(truth.get(v));
        if (method !== 'union-find') {
          expect([...r.order].sort()).toEqual([...g.vertices].sort());
          expect(r.frontier).toEqual([]);
          // Each edge is checked from both ends.
          expect(entry.steps.at(-1)!.vars!.checks).toBe(
            g.vertices.reduce((n, v) => n + linkedCount(g, v), 0),
          );
        } else {
          const tree = Object.values(r.edges).filter((x) => x === 'tree').length;
          expect(tree).toBe(g.vertices.length - r.count);
          expect(Object.keys(r.edges)).toHaveLength(g.edges.length);
        }
      }),
      { numRuns: 300 },
    );
  });

  it('gives the same numbers with every method', () => {
    const calls: OpCall[] = [['load', 'A-B, C-D, B-E, F, D-G, A-E'], ['run']];
    const end = (method: Method) =>
      new Timeline(cc, { ...cc.defaults, method }, 1, calls).entries[1]!.steps.at(-1)!.extra!.run!
        .cc;
    expect(end('bfs')).toEqual(end('dfs'));
    expect(end('bfs')).toEqual(end('union-find'));
    expect(end('bfs')).toEqual({ A: 1, B: 1, E: 1, C: 2, D: 2, G: 2, F: 3 });
  });

  it('keeps pseudocode lines short enough for a phone', () => {
    for (const method of ['bfs', 'dfs', 'union-find'] as const)
      for (const block of pseudocode({ ...cc.defaults, method }))
        for (const l of block.lines)
          expect(2 * l.indent + l.text.length, `${l.id}: ${l.text}`).toBeLessThanOrEqual(33);
  });
});

function linkedCount(g: Graph, v: string): number {
  const set = new Set<string>();
  for (const e of g.edges) {
    if (e.u === v) set.add(e.v);
    if (e.v === v) set.add(e.u);
  }
  return set.size;
}

describe('connected components practice', () => {
  it('has answers that agree with the reference', () => {
    const kinds = cc.practice!;
    expect(kinds.length).toBeGreaterThanOrEqual(3);
    expect(kinds.length).toBeLessThanOrEqual(4);
    for (let seed = 1; seed <= 120; seed++) {
      for (const kind of kinds) {
        const q = kind.make(makeRng(seed));
        const where = `${kind.id} seed ${seed}`;
        const g = parseGraph(String(q.setup[0]![1])) as Graph;
        const truth = refComponents(g);
        const a = q.answer;
        if (kind.id === 'count') {
          expect(a.kind === 'number' && a.value, where).toBe(new Set(truth.values()).size);
        } else if (kind.id === 'together') {
          const [, x, y] = /Are (\w+) and (\w+) in/.exec(q.prompt)!;
          const yes = truth.get(x!) === truth.get(y!);
          expect(a.kind === 'choice' && a.options[a.correct], where).toBe(yes ? 'Yes' : 'No');
        } else if (kind.id === 'order') {
          // Plain BFS per piece, labeling on enqueue.
          const order: string[] = [];
          const seen = new Set<string>();
          for (const s of g.vertices) {
            if (seen.has(s)) continue;
            seen.add(s);
            order.push(s);
            const q2 = [s];
            while (q2.length) {
              const u = q2.shift()!;
              const nb = g.edges
                .flatMap((e) => (e.u === u ? [e.v] : e.v === u ? [e.u] : []))
                .sort();
              for (const v of nb)
                if (!seen.has(v)) {
                  seen.add(v);
                  order.push(v);
                  q2.push(v);
                }
            }
          }
          expect(a.kind === 'sequence' && a.value, where).toEqual(order);
        } else if (kind.id === 'skipped') {
          const pieces = new Set(truth.values()).size;
          expect(a.kind === 'number' && a.value, where).toBe(
            g.edges.length - (g.vertices.length - pieces),
          );
        } else {
          throw new Error(`untested kind ${kind.id}`);
        }
      }
    }
  });
});
