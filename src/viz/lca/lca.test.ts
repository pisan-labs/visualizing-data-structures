import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import type { Graph } from '../_graph/graph';
import { formatGraph, parseGraph } from '../_graph/parse';
import { lca } from '.';
import type { Above, LcaQuery, LcaSettings, Tree } from './model';

const letters = 'ABCDEFGHIJKLMNOP'.split('');

/** A random tree: vertex i hangs off a random earlier one; then a random pair and root. */
const caseArb = fc
  .record({
    n: fc.integer({ min: 1, max: 16 }),
    parents: fc.array(fc.nat(100), { minLength: 15, maxLength: 15 }),
    a: fc.nat(15),
    b: fc.nat(15),
    root: fc.nat(11),
    above: fc.constantFrom<Above>('nil', 'self'),
  })
  .map(({ n, parents, a, b, root, above }) => {
    const names = letters.slice(0, n);
    const items =
      names.length === 1
        ? ['A']
        : names.slice(1).map((v, i) => `${names[parents[i]! % (i + 1)]}-${v}`);
    return {
      g: parseGraph(items.join(', ')) as Graph,
      a: names[a % n]!,
      b: names[b % n]!,
      root: 'ABCDEFGHIJKL'[root]!,
      above,
    };
  });

/** Naive LCA, written independently: collect u's ancestors, walk up from v until one matches. */
function naive(g: Graph, root: string, a: string, b: string): string {
  const parent = new Map<string, string | null>([[root, null]]);
  const queue = [root];
  while (queue.length) {
    const u = queue.shift()!;
    for (const e of g.edges) {
      const w = e.u === u ? e.v : e.v === u ? e.u : null;
      if (w !== null && !parent.has(w)) {
        parent.set(w, u);
        queue.push(w);
      }
    }
  }
  const up = new Set<string>();
  for (let x: string | null = a; x !== null; x = parent.get(x)!) up.add(x);
  let y: string | null = b;
  while (!up.has(y!)) y = parent.get(y!)!;
  return y!;
}

describe('lca', () => {
  it('answers like a naive walk, from a correct table, in at most 2 log n jumps', () => {
    fc.assert(
      fc.property(caseArb, ({ g, a, b, root, above }) => {
        const settings = { ...lca.defaults, root, above } as LcaSettings;
        const t = new Timeline(lca, settings, 1, [
          ['load', formatGraph(g)],
          ['build'],
          ['query', a, b],
        ]);
        const r = g.vertices.includes(root) ? root : g.vertices[0]!;
        const tree: Tree = t.entries[1]!.steps.at(-1)!.extra!.tree!;
        // up[k][v] is 2^k steps above v.
        for (const v of g.vertices)
          for (let k = 0; k < tree.log; k++) {
            let x: string | null = v;
            for (let i = 0; i < 2 ** k && x !== null; i++)
              x = tree.up[0]![x] === x ? null : tree.up[0]![x]!;
            const want = x ?? (above === 'self' ? r : null);
            expect(tree.up[k]![v]).toBe(want);
          }
        expect(2 ** tree.log).toBeGreaterThanOrEqual(g.vertices.length);
        const steps = t.entries[2]!.steps;
        const q: LcaQuery = steps.at(-1)!.extra!.query!;
        expect(q.answer).toBe(naive(g, r, a, b));
        expect(q.jumps).toBeLessThanOrEqual(2 * tree.log);
        // u and v never pass the answer: every intermediate vertex is a descendant of it.
        for (const st of steps) {
          const x = st.extra?.query;
          if (!x) continue;
          expect(naive(g, r, x.u, q.answer!)).toBe(q.answer);
          expect(naive(g, r, x.v, q.answer!)).toBe(q.answer);
        }
      }),
      { numRuns: 400 },
    );
  });

  it('refuses a graph with a cycle', () => {
    const t = new Timeline(lca, lca.defaults, 1, [
      ['load', 'A-B, B-C, A-C'],
      ['query', 'A', 'B'],
    ]);
    expect(t.entries[1]!.steps.at(-1)!.say).toContain('has a cycle');
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(lca, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(lca, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
