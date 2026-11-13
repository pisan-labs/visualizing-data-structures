/**
 * WordPiece, the tokenizer of BERT (Schuster and Nakajima 2012; Wu et al. 2016; Devlin et al.
 * 2019).
 *
 * Encoding: greedy longest match first, as in BERT's tokenizer. From the start of the word,
 * take the longest piece in the vocabulary; continue from where it ends with pieces marked ##
 * (pieces inside a word); repeat. If at some point no piece matches, the whole word becomes
 * [UNK], and so does a word longer than the maximum length. The longest match is found by
 * walking a trie of the vocabulary (one trie for pieces that start a word, one for ## pieces),
 * remembering the last node that ends a piece.
 *
 * Training (as Hugging Face's tutorial describes it): split every word into its first letter
 * and ## letters, then k times score every pair of neighbours by
 *
 *   score(a, b) = count(a b) / (count(a) · count(b))
 *
 * (counts weighted by how often each word occurs), merge the best pair into one piece (ab, or
 * a + the letters of ##b), and add it to the vocabulary. BPE takes the most frequent pair;
 * WordPiece prefers pairs whose halves seldom occur apart. Only the vocabulary is kept: encoding
 * never replays the merges.
 *
 * Settings
 *   merges  k, the merges Train learns (One merge learns one more)
 *   maxLen  a longer word becomes [UNK] without a look (BERT uses 100 characters)
 *   trie    true: walk the trie, one pass per piece; false: BERT's loop, which looks up the
 *           rest of the word, then one letter shorter, and so on
 *
 * Operations (named as on the BPE page, so compare mode can run both): load, train, merge,
 * encode. Ties keep the pair met first, as the code tabs do.
 */
import type { Mark, OpSpec, PseudoBlock, Scalar, Step } from '../../engine/types';
import {
  countPairs,
  makeRows,
  mergeRow,
  pieceCounts,
  tokenTotal,
  whereFrom,
  wordTotal,
  type PairCount,
  type Piece,
  type Row,
} from '../_tokenize/pieces';
import { CORPUS_TEXT, MAX_LEN, normalText, parseText, readWord } from '../_tokenize/text';

export const UNK = '[UNK]';
export const CONT = '##';
/** Pairs ranked by score in the table; one more row may show BPE's pick. */
export const PAIR_ROWS = 5;
export const KEEP = 4;

export interface WpSettings {
  [key: string]: Scalar;
  merges: number;
  maxLen: number;
  trie: boolean;
}

export const defaults: WpSettings = { merges: 20, maxLen: MAX_LEN, trie: true };

export interface WpMerge {
  a: string;
  b: string;
  ab: string;
  count: number;
  /** Counts of the two halves when the pair was merged. */
  ca: number;
  cb: number;
}

export interface Encoding {
  word: string;
  pieces: string[];
}

export interface WpState {
  text: string;
  rows: Row[];
  /** The starting pieces: first letters, then ## letters, each sorted. */
  alphabet: string[];
  merges: WpMerge[];
  mode: 'train' | 'encode';
  encodings: Encoding[];
}

/** A pair with what its score is made of. */
export interface ScoredPair extends PairCount {
  ca: number;
  cb: number;
  score: number;
}

export interface PairRow {
  a: string;
  b: string;
  count: number;
  ca: number;
  cb: number;
  score: number;
  /** BPE's pick, shown under the ranking when it is not in it. */
  bpe?: boolean;
}

/** What encode shows while it runs. */
export interface WpEnc {
  word: string;
  /** Where the piece being looked for starts. */
  start: number;
  /** Letters looked at so far in this piece: start..at. */
  at: number;
  /** End of the longest piece found so far, or -1. */
  last: number;
  pieces: string[];
  /** Trie nodes on the walk, root first. */
  path: number[];
  /** Loop: the substring being looked up. */
  candidate?: string;
  /** Loop: was it in the vocabulary. */
  hit?: boolean;
  unk?: boolean;
  done?: boolean;
}

export interface WpExtra {
  pairs?: PairRow[];
  enc?: WpEnc;
}

