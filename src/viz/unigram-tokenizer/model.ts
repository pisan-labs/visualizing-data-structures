/**
 * The unigram tokenizer (Kudo 2018), on a training text of words with counts (the toy corpus by
 * default). The algorithms are in unigram.ts; this file turns them into steps.
 *
 * Operations
 *   load(text)   the seed vocabulary: every letter, plus the most frequent substrings
 *   encode(w)    the lattice of w's pieces, then Viterbi (best[j], left to right) and the walk
 *                back; or, with the sample setting, the forward sums and a split drawn from
 *                the end (subword regularization)
 *   prune        one round: each piece's loss, the cheapest 20% removed, probabilities again
 *   train        from the seed, prune rounds until at most `target` pieces of two or more
 *                letters are left
 *
 * Settings
 *   seed     pieces of two or more letters in the seed vocabulary (6 to 24)
 *   target   pieces of two or more letters Train stops at (2 to 20)
 *   split    'best' (Viterbi, the default) or 'sample' (a split drawn with P(split)^α)
 *   alpha    α for sampling: 1 draws splits as likely as the model says; less flattens
 *
 * Probabilities are counts in the text over the total (unigram.ts). Kudo re-estimates them
 * with EM after each round; this page keeps the counts, so every number can be checked by hand.
 */
import type { Mark, OpSpec, PseudoBlock, Scalar, Step, Value } from '../../engine/types';
import { CORPUS_TEXT, parseText, readWord, type WordCount } from '../_tokenize/text';
import { round3, two } from '../_lm/numbers';
import {
  corpusLoss,
  forward,
  isLetter,
  lattice,
  pruneRound,
  sampleSplit,
  seedVocab,
  toRemove,
  UNK,
  UNK_PENALTY,
  viterbi,
  type Arc,
  type PieceLoss,
  type Vocab,
} from './unigram';

/** How narration describes the log-probability [UNK] gets (unigram.ts, UNK_PENALTY). */
const UNK_SAY = `with a log-probability ${UNK_PENALTY} below the rarest piece`;

/** Letters in a word to encode, so its lattice fits a phone. */
export const MAX_ENCODE = 10;
/** Encodings kept for the list under the lattice. */
export const KEEP_ENC = 4;

export type Split = 'best' | 'sample';

export interface UniSettings {
  [key: string]: Scalar;
  seed: number;
  target: number;
  split: Split;
  alpha: string;
}

export const defaults: UniSettings = { seed: 16, target: 8, split: 'best', alpha: '1' };

export const alphaOf = (s: UniSettings): number => Number(s.alpha) || 1;

export interface Encoding {
  word: string;
  pieces: string[];
  score: number;
  sampled: boolean;
}

/** A row of the loss table: a piece of two or more letters, with its numbers in the round. */
export interface TableRow {
  t: string;
  count: number;
  logp: number;
}

/** The last pruning round, kept so the table stays on screen after it. */
export interface RoundView {
  /** The pieces, largest loss first, removed ones last. */
  rows: TableRow[];
  loss: Map<string, number>;
  removed: string[];
  /** Which round it was (1 for the first). */
  round: number;
}

export interface UniState {
  /** The training text, as the model keeps it. */
  text: string;
  words: WordCount[];
  vocab: Vocab;
  /** Pruning rounds done since the seed. */
  rounds: number;
  /** Pieces of two or more letters in the seed vocabulary. */
  seeded: number;
  mode: 'vocab' | 'encode' | 'prune';
  encodings: Encoding[];
  round?: RoundView;
}

/** What one step of `encode` shows. */
export interface EncWork {
  word: string;
  arcs: Arc[];
  /** best[j] (or A[j] when sampling) for j = 1..n; null until reached. */
  vals: (number | null)[];
  kind: 'best' | 'sum';
  /** Arcs on the split, once it is known. */
  path: number[];
}

/** What one step of `prune` shows: the round so far. */
export interface PruneWork extends RoundView {
  /** The piece being priced, with the words it changes. */
  focus?: PieceLoss;
}

export interface UniExtra {
  enc?: EncWork;
  prune?: PruneWork;
}

type S = UniState;
type X = UniExtra;
type Op = OpSpec<S, UniSettings, X>;
type UStep = Step<S, X>;

// ---------------------------------------------------------------------------------------------
// Input

/** The training words, letters a to z only, or an Error a learner can act on. */
export function readText(raw: Value | undefined): WordCount[] | Error {
  const words = parseText(raw);
  if (words instanceof Error) return words;
  const bad = words.find((w) => !/^[a-z]+$/.test(w.word));
  if (bad) return new Error(`Use the letters a to z only ("${bad.word}" has another letter).`);
  return words;
}

