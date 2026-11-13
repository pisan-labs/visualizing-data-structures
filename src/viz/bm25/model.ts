/**
 * An inverted index and BM25 ranking (Robertson and Zaragoza 2009, the form of their equation
 * 3.15), on at most 6 short documents.
 *
 * The index maps each term to its postings list: the documents that contain it, in order, each
 * with the term's frequency tf there. A real index keeps the terms in a hash table (or a sorted
 * dictionary); a lookup is one probe.
 *
 *   score(D, Q) = Σ over the words t of Q:  IDF(t) · tf / (tf + k₁ · B)
 *   B           = 1 − b + b · |D| / avgdl      (|D| words in D; avgdl the average length)
 *   IDF(t)      = ln((N − n + 0.5) / (n + 0.5))          'rsj' (Robertson–Spärck Jones)
 *               = ln(1 + (N − n + 0.5) / (n + 0.5))      'plus1' (as in Lucene: never negative)
 *
 * N documents, n of them contain t. The term-frequency part tf / (tf + k₁B) is between 0 and 1:
 * it saturates (k₁ = 0 ignores how often the word appears), and B makes long documents need more
 * occurrences for the same share (b = 0: no length normalization; b = 1: full). A word typed
 * twice in the query counts twice.
 *
 * Search scores term at a time (one accumulator per document met), then keeps the best K = 3 in
 * a min-heap whose root is the weakest kept (src/viz/binary-heap/). A higher score is better; on
 * equal scores the lower document number wins.
 *
 * Operations: add (one document, or several separated by ";"), search, clear.
 */
import type { Mark, MarkRole, OpSpec, PseudoBlock, Scalar, Step, Value } from '../../engine/types';
import { two } from '../_lm/numbers';

export const MAX_DOCS = 6;
export const MAX_WORDS = 8;
export const MAX_QUERY = 6;
export const K = 3;

export type Idf = 'rsj' | 'plus1';

export interface BmSettings {
  [key: string]: Scalar;
  k1: string;
  b: string;
  idf: Idf;
}

export const defaults: BmSettings = { k1: '1.2', b: '0.75', idf: 'rsj' };

export interface Posting {
  doc: number;
  tf: number;
}

export interface Doc {
  /** 1-based: d1, d2... */
  id: number;
  words: string[];
}

export interface BmState {
  docs: Doc[];
  /** Terms in the order they first appeared, each with its postings in document order. */
  index: { term: string; postings: Posting[] }[];
  last?: SearchDone;
}

export interface Kept {
  doc: number;
  score: number;
}

export interface SearchDone {
  query: string[];
  /** IDF of each query word found in the index, by term. */
  idf: Record<string, number>;
  /** The score of each document met, by document id. */
  scores: Record<number, number>;
  top: Kept[];
  postings: number;
}

export interface BmExtra {
  /** The search so far: query words, IDFs worked out, accumulators. */
  query?: string[];
  /** Which query word is being looked up (index into query). */
  qi?: number;
  idf?: Record<string, number>;
  scores?: Record<number, number>;
  /** The posting being scored: [term, doc]. */
  at?: [string, number];
  heap?: Kept[];
  /** The document whose words are being indexed, and which word. */
  adding?: { doc: number; term: string };
}

type S = BmState;
type X = BmExtra;
type Op = OpSpec<S, BmSettings, X>;
type BStep = Step<S, X>;

export const k1Of = (s: BmSettings) => Number(s.k1);
export const bOf = (s: BmSettings) => Number(s.b);
export const dName = (id: number) => `d${id}`;
const mark = (id: string, role: MarkRole): Mark => ({ id, role });
export const wordId = (doc: number, i: number) => `w-${doc}-${i}`;
export const docId = (doc: number) => `d-${doc}`;
export const scoreId = (doc: number) => `ds-${doc}`;
export const termId = (term: string) => `t-${term}`;
export const postingId = (term: string, doc: number) => `p-${term}-${doc}`;
export const heapId = (doc: number) => `h-${doc}`;

export function init(): S {
  return { docs: [], index: [] };
}

/** Lower case, letters only: "The cat, sat!" → the cat sat. */
export const tokens = (text: string): string[] =>
  text
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean);

