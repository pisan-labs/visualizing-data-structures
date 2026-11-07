/**
 * Regex engines: one NFA (Thompson's construction), two ways to run it.
 *
 * Operations
 *   match "R ; w" (or just "w", to keep R): the backtracker in detail, then the NFA simulation,
 *         then both counts side by side. The `engine` setting shows one engine only; the other
 *         still runs, silently, so the last step can compare them.
 *   grow  "R ; u" (or just "u"): both engines on u, uu, uuu, ... up to MAX_WORD symbols, one row
 *         of the chart per word, stopping when the backtracker passes the cap.
 *   load  "R" or "R ; w": the expression's NFA (and the word on the tape), without a run.
 *
 * Steps of a match. Every visit of the backtracker is a step (level 3); its dead ends, where it
 * backs up, are level 2, so the usual pace shows one failed path per step. After DETAIL visits
 * the page skips ahead, stopping each time the step count doubles. The simulation shows one
 * step per symbol read.
 */
import type { Mark, MarkRole, OpSpec, PseudoBlock, Scalar, Step } from '../../engine/types';
import { moveId, stateId } from '../../layouts/automaton';
import { EPS, setName, setText, SYMBOL, type Automaton, type Move } from '../_automata/automaton';
import { plural, words } from '../_automata/page';
import { readRegex, regexSize } from '../_automata/regex';
import { construct, type Frag } from '../regex-to-nfa/construct';
import {
  Backtracker,
  backtrack,
  CAP,
  machine,
  simulate,
  type BtResult,
  type Choice,
  type Machine,
  type Order,
  type Verdict,
  type Visit,
} from './engines';

export type Engine = 'both' | 'backtrack' | 'nfa';

export interface EngSettings {
  [key: string]: Scalar;
  /** Which engine a match shows step by step. */
  engine: Engine;
  /** Which way the backtracker tries a star (or + or ?) first. */
  order: Order;
}

export const defaults: EngSettings = { engine: 'both', order: 'greedy' };

/** The longest word, so the tape stays readable on a phone. */
export const MAX_WORD = 16;
/** The most symbols and operators in an expression: an NFA of at most 24 states. */
export const MAX_M = 12;
/** Visits of the backtracker shown one by one; after that the page skips ahead. */
export const DETAIL = 150;
/** Choices the stack panel shows, from the top. */
export const STACK_SHOWN = 7;

export const DEFAULT_REGEX = '(a|a)*b';

/** The backtracker as drawn: where it is, the top of its stack, its counts. */
export interface BtView {
  /** The state it is visiting. */
  q: string;
  /** Symbols read on this path. */
  at: number;
  /** The top of the stack of choices, bottom first: at most STACK_SHOWN of them. */
  stack: Choice[];
  /** Choices on the stack in all. */
  depth: number;
  steps: number;
  backtracks: number;
  result: BtResult | null;
}

/** The NFA simulation as drawn. */
export interface SimView {
  read: number;
  /** The live states, in name order. */
  set: string[];
  steps: number;
  /** The most states live at once so far. */
  widest: number;
  result: Verdict | null;
}

export interface GrowRow {
  n: number;
  bt: number;
  btResult: BtResult;
  nfa: number;
  nfaResult: Verdict;
}

export interface Growth {
  /** The word repeated. */
  unit: string;
  /** The largest n tried: as many copies of the unit as fit in MAX_WORD. */
  limit: number;
  rows: GrowRow[];
}

export type Mode = 'idle' | 'match' | 'grow';
/** Which engine a match step shows: the backtracker, the simulation, or both at the end. */
export type Phase = 'bt' | 'nfa' | 'done';

export interface EngState {
  /** The expression as shown: "eps" read as ε, spaces removed. */
  text: string;
  /** Symbols and operators in the expression. */
  m: number;
  nfa: Automaton;
  /** Thompson's pieces, in build order (for the drawing and the order of choices). */
  frags: Frag[];
  /** The word on the tape. */
  word: string;
  mode: Mode;
  phase: Phase | null;
  bt: BtView | null;
  sim: SimView | null;
  growth: Growth | null;
}

export interface EngExtra {
  /** Arrows just followed. */
  used?: Move[];
}

type S = EngState;
type X = EngExtra;
type EngStep = Step<S, X>;
type Op = OpSpec<S, EngSettings, X>;

const mark = (id: string, role: MarkRole): Mark => ({ id, role });

/** 100000 -> "100,000". */
export const fmt = (n: number): string => n.toLocaleString('en-US');

export const wordText = (w: string): string => w || EPS;

// ---------------------------------------------------------------------------------------------
// Input

