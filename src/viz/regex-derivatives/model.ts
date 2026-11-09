/**
 * Regular expression derivatives (Brzozowski). Load reads an expression; Derive works out d_c(r)
 * part by part, smallest parts first, each with its ν and the rule it uses; Match reads a word by
 * taking one derivative per symbol and checks ν at the end; Build DFA takes derivatives by every
 * symbol, breadth first, until no new expression turns up, and the expressions are the states.
 *
 * Each operation works out its whole result first and then shows it a row (or a state) at a time,
 * so the table keeps its size through the operation. The state keeps the expression and the last
 * operation's panel.
 */
import type { Mark, OpSpec, PseudoBlock, Scalar, Step, Value } from '../../engine/types';
import { stateId, moveId } from '../../layouts/automaton';
import { EPS, makeAutomaton, type Automaton, type Move } from '../_automata/automaton';
import {
  readRegex,
  regexSymbols,
  type Regex,
  type RegexTree,
  type UnionSign,
} from '../_automata/regex';
import {
  deriveRows,
  derive,
  key,
  nullable,
  regexSize,
  show,
  simplify,
  wordText,
  type NodeRow,
  type RuleId,
  type Similarity,
} from './derive';

export interface RdSettings {
  [key: string]: Scalar;
  similarity: Similarity;
  union: UnionSign;
}

export const defaults: RdSettings = { similarity: 'aci', union: '|' };

export const START_TEXT = '(a|b)*abb';

export interface DerivePanel {
  kind: 'derive';
  c: string;
  rows: NodeRow[];
  /** Rows worked out so far. */
  shown: number;
}

export interface MatchRow {
  /** The symbol just read ('' for the start row). */
  c: string;
  r: Regex;
  nu: boolean;
}

export interface MatchPanel {
  kind: 'match';
  word: string;
  rows: MatchRow[];
  shown: number;
  verdict?: 'accept' | 'reject';
}

export interface DfaState {
  name: string;
  r: Regex;
  nu: boolean;
}

export interface DfaPanel {
  kind: 'dfa';
  alphabet: string[];
  states: DfaState[];
  moves: Move[];
  /** States found and moves worked out so far. */
  found: number;
  done: number;
  /** The build stopped before it closed: too many states, or an expression too large. */
  stopped?: 'states' | 'size';
  finished: boolean;
}

export type Panel = DerivePanel | MatchPanel | DfaPanel;

export interface RdState {
  /** The expression as shown (ε for eps, spaces removed), and its tree. */
  text: string;
  tree: RegexTree;
  panel: Panel | null;
}

type S = RdState;
type Op = OpSpec<S, RdSettings, unknown>;
type RdStep = Step<S, unknown>;

export const MAX_STATES = 8;
/** Expressions larger than this (symbols and operators) stop the build. */
export const MAX_SIZE = 24;
export const MAX_WORD = 12;

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function readText(raw: string, union: UnionSign): { text: string; tree: RegexTree } | Error {
  return readRegex(raw, { union });
}

export function init(settings: RdSettings): S {
  const p = readText(
    settings.union === '+' ? START_TEXT.replace('|', '+') : START_TEXT,
    settings.union,
  ) as { text: string; tree: RegexTree };
  return { text: p.text, tree: p.tree, panel: null };
}

export function vars(s: S): Record<string, Scalar> {
  const p = s.panel;
  const base = { size: regexSize(s.tree.r) };
  if (!p) return base;
  if (p.kind === 'derive') return { ...base, c: p.c, parts: `${p.shown}/${p.rows.length}` };
  if (p.kind === 'match')
    return {
      ...base,
      read: Math.max(0, p.shown - 1),
      'size now': regexSize(p.rows[p.shown - 1]!.r),
    };
  return { ...base, states: p.found, moves: p.done };
}

/** A regex in narration, with the page's union sign. */
const rx = (r: Regex, u: UnionSign) => show(r, u);

export const rowId = (k: number) => `row-${k}-d`;
export const MIN_PREFIX = 'dfa-';

