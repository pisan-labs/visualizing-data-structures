import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeRng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { compareNames, type Graph } from '../_graph/graph';
import { parseGraph } from '../_graph/parse';
import { graphRepresentations as def } from '.';
import { defaults, pseudocode, type RepState } from './model';

// ---------------------------------------------------------------------------------------------
// Reference: a graph as a set of arcs, written independently of the page.

class RefGraph {
  vertices = new Set<string>();
  arcs = new Set<string>();
  constructor(
    readonly directed: boolean,
    vertices: string[],
    edges: [string, string][],
  ) {
    for (const v of vertices) this.vertices.add(v);
    for (const [u, v] of edges) this.add(u, v);
  }
  has(u: string, v: string) {
    return this.arcs.has(`${u}>${v}`);
  }
  add(u: string, v: string) {
    this.arcs.add(`${u}>${v}`);
    if (!this.directed) this.arcs.add(`${v}>${u}`);
  }
  remove(u: string, v: string) {
    this.arcs.delete(`${u}>${v}`);
    if (!this.directed) this.arcs.delete(`${v}>${u}`);
  }
  removeVertex(x: string) {
    this.vertices.delete(x);
    for (const a of [...this.arcs]) if (a.split('>').includes(x)) this.arcs.delete(a);
  }
  neighbours(u: string) {
    return [...this.arcs]
      .filter((a) => a.startsWith(`${u}>`))
      .map((a) => a.split('>')[1]!)
      .sort();
  }
  /** Edges as the page stores them: sorted, and u before v when undirected. */
  edgeKeys() {
    return [...this.arcs]
      .map((a) => a.split('>') as [string, string])
      .filter(([u, v]) => this.directed || u < v)
      .sort(([a, b], [c, d]) => a.localeCompare(c) || b.localeCompare(d))
      .map(([u, v]) => `${u}-${v}`);
  }
}

const fromGraph = (g: Graph) =>
  new RefGraph(
    g.directed,
    g.vertices,
    g.edges.map((e) => [e.u, e.v]),
  );

// ---------------------------------------------------------------------------------------------
// Invariants every step keeps.

function checkStep(st: RepState, vars: Record<string, unknown>) {
  const g = st.graph;
  expect([...g.vertices].sort(compareNames)).toEqual(g.vertices);
  expect(new Set(g.vertices).size).toBe(g.vertices.length);
  const keys = g.edges.map((e) => `${e.u}-${e.v}`);
  expect(new Set(keys).size, 'no parallel edges').toBe(keys.length);
  for (const e of g.edges) {
    expect(e.u).not.toBe(e.v);
    expect(g.vertices).toContain(e.u);
    expect(g.vertices).toContain(e.v);
    if (!g.directed) expect(compareNames(e.u, e.v)).toBeLessThan(0);
  }
  expect(vars.V).toBe(g.vertices.length);
  expect(vars.E).toBe(g.edges.length);
  for (const k of ['list', 'matrix', 'edge list']) expect(vars[k]).toBeGreaterThanOrEqual(0);
}

const letter = fc.constantFrom('A', 'B', 'C', 'D', 'E', 'F');
const graphText = fc
  .record({
    directed: fc.boolean(),
    pairs: fc.array(fc.tuple(letter, letter), { maxLength: 10 }),
    lone: fc.array(letter, { maxLength: 2 }),
  })
  .map(({ directed, pairs, lone }) => {
    const seen = new Set<string>();
    const items: string[] = [];
    for (const [u, v] of pairs) {
      const key = directed ? `${u}>${v}` : [u, v].sort().join('-');
      if (u === v || seen.has(key)) continue;
      seen.add(key);
      items.push(directed ? `${u}>${v}` : `${u}-${v}`);
    }
    return [...items, ...lone].join(', ') || 'A';
  });

const callArb: fc.Arbitrary<OpCall> = fc.oneof(
  { weight: 2, arbitrary: graphText.map((t) => ['load', t] as OpCall) },
  {
    weight: 4,
    arbitrary: fc
      .tuple(fc.constantFrom('hasEdge', 'addEdge', 'removeEdge'), letter, letter, fc.boolean())
      .map(([op, u, v, oneWay]) => [op, `${u}${oneWay ? '>' : '-'}${v}`] as OpCall),
  },
  {
    weight: 2,
    arbitrary: fc
      .tuple(
        fc.constantFrom('addVertex', 'removeVertex', 'neighbours'),
        fc.constantFrom('A', 'C', 'F', 'G', 'H'),
      )
      .map(([op, x]) => [op, x] as OpCall),
  },
);

