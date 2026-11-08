import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeRng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import type { Graph } from '../_graph/graph';
import { parseGraph } from '../_graph/parse';
import { dfs } from '.';
import {
  parens,
  pseudocode,
  type DfsRun,
  type DfsSettings,
  type EdgeKind,
  type Style,
} from './model';
import { smallestText } from '../../render/text-size';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';

// ---------------------------------------------------------------------------------------------
// Reference: a recursive DFS over sorted adjacency lists, written independently of the page.

interface RefResult {
  d: Map<string, number>;
  f: Map<string, number>;
  pi: Map<string, string>;
  kind: Map<string, EdgeKind>;
}

function adjOf(g: Graph, reversed = false): Map<string, string[]> {
  const adj = new Map(g.vertices.map((v) => [v, [] as string[]]));
  for (const e of g.edges) {
    adj.get(e.u)!.push(e.v);
    if (!g.directed) adj.get(e.v)!.push(e.u);
  }
  for (const list of adj.values()) {
    list.sort();
    if (reversed) list.reverse();
  }
  return adj;
}

const keyOf = (g: Graph, u: string, v: string) => (g.directed || u < v ? `${u}-${v}` : `${v}-${u}`);

/** Recursive DFS from s, then from every white vertex in order. */
function refDfs(g: Graph, s: string, reversed = false): RefResult {
  const adj = adjOf(g, reversed);
  const d = new Map<string, number>();
  const f = new Map<string, number>();
  const pi = new Map<string, string>();
  const kind = new Map<string, EdgeKind>();
  let time = 0;
  const visit = (u: string) => {
    d.set(u, ++time);
    for (const v of adj.get(u)!) {
      const k = keyOf(g, u, v);
      if (!d.has(v)) {
        kind.set(k, 'tree');
        pi.set(v, u);
        visit(v);
      } else if (!f.has(v)) {
        if (g.directed || pi.get(u) !== v) kind.set(k, 'back');
      } else if (g.directed) {
        kind.set(k, d.get(u)! < d.get(v)! ? 'forward' : 'cross');
      }
    }
    f.set(u, ++time);
  };
  for (const u of [s, ...g.vertices.filter((x) => x !== s)]) if (!d.has(u)) visit(u);
  return { d, f, pi, kind };
}

// ---------------------------------------------------------------------------------------------
// Invariants every step of a run keeps.

function checkRun(g: Graph, r: DfsRun, style: Style) {
  const adj = adjOf(g);
  // A gray vertex has not finished; it will finish after everything discovered after it.
  const end = (v: string) => r.f[v] ?? 1e9 - (r.d[v] ?? 0);
  const found = g.vertices.filter((v) => r.d[v] !== null);
  const stamps = found.flatMap((v) => [r.d[v]!, ...(r.f[v] === null ? [] : [r.f[v]!])]);
  expect(new Set(stamps).size, 'every tick is used once').toBe(stamps.length);
  expect(stamps.length).toBe(r.time);
  for (const t of stamps) expect(t >= 1 && t <= r.time).toBe(true);
  for (const v of g.vertices) {
    const c = r.color[v];
    if (c === 'white') {
      expect(r.d[v]).toBeNull();
      // CLRS sets v.π just before it calls DFS-VISIT(v), while v is still white.
      if (r.pi[v] !== null) expect(v).toBe(r.v);
    } else expect(r.d[v]).not.toBeNull();
    expect(c === 'black').toBe(r.f[v] !== null);
    if (c === 'black') for (const x of adj.get(v)!) expect(r.color[x]).not.toBe('white');
    // The parent is an ancestor: its interval holds this one.
    const p = r.pi[v];
    if (p && r.d[v] !== null) expect(r.d[p]! < r.d[v]! && end(v) < end(p)).toBe(true);
  }
  // Intervals nest or are disjoint (the parenthesis theorem).
  for (const u of found)
    for (const v of found) {
      if (u === v) continue;
      const [a, b] = [r.d[u]!, end(u)];
      const [c, e] = [r.d[v]!, end(v)];
      const nested = (a < c && e < b) || (c < a && b < e);
      const disjoint = b < c || e < a;
      expect(nested || disjoint, `${u} and ${v}`).toBe(true);
    }
  // The gray vertices are one chain from a root, and in the recursion they are the calls.
  const gray = found.filter((v) => r.color[v] === 'gray').sort((x, y) => r.d[x]! - r.d[y]!);
  for (let i = 1; i < gray.length; i++) expect(r.pi[gray[i]!]).toBe(gray[i - 1]);
  if (style === 'recursive') expect(r.calls).toEqual(gray);
  // Edge kinds agree with the times.
  for (const [key, kind] of Object.entries(r.edges)) {
    const [x, y] = key.split('-') as [string, string];
    // For an undirected edge, the end the search came from is the earlier one.
    const start = (z: string) => r.d[z] ?? Infinity;
    const [u, v] = !g.directed && start(y) < start(x) ? [y, x] : [x, y];
    // A tree edge is named just before its child is discovered.
    if (r.d[v] === null) {
      expect(kind).toBe('tree');
      continue;
    }
    if (!g.directed) expect(kind === 'tree' || kind === 'back', key).toBe(true);
    if (kind === 'tree') expect(r.pi[v] === u || (!g.directed && r.pi[u] === v), key).toBe(true);
    if (kind === 'back') expect(r.d[v]! < r.d[u]! || !g.directed, key).toBe(true);
    if (kind === 'back' && g.directed) expect(end(u) < end(v), key).toBe(true);
    if (kind === 'forward') expect(r.d[u]! < r.d[v]! && end(v) < end(u), key).toBe(true);
    if (kind === 'cross') expect(end(v) < r.d[u]!, key).toBe(true);
  }
}

