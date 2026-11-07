/**
 * A nondeterministic finite automaton with ε-moves, run by keeping the set of states it could
 * be in (Sipser's conventions: δ, q0, F, ε, and E(S) for the ε-closure of a set S).
 *
 * The run starts with E({q0}). For each symbol it follows every move on that symbol from every
 * state in the set, then every ε-move from there. A state with no move on the symbol is a
 * branch that dies. When the set is empty every branch has died, and the run stops and
 * rejects. At the end of the word the machine accepts when the set holds an accept state.
 *
 * Settings: `closure` shows the ε-closure as its own step after each symbol (default), or
 * folds it into the symbol's step. The pseudocode follows.
 *
 * The state is the machine; a run's bookkeeping travels in the steps' `extra`, so a plain
 * state draws the bare machine. Operations: load, run, test (as on the DFA page).
 */
import type { Mark, OpSpec, PseudoBlock, Scalar, Step } from '../../engine/types';
import { moveId, stateId } from '../../layouts/automaton';
import { listWords } from '../_graph/graph';
import {
  EPS,
  closure,
  describeAutomaton,
  makeAutomaton,
  setName,
  sortStates,
  type Automaton,
  type Move,
} from '../_automata/automaton';
import { parseAutomaton, parseWord } from '../_automata/parse';
import {
  loadOp,
  parseBatch,
  plural,
  setText,
  wordProblem,
  wordText,
  type MachineState,
  type Verdict,
} from '../_automata/page';
import { rowOk, testRowId, verdictId, type TestRow, type TestTable } from '../_automata/panels';

export type NfaState = MachineState;

export interface NfaSettings {
  [key: string]: Scalar;
  closure: 'separate' | 'folded';
}

export const defaults: NfaSettings = { closure: 'separate' };

export interface NfaRun {
  word: string;
  /** Symbols read so far. */
  read: number;
  /** The set of states the machine is in now. */
  set: string[];
  /**
   * The set after each symbol (rows[0] is E({q0})), for the whole run, so the trace panel can
   * keep its size; rows up to `read` are shown. It stops where every branch died.
   */
  rows: string[][];
  /** Every branch has died. */
  dead?: boolean;
  verdict?: Verdict;
}

export interface NfaExtra {
  run?: NfaRun;
  test?: TestTable;
  /** The longest word of this run or batch, so the tape keeps its size. */
  room?: number;
}

type S = NfaState;
type X = NfaExtra;
type Op = OpSpec<S, NfaSettings, X>;
type NfaStep = Step<S, X>;

/** Binary words that end in 01: stay in q0, and guess where the final 01 starts. */
export const START_TEXT = 'start q0; accept q2; q0 0,1 -> q0; q0 0 -> q1; q1 1 -> q2';
export const START_MACHINE = parseAutomaton(START_TEXT) as Automaton;

export function init(): S {
  return { machine: makeAutomaton(START_MACHINE) };
}

/** One symbol of a run: where the moves go, which branches die, and what ε-moves add. */
export interface NfaRead {
  c: string;
  /** The set before the symbol. */
  from: string[];
  /** The moves on c out of the set. */
  taken: Move[];
  /** Where they lead: move(S, c). */
  moved: string[];
  /** States of the set with no move on c. */
  dying: string[];
  /** E(moved). */
  closed: string[];
  /** States the ε-moves added. */
  added: string[];
  /** The ε-moves out of the closed set. */
  eps: Move[];
}

export interface NfaTrace {
  start: string[];
  startAdded: string[];
  startEps: Move[];
  reads: NfaRead[];
  /** The index of the symbol after which the set was empty, or null. */
  diedAt: number | null;
  verdict: Verdict;
  /** The set after each symbol, rows[0] = E({q0}). */
  rows: string[][];
}

const epsOut = (a: Automaton, set: readonly string[]) =>
  a.moves.filter((m) => m.on === EPS && set.includes(m.from));