/** Documents separated by ";", each its words, or an Error a learner can act on. */
export function parseDocs(text: string): string[][] | Error {
  const docs = text.split(';').map(tokens).filter((d) => d.length);
  if (!docs.length) return new Error('Type a short sentence, such as "the cat sat on the mat".');
  if (docs.length > MAX_DOCS) return new Error(`At most ${MAX_DOCS} documents.`);
  if (docs.some((d) => d.length > MAX_WORDS))
    return new Error(`Keep each document to ${MAX_WORDS} words, so the index fits on the screen.`);
  if (docs.some((d) => d.some((w) => w.length > 10))) return new Error('Use words of ten letters at most.');
  return docs;
}

// ---------------------------------------------------------------------------------------------
// The arithmetic, shared with the tests and the practice questions

export const avgdl = (s: S) => {
  let total = 0;
  for (const d of s.docs) total += d.words.length;
  return total / s.docs.length;
};

export function idfOf(N: number, n: number, kind: Idf): number {
  const ratio = (N - n + 0.5) / (n + 0.5);
  return kind === 'rsj' ? Math.log(ratio) : Math.log(1 + ratio);
}

/** B = 1 − b + b·|D|/avgdl. */
export const lengthPart = (len: number, avg: number, b: number) => 1 - b + (b * len) / avg;

/** tf / (tf + k₁·B), between 0 and 1. */
export const tfPart = (tf: number, k1: number, lenB: number) => tf / (tf + k1 * lenB);

export const postingsOf = (s: S, term: string) => s.index.find((t) => t.term === term)?.postings;

/** Whether a is a weaker result than b: a lower score, or the same score and a later document. */
export const weaker = (a: Kept, b: Kept) => a.score < b.score || (a.score === b.score && a.doc > b.doc);

/** The whole search with no steps: scores term at a time, then the best K. */
export function bm25(s: S, query: readonly string[], set: BmSettings) {
  const N = s.docs.length;
  const avg = avgdl(s);
  const scores: Record<number, number> = {};
  const idf: Record<string, number> = {};
  for (const t of query) {
    const list = postingsOf(s, t);
    if (!list) continue;
    const w = idfOf(N, list.length, set.idf);
    idf[t] = w;
    for (const p of list) {
      const len = s.docs[p.doc - 1]!.words.length;
      const part = tfPart(p.tf, k1Of(set), lengthPart(len, avg, bOf(set)));
      scores[p.doc] = (scores[p.doc] ?? 0) + w * part;
    }
  }
  const all = Object.keys(scores)
    .map(Number)
    .map((doc) => ({ doc, score: scores[doc]! }));
  const top = all.sort((a, b) => (weaker(a, b) ? 1 : weaker(b, a) ? -1 : 0)).slice(0, K);
  return { scores, idf, top };
}

// ---------------------------------------------------------------------------------------------
// Narration helpers

export function vars(s: S, set: BmSettings, extra: Record<string, Scalar> = {}): Record<string, Scalar> {
  return {
    N: s.docs.length,
    avgdl: s.docs.length ? Math.round(avgdl(s) * 100) / 100 : 0,
    terms: s.index.length,
    k1: k1Of(set),
    b: bOf(set),
    ...extra,
  };
}

