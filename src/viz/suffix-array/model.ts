/**
 * Suffix array and LCP array. The suffix array SA lists the starting positions of the
 * suffixes of T in sorted order; LCP[i] is the length of the longest common prefix of the
 * suffixes in rows i - 1 and i (LCP[0] has no row above it and is 0).
 *
 * Build: sort the suffixes, by comparing them directly (naive: insertion sort, one suffix
 * comparison at a time) or by prefix doubling (Manber and Myers: rank by the first character,
 * then sort by pairs of ranks, so each round doubles the length of prefix that is sorted).
 * Doubling is the default. Then Kasai's algorithm fills LCP in O(n), visiting suffixes in text
 * order so that h drops by at most one from one suffix to the next.
 *
 * Operations after a build: `search P` finds the rows that start with P by two binary
 * searches, and `repeat` reads the longest repeated substring off the largest LCP. Both build
 * first when the array is not there yet.
 *
 * No end marker ($) is added: a suffix that is a prefix of another sorts first, as in a
 * dictionary. The state is the text and the finished arrays; the work in progress (the order
 * of the rows, ranks, pointers) travels in each step's `extra`.
 */
import type { Mark, MarkRole, OpSpec, PseudoBlock, Scalar, Step, Value } from '../../engine/types';

export const MAX_TEXT = 16;
export const START_TEXT = 'BANANA';

export interface SuffixState {
  text: string;
  /** Null until built. */
  sa: number[] | null;
  lcp: number[] | null;
}

export interface SuffixSettings {
  [key: string]: Scalar;
  method: 'doubling' | 'naive';
}

export const defaults: SuffixSettings = { method: 'doubling' };

/** A highlight over the first `len` characters of the suffix starting at p. */
export interface Highlight {
  p: number;
  len: number;
  role: MarkRole;
}

export interface SuffixExtra {
  /** The rows, top to bottom, as suffix start positions. */
  order?: number[];
  /** Prefix doubling: each suffix's rank (by start position), the pair it sorts by, and k. */
  rank?: number[];
  keys?: [number, number][];
  k?: number;
  /** LCP so far, by row (null: not known yet). */
  lcp?: (number | null)[];
  hl?: Highlight[];
  /** Binary search. `hi` may be n (one past the last row). */
  search?: { pattern: string; lo: number; hi: number; mid?: number; found?: [number, number] };
  /** Text positions to mark in the top row. */
  spots?: { from: number; len: number; role: MarkRole }[];
}

type S = SuffixState;
type X = SuffixExtra;
type Op = OpSpec<S, SuffixSettings, X>;
type SaStep = Step<S, X>;
type Gen<R = S> = Generator<SaStep, R, void>;

export const init = (): S => ({ text: START_TEXT, sa: null, lcp: null });

const mark = (id: string, role: MarkRole): Mark => ({ id, role });
export const rowId = (p: number) => `s-${p}`;
export const lcpId = (i: number) => `lcp-${i}`;
export const textId = (i: number) => `t-${i}`;

