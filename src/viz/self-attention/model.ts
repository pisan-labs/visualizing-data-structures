/**
 * Self-attention, one head (scaled dot-product attention, Vaswani et al. 2017), on a sentence of
 * at most seven words from the toy vocabulary (src/viz/_lm/vocab.ts).
 *
 *   Q = X·W_Q   K = X·W_K   V = X·W_V          (X: n × 4, each W: 4 × 2)
 *   S[i][j] = q_i · k_j / √d_k                  (d_k = 2)
 *   S[i][j] = −∞ for j > i                      (the causal mask)
 *   A[i] = softmax(S[i])                        (each row adds up to 1)
 *   z_i = Σ_j A[i][j] · v_j
 *
 * Settings
 *   causal   true: a word sees only itself and the words before it (a decoder, like GPT; the
 *            default on these pages); false: every word sees every word (an encoder, like BERT)
 *   scale    true: divide the scores by √d_k (Vaswani et al.); false: raw dot products
 *   weights  'designed': a head made by hand (below), so the pattern can be read;
 *            'random': an untrained head, one decimal per weight from the seeded RNG, drawn
 *            again at each load
 *
 * Operations: load (a sentence), project (Q, K and V only), attend (project if needed, then
 * scores, scaling, mask, softmax and the outputs). The arithmetic runs in the same order as the
 * code tabs (src/viz/_lm/numbers.ts).
 */
import { makeRng, type Rng } from '../../engine/rng';
import type { Mark, OpSpec, PseudoBlock, Scalar, Step } from '../../engine/types';
import { dot, matmul, short, softmax, two } from '../_lm/numbers';
import { embed, known } from '../_lm/vocab';

export const D_K = 2;
export const MAX_WORDS = 7;
export const START_TEXT = 'the cat sat on the mat';

export type Weights = 'designed' | 'random';

export interface AttnSettings {
  [key: string]: Scalar;
  causal: boolean;
  scale: boolean;
  weights: Weights;
}

export const defaults: AttnSettings = { causal: true, scale: true, weights: 'designed' };

export interface Head {
  wq: number[][];
  wk: number[][];
  wv: number[][];
}

/**
 * The head made by hand. Rows are the features (animal, thing, action, small); columns the
 * two dimensions of queries and keys, "animal" and "thing".
 * - Queries: an action looks for an animal (who did it); a small word looks for a thing.
 * - Keys: animals and things answer; small words point away, so nobody looks at "the".
 * - Values: a word passes on how much of an animal and how much of a thing it is.
 */
export const DESIGNED: Head = {
  wq: [
    [0, 0],
    [0, 0],
    [2, 0],
    [0, 1],
  ],
  wk: [
    [2, 0],
    [0, 2],
    [0, 0],
    [-1, -1],
  ],
  wv: [
    [1, 0],
    [0, 1],
    [0, 0],
    [0, 0],
  ],
};

export function randomHead(rng: Rng): Head {
  const m = () =>
    Array.from({ length: 4 }, () => Array.from({ length: D_K }, () => rng.int(-10, 10) / 10));
  return { wq: m(), wk: m(), wv: m() };
}

export interface Projection {
  q: number[][];
  k: number[][];
  v: number[][];
}

export interface AttnResult extends Projection {
  /** q_i · k_j. */
  raw: number[][];
  /** Scaled (when scaling is on), not masked. */
  scaled: number[][];
  /** What goes into softmax: scaled, with −∞ above the diagonal when causal. */
  s: number[][];
  a: number[][];
  z: number[][];
  causal: boolean;
  scale: boolean;
}

export interface AttnState {
  words: string[];
  x: number[][];
  head: Head;
  /** Q, K and V, once projected. */
  proj?: Projection;
  /** The whole computation, once attended. */
  result?: AttnResult;
}

/** What one step of `attend` shows. */
export interface AttnWork {
  r: AttnResult;
  /** How many of Q, K, V are filled (0 to 3). */
  qkv: number;
  /** What each attention cell shows. */
  cells: (CellKind | null)[][];
  /** Rows of Z filled. */
  zRows: number;
  stage: 'scores' | 'scaled' | 'masked' | 'weights';
}