/** Simulate the NFA on a word with sets of states, keeping every detail the steps show. */
export function nfaTrace(a: Automaton, word: string): NfaTrace {
  const start = closure(a, [a.start]);
  const rows = [start];
  const reads: NfaRead[] = [];
  let set = start;
  let diedAt: number | null = null;
  for (let i = 0; i < word.length; i++) {
    const c = word[i]!;
    const taken = a.moves.filter((m) => m.on === c && set.includes(m.from));
    const moved = sortStates(taken.map((m) => m.to));
    const closed = closure(a, moved);
    reads.push({
      c,
      from: set,
      taken,
      moved,
      dying: set.filter((q) => !taken.some((m) => m.from === q)),
      closed,
      added: closed.filter((q) => !moved.includes(q)),
      eps: epsOut(a, closed),
    });
    set = closed;
    rows.push(set);
    if (!set.length) {
      diedAt = i;
      break;
    }
  }
  return {
    start,
    startAdded: start.filter((q) => q !== a.start),
    startEps: epsOut(a, start),
    reads,
    diedAt,
    verdict: set.some((q) => a.accept.includes(q)) ? 'accept' : 'reject',
    rows,
  };
}

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });
const NONE = '–';

function runVars(r: NfaRun | null): Record<string, Scalar> {
  if (!r) return { set: NONE, symbol: NONE, steps: 0, active: 0 };
  return {
    set: setName(r.set),
    symbol: r.read ? r.word[r.read - 1]! : NONE,
    steps: r.read,
    active: r.set.length,
  };
}

const states = (qs: string[], role: Mark['role']) => qs.map((q) => mark(stateId(q), role));
const arrows = (ms: Move[]) => [
  ...new Map(ms.map((m) => [moveId(m.from, m.to), mark(moveId(m.from, m.to), 'active')])).values(),
];

/** "q1 has no move on 0, so its branch dies." */
function dyingSay(dying: string[], c: string): string {
  if (!dying.length) return '';
  return dying.length === 1
    ? ` ${dying[0]} has no move on ${c}, so its branch dies.`
    : ` ${listWords(dying)} have no move on ${c}, so their branches die.`;
}

/** "they add q3" */
const addSay = (added: string[]) =>
  `${added.length === 1 ? 'it adds' : 'they add'} ${listWords(added)}`;

/**
 * The steps of one run: the start (and its ε-closure), one or two steps per symbol, and the
 * verdict. `wrap` lets `test` replay a run as fine detail inside its table.
 */
