/**
 * The halting problem by diagonalization, on a table of toy programs (toy.ts) against their
 * descriptions. Every entry comes from a run. Operations:
 *
 *   build        run every program on every description, a cell per step, a row per milestone
 *   diagonalize  walk down the diagonal and flip each entry into D's row
 *   contradict   ask what D does on ⟨D⟩, and refute both answers
 *   run i j      run Mi on ⟨Mj⟩ line by line, with the cycle check
 *   reduce       the other problem by reduction: HALT from A_TM (Sipser) or A_TM from HALT
 *
 * Settings: Sipser's A_TM framing (accept, reject, loop; D always halts) or the HALT framing
 * (halt or loop; D loops where Mi halts), and the table size, 4 to 6.
 */
import type { Mark, OpSpec, PseudoBlock, Scalar, Step, Value } from '../../engine/types';
import { plural, words } from '../_automata/page';
import {
  CAP,
  MAX_SIZE,
  MIN_SIZE,
  PROGRAMS,
  cell,
  halts,
  instrText,
  primeCell,
  type Outcome,
  type RunResult,
} from './toy';

export type Framing = 'atm' | 'halt';

export interface HaltSettings {
  [key: string]: Scalar;
  framing: Framing;
  size: number;
}

/** The end of a run, or a point in one, as the panel shows it. */
export interface RunView {
  i: number;
  j: number;
  /** The line just run (or about to run, at step 0). */
  line: number;
  head: number;
  /** Lines run so far. */
  step: number;
  /** How the run ended, or null while it goes on. */
  done: Outcome | null;
  /** For a loop: the step whose configuration came back. */
  first?: number;
}

export type Question = 'none' | 'ask' | 'yes' | 'no' | 'done';

export interface HaltState {
  n: number;
  framing: Framing;
  /** shown[i][j]: the cell has been run. */
  shown: boolean[][];
  /** D's entries filled in so far. */
  d: boolean[];
  /** How far the question "what does D do on ⟨D⟩?" has got. */
  dd: Question;
  /** Cells answered by the reduction's machine (S, or R in the HALT framing). */
  reduced: boolean[][];
  /** The run in the panel, or null for the panel's usual content. */
  run: RunView | null;
}

export interface HaltExtra {
  /** D's entry k slides in from the diagonal cell (k, k). */
  slide?: number;
  /** The diagonal is drawn through rows 0 to diag. */
  diag?: number;
}

type S = HaltState;
type X = HaltExtra;
type Op = OpSpec<S, HaltSettings, X>;
type HStep = Step<S, X>;

export const defaults: HaltSettings = { framing: 'atm', size: 4 };

export const clampSize = (n: number): number =>
  Math.max(MIN_SIZE, Math.min(MAX_SIZE, Number.isFinite(n) ? Math.round(n) : MIN_SIZE));

const grid = (n: number): boolean[][] => Array.from({ length: n }, () => Array(n).fill(false));

export function init(settings: HaltSettings): S {
  const n = clampSize(settings.size);
  return {
    n,
    framing: settings.framing === 'halt' ? 'halt' : 'atm',
    shown: grid(n),
    d: Array(n).fill(false),
    dd: 'none',
    reduced: grid(n),
    run: null,
  };
}

// ---------------------------------------------------------------------------------------------
// Words

export const M = (i: number): string => `M${i + 1}`;
export const desc = (j: number): string => `⟨M${j + 1}⟩`;

/** A cell as the table writes it. */
export function cellLabel(o: Outcome, framing: Framing): string {
  if (o === 'loop') return '∞';
  if (o === 'unknown') return '?';
  if (framing === 'halt') return 'halt';
  return o === 'accept' ? 'acc' : 'rej';
}

/** What D does on ⟨Mi⟩, given what Mi does on ⟨Mi⟩. */
export function dOutcome(o: Outcome, framing: Framing): Outcome {
  if (framing === 'halt') return halts(o) ? 'loop' : 'accept';
  return o === 'accept' ? 'reject' : 'accept';
}

/** D's entry for row i, as the table writes it. */
export const dLabel = (i: number, framing: Framing): string =>
  cellLabel(dOutcome(cell(i, i).outcome, framing), framing);

/** D's whole row, as typed in practice answers: acc/rej, or halt/loop. */
export function dWords(n: number, framing: Framing): string[] {
  return Array.from({ length: n }, (_, i) => {
    const o = dOutcome(cell(i, i).outcome, framing);
    return framing === 'halt' ? (o === 'loop' ? 'loop' : 'halt') : o === 'accept' ? 'acc' : 'rej';
  });
}

