import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, Step, VizDef } from '../../engine/types';
import { andList } from '../_dp/kit';
import { defaults, tf, type SubsetExtra, type SubsetSettings, type SubsetState } from './model';

type Def = VizDef<SubsetState, SubsetSettings, SubsetExtra>;
type SubStep = Step<SubsetState, SubsetExtra>;

export function randomNumbers(rng: Rng, n: number, max = 9): number[] {
  return Array.from({ length: n }, () => rng.int(1, max));
}

const setupFor = (xs: number[], T: number): OpCall[] => [
  ['numbers', xs.join(' ')],
  ['target', T],
];

/**
 * Practice questions for subset sum. Answers come from running the model with seed 1, the way
 * the practice panel replays a question. `def` is a getter to avoid an import cycle.
 */
export function subsetPractice(def: () => Def): PracticeKind[] {
  const run = (ops: OpCall[]) => new Timeline(def(), { ...defaults }, 1, ops);
  const last = (ops: OpCall[]): SubStep => run(ops).entries.at(-1)!.steps.at(-1)!;
  /** Numbers and a target that some subset reaches. */
  const reachable = (rng: Rng, n: [number, number]) => {
    const xs = randomNumbers(rng, rng.int(n[0], n[1]));
    const pick = xs.filter(() => rng.int(0, 1) === 1);
    const sum = pick.reduce((a, b) => a + b, 0);
    const T = sum >= 1 && sum <= 14 ? sum : xs[0]!;
    return { xs, T };
  };

  return [
    {
      id: 'cell',
      title: 'Fill the next row',
      make(rng) {
        const xs = randomNumbers(rng, rng.int(3, 4));
        const T = rng.int(6, 12);
        const done = rng.int(1, xs.length - 1);
        const i = done + 1;
        const t = rng.int(1, T);
        const setup: OpCall[] = [
          ...setupFor(xs, T),
          ...Array.from({ length: done + 1 }, () => ['row'] as OpCall),
        ];
        const S = run([...setup, ['row']]).endState().S;
        const value = S[i]![t]!;
        const x = xs[i - 1]!;
        return {
          prompt: `Numbers ${andList(xs)}, target ${T}. Rows 0 to ${done} are filled. Is S[${i}][${t}] true or false?`,
          setup,
          answer: { kind: 'choice', options: ['T', 'F'], correct: value ? 0 : 1 },
          explain:
            x > t
              ? `x${i} = ${x} is more than ${t}, so S[${i}][${t}] = S[${done}][${t}] = ${tf(value)}.`
              : `S[${done}][${t}] = ${tf(S[done]![t]!)} (leave x${i} out) or S[${done}][${t - x}] = ${tf(S[done]![t - x]!)} (take it): ${tf(value)}.`,
          watch: [['row']],
        };
      },
    },
    {
      id: 'take',
      title: 'Is the number in?',
      make(rng) {
        const { xs, T } = reachable(rng, [3, 5]);
        const setup: OpCall[] = [...setupFor(xs, T), ['fill']];
        const end = last([...setup, ['trace']]);
        const path = end.extra!.path!;
        const k = rng.int(0, path.length - 2);
        const [i, t] = path[k]!;
        const S = end.state.S;
        const taken = !S[i - 1]![t];
        const yes = `Yes, x${i} = ${xs[i - 1]} is taken`;
        const no = `No, x${i} = ${xs[i - 1]} is left out`;
        return {
          prompt: `Numbers ${andList(xs)}, target ${T}. The table is filled, and the walk back has reached S[${i}][${t}] = T. Does it take x${i}?`,
          setup,
          answer: { kind: 'choice', options: [yes, no], correct: taken ? 0 : 1 },
          explain: taken
            ? `S[${i - 1}][${t}] = F: the first ${i - 1} numbers cannot make ${t} alone, so x${i} must be in.`
            : `S[${i - 1}][${t}] = T: the first ${i - 1} numbers already make ${t}, so the walk leaves x${i} out.`,
          watch: [['trace']],
        };
      },
    },
    {
      id: 'subset',
      title: 'Which numbers?',
      make(rng) {
        const { xs, T } = reachable(rng, [3, 5]);
        const setup: OpCall[] = [...setupFor(xs, T), ['fill']];
        const end = last([...setup, ['trace']]);
        const subset = String(end.vars?.subset ?? '')
          .split(' ')
          .filter(Boolean);
        return {
          prompt: `Numbers ${andList(xs)}, target ${T}. The table is filled. Walk back from S[${xs.length}][${T}], leaving a number out whenever the row above already reaches the sum. Type the numbers it takes, in their order in the list.`,
          setup,
          answer: { kind: 'sequence', value: subset },
          explain: `The walk takes ${andList(subset)}, which add up to ${T}.`,
          watch: [['trace']],
        };
      },
    },
    {
      id: 'cells',
      title: 'How big is the table?',
      make(rng) {
        const xs = randomNumbers(rng, rng.int(2, 6));
        const T = rng.int(3, 14);
        const setup = setupFor(xs, T);
        const end = last([...setup, ['fill']]);
        const cells = Number(end.vars?.cells);
        return {
          prompt: `Numbers ${andList(xs)}, target ${T}. How many cells does the table have, row 0 and column 0 included?`,
          setup,
          answer: { kind: 'number', value: cells },
          explain: `(n + 1)(T + 1) = ${xs.length + 1} × ${T + 1} = ${cells}. Double T and the table doubles, although T gets only one bit longer.`,
          watch: [['fill']],
        };
      },
    },
  ];
}