function* runSteps(
  s: S,
  a: Automaton,
  word: string,
  settings: NfaSettings,
  wrap: (st: NfaStep) => NfaStep,
): Generator<NfaStep, NfaTrace, void> {
  const tr = nfaTrace(a, word);
  const separate = settings.closure === 'separate';
  const w = wordText(word);
  const r: NfaRun = { word, read: 0, set: [a.start], rows: tr.rows };
  const step = (say: string, lines: string[], level: 1 | 2 | 3, marks: Mark[]): NfaStep =>
    wrap({
      state: s,
      marks,
      say,
      lines,
      level,
      vars: runVars(r),
      extra: { run: { ...r }, room: word.length },
    });
  const intro = `Run the machine on ${w}.${word.length ? '' : ' There is nothing to read: the word is ε, the empty word.'}`;
  const startMarks = [mark('start', 'active')];
  const e0 = `E(${setText([a.start])})`;
  if (separate) {
    yield step(
      `${intro} Start with the set ${setText([a.start])}: just the start state.`,
      ['run.start'],
      2,
      [...startMarks, mark(stateId(a.start), 'active')],
    );
    r.set = tr.start;
    yield step(
      tr.startAdded.length
        ? `Follow ε-moves from ${a.start}: ${addSay(tr.startAdded)}. The set is ${e0} = ${setText(tr.start)}.`
        : `No ε-moves leave ${a.start}, so the set stays ${setText(tr.start)}.`,
      ['run.start'],
      tr.startAdded.length ? 2 : 3,
      [...states(tr.startAdded, 'new'), ...arrows(tr.startEps)],
    );
  } else {
    r.set = tr.start;
    yield step(
      tr.startAdded.length
        ? `${intro} Start with ${a.start} and every state its ε-moves reach: ${e0} = ${setText(tr.start)}.`
        : `${intro} Start with the set ${setText(tr.start)}: the start state, with no ε-moves to follow.`,
      ['run.start'],
      2,
      [...startMarks, ...states(tr.startAdded, 'new'), ...arrows(tr.startEps)],
    );
  }
  for (let i = 0; i < tr.reads.length; i++) {
    const x = tr.reads[i]!;
    const reach = `from ${setText(x.from)}, the ${x.c}-moves reach ${setText(x.moved)}`;
    const dies = dyingSay(x.dying, x.c);
    // A state can lose its own branch and still be reached by another one: only the states
    // that drop out of the set are drawn as dying.
    const gone = (set: string[]) =>
      states(
        x.dying.filter((q) => !set.includes(q)),
        'remove',
      );
    r.read = i + 1;
    if (tr.diedAt === i) {
      r.set = [];
      r.dead = true;
      r.verdict = 'reject';
      const left = word.length - i - 1;
      const rest = left ? `, without reading the other ${plural(left, 'symbol')}` : '';
      const why =
        x.from.length === 1
          ? `${x.from[0]} has no move on ${x.c}, so its branch dies`
          : `no state in ${setText(x.from)} has a move on ${x.c}, so every branch dies`;
      yield step(
        `Read ${x.c}: ${why}. The set is empty, so the machine rejects ${w}${rest}.`,
        ['run.for', separate ? 'run.move' : 'run.step', 'run.empty', 'run.dead'],
        1,
        [...gone([]), mark(verdictId, 'error')],
      );
      return tr;
    }
    if (separate) {
      r.set = x.moved;
      yield step(`Read ${x.c}: ${reach}.${dies}`, ['run.for', 'run.move'], 2, [
        ...arrows(x.taken),
        ...gone(x.moved),
      ]);
      r.set = x.closed;
      yield step(
        x.added.length
          ? `Follow ε-moves: ${addSay(x.added)}. The set is ${setText(x.closed)}.`
          : `No ε-moves add anything, so the set stays ${setText(x.closed)}.`,
        ['run.close'],
        x.added.length ? 2 : 3,
        [...states(x.added, 'new'), ...arrows(x.eps)],
      );
    } else {
      r.set = x.closed;
      const eps = x.added.length
        ? `, and ε-moves add ${listWords(x.added)}: the set is ${setText(x.closed)}`
        : '';
      yield step(`Read ${x.c}: ${reach}${eps}.${dies}`, ['run.for', 'run.step'], 2, [
        ...arrows([...x.taken, ...(x.added.length ? x.eps : [])]),
        ...states(x.added, 'new'),
        ...gone(x.closed),
      ]);
    }
  }
  r.verdict = tr.verdict;
  const acc = r.set.filter((q) => a.accept.includes(q));
  const where = word.length ? 'The input is used up' : 'There is nothing to read';
  yield step(
    acc.length
      ? `${where}. The set ${setText(r.set)} contains ${listWords(acc)}, ${acc.length === 1 ? 'an accept state' : 'accept states'}, so the machine accepts ${w}.`
      : `${where}, and no state in ${setText(r.set)} accepts, so the machine rejects ${w}.`,
    ['run.check', acc.length ? 'run.accept' : 'run.reject'],
    1,
    [
      ...states(acc, 'found'),
      ...(acc.length ? [] : states(r.set, 'error')),
      mark(verdictId, acc.length ? 'found' : 'error'),
    ],
  );
  return tr;
}

const run: Op = {
  label: 'Run',
  arity: 1,
  *run(s, [arg], { settings }) {
    const raw = String(arg ?? '');
    const problem = wordProblem(raw, s.machine);
    if (problem) {
      yield {
        state: s,
        marks: [],
        say: `Nothing to run. ${problem}`,
        lines: ['run.sig'],
        level: 1,
        vars: runVars(null),
      } satisfies NfaStep;
      return s;
    }
    yield* runSteps(s, s.machine, parseWord(raw, s.machine) as string, settings, (st) => st);
    return s;
  },
};