/** One word to encode, letters a to z, at most MAX_ENCODE of them. */
export function readEncodeWord(raw: Value | undefined): string | Error {
  const w = readWord(raw);
  if (w instanceof Error) return w;
  if (!/^[a-z]+$/.test(w)) return new Error(`Use the letters a to z only ("${w}" has another).`);
  if (w.length > MAX_ENCODE)
    return new Error(`Keep a word to ${MAX_ENCODE} letters, so its lattice fits the screen.`);
  return w;
}

export function loadState(raw: Value | undefined, set: UniSettings): S | Error {
  const words = readText(raw);
  if (words instanceof Error) return words;
  const vocab = seedVocab(words, set.seed);
  return {
    text: words.map((w) => (w.count > 1 ? `${w.word}*${w.count}` : w.word)).join(' '),
    words,
    vocab,
    rounds: 0,
    seeded: multi(vocab),
    mode: 'vocab',
    encodings: [],
  };
}

export function init(settings: UniSettings): S {
  return loadState(CORPUS_TEXT, settings) as S;
}

// ---------------------------------------------------------------------------------------------
// Helpers

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });
export const multi = (v: Vocab): number => v.pieces.filter((p) => !isLetter(p)).length;
export const letters = (v: Vocab): number => v.pieces.filter(isLetter).length;
export const pieceId = (t: string) => `v-${t === UNK ? 'unk' : t}`;
export const rowId = (t: string) => `r-${t}`;
export const arcId = (k: number) => `a-${k}`;
export const cellId = (j: number) => `b-${j}`;
const spaced = (xs: readonly string[]) => xs.join(' ');
const wordTotal = (ws: readonly WordCount[]) => ws.reduce((t, w) => t + w.count, 0);
const times = (w: WordCount) => (w.count > 1 ? `${w.word} ×${w.count}` : w.word);

export function baseVars(s: S): Record<string, Scalar> {
  return {
    vocabulary: s.vocab.pieces.length,
    letters: letters(s.vocab),
    longer: multi(s.vocab),
    rounds: s.rounds,
    L: Number(corpusLoss(s.words, s.vocab).toFixed(1)),
  };
}

const err = (s: S, message: string): UStep => ({
  state: s,
  marks: [],
  say: message,
  lines: [],
  level: 1,
  vars: baseVars(s),
});

function seedSay(s: S): string {
  const n = wordTotal(s.words);
  const top = s.vocab.pieces
    .filter((p) => !isLetter(p))
    .slice(0, 3)
    .map((p) => `${p.t} (${p.count})`);
  return `${s.words.length === 1 ? 'One word' : `${s.words.length} different words`}${n > s.words.length ? ` (${n} in all)` : ''}. The seed vocabulary has the ${letters(s.vocab)} letters and the ${s.seeded} most frequent longer substrings${top.length ? `, starting with ${top.join(', ')}` : ''}. Each piece's probability is its count over the total, ${s.vocab.total}.`;
}

// ---------------------------------------------------------------------------------------------
// Encode

