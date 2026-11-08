/**
 * Union and intersection of DFAs: the product construction (Sipser, Theorem 1.25), for union,
 * intersection, difference and symmetric difference, and the complement of one DFA.
 *
 * The state is the two machines, A and B, over one alphabet, and whether their product has been
 * built. The product itself follows from them and the `op` setting (product.ts), so a Build
 * run's bookkeeping (the pairs found, the queue, the pair being worked on) travels in the
 * steps' `extra`, as does a word run on all three machines at once.
 *
 * Operations
 *   load "A | B"     two DFAs in the automaton text format, separated by |
 *   build            the product, one pair at a time, breadth first from the start pair
 *   run w            the word on A, B and the product side by side
 *   complementA/B    complete the machine with a dead state, then swap accept and non-accept
 */
import type { Mark, OpSpec, PseudoBlock, Scalar, Step } from '../../engine/types';
import { moveId, stateId } from '../../layouts/automaton';
import { setText, type Automaton, type Move } from '../_automata/automaton';
import { PAIR_SEPARATOR, parseAutomatonPair, parseWord } from '../_automata/parse';
import {
  describeMachine,
  looksLikeMachine,
  plural,
  whyNotDfa,
  wordText,
  words,
  type Verdict,
} from '../_automata/page';
import { verdictId } from '../_automata/panels';
import { MACHINES, MAX_PAIRS, MAX_SIDE, pairCount } from './machines';
import {
  OPS,
  addedMoves,
  align,
  complementOf,
  deadOf,
  full,
  pairName,
  pairText,
  productOf,
  whyPair,
  type Product,
  type SetOp,
} from './product';

export interface ProdState {
  a: Automaton;
  b: Automaton;
  /** The product has been built (or run), so an idle drawing shows it. */
  built: boolean;
}

export interface ProdSettings {
  [key: string]: Scalar;
  op: SetOp;
}

export const defaults: ProdSettings = { op: 'union' };

/** Shape id prefixes: A's diagram, B's, and the product's. */
export const A_PREFIX = 'a-';
export const B_PREFIX = 'b-';
export const P_PREFIX = 'p-';

export interface BuildRun {
  op: SetOp;
  /** A and B are drawn complete: their dead states (if they need one) have been added. */
  fullA: boolean;
  fullB: boolean;
  /** Pairs found, in the order found. */
  rows: string[];
  /** Product moves found. */
  moves: Move[];
  /** Pairs found that accept. */
  accept: string[];
  queue: string[];
  done: string[];
  /** The pair being worked on, and the symbol. */
  T?: string;
  c?: string;
  finished: boolean;
}

export interface WordRun {
  word: string;
  read: number;
  /** A's state and B's state: the product is in the pair of them. */
  p: string;
  q: string;
  lastA?: Move;
  lastB?: Move;
  verdict?: Verdict;
  /** What A and B say at the end. */
  verdictA?: Verdict;
  verdictB?: Verdict;
}

export interface ProdExtra {
  build?: BuildRun;
  run?: WordRun;
}

type S = ProdState;
type X = ProdExtra;
type PStep = Step<S, X>;
type Op = OpSpec<S, ProdSettings, X>;

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });

export const aState = (q: string) => stateId(q, A_PREFIX);
export const bState = (q: string) => stateId(q, B_PREFIX);
export const pState = (n: string) => stateId(n, P_PREFIX);
export const rowCell = (pair: string, col: string) => `tbl-${pair}-${col}`;

// ---------------------------------------------------------------------------------------------
// Reading two machines

export const SEPARATOR = PAIR_SEPARATOR;

export interface Loaded {
  a: Automaton;
  b: Automaton;
  /** The machines as typed, before their alphabets were joined. */
  typed: [Automaton, Automaton];
  /** The alphabets differ. */
  differ: boolean;
}

const EXAMPLE = '"p0 a -> p1; accept p1 | q0 b -> q1; accept q1"';

