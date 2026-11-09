/**
 * The busy beaver: run an n-state, 2-symbol Turing machine from a blank tape and count its moves
 * and the 1s it leaves. Σ(n) is the most 1s a halting n-state machine leaves, S(n) the most moves
 * it makes; the champions hold those records.
 *
 * Operations: Load a machine (a champion's name or the compact text), Step (one move), Run (until
 * it halts, repeats a configuration, or makes CAP moves; each move a step), Run moves (n moves,
 * each a fine step, every tenth a normal one, for long runs) and Reset (a blank tape again).
 *
 * The tape is the Turing kit's: a configuration holds the non-blank span (0 is the blank), the
 * head and the moves made, on a tape infinite both ways. The state keeps the last ROWS tapes for
 * the space-time picture, newest last, each named by its move number.
 */
import type { Mark, OpSpec, PseudoBlock, Scalar, Step, Value } from '../../engine/types';
import {
  ACCEPT,
  BLANK,
  cellAt,
  startConfig,
  step as kitStep,
  type Config,
  type Machine,
} from '../_turing/machine';
import { moveId, stateId } from '../../layouts/automaton';
import {
  CHAMPIONS,
  HALT,
  championOf,
  formatMachine,
  kitMachine,
  parseMachine,
  type BbMachine,
  type BbRule,
} from './machines';

export interface BbSettings {
  [key: string]: Scalar;
  /** How the stage shows the rules: a table (the busy beaver literature) or a state diagram. */
  rules: 'table' | 'diagram';
}

export const defaults: BbSettings = { rules: 'table' };

/** A run stops after this many moves; Run moves takes at most this many too. */
export const CAP = 500;
/** Tapes kept for the space-time picture. */
export const ROWS = 12;
/** In Run moves, every EVERY-th move is a normal step; the rest are fine detail. */
export const EVERY = 10;

export interface Row {
  /** The moves made when this was the tape: names the row's shapes. */
  n: number;
  first: number;
  cells: string[];
  head: number;
}

export interface BbState {
  machine: BbMachine;
  config: Config;
  /** How it stopped: by a rule into H, or for want of a rule; false while it can move. */
  halted: false | 'rule' | 'none';
  rows: Row[];
}

export interface BbExtra {
  /** The rule just used: the state and the symbol it read. */
  used?: { q: string; read: 0 | 1 };
  /** The run stopped at the cap, or on a configuration seen before (at that move). */
  capped?: boolean;
  repeat?: number;
}

type S = BbState;
type X = BbExtra;
type Op = OpSpec<S, BbSettings, X>;
type BbStep = Step<S, X>;

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });

export const ones = (c: Pick<Config, 'cells'>): number => c.cells.filter((a) => a === '1').length;

/** The state letter, H once halted. */
export const stateOf = (s: S): string => (s.halted ? HALT : s.config.state);

const rowOf = (c: Config): Row => ({
  n: c.moves,
  first: c.first,
  cells: [...c.cells],
  head: c.head,
});

const kits = new WeakMap<BbMachine, Machine>();

/** The machine on the Turing kit, made once per machine. */
function onKit(m: BbMachine): Machine {
  let k = kits.get(m);
  if (!k) kits.set(m, (k = kitMachine(m)));
  return k;
}

function fresh(machine: BbMachine): S {
  const config = startConfig(onKit(machine), '');
  return { machine, config, halted: false, rows: [rowOf(config)] };
}

export function init(): S {
  return fresh(parseMachine(CHAMPIONS[1]!.text) as BbMachine);
}

export function vars(s: S): Record<string, Scalar> {
  const c = s.config;
  return {
    state: stateOf(s),
    moves: c.moves,
    ones: ones(c),
    head: c.head,
    cells: c.hi - c.lo + 1,
  };
}

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

/** The rule of state q on bit a, and the shape it lights: a table cell or a diagram arrow. */
export function ruleOf(m: BbMachine, q: string, a: 0 | 1): BbRule | null {
  return m.table[q]?.[a] ?? null;
}

export const ruleCell = (q: string, a: 0 | 1) => `rule-${q}-${a}`;

/** The state diagram is drawn for machines up to this many states; past it, the table. */
export const DIAGRAM_MAX = 4;
export const showsDiagram = (m: BbMachine, settings: BbSettings) =>
  settings.rules === 'diagram' && m.states.length <= DIAGRAM_MAX;

