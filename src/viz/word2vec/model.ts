/**
 * word2vec: skip-gram with negative sampling (Mikolov et al. 2013; SLP3 6.8), in two
 * dimensions so the picture moves as it learns. The corpus is the first four sentences of the
 * shared toy corpus (src/viz/_lm/corpus.ts), eight words in all. Every word has two vectors:
 * w, the word itself, and c, the word as someone else's context.
 *
 *   pairs: a window of L words on each side slides over a sentence; each word in the middle
 *          pairs with every other word in the window (center, context)
 *   noise: k noise words per pair, drawn with P(n) ∝ count(n)^0.75, distinct, never one of the
 *          pair's own two words (a draw that lands on one is drawn again)
 *   score: σ(w · c), the model's belief that c really is a neighbour of w
 *   update, for target t with label y (1 for the real context, 0 for a noise word):
 *          g = σ(w · c_t) − y
 *          c_t ← c_t − η·g·w                    (pull the context in, push the noise away)
 *          w ← w − η·Σ_t g·c_t                  (every c_t from before its own update)
 *   loss:  −log σ(w · c_pos) − Σ_n log σ(−w · c_n)
 *
 * The targets are updated in order (the context, then each noise word) and the center last,
 * as the original C code does; with distinct targets this is exactly SLP3's update from the
 * old values. The code tabs do the same arithmetic in the same order.
 *
 * Operations: train (one sentence), pairs (the window only, no training), pair (one update for
 * a center and a context word), epoch (one pass over the four sentences), run (ten passes) and
 * reset (new random vectors, one decimal each in [−1, 1]).
 */
import type { Rng } from '../../engine/rng';
import { makeRng } from '../../engine/rng';
import type { Mark, OpSpec, PseudoBlock, Scalar, Step } from '../../engine/types';
import { CORPUS } from '../_lm/corpus';
import { round3, two } from '../_lm/numbers';

export const SENTENCES: readonly string[] = CORPUS.slice(0, 4);
export const VOCAB: readonly string[] = [...new Set(SENTENCES.flatMap((s) => s.split(' ')))];
export const COUNTS: readonly number[] = VOCAB.map(
  (w) => SENTENCES.flatMap((s) => s.split(' ')).filter((x) => x === w).length,
);
export const POWER = 0.75;
export const MAX_WORDS = 8;
export const MAX_WINDOW = 3;
export const MAX_NEGATIVES = 4;
export const RUN_PASSES = 10;
export const LEARNING_RATES = ['0.05', '0.1', '0.25', '0.5'];
/** The seed of the vectors the page starts with. */
export const INIT_SEED = 32;

/** P(n) ∝ count(n)^0.75, in vocabulary order, each sum from 0 in order (as the code tabs). */
export function noiseDistribution(counts: readonly number[], power = POWER): number[] {
  const weights = counts.map((c) => Math.pow(c, power));
  let total = 0;
  for (const x of weights) total += x;
  return weights.map((x) => x / total);
}

export const NOISE: readonly number[] = noiseDistribution(COUNTS);

export interface W2vSettings {
  [key: string]: Scalar;
  window: number;
  negatives: number;
  lr: string;
}

export const defaults: W2vSettings = { window: 2, negatives: 2, lr: '0.1' };

export type Vec2 = readonly [number, number];

export interface W2vState {
  /** Word vectors, in vocabulary order. */
  w: Vec2[];
  /** Context vectors, in vocabulary order. */
  c: Vec2[];
  /** Updates so far. */
  pairs: number;
  /** Full passes over the corpus so far. */
  passes: number;
  /** Half the width of the plane drawn: the largest coordinate so far, rounded up. */
  reach: number;
}

/** One draw of a noise word. */
export interface Draw {
  u: number;
  word: number;
  /** False when it was one of the pair's words, or drawn already, and was drawn again. */
  kept: boolean;
}

/** Everything one update did, for the steps, the code tabs and the tests. */
export interface PairRec {
  center: number;
  context: number;
  draws: Draw[];
  negs: number[];
  /** Targets: the context, then the noise words. */
  targets: number[];
  /** w · c_t, σ(w · c_t) and the factor −η·g that c_t moves by (times w), per target. */
  dots: number[];
  sigs: number[];
  coefs: number[];
  /** σ(w · c_t) with the new vectors, per target. */
  after: number[];
  /** −η·Σ g·c_t: how far w moves. */
  move: Vec2;
  /** The loss before the update. */
  loss: number;
  /** Before, after the context, after each noise word, after the center. */
  states: W2vState[];
}