const letters = 'ABCDEFGH'.split('');
const graphArb = fc
  .record({
    n: fc.integer({ min: 1, max: 8 }),
    directed: fc.boolean(),
    pairs: fc.array(fc.tuple(fc.nat(7), fc.nat(7)), { maxLength: 16 }),
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

describe('depth-first search', () => {
  it('matches a reference DFS and keeps the DFS invariants on every step', () => {
    fc.assert(
      fc.property(
        graphArb,
        fc.constantFrom(...letters, 'Z'),
        fc.constantFrom<Style>('recursive', 'stack', 'stackrev'),
        (text, s, style) => {
          const settings: DfsSettings = { ...dfs.defaults, style };
          const calls: OpCall[] = [
            ['load', text],
            ['run', s],
          ];
          const t = new Timeline(dfs, settings, 1, calls);
          const g = t.entries[0]!.end.graph;
          const entry = t.entries[1]!;
          if (!g.vertices.includes(s)) {
            expect(entry.steps).toHaveLength(1);
            expect(entry.steps[0]!.say).toContain(`There is no vertex ${s}.`);
            return;
          }
          for (const st of entry.steps) checkRun(g, st.extra!.run!, style);
          const r = entry.steps.at(-1)!.extra!.run!;
          // The explicit stack pushed A to Z is the recursion with each list reversed.
          const ref = refDfs(g, s, style === 'stack');
          for (const v of g.vertices) {
            expect(r.color[v], v).toBe('black');
            expect(r.d[v], `d[${v}]`).toBe(ref.d.get(v));
            expect(r.f[v], `f[${v}]`).toBe(ref.f.get(v));
            expect(r.pi[v], `π[${v}]`).toBe(ref.pi.get(v) ?? null);
          }
          expect(r.edges).toEqual(Object.fromEntries(ref.kind));
          // Every edge gets exactly one kind, and the parentheses list every tick once.
          expect(Object.keys(r.edges)).toHaveLength(g.edges.length);
          expect(parens(g, r)).toHaveLength(2 * g.vertices.length);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('keeps pseudocode lines short enough for a phone', () => {
    for (const style of ['recursive', 'stack', 'stackrev'] as const)
      for (const block of pseudocode({ ...dfs.defaults, style }))
        for (const l of block.lines)
          expect(2 * l.indent + l.text.length, `${l.id}: ${l.text}`).toBeLessThanOrEqual(33);
  });

  it('finds every kind of edge in the curated directed example', () => {
    const ex = dfs.examples.find((e) => e.id === 'every-kind')!;
    const t = new Timeline(dfs, { ...dfs.defaults, ...ex.settings }, 1, ex.ops);
    const r = t.entries.at(-1)!.steps.at(-1)!.extra!.run!;
    expect(new Set(Object.values(r.edges))).toEqual(new Set(['tree', 'back', 'forward', 'cross']));
    expect(r.roots).toEqual(['A', 'D']);
  });
});

describe('DFS practice', () => {
  it('has answers that agree with the reference DFS', () => {
    const kinds = dfs.practice!;
    expect(kinds.length).toBeGreaterThanOrEqual(3);
    expect(kinds.length).toBeLessThanOrEqual(4);
    const order = (m: Map<string, number>) => [...m.keys()].sort((a, b) => m.get(a)! - m.get(b)!);
    for (let seed = 1; seed <= 150; seed++) {
      for (const kind of kinds) {
        const q = kind.make(makeRng(seed));
        const where = `${kind.id} seed ${seed}`;
        const g = parseGraph(String(q.setup[0]![1])) as Graph;
        expect(q.watch![0]![0]).toBe('run');
        const ref = refDfs(g, String(q.watch![0]![1]));
        const a = q.answer;
        if (kind.id === 'discovery') {
          expect(a.kind === 'sequence' && a.value, where).toEqual(order(ref.d));
        } else if (kind.id === 'finish') {
          expect(a.kind === 'sequence' && a.value, where).toEqual(order(ref.f));
        } else if (kind.id === 'edge-kind') {
          const [, text] = /What kind of edge is `([^`]+)`/.exec(q.prompt)!;
          const [u, v] = text!.split(/[->]/) as [string, string];
          const want = ref.kind.get(keyOf(g, u, v))!;
          const label = {
            tree: 'Tree edge',
            back: 'Back edge',
            forward: 'Forward edge',
            cross: 'Cross edge',
          };
          expect(a.kind === 'choice' && a.options[a.correct], where).toBe(label[want]);
        } else if (kind.id === 'times') {
          const v = /Type `(\w+)\.d`/.exec(q.prompt)![1]!;
          expect(a.kind === 'sequence' && a.value, where).toEqual([
            String(ref.d.get(v)),
            String(ref.f.get(v)),
          ]);
        } else {
          throw new Error(`untested kind ${kind.id}`);
        }
      }
    }
  });
});

describe('drawn text size', () => {
  // A path's spring layout runs across: 7.2 px on a phone, until it could turn to run down
  // (8.7), and come shorter along its length (9.1).
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(dfs, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(dfs, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
