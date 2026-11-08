/**
 * Formal regular expressions and Thompson's construction, shared by the regex pages.
 *
 * Syntax (Sipser 1.52), loosest binding first:
 *   R|S     union
 *   RS      concatenation
 *   R*      star; R+ one or more (RR*); R? optional (R or ε)
 *   (R)     grouping
 *   a       a symbol: one letter or digit
 *   ε       the empty string (also typed as the word "eps"); ∅ the empty language
 * Spaces are ignored. Nothing else is allowed: no character classes, no escapes, no
 * backreferences, so every expression here describes a regular language.
 *
 * Union sign: `|` by default, where + means "one or more". With `{ union: '+' }` (Hopcroft and
 * Ullman), + is union and there is no one-or-more; * and ? stay.
 *
 * "eps" stands for ε only as a word of its own: not next to another letter or digit, so
 * "steps" is five symbols and "a eps" is a followed by ε.
 *
 * API
 *   parseRegex(text, { union }) -> Regex, or an Error whose message says where the problem is
 *   readRegex(text, { union })  -> { text, tree }: the expression as shown (ε for eps, no
 *                                  spaces) and its tree, each node with its span in that text
 *   showRegex(r, union)         -> text with only the parentheses it needs
 *   regexSize(r)                -> m, its symbols and operators; regexSymbols(r) its alphabet
 *   thompson(r)                 -> { nfa, parts }: the NFA (states q0, q1, ... in the order they
 *                                  are made) and the fragment each node built, in build order
 *                                  (children before parents, as a post-order walk of the tree),
 *                                  for a page that animates the build. Exactly 2m states.
 *   matches(r, w)               -> a direct matcher, the tests' oracle
 */
import { EPS, makeAutomaton, type Automaton, type Move } from './automaton';

export type Regex =
  | { kind: 'sym'; c: string }
  | { kind: 'eps' }
  | { kind: 'empty' }
  | { kind: 'union'; a: Regex; b: Regex }
  | { kind: 'concat'; a: Regex; b: Regex }
  | { kind: 'star'; a: Regex }
  | { kind: 'plus'; a: Regex }
  | { kind: 'opt'; a: Regex };

export type UnionSign = '|' | '+';

export interface RegexOptions {
  /** The union sign: `|` (default; + is one or more) or `+` (no one-or-more). */
  union?: UnionSign;
}

/** A node of the expression with where it sits in the shown text. */
export interface RegexTree {
  r: Regex;
  /** [from, to) in the shown text, the parentheses that wrap exactly this part included. */
  span: [number, number];
  /** Its parts, in the order Thompson's construction builds them. */
  kids: RegexTree[];
}

export interface ParsedRegex {
  /** The expression as shown: "eps" read as ε, spaces removed. */
  text: string;
  tree: RegexTree;
}

export const MAX_REGEX = 40;

/** The text as shown: the word "eps" becomes ε and spaces go. */
export const regexText = (raw: string): string =>
  raw.replace(/(?<![A-Za-z0-9])eps(?![A-Za-z0-9])/g, EPS).replace(/\s+/g, '');

const POSTFIX: Record<UnionSign, string> = { '|': '*+?', '+': '*?' };

