/**
 * A deterministic finite automaton, run one symbol at a time (Sipser's conventions: δ, q0, F).
 *
 * The state is the machine. A run's bookkeeping (the word, how much is read, the current state,
 * the move just taken, the verdict) travels in the steps' `extra`, as does a batch test's
 * table, so a plain state draws the bare machine.
 *
 * A DFA here may leave moves out. A missing move rejects: the run stops there (Sipser draws
 * such machines without their dead state). The `dead` setting draws the dead state instead
 * (complete() adds it), and the run walks into it and stays there to the end of the word.
 *
 * Operations: load (machine text), run (a word), test (a batch such as "+ab -ba -eps").
 */
import type { Mark, OpSpec, PseudoBlock, Scalar, Step } from '../../engine/types';
import { moveId, stateId } from '../../layouts/automaton';
import {
  complete,
  describeAutomaton,
  makeAutomaton,
  targets,
  type Automaton,
  type Move,
} from '../_automata/automaton';
import { parseAutomaton, parseWord } from '../_automata/parse';
import {
  loadOp,
  parseBatch,
  plural,
  whyNotDfa,
  wordProblem,
  wordText,
  type MachineState,
  type Verdict,
} from '../_automata/page';
import { rowOk, testRowId, verdictId, type TestRow, type TestTable } from '../_automata/panels';

export type DfaState = MachineState;

export interface DfaSettings {
  [key: string]: Scalar;
  /** hide: a missing move rejects on the spot (Sipser). draw: the dead state is drawn. */
  dead: 'hide' | 'draw';
}

export const defaults: DfaSettings = { dead: 'hide' };

export interface DfaRun {
  word: string;
  /** Symbols read so far. */
  read: number;
  /** The current state (with a missing move, the state the run is stuck in). */
  q: string;
  /** The move just followed. */
  last?: Move;
  /** The run stopped: there is no move from q on word[read]. */
  stuck?: boolean;
  verdict?: Verdict;
}

export interface DfaExtra {
  run?: DfaRun;
  test?: TestTable;
  /** The longest word of this run or batch, so the tape keeps its size. */
  room?: number;
}

type S = DfaState;
type X = DfaExtra;
type Op = OpSpec<S, DfaSettings, X>;
type DfaStep = Step<S, X>;

/** Binary words that end in 01: q0 has seen no 0 lately, q1 just saw a 0, q2 just saw 01. */
export const START_TEXT =
  'start q0; accept q2; q0 0 -> q1; q0 1 -> q0; q1 0 -> q1; q1 1 -> q2; q2 0 -> q1; q2 1 -> q0';
export const START_MACHINE = parseAutomaton(START_TEXT) as Automaton;

export function init(): S {
  return { machine: makeAutomaton(START_MACHINE) };
}

/** The machine as drawn and run: with the dead state when the setting asks for it. */
export const machineFor = (a: Automaton, settings: DfaSettings): Automaton =>
  settings.dead === 'draw' ? complete(a) : a;

/** The dead state complete() added, if any. */
export const deadState = (a: Automaton, settings: DfaSettings): string | null => {
  const full = machineFor(a, settings);
  return full === a ? null : full.states.find((q) => !a.states.includes(q))!;
};

export interface DfaTrace {
  /** path[i] is the state after reading i symbols. */
  path: string[];
  /** The index of the symbol with no move, or null when the whole word was read. */
  stuckAt: number | null;
  verdict: Verdict;
}

/** Run a DFA on a word: the states it passes through, and where it gets stuck. */
export function dfaTrace(a: Automaton, word: string): DfaTrace {
  let q = a.start;
  const path = [q];
  for (let i = 0; i < word.length; i++) {
    const to = targets(a, q, word[i]!)[0];
    if (to === undefined) return { path, stuckAt: i, verdict: 'reject' };
    q = to;
    path.push(q);
  }
  return { path, stuckAt: null, verdict: a.accept.includes(q) ? 'accept' : 'reject' };
}

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });
const NONE = '–';

function runVars(r: DfaRun | null): Record<string, Scalar> {
  if (!r) return { state: NONE, symbol: NONE, steps: 0, δ: NONE };
  const c = r.stuck ? r.word[r.read]! : r.last?.on;
  return {
    state: r.q,
    symbol: c ?? NONE,
    steps: r.read,
    δ: r.stuck
      ? `δ(${r.q}, ${c}) undefined`
      : r.last
        ? `δ(${r.last.from}, ${r.last.on}) = ${r.last.to}`
        : NONE,
  };
}

/** Where a move goes, in words: "Stay in q0." or "Move to q1." */
const goes = (m: Move) => (m.from === m.to ? `Stay in ${m.to}.` : `Move to ${m.to}.`);

