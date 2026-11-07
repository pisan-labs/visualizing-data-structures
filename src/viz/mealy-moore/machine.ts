/**
 * Finite-state machines with output, as digital logic draws them, built on the shared automaton
 * model (the moves, states and input alphabet are an Automaton with no accept states).
 *
 * - A Moore machine writes on its states: λ(q) is what state q writes, drawn inside the state
 *   (q0 over 0). It writes λ(q0) before it reads anything (Hopcroft and Ullman), then the output
 *   of every state it enters, so a word of n symbols gives n + 1 output symbols. The `first`
 *   setting can leave the start's output out (n symbols).
 * - A Mealy machine writes on its moves: λ(q, c) is what the move from q on c writes, drawn on
 *   the arrow as c/o. A word of n symbols gives n output symbols.
 * - Both are complete and deterministic: one move for every state and input symbol, so a run
 *   never gets stuck and always has something to write.
 *
 * Text format (one line, items separated by ;), the automaton format of _automata/parse.ts plus
 * outputs:
 *
 *   Mealy:  start q0; q0 0 -> q0 / 0; q0 1 -> q1 / 0; q1 0,1 -> q0 / 1
 *           "p a,b -> q / o": every listed symbol moves from p to q and writes o. The label form
 *           "p a/0,b/1 -> q" (as the arrow is drawn) works too.
 *   Moore:  start q0; q0 / 0; q1 / 1; q0 0 -> q0; q0 1 -> q1; q1 0,1 -> q0
 *           "q / o": state q writes o. Moves are plain automaton moves.
 *
 * `start`, `states` and `alphabet` work as for automata; `accept` is refused (a machine with
 * output writes instead of accepting). Output symbols are single letters or digits.
 *
 * API
 *   parseMachine(text) -> Machine or an Error naming the bad item; formatMachine(m) -> text,
 *                         and parseMachine(formatMachine(m)) equals m
 *   runMachine(m, word, first) -> the states passed and what was written
 *   mooreToMealy(m)    each move writes what its target state writes; same states
 *   mealyToMoore(m)    each state split by the outputs written on the moves into it
 *   convert(m)         whichever applies; describeMachine(m), describeFull(m) for sentences
 */
import {
  EPS,
  SYMBOL,
  makeAutomaton,
  setText,
  targets,
  type Automaton,
  type Move,
} from '../_automata/automaton';
import type { Rng } from '../../engine/rng';
import { formatAutomaton, parseAutomaton } from '../_automata/parse';
import { randomDfa } from '../_automata/random';
import { plural, words } from '../_automata/page';

export type Kind = 'mealy' | 'moore';

/** Whether a Moore machine writes its start state's output before reading (n + 1 symbols). */
export type First = 'write' | 'skip';

export interface Machine {
  kind: Kind;
  /** States (name order), the input alphabet Σ, the start and the moves; accept is empty. */
  fa: Automaton;
  /** The output alphabet Δ: every output symbol the machine writes, sorted. */
  outputs: string[];
  /** Moore: what each state writes. Mealy: what each move writes, keyed by moveKey. */
  out: Record<string, string>;
}

/** Room on a phone for both machines at once. */
export const MAX_LOADED = 8;
export const MAX_RESULT = 12;
export const MAX_OUTPUTS = 4;

export const moveKey = (q: string, c: string): string => `${q} ${c}`;

export const kindName = (k: Kind): string => (k === 'mealy' ? 'Mealy' : 'Moore');
export const otherKind = (k: Kind): Kind => (k === 'mealy' ? 'moore' : 'mealy');

/** δ(q, c): a machine here is complete, so there is always exactly one. */
export const delta = (m: Machine, q: string, c: string): string => targets(m.fa, q, c)[0]!;

/** λ(q) for a Moore machine, λ(q, c) for a Mealy machine. */
export const writes = (m: Machine, q: string, c?: string): string =>
  m.kind === 'moore' ? m.out[q]! : m.out[moveKey(q, c!)]!;

