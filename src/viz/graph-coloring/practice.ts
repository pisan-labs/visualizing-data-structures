import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { loadCall, randomGraph } from '../_graph/presets';
import {
  defaults,
  type ColoringExtra,
  type ColoringRun,
  type ColoringSettings,
  type ColoringState,
  type Order,
} from './model';

type Def = VizDef<ColoringState, ColoringSettings, ColoringExtra>;

const ORDER_NAME: Record<Order, string> = {
  given: 'name order',
  largest: 'largest degree first (Welsh-Powell)',
  dsatur: 'DSatur',
};

/**
 * Practice for greedy coloring. Every answer comes from running the model with the order the
 * question names: colors, counts and the order vertices are colored in.
 */
export function coloringPractice(def: () => Def): PracticeKind[] {
  function runWith(setup: OpCall[], order: Order): ColoringRun {
    const t = new Timeline(def(), { ...defaults, order }, 1, [...setup, ['run']]);
    return t.entries.at(-1)!.steps.at(-1)!.extra!.run!;
  }
  function graph(rng: Rng) {
    const g = randomGraph(rng, rng.int(6, 8), { density: rng.int(25, 45) / 100 });
    return { g, setup: [loadCall(g)] as OpCall[] };
  }
  const orders: Order[] = ['given', 'largest', 'dsatur'];

  return [
    {
      id: 'color-of',
      title: 'Which color does it get?',
      make(rng) {
        const { g, setup } = graph(rng);
        const r = runWith(setup, 'given');
        const v = g.vertices[rng.int(2, g.vertices.length - 1)]!;
        const before = r.plan.slice(0, r.plan.indexOf(v));
        return {
          prompt: `Color this graph greedily in name order (A first), colors numbered from 1. Which color does ${v} get?`,
          setup,
          settings: { ...defaults, order: 'given' },
          answer: { kind: 'number', value: r.color[v]! },
          explain: `Before ${v}: ${before.map((w) => `${w} = ${r.color[w]}`).join(', ')}. ${v} takes the smallest color none of its colored neighbours has: ${r.color[v]}.`,
          watch: [['run']],
        };
      },
    },
    {
      id: 'count',
      title: 'How many colors?',
      make(rng) {
        const { setup } = graph(rng);
        const order = orders[rng.int(0, 2)]!;
        const r = runWith(setup, order);
        return {
          prompt: `Color this graph greedily, ${ORDER_NAME[order]}. How many colors does it use?`,
          setup,
          settings: { ...defaults, order },
          answer: { kind: 'number', value: r.colors },
          explain: `The colors come out as ${r.plan.map((v) => `${v} = ${r.color[v]}`).join(', ')}: ${r.colors} in all.`,
          watch: [['run']],
        };
      },
    },
    {
      id: 'order',
      title: 'Which order?',
      make(rng) {
        const { setup } = graph(rng);
        const order: Order = rng.int(0, 1) ? 'largest' : 'dsatur';
        const r = runWith(setup, order);
        return {
          prompt: `Color this graph ${ORDER_NAME[order]}. Ties go to the larger degree, then name order. Type the vertices in the order they get colored, such as A C B.`,
          setup,
          settings: { ...defaults, order },
          answer: { kind: 'sequence', value: r.plan },
          explain:
            order === 'largest'
              ? `Sort by degree, largest first: ${r.plan.join(', ')}.`
              : `DSatur picks the vertex whose neighbours use the most colors each time: ${r.plan.join(', ')}.`,
          watch: [['run']],
        };
      },
    },
    {
      id: 'best-order',
      title: 'Does the order matter?',
      make(rng) {
        for (;;) {
          const { setup } = graph(rng);
          const a = runWith(setup, 'given').colors;
          const b = runWith(setup, 'largest').colors;
          if (a === b && rng.int(0, 2) > 0) continue;
          const options = [
            'Name order uses fewer',
            'Largest degree first uses fewer',
            'They use the same number',
          ];
          const correct = a < b ? 0 : b < a ? 1 : 2;
          return {
            prompt:
              'Color this graph greedily twice: once in name order, once largest degree first. Which uses fewer colors?',
            setup,
            settings: { ...defaults, order: 'largest' },
            answer: { kind: 'choice', options, correct },
            explain: `Name order uses ${a} colors and largest degree first uses ${b}. Neither order always wins.`,
            watch: [['run']],
          };
        }
      },
    },
  ];
}
