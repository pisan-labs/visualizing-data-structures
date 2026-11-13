/**
 * Multi-head attention (Vaswani et al. 2017), with the key and value heads shared among query
 * heads as in multi-query attention (MQA, Shazeer 2019) and grouped-query attention (GQA,
 * Ainslie et al. 2023). Words come from the toy vocabulary, as on the self-attention page
 * (src/viz/self-attention/model.ts), whose sentence parser and hand-made head this page reuses.
 *
 *   d_model = 4, h query heads of width d = 4 / h, h_kv key/value heads (h, h/2 or 1)
 *   Q = X·W_Q (n × 4), K = X·W_K and V = X·W_V (n × h_kv·d)
 *   head i uses query columns i·d … i·d + d − 1 and key/value head g = ⌊i / (h / h_kv)⌋
 *   A_i = softmax(mask(Q_i·K_gᵀ / √d)), Z_i = A_i·V_g     (causal, as in a decoder)
 *   O = concat(Z_1, …, Z_h)·W_O
 *
 * The weights are made by hand: four patterns, one column each of W_Q, W_K and W_V. With four
 * heads each head has one pattern; with two, head 1 is the self-attention page's head (the
 * first two patterns) and head 2 has the other two; with one head, one head has all four. When
 * query heads share a key head, its weights are the mean of theirs, which is how Ainslie et al.
 * turn a trained multi-head model into a GQA one (before training it a little more).
 *
 * The KV cache keeps K and V for every word seen: 2 · h_kv · d numbers per word, per layer.
 */
import type { Mark, OpSpec, PseudoBlock, Scalar, Step } from '../../engine/types';
import { dot, matmul, short, softmax, two } from '../_lm/numbers';
import { embed, known } from '../_lm/vocab';
import { DESIGNED, parseSentence, START_TEXT, wordName } from '../self-attention/model';

export const D_MODEL = 4;

export type HeadsChoice = '1' | '2' | '4';
export type KvChoice = 'mha' | 'gqa' | 'mqa';

export interface MhaSettings {
  [key: string]: Scalar;
  heads: HeadsChoice;
  kv: KvChoice;
}

export const defaults: MhaSettings = { heads: '4', kv: 'mha' };

export interface Config {
  /** Query heads. */
  h: number;
  /** Width of each head. */
  d: number;
  /** Key/value heads. */
  hkv: number;
  /** Query heads per key/value head. */
  group: number;
}

export function config(set: MhaSettings): Config {
  const h = Number(set.heads) === 1 ? 1 : Number(set.heads) === 2 ? 2 : 4;
  const hkv = set.kv === 'mha' ? h : set.kv === 'gqa' ? Math.max(1, h / 2) : 1;
  return { h, d: D_MODEL / h, hkv, group: h / hkv };
}

/** The key/value head that query head i (from 0) reads. */
export const groupOf = (cfg: Config, i: number) => Math.floor(i / cfg.group);

/** Numbers the KV cache holds per word, in this one layer: K and V for every key/value head. */
export const cachePerWord = (cfg: Config) => 2 * cfg.hkv * cfg.d;

export interface Pattern {
  /** What the pattern looks for, for narration. */
  name: string;
  q: number[];
  k: number[];
  v: number[];
}

const col = (m: readonly (readonly number[])[], c: number) => m.map((row) => row[c]!);

/**
 * The four hand-made patterns. Rows of q, k, v are the features (animal, thing, action, small).
 * The first two are the columns of the self-attention page's head.
 */
export const PATTERNS: readonly Pattern[] = [
  {
    name: 'who did it (an action looks for an animal)',
    q: col(DESIGNED.wq, 0),
    k: col(DESIGNED.wk, 0),
    v: col(DESIGNED.wv, 0),
  },
  {
    name: 'which thing (a small word looks for a thing)',
    q: col(DESIGNED.wq, 1),
    k: col(DESIGNED.wk, 1),
    v: col(DESIGNED.wv, 1),
  },
  {
    name: 'what happened to it (a thing looks for an action)',
    q: [0, 2, 0, 0],
    k: [0, 0, 2, 0],
    v: [0, 0, 1, 0],
  },
  {
    name: 'its article (a noun looks for a small word)',
    q: [1, 1, 0, 0],
    k: [0, 0, 0, 2],
    v: [0, 0, 0, 1],
  },
];

