/**
 * The pushdown automaton model: the one-line text format, the step relation, and a
 * breadth-first search over configurations with a cap.
 *
 *   interface Pda     { states; inputs; stackSymbols; start; accept; initial; moves }
 *   interface PdaMove { from; read; pop; to; push }
 *   interface Config  { state; pos; stack }
 *
 * - A move reads one input symbol or nothing (EPS), pops one stack symbol or nothing (EPS),
 *   goes to `to` and pushes `push`, a string whose first symbol ends up on top ('' pushes
 *   nothing). `q0 a, Z -> q1 AZ` reads a, pops Z and pushes AZ, A on top.
 * - A configuration is the state, how many symbols of the word are read (`pos`), and the stack
 *   as a string, top first: (q1, aabb, $) is { state: 'q1', pos: 0, stack: '$' } on aabb.
 * - Conventions follow Sipser: the stack starts empty, a machine usually pushes a marker such
 *   as $ first, and it accepts by final state when some computation has read the whole word
 *   and is in an accept state (ε-moves after the last symbol count). `stack Z` starts the
 *   stack with Z instead (Hopcroft and Ullman's Z₀), which a machine that accepts by empty
 *   stack needs. Accepting by empty stack means: the whole word read and the stack empty.
 *
 * Text (items separated by ; or new lines):
 *
 *   start q0; accept q3; q0 eps, eps -> q1 $; q1 a, eps -> q1 a; q1 b, a -> q2 eps
 *
 *   p a, X -> q γ   a move; eps (or ε) for nothing read, popped or pushed; -> or →
 *   start q         the start state (default: the first move's state)
 *   accept q r      accept states (also `final`)
 *   stack Z         what the stack holds at the start, top first (default: empty)
 *   states q r      states with no moves;  alphabet a b   input symbols no move reads
 *
 * Input symbols are letters, digits and brackets ( ) [ ]; stack symbols may also be $ or #.
 *
 * API
 *   parsePda(text) -> Pda | Error (the message names the bad item); formatPda(p) -> text
 *   parsePdaWord(text, p) -> the word, or an Error naming a symbol not in the alphabet
 *   successors(p, word, c), accepting(p, word, c, by)    the step relation and acceptance
 *   search(p, word, by, cap)   breadth-first search; stops at the first accepting configuration
 *   pathTo(s, id), levels(s), furthest(s), branched(s)    reading a search
 *   isDeterministicPda(p), whyNotDeterministic(p)        no two moves can ever both apply
 *   moveLabel(m) "a, Z → AZ"; configText(c, word) "(q1, abb, a$)"; describeMove(m)
 */
import { compareNames } from '../_graph/graph';
import { EPS, STATE, setText } from './automaton';

export { EPS };

export type AcceptBy = 'state' | 'stack';

export interface PdaMove {
  from: string;
  /** An input symbol, or EPS to read nothing. */
  read: string;
  /** A stack symbol, or EPS to pop nothing. */
  pop: string;
  to: string;
  /** Stack symbols pushed, the first on top; '' pushes nothing. */
  push: string;
}

export interface Pda {
  /** In name order. */
  states: string[];
  /** Input symbols, sorted. */
  inputs: string[];
  /** Stack symbols, sorted. */
  stackSymbols: string[];
  start: string;
  /** In name order. */
  accept: string[];
  /** The stack at the start, top first: '' (Sipser) or a bottom symbol such as Z. */
  initial: string;
  /** Sorted by from, read (ε first), pop (ε first), to and push; no duplicates. */
  moves: PdaMove[];
}

export interface Config {
  state: string;
  /** Symbols of the word read so far. */
  pos: number;
  /** Top first. */
  stack: string;
}

