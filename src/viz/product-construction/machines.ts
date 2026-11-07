/**
 * Machines for the start, presets, examples, practice and tests. A's states are p0, p1, ...
 * and B's are q0, q1, ..., so a pair (p, q) says which machine each half comes from.
 *
 *   MACHINES          named DFAs in the text format, each with what it accepts
 *   pairText(a, b)    the input box's text for two machines: "A | B"
 *   loadPair(a, b)    the Load call for two automata
 *   rename(a, from, to)        a machine with its state names' first letter changed
 *   randomPair(rng, o)         two random DFAs whose product fits the page's limits
 */
import type { Rng } from '../../engine/rng';
import type { OpCall } from '../../engine/types';
import { makeAutomaton, type Automaton } from '../_automata/automaton';
import { formatAutomaton, parseAutomaton } from '../_automata/parse';
import { randomDfa } from '../_automata/random';
import { full, productOf } from './product';

/** The most states each machine may have once completed, so the grid of pairs fits a phone. */
export const MAX_SIDE = 4;
/** The most pairs the product may reach (MAX_STATES in the automaton model). */
export const MAX_PAIRS = 12;

export const MACHINES = {
  /** An even number of a's. */
  evenA: 'start p0; accept p0; p0 a -> p1; p1 a -> p0; p0 b -> p0; p1 b -> p1',
  /** Contains aa. */
  hasAa: 'start p0; accept p2; p0 a -> p1; p0 b -> p0; p1 a -> p2; p1 b -> p0; p2 a,b -> p2',
  /** Starts with a; p0 has no move on b. */
  startsA: 'start p0; accept p1; p0 a -> p1; p1 a,b -> p1',
  /** Binary numbers divisible by 3 (ε counts as 0). */
  div3: 'start p0; accept p0; p0 0 -> p0; p0 1 -> p1; p1 0 -> p2; p1 1 -> p0; p2 0 -> p1; p2 1 -> p2',
  /** Ends in b, as A. */
  endsBasA: 'start p0; accept p1; p0 a -> p0; p0 b -> p1; p1 a -> p0; p1 b -> p1',
  /** Ends in b. */
  endsB: 'start q0; accept q1; q0 a -> q0; q0 b -> q1; q1 a -> q0; q1 b -> q1',
  /** An odd number of a's. */
  oddA: 'start q0; accept q1; q0 a -> q1; q1 a -> q0; q0 b -> q0; q1 b -> q1',
  /** Ends in a. */
  endsA: 'start q0; accept q1; q0 a -> q1; q0 b -> q0; q1 a -> q1; q1 b -> q0',
  /** An even number of b's. */
  evenB: 'start q0; accept q0; q0 a -> q0; q0 b -> q1; q1 a -> q1; q1 b -> q0',
  /** Even binary numbers (ε counts as 0). */
  even2: 'start q0; accept q0; q0 0 -> q0; q0 1 -> q1; q1 0 -> q0; q1 1 -> q1',
  /** Starts with b; q0 has no move on a. */
  startsB: 'start q0; accept q1; q0 b -> q1; q1 a,b -> q1',
} as const;

export type MachineName = keyof typeof MACHINES;

export const machine = (name: MachineName): Automaton =>
  parseAutomaton(MACHINES[name]) as Automaton;

/** The input box's text for two machines. */
export const pairInput = (a: Automaton, b: Automaton): string =>
  `${formatAutomaton(a)} | ${formatAutomaton(b)}`;

export const loadPair = (a: Automaton, b: Automaton): OpCall => ['load', pairInput(a, b)];

/** The same machine with every state name's first letter set to `to` (q0 becomes p0). */
export function rename(a: Automaton, to: string): Automaton {
  const n = (q: string) => to + q.slice(1);
  return makeAutomaton({
    states: a.states.map(n),
    alphabet: a.alphabet,
    start: n(a.start),
    accept: a.accept.map(n),
    moves: a.moves.map((m) => ({ from: n(m.from), on: m.on, to: n(m.to) })),
  });
}

/** How many pairs the product of two machines over the same alphabet reaches. */
export const pairCount = (a: Automaton, b: Automaton): number =>
  productOf(full(a), full(b), 'union').order.length;

export interface PairOptions {
  partial?: boolean;
  /** The fewest pairs wanted. */
  minPairs?: number;
  maxPairs?: number;
}

/**
 * Two random DFAs over {a, b}, A on p0, p1, ... and B on q0, q1, ..., each with 2 or 3 states
 * (2 when moves are left out, so the dead state still fits), whose product reaches between
 * minPairs and maxPairs pairs.
 */
export function randomPair(rng: Rng, o: PairOptions = {}): [Automaton, Automaton] {
  const lo = o.minPairs ?? 3;
  const hi = Math.min(o.maxPairs ?? 9, MAX_PAIRS);
  for (let tries = 0; ; tries++) {
    const size = () => (o.partial ? rng.int(2, 3) : rng.int(2, 3));
    const a = rename(randomDfa(rng, size(), { partial: o.partial }), 'p');
    const b = randomDfa(rng, size(), { partial: o.partial });
    const fits = full(a).states.length <= MAX_SIDE && full(b).states.length <= MAX_SIDE;
    const k = fits ? pairCount(a, b) : Infinity;
    if ((k >= lo && k <= hi) || (fits && tries > 200)) return [a, b];
  }
}
