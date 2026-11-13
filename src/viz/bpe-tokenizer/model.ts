/**
 * Byte-pair encoding (BPE), as a tokenizer: Sennrich, Haddow and Birch (2016), after Gage's
 * 1994 compression algorithm, in the form SLP3 teaches (Jurafsky and Martin, chapter 2).
 *
 * Training (the token learner): split every word of a training text into characters, with _
 * marking the end of each word. Then, k times: count every pair of neighbouring tokens, each
 * word counted as often as it occurs in the text; merge the most frequent pair into one new
 * token everywhere; remember the merge. The vocabulary is the starting symbols plus one token
 * per merge, and the merges are kept in the order learned.
 *
 * Encoding (the token segmenter): split a new word the same way, then replay the merges in the
 * order learned, each one everywhere in the word.
 *
 * Settings
 *   merges  k, the merges Train learns (One merge learns one more)
 *   eow     true: _ ends every word (SLP3, the default), so a token knows where a word ends;
 *           false: no marker (GPT-2 style, which instead keeps the space before a word)
 *   tie     'first': of pairs with equal counts, the one met first reading the text (what
 *           Sennrich et al.'s reference code does); 'alpha': the alphabetically first
 *   base    'chars': start from characters, so a character never seen in training has no
 *           token ([UNK]); 'bytes': start from UTF-8 bytes (GPT-2), so every word can be
 *           encoded; an accented letter is two bytes, written ‹C3›‹A9› until they merge
 *
 * Operations: load (a training text), train (k merges from the start), merge (one more),
 * encode (a word). Tie-breaks and the order of pairs are those of the code tabs.
 */
import type { Mark, OpSpec, PseudoBlock, Scalar, Step } from '../../engine/types';
import {
  countPairs,
  makeRows,
  mergeRow,
  tokenTotal,
  whereFrom,
  wordTotal,
  type PairCount,
  type Piece,
  type Row,
} from '../_tokenize/pieces';
import { CORPUS_TEXT, normalText, parseText, readWord } from '../_tokenize/text';

export const EOW = '_';
export const UNK = '[UNK]';
/** Rows of the pair table. */
export const PAIR_ROWS = 6;
/** Encodings kept for the list beside the merges. */
export const KEEP = 5;

export type Tie = 'first' | 'alpha';
export type Base = 'chars' | 'bytes';

export interface BpeSettings {
  [key: string]: Scalar;
  merges: number;
  eow: boolean;
  tie: Tie;
  base: Base;
}

export const defaults: BpeSettings = { merges: 20, eow: true, tie: 'first', base: 'chars' };

export interface Merge {
  a: string;
  b: string;
  ab: string;
  /** How often the pair occurred when it was merged. */
  count: number;
}

export interface Encoding {
  word: string;
  pieces: Piece[];
}

export interface BpeState {
  /** The training text, lower case. */
  text: string;
  rows: Row[];
  /** The starting symbols that occur in the text, sorted. */
  base: string[];
  merges: Merge[];
  /** Which picture: the training words, or the last word encoded. */
  mode: 'train' | 'encode';
  /** Words encoded since the last training, latest last. */
  encodings: Encoding[];
}

export interface PairRow {
  a: string;
  b: string;
  count: number;
}

/** What encode shows while it runs. */
export interface EncWork {
  word: string;
  pieces: Piece[];
  /** The merge being tried (an index into merges), or -1 before the first. */
  rule: number;
  /** Merges that changed the word so far. */
  applied: number[];
}

export interface BpeExtra {
  /** The pair table: the pairs counted so far, best first. */
  pairs?: PairRow[];
  /** During the first count: the words counted so far. */
  counted?: number;
  enc?: EncWork;
}

type S = BpeState;
type X = BpeExtra;
type Op = OpSpec<S, BpeSettings, X>;
type BStep = Step<S, X>;

// ---------------------------------------------------------------------------------------------
// Symbols

const hex = (b: number) => b.toString(16).toUpperCase().padStart(2, '0');

/** A word's UTF-8 bytes: an ASCII byte as its character, any other as <C3>. */
export function bytesOf(word: string): string[] {
  return [...new TextEncoder().encode(word)].map((b) =>
    b < 0x80 ? String.fromCharCode(b) : `<${hex(b)}>`,
  );
}