/** An expression this page takes, or why not. */
export function readExpression(raw: string) {
  const p = readRegex(raw);
  if (p instanceof Error) return p;
  const m = regexSize(p.tree.r);
  if (m > MAX_M)
    return new Error(
      `${p.text} has ${m} symbols and operators; keep it to ${MAX_M} or fewer, so its NFA (2 states for each) fits on the screen.`,
    );
  return p;
}

/** A word: letters and digits, or ε (also eps, or nothing) for the empty word. */
export function readWord(raw: string): string | Error {
  const w = raw.replace(/\s+/g, '');
  if (w === '' || w === EPS || w === 'eps') return '';
  const bad = [...w].find((c) => !SYMBOL.test(c));
  if (bad)
    return new Error(
      /[|*+?()∅]/.test(bad)
        ? `"${w}" looks like an expression. Write the expression first, then a semicolon and the word: ${DEFAULT_REGEX} ; aaaa.`
        : `"${bad}" is not a symbol. A word is letters and digits, or ε (eps) for the empty word.`,
    );
  if (w.length > MAX_WORD) return new Error(`Keep the word to ${MAX_WORD} symbols or fewer.`);
  return w;
}

export interface Call {
  /** The new expression, or null to keep the one loaded. */
  regex: string | null;
  /** The word, or null to keep the one on the tape. */
  word: string | null;
}

/**
 * What an operation was given: "R ; w", or one part alone. Load reads a lone part as the
 * expression; Match and Grow read it as the word.
 */
export function readCall(raw: string, op: 'match' | 'grow' | 'load'): Call | Error {
  const t = raw.trim();
  const parts = t.split(';');
  if (parts.length > 2)
    return new Error(
      `Use one semicolon, between the expression and the word, as in ${DEFAULT_REGEX} ; aaaa.`,
    );
  if (parts.length === 2 || op === 'load') {
    const [r, w = ''] = parts;
    const p = readExpression(r!);
    if (p instanceof Error) return p;
    const word = parts.length === 2 ? readWord(w) : null;
    if (word instanceof Error) return word;
    return { regex: p.text, word };
  }
  const word = readWord(t);
  if (word instanceof Error) {
    if (!(readExpression(t) instanceof Error))
      return new Error(
        `"${t}" is an expression with no word. Write the word after a semicolon: ${t} ; ${op === 'grow' ? 'a' : 'aaaa'}.`,
      );
    return word;
  }
  return { regex: null, word };
}

/** The input box: anything readCall can read for some button. */
export function parseInput(token: string): string | Error {
  const t = token.trim();
  if (!t)
    return new Error(
      `Type an expression and a word, such as ${DEFAULT_REGEX} ; aaaa, or just a word to keep the expression.`,
    );
  const asWord = readCall(t, 'match');
  if (!(asWord instanceof Error)) return t;
  const asRegex = readCall(t, 'load');
  if (!(asRegex instanceof Error)) return t;
  // Without a semicolon, say what is wrong with it as an expression if it looks like one.
  return t.includes(';') || /[|*+?()∅]/.test(t) ? asRegex : asWord;
}

// ---------------------------------------------------------------------------------------------
// States

export function loadState(text: string, word = ''): S | Error {
  const p = readExpression(text);
  if (p instanceof Error) return p;
  const { nfa, frags } = construct(p, 'thompson');
  return {
    text: p.text,
    m: regexSize(p.tree.r),
    nfa,
    frags,
    word,
    mode: 'idle',
    phase: null,
    bt: null,
    sim: null,
    growth: null,
  };
}

export function init(): S {
  return loadState(DEFAULT_REGEX, 'aaaa') as S;
}

export const machineOf = (s: S, settings: EngSettings): Machine =>
  machine(s.nfa, s.frags, settings.order);

const top = (stack: Choice[]) => stack.slice(-STACK_SHOWN);

const btView = (b: Backtracker, stack: Choice[], q = b.q, at = b.at): BtView => ({
  q,
  at,
  stack: top(stack),
  depth: stack.length,
  steps: b.steps,
  backtracks: b.backtracks,
  result: b.result,
});

// ---------------------------------------------------------------------------------------------
// Readouts

function baseVars(s: S): Record<string, Scalar> {
  return { R: s.text, m: s.m, '|Q|': s.nfa.states.length, w: wordText(s.word), n: s.word.length };
}

