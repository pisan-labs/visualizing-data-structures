/**
 * The pushdown automata the examples, presets, practice and tests use, in the page's text
 * format. Each one is checked against the language it is meant to accept in pda.test.ts.
 */
export const MACHINES = {
  /**
   * aⁿbⁿ (n ≥ 0), as Sipser builds it: push $, push an a for every a, pop an a for every b,
   * and accept once $ comes back to the top. Deterministic.
   */
  anbn: 'start q0; accept q0 q3; q0 eps, eps -> q1 $; q1 a, eps -> q1 a; q1 b, a -> q2 eps; q2 b, a -> q2 eps; q2 eps, $ -> q3 eps',
  /**
   * Even-length palindromes over {a, b} (w followed by w reversed): push the first half,
   * guess the middle with an ε-move, then pop one matching symbol per symbol read.
   */
  palindromes:
    'start q0; accept q0 q3; q0 eps, eps -> q1 $; q1 a, eps -> q1 a; q1 b, eps -> q1 b; q1 eps, eps -> q2 eps; q2 a, a -> q2 eps; q2 b, b -> q2 eps; q2 eps, $ -> q3 eps',
  /**
   * Balanced parentheses: q1 means "nothing open" and accepts; q2 means "some open", with one
   * ( on the stack per open parenthesis. Deterministic: each move pops what it expects.
   */
  parens:
    'start q0; accept q1; q0 eps, eps -> q1 $; q1 (, $ -> q2 ($; q2 (, ( -> q2 ((; q2 ), ( -> q2 eps; q2 eps, $ -> q1 $',
  /**
   * Sipser's construction from the grammar S → aSb | ε: push S$, then in q1 either replace
   * the variable on top by a right-hand side or match a terminal on top with the input.
   */
  grammar:
    'start q0; accept q2; q0 eps, eps -> q1 S$; q1 eps, S -> q1 aSb; q1 eps, S -> q1 eps; q1 a, a -> q1 eps; q1 b, b -> q1 eps; q1 eps, $ -> q2 eps',
  /**
   * The same grammar with one state, accepting by empty stack (Hopcroft and Ullman): the stack
   * starts as S, and the word is accepted when the stack is empty at its end.
   */
  emptyStack:
    'start q0; stack S; q0 eps, S -> q0 aSb; q0 eps, S -> q0 eps; q0 a, a -> q0 eps; q0 b, b -> q0 eps',
  /**
   * The grammar S → Sa | b (b followed by any number of a's), built the same way. S → Sa keeps
   * S on top, so ε-moves can push forever: on a word outside the language the search never
   * runs out of new configurations, and only the cap stops it.
   */
  leftRecursion:
    'start q0; accept q2; q0 eps, eps -> q1 S$; q1 eps, S -> q1 Sa; q1 eps, S -> q1 b; q1 a, a -> q1 eps; q1 b, b -> q1 eps; q1 eps, $ -> q2 eps',
  /** Equal numbers of a's and b's, in any order: the stack holds the surplus. Deterministic. */
  equal:
    'start q0; accept q1; q0 eps, eps -> q1 $; q1 a, $ -> q2 a$; q1 b, $ -> q3 b$; q2 a, a -> q2 aa; q2 b, a -> q2 eps; q2 eps, $ -> q1 $; q3 b, b -> q3 bb; q3 a, b -> q3 eps; q3 eps, $ -> q1 $',
} as const;

export type MachineName = keyof typeof MACHINES;