/** "accepts", "halts on" and so on, before a description. */
function verbOn(o: Outcome, framing: Framing): string {
  if (o === 'loop') return 'loops on';
  if (o === 'unknown') return 'has not stopped on';
  if (framing === 'halt') return 'halts on';
  return o === 'accept' ? 'accepts' : 'rejects';
}

const stepsText = (r: RunResult) => plural(r.steps, 'step');

/** Why a run ended as it did: "it accepts after 7 steps", "before step 24 it is back...". */
export function runWhy(r: RunResult, i: number): string {
  const prog = PROGRAMS[i]!.prog;
  if (r.outcome === 'loop') {
    const s = r.first!;
    const t = r.again!;
    const c = r.trace[t - 1]!;
    const repeats = t - 1 === s ? `step ${s}` : `steps ${s} to ${t - 1}`;
    return `before step ${t} it is back on line ${c.line} (${instrText(prog[c.line - 1]!)}) with the head on cell ${c.head}, just as before step ${s}, so it repeats ${repeats} forever`;
  }
  if (r.outcome === 'unknown')
    return `it is still running after ${CAP} steps, so there is no answer`;
  const how = r.off ? `${r.outcome}s when it runs past its last line` : `${r.outcome}s`;
  return `it ${how} after ${stepsText(r)}`;
}

/** One cell's result in a sentence. */
export function cellSay(i: number, j: number, framing: Framing): string {
  const r = cell(i, j);
  const what = `${M(i)} ${verbOn(r.outcome, framing)} ${desc(j)}`;
  if (r.outcome === 'loop') return `${what}: ${runWhy(r, i)}.`;
  if (framing === 'halt' && halts(r.outcome)) return `${what}: ${runWhy(r, i)}.`;
  return `${what} after ${stepsText(r)}.`;
}

/** "accepts ⟨M2⟩ and ⟨M4⟩; loops on ⟨M1⟩ and ⟨M3⟩". */
function rowSummary(i: number, n: number, framing: Framing): string {
  const groups = new Map<string, string[]>();
  for (let j = 0; j < n; j++) {
    const v = verbOn(cell(i, j).outcome, framing);
    groups.set(v, [...(groups.get(v) ?? []), desc(j)]);
  }
  return [...groups].map(([v, ds]) => `${v} ${words(ds)}`).join('; ');
}

/** H's answer for Mi on ⟨Mi⟩ and what D does with it. */
function diagSay(i: number, framing: Framing): string {
  const o = cell(i, i).outcome;
  const pair = `⟨${M(i)}, ${desc(i)}⟩`;
  if (framing === 'halt') {
    return halts(o)
      ? `${M(i)} halts on ${desc(i)}, so H says it halts, and D does the opposite: it loops forever on ${desc(i)}. D differs from ${M(i)} in column ${i + 1}.`
      : `${M(i)} loops on ${desc(i)}, so H says it loops, and D does the opposite: it halts on ${desc(i)}. D differs from ${M(i)} in column ${i + 1}.`;
  }
  if (o === 'accept')
    return `${M(i)} accepts ${desc(i)}, so H accepts ${pair}, and D rejects ${desc(i)}. D differs from ${M(i)} in column ${i + 1}.`;
  const did = o === 'loop' ? 'loops on' : 'rejects';
  return `${M(i)} ${did} ${desc(i)}, so it does not accept it: H rejects ${pair} (H always answers), and D accepts ${desc(i)}. D differs from ${M(i)} in column ${i + 1}.`;
}

const H_IS: Record<Framing, string> = {
  atm: 'H decides A_TM: on ⟨M, w⟩ it always halts, accepting if M accepts w and rejecting if not',
  halt: 'H decides HALT: on ⟨M, w⟩ it always halts, and says whether M halts on w',
};

// ---------------------------------------------------------------------------------------------
// State helpers

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });
export const cellId = (i: number, j: number): string => `cell-${i}-${j}`;
export const dId = (i: number): string => `d-${i}`;
export const DD_ID = 'dd';

function reveal(s: S, i: number, j: number): S {
  if (s.shown[i]![j]) return s;
  const shown = s.shown.map((row) => [...row]);
  shown[i]![j] = true;
  return { ...s, shown };
}

/** The panel at the end of a cell's run. */
function endOf(i: number, j: number): RunView {
  const r = cell(i, j);
  const c = r.trace[r.trace.length - 1]!;
  return {
    i,
    j,
    line: c.line,
    head: c.head,
    step: r.steps,
    done: r.outcome,
    first: r.first,
  };
}

