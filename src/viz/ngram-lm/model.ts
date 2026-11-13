/**
 * An n-gram language model (SLP3 chapter 3) trained on the toy corpus (src/viz/_lm/corpus.ts).
 * Each sentence gets n − 1 start markers <s> and one end marker </s>; the model counts every
 * run of n tokens and predicts a word from the n − 1 before it:
 *
 *   P(w | context) = (C(context w) + k) / (C(context) + k·V)
 *
 * with k = 0 (no smoothing: maximum likelihood, so an n-gram never seen gets 0), k = 1 (Laplace)
 * or k = 0.1 (add-k). V counts the words that can come next: every word of the corpus and </s>.
 *
 * Perplexity of a sentence of N predicted tokens (its words and </s>, not <s>):
 *   PP = P(w_1 … w_N)^(−1/N) = exp(−(1/N) Σ ln P(w_i | context_i))
 *
 * Generation draws one uniform u per word and lays the next-word probabilities end to end,
 * most likely first, ties alphabetical (src/viz/_decode/draw.ts), until </s> or ten words.
 *
 * Operations: count (walk the corpus, counting), counts (the words seen after a context),
 * next (counts turned into probabilities), generate, and score (the perplexity of a sentence).
 */
import type { Mark, OpSpec, PseudoBlock, Scalar } from '../../engine/types';
import { CORPUS } from '../_lm/corpus';
import { round3, two } from '../_lm/numbers';
import { pickByU } from '../_decode/draw';

export const BOS = '<s>';
export const EOS = '</s>';
export const MAX_WORDS = 10;
export const MAX_GEN = 10;

export type Smoothing = 'none' | 'laplace' | 'add-k';

export interface LmSettings {
  [key: string]: Scalar;
  n: string;
  smoothing: Smoothing;
}

export const defaults: LmSettings = { n: '2', smoothing: 'none' };

export const orderOf = (s: LmSettings): number => (s.n === '3' ? 3 : 2);
export const kOf = (s: LmSettings): number =>
  s.smoothing === 'laplace' ? 1 : s.smoothing === 'add-k' ? 0.1 : 0;

// ---------------------------------------------------------------------------------------------
// Counting

export interface Counts {
  n: number;
  /** Context (its words joined by spaces) → next word → count. */
  table: Map<string, Map<string, number>>;
  totals: Map<string, number>;
  /** Every word that can come next, </s> included, alphabetical. */
  vocab: string[];
  /** The corpus's words (what a learner may type). */
  words: Set<string>;
  /** n-grams counted. */
  tokens: number;
  /** Every n-gram ("<s> the cat") with its count, most common first. */
  ngrams: [string, number][];
}

/** A sentence's tokens with its markers: n − 1 starts, its words, one end. */
export const padded = (words: readonly string[], n: number): string[] => [
  ...Array<string>(n - 1).fill(BOS),
  ...words,
  EOS,
];

const memo = new Map<number, Counts>();

export function countsFor(n: number): Counts {
  const hit = memo.get(n);
  if (hit) return hit;
  const table = new Map<string, Map<string, number>>();
  const totals = new Map<string, number>();
  const grams = new Map<string, number>();
  const words = new Set<string>();
  const vocab = new Set<string>();
  let tokens = 0;
  for (const s of CORPUS) {
    const ws = s.split(' ');
    ws.forEach((w) => words.add(w));
    const t = padded(ws, n);
    for (let i = n - 1; i < t.length; i++) {
      const ctx = t.slice(i - n + 1, i).join(' ');
      const w = t[i]!;
      const row = table.get(ctx) ?? new Map<string, number>();
      row.set(w, (row.get(w) ?? 0) + 1);
      table.set(ctx, row);
      totals.set(ctx, (totals.get(ctx) ?? 0) + 1);
      const g = `${ctx} ${w}`;
      grams.set(g, (grams.get(g) ?? 0) + 1);
      vocab.add(w);
      tokens++;
    }
  }
  const out: Counts = {
    n,
    table,
    totals,
    vocab: [...vocab].sort(alpha),
    words,
    tokens,
    ngrams: [...grams].sort(byCount),
  };
  memo.set(n, out);
  return out;
}

