import type { Mark, OpSpec, PseudoBlock, Scalar, Step, Value } from '../../engine/types';
import { plural, words as list } from '../_automata/page';
import {
  ACCEPT,
  BLANK,
  CAP,
  SIM_CAP,
  formatTape,
  halting,
  parseMachine,
  parseWords,
  readSweep,
  ruleText,
  run as runMachine,
  shown,
  simLength,
  simMove,
  startConfig,
  step as move,
  wordsText,
  writeSweep,
  type MtConfig,
  type MtMachine,
  type MtRule,
  type Sim,
} from './machine';
import { COPY_COMPARE } from './machines';

export interface MtSettings {
  [key: string]: Scalar;
  /** How the single tape marks the cell under each virtual head: Sipser's dot, or a line under. */
  mark: 'dot' | 'underline';
}

export interface MtState {
  machine: MtMachine;
  /** The input of the current run, one word per tape, or null before the first. */
  words: string[] | null;
  /** The k-tape machine's configuration. */
  config: MtConfig | null;
  /** The single tape that simulates it. */
  sim: Sim | null;
  /** Cells the single tape reaches in this run (its length when the run ends), so the drawing
   * keeps its size while the tape grows. */
  room: number;
}

/** Where the one-tape machine is in simulating a move. */
export type Phase = 'format' | 'read' | 'found' | 'write' | 'shift' | 'back';

export interface MtExtra {
  /** The operation that made the step: the k-tape machine alone, or the simulation. */
  mode?: 'run' | 'sim';
  phase?: Phase;
  /** The tape whose segment the single tape's head is at. */
  tape?: number;
  /** What the single tape's head has read so far in this scan, null where it has not been. */
  seen?: (string | null)[];
  /** The rule of the move being made. */
  rule?: MtRule;
  /** Heads told to move left at cell 0, which stayed. */
  bumped?: boolean[];
  /** No rule applied: the machine rejected without a move. */
  stuck?: boolean;
  /** The run stopped at the cap, still running. */
  capped?: boolean;
  /** The single tape's moves for the move of M being simulated. */
  cost?: number;
}

type S = MtState;
type X = MtExtra;
type Op = OpSpec<S, MtSettings, X>;
type MtStep = Step<S, X>;

export const defaults: MtSettings = { mark: 'dot' };

/** Group colors for tapes 1 to 3: a head on its tape, and its mark on the single tape. */
export const TAPE_ROLES = ['g2', 'g4', 'g7'] as const;

export function init(): S {
  return {
    machine: parseMachine(COPY_COMPARE) as MtMachine,
    words: null,
    config: null,
    sim: null,
    room: 0,
  };
}

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });
const reads = (a: string) => (a === BLANK ? 'a blank' : a);
const moves = (n: number) => plural(n, 'move');
const count = (n: number) => n.toLocaleString('en-US');
const tapeName = (i: number) => `tape ${i + 1}`;
const markName = (settings: MtSettings) => (settings.mark === 'dot' ? 'dot' : 'underline');
const dir = (d: string) => (d === 'L' ? 'left' : 'right');

export function vars(s: S): Record<string, Scalar> | undefined {
  const c = s.config;
  if (!c) return undefined;
  return {
    state: c.state,
    'M moves': c.moves,
    'S moves': s.sim?.moves ?? 0,
    heads: c.tapes.map((t) => t.head).join(', '),
    'S cells': s.sim?.cells.length ?? 0,
  };
}

function refuse(s: S, say: string, line: string, id: string): MtStep {
  return { state: s, marks: [mark(id, 'error')], say, lines: [line], vars: vars(s), level: 1 };
}

/** The words for this machine, or why they will not do. */
function wordsArg(m: MtMachine, arg: Value | undefined): string[] | Error {
  const w = parseWords(String(arg ?? ''));
  if (w instanceof Error) return w;
  if (w.length > m.k)
    return new Error(
      `"${wordsText(w)}" has ${w.length} words, and this machine has ${m.k} tapes. Give at most one word per tape.`,
    );
  return w;
}

