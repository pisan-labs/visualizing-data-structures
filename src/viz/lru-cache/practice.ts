import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, Settings, VizDef } from '../../engine/types';
import { shuffle } from '../hash-chaining/hashing';
import { keysOf, node, type LruExtra, type LruSettings, type LruState } from './model';

type Def = VizDef<LruState, LruSettings, LruExtra>;
type T = Timeline<LruState, LruSettings, LruExtra>;

const call = ([op, ...args]: OpCall) => `\`${op}(${args.join(', ')})\``;
const calls = (cs: OpCall[]) => cs.map(call).join(', ');
const pick = <X>(rng: Rng, xs: X[]): X => xs[rng.int(0, xs.length - 1)]!;

/** A full cache of 3: three puts of different keys, then a get or two to stir the order. */
function warm(rng: Rng): { keys: number[]; setup: OpCall[] } {
  const keys = shuffle(rng.next, [1, 2, 3, 4, 5, 6, 7, 8, 9]).slice(0, 3);
  const setup: OpCall[] = keys.map((k) => ['put', k, k * 10]);
  for (let i = rng.int(1, 2); i > 0; i--) setup.push(['get', pick(rng, keys)]);
  return { keys, setup };
}

/**
 * Practice for the LRU cache. Every answer comes from running the model. `def` is a getter to
 * avoid an import cycle.
 */
export function lruPractice(def: () => Def): PracticeKind[] {
  const settings: LruSettings = { capacity: 3 };
  const run = (cs: OpCall[]): T => new Timeline(def(), settings, 1, cs);

  return [
    {
      id: 'evicts-next',
      title: 'Which key is evicted?',
      make(rng) {
        const { keys, setup } = warm(rng);
        const k = pick(
          rng,
          [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((x) => !keys.includes(x)),
        );
        const before = run(setup).endState();
        const victim = node(before, before.tail!).key;
        const options = shuffle(rng.next, keys.map(String));
        return {
          prompt: `The cache holds 3 entries and is full. Which key does \`put(${k}, ${k * 10})\` evict?`,
          setup,
          settings: settings as Settings,
          answer: { kind: 'choice', options, correct: options.indexOf(String(victim)) },
          explain: `Evict the least recently used key, the one at tail. Counting gets as uses, the order from most to least recent is ${keysOf(before).join(', ')}, so ${victim} goes.`,
          watch: [['put', k, k * 10]],
        };
      },
    },
    {
      id: 'order-after',
      title: 'Most to least recent',
      make(rng) {
        const { keys, setup } = warm(rng);
        const extra = pick(
          rng,
          [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((x) => !keys.includes(x)),
        );
        const ask: OpCall[] = shuffle(rng.next, [
          ['get', pick(rng, keys)],
          ['put', extra, extra * 10],
          ['get', pick(rng, keys)],
        ] as OpCall[]);
        const order = keysOf(run([...setup, ...ask]).endState()).map(String);
        return {
          prompt: `The cache holds at most 3 entries. Run ${calls(ask)}. Type the cached keys from most to least recently used.`,
          setup,
          settings: settings as Settings,
          answer: { kind: 'sequence', value: order },
          explain: `Every hit and every put moves its key to the front, and a put into a full cache evicts the key at the back. The order ends as ${order.join(', ')}.`,
          watch: ask,
        };
      },
    },
    {
      id: 'count-hits',
      title: 'How many hits?',
      make(rng) {
        const { keys, setup } = warm(rng);
        const others = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((x) => !keys.includes(x));
        const ask: OpCall[] = [];
        for (let i = 0; i < 4; i++) {
          if (rng.int(0, 2) === 0) {
            const k = pick(rng, others);
            ask.push(['put', k, k * 10]);
          } else ask.push(['get', pick(rng, [...keys, ...others])]);
        }
        if (!ask.some(([op]) => op === 'get')) ask.push(['get', pick(rng, keys)]);
        const t = run([...setup, ...ask]);
        const before = run(setup).endState();
        const hits = t.endState().hits - before.hits;
        return {
          prompt: `The cache holds at most 3 entries. Run ${calls(ask)}. How many of the gets are hits?`,
          setup,
          settings: settings as Settings,
          answer: { kind: 'number', value: hits },
          explain: `A get hits when its key is still cached at that moment. A put may evict a key that a later get needs. ${hits} of the gets hit.`,
          watch: ask,
        };
      },
    },
    {
      id: 'get-returns',
      title: 'What does get return?',
      make(rng) {
        const { keys, setup } = warm(rng);
        const others = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((x) => !keys.includes(x));
        const k = pick(rng, others);
        const ask: OpCall[] = [['put', k, k * 10]];
        const before = run(setup).endState();
        const victim = node(before, before.tail!).key;
        const target = rng.int(0, 1)
          ? victim
          : pick(
              rng,
              keys.filter((x) => x !== victim),
            );
        const t = run([...setup, ...ask, ['get', target]]);
        const returned = Number(t.entries.at(-1)!.steps.at(-1)!.vars!.returned);
        return {
          prompt: `The cache holds 3 entries and is full. Run ${call(ask[0]!)}, then \`get(${target})\`. What does the get return?`,
          setup,
          settings: settings as Settings,
          answer: { kind: 'number', value: returned },
          explain:
            returned === -1
              ? `The put evicted ${victim}, the least recently used key, so get(${target}) misses and returns −1.`
              : `The put evicted ${victim}, not ${target}, so get(${target}) hits and returns ${returned}.`,
          watch: [...ask, ['get', target]],
        };
      },
    },
  ];
}