function* bestSteps(s: S, word: string): Generator<UStep, Encoding, void> {
  const b = viterbi(word, s.vocab);
  const n = word.length;
  const vals: (number | null)[] = Array(n).fill(null);
  const shown: S = { ...s, mode: 'encode' };
  const work = (path: number[] = []): X => ({
    enc: { word, arcs: b.arcs, vals: [...vals], kind: 'best', path },
  });
  const vars = (j: number) => ({ ...baseVars(s), position: j, pieces: b.arcs.length });
  const unk = b.arcs.filter((a) => a.unk).length;
  yield {
    state: shown,
    marks: b.arcs.map((_, k) => mark(arcId(k), 'new')),
    say: `The lattice of ${word}: every piece of the vocabulary that occurs in it, ${b.arcs.length} in all, each with its log-probability.${unk ? ` ${unk === 1 ? 'One letter is' : `${unk} letters are`} not in the vocabulary, so ${UNK} stands in, ${UNK_SAY}.` : ''} A split is a path from the first letter to the last. Viterbi finds the most probable path, one position at a time.`,
    lines: ['lat', 'b0'],
    level: 2,
    vars: vars(0),
    extra: work(),
  };
  for (let j = 1; j <= n; j++) {
    const into = b.arcs.map((a, k) => ({ a, k })).filter(({ a }) => a.to === j);
    const k = b.back[j]!;
    vals[j - 1] = b.best[j]!;
    const terms = into.map(({ a }) =>
      a.from === 0
        ? `log p(${a.t}) = ${two(a.logp)}`
        : `best[${a.from}] + log p(${a.t}) = ${two(b.best[a.from]!)} − ${two(-a.logp)} = ${two(b.best[a.from]! + a.logp)}`,
    );
    yield {
      state: shown,
      marks: [
        ...into.map(({ k: i }) => mark(arcId(i), i === k ? 'active' : 'compare')),
        mark(cellId(j), 'active'),
      ],
      say:
        into.length === 1
          ? `best[${j}], for ${word.slice(0, j)}: one piece ends here. ${terms[0]}.`
          : `best[${j}], for ${word.slice(0, j)}: ${into.length} pieces end here. ${terms.join('; ')}. Keep the largest, ${two(b.best[j]!)}, through ${b.arcs[k]!.t}.`,
      lines: ['for', 'max'],
      level: 2,
      vars: vars(j),
      extra: work(),
    };
  }
  const path = b.split.map((a) => b.arcs.indexOf(a));
  yield {
    state: shown,
    marks: path.map((k) => mark(arcId(k), 'found')),
    say: `Walk back from the end: best[${n}] came through ${b.split.at(-1)!.t}${b.split.length > 1 ? `, and so on back to the start` : ''}. The pieces: ${spaced(b.split.map((a) => a.t))}.`,
    lines: ['back'],
    level: 2,
    vars: vars(n),
    extra: work(path),
  };
  return { word, pieces: b.split.map((a) => a.t), score: b.score, sampled: false };
}

function* sampleSteps(
  s: S,
  word: string,
  alpha: number,
  next: () => number,
): Generator<UStep, Encoding, void> {
  const r = sampleSplit(word, s.vocab, alpha, next);
  const { arcs, a } = r.fwd;
  const n = word.length;
  const vals: (number | null)[] = Array(n).fill(null);
  const shown: S = { ...s, mode: 'encode' };
  const work = (path: number[] = []): X => ({
    enc: { word, arcs, vals: [...vals], kind: 'sum', path },
  });
  const vars = (j: number) => ({ ...baseVars(s), position: j, pieces: arcs.length });
  const pow = alpha === 1 ? 'p' : `p^${alpha}`;
  yield {
    state: shown,
    marks: arcs.map((_, k) => mark(arcId(k), 'new')),
    say: `The lattice of ${word}: ${arcs.length} pieces. To sample a split instead of taking the best, first add up every path: A[j] is the log of the total of ${pow} over all the splits of the first j letters. It is Viterbi with the max replaced by a sum.`,
    lines: ['lat', 'a0'],
    level: 2,
    vars: vars(0),
    extra: work(),
  };
  for (let j = 1; j <= n; j++) {
    vals[j - 1] = a[j]!;
    const into = arcs.map((x, k) => ({ x, k })).filter(({ x }) => x.to === j);
    yield {
      state: shown,
      marks: [...into.map(({ k }) => mark(arcId(k), 'compare')), mark(cellId(j), 'active')],
      say: `A[${j}] adds up the ${into.length} way${into.length === 1 ? '' : 's'} in: ${into.map(({ x }) => x.t).join(', ')}. A[${j}] = ${two(a[j]!)}.`,
      lines: ['afor', 'asum'],
      level: 3,
      vars: vars(j),
      extra: work(),
    };
  }
  const path: number[] = [];
  for (const d of r.draws) {
    const k = d.options[d.at]!;
    path.unshift(k);
    const opts = d.options.map((o, i) => `${arcs[o]!.t} ${two(d.chance[i]!)}`).join(', ');
    yield {
      state: shown,
      marks: [
        ...d.options.map((o) => mark(arcId(o), o === k ? 'active' : 'compare')),
        ...path.map((o) => mark(arcId(o), 'found')).filter((m) => m.id !== arcId(k)),
      ],
      say:
        d.options.length === 1
          ? `At position ${d.to} only ${arcs[k]!.t} comes in, so it is taken.`
          : `At position ${d.to}, the pieces that end here have chances ${opts}. Draw u = ${round3(d.u)}: it lands in ${arcs[k]!.t}.`,
      lines: ['draw', 'step'],
      level: 2,
      vars: vars(d.to),
      extra: work([...path]),
    };
  }
  return { word, pieces: r.split.map((x) => x.t), score: r.score, sampled: true };
}