export function stateVars(s: S): Record<string, Scalar> {
  const v = baseVars(s);
  if (s.mode === 'grow' && s.growth) {
    const last = s.growth.rows.at(-1);
    return {
      R: s.text,
      u: s.growth.unit,
      n: last?.n ?? 0,
      'backtracking steps': last ? fmt(last.bt) : '-',
      'NFA steps': last ? fmt(last.nfa) : '-',
    };
  }
  if (s.bt)
    Object.assign(v, {
      'backtracking steps': fmt(s.bt.steps),
      backtracks: s.bt.backtracks,
      stack: s.bt.depth,
    });
  if (s.sim) Object.assign(v, { 'NFA steps': fmt(s.sim.steps), '|S|': s.sim.set.length });
  return v;
}

export function initialSay(s: S): string {
  return `The NFA for ${s.text}, from Thompson's construction: ${plural(s.nfa.states.length, 'state')}. Press Match to run ${wordText(s.word)} through it two ways: first the backtracker, one path at a time, then the NFA simulation, every path at once. Press Grow to watch the step counts as the word gets longer.`;
}

export function initialVars(s: S): Record<string, Scalar> {
  return stateVars(s);
}

// ---------------------------------------------------------------------------------------------
// Narration

const at = (i: number, n: number) =>
  i === 0 ? 'nothing read' : i === n ? 'all of w read' : `${plural(i, 'symbol')} read`;

const choiceText = (c: Choice) => `(${c.q}, ${c.at})`;

function visitSay(k: number, q: string, i: number, w: string, v: Visit, b: Backtracker): string {
  const head = `Step ${fmt(k)}: at ${q}, ${at(i, w.length)}.`;
  switch (v.kind) {
    case 'accept':
      return `${head} This is the accept state and all of ${wordText(w)} is read: a match. The backtracker accepts after ${plural(b.steps, 'step')} and ${plural(b.backtracks, 'backtrack')}.`;
    case 'read':
      return `${head} The arrow ${v.c} matches the next symbol: read it and go to ${v.to}.`;
    case 'eps':
      return `${head} Follow the ε-arrow to ${v.to}.`;
    case 'choice':
      return `${head} Two ε-arrows leave it. Try ${v.to} first and push (${v.later}, ${i}) on the stack, to come back to if this path fails.`;
    case 'stopped':
      return `${head} That is ${fmt(b.cap)} steps without an answer, so the page stops the backtracker here. A real engine has no such limit: it would go on, and the request would hang.`;
    case 'dead': {
      const why = (() => {
        switch (v.why.kind) {
          case 'mismatch':
            return `Its arrow needs ${v.why.want}, but the next symbol is ${v.why.got}: a dead end.`;
          case 'end':
            return `Its arrow needs ${v.why.want}, but nothing is left to read: a dead end.`;
          case 'early':
            return `This is the accept state, but only ${i} of the ${w.length} symbols are read: the path matches a prefix, not all of w.`;
          case 'loop':
            return `Its only way on goes back to ${words(v.why.to)}, already passed at this position: an empty loop, so it is cut off.`;
          case 'stuck':
            return `No arrow leaves it: a dead end.`;
        }
      })();
      return v.back
        ? `${head} ${why} Back up: pop ${choiceText(v.back)} off the stack and go on from ${v.back.q} with ${at(v.back.at, w.length)}.`
        : `${head} ${why} The stack is empty, so every path has failed: the backtracker rejects ${wordText(w)} after ${plural(b.steps, 'step')} and ${plural(b.backtracks, 'backtrack')}.`;
    }
  }
}

function btEndSay(b: Backtracker, w: string): string {
  const counts = `${fmt(b.steps)} steps and ${fmt(b.backtracks)} backtracks`;
  if (b.result === 'accept')
    return `The backtracker reaches the accept state with all of ${wordText(w)} read: it accepts, after ${counts}.`;
  if (b.result === 'reject')
    return `The stack is empty: every path has failed, so the backtracker rejects ${wordText(w)} after ${counts}.`;
  return `Step ${fmt(b.cap)}: still no answer, so the page stops the backtracker. It has made ${counts}, and a real engine would go on.`;
}

const verdictWord = (v: BtResult) =>
  v === 'accept' ? 'accepts' : v === 'reject' ? 'rejects' : 'gave up';

