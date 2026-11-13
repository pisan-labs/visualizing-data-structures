/**
 * Positional encoding: how a transformer learns where a word is. Attention alone treats a
 * sentence as a bag of words (the self-attention page's "same word twice" example), so every
 * model adds position somewhere. Three ways, as a setting:
 *
 *   sinusoidal (Vaswani et al. 2017)  a vector added to each word's embedding:
 *       PE[pos][2i] = sin(pos / 10000^(2i/d)),  PE[pos][2i+1] = cos(pos / 10000^(2i/d))
 *   RoPE (Su et al. 2021)             turn each pair (2i, 2i+1) of a query and a key by the
 *       angle pos / 10000^(2i/d); the score of query m and key n then depends on m − n only
 *   ALiBi (Press et al. 2022)         nothing added to the words; the score of query i for key
 *       j gets −slope · (i − j), so far words count less
 *
 * Positions count from 0; d = 8, so there are four pairs, turning at 1, 1/10, 1/100 and 1/1000
 * radians per position. Queries and keys come from the self-attention page's hand-made head
 * (two numbers each); for RoPE that pair is copied into each of the four pairs, so you can see
 * one match turned at four speeds. ALiBi uses one head with the slope Press et al. give the
 * first of eight heads, 1/2.
 *
 * Operations: load (a sentence), encode (the scheme's table: the encodings, the angles or the
 * biases), score (what the positions do to the scores: PE(m)·PE(n), the turned q_m·k_n, or
 * attention with the bias).
 */
import type { Mark, OpSpec, PseudoBlock, Scalar, Step } from '../../engine/types';
import { dot, short, softmax, two } from '../_lm/numbers';
import { embed, known } from '../_lm/vocab';
import { attention, DESIGNED, parseSentence, project, START_TEXT } from '../self-attention/model';

export const D = 8;
export const PAIRS = D / 2;
export const BASE = 10000;
export const SLOPE = 0.5;

export type Scheme = 'sinusoidal' | 'rope' | 'alibi';

export interface PosSettings {
  [key: string]: Scalar;
  scheme: Scheme;
}

export const defaults: PosSettings = { scheme: 'sinusoidal' };

/** What pair i divides the position by: 10000^(2i/d), so 1, 10, 100 and 1000. */
export const divisor = (i: number) => Math.pow(BASE, (2 * i) / D);
/** The angle of pair i at a position, in radians. */
export const angle = (pos: number, i: number) => pos / divisor(i);

/** Vaswani et al.'s table: one row per position, sin and cos for each pair. */
export function sinusoidal(n: number): number[][] {
  return Array.from({ length: n }, (_, pos) => {
    const row: number[] = [];
    for (let i = 0; i < PAIRS; i++) row.push(Math.sin(angle(pos, i)), Math.cos(angle(pos, i)));
    return row;
  });
}

/** RoPE: turn each pair (v[2i], v[2i+1]) by the angle of pair i at pos. */
export function rotate(v: readonly number[], pos: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < v.length / 2; i++) {
    const a = angle(pos, i);
    const [x, y] = [v[2 * i]!, v[2 * i + 1]!];
    out.push(x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a));
  }
  return out;
}

/** ALiBi's bias for query i and key j: −slope · (i − j), or −∞ for a key after the query. */
export const bias = (i: number, j: number) => (j > i ? -Infinity : -SLOPE * (i - j));

export interface Content {
  /** The self-attention head's query and key for each word (two numbers each). */
  q: number[][];
  k: number[][];
}

/** A query or key copied into all four pairs, before RoPE turns it. */
export const spread = (v: readonly number[]) => Array.from({ length: PAIRS }, () => [...v]).flat();

export function content(x: number[][]): Content {
  const p = project(x, DESIGNED);
  return { q: p.q, k: p.k };
}

export interface RopeScores {
  q: number[][];
  k: number[][];
  s: number[][];
}

/** Every query against every key, each turned by its own position. */
export function ropeScores(c: Content): RopeScores {
  const q = c.q.map((v, m) => rotate(spread(v), m));
  const k = c.k.map((v, n) => rotate(spread(v), n));
  return { q, k, s: q.map((qm) => k.map((kn) => dot(qm, kn))) };
}

