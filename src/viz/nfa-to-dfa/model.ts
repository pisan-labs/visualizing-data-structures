/**
 * NFA to DFA: the subset construction (Sipser, Theorem 1.39). Each DFA state is a set of NFA
 * states; its move on a symbol c is E(M), where M is every state one c-move from the set and
 * E adds what ε-moves reach. The start state is E({q0}); a set accepts when it holds an NFA
 * accept state; the empty set, when it turns up, is a dead state.
 *
 * Settings: `subsets` is 'reachable' (the default: breadth first from the start set, symbols in
 * alphabet order, a new DFA state each time a new set turns up, as subsetConstruction() in the
 * shared kit does) or 'all' (every one of the 2^|Q| subsets, as in Sipser's proof, for an NFA
 * of at most MAX_ALL states; the ones the start never reaches are pointed out at the end).
 *
 * The state is just the NFA. A run's bookkeeping (the DFA so far, the queue, the set being
 * worked on) travels in the steps' `extra`, so the last step shows the finished DFA and a
 * plain state (a practice picture) draws the NFA alone.
 */
import type { Mark, OpSpec, PseudoBlock, Scalar, Step } from '../../engine/types';
import { moveId, stateId } from '../../layouts/automaton';
import {
  EPS,
  closure,
  makeAutomaton,
  setName,
  sortStates,
  stateLetter,
  subsetConstruction,
  targets,
  type Automaton,
  type Move,
  type Subsets,
} from '../_automata/automaton';
import { parseAutomaton } from '../_automata/parse';
import { loadAutomatonOp, summarize, words } from './kit';

export interface NfaState {
  nfa: Automaton;
}

export type SubsetMode = 'reachable' | 'all';

export interface NdSettings {
  [key: string]: Scalar;
  subsets: SubsetMode;
}

export const defaults: NdSettings = { subsets: 'reachable' };

/** The most DFA states a loaded NFA may turn into, so the DFA stays readable. */
export const MAX_DFA = 16;
/** The most NFA states for the all-subsets setting: 2^4 = 16 DFA states. */
export const MAX_ALL = 4;

/** a*b(ab)*: an ε-move at the start, an accept state, and a dead state in the DFA. */
export const START_TEXT = 'start q0; accept q2; q0 a -> q0; q0 eps -> q1; q1 b -> q2; q2 a -> q1';

export interface Row {
  /** The DFA state's name: A, B, C, ... in the order the sets turn up. */
  name: string;
  /** Its NFA states, in name order. */
  set: string[];
}

export interface ConvRun {
  mode: SubsetMode;
  /** DFA states so far (in all mode, every subset from the first step). */
  rows: Row[];
  /** DFA moves so far. */
  moves: Move[];
  /** DFA accept states so far. */
  accept: string[];
  /** The DFA's start state, once known. */
  start?: string;
  /** Reachable mode: the queue, front first. All mode: the subsets still to do. */
  queue: string[];
  /** DFA states whose moves are all known. */
  done: string[];
  /** The DFA state being worked on, and the symbol. */
  T?: string;
  c?: string;
  /** M: the states one c-move from T's states. U: E(M), when worked out. */
  M?: string[];
  U?: string[];
  /** NFA moves followed for M, and ε-moves followed for E, as [from, to]. */
  used: [string, string][];
  eps: [string, string][];
  /** All mode, at the end: DFA states the start never reaches. */
  unreachable?: string[];
  /** The construction has finished. */
  finished: boolean;
}

export interface NdExtra {
  run?: ConvRun;
}

type S = NfaState;
type X = NdExtra;
type NdStep = Step<S, X>;
type Op = OpSpec<S, NdSettings, X>;

export function init(): S {
  return { nfa: parseAutomaton(START_TEXT) as Automaton };
}

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });

/** Shape ids of the drawing (see view.ts). The DFA's ids start with DFA_PREFIX. */
export const DFA_PREFIX = 'd-';
export const rowCell = (row: string, col: 'name' | 'set' | string) =>
  `tbl-${row}-${col === 'name' || col === 'set' ? col : `on-${col}`}`;

const pairs = (ms: Move[]): [string, string][] => {
  const seen = new Set<string>();
  const out: [string, string][] = [];
  for (const m of ms)
    if (!seen.has(`${m.from} ${m.to}`)) {
      seen.add(`${m.from} ${m.to}`);
      out.push([m.from, m.to]);
    }
  return out;
};