const alpha = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
/** Most common first, then alphabetical. */
export const byCount = (a: [string, number], b: [string, number]) =>
  b[1] - a[1] || alpha(a[0], b[0]);

/** The next-word distribution after a context, under add-k smoothing (k = 0: none). */
export interface Dist {
  context: string[];
  total: number;
  k: number;
  V: number;
  /** Words seen after the context: count and probability, most likely first. */
  seen: { word: string; count: number; p: number }[];
  /** Words never seen after it, alphabetical, and the probability each gets (0 without smoothing). */
  unseen: string[];
  pUnseen: number;
  /** Every word with a probability above 0, in draw order, and the probabilities. */
  order: string[];
  p: number[];
}

export function prob(c: Counts, context: readonly string[], word: string, k: number): number {
  const ctx = context.join(' ');
  const total = c.totals.get(ctx) ?? 0;
  const denominator = total + k * c.vocab.length;
  if (denominator === 0) return 0;
  return ((c.table.get(ctx)?.get(word) ?? 0) + k) / denominator;
}

export function dist(c: Counts, context: readonly string[], k: number): Dist {
  const ctx = context.join(' ');
  const row = c.table.get(ctx) ?? new Map<string, number>();
  const total = c.totals.get(ctx) ?? 0;
  const all = c.vocab.map((w) => ({ word: w, count: row.get(w) ?? 0, p: prob(c, context, w, k) }));
  const live = all.filter((r) => r.p > 0).sort((a, b) => b.p - a.p || alpha(a.word, b.word));
  return {
    context: [...context],
    total,
    k,
    V: c.vocab.length,
    seen: live.filter((r) => r.count > 0),
    unseen: all.filter((r) => r.count === 0).map((r) => r.word),
    pUnseen: k > 0 ? prob(c, context, '\u0000', k) : 0,
    order: live.map((r) => r.word),
    p: live.map((r) => r.p),
  };
}

// ---------------------------------------------------------------------------------------------
// Input

/** Words in order, lower case; an Error says what is wrong. */
export function parseWords(text: string, max = MAX_WORDS): string[] | Error {
  const words = text
    .toLowerCase()
    .replace(/[.,!?;:"']/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return new Error('Type some words first, such as "the cat".');
  if (words.length > max) return new Error(`Keep it to ${max} words.`);
  const known = countsFor(2).words;
  const bad = words.find((w) => !known.has(w));
  if (bad)
    return new Error(
      `"${bad}" never appears in the corpus, so the model has no counts for it. Use its words, such as the, cat, dog, sat, on, mat, ran, saw.`,
    );
  return words;
}

/** The n − 1 words before the next one: the last words typed, with <s> in front when short. */
export function contextOf(words: readonly string[], n: number): string[] {
  const t = [...Array<string>(n - 1).fill(BOS), ...words];
  return t.slice(t.length - (n - 1));
}

// ---------------------------------------------------------------------------------------------
// State and pictures

export type LmView =
  | { kind: 'corpus' }
  | { kind: 'top' }
  | { kind: 'counts'; context: string[] }
  | { kind: 'next'; context: string[] }
  | { kind: 'generate'; words: string[]; us: number[]; ended: boolean }
  | { kind: 'score'; words: string[]; probs: number[]; logSum: number; pp: number };

export interface LmState {
  view: LmView;
}

/** The strip of tokens at the top. */
export interface Strip {
  tokens: string[];
  /** The window: context cells from..to−1, the predicted token at `to`. */
  window?: [number, number];
  /** Under each token, its probability (null: not scored). */
  probs?: (number | null)[];
  /** A "?" cell after the tokens: the word to predict. */
  ask?: boolean;
  /** Keep room for this many cells, so a strip that grows does not move the camera. */
  reserve?: number;
}

export type Table =
  | { kind: 'top'; rows: [string, number][]; current?: string; max: number }
  | { kind: 'counts'; dist: Dist }
  | { kind: 'probs'; dist: Dist; word?: string; u?: number; pick?: string };

export interface LmPicture {
  strip?: Strip;
  table?: Table;
}

export interface LmExtra {
  picture?: LmPicture;
}

type S = LmState;
type X = LmExtra;
type Op = OpSpec<S, LmSettings, X>;

const topRows = (c: Counts, size = 10): [string, number][] => c.ngrams.slice(0, size);
export const maxCount = (c: Counts) => c.ngrams[0]?.[1] ?? 1;

/** What the picture shows for a state, with no step in progress. */
export function pictureOf(s: S, settings: LmSettings): LmPicture {
  const n = orderOf(settings);
  const c = countsFor(n);
  const k = kOf(settings);
  const v = s.view;
  switch (v.kind) {
    case 'corpus':
      return {};
    case 'top':
      return { table: { kind: 'top', rows: topRows(c), max: maxCount(c) } };
    case 'counts':
      return {
        strip: { tokens: v.context, ask: true },
        table: { kind: 'counts', dist: dist(c, v.context, k) },
      };
    case 'next':
      return {
        strip: { tokens: v.context, ask: true },
        table: { kind: 'probs', dist: dist(c, v.context, k) },
      };
    case 'generate': {
      const t = padded(v.words, n);
      const tokens = v.ended ? t : t.slice(0, -1);
      return { strip: { tokens, reserve: n + MAX_GEN } };
    }
    case 'score': {
      const t = padded(v.words, n);
      return {
        strip: { tokens: t, probs: [...Array<null>(n - 1).fill(null), ...v.probs] },
      };
    }
  }
}

export const init = (): S => ({ view: { kind: 'corpus' } });

// ---------------------------------------------------------------------------------------------
// Steps

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });
const quote = (ws: readonly string[]) => `"${ws.join(' ')}"`;
/** A token or an n-gram as a shape id: "<s> the" → "bos_the". */
export const keyOf = (w: string) =>
  w
    .split(' ')
    .map((t) => (t === EOS ? 'eos' : t === BOS ? 'bos' : t))
    .join('_');
