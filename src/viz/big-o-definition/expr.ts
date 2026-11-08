/**
 * The functions this page compares, and exact arithmetic on them.
 *
 * A function is a sum of terms k · nᵃ · (log n)ᵇ · 2ⁿ · n!, with a rational k. log n is
 * ⌊log₂ n⌋, the number of halvings, as on the growth lab (big-o-lab), so every value is a
 * rational number and every comparison is exact: no floating point decides a check.
 *
 * Learners type functions in a small format read by `parseExpr` (never eval): numbers, n, n^2,
 * log n, 2^n, n!, +, -, * or juxtaposition, and / by a number, for example "n^2/2 - 3n". The
 * page's own text (n², 2ⁿ, −, ·) reads back too.
 */
import { halvings } from '../big-o-lab/model';

// ----- Exact rationals -----

/** A rational number in lowest terms, with a positive denominator. */
export interface Rat {
  n: bigint;
  d: bigint;
}

const babs = (x: bigint) => (x < 0n ? -x : x);

function gcd(a: bigint, b: bigint): bigint {
  a = babs(a);
  b = babs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}

export function rat(n: bigint, d = 1n): Rat {
  if (d === 0n) throw new Error('division by zero');
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  const g = gcd(n, d) || 1n;
  return { n: n / g, d: d / g };
}

export const ZERO = rat(0n);
export const ONE = rat(1n);
export const addR = (a: Rat, b: Rat): Rat => rat(a.n * b.d + b.n * a.d, a.d * b.d);
export const subR = (a: Rat, b: Rat): Rat => rat(a.n * b.d - b.n * a.d, a.d * b.d);
export const mulR = (a: Rat, b: Rat): Rat => rat(a.n * b.n, a.d * b.d);
export const divR = (a: Rat, b: Rat): Rat => rat(a.n * b.d, a.d * b.n);
/** -1, 0 or 1 as a is less than, equal to or greater than b. */
export function cmpR(a: Rat, b: Rat): number {
  const l = a.n * b.d;
  const r = b.n * a.d;
  return l < r ? -1 : l > r ? 1 : 0;
}
export const isInt = (a: Rat) => a.d === 1n;
/** ⌊a⌋ */
export function floorR(a: Rat): bigint {
  const q = a.n / a.d;
  return a.n < 0n && q * a.d !== a.n ? q - 1n : q;
}

const commas = (s: string) => s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** Base-10 logarithm of a positive bigint, to about 15 digits. */
export function lg10(v: bigint): number {
  if (v <= 0n) return -Infinity;
  if (v < 2n ** 53n) return Math.log10(Number(v));
  const s = v.toString();
  return s.length - 1 + Math.log10(Number(`${s[0]}.${s.slice(1, 16)}`));
}

/** A rational as a JS number: ±Infinity past the double range, never NaN. */
export function approx(a: Rat): number {
  if (a.n === 0n) return 0;
  const v = 10 ** (lg10(babs(a.n)) - lg10(a.d));
  return a.n < 0n ? -v : v;
}

/** log10 |a| (−Infinity for 0). */
export const lgR = (a: Rat): number => (a.n === 0n ? -Infinity : lg10(babs(a.n)) - lg10(a.d));

/** Whether d has no prime factors but 2 and 5, so k/d ends as a decimal. */
function decimalDen(d: bigint): number | null {
  for (let k = 0; k <= 6; k++) if ((10n ** BigInt(k)) % d === 0n) return k;
  return null;
}

