import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, Step, VizDef } from '../../engine/types';
import {
  defaults,
  itemsText,
  ratioText,
  type FracExtra,
  type FracSettings,
  type FracState,
  type Item,
} from './model';

type Def = VizDef<FracState, FracSettings, FracExtra>;
type FracStep = Step<FracState, FracExtra>;

export function randomItems(rng: Rng, n: number, wMax = 6): Item[] {
  return Array.from({ length: n }, (_, k) => ({
    id: k + 1,
    w: rng.int(1, wMax),
    v: rng.int(2, 30),
  }));
}

/** A capacity that cannot take everything. */
const tight = (rng: Rng, items: Item[]) => {
  const total = items.reduce((s, it) => s + it.w, 0);
  return Math.max(1, Math.min(15, rng.int(Math.ceil(total / 3), Math.max(1, total - 1))));
};

const list = (items: Item[]) => items.map((it) => `item ${it.id} = ${it.w}:${it.v}`).join(', ');
const setupFor = (items: Item[], W: number): OpCall[] => [
  ['items', itemsText(items)],
  ['capacity', W],
];

/**
 * Practice questions for the fractional knapsack. Answers come from running the model with seed
 * 1, the way the practice panel replays a question. `def` is a getter to avoid an import cycle.
 */
export function fracPractice(def: () => Def): PracticeKind[] {
  const last = (ops: OpCall[], mode: FracSettings['mode'] = 'fractional'): FracStep =>
    new Timeline(def(), { ...defaults, mode }, 1, ops).entries.at(-1)!.steps.at(-1)!;

  return [
    {
      id: 'order',
      title: 'Which item first?',
      make(rng) {
        const items = randomItems(rng, rng.int(3, 5));
        const W = tight(rng, items);
        const setup = setupFor(items, W);
        const end = last([...setup, ['fill']]);
        const order = end.state.order.map(String);
        return {
          prompt: `Items (weight:value) ${list(items)}. In what order does the greedy look at them? Type the item numbers, best value per weight first (ties keep the order above).`,
          setup,
          answer: { kind: 'sequence', value: order },
          explain: `By value per weight: ${end.state.order.map((id) => `item ${id} (${ratioText(items[id - 1]!)})`).join(', ')}.`,
          watch: [['fill']],
        };
      },
    },
    {
      id: 'part',
      title: 'How much of it?',
      make(rng) {
        const items = randomItems(rng, rng.int(3, 5));
        const W = tight(rng, items);
        const setup = setupFor(items, W);
        const end = last([...setup, ['fill']]);
        const id = end.state.order[rng.int(0, items.length - 1)]!;
        const t = end.state.taken[id - 1] ?? 0;
        const it = items[id - 1]!;
        return {
          prompt: `Items (weight:value) ${list(items)}, capacity ${W}. Items can be cut. How much of item ${id}'s weight (${it.w}) goes in the knapsack?`,
          setup,
          answer: { kind: 'number', value: t },
          explain:
            t === it.w
              ? `Item ${id} fits whole when its turn comes: all ${it.w}.`
              : t === 0
                ? `The knapsack is full before item ${id}'s turn: none of it.`
                : `When item ${id}'s turn comes, only ${t} is left, so ${t} of its ${it.w} goes in.`,
          watch: [['fill']],
        };
      },
    },
    {
      id: 'whole',
      title: 'Greedy with whole items',
      make(rng) {
        const items = randomItems(rng, rng.int(3, 5));
        const W = tight(rng, items);
        const setup = setupFor(items, W);
        const end = last([...setup, ['fill']], 'whole');
        const value = Number(end.vars?.total);
        const best = Number(end.vars?.['0/1 best']);
        return {
          prompt: `Items (weight:value) ${list(items)}, capacity ${W}. Items cannot be cut. Greedy takes the items best value per weight first, skipping any that no longer fit. What value does it get?`,
          setup,
          settings: { mode: 'whole' },
          answer: { kind: 'number', value },
          explain: `Greedy gets ${value}. The 0/1 knapsack table's best is ${best}${value < best ? ', so greedy falls short' : ', so greedy is right this time'}.`,
          watch: [['fill']],
        };
      },
    },
    {
      id: 'right',
      title: 'Is greedy right?',
      make(rng) {
        const items = randomItems(rng, rng.int(3, 4));
        const W = tight(rng, items);
        const setup = setupFor(items, W);
        const end = last([...setup, ['fill']], 'whole');
        const value = Number(end.vars?.total);
        const best = Number(end.vars?.['0/1 best']);
        const yes = 'Yes, it gets the best value';
        const no = 'No, a different choice is worth more';
        return {
          prompt: `Items (weight:value) ${list(items)}, capacity ${W}, whole items only. Does greedy by value per weight get the best value?`,
          setup,
          settings: { mode: 'whole' },
          answer: { kind: 'choice', options: [yes, no], correct: value === best ? 0 : 1 },
          explain: `Greedy gets ${value}; the best is ${best}.`,
          watch: [['fill']],
        };
      },
    },
  ];
}