export type CellKind = 'raw' | 'scaled' | 'masked' | 'weight';

export interface AttnExtra {
  work?: AttnWork;
  /** Q, K and V filled so far, during `project`. */
  qkv?: number;
}

type S = AttnState;
type X = AttnExtra;
type Op = OpSpec<S, AttnSettings, X>;
type AStep = Step<S, X>;

export const project = (x: number[][], h: Head): Projection => ({
  q: matmul(x, h.wq),
  k: matmul(x, h.wk),
  v: matmul(x, h.wv),
});

/** The whole computation in the code tabs' order. */
export function attention(x: number[][], h: Head, causal: boolean, scale: boolean): AttnResult {
  const p = project(x, h);
  const root = Math.sqrt(D_K);
  const raw = p.q.map((qi) => p.k.map((kj) => dot(qi, kj)));
  const scaled = raw.map((row) => row.map((t) => (scale ? t / root : t)));
  const s = scaled.map((row, i) => row.map((t, j) => (causal && j > i ? -Infinity : t)));
  const a = s.map((row) => softmax(row).p);
  return { ...p, raw, scaled, s, a, z: matmul(a, p.v), causal, scale };
}

// ---------------------------------------------------------------------------------------------
// Words

/** Words in order, lower case, punctuation dropped; an Error says what is wrong. */
export function parseSentence(text: string): string[] | Error {
  const words = text
    .toLowerCase()
    .replace(/[.,!?;:"']/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return new Error('Type a sentence first, such as "the cat sat".');
  if (words.length > MAX_WORDS)
    return new Error(`Keep it to ${MAX_WORDS} words, so every number stays readable.`);
  const bad = words.find((w) => !/^[a-z]{1,6}$/.test(w));
  if (bad) return new Error(`Use words of letters only, six at most ("${bad}" is not).`);
  return words;
}

/** Name word i, with its position when the word appears more than once: "the (5)". */
export function wordName(words: readonly string[], i: number): string {
  const w = words[i]!;
  return words.filter((u) => u === w).length > 1 ? `${w} (${i + 1})` : w;
}

export function init(settings: AttnSettings): S {
  const words = parseSentence(START_TEXT) as string[];
  return {
    words,
    x: words.map(embed),
    head: settings.weights === 'random' ? randomHead(makeRng(1)) : DESIGNED,
  };
}

// ---------------------------------------------------------------------------------------------
// Steps

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });
const rowMarks = (m: string, i: number, cols: number, role: Mark['role']) =>
  Array.from({ length: cols }, (_, c) => mark(`${m}-${i}-${c}`, role));
const vec = (v: readonly number[]) => `(${v.map(two).join(', ')})`;

export function baseVars(s: S): Record<string, Scalar> {
  return { words: s.words.length, d_model: 4, d_k: D_K };
}

/** The word with the largest query, for narration. */
function loudest(m: number[][]): number {
  let best = 0;
  m.forEach((row, i) => {
    if (row.reduce((t, v) => t + Math.abs(v), 0) > m[best]!.reduce((t, v) => t + Math.abs(v), 0))
      best = i;
  });
  return best;
}