export const INPUT = /^[A-Za-z0-9()[\]]$/;
export const STACK = /^[A-Za-z0-9()[\]$#]$/;

/** Limits that keep the diagram and the stack readable on a phone. */
export const MAX_STATES = 8;
export const MAX_INPUTS = 4;
export const MAX_STACK_SYMBOLS = 8;
export const MAX_MOVES = 24;
export const MAX_PUSH = 4;
export const MAX_WORD = 16;
/** Configurations a search explores at most before it gives up. */
export const CAP = 200;

const bySym = (a: string, b: string) =>
  a === b ? 0 : a === EPS ? -1 : b === EPS ? 1 : a < b ? -1 : 1;

const sortStates = (qs: Iterable<string>) => [...new Set(qs)].sort(compareNames);

/** A normalized copy: sorted, duplicates dropped, alphabets filled in. */
export function makePda(p: Pda): Pda {
  const seen = new Set<string>();
  const moves = p.moves
    .filter((m) => {
      const k = moveKey(m);
      return seen.has(k) ? false : (seen.add(k), true);
    })
    .map((m) => ({ ...m }))
    .sort(
      (m, n) =>
        compareNames(m.from, n.from) ||
        bySym(m.read, n.read) ||
        bySym(m.pop, n.pop) ||
        compareNames(m.to, n.to) ||
        (m.push < n.push ? -1 : m.push > n.push ? 1 : 0),
    );
  const states = sortStates([
    ...p.states,
    p.start,
    ...p.accept,
    ...moves.flatMap((m) => [m.from, m.to]),
  ]);
  const inputs = [
    ...new Set([...p.inputs, ...moves.map((m) => m.read).filter((c) => c !== EPS)]),
  ].sort();
  const stackSymbols = [
    ...new Set([
      ...p.stackSymbols,
      ...p.initial,
      ...moves.flatMap((m) => [...(m.pop === EPS ? '' : m.pop), ...m.push]),
    ]),
  ].sort();
  return {
    states,
    inputs,
    stackSymbols,
    start: p.start,
    accept: sortStates(p.accept),
    initial: p.initial,
    moves,
  };
}

const moveKey = (m: PdaMove) =>
  `${m.from}\u0000${m.read}\u0000${m.pop}\u0000${m.to}\u0000${m.push}`;

// ---------------------------------------------------------------------------------------------
// Text

const MOVE = /^(\S+)\s+([^,\s]+)\s*,\s*(\S+?)\s*(?:->|→)\s*(\S+)(?:\s+(\S+))?$/;
const isEps = (t: string) => t === 'eps' || t === EPS;

export function parsePda(raw: string): Pda | Error {
  const items = raw
    .split(/[;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!items.length)
    return new Error(
      'Type moves such as "q0 a, eps -> q0 a; q0 b, a -> q1 eps; accept q1", separated by ;.',
    );
  let start: string | undefined;
  let initial: string | undefined;
  const accept: string[] = [];
  const states: string[] = [];
  const inputs: string[] = [];
  const moves: PdaMove[] = [];
  const state = (name: string, item: string): string | Error =>
    STATE.test(name)
      ? name
      : new Error(
          `"${name}" in "${item}" is not a state name: use 1 to 6 letters, digits or _, such as q0.`,
        );
  /** A string of stack symbols, top first, or an Error. */
  const stackString = (text: string, item: string, what: string): string | Error => {
    if (isEps(text)) return '';
    for (const c of text)
      if (!STACK.test(c))
        return new Error(
          `"${c}" in "${item}" is not a stack symbol: use letters, digits, brackets, $ or #.`,
        );
    if (text.length > MAX_PUSH)
      return new Error(`"${item}" ${what} ${text.length} symbols; use at most ${MAX_PUSH}.`);
    return text;
  };
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
        if (isEps(c))
          return new Error(`"${item}": ε is not a symbol of the alphabet; it is the empty word.`);
        if (!INPUT.test(c))
          return new Error(
            `"${c}" in "${item}" is not an input symbol: use one letter, digit or bracket.`,
          );
      }
      inputs.push(...syms);
      continue;
    }
    if (head === 'stack') {
      const text = words.slice(1).join('');
      if (!text)
        return new Error(
          `"${item}" needs the symbols the stack starts with, such as "stack Z". Leave the item out for an empty stack.`,
        );
      const s = stackString(text, item, 'starts the stack with');
      if (s instanceof Error) return s;
      if (initial !== undefined) return new Error(`"${item}": the stack is already set.`);
      initial = s;
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
    const m = MOVE.exec(item);
    if (!m)
      return new Error(
        `"${item}" is not a move. Write a move as "q0 a, Z -> q1 AZ" (read a, pop Z, push AZ), or use start, accept, stack, states or alphabet.`,
      );
    const from = state(m[1]!, item);
    if (from instanceof Error) return from;
    const to = state(m[4]!, item);
    if (to instanceof Error) return to;
    const read = m[2]!;
    if (!isEps(read) && !INPUT.test(read))
      return new Error(
        `"${read}" in "${item}" is not a symbol to read: use one letter, digit or bracket, or eps to read nothing.`,
      );
    const pop = m[3]!;
    if (!isEps(pop) && !STACK.test(pop))
      return new Error(
        pop.length > 1
          ? `"${pop}" in "${item}" cannot be popped: a move pops one stack symbol, or eps for none.`
          : `"${pop}" in "${item}" is not a stack symbol: use letters, digits, brackets, $ or #.`,
      );
    if (m[5] === undefined)
      return new Error(
        `"${item}" needs what to push after ${to}: a string such as AZ (A ends up on top), or eps to push nothing.`,
      );
    const push = stackString(m[5], item, 'pushes');
    if (push instanceof Error) return push;
    moves.push({
      from,
      read: isEps(read) ? EPS : read,
      pop: isEps(pop) ? EPS : pop,
      to,
      push,
    });
  }
  if (start === undefined) start = moves[0]?.from ?? states[0];
  if (start === undefined) return new Error('Name a start state ("start q0") or add a move.');
  const p = makePda({
    states,
    inputs,
    stackSymbols: [],
    start,
    accept,
    initial: initial ?? '',
    moves,
  });
  if (p.states.length > MAX_STATES)
    return new Error(`Use at most ${MAX_STATES} states, so the diagram stays readable.`);
  if (p.inputs.length > MAX_INPUTS)
    return new Error(`Use at most ${MAX_INPUTS} different input symbols.`);
  if (p.stackSymbols.length > MAX_STACK_SYMBOLS)
    return new Error(`Use at most ${MAX_STACK_SYMBOLS} different stack symbols.`);
  if (p.moves.length > MAX_MOVES) return new Error(`Use at most ${MAX_MOVES} moves.`);
  return p;
}

