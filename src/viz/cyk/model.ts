import type { Mark, MarkRole, OpSpec, PseudoBlock, Scalar, Step } from '../../engine/types';
import { ruleShapeId } from '../_grammar/draw';
import {
  EPS,
  cyk,
  cykTree,
  formatGrammar,
  parseGrammar,
  parseWord,
  ruleText,
  toCnf,
  type CnfResult,
  type CnfStage,
  type Grammar,
  type ParseTree,
  type Sym,
} from '../_grammar/grammar';

export interface CykSettings {
  [key: string]: Scalar;
  /** Load: one step per stage of the conversion to Chomsky normal form, or only the result. */
  conversion: 'stages' | 'result';
}

export interface CykState {
  /** The grammar as typed. */
  grammar: Grammar;
  cnf: CnfResult;
  /** The rules the panel shows: -1 the grammar as typed, k after stage k of the conversion. */
  shown: number;
  word: Sym[] | null;
  /** table[len - 1][i]: the variables found so far for the substring of length len at i. */
  table: (Sym[] | null)[][] | null;
  cells: number;
  splits: number;
  /** After a parse: whether the start variable is in the top cell, and a tree read back. */
  accept: boolean | null;
  tree: ParseTree | null;
}

export interface CykExtra {
  /** Draw the changes of the stage on show: removed rules crossed out. */
  diff?: boolean;
  /** The cell being filled, and the length of the left part of the split being tried. */
  cell?: { len: number; i: number; k?: number };
}

type S = CykState;
type X = CykExtra;
type Op = OpSpec<S, CykSettings, X>;
type CykStep = Step<S, X>;

export const defaults: CykSettings = { conversion: 'stages' };

export const START = 'S -> aSb | eps';
export const MAX_WORD = 8;
export const RULES = 'r';
export const TREE = 't-';

/** Shape id of the table cell for the substring of length len at i (0-based), n the word length. */
export const cellOf = (n: number, len: number, i: number) => `cell-${n - len}-${i}`;
/** Shape id of the symbol under column i. */
export const letterOf = (i: number) => `ch-1-${i}`;

function fresh(g: Grammar): S {
  const cnf = toCnf(g);
  return {
    grammar: g,
    cnf,
    shown: cnf.stages.length - 1,
    word: null,
    table: null,
    cells: 0,
    splits: 0,
    accept: null,
    tree: null,
  };
}

export function init(): S {
  return fresh(parseGrammar(START) as Grammar);
}

const mark = (id: string, role: MarkRole): Mark => ({ id, role });
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export const showWord = (w: readonly Sym[]) => (w.length ? w.join('') : `${EPS} (the empty word)`);
/** A set of variables in narration: "{ S, A }", spaced so it never reads as a template. */
export const setText = (xs: readonly Sym[]) => (xs.length ? `{ ${xs.join(', ')} }` : '∅');
const list = (xs: string[]) =>
  xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`;
export const looksLikeGrammar = (t: string) => /->|→/.test(t);

/** The grammar the panel shows. */
export const shownGrammar = (s: S): Grammar =>
  s.shown < 0 ? s.grammar : s.cnf.stages[s.shown]!.grammar;

export function vars(s: S): Record<string, Scalar> | undefined {
  if (!s.word) return undefined;
  return { n: s.word.length, 'cells filled': s.cells, 'splits tried': s.splits };
}

/** Sipser's table(i, j) for the substring of length len at i (0-based), 1-based and inclusive. */
export const cellName = (len: number, i: number) => `table(${i + 1}, ${i + len})`;

function refuse(s: S, say: string, line: string): CykStep {
  return {
    state: s,
    marks: [mark(`${RULES}-title`, 'error')],
    say,
    lines: [line],
    vars: vars(s),
    level: 1,
  };
}

/** What one stage of the conversion did, in a sentence or two. */
export function stageSay(st: CnfStage): string {
  const added = st.added.map(ruleText);
  switch (st.kind) {
    case 'start':
      return `Add a new start variable: ${added[0]}. Now the start variable never appears on a right side.`;
    case 'eps': {
      const A = st.target!.lhs;
      const what = added.length
        ? `For each ${A} on a right side, add the rule with that ${A} left out: ${list(added)}.`
        : `No rule has ${A} on its right side, so there is nothing to add.`;
      return `Remove the ε-rule ${ruleText(st.target!)}. ${what}`;
    }
    case 'unit': {
      const [A, B] = [st.target!.lhs, st.target!.rhs[0]!];
      if (A === B)
        return `Remove ${ruleText(st.target!)}: a variable that becomes itself adds nothing.`;
      const what = added.length
        ? `${A} gets ${B}'s rules instead: ${list(added)}.`
        : `${A} already has all of ${B}'s rules.`;
      return `Remove the unit rule ${ruleText(st.target!)}. ${what}`;
    }
    case 'long':
      return `${ruleText(st.target!)} has ${st.target!.rhs.length} symbols on the right, too many for CNF. Split it into a chain of two-symbol rules: ${list(added)}.`;
    case 'term':
      return `CNF allows a terminal only on its own, so in the rules with two symbols, write ${st.variable} for ${st.terminal} and add ${st.variable} → ${st.terminal}.`;
  }
}