function compareSay(s: S, bt: BtView, sim: SimView): string {
  const w = wordText(s.word);
  if (bt.result === 'stopped')
    return `The backtracker gave up after ${fmt(bt.steps)} steps without an answer; the NFA simulation ${verdictWord(sim.result!)} ${w} in ${fmt(sim.steps)}. The simulation never needs more than ${s.nfa.states.length} steps per position: one for each state.`;
  const both = `Both ${bt.result === 'accept' ? 'accept' : 'reject'} ${w}: the backtracker in ${plural(bt.steps, 'step')}, the NFA simulation in ${plural(sim.steps, 'step')}.`;
  const ratio = bt.steps / sim.steps;
  const times = (r: number) => (r < 10 ? r.toFixed(1) : fmt(Math.round(r)));
  if (ratio >= 1.5)
    return `${both} The backtracker did ${times(ratio)} times the work: it visited some states at the same position again and again, once for each path that leads there.`;
  if (ratio <= 1 / 1.5)
    return `${both} Here the backtracker did less work: ${bt.result === 'accept' ? 'one of its first paths matched' : 'few paths were open to it'}, while the simulation carried every live state along.`;
  return `${both} About the same work: this expression leaves few ways to try.`;
}

// ---------------------------------------------------------------------------------------------
// Operations

/** One step that changes nothing and says why. */
function refuse(s: S, why: string, line: string): EngStep {
  return { state: s, marks: [], say: why, lines: [line], vars: stateVars(s), level: 1 };
}

/** The state an operation starts from: the new expression (if any) and the word. */
function start(s: S, call: Call): S | Error {
  const base = call.regex === null ? s : loadState(call.regex);
  if (base instanceof Error) return base;
  const word = call.word ?? s.word;
  return { ...base, word, mode: 'idle', phase: null, bt: null, sim: null, growth: null };
}

/** Marks for one visit of the backtracker. */
function visitMarks(q: string, i: number, v: Visit, w: string): Mark[] {
  const out: Mark[] = [];
  const role: MarkRole =
    v.kind === 'dead'
      ? 'error'
      : v.kind === 'accept'
        ? 'found'
        : v.kind === 'stopped'
          ? 'compare'
          : 'active';
  out.push(mark(stateId(q), role));
  if (v.kind === 'read' || v.kind === 'eps' || v.kind === 'choice')
    out.push(mark(moveId(q, v.to), 'active'));
  if (v.kind === 'read') out.push(mark(`tape-${i}`, 'active'));
  if (v.kind === 'dead' && v.why.kind === 'mismatch' && i < w.length)
    out.push(mark(`tape-${i}`, 'error'));
  return out;
}

const btLines = (v: Visit): string[] => {
  switch (v.kind) {
    case 'accept':
      return ['bt.visit', 'bt.accept'];
    case 'stopped':
      return ['bt.visit', 'bt.cap'];
    case 'choice':
      return ['bt.choice'];
    case 'eps':
      return ['bt.eps'];
    case 'read':
      return ['bt.read'];
    case 'dead':
      return v.back ? ['bt.dead', 'bt.pop'] : ['bt.dead', 'bt.reject'];
  }
};

/** The backtracker, step by step. Returns its last view. */
function* backtrackSteps(st: S, m: Machine): Generator<EngStep, BtView, void> {
  const w = st.word;
  const b = new Backtracker(m, w);
  let view = btView(b, []);
  let state: S = { ...st, phase: 'bt', bt: view };
  yield {
    state,
    marks: [mark(stateId(m.nfa.start), 'active')],
    say: `First the backtracker. It follows one path at a time from ${m.nfa.start}, the start state, with nothing read and no choices on its stack. Each visit to a state is one step.`,
    lines: ['bt.sig', 'bt.init'],
    vars: stateVars(state),
    level: 2,
  };
  // The first power of two past the steps shown one by one.
  let snap = 2 ** Math.ceil(Math.log2(DETAIL + 1));
  let skipped = false;
  while (!b.result) {
    const q = b.q;
    const i = b.at;
    const before = b.choices();
    const v = b.visit();
    const k = b.steps;
    if (k <= DETAIL) {
      const pushed = v.kind === 'choice';
      const stack = pushed ? b.choices() : before;
      view = btView(b, stack, q, i);
      state = { ...state, bt: view };
      const marks = visitMarks(q, i, v, w);
      if (stack.length) {
        const topId = `stk-${stack.length - 1}`;
        if (pushed) marks.push(mark(topId, 'new'));
        else if (v.kind === 'dead' && v.back) marks.push(mark(topId, 'remove'));
      }
      yield {
        state,
        marks,
        say: visitSay(k, q, i, w, v, b),
        lines: btLines(v),
        vars: stateVars(state),
        level: v.kind === 'read' || v.kind === 'eps' || v.kind === 'choice' ? 3 : 2,
      };
      continue;
    }
    if (b.result || k === snap) {
      view = btView(b, b.choices());
      state = { ...state, bt: view };
      const lead = skipped
        ? ''
        : `From here the page skips ahead, stopping each time the step count doubles. `;
      skipped = true;
      if (k === snap) snap *= 2;
      yield {
        state,
        marks: [mark(stateId(b.q), b.result === 'accept' ? 'found' : 'active')],
        say: b.result
          ? `${lead}${btEndSay(b, w)}`
          : `${lead}Step ${fmt(k)}: ${plural(b.backtracks, 'backtrack')} so far. The backtracker is at ${b.q} with ${at(b.at, w.length)}, and ${plural(b.depth, 'choice')} wait on the stack.`,
        lines: b.result
          ? b.result === 'accept'
            ? ['bt.accept']
            : b.result === 'reject'
              ? ['bt.reject']
              : ['bt.cap']
          : ['bt.pop', 'bt.visit'],
        vars: stateVars(state),
        level: 2,
      };
    }
  }
  return view;
}

