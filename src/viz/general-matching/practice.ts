import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { listWords, plural, type Graph } from '../_graph/graph';
import { loadCall, randomGraph } from '../_graph/presets';
import {
  defaults,
  matchingSize,
  pairsText,
  simple,
  type BlExtra,
  type BlRun,
  type BlSettings,
  type BlState,
} from './model';

type Def = VizDef<BlState, BlSettings, BlExtra>;

/**
 * Practice for the blossom algorithm. Every answer comes from running the model: the matching,
 * the free vertices and the blossom count are read from the run's last step.
 */
export function blossomPractice(def: () => Def): PracticeKind[] {
  function setupRun(rng: Rng, want?: (r: BlRun, g: Graph) => boolean) {
    for (let k = 0; ; k++) {
      const g = simple(randomGraph(rng, rng.int(5, 7), { density: 0.25 }));
      const setup = [loadCall(g)];
      const watch: OpCall[] = [['run']];
      const t = new Timeline(def(), defaults, 1, [...setup, ...watch]);
      const r: BlRun = t.entries.at(-1)!.steps.at(-1)!.extra!.run!;
      if (!want || want(r, g) || k > 40) return { g, setup, watch, r };
    }
  }

  return [
    {
      id: 'size',
      title: 'How big is a maximum matching?',
      make(rng) {
        const { g, setup, watch, r } = setupRun(rng);
        const k = matchingSize(g, r.mate);
        return {
          prompt:
            'A matching is a set of edges with no vertex in common. How many edges does a maximum matching of this graph have?',
          setup,
          answer: { kind: 'number', value: k },
          explain: `${plural(k, 'edge')}, for example ${pairsText(g, r.mate)}. No augmenting path is left, and by Berge's theorem that means no bigger matching exists.`,
          watch,
        };
      },
    },
    {
      id: 'perfect',
      title: 'Is there a perfect matching?',
      make(rng) {
        const { g, setup, watch, r } = setupRun(rng);
        const free = g.vertices.filter((v) => !r.mate[v]);
        const options = ['Yes, every vertex can be matched', 'No, some vertex stays free'];
        return {
          prompt: 'Can every vertex of this graph be matched at once (a perfect matching)?',
          setup,
          answer: { kind: 'choice', options, correct: free.length === 0 ? 0 : 1 },
          explain:
            free.length === 0
              ? `Yes: ${pairsText(g, r.mate)} covers all ${g.vertices.length} vertices.`
              : `No. A maximum matching has ${plural(matchingSize(g, r.mate), 'edge')} and leaves ${plural(free.length, 'vertex', 'vertices')} free${g.vertices.length % 2 ? ': with an odd number of vertices, one is always left over' : ''}.`,
          watch,
        };
      },
    },
    {
      id: 'free',
      title: 'Which vertices stay free?',
      make(rng) {
        const { g, setup, watch, r } = setupRun(rng, (r, g) => g.vertices.some((v) => !r.mate[v]));
        const free = g.vertices.filter((v) => !r.mate[v]);
        return {
          prompt:
            'Run the blossom algorithm (queue and neighbours in name order). Which vertices are free at the end? Type them in name order, or leave it blank if none are.',
          setup,
          answer: { kind: 'sequence', value: free },
          explain: free.length
            ? `The matching is ${pairsText(g, r.mate) || 'empty'}, so ${listWords(free)} ${free.length === 1 ? 'is' : 'are'} free. Another maximum matching could leave different vertices free, but never more of them.`
            : `The matching ${pairsText(g, r.mate)} is perfect.`,
          watch,
        };
      },
    },
    {
      id: 'blossoms',
      title: 'How many blossoms?',
      make(rng) {
        const { setup, watch, r } = setupRun(rng, (r) => r.blossoms > 0 || rng.int(0, 3) === 0);
        return {
          prompt:
            'Run the blossom algorithm with the queue and every neighbour list in name order. How many blossoms does it contract in all?',
          setup,
          answer: { kind: 'number', value: r.blossoms },
          explain:
            r.blossoms === 0
              ? 'None: no edge ever joins two even vertices of the same tree, so the search never meets an odd cycle it has to shrink.'
              : `${plural(r.blossoms, 'blossom')}. ${r.blossoms === 1 ? 'It starts' : 'Each one starts'} at an edge between two even vertices of the same tree: that edge closes an odd cycle, and the cycle is the blossom.`,
          watch,
        };
      },
    },
  ];
}