/** The starting symbols of a word under the settings. */
export function splitWord(word: string, s: Pick<BpeSettings, 'eow' | 'base'>): string[] {
  const syms = s.base === 'bytes' ? bytesOf(word) : [...word];
  return s.eow ? [...syms, EOW] : syms;
}

/** Every byte as a symbol, for the byte base's vocabulary. */
export const ALL_BYTES: readonly string[] = Array.from({ length: 256 }, (_, b) =>
  b < 0x80 ? String.fromCharCode(b) : `<${hex(b)}>`,
);

/**
 * A token as a learner reads it: bytes that make whole characters become those characters
 * (<C3><A9> is é), and a byte on its own is written ‹C3›.
 */
export function show(t: string): string {
  if (!t.includes('<')) return t;
  const parts = t.split(/(<[0-9A-F]{2}>)/).filter(Boolean);
  let out = '';
  let run: number[] = [];
  const flush = () => {
    let i = 0;
    while (i < run.length) {
      const b = run[i]!;
      const len = b >= 0xf0 ? 4 : b >= 0xe0 ? 3 : b >= 0xc0 ? 2 : 1;
      const seq = run.slice(i, i + len);
      const whole = len > 1 && seq.length === len && seq.slice(1).every((c) => c >= 0x80 && c < 0xc0);
      if (whole) {
        out += new TextDecoder().decode(new Uint8Array(seq));
        i += len;
      } else {
        out += `‹${hex(b)}›`;
        i++;
      }
    }
    run = [];
  };
  for (const p of parts) {
    if (/^<[0-9A-F]{2}>$/.test(p)) run.push(parseInt(p.slice(1, 3), 16));
    else {
      flush();
      out += p;
    }
  }
  flush();
  return out;
}

const spaced = (ps: readonly Piece[]) => ps.map((p) => show(p.t)).join(' ');

/**
 * The vocabulary: the starting symbols, then one token per merge (two merges can make the same
 * token, a + bc and ab + c, which then counts once).
 */
export function vocabSize(s: S, set: BpeSettings): number {
  const base = set.base === 'bytes' ? 256 + (set.eow ? 1 : 0) : s.base.length;
  return base + new Set(s.merges.map((m) => m.ab)).size;
}

/** Symbols the vocabulary starts with: those in the text, or with bytes all 256. */
export function knows(s: S, set: BpeSettings, sym: string): boolean {
  return set.base === 'bytes' || s.base.includes(sym);
}

// ---------------------------------------------------------------------------------------------
// State

export function loadState(text: string, set: BpeSettings): S | Error {
  const words = parseText(text);
  if (words instanceof Error) return words;
  const rows = makeRows(words, (w) => splitWord(w, set));
  const base = [...new Set(rows.flatMap((r) => r.pieces.map((p) => p.t)))].sort();
  return { text: normalText(text), rows, base, merges: [], mode: 'train', encodings: [] };
}

export function init(settings: BpeSettings): S {
  return loadState(CORPUS_TEXT, settings) as S;
}

/** Pairs best first: by count, then the tie-break. */
export function rankPairs(pairs: readonly PairCount[], tie: Tie): PairCount[] {
  return [...pairs].sort(
    (p, q) =>
      q.count - p.count ||
      (tie === 'alpha'
        ? p.a < q.a
          ? -1
          : p.a > q.a
            ? 1
            : p.b < q.b
              ? -1
              : p.b > q.b
                ? 1
                : 0
        : p.first - q.first),
  );
}

/** The merge the next round would make, or null when every word is one token. */
export function nextMerge(s: S, tie: Tie): PairCount | null {
  return rankPairs(countPairs(s.rows), tie)[0] ?? null;
}

const pairRows = (ranked: readonly PairCount[]): PairRow[] =>
  ranked.slice(0, PAIR_ROWS).map(({ a, b, count }) => ({ a, b, count }));

/** Learn merges until there are k or nothing is left to merge, without steps. */
export function learn(s: S, k: number, tie: Tie): S {
  let st = s;
  for (let i = 0; i < k; i++) {
    const best = nextMerge(st, tie);
    if (!best) break;
    st = applyMerge(st, best);
  }
  return st;
}

function applyMerge(s: S, p: PairCount): S {
  const ab = p.a + p.b;
  return {
    ...s,
    rows: s.rows.map((r) => mergeRow(r, p.a, p.b, ab)),
    merges: [...s.merges, { a: p.a, b: p.b, ab, count: p.count }],
    mode: 'train',
    encodings: [],
  };
}