/** The final picture of the backtracker, when it ran without being shown. */
function quietBacktrack(m: Machine, w: string): BtView {
  const b = new Backtracker(m, w).finish();
  return btView(b, b.choices());
}

/** The NFA simulation, one step per symbol. Returns its last view. */
function* simulateSteps(st: S, m: Machine): Generator<EngStep, SimView, void> {
  const w = st.word;
  const run = simulate(m, w);
  const a = m.nfa;
  let widest = 0;
  let view: SimView | null = null;
  for (const row of run.rows) {
    widest = Math.max(widest, row.set.length);
    const last = row === run.rows.at(-1);
    view = { read: row.read, set: row.set, steps: row.steps, widest, result: null };
    const state: S = { ...st, phase: 'nfa', sim: view };
    if (row.read === 0) {
      yield {
        state,
        marks: [],
        say: `Now the NFA simulation. It starts with S = ε-closure({${a.start}}) = ${setText(row.set)}: every state the start reaches by ε-arrows, ${plural(row.set.length, 'state')}, so ${plural(row.steps, 'step')}.${w ? '' : ' The word is empty: there is nothing to read.'}`,
        lines: ['nfa.sig', 'nfa.start'],
        vars: stateVars(state),
        level: 2,
        extra: { used: a.moves.filter((mv) => mv.on === EPS && row.set.includes(mv.from)) },
      };
    } else {
      const c = w[row.read - 1]!;
      const where = `symbol ${row.read} of ${w.length}`;
      yield {
        state,
        marks: [mark(`tape-${row.read - 1}`, 'active')],
        say: row.set.length
          ? `Read ${c}, ${where}: every live state with an arrow labeled ${c} moves at once, then the ε-arrows are followed. S = ${setText(row.set)}: ${plural(row.set.length, 'state')}, ${plural(row.steps, 'step')} so far.`
          : `Read ${c}, ${where}: no live state has an arrow labeled ${c}, so S is empty. Every path has died; the simulation stops here, ${plural(row.steps, 'step')} in all.`,
        lines: row.set.length ? ['nfa.loop', 'nfa.step'] : ['nfa.loop', 'nfa.step', 'nfa.dead'],
        vars: stateVars(state),
        level: 2,
        extra: { used: row.used },
      };
    }
    if (last) {
      const good = row.set.filter((q) => a.accept.includes(q));
      view = { ...view, result: run.result };
      const end: S = { ...st, phase: 'nfa', sim: view };
      yield {
        state: end,
        marks: good.map((q) => mark(stateId(q), 'found')),
        say:
          run.result === 'accept'
            ? `${row.read === w.length ? `All of ${wordText(w)} is read` : 'Nothing is left to read'} and S contains ${words(good)}, the accept state: the simulation accepts, after ${plural(run.steps, 'step')}. It never held more than ${plural(widest, 'state')} at once.`
            : `${row.set.length ? `All of ${wordText(w)} is read, and no state of S is the accept state` : 'S is empty'}: the simulation rejects, after ${plural(run.steps, 'step')}. It never held more than ${plural(widest, 'state')} at once.`,
        lines: ['nfa.end'],
        vars: stateVars(end),
        level: 2,
      };
    }
  }
  return view!;
}

function quietSimulate(m: Machine, w: string): SimView {
  const r = simulate(m, w);
  const last = r.rows.at(-1)!;
  return { read: last.read, set: last.set, steps: r.steps, widest: r.widest, result: r.result };
}

