/**
 * The generalized NFA (GNFA) of Sipser's Lemma 1.60, and the regular expressions on its arrows.
 *
 * A GNFA has one start state with no arrows in, one accept state with no arrows out, and an
 * arrow labeled with a regular expression between every other pair of states (a loop included).
 * An arrow labeled ∅ can never be taken, so it is not stored and not drawn: no arrow means ∅.
 *
 * Expressions use the shared Regex type (src/viz/_automata/regex.ts), so the shared matcher
 * and size work on them, and are written in Sipser's notation: ∪ for union, ε, ∅, and only the
 * parentheses needed. Union and concatenation are associative, so a ∪ (b ∪ c) is written
 * a∪b∪c. With simplification on, the constructors apply the identities with ∅ and ε:
 *
 *   R∅ = ∅R = ∅      Rε = εR = R      R ∪ ∅ = ∅ ∪ R = R      ε* = ε      ∅* = ε
 *
 * and record which ones they used, for the narration. Nothing else is simplified (not even
 * R ∪ R = R), so the code tabs can do exactly the same.
 *
 * API
 *   union(a, b, o), concat(a, b, o), star(a, o)   build, simplifying when o.simplify
 *   show(r)                                       the text, "ab*(a∪b)"
 *   makeGnfa(dfa)                                 the DFA with a new start and accept state,
 *                                                 one arrow per symbol (merge() unites them)
 *   merge(g, o)                                   one arrow per pair, labeled with a union
 *   paths(g, q)                                   the arrows into and out of q, and its loop
 *   ripOrder / pickRip(g, order)                  which state to remove next
 *   rip(g, q, o)                                  remove q, updating every pair through it
 *   toRegex(dfa, settings)                        the whole conversion, for tests and practice
 */
import { compareNames } from '../_graph/graph';
import { EPS, type Automaton } from '../_automata/automaton';
import { regexSize, type Regex } from '../_automata/regex';

export type Simplify = 'none' | 'identities';
export type Order = 'name' | 'fewest';

export const EMPTY: Regex = { kind: 'empty' };
export const EPSILON: Regex = { kind: 'eps' };
export const sym = (c: string): Regex => (c === EPS ? EPSILON : { kind: 'sym', c });

/** The identities, as the narration names them. */
export const IDENTITIES = {
  concatEmpty: 'R∅ = ∅',
  concatEps: 'Rε = R',
  unionEmpty: 'R ∪ ∅ = R',
  starEps: 'ε* = ε',
  starEmpty: '∅* = ε',
} as const;

export interface BuildOptions {
  simplify: boolean;
  /** The identities used, in the order first used. */
  used?: string[];
}

const use = (o: BuildOptions | undefined, rule: string) => {
  if (o?.used && !o.used.includes(rule)) o.used.push(rule);
};

export function union(a: Regex, b: Regex, o?: BuildOptions): Regex {
  if (o?.simplify) {
    if (a.kind === 'empty' || b.kind === 'empty') {
      use(o, IDENTITIES.unionEmpty);
      return a.kind === 'empty' ? b : a;
    }
  }
  return { kind: 'union', a, b };
}

export function concat(a: Regex, b: Regex, o?: BuildOptions): Regex {
  if (o?.simplify) {
    if (a.kind === 'empty' || b.kind === 'empty') {
      use(o, IDENTITIES.concatEmpty);
      return EMPTY;
    }
    if (a.kind === 'eps' || b.kind === 'eps') {
      use(o, IDENTITIES.concatEps);
      return a.kind === 'eps' ? b : a;
    }
  }
  return { kind: 'concat', a, b };
}

export function star(a: Regex, o?: BuildOptions): Regex {
  if (o?.simplify && (a.kind === 'eps' || a.kind === 'empty')) {
    use(o, a.kind === 'eps' ? IDENTITIES.starEps : IDENTITIES.starEmpty);
    return EPSILON;
  }
  return { kind: 'star', a };
}

/** Sipser's notation with only the parentheses needed: concatenation wraps a union, and a star
 * wraps anything longer than one symbol. */
