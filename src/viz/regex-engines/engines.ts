/**
 * The two engines this page compares, on one machine: the NFA that Thompson's construction
 * builds from the expression (thompson() in src/viz/_automata/regex.ts, through the fragments of
 * src/viz/_automata/thompson-construct.ts).
 *
 * - The backtracker walks one path of the NFA at a time, depth first, the way Perl, Python's re,
 *   Java and JavaScript match. Where two ε-arrows leave a state it takes the first and pushes the
 *   other on a stack of choices; at a dead end it pops the latest choice and goes on from there.
 *   An ε-arrow back to a state already passed at the same input position is skipped, so an empty
 *   loop such as (a*)* cannot spin forever (real engines stop an empty repeat the same way).
 * - The simulation keeps the set of every state the NFA could be in and moves the whole set one
 *   symbol at a time (Thompson 1968; RE2, grep, Go's regexp).
 *
 * Both count steps the same way: one step is one visit to a state at an input position. The
 * simulation visits each (state, position) pair at most once, so it takes at most 2m(n + 1)
 * steps; the backtracker can visit the same pair again and again, once for every path that
 * reaches it.
 *
 * The order of the choices: `greedy` (the default, as in Perl) tries to go into a star (or a ?)
 * before skipping it, and to repeat it before leaving; `lazy` (like *? and ??) tries the other
 * way first. A union always tries its left side first, as every backtracking engine does.
 */
import { closure, EPS, sortStates, type Automaton, type Move } from '../_automata/automaton';
import type { Frag } from '../_automata/thompson-construct';

export type Order = 'greedy' | 'lazy';
export type BtResult = 'accept' | 'reject' | 'stopped';
export type Verdict = 'accept' | 'reject';

/** The backtracker gives up after this many steps. */
export const CAP = 100_000;

export interface Machine {
  nfa: Automaton;
  /** Every state's moves, in the order the backtracker tries them. */
  out: Record<string, Move[]>;
}

/**
 * The NFA with the order of its choices. Each state's moves come from one piece of Thompson's
 * construction (the piece that joins it to the rest), in the order that piece adds them: into a
 * star before around it, back to repeat it before out of it, the left side of a union first.
 * Lazy order turns round the choices of stars, + and ?.
 */
export function machine(nfa: Automaton, frags: readonly Frag[], order: Order): Machine {
  const out: Record<string, Move[]> = {};
  for (const q of nfa.states) out[q] = [];
  for (const f of frags) {
    const mine: Record<string, Move[]> = {};
    for (const m of f.added) (mine[m.from] ??= []).push(m);
    const flip = order === 'lazy' && (f.kind === 'star' || f.kind === 'plus' || f.kind === 'opt');
    for (const [q, ms] of Object.entries(mine)) out[q]!.push(...(flip ? [...ms].reverse() : ms));
  }
  return { nfa, out };
}

/** A choice left for later: the state to go on from and the symbols read by then. */
export interface Choice {
  q: string;
  at: number;
  /** The state where the choice was made. */
  from: string;
}

/** What the backtracker did at one visit. */
export type Visit =
  | { kind: 'accept' }
  | { kind: 'read'; c: string; to: string }
  | { kind: 'eps'; to: string }
  | { kind: 'choice'; to: string; later: string }
  /** No way on: why, and where it backs up to (null when no choice is left). */
  | { kind: 'dead'; why: DeadEnd; back: Choice | null }
  | { kind: 'stopped' };

export type DeadEnd =
  | { kind: 'mismatch'; want: string; got: string }
  | { kind: 'end'; want: string }
  | { kind: 'early' }
  | { kind: 'loop'; to: string[] }
  | { kind: 'stuck' };

interface Pending extends Choice {
  /** States passed at this position on the way to the choice (for the empty-loop check). */
  seen: ReadonlySet<string>;
}

/**
 * The backtracker, one visit per call to visit(). Its fields describe where it is: the state it
 * is at (or will be at on the next visit), the symbols read, and its stack of choices.
 */
export class Backtracker {
  q: string;
  at = 0;
  steps = 0;
  backtracks = 0;
  /** The most choices on the stack at once. */
  deepest = 0;
  result: BtResult | null = null;
  private seen: ReadonlySet<string> = new Set();
  private readonly stack: Pending[] = [];