/** The yields that fill Q, K and V, each its own step. */
function* projectSteps(
  s: S,
  p: Projection,
  vars: () => Record<string, Scalar>,
  work: (qkv: number) => X,
): Generator<AStep, void, void> {
  const n = s.words.length;
  const names = s.words.map((_, i) => wordName(s.words, i));
  const iq = loudest(p.q);
  const ik = loudest(p.k);
  const iv = loudest(p.v);
  const parts: [string, string, number, string][] = [
    [
      'q',
      'pq',
      iq,
      `Q = X·W_Q: each word's query, what it is looking for. ${names[iq]} asks for ${vec(p.q[iq]!)}.`,
    ],
    [
      'k',
      'pk',
      ik,
      `K = X·W_K: each word's key, what it offers to a matching query. ${names[ik]} offers ${vec(p.k[ik]!)}.`,
    ],
    [
      'v',
      'pv',
      iv,
      `V = X·W_V: each word's value, what it passes on to whoever attends to it. ${names[iv]} passes on ${vec(p.v[iv]!)}.`,
    ],
  ];
  for (const [k, [m, line, i, say]] of parts.entries()) {
    yield {
      state: s,
      marks: [
        ...Array.from({ length: n }, (_, r) => rowMarks(m, r, D_K, 'new')).flat(),
        ...rowMarks(m, i, D_K, 'active'),
      ],
      say,
      lines: [line],
      level: 2,
      vars: vars(),
      extra: work(k + 1),
    };
  }
}

const loadOp: Op = {
  label: 'Load',
  arity: 1,
  *run(s, args, { settings, rng }) {
    const words = parseSentence(String(args[0]));
    if (words instanceof Error) {
      yield { state: s, marks: [], say: words.message, lines: [], level: 1, vars: baseVars(s) };
      return s;
    }
    const head = settings.weights === 'random' ? randomHead(rng) : s.head;
    const next: S = { words, x: words.map(embed), head };
    const unknown = [...new Set(words.filter((w) => !known(w)))];
    const odd = unknown.length
      ? ` ${unknown.join(', ')} ${unknown.length === 1 ? 'is' : 'are'} not in the toy vocabulary, so ${unknown.length === 1 ? 'it gets' : 'they get'} made-up numbers.`
      : '';
    const fresh = settings.weights === 'random' ? ' The head gets new random weights.' : '';
    yield {
      state: next,
      marks: words.map((_, r) => rowMarks('x', r, 4, 'new')).flat(),
      say: `${words.length === 1 ? 'One word' : `${words.length} words`}: ${words.join(' ')}. Each starts as its embedding, four numbers: how much it is an animal, a thing, an action and a small word (the, a, on).${odd}${fresh} Press Attend.`,
      lines: ['embed'],
      level: 1,
      vars: baseVars(next),
    };
    return next;
  },
};

const projectOp: Op = {
  label: 'Project',
  arity: 0,
  *run(s, _args, { settings }) {
    const p = project(s.x, s.head);
    yield* projectSteps(
      s,
      p,
      () => baseVars(s),
      (qkv) => ({ qkv }),
    );
    const next: S = { ...s, proj: p, result: undefined };
    yield {
      state: next,
      marks: [],
      say: `Every word has its query, key and value. Press Attend to score each query against the keys${settings.causal ? ' it may see' : ''}.`,
      lines: ['pv'],
      level: 1,
      vars: baseVars(next),
    };
    return next;
  },
};

