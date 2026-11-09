/**
 * Brzozowski derivatives of regular expressions (the kit's Regex, src/viz/_automata/regex.ts).
 *
 * d_c(r) is an expression for the words w with cw in L(r): what is left of r after reading c.
 * ν(r) (nullable) says whether r matches the empty word. A word c₁…cₙ matches r exactly when
 * ν(d_cₙ(…d_c₁(r)…)). The rules:
 *
 *   d_c(∅) = d_c(ε) = ∅      d_c(c) = ε      d_c(b) = ∅ for b ≠ c
 *   d_c(r|s) = d_c(r) | d_c(s)
 *   d_c(rs)  = d_c(r)s | d_c(s) if ν(r), else d_c(r)s
 *   d_c(r*)  = d_c(r)r*      d_c(r+) = d_c(r)r*      d_c(r?) = d_c(r)
 *
 * Expressions are built with smart constructors that simplify as they go:
 * - 'basic': ∅|r = r|∅ = r, ∅r = r∅ = ∅, εr = rε = r, ∅* = ε* = ε;
 * - 'aci' adds Brzozowski's similarity: | is associative, commutative and idempotent (the
 *   alternatives are kept flat, sorted by their text and without repeats), and (r*)* = r*.
 *   With it, every expression has finitely many derivatives, so the derivatives are the states
 *   of a DFA.
 *
 * Concatenation is kept nested to the right, r(st), as the textbooks take derivatives: then
 * d_a(abb) is bb, and d_a((a|b)*abb) comes out as (a|b)*abb|bb. `rightNest` turns the parser's
 * left-nested chains around without other changes. `show` writes concatenation without
 * parentheses either way, and an expression's text (`key`) names it among simplified ones.
 */
import { EPS } from '../_automata/automaton';
import { regexSize, type Regex, type UnionSign } from '../_automata/regex';

export type Similarity = 'aci' | 'basic';

export const EMPTY: Regex = { kind: 'empty' };
export const EPSILON: Regex = { kind: 'eps' };

const PREC = { union: 0, concat: 1, star: 2, plus: 2, opt: 2, sym: 3, eps: 3, empty: 3 };

/** The expression with only the parentheses it needs; concatenation is associative. */
export function show(r: Regex, u: UnionSign = '|'): string {
  const wrap = (s: Regex, min: number) => (PREC[s.kind] < min ? `(${show(s, u)})` : show(s, u));
  switch (r.kind) {
    case 'sym':
      return r.c;
    case 'eps':
      return EPS;
    case 'empty':
      return '∅';
    case 'union':
      return `${wrap(r.a, 0)}${u}${wrap(r.b, 1)}`;
    case 'concat':
      return `${wrap(r.a, 1)}${wrap(r.b, 1)}`;
    case 'star':
      return `${wrap(r.a, 3)}*`;
    case 'plus':
      // With + for union there is no one-or-more; write R+ as RR*.
      return u === '+' ? `${wrap(r.a, 3)}${wrap(r.a, 3)}*` : `${wrap(r.a, 3)}+`;
    case 'opt':
      return `${wrap(r.a, 3)}?`;
  }
}

/** The expression's text with | for union: equal texts, equal simplified expressions. */
export const key = (r: Regex): string => show(r, '|');

export function nullable(r: Regex): boolean {
  switch (r.kind) {
    case 'eps':
    case 'star':
    case 'opt':
      return true;
    case 'empty':
    case 'sym':
      return false;
    case 'union':
      return nullable(r.a) || nullable(r.b);
    case 'concat':
      return nullable(r.a) && nullable(r.b);
    case 'plus':
      return nullable(r.a);
  }
}

/** Concatenations nested to the right, (rs)t becoming r(st); nothing else changes. */
export function rightNest(r: Regex): Regex {
  switch (r.kind) {
    case 'sym':
    case 'eps':
    case 'empty':
      return r;
    case 'concat': {
      const a = rightNest(r.a);
      const b = rightNest(r.b);
      return a.kind === 'concat'
        ? rightNest({ kind: 'concat', a: a.a, b: { kind: 'concat', a: a.b, b } })
        : { kind: 'concat', a, b };
    }
    case 'union':
      return { kind: 'union', a: rightNest(r.a), b: rightNest(r.b) };
    default:
      return { kind: r.kind, a: rightNest(r.a) };
  }
}

/** The alternatives of a union, flattened. */
function alternatives(r: Regex): Regex[] {
  return r.kind === 'union' ? [...alternatives(r.a), ...alternatives(r.b)] : [r];
}

export function union(a: Regex, b: Regex, sim: Similarity): Regex {
  if (sim === 'basic') {
    if (a.kind === 'empty') return b;
    if (b.kind === 'empty') return a;
    return { kind: 'union', a, b };
  }
  const seen = new Map<string, Regex>();
  for (const x of [...alternatives(a), ...alternatives(b)])
    if (x.kind !== 'empty') seen.set(key(x), x);
  const xs = [...seen.entries()].sort(([p], [q]) => (p < q ? -1 : p > q ? 1 : 0)).map(([, x]) => x);
  if (!xs.length) return EMPTY;
  return xs.reduce((acc, x) => ({ kind: 'union', a: acc, b: x }));
}