/** Superscript exponent for "10³⁰". */
export const sup = (k: number | string) =>
  String(k).replace(/[-0-9]/g, (ch) => (ch === '-' ? '⁻' : '⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(ch)]!));

function sci(v: number, neg: boolean): string {
  const lg = Math.log10(Math.abs(v));
  let e = Math.floor(lg);
  let m = 10 ** (lg - e);
  if (Number(m.toFixed(2)) >= 10) {
    m /= 10;
    e += 1;
  }
  return `${neg ? '−' : ''}${m.toFixed(2)} × 10${sup(e)}`;
}

/** About 4 significant digits: "≈ 3.317", "≈ 1.53 × 10⁻⁵". */
function approxText(a: Rat): string {
  const v = approx(a);
  const neg = v < 0;
  if (Math.abs(v) >= 1e6 || Math.abs(v) < 1e-3) return `≈ ${sci(v, neg)}`;
  return `≈ ${neg ? '−' : ''}${Number(Math.abs(v).toPrecision(4)).toLocaleString('en-US')}`;
}

/**
 * A value as learners read it: whole numbers with commas (then "1.27 × 10³⁰"), short decimals
 * when exact, small fractions ("9/14"), otherwise about 4 digits ("≈ 178.6").
 */
export function fmt(a: Rat): string {
  const neg = a.n < 0n;
  const s = neg ? '−' : '';
  const n = babs(a.n);
  if (a.d === 1n) {
    if (n < 10n ** 15n) return s + commas(n.toString());
    return sci(approx(a), neg);
  }
  const k = decimalDen(a.d);
  if (k !== null && k <= 3 && n < 10n ** 12n) {
    const scaled = (n * 10n ** BigInt(k)) / a.d;
    const t = scaled.toString().padStart(k + 1, '0');
    return `${s}${commas(t.slice(0, -k))}.${t.slice(-k)}`;
  }
  if (a.d <= 100n && n < 1000n) return `${s}${n}/${a.d}`;
  return approxText(a);
}

/** A ratio, as a decimal: "3.202", "≈ 4.328", "2". */
export function fmtDecimal(a: Rat): string {
  if (a.d === 1n) return fmt(a);
  const k = decimalDen(a.d);
  if (k !== null && k <= 3) return fmt(a);
  return approxText(a);
}

/** "= 478" or "≈ 178.6", to follow a name. */
export function eq(text: string): string {
  return text.startsWith('≈') ? text : `= ${text}`;
}

// ----- Constants typed by learners -----

/** The largest constant c the page accepts, and the largest denominator. */
export const C_MAX = 1000;
export const DEN_MAX = 1000;

/** A constant as typed: "4", "3.1" or "1/14". Its text keeps the form the learner used. */
export interface Const {
  r: Rat;
  text: string;
}

/** Read a positive constant, or say what is wrong with it. */
export function parseConst(token: string, what = 'c'): Const | Error {
  const t = token.trim();
  let r: Rat;
  let text: string;
  const dec = /^(\d{1,7})(?:\.(\d{1,3}))?$/.exec(t);
  const frac = /^(\d{1,7})\/(\d{1,7})$/.exec(t);
  if (dec) {
    const digits = (dec[2] ?? '').replace(/0+$/, '');
    r = rat(BigInt(dec[1]! + digits), 10n ** BigInt(digits.length));
    text = digits ? `${BigInt(dec[1]!)}.${digits}` : String(BigInt(dec[1]!));
  } else if (frac) {
    if (BigInt(frac[2]!) === 0n) return new Error(`${what} = ${t} divides by zero.`);
    r = rat(BigInt(frac[1]!), BigInt(frac[2]!));
    if (r.d > BigInt(DEN_MAX)) return new Error(`Keep the bottom of ${what} to ${DEN_MAX} or less.`);
    text = r.d === 1n ? String(r.n) : `${r.n}/${r.d}`;
  } else {
    return new Error(`${what} must be a positive number, such as 4, 3.1 or 1/14.`);
  }
  if (r.n <= 0n) return new Error(`${what} must be positive: the definition needs c > 0.`);
  if (cmpR(r, rat(BigInt(C_MAX))) > 0) return new Error(`Pick ${what} up to ${C_MAX}.`);
  return { r, text };
}

/** A constant's text read back (state stores the text). */
export function constOf(text: string): Rat {
  const c = parseConst(text);
  if (c instanceof Error) throw c;
  return c.r;
}

// ----- Functions -----

/** One term: k · nᵃ · (log n)ᵇ · (2ⁿ)ᵉ · (n!)ˣ. */
export interface Term {
  k: Rat;
  a: number;
  b: number;
  e: number;
  x: number;
}

export interface Expr {
  /** Like terms combined, none zero, fastest growing first. */
  terms: Term[];
  /** The page's way of writing it, e.g. "3n² + 10n + 5". */
  text: string;
  /** Plain ASCII, for the code drivers and typing: "3n^2 + 10n + 5". */
  ascii: string;
}

export const MAX_POWER = 10;
export const MAX_LOG_POWER = 3;
export const MAX_TERMS = 6;

/**
 * Which of two terms grows faster, ignoring k: n! beats 2ⁿ beats any power of n beats any
 * power of log n. Positive when s grows faster than t.
 */
export function dominance(s: Term, t: Term): number {
  return s.x - t.x || s.e - t.e || s.a - t.a || s.b - t.b;
}

const SUP_DIGITS = '⁰¹²³⁴⁵⁶⁷⁸⁹';

function monoText(t: Term, ascii: boolean): string {
  const parts: string[] = [];
  if (t.a === 1) parts.push('n');
  else if (t.a > 1) parts.push(ascii ? `n^${t.a}` : `n${sup(t.a)}`);
  if (t.b === 1) parts.push('log n');
  else if (t.b > 1) parts.push(ascii ? `(log n)^${t.b}` : `log${sup(t.b)} n`);
  const extra: string[] = [];
  if (t.e) extra.push(ascii ? '2^n' : '2ⁿ');
  if (t.x) extra.push('n!');
  const head = parts.join(' ');
  return [head, ...extra].filter(Boolean).join(ascii ? ' * ' : '·');
}

/** A term without its sign. */
function termText(t: Term, ascii: boolean): string {
  const k = rat(babs(t.k.n), t.k.d);
  const mono = monoText(t, ascii);
  if (!mono) return k.d === 1n ? String(k.n) : `${k.n}/${k.d}`;
  const lead = k.n === 1n ? '' : String(k.n);
  // "3n log n" reads fine; "3 2ⁿ" does not, so a number before 2ⁿ or n! gets a dot.
  const joiner = lead && (mono.startsWith('2') || mono.startsWith('n!')) ? (ascii ? ' * ' : '·') : '';
  return `${lead}${joiner}${mono}${k.d === 1n ? '' : `/${k.d}`}`;
}

function sumText(terms: Term[], ascii: boolean): string {
  const minus = ascii ? '-' : '−';
  return terms
    .map((t, i) => {
      const body = termText(t, ascii);
      if (i === 0) return t.k.n < 0n ? `${minus}${body}` : body;
      return `${t.k.n < 0n ? ` ${minus} ` : ' + '}${body}`;
    })
    .join('');
}

/** The biggest term, as text ("3n²"). */
export const leadText = (e: Expr): string => sumText([e.terms[0]!], false);

export function makeExpr(raw: Term[]): Expr {
  const by = new Map<string, Term>();
  for (const t of raw) {
    const key = `${t.x},${t.e},${t.a},${t.b}`;
    const old = by.get(key);
    by.set(key, old ? { ...old, k: addR(old.k, t.k) } : t);
  }
  const terms = [...by.values()].filter((t) => t.k.n !== 0n).sort((s, t) => dominance(t, s));
  return { terms, text: sumText(terms, false), ascii: sumText(terms, true) };
}

// ----- Parsing -----

type Tok = { t: 'num'; v: Rat; raw: string } | { t: string };

const ALLOWED = /^[0-9n.+\-*/^!() logL]*$/;

function normalize(src: string): string {
  return src
    .replace(/[−–—]/g, '-')
    .replace(/[·×⋅∙]/g, '*')
    .replace(/ⁿ/g, '^n')
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, (m) => `^${[...m].map((ch) => SUP_DIGITS.indexOf(ch)).join('')}`)
    .replace(/₂/g, '')
    .replace(/\blg\b/gi, 'log')
    .replace(/LOG/gi, 'log')
    .replace(/N/g, 'n');
}

function tokenize(src: string): Tok[] | Error {
  const s = normalize(src);
  if (/\bln\b/.test(s)) return new Error('Use log n: here log means ⌊log₂ n⌋, and the base does not matter for Big-O.');
  if (!ALLOWED.test(s))
    return new Error('Use numbers, n, n^2, log n, 2^n, n!, +, −, * and / by a number.');
  const out: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i]!;
    if (ch === ' ') {
      i++;
      continue;
    }
    const num = /^\d+(?:\.\d+)?/.exec(s.slice(i));
    if (num) {
      const [whole, frac = ''] = num[0].split('.');
      if (whole!.length > 7 || frac.length > 3)
        return new Error(`${num[0]} is too long: use up to 7 digits and 3 decimals.`);
      out.push({ t: 'num', v: rat(BigInt(whole! + frac), 10n ** BigInt(frac.length)), raw: num[0] });
      i += num[0].length;
      continue;
    }
    if (s.startsWith('log', i)) {
      out.push({ t: 'log' });
      i += 3;
      continue;
    }
    if ('n+-*/^!()'.includes(ch)) {
      out.push({ t: ch });
      i++;
      continue;
    }
    return new Error(`"${ch}" is not something this page reads.`);
  }
  return out;
}

