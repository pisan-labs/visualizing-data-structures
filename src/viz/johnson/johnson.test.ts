import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import type { Graph } from '../_graph/graph';
import { formatGraph, parseGraph } from '../_graph/parse';
import { johnson } from '.';
import type { JohnsonRun } from './model';

const letters = 'ABCDEFG'.split('');
const graphArb = fc
  .record({
    n: fc.integer({ min: 1, max: 7 }),
    directed: fc.boolean(),
    pairs: fc.array(fc.tuple(fc.nat(6), fc.nat(6), fc.integer({ min: -4, max: 9 })), {
      maxLength: 16,
    }),
  })
  .map(({ n, directed, pairs }) => {
    const names = letters.slice(0, n);
    const seen = new Set<string>();
    const items: string[] = [...names];
    for (const [a, b, w] of pairs) {
      const u = names[a % n]!;
      const v = names[b % n]!;
      const key = directed ? `${u}>${v}` : [u, v].sort().join('-');
      if (u === v || seen.has(key)) continue;
      seen.add(key);
      items.push(`${key}:${w}`);
    }
    return parseGraph(items.join(', ')) as Graph;
  });

/** Floyd-Warshall, written independently: distances, and whether some D[v][v] < 0. */
function floyd(g: Graph) {
  const V = g.vertices;
  const D = new Map<string, number>();
  const at = (a: string, b: string) => D.get(`${a} ${b}`) ?? Infinity;
  for (const v of V) D.set(`${v} ${v}`, 0);
  for (const e of g.edges) {
    D.set(`${e.u} ${e.v}`, Math.min(at(e.u, e.v), e.w));
    if (!g.directed) D.set(`${e.v} ${e.u}`, Math.min(at(e.v, e.u), e.w));
  }
  for (const k of V)
    for (const i of V)
      for (const j of V)
        if (at(i, k) + at(k, j) < at(i, j)) D.set(`${i} ${j}`, at(i, k) + at(k, j));
  return { at, negative: V.some((v) => at(v, v) < 0) };
}

function weight(g: Graph, u: string, v: string): number {
  return g.edges.find((e) => (e.u === u && e.v === v) || (!g.directed && e.u === v && e.v === u))!
    .w;
}

describe('johnson', () => {
  it('matches Floyd-Warshall, with nonnegative reweighted arcs', () => {
    fc.assert(
      fc.property(graphArb, (g) => {
        const t = new Timeline(johnson, johnson.defaults, 1, [['load', formatGraph(g)], ['run']]);
        const steps = t.entries.at(-1)!.steps;
        const r = steps.at(-1)!.extra!.run! as JohnsonRun;
        const f = floyd(g);
        expect(r.phase === 'negative').toBe(f.negative);
        if (f.negative) {
          // The cycle it names is a real negative cycle.
          const c = r.cycle!;
          let w = 0;
          for (let i = 0; i < c.length; i++) w += weight(g, c[i]!, c[(i + 1) % c.length]!);
          expect(w).toBeLessThan(0);
          return;
        }
        for (const s of g.vertices)
          for (const v of g.vertices) {
            const want = f.at(s, v);
            expect(r.D[s]![v]).toBe(want === Infinity ? null : want);
          }
        for (const e of g.edges) expect(r.w2[`${e.u}-${e.v}`]).toBeGreaterThanOrEqual(0);
        for (const v of g.vertices) expect(r.h[v]).toBeLessThanOrEqual(0);
        // h never goes up during Bellman-Ford.
        let last: Record<string, number | null> | undefined;
        for (const st of steps) {
          const run = st.extra?.run;
          if (!run) continue;
          if (last)
            for (const v of g.vertices)
              if (last[v] !== null) expect(run.h[v]!).toBeLessThanOrEqual(last[v]!);
          last = run.h;
        }
      }),
      { numRuns: 300 },
    );
  });
});

describe('number format', () => {
  it('prints negatives with a true minus sign in narration, practice and the drawing', () => {
    const g = 'A B C D; A>B:4, B>C:-3, C>D:2, A>D:5, D>B:-1';
    const t = new Timeline(johnson, johnson.defaults, 1, [['load', g], ['run']]);
    const steps = t.entries.at(-1)!.steps;
    const said = steps.map((s) => s.say).join(' ');
    expect(said).toMatch(/−\d/);
    expect(said).not.toMatch(/-\d/);
    const first = johnson.view(steps[0]!, johnson.defaults);
    const texts = first.shapes.flatMap((sh) => (sh.kind === 'text' ? [sh.text] : []));
    expect(texts).toContain('−3');
    expect(texts.some((x) => /-\d/.test(x))).toBe(false);
    const last = johnson.view(steps.at(-1)!, johnson.defaults);
    const lastTexts = last.shapes.flatMap((sh) => (sh.kind === 'text' ? [sh.text] : []));
    expect(lastTexts.some((x) => /-\d/.test(x))).toBe(false);
    expect(lastTexts.some((x) => /−\d/.test(x))).toBe(true);
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(johnson, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(johnson, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
