/**
 * The game's rules, apart from the steps: legal splits, pumping, and the two sides' searches.
 *
 * A split is the lengths of its pieces: [x, y, z] for the regular lemma, [u, v, x, y, z] for the
 * context-free one. Legal means the pieces spell s and
 *   regular:       |xy| ≤ p and |y| ≥ 1
 *   context-free:  |vxy| ≤ p and |vy| ≥ 1
 *
 *   splits(n, p, lemma)          every legal split of a string of length n, in a fixed order
 *   pump(s, parts, i, lemma)     xyⁱz, or uvⁱxyⁱz
 *   survival(L, s, parts, lemma) for i = 0..MAX_I, is the pumped string in L?
 *   adversary(L, s, p, lemma)    every split with its survival, and the one the adversary picks:
 *                                one that survives every i if any does, else the one that
 *                                survives the most (the first of equals)
 *   proverI(L, s, parts, lemma)  the i the prover picks against a split: the first of 0, 2, 3, 4,
 *                                5 that pumps s out of L, or null
 */
import { type Language, type Lemma } from './languages';

/** The largest i either side plays: the lemma allows any i ≥ 0; the page stops here. */
export const MAX_I = 5;

/** The i's the prover tries, in order: 1 gives s back, so it never helps. */
export const PROVER_TRIES = [0, 2, 3, 4, 5];

export type Parts = number[];

/** In or out of L, for each i from 0 to MAX_I. */
export type Results = boolean[];

export const PART_NAMES: Record<Lemma, string[]> = {
  regular: ['x', 'y', 'z'],
  cf: ['u', 'v', 'x', 'y', 'z'],
};

/** Indexes of the pieces that pump. */
export const PUMPED: Record<Lemma, number[]> = { regular: [1], cf: [1, 3] };

/** Every legal split of a string of length n: x (or u) first, then the pumped piece's length. */
export function splits(n: number, p: number, lemma: Lemma): Parts[] {
  const out: Parts[] = [];
  if (lemma === 'regular') {
    for (let x = 0; x < p && x < n; x++)
      for (let y = 1; x + y <= p && x + y <= n; y++) out.push([x, y, n - x - y]);
    return out;
  }
  for (let u = 0; u < n; u++)
    for (let v = 0; v <= p; v++)
      for (let x = 0; v + x <= p; x++)
        for (let y = 0; v + x + y <= p; y++)
          if (v + y > 0 && u + v + x + y <= n) out.push([u, v, x, y, n - u - v - x - y]);
  return out;
}

/** The pieces' strings. */
export function pieces(s: string, parts: Parts): string[] {
  const out: string[] = [];
  let at = 0;
  for (const k of parts) {
    out.push(s.slice(at, at + k));
    at += k;
  }
  return out;
}

export function pump(s: string, parts: Parts, i: number, lemma: Lemma): string {
  const ps = pieces(s, parts);
  return ps.map((w, k) => (PUMPED[lemma].includes(k) ? w.repeat(i) : w)).join('');
}

/** Why a split is not legal for s, or null when it is. */
export function illegal(n: number, parts: Parts, p: number, lemma: Lemma): string | null {
  const names = PART_NAMES[lemma];
  if (parts.length !== names.length) return `a split has ${names.length} pieces, ${names.join(', ')}`;
  if (parts.some((k) => !Number.isInteger(k) || k < 0)) return 'the pieces need lengths of 0 or more';
  const total = parts.reduce((a, b) => a + b, 0);
  if (total !== n) return `the pieces are ${total} symbols long in all, and s is ${n}`;
  if (lemma === 'regular') {
    const [x, y] = parts as [number, number, number];
    if (y < 1) return 'y is empty: |y| must be at least 1, or pumping changes nothing';
    if (x + y > p) return `|xy| = ${x + y} is more than p = ${p}: x and y must lie in the first p symbols`;
    return null;
  }
  const [, v, x, y] = parts as [number, number, number, number, number];
  if (v + y < 1) return 'v and y are both empty: |vy| must be at least 1, or pumping changes nothing';
  if (v + x + y > p) return `|vxy| = ${v + x + y} is more than p = ${p}: v, x and y must lie within p symbols`;
  return null;
}

export function survival(l: Language, s: string, parts: Parts, lemma: Lemma): Results {
  return Array.from({ length: MAX_I + 1 }, (_, i) => l.member(pump(s, parts, i, lemma)));
}

export const survivesAll = (r: Results): boolean => r.every(Boolean);
export const firstOut = (r: Results): number => r.indexOf(false);
const score = (r: Results) => r.filter(Boolean).length;

export interface Tried {
  parts: Parts;
  results: Results;
}

export interface Search {
  tried: Tried[];
  /** Index into `tried` of the split the adversary picks. */
  pick: number;
  /** How many splits survive every i. */
  survivors: number;
}

export function adversary(l: Language, s: string, p: number, lemma: Lemma): Search {
  const tried = splits(s.length, p, lemma).map((parts) => ({
    parts,
    results: survival(l, s, parts, lemma),
  }));
  let pick = 0;
  tried.forEach((t, k) => {
    if (score(t.results) > score(tried[pick]!.results)) pick = k;
  });
  return { tried, pick, survivors: tried.filter((t) => survivesAll(t.results)).length };
}

export function proverI(l: Language, s: string, parts: Parts, lemma: Lemma): number | null {
  for (const i of PROVER_TRIES) if (!l.member(pump(s, parts, i, lemma))) return i;
  return null;
}

/**
 * A split as typed: pieces with bars, "aa|a|abbb" (ε or eps for an empty piece), or the lengths
 * of all pieces but the last, "2 1". Returns the lengths, or what is wrong.
 */
export function readSplit(text: string, s: string, lemma: Lemma): Parts | string {
  const names = PART_NAMES[lemma];
  const t = text.trim();
  if (t.includes('|')) {
    const ps = t.split('|').map((x) => x.trim().replace(/^(eps|ε)$/, ''));
    if (ps.length !== names.length)
      return `"${t}" has ${ps.length} pieces; a split has ${names.length}, ${names.join('|')}`;
    const joined = ps.join('');
    if (joined !== s) return `the pieces spell ${joined || 'ε'}, not s = ${s}`;
    return ps.map((x) => x.length);
  }
  if (/^\d+([\s,]+\d+)*$/.test(t)) {
    const ks = t.split(/[\s,]+/).map(Number);
    if (ks.length === names.length - 1) {
      const rest = s.length - ks.reduce((a, b) => a + b, 0);
      if (rest < 0) return `those lengths add up to more than |s| = ${s.length}`;
      return [...ks, rest];
    }
    if (ks.length === names.length) return ks;
    return `give ${names.length - 1} lengths, for ${names.slice(0, -1).join(', ')}; ${names.at(-1)} is the rest`;
  }
  return `type the split as ${names.join('|')}, such as ${example(s, lemma)}, or as the lengths of ${names.slice(0, -1).join(', ')}`;
}

function example(s: string, lemma: Lemma): string {
  const n = s.length;
  const parts =
    lemma === 'regular' ? [0, 1, n - 1] : n >= 3 ? [1, 1, 0, 1, n - 3] : [0, 1, 0, 1, n - 2];
  return pieces(s, parts)
    .map((w) => w || 'ε')
    .join('|');
}
