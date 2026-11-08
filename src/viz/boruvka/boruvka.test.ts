import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { components, type Graph } from '../_graph/graph';
import { MST_TEXT } from '../_graph/mst';
import { formatGraph, parseGraph } from '../_graph/parse';
import { boruvka } from '.';
import { componentsOf, type BoruvkaRun } from './model';

// Kruskal with a label array, ties by position in the edge list: written independently.
function reference(g: Graph): { weight: number; tree: string[] } {
  const label = new Map(g.vertices.map((v) => [v, v]));
  const tree: string[] = [];
  let weight = 0;
  const order = g.edges.map((e, i) => ({ e, i })).sort((a, b) => a.e.w - b.e.w || a.i - b.i);
  for (const { e } of order) {
    const a = label.get(e.u)!;
    const b = label.get(e.v)!;
    if (a === b) continue;
    tree.push(`${e.u}-${e.v}`);
    weight += e.w;
    for (const [v, l] of label) if (l === a) label.set(v, b);
  }
  return { weight, tree };
}

const letters = 'ABCDEFGHIJ'.split('');
const graphArb = fc
  .record({
    n: fc.integer({ min: 1, max: 10 }),
    pairs: fc.array(fc.tuple(fc.nat(9), fc.nat(9), fc.integer({ min: -3, max: 6 })), {
      maxLength: 22,
    }),
  })
  .map(({ n, pairs }) => {
    const names = letters.slice(0, n);
    const seen = new Set<string>();
    const items: string[] = [...names];
    for (const [a, b, w] of pairs) {
      const u = names[a % n]!;
      const v = names[b % n]!;
      const key = [u, v].sort().join('-');
      if (u === v || seen.has(key)) continue;
      seen.add(key);
      items.push(`${key}:${w}`);
    }
    return parseGraph(items.join(', ')) as Graph;
  });

function runOf(g: Graph) {
  const t = new Timeline(boruvka, boruvka.defaults, 1, [['load', formatGraph(g)], ['run']]);
  const steps = t.entries.at(-1)!.steps;
  return { steps, r: steps.at(-1)!.extra!.run! as BoruvkaRun };
}

describe('boruvka', () => {
  it('builds the same forest as Kruskal with the same tie rule, in at most log2 V rounds', () => {
    fc.assert(
      fc.property(graphArb, (g) => {
        const { steps, r } = runOf(g);
        const ref = reference(g);
        expect([...r.T].sort()).toEqual([...ref.tree].sort());
        expect(r.weight).toBe(ref.weight);
        expect(r.T.length).toBe(g.vertices.length - components(g).length);
        expect(r.round).toBeLessThanOrEqual(Math.max(0, Math.floor(Math.log2(g.vertices.length))));
        for (const st of steps) {
          const run = st.extra?.run;
          if (!run) continue;
          // T is a forest, and the component labels are exactly its pieces.
          expect(new Set(Object.values(run.comp)).size).toBe(g.vertices.length - run.T.length);
          expect(run.comp).toEqual(componentsOf(g, run.T));
          // Every pick leaves its component (until this round's picks start merging them).
          if (st.lines.includes('cmp') || st.lines.includes('picks'))
            for (const [c, k] of Object.entries(run.pick)) {
              const [u, v] = k.split('-') as [string, string];
              expect([run.comp[u], run.comp[v]]).toContain(c);
            }
        }
      }),
      { numRuns: 300 },
    );
  });

  it('starts from the graph every MST page starts from', () => {
    const { r } = runOf(parseGraph(MST_TEXT) as Graph);
    expect(r.weight).toBe(19);
    expect(r.round).toBe(2);
  });

  it('refuses a directed graph', () => {
    const t = new Timeline(boruvka, boruvka.defaults, 1, [['load', 'A>B:1, B>C:2'], ['run']]);
    expect(t.entries[1]!.steps.at(-1)!.say).toContain('needs an undirected graph');
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(boruvka, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(boruvka, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