export interface AlibiResult {
  /** q·k / √2, from the self-attention page's head. */
  content: number[][];
  /** Content plus bias, −∞ above the diagonal. */
  s: number[][];
  a: number[][];
}

export function alibiAttention(x: number[][]): AlibiResult {
  const r = attention(x, DESIGNED, true, true);
  const s = r.scaled.map((row, i) => row.map((t, j) => (j > i ? -Infinity : t + bias(i, j))));
  return { content: r.scaled, s, a: s.map((row) => softmax(row).p) };
}

/** The table `encode` fills: the encodings, the angles, or the biases. */
export function encodeTable(scheme: Scheme, n: number): number[][] {
  if (scheme === 'sinusoidal') return sinusoidal(n);
  if (scheme === 'rope')
    return Array.from({ length: n }, (_, p) =>
      Array.from({ length: PAIRS }, (_, i) => angle(p, i)),
    );
  return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => bias(i, j)));
}

/** The table `score` fills. */
export function scoreTable(scheme: Scheme, x: number[][]): number[][] {
  const n = x.length;
  if (scheme === 'sinusoidal') {
    const pe = sinusoidal(n);
    return pe.map((a) => pe.map((b) => dot(a, b)));
  }
  if (scheme === 'rope') return ropeScores(content(x)).s;
  return alibiAttention(x).a;
}

// ---------------------------------------------------------------------------------------------
// State

export interface PosState {
  words: string[];
  x: number[][];
  /** The scheme's table, once encoded. */
  table?: number[][];
  /** The scores, once scored. */
  scores?: number[][];
  /** The query and key positions the dials show. */
  focus?: [number, number];
}

export type Stage = 'content' | 'biased' | 'weight';

export interface PosExtra {
  /** Cells of the encode table filled so far, row by row. */
  filled?: number;
  /** Cells of the score table filled so far, row by row. */
  scored?: number;
  /** ALiBi's attention table: what its cells show. */
  stage?: Stage;
  /** Rows of ALiBi's attention table turned into weights. */
  rows?: number;
  focus?: [number, number];
  /** The score table in progress (the final one, cut at `scored`). */
  table?: number[][];
  scores?: number[][];
}

type S = PosState;
type X = PosExtra;
type Op = OpSpec<S, PosSettings, X>;
type PStep = Step<S, X>;

export function init(): S {
  const words = parseSentence(START_TEXT) as string[];
  return { words, x: words.map(embed) };
}

// ---------------------------------------------------------------------------------------------
// Steps

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });
const posName = (words: readonly string[], p: number) => `${words[p]} (${p})`;
/** An angle in radians, at most three decimals: 6, 0.6, 0.06, 0.006. */
const rad = (x: number) => String(Number(x.toFixed(3)));

export function baseVars(s: S, set: PosSettings): Record<string, Scalar> {
  return {
    positions: s.words.length,
    d: D,
    pairs: PAIRS,
    ...(set.scheme === 'alibi' ? { slope: '1/2' } : { base: BASE }),
  };
}

const SCHEME_NAME: Record<Scheme, string> = {
  sinusoidal: 'sinusoidal encoding',
  rope: 'RoPE',
  alibi: 'ALiBi',
};

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
      say: `${words.length === 1 ? 'One word, at position 0' : `${words.length} words at positions 0 to ${words.length - 1}`}: ${words.join(' ')}.${odd} Press Encode to give each position its ${settings.scheme === 'alibi' ? 'bias' : 'turn'}.`,
      lines: ['lpos'],
      level: 1,
      vars: baseVars(next, settings),
    };
    return next;
  },
};

