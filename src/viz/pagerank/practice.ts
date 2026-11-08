import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { loadCall, randomGraph } from '../_graph/presets';
import {
  defaults,
  r3,
  ranking,
  TIE,
  type PrExtra,
  type PrRun,
  type PrSettings,
  type PrState,
} from './model';

type Def = VizDef<PrState, PrSettings, PrExtra>;

/**
 * Practice for PageRank. Every answer comes from running the model: the leader, the ranking,
 * the dangling pages and how the iteration count moves with d.
 */
export function pagerankPractice(def: () => Def): PracticeKind[] {
  function runWith(ops: OpCall[], settings: PrSettings): PrRun {
    const t = new Timeline(def(), settings, 1, [...ops, ['run']]);
    return t.entries.at(-1)!.steps.at(-1)!.extra!.run!;
  }
  function setup(rng: Rng) {
    for (;;) {
      const g = randomGraph(rng, rng.int(4, 6), { directed: true, density: rng.int(15, 30) / 100 });
      const ops: OpCall[] = [loadCall(g)];
      const r = runWith(ops, defaults);
      const order = ranking(g, r.rank);
      // Skip near ties at the top, so the answer is clear from the numbers.
      if (order.length > 1 && r.rank[order[0]!]! - r.rank[order[1]!]! < 0.005) continue;
      return { g, ops, r, order, watch: [['run']] as OpCall[] };
    }
  }
  const near = (diff: number) => diff > TIE && diff < 0.001;
  const all = (g: { vertices: string[] }, r: PrRun) =>
    g.vertices.map((v) => `${v} ${r3(r.rank[v]!)}`).join(', ');

  return [
    {
      id: 'leader',
      title: 'Who ranks highest?',
      make(rng) {
        const { g, ops, r, order, watch } = setup(rng);
        return {
          prompt: 'Run PageRank with d = 0.85. Which vertex ends up with the highest rank?',
          setup: ops,
          answer: {
            kind: 'choice',
            options: [...g.vertices],
            correct: g.vertices.indexOf(order[0]!),
          },
          explain: `The ranks settle at ${all(g, r)}. ${order[0]} collects the most rank from the vertices linking to it.`,
          watch,
        };
      },
    },
    {
      id: 'ranking',
      title: 'Put them in order',
      make(rng) {
        let { g, ops, r, order, watch } = setup(rng);
        // Skip ranks that differ by less than the 3 decimals shown, but are not a tie.
        while (order.some((v, i) => i > 0 && near(r.rank[order[i - 1]!]! - r.rank[v]!)))
          ({ g, ops, r, order, watch } = setup(rng));
        return {
          prompt:
            'Run PageRank with d = 0.85. Type the vertices from highest rank to lowest (ties in name order), such as C A B.',
          setup: ops,
          answer: { kind: 'sequence', value: order },
          explain: `The ranks settle at ${all(g, r)}.`,
          watch,
        };
      },
    },
    {
      id: 'dangling',
      title: 'How many dangling pages?',
      make(rng) {
        const { ops, r, watch } = setup(rng);
        return {
          prompt: 'How many vertices of this graph are dangling (have no links out)?',
          setup: ops,
          answer: { kind: 'number', value: r.dangling.length },
          explain: r.dangling.length
            ? `${r.dangling.join(', ')} ${r.dangling.length === 1 ? 'has' : 'have'} no arrows out. Their rank is spread over every vertex each iteration.`
            : 'Every vertex links somewhere, so none is dangling.',
          watch,
        };
      },
    },
    {
      id: 'damping',
      title: 'More or fewer iterations?',
      make(rng) {
        for (;;) {
          const { ops } = setup(rng);
          const a = runWith(ops, { ...defaults, damping: '0.5' });
          const b = runWith(ops, { ...defaults, damping: '0.95' });
          if (a.iter === b.iter) continue;
          const options = ['More with d = 0.95', 'More with d = 0.5'];
          return {
            prompt:
              'Run PageRank on this graph twice, with d = 0.5 and with d = 0.95. Which takes more iterations to settle?',
            setup: ops,
            settings: { ...defaults, damping: '0.95' },
            answer: { kind: 'choice', options, correct: b.iter > a.iter ? 0 : 1 },
            explain: `d = 0.5 settles in ${a.iter} iterations and d = 0.95 in ${b.iter}. The error shrinks by about a factor d each time, so a d close to 1 is slow.`,
            watch: [['run']],
          };
        }
      },
    },
  ];
}