/** "01=01 on tape 1; tape 2 is blank". */
function inputText(m: MtMachine, words: readonly string[]): string {
  const filled = words.flatMap((w, i) => (w ? [`${w} on ${tapeName(i)}`] : []));
  const blank = Array.from({ length: m.k }, (_, i) => i).filter((i) => !words[i]);
  const rest = blank.length
    ? `${list(blank.map(tapeName))} ${blank.length === 1 ? 'is' : 'are'} blank`
    : '';
  if (!filled.length) return `every tape is blank`;
  return rest ? `${list(filled)}; ${rest}` : list(filled);
}

/** Put the input on the tapes and format the single tape: the start, and the step that shows it. */
function begin(
  s: S,
  words: string[],
  settings: MtSettings,
  op: 'run' | 'sim' | 'start',
): { state: S; step: MtStep } {
  const m = s.machine;
  const config = startConfig(m, words);
  const sim = formatTape(m, words);
  const room = simLength(runMachine(m, words, op === 'run' ? CAP : SIM_CAP).config);
  const state: S = { ...s, words, config, sim, room };
  const L = sim.cells.length;
  const say = `Write the input: ${inputText(m, words)}. Every head starts on cell 0, in ${m.start}. On one tape, S writes the ${plural(m.k, 'tape')} side by side between #s and puts a ${markName(settings)} on the first cell of each, where its head is: ${L} cells, written in one pass right and one back, ${count(sim.moves)} moves.`;
  return {
    state,
    step: {
      state,
      marks: [mark('sim-title', 'active')],
      say,
      lines: [op === 'run' ? 'run.init' : op === 'sim' ? 'sim.format' : 'start.init'],
      vars: vars(state),
      level: 2,
      extra: { mode: op === 'run' ? 'run' : 'sim', phase: 'format' },
    },
  };
}

/** Marks for the end of a run: the status lines and the counters. */
function verdictMarks(c: MtConfig): Mark[] {
  const role = c.state === ACCEPT ? 'found' : 'error';
  return [mark('status', role), mark('sim-status', role), mark('count-m', role)];
}

/** "both heads move right", "head 1 stays and head 2 moves right". */
export function headsText(ms: readonly string[]): string {
  if (ms.every((d) => d === ms[0])) {
    const who = ms.length === 2 ? 'both heads' : `all ${ms.length} heads`;
    return ms[0] === 'S' ? `${who} stay` : `${who} move ${dir(ms[0]!)}`;
  }
  return list(ms.map((d, i) => `head ${i + 1} ${d === 'S' ? 'stays' : `moves ${dir(d)}`}`));
}

/** "mark reads 0 and a blank: write 0 and $, head 1 stays and head 2 moves right, go to copy." */
function moveText(rule: MtRule, bumped: boolean[]): string {
  const keep = rule.write.every((b, i) => b === rule.read[i]);
  const what = keep ? 'leave the symbols' : `write ${list(rule.write.map(shown))}`;
  const go = rule.to === rule.from ? `stay in ${rule.to}` : `go to ${rule.to}`;
  let say = `${rule.from} reads ${list(rule.read.map(reads))}: ${what}, ${headsText(rule.move)}, ${go}.`;
  const stuck = bumped.flatMap((b, i) => (b ? [i + 1] : []));
  if (stuck.length)
    say += ` ${stuck.length === 1 ? 'Head' : 'Heads'} ${list(stuck.map(String))} ${stuck.length === 1 ? 'is' : 'are'} already on cell 0, so ${stuck.length === 1 ? 'it stays' : 'they stay'}.`;
  return say;
}

const ending = (c: MtConfig, w: string) =>
  `The machine ${c.state === ACCEPT ? 'accepts' : 'rejects'} ${w} after ${moves(c.moves)}`;

