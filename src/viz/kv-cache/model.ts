/**
 * The KV cache: generating text one token at a time with the hand-made attention head of the
 * self-attention page (one head, d = 4, d_k = d_v = 2, scaled by √d_k, causal), and counting
 * the work and the memory.
 *
 *   prefill(prompt)  the whole prompt at once: Q = X·W_Q, K = X·W_K, V = X·W_V in one matrix
 *                    product each, then every prompt token attends to itself and the tokens
 *                    before it; K and V go into the cache
 *   generate(word)   one new token: with the cache, one new row of K and one of V, appended;
 *                    without it, K and V for every token it sees are computed again
 *
 * The new token attends with q · k_j / √d_k, softmax and a blend of the values, exactly as on
 * the self-attention page, so with or without the cache its output is the same: the cache
 * changes the cost, never the answer. The word itself is typed by the learner (a real model
 * would choose it from the last output); this page is about the cost, not about the choice.
 *
 * Work is counted in multiply-adds: a row of x (4 numbers) times a weight matrix (4 × 2) costs
 * 8; each token a query sees costs 2 for its score and 2 for blending its value.
 *
 * Settings
 *   cache   true: keep K and V between steps (the default); false: recompute them every step
 *   window  'all': every token sees all the tokens before it; '2' to '4': sliding-window
 *           attention, where a token sees only the last w tokens (itself included), so the
 *           cache holds at most w rows and evicts the oldest
 */
import type { Mark, OpSpec, PseudoBlock, Scalar, Step } from '../../engine/types';
import { dot, matmul, short, softmax, two } from '../_lm/numbers';
import { D_MODEL, embed, known } from '../_lm/vocab';
import { D_K, DESIGNED, parseSentence, wordName } from '../self-attention/model';

export { D_K, DESIGNED };

/** The toy stops here, so every number fits on a phone (PLAN.md 20.4). */
export const MAX_TOKENS = 8;
/** One row of x times one weight matrix. */
export const ROW_COST = D_MODEL * D_K;
/** q, k and v for one token. */
export const QKV_COST = 3 * ROW_COST;
/** One score (q · k, d_k terms) and one blended value (d_v = d_k terms) per token seen. */
export const SEEN_COST = 2 * D_K;
/** Numbers the cache holds per token: a row of K and a row of V. */
export const ROW_NUMBERS = 2 * D_K;

export type WindowSetting = 'all' | '2' | '3' | '4';

export interface KvSettings {
  [key: string]: Scalar;
  cache: boolean;
  window: WindowSetting;
}

export const defaults: KvSettings = { cache: true, window: 'all' };

/** The window as a number of tokens; Infinity when every token is kept. */
export const windowOf = (settings: KvSettings): number =>
  settings.window === 'all' ? Infinity : Number(settings.window);

/** One query's attention: who it is, the first token it sees, and what it computes. */
export interface Attn {
  t: number;
  lo: number;
  q: number[];
  /** Scaled scores and weights for tokens lo..t. */
  s: number[];
  a: number[];
  z: number[];
}

export interface KvState {
  words: string[];
  x: number[][];
  /** How many tokens came in with the prompt. */
  prompt: number;
  /** The cache: the K and V rows of tokens from, from + 1, ... (empty without a cache). */
  from: number;
  k: number[][];
  v: number[][];
  /** The newest token's attention, once it has run. */
  last?: Attn;
  /** Multiply-adds spent on each token. */
  work: number[];
  /** K and V rows computed again for tokens that had them already (no cache). */
  recomputed: number;
}

/** What one step shows besides the state. */
export interface KvExtra {
  /** Token rows of K and V on screen besides the cache: computed in this step. */
  kv?: number[];
  /** Token rows of q on screen. */
  q?: number[];
  /** The attention column: whose query, how far it has got, scores or weights. */
  att?: { t: number; upto: number; stage: 'score' | 'weight' };
  /** Token rows of z on screen. */
  z?: number[];
}

type S = KvState;
type X = KvExtra;
type Op = OpSpec<S, KvSettings, X>;
type KStep = Step<S, X>;

/** A row vector times a matrix, as the code tabs do it. */
export const rowTimes = (x: readonly number[], w: number[][]): number[] => matmul([x], w)[0]!;

/** One query against the keys it may see: scaled scores, softmax, a blend of the values. */
export function attend(q: number[], keys: number[][], values: number[][]) {
  const root = Math.sqrt(D_K);
  const s = keys.map((k) => dot(q, k) / root);
  const a = softmax(s).p;
  return { s, a, z: matmul([a], values)[0]! };
}