const encodeOp: Op = {
  label: 'Encode',
  arity: 0,
  *run(s, _args, { settings }) {
    const { scheme } = settings;
    const n = s.words.length;
    const table = encodeTable(scheme, n);
    const cols = table[0]!.length;
    const vars = () => baseVars(s, settings);
    let filled = 0;
    const step = (
      say: string,
      lines: string[],
      level: 1 | 2 | 3,
      marks: Mark[],
      focus: [number, number],
    ): PStep => ({
      state: s,
      marks,
      say,
      lines,
      level,
      vars: vars(),
      extra: { filled, focus, scores: undefined, table },
    });
    if (scheme === 'alibi') {
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          filled++;
          if (j > i) continue;
          yield step(
            `${posName(s.words, i)} looking at ${posName(s.words, j)}: ${i - j === 0 ? 'distance 0, bias 0' : `distance ${i - j}, bias −1/2 × ${i - j} = ${two(table[i]![j]!)}`}.`,
            ['bias'],
            3,
            [mark(`e-${i}-${j}`, 'active')],
            [i, j],
          );
        }
        yield step(
          i === 0
            ? `Row 0: the first word sees only itself, with bias 0. The words after a word are masked, as in any decoder.`
            : `Row ${i}: the further back a word is, the more its score is pushed down, 1/2 for each step. ${posName(s.words, 0)} gets ${two(table[i]![0]!)}.`,
          ['bias'],
          2,
          Array.from({ length: i + 1 }, (_, j) => mark(`e-${i}-${j}`, 'active')),
          [i, 0],
        );
      }
    } else {
      for (let p = 0; p < n; p++) {
        for (let i = 0; i < PAIRS; i++) {
          const a = angle(p, i);
          if (scheme === 'sinusoidal') {
            filled += 2;
            yield step(
              `Position ${p}, pair ${i}: the angle is ${p} / ${divisor(i)} = ${rad(a)} radians. sin = ${two(table[p]![2 * i]!)}, cos = ${two(table[p]![2 * i + 1]!)}.`,
              ['ang', 'sin'],
              3,
              [
                mark(`e-${p}-${2 * i}`, 'active'),
                mark(`e-${p}-${2 * i + 1}`, 'active'),
                mark(`dial-${i}`, 'active'),
              ],
              [p, p],
            );
          } else {
            filled++;
            yield step(
              `Position ${p}, pair ${i}: turn by ${p} / ${divisor(i)} = ${rad(a)} radians${a >= 2 * Math.PI ? `, more than a full turn (2π ≈ 6.28)` : ''}.`,
              ['ang'],
              3,
              [mark(`e-${p}-${i}`, 'active'), mark(`dial-${i}`, 'active')],
              [p, p],
            );
          }
        }
        const turns = Array.from({ length: PAIRS }, (_, i) => rad(angle(p, i)));
        yield step(
          p === 0
            ? scheme === 'sinusoidal'
              ? 'Position 0: every angle is 0, so each pair is (sin 0, cos 0) = (0, 1).'
              : 'Position 0: every angle is 0. The first word is not turned at all.'
            : `Position ${p}: the four pairs ${scheme === 'sinusoidal' ? 'sit at' : 'turn by'} ${turns.join(', ')} radians. Pair 0 turns fastest, pair 3 slowest: each pair is 10 times slower than the one before.`,
          scheme === 'sinusoidal' ? ['ang', 'sin', 'cos'] : ['ang'],
          2,
          Array.from({ length: cols }, (_, c) => mark(`e-${p}-${c}`, 'active')),
          [p, p],
        );
      }
    }
    const focus: [number, number] = scheme === 'alibi' ? [n - 1, 0] : [n - 1, n - 1];
    const next: S = { ...s, table, scores: undefined, focus };
    const say: Record<Scheme, string> = {
      sinusoidal: `Every position has its vector of ${D} sines and cosines, to be added to the word's embedding. Nearby positions get similar vectors. Press Score to compare them.`,
      rope: `Every position has its four angles. RoPE turns each query and key by them, inside attention; nothing is added to the words. Press Score.`,
      alibi: `The bias table is done. ALiBi adds nothing to the words: it pushes down the scores of distant words, 1/2 per step. Press Score to attend with it.`,
    };
    yield {
      state: next,
      marks: [],
      say: say[scheme],
      lines: ['eret'],
      level: 1,
      vars: vars(),
    };
    return next;
  },
};

