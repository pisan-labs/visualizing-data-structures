import type { PracticeKind } from '../../engine/types';
import {
  distinct,
  list,
  load,
  milestones,
  stepsOf,
  valuesAt,
  type ArrayDef,
} from '../_sorting/practice';

/** Practice questions for the bitonic network. Every answer comes from running the model. */
export function bitonicPractice(def: () => ArrayDef): PracticeKind[] {
  return [
    {
      id: 'depth',
      title: 'How many columns?',
      make(rng) {
        const n = [4, 8, 16][rng.int(0, 2)]!;
        const setup = [load(distinct(rng, n))];
        const end = stepsOf(def(), {}, [...setup, ['sort']]).at(-1)!;
        const depth = Number(end.vars?.depth);
        const k = Math.log2(n);
        return {
          prompt: `A bitonic network sorts ${n} values. How many columns (parallel steps) does it have?`,
          setup,
          answer: { kind: 'number', value: depth },
          explain: `log₂ ${n} = ${k} stages, and stage s has s columns: ${Array.from({ length: k }, (_, i) => i + 1).join(' + ')} = ${depth}.`,
          watch: [['sort']],
        };
      },
    },
    {
      id: 'comparators',
      title: 'How many comparators?',
      make(rng) {
        const n = [4, 8, 16][rng.int(0, 2)]!;
        const setup = [load(distinct(rng, n))];
        const end = stepsOf(def(), {}, [...setup, ['sort']]).at(-1)!;
        const total = Number(end.vars?.total);
        return {
          prompt: `How many comparators does a bitonic network for ${n} values have?`,
          setup,
          answer: { kind: 'number', value: total },
          explain: `Every column has n/2 = ${n / 2} comparators, and there are ${end.vars?.depth} columns: ${total}. The input does not matter.`,
          watch: [['sort']],
        };
      },
    },
    {
      id: 'stage-one',
      title: 'After the first stage',
      make(rng) {
        const network = rng.int(0, 1) ? 'flip' : 'alternating';
        const settings = { network };
        const values = distinct(rng, 8);
        const setup = [load(values)];
        const after = valuesAt(milestones(stepsOf(def(), settings, [...setup, ['sort']]))[0]!);
        return {
          prompt:
            network === 'flip'
              ? 'Stage 1 compares each pair of neighbors (wires 0-1, 2-3, ...) and puts the smaller value on the upper wire. Type A after it.'
              : 'Stage 1 compares each pair of neighbors, sorting pairs up and down in turn: wires 0-1 ascending, 2-3 descending, and so on. Type A after it.',
          setup,
          settings,
          answer: { kind: 'sequence', value: after },
          explain: `Each pair is sorted ${network === 'flip' ? 'smaller first' : 'up, down, up, down'}: ${list(after)}.`,
          watch: [['sort']],
        };
      },
    },
    {
      id: 'mirror',
      title: 'Who meets whom?',
      make(rng) {
        const n = [8, 16][rng.int(0, 1)]!;
        const i = rng.int(0, n / 2 - 1);
        const setup = [load(distinct(rng, n))];
        const steps = stepsOf(def(), {}, [...setup, ['sort']]);
        const stages = Math.log2(n);
        const first = steps.find(
          (s) =>
            s.vars?.stage === stages &&
            s.vars?.phase === 1 &&
            /wires (\d+) and (\d+)/.test(s.say) &&
            Number(/wires (\d+) and/.exec(s.say)![1]) === i,
        )!;
        const partner = Number(/wires \d+ and (\d+)/.exec(first.say)![1]);
        return {
          prompt: `In the last stage of the network for ${n} values, the first column is a flip over the whole array. Which wire does wire ${i} meet there?`,
          setup,
          answer: { kind: 'number', value: partner },
          explain: `A flip pairs each wire with its mirror: ${i} with ${n} − 1 − ${i} = ${partner}.`,
          watch: [['sort']],
        };
      },
    },
  ];
}