export function concat(a: Regex, b: Regex): Regex {
  if (a.kind === 'empty' || b.kind === 'empty') return EMPTY;
  if (a.kind === 'eps') return b;
  if (b.kind === 'eps') return a;
  // Keep concatenation nested to the right: (ab)c becomes a(bc).
  if (a.kind === 'concat') return concat(a.a, concat(a.b, b));
  return { kind: 'concat', a, b };
}

export function star(a: Regex, sim: Similarity): Regex {
  if (a.kind === 'empty' || a.kind === 'eps') return EPSILON;
  if (sim === 'aci' && a.kind === 'star') return a;
  return { kind: 'star', a };
}

/** The same expression rebuilt with the smart constructors. */
export function simplify(r: Regex, sim: Similarity): Regex {
  switch (r.kind) {
    case 'sym':
    case 'eps':
    case 'empty':
      return r;
    case 'union':
      return union(simplify(r.a, sim), simplify(r.b, sim), sim);
    case 'concat':
      return concat(simplify(r.a, sim), simplify(r.b, sim));
    case 'star':
      return star(simplify(r.a, sim), sim);
    case 'plus':
      return { kind: 'plus', a: simplify(r.a, sim) };
    case 'opt':
      return { kind: 'opt', a: simplify(r.a, sim) };
  }
}

/** Which rule a node's derivative uses: the id of its pseudocode line. */
export type RuleId =
  'd.base' | 'd.sym' | 'd.union' | 'd.concat' | 'd.concat1' | 'd.star' | 'd.plus' | 'd.opt';

export function ruleOf(r: Regex): RuleId {
  switch (r.kind) {
    case 'empty':
    case 'eps':
      return 'd.base';
    case 'sym':
      return 'd.sym';
    case 'union':
      return 'd.union';
    case 'concat':
      return nullable(r.a) ? 'd.concat' : 'd.concat1';
    case 'star':
      return 'd.star';
    case 'plus':
      return 'd.plus';
    case 'opt':
      return 'd.opt';
  }
}

/**
 * The derivative, from the derivatives of the node's parts (`da`, `db`): what the rule gives
 * before simplifying (`raw`, built without the smart constructors) and after (`d`). A part the
 * rule keeps as it is (s in d_c(r)s, the star in d_c(r)r*) is simplified first, so the result
 * is the same whether r was simplified or typed with extra ∅s, εs or parentheses.
 */
export function step(
  r: Regex,
  c: string,
  da: Regex | undefined,
  db: Regex | undefined,
  sim: Similarity,
): { raw: Regex; d: Regex } {
  switch (r.kind) {
    case 'empty':
    case 'eps':
      return { raw: EMPTY, d: EMPTY };
    case 'sym':
      return r.c === c ? { raw: EPSILON, d: EPSILON } : { raw: EMPTY, d: EMPTY };
    case 'union':
      return { raw: { kind: 'union', a: da!, b: db! }, d: union(da!, db!, sim) };
    case 'concat': {
      const rest = simplify(r.b, sim);
      const left: Regex = { kind: 'concat', a: da!, b: rest };
      if (!nullable(r.a)) return { raw: left, d: concat(da!, rest) };
      return {
        raw: { kind: 'union', a: left, b: db! },
        d: union(concat(da!, rest), db!, sim),
      };
    }
    case 'star': {
      const again = simplify(r, sim);
      return { raw: { kind: 'concat', a: da!, b: again }, d: concat(da!, again) };
    }
    case 'plus': {
      const again = star(simplify(r.a, sim), sim);
      return { raw: { kind: 'concat', a: da!, b: again }, d: concat(da!, again) };
    }
    case 'opt':
      return { raw: da!, d: da! };
  }
}

/** One part of the expression, as the derivative works it out: smallest parts first. */
export interface NodeRow {
  r: Regex;
  /** The part's text. */
  text: string;
  nu: boolean;
  raw: Regex;
  d: Regex;
  rule: RuleId;
}

/** The derivative part by part, parts before the whole: the parts of rightNest(r). */
export function deriveRows(r: Regex, c: string, sim: Similarity, u: UnionSign): NodeRow[] {
  const rows: NodeRow[] = [];
  const walk = (t: Regex): Regex => {
    const da = 'a' in t ? walk(t.a) : undefined;
    const db = 'b' in t ? walk(t.b) : undefined;
    const { raw, d } = step(t, c, da, db, sim);
    rows.push({ r: t, text: show(t, u), nu: nullable(t), raw, d, rule: ruleOf(t) });
    return d;
  };
  walk(rightNest(r));
  return rows;
}

/** The derivative of r by c, with the smart constructors: the last row of deriveRows. */
export function derive(r: Regex, c: string, sim: Similarity): Regex {
  const da = 'a' in r ? derive(r.a, c, sim) : undefined;
  // d_c(rs) needs d_c(s) only when r can be empty.
  const db = 'b' in r && (r.kind === 'union' || nullable(r.a)) ? derive(r.b, c, sim) : undefined;
  return step(r, c, da, db ?? EMPTY, sim).d;
}

/** ε for the empty word in narration. */
export const wordText = (w: string): string => (w === '' ? EPS : w);

export { regexSize };
