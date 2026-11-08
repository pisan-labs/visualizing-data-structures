/**
 * CFG to Chomsky normal form, in the textbook order: a new start variable (START), no ε-rules
 * from the set of nullable variables (DEL), no unit rules from the unit pairs (UNIT), a variable
 * for each terminal in a long right side (TERM), and long right sides broken into pairs (BIN).
 * Sipser does BIN before TERM; the setting `order` picks either.
 *
 * The conversion is one deterministic algorithm on a list of rules, the same in the code tabs:
 *
 *   START  insert S₀ → S at the front.
 *   DEL    N = the nullable variables, to a fixed point. Walk the list; after each rule insert
 *          every variant with some nullable occurrences left out (mask 1, 2, … over the
 *          occurrences, left to right), unless it is empty, is A → A, or is already in the list.
 *          Then drop every ε-rule and every A → A, and append S₀ → ε if S₀ ∈ N.
 *   UNIT   for each left side A (in order of first appearance), the variables reachable by
 *          unit rules, breadth first: A's unit pairs. The new list: for each A, for each B it
 *          reaches, B's rules that are not unit rules, as A's (no duplicates).
 *   TERM   each terminal in a right side of two or more symbols, in order of first appearance,
 *          gets a fresh variable U₁, U₂, … → a, and takes its place in those right sides; the
 *          rules U → a go at the end.
 *   BIN    A → X₁X₂…Xₖ (k ≥ 3) becomes A → X₁A₁, A₁ → X₂A₂, …, in its place, with fresh names
 *          made from A's letter.
 *
 * Derive then reads a parse tree off CYK (the kit's) and replays it as a leftmost derivation,
 * which in Chomsky normal form always takes 2n − 1 steps for a word of n symbols.
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
  cyk,
  cykTree,
  formText,
  formatGrammar,
  isVariable,
  makeGrammar,
  parseGrammar,
  parseWord,
  ruleText,
  subscript,
  type Grammar,
  type Rule,
  type Sym,
} from '../_grammar/grammar';

export type Order = 'term-first' | 'bin-first';
export type Phase = 'typed' | 'start' | 'del' | 'unit' | 'term' | 'bin' | 'done';

export interface CnfSettings {
  [key: string]: Scalar;
  /** TERM then BIN (Hopcroft, Motwani and Ullman; Wikipedia), or BIN then TERM (Sipser). */
  order: Order;
}

export interface Derivation {
  word: Sym[];
  /** The sentential forms so far, the start variable first. Empty when the word is not derived. */
  forms: Sym[][];
  /** The rule used for each step so far. */
  used: Rule[];
  ok: boolean;
}

export interface CnfState {
  /** The grammar as typed. */
  typed: Grammar;
  start: Sym;
  rules: Rule[];
  phase: Phase;
  /** Nullable variables, in the order found. */
  nullable: Sym[];
  /** Unit pairs (A, B): A derives B by unit rules alone. */
  pairs: [Sym, Sym][];
  /** Terminal and the variable that stands for it. */
  terms: [Sym, Sym][];
  derivation: Derivation | null;
}

export interface CnfExtra {
  /** Rules this step removes, drawn crossed out. */
  struck?: Rule[];
}

type S = CnfState;
type X = CnfExtra;
type Op = OpSpec<S, CnfSettings, X>;
type CStep = Step<S, X>;

export const defaults: CnfSettings = { order: 'term-first' };

export const START = 'S -> ASA | aB; A -> B | S; B -> b | eps';
export const RULES = 'r';
/** The most rules a conversion may produce and still be drawn. */
export const MAX_OUT = 48;
export const MAX_WORD = 8;

export const PHASES: Record<Order, Phase[]> = {
  'term-first': ['start', 'del', 'unit', 'term', 'bin'],
  'bin-first': ['start', 'del', 'unit', 'bin', 'term'],
};

export const PHASE_NAME: Record<Phase, string> = {
  typed: 'as typed',
  start: 'START',
  del: 'DEL',
  unit: 'UNIT',
  term: 'TERM',
  bin: 'BIN',
  done: 'done',
};