/** The ε-moves out of a set's states (all inside it when the set is closed). */
const epsMoves = (a: Automaton, set: string[]) =>
  pairs(a.moves.filter((m) => m.on === EPS && set.includes(m.from)));

const symbolMoves = (a: Automaton, set: string[], c: string) =>
  pairs(a.moves.filter((m) => m.on === c && set.includes(m.from)));

const holdsAccept = (a: Automaton, set: string[]) => set.filter((q) => a.accept.includes(q));

/** A set in narration, spaced as elsewhere on the site: { q0, q1 }, or ∅. */
export const setText = (set: readonly string[]) => (set.length ? `{ ${set.join(', ')} }` : '∅');

/** Every subset of the NFA's states: by size, then in name order. */
export function allSubsets(states: string[]): string[][] {
  const out: string[][] = [];
  const n = states.length;
  for (let mask = 0; mask < 1 << n; mask++) out.push(states.filter((_, i) => mask & (1 << i)));
  const key = (s: string[]) => s.map((q) => String(states.indexOf(q)).padStart(2, '0')).join('');
  return out.sort((a, b) => a.length - b.length || (key(a) < key(b) ? -1 : 1));
}

/** The DFA a run has built so far (all of it, once the run has finished). */
export function runDfa(nfa: Automaton, r: ConvRun): Subsets {
  const sets: Record<string, string[]> = {};
  for (const row of r.rows) sets[row.name] = row.set;
  const dfa = makeAutomaton({
    states: r.rows.map((row) => row.name),
    alphabet: nfa.alphabet,
    start: r.start ?? r.rows[0]?.name ?? 'A',
    accept: r.accept,
    moves: r.moves,
  });
  return { dfa, sets };
}

/** The DFA a finished run ends with, from the NFA alone: what the view frames. */
export function finalDfa(nfa: Automaton, mode: SubsetMode): Subsets {
  if (mode === 'reachable') return subsetConstruction(nfa);
  const subsets = allSubsets(nfa.states);
  const sets: Record<string, string[]> = {};
  const nameOf = new Map<string, string>();
  subsets.forEach((s, i) => {
    sets[stateLetter(i)] = s;
    nameOf.set(s.join(','), stateLetter(i));
  });
  const moves = Object.entries(sets).flatMap(([name, set]) =>
    nfa.alphabet.map((c) => ({
      from: name,
      on: c,
      to: nameOf.get(
        closure(
          nfa,
          set.flatMap((q) => targets(nfa, q, c)),
        ).join(','),
      )!,
    })),
  );
  const dfa = makeAutomaton({
    states: Object.keys(sets),
    alphabet: nfa.alphabet,
    start: nameOf.get(closure(nfa, [nfa.start]).join(','))!,
    accept: Object.keys(sets).filter((n) => holdsAccept(nfa, sets[n]!).length),
    moves,
  });
  return { dfa, sets };
}

function clone(r: ConvRun): ConvRun {
  return {
    ...r,
    rows: r.rows.map((row) => ({ ...row, set: [...row.set] })),
    moves: r.moves.map((m) => ({ ...m })),
    accept: [...r.accept],
    queue: [...r.queue],
    done: [...r.done],
    M: r.M && [...r.M],
    U: r.U && [...r.U],
    used: r.used.map((p) => [...p] as [string, string]),
    eps: r.eps.map((p) => [...p] as [string, string]),
    unreachable: r.unreachable && [...r.unreachable],
  };
}

export function nfaVars(nfa: Automaton): Record<string, Scalar> {
  return { '|Q|': nfa.states.length, '|Σ|': nfa.alphabet.length };
}

function runVars(nfa: Automaton, r: ConvRun): Record<string, Scalar> {
  const out: Record<string, Scalar> = { ...nfaVars(nfa), found: r.rows.length };
  if (r.mode === 'reachable') out.queue = r.queue.length;
  else out.left = r.queue.length;
  if (r.T) out.T = r.T;
  if (r.c) out.c = r.c;
  return out;
}

const nameOfSet = (r: ConvRun, set: string[]) =>
  r.rows.find((row) => row.set.join(',') === set.join(','))?.name;