type S = WpState;
type X = WpExtra;
type Op = OpSpec<S, WpSettings, X>;
type WStep = Step<S, X>;

// ---------------------------------------------------------------------------------------------
// Pieces and scores

/** A word's first letter, then each other letter as a ## piece. */
export const splitWord = (word: string): string[] =>
  [...word].map((c, i) => (i === 0 ? c : CONT + c));

/** The piece a merge makes: ##b loses its ## when it joins a. */
export const join = (a: string, b: string): string =>
  a + (b.startsWith(CONT) ? b.slice(CONT.length) : b);

/** Every pair with its score, in the order first met. */
export function scorePairs(rows: readonly Row[], upTo = rows.length): ScoredPair[] {
  const counts = pieceCounts(rows.slice(0, upTo));
  return countPairs(rows, upTo).map((p) => {
    const ca = counts.get(p.a)!;
    const cb = counts.get(p.b)!;
    return { ...p, ca, cb, score: p.count / (ca * cb) };
  });
}

/** Best first: by score, then the pair met first. */
export const rankPairs = (pairs: readonly ScoredPair[]): ScoredPair[] =>
  [...pairs].sort((p, q) => q.score - p.score || p.first - q.first);

/** The pair BPE would take: the most frequent, the first met on a tie. */
export const bpePick = (pairs: readonly ScoredPair[]): ScoredPair | undefined =>
  [...pairs].sort((p, q) => q.count - p.count || p.first - q.first)[0];

function pairRows(pairs: readonly ScoredPair[]): PairRow[] {
  const ranked = rankPairs(pairs);
  const rows: PairRow[] = ranked
    .slice(0, PAIR_ROWS)
    .map(({ a, b, count, ca, cb, score }) => ({ a, b, count, ca, cb, score }));
  const bpe = bpePick(pairs);
  if (bpe && !ranked.slice(0, PAIR_ROWS).includes(bpe))
    rows.push({ a: bpe.a, b: bpe.b, count: bpe.count, ca: bpe.ca, cb: bpe.cb, score: bpe.score, bpe: true });
  return rows;
}

/** A score as the table writes it: three decimals, no leading zero (.027). */
export const score3 = (x: number): string => {
  const k = Math.round(x * 1000);
  return k >= 1000 ? (k / 1000).toFixed(3) : `.${String(k).padStart(3, '0')}`;
};

export const pairName = (p: { a: string; b: string }) => `${p.a} ${p.b}`;

const fraction = (p: { count: number; ca: number; cb: number; score: number }) =>
  `${p.count} / (${p.ca} × ${p.cb}) = ${score3(p.score)}`;

// ---------------------------------------------------------------------------------------------
// State

export function loadState(text: string): S | Error {
  const words = parseText(text);
  if (words instanceof Error) return words;
  const rows = makeRows(words, splitWord);
  const all = [...new Set(rows.flatMap((r) => r.pieces.map((p) => p.t)))];
  const alphabet = [
    ...all.filter((t) => !t.startsWith(CONT)).sort(),
    ...all.filter((t) => t.startsWith(CONT)).sort(),
  ];
  return { text: normalText(text), rows, alphabet, merges: [], mode: 'train', encodings: [] };
}

export function init(): S {
  return loadState(CORPUS_TEXT) as S;
}

export function nextMerge(s: S): ScoredPair | null {
  return rankPairs(scorePairs(s.rows))[0] ?? null;
}

function applyMerge(s: S, p: ScoredPair): S {
  const ab = join(p.a, p.b);
  return {
    ...s,
    rows: s.rows.map((r) => mergeRow(r, p.a, p.b, ab)),
    merges: [...s.merges, { a: p.a, b: p.b, ab, count: p.count, ca: p.ca, cb: p.cb }],
    mode: 'train',
    encodings: [],
  };
}

export function learn(s: S, k: number): S {
  let st = s;
  for (let i = 0; i < k; i++) {
    const best = nextMerge(st);
    if (!best) break;
    st = applyMerge(st, best);
  }
  return st;
}

/** Every piece in the vocabulary, starting pieces first, then those training added. */
export function vocabulary(s: S): string[] {
  return [...new Set([...s.alphabet, ...s.merges.map((m) => m.ab)])];
}