/** Start over: every word back to its starting symbols, no merges. */
function reset(s: S, set: BpeSettings): S {
  return loadState(s.text, set) as S;
}

/** Replay the merges on a word's pieces, in the order learned (no steps). */
export function encodeWord(s: S, set: BpeSettings, word: string): Piece[] {
  let pieces = startPieces(s, set, word);
  for (const m of s.merges) pieces = mergeRow({ word, count: 1, pieces }, m.a, m.b, m.ab).pieces;
  return pieces;
}

function startPieces(s: S, set: BpeSettings, word: string): Piece[] {
  return splitWord(word, set).map((t, id) => ({ id, t: knows(s, set, t) ? t : UNK }));
}

/**
 * The split a person might make by eye: at each place, the longest token in the vocabulary.
 * BPE does not do this; encode mentions it when it differs.
 */
export function longestFirst(s: S, set: BpeSettings, word: string): string[] {
  const syms = startPieces(s, set, word).map((p) => p.t);
  const vocab = new Set([...syms.filter((t) => t !== UNK), ...s.merges.map((m) => m.ab)]);
  const out: string[] = [];
  let i = 0;
  while (i < syms.length) {
    let best = i + 1;
    let acc = '';
    for (let j = i; j < syms.length; j++) {
      acc += syms[j];
      if (vocab.has(acc)) best = j + 1;
    }
    out.push(syms.slice(i, best).join(''));
    i = best;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Steps

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });
export const chipId = (p: Piece) => `p-${p.id}`;
export const encId = (p: Piece) => `e-${p.id}`;

export function baseVars(s: S, set: BpeSettings): Record<string, Scalar> {
  return {
    words: s.rows.length,
    tokens: tokenTotal(s.rows),
    vocabulary: vocabSize(s, set),
    merges: s.merges.length,
  };
}

const err = (s: S, set: BpeSettings, message: string): BStep => ({
  state: s,
  marks: [],
  say: message,
  lines: [],
  level: 1,
  vars: baseVars(s, set),
});

function startSay(s: S, set: BpeSettings): string {
  const n = wordTotal(s.rows);
  const what =
    set.base === 'bytes'
      ? 'its UTF-8 bytes (a letter a to z is one byte; an accented letter is two)'
      : 'characters';
  const end = set.eow ? `, with ${EOW} marking the end of each word` : '';
  const base =
    set.base === 'bytes'
      ? `The vocabulary starts as all 256 bytes${set.eow ? ` and ${EOW}` : ''}.`
      : `The vocabulary starts as the ${s.base.length} symbols that occur: ${s.base.map(show).join(' ')}.`;
  return `${s.rows.length === 1 ? 'One word' : `${s.rows.length} different words`}${n > s.rows.length ? ` (${n} in all)` : ''}, each split into ${what}${end}. ${base}`;
}