const match: Op = {
  label: 'Match',
  arity: 1,
  *run(s, [arg], { settings }) {
    const call = readCall(String(arg ?? ''), 'match');
    const st = call instanceof Error ? call : start(s, call);
    if (st instanceof Error) {
      yield refuse(s, `Nothing matched. ${st.message}`, 'match.sig');
      return s;
    }
    const m = machineOf(st, settings);
    const w = wordText(st.word);
    const first: S = { ...st, mode: 'match' };
    const plan =
      settings.engine === 'both'
        ? 'First the backtracker, then the NFA simulation'
        : settings.engine === 'backtrack'
          ? 'The backtracker, step by step (the simulation runs too, out of sight)'
          : 'The NFA simulation, step by step (the backtracker runs too, out of sight)';
    yield {
      state: first,
      marks: [],
      say: `match(${st.text}, ${w}). ${plan}: both on this NFA, which Thompson's construction built from ${st.text}. Then their step counts, side by side.`,
      lines: ['match.sig'],
      vars: stateVars(first),
      level: 2,
    };
    let cur = first;
    let bt: BtView;
    if (settings.engine !== 'nfa') {
      bt = yield* backtrackSteps(cur, m);
      cur = { ...cur, bt };
    } else bt = quietBacktrack(m, st.word);
    let sim: SimView;
    if (settings.engine !== 'backtrack') {
      sim = yield* simulateSteps(cur, m);
      cur = { ...cur, sim };
    } else sim = quietSimulate(m, st.word);
    const end: S = { ...cur, phase: 'done', bt, sim };
    yield {
      state: end,
      marks: [],
      say: compareSay(end, bt, sim),
      lines: ['match.compare'],
      vars: stateVars(end),
      level: 1,
    };
    return end;
  },
};

/** How a list of counts grows, judged from its last three: by the same amount, by more, or by a factor. */
export type Shape = 'linear' | 'polynomial' | 'exponential';

export function growthShape(counts: readonly number[]): Shape | null {
  if (counts.length < 3) return null;
  const [a, b, c] = counts.slice(-3) as [number, number, number];
  const d0 = b - a;
  const d1 = c - b;
  if (d1 === d0) return d0 > 0 ? 'linear' : null;
  if (d0 < 0 || d1 < d0) return null;
  return d0 > 0 && d1 / d0 >= 1.3 ? 'exponential' : 'polynomial';
}

/** The last three counts are the same. */
const flat = (xs: readonly number[]) =>
  xs.length >= 3 && xs.at(-1) === xs.at(-2) && xs.at(-2) === xs.at(-3);

function growSummary(g: Growth, s: S): string {
  const rows = g.rows;
  const first = rows[0]!;
  const last = rows.at(-1)!;
  const stopped = last.btResult === 'stopped';
  const done = stopped ? rows.slice(0, -1) : rows;
  const shape = growthShape(done.map((r) => r.bt));
  const nfaCounts = rows.map((r) => r.nfa);
  const nfaShape = growthShape(nfaCounts);
  const how = flat(done.map((r) => r.bt))
    ? 'then stayed there: every longer word fails at the same place, so it costs no more'
    : shape === 'exponential'
      ? `multiplying by about ${(done.at(-1)!.bt / done.at(-2)!.bt).toFixed(1)} with each extra ${g.unit}: exponential`
      : shape === 'linear'
        ? `adding ${fmt(done.at(-1)!.bt - done.at(-2)!.bt)} with each extra ${g.unit}: linear`
        : shape === 'polynomial'
          ? `adding a little more with each extra ${g.unit}: polynomial, not exponential`
          : 'too few rows to tell';
  const lead = done.length
    ? `From n = ${first.n} to ${done.at(-1)!.n}, the backtracker's steps went from ${fmt(first.bt)} to ${fmt(done.at(-1)!.bt)}, ${how}.`
    : '';
  const cap = stopped
    ? ` At n = ${last.n} it passed ${fmt(CAP)} steps and the page stopped it.`
    : '';
  const nfaHow = flat(nfaCounts)
    ? `stayed at ${fmt(last.nfa)} steps`
    : `went from ${fmt(first.nfa)} to ${fmt(last.nfa)} steps${nfaShape === 'linear' ? `, adding ${fmt(last.nfa - rows.at(-2)!.nfa)} each time` : ''}`;
  const nfa = ` The NFA simulation ${nfaHow}: never more than ${s.nfa.states.length} per position, one for each state.`;
  return `${lead}${cap}${nfa}`.trim();
}