class Parser {
  i = 0;
  constructor(readonly toks: Tok[]) {}
  peek(k = 0): Tok | undefined {
    return this.toks[this.i + k];
  }
  take(): Tok | undefined {
    return this.toks[this.i++];
  }
  is(t: string, k = 0) {
    return this.peek(k)?.t === t;
  }
  int(what: string): number | Error {
    const tok = this.take();
    if (!tok || tok.t !== 'num' || !isInt((tok as { v: Rat }).v))
      return new Error(`${what} must be a whole number.`);
    return Number((tok as { v: Rat }).v.n);
  }
}

/** log n, log^2 n, log(n), (log n)^2: the power of log n. */
function logPower(p: Parser, inParens: boolean): number | Error {
  let pow = 1;
  if (p.is('^')) {
    p.take();
    const k = p.int('A power of log n');
    if (k instanceof Error) return k;
    pow = k;
  }
  if (p.is('(') && p.is('n', 1) && p.is(')', 2)) {
    p.i += 3;
  } else if (p.is('n')) {
    p.take();
  } else return new Error('Write log n, with the n.');
  if (inParens) {
    if (!p.is(')')) return new Error('Close (log n) with a ).');
    p.take();
    if (p.is('^')) {
      p.take();
      const k = p.int('A power of (log n)');
      if (k instanceof Error) return k;
      pow *= k;
    }
  }
  return pow;
}