/** What a rule says, for the narration of a part. */
function ruleSay(row: NodeRow, rows: NodeRow[], c: string, u: UnionSign): string {
  const d = (r: Regex) => rx(r, u);
  const part = (r: Regex) => rows.find((x) => x.r === r)!;
  const r = row.r;
  switch (r.kind) {
    case 'empty':
    case 'eps':
      return `d_${c}(${row.text}) = ∅: it has no word that starts with ${c}.`;
    case 'sym':
      return r.c === c
        ? `d_${c}(${c}) = ε: reading ${c} leaves the empty word.`
        : `d_${c}(${r.c}) = ∅: ${r.c} is not ${c}.`;
    case 'union':
      return `A union: d_${c}(${row.text}) = d_${c}(${part(r.a).text}) ${u} d_${c}(${part(r.b).text}) = ${d(row.raw)}${simplified(row, u)}`;
    case 'concat':
      return nullable(r.a)
        ? `A concatenation whose first part can be empty, so ${c} may come off either part: d_${c}(${part(r.a).text})·${part(r.b).text} ${u} d_${c}(${part(r.b).text}) = ${d(row.raw)}${simplified(row, u)}`
        : `A concatenation whose first part cannot be empty, so ${c} comes off the first part: d_${c}(${part(r.a).text})·${part(r.b).text} = ${d(row.raw)}${simplified(row, u)}`;
    case 'star':
      return `A star: take ${c} off one copy and keep the star: d_${c}(${part(r.a).text})·${row.text} = ${d(row.raw)}${simplified(row, u)}`;
    case 'plus':
      return `One or more: take ${c} off the first copy, then any number: d_${c}(${part(r.a).text})·(${part(r.a).text})* = ${d(row.raw)}${simplified(row, u)}`;
    case 'opt':
      return `Optional: the empty choice has nothing to read, so d_${c}(${row.text}) = d_${c}(${part(r.a).text}) = ${d(row.d)}.`;
  }
}

function simplified(row: NodeRow, u: UnionSign): string {
  const a = rx(row.raw, u);
  const b = rx(row.d, u);
  return a === b ? '.' : `, which simplifies to ${b}.`;
}

const LINES_FOR: Record<RuleId, string[]> = {
  'd.base': ['d.base', 'nu.base'],
  'd.sym': ['d.sym', 'nu.base'],
  'd.union': ['d.union', 'nu.union'],
  'd.concat': ['d.concat', 'nu.concat'],
  'd.concat1': ['d.concat', 'nu.concat'],
  'd.star': ['d.star', 'nu.base'],
  'd.plus': ['d.plus', 'nu.plus'],
  'd.opt': ['d.opt', 'nu.base'],
};

function symbolArg(arg: Value | undefined): string | Error {
  const t = String(arg ?? '').trim();
  if (!/^[A-Za-z0-9]$/.test(t))
    return new Error(
      `"${t}" is not one symbol. Derive takes one letter or digit, such as a; to read a whole word, press Match.`,
    );
  return t;
}

export function wordArg(arg: Value | undefined): string | Error {
  const t = String(arg ?? '')
    .trim()
    .replace(/\s+/g, '');
  if (t === 'eps' || t === EPS) return '';
  if (!/^[A-Za-z0-9]+$/.test(t))
    return new Error(`"${t}" is not a word. Use letters and digits, or eps for the empty word.`);
  if (t.length > MAX_WORD) return new Error(`Keep the word to ${MAX_WORD} symbols or fewer.`);
  return t;
}

function refuse(s: S, say: string, line: string): RdStep {
  return { state: s, marks: [mark('expr', 'error')], say, lines: [line], vars: vars(s), level: 1 };
}

