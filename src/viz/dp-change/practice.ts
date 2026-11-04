import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, Settings, Step, VizDef } from '../../engine/types';
import { andList } from '../_dp/kit';
import { defaults, type ChangeExtra, type ChangeSettings, type ChangeState } from './model';

type Def = VizDef<ChangeState, ChangeSettings, ChangeExtra>;
type ChangeStep = Step<ChangeState, ChangeExtra>;

const FEWEST: Settings = { goal: 'fewest' };
const WAYS: Settings = { goal: 'ways' };

/** Coin sets where greedy is interesting: it fails for some amounts, or gets stuck. */
const GREEDY_SETS = [
  [1, 3, 4],
  [1, 4, 5],
  [1, 5, 6],
  [1, 3, 5],
  [1, 2, 5],
  [1, 5, 10],
  [1, 6, 9],
  [3, 5],
  [2, 5],
  [4, 5, 7],
];

const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[rng.int(0, xs.length - 1)]!;

/** A coin 1 and one or two others, so every amount can be made. */
function withOne(rng: Rng): number[] {
  const out = new Set([1]);
  const n = rng.int(2, 3);
  while (out.size < n) out.add(rng.int(2, 7));
  return [...out].sort((a, b) => a - b);
}

const coinsCall = (coins: number[]): OpCall => ['coins', coins.join(' ')];

/**
 * Practice questions for making change. Answers come from running the model with seed 1, the
 * way the practice panel replays a question. `def` is a getter to avoid an import cycle.
 */
export function changePractice(def: () => Def): PracticeKind[] {
  const run = (settings: Settings, ops: OpCall[]): ChangeStep[] =>
    new Timeline(def(), { ...defaults, ...settings } as ChangeSettings, 1, ops).entries.at(-1)!
      .steps;
  const fewestRow = (coins: number[], amount: number) =>
    run(FEWEST, [coinsCall(coins), ['change', amount]]).at(-1)!.state.table[0]!;

  return [
    {
      id: 'next-cell',
      title: 'Carry the table on',
      make(rng) {
        const coins = withOne(rng);
        const a0 = rng.int(4, 9);
        const a = a0 + rng.int(1, 2);
        const F = fewestRow(coins, a);
        const value = F[a]!;
        const tried = coins.filter((c) => c <= a).map((c) => `F[${a - c}] + 1 = ${F[a - c]! + 1}`);
        return {
          prompt: `The table shows the fewest coins for every amount up to ${a0}, with coins ${andList(coins)}. What is F[${a}], the fewest coins for ${a}?`,
          setup: [coinsCall(coins), ['change', a0]],
          settings: FEWEST,
          answer: { kind: 'number', value },
          explain: `${a > a0 + 1 ? `First F[${a0 + 1}] = ${F[a0 + 1]}. Then ` : ''}F[${a}] is the smallest of ${andList(tried)}: ${value}.`,
          watch: [['change', a]],
        };
      },
    },
    {
      id: 'paid',
      title: 'Which coins does it pay with?',
      make(rng) {
        const coins = rng.int(0, 1) ? withOne(rng) : pick(rng, GREEDY_SETS.slice(0, 7));
        const amount = rng.int(5, 12);
        const steps = run(FEWEST, [coinsCall(coins), ['change', amount]]);
        const taken = steps.at(-1)!.extra?.taken ?? [];
        const paid = taken.map((t) => String(t.coin));
        const walk = taken.map((t) => `coin[${t.at}] = ${t.coin}`);
        return {
          prompt: `The table is filled for coins ${andList(coins)} up to ${amount}. Trace back from F[${amount}] with the coin row: which coins does it pay with? Type them in the order the traceback takes them.`,
          setup: [coinsCall(coins), ['change', amount]],
          settings: FEWEST,
          answer: { kind: 'sequence', value: paid },
          explain: `Start at ${amount} and keep taking the coin that cell used, moving left by its value: ${walk.join(', ')}. That is ${paid.length} ${paid.length === 1 ? 'coin' : 'coins'}, F[${amount}].`,
          watch: [['change', amount]],
        };
      },
    },
    {
      id: 'greedy',
      title: 'Does greedy get it right?',
      make(rng) {
        let coins = pick(rng, GREEDY_SETS);
        let amount = rng.int(5, 12);
        // Amounts these coins cannot make at all are no question for greedy.
        for (let tries = 0; fewestRow(coins, amount)[amount] === Infinity && tries < 20; tries++) {
          coins = pick(rng, GREEDY_SETS);
          amount = rng.int(5, 12);
        }
        if (fewestRow(coins, amount)[amount] === Infinity) {
          coins = [1, 3, 4];
          amount = 6;
        }
        const end = run(FEWEST, [coinsCall(coins), ['change', amount]]).at(-1)!;
        const best = Number(end.vars?.fewest);
        const g = end.extra!.greedy!;
        const same = 'Yes, it pays with as few coins as the table';
        const more = 'No, it pays with more coins';
        const stuck = 'No, it gets stuck';
        const right = g.stuck ? stuck : g.picks.length > best ? more : same;
        return {
          prompt: `The table shows the fewest coins for every amount up to ${amount}, with coins ${andList(coins)}. Greedy always takes the largest coin that fits. Does greedy pay ${amount} with as few coins as the table?`,
          setup: [coinsCall(coins), ['change', amount]],
          settings: FEWEST,
          answer: {
            kind: 'choice',
            options: [same, more, stuck],
            correct: [same, more, stuck].indexOf(right),
          },
          explain: g.stuck
            ? `Greedy takes ${g.picks.join(' + ')} and then no coin fits what is left. The table pays ${amount} with ${best}.`
            : `Greedy pays ${g.picks.join(' + ')}, ${g.picks.length} ${g.picks.length === 1 ? 'coin' : 'coins'}. The table says F[${amount}] = ${best}.`,
          watch: [['change', amount]],
        };
      },
    },
    {
      id: 'ways',
      title: 'How many ways?',
      make(rng) {
        const coins = rng.int(0, 2) ? withOne(rng) : [2, 3];
        const a0 = rng.int(3, 8);
        const a = a0 + 1;
        const end = run(WAYS, [coinsCall(coins), ['change', a]]).at(-1)!;
        const n = Number(end.vars?.ways);
        const column = end.state.table.map((row) => row[a]!);
        return {
          prompt: `The table counts the ways to make each amount up to ${a0} with coins ${andList(coins)}; row i may use the first i coins. How many ways are there to make ${a}?`,
          setup: [coinsCall(coins), ['change', a0]],
          settings: WAYS,
          answer: { kind: 'number', value: n },
          explain: `Fill column ${a} from the top. Each cell is the cell above plus the cell one coin to the left: ${column.join(', ')}. The last row says ${n}.`,
          watch: [['change', a]],
        };
      },
    },
  ];
}