/** The first token that token t sees with window w. */
export const windowStart = (t: number, w: number): number => Math.max(0, t + 1 - w);

/** Token t's attention over the tokens it sees, from the embeddings alone. */
export function rowAttention(x: number[][], t: number, w: number): Attn {
  const lo = windowStart(t, w);
  const seen = x.slice(lo, t + 1);
  const q = rowTimes(x[t]!, DESIGNED.wq);
  const r = attend(q, matmul(seen, DESIGNED.wk), matmul(seen, DESIGNED.wv));
  return { t, lo, q, ...r };
}

/** The multiply-adds for one token that sees m tokens. */
export const tokenCost = (m: number, cache: boolean): number =>
  cache ? QKV_COST + SEEN_COST * m : ROW_COST + 2 * ROW_COST * m + SEEN_COST * m;

export function init(): S {
  return { words: [], x: [], prompt: 0, from: 0, k: [], v: [], work: [], recomputed: 0 };
}

// ---------------------------------------------------------------------------------------------
// Steps

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });
const rowMarks = (m: string, r: number, cols: number, role: Mark['role']) =>
  Array.from({ length: cols }, (_, c) => mark(`${m}-${r}-${c}`, role));
const range = (lo: number, hi: number) => Array.from({ length: hi - lo }, (_, i) => lo + i);
const vec = (v: readonly number[]) => `(${v.map(two).join(', ')})`;
const sum = (xs: readonly number[]) => xs.reduce((t, v) => t + v, 0);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function vars(s: S, op: number, pending = 0): Record<string, Scalar> {
  return {
    tokens: s.words.length,
    'cache rows': s.k.length,
    'cache numbers': s.k.length * ROW_NUMBERS,
    'multiply-adds': op,
    'total multiply-adds': sum(s.work) + pending,
    'recomputed rows': s.recomputed,
  };
}

function refuse(s: S, say: string): KStep {
  return { state: s, marks: [], say, lines: [], level: 1, vars: vars(s, 0) };
}

/** "the" or "the (5)" for every token. */
const namesOf = (words: readonly string[]) => words.map((_, i) => wordName(words, i));

/** Who token t sees, in words. */
function seesWhom(names: readonly string[], t: number, lo: number): string {
  const m = t - lo + 1;
  if (m === 1) return 'only itself';
  if (lo > 0) return `the last ${m} tokens, ${names.slice(lo, t + 1).join(', ')} (the window)`;
  return `itself and the ${plural(t, 'token')} before it`;
}

function unknownNote(words: readonly string[]): string {
  const unknown = [...new Set(words.filter((w) => !known(w)))];
  if (!unknown.length) return '';
  const one = unknown.length === 1;
  return ` ${unknown.join(', ')} ${one ? 'is' : 'are'} not in the toy vocabulary, so ${one ? 'it gets' : 'they get'} made-up numbers.`;
}

