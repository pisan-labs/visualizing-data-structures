/**
 * The NFAs the examples, presets and tests use, in the page's text format. Each one is checked
 * against the language it is meant to accept in nfa.test.ts.
 */
import { START_TEXT } from './model';

export const MACHINES = {
  /** Binary words that end in 01 (the starting machine): q0 guesses where the 01 starts. */
  endsIn01: START_TEXT,
  /** The third symbol from the end is 1: guess which 1 it is, then count two more. */
  thirdFromEnd: 'start q0; accept q3; q0 0,1 -> q0; q0 1 -> q1; q1 0,1 -> q2; q2 0,1 -> q3',
  /**
   * Exactly a or b, built the way Thompson's construction builds a|b: ε-moves from q0 into the
   * a part (q1, q2) and the b part (q3, q4), and from both into q5.
   */
  aOrB: 'start q0; accept q5; q0 eps -> q1; q0 eps -> q3; q1 a -> q2; q3 b -> q4; q2 eps -> q5; q4 eps -> q5',
  /** Contains 11 or 101: guess where it starts; the ε-move skips the 0 of 101. */
  has11or101:
    'start q1; accept q4; q1 0,1 -> q1; q1 1 -> q2; q2 0,eps -> q3; q3 1 -> q4; q4 0,1 -> q4',
  /** Ends in a, with an ε-loop between q0 and q1 that the closure goes round once. */
  epsLoop: 'start q0; accept q2; q0 eps -> q1; q1 eps -> q0; q0 b -> q0; q1 a -> q2; q2 eps -> q0',
  /** Only a's or only b's (ε included): an ε-move into each half. */
  aStarOrBStar: 'start q0; accept q1 q2; q0 eps -> q1; q0 eps -> q2; q1 a -> q1; q2 b -> q2',
  /** One or more a's, where every a splits each branch in two. */
  doubling: 'start q0; accept q1; q0 a -> q0; q0 a -> q1; q1 a -> q0; q1 a -> q1',
} as const;