const filled = (s: S): number => s.shown.flat().filter(Boolean).length;

function counts(s: S): { halted: number; looped: number } {
  let halted = 0;
  let looped = 0;
  for (let i = 0; i < s.n; i++)
    for (let j = 0; j < s.n; j++) {
      if (!s.shown[i]![j]) continue;
      if (halts(cell(i, j).outcome)) halted++;
      else looped++;
    }
  return { halted, looped };
}

function vars(s: S, more: Record<string, Scalar> = {}): Record<string, Scalar> {
  const { halted, looped } = counts(s);
  return { ...more, n: s.n, filled: `${filled(s)} of ${s.n * s.n}`, halted, looped };
}

const clearOverlay = (s: S): S =>
  s.reduced.some((r) => r.some(Boolean)) || s.run ? { ...s, reduced: grid(s.n), run: null } : s;

/** D's row so far, as the narration lists it. */
const dRowText = (s: S): string =>
  Array.from({ length: s.n }, (_, i) => (s.d[i] ? dLabel(i, s.framing) : '…')).join(', ');

// ---------------------------------------------------------------------------------------------
// Operations

const build: Op = {
  label: 'Build table',
  arity: 0,
  *run(s0) {
    let s = clearOverlay(s0);
    const n = s.n;
    const todo: [number, number][] = [];
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (!s.shown[i]![j]) todo.push([i, j]);
    if (todo.length === 0) {
      yield {
        state: s,
        marks: [],
        say: `The table is already built: all ${n * n} cells come from runs. Diagonalize builds D from it.`,
        lines: ['build.sig'],
        vars: vars(s),
        level: 1,
      } satisfies HStep;
      return s;
    }
    yield {
      state: s,
      marks: [],
      say: 'Build the table: run every program on every description. A run ends when the program halts, or when it is back on a line with the head on a cell where it has been before, because then it repeats itself forever.',
      lines: ['build.sig', 'build.for'],
      vars: vars(s),
      level: 2,
    } satisfies HStep;
    for (let k = 0; k < todo.length; k++) {
      const [i, j] = todo[k]!;
      const r = cell(i, j);
      s = { ...reveal(s, i, j), run: endOf(i, j) };
      const rowEnd = todo[k + 1]?.[0] !== i;
      const say = rowEnd
        ? `${cellSay(i, j, s.framing)} Row ${M(i)} is done: it ${rowSummary(i, n, s.framing)}.`
        : cellSay(i, j, s.framing);
      yield {
        state: s,
        marks: [mark(cellId(i, j), 'active')],
        say,
        lines: ['build.run', r.outcome === 'loop' ? 'build.loop' : 'build.halt'],
        vars: vars(s, { cell: `${M(i)} on ${desc(j)}`, steps: r.steps }),
        level: rowEnd ? 1 : 2,
      } satisfies HStep;
    }
    s = { ...s, run: null };
    const { halted, looped } = counts(s);
    const loops = [];
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) if (cell(i, j).outcome === 'loop') loops.push(cell(i, j).again!);
    const latest = loops.length ? Math.max(...loops) : 0;
    const caught = loops.length
      ? ` Every loop came back to an earlier configuration by step ${latest}, far below the ${CAP}-step cap.`
      : '';
    yield {
      state: s,
      marks: [],
      say: `The table is built: ${plural(n * n, 'run')}, ${halted} halted and ${looped} looped.${caught}`,
      lines: ['build.for'],
      vars: vars(s),
      level: 1,
    } satisfies HStep;
    return s;
  },
};