/** "A | B" -> two DFAs over one alphabet, or an Error that names the machine and the item. */
export function parseMachines(raw: string): Loaded | Error {
  const got = parseAutomatonPair(raw, {
    example: EXAMPLE,
    need: 'The product needs both.',
    check: (m, name) => {
      const why = whyNotDfa(m);
      return why
        ? `Machine ${name} is not a DFA: ${why}. The NFA to DFA page turns an NFA into a DFA first.`
        : null;
    },
  });
  if (got instanceof Error) return got;
  const [a0, b0] = got;
  const [a, b] = align(a0, b0);
  for (const [name, m] of [
    ['A', a],
    ['B', b],
  ] as const) {
    const n = full(m).states.length;
    if (n > MAX_SIDE)
      return new Error(
        n > m.states.length
          ? `Machine ${name} has ${n} states once a dead state takes its missing moves. Use at most ${MAX_SIDE} with the dead state, so the grid of pairs fits on a phone.`
          : `Machine ${name} has ${n} states. Use at most ${MAX_SIDE}, so the grid of pairs fits on a phone.`,
      );
  }
  const k = pairCount(a, b);
  if (k > MAX_PAIRS)
    return new Error(
      `Their product reaches ${k} pairs, too many to draw. Use machines whose product reaches at most ${MAX_PAIRS}.`,
    );
  return { a, b, typed: [a0, b0], differ: a0.alphabet.join() !== b0.alphabet.join() };
}

export const looksLikeMachines = (t: string): boolean =>
  looksLikeMachine(t) || t.includes(SEPARATOR);

/** Why a word cannot be run on these machines, or null. */
export function wordProblem(raw: string, a: Automaton): string | null {
  const t = raw.trim();
  if (looksLikeMachines(t)) return 'That looks like machines: press Load to load them.';
  if (/^[+-]/.test(t))
    return `"${t}" is not a word: use letters and digits, or ε (eps) for the empty word.`;
  const w = parseWord(t, a);
  return w instanceof Error ? w.message : null;
}

// ---------------------------------------------------------------------------------------------
// The starting machines

/** Even a's (A) and ends in b (B): four pairs, all reachable. */
export const START_TEXT = `${MACHINES.evenA} | ${MACHINES.endsB}`;

export function init(): S {
  const r = parseMachines(START_TEXT) as Loaded;
  return { a: r.a, b: r.b, built: false };
}

// ---------------------------------------------------------------------------------------------
// Variables and descriptions

const NONE = '–';

export function baseVars(s: S): Record<string, Scalar> {
  return {
    '|A|': full(s.a).states.length,
    '|B|': full(s.b).states.length,
    '|Σ|': s.a.alphabet.length,
  };
}

function buildVars(s: S, r: BuildRun): Record<string, Scalar> {
  return {
    ...baseVars(s),
    pairs: r.rows.length,
    queue: r.queue.length,
    pair: r.T ?? NONE,
    c: r.c ?? NONE,
  };
}

function runVars(r: WordRun | null): Record<string, Scalar> {
  if (!r) return { A: NONE, B: NONE, pair: NONE, read: 0 };
  return { A: r.p, B: r.q, pair: pairText(r.p, r.q), read: r.read };
}

export function describe(s: S, settings?: ProdSettings): string {
  const moves = (m: Automaton) => m.moves.map((x) => `${x.from} on ${x.on} to ${x.to}`).join('; ');
  const op = settings
    ? ` The operation is ${OPS[settings.op].label}, the ${OPS[settings.op].name}.`
    : '';
  return `Machine A: ${describeMachine(s.a)} Moves: ${moves(s.a) || 'none'}. Machine B: ${describeMachine(s.b)} Moves: ${moves(s.b) || 'none'}.${op}`;
}