const symText = (s: string) => (s === EPS || s === '' ? 'ε' : s);

/** The machine as text; parsePda(formatPda(p)) equals p. */
export function formatPda(p: Pda): string {
  const used = new Set([p.start, ...p.moves.flatMap((m) => [m.from, m.to])]);
  const lonely = p.states.filter((q) => !used.has(q));
  const named = p.inputs.some((c) => !p.moves.some((m) => m.read === c));
  return [
    `start ${p.start}`,
    ...(p.accept.length ? [`accept ${p.accept.join(' ')}`] : []),
    ...(p.initial ? [`stack ${p.initial}`] : []),
    ...(lonely.length ? [`states ${lonely.join(' ')}`] : []),
    ...(named ? [`alphabet ${p.inputs.join(' ')}`] : []),
    ...p.moves.map(
      (m) => `${m.from} ${symText(m.read)}, ${symText(m.pop)} -> ${m.to} ${symText(m.push)}`,
    ),
  ].join('; ');
}

/** A word to run: ε (or eps) for the empty word, spaces ignored, symbols from the alphabet. */
export function parsePdaWord(raw: string, p: Pda): string | Error {
  const w = raw.replace(/\s+/g, '');
  if (isEps(w)) return '';
  if (w.length > MAX_WORD) return new Error(`Keep the input to ${MAX_WORD} symbols or fewer.`);
  for (const c of w)
    if (!p.inputs.includes(c))
      return new Error(
        `"${c}" is not in the input alphabet ${setText(p.inputs)}. Type a word over it, or ε for the empty word.`,
      );
  return w;
}