export const q = (s: string) => `'${s}'`;
export const suffix = (t: string, p: number) => t.slice(p);
const andList = (xs: readonly number[]) =>
  xs.length <= 1 ? String(xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Compare two suffixes as a dictionary does. Returns the sign and the characters compared. */
export function compareSuffixes(t: string, a: number, b: number): { cmp: number; chars: number } {
  let j = 0;
  while (a + j < t.length && b + j < t.length) {
    if (t[a + j] !== t[b + j]) return { cmp: t[a + j]! < t[b + j]! ? -1 : 1, chars: j + 1 };
    j++;
  }
  // One ran out: the shorter suffix is a prefix of the other and sorts first.
  return { cmp: t.length - a - (t.length - b), chars: j };
}

/** Compare P with the first |P| characters of the suffix at p. */
export function comparePattern(t: string, p: number, pat: string): { cmp: number; same: number } {
  let j = 0;
  while (j < pat.length && p + j < t.length && t[p + j] === pat[j]) j++;
  if (j === pat.length) return { cmp: 0, same: j };
  if (p + j >= t.length) return { cmp: -1, same: j };
  return { cmp: t[p + j]! < pat[j]! ? -1 : 1, same: j };
}

/** Characters a pattern comparison looked at: the matches, and the one that differed. */
const charsCompared = (same: number, m: number, p: number, n: number) =>
  same + (same < m && p + same < n ? 1 : 0);

// ----- Reading input -----

export function parseText(raw: Value | undefined, what: 'text' | 'pattern'): string | Error {
  const t = String(raw ?? '').trim();
  if (!t) return new Error(`Type a ${what}, such as BANANA.`);
  if (/\s/.test(t)) return new Error(`The ${what} cannot hold spaces: type one word.`);
  const bad = /[^A-Za-z0-9]/.exec(t);
  if (bad) return new Error(`"${bad[0]}" is not allowed. Use letters and digits only.`);
  if (t.length > MAX_TEXT)
    return new Error(
      `That is ${t.length} characters. Keep it to ${MAX_TEXT}, so every suffix fits.`,
    );
  return t;
}

export function parseInput(token: string): Value | Error {
  return parseText(token, 'text');
}

// ----- Counters -----

interface Counters {
  comparisons: number;
  chars: number;
  rounds: number;
  probes: number;
}

const zero = (): Counters => ({ comparisons: 0, chars: 0, rounds: 0, probes: 0 });

function vars(s: S, c: Counters, more: Record<string, Scalar> = {}): Record<string, Scalar> {
  return { n: s.text.length, ...more, ...c };
}

// ----- Build -----

function* naiveSort(t: string, c: Counters, s: S): Gen<number[]> {
  const n = t.length;
  const order = Array.from({ length: n }, (_, i) => i);
  yield {
    state: s,
    marks: [],
    say: `The ${n} suffixes of ${q(t)}, in the order they start. Sort them with insertion sort: take each suffix in turn and move it up past every suffix that is larger.`,
    lines: ['n.for'],
    level: 2,
    vars: vars(s, c),
    extra: { order: [...order] },
  };
  for (let i = 1; i < n; i++) {
    const x = order[i]!;
    let j = i - 1;
    for (;;) {
      if (j < 0) break;
      const y = order[j]!;
      const { cmp, chars } = compareSuffixes(t, y, x);
      c.comparisons++;
      c.chars += chars;
      const bigger = cmp > 0;
      yield {
        state: s,
        marks: [mark(rowId(x), 'active'), mark(rowId(y), bigger ? 'error' : 'compare')],
        say: bigger
          ? `${q(suffix(t, y))} > ${q(suffix(t, x))}${chars > 1 ? ` (they agree on ${plural(chars - 1, 'character')} first)` : ''}, so ${q(suffix(t, x))} moves above it.`
          : `${q(suffix(t, y))} < ${q(suffix(t, x))}, so ${q(suffix(t, x))} stops here.`,
        lines: ['n.while'],
        level: 3,
        vars: vars(s, c, { i, j }),
        extra: {
          order: [...order],
          hl: [
            { p: x, len: Math.min(chars, n - x), role: 'compare' },
            { p: y, len: Math.min(chars, n - y), role: 'compare' },
          ],
        },
      };
      if (!bigger) break;
      order[j + 1] = y;
      order[j] = x;
      j--;
    }
    yield {
      state: s,
      marks: [mark(rowId(x), 'new')],
      say: `${q(suffix(t, x))} is in place: the first ${i + 1} suffixes are sorted.`,
      lines: ['n.insert'],
      level: 2,
      vars: vars(s, c, { i }),
      extra: { order: [...order] },
    };
  }
  return order;
}

function* doublingSort(t: string, c: Counters, s: S): Gen<number[]> {
  const n = t.length;
  const letters = [...new Set(t)].sort();
  let rank = [...t].map((ch) => letters.indexOf(ch));
  let order = Array.from({ length: n }, (_, i) => i).sort((a, b) => rank[a]! - rank[b]! || a - b);
  yield {
    state: s,
    marks: [],
    say: `Rank each suffix by its first character alone: ${letters.map((ch, r) => `${ch} = ${r}`).join(', ')}. Suffixes that start with the same character share a rank.`,
    lines: ['d.rank'],
    level: 2,
    vars: vars(s, c, { k: 1 }),
    extra: { order: [...order], rank: [...rank], k: 1, hl: order.map((p) => hl1(p, 1, n)) },
  };
  let k = 1;
  while (Math.max(...rank) < n - 1) {
    c.rounds++;
    const keys = Array.from(
      { length: n },
      (_, p) => [rank[p]!, p + k < n ? rank[p + k]! : -1] as [number, number],
    );
    yield {
      state: s,
      marks: [],
      say: `Ranks still repeat, so double. Pair each suffix's rank with the rank of the suffix ${k} further on: that pair sorts the first ${2 * k} characters. Past the end counts as −1, smaller than any rank.`,
      lines: ['d.while', 'd.pair'],
      level: 2,
      vars: vars(s, c, { k }),
      extra: { order: [...order], rank: [...rank], keys, k, hl: order.map((p) => hl1(p, k, n)) },
    };
    const cmp = (a: number, b: number) =>
      keys[a]![0] - keys[b]![0] || keys[a]![1] - keys[b]![1] || 0;
    order = [...order].sort((a, b) => {
      c.comparisons++;
      return cmp(a, b);
    });
    yield {
      state: s,
      marks: [],
      say: `Sort the suffixes by their pairs. Now they are in order by their first ${2 * k} characters.`,
      lines: ['d.sort'],
      level: 2,
      vars: vars(s, c, { k }),
      extra: {
        order: [...order],
        rank: [...rank],
        keys,
        k,
        hl: order.map((p) => hl1(p, 2 * k, n)),
      },
    };
    const next = Array<number>(n).fill(0);
    for (let i = 1; i < n; i++)
      next[order[i]!] = next[order[i - 1]!]! + (cmp(order[i - 1]!, order[i]!) < 0 ? 1 : 0);
    rank = next;
    const distinct = Math.max(...rank) + 1;
    yield {
      state: s,
      marks: [],
      say: `Give each suffix a new rank: equal pairs share one. ${distinct === n ? `All ${n} ranks are different, so the suffixes are sorted.` : `There are ${distinct} different ranks for ${n} suffixes, so some still tie.`}`,
      lines: ['d.rerank'],
      level: 2,
      vars: vars(s, c, { k: 2 * k }),
      extra: {
        order: [...order],
        rank: [...rank],
        k: 2 * k,
        hl: order.map((p) => hl1(p, 2 * k, n)),
      },
    };
    k *= 2;
  }
  return order;
}

const hl1 = (p: number, len: number, n: number): Highlight => ({
  p,
  len: Math.min(len, n - p),
  role: 'visit',
});

/** Kasai's algorithm: LCP from SA in O(n). */
function* kasai(t: string, sa: number[], c: Counters, s: S): Gen<number[]> {
  const n = t.length;
  const inv = Array<number>(n);
  sa.forEach((p, i) => (inv[p] = i));
  const lcp: (number | null)[] = Array(n).fill(null);
  lcp[0] = 0;
  let h = 0;
  yield {
    state: s,
    marks: [mark(lcpId(0), 'new')],
    say: `Now the LCP array, by Kasai's algorithm. Visit the suffixes in text order, from position 0, and compare each with the suffix in the row above it. Row 0 has nothing above it: LCP[0] = 0.`,
    lines: ['k.rank', 'k.h'],
    level: 2,
    vars: vars(s, c, { h }),
    extra: { order: [...sa], lcp: [...lcp] },
  };
  for (let i = 0; i < n; i++) {
    const row = inv[i]!;
    if (row === 0) {
      h = 0;
      yield {
        state: s,
        marks: [mark(rowId(i), 'active')],
        say: `Position ${i}: ${q(suffix(t, i))} is in row 0, with no row above. Skip it, and h starts again from 0.`,
        lines: ['k.for', 'k.if'],
        level: 3,
        vars: vars(s, c, { i, h }),
        extra: { order: [...sa], lcp: [...lcp] },
      };
      continue;
    }
    const j = sa[row - 1]!;
    const start = h;
    while (i + h < n && j + h < n && t[i + h] === t[j + h]) {
      h++;
      c.chars++;
    }
    if (i + h < n && j + h < n) c.chars++;
    lcp[row] = h;
    const common = h ? q(t.slice(i, i + h)) : 'nothing';
    yield {
      state: s,
      marks: [mark(rowId(i), 'active'), mark(rowId(j), 'compare'), mark(lcpId(row), 'new')],
      say: `Position ${i}: ${q(suffix(t, i))} is in row ${row}; above it is ${q(suffix(t, j))}. ${start ? `The first ${start === 1 ? 'character is' : `${start} characters are`} known to match (h = ${start}), so start comparing after ${start === 1 ? 'it' : 'them'}. ` : ''}They share ${common}: LCP[${row}] = ${h}.${h ? ' Then h drops by one for the next position.' : ''}`,
      lines: ['k.for', 'k.if', 'k.j', 'k.while', 'k.set', 'k.dec'],
      level: 2,
      vars: vars(s, c, { i, h }),
      extra: {
        order: [...sa],
        lcp: [...lcp],
        hl: h
          ? [
              { p: i, len: h, role: 'found' },
              { p: j, len: h, role: 'found' },
            ]
          : [],
      },
    };
    if (h > 0) h--;
  }
  return lcp as number[];
}

function* build(s0: S, settings: SuffixSettings, c: Counters): Gen {
  const t = s0.text;
  const s: S = { text: t, sa: null, lcp: null };
  const sa = settings.method === 'naive' ? yield* naiveSort(t, c, s) : yield* doublingSort(t, c, s);
  const lcp = yield* kasai(t, sa, c, s);
  const done: S = { text: t, sa, lcp };
  return done;
}

const buildOp: Op = {
  label: 'Build',
  arity: 0,
  *run(s, _args, { settings }) {
    const c = zero();
    const done = yield* build(s, settings, c);
    const max = Math.max(...done.lcp!);
    yield {
      state: done,
      marks: [],
      say: `Built. SA = [${done.sa!.join(', ')}] and LCP = [${done.lcp!.join(', ')}]. ${settings.method === 'naive' ? `Sorting took ${plural(c.comparisons, 'suffix comparison')} and ${plural(c.chars, 'character comparison')} in all.` : `Prefix doubling took ${plural(c.rounds, 'round')}.`} The largest LCP is ${max}.`,
      lines: ['d.done', 'k.done'],
      level: 1,
      vars: vars(done, c),
      extra: { order: [...done.sa!], lcp: [...done.lcp!] },
    };
    return done;
  },
};

/** Build first when needed; returns the built state. */
function* ready(s: S, settings: SuffixSettings, c: Counters): Gen {
  if (s.sa && s.lcp) return s;
  const done = yield* build(s, settings, c);
  yield {
    state: done,
    marks: [],
    say: `The suffix array is built: SA = [${done.sa!.join(', ')}].`,
    lines: ['d.done', 'k.done'],
    level: 2,
    vars: vars(done, c),
    extra: { order: [...done.sa!], lcp: [...done.lcp!] },
  };
  return done;
}

const searchOp: Op = {
  label: 'Search',
  arity: 1,
  *run(s0, [arg], { settings }) {
    const pat = parseText(arg, 'pattern');
    if (pat instanceof Error) {
      yield {
        state: s0,
        marks: [],
        say: `Nothing to search for. ${pat.message}`,
        lines: [],
        level: 1,
        vars: { n: s0.text.length },
      };
      return s0;
    }
    const c = zero();
    const s = yield* ready(s0, settings, c);
    const t = s.text;
    const sa = s.sa!;
    const lcp = s.lcp!;
    const n = t.length;
    const m = pat.length;
    const base = { order: [...sa], lcp: [...lcp] };
    let lo = 0;
    let hi = n;
    yield {
      state: s,
      marks: [],
      say: `Search for P = ${q(pat)}. The rows that start with P sit together, because the suffixes are sorted. First find the top of that block: the first row whose suffix is not smaller than P. lo = 0 and hi = ${n}.`,
      lines: ['s.lo'],
      level: 2,
      vars: vars(s, c, { lo, hi }),
      extra: { ...base, search: { pattern: pat, lo, hi } },
    };
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      const p = sa[mid]!;
      const { cmp, same } = comparePattern(t, p, pat);
      c.probes++;
      c.chars += charsCompared(same, m, p, n);
      const smaller = cmp < 0;
      const was = { lo, hi };
      if (smaller) lo = mid + 1;
      else hi = mid;
      yield {
        state: s,
        marks: [mark(rowId(p), smaller ? 'compare' : 'active')],
        say: `mid = ⌊(${was.lo} + ${was.hi}) / 2⌋ = ${mid}: ${q(suffix(t, p))} ${cmp < 0 ? `< ${q(pat)}` : cmp === 0 ? `starts with ${q(pat)}` : `> ${q(pat)}`}. ${smaller ? `The block is below row ${mid}: lo = ${lo}.` : `The block starts at row ${mid} or above: hi = ${hi}.`}`,
        lines: ['s.while', 's.mid', 's.if', smaller ? 's.lo1' : 's.hi1'],
        level: 2,
        vars: vars(s, c, { lo, hi, mid }),
        extra: {
          ...base,
          search: { pattern: pat, lo, hi, mid },
          hl: [{ p, len: Math.min(n - p, same + (cmp === 0 ? 0 : 1)), role: 'compare' }],
        },
      };
    }
    const first = lo;
    hi = n;
    yield {
      state: s,
      marks: [],
      say: `The block starts at row ${first}. Now find where it ends: the first row whose suffix does not start with P and is larger. lo = ${lo}, hi = ${n}.`,
      lines: ['s.hi'],
      level: 2,
      vars: vars(s, c, { lo, hi }),
      extra: { ...base, search: { pattern: pat, lo, hi } },
    };
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      const p = sa[mid]!;
      const { cmp, same } = comparePattern(t, p, pat);
      c.probes++;
      c.chars += charsCompared(same, m, p, n);
      const inside = cmp <= 0;
      const was = { lo, hi };
      if (inside) lo = mid + 1;
      else hi = mid;
      yield {
        state: s,
        marks: [mark(rowId(p), cmp === 0 ? 'found' : inside ? 'compare' : 'active')],
        say: `mid = ⌊(${was.lo} + ${was.hi}) / 2⌋ = ${mid}: ${q(suffix(t, p))} ${cmp === 0 ? `starts with ${q(pat)}, so the block goes on past it` : cmp < 0 ? `< ${q(pat)}` : `> ${q(pat)}, so the block ends before it`}. ${inside ? `lo = ${lo}.` : `hi = ${hi}.`}`,
        lines: ['s.while2', 's.mid2', 's.if2', inside ? 's.lo2' : 's.hi2'],
        level: 2,
        vars: vars(s, c, { lo, hi, mid }),
        extra: {
          ...base,
          search: { pattern: pat, lo, hi, mid },
          hl: [{ p, len: Math.min(n - p, same + (cmp === 0 ? 0 : 1)), role: 'compare' }],
        },
      };
    }
    const last = lo;
    const rows = sa.slice(first, last);
    const at = [...rows].sort((a, b) => a - b);
    yield {
      state: s,
      marks: rows.map((p) => mark(rowId(p), 'found')),
      say: at.length
        ? `${at.length === 1 ? `Row ${first} starts` : `Rows ${first} ${at.length === 2 ? 'and' : 'to'} ${last - 1} start`} with ${q(pat)}, so P occurs ${plural(at.length, 'time')}, at ${at.length === 1 ? 'position' : 'positions'} ${andList(at)}. That took ${plural(c.probes, 'probe')}, about 2 log₂ n, each comparing at most |P| characters.`
        : `No row starts with ${q(pat)}: it would go ${first === 0 ? 'above row 0' : first === n ? `below row ${n - 1}` : `between rows ${first - 1} and ${first}`}, but the block is empty. P does not occur in T. That took ${plural(c.probes, 'probe')}.`,
      lines: ['s.ret'],
      level: 1,
      vars: vars(s, c, { found: at.length ? at.join(' ') : 'none' }),
      extra: {
        ...base,
        search: { pattern: pat, lo: first, hi: last, found: [first, last] },
        hl: rows.map((p) => ({ p, len: m, role: 'found' as MarkRole })),
        spots: at.map((p) => ({ from: p, len: m, role: 'found' as MarkRole })),
      },
    };
    return s;
  },
};