/** A step that says the run is still going at the cap. */
function capStep(s: S, mode: 'run' | 'sim', line: string): MtStep {
  const c = s.config!;
  const sim = s.sim!;
  const say =
    mode === 'run'
      ? `Still running after ${CAP} moves: it may never halt, and no program can tell in general. On one tape the same ${CAP} moves take ${count(sim.moves)}. Press Step to go on, one move at a time.`
      : `Still running after ${SIM_CAP} moves of M, which took S ${count(sim.moves)} moves: ${Math.round(sim.moves / c.moves)} a move, and climbing. It may never halt. Press Step to go on, one move at a time.`;
  return {
    state: s,
    marks: [mark('status', 'active'), mark('count-s', 'active')],
    say,
    lines: [line],
    vars: vars(s),
    level: 1,
    extra: { mode, capped: true },
  };
}

/** One move of the k-tape machine, with the single tape brought up to date at once. */
function runMove(s: S, w: string): { state: S; step: MtStep; done: boolean } {
  const c = s.config!;
  const r = move(s.machine, c);
  if (r.kind === 'halted') throw new Error('runMove() needs a machine that can still move');
  if (r.kind === 'stuck') {
    const state: S = { ...s, config: r.config, sim: readSweep(s.sim!).end };
    return {
      state,
      done: true,
      step: {
        state,
        marks: [mark('rule-title', 'error'), ...verdictMarks(r.config)],
        say: `${c.state} reads ${list(r.read.map(reads))}, and no rule covers that. A missing rule means reject, so the machine rejects ${w} after ${moves(c.moves)}. On one tape, S needs ${count(state.sim!.moves)}.`,
        lines: ['move.read', 'move.none', 'run.halt'],
        vars: vars(state),
        level: 1,
        extra: { mode: 'run', stuck: true },
      },
    };
  }
  const { rule, bumped, config } = r;
  const state: S = { ...s, config, sim: simMove(s.sim!, rule) };
  const done = halting(rule.to);
  let say = moveText(rule, bumped);
  if (done)
    say += ` ${ending(config, w)}. On one tape, the same run takes ${count(state.sim!.moves)} moves.`;
  const written = c.tapes.flatMap((t, i) =>
    rule.write[i] !== rule.read[i] && config.tapes[i]!.head !== t.head
      ? [mark(`t${i + 1}-${t.head}`, 'new')]
      : [],
  );
  return {
    state,
    done,
    step: {
      state,
      marks: [
        mark(`rule-${rule.line}`, 'active'),
        ...written,
        ...(done ? verdictMarks(config) : []),
      ],
      say,
      lines: [
        'move.read',
        'move.rule',
        'move.write',
        'move.move',
        'move.next',
        ...(done ? ['run.halt'] : []),
      ],
      vars: vars(state),
      level: done ? 1 : 2,
      extra: { mode: 'run', rule, bumped },
    },
  };
}

/**
 * One move of M carried out on the single tape: the scan right (a step at each mark, level 3,
 * and one at the last #, where M's tapes make the move), then the scan back (a step at each
 * mark, level 3; a step for each shift), then the step back at the first #. Returns the state
 * after the move and whether the run is over.
 */