const pct = (x: number) => two(x);

export function baseVars(settings: LmSettings): Record<string, Scalar> {
  const c = countsFor(orderOf(settings));
  return { n: c.n, sentences: CORPUS.length, 'n-grams': c.tokens, V: c.vocab.length };
}

function say1(d: Dist): string {
  const list = d.seen
    .slice(0, 4)
    .map((r) => `${r.word} ${r.count}`)
    .join(', ');
  return `${list}${d.seen.length > 4 ? ' and so on' : ''}`;
}

function countsSay(d: Dist): string {
  if (d.total === 0)
    return `${quote(d.context)} never appears in the corpus with a word after it, so there is nothing to count.`;
  return `After ${quote(d.context)} the corpus has ${d.total} ${d.total === 1 ? 'word' : 'words'}, ${d.seen.length} different: ${say1(d)}. That is C(${d.context.join(' ')} w) for each w.`;
}

function probsSay(d: Dist): string {
  const ctx = d.context.join(' ');
  if (d.total === 0 && d.k === 0)
    return `${quote(d.context)} was never seen, so every count is 0 and so is the total: 0/0. Without smoothing the model has nothing to say after it.`;
  const top = d.seen[0];
  if (d.k === 0)
    return `Divide each count by C(${ctx}) = ${d.total}: ${d.seen
      .slice(0, 3)
      .map((r) => `${r.word} ${r.count}/${d.total} = ${pct(r.p)}`)
      .join(
        ', ',
      )}${d.seen.length > 3 ? ' and so on' : ''}. The other ${d.unseen.length} words never followed it, so they get 0.`;
  const lead = top
    ? `${top.word} gets (${top.count} + ${d.k}) / (${d.total} + ${d.k} × ${d.V}) = ${pct(top.p)}`
    : `every word gets ${d.k} / (0 + ${d.k} × ${d.V}) = 1/${d.V}`;
  return `Add ${d.k} to every count, and ${d.k} × V = ${round(d.k * d.V)} to the total, so no word gets 0: ${lead}. Each of the ${d.unseen.length} unseen words gets ${pct(d.pUnseen)}, ${pct(d.pUnseen * d.unseen.length)} in all.`;
}

const round = (x: number) => String(Math.round(x * 100) / 100);

