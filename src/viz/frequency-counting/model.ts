/**
 * Frequency counting: count how often each letter appears instead of comparing or sorting.
 * Two problems, each with a naive way and the pattern:
 *
 * - group(): put the words that are anagrams of each other (the same letters, the same number
 *   of times, in any order) together. Every word gets a key, and a hash map from key to words
 *   does the grouping. The naive key is the word's letters sorted ("night" → "ghint"), about
 *   k log k comparisons for k letters (counted here for a merge sort). The pattern's key is the
 *   word's 26 letter counts, its signature: k counts, then 26 reads to make the key. So the
 *   signature costs k + 26 against about k log k: on short words the sort is cheaper, and the
 *   page says so. Counting wins on long words, and only counts can be updated one letter at a
 *   time, which is what an anagram search with a sliding window needs.
 * - unique(w): the first letter of w that appears only once. The naive way counts each letter
 *   by rescanning the whole word, n comparisons per position, O(n²). The pattern counts every
 *   letter in one pass, then a second pass stops at the first letter whose count is 1: O(n).
 *
 * The signature is written with its nonzero counts only, in letter order: "g1h1i1n1t1". The key
 * itself is all 26 numbers.
 *
 * Work, in the units of src/viz/_patterns/kit.ts: a comparison is two letters compared; a count
 * is one read or write of a letter's count; a lookup is one hash map get-or-insert.
 */
import type {
  Mark,
  MarkRole,
  OpSpec,
  PseudoBlock,
  PseudoLine,
  Scalar,
  Step,
  Value,
} from '../../engine/types';
import { approachOf, Work, workVars, type Approach, type Totals } from '../_patterns/kit';
import { ALPHABET, andList, plural, readWords } from '../_arr1/kit';

export { plural };

export const MAX_WORDS = 8;
/** Most letters in a word to group, so every key stays readable. */
export const MAX_LETTERS = 10;
/** Most letters in the word whose first unique letter is wanted. */
export const MAX_UNIQUE = 12;

/** The words the page starts with: groups of 2, 3, 2 and 1. */
export const START = ['night', 'tops', 'thing', 'below', 'spot', 'elbow', 'pots', 'chin'];

export interface FSettings {
  [key: string]: Scalar;
  approach: Approach;
}

export const defaults: FSettings = { approach: 'pattern' };

export interface FState {
  words: string[];
}

export interface GroupExtra {
  kind: 'group';
  /** The key of each word, once made: its sorted letters, or its signature. */
  keys: (string | null)[];
  /** Which group each word went into (0-based, in the order groups were made), once placed. */
  group: (number | null)[];
  /** The map: each key, in the order it first appeared, with its words by index. */
  map: { key: string; words: number[] }[];
  /** The word being looked at. */
  cur?: number;
  /** The pattern: the current word's letter counts, a to z, and how many letters are counted. */
  counts?: number[];
  counted?: number;
  /** Fixed for the whole operation: every word's key, so the drawing keeps its frame. */
  allKeys: string[];
}

export interface UniqueExtra {
  kind: 'unique';
  word: string;
  /** The pattern: the letter counts, a to z, and how many letters pass 1 has counted. */
  counts?: number[];
  counted?: number;
  /** Per position, its letter's count once known: by rescanning, or read in pass 2. */
  seen: (number | null)[];
  /** The position being checked, and (naive) the position it is compared with. */
  i?: number;
  j?: number;
  /** The answer once known: an index, or −1. */
  answer?: number;
}

export type FExtra = GroupExtra | UniqueExtra;
export type FStep = Step<FState, FExtra>;
type Op = OpSpec<FState, FSettings, FExtra>;

export const init = (): FState => ({ words: [...START] });

const mark = (id: string, role: MarkRole): Mark => ({ id, role });

// ----- Keys -----

const index = (ch: string) => ch.charCodeAt(0) - 97;

/** The 26 letter counts of a word. */
export function letterCounts(w: string): number[] {
  const c = Array(26).fill(0);
  for (const ch of w) c[index(ch)]++;
  return c;
}

/** "g1h1i1n1t1": the nonzero counts in letter order. */
export function signature(w: string): string {
  return letterCounts(w)
    .map((n, i) => (n ? `${ALPHABET[i]}${n}` : ''))
    .join('');
}