/** The scene label for a build: the pairs so far. */
export function describeBuild(r: BuildRun, pr: Product): string {
  const rows = r.rows.map((n) => {
    const [p, q] = pr.pairs[n]!;
    const out = r.moves
      .filter((m) => m.from === n)
      .map((m) => `on ${m.on} to ${pairText(...pr.pairs[m.to]!)}`);
    return `${pairText(p, q)}${r.accept.includes(n) ? ' (accepts)' : ''}${out.length ? `: ${out.join(', ')}` : ''}`;
  });
  return `The product so far: ${rows.length ? rows.join('; ') : 'no pairs yet'}. Queue: ${
    r.queue.length ? r.queue.map((n) => pairText(...pr.pairs[n]!)).join(', ') : 'empty'
  }.`;
}

export function describeRun(r: WordRun): string {
  const at = `A is in ${r.p}, B in ${r.q}, so the product is in ${pairText(r.p, r.q)}`;
  const v = r.verdict ? `; it ${r.verdict}s` : '';
  return `Run on ${wordText(r.word)}: ${r.read} of ${plural(r.word.length, 'symbol')} read. ${at}${v}.`;
}

export function initialSay(s: S, settings: ProdSettings): string {
  return `Two DFAs: A with ${plural(s.a.states.length, 'state')} and B with ${plural(s.b.states.length, 'state')}. Press Build to make one machine for ${OPS[settings.op].label}: each of its states is a pair, one state from each.`;
}

export const initialVars = (s: S): Record<string, Scalar> => baseVars(s);

// ---------------------------------------------------------------------------------------------
// Load

const load: Op = {
  label: 'Load',
  arity: 1,
  *run(s, [arg]) {
    const text = String(arg ?? '').trim();
    const r = parseMachines(text);
    if (r instanceof Error) {
      const why =
        text && !looksLikeMachines(text)
          ? `"${text}" is not two machines. Type them with a | between, such as ${EXAMPLE}; to run a word, press Run.`
          : r.message;
      yield {
        state: s,
        marks: [],
        say: `Nothing loaded. ${why} The machines stay as they were.`,
        lines: [],
        level: 1,
        vars: baseVars(s),
      } satisfies PStep;
      return s;
    }
    const next: S = { a: r.a, b: r.b, built: false };
    const differ = r.differ
      ? ` Their alphabets differ, so both now read ${setText(r.a.alphabet)}. A symbol a machine never used has no moves yet: completing the machine sends it to a dead state.`
      : '';
    yield {
      state: next,
      marks: [],
      say: `Loaded A, ${describeMachine(r.typed[0])} And B, ${describeMachine(r.typed[1])}${differ} Press Build.`,
      lines: [],
      level: 1,
      vars: baseVars(next),
    } satisfies PStep;
    return next;
  },
};

// ---------------------------------------------------------------------------------------------
// Build

function clone(r: BuildRun): BuildRun {
  return {
    ...r,
    rows: [...r.rows],
    moves: r.moves.map((m) => ({ ...m })),
    accept: [...r.accept],
    queue: [...r.queue],
    done: [...r.done],
  };
}

/** The steps that add a dead state to A or B, if it needs one. */
function* completeSteps(
  m: Automaton,
  name: 'A' | 'B',
  prefix: string,
  step: (say: string, lines: string[], level: 1 | 2 | 3, marks: Mark[]) => PStep,
  again: boolean,
): Generator<PStep, void, void> {
  const dead = deadOf(m);
  if (!dead) return;
  const added = addedMoves(m).filter((x) => x.from !== dead);
  const first = added[0]!;
  const more = added.length > 1 ? ` (and ${plural(added.length - 1, 'other missing move')})` : '';
  const say = again
    ? `${name} has no move from ${first.from} on ${first.on}${more} either, so ${name} gets a dead state too, ${dead}.`
    : `${name} has no move from ${first.from} on ${first.on}${more}. A pair moves only when both machines can, so ${name} gets a dead state, ${dead}: every missing move goes there, it loops on every symbol, and it never accepts.`;
  yield step(say, ['complete'], 2, [
    mark(stateId(dead, prefix), 'new'),
    ...[...new Set(added.map((x) => x.from))].map((p) => mark(moveId(p, dead, prefix), 'new')),
    mark(moveId(dead, dead, prefix), 'new'),
  ]);
}