/** The walk over the corpus, counting. */
const countOp: Op = {
  label: 'Count',
  arity: 0,
  *run(s, _args, { settings }) {
    const n = orderOf(settings);
    const c = countsFor(n);
    const grams = new Map<string, number>();
    let tokens = 0;
    const vars = () => ({ ...baseVars(settings), 'n-grams': tokens, distinct: grams.size });
    const board = (current?: string): Table => {
      const sorted = [...grams].sort(byCount);
      const rows = sorted.slice(0, 9);
      if (current && !rows.some(([g]) => g === current)) rows.push([current, grams.get(current)!]);
      else if (sorted[9]) rows.push(sorted[9]);
      return { kind: 'top', rows, current, max: maxCount(c) };
    };
    const reserve = Math.max(...CORPUS.map((x) => x.split(' ').length)) + n;
    for (const [k, sentence] of CORPUS.entries()) {
      const t = padded(sentence.split(' '), n);
      yield {
        state: s,
        marks: [],
        say: `Sentence ${k + 1} of ${CORPUS.length}: ${t.join(' ')}. Slide a window of ${n} tokens along it and count each ${n === 2 ? 'pair' : 'triple'}.`,
        lines: ['for', 'pad'],
        level: 2,
        vars: vars(),
        extra: { picture: { strip: { tokens: t, reserve }, table: board() } },
      };
      for (let i = n - 1; i < t.length; i++) {
        const g = t.slice(i - n + 1, i + 1).join(' ');
        grams.set(g, (grams.get(g) ?? 0) + 1);
        tokens++;
        yield {
          state: s,
          marks: [
            mark(`s-${i}`, 'active'),
            mark(`p-${keyOf(g)}`, 'active'),
            mark(`w-${keyOf(g)}`, 'active'),
          ],
          say: `C(${g}) = ${grams.get(g)}${grams.get(g) === 1 ? ': a new n-gram' : ''}.`,
          lines: ['count'],
          level: 3,
          vars: vars(),
          extra: {
            picture: { strip: { tokens: t, window: [i - n + 1, i], reserve }, table: board(g) },
          },
        };
      }
    }
    const next: S = { view: { kind: 'top' } };
    const top = c.ngrams.slice(0, 3).map(([g, x]) => `${g} (${x})`);
    yield {
      state: next,
      marks: [],
      say: `Counted ${CORPUS.length} sentences: ${c.tokens} ${n === 2 ? 'bigrams' : 'trigrams'}, ${c.ngrams.length} different. The most common: ${top.join(', ')}. These counts are the whole model.`,
      lines: ['ret'],
      level: 1,
      vars: { ...baseVars(settings), distinct: c.ngrams.length },
    };
    return next;
  },
};

function readContext(arg: unknown, n: number): string[] | Error {
  const words = parseWords(String(arg));
  return words instanceof Error ? words : contextOf(words, n);
}

const countsOp: Op = {
  label: 'Counts',
  arity: 1,
  *run(s, args, { settings }) {
    const n = orderOf(settings);
    const ctx = readContext(args[0], n);
    if (ctx instanceof Error) {
      yield {
        state: s,
        marks: [],
        say: ctx.message,
        lines: [],
        level: 1,
        vars: baseVars(settings),
      };
      return s;
    }
    const d = dist(countsFor(n), ctx, kOf(settings));
    const next: S = { view: { kind: 'counts', context: ctx } };
    yield {
      state: next,
      marks: d.seen.slice(0, 1).map((r) => mark(`c-${keyOf(r.word)}`, 'found')),
      say: countsSay(d),
      lines: ['look'],
      level: 1,
      vars: { ...baseVars(settings), [`C(${ctx.join(' ')})`]: d.total },
    };
    return next;
  },
};