function usedMark(m: BbMachine, settings: BbSettings, q: string, a: 0 | 1, r: BbRule | null) {
  if (showsDiagram(m, settings))
    return r ? mark(moveId(q, r.next), 'active') : mark(stateId(q), 'error');
  return mark(ruleCell(q, a), r ? 'active' : 'error');
}

/** What a halted machine scored, and the record it holds if it is a champion. */
function score(s: S): string {
  const c = s.config;
  const n = s.machine.states.length;
  const base = `It halted after ${plural(c.moves, 'move')}, with ${plural(ones(c), 'one', 'ones')} on the tape.`;
  const champ = championOf(s.machine);
  if (!champ) return base;
  if (champ.holds === 'both')
    return `${base} No halting ${n}-state machine does better on either count: Σ(${n}) = ${champ.ones} and S(${n}) = ${champ.moves}.`;
  if (champ.holds === 'ones')
    return `${base} No halting 3-state machine leaves more 1s: Σ(3) = 6. The record for moves, S(3) = 21, belongs to another machine (bb3s).`;
  return `${base} No halting 3-state machine makes more moves: S(3) = 21. The record for 1s, Σ(3) = 6, belongs to another machine (bb3).`;
}

const bit = (a: string): 0 | 1 => (a === '1' ? 1 : 0);

/** One move, or the stop for want of a rule. Returns the next state and its step. */
function advance(
  s: S,
  settings: BbSettings,
  level: 1 | 2 | 3,
  lines: string[],
): { state: S; step: BbStep } {
  const c = s.config;
  const q = c.state;
  const a = bit(cellAt(c, c.head));
  const r = ruleOf(s.machine, q, a);
  const res = kitStep(onKit(s.machine), c, 'two-way');
  if (res.kind !== 'moved') {
    const state: S = { ...s, halted: 'none' };
    return {
      state,
      step: {
        state,
        marks: [usedMark(s.machine, settings, q, a, null), mark('status', 'error')],
        say: `${q} reads ${a}, and there is no rule for that, so the machine stops without a move. ${score(state)}`,
        lines: [...lines, 'move.none'],
        vars: vars(state),
        level: 1,
        extra: { used: { q, read: a } },
      },
    };
  }
  const next = res.config;
  const halted = next.state === ACCEPT ? ('rule' as const) : false;
  const state: S = { ...s, config: next, halted, rows: [...s.rows, rowOf(next)].slice(-ROWS) };
  const w = r!.write;
  const what = String(a) === w ? `leave the ${w}` : `write ${w}`;
  const dir = r!.move === 'R' ? 'move right' : 'move left';
  const go = r!.next === HALT ? 'halt' : r!.next === q ? `stay in ${q}` : `go to ${r!.next}`;
  let say = `Move ${next.moves}: ${q} reads ${a}: ${what}, ${dir}, ${go}.`;
  if (halted) say += ` ${score(state)}`;
  return {
    state,
    step: {
      state,
      marks: [
        usedMark(s.machine, settings, q, a, r),
        mark('tape-head', halted ? 'found' : 'active'),
        ...(halted ? [mark('status', 'found')] : []),
      ],
      say,
      lines: [...lines, 'move.rule', 'move.write', 'move.head', 'move.next'],
      vars: vars(state),
      level: halted ? 1 : level,
      extra: { used: { q, read: a } },
    },
  };
}

function alreadyHalted(s: S, line: string): BbStep {
  return {
    state: s,
    marks: [mark('status', 'found')],
    say: `The machine has already halted, after ${plural(s.config.moves, 'move')} with ${plural(ones(s.config), 'one', 'ones')}. Press Reset to start again on a blank tape.`,
    lines: [line],
    vars: vars(s),
    level: 1,
  };
}

const configKey = (c: Config) => `${c.state}|${c.head}|${c.first}|${c.cells.join('')}`;

const load: Op = {
  label: 'Load',
  arity: 1,
  *run(s, [arg]) {
    const text = String(arg ?? '').trim();
    const m = parseMachine(text);
    if (m instanceof Error) {
      yield {
        state: s,
        marks: [mark('rule-title', 'error')],
        say: `Nothing loaded. ${/^-?\d+$/.test(text) ? `${text} is a number: to make that many moves, press Run moves.` : m.message} The machine stays as it was.`,
        lines: ['load.read'],
        vars: vars(s),
        level: 1,
      } satisfies BbStep;
      return s;
    }
    const state = fresh(m);
    const champ = championOf(m);
    const n = m.states.length;
    const who = champ
      ? `the ${n}-state champion${champ.holds === 'ones' ? ' for 1s' : champ.holds === 'moves' ? ' for moves' : ''}, ${formatMachine(m)}`
      : `a ${n}-state machine, ${formatMachine(m)}`;
    yield {
      state,
      marks: [mark('rule-title', 'new')],
      say: `Loaded ${who}. The tape is all 0s and the machine starts in A. Press Run, or Step to make one move at a time.`,
      lines: ['load.read', 'load.blank'],
      vars: vars(state),
      level: 1,
    } satisfies BbStep;
    return state;
  },
};

