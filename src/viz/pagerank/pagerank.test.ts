import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import type { Graph } from '../_graph/graph';
import { formatGraph, parseGraph } from '../_graph/parse';
import { pagerank } from '.';
import { MAX_ITER, ranking, TOLERANCE, type Dangling, type PrRun, type PrSettings } from './model';

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
    const items: string[] = [...names];
    for (const [a, b] of pairs) {
      const u = names[a % n]!;
      const v = names[b % n]!;
      const key = directed ? `${u}>${v}` : [u, v].sort().join('-');
      if (u === v || seen.has(key)) continue;
      seen.add(key);
      items.push(key);
    }
    return parseGraph(items.join(', ')) as Graph;
  });

/** A reference with a transition matrix, written independently of the page. */
function reference(g: Graph, d: number, dangling: Dangling, iterations: number): number[] {
  const n = g.vertices.length;
  const idx = new Map(g.vertices.map((v, i) => [v, i]));
  const out: number[][] = g.vertices.map(() => []);
  for (const e of g.edges) {
    out[idx.get(e.u)!]!.push(idx.get(e.v)!);
    if (!g.directed) out[idx.get(e.v)!]!.push(idx.get(e.u)!);
  }
  let p = new Array(n).fill(1 / n);
  for (let k = 0; k < iterations; k++) {
    const q = new Array(n).fill((1 - d) / n);
    for (let u = 0; u < n; u++) {
      if (out[u]!.length === 0) {
        if (dangling === 'spread') for (let v = 0; v < n; v++) q[v] += (d * p[u]) / n;
      } else for (const v of out[u]!) q[v] += (d * p[u]) / out[u]!.length;
    }
    p = q;
  }
  return p;
}

function runOf(g: Graph, settings: Partial<PrSettings>) {
  const t = new Timeline(pagerank, { ...pagerank.defaults, ...settings } as PrSettings, 1, [
    ['load', formatGraph(g)],
    ['run'],
  ]);
  const steps = t.entries.at(-1)!.steps;
  return { steps, r: steps.at(-1)!.extra!.run! as PrRun };
}

describe('pagerank', () => {
  it('matches a matrix power iteration, and keeps the bars on one scale', () => {
    fc.assert(
      fc.property(
        graphArb,
        fc.constantFrom('0.5', '0.7', '0.85', '0.95', '1'),
        fc.constantFrom<Dangling>('spread', 'drop'),
        (g, damping, dangling) => {
          const { steps, r } = runOf(g, { damping, dangling });
          const d = Number(damping);
          const ref = reference(g, d, dangling, r.iter);
          g.vertices.forEach((v, i) => expect(r.rank[v]).toBeCloseTo(ref[i]!, 9));
          expect(r.converged ? r.change! < TOLERANCE : r.iter === MAX_ITER).toBe(true);
          for (const st of steps) {
            const run = st.extra?.run;
            if (!run) continue;
            const total = Object.values(run.rank).reduce((a, b) => a + b, 0);
            // Between iterations the ranks add up to 1 (spread) or at most 1 (drop).
            if (!run.prev) {
              if (dangling === 'spread') expect(total).toBeCloseTo(1, 9);
              else expect(total).toBeLessThanOrEqual(1 + 1e-9);
            }
            for (const v of g.vertices) {
              expect(run.rank[v]!).toBeLessThanOrEqual(run.top + 1e-12);
              if (d < 1)
                expect(run.rank[v]!).toBeGreaterThanOrEqual((1 - d) / g.vertices.length - 1e-12);
            }
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it('gives a ring equal ranks at once, and fails to settle without the jump', () => {
    const ring = parseGraph('A>B, B>C, C>D, D>E, E>A') as Graph;
    expect(runOf(ring, {}).r.iter).toBe(1);
    const slosh = parseGraph('A>B, B>C, C>D, D>A, E>A') as Graph;
    const r = runOf(slosh, { damping: '1' }).r;
    expect(r.converged).toBeFalsy();
    expect(r.iter).toBe(MAX_ITER);
  });

  it('does not blame d = 1 when a run with d < 1 hits the limit', () => {
    const slow = parseGraph('A>B, B>C, C>B') as Graph;
    const { r, steps } = runOf(slow, { damping: '0.95' });
    expect(r.converged).toBeFalsy();
    const say = steps.at(-1)!.say;
    expect(say).not.toContain('With d = 1');
    expect(say).toContain('With d = 0.95 the random jump is rare');
  });

  it('breaks ties in name order even when the floats differ in the last bit', () => {
    const g = parseGraph('A>B, B>A') as Graph;
    expect(ranking(g, { A: 0.1 + 0.2, B: 0.3 })).toEqual(['A', 'B']);
    expect(ranking(g, { A: 0.3, B: 0.1 + 0.2 })).toEqual(['A', 'B']);
  });

  it('runs the trap out of iterations at d = 0.95, as Try this asks about', () => {
    const trap = parseGraph('A>B, B>C, C>A, C>D, D>E, E>F, F>E') as Graph;
    expect(runOf(trap, { damping: '0.5' }).r.converged).toBe(true);
    expect(runOf(trap, { damping: '0.95' }).r.converged).toBeFalsy();
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(pagerank, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(pagerank, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