const load: Op = {
  label: 'Load',
  arity: 1,
  *run(s, [arg], { settings }) {
    const p = readText(String(arg ?? ''), settings.union);
    if (p instanceof Error) {
      yield refuse(s, `Nothing loaded. ${p.message} The expression stays ${s.text}.`, 'load');
      return s;
    }
    const state: S = { text: p.text, tree: p.tree, panel: null };
    yield {
      state,
      marks: [mark('expr', 'new')],
      say: `Loaded r = ${p.text}. ν(r) is ${nullable(p.tree.r) ? 'true: r matches the empty word' : 'false: r does not match the empty word'}. Press Derive with a symbol, Match with a word, or Build DFA.`,
      lines: ['load'],
      vars: vars(state),
      level: 1,
    } satisfies RdStep;
    return state;
  },
};

const deriveOp: Op = {
  label: 'Derive',
  arity: 1,
  *run(s, [arg], { settings }) {
    const c = symbolArg(arg);
    if (c instanceof Error) {
      yield refuse(s, `Nothing derived. ${c.message}`, 'd.sig');
      return s;
    }
    const u = settings.union;
    const rows = deriveRows(s.tree.r, c, settings.similarity, u);
    const panel: DerivePanel = { kind: 'derive', c, rows, shown: 0 };
    const at = (shown: number): S => ({ ...s, panel: { ...panel, shown } });
    yield {
      state: at(0),
      marks: [mark('expr', 'active')],
      say: `d_${c}(${s.text}): what is left of r after reading ${c}. Work it out from the smallest parts up; each part needs its parts' derivatives, and a concatenation needs to know whether its first part can be empty (ν).`,
      lines: ['d.sig'],
      vars: vars(at(0)),
      level: 2,
    } satisfies RdStep;
    for (let k = 0; k < rows.length; k++) {
      const row = rows[k]!;
      const last = k === rows.length - 1;
      const state = at(k + 1);
      const say = ruleSay(row, rows, c, u);
      yield {
        state,
        marks: [mark(rowId(k), last ? 'found' : 'active')],
        say: last
          ? `${say} That is d_${c}(r) for the whole expression${nullable(row.d) ? `, and it is nullable, so the word ${c} alone matches r` : ''}.`
          : say,
        lines: [...LINES_FOR[row.rule], ...(rx(row.raw, u) !== rx(row.d, u) ? ['d.simplify'] : [])],
        vars: vars(state),
        level: last
          ? 1
          : row.r.kind === 'sym' || row.r.kind === 'eps' || row.r.kind === 'empty'
            ? 3
            : 2,
      } satisfies RdStep;
    }
    return at(rows.length);
  },
};

const match: Op = {
  label: 'Match',
  arity: 1,
  *run(s, [arg], { settings }) {
    const w = wordArg(arg);
    if (w instanceof Error) {
      yield refuse(s, `Nothing matched. ${w.message}`, 'm.sig');
      return s;
    }
    const u = settings.union;
    const sim = settings.similarity;
    const rows: MatchRow[] = [];
    let r = simplify(s.tree.r, sim);
    rows.push({ c: '', r, nu: nullable(r) });
    for (const c of w) {
      if (r.kind === 'empty') break;
      r = derive(r, c, sim);
      rows.push({ c, r, nu: nullable(r) });
    }
    const dead = r.kind === 'empty' && rows.length - 1 < w.length;
    const verdict = nullable(r) && !dead ? 'accept' : 'reject';
    const panel: MatchPanel = { kind: 'match', word: w, rows, shown: 0 };
    const at = (shown: number, v?: 'accept' | 'reject'): S => ({
      ...s,
      panel: { ...panel, shown, ...(v ? { verdict: v } : {}) },
    });
    let state = at(1);
    yield {
      state,
      marks: [mark(rowId(0), 'active')],
      say: `Match ${wordText(w)}: start with r${rx(rows[0]!.r, u) === s.text ? '' : `, simplified to ${rx(rows[0]!.r, u)}`}, and take one derivative per symbol.`,
      lines: ['m.sig', 'm.start'],
      vars: vars(state),
      level: 2,
    } satisfies RdStep;
    for (let k = 1; k < rows.length; k++) {
      const row = rows[k]!;
      state = at(k + 1);
      const gone = row.r.kind === 'empty';
      yield {
        state,
        marks: [mark(rowId(k), gone ? 'error' : 'active')],
        say: gone
          ? `Read ${row.c}: d_${row.c} gives ∅. No word at all is left, so whatever comes next, ${wordText(w)} does not match.`
          : `Read ${row.c}: d_${row.c}(${rx(rows[k - 1]!.r, u)}) = ${rx(row.r, u)}.`,
        lines: ['m.loop', 'm.derive', ...(gone ? ['m.dead'] : [])],
        vars: vars(state),
        level: 2,
      } satisfies RdStep;
    }
    const final = rows.at(-1)!;
    state = at(rows.length, verdict);
    yield {
      state,
      marks: [
        mark(rowId(rows.length - 1), verdict === 'accept' ? 'found' : 'error'),
        mark('verdict', verdict === 'accept' ? 'found' : 'error'),
      ],
      say: dead
        ? `${wordText(w)} does not match r: the derivative became ∅ before the word ran out.`
        : `The word is used up. ν(${rx(final.r, u)}) is ${final.nu}, so ${wordText(w)} ${final.nu ? 'matches' : 'does not match'} r.`,
      lines: ['m.nu'],
      vars: vars(state),
      level: 1,
    } satisfies RdStep;
    return state;
  },
};

