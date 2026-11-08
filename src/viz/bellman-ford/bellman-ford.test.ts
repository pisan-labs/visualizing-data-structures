import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeRng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import type { Graph } from '../_graph/graph';
import { parseGraph } from '../_graph/parse';
import { bellmanFord } from '.';
import { pseudocode, type BfRun, type BfSettings } from './model';
import { smallestText } from '../../render/text-size';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';

// ---------------------------------------------------------------------------------------------
// A reference written independently of the page. Arcs in the page's order: by tail, then head
// (single letters here, so string order is name order).

type Arc = [string, string, number];

function arcList(g: Graph): Arc[] {
  const out: Arc[] = [];
  for (const e of g.edges) {
    out.push([e.u, e.v, e.w]);
    if (!g.directed) out.push([e.v, e.u, e.w]);
  }
  return out.sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : a[0] < b[0] ? -1 : 1));
}

function reference(g: Graph, s: string, early = false) {
  const d = new Map<string, number>([[s, 0]]);
  const list = arcList(g);
  const changes: number[] = [];
  const afterPass: Map<string, number>[] = [];
  for (let pass = 1; pass < g.vertices.length; pass++) {
    let n = 0;
    for (const [u, v, w] of list)
      if (d.has(u) && (!d.has(v) || d.get(u)! + w < d.get(v)!)) {
        d.set(v, d.get(u)! + w);
        n++;
      }
    changes.push(n);
    afterPass.push(new Map(d));
    if (early && n === 0) break;
  }
  const negative = list.some(([u, v, w]) => d.has(u) && d.get(u)! + w < d.get(v)!);
  return { d, changes, afterPass, negative };
}

/** Lightest walks from s with at most k arcs, for k = 0 .. V. */
function walkBounds(g: Graph, s: string): Map<string, number>[] {
  const list = arcList(g);
  const out = [new Map([[s, 0]])];
  for (let k = 1; k <= g.vertices.length; k++) {
    const prev = out[k - 1]!;
    const next = new Map(prev);
    for (const [u, v, w] of list)
      if (prev.has(u) && (!next.has(v) || prev.get(u)! + w < next.get(v)!))
        next.set(v, prev.get(u)! + w);
    out.push(next);
  }
  return out;
}

const weight = (g: Graph, u: string, v: string) =>
  g.edges.find((e) => (e.u === u && e.v === v) || (!g.directed && e.u === v && e.v === u))!.w;

// ---------------------------------------------------------------------------------------------

const letters = 'ABCDEFG'.split('');
const graphArb = fc
  .record({
    n: fc.integer({ min: 1, max: 7 }),
    directed: fc.boolean(),
    pairs: fc.array(fc.tuple(fc.nat(6), fc.nat(6), fc.integer({ min: -4, max: 9 })), {
      maxLength: 14,
    }),
  })
  .map(({ n, directed, pairs }) => {
    const names = letters.slice(0, n);
    const seen = new Set<string>();
    const items: string[] = [];
    for (const [a, b, w] of pairs) {
      const u = names[a % n]!;
      const v = names[b % n]!;
      const key = directed ? `${u}>${v}` : [u, v].sort().join('-');
      if (u === v || seen.has(key)) continue;
      seen.add(key);
      items.push(`${u}${directed ? '>' : '-'}${v}:${w}`);
    }
    return [...items, ...names].join(', ');
  });