// ---------------------------------------------------------------------------------------------
// The tries

export interface TrieNode {
  id: number;
  /** The letter on the edge into this node ('' for a root). */
  ch: string;
  parent: number | null;
  kids: number[];
  /** The piece this node spells, when it is in the vocabulary. */
  piece: string | null;
}

export interface Tries {
  nodes: TrieNode[];
  /** Root of the pieces that start a word. */
  start: number;
  /** Root of the ## pieces. */
  inner: number;
}

/** The two tries of a vocabulary. Children are in alphabetical order; ids follow the build. */
export function buildTries(vocab: readonly string[]): Tries {
  const nodes: TrieNode[] = [];
  const make = (ch: string, parent: number | null): number => {
    nodes.push({ id: nodes.length, ch, parent, kids: [], piece: null });
    if (parent !== null) nodes[parent]!.kids.push(nodes.length - 1);
    return nodes.length - 1;
  };
  const start = make('', null);
  const inner = make('', null);
  for (const piece of [...vocab].sort()) {
    const isInner = piece.startsWith(CONT);
    let u = isInner ? inner : start;
    for (const ch of isInner ? [...piece.slice(CONT.length)] : [...piece]) {
      const next = nodes[u]!.kids.find((k) => nodes[k]!.ch === ch);
      u = next ?? make(ch, u);
    }
    nodes[u]!.piece = piece;
  }
  for (const n of nodes) n.kids.sort((a, b) => (nodes[a]!.ch < nodes[b]!.ch ? -1 : 1));
  return { nodes, start, inner };
}

/** Greedy longest match first (no steps). */
export function encodeWord(s: S, set: WpSettings, word: string): string[] {
  const chars = [...word];
  if (chars.length > set.maxLen) return [UNK];
  const vocab = new Set(vocabulary(s));
  const out: string[] = [];
  let start = 0;
  while (start < chars.length) {
    let end = chars.length;
    let piece: string | null = null;
    while (end > start) {
      const sub = (start > 0 ? CONT : '') + chars.slice(start, end).join('');
      if (vocab.has(sub)) {
        piece = sub;
        break;
      }
      end--;
    }
    if (piece === null) return [UNK];
    out.push(piece);
    start = end;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Steps

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });
export const chipId = (p: Piece) => `p-${p.id}`;
export const nodeId = (u: number) => `tn-${u}`;

export function baseVars(s: S): Record<string, Scalar> {
  return {
    words: s.rows.length,
    tokens: tokenTotal(s.rows),
    vocabulary: vocabulary(s).length,
    merges: s.merges.length,
  };
}

const err = (s: S, message: string): WStep => ({
  state: s,
  marks: [],
  say: message,
  lines: [],
  level: 1,
  vars: baseVars(s),
});

function startSay(s: S): string {
  const n = wordTotal(s.rows);
  const starts = s.alphabet.filter((t) => !t.startsWith(CONT)).length;
  const eg = s.rows.find((r) => r.pieces.length >= 3) ?? s.rows[0]!;
  return `${s.rows.length === 1 ? 'One word' : `${s.rows.length} different words`}${n > s.rows.length ? ` (${n} in all)` : ''}, each split into its first letter and ## letters (## means "inside a word"): ${eg.word} is ${spaced(eg.pieces)}. The vocabulary starts as the ${s.alphabet.length} pieces that occur: ${starts} first letters and ${s.alphabet.length - starts} ## letters.`;
}

const spaced = (ps: readonly Piece[]) => ps.map((p) => p.t).join(' ');