/** The DFA of derivatives: breadth first from r, symbols in order, states q0, q1, ... */
export function buildDfa(r0: Regex, alphabet: string[], sim: Similarity) {
  const states: DfaState[] = [{ name: 'q0', r: r0, nu: nullable(r0) }];
  const index = new Map([[key(r0), 0]]);
  const moves: Move[] = [];
  /** For each move, whether it found a new state. */
  const fresh: boolean[] = [];
  let stopped: DfaPanel['stopped'];
  outer: for (let i = 0; i < states.length; i++)
    for (const c of alphabet) {
      const d = derive(states[i]!.r, c, sim);
      let j = index.get(key(d));
      const isNew = j === undefined;
      if (isNew) {
        if (states.length === MAX_STATES) {
          stopped = 'states';
          break outer;
        }
        if (sim === 'basic' && regexSize(d) > MAX_SIZE) {
          stopped = 'size';
          break outer;
        }
        j = states.length;
        index.set(key(d), j);
        states.push({ name: `q${j}`, r: d, nu: nullable(d) });
      }
      moves.push({ from: states[i]!.name, on: c, to: states[j!]!.name });
      fresh.push(isNew);
    }
  return { states, moves, fresh, stopped };
}

export function dfaAutomaton(p: Pick<DfaPanel, 'states' | 'moves' | 'alphabet'>): Automaton {
  return makeAutomaton({
    states: p.states.map((q) => q.name),
    alphabet: p.alphabet,
    start: 'q0',
    accept: p.states.filter((q) => q.nu).map((q) => q.name),
    moves: p.moves,
  });
}

