/**
 * Random machines and words for presets and practice. States are q0, q1, ... and the start is
 * q0; every state can be reached from it.
 *
 *   randomWord(rng, alphabet, n)        a word of length n
 *   randomDfa(rng, n, { alphabet, partial })   a DFA; partial leaves about a quarter of the moves out
 *   randomNfa(rng, n, { alphabet, eps })       an NFA with about 1.8 moves per state
 */
import type { Rng } from '../../engine/rng';
import { EPS, makeAutomaton, type Automaton, type Move } from './automaton';

/** A word of length n over the alphabet. */
export function randomWord(rng: Rng, alphabet: readonly string[], n: number): string {
  return Array.from({ length: n }, () => alphabet[rng.int(0, alphabet.length - 1)]!).join('');
}

const names = (n: number) => Array.from({ length: n }, (_, i) => `q${i}`);

function pickAccept(rng: Rng, states: string[]): string[] {
  const out = states.filter(() => rng.int(0, 2) === 0);
  return out.length ? out : [states[rng.int(1, states.length - 1)] ?? states[0]!];
}

/**
 * A DFA with n states over the alphabet, every state reachable from q0 (each new state is
 * reached from an earlier one first). With `partial`, about a quarter of the other moves are
 * left out.
 */
export function randomDfa(
  rng: Rng,
  n: number,
  { alphabet = ['a', 'b'], partial = false }: { alphabet?: string[]; partial?: boolean } = {},
): Automaton {
  const qs = names(n);
  const delta = new Map<string, string>();
  for (let i = 1; i < n; i++) {
    for (;;) {
      const p = qs[rng.int(0, i - 1)]!;
      const c = alphabet[rng.int(0, alphabet.length - 1)]!;
      if (!delta.has(`${p} ${c}`)) {
        delta.set(`${p} ${c}`, qs[i]!);
        break;
      }
    }
  }
  for (const p of qs)
    for (const c of alphabet)
      if (!delta.has(`${p} ${c}`) && !(partial && rng.int(0, 3) === 0))
        delta.set(`${p} ${c}`, qs[rng.int(0, n - 1)]!);
  // Every symbol on some move, so each one shows in the diagram.
  for (const c of alphabet)
    if (![...delta.keys()].some((k) => k.endsWith(` ${c}`)))
      delta.set(`${qs[rng.int(0, n - 1)]} ${c}`, qs[rng.int(0, n - 1)]!);
  return makeAutomaton({
    states: qs,
    alphabet,
    start: 'q0',
    accept: pickAccept(rng, qs),
    moves: [...delta].map(([k, to]) => {
      const [from, on] = k.split(' ') as [string, string];
      return { from, on, to };
    }),
  });
}

/**
 * An NFA with n states over the alphabet: every state reachable from q0, about 1.8 moves per
 * state, so some states have two moves on one symbol and some none, and with `eps` a few
 * ε-moves.
 */
export function randomNfa(
  rng: Rng,
  n: number,
  { alphabet = ['a', 'b'], eps = true }: { alphabet?: string[]; eps?: boolean } = {},
): Automaton {
  const qs = names(n);
  const moves: Move[] = [];
  const sym = () => alphabet[rng.int(0, alphabet.length - 1)]!;
  for (let i = 1; i < n; i++)
    moves.push({
      from: qs[rng.int(0, i - 1)]!,
      on: eps && rng.int(0, 4) === 0 ? EPS : sym(),
      to: qs[i]!,
    });
  const more = Math.round(n * 0.8);
  for (let k = 0; k < more; k++)
    moves.push({
      from: qs[rng.int(0, n - 1)]!,
      on: eps && rng.int(0, 5) === 0 ? EPS : sym(),
      to: qs[rng.int(0, n - 1)]!,
    });
  // Every symbol on some move, so each one shows in the diagram.
  for (const c of alphabet)
    if (!moves.some((m) => m.on === c))
      moves.push({ from: qs[rng.int(0, n - 1)]!, on: c, to: qs[rng.int(0, n - 1)]! });
  return makeAutomaton({
    states: qs,
    alphabet,
    start: 'q0',
    accept: pickAccept(rng, qs),
    moves: moves.filter((m) => !(m.on === EPS && m.from === m.to)),
  });
}
