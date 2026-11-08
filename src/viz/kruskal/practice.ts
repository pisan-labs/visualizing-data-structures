import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { keyOf } from '../_graph/graph';
import { loadCall } from '../_graph/presets';
import { fewWeights, randomMst } from '../_graph/mst';
import { defaults, type KruskalExtra, type KruskalSettings, type KruskalState } from './model';

type Def = VizDef<KruskalState, KruskalSettings, KruskalExtra>;

/**
 * Practice for Kruskal. Every answer comes from running the model: which edges join, which are
 * rejected, and the weight are read from its last step.
 */
export function kruskalPractice(def: () => Def): PracticeKind[] {
  function setupRun(rng: Rng, ties = false) {
    const n = rng.int(6, 8);
    const g = ties ? fewWeights(rng, n) : randomMst(rng, n, 0.3);
    const setup: OpCall[] = [loadCall(g)];
    const t = new Timeline(def(), defaults, 1, [...setup, ['run']]);
    const r = t.entries.at(-1)!.steps.at(-1)!.extra!.run!;
    return { g, setup, r, watch: [['run']] as OpCall[] };
  }
  const intro = 'Run Kruskal on this graph. Equal weights go in name order (A-D before B-C).';

  return [
    {
      id: 'accept',
      title: 'Tree edge or cycle?',
      make(rng) {
        for (;;) {
          const { setup, r, watch } = setupRun(rng, rng.int(0, 1) === 1);
          const rejected = r.sorted.filter((e) => r.status[keyOf(e)] === 'cycle');
          if (rejected.length === 0) continue;
          // Ask about a rejected edge half the time, and a tree edge after the first two otherwise.
          const pool = rng.int(0, 1)
            ? rejected
            : r.sorted.filter((e, i) => i >= 2 && r.status[keyOf(e)] === 'tree');
          if (pool.length === 0) continue;
          const e = pool[rng.int(0, pool.length - 1)]!;
          const inTree = r.status[keyOf(e)] === 'tree';
          const options = ['It joins the tree', 'It is rejected: it would close a cycle'];
          const before = r.sorted.slice(0, r.sorted.indexOf(e));
          const joined = before.filter((x) => r.status[keyOf(x)] === 'tree').map(keyOf);
          return {
            prompt: `${intro} When Kruskal reaches ${e.u}-${e.v} (weight ${e.w}), what happens to it?`,
            setup,
            answer: { kind: 'choice', options, correct: inTree ? 0 : 1 },
            explain: `Before ${e.u}-${e.v}, the tree has ${joined.length ? joined.join(', ') : 'no edges'}. ${
              inTree
                ? `None of them connects ${e.u} to ${e.v}, so their roots differ and ${e.u}-${e.v} joins.`
                : `Those already connect ${e.u} to ${e.v}, so FIND-SET gives the same root for both and ${e.u}-${e.v} would close a cycle.`
            }`,
            watch,
          };
        }
      },
    },
    {
      id: 'weight',
      title: 'How heavy is the tree?',
      make(rng) {
        const { setup, r, watch } = setupRun(rng);
        return {
          prompt: 'What is the total weight of a minimum spanning tree of this graph?',
          setup,
          answer: { kind: 'number', value: r.weight },
          explain: `Kruskal keeps ${r.A.join(', ')}. Together they weigh ${r.weight}.`,
          watch,
        };
      },
    },
    {
      id: 'order',
      title: 'Which edges, in what order?',
      make(rng) {
        const { setup, r, watch } = setupRun(rng, rng.int(0, 1) === 1);
        return {
          prompt: `${intro} Type the tree edges in the order Kruskal adds them, such as A-B C-D.`,
          setup,
          answer: { kind: 'sequence', value: r.A },
          explain: `Lightest first, skipping any edge whose ends are joined already: ${r.A.join(', ')}.`,
          watch,
        };
      },
    },
    {
      id: 'rejected',
      title: 'How many are rejected?',
      make(rng) {
        const { g, setup, r, watch } = setupRun(rng);
        return {
          prompt: `This graph has ${g.vertices.length} vertices and ${g.edges.length} edges, and it is connected. How many edges does Kruskal reject?`,
          setup,
          answer: { kind: 'number', value: r.rejected },
          explain: `A spanning tree of ${g.vertices.length} vertices has ${g.vertices.length - 1} edges, so the other ${g.edges.length} − ${g.vertices.length - 1} = ${r.rejected} edges each close a cycle.`,
          watch,
        };
      },
    },
  ];
}
