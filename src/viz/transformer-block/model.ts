/**
 * One transformer block (Vaswani et al. 2017; pre-norm as in GPT-2), followed by the
 * unembedding, on a sentence of at most seven words from the toy vocabulary
 * (src/viz/_lm/vocab.ts). The block reads the whole sentence; the page follows the last word's
 * vector, because that word's output is the guess for the word after it.
 *
 * The residual stream is 8 numbers wide. The first four are the word's embedding (animal,
 * thing, action, small); the last four start at 0 and are where the block writes its guess
 * about the next word, in the same four features. Each sublayer adds to the stream:
 *
 *   pre-norm (GPT-2 and later)            post-norm (Vaswani et al. 2017)
 *   x₁ = x + Attn(Norm(x))                x₁ = Norm(x + Attn(x))
 *   x₂ = x₁ + FFN(Norm(x₁))               x₂ = Norm(x₁ + FFN(x₁))
 *   h  = Norm(x₂)                         h  = x₂
 *   logits = h · U,  next word = the largest logit
 *
 * Norm is LayerNorm (subtract the mean, divide by the standard deviation) or RMSNorm (divide
 * by the root mean square), with γ = 1, β = 0 and ε = 10⁻⁵. The FFN is
 * act(x·W₁ + b₁)·W₂ + b₂ with ReLU or GELU (the tanh form GPT-2 uses), or SwiGLU,
 * (SiLU(x·W_g) ⊙ x·W_u)·W_d with no biases (Shazeer 2020).
 *
 * Every weight is made by hand (no training), so each one can be read:
 * - Attention: one head of width 2, computed by the self-attention page's code. A small word
 *   (an article) looks back for nouns: animals answer in the first dimension, things in the
 *   second. W_O turns what it found into a vote: after an animal, the next noun is a thing.
 * - FFN: four hidden units, one rule each: an animal is followed by an action, a thing and an
 *   action by a small word, a small word by a noun (an animal, or less strongly a thing).
 * - Unembedding U: a word's score is its embedding dotted with the next-word half, plus two
 *   direct links from the word itself: "on" after an action, "and" after a thing (bigram links,
 *   as an n-gram model has).
 *
 * The arithmetic runs in the same order as the code tabs (src/viz/_lm/numbers.ts).
 */
import type { Mark, OpSpec, PseudoBlock, Scalar, Step } from '../../engine/types';
import { matmul, short, softmax, two } from '../_lm/numbers';
import { embed, known, VOCAB } from '../_lm/vocab';
import {
  attention,
  D_K,
  parseSentence,
  START_TEXT,
  wordName,
  type AttnResult,
  type Head,
} from '../self-attention/model';

export const D = 8;
export const D_FF = 4;
export const EPS = 1e-5;
export const FEATURES = ['animal', 'thing', 'action', 'small'] as const;
/** Short column heads, this word's four features and then the next word's. */
export const HEADS = ['anim', 'thing', 'act', 'small', 'anim', 'thing', 'act', 'small'];
/** The words the unembedding scores: the toy vocabulary, in its order. */
export const OUT_WORDS: readonly string[] = Object.keys(VOCAB);

export type Order = 'pre' | 'post';
export type NormKind = 'layer' | 'rms';
export type Act = 'relu' | 'gelu' | 'swiglu';

export interface BlockSettings {
  [key: string]: Scalar;
  order: Order;
  norm: NormKind;
  act: Act;
}

export const defaults: BlockSettings = { order: 'pre', norm: 'layer', act: 'gelu' };

const zeros = (r: number, c: number) => Array.from({ length: r }, () => Array<number>(c).fill(0));

/** The attention head: an article looks back for nouns. Rows are the 8 numbers of the stream. */
export const HEAD: Head = (() => {
  const wq = zeros(D, D_K);
  const wk = zeros(D, D_K);
  const wv = zeros(D, D_K);
  for (let c = 0; c < D_K; c++) {
    wq[0]![c] = -1;
    wq[1]![c] = -1;
    wq[2]![c] = -1;
    wq[3]![c] = 1;
    wk[3]![c] = -1;
  }
  wk[0]![0] = 1;
  wk[1]![1] = 1;
  wv[0]![0] = 1;
  wv[1]![1] = 1;
  return { wq, wk, wv };
})();