/** One round of training: count the pairs, pick the best, merge it in every word. */
function* oneMerge(
  s: S,
  set: BpeSettings,
): Generator<BStep, S | null, void> {
  const vars = (st: S) => baseVars(st, set);
  const first = s.merges.length === 0;
  if (first) {
    for (let r = 0; r < s.rows.length; r++) {
      const row = s.rows[r]!;
      const ranked = rankPairs(countPairs(s.rows, r + 1), set.tie);
      const own = row.pieces.length - 1;
      yield {
        state: s,
        marks: [...row.pieces.map((p) => mark(chipId(p), 'active')), mark(`wc-${r}`, 'active')],
        say:
          own === 0
            ? `${row.word} is a single token: no pairs to count.`
            : `${row.word}${row.count > 1 ? ` occurs ${row.count} times, so each of its ${own} pairs counts ${row.count}` : ` occurs once: each of its ${own} pairs counts 1`}.`,
        lines: ['count'],
        level: 3,
        vars: vars(s),
        extra: { pairs: pairRows(ranked), counted: r + 1 },
      };
    }
  }
  const ranked = rankPairs(countPairs(s.rows), set.tie);
  const best = ranked[0];
  if (!best) {
    yield {
      state: s,
      marks: [],
      say: 'Every word is a single token now: there are no pairs left to merge.',
      lines: ['none'],
      level: 2,
      vars: vars(s),
    };
    return null;
  }
  const pairs = pairRows(ranked);
  const tied = ranked.filter((p) => p.count === best.count);
  const tieNote =
    tied.length > 1
      ? ` ${tied.length === 2 ? `${pairName(tied[1]!)} also occurs` : `${tied.length - 1} other pairs also occur`} ${best.count} times; ${
          set.tie === 'alpha'
            ? `${pairName(best)} comes first alphabetically, so it wins.`
            : `${pairName(best)} is met first reading the text, so it wins.`
        }`
      : '';
  const ab = best.a + best.b;
  const hits = best.rows.flatMap((r) => occurrences(s.rows[r]!, best.a, best.b));
  yield {
    state: s,
    marks: [mark('pr-0', 'found'), ...hits.map((p) => mark(chipId(p), 'active'))],
    say: `${first ? 'All counted. ' : 'Count the pairs again. '}The most frequent pair is ${pairName(best)}: ${best.count} time${best.count === 1 ? '' : 's'} (${whereFrom(s.rows, best.rows)}).${tieNote}`,
    lines: ['count', 'best'],
    level: 2,
    vars: vars(s),
    extra: { pairs },
  };

  let rows = s.rows;
  for (const r of best.rows) {
    const before = rows[r]!;
    const after = mergeRow(before, best.a, best.b, ab);
    rows = rows.map((x, i) => (i === r ? after : x));
    const fresh = after.pieces.filter((p) => p.t === ab && !before.pieces.includes(p));
    yield {
      state: { ...s, rows },
      marks: [mark('pr-0', 'found'), ...fresh.map((p) => mark(chipId(p), 'new'))],
      say: `${before.word}: ${spaced(before.pieces)} becomes ${spaced(after.pieces)}.`,
      lines: ['merge'],
      level: 3,
      vars: vars({ ...s, rows }),
      extra: { pairs },
    };
  }

  const next = applyMerge(s, best);
  const saved = tokenTotal(s.rows) - tokenTotal(next.rows);
  yield {
    state: next,
    marks: [mark(`vm-${next.merges.length - 1}`, 'new')],
    say: `Merge ${next.merges.length}: ${pairName(best)} becomes the token ${show(ab)}. The vocabulary grows to ${vocabSize(next, set)}, and the text shrinks by ${saved} token${saved === 1 ? '' : 's'}, to ${tokenTotal(next.rows)}.`,
    lines: ['add'],
    level: 2,
    vars: vars(next),
    extra: { pairs },
  };
  return next;
}

/** The pieces where a b starts, in a row (left to right, without overlaps). */
function occurrences(row: Row, a: string, b: string): Piece[] {
  const out: Piece[] = [];
  const p = row.pieces;
  for (let i = 0; i + 1 < p.length; i++)
    if (p[i]!.t === a && p[i + 1]!.t === b) {
      out.push(p[i]!, p[i + 1]!);
      i++;
    }
  return out;
}

export const pairName = (p: { a: string; b: string }) => `${show(p.a)} ${show(p.b)}`;

const loadOp: Op = {
  label: 'Load text',
  arity: 1,
  *run(s, args, { settings }) {
    const next = loadState(String(args[0] ?? ''), settings);
    if (next instanceof Error) {
      yield err(s, settings, next.message);
      return s;
    }
    yield {
      state: next,
      marks: next.rows.flatMap((r) => r.pieces.map((p) => mark(chipId(p), 'new'))),
      say: `${startSay(next, settings)} Press Train to learn ${settings.merges} merges.`,
      lines: ['split'],
      level: 1,
      vars: baseVars(next, settings),
    };
    return next;
  },
};

const trainOp: Op = {
  label: 'Train',
  arity: 0,
  *run(s, _args, { settings }) {
    let st = reset(s, settings);
    const start = tokenTotal(st.rows);
    yield {
      state: st,
      marks: [],
      say: `Train from the start. ${startSay(st, settings)}`,
      lines: ['split'],
      level: 2,
      vars: baseVars(st, settings),
    };
    for (let i = 0; i < settings.merges; i++) {
      const next = yield* oneMerge(st, settings);
      if (!next) break;
      st = next;
    }
    const k = st.merges.length;
    const early = k < settings.merges ? ` It stopped early: every word is a single token.` : '';
    yield {
      state: st,
      marks: st.merges.map((_, i) => mark(`vm-${i}`, 'found')),
      say: `Learned ${k} merge${k === 1 ? '' : 's'}.${early} The vocabulary has ${vocabSize(st, settings)} tokens, and the text takes ${tokenTotal(st.rows)} tokens instead of ${start}. Type a word and press Encode.`,
      lines: ['tret'],
      level: 1,
      vars: baseVars(st, settings),
    };
    return st;
  },
};

