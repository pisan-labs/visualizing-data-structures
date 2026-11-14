/**
 * Recurrent networks reading a sentence from the toy vocabulary (src/viz/_lm/vocab.ts) one word
 * at a time, with one memory unit, so every number fits on a phone. Row vectors, as on the other
 * AI pages: x_t is the word's embedding (animal, thing, action, small).
 *
 *   plain RNN (Elman 1990)
 *     h_t = tanh(w·h_{t−1} + x_t·U)              W is 1 × 1 here: one number, w
 *   LSTM (Hochreiter and Schmidhuber 1997, with the forget gate of Gers et al. 2000)
 *     f_t = σ(x_t·U_f + h_{t−1}·W_f + b_f)       forget gate
 *     i_t = σ(x_t·U_i + h_{t−1}·W_i + b_i)       input gate
 *     g_t = tanh(x_t·U_g + h_{t−1}·W_g + b_g)    candidate
 *     c_t = f_t·c_{t−1} + i_t·g_t                the cell
 *     o_t = σ(x_t·U_o + h_{t−1}·W_o + b_o)       output gate
 *     h_t = o_t·tanh(c_t)
 *   LSTM without a forget gate, as in the 1997 paper: f_t = 1.
 *
 * The weights are made by hand, and the one unit stands for "an animal": U, U_i, U_f and U_g read
 * only the animal feature. The output gate reads the action feature, so the cell shows what it
 * holds when a verb comes. The gates look only at the current word (every W_* is 0), so the cell
 * is the LSTM's only path from one step to the next.
 *
 * The pull of word 1 is ∂m_t/∂m_1, how much a nudge to the memory m after word 1 still moves it
 * after word t (m is h for the RNN, c for the LSTM). By the chain rule it is a product of one
 * factor per later step: w·(1 − h_t²) for the RNN, f_t for the LSTM. With these weights the
 * product is exact; backpropagation through time multiplies the same factors.
 *
 * Operations: load (a sentence, nothing read), step (read the next word), run (read the rest).
 * The arithmetic runs in the same order as the code tabs.
 */
import type { Mark, OpSpec, PseudoBlock, Scalar, Step } from '../../engine/types';
import { dot, short, two } from '../_lm/numbers';
import { embed, known } from '../_lm/vocab';

export const MAX_WORDS = 8;
export const START_TEXT = 'cat sat on the mat and it slept';

export type Model = 'rnn' | 'lstm' | 'lstm97';
export type RecurrentWeight = '0.5' | '0.8' | '1.5';

export interface RnnSettings {
  [key: string]: Scalar;
  model: Model;
  w: RecurrentWeight;
}

export const defaults: RnnSettings = { model: 'rnn', w: '0.8' };

/** The plain RNN's input weights, one per feature (animal, thing, action, small). */
export const U = [1, 0, 0, 0];

/** One LSTM gate: a weight per feature, a weight on h (0 here) and a bias. */
export interface Gate {
  u: number[];
  w: number;
  b: number;
}

/**
 * The hand-made LSTM. An animal closes the forget gate (σ(−3) ≈ 0.05: drop the old animal) and
 * opens the input gate (σ(3) ≈ 0.95: write the new one); any other word keeps the cell (0.95)
 * and writes almost nothing (0.05). A verb opens the output gate.
 */
export const LSTM: { f: Gate; i: Gate; g: Gate; o: Gate } = {
  f: { u: [-6, 0, 0, 0], w: 0, b: 3 },
  i: { u: [6, 0, 0, 0], w: 0, b: -3 },
  g: { u: [2, 0, 0, 0], w: 0, b: 0 },
  o: { u: [0, 0, 4, 0], w: 0, b: -2 },
};

export const sigmoid = (z: number): number => 1 / (1 + Math.exp(-z));

/** A gate's sum before σ or tanh, in the code tabs' order: x·U, then h·W, then b. */
export const preact = (g: Gate, x: readonly number[], h: number): number =>
  dot(x, g.u) + h * g.w + g.b;

export interface RnnRow {
  kind: 'rnn';
  /** w·h_{t−1}: what is left of the old memory. */
  push: number;
  /** x_t·U: what the new word brings. */
  input: number;
  h: number;
  /** w·(1 − h_t²), the factor this step multiplies the pull by (1 for word 1). */
  factor: number;
  pull: number;
}

export interface LstmRow {
  kind: 'lstm';
  zf: number;
  f: number;
  zi: number;
  i: number;
  zg: number;
  g: number;
  c: number;
  zo: number;
  o: number;
  h: number;
  factor: number;
  pull: number;
}