const diagonalize: Op = {
  label: 'Diagonalize',
  arity: 0,
  *run(s0) {
    let s: S = { ...clearOverlay(s0), d: Array(s0.n).fill(false), dd: 'none' };
    const n = s.n;
    const H = s.framing === 'halt' ? 'H says whether Mi halts on ⟨Mi⟩' : 'H answers for ⟨Mi, ⟨Mi⟩⟩';
    yield {
      state: s,
      marks: [],
      say: `D needs one cell from each row: the diagonal, where Mi reads its own description ⟨Mi⟩. ${H}, and D does the opposite.`,
      lines: ['diag.def', 'diag.yes', 'diag.no', 'diag.sig'],
      vars: vars(s),
      level: 2,
    } satisfies HStep;
    for (let i = 0; i < n; i++) {
      const d = [...s.d];
      d[i] = true;
      s = { ...reveal(s, i, i), d, run: endOf(i, i) };
      yield {
        state: s,
        marks: [mark(cellId(i, i), 'compare'), mark(dId(i), 'active')],
        say: diagSay(i, s.framing),
        lines: ['diag.for', 'diag.set'],
        vars: vars(s, {
          i: i + 1,
          [`${M(i)} on ${desc(i)}`]: cellLabel(cell(i, i).outcome, s.framing),
          [`D on ${desc(i)}`]: dLabel(i, s.framing),
        }),
        level: 2,
        extra: { slide: i, diag: i },
      } satisfies HStep;
    }
    s = { ...s, run: null };
    yield {
      state: s,
      marks: Array.from({ length: n }, (_, i) => mark(dId(i), 'found')),
      say: `D's row is ${dRowText(s)}. It differs from row ${M(0)} in column 1, from row ${M(1)} in column 2, and so on down the diagonal, so D is none of ${M(0)} to ${M(n - 1)}. That is no contradiction yet: these toy programs are a tiny family, and D is not one of them.`,
      lines: ['diag.differ'],
      vars: vars(s, { D: dRowText(s) }),
      level: 1,
      extra: { diag: n - 1 },
    } satisfies HStep;
    return s;
  },
};

function caseSay(c: 'yes' | 'no', framing: Framing): string {
  if (framing === 'halt')
    return c === 'yes'
      ? 'Say D halts on ⟨D⟩. Then H says D halts on ⟨D⟩, and D does the opposite: it loops forever. Contradiction.'
      : 'Say D loops on ⟨D⟩. Then H says it loops, and D does the opposite: it halts. Contradiction again.';
  return c === 'yes'
    ? 'Say D accepts ⟨D⟩. Then H accepts ⟨D, ⟨D⟩⟩, and D does the opposite: it rejects ⟨D⟩. Contradiction.'
    : 'Say D does not accept ⟨D⟩. Then H rejects ⟨D, ⟨D⟩⟩, and D does the opposite: it accepts ⟨D⟩. Contradiction again.';
}

const contradict: Op = {
  label: 'D on ⟨D⟩',
  arity: 0,
  *run(s0) {
    let s = clearOverlay(s0);
    const n = s.n;
    const all = Array.from({ length: n }, (_, i) => mark(dId(i), 'found'));
    if (!s.d.every(Boolean)) {
      let shown = s;
      for (let i = 0; i < n; i++) shown = reveal(shown, i, i);
      s = { ...shown, d: Array(n).fill(true) };
      yield {
        state: s,
        marks: all,
        say: `First, D's row: the diagonal flipped, ${dRowText(s)}. It differs from every row of the table on the diagonal.`,
        lines: ['diag.for', 'diag.set'],
        vars: vars(s, { D: dRowText(s) }),
        level: 2,
        extra: { diag: n - 1 },
      } satisfies HStep;
    }
    const problem = s.framing === 'halt' ? 'HALT' : 'A_TM';
    s = { ...s, dd: 'ask' };
    yield {
      state: s,
      marks: [mark(DD_ID, 'active')],
      say: `Now suppose ${H_IS[s.framing]}, for every Turing machine. Then D is a Turing machine too. It has a description ⟨D⟩, and the full table of all machines has a row and a column for it. What goes in the cell where D reads ⟨D⟩?`,
      lines: ['dd.sig', 'dd.exists'],
      vars: vars(s, { D: dRowText(s) }),
      level: 2,
      extra: { diag: n - 1 },
    } satisfies HStep;
    s = { ...s, dd: 'yes' };
    yield {
      state: s,
      marks: [mark(DD_ID, 'error')],
      say: caseSay('yes', s.framing),
      lines: ['dd.yes'],
      vars: vars(s, { D: dRowText(s) }),
      level: 2,
      extra: { diag: n - 1 },
    } satisfies HStep;
    s = { ...s, dd: 'no' };
    yield {
      state: s,
      marks: [mark(DD_ID, 'error')],
      say: caseSay('no', s.framing),
      lines: ['dd.no'],
      vars: vars(s, { D: dRowText(s) }),
      level: 2,
      extra: { diag: n - 1 },
    } satisfies HStep;
    s = { ...s, dd: 'done' };
    yield {
      state: s,
      marks: [mark(DD_ID, 'error')],
      say: `Both answers are impossible, so nothing can go in that cell. The only thing we assumed was H, so H does not exist: no Turing machine decides ${problem}.`,
      lines: ['dd.end'],
      vars: vars(s, { D: dRowText(s) }),
      level: 1,
      extra: { diag: n - 1 },
    } satisfies HStep;
    return s;
  },
};

