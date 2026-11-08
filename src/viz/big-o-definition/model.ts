/**
 * Big-O, Ω and Θ by definition. f(n) = O(g(n)) when some c > 0 and n₀ give 0 ≤ f(n) ≤ c·g(n)
 * for every n ≥ n₀ (CLRS's form, with the 0 ≤). Ω flips the inequality, and Θ asks for both,
 * with c₁ below and c₂ above.
 *
 * The page checks a witness (c, n₀) exactly over n = n₀ to N, the range setting, and says so.
 * Past N it cannot loop, so it says what the algebra says: for the menu pairs (pairs.ts) the
 * algebra worked out by hand settles every n with a little more exact arithmetic; for typed
 * functions, the limit of f/g (read off the biggest terms) says whether the inequality holds
 * for large n, and a few far probes look for a counterexample.
 */
import type { OpSpec, PseudoBlock, Scalar, Step, Value } from '../../engine/types';
import { L, mark } from '../_recursion/kit';
import {
  cmpR,
  divR,
  eq,
  evalAt,
  evaluable,
  exprOf,
  fmt,
  fmtDecimal,
  leadText,
  limitOf,
  limitText,
  mulR,
  parseConst,
  parseExpr,
  sup,
  valuesUpTo,
  type Const,
  type Expr,
  type Limit,
  type Rat,
} from './expr';
import { PAIRS, type MenuPair, type SideAlgebra } from './pairs';

export type Relation = 'O' | 'Omega' | 'Theta';

export interface DefSettings {
  [key: string]: Scalar;
  relation: Relation;
  /** The largest n checked: "50" checks n = 1 to 50. */
  range: '20' | '50' | '100' | '200';
  scale: 'auto' | 'linear' | 'log';
}

export const defaults: DefSettings = { relation: 'O', range: '50', scale: 'auto' };

export const RANGES = ['20', '50', '100', '200'] as const;

export interface DefState {
  /** The functions, in the page's own writing ("3n² + 10n + 5"). */
  f: string;
  g: string;
  /** The constants being tried, as typed: lo is Ω's c and Θ's c₁, hi is O's c and Θ's c₂. */
  lo: string | null;
  hi: string | null;
  n0: number | null;
  /** The limit test has been run: the ratio chart shows where f/g goes. */
  limit: boolean;
}

export interface DefExtra {
  /** The n being looked at. */
  at?: number;
  /** Only n from [0] to [1] show whether they pass; the others are not checked yet. */
  shown?: [number, number];
  /** Draw f alone: the first step of choosing a pair. */
  fOnly?: boolean;
}

type S = DefState;
type DefStep = Step<S, DefExtra>;
type Op = OpSpec<S, DefSettings, DefExtra>;

export const REL: Record<Relation, string> = { O: 'O', Omega: 'Ω', Theta: 'Θ' };

export const rangeOf = (settings: DefSettings): number => Number(settings.range) || 50;

export function init(): S {
  const p = PAIRS[0]!;
  return { f: exprOf(p.f).text, g: exprOf(p.g).text, lo: null, hi: null, n0: null, limit: false };
}

// ----- The menu -----

const keyOf = (f: Expr, g: Expr) => `${f.ascii} ; ${g.ascii}`;
const MENU = new Map(PAIRS.map((p) => [keyOf(exprOf(p.f), exprOf(p.g)), p]));

/** The menu pair these functions are, if any (typed ones count when they match). */
export const menuPair = (s: S): MenuPair | undefined => MENU.get(keyOf(exprOf(s.f), exprOf(s.g)));

// ----- Checking -----

export type Side = 'upper' | 'lower';

/** One inequality of the definition with its constant. */
export interface Bound {
  side: Side;
  c: Rat;
  text: string;
}

/** The constants this relation uses, when they have been set. */
export function boundsOf(s: S, rel: Relation): Bound[] | null {
  const lo = s.lo === null ? null : parseConst(s.lo);
  const hi = s.hi === null ? null : parseConst(s.hi);
  const b = (side: Side, c: Const | Error | null): Bound | null =>
    c && !(c instanceof Error) ? { side, c: c.r, text: c.text } : null;
  const lower = b('lower', lo);
  const upper = b('upper', hi);
  if (rel === 'O') return upper ? [upper] : null;
  if (rel === 'Omega') return lower ? [lower] : null;
  return lower && upper ? [lower, upper] : null;
}

/** upper: 0 ≤ f ≤ c·g. lower: 0 ≤ c·g ≤ f. */
export function holdsSide(fv: Rat, gv: Rat, b: { side: Side; c: Rat }): boolean {
  const cg = mulR(b.c, gv);
  return b.side === 'upper' ? fv.n >= 0n && cmpR(fv, cg) <= 0 : cg.n >= 0n && cmpR(cg, fv) <= 0;
}

export const holds = (fv: Rat, gv: Rat, bounds: readonly { side: Side; c: Rat }[]) =>
  bounds.every((b) => holdsSide(fv, gv, b));

const holdsAt = (f: Expr, g: Expr, bounds: readonly Bound[], n: bigint) =>
  holds(evalAt(f, n), evalAt(g, n), bounds);