/** The letters of w sorted by a merge sort, and how many letter comparisons it made. */
export function sortLetters(w: string): { sorted: string; comparisons: number } {
  let comparisons = 0;
  const sort = (xs: string[]): string[] => {
    if (xs.length <= 1) return xs;
    const mid = xs.length >> 1;
    const a = sort(xs.slice(0, mid));
    const b = sort(xs.slice(mid));
    const out: string[] = [];
    let i = 0;
    let j = 0;
    while (i < a.length && j < b.length) {
      comparisons++;
      out.push(a[i]! <= b[j]! ? a[i++]! : b[j++]!);
    }
    return [...out, ...a.slice(i), ...b.slice(j)];
  };
  return { sorted: sort([...w]).join(''), comparisons };
}

/** The key an approach gives a word. */
export const keyOf = (w: string, approach: Approach): string =>
  approach === 'naive' ? sortLetters(w).sorted : signature(w);

/** The groups, as word indices, in the order the map makes them. */
export function groupsOf(words: readonly string[]): number[][] {
  const map = new Map<string, number[]>();
  words.forEach((w, t) => {
    const k = signature(w);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(t);
  });
  return [...map.values()];
}

/** The index of the first letter of w that appears once, or −1. */
export function firstUnique(w: string): number {
  const c = letterCounts(w);
  for (let i = 0; i < w.length; i++) if (c[index(w[i]!)] === 1) return i;
  return -1;
}

/** What grouping costs each approach: Σ comparisons + n lookups, against Σ (k + 26) + n. */
export function groupTotals(words: readonly string[]): Totals {
  let naive = 0;
  let pattern = 0;
  for (const w of words) {
    naive += sortLetters(w).comparisons + 1;
    pattern += w.length + 26 + 1;
  }
  return { naive, pattern };
}

/** What the first unique letter costs: n comparisons per position checked, against n + m counts. */
export function uniqueTotals(w: string): Totals {
  const n = w.length;
  const at = firstUnique(w);
  const m = at < 0 ? n : at + 1;
  return { naive: n * m, pattern: n + m };
}

// ----- Input -----

const WORDS = { max: MAX_WORDS, letters: MAX_LETTERS };

export const readList = (arg: Value | undefined): string[] | string => readWords(arg, WORDS);

/** The word for unique(), or why it cannot be read. */
export function readWord(arg: Value | undefined): string | string[] {
  const ws = readWords(arg, { max: 99, letters: MAX_UNIQUE });
  if (typeof ws === 'string') return [ws];
  if (ws.length !== 1) return ['Type one word, such as level, and press First unique letter.'];
  return ws[0]!;
}

/** For the input box: one word (for First unique letter or Load), or a list of words for Load. */
export function parseInput(token: string): Value | Error {
  const tokens = token.split(/[\s,;]+/).filter(Boolean);
  if (tokens.length === 1) {
    const w = readWord(tokens[0]);
    return typeof w === 'string' ? w : new Error(w[0]);
  }
  const ws = readList(tokens.join(' '));
  return typeof ws === 'string' ? new Error(ws) : ws.join(' ');
}

// ----- Steps -----

function refuse(s: FState, why: string): FStep {
  return {
    state: s,
    marks: [],
    say: `Nothing to do. ${why}`,
    lines: [],
    level: 1,
    vars: { words: s.words.length },
  };
}

const load: Op = {
  label: 'Load',
  arity: 1,
  *run(s, [arg]) {
    const ws = readList(arg);
    if (typeof ws === 'string') {
      yield refuse(s, `${ws} The words stay as they were.`);
      return s;
    }
    const next = { words: ws };
    yield {
      state: next,
      marks: [],
      say: `Loaded ${plural(ws.length, 'word')}: ${ws.join(', ')}. Press Group anagrams.`,
      lines: [],
      level: 1,
      vars: { words: ws.length },
    };
    return next;
  },
};

/** "night", "spot" and "pots". */
const quoted = (xs: string[]) => andList(xs.map((x) => `“${x}”`));