/** The steps for one symbol: M, then E(M), then the move it makes. */
function* symbolSteps(
  nfa: Automaton,
  r: ConvRun,
  T: Row,
  c: string,
  step: (say: string, lines: string[], level: 1 | 2 | 3, marks?: Mark[]) => NdStep,
): Generator<NdStep, void, void> {
  const M = sortStates(T.set.flatMap((q) => targets(nfa, q, c)));
  const used = symbolMoves(nfa, T.set, c);
  r.c = c;
  r.M = M;
  r.U = undefined;
  r.used = used;
  r.eps = [];
  const tMarks = [
    ...T.set.map((q) => mark(stateId(q), 'active')),
    mark(stateId(T.name, DFA_PREFIX), 'active'),
    mark(rowCell(T.name, 'name'), 'active'),
  ];
  const usedMarks = used.map(([p, q]) => mark(moveId(p, q), 'active'));
  const mMarks = M.map((q) => mark(stateId(q), 'new'));
  const from = T.set.length === 1 ? T.set[0]! : `the states of ${T.name}`;
  yield step(
    M.length
      ? `On ${c}: ${words(used.map(([p, q]) => `${p} goes to ${q}`))}. So M = ${setText(M)}.`
      : `On ${c}: ${T.set.length ? `${from} ${T.set.length === 1 ? 'has' : 'have'} no move on ${c}` : 'the empty set goes nowhere'}, so M = ∅.`,
    ['for', 'move'],
    3,
    [...tMarks, ...usedMarks, ...mMarks],
  );
  const U = closure(nfa, M);
  const extra = U.filter((q) => !M.includes(q));
  if (extra.length) {
    r.U = U;
    r.eps = epsMoves(nfa, U);
    yield step(
      `Follow ε-moves from M: they reach ${words(extra)}. E(M) = ${setText(U)}.`,
      ['close'],
      3,
      [
        ...tMarks,
        ...mMarks,
        ...extra.map((q) => mark(stateId(q), 'visit')),
        ...r.eps.map(([p, q]) => mark(moveId(p, q), 'visit')),
      ],
    );
  }
  r.U = U;
  let name = nameOfSet(r, U);
  const fresh = !name;
  const how = extra.length
    ? `M = ${setText(M)}, and ε-moves add ${words(extra)}: E(M) = ${setText(U)}.`
    : M.length && epsMoves(nfa, M).length === 0
      ? `M = ${setText(M)}, with no ε-moves to follow, so E(M) = ${setText(U)}.`
      : `E(M) = ${setText(U)}.`;
  const resultMarks: Mark[] = [
    ...tMarks,
    ...U.map((q) => mark(stateId(q), 'new')),
    mark(rowCell(T.name, c), 'new'),
  ];
  if (fresh) {
    name = stateLetter(r.rows.length);
    r.rows.push({ name, set: U });
    r.queue.push(name);
    const acc = holdsAccept(nfa, U);
    if (acc.length) r.accept.push(name);
    r.moves.push({ from: T.name, on: c, to: name });
    const what = U.length
      ? acc.length
        ? ` It holds ${words(acc)}, an accept state of the NFA, so ${name} accepts.`
        : ''
      : ' No NFA state is left, so it is the dead state: every move from it comes back to it, and it never accepts.';
    yield step(
      `From ${T.name} on ${c}: ${how} That set is new, so it becomes DFA state ${name} and joins the queue.${what}`,
      ['if', 'add', ...(acc.length ? ['acc'] : []), 'delta'],
      2,
      [
        ...resultMarks,
        mark(stateId(name, DFA_PREFIX), 'new'),
        mark(moveId(T.name, name, DFA_PREFIX), 'new'),
        mark(rowCell(name, 'name'), 'new'),
        mark(rowCell(name, 'set'), 'new'),
      ],
    );
  } else {
    r.moves.push({ from: T.name, on: c, to: name! });
    const it = name === T.name ? `${name} itself` : name;
    yield step(
      r.mode === 'all'
        ? `From ${T.name} on ${c}: ${how} That is ${it}, so δ'(${T.name}, ${c}) = ${name}.`
        : `From ${T.name} on ${c}: ${how} That is ${it}, which we already have, so the DFA moves from ${T.name} to ${name} on ${c}.`,
      r.mode === 'all' ? ['move', 'close'] : ['if', 'delta'],
      2,
      [
        ...resultMarks,
        ...(name === T.name ? [] : [mark(stateId(name!, DFA_PREFIX), 'found')]),
        mark(moveId(T.name, name!, DFA_PREFIX), 'new'),
      ],
    );
  }
}

function summary(nfa: Automaton, r: ConvRun): string {
  const row = (name: string) =>
    nfa.alphabet.map((c) => `on ${c} to ${r.moves.find((m) => m.from === name && m.on === c)?.to}`);
  return row(r.T!).join(', ');
}

