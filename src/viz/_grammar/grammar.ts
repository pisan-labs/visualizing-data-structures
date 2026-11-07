/**
 * Grammars: the model, the text format, derivations, Chomsky normal form, CYK, a brute-force
 * membership check for tests, and the level of the Chomsky hierarchy a grammar's rules fit.
 * Shared by the grammar pages (cfg-derivation, cyk, and later chomsky-hierarchy). This folder
 * has no index.ts, so the registry does not treat it as a page.
 *
 * Text format (one line, rules separated by ; or new lines):
 *
 *   S -> aSb | eps; T -> TT | (T) | ε
 *
 * - The first rule's variable is the start variable.
 * - Capitals are variables, optionally followed by subscript digits or primes (S₀, U₁, E');
 *   every other character is a terminal, one character each. Spaces are ignored.
 * - `|` separates alternatives. `eps` or `ε` alone is the empty word.
 * - The arrow is -> or →.
 *
 * API
 *   parseGrammar(text)      -> Grammar, or an Error whose message names the bad rule
 *   parseRules(text)        -> any grammar (left sides may be strings), for classify()
 *   formatGrammar(g, ascii) -> text that parseGrammar reads back to the same rules, grouped
 *                              by variable
 *   parseWord(text, g?)     -> the word's symbols, or an Error naming a symbol that is wrong
 *   classify(rules)         -> regular, context-free, context-sensitive or unrestricted, and why
 *   minLengths(g)           -> the shortest word each variable derives (Infinity: none)
 *   searchDerivation(g, w, mode) -> a breadth-first search for a leftmost or rightmost
 *                              derivation, optionally for two (ambiguity), with a cap
 *   treeOf(g, start, steps) -> the parse tree a derivation builds, node by node
 *   toCnf(g)                -> Chomsky normal form, with every stage of Sipser's conversion
 *   cyk(g, w)               -> the CYK table of a grammar in CNF, and a parse tree read back
 *   wordsUpTo(g, n)         -> every word of length at most n, by brute force (for tests)
 */

export type Sym = string;

/** A context-free rule: one variable on the left. An empty right side is ε. */
export interface Rule {
  lhs: Sym;
  rhs: Sym[];
}

/** Any rule, for classifying: the left side is a string with at least one variable. */
export interface Production {
  lhs: Sym[];
  rhs: Sym[];
}

export interface Grammar {
  start: Sym;
  /** The start variable first, then in order of first appearance. */
  variables: Sym[];
  /** In order of first appearance. */
  terminals: Sym[];
  /** In the order typed, without duplicates. */
  rules: Rule[];
}

export const EPS = 'ε';
/** Most alternatives a grammar may have, and most symbols on one right side. */
export const MAX_RULES = 30;
export const MAX_RHS = 10;

