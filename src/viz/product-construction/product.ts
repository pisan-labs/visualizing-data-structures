/**
 * The product construction on two DFAs (Sipser, Theorem 1.25 and the remark after it), for
 * union, intersection, difference and symmetric difference, and the complement of one DFA.
 *
 * A and B read the same alphabet Σ (a symbol only one of them uses is added to the other's
 * alphabet, where it has no moves). The product's states are pairs (p, q), p a state of A and
 * q a state of B; on a symbol c the pair moves to (δA(p, c), δB(q, c)). It needs a move from
 * every pair on every symbol, so A and B are completed first: a dead state takes every missing
 * move. The product starts in (startA, startB), and which pairs accept depends on the operation
 * alone: for a union, (p, q) accepts when p accepts or q does.
 *
 * Only the pairs reachable from the start pair are built, breadth first, symbols in alphabet
 * order, the way the page and the code tabs build them.
 *
 * API
 *   OPS[op]                     the operation's name, symbol, accept test and rule
 *   align(a, b)                 both machines over the union of their alphabets
 *   full(a)                     a complete copy: complete() with a dead state named "dead"
 *   productOf(a, b, op)         the reachable product of two complete DFAs
 *   complementOf(a)             complete, then swap accept and non-accept states
 *   lineOrder(a)                the order A's states are drawn in (its dead state last)
 *   pairName(p, q), pairText(p, q)   "p0,q1" (a state name and table cell), "(p0, q1)"
 *   whyPair(op, p, q, x, y)     why the pair accepts or not, in words
 */
import { layers } from '../../layouts/automaton';
import { complete, makeAutomaton, type Automaton, type Move } from '../_automata/automaton';

export type SetOp = 'union' | 'intersection' | 'difference' | 'symmetric';

export const SET_OPS: SetOp[] = ['union', 'intersection', 'difference', 'symmetric'];

export interface OpInfo {
  /** "union" */
  name: string;
  /** "∪" */
  sym: string;
  /** "A ∪ B" */
  label: string;
  /** Does a pair accept, given whether p accepts in A and q accepts in B? */
  test(x: boolean, y: boolean): boolean;
  /** The accept rule for the pair (p, q), formal and in plain English. */
  rule(p: string, q: string): string;
  plain(p: string, q: string): string;
  /** What a word in the language is: "in A or in B". */
  means: string;
}

export const OPS: Record<SetOp, OpInfo> = {
  union: {
    name: 'union',
    sym: '∪',
    label: 'A ∪ B',
    test: (x, y) => x || y,
    rule: (p, q) => `${p} ∈ F_A or ${q} ∈ F_B`,
    plain: (p, q) => `${p} accepts or ${q} accepts`,
    means: 'in A or in B',
  },
  intersection: {
    name: 'intersection',
    sym: '∩',
    label: 'A ∩ B',
    test: (x, y) => x && y,
    rule: (p, q) => `${p} ∈ F_A and ${q} ∈ F_B`,
    plain: (p, q) => `${p} and ${q} both accept`,
    means: 'in both A and B',
  },
  difference: {
    name: 'difference',
    sym: '−',
    label: 'A − B',
    test: (x, y) => x && !y,
    rule: (p, q) => `${p} ∈ F_A and ${q} ∉ F_B`,
    plain: (p, q) => `${p} accepts and ${q} does not`,
    means: 'in A but not in B',
  },
  symmetric: {
    name: 'symmetric difference',
    sym: '⊕',
    label: 'A ⊕ B',
    test: (x, y) => x !== y,
    rule: (p, q) => `(${p} ∈ F_A) ≠ (${q} ∈ F_B)`,
    plain: (p, q) => `exactly one of ${p} and ${q} accepts`,
    means: 'in exactly one of A and B',
  },
};

export const pairName = (p: string, q: string): string => `${p},${q}`;
export const pairText = (p: string, q: string): string => `(${p}, ${q})`;

/** Both machines over the union of their alphabets. Unchanged when they already agree. */
export function align(a: Automaton, b: Automaton): [Automaton, Automaton] {
  const sigma = [...new Set([...a.alphabet, ...b.alphabet])].sort();
  const over = (x: Automaton) =>
    x.alphabet.length === sigma.length ? x : makeAutomaton({ ...x, alphabet: sigma });
  return [over(a), over(b)];
}

/** A complete copy of a DFA: every missing move goes to a new dead state, "dead". */
export const full = (a: Automaton): Automaton => complete(a, 'dead');