const fromColumns = (cols: readonly (readonly number[])[]) =>
  Array.from({ length: D_MODEL }, (_, r) => cols.map((c) => c[r]!));

/**
 * The output projection, made by hand: each output column takes one column of the concatenated
 * heads and half of another, so the heads' results mix. A trained W_O is learned.
 */
export const W_O: readonly (readonly number[])[] = [
  [1, 0, 0.5, 0],
  [0, 1, 0, 0.5],
  [0.5, 0, 1, 0],
  [0, 0.5, 0, 1],
];

export interface Weights {
  wq: number[][];
  /** 4 × h_kv·d: the key heads side by side. */
  wk: number[][];
  wv: number[][];
  wo: number[][];
}

/** The weights for a setting, key and value heads pooled by the mean over each group. */
export function weights(cfg: Config): Weights {
  const full = (m: 'q' | 'k' | 'v') => fromColumns(PATTERNS.map((p) => p[m]));
  const pooled = (m: number[][]) =>
    m.map((row) => {
      const out: number[] = [];
      for (let g = 0; g < cfg.hkv; g++)
        for (let t = 0; t < cfg.d; t++) {
          let s = 0;
          for (let i = g * cfg.group; i < (g + 1) * cfg.group; i++) s += row[i * cfg.d + t]!;
          out.push(s / cfg.group);
        }
      return out;
    });
  return {
    wq: full('q'),
    wk: pooled(full('k')),
    wv: pooled(full('v')),
    wo: W_O.map((r) => [...r]),
  };
}

export interface HeadResult {
  /** q·k for every pair. */
  raw: number[][];
  /** Divided by √d, −∞ above the diagonal: what goes into softmax. */
  s: number[][];
  a: number[][];
  /** n × d. */
  z: number[][];
}

export interface Projection {
  q: number[][];
  k: number[][];
  v: number[][];
}

export interface MhaResult extends Projection {
  heads: HeadResult[];
  /** The heads' outputs side by side (n × 4). */
  z: number[][];
  o: number[][];
}

export const projectAll = (x: number[][], w: Weights): Projection => ({
  q: matmul(x, w.wq),
  k: matmul(x, w.wk),
  v: matmul(x, w.wv),
});

/** One head: query columns of head i against key/value head g, causal, scaled by √d. */
export function headAttention(p: Projection, cfg: Config, i: number): HeadResult {
  const g = groupOf(cfg, i);
  const qi = p.q.map((row) => row.slice(i * cfg.d, (i + 1) * cfg.d));
  const kg = p.k.map((row) => row.slice(g * cfg.d, (g + 1) * cfg.d));
  const vg = p.v.map((row) => row.slice(g * cfg.d, (g + 1) * cfg.d));
  const root = Math.sqrt(cfg.d);
  const raw = qi.map((q) => kg.map((k) => dot(q, k)));
  const s = raw.map((row, r) => row.map((t, c) => (c > r ? -Infinity : t / root)));
  const a = s.map((row) => softmax(row).p);
  return { raw, s, a, z: matmul(a, vg) };
}

/** The whole layer in the code tabs' order. */
export function multiHead(x: number[][], w: Weights, cfg: Config): MhaResult {
  const p = projectAll(x, w);
  const heads = Array.from({ length: cfg.h }, (_, i) => headAttention(p, cfg, i));
  const z = x.map((_, r) => heads.flatMap((hd) => hd.z[r]!));
  return { ...p, heads, z, o: matmul(z, w.wo) };
}

// ---------------------------------------------------------------------------------------------
// State

export interface MhaState {
  words: string[];
  x: number[][];
  proj?: Projection;
  result?: MhaResult;
}

export type CellKind = 'raw' | 'scaled' | 'weight';

/** What one step of `attend` shows. */
export interface MhaWork {
  r: MhaResult;
  /** How many of Q, K, V are filled (0 to 3). */
  qkv: number;
  /** The head on show in the attention table. */
  head: number;
  cells: (CellKind | null)[][];
  /** Heads whose output is in Z. */
  zHeads: number;
  /** 'o' once the output projection is done. */
  out: boolean;
}