/** Every n from n0 to nmax where the inequality fails. */
export function failures(
  f: Expr,
  g: Expr,
  bounds: readonly { side: Side; c: Rat }[],
  n0: number,
  nmax: number,
): number[] {
  const fv = valuesUpTo(f, nmax);
  const gv = valuesUpTo(g, nmax);
  const out: number[] = [];
  for (let n = Math.max(1, n0); n <= nmax; n++)
    if (!holds(fv[n - 1]!, gv[n - 1]!, bounds)) out.push(n);
  return out;
}

/** The first n from n0 to nmax where it fails, or null: the check the code tabs run. */
export function firstFailure(
  f: Expr,
  g: Expr,
  bounds: readonly { side: Side; c: Rat }[],
  n0: number,
  nmax: number,
): number | null {
  const fv = valuesUpTo(f, nmax);
  const gv = valuesUpTo(g, nmax);
  for (let n = Math.max(1, n0); n <= nmax; n++)
    if (!holds(fv[n - 1]!, gv[n - 1]!, bounds)) return n;
  return null;
}

/** The smallest n0 with no failure from n0 to nmax (one past the last failure), or null. */
export function smallestN0(
  f: Expr,
  g: Expr,
  bounds: readonly { side: Side; c: Rat }[],
  nmax: number,
): number | null {
  const fv = valuesUpTo(f, nmax);
  const gv = valuesUpTo(g, nmax);
  for (let n = nmax; n >= 1; n--)
    if (!holds(fv[n - 1]!, gv[n - 1]!, bounds)) return n < nmax ? n + 1 : null;
  return 1;
}

// ----- Past the range -----

export type Beyond =
  | { kind: 'proved'; why: string }
  /** It fails at n; `first` when no n between the range and n fails. */
  | { kind: 'fails'; n: bigint; first: boolean; why: string }
  | { kind: 'open'; why: string };

/** Most exact evaluations one search may make: far more than any menu pair needs. */
const SEARCH_LIMIT = 5000;

/**
 * The first n after `start` where `test` gives `want`, given that it does not at `start` and
 * that past `start` its answer changes at most once: gallop out, then halve back. Null if the
 * search ran too long.
 */
function firstFlip(test: (n: bigint) => boolean, start: bigint, want: boolean): bigint | null {
  let lo = start;
  let step = 1n;
  let found: bigint | null = null;
  for (let i = 0; i < SEARCH_LIMIT && found === null; i++) {
    const n = start + step;
    if (test(n) === want) found = n;
    else lo = n;
    step *= 2n;
  }
  if (found === null) return null;
  let hi: bigint = found;
  while (hi - lo > 1n) {
    const mid: bigint = (lo + hi) / 2n;
    if (test(mid) === want) hi = mid;
    else lo = mid;
  }
  return hi;
}

/** Θ's two reasons, each named after its constant. */
function labelled(bounds: Bound[], whys: string[]): string {
  if (bounds.length < 2) return whys.join(' ');
  return whys.map((w, i) => `${bounds[i]!.side === 'lower' ? 'For c₁' : 'For c₂'}: ${w}`).join(' ');
}

function algebraOf(p: MenuPair, b: Bound): SideAlgebra {
  return b.side === 'upper' ? p.upper : p.lower;
}

/**
 * One side of a menu pair, past N, when it holds at N: proved for every n, or the first n
 * after N where it fails.
 */
function sideBeyond(f: Expr, g: Expr, p: MenuPair, b: Bound, N: number): Beyond {
  const alg = algebraOf(p, b);
  const why = alg.why(b.c);
  const test = (n: bigint) => evaluable(f, n) && evaluable(g, n) && holdsAt(f, g, [b], n);
  const M = alg.settles(b.c);
  for (let n = BigInt(N) + 1n; n <= M; n++)
    if (!test(n)) return { kind: 'fails', n, first: true, why };
  const start = M > BigInt(N) ? M : BigInt(N);
  if (alg.eventually(b.c)) return { kind: 'proved', why };
  const n = firstFlip(test, start, false);
  if (n === null) return { kind: 'open', why };
  return { kind: 'fails', n, first: true, why };
}

/** Where f/g goes decides each side for large n; null when c is exactly the limit. */
export function eventually(lim: Limit, b: { side: Side; c: Rat }): boolean | null {
  if (lim.kind === 'inf') return b.side === 'lower';
  if (lim.kind === 'zero') return b.side === 'upper';
  const d = cmpR(b.c, lim.value);
  if (d === 0) return null;
  return b.side === 'upper' ? d > 0 : d < 0;
}

const limitWord = (lim: Limit) => `f(n)/g(n) → ${limitText(lim)}`;

/** Why a side holds or fails for large n, from the limit alone. */
function limitReason(lim: Limit, b: Bound, ev: boolean | null): string {
  const c = b.text;
  if (ev === null) return `${limitWord(lim)}, exactly c = ${c}, so the smaller terms decide.`;
  if (lim.kind !== 'const')
    return ev
      ? `${limitWord(lim)}, so ${b.side === 'upper' ? 'f(n) ≤' : 'f(n) ≥'} ${c}·g(n) for every large n.`
      : `${limitWord(lim)}, so every c fails for large n.`;
  const v = limitText(lim);
  if (b.side === 'upper')
    return ev
      ? `${limitWord(lim)} and ${v} < ${c}, so f(n) ≤ ${c}·g(n) for every large n.`
      : `${limitWord(lim)} and ${v} > ${c}, so f(n) > ${c}·g(n) for every large n.`;
  return ev
    ? `${limitWord(lim)} and ${v} > ${c}, so f(n) ≥ ${c}·g(n) for every large n.`
    : `${limitWord(lim)} and ${v} < ${c}, so f(n) < ${c}·g(n) for every large n.`;
}

