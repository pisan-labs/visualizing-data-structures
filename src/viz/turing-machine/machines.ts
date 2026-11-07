/**
 * The machines the examples, presets and practice questions use, written in the page's text
 * format. Each comment says how the machine works.
 */

/**
 * 0ⁿ1ⁿ by crossing off: cross off a 0 (x), find the first 1 and cross it off (y), walk back to
 * the last x, repeat. When no 0 is left, check that only y's remain.
 */
export const ZERO_ONE =
  'q0 0 -> q1 x R; q0 y -> q3 R; q0 _ -> accept R; q1 0,y -> q1 R; q1 1 -> q2 y L; q2 0,y -> q2 L; q2 x -> q0 R; q3 y -> q3 R; q3 _ -> accept R';

/**
 * Binary increment: walk right to the end, then turn trailing 1s into 0s until a 0 or a blank
 * takes the carry. On a one-way tape the carry out of 11…1 has nowhere to go.
 */
export const INCREMENT = 'q0 0,1 -> q0 R; q0 _ -> q1 L; q1 1 -> q1 0 L; q1 0,_ -> accept 1 R';

/**
 * Palindromes over {0, 1}: erase the first symbol and remember it in the state (q1 for 0, q2
 * for 1), walk to the last symbol, check that it matches and erase it, walk back, repeat.
 */
export const PALINDROME =
  'q0 0 -> q1 _ R; q0 1 -> q2 _ R; q0 _ -> accept R; q1 0,1 -> q1 R; q1 _ -> q3 L; q2 0,1 -> q2 R; q2 _ -> q4 L; q3 0 -> q5 _ L; q3 _ -> accept R; q4 1 -> q5 _ L; q4 _ -> accept R; q5 0,1 -> q5 L; q5 _ -> q0 R';

/**
 * Copy w to w#w: mark the next symbol (x for 0, y for 1), carry it past the # (writing the #
 * the first time) to the end of the copy, walk back to the mark, put the symbol back, repeat.
 */
export const COPY =
  'q0 0 -> q1 x R; q0 1 -> q2 y R; q0 # -> accept R; q0 _ -> accept # R; q1 0,1 -> q1 R; q1 # -> q3 R; q1 _ -> q3 # R; q2 0,1 -> q2 R; q2 # -> q4 R; q2 _ -> q4 # R; q3 0,1 -> q3 R; q3 _ -> q5 0 L; q4 0,1 -> q4 R; q4 _ -> q5 1 L; q5 0,1,# -> q5 L; q5 x -> q0 0 R; q5 y -> q0 1 R';

/** Unary addition: 11+111 becomes 11111. Turn the + into a 1, then erase the last 1. */
export const ADD = 'q0 1 -> q0 R; q0 + -> q1 1 R; q1 1 -> q1 R; q1 _ -> q2 L; q2 1 -> accept _ L';

/** Walks right forever: never halts and never repeats a configuration. */
export const WALK = 'q0 0,1,_ -> q0 R';

/** Flips cell 0 forever without moving (needs L/R/S moves): the configurations repeat. */
export const FLIP = 'q0 0 -> q1 1 S; q1 1 -> q0 0 S';