describe('Bellman-Ford', () => {
  it('matches the reference and keeps its invariants on every step', () => {
    fc.assert(
      fc.property(graphArb, fc.constantFrom(...letters, 'Z'), fc.boolean(), (text, s, early) => {
        const settings: BfSettings = { ...bellmanFord.defaults, early };
        const calls: OpCall[] = [
          ['load', text],
          ['run', s],
        ];
        const t = new Timeline(bellmanFord, settings, 1, calls);
        const g = t.entries[0]!.end.graph;
        const entry = t.entries[1]!;
        if (!g.vertices.includes(s)) {
          expect(entry.steps).toHaveLength(1);
          expect(entry.steps[0]!.say).toContain(`There is no vertex ${s}.`);
          return;
        }
        const ref = reference(g, s, early);
        const bounds = walkBounds(g, s);
        const truth = ref.negative ? null : reference(g, s).d;
        let prev: BfRun | null = null;
        for (const st of entry.steps) {
          expect(st.state.graph).toBe(g);
          const r = st.extra!.run!;
          for (const v of g.vertices) {
            // d never increases.
            if (prev && prev.d[v] !== null) expect(r.d[v]!).toBeLessThanOrEqual(prev.d[v]!);
            // With no negative cycle in reach, d never drops below the true distance.
            if (truth && r.d[v] !== null) expect(r.d[v]!).toBeGreaterThanOrEqual(truth.get(v)!);
            // π never promises more than it has: d[v] >= d[π[v]] + w(π[v], v).
            if (r.pi[v] !== null && !r.cycle)
              expect(r.d[v]!).toBeGreaterThanOrEqual(r.d[r.pi[v]!]! + weight(g, r.pi[v]!, v));
          }
          // Right after RELAX(u, v): d[v] <= d[u] + w(u, v).
          if (st.lines.includes('relax') && r.u && r.d[r.u] !== null)
            expect(r.d[r.v!]!).toBeLessThanOrEqual(r.d[r.u]! + weight(g, r.u, r.v!));
          // After k passes, d[v] is at most the lightest walk with k arcs or fewer.
          const done = r.checking || r.result ? r.changes.length : Math.max(0, r.pass - 1);
          if (!r.cycle)
            for (const v of g.vertices)
              if (bounds[done]!.has(v))
                expect(r.d[v], `d[${v}] after ${done} passes`).not.toBeNull();
          if (!r.cycle) for (const [v, b] of bounds[done]!) expect(r.d[v]!).toBeLessThanOrEqual(b);
          expect(r.changes.reduce((a, b) => a + b, 0)).toBe(r.updates);
          prev = r;
        }
        const r = entry.steps.at(-1)!.extra!.run!;
        expect(r.result).toBe(ref.negative ? 'false' : 'true');
        expect(r.changes).toEqual(ref.changes);
        if (!ref.negative) {
          for (const v of g.vertices) {
            expect(r.d[v], `d[${v}]`).toBe(ref.d.get(v) ?? null);
            if (r.pi[v] !== null) expect(r.d[v]).toBe(r.d[r.pi[v]!]! + weight(g, r.pi[v]!, v));
          }
        } else {
          // The cycle is real, negative and reachable.
          const c = r.cycle!;
          expect(c.length).toBeGreaterThanOrEqual(2);
          expect(new Set(c).size).toBe(c.length);
          let total = 0;
          c.forEach((v, k) => {
            total += weight(g, v, c[(k + 1) % c.length]!);
            expect(r.d[v]).not.toBeNull();
          });
          expect(total).toBeLessThan(0);
          if (g.directed) {
            for (let k = 0; k < c.length; k++)
              expect(g.edges.some((e) => e.u === c[k] && e.v === c[(k + 1) % c.length])).toBe(true);
          }
        }
      }),
      { numRuns: 300 },
    );
  });

  it('stops early only when a pass changes nothing, with the same answer', () => {
    const calls: OpCall[] = [
      ['load', 'A>B:5, A>C:2, B>D:4, B>E:2, C>B:1, C>D:6, D>G:3, E>D:1, E>F:4, F>G:1'],
      ['run', 'A'],
    ];
    const end = (early: boolean) =>
      new Timeline(bellmanFord, { ...bellmanFord.defaults, early }, 1, calls).entries[1]!.steps.at(
        -1,
      )!.extra!.run!;
    const all = end(false);
    const quick = end(true);
    expect(all.changes).toEqual([8, 5, 1, 0, 0, 0]);
    expect(quick.changes).toEqual([8, 5, 1, 0]);
    expect(quick.d).toEqual(all.d);
    expect(quick.pi).toEqual(all.pi);
  });

  it('finds the cycle by following π back', () => {
    const last = (text: string, s = 'A') =>
      new Timeline(bellmanFord, bellmanFord.defaults, 1, [
        ['load', text],
        ['run', s],
      ]).entries[1]!.steps.at(-1)!;
    const st = last('A>B:1, B>C:2, C>D:-6, D>E:1, E>B:2, E>F:3');
    expect(st.say).toContain('C ← B ← E ← D ← C');
    expect(st.say).toContain('B → C → D → E → B');
    expect(st.say).toContain('Bellman-Ford returns FALSE');
    expect(last('A-B:2, B-C:-1, C-D:3').say).toContain('an undirected edge goes both ways');
    expect(last('A>B:2, B>C:3, D>E:1, E>F:-3, F>D:1, F>C:2').say).toContain(
      'but A cannot reach it',
    );
  });

  it('keeps pseudocode lines short enough for a phone', () => {
    for (const early of [false, true])
      for (const block of pseudocode({ ...bellmanFord.defaults, early }))
        for (const l of block.lines)
          expect(2 * l.indent + l.text.length, `${l.id}: ${l.text}`).toBeLessThanOrEqual(33);
  });
});

describe('Bellman-Ford practice', () => {
  it('has answers that agree with the reference', () => {
    const kinds = bellmanFord.practice!;
    expect(kinds.length).toBeGreaterThanOrEqual(3);
    expect(kinds.length).toBeLessThanOrEqual(4);
    for (let seed = 1; seed <= 150; seed++) {
      for (const kind of kinds) {
        const q = kind.make(makeRng(seed));
        const where = `${kind.id} seed ${seed}`;
        const g = parseGraph(String(q.setup[0]![1])) as Graph;
        expect(q.watch).toEqual([['run', 'A']]);
        const a = q.answer;
        if (kind.id === 'changes') {
          const k = Number(/does pass (\d+) lower/.exec(q.prompt)![1]);
          expect(a.kind === 'number' && a.value, where).toBe(reference(g, 'A').changes[k - 1]);
        } else if (kind.id === 'after-pass') {
          const v = /`(\w+)\.d` right after pass 1/.exec(q.prompt)![1]!;
          expect(a.kind === 'number' && a.value, where).toBe(
            reference(g, 'A').afterPass[0]!.get(v),
          );
        } else if (kind.id === 'passes') {
          expect(q.settings?.early).toBe(true);
          expect(a.kind === 'number' && a.value, where).toBe(
            reference(g, 'A', true).changes.length,
          );
        } else if (kind.id === 'result') {
          const right = a.kind === 'choice' && a.options[a.correct]!;
          expect(right, where).toMatch(reference(g, 'A').negative ? /^FALSE/ : /^TRUE/);
        } else {
          throw new Error(`untested kind ${kind.id}`);
        }
      }
    }
  });
});

describe('drawn text size', () => {
  // A long spring layout may turn on its side on a phone (7.1 px before, 8.5 after), and a
  // long, thin one may come shorter along its length: 9.9.
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(bellmanFord, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(bellmanFord, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
