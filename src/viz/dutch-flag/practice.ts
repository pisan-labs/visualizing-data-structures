import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { spotItKind, type SpotRow } from '../_patterns/kit';
import type { ArrayState } from '../_sorting/kit';
import {
  defaults,
  kindOf,
  outcome,
  START_P,
  type FlagExtra,
  type FlagSettings,
  type FlagStep,
} from './model';

type Def = VizDef<ArrayState, FlagSettings, FlagExtra>;

const load = (vs: number[]): OpCall => ['load', vs.join(' ')];

/** n values from 1 to 9 with the pivot among them, and some of each kind most of the time. */
function values(rng: Rng, n: number): { vs: number[]; p: number } {
  const p = rng.int(3, 7);
  const vs = Array.from({ length: n }, () => {
    const k = rng.int(0, 3);
    return k === 0 ? p : k === 1 ? rng.int(1, p - 1) : rng.int(p + 1, 9);
  });
  return { vs, p };
}

/**
 * Our own problem statements, for "spot it": three that call for a three-way partition, and
 * some that look alike and call for another pattern.
 */
export const SPOT_ROWS: SpotRow[] = [
  {
    problem:
      'A list of exam scores and a pass mark m. Rearrange the list in place so the scores below m come first, then the scores of exactly m, then the ones above m, in one pass.',
    pattern: 'dutch-flag',
    cue: ['below m', 'exactly m', 'above m', 'in place'],
    why: 'Three groups around one value, in place and in one pass: low, mid and high keep four regions and shrink the unknown one by a value each step.',
    near: ['two-pointers', 'cyclic-sort', 'frequency-counting'],
  },
  {
    problem:
      'Each order in a queue is tagged red, amber or green, and carries its own details. Group the orders so the reds come first, then the ambers, then the greens, without a second list.',
    pattern: 'dutch-flag',
    cue: ['red, amber or green', 'without a second list'],
    why: 'Three tags are three kinds. Counting the tags and writing them back would lose each order’s details, so move the orders themselves: three indices, one pass.',
    near: ['frequency-counting', 'two-pointers', 'cyclic-sort'],
  },
  {
    problem:
      'A list of whole numbers, some negative and some zero. Move the negatives to the front and the positives to the back, with the zeros between them.',
    pattern: 'dutch-flag',
    cue: ['negatives to the front', 'positives to the back', 'zeros between them'],
    why: 'That is a three-way partition around 0. The order inside each group does not matter, so the swaps of three pointers are fine.',
    near: ['two-pointers', 'sliding-window', 'kadane'],
  },
  {
    problem:
      'A shelf is a list: 0 for an empty slot, any other number for a book. Slide the books to the left, keeping the order they stand in, so the empty slots end up on the right.',
    pattern: 'two-pointers',
    cue: ['0 for an empty slot', 'keeping the order they stand in'],
    why: 'Two kinds, and the order must stay: a slow index writes each nonzero value as a fast one finds it. Three-pointer swaps would scramble the order.',
    near: ['dutch-flag', 'cyclic-sort'],
  },
  {
    problem:
      'A list of n numbers should hold each of 1 to n once, but one number came twice and so another is missing. Find both.',
    pattern: 'cyclic-sort',
    cue: ['each of 1 to n', 'one number came twice', 'another is missing'],
    why: 'Each value names its own slot, so swap each into place; the slot that ends up with the wrong value gives both answers.',
    near: ['dutch-flag', 'frequency-counting'],
    alsoFits: ['xor-tricks'],
  },
  {
    problem: 'Orders are tagged red, amber or green. How many orders of each color came in today?',
    pattern: 'frequency-counting',
    cue: 'how many orders of each color',
    why: 'Only the counts are asked for, not a new order: one pass with a count per tag.',
    near: ['dutch-flag', 'two-pointers'],
  },
];

/**
 * Practice questions. Every answer comes from running the model. `def` is a getter to avoid an
 * import cycle.
 */
export function flagPractice(def: () => Def): PracticeKind[] {
  const run = (ops: OpCall[], settings: FlagSettings = defaults) =>
    new Timeline(def(), settings, 1, ops);
  const steps = (vs: number[], p: number): FlagStep[] =>
    run([load(vs), ['partition', p]]).entries[1]!.steps;

  return [
    {
      id: 'after-t',
      title: 'The array after t steps',
      make(rng) {
        const n = rng.int(6, 8);
        const { vs, p } = values(rng, n);
        const all = steps(vs, p);
        const t = rng.int(2, Math.min(5, n - 1));
        const at = all.find((s) => s.vars?.comparisons === t && s.lines.includes('loop'))!;
        const a = at.state.a.map((x) => String(x.value));
        const v = at.vars!;
        return {
          prompt: `Run the three-pointer partition with pivot p = ${p}. What does A hold after the first ${t} steps (${t} values looked at)? Type the ${n} values in order.`,
          setup: [load(vs)],
          answer: { kind: 'sequence', value: a },
          explain: `Each step looks at A[mid]: below ${p}, swap it with A[low] and move low and mid on; above, swap it with A[high] and move high back; equal, move mid on. After ${t} steps A is ${a.join(' ')}, with low = ${v.low}, mid = ${v.mid} and high = ${v.high}.`,
          watch: [['partition', p]],
        };
      },
    },
    {
      id: 'mid-stops',
      title: 'Where does mid stop?',
      make(rng) {
        const n = rng.int(6, 9);
        const { vs, p } = values(rng, n);
        const last = steps(vs, p).at(-1)!;
        const mid = Number(last.vars?.mid);
        const below = vs.filter((v) => kindOf(v, p) === 'below').length;
        const equal = vs.filter((v) => kindOf(v, p) === 'equal').length;
        return {
          prompt: `Run the three-pointer partition with pivot p = ${p}. When the loop ends, at which index is mid?`,
          setup: [load(vs)],
          answer: { kind: 'number', value: mid },
          explain: `The loop ends when mid passes high, and mid stops on the first value above ${p}: past the ${below} below and the ${equal} equal, so mid = ${below} + ${equal} = ${mid}. In the end ${outcome(n, Number(last.vars?.low), Number(last.vars?.high), p)}.`,
          watch: [['partition', p]],
        };
      },
    },
    spotItKind({ page: 'dutch-flag', rows: SPOT_ROWS, watch: [['partition', START_P]] }),
  ];
}
