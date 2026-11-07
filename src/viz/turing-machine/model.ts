import type { Mark, OpSpec, PseudoBlock, Scalar, Step, Value } from '../../engine/types';
import {
  ACCEPT,
  BLANK,
  BLANK_SHOWN,
  CAP,
  REJECT,
  cellAt,
  configParts,
  formatConfig,
  halting,
  parseMachine,
  parseWord,
  startConfig,
  step as move,
  type Config,
  type Machine,
  type Rule,
  type TapeKind,
} from '../_turing/machine';
import { ZERO_ONE } from './machines';

export interface TmSettings {
  [key: string]: Scalar;
  /** Sipser's tape is infinite to the right only; Hopcroft–Ullman's both ways. */
  tape: TapeKind;
  /** L and R (Sipser), or L, R and S (stay). */
  moves: 'LR' | 'LRS';
}

/** One configuration in the trace: Sipser's u q v, and a number that names its shapes. */
export interface TraceLine {
  n: number;
  moves: number;
  u: string;
  q: string;
  v: string;
}

export interface TmState {
  machine: Machine;
  /** The word of the current run, or null before the first. */
  word: string | null;
  config: Config | null;
  /** The last few configurations, oldest first; the last is the current one. */
  trace: TraceLine[];
}

export interface TmExtra {
  /** The rule just used, and whether the head stayed at the left end of a one-way tape. */
  rule?: Rule;
  bumped?: boolean;
  /** No rule applied: the machine rejected without a move. */
  stuck?: boolean;
  /** The run stopped at the cap, still running. */
  capped?: boolean;
}

type S = TmState;
type X = TmExtra;
type Op = OpSpec<S, TmSettings, X>;
type TmStep = Step<S, X>;

export const defaults: TmSettings = { tape: 'one-way', moves: 'LR' };

/** Configurations kept in the trace, and the symbols kept on each side of the head in each. */
export const TRACE_KEEP = 6;
const KEEP = 16;

export function init(): S {
  return { machine: parseMachine(ZERO_ONE) as Machine, word: null, config: null, trace: [] };
}

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });
const sym = (a: string) => (a === BLANK ? BLANK_SHOWN : a);
const reads = (a: string) => (a === BLANK ? 'a blank' : a);
export const showWord = (w: string) => (w === '' ? 'ε (the empty word)' : w);
const moves = (n: number) => `${n} move${n === 1 ? '' : 's'}`;

export function vars(s: S): Record<string, Scalar> | undefined {
  const c = s.config;
  if (!c) return undefined;
  return { state: c.state, head: c.head, moves: c.moves, 'cells used': c.hi - c.lo + 1 };
}

/** The state with `c` as the current configuration, appended to the trace (or starting it). */
function withConfig(s: S, c: Config, settings: TmSettings, fresh = false): S {
  const last = fresh ? undefined : s.trace.at(-1);
  const line: TraceLine = {
    n: last ? last.n + 1 : 0,
    moves: c.moves,
    ...configParts(c, settings.tape, KEEP),
  };
  return { ...s, config: c, trace: [...(fresh ? [] : s.trace), line].slice(-TRACE_KEEP) };
}

const newest = (s: S) => `cfg-${s.trace.at(-1)!.n}`;

/** Marks for the end of a run: the head, the status and the last configuration. */
function verdictMarks(s: S): Mark[] {
  const role = s.config!.state === ACCEPT ? 'found' : 'error';
  return [
    mark('tape-head', role),
    mark('tape-head-t', role),
    mark('status', role),
    mark(newest(s), role),
  ];
}

function refuse(s: S, say: string, line: string, id: string): TmStep {
  return {
    state: s,
    marks: [mark(id, 'error')],
    say,
    lines: [line],
    vars: vars(s),
    level: 1,
  };
}

function wordArg(arg: Value | undefined): string | Error {
  return parseWord(String(arg ?? ''));
}