const attendOp: Op = {
  label: 'Attend',
  arity: 0,
  *run(s, _args, { settings }) {
    const { causal, scale } = settings;
    const n = s.words.length;
    const r = attention(s.x, s.head, causal, scale);
    const names = s.words.map((_, i) => wordName(s.words, i));
    const root = Math.sqrt(D_K);
    let dots = 0;
    const cells: (CellKind | null)[][] = Array.from({ length: n }, () =>
      Array<CellKind | null>(n).fill(null),
    );
    let zRows = 0;
    let stage: AttnWork['stage'] = 'scores';
    const vars = () => ({ ...baseVars(s), 'dot products': dots });
    const work = (qkv = 3): X => ({
      work: { r, qkv, cells: cells.map((row) => [...row]), zRows, stage },
    });
    const step = (say: string, lines: string[], level: 1 | 2 | 3, marks: Mark[] = []): AStep => ({
      state: s,
      marks,
      say,
      lines,
      level,
      vars: vars(),
      extra: work(),
    });

    if (!s.proj) yield* projectSteps(s, r, vars, work);

    // Scores, row by row.
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        dots++;
        cells[i]![j] = 'raw';
        const terms = r.q[i]!.map((qv, t) => `${two(qv)} × ${two(r.k[j]![t]!)}`).join(' + ');
        yield step(
          `Score ${names[i]} against ${names[j]}: q · k = ${terms} = ${two(r.raw[i]![j]!)}.`,
          ['for', 'score'],
          3,
          [
            ...rowMarks('q', i, D_K, 'active'),
            ...rowMarks('k', j, D_K, 'compare'),
            mark(`a-${i}-${j}`, 'active'),
          ],
        );
      }
      const top = r.raw[i]!.indexOf(Math.max(...r.raw[i]!));
      yield step(
        `${names[i]}'s query against every key: ${r.raw[i]!.map(two).join(', ')}. The best match is ${names[top]}.`,
        ['for', 'score'],
        2,
        [
          ...rowMarks('q', i, D_K, 'active'),
          ...rowMarks('a', i, n, 'active'),
          mark(`a-${i}-${top}`, 'found'),
        ],
      );
    }

    if (scale) {
      stage = 'scaled';
      for (const row of cells) row.fill('scaled');
      yield step(
        `Divide every score by √d_k = √${D_K} ≈ ${two(root)}. With wider keys the dot products grow, and softmax would turn them into all-or-nothing weights; dividing keeps them in a useful range.`,
        ['scale'],
        2,
      );
    }

    if (causal) {
      stage = 'masked';
      const hidden: Mark[] = [];
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++) {
          cells[i]![j] = j > i ? 'masked' : scale ? 'scaled' : 'raw';
          if (j > i) hidden.push(mark(`a-${i}-${j}`, 'stale'));
        }
      yield step(
        n === 1
          ? 'The causal mask hides the words after each word. There are none: one word sees only itself.'
          : `The causal mask: a word may look only at itself and the words before it, so the ${(n * (n - 1)) / 2} scores above the diagonal become −∞. Softmax will give them weight 0. This is what lets a model learn to predict the next word without seeing it.`,
        ['mask'],
        2,
        hidden,
      );
    }

    // Softmax, row by row.
    stage = 'weights';
    for (let i = 0; i < n; i++) {
      cells[i]!.fill('weight');
      const sm = softmax(r.s[i]!);
      const seen = r.s[i]!.map((v, j) => [v, j] as const).filter(([v]) => v !== -Infinity);
      const top = r.a[i]!.indexOf(Math.max(...r.a[i]!));
      const exps = seen.map(([, j]) => two(sm.e[j]!)).join(' + ');
      yield step(
        seen.length === 1
          ? `Softmax of ${names[i]}'s row: it sees only itself, so it gets weight 1.`
          : `Softmax of ${names[i]}'s row: subtract the largest score (${two(sm.max)}), take e to each, add them up (${exps} = ${two(sm.sum)}) and divide. ${names[top]} gets ${short(r.a[i]![top]!)}; the row adds up to 1.`,
        ['soft'],
        2,
        [...rowMarks('a', i, n, 'active'), mark(`a-${i}-${top}`, 'found')],
      );
    }

    // Outputs, row by row.
    for (let i = 0; i < n; i++) {
      zRows = i + 1;
      const used = r.a[i]!.map((w, j) => [w, j] as const).filter(([w]) => w >= 0.005);
      const sum = used.map(([w, j]) => `${short(w)}·v_${names[j]}`).join(' + ');
      yield step(
        `z_${names[i]} = ${sum} = ${vec(r.z[i]!)}. ${names[i]} now carries a blend of the values it attended to.`,
        ['out'],
        2,
        [
          ...rowMarks('a', i, n, 'visit'),
          ...used.flatMap(([, j]) => rowMarks('v', j, D_K, 'visit')),
          ...rowMarks('z', i, D_K, 'new'),
        ],
      );
    }

    const next: S = { ...s, proj: { q: r.q, k: r.k, v: r.v }, result: r };
    const links = strongest(r, s.words);
    yield {
      state: next,
      marks: links.map(([i, j]) => mark(`a-${i}-${j}`, 'found')),
      say: `Done: each word's output is a blend of the values it attended to.${
        links.length
          ? ` Strongest links: ${links.map(([i, j]) => `${names[i]} → ${names[j]} (${short(r.a[i]![j]!)})`).join(', ')}.`
          : ''
      }`,
      lines: ['ret'],
      level: 1,
      vars: { ...baseVars(next), 'dot products': n * n },
    };
    return next;
  },
};

