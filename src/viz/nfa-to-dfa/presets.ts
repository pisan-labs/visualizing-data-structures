/**
 * NFAs for presets, practice and tests. States are q0, q1, ... and the alphabet is {a, b} or
 * {0, 1}.
 *
 *   nthFromEnd(n)            the n-th symbol from the end is 1: n + 1 states, a DFA of 2^n
 *   endsWith(word)           words that end in `word`: the DFA is about as small as the NFA
 *   randomNfa(rng, n, opts)  n states, some ε-moves, a DFA of at most `maxDfa` states
 *   loadCall(a)              the load operation for an automaton
 */
import type { Rng } from '../../engine/rng';
import type { OpCall } from '../../engine/types';
import {
  EPS,
  makeAutomaton,
  subsetConstruction,
  type Automaton,
  type Move,
} from '../_automata/automaton';
import { formatAutomaton } from '../_automata/parse';

const q = (i: number) => `q${i}`;

export const loadCall = (a: Automaton): OpCall => ['load', formatAutomaton(a)];

export function nthFromEnd(n: number): Automaton {
  const moves: Move[] = [
    { from: q(0), on: '0', to: q(0) },
    { from: q(0), on: '1', to: q(0) },
    { from: q(0), on: '1', to: q(1) },
  ];
  for (let i = 1; i < n; i++)
    for (const on of ['0', '1']) moves.push({ from: q(i), on, to: q(i + 1) });
  return makeAutomaton({ states: [], alphabet: [], start: q(0), accept: [q(n)], moves });
}

export function endsWith(word: string): Automaton {
  const moves: Move[] = [
    { from: q(0), on: 'a', to: q(0) },
    { from: q(0), on: 'b', to: q(0) },
  ];
  [...word].forEach((c, i) => moves.push({ from: q(i), on: c, to: q(i + 1) }));
  return makeAutomaton({
    states: [],
    alphabet: [],
    start: q(0),
    accept: [q(word.length)],
    moves,
  });
}

export function randomWord(rng: Rng, n: number): string {
  return Array.from({ length: n }, () => (rng.int(0, 1) ? 'b' : 'a')).join('');
}

export interface RandomOptions {
  /** Chance of an ε-move per state, from 0 to 1. Default 0.35. */
  eps?: number;
  /** The most DFA states allowed. Default 16. */
  maxDfa?: number;
  /** The fewest DFA states wanted. Default 2. */
  minDfa?: number;
}

/**
 * A random NFA over {a, b}: every state has a move or two, some have ε-moves, and one or two
 * states accept. Retried until its DFA has between minDfa and maxDfa states and the NFA really
 * is nondeterministic.
 */
export function randomNfa(rng: Rng, n: number, o: RandomOptions = {}): Automaton {
  const eps = o.eps ?? 0.35;
  for (let tries = 0; ; tries++) {
    const moves: Move[] = [];
    for (let i = 0; i < n; i++) {
      for (const on of ['a', 'b'])
        if (rng.next() < 0.7) moves.push({ from: q(i), on, to: q(rng.int(0, n - 1)) });
      if (rng.next() < 0.3) moves.push({ from: q(i), on: 'a', to: q(rng.int(0, n - 1)) });
      if (i < n - 1 && rng.next() < 0.6)
        moves.push({ from: q(i), on: rng.int(0, 1) ? 'b' : 'a', to: q(i + 1) });
      if (rng.next() < eps) {
        const to = rng.int(0, n - 1);
        if (to !== i) moves.push({ from: q(i), on: EPS, to: q(to) });
      }
    }
    const accept = [q(n - 1), ...(rng.int(0, 3) === 0 ? [q(rng.int(0, n - 2))] : [])];
    const a = makeAutomaton({
      states: Array.from({ length: n }, (_, i) => q(i)),
      alphabet: ['a', 'b'],
      start: q(0),
      accept,
      moves,
    });
    const k = subsetConstruction(a).dfa.states.length;
    const nondet =
      a.moves.some((m) => m.on === EPS) ||
      a.moves.some((m, i) => a.moves.some((x, j) => j < i && x.from === m.from && x.on === m.on));
    const ok = k <= (o.maxDfa ?? 16) && k >= (o.minDfa ?? 2) && nondet;
    if (ok || tries > 200) return a;
  }
}
