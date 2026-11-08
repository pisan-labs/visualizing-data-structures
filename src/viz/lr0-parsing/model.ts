/**
 * LR(0) parsing: items, closure and goto build the LR(0) automaton (its states are item sets),
 * the ACTION and GOTO table follows with its shift-reduce and reduce-reduce conflicts flagged,
 * then a shift-reduce parse with a stack of states.
 *
 *   load G    augment with S' → S, build the item sets breadth first, then the table row by row
 *   parse w   shift and reduce on w$ by the table, until accept or an error
 *
 * Setting `method`: LR(0) puts each reduce in every column; SLR(1) only under FOLLOW of the rule's
 * left side, which removes many conflicts. A table with conflicts is refused by Parse.
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
import {
  EPS,
  formText,
  formatGrammar,
  isVariable,
  makeGrammar,
  parseGrammar,
  parseWord,
  ruleText,
  type Grammar,
  type Rule,
  type Sym,
} from '../_grammar/grammar';

export const END = '$';
export type Method = 'lr0' | 'slr1';

export interface Lr0Settings {
  [key: string]: Scalar;
  method: Method;
}

export interface Item {
  rule: number;
  dot: number;
}

export interface Edge {
  from: number;
  sym: Sym;
  to: number;
}

export type Act =
  { kind: 'shift'; to: number } | { kind: 'reduce'; rule: number } | { kind: 'accept' };

export interface Conflict {
  state: number;
  sym: Sym;
  kind: 'shift-reduce' | 'reduce-reduce';
}

export interface ParseRun {
  word: Sym[];
  /** States and the symbols between them: states[0] is 0; syms[k] led to states[k + 1]. */
  states: number[];
  syms: Sym[];
  pos: number;
  moves: number;
  verdict: 'accept' | 'reject' | null;
  /** The longest the stack gets in this parse, for sizing. */
  longest: number;
}

export type Phase = 'typed' | 'items' | 'table' | 'ready';

export interface Lr0State {
  grammar: Grammar;
  /** Rule 0 is S' → S; rule k is the grammar's rule k − 1. */
  rules: Rule[];
  phase: Phase;
  sets: Item[][];
  /** How many items of each set are its kernel (the rest come from closure). */
  kernels: number[];
  edges: Edge[];
  /** The state the panel shows. */
  focus: number;
  action: Record<Sym, Act[]>[];
  goto: Record<Sym, number>[];
  /** Rows of the table filled so far. */
  rows: number;
  conflicts: Conflict[];
  follow: Record<Sym, Sym[]>;
  run: ParseRun | null;
}

type S = Lr0State;
type Op = OpSpec<S, Lr0Settings, unknown>;
type LStep = Step<S, unknown>;

export const defaults: Lr0Settings = { method: 'lr0' };
export const START = 'E -> E+T | T; T -> (E) | a';
export const MAX_WORD = 10;
export const CAP = 200;
export const MAX_STATES = 16;

const mark = (id: string, role: MarkRole): Mark => ({ id, role });
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const list = (xs: readonly string[]) =>
  xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`;
export const setText = (xs: readonly string[]) => (xs.length ? `{ ${xs.join(', ')} }` : '∅');
export const looksLikeGrammar = (t: string) => /->|→/.test(t);

/** Shape ids. */
export const stateName = (i: number) => `I${i}`;
export const itemId = (k: number) => `it-${k}`;
export const actionId = (i: number, a: Sym) => `a-${i}-${a}`;
export const gotoId = (i: number, A: Sym) => `g-${i}-${A}`;
export const ruleNumId = (k: number) => `rn-${k}`;
export const stackId = (k: number) => `st-${k}`;

const key = (it: Item) => `${it.rule}.${it.dot}`;
const sameSet = (a: Item[], b: Item[]) => {
  const ka = new Set(a.map(key));
  return a.length === b.length && b.every((x) => ka.has(key(x)));
};

export function itemText(rules: readonly Rule[], it: Item): string {
  const r = rules[it.rule]!;
  const rhs = [...r.rhs.slice(0, it.dot), '•', ...r.rhs.slice(it.dot)].join('');
  return `${r.lhs} → ${rhs}`;
}

export const actText = (a: Act) =>
  a.kind === 'shift' ? `s${a.to}` : a.kind === 'reduce' ? `r${a.rule}` : 'acc';

/** The augmented start variable: S' (or S₀ when S' is taken). */
function augStart(g: Grammar): Sym {
  const p = `${g.start[0]}'`;
  return g.variables.includes(p) ? `${g.start[0]}₀` : p;
}