/** The longest repeated substring: its row (the first with the largest LCP) and length. */
export function longestRepeat(s: S): { row: number; len: number } {
  const lcp = s.lcp!;
  let row = 0;
  for (let i = 1; i < lcp.length; i++) if (lcp[i]! > lcp[row]!) row = i;
  return { row, len: lcp[row]! };
}

const repeatOp: Op = {
  label: 'Longest repeat',
  arity: 0,
  *run(s0, _args, { settings }) {
    const c = zero();
    const s = yield* ready(s0, settings, c);
    const t = s.text;
    const sa = s.sa!;
    const lcp = s.lcp!;
    const base = { order: [...sa], lcp: [...lcp] };
    const n = t.length;
    let best = 0;
    for (let i = 1; i < n; i++) {
      const better = lcp[i]! > lcp[best]!;
      if (better) best = i;
      yield {
        state: s,
        marks: [mark(lcpId(i), better ? 'new' : 'compare')],
        say: better
          ? `LCP[${i}] = ${lcp[i]} is the largest so far: rows ${i - 1} and ${i} share ${q(t.slice(sa[i]!, sa[i]! + lcp[i]!))}.`
          : `LCP[${i}] = ${lcp[i]}, no larger than ${lcp[best]}.`,
        lines: ['r.for', 'r.if'],
        level: 3,
        vars: vars(s, c, { i, best: lcp[best]! }),
        extra: { ...base },
      };
    }
    const { row, len } = longestRepeat(s);
    if (len === 0) {
      yield {
        state: s,
        marks: [],
        say: `Every LCP is 0: no two suffixes start with the same character, so no substring repeats. (Every character of ${q(t)} is different.)`,
        lines: ['r.ret'],
        level: 1,
        vars: vars(s, c, { repeat: 'none' }),
        extra: { ...base },
      };
      return s;
    }
    const a = sa[row - 1]!;
    const b = sa[row]!;
    const sub = t.slice(b, b + len);
    yield {
      state: s,
      marks: [mark(lcpId(row), 'found'), mark(rowId(a), 'found'), mark(rowId(b), 'found')],
      say: `The largest LCP is ${len}, in row ${row}. A substring that occurs twice starts two suffixes, and those suffixes sit next to each other in sorted order, so the longest repeat is the longest common prefix of neighbours: ${q(sub)}, at positions ${Math.min(a, b)} and ${Math.max(a, b)}.`,
      lines: ['r.ret'],
      level: 1,
      vars: vars(s, c, { repeat: sub }),
      extra: {
        ...base,
        hl: [
          { p: a, len, role: 'found' },
          { p: b, len, role: 'found' },
        ],
        spots: [
          { from: a, len, role: 'found' },
          { from: b, len, role: 'found' },
        ],
      },
    };
    return s;
  },
};