function* simSteps(
  s: S,
  settings: MtSettings,
  w: string,
  /** The operation's pseudocode has a return line to light at the end. */
  halt: boolean,
): Generator<MtStep, { state: S; done: boolean }> {
  const m = s.machine;
  const c = s.config!;
  const r = move(m, c);
  if (r.kind === 'halted') throw new Error('simSteps() needs a machine that can still move');
  const start = s.sim!;
  const scan = readSweep(start);
  const seen: (string | null)[] = c.tapes.map(() => null);
  for (const [i, at] of scan.at.entries()) {
    seen[i] = scan.read[i]!;
    const state: S = { ...s, sim: at };
    yield {
      state,
      marks: [],
      say: `Scanning right, S passes the ${markName(settings)} for ${tapeName(i)}: that head reads ${reads(scan.read[i]!)}.`,
      lines: ['sim.read'],
      vars: vars(state),
      level: 3,
      extra: { mode: 'sim', phase: 'read', tape: i, seen: [...seen], cost: at.moves - start.moves },
    };
  }
  const cost = (x: Sim) => x.moves - start.moves;
  const read = list(scan.read.map(shown));
  if (r.kind === 'stuck') {
    const state: S = { ...s, config: r.config, sim: scan.end };
    yield {
      state,
      marks: [
        mark('rule-title', 'error'),
        mark(`sim-${scan.end.head}`, 'error'),
        ...verdictMarks(r.config),
      ],
      say: `At the last #, S has read ${read}, and no rule covers ${c.state} reading that. A missing rule means reject: M rejects ${w} after ${moves(c.moves)}, and S rejects after ${count(scan.end.moves)}.`,
      lines: ['sim.read', 'sim.none', ...(halt ? ['sim.halt'] : [])],
      vars: vars(state),
      level: 1,
      extra: { mode: 'sim', phase: 'found', seen: scan.read, stuck: true, cost: cost(scan.end) },
    };
    return { state, done: true };
  }
  const { rule, bumped, config } = r;
  let state: S = { ...s, config, sim: scan.end };
  yield {
    state,
    marks: [mark(`rule-${rule.line}`, 'active'), mark(`sim-${scan.end.head}`, 'active')],
    say: `At the last #, S has read every head's symbol: ${read}. ${ruleText(rule)}, so M makes move ${config.moves} at once, on its own tapes. To do the same, S must scan back and update each segment. The scan right took ${moves(cost(scan.end))}.`,
    lines: ['sim.read', 'sim.rule'],
    vars: vars(state),
    level: 2,
    extra: { mode: 'sim', phase: 'found', seen: scan.read, rule, bumped, cost: cost(scan.end) },
  };
  const back = writeSweep(scan.end, rule);
  for (const e of back.events) {
    const i = e.tape;
    const d = e.sim.dots[i]!;
    const at = rule.move[i] === 'R' ? d - 1 : rule.move[i] === 'L' && !e.bumped ? d + 1 : d;
    state = { ...state, sim: e.sim };
    const what =
      rule.write[i] === rule.read[i]
        ? `leaves ${shown(rule.write[i]!)}`
        : `writes ${shown(rule.write[i]!)}`;
    const where = e.bumped
      ? `The ${markName(settings)} is on the segment's first cell, so it stays: ${tapeName(i)}'s head is on cell 0.`
      : rule.move[i] === 'S'
        ? `The ${markName(settings)} stays.`
        : `Then it moves the ${markName(settings)} ${dir(rule.move[i]!)}.`;
    yield {
      state,
      marks: [
        mark(`sim-${at}`, 'new'),
        ...(at !== e.sim.head ? [mark(`sim-${e.sim.head}`, 'active')] : []),
      ],
      say: `Scanning left, S reaches the ${markName(settings)} for ${tapeName(i)} and ${what} there. ${where}`,
      lines: ['sim.write'],
      vars: vars(state),
      level: 3,
      extra: {
        mode: 'sim',
        phase: 'write',
        tape: i,
        seen: scan.read,
        rule,
        bumped,
        cost: cost(e.sim),
      },
    };
    if (e.shifted) {
      const L = e.sim.cells.length;
      const shiftCost = 2 * (L - 1 - d);
      yield {
        state,
        marks: [mark(`sim-${d}`, 'new')],
        say: `The ${markName(settings)} for ${tapeName(i)} landed on a #, so that tape needs a new cell. S writes ␣ there and shifts everything from the # on one cell right, then walks back: ${moves(shiftCost)}.`,
        lines: ['sim.write', 'sim.shift'],
        vars: vars(state),
        level: 2,
        extra: {
          mode: 'sim',
          phase: 'shift',
          tape: i,
          seen: scan.read,
          rule,
          bumped,
          cost: cost(e.sim),
        },
      };
    }
  }
  state = { ...state, sim: back.end };
  const done = halting(rule.to);
  const total = cost(back.end);
  const say = done
    ? `Back at the first #. ${ending(config, w)}, and S ${rule.to === ACCEPT ? 'accepts' : 'rejects'} after ${count(back.end.moves)}: ${Math.round(back.end.moves / Math.max(1, config.moves))} for each move of M.`
    : `Back at the first #: move ${config.moves} of M took S ${moves(total)}. So far M has made ${moves(config.moves)} and S ${count(back.end.moves)}.`;
  yield {
    state,
    marks: done ? verdictMarks(config) : [mark('count-s', 'active'), mark('sim-0', 'active')],
    say,
    lines: ['sim.write', 'sim.next', ...(done && halt ? ['sim.halt'] : [])],
    vars: vars(state),
    level: done ? 1 : 2,
    extra: { mode: 'sim', phase: 'back', seen: scan.read, rule, bumped, cost: total },
  };
  return { state, done };
}