export interface MhaExtra {
  work?: MhaWork;
  /** Q, K and V filled so far, during `project`. */
  qkv?: number;
}

type S = MhaState;
type X = MhaExtra;
type Op = OpSpec<S, MhaSettings, X>;
type MStep = Step<S, X>;

export function init(): S {
  const words = parseSentence(START_TEXT) as string[];
  return { words, x: words.map(embed) };
}

// ---------------------------------------------------------------------------------------------
// Steps

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });
const cells = (m: string, rows: number, c0: number, c1: number, role: Mark['role']) =>
  Array.from({ length: rows }, (_, r) =>
    Array.from({ length: c1 - c0 }, (_, c) => mark(`${m}-${r}-${c0 + c}`, role)),
  ).flat();
const rowCells = (m: string, r: number, c0: number, c1: number, role: Mark['role']) =>
  Array.from({ length: c1 - c0 }, (_, c) => mark(`${m}-${r}-${c0 + c}`, role));
const vec = (v: readonly number[]) => `(${v.map(two).join(', ')})`;
const headList = (xs: number[]) =>
  xs.length === 1
    ? `head ${xs[0]! + 1}`
    : `heads ${xs
        .slice(0, -1)
        .map((x) => x + 1)
        .join(', ')} and ${xs[xs.length - 1]! + 1}`;

/** The heads sharing key/value head g. */
export const sharers = (cfg: Config, g: number) =>
  Array.from({ length: cfg.group }, (_, t) => g * cfg.group + t);

export function headName(cfg: Config, i: number): string {
  const per = PATTERNS.length / cfg.h;
  const names = PATTERNS.slice(i * per, (i + 1) * per).map((p) => p.name.replace(/ \(.*\)$/, ''));
  return names.length === 1
    ? names[0]!
    : names.length === 2
      ? `${names[0]} and ${names[1]}`
      : 'all four patterns at once';
}

export function baseVars(s: S, set: MhaSettings): Record<string, Scalar> {
  const cfg = config(set);
  const per = cachePerWord(cfg);
  return {
    words: s.words.length,
    heads: cfg.h,
    'head width': cfg.d,
    'KV heads': cfg.hkv,
    'KV cache per word': per,
    'KV cache': per * s.words.length,
  };
}

function* projectSteps(
  s: S,
  set: MhaSettings,
  vars: () => Record<string, Scalar>,
  work: (qkv: number) => X,
): Generator<MStep, void, void> {
  const cfg = config(set);
  const n = s.words.length;
  const kw = cfg.hkv * cfg.d;
  const share =
    cfg.hkv === cfg.h
      ? `one key head per query head (${cfg.hkv} in all)`
      : cfg.hkv === 1
        ? `one key head that all ${cfg.h} query heads share`
        : `${cfg.hkv} key heads, each shared by ${cfg.group} query heads`;
  const parts: [string, string, number, string][] = [
    [
      'q',
      'pq',
      4,
      `Q = X·W_Q, four numbers per word, cut into ${cfg.h === 1 ? 'one head' : `${cfg.h} heads`} of ${cfg.d}. Each head asks its own question.`,
    ],
    [
      'k',
      'pk',
      kw,
      `K = X·W_K: ${share}, so K is ${kw} wide.${cfg.hkv < cfg.h ? ' A shared key head has the mean of the weights of the heads that share it.' : ''}`,
    ],
    [
      'v',
      'pv',
      kw,
      `V = X·W_V, as wide as K. The cache keeps K and V for every word: ${2 * kw} numbers per word.`,
    ],
  ];
  for (const [k, [m, line, w, say]] of parts.entries())
    yield {
      state: s,
      marks: cells(m, n, 0, w, 'new'),
      say,
      lines: [line],
      level: 2,
      vars: vars(),
      extra: work(k + 1),
    };
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
    const next: S = { words, x: words.map(embed) };
    const unknown = [...new Set(words.filter((w) => !known(w)))];
    const odd = unknown.length
      ? ` ${unknown.join(', ')} ${unknown.length === 1 ? 'is' : 'are'} not in the toy vocabulary, so ${unknown.length === 1 ? 'it gets' : 'they get'} made-up numbers.`
      : '';
    yield {
      state: next,
      marks: [],
      say: `${words.length === 1 ? 'One word' : `${words.length} words`}: ${words.join(' ')}. Each starts as its four-number embedding (animal, thing, action, small), as on the self-attention page.${odd} Press Attend.`,
      lines: ['embed'],
      level: 1,
      vars: baseVars(next, settings),
    };
    return next;
  },
};

