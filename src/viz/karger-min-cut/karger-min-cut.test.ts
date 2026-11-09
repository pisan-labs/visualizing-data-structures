import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { components, makeGraph, type Graph } from '../_graph/graph';
import { formatGraph } from '../_graph/parse';
import { kargerMinCut } from '.';
import { crossing, groupsOf, type KgSettings, type KgState, type PickRule } from './model';

// ---------------------------------------------------------------------------------------------
// References written independently of the page: the minimum cut by colouring the vertices two
// ways in every possible manner, and one Karger trial replayed from the same random draws.

function refMinCut(g: Graph): number {
  let best = Infinity;
  const side = new Map<string, number>();
  const go = (i: number) => {
    if (i === g.vertices.length) {
      const sides = new Set(side.values());
      if (sides.size < 2) return;
      best = Math.min(best, g.edges.filter((e) => side.get(e.u) !== side.get(e.v)).length);
      return;
    }
    for (const c of i === 0 ? [0] : [0, 1]) {
      side.set(g.vertices[i]!, c);
      go(i + 1);
    }
  };
  go(0);
  return best;
}

function refTrial(g: Graph, draws: number[]): Map<string, string> {
  const parent = new Map(g.vertices.map((v) => [v, v]));
  const find = (v: string): string => (parent.get(v) === v ? v : find(parent.get(v)!));
  let k = g.vertices.length;
  let d = 0;
  while (k > 2) {
    const left = g.edges.filter((e) => find(e.u) !== find(e.v));
    if (!left.length) break;
    const e = left[draws[d++]!]!;
    parent.set(find(e.v), find(e.u));
    k--;
  }
  expect(d).toBe(draws.length);
  return new Map(g.vertices.map((v) => [v, find(v)]));
}

const names = 'ABCDEFG'.split('');
const graphArb = fc
  .array(fc.tuple(fc.nat(6), fc.nat(6)), { minLength: 1, maxLength: 16 })
  .map((pairs) => {
    const edges = pairs
      .filter(([a, b]) => a !== b)
      .map(([a, b]) => ({ u: names[a]!, v: names[b]!, w: 1 }));
    const seen = new Set<string>();
    const unique = edges.filter((e) => {
      const k = [e.u, e.v].sort().join('-');
      return !seen.has(k) && !!seen.add(k);
    });
    const used = new Set(unique.flatMap((e) => [e.u, e.v]));
    return makeGraph({
      directed: false,
      weighted: false,
      vertices: names.filter((v, i) => used.has(v) || i < 2),
      edges: unique,
    });
  });

/** Each super-vertex is connected in the original graph: contraction only merges along edges. */
function connectedGroups(s: KgState) {
  for (const [, members] of groupsOf(s)) {
    const sub = makeGraph({
      directed: false,
      weighted: false,
      vertices: members,
      edges: s.graph.edges.filter((e) => members.includes(e.u) && members.includes(e.v)),
    });
    expect(components(sub).length, `${members.join('')} is connected`).toBe(1);
  }
}

describe('karger-min-cut', () => {
  it('contracts along edges to a cut that is never below the minimum', () => {
    fc.assert(
      fc.property(
        graphArb,
        fc.constantFrom<PickRule>('edge', 'shuffle'),
        fc.integer({ min: 1, max: 1000 }),
        (g, pick, seed) => {
          const settings: KgSettings = { ...kargerMinCut.defaults, pick };
          const t = new Timeline(kargerMinCut, settings, seed, [
            ['load', formatGraph(g)],
            ['contract'],
          ]);
          const steps = t.entries.at(-1)!.steps;
          let count = g.vertices.length;
          for (const st of steps) {
            const s = st.state;
            const now = groupsOf(s).length;
            // One contraction at a time.
            expect(now === count || now === count - 1).toBe(true);
            count = now;
            connectedGroups(s);
            expect(crossing(s).every((e) => s.group[e.u] !== s.group[e.v])).toBe(true);
          }
          const end = t.entries.at(-1)!.end;
          const best = refMinCut(g);
          expect(end.minCut).toBe(best);
          expect(end.cut!.length).toBeGreaterThanOrEqual(best);
          expect(end.cut!.length).toBe(crossing(end).length);
          const pieces = components(g).length;
          expect(groupsOf(end).length).toBe(Math.max(2, pieces));
          if (pick === 'edge') {
            // The same draws give the same super-vertices in a plain union-find version.
            const ref = refTrial(g, end.draws);
            for (const u of g.vertices)
              for (const v of g.vertices)
                expect(end.group[u] === end.group[v]).toBe(ref.get(u) === ref.get(v));
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('counts trials consistently, and never below the minimum cut', () => {
    fc.assert(
      fc.property(graphArb, fc.integer({ min: 1, max: 1000 }), (g, seed) => {
        const settings: KgSettings = { ...kargerMinCut.defaults, trials: 30 };
        const t = new Timeline(kargerMinCut, settings, seed, [
          ['load', formatGraph(g)],
          ['trials'],
        ]);
        const end = t.entries.at(-1)!.end;
        const st = end.stats!;
        expect(st.runs).toBe(30);
        expect(st.sizes.reduce((a, b) => a + b, 0)).toBe(30);
        expect(st.found).toBe(st.sizes[end.minCut!] ?? 0);
        for (let k = 0; k < end.minCut!; k++) expect(st.sizes[k] ?? 0).toBe(0);
        // The picture shows the smallest cut found.
        const smallest = st.sizes.findIndex((n) => n > 0);
        expect(end.cut!.length).toBe(smallest);
      }),
      { numRuns: 60 },
    );
  });

  it('finds the bridge between two squares about as often as it should', () => {
    // Two K4s and a bridge: 43 of 100 trials with seed 1, far above the bound of 1/28.
    const t = new Timeline(kargerMinCut, kargerMinCut.defaults, 1, [['trials']]);
    const st = t.entries[0]!.end.stats!;
    expect(st.found / st.runs).toBeGreaterThan(1 / 28);
    expect(t.entries[0]!.end.minCut).toBe(1);
  });

  it('refuses to contract inside a super-vertex or with no edge between the two', () => {
    const t = new Timeline(kargerMinCut, kargerMinCut.defaults, 1, [
      ['load', 'A-B, B-C, C-D'],
      ['merge', 'A-B'],
      ['merge', 'B-A'],
      ['merge', 'A-D'],
    ]);
    const [, , same, none] = t.entries;
    expect(same!.steps[0]!.say).toMatch(/already in the same super-vertex/);
    expect(none!.steps[0]!.say).toMatch(/No edge joins/);
    expect(groupsOf(none!.end).length).toBe(3);
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(kargerMinCut, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(kargerMinCut, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