/** W_O: an animal found votes "the next noun is a thing", a thing found the other way round. */
export const W_O: number[][] = (() => {
  const w = zeros(D_K, D);
  w[0]![4] = -1;
  w[0]![5] = 1;
  w[1]![4] = 1;
  w[1]![5] = -1;
  return w;
})();

/** The four rules: unit i reads feature i of this word. */
export const W_1: number[][] = (() => {
  const w = zeros(D, D_FF);
  for (let i = 0; i < D_FF; i++) w[i]![i] = 1;
  return w;
})();
export const B_1: number[] = Array<number>(D_FF).fill(0);

/** Each rule's vote for the next word. */
export const W_2: number[][] = (() => {
  const w = zeros(D_FF, D);
  w[0]![6] = 1; // an animal: next an action
  w[1]![7] = 1; // a thing: next a small word
  w[2]![7] = 1; // an action: next a small word
  w[3]![4] = 1; // a small word: next an animal,
  w[3]![5] = 0.5; // or a thing
  return w;
})();
export const B_2: number[] = Array<number>(D).fill(0);

/** SwiGLU: the gate reads the rules, the up projection the same at 0.4, W_d votes as W₂. */
export const W_GATE = W_1;
export const W_UP: number[][] = W_1.map((row) => row.map((v) => v * 0.4));
export const W_DOWN = W_2;

/** The unembedding, 8 × 21: each word's embedding in the next-word rows, and two direct links. */
export const U: number[][] = (() => {
  const u = zeros(D, OUT_WORDS.length);
  OUT_WORDS.forEach((w, j) => VOCAB[w]!.forEach((v, f) => (u[4 + f]![j] = v)));
  u[2]![OUT_WORDS.indexOf('on')] = 2;
  u[1]![OUT_WORDS.indexOf('and')] = 2;
  return u;
})();

export const UNIT_NAMES = [
  'an animal: next an action',
  'a thing: next a small word',
  'an action: next a small word',
  'a small word: next a noun',
];

// ---------------------------------------------------------------------------------------------
// The arithmetic

export interface NormStats {
  /** The mean (LayerNorm) or 0 (RMSNorm). */
  mean: number;
  /** What it divides by: √(variance + ε) or √(mean of squares + ε). */
  scale: number;
}

export function normalize(v: readonly number[], kind: NormKind): { out: number[]; st: NormStats } {
  const d = v.length;
  if (kind === 'layer') {
    let s = 0;
    for (const x of v) s += x;
    const mean = s / d;
    let q = 0;
    for (const x of v) q += (x - mean) * (x - mean);
    const scale = Math.sqrt(q / d + EPS);
    return { out: v.map((x) => (x - mean) / scale), st: { mean, scale } };
  }
  let q = 0;
  for (const x of v) q += x * x;
  const scale = Math.sqrt(q / d + EPS);
  return { out: v.map((x) => x / scale), st: { mean: 0, scale } };
}

const GELU_C = Math.sqrt(2 / Math.PI);
export const gelu = (x: number) => 0.5 * x * (1 + Math.tanh(GELU_C * (x + 0.044715 * x * x * x)));
export const relu = (x: number) => (x > 0 ? x : 0);
export const silu = (x: number) => x / (1 + Math.exp(-x));

const add = (a: readonly number[], b: readonly number[]) => a.map((v, i) => v + b[i]!);
const vecMat = (v: readonly number[], m: readonly (readonly number[])[]) => matmul([v], m)[0]!;

export interface FfnResult {
  /** x·W₁ + b₁ (ReLU, GELU) or the gate x·W_g (SwiGLU). */
  pre: number[];
  /** x·W_u (SwiGLU only). */
  up?: number[];
  hidden: number[];
  out: number[];
}

export function ffn(v: readonly number[], act: Act): FfnResult {
  if (act === 'swiglu') {
    const pre = vecMat(v, W_GATE);
    const up = vecMat(v, W_UP);
    const hidden = pre.map((g, i) => silu(g) * up[i]!);
    return { pre, up, hidden, out: vecMat(hidden, W_DOWN) };
  }
  const pre = add(vecMat(v, W_1), B_1);
  const f = act === 'relu' ? relu : gelu;
  const hidden = pre.map(f);
  return { pre, hidden, out: add(vecMat(hidden, W_2), B_2) };
}

/** The stages of the followed word's vector, in the order they are drawn. */
export type RowKey =
  'x' | 'n1' | 'attn' | 's1' | 'x1' | 'n2' | 'pre' | 'up' | 'hid' | 'ffn' | 's2' | 'x2' | 'h';

