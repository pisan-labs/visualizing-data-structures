import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, Settings, VizDef } from '../../engine/types';
import type { Graph } from '../_graph/graph';
import { loadCall, randomGraph, shuffle } from '../_graph/presets';
import {
  covers,
  setText,
  defaults,
  type VcExtra,
  type VcMethod,
  type VcRun,
  type VcSettings,
  type VcState,
} from './model';

type Def = VizDef<VcState, VcSettings, VcExtra>;

/**
 * Practice for vertex cover. Every answer comes from running the model: covers, their order
 * and the optimum are read from its last step.
 */
export function vcPractice(def: () => Def): PracticeKind[] {
  function setupRun(rng: Rng, method: VcMethod, n: number, density = 0.3) {
    let g: Graph;
    do g = randomGraph(rng, n, { density });
    while (g.edges.length < 3);
    const setup: OpCall[] = [loadCall(g)];
    const settings: VcSettings = { ...defaults, method };
    const t = new Timeline(def(), settings, 1, [...setup, ['run']]);
    const r = t.entries.at(-1)!.steps.at(-1)!.extra!.run! as VcRun;
    return { g, setup, r, settings: settings as Settings, watch: [['run']] as OpCall[] };
  }

  return [
    {
      id: 'matching',
      title: 'The matching method',
      make(rng) {
        const q = setupRun(rng, 'matching', rng.int(6, 8));
        return {
          prompt: `Run APPROX-VERTEX-COVER: go through the edges in the order they are listed (by first end, then second end, in name order), and whenever an edge has neither end in C, put both ends in C. Type the vertices of C in the order they join.`,
          setup: q.setup,
          settings: q.settings,
          answer: { kind: 'sequence', value: q.r.C },
          explain: `The edges taken are ${q.r.M.join(', ')}: they share no vertex. Their ends give C = ${setText(q.r.C)}, ${q.r.C.length} vertices. A minimum cover has ${q.r.opt}.`,
          watch: q.watch,
        };
      },
    },
    {
      id: 'greedy',
      title: 'Greedy by degree',
      make(rng) {
        const q = setupRun(rng, 'greedy', rng.int(6, 8));
        return {
          prompt: `Run greedy: take the vertex with the most uncovered edges (ties to the name that comes first), cross off its edges, and repeat until every edge is covered. Type the vertices in the order greedy takes them.`,
          setup: q.setup,
          settings: q.settings,
          answer: { kind: 'sequence', value: q.r.C },
          explain: `Greedy takes ${q.r.C.join(', ')}: ${q.r.C.length} vertices. A minimum cover has ${q.r.opt}, such as ${setText(q.r.optCover)}.`,
          watch: q.watch,
        };
      },
    },
    {
      id: 'optimum',
      title: 'The smallest cover',
      make(rng) {
        const q = setupRun(rng, 'branch', rng.int(5, 7), 0.35);
        return {
          prompt: `What is the size of a minimum vertex cover of this graph: the fewest vertices that touch every edge?`,
          setup: q.setup,
          settings: q.settings,
          answer: { kind: 'number', value: q.r.opt },
          explain: `${setText(q.r.optCover)} touches every edge, and no set of ${q.r.opt - 1} does. Branching on an uncovered edge finds it after ${q.r.tried} branches.`,
          watch: q.watch,
        };
      },
    },
    {
      id: 'is-cover',
      title: 'Which set is a cover?',
      make(rng) {
        for (;;) {
          const q = setupRun(rng, 'brute', rng.int(6, 7), 0.3);
          const k = q.r.opt;
          const right = q.r.optCover;
          const wrong = new Set<string>();
          for (let tries = 0; tries < 200 && wrong.size < 3; tries++) {
            const c = shuffle(rng, q.g.vertices).slice(0, k).sort();
            if (!covers(q.g, c)) wrong.add(setText(c));
          }
          if (wrong.size < 2) continue;
          const options = shuffle(rng, [setText(right), ...wrong]);
          return {
            prompt: `Exactly one of these sets of ${k} vertices is a vertex cover: it touches every edge. Which one?`,
            setup: q.setup,
            settings: q.settings,
            answer: { kind: 'choice', options, correct: options.indexOf(setText(right)) },
            explain: `${setText(right)} has an end of every edge. Each of the others misses an edge with neither end in the set. ${k} is also the smallest a cover can be here.`,
            watch: q.watch,
          };
        }
      },
    },
  ];
}