const scoreOp: Op = {
  label: 'Score',
  arity: 0,
  *run(s, _args, { settings }) {
    const { scheme } = settings;
    const n = s.words.length;
    const table = s.table ?? encodeTable(scheme, n);
    const scores = scoreTable(scheme, s.x);
    const vars = () => baseVars(s, settings);
    let scored = 0;
    const base = (extra: Partial<X>): X => ({ table, filled: n * table[0]!.length, ...extra });
    const step = (
      say: string,
      lines: string[],
      level: 1 | 2 | 3,
      marks: Mark[],
      extra: Partial<X>,
    ): PStep => ({
      state: s,
      marks,
      say,
      lines,
      level,
      vars: vars(),
      extra: base({ scores, ...extra }),
    });
    const w = (p: number) => posName(s.words, p);

    if (scheme === 'alibi') {
      const r = alibiAttention(s.x);
      yield step(
        `Start from the content scores, q·k / √2 from the self-attention page's head: what each word's question and each word's label say, with no positions at all.`,
        ['content'],
        2,
        [],
        { stage: 'content', rows: 0, focus: [n - 1, 0] },
      );
      yield step(
        'Add the biases: −1/2 for each step back. Scores of distant words go down; the masked ones stay −∞.',
        ['add'],
        2,
        Array.from({ length: n }, (_, i) => mark(`e-${i}-0`, 'active')),
        { stage: 'biased', rows: 0, focus: [n - 1, 0] },
      );
      for (let i = 0; i < n; i++) {
        const top = r.a[i]!.indexOf(Math.max(...r.a[i]!));
        const plain = softmax(r.content[i]!.map((t, j) => (j > i ? -Infinity : t))).p;
        const ptop = plain.indexOf(Math.max(...plain));
        const changed =
          ptop !== top
            ? ` Without the bias it would have picked ${w(ptop)} (${short(plain[ptop]!)}).`
            : '';
        yield step(
          i === 0
            ? `Softmax of row 0: ${w(0)} sees only itself, weight 1.`
            : `Softmax of row ${i}: ${w(top)} gets ${short(r.a[i]![top]!)}.${changed}`,
          ['soft'],
          2,
          [
            ...Array.from({ length: i + 1 }, (_, j) => mark(`a-${i}-${j}`, 'active')),
            mark(`a-${i}-${top}`, 'found'),
          ],
          { stage: 'biased', rows: i + 1, focus: [i, top] },
        );
      }
    } else {
      for (let m = 0; m < n; m++) {
        for (let k = 0; k < n; k++) {
          scored++;
          const v = scores[m]![k]!;
          const say =
            scheme === 'sinusoidal'
              ? `PE(${m}) · PE(${k}): for each pair sin·sin + cos·cos = cos of the angle between them, and the angles differ by ${Math.abs(m - k)} / 1, ${Math.abs(m - k)} / 10, …. Sum: ${two(v)}.`
              : `q at ${w(m)} · k at ${w(k)}, each pair turned by its own position: ${two(v)}${
                  m === k
                    ? ', as if neither were turned'
                    : `, the same as for these two words anywhere the key is ${Math.abs(m - k)} ${m > k ? 'before' : 'after'} the query`
                }.`;
          yield step(say, ['score'], 3, [mark(`s-${m}-${k}`, 'active'), mark(`w-${m}`, 'active')], {
            scored,
            focus: [m, k],
          });
        }
        const row = scores[m]!;
        yield step(
          scheme === 'sinusoidal'
            ? m === 0
              ? `Row 0: PE(0) · PE(0) = 4, one per pair, the most any two encodings can score. The further apart, the lower, with wiggles from the fast pairs.`
              : `Row ${m}: the largest is ${two(row[m]!)}, position ${m} with itself. Each diagonal holds one number: the dot product depends only on the distance.`
            : `Row ${m}, ${w(m)}'s query turned by its position against every turned key: ${row.map(two).join(', ')}.`,
          ['score'],
          2,
          Array.from({ length: n }, (_, k) => mark(`s-${m}-${k}`, 'active')),
          { scored, focus: [m, 0] },
        );
      }
    }

    const focus: [number, number] = [n - 1, 0];
    const next: S = { ...s, table, scores, focus };
    const final: Record<Scheme, string> = {
      sinusoidal: `Done. Every diagonal of PE·PE holds one number: two encodings k apart always score the same, whatever the positions. A model can learn to read distance from that, though once the encodings are added to the words and projected, the scores also depend on where they are.`,
      rope: `Done. Turning both q and k means their dot product depends on the words and on m − n, never on m or n alone: the same two words score the same at positions (2, 0) as at (5, 3). Absolute turns, relative scores: that is Su et al.'s idea.`,
      alibi: `Done. Each row is softmax of content plus bias: near words win ties, and far words need a much better match to win.`,
    };
    yield {
      state: next,
      marks: [],
      say: final[scheme],
      lines: ['sret'],
      level: 1,
      vars: vars(),
    };
    return next;
  },
};