function parseTerm(p: Parser): Term | Error {
  const t: Term = { k: ONE, a: 0, b: 0, e: 0, x: 0 };
  let factors = 0;
  for (;;) {
    const tok = p.peek();
    if (!tok || tok.t === '+' || tok.t === '-') break;
    if (tok.t === '*') {
      if (factors === 0) return new Error('Put something before *.');
      p.take();
      continue;
    }
    if (tok.t === '/') {
      p.take();
      const d = p.take();
      if (!d || d.t !== 'num') return new Error('Divide by a number only, as in n^2/2.');
      const v = (d as { v: Rat }).v;
      if (v.n === 0n) return new Error('That divides by zero.');
      t.k = divR(t.k, v);
      continue;
    }
    if (tok.t === 'num') {
      p.take();
      const v = (tok as { v: Rat }).v;
      if (p.is('^')) {
        p.take();
        if (p.is('n')) {
          p.take();
          if (v.n !== 2n || v.d !== 1n)
            return new Error('The only exponential here is 2^n (3^n and others are left out).');
          t.e += 1;
        } else {
          const k = p.int('A power of a number');
          if (k instanceof Error) return k;
          if (k > 6) return new Error('Keep powers of numbers to 6 or less.');
          t.k = mulR(t.k, rat(v.n ** BigInt(k), v.d ** BigInt(k)));
        }
      } else t.k = mulR(t.k, v);
    } else if (tok.t === 'n') {
      p.take();
      if (p.is('!')) {
        p.take();
        t.x += 1;
      } else if (p.is('^')) {
        p.take();
        if (p.is('n')) return new Error('nⁿ is not one of the functions here.');
        const k = p.int('A power of n');
        if (k instanceof Error) return k;
        t.a += k;
      } else t.a += 1;
    } else if (tok.t === 'log') {
      p.take();
      const k = logPower(p, false);
      if (k instanceof Error) return k;
      t.b += k;
    } else if (tok.t === '(') {
      p.take();
      if (p.is('log')) {
        p.take();
        const k = logPower(p, true);
        if (k instanceof Error) return k;
        t.b += k;
      } else if (p.is('n') && p.is(')', 1)) {
        p.i += 2;
        t.a += 1;
      } else return new Error('Brackets are only for (log n)^2.');
    } else {
      return new Error(`Unexpected "${tok.t}".`);
    }
    factors++;
  }
  if (factors === 0) return new Error('A term is missing: check the + and − signs.');
  if (t.a > MAX_POWER) return new Error(`Keep powers of n to ${MAX_POWER} or less.`);
  if (t.b > MAX_LOG_POWER) return new Error(`Keep powers of log n to ${MAX_LOG_POWER} or less.`);
  if (t.e > 1) return new Error('Use 2^n at most once in a term.');
  if (t.x > 1) return new Error('Use n! at most once in a term.');
  if (babs(t.k.n) > 10n ** 7n || t.k.d > BigInt(DEN_MAX))
    return new Error('Keep coefficients to 7 digits, and divide by at most 1000.');
  return t;
}