const load: Op = {
  label: 'Load',
  arity: 1,
  *run(s, [arg]) {
    const text = String(arg ?? '').trim();
    const m = parseMachine(text);
    if (m instanceof Error) {
      const why =
        text && !/->|→|;/.test(text) && !/^start\s/i.test(text)
          ? `"${text}" is not a machine. Type rules such as "q0 1,_ -> q1 1,1 R,R"; to run a word, press Run.`
          : m.message;
      yield refuse(
        s,
        `Nothing loaded. ${why} The machine stays as it was.`,
        'load.read',
        'rule-title',
      );
      return s;
    }
    const state: S = { machine: m, words: null, config: null, sim: null, room: 0 };
    const others = m.states.length - 1;
    yield {
      state,
      marks: [mark('rule-title', 'new')],
      say: `Loaded a ${m.k}-tape machine with ${plural(m.rules.length, 'rule')} over the symbols ${m.symbols.map(shown).join(' ')}. It starts in ${m.start} and has ${plural(others, 'other state')} besides accept and reject. Type a word and press Run, or Simulate to watch one tape do the same work.`,
      lines: ['load.read', 'load.check', 'load.start'],
      level: 1,
    } satisfies MtStep;
    return state;
  },
};

function* refuseWords(s: S, arg: Value | undefined, op: string, line: string) {
  const w = wordsArg(s.machine, arg);
  if (w instanceof Error) {
    yield refuse(s, `Nothing ${op}. ${w.message}`, line, 'status');
    return null;
  }
  return w;
}

const start: Op = {
  label: 'Start',
  arity: 1,
  *run(s, [arg], { settings }) {
    const w = yield* refuseWords(s, arg, 'started', 'start.sig');
    if (!w) return s;
    const b = begin(s, w, settings, 'start');
    yield { ...b.step, say: `${b.step.say} Press Step to simulate one move at a time.` };
    return b.state;
  },
};

const run: Op = {
  label: 'Run',
  arity: 1,
  *run(s, [arg], { settings }) {
    const w = yield* refuseWords(s, arg, 'run', 'run.sig');
    if (!w) return s;
    const b = begin(s, w, settings, 'run');
    yield b.step;
    let cur = b.state;
    const text = wordsText(w);
    for (;;) {
      const c = cur.config!;
      if (halting(c.state)) {
        yield {
          state: cur,
          marks: verdictMarks(c),
          say: `The start state is ${c.state}, so the machine ${c.state === ACCEPT ? 'accepts' : 'rejects'} ${text} without a move.`,
          lines: ['run.loop', 'run.halt'],
          vars: vars(cur),
          level: 1,
          extra: { mode: 'run' },
        };
        return cur;
      }
      // A missing rule rejects at once; only a machine that can move counts toward the cap.
      if (c.moves >= CAP && move(cur.machine, c).kind === 'moved') {
        yield capStep(cur, 'run', 'run.cap');
        return cur;
      }
      const a = runMove(cur, text);
      yield a.step;
      cur = a.state;
      if (a.done) return cur;
    }
  },
};