export interface BlockResult {
  order: Order;
  norm: NormKind;
  act: Act;
  /** What attention reads: Norm(x) for every word (pre-norm), or x itself (post-norm). */
  attnIn: number[][];
  att: AttnResult;
  /** z·W_O for every word. */
  o: number[][];
  /** The followed (last) word's vector at each stage. */
  rows: Partial<Record<RowKey, number[]>>;
  /** Mean and scale of each normalization, by the row it makes. */
  stats: Partial<Record<RowKey, NormStats>>;
  ffn: FfnResult;
  logits: number[];
  probs: number[];
  /** Index into OUT_WORDS. */
  guess: number;
}

/** The first word whose logit is within 10⁻⁹ of the largest, so last-bit noise never decides. */
export function argmax(xs: readonly number[]): number {
  const top = Math.max(...xs);
  return xs.findIndex((v) => v >= top - 1e-9);
}

export function runBlock(x: number[][], set: BlockSettings): BlockResult {
  const n = x.length;
  const last = n - 1;
  const rows: BlockResult['rows'] = { x: x[last]! };
  const stats: BlockResult['stats'] = {};
  const norm = (v: readonly number[], key: RowKey) => {
    const r = normalize(v, set.norm);
    stats[key] = r.st;
    return r.out;
  };
  let attnIn: number[][];
  if (set.order === 'pre') {
    attnIn = x.map((row, i) => (i === last ? norm(row, 'n1') : normalize(row, set.norm).out));
    rows.n1 = attnIn[last]!;
  } else attnIn = x;
  const att = attention(attnIn, HEAD, true, true);
  const o = matmul(att.z, W_O);
  rows.attn = o[last]!;
  let x1: number[];
  if (set.order === 'pre') x1 = add(x[last]!, o[last]!);
  else {
    rows.s1 = add(x[last]!, o[last]!);
    x1 = norm(rows.s1, 'x1');
  }
  rows.x1 = x1;
  const fIn = set.order === 'pre' ? norm(x1, 'n2') : x1;
  if (set.order === 'pre') rows.n2 = fIn;
  const f = ffn(fIn, set.act);
  rows.pre = f.pre;
  if (f.up) rows.up = f.up;
  rows.hid = f.hidden;
  rows.ffn = f.out;
  let x2: number[];
  let h: number[];
  if (set.order === 'pre') {
    x2 = add(x1, f.out);
    h = norm(x2, 'h');
    rows.h = h;
  } else {
    rows.s2 = add(x1, f.out);
    x2 = norm(rows.s2, 'x2');
    h = x2;
  }
  rows.x2 = x2;
  const logits = vecMat(h, U);
  const probs = softmax(logits).p;
  return { ...set, attnIn, att, o, rows, stats, ffn: f, logits, probs, guess: argmax(logits) };
}

/** Parameters in the block (two norms, attention, FFN) and in the final norm (pre-norm only). */
export function paramCount(set: BlockSettings): {
  norm: number;
  attn: number;
  ffn: number;
  block: number;
  final: number;
} {
  const norm = set.norm === 'layer' ? 2 * D : D;
  const attn = 3 * D * D_K + D_K * D;
  const ffnCount = set.act === 'swiglu' ? 3 * D * D_FF : D * D_FF + D_FF + D_FF * D + D;
  return {
    norm,
    attn,
    ffn: ffnCount,
    block: 2 * norm + attn + ffnCount,
    final: set.order === 'pre' ? norm : 0,
  };
}

/** The words, ranked by logit (ties in vocabulary order). */
export function ranking(logits: readonly number[]): number[] {
  return logits
    .map((v, i) => [v, i] as const)
    .sort((a, b) => b[0] - a[0] || a[1] - b[1])
    .map(([, i]) => i);
}

// ---------------------------------------------------------------------------------------------
// State

export interface BlockState {
  words: string[];
  /** The stream at the start: each word's embedding, then four zeros. */
  x: number[][];
  result?: BlockResult;
}

/** What one step of `run` shows. */
export interface BlockWork {
  r: BlockResult;
  /** The stages filled so far. */
  shown: RowKey[];
  /** What the attention column shows, and for how many words. */
  att: 'none' | 'scores' | 'weights';
  scored: number;
  /** The output table: nothing, logits, or logits and probabilities. */
  out: 'none' | 'logits' | 'probs';
}