const nextOp: Op = {
  label: 'Next word',
  arity: 1,
  *run(s, args, { settings }) {
    const n = orderOf(settings);
    const ctx = readContext(args[0], n);
    if (ctx instanceof Error) {
      yield {
        state: s,
        marks: [],
        say: ctx.message,
        lines: [],
        level: 1,
        vars: baseVars(settings),
      };
      return s;
    }
    const c = countsFor(n);
    const d = dist(c, ctx, kOf(settings));
    const vars = { ...baseVars(settings), [`C(${ctx.join(' ')})`]: d.total };
    yield {
      state: s,
      marks: [],
      say: countsSay(d),
      lines: ['look'],
      level: 2,
      vars,
      extra: { picture: { strip: { tokens: ctx, ask: true }, table: { kind: 'counts', dist: d } } },
    };
    const next: S = { view: { kind: 'next', context: ctx } };
    yield {
      state: next,
      marks: d.seen.slice(0, 1).map((r) => mark(`p-${keyOf(r.word)}`, 'found')),
      say: probsSay(d),
      lines: ['prob'],
      level: 1,
      vars,
    };
    return next;
  },
};

const generateOp: Op = {
  label: 'Generate',
  arity: 0,
  *run(s, _args, { settings, rng }) {
    const n = orderOf(settings);
    const c = countsFor(n);
    const k = kOf(settings);
    let ctx = Array<string>(n - 1).fill(BOS);
    const words: string[] = [];
    const us: number[] = [];
    let ended = false;
    const vars = () => ({ ...baseVars(settings), words: words.length });
    while (words.length < MAX_GEN) {
      const d = dist(c, ctx, k);
      const tokens = padded(words, n).slice(0, -1);
      const reserve = n + MAX_GEN;
      if (d.order.length === 0) break;
      yield {
        state: s,
        marks: [],
        say: `After ${quote(ctx)}: ${d.order
          .slice(0, 3)
          .map((w, i) => `${w} ${pct(d.p[i]!)}`)
          .join(', ')}${d.order.length > 3 ? ' and so on' : ''}.`,
        lines: ['dist'],
        level: 3,
        vars: vars(),
        extra: {
          picture: { strip: { tokens, ask: true, reserve }, table: { kind: 'probs', dist: d } },
        },
      };
      const u = rng.next();
      us.push(u);
      const pick = pickByU(
        d.p,
        d.order.map((_, i) => i),
        u,
      );
      const w = d.order[pick.at]!;
      const done = w === EOS;
      if (done) ended = true;
      else words.push(w);
      const shown = done ? padded(words, n) : padded(words, n).slice(0, -1);
      const row = rowKey(d, w);
      yield {
        state: s,
        marks: [mark(`p-${row}`, 'found'), mark(`s-${shown.length - 1}`, 'new')],
        say: `u = ${round3(u)}. Lay the probabilities end to end, most likely first: ${w} covers ${round3(pick.from[pick.at]!)} to ${round3(pick.to[pick.at]!)}, so u picks ${w}.${done ? ' The sentence ends.' : ''}`,
        lines: ['draw'],
        level: 2,
        vars: vars(),
        extra: {
          picture: {
            strip: { tokens: shown, reserve },
            table: { kind: 'probs', dist: d, u, pick: w },
          },
        },
      };
      if (done) break;
      ctx = [...ctx, w].slice(1);
    }
    const next: S = { view: { kind: 'generate', words, us, ended } };
    yield {
      state: next,
      marks: [],
      say: ended
        ? `Generated: ${words.length ? words.join(' ') : '(nothing: </s> came first)'}. ${words.length} ${words.length === 1 ? 'word' : 'words'}, each drawn from the counts of what followed the ${n === 2 ? 'word' : 'two words'} before it.`
        : `Stopped after ${MAX_GEN} words without drawing </s>: ${words.join(' ')}.`,
      lines: ['ret'],
      level: 1,
      vars: vars(),
    };
    return next;
  },
};

/** The table row a word sits in: its own, or the unseen words' row. */
export const rowKey = (d: Dist, w: string) =>
  d.seen.some((r) => r.word === w) ? keyOf(w) : 'unseen';