const simulate: Op = {
  label: 'Simulate',
  arity: 1,
  *run(s, [arg], { settings }) {
    const w = yield* refuseWords(s, arg, 'simulated', 'sim.sig');
    if (!w) return s;
    const b = begin(s, w, settings, 'sim');
    yield b.step;
    let cur = b.state;
    const text = wordsText(w);
    for (;;) {
      const c = cur.config!;
      if (halting(c.state)) {
        yield {
          state: cur,
          marks: verdictMarks(c),
          say: `The start state is ${c.state}, so M ${c.state === ACCEPT ? 'accepts' : 'rejects'} ${text} without a move, and S halts as soon as its tape is ready.`,
          lines: ['sim.loop', 'sim.halt'],
          vars: vars(cur),
          level: 1,
          extra: { mode: 'sim' },
        };
        return cur;
      }
      if (c.moves >= SIM_CAP && move(cur.machine, c).kind === 'moved') {
        yield capStep(cur, 'sim', 'sim.cap');
        return cur;
      }
      const r = yield* simSteps(cur, settings, text, true);
      cur = r.state;
      if (r.done) return cur;
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
        marks: [mark('status', 'active')],
        say: 'There is no word on the tapes yet. Type a word and press Start (or Run, or Simulate), then Step.',
        lines: ['step.sig'],
        level: 1,
      };
      return s;
    }
    if (halting(c.state)) {
      yield {
        state: s,
        marks: verdictMarks(c),
        say: `The machine has already halted in ${c.state}, after ${moves(c.moves)}. Start, run or simulate a word to go again.`,
        lines: ['step.halted'],
        vars: vars(s),
        level: 1,
      };
      return s;
    }
    const r = yield* simSteps(s, settings, wordsText(s.words ?? []), false);
    return r.state;
  },
};

