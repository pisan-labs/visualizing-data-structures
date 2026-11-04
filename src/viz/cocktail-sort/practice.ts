import type { PracticeKind } from '../../engine/types';
import {
  counter,
  distinct,
  list,
  load,
  milestones,
  runOps,
  stepsOf,
  twinKind,
  valuesAt,
  type ArrayDef,
} from '../_sorting/practice';

/** Pairs that are out of order: what every swap of neighbors fixes, one at a time. */
function inversions(vs: number[]): number {
  let k = 0;
  for (let i = 0; i < vs.length; i++)
    for (let j = i + 1; j < vs.length; j++) if (vs[i]! > vs[j]!) k++;
  return k;
}

/** Practice questions for cocktail shaker sort. Every answer comes from running the model. */
export function cocktailPractice(def: () => ArrayDef): PracticeKind[] {
  return [
    {
      id: 'forward',
      title: 'After the first forward pass',
      make(rng) {
        const values = distinct(rng, rng.int(5, 7));
        const setup = [load(values)];
        const after = valuesAt(milestones(stepsOf(def(), {}, [...setup, ['sort']]))[0]!);
        return {
          prompt:
            'Cocktail shaker sort starts with a forward pass, left to right. Type A after it.',
          setup,
          answer: { kind: 'sequence', value: after },
          explain: `The forward pass swaps each out-of-order pair of neighbors on the way right, so the largest value, ${Math.max(...values)}, ends up at the end: ${list(after)}.`,
          watch: [['sort']],
        };
      },
    },
    {
      id: 'backward',
      title: 'After the way back',
      make(rng) {
        const values = distinct(rng, rng.int(5, 7));
        const setup = [load(values)];
        const ms = milestones(stepsOf(def(), {}, [...setup, ['sort']]));
        const forward = valuesAt(ms[0]!);
        const after = valuesAt(ms[1]!);
        return {
          prompt:
            'Cocktail shaker sort makes a forward pass, left to right, then a backward pass, right to left. Type A after the first backward pass.',
          setup,
          answer: { kind: 'sequence', value: after },
          explain: `The forward pass leaves ${list(forward)}. The backward pass carries the smallest value, ${Math.min(...values)}, to the front: ${list(after)}.`,
          watch: [['sort']],
        };
      },
    },
    {
      id: 'swaps',
      title: 'How many swaps in all?',
      make(rng) {
        const values = distinct(rng, rng.int(5, 7));
        const setup = [load(values)];
        const end = runOps(def(), {}, [...setup, ['sort']])
          .entries.at(-1)!
          .steps.at(-1)!;
        const swaps = counter(end, 'swaps');
        const pairs = inversions(values);
        return {
          prompt: 'How many swaps does cocktail shaker sort make to sort A?',
          setup,
          answer: { kind: 'number', value: swaps },
          explain: `Each swap of neighbors fixes exactly one pair of values that is out of order. A has ${pairs} such ${pairs === 1 ? 'pair' : 'pairs'}, so it takes ${swaps} ${swaps === 1 ? 'swap' : 'swaps'}, however the passes go.`,
          watch: [['sort']],
        };
      },
    },
    twinKind(def, {
      name: 'Cocktail shaker sort',
      why: (kept) =>
        kept
          ? 'It only swaps neighbors that are out of order, in either direction, so equal values never pass each other. It is stable.'
          : 'A swap moved one copy past the other.',
    }),
  ];
}
