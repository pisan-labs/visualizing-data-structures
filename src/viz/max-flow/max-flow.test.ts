import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import { keyOf } from '../_graph/graph';
import { formatNetwork, parseNetwork, residual, type Network } from '../_flow/network';
import { maxFlow } from '.';
import { pseudocode, type MfRun, type MfSettings } from './model';
import { smallestText } from '../../render/text-size';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';

// ---------------------------------------------------------------------------------------------
// References written independently of the page: the minimum cut by trying every s side, and
// BFS distances in a residual network.

function minCut(net: Network): number {
  const others = net.graph.vertices.filter((v) => v !== net.s && v !== net.t);
  let best = Infinity;
  for (let mask = 0; mask < 1 << others.length; mask++) {
    const S = new Set([net.s!, ...others.filter((_, i) => mask & (1 << i))]);
    let c = 0;
    for (const e of net.graph.edges) if (S.has(e.u) && !S.has(e.v)) c += e.w;
    best = Math.min(best, c);
  }
  return best;
}

function bfsDist(net: Network, flow: Record<string, number>, s: string): Map<string, number> {
  const d = new Map([[s, 0]]);
  const q = [s];
  for (let i = 0; i < q.length; i++)
    for (const v of net.graph.vertices)
      if (!d.has(v) && residual(net, flow, q[i]!, v) > 0) {
        d.set(v, d.get(q[i]!)! + 1);
        q.push(v);
      }
  return d;
}

// ---------------------------------------------------------------------------------------------

const names = ['s', 'a', 'b', 'c', 'd', 't'];
const networkArb = fc
  .array(fc.tuple(fc.nat(5), fc.nat(5), fc.integer({ min: 1, max: 9 })), {
    minLength: 1,
    maxLength: 14,
  })
  .map((arcs) => {
    const seen = new Set<string>();
    const items = arcs
      .filter(([a, b]) => a !== b && !seen.has(`${a}-${b}`) && seen.add(`${a}-${b}`))
      .map(([a, b, w]) => `${names[a]}>${names[b]}:${w}`);
    return parseNetwork(['s', 't', ...items].join(', ')) as Network;
  });

function check(net: Network, settings: MfSettings) {
  const steps = new Timeline(maxFlow, settings, 1, [
    ['load', formatNetwork(net)],
    ['run'],
  ]).entries.at(-1)!.steps;
  let pushes = 0;
  let lastLength = 0;
  for (const st of steps) {
    const r = st.extra?.run as MfRun | undefined;
    if (!r) continue;
    // A flow at every step: capacities and conservation.
    for (const e of net.graph.edges) {
      const f = r.flow[keyOf(e)] ?? 0;
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThanOrEqual(e.w);
      // At most one arc of an opposite pair carries flow.
      if (f > 0) expect(r.flow[`${e.v}-${e.u}`] ?? 0).toBe(0);
    }
    for (const v of net.graph.vertices) {
      if (v === net.s || v === net.t) continue;
      let net0 = 0;
      for (const e of net.graph.edges) {
        if (e.v === v) net0 += r.flow[keyOf(e)] ?? 0;
        if (e.u === v) net0 -= r.flow[keyOf(e)] ?? 0;
      }
      expect(net0, `conservation at ${v}`).toBe(0);
    }
    // The augmenting path is a residual path with the right bottleneck; with BFS, a shortest
    // one, and the lengths never shrink (Edmonds-Karp's key lemma).
    if (r.path && r.paths.length === pushes) {
      const caps = r.path.slice(1).map((v, i) => residual(net, r.flow, r.path![i]!, v));
      expect(Math.min(...caps)).toBe(r.b);
      expect(r.b).toBeGreaterThan(0);
      if (settings.method === 'bfs') {
        expect(r.path.length - 1).toBe(bfsDist(net, r.flow, net.s!).get(net.t!));
        expect(r.path.length).toBeGreaterThanOrEqual(lastLength);
        lastLength = r.path.length;
      }
    }
    pushes = r.paths.length;
  }
  const r = steps.at(-1)!.extra!.run as MfRun;
  const best = minCut(net);
  expect(r.value).toBe(best);
  // The s side of the final search is a minimum cut, and its arcs are full.
  let cap = 0;
  for (const e of net.graph.edges)
    if (r.side!.includes(e.u) && !r.side!.includes(e.v)) {
      cap += e.w;
      expect(r.flow[keyOf(e)] ?? 0).toBe(e.w);
    }
  expect(cap).toBe(best);
  expect(r.side).toContain(net.s);
  expect(r.side).not.toContain(net.t);
}

describe('max-flow', () => {
  it('finds a maximum flow and a minimum cut, with valid flows at every step', () => {
    fc.assert(
      fc.property(networkArb, fc.constantFrom('bfs', 'dfs'), (net, method) => {
        check(net, { ...maxFlow.defaults, method: method as MfSettings['method'] });
      }),
      { numRuns: 200 },
    );
  });

  it('gets the classic network right: 23 in three paths', () => {
    const t = new Timeline(maxFlow, maxFlow.defaults, 1, [['run']]);
    const r = t.entries[0]!.steps.at(-1)!.extra!.run!;
    expect(r.value).toBe(23);
    expect(r.paths.map((a) => a.p.join(''))).toEqual(['sact', 'sbdt', 'sbdct']);
    expect(r.side).toEqual(['s', 'a', 'b', 'd']);
  });

  it('reads sources, sinks, undirected edges and bad capacities', () => {
    const n = parseNetwork('A>B:3, B>C:2') as Network;
    expect([n.s, n.t]).toEqual(['A', 'C']);
    const u = parseNetwork('s-a:4, a>t:2') as Network;
    expect(u.graph.edges.map(keyOf)).toEqual(['a-s', 'a-t', 's-a']);
    expect(parseNetwork('s>a:0')).toBeInstanceOf(Error);
    expect(parseNetwork('s>a:100')).toBeInstanceOf(Error);
    expect((parseNetwork('s>a:4:7, a>t:2') as Network).cost['s-a']).toBe(7);
  });

  it('keeps pseudocode lines short enough for a phone', () => {
    for (const method of ['bfs', 'dfs'] as const)
      for (const block of pseudocode({ ...maxFlow.defaults, method }))
        for (const l of block.lines)
          expect(2 * l.indent + l.text.length, `${l.id}: ${l.text}`).toBeLessThanOrEqual(34);
  });
});

describe('drawn text size', () => {
  // A left-to-right network may turn to run top to bottom on a phone: 6.8 px before, 8.1 after.
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(maxFlow, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(12.5);
    expect(smallestText(maxFlow, PHONE_STAGE).px).toBeGreaterThanOrEqual(8);
  });
});