/** A program number from the input box (1-based), as a 0-based index, or null. */
export function programIndex(v: Value | undefined): number | null {
  const k =
    typeof v === 'number'
      ? v
      : typeof v === 'string' && /^\s*m?\s*[1-9]\s*$/i.test(v)
        ? Number(v.replace(/\D/g, ''))
        : NaN;
  return Number.isInteger(k) && k >= 1 && k <= MAX_SIZE ? k - 1 : null;
}

function symbolAt(input: string, head: number): string {
  return head < input.length ? input[head]! : '␣';
}

/** What line `line` did, when run with the head on `head` and then on `next`. */
function effect(i: number, j: number, line: number, head: number, next: number): string {
  const ins = PROGRAMS[i]!.prog[line - 1]!;
  const input = PROGRAMS[j]!.code;
  const on = head < input.length ? `on ${input[head]}` : 'at the end';
  switch (ins.op) {
    case 'right':
      return head === next
        ? 'the head is at the end already, so it stays there'
        : `the head moves to cell ${next} (${symbolAt(input, next)})`;
    case 'left':
      return head === next
        ? 'the head is on cell 0 already, so it stays there'
        : `the head moves to cell ${next} (${symbolAt(input, next)})`;
    case 'goto':
      return `jump to line ${ins.to}`;
    case 'end':
      return head === input.length
        ? `the head is at the end, so jump to line ${ins.to}`
        : `the head is ${on}, not at the end, so go on to line ${line + 1}`;
    case 'if':
      return head < input.length && input[head] === ins.sym
        ? `the head is on ${ins.sym}, so jump to line ${ins.to}`
        : `the head is ${on}, not on ${ins.sym}, so go on to line ${line + 1}`;
    default:
      return ins.op;
  }
}

const runOp: Op = {
  label: 'Run',
  arity: 2,
  *run(s0, [a, b]) {
    const i = programIndex(a);
    const j = programIndex(b);
    const n = s0.n;
    if (i === null || j === null || i >= n || j >= n) {
      const big = [i, j].find((k) => k !== null && k >= n);
      const say =
        big !== undefined && big !== null
          ? `${M(big)} is not in this table: it has ${n} programs. Pick numbers from 1 to ${n}, or make the table bigger in Options.`
          : `Run needs two program numbers from 1 to ${n}, such as 3 2 to run M3 on ⟨M2⟩.`;
      yield { state: s0, marks: [], say, lines: ['run.sig'], vars: vars(s0), level: 1 };
      return s0;
    }
    let s = clearOverlay(s0);
    const r = cell(i, j);
    const prog = PROGRAMS[i]!.prog;
    const input = PROGRAMS[j]!.code;
    const at = (k: number, done: Outcome | null = null): RunView => ({
      i,
      j,
      line: r.trace[k]!.line,
      head: r.trace[k]!.head,
      step: k,
      done,
    });
    const runVars = (k: number) => {
      const c = r.trace[Math.min(k, r.trace.length - 1)]!;
      return vars(s, {
        step: k,
        line: c.line,
        cell: c.head,
        symbol: symbolAt(input, c.head),
        seen: Math.min(k + 1, r.trace.length),
      });
    };
    s = { ...s, run: { ...at(0), step: 0 } };
    yield {
      state: s,
      marks: [mark(cellId(i, j), 'active'), mark('ln-0', 'active')],
      say: `Run ${M(i)} on ${desc(j)} = ${input}. Start on line 1, with the head on cell 0 (${symbolAt(input, 0)}). A configuration is the line and the head's cell: the program never writes, so nothing else changes.`,
      lines: ['run.sig', 'run.init'],
      vars: runVars(0),
      level: 2,
    } satisfies HStep;
    // Every line run, except a halting one, which ends the run below.
    const last = r.outcome === 'loop' || r.off ? r.trace.length - 1 : r.steps - 1;
    for (let k = 0; k < last; k++) {
      const c = r.trace[k]!;
      const next = r.trace[k + 1]!;
      const ins = prog[c.line - 1]!;
      s = { ...s, run: { i, j, line: c.line, head: next.head, step: k + 1, done: null } };
      const moves = ins.op === 'right' || ins.op === 'left';
      yield {
        state: s,
        marks: [mark(`ln-${c.line - 1}`, 'active'), mark(`tape-${next.head}`, 'active')],
        say: `Step ${k + 1}: line ${c.line}, ${instrText(ins)}: ${effect(i, j, c.line, c.head, next.head)}.`,
        lines: ['run.check', 'run.add', 'run.exec'],
        vars: runVars(k + 1),
        level: moves ? 2 : 3,
      } satisfies HStep;
    }
    s = { ...reveal(s, i, j), run: endOf(i, j) };
    const end = s.run!;
    let say: string;
    let lines: string[];
    if (r.outcome === 'loop') {
      say = `Before step ${r.again}, ${M(i)} is on line ${end.line} with the head on cell ${end.head} again, just as before step ${r.first}. It never writes, so everything from here repeats: ${M(i)} loops on ${desc(j)}. A cap of ${CAP} steps would also have stopped it, but only the repeat proves it never halts.`;
      lines = ['run.check'];
    } else if (r.off) {
      say = `After line ${prog.length} there is nothing left to run, so ${M(i)} stops and rejects ${desc(j)} after ${stepsText(r)}.`;
      lines = ['run.halt'];
    } else if (r.outcome === 'unknown') {
      say = `${M(i)} is still running after ${CAP} steps, and no configuration has come back. The cap gives no answer.`;
      lines = ['run.cap'];
    } else {
      const ins = prog[end.line - 1]!;
      say = `Step ${r.steps}: line ${end.line}, ${instrText(ins)}. ${M(i)} ${r.outcome}s ${desc(j)} after ${stepsText(r)}.`;
      lines = ['run.halt'];
    }
    yield {
      state: s,
      marks: [mark(cellId(i, j), 'found'), mark(`ln-${end.line - 1}`, 'active')],
      say,
      lines,
      vars: runVars(r.trace.length - 1),
      level: 1,
    } satisfies HStep;
    return s;
  },
};