function stop(s: S, set: BmSettings, say: string): BStep {
  return { state: s, marks: [], say, lines: [], level: 1, vars: vars(s, set) };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// ---------------------------------------------------------------------------------------------
// Operations

const addOp: Op = {
  label: 'Add',
  arity: 1,
  *run(s0, args, { settings }) {
    const docs = parseDocs(String(args[0] ?? ''));
    if (docs instanceof Error) {
      yield stop(s0, settings, docs.message);
      return s0;
    }
    if (s0.docs.length + docs.length > MAX_DOCS) {
      yield stop(
        s0,
        settings,
        `The index holds at most ${MAX_DOCS} documents on this page, and it has ${s0.docs.length}. Clear it to start again.`,
      );
      return s0;
    }
    const many = docs.length > 1;
    let s: S = { ...s0, last: undefined };
    for (const words of docs) {
      const id = s.docs.length + 1;
      const doc: Doc = { id, words };
      s = { ...s, docs: [...s.docs, doc] };
      const counts = new Map<string, number>();
      for (const w of words) counts.set(w, (counts.get(w) ?? 0) + 1);
      yield {
        state: s,
        marks: [mark(docId(id), 'new')],
        say: `${dName(id)}: "${words.join(' ')}", ${plural(words.length, 'word')}, ${plural(counts.size, 'different term')}. Count each term, then add one posting (${dName(id)}, tf) to its list.`,
        lines: ['acount'],
        level: many ? 3 : 2,
        vars: vars(s, settings),
        extra: { adding: { doc: id, term: '' } },
      };
      for (const [term, tf] of counts) {
        const at = s.index.findIndex((t) => t.term === term);
        const index = s.index.map((t) => ({ ...t, postings: [...t.postings] }));
        const fresh = at < 0;
        if (fresh) index.push({ term, postings: [{ doc: id, tf }] });
        else index[at]!.postings.push({ doc: id, tf });
        s = { ...s, index };
        const list = postingsOf(s, term)!;
        yield {
          state: s,
          marks: [
            mark(termId(term), fresh ? 'new' : 'active'),
            mark(postingId(term, id), 'new'),
            ...words.flatMap((w, i) => (w === term ? [mark(wordId(id, i), 'active')] : [])),
          ],
          say: fresh
            ? `"${term}" is new: a hash-table probe finds no entry, so it gets a list of its own, [${dName(id)}: ${tf}].`
            : `"${term}" is in the index: one hash-table probe finds its list, and (${dName(id)}, ${tf}) goes on the end. It is in ${plural(list.length, 'document')} now.`,
          lines: [fresh ? 'anew' : 'aappend'],
          level: 3,
          vars: vars(s, settings),
          extra: { adding: { doc: id, term } },
        };
      }
      yield {
        state: s,
        marks: [mark(docId(id), 'done')],
        say: `${dName(id)} is indexed. ${plural(s.docs.length, 'document')}, ${plural(s.index.length, 'term')}, average length avgdl = ${two(avgdl(s))} words.`,
        lines: ['aret'],
        level: many ? 2 : 1,
        vars: vars(s, settings),
      };
    }
    const longest = s.index.reduce((a, t) => (t.postings.length > a.postings.length ? t : a));
    if (many)
      yield {
        state: s,
        marks: [mark(termId(longest.term), 'found')],
        say: `Added ${plural(docs.length, 'document')}. The index has ${plural(s.index.length, 'term')}; the longest list is "${longest.term}", in ${plural(longest.postings.length, 'document')}.`,
        lines: ['aret'],
        level: 1,
        vars: vars(s, settings),
      };
    return s;
  },
};

/** The query words, or an Error. */
export function parseQuery(v: Value | undefined): string[] | Error {
  const words = tokens(String(v ?? ''));
  if (!words.length) return new Error('Type the words to search for, such as "cat mat".');
  if (words.length > MAX_QUERY) return new Error(`At most ${MAX_QUERY} query words.`);
  return words;
}

const searchOp: Op = {
  label: 'Search',
  arity: 1,
  *run(s0, args, { settings }) {
    if (!s0.docs.length) {
      yield stop(s0, settings, 'The index is empty. Add some documents first.');
      return s0;
    }
    const query = parseQuery(args[0]);
    if (query instanceof Error) {
      yield stop(s0, settings, query.message);
      return s0;
    }
    const s: S = { ...s0, last: undefined };
    const N = s.docs.length;
    const avg = avgdl(s);
    const k1 = k1Of(settings);
    const b = bOf(settings);
    const idf: Record<string, number> = {};
    const scores: Record<number, number> = {};
    let read = 0;
    const extra = (o: Partial<X> = {}): X => ({ query, idf: { ...idf }, scores: { ...scores }, ...o });
    const step = (say: string, lines: string[], level: 1 | 2 | 3, marks: Mark[], o: Partial<X> = {}): BStep => ({
      state: s,
      marks,
      say,
      lines,
      level,
      vars: vars(s, settings, { 'postings read': read }),
      extra: extra(o),
    });

    for (const [qi, t] of query.entries()) {
      const list = postingsOf(s, t);
      if (!list) {
        yield step(
          `"${t}": one probe of the hash table finds no entry. No document contains it, so it adds nothing.`,
          ['slook'],
          2,
          [],
          { qi },
        );
        continue;
      }
      const n = list.length;
      const w = idfOf(N, n, settings.idf);
      idf[t] = w;
      const ratio = `(${N} − ${n} + 0.5) / (${n} + 0.5)`;
      const sign =
        w < 0
          ? ` That is negative: "${t}" is in more than half the documents, and this IDF counts it against a document.${settings.idf === 'rsj' ? ' Lucene adds 1 inside the logarithm to stop that (the IDF setting).' : ''}`
          : w === 0
            ? ` In exactly half the documents, "${t}" tells nothing apart: weight 0.`
            : '';
      yield step(
        `"${t}": one probe finds its list, ${plural(n, 'document')} of ${N}. IDF = ${settings.idf === 'rsj' ? `ln(${ratio})` : `ln(1 + ${ratio})`} = ${two(w)}.${sign}`,
        ['slook', 'sidf'],
        2,
        [mark(termId(t), 'active'), ...list.map((p) => mark(postingId(t, p.doc), 'compare'))],
        { qi },
      );
      for (const p of list) {
        read++;
        const doc = s.docs[p.doc - 1]!;
        const len = doc.words.length;
        const B = lengthPart(len, avg, b);
        const part = tfPart(p.tf, k1, B);
        const add = w * part;
        const hits = doc.words.flatMap((x, i) => (x === t ? [mark(wordId(doc.id, i), 'active')] : []));
        yield step(
          `${dName(doc.id)} has ${plural(len, 'word')}: B = 1 − b + b·|d|/avgdl = ${two(1 - b)} + ${two(b)} × ${len} / ${two(avg)} = ${two(B)}.${B > 1 ? ' Longer than average, so it needs more hits for the same share.' : B < 1 ? ' Shorter than average: each hit counts for more.' : ''}`,
          ['sb'],
          3,
          [mark(postingId(t, doc.id), 'active'), mark(docId(doc.id), 'active')],
          { qi, at: [t, doc.id] },
        );
        scores[doc.id] = (scores[doc.id] ?? 0) + add;
        yield step(
          `${dName(doc.id)} has "${t}" ${p.tf === 1 ? 'once' : `${p.tf} times`} (tf = ${p.tf}): tf / (tf + k₁·B) = ${p.tf} / (${p.tf} + ${two(k1)} × ${two(B)}) = ${two(part)}${k1 === 0 ? ' (k₁ = 0: one hit or many, the same)' : ''}. It adds IDF × ${two(part)} = ${two(add)}, so ${dName(doc.id)} has ${two(scores[doc.id]!)}.`,
          ['stf', 'sadd'],
          2,
          [mark(postingId(t, doc.id), 'active'), mark(scoreId(doc.id), 'new'), ...hits],
          { qi, at: [t, doc.id] },
        );
      }
    }

    const met = Object.keys(scores).map(Number);
    let next: S;
    if (!met.length) {
      next = { ...s, last: { query, idf, scores, top: [], postings: read } };
      yield {
        state: next,
        marks: [],
        say: `No document contains any of the query words: nothing to rank. (BM25 matches words exactly; "cats" does not find "cat".)`,
        lines: ['sret'],
        level: 1,
        vars: vars(next, settings, { 'postings read': read }),
      };
      return next;
    }

    yield step(
      `Every list is read (${plural(read, 'posting')}): ${met.map((d) => `${dName(d)} ${two(scores[d]!)}`).join(', ')}. Keep the best ${K} in a min-heap whose top is the weakest kept, so each document needs one comparison to be turned away.`,
      ['sheap'],
      2,
      met.map((d) => mark(scoreId(d), 'compare')),
      { heap: [] },
    );
    const heap: Kept[] = [];
    for (const d of met) {
      const e: Kept = { doc: d, score: scores[d]! };
      let say: string;
      let role: MarkRole = 'new';
      if (heap.length < K) {
        heap.push(e);
        siftUp(heap, heap.length - 1);
        say = `${dName(d)} (${two(e.score)}): the heap has room, push it. The weakest kept is now ${dName(heap[0]!.doc)} (${two(heap[0]!.score)}).`;
      } else if (weaker(heap[0]!, e)) {
        const out = heap[0]!;
        heap[0] = e;
        siftDown(heap, 0);
        say = `${dName(d)} (${two(e.score)}) beats the weakest kept, ${dName(out.doc)} (${two(out.score)}): replace the top and sift it down.`;
      } else {
        role = 'stale';
        say = `${dName(d)} (${two(e.score)}) does not beat the weakest kept, ${dName(heap[0]!.doc)} (${two(heap[0]!.score)}): one comparison and it is out.`;
      }
      yield step(say, ['sheap'], 3, [mark(scoreId(d), role), ...(role === 'new' ? [mark(heapId(d), 'new')] : [])], {
        heap: [...heap],
      });
    }
    const { top } = bm25(s, query, settings);
    next = { ...s, last: { query, idf, scores, top, postings: read } };
    yield {
      state: next,
      marks: top.map((e) => mark(docId(e.doc), 'found')),
      say: `Best first: ${top.map((e, r) => `${r + 1}. ${dName(e.doc)} (${two(e.score)})`).join(', ')}. ${plural(read, 'posting')} read; the documents that share no word with the query were never touched.`,
      lines: ['sret'],
      level: 1,
      vars: vars(next, settings, { 'postings read': read }),
    };
    return next;
  },
};

/** Min-heap order by strength: the weakest result on top. */
function siftUp(h: Kept[], i: number) {
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (!weaker(h[i]!, h[p]!)) break;
    [h[i], h[p]] = [h[p]!, h[i]!];
    i = p;
  }
}

