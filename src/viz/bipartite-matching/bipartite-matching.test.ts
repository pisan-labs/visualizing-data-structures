import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import { bipartiteMatching } from '.';
import { parseBipartite, pseudocode, type BmRun, type BmSettings, type BmState } from './model';

// ---------------------------------------------------------------------------------------------
// A reference written independently of the page: the largest matching by trying, for each left
// vertex in turn, to leave it out or to give it each free neighbour.

function bruteMax(s: BmState): number {
  const adj = new Map(s.left.map((u) => [u, [] as string[]]));
  for (const e of s.graph.edges) {
    const [u, v] = s.left.includes(e.u) ? [e.u, e.v] : [e.v, e.u];
    adj.get(u)!.push(v);
  }
  const go = (i: number, used: Set<string>): number => {
    if (i === s.left.length) return 0;
    let best = go(i + 1, used);
    for (const v of adj.get(s.left[i]!)!)
      if (!used.has(v)) {
        used.add(v);
        best = Math.max(best, 1 + go(i + 1, used));
        used.delete(v);
      }
    return best;
  };
  return go(0, new Set());
}

// ---------------------------------------------------------------------------------------------

const graphArb = fc.array(fc.tuple(fc.nat(5), fc.nat(5)), { maxLength: 16 }).map((pairs) => {
  const items = pairs.map(([a, b]) => `${'ABCDEF'[a]}-${b + 1}`);
  return ['A', ...items].join(', ');
});

function run(text: string, settings: BmSettings) {
  const t = new Timeline(bipartiteMatching, settings, 1, [['load', text], ['run']]);
  const state = t.endState();
  return { state, steps: t.entries.at(-1)!.steps };
}

describe('bipartite-matching', () => {
  it('ends with a maximum matching, valid at every step, one edge per flip', () => {
    fc.assert(
      fc.property(graphArb, fc.constantFrom('kuhn', 'hopcroft-karp'), (text, method) => {
        const { state, steps } = run(text, { ...bipartiteMatching.defaults, method } as BmSettings);
        let flips = 0;
        let phaseLengths = new Map<number, number>();
        let lastLength = 0;
        for (const st of steps) {
          const r = st.extra?.run as BmRun | undefined;
          if (!r) continue;
          // mate is symmetric, only along edges, and from L to R.
          let pairs = 0;
          for (const u of state.left) {
            const v = r.mate[u];
            if (!v) continue;
            pairs++;
            expect(r.mate[v]).toBe(u);
            expect(state.right).toContain(v);
            expect(
              state.graph.edges.some((e) => (e.u === u && e.v === v) || (e.u === v && e.v === u)),
            ).toBe(true);
          }
          expect(pairs).toBe(r.size);
          // Every flip adds exactly one edge; Hopcroft-Karp's paths share a length in a phase
          // and get longer from phase to phase.
          if (r.flipped.length > flips) {
            expect(r.flipped.length).toBe(flips + 1);
            expect(r.size).toBe(r.flipped.length);
            const p = r.flipped.at(-1)!;
            expect(p.length % 2).toBe(0);
            if (method === 'hopcroft-karp') {
              const known = phaseLengths.get(r.phase);
              if (known === undefined) {
                expect(p.length).toBeGreaterThan(lastLength);
                phaseLengths = new Map([[r.phase, p.length]]);
                lastLength = p.length;
              } else expect(p.length).toBe(known);
            }
            flips = r.flipped.length;
          }
        }
        const r = steps.at(-1)!.extra!.run as BmRun;
        expect(r.size).toBe(bruteMax(state));
      }),
      { numRuns: 300 },
    );
  });

  it('reads sides from names, or by two-colouring', () => {
    const a = parseBipartite('B-2, A-1, A-10') as BmState;
    expect([a.left, a.right]).toEqual([
      ['A', 'B'],
      ['1', '2', '10'],
    ]);
    const b = parseBipartite('A-B, B-C, C-D') as BmState;
    expect([b.left, b.right]).toEqual([
      ['A', 'C'],
      ['B', 'D'],
    ]);
    expect(parseBipartite('A-B, B-C, C-A')).toBeInstanceOf(Error);
    const c = parseBipartite('A>1, 1>A, B>1') as BmState;
    expect(c.graph.edges.length).toBe(2);
  });

  it('matches the starting graph as the concept page says', () => {
    const t = new Timeline(bipartiteMatching, bipartiteMatching.defaults, 1, [['run']]);
    const r = t.entries[0]!.steps.at(-1)!.extra!.run!;
    expect(r.size).toBe(4);
    expect(r.mate.E).toBeNull();
    expect(r.flipped.map((p) => p.length - 1)).toEqual([1, 3, 5, 3]);
  });

  it('keeps pseudocode lines short enough for a phone', () => {
    for (const method of ['kuhn', 'hopcroft-karp'] as const)
      for (const block of pseudocode({ ...bipartiteMatching.defaults, method }))
        for (const l of block.lines)
          expect(2 * l.indent + l.text.length, `${l.id}: ${l.text}`).toBeLessThanOrEqual(34);
  });
});