/** The answer the reduction's machine gives for one cell, and why. */
function reduceSay(i: number, j: number, framing: Framing): string {
  const r = cell(i, j);
  if (framing === 'halt') {
    const p = primeCell(i, j).outcome;
    return p === 'accept'
      ? `${M(i)}′ accepts ${desc(j)}, because ${M(i)} halts on it (it ${r.outcome}s), so S accepts and R says ${M(i)} halts.`
      : `${M(i)}′ loops on ${desc(j)}, just like ${M(i)}, so S rejects and R says ${M(i)} loops.`;
  }
  if (r.outcome === 'loop')
    return `${M(i)} on ${desc(j)}: R says it loops, so S rejects without running it.`;
  return `${M(i)} on ${desc(j)}: R says it halts, so S runs it to the end. It ${r.outcome}s, so S ${r.outcome}s.`;
}

const reduce: Op = {
  label: 'Reduce',
  arity: 0,
  *run(s0) {
    let s: S = { ...clearOverlay(s0) };
    const n = s.n;
    const intro =
      s.framing === 'halt'
        ? 'The other way round: suppose S decides A_TM. Then R decides HALT: on ⟨M, w⟩, make M′, which is M with every reject changed to accept, and ask S whether M′ accepts w. M′ accepts exactly when M halts.'
        : 'Sipser gets HALT from A_TM. Suppose R decides HALT. Then S decides A_TM: on ⟨M, w⟩, ask R whether M halts on w. If not, reject. If it does, run M on w, which is now safe, and answer as M does.';
    yield {
      state: s,
      marks: [],
      say: intro,
      lines: ['red.sig'],
      vars: vars(s),
      level: 2,
    } satisfies HStep;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        const reduced = s.reduced.map((row) => [...row]);
        reduced[i]![j] = true;
        s = { ...reveal(s, i, j), reduced };
        const o = cell(i, j).outcome;
        const lines =
          s.framing === 'halt' ? ['red.prime', 'red.ask'] : [o === 'loop' ? 'red.no' : 'red.yes'];
        yield {
          state: s,
          marks: [mark(cellId(i, j), 'active')],
          say: reduceSay(i, j, s.framing),
          lines,
          vars: vars(s, { cell: `${M(i)} on ${desc(j)}` }),
          level: j === n - 1 ? 2 : 3,
        } satisfies HStep;
      }
    const say =
      s.framing === 'halt'
        ? 'R answered every cell, and it only ever asked S. So if S decided A_TM, R would decide HALT. Nothing decides HALT (that is the diagonal argument in this framing), so nothing decides A_TM either.'
        : 'S answered every cell, and it only ran programs that halt, so S always halts and is always right: S decides A_TM. Nothing decides A_TM (that is the diagonal argument), so R cannot exist: HALT is undecidable too.';
    yield {
      state: s,
      marks: [],
      say,
      lines: ['red.end'],
      vars: vars(s),
      level: 1,
    } satisfies HStep;
    return s;
  },
};