/** A normalized copy: the automaton sorted, outputs only for states or moves that exist. */
export function makeMachine(kind: Kind, fa: Automaton, out: Record<string, string>): Machine {
  const a = makeAutomaton({ ...fa, accept: [] });
  const keys = kind === 'moore' ? a.states : a.moves.map((m) => moveKey(m.from, m.on));
  const clean: Record<string, string> = {};
  for (const k of keys) if (out[k] !== undefined) clean[k] = out[k];
  return { kind, fa: a, outputs: [...new Set(Object.values(clean))].sort(), out: clean };
}

/** A string that tells machines apart, for caches and for comparing two machines. */
export const machineKey = (m: Machine): string => `${m.kind}|${formatMachine(m)}`;

// ---------------------------------------------------------------------------------------------
// Text

const ARROW = /->|→/;
const PLAIN_MOVE = /^(\S+)\s+(\S+)\s*(?:->|→)\s*(\S+)$/;
/** "p a,b -> q / o" */
const TAIL = /^(.*?(?:->|→)\s*\S+?)\s*\/\s*(\S+)$/;
/** "q / o" */
const STATE_OUT = /^(\S+?)\s*\/\s*(\S+)$/;

const HINT =
  'Write a Mealy move as "q0 a -> q1 / 1", or a Moore state\'s output as "q0 / 0" with moves such as "q0 a -> q1".';

function outputProblem(o: string, item: string): Error | null {
  return SYMBOL.test(o)
    ? null
    : new Error(`"${o}" in "${item}" is not an output symbol: use one letter or digit.`);
}

