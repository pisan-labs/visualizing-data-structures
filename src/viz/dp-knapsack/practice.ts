import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, Step, VizDef } from '../../engine/types';
import { andList } from '../_dp/kit';
import {
  defaults,
  greedy,
  itemsText,
  type Item,
  type KnapExtra,
  type KnapSettings,
  type KnapState,
} from './model';

type Def = VizDef<KnapState, KnapSettings, KnapExtra>;
type KnapStep = Step<KnapState, KnapExtra>;

/** A few items with small weights and values, and a capacity that cannot take them all. */
function problem(rng: Rng, n: [number, number] = [3, 4]): { items: Item[]; W: number } {
  const items = Array.from({ length: rng.int(n[0], n[1]) }, () => ({
    w: rng.int(1, 5),
    v: rng.int(1, 12),
  }));
  const total = items.reduce((s, it) => s + it.w, 0);
  const W = Math.max(2, Math.min(8, rng.int(Math.ceil(total / 2), total - 1)));
  return { items, W };
}

const setupFor = (items: Item[], W: number): OpCall[] => [
  ['items', itemsText(items)],
  ['capacity', W],
];

const describeItems = (items: Item[]) =>
  items.map((it, k) => `item ${k + 1} (w ${it.w}, v ${it.v})`).join(', ');

/**
 * Practice questions for the 0/1 knapsack. Answers come from running the model with seed 1,
 * the way the practice panel replays a question. `def` is a getter to avoid an import cycle.
 */
export function knapPractice(def: () => Def): PracticeKind[] {
  const run = (ops: OpCall[]) => new Timeline(def(), { ...defaults }, 1, ops);
  const last = (ops: OpCall[]): KnapStep => run(ops).entries.at(-1)!.steps.at(-1)!;

  return [
    {
      id: 'cell',
      title: 'Fill the next row',
      make(rng) {
        const { items, W } = problem(rng);
        const done = rng.int(1, items.length - 1);
        const i = done + 1;
        const c = rng.int(1, W);
        const setup: OpCall[] = [
          ...setupFor(items, W),
          ...Array.from({ length: done + 1 }, () => ['row'] as OpCall),
        ];
        const K = run([...setup, ['row']]).endState().K;
        const value = K[i]![c]!;
        const { w, v } = items[i - 1]!;
        return {
          prompt: `Items: ${describeItems(items)}. Capacity ${W}. Rows 0 to ${done} are filled. What is K[${i}][${c}]?`,
          setup,
          answer: { kind: 'number', value },
          explain:
            w > c
              ? `Item ${i} weighs ${w}, more than ${c}, so it cannot go in: K[${i}][${c}] = K[${done}][${c}] = ${value}.`
              : `Skip item ${i}: K[${done}][${c}] = ${K[done]![c]}. Take it: K[${done}][${c - w}] + ${v} = ${K[done]![c - w]! + v}. The larger is ${value}.`,
          watch: [['row']],
        };
      },
    },
    {
      id: 'take',
      title: 'Is the item in?',
      make(rng) {
        const { items, W } = problem(rng);
        const setup: OpCall[] = [...setupFor(items, W), ['fill']];
        const end = last([...setup, ['trace']]);
        const path = end.extra!.path!;
        // A row on the walk back: the walk is at row i, capacity c.
        const k = rng.int(0, path.length - 2);
        const [i, c] = path[k]!;
        const K = end.state.K;
        const taken = K[i]![c] !== K[i - 1]![c];
        const yes = `Yes, item ${i} is in`;
        const no = `No, item ${i} is left out`;
        return {
          prompt: `Items: ${describeItems(items)}. Capacity ${W}. The table is filled, and the walk back has reached K[${i}][${c}] = ${K[i]![c]}. Is item ${i} in the best knapsack?`,
          setup,
          answer: { kind: 'choice', options: [yes, no], correct: taken ? 0 : 1 },
          explain: taken
            ? `K[${i}][${c}] = ${K[i]![c]} differs from the cell above, K[${i - 1}][${c}] = ${K[i - 1]![c]}, so the best value for capacity ${c} needs item ${i}.`
            : `K[${i}][${c}] equals the cell above, K[${i - 1}][${c}] = ${K[i - 1]![c]}: the same value is reachable without item ${i}.`,
          watch: [['trace']],
        };
      },
    },
    {
      id: 'chosen',
      title: 'Which items go in?',
      make(rng) {
        const { items, W } = problem(rng, [3, 5]);
        const setup: OpCall[] = [...setupFor(items, W), ['fill']];
        const end = last([...setup, ['trace']]);
        const chosen = String(end.vars?.items ?? '')
          .split(' ')
          .filter(Boolean);
        return {
          prompt: `Items: ${describeItems(items)}. Capacity ${W}. The table is filled. Walk back from K[${items.length}][${W}] and type the numbers of the items it takes, smallest first. Leave it blank if it takes none.`,
          setup,
          answer: { kind: 'sequence', value: chosen },
          explain: chosen.length
            ? `Climb one row at a time. Wherever a value differs from the cell above, that item is in, and the walk moves left by its weight. ${chosen.length === 1 ? `Item ${chosen[0]} is` : `Items ${andList(chosen)} are`} worth ${String(end.vars?.best)}.`
            : 'No item fits, so the best value is 0 and nothing is taken.',
          watch: [['trace']],
        };
      },
    },
    {
      id: 'greedy',
      title: 'What does greedy get?',
      make(rng) {
        const { items, W } = problem(rng);
        const setup: OpCall[] = [...setupFor(items, W), ['fill']];
        const end = last([...setup, ['trace']]);
        const g = end.extra!.greedy!;
        const best = Number(end.vars?.best);
        const check = greedy(items, W);
        return {
          prompt: `Items: ${describeItems(items)}. Capacity ${W}. Greedy sorts the items by value per weight, best first (ties keep the earlier item), and takes each one that still fits. What total value does it get?`,
          setup,
          answer: { kind: 'number', value: g.value },
          explain: `Greedy takes ${check.picks.length === 0 ? 'nothing' : check.picks.length === 1 ? `item ${check.picks[0]}` : `items ${andList(check.picks)}`}, worth ${g.value}. The table's best is ${best}${g.value < best ? ', so greedy falls short here' : ', so greedy happens to be right here'}.`,
          watch: [['trace']],
        };
      },
    },
  ];
}