export const terminalsOf = (g: Grammar): Sym[] => [...g.terminals, END];

/** Closure of a kernel, in order: the kernel, then items added breadth first. */
export function closure(rules: readonly Rule[], kernel: readonly Item[]): Item[] {
  const out = [...kernel];
  for (let k = 0; k < out.length; k++) {
    const it = out[k]!;
    const B = rules[it.rule]!.rhs[it.dot];
    if (!B || !isVariable(B)) continue;
    rules.forEach((r, ri) => {
      if (r.lhs !== B) return;
      const x = { rule: ri, dot: 0 };
      if (!out.some((y) => key(y) === key(x))) out.push(x);
    });
  }
  return out;
}

/** FIRST and FOLLOW of the grammar's variables (for SLR(1)). */
export function followSets(g: Grammar): Record<Sym, Sym[]> {
  const first: Record<Sym, Set<Sym>> = Object.fromEntries(
    g.variables.map((v) => [v, new Set<Sym>()]),
  );
  const firstOf = (syms: readonly Sym[]) => {
    const out = new Set<Sym>();
    for (const x of syms) {
      if (!isVariable(x)) return out.add(x);
      first[x]!.forEach((y) => y !== EPS && out.add(y));
      if (!first[x]!.has(EPS)) return out;
    }
    return out.add(EPS);
  };
  for (let changed = true; changed;) {
    changed = false;
    for (const r of g.rules)
      for (const x of firstOf(r.rhs))
        if (!first[r.lhs]!.has(x)) {
          first[r.lhs]!.add(x);
          changed = true;
        }
  }
  const follow: Record<Sym, Set<Sym>> = Object.fromEntries(
    g.variables.map((v) => [v, new Set<Sym>()]),
  );
  follow[g.start]!.add(END);
  for (let changed = true; changed;) {
    changed = false;
    for (const r of g.rules)
      r.rhs.forEach((B, k) => {
        if (!isVariable(B)) return;
        const f = firstOf(r.rhs.slice(k + 1));
        const add = [...f].filter((x) => x !== EPS);
        if (f.has(EPS)) add.push(...follow[r.lhs]!);
        for (const x of add)
          if (!follow[B]!.has(x)) {
            follow[B]!.add(x);
            changed = true;
          }
      });
  }
  const order = terminalsOf(g);
  return Object.fromEntries(
    g.variables.map((v) => [
      v,
      [...follow[v]!].sort((a, b) => order.indexOf(a) - order.indexOf(b)),
    ]),
  );
}

export function vars(s: S): Record<string, Scalar> {
  const out: Record<string, Scalar> = { rules: s.rules.length };
  if (s.phase !== 'typed') {
    out.states = s.sets.length;
    out.items = s.sets.reduce((n, x) => n + x.length, 0);
  }
  if (s.phase === 'table' || s.phase === 'ready') out.conflicts = s.conflicts.length;
  if (s.run) {
    out.moves = s.run.moves;
    out['stack depth'] = s.run.states.length;
  }
  return out;
}

function empty(g: Grammar): S {
  const s0 = augStart(g);
  const rules: Rule[] = [{ lhs: s0, rhs: [g.start] }, ...g.rules];
  return {
    grammar: g,
    rules,
    phase: 'typed',
    sets: [],
    kernels: [],
    edges: [],
    focus: 0,
    action: [],
    goto: [],
    rows: 0,
    conflicts: [],
    follow: followSets(g),
    run: null,
  };
}