export type Row = RnnRow | LstmRow;

export interface RnnState {
  words: string[];
  x: number[][];
  model: Model;
  w: number;
  /** One row per word read so far. */
  rows: Row[];
}

/** What a step in the middle of reading a word shows: the row so far. */
export interface RnnExtra {
  t?: number;
  /** The row's fields filled so far, in the order they are computed. */
  shown?: string[];
  row?: Row;
}

type S = RnnState;
type X = RnnExtra;
type Op = OpSpec<S, RnnSettings, X>;
type RStep = Step<S, X>;

export const weightOf = (s: RnnSettings): number => Number(s.w);
export const isLstm = (m: Model): boolean => m !== 'rnn';

/** One step of the plain RNN. */
export function rnnRow(x: readonly number[], hPrev: number, w: number, prev?: Row): RnnRow {
  const push = w * hPrev;
  const input = dot(x, U);
  const h = Math.tanh(push + input);
  const factor = prev ? w * (1 - h * h) : 1;
  return { kind: 'rnn', push, input, h, factor, pull: prev ? prev.pull * factor : 1 };
}

/** One step of the LSTM cell; without a forget gate, f = 1. */
export function lstmRow(
  x: readonly number[],
  hPrev: number,
  cPrev: number,
  forget: boolean,
  prev?: Row,
): LstmRow {
  const zf = forget ? preact(LSTM.f, x, hPrev) : Infinity;
  const f = forget ? sigmoid(zf) : 1;
  const zi = preact(LSTM.i, x, hPrev);
  const i = sigmoid(zi);
  const zg = preact(LSTM.g, x, hPrev);
  const g = Math.tanh(zg);
  const c = f * cPrev + i * g;
  const zo = preact(LSTM.o, x, hPrev);
  const o = sigmoid(zo);
  const h = o * Math.tanh(c);
  const factor = prev ? f : 1;
  return { kind: 'lstm', zf, f, zi, i, zg, g, c, zo, o, h, factor, pull: prev ? prev.pull * f : 1 };
}

/** The row for word t, from the rows before it. */
export function nextRow(s: S): Row {
  const t = s.rows.length;
  const prev = s.rows[t - 1];
  const hPrev = prev?.h ?? 0;
  if (s.model === 'rnn') return rnnRow(s.x[t]!, hPrev, s.w, prev);
  const cPrev = prev?.kind === 'lstm' ? prev.c : 0;
  return lstmRow(s.x[t]!, hPrev, cPrev, s.model === 'lstm', prev);
}

/** Every row for a whole sentence, for tests and practice. */
export function readAll(words: readonly string[], model: Model, w: number): Row[] {
  let s: S = { words: [...words], x: words.map(embed), model, w, rows: [] };
  while (s.rows.length < s.words.length) s = { ...s, rows: [...s.rows, nextRow(s)] };
  return s.rows;
}

/** The memory a row carries to the next step: h for the RNN, c for the LSTM. */
export const memoryOf = (r: Row): number => (r.kind === 'rnn' ? r.h : r.c);

// ---------------------------------------------------------------------------------------------
// Words

/** Words in order, lower case, punctuation dropped; an Error says what is wrong. */
export function parseSentence(text: string): string[] | Error {
  const words = text
    .toLowerCase()
    .replace(/[.,!?;:"']/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return new Error('Type a sentence first, such as "cat sat on the mat".');
  if (words.length > MAX_WORDS)
    return new Error(`Keep it to ${MAX_WORDS} words, so every number stays readable.`);
  const bad = words.find((w) => !/^[a-z]{1,6}$/.test(w));
  if (bad) return new Error(`Use words of letters only, six at most ("${bad}" is not).`);
  return words;
}

/** Name word t (0-based), with its position when the word appears more than once: "the (4)". */
export function wordName(words: readonly string[], t: number): string {
  const w = words[t]!;
  return words.filter((u) => u === w).length > 1 ? `${w} (${t + 1})` : w;
}

export function makeState(words: string[], settings: RnnSettings): S {
  return { words, x: words.map(embed), model: settings.model, w: weightOf(settings), rows: [] };
}

export function init(settings: RnnSettings): S {
  return makeState(parseSentence(START_TEXT) as string[], settings);
}

// ---------------------------------------------------------------------------------------------
// Steps

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });
const cell = (panel: string, t: number, c = 0) => `${panel}-${t}-${c}`;
const nameOf = (m: Model) => (m === 'rnn' ? 'h' : 'c');