const build: Op = {
  label: 'Build',
  arity: 0,
  *run(s, _args, { settings }) {
    const op = settings.op;
    const info = OPS[op];
    const A = full(s.a);
    const B = full(s.b);
    const pr = productOf(A, B, op);
    const next: S = { ...s, built: true };
    const r: BuildRun = {
      op,
      fullA: false,
      fullB: false,
      rows: [],
      moves: [],
      accept: [],
      queue: [],
      done: [],
      finished: false,
    };
    const step = (say: string, lines: string[], level: 1 | 2 | 3, marks: Mark[] = []): PStep => ({
      state: next,
      marks,
      say,
      lines,
      level,
      vars: buildVars(s, r),
      extra: { build: clone(r) },
    });
    r.fullA = true;
    yield* completeSteps(s.a, 'A', A_PREFIX, step, false);
    r.fullB = true;
    yield* completeSteps(s.b, 'B', B_PREFIX, step, deadOf(s.a) !== null);

    const accepts = (n: string) => {
      const [p, q] = pr.pairs[n]!;
      return { p, q, x: A.accept.includes(p), y: B.accept.includes(q) };
    };
    const reason = (n: string) => {
      const { p, q, x, y } = accepts(n);
      return whyPair(op, p, q, x, y);
    };
    const add = (n: string) => {
      r.rows.push(n);
      r.queue.push(n);
      if (pr.dfa.accept.includes(n)) r.accept.push(n);
    };

    const s0 = pr.order[0]!;
    add(s0);
    yield step(
      `The product for ${info.label} starts in the pair of start states, ${pairText(A.start, B.start)}: A starts in ${A.start}, B in ${B.start}. ${reason(s0)} Put it in the queue.`,
      ['start', 'acc'],
      2,
      [
        mark(aState(A.start), 'active'),
        mark(bState(B.start), 'active'),
        mark(pState(s0), 'new'),
        mark(`${P_PREFIX}start`, 'new'),
        mark(rowCell(s0, 'pair'), 'new'),
        mark(rowCell(s0, 'op'), pr.dfa.accept.includes(s0) ? 'found' : 'new'),
      ],
    );

    while (r.queue.length) {
      const T = r.queue.shift()!;
      const [p, q] = pr.pairs[T]!;
      r.T = T;
      r.c = undefined;
      const tMarks = [
        mark(aState(p), 'active'),
        mark(bState(q), 'active'),
        mark(pState(T), 'active'),
        mark(rowCell(T, 'pair'), 'active'),
      ];
      yield step(
        `Take ${pairText(p, q)} from the front of the queue. Where does each symbol take it?`,
        ['while', 'deq'],
        2,
        tMarks,
      );
      for (const c of A.alphabet) {
        r.c = c;
        const to = pr.dfa.moves.find((m) => m.from === T && m.on === c)!.to;
        const [p2, q2] = pr.pairs[to]!;
        const goes = (x: string, y: string) =>
          x === y ? `stays in ${x}` : `goes from ${x} to ${y}`;
        yield step(`On ${c}: A ${goes(p, p2)} and B ${goes(q, q2)}.`, ['for', 'move'], 3, [
          ...tMarks,
          mark(moveId(p, p2, A_PREFIX), 'active'),
          mark(moveId(q, q2, B_PREFIX), 'active'),
          mark(aState(p2), 'new'),
          mark(bState(q2), 'new'),
        ]);
        const fresh = !r.rows.includes(to);
        r.moves.push({ from: T, on: c, to });
        const moveMarks = [
          ...tMarks,
          mark(aState(p2), 'new'),
          mark(bState(q2), 'new'),
          mark(moveId(T, to, P_PREFIX), 'new'),
          mark(rowCell(T, `on-${c}`), 'new'),
        ];
        if (fresh) {
          add(to);
          yield step(
            `So on ${c}, ${pairText(p, q)} goes to ${pairText(p2, q2)}. That pair is new: it becomes a state and joins the queue. ${reason(to)}`,
            ['move', 'if', 'add', 'acc', 'delta'],
            2,
            [
              ...moveMarks,
              mark(pState(to), 'new'),
              mark(rowCell(to, 'pair'), 'new'),
              mark(rowCell(to, 'op'), pr.dfa.accept.includes(to) ? 'found' : 'new'),
            ],
          );
        } else {
          const it = to === T ? 'itself' : `${pairText(p2, q2)}, a pair we already have`;
          yield step(`So on ${c}, ${pairText(p, q)} goes to ${it}.`, ['move', 'if', 'delta'], 2, [
            ...moveMarks,
            ...(to === T ? [] : [mark(pState(to), 'found')]),
          ]);
        }
      }
      r.done.push(T);
      r.c = undefined;
      const summary = A.alphabet
        .map(
          (c) =>
            `on ${c} to ${pairText(...pr.pairs[r.moves.find((m) => m.from === T && m.on === c)!.to]!)}`,
        )
        .join(', ');
      yield step(
        `${pairText(p, q)} is done${summary ? `: ${summary}` : ''}. ${
          r.queue.length
            ? `Queue: ${r.queue.map((n) => pairText(...pr.pairs[n]!)).join(', ')}.`
            : 'The queue is empty.'
        }`,
        ['while'],
        1,
        [mark(pState(T), 'done'), mark(rowCell(T, 'pair'), 'done')],
      );
    }
    r.T = undefined;
    r.finished = true;
    const k = r.rows.length;
    const cells = A.states.length * B.states.length;
    const size =
      k === cells
        ? `every one of the ${A.states.length} × ${B.states.length} = ${cells} pairs`
        : `${k} of the ${A.states.length} × ${B.states.length} = ${cells} pairs. No word takes A and B to ${cells - k === 1 ? 'the other pair' : `the other ${cells - k} pairs`} at the same time, so ${cells - k === 1 ? 'it is' : 'they are'} never built`;
    const acc = r.accept.length
      ? `${words(r.accept.map((n) => pairText(...pr.pairs[n]!)))} ${r.accept.length === 1 ? 'accepts' : 'accept'}, and the product accepts exactly the words ${info.means}.`
      : `No pair it can reach accepts, so ${info.label} is empty: no word is ${info.means}.`;
    yield step(
      `The product is finished: ${plural(k, 'state')}, ${size}. ${acc}`,
      ['while', 'acc'],
      1,
      r.accept.map((n) => mark(pState(n), 'found')),
    );
    return next;
  },
};