export function readRegex(raw: string, o: RegexOptions = {}): ParsedRegex | Error {
  const sign = o.union ?? '|';
  const text = regexText(raw);
  if (!text) return new Error(`Type a regular expression, such as (a${sign}b)*abb.`);
  if (text.length > MAX_REGEX)
    return new Error(`Keep the expression to ${MAX_REGEX} characters or fewer.`);
  let i = 0;
  const peek = () => text[i];
  const fail = (msg: string) => new Error(`${msg} (at character ${i + 1} of "${text}").`);
  const postfix = POSTFIX[sign];
  const other = sign === '|' ? '+' : '|';
  const node = (r: Regex, span: [number, number], kids: RegexTree[]): RegexTree => ({
    r,
    span,
    kids,
  });

  function union(): RegexTree | Error {
    let left = concat();
    while (!(left instanceof Error) && peek() === sign) {
      i++;
      const right = concat();
      if (right instanceof Error) return right;
      left = node(
        { kind: 'union', a: left.r, b: right.r },
        [left.span[0], right.span[1]],
        [left, right],
      );
    }
    return left;
  }
  function concat(): RegexTree | Error {
    let left: RegexTree | null = null;
    while (i < text.length && peek() !== sign && peek() !== ')') {
      const right = post();
      if (right instanceof Error) return right;
      left = left
        ? node(
            { kind: 'concat', a: left.r, b: right.r },
            [left.span[0], right.span[1]],
            [left, right],
          )
        : right;
    }
    return left ?? fail(`Something is missing on one side of ${sign} or inside ( )`);
  }
  function post(): RegexTree | Error {
    let t = atom();
    while (!(t instanceof Error) && postfix.includes(peek() ?? '\u0000')) {
      const op = text[i++];
      const kind = op === '*' ? 'star' : op === '+' ? 'plus' : 'opt';
      t = node({ kind, a: t.r }, [t.span[0], i], [t]);
    }
    return t;
  }
  function atom(): RegexTree | Error {
    const c = peek();
    const at = i;
    if (c === '(') {
      i++;
      const t = union();
      if (t instanceof Error) return t;
      if (peek() !== ')') return fail('A ( is never closed');
      i++;
      return { ...t, span: [at, i] };
    }
    if (c === EPS || c === '∅') {
      i++;
      return node({ kind: c === EPS ? 'eps' : 'empty' }, [at, i], []);
    }
    if (c && /^[A-Za-z0-9]$/.test(c)) {
      i++;
      return node({ kind: 'sym', c }, [at, i], []);
    }
    if (c && postfix.includes(c)) return fail(`${c} needs something before it`);
    if (c === ')') return fail('A ) has no matching (');
    if (c === other)
      return fail(
        sign === '+'
          ? '| is not used with this setting: + stands for union'
          : '+ needs something before it',
      );
    const ops = sign === '|' ? '|, *, +, ?' : '+, *, ?';
    return fail(`"${c}" is not allowed: use letters, digits, ε, ∅, ${ops}, ( and )`);
  }

  const t = union();
  if (t instanceof Error) return t;
  if (i < text.length) return fail(peek() === ')' ? 'A ) has no matching (' : 'Unexpected text');
  return { text, tree: t };
}

export function parseRegex(raw: string, o: RegexOptions = {}): Regex | Error {
  const p = readRegex(raw, o);
  return p instanceof Error ? p : p.tree.r;
}

const PREC = { union: 0, concat: 1, star: 2, plus: 2, opt: 2, sym: 3, eps: 3, empty: 3 };

/** The expression with only the parentheses it needs, union written with `union`. */
export function showRegex(r: Regex, union: UnionSign = '|'): string {
  const wrap = (s: Regex, min: number) =>
    PREC[s.kind] < min ? `(${showRegex(s, union)})` : showRegex(s, union);
  switch (r.kind) {
    case 'sym':
      return r.c;
    case 'eps':
      return EPS;
    case 'empty':
      return '∅';
    case 'union':
      return `${wrap(r.a, 0)}${union}${wrap(r.b, 1)}`;
    case 'concat':
      return `${wrap(r.a, 1)}${wrap(r.b, 2)}`;
    case 'star':
      return `${wrap(r.a, 3)}*`;
    case 'plus':
      // With + for union there is no one-or-more; write R+ as RR*.
      return union === '+' ? `${wrap(r.a, 3)}${wrap(r.a, 3)}*` : `${wrap(r.a, 3)}+`;
    case 'opt':
      return `${wrap(r.a, 3)}?`;
  }
}

/**
 * m, the length of the expression: its symbols (ε and ∅ included) and its operators, without
 * parentheses or the concatenations no one writes. Thompson's NFA has exactly 2m states.
 */
export function regexSize(r: Regex): number {
  switch (r.kind) {
    case 'sym':
    case 'eps':
    case 'empty':
      return 1;
    case 'concat':
      return regexSize(r.a) + regexSize(r.b);
    case 'union':
      return regexSize(r.a) + regexSize(r.b) + 1;
    case 'star':
    case 'plus':
    case 'opt':
      return regexSize(r.a) + 1;
  }
}

/** The symbols the expression uses, sorted. */
export function regexSymbols(r: Regex): string[] {
  const out = new Set<string>();
  const walk = (x: Regex) => {
    if (x.kind === 'sym') out.add(x.c);
    if ('a' in x) walk(x.a);
    if ('b' in x) walk(x.b);
  };
  walk(r);
  return [...out].sort();
}

/** The fragment one node of the expression built: its start and accept states and moves. */
export interface Fragment {
  /** The node's text, such as "a*" or "(a|b)". */
  text: string;
  kind: Regex['kind'];
  start: string;
  accept: string;
  /** Every state and move of the fragment, its children's included. */
  states: string[];
  moves: Move[];
  /** The moves this node added on top of its children's. */
  added: Move[];
}

