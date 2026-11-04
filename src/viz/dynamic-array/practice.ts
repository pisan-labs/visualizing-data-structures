import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { defaults, type DynExtra, type DynSettings, type DynState } from './model';

type Def = VizDef<DynState, DynSettings, DynExtra>;

const call = ([op, ...args]: OpCall) => `\`${op}(${args.join(', ')})\``;

function distinct(rng: Rng, n: number): number[] {
  const out = new Set<number>();
  while (out.size < n) out.add(rng.int(1, 99));
  return [...out];
}

const appends = (values: number[]): OpCall[] => values.map((v) => ['append', v]);

/** Practice questions for the dynamic array. Every answer comes from running the model. */
export function dynamicPractice(def: () => Def): PracticeKind[] {
  const run = (cs: OpCall[], settings: DynSettings = defaults) =>
    new Timeline(def(), settings, 1, cs);

  return [
    {
      id: 'capacity-after',
      title: 'How big does it get?',
      make(rng) {
        const settings: DynSettings = { ...defaults, start: rng.int(1, 3) };
        const ask = appends(distinct(rng, rng.int(3, 12)));
        const end = run(ask, settings).endState();
        return {
          prompt: `The array starts empty with capacity ${settings.start} and doubles when it is full. What is the capacity after ${ask.length} appends?`,
          setup: [],
          settings,
          answer: { kind: 'number', value: end.capacity },
          explain: `Capacity only changes when an append finds the array full: ${settings.start} doubles until it reaches at least ${ask.length}, which gives ${end.capacity}.`,
          watch: ask,
        };
      },
    },
    {
      id: 'copies-now',
      title: 'How many values does this append copy?',
      make(rng) {
        const values = distinct(rng, 9);
        const size = rng.int(1, 8);
        const setup = appends(values.slice(0, size));
        const before = run(setup).endState();
        const ask: OpCall = ['append', values[8]!];
        const after = run([...setup, ask]).endState();
        const copied = after.copies - before.copies;
        return {
          prompt: `The array holds ${before.size} items in ${before.capacity} slots. How many values does ${call(ask)} copy?`,
          setup,
          answer: { kind: 'number', value: copied },
          explain:
            copied > 0
              ? `size equals capacity, so append first copies all ${copied} values into a new array of ${after.capacity} slots.`
              : `There is a free slot (size ${before.size} < capacity ${before.capacity}), so append stores the value and copies nothing.`,
          watch: [ask],
        };
      },
    },
    {
      id: 'total-copies',
      title: 'Copies in total',
      make(rng) {
        const ask = appends(distinct(rng, rng.int(5, 16)));
        const t = run(ask);
        const each = t.entries.map((e, k) => e.end.copies - (k ? t.entries[k - 1]!.end.copies : 0));
        const growths = each.filter((c) => c > 0);
        const total = t.endState().copies;
        return {
          prompt: `Starting from one slot and doubling when full, how many values have been copied in total after ${ask.length} appends?`,
          setup: [],
          answer: { kind: 'number', value: total },
          explain: `The appends that find the array full copy ${growths.join(' + ')} = ${total} values. That is ${(total / ask.length).toFixed(2)} per append, under 2 however many appends you make.`,
          watch: ask,
        };
      },
    },
    {
      id: 'shifts',
      title: 'How many items move?',
      make(rng) {
        const settings: DynSettings = { ...defaults, start: 8 };
        const values = distinct(rng, 8);
        const size = rng.int(2, 7);
        const setup = appends(values.slice(0, size));
        const i = rng.int(0, size);
        const ask: OpCall = ['insert', i, values[7]!];
        const before = run(setup, settings).endState();
        const after = run([...setup, ask], settings).endState();
        const moved = after.shifts - before.shifts;
        return {
          prompt: `The array holds ${size} items. How many of them move when you run ${call(ask)}?`,
          setup,
          settings,
          answer: { kind: 'number', value: moved },
          explain:
            moved > 0
              ? `Every item from index ${i} to ${size - 1} moves one slot right to make the gap: ${moved} ${moved === 1 ? 'move' : 'moves'}.`
              : `Index ${i} is the end of the array, so nothing has to move.`,
          watch: [ask],
        };
      },
    },
  ];
}
