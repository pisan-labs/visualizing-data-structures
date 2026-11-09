import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeRng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import type { Graph } from '../_graph/graph';
import { parseGraph } from '../_graph/parse';
import { scc } from '.';
import { condensation, pseudocode, type Algorithm, type SccRun, type SccSettings } from './model';
import { smallestText } from '../../render/text-size';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import textSizeDef from './index';

// ---------------------------------------------------------------------------------------------
// Reference: who reaches whom, by a search from every vertex. Two vertices share a component
// exactly when each reaches the other.

function reach(g: Graph): Map<string, Set<string>> {
  const adj = new Map(g.vertices.map((v) => [v, [] as string[]]));
  for (const e of g.edges) {
    adj.get(e.u)!.push(e.v);
    if (!g.directed) adj.get(e.v)!.push(e.u);
  }
  const out = new Map<string, Set<string>>();
  for (const s of g.vertices) {
    const seen = new Set([s]);
    const todo = [s];
    while (todo.length) {
      for (const v of adj.get(todo.pop()!)!) {
        if (seen.has(v)) continue;
        seen.add(v);
        todo.push(v);
      }
    }
    out.set(s, seen);
  }
  return out;
}

function refComponents(g: Graph): string[][] {
  const r = reach(g);
  const done = new Set<string>();
  const comps: string[][] = [];
  for (const u of g.vertices) {
    if (done.has(u)) continue;
    const c = g.vertices.filter((v) => r.get(u)!.has(v) && r.get(v)!.has(u));
    c.forEach((v) => done.add(v));
    comps.push(c);
  }
  return comps;
}

function sortedAdj(g: Graph): Map<string, string[]> {
  const adj = new Map(g.vertices.map((v) => [v, [] as string[]]));
  for (const e of g.edges) {
    adj.get(e.u)!.push(e.v);
    if (!g.directed) adj.get(e.v)!.push(e.u);
  }
  for (const l of adj.values()) l.sort();
  return adj;
}

/** The vertex a plain DFS (name order) finishes last. */
function lastToFinish(g: Graph): string {
  const adj = sortedAdj(g);
  const seen = new Set<string>();
  let last = '';
  const visit = (u: string) => {
    seen.add(u);
    for (const v of adj.get(u)!) if (!seen.has(v)) visit(v);
    last = u;
  };
  for (const u of [...g.vertices].sort()) if (!seen.has(u)) visit(u);
  return last;
}

/** Tarjan's low-links, written out plainly. */
function tarjanLow(g: Graph): Map<string, number> {
  const adj = sortedAdj(g);
  const d = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  let time = 0;
  const connect = (u: string) => {
    d.set(u, ++time);
    low.set(u, time);
    stack.push(u);
    for (const v of adj.get(u)!) {
      if (!d.has(v)) {
        connect(v);
        low.set(u, Math.min(low.get(u)!, low.get(v)!));
      } else if (stack.includes(v)) low.set(u, Math.min(low.get(u)!, d.get(v)!));
    }
    if (low.get(u) === d.get(u)) while (stack.pop() !== u);
  };
  for (const u of [...g.vertices].sort()) if (!d.has(u)) connect(u);
  return low;
}

const key = (c: string[]) => [...c].sort().join(' ');

function checkStep(g: Graph, r: SccRun, ref: Set<string>) {
  // Every component found so far is a real one, and they do not overlap.
  const seen = new Set<string>();
  r.comps.forEach((c, k) => {
    if (r.phase !== 'second' || k < r.comps.length - 1) expect(ref.has(key(c)), key(c)).toBe(true);
    for (const v of c) {
      expect(seen.has(v)).toBe(false);
      seen.add(v);
      expect(r.comp[v]).toBe(k);
    }
  });
  for (const v of g.vertices) if (!seen.has(v)) expect(r.comp[v]).toBeNull();
  if (r.algorithm === 'tarjan') {
    for (const v of g.vertices) if (r.d[v] !== null) expect(r.low[v]! <= r.d[v]!).toBe(true);
    // The stack holds exactly the discovered vertices with no component yet.
    const open = g.vertices.filter((v) => r.d[v] !== null && r.comp[v] === null);
    expect([...r.stack].sort()).toEqual(open.sort());
  } else {
    // The finished stack is in finish-time order.
    for (let i = 1; i < r.finished.length; i++)
      expect(r.f[r.finished[i - 1]!]! < r.f[r.finished[i]!]!).toBe(true);
  }
}

