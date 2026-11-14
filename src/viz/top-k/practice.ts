import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { spotItKind, type SpotRow } from '../_patterns/kit';
import { and } from '../_heaps2/say';
import { defaults, START_K, totals, type TopExtra, type TopSettings, type TopState } from './model';

type Def = VizDef<TopState, TopSettings, TopExtra>;

const load = (vs: number[]): OpCall => ['load', vs.join(' ')];

/** n distinct values from 1 to 60, in random order: no ties, so every answer is clear. */
function distinct(rng: Rng, n: number): number[] {
  const pool = Array.from({ length: 60 }, (_, i) => i + 1);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool.slice(0, n);
}

/**
 * Our own problem statements, for "spot it": four that call for a heap of size k, and some that
 * look alike and call for another pattern.
 */
export const SPOT_ROWS: SpotRow[] = [
  {
    problem:
      'A server logs the response time of every request, millions a day. Keep the 10 slowest requests seen so far, using memory for only 10.',
    pattern: 'top-k',
    cue: ['the 10 slowest', 'memory for only 10'],
    why: 'A min-heap of the 10 slowest so far: a new time that beats the root (the fastest of them) replaces it. O(log 10) per request, and nothing else is kept.',
    near: ['two-heaps-median', 'k-way-merge', 'sliding-window'],
  },
  {
    problem: 'Given the positions of many delivery vans, find the 5 vans closest to the depot.',
    pattern: 'top-k',
    cue: 'the 5 closest',
    why: 'Keep the 5 closest so far in a max-heap by distance; a van closer than the root (the farthest of the 5) replaces it. The smallest k is the same trick with the order turned around.',
    near: ['two-pointers', 'two-heaps-median', 'binary-search'],
  },
  {
    problem:
      'Count how often each word appears in a long text, then report the 3 most frequent words.',
    pattern: 'top-k',
    cue: 'the 3 most frequent',
    why: 'Count with a hash map first; then a min-heap of 3 (count, word) pairs picks the winners in O(m log 3) for m distinct words.',
    near: ['two-heaps-median', 'k-way-merge', 'trie'],
    alsoFits: ['frequency-counting'],
  },
  {
    problem: 'Find the 4th highest score in a list of exam scores, without sorting the list.',
    pattern: 'top-k',
    cue: ['4th highest', 'without sorting'],
    why: 'The k-th largest is the root of a min-heap that keeps the k largest. Quickselect would also do it in O(n) on average.',
    near: ['two-heaps-median', 'binary-search', 'cyclic-sort'],
  },
  {
    problem:
      'Numbers arrive one at a time. After each one, report the middle value of all the numbers so far.',
    pattern: 'two-heaps-median',
    cue: ['after each one', 'the middle value'],
    why: 'The middle moves with every number. A max-heap of the low half and a min-heap of the high half keep it at their tops.',
    near: ['top-k', 'sliding-window'],
  },
  {
    problem:
      'Twelve servers each write their log lines in time order. Combine all of them into one log in time order.',
    pattern: 'k-way-merge',
    cue: ['each', 'in time order', 'combine all of them'],
    why: 'Many sorted lists into one: a min-heap of the twelve current heads hands out the earliest line each time.',
    near: ['top-k', 'merge-intervals'],
    alsoFits: ['merge-sorted-lists'],
  },
  {
    problem:
      'A list of daily rainfall. For every run of 7 consecutive days, report the wettest day of that run.',
    pattern: 'monotonic-queue',
    cue: ['every run of 7 consecutive days', 'the wettest'],
    why: 'A window that slides one day at a time: a deque of candidates gives each window’s largest in O(1) amortized, with no heap at all.',
    near: ['top-k', 'two-heaps-median'],
    alsoFits: ['sliding-window'],
  },
];

/**
 * Practice questions. Every answer comes from running the model. `def` is a getter to avoid an
 * import cycle.
 */