export function baseVars(s: S): Record<string, Scalar> {
  const last = s.rows.at(-1);
  const out: Record<string, Scalar> = { words: s.words.length, 'words read': s.rows.length };
  if (s.model === 'rnn') out.w = s.w;
  if (!last) return out;
  const round = (v: number) => Math.round(v * 100) / 100;
  if (last.kind === 'lstm') out.c = round(last.c);
  out.h = round(last.h);
  out["word 1's pull"] = last.pull >= 0.1 ? round(last.pull) : Number(last.pull.toPrecision(2));
  return out;
}

/** The pull with enough digits to see it shrink: 0.75, 0.012, 0.00036. */
export function pullText(p: number): string {
  if (p >= 0.1 || p === 0) return two(p);
  return p.toPrecision(2).replace(/e-(\d+)$/, '×10⁻$1');
}

/** The animal feature, which every hand-made weight reads, for narration. */
const animalOf = (x: readonly number[]) => two(x[0]!);
const sig = (z: number) => `σ(${two(z)})`;

/** Narration and marks for each part of a row, in order; the last one finishes the word. */
function parts(
  s: S,
  t: number,
  r: Row,
): { field: string; say: string; lines: string[]; marks: Mark[] }[] {
  const names = s.words.map((_, i) => wordName(s.words, i));
  const name = names[t]!;
  const x = s.x[t]!;
  const prev = s.rows[t - 1];
  const odd = known(s.words[t]!)
    ? ''
    : ` (${s.words[t]} is not in the toy vocabulary, so it gets made-up numbers)`;
  const pullSay = (factorSay: string) =>
    t === 0
      ? `${name} is word 1, so its pull on the memory starts at 1.`
      : `${factorSay} Word 1's pull: ${pullText(prev!.pull)} × ${two(r.factor)} = ${pullText(r.pull)}.`;
  const row = (panel: string) => mark(cell(panel, t), 'active');
  if (r.kind === 'rnn') {
    const hPrev = prev?.h ?? 0;
    return [
      {
        field: 'push',
        say: `Read ${name}${odd}. What is left of the old memory: w × h = ${two(s.w)} × ${two(hPrev)} = ${two(r.push)}. What the word brings: x·U = its animal feature × 1 = ${two(r.input)}.`,
        lines: ['push'],
        marks: [
          mark(`w-${t}`, 'active'),
          row('push'),
          row('input'),
          ...(prev ? [mark(cell('h', t - 1), 'compare')] : []),
        ],
      },
      {
        field: 'h',
        say: `Squash the sum into −1 to 1: h = tanh(${two(r.push)} + ${two(r.input)}) = ${two(r.h)}.${
          prev && r.input === 0 && Math.abs(r.h) < Math.abs(hPrev)
            ? ` Nothing new came in, so the memory shrank from ${two(hPrev)}.`
            : ''
        }`,
        lines: ['squash'],
        marks: [mark(`w-${t}`, 'active'), row('h')],
      },
      {
        field: 'pull',
        say: pullSay(
          `The slope of this step: w × (1 − h²) = ${two(s.w)} × (1 − ${two(r.h)}²) = ${two(r.factor)}.`,
        ),
        lines: ['pull'],
        marks: [mark(`w-${t}`, 'active'), row('factor'), row('pull')],
      },
    ];
  }
  const cPrev = prev?.kind === 'lstm' ? prev.c : 0;
  const animal = x[0]! >= 0.5;
  const forget =
    s.model === 'lstm97'
      ? `Read ${name}${odd}. No forget gate: the old cell is always kept whole, f = 1.`
      : `Read ${name}${odd}. Forget gate: f = σ(−6 × ${animalOf(x)} + 3) = ${sig(r.zf)} = ${two(r.f)}. ${
          animal
            ? 'An animal: let go of the old one.'
            : `Not an animal: keep ${r.f >= 0.9 ? 'almost all of ' : ''}the cell.`
        }`;
  return [
    {
      field: 'f',
      say: forget,
      lines: ['forget'],
      marks: [
        mark(`w-${t}`, 'active'),
        row('f'),
        ...(prev ? [mark(cell('c', t - 1), 'compare')] : []),
      ],
    },
    {
      field: 'g',
      say: `Input gate: i = σ(6 × ${animalOf(x)} − 3) = ${two(r.i)}. The candidate: g = tanh(2 × ${animalOf(x)}) = ${two(r.g)}. ${
        r.i >= 0.5 ? 'Write it in.' : 'Write almost nothing.'
      }`,
      lines: ['input', 'cand'],
      marks: [mark(`w-${t}`, 'active'), row('i'), row('g')],
    },
    {
      field: 'c',
      say: `The cell: c = f × c + i × g = ${two(r.f)} × ${two(cPrev)} + ${two(r.i)} × ${two(r.g)} = ${two(r.c)}.`,
      lines: ['cell'],
      marks: [
        mark(`w-${t}`, 'active'),
        row('c'),
        row('f'),
        row('i'),
        row('g'),
        ...(prev ? [mark(cell('c', t - 1), 'compare')] : []),
      ],
    },
    {
      field: 'h',
      say: `Output gate: o = σ(4 × ${two(x[2]!)} − 2) = ${two(r.o)} (it opens for a verb). The output: h = o × tanh(c) = ${two(r.o)} × ${two(Math.tanh(r.c))} = ${two(r.h)}.`,
      lines: ['output', 'hid'],
      marks: [mark(`w-${t}`, 'active'), row('o'), row('h')],
    },
    {
      field: 'pull',
      say: pullSay(
        s.model === 'lstm97'
          ? 'Through the cell, this step multiplies the pull by f = 1.'
          : `Through the cell, this step multiplies the pull by f = ${two(r.f)}.`,
      ),
      lines: ['pull'],
      marks: [mark(`w-${t}`, 'active'), row('f'), row('pull')],
    },
  ];
}

