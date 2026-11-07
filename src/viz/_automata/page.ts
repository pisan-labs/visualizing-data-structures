/**
 * What the automata pages share around the model: the input box, the Load operation, a sentence
 * about a machine, the code tabs' driver lines, and small text helpers.
 *
 * Input boxes
 *   machineOrWordsInput(sample)   "Machine or word": machine text, a word to run, or a batch of
 *                                 words to test such as "+ab -ba -eps" (the DFA and NFA pages)
 *   automatonInput(sample, check) "Automaton": machine text only, with a page's own check
 *   looksLikeMachine(text), wordProblem(text, a), parseBatch(text, a)
 *
 * Loading
 *   loadOp(o)          the Load operation: reads the text, or keeps the old machine and says why
 *   whyNotDfa(a)       why a machine is not a DFA, or null
 *   describeMachine(a) "a DFA with 3 states over {0, 1}: start q0, accept q2, and 6 moves."
 *
 * Code tabs
 *   automatonLines(kind, a)  driver input for a machine (below); loadCall(a) the Load call
 *
 * Text
 *   wordText(w) ("ε" for the empty word), plural(n, word), words(xs) ("a, b and c"),
 *   setText(set) (from automaton.ts) for every set in narration, automatonKey(a) for caches
 */
import type { Controls, OpCall, OpSpec, Scalar, Step, Value } from '../../engine/types';
import { EPS, isDeterministic, setText, targets, type Automaton } from './automaton';
import { formatAutomaton, parseAutomaton, parseWord } from './parse';

export { setText };

export type Verdict = 'accept' | 'reject';

/** The state of a page that runs a machine (the DFA and NFA pages): just the machine. */
export interface MachineState {
  machine: Automaton;
}

/** Words per batch, so the test table stays readable on a phone. */
export const MAX_BATCH = 8;

export const wordText = (w: string): string => (w === '' ? 'ε' : w);

export const plural = (n: number, word: string, many = `${word}s`): string =>
  `${n} ${n === 1 ? word : many}`;

