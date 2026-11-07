/**
 * The finite automaton model shared by the automata pages (DFA and NFA runs, the subset
 * construction, minimization, Thompson's construction and the pages that follow).
 *
 * An automaton is plain data, so it can sit in a step's state and compare with toEqual:
 *
 *   interface Automaton { states; alphabet; start; accept; moves }
 *   interface Move      { from; on; to }          on is a symbol, or EPS for an ε-move
 *
 * - State names are 1 to 6 letters, digits or underscores (`STATE`), kept in name order
 *   (`compareNames` from the graph model: numbers by value, so q2 comes before q10).
 * - The alphabet is single characters (letters and digits), sorted. ε is not in it.
 * - Moves are kept sorted by from, then on (ε first), then to, with no duplicates. A DFA has
 *   at most one move per state and symbol; a complete DFA has exactly one. A missing move
 *   rejects (Sipser draws such DFAs with the dead state left out).
 * - Conventions follow Sipser: δ, q0, F, ε. A run reads the whole input, then accepts when it
 *   ends in an accept state.
 *
 * API
 *   makeAutomaton(parts)              normalized copy (sorted, deduplicated)
 *   targets(a, q, on)                 states reached from q on a symbol (or EPS)
 *   closure(a, set)                   the ε-closure of a set of states, in name order
 *   stepSet(a, set, c)                closure of the states reached on c from the set
 *   isDeterministic(a), isComplete(a) DFA checks
 *   accepts(a, word)                  does the NFA (or DFA) accept the word
 *   subsetConstruction(a)             an equivalent DFA, with each state's set of NFA states
 *   minimize(dfa)                     the minimal complete DFA, with the blocks merged
 *   describeAutomaton(a)              a sentence for screen readers
 */
import { compareNames } from '../_graph/graph';

/** The symbol of an ε-move. Typed as "ε" or "eps". */
export const EPS = 'ε';

export const STATE = /^[A-Za-z0-9_]{1,6}$/;
export const SYMBOL = /^[A-Za-z0-9]$/;

/** Limits that keep a state diagram readable on a phone. */
export const MAX_STATES = 12;
export const MAX_SYMBOLS = 4;
export const MAX_MOVES = 40;

export interface Move {
  from: string;
  /** A symbol of the alphabet, or EPS. */
  on: string;
  to: string;
}

export interface Automaton {
  /** In name order. */
  states: string[];
  /** Single characters, sorted; never ε. */
  alphabet: string[];
  start: string;
  /** Accept states, in name order. */
  accept: string[];
  /** Sorted by from, on (ε first) and to. */
  moves: Move[];
}

const bySymbol = (a: string, b: string) =>
  a === b ? 0 : a === EPS ? -1 : b === EPS ? 1 : a < b ? -1 : 1;

export const sortStates = (states: Iterable<string>): string[] =>
  [...new Set(states)].sort(compareNames);

export function makeAutomaton(a: Automaton): Automaton {
  const seen = new Set<string>();
  const moves = a.moves
    .filter((m) => {
      const k = `${m.from}\u0000${m.on}\u0000${m.to}`;
      return seen.has(k) ? false : (seen.add(k), true);
    })
    .map((m) => ({ ...m }))
    .sort(
      (m, n) => compareNames(m.from, n.from) || bySymbol(m.on, n.on) || compareNames(m.to, n.to),
    );
  const states = sortStates([
    ...a.states,
    a.start,
    ...a.accept,
    ...moves.flatMap((m) => [m.from, m.to]),
  ]);
  const alphabet = [
    ...new Set([...a.alphabet, ...moves.map((m) => m.on).filter((c) => c !== EPS)]),
  ].sort();
  return { states, alphabet, start: a.start, accept: sortStates(a.accept), moves };
}

export function targets(a: Automaton, q: string, on: string): string[] {
  return a.moves.filter((m) => m.from === q && m.on === on).map((m) => m.to);
}

/** The ε-closure of a set: every state reachable from it by ε-moves alone, in name order. */
export function closure(a: Automaton, set: Iterable<string>): string[] {
  const out = new Set(set);
  const todo = [...out];
  while (todo.length) {
    const q = todo.pop()!;
    for (const r of targets(a, q, EPS))
      if (!out.has(r)) {
        out.add(r);
        todo.push(r);
      }
  }
  return sortStates(out);
}

/** The states reached from a set on symbol c, with their ε-closure. */
export function stepSet(a: Automaton, set: Iterable<string>, c: string): string[] {
  return closure(
    a,
    [...set].flatMap((q) => targets(a, q, c)),
  );
}

export function isDeterministic(a: Automaton): boolean {
  const seen = new Set<string>();
  for (const m of a.moves) {
    if (m.on === EPS) return false;
    const k = `${m.from}\u0000${m.on}`;
    if (seen.has(k)) return false;
    seen.add(k);
  }
  return true;
}

/** Deterministic, with a move for every state and symbol. */
export function isComplete(a: Automaton): boolean {
  return isDeterministic(a) && a.moves.length === a.states.length * a.alphabet.length;
}

export function accepts(a: Automaton, word: string): boolean {
  let set = closure(a, [a.start]);
  for (const c of word) set = stepSet(a, set, c);
  return set.some((q) => a.accept.includes(q));
}

/** Name a set of states for a DFA built from it: "{q0,q1}", or "∅" for the empty set. */
export const setName = (set: readonly string[]): string =>
  set.length ? `{${set.join(',')}}` : '∅';