export const ops = { run, simulate, step: stepOp, start, load };

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: MtSettings): PseudoBlock[] {
  const dot = settings.mark === 'dot';
  const format = (id: string, indent: number) =>
    L(
      id,
      indent,
      dot
        ? 'tape = # ẇ1 w2 … wn # ␣ # … # ␣ #, first cells dotted'
        : 'tape = # w̲1 w2 … wn # ␣ # … # ␣ #, first cells underlined',
      dot
        ? 'Write the k tapes on one, with a # at each end and between them, and put a dot on the first cell of each: that is where its head is.'
        : 'Write the k tapes on one, with a # at each end and between them, and underline the first cell of each: that is where its head is.',
    );
  const simLines = (i: number) => [
    L(
      'sim.read',
      i,
      'scan right to the last #; a1 … ak = the marked symbols',
      'Scan right from the first # to the last, and remember the symbol at each mark.',
    ),
    L(
      'sim.none',
      i,
      'if δ(q, a1 … ak) is undefined: reject',
      'If no rule covers the state and those symbols, reject.',
    ),
    L(
      'sim.rule',
      i,
      '(p, b1 … bk, D1 … Dk) = δ(q, a1 … ak)',
      'Look up the rule: the next state, a symbol to write and a move for each tape.',
    ),
    L(
      'sim.write',
      i,
      'scan left to the first #; at mark i: write bi, move the mark by Di',
      'Scan back to the first #. At each mark, write the new symbol and move the mark the way that head moves.',
    ),
    L(
      'sim.shift',
      i + 1,
      'if a mark moves onto a #: write ␣ there, shift the rest right',
      'If a mark moves onto a #, that tape needs a new cell: write a blank there and shift everything after it one cell right.',
    ),
    L('sim.next', i, 'q = p', 'Go to the next state, kept in S’s own state.'),
  ];
  const moveLines = (i: number) => [
    L(
      'move.read',
      i,
      'a1 … ak = the symbols under the k heads',
      'Read the symbol under each head, all at once.',
    ),
    L(
      'move.none',
      i,
      'if δ(q, a1 … ak) is undefined: q = reject',
      'If no rule covers the state and those symbols, reject.',
    ),
    L(
      'move.rule',
      i,
      '(p, b1 … bk, D1 … Dk) = δ(q, a1 … ak)',
      'Look up the rule: the next state, a symbol to write and a move for each tape.',
    ),
    L('move.write', i, 'for each tape i: write bi under head i', 'Each head writes its symbol.'),
    L(
      'move.move',
      i,
      'for each tape i: move head i by Di (L at cell 0 stays)',
      'Each head moves left, right or stays, all at once; a head at cell 0 cannot go left.',
    ),
    L('move.next', i, 'q = p; moves = moves + 1', 'Go to state p and count the move.'),
  ];
  return [
    {
      op: 'run',
      lines: [
        L('run.sig', 0, 'run(w)', 'To run the k-tape machine on its input:'),
        L(
          'run.init',
          1,
          'tape 1 = w; other tapes blank; every head on cell 0; q = q0',
          'Write the input on tape 1 (one word per tape if there are several), put every head on cell 0, and start in q0.',
        ),
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
      op: 'simulate',
      lines: [
        L('sim.sig', 0, 'simulate(w)', 'To run the k-tape machine on a single tape:'),
        format('sim.format', 1),
        L(
          'sim.loop',
          1,
          'while q ≠ accept and q ≠ reject',
          'Until the simulated machine reaches accept or reject:',
        ),
        L(
          'sim.cap',
          2,
          `if moves of M = ${SIM_CAP}: stop, still running`,
          `Give up after ${SIM_CAP} moves of the k-tape machine.`,
        ),
        ...simLines(2),
        L('sim.halt', 1, 'return q', 'Report accept or reject.'),
      ],
    },
    {
      op: 'step',
      lines: [
        L('step.sig', 0, 'step()', 'To simulate one move on the single tape:'),
        L(
          'step.halted',
          1,
          'if q = accept or q = reject: stop',
          'If the machine has halted, there is nothing left to do.',
        ),
        ...simLines(1),
      ],
    },
    {
      op: 'start',
      lines: [
        L('start.sig', 0, 'start(w)', 'To put the input on the tapes without running:'),
        L(
          'start.init',
          1,
          'tape 1 = w; every head on cell 0; q = q0',
          'Write the input, put every head on cell 0, and start in q0.',
        ),
        format('sim.format', 1),
      ],
    },
    {
      op: 'load',
      lines: [
        L('load.sig', 0, 'load(rules)', 'To load a machine:'),
        L(
          'load.read',
          1,
          'for each rule "q a1,…,ak -> p b1,…,bk D1,…,Dk": δ(q, a1 … ak) = (p, b1 … bk, D1 … Dk)',
          'Read each rule: in state q with the heads reading a1 to ak, write b1 to bk, move D1 to Dk, and go to p.',
        ),
        L(
          'load.check',
          1,
          'if some q and a1 … ak have two rules: error',
          'Refuse a second rule for the same state and symbols: the machine must be deterministic.',
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
  return 'This two-tape machine checks that the word before the = matches the word after it: it copies the first word to tape 2, then compares. Type a word such as 01=01 and press Run. Press Simulate to watch one tape do the same work, much more slowly. Or type rules of your own and press Load.';
}

/** Screen-reader summary. */
export function describe(state: S): string {
  const m = state.machine;
  const head = `A ${m.k}-tape Turing machine with ${plural(m.states.length, 'state')} besides accept and reject, and ${plural(m.rules.length, 'rule')}; it starts in ${m.start}.`;
  const c = state.config;
  if (!c) return `${head} No word on the tapes.`;
  const tapes = c.tapes
    .map(
      (t, i) =>
        `${tapeName(i)} holds ${t.cells.length ? t.cells.map((a) => (a === BLANK ? 'blank' : a)).join(' ') : 'nothing'}, its head on cell ${t.head}`,
    )
    .join('; ');
  const sim = state.sim;
  const one = sim
    ? ` The single tape has ${sim.cells.length} cells, ${sim.cells.map((a) => (a === BLANK ? 'blank' : a)).join(' ')}, with marks on cells ${list(sim.dots.map(String))}; its head is on cell ${sim.head} after ${count(sim.moves)} moves.`
    : '';
  return `${head} ${tapes.charAt(0).toUpperCase()}${tapes.slice(1)}. The state is ${c.state} after ${moves(c.moves)}.${one}`;
}