export const ops = { build, diagonalize, contradict, run: runOp, reduce };

// ---------------------------------------------------------------------------------------------
// Pseudocode

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: HaltSettings): PseudoBlock[] {
  const halt = settings.framing === 'halt';
  const blocks: PseudoBlock[] = [
    {
      op: 'build',
      lines: [
        L('build.sig', 0, 'build()', 'To build the table:'),
        L('build.for', 1, 'for i, j = 1 to n', 'for every program Mi and every description ⟨Mj⟩,'),
        L('build.run', 2, 'T[i][j] = run(Mi, ⟨Mj⟩)', 'run Mi on ⟨Mj⟩ and write down what it does:'),
        L(
          'build.halt',
          3,
          halt ? 'halts' : 'accepts or rejects',
          halt ? 'it halts,' : 'it accepts or rejects,',
        ),
        L(
          'build.loop',
          3,
          'or repeats a configuration: ∞',
          'or it comes back to where it was: it loops.',
        ),
      ],
    },
    {
      op: 'diagonalize',
      lines: halt
        ? [
            L('diag.def', 0, 'D(⟨M⟩):', 'D, on input ⟨M⟩:'),
            L(
              'diag.yes',
              1,
              'if H says M halts on ⟨M⟩: loop forever',
              'if M halts on its own description, D loops forever;',
            ),
            L('diag.no', 1, 'else: halt', 'if M loops on it, D halts.'),
            L('diag.sig', 0, 'diagonalize()', 'To build D’s row:'),
            L('diag.for', 1, 'for i = 1 to n', 'go down the diagonal;'),
            L(
              'diag.set',
              2,
              'D[i] = ∞ if T[i][i] halts, else halt',
              'D’s entry is the opposite of what Mi does on ⟨Mi⟩.',
            ),
            L(
              'diag.differ',
              1,
              'D ≠ Mi in column i, for every i',
              'So D’s row differs from every row.',
            ),
          ]
        : [
            L(
              'diag.def',
              0,
              'D(⟨M⟩): run H on ⟨M, ⟨M⟩⟩',
              'D, on input ⟨M⟩, asks H whether M accepts its own description:',
            ),
            L('diag.yes', 1, 'if H accepts: reject', 'if it does, D rejects;'),
            L('diag.no', 1, 'if H rejects: accept', 'if it does not, D accepts.'),
            L('diag.sig', 0, 'diagonalize()', 'To build D’s row:'),
            L('diag.for', 1, 'for i = 1 to n', 'go down the diagonal;'),
            L(
              'diag.set',
              2,
              'D[i] = rej if T[i][i] = acc, else acc',
              'D’s entry is the opposite of whether Mi accepts ⟨Mi⟩.',
            ),
            L(
              'diag.differ',
              1,
              'D ≠ Mi in column i, for every i',
              'So D’s row differs from every row.',
            ),
          ],
    },
    {
      op: 'contradict',
      lines: halt
        ? [
            L('dd.sig', 0, 'D on ⟨D⟩', 'Now give D its own description.'),
            L(
              'dd.exists',
              1,
              'H exists ⇒ D is a TM, with a description ⟨D⟩',
              'If H exists, D is a Turing machine too.',
            ),
            L(
              'dd.yes',
              1,
              'D halts on ⟨D⟩ ⇒ H says halts ⇒ D loops ✗',
              'If D halts on ⟨D⟩, then it loops.',
            ),
            L(
              'dd.no',
              1,
              'D loops on ⟨D⟩ ⇒ H says loops ⇒ D halts ✗',
              'If D loops on ⟨D⟩, then it halts.',
            ),
            L('dd.end', 1, 'so no TM decides HALT', 'Both are impossible, so H cannot exist.'),
          ]
        : [
            L('dd.sig', 0, 'D on ⟨D⟩', 'Now give D its own description.'),
            L(
              'dd.exists',
              1,
              'H exists ⇒ D is a TM, with a description ⟨D⟩',
              'If H exists, D is a Turing machine too.',
            ),
            L(
              'dd.yes',
              1,
              'D accepts ⟨D⟩ ⇒ H accepts ⇒ D rejects ✗',
              'If D accepts ⟨D⟩, then it rejects ⟨D⟩.',
            ),
            L(
              'dd.no',
              1,
              'D rejects ⟨D⟩ ⇒ H rejects ⇒ D accepts ✗',
              'If D does not, then it accepts ⟨D⟩.',
            ),
            L('dd.end', 1, 'so no TM decides A_TM', 'Both are impossible, so H cannot exist.'),
          ],
    },
    {
      op: 'run',
      lines: [
        L('run.sig', 0, 'run(M, w)', 'To run program M on input w:'),
        L(
          'run.init',
          1,
          'line = 1; head = 0; seen = ∅',
          'start on line 1, with the head on the first symbol.',
        ),
        L('run.for', 1, `for step = 1 to ${CAP}`, 'Then, one line at a time:'),
        L(
          'run.check',
          2,
          'if (line, head) ∈ seen: return ∞',
          'if it has been on this line with the head here before, it loops forever;',
        ),
        L('run.add', 2, 'seen = seen ∪ {(line, head)}', 'remember where it is;'),
        L(
          'run.halt',
          2,
          'if line is accept or reject: return it',
          'a line that accepts or rejects ends the run;',
        ),
        L(
          'run.exec',
          2,
          'move the head, or jump, as the line says',
          'any other line moves the head or jumps.',
        ),
        L('run.cap', 1, 'return no answer', `After ${CAP} steps, give up without an answer.`),
      ],
    },
    {
      op: 'reduce',
      lines: halt
        ? [
            L('red.sig', 0, 'R(⟨M, w⟩), with S deciding A_TM', 'Suppose S decides A_TM. Build R:'),
            L(
              'red.prime',
              1,
              'M′ = M with every reject changed to accept',
              'make M′, which accepts wherever M halts;',
            ),
            L('red.ask', 1, 'return S(⟨M′, w⟩)', 'ask S whether M′ accepts w.'),
            L(
              'red.end',
              1,
              'R decides HALT: impossible, so no S',
              'R would decide HALT, so S cannot exist.',
            ),
          ]
        : [
            L('red.sig', 0, 'S(⟨M, w⟩), with R deciding HALT', 'Suppose R decides HALT. Build S:'),
            L(
              'red.no',
              1,
              'if R rejects ⟨M, w⟩: reject',
              'if M loops on w, reject without running it;',
            ),
            L(
              'red.yes',
              1,
              'else run M on w and answer as M does',
              'otherwise run M on w, which halts, and give its answer.',
            ),
            L(
              'red.end',
              1,
              'S decides A_TM: impossible, so no R',
              'S would decide A_TM, so R cannot exist.',
            ),
          ],
    },
  ];
  return blocks;
}

