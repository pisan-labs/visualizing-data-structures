/**
 * Constrained decoding with a DFA (the idea behind Outlines, Willard and Louf 2023), without the
 * steps: a regular expression compiled to a DFA, a vocabulary of multi-letter tokens, and for
 * each state the tokens that keep the text on a path to an accepting state.
 *
 *   compile   regex → Thompson's NFA → the subset construction → the minimal DFA, with its dead
 *             state dropped (src/viz/_automata/); states renamed q0, q1, ... breadth first
 *   walk      a token from a state, letter by letter; it is allowed if no letter falls off the
 *             DFA (into the dead state), and </s> is allowed only in an accepting state
 *   index     σ(q) = every allowed token from q with the state it ends in, built once
 *   mask      logits of tokens not in σ(q) become −∞; softmax over what is left
 *
 * The toy model scores the next token from the previous one only (a table of made-up logits),
 * so it knows nothing about the regex: the mask does all the work.
 *
 * Every state of the minimal DFA without its dead state can still reach an accepting state, so
 * a token that does not fall off keeps the text on a path to a match.
 */
import { minimize, subsetConstruction, type Automaton, type Move } from '../_automata/automaton';
import { layers } from '../../layouts/automaton';
import { readRegex, thompson } from '../_automata/regex';

export const END = '</s>';

/** The vocabulary, </s> first. Every letter of it is also a token, so any path can be spelled. */
export const VOCAB: readonly string[] = [
  END,
  'yeah',
  'yes',
  'ye',
  'y',
  'e',
  's',
  'no',
  'n',
  'o',
  'haha',
  'ha',
  'h',
  'a',
];

export const BOS = '<s>';

/**
 * The toy model's logits for the next token, by the token before it (BOS at the start). Any
 * token a row leaves out scores 0; a previous token without a row uses DEFAULT_ROW. Made up so
 * that, asked yes or no, the model would rather say yeah.
 */
const ROWS: Record<string, Record<string, number>> = {
  [BOS]: {
    [END]: -2,
    yeah: 3,
    yes: 2.4,
    no: 2,
    ha: 1.6,
    haha: 1.2,
    ye: 1,
    y: 0.6,
    n: 0.5,
    h: 0.3,
  },
  yeah: { [END]: 2.5, haha: 1.2 },
  yes: { [END]: 3 },
  ye: { s: 2.2, a: 1.4, [END]: 0.5 },
  y: { e: 2, o: 1 },
  e: { s: 1.5, a: 1.2, [END]: 1 },
  a: { h: 1.5, [END]: 1 },
  no: { [END]: 2.5, o: 1, no: 0.8 },
  n: { o: 2 },
  o: { [END]: 1.5, o: 1.2, h: 1 },
  ha: { [END]: 2, ha: 1.5, haha: 1, h: 0.3 },
  haha: { [END]: 2.4, ha: 1 },
  h: { a: 2, e: 0.5 },
  s: { [END]: 2.5 },
};

const DEFAULT_ROW: Record<string, number> = { [END]: 2 };

/** The logits after `prev`, one per token of VOCAB. */
export function logitsAfter(prev: string): number[] {
  const row = ROWS[prev] ?? DEFAULT_ROW;
  return VOCAB.map((t) => row[t] ?? 0);
}

/** Every row of the table, for the code tabs: BOS, then each token. */
export const LOGIT_ROWS: readonly string[] = [BOS, ...VOCAB];

// ---------------------------------------------------------------------------------------------
// The DFA

export interface Compiled {
  /** The expression as shown. */
  text: string;
  dfa: Automaton;
  nfaStates: number;
  /** States of the subset construction, its dead state included. */
  subsetStates: number;
  /** States of the minimal complete DFA, its dead state included if it has one. */
  minStates: number;
  dead: boolean;
}

/** The longest expression, so the DFA stays readable. */
export const MAX_REGEX = 24;

/** Compile a regex, or return an Error a learner can act on. */
export function compile(raw: string): Compiled | Error {
  const parsed = readRegex(raw, { max: MAX_REGEX });
  if (parsed instanceof Error) return parsed;
  const { nfa } = thompson(parsed.tree.r);
  const subsets = subsetConstruction(nfa);
  const min = minimize(subsets.dfa).dfa;
  // The dead state: not accepting, every move back to itself.
  const isDead = (q: string) =>
    !min.accept.includes(q) && min.moves.filter((m) => m.from === q).every((m) => m.to === q);
  const dead = min.states.filter(isDead);
  const live = min.states.filter((q) => !dead.includes(q));
  if (!live.includes(min.start))
    return new Error(`${parsed.text} matches nothing at all, so no text can satisfy it.`);
  const trimmed: Automaton = {
    ...min,
    states: live,
    moves: min.moves.filter((m) => live.includes(m.from) && live.includes(m.to)),
    accept: min.accept.filter((q) => live.includes(q)),
  };
  // Rename breadth first from the start: q0, q1, ...
  const order = layers(trimmed).flat();
  const name = new Map(order.map((q, i) => [q, `q${i}`]));
  const rn = (q: string) => name.get(q)!;
  const moves: Move[] = trimmed.moves
    .map((m) => ({ from: rn(m.from), on: m.on, to: rn(m.to) }))
    .sort(
      (a, b) =>
        Number(a.from.slice(1)) - Number(b.from.slice(1)) ||
        (a.on < b.on ? -1 : a.on > b.on ? 1 : 0),
    );
  const dfa: Automaton = {
    states: order.map(rn),
    alphabet: trimmed.alphabet,
    start: rn(trimmed.start),
    accept: trimmed.accept.map(rn).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1))),
    moves,
  };
  return {
    text: parsed.text,
    dfa,
    nfaStates: nfa.states.length,
    subsetStates: subsets.dfa.states.length,
    minStates: min.states.length,
    dead: dead.length > 0,
  };
}

export const delta = (dfa: Automaton, q: string, c: string): string | null =>
  dfa.moves.find((m) => m.from === q && m.on === c)?.to ?? null;

export interface Walk {
  /** The state the token ends in, or null if a letter falls off the DFA. */
  to: string | null;
  /** The states passed through, the start included. */
  path: string[];
  /** Moves looked up: one per letter read, the one that fails included. */
  lookups: number;
}

/** Read a token from state q. </s> reads nothing: it is allowed only in an accepting state. */
export function walk(dfa: Automaton, q: string, token: string): Walk {
  if (token === END) return { to: dfa.accept.includes(q) ? q : null, path: [q], lookups: 0 };
  const path = [q];
  let at: string | null = q;
  let lookups = 0;
  for (const c of token) {
    lookups++;
    at = delta(dfa, at, c);
    if (at === null) break;
    path.push(at);
  }
  return { to: at, path, lookups };
}

/** σ(q) for every state: each token's end state, or null where it is masked. */
export type Index = Map<string, (string | null)[]>;

export function buildIndex(dfa: Automaton): { index: Index; lookups: number } {
  const index: Index = new Map();
  let lookups = 0;
  for (const q of dfa.states) {
    const row = VOCAB.map((t) => {
      const w = walk(dfa, q, t);
      lookups += w.lookups;
      return w.to;
    });
    index.set(q, row);
  }
  return { index, lookups };
}

/** Is the whole text a match? (A run of the DFA.) */
export function matches(dfa: Automaton, text: string): boolean {
  let q: string | null = dfa.start;
  for (const c of text) {
    q = delta(dfa, q, c);
    if (q === null) return false;
  }
  return dfa.accept.includes(q);
}