const scoreOp: Op = {
  label: 'Perplexity',
  arity: 1,
  *run(s, args, { settings }) {
    const words = parseWords(String(args[0]));
    if (words instanceof Error) {
      yield {
        state: s,
        marks: [],
        say: words.message,
        lines: [],
        level: 1,
        vars: baseVars(settings),
      };
      return s;
    }
    const n = orderOf(settings);
    const c = countsFor(n);
    const k = kOf(settings);
    const t = padded(words, n);
    const N = t.length - (n - 1);
    const probs: number[] = [];
    let logSum = 0;
    const vars = () => ({
      ...baseVars(settings),
      N,
      'ln P': logSum === -Infinity ? '−∞' : two(logSum),
    });
    const strip = (to?: number): Strip => ({
      tokens: t,
      probs: [
        ...Array<null>(n - 1).fill(null),
        ...probs,
        ...Array<null>(N - probs.length).fill(null),
      ],
      window: to === undefined ? undefined : [to - n + 1, to],
    });
    yield {
      state: s,
      marks: [],
      say: `Add the markers: ${t.join(' ')}. Score each of the N = ${N} tokens after the start (the ${words.length} ${words.length === 1 ? 'word' : 'words'} and </s>) by its probability given the ${n - 1 === 1 ? 'token' : `${n - 1} tokens`} before it.`,
      lines: ['pad'],
      level: 2,
      vars: vars(),
      extra: { picture: { strip: strip() } },
    };
    for (let i = n - 1; i < t.length; i++) {
      const ctx = t.slice(i - n + 1, i);
      const w = t[i]!;
      const d = dist(c, ctx, k);
      const p = prob(c, ctx, w, k);
      probs.push(p);
      logSum += Math.log(p);
      const count = c.table.get(ctx.join(' '))?.get(w) ?? 0;
      const frac =
        k === 0 ? `${count}/${d.total}` : `(${count} + ${k}) / (${d.total} + ${round(k * d.V)})`;
      yield {
        state: s,
        marks: [
          mark(`sp-${i}`, p > 0 ? 'active' : 'error'),
          mark(`p-${rowKey(d, w)}`, p > 0 ? 'active' : 'error'),
        ],
        say:
          p > 0
            ? `P(${w} | ${ctx.join(' ')}) = ${frac} = ${pct(p)}. ln ${pct(p)} = ${two(Math.log(p))}; the running total is ${logSum === -Infinity ? '−∞' : two(logSum)}.`
            : `P(${w} | ${ctx.join(' ')}) = ${d.total === 0 ? `0/0: "${ctx.join(' ')}" was never seen` : `0/${d.total}: ${w} never followed ${ctx.join(' ')} in the corpus`}. One zero makes the whole sentence impossible: ln 0 = −∞.`,
        lines: ['score'],
        level: 2,
        vars: vars(),
        extra: { picture: { strip: strip(i), table: { kind: 'probs', dist: d, word: w } } },
      };
    }
    const pp = Math.exp(-logSum / N);
    const next: S = { view: { kind: 'score', words, probs, logSum, pp } };
    yield {
      state: next,
      marks: probs.flatMap((p, j) => (p === 0 ? [mark(`sp-${j + n - 1}`, 'error')] : [])),
      say: Number.isFinite(pp)
        ? `Perplexity = exp(−ln P / N) = exp(${two(-logSum)} / ${N}) = ${two(pp)}. On average the model was as unsure as if it chose among ${two(pp)} equally likely words at each step. Lower is better.`
        : `The sentence has probability 0, so its perplexity is infinite. Without smoothing, one n-gram the corpus never had is enough. Try add-one smoothing.`,
      lines: ['pp'],
      level: 1,
      vars: { ...vars(), perplexity: Number.isFinite(pp) ? two(pp) : '∞' },
    };
    return next;
  },
};

export const ops = {
  count: countOp,
  counts: countsOp,
  next: nextOp,
  generate: generateOp,
  score: scoreOp,
};