/** Read machine text; the Error names the item that is wrong. */
export function parseMachine(raw: string): Machine | Error {
  const items = raw
    .split(/[;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!items.length) return new Error(`Type a machine. ${HINT}`);
  /** Items for parseAutomaton: start, states, alphabet and the moves without their outputs. */
  const fa: string[] = [];
  const moveOut = new Map<string, { o: string }>();
  const stateOut = new Map<string, { o: string }>();
  /** Moves typed without an output, for the error if the machine turns out to be Mealy. */
  const bare: string[] = [];
  /** A move given two outputs; reported once the moves are known to be deterministic. */
  let clash: string | undefined;
  for (const item of items) {
    const head = item.split(/\s+/)[0]!.toLowerCase();
    if (head === 'accept' || head === 'final')
      return new Error(
        `"${item}": a machine with output has no accept states. It writes an output instead of accepting or rejecting.`,
      );
    if (head === 'start' || head === 'states' || head === 'alphabet') {
      fa.push(item);
      continue;
    }
    if (ARROW.test(item)) {
      // A move: "p a,b -> q / o", "p a/0,b/1 -> q", or "p a -> q" with no output.
      const tail = TAIL.exec(item);
      const plain = PLAIN_MOVE.exec(tail ? tail[1]! : item);
      if (!plain) return new Error(`"${item}" is not a move. ${HINT}`);
      const [, from, syms, to] = plain as unknown as [string, string, string, string];
      const pairs = syms.split(',').filter(Boolean);
      const labelled = pairs.some((p) => p.includes('/'));
      if (labelled && tail)
        return new Error(
          `"${item}" gives its outputs twice. Write "${from} a/1 -> ${to}" or "${from} a -> ${to} / 1".`,
        );
      const symbols: string[] = [];
      const outs: string[] = [];
      for (const p of pairs) {
        const [c, o, extra] = p.split('/');
        if (extra !== undefined || (labelled && !o))
          return new Error(`"${p}" in "${item}" is not a symbol and its output, such as a/1.`);
        symbols.push(c!);
        outs.push(labelled ? o! : (tail?.[2] ?? ''));
      }
      const moveText = `${from} ${symbols.join(',')} -> ${to}`;
      // The shared parser checks the state names and symbols, and splits a,b into two moves.
      const one = parseAutomaton(moveText);
      if (one instanceof Error)
        return new Error(one.message.replaceAll(`"${moveText}"`, `"${item}"`));
      if (one.moves.some((m) => m.on === EPS))
        return new Error(
          `"${item}" is an ε-move. A machine with output reads exactly one symbol on every move.`,
        );
      fa.push(moveText);
      for (const o of outs) {
        const bad = o && outputProblem(o, item);
        if (bad) return bad;
      }
      for (const [i, c] of symbols.entries()) {
        const o = outs[i]!;
        const had = moveOut.get(moveKey(from, c));
        if (o && had && had.o !== o)
          clash ??= `${from} on ${c} writes both ${had.o} and ${o}. A move writes one output.`;
      }
      symbols.forEach((c, i) => {
        const o = outs[i]!;
        if (!o) bare.push(item);
        else moveOut.set(moveKey(from, c), { o });
      });
      continue;
    }
    const so = STATE_OUT.exec(item);
    if (so) {
      const [, q, o] = so as unknown as [string, string, string];
      const check = parseAutomaton(`states ${q}`);
      if (check instanceof Error)
        return new Error(check.message.replaceAll(`"states ${q}"`, `"${item}"`));
      const bad = outputProblem(o, item);
      if (bad) return bad;
      const had = stateOut.get(q);
      if (had && had.o !== o)
        return new Error(`${q} is given two outputs, ${had.o} and ${o}. A Moore state writes one.`);
      stateOut.set(q, { o });
      fa.push(`states ${q}`);
      continue;
    }
    return new Error(`"${item}" is not a move or an output. ${HINT}`);
  }
  const a = parseAutomaton(fa.join('; '));
  if (a instanceof Error) return a;
  if (moveOut.size && stateOut.size)
    return new Error(
      'Outputs on moves ("q0 a -> q1 / 1") make a Mealy machine, and outputs on states ("q0 / 0") a Moore machine. Use one or the other.',
    );
  if (!moveOut.size && !stateOut.size)
    return new Error(
      'Give the outputs: on every move for a Mealy machine ("q0 a -> q1 / 1"), or on every state for a Moore machine ("q0 / 0").',
    );
  if (!a.moves.length)
    return new Error('Add moves, such as "q0 a -> q1 / 1", so the machine has something to read.');
  // One move per state and symbol.
  for (const m of a.moves) {
    const ts = targets(a, m.from, m.on);
    if (ts.length > 1)
      return new Error(
        `${m.from} has ${ts.length} moves on ${m.on} (to ${words(ts)}). A machine with output has exactly one, so it always knows what to do.`,
      );
  }
  for (const q of a.states)
    for (const c of a.alphabet)
      if (!targets(a, q, c).length)
        return new Error(
          `${q} has no move on ${c}. A machine with output needs a move for every state and input symbol, so it always has something to write.`,
        );
  if (clash) return new Error(clash);
  const kind: Kind = moveOut.size ? 'mealy' : 'moore';
  const out: Record<string, string> = {};
  if (kind === 'mealy') {
    if (bare.length)
      return new Error(
        `"${bare[0]}" has no output. In a Mealy machine every move writes one: add "/ 0" or "/ 1" at the end.`,
      );
    for (const [k, v] of moveOut) out[k] = v.o;
  } else {
    const missing = a.states.find((q) => !stateOut.has(q));
    if (missing)
      return new Error(
        `${missing} has no output. In a Moore machine every state writes one: add "${missing} / 0".`,
      );
    for (const [q, v] of stateOut) out[q] = v.o;
  }
  const m = makeMachine(kind, a, out);
  if (m.outputs.length > MAX_OUTPUTS)
    return new Error(`Use at most ${MAX_OUTPUTS} different output symbols.`);
  return m;
}

/** Machine text that parseMachine reads back as the same machine. */
export function formatMachine(m: Machine): string {
  const start = `start ${m.fa.start}`;
  if (m.kind === 'moore') {
    // The automaton format's moves, after each state's output.
    const rest = formatAutomaton(m.fa).split('; ').slice(1);
    return [start, ...m.fa.states.map((q) => `${q} / ${m.out[q]}`), ...rest].join('; ');
  }
  const groups = new Map<string, string[]>();
  for (const mv of m.fa.moves) {
    const k = `${mv.from} ${mv.to} ${m.out[moveKey(mv.from, mv.on)]}`;
    groups.set(k, [...(groups.get(k) ?? []), mv.on]);
  }
  const moves = [...groups].map(([k, on]) => {
    const [from, to, o] = k.split(' ');
    return `${from} ${on.join(',')} -> ${to} / ${o}`;
  });
  return [start, ...moves].join('; ');
}

// ---------------------------------------------------------------------------------------------
// Runs

export interface Trace {
  /** path[i] is the state after reading i symbols. */
  path: string[];
  /** The output word. */
  out: string;
}

/**
 * Run a machine on a word. A Mealy machine writes λ(q, c) on each move. A Moore machine writes
 * λ of each state it enters, and first λ(q0) unless `first` is 'skip'.
 */
export function runMachine(m: Machine, word: string, first: First = 'write'): Trace {
  let q = m.fa.start;
  const path = [q];
  let out = m.kind === 'moore' && first === 'write' ? writes(m, q) : '';
  for (const c of word) {
    if (m.kind === 'mealy') out += writes(m, q, c);
    q = delta(m, q, c);
    path.push(q);
    if (m.kind === 'moore') out += writes(m, q);
  }
  return { path, out };
}

// ---------------------------------------------------------------------------------------------
// Conversions

/** Moore to Mealy: every move writes what the state it enters writes. The states stay. */
export function mooreToMealy(m: Machine): Machine {
  const out: Record<string, string> = {};
  for (const mv of m.fa.moves) out[moveKey(mv.from, mv.on)] = m.out[mv.to]!;
  return makeMachine('mealy', m.fa, out);
}

export interface Split {
  machine: Machine;
  /** The outputs written on the moves into each Mealy state, sorted (empty when none enter). */
  entered: Record<string, string[]>;
  /** Each Mealy state's copies in the Moore machine, in the order of their outputs. */
  copies: Record<string, string[]>;
  /** The Mealy state each Moore state is a copy of. */
  of: Record<string, string>;
  /** Moore states in the order they are made: by Mealy state, then by output. */
  order: string[];
}

/** The name of copy i of q: q, q', q'', ... */
export const copyName = (q: string, i: number): string => `${q}${"'".repeat(i)}`;

/**
 * Mealy to Moore: a Moore state writes one output, so each Mealy state q gets one copy per
 * output written on the moves into it (one copy, writing Δ's first symbol, when no move enters
 * it). The copies of q all move like q: a move that writes o in the Mealy machine goes to the
 * copy of its target that writes o. The start is the first copy of q0; what it writes comes out
 * before any input, and nothing in the Mealy machine fixes it. At most |Q|·|Δ| states.
 */
export function mealyToMoore(m: Machine): Split {
  const entered: Record<string, string[]> = {};
  for (const q of m.fa.states)
    entered[q] = [
      ...new Set(m.fa.moves.filter((mv) => mv.to === q).map((mv) => writes(m, mv.from, mv.on))),
    ].sort();
  const copies: Record<string, string[]> = {};
  const of: Record<string, string> = {};
  const out: Record<string, string> = {};
  const order: string[] = [];
  for (const q of m.fa.states) {
    const outs = entered[q]!.length ? entered[q]! : [m.outputs[0]!];
    copies[q] = outs.map((o, i) => {
      const name = copyName(q, i);
      of[name] = q;
      out[name] = o;
      order.push(name);
      return name;
    });
  }
  const copyFor = (q: string, o: string) => copies[q]![entered[q]!.indexOf(o)]!;
  const moves: Move[] = order.flatMap((p) =>
    m.fa.alphabet.map((c) => {
      const q = of[p]!;
      return { from: p, on: c, to: copyFor(delta(m, q, c), writes(m, q, c)) };
    }),
  );
  const fa: Automaton = {
    states: order,
    alphabet: m.fa.alphabet,
    start: copies[m.fa.start]![0]!,
    accept: [],
    moves,
  };
  return { machine: makeMachine('moore', fa, out), entered, copies, of, order };
}

const cache = new Map<string, Machine>();

/** The machine Convert builds: Moore to Mealy, or Mealy to Moore. */
export function convert(m: Machine): Machine {
  const key = machineKey(m);
  const hit = cache.get(key);
  if (hit) return hit;
  const out = m.kind === 'moore' ? mooreToMealy(m) : mealyToMoore(m).machine;
  if (cache.size > 300) cache.clear();
  cache.set(key, out);
  return out;
}

/** Why this machine is too big for the page, or null. */
export function sizeProblem(m: Machine): string | null {
  if (m.fa.states.length > MAX_LOADED)
    return `Use at most ${MAX_LOADED} states, so both machines fit on the screen.`;
  const k = convert(m).fa.states.length;
  if (k > MAX_RESULT)
    return `Its Moore machine would need ${k} states, too many to draw. Use a Mealy machine that needs at most ${MAX_RESULT}.`;
  return null;
}

/**
 * A random machine: n states q0, q1, ... over the inputs, every state reachable from q0, each
 * state (Moore) or move (Mealy) writing a random output, and every output used when there is
 * room for them all.
 */
export function randomMachine(
  rng: Rng,
  kind: Kind,
  n: number,
  { inputs = ['0', '1'], outputs = ['0', '1'] }: { inputs?: string[]; outputs?: string[] } = {},
): Machine {
  const fa = randomDfa(rng, n, { alphabet: inputs });
  const keys = kind === 'moore' ? fa.states : fa.moves.map((m) => moveKey(m.from, m.on));
  const out: Record<string, string> = {};
  for (const k of keys) out[k] = outputs[rng.int(0, outputs.length - 1)]!;
  if (new Set(Object.values(out)).size < Math.min(outputs.length, keys.length)) {
    const shift = rng.int(0, keys.length - 1);
    outputs.forEach((o, i) => {
      if (i < keys.length) out[keys[(i + shift) % keys.length]!] = o;
    });
  }
  return makeMachine(kind, fa, out);
}

// ---------------------------------------------------------------------------------------------
// Sentences

/** "a Mealy machine with 3 states, inputs {0, 1} and outputs {0, 1}: start q0, 6 moves." */
export function describeMachine(m: Machine): string {
  return `a ${kindName(m.kind)} machine with ${plural(m.fa.states.length, 'state')}, inputs ${setText(m.fa.alphabet)} and outputs ${setText(m.outputs)}: start ${m.fa.start}, ${plural(m.fa.moves.length, 'move')}.`;
}

/** Every output and move, for screen readers. */
export function describeFull(m: Machine): string {
  const moves = m.fa.moves.map((mv) =>
    m.kind === 'mealy'
      ? `${mv.from} on ${mv.on} to ${mv.to} writing ${writes(m, mv.from, mv.on)}`
      : `${mv.from} on ${mv.on} to ${mv.to}`,
  );
  const outs =
    m.kind === 'moore'
      ? ` Outputs: ${m.fa.states.map((q) => `${q} writes ${m.out[q]}`).join(', ')}.`
      : '';
  const d = describeMachine(m);
  return `${d[0]!.toUpperCase()}${d.slice(1)}${outs} Moves: ${moves.join('; ')}.`;
}
