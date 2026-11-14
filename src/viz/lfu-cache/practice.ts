import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, Settings, VizDef } from '../../engine/types';
import { shuffle } from '../_hashing/hashing';
import { spotItKind, type SpotRow } from '../_patterns/kit';
import {
  defaults,
  listsText,
  lookup,
  node,
  times,
  victim,
  type LfuExtra,
  type LfuSettings,
  type LfuState,
} from './model';

type Def = VizDef<LfuState, LfuSettings, LfuExtra>;

const call = ([op, ...args]: OpCall) => `\`${op}(${args.join(', ')})\``;
const calls = (cs: OpCall[]) => cs.map(call).join(', ');
const pick = <X>(rng: Rng, xs: X[]): X => xs[rng.int(0, xs.length - 1)]!;
const KEYS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

/** Our own problem statements, for "spot it". */
export const SPOT_ROWS: SpotRow[] = [
  {
    problem:
      'A cache of the 500 most popular product pages. When it is full, drop the page asked for the fewest times; between two asked for equally often, the one unused longer. Every call must be O(1).',
    pattern: 'lfu-cache',
    cue: ['the fewest times', 'equally often, the one unused longer', 'O(1)'],
    why: 'Evicting by count, with recency breaking ties, is LFU. A list per count, least recent first, and the smallest count in use make every call O(1).',
    near: ['lru-cache', 'top-k', 'two-heaps-median'],
  },
  {
    problem:
      'A font renderer caches glyphs. Glyphs drawn all the time should survive a burst of rare ones, so evict by how often a glyph was drawn, not by how recently.',
    pattern: 'lfu-cache',
    cue: ['survive a burst of rare ones', 'how often, not how recently'],
    why: 'A burst of one-off keys flushes an LRU cache, but each of them has been used once, so LFU evicts them first and keeps the busy ones.',
    near: ['lru-cache', 'frequency-counting', 'top-k'],
  },
  {
    problem:
      'A phone keeps the 20 apps opened most recently in memory and closes the one opened longest ago when a new one starts.',
    pattern: 'lru-cache',
    cue: 'opened longest ago',
    why: 'Recency alone decides, so a map plus one list in order of use is enough: no counts.',
    near: ['lfu-cache', 'two-stack-queue'],
  },
  {
    problem: 'After a day of searches, list the 10 words searched for most often.',
    pattern: 'top-k',
    cue: ['after a day', 'the 10 words searched most often'],
    why: 'Nothing is evicted along the way: count everything, then keep the 10 largest counts in a min-heap of size 10.',
    near: ['lfu-cache', 'lru-cache'],
    alsoFits: ['frequency-counting'],
  },
  {
    problem:
      'Keep a set of user ids with add, remove and "pick one at random", each in O(1) on average.',
    pattern: 'randomized-set',
    cue: ['pick one at random', 'O(1)'],
    why: 'A random pick needs an array; removing in O(1) needs a map from value to index, and a swap with the last element.',
    near: ['lfu-cache', 'lru-cache'],
  },
  {
    problem:
      'A stack of numbers that can also tell you its smallest element at any moment, in O(1).',
    pattern: 'min-stack',
    cue: ['a stack', 'its smallest element at any moment'],
    why: 'A second stack of minimums, pushed and popped with the first, keeps the answer on top.',
    near: ['lfu-cache', 'two-heaps-median', 'monotonic-stack'],
  },
];

/** A full cache of 3: three puts of different keys, then a few gets to spread the counts. */
function warm(rng: Rng): { keys: number[]; setup: OpCall[] } {
  const keys = shuffle(rng.next, KEYS).slice(0, 3);
  const setup: OpCall[] = keys.map((k) => ['put', k, k * 10]);
  for (let i = rng.int(2, 4); i > 0; i--) setup.push(['get', pick(rng, keys)]);
  return { keys, setup };
}

/**
 * Practice for the LFU cache. Every answer comes from running the model. `def` is a getter to
 * avoid an import cycle.
 */
export function lfuPractice(def: () => Def): PracticeKind[] {
  const settings: LfuSettings = { ...defaults, capacity: 3 };
  const run = (cs: OpCall[]) => new Timeline(def(), settings, 1, cs);

  return [
    {
      id: 'evicts-next',
      title: 'Which key is evicted?',
      make(rng) {
        const { keys, setup } = warm(rng);
        const k = pick(
          rng,
          KEYS.filter((x) => !keys.includes(x)),
        );
        const before = run(setup).endState();
        const y = victim(before)!;
        const options = shuffle(rng.next, keys.map(String));
        const counts = keys
          .map((key) => {
            const n = node(before, lookup(before, key)!);
            return `${key} used ${times(n.freq)}`;
          })
          .join(', ');
        return {
          prompt: `The cache holds 3 entries and is full. Which key does \`put(${k}, ${k * 10})\` evict?`,
          setup,
          settings: settings as Settings,
          answer: { kind: 'choice', options, correct: options.indexOf(String(y.key)) },
          explain: `Evict the head of the list for the smallest frequency. The counts are ${counts}, and the lists, least recent first, are ${listsText(before)}. So ${y.key} goes.`,
          watch: [['put', k, k * 10]],
        };
      },
    },
    {
      id: 'frequency-after',
      title: 'A key’s frequency',
      make(rng) {
        const { keys, setup } = warm(rng);
        const others = KEYS.filter((x) => !keys.includes(x));
        const ask: OpCall[] = [];
        for (let i = rng.int(3, 4); i > 0; i--)
          ask.push(
            rng.int(0, 3) === 0
              ? ['put', pick(rng, others), rng.int(10, 99)]
              : ['get', pick(rng, keys)],
          );
        const end = run([...setup, ...ask]).endState();
        const present = keys.filter((key) => lookup(end, key) !== null);
        const key = pick(rng, present.length ? present : [Number(end.nodes[0]!.key)]);
        const freq = node(end, lookup(end, key)!).freq;
        return {
          prompt: `The cache holds at most 3 entries; a put and every hit count as a use. Run ${calls(ask)}. How many times has ${key} been used then?`,
          setup,
          settings: settings as Settings,
          answer: { kind: 'number', value: freq },
          explain: `${key} sits in the freq-${freq} list at the end: the lists are ${listsText(end)}. A miss does not count, and a key that is evicted and put back starts again at 1.`,
          watch: ask,
        };
      },
    },
    {
      id: 'min-after',
      title: 'minFreq after the operations',
      make(rng) {
        const { keys, setup } = warm(rng);
        const others = KEYS.filter((x) => !keys.includes(x));
        const ask: OpCall[] = [];
        for (let i = rng.int(2, 4); i > 0; i--)
          ask.push(rng.int(0, 4) === 0 ? ['put', pick(rng, others), 50] : ['get', pick(rng, keys)]);
        const end = run([...setup, ...ask]).endState();
        return {
          prompt: `The cache holds at most 3 entries. Run ${calls(ask)}. What is minFreq then, the smallest frequency in use?`,
          setup,
          settings: settings as Settings,
          answer: { kind: 'number', value: end.minFreq },
          explain: `The lists end as ${listsText(end)}, so minFreq = ${end.minFreq}. A new key always sets it back to 1; a hit moves it up only when it empties the smallest list.`,
          watch: ask,
        };
      },
    },
    spotItKind({
      page: 'lfu-cache',
      rows: SPOT_ROWS,
      setup: [
        ['put', 1, 10],
        ['put', 2, 20],
        ['put', 3, 30],
        ['get', 1],
      ],
      settings: settings as Settings,
      watch: [['put', 4, 40]],
    }),
  ];
}