/**
 * Look far past N for a counterexample: n = 2N, 4N, 8N... while values stay computable. Gives
 * the n found (checked exactly), or null and the last n tried.
 */
function probe(f: Expr, g: Expr, bounds: Bound[], N: number): { n: bigint | null; tried: bigint } {
  let last = BigInt(N);
  for (let k = 1; k <= 24; k++) {
    const n = BigInt(N) << BigInt(k);
    if (!evaluable(f, n) || !evaluable(g, n)) break;
    if (!holdsAt(f, g, bounds, n)) {
      // Narrow it down to a smaller example.
      let lo = last;
      let hi = n;
      while (hi - lo > 1n) {
        const mid = (lo + hi) / 2n;
        if (holdsAt(f, g, bounds, mid)) lo = mid;
        else hi = mid;
      }
      return { n: hi, tried: n };
    }
    last = n;
  }
  return { n: null, tried: last };
}

/**
 * Whether the witness holds past N, given that it holds for every n from n0 to N. Menu pairs
 * get a definite answer from their algebra; typed pairs get the limit's verdict for large n
 * and, when that says it must fail, an example found by probing.
 */
export function beyondRange(f: Expr, g: Expr, bounds: Bound[], N: number): Beyond {
  const p = MENU.get(keyOf(f, g));
  if (p) {
    const sides = bounds.map((b) => sideBeyond(f, g, p, b, N));
    const fails = sides.filter((s) => s.kind === 'fails');
    if (fails.length) return fails.reduce((a, b) => (a.n <= b.n ? a : b));
    const open = sides.find((s) => s.kind === 'open');
    if (open) return open;
    return {
      kind: 'proved',
      why: labelled(
        bounds,
        sides.map((s) => s.why),
      ),
    };
  }
  const lim = limitOf(f, g);
  const evs = bounds.map((b) => eventually(lim, b));
  const reasons = bounds.map((b, i) => limitReason(lim, b, evs[i]!)).join(' ');
  if (evs.every((e) => e === true))
    return {
      kind: 'open',
      why: `${reasons} Whether it already holds from n₀ on takes algebra: the page checks typed functions only up to ${N}.`,
    };
  const { n, tried } = probe(f, g, bounds, N);
  if (n !== null) return { kind: 'fails', n, first: false, why: reasons };
  const far = `n = ${N * 2}, ${N * 4}, ${N * 8} and so on up to ${nText(tried)}`;
  return {
    kind: 'open',
    why: evs.some((e) => e === false)
      ? `${reasons} It must break somewhere past ${N}, but the page tried ${far} without reaching it.`
      : `${reasons} The page also tried ${far} and found nothing that breaks it, which is not a proof either way.`,
  };
}

export type Far =
  | { kind: 'n0'; n0: bigint; why: string }
  | { kind: 'none'; why: string }
  | { kind: 'open'; why: string };

/** One side's smallest n₀ over every n, for a menu pair: null if no n₀ works for this c. */
function sideN0(f: Expr, g: Expr, p: MenuPair, b: Bound, N: number): bigint | null {
  const alg = algebraOf(p, b);
  if (!alg.eventually(b.c)) return null;
  const test = (n: bigint) => evaluable(f, n) && evaluable(g, n) && holdsAt(f, g, [b], n);
  const M = alg.settles(b.c);
  const top = M > BigInt(N) ? M : BigInt(N);
  // Past top the truth changes at most once and ends true: fails, ..., then holds for good.
  let lastFail: bigint;
  if (test(top)) {
    lastFail = 0n;
    for (let n = top - 1n; n >= 1n; n--)
      if (!test(n)) {
        lastFail = n;
        break;
      }
  } else {
    const firstHold = firstFlip(test, top, true);
    if (firstHold === null) return null;
    lastFail = firstHold - 1n;
  }
  return lastFail + 1n;
}

/**
 * The smallest n₀ that works for these constants over every n, when even n = N fails. Menu
 * pairs get it from their algebra (it may lie far past N); typed pairs get the limit's word.
 */
export function smallestN0Past(f: Expr, g: Expr, bounds: Bound[], N: number): Far {
  const p = MENU.get(keyOf(f, g));
  if (p) {
    const whys = labelled(
      bounds,
      bounds.map((b) => algebraOf(p, b).why(b.c)),
    );
    let n0 = 1n;
    for (const b of bounds) {
      const k = sideN0(f, g, p, b, N);
      if (k === null) return { kind: 'none', why: algebraOf(p, b).why(b.c) };
      if (k > n0) n0 = k;
    }
    return { kind: 'n0', n0, why: whys };
  }
  const lim = limitOf(f, g);
  const evs = bounds.map((b) => eventually(lim, b));
  const reasons = bounds.map((b, i) => limitReason(lim, b, evs[i]!)).join(' ');
  if (evs.some((e) => e === false)) return { kind: 'none', why: reasons };
  if (evs.every((e) => e === true))
    return {
      kind: 'open',
      why: `${reasons} So some n₀ past ${N} works, but the page checks typed functions only up to ${N}.`,
    };
  return { kind: 'open', why: reasons };
}