/** Put the word on the tape: the start configuration, and the step that shows it. */
function begin(s: S, w: string, settings: TmSettings, line: string): { state: S; step: TmStep } {
  const state = withConfig({ ...s, word: w }, startConfig(s.machine, w), settings, true);
  const where =
    settings.tape === 'one-way'
      ? 'at the left end of the tape'
      : 'on a tape of blanks that goes on forever both ways';
  const c = formatConfig(state.config!, settings.tape, KEEP);
  return {
    state,
    step: {
      state,
      marks: [mark('tape-head', 'active'), mark(newest(state), 'active')],
      say: `Write ${showWord(w)} ${where}, put the head on cell 0, and start in ${s.machine.start}. The configuration is ${c}.`,
      lines: [line],
      vars: vars(state),
      level: 2,
    },
  };
}

const dirLine = (r: Rule) =>
  r.move === 'L' ? 'move.left' : r.move === 'R' ? 'move.right' : 'move.stay';

/** One move of the machine, or its halt for want of a rule, as a step. */
function advance(
  s: S,
  settings: TmSettings,
  op: 'run' | 'step',
): { state: S; step: TmStep; done: boolean } {
  const c = s.config!;
  const w = showWord(s.word ?? '');
  const r = move(s.machine, c, settings.tape);
  if (r.kind === 'halted') throw new Error('advance() needs a machine that can still move');
  if (r.kind === 'stuck') {
    const state = withConfig(s, r.config, settings);
    const a = cellAt(c, c.head);
    const cell = s.machine.symbols.includes(a) ? `rule-${c.state}-${a}` : `rule-r-${c.state}`;
    return {
      state,
      done: true,
      step: {
        state,
        marks: [mark(cell, 'error'), ...verdictMarks(state)],
        say: `${c.state} reads ${reads(a)}, and no rule covers that. A missing rule means reject, so the machine rejects ${w} after ${moves(c.moves)}.`,
        lines: ['move.read', 'move.none', ...(op === 'run' ? ['run.halt'] : [])],
        vars: vars(state),
        level: 1,
        extra: { stuck: true },
      },
    };
  }
  const { rule, bumped } = r;
  const state = withConfig(s, r.config, settings);
  const what = rule.write === rule.read ? 'leave it' : `write ${sym(rule.write)}`;
  const dir = rule.move === 'R' ? 'move right' : rule.move === 'L' ? 'move left' : 'stay put';
  const go = rule.to === rule.from ? `remain in ${rule.to}` : `go to ${rule.to}`;
  let say = `${rule.from} reads ${reads(rule.read)}: ${what}, ${dir}, ${go}.`;
  if (bumped) say += ' The head is already on the first cell, so it stays there.';
  const n = r.config.moves;
  if (rule.to === ACCEPT) say += ` The machine accepts ${w} after ${moves(n)}.`;
  if (rule.to === REJECT) say += ` The machine rejects ${w} after ${moves(n)}.`;
  const done = halting(rule.to);
  const changed = rule.write !== rule.read && c.head !== r.config.head;
  return {
    state,
    done,
    step: {
      state,
      marks: [
        mark(`rule-${rule.from}-${rule.read}`, 'active'),
        ...(changed ? [mark(`tape-${c.head}`, 'new')] : []),
        ...(done ? verdictMarks(state) : [mark(newest(state), 'active')]),
      ],
      say,
      lines: [
        'move.read',
        'move.rule',
        'move.write',
        dirLine(rule),
        'move.next',
        ...(done && op === 'run' ? ['run.halt'] : []),
      ],
      vars: vars(state),
      level: done ? 1 : 2,
      extra: { rule, bumped },
    },
  };
}