function* oneMerge(s: S): Generator<WStep, S | null, void> {
  const vars = (st: S) => baseVars(st);
  if (s.merges.length === 0) {
    for (let r = 0; r < s.rows.length; r++) {
      const row = s.rows[r]!;
      const own = row.pieces.length - 1;
      yield {
        state: s,
        marks: [...row.pieces.map((p) => mark(chipId(p), 'active')), mark(`wc-${r}`, 'active')],
        say:
          own === 0
            ? `${row.word} is one piece: it adds ${row.count} to ${row.word}'s count and makes no pairs.`
            : `${row.word}${row.count > 1 ? ` occurs ${row.count} times: each of its ${row.pieces.length} pieces and ${own} pairs counts ${row.count}` : ` occurs once: each of its pieces and pairs counts 1`}.`,
        lines: ['count'],
        level: 3,
        vars: vars(s),
        extra: { pairs: pairRows(scorePairs(s.rows, r + 1)) },
      };
    }
  }
  const pairs = scorePairs(s.rows);
  const ranked = rankPairs(pairs);
  const best = ranked[0];
  if (!best) {
    yield {
      state: s,
      marks: [],
      say: 'Every word is a single piece now: there are no pairs left to merge.',
      lines: ['none'],
      level: 2,
      vars: vars(s),
    };
    return null;
  }
  const table = pairRows(pairs);
  const bpe = bpePick(pairs)!;
  const bpeNote =
    bpe === best
      ? ' It is also the most frequent pair, the one BPE would take.'
      : ` BPE would take the most frequent pair, ${pairName(bpe)} (${bpe.count} times), but its halves are common on their own: ${fraction(bpe)}.`;
  const tied = ranked.filter((p) => p.score === best.score);
  const tieNote =
    tied.length > 1
      ? ` ${tied.length === 2 ? `${pairName(tied[1]!)} scores` : `${tied.length - 1} other pairs score`} the same; ${pairName(best)} is met first reading the text, so it wins.`
      : '';
  const hits = best.rows.flatMap((r) => occurrences(s.rows[r]!, best.a, best.b));
  const bpeRow = table.findIndex((r) => r.bpe || (r.a === bpe.a && r.b === bpe.b));
  yield {
    state: s,
    marks: [
      mark('pr-0', 'found'),
      ...(bpe !== best && bpeRow >= 0 ? [mark(`pr-${bpeRow}`, 'compare')] : []),
      ...hits.map((p) => mark(chipId(p), 'active')),
    ],
    say: `${s.merges.length === 0 ? 'All counted. ' : 'Count and score again. '}Score = count of the pair / (count of a × count of b). The best is ${pairName(best)}: ${fraction(best)} (${whereFrom(s.rows, best.rows)}).${tieNote}${bpeNote}`,
    lines: ['count', 'score', 'best'],
    level: 2,
    vars: vars(s),
    extra: { pairs: table },
  };

  const ab = join(best.a, best.b);
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
      extra: { pairs: table },
    };
  }
  const next = applyMerge(s, best);
  yield {
    state: next,
    marks: [mark(`vm-${next.merges.length - 1}`, 'new')],
    say: `Merge ${next.merges.length}: ${pairName(best)} becomes the piece ${ab}, and the vocabulary grows to ${vocabulary(next).length}.`,
    lines: ['add'],
    level: 2,
    vars: vars(next),
    extra: { pairs: table },
  };
  return next;
}

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

const loadOp: Op = {
  label: 'Load text',
  arity: 1,
  *run(s, args, { settings }) {
    const next = loadState(String(args[0] ?? ''));
    if (next instanceof Error) {
      yield err(s, next.message);
      return s;
    }
    yield {
      state: next,
      marks: next.rows.flatMap((r) => r.pieces.map((p) => mark(chipId(p), 'new'))),
      say: `${startSay(next)} Press Train to learn ${settings.merges} merges.`,
      lines: ['split'],
      level: 1,
      vars: baseVars(next),
    };
    return next;
  },
};

const trainOp: Op = {
  label: 'Train',
  arity: 0,
  *run(s, _args, { settings }) {
    let st = loadState(s.text) as S;
    yield {
      state: st,
      marks: [],
      say: `Train from the start. ${startSay(st)}`,
      lines: ['split'],
      level: 2,
      vars: baseVars(st),
    };
    for (let i = 0; i < settings.merges; i++) {
      const next = yield* oneMerge(st);
      if (!next) break;
      st = next;
    }
    const k = st.merges.length;
    const early = k < settings.merges ? ' It stopped early: every word is a single piece.' : '';
    yield {
      state: st,
      marks: st.merges.map((_, i) => mark(`vm-${i}`, 'found')),
      say: `Learned ${k} merge${k === 1 ? '' : 's'}.${early} The vocabulary has ${vocabulary(st).length} pieces. WordPiece keeps only these: to encode a word it looks for the longest piece, not for merges. Type a word and press Encode.`,
      lines: ['tret'],
      level: 1,
      vars: baseVars(st),
    };
    return st;
  },
};