function testVars(t: TestTable, r: NfaRun | undefined): Record<string, Scalar> {
  const done = t.rows.filter((x) => x.got !== undefined);
  return {
    ...runVars(r ?? null),
    words: `${done.length} of ${t.rows.length}`,
    mismatches: done.filter((x) => rowOk(x) === false).length,
  };
}

function rowSay(row: TestRow, a: Automaton, tr: NfaTrace): string {
  const w = wordText(row.word);
  const end = tr.rows.at(-1)!;
  const acc = end.filter((q) => a.accept.includes(q));
  const why =
    tr.diedAt !== null
      ? 'Every branch dies, so it is rejected.'
      : acc.length
        ? `It ends in ${setText(end)}, which contains ${listWords(acc)}, so it is accepted.`
        : `It ends in ${setText(end)}, with no accept state, so it is rejected.`;
  const ok = rowOk(row);
  const verdict =
    ok === null
      ? 'No + or - was given, so there is nothing to compare.'
      : ok
        ? `It should ${row.expect}: as expected.`
        : `It should ${row.expect}: a mismatch.`;
  return `${w}: ${why} ${verdict}`;
}

const test: Op = {
  label: 'Test',
  arity: 1,
  *run(s, [arg], { settings }) {
    const a = s.machine;
    const items = parseBatch(String(arg ?? ''), a);
    if (items instanceof Error) {
      yield {
        state: s,
        marks: [],
        say: `Nothing to test. ${items.message}`,
        lines: ['test.sig'],
        level: 1,
        vars: runVars(null),
      } satisfies NfaStep;
      return s;
    }
    const rows: TestRow[] = items.map((it) => ({ word: it.word, expect: it.expect }));
    const room = Math.max(...rows.map((r) => r.word.length));
    const table = (at: number): TestTable => ({ rows: rows.map((r) => ({ ...r })), at });
    yield {
      state: s,
      marks: [],
      say: `Test ${plural(rows.length, 'word')}. Each one runs from E(${setText([a.start])}), and the table puts what the machine does next to what it should do (+ accept, - reject).`,
      lines: ['test.for'],
      level: 2,
      vars: testVars(table(-1), undefined),
      extra: { test: table(-1), room },
    } satisfies NfaStep;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      const tr = yield* runSteps(s, a, row.word, settings, (st) => ({
        ...st,
        say: `${wordText(row.word)}: ${st.say}`,
        lines: ['test.run'],
        level: 3,
        marks: st.marks.filter((m) => m.id !== verdictId),
        vars: testVars(table(i), st.extra?.run),
        extra: {
          ...st.extra,
          run: st.extra?.run && { ...st.extra.run, verdict: undefined },
          test: table(i),
          room,
        },
      }));
      row.got = tr.verdict;
      const end = tr.rows.at(-1)!;
      const ok = rowOk(row);
      const r: NfaRun = {
        word: row.word,
        read: tr.diedAt === null ? row.word.length : tr.diedAt + 1,
        set: end,
        rows: tr.rows,
        dead: tr.diedAt !== null,
      };
      const acc = end.filter((q) => a.accept.includes(q));
      yield {
        state: s,
        marks: [
          mark(testRowId(i), ok === false ? 'error' : ok ? 'found' : 'active'),
          ...states(acc, 'found'),
        ],
        say: rowSay(row, a, tr),
        lines: ok === false ? ['test.check', 'test.mismatch'] : ['test.run', 'test.check'],
        level: 2,
        vars: testVars(table(i), r),
        extra: { run: r, test: table(i), room },
      } satisfies NfaStep;
    }
    const bad = rows.filter((r) => rowOk(r) === false);
    const checked = rows.filter((r) => rowOk(r) !== null).length;
    const summary =
      checked === 0
        ? `Done: the machine accepts ${plural(rows.filter((r) => r.got === 'accept').length, 'word')} of ${rows.length}. Put + or - in front of a word to say what it should do.`
        : bad.length === 0
          ? `Done: all ${plural(checked, 'word')} with a + or - do what they should.`
          : `Done: ${checked - bad.length} of ${checked} words do what they should. ${bad
              .map(
                (r) =>
                  `${wordText(r.word)} is ${r.got === 'accept' ? 'accepted' : 'rejected'} but should be ${r.expect === 'accept' ? 'accepted' : 'rejected'}`,
              )
              .join('; ')}.`;
    yield {
      state: s,
      marks: bad.map((r) => mark(testRowId(rows.indexOf(r)), 'error')),
      say: summary,
      lines: bad.length ? ['test.mismatch'] : ['test.for'],
      level: 1,
      vars: testVars(table(rows.length), undefined),
      extra: { test: table(rows.length), room },
    } satisfies NfaStep;
    return s;
  },
};