const projectOp: Op = {
  label: 'Project',
  arity: 0,
  *run(s, _args, { settings }) {
    const w = weights(config(settings));
    yield* projectSteps(
      s,
      settings,
      () => baseVars(s, settings),
      (qkv) => ({ qkv }),
    );
    const next: S = { ...s, proj: projectAll(s.x, w), result: undefined };
    yield {
      state: next,
      marks: [],
      say: 'Every word has its queries, keys and values. Press Attend: each head attends on its own.',
      lines: ['pv'],
      level: 1,
      vars: baseVars(next, settings),
    };
    return next;
  },
};

const attendOp: Op = {
  label: 'Attend',
  arity: 0,
  *run(s, _args, { settings }) {
    const cfg = config(settings);
    const n = s.words.length;
    const r = multiHead(s.x, weights(cfg), cfg);
    const names = s.words.map((_, i) => wordName(s.words, i));
    let dots = 0;
    let head = 0;
    let grid: (CellKind | null)[][] = [];
    let zHeads = 0;
    let out = false;
    const fresh = () => Array.from({ length: n }, () => Array<CellKind | null>(n).fill(null));
    grid = fresh();
    const vars = () => ({ ...baseVars(s, settings), 'dot products': dots });
    const work = (qkv = 3): X => ({
      work: { r, qkv, head, cells: grid.map((row) => [...row]), zHeads, out },
    });
    const step = (say: string, lines: string[], level: 1 | 2 | 3, marks: Mark[] = []): MStep => ({
      state: s,
      marks,
      say,
      lines,
      level,
      vars: vars(),
      extra: work(),
    });

    if (!s.proj) yield* projectSteps(s, settings, vars, work);

    for (let i = 0; i < cfg.h; i++) {
      head = i;
      grid = fresh();
      const g = groupOf(cfg, i);
      const hd = r.heads[i]!;
      const qc: [number, number] = [i * cfg.d, (i + 1) * cfg.d];
      const kc: [number, number] = [g * cfg.d, (g + 1) * cfg.d];
      const others = sharers(cfg, g).filter((t) => t !== i);
      const shared = others.length ? `, which it shares with ${headList(others)}` : '';
      yield step(
        `Head ${i + 1} of ${cfg.h}: ${headName(cfg, i)}. Its query is ${cfg.d === 1 ? 'column' : 'columns'} ${qc[0] + 1}${cfg.d > 1 ? ` to ${qc[1]}` : ''} of Q; it reads key and value head ${g + 1}${shared}.`,
        ['head', 'kv'],
        2,
        [...cells('q', n, qc[0], qc[1], 'active'), ...cells('k', n, kc[0], kc[1], 'compare')],
      );
      for (let a = 0; a < n; a++)
        for (let b = 0; b < n; b++) {
          dots++;
          grid[a]![b] = 'raw';
          const q = r.q[a]!.slice(qc[0], qc[1]);
          const k = r.k[b]!.slice(kc[0], kc[1]);
          const terms = q.map((qv, t) => `${two(qv)} × ${two(k[t]!)}`).join(' + ');
          yield step(
            `Head ${i + 1}: ${names[a]} against ${names[b]}, q · k = ${terms} = ${two(hd.raw[a]![b]!)}.`,
            ['score'],
            3,
            [
              ...rowCells('q', a, qc[0], qc[1], 'active'),
              ...rowCells('k', b, kc[0], kc[1], 'compare'),
              mark(`a-${a}-${b}`, 'active'),
            ],
          );
        }
      for (const row of grid) row.fill('scaled');
      const root = Math.sqrt(cfg.d);
      yield step(
        `Head ${i + 1}'s scores, divided by √${cfg.d}${cfg.d === 1 ? ' = 1 (a head of width 1 needs no scaling)' : ` ≈ ${two(root)}`}, with the scores above the diagonal masked to −∞: a word sees only itself and the words before it.`,
        ['score', 'mask'],
        2,
      );
      for (let a = 0; a < n; a++) {
        grid[a]!.fill('weight');
        const top = hd.a[a]!.indexOf(Math.max(...hd.a[a]!));
        yield step(
          a === 0
            ? `Softmax of ${names[0]}'s row in head ${i + 1}: it sees only itself, weight 1.`
            : `Softmax of ${names[a]}'s row in head ${i + 1}: ${names[top]} gets ${short(hd.a[a]![top]!)}.`,
          ['soft'],
          3,
          [
            ...Array.from({ length: n }, (_, b) => mark(`a-${a}-${b}`, 'active')),
            mark(`a-${a}-${top}`, 'found'),
          ],
        );
      }
      const links = strongest(hd.a, s.words);
      yield step(
        `Head ${i + 1}'s weights, each row adding up to 1.${links.length ? ` It links ${links.map(([a, b]) => `${names[a]} → ${names[b]} (${short(hd.a[a]![b]!)})`).join(', ')}.` : ' No word has a clear favourite here.'}`,
        ['soft'],
        2,
        links.map(([a, b]) => mark(`a-${a}-${b}`, 'found')),
      );
      zHeads = i + 1;
      yield step(
        `z for head ${i + 1} = A·V: each word blends value head ${g + 1} by these weights. ${cfg.d === 1 ? 'One number' : `${cfg.d} numbers`} per word, in ${cfg.d === 1 ? 'column' : 'columns'} ${qc[0] + 1}${cfg.d > 1 ? ` to ${qc[1]}` : ''} of Z.`,
        ['out'],
        2,
        [...cells('v', n, kc[0], kc[1], 'visit'), ...cells('z', n, qc[0], qc[1], 'new')],
      );
    }

    yield step(
      `Concatenate: the ${cfg.h === 1 ? 'one head’s output is' : `${cfg.h} heads’ outputs, side by side, are`} four numbers per word again, the width of the embedding.`,
      ['cat'],
      2,
      cells('z', n, 0, D_MODEL, 'visit'),
    );
    out = true;
    const last = n - 1;
    yield step(
      `O = Z·W_O: the output projection mixes the heads, so each output number can use what every head found. ${names[last]} ends as ${vec(r.o[last]!)}.`,
      ['proj'],
      2,
      cells('z', n, 0, D_MODEL, 'new'),
    );

    const next: S = { ...s, proj: { q: r.q, k: r.k, v: r.v }, result: r };
    const per = cachePerWord(cfg);
    yield {
      state: next,
      marks: [],
      say: `Done: ${cfg.h === 1 ? 'one head of width 4, with its own keys and values' : `${cfg.h} heads of width ${cfg.d}, ${cfg.hkv === cfg.h ? 'each with its own keys and values' : cfg.hkv === 1 ? 'all sharing one key and value head' : `sharing ${cfg.hkv} key and value heads`}`}. The KV cache holds ${per} numbers per word, ${per * n} for ${n === 1 ? 'this one word' : `these ${n} words`}. ${summary(r, s.words, cfg)}`,
      lines: ['ret'],
      level: 1,
      vars: { ...baseVars(next, settings), 'dot products': cfg.h * n * n },
    };
    return next;
  },
};

