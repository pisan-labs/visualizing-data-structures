/**
 * DFAs for presets, practice and tests. States are q0, q1, ... and the alphabet is {a, b}
 * (or {a} for the chain).
 *
 *   randomDfa(rng, n)       complete, every state reachable
 *   withCopies(rng, n)      a random DFA of about n/2 states plus copies: states to merge
 *   withJunk(rng, n)        n - 2 reachable states, two the start never reaches, a missing move
 *   chain(n)                "at least n - 1 symbols": one state splits off per round
 *   countMod(n)             "the number of a's is a multiple of n": already minimal
 */
import type { Rng } from '../../engine/rng';
import { makeAutomaton, reachable, type Automaton, type Move } from '../_automata/automaton';

const q = (i: number) => `q${i}`;
const AB = ['a', 'b'];

function build(n: number, moves: Move[], accept: number[], states = n): Automaton {
  return makeAutomaton({
    states: Array.from({ length: states }, (_, i) => q(i)),
    alphabet: AB,
    start: q(0),
    accept: accept.map(q),
    moves,
  });
}

function pickAccept(rng: Rng, n: number): number[] {
  const out = new Set([rng.int(1, n - 1)]);
  for (let i = 0; i < n; i++) if (rng.int(0, 3) === 0) out.add(i);
  if (out.size === n) out.delete(0);
  return [...out];
}

export function randomDfa(rng: Rng, n: number): Automaton {
  for (;;) {
    const moves: Move[] = [];
    for (let i = 0; i < n; i++)
      for (const on of AB) moves.push({ from: q(i), on, to: q(rng.int(0, n - 1)) });
    // A path q0 -> q1 -> ... so every state is reachable.
    for (let i = 0; i + 1 < n; i++) {
      const on = AB[rng.int(0, 1)]!;
      const m = moves.find((x) => x.from === q(i) && x.on === on)!;
      if (rng.int(0, 2)) m.to = q(i + 1);
    }
    const a = build(n, moves, pickAccept(rng, n));
    if (reachable(a).length === n) return a;
  }
}

export function withCopies(rng: Rng, n: number): Automaton {
  const k = Math.max(2, Math.ceil(n / 2));
  const base = randomDfa(rng, k);
  const copyOf = Array.from({ length: n - k }, () => rng.int(0, k - 1));
  const moves: Move[] = [];
  const target = (t: string) => {
    const i = Number(t.slice(1));
    const copies = copyOf.map((c, j) => (c === i ? k + j : -1)).filter((j) => j >= 0);
    return copies.length && rng.int(0, 1) ? q(copies[rng.int(0, copies.length - 1)]!) : t;
  };
  for (const m of base.moves) moves.push({ ...m, to: target(m.to) });
  copyOf.forEach((c, j) => {
    for (const m of base.moves.filter((x) => x.from === q(c)))
      moves.push({ from: q(k + j), on: m.on, to: target(m.to) });
  });
  const accept = base.accept.map((s) => Number(s.slice(1)));
  copyOf.forEach((c, j) => accept.includes(c) && accept.push(k + j));
  return build(n, moves, accept);
}

export function withJunk(rng: Rng, n: number): Automaton {
  const m = Math.max(2, n - 2);
  const base = randomDfa(rng, m);
  const moves = base.moves.filter((x) => !(x.from === q(m - 1) && x.on === 'b'));
  moves.push(
    { from: q(m), on: 'a', to: q(m + 1) },
    { from: q(m), on: 'b', to: q(rng.int(0, m - 1)) },
    { from: q(m + 1), on: 'a', to: q(m) },
  );
  const accept = [...base.accept.map((s) => Number(s.slice(1))), m + 1];
  return build(m + 2, moves, accept, m + 2);
}

export function chain(n: number): Automaton {
  const moves: Move[] = [];
  for (let i = 0; i < n; i++) moves.push({ from: q(i), on: 'a', to: q(Math.min(i + 1, n - 1)) });
  return makeAutomaton({ states: [], alphabet: ['a'], start: q(0), accept: [q(n - 1)], moves });
}

export function countMod(n: number): Automaton {
  const moves: Move[] = [];
  for (let i = 0; i < n; i++)
    moves.push({ from: q(i), on: 'a', to: q((i + 1) % n) }, { from: q(i), on: 'b', to: q(i) });
  return build(n, moves, [0]);
}