/** The yields that read word t, the last of them at `endLevel`, with the state after it. */
function* readWord(s: S, endLevel: 1 | 2): Generator<RStep, S, void> {
  const t = s.rows.length;
  const r = nextRow(s);
  const next: S = { ...s, rows: [...s.rows, r] };
  const ps = parts(s, t, r);
  const shown: string[] = [];
  for (const [k, p] of ps.entries()) {
    shown.push(p.field);
    const last = k === ps.length - 1;
    yield {
      state: last ? next : s,
      marks: p.marks,
      say: last ? `${p.say}${endNote(next, t)}` : p.say,
      lines: p.lines,
      level: last ? endLevel : 2,
      vars: baseVars(last ? next : s),
      extra: last ? {} : { t, shown: [...shown], row: r },
    };
  }
  return next;
}

/** What the end of a word adds: the comparison that matters at the end of the sentence. */
function endNote(s: S, t: number): string {
  if (t < s.words.length - 1) return '';
  const r = s.rows[t]!;
  if (s.words.length === 1) return ' That is the whole sentence.';
  const m = nameOf(s.model);
  return ` Done: after ${s.words.length} words, a nudge to ${m} after word 1 moves ${m} now by ${pullText(r.pull)} as much.`;
}

const loadOp: Op = {
  label: 'Load',
  arity: 1,
  *run(s, args, { settings }) {
    const words = parseSentence(String(args[0]));
    if (words instanceof Error) {
      yield { state: s, marks: [], say: words.message, lines: [], level: 1, vars: baseVars(s) };
      return s;
    }
    const next = makeState(words, settings);
    const unknown = [...new Set(words.filter((w) => !known(w)))];
    const odd = unknown.length
      ? ` ${unknown.join(', ')} ${unknown.length === 1 ? 'is' : 'are'} not in the toy vocabulary, so ${unknown.length === 1 ? 'it gets' : 'they get'} made-up numbers.`
      : '';
    yield {
      state: next,
      marks: words.map((_, r) => mark(`w-${r}`, 'new')),
      say: `${words.length === 1 ? 'One word' : `${words.length} words`}: ${words.join(' ')}. Each is four numbers: how much it is an animal, a thing, an action and a small word.${odd} The memory starts at 0. Press Read next word.`,
      lines: ['init'],
      level: 1,
      vars: baseVars(next),
    };
    return next;
  },
};

function* refuseDone(s: S): Generator<RStep, S, void> {
  yield {
    state: s,
    marks: [],
    say: 'Every word is read. Load a new sentence, or change the model and read it again.',
    lines: [],
    level: 1,
    vars: baseVars(s),
  };
  return s;
}

const stepOp: Op = {
  label: 'Read next word',
  arity: 0,
  *run(s) {
    if (s.rows.length >= s.words.length) return yield* refuseDone(s);
    return yield* readWord(s, 1);
  },
};