type Ev = Omit<LStep, 'vars'>;

/** The automaton and the table, step by step. */
export function* construction(g: Grammar, method: Method): Generator<Ev, S, void> {
  let s = empty(g);
  const R = s.rules;
  const step = (
    patch: Partial<S>,
    say: string,
    lines: string[],
    level: 1 | 2 | 3,
    marks: Mark[] = [],
  ): Ev => {
    s = { ...s, ...patch };
    return { state: s, marks, say, lines, level };
  };

  // I0 by closure, an item at a time.
  const k0: Item[] = [{ rule: 0, dot: 0 }];
  yield step(
    { phase: 'items', sets: [k0], kernels: [1], focus: 0 },
    `Augment the grammar with ${ruleText(R[0]!)}, so accepting is one clear reduction. An item is a rule with a dot: what is left of the dot has been seen. I0 starts from ${itemText(R, k0[0]!)}.`,
    ['load.aug'],
    2,
    [mark(itemId(0), 'new'), mark('s-I0', 'active')],
  );
  const full0 = closure(R, k0);
  for (let k = 1; k <= full0.length - 1; k++) {
    const it = full0[k]!;
    yield step(
      { sets: [full0.slice(0, k + 1)] },
      `The dot is before ${R[it.rule]!.lhs}, so add ${R[it.rule]!.lhs}'s rules with the dot at the start: ${itemText(R, it)}.`,
      ['load.closure'],
      3,
      [mark(itemId(k), 'new')],
    );
  }
  const sets: Item[][] = [full0];
  const kernels: number[] = [1];
  const edges: Edge[] = [];
  yield step(
    { sets: [...sets], kernels: [...kernels] },
    `I0 has ${plural(full0.length, 'item')}: its kernel and everything closure adds. Now follow each symbol after a dot to a new set.`,
    ['load.closure'],
    2,
    [mark('s-I0', 'active')],
  );

  // The rest, breadth first.
  for (let i = 0; i < sets.length; i++) {
    const set = sets[i]!;
    const symbols: Sym[] = [];
    for (const it of set) {
      const X = R[it.rule]!.rhs[it.dot];
      if (X !== undefined && !symbols.includes(X)) symbols.push(X);
    }
    for (const X of symbols) {
      const kernel = set
        .filter((it) => R[it.rule]!.rhs[it.dot] === X)
        .map((it) => ({ rule: it.rule, dot: it.dot + 1 }));
      const full = closure(R, kernel);
      const j = sets.findIndex((x) => sameSet(x, full));
      if (j >= 0) {
        edges.push({ from: i, sym: X, to: j });
        yield step(
          { edges: [...edges], focus: j },
          `goto(I${i}, ${X}): move the dot past ${X} in ${list(kernel.map((it) => itemText(R, { ...it, dot: it.dot - 1 })))}. That set is I${j}, seen before: an arrow back to it.`,
          ['load.goto'],
          3,
          [mark(`s-I${i}`, 'active'), mark(`m-I${i}-I${j}`, 'new')],
        );
        continue;
      }
      if (sets.length >= MAX_STATES) break;
      const n = sets.length;
      sets.push(full);
      kernels.push(kernel.length);
      edges.push({ from: i, sym: X, to: n });
      yield step(
        { sets: [...sets], kernels: [...kernels], edges: [...edges], focus: n },
        `goto(I${i}, ${X}): move the dot past ${X}, then take the closure. A new state, I${n}, with ${plural(full.length, 'item')}${full.length > kernel.length ? ` (${kernel.length} from I${i}, ${full.length - kernel.length} from closure)` : ''}.`,
        ['load.goto', 'load.closure'],
        2,
        [mark(`s-I${i}`, 'active'), mark(`s-I${n}`, 'new'), mark(`m-I${i}-I${n}`, 'new')],
      );
    }
  }
  yield step(
    { focus: 0 },
    `No set has a symbol left to follow: the LR(0) automaton has ${plural(sets.length, 'state')} and ${plural(edges.length, 'arrow')}. Each state remembers how much of which rules the parser has seen.`,
    ['load.goto'],
    2,
  );

  // The table, a row per state.
  const terms = terminalsOf(g);
  const action: Record<Sym, Act[]>[] = sets.map(() => ({}));
  const gotoT: Record<Sym, number>[] = sets.map(() => ({}));
  const conflicts: Conflict[] = [];
  yield step(
    {
      phase: 'table',
      action: action.map((r) => ({ ...r })),
      goto: gotoT.map((r) => ({ ...r })),
      rows: 0,
      focus: 0,
    },
    method === 'lr0'
      ? 'Now the table. An arrow on a terminal is a shift, an arrow on a variable is a GOTO entry, and a complete item A → α• reduces, in LR(0) under every terminal.'
      : 'Now the table. An arrow on a terminal is a shift, an arrow on a variable is a GOTO entry, and a complete item A → α• reduces, in SLR(1) only under the terminals in FOLLOW(A).',
    ['load.table'],
    2,
  );
  for (let i = 0; i < sets.length; i++) {
    const row = action[i]!;
    const add = (a: Sym, act: Act) => {
      row[a] = [...(row[a] ?? []), act];
    };
    for (const e of edges.filter((x) => x.from === i)) {
      if (isVariable(e.sym)) gotoT[i]![e.sym] = e.to;
      else add(e.sym, { kind: 'shift', to: e.to });
    }
    const reduces: string[] = [];
    for (const it of sets[i]!) {
      const r = R[it.rule]!;
      if (it.dot < r.rhs.length) continue;
      if (it.rule === 0) {
        add(END, { kind: 'accept' });
        continue;
      }
      const cols = method === 'lr0' ? terms : (s.follow[r.lhs] ?? []);
      cols.forEach((a) => add(a, { kind: 'reduce', rule: it.rule }));
      reduces.push(
        `${itemText(R, it)} reduces by rule ${it.rule}${method === 'slr1' ? ` under FOLLOW(${r.lhs}) = ${setText(cols)}` : ''}`,
      );
    }
    const fresh: Conflict[] = [];
    for (const [a, acts] of Object.entries(row)) {
      if (acts.length < 2) continue;
      fresh.push({
        state: i,
        sym: a,
        kind: acts.some((x) => x.kind === 'shift') ? 'shift-reduce' : 'reduce-reduce',
      });
    }
    conflicts.push(...fresh);
    const shifts = edges.filter((x) => x.from === i && !isVariable(x.sym)).length;
    const parts = [
      shifts ? plural(shifts, 'shift') : '',
      Object.keys(gotoT[i]!).length
        ? plural(Object.keys(gotoT[i]!).length, 'GOTO entry', 'GOTO entries')
        : '',
      reduces.length ? reduces.join('; ') : '',
      row[END]?.some((x) => x.kind === 'accept')
        ? `accept under $ (${itemText(R, { rule: 0, dot: 1 })})`
        : '',
    ].filter(Boolean);
    const conflictSay = fresh.length
      ? ` Conflict${fresh.length === 1 ? '' : 's'}: ${fresh.map((c) => `${c.kind} under ${c.sym}`).join(', ')}.`
      : '';
    yield step(
      {
        action: action.map((r) => ({ ...r })),
        goto: gotoT.map((r) => ({ ...r })),
        rows: i + 1,
        conflicts: [...conflicts],
        focus: i,
      },
      `Row ${i}: ${parts.length ? list(parts) : 'nothing at all'}.${conflictSay}`,
      [reduces.length ? 'load.reduce' : 'load.shift'],
      2,
      [
        ...Object.keys(row).map((a) =>
          mark(actionId(i, a), fresh.some((c) => c.sym === a) ? 'error' : 'new'),
        ),
        ...Object.keys(gotoT[i]!).map((A) => mark(gotoId(i, A), 'new')),
      ],
    );
  }
  const name = method === 'lr0' ? 'LR(0)' : 'SLR(1)';
  yield step(
    { phase: 'ready', focus: 0 },
    conflicts.length
      ? `The grammar is not ${name}: ${plural(conflicts.length, 'cell')} with two actions (${list([...new Set(conflicts.map((c) => c.kind))])}).${method === 'lr0' ? ' SLR(1), in Options, reduces only where FOLLOW allows and may remove them.' : ''}`
      : `No cell has two actions: the grammar is ${name}. Type a word and press Parse.`,
    [conflicts.length ? 'load.conflict' : 'load.done'],
    1,
    conflicts.map((c) => mark(actionId(c.state, c.sym), 'error')),
  );
  return s;
}

