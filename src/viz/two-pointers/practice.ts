import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { ascending, distinctValues, load, randomValues } from '../_sorting/kit';
import type { ArrayState } from '../_sorting/kit';
import { defaults, type TwoExtra, type TwoSettings } from './model';

type Def = VizDef<ArrayState, TwoSettings, TwoExtra>;

/** n sorted distinct values from 1 to 60, so sums stay small. */
function sortedSmall(rng: Rng, n: number): number[] {
  return ascending(distinctValues(rng, 60).slice(0, n));
}

/** A target: a real pair's sum, or (now and then) a sum no pair makes. */
function targetFor(rng: Rng, vs: number[]): number {
  if (rng.int(0, 3) > 0) {
    const i = rng.int(0, vs.length - 2);
    const j = rng.int(i + 1, vs.length - 1);
    return vs[i]! + vs[j]!;
  }
  const sums = new Set<number>();
  vs.forEach((x, i) => vs.slice(i + 1).forEach((y) => sums.add(x + y)));
  for (let t = vs[0]! + vs[1]!; t < 198; t++) if (!sums.has(t)) return t;
  return vs[0]! + vs[1]!;
}

/**
 * Practice questions for two pointers. Every answer comes from running the model. `def` is a
 * getter to avoid an import cycle.
 */
export function twoPractice(def: () => Def): PracticeKind[] {
  const run = (ops: OpCall[]) => new Timeline(def(), defaults, 1, ops);
  const lastVars = (t: Timeline<ArrayState, TwoSettings, TwoExtra>) =>
    t.entries.at(-1)!.steps.at(-1)!.vars ?? {};

  return [
    {
      id: 'first-move',
      title: 'Which pointer moves?',
      make(rng) {
        const vs = sortedSmall(rng, rng.int(6, 9));
        const target = targetFor(rng, vs);
        const t = run([load(vs), ['pairSum', target]]);
        const steps = t.entries[1]!.steps;
        // The step after the first sum: a move (lo or hi) or the answer.
        const k = steps.findIndex((s) => s.lines.includes('sum'));
        const next = steps[k + 1]!;
        const moved = next.lines.includes('right') ? 0 : next.lines.includes('left') ? 1 : 2;
        const options = ['lo moves right', 'hi moves left', 'Neither: the pair is found'];
        const sum = vs[0]! + vs[vs.length - 1]!;
        return {
          prompt: `A is sorted. Run \`pairSum(${target})\`. The first check adds A[0] and A[${vs.length - 1}]. What happens next?`,
          setup: [load(vs)],
          answer: { kind: 'choice', options, correct: moved },
          explain:
            moved === 2
              ? `A[0] + A[${vs.length - 1}] = ${sum}, the target itself.`
              : moved === 0
                ? `A[0] + A[${vs.length - 1}] = ${sum} < ${target}. A[0] is too small even with the biggest value, so lo moves right.`
                : `A[0] + A[${vs.length - 1}] = ${sum} > ${target}. A[${vs.length - 1}] is too big even with the smallest value, so hi moves left.`,
          watch: [['pairSum', target]],
        };
      },
    },
    {
      id: 'checks',
      title: 'How many pairs are checked?',
      make(rng) {
        const vs = sortedSmall(rng, rng.int(6, 10));
        const target = targetFor(rng, vs);
        const t = run([load(vs), ['pairSum', target]]);
        const v = lastVars(t);
        const checks = Number(v['pairs checked']);
        const n = vs.length;
        return {
          prompt: `A is sorted. How many pairs does \`pairSum(${target})\` add up before it stops? Count the sum A[lo] + A[hi] each time it is computed.`,
          setup: [load(vs)],
          answer: { kind: 'number', value: checks },
          explain: `${v.result === 'none' ? 'No pair adds up to the target, so the pointers walk until they meet' : `It finds A[${String(v.result).replace(', ', '] + A[')}] = ${target}`}: ${checks} ${checks === 1 ? 'check' : 'checks'}. Trying every pair could take ${(n * (n - 1)) / 2}.`,
          watch: [['pairSum', target]],
        };
      },
    },
    {
      id: 'dedupe',
      title: 'How many values are kept?',
      make(rng) {
        const n = rng.int(7, 11);
        const vs = ascending(randomValues(rng, n, 1, rng.int(6, 12)));
        const t = run([load(vs), ['dedupe']]);
        const k = Number(lastVars(t).result);
        const kept = t.endState().a.map((x) => x.value);
        return {
          prompt: `A is sorted. \`removeDuplicates(A)\` moves slow and fast pointers and returns k. Type the values in A[0..k − 1] afterwards, in order.`,
          setup: [load(vs)],
          answer: { kind: 'sequence', value: kept.map(String) },
          explain: `Each value is kept once, in sorted order: ${kept.join(', ')}, so k = ${k}.`,
          watch: [['dedupe']],
        };
      },
    },
    {
      id: 'water',
      title: 'The most water',
      make(rng) {
        const vs = randomValues(rng, rng.int(6, 9), 1, 20);
        const t = run([load(vs), ['water']]);
        const best = Number(lastVars(t).result);
        return {
          prompt: `Each value is the height of a wall, one unit apart. Two walls A[i] and A[j] hold min(A[i], A[j]) × (j − i). What is the most water any two walls hold?`,
          setup: [load(vs)],
          answer: { kind: 'number', value: best },
          explain: `Moving the shorter wall in each time, the two pointers find ${best}, after ${vs.length - 1} pairs instead of all ${(vs.length * (vs.length - 1)) / 2}.`,
          watch: [['water']],
        };
      },
    },
  ];
}
