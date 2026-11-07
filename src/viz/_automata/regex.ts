/**
 * Formal regular expressions and Thompson's construction, shared by the regex pages.
 *
 * Syntax (Sipser 1.52), loosest binding first:
 *   R|S     union (only |: + means "one or more" here, not union as in some books)
 *   RS      concatenation
 *   R*      star; R+ one or more (RR*); R? optional (R|ε)
 *   (R)     grouping
 *   a       a symbol: one letter or digit
 *   ε       the empty string (also typed as "eps"); ∅ the empty language
 * Spaces are ignored. Nothing else is allowed: no character classes, no escapes, no
 * backreferences, so every expression here describes a regular language.
 *
 * API
 *   parseRegex(text) -> Regex or an Error whose message says where the problem is
 *   showRegex(r)     -> text with only the parentheses it needs
 *   thompson(r)      -> { nfa, parts }: the NFA (states q0, q1, ... in the order they are made)
 *                       and the fragment each node of the expression built, in build order
 *                       (children before parents), for a page that animates the build.
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

export const MAX_REGEX = 40;

export function parseRegex(raw: string): Regex | Error {
  const text = raw.replace(/eps/g, EPS).replace(/\s+/g, '');
  if (!text) return new Error('Type a regular expression, such as (a|b)*abb.');
  if (text.length > MAX_REGEX)
    return new Error(`Keep the expression to ${MAX_REGEX} characters or fewer.`);
  let i = 0;
  const peek = () => text[i];
  const fail = (msg: string) => new Error(`${msg} (at character ${i + 1} of "${text}").`);

  function union(): Regex | Error {
    let left = concat();
    while (!(left instanceof Error) && peek() === '|') {
      i++;
      const right = concat();
      if (right instanceof Error) return right;
      left = { kind: 'union', a: left, b: right };
    }
    return left;
  }
  function concat(): Regex | Error {
    let left: Regex | null = null;
    while (i < text.length && peek() !== '|' && peek() !== ')') {
      const right = postfix();
      if (right instanceof Error) return right;
      left = left ? { kind: 'concat', a: left, b: right } : right;
    }
    return left ?? fail('Something is missing on one side of | or inside ( )');
  }
  function postfix(): Regex | Error {
    let r = atom();
    while (!(r instanceof Error) && (peek() === '*' || peek() === '+' || peek() === '?')) {
      const op = text[i++];
      r = { kind: op === '*' ? 'star' : op === '+' ? 'plus' : 'opt', a: r };
    }
    return r;
  }
  function atom(): Regex | Error {
    const c = peek();
    if (c === '(') {
      i++;
      const r = union();
      if (r instanceof Error) return r;
      if (peek() !== ')') return fail('A ( is never closed');
      i++;
      return r;
    }
    if (c === EPS) {
      i++;
      return { kind: 'eps' };
    }
    if (c === '∅') {
      i++;
      return { kind: 'empty' };
    }
    if (c && /^[A-Za-z0-9]$/.test(c)) {
      i++;
      return { kind: 'sym', c };
    }
    if (c === '*' || c === '+' || c === '?') return fail(`${c} needs something before it`);
    if (c === ')') return fail('A ) has no matching (');
    return fail(`"${c}" is not allowed: use letters, digits, ε, |, *, +, ?, ( and )`);
  }

  const r = union();
  if (r instanceof Error) return r;
  if (i < text.length) return fail(peek() === ')' ? 'A ) has no matching (' : 'Unexpected text');
  return r;
}

const PREC = { union: 0, concat: 1, star: 2, plus: 2, opt: 2, sym: 3, eps: 3, empty: 3 };

export function showRegex(r: Regex): string {
  const wrap = (s: Regex, min: number) => (PREC[s.kind] < min ? `(${showRegex(s)})` : showRegex(s));
  switch (r.kind) {
    case 'sym':
      return r.c;
    case 'eps':
      return EPS;
    case 'empty':
      return '∅';
    case 'union':
      return `${wrap(r.a, 0)}|${wrap(r.b, 1)}`;
    case 'concat':
      return `${wrap(r.a, 1)}${wrap(r.b, 2)}`;
    case 'star':
      return `${wrap(r.a, 3)}*`;
    case 'plus':
      return `${wrap(r.a, 3)}+`;
    case 'opt':
      return `${wrap(r.a, 3)}?`;
  }
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
 * Thompson's construction: each node becomes a fragment with one start and one accept state
 * (Sipser 1.54 builds the same languages; this is the textbook form with ε-moves around
 * union and star). `plus` is built as R R* and `opt` as R | ε, so every fragment still has
 * one start and one accept state.
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
      case 'union':
      case 'opt': {
        start = fresh();
        const a = sub(r.a);
        const b = r.kind === 'union' ? sub(r.b) : sub({ kind: 'eps' });
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
      case 'plus': {
        start = fresh();
        const a = sub(r.a);
        accept = fresh();
        added = [
          { from: start, on: EPS, to: a.start },
          { from: a.accept, on: EPS, to: a.start },
          { from: a.accept, on: EPS, to: accept },
        ];
        // R* may skip R; R+ must read it at least once.
        if (r.kind === 'star') added.push({ from: start, on: EPS, to: accept });
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

/** Does the expression match the whole word? A direct reference, for tests. */
export function matches(r: Regex, w: string): boolean {
  const ends = (r: Regex, from: number): Set<number> => {
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
