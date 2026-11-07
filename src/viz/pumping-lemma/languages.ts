/**
 * The languages the game is played on, each with a membership test written in code, a reason for
 * its answer, its place in the hierarchy, and the string the page picks when it is the prover.
 *
 *   member(w)       is w in L?
 *   why(w)          a clause that says why or why not: "it has 6 a's and 4 b's"
 *   level           regular, context-free (and not regular), or beyond (not context-free)
 *   prover(p, lem)  the page's string: in L, at least p long, and (when L is outside the lemma's
 *                   class) one that beats every legal split with some i from 0 to MAX_I
 *   sample(rng, n)  a string in L, at least n long, for presets and tests
 *   argue[lemma]    the general argument, for every p, when L is outside the lemma's class
 */
import type { Rng } from '../../engine/rng';
import { plural } from '../_automata/page';

export type LangId =
  'anbn' | 'paren' | 'wwr' | 'ww' | 'anbncn' | 'squares' | 'primes' | 'abstar' | 'astarbstar';

export type Lemma = 'regular' | 'cf';
export type Level = 'regular' | 'cf' | 'beyond';

/** Longest string a learner may pick, so it fits on a phone in two rows. */
export const MAX_S = 20;

export interface Language {
  id: LangId;
  /** What a learner types to pick it. */
  key: string;
  /** Other spellings a learner may type (never a string over the alphabet). */
  aliases: string[];
  /** The language as a noun in a sentence. */
  name: string;
  /** The language in set notation. */
  set: string;
  /** What its strings look like, in plain words. */
  plain: string;
  alphabet: string[];
  level: Level;
  member(w: string): boolean;
  why(w: string): string;
  prover(p: number, lemma: Lemma): string;
  sample(rng: Rng, n: number): string;
  argue: Partial<Record<Lemma, string>>;
}

const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
export const sup = (n: number): string => [...String(n)].map((d) => SUP[Number(d)]).join('');

/**
 * A string as narration writes it: runs of three or more of a symbol as a power, so a⁴b⁴ rather
 * than aaaabbbb; ε for the empty string.
 */
export function show(w: string): string {
  if (w === '') return 'ε';
  let out = '';
  for (let i = 0; i < w.length;) {
    let j = i;
    while (j < w.length && w[j] === w[i]) j++;
    const n = j - i;
    out += n >= 3 ? `${w[i]}${sup(n)}` : w.slice(i, j);
    i = j;
  }
  return out;
}

const count = (w: string, c: string) => [...w].filter((x) => x === c).length;
const rep = (s: string, n: number) => s.repeat(Math.max(0, n));
const reverse = (w: string) => [...w].reverse().join('');
const symbolCount = (n: number, c: string) => plural(n, c, `${c}'s`);

function isPrime(n: number): boolean {
  if (n < 2) return false;
  for (let d = 2; d * d <= n; d++) if (n % d === 0) return false;
  return true;
}

function factor(n: number): string {
  for (let d = 2; d * d <= n; d++) if (n % d === 0) return `${d} × ${n / d}`;
  return String(n);
}

const nextPrime = (n: number) => {
  let q = Math.max(2, n);
  while (!isPrime(q)) q++;
  return q;
};

/** The first place an ordered word goes wrong: "a b comes before an a". */
function order(w: string, letters: string[]): string | null {
  let at = 0;
  for (const c of w) {
    const k = letters.indexOf(c);
    if (k < at) {
      const prev = letters[at]!;
      return `${article(prev)} ${prev} comes before ${article(c)} ${c}`;
    }
    at = k;
  }
  return null;
}

const article = (c: string) => (/^[aeiou]/.test(c) ? 'an' : 'a');

function randomWord(rng: Rng, n: number, letters: string[]): string {
  let w = '';
  for (let i = 0; i < n; i++) w += letters[rng.int(0, letters.length - 1)];
  return w;
}

/** A random string of balanced parentheses with n pairs. */
function randomBalanced(rng: Rng, n: number): string {
  let w = '';
  let open = 0;
  let left = n;
  while (left > 0 || open > 0) {
    if (left > 0 && (open === 0 || rng.int(0, 1) === 0)) {
      w += '(';
      open++;
      left--;
    } else {
      w += ')';
      open--;
    }
  }
  return w;
}