/** What a step in the middle of an operation shows. */
export interface W2vWork {
  /** The sentence the window is on (vocabulary ids), when there is one. */
  words?: number[];
  /** Positions of the center and the context word in it. */
  i?: number;
  j?: number;
  /** The update in play, and how far it has got: what the table shows. */
  rec?: PairRec;
  stage: 'draw' | 'pair' | 'pos' | 'neg' | 'center' | 'done' | 'idle';
  /** During 'neg', the noise word just pushed (index into rec.negs). */
  neg?: number;
  /** Vectors to draw a trail for: where each was before this step. */
  trails?: { id: string; from: Vec2 }[];
  /** Pairs listed so far, during `pairs`. */
  listed?: [number, number][];
}

export interface W2vExtra {
  work?: W2vWork;
  /** On the last step of an operation: every update it made, in order. */
  log?: PairRec[];
}

type S = W2vState;
type X = W2vExtra;
type Op = OpSpec<S, W2vSettings, X>;
type WStep = Step<S, X>;

// ---------------------------------------------------------------------------------------------
// Arithmetic

export const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));
const dot2 = (a: Vec2, b: Vec2): number => {
  let s = 0;
  s += a[0] * b[0];
  s += a[1] * b[1];
  return s;
};

/** Positions (i, j) of every (center, context) pair, center by center, context left to right. */
export function windowPairs(n: number, window: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++)
    for (let j = Math.max(0, i - window); j <= Math.min(n - 1, i + window); j++)
      if (j !== i) out.push([i, j]);
  return out;
}

/** The noise word whose stretch of the cumulative distribution holds u. */
export function noiseWord(u: number): number {
  let cum = 0;
  for (let i = 0; i < NOISE.length; i++) {
    cum += NOISE[i]!;
    if (u < cum) return i;
  }
  return NOISE.length - 1;
}

/** Draw k distinct noise words, none of them `center` or `context`. */
export function drawNegatives(rng: Rng, k: number, center: number, context: number) {
  const draws: Draw[] = [];
  const negs: number[] = [];
  while (negs.length < k) {
    const u = rng.next();
    const word = noiseWord(u);
    const kept = word !== center && word !== context && !negs.includes(word);
    draws.push({ u, word, kept });
    if (kept) negs.push(word);
  }
  return { draws, negs };
}

/** One update of skip-gram with negative sampling, given the noise words. */
export function applyUpdate(
  s: S,
  center: number,
  context: number,
  negs: readonly number[],
  lr: number,
): Omit<PairRec, 'draws' | 'negs'> & { negs: number[] } {
  const v = s.w[center]!;
  const targets = [context, ...negs];
  const c = [...s.c];
  const states: S[] = [s];
  const dots: number[] = [];
  const sigs: number[] = [];
  const coefs: number[] = [];
  let gx = 0;
  let gy = 0;
  let loss = 0;
  targets.forEach((t, m) => {
    const label = m === 0 ? 1 : 0;
    const ct = c[t]!;
    const d = dot2(v, ct);
    const sg = sigmoid(d);
    const g = sg - label;
    gx += g * ct[0];
    gy += g * ct[1];
    c[t] = [ct[0] - lr * g * v[0], ct[1] - lr * g * v[1]];
    dots.push(d);
    sigs.push(sg);
    coefs.push(-lr * g);
    loss += -Math.log(m === 0 ? sg : 1 - sg);
    states.push({ ...s, c: [...c] });
  });
  const w = [...s.w];
  w[center] = [v[0] - lr * gx, v[1] - lr * gy];
  const end: S = { ...s, w, c: [...c], pairs: s.pairs + 1 };
  states.push(end);
  const after = targets.map((t) => sigmoid(dot2(end.w[center]!, end.c[t]!)));
  return {
    center,
    context,
    negs: [...negs],
    targets,
    dots,
    sigs,
    coefs,
    after,
    move: [-lr * gx, -lr * gy],
    loss,
    states,
  };
}

function trainPair(s: S, center: number, context: number, settings: W2vSettings, rng: Rng) {
  const { draws, negs } = drawNegatives(rng, settings.negatives, center, context);
  const r = applyUpdate(s, center, context, negs, Number(settings.lr));
  return { ...r, draws } satisfies PairRec;
}