/**
 * Rows with a clear favourite on another word (a weight of at least 0.4, at least 0.1 ahead of
 * the next), strongest first, at most three.
 */
export function strongest(r: AttnResult, words: readonly string[]): [number, number][] {
  const out: [number, number, number][] = [];
  r.a.forEach((row, i) => {
    const top = row.indexOf(Math.max(...row));
    const next = Math.max(0, ...row.filter((_, j) => j !== top));
    if (top !== i && words[top] !== words[i] && row[top]! >= 0.4 && row[top]! - next >= 0.1)
      out.push([i, top, row[top]!]);
  });
  return out
    .sort((p, q) => q[2] - p[2] || p[0] - q[0])
    .slice(0, 3)
    .map(([i, j]) => [i, j]);
}

export const ops = { load: loadOp, project: projectOp, attend: attendOp };

// ---------------------------------------------------------------------------------------------
// Pseudocode

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: AttnSettings): PseudoBlock[] {
  const proj = [
    L('pq', 1, 'Q = X·W_Q', 'Each word gets a query: what it is looking for.'),
    L('pk', 1, 'K = X·W_K', 'and a key: what it offers.'),
    L('pv', 1, 'V = X·W_V', 'and a value: what it passes on.'),
  ];
  const attend = [
    L('sig', 0, 'SELF-ATTENTION(X)', 'Let every word gather information from the words it sees:'),
    ...proj,
    L('for', 1, 'for i = 1 to n, for j = 1 to n', 'For every pair of words,'),
    L('score', 2, 'S[i][j] = q_i · k_j', "score how well word i's query matches word j's key."),
    ...(settings.scale
      ? [L('scale', 1, 'S = S / √d_k', 'Shrink the scores, so softmax is not all-or-nothing.')]
      : []),
    ...(settings.causal
      ? [L('mask', 1, 'S[i][j] = −∞ for every j > i', 'A word may not look at the words after it.')]
      : []),
    L(
      'soft',
      1,
      'A[i] = softmax(S[i]) for each row i',
      'Turn each row into weights that add up to 1.',
    ),
    L(
      'out',
      1,
      'z_i = Σ_j A[i][j] · v_j',
      "Each word's output blends the values by those weights.",
    ),
    L('ret', 1, 'return Z', 'The outputs go on to the next layer.'),
  ];
  return [
    {
      op: 'load',
      lines: [
        L('lsig', 0, 'LOAD(words)', 'Start from a sentence:'),
        L('embed', 1, 'x_i = embedding(word_i)', 'each word becomes its vector of four numbers.'),
      ],
    },
    {
      op: 'project',
      lines: [L('psig', 0, 'PROJECT(X)', 'Make the three views of each word:'), ...proj],
    },
    { op: 'attend', lines: attend },
  ];
}

// ---------------------------------------------------------------------------------------------
// Words for screen readers and narration

export function initialSay(s: S): string {
  return `${s.words.length} words: ${s.words.join(' ')}, each as four numbers (its embedding). Press Attend: every word scores the others, turns the scores into weights, and takes a weighted blend of their values.`;
}

export const initialVars = (s: S) => baseVars(s);

export function describe(s: S): string {
  const base = `Words: ${s.words.join(' ')}.`;
  if (!s.result) return `${base} Not attended yet.`;
  const names = s.words.map((_, i) => wordName(s.words, i));
  return `${base} Attention weights by row: ${s.result.a
    .map((row, i) => `${names[i]}: ${row.map((w, j) => `${names[j]} ${short(w)}`).join(', ')}`)
    .join('; ')}.`;
}