const mergeOp: Op = {
  label: 'One merge',
  arity: 0,
  *run(s, _args, { settings }) {
    const st = s.mode === 'train' ? s : { ...s, mode: 'train' as const };
    const next = yield* oneMerge(st, settings);
    const end = next ?? st;
    yield {
      state: end,
      marks: next ? [mark(`vm-${end.merges.length - 1}`, 'new')] : [],
      say: next
        ? `Learned merge ${end.merges.length}: ${pairName(end.merges.at(-1)!)} → ${show(end.merges.at(-1)!.ab)}. The text is ${tokenTotal(end.rows)} tokens.`
        : 'Nothing to merge: every word is already one token.',
      lines: next ? ['add'] : ['none'],
      level: 1,
      vars: baseVars(end, settings),
    };
    return end;
  },
};

const encodeOp: Op = {
  label: 'Encode',
  arity: 1,
  *run(s, args, { settings }) {
    const word = readWord(args[0]);
    if (word instanceof Error) {
      yield err(s, settings, word.message);
      return s;
    }
    let pieces = startPieces(s, settings, word);
    const unknown = [...new Set(splitWord(word, settings).filter((t) => !knows(s, settings, t)))];
    const applied: number[] = [];
    const work = (rule: number): X => ({ enc: { word, pieces, rule, applied: [...applied] } });
    const shown: S = { ...s, mode: 'encode' };
    const vars = (checked: number) => ({
      ...baseVars(s, settings),
      'merges tried': checked,
      'word tokens': pieces.length,
    });
    const unkNote = unknown.length
      ? ` ${unknown.map(show).join(', ')} never occurred in the training text, so ${unknown.length === 1 ? 'it has' : 'they have'} no token: ${UNK}.${settings.base === 'chars' ? ' With bytes as the base this cannot happen.' : ''}`
      : '';
    yield {
      state: shown,
      marks: pieces.map((p) => mark(encId(p), p.t === UNK ? 'error' : 'new')),
      say: `Split ${word} the way training split its words: ${spaced(pieces)}.${unkNote}${s.merges.length ? ` Now replay the ${s.merges.length} merges in the order they were learned.` : ' No merges are learned yet.'}`,
      lines: ['esplit'],
      level: 2,
      vars: vars(0),
      extra: work(-1),
    };
    for (let m = 0; m < s.merges.length; m++) {
      const rule = s.merges[m]!;
      const after = mergeRow({ word, count: 1, pieces }, rule.a, rule.b, rule.ab).pieces;
      const hit = after !== pieces;
      const before = pieces;
      pieces = after;
      if (hit) applied.push(m);
      yield {
        state: shown,
        marks: hit
          ? [
              mark(`mr-${m}-a`, 'found'),
              mark(`mr-${m}-b`, 'found'),
              ...after.filter((p) => !before.includes(p)).map((p) => mark(encId(p), 'new')),
            ]
          : [mark(`mr-${m}-a`, 'active'), mark(`mr-${m}-b`, 'active')],
        say: hit
          ? `Merge ${m + 1}, ${pairName(rule)}: it occurs, so join it. ${spaced(after)}.`
          : `Merge ${m + 1}, ${pairName(rule)}: not in ${spaced(before)}.`,
        lines: hit ? ['efor', 'erep'] : ['efor'],
        level: hit ? 2 : 3,
        vars: vars(m + 1),
        extra: work(m),
      };
    }
    const enc: Encoding = { word, pieces };
    const next: S = { ...s, mode: 'encode', encodings: [...s.encodings, enc].slice(-KEEP) };
    const longest = longestFirst(s, settings, word);
    const differs = longest.join(' ') !== pieces.map((p) => p.t).join(' ');
    const orderNote = differs
      ? ` Taking the longest token at each place instead would give ${longest.map(show).join(' ')}: BPE does not look for long tokens, it replays its merges in order.`
      : '';
    yield {
      state: next,
      marks: pieces.map((p) => mark(encId(p), p.t === UNK ? 'error' : 'found')),
      say: `${word} → ${spaced(pieces)}: ${pieces.length} token${pieces.length === 1 ? '' : 's'}${applied.length ? `, from ${applied.length} of the ${s.merges.length} merges` : ''}.${orderNote}`,
      lines: ['eret'],
      level: 1,
      vars: { ...baseVars(next, settings), 'merges tried': s.merges.length, 'word tokens': pieces.length },
      extra: { enc: { word, pieces, rule: s.merges.length, applied } },
    };
    return next;
  },
};