/**
 * Rows with a clear favourite on another word (a weight of at least 0.4, at least 0.1 ahead of
 * the next), strongest first, at most two.
 */
export function strongest(a: number[][], words: readonly string[]): [number, number][] {
  const out: [number, number, number][] = [];
  a.forEach((row, i) => {
    const top = row.indexOf(Math.max(...row));
    const next = Math.max(0, ...row.filter((_, j) => j !== top));
    if (top !== i && words[top] !== words[i] && row[top]! >= 0.4 && row[top]! - next >= 0.1)
      out.push([i, top, row[top]!]);
  });
  return out
    .sort((p, q) => q[2] - p[2] || p[0] - q[0])
    .slice(0, 2)
    .map(([i, j]) => [i, j]);
}

/** Each head's strongest link, for the last step. */
function summary(r: MhaResult, words: readonly string[], cfg: Config): string {
  const names = words.map((_, i) => wordName(words, i));
  const parts = r.heads.map((hd, i) => {
    const l = strongest(hd.a, words)[0];
    return l
      ? `head ${i + 1} ${names[l[0]]} → ${names[l[1]]} (${short(hd.a[l[0]]![l[1]]!)})`
      : null;
  });
  const said = parts.filter(Boolean);
  if (said.length === 0) return 'No head has a clear favourite in this sentence.';
  return `Strongest links: ${said.join(', ')}.${cfg.h > 1 ? ' Step back to see each head’s table.' : ''}`;
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

export function pseudocode(settings: MhaSettings): PseudoBlock[] {
  const cfg = config(settings);
  const proj = [
    L('pq', 1, 'Q = X·W_Q', 'Each word gets its queries, one per head,'),
    L(
      'pk',
      1,
      'K = X·W_K',
      cfg.hkv === cfg.h ? 'its keys, one per head,' : `its keys, one per ${cfg.group} heads,`,
    ),
    L('pv', 1, 'V = X·W_V', 'and its values, shaped like the keys.'),
  ];
  const kv =
    cfg.hkv === cfg.h
      ? L('kv', 2, 'g = i', 'Each head has its own keys and values.')
      : cfg.hkv === 1
        ? L('kv', 2, 'g = 1', 'Every head reads the one shared key and value head.')
        : L(
            'kv',
            2,
            `g = ⌈i / ${cfg.group}⌉`,
            `Heads share keys and values in groups of ${cfg.group}.`,
          );
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
      lines: [L('psig', 0, 'PROJECT(X)', 'Make the views of each word:'), ...proj],
    },
    {
      op: 'attend',
      lines: [
        L('sig', 0, 'MULTI-HEAD(X)', 'Let several heads attend, each in its own way:'),
        ...proj,
        L('head', 1, `for each head i = 1 to ${cfg.h}`, 'For every head,'),
        kv,
        L(
          'score',
          2,
          `S = Q_i·K_gᵀ / √${cfg.d}`,
          "score each word's question against the keys it reads,",
        ),
        L('mask', 2, 'S[a][b] = −∞ for b > a', 'hide the words that come later,'),
        L('soft', 2, 'A_i = softmax(S) by rows', 'turn each row into weights,'),
        L('out', 2, 'Z_i = A_i·V_g', 'and blend the values by them.'),
        L('cat', 1, 'Z = concat(Z_1, …, Z_h)', 'Put the heads’ outputs side by side,'),
        L('proj', 1, 'O = Z·W_O', 'mix them with one more matrix,'),
        L('ret', 1, 'return O', 'and pass the result on.'),
      ],
    },
  ];
}

// ---------------------------------------------------------------------------------------------
// Words for screen readers and narration

export function initialSay(s: S, settings: MhaSettings): string {
  const cfg = config(settings);
  return `${s.words.length} words: ${s.words.join(' ')}. ${cfg.h === 1 ? 'One head' : `${cfg.h} heads`} of width ${cfg.d} will attend, each looking for something different. Press Attend.`;
}

export const initialVars = (s: S, settings: MhaSettings) => baseVars(s, settings);

export function describe(s: S): string {
  const base = `Words: ${s.words.join(' ')}.`;
  if (!s.result) return `${base} Not attended yet.`;
  const names = s.words.map((_, i) => wordName(s.words, i));
  return `${base} ${s.result.heads
    .map(
      (hd, h) =>
        `Head ${h + 1} weights: ${hd.a
          .map(
            (row, i) =>
              `${names[i]}: ${row
                .slice(0, i + 1)
                .map((w, j) => `${names[j]} ${short(w)}`)
                .join(', ')}`,
          )
          .join('; ')}.`,
    )
    .join(' ')} Outputs: ${s.result.o.map((row, i) => `${names[i]} ${vec(row)}`).join(', ')}.`;
}