const prefillOp: Op = {
  label: 'Prefill',
  arity: 1,
  *run(s, args, { settings }) {
    const words = parseSentence(String(args[0]));
    if (words instanceof Error) {
      yield refuse(s, words.message);
      return s;
    }
    const n = words.length;
    const w = windowOf(settings);
    const cache = settings.cache;
    const x = words.map(embed);
    const names = namesOf(words);
    const kAll = matmul(x, DESIGNED.wk);
    const vAll = matmul(x, DESIGNED.wv);
    const rows = range(0, n);
    const base: S = { words, x, prompt: n, from: 0, k: [], v: [], work: [], recomputed: 0 };
    let op = 0;

    yield {
      state: base,
      marks: rows.flatMap((r) => rowMarks('x', r, D_MODEL, 'new')),
      say: `Prefill: the prompt goes in all at once, ${plural(n, 'token')} (${words.join(' ')}). Each starts as its embedding x, four numbers.${unknownNote(words)}`,
      lines: ['p-sig', 'p-embed'],
      level: 2,
      vars: vars(base, op),
    };

    op += QKV_COST * n;
    yield {
      state: base,
      marks: rows.flatMap((r) => [
        ...rowMarks('q', r, D_K, 'new'),
        ...rowMarks('k', r, D_K, 'new'),
        ...rowMarks('v', r, D_K, 'new'),
      ]),
      say: `Q = X·W_Q, K = X·W_K, V = X·W_V: one matrix product each gives every prompt token its query, key and value, 3 × ${n} × ${ROW_COST} = ${op} multiply-adds. The whole prompt is one matrix, which a GPU multiplies in parallel.`,
      lines: ['p-proj'],
      level: 2,
      vars: vars(base, op, op),
      extra: { kv: rows, q: rows },
    };

    const work: number[] = [];
    const outs = rows.map((t) => rowAttention(x, t, w));
    for (const r of outs) {
      const m = r.t - r.lo + 1;
      op += SEEN_COST * m;
      work.push(tokenCost(m, true));
      const top = r.lo + r.a.indexOf(Math.max(...r.a));
      const state: S = { ...base, work: [...work] };
      yield {
        state,
        marks: [
          ...rowMarks('q', r.t, D_K, 'active'),
          ...range(r.lo, r.t + 1).flatMap((j) => [
            ...rowMarks('k', j, D_K, 'compare'),
            mark(`a-${j}-0`, 'active'),
          ]),
          ...rowMarks('z', r.t, D_K, 'new'),
          mark(`work-${r.t}-0`, 'new'),
        ],
        say: `${names[r.t]} attends to ${seesWhom(names, r.t, r.lo)}: ${plural(m, 'score')} and a blend of ${plural(m, 'value')}, ${SEEN_COST * m} multiply-adds. Its largest weight is on ${names[top]} (${short(r.a[top - r.lo]!)}).`,
        lines: ['p-attend'],
        level: 3,
        vars: vars(state, op, op - sum(work)),
        extra: {
          kv: rows,
          q: rows,
          att: { t: r.t, upto: r.t, stage: 'weight' },
          z: range(0, r.t + 1),
        },
      };
    }

    const seen = outs.map((r) => r.t - r.lo + 1);
    const scored: S = { ...base, work: [...work] };
    yield {
      state: scored,
      marks: rows.flatMap((r) => rowMarks('z', r, D_K, 'new')),
      say:
        n === 1
          ? `One token attends to itself: one score, one value. Prefill did ${op} multiply-adds.`
          : `Every prompt token attended to the tokens up to itself${w < n ? ' inside the window' : ''}: ${seen.join(' + ')} = ${sum(seen)} scores in all, and as many values blended. Prefill did ${op} multiply-adds for ${plural(n, 'token')}, all in one pass.`,
      lines: ['p-attend'],
      level: 2,
      vars: vars(scored, op),
      extra: { kv: rows, q: rows, att: { t: n - 1, upto: n - 1, stage: 'weight' }, z: rows },
    };

    const from = cache ? windowStart(n - 1, w) : 0;
    const end: S = {
      ...scored,
      from,
      k: cache ? kAll.slice(from) : [],
      v: cache ? vAll.slice(from) : [],
      last: outs[n - 1],
    };
    if (cache) {
      const kept = range(from, n);
      const dropped = range(0, from);
      const keeping: S = { ...scored, from, k: end.k, v: end.v };
      yield {
        state: keeping,
        marks: [
          ...kept.flatMap((r) => [
            ...rowMarks('k', r, D_K, 'new'),
            ...rowMarks('v', r, D_K, 'new'),
          ]),
          ...dropped.flatMap((r) => [
            ...rowMarks('k', r, D_K, 'remove'),
            ...rowMarks('v', r, D_K, 'remove'),
          ]),
        ],
        say: dropped.length
          ? `Into the cache with K and V, but the window keeps only the last ${w} tokens: ${names.slice(0, from).join(', ')} ${from === 1 ? 'is' : 'are'} dropped, and ${plural(kept.length, 'row')} stay (${kept.length * ROW_NUMBERS} numbers). No later token can see the dropped ones.`
          : `Into the cache with K and V: ${plural(n, 'row')} of each, ${n * ROW_NUMBERS} numbers. The queries and outputs are not kept: no later token needs them.`,
        lines: dropped.length ? ['p-keep', 'p-evict'] : ['p-keep'],
        level: 2,
        vars: vars(keeping, op),
        extra: {
          kv: dropped,
          q: [n - 1],
          att: { t: n - 1, upto: n - 1, stage: 'weight' },
          z: [n - 1],
        },
      };
    }

    const last = outs[n - 1]!;
    yield {
      state: end,
      marks: [...rowMarks('z', n - 1, D_K, 'found'), mark(`w-${n - 1}`, 'found')],
      say: cache
        ? `Prefill done: ${plural(n, 'token')}, ${op} multiply-adds. The cache holds K and V for ${plural(end.k.length, 'token')} (${end.k.length * ROW_NUMBERS} numbers). ${names[n - 1]}'s output z = ${vec(last.z)} is what a model turns into the next token; here you type it. Press Generate.`
        : `Prefill done: ${plural(n, 'token')}, ${op} multiply-adds. Without a cache the keys and values are thrown away, so the next token must compute them all again. Type the next word and press Generate.`,
      lines: ['p-ret'],
      level: 1,
      vars: vars(end, op),
    };
    return end;
  },
};

