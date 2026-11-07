/**
 * The DFAs the examples, presets and tests use, in the page's text format. Each one is checked
 * against the language it is meant to accept in dfa.test.ts.
 */
import { START_TEXT } from './model';

export const MACHINES = {
  /** Binary words that end in 01 (the starting machine). */
  endsIn01: START_TEXT,
  /** Binary numbers divisible by 3: state r is the remainder so far, and a bit b takes r to 2r + b. */
  div3: 'start r0; accept r0; r0 0 -> r0; r0 1 -> r1; r1 0 -> r2; r1 1 -> r0; r2 0 -> r1; r2 1 -> r2',
  /** An even number of a's and an even number of b's: e or o for each letter. */
  evenEven:
    'start ee; accept ee; ee a -> oe; ee b -> eo; oe a -> ee; oe b -> oo; eo a -> oo; eo b -> ee; oo a -> eo; oo b -> oe',
  /** Words that start with ab, with the moves that lead nowhere left out. */
  startsAb: 'start q0; accept q2; q0 a -> q1; q1 b -> q2; q2 a,b -> q2',
  /** Words that end in ab. */
  endsAb:
    'start q0; accept q2; q0 a -> q1; q0 b -> q0; q1 a -> q1; q1 b -> q2; q2 a -> q1; q2 b -> q0',
  /** Meant to accept the words that end in ab, but after aa it forgets the a (q1 a -> q0). */
  endsAbBug:
    'start q0; accept q2; q0 a -> q1; q0 b -> q0; q1 a -> q0; q1 b -> q2; q2 a -> q1; q2 b -> q0',
} as const;
