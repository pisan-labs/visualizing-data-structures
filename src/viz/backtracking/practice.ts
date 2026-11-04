import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, Step, VizDef } from '../../engine/types';
import { choice, ordinal, plural, shuffle } from '../_recursion/kit';
import { defaults, seqText, type BtSettings, type BtState } from './model';

type Def = VizDef<BtState, BtSettings, undefined>;

/** k distinct values from 1 to 9, in increasing order. */
function distinct(rng: Rng, k: number): number[] {
  return shuffle(rng, [1, 2, 3, 4, 5, 6, 7, 8, 9])
    .slice(0, k)
    .sort((a, b) => a - b);
}

const text = (vs: number[]) => vs.join(' ');

/**
 * Practice questions for backtracking. Every answer comes from running the model, so it always
 * agrees with the drawing. `def` is a getter to avoid an import cycle.
 */
export function backtrackingPractice(def: () => Def): PracticeKind[] {
  const end = (settings: BtSettings, values: number[]): Step<BtState, undefined> => {
    const t = new Timeline(def(), settings, 1, [['run', text(values)]]);
    return t.entries[0]!.steps.at(-1)!;
  };
  const num = (step: Step<BtState, undefined>, name: string) => Number(step.vars?.[name] ?? 0);

  return [
    {
      id: 'nth-permutation',
      title: 'Which order comes when?',
      make(rng) {
        const values = distinct(rng, 3);
        const settings: BtSettings = { ...defaults, problem: 'permutations', target: 0 };
        const found = end(settings, values).state.found.map(seqText);
        const k = rng.int(2, 5);
        const right = found[k - 1]!;
        const wrong = shuffle(
          rng,
          found.filter((f) => f !== right),
        );
        return {
          prompt: `The search lists every order of ${values.join(', ')}, trying the unused values left to right at each step. Which order does it output ${ordinal(k)}?`,
          setup: [['load', text(values)]] as OpCall[],
          settings,
          answer: choice(rng, right, wrong),
          explain: `Each value takes its turn in front, and the orders that start with it come out together, smallest choice first: ${found.slice(0, k).join(', ')}. So the ${ordinal(k)} is ${right}.`,
          watch: [['run', text(values)]] as OpCall[],
        };
      },
    },
    {
      id: 'subset-calls',
      title: 'How many calls?',
      make(rng) {
        const n = rng.int(3, 4);
        const values = distinct(rng, n);
        const settings: BtSettings = { ...defaults, problem: 'subsets', target: 0 };
        const small = end(settings, values.slice(0, n - 1));
        const big = end(settings, values);
        return {
          prompt: `The picture shows every call the search makes to list the subsets of ${values.slice(0, n - 1).join(', ')}. How many calls does it make for the ${n} values ${values.join(', ')}?`,
          setup: [['run', text(values.slice(0, n - 1))]] as OpCall[],
          settings,
          answer: { kind: 'number', value: num(big, 'calls') },
          explain: `Every call above the leaves makes two calls: take the next value, or skip it. One more value doubles the leaves, so the tree goes from ${num(small, 'calls')} calls to 2 × ${num(small, 'calls')} + 1 = ${num(big, 'calls')}.`,
          watch: [['run', text(values)]] as OpCall[],
        };
      },
    },
    {
      id: 'target-count',
      title: 'Subsets with a given sum',
      make(rng) {
        const values = distinct(rng, 4);
        const sums = new Set<number>();
        for (let m = 1; m < 16; m++)
          sums.add(values.reduce((t, v, i) => t + ((m >> i) & 1 ? v : 0), 0));
        const options = [...sums].sort((a, b) => a - b);
        const target = options[rng.int(0, options.length - 1)]!;
        const settings: BtSettings = { ...defaults, problem: 'subsets', target };
        const step = end(settings, values);
        const found = step.state.found.map(seqText);
        return {
          prompt: `How many subsets of ${values.join(', ')} have the sum ${target}?`,
          setup: [['load', text(values)]] as OpCall[],
          settings,
          answer: { kind: 'number', value: found.length },
          explain: `The search keeps a branch only while its sum can still reach ${target}. It finds ${plural(found.length, 'subset')}: ${found.join(', ')}.`,
          watch: [['run', text(values)]] as OpCall[],
        };
      },
    },
    {
      id: 'pruned-count',
      title: 'How much does pruning cut?',
      make(rng) {
        const values = distinct(rng, 3);
        const total = values.reduce((a, b) => a + b, 0);
        const target = rng.int(Math.max(1, values[0]!), total);
        const settings: BtSettings = { ...defaults, problem: 'subsets', target };
        const step = end(settings, values);
        const pruned = num(step, 'pruned');
        return {
          prompt: `The search looks for subsets of ${values.join(', ')} with the sum ${target}. A call returns at once when its sum is over ${target}, or when even the values left cannot bring it up to ${target}. How many calls return at once like that?`,
          setup: [['load', text(values)]] as OpCall[],
          settings,
          answer: { kind: 'number', value: pruned },
          explain: `Follow the tree: take or skip each value, and stop a branch as soon as its sum is over ${target} or too small to catch up. ${plural(pruned, 'call')} stop that way, out of ${plural(num(step, 'calls'), 'call')} in all.`,
          watch: [['run', text(values)]] as OpCall[],
        };
      },
    },
  ];
}