const generateOp: Op = {
  label: 'Generate',
  arity: 1,
  *run(s, args, { settings }) {
    const parsed = parseSentence(String(args[0]));
    if (parsed instanceof Error) {
      yield refuse(s, parsed.message);
      return s;
    }
    if (parsed.length !== 1) {
      yield refuse(s, 'Generate adds one word at a time. Type several, and each one is a step.');
      return s;
    }
    if (s.words.length === 0) {
      yield refuse(
        s,
        'Start with a prompt: type a few words, such as "the cat sat", and press Prefill.',
      );
      return s;
    }
    if (s.words.length >= MAX_TOKENS) {
      yield refuse(
        s,
        `This toy stops at ${MAX_TOKENS} tokens, so every number stays readable. Prefill a new prompt to start again.`,
      );
      return s;
    }
    const word = parsed[0]!;
    const cache = settings.cache;
    const w = windowOf(settings);
    const words = [...s.words, word];
    const x = [...s.x, embed(word)];
    const names = namesOf(words);
    const t = words.length - 1;
    const r = rowAttention(x, t, w);
    const { lo } = r;
    const m = t - lo + 1;
    const seen = range(lo, t + 1);
    const mid: S = { ...s, words, x, last: undefined };
    const typed = `Token ${t + 1}: "${word}", the word you typed (a real model would choose it from the last output).${unknownNote([word])}`;
    let op = 0;

    let state: S = mid;
    if (cache) {
      op += QKV_COST;
      yield {
        state: mid,
        marks: [
          ...rowMarks('x', t, D_MODEL, 'new'),
          ...rowMarks('q', t, D_K, 'new'),
          ...rowMarks('k', t, D_K, 'new'),
          ...rowMarks('v', t, D_K, 'new'),
          mark(`w-${t}`, 'active'),
        ],
        say: `${typed} Only the new token is projected: its row of x times W_Q, W_K and W_V gives q, k and v, ${QKV_COST} multiply-adds. The ${plural(s.k.length, 'row')} in the cache are reused as they are.`,
        lines: ['d-sig', 'd-embed', 'd-proj'],
        level: 2,
        vars: vars(mid, op, op),
        extra: { kv: [t], q: [t] },
      };
      const k = rowTimes(x[t]!, DESIGNED.wk);
      const v = rowTimes(x[t]!, DESIGNED.wv);
      const drop = lo - s.from;
      const dropped = range(s.from, lo);
      state = { ...mid, from: lo, k: [...s.k.slice(drop), k], v: [...s.v.slice(drop), v] };
      yield {
        state,
        marks: [
          ...rowMarks('k', t, D_K, 'new'),
          ...rowMarks('v', t, D_K, 'new'),
          ...dropped.flatMap((j) => [
            ...rowMarks('k', j, D_K, 'remove'),
            ...rowMarks('v', j, D_K, 'remove'),
          ]),
        ],
        say:
          drop > 0
            ? `Append k and v to the cache. It would hold ${s.k.length + 1} rows, but the window keeps ${w}: the oldest, ${dropped.map((j) => names[j]).join(', ')}, is evicted. The cache stays at ${plural(m, 'row')}, ${m * ROW_NUMBERS} numbers.`
            : `Append k and v to the cache: it grows by one row, to ${plural(m, 'row')} (${m * ROW_NUMBERS} numbers), the way a dynamic array grows at the end.`,
        lines: drop > 0 ? ['d-append', 'd-evict'] : ['d-append'],
        level: 2,
        vars: vars(state, op, op),
        extra: { kv: dropped, q: [t] },
      };
    } else {
      op += 2 * ROW_COST * m + ROW_COST;
      const again = m - 1;
      yield {
        state: mid,
        marks: [
          ...rowMarks('x', t, D_MODEL, 'new'),
          ...rowMarks('q', t, D_K, 'new'),
          ...seen.flatMap((j) => {
            const role = j === t ? 'new' : 'visit';
            return [...rowMarks('k', j, D_K, role), ...rowMarks('v', j, D_K, role)];
          }),
          mark(`w-${t}`, 'active'),
        ],
        say: `${typed} Without a cache nothing was kept, so K and V are computed for ${m === t + 1 ? `all ${m} tokens` : `the ${m} tokens in the window`}, not just the new one: ${m} × 2 × ${ROW_COST} = ${2 * ROW_COST * m} multiply-adds, ${2 * ROW_COST * again} of them repeating work done before. Then q for the new token, ${ROW_COST} more.`,
        lines: ['d-sig', 'd-embed', 'd-redo', 'd-q'],
        level: 2,
        vars: vars({ ...mid, recomputed: s.recomputed + again }, op, op),
        extra: { kv: seen, q: [t] },
      };
      state = { ...mid, recomputed: s.recomputed + again };
    }

    // The new token's query against every key it sees.
    const kv = cache ? undefined : seen;
    for (const [i, j] of seen.entries()) {
      op += D_K;
      const kj = rowTimes(x[j]!, DESIGNED.wk);
      const terms = r.q.map((qv, c) => `${two(qv)} × ${two(kj[c]!)}`).join(' + ');
      yield {
        state,
        marks: [
          ...rowMarks('q', t, D_K, 'active'),
          ...rowMarks('k', j, D_K, 'compare'),
          mark(`a-${j}-0`, 'active'),
        ],
        say: `Score ${names[j]}: q · k / √${D_K} = (${terms}) / ${two(Math.sqrt(D_K))} = ${two(r.s[i]!)}.`,
        lines: ['d-score'],
        level: 3,
        vars: vars(state, op, op),
        extra: { kv, q: [t], att: { t, upto: j, stage: 'score' } },
      };
    }
    yield {
      state,
      marks: [...rowMarks('q', t, D_K, 'active'), ...seen.map((j) => mark(`a-${j}-0`, 'active'))],
      say: `The new query against the ${plural(m, 'key')}${cache ? ' in the cache' : ''}: ${r.s.map(two).join(', ')}. ${m} dot products of ${D_K} terms, ${D_K * m} multiply-adds.`,
      lines: ['d-score'],
      level: 2,
      vars: vars(state, op, op),
      extra: { kv, q: [t], att: { t, upto: t, stage: 'score' } },
    };

    const best = r.a.indexOf(Math.max(...r.a));
    yield {
      state,
      marks: seen.map((j) => mark(`a-${j}-0`, j === lo + best ? 'found' : 'active')),
      say:
        m === 1
          ? 'Softmax of a single score is 1: the token sees only itself.'
          : `Softmax turns the scores into weights that add up to 1. ${names[lo + best]} gets the most, ${short(r.a[best]!)}.`,
      lines: ['d-soft'],
      level: 2,
      vars: vars(state, op, op),
      extra: { kv, q: [t], att: { t, upto: t, stage: 'weight' } },
    };

    op += D_K * m;
    yield {
      state,
      marks: [
        ...seen.flatMap((j) => rowMarks('v', j, D_K, 'visit')),
        ...rowMarks('z', t, D_K, 'new'),
      ],
      say: `z = Σ a_j · v_j over the ${plural(m, 'value')}: ${vec(r.z)}, ${D_K * m} multiply-adds. With or without a cache this is the same number; the cache changes the cost, not the answer.`,
      lines: ['d-blend'],
      level: 2,
      vars: vars(state, op, op),
      extra: { kv, q: [t], att: { t, upto: t, stage: 'weight' }, z: [t] },
    };

    const end: S = { ...state, last: r, work: [...s.work, op] };
    const breakdown = cache
      ? `${QKV_COST} for q, k and v, ${D_K * m} for the scores and ${D_K * m} for the blend`
      : `${2 * ROW_COST * m} to recompute K and V, ${ROW_COST} for q and ${SEEN_COST * m} for attention`;
    const memory = cache
      ? ` The cache holds ${plural(m, 'row')}, ${m * ROW_NUMBERS} numbers${w <= t ? ': the window is full, so it grows no more' : ''}.`
      : ` With a cache it would have cost ${tokenCost(m, true)}. Nothing is kept for the next token.`;
    yield {
      state: end,
      marks: [...rowMarks('z', t, D_K, 'found'), mark(`work-${t}-0`, 'new')],
      say: `Token ${t + 1} cost ${op} multiply-adds: ${breakdown}.${memory}`,
      lines: ['d-ret'],
      level: 1,
      vars: vars(end, op),
    };
    return end;
  },
};

