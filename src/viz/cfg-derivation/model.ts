import type { Mark, MarkRole, OpSpec, PseudoBlock, Scalar, Step, Value } from '../../engine/types';
import { ruleShapeId, treeNodeId, treeTextId } from '../_grammar/draw';
import {
  EPS,
  SEARCH_CAP,
  classify,
  derives,
  formText,
  formatGrammar,
  nextVariable,
  parseGrammar,
  parseWord,
  ruleText,
  searchDerivation,
  treeOf,
  type DerivStep,
  type Grammar,
  type Mode,
  type Sym,
} from '../_grammar/grammar';

export interface CfgSettings {
  [key: string]: Scalar;
  /** Which variable each step replaces. */
  order: Mode;
}

/** A derivation being played: all its steps, and how many have been applied. */
export interface Run {
  word: Sym[];
  mode: Mode;
  steps: DerivStep[];
  at: number;
  tried: number;
}

export interface CfgState {
  grammar: Grammar;
  /** The word of the last Derive or Ambiguity, or null. */
  word: Sym[] | null;
  run: Run | null;
  /**
   * A second derivation of the same word, drawn beside the first, and the step where the two
   * part ways. Until `shown`, the view only keeps room for its tree.
   */
  second: { steps: DerivStep[]; differ: number; shown: boolean } | null;
}

export interface CfgExtra {
  /** The rule just used, by index into the grammar's rules. */
  rule?: number;
  /** A line under the form: how the search ended. */
  status?: { text: string; role?: MarkRole };
}

type S = CfgState;
type X = CfgExtra;
type Op = OpSpec<S, CfgSettings, X>;
type CfgStep = Step<S, X>;

export const defaults: CfgSettings = { order: 'leftmost' };

export const START = 'S -> aSb | eps';
export const CAP = SEARCH_CAP;

/** Shape ids the view draws, for marks. */
export const formId = (node: number) => `f-${node}`;
export const TREE = 't-';
export const TREE2 = 'u-';
export const RULES = 'r';

export function init(): S {
  return { grammar: parseGrammar(START) as Grammar, word: null, run: null, second: null };
}