const convert: Op = {
  label: 'Convert',
  arity: 0,
  *run(s, _args, { settings }) {
    const nfa = s.nfa;
    const mode = settings.subsets;
    const r: ConvRun = {
      mode,
      rows: [],
      moves: [],
      accept: [],
      queue: [],
      done: [],
      used: [],
      eps: [],
      finished: false,
    };
    const step = (say: string, lines: string[], level: 1 | 2 | 3, marks: Mark[] = []): NdStep => ({
      state: s,
      marks,
      say,
      lines,
      level,
      vars: runVars(nfa, r),
      extra: { run: clone(r) },
    });
    const startSet = closure(nfa, [nfa.start]);
    const startExtra = startSet.filter((q) => q !== nfa.start);
    const startHow = startExtra.length
      ? `${nfa.start} and what ε-moves reach from it (${words(startExtra)})`
      : `${nfa.start} has no ε-moves, so it is just ${nfa.start}`;
    const startMarks = [
      mark(stateId(nfa.start), 'active'),
      ...startExtra.map((q) => mark(stateId(q), 'visit')),
      ...epsMoves(nfa, startSet).map(([p, q]) => mark(moveId(p, q), 'visit')),
    ];

    if (mode === 'all') {
      const n = nfa.states.length;
      if (n > MAX_ALL) {
        yield {
          state: s,
          marks: [],
          say: `This NFA has ${n} states, so it has 2^${n} = ${2 ** n} subsets: too many to draw. Use an NFA with at most ${MAX_ALL} states, or set Subsets to the reachable ones only.`,
          lines: ['all'],
          level: 1,
          vars: nfaVars(nfa),
        };
        return s;
      }
      const subsets = allSubsets(nfa.states);
      r.rows = subsets.map((set, i) => ({ name: stateLetter(i), set }));
      r.accept = r.rows.filter((row) => holdsAccept(nfa, row.set).length).map((row) => row.name);
      r.queue = r.rows.map((row) => row.name);
      const acc = nfa.accept.length
        ? ` The ${r.accept.length} that hold an accept state of the NFA (${words(nfa.accept)}) accept.`
        : ' The NFA has no accept states, so neither does the DFA.';
      yield step(
        `The NFA has ${n} states, so there are 2^${n} = ${2 ** n} subsets of them, and each one is a state of the DFA: ${r.rows.map((row) => `${row.name} = ${setText(row.set)}`).join(', ')}.${acc}`,
        ['all', 'acc'],
        2,
        r.rows.map((row) => mark(stateId(row.name, DFA_PREFIX), 'new')),
      );
      r.start = nameOfSet(r, startSet)!;
      yield step(
        `The start state is E({ ${nfa.start} }): ${startHow}. That is ${setText(startSet)}, state ${r.start}.`,
        ['start'],
        2,
        [
          ...startMarks,
          mark(stateId(r.start, DFA_PREFIX), 'active'),
          mark(`${DFA_PREFIX}start`, 'new'),
        ],
      );
      for (const T of [...r.rows]) {
        r.queue.shift();
        r.T = T.name;
        r.c = r.M = r.U = undefined;
        r.used = [];
        r.eps = [];
        yield step(
          `Next, ${T.name} = ${setText(T.set)}. Work out where it goes on each symbol.`,
          ['each'],
          2,
          [
            ...T.set.map((q) => mark(stateId(q), 'active')),
            mark(stateId(T.name, DFA_PREFIX), 'active'),
            mark(rowCell(T.name, 'name'), 'active'),
          ],
        );
        for (const c of nfa.alphabet) yield* symbolSteps(nfa, r, T, c, step);
        r.done.push(T.name);
        r.c = r.M = r.U = undefined;
        r.used = [];
        r.eps = [];
        yield step(
          `${T.name} is done: ${summary(nfa, r)}. ${r.queue.length ? `${r.queue.length} ${r.queue.length === 1 ? 'subset' : 'subsets'} to go.` : 'That was the last subset.'}`,
          ['each'],
          1,
          [mark(stateId(T.name, DFA_PREFIX), 'done'), mark(rowCell(T.name, 'name'), 'done')],
        );
      }
      r.T = undefined;
      const { dfa } = runDfa(nfa, r);
      const seen = reachableFrom(dfa);
      r.unreachable = dfa.states.filter((q) => !seen.has(q));
      r.finished = true;
      const k = r.unreachable.length;
      yield step(
        `Every subset has its moves: a DFA with ${dfa.states.length} states. Starting from ${r.start}, it can only ever reach ${words([...seen].sort())}${k ? `. The other ${k} (${words(r.unreachable)}) can never be reached, so no word ever uses them: building from the start set only, as the default setting does, leaves them out.` : ': every subset is reachable this time.'}`,
        ['reach'],
        1,
        r.unreachable.map((q) => mark(stateId(q, DFA_PREFIX), 'stale')),
      );
      return s;
    }

    const A = stateLetter(0);
    r.rows.push({ name: A, set: startSet });
    r.start = A;
    r.queue.push(A);
    const startAcc = holdsAccept(nfa, startSet);
    if (startAcc.length) r.accept.push(A);
    yield step(
      `The DFA starts in E({ ${nfa.start} }): ${startHow}. That set, ${setText(startSet)}, is DFA state ${A}. Put it in the queue.${startAcc.length ? ` It holds ${words(startAcc)}, an accept state of the NFA, so ${A} accepts: this NFA accepts the empty word.` : ''}`,
      ['start', 'start.add', ...(startAcc.length ? ['acc'] : [])],
      2,
      [
        ...startMarks,
        mark(stateId(A, DFA_PREFIX), 'new'),
        mark(rowCell(A, 'name'), 'new'),
        mark(rowCell(A, 'set'), 'new'),
      ],
    );
    while (r.queue.length) {
      const name = r.queue.shift()!;
      const T = r.rows.find((row) => row.name === name)!;
      r.T = name;
      r.c = r.M = r.U = undefined;
      r.used = [];
      r.eps = [];
      yield step(
        `Take ${name} = ${setText(T.set)} from the front of the queue and work out where it goes on each symbol.`,
        ['while', 'deq'],
        2,
        [
          ...T.set.map((q) => mark(stateId(q), 'active')),
          mark(stateId(name, DFA_PREFIX), 'active'),
          mark(rowCell(name, 'name'), 'active'),
        ],
      );
      for (const c of nfa.alphabet) yield* symbolSteps(nfa, r, T, c, step);
      r.done.push(name);
      r.c = r.M = r.U = undefined;
      r.used = [];
      r.eps = [];
      yield step(
        `${name} is done: ${summary(nfa, r)}. ${r.queue.length ? `Queue: ${r.queue.join(', ')}.` : 'The queue is empty.'}`,
        ['while'],
        1,
        [mark(stateId(name, DFA_PREFIX), 'done'), mark(rowCell(name, 'name'), 'done')],
      );
    }
    r.T = undefined;
    r.finished = true;
    const k = r.rows.length;
    const n = nfa.states.length;
    const dead = r.rows.find((row) => row.set.length === 0)?.name;
    const size =
      k > n
        ? `more than the NFA's ${n}`
        : k === n
          ? `as many as the NFA`
          : `fewer than the NFA's ${n}`;
    const acc = r.accept.length
      ? `${words(r.accept)} ${r.accept.length === 1 ? 'accepts' : 'accept'}: ${r.accept.length === 1 ? 'its set holds' : 'their sets hold'} an accept state of the NFA.`
      : 'No set holds an accept state, so the DFA accepts nothing.';
    yield step(
      `The queue is empty, so the DFA is finished: ${k} ${k === 1 ? 'state' : 'states'}, ${size}, out of 2^${n} = ${2 ** n} possible subsets. ${acc}${dead ? ` ${dead} = ∅ is the dead state.` : ''}`,
      ['while'],
      1,
      r.accept.map((q) => mark(stateId(q, DFA_PREFIX), 'found')),
    );
    return s;
  },
};

