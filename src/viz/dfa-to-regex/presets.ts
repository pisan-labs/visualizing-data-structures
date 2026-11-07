/**
 * DFAs for presets, practice and tests. States are q0, q1, ... with q0 the start; the alphabet
 * is {a, b}.
 *
 *   randomFit(rng, n, { partial })  a random DFA whose conversion fits the page in every setting
 *   endsWith(w)                     "ends with w": the pattern-matching DFA, no dead state
 *   startsWith(w)                   "starts with w": a chain, and a dead state for a wrong symbol
 *   countA(n)                       "the number of a's is a multiple of n": a cycle
 *   loadCall(dfa)                   the Load call for a DFA
 */
import type { Rng } from '../../engine/rng';
import type { OpCall } from '../../engine/types';
import { makeAutomaton, type Automaton, type Move } from '../_automata/automaton';
import { formatAutomaton } from '../_automata/parse';
import { randomDfa } from '../_automata/random';
import { MAX_TEXT, defaults, dry, loadCheck, type DrSettings } from './model';

const q = (i: number) => `q${i}`;
const AB = ['a', 'b'];

export const loadCall = (dfa: Automaton): OpCall => ['load', formatAutomaton(dfa)];

/** Does the conversion fit the page in every setting (or in these)? */
export function fits(dfa: Automaton, settings?: DrSettings[]): boolean {
  if (loadCheck(dfa)) return false;
  const all: DrSettings[] = settings ?? [
    defaults,
    { order: 'fewest', simplify: 'identities' },
    { order: 'name', simplify: 'none' },
    { order: 'fewest', simplify: 'none' },
  ];
  return all.every((s) => dry(dfa, s).maxText <= MAX_TEXT);
}

/**
 * A random DFA of n states over {a, b} (some moves missing when `partial`), drawn again until
 * its conversion fits the page in every setting. Larger DFAs rarely fit without simplification,
 * so after a few tries it settles for one that fits with the defaults.
 */
export function randomFit(
  rng: Rng,
  n: number,
  { partial = false, settings }: { partial?: boolean; settings?: DrSettings[] } = {},
): Automaton {
  let fallback: Automaton | undefined;
  for (let i = 0; i < 200; i++) {
    const dfa = randomDfa(rng, n, { alphabet: AB, partial });
    if (dfa.accept.length === 0) continue;
    if (fits(dfa, settings)) return dfa;
    if (!fallback && fits(dfa, [defaults])) fallback = dfa;
    if (fallback && i >= 20 && !settings) return fallback;
  }
  return fallback ?? startsWith('ab');
}

/** Words that end with w: state i means the last i symbols read are w's first i. */
export function endsWith(w: string): Automaton {
  const n = w.length;
  const moves: Move[] = [];
  for (let i = 0; i <= n; i++)
    for (const c of AB) {
      // The longest prefix of w that ends the text w[0..i) + c.
      const text = w.slice(0, i) + c;
      let k = Math.min(n, text.length);
      while (k > 0 && !text.endsWith(w.slice(0, k))) k--;
      moves.push({ from: q(i), on: c, to: q(k) });
    }
  return makeAutomaton({ states: [], alphabet: AB, start: q(0), accept: [q(n)], moves });
}

/** Words that start with w: a chain of states, then a state that loops; a wrong symbol goes to
 * the dead state d, which no word leaves. */
export function startsWith(w: string): Automaton {
  const n = w.length;
  const moves: Move[] = [];
  for (let i = 0; i < n; i++)
    for (const c of AB) moves.push({ from: q(i), on: c, to: c === w[i] ? q(i + 1) : 'd' });
  for (const c of AB) moves.push({ from: q(n), on: c, to: q(n) }, { from: 'd', on: c, to: 'd' });
  return makeAutomaton({ states: [], alphabet: AB, start: q(0), accept: [q(n)], moves });
}

/** The number of a's is a multiple of n: a cycle on a, with a loop on b at every state. */
export function countA(n: number): Automaton {
  const moves: Move[] = [];
  for (let i = 0; i < n; i++)
    moves.push({ from: q(i), on: 'a', to: q((i + 1) % n) }, { from: q(i), on: 'b', to: q(i) });
  return makeAutomaton({ states: [], alphabet: AB, start: q(0), accept: [q(0)], moves });
}
