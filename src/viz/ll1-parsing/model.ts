/**
 * LL(1) parsing: FIRST and FOLLOW sets to a fixed point, the parse table (a cell with two rules
 * is a conflict, drawn red with its reason), then a predictive parse with a stack and the input,
 * growing the parse tree top down.
 *
 *   load G    FIRST, FOLLOW and the table, a step for every set that grows and every rule placed
 *   parse w   the predictive parse of w$: expand the variable on top by M[A, a], or match
 *
 * Conventions (the dragon book's): $ ends the input and sits at the bottom of the stack; FIRST
 * sets hold ε when a variable can vanish; for A → α, M[A, a] gets the rule for each a in
 * FIRST(α), and for each b in FOLLOW(A) when α can vanish. Setting `conflicts`: refuse to parse
 * with a table that has conflicts (an LL(1) parser cannot choose), or take the first rule
 * listed, to watch the guess go wrong.
 */
import type {
  Mark,
  MarkRole,
  OpSpec,
  PseudoBlock,
  PseudoLine,
  Scalar,
  Step,
} from '../../engine/types';
import { ruleShapeId } from '../_grammar/draw';
import {
  EPS,
  formText,
  formatGrammar,
  isVariable,
  parseGrammar,
  parseWord,
  ruleText,
  type Grammar,
  type ParseTree,
  type Rule,
  type Sym,
} from '../_grammar/grammar';

export const END = '$';

export interface Ll1Settings {
  [key: string]: Scalar;
  conflicts: 'refuse' | 'first';
}

export type Phase = 'typed' | 'first' | 'follow' | 'table' | 'ready';

export interface Conflict {
  A: Sym;
  a: Sym;
  rules: number[];
  why: string;
}

export interface StackItem {
  sym: Sym;
  /** The parse-tree node of a grammar symbol; -1 for the end marker. */
  node: number;
}

export interface ParseRun {
  word: Sym[];
  stack: StackItem[];
  /** Symbols of w$ matched so far. */
  pos: number;
  /** The whole tree the parse builds (to its last move), and how many of its nodes exist now. */
  tree: ParseTree;
  made: number;
  moves: number;
  verdict: 'accept' | 'reject' | 'gave-up' | null;
  /** The deepest the stack gets in this parse, for sizing the drawing. */
  deepest: number;
}

export interface Ll1State {
  grammar: Grammar;
  phase: Phase;
  /** FIRST and FOLLOW of each variable, in canonical order (terminals, then $, then ε). */
  first: Record<Sym, Sym[]>;
  follow: Record<Sym, Sym[]>;
  /** M[A][a]: indexes into grammar.rules, in rule order. */
  table: Record<Sym, Record<Sym, number[]>>;
  conflicts: Conflict[];
  /** Rounds each fixed point took (the last changed nothing). */
  rounds: { first: number; follow: number };
  run: ParseRun | null;
}

export interface Ll1Extra {
  /** The table cell being filled or read. */
  cell?: { A: Sym; a: Sym };
}

type S = Ll1State;
type X = Ll1Extra;
type Op = OpSpec<S, Ll1Settings, X>;
type LStep = Step<S, X>;

export const defaults: Ll1Settings = { conflicts: 'refuse' };

export const START = "E -> TE'; E' -> +TE' | eps; T -> FT'; T' -> *FT' | eps; F -> (E) | a";
export const RULES = 'r';
export const MAX_WORD = 10;
export const CAP = 40;
/** The deepest level of the parse tree the stage draws (a guess on left recursion grows on). */
export const TREE_DEPTH = 6;

export function depthOf(tree: ParseTree, id: number): number {
  let d = 0;
  for (let k = tree[id]!.parent; k >= 0; k = tree[k]!.parent) d++;
  return d;
}