const dfa: Op = {
  label: 'Build DFA',
  arity: 0,
  *run(s, _args, { settings }) {
    const u = settings.union;
    const sim = settings.similarity;
    const r0 = simplify(s.tree.r, sim);
    const alphabet = regexSymbols(r0);
    const b = buildDfa(r0, alphabet, sim);
    const panel: DfaPanel = {
      kind: 'dfa',
      alphabet,
      states: b.states,
      moves: b.moves,
      found: 1,
      done: 0,
      finished: false,
      ...(b.stopped ? { stopped: b.stopped } : {}),
    };
    const at = (found: number, done: number, finished = false): S => ({
      ...s,
      panel: { ...panel, found, done, finished },
    });
    let state = at(1, 0);
    yield {
      state,
      marks: [mark(stateId('q0', MIN_PREFIX), 'new')],
      say: `The start state q0 is r itself${rx(r0, u) === s.text ? '' : `, simplified: ${rx(r0, u)}`}. Each state is an expression; its move on a symbol goes to its derivative by that symbol.${alphabet.length ? '' : ' r uses no symbols, so there is nothing to read.'}`,
      lines: ['b.sig', 'b.start'],
      vars: vars(state),
      level: 2,
    } satisfies RdStep;
    let found = 1;
    for (let k = 0; k < b.moves.length; k++) {
      const m = b.moves[k]!;
      const to = b.states.find((q) => q.name === m.to)!;
      const from = b.states.find((q) => q.name === m.from)!;
      if (b.fresh[k]) found++;
      state = at(found, k + 1);
      yield {
        state,
        marks: [
          mark(moveId(m.from, m.to, MIN_PREFIX), 'active'),
          mark(stateId(m.to, MIN_PREFIX), b.fresh[k] ? 'new' : 'visit'),
        ],
        say: b.fresh[k]
          ? `d_${m.on}(${rx(from.r, u)}) = ${rx(to.r, u)}: a new expression, so a new state, ${m.to}${to.nu ? ', and it accepts: ν is true' : ''}.`
          : `d_${m.on}(${rx(from.r, u)}) = ${rx(to.r, u)}, which is ${m.to}${m.to === m.from ? ' itself' : ''}: no new state.`,
        lines: ['b.loop', 'b.derive', b.fresh[k] ? 'b.new' : 'b.old'],
        vars: vars(state),
        level: b.fresh[k] ? 2 : 3,
      } satisfies RdStep;
    }
    state = at(found, b.moves.length, true);
    const acc = b.states.filter((q) => q.nu).map((q) => q.name);
    yield {
      state,
      marks: acc.map((q) => mark(stateId(q, MIN_PREFIX), 'found')),
      say: b.stopped
        ? b.stopped === 'states'
          ? `Still finding new expressions after ${plural(MAX_STATES, 'state')}. ${sim === 'basic' ? 'Without the similarity rules, unions keep repeating themselves and the expressions keep growing, so this may never stop. Turn on similarity in Options.' : 'The page stops here.'}`
          : `The expressions are getting too large (more than ${MAX_SIZE} symbols and operators). ${sim === 'basic' ? 'Without the similarity rules they can grow forever. Turn on similarity in Options.' : 'The page stops here.'}`
        : `Every move leads to a state already found, so the DFA is complete: ${plural(b.states.length, 'state')}, one per distinct derivative. The accepting states are the nullable ones: ${acc.length ? acc.join(', ') : 'none'}.`,
      lines: [b.stopped ? 'b.loop' : 'b.accept'],
      vars: vars(state),
      level: 1,
    } satisfies RdStep;
    return state;
  },
};