const letters = 'ABCDEFGH'.split('');
const graphArb = fc
  .record({
    n: fc.integer({ min: 1, max: 8 }),
    directed: fc.integer({ min: 0, max: 5 }),
    pairs: fc.array(fc.tuple(fc.nat(7), fc.nat(7)), { maxLength: 18 }),
  })
  .map(({ n, directed, pairs }) => {
    const names = letters.slice(0, n);
    const op = directed ? '>' : '-';
    const items = new Set<string>();
    for (const [a, b] of pairs) {
      const [u, v] = [names[a % n]!, names[b % n]!];
      if (u === v) continue;
      items.add(directed || u < v ? `${u}${op}${v}` : `${v}${op}${u}`);
    }
    return [...items, ...names].join(', ');
  });

describe('strongly connected components', () => {
  it('matches mutual reachability and keeps its invariants on every step', () => {
    fc.assert(
      fc.property(graphArb, fc.constantFrom<Algorithm>('kosaraju', 'tarjan'), (text, algorithm) => {
        const settings: SccSettings = { ...scc.defaults, algorithm };
        const calls: OpCall[] = [['load', text], ['run']];
        const t = new Timeline(scc, settings, 1, calls);
        const g = t.entries[0]!.end.graph;
        const ref = refComponents(g);
        const refKeys = new Set(ref.map(key));
        const steps = t.entries[1]!.steps;
        for (const st of steps) checkStep(g, st.extra!.run!, refKeys);
        const r = steps.at(-1)!.extra!.run!;
        expect(new Set(r.comps.map(key))).toEqual(refKeys);
        expect(r.comps).toHaveLength(ref.length);
        expect(steps.at(-1)!.extra!.final).toEqual(r.comps);
        // Kosaraju finds components in topological order of the component graph, Tarjan in
        // reverse.
        const cond = condensation(g, r.comps);
        for (const e of cond.edges) {
          const [a, b] = [Number(e.u), Number(e.v)];
          expect(algorithm === 'kosaraju' ? a < b : a > b, `${e.u}>${e.v}`).toBe(true);
        }
      }),
      { numRuns: 300 },
    );
  });

  it('keeps pseudocode lines short enough for a phone', () => {
    for (const algorithm of ['kosaraju', 'tarjan'] as const)
      for (const block of pseudocode({ ...scc.defaults, algorithm }))
        for (const l of block.lines)
          expect(2 * l.indent + l.text.length, `${l.id}: ${l.text}`).toBeLessThanOrEqual(33);
  });

  it('splits the starting graph into four components', () => {
    for (const algorithm of ['kosaraju', 'tarjan'] as const) {
      const t = new Timeline(scc, { ...scc.defaults, algorithm }, 1, [['run']]);
      const r = t.entries[0]!.steps.at(-1)!.extra!.run!;
      const want = ['A B E', 'C D', 'F G', 'H'];
      expect(r.comps.map((c) => c.join(' '))).toEqual(
        algorithm === 'kosaraju' ? want : [...want].reverse(),
      );
    }
  });

  // A lone vertex read "{ H }", with spaces, next to "{A, B}".
  it('writes a lone vertex as a set like the others, {H}', () => {
    const t = new Timeline(scc, scc.defaults as SccSettings, 1, [['run']]);
    const say = t.entries[0]!.steps.at(-1)!.say;
    expect(say).toContain('{A, B, E}, {C, D}, {F, G} and {H}');
    expect(say).not.toContain('{ H }');
  });
});

describe('SCC practice', () => {
  it('has answers that agree with the reference', () => {
    for (let seed = 1; seed <= 100; seed++) {
      for (const kind of scc.practice!) {
        const q = kind.make(makeRng(seed));
        const where = `${kind.id} seed ${seed}`;
        const g = parseGraph(String(q.setup[0]![1])) as Graph;
        const ref = refComponents(g);
        const a = q.answer;
        if (kind.id === 'count') {
          expect(a.kind === 'number' && a.value, where).toBe(ref.length);
        } else if (kind.id === 'same') {
          const v = /in (\w+)'s strongly/.exec(q.prompt)![1]!;
          expect(a.kind === 'sequence' && a.value, where).toEqual(ref.find((c) => c.includes(v)));
        } else if (kind.id === 'second-pass') {
          expect(a.kind === 'choice' && a.options[a.correct], where).toBe(lastToFinish(g));
        } else if (kind.id === 'low-link') {
          const v = /What is `(\w+)\.low`/.exec(q.prompt)![1]!;
          expect(a.kind === 'number' && a.value, where).toBe(tarjanLow(g).get(v));
        } else {
          throw new Error(`untested kind ${kind.id}`);
        }
      }
    }
  });
});

describe('drawn text size', () => {
  // The component graph of an undirected graph stood its components in a column (11.0 px on a laptop); side by side, 11.4.
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(textSizeDef, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(textSizeDef, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