// ---------------------------------------------------------------------------------------------
// Pseudocode

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: LmSettings): PseudoBlock[] {
  const n = orderOf(settings);
  const k = kOf(settings);
  const pad = L(
    'pad',
    1,
    n === 2 ? 'w = <s> w_1 … w_m </s>' : 'w = <s> <s> w_1 … w_m </s>',
    n === 2
      ? 'Mark where the sentence starts and ends.'
      : 'Two start marks, so the first word has a context of two.',
  );
  const probLine =
    k === 0
      ? L(
          'prob',
          1,
          'P(w | c) = C(c w) / C(c)',
          'How often w came after c, out of every time c came up.',
        )
      : L(
          'prob',
          1,
          `P(w | c) = (C(c w) + ${k}) / (C(c) + ${k}·V)`,
          `Pretend every word followed c ${k === 1 ? 'one more time' : `${k} more times`}, so none gets 0.`,
        );
  return [
    {
      op: 'count',
      lines: [
        L('sig', 0, 'COUNT(corpus)', 'Learn from the corpus by counting:'),
        L('for', 1, 'for each sentence', 'Go through every sentence,'),
        pad,
        L(
          'count',
          2,
          `for each run of ${n} tokens: C(run) += 1`,
          `count every ${n === 2 ? 'pair' : 'three'} of tokens in a row.`,
        ),
        L('ret', 1, 'return C', 'The counts are the model.'),
      ],
    },
    {
      op: 'counts',
      lines: [
        L('csig', 0, 'COUNTS(c)', 'What came after these words?'),
        L('look', 1, 'C(c w) for every word w', 'Look up how often each word followed them.'),
      ],
    },
    {
      op: 'next',
      lines: [
        L('nsig', 0, 'NEXT(c)', 'What comes next after these words?'),
        L('look', 1, 'C(c w) for every word w', 'Look up how often each word followed them,'),
        probLine,
      ],
    },
    {
      op: 'generate',
      lines: [
        L('gsig', 0, 'GENERATE()', 'Write a sentence at random:'),
        L('start', 1, n === 2 ? 'c = <s>' : 'c = <s> <s>', 'Start at the beginning of a sentence.'),
        L('dist', 1, 'repeat: P(· | c) for every word', 'Work out what could come next,'),
        L(
          'draw',
          2,
          'u = uniform(0, 1); w = the word whose stretch holds u; c = last n − 1 words',
          'pick one at random, in proportion to its probability, and move on.',
        ),
        L('ret', 1, 'until w = </s>', 'Stop when the end of sentence comes up.'),
      ],
    },
    {
      op: 'score',
      lines: [
        L('psig', 0, 'PERPLEXITY(w_1 … w_m)', 'How surprised is the model by this sentence?'),
        pad,
        L(
          'score',
          1,
          'for each token after the start: ln P(w_i | context)',
          'Find the probability of each word given the ones before it, and add up their logs.',
        ),
        probLine,
        L('pp', 1, 'return exp(−(1/N) Σ ln P)', 'Undo the log of the average: the perplexity.'),
      ],
    },
  ];
}

// ---------------------------------------------------------------------------------------------
// Words for screen readers and narration

export function initialSay(_s: S, settings: LmSettings): string {
  const c = countsFor(orderOf(settings));
  return `The corpus: ${CORPUS.length} short sentences, ${c.tokens - CORPUS.length} words. Press Count to watch the model learn by counting ${c.n === 2 ? 'pairs' : 'triples'} of words, Next word to see what follows a word, Generate to write a sentence, or Perplexity to score one.`;
}

export const initialVars = (_s: S, settings: LmSettings) => baseVars(settings);

export function describe(s: S, settings: LmSettings): string {
  const c = countsFor(orderOf(settings));
  const k = kOf(settings);
  const v = s.view;
  switch (v.kind) {
    case 'corpus':
      return `The corpus: ${CORPUS.join('. ')}.`;
    case 'top':
      return `The most common n-grams: ${topRows(c)
        .map(([g, x]) => `${g} ${x}`)
        .join(', ')}.`;
    case 'counts':
    case 'next': {
      const d = dist(c, v.context, k);
      return `After ${v.context.join(' ')}: ${d.seen.map((r) => `${r.word} ${v.kind === 'counts' ? r.count : two(r.p)}`).join(', ') || 'nothing seen'}.`;
    }
    case 'generate':
      return `Generated: ${v.words.join(' ')}${v.ended ? '.' : ' (stopped).'}`;
    case 'score':
      return `${v.words.join(' ')}: probabilities ${v.probs.map(two).join(', ')}; perplexity ${Number.isFinite(v.pp) ? two(v.pp) : 'infinite'}.`;
  }
}
