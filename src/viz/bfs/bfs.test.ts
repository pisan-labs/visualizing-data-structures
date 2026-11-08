import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeRng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { parseGraph } from '../_graph/parse';
import type { Graph } from '../_graph/graph';
import { bfs } from '.';
import { pseudocode, type BfsRun, type BfsSettings } from './model';
import { smallestText } from '../../render/text-size';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';

// ---------------------------------------------------------------------------------------------
// Reference: a plain BFS over sorted adjacency lists, written independently of the page.

interface RefResult {
  order: string[];
  d: Map<string, number>;
  pi: Map<string, string>;
  /** The queue right after each vertex finishes. */
  queueAfter: Map<string, string[]>;
}

function adjOf(g: Graph): Map<string, string[]> {
  const adj = new Map(g.vertices.map((v) => [v, [] as string[]]));
  for (const e of g.edges) {
    adj.get(e.u)!.push(e.v);
    if (!g.directed) adj.get(e.v)!.push(e.u);
  }
  for (const list of adj.values()) list.sort();
  return adj;
}

function refBfs(g: Graph, s: string): RefResult {
  const adj = adjOf(g);
  const d = new Map([[s, 0]]);
  const pi = new Map<string, string>();
  const order: string[] = [];
  const queueAfter = new Map<string, string[]>();
  const q = [s];
  while (q.length) {
    const u = q.shift()!;
    order.push(u);
    for (const v of adj.get(u)!) {
      if (d.has(v)) continue;
      d.set(v, d.get(u)! + 1);
      pi.set(v, u);
      q.push(v);
    }
    queueAfter.set(u, [...q]);
  }
  return { order, d, pi, queueAfter };
}

/** Shortest edge counts by relaxing every edge V times (no queue at all). */
function distances(g: Graph, s: string): Map<string, number> {
  const d = new Map([[s, 0]]);
  const arcs = g.edges.flatMap((e) =>
    g.directed
      ? [[e.u, e.v]]
      : [
          [e.u, e.v],
          [e.v, e.u],
        ],
  );
  for (let i = 0; i < g.vertices.length; i++)
    for (const [a, b] of arcs)
      if (d.has(a!) && (!d.has(b!) || d.get(a!)! + 1 < d.get(b!)!)) d.set(b!, d.get(a!)! + 1);
  return d;
}

// ---------------------------------------------------------------------------------------------
// Invariants every step of a run keeps.

function checkRun(g: Graph, r: BfsRun, truth: Map<string, number>, vars: Record<string, unknown>) {
  const adj = adjOf(g);
  const found = g.vertices.filter((v) => r.d[v] !== null);
  for (const v of g.vertices) {
    if (r.color[v] === 'white') {
      expect(r.d[v], `${v} white has no d`).toBeNull();
      expect(r.pi[v]).toBeNull();
    } else {
      expect(r.d[v], `${v} found has d`).not.toBeNull();
      // BFS never sets a distance below the true one.
      expect(r.d[v]!).toBeGreaterThanOrEqual(truth.get(v)!);
    }
    if (v !== r.s && r.pi[v] !== null) {
      const p = r.pi[v]!;
      expect(r.d[v]).toBe(r.d[p]! + 1);
      expect(adj.get(p)).toContain(v);
    }
    if (r.color[v] === 'black') {
      expect(r.queue).not.toContain(v);
      for (const x of adj.get(v)!) expect(r.color[x], `${x} next to black ${v}`).not.toBe('white');
    }
  }
  // The queue holds gray vertices, at most two distances, nearer ones in front.
  const ds = r.queue.map((v) => r.d[v]!);
  for (const v of r.queue) expect(r.color[v]).toBe('gray');
  for (let i = 1; i < ds.length; i++) expect(ds[i]!).toBeGreaterThanOrEqual(ds[i - 1]!);
  if (ds.length) expect(ds.at(-1)! - ds[0]!).toBeLessThanOrEqual(1);
  expect(new Set(r.queue).size).toBe(r.queue.length);
  const tree = Object.values(r.edges).filter((x) => x === 'tree').length;
  expect(tree).toBe(Math.max(0, found.length - 1));
  expect(vars.found).toBe(found.length);
  expect(vars.Q).toBe(r.queue.length ? r.queue.join(' ') : 'empty');
}