const STAGE_LINE: Record<CnfStage['kind'], string> = {
  start: 'load.start',
  eps: 'load.eps',
  unit: 'load.unit',
  long: 'load.long',
  term: 'load.term',
};

const load: Op = {
  label: 'Load',
  arity: 1,
  *run(s, [arg], { settings }) {
    const text = String(arg ?? '').trim();
    if (!looksLikeGrammar(text)) {
      yield refuse(
        s,
        `"${text}" is not a grammar. Load takes rules such as S -> aSb | eps; to parse a word, press Parse.`,
        'load.read',
      );
      return s;
    }
    const g = parseGrammar(text);
    if (g instanceof Error) {
      yield refuse(s, `Nothing loaded. ${g.message}`, 'load.read');
      return s;
    }
    const done = fresh(g);
    const stages = done.cnf.stages;
    const cnf = done.cnf.cnf;
    const summary = `In Chomsky normal form: ${plural(cnf.rules.length, 'rule')} over ${plural(cnf.variables.length, 'variable')}, every one A → BC or A → a${cnf.rules.some((r) => !r.rhs.length) ? `, plus ${cnf.start} → ε for the empty word` : ''}. Type a word and press Parse.`;
    if (settings.conversion === 'result') {
      yield {
        state: done,
        marks: [mark(`${RULES}-title`, 'new')],
        say: `Loaded ${plural(g.rules.length, 'rule')} and converted them in ${plural(stages.length, 'stage')}. ${summary}`,
        lines: ['load.read', 'load.start', 'load.eps', 'load.unit', 'load.long', 'load.term'],
        level: 1,
      } satisfies CykStep;
      return done;
    }
    yield {
      state: { ...done, shown: -1 },
      marks: [mark(`${RULES}-title`, 'active')],
      say: `Loaded ${plural(g.rules.length, 'rule')}. CYK needs Chomsky normal form: every rule A → BC or A → a. Converting takes ${plural(stages.length, 'stage')}, following Sipser.`,
      lines: ['load.read'],
      level: 2,
    } satisfies CykStep;
    for (let k = 0; k < stages.length; k++) {
      const st = stages[k]!;
      const last = k === stages.length - 1;
      yield {
        state: { ...done, shown: k },
        marks: [
          mark(`${RULES}-title`, 'active'),
          ...st.added.map((r) => mark(ruleShapeId(RULES, r), 'new')),
        ],
        say: last ? `${stageSay(st)} ${summary}` : stageSay(st),
        lines: [STAGE_LINE[st.kind]],
        level: last ? 1 : 2,
        extra: { diff: true },
      } satisfies CykStep;
    }
    return done;
  },
};

