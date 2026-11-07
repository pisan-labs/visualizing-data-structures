/**
 * The machines the examples, presets and practice questions use, in the page's text format.
 * Each comment says how the machine works. The tapes are infinite to the right only, so a
 * machine that must find a tape's left end again writes $ in its first cell (Sipser's trick of
 * marking the left end) and starts that tape's work in cell 1.
 */

/**
 * w=w with two tapes: mark tape 2's left end with $, copy the word before = onto tape 2, rewind
 * tape 2 to the $, then compare it with the word after =, both heads moving right. About 3n
 * moves for n symbols. (Sipser writes this language w#w; here # belongs to the simulation.)
 */
export const COPY_COMPARE = [
  'mark 0|1|=,_ -> copy -,$ S,R',
  'copy 0,_ -> copy 0,0 R,R',
  'copy 1,_ -> copy 1,1 R,R',
  'copy =,_ -> back S,L',
  'back =,0|1 -> back S,L',
  'back =,$ -> check R,R',
  'check 0,0 -> check R,R',
  'check 1,1 -> check R,R',
  'check _,_ -> accept S,S',
].join('; ');

/**
 * Palindromes over {0, 1} with two tapes: mark tape 2 with $, copy the word, rewind tape 2 to
 * the $ while tape 1 waits on the last symbol, then read tape 1 backwards against tape 2
 * forwards. About 3n moves, where one tape needs about n²/2.
 */
export const PALINDROME = [
  'mark 0|1,_ -> copy -,$ S,R',
  'mark _,_ -> accept S,S',
  'copy 0,_ -> copy 0,0 R,R',
  'copy 1,_ -> copy 1,1 R,R',
  'copy _,_ -> back L,L',
  'back 0|1,0|1 -> back S,L',
  'back 0|1,$ -> check S,R',
  'check 0,0 -> check L,R',
  'check 1,1 -> check L,R',
  'check 0|1,_ -> accept S,S',
].join('; ');

/**
 * Binary addition with two input tapes and the sum on tape 3: "101,011" adds 101 and 011. The
 * numbers have the same number of bits (pad with 0s). Tape 3 gets a c in its first cell (the
 * carry's column) while the heads walk to the right end; then the heads add right to left,
 * keeping the carry in the state (add or carry), and the last move writes the carry over the c.
 */
export const ADD = [
  'mark 0|1,0|1,_ -> walk -,-,c R,R,R',
  'walk 0|1,0|1,_ -> walk R,R,R',
  'walk _,_,_ -> add L,L,S',
  'add 0,0,_ -> add -,-,0 L,L,L',
  'add 0,1,_ -> add -,-,1 L,L,L',
  'add 1,0,_ -> add -,-,1 L,L,L',
  'add 1,1,_ -> carry -,-,0 L,L,L',
  'carry 0,0,_ -> add -,-,1 L,L,L',
  'carry 0,1,_ -> carry -,-,0 L,L,L',
  'carry 1,0,_ -> carry -,-,0 L,L,L',
  'carry 1,1,_ -> carry -,-,1 L,L,L',
  'add 0|1,0|1,c -> accept -,-,0 S,S,S',
  'carry 0|1,0|1,c -> accept -,-,1 S,S,S',
].join('; ');

/**
 * Unary multiplication with three tapes: 11*111 leaves 111111 on tape 3. Copy the first number
 * onto tape 2 (after a $), then for each of its 1s (tape 2 walking left to the $) sweep tape 1
 * across the second number, writing a 1 on tape 3 for each of its 1s. The sweeps go right and
 * left in turn, so the head never walks back for nothing.
 */
export const MULTIPLY = [
  'mark 1|*,_,_ -> copy -,$,- S,R,S',
  'copy 1,_,_ -> copy 1,1,_ R,R,S',
  'copy *,_,_ -> right R,L,S',
  'right 1,1,_ -> right -,-,1 R,S,R',
  'right _,1,_ -> left L,L,S',
  'left 1,1,_ -> left -,-,1 L,S,R',
  'left *,1,_ -> right R,L,S',
  'right 1|_,$,_ -> accept S,S,S',
  'left 1|*,$,_ -> accept S,S,S',
].join('; ');

/**
 * Both heads walk right forever. Every move takes both heads onto new cells, so the simulation
 * shifts its tape twice a move: the worst case for one tape.
 */
export const WALK = 'walk 0|1|_,_ -> walk R,R';