const reset: Op = {
  label: 'Reset',
  arity: 0,
  *run(s) {
    const state = fresh(s.machine);
    yield {
      state,
      marks: [mark('tape-head', 'active')],
      say: 'A blank tape again: every cell holds 0, the head is on cell 0, and the machine is in A.',
      lines: ['load.blank'],
      vars: vars(state),
      level: 1,
    } satisfies BbStep;
    return state;
  },
};

const stepOp: Op = {
  label: 'Step',
  arity: 0,
  *run(s, _args, { settings }) {
    if (s.halted) {
      yield alreadyHalted(s, 'step.sig');
      return s;
    }
    const a = advance(s, settings, 1, ['move.read']);
    yield { ...a.step, level: 1 };
    return a.state;
  },
};

/**
 * Moves until the machine halts, comes back to a configuration it was in (so it loops), or has
 * made `limit` moves. `level` says how each move shows: Run makes every move a normal step;
 * Run moves makes them fine detail, with every EVERY-th move a normal step.
 */
function* moves(
  s: S,
  settings: BbSettings,
  limit: number,
  fine: boolean,
  line: string,
): Generator<BbStep, S, void> {
  let cur = s;
  const seen = new Map<string, number>([[configKey(cur.config), cur.config.moves]]);
  for (let k = 1; k <= limit; k++) {
    const level = !fine || k % EVERY === 0 ? 2 : 3;
    const a = advance(cur, settings, level, [line, 'move.read']);
    cur = a.state;
    if (cur.halted) {
      yield line === 'run.loop' ? { ...a.step, lines: [...a.step.lines, 'run.score'] } : a.step;
      return cur;
    }
    const key = configKey(cur.config);
    const before = seen.get(key);
    if (before !== undefined && !fine) {
      yield {
        ...a.step,
        say: `${a.step.say} That is exactly the configuration of move ${before}: the same state, the same head position, the same tape. From here it can only do what it did then, forever. It never halts.`,
        marks: [...a.step.marks, mark('status', 'error')],
        lines: [...a.step.lines, 'run.repeat'],
        level: 1,
        extra: { ...a.step.extra, repeat: before },
      };
      return cur;
    }
    seen.set(key, cur.config.moves);
    if (k === limit) {
      const c = cur.config;
      yield {
        ...a.step,
        say: fine
          ? `${a.step.say} That makes ${plural(limit, 'move')} this time: ${plural(c.moves, 'move')} in all, and ${plural(ones(c), 'one', 'ones')} on the tape.`
          : `${a.step.say} Still running after ${plural(limit, 'move')}, with ${plural(ones(c), 'one', 'ones')}. It may never halt, and no program can tell for every machine: that is the halting problem.`,
        marks: [...a.step.marks, mark('status', 'active')],
        lines: [...a.step.lines, ...(fine ? [] : ['run.cap'])],
        level: 1,
        extra: { ...a.step.extra, capped: !fine },
      };
      return cur;
    }
    yield a.step;
  }
  return cur;
}

const run: Op = {
  label: 'Run',
  arity: 0,
  *run(s, _args, { settings }) {
    if (s.halted) {
      yield alreadyHalted(s, 'run.loop');
      return s;
    }
    return yield* moves(s, settings, CAP, false, 'run.loop');
  },
};

/** The number of moves Run moves makes: a whole number from 1 to CAP, or an Error. */
export function moveCount(arg: Value | undefined): number | Error {
  const t = String(arg ?? '').trim();
  if (!/^\d+$/.test(t))
    return new Error(`"${t}" is not a number of moves. Type a number from 1 to ${CAP}.`);
  const n = Number(t);
  if (n < 1 || n > CAP) return new Error(`Type a number of moves from 1 to ${CAP}.`);
  return n;
}