export const ops = { prefill: prefillOp, generate: generateOp };

// ---------------------------------------------------------------------------------------------
// Pseudocode

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: KvSettings): PseudoBlock[] {
  const windowed = settings.window !== 'all';
  const w = windowed ? settings.window : '';
  const seen = windowed
    ? `the last ${w} tokens (itself included)`
    : 'itself and every token before it';
  const cache = settings.cache;
  const prefill = [
    L('p-sig', 0, 'PREFILL(prompt)', 'Read the whole prompt in one pass:'),
    L('p-embed', 1, 'X = embeddings of the prompt tokens', 'every word becomes its four numbers,'),
    L(
      'p-proj',
      1,
      'Q = X·W_Q, K = X·W_K, V = X·W_V',
      'and every word gets its query, key and value at once.',
    ),
    L(
      'p-attend',
      1,
      windowed
        ? `for each i: z_i = ATTEND(q_i, K[i−${w}+1..i], V[i−${w}+1..i])`
        : 'for each i: z_i = ATTEND(q_i, K[1..i], V[1..i])',
      `Each word attends to ${seen}.`,
    ),
    ...(cache
      ? [
          L(
            'p-keep',
            1,
            'cache.K = K, cache.V = V',
            'Keep the keys and values for the words to come.',
          ),
          ...(windowed
            ? [
                L(
                  'p-evict',
                  1,
                  `keep only the last ${w} rows`,
                  'Drop the rows the window has left behind.',
                ),
              ]
            : []),
        ]
      : []),
    L('p-ret', 1, 'return z_n', "The last word's output is what picks the next word."),
  ];
  const decode = [
    L('d-sig', 0, 'GENERATE(token)', 'Add one word to the text:'),
    L('d-embed', 1, 'x = embedding(token)', 'the new word becomes its four numbers.'),
    ...(cache
      ? [
          L(
            'd-proj',
            1,
            'q, k, v = x·W_Q, x·W_K, x·W_V',
            'Only the new word gets a query, key and value.',
          ),
          L(
            'd-append',
            1,
            'append k to cache.K, v to cache.V',
            'Add its key and value to the cache.',
          ),
          ...(windowed
            ? [
                L(
                  'd-evict',
                  1,
                  `if the cache has more than ${w} rows: drop the oldest`,
                  'A full window forgets its oldest word.',
                ),
              ]
            : []),
        ]
      : [
          L(
            'd-redo',
            1,
            windowed
              ? `K, V = X·W_K, X·W_V for the last ${w} tokens`
              : 'K, V = X·W_K, X·W_V for every token so far',
            'Nothing was kept, so compute every key and value again.',
          ),
          L('d-q', 1, 'q = x·W_Q', 'Then the new word’s query.'),
        ]),
    L(
      'd-score',
      1,
      `s_j = q · k_j / √d_k for each ${cache ? 'cached ' : ''}k_j`,
      'Score how well the new word’s question matches each key.',
    ),
    L('d-soft', 1, 'a = softmax(s)', 'Turn the scores into weights that add up to 1.'),
    L('d-blend', 1, 'z = Σ_j a_j · v_j', 'Blend the values by those weights.'),
    L('d-ret', 1, 'return z', 'Its output is what picks the word after it.'),
  ];
  return [
    { op: 'prefill', lines: prefill },
    { op: 'generate', lines: decode },
  ];
}

// ---------------------------------------------------------------------------------------------
// Words for screen readers and narration

export function initialSay(_s: S, settings: KvSettings): string {
  return `Nothing yet. Type a prompt and press Prefill: the model reads it in one pass${settings.cache ? ' and keeps every token’s key and value in the cache' : ''}. Then type the words that follow and press Generate, one token per step.`;
}

export const initialVars = (s: S) => vars(s, 0);

export function describe(s: S): string {
  if (!s.words.length) return 'No text yet.';
  const names = namesOf(s.words);
  const cached = s.k.length
    ? `The cache holds K and V for ${names.slice(s.from, s.from + s.k.length).join(', ')} (${s.k.length * ROW_NUMBERS} numbers).`
    : 'Nothing is cached.';
  const z = s.last ? ` The newest token's output is ${vec(s.last.z)}.` : '';
  return `Text: ${s.words.join(' ')} (${s.prompt} from the prompt). ${cached}${z} Multiply-adds so far: ${sum(s.work)}.`;
}