export function topPractice(def: () => Def): PracticeKind[] {
  const run = (ops: OpCall[], settings: TopSettings = defaults) =>
    new Timeline(def(), settings, 1, ops);

  return [
    {
      id: 'heap-after',
      title: 'The heap after step i',
      make(rng) {
        const vs = distinct(rng, rng.int(7, 9));
        const k = rng.int(3, 4);
        const i = rng.int(k + 1, vs.length - 1);
        const steps = run([load(vs), ['top', k]]).entries.at(-1)!.steps;
        const after = steps.filter((s) => s.extra?.i === i && s.level < 3).at(-1)!;
        const heap = after.extra!.heap!.map((x) => x.key);
        const out = after.extra!.out ?? [];
        const byUid = new Map(steps[0]!.state.a.map((x) => [x.uid, x.key]));
        return {
          prompt: `Run the min-heap way with k = ${k}. After A[0..${i}] have been read (and sifted), what does the heap hold? Type its array from the root on, as the tree reads level by level.`,
          setup: [load(vs)],
          answer: { kind: 'sequence', value: heap.map(String) },
          explain: `The heap keeps the ${k} largest of A[0..${i}]: ${and([...heap].sort((x, y) => y - x))}. In heap order, root first: ${heap.join(' ')}. So far ${and(out.map((u) => byUid.get(u)!))} ${out.length === 1 ? 'was' : 'were'} passed over or pushed out.`,
          watch: [['top', k]],
        };
      },
    },
    {
      id: 'cheapest',
      title: 'The cost of each approach',
      make(rng) {
        let vs: number[] = [];
        let k = 3;
        let tot = totals([], 1);
        for (let tries = 0; tries < 40; tries++) {
          const n = rng.int(8, 10);
          const shape = rng.int(0, 2);
          vs = distinct(rng, n);
          if (shape === 1) vs.sort((x, y) => x - y);
          if (shape === 2) vs.sort((x, y) => y - x);
          k = rng.int(1, 4);
          tot = totals(vs, k);
          const costs = [tot.pattern, tot.naive, tot.select].sort((x, y) => x - y);
          if (costs[0]! < costs[1]!) break;
        }
        const options = ['The min-heap of size k', 'Sorting everything', 'Quickselect'];
        const costs = [tot.pattern, tot.naive, tot.select];
        const best = costs.indexOf(Math.min(...costs));
        return {
          prompt: `With k = ${k}, which way makes the fewest comparisons on this input? (Quickselect takes the last value of each range as its pivot.)`,
          setup: [load(vs)],
          answer: { kind: 'choice', options, correct: best },
          explain: `On these ${vs.length} values the min-heap makes ${tot.pattern} comparisons, sorting everything ${tot.naive} and quickselect ${tot.select}. ${
            best === 0
              ? 'Few values beat the root, so most cost one comparison.'
              : best === 1
                ? 'Merge sort is steady; here the others were unlucky.'
                : 'Its pivots split the range well, so each partition threw a lot away.'
          }`,
          watch: [['top', k]],
        };
      },
    },
    {
      id: 'what-happens',
      title: 'What happens to the next value?',
      make(rng) {
        const vs = distinct(rng, rng.int(7, 9));
        const k = 3;
        const i = rng.int(k, vs.length - 1);
        const steps = run([load(vs), ['top', k]]).entries.at(-1)!.steps;
        const before = steps.filter((s) => s.extra?.i === i - 1 && s.level < 3).at(-1)!;
        const heap = before.extra!.heap!.map((x) => x.key);
        const root = heap[0]!;
        const x = vs[i]!;
        const biggest = Math.max(...heap);
        const options = [
          `${x} is skipped`,
          `${x} replaces the root, ${root}, and sifts down`,
          `${x} replaces the largest in the heap, ${biggest}`,
          `${x} goes in at the end, and the heap grows to ${k + 1}`,
        ];
        const wins = x > root;
        return {
          prompt: `Run the min-heap way with k = ${k}. After A[0..${i - 1}] the heap holds ${heap.join(' ')} (root first). What happens when A[${i}] = ${x} is read?`,
          setup: [load(vs)],
          answer: { kind: 'choice', options, correct: wins ? 1 : 0 },
          explain: wins
            ? `${x} > ${root}, the root and smallest of the best ${k}, so ${root} drops out and ${x} takes the root, then sinks below any smaller child. The heap never grows past k.`
            : `${x} ≤ ${root}, the root and smallest of the best ${k}, so ${x} cannot be among the ${k} largest. One comparison, and the heap does not change.`,
          watch: [['top', k]],
        };
      },
    },
    spotItKind({ page: 'top-k', rows: SPOT_ROWS, watch: [['top', START_K]] }),
  ];
}