// ----- Words -----

const commas = (s: string) => s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** n as learners read it: 1,024, or 2¹⁰⁰¹ for a huge power of two. */
export function nText(n: bigint): string {
  if (n < 10n ** 15n) return commas(n.toString());
  const bits = n.toString(2);
  if (/^10*$/.test(bits)) return `2${sup(bits.length - 1)}`;
  return fmt({ n, d: 1n });
}

/** "f(11) = 478 ≤ 4·g(11) = 484", or the part that breaks. */
export function atText(f: Expr, g: Expr, bounds: readonly Bound[], n: bigint): string {
  const fv = evalAt(f, n);
  const gv = evalAt(g, n);
  const N = nText(n);
  const fs = `f(${N}) ${eq(fmt(fv))}`;
  const cg = (b: Bound) => `${b.text}·g(${N}) ${eq(fmt(mulR(b.c, gv)))}`;
  for (const b of bounds) {
    if (holdsSide(fv, gv, b)) continue;
    const v = mulR(b.c, gv);
    if (b.side === 'upper') return fv.n < 0n ? `${fs} is negative` : `${fs} > ${cg(b)}`;
    return v.n < 0n ? `${cg(b)} is negative` : `${fs} < ${cg(b)}`;
  }
  const lower = bounds.find((b) => b.side === 'lower');
  const upper = bounds.find((b) => b.side === 'upper');
  return [lower && cg(lower), fs, upper && cg(upper)].filter(Boolean).join(' ≤ ');
}

/** "c = 4 and n₀ = 11", "c₁ = 1/14, c₂ = 1/2 and n₀ = 7". */
function witnessText(bounds: readonly Bound[], n0: number | null): string {
  const cs =
    bounds.length === 2
      ? [`c₁ = ${bounds[0]!.text}`, `c₂ = ${bounds[1]!.text}`]
      : [`c = ${bounds[0]!.text}`];
  return n0 === null ? cs.join(' and ') : `${cs.join(', ')} and n₀ = ${n0}`;
}

/** What f must do: "stay at or under 4·g(n)". */
function mustText(bounds: readonly Bound[]): string {
  if (bounds.length === 2)
    return `stay between ${bounds[0]!.text}·g(n) and ${bounds[1]!.text}·g(n)`;
  const b = bounds[0]!;
  return b.side === 'upper' ? `stay at or under ${b.text}·g(n)` : `stay at or over ${b.text}·g(n)`;
}

const RELATION_OF: Record<Relation, string> = {
  O: 'f(n) = O(g(n))',
  Omega: 'f(n) = Ω(g(n))',
  Theta: 'f(n) = Θ(g(n))',
};

function tryHint(rel: Relation): string {
  if (rel === 'O') return 'Try a bigger c or a later n₀.';
  if (rel === 'Omega') return 'Try a smaller c or a later n₀.';
  return 'Try a smaller c₁, a bigger c₂ or a later n₀.';
}

/** What happens past N: the readout ("proved", "breaks at n = 59", "cannot tell"). */
export type Past = 'proved' | 'cannot tell' | `breaks at n = ${string}`;

/** The sentences after "holds from n₀ to N": what happens past N, and the readout. */
function pastText(
  f: Expr,
  g: Expr,
  bounds: Bound[],
  N: number,
  rel: Relation,
): { say: string; past: Past } {
  const b = beyondRange(f, g, bounds, N);
  if (b.kind === 'proved')
    return {
      say: `Past ${N}, the algebra covers it: ${b.why} So ${RELATION_OF[rel]}.`,
      past: 'proved',
    };
  if (b.kind === 'fails') {
    const where = atText(f, g, bounds, b.n);
    const at = nText(b.n);
    return {
      say: b.first
        ? `But it is not true for every n: past ${N} it first breaks at n = ${at}, where ${where}. ${b.why}`
        : `But it is not true for every n: past ${N} it breaks, for example at n = ${at}, where ${where}. ${b.why}`,
      past: `breaks at n = ${at}`,
    };
  }
  return { say: b.why, past: 'cannot tell' };
}

// ----- Values and readouts -----

function vars(
  s: S,
  settings: DefSettings,
  more: Record<string, Scalar> = {},
): Record<string, Scalar> {
  const out: Record<string, Scalar> = { 'n checked': `1 to ${rangeOf(settings)}` };
  if (settings.relation === 'Theta') {
    out['c₁'] = s.lo ?? '—';
    out['c₂'] = s.hi ?? '—';
  } else out.c = (settings.relation === 'O' ? s.hi : s.lo) ?? '—';
  out['n₀'] = s.n0 ?? '—';
  const bounds = boundsOf(s, settings.relation);
  if (bounds) {
    const N = rangeOf(settings);
    const fails = failures(exprOf(s.f), exprOf(s.g), bounds, s.n0 ?? 1, N);
    out['n that fail'] = fails.length;
  }
  if (s.limit) out['f/g →'] = limitText(limitOf(exprOf(s.f), exprOf(s.g)));
  return { ...out, ...more };
}