export const ops = { load: loadOp, train: trainOp, merge: mergeOp, encode: encodeOp };

// ---------------------------------------------------------------------------------------------
// Pseudocode

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(set: BpeSettings): PseudoBlock[] {
  const sym = set.base === 'bytes' ? 'the UTF-8 bytes' : 'the characters';
  const end = set.eow ? ` + [${EOW}]` : '';
  const split = L(
    'split',
    1,
    `for each word w: pieces[w] = ${sym} of w${end}`,
    `Split every word into ${set.base === 'bytes' ? 'bytes' : 'characters'}${set.eow ? `, with ${EOW} at its end` : ''}.`,
  );
  const tie = set.tie === 'alpha' ? 'alphabetically first' : 'first met';
  const round = (d: number) => [
    L(
      'count',
      d,
      'count[a b] = Σ count(w) over each a b next to each other in pieces[w]',
      'Count every pair of neighbours, each word as often as it occurs.',
    ),
    L(
      'best',
      d,
      `(a, b) = the pair with the largest count (ties: ${tie})`,
      `Pick the most frequent pair (on a tie, the ${tie}).`,
    ),
    L('none', d, 'if there is no pair: stop', 'If every word is one token, stop.'),
    L('merge', d, 'replace every a b with ab in every pieces[w]', 'Join it into one token everywhere.'),
    L('add', d, 'merges.append(a b → ab); vocabulary.add(ab)', 'Remember the merge, in order.'),
  ];
  return [
    {
      op: 'load',
      lines: [L('lsig', 0, 'LOAD(text)', 'Read a training text:'), split],
    },
    {
      op: 'train',
      lines: [
        L('tsig', 0, 'TRAIN(text, k)', 'Learn k merges from the training text:'),
        split,
        L('loop', 1, 'repeat k times', 'Then, k times:'),
        ...round(2),
        L('tret', 1, 'return merges', 'The merges, in the order learned, are the tokenizer.'),
      ],
    },
    {
      op: 'merge',
      lines: [L('msig', 0, 'MERGE-ONCE()', 'Learn one more merge:'), ...round(1)],
    },
    {
      op: 'encode',
      lines: [
        L('esig', 0, 'ENCODE(w)', 'Split a new word into tokens:'),
        L(
          'esplit',
          1,
          `pieces = ${sym} of w${end}${set.base === 'bytes' ? '' : `; any not in the vocabulary is ${UNK}`}`,
          `Split it the way training did${set.base === 'bytes' ? '' : `; a character never seen is ${UNK}`}.`,
        ),
        L('efor', 1, 'for each a b → ab in merges, in the order learned', 'Replay the merges in order:'),
        L('erep', 2, 'replace every a b in pieces with ab', 'join a and b wherever they are neighbours.'),
        L('eret', 1, 'return pieces', 'What is left are the tokens.'),
      ],
    },
  ];
}

// ---------------------------------------------------------------------------------------------
// Words for screen readers and narration

export function initialSay(s: S, set: BpeSettings): string {
  return `The toy corpus: ${startSay(s, set)} Press Train to learn ${set.merges} merges, or One merge to step through them.`;
}

export const initialVars = (s: S, set: BpeSettings) => baseVars(s, set);

export function describe(s: S): string {
  const merges = s.merges.length
    ? ` Merges in order: ${s.merges.map((m, i) => `${i + 1}. ${pairName(m)} → ${show(m.ab)}`).join('; ')}.`
    : ' No merges yet.';
  const words = ` Words: ${s.rows.map((r) => `${r.word} ×${r.count} as ${spaced(r.pieces)}`).join('; ')}.`;
  const enc = s.encodings.length
    ? ` Encoded: ${s.encodings.map((e) => `${e.word} → ${spaced(e.pieces)}`).join('; ')}.`
    : '';
  return `BPE.${merges}${s.mode === 'encode' ? enc : words}`;
}
