import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { ordered } from '../_recursion/kit';
import {
  BITS,
  binary,
  defaults,
  firstShort,
  growText,
  sum,
  type AmExtra,
  type AmSettings,
  type AmState,
  type Growth,
} from './model';

type Def = VizDef<AmState, AmSettings, AmExtra>;

const GROWTH_NAME: Record<Growth, string> = {
  '2': 'doubles when full',
  '1.5': 'grows to ⌈1.5 × capacity⌉ when full',
  '4': 'grows by 4 slots when full',
};

/** Practice for amortized analysis. Every answer comes from running the model. */
export function amortizedPractice(def: () => Def): PracticeKind[] {
  const end = (settings: AmSettings, calls: OpCall[]) =>
    new Timeline(def(), settings, 1, calls).endState();

  return [
    {
      id: 'copies-after',
      title: 'How many copies?',
      make(rng) {
        const settings: AmSettings = { ...defaults, method: 'aggregate' };
        const n = rng.int(5, 24);
        const ask: OpCall[] = [['run', n]];
        const s = end(settings, ask);
        const copies = sum(s.costs) - n;
        const grows = s.costs.filter((c, j) => c > 1 && j > 0).map((c) => c - 1);
        return {
          prompt: `An empty dynamic array doubles when it is full, starting with 1 slot. How many items have been copied in all after ${n} appends?`,
          setup: [],
          settings,
          answer: { kind: 'number', value: copies },
          explain: `The appends that find the array full copy ${grows.join(' + ')} = ${copies} items. That is under 2 per append, and adding the ${n} writes keeps the total under 3 per append.`,
          watch: ask,
        };
      },
    },
    {
      id: 'charge-enough',
      title: 'Is the charge enough?',
      make(rng) {
        const counter = rng.int(0, 3) === 0;
        const growth = (['2', '2', '1.5', '4'] as const)[rng.int(0, 3)]!;
        const charge = counter ? rng.int(1, 3) : rng.int(2, 4);
        const settings: AmSettings = {
          ...defaults,
          structure: counter ? 'counter' : 'array',
          method: 'accounting',
          growth,
          charge: String(charge) as AmSettings['charge'],
        };
        const n = rng.int(8, 24);
        const ask: OpCall[] = [['run', n]];
        const s = end(settings, ask);
        const first = firstShort(s);
        const what = counter
          ? `A ${BITS}-bit counter starts at 0, and each increment is charged ${charge} ${charge === 1 ? 'coin' : 'coins'}`
          : `An empty dynamic array ${GROWTH_NAME[growth]}, and each append is charged ${charge} coins`;
        const word = counter ? 'increment' : 'append';
        return {
          prompt: `${what}. Every unit of work takes one coin from the bank. Does the bank stay at 0 or above through ${n} ${word}s?`,
          setup: [],
          settings,
          answer: ordered(['Yes', 'No'], first === null ? 'Yes' : 'No'),
          explain:
            first === null
              ? `Yes. The bank never goes below zero; its lowest point is ${Math.min(...s.banks)} and it ends at ${s.banks.at(-1)}.`
              : `No. ${word === 'append' ? 'Append' : 'Increment'} ${first} costs ${s.costs[first - 1]} and leaves the bank at ${s.banks[first - 1]}.`,
          watch: ask,
        };
      },
    },
    {
      id: 'phi-after',
      title: 'What is Φ?',
      make(rng) {
        const counter = rng.int(0, 1) === 0;
        const settings: AmSettings = {
          ...defaults,
          structure: counter ? 'counter' : 'array',
          method: 'potential',
        };
        const setup: OpCall[] = [['run', rng.int(2, 10)]];
        const ask: OpCall[] = [['run', rng.int(1, 6)]];
        const before = end(settings, setup);
        const after = end(settings, [...setup, ...ask]);
        const phi = after.phis.at(-1)!;
        const k = ask[0]![1] as number;
        if (counter) {
          return {
            prompt: `Φ is the number of 1 bits. The counter reads ${binary(before.bits)}. What is Φ after ${k} more ${k === 1 ? 'increment' : 'increments'}?`,
            setup,
            settings,
            answer: { kind: 'number', value: phi },
            explain: `The counter ends at ${binary(after.bits)}, which has ${phi} 1 ${phi === 1 ? 'bit' : 'bits'}.`,
            watch: ask,
          };
        }
        return {
          prompt: `Φ = 2·size − capacity, and the array doubles when full. It holds ${before.size} items in ${before.capacity} slots. What is Φ after ${k} more ${k === 1 ? 'append' : 'appends'}?`,
          setup,
          settings,
          answer: { kind: 'number', value: phi },
          explain: `After them the array holds ${after.size} items in ${after.capacity} slots${after.capacity > before.capacity ? ` (it grew to ${growText(before.capacity, '2')} on the way)` : ''}, so Φ = 2·${after.size} − ${after.capacity} = ${phi}.`,
          watch: ask,
        };
      },
    },
    {
      id: 'flips-total',
      title: 'Bit flips in all',
      make(rng) {
        const settings: AmSettings = { ...defaults, structure: 'counter', method: 'aggregate' };
        const n = rng.int(5, 24);
        const ask: OpCall[] = [['run', n]];
        const s = end(settings, ask);
        const total = sum(s.costs);
        const perBit = Array.from({ length: BITS }, (_, i) => Math.floor(n / 2 ** i)).filter(
          (f) => f > 0,
        );
        return {
          prompt: `A binary counter starts at 0. How many bits flip in all over ${n} increments?`,
          setup: [],
          settings,
          answer: { kind: 'number', value: total },
          explain: `Bit 0 flips every time, bit 1 every second time, bit 2 every fourth: ${perBit.join(' + ')} = ${total} flips, under 2 × ${n} = ${2 * n}.`,
          watch: ask,
        };
      },
    },
  ];
}