// ---------------------------------------------------------------------------------------------
// Moves and configurations

/** "a, Z → AZ": read, pop, push, as the diagram labels a move. */
export const moveLabel = (m: PdaMove): string =>
  `${symText(m.read)}, ${symText(m.pop)} → ${symText(m.push)}`;

/** "(q1, abb, a$)", with ε for an input read to the end or an empty stack. */
export const configText = (c: Config, word: string): string =>
  `(${c.state}, ${symText(word.slice(c.pos))}, ${symText(c.stack)})`;

/** What a move does, in words: "read a and push a", "pop $ without reading". */
export function describeMove(m: PdaMove): string {
  const acts = [
    m.read !== EPS ? `read ${m.read}` : '',
    m.pop !== EPS ? `pop ${m.pop}` : '',
    m.push ? `push ${m.push}` : '',
  ].filter(Boolean);
  if (!acts.length) return 'move without reading, popping or pushing';
  const said = acts.length === 1 ? acts[0]! : `${acts.slice(0, -1).join(', ')} and ${acts.at(-1)}`;
  return m.read === EPS ? `${said} without reading` : said;
}

export const startConfig = (p: Pda): Config => ({ state: p.start, pos: 0, stack: p.initial });

export const configKey = (c: Config): string => `${c.state}|${c.pos}|${c.stack}`;

/** Does move m apply in configuration c on this word? */
export function fits(m: PdaMove, word: string, c: Config): boolean {
  return (
    m.from === c.state &&
    (m.read === EPS || word[c.pos] === m.read) &&
    (m.pop === EPS || c.stack[0] === m.pop)
  );
}

export function apply(m: PdaMove, c: Config): Config {
  return {
    state: m.to,
    pos: c.pos + (m.read === EPS ? 0 : 1),
    stack: m.push + (m.pop === EPS ? c.stack : c.stack.slice(1)),
  };
}

/** Every configuration one move from c, with the index of the move, in move order. */
export function successors(p: Pda, word: string, c: Config): { move: number; config: Config }[] {
  const out: { move: number; config: Config }[] = [];
  p.moves.forEach((m, i) => {
    if (fits(m, word, c)) out.push({ move: i, config: apply(m, c) });
  });
  return out;
}

/** Has c read the whole word, in an accept state (by state) or with an empty stack? */
export function accepting(p: Pda, word: string, c: Config, by: AcceptBy): boolean {
  return c.pos === word.length && (by === 'state' ? p.accept.includes(c.state) : c.stack === '');
}

// ---------------------------------------------------------------------------------------------
// Search

export interface SearchNode {
  id: number;
  config: Config;
  /** The configuration it came from, and the index of the move; null for the start. */
  parent: number | null;
  move: number | null;
  /** Moves from the start. */
  depth: number;
  /** The search took it off the queue and tried its moves. */
  tried: boolean;
  /** Moves that fit it (once tried). */
  fits: number;
  /** The new configurations its moves made. */
  kids: number[];
}

export type Outcome = 'accept' | 'reject' | 'stopped';

export interface Search {
  word: string;
  by: AcceptBy;
  /** In the order found, which is breadth-first: by depth, then by the order of the queue. */
  nodes: SearchNode[];
  outcome: Outcome;
  /** The accepting configuration, when the outcome is accept. */
  found: number | null;
}