export function show(r: Regex): string {
  switch (r.kind) {
    case 'sym':
      return r.c;
    case 'eps':
      return 'ε';
    case 'empty':
      return '∅';
    case 'union':
      return `${show(r.a)}∪${show(r.b)}`;
    case 'concat':
      return `${factor(r.a)}${factor(r.b)}`;
    case 'star':
      return `${atom(r.a)}*`;
    case 'plus':
      return `${atom(r.a)}+`;
    case 'opt':
      return `${atom(r.a)}?`;
  }
}

const factor = (r: Regex) => (r.kind === 'union' ? `(${show(r)})` : show(r));
const atom = (r: Regex) =>
  r.kind === 'sym' || r.kind === 'eps' || r.kind === 'empty' ? show(r) : `(${show(r)})`;

/** m: symbols (ε and ∅ included) and operators, as regex.ts counts them. */
export const size = (r: Regex): number => regexSize(r);

// ---------------------------------------------------------------------------------------------
// The GNFA

export interface Arrow {
  from: string;
  to: string;
  r: Regex;
  /** show(r), or before merging the symbols as the DFA writes them ("a,b"). */
  text: string;
}

export interface Gnfa {
  /** The new start state first, then the DFA's states left, then the new accept state. */
  states: string[];
  start: string;
  accept: string;
  /** At most one per pair once merged; sorted by from, then to, in the order of `states`. */
  arrows: Arrow[];
}

/** A name for a new state that the DFA does not use. */
function fresh(taken: readonly string[], names: string[]): string {
  for (const n of names) if (!taken.includes(n)) return n;
  for (let i = 2; ; i++) if (!taken.includes(`${names[0]}${i}`)) return `${names[0]}${i}`;
}

/** The new start and accept states' names: s and f, unless the DFA already uses them. */
export function endNames(dfa: Automaton): { s: string; f: string } {
  const s = fresh(dfa.states, ['s', 'S', 'start']);
  const f = fresh([...dfa.states, s], ['f', 'F', 'final']);
  return { s, f };
}

export function sortArrows(g: Pick<Gnfa, 'states'>, arrows: Arrow[]): Arrow[] {
  const at = (q: string) => g.states.indexOf(q);
  return [...arrows].sort((x, y) => at(x.from) - at(y.from) || at(x.to) - at(y.to));
}

/**
 * The DFA as a GNFA: a new start state with an ε-arrow to the old start, and a new accept
 * state with an ε-arrow from each old accept state. Each DFA move is still an arrow of its own,
 * so a pair can have several until merge() unites them.
 */
export function makeGnfa(dfa: Automaton): Gnfa {
  const { s, f } = endNames(dfa);
  const states = [s, ...[...dfa.states].sort(compareNames), f];
  const arrows: Arrow[] = [
    { from: s, to: dfa.start, r: EPSILON, text: 'ε' },
    ...dfa.moves.map((m) => ({ from: m.from, to: m.to, r: sym(m.on), text: m.on })),
    ...dfa.accept.map((q) => ({ from: q, to: f, r: EPSILON, text: 'ε' })),
  ];
  return { states, start: s, accept: f, arrows: sortArrows({ states }, arrows) };
}

/** Pairs with more than one arrow, in order. */
export function parallel(g: Gnfa): [string, string][] {
  const out: [string, string][] = [];
  for (const a of g.arrows)
    if (
      g.arrows.filter((b) => b.from === a.from && b.to === a.to).length > 1 &&
      !out.some(([p, q]) => p === a.from && q === a.to)
    )
      out.push([a.from, a.to]);
  return out;
}

/** One arrow per pair: the symbols of a pair's arrows joined by union, in alphabet order. */
export function merge(g: Gnfa, o: BuildOptions): Gnfa {
  const arrows: Arrow[] = [];
  for (const a of g.arrows) {
    const had = arrows.find((b) => b.from === a.from && b.to === a.to);
    if (!had) arrows.push({ ...a });
    else {
      had.r = union(had.r, a.r, o);
      had.text = show(had.r);
    }
  }
  return { ...g, arrows };
}

export const label = (g: Gnfa, p: string, q: string): Arrow | undefined =>
  g.arrows.find((a) => a.from === p && a.to === q);