export function fresh(g: Grammar): S {
  return {
    typed: g,
    start: g.start,
    rules: g.rules.map((r) => ({ lhs: r.lhs, rhs: [...r.rhs] })),
    phase: 'typed',
    nullable: [],
    pairs: [],
    terms: [],
    derivation: null,
  };
}

export function init(): S {
  return fresh(parseGrammar(START) as Grammar);
}

const mark = (id: string, role: MarkRole): Mark => ({ id, role });
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const list = (xs: readonly string[]) =>
  xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`;
/** A set in narration, spaced so it never reads as a template: "{ A, B }". */
export const setText = (xs: readonly string[]) => (xs.length ? `{ ${xs.join(', ')} }` : '∅');
export const pairText = ([a, b]: readonly [Sym, Sym]) => `(${a}, ${b})`;
export const looksLikeGrammar = (t: string) => /->|→/.test(t);

export const key = (r: Rule) => `${r.lhs}>${r.rhs.join(' ')}`;
const same = (a: Rule, b: Rule) => key(a) === key(b);
const isUnit = (r: Rule) => r.rhs.length === 1 && isVariable(r.rhs[0]!);
const rid = (r: Rule) => ruleShapeId(RULES, r);

/** The grammar on show. */
export const grammarOf = (s: S): Grammar => makeGrammar(s.start, s.rules);

export function vars(s: S): Record<string, Scalar> {
  const g = grammarOf(s);
  const out: Record<string, Scalar> = {
    stage: PHASE_NAME[s.phase],
    rules: s.rules.length,
    variables: g.variables.filter((v) => s.rules.some((r) => r.lhs === v)).length,
  };
  if (s.phase !== 'typed') {
    out.nullable = s.nullable.length;
    out['unit pairs'] = s.pairs.length;
  }
  if (s.derivation?.ok) out['derivation steps'] = s.derivation.used.length;
  return out;
}

/** A variable name not in use: `letter` with the next free subscript from `from`. */
function freshName(used: Set<Sym>, letter: string, from: number): Sym {
  for (let k = from; ; k++) {
    const name = `${letter}${subscript(k)}`;
    if (!used.has(name)) {
      used.add(name);
      return name;
    }
  }
}

/** Left sides in order of first appearance. */
const lhsOrder = (rules: readonly Rule[]) => [...new Set(rules.map((r) => r.lhs))];

type Event = Omit<CStep, 'vars'>;

/**
 * The conversion, step by step. Each yielded step carries the state after it. Returns the
 * finished state.
 */
export function* conversion(g: Grammar, order: Order): Generator<Event, S, void> {
  const used = new Set<Sym>(g.variables);
  let s: S = { ...fresh(g), derivation: null };
  const step = (
    patch: Partial<S>,
    say: string,
    lines: string[],
    level: 1 | 2 | 3,
    marks: Mark[] = [],
    struck?: Rule[],
  ): Event => {
    s = { ...s, ...patch };
    return { state: s, marks, say, lines, level, extra: struck?.length ? { struck } : undefined };
  };

  // START
  const s0 = freshName(used, g.start[0]!, 0);
  const startRule: Rule = { lhs: s0, rhs: [g.start] };
  yield step(
    { phase: 'start', start: s0, rules: [startRule, ...s.rules] },
    `START: add ${ruleText(startRule)}. Now the start variable is on no right side, so later stages can never put it there.`,
    ['conv.start'],
    2,
    [mark(rid(startRule), 'new'), mark('phase-start', 'active')],
  );

  // DEL: the nullable set, to a fixed point.
  const nullable: Sym[] = [];
  yield step(
    { phase: 'del' },
    'DEL: first find the nullable variables, the ones that can derive ε. Start with the rules A → ε, then keep adding A whenever a right side of A is all nullable variables.',
    ['conv.null'],
    3,
    [mark('phase-del', 'active')],
  );
  for (let changed = true; changed;) {
    changed = false;
    for (const r of s.rules) {
      if (nullable.includes(r.lhs) || !r.rhs.every((x) => nullable.includes(x))) continue;
      nullable.push(r.lhs);
      changed = true;
      const why = r.rhs.length
        ? `every symbol of ${formText(r.rhs)} is nullable`
        : `${ruleText(r)} is a rule`;
      yield step({ nullable: [...nullable] }, `${r.lhs} is nullable: ${why}.`, ['conv.null'], 3, [
        mark(rid(r), 'active'),
        mark(`null-${r.lhs}`, 'new'),
      ]);
    }
  }
  yield step(
    { nullable: [...nullable] },
    nullable.length
      ? `Nothing more changes, so the nullable set is ${setText(nullable)}. Next, every rule gets copies with nullable variables left out.`
      : 'No variable is nullable: there is no ε-rule to remove.',
    ['conv.null'],
    2,
    nullable.map((v) => mark(`null-${v}`, 'found')),
  );
  if (nullable.length) {
    const rules = [...s.rules];
    for (let i = 0; i < rules.length; i++) {
      const r = rules[i]!;
      const at = r.rhs.flatMap((x, k) => (nullable.includes(x) ? [k] : []));
      const added: Rule[] = [];
      let self: Rule | null = null;
      for (let mask = 1; mask < 1 << at.length; mask++) {
        const drop = new Set(at.filter((_, j) => mask & (1 << j)));
        const rhs = r.rhs.filter((_, k) => !drop.has(k));
        const v: Rule = { lhs: r.lhs, rhs };
        if (!rhs.length) continue;
        if (rhs.length === 1 && rhs[0] === r.lhs) {
          self = v;
          continue;
        }
        if (rules.some((x) => same(x, v))) continue;
        rules.splice(i + 1 + added.length, 0, v);
        added.push(v);
      }
      if (!added.length && !self) continue;
      const which = list([...new Set(at.map((k) => r.rhs[k]!))]);
      const selfNote = self
        ? ` ${added.length ? 'One choice gives' : 'The only new rule would be'} ${ruleText(self)}, a unit rule A → A that says nothing, so it is dropped.`
        : '';
      yield step(
        { rules: [...rules] },
        `${ruleText(r)} has nullable ${which}.${added.length ? ` Leave out each choice of them: add ${list(added.map(ruleText))}.` : ''}${selfNote}`,
        ['conv.del'],
        2,
        [mark(rid(r), 'active'), ...added.map((x) => mark(rid(x), 'new'))],
      );
      i += added.length;
    }
    const gone = rules.filter((r) => !r.rhs.length || (r.rhs.length === 1 && r.rhs[0] === r.lhs));
    const kept = rules.filter((r) => !gone.some((x) => same(x, r)));
    const keepEps = nullable.includes(s0);
    const epsRule: Rule = { lhs: s0, rhs: [] };
    if (keepEps) kept.push(epsRule);
    const struck = gone.filter((r) => !(keepEps && same(r, epsRule)));
    yield step(
      { rules: kept },
      `Now drop the ε-rules${gone.some((r) => r.rhs.length) ? ' (and A → A, which says nothing)' : ''}: ${list(gone.map(ruleText))}.${keepEps ? ` ${s0} is nullable, so ε is in the language: keep ${s0} → ε, the one ε-rule CNF allows.` : ''}`,
      ['conv.delEps'],
      2,
      [
        ...struck.map((r) => mark(rid(r), 'remove')),
        ...(keepEps ? [mark(rid(epsRule), 'new')] : []),
      ],
      struck,
    );
  }

  // UNIT: unit pairs, then the rules they bring.
  const order0 = lhsOrder(s.rules);
  yield step(
    { phase: 'unit', pairs: order0.map((v) => [v, v] as [Sym, Sym]) },
    'UNIT: a unit rule A → B only renames. Find the unit pairs (A, B), where A becomes B by unit rules alone. Every (A, A) is one.',
    ['conv.pairs'],
    3,
    [mark('phase-unit', 'active'), ...order0.map((v) => mark(`pair-${v}-${v}`, 'new'))],
  );
  const reach = new Map<Sym, Sym[]>();
  const pairs: [Sym, Sym][] = order0.map((v) => [v, v]);
  for (const A of order0) {
    const seen = [A];
    for (let k = 0; k < seen.length; k++) {
      const B = seen[k]!;
      for (const r of s.rules) {
        if (r.lhs !== B || !isUnit(r) || seen.includes(r.rhs[0]!)) continue;
        const C = r.rhs[0]!;
        seen.push(C);
        pairs.push([A, C]);
        yield step(
          { pairs: [...pairs] },
          `(${A}, ${B}) is a unit pair and ${ruleText(r)} is a unit rule, so (${A}, ${C}) is one too.`,
          ['conv.pairs'],
          3,
          [mark(rid(r), 'active'), mark(`pair-${A}-${C}`, 'new')],
        );
      }
    }
    reach.set(A, seen);
  }
  const units = s.rules.filter(isUnit);
  yield step(
    { pairs: [...pairs] },
    units.length
      ? `The unit pairs are ${list(pairs.filter(([a, b]) => a !== b).map(pairText))}, besides each (A, A). For each (A, B), A gets every rule of B that is not a unit rule.`
      : 'There are no unit rules, so the only unit pairs are the (A, A): nothing to do.',
    ['conv.pairs'],
    2,
    pairs.filter(([a, b]) => a !== b).map(([a, b]) => mark(`pair-${a}-${b}`, 'found')),
  );
  if (units.length) {
    const out: Rule[] = [];
    const shown = [...s.rules];
    for (const A of order0) {
      const added: Rule[] = [];
      for (const B of reach.get(A)!) {
        for (const r of s.rules) {
          if (r.lhs !== B || isUnit(r)) continue;
          const v: Rule = { lhs: A, rhs: [...r.rhs] };
          if (out.some((x) => same(x, v))) continue;
          out.push(v);
          if (B !== A && !shown.some((x) => same(x, v))) added.push(v);
        }
      }
      if (!added.length) continue;
      const from = reach.get(A)!.filter((B) => B !== A);
      // Shown after A's last rule, so the panel keeps its order until the unit rules go.
      const last = shown.map((x) => x.lhs).lastIndexOf(A);
      shown.splice(last + 1, 0, ...added);
      yield step(
        { rules: [...shown] },
        `${A} reaches ${list(from)} by unit rules, so ${A} takes their other rules: ${list(added.map(ruleText))}.`,
        ['conv.unit'],
        2,
        added.map((x) => mark(rid(x), 'new')),
      );
    }
    const struck = shown.filter(isUnit);
    yield step(
      { rules: out },
      `Every rule a unit rule led to is now direct, so drop the unit rules: ${list(struck.map(ruleText))}.`,
      ['conv.unitDrop'],
      2,
      struck.map((r) => mark(rid(r), 'remove')),
      struck,
    );
  }

  // TERM and BIN, in the order the setting picks.
  for (const phase of PHASES[order].slice(3)) {
    if (phase === 'term') yield* term();
    else yield* bin();
  }

  function* term(): Generator<Event, void, void> {
    const firstLong = s.rules.find((r) => r.rhs.length >= 2 && r.rhs.some((x) => !isVariable(x)));
    yield step(
      { phase: 'term' },
      firstLong
        ? 'TERM: in CNF a terminal stands alone. Each terminal in a right side of two or more symbols gets a variable of its own.'
        : 'TERM: no right side of two or more symbols has a terminal in it. Nothing to do.',
      ['conv.term'],
      firstLong ? 3 : 2,
      [mark('phase-term', 'active')],
    );
    const terms: [Sym, Sym][] = [];
    for (;;) {
      const a = s.rules
        .filter((r) => r.rhs.length >= 2)
        .flatMap((r) => r.rhs)
        .find((x) => !isVariable(x));
      if (a === undefined) break;
      const U = freshName(used, 'U', 1);
      terms.push([a, U]);
      const struck: Rule[] = [];
      const added: Rule[] = [];
      const rules = s.rules.map((r) => {
        if (r.rhs.length < 2 || !r.rhs.includes(a)) return r;
        const y = { lhs: r.lhs, rhs: r.rhs.map((x) => (x === a ? U : x)) };
        struck.push(r);
        added.push(y);
        return y;
      });
      const uRule: Rule = { lhs: U, rhs: [a] };
      rules.push(uRule);
      yield step(
        { rules, terms: [...terms] },
        `Add ${ruleText(uRule)} and write ${U} for ${a} in ${list(struck.map(ruleText))}.`,
        ['conv.term'],
        2,
        [mark(rid(uRule), 'new'), ...added.map((x) => mark(rid(x), 'new'))],
        struck,
      );
    }
  }

  function* bin(): Generator<Event, void, void> {
    const long = s.rules.filter((r) => r.rhs.length >= 3);
    yield step(
      { phase: 'bin' },
      long.length
        ? `BIN: CNF allows two variables on the right, no more. Break each longer right side into a chain of pairs: ${plural(long.length, 'rule')} to break.`
        : 'BIN: every right side has at most two symbols. Nothing to do.',
      ['conv.bin'],
      long.length ? 3 : 2,
      [mark('phase-bin', 'active')],
    );
    for (const r of long) {
      const chain: Rule[] = [];
      let lhs = r.lhs;
      for (let i = 0; i < r.rhs.length - 2; i++) {
        const v = freshName(used, r.lhs[0]!, 1);
        chain.push({ lhs, rhs: [r.rhs[i]!, v] });
        lhs = v;
      }
      chain.push({ lhs, rhs: r.rhs.slice(-2) });
      const rules = s.rules.flatMap((x) => (same(x, r) ? chain : [x]));
      yield step(
        { rules },
        `${ruleText(r)} has ${r.rhs.length} symbols on the right. Break it into ${list(chain.map(ruleText))}: each new variable carries the rest of the right side.`,
        ['conv.bin'],
        2,
        chain.map((x) => mark(rid(x), 'new')),
        [r],
      );
    }
  }

  const final = makeGrammar(s0, s.rules);
  const eps = s.rules.some((r) => !r.rhs.length);
  yield step(
    { phase: 'done' },
    `Done: ${plural(s.rules.length, 'rule')}, every one A → BC or A → a${eps ? `, plus ${s0} → ε for the empty word` : ''}. ${plural(final.variables.length, 'variable')} in all. This grammar is ready for CYK, which needs exactly this form.`,
    ['conv.done'],
    1,
    [mark(`${RULES}-title`, 'found'), mark('phase-done', 'found')],
  );
  return s;
}

/** The finished conversion, without the steps. */
export function convert(g: Grammar, order: Order): S {
  const gen = conversion(g, order);
  for (let r = gen.next(); ; r = gen.next()) if (r.done) return r.value;
}

function refuse(s: S, say: string, line: string): CStep {
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
  label: 'Convert',
  arity: 1,
  *run(s, [arg], { settings }) {
    const text = String(arg ?? '').trim();
    if (!looksLikeGrammar(text)) {
      yield refuse(
        s,
        `"${text}" is not a grammar. Convert takes rules such as S -> aSb | eps; to derive a word, press Derive.`,
        'conv.start',
      );
      return s;
    }
    const g = parseGrammar(text);
    if (g instanceof Error) {
      yield refuse(s, `Nothing converted. ${g.message}`, 'conv.start');
      return s;
    }
    const done = convert(g, settings.order);
    if (done.rules.length > MAX_OUT) {
      yield refuse(
        s,
        `That grammar turns into ${done.rules.length} rules in CNF, too many to draw. Try one with fewer nullable variables.`,
        'conv.start',
      );
      return s;
    }
    const first = fresh(g);
    yield {
      state: first,
      marks: [mark(`${RULES}-title`, 'active')],
      say: `The grammar as typed: ${plural(g.rules.length, 'rule')}. Five stages turn it into Chomsky normal form: ${PHASES[settings.order].map((p) => PHASE_NAME[p]).join(', ')}.`,
      lines: ['conv.start'],
      vars: vars(first),
      level: 2,
    } satisfies CStep;
    let end = first;
    for (const e of conversion(g, settings.order)) {
      end = e.state;
      yield { ...e, vars: vars(e.state) };
    }
    return end;
  },
};

const show: Op = {
  label: 'Load',
  arity: 1,
  *run(s, [arg]) {
    const text = String(arg ?? '').trim();
    const g = looksLikeGrammar(text)
      ? parseGrammar(text)
      : new Error(`"${text}" is not a grammar.`);
    if (g instanceof Error) {
      yield refuse(s, `Nothing loaded. ${g.message}`, 'conv.start');
      return s;
    }
    const state = fresh(g);
    yield {
      state,
      marks: [mark(`${RULES}-title`, 'new')],
      say: `Loaded ${plural(g.rules.length, 'rule')}, as typed. Press Convert with the same rules to watch the five stages.`,
      lines: ['conv.start'],
      vars: vars(state),
      level: 1,
    } satisfies CStep;
    return state;
  },
};

/** Leftmost derivation from a parse tree: forms and the rule used at each step. */
function leftmost(g: Grammar, w: Sym[]): { forms: Sym[][]; used: Rule[] } | null {
  const res = cyk(g, w);
  const tree = cykTree(g, res, w);
  if (!tree) return null;
  let form: number[] = [0];
  const forms: Sym[][] = [[g.start]];
  const used: Rule[] = [];
  const symOf = (id: number) => tree[id]!.sym;
  for (;;) {
    const at = form.findIndex((id) => tree[id]!.kids.length > 0);
    if (at < 0) break;
    const node = tree[form[at]!]!;
    const kids = node.kids.filter((k) => symOf(k) !== EPS);
    used.push({ lhs: node.sym, rhs: kids.map(symOf) });
    form = [...form.slice(0, at), ...kids, ...form.slice(at + 1)];
    forms.push(form.map(symOf));
  }
  return { forms, used };
}

const derive: Op = {
  label: 'Derive',
  arity: 1,
  *run(s0, [arg], { settings }) {
    const text = String(arg ?? '').trim();
    if (looksLikeGrammar(text)) {
      yield refuse(s0, 'That looks like a grammar. Press Convert to use it.', 'der.cyk');
      return s0;
    }
    const w = parseWord(text, s0.typed, MAX_WORD);
    if (w instanceof Error) {
      yield refuse(s0, `Nothing derived. ${w.message}`, 'der.cyk');
      return s0;
    }
    const base: S = s0.phase === 'done' ? s0 : convert(s0.typed, settings.order);
    const g = grammarOf(base);
    const d = leftmost(g, w);
    const shown = w.length ? w.join('') : 'ε';
    if (!d) {
      const state: S = { ...base, derivation: { word: w, forms: [], used: [], ok: false } };
      yield {
        state,
        marks: [mark(`${RULES}-title`, 'error')],
        say: `CYK finds no parse tree: the grammar does not generate ${shown}, in CNF or as typed. The conversion keeps the language the same.`,
        lines: ['der.cyk'],
        vars: vars(state),
        level: 1,
      } satisfies CStep;
      return state;
    }
    let state: S = { ...base, derivation: { word: w, forms: [d.forms[0]!], used: [], ok: true } };
    yield {
      state,
      marks: [mark('der-0', 'active')],
      say: `Derive ${shown} in the grammar in CNF. CYK finds a parse tree; replaying it, always expanding the leftmost variable, gives a leftmost derivation.`,
      lines: ['der.cyk'],
      vars: vars(state),
      level: 2,
    } satisfies CStep;
    const n = w.length;
    for (let k = 0; k < d.used.length; k++) {
      const r = d.used[k]!;
      const last = k === d.used.length - 1;
      state = {
        ...state,
        derivation: {
          word: w,
          forms: d.forms.slice(0, k + 2),
          used: d.used.slice(0, k + 1),
          ok: true,
        },
      };
      const kind = r.rhs.length === 2 ? 'two variables' : r.rhs.length === 1 ? 'one terminal' : 'ε';
      const say = last
        ? n
          ? `${ruleText(r)} finishes ${shown} in ${plural(k + 1, 'step')}: ${n - 1} with A → BC, each adding a symbol to the form, and ${n} with A → a, each turning a variable into a letter. In CNF it is always 2n − 1.`
          : `${ruleText(r)}: the empty word takes the one step ${base.start} → ε.`
        : `Step ${k + 1}: ${ruleText(r)}, ${kind} on the right.`;
      yield {
        state,
        marks: [mark(rid(r), 'active'), mark(`der-${k + 1}`, last ? 'found' : 'active')],
        say,
        lines: [last ? 'der.done' : 'der.step'],
        vars: vars(state),
        level: last ? 1 : 2,
      } satisfies CStep;
    }
    return state;
  },
};

export const ops = { load, derive, show };

const L = (id: string, indent: number, text: string, plain: string): PseudoLine => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: CnfSettings = defaults): PseudoBlock[] {
  const term = L(
    'conv.term',
    1,
    'for each terminal a in a right side of length ≥ 2: add U → a; write U for a there',
    'TERM: give each terminal in a long right side a variable of its own.',
  );
  const bin = L(
    'conv.bin',
    1,
    'for each A → X₁X₂…Xₖ, k ≥ 3: A → X₁A₁, A₁ → X₂A₂, …, Aₖ₋₂ → Xₖ₋₁Xₖ',
    'BIN: break each right side of three or more symbols into a chain of pairs.',
  );
  const last = settings.order === 'bin-first' ? [bin, term] : [term, bin];
  return [
    {
      op: 'load',
      lines: [
        L(
          'conv.start',
          1,
          'add S₀ → S',
          'START: add a new start variable that no rule leads back to.',
        ),
        L(
          'conv.null',
          1,
          'N = { A : A → ε }; repeat: add A if A → X₁…Xₖ with every Xᵢ ∈ N',
          'DEL: find the nullable variables, the ones that can derive ε.',
        ),
        L(
          'conv.del',
          1,
          'for each A → α: add each α with some nullable symbols left out (never ε or A → A)',
          'Copy every rule with nullable variables left out, in every combination.',
        ),
        L(
          'conv.delEps',
          1,
          'remove every A → ε; if S₀ ∈ N: add S₀ → ε',
          'Drop the ε-rules; keep S₀ → ε if the language has the empty word.',
        ),
        L(
          'conv.pairs',
          1,
          'unit pairs: (A, A); (A, C) if (A, B) is one and B → C',
          'UNIT: find which variables each variable becomes by unit rules alone.',
        ),
        L(
          'conv.unit',
          1,
          'for each unit pair (A, B), each B → α not a unit rule: add A → α',
          'Give each variable the other rules of the variables it becomes.',
        ),
        L('conv.unitDrop', 1, 'remove every A → B', 'Drop the unit rules.'),
        ...last,
        L(
          'conv.done',
          1,
          'now every rule is A → BC, A → a or S₀ → ε',
          'Every rule now has two variables or one terminal on the right.',
        ),
      ],
    },
    {
      op: 'derive',
      lines: [
        L('der.cyk', 1, 'T = a parse tree of w by CYK', 'Find a parse tree for the word with CYK.'),
        L(
          'der.step',
          1,
          'repeat: replace the leftmost variable by its children in T',
          'Expand the leftmost variable, following the tree.',
        ),
        L(
          'der.done',
          1,
          'stop after 2n − 1 steps: n − 1 rules A → BC, n rules A → a',
          'A word of n symbols always takes 2n − 1 steps.',
        ),
      ],
    },
  ];
}

export function initialSay(): string {
  return 'Sipser’s grammar S → ASA | aB, A → B | S, B → b | ε has an ε-rule, unit rules, a long rule and a terminal beside a variable. Press Convert to turn it into Chomsky normal form one stage at a time, or type your own grammar.';
}

export function describe(s: S): string {
  const g = grammarOf(s);
  const where =
    s.phase === 'typed'
      ? 'Grammar as typed'
      : s.phase === 'done'
        ? 'Grammar in Chomsky normal form'
        : `Grammar during ${PHASE_NAME[s.phase]}`;
  const parts = [`${where}: ${formatGrammar(g)}.`];
  if (s.phase !== 'typed' && s.nullable.length) parts.push(`Nullable: ${s.nullable.join(' ')}.`);
  const d = s.derivation;
  if (d)
    parts.push(
      d.ok
        ? `Deriving ${formText(d.word)}: ${d.forms.map(formText).join(' ⇒ ')}.`
        : `${formText(d.word)} is not generated.`,
    );
  return parts.join(' ');
}