const mark = (id: string, role: MarkRole): Mark => ({ id, role });
export const showWord = (w: readonly Sym[]) => (w.length ? w.join('') : `${EPS} (the empty word)`);
const plural = (n: number, one: string, many = `${one}s`) =>
  `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

/** Text with an arrow is a grammar; anything else is a word. */
export const looksLikeGrammar = (t: string) => /->|→/.test(t);

function vars(run: Run | null): Record<string, Scalar> | undefined {
  if (!run) return undefined;
  return { step: run.at, 'steps in all': run.steps.length, 'forms tried': run.tried };
}

function refuse(s: S, say: string, line: string): CfgStep {
  return {
    state: s,
    marks: [mark('status', 'error')],
    say,
    lines: [line],
    level: 1,
    extra: { status: { text: 'nothing done', role: 'error' } },
  };
}

/** The grammar's level in words, for the Load narration. */
export function levelSentence(g: Grammar): string {
  const c = classify({ start: g.start, rules: g.rules.map((r) => ({ lhs: [r.lhs], rhs: r.rhs })) });
  if (c.level === 'regular')
    return 'Every rule is right-linear (A → wB or A → w, w all terminals), so the language is regular.';
  const miss = c.misses[0]!;
  return `${miss.rule} is not right-linear: ${miss.why}. So this is a context-free grammar.`;
}

const load: Op = {
  label: 'Load',
  arity: 1,
  *run(s, [arg]) {
    const text = String(arg ?? '').trim();
    if (!looksLikeGrammar(text)) {
      yield refuse(
        s,
        `"${text}" is not a grammar. Load takes rules such as S -> aSb | eps; to derive a word, press Derive.`,
        'load.read',
      );
      return s;
    }
    const g = parseGrammar(text);
    if (g instanceof Error) {
      yield refuse(s, `Nothing loaded. ${g.message}`, 'load.read');
      return s;
    }
    const state: S = { grammar: g, word: null, run: null, second: null };
    const vs = g.variables.join(', ');
    const ts = g.terminals.length ? g.terminals.join(' ') : 'none';
    yield {
      state,
      marks: [mark(treeNodeId(TREE, 0), 'new')],
      say: `Loaded ${plural(g.rules.length, 'rule')}. Variables: ${vs}; terminals: ${ts}. The start variable is ${g.start}. ${levelSentence(g)} Type a word and press Derive.`,
      lines: ['load.read', 'load.start'],
      level: 1,
    } satisfies CfgStep;
    return state;
  },
};

/** The word in an operation's argument, checked against the grammar, or a refusal. */
function wordOf(s: S, arg: Value | undefined): Sym[] | string {
  const text = String(arg ?? '').trim();
  if (looksLikeGrammar(text)) return 'That looks like a grammar. Press Load to use it.';
  const w = parseWord(text, s.grammar);
  return w instanceof Error ? w.message : w;
}

const which = (mode: Mode) => (mode === 'leftmost' ? 'leftmost' : 'rightmost');

/** The steps that play a derivation one rule at a time, after its first step. */
function* play(
  base: S,
  run: Run,
  startSay: string,
  startLines: string[],
): Generator<CfgStep, S, void> {
  const g = base.grammar;
  const { trees, forms, expanded } = treeOf(g, run.steps);
  const m = run.steps.length;
  const syms = (k: number) => forms[k]!.map((f) => f.sym);
  const nextMarks = (k: number): Mark[] => {
    const i = nextVariable(syms(k), run.mode);
    if (i < 0) return [];
    const node = forms[k]![i]!.node;
    return [mark(formId(node), 'active'), mark(treeNodeId(TREE, node), 'active')];
  };
  let state: S = { ...base, run: { ...run, at: 0 } };
  yield {
    state,
    marks: nextMarks(0),
    say: startSay,
    lines: startLines,
    vars: vars(state.run),
    level: 1,
  };
  for (let k = 1; k <= m; k++) {
    const step = run.steps[k - 1]!;
    const r = g.rules[step.rule]!;
    const made = trees[k]!.slice(trees[k - 1]!.length);
    state = { ...base, run: { ...run, at: k } };
    const done = k === m;
    const formAfter = done ? showWord(run.word) : formText(syms(k));
    let say = `Use ${ruleText(r)} on the ${which(run.mode)} ${r.lhs}: ${formText(syms(k - 1))} ⇒ ${formAfter}.`;
    if (done)
      say += ` No variables are left, so that is a ${which(run.mode)} derivation of ${showWord(run.word)} in ${plural(m, 'step')}, and the tree has ${plural(m, 'inner node')}, one per step.`;
    yield {
      state,
      marks: [
        mark(treeNodeId(TREE, expanded[k - 1]!), 'visit'),
        ...made.flatMap((n) =>
          n.sym === EPS
            ? [mark(treeTextId(TREE, n.id), 'new')]
            : [mark(formId(n.id), 'new'), mark(treeNodeId(TREE, n.id), 'new')],
        ),
        ...nextMarks(k),
        mark(ruleShapeId(RULES, r), 'active'),
      ],
      say,
      lines: ['play.step', 'play.grow'],
      vars: vars(state.run),
      level: done ? 1 : 2,
      extra: { rule: step.rule },
    } satisfies CfgStep;
  }
  return state;
}

/** The narration for a search that found nothing. */
function noneSay(g: Grammar, w: Sym[], mode: Mode, tried: number, capped: boolean): string {
  const shown = showWord(w);
  if (!capped)
    return `No ${which(mode)} derivation gives ${shown}. The search tried every sentential form that could still lead to it, ${plural(tried, 'form')} in all, so ${shown} is not in the language.`;
  const verdict = derives(g, w) ? 'is in the language after all' : 'is not in the language';
  return `The search gave up after ${plural(tried, 'sentential form')} without reaching ${shown}. Rules such as S → SS can grow forms without adding terminals, so a search may never end. CYK, which works on Chomsky normal form, settles it: ${shown} ${verdict}.`;
}

const derive: Op = {
  label: 'Derive',
  arity: 1,
  *run(s, [arg], { settings }) {
    const w = wordOf(s, arg);
    if (typeof w === 'string') {
      yield refuse(s, `Nothing derived. ${w}`, 'derive.sig');
      return s;
    }
    const mode = settings.order;
    const res = searchDerivation(s.grammar, w, mode);
    const base: S = { ...s, word: w, run: null, second: null };
    if (!res.derivation) {
      const say = noneSay(s.grammar, w, mode, res.tried, res.capped);
      yield {
        state: base,
        marks: [mark('status', 'error')],
        say,
        lines: [res.capped ? 'derive.cap' : 'derive.none'],
        vars: { 'forms tried': res.tried },
        level: 1,
        extra: {
          status: {
            text: res.capped ? `gave up after ${plural(res.tried, 'form')}` : `not in the language`,
            role: 'error',
          },
        },
      } satisfies CfgStep;
      return base;
    }
    const run: Run = { word: w, mode, steps: res.derivation.steps, at: 0, tried: res.tried };
    const m = run.steps.length;
    const say = `A breadth-first search found a ${which(mode)} derivation of ${showWord(w)} in ${plural(m, 'step')}, after trying ${plural(res.tried, 'sentential form')}. Now play it, one rule per step, starting from ${s.grammar.start}.`;
    return yield* play(base, run, say, ['derive.found']);
  },
};

/** The first step where two derivations use different rules. */
export function differAt(a: readonly DerivStep[], b: readonly DerivStep[]): number {
  let k = 0;
  while (k < a.length && k < b.length && a[k]!.rule === b[k]!.rule && a[k]!.at === b[k]!.at) k++;
  return k;
}

const ambiguity: Op = {
  label: 'Ambiguity',
  arity: 1,
  *run(s, [arg], { settings }) {
    const w = wordOf(s, arg);
    if (typeof w === 'string') {
      yield refuse(s, `Nothing searched. ${w}`, 'amb.sig');
      return s;
    }
    const mode = settings.order;
    const res = searchDerivation(s.grammar, w, mode, { two: true });
    const base: S = { ...s, word: w, run: null, second: null };
    const g = s.grammar;
    if (!res.derivation) {
      yield {
        state: base,
        marks: [mark('status', 'error')],
        say: `${noneSay(g, w, mode, res.tried, res.capped)} No derivation means no parse tree at all.`,
        lines: ['amb.search', res.capped ? 'derive.cap' : 'derive.none'],
        vars: { 'forms tried': res.tried },
        level: 1,
        extra: { status: { text: 'no parse tree', role: 'error' } },
      } satisfies CfgStep;
      return base;
    }
    const steps = res.derivation.steps;
    const run: Run = { word: w, mode, steps, at: steps.length, tried: res.tried };
    const derivText = (forms: Sym[][]) => forms.map((f) => formText(f)).join(' ⇒ ');
    if (!res.second) {
      const state: S = { ...base, run };
      const why = res.capped
        ? `The search stopped at the cap, after ${plural(res.tried, 'form')}, without finding a second one, which proves nothing either way.`
        : `The search tried all ${plural(res.tried, 'form')} that could lead to ${showWord(w)} and found no second ${which(mode)} derivation, so ${showWord(w)} has exactly one parse tree.`;
      yield {
        state,
        marks: [mark('status', 'found')],
        say: `One ${which(mode)} derivation: ${derivText(res.derivation.forms)}. ${why} Other words might still have two trees, and no algorithm can decide in general whether a grammar is ambiguous.`,
        lines: ['amb.search', 'amb.one'],
        vars: vars(run),
        level: 1,
        extra: { status: { text: 'one parse tree found', role: 'found' } },
      } satisfies CfgStep;
      return state;
    }
    const other = res.second.steps;
    const differ = differAt(steps, other);
    const first: S = { ...base, run, second: { steps: other, differ, shown: false } };
    yield {
      state: first,
      marks: [mark(treeNodeId(TREE, 0), 'found')],
      say: `One ${which(mode)} derivation of ${showWord(w)}: ${derivText(res.derivation.forms)}. Its parse tree is on the left. Keep searching for another.`,
      lines: ['amb.search'],
      vars: vars(run),
      level: 2,
    } satisfies CfgStep;
    const both: S = { ...first, second: { steps: other, differ, shown: true } };
    const node = treeOf(g, steps).expanded[differ]!;
    const r1 = g.rules[steps[differ]!.rule]!;
    const r2 = g.rules[other[differ]!.rule]!;
    yield {
      state: both,
      marks: [
        mark(treeNodeId(TREE, node), 'compare'),
        mark(treeNodeId(TREE2, node), 'compare'),
        mark(ruleShapeId(RULES, r1), 'compare'),
        mark(ruleShapeId(RULES, r2), 'compare'),
        mark('status', 'found'),
      ],
      say: `A second ${which(mode)} derivation: ${derivText(res.second.forms)}. The two part ways at step ${differ + 1}: one uses ${ruleText(r1)}, the other ${ruleText(r2)}. Two parse trees for one word, so the grammar is ambiguous.`,
      lines: ['amb.alt', 'amb.two'],
      vars: vars(run),
      level: 1,
      extra: { status: { text: 'two parse trees: ambiguous', role: 'found' } },
    } satisfies CfgStep;
    return both;
  },
};

export const ops = { derive, ambiguity, load };

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: CfgSettings): PseudoBlock[] {
  const left = settings.order === 'leftmost';
  const end = left ? 'leftmost' : 'rightmost';
  return [
    {
      op: 'derive',
      lines: [
        L('derive.sig', 0, 'derive(w)', `To find a ${end} derivation of a word w:`),
        L(
          'derive.init',
          1,
          'queue = [S]; seen = { S }',
          'Start a queue of sentential forms holding just S.',
        ),
        L(
          'derive.loop',
          1,
          'while queue is not empty',
          'Take the forms in the order they were queued:',
        ),
        L(
          'derive.cap',
          2,
          `if tried = ${CAP.toLocaleString('en-US')}: give up`,
          `Give up after ${CAP.toLocaleString('en-US')} forms.`,
        ),
        L('derive.take', 2, 'α = dequeue(); tried = tried + 1', 'Take the next form.'),
        L('derive.pick', 2, `A = the ${end} variable in α`, `Find its ${end} variable.`),
        L('derive.rule', 2, 'for each rule A → β', 'Try each rule for that variable:'),
        L(
          'derive.replace',
          3,
          'α′ = α with that A replaced by β',
          "Replace the variable with the rule's right side.",
        ),
        L(
          'derive.found',
          3,
          'if α′ = w: return the derivation of α′',
          'If that gives w, stop: follow the forms back to S.',
        ),
        L(
          'derive.keep',
          3,
          left
            ? 'if α′ starts like w, minlen(α′) ≤ |w| and α′ ∉ seen'
            : 'if α′ ends like w, minlen(α′) ≤ |w| and α′ ∉ seen',
          left
            ? 'If the terminals before its first variable match the start of w, it is not too long, and it is new,'
            : 'If the terminals after its last variable match the end of w, it is not too long, and it is new,',
        ),
        L('derive.push', 4, 'seen.add(α′); enqueue(α′)', 'remember it and queue it.'),
        L(
          'derive.none',
          1,
          'return "w is not in L(G)"',
          'If the queue runs dry, no derivation gives w.',
        ),
        L(
          'play.step',
          1,
          'for each step α ⇒ α′ of the derivation',
          'Then replay the derivation, one rule at a time,',
        ),
        L(
          'play.grow',
          2,
          "add β under A's node in the tree",
          "and grow the parse tree: the symbols of β become the children of the variable's node.",
        ),
      ],
    },
    {
      op: 'ambiguity',
      lines: [
        L('amb.sig', 0, 'ambiguous(w)', 'To look for two parse trees for w:'),
        L(
          'amb.search',
          1,
          'search as in derive(w), and keep going',
          'Search as Derive does, but do not stop at the first derivation.',
        ),
        L(
          'amb.alt',
          1,
          'if a form on that derivation is reached another way',
          'Watch for a form on the first derivation that a different form or rule also reaches.',
        ),
        L(
          'amb.two',
          2,
          'return two derivations: two parse trees',
          'That gives a second derivation, and so a second parse tree.',
        ),
        L('amb.one', 1, 'return the one derivation', 'Otherwise only one tree turned up.'),
      ],
    },
    {
      op: 'load',
      lines: [
        L('load.sig', 0, 'load(rules)', 'To load a grammar:'),
        L(
          'load.read',
          1,
          'for each rule A → α₁ | α₂ | …: add A → αᵢ',
          'Read each rule; | separates the choices for one variable.',
        ),
        L(
          'load.start',
          1,
          'S = the variable of the first rule',
          "The first rule's variable is the start variable.",
        ),
      ],
    },
  ];
}

export function initialSay(): string {
  return 'This grammar generates aⁿbⁿ: some a’s followed by as many b’s. Type a word such as aabb and press Derive to watch a leftmost derivation grow its parse tree, or type rules of your own and press Load.';
}

/** Screen-reader summary. */
export function describe(state: S): string {
  const g = state.grammar;
  const head = `Grammar with start variable ${g.start}: ${formatGrammar(g)}.`;
  const run = state.run;
  if (!run) return state.word ? `${head} No derivation of ${showWord(state.word)}.` : head;
  const { forms } = treeOf(g, run.steps.slice(0, run.at));
  const form = forms.at(-1)!.map((f) => f.sym);
  const where = `${which(run.mode)} derivation of ${showWord(run.word)}, step ${run.at} of ${run.steps.length}: the form is ${formText(form)}.`;
  const two = state.second?.shown ? ' A second parse tree is drawn beside the first.' : '';
  return `${head} ${where.charAt(0).toUpperCase()}${where.slice(1)}${two}`;
}
