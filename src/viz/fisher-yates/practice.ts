import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { defaults, exactCounts, PERMS, plan, type FySettings, type FyState } from './model';

type Def = VizDef<FyState, FySettings, undefined>;

const LETTERS = 'A B C D E F G H'.split(' ');

/** Practice for the shuffle. Every answer comes from running the model. */
export function fisherYatesPractice(def: () => Def): PracticeKind[] {
  const end = (settings: FySettings, calls: OpCall[]): FyState => {
    const t = new Timeline(def(), settings, 1, calls);
    return t.entries[t.entries.length - 1]!.end;
  };
  const naive: FySettings = { ...defaults, method: 'naive' };
  const load = (n: number): OpCall => ['load', LETTERS.slice(0, n).join(' ')];

  return [
    {
      id: 'range',
      title: 'How many choices for j?',
      make(rng) {
        const n = rng.int(4, 8);
        const i = rng.int(0, n - 2);
        const step = plan(n, defaults).find((p) => p.i === i)!;
        const count = step.hi - step.lo + 1;
        return {
          prompt: `Fisher-Yates, left to right, shuffles ${n} items. When i = ${i}, how many positions can j be?`,
          setup: [load(n)],
          answer: { kind: 'number', value: count },
          explain: `j is picked from the unshuffled part, ${step.lo} to ${step.hi}, i itself included: ${count} positions. Multiplying the choices over all steps gives ${n}!, one run per order.`,
          watch: [['shuffle']],
        };
      },
    },
    {
      id: 'swaps',
      title: 'How many swaps?',
      make(rng) {
        const n = rng.int(3, 8);
        const s = end(defaults, [load(n), ['shuffle']]);
        return {
          prompt: `How many swaps does Fisher-Yates make on ${n} items (counting a swap of an item with itself)?`,
          setup: [load(n)],
          answer: { kind: 'number', value: s.picks.length },
          explain: `One per position except the last, which has nothing left to swap with: ${n} − 1 = ${s.picks.length}. It is O(n).`,
          watch: [['shuffle']],
        };
      },
    },
    {
      id: 'runs',
      title: 'Counting runs of the naive shuffle',
      make(rng) {
        const n = rng.int(2, 4);
        const runs = plan(n, naive).reduce((p, s) => p * (s.hi - s.lo + 1), 1);
        return {
          prompt: `The naive shuffle swaps each of ${n} positions with any of the ${n} positions. How many equally likely runs (sequences of picks) are there?`,
          setup: [load(n)],
          settings: naive,
          answer: { kind: 'number', value: runs },
          explain: `${n} picks with ${n} choices each: ${n}^${n} = ${runs}. There are ${[1, 1, 2, 6, 24][n]} orders, and ${runs} does not divide evenly by ${[1, 1, 2, 6, 24][n]}${n === 2 ? '... except that here it does: 4 = 2·2, and for 2 items the naive shuffle is fair' : ', so some orders must be more likely'}.`,
          watch: [['shuffle']],
        };
      },
    },
    {
      id: 'odds',
      title: 'Odds of an order',
      make(rng) {
        const k = rng.int(0, 5);
        const counts = exactCounts(naive);
        const order = PERMS[k]!.split('').join(' ');
        return {
          prompt: `The naive shuffle of 1 2 3 has 27 equally likely runs. In how many of them does it end as ${order}?`,
          setup: [],
          settings: naive,
          answer: { kind: 'number', value: counts[k]! },
          explain: `Counting all 27: the orders get ${PERMS.map((p, i) => `${p.split('').join('')}: ${counts[i]}`).join(', ')}. So ${order} comes up ${counts[k]}/27 of the time instead of 1/6 = 4.5/27.`,
          watch: [['trials', 2700]],
        };
      },
    },
  ];
}