export interface BlockExtra {
  work?: BlockWork;
}

type S = BlockState;
type X = BlockExtra;
type Op = OpSpec<S, BlockSettings, X>;
type BStep = Step<S, X>;

export const stream = (words: readonly string[]): number[][] =>
  words.map((w) => [...embed(w), 0, 0, 0, 0]);

export function init(): S {
  const words = parseSentence(START_TEXT) as string[];
  return { words, x: stream(words) };
}

/** The stages drawn for a setting, top to bottom. */
export function rowKeys(set: BlockSettings): RowKey[] {
  const hid: RowKey[] = set.act === 'swiglu' ? ['pre', 'up', 'hid'] : ['pre', 'hid'];
  return set.order === 'pre'
    ? ['x', 'n1', 'attn', 'x1', 'n2', ...hid, 'ffn', 'x2', 'h']
    : ['x', 'attn', 's1', 'x1', ...hid, 'ffn', 's2', 'x2'];
}

/** The stream rows: the skip path runs through these. */
export const STREAM_ROWS: readonly RowKey[] = ['x', 's1', 'x1', 's2', 'x2'];

export const normName = (set: BlockSettings) => (set.norm === 'layer' ? 'LN' : 'RMS');
export const actName = (set: BlockSettings) =>
  set.act === 'relu' ? 'ReLU' : set.act === 'gelu' ? 'GELU' : 'SwiGLU';

export function rowLabel(key: RowKey, set: BlockSettings): string {
  const nn = normName(set);
  switch (key) {
    case 'x':
      return 'x';
    case 'n1':
      return `${nn}(x)`;
    case 'attn':
      return 'attn';
    case 's1':
      return 'x+attn';
    case 'x1':
      return 'x₁';
    case 'n2':
      return `${nn}(x₁)`;
    case 'pre':
      return set.act === 'swiglu' ? 'gate' : 'x·W₁+b₁';
    case 'up':
      return 'up';
    case 'hid':
      return actName(set);
    case 'ffn':
      return 'FFN';
    case 's2':
      return 'x₁+FFN';
    case 'x2':
      return 'x₂';
    case 'h':
      return `${nn}(x₂)`;
  }
}

/** How many numbers a stage has. */
export const rowWidth = (key: RowKey) =>
  key === 'pre' || key === 'up' || key === 'hid' ? D_FF : D;

// ---------------------------------------------------------------------------------------------
// Steps

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });
/** The cells of a stage: s-<key>-<c>. */
const rowMarks = (key: RowKey, role: Mark['role'], cols?: number[]) =>
  (cols ?? Array.from({ length: rowWidth(key) }, (_, c) => c)).map((c) =>
    mark(`s-${key}-${c}`, role),
  );
const vec = (v: readonly number[]) => `(${v.map(two).join(', ')})`;
const half = (v: readonly number[]) => vec(v.slice(4));

export function baseVars(s: S, set: BlockSettings): Record<string, Scalar> {
  const p = paramCount(set);
  return {
    words: s.words.length,
    following: wordName(s.words, s.words.length - 1),
    d_model: D,
    d_ff: D_FF,
    'block parameters': p.block,
    ...(p.final ? { 'final norm': p.final } : {}),
  };
}

/** The feature with the largest value among the first four, for narration. */
function kindOf(v: readonly number[]): number {
  let best = 0;
  for (let f = 1; f < 4; f++) if (v[f]! > v[best]!) best = f;
  return best;
}

function normSay(key: RowKey, set: BlockSettings, r: BlockResult, input: string): string {
  const st = r.stats[key]!;
  const out = r.rows[key]!;
  const src =
    key === 'n1' || key === 'x1'
      ? r.rows[key === 'n1' ? 'x' : 's1']!
      : key === 'n2'
        ? r.rows.x1!
        : r.rows[key === 'h' ? 'x2' : 's2']!;
  const f = kindOf(src);
  const how =
    set.norm === 'layer'
      ? `LayerNorm of ${input}: the mean of its eight numbers is ${two(st.mean)} and the standard deviation ${two(st.scale)}. Subtract the mean, divide by the deviation: ${two(src[f]!)} becomes ${two(out[f]!)}, and every 0 becomes ${two(-st.mean / st.scale)}.`
      : `RMSNorm of ${input}: the root mean square of its eight numbers is ${two(st.scale)}. Divide by it: ${two(src[f]!)} becomes ${two(out[f]!)}, and a 0 stays 0 (nothing is subtracted).`;
  return how;
}