/** Readouts at one n: f(n) and the bounds there. */
function atVars(s: S, bounds: readonly Bound[] | null, n: number): Record<string, Scalar> {
  const f = exprOf(s.f);
  const g = exprOf(s.g);
  const N = BigInt(n);
  const out: Record<string, Scalar> = { n, 'f(n)': fmt(evalAt(f, N)) };
  const gv = evalAt(g, N);
  if (!bounds) out['g(n)'] = fmt(gv);
  else
    for (const b of bounds) {
      const name = bounds.length === 2 ? (b.side === 'lower' ? 'c₁·g(n)' : 'c₂·g(n)') : 'c·g(n)';
      out[name] = fmt(mulR(b.c, gv));
    }
  return out;
}

const reject = (s: S, settings: DefSettings, say: string): DefStep => ({
  state: s,
  marks: [],
  say,
  lines: [],
  vars: vars(s, settings),
  level: 1,
});

/** The numbers in an argument: "4 11" or "1/14, 1/2, 7". */
function numbersIn(raw: Value | undefined): string[] {
  return String(raw ?? '')
    .split(/[\s,;]+/)
    .filter(Boolean);
}

/** The constants an argument gives for this relation, or what is wrong with them. */
function readBounds(
  tokens: string[],
  rel: Relation,
): { lo: Const | null; hi: Const | null } | Error {
  if (rel === 'Theta') {
    const lo = parseConst(tokens[0] ?? '', 'c₁');
    if (lo instanceof Error) return lo;
    const hi = parseConst(tokens[1] ?? '', 'c₂');
    if (hi instanceof Error) return hi;
    if (cmpR(lo.r, hi.r) > 0)
      return new Error(`c₁ = ${lo.text} is above c₂ = ${hi.text}: no f fits between them.`);
    return { lo, hi };
  }
  const c = parseConst(tokens[0] ?? '');
  if (c instanceof Error) return c;
  return rel === 'O' ? { lo: null, hi: c } : { lo: c, hi: null };
}

const usage = (rel: Relation, find: boolean) =>
  rel === 'Theta'
    ? find
      ? 'type c₁ and c₂, such as 1/14 1/2'
      : 'type c₁, c₂ and n₀, such as 1/14 1/2 7'
    : find
      ? 'type c, such as 4'
      : 'type c and n₀, such as 4 11';

/** How many n a check looks at one by one before it skips ahead. */
const SCAN = 4;

// ----- Operations -----

const compare: Op = {
  label: 'Compare f ; g',
  arity: 1,
  *run(s, [raw], { settings }) {
    const parts = String(raw ?? '').split(';');
    if (parts.length !== 2) {
      yield reject(
        s,
        settings,
        'Type two functions separated by a semicolon, such as 3n^2 + 10n + 5 ; n^2. Nothing changed.',
      );
      return s;
    }
    const f = parseExpr(parts[0]!, 'f');
    const g = parseExpr(parts[1]!, 'g');
    for (const [e, name] of [
      [f, 'f'],
      [g, 'g'],
    ] as const) {
      if (e instanceof Error) {
        yield reject(s, settings, `Could not read ${name}(n): ${e.message} Nothing changed.`);
        return s;
      }
    }
    const fe = f as Expr;
    const ge = g as Expr;
    const next: S = { f: fe.text, g: ge.text, lo: null, hi: null, n0: null, limit: false };
    const N = rangeOf(settings);
    yield {
      state: next,
      marks: [mark('v-key-f', 'new')],
      say: `f(n) = ${fe.text}: the function to bound, drawn for n = 1 to ${N}.`,
      lines: ['cmp.f'],
      vars: vars(next, settings),
      level: 2,
      extra: { fOnly: true },
    };
    const p = menuPair(next);
    yield {
      state: next,
      marks: [mark('v-key-b', 'new')],
      say: `g(n) = ${ge.text}: the yardstick. ${p ? p.hint : `Their biggest terms are ${leadText(fe)} and ${leadText(ge)}. Try a c and an n₀.`}`,
      lines: ['cmp.g'],
      vars: vars(next, settings),
      level: 1,
    };
    return next;
  },
};

