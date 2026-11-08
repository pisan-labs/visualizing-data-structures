import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, Step, VizDef } from '../../engine/types';
import { defaults, type RodExtra, type RodSettings, type RodState } from './model';

type Def = VizDef<RodState, RodSettings, RodExtra>;
type RodStep = Step<RodState, RodExtra>;

/** Prices for lengths 1..n that rise, unevenly, so cuts matter. */
export function randomPrices(rng: Rng, n: number): number[] {
  const out: number[] = [];
  let last = 0;
  for (let i = 1; i <= n; i++) {
    last += rng.int(0, 5) + (i === 1 ? 1 : 0);
    out.push(Math.min(60, last));
  }
  return out;
}

const listPrices = (p: number[]) => p.map((v, k) => `p[${k + 1}] = ${v}`).join(', ');

/**
 * Practice questions for rod cutting. Answers come from running the model with seed 1, the way
 * the practice panel replays a question. `def` is a getter to avoid an import cycle.
 */
export function rodPractice(def: () => Def): PracticeKind[] {
  const run = (ops: OpCall[], settings: Partial<RodSettings> = {}) =>
    new Timeline(def(), { ...defaults, ...settings } as RodSettings, 1, ops);
  const last = (ops: OpCall[], settings: Partial<RodSettings> = {}): RodStep =>
    run(ops, settings).entries.at(-1)!.steps.at(-1)!;

  return [
    {
      id: 'next',
      title: 'Fill the next length',
      make(rng) {
        const n = rng.int(4, 7);
        const prices = randomPrices(rng, n);
        const j = rng.int(2, n);
        const setup: OpCall[] = [
          ['prices', prices.join(' ')],
          ...Array.from({ length: j }, () => ['next'] as OpCall),
        ];
        const end = last([...setup, ['next']]).state;
        const r = end.r;
        const sums = Array.from({ length: j }, (_, k) => `${prices[k]} + ${r[j - k - 1]}`);
        return {
          prompt: `Prices: ${listPrices(prices)}. The table holds r[0] to r[${j - 1}]. What is r[${j}], the best revenue for length ${j}?`,
          setup,
          answer: { kind: 'number', value: r[j]! },
          explain: `Try every first piece i and add r[${j} − i]: ${sums.join(', ')}. The largest is ${r[j]}, with a first piece of ${end.s[j]}.`,
          watch: [['next']],
        };
      },
    },
    {
      id: 'pieces',
      title: 'Which pieces?',
      make(rng) {
        const n = rng.int(5, 8);
        const prices = randomPrices(rng, n);
        const setup: OpCall[] = [['prices', prices.join(' ')], ['fill']];
        const end = last([...setup, ['cut']]);
        const pieces = String(end.vars?.pieces).split(' ');
        return {
          prompt: `Prices: ${listPrices(prices)}. The table is full. Follow s from s[${n}] and type the lengths of the pieces in the order you cut them off.`,
          setup,
          answer: { kind: 'sequence', value: pieces },
          explain: `Read s[${n}], cut that piece off, and read s at the length that is left, until nothing is left: ${pieces.join(', ')}, worth ${String(end.vars?.revenue)}.`,
          watch: [['cut']],
        };
      },
    },
    {
      id: 'calls',
      title: 'How many calls?',
      make(rng) {
        const n = rng.int(3, 7);
        const prices = randomPrices(rng, n);
        const setup: OpCall[] = [['prices', prices.join(' ')]];
        const end = last([...setup, ['fill']], { style: 'memo' });
        const calls = Number(end.vars?.calls);
        return {
          prompt: `Top-down with a memo, a rod of length ${n}. memoCut(j) calls memoCut(j − i) for every i from 1 to j, unless r[j] is already in the memo. Counting the first call, how many calls does memoCut(${n}) make in all?`,
          setup,
          settings: { style: 'memo' },
          answer: { kind: 'number', value: calls },
          explain: `Each length j is worked out once and makes j calls, so 1 + (1 + 2 + ... + ${n}) = ${calls} calls. ${String(end.vars?.hits)} of them find their answer in the memo.`,
          watch: [['fill']],
        };
      },
    },
    {
      id: 'greedy',
      title: 'What does greedy earn?',
      make(rng) {
        const n = rng.int(4, 7);
        const prices = randomPrices(rng, n);
        const setup: OpCall[] = [['prices', prices.join(' ')], ['fill']];
        const end = last([...setup, ['cut']]);
        const g = Number(end.vars?.greedy);
        const best = Number(end.vars?.revenue);
        return {
          prompt: `Prices: ${listPrices(prices)}. Greedy keeps cutting off the piece with the best price per unit that still fits (ties go to the longer piece). How much does it earn for length ${n}?`,
          setup,
          answer: { kind: 'number', value: g },
          explain: `Greedy earns ${g}. The table's best is ${best}${g < best ? ', so greedy falls short here' : ', so greedy happens to be right here'}.`,
          watch: [['cut']],
        };
      },
    },
  ];
}