/**
 * The steps of one run: the start, one per symbol, and the verdict. `wrap` adds what a batch
 * test needs (its table, a level, its own lines), so `test` can replay a run as fine detail.
 */
function* runSteps(
  s: S,
  a: Automaton,
  word: string,
  dead: string | null,
  wrap: (st: DfaStep) => DfaStep,
): Generator<DfaStep, DfaTrace, void> {
  const tr = dfaTrace(a, word);
  const w = wordText(word);
  const r: DfaRun = { word, read: 0, q: a.start };
  const step = (say: string, lines: string[], level: 1 | 2 | 3, marks: Mark[]): DfaStep =>
    wrap({
      state: s,
      marks,
      say,
      lines,
      level,
      vars: runVars(r),
      extra: { run: { ...r }, room: word.length },
    });
  const atStart = word.length
    ? 'with the head on the first symbol.'
    : 'There is nothing to read: the word is ε, the empty word.';
  yield step(
    `Run the machine on ${w}. Start in ${a.start}, the start state, ${atStart}`,
    ['run.start'],
    2,
    [mark(stateId(a.start), 'active'), mark('start', 'active')],
  );
  for (let i = 0; i < word.length; i++) {
    const c = word[i]!;
    if (tr.stuckAt === i) {
      r.stuck = true;
      r.verdict = 'reject';
      const rest =
        i + 1 < word.length
          ? `, without reading the other ${plural(word.length - i - 1, 'symbol')}`
          : '';
      yield step(
        `Read ${c}: there is no move from ${r.q} on ${c}. A missing move rejects, so the machine rejects ${w}${rest}.`,
        ['run.for', 'run.missing', 'run.stuck'],
        1,
        [mark(stateId(r.q), 'error'), mark(verdictId, 'error')],
      );
      return tr;
    }
    const to = tr.path[i + 1]!;
    const m: Move = { from: r.q, on: c, to };
    r.q = to;
    r.read = i + 1;
    r.last = m;
    const delta = `δ(${m.from}, ${c}) = ${to}`;
    const say =
      to === dead && m.from !== dead
        ? `Read ${c}: ${delta}, the dead state. No move leads out of it, so ${w} will be rejected.`
        : to === dead
          ? `Read ${c}: ${delta}. Still in the dead state.`
          : `Read ${c}: ${delta}. ${goes(m)}`;
    yield step(say, ['run.for', 'run.move'], 2, [
      mark(stateId(to), 'active'),
      mark(moveId(m.from, to), 'active'),
    ]);
  }
  const q = r.q;
  r.verdict = tr.verdict;
  const ok = tr.verdict === 'accept';
  const where = word.length
    ? `The input is used up and the machine is in ${q}`
    : `The machine stays in ${q}`;
  yield step(
    ok
      ? `${where}, an accept state, so it accepts ${w}.`
      : `${where}, which is not an accept state, so it rejects ${w}.`,
    ['run.check', ok ? 'run.accept' : 'run.reject'],
    1,
    [mark(stateId(q), ok ? 'found' : 'error'), mark(verdictId, ok ? 'found' : 'error')],
  );
  return tr;
}

const run: Op = {
  label: 'Run',
  arity: 1,
  *run(s, [arg], { settings }) {
    const a = machineFor(s.machine, settings);
    const raw = String(arg ?? '');
    const problem = wordProblem(raw, a);
    if (problem) {
      yield {
        state: s,
        marks: [],
        say: `Nothing to run. ${problem}`,
        lines: ['run.sig'],
        level: 1,
        vars: runVars(null),
      } satisfies DfaStep;
      return s;
    }
    yield* runSteps(s, a, parseWord(raw, a) as string, deadState(s.machine, settings), (st) => st);
    return s;
  },
};

function testVars(t: TestTable, r: DfaRun | undefined): Record<string, Scalar> {
  const done = t.rows.filter((x) => x.got !== undefined);
  return {
    ...runVars(r ?? null),
    words: `${done.length} of ${t.rows.length}`,
    mismatches: done.filter((x) => rowOk(x) === false).length,
  };
}