const mergeOp: Op = {
  label: 'One merge',
  arity: 0,
  *run(s) {
    const st = s.mode === 'train' ? s : { ...s, mode: 'train' as const };
    const next = yield* oneMerge(st);
    const end = next ?? st;
    const m = end.merges.at(-1);
    yield {
      state: end,
      marks: next ? [mark(`vm-${end.merges.length - 1}`, 'new')] : [],
      say: next && m ? `Learned merge ${end.merges.length}: ${pairName(m)} → ${m.ab}.` : 'Nothing to merge: every word is already one piece.',
      lines: next ? ['add'] : ['none'],
      level: 1,
      vars: baseVars(end),
    };
    return end;
  },
};

/** The pieces taken so far and the word's letters, for narration: w ##a | lking. */
const pieceOf = (chars: readonly string[], a: number, b: number) =>
  (a > 0 ? CONT : '') + chars.slice(a, b).join('');

const encodeOp: Op = {
  label: 'Encode',
  arity: 1,
  *run(s, args, { settings }) {
    const word = readWord(args[0]);
    if (word instanceof Error) {
      yield err(s, word.message);
      return s;
    }
    const chars = [...word];
    const n = chars.length;
    const shown: S = { ...s, mode: 'encode' };
    const tries = buildTries(vocabulary(s));
    const vocab = new Set(vocabulary(s));
    const pieces: string[] = [];
    let looks = 0;
    const counter = settings.trie ? 'trie steps' : 'lookups';
    const vars = () => ({ ...baseVars(s), [counter]: looks, pieces: pieces.length });
    const step = (
      say: string,
      lines: string[],
      level: 1 | 2 | 3,
      enc: Omit<WpEnc, 'word' | 'pieces'>,
      marks: Mark[] = [],
    ): WStep => ({
      state: shown,
      marks,
      say,
      lines,
      level,
      vars: vars(),
      extra: { enc: { word, pieces: [...pieces], ...enc } },
    });
    const finish = (unk: boolean): S => ({
      ...s,
      mode: 'encode',
      encodings: [...s.encodings, { word, pieces: unk ? [UNK] : [...pieces] }].slice(-KEEP),
    });

    if (n > settings.maxLen) {
      const next = finish(true);
      yield {
        state: next,
        marks: [mark('enc-unk', 'error')],
        say: `${word} has ${n} letters, more than the maximum of ${settings.maxLen}, so it becomes ${UNK} without a look at the vocabulary. (BERT's limit is 100 characters.)`,
        lines: ['long'],
        level: 1,
        vars: { ...baseVars(next), [counter]: 0, pieces: 1 },
        extra: { enc: { word, pieces: [UNK], start: 0, at: 0, last: -1, path: [], unk: true, done: true } },
      };
      return next;
    }

    let start = 0;
    let unk = false;
    while (start < n) {
      const inner = start > 0;
      let last = -1;
      if (settings.trie) {
        let u = inner ? tries.inner : tries.start;
        const path = [u];
        let at = start;
        yield step(
          `Find the longest piece that starts at ${chars[start]}${inner ? ', inside the word' : ''}: walk the trie of ${inner ? '## pieces' : 'pieces that start a word'} from its root, one letter at a time.`,
          ['walk'],
          2,
          { start, at, last, path: [...path] },
          [mark(nodeId(u), 'active')],
        );
        while (at < n) {
          const kid = tries.nodes[u]!.kids.find((k) => tries.nodes[k]!.ch === chars[at]);
          looks++;
          if (kid === undefined) {
            yield step(
              `No branch for ${chars[at]} here: no piece is longer.`,
              ['step'],
              3,
              { start, at, last, path: [...path] },
              [mark(nodeId(u), 'active'), mark(`wl-${at}`, 'error')],
            );
            break;
          }
          u = kid;
          at++;
          path.push(u);
          const here = pieceOf(chars, start, at);
          if (tries.nodes[u]!.piece !== null) last = at;
          yield step(
            tries.nodes[u]!.piece !== null
              ? `${chars[at - 1]}: ${here} is a piece (a ring), the longest so far.`
              : `${chars[at - 1]}: ${here} is not a piece, but longer pieces start with it, so keep going.`,
            ['step', ...(tries.nodes[u]!.piece !== null ? ['remember'] : [])],
            3,
            { start, at, last, path: [...path] },
            [mark(nodeId(u), tries.nodes[u]!.piece !== null ? 'found' : 'active')],
          );
        }
        if (last < 0) {
          unk = true;
          yield step(
            `No piece starts with ${pieceOf(chars, start, start + 1)}: the vocabulary has no way to spell ${word}, so the whole word becomes ${UNK}.`,
            ['unk'],
            2,
            { start, at, last, path: [...path], unk: true },
            [mark('enc-unk', 'error')],
          );
          break;
        }
        const piece = pieceOf(chars, start, last);
        const back = at > last ? ` The walk went on to ${pieceOf(chars, start, at)}, which is not a piece, so back off to the last ring.` : '';
        pieces.push(piece);
        yield step(
          `Take ${piece}.${back}${last < n ? ` Continue at ${chars[last]}.` : ''}`,
          ['take'],
          2,
          { start, at, last, path: [...path] },
          [mark(`pc-${pieces.length - 1}`, 'new')],
        );
      } else {
        yield step(
          `Find the longest piece that starts at ${chars[start]}: look up the rest of the word, then one letter shorter, until something is in the vocabulary.`,
          ['lfor'],
          2,
          { start, at: n, last, path: [] },
        );
        let end = n;
        for (; end > start; end--) {
          const sub = pieceOf(chars, start, end);
          looks++;
          const hit = vocab.has(sub);
          yield step(
            hit ? `Is ${sub} in the vocabulary? Yes.` : `Is ${sub} in the vocabulary? No.`,
            hit ? ['look', 'hit'] : ['look'],
            hit ? 2 : 3,
            { start, at: end, last: hit ? end : -1, path: [], candidate: sub, hit },
            [mark('cand', hit ? 'found' : 'error')],
          );
          if (hit) break;
        }
        if (end === start) {
          unk = true;
          yield step(
            `Not even ${pieceOf(chars, start, start + 1)} is in the vocabulary, so ${word} becomes ${UNK}.`,
            ['unk'],
            2,
            { start, at: start, last: -1, path: [], unk: true },
            [mark('enc-unk', 'error')],
          );
          break;
        }
        last = end;
        pieces.push(pieceOf(chars, start, end));
        yield step(
          `Take ${pieces.at(-1)}.${end < n ? ` Continue at ${chars[end]}.` : ''}`,
          ['take'],
          2,
          { start, at: end, last, path: [], candidate: pieces.at(-1), hit: true },
          [mark(`pc-${pieces.length - 1}`, 'new')],
        );
      }
      start = last;
    }
    const next = finish(unk);
    const out = unk ? [UNK] : pieces;
    yield {
      state: next,
      marks: unk ? [mark('enc-unk', 'error')] : out.map((_, i) => mark(`pc-${i}`, 'found')),
      say: unk
        ? `${word} → ${UNK}. One missing piece loses the whole word, not just a letter.`
        : `${word} → ${out.join(' ')}: ${out.length} piece${out.length === 1 ? '' : 's'}, after ${looks} ${settings.trie ? 'steps down the tries' : 'lookups'}.`,
      lines: ['ret'],
      level: 1,
      vars: { ...baseVars(next), [counter]: looks, pieces: out.length },
      extra: {
        enc: { word, pieces: out, start: n, at: n, last: n, path: [], unk, done: true },
      },
    };
    return next;
  },
};

