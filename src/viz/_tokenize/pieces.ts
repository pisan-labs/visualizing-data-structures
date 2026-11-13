/**
 * What BPE and WordPiece training share: the training words, each with its count and its
 * current pieces, the pairs of neighbouring pieces counted over all words, and a merge.
 *
 * Pieces carry ids so the drawing can follow them: when a and b merge, the merged piece keeps
 * a's id and b's disappears.
 */
import type { WordCount } from './text';

export interface Piece {
  id: number;
  t: string;
}

export interface Row {
  word: string;
  count: number;
  pieces: Piece[];
}

export interface PairCount {
  a: string;
  b: string;
  /** Occurrences, each word counted as often as it appears in the text. */
  count: number;
  /** The rows the pair occurs in, in order. */
  rows: number[];
  /** When the pair was first met, reading the words in order and each left to right. */
  first: number;
}

/** Split each word into its starting pieces, numbering the pieces from 0. */
export function makeRows(words: readonly WordCount[], split: (w: string) => string[]): Row[] {
  let id = 0;
  return words.map(({ word, count }) => ({
    word,
    count,
    pieces: split(word).map((t) => ({ id: id++, t })),
  }));
}

/** Every pair of neighbours in the first `upTo` rows, weighted by the rows' counts. */
export function countPairs(rows: readonly Row[], upTo = rows.length): PairCount[] {
  const pairs = new Map<string, PairCount>();
  rows.slice(0, upTo).forEach((row, r) => {
    const p = row.pieces;
    for (let i = 0; i + 1 < p.length; i++) {
      const key = `${p[i]!.t}\u0000${p[i + 1]!.t}`;
      let c = pairs.get(key);
      if (!c) {
        c = { a: p[i]!.t, b: p[i + 1]!.t, count: 0, rows: [], first: pairs.size };
        pairs.set(key, c);
      }
      c.count += row.count;
      if (c.rows.at(-1) !== r) c.rows.push(r);
    }
  });
  return [...pairs.values()];
}

/** How often each piece occurs, weighted by the rows' counts. */
export function pieceCounts(rows: readonly Row[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const row of rows)
    for (const p of row.pieces) out.set(p.t, (out.get(p.t) ?? 0) + row.count);
  return out;
}

/**
 * Replace every a followed by b with ab, left to right without overlaps (a a a with a + a gives
 * aa a). The merged piece keeps a's id. Returns the same row when nothing changes.
 */
export function mergeRow(row: Row, a: string, b: string, ab: string): Row {
  const p = row.pieces;
  const out: Piece[] = [];
  let changed = false;
  for (let i = 0; i < p.length; i++) {
    if (i + 1 < p.length && p[i]!.t === a && p[i + 1]!.t === b) {
      out.push({ id: p[i]!.id, t: ab });
      i++;
      changed = true;
    } else out.push(p[i]!);
  }
  return changed ? { ...row, pieces: out } : row;
}

/** Tokens in the whole text: every word's pieces, times how often the word occurs. */
export const tokenTotal = (rows: readonly Row[]): number =>
  rows.reduce((s, r) => s + r.count * r.pieces.length, 0);

/** Occurrences of the text: the words' counts added up. */
export const wordTotal = (rows: readonly Row[]): number => rows.reduce((s, r) => s + r.count, 0);

/** "the ×29, ate and tree ×2" (at most `max` words, then "and 3 more"). */
export function whereFrom(rows: readonly Row[], idx: readonly number[], max = 3): string {
  const names = idx.map((r) => {
    const row = rows[r]!;
    return row.count > 1 ? `${row.word} ×${row.count}` : row.word;
  });
  if (names.length <= max) return listOf(names);
  return `${names.slice(0, max).join(', ')} and ${names.length - max} more`;
}

function listOf(xs: readonly string[]): string {
  return xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`;
}
