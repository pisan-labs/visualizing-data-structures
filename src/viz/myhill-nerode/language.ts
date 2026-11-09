/**
 * The languages the Myhill–Nerode page works on: a regular language given as a DFA (or an NFA,
 * or a regular expression, turned into a complete DFA by the automata kit), or one of two
 * languages no DFA accepts, given by a membership test.
 *
 * Words x and y are equivalent (x ≡ y) when no suffix z tells them apart: xz ∈ L exactly when
 * yz ∈ L. For a DFA, x ≡ y exactly when the states x and y reach are equivalent, and the shortest
 * suffix that tells them apart comes from a breadth-first search over pairs of states, symbols in
 * alphabet order (`apart`), so it is also the first of that length in alphabet order. For the
 * named languages, each word's class has a key (`classKey`), and the suffix is the first one, in
 * order of length and then alphabet, that tells the words apart.
 */
import {
  accepts,
  complete,
  isDeterministic,
  makeAutomaton,
  subsetConstruction,
  type Automaton,
} from '../_automata/automaton';
import { looksLikeMachine } from '../_automata/page';
import { parseAutomaton } from '../_automata/parse';
import { readRegex, thompson } from '../_automata/regex';

export type NamedId = 'anbn' | 'equal';

export const NAMED: Record<NamedId, { label: string; say: string; family: string }> = {
  anbn: {
    label: '{ aⁿbⁿ : n ≥ 0 }',
    say: 'some a’s followed by as many b’s',
    family: 'b',
  },
  equal: {
    label: '{ w : as many a’s as b’s }',
    say: 'words with as many a’s as b’s',
    family: 'b',
  },
};

export type Language =
  | {
      kind: 'regular';
      /** How it was given: a regular expression or a machine. */
      from: 'regex' | 'dfa' | 'nfa';
      /** The text as typed (the expression as shown, or the machine text). */
      text: string;
      /** A complete DFA for it. */
      dfa: Automaton;
      /** States of the machine as given, for the narration. */
      given: number;
    }
  | { kind: 'named'; name: NamedId };

export const alphabetOf = (l: Language): string[] =>
  l.kind === 'named' ? ['a', 'b'] : l.dfa.alphabet;

export function label(l: Language): string {
  if (l.kind === 'named') return NAMED[l.name].label;
  if (l.from === 'regex') return `L(${l.text})`;
  return `L(D), D ${l.from === 'dfa' ? 'a DFA' : 'an NFA'} with ${l.given} states`;
}

export function member(l: Language, w: string): boolean {
  if (l.kind === 'regular') return accepts(l.dfa, w);
  if (l.name === 'anbn') {
    const m = /^(a*)(b*)$/.exec(w);
    return !!m && m[1]!.length === m[2]!.length;
  }
  let d = 0;
  for (const c of w) d += c === 'a' ? 1 : c === 'b' ? -1 : 0;
  return d === 0 && /^[ab]*$/.test(w);
}

/** The class of a word in a named language, as a key: equal keys, equivalent words. */
export function classKey(name: NamedId, w: string): string {
  if (name === 'equal') return String([...w].filter((c) => c === 'a').length * 2 - w.length);
  const m = /^(a*)(b*)$/.exec(w);
  if (!m) return 'dead';
  const i = m[1]!.length;
  const j = m[2]!.length;
  if (j === 0) return `a${i}`;
  if (j < i) return `need${i - j}`;
  return j === i ? 'in' : 'dead';
}

/** The state a word leads to in the DFA. */
export function stateOf(dfa: Automaton, w: string): string {
  let q = dfa.start;
  for (const c of w) q = dfa.moves.find((m) => m.from === q && m.on === c)!.to;
  return q;
}

/** Search bound for the named languages' suffixes. */
const MAX_SUFFIX = 12;

/**
 * The shortest suffix that tells x and y apart (first in alphabet order among the shortest), or
 * null if they are equivalent. `tooLong` is set for a named language when the words are in
 * different classes but no suffix of up to MAX_SUFFIX symbols was found.
 */
export function apart(l: Language, x: string, y: string): string | null {
  const sigma = alphabetOf(l);
  if (l.kind === 'regular') {
    const d = l.dfa;
    const acc = (q: string) => d.accept.includes(q);
    const next = (q: string, c: string) => d.moves.find((m) => m.from === q && m.on === c)!.to;
    const start: [string, string] = [stateOf(d, x), stateOf(d, y)];
    const seen = new Set([start.join('|')]);
    const queue: { p: string; q: string; z: string }[] = [{ p: start[0], q: start[1], z: '' }];
    for (let k = 0; k < queue.length; k++) {
      const { p, q, z } = queue[k]!;
      if (acc(p) !== acc(q)) return z;
      for (const c of sigma) {
        const pair = [next(p, c), next(q, c)] as const;
        const key = pair.join('|');
        if (!seen.has(key)) {
          seen.add(key);
          queue.push({ p: pair[0], q: pair[1], z: z + c });
        }
      }
    }
    return null;
  }
  if (classKey(l.name, x) === classKey(l.name, y)) return null;
  const bound = Math.min(MAX_SUFFIX, x.length + y.length + 2);
  let level = [''];
  for (let n = 0; n <= bound; n++) {
    for (const z of level) if (member(l, x + z) !== member(l, y + z)) return z;
    level = level.flatMap((z) => sigma.map((c) => z + c));
  }
  return '…';
}

/** Read the input as a language: a name, a machine, or a regular expression. */
export function parseLanguage(raw: string): Language | Error {
  const t = raw.trim();
  const key = t.toLowerCase().replace(/[\s{}()^ⁿ]/g, '');
  if (key === 'anbn' || key === 'a^nb^n') return { kind: 'named', name: 'anbn' };
  if (key === 'equal' || key === 'eq') return { kind: 'named', name: 'equal' };
  if (!t)
    return new Error(
      'Type a regular expression such as (a|b)*ab, a DFA such as "q0 a -> q1; accept q1", or anbn.',
    );
  if (looksLikeMachine(t)) {
    const a = parseAutomaton(t);
    if (a instanceof Error) return a;
    if (!a.alphabet.length) return new Error('The machine reads no symbols: give it some moves.');
    const nfa = !isDeterministic(a);
    const dfa = nfa ? subsetConstruction(a).dfa : complete(a);
    return { kind: 'regular', from: nfa ? 'nfa' : 'dfa', text: t, dfa, given: a.states.length };
  }
  const p = readRegex(t);
  if (p instanceof Error) return p;
  const { nfa } = thompson(p.tree.r);
  const dfa = subsetConstruction(nfa).dfa;
  // An expression with no symbols (ε, ∅) still needs a symbol to read: give it a.
  const sigma = dfa.alphabet.length ? dfa : complete(makeAutomaton({ ...dfa, alphabet: ['a'] }));
  return { kind: 'regular', from: 'regex', text: p.text, dfa: sigma, given: nfa.states.length };
}

/** ε for the empty word. */
export const wordText = (w: string): string => (w === '' ? 'ε' : w);
