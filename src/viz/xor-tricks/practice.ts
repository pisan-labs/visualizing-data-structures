import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { spotItKind, type SpotRow } from '../_patterns/kit';
import { listFor } from './lists';
import { bin, defaults, type XExtra, type XSettings, type XState } from './model';

type Def = VizDef<XState, XSettings, XExtra>;

const load = (vs: number[]): OpCall => ['load', vs.join(' ')];

/**
 * Our own problem statements, for "spot it": three that call for XOR, and some that look alike
 * and call for another pattern.
 */
export const SPOT_ROWS: SpotRow[] = [
  {
    problem:
      'Every sock in a drawer has a twin with the same number, except one. Find its number using only a few variables, however many socks there are.',
    pattern: 'xor-tricks',
    cue: ['has a twin', 'except one', 'only a few variables'],
    why: 'XOR all the numbers: each twin cancels its partner (x ^ x = 0), and the odd one out is what is left.',
    near: ['frequency-counting', 'two-pointers', 'cyclic-sort'],
  },
  {
    problem:
      'A list holds n different ticket numbers from 0 to n, so one number in that range was never handed out. Which one, in one pass and constant extra space?',
    pattern: 'xor-tricks',
    cue: ['n different', 'from 0 to n', 'one number', 'constant extra space'],
    why: 'XOR every index, n and every value: each number that is there appears twice and cancels, so the missing one is left.',
    near: ['binary-search', 'prefix-sum-hashmap', 'frequency-counting'],
    alsoFits: ['cyclic-sort'],
  },
  {
    problem:
      'In a log of user ids, every id appears exactly twice except two ids that appear once. Find both without a hash map.',
    pattern: 'xor-tricks',
    cue: ['exactly twice', 'except two', 'without a hash map'],
    why: 'XOR everything to get a ^ b, split the ids by its lowest 1 bit, and XOR each group: each group holds one of the two.',
    near: ['frequency-counting', 'two-pointers', 'disjoint-sets'],
  },
  {
    problem:
      'A sensor sends every reading three times, to be safe. One reading got through only once. Find it with a few variables.',
    pattern: 'bitmask',
    cue: ['three times', 'only once'],
    why: 'XOR cancels pairs, not triples. Count the 1s in each bit position mod 3 instead: the bits left over are the single.',
    near: ['xor-tricks', 'frequency-counting', 'cyclic-sort'],
  },
  {
    problem:
      'A coat check has n hooks, numbered 1 to n, and handed out n + 1 tickets, so one hook number went out twice. The ticket list is read-only. Find that hook with a few variables.',
    pattern: 'floyd-cycle',
    cue: ['n + 1 tickets', 'numbered 1 to n', 'read-only'],
    why: 'Read each value as a pointer to an index: the repeat is where two pointers lead to the same place, the start of a cycle.',
    near: ['xor-tricks', 'two-pointers', 'prefix-sum-hashmap'],
    alsoFits: ['binary-search'],
  },
  {
    problem:
      'A word game lists the words players typed. Sort them into piles, each pile holding words made of the same letters in some order.',
    pattern: 'frequency-counting',
    cue: ['piles', 'the same letters in some order'],
    why: 'Two words are anagrams when their letter counts match, so the counts are the key. XOR of the letters cannot tell "aab" from "b".',
    near: ['xor-tricks', 'trie', 'sliding-window'],
  },
];

/**
 * Practice questions. Every answer comes from running the model. `def` is a getter to avoid an
 * import cycle.
 */
export function xorPractice(def: () => Def): PracticeKind[] {
  const run = (ops: OpCall[], settings: XSettings) => new Timeline(def(), settings, 1, ops);

  return [
    {
      id: 'running-xor',
      title: 'The running XOR',
      make(rng) {
        const vs = listFor(rng, 'single', rng.int(5, 9));
        const i = rng.int(1, vs.length - 2);
        const steps = run([load(vs), ['find']], defaults).entries.at(-1)!.steps;
        const at = steps.find((s) => s.lines.includes('xor') && s.vars?.i === i)!;
        const acc = Number(at.vars?.acc);
        const bits = at.extra!.bits;
        const upto = vs.slice(0, i + 1);
        return {
          prompt: `A = ${vs.join(' ')}. Start with acc = 0 and XOR in A[0], A[1], and so on. What is acc after A[${i}]?`,
          setup: [load(vs)],
          answer: { kind: 'number', value: acc },
          explain: `${upto.join(' ^ ')} = ${acc}. Any value that has come in twice so far has cancelled; in binary the answer is ${bin(acc, bits)}.`,
          watch: [['find']],
        };
      },
    },
    {
      id: 'group',
      title: 'Which group?',
      make(rng) {
        const settings: XSettings = { ...defaults, goal: 'two' };
        const vs = listFor(rng, 'two', rng.int(6, 8));
        const steps = run([load(vs), ['find']], settings).entries.at(-1)!.steps;
        const i = rng.int(0, vs.length - 1);
        const at = steps.find((s) => s.extra?.group !== undefined && s.vars?.i === i)!;
        const x = Number(at.vars?.x);
        const low = Number(at.vars?.low);
        const bits = at.extra!.bits;
        const v = vs[i]!;
        const k = at.extra!.group!;
        const options = [`Group 0: v & low is 0`, `Group 1: v & low is not 0`];
        return {
          prompt: `A = ${vs.join(' ')}. XOR of everything is x = ${x} = ${bin(x, bits)}, so low = x & −x = ${low}. Values with that bit go to group 1, the others to group 0. Which group does A[${i}] = ${v} go to?`,
          setup: [load(vs)],
          settings,
          answer: { kind: 'choice', options, correct: k },
          explain: `${v} = ${bin(v, bits)} and low = ${bin(low, bits)}: ${v} & ${low} = ${v & low}, so group ${k}. Both copies of a pair always land in the same group.`,
          watch: [['find']],
        };
      },
    },
    spotItKind({ page: 'xor-tricks', rows: SPOT_ROWS, watch: [['find']] }),
  ];
}