const check: Op = {
  label: 'Try c, n₀',
  arity: 1,
  *run(s, [raw], { settings }) {
    const rel = settings.relation;
    const N = rangeOf(settings);
    const tokens = numbersIn(raw);
    const want = rel === 'Theta' ? 3 : 2;
    if (tokens.length !== want) {
      yield reject(
        s,
        settings,
        `${REL[rel]} needs ${want} numbers: ${usage(rel, false)}. Nothing changed.`,
      );
      return s;
    }
    const cs = readBounds(tokens, rel);
    if (cs instanceof Error) {
      yield reject(s, settings, `${cs.message} Nothing changed.`);
      return s;
    }
    const n0 = Number(tokens[want - 1]);
    if (!/^\d+$/.test(tokens[want - 1]!) || n0 < 1 || n0 > N) {
      yield reject(
        s,
        settings,
        `n₀ must be a whole number from 1 to ${N}, the range checked. Nothing changed.`,
      );
      return s;
    }
    const next: S = {
      ...s,
      lo: cs.lo?.text ?? s.lo,
      hi: cs.hi?.text ?? s.hi,
      n0,
    };
    const f = exprOf(s.f);
    const g = exprOf(s.g);
    const bounds = boundsOf(next, rel)!;
    const fails = failures(f, g, bounds, n0, N);
    const first = fails[0] ?? null;
    yield {
      state: next,
      marks: [mark('v-n0', 'active'), mark('v-key-b', 'active')],
      say: `Try ${witnessText(bounds, n0)}: from n = ${n0} on, f(n) must ${mustText(bounds)}.`,
      lines: ['chk.sig'],
      vars: vars(next, settings),
      level: 2,
      extra: { shown: [n0, n0 - 1] },
    };
    // Look at the first few n one at a time, then skip to the first failure or the end.
    const last = first ?? N;
    for (let n = n0; n <= Math.min(last, n0 + SCAN - 1); n++) {
      const ok = n !== first;
      yield {
        state: next,
        marks: [mark('v-cur', ok ? 'compare' : 'error')],
        say: `n = ${n}: ${atText(f, g, bounds, BigInt(n))}. ${ok ? 'Fine.' : 'That breaks it.'}`,
        lines: ok ? ['chk.loop', 'chk.test'] : ['chk.test', 'chk.fail'],
        vars: vars(next, settings, atVars(next, bounds, n)),
        level: 3,
        extra: { at: n, shown: [n0, n] },
      };
    }
    if (last > n0 + SCAN - 1) {
      yield {
        state: next,
        marks: [mark('v-cur', first === null ? 'compare' : 'error')],
        say:
          first === null
            ? `And so on: every n up to ${N} passes.`
            : `Skip ahead: every n up to ${first - 1} passes, and n = ${first} breaks it: ${atText(f, g, bounds, BigInt(first))}.`,
        lines: first === null ? ['chk.loop', 'chk.pass'] : ['chk.test', 'chk.fail'],
        vars: vars(next, settings, atVars(next, bounds, last)),
        level: 2,
        extra: { at: last, shown: [n0, last] },
      };
    }
    let say: string;
    let past: Scalar = '—';
    if (first !== null) {
      const total = N - n0 + 1;
      const how =
        fails.length === total
          ? `every n from ${n0} to ${N} breaks it`
          : fails.length === 1
            ? `n = ${first} breaks it, the only n from ${n0} to ${N} that does`
            : `${fails.length} of the ${total} values of n from ${n0} to ${N} break it, the first at n = ${first}`;
      say = `Not a witness: with ${witnessText(bounds, n0)}, ${how}. ${tryHint(rel)}`;
    } else {
      const p = pastText(f, g, bounds, N, rel);
      say = `With ${witnessText(bounds, n0)}, it holds for every n from ${n0} to ${N}, the range checked. ${p.say}`;
      past = p.past;
    }
    yield {
      state: next,
      marks: [
        mark(
          'v-n0',
          first !== null || past !== 'proved'
            ? past === 'cannot tell'
              ? 'active'
              : 'error'
            : 'found',
        ),
      ],
      say,
      lines: first === null ? ['chk.pass', 'chk.past'] : ['chk.fail'],
      vars: vars(next, settings, { 'first failure': first ?? 'none', [`past ${N}`]: past }),
      level: 1,
    };
    return next;
  },
};

