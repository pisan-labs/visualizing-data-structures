import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import { keyOf } from '../_graph/graph';
import { costOf, formatNetwork, parseNetwork, type Network } from '../_flow/network';
import { minCostFlow } from '.';
import { PARSE, pseudocode, type McRun, type McSettings } from './model';
import { smallestText } from '../../render/text-size';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';

// ---------------------------------------------------------------------------------------------
// References written independently of the page: the maximum flow value as the minimum cut over
// every s side, and the optimality test for a min-cost flow, no negative cycle in the residual
// network (found by Bellman-Ford from every vertex at once).

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

function hasNegativeCycle(net: Network, flow: Record<string, number>): boolean {
  const arcs: [string, string, number][] = [];
  for (const e of net.graph.edges) {
    const f = flow[keyOf(e)] ?? 0;
    const c = net.cost[keyOf(e)]!;
    if (f < e.w) arcs.push([e.u, e.v, c]);
    if (f > 0) arcs.push([e.v, e.u, -c]);
  }
  const d = new Map(net.graph.vertices.map((v) => [v, 0]));
  for (let i = 0; i < net.graph.vertices.length; i++)
    for (const [u, v, w] of arcs) if (d.get(u)! + w < d.get(v)!) d.set(v, d.get(u)! + w);
  return arcs.some(([u, v, w]) => d.get(u)! + w < d.get(v)!);
}

// ---------------------------------------------------------------------------------------------

const names = ['s', 'a', 'b', 'c', 'd', 't'];
const networkArb = fc
  .array(
    fc.tuple(fc.nat(5), fc.nat(5), fc.integer({ min: 1, max: 6 }), fc.integer({ min: 0, max: 9 })),
    { minLength: 1, maxLength: 12 },
  )
  .map((arcs) => {
    const seen = new Set<string>();
    const items = arcs
      .filter(([a, b]) => {
        if (a === b || seen.has(`${a}-${b}`) || seen.has(`${b}-${a}`)) return false;
        seen.add(`${a}-${b}`);
        return true;
      })
      .map(([a, b, w, c]) => `${names[a]}>${names[b]}:${w}:${c}`);
    return parseNetwork(['s', 't', ...items].join(', '), PARSE) as Network;
  });

function finalRun(net: Network, settings: McSettings) {
  const steps = new Timeline(minCostFlow, settings, 1, [
    ['load', formatNetwork(net, { costs: true })],
    ['run'],
  ]).entries.at(-1)!.steps;
  return { steps, r: steps.at(-1)!.extra!.run as McRun };
}

describe('min-cost-flow', () => {
  it('ends with the cheapest flow of the right size, and never a negative cycle on the way', () => {
    fc.assert(
      fc.property(
        networkArb,
        fc.constantFrom('bellman-ford', 'dijkstra'),
        fc.integer({ min: 0, max: 8 }),
        (net, method, target) => {
          const settings = { ...minCostFlow.defaults, method, target } as McSettings;
          const { steps, r } = finalRun(net, settings);
          const max = minCut(net);
          expect(r.value).toBe(target ? Math.min(target, max) : max);
          expect(costOf(net, r.flow)).toBe(r.cost);
          let unit = -Infinity;
          for (const st of steps) {
            const x = st.extra?.run as McRun | undefined;
            if (!x) continue;
            for (const e of net.graph.edges) {
              const f = x.flow[keyOf(e)] ?? 0;
              expect(f).toBeGreaterThanOrEqual(0);
              expect(f).toBeLessThanOrEqual(e.w);
            }
            expect(hasNegativeCycle(net, x.flow)).toBe(false);
          }
          // Path prices never go down.
          for (const p of r.paths) {
            expect(p.unit).toBeGreaterThanOrEqual(unit);
            unit = p.unit;
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('gives the same cost with Bellman-Ford and with Dijkstra', () => {
    fc.assert(
      fc.property(networkArb, (net) => {
        const a = finalRun(net, minCostFlow.defaults).r;
        const b = finalRun(net, { ...minCostFlow.defaults, method: 'dijkstra' }).r;
        expect([b.value, b.cost]).toEqual([a.value, a.cost]);
      }),
      { numRuns: 150 },
    );
  });

  it('refuses arcs both ways and costs out of range', () => {
    expect(parseNetwork('s>a:3:1, a>s:2:1', PARSE)).toBeInstanceOf(Error);
    expect(parseNetwork('s>a:3:-1, a>t:2', PARSE)).toBeInstanceOf(Error);
    expect(parseNetwork('s>a:3:100', PARSE)).toBeInstanceOf(Error);
    expect((parseNetwork('s>a:3, a>t:2:5', PARSE) as Network).cost).toEqual({
      's-a': 1,
      'a-t': 5,
    });
  });

  it('keeps pseudocode lines short enough for a phone', () => {
    for (const method of ['bellman-ford', 'dijkstra'] as const)
      for (const target of [0, 5])
        for (const block of pseudocode({ ...minCostFlow.defaults, method, target }))
          for (const l of block.lines)
            expect(2 * l.indent + l.text.length, `${l.id}: ${l.text}`).toBeLessThanOrEqual(34);
  });
});

describe('drawn text size', () => {
  // A left-to-right network may turn to run top to bottom on a phone: 7.1 px before, 8.8 after,
  // and 10.3 once the turned network may come shorter from s to t.
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(minCostFlow, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11.5);
    expect(smallestText(minCostFlow, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