const sub = (w: readonly Sym[], len: number, i: number) => w.slice(i, i + len).join('');

const parse: Op = {
  label: 'Parse',
  arity: 1,
  *run(s0, [arg]) {
    const text = String(arg ?? '').trim();
    // The panel shows the rules in CNF from here on.
    const s: S = { ...s0, shown: s0.cnf.stages.length - 1 };
    if (looksLikeGrammar(text)) {
      yield refuse(s0, 'That looks like a grammar. Press Load to use it.', 'parse.sig');
      return s0;
    }
    const g = s.cnf.cnf;
    const parsed = parseWord(text, s.grammar, MAX_WORD);
    if (parsed instanceof Error) {
      yield refuse(s0, `Nothing parsed. ${parsed.message}`, 'parse.sig');
      return s0;
    }
    const w = parsed;
    const n = w.length;
    const res = cyk(g, w);
    if (n === 0) {
      const epsRule = g.rules.find((r) => r.lhs === g.start && !r.rhs.length);
      const state: S = {
        ...s,
        word: w,
        table: [],
        cells: 0,
        splits: 0,
        accept: res.accept,
        tree: cykTree(g, res, w),
      };
      yield {
        state,
        marks: epsRule
          ? [mark(ruleShapeId(RULES, epsRule), 'found')]
          : [mark(`${RULES}-title`, 'error')],
        say: epsRule
          ? `The empty word has no substrings to fill a table with. ${ruleText(epsRule)} is a rule, so ε is in the language.`
          : `The empty word has no substrings to fill a table with. There is no rule ${g.start} → ε, so ε is not in the language.`,
        lines: ['parse.eps'],
        vars: vars(state),
        level: 1,
      } satisfies CykStep;
      return state;
    }

    const table: (Sym[] | null)[][] = Array.from({ length: n }, (_, l) =>
      Array<Sym[] | null>(n - l).fill(null),
    );
    let state: S = { ...s, word: w, table, cells: 0, splits: 0, accept: null, tree: null };
    const put = (len: number, i: number, vs: Sym[]) => {
      const t = state.table!.map((row) => [...row]);
      t[len - 1]![i] = vs;
      return t;
    };
    yield {
      state,
      marks: [],
      say: `Parse ${showWord(w)}. The cell in row ℓ, column i will hold every variable that derives the ℓ symbols starting at position i: Sipser's table(i, j) for the substring from i to j. Fill the bottom row first, then each row above it from the cells below.`,
      lines: ['parse.sig'],
      vars: vars(state),
      level: 2,
    } satisfies CykStep;

    // Substrings of length 1: the rules A → a.
    for (let i = 0; i < n; i++) {
      const a = w[i]!;
      const rules = g.rules.filter((r) => r.rhs.length === 1 && r.rhs[0] === a);
      const vs = res.table[0]![i]!;
      state = { ...state, table: put(1, i, vs), cells: state.cells + 1 };
      yield {
        state,
        marks: [
          mark(cellOf(n, 1, i), 'active'),
          mark(letterOf(i), 'active'),
          ...rules.map((r) => mark(ruleShapeId(RULES, r), 'found')),
        ],
        say: rules.length
          ? `w${sub1(i)} = ${a}. The rules with ${a} alone on the right are ${list(rules.map(ruleText))}, so ${cellName(1, i)} = ${setText(vs)}.`
          : `w${sub1(i)} = ${a}, and no rule has ${a} alone on the right, so ${cellName(1, i)} = ∅.`,
        lines: ['parse.one', 'parse.oneRule'],
        vars: vars(state),
        level: 2,
        extra: { cell: { len: 1, i } },
      } satisfies CykStep;
    }

    // Longer substrings, from the cells below.
    for (let len = 2; len <= n; len++) {
      for (let i = 0; i + len <= n; i++) {
        const found: Sym[] = [];
        const byWhich: string[] = [];
        for (let k = 1; k < len; k++) {
          const left = res.table[k - 1]![i]!;
          const right = res.table[len - k - 1]![i + k]!;
          const rules = g.rules.filter(
            (r) => r.rhs.length === 2 && left.includes(r.rhs[0]!) && right.includes(r.rhs[1]!),
          );
          const before = found.length;
          for (const r of rules) if (!found.includes(r.lhs)) found.push(r.lhs);
          const ordered = g.variables.filter((v) => found.includes(v));
          state = { ...state, table: put(len, i, ordered), splits: state.splits + 1 };
          const split = `"${sub(w, k, i)}" + "${sub(w, len - k, i + k)}"`;
          const added = found.slice(before);
          const what = rules.length
            ? `${list(rules.map(ruleText))} ${rules.length === 1 ? 'matches' : 'match'}${added.length ? `: add ${list(added)}.` : ', but nothing new.'}`
            : 'No rule A → BC has B on the left and C on the right.';
          if (rules.length) byWhich.push(split);
          yield {
            state,
            marks: [
              mark(cellOf(n, len, i), 'active'),
              mark(cellOf(n, k, i), 'compare'),
              mark(cellOf(n, len - k, i + k), 'compare'),
              ...rules.map((r) => mark(ruleShapeId(RULES, r), 'found')),
            ],
            say: `${cellName(len, i)}, split ${split}: the left part has ${setText(left)} and the right part ${setText(right)}. ${what}`,
            lines: ['parse.split', 'parse.rule', 'parse.add'],
            vars: vars(state),
            level: 3,
            extra: { cell: { len, i, k } },
          } satisfies CykStep;
        }
        const vs = res.table[len - 1]![i]!;
        state = { ...state, table: put(len, i, vs), cells: state.cells + 1 };
        const how = vs.length
          ? `from the split${byWhich.length === 1 ? '' : 's'} ${list(byWhich)}`
          : `: none of the ${plural(len - 1, 'split')} matches a rule`;
        yield {
          state,
          marks: [
            mark(cellOf(n, len, i), 'active'),
            ...Array.from({ length: len }, (_, d) => mark(letterOf(i + d), 'active')),
          ],
          say: `${cellName(len, i)}, for "${sub(w, len, i)}", is ${setText(vs)}${vs.length ? `, ${how}` : how}.`,
          lines: ['parse.len', 'parse.start', 'parse.split'],
          vars: vars(state),
          level: 2,
          extra: { cell: { len, i } },
        } satisfies CykStep;
      }
    }

    const top = res.table[n - 1]![0]!;
    const tree = cykTree(g, res, w);
    state = { ...state, accept: res.accept, tree };
    const verdict = res.accept
      ? `${g.start} is in ${cellName(n, 0)} = ${setText(top)}, the cell for the whole word, so ${showWord(w)} is in the language. Following how ${g.start} got there gives a parse tree, drawn here: ${treeCount(tree)} nodes, a binary tree as CNF promises.`
      : `${g.start} is not in ${cellName(n, 0)} = ${setText(top)}, the cell for the whole word, so ${showWord(w)} is not in the language.`;
    yield {
      state,
      marks: [mark(cellOf(n, n, 0), res.accept ? 'found' : 'error')],
      say: verdict,
      lines: ['parse.accept'],
      vars: vars(state),
      level: 1,
    } satisfies CykStep;
    return state;
  },
};

