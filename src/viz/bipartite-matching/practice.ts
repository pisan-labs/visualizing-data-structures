import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, Settings, VizDef } from '../../engine/types';
import { shuffle } from '../_graph/presets';
import { chainBipartite, loadCall, randomBipartite } from './graphs';
import {
  defaults,
  pathWords,
  type BmExtra,
  type BmRun,
  type BmSettings,
  type BmState,
} from './model';

type Def = VizDef<BmState, BmSettings, BmExtra>;

/**
 * Practice for bipartite matching. Every answer comes from running the model: the size, a
 * vertex's partner, the first long augmenting path and the number of phases.
 */
export function matchingPractice(def: () => Def): PracticeKind[] {
  const runOn = (setup: OpCall[], settings: Settings = defaults) => {
    const t = new Timeline(def(), settings as BmSettings, 1, [...setup, ['run']]);
    const steps = t.entries.at(-1)!.steps;
    return { state: t.endState(), steps, r: steps.at(-1)!.extra!.run! as BmRun };
  };
  const watch: OpCall[] = [['run']];

  return [
    {
      id: 'size',
      title: 'How many pairs?',
      make(rng) {
        const setup = [loadCall(randomBipartite(rng, rng.int(8, 10), 0.3))];
        const { state, r } = runOn(setup);
        const free = state.left.filter((u) => !r.mate[u]);
        return {
          prompt: 'How many edges does a maximum matching of this graph have?',
          setup,
          answer: { kind: 'number', value: r.size },
          explain: `A maximum matching has ${r.size} ${r.size === 1 ? 'edge' : 'edges'}. ${free.length ? `Some left vertex has to stay free (Kuhn's algorithm leaves ${free.join(', ')}): no augmenting path is left to match ${free.length === 1 ? 'it' : 'them'}.` : 'Every left vertex is matched.'}`,
          watch,
        };
      },
    },
    {
      id: 'partner',
      title: 'Who ends up with whom?',
      make(rng) {
        for (;;) {
          const setup = [loadCall(randomBipartite(rng, rng.int(8, 10), 0.35))];
          const { state, r } = runOn(setup);
          // Ask about a vertex that was matched and then moved, when there is one.
          const moved = state.left.filter((u) =>
            r.flipped.some((p, i) => i > 0 && p.indexOf(u) > 0),
          );
          const pool = moved.length ? moved : state.left;
          const u = pool[rng.int(0, pool.length - 1)]!;
          const right = r.mate[u] ?? 'nobody';
          const options = shuffle(rng, [...state.right, 'nobody']).filter(
            (x, i, all) => all.indexOf(x) === i,
          );
          if (options.length < 2) continue;
          return {
            prompt: `Run Kuhn's algorithm: left vertices in name order, neighbours in name order. Whom is ${u} matched with at the end?`,
            setup,
            answer: { kind: 'choice', options, correct: options.indexOf(right) },
            explain:
              right === 'nobody'
                ? `${u} stays free: when its turn comes, no augmenting path starts from it, and later paths never pass through a free left vertex.`
                : `${u} ends with ${right}. ${moved.includes(u) ? `It was matched earlier and then moved by an augmenting path: ${pathWords(r.flipped.find((p, i) => i > 0 && p.indexOf(u) > 0)!)}.` : 'It keeps the partner it first got.'}`,
            watch,
          };
        }
      },
    },
    {
      id: 'path',
      title: 'Which augmenting path?',
      make(rng) {
        for (;;) {
          const setup = [loadCall(randomBipartite(rng, rng.int(8, 10), 0.35))];
          const { r } = runOn(setup);
          const long = r.flipped.find((p) => p.length > 2);
          if (!long) continue;
          return {
            prompt: `Run Kuhn's algorithm, left vertices in name order and neighbours in name order. ${long[0]} is the first vertex that needs a longer augmenting path. Type it, starting from ${long[0]}.`,
            setup,
            answer: { kind: 'sequence', value: long },
            explain: `The path is ${pathWords(long)}: – is an edge not in the matching and = one in it. It starts at the free vertex ${long[0]} and ends at the free vertex ${long.at(-1)}, so flipping it adds one edge.`,
            watch,
          };
        }
      },
    },
    {
      id: 'phases',
      title: 'How many phases?',
      make(rng) {
        const settings: Settings = { ...defaults, method: 'hopcroft-karp' };
        const text =
          rng.int(0, 3) === 0
            ? chainBipartite(rng.int(6, 10))
            : randomBipartite(rng, rng.int(8, 10), 0.3);
        const setup = [loadCall(text)];
        const { r } = runOn(setup, settings);
        return {
          prompt:
            'Run Hopcroft-Karp on this graph. How many phases find at least one augmenting path?',
          setup,
          settings,
          answer: { kind: 'number', value: r.phase },
          explain: `It takes ${r.phase} ${r.phase === 1 ? 'phase' : 'phases'}. The paths flipped have ${r.flipped.map((p) => p.length - 1).join(', ')} edges: every path in a phase has the same length, and each phase's paths are longer than the last.`,
          watch,
        };
      },
    },
  ];
}