export function build(g: Grammar, method: Method): S {
  const gen = construction(g, method);
  for (let r = gen.next(); ; r = gen.next()) if (r.done) return r.value;
}

export function init(settings: Lr0Settings = defaults): S {
  return build(parseGrammar(START) as Grammar, settings.method === 'slr1' ? 'slr1' : 'lr0');
}

function refuse(s: S, say: string, line: string): LStep {
  return {
    state: s,
    marks: [mark('rn-title', 'error')],
    say,
    lines: [line],
    vars: vars(s),
    level: 1,
  };
}

const load: Op = {
  label: 'Load',
  arity: 1,
  *run(s, [arg], { settings }) {
    const text = String(arg ?? '').trim();
    if (!looksLikeGrammar(text)) {
      yield refuse(
        s,
        `"${text}" is not a grammar. Load takes rules such as S -> (L) | x; to parse a word, press Parse.`,
        'load.aug',
      );
      return s;
    }
    const g = parseGrammar(text);
    if (g instanceof Error) {
      yield refuse(s, `Nothing loaded. ${g.message}`, 'load.aug');
      return s;
    }
    if (g.terminals.includes(END)) {
      yield refuse(
        s,
        'Nothing loaded. $ marks the end of the input here, so it cannot be a terminal.',
        'load.aug',
      );
      return s;
    }
    const done = build(g, settings.method);
    if (done.sets.length >= MAX_STATES) {
      yield refuse(
        s,
        `That grammar needs more than ${MAX_STATES - 1} states, too many to draw. Try a smaller one.`,
        'load.aug',
      );
      return s;
    }
    let end = s;
    for (const e of construction(g, settings.method)) {
      end = e.state;
      yield { ...e, vars: vars(e.state) };
    }
    return end;
  },
};