function siftDown(h: Kept[], i: number) {
  for (;;) {
    const l = 2 * i + 1;
    const r = l + 1;
    let m = i;
    if (l < h.length && weaker(h[l]!, h[m]!)) m = l;
    if (r < h.length && weaker(h[r]!, h[m]!)) m = r;
    if (m === i) return;
    [h[i], h[m]] = [h[m]!, h[i]!];
    i = m;
  }
}

const clearOp: Op = {
  label: 'Clear',
  arity: 0,
  *run(_s, _args, { settings }) {
    const next = init();
    yield stop(next, settings, 'The index is empty.');
    return next;
  },
};

export const ops = { add: addOp, search: searchOp, clear: clearOp };

// ---------------------------------------------------------------------------------------------
// Pseudocode

const L = (id: string, indent: number, text: string, plain: string) => ({ id, indent, text, plain });

export function pseudocode(set: BmSettings): PseudoBlock[] {
  return [
    {
      op: 'add',
      lines: [
        L('asig', 0, 'ADD(d)', 'Index a document:'),
        L('acount', 1, 'tf[t] = how often each term t occurs in d', 'count its words;'),
        L('anew', 1, 'if t is not in the index: index[t] = [(d, tf[t])]', 'a new word gets a list of its own,'),
        L('aappend', 1, 'else append (d, tf[t]) to index[t]', 'a known word gets this document added to its list.'),
        L('aret', 1, 'N = N + 1; update avgdl', 'Count the document and its length.'),
      ],
    },
    {
      op: 'search',
      lines: [
        L('ssig', 0, `SEARCH(q)   // k₁ = ${set.k1}, b = ${set.b}`, 'Rank the documents for a query:'),
        L('slook', 1, 'for each word t of q: list = index[t]', 'look up each query word in the index;'),
        L(
          'sidf',
          2,
          set.idf === 'rsj' ? 'IDF = ln((N − n + 0.5) / (n + 0.5)), n = |list|' : 'IDF = ln(1 + (N − n + 0.5) / (n + 0.5)), n = |list|',
          'a word in few documents weighs more;',
        ),
        L('sb', 2, 'for each (d, tf) in list: B = 1 − b + b · |d| / avgdl', 'for each document on its list, see how long it is,'),
        L('stf', 3, 'share = tf / (tf + k₁ · B)', 'take a share of the weight that grows with tf but levels off,'),
        L('sadd', 3, 'score[d] = score[d] + IDF · share', 'and add it to that document’s score.'),
        L('sheap', 1, `keep the best ${K} scores in a min-heap`, `Keep the best ${K},`),
        L('sret', 1, 'return them, best first', 'best first.'),
      ],
    },
    { op: 'clear', lines: [L('csig', 0, 'CLEAR()', 'Start again with no documents.')] },
  ];
}

// ---------------------------------------------------------------------------------------------
// Words

export function initialSay(): string {
  return 'No documents yet. Add a few short sentences (separate several with ;), then Search: the index finds the documents with each query word, and BM25 scores them.';
}

export const initialVars = (s: S, set: BmSettings) => vars(s, set);

export function describe(s: S): string {
  if (!s.docs.length) return 'An empty index.';
  const docs = s.docs.map((d) => `${dName(d.id)}: ${d.words.join(' ')}`).join('; ');
  const index = [...s.index]
    .sort((a, b) => (a.term < b.term ? -1 : 1))
    .map((t) => `${t.term} → ${t.postings.map((p) => `${dName(p.doc)}:${p.tf}`).join(' ')}`)
    .join('; ');
  const last = s.last?.top.length
    ? ` Last search, ${s.last.query.join(' ')}: ${s.last.top.map((e) => `${dName(e.doc)} ${two(e.score)}`).join(', ')}.`
    : '';
  return `Documents: ${docs}. Index: ${index}.${last}`;
}