const SUBSCRIPT = '₀₁₂₃₄₅₆₇₈₉';
const VARIABLE = /^[A-Z][₀-₉']*$/u;

export const isVariable = (s: Sym): boolean => VARIABLE.test(s);
export const isTerminal = (s: Sym): boolean => !isVariable(s);

/** n written with subscript digits: 12 -> ₁₂. */
export const subscript = (n: number): string =>
  String(n)
    .split('')
    .map((d) => SUBSCRIPT[Number(d)])
    .join('');

/** The symbols of one side of a rule, or a message saying what is wrong with them. */
function tokenize(side: string): Sym[] | string {
  const out: Sym[] = [];
  const chars = [...side];
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i]!;
    if (/\s/u.test(c) || c === EPS) continue;
    if (/[A-Z]/.test(c)) {
      let v = c;
      while (i + 1 < chars.length && /[₀-₉']/u.test(chars[i + 1]!)) v += chars[++i];
      out.push(v);
      continue;
    }
    if (/[₀-₉']/u.test(c)) return `"${c}" may only follow a variable, as in S₀ or E'`;
    if (c === '|' || c === ';') return `"${c}" cannot be a terminal`;
    out.push(c);
  }
  return out;
}

const arrowAt = (item: string): { at: number; len: number } | null => {
  const a = item.indexOf('->');
  const b = item.indexOf('→');
  if (a < 0 && b < 0) return null;
  if (a >= 0 && (b < 0 || a < b)) return { at: a, len: 2 };
  return { at: b, len: 1 };
};

/** Read an alternative: `eps`, `ε` or nothing but ε is the empty word. */
function alternative(text: string, item: string): Sym[] | Error {
  const t = text.trim();
  if (t === '')
    return new Error(`"${item}" has an empty alternative: write eps (or ε) for the empty word.`);
  if (t === 'eps') return [];
  const syms = tokenize(t);
  if (typeof syms === 'string') return new Error(`In "${item}": ${syms}.`);
  if (syms.length > MAX_RHS)
    return new Error(`"${item}": keep each alternative to ${MAX_RHS} symbols.`);
  return syms;
}

function items(text: string): string[] {
  return text
    .split(/[;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const HOW = 'Write rules like "S -> aSb | eps", separated by ;.';

/**
 * Any grammar: left sides may be strings, as long as each has a variable. The start variable is
 * the first variable of the first rule.
 */
export function parseRules(text: string): { start: Sym; rules: Production[] } | Error {
  const list = items(text);
  if (!list.length) return new Error(`Type a grammar first. ${HOW}`);
  const rules: Production[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    const arrow = arrowAt(item);
    if (!arrow) return new Error(`"${item}" has no arrow. ${HOW}`);
    const left = item.slice(0, arrow.at);
    const right = item.slice(arrow.at + arrow.len);
    if (arrowAt(right)) return new Error(`"${item}" has two arrows: one rule per item, please.`);
    const lhs = tokenize(left);
    if (typeof lhs === 'string') return new Error(`In "${item}": ${lhs}.`);
    if (!lhs.length) return new Error(`"${item}" has nothing before the arrow.`);
    if (!lhs.some(isVariable))
      return new Error(`"${item}": the left side needs a variable (a capital letter).`);
    for (const alt of right.split('|')) {
      const rhs = alternative(alt, item);
      if (rhs instanceof Error) return rhs;
      const key = `${lhs.join(' ')}>${rhs.join(' ')}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rules.push({ lhs, rhs });
      if (rules.length > MAX_RULES)
        return new Error(`That is more than ${MAX_RULES} alternatives. Keep grammars small.`);
    }
  }
  return { start: rules[0]!.lhs.find(isVariable)!, rules };
}

/**
 * Build a grammar from its rules: the variables and terminals in order of appearance. The rule
 * list is copied, so a caller that goes on changing its own list leaves the grammar alone.
 */
export function makeGrammar(start: Sym, rules: readonly Rule[]): Grammar {
  const variables = [start];
  const terminals: Sym[] = [];
  const add = (s: Sym) => {
    if (isVariable(s)) {
      if (!variables.includes(s)) variables.push(s);
    } else if (!terminals.includes(s)) terminals.push(s);
  };
  for (const r of rules) add(r.lhs);
  for (const r of rules) r.rhs.forEach(add);
  return { start, variables, terminals, rules: [...rules] };
}

/** A context-free grammar: one variable on the left of every rule. */
export function parseGrammar(text: string): Grammar | Error {
  const p = parseRules(text);
  if (p instanceof Error) return p;
  const rules: Rule[] = [];
  for (const r of p.rules) {
    if (r.lhs.length !== 1) {
      const shown = `${r.lhs.join('')} -> ${r.rhs.join('') || 'eps'}`;
      return new Error(
        `"${shown}": the left side must be one variable, such as S. A rule with more on the left is not context-free.`,
      );
    }
    rules.push({ lhs: r.lhs[0]!, rhs: r.rhs });
  }
  return makeGrammar(p.start, rules);
}

/** Symbols as a string: "aSb", "U₁S₁", or ε for none. */
export const formText = (syms: readonly Sym[]): string => (syms.length ? syms.join('') : EPS);

export const ruleText = (r: Rule): string => `${r.lhs} → ${formText(r.rhs)}`;

/** The rules of each variable, in variable order. */
export function rulesByVariable(g: Grammar): { lhs: Sym; rules: Rule[] }[] {
  return g.variables
    .map((v) => ({ lhs: v, rules: g.rules.filter((r) => r.lhs === v) }))
    .filter((x) => x.rules.length);
}

/**
 * The grammar as text: "S → aSb | ε; ..." for people, or with `ascii` "S -> aSb | eps; ..."
 * (the form the code tabs read). parseGrammar reads either back to the same grammar.
 */
export function formatGrammar(g: Grammar, ascii = false): string {
  const arrow = ascii ? '->' : '→';
  const eps = ascii ? 'eps' : EPS;
  return rulesByVariable(g)
    .map(
      ({ lhs, rules }) =>
        `${lhs} ${arrow} ${rules.map((r) => (r.rhs.length ? r.rhs.join('') : eps)).join(' | ')}`,
    )
    .join('; ');
}

export const MAX_WORD = 12;

/**
 * A word: terminals, with or without spaces; `eps`, `ε` or nothing typed for the empty word.
 * With a grammar, every symbol must be one of its terminals.
 */
export function parseWord(text: string, g?: Grammar, max = MAX_WORD): Sym[] | Error {
  const t = text.trim();
  if (t === 'eps' || t === EPS || t === '') return [];
  const syms = [...t].filter((c) => !/\s/u.test(c) && c !== EPS);
  for (const c of syms) {
    if (/[A-Z]/.test(c))
      return new Error(
        `"${c}" is a capital, and capitals are variables. A word has terminals only.`,
      );
    if (/[|;₀-₉']/u.test(c)) return new Error(`"${c}" cannot be part of a word.`);
    if (g && !g.terminals.includes(c)) {
      const ts = g.terminals.length ? g.terminals.join(' ') : 'none at all';
      return new Error(`"${c}" is not a terminal of this grammar. Its terminals are ${ts}.`);
    }
  }
  if (syms.length > max) return new Error(`Keep words to ${max} symbols.`);
  return syms;
}

// ---------------------------------------------------------------------------------------------
// The Chomsky hierarchy

export type Level = 'regular' | 'context-free' | 'context-sensitive' | 'unrestricted';

export const LEVELS: Level[] = ['regular', 'context-free', 'context-sensitive', 'unrestricted'];

export interface Classification {
  /** The most restrictive level whose form every rule fits. */
  level: Level;
  /** For each more restrictive level, the first rule that does not fit it, and why. */
  misses: { level: Level; rule: string; why: string }[];
}

const productionText = (p: Production) =>
  `${p.lhs.join('')} → ${p.rhs.length ? p.rhs.join('') : EPS}`;

/**
 * The level of the Chomsky hierarchy a grammar's rules fit:
 * - regular: right-linear, every rule A → wB or A → w with w a string of terminals;
 * - context-free: one variable on the left;
 * - context-sensitive: non-contracting, the right side at least as long as the left (S → ε is
 *   allowed when S is the start variable and appears on no right side);
 * - unrestricted: anything else.
 * A grammar may fit a lower level's form only in a roundabout way (a context-free grammar with
 * ε-rules is not non-contracting), so the levels are checked from the most restrictive up.
 */
export function classify(g: { start: Sym; rules: Production[] }): Classification {
  const misses: Classification['misses'] = [];
  const first = (level: Level, why: (p: Production) => string | null): boolean => {
    for (const p of g.rules) {
      const w = why(p);
      if (w) {
        misses.push({ level, rule: productionText(p), why: w });
        return false;
      }
    }
    return true;
  };
  const oneVar = (p: Production) =>
    p.lhs.length === 1 && isVariable(p.lhs[0]!) ? null : 'more than one variable on the left';
  const regular = first('regular', (p) => {
    const o = oneVar(p);
    if (o) return o;
    const vars = p.rhs.filter(isVariable).length;
    if (vars > 1) return 'more than one variable on the right';
    if (vars === 1 && !isVariable(p.rhs.at(-1)!)) return 'a terminal comes after the variable';
    return null;
  });
  if (regular) return { level: 'regular', misses };
  if (first('context-free', oneVar)) return { level: 'context-free', misses };
  const startOnRight = g.rules.some((p) => p.rhs.includes(g.start));
  const cs = first('context-sensitive', (p) => {
    if (p.rhs.length >= p.lhs.length) return null;
    const startEps = p.rhs.length === 0 && p.lhs.length === 1 && p.lhs[0] === g.start;
    if (startEps && !startOnRight) return null;
    if (startEps) return 'S → ε is allowed only when S appears on no right side';
    return 'the right side is shorter than the left';
  });
  return { level: cs ? 'context-sensitive' : 'unrestricted', misses };
}

// ---------------------------------------------------------------------------------------------
// Lengths and derivations

/** The length of the shortest word each variable derives; Infinity when it derives none. */
export function minLengths(g: Grammar): Map<Sym, number> {
  const m = new Map<Sym, number>(g.variables.map((v) => [v, Infinity]));
  const len = (s: Sym) => (isVariable(s) ? (m.get(s) ?? Infinity) : 1);
  for (let changed = true; changed;) {
    changed = false;
    for (const r of g.rules) {
      const l = r.rhs.reduce((a, s) => a + len(s), 0);
      if (l < (m.get(r.lhs) ?? Infinity)) {
        m.set(r.lhs, l);
        changed = true;
      }
    }
  }
  return m;
}

export type Mode = 'leftmost' | 'rightmost';

/** The index of the variable a leftmost (or rightmost) derivation replaces next, or -1. */
export function nextVariable(form: readonly Sym[], mode: Mode): number {
  if (mode === 'leftmost') return form.findIndex(isVariable);
  for (let i = form.length - 1; i >= 0; i--) if (isVariable(form[i]!)) return i;
  return -1;
}

/** One step of a derivation: rule `rule` (an index into g.rules) at position `at`. */
export interface DerivStep {
  at: number;
  rule: number;
}

export interface Derivation {
  steps: DerivStep[];
  /** forms[0] is the start variable; forms[k] follows from forms[k - 1] by steps[k - 1]. */
  forms: Sym[][];
}

export interface SearchResult {
  /** A derivation of w, or null. */
  derivation: Derivation | null;
  /** A second, different derivation of w (when asked for two). */
  second: Derivation | null;
  /** The search stopped at the cap before it ran out of forms. */
  capped: boolean;
  /** Sentential forms taken from the queue and expanded. */
  tried: number;
  /** The longest form the search allowed. */
  bound: number;
}

export const SEARCH_CAP = 10_000;

/**
 * The longest sentential form a search needs to allow. A parse tree for w with the fewest nodes
 * never repeats a variable over the same span on one path, so a path has at most |V|(n + 1)
 * variables; a leftmost (or rightmost) form is the terminals done so far plus the unexpanded
 * siblings along one path, so it is never longer than this.
 */
export function formBound(g: Grammar, n: number): number {
  const widest = Math.max(1, ...g.rules.map((r) => r.rhs.length));
  return n + 1 + (widest - 1) * g.variables.length * (n + 1);
}

/**
 * Breadth-first search for a derivation of w from the start variable, always replacing the
 * leftmost (or rightmost) variable. A form is dropped when its terminals before the first
 * variable (after the last, for rightmost) differ from w, when even its shortest yield is longer
 * than w, or when it is longer than formBound(). Forms seen before are not queued again. The
 * first derivation found is the shortest, and among those the first in rule order.
 *
 * With `two`, the search goes on after the first derivation for a second, different one: a
 * form on the first derivation reached a second way. It stops at the cap either way.
 */
export function searchDerivation(
  g: Grammar,
  w: readonly Sym[],
  mode: Mode,
  opts: { cap?: number; two?: boolean } = {},
): SearchResult {
  const cap = opts.cap ?? SEARCH_CAP;
  const n = w.length;
  const min = minLengths(g);
  const bound = formBound(g, n);
  const target = w.join(' ');
  const keep = (f: Sym[]): boolean => {
    if (f.length > bound) return false;
    let len = 0;
    for (const s of f) len += isVariable(s) ? (min.get(s) ?? Infinity) : 1;
    if (len > n) return false;
    const i = nextVariable(f, mode);
    if (i < 0) return f.join(' ') === target;
    if (mode === 'leftmost') {
      for (let k = 0; k < i; k++) if (f[k] !== w[k]) return false;
    } else {
      const tail = f.length - 1 - i;
      for (let k = 0; k < tail; k++) if (f[f.length - 1 - k] !== w[n - 1 - k]) return false;
    }
    return true;
  };

  interface Node {
    form: Sym[];
    parent: number;
    step: DerivStep | null;
  }
  const nodes: Node[] = [{ form: [g.start], parent: -1, step: null }];
  const index = new Map<string, number>([[g.start, 0]]);
  const alts = new Map<number, { parent: number; step: DerivStep }[]>();
  const queue: number[] = [0];
  let head = 0;
  let goal = -1;
  let tried = 0;
  let capped = false;
  let onPath: Set<number> | null = null;
  let second: Derivation | null = null;

  const pathTo = (v: number): number[] => {
    const p: number[] = [];
    for (let u = v; u >= 0; u = nodes[u]!.parent) p.push(u);
    return p.reverse();
  };
  const derivationOf = (path: number[], extra: DerivStep[] = []): Derivation => ({
    forms: path.map((u) => nodes[u]!.form),
    steps: [...path.slice(1).map((u) => nodes[u]!.step!), ...extra],
  });
  /** The derivation through an alternative edge into v, a node on the first derivation. */
  const viaAlt = (v: number, alt: { parent: number; step: DerivStep }): Derivation => {
    const first = pathTo(goal);
    const before = pathTo(alt.parent);
    const after = first.slice(first.indexOf(v));
    const forms = [...before, ...after].map((u) => nodes[u]!.form);
    const steps = [
      ...before.slice(1).map((u) => nodes[u]!.step!),
      alt.step,
      ...after.slice(1).map((u) => nodes[u]!.step!),
    ];
    return { forms, steps };
  };
  /** An alternative into the first derivation, preferring one that is not a loop. */
  const findSecond = (): Derivation | null => {
    if (!onPath) return null;
    let loop: Derivation | null = null;
    for (const v of pathTo(goal)) {
      for (const alt of alts.get(v) ?? []) {
        const d = viaAlt(v, alt);
        if (!pathTo(alt.parent).includes(v)) return d;
        loop ??= d;
      }
    }
    return loop;
  };

  while (head < queue.length) {
    if (tried >= cap) {
      capped = true;
      break;
    }
    const u = queue[head++]!;
    tried++;
    const form = nodes[u]!.form;
    const at = nextVariable(form, mode);
    const A = form[at]!;
    let done = false;
    g.rules.forEach((r, ri) => {
      if (done || r.lhs !== A) return;
      const child = [...form.slice(0, at), ...r.rhs, ...form.slice(at + 1)];
      if (!keep(child)) return;
      const key = child.join(' ');
      const step = { at, rule: ri };
      const seen = index.get(key);
      if (seen !== undefined) {
        if (!opts.two) return;
        const list = alts.get(seen) ?? [];
        list.push({ parent: u, step });
        alts.set(seen, list);
        if (onPath?.has(seen)) {
          second = findSecond();
          if (second) done = true;
        }
        return;
      }
      const v = nodes.length;
      nodes.push({ form: child, parent: u, step });
      index.set(key, v);
      if (nextVariable(child, mode) < 0) {
        goal = v;
        if (!opts.two) {
          done = true;
          return;
        }
        onPath = new Set(pathTo(goal));
        second = findSecond();
        if (second) done = true;
        return;
      }
      queue.push(v);
    });
    if (done) break;
  }
  const derivation = goal >= 0 ? derivationOf(pathTo(goal)) : null;
  // The cap only matters when the search is still looking for something.
  if (derivation && (!opts.two || second)) capped = false;
  return { derivation, second, capped, tried, bound };
}

/** A node of a parse tree. An ε leaf has the symbol ε. */
export interface TreeNode {
  id: number;
  sym: Sym;
  kids: number[];
  parent: number;
}

/** Nodes by id; the root is node 0. */
export type ParseTree = TreeNode[];

/** The leaves of a tree, left to right, without ε: the word it derives (so far). */
export function treeYield(t: ParseTree): Sym[] {
  const out: Sym[] = [];
  const walk = (id: number) => {
    const node = t[id]!;
    if (!node.kids.length) {
      if (node.sym !== EPS) out.push(node.sym);
      return;
    }
    node.kids.forEach(walk);
  };
  if (t.length) walk(0);
  return out;
}

/** A sentential form whose symbols remember their nodes in the parse tree. */
export type TrackedForm = { sym: Sym; node: number }[];

/**
 * Replay a derivation and build its parse tree, one rule at a time. Returns the tree after
 * every step (trees[k] after k steps) and the forms with their nodes. Node ids follow the order
 * the nodes are made, so two derivations that agree for k steps agree on those nodes' ids.
 */
export function treeOf(
  g: Grammar,
  steps: readonly DerivStep[],
): { trees: ParseTree[]; forms: TrackedForm[]; expanded: number[] } {
  let tree: ParseTree = [{ id: 0, sym: g.start, kids: [], parent: -1 }];
  let form: TrackedForm = [{ sym: g.start, node: 0 }];
  const trees = [tree];
  const forms = [form];
  const expanded: number[] = [];
  for (const s of steps) {
    const r = g.rules[s.rule]!;
    const parent = form[s.at]!.node;
    const next = tree.map((x) => ({ ...x, kids: [...x.kids] }));
    const made: TrackedForm = [];
    const syms = r.rhs.length ? r.rhs : [EPS];
    for (const sym of syms) {
      const id = next.length;
      next.push({ id, sym, kids: [], parent });
      next[parent]!.kids.push(id);
      if (sym !== EPS) made.push({ sym, node: id });
    }
    form = [...form.slice(0, s.at), ...made, ...form.slice(s.at + 1)];
    tree = next;
    trees.push(tree);
    forms.push(form);
    expanded.push(parent);
  }
  return { trees, forms, expanded };
}

/** Whether a derivation is valid: each step replaces the right variable with one of its rules. */
export function checkDerivation(
  g: Grammar,
  d: Derivation,
  w: readonly Sym[],
  mode: Mode,
): string | null {
  if (d.forms[0]?.join(' ') !== g.start) return 'does not start from the start variable';
  for (let k = 0; k < d.steps.length; k++) {
    const f = d.forms[k]!;
    const s = d.steps[k]!;
    if (s.at !== nextVariable(f, mode)) return `step ${k + 1} replaces the wrong variable`;
    const r = g.rules[s.rule]!;
    if (f[s.at] !== r.lhs) return `step ${k + 1} uses a rule for another variable`;
    const next = [...f.slice(0, s.at), ...r.rhs, ...f.slice(s.at + 1)];
    if (next.join(' ') !== d.forms[k + 1]!.join(' ')) return `step ${k + 1} gives the wrong form`;
  }
  if (d.forms.at(-1)!.join(' ') !== w.join(' ')) return 'does not end with the word';
  return null;
}

// ---------------------------------------------------------------------------------------------
// Chomsky normal form (Sipser, Theorem 2.9)

export type CnfStageKind = 'start' | 'eps' | 'unit' | 'long' | 'term';

export interface CnfStage {
  kind: CnfStageKind;
  /** The rule this stage removes or splits (the ε-rule, the unit rule, the long rule). */
  target?: Rule;
  /** The terminal a 'term' stage replaces, and the variable that stands for it. */
  terminal?: Sym;
  variable?: Sym;
  removed: Rule[];
  added: Rule[];
  /** The grammar after this stage. */
  grammar: Grammar;
}

export interface CnfResult {
  stages: CnfStage[];
  cnf: Grammar;
}

const ruleKey = (r: Rule) => `${r.lhs}>${r.rhs.join(' ')}`;

/** A variable name not in use: the letter of `base` with the next free subscript. */
function freshName(used: Set<Sym>, base: Sym, from: number): Sym {
  const letter = base[0]!;
  for (let k = from; ; k++) {
    const name = `${letter}${subscript(k)}`;
    if (!used.has(name)) {
      used.add(name);
      return name;
    }
  }
}

/**
 * Convert to Chomsky normal form the way Sipser does (Theorem 2.9), recording each stage:
 * 1. a new start variable S₀ → S;
 * 2. remove each ε-rule A → ε (A not the start), adding the rules with each occurrence of A
 *    left out; R → A gives R → ε unless R → ε was removed before;
 * 3. remove each unit rule A → B, adding A → u for each rule B → u (unless A → u is a unit rule
 *    removed before);
 * 4. split each rule with three or more symbols into a chain A → u₁A₁, A₁ → u₂A₂, ...
 *    (identical tails share their variable), then replace each terminal in a two-symbol rule
 *    with a new variable U → a.
 * Every rule of the result is A → BC, A → a, or S₀ → ε.
 */
export function toCnf(g: Grammar): CnfResult {
  const used = new Set<Sym>(g.variables);
  let rules: Rule[] = g.rules.map((r) => ({ lhs: r.lhs, rhs: [...r.rhs] }));
  const stages: CnfStage[] = [];
  const s0 = freshName(used, g.start, 0);
  const snapshot = () => makeGrammar(s0, rules);
  const has = (r: Rule) => rules.some((x) => ruleKey(x) === ruleKey(r));
  const addRule = (r: Rule, added: Rule[]) => {
    if (has(r)) return;
    rules.push(r);
    added.push(r);
  };
  const removeRule = (r: Rule) => {
    rules = rules.filter((x) => ruleKey(x) !== ruleKey(r));
  };

  // 1. A new start variable.
  const startRule: Rule = { lhs: s0, rhs: [g.start] };
  rules.unshift(startRule);
  stages.push({ kind: 'start', removed: [], added: [startRule], grammar: snapshot() });

  // 2. ε-rules.
  const goneEps = new Set<Sym>();
  for (;;) {
    const target = rules.find((r) => r.rhs.length === 0 && r.lhs !== s0);
    if (!target) break;
    const A = target.lhs;
    removeRule(target);
    goneEps.add(A);
    const added: Rule[] = [];
    for (const r of [...rules]) {
      const at = r.rhs.flatMap((s, i) => (s === A ? [i] : []));
      if (!at.length) continue;
      // Every way of leaving out some of the occurrences, at least one.
      for (let mask = 1; mask < 1 << at.length; mask++) {
        const drop = new Set(at.filter((_, k) => mask & (1 << k)));
        const rhs = r.rhs.filter((_, i) => !drop.has(i));
        if (rhs.length === 0 && goneEps.has(r.lhs)) continue;
        addRule({ lhs: r.lhs, rhs }, added);
      }
    }
    stages.push({ kind: 'eps', target, removed: [target], added, grammar: snapshot() });
  }

  // 3. Unit rules.
  const goneUnit = new Set<string>();
  for (;;) {
    const target = rules.find((r) => r.rhs.length === 1 && isVariable(r.rhs[0]!));
    if (!target) break;
    const A = target.lhs;
    const B = target.rhs[0]!;
    removeRule(target);
    goneUnit.add(`${A}>${B}`);
    const added: Rule[] = [];
    if (A !== B) {
      for (const r of rules.filter((x) => x.lhs === B)) {
        const unit = r.rhs.length === 1 && isVariable(r.rhs[0]!);
        if (unit && goneUnit.has(`${A}>${r.rhs[0]}`)) continue;
        addRule({ lhs: A, rhs: [...r.rhs] }, added);
      }
    }
    stages.push({ kind: 'unit', target, removed: [target], added, grammar: snapshot() });
  }

  // 4a. Long rules, split into chains. Identical tails share a variable.
  const tails = new Map<string, Sym>();
  for (;;) {
    const target = rules.find((r) => r.rhs.length >= 3);
    if (!target) break;
    const added: Rule[] = [];
    const at = rules.indexOf(target);
    const chain: Rule[] = [];
    let lhs = target.lhs;
    for (let i = 0; i < target.rhs.length - 2; i++) {
      const tail = target.rhs.slice(i + 1);
      const key = tail.join(' ');
      const known = tails.get(key);
      const v = known ?? freshName(used, target.lhs, 1);
      chain.push({ lhs, rhs: [target.rhs[i]!, v] });
      if (known) {
        lhs = '';
        break;
      }
      tails.set(key, v);
      lhs = v;
    }
    if (lhs) chain.push({ lhs, rhs: target.rhs.slice(-2) });
    rules.splice(at, 1);
    // The chain takes the long rule's place, so the rule list keeps its order.
    const fresh = chain.filter((r) => !has(r));
    rules.splice(at, 0, ...fresh);
    added.push(...fresh);
    stages.push({ kind: 'long', target, removed: [target], added, grammar: snapshot() });
  }

  // 4b. Terminals in two-symbol rules.
  for (;;) {
    const r = rules.find((x) => x.rhs.length === 2 && x.rhs.some(isTerminal));
    if (!r) break;
    const a = r.rhs.find(isTerminal)!;
    const U = freshName(used, 'U', 1);
    const removed: Rule[] = [];
    const added: Rule[] = [];
    rules = rules.flatMap((x) => {
      if (x.rhs.length !== 2 || !x.rhs.includes(a)) return [x];
      removed.push(x);
      const y = { lhs: x.lhs, rhs: x.rhs.map((s) => (s === a ? U : s)) };
      added.push(y);
      return [y];
    });
    const unitRule = { lhs: U, rhs: [a] };
    rules.push(unitRule);
    added.push(unitRule);
    stages.push({ kind: 'term', terminal: a, variable: U, removed, added, grammar: snapshot() });
  }

  return { stages, cnf: snapshot() };
}

/** Whether every rule is A → BC, A → a, or S → ε for the start S, which is on no right side. */
export function isCnf(g: Grammar): boolean {
  return g.rules.every((r) => {
    if (r.rhs.length === 0) return r.lhs === g.start;
    if (r.rhs.length === 1) return isTerminal(r.rhs[0]!);
    return r.rhs.length === 2 && r.rhs.every((s) => isVariable(s) && s !== g.start);
  });
}

// ---------------------------------------------------------------------------------------------
// CYK (Sipser, Theorem 7.16)

export interface CykBack {
  /** For a substring of length 1: the rule A → a. Otherwise the split and the rule A → BC. */
  rule: number;
  /** Length of the left part. */
  k: number;
}

export interface CykResult {
  /** table[len - 1][i]: the variables that derive the substring of length len at i. */
  table: Sym[][][];
  /** How each variable got into each cell: key `${len},${i},${A}`. */
  back: Map<string, CykBack>;
  accept: boolean;
}

export const backKey = (len: number, i: number, A: Sym) => `${len},${i},${A}`;

/** Fill the CYK table for a grammar in Chomsky normal form. Variables keep grammar order. */
export function cyk(g: Grammar, w: readonly Sym[]): CykResult {
  const n = w.length;
  const back = new Map<string, CykBack>();
  if (n === 0) {
    return { table: [], back, accept: g.rules.some((r) => r.lhs === g.start && !r.rhs.length) };
  }
  const order = (set: Set<Sym>) => g.variables.filter((v) => set.has(v));
  const table: Sym[][][] = [];
  const row1: Sym[][] = [];
  for (let i = 0; i < n; i++) {
    const set = new Set<Sym>();
    g.rules.forEach((r, ri) => {
      if (r.rhs.length === 1 && r.rhs[0] === w[i] && !set.has(r.lhs)) {
        set.add(r.lhs);
        back.set(backKey(1, i, r.lhs), { rule: ri, k: 0 });
      }
    });
    row1.push(order(set));
  }
  table.push(row1);
  for (let len = 2; len <= n; len++) {
    const row: Sym[][] = [];
    for (let i = 0; i + len <= n; i++) {
      const set = new Set<Sym>();
      for (let k = 1; k < len; k++) {
        const left = table[k - 1]![i]!;
        const right = table[len - k - 1]![i + k]!;
        g.rules.forEach((r, ri) => {
          if (r.rhs.length !== 2 || set.has(r.lhs)) return;
          if (left.includes(r.rhs[0]!) && right.includes(r.rhs[1]!)) {
            set.add(r.lhs);
            back.set(backKey(len, i, r.lhs), { rule: ri, k });
          }
        });
      }
      row.push(order(set));
    }
    table.push(row);
  }
  return { table, back, accept: table[n - 1]![0]!.includes(g.start) };
}

/** A parse tree read back from a CYK table: from the start variable over the whole word. */
export function cykTree(g: Grammar, res: CykResult, w: readonly Sym[]): ParseTree | null {
  if (!res.accept) return null;
  const tree: ParseTree = [];
  const node = (sym: Sym, parent: number): number => {
    const id = tree.length;
    tree.push({ id, sym, kids: [], parent });
    if (parent >= 0) tree[parent]!.kids.push(id);
    return id;
  };
  if (w.length === 0) {
    node(EPS, node(g.start, -1));
    return tree;
  }
  const build = (A: Sym, len: number, i: number, parent: number) => {
    const id = node(A, parent);
    const b = res.back.get(backKey(len, i, A))!;
    const r = g.rules[b.rule]!;
    if (len === 1) {
      node(w[i]!, id);
      return;
    }
    build(r.rhs[0]!, b.k, i, id);
    build(r.rhs[1]!, len - b.k, i + b.k, id);
  };
  build(g.start, w.length, 0, -1);
  return tree;
}

/** Membership through Chomsky normal form and CYK: exact, in O(n³·|G|). */
export function derives(g: Grammar, w: readonly Sym[]): boolean {
  return cyk(toCnf(g).cnf, w).accept;
}

// ---------------------------------------------------------------------------------------------
// Brute force, for tests

/**
 * Every word of length at most n the grammar derives, by brute force: each variable's set of
 * words grows until nothing changes (words are terminals joined without spaces).
 */
export function wordsUpTo(g: Grammar, n: number): Set<string> {
  const sets = new Map<Sym, Set<string>>(g.variables.map((v) => [v, new Set<string>()]));
  const wordsOf = (s: Sym): Set<string> => (isVariable(s) ? sets.get(s)! : new Set([s]));
  for (let changed = true; changed;) {
    changed = false;
    for (const r of g.rules) {
      let acc = new Set<string>(['']);
      for (const s of r.rhs) {
        const next = new Set<string>();
        for (const u of acc)
          for (const v of wordsOf(s)) if (u.length + v.length <= n) next.add(u + v);
        acc = next;
        if (!acc.size) break;
      }
      const target = sets.get(r.lhs)!;
      for (const x of acc) {
        if (!target.has(x)) {
          target.add(x);
          changed = true;
        }
      }
    }
  }
  return sets.get(g.start)!;
}

/** Brute-force membership, for tests. */
export const inLanguage = (g: Grammar, w: readonly Sym[]): boolean =>
  wordsUpTo(g, w.length).has(w.join(''));