const runOp: Op = {
  label: 'Read all',
  arity: 0,
  *run(s) {
    if (s.rows.length >= s.words.length) return yield* refuseDone(s);
    let cur = s;
    while (cur.rows.length < cur.words.length) cur = yield* readWord(cur, 1);
    return cur;
  },
};

export const ops = { load: loadOp, step: stepOp, run: runOp };

// ---------------------------------------------------------------------------------------------
// Pseudocode

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

function stepLines(settings: RnnSettings, indent: number) {
  if (settings.model === 'rnn')
    return [
      L(
        'push',
        indent,
        'a = w·h_{t−1} + x_t·U',
        'Add what is left of the old memory to what the new word brings.',
      ),
      L('squash', indent, 'h_t = tanh(a)', 'Squash the sum into −1 to 1: the new memory.'),
      L(
        'pull',
        indent,
        'pull = pull · w·(1 − h_t²)',
        "Word 1's pull shrinks by this step's slope.",
      ),
    ];
  return [
    settings.model === 'lstm'
      ? L(
          'forget',
          indent,
          'f_t = σ(x_t·U_f + h_{t−1}·W_f + b_f)',
          'Forget gate: how much of the old cell to keep, 0 to 1.',
        )
      : L('forget', indent, 'f_t = 1', 'No forget gate: keep the whole old cell.'),
    L(
      'input',
      indent,
      'i_t = σ(x_t·U_i + h_{t−1}·W_i + b_i)',
      'Input gate: how much of the new candidate to write.',
    ),
    L(
      'cand',
      indent,
      'g_t = tanh(x_t·U_g + h_{t−1}·W_g + b_g)',
      'The candidate: what this word would write.',
    ),
    L(
      'cell',
      indent,
      'c_t = f_t·c_{t−1} + i_t·g_t',
      'Keep some of the old cell, add some of the new.',
    ),
    L(
      'output',
      indent,
      'o_t = σ(x_t·U_o + h_{t−1}·W_o + b_o)',
      'Output gate: how much of the cell to show.',
    ),
    L('hid', indent, 'h_t = o_t·tanh(c_t)', 'Show that much of the squashed cell.'),
    L('pull', indent, 'pull = pull · f_t', "Word 1's pull shrinks only by the forget gate."),
  ];
}

export function pseudocode(settings: RnnSettings): PseudoBlock[] {
  const lstm = isLstm(settings.model);
  const init = L(
    'init',
    1,
    lstm ? 'h_0 = 0, c_0 = 0, pull = 1' : 'h_0 = 0, pull = 1',
    lstm ? 'The cell and the output start at 0.' : 'The memory starts at 0.',
  );
  const sig = lstm ? 'LSTM-STEP(x_t)' : 'RNN-STEP(x_t)';
  return [
    {
      op: 'load',
      lines: [L('lsig', 0, 'LOAD(x_1 … x_n)', 'Start from a sentence of word vectors:'), init],
    },
    {
      op: 'step',
      lines: [
        L('sig', 0, sig, 'Read one word, with the memory so far:'),
        ...stepLines(settings, 1),
      ],
    },
    {
      op: 'run',
      lines: [
        L('rsig', 0, lstm ? 'LSTM(x_1 … x_n)' : 'RNN(x_1 … x_n)', 'Read the words left, in order:'),
        L('for', 1, 'for each word x_t not read yet', 'One word at a time, never two at once:'),
        ...stepLines(settings, 2),
      ],
    },
  ];
}

// ---------------------------------------------------------------------------------------------
// Words for screen readers and narration

export function initialSay(s: S): string {
  return `${s.words.length} words: ${s.words.join(' ')}. ${
    isLstm(s.model)
      ? 'An LSTM reads them one at a time, keeping a cell that its gates protect.'
      : 'A plain RNN reads them one at a time, keeping one number of memory.'
  } Press Read next word, or Read all.`;
}

export const initialVars = (s: S) => baseVars(s);

export function describe(s: S): string {
  const base = `Words: ${s.words.join(' ')}. ${s.rows.length} of ${s.words.length} read.`;
  if (!s.rows.length) return base;
  return `${base} ${s.rows
    .map((r, t) => {
      const w = wordName(s.words, t);
      return r.kind === 'rnn'
        ? `${w}: h ${short(r.h)}, pull ${pullText(r.pull)}`
        : `${w}: f ${short(r.f)}, i ${short(r.i)}, c ${short(r.c)}, h ${short(r.h)}, pull ${pullText(r.pull)}`;
    })
    .join('; ')}.`;
}