/**
 * Breadth-first search over configurations from the start configuration. Each configuration
 * taken off the queue tries every move that fits, in move order; a configuration seen before
 * is skipped, so a loop of ε-moves that leaves the stack alone ends. The search accepts at the
 * first accepting configuration it makes (so with the fewest moves), rejects when the queue
 * runs out (every branch has died), and stops without an answer once it has made `cap`
 * configurations: ε-moves that push can make new configurations forever.
 */
export function search(p: Pda, word: string, by: AcceptBy, cap = CAP): Search {
  const start = startConfig(p);
  const nodes: SearchNode[] = [
    { id: 0, config: start, parent: null, move: null, depth: 0, tried: false, fits: 0, kids: [] },
  ];
  const done = (outcome: Outcome, found: number | null = null): Search => ({
    word,
    by,
    nodes,
    outcome,
    found,
  });
  if (accepting(p, word, start, by)) return done('accept', 0);
  const seen = new Set([configKey(start)]);
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]!;
    n.tried = true;
    const next = successors(p, word, n.config);
    n.fits = next.length;
    for (const s of next) {
      const k = configKey(s.config);
      if (seen.has(k)) continue;
      if (nodes.length >= cap) return done('stopped');
      const kid: SearchNode = {
        id: nodes.length,
        config: s.config,
        parent: n.id,
        move: s.move,
        depth: n.depth + 1,
        tried: false,
        fits: 0,
        kids: [],
      };
      nodes.push(kid);
      seen.add(k);
      n.kids.push(kid.id);
      if (accepting(p, word, s.config, by)) return done('accept', kid.id);
    }
  }
  return done('reject');
}

/** The node ids from the start to `id`. */
export function pathTo(s: Search, id: number): number[] {
  const out: number[] = [];
  for (let at: number | null = id; at !== null; at = s.nodes[at]!.parent) out.push(at);
  return out.reverse();
}

/** The node ids at each depth, in the order found. */
export function levels(s: Search): number[][] {
  const out: number[][] = [];
  for (const n of s.nodes) (out[n.depth] ??= []).push(n.id);
  return out;
}

/**
 * The configuration to show when nothing accepts: the one that read the most of the word, and
 * of those the one with the most moves (the furthest a branch got), the first found on a tie.
 */
export function furthest(s: Search): number {
  let best = s.nodes[0]!;
  for (const n of s.nodes)
    if (
      n.config.pos > best.config.pos ||
      (n.config.pos === best.config.pos && n.depth > best.depth)
    )
      best = n;
  return best.id;
}

/** Did any configuration have a choice of moves? */
export const branched = (s: Search): boolean => s.nodes.some((n) => n.fits > 1);

// ---------------------------------------------------------------------------------------------
// Determinism

const agree = (x: string, y: string) => x === EPS || y === EPS || x === y;

/**
 * Two moves out of the same state that could both apply: their reads agree (equal, or one
 * reads nothing) and their pops agree (equal, or one pops nothing). A PDA with no such pair is
 * deterministic: every configuration has at most one move.
 */
export function clash(p: Pda): [PdaMove, PdaMove] | null {
  for (let i = 0; i < p.moves.length; i++)
    for (let j = i + 1; j < p.moves.length; j++) {
      const m = p.moves[i]!;
      const n = p.moves[j]!;
      if (m.from === n.from && agree(m.read, n.read) && agree(m.pop, n.pop)) return [m, n];
    }
  return null;
}

export const isDeterministicPda = (p: Pda): boolean => clash(p) === null;

/** "q1 can read a with nothing popped and also ..." for a machine that is not deterministic. */
export function whyNotDeterministic(p: Pda): string | null {
  const c = clash(p);
  if (!c) return null;
  const [m, n] = c;
  return `in ${m.from}, the moves ${moveLabel(m)} and ${moveLabel(n)} can both apply`;
}

/** A string that tells machines apart, for caches. */
export const pdaKey = (p: Pda): string => `${p.initial}|${p.accept.join(',')}|${formatPda(p)}`;