function* group(s: FState, settings: FSettings): Generator<FStep, FState, void> {
  const approach = approachOf(settings);
  const naive = approach === 'naive';
  const words = s.words;
  const tot = groupTotals(words);
  const work = new Work(['comparisons', 'counts', 'lookups']);
  const allKeys = words.map((w) => keyOf(w, approach));
  const keys: (string | null)[] = words.map(() => null);
  const groupOf: (number | null)[] = words.map(() => null);
  const map: { key: string; words: number[] }[] = [];
  let counts: number[] | undefined;
  let counted = 0;
  const extra = (cur?: number): GroupExtra => ({
    kind: 'group',
    keys: [...keys],
    group: [...groupOf],
    map: map.map((m) => ({ key: m.key, words: [...m.words] })),
    ...(cur === undefined ? {} : { cur }),
    ...(counts ? { counts: [...counts], counted } : {}),
    allKeys,
  });
  const vars = (t: number): Record<string, Scalar> => ({
    word: t + 1,
    groups: map.length,
    ...workVars(work, tot),
  });

  yield {
    state: s,
    marks: [],
    say: naive
      ? `Group ${plural(words.length, 'word')} by anagram. Give each word a key, its letters in sorted order, so anagrams get the same key; then a hash map from key to words does the grouping.`
      : `Group ${plural(words.length, 'word')} by anagram. Give each word a key, its signature: how many times each of the 26 letters appears. Anagrams have the same signature, and a hash map from signature to words does the grouping.`,
    lines: ['sig', 'init'],
    level: 2,
    vars: vars(0),
    extra: extra(),
  };

  for (let t = 0; t < words.length; t++) {
    const w = words[t]!;
    if (naive) {
      const { sorted, comparisons } = sortLetters(w);
      work.add('comparisons', comparisons);
      keys[t] = sorted;
      yield {
        state: s,
        marks: [mark(`w-${t}`, 'active'), mark('key', 'new')],
        say: `“${w}”: sort its letters, ${[...sorted].join(' ')}, in ${plural(comparisons, 'comparison')}. Its key is “${sorted}”.`,
        lines: ['loop', 'sort'],
        level: 2,
        vars: vars(t),
        extra: extra(t),
      };
    } else {
      counts = Array(26).fill(0);
      counted = 0;
      for (const ch of w) {
        counts[index(ch)]! += 1;
        counted++;
        work.add('counts');
        yield {
          state: s,
          marks: [mark(`w-${t}`, 'active'), mark(`c-${ch}`, 'new')],
          say: `“${w}”, letter ${counted}: count[${ch}] = ${counts[index(ch)]}.`,
          lines: ['loop', 'zero', 'count'],
          level: 3,
          vars: vars(t),
          extra: extra(t),
        };
      }
      work.add('counts', 26);
      keys[t] = allKeys[t]!;
      const repeats = counts.flatMap((n, i) => (n > 1 ? [`${ALPHABET[i]} ${n} times`] : []));
      yield {
        state: s,
        marks: [mark(`w-${t}`, 'active'), mark('key', 'new')],
        say: `“${w}”: ${plural(w.length, 'letter')} counted${
          repeats.length ? `, ${andList(repeats)}` : ', each once'
        }. Its key is all 26 counts, read in order (${plural(26, 'read')}): ${keys[t]}, the zeros left out of the picture.`,
        lines: ['loop', 'zero', 'count', 'key'],
        level: 2,
        vars: vars(t),
        extra: extra(t),
      };
    }

    const key = keys[t]!;
    work.add('lookups');
    let g = map.findIndex((m) => m.key === key);
    const fresh = g < 0;
    if (fresh) {
      g = map.length;
      map.push({ key, words: [] });
    }
    map[g]!.words.push(t);
    groupOf[t] = g;
    const mates = map[g]!.words.slice(0, -1).map((i) => words[i]!);
    yield {
      state: s,
      marks: [mark(`w-${t}`, 'new'), mark(`k-${g}`, fresh ? 'new' : 'found')],
      say: fresh
        ? `Look up “${key}” in the map: not there, so “${w}” starts group ${g + 1}.`
        : `Look up “${key}” in the map: found, so “${w}” joins ${quoted(mates)} in group ${g + 1}.`,
      lines: ['add'],
      level: 2,
      vars: vars(t),
      extra: extra(),
    };
  }

  counts = undefined;
  const sizes = map.map((m) => m.words.length);
  yield {
    state: s,
    marks: [],
    say: `Done: ${plural(map.length, 'group')}: ${map
      .map((m) => m.words.map((i) => words[i]).join(' '))
      .join('; ')}. That took ${work.tally()}; ${
      naive
        ? `the 26 counts take ${tot.pattern - words.length} counts and ${words.length} lookups.`
        : `sorting the letters takes ${tot.naive - words.length} comparisons and ${words.length} lookups.`
    }${tot.pattern > tot.naive ? ' On words this short, sorting is cheaper.' : ''}`,
    lines: ['ret'],
    level: 1,
    vars: { ...vars(words.length - 1), largest: Math.max(...sizes) },
    extra: extra(),
  };
  return s;
}