/** The state complete() added to a, or null when a was complete already. */
export function deadOf(a: Automaton): string | null {
  const f = full(a);
  return f === a ? null : f.states.find((q) => !a.states.includes(q))!;
}

/** The moves complete() adds to a. */
export const addedMoves = (a: Automaton): Move[] =>
  full(a).moves.filter(
    (m) => !a.moves.some((n) => n.from === m.from && n.on === m.on && n.to === m.to),
  );

const delta = (a: Automaton, q: string, c: string): string =>
  a.moves.find((m) => m.from === q && m.on === c)!.to;

export interface Product {
  /** The product DFA: states named pairName(p, q), complete, accept states by the operation. */
  dfa: Automaton;
  /** Each state's pair. */
  pairs: Record<string, [string, string]>;
  /** The states in the order they are found, breadth first from the start pair. */
  order: string[];
}

const cache = new Map<string, Product>();

const key = (a: Automaton) =>
  `${a.start}|${a.states.join(',')}|${a.accept.join(',')}|${a.alphabet.join(',')}|${a.moves.map((m) => `${m.from}>${m.on}>${m.to}`).join(',')}`;

/**
 * The product of two complete DFAs over the same alphabet, built from the start pair breadth
 * first, symbols in alphabet order: only the reachable pairs.
 */
export function productOf(a: Automaton, b: Automaton, op: SetOp): Product {
  const k = `${op}#${key(a)}#${key(b)}`;
  const hit = cache.get(k);
  if (hit) return hit;
  const pairs: Record<string, [string, string]> = {};
  const order: string[] = [];
  const moves: Move[] = [];
  const visit = (p: string, q: string) => {
    const n = pairName(p, q);
    if (!pairs[n]) {
      pairs[n] = [p, q];
      order.push(n);
    }
    return n;
  };
  visit(a.start, b.start);
  for (let i = 0; i < order.length; i++) {
    const from = order[i]!;
    const [p, q] = pairs[from]!;
    for (const c of a.alphabet)
      moves.push({ from, on: c, to: visit(delta(a, p, c), delta(b, q, c)) });
  }
  const accept = order.filter((n) => {
    const [p, q] = pairs[n]!;
    return OPS[op].test(a.accept.includes(p), b.accept.includes(q));
  });
  const dfa = makeAutomaton({
    states: order,
    alphabet: a.alphabet,
    start: order[0]!,
    accept,
    moves,
  });
  const out = { dfa, pairs, order };
  if (cache.size > 300) cache.clear();
  cache.set(k, out);
  return out;
}

/** The complement: complete the DFA, then make every accept state non-accepting and back. */
export function complementOf(a: Automaton): Automaton {
  const f = full(a);
  return makeAutomaton({ ...f, accept: f.states.filter((q) => !f.accept.includes(q)) });
}

/**
 * The order A's states are drawn in along the grid: breadth first from the start in the
 * complete machine, with its sinks (states whose every move stays put, the dead state among
 * them) at the end. It depends only on the moves, so A, its completion and its complement
 * line up the same way.
 */
export function lineOrder(a: Automaton): string[] {
  const f = full(a);
  const all = layers(f).flat();
  const sink = (q: string) =>
    q !== f.start && f.alphabet.length > 0 && f.moves.every((m) => m.from !== q || m.to === q);
  return [...all.filter((q) => !sink(q)), ...all.filter(sink)];
}

/** Why the pair (p, q) accepts or not, given whether p accepts in A (x) and q in B (y). */
export function whyPair(op: SetOp, p: string, q: string, x: boolean, y: boolean): string {
  const pq = pairText(p, q);
  const yes = OPS[op].test(x, y);
  const state =
    x && y
      ? `Both ${p} and ${q} accept`
      : !x && !y
        ? `Neither ${p} nor ${q} accepts`
        : `Only ${x ? p : q} accepts`;
  const so = yes ? `so ${pq} accepts` : `so ${pq} does not`;
  switch (op) {
    case 'union':
      return `${state}, ${so}${yes && !(x && y) ? ': for a union, one is enough' : ''}.`;
    case 'intersection':
      return `${state}, ${so}${!yes && (x || y) ? ': an intersection needs both' : ''}.`;
    case 'difference':
      return x
        ? `${state}, ${so}${yes ? ': the word is in A and not in B' : ': the word is in B too'}.`
        : `As ${p} does not accept, ${pq} does not either, whatever ${q} does.`;
    case 'symmetric':
      return `${state}, ${so}${yes ? '' : ': exactly one of them must'}.`;
  }
}