export const ops = { load: loadOp, train: trainOp, merge: mergeOp, encode: encodeOp };

// ---------------------------------------------------------------------------------------------
// Pseudocode

const L = (id: string, indent: number, text: string, plain: string) => ({ id, indent, text, plain });

export function pseudocode(set: WpSettings): PseudoBlock[] {
  const split = L(
    'split',
    1,
    'for each word w: pieces[w] = w[1], ##w[2], …, ##w[n]',
    'Split every word into its first letter and ## letters.',
  );
  const round = (d: number) => [
    L('count', d, 'count every piece and every pair of neighbours, each word count(w) times', 'Count the pieces and the pairs, each word as often as it occurs.'),
    L('score', d, 'score(a, b) = count(a b) / (count(a) · count(b))', 'Score a pair high when its halves seldom occur apart.'),
    L('best', d, '(a, b) = the pair with the best score (ties: first met)', 'Pick the best pair.'),
    L('none', d, 'if there is no pair: stop', 'If every word is one piece, stop.'),
    L('merge', d, 'replace every a b with ab (##b loses its ##)', 'Join it into one piece everywhere.'),
    L('add', d, 'vocabulary.add(ab)', 'Add the piece to the vocabulary.'),
  ];
  const find = set.trie
    ? [
        L('walk', 2, 'u = root of the trie (the ## trie when i > 1); last = none', 'Walk the trie of pieces from its root:'),
        L('step', 2, 'while u has a child for the next letter: go down', 'follow the letters of the word down the trie,'),
        L('remember', 3, 'if u ends a piece: last = u', 'and remember the last ring (a whole piece) passed.'),
      ]
    : [
        L('lfor', 2, 'for j = n down to i', 'Try the rest of the word, then one letter shorter, and so on:'),
        L('look', 3, 'piece = w[i..j] (with ## when i > 1)', 'look up that piece;'),
        L('hit', 3, 'if piece is in the vocabulary: last = piece; break', 'stop at the first one in the vocabulary.'),
      ];
  return [
    { op: 'load', lines: [L('lsig', 0, 'LOAD(text)', 'Read a training text:'), split] },
    {
      op: 'train',
      lines: [
        L('tsig', 0, 'TRAIN(text, k)', 'Build a vocabulary from the text:'),
        split,
        L('loop', 1, 'repeat k times', 'Then, k times:'),
        ...round(2),
        L('tret', 1, 'return the vocabulary', 'Keep the vocabulary; the merges are not needed again.'),
      ],
    },
    { op: 'merge', lines: [L('msig', 0, 'MERGE-ONCE()', 'Learn one more piece:'), ...round(1)] },
    {
      op: 'encode',
      lines: [
        L('esig', 0, 'ENCODE(w)', 'Split a word into pieces:'),
        L('long', 1, `if length(w) > ${set.maxLen}: return [${UNK}]`, 'A word that is too long is unknown.'),
        L('eloop', 1, 'i = 1; while i ≤ n', 'From the start of the word:'),
        ...find,
        L('unk', 2, `if last = none: return [${UNK}]`, 'If no piece fits, the whole word is unknown.'),
        L('take', 2, 'output last; i = the letter after it', 'Take the longest piece and continue after it.'),
        L('ret', 1, 'return the pieces', 'The pieces are the tokens.'),
      ],
    },
  ];
}

// ---------------------------------------------------------------------------------------------
// Words for screen readers and narration

export function initialSay(s: S, set: WpSettings): string {
  return `The toy corpus: ${startSay(s)} Press Train to learn ${set.merges} merges, or One merge to step through them.`;
}

export const initialVars = (s: S) => baseVars(s);

export function describe(s: S): string {
  const vocab = ` Vocabulary: ${vocabulary(s).join(' ')}.`;
  const words = ` Words: ${s.rows.map((r) => `${r.word} ×${r.count} as ${spaced(r.pieces)}`).join('; ')}.`;
  const enc = s.encodings.length
    ? ` Encoded: ${s.encodings.map((e) => `${e.word} → ${e.pieces.join(' ')}`).join('; ')}.`
    : '';
  return `WordPiece.${vocab}${s.mode === 'encode' ? enc : words}`;
}