const find: Op = {
  label: 'Find n₀',
  arity: 1,
  *run(s, [raw], { settings }) {
    const rel = settings.relation;
    const N = rangeOf(settings);
    const tokens = numbersIn(raw);
    const want = rel === 'Theta' ? 2 : 1;
    if (tokens.length !== want) {
      yield reject(
        s,
        settings,
        `To find n₀, ${usage(rel, true)}: the page finds the smallest n₀ that works. Nothing changed.`,
      );
      return s;
    }
    const cs = readBounds(tokens, rel);
    if (cs instanceof Error) {
      yield reject(s, settings, `${cs.message} Nothing changed.`);
      return s;
    }
    const f = exprOf(s.f);
    const g = exprOf(s.g);
    const base: S = { ...s, lo: cs.lo?.text ?? s.lo, hi: cs.hi?.text ?? s.hi, n0: null };
    const bounds = boundsOf(base, rel)!;
    const fails = failures(f, g, bounds, 1, N);
    const lastFail = fails.at(-1) ?? null;
    const found = lastFail === null ? 1 : lastFail < N ? lastFail + 1 : null;
    const ws = witnessText(bounds, null);
    yield {
      state: base,
      marks: [mark('v-key-b', 'active')],
      say: `Find the smallest n₀ for ${ws}: start at n = ${N} and walk down while f(n) ${mustText(bounds).replace(/^stay/, 'stays')}.`,
      lines: ['find.sig'],
      vars: vars(base, settings),
      level: 2,
      extra: { shown: [N + 1, N] },
    };
    // Walk down in a few strides; n₀ follows, one past the last n that passed.
    const stop = lastFail ?? 0;
    const stride = Math.max(1, Math.ceil(N / 5));
    let top = N;
    let lowest = N + 1;
    while (top > stop) {
      const bottom = Math.max(stop + 1, top - stride + 1, top === N ? N : 1);
      lowest = bottom;
      const at: S = { ...base, n0: bottom };
      yield {
        state: at,
        marks: [mark('v-n0', 'active')],
        say:
          bottom === top
            ? `n = ${top}: ${atText(f, g, bounds, BigInt(top))}. So n₀ could be ${bottom}.`
            : `n = ${top} down to ${bottom} all pass, so n₀ could be ${bottom}.`,
        lines: ['find.loop', 'find.test'],
        vars: vars(at, settings, atVars(at, bounds, bottom)),
        level: 3,
        extra: { at: bottom, shown: [bottom, N] },
      };
      top = bottom - 1;
    }
    const next: S = { ...base, n0: found };
    if (lastFail !== null) {
      yield {
        state: next,
        marks: found === null ? [mark('v-cur', 'error')] : [mark('v-n0', 'active')],
        say:
          found === null
            ? `n = ${N} already breaks it: ${atText(f, g, bounds, BigInt(N))}. No n₀ up to ${N} works.`
            : `n = ${lastFail} breaks it: ${atText(f, g, bounds, BigInt(lastFail))}. So n₀ must be past it: n₀ = ${found}.`,
        lines: ['find.test', 'find.ret'],
        vars: vars(next, settings, atVars(next, bounds, lastFail)),
        level: 2,
        extra: { at: lastFail, shown: [Math.min(lastFail, lowest), N] },
      };
    } else {
      yield {
        state: next,
        marks: [mark('v-n0', 'active')],
        say: `Every n from ${N} down to 1 passes, so n₀ = 1.`,
        lines: ['find.all'],
        vars: vars(next, settings),
        level: 2,
        extra: { at: 1, shown: [1, N] },
      };
    }
    let say: string;
    let past: Scalar = '—';
    if (found !== null) {
      const p = pastText(f, g, bounds, N, rel);
      say = `The smallest n₀ for ${ws} within 1 to ${N} is ${found}. ${p.say}`;
      past = p.past;
    } else {
      const far = smallestN0Past(f, g, bounds, N);
      say =
        far.kind === 'n0'
          ? `No n₀ up to ${N} works for ${ws}, but one does exist past the range: the algebra gives n₀ = ${nText(far.n0)}. ${far.why}`
          : far.kind === 'none'
            ? `No n₀ works for ${ws} at all, not even past ${N}: ${far.why}`
            : `No n₀ up to ${N} works for ${ws}. ${far.why}`;
    }
    yield {
      state: next,
      marks:
        found === null
          ? []
          : [
              mark(
                'v-n0',
                past === 'proved' ? 'found' : past === 'cannot tell' ? 'active' : 'error',
              ),
            ],
      say,
      lines: found === null ? ['find.none'] : found === 1 ? ['find.all'] : ['find.ret'],
      vars: vars(next, settings, {
        'smallest n₀': found ?? 'none in range',
        [`past ${N}`]: past,
      }),
      level: 1,
    };
    return next;
  },
};

/** The n the limit test looks at: 1, 2, 4, 8, ... up to N, and N itself. */
export function limitSamples(g: Expr, N: number): number[] {
  const out: number[] = [];
  for (let n = 1; n <= N; n *= 2) out.push(n);
  if (out.at(-1) !== N) out.push(N);
  const gv = valuesUpTo(g, N);
  return out.filter((n) => gv[n - 1]!.n !== 0n);
}

export function limitVerdict(lim: Limit): string {
  if (lim.kind === 'zero')
    return 'The limit is 0: f grows more slowly than g, f = o(g). So f = O(g), but not Ω(g) or Θ(g).';
  if (lim.kind === 'inf')
    return 'The limit is ∞: f outgrows g, f = ω(g). So f = Ω(g), but not O(g) or Θ(g): no c is big enough.';
  return `The limit is ${fmt(lim.value)}, a positive constant: f = Θ(g). Any c₂ above ${fmt(lim.value)} and c₁ below it work from some n₀ on.`;
}

const limit: Op = {
  label: 'Limit of f/g',
  arity: 0,
  *run(s, _args, { settings }) {
    const f = exprOf(s.f);
    const g = exprOf(s.g);
    const N = rangeOf(settings);
    const lim = limitOf(f, g);
    const shown: S = { ...s, limit: false };
    yield {
      state: shown,
      marks: [mark('r-key', 'active')],
      say: 'The limit test: divide. Where g(n) > 0, f(n) ≤ c·g(n) is the same as f(n)/g(n) ≤ c, so watch the ratio as n grows.',
      lines: ['lim.sig', 'lim.ratio'],
      vars: vars(shown, settings),
      level: 2,
    };
    for (const n of limitSamples(g, N)) {
      const r = divR(evalAt(f, BigInt(n)), evalAt(g, BigInt(n)));
      yield {
        state: shown,
        marks: [mark('r-cur', 'compare')],
        say: `n = ${n}: f(${n})/g(${n}) ${eq(fmtDecimal(r))}.`,
        lines: ['lim.ratio'],
        vars: vars(shown, settings, { n, 'f(n)/g(n)': fmtDecimal(r) }),
        level: 3,
        extra: { at: n },
      };
    }
    const next: S = { ...s, limit: true };
    const p = menuPair(s);
    const why = p
      ? p.limitWhy
      : `The biggest terms decide: ${leadText(f)} in f and ${leadText(g)} in g.`;
    const line = lim.kind === 'zero' ? 'lim.zero' : lim.kind === 'inf' ? 'lim.inf' : 'lim.const';
    yield {
      state: next,
      marks: [mark('r-lim', 'found')],
      say: `${why} ${limitVerdict(lim)}`,
      lines: [line],
      vars: vars(next, settings),
      level: 1,
    };
    return next;
  },
};