const load = loadOp<S, NfaSettings, X>({
  make: (a) => ({ machine: a }),
  words: true,
  ready: () => 'Type a word and press Run, or words with + or - in front and press Test.',
  vars: () => runVars(null),
});

export const ops = { load, run, test };

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: NfaSettings): PseudoBlock[] {
  const separate = settings.closure === 'separate';
  return [
    {
      op: 'run',
      lines: [
        L('run.sig', 0, 'RUN(N, w)', 'To run the NFA N on a word w:'),
        L(
          'run.start',
          1,
          'S = E({q0})',
          'Start with the start state and every state its ε-moves reach.',
        ),
        L('run.for', 1, 'for each symbol c of w', 'Read w one symbol at a time.'),
        ...(separate
          ? [
              L(
                'run.move',
                2,
                'S = move(S, c)',
                'Follow every move on c, from every state in the set.',
              ),
              L('run.close', 2, 'S = E(S)', 'Then follow ε-moves as far as they go.'),
            ]
          : [
              L(
                'run.step',
                2,
                'S = E(move(S, c))',
                'Follow every move on c from every state in the set, then every ε-move from there.',
              ),
            ]),
        L('run.empty', 2, 'if S = ∅', 'If no state is left,'),
        L('run.dead', 3, 'reject', 'every branch has died: reject.'),
        L(
          'run.check',
          1,
          'if S ∩ F ≠ ∅',
          'When the input runs out, if any state in the set accepts,',
        ),
        L('run.accept', 2, 'accept', 'accept.'),
        L('run.reject', 1, 'else reject', 'Otherwise, reject.'),
      ],
    },
    {
      op: 'test',
      lines: [
        L('test.sig', 0, 'TEST(N, batch)', 'To test N on a batch of words:'),
        L(
          'test.for',
          1,
          'for each (w, expected) in batch',
          'Take each word with the answer it should get.',
        ),
        L('test.run', 2, 'got = RUN(N, w)', 'Run N on it.'),
        L('test.check', 2, 'if got ≠ expected', 'If N gives a different answer,'),
        L('test.mismatch', 3, 'report a mismatch', 'report it.'),
      ],
    },
  ];
}

export function initialSay(): string {
  return 'This NFA accepts the binary words that end in 01: it stays in q0 and guesses where the final 01 begins. Type a word such as 1101 and press Run, or load your own machine.';
}

export const initialVars = (): Record<string, Scalar> => runVars(null);

export function describe(state: S): string {
  return describeAutomaton(state.machine);
}

export function describeRun(r: NfaRun): string {
  const w = wordText(r.word);
  const sets = r.rows
    .slice(0, r.read + 1)
    .map((set, i) => `${i === 0 ? 'start' : `after ${r.word[i - 1]}`} ${setName(set)}`)
    .join(', ');
  const now = `Active states: ${r.set.length ? r.set.join(', ') : 'none'}.`;
  if (r.verdict) return `Run on ${w}: ${r.verdict}ed. ${now} Sets: ${sets}.`;
  return `Run on ${w}: ${r.read} of ${r.word.length} symbols read. ${now} Sets: ${sets}.`;
}
