import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { keyOf } from '../_graph/graph';
import { formatNetwork, parseNetwork, residual, type Network } from '../_flow/network';
import { pushRelabel } from '.';
import { pseudocode, type PrRun, type PrSettings, type Rule } from './model';

// ---------------------------------------------------------------------------------------------
// A reference written independently of the page: the minimum cut by trying every s side.

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

function check(net: Network, settings: PrSettings) {
  const steps = new Timeline(pushRelabel, settings, 1, [
    ['load', formatNetwork(net)],
    ['run'],
  ]).entries.at(-1)!.steps;
  const n = net.graph.vertices.length;
  let lastH: Record<string, number> | null = null;
  for (const st of steps) {
    const r = st.extra?.run as PrRun | undefined;
    if (!r) continue;
    // A preflow at every step: capacities, at most one arc of a pair carries flow, and each
    // excess is what flows in minus what flows out (never negative except at s).
    for (const e of net.graph.edges) {
      const f = r.flow[keyOf(e)] ?? 0;
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThanOrEqual(e.w);
      if (f > 0) expect(r.flow[`${e.v}-${e.u}`] ?? 0).toBe(0);
    }
    for (const v of net.graph.vertices) {
      let inflow = 0;
      for (const e of net.graph.edges) {
        if (e.v === v) inflow += r.flow[keyOf(e)] ?? 0;
        if (e.u === v) inflow -= r.flow[keyOf(e)] ?? 0;
      }
      expect(r.e[v], `excess of ${v}`).toBe(inflow);
      if (v !== net.s) expect(r.e[v]).toBeGreaterThanOrEqual(0);
    }
    // Heights: s at |V|, t at 0, never above 2|V| - 1, never going down; and every residual
    // arc drops at most one level (the height function is valid).
    expect(r.h[net.s!]).toBe(n);
    expect(r.h[net.t!]).toBe(0);
    for (const v of net.graph.vertices) {
      expect(r.h[v]).toBeLessThanOrEqual(2 * n - 1);
      if (lastH) expect(r.h[v]).toBeGreaterThanOrEqual(lastH[v]!);
    }
    // (Once the preflow has filled every arc out of s.)
    const filling = st.lines.includes('init') || st.lines.includes('fill');
    for (const u of net.graph.vertices)
      for (const v of net.graph.vertices)
        if (!filling && u !== v && residual(net, r.flow, u, v) > 0)
          expect(r.h[u]!, `${u}→${v} drops at most one level`).toBeLessThanOrEqual(r.h[v]! + 1);
    lastH = r.h;
  }
  const r = steps.at(-1)!.extra!.run as PrRun;
  const best = minCut(net);
  expect(r.e[net.t!]).toBe(best);
  // Nothing overflows at the end, and the s side's arcs out are full.
  for (const v of net.graph.vertices)
    if (v !== net.s && v !== net.t) expect(r.e[v], `${v} at the end`).toBe(0);
  let cap = 0;
  for (const e of net.graph.edges)
    if (r.side!.includes(e.u) && !r.side!.includes(e.v)) {
      cap += e.w;
      expect(r.flow[keyOf(e)] ?? 0).toBe(e.w);
    }
  expect(cap).toBe(best);
  expect(r.ek!.value).toBe(best);
  expect(r.relabels).toBeLessThanOrEqual(2 * n * n);
}

describe('push-relabel', () => {
  it('finds a maximum flow and a minimum cut, with a valid preflow and heights at every step', () => {
    fc.assert(
      fc.property(networkArb, fc.constantFrom<Rule>('fifo', 'highest', 'front'), (net, rule) => {
        check(net, { ...pushRelabel.defaults, rule });
      }),
      { numRuns: 200 },
    );
  });

  it('gets the classic network right: 23, with the cut Edmonds-Karp finds', () => {
    const t = new Timeline(pushRelabel, pushRelabel.defaults, 1, [['run']]);
    const r = t.entries[0]!.steps.at(-1)!.extra!.run!;
    expect(r.e.t).toBe(23);
    expect(r.side).toEqual(['s', 'a', 'b', 'd']);
    expect([r.pushes, r.relabels]).toEqual([15, 12]);
    expect(r.ek).toEqual({ value: 23, paths: 3, checks: 53 });
  });

  it('sends what cannot reach t back to s, above height |V|', () => {
    const t = new Timeline(pushRelabel, pushRelabel.defaults, 1, [
      ['load', 's>a:9, a>b:4, a>c:5, b>t:3, c>t:2'],
      ['run'],
    ]);
    const r = t.entries.at(-1)!.steps.at(-1)!.extra!.run!;
    expect(r.e.t).toBe(5);
    expect(r.e.s).toBe(-5);
    expect(r.h.a).toBeGreaterThan(r.h.s!);
  });

  it('keeps pseudocode lines short enough for a phone', () => {
    for (const rule of ['fifo', 'highest', 'front'] as const)
      for (const block of pseudocode({ ...pushRelabel.defaults, rule }))
        for (const l of block.lines)
          expect(2 * l.indent + l.text.length, `${l.id}: ${l.text}`).toBeLessThanOrEqual(34);
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(pushRelabel, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(pushRelabel, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
