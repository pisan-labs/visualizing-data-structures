import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, Settings, VizDef } from '../../engine/types';
import { listWords } from '../_graph/graph';
import {
  defaults,
  pairKey,
  steinerIn,
  type StExtra,
  type StMethod,
  type StRun,
  type StSettings,
  type StState,
} from './model';
import { randomSteiner, setup } from './presets';

type Def = VizDef<StState, StSettings, StExtra>;

/**
 * Practice for Steiner trees. Every answer comes from running the model: distances, tree
 * weights and the optimum are read from its steps.
 */
export function stPractice(def: () => Def): PracticeKind[] {
  function setupRun(rng: Rng, method: StMethod, n: number) {
    for (;;) {
      const { graph, terminals } = randomSteiner(rng, n, 0.25);
      if (terminals.length < 3) terminals.push(graph.vertices.find((v) => !terminals.includes(v))!);
      const calls = setup(graph, terminals.sort());
      const settings: StSettings = { ...defaults, method };
      const t = new Timeline(def(), settings, 1, [...calls, ['run']]);
      const r = t.entries.at(-1)!.steps.at(-1)!.extra?.run as StRun | undefined;
      if (!r) continue;
      return { calls, r, settings: settings as Settings, watch: [['run']] as OpCall[] };
    }
  }
  const intro = 'The ringed vertices are the terminals.';

  return [
    {
      id: 'distance',
      title: 'A closure distance',
      make(rng) {
        const q = setupRun(rng, 'approx', rng.int(6, 7));
        const T = q.r.T;
        const i = rng.int(0, T.length - 2);
        const j = rng.int(i + 1, T.length - 1);
        const a = T[i]!;
        const b = T[j]!;
        const d = q.r.dist[pairKey(a, b)]!;
        return {
          prompt: `${intro} The approximation starts with the shortest distance between every two terminals. What is the distance from ${a} to ${b}?`,
          setup: q.calls,
          settings: q.settings,
          answer: { kind: 'number', value: d },
          explain: `The lightest path from ${a} to ${b} has length ${d}. It may pass through other vertices, terminals or not.`,
          watch: q.watch,
        };
      },
    },
    {
      id: 'approx',
      title: 'The approximate tree',
      make(rng) {
        const q = setupRun(rng, 'approx', rng.int(6, 7));
        const m = q.r.closure;
        return {
          prompt: `${intro} Run the metric-closure approximation: a minimum spanning tree over the terminal-to-terminal distances, each of its edges put back as its path, then a spanning tree of those edges with Steiner leaves cut off. How much does the tree weigh?`,
          setup: q.calls,
          settings: q.settings,
          answer: { kind: 'number', value: q.r.weight },
          explain: `The closure tree takes ${m.map((c) => `${c.a}-${c.b} (${c.w})`).join(', ')}, weight ${m.reduce((x, c) => x + c.w, 0)}. Its paths give the tree ${listWords(q.r.tree)}, weight ${q.r.weight}. The optimum is ${q.r.opt}.`,
          watch: q.watch,
        };
      },
    },
    {
      id: 'optimum',
      title: 'The lightest tree',
      make(rng) {
        const q = setupRun(rng, 'exact', rng.int(5, 6));
        const steiner = steinerIn(q.r.tree, q.r.T);
        return {
          prompt: `${intro} What is the weight of a minimum Steiner tree: the lightest tree that joins every terminal, using any other vertices it likes?`,
          setup: q.calls,
          settings: q.settings,
          answer: { kind: 'number', value: q.r.opt },
          explain: `${listWords(q.r.tree)} join the terminals with weight ${q.r.opt}${steiner.length ? `, through ${listWords(steiner)}` : ', with no Steiner vertex'}. Brute force tried all ${q.r.tried} sets of Steiner vertices to be sure.`,
          watch: q.watch,
        };
      },
    },
  ];
}