const letters = 'ABCDEFGHI'.split('');
const graphArb = fc
  .record({
    n: fc.integer({ min: 1, max: 9 }),
    directed: fc.boolean(),
    pairs: fc.array(fc.tuple(fc.nat(8), fc.nat(8)), { maxLength: 18 }),
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

describe('breadth-first search', () => {
  it('matches a reference BFS and keeps the BFS invariants on every step', () => {
    fc.assert(
      fc.property(
        graphArb,
        fc.constantFrom(...letters, 'Z'),
        fc.constantFrom<BfsSettings['marking']>('colors', 'visited'),
        (text, s, marking) => {
          const settings: BfsSettings = { ...bfs.defaults, marking };
          const calls: OpCall[] = [
            ['load', text],
            ['run', s],
          ];
          const t = new Timeline(bfs, settings, 1, calls);
          const g = t.entries[0]!.end.graph;
          const entry = t.entries[1]!;
          if (!g.vertices.includes(s)) {
            expect(entry.steps).toHaveLength(1);
            expect(entry.steps[0]!.say).toContain(`There is no vertex ${s}.`);
            return;
          }
          const truth = distances(g, s);
          for (const st of entry.steps) {
            expect(st.state.graph).toBe(g);
            checkRun(g, st.extra!.run!, truth, st.vars ?? {});
          }
          const r = entry.steps.at(-1)!.extra!.run!;
          const ref = refBfs(g, s);
          expect(r.order).toEqual(ref.order);
          expect(r.queue).toEqual([]);
          for (const v of g.vertices) {
            expect(r.d[v], `d[${v}]`).toBe(truth.has(v) ? truth.get(v)! : null);
            expect(r.d[v]).toBe(ref.d.get(v) ?? null);
            expect(r.pi[v]).toBe(ref.pi.get(v) ?? null);
          }
          // Every edge out of a reached vertex was looked at; nothing else was.
          const adj = adjOf(g);
          const checks = ref.order.reduce((n, u) => n + adj.get(u)!.length, 0);
          expect(entry.steps.at(-1)!.vars!.checks).toBe(checks);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('gives the same results with colors and with a visited flag', () => {
    const calls: OpCall[] = [
      ['load', 'A-B, A-C, B-D, C-D, D-E, F'],
      ['run', 'A'],
    ];
    const end = (marking: BfsSettings['marking']) =>
      new Timeline(bfs, { ...bfs.defaults, marking }, 1, calls).entries[1]!.steps.at(-1)!.extra!
        .run!;
    const a = end('colors');
    const b = end('visited');
    expect([a.order, a.d, a.pi]).toEqual([b.order, b.d, b.pi]);
  });

  it('keeps pseudocode lines short enough for a phone', () => {
    for (const marking of ['colors', 'visited'] as const)
      for (const block of pseudocode({ ...bfs.defaults, marking }))
        for (const l of block.lines)
          expect(2 * l.indent + l.text.length, `${l.id}: ${l.text}`).toBeLessThanOrEqual(33);
  });
});

describe('BFS practice', () => {
  it('has answers that agree with the reference BFS', () => {
    const kinds = bfs.practice!;
    expect(kinds.length).toBeGreaterThanOrEqual(3);
    expect(kinds.length).toBeLessThanOrEqual(4);
    for (let seed = 1; seed <= 150; seed++) {
      for (const kind of kinds) {
        const q = kind.make(makeRng(seed));
        const where = `${kind.id} seed ${seed}`;
        const g = parseGraph(String(q.setup[0]![1])) as Graph;
        expect(q.watch![0]![0]).toBe('run');
        const s = String(q.watch![0]![1]);
        const ref = refBfs(g, s);
        const a = q.answer;
        if (kind.id === 'order') {
          expect(a.kind === 'sequence' && a.value, where).toEqual(ref.order);
        } else if (kind.id === 'distance') {
          const v = /`(\w+)\.d`/.exec(q.prompt)![1]!;
          expect(a.kind === 'number' && a.value, where).toBe(ref.d.get(v));
          expect(ref.d.get(v)).toBe(distances(g, s).get(v));
        } else if (kind.id === 'queue') {
          const u = /Right after (\w+) turns black/.exec(q.prompt)![1]!;
          expect(a.kind === 'sequence' && a.value, where).toEqual(ref.queueAfter.get(u));
        } else if (kind.id === 'parent') {
          const v = /`(\w+)\.π`/.exec(q.prompt)![1]!;
          expect(a.kind === 'choice' && a.options[a.correct], where).toBe(ref.pi.get(v));
        } else {
          throw new Error(`untested kind ${kind.id}`);
        }
      }
    }
  });
});

describe('drawn text size', () => {
  // A path's spring layout runs across: 6.7 px on a phone, until it could turn to run down.
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(bfs, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(bfs, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
