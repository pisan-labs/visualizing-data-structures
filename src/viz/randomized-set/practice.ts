import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { spotItKind, type SpotRow } from '../_patterns/kit';
import { list } from '../_design1/kit';
import { defaults, type RSExtra, type RSSettings, type RSState } from './model';

type Def = VizDef<RSState, RSSettings, RSExtra>;

const call = ([op, ...args]: OpCall) => `\`${op}(${args.join(', ')})\``;
const calls = (cs: OpCall[]) => cs.map(call).join(', ');

function distinct(rng: Rng, n: number): number[] {
  const out = new Set<number>();
  while (out.size < n) out.add(rng.int(1, 60));
  return [...out];
}

/** k different values of vs, in a random order. */
function pick(rng: Rng, vs: readonly number[], k: number): number[] {
  const a = [...vs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a.slice(0, k);
}

/**
 * Our own problem statements, for "spot it": three that call for an array plus an index map,
 * and some that look alike and call for another pattern.
 */
export const SPOT_ROWS: SpotRow[] = [
  {
    problem:
      'A raffle keeps a pool of ticket numbers. Tickets are added and withdrawn all day, and at any moment a winner must be drawn from the pool, every ticket equally likely, in constant time.',
    pattern: 'randomized-set',
    cue: [
      'added and withdrawn',
      'drawn from the pool, every ticket equally likely',
      'constant time',
    ],
    why: 'A random pick needs an index, so keep the tickets in an array; a withdrawal needs to find its ticket fast, so keep a map from ticket to index, and fill the hole with the last ticket.',
    near: ['lru-cache', 'frequency-counting', 'top-k'],
  },
  {
    problem:
      'A game server tracks the players online. They join and leave all the time, and every few seconds the server gives a bonus to one online player chosen at random. Each of the three must take O(1).',
    pattern: 'randomized-set',
    cue: ['join and leave', 'chosen at random', 'O(1)'],
    why: 'Join, leave and pick at random, all O(1): an array for the pick, a hash map from player to index for the leave.',
    near: ['lru-cache', 'disjoint-sets', 'two-stack-queue'],
  },
  {
    problem:
      'A music library lets you add and delete songs at any time. Its “surprise me” button plays a random song from the library, each one equally likely, without walking through the library.',
    pattern: 'randomized-set',
    cue: ['add and delete', 'a random song', 'without walking through'],
    why: 'A hash set adds and deletes fast but cannot hand over its i-th song. An array can; a map from song to index lets the array delete in O(1) too.',
    near: ['lru-cache', 'trie', 'frequency-counting'],
  },
  {
    problem:
      'A cache holds k web pages. Looking a page up and adding one must take O(1); when the cache is full, the page that has gone unused the longest is thrown out.',
    pattern: 'lru-cache',
    cue: ['unused the longest', 'O(1)'],
    why: 'The order of use matters, not a random pick: a hash map to find a page and a doubly linked list in order of use.',
    near: ['randomized-set', 'two-stack-queue'],
  },
  {
    problem:
      'A word game accepts a guess only if it uses exactly the letter tiles on your rack, in any order. Check a guess.',
    pattern: 'frequency-counting',
    cue: ['exactly the letter tiles on your rack', 'in any order'],
    why: 'Same letters, any order: count each letter in the guess and on the rack, and compare the counts.',
    near: ['randomized-set', 'two-pointers'],
  },
  {
    problem:
      'People join clubs and clubs merge. At any time, answer whether two people are in the same club.',
    pattern: 'disjoint-sets',
    cue: ['clubs merge', 'in the same club'],
    why: 'Merging groups and asking “same group?” is union-find: each club is a tree, and two people share a club when they share a root.',
    near: ['randomized-set', 'lru-cache'],
  },
  {
    problem: 'Scores stream in from a game. At any time, report the 10 highest scores so far.',
    pattern: 'top-k',
    cue: 'the 10 highest',
    why: 'The k largest of a stream: a min-heap of size 10, whose top is the smallest score still in the top 10.',
    near: ['randomized-set', 'two-heaps-median'],
  },
];

/**
 * Practice questions. Every answer comes from running the model. `def` is a getter to avoid an
 * import cycle.
 */
export function randomizedSetPractice(def: () => Def): PracticeKind[] {
  const run = (cs: OpCall[], settings: RSSettings = defaults) =>
    new Timeline(def(), settings, 1, cs);
  const inserts = (vs: number[]): OpCall[] => vs.map((v) => ['insert', v]);
  const removes = (vs: number[]): OpCall[] => vs.map((v) => ['remove', v]);

  return [
    {
      id: 'array-after',
      title: 'What does the array hold after a remove?',
      make(rng) {
        const vs = distinct(rng, rng.int(5, 7));
        const setup = inserts(vs);
        const ask = removes(pick(rng, vs, rng.int(1, 2)));
        const left = run([...setup, ...ask])
          .endState()
          .a.map((i) => String(i.value));
        return {
          prompt: `Starting from the set shown, run ${calls(ask)}. Type A afterwards, from index 0.`,
          setup,
          answer: { kind: 'sequence', value: left },
          explain: `Each remove moves the last value into the hole and drops the last slot, so nothing shifts. A ends as ${left.join(', ')}.`,
          watch: ask,
        };
      },
    },
    {
      id: 'map-after',
      title: 'Where does the map say it is?',
      make(rng) {
        const vs = distinct(rng, rng.int(5, 7));
        const setup = inserts(vs);
        // Not the last value, so the remove moves something.
        const x = pick(rng, vs.slice(0, -1), 1)[0]!;
        const ask = removes([x]);
        const end = run([...setup, ...ask]).endState();
        const moved = vs[vs.length - 1]!;
        const asked = rng.int(0, 2)
          ? moved
          : pick(
              rng,
              end.a.map((i) => i.value),
              1,
            )[0]!;
        const at = end.map.find((e) => e.key === asked)!.index;
        return {
          prompt: `Starting from the set shown, run \`remove(${x})\`. What is \`map[${asked}]\` afterwards?`,
          setup,
          answer: { kind: 'number', value: at },
          explain:
            asked === moved
              ? `${x} was at A[${vs.indexOf(x)}]. The last value, ${moved}, moves into that slot, and its entry is fixed to match: map[${moved}] = ${at}.`
              : `Only the last value moves: ${moved} goes to A[${vs.indexOf(x)}]. ${asked} stays where it was, so map[${asked}] = ${at}.`,
          watch: ask,
        };
      },
    },
    {
      id: 'random-pick',
      title: 'Which value does the draw return?',
      make(rng) {
        const vs = distinct(rng, rng.int(5, 6));
        const setup = inserts(vs);
        const ask = removes(pick(rng, vs, rng.int(1, 2)));
        const t = run([...setup, ...ask, ['random']]);
        const v = t.entries.at(-1)!.steps.at(-1)!.vars!;
        const a = t.endState().a.map((i) => i.value);
        return {
          prompt: `Starting from the set shown, run ${calls(ask)}. Then \`random()\` draws index ${v.i}. Which value does it return?`,
          setup,
          answer: { kind: 'number', value: Number(v.returned) },
          explain: `After the removes, A is ${list(a)}, from index 0: each remove moved the last value into the hole. A[${v.i}] = ${v.returned}.`,
          watch: [...ask, ['random']],
        };
      },
    },
    spotItKind({
      page: 'randomized-set',
      rows: SPOT_ROWS,
      setup: inserts([4, 7, 2, 9, 5]),
      watch: [['remove', 7], ['random']],
    }),
  ];
}