export interface Subsets {
  /** The DFA, with states named A, B, C, ... in the order they were found. */
  dfa: Automaton;
  /** Each DFA state's set of NFA states. */
  sets: Record<string, string[]>;
}

/**
 * The subset construction (Sipser 1.39), exploring only the sets reachable from the start
 * set, breadth first, symbols in alphabet order. The empty set becomes a dead state when it
 * is reached, so the DFA is complete.
 */
export function subsetConstruction(a: Automaton): Subsets {
  const start = closure(a, [a.start]);
  const names = new Map<string, string>();
  const sets: Record<string, string[]> = {};
  const queue: string[][] = [];
  const nameOf = (set: string[]) => {
    const k = set.join(',');
    let n = names.get(k);
    if (!n) {
      n = stateLetter(names.size);
      names.set(k, n);
      sets[n] = set;
      queue.push(set);
    }
    return n;
  };
  const startName = nameOf(start);
  const moves: Move[] = [];
  while (queue.length) {
    const set = queue.shift()!;
    const from = names.get(set.join(','))!;
    for (const c of a.alphabet) moves.push({ from, on: c, to: nameOf(stepSet(a, set, c)) });
  }
  const accept = Object.keys(sets).filter((n) => sets[n]!.some((q) => a.accept.includes(q)));
  const dfa = makeAutomaton({
    states: Object.keys(sets),
    alphabet: a.alphabet,
    start: startName,
    accept,
    moves,
  });
  return { dfa, sets };
}

/** A, B, ..., Z, then A1, B1, ... for state numbers past 26. */
export function stateLetter(i: number): string {
  const letter = String.fromCharCode(65 + (i % 26));
  return i < 26 ? letter : `${letter}${Math.floor(i / 26)}`;
}

/** Add a dead state so every state has a move on every symbol. Unchanged if complete. */
export function complete(a: Automaton, dead = 'dead'): Automaton {
  if (!isDeterministic(a)) throw new Error('complete() needs a deterministic automaton');
  if (isComplete(a)) return a;
  let name = dead;
  for (let i = 2; a.states.includes(name); i++) name = `${dead}${i}`;
  const moves = [...a.moves];
  for (const q of [...a.states, name])
    for (const c of a.alphabet)
      if (!a.moves.some((m) => m.from === q && m.on === c))
        moves.push({ from: q, on: c, to: name });
  return makeAutomaton({ ...a, states: [...a.states, name], moves });
}

/** States reachable from the start state. */
export function reachable(a: Automaton): string[] {
  const seen = new Set([a.start]);
  const todo = [a.start];
  while (todo.length) {
    const q = todo.pop()!;
    for (const m of a.moves)
      if (m.from === q && !seen.has(m.to)) {
        seen.add(m.to);
        todo.push(m.to);
      }
  }
  return sortStates(seen);
}

export interface Minimized {
  dfa: Automaton;
  /** Each state of the minimal DFA (named after its first member) and the states it merges. */
  blocks: Record<string, string[]>;
}

/**
 * The minimal complete DFA: drop unreachable states, add a dead state if a move is missing,
 * then refine the partition {F, Q − F} until every block agrees on where each symbol goes
 * (Moore's algorithm). A block is named after its first state in name order.
 */
export function minimize(a: Automaton): Minimized {
  const full = complete(a);
  const keep = new Set(reachable(full));
  const states = full.states.filter((q) => keep.has(q));
  const delta = (q: string, c: string) => full.moves.find((m) => m.from === q && m.on === c)!.to;
  let block = new Map(states.map((q) => [q, full.accept.includes(q) ? 1 : 0]));
  for (;;) {
    const sig = new Map(
      states.map((q) => [
        q,
        [block.get(q), ...full.alphabet.map((c) => block.get(delta(q, c)))].join(','),
      ]),
    );
    const ids = new Map<string, number>();
    const next = new Map(
      states.map((q) => {
        const s = sig.get(q)!;
        if (!ids.has(s)) ids.set(s, ids.size);
        return [q, ids.get(s)!];
      }),
    );
    const done = new Set(next.values()).size === new Set(block.values()).size;
    block = next;
    if (done) break;
  }
  const members = new Map<number, string[]>();
  for (const q of states) members.set(block.get(q)!, [...(members.get(block.get(q)!) ?? []), q]);
  const nameOf = (q: string) => members.get(block.get(q)!)![0]!;
  const blocks: Record<string, string[]> = {};
  for (const m of members.values()) blocks[m[0]!] = m;
  const moves = Object.keys(blocks).flatMap((b) =>
    full.alphabet.map((c) => ({ from: b, on: c, to: nameOf(delta(b, c)) })),
  );
  const dfa = makeAutomaton({
    states: Object.keys(blocks),
    alphabet: full.alphabet,
    start: nameOf(full.start),
    accept: Object.keys(blocks).filter((b) => full.accept.includes(b)),
    moves,
  });
  return { dfa, blocks };
}

export function describeAutomaton(a: Automaton): string {
  const kind = isDeterministic(a) ? 'A DFA' : 'An NFA';
  const acc = a.accept.length ? `accept ${a.accept.join(', ')}` : 'no accept states';
  return `${kind} with ${a.states.length} states (start ${a.start}, ${acc}) over {${a.alphabet.join(', ')}} and ${a.moves.length} moves.`;
}