export const ops = { load, derive: deriveOp, match, dfa };

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: RdSettings): PseudoBlock[] {
  const u = settings.union;
  const aci = settings.similarity === 'aci';
  return [
    {
      op: 'derive',
      lines: [
        L('d.sig', 0, 'd_c(r):', 'What is left of r after reading c:'),
        L('d.base', 1, 'd_c(∅) = d_c(ε) = ∅', 'nothing, or only the empty word, leaves nothing;'),
        L(
          'd.sym',
          1,
          'd_c(c) = ε; d_c(b) = ∅ if b ≠ c',
          'the symbol c leaves the empty word, any other symbol nothing;',
        ),
        L('d.union', 1, `d_c(r${u}s) = d_c(r) ${u} d_c(s)`, 'for a union, take c off either side;'),
        L(
          'd.concat',
          1,
          `d_c(rs) = d_c(r)s ${u} (ν(r) ? d_c(s) : ∅)`,
          'for rs, take c off r; if r can be empty, c may also come off s;',
        ),
        L('d.star', 1, 'd_c(r*) = d_c(r) r*', 'for a star, take c off one copy and keep the star;'),
        ...(u === '|'
          ? [
              L(
                'd.plus',
                1,
                'd_c(r+) = d_c(r) r*',
                'for one or more, the same, after the first copy;',
              ),
            ]
          : []),
        L('d.opt', 1, 'd_c(r?) = d_c(r)', 'for an optional part, only r can read c.'),
        L(
          'd.simplify',
          1,
          aci
            ? `simplify: ∅${u}r = r, ∅r = ∅, εr = r, sort ${u}, drop repeats`
            : `simplify: ∅${u}r = r, ∅r = ∅, εr = r`,
          aci
            ? 'Then tidy up: drop ∅ and ε where they do nothing, sort the alternatives and drop repeats.'
            : 'Then tidy up: drop ∅ and ε where they do nothing.',
        ),
        L(
          'nu.base',
          1,
          'ν(ε) = ν(r*) = ν(r?) = true; ν(∅) = ν(c) = false',
          'ν says whether r matches the empty word;',
        ),
        L('nu.union', 1, `ν(r${u}s) = ν(r) or ν(s)`, 'a union does if either side does;'),
        L('nu.concat', 1, 'ν(rs) = ν(r) and ν(s)', 'a concatenation does if both parts do;'),
        ...(u === '|' ? [L('nu.plus', 1, 'ν(r+) = ν(r)', 'one or more does if r does.')] : []),
      ],
    },
    {
      op: 'match',
      lines: [
        L('m.sig', 0, 'match(r, w):', 'To match a word w:'),
        L('m.start', 1, 'r = simplify(r)', 'start with r;'),
        L('m.loop', 1, 'for each symbol c of w', 'for each symbol of the word:'),
        L('m.derive', 2, 'r = d_c(r)', 'replace r by its derivative;'),
        L('m.dead', 2, 'if r = ∅: return false', 'if nothing is left, stop: no match.'),
        L('m.nu', 1, 'return ν(r)', 'At the end, match if r matches the empty word.'),
      ],
    },
    {
      op: 'dfa',
      lines: [
        L('b.sig', 0, 'dfa(r):', 'To build a DFA:'),
        L('b.start', 1, 'Q = [r]; q0 = r', 'the start state is r;'),
        L(
          'b.loop',
          1,
          'for each q in Q, each c in Σ',
          'for each state found so far and each symbol:',
        ),
        L('b.derive', 2, 'q′ = d_c(q)', 'take the derivative;'),
        L('b.new', 2, 'if q′ ∉ Q: add q′ to Q', 'a new expression is a new state;'),
        L('b.old', 2, 'δ(q, c) = q′', 'move to its state.'),
        L('b.accept', 1, 'F = { q in Q : ν(q) }', 'A state accepts when its expression matches ε.'),
      ],
    },
    {
      op: 'load',
      lines: [L('load', 0, 'r = parse(text)', 'Read the expression.')],
    },
  ];
}

export function initialSay(s: S): string {
  return `r = ${s.text}. The derivative of r by a symbol c is what is left of r once c has been read. Press Derive with a symbol such as a, Match with a word such as abb, or Build DFA.`;
}

export function initialVars(s: S) {
  return vars(s);
}

export function describe(s: S, settings?: RdSettings): string {
  const u = settings?.union ?? '|';
  const p = s.panel;
  const head = `The expression r = ${s.text}.`;
  if (!p) return head;
  if (p.kind === 'derive')
    return `${head} Derivative by ${p.c}, part by part: ${p.rows
      .slice(0, p.shown)
      .map((r) => `${r.text}: ν ${r.nu}, d = ${rx(r.d, u)}`)
      .join('; ')}.`;
  if (p.kind === 'match')
    return `${head} Matching ${wordText(p.word)}: ${p.rows
      .slice(0, p.shown)
      .map((r) => `${r.c ? `after ${r.c}` : 'start'} ${rx(r.r, u)}`)
      .join(
        '; ',
      )}.${p.verdict ? ` ${p.verdict === 'accept' ? 'Matches' : 'Does not match'}.` : ''}`;
  return `${head} DFA of derivatives: ${p.states
    .slice(0, p.found)
    .map((q) => `${q.name} = ${rx(q.r, u)}${q.nu ? ' (accepts)' : ''}`)
    .join('; ')}.`;
}