const SUB = '₀₁₂₃₄₅₆₇₈₉';
/** 1-based position i + 1 in subscript digits. */
const sub1 = (i: number) =>
  String(i + 1)
    .split('')
    .map((d) => SUB[Number(d)])
    .join('');

const treeCount = (t: ParseTree | null) => t?.length ?? 0;

export const ops = { parse, load };

const L = (id: string, indent: number, text: string, plain: string) => ({
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
        L('parse.sig', 0, 'cyk(w = w₁…wₙ)', 'To decide whether the grammar (in CNF) generates w:'),
        L(
          'parse.eps',
          1,
          'if w = ε: accept iff S → ε is a rule',
          'The empty word needs the rule S → ε.',
        ),
        L('parse.one', 1, 'for i = 1 to n', 'For each symbol of w,'),
        L(
          'parse.oneRule',
          2,
          'table(i, i) = { A : A → wᵢ is a rule }',
          'put in its cell every variable with a rule giving that symbol.',
        ),
        L('parse.len', 1, 'for ℓ = 2 to n', 'Then for longer and longer substrings,'),
        L(
          'parse.start',
          2,
          'for i = 1 to n − ℓ + 1; j = i + ℓ − 1',
          'for each substring of that length, from i to j,',
        ),
        L('parse.split', 3, 'for k = i to j − 1', 'try each place to cut it in two:'),
        L(
          'parse.rule',
          4,
          'for each rule A → BC',
          'for each rule with two variables on the right,',
        ),
        L(
          'parse.add',
          5,
          'if B ∈ table(i, k) and C ∈ table(k+1, j): add A to table(i, j)',
          'if B derives the left part and C the right part, then A derives the whole.',
        ),
        L(
          'parse.accept',
          1,
          'accept iff S ∈ table(1, n)',
          'Accept if the start variable derives the whole word.',
        ),
      ],
    },
    {
      op: 'load',
      lines: [
        L(
          'load.read',
          1,
          'read the rules; S = the first variable',
          'Read the grammar. Then convert it to Chomsky normal form:',
        ),
        L('load.start', 1, 'add S₀ → S', 'Add a new start variable that no rule can lead back to.'),
        L(
          'load.eps',
          1,
          'for each A → ε (A ≠ S₀): remove it, add each rule with some A left out',
          'Remove ε-rules, copying every rule that uses the variable without it.',
        ),
        L(
          'load.unit',
          1,
          'for each A → B: remove it, add A → u for each B → u',
          'Remove unit rules: a variable takes over the rules of the one it became.',
        ),
        L(
          'load.long',
          1,
          'for each A → u₁u₂…uₖ (k ≥ 3): A → u₁A₁, A₁ → u₂A₂, …',
          'Split long right sides into a chain of two symbols each.',
        ),
        L(
          'load.term',
          1,
          'for each terminal a in a two-symbol rule: use U → a',
          'Give each terminal in a two-symbol rule its own variable.',
        ),
      ],
    },
  ];
}

export function initialSay(): string {
  return 'This grammar generates aⁿbⁿ. CYK needs Chomsky normal form, so the page has already converted it: the rules on the stage. Type a word such as aabb and press Parse, or type a grammar and press Load to watch the conversion.';
}

/** Screen-reader summary. */
export function describe(state: S): string {
  const g = shownGrammar(state);
  const head =
    state.shown < 0
      ? `Grammar as typed: ${formatGrammar(g)}.`
      : `Grammar after stage ${state.shown + 1} of ${state.cnf.stages.length} of the conversion to Chomsky normal form: ${formatGrammar(g)}.`;
  if (!state.word || !state.table) return head;
  const w = state.word;
  const rows = state.table
    .map((row, l) =>
      row
        .map((c, i) => (c ? `${cellName(l + 1, i)} = ${c.length ? c.join(' ') : 'empty'}` : null))
        .filter(Boolean)
        .join('; '),
    )
    .filter(Boolean);
  const verdict = state.accept === null ? '' : state.accept ? ' Accepted.' : ' Rejected.';
  return `${head} Parsing ${showWord(w)}: ${state.cells} of ${(w.length * (w.length + 1)) / 2} cells filled. ${rows.join('. ')}${rows.length ? '.' : ''}${verdict}`;
}