const encodeOp: Op = {
  label: 'Encode',
  arity: 1,
  *run(s, args, { settings, rng }) {
    const word = readEncodeWord(args[0]);
    if (word instanceof Error) {
      yield err(s, word.message);
      return s;
    }
    const sampled = settings.split === 'sample';
    const enc = sampled
      ? yield* sampleSteps(s, word, alphaOf(settings), () => rng.next())
      : yield* bestSteps(s, word);
    const next: S = {
      ...s,
      mode: 'encode',
      encodings: [...s.encodings, enc].slice(-KEEP_ENC),
    };
    const arcs = lattice(word, s.vocab);
    const path = enc.pieces.reduce<number[]>((acc, t) => {
      const from = acc.length ? arcs[acc.at(-1)!]!.to : 0;
      acc.push(arcs.findIndex((a) => a.from === from && a.t === t));
      return acc;
    }, []);
    const best = viterbi(word, s.vocab);
    const same = spaced(best.split.map((a) => a.t)) === spaced(enc.pieces);
    yield {
      state: next,
      marks: path.map((k) => mark(arcId(k), 'found')),
      say: sampled
        ? `${word} → ${spaced(enc.pieces)}, log-probability ${two(enc.score)}. ${same ? 'This time the draw gave the best split.' : `The best split is ${spaced(best.split.map((a) => a.t))} (${two(best.score)}); training on sampled splits shows the model other ways to cut the same word.`} Encode again for another draw.`
        : `${word} → ${spaced(enc.pieces)}: ${enc.pieces.length} piece${enc.pieces.length === 1 ? '' : 's'}, log-probability ${two(enc.score)}, the largest of any split.`,
      lines: ['ret'],
      level: 1,
      vars: { ...baseVars(next), score: Number(enc.score.toFixed(2)) },
      extra: {
        enc: {
          word,
          arcs,
          vals: sampled ? forward(word, s.vocab, alphaOf(settings)).a.slice(1) : best.best.slice(1),
          kind: sampled ? 'sum' : 'best',
          path,
        },
      },
    };
    return next;
  },
};

// ---------------------------------------------------------------------------------------------
// Prune

function resplitSay(s: S, l: PieceLoss): string {
  if (!l.resplits.length)
    return `${l.t}: no best split uses it, so removing it costs nothing. Loss 0.`;
  const parts = l.resplits.slice(0, 3).map((r) => {
    const w = s.words[r.row]!;
    return `${times(w)} goes from ${spaced(r.before)} to ${spaced(r.after)} (${two(r.cost)})`;
  });
  const more = l.resplits.length > 3 ? ` and ${l.resplits.length - 3} more` : '';
  return `${l.t}: without it, ${parts.join('; ')}${more}. Loss ${two(l.loss)}.`;
}

/** One round's steps, from state `s`; returns the state after it. */
function* roundSteps(s: S, floor: number, fine: boolean): Generator<UStep, S | null, void> {
  const n = multi(s.vocab);
  const count = toRemove(n, floor);
  if (n === 0 || count === 0) return null;
  const r = pruneRound(s.words, s.vocab, floor);
  const shown: S = { ...s, mode: 'prune' };
  const rows: TableRow[] = r.losses.map(({ t, count, logp }) => ({ t, count, logp }));
  const loss = new Map<string, number>();
  const vars = () => ({ ...baseVars(s), removing: count });
  const round = s.rounds + 1;
  const work = (o: Partial<PruneWork> = {}): X => ({
    prune: { rows, loss: new Map(loss), removed: [], round, ...o },
  });
  yield {
    state: shown,
    marks: rows.map((row) => mark(rowId(row.t), 'active')),
    say: `Round ${round}. The text's loss L (minus its log-likelihood under the best splits) is ${two(corpusLoss(s.words, s.vocab))}. For each of the ${n} pieces of two or more letters, ask: how much larger would L be without it? Letters always stay, so every word keeps a split.`,
    lines: ['psig', 'pfor'],
    level: fine ? 2 : 3,
    vars: vars(),
    extra: work(),
  };
  for (const l of r.losses) {
    loss.set(l.t, l.loss);
    yield {
      state: shown,
      marks: [mark(rowId(l.t), 'active')],
      say: resplitSay(s, l),
      lines: ['pfor', 'ploss'],
      level: fine && l.resplits.length ? 2 : 3,
      vars: vars(),
      extra: work({ focus: l }),
    };
  }
  const byT = new Map(rows.map((row) => [row.t, row]));
  const sorted = [...r.order].reverse().map((l) => byT.get(l.t)!);
  yield {
    state: shown,
    marks: r.removed.map((t) => mark(rowId(t), 'remove')),
    say: `Sort by loss. Keep the best ${Math.round(100 * (1 - count / n))}% (${n - count} of ${n}) and remove the ${count} that cost least: ${r.removed.join(', ')}.`,
    lines: ['psort', 'pcut'],
    level: fine ? 2 : 3,
    vars: vars(),
    extra: work({ rows: sorted, removed: r.removed }),
  };
  return {
    ...s,
    vocab: r.after,
    rounds: s.rounds + 1,
    mode: 'prune',
    round: { rows: sorted, loss, removed: r.removed, round },
  };
}

