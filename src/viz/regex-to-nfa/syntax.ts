/**
 * Reading a regular expression for this page. It follows the kit's grammar (parseRegex in
 * src/viz/_automata/regex.ts) and adds two things the page needs:
 *
 * - Spans: every node of the tree knows where it sits in the text as typed (parentheses that
 *   wrap exactly that part included), so the view can highlight the part just built.
 * - The union sign. With `|` (the default) union is `|` and `+` means one or more, as in the
 *   kit. With `+` (as in Hopcroft and Ullman), `+` is union and there is no one-or-more; `*` and
 *   `?` stay.
 *
 * The tree itself is the kit's Regex, so thompson() and matches() work on it unchanged.
 */
import { EPS } from '../_automata/automaton';
import { MAX_REGEX, type Regex } from '../_automata/regex';

export type UnionSign = '|' | '+';

export interface Tree {
  r: Regex;
  /** [from, to) in the shown text. */
  span: [number, number];
  /** The children, in the order the construction builds them. */
  kids: Tree[];
}

export interface Parsed {
  /** The expression as shown: "eps" read as ε, spaces removed. */
  text: string;
  tree: Tree;
}

/** The text as the page shows it: "eps" becomes ε and spaces go. */
export const normalize = (raw: string): string => raw.replace(/eps/g, EPS).replace(/\s+/g, '');

const POSTFIX: Record<UnionSign, string> = { '|': '*+?', '+': '*?' };

export function parse(raw: string, sign: UnionSign = '|'): Parsed | Error {
  const text = normalize(raw);
  if (!text) return new Error('Type a regular expression, such as (a|b)*abb.');
  if (text.length > MAX_REGEX)
    return new Error(`Keep the expression to ${MAX_REGEX} characters or fewer.`);
  let i = 0;
  const peek = () => text[i];
  const fail = (msg: string) => new Error(`${msg} (at character ${i + 1} of "${text}").`);
  const postfix = POSTFIX[sign];
  const other = sign === '|' ? '+' : '|';

  function union(): Tree | Error {
    let left = concat();
    while (!(left instanceof Error) && peek() === sign) {
      i++;
      const right = concat();
      if (right instanceof Error) return right;
      left = {
        r: { kind: 'union', a: left.r, b: right.r },
        span: [left.span[0], right.span[1]],
        kids: [left, right],
      };
    }
    return left;
  }
  function concat(): Tree | Error {
    let left: Tree | null = null;
    while (i < text.length && peek() !== sign && peek() !== ')') {
      const right = post();
      if (right instanceof Error) return right;
      left = left
        ? {
            r: { kind: 'concat', a: left.r, b: right.r },
            span: [left.span[0], right.span[1]],
            kids: [left, right],
          }
        : right;
    }
    return left ?? fail(`Something is missing on one side of ${sign} or inside ( )`);
  }
  function post(): Tree | Error {
    let t = atom();
    while (!(t instanceof Error) && postfix.includes(peek() ?? '\u0000')) {
      const op = text[i++];
      t = {
        r: { kind: op === '*' ? 'star' : op === '+' ? 'plus' : 'opt', a: t.r },
        span: [t.span[0], i],
        kids: [t],
      };
    }
    return t;
  }
  function atom(): Tree | Error {
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
      return { r: { kind: c === EPS ? 'eps' : 'empty' }, span: [at, i], kids: [] };
    }
    if (c && /^[A-Za-z0-9]$/.test(c)) {
      i++;
      return { r: { kind: 'sym', c }, span: [at, i], kids: [] };
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

const PREC = { union: 0, concat: 1, star: 2, plus: 2, opt: 2, sym: 3, eps: 3, empty: 3 };

/** The expression with only the parentheses it needs, union written with `sign`. */
export function show(r: Regex, sign: UnionSign = '|'): string {
  const wrap = (s: Regex, min: number) =>
    PREC[s.kind] < min ? `(${show(s, sign)})` : show(s, sign);
  switch (r.kind) {
    case 'sym':
      return r.c;
    case 'eps':
      return EPS;
    case 'empty':
      return '∅';
    case 'union':
      return `${wrap(r.a, 0)}${sign}${wrap(r.b, 1)}`;
    case 'concat':
      return `${wrap(r.a, 1)}${wrap(r.b, 2)}`;
    case 'star':
      return `${wrap(r.a, 3)}*`;
    case 'plus':
      // With + for union there is no one-or-more; write R+ as RR*.
      return sign === '+' ? `${wrap(r.a, 3)}${wrap(r.a, 3)}*` : `${wrap(r.a, 3)}+`;
    case 'opt':
      return `${wrap(r.a, 3)}?`;
  }
}

/**
 * m, the length of the expression: its symbols (ε and ∅ included) and its operators, without
 * parentheses or the concatenations no one writes. Thompson's NFA has exactly 2m states when
 * the expression has no `?`.
 */
export function size(r: Regex): number {
  switch (r.kind) {
    case 'sym':
    case 'eps':
    case 'empty':
      return 1;
    case 'concat':
      return size(r.a) + size(r.b);
    case 'union':
      return size(r.a) + size(r.b) + 1;
    case 'star':
    case 'plus':
    case 'opt':
      return size(r.a) + 1;
  }
}

/** The symbols the expression uses, sorted. */
export function symbols(r: Regex): string[] {
  const out = new Set<string>();
  const walk = (x: Regex) => {
    if (x.kind === 'sym') out.add(x.c);
    if ('a' in x) walk(x.a);
    if ('b' in x) walk(x.b);
  };
  walk(r);
  return [...out].sort();
}
