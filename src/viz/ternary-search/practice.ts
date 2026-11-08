import type { PracticeKind } from '../../engine/types';
import { ascending } from '../_sorting/kit';
import { counter, distinct, load, ordered, stepsOf, type ArrayDef } from '../_sorting/practice';
import { unimodal } from './model';

/** Practice questions for ternary search. Every answer comes from running the model. */
export function ternaryPractice(def: () => ArrayDef): PracticeKind[] {
  return [
    {
      id: 'points',
      title: 'Where are the two points?',
      make(rng) {
        const vs = ascending(distinct(rng, rng.int(8, 16)));
        const x = vs[rng.int(0, vs.length - 1)]!;
        const setup = [load(vs)];
        const first = stepsOf(def(), {}, [...setup, ['search', x]]).find((s) =>
          s.lines.includes('mid'),
        )!;
        const m = [String(first.vars?.m1), String(first.vars?.m2)];
        const n = vs.length;
        return {
          prompt: `Ternary search runs \`search(${x})\` with lo = 0 and hi = ${n - 1}. Type m1 and m2 for the first round.`,
          setup,
          answer: { kind: 'sequence', value: m },
          explain: `third = floor((${n - 1} − 0) / 3) = ${Math.floor((n - 1) / 3)}, so m1 = 0 + ${Math.floor((n - 1) / 3)} = ${m[0]} and m2 = ${n - 1} − ${Math.floor((n - 1) / 3)} = ${m[1]}.`,
          watch: [['search', x]],
        };
      },
    },
    {
      id: 'rounds',
      title: 'How many rounds?',
      make(rng) {
        const vs = ascending(distinct(rng, rng.int(10, 20)));
        const x = rng.int(0, 2) ? vs[rng.int(0, vs.length - 1)]! : rng.int(1, 99);
        const setup = [load(vs)];
        const end = stepsOf(def(), {}, [...setup, ['search', x]]).at(-1)!;
        const rounds = counter(end, 'rounds');
        return {
          prompt: `How many rounds (pairs of points m1, m2) does ternary search look at in \`search(${x})\`?`,
          setup,
          answer: { kind: 'number', value: rounds },
          explain: `${rounds}. ${Number(end.vars?.result) >= 0 ? `It finds ${x} at index ${end.vars?.result}.` : `${x} is not there, so the window shrinks until it is empty.`} Each round keeps about a third of the window.`,
          watch: [['search', x]],
        };
      },
    },
    {
      id: 'drop',
      title: 'Which side goes?',
      make(rng) {
        const vs = unimodal(rng, rng.int(8, 14));
        const settings = { goal: 'max' };
        const setup = [load(vs)];
        const steps = stepsOf(def(), settings, [...setup, ['max']]);
        const look = steps.find((s) => s.lines.includes('mmid'));
        const after = steps.find((s) => s.lines.includes('mcmp'));
        const m1 = Number(look?.vars?.m1);
        const m2 = Number(look?.vars?.m2);
        const right = after?.lines.includes('mright');
        const options = [
          `A[0..${m1}], left of the peak`,
          `A[${m2}..${vs.length - 1}], right of the peak`,
        ];
        return {
          prompt: `Find max compares A[${m1}] = ${vs[m1]} with A[${m2}] = ${vs[m2]} in its first round. Which part of A does it drop?`,
          setup,
          settings,
          answer: ordered(options, right ? options[0]! : options[1]!),
          explain: right
            ? `${vs[m1]} < ${vs[m2]}: the values still climb from m1 to m2, so the peak is right of m1 and A[0..${m1}] goes.`
            : `${vs[m1]} > ${vs[m2]}: the values fall from m1 to m2, so the peak is left of m2 and A[${m2}..${vs.length - 1}] goes.`,
          watch: [['max']],
        };
      },
    },
    {
      id: 'versus',
      title: 'Ternary or binary?',
      make(rng) {
        const vs = ascending(distinct(rng, rng.int(12, 20)));
        const x = rng.int(0, 1) ? vs[rng.int(0, vs.length - 1)]! : rng.int(1, 99);
        const setup = [load(vs)];
        const end = stepsOf(def(), {}, [...setup, ['search', x]]).at(-1)!;
        const mine = counter(end, 'comparisons');
        const binary = counter(end, 'binary');
        const options = ['Ternary search', 'Binary search', 'They make the same number'];
        const right = mine < binary ? options[0]! : mine > binary ? options[1]! : options[2]!;
        return {
          prompt: `Which makes fewer comparisons with x to run \`search(${x})\` on this array?`,
          setup,
          answer: ordered(options, right),
          explain: `Ternary search makes ${mine} and binary search makes ${binary}. Ternary search needs fewer rounds, but up to four comparisons per round against binary search's two.`,
          watch: [['search', x]],
        };
      },
    },
  ];
}