// ---------------------------------------------------------------------------------------------
// Run a word on A, B and the product

const run: Op = {
  label: 'Run',
  arity: 1,
  *run(s, [arg], { settings }) {
    const op = settings.op;
    const info = OPS[op];
    const A = full(s.a);
    const B = full(s.b);
    const raw = String(arg ?? '');
    const problem = wordProblem(raw, A);
    if (problem) {
      yield {
        state: s,
        marks: [],
        say: `Nothing to run. ${problem}`,
        lines: ['run.sig'],
        level: 1,
        vars: runVars(null),
      } satisfies PStep;
      return s;
    }
    const word = parseWord(raw, A) as string;
    const next: S = { ...s, built: true };
    const r: WordRun = { word, read: 0, p: A.start, q: B.start };
    const step = (say: string, lines: string[], level: 1 | 2 | 3, marks: Mark[]): PStep => ({
      state: next,
      marks,
      say,
      lines,
      level,
      vars: runVars(r),
      extra: { run: { ...r } },
    });
    const w = wordText(word);
    const built = s.built ? '' : ' The product is drawn in full: press Build to watch it grow.';
    yield step(
      `Run A, B and the product for ${info.label} on ${w}, side by side. A starts in ${A.start} and B in ${B.start}, so the product starts in ${pairText(A.start, B.start)}.${built}`,
      ['run.start'],
      2,
      [
        mark(aState(A.start), 'active'),
        mark(bState(B.start), 'active'),
        mark(pState(pairName(A.start, B.start)), 'active'),
      ],
    );
    const delta = (m: Automaton, q: string, c: string) =>
      m.moves.find((x) => x.from === q && x.on === c)!.to;
    for (let i = 0; i < word.length; i++) {
      const c = word[i]!;
      const p2 = delta(A, r.p, c);
      const q2 = delta(B, r.q, c);
      const from = pairName(r.p, r.q);
      r.lastA = { from: r.p, on: c, to: p2 };
      r.lastB = { from: r.q, on: c, to: q2 };
      const goes = (x: string, y: string) => (x === y ? `stays in ${x}` : `goes from ${x} to ${y}`);
      const said = `Read ${c}: A ${goes(r.p, p2)} and B ${goes(r.q, q2)}, so the product ${goes(pairText(r.p, r.q), pairText(p2, q2))}.`;
      r.p = p2;
      r.q = q2;
      r.read = i + 1;
      yield step(said, ['run.for', 'run.move'], 2, [
        mark(aState(p2), 'active'),
        mark(bState(q2), 'active'),
        mark(pState(pairName(p2, q2)), 'active'),
        mark(moveId(r.lastA.from, p2, A_PREFIX), 'active'),
        mark(moveId(r.lastB.from, q2, B_PREFIX), 'active'),
        mark(moveId(from, pairName(p2, q2), P_PREFIX), 'active'),
      ]);
    }
    const x = A.accept.includes(r.p);
    const y = B.accept.includes(r.q);
    const ok = info.test(x, y);
    r.verdictA = x ? 'accept' : 'reject';
    r.verdictB = y ? 'accept' : 'reject';
    r.verdict = ok ? 'accept' : 'reject';
    const end = word.length ? 'The input is used up' : 'There is nothing to read';
    const role = (yes: boolean) => (yes ? 'found' : 'error');
    yield step(
      `${end}. A is in ${r.p}, ${x ? 'an accept state' : 'which does not accept'}, and B is in ${r.q}, ${y ? 'an accept state' : 'which does not accept'}. ${whyPair(op, r.p, r.q, x, y)} The product ${ok ? 'accepts' : 'rejects'} ${w}.`,
      ['run.check', ok ? 'run.accept' : 'run.reject'],
      1,
      [
        mark(aState(r.p), role(x)),
        mark(bState(r.q), role(y)),
        mark(pState(pairName(r.p, r.q)), role(ok)),
        mark(verdictId, role(ok)),
      ],
    );
    return next;
  },
};