  constructor(
    readonly m: Machine,
    readonly word: string,
    readonly cap = CAP,
  ) {
    this.q = m.nfa.start;
  }

  /** The choices on the stack, bottom first. */
  choices(): Choice[] {
    return this.stack.map(({ q, at, from }) => ({ q, at, from }));
  }

  get depth(): number {
    return this.stack.length;
  }

  /** Visit the current state: one step. */
  visit(): Visit {
    if (this.result) throw new Error('The backtracker has finished');
    const { q, at, word } = this;
    const a = this.m.nfa;
    this.steps++;
    if (a.accept.includes(q) && at === word.length) {
      this.result = 'accept';
      return { kind: 'accept' };
    }
    if (this.steps >= this.cap) {
      this.result = 'stopped';
      return { kind: 'stopped' };
    }
    const seen = new Set(this.seen).add(q);
    const ways: Pending[] = [];
    const looped: string[] = [];
    let why: DeadEnd = { kind: 'stuck' };
    for (const mv of this.m.out[q]!) {
      if (mv.on === EPS) {
        if (seen.has(mv.to)) looped.push(mv.to);
        else ways.push({ q: mv.to, at, from: q, seen });
      } else if (at < word.length && word[at] === mv.on) {
        ways.push({ q: mv.to, at: at + 1, from: q, seen: new Set() });
      } else {
        why =
          at < word.length
            ? { kind: 'mismatch', want: mv.on, got: word[at]! }
            : { kind: 'end', want: mv.on };
      }
    }
    if (ways.length) {
      const [first, ...rest] = ways;
      for (let i = rest.length - 1; i >= 0; i--) this.stack.push(rest[i]!);
      this.deepest = Math.max(this.deepest, this.stack.length);
      this.go(first!);
      if (rest.length) return { kind: 'choice', to: first!.q, later: rest[0]!.q };
      return first!.at > at
        ? { kind: 'read', c: word[at]!, to: first!.q }
        : { kind: 'eps', to: first!.q };
    }
    if (looped.length) why = { kind: 'loop', to: looped };
    else if (a.accept.includes(q)) why = { kind: 'early' };
    const back = this.stack.pop();
    if (!back) {
      this.result = 'reject';
      return { kind: 'dead', why, back: null };
    }
    this.backtracks++;
    this.go(back);
    return { kind: 'dead', why, back: { q: back.q, at: back.at, from: back.from } };
  }

  private go(p: Pending) {
    this.q = p.q;
    this.at = p.at;
    this.seen = p.seen;
  }

  /** Run to the end (or the cap). */
  finish(): this {
    while (!this.result) this.visit();
    return this;
  }
}

export interface BtCount {
  result: BtResult;
  steps: number;
  backtracks: number;
  deepest: number;
}

export function backtrack(m: Machine, word: string, cap = CAP): BtCount {
  const b = new Backtracker(m, word, cap).finish();
  return { result: b.result!, steps: b.steps, backtracks: b.backtracks, deepest: b.deepest };
}

/** One position of the simulation: the set after reading `read` symbols. */
export interface SimRow {
  read: number;
  /** The live states, in name order. */
  set: string[];
  /** The moves on the symbol just read, from the set before. */
  used: Move[];
  /** Steps so far, this set's included. */
  steps: number;
}

export interface SimCount {
  result: Verdict;
  steps: number;
  /** The largest set. */
  widest: number;
  rows: SimRow[];
}

/**
 * The simulation: S = ε-closure({start}), then for each symbol S = ε-closure(move(S, c)). Each
 * state in each set is one step. It stops early once the set is empty.
 */
export function simulate(m: Machine, word: string): SimCount {
  const a = m.nfa;
  let set = closure(a, [a.start]);
  let steps = set.length;
  const rows: SimRow[] = [{ read: 0, set, used: [], steps }];
  for (let i = 0; i < word.length && set.length; i++) {
    const c = word[i]!;
    const used = set.flatMap((q) => m.out[q]!.filter((mv) => mv.on === c));
    set = closure(a, sortStates(used.map((mv) => mv.to)));
    steps += set.length;
    rows.push({ read: i + 1, set, used, steps });
  }
  const result = set.some((q) => a.accept.includes(q)) ? 'accept' : 'reject';
  return { result, steps, widest: Math.max(...rows.map((r) => r.set.length)), rows };
}