const pruneOp: Op = {
  label: 'Prune once',
  arity: 0,
  *run(s) {
    const next = yield* roundSteps(s, 0, true);
    if (!next) {
      yield err(s, 'Nothing to prune: only letters are left, and letters always stay.');
      return s;
    }
    yield {
      state: next,
      marks: next.round!.removed.map((t) => mark(rowId(t), 'remove')),
      say: `Removed ${spaced(next.round!.removed)}. The counts of the pieces left add up to ${next.vocab.total}, so every probability goes up a little. L is now ${two(corpusLoss(next.words, next.vocab))}.`,
      lines: ['prenorm'],
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
    let st = loadState(s.text, settings) as S;
    const target = Math.max(0, Math.round(settings.target));
    yield {
      state: { ...st, mode: 'prune' },
      marks: [],
      say: `Start again from the seed: ${st.seeded} pieces of two or more letters. Prune until at most ${target} are left.`,
      lines: ['tsig', 'tseed'],
      level: 2,
      vars: baseVars(st),
    };
    const removed: string[] = [];
    while (multi(st.vocab) > target) {
      const next = yield* roundSteps(st, target, false);
      if (!next) break;
      removed.push(...next.round!.removed);
      st = next;
      yield {
        state: st,
        marks: st.round!.removed.map((t) => mark(rowId(t), 'remove')),
        say: `Round ${st.rounds} removed ${spaced(st.round!.removed)}. ${multi(st.vocab)} pieces of two or more letters are left; L = ${two(corpusLoss(st.words, st.vocab))}.`,
        lines: ['tloop', 'prenorm'],
        level: 2,
        vars: baseVars(st),
      };
    }
    const kept = st.vocab.pieces.filter((p) => !isLetter(p)).map((p) => p.t);
    st = { ...st, mode: 'vocab' };
    yield {
      state: st,
      marks: kept.map((t) => mark(pieceId(t), 'found')),
      say: st.rounds
        ? `Trained in ${st.rounds} round${st.rounds === 1 ? '' : 's'}: the vocabulary is the ${letters(st.vocab)} letters and ${kept.length} longer pieces (${spaced(kept)}). Type a word and press Encode.`
        : `The seed already has at most ${target} pieces of two or more letters, so there is nothing to prune.`,
      lines: ['tret'],
      level: 1,
      vars: baseVars(st),
    };
    return st;
  },
};

const loadOp: Op = {
  label: 'Load text',
  arity: 1,
  *run(s, args, { settings }) {
    const next = loadState(args[0], settings);
    if (next instanceof Error) {
      yield err(s, next.message);
      return s;
    }
    yield {
      state: next,
      marks: next.vocab.pieces.map((p) => mark(pieceId(p.t), 'new')),
      say: `${seedSay(next)} Press Train to prune it down, or Encode a word.`,
      lines: ['lsig', 'lchars', 'lsubs', 'lprob'],
      level: 1,
      vars: baseVars(next),
    };
    return next;
  },
};

export const ops = { load: loadOp, encode: encodeOp, prune: pruneOp, train: trainOp };

// ---------------------------------------------------------------------------------------------
// Pseudocode

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(set: UniSettings): PseudoBlock[] {
  const sample = set.split === 'sample';
  const a = alphaOf(set);
  const pow = a === 1 ? 'log p(x)' : `${a} · log p(x)`;
  const encode = sample
    ? [
        L('esig', 0, `SAMPLE-SPLIT(w, α = ${a})`, 'Draw a split of a word at random:'),
        L(
          'lat',
          1,
          'lattice = every piece x of V at every place in w',
          'Find every piece of the vocabulary inside the word.',
        ),
        L('a0', 1, 'A[0] = 0', 'Nothing read yet: one way, log 1 = 0.'),
        L('afor', 1, 'for j = 1 to n', 'For each position, left to right:'),
        L(
          'asum',
          2,
          `A[j] = log Σ over x = w[i..j) of e^(A[i] + ${pow})`,
          'add up every way to reach it, instead of keeping the best.',
        ),
        L('draw', 1, 'j = n; while j > 0:', 'From the end, walk back:'),
        L(
          'step',
          2,
          `draw x = w[i..j) with chance e^(A[i] + ${pow} − A[j]); j = i`,
          'draw one of the pieces that end here, by how much of the total it carries.',
        ),
        L('ret', 1, 'return the pieces drawn', 'Those pieces are the split.'),
      ]
    : [
        L('esig', 0, 'VITERBI(w)', 'Find the most probable split of a word:'),
        L(
          'lat',
          1,
          'lattice = every piece x of V at every place in w',
          'Find every piece of the vocabulary inside the word.',
        ),
        L('b0', 1, 'best[0] = 0', 'Nothing read yet: log 1 = 0.'),
        L('for', 1, 'for j = 1 to n', 'For each position, left to right:'),
        L(
          'max',
          2,
          'best[j] = max over x = w[i..j) of best[i] + log p(x); back[j] = x',
          'try every piece that ends here; keep the best total, and remember the piece.',
        ),
        L('back', 1, 'walk back[] from n to 0', 'From the end, follow the pieces back.'),
        L(
          'ret',
          1,
          'return the pieces, with log P = best[n]',
          'Those pieces are the best split; best[n] is its log-probability.',
        ),
      ];
  const prune = (d: number) => [
    L('pfor', d, 'for each piece x of two or more letters', 'For each piece longer than a letter:'),
    L(
      'ploss',
      d + 1,
      'loss(x) = L(V − x) − L(V), L = −Σ_w count(w) · best(w)',
      'how much worse the text is explained without it.',
    ),
    L('psort', d, 'sort the pieces by loss', 'Sort them by that loss.'),
    L(
      'pcut',
      d,
      'keep the best 80% (rounded down); remove the rest',
      'Drop the fifth or so that cost least; letters always stay.',
    ),
    L(
      'prenorm',
      d,
      'p(x) = count(x) / Σ count over V',
      'Share the probability out again over what is left.',
    ),
  ];
  return [
    {
      op: 'load',
      lines: [
        L('lsig', 0, 'LOAD(text)', 'Build the seed vocabulary from a text:'),
        L('lchars', 1, 'V = every letter in the text', 'Every letter is a piece,'),
        L(
          'lsubs',
          1,
          `V += the ${set.seed} most frequent substrings of 2+ letters (count ≥ 2)`,
          `and so are the ${set.seed} most common longer substrings.`,
        ),
        L(
          'lprob',
          1,
          'p(x) = count(x) / Σ count over V',
          'A piece’s probability is how often it occurs, over the total.',
        ),
      ],
    },
    { op: 'encode', lines: encode },
    {
      op: 'prune',
      lines: [L('psig', 0, 'PRUNE(V)', 'One pruning round:'), ...prune(1)],
    },
    {
      op: 'train',
      lines: [
        L('tsig', 0, `TRAIN(text, target = ${set.target})`, 'Train the tokenizer:'),
        L('tseed', 1, 'V = LOAD(text)', 'Start from the big seed vocabulary.'),
        L(
          'tloop',
          1,
          `while V has more than ${set.target} pieces of 2+ letters`,
          `Until only ${set.target} longer pieces are left:`,
        ),
        L('psig', 2, 'PRUNE(V)', 'prune once:'),
        ...prune(2),
        L('tret', 1, 'return V', 'What is left is the tokenizer.'),
      ],
    },
  ];
}

// ---------------------------------------------------------------------------------------------
// Words for screen readers and narration

export function initialSay(s: S): string {
  return `The toy corpus. ${seedSay(s)} Type a word and press Encode to find its best split, or press Train.`;
}

export const initialVars = (s: S) => baseVars(s);

export function describe(s: S): string {
  const v = s.vocab.pieces.map((p) => `${p.t} ${two(p.logp)}`).join(', ');
  const enc = s.encodings.length
    ? ` Encoded: ${s.encodings.map((e) => `${e.word} → ${spaced(e.pieces)} (${two(e.score)})`).join('; ')}.`
    : '';
  return `Unigram tokenizer after ${s.rounds} pruning round${s.rounds === 1 ? '' : 's'}. Vocabulary with log-probabilities: ${v}.${enc}`;
}