const loadOp: Op = {
  label: 'Load',
  arity: 1,
  *run(s, args, { settings }) {
    const words = parseSentence(String(args[0]));
    if (words instanceof Error) {
      yield {
        state: s,
        marks: [],
        say: words.message,
        lines: [],
        level: 1,
        vars: baseVars(s, settings),
      };
      return s;
    }
    const next: S = { words, x: stream(words) };
    const unknown = [...new Set(words.filter((w) => !known(w)))];
    const odd = unknown.length
      ? ` ${unknown.join(', ')} ${unknown.length === 1 ? 'is' : 'are'} not in the toy vocabulary, so ${unknown.length === 1 ? 'it gets' : 'they get'} made-up numbers.`
      : '';
    const lastName = wordName(words, words.length - 1);
    yield {
      state: next,
      marks: [...rowMarks('x', 'new'), mark(`w-${words.length - 1}`, 'active')],
      say: `${words.length === 1 ? 'One word' : `${words.length} words`}: ${words.join(' ')}. The block reads them all and follows ${lastName}: its vector starts as its embedding (animal, thing, action, small) and four zeros, room for a guess about the next word.${odd} Press Run.`,
      lines: ['embed'],
      level: 1,
      vars: baseVars(next, settings),
    };
    return next;
  },
};

