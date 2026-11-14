import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { spotItKind, type SpotRow } from '../_patterns/kit';
import type { ArrayState } from '../_sorting/kit';
import { and, defaults, type CyclicExtra, type CyclicSettings, type CyclicStep } from './model';

type Def = VizDef<ArrayState, CyclicSettings, CyclicExtra>;

const load = (vs: number[]): OpCall => ['load', vs.join(' ')];

function shuffle<T>(rng: Rng, xs: readonly T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** n values from 1 to n: a shuffle of 1..n with `repeats` of them replaced by copies of others. */
export function withRepeats(rng: Rng, n: number, repeats: number): number[] {
  const vs = shuffle(
    rng,
    Array.from({ length: n }, (_, k) => k + 1),
  );
  for (let r = 0; r < repeats; r++) {
    const i = rng.int(0, n - 1);
    let j = rng.int(0, n - 1);
    if (j === i) j = (i + 1) % n;
    vs[i] = vs[j]!;
  }
  return vs;
}

/** Values with at least one number missing. */
function someMissing(rng: Rng): number[] {
  const n = rng.int(6, 8);
  for (;;) {
    const vs = withRepeats(rng, n, rng.int(1, 2));
    if (new Set(vs).size < n) return vs;
  }
}

/**
 * Our own problem statements, for "spot it": some that call for cyclic sort, and some that look
 * alike and call for another pattern.
 */
export const SPOT_ROWS: SpotRow[] = [
  {
    problem:
      'Raffle tickets numbered 1 to n were sold, and n stubs came back, but one number came back twice. Which number never came back?',
    pattern: 'cyclic-sort',
    cue: ['numbered 1 to n', 'n stubs', 'came back twice'],
    why: 'n values from 1 to n: each value names its own slot. Swap each stub home; the slot left holding the wrong number names the missing one, and what it holds is the repeat.',
    near: ['frequency-counting', 'dutch-flag', 'two-pointers'],
    alsoFits: ['xor-tricks'],
  },
  {
    problem:
      'Each of n students writes a seat number from 1 to n on a card, and some write the same number. Which numbers were written more than once? Use only a few variables of extra memory.',
    pattern: 'cyclic-sort',
    cue: ['a seat number from 1 to n', 'only a few variables of extra memory'],
    why: 'A count per number would need n counters. Instead, put each value at index value − 1; a value whose home already holds a copy is a repeat.',
    near: ['frequency-counting', 'two-pointers', 'sliding-window'],
  },
  {
    problem:
      'A box holds n slips: raffle ticket numbers, and junk such as zeros, negatives and numbers bigger than n. What is the lowest positive number not in the box? Use one pass or two, and no second list.',
    pattern: 'cyclic-sort',
    cue: ['lowest positive number not in the box', 'no second list'],
    why: 'For n values only 1 to n + 1 can be the answer. Swap each of 1 to n home, leave the others where they are, and the first slot without its own number is the answer, or n + 1 if every slot has it.',
    near: ['binary-search', 'frequency-counting', 'two-pointers'],
  },
  {
    problem:
      'Seats are numbered 1 to n, and n students sat down anywhere, one per seat. Get everyone into the seat with their own number by swapping two students at a time, with as few swaps as you can.',
    pattern: 'cyclic-sort',
    cue: ['numbered 1 to n', 'swapping two students at a time'],
    why: 'Each swap can send one student to their own seat for good, so at most n − 1 swaps: swap whoever sits in seat i to where they belong.',
    near: ['dutch-flag', 'two-pointers', 'merge-intervals'],
  },
  {
    problem:
      'A museum hands out n badges from a set numbered 0 to n, no number twice. The list of badges handed out is read-only. Which badge is still in the box? Find it in one pass.',
    pattern: 'xor-tricks',
    cue: ['read-only', 'still in the box'],
    why: 'The list cannot be changed, so no swaps. XOR every value with every number from 0 to n: the pairs cancel and the missing number is left (or subtract the sum from n(n + 1)/2).',
    near: ['cyclic-sort', 'frequency-counting'],
  },
  {
    problem:
      'A list of whole numbers and a value m. Move the values below m in front of the others, in place.',
    pattern: 'dutch-flag',
    cue: ['below m', 'in front of the others', 'in place'],
    why: 'Grouping around a value, not placing each value at its own index: a partition. The numbers are not 1 to n, so they have no homes.',
    near: ['cyclic-sort', 'sliding-window'],
    alsoFits: ['two-pointers'],
  },
  {
    problem: 'A long list of words. How many times does each word appear?',
    pattern: 'frequency-counting',
    cue: 'how many times does each word appear',
    why: 'Words have no index of their own, so count them in a hash map, one pass.',
    near: ['cyclic-sort', 'two-pointers'],
  },
];

/**
 * Practice questions. Every answer comes from running the model. `def` is a getter to avoid an
 * import cycle.
 */
export function cyclicPractice(def: () => Def): PracticeKind[] {
  const run = (vs: number[]): CyclicStep[] =>
    new Timeline(def(), defaults, 1, [load(vs), ['sort']]).entries[1]!.steps;

  return [
    {
      id: 'first-out',
      title: 'The first slot out of place',
      make(rng) {
        const vs = someMissing(rng);
        const last = run(vs).at(-1)!;
        const a = last.state.a.map((x) => x.value);
        const i = a.findIndex((v, k) => v !== k + 1);
        return {
          prompt: `Run cyclic sort on A. Afterwards, what is the first index i where A[i] ≠ i + 1?`,
          setup: [load(vs)],
          answer: { kind: 'number', value: i },
          explain: `Cyclic sort puts every value that is present at index value − 1 and leaves A = ${a.join(' ')}. The first slot that does not hold its own number is A[${i}] = ${a[i]}: so ${i + 1} is missing, and ${a[i]} is a repeat.`,
          watch: [['sort']],
        };
      },
    },
    {
      id: 'swaps',
      title: 'How many swaps?',
      make(rng) {
        const n = rng.int(5, 8);
        const vs = withRepeats(rng, n, rng.int(0, 1));
        const steps = run(vs);
        const swaps = Number(steps.at(-1)!.vars?.swaps);
        const present = new Set(vs).size;
        const home = new Set(vs.filter((v, k) => v === k + 1)).size;
        // Swaps that sent two values home: the one that came back to A[i] was home too.
        const doubles = steps.filter((s) => {
          const i = Number(s.vars?.i);
          return s.lines.includes('swap') && s.state.a[i]!.value === i + 1;
        }).length;
        const away = present - home;
        return {
          prompt: `How many swaps does cyclic sort make on A?`,
          setup: [load(vs)],
          answer: { kind: 'number', value: swaps },
          explain: `${present} different values are present and ${home} of them start at home, so ${away} must be sent home; a value that is home never moves again. Each swap sends one home${
            doubles
              ? `, and ${doubles === 1 ? 'one swap' : `${doubles} swaps`} sent two at once (the value that came back to A[i] was home too): ${away} − ${doubles} = ${swaps}.`
              : `, so that is ${swaps} ${swaps === 1 ? 'swap' : 'swaps'}.`
          }`,
          watch: [['sort']],
        };
      },
    },
    {
      id: 'missing',
      title: 'What is missing?',
      make(rng) {
        const vs = someMissing(rng);
        const last = run(vs).at(-1)!;
        const missing = String(last.vars?.missing).split(' ');
        const a = last.state.a.map((x) => x.value);
        return {
          prompt: `A holds ${vs.length} numbers, each from 1 to ${vs.length}. Which numbers are missing? Type them in increasing order.`,
          setup: [load(vs)],
          answer: { kind: 'sequence', value: missing },
          explain: `After cyclic sort A = ${a.join(' ')}. The slots that do not hold their own number are the ones for ${and(missing)}, so ${missing.length === 1 ? 'that number is' : 'those are'} missing.`,
          watch: [['sort']],
        };
      },
    },
    spotItKind({ page: 'cyclic-sort', rows: SPOT_ROWS, watch: [['sort']] }),
  ];
}