function* unique(s: FState, w: string, settings: FSettings): Generator<FStep, FState, void> {
  const naive = approachOf(settings) === 'naive';
  const n = w.length;
  const tot = uniqueTotals(w);
  const work = new Work(['comparisons', 'counts', 'lookups']);
  const seen: (number | null)[] = Array(n).fill(null);
  let counts: number[] | undefined = naive ? undefined : Array(26).fill(0);
  let counted = 0;
  let answer: number | undefined;
  const extra = (i?: number, j?: number): UniqueExtra => ({
    kind: 'unique',
    word: w,
    ...(counts ? { counts: [...counts], counted } : {}),
    seen: [...seen],
    ...(i === undefined ? {} : { i }),
    ...(j === undefined ? {} : { j }),
    ...(answer === undefined ? {} : { answer }),
  });
  const vars = (i: number): Record<string, Scalar> => ({
    n,
    i,
    ...workVars(work, tot),
  });

  yield {
    state: s,
    marks: [],
    say: naive
      ? `Find the first letter of “${w}” that appears only once. For each position, count its letter by rescanning the whole word, and stop at the first count of 1.`
      : `Find the first letter of “${w}” that appears only once. Count every letter in one pass, then go through the word again and stop at the first letter whose count is 1.`,
    lines: ['sig', ...(naive ? [] : ['init'])],
    level: 2,
    vars: vars(0),
    extra: extra(),
  };

  if (naive) {
    for (let i = 0; i < n && answer === undefined; i++) {
      let c = 0;
      for (let j = 0; j < n; j++) {
        work.add('comparisons');
        const same = w[j] === w[i];
        if (same) c++;
        const last = j === n - 1;
        if (last) {
          seen[i] = c;
          if (c === 1) answer = i;
        }
        yield {
          state: s,
          marks: [
            mark(`s-${i}`, 'active'),
            mark(`s-${j}`, same ? 'found' : 'compare'),
            ...(last ? [mark(`n-${i}`, c === 1 ? 'found' : 'new')] : []),
          ],
          say: `${j === 0 ? `How often does s[${i}] = “${w[i]}” appear? Rescan from the start: ` : ''}s[${j}] = “${w[j]}”${same ? `, a match: count ${c}` : ', no match'}.${
            last
              ? c === 1
                ? ` “${w[i]}” appears once: the first unique letter is at index ${i}.`
                : ` “${w[i]}” appears ${c} times: not unique.`
              : ''
          }`,
          lines: [
            ...(j === 0 ? ['outer', 'reset'] : []),
            'inner',
            ...(same ? ['match'] : []),
            ...(last ? ['once'] : []),
          ],
          level: 2,
          vars: { ...vars(i), j, count: c },
          extra: extra(i, j),
        };
      }
    }
  } else {
    for (let j = 0; j < n; j++) {
      const ch = w[j]!;
      counts![index(ch)]! += 1;
      counted++;
      work.add('counts');
      yield {
        state: s,
        marks: [mark(`s-${j}`, 'active'), mark(`c-${ch}`, 'new')],
        say: `Pass 1, s[${j}] = “${ch}”: count[${ch}] = ${counts![index(ch)]}.`,
        lines: ['pass1', 'count'],
        level: 2,
        vars: vars(j),
        extra: extra(),
      };
    }
    for (let i = 0; i < n; i++) {
      const ch = w[i]!;
      const c = counts![index(ch)]!;
      work.add('counts');
      seen[i] = c;
      if (c === 1) answer = i;
      yield {
        state: s,
        marks: [mark(`s-${i}`, 'active'), mark(`c-${ch}`, c === 1 ? 'found' : 'active'), mark(`n-${i}`, c === 1 ? 'found' : 'new')],
        say: `${i === 0 ? 'Pass 2. ' : ''}s[${i}] = “${ch}”: count[${ch}] = ${c}${
          c === 1 ? `. It appears once: the first unique letter is at index ${i}.` : ', not unique.'
        }`,
        lines: ['pass2', 'check', ...(c === 1 ? ['found'] : [])],
        level: 2,
        vars: vars(i),
        extra: extra(i),
      };
      if (c === 1) break;
    }
  }

  if (answer === undefined) answer = -1;
  const at = answer;
  counts = counts && [...counts];
  yield {
    state: s,
    marks: at >= 0 ? [mark(`s-${at}`, 'found')] : [],
    say: `Done: ${
      at >= 0
        ? `the first unique letter of “${w}” is “${w[at]}”, at index ${at}.`
        : `every letter of “${w}” appears more than once, so the answer is −1.`
    } That took ${work.tally()}; ${
      naive
        ? `counting first takes ${plural(tot.pattern, 'count')}.`
        : `rescanning for each position takes ${plural(tot.naive, 'comparison')}.`
    }${tot.pattern > tot.naive ? ' Here the first letter is unique, so rescanning stops at once and wins.' : ''}`,
    lines: ['ret'],
    level: 1,
    vars: { ...vars(at >= 0 ? at : n - 1), answer: at },
    extra: extra(),
  };
  return s;
}