/** Read one function, or say what is wrong with it. */
export function parseExpr(src: string, name = 'f'): Expr | Error {
  const toks = tokenize(src);
  if (toks instanceof Error) return toks;
  if (toks.length === 0) return new Error(`${name}(n) is empty.`);
  const p = new Parser(toks);
  const raw: Term[] = [];
  let sign = 1n;
  if (p.is('+') || p.is('-')) sign = p.take()!.t === '-' ? -1n : 1n;
  for (;;) {
    const t = parseTerm(p);
    if (t instanceof Error) return t;
    raw.push({ ...t, k: rat(t.k.n * sign, t.k.d) });
    const op = p.take();
    if (!op) break;
    if (op.t !== '+' && op.t !== '-') return new Error(`Unexpected "${op.t}".`);
    sign = op.t === '-' ? -1n : 1n;
  }
  if (raw.length > MAX_TERMS) return new Error(`Use at most ${MAX_TERMS} terms.`);
  const e = makeExpr(raw);
  if (e.terms.length === 0) return new Error(`${name}(n) is 0 for every n.`);
  if (e.terms[0]!.k.n < 0n)
    return new Error(
      `${name}(n) = ${e.text} turns negative for large n. Its biggest term needs a + sign.`,
    );
  return e;
}

const exprCache = new Map<string, Expr | Error>();

/** parseExpr, remembered: states keep the text and views read it on every step. */
export function exprOf(text: string): Expr {
  let e = exprCache.get(text);
  if (!e) {
    e = parseExpr(text);
    if (exprCache.size > 500) exprCache.clear();
    exprCache.set(text, e);
  }
  if (e instanceof Error) throw e;
  return e;
}

// ----- Evaluating -----

/** ⌊log₂ n⌋ for n ≥ 1 (0 for n = 1). */
export function lgBig(n: bigint): bigint {
  if (n < 2n ** 53n) return BigInt(halvings(Number(n)));
  return BigInt(n.toString(2).length - 1);
}

const facts: bigint[] = [1n];
function factorial(n: number): bigint {
  for (let i = facts.length; i <= n; i++) facts.push(facts[i - 1]! * BigInt(i));
  return facts[n]!;
}

/** The largest n at which a term with 2ⁿ or n! is evaluated. */
export const EXP_LIMIT = 20_000n;
export const FACT_LIMIT = 3_000n;

/** Whether f(n) is small enough to compute exactly. */
export function evaluable(e: Expr, n: bigint): boolean {
  return e.terms.every((t) => (!t.e || n <= EXP_LIMIT) && (!t.x || n <= FACT_LIMIT));
}

function mono(t: Term, n: bigint): bigint {
  let v = t.a ? n ** BigInt(t.a) : 1n;
  if (t.b) v *= lgBig(n) ** BigInt(t.b);
  if (t.e) v <<= n;
  if (t.x) v *= factorial(Number(n));
  return v;
}

/** f(n), exactly. n ≥ 1. */
export function evalAt(e: Expr, n: bigint): Rat {
  if (!evaluable(e, n)) throw new Error(`${e.text} is too big to compute at n = ${n}`);
  let d = 1n;
  for (const t of e.terms) d = (d / gcd(d, t.k.d)) * t.k.d;
  let sum = 0n;
  for (const t of e.terms) sum += t.k.n * (d / t.k.d) * mono(t, n);
  return rat(sum, d);
}

const rangeCache = new Map<string, Rat[]>();

/** f(1), f(2), ..., f(N), remembered. */
export function valuesUpTo(e: Expr, N: number): Rat[] {
  const key = `${e.ascii}|${N}`;
  let vs = rangeCache.get(key);
  if (!vs) {
    vs = Array.from({ length: N }, (_, i) => evalAt(e, BigInt(i + 1)));
    if (rangeCache.size > 200) rangeCache.clear();
    rangeCache.set(key, vs);
  }
  return vs;
}

// ----- The limit of f/g -----

export type Limit = { kind: 'zero' } | { kind: 'const'; value: Rat } | { kind: 'inf' };

/**
 * lim f(n)/g(n) as n grows: the biggest terms decide. Exact for these functions, whose
 * biggest terms are both positive.
 */
export function limitOf(f: Expr, g: Expr): Limit {
  const a = f.terms[0]!;
  const b = g.terms[0]!;
  const d = dominance(a, b);
  if (d > 0) return { kind: 'inf' };
  if (d < 0) return { kind: 'zero' };
  return { kind: 'const', value: divR(a.k, b.k) };
}

export function limitText(l: Limit): string {
  return l.kind === 'zero' ? '0' : l.kind === 'inf' ? '∞' : fmt(l.value);
}