const mark = (id: string, role: MarkRole): Mark => ({ id, role });
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const list = (xs: readonly string[]) =>
  xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`;
export const setText = (xs: readonly string[]) => (xs.length ? `{ ${xs.join(', ')} }` : '∅');
export const looksLikeGrammar = (t: string) => /->|→/.test(t);

/** Columns of the table: the terminals, then $. */
export const columns = (g: Grammar): Sym[] => [...g.terminals, END];

/** Sort a set: terminals in grammar order, then $, then ε. */
function canon(g: Grammar, xs: Iterable<Sym>): Sym[] {
  const order = [...g.terminals, END, EPS];
  return [...new Set(xs)].sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

/** Shape ids. */
export const firstId = (A: Sym) => `ff-${A}-1`;
export const followId = (A: Sym) => `ff-${A}-2`;
export const cellId = (A: Sym, a: Sym) => `m-${A}-${a}`;
export const stackId = (node: number) => (node < 0 ? 'stk-end' : `stk-${node}`);
export const inputId = (i: number) => `in-${i}`;
export const nodeId = (id: number) => `t-n${id}`;
const rid = (r: Rule) => ruleShapeId(RULES, r);

function empty(g: Grammar): S {
  const sets = () => Object.fromEntries(g.variables.map((v) => [v, [] as Sym[]]));
  return {
    grammar: g,
    phase: 'typed',
    first: sets(),
    follow: sets(),
    table: Object.fromEntries(g.variables.map((v) => [v, {}])),
    conflicts: [],
    rounds: { first: 0, follow: 0 },
    run: null,
  };
}

/** FIRST of a string of symbols, with ε when every symbol can vanish. */
export function firstOf(g: Grammar, first: Record<Sym, Sym[]>, syms: readonly Sym[]): Sym[] {
  const out: Sym[] = [];
  for (const x of syms) {
    if (!isVariable(x)) return canon(g, [...out, x]);
    const f = first[x] ?? [];
    out.push(...f.filter((y) => y !== EPS));
    if (!f.includes(EPS)) return canon(g, out);
  }
  return canon(g, [...out, EPS]);
}

export function vars(s: S): Record<string, Scalar> {
  const out: Record<string, Scalar> = { rules: s.grammar.rules.length };
  if (s.phase !== 'typed') {
    out['FIRST rounds'] = s.rounds.first;
    out['FOLLOW rounds'] = s.rounds.follow;
  }
  if (s.phase === 'table' || s.phase === 'ready') out.conflicts = s.conflicts.length;
  if (s.run) {
    out.moves = s.run.moves;
    out['stack depth'] = s.run.stack.length;
  }
  return out;
}

/** The analysis, step by step; returns the state with FIRST, FOLLOW and the table. */
export function* analysis(g: Grammar): Generator<Omit<LStep, 'vars'>, S, void> {
  let s = empty(g);
  const step = (
    patch: Partial<S>,
    say: string,
    lines: string[],
    level: 1 | 2 | 3,
    marks: Mark[] = [],
    extra?: X,
  ) => {
    s = { ...s, ...patch };
    return { state: s, marks, say, lines, level, extra };
  };

  // FIRST, to a fixed point.
  const first: Record<Sym, Sym[]> = { ...s.first };
  yield step(
    { phase: 'first' },
    'FIRST(A) is the set of terminals that can begin a string A derives, plus ε if A can vanish. Start with every set empty and go through the rules again and again until no set grows.',
    ['load.first'],
    2,
  );
  let round = 0;
  for (let changed = true; changed;) {
    changed = false;
    round++;
    const grew: Sym[] = [];
    for (const r of g.rules) {
      const add = firstOf(g, first, r.rhs).filter((x) => !first[r.lhs]!.includes(x));
      if (!add.length) continue;
      first[r.lhs] = canon(g, [...first[r.lhs]!, ...add]);
      changed = true;
      if (!grew.includes(r.lhs)) grew.push(r.lhs);
      const why = r.rhs.length
        ? `FIRST(${formText(r.rhs)}) gives ${setText(add)}`
        : `${ruleText(r)} means ${r.lhs} can vanish`;
      yield step(
        { first: { ...first }, rounds: { first: round, follow: 0 } },
        `Round ${round}, ${ruleText(r)}: ${why}. FIRST(${r.lhs}) = ${setText(first[r.lhs]!)}.`,
        ['load.firstRule'],
        3,
        [mark(rid(r), 'active'), mark(firstId(r.lhs), 'new')],
      );
    }
    yield step(
      { first: { ...first }, rounds: { first: round, follow: 0 } },
      changed
        ? `Round ${round} grew FIRST of ${list(grew)}. Something changed, so go round again.`
        : `Round ${round} changed nothing: FIRST is done.`,
      ['load.first'],
      2,
      g.variables.map((v) => mark(firstId(v), changed && !grew.includes(v) ? 'visit' : 'done')),
    );
  }
  const firstRounds = round;

  // FOLLOW, to a fixed point.
  const follow: Record<Sym, Sym[]> = { ...s.follow, [g.start]: [END] };
  yield step(
    { phase: 'follow', follow: { ...follow } },
    `FOLLOW(A) is the set of terminals that can come right after A, with $ for the end of the input. FOLLOW(${g.start}) starts as { $ }, since the start variable is followed by the end.`,
    ['load.follow'],
    2,
    [mark(followId(g.start), 'new')],
  );
  round = 0;
  for (let changed = true; changed;) {
    changed = false;
    round++;
    const grew: Sym[] = [];
    for (const r of g.rules) {
      for (let k = 0; k < r.rhs.length; k++) {
        const B = r.rhs[k]!;
        if (!isVariable(B)) continue;
        const rest = r.rhs.slice(k + 1);
        const fr = firstOf(g, first, rest);
        const from = fr.filter((x) => x !== EPS);
        const fromA = fr.includes(EPS) ? follow[r.lhs]! : [];
        const add = canon(g, [...from, ...fromA]).filter((x) => !follow[B]!.includes(x));
        if (!add.length) continue;
        follow[B] = canon(g, [...follow[B]!, ...add]);
        changed = true;
        if (!grew.includes(B)) grew.push(B);
        const why = !rest.length
          ? `${B} ends the right side, so what follows ${r.lhs} follows ${B}`
          : fromA.length
            ? `${formText(rest)} comes after ${B} and can vanish, so FIRST(${formText(rest)}) without ε and FOLLOW(${r.lhs}) follow ${B}`
            : `FIRST(${formText(rest)}) follows ${B}`;
        yield step(
          { follow: { ...follow }, rounds: { first: firstRounds, follow: round } },
          `Round ${round}, ${ruleText(r)}: ${why}. FOLLOW(${B}) = ${setText(follow[B]!)}.`,
          ['load.followRule'],
          3,
          [mark(rid(r), 'active'), mark(followId(B), 'new')],
        );
      }
    }
    yield step(
      { follow: { ...follow }, rounds: { first: firstRounds, follow: round } },
      changed
        ? `Round ${round} grew FOLLOW of ${list(grew)}. Go round again.`
        : `Round ${round} changed nothing: FOLLOW is done.`,
      ['load.follow'],
      2,
      g.variables.map((v) => mark(followId(v), changed && !grew.includes(v) ? 'visit' : 'done')),
    );
  }

  // The table.
  const table: Record<Sym, Record<Sym, number[]>> = Object.fromEntries(
    g.variables.map((v) => [v, {}]),
  );
  const conflicts: Conflict[] = [];
  yield step(
    { phase: 'table', table: { ...table } },
    'Now the table M[A, a]: which rule to use when A is on top of the stack and a is the next input symbol. Each rule goes in the cells for the terminals it can start with.',
    ['load.table'],
    2,
  );
  for (let ri = 0; ri < g.rules.length; ri++) {
    const r = g.rules[ri]!;
    const fa = firstOf(g, first, r.rhs);
    const cols = canon(g, [
      ...fa.filter((x) => x !== EPS),
      ...(fa.includes(EPS) ? follow[r.lhs]! : []),
    ]);
    const fresh: Conflict[] = [];
    const row = { ...table[r.lhs]! };
    for (const a of cols) {
      const had = row[a] ?? [];
      row[a] = [...had, ri];
      if (had.length) {
        const other = g.rules[had[0]!]!;
        const viaFollow = (x: Rule) => !firstOf(g, first, x.rhs).includes(a);
        const why =
          viaFollow(r) || viaFollow(other)
            ? `FIRST/FOLLOW conflict: one of ${ruleText(other)} and ${ruleText(r)} can vanish, and ${a} can follow ${r.lhs}`
            : `FIRST/FIRST conflict: both ${ruleText(other)} and ${ruleText(r)} can start with ${a}`;
        const c = conflicts.find((x) => x.A === r.lhs && x.a === a);
        if (c) c.rules = [...row[a]!];
        else fresh.push({ A: r.lhs, a, rules: [...row[a]!], why });
      }
    }
    conflicts.push(...fresh);
    table[r.lhs] = row;
    const viaEps = fa.includes(EPS);
    const where = cols.length
      ? `${viaEps ? `${formText(r.rhs)} can vanish, so it goes under FOLLOW(${r.lhs}) = ${setText(follow[r.lhs]!)}${fa.length > 1 ? ` as well as FIRST = ${setText(fa.filter((x) => x !== EPS))}` : ''}` : `FIRST(${formText(r.rhs)}) = ${setText(fa)}`}: M[${r.lhs}, ${list(cols)}].`
      : 'It starts with nothing that can be read, so it goes nowhere.';
    yield step(
      { table: { ...table }, conflicts: [...conflicts] },
      `${ruleText(r)}: ${where}${fresh.length ? ` ${fresh.map((c) => `M[${c.A}, ${c.a}] now has two rules, a ${c.why}.`).join(' ')}` : ''}`,
      [viaEps ? 'load.tableFollow' : 'load.tableFirst'],
      2,
      [
        mark(rid(r), 'active'),
        ...cols.map((a) => mark(cellId(r.lhs, a), fresh.some((c) => c.a === a) ? 'error' : 'new')),
      ],
    );
  }
  yield step(
    { phase: 'ready' },
    conflicts.length
      ? `The grammar is not LL(1): ${plural(conflicts.length, 'cell')} of the table ${conflicts.length === 1 ? 'has' : 'have'} two rules. ${conflicts[0]!.why[0]!.toUpperCase()}${conflicts[0]!.why.slice(1)}.`
      : 'No cell has two rules: the grammar is LL(1). One symbol of lookahead always says which rule to use. Type a word and press Parse.',
    [conflicts.length ? 'load.conflict' : 'load.done'],
    1,
    conflicts.length
      ? conflicts.map((c) => mark(cellId(c.A, c.a), 'error'))
      : [mark('m-title', 'found')],
  );
  return s;
}

export function analyze(g: Grammar): S {
  const gen = analysis(g);
  for (let r = gen.next(); ; r = gen.next()) if (r.done) return r.value;
}

export function init(): S {
  return analyze(parseGrammar(START) as Grammar);
}

function refuse(s: S, say: string, line: string): LStep {
  return {
    state: s,
    marks: [mark(`${RULES}-title`, 'error')],
    say,
    lines: [line],
    vars: vars(s),
    level: 1,
  };
}

const load: Op = {
  label: 'Load',
  arity: 1,
  *run(s, [arg]) {
    const text = String(arg ?? '').trim();
    if (!looksLikeGrammar(text)) {
      yield refuse(
        s,
        `"${text}" is not a grammar. Load takes rules such as S -> aSb | eps; to parse a word, press Parse.`,
        'load.first',
      );
      return s;
    }
    const g = parseGrammar(text);
    if (g instanceof Error) {
      yield refuse(s, `Nothing loaded. ${g.message}`, 'load.first');
      return s;
    }
    if (g.terminals.includes(END)) {
      yield refuse(
        s,
        'Nothing loaded. $ marks the end of the input here, so it cannot be a terminal.',
        'load.first',
      );
      return s;
    }
    const start = empty(g);
    yield {
      state: start,
      marks: [mark(`${RULES}-title`, 'active')],
      say: `Loaded ${plural(g.rules.length, 'rule')}. Before an LL(1) parser can run, it needs FIRST and FOLLOW sets, and from them its table.`,
      lines: ['load.first'],
      vars: vars(start),
      level: 2,
    } satisfies LStep;
    let end = start;
    for (const e of analysis(g)) {
      end = e.state;
      yield { ...e, vars: vars(e.state) };
    }
    return end;
  },
};

/** One move of a parse, for the steps. */
interface Move {
  kind: 'expand' | 'match' | 'accept' | 'error' | 'cap';
  run: ParseRun;
  rule?: number;
  cell?: { A: Sym; a: Sym };
  why?: string;
  /** The nodes an expansion made. */
  kids?: number[];
}

/** The whole parse, move by move, with the tree it builds. */
export function simulate(s: S, w: Sym[]): Move[] {
  const g = s.grammar;
  const input = [...w, END];
  const tree: ParseTree = [{ id: 0, sym: g.start, kids: [], parent: -1 }];
  let stack: StackItem[] = [
    { sym: END, node: -1 },
    { sym: g.start, node: 0 },
  ];
  let pos = 0;
  let moves = 0;
  const out: Move[] = [];
  const snap = (verdict: ParseRun['verdict'] = null): ParseRun => ({
    word: w,
    stack: [...stack],
    pos,
    tree,
    made: tree.length,
    moves,
    verdict,
    deepest: 0,
  });
  for (;;) {
    const top = stack.at(-1)!;
    const a = input[pos]!;
    if (top.sym === END && a === END) {
      out.push({ kind: 'accept', run: snap('accept') });
      break;
    }
    if (moves >= CAP) {
      out.push({ kind: 'cap', run: snap('gave-up') });
      break;
    }
    if (!isVariable(top.sym)) {
      if (top.sym !== a) {
        out.push({
          kind: 'error',
          run: snap('reject'),
          why: `${top.sym === END ? 'the stack is down to $' : `${top.sym} is on top`}, but the input has ${a === END ? 'ended' : a}`,
        });
        break;
      }
      stack = stack.slice(0, -1);
      pos++;
      moves++;
      out.push({ kind: 'match', run: snap() });
      continue;
    }
    const entry = s.table[top.sym]?.[a] ?? [];
    if (!entry.length) {
      out.push({
        kind: 'error',
        run: snap('reject'),
        cell: { A: top.sym, a },
        why: `M[${top.sym}, ${a}] is empty`,
      });
      break;
    }
    const ri = entry[0]!;
    const r = g.rules[ri]!;
    const kids = (r.rhs.length ? r.rhs : [EPS]).map((sym) => {
      const id = tree.length;
      tree.push({ id, sym, kids: [], parent: top.node });
      tree[top.node]!.kids.push(id);
      return id;
    });
    const pushed = r.rhs.length
      ? kids.map((id) => ({ sym: tree[id]!.sym, node: id })).reverse()
      : [];
    stack = [...stack.slice(0, -1), ...pushed];
    moves++;
    out.push({ kind: 'expand', run: snap(), rule: ri, cell: { A: top.sym, a }, kids });
  }
  // Every snapshot shares the finished tree; `made` says how much of it exists.
  return out;
}

const showSym = (a: Sym) => (a === END ? '$ (the end)' : a);

const parse: Op = {
  label: 'Parse',
  arity: 1,
  *run(s, [arg], { settings }) {
    const text = String(arg ?? '').trim();
    if (looksLikeGrammar(text)) {
      yield refuse(s, 'That looks like a grammar. Press Load to use it.', 'parse.init');
      return s;
    }
    const w = parseWord(text, s.grammar, MAX_WORD);
    if (w instanceof Error) {
      yield refuse(s, `Nothing parsed. ${w.message}`, 'parse.init');
      return s;
    }
    if (s.conflicts.length && settings.conflicts === 'refuse') {
      yield {
        state: { ...s, run: null },
        marks: s.conflicts.map((c) => mark(cellId(c.A, c.a), 'error')),
        say: `The table has ${plural(s.conflicts.length, 'conflict')}, so an LL(1) parser cannot always choose a rule. (Options can make it take the first rule listed, to watch that guess.)`,
        lines: ['parse.init'],
        vars: vars({ ...s, run: null }),
        level: 1,
      } satisfies LStep;
      return { ...s, run: null };
    }
    const g = s.grammar;
    const moves = simulate(s, w);
    const tree = moves.at(-1)!.run.tree;
    const deepest = Math.max(2, ...moves.map((m) => m.run.stack.length));
    const fix = (run: ParseRun): ParseRun => ({ ...run, tree, deepest });
    const firstRun: ParseRun = {
      word: w,
      stack: [
        { sym: END, node: -1 },
        { sym: g.start, node: 0 },
      ],
      pos: 0,
      tree,
      made: 1,
      moves: 0,
      verdict: null,
      deepest,
    };
    let state: S = { ...s, run: firstRun };
    yield {
      state,
      marks: [mark(stackId(0), 'active'), mark(inputId(0), 'active')],
      say: `Parse ${w.length ? w.join('') : 'ε'}$. The stack starts as $ ${g.start}: the start variable on top. The tree starts as its root.`,
      lines: ['parse.init'],
      vars: vars(state),
      level: 2,
    } satisfies LStep;
    for (const m of moves) {
      const run = fix(m.run);
      state = { ...s, run };
      const a = [...w, END][run.pos] ?? END;
      if (m.kind === 'expand') {
        const r = g.rules[m.rule!]!;
        const cell = m.cell!;
        const many = (s.table[cell.A]?.[cell.a] ?? []).length > 1;
        yield {
          state,
          marks: [
            mark(cellId(cell.A, cell.a), many ? 'error' : 'active'),
            mark(rid(r), 'active'),
            mark(inputId(run.pos), 'active'),
            ...m
              .kids!.filter((id) => depthOf(tree, id) <= TREE_DEPTH)
              .map((id) => mark(tree[id]!.sym === EPS ? `t-t${id}` : nodeId(id), 'new')),
          ],
          say: `${cell.A} is on top and the next input is ${showSym(cell.a)}: M[${cell.A}, ${cell.a}] says ${ruleText(r)}${many ? ', the first of two rules there: a guess' : ''}. Pop ${cell.A} and push ${r.rhs.length ? `${formText(r.rhs)}, its first symbol on top` : 'nothing'}.`,
          lines: ['parse.top', 'parse.expand'],
          vars: vars(state),
          level: 2,
          extra: { cell },
        } satisfies LStep;
      } else if (m.kind === 'match') {
        const b = [...w, END][run.pos - 1]!;
        yield {
          state,
          marks: [
            mark(inputId(run.pos - 1), 'done'),
            ...(run.pos <= w.length ? [mark(inputId(run.pos), 'active')] : []),
          ],
          say: `${b} is on top and ${b} is next: they match. Pop it and move on to ${showSym(a)}.`,
          lines: ['parse.top', 'parse.match'],
          vars: vars(state),
          level: 2,
        } satisfies LStep;
      } else {
        const accept = m.kind === 'accept';
        const say = accept
          ? `Only $ is left on the stack and in the input: accept ${w.length ? w.join('') : 'ε'} after ${plural(run.moves, 'move')}. The tree is a parse tree, built top down, its leaves left to right as the input was read.`
          : m.kind === 'cap'
            ? `Still going after ${CAP} moves: the guesses keep expanding without reading input (left recursion does that), so give up.`
            : `Error: ${m.why}. Reject ${w.length ? w.join('') : 'ε'} after ${plural(run.moves, 'move')}.`;
        yield {
          state,
          marks: accept
            ? [mark('stk-end', 'found'), mark(inputId(w.length), 'found')]
            : [
                ...(m.cell ? [mark(cellId(m.cell.A, m.cell.a), 'error')] : []),
                mark(inputId(run.pos), 'error'),
              ],
          say,
          lines: [accept ? 'parse.accept' : 'parse.error'],
          vars: vars(state),
          level: 1,
        } satisfies LStep;
      }
    }
    return state;
  },
};

export const ops = { parse, load };

const L = (id: string, indent: number, text: string, plain: string): PseudoLine => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(): PseudoBlock[] {
  return [
    {
      op: 'parse',
      lines: [
        L(
          'parse.init',
          0,
          'push $, then S; a = first symbol of w$',
          'Put $ and the start variable on the stack; look at the first input symbol.',
        ),
        L('parse.top', 1, 'repeat: X = top of stack', 'Look at the symbol on top of the stack.'),
        L(
          'parse.match',
          2,
          'if X is a terminal and X = a: pop; a = next symbol',
          'If it is the input symbol, match it and read on.',
        ),
        L(
          'parse.expand',
          2,
          'else if M[X, a] = X → Y₁…Yₖ: pop; push Yₖ, …, Y₁',
          'If it is a variable, the table says which rule: replace it by the right side.',
        ),
        L('parse.error', 2, 'else: error (reject)', 'Anything else is a syntax error.'),
        L(
          'parse.accept',
          1,
          'until X = $ and a = $: accept',
          'When only $ is left on both, accept.',
        ),
      ],
    },
    {
      op: 'load',
      lines: [
        L(
          'load.first',
          1,
          'repeat until no FIRST set grows:',
          'Compute FIRST sets, round after round, until nothing changes:',
        ),
        L(
          'load.firstRule',
          2,
          'for each A → α: FIRST(A) ∪= FIRST(α)',
          'each rule adds what its right side can start with.',
        ),
        L(
          'load.follow',
          1,
          'FOLLOW(S) = { $ }; repeat until no FOLLOW set grows:',
          'Compute FOLLOW sets the same way, with $ after the start variable:',
        ),
        L(
          'load.followRule',
          2,
          'for each A → αBβ: FOLLOW(B) ∪= FIRST(β) − ε; if β ⇒* ε: FOLLOW(B) ∪= FOLLOW(A)',
          'what can start the rest follows B; if the rest can vanish, so does what follows A.',
        ),
        L('load.table', 1, 'for each rule A → α:', 'Fill the table, one rule at a time:'),
        L(
          'load.tableFirst',
          2,
          'for each a ∈ FIRST(α): add A → α to M[A, a]',
          'put it under each terminal it can start with;',
        ),
        L(
          'load.tableFollow',
          2,
          'if ε ∈ FIRST(α): for each b ∈ FOLLOW(A): add A → α to M[A, b]',
          'if it can vanish, also under each terminal that can follow A.',
        ),
        L(
          'load.conflict',
          1,
          'a cell with two rules: not LL(1)',
          'Two rules in a cell means the grammar is not LL(1).',
        ),
        L('load.done', 1, 'no cell with two rules: LL(1)', 'Otherwise the grammar is LL(1).'),
      ],
    },
  ];
}

export function initialSay(): string {
  return 'The expression grammar without left recursion, with FIRST, FOLLOW and its LL(1) table already worked out. Type a word such as a+a*a and press Parse, or Load a grammar to watch the sets and the table being built.';
}

export function describe(s: S): string {
  const g = s.grammar;
  const parts = [`Grammar: ${formatGrammar(g)}.`];
  if (s.phase !== 'typed') {
    parts.push(
      `FIRST: ${g.variables.map((v) => `${v} ${setText(s.first[v] ?? [])}`).join('; ')}.`,
      `FOLLOW: ${g.variables.map((v) => `${v} ${setText(s.follow[v] ?? [])}`).join('; ')}.`,
    );
  }
  if (s.phase === 'ready')
    parts.push(
      s.conflicts.length ? `${s.conflicts.length} conflicts: not LL(1).` : 'LL(1): no conflicts.',
    );
  const r = s.run;
  if (r) {
    const rest = [...r.word, END].slice(r.pos).join('');
    parts.push(
      `Parsing: stack ${r.stack.map((x) => x.sym).join(' ')}, input left ${rest}, ${r.moves} moves.${r.verdict === 'accept' ? ' Accepted.' : r.verdict ? ' Rejected.' : ''}`,
    );
  }
  return parts.join(' ');
}