/** "a", "a and b", "a, b and c". */
export const words = (xs: readonly string[]): string =>
  xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`;

/** A string that tells automata apart, for caches. */
export const automatonKey = (a: Automaton): string =>
  `${a.start}|${a.states.join(',')}|${a.accept.join(',')}|${a.alphabet.join(',')}|${a.moves.map((m) => `${m.from}>${m.on}>${m.to}`).join(',')}`;

// ---------------------------------------------------------------------------------------------
// Input

const MACHINE_HINT = /->|→|;/;
const KEYWORD = /^(start|accept|final|states|alphabet)\s/i;
const TOKEN = /^[+-]?(?:[A-Za-z0-9]+|eps|ε)$/;

export const looksLikeMachine = (t: string): boolean => MACHINE_HINT.test(t) || KEYWORD.test(t);

/** The DFA and NFA pages' input: machine text, a word, or words with + or - in front. */
export function parseMachineOrWords(raw: string): Value | Error {
  const t = raw.trim();
  if (!t)
    return new Error(
      'Type a word such as 0101, words to test such as +01 -10, or a machine such as "q0 0 -> q1; accept q1".',
    );
  if (looksLikeMachine(t)) {
    const a = parseAutomaton(t);
    return a instanceof Error ? a : t;
  }
  for (const tok of t.split(/[\s,]+/).filter(Boolean))
    if (!TOKEN.test(tok))
      return new Error(
        `"${tok}" is not a word. Use letters and digits, or ε (eps) for the empty word; put + or - in front to test it.`,
      );
  return t;
}

export function machineOrWordsInput(sample: string): NonNullable<Controls['input']> {
  return {
    label: 'Machine or word',
    placeholder: 'e.g. 0101, +01 -10, or q0 0 -> q1; accept q1',
    maxLength: 300,
    sample,
    parse: parseMachineOrWords,
  };
}

/** An input box for machine text only, with an error that names the bad item. */
export function automatonInput(
  sample: string,
  check?: (a: Automaton) => string | null,
): NonNullable<Controls['input']> {
  return {
    label: 'Automaton',
    placeholder: 'e.g. q0 a -> q1; q1 b -> q0; accept q1',
    maxLength: 600,
    sample,
    parse(token) {
      const t = token.trim();
      if (!t) return new Error('Type moves such as "q0 a -> q1; q1 b -> q0; accept q1".');
      const a = parseAutomaton(t);
      if (a instanceof Error) return a;
      const why = check?.(a);
      return why ? new Error(why) : t;
    },
  };
}

/** Why a word cannot be run: a sentence, with a hint when the text was meant for another button. */
export function wordProblem(raw: string, a: Automaton): string | null {
  const t = raw.trim();
  if (looksLikeMachine(t)) return 'That looks like a machine: press Load to load it.';
  if (/^[+-]/.test(t))
    return `"${t}" has a + or - in front, which marks a word to test. Press Test to check it against what it should give, or type just the word to run it.`;
  const w = parseWord(t, a);
  return w instanceof Error ? w.message : null;
}

export interface BatchItem {
  word: string;
  /** What the machine should do: + accept, - reject, or null when no sign was given. */
  expect: Verdict | null;
}

/** "+ab aab -eps" -> the words, each with what it should give, or an Error. */
export function parseBatch(raw: string, a: Automaton): BatchItem[] | Error {
  const t = raw.trim();
  if (looksLikeMachine(t)) return new Error('That looks like a machine: press Load to load it.');
  const tokens = t.split(/[\s,]+/).filter(Boolean);
  if (!tokens.length)
    return new Error(
      'Type words to test, such as +01 -10 -eps: + for a word the machine should accept and - for one it should reject.',
    );
  if (tokens.length > MAX_BATCH) return new Error(`Test at most ${MAX_BATCH} words at a time.`);
  const out: BatchItem[] = [];
  for (const tok of tokens) {
    const sign = tok[0] === '+' || tok[0] === '-' ? tok[0] : '';
    const body = tok.slice(sign.length);
    if (!body)
      return new Error(`"${tok}" has no word after the sign. Write -eps for the empty word.`);
    const w = parseWord(body, a);
    if (w instanceof Error) return new Error(`In "${tok}": ${w.message}`);
    out.push({ word: w, expect: sign === '+' ? 'accept' : sign === '-' ? 'reject' : null });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Loading

/** Why a machine is not a DFA, or null when it is one. */
export function whyNotDfa(a: Automaton): string | null {
  const eps = a.moves.find((m) => m.on === EPS);
  if (eps)
    return `${eps.from} has an ε-move to ${eps.to}, and a DFA reads exactly one symbol per move`;
  for (const m of a.moves) {
    const ts = targets(a, m.from, m.on);
    if (ts.length > 1)
      return `${m.from} has ${ts.length} moves on ${m.on} (to ${words(ts)}), and a DFA has at most one`;
  }
  return null;
}

/** "a DFA with 3 states over {0, 1}: start q0, accept q2, and 6 moves." */
export function describeMachine(a: Automaton): string {
  const kind = isDeterministic(a) ? 'a DFA' : 'an NFA';
  const acc = a.accept.length ? `accept ${words(a.accept)}` : 'no accept states';
  const over = a.alphabet.length ? `over ${setText(a.alphabet)}` : 'and no symbols';
  return `${kind} with ${plural(a.states.length, 'state')} ${over}: start ${a.start}, ${acc}, and ${plural(a.moves.length, 'move')}.`;
}

export interface LoadOptions<S> {
  /** What the page calls the machine it holds: "machine" (the default), "NFA", "DFA". */
  what?: string;
  /** The page's state with this automaton loaded. */
  make(a: Automaton, old: S): S;
  /** Why this automaton cannot be loaded here, or null. */
  check?(a: Automaton): string | null;
  /** What to say after a good load, such as "Press Convert." */
  ready(a: Automaton): string;
  vars(s: S): Record<string, Scalar>;
  /** The input box takes words too: a word sent to Load gets told to press Run. */
  words?: boolean;
}

/** The Load operation: one step, with the new machine, or the old one and what was wrong. */
export function loadOp<S, Set, X>(o: LoadOptions<S>): OpSpec<S, Set, X> {
  return {
    label: 'Load',
    arity: 1,
    *run(s, [arg]) {
      const text = String(arg ?? '').trim();
      const a = parseAutomaton(text);
      const problem =
        a instanceof Error
          ? o.words && text && !looksLikeMachine(text)
            ? `"${text}" is not a machine. Type moves such as "q0 a -> q1; accept q1"; to run a word, press Run.`
            : a.message
          : o.check?.(a);
      if (problem || a instanceof Error) {
        yield {
          state: s,
          marks: [],
          say: `Nothing loaded. ${problem} The ${o.what ?? 'machine'} stays as it was.`,
          lines: [],
          level: 1,
          vars: o.vars(s),
        } satisfies Step<S, X>;
        return s;
      }
      const next = o.make(a, s);
      yield {
        state: next,
        marks: [],
        say: `Loaded ${describeMachine(a)} ${o.ready(a)}`,
        lines: [],
        level: 1,
        vars: o.vars(next),
      } satisfies Step<S, X>;
      return next;
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Code tabs

/**
 * Driver lines for a machine: "<kind> <states in name order>" starts a new one ("dfa" or
 * "nfa"), then "alphabet <symbols>", "start <state>", "accept <states>" (either list may be
 * empty) and one "move <from> <symbol> <to>" per move, "eps" for an ε-move. None of them prints.
 */
export function automatonLines(kind: 'dfa' | 'nfa', a: Automaton): string[] {
  return [
    `${kind} ${a.states.join(' ')}`,
    `alphabet ${a.alphabet.join(' ')}`.trimEnd(),
    `start ${a.start}`,
    `accept ${a.accept.join(' ')}`.trimEnd(),
    ...a.moves.map((m) => `move ${m.from} ${m.on === EPS ? 'eps' : m.on} ${m.to}`),
  ];
}

export const loadCall = (a: Automaton): OpCall => ['load', formatAutomaton(a)];