const runOp: Op = {
  label: 'Run',
  arity: 0,
  *run(s, _args, { settings: set }) {
    const n = s.words.length;
    const last = n - 1;
    const r = runBlock(s.x, set);
    const names = s.words.map((_, i) => wordName(s.words, i));
    const me = names[last]!;
    const pre = set.order === 'pre';
    const shown: RowKey[] = ['x'];
    let attStage: BlockWork['att'] = 'none';
    let scored = 0;
    let out: BlockWork['out'] = 'none';
    const vars = () => baseVars(s, set);
    const step = (say: string, lines: string[], level: 1 | 2 | 3, marks: Mark[] = []): BStep => ({
      state: s,
      marks,
      say,
      lines,
      level,
      vars: vars(),
      extra: { work: { r, shown: [...shown], att: attStage, scored, out } },
    });

    // 1. Normalize (pre-norm), then attention.
    if (pre) {
      shown.push('n1');
      yield step(
        `${normSay('n1', set, r, `${me}'s vector`)} Every word is normalized the same way before attention reads it.`,
        ['n1'],
        2,
        [...rowMarks('x', 'visit'), ...rowMarks('n1', 'new')],
      );
    }
    const a = r.att;
    const q = a.q[last]!;
    for (let j = 0; j < n; j++) {
      attStage = 'scores';
      scored = j + 1;
      yield step(
        `Attention: ${me}'s query ${vec(q)} against ${names[j]}'s key ${vec(a.k[j]!)}, divided by √${D_K}: ${two(a.scaled[last]![j]!)}. ${set.order === 'pre' ? 'Queries and keys come from the normalized vectors.' : 'In post-norm, attention reads x itself.'}`,
        ['attn'],
        3,
        [mark(`a-${j}`, 'active'), mark(`w-${j}`, 'compare')],
      );
    }
    attStage = 'weights';
    scored = n;
    const top = a.a[last]!.indexOf(Math.max(...a.a[last]!));
    const article = isArticle(r, last);
    yield step(
      `Softmax over ${me}'s scores: ${names.map((w, j) => `${w} ${short(a.a[last]![j]!)}`).join(', ')}. ${article ? `${me} is a small word, so its query looks back for nouns, and ${names[top]} answers.` : `${me} is not a small word: its query points away from nouns, so it looks at a small word, which has nothing to give.`}`,
      ['attn'],
      2,
      [...Array.from({ length: n }, (_, j) => mark(`a-${j}`, 'active')), mark(`a-${top}`, 'found')],
    );
    const z = a.z[last]!;
    const lean = z[0]! - z[1]!;
    shown.push('attn');
    yield step(
      `The head returns z = ${vec(z)}, the animal and the thing in what it looked at. W_O turns the difference into a vote for the next word: animal ${two(r.rows.attn![4]!)}, thing ${two(r.rows.attn![5]!)}. ${!article || Math.abs(lean) < 0.2 ? 'The two nearly cancel: attention has little to add here.' : lean > 0 ? 'An animal came before, so the next noun is more likely a thing (the object).' : 'A thing came before, so the next noun is more likely an animal.'}`,
      ['attn'],
      2,
      [...rowMarks('attn', 'new'), mark(`a-${top}`, 'found')],
    );

    // 2. The first residual add.
    if (pre) {
      shown.push('x1');
      yield step(
        `The residual add: x₁ = x + attn. Attention writes only into the next-word half, so the first four numbers are still ${me}'s embedding. Nothing is replaced; the block adds.`,
        ['add1'],
        2,
        [...rowMarks('x', 'visit'), ...rowMarks('attn', 'visit'), ...rowMarks('x1', 'new')],
      );
    } else {
      shown.push('s1');
      yield step(
        `The residual add: x + attn. Attention wrote only into the next-word half, so the first four numbers are still ${me}'s embedding.`,
        ['add1'],
        2,
        [...rowMarks('x', 'visit'), ...rowMarks('attn', 'visit'), ...rowMarks('s1', 'new')],
      );
      shown.push('x1');
      yield step(
        `${normSay('x1', set, r, 'the sum')} In post-norm the stream itself is normalized, so ${me}'s own numbers change too.`,
        ['add1'],
        2,
        [...rowMarks('s1', 'visit'), ...rowMarks('x1', 'new')],
      );
    }

    // 3. The feed-forward network.
    if (pre) {
      shown.push('n2');
      yield step(normSay('n2', set, r, 'x₁'), ['n2'], 2, [
        ...rowMarks('x1', 'visit'),
        ...rowMarks('n2', 'new'),
      ]);
    }
    const fin = pre ? 'n2' : 'x1';
    const f = r.ffn;
    const unit = f.pre.indexOf(Math.max(...f.pre));
    shown.push('pre');
    yield step(
      set.act === 'swiglu'
        ? `The gate, x·W_g: four hidden units, one rule each, reading this word's animal, thing, action and small. Unit ${unit + 1} (${UNIT_NAMES[unit]}) gets the most: ${two(f.pre[unit]!)}.`
        : `x·W₁ + b₁: four hidden units, one rule each, reading this word's animal, thing, action and small (the biases are 0). Unit ${unit + 1} (${UNIT_NAMES[unit]}) gets the most: ${two(f.pre[unit]!)}.`,
      ['ff1'],
      2,
      [...rowMarks(fin, 'visit'), ...rowMarks('pre', 'new')],
    );
    if (f.up) {
      shown.push('up');
      yield step(
        `The up projection, x·W_u: the same rules at 0.4 strength. SwiGLU multiplies it by the gate, so a unit fires only when both agree.`,
        ['ff1'],
        3,
        [...rowMarks(fin, 'visit'), ...rowMarks('up', 'new')],
      );
    }
    shown.push('hid');
    const neg = f.pre.findIndex((v) => v < 0);
    yield step(
      set.act === 'relu'
        ? `ReLU keeps positive values and sets negatives to 0: ${two(f.pre[unit]!)} stays ${two(f.hidden[unit]!)}${neg >= 0 ? `, ${two(f.pre[neg]!)} becomes 0` : ''}.`
        : set.act === 'gelu'
          ? `GELU, x·Φ(x): a smooth ReLU. ${two(f.pre[unit]!)} becomes ${two(f.hidden[unit]!)}${neg >= 0 ? `, and ${two(f.pre[neg]!)} becomes ${two(f.hidden[neg]!)}, a little below 0` : ''}.`
          : `SwiGLU: SiLU(gate) × up, where SiLU(g) = g / (1 + e^−g). Unit ${unit + 1}: SiLU(${two(f.pre[unit]!)}) × ${two(f.up![unit]!)} = ${two(f.hidden[unit]!)}.`,
      ['act'],
      2,
      [...rowMarks('pre', 'visit'), ...rowMarks('hid', 'new')],
    );
    shown.push('ffn');
    yield step(
      `${set.act === 'swiglu' ? 'W_d' : 'W₂'} turns each rule into a vote for the next word. The FFN adds ${half(f.out)} to the next-word half (animal, thing, action, small).`,
      ['ff2'],
      2,
      [...rowMarks('hid', 'visit'), ...rowMarks('ffn', 'new')],
    );

    // 4. The second residual add, then the final norm.
    if (pre) {
      shown.push('x2');
      yield step(
        `The second residual add: x₂ = x₁ + FFN. The next-word half now holds attention's vote plus the FFN's: ${half(r.rows.x2!)}. The first half is still ${me}'s embedding.`,
        ['add2'],
        2,
        [...rowMarks('x1', 'visit'), ...rowMarks('ffn', 'visit'), ...rowMarks('x2', 'new')],
      );
      shown.push('h');
      yield step(
        `${normSay('h', set, r, 'x₂')} Pre-norm blocks never normalize the stream itself, so the model ends with one more norm (the final norm) before the unembedding.`,
        ['fin'],
        2,
        [...rowMarks('x2', 'visit'), ...rowMarks('h', 'new')],
      );
    } else {
      shown.push('s2');
      yield step(
        `The second residual add: x₁ + FFN. The next-word half now holds ${half(r.rows.s2!)}.`,
        ['add2'],
        2,
        [...rowMarks('x1', 'visit'), ...rowMarks('ffn', 'visit'), ...rowMarks('s2', 'new')],
      );
      shown.push('x2');
      yield step(
        `${normSay('x2', set, r, 'the sum')} That is the block's output; post-norm needs no final norm.`,
        ['add2'],
        2,
        [...rowMarks('s2', 'visit'), ...rowMarks('x2', 'new')],
      );
    }

    // 5. The unembedding.
    const hKey: RowKey = pre ? 'h' : 'x2';
    const rank = ranking(r.logits);
    const g = r.guess;
    out = 'logits';
    const best = rank.slice(0, 3).map((i) => `${OUT_WORDS[i]} ${two(r.logits[i]!)}`);
    yield step(
      `The unembedding scores all ${OUT_WORDS.length} words: each word's embedding times the next-word half, plus the two direct links (on after an action, and after a thing). Highest: ${best.join(', ')}.`,
      ['logit'],
      2,
      [
        ...rowMarks(hKey, 'visit'),
        ...rank.slice(0, 3).map((i) => mark(`lg-${OUT_WORDS[i]}`, 'new')),
      ],
    );
    out = 'probs';
    yield step(
      `Softmax turns the scores into probabilities: ${rank
        .slice(0, 3)
        .map((i) => `${OUT_WORDS[i]} ${short(r.probs[i]!)}`)
        .join(', ')}. They add up to 1 over all ${OUT_WORDS.length} words.`,
      ['soft'],
      2,
      rank.slice(0, 3).map((i) => mark(`p-${OUT_WORDS[i]}`, 'new')),
    );

    const next: S = { ...s, result: r };
    yield {
      state: next,
      marks: [mark(`p-${OUT_WORDS[g]}`, 'found'), mark(`w-${last}`, 'active')],
      say: `After "${s.words.join(' ')}" the block guesses ${OUT_WORDS[g]} (${short(r.probs[g]!)}). ${guessWhy(r, s.words)}`,
      lines: ['ret'],
      level: 1,
      vars: { ...baseVars(next, set), guess: OUT_WORDS[g]! },
    };
    return next;
  },
};