function reachableFrom(dfa: Automaton): Set<string> {
  const seen = new Set([dfa.start]);
  const todo = [dfa.start];
  while (todo.length) {
    const q = todo.pop()!;
    for (const m of dfa.moves)
      if (m.from === q && !seen.has(m.to)) {
        seen.add(m.to);
        todo.push(m.to);
      }
  }
  return seen;
}

export function loadCheck(a: Automaton): string | null {
  const k = subsetConstruction(a).dfa.states.length;
  return k > MAX_DFA
    ? `That NFA turns into a DFA with ${k} states, too many to draw. Use one whose DFA has at most ${MAX_DFA}.`
    : null;
}

const load = loadAutomatonOp<S, NdSettings, X>({
  what: 'NFA',
  get: (s) => s.nfa,
  make: (nfa) => ({ nfa }),
  check: loadCheck,
  ready: (a) =>
    a.moves.some((m) => m.on === EPS) ||
    a.moves.some((m, i) => a.moves.some((n, j) => j < i && n.from === m.from && n.on === m.on))
      ? 'Press Convert to build the equivalent DFA.'
      : 'It is already deterministic, but the construction works on it all the same: press Convert.',
  vars: (s) => nfaVars(s.nfa),
});

export const ops = { load, convert };

// ---------------------------------------------------------------------------------------------
// Pseudocode, after Sipser's proof of Theorem 1.39, breadth first. Lines stay short for a phone.

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: NdSettings): PseudoBlock[] {
  if (settings.subsets === 'all')
    return [
      {
        op: 'convert',
        lines: [
          L('sig', 0, 'SUBSETS(N)', 'To turn the NFA N into a DFA:'),
          L('all', 1, "Q' = every subset of Q", 'every subset of its states is a DFA state;'),
          L('acc', 1, "F' = { T : T ∩ F ≠ ∅ }", 'those holding an accept state accept.'),
          L('start', 1, "q0' = E({q0})", 'Start in q0 plus what ε-moves reach.'),
          L('each', 1, "for each T in Q'", 'For each DFA state T'),
          L('for', 2, 'for each c in Σ', 'and each symbol c:'),
          L('move', 3, 'M = ⋃ δ(q, c), q ∈ T', "find where T's states go on c,"),
          L('close', 3, "δ'(T, c) = E(M)", 'add what ε-moves reach: that is the move.'),
          L(
            'reach',
            1,
            'R = states reached from q0′',
            'Afterwards, see which ones the start reaches.',
          ),
        ],
      },
    ];
  return [
    {
      op: 'convert',
      lines: [
        L('sig', 0, 'SUBSETS(N)', 'To turn the NFA N into a DFA:'),
        L('start', 1, 'A = E({q0})', 'start with q0 plus what ε-moves reach;'),
        L('start.add', 1, "Q' = {A}; queue = [A]", 'it is the first DFA state. Queue it.'),
        L('while', 1, 'while queue is not empty', 'While a DFA state waits in the queue,'),
        L('deq', 2, 'T = DEQUEUE(queue)', 'take T from the front.'),
        L('for', 2, 'for each c in Σ', 'For each symbol c:'),
        L('move', 3, 'M = ⋃ δ(q, c), q ∈ T', "find where T's states go on c,"),
        L('close', 3, 'U = E(M)', 'and add what ε-moves reach.'),
        L('if', 3, "if U ∉ Q'", 'If that set is new,'),
        L('add', 4, "add U to Q'; ENQUEUE(U)", 'it is a new DFA state: queue it.'),
        L('acc', 4, "if U ∩ F ≠ ∅: U ∈ F'", 'It accepts if it holds an accept state.'),
        L('delta', 3, "δ'(T, c) = U", 'The DFA moves from T to U on c.'),
      ],
    },
  ];
}

