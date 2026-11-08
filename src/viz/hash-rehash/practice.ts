import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, Settings, VizDef } from '../../engine/types';
import { fmtNum, shuffle } from '../_hashing/hashing';
import {
  defaults,
  sizeOf,
  type RehashExtra,
  type RehashSettings,
  type RehashState,
  type Threshold,
} from './model';

type Def = VizDef<RehashState, RehashSettings, RehashExtra>;
type T = Timeline<RehashState, RehashSettings, RehashExtra>;

const call = ([op, ...args]: OpCall) => `\`${op}(${args.join(', ')})\``;
const calls = (cs: OpCall[]) => cs.map(call).join(', ');
const pick = <X>(rng: Rng, xs: X[]): X => xs[rng.int(0, xs.length - 1)]!;

function fresh(rng: Rng, n: number, avoid: number[] = []): number[] {
  const out = new Set<number>();
  while (out.size < n) {
    const k = rng.int(1, 99);
    if (!avoid.includes(k)) out.add(k);
  }
  return [...out];
}

const growth = (s: RehashSettings) =>
  s.grow === 'double' ? 'doubles' : 'grows to the first prime at least twice its size';

/**
 * Practice for rehashing. Every answer comes from running the model. `def` is a getter to avoid
 * an import cycle.
 */
export function rehashPractice(def: () => Def): PracticeKind[] {
  const run = (cs: OpCall[], settings: RehashSettings): T => new Timeline(def(), settings, 1, cs);

  const setting = (rng: Rng): RehashSettings => ({
    ...defaults,
    m0: pick(rng, [4, 5, 7]),
    threshold: pick(rng, ['0.5', '0.75', '0.75', '1.0'] as Threshold[]),
    grow: pick(rng, ['prime', 'prime', 'double'] as const),
  });

  return [
    {
      id: 'size-after',
      title: 'How big is the table?',
      make(rng) {
        const settings = setting(rng);
        const keys = fresh(rng, rng.int(5, 9));
        const setup: OpCall[] = keys.slice(0, 2).map((k) => ['insert', k]);
        const ask: OpCall[] = keys.slice(2).map((k) => ['insert', k]);
        const m = run([...setup, ...ask], settings).endState().table.m;
        return {
          prompt: `The table starts with m = ${settings.m0} slots and ${growth(settings)} when one more key would push α above ${settings.threshold}. After ${calls(ask)}, how many slots does it have?`,
          setup,
          settings: settings as Settings,
          answer: { kind: 'number', value: m },
          explain: `Before each new key, check whether (n + 1)/m would pass ${settings.threshold}. With ${keys.length} keys the table ends at m = ${m}.`,
          watch: ask,
        };
      },
    },
    {
      id: 'move-to',
      title: 'Where does the key move?',
      make(rng) {
        const settings: RehashSettings = { ...defaults, m0: 5, threshold: '0.75', grow: 'prime' };
        const keys = fresh(rng, 3);
        const setup: OpCall[] = keys.map((k) => ['insert', k]);
        const k = fresh(rng, 1, keys)[0]!;
        const t = run([...setup, ['insert', k]], settings);
        const x = pick(rng, keys);
        const end = t.endState().table;
        const slot = end.slots.findIndex((c) => c?.key === x);
        return {
          prompt: `Three keys sit in a table of 5 slots (linear probing, h(k) = k mod m, threshold 0.75). \`insert(${k})\` makes the table grow to 11, moving the keys in slot order. Which slot of the new table does ${x} end up in?`,
          setup,
          settings: settings as Settings,
          answer: { kind: 'number', value: slot },
          explain: `In the new table h(${x}) = ${x} mod 11 = ${x % 11}. ${
            slot === x % 11
              ? `Slot ${slot} is free when ${x} moves, so it goes there.`
              : `That slot is taken by then, so linear probing carries ${x} on to slot ${slot}.`
          }`,
          watch: [['insert', k]],
        };
      },
    },
    {
      id: 'total-cost',
      title: 'What does it cost?',
      make(rng) {
        const settings = setting(rng);
        const keys = fresh(rng, rng.int(5, 8));
        const ask: OpCall[] = keys.map((k) => ['insert', k]);
        const end = run(ask, settings).endState();
        return {
          prompt: `Count 1 for every key stored and 1 for every key moved by a rehash. The table starts empty with m = ${settings.m0} and ${growth(settings)} when α would pass ${settings.threshold}. What do ${calls(ask)} cost in total?`,
          setup: [],
          settings: settings as Settings,
          answer: { kind: 'number', value: end.total },
          explain: `${keys.length} stores, plus every key moved by each rehash: ${end.total} in total, or ${fmtNum(end.total / end.inserts)} per insert on average.`,
          watch: ask,
        };
      },
    },
    {
      id: 'alpha-after',
      title: 'The load factor after a rehash',
      make(rng) {
        const settings = setting(rng);
        const keys = fresh(rng, rng.int(4, 8));
        const setup: OpCall[] = keys.slice(0, 1).map((k) => ['insert', k]);
        const ask: OpCall[] = keys.slice(1).map((k) => ['insert', k]);
        const end = run([...setup, ...ask], settings).endState();
        const n = sizeOf(end);
        const m = end.table.m;
        const label = (x: number, y: number) => `${x}/${y} ≈ ${fmtNum(x / y)}`;
        const options = shuffle(rng.next, [
          ...new Set([label(n, m), label(n, settings.m0), label(n - 1, m), label(n + 1, m)]),
        ]);
        return {
          prompt: `The table starts with m = ${settings.m0} and ${growth(settings)} when α would pass ${settings.threshold}. After ${calls(ask)}, what is α?`,
          setup,
          settings: settings as Settings,
          answer: { kind: 'choice', options, correct: options.indexOf(label(n, m)) },
          explain: `There are ${n} keys, and the table ends with m = ${m}, so α = ${label(n, m)}. It never passes ${settings.threshold}: that is the point of growing.`,
          watch: ask,
        };
      },
    },
  ];
}