/** Is word i's query looking back for nouns (a small word)? */
export const isArticle = (r: BlockResult, i: number) => r.att.q[i]![0]! > 0.5;

/** One sentence on why the guess is what it is. */
export function guessWhy(r: BlockResult, words: readonly string[]): string {
  const x = r.rows.x!;
  const k = kindOf(x);
  const word = OUT_WORDS[r.guess]!;
  const z = r.att.z[words.length - 1]!;
  if (isArticle(r, words.length - 1)) {
    if (z[0]! - z[1]! > 0.2)
      return 'A small word after an animal: attention says the noun is a thing.';
    if (z[1]! - z[0]! > 0.2)
      return 'A small word after a thing: attention says the noun is an animal.';
    return 'A small word with no noun before it: the FFN says a noun, most likely an animal.';
  }
  if (k === 0) return 'An animal is usually followed by an action.';
  if (k === 2)
    return `After an action, a small word; the direct link picks ${word === 'on' ? 'on' : word}.`;
  if (k === 1)
    return `After a thing, a small word; the direct link picks ${word === 'and' ? 'and' : word}.`;
  return 'Every number came from hand-made weights; a trained model learns them.';
}

export const ops = { load: loadOp, run: runOp };

// ---------------------------------------------------------------------------------------------
// Pseudocode

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(set: BlockSettings): PseudoBlock[] {
  const nn = normName(set);
  const nWord =
    set.norm === 'layer'
      ? 'subtract the mean, divide by the spread'
      : 'divide by the root mean square';
  const ffnLines =
    set.act === 'swiglu'
      ? [
          L(
            'ff1',
            1,
            'g = v·W_g, u = v·W_u',
            'Score the four rules twice, a gate and an up projection,',
          ),
          L('act', 1, 'a = SiLU(g) ⊙ u', 'let a rule through only where both agree,'),
          L('ff2', 1, 'f = a·W_d', 'and turn the rules into votes for the next word.'),
        ]
      : [
          L('ff1', 1, 'g = v·W₁ + b₁', 'Score the four rules on this word,'),
          L(
            'act',
            1,
            `a = ${actName(set)}(g)`,
            set.act === 'relu'
              ? 'drop the negative scores,'
              : 'squash the negative scores toward 0,',
          ),
          L('ff2', 1, 'f = a·W₂ + b₂', 'and turn the rules into votes for the next word.'),
        ];
  const block =
    set.order === 'pre'
      ? [
          L('sig', 0, 'BLOCK(X)  (pre-norm)', 'Run one transformer block and guess the next word:'),
          L('n1', 1, `N = ${nn}(X)`, `Normalize every word: ${nWord}.`),
          L('attn', 1, 'A = Attention(N)·W_O', 'Let each word gather from the words before it.'),
          L('add1', 1, 'X₁ = X + A', 'Add the result to the stream (the residual add).'),
          L('n2', 1, `v = ${nn}(x₁)`, 'Normalize the followed word again,'),
          ...ffnLines,
          L('add2', 1, 'x₂ = x₁ + f', 'Add the votes to the stream.'),
          L('fin', 1, `h = ${nn}(x₂)`, 'Normalize one last time (the final norm).'),
          L('logit', 1, 'logits = h·U', 'Score every word in the vocabulary,'),
          L('soft', 1, 'p = softmax(logits)', 'turn the scores into probabilities,'),
          L('ret', 1, 'return argmax p', 'and guess the most likely word.'),
        ]
      : [
          L(
            'sig',
            0,
            'BLOCK(X)  (post-norm)',
            'Run one transformer block and guess the next word:',
          ),
          L('attn', 1, 'A = Attention(X)·W_O', 'Let each word gather from the words before it.'),
          L(
            'add1',
            1,
            `X₁ = ${nn}(X + A)`,
            `Add it to the stream, then normalize the stream: ${nWord}.`,
          ),
          ...ffnLines.map((l) =>
            l.id === 'ff1' ? { ...l, text: l.text.replace('v·', 'x₁·') } : l,
          ),
          L('add2', 1, `x₂ = ${nn}(x₁ + f)`, 'Add the votes, and normalize the stream again.'),
          L('logit', 1, 'logits = x₂·U', 'Score every word in the vocabulary,'),
          L('soft', 1, 'p = softmax(logits)', 'turn the scores into probabilities,'),
          L('ret', 1, 'return argmax p', 'and guess the most likely word.'),
        ];
  return [
    {
      op: 'load',
      lines: [
        L('lsig', 0, 'LOAD(words)', 'Start from a sentence:'),
        L(
          'embed',
          1,
          'x_i = (embedding(word_i), 0, 0, 0, 0)',
          'each word is its four numbers, then four empty ones.',
        ),
      ],
    },
    { op: 'run', lines: block },
  ];
}

// ---------------------------------------------------------------------------------------------
// Words for screen readers and narration

export function initialSay(s: S): string {
  return `${s.words.length} words: ${s.words.join(' ')}. Press Run to send them through one transformer block and see what it guesses comes next. Every weight is made by hand.`;
}

export const initialVars = (s: S, set: BlockSettings) => baseVars(s, set);

export function describe(s: S): string {
  const base = `Words: ${s.words.join(' ')}; following ${s.words[s.words.length - 1]}.`;
  if (!s.result) return `${base} Not run yet.`;
  const r = s.result;
  const rank = ranking(r.logits).slice(0, 3);
  return `${base} Its vector after the block: ${vec(r.rows.x2!)}. Guess: ${OUT_WORDS[r.guess]}. Top words: ${rank.map((i) => `${OUT_WORDS[i]} ${short(r.probs[i]!)}`).join(', ')}.`;
}