const load: Op = {
  label: 'Load',
  arity: 1,
  *run(s, [arg]) {
    const t = parseText(arg, 'text');
    if (t instanceof Error) {
      yield {
        state: s,
        marks: [],
        say: `Nothing loaded. ${t.message} The text stays ${q(s.text)}.`,
        lines: [],
        level: 1,
        vars: { n: s.text.length },
      };
      return s;
    }
    const next: S = { text: t, sa: null, lcp: null };
    yield {
      state: next,
      marks: [],
      say: `T = ${q(t)}, ${plural(t.length, 'character')}, so ${plural(t.length, 'suffix', 'suffixes')}. Press Build to sort them.`,
      lines: [],
      level: 1,
      vars: { n: t.length },
    };
    return next;
  },
};

export const ops = { load, build: buildOp, search: searchOp, repeat: repeatOp };

// ---------------------------------------------------------------------------------------------
// Pseudocode

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: SuffixSettings): PseudoBlock[] {
  const sort =
    settings.method === 'naive'
      ? [
          L('n.sig', 0, 'SUFFIX-ARRAY(T)', 'Sort the suffixes of T:'),
          L('n.for', 1, 'for i = 1 to n - 1', 'Take each suffix in turn,'),
          L('n.while', 2, 'while T[SA[j]..] > T[SA[i]..]', 'and while the one above is larger,'),
          L('n.insert', 3, 'move it up one row', 'move it up past that one.'),
          L('d.done', 1, 'return SA', 'Now they are sorted.'),
        ]
      : [
          L('d.sig', 0, 'SUFFIX-ARRAY(T)', 'Sort the suffixes of T by doubling:'),
          L('d.rank', 1, 'rank[i] = rank of T[i]; k = 1', 'Rank each by its first character.'),
          L('d.while', 1, 'while some ranks are equal', 'While some suffixes still tie,'),
          L(
            'd.pair',
            2,
            'key[i] = (rank[i], rank[i + k] or -1)',
            'pair each rank with the rank k further on,',
          ),
          L('d.sort', 2, 'sort SA by key', 'sort by the pairs,'),
          L('d.rerank', 2, 'rank = position of key; k = 2k', 'rank again: now 2k characters sort.'),
          L('d.done', 1, 'return SA', 'Every rank differs: sorted.'),
        ];
  return [
    {
      op: 'build',
      lines: [
        ...sort,
        L('k.sig', 0, 'LCP-KASAI(T, SA)', 'Then the LCP array:'),
        L('k.rank', 1, 'rank[SA[r]] = r for each row r', 'Note which row each suffix is in.'),
        L('k.h', 1, 'h = 0', 'No characters known to match yet.'),
        L('k.for', 1, 'for i = 0 to n - 1', 'For each position i in T:'),
        L('k.if', 2, 'if rank[i] > 0', 'if its row has a row above it,'),
        L('k.j', 3, 'j = SA[rank[i] - 1]', 'let j start the suffix above;'),
        L('k.while', 3, 'while T[i + h] == T[j + h]: h++', 'count matching characters past h;'),
        L('k.set', 3, 'LCP[rank[i]] = h', 'that count is the LCP of the row;'),
        L('k.dec', 3, 'if h > 0: h = h - 1', 'the next position keeps all but one.'),
        L('k.done', 1, 'return LCP', 'Done.'),
      ],
    },
    {
      op: 'search',
      lines: [
        L('s.sig', 0, 'SEARCH(T, SA, P)', 'Find the rows that start with P:'),
        L('s.lo', 1, 'lo = 0; hi = n', 'First the top of the block.'),
        L('s.while', 1, 'while lo < hi', 'While the range is not empty,'),
        L('s.mid', 2, 'mid = ⌊(lo + hi) / 2⌋', 'look at the middle row:'),
        L('s.if', 2, 'if T[SA[mid]..] < P', 'if its suffix is smaller than P,'),
        L('s.lo1', 3, 'lo = mid + 1', 'the block is below it;'),
        L('s.hi1', 2, 'else hi = mid', 'otherwise it is here or above.'),
        L('s.hi', 1, 'first = lo; hi = n', 'Then the bottom of the block.'),
        L('s.while2', 1, 'while lo < hi', 'While the range is not empty,'),
        L('s.mid2', 2, 'mid = ⌊(lo + hi) / 2⌋', 'look at the middle row:'),
        L('s.if2', 2, 'if T[SA[mid]..] ≤ P or starts with P', 'if it is not past the block,'),
        L('s.lo2', 3, 'lo = mid + 1', 'the end is below it;'),
        L('s.hi2', 2, 'else hi = mid', 'otherwise it is here or above.'),
        L('s.ret', 1, 'return SA[first..lo - 1]', 'Those rows start where P occurs.'),
      ],
    },
    {
      op: 'repeat',
      lines: [
        L('r.sig', 0, 'LONGEST-REPEAT(T, SA, LCP)', 'Find the longest repeated substring:'),
        L('r.for', 1, 'for r = 1 to n - 1', 'Scan the LCP array'),
        L('r.if', 2, 'if LCP[r] > LCP[best]: best = r', 'for its largest value.'),
        L('r.ret', 1, 'return T[SA[best]..][0..LCP[best]]', 'Those neighbours share the repeat.'),
      ],
    },
  ];
}

export function initialSay(s: S): string {
  return `T = ${q(s.text)}: ${plural(s.text.length, 'suffix', 'suffixes')}, listed in the order they start. Press Build to sort them into a suffix array and compute the LCP array.`;
}

export const initialVars = (s: S) => ({ n: s.text.length });

export function describe(s: S): string {
  if (!s.sa || !s.lcp)
    return `Text ${s.text}, ${s.text.length} characters. The suffix array is not built yet.`;
  return `Text ${s.text}. Suffix array ${s.sa.join(' ')}. LCP array ${s.lcp.join(' ')}.`;
}