/**
 * Thompson's construction: each node becomes a fragment with one start and one accept state,
 * so the NFA has exactly 2 states per symbol and operator (Sipser 1.54 builds the same
 * languages; this is the textbook form with ε-moves around union and star). R* adds a new start
 * and accept with ε-moves into R, back from its end to repeat it, out, and around it to skip
 * it; R+ is the same without the skip, and R? the same without the repeat.
 */
export function thompson(r: Regex): { nfa: Automaton; parts: Fragment[] } {
  let n = 0;
  const fresh = () => `q${n++}`;
  const parts: Fragment[] = [];
  const build = (r: Regex): Fragment => {
    const children: Fragment[] = [];
    const sub = (x: Regex) => {
      const f = build(x);
      children.push(f);
      return f;
    };
    let start: string;
    let accept: string;
    let added: Move[];
    switch (r.kind) {
      case 'sym':
      case 'eps':
      case 'empty':
        start = fresh();
        accept = fresh();
        added =
          r.kind === 'empty' ? [] : [{ from: start, on: r.kind === 'sym' ? r.c : EPS, to: accept }];
        break;
      case 'concat': {
        const a = sub(r.a);
        const b = sub(r.b);
        start = a.start;
        accept = b.accept;
        added = [{ from: a.accept, on: EPS, to: b.start }];
        break;
      }
      case 'union': {
        start = fresh();
        const a = sub(r.a);
        const b = sub(r.b);
        accept = fresh();
        added = [
          { from: start, on: EPS, to: a.start },
          { from: start, on: EPS, to: b.start },
          { from: a.accept, on: EPS, to: accept },
          { from: b.accept, on: EPS, to: accept },
        ];
        break;
      }
      case 'star':
      case 'plus':
      case 'opt': {
        start = fresh();
        const a = sub(r.a);
        accept = fresh();
        added = [{ from: start, on: EPS, to: a.start }];
        // R* and R+ may repeat R; R? may not.
        if (r.kind !== 'opt') added.push({ from: a.accept, on: EPS, to: a.start });
        added.push({ from: a.accept, on: EPS, to: accept });
        // R* and R? may skip R; R+ must read it at least once.
        if (r.kind !== 'plus') added.push({ from: start, on: EPS, to: accept });
        break;
      }
    }
    const states = [...new Set([start, ...children.flatMap((c) => c.states), accept])];
    const moves = [...children.flatMap((c) => c.moves), ...added];
    const f: Fragment = { text: showRegex(r), kind: r.kind, start, accept, states, moves, added };
    parts.push(f);
    return f;
  };
  const top = build(r);
  const nfa = makeAutomaton({
    states: top.states,
    alphabet: [],
    start: top.start,
    accept: [top.accept],
    moves: top.moves,
  });
  return { nfa, parts };
}

/**
 * Does the expression match the whole word? A direct reference, for tests. The positions each
 * subexpression can end at from each start are remembered, so nested concatenations cost
 * O(|r| · |w|²) set work instead of growing exponentially.
 */
export function matches(r: Regex, w: string): boolean {
  const memo = new Map<Regex, Map<number, Set<number>>>();
  const ends = (r: Regex, from: number): Set<number> => {
    let byStart = memo.get(r);
    if (!byStart) memo.set(r, (byStart = new Map()));
    let out = byStart.get(from);
    if (!out) byStart.set(from, (out = endsOf(r, from)));
    return out;
  };
  const endsOf = (r: Regex, from: number): Set<number> => {
    switch (r.kind) {
      case 'sym':
        return new Set(w[from] === r.c ? [from + 1] : []);
      case 'eps':
        return new Set([from]);
      case 'empty':
        return new Set();
      case 'union':
        return new Set([...ends(r.a, from), ...ends(r.b, from)]);
      case 'concat':
        return new Set([...ends(r.a, from)].flatMap((m) => [...ends(r.b, m)]));
      case 'opt':
        return new Set([from, ...ends(r.a, from)]);
      case 'star':
      case 'plus': {
        const out = new Set<number>(r.kind === 'star' ? [from] : []);
        let frontier = [from];
        const seen = new Set<number>();
        while (frontier.length) {
          const next: number[] = [];
          for (const p of frontier)
            for (const m of ends(r.a, p))
              if (!seen.has(m)) {
                seen.add(m);
                out.add(m);
                next.push(m);
              }
          frontier = next;
        }
        return out;
      }
    }
  };
  return ends(r, 0).has(w.length);
}