export interface Through {
  /** States with an arrow into q (q left out), in state order. */
  ins: string[];
  /** States q has an arrow to (q left out), in state order. */
  outs: string[];
  loop?: Arrow;
}

export function paths(g: Gnfa, q: string): Through {
  return {
    ins: g.states.filter((p) => p !== q && label(g, p, q)),
    outs: g.states.filter((r) => r !== q && label(g, q, r)),
    loop: label(g, q, q),
  };
}

/** The states that can still be ripped: every state but the new start and accept. */
export const inner = (g: Gnfa): string[] =>
  g.states.filter((q) => q !== g.start && q !== g.accept);

/** How many labels ripping q rewrites: arrows in times arrows out. */
export function weight(g: Gnfa, q: string): number {
  const t = paths(g, q);
  return t.ins.length * t.outs.length;
}

/**
 * The next state to rip: the first left in name order, or the one with the fewest paths
 * through it (arrows in times arrows out), the first in name order on a tie.
 */
export function pickRip(g: Gnfa, order: Order): string {
  const left = inner(g);
  if (order === 'name') return left[0]!;
  return left.reduce((best, q) => (weight(g, q) < weight(g, best) ? q : best));
}

export interface PairUpdate {
  from: string;
  to: string;
  R1: Regex;
  R2: Regex;
  R3: Regex;
  R4: Regex;
  /** R1(R2)*R3 ∪ R4 exactly as written, and as built with the settings' simplification. */
  raw: Regex;
  out: Regex;
  /** The identities used to get from raw to out. */
  used: string[];
}

/** The new label of the pair (p, r) when q is ripped: R1(R2)*R3 ∪ R4. */
export function update(g: Gnfa, q: string, p: string, r: string, simplify: boolean): PairUpdate {
  const R1 = label(g, p, q)?.r ?? EMPTY;
  const R2 = label(g, q, q)?.r ?? EMPTY;
  const R3 = label(g, q, r)?.r ?? EMPTY;
  const R4 = label(g, p, r)?.r ?? EMPTY;
  const raw = union(concat(concat(R1, star(R2)), R3), R4);
  const used: string[] = [];
  const o = { simplify, used };
  const out = union(concat(concat(R1, star(R2, o), o), R3, o), R4, o);
  return { from: p, to: r, R1, R2, R3, R4, raw, out, used };
}

/** The GNFA with label (p, r) set to x (or removed, for ∅). */
export function setLabel(g: Gnfa, p: string, r: string, x: Regex): Gnfa {
  const rest = g.arrows.filter((a) => !(a.from === p && a.to === r));
  const arrows = x.kind === 'empty' ? rest : [...rest, { from: p, to: r, r: x, text: show(x) }];
  return { ...g, arrows: sortArrows(g, arrows) };
}

/** The GNFA without q and its arrows. */
export function drop(g: Gnfa, q: string): Gnfa {
  return {
    ...g,
    states: g.states.filter((x) => x !== q),
    arrows: g.arrows.filter((a) => a.from !== q && a.to !== q),
  };
}

/** Every pair whose label changes when q is ripped: each arrow in with each arrow out. */
export function pairs(g: Gnfa, q: string): [string, string][] {
  const t = paths(g, q);
  return t.ins.flatMap((p) => t.outs.map((r) => [p, r] as [string, string]));
}

/** Rip q: update every pair through it, then remove it. */
export function rip(g: Gnfa, q: string, simplify: boolean): Gnfa {
  let h = g;
  for (const [p, r] of pairs(g, q)) h = setLabel(h, p, r, update(g, q, p, r, simplify).out);
  return drop(h, q);
}

export interface Settings {
  order: Order;
  simplify: Simplify;
}

/** The whole conversion: the expression on the start-to-accept arrow, and the rip order. */
export function toRegex(dfa: Automaton, s: Settings): { regex: Regex; order: string[] } {
  const simplify = s.simplify === 'identities';
  let g = merge(makeGnfa(dfa), { simplify });
  const order: string[] = [];
  while (inner(g).length) {
    const q = pickRip(g, s.order);
    order.push(q);
    g = rip(g, q, simplify);
  }
  return { regex: label(g, g.start, g.accept)?.r ?? EMPTY, order };
}