export const ops: Record<string, Op> = { compare, check, find, limit };

// ----- Pseudocode -----

/** The test in the loop, for the relation. */
export function testText(rel: Relation): { text: string; plain: string } {
  if (rel === 'O')
    return {
      text: 'if not 0 ≤ f(n) ≤ c·g(n):',
      plain: 'Is f(n) negative, or above c·g(n)?',
    };
  if (rel === 'Omega')
    return {
      text: 'if not 0 ≤ c·g(n) ≤ f(n):',
      plain: 'Is c·g(n) negative, or above f(n)?',
    };
  return {
    text: 'if not 0 ≤ c₁·g(n) ≤ f(n) ≤ c₂·g(n):',
    plain: 'Is f(n) outside the band from c₁·g(n) up to c₂·g(n)?',
  };
}

export function pseudocode(settings: DefSettings): PseudoBlock[] {
  const rel = settings.relation;
  const t = testText(rel);
  const cs = rel === 'Theta' ? 'c₁, c₂' : 'c';
  return [
    {
      op: 'check',
      lines: [
        L(
          'chk.sig',
          0,
          `check(${cs}, n₀):`,
          `Test a witness: ${rel === 'Theta' ? 'two constants' : 'a constant c'} and a starting point n₀.`,
        ),
        L('chk.loop', 1, 'for n = n₀ to N:', 'Look at every n from n₀ to the end of the range.'),
        L('chk.test', 2, t.text, t.plain),
        L(
          'chk.fail',
          3,
          'return n   // a counterexample',
          'Then n breaks it: this is not a witness.',
        ),
        L('chk.pass', 1, 'return "holds up to N"', 'No n in the range breaks it.'),
        L(
          'chk.past',
          1,
          '// past N: only algebra can tell',
          'The page cannot try every n. Past N it needs a proof.',
        ),
      ],
    },
    {
      op: 'find',
      lines: [
        L(
          'find.sig',
          0,
          `smallest_n0(${cs}):`,
          'Find the earliest n₀ that works for these constants.',
        ),
        L('find.loop', 1, 'for n = N down to 1:', 'Walk down from the end of the range.'),
        L('find.test', 2, t.text, t.plain),
        L('find.ret', 3, 'return n + 1', 'n₀ must start just past the last n that breaks it.'),
        L('find.all', 1, 'return 1', 'Nothing in the range breaks it: n₀ = 1.'),
        L(
          'find.none',
          1,
          '// n = N broke it: no n₀ ≤ N',
          'If n = N itself breaks it, no n₀ in the range works.',
        ),
      ],
    },
    {
      op: 'limit',
      lines: [
        L(
          'lim.sig',
          0,
          'L = lim f(n)/g(n) as n → ∞',
          'Divide f by g and see where the ratio goes.',
        ),
        L('lim.ratio', 1, 'r(n) = f(n)/g(n)', 'Work out the ratio at bigger and bigger n.'),
        L('lim.zero', 1, 'L = 0: f = o(g): O(g), not Ω(g)', 'Ratio to 0: f is O(g) but not Ω(g).'),
        L('lim.const', 1, '0 < L < ∞: f = Θ(g)', 'Ratio to a positive number: f is Θ(g).'),
        L(
          'lim.inf',
          1,
          'L = ∞: f = ω(g): Ω(g), not O(g)',
          'Ratio without bound: f is Ω(g) but not O(g).',
        ),
      ],
    },
    {
      op: 'compare',
      lines: [
        L('cmp.f', 0, 'f(n) = the function to bound', 'Pick the function to bound.'),
        L('cmp.g', 0, 'g(n) = the yardstick, inside O( )', 'Pick the function to compare it with.'),
      ],
    },
  ];
}

// ----- Start and description -----

export function initialSay(s: S, settings: DefSettings = defaults): string {
  return `f(n) = ${s.f} and g(n) = ${s.g}. Is ${RELATION_OF[settings.relation]}? Try a c and an n₀, or let the page find n₀.`;
}

export function initialVars(s: S, settings: DefSettings = defaults) {
  return vars(s, settings);
}

export function describe(s: S, settings: DefSettings = defaults): string {
  const N = rangeOf(settings);
  const head = `f(n) = ${s.f} and g(n) = ${s.g}, n from 1 to ${N}.`;
  const bounds = boundsOf(s, settings.relation);
  const lim = s.limit ? ` f(n)/g(n) → ${limitText(limitOf(exprOf(s.f), exprOf(s.g)))}.` : '';
  if (!bounds) return head + lim;
  const fails = failures(exprOf(s.f), exprOf(s.g), bounds, s.n0 ?? 1, N);
  const from = s.n0 ?? 1;
  const verdict = fails.length
    ? `${fails.length} n from ${from} to ${N} fail, the first at ${fails[0]}.`
    : `It holds for every n from ${from} to ${N}.`;
  return `${head} Trying ${witnessText(bounds, s.n0)}: ${verdict}${lim}`;
}