export const ops = { load: loadOp, encode: encodeOp, score: scoreOp };

// ---------------------------------------------------------------------------------------------
// Pseudocode

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: PosSettings): PseudoBlock[] {
  const load = {
    op: 'load',
    lines: [
      L('lsig', 0, 'LOAD(words)', 'Start from a sentence:'),
      L('lpos', 1, 'word i sits at position i, from 0', 'each word gets its position.'),
    ],
  };
  if (settings.scheme === 'alibi')
    return [
      load,
      {
        op: 'encode',
        lines: [
          L('esig', 0, 'ALIBI-BIAS(n, m = 1/2)', 'Make a penalty for distance:'),
          L('bias', 1, 'B[i][j] = −m · (i − j) for j ≤ i', 'each step back costs 1/2.'),
          L('eret', 1, 'return B', 'Nothing is added to the words.'),
        ],
      },
      {
        op: 'score',
        lines: [
          L('ssig', 0, 'ATTEND(Q, K)', 'Attend with the penalty:'),
          L('content', 1, 'S = Q·Kᵀ / √d_k', 'score how well each question matches each label,'),
          L('add', 1, 'S = S + B, −∞ for j > i', 'subtract the penalty, hide the future,'),
          L('soft', 1, 'A[i] = softmax(S[i])', 'and turn each row into weights.'),
          L('sret', 1, 'return A', 'Near words are favoured.'),
        ],
      },
    ];
  const sin = settings.scheme === 'sinusoidal';
  return [
    load,
    {
      op: 'encode',
      lines: [
        L(
          'esig',
          0,
          sin ? 'SINUSOIDAL(n, d)' : 'ROPE-ANGLES(n, d)',
          sin ? 'Give each position a vector:' : 'Give each position its turns:',
        ),
        L(
          'ang',
          1,
          'a = pos / 10000^(2i/d) for each pair i',
          'Pair i turns 10 times slower than pair i − 1.',
        ),
        ...(sin
          ? [
              L('sin', 1, 'PE[pos][2i] = sin(a)', 'One number is the sine,'),
              L('cos', 1, 'PE[pos][2i+1] = cos(a)', 'the next the cosine.'),
            ]
          : []),
        L(
          'eret',
          1,
          sin ? 'return PE (added to the embeddings)' : 'return the angles',
          sin ? 'Add the vector to the word.' : 'Use them to turn q and k.',
        ),
      ],
    },
    {
      op: 'score',
      lines: [
        L(
          'ssig',
          0,
          sin ? 'COMPARE(PE)' : 'ROPE-SCORES(Q, K)',
          sin ? 'How alike are two positions?' : 'Score turned queries against turned keys:',
        ),
        L(
          'score',
          1,
          sin ? 'S[m][n] = PE[m] · PE[n]' : 'S[m][n] = R(m)·q_m · R(n)·k_n',
          sin
            ? 'The dot product of their encodings.'
            : 'Turn each by its position, then take the dot product.',
        ),
        L(
          'sret',
          1,
          'return S',
          sin ? 'Each diagonal holds one value.' : 'It depends only on the words and m − n.',
        ),
      ],
    },
  ];
}

// ---------------------------------------------------------------------------------------------
// Words for screen readers and narration

export function initialSay(s: S, settings: PosSettings): string {
  return `${s.words.length} words at positions 0 to ${s.words.length - 1}: ${s.words.join(' ')}. Attention on its own cannot tell these positions apart. Press Encode to see how ${SCHEME_NAME[settings.scheme]} does.`;
}

export const initialVars = (s: S, settings: PosSettings) => baseVars(s, settings);

export function describe(s: S, settings: PosSettings): string {
  const base = `${s.words.map((w, p) => `${w} at ${p}`).join(', ')}.`;
  const t = s.table;
  if (!t) return `${base} Not encoded yet.`;
  const rows = (m: number[][]) =>
    m.map((row, i) => `row ${i}: ${row.map(short).join(' ')}`).join('; ');
  const what: Record<Scheme, string> = {
    sinusoidal: 'Encodings',
    rope: 'Angles in radians',
    alibi: 'Biases',
  };
  return `${base} ${what[settings.scheme]}: ${rows(t)}.${s.scores ? ` Scores: ${rows(s.scores)}.` : ''}`;
}