const grow: Op = {
  label: 'Grow',
  arity: 1,
  *run(s, [arg], { settings }) {
    const call = readCall(String(arg ?? ''), 'grow');
    const st = call instanceof Error ? call : start(s, call);
    if (st instanceof Error) {
      yield refuse(s, `Nothing grown. ${st.message}`, 'grow.sig');
      return s;
    }
    const u = st.word;
    if (!u) {
      yield refuse(
        s,
        `Nothing grown. Grow repeats a word, so it needs one: type ${st.text} ; a to try a, aa, aaa, and so on.`,
        'grow.sig',
      );
      return s;
    }
    const m = machineOf(st, settings);
    const limit = Math.floor(MAX_WORD / u.length);
    let g: Growth = { unit: u, limit, rows: [] };
    let state: S = { ...st, word: u, mode: 'grow', growth: g };
    yield {
      state,
      marks: [],
      say: `grow(${st.text}, ${u}): run both engines on ${u}, ${u.repeat(2)}, ${u.repeat(3)}, and so on, up to ${plural(limit, 'copy', 'copies')} of ${u}, and chart their steps. The page stops the backtracker after ${fmt(CAP)} steps.`,
      lines: ['grow.sig'],
      vars: stateVars(state),
      level: 2,
    };
    for (let n = 1; n <= limit; n++) {
      const w = u.repeat(n);
      const b = backtrack(m, w);
      const r = simulate(m, w);
      const row: GrowRow = {
        n,
        bt: b.steps,
        btResult: b.result,
        nfa: r.steps,
        nfaResult: r.result,
      };
      const prev = g.rows.at(-1);
      g = { ...g, rows: [...g.rows, row] };
      state = { ...state, word: w, growth: g };
      const btPart =
        b.result === 'stopped'
          ? `the backtracker passed ${fmt(CAP)} steps without an answer, so the page stops here`
          : `the backtracker ${verdictWord(b.result)} in ${plural(b.steps, 'step')}${prev ? ` (${(b.steps / prev.bt).toFixed(1)} times as many as for n = ${prev.n})` : ''}`;
      yield {
        state,
        marks: [
          mark(`ch-bt-${n}`, b.result === 'stopped' ? 'error' : 'new'),
          mark(`ch-nfa-${n}`, 'new'),
        ],
        say: `n = ${n}, w = ${w}: ${btPart}; the NFA simulation ${verdictWord(r.result)} in ${plural(r.steps, 'step')}${prev ? ` (${r.steps - prev.nfa >= 0 ? '+' : ''}${r.steps - prev.nfa})` : ''}.`,
        lines:
          b.result === 'stopped'
            ? ['grow.run', 'grow.row', 'grow.cap']
            : ['grow.loop', 'grow.run', 'grow.row'],
        vars: stateVars(state),
        level: 2,
      };
      if (b.result === 'stopped') break;
    }
    yield {
      state,
      marks: [],
      say: growSummary(g, state),
      lines: ['grow.end'],
      vars: stateVars(state),
      level: 1,
    };
    return state;
  },
};

const load: Op = {
  label: 'Load',
  arity: 1,
  *run(s, [arg]) {
    const call = readCall(String(arg ?? ''), 'load');
    const st = call instanceof Error ? call : start(s, call);
    if (st instanceof Error) {
      yield refuse(s, `Nothing loaded. ${st.message}`, 'load.sig');
      return s;
    }
    yield {
      state: st,
      marks: [mark('start', 'active')],
      say: `Loaded ${st.text}: Thompson's construction makes an NFA with ${plural(st.nfa.states.length, 'state')}, 2 for each of its ${plural(st.m, 'symbol and operator', 'symbols and operators')}. Press Match to run ${wordText(st.word)} through it, or Grow to chart the steps as the word gets longer.`,
      lines: ['load.sig', 'load.build'],
      vars: stateVars(st),
      level: 1,
    };
    return st;
  },
};

export const ops = { match, grow, load };