const half = (n: number) => Math.ceil(n / 2);

export const LANGUAGES: Language[] = [
  {
    id: 'anbn',
    key: 'anbn',
    aliases: ['aⁿbⁿ', 'a^nb^n'],
    name: 'aⁿbⁿ',
    set: '{ aⁿbⁿ : n ≥ 0 }',
    plain: "some a's, then as many b's",
    alphabet: ['a', 'b'],
    level: 'cf',
    member: (w) => /^a*b*$/.test(w) && count(w, 'a') === count(w, 'b'),
    why(w) {
      const o = order(w, ['a', 'b']);
      if (o) return o;
      const a = count(w, 'a');
      const b = count(w, 'b');
      return a === b
        ? `it is ${symbolCount(a, 'a')}, then ${symbolCount(b, 'b')}`
        : `it has ${symbolCount(a, 'a')} and ${symbolCount(b, 'b')}`;
    },
    prover: (p) => rep('a', p) + rep('b', p),
    sample: (_rng, n) => rep('a', half(n)) + rep('b', half(n)),
    argue: {
      regular:
        "With s = aᵖbᵖ, |xy| ≤ p keeps y inside the a's, so xy²z has more a's than b's, whatever p is.",
    },
  },
  {
    id: 'paren',
    key: 'paren',
    aliases: ['balanced', 'parens', 'parentheses', 'dyck'],
    name: 'balanced parentheses',
    set: '{ w : w balances ( and ) }',
    plain: 'every ( closed by a later )',
    alphabet: ['(', ')'],
    level: 'cf',
    member(w) {
      let open = 0;
      for (const c of w) {
        open += c === '(' ? 1 : -1;
        if (open < 0) return false;
      }
      return open === 0;
    },
    why(w) {
      let open = 0;
      for (let i = 0; i < w.length; i++) {
        open += w[i] === '(' ? 1 : -1;
        if (open < 0) return `the ) at position ${i + 1} closes nothing`;
      }
      if (open > 0) return `it leaves ${plural(open, 'parenthesis', 'parentheses')} open`;
      return 'every ( is closed by a later )';
    },
    prover: (p) => rep('(', p) + rep(')', p),
    sample: (rng, n) => randomBalanced(rng, half(n)),
    argue: {
      regular:
        "With s = (ᵖ)ᵖ, y lies in the first p symbols, so it is all ('s, and xy²z opens more than it closes.",
    },
  },
  {
    id: 'wwr',
    key: 'wwr',
    aliases: ['wwᴿ', 'ww^r', 'evenpal', 'palindromes'],
    name: 'wwᴿ',
    set: '{ wwᴿ : w ∈ {a, b}* }',
    plain: 'a string followed by its mirror image',
    alphabet: ['a', 'b'],
    level: 'cf',
    member: (w) => w.length % 2 === 0 && w === reverse(w),
    why(w) {
      if (w.length % 2) return `its length, ${w.length}, is odd`;
      for (let i = 0; i < w.length / 2; i++) {
        const j = w.length - 1 - i;
        if (w[i] !== w[j])
          return `it does not read the same backwards: symbol ${i + 1} is ${w[i]} and symbol ${j + 1} is ${w[j]}`;
      }
      return w === ''
        ? 'it is ε, the empty mirror'
        : `it is ${show(w.slice(0, w.length / 2))} and its mirror image`;
    },
    prover: (p) => `${rep('a', p)}bb${rep('a', p)}`,
    sample(rng, n) {
      const w = randomWord(rng, half(n), ['a', 'b']);
      return w + reverse(w);
    },
    argue: {
      regular:
        "With s = aᵖbbaᵖ, y is all a's from the first block, so pumping it leaves the two sides of bb with different numbers of a's.",
    },
  },
  {
    id: 'ww',
    key: 'ww',
    aliases: ['copy'],
    name: 'ww',
    set: '{ ww : w ∈ {a, b}* }',
    plain: 'a string followed by a copy of itself',
    alphabet: ['a', 'b'],
    level: 'beyond',
    member: (w) => w.length % 2 === 0 && w.slice(0, w.length / 2) === w.slice(w.length / 2),
    why(w) {
      if (w.length % 2) return `its length, ${w.length}, is odd`;
      const a = w.slice(0, w.length / 2);
      const b = w.slice(w.length / 2);
      return a === b
        ? `its two halves are both ${show(a)}`
        : `its two halves, ${show(a)} and ${show(b)}, differ`;
    },
    prover: (p, lemma) =>
      lemma === 'regular'
        ? `${rep('a', p)}b${rep('a', p)}b`
        : rep('a', p) + rep('b', p) + rep('a', p) + rep('b', p),
    sample(rng, n) {
      const w = randomWord(rng, half(n), ['a', 'b']);
      return w + w;
    },
    argue: {
      regular:
        "With s = aᵖbaᵖb, y is all a's from the first block, so after pumping the first half no longer matches the second.",
      cf: 'With s = aᵖbᵖaᵖbᵖ, vxy is at most p long. Inside one half, pumping moves the middle and the halves stop matching; across the middle, pumping down leaves aᵖbⁱaʲbᵖ with i or j below p.',
    },
  },
  {
    id: 'anbncn',
    key: 'anbncn',
    aliases: ['aⁿbⁿcⁿ', 'a^nb^nc^n'],
    name: 'aⁿbⁿcⁿ',
    set: '{ aⁿbⁿcⁿ : n ≥ 0 }',
    plain: "a's, b's and c's, as many of each, in that order",
    alphabet: ['a', 'b', 'c'],
    level: 'beyond',
    member: (w) =>
      /^a*b*c*$/.test(w) && count(w, 'a') === count(w, 'b') && count(w, 'b') === count(w, 'c'),
    why(w) {
      const o = order(w, ['a', 'b', 'c']);
      if (o) return o;
      const [a, b, c] = ['a', 'b', 'c'].map((x) => count(w, x)) as [number, number, number];
      const counts = `${symbolCount(a, 'a')}, ${symbolCount(b, 'b')} and ${symbolCount(c, 'c')}`;
      return a === b && b === c ? `it has ${counts}, in that order` : `it has ${counts}`;
    },
    prover: (p) => rep('a', p) + rep('b', p) + rep('c', p),
    sample: (_rng, n) => {
      const k = Math.ceil(n / 3);
      return rep('a', k) + rep('b', k) + rep('c', k);
    },
    argue: {
      regular: "With s = aᵖbᵖcᵖ, y is all a's, so xy²z has more a's than c's.",
      cf: 'With s = aᵖbᵖcᵖ, vxy is at most p long, so it cannot touch both the a’s and the c’s. Pumping changes at most two of the three counts.',
    },
  },
  {
    id: 'squares',
    key: 'squares',
    aliases: ['a^(n²)', 'a^(n^2)', 'square', 'aⁿ²'],
    name: 'a^(n²)',
    set: '{ a^(n²) : n ≥ 0 }',
    plain: "a's, as many as a perfect square",
    alphabet: ['a'],
    level: 'beyond',
    member: (w) => /^a*$/.test(w) && Number.isInteger(Math.sqrt(w.length)),
    why(w) {
      const n = w.length;
      const r = Math.floor(Math.sqrt(n));
      if (r * r === n) return `its length is ${n} = ${r}²`;
      return `its length, ${n}, falls between ${r}² = ${r * r} and ${r + 1}² = ${(r + 1) * (r + 1)}`;
    },
    // a^(p²) when it fits on screen, else the largest square that does, still at least p long.
    prover: (p) => rep('a', Math.min(p, Math.floor(Math.sqrt(MAX_S))) ** 2),
    sample: (_rng, n) => rep('a', Math.ceil(Math.sqrt(n)) ** 2),
    argue: {
      regular:
        'With s = a^(p²), 1 ≤ |y| ≤ p, so |xy²z| lies strictly between p² and p² + 2p + 1 = (p + 1)².',
      cf: 'With s = a^(p²), 1 ≤ |vy| ≤ p, so |uv²xy²z| lies strictly between p² and (p + 1)².',
    },
  },
  {
    id: 'primes',
    key: 'primes',
    aliases: ['prime', 'a^prime', 'aⁿprime'],
    name: 'aⁿ (n prime)',
    set: '{ aⁿ : n is prime }',
    plain: "a's, a prime number of them",
    alphabet: ['a'],
    level: 'beyond',
    member: (w) => /^a*$/.test(w) && isPrime(w.length),
    why(w) {
      const n = w.length;
      if (isPrime(n)) return `its length, ${n}, is prime`;
      if (n < 2) return `its length, ${n}, is not prime`;
      return `its length, ${n} = ${factor(n)}, is not prime`;
    },
    prover: (p) => rep('a', nextPrime(p + 2)),
    sample: (_rng, n) => rep('a', nextPrime(n)),
    argue: {
      regular:
        'Take s = a^q for a prime q ≥ p + 2 and i = q + 1 (past this page’s limit): |xy^(q+1)z| = q + q|y| = q(1 + |y|), which is never prime.',
      cf: 'Take s = a^q for a prime q ≥ p + 2 and i = q + 1: |uv^(q+1)xy^(q+1)z| = q(1 + |vy|), which is never prime.',
    },
  },
  {
    id: 'abstar',
    key: '(ab)*',
    aliases: ['abstar', '(ab)^n', '(ab)ⁿ'],
    name: '(ab)*',
    set: '{ (ab)ⁿ : n ≥ 0 }',
    plain: 'ab, repeated',
    alphabet: ['a', 'b'],
    level: 'regular',
    member: (w) => /^(ab)*$/.test(w),
    why(w) {
      for (let i = 0; i < w.length; i++) {
        const want = i % 2 ? 'b' : 'a';
        if (w[i] !== want) return `symbol ${i + 1} should be ${want} but is ${w[i]}`;
      }
      if (w.length % 2) return 'it stops halfway through an ab';
      return `it is ab repeated ${plural(w.length / 2, 'time')}`;
    },
    prover: (p) => rep('ab', p),
    sample: (_rng, n) => rep('ab', half(n)),
    argue: {},
  },
  {
    id: 'astarbstar',
    key: 'a*b*',
    aliases: ['astarbstar', 'aibj', 'aⁱbʲ', 'a^ib^j'],
    name: 'a*b*',
    set: '{ aⁱbʲ : i, j ≥ 0 }',
    plain: "some a's, then some b's, any numbers",
    alphabet: ['a', 'b'],
    level: 'regular',
    member: (w) => /^a*b*$/.test(w),
    why: (w) => order(w, ['a', 'b']) ?? "it is a's, then b's",
    prover: (p) => rep('a', p) + rep('b', p),
    sample(rng, n) {
      const i = rng.int(0, n);
      return rep('a', i) + rep('b', n - i);
    },
    argue: {},
  },
];