// ---------------------------------------------------------------------------------------------
// Complement

function complementOp(which: 'A' | 'B'): Op {
  const prefix = which === 'A' ? A_PREFIX : B_PREFIX;
  const ids = which === 'A' ? 'compA' : 'compB';
  return {
    label: `Complement ${which}`,
    arity: 0,
    *run(s) {
      const m = which === 'A' ? s.a : s.b;
      const put = (x: Automaton): S =>
        which === 'A' ? { a: x, b: s.b, built: false } : { a: s.a, b: x, built: false };
      const f = full(m);
      const dead = deadOf(m);
      const vars = (st: S) => baseVars(st);
      if (dead) {
        const added = addedMoves(m).filter((x) => x.from !== dead);
        const first = added[0]!;
        const more =
          added.length > 1 ? ` (and ${plural(added.length - 1, 'other missing move')})` : '';
        const st = put(f);
        yield {
          state: st,
          marks: [
            mark(stateId(dead, prefix), 'new'),
            ...[...new Set(added.map((x) => x.from))].map((p) =>
              mark(moveId(p, dead, prefix), 'new'),
            ),
            mark(moveId(dead, dead, prefix), 'new'),
          ],
          say: `First make ${which} complete. It has no move from ${first.from} on ${first.on}${more}: a word that needs it is rejected, and the complement must accept that word. So add a dead state, ${dead}, for every missing move.`,
          lines: [`${ids}.complete`],
          level: 2,
          vars: vars(st),
        } satisfies PStep;
      }
      const c = complementOf(m);
      const st = put(c);
      const now = c.accept;
      const before = f.accept;
      const gained = now.length
        ? `${words(now)} ${now.length === 1 ? 'accepts' : 'accept'}`
        : 'no state accepts';
      const lost = before.length
        ? `, and ${words(before)} no longer ${before.length === 1 ? 'does' : 'do'}`
        : '';
      const deadNote = dead
        ? ` The dead state accepts now: every word that fell off ${which} ends there.`
        : '';
      yield {
        state: st,
        marks: [
          ...now.map((q) => mark(stateId(q, prefix), 'found')),
          ...before.map((q) => mark(stateId(q, prefix), 'remove')),
        ],
        say: `${dead ? 'Now swap' : `${which} is complete already, so just swap`} accept and non-accept states: ${gained}${lost}.${deadNote} The new ${which} accepts exactly the words the old one rejected.`,
        lines: [`${ids}.swap`],
        level: 1,
        vars: vars(st),
      } satisfies PStep;
      return st;
    },
  };
}