export function describeMoves(a: Automaton): string {
  if (!a.moves.length) return 'It has no moves.';
  return `Moves: ${a.moves.map((m) => `${m.from} on ${m.on} to ${m.to}`).join('; ')}.`;
}

export function describe(s: S): string {
  return `The NFA: ${summarize(s.nfa)} ${describeMoves(s.nfa)}`;
}

/** The scene label: the NFA, then the DFA so far. */
export function describeRun(nfa: Automaton, r: ConvRun): string {
  const rows = r.rows.map((row) => {
    const out = nfa.alphabet
      .map((c) => r.moves.find((m) => m.from === row.name && m.on === c))
      .filter(Boolean)
      .map((m) => `on ${m!.on} to ${m!.to}`);
    return `${row.name} = ${setName(row.set)}${r.accept.includes(row.name) ? ' (accepts)' : ''}${out.length ? `: ${out.join(', ')}` : ''}`;
  });
  const q =
    r.mode === 'reachable' ? ` Queue: ${r.queue.length ? r.queue.join(', ') : 'empty'}.` : '';
  return `The DFA so far: ${rows.join('; ')}.${q}`;
}

export function initialSay(s: S): string {
  return `An NFA with ${s.nfa.states.length} states. Press Convert to build a DFA that accepts the same words, one set of NFA states at a time.`;
}

export function initialVars(s: S) {
  return nfaVars(s.nfa);
}
