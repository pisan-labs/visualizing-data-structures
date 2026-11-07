/**
 * The two constructions this page builds, as one list of fragments in build order (children
 * before parents), so the model can show one fragment per step.
 *
 * - Thompson's construction comes from the kit (thompson() in src/viz/_automata/regex.ts): one
 *   start and one accept state per fragment, ε-moves around union and star. R+ is a star with
 *   no skip, and R? a star with no repeat, so every fragment is a part of the text.
 * - Sipser's construction (Introduction to the Theory of Computation, Theorem 1.54 and Lemma
 *   1.55, with the constructions of Theorems 1.45, 1.47 and 1.49) is built here. A symbol is
 *   two states; ε is one accepting state; ∅ is one state that does not accept. Union adds a
 *   new start with ε-moves to both starts;
 *   concatenation adds ε-moves from each accept of the first to the start of the second; star
 *   adds a new start that accepts, an ε-move from it to the old start, and ε-moves from the
 *   accepts back to the old start. Sipser has no R+ or R?; here R+ is the star without the new
 *   start, and R? is a new accepting start with an ε-move to R's start.
 */
import { EPS, makeAutomaton, sortStates, type Automaton, type Move } from '../_automata/automaton';
import { thompson, type ParsedRegex, type RegexTree } from '../_automata/regex';

export type Construction = 'thompson' | 'sipser';

export interface Frag {
  kind: RegexTree['r']['kind'];
  /** Where the part sits in the shown text. */
  span: [number, number];
  /** The part as written, such as "(a|b)*". */
  text: string;
  start: string;
  /** Thompson: exactly one. Sipser: any number. */
  accepts: string[];
  /** Every state of the fragment, its children's included, in name order. */
  states: string[];
  /** The states this part made itself. */
  fresh: string[];
  /** Every move of the fragment, its children's included. */
  moves: Move[];
  /** The moves this part added on top of its children's. */
  added: Move[];
  /** Indices of its children in the fragment list. */
  kids: number[];
}

export interface Built {
  nfa: Automaton;
  frags: Frag[];
}

export function construct(p: ParsedRegex, how: Construction): Built {
  return how === 'sipser' ? sipser(p) : thompsonFrags(p);
}

function thompsonFrags(p: ParsedRegex): Built {
  const { nfa, parts } = thompson(p.tree.r);
  const frags: Frag[] = [];
  // The kit builds in post order: children before parents, left to right.
  const walk = (t: RegexTree): number => {
    const kids = t.kids.map((k) => walk(k));
    const k = frags.length;
    const part = parts[k]!;
    if (part.kind !== t.r.kind) throw new Error(`Build order differs at part ${k}`);
    const inner = new Set(kids.flatMap((j) => frags[j]!.states));
    frags.push({
      kind: part.kind,
      span: t.span,
      text: p.text.slice(t.span[0], t.span[1]),
      start: part.start,
      accepts: [part.accept],
      states: sortStates(part.states),
      fresh: sortStates(part.states.filter((q) => !inner.has(q))),
      moves: part.moves,
      added: part.added,
      kids,
    });
    return k;
  };
  walk(p.tree);
  if (frags.length !== parts.length) throw new Error('Build order lost a part');
  return { nfa, frags };
}

function sipser(p: ParsedRegex): Built {
  let n = 0;
  const fresh = () => `q${n++}`;
  const frags: Frag[] = [];
  const eps = (from: string, to: string): Move => ({ from, on: EPS, to });
  const build = (t: RegexTree): number => {
    const r = t.r;
    let start: string;
    let accepts: string[];
    let made: string[] = [];
    let added: Move[] = [];
    let kids: number[] = [];
    // New start states are named before the parts they lead into, so q0 is the NFA's start.
    switch (r.kind) {
      case 'sym': {
        start = fresh();
        const f = fresh();
        made = [start, f];
        added = [{ from: start, on: r.c, to: f }];
        accepts = [f];
        break;
      }
      case 'eps':
      case 'empty':
        start = fresh();
        made = [start];
        accepts = r.kind === 'eps' ? [start] : [];
        break;
      case 'union': {
        start = fresh();
        made = [start];
        kids = t.kids.map(build);
        const [a, b] = kids.map((k) => frags[k]!) as [Frag, Frag];
        added = [eps(start, a.start), eps(start, b.start)];
        accepts = [...a.accepts, ...b.accepts];
        break;
      }
      case 'concat': {
        kids = t.kids.map(build);
        const [a, b] = kids.map((k) => frags[k]!) as [Frag, Frag];
        start = a.start;
        added = a.accepts.map((f) => eps(f, b.start));
        accepts = b.accepts;
        break;
      }
      case 'star':
      case 'opt': {
        start = fresh();
        made = [start];
        kids = t.kids.map(build);
        const a = frags[kids[0]!]!;
        added = [eps(start, a.start)];
        if (r.kind === 'star') added.push(...a.accepts.map((f) => eps(f, a.start)));
        accepts = [start, ...a.accepts];
        break;
      }
      case 'plus': {
        kids = t.kids.map(build);
        const a = frags[kids[0]!]!;
        start = a.start;
        added = a.accepts.map((f) => eps(f, a.start));
        accepts = a.accepts;
        break;
      }
    }
    const inner = kids.map((k) => frags[k]!);
    frags.push({
      kind: r.kind,
      span: t.span,
      text: p.text.slice(t.span[0], t.span[1]),
      start,
      accepts: sortStates(accepts),
      states: sortStates([...made, ...inner.flatMap((f) => f.states)]),
      fresh: sortStates(made),
      moves: [...inner.flatMap((f) => f.moves), ...added],
      added,
      kids,
    });
    return frags.length - 1;
  };
  const top = frags[build(p.tree)]!;
  const nfa = makeAutomaton({
    states: top.states,
    alphabet: [],
    start: top.start,
    accept: top.accepts,
    moves: top.moves,
  });
  return { nfa, frags };
}

/** The fragments built and not yet used by a parent, after the first `built` steps. */
export function pending(frags: readonly Frag[], built: number): number[] {
  const used = new Set(frags.slice(0, built).flatMap((f) => f.kids));
  return Array.from({ length: built }, (_, k) => k).filter((k) => !used.has(k));
}