export const ops = {
  load,
  build,
  run,
  complementA: complementOp('A'),
  complementB: complementOp('B'),
};

// ---------------------------------------------------------------------------------------------
// Pseudocode, after Sipser's proof of Theorem 1.25, breadth first. Lines stay short for a phone.

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: ProdSettings): PseudoBlock[] {
  const info = OPS[settings.op];
  const complement = (w: 'A' | 'B'): PseudoBlock => {
    const id = w === 'A' ? 'compA' : 'compB';
    return {
      op: w === 'A' ? 'complementA' : 'complementB',
      lines: [
        L(`${id}.sig`, 0, `COMPLEMENT(${w})`, `To complement ${w}:`),
        L(
          `${id}.complete`,
          1,
          `${w} = COMPLETE(${w})`,
          'give it a dead state for its missing moves,',
        ),
        L(`${id}.swap`, 1, 'F = Q − F', 'then accept exactly where it did not.'),
      ],
    };
  };
  return [
    {
      op: 'build',
      lines: [
        L('sig', 0, 'PRODUCT(A, B)', `To build one machine for ${info.label}:`),
        L('complete', 1, 'complete A and B', 'give each a dead state for missing moves.'),
        L('start', 1, 's = (q_A, q_B); queue = [s]', 'Start with both start states, queued.'),
        L('while', 1, 'while queue is not empty', 'While a pair waits in the queue,'),
        L('deq', 2, '(p, q) = DEQUEUE(queue)', 'take the pair at the front.'),
        L('for', 2, 'for each c in Σ', 'For each symbol c:'),
        L('move', 3, 'r = (δ_A(p, c), δ_B(q, c))', 'both machines read c; r is where they go.'),
        L('if', 3, 'if r is new', 'If no state is that pair yet,'),
        L('add', 4, 'add r to Q; ENQUEUE(r)', 'it becomes one: queue it.'),
        L('delta', 3, 'δ((p, q), c) = r', 'The product moves to r on c.'),
        L(
          'acc',
          1,
          `F = {(p, q) : ${info.rule('p', 'q')}}`,
          `A pair accepts when ${info.plain('p', 'q')}.`,
        ),
      ],
    },
    {
      op: 'run',
      lines: [
        L('run.sig', 0, 'RUN(w)', 'To run the product on w:'),
        L('run.start', 1, '(p, q) = (q_A, q_B)', 'start in both start states.'),
        L('run.for', 1, 'for each symbol c of w', 'For each symbol c,'),
        L('run.move', 2, '(p, q) = (δ_A(p, c), δ_B(q, c))', 'A and B both move on c.'),
        L('run.check', 1, `if ${info.rule('p', 'q')}`, `At the end, if ${info.plain('p', 'q')},`),
        L('run.accept', 2, 'accept', 'accept.'),
        L('run.reject', 1, 'else reject', 'Otherwise, reject.'),
      ],
    },
    complement('A'),
    complement('B'),
  ];
}