interface Move {
  kind: 'shift' | 'reduce' | 'accept' | 'error';
  run: ParseRun;
  act?: Act;
  /** For a reduce: the states popped and the state uncovered. */
  under?: number;
}

export function simulate(s: S, w: Sym[]): Move[] {
  const input = [...w, END];
  let states = [0];
  let syms: Sym[] = [];
  let pos = 0;
  let moves = 0;
  const out: Move[] = [];
  const snap = (verdict: ParseRun['verdict'] = null): ParseRun => ({
    word: w,
    states: [...states],
    syms: [...syms],
    pos,
    moves,
    verdict,
    longest: 0,
  });
  for (;;) {
    const top = states.at(-1)!;
    const a = input[pos]!;
    const acts = s.action[top]?.[a] ?? [];
    const act = acts[0];
    if (!act || moves >= CAP) {
      out.push({ kind: 'error', run: snap('reject') });
      break;
    }
    if (act.kind === 'accept') {
      out.push({ kind: 'accept', run: snap('accept'), act });
      break;
    }
    if (act.kind === 'shift') {
      states = [...states, act.to];
      syms = [...syms, a];
      pos++;
      moves++;
      out.push({ kind: 'shift', run: snap(), act });
      continue;
    }
    const r = s.rules[act.rule]!;
    const n = r.rhs.length;
    states = states.slice(0, states.length - n);
    syms = syms.slice(0, syms.length - n);
    const under = states.at(-1)!;
    const to = s.goto[under]?.[r.lhs];
    if (to === undefined) {
      out.push({ kind: 'error', run: snap('reject') });
      break;
    }
    states = [...states, to];
    syms = [...syms, r.lhs];
    moves++;
    out.push({ kind: 'reduce', run: snap(), act, under });
  }
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
    if (s.conflicts.length) {
      const state = { ...s, run: null };
      yield {
        state,
        marks: s.conflicts.map((c) => mark(actionId(c.state, c.sym), 'error')),
        say: `The table has ${plural(s.conflicts.length, 'conflict')}, so the parser cannot always choose between shifting and reducing.${settings.method === 'lr0' ? ' Try SLR(1) in Options, then Load the grammar again.' : ''}`,
        lines: ['parse.init'],
        vars: vars(state),
        level: 1,
      } satisfies LStep;
      return state;
    }
    const moves = simulate(s, w);
    const longest = Math.max(1, ...moves.map((m) => m.run.states.length));
    let state: S = {
      ...s,
      run: { word: w, states: [0], syms: [], pos: 0, moves: 0, verdict: null, longest },
    };
    const shown = w.length ? w.join('') : 'ε';
    yield {
      state,
      marks: [mark(stackId(0), 'active'), mark('in-0', 'active')],
      say: `Parse ${shown}$. The stack starts with state 0. At each move, the state on top and the next symbol pick an action from the table.`,
      lines: ['parse.init'],
      vars: vars(state),
      level: 2,
    } satisfies LStep;
    for (const m of moves) {
      const run = { ...m.run, longest };
      state = { ...s, run };
      const top = run.states.length - 1;
      if (m.kind === 'shift') {
        const a = run.syms.at(-1)!;
        const from = run.states.at(-2)!;
        yield {
          state,
          marks: [
            mark(actionId(from, a), 'active'),
            mark(stackId(top), 'new'),
            mark(`in-${run.pos - 1}`, 'done'),
          ],
          say: `ACTION[${from}, ${a}] = s${run.states.at(-1)}: shift ${a} and go to state ${run.states.at(-1)}.`,
          lines: ['parse.loop', 'parse.shift'],
          vars: vars(state),
          level: 2,
        } satisfies LStep;
      } else if (m.kind === 'reduce') {
        const act = m.act as { kind: 'reduce'; rule: number };
        const r = s.rules[act.rule]!;
        const prev = moves[moves.indexOf(m) - 1]?.run.states.at(-1) ?? 0;
        yield {
          state,
          marks: [
            mark(actionId(prev, [...w, END][run.pos]!), 'active'),
            mark(ruleNumId(act.rule), 'active'),
            mark(gotoId(m.under!, r.lhs), 'active'),
            mark(stackId(top), 'new'),
          ],
          say: `ACTION[${prev}, ${[...w, END][run.pos]}] = r${act.rule}: reduce by ${ruleText(r)}. Pop ${plural(r.rhs.length, 'state')}${r.rhs.length ? ` (for ${formText(r.rhs)})` : ''}, uncovering state ${m.under}; GOTO[${m.under}, ${r.lhs}] = ${run.states.at(-1)}.`,
          lines: ['parse.loop', 'parse.reduce'],
          vars: vars(state),
          level: 2,
        } satisfies LStep;
      } else {
        const accept = m.kind === 'accept';
        const at = run.states.at(-1)!;
        const a = [...w, END][run.pos]!;
        yield {
          state,
          marks: accept
            ? [mark(actionId(at, END), 'found'), mark(stackId(top), 'found')]
            : [
                ...(s.action[at] ? [mark(actionId(at, a), 'error')] : []),
                mark(`in-${run.pos}`, 'error'),
              ],
          say: accept
            ? `ACTION[${at}, $] = acc: accept ${shown} after ${plural(run.moves, 'move')}. Read the reductions bottom to top and you get a rightmost derivation, backwards.`
            : `ACTION[${at}, ${a}] is empty: no way to continue with ${showSym(a)} next. Reject ${shown} after ${plural(run.moves, 'move')}.`,
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

export function pseudocode(settings: Lr0Settings = defaults): PseudoBlock[] {
  return [
    {
      op: 'parse',
      lines: [
        L(
          'parse.init',
          0,
          'push state 0; a = first symbol of w$',
          'Start with state 0 on the stack.',
        ),
        L(
          'parse.loop',
          1,
          'repeat: s = top state; act = ACTION[s, a]',
          'Look up the top state and the next symbol.',
        ),
        L(
          'parse.shift',
          2,
          'if act = shift t: push a, t; a = next symbol',
          'Shift: push the symbol and the new state, read on.',
        ),
        L(
          'parse.reduce',
          2,
          'if act = reduce A → β: pop |β| states; push A, GOTO[top, A]',
          'Reduce: pop the right side, then follow GOTO on its left side.',
        ),
        L('parse.accept', 2, 'if act = accept: accept', 'Accept.'),
        L('parse.error', 2, 'if act is empty: error (reject)', 'An empty cell is a syntax error.'),
      ],
    },
    {
      op: 'load',
      lines: [
        L(
          'load.aug',
          1,
          "add S' → S; I₀ = closure({ S' → •S })",
          'Add a new start rule and begin with its item.',
        ),
        L(
          'load.closure',
          1,
          'closure: for A → α•Bβ, add B → •γ for every rule of B',
          'A dot before a variable brings in that variable’s rules.',
        ),
        L(
          'load.goto',
          1,
          'for each set I and symbol X after a dot: goto(I, X) = closure(dot moved past X)',
          'Follow every symbol after a dot to a set, new or old.',
        ),
        L('load.table', 1, 'for each state i:', 'Fill the table one state at a time:'),
        L(
          'load.shift',
          2,
          'goto(Iᵢ, a) = Iⱼ: ACTION[i, a] = shift j; goto(Iᵢ, A) = Iⱼ: GOTO[i, A] = j',
          'arrows on terminals shift, arrows on variables go in GOTO;',
        ),
        L(
          'load.reduce',
          2,
          settings.method === 'slr1'
            ? 'A → α• in Iᵢ: ACTION[i, a] = reduce A → α for each a ∈ FOLLOW(A)'
            : 'A → α• in Iᵢ: ACTION[i, a] = reduce A → α for every terminal a and $',
          settings.method === 'slr1'
            ? 'a complete item reduces under what can follow its variable (SLR(1)).'
            : 'a complete item reduces whatever comes next (LR(0)).',
        ),
        L(
          'load.conflict',
          1,
          'a cell with two actions: a conflict',
          'Two actions in a cell is a conflict.',
        ),
        L(
          'load.done',
          1,
          'no conflicts: the parser is deterministic',
          'Otherwise the parser never has to guess.',
        ),
      ],
    },
  ];
}

export function initialSay(): string {
  return 'A small expression grammar with its LR(0) automaton and table already built. Type a word such as (a+a)+a and press Parse, or Load a grammar to watch the item sets and the table being built.';
}

export function describe(s: S): string {
  const parts = [`Grammar: ${formatGrammar(makeGrammar(s.grammar.start, s.grammar.rules))}.`];
  if (s.sets.length) parts.push(`${s.sets.length} states.`);
  if (s.phase === 'ready')
    parts.push(s.conflicts.length ? `${s.conflicts.length} conflicts.` : 'No conflicts.');
  const r = s.run;
  if (r) {
    const stack = r.states.map((q, k) => (k ? `${r.syms[k - 1]} ${q}` : `${q}`)).join(' ');
    parts.push(
      `Parsing: stack ${stack}, input left ${[...r.word, END].slice(r.pos).join('')}, ${r.moves} moves.${r.verdict === 'accept' ? ' Accepted.' : r.verdict ? ' Rejected.' : ''}`,
    );
  }
  return parts.join(' ');
}
