/**
 * Automaton text: one line, items separated by semicolons, read into an Automaton and
 * written back out.
 *
 *   start q0; accept q2 q3; q0 a -> q1; q1 a,b -> q2; q2 ε -> q0
 *
 * - `p a -> q` is a move from p to q on a; `p a,b -> q` is one move per symbol. ε (or eps)
 *   is an ε-move. The arrow may be typed as -> or →.
 * - `start q` names the start state. Without it, the start is the first state of the first
 *   move.
 * - `accept q r ...` names the accept states (also `final`). Several accept items add up.
 * - `states q r ...` lists states, for a state with no moves.
 * - The alphabet is every symbol used in a move, and every symbol `alphabet a b ...` names (for
 *   a symbol no move uses).
 *
 * API
 *   parseAutomaton(text) -> Automaton, or an Error whose message names the bad item
 *   formatAutomaton(a)   -> text; parseAutomaton(formatAutomaton(a)) equals a. It has an
 *                           `alphabet` item only when some symbol is on no move.
 *   parseWord(text, a)   -> the input word, or an Error naming a symbol not in the alphabet
 */
import {
  EPS,
  MAX_MOVES,
  MAX_STATES,
  MAX_SYMBOLS,
  STATE,
  SYMBOL,
  makeAutomaton,
  setText,
  type Automaton,
  type Move,
} from './automaton';

export const MAX_WORD = 16;

export function parseAutomaton(raw: string): Automaton | Error {
  const items = raw
    .split(/[;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!items.length)
    return new Error('Type moves such as "q0 a -> q1; q1 b -> q0; accept q1", separated by ;.');
  let start: string | undefined;
  const accept: string[] = [];
  const states: string[] = [];
  const alphabet: string[] = [];
  const moves: Move[] = [];
  const state = (name: string, item: string): string | Error =>
    STATE.test(name)
      ? name
      : new Error(
          `"${name}" in "${item}" is not a state name: use 1 to 6 letters, digits or _, such as q0.`,
        );
  for (const item of items) {
    const words = item.split(/\s+/);
    const head = words[0]!.toLowerCase();
    if (head === 'alphabet') {
      const syms = words
        .slice(1)
        .flatMap((w) => w.split(','))
        .filter(Boolean);
      if (!syms.length) return new Error(`"${item}" needs at least one symbol after alphabet.`);
      for (const c of syms) {
        if (c === 'eps' || c === EPS)
          return new Error(`"${item}": ε is not a symbol of the alphabet; it is the empty word.`);
        if (!SYMBOL.test(c))
          return new Error(`"${c}" in "${item}" is not a symbol: use one letter or digit.`);
      }
      alphabet.push(...syms);
      continue;
    }
    if (head === 'start' || head === 'accept' || head === 'final' || head === 'states') {
      const names = words
        .slice(1)
        .flatMap((w) => w.split(','))
        .filter(Boolean);
      if (!names.length) return new Error(`"${item}" needs at least one state after ${head}.`);
      for (const n of names) {
        const s = state(n, item);
        if (s instanceof Error) return s;
      }
      if (head === 'start') {
        if (names.length > 1) return new Error(`"${item}": there is only one start state.`);
        start = names[0];
      } else (head === 'states' ? states : accept).push(...names);
      continue;
    }
    const m = /^(\S+)\s+(\S+)\s*(?:->|→)\s*(\S+)$/.exec(item);
    if (!m)
      return new Error(
        `"${item}" is not a move. Write a move as "q0 a -> q1", or use start, accept, states or alphabet.`,
      );
    const from = state(m[1]!, item);
    if (from instanceof Error) return from;
    const to = state(m[3]!, item);
    if (to instanceof Error) return to;
    for (const sym of m[2]!.split(',').filter(Boolean)) {
      const on = sym === 'eps' || sym === 'ε' ? EPS : sym;
      if (on !== EPS && !SYMBOL.test(on))
        return new Error(
          `"${sym}" in "${item}" is not a symbol: use one letter or digit, or ε (eps).`,
        );
      moves.push({ from, on, to });
    }
  }
  if (start === undefined) start = moves[0]?.from ?? states[0];
  if (start === undefined) return new Error('Name a start state ("start q0") or add a move.');
  const a = makeAutomaton({ states, alphabet, start, accept, moves });
  if (a.states.length > MAX_STATES)
    return new Error(`Use at most ${MAX_STATES} states, so the diagram stays readable.`);
  if (a.alphabet.length > MAX_SYMBOLS)
    return new Error(`Use at most ${MAX_SYMBOLS} different symbols.`);
  if (a.moves.length > MAX_MOVES) return new Error(`Use at most ${MAX_MOVES} moves.`);
  return a;
}

export function formatAutomaton(a: Automaton): string {
  const groups = new Map<string, string[]>();
  for (const m of a.moves) {
    const k = `${m.from} ${m.to}`;
    groups.set(k, [...(groups.get(k) ?? []), m.on]);
  }
  const moves = [...groups].map(([k, on]) => {
    const [from, to] = k.split(' ');
    return `${from} ${on.join(',')} -> ${to}`;
  });
  const used = new Set([a.start, ...a.moves.flatMap((m) => [m.from, m.to])]);
  const lonely = a.states.filter((q) => !used.has(q));
  const named = a.alphabet.some((c) => !a.moves.some((m) => m.on === c));
  return [
    `start ${a.start}`,
    ...(a.accept.length ? [`accept ${a.accept.join(' ')}`] : []),
    ...(lonely.length ? [`states ${lonely.join(' ')}`] : []),
    ...(named ? [`alphabet ${a.alphabet.join(' ')}`] : []),
    ...moves,
  ].join('; ');
}

export function parseWord(raw: string, a: Automaton): string | Error {
  const w = raw.replace(/\s+/g, '');
  if (w === EPS || w === 'eps') return '';
  if (w.length > MAX_WORD) return new Error(`Keep the input to ${MAX_WORD} symbols or fewer.`);
  for (const c of w)
    if (!a.alphabet.includes(c))
      return new Error(
        `"${c}" is not in the alphabet ${setText(a.alphabet)}. Type a word over it, or ε for the empty word.`,
      );
  return w;
}