describe('graph representations', () => {
  it('matches a reference graph, answers and costs included, on every step', () => {
    fc.assert(
      fc.property(fc.array(callArb, { maxLength: 30 }), (calls) => {
        const t = new Timeline(def, defaults, 1, calls);
        let ref = fromGraph(t.initial.state.graph);
        calls.forEach((call, i) => {
          const entry = t.entries[i]!;
          for (const st of entry.steps) checkStep(st.state, st.vars ?? {});
          const before = i === 0 ? t.initial.state.graph : t.entries[i - 1]!.end.graph;
          const last = entry.steps.at(-1)!;
          const v = last.vars ?? {};
          const [op, raw] = call;
          const arg = String(raw);
          const [u, w] = arg.split(/[->]/) as [string, string];
          const oneWay = arg.includes('>');
          const known = ref.vertices.has(u) && ref.vertices.has(w ?? '');
          switch (op) {
            case 'load': {
              ref = fromGraph(parseGraph(arg) as Graph);
              break;
            }
            case 'hasEdge':
              if (u !== w && known) {
                const yes = ref.has(u, w);
                expect(v.answer).toBe(yes ? 'yes' : 'no');
                const list = ref.neighbours(u);
                expect(v.list).toBe(yes ? list.indexOf(w) + 1 : list.length);
                expect(v.matrix).toBe(1);
                const keys = ref.edgeKeys();
                const key = ref.directed || u < w ? `${u}-${w}` : `${w}-${u}`;
                expect(v['edge list']).toBe(yes ? keys.indexOf(key) + 1 : keys.length);
              } else {
                expect(v.answer).toBeUndefined();
              }
              break;
            case 'addEdge':
              if (u !== w && known && oneWay === ref.directed && !ref.has(u, w)) ref.add(u, w);
              break;
            case 'removeEdge':
              if (u !== w && known) ref.remove(u, w);
              break;
            case 'addVertex':
              if (ref.vertices.size < 16) ref.vertices.add(arg);
              break;
            case 'removeVertex':
              if (ref.vertices.has(arg) && ref.vertices.size > 1) ref.removeVertex(arg);
              break;
            case 'neighbours':
              if (ref.vertices.has(arg)) {
                expect(v.answer).toBe(ref.neighbours(arg).join(' ') || 'none');
                expect(v.list).toBe(ref.neighbours(arg).length);
                expect(v.matrix).toBe(ref.vertices.size);
              }
              break;
          }
          const g = entry.end.graph;
          expect(g.directed, `${op} ${arg}`).toBe(ref.directed);
          expect(g.vertices).toEqual([...ref.vertices].sort());
          expect(g.edges.map((e) => `${e.u}-${e.v}`)).toEqual(ref.edgeKeys());
          // An operation that changes nothing hands back the very same graph.
          if (op === 'hasEdge' || op === 'neighbours') expect(g).toBe(before);
        });
      }),
      { numRuns: 200 },
    );
  });

  it('keeps pseudocode lines short enough for a phone', () => {
    for (const block of pseudocode())
      for (const l of block.lines)
        expect(2 * l.indent + l.text.length, `${l.id}: ${l.text}`).toBeLessThanOrEqual(33);
  });

  it('counts the matrix copy when a vertex is added', () => {
    const t = new Timeline(def, defaults, 1, [['addVertex', 'I']]);
    const v = t.entries[0]!.steps.at(-1)!.vars!;
    expect(v.matrix).toBe(81);
    expect(v.list).toBe(1);
  });
});

describe('graph representations practice', () => {
  it('has answers that agree with the reference graph', () => {
    const kinds = def.practice!;
    expect(kinds.length).toBeGreaterThanOrEqual(3);
    expect(kinds.length).toBeLessThanOrEqual(4);
    for (let seed = 1; seed <= 150; seed++) {
      for (const kind of kinds) {
        const q = kind.make(makeRng(seed));
        const where = `${kind.id} seed ${seed}`;
        const g = parseGraph(String(q.setup[0]![1])) as Graph;
        const ref = fromGraph(g);
        const [op, raw] = q.watch![0]!;
        const arg = String(raw);
        const [u, v] = arg.split(/[->]/) as [string, string];
        const a = q.answer;
        if (kind.id === 'list-checks') {
          expect(op).toBe('hasEdge');
          const list = ref.neighbours(u);
          const want = ref.has(u, v) ? list.indexOf(v) + 1 : list.length;
          expect(a.kind === 'number' && a.value, where).toBe(want);
        } else if (kind.id === 'edge-checks') {
          const keys = ref.edgeKeys();
          const key = ref.directed || u < v ? `${u}-${v}` : `${v}-${u}`;
          const want = ref.has(u, v) ? keys.indexOf(key) + 1 : keys.length;
          expect(a.kind === 'number' && a.value, where).toBe(want);
        } else if (kind.id === 'list-after-add') {
          expect(op).toBe('addEdge');
          expect(ref.has(u, v), where).toBe(false);
          ref.add(u, v);
          expect(a.kind === 'sequence' && a.value, where).toEqual(ref.neighbours(v));
        } else if (kind.id === 'edges-after-remove') {
          expect(op).toBe('removeVertex');
          ref.removeVertex(arg);
          expect(a.kind === 'number' && a.value, where).toBe(ref.edgeKeys().length);
        } else {
          throw new Error(`untested kind ${kind.id}`);
        }
      }
    }
  });
});