/** The loss of a pair's update, with the vectors of state s. */
export function pairLoss(s: S, r: PairRec): number {
  let loss = 0;
  r.targets.forEach((t, m) => {
    const sg = sigmoid(dot2(s.w[r.center]!, s.c[t]!));
    loss += -Math.log(m === 0 ? sg : 1 - sg);
  });
  return loss;
}

const maxAbs = (s: S) => Math.max(0, ...[...s.w, ...s.c].flat().map(Math.abs));

/** The plane's half-width for a run of states: never smaller than before, at least 1.5. */
function reachFor(prev: number, states: readonly S[]): number {
  const top = Math.max(0, ...states.map(maxAbs));
  return Math.max(1.5, prev, Math.ceil((top + 0.3) * 2) / 2);
}

const withReach = (s: S, reach: number): S => (s.reach === reach ? s : { ...s, reach });

// ---------------------------------------------------------------------------------------------
// Words

export const wordId = (w: string): number => VOCAB.indexOf(w);

/** Words in order, lower case, punctuation dropped; an Error says what is wrong. */
export function parseSentence(text: string): string[] | Error {
  const words = text
    .toLowerCase()
    .replace(/[.,!?;:"']/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return new Error('Type a sentence first, such as "the cat sat".');
  if (words.length > MAX_WORDS)
    return new Error(`Keep it to ${MAX_WORDS} words, so the window stays readable.`);
  const bad = words.find((w) => !VOCAB.includes(w));
  if (bad)
    return new Error(`Use the corpus words: ${VOCAB.join(', ')} ("${bad}" is not one of them).`);
  return words;
}

export function randomVectors(rng: Rng): { w: Vec2[]; c: Vec2[] } {
  const v = (): Vec2 => [rng.int(-10, 10) / 10, rng.int(-10, 10) / 10];
  const w = VOCAB.map(v);
  const c = VOCAB.map(v);
  return { w, c };
}

export function init(): S {
  const { w, c } = randomVectors(makeRng(INIT_SEED));
  const s: S = { w, c, pairs: 0, passes: 0, reach: 1.5 };
  return { ...s, reach: reachFor(1.5, [s]) };
}

// ---------------------------------------------------------------------------------------------
// Steps

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });
export const vec = (v: Vec2) => `(${two(v[0])}, ${two(v[1])})`;
const name = (t: number) => VOCAB[t]!;
const list = (xs: readonly string[]) =>
  xs.length <= 1
    ? (xs[0] ?? '')
    : xs.length === 2
      ? `${xs[0]} and ${xs[1]}`
      : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`;
const r3 = (x: number) => Math.round(x * 1000) / 1000;

export function baseVars(s: S, loss?: number): Record<string, Scalar> {
  const out: Record<string, Scalar> = { pairs: s.pairs, passes: s.passes };
  if (loss !== undefined) out.loss = r3(loss);
  return out;
}

/** Marks on the sentence strip: the window, the center and the context word. */
function stripMarks(n: number, i: number, j: number | undefined, window: number): Mark[] {
  const out: Mark[] = [];
  for (let p = Math.max(0, i - window); p <= Math.min(n - 1, i + window); p++)
    if (p !== i && p !== j) out.push(mark(`s-${p}`, 'visit'));
  out.push(mark(`s-${i}`, 'active'));
  if (j !== undefined) out.push(mark(`s-${j}`, 'found'));
  return out;
}

/** Marks on the plane and the table for an update. */
function pairMarks(r: PairRec): Mark[] {
  return [
    mark(`pw-${name(r.center)}`, 'active'),
    mark(`pc-${name(r.context)}`, 'found'),
    ...r.negs.map((n) => mark(`pc-${name(n)}`, 'remove')),
  ];
}

const drawSay = (r: PairRec): string => {
  const parts = r.draws.map(
    (d) =>
      `u = ${round3(d.u)} picks "${name(d.word)}"${d.kept ? '' : d.word === r.center || d.word === r.context ? ' (one of the pair: draw again)' : ' (picked already: draw again)'}`,
  );
  return `Draw ${r.negs.length} noise ${r.negs.length === 1 ? 'word' : 'words'}, common words more often (count^0.75): ${parts.join('; ')}.`;
};

/** Two σ's that read the same with two decimals get three. */
function pairOf(a: number, b: number): [string, string] {
  return two(a) === two(b) ? [round3(a), round3(b)] : [two(a), two(b)];
}

function pairSay(r: PairRec): string {
  const c = name(r.context);
  const w = name(r.center);
  const head = `${w} → ${c}: w_${w} · c_${c} = ${two(r.dots[0]!)}, so σ = ${two(r.sigs[0]!)}. A real neighbour, so we want 1.`;
  if (!r.negs.length) return `${head} No noise words (k = 0).`;
  const noise = r.negs.map((n, m) => `${name(n)} ${two(r.sigs[m + 1]!)}`).join(', ');
  return `${head} Noise ${r.negs.length === 1 ? 'word' : 'words'}, where we want 0: ${noise}.`;
}

/**
 * The steps of one update: the draw (fine detail), the pair, the context, each noise word and
 * the center (fine detail), and the vectors after it.
 */
function* pairSteps(
  r: PairRec,
  reach: number,
  base: Omit<W2vWork, 'stage' | 'rec'>,
  strip: Mark[],
  lr: number,
): Generator<WStep, void, void> {
  const st = (k: number) => withReach(r.states[k]!, reach);
  const w = name(r.center);
  const c = name(r.context);
  const vars = (k: number, loss = r.loss) => baseVars(st(k), loss);
  const work = (stage: W2vWork['stage'], extra: Partial<W2vWork> = {}): X => ({
    work: { ...base, rec: r, stage, ...extra },
  });
  if (r.draws.length)
    yield {
      state: st(0),
      marks: [...strip, ...r.negs.map((n) => mark(`pc-${name(n)}`, 'remove'))],
      say: drawSay(r),
      lines: ['draw'],
      level: 3,
      vars: vars(0),
      extra: work('draw'),
    };
  yield {
    state: st(0),
    marks: [...strip, ...pairMarks(r)],
    say: pairSay(r),
    lines: ['score'],
    level: 2,
    vars: vars(0),
    extra: work('pair'),
  };
  const v = r.states[0]!.w[r.center]!;
  const cOld = r.states[0]!.c;
  yield {
    state: st(1),
    marks: [
      ...strip,
      mark(`pw-${w}`, 'active'),
      mark(`pc-${c}`, 'found'),
      mark('coef-pos', 'found'),
    ],
    say: `Pull: c_${c} gains η(1 − σ) = ${lr} × ${two(1 - r.sigs[0]!)} = ${two(r.coefs[0]!)} of w_${w}, and moves from ${vec(cOld[r.context]!)} to ${vec(r.states[1]!.c[r.context]!)}, toward w_${w}.`,
    lines: ['pos'],
    level: 3,
    vars: vars(1),
    extra: work('pos', { trails: [{ id: `pc-${c}`, from: cOld[r.context]! }] }),
  };
  for (let m = 0; m < r.negs.length; m++) {
    const n = r.negs[m]!;
    yield {
      state: st(m + 2),
      marks: [
        ...strip,
        mark(`pw-${w}`, 'active'),
        mark(`pc-${name(n)}`, 'remove'),
        mark(`coef-n${m}`, 'remove'),
      ],
      say: `Push: c_${name(n)} loses ησ = ${lr} × ${two(r.sigs[m + 1]!)} = ${two(-r.coefs[m + 1]!)} of w_${w}, and moves from ${vec(cOld[n]!)} to ${vec(r.states[m + 2]!.c[n]!)}, away from w_${w}.`,
      lines: ['neg'],
      level: 3,
      vars: vars(m + 2),
      extra: work('neg', { neg: m, trails: [{ id: `pc-${name(n)}`, from: cOld[n]! }] }),
    };
  }
  const last = r.states.length - 1;
  yield {
    state: st(last),
    marks: [...strip, mark(`pw-${w}`, 'active')],
    say: `The center word moves too: w_${w} goes from ${vec(v)} by ${vec(r.move)} to ${vec(r.states[last]!.w[r.center]!)}, toward c_${c}${r.negs.length ? ' and away from the noise words' : ''}. Each c_t counts with the value it had before its own move.`,
    lines: ['cen'],
    level: 3,
    vars: vars(last),
    extra: work('center', { trails: [{ id: `pw-${w}`, from: v }] }),
  };
  const change = (k: number) => {
    const [a, b] = pairOf(r.after[k]!, r.sigs[k]!);
    return `${a}, ${r.after[k]! >= r.sigs[k]! ? 'up' : 'down'} from ${b}`;
  };
  const noise = r.negs.length
    ? ` Noise: ${r.negs.map((n, m) => `${name(n)} ${change(m + 1)}`).join('; ')}.`
    : '';
  yield {
    state: st(last),
    marks: [...strip, ...pairMarks(r)],
    say: `After the update σ(w_${w} · c_${c}) is ${change(0)}.${noise}`,
    lines: ['cen'],
    level: 2,
    vars: vars(last, pairLoss(r.states[last]!, r)),
    extra: work('done', { trails: trailsOf(r) }),
  };
}

/** A trail for every vector an update moved. */
function trailsOf(r: PairRec): { id: string; from: Vec2 }[] {
  const s = r.states[0]!;
  return [
    { id: `pw-${name(r.center)}`, from: s.w[r.center]! },
    ...r.targets.map((t) => ({ id: `pc-${name(t)}`, from: s.c[t]! })),
  ];
}

const errorStep = (s: S, say: string): WStep => ({
  state: s,
  marks: [],
  say,
  lines: [],
  level: 1,
  vars: baseVars(s),
});

const mean = (xs: readonly number[]) => {
  let t = 0;
  for (const x of xs) t += x;
  return xs.length ? t / xs.length : 0;
};

const trainOp: Op = {
  label: 'Train',
  arity: 1,
  *run(s, args, { settings, rng }) {
    const words = parseSentence(String(args[0]));
    if (words instanceof Error) {
      yield errorStep(s, words.message);
      return s;
    }
    const ids = words.map(wordId);
    const L = settings.window;
    const pairs = windowPairs(ids.length, L);
    if (!pairs.length) {
      yield {
        ...errorStep(
          s,
          `One word on its own has no neighbours, so the window makes no pairs and nothing moves. Try "the ${words[0] === 'the' ? 'cat' : words[0]} sat".`,
        ),
        extra: { work: { words: ids, stage: 'idle' }, log: [] },
      };
      return s;
    }
    const recs: PairRec[] = [];
    let cur = s;
    for (const [i, j] of pairs) {
      const r = trainPair(cur, ids[i]!, ids[j]!, settings, rng);
      recs.push(r);
      cur = r.states.at(-1)!;
    }
    const reach = reachFor(
      s.reach,
      recs.flatMap((r) => r.states),
    );
    const start = withReach(s, reach);
    yield {
      state: start,
      marks: words.map((_, p) => mark(`s-${p}`, 'new')),
      say: `${words.length} words, a window of ${L} on each side: ${pairs.length} (center, context) pairs. Each one pulls its two vectors together and pushes ${settings.negatives === 1 ? 'a noise word' : `${settings.negatives} noise words`} away.`,
      lines: ['tsig'],
      level: 2,
      vars: baseVars(start),
      extra: { work: { words: ids, stage: 'idle' } },
    };
    const lr = Number(settings.lr);
    for (const [k, [i, j]] of pairs.entries()) {
      const r = recs[k]!;
      const strip = stripMarks(ids.length, i, j, L);
      if (j === Math.max(0, i - L)) {
        const ctx = pairs.filter(([a]) => a === i).map(([, b]) => words[b]!);
        yield {
          state: withReach(r.states[0]!, reach),
          marks: stripMarks(ids.length, i, undefined, L),
          say: `${words[i]} in the middle: its window holds ${list(ctx)}, so it makes ${ctx.length} ${ctx.length === 1 ? 'pair' : 'pairs'}.`,
          lines: ['fori', 'forj'],
          level: 3,
          vars: baseVars(withReach(r.states[0]!, reach)),
          extra: { work: { words: ids, i, stage: 'idle' } },
        };
      }
      yield* pairSteps(r, reach, { words: ids, i, j }, strip, lr);
    }
    const end = withReach(cur, reach);
    const before = mean(recs.map((r) => r.loss));
    const after = mean(recs.map((r) => pairLoss(end, r)));
    yield {
      state: end,
      marks: [],
      say: `Done: ${pairs.length} updates. On these pairs, with the same noise words, the average loss went from ${two(before)} to ${two(after)}.`,
      lines: ['tsig'],
      level: 1,
      vars: baseVars(end, after),
      extra: { work: { words: ids, stage: 'idle' }, log: recs },
    };
    return end;
  },
};

const pairsOp: Op = {
  label: 'Pairs',
  arity: 1,
  *run(s, args, { settings }) {
    const words = parseSentence(String(args[0]));
    if (words instanceof Error) {
      yield errorStep(s, words.message);
      return s;
    }
    const ids = words.map(wordId);
    const L = settings.window;
    const pairs = windowPairs(ids.length, L);
    const listed: [number, number][] = [];
    for (let i = 0; i < ids.length; i++) {
      const mine = pairs.filter(([a]) => a === i);
      listed.push(...mine);
      const ctx = mine.map(([, b]) => words[b]!);
      yield {
        state: s,
        marks: [
          ...stripMarks(ids.length, i, undefined, L),
          ...mine.map(([, b]) => mark(`s-${b}`, 'found')),
        ],
        say: ctx.length
          ? `${words[i]} in the middle, ${L} on each side: ${ctx.map((x) => `(${words[i]}, ${x})`).join(', ')}.`
          : `${words[i]} has no other word in its window.`,
        lines: ['pfori', 'pforj'],
        level: 2,
        vars: { ...baseVars(s), listed: listed.length },
        extra: { work: { words: ids, i, stage: 'idle', listed: [...listed] } },
      };
    }
    const full = 2 * L;
    yield {
      state: s,
      marks: [],
      say: `${pairs.length} pairs from ${words.length} ${words.length === 1 ? 'word' : 'words'}. A word in the middle gets ${full} neighbours; the words near the ends get fewer, so it is ${pairs.length}, not ${words.length} × ${full} = ${words.length * full}.`,
      lines: ['pout'],
      level: 1,
      vars: { ...baseVars(s), listed: pairs.length },
      extra: { work: { words: ids, stage: 'idle', listed: [...listed] } },
    };
    return s;
  },
};

/** "cat sat": one update for the pair (cat, sat). */
export function parsePair(text: string): [number, number] | Error {
  const words = parseSentence(text);
  if (words instanceof Error) return words;
  if (words.length !== 2)
    return new Error('Type two words, a center word and a context word, such as "cat sat".');
  return [wordId(words[0]!), wordId(words[1]!)];
}

const pairOp: Op = {
  label: 'Update one pair',
  arity: 1,
  *run(s, args, { settings, rng }) {
    const p = parsePair(String(args[0]));
    if (p instanceof Error) {
      yield errorStep(s, p.message);
      return s;
    }
    const [center, context] = p;
    const r = trainPair(s, center, context, settings, rng);
    const reach = reachFor(s.reach, r.states);
    yield* pairSteps(
      r,
      reach,
      { words: [center, context], i: 0, j: 1 },
      stripMarks(2, 0, 1, 1),
      Number(settings.lr),
    );
    const end = withReach(r.states.at(-1)!, reach);
    yield {
      state: end,
      marks: pairMarks(r),
      say: `One update for (${name(center)}, ${name(context)}): the loss on this pair went from ${two(r.loss)} to ${two(pairLoss(end, r))}.`,
      lines: ['cen'],
      level: 1,
      vars: baseVars(end, pairLoss(end, r)),
      extra: { work: { words: [center, context], i: 0, j: 1, rec: r, stage: 'done' }, log: [r] },
    };
    return end;
  },
};

/** One pass over the corpus, as records per sentence. */
function pass(s: S, settings: W2vSettings, rng: Rng): { recs: PairRec[][]; end: S } {
  const recs: PairRec[][] = [];
  let cur = s;
  for (const sentence of SENTENCES) {
    const ids = sentence.split(' ').map(wordId);
    const out: PairRec[] = [];
    for (const [i, j] of windowPairs(ids.length, settings.window)) {
      const r = trainPair(cur, ids[i]!, ids[j]!, settings, rng);
      out.push(r);
      cur = r.states.at(-1)!;
    }
    recs.push(out);
  }
  return { recs, end: { ...cur, passes: cur.passes + 1 } };
}

const epochOp: Op = {
  label: 'One pass',
  arity: 0,
  *run(s, _args, { settings, rng }) {
    const { recs, end: raw } = pass(s, settings, rng);
    const reach = reachFor(
      s.reach,
      recs.flat().flatMap((r) => [r.states[0]!, r.states.at(-1)!]),
    );
    const L = settings.window;
    for (const [k, sentence] of SENTENCES.entries()) {
      const ids = sentence.split(' ').map(wordId);
      const pairs = windowPairs(ids.length, L);
      const rs = recs[k]!;
      for (const [m, [i, j]] of pairs.entries()) {
        const r = rs[m]!;
        yield {
          state: withReach(r.states.at(-1)!, reach),
          marks: [...stripMarks(ids.length, i, j, L), ...pairMarks(r)],
          say: `${sentence}: ${name(r.center)} → ${name(r.context)}, σ ${two(r.sigs[0]!)} → ${two(r.after[0]!)}.`,
          lines: ['efor', 'cen'],
          level: 3,
          vars: baseVars(withReach(r.states.at(-1)!, reach), r.loss),
          extra: { work: { words: ids, i, j, rec: r, stage: 'done', trails: trailsOf(r) } },
        };
      }
      const after = withReach(rs.at(-1)!.states.at(-1)!, reach);
      yield {
        state: k === SENTENCES.length - 1 ? withReach(raw, reach) : after,
        marks: [],
        say: `"${sentence}": ${pairs.length} updates, average loss ${two(mean(rs.map((r) => r.loss)))}.`,
        lines: ['efor'],
        level: 2,
        vars: baseVars(after, mean(rs.map((r) => r.loss))),
        extra: { work: { words: ids, stage: 'idle' } },
      };
    }
    const end = withReach(raw, reach);
    const all = recs.flat();
    yield {
      state: end,
      marks: [],
      say: `Pass ${end.passes} done: ${all.length} updates over the four sentences, average loss ${two(mean(all.map((r) => r.loss)))}. ${closeness(end)}`,
      lines: ['esig'],
      level: 1,
      vars: baseVars(end, mean(all.map((r) => r.loss))),
      extra: { log: all },
    };
    return end;
  },
};

const runOp: Op = {
  label: `Train ${RUN_PASSES} passes`,
  arity: 0,
  *run(s, _args, { settings, rng }) {
    const passes: { recs: PairRec[]; end: S }[] = [];
    let cur = s;
    for (let e = 0; e < RUN_PASSES; e++) {
      const p = pass(cur, settings, rng);
      passes.push({ recs: p.recs.flat(), end: p.end });
      cur = p.end;
    }
    const reach = reachFor(
      s.reach,
      passes.flatMap((p) => p.recs.flatMap((r) => [r.states.at(-1)!])),
    );
    for (const [e, p] of passes.entries()) {
      const st = withReach(p.end, reach);
      const loss = mean(p.recs.map((r) => r.loss));
      if (e === RUN_PASSES - 1) {
        yield {
          state: st,
          marks: [],
          say: `${RUN_PASSES} passes done (${st.passes} in all), average loss ${two(loss)} on the last. ${closeness(st)}`,
          lines: ['rsig'],
          level: 1,
          vars: baseVars(st, loss),
          extra: { log: passes.flatMap((x) => x.recs) },
        };
      } else
        yield {
          state: st,
          marks: [],
          say: `Pass ${st.passes}: ${p.recs.length} updates, average loss ${two(loss)}.`,
          lines: ['rfor'],
          level: 2,
          vars: baseVars(st, loss),
        };
    }
    return withReach(cur, reach);
  },
};

const resetOp: Op = {
  label: 'New random vectors',
  arity: 0,
  *run(s, _args, { rng }) {
    const { w, c } = randomVectors(rng);
    const raw: S = { w, c, pairs: 0, passes: 0, reach: 1.5 };
    const next = { ...raw, reach: reachFor(1.5, [raw]) };
    yield {
      state: next,
      marks: VOCAB.flatMap((x) => [mark(`pw-${x}`, 'new'), mark(`pc-${x}`, 'new')]),
      say: `New random vectors, one decimal each between −1 and 1. Nothing is learned yet: where a word sits says nothing about it.`,
      lines: ['xw'],
      level: 1,
      vars: baseVars(next),
    };
    return next;
  },
};

export const ops = {
  train: trainOp,
  pairs: pairsOp,
  pair: pairOp,
  epoch: epochOp,
  run: runOp,
  reset: resetOp,
};

/** Cosine of two word vectors. */
export function cosine(a: Vec2, b: Vec2): number {
  const n = Math.hypot(a[0], a[1]) * Math.hypot(b[0], b[1]);
  return n > 0 ? dot2(a, b) / n : 0;
}

/** How alike the two pairs with the same contexts are, for narration. */
export function closeness(s: S): string {
  const cos = (a: string, b: string) => cosine(s.w[wordId(a)]!, s.w[wordId(b)]!);
  return `Cosine of w_cat and w_dog: ${two(cos('cat', 'dog'))}; of w_mat and w_rug: ${two(cos('mat', 'rug'))}; of w_cat and w_mat: ${two(cos('cat', 'mat'))}.`;
}

// ---------------------------------------------------------------------------------------------
// Pseudocode

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: W2vSettings): PseudoBlock[] {
  const k = settings.negatives;
  const update = (d: number) => [
    ...(k > 0
      ? [
          L(
            'draw',
            d,
            `draw k = ${k} noise words n, P(n) ∝ count(n)^0.75`,
            `Pick ${k} random ${k === 1 ? 'word' : 'words'} as fake context, common words more often.`,
          ),
        ]
      : []),
    L(
      'score',
      d,
      k > 0 ? 'σ(w·c_pos), σ(w·c_n) for each n' : 'σ(w·c_pos)',
      'Score how much the model believes each one is a real neighbour.',
    ),
    L(
      'pos',
      d,
      `c_pos ← c_pos − η(σ(w·c_pos) − 1)·w   (η = ${settings.lr})`,
      'Pull the real context toward the word.',
    ),
    ...(k > 0
      ? [L('neg', d, 'c_n ← c_n − η·σ(w·c_n)·w', 'Push each fake context away from the word.')]
      : []),
    L(
      'cen',
      d,
      k > 0
        ? 'w ← w − η[(σ(w·c_pos) − 1)·c_pos + Σ σ(w·c_n)·c_n]'
        : 'w ← w − η(σ(w·c_pos) − 1)·c_pos',
      k > 0
        ? 'Move the word toward its context and away from the fakes.'
        : 'Move the word toward its context.',
    ),
  ];
  const train = (d: number) => [
    L('fori', d, 'for i = 1 to n', 'Put each word in the middle of the window in turn.'),
    L(
      'forj',
      d + 1,
      `for each j ≠ i with |i − j| ≤ ${settings.window}`,
      `Pair it with every word at most ${settings.window} away.`,
    ),
    L(
      'look',
      d + 2,
      'w = W[word_i], c_pos = C[word_j]',
      'Take its word vector and the neighbour’s context vector.',
    ),
    ...update(d + 2),
  ];
  return [
    {
      op: 'train',
      lines: [L('tsig', 0, 'TRAIN(words)', 'Learn from one sentence:'), ...train(1)],
    },
    {
      op: 'pairs',
      lines: [
        L('psig', 0, 'PAIRS(words)', 'List the pairs a sentence makes:'),
        L('pfori', 1, 'for i = 1 to n', 'Put each word in the middle of the window in turn.'),
        L(
          'pforj',
          2,
          `for each j ≠ i with |i − j| ≤ ${settings.window}`,
          `Pair it with every word at most ${settings.window} away.`,
        ),
        L('pout', 3, 'output (word_i, word_j)', 'That is one (center, context) pair.'),
      ],
    },
    {
      op: 'pair',
      lines: [
        L('qsig', 0, 'UPDATE(center, context)', 'Learn from one pair:'),
        L(
          'look',
          1,
          'w = W[center], c_pos = C[context]',
          'Take the word vector and the context vector.',
        ),
        ...update(1),
      ],
    },
    {
      op: 'epoch',
      lines: [
        L('esig', 0, 'PASS()', 'One pass over the corpus:'),
        L('efor', 1, 'for each sentence s in the corpus', 'Take each sentence in turn,'),
        L('etrain', 2, 'TRAIN(s)', 'and learn from all its pairs.'),
        L(
          'cen',
          2,
          '(each pair: pull c_pos, push the noise, move w)',
          'Every pair moves its vectors.',
        ),
      ],
    },
    {
      op: 'run',
      lines: [
        L('rsig', 0, `TRAIN-PASSES()`, `Learn from the corpus ${RUN_PASSES} times:`),
        L('rfor', 1, `repeat ${RUN_PASSES} times: PASS()`, 'one pass after another.'),
      ],
    },
    {
      op: 'reset',
      lines: [
        L('xsig', 0, 'RESET()', 'Start again:'),
        L('xw', 1, 'W, C ← random, one decimal in [−1, 1]', 'every vector gets random numbers.'),
      ],
    },
  ];
}

// ---------------------------------------------------------------------------------------------
// Words for screen readers and narration

export function initialSay(): string {
  return `${VOCAB.length} words from four sentences of the toy corpus, each with two random vectors: w, the word itself (a dot), and c, the word as a neighbour (a square). Press Train: a window slides over the sentence, and each pair of neighbours pulls its vectors together.`;
}

export const initialVars = (s: S) => baseVars(s);

export function describe(s: S): string {
  const v = (xs: Vec2[]) => VOCAB.map((x, i) => `${x} ${vec(xs[i]!)}`).join(', ');
  return `After ${s.pairs} updates (${s.passes} passes). Word vectors: ${v(s.w)}. Context vectors: ${v(s.c)}.`;
}