// ---------------------------------------------------------------------------------------------
// Start and summary

export function initialSay(state: S, settings: HaltSettings): string {
  const n = state.n;
  const what =
    settings.framing === 'halt'
      ? 'whether Mi halts or loops when it reads ⟨Mj⟩'
      : 'whether Mi accepts, rejects or loops when it reads ⟨Mj⟩';
  return `A row for each toy program ${M(0)} to ${M(n - 1)}, and a column for each description ${desc(0)} to ${desc(n - 1)}. Cell (i, j) will say ${what}. Build table runs them all; Diagonalize fills in only what D needs.`;
}

export function initialVars(state: S): Record<string, Scalar> {
  return vars(state);
}

export function describe(state: S, settings?: HaltSettings): string {
  const framing = settings?.framing ?? state.framing;
  const n = state.n;
  const rows: string[] = [];
  for (let i = 0; i < n; i++) {
    const cells = Array.from({ length: n }, (_, j) => {
      if (!state.shown[i]![j]) return 'not run';
      return state.reduced[i]![j]
        ? `${reducedLabel(i, j, framing)} by reduction`
        : cellLabel(cell(i, j).outcome, framing);
    });
    rows.push(`${M(i)}: ${cells.join(', ')}`);
  }
  const d = state.d.some(Boolean) ? ` D's row: ${dRowText(state)}.` : '';
  const dd =
    state.dd === 'done'
      ? ' D on ⟨D⟩: impossible either way.'
      : state.dd !== 'none'
        ? ' D on ⟨D⟩: in question.'
        : '';
  return `Table of ${n} toy programs against their descriptions, ${filled(state)} of ${n * n} cells run. ${rows.join('. ')}.${d}${dd}`;
}

/** The reduction machine's answer for a cell: S's accept or reject. */
export function reducedLabel(i: number, j: number, framing: Framing): string {
  if (framing === 'halt') return primeCell(i, j).outcome === 'accept' ? 'acc' : 'rej';
  return cell(i, j).outcome === 'accept' ? 'acc' : 'rej';
}