const load: Op = {
  label: 'Load',
  arity: 1,
  *run(s, [arg], { settings }) {
    const m = parseMachine(String(arg ?? ''), { stay: settings.moves === 'LRS' });
    if (m instanceof Error) {
      yield refuse(
        s,
        `Nothing loaded. ${m.message} The machine stays as it was.`,
        'load.read',
        'rule-title',
      );
      return s;
    }
    const state: S = { machine: m, word: null, config: null, trace: [] };
    const others = m.states.length - (m.states.includes(m.start) ? 1 : 0);
    yield {
      state,
      marks: [mark('rule-title', 'new')],
      say: `Loaded ${m.rules.length} rule${m.rules.length === 1 ? '' : 's'} over the tape symbols ${m.symbols.map(sym).join(' ')}. The machine starts in ${m.start} and has ${others} other state${others === 1 ? '' : 's'} besides accept and reject. Type a word and press Run.`,
      lines: ['load.read', 'load.check', 'load.start'],
      level: 1,
    } satisfies TmStep;
    return state;
  },
};

const start: Op = {
  label: 'Start',
  arity: 1,
  *run(s, [arg], { settings }) {
    const w = wordArg(arg);
    if (w instanceof Error) {
      yield refuse(s, `Nothing started. ${w.message}`, 'start.sig', 'trace-title');
      return s;
    }
    const b = begin(s, w, settings, 'start.init');
    yield { ...b.step, say: `${b.step.say} Press Step to make one move at a time.` };
    return b.state;
  },
};

const run: Op = {
  label: 'Run',
  arity: 1,
  *run(s, [arg], { settings }) {
    const w = wordArg(arg);
    if (w instanceof Error) {
      yield refuse(s, `Nothing run. ${w.message}`, 'run.sig', 'trace-title');
      return s;
    }
    const b = begin(s, w, settings, 'run.init');
    yield b.step;
    let cur = b.state;
    if (halting(cur.config!.state)) {
      const verb = cur.config!.state === ACCEPT ? 'accepts' : 'rejects';
      yield {
        state: cur,
        marks: verdictMarks(cur),
        say: `The start state is ${cur.config!.state}, so the machine ${verb} ${showWord(w)} without a move.`,
        lines: ['run.loop', 'run.halt'],
        vars: vars(cur),
        level: 1,
      };
      return cur;
    }
    for (;;) {
      const c = cur.config!;
      // A missing rule rejects at once; only a machine that can move counts toward the cap.
      if (c.moves >= CAP && move(cur.machine, c, settings.tape).kind === 'moved') {
        yield {
          state: cur,
          marks: [mark('status', 'compare'), mark(newest(cur), 'compare')],
          say: `Still running after ${CAP} moves: it may never halt, and no program can tell in general. That is the halting problem. Press Step to go on, one move at a time.`,
          lines: ['run.cap'],
          vars: vars(cur),
          level: 1,
          extra: { capped: true },
        };
        return cur;
      }
      const a = advance(cur, settings, 'run');
      yield a.step;
      cur = a.state;
      if (a.done) return cur;
    }
  },
};

const stepOp: Op = {
  label: 'Step',
  arity: 0,
  *run(s, _args, { settings }) {
    const c = s.config;
    if (!c) {
      yield {
        state: s,
        marks: [mark('trace-title', 'active')],
        say: 'There is no word on the tape yet. Type a word and press Start (or Run), then Step.',
        lines: ['step.sig'],
        level: 1,
      };
      return s;
    }
    if (halting(c.state)) {
      yield {
        state: s,
        marks: verdictMarks(s),
        say: `The machine has already halted in ${c.state}, after ${moves(c.moves)}. Start or run a word to go again.`,
        lines: ['step.halted'],
        vars: vars(s),
        level: 1,
      };
      return s;
    }
    const a = advance(s, settings, 'step');
    yield { ...a.step, level: 1 };
    return a.state;
  },
};