function rowSay(row: TestRow, end: string, stuck: boolean): string {
  const w = wordText(row.word);
  const did = row.got === 'accept' ? 'accepts it' : 'rejects it';
  const why = stuck
    ? `It gets stuck in ${end} with no move, so it ${did}.`
    : `It ends in ${end}, ${row.got === 'accept' ? 'an accept state' : 'not an accept state'}, so it ${did}.`;
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
    const a = machineFor(s.machine, settings);
    const items = parseBatch(String(arg ?? ''), a);
    if (items instanceof Error) {
      yield {
        state: s,
        marks: [],
        say: `Nothing to test. ${items.message}`,
        lines: ['test.sig'],
        level: 1,
        vars: runVars(null),
      } satisfies DfaStep;
      return s;
    }
    const dead = deadState(s.machine, settings);
    const rows: TestRow[] = items.map((it) => ({ word: it.word, expect: it.expect }));
    const room = Math.max(...rows.map((r) => r.word.length));
    const table = (at: number): TestTable => ({ rows: rows.map((r) => ({ ...r })), at });
    yield {
      state: s,
      marks: [],
      say: `Test ${plural(rows.length, 'word')}. Each one runs from ${a.start}, and the table puts what the machine does next to what it should do (+ accept, - reject).`,
      lines: ['test.for'],
      level: 2,
      vars: testVars(table(-1), undefined),
      extra: { test: table(-1), room },
    } satisfies DfaStep;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      // The run itself is fine detail: each of its steps, inside the table's row.
      const tr = yield* runSteps(s, a, row.word, dead, (st) => ({
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
      const end = tr.path.at(-1)!;
      const ok = rowOk(row);
      const r: DfaRun = {
        word: row.word,
        read: tr.stuckAt ?? row.word.length,
        q: end,
        stuck: tr.stuckAt !== null,
      };
      yield {
        state: s,
        marks: [
          mark(testRowId(i), ok === false ? 'error' : ok ? 'found' : 'active'),
          mark(stateId(end), tr.verdict === 'accept' ? 'found' : 'error'),
        ],
        say: rowSay(row, end, tr.stuckAt !== null),
        lines: ok === false ? ['test.check', 'test.mismatch'] : ['test.run', 'test.check'],
        level: 2,
        vars: testVars(table(i), r),
        extra: { run: r, test: table(i), room },
      } satisfies DfaStep;
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
    } satisfies DfaStep;
    return s;
  },
};

const load = loadOp<S, DfaSettings, X>({
  make: (a) => ({ machine: a }),
  words: true,
  check: (a) => {
    const why = whyNotDfa(a);
    return why ? `This is not a DFA: ${why}. The NFA page runs machines like this one.` : null;
  },
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

export function pseudocode(settings: DfaSettings): PseudoBlock[] {
  const partial = settings.dead === 'hide';
  return [
    {
      op: 'run',
      lines: [
        L('run.sig', 0, 'RUN(M, w)', 'To run the machine M on a word w:'),
        L('run.start', 1, 'q = q0', 'Start in the start state.'),
        L('run.for', 1, 'for each symbol c of w', 'Read w one symbol at a time.'),
        ...(partial
          ? [
              L('run.missing', 2, 'if δ(q, c) is undefined', 'If there is no move for it,'),
              L('run.stuck', 3, 'reject', 'stop and reject.'),
            ]
          : []),
        L('run.move', 2, 'q = δ(q, c)', 'Follow the move for it.'),
        L('run.check', 1, 'if q ∈ F', 'When the input runs out, if we are in an accept state,'),
        L('run.accept', 2, 'accept', 'accept.'),
        L('run.reject', 1, 'else reject', 'Otherwise, reject.'),
      ],
    },
    {
      op: 'test',
      lines: [
        L('test.sig', 0, 'TEST(M, batch)', 'To test M on a batch of words:'),
        L(
          'test.for',
          1,
          'for each (w, expected) in batch',
          'Take each word with the answer it should get.',
        ),
        L('test.run', 2, 'got = RUN(M, w)', 'Run M on it.'),
        L('test.check', 2, 'if got ≠ expected', 'If M gives a different answer,'),
        L('test.mismatch', 3, 'report a mismatch', 'report it.'),
      ],
    },
  ];
}

export function initialSay(): string {
  return 'This DFA accepts the binary words that end in 01. Type a word such as 1101 and press Run, or load your own machine.';
}

export const initialVars = (): Record<string, Scalar> => runVars(null);

export function describe(state: S, settings?: DfaSettings): string {
  return describeAutomaton(settings ? machineFor(state.machine, settings) : state.machine);
}

export function describeRun(r: DfaRun): string {
  const w = wordText(r.word);
  if (r.verdict === 'accept') return `Run on ${w}: accepted, ending in ${r.q}.`;
  if (r.stuck) return `Run on ${w}: no move from ${r.q} on ${r.word[r.read]}, so it is rejected.`;
  if (r.verdict === 'reject') return `Run on ${w}: rejected, ending in ${r.q}.`;
  return `Run on ${w}: ${r.read} of ${r.word.length} symbols read, in ${r.q}.`;
}