export const LANGUAGE = new Map(LANGUAGES.map((l) => [l.id, l]));
export const lang = (id: LangId): Language => LANGUAGE.get(id)!;

const squash = (t: string) => t.replace(/\s+/g, '').toLowerCase();

/** The language a learner typed, by key, id, name or alias, ignoring spaces and case. */
export function findLanguage(text: string): Language | null {
  const t = squash(text);
  if (!t) return null;
  return (
    LANGUAGES.find(
      (l) =>
        l.id === t ||
        squash(l.key) === t ||
        squash(l.name) === t ||
        l.aliases.some((a) => squash(a) === t),
    ) ?? null
  );
}

/** "anbn, paren, …, (ab)* or a*b*": what to type for each language. */
export const KEYS = LANGUAGES.map((l) => l.key);

/** Is L in the class the lemma is about? Then the prover cannot win. */
export const inClass = (l: Language, lemma: Lemma): boolean =>
  lemma === 'regular' ? l.level === 'regular' : l.level !== 'beyond';

/** "regular" or "context-free": what the adversary claims. */
export const CLAIM: Record<Lemma, string> = { regular: 'regular', cf: 'context-free' };

/** Where L sits, as a phrase. */
export const LEVEL_TEXT: Record<Level, string> = {
  regular: 'regular',
  cf: 'context-free but not regular',
  beyond: 'not even context-free',
};

/** The symbols of L, as a set: "{a, b}". */
export const alphabetText = (l: Language): string => `{${l.alphabet.join(', ')}}`;