export const ops = { run, step: stepOp, start, load };

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: TmSettings): PseudoBlock[] {
  const oneWay = settings.tape === 'one-way';
  const init = (id: string) =>
    oneWay
      ? L(
          id,
          1,
          'tape = w␣␣…; head = 0; q = q0',
          'Write w at the left end of the tape, put the head on its first cell, and start in q0.',
        )
      : L(
          id,
          1,
          'tape = …␣␣w␣␣…; head = 0; q = q0',
          'Write w on a tape of blanks, put the head on its first symbol, and start in q0.',
        );
  const moveLines = (i: number) => [
    L('move.read', i, 'a = tape[head]', 'Read the symbol under the head.'),
    L(
      'move.none',
      i,
      'if δ(q, a) is undefined: q = reject',
      'If no rule covers this state and symbol, reject.',
    ),
    L(
      'move.rule',
      i,
      '(p, b, D) = δ(q, a)',
      'Look up the rule: the next state p, the symbol b to write, the direction D.',
    ),
    L('move.write', i, 'tape[head] = b', 'Write b over the symbol.'),
    oneWay
      ? L(
          'move.left',
          i,
          'if D = L: head = max(0, head − 1)',
          'Move left, unless the head is already on the first cell.',
        )
      : L(
          'move.left',
          i,
          'if D = L: head = head − 1',
          'Move left: the tape goes on forever that way too.',
        ),
    L('move.right', i, 'if D = R: head = head + 1', 'Move right.'),
    ...(settings.moves === 'LRS'
      ? [L('move.stay', i, 'if D = S: head stays', 'Or stay on the same cell.')]
      : []),
    L('move.next', i, 'q = p; moves = moves + 1', 'Go to state p and count the move.'),
  ];
  return [
    {
      op: 'run',
      lines: [
        L('run.sig', 0, 'run(w)', 'To run the machine on a word w:'),
        init('run.init'),
        L(
          'run.loop',
          1,
          'while q ≠ accept and q ≠ reject',
          'Until the machine reaches accept or reject:',
        ),
        L(
          'run.cap',
          2,
          `if moves = ${CAP}: stop, still running`,
          `Give up after ${CAP} moves: it may never halt.`,
        ),
        ...moveLines(2),
        L('run.halt', 1, 'return q', 'Report accept or reject.'),
      ],
    },
    {
      op: 'step',
      lines: [
        L('step.sig', 0, 'step()', 'To make one move:'),
        L(
          'step.halted',
          1,
          'if q = accept or q = reject: stop',
          'If the machine has halted, there is nothing left to do.',
        ),
        ...moveLines(1),
      ],
    },
    {
      op: 'start',
      lines: [
        L('start.sig', 0, 'start(w)', 'To put a word on the tape without running:'),
        init('start.init'),
      ],
    },
    {
      op: 'load',
      lines: [
        L('load.sig', 0, 'load(rules)', 'To load a machine:'),
        L(
          'load.read',
          1,
          'for each rule "q a -> p b D": δ(q, a) = (p, b, D)',
          'Read each rule: in state q reading a, write b, move D, and go to p.',
        ),
        L(
          'load.check',
          1,
          'if some q and a have two rules: error',
          'Refuse a second rule for the same state and symbol: the machine must be deterministic.',
        ),
        L(
          'load.start',
          1,
          'q0 = the start state',
          "Start in the state named by start, or else in the first rule's state.",
        ),
      ],
    },
  ];
}

export function initialSay(): string {
  return 'This machine accepts 0ⁿ1ⁿ: some 0s followed by as many 1s. Its rules are in the table. Type a word such as 0011 and press Run, or type rules of your own and press Load.';
}

/** Screen-reader summary. */
export function describe(state: S): string {
  const m = state.machine;
  const head = `Turing machine with ${m.states.length} state${m.states.length === 1 ? '' : 's'} besides accept and reject, and ${m.rules.length} rule${m.rules.length === 1 ? '' : 's'}; it starts in ${m.start}.`;
  const c = state.config;
  if (!c) return `${head} No word on the tape.`;
  const tape = c.cells.length
    ? `The tape holds ${c.cells.map((a) => (a === BLANK ? 'blank' : a)).join(' ')} from cell ${c.first}`
    : 'The tape is blank';
  return `${head} ${tape}; the head is on cell ${c.head} in state ${c.state} after ${moves(c.moves)}.`;
}
