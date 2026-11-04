import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { defaults, items, type SortedExtra, type SortedSettings, type SortedState } from './model';

type Def = VizDef<SortedState, SortedSettings, SortedExtra>;

const call = ([op, ...args]: OpCall) => `\`${op}(${args.join(', ')})\``;

function distinct(rng: Rng, n: number): number[] {
  const out = new Set<number>();
  while (out.size < n) out.add(rng.int(1, 99));
  return [...out];
}

const inserts = (values: number[]): OpCall[] => values.map((v) => ['insert', v]);

/** Practice questions for the sorted (and unsorted) array. Every answer comes from the model. */
export function sortedPractice(def: () => Def): PracticeKind[] {
  const run = (cs: OpCall[], settings: SortedSettings = defaults) =>
    new Timeline(def(), settings, 1, cs);
  /** The value to look for: one that is there, or one that is not. */
  const target = (rng: Rng, values: number[]) =>
    rng.int(0, 2) ? values[rng.int(0, values.length - 1)]! : rng.int(1, 99);

  return [
    {
      id: 'probes',
      title: 'Where does binary search look?',
      make(rng) {
        const values = distinct(rng, rng.int(7, 10));
        const setup = inserts(values);
        const x = target(rng, values);
        const ask: OpCall = ['search', x];
        const t = run([...setup, ask]);
        const mids = t.entries
          .at(-1)!
          .steps.filter((s) => s.lines.includes('search.mid'))
          .map((s) => String(s.vars?.mid));
        const found = t.entries.at(-1)!.steps.at(-1)!.vars?.returned !== -1;
        return {
          prompt: `Binary search runs ${call(ask)} on the array shown. Type the indices of the items it compares with ${x}, in order.`,
          setup,
          answer: { kind: 'sequence', value: mids },
          explain: `Each round looks at mid = ⌊(lo + hi) / 2⌋ and keeps the half where ${x} could be: ${mids.join(', ')}. ${found ? `It finds ${x} at index ${mids.at(-1)}.` : `Then lo passes hi and ${x} is not there.`}`,
          watch: [ask],
        };
      },
    },
    {
      id: 'comparisons',
      title: 'How many comparisons?',
      make(rng) {
        const settings: SortedSettings = {
          ...defaults,
          mode: rng.int(0, 1) ? 'sorted' : 'unsorted',
        };
        const values = distinct(rng, rng.int(6, 10));
        const setup = inserts(values);
        const x = target(rng, values);
        const ask: OpCall = ['search', x];
        const end = run([...setup, ask], settings)
          .entries.at(-1)!
          .steps.at(-1)!;
        const n = Number(end.vars?.comparisons);
        const sortedMode = settings.mode === 'sorted';
        return {
          prompt: `This array is ${sortedMode ? 'sorted' : 'unsorted'}. How many comparisons with ${x} does ${call(ask)} make? (Binary search counts "is it equal?" and "is it smaller?" separately.)`,
          setup,
          settings,
          answer: { kind: 'number', value: n },
          explain: sortedMode
            ? `Binary search makes two comparisons per round, except the round that finds ${x}, which needs one: ${n} in all.`
            : `With no order to use, the scan checks items from the start until it finds ${x} or runs out: ${n} ${n === 1 ? 'comparison' : 'comparisons'}.`,
          watch: [ask],
        };
      },
    },
    {
      id: 'insert-moves',
      title: 'How many items shift?',
      make(rng) {
        const values = distinct(rng, rng.int(5, 9));
        const setup = inserts(values.slice(0, -1));
        const ask: OpCall = ['insert', values.at(-1)!];
        const moves = Number(
          run([...setup, ask])
            .entries.at(-1)!
            .steps.at(-1)!.vars?.moves,
        );
        return {
          prompt: `The array is kept sorted. How many items shift right when you run ${call(ask)}?`,
          setup,
          answer: { kind: 'number', value: moves },
          explain: `Every item bigger than ${values.at(-1)} moves one slot right to open a gap: ${moves} ${moves === 1 ? 'item' : 'items'}.`,
          watch: [ask],
        };
      },
    },
    {
      id: 'lower-bound',
      title: 'Where would it go?',
      make(rng) {
        // A few repeated values, so lower bound has duplicates to find the start of.
        const pool = distinct(rng, 4);
        const values = Array.from({ length: rng.int(6, 9) }, () => pool[rng.int(0, 3)]!);
        const setup = inserts(values);
        const x = rng.int(0, 1) ? pool[rng.int(0, 3)]! : rng.int(1, 99);
        const ask: OpCall = ['lowerBound', x];
        const t = run([...setup, ask]);
        const at = Number(t.entries.at(-1)!.steps.at(-1)!.vars?.returned);
        const array = items(t.endState());
        return {
          prompt: `What does ${call(ask)} return: the first index whose item is at least ${x}?`,
          setup,
          answer: { kind: 'number', value: at },
          explain:
            at < array.length
              ? `A[${at}] = ${array[at]} is the first item that is at least ${x}${at > 0 ? `; A[${at - 1}] = ${array[at - 1]} is smaller` : ''}.`
              : `Every item is smaller than ${x}, so the answer is size = ${at}, just past the end.`,
          watch: [ask],
        };
      },
    },
  ];
}