// ---------------------------------------------------------------------------------------------
// Pseudocode

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: EngSettings): PseudoBlock[] {
  const greedy = settings.order === 'greedy';
  const first = greedy ? 'into a star first' : 'around a star first';
  return [
    {
      op: 'match',
      lines: [
        L('match.sig', 0, 'match(R, w)', 'To match a word w against R:'),
        L('bt.sig', 1, 'backtrack(w):', 'First by backtracking, one path at a time:'),
        L('bt.init', 2, 'stack = [(q0, 0)]', 'Start at the start state with nothing read.'),
        L(
          'bt.pop',
          2,
          'while stack ≠ ∅: (q, i) = pop()',
          'Go on from the latest choice on the stack.',
        ),
        L('bt.visit', 3, 'steps = steps + 1', 'Each visit to a state is a step.'),
        L(
          'bt.accept',
          3,
          'if q ∈ F and i = |w|: accept',
          'At the accept state with all of w read: a match.',
        ),
        L(
          'bt.cap',
          3,
          `if steps = ${CAP}: give up`,
          `After ${fmt(CAP)} steps, stop without an answer.`,
        ),
        L(
          'bt.choice',
          3,
          `if two ε-arrows (${first}): push the second; q = the first`,
          greedy
            ? 'Two ways on: go into the star (or the left side of |) and keep the other way for later.'
            : 'Two ways on: go around the star (or the left side of |) and keep the other way for later.',
        ),
        L('bt.eps', 3, 'else if one ε-arrow q → r: q = r', 'One ε-arrow: follow it.'),
        L(
          'bt.read',
          3,
          'else if q –w[i]→ r: q, i = r, i + 1',
          'An arrow that matches the next symbol: read it.',
        ),
        L(
          'bt.dead',
          3,
          'else: back up (to the while)',
          'No way on: a dead end. Back up to the latest choice.',
        ),
        L('bt.reject', 2, 'reject', 'No choice is left: no path matches.'),
        L('nfa.sig', 1, 'simulate(w):', 'Then by simulating the NFA, every path at once:'),
        L(
          'nfa.start',
          2,
          'S = ε-closure({q0}); steps = |S|',
          'Start with every state the ε-arrows reach from the start. Each live state is a step.',
        ),
        L('nfa.loop', 2, 'for each symbol c of w:', 'Read w one symbol at a time.'),
        L(
          'nfa.step',
          3,
          'S = ε-closure(move(S, c)); steps += |S|',
          'Move every live state on c at once, then follow the ε-arrows.',
        ),
        L('nfa.dead', 3, 'if S = ∅: reject', 'No state is left: no path can match.'),
        L(
          'nfa.end',
          2,
          'accept if S ∩ F ≠ ∅, else reject',
          'Accept if the accept state is live at the end.',
        ),
        L(
          'match.compare',
          1,
          'compare the answers and the steps',
          'The answers always agree; the steps do not.',
        ),
      ],
    },
    {
      op: 'grow',
      lines: [
        L('grow.sig', 0, 'grow(R, u)', 'To see how the work grows with the word:'),
        L(
          'grow.loop',
          1,
          `for n = 1, 2, … while |uⁿ| ≤ ${MAX_WORD}:`,
          'Try u, then u twice, then three times, and so on.',
        ),
        L(
          'grow.run',
          2,
          'b = backtrack(uⁿ); s = simulate(uⁿ)',
          'Run both engines on u repeated n times.',
        ),
        L('grow.row', 2, 'chart (n, b.steps, s.steps)', 'Add both step counts to the chart.'),
        L(
          'grow.cap',
          2,
          'if b gave up: stop',
          `Once the backtracker passes ${fmt(CAP)} steps, stop.`,
        ),
        L('grow.end', 1, 'compare how the two counts grow', 'Compare how fast each count grows.'),
      ],
    },
    {
      op: 'load',
      lines: [
        L('load.sig', 0, 'load(R)', 'To load an expression R:'),
        L(
          'load.build',
          1,
          "NFA = Thompson's construction of R",
          'Build its NFA, with 2 states for each symbol and operator.',
        ),
      ],
    },
  ];
}

// ---------------------------------------------------------------------------------------------
// Screen readers

export function describe(s: S): string {
  const head = `R = ${s.text}: an NFA with ${plural(s.nfa.states.length, 'state')}, start ${s.nfa.start}, accept ${words(s.nfa.accept)}.`;
  const w = wordText(s.word);
  if (s.mode === 'grow' && s.growth) {
    const rows = s.growth.rows.map(
      (r) =>
        `n = ${r.n}: backtracking ${r.btResult === 'stopped' ? `gave up at ${fmt(r.bt)}` : fmt(r.bt)}, NFA ${fmt(r.nfa)}`,
    );
    return `${head} Steps as ${s.growth.unit} repeats: ${rows.length ? rows.join('; ') : 'none yet'}.`;
  }
  const parts = [`${head} Word ${w}.`];
  const bt = s.bt;
  if (bt)
    parts.push(
      bt.result
        ? `Backtracking: ${verdictWord(bt.result)} after ${plural(bt.steps, 'step')} and ${plural(bt.backtracks, 'backtrack')}.`
        : `Backtracking: at ${bt.q} with ${at(bt.at, s.word.length)}, ${plural(bt.depth, 'choice')} on the stack, ${plural(bt.steps, 'step')} so far.`,
    );
  const sim = s.sim;
  if (sim)
    parts.push(
      `NFA simulation: ${sim.result ? `${verdictWord(sim.result)} after` : `S = ${setName(sim.set)} after ${plural(sim.read, 'symbol')},`} ${plural(sim.steps, 'step')}.`,
    );
  return parts.join(' ');
}