const steps: Op = {
  label: 'Run moves',
  arity: 1,
  *run(s, [arg], { settings }) {
    const n = moveCount(arg);
    if (n instanceof Error) {
      yield {
        state: s,
        marks: [mark('status', 'error')],
        say: `Nothing run. ${n.message} To load a machine, press Load.`,
        lines: ['steps.sig'],
        vars: vars(s),
        level: 1,
      } satisfies BbStep;
      return s;
    }
    if (s.halted) {
      yield alreadyHalted(s, 'steps.loop');
      return s;
    }
    return yield* moves(s, settings, n, true, 'steps.loop');
  },
};

export const ops = { load, step: stepOp, run, steps, reset };

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(): PseudoBlock[] {
  const move = (i: number) => [
    L('move.read', i, 'a = tape[head]', 'Read the bit under the head.'),
    L(
      'move.none',
      i,
      'if δ(q, a) is missing: stop',
      'If there is no rule for this state and bit, stop without a move.',
    ),
    L(
      'move.rule',
      i,
      '(b, D, p) = δ(q, a)',
      'Look up the rule: the bit b to write, the direction D, the next state p.',
    ),
    L('move.write', i, 'tape[head] = b', 'Write b.'),
    L('move.head', i, 'head = head ± 1 (D = R or L)', 'Move one cell right or left.'),
    L('move.next', i, 'q = p; moves = moves + 1', 'Go to state p and count the move.'),
  ];
  return [
    {
      op: 'run',
      lines: [
        L('run.sig', 0, 'run()', 'To run the machine:'),
        L('run.loop', 1, 'while q ≠ H', 'Until it reaches the halt state H:'),
        L(
          'run.cap',
          2,
          `if moves = ${CAP}: stop, still running`,
          `Give up after ${CAP} moves: it may never halt.`,
        ),
        L(
          'run.repeat',
          2,
          'if this configuration was seen: it loops',
          'If the state, head and tape are all as they were before, it loops forever.',
        ),
        ...move(2),
        L('run.score', 1, 'return moves, count of 1s', 'Report the moves made and the 1s left.'),
      ],
    },
    {
      op: 'step',
      lines: [
        L('step.sig', 0, 'step()', 'To make one move:'),
        L('step.halted', 1, 'if q = H: stop', 'If the machine has halted, there is nothing to do.'),
        ...move(1),
      ],
    },
    {
      op: 'steps',
      lines: [
        L('steps.sig', 0, 'steps(n)', 'To make n moves:'),
        L('steps.loop', 1, 'repeat n times, while q ≠ H', 'Up to n times, unless it halts first:'),
        ...move(2),
      ],
    },
    {
      op: 'load',
      lines: [
        L('load.sig', 0, 'load(rules)', 'To load a machine:'),
        L(
          'load.read',
          1,
          'δ(q, a) = (b, D, p) for each rule',
          'Read two rules per state: what to do on a 0 and on a 1.',
        ),
        L(
          'load.blank',
          1,
          'tape = …000…; head = 0; q = A; moves = 0',
          'Start on a tape of 0s, in state A.',
        ),
      ],
    },
  ];
}

export function initialSay(): string {
  return 'The 2-state busy beaver: two states, A and B, and a halt state H. It starts in A on a tape of 0s. Press Run to see how many 1s it leaves, or Load another machine (bb3, bb3s, bb4).';
}

export function initialVars(s: S) {
  return vars(s);
}

/** Screen-reader summary. */
export function describe(s: S): string {
  const m = s.machine;
  const c = s.config;
  const rules = m.states
    .map((q) => `${q}: on 0 ${ruleText(ruleOf(m, q, 0))}, on 1 ${ruleText(ruleOf(m, q, 1))}`)
    .join('; ');
  const tape = c.cells.length
    ? `The tape holds ${c.cells.map((a) => (a === BLANK ? 0 : 1)).join(' ')} from cell ${c.first}, 0s elsewhere`
    : 'The tape is all 0s';
  const where = s.halted ? 'it has halted' : `the machine is in ${c.state}`;
  return `A ${m.states.length}-state busy beaver machine. Rules: ${rules}. ${tape}; the head is on cell ${c.head} and ${where} after ${plural(c.moves, 'move')}, with ${plural(ones(c), 'one', 'ones')}.`;
}

const ruleText = (r: BbRule | null) =>
  r ? `write ${r.write}, move ${r.move === 'R' ? 'right' : 'left'}, go to ${r.next}` : 'no rule';