const groupOp: Op = {
  label: 'Group anagrams',
  arity: 0,
  *run(s, _args, { settings }) {
    if (s.words.length === 0) {
      yield refuse(s, 'There are no words. Load some first.');
      return s;
    }
    return yield* group(s, settings);
  },
};

const uniqueOp: Op = {
  label: 'First unique letter',
  arity: 1,
  *run(s, [arg], { settings }) {
    const w = readWord(arg);
    if (typeof w !== 'string') {
      yield refuse(s, w[0]!);
      return s;
    }
    return yield* unique(s, w, settings);
  },
};

export const ops: Record<string, Op> = { group: groupOp, unique: uniqueOp, load };

// ----- Pseudocode -----

const L = (id: string, indent: number, text: string, plain: string): PseudoLine => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: FSettings): PseudoBlock[] {
  if (approachOf(settings) === 'naive') {
    return [
      {
        op: 'group',
        lines: [
          L(
            'sig',
            0,
            'groupAnagrams(words)   // key: sorted letters',
            'To group the words that are anagrams of each other:',
          ),
          L('init', 1, 'groups = empty map', 'Start with an empty map from key to words.'),
          L('loop', 1, 'for each word w', 'For each word,'),
          L('sort', 2, 'key = sorted letters of w', 'sort its letters to make its key,'),
          L('add', 2, 'append w to groups[key]', 'and put it in that key’s group.'),
          L('ret', 1, 'return the groups', 'Hand back the groups.'),
        ],
      },
      {
        op: 'unique',
        lines: [
          L(
            'sig',
            0,
            'firstUnique(s)   // rescan for each letter',
            'To find the first letter of s that appears once, rescanning:',
          ),
          L('outer', 1, 'for i = 0 to n − 1', 'For each position i,'),
          L('reset', 2, 'c = 0', 'start a count at 0,'),
          L('inner', 2, 'for j = 0 to n − 1', 'go through the whole word'),
          L('match', 3, 'if s[j] == s[i]: c = c + 1', 'and count the letters equal to s[i];'),
          L('once', 2, 'if c == 1: return i', 'if it appeared once, that is the answer.'),
          L('ret', 1, 'return −1', 'No letter appears once.'),
        ],
      },
    ];
  }
  return [
    {
      op: 'group',
      lines: [
        L(
          'sig',
          0,
          'groupAnagrams(words)   // key: 26 letter counts',
          'To group the words that are anagrams of each other:',
        ),
        L('init', 1, 'groups = empty map', 'Start with an empty map from key to words.'),
        L('loop', 1, 'for each word w', 'For each word,'),
        L('zero', 2, 'count = 26 zeros', 'start 26 counts at 0, one per letter,'),
        L('count', 2, 'for each letter ch of w: count[ch] += 1', 'count each of its letters,'),
        L('key', 2, 'key = count (all 26 numbers)', 'and use the 26 counts as its key;'),
        L('add', 2, 'append w to groups[key]', 'put it in that key’s group.'),
        L('ret', 1, 'return the groups', 'Hand back the groups.'),
      ],
    },
    {
      op: 'unique',
      lines: [
        L('sig', 0, 'firstUnique(s)', 'To find the first letter of s that appears once:'),
        L('init', 1, 'count = 26 zeros', 'Start 26 counts at 0.'),
        L('pass1', 1, 'for each letter ch of s', 'Go through s once'),
        L('count', 2, 'count[ch] = count[ch] + 1', 'and count every letter.'),
        L('pass2', 1, 'for i = 0 to n − 1', 'Then go through s again:'),
        L('check', 2, 'if count[s[i]] == 1', 'if this letter appears only once,'),
        L('found', 3, 'return i', 'it is the answer.'),
        L('ret', 1, 'return −1', 'No letter appears once.'),
      ],
    },
  ];
}

// ----- Start -----

export function describe(s: FState): string {
  return `${plural(s.words.length, 'word')}: ${s.words.join(', ')}.`;
}

export function initialSay(s: FState): string {
  return `${plural(s.words.length, 'word')}, some of them anagrams of each other. Press Group anagrams. Or type one word, such as level, and press First unique letter.`;
}

export const initialVars = (s: FState) => ({ words: s.words.length });
