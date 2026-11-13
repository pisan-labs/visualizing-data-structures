/**
 * Sampling the next token: a model's logits for eight candidate words after "the cat sat on
 * the", turned into a choice (SLP3 on sampling; Fan et al. 2018 for top-k, Holtzman et al. 2020
 * for top-p, Nguyen et al. 2024 for min-p).
 *
 *   z_i = logit_i / T                        temperature: T < 1 sharpens, T > 1 flattens
 *   p_i = e^(z_i − max z) / Σ_j e^(z_j − max z)  a stable softmax
 *   cut: greedy keeps the top token; top-k the k most likely; top-p the fewest, most likely
 *        first, whose probabilities add up to at least p; min-p every token with
 *        p_i ≥ ratio · max p
 *   p′_i = p_i / Σ_kept p_j                  the survivors, renormalized
 *   draw u in [0, 1); lay the p′ end to end, most likely first; take the token whose stretch
 *        holds u (src/viz/_decode/draw.ts)
 *
 * Temperature comes first, then the cut.
 *
 * Operations: load (logits, two to eight numbers, one per candidate word in order), softmax
 * (temperature and probabilities only), sample (the whole pass with a seeded u), draw (the
 * whole pass with a u the learner gives) and repeat (twenty seeded draws, counted).
 */
import type { Rng } from '../../engine/rng';
import type { Mark, OpSpec, PseudoBlock, Scalar, Step } from '../../engine/types';
import { round3, softmax, two } from '../_lm/numbers';
import { byProbability, pickByU } from '../_decode/draw';

export const WORDS = ['mat', 'rug', 'box', 'tree', 'ball', 'dog', 'the', 'ran'] as const;
export const PROMPT = 'the cat sat on the';
export const START_LOGITS = [3.2, 2.4, 1.9, 1.1, 0.6, 0.1, -0.8, -1.5];
export const MAX_LOGIT = 10;
export const REPEATS = 20;

export type Strategy = 'greedy' | 'pure' | 'top-k' | 'top-p' | 'min-p';

export interface SampSettings {
  [key: string]: Scalar;
  strategy: Strategy;
  temperature: string;
  k: number;
  p: string;
  minP: string;
}

export const defaults: SampSettings = {
  strategy: 'top-p',
  temperature: '1',
  k: 3,
  p: '0.9',
  minP: '0.1',
};

/** One pass from logits to a token. */
export interface Pass {
  t: number;
  /** logit / T, in word order. */
  z: number[];
  /** The softmax of z, in word order. */
  p: number[];
  /** e^(z − max), and their sum, for narration. */
  e: number[];
  max: number;
  sum: number;
  /** Word indices, most likely first. */
  order: number[];
  /** How many of `order` survive the cut. */
  keep: number;
  /** Probability kept before renormalizing. */
  mass: number;
  /** Renormalized probabilities, in word order (0 for a dropped word). */
  q: number[];
  /** The uniform number, or null for greedy (which needs none). */
  u: number | null;
  /** Position in `order` of the word drawn. */
  at: number;
  /** Each kept word's stretch of [0, 1), by position in `order`. */
  from: number[];
  to: number[];
}

export interface SampState {
  words: string[];
  logits: number[];
  /** After softmax or a draw: the last pass. */
  pass?: Pass;
  /** Whether the pass has been cut and drawn, or only softmaxed. */
  drawn: boolean;
  /** How often each word has been drawn since the logits were loaded. */
  tally: number[];
}

/** How far a step has got through a pass: what each column shows. */
export interface SampWork {
  pass: Pass;
  stage: 'z' | 'p' | 'cut' | 'q' | 'draw';
}

export interface SampExtra {
  work?: SampWork;
}

type S = SampState;
type X = SampExtra;
type Op = OpSpec<S, SampSettings, X>;
type SStep = Step<S, X>;

export const temperatureOf = (s: SampSettings): number => Number(s.temperature) || 1;

export function strategyName(s: SampSettings): string {
  switch (s.strategy) {
    case 'greedy':
      return 'greedy';
    case 'pure':
      return 'plain sampling';
    case 'top-k':
      return `top-k (k = ${s.k})`;
    case 'top-p':
      return `top-p (p = ${s.p})`;
    case 'min-p':
      return `min-p (${s.minP} × the top)`;
  }
}

/** Temperature and softmax: the part every strategy shares. */
export function soften(logits: readonly number[], t: number) {
  const z = logits.map((l) => l / t);
  const sm = softmax(z);
  return { z, p: sm.p, e: sm.e, max: sm.max, sum: sm.sum, order: byProbability(sm.p) };
}

/** How many of the words, most likely first, survive the cut. */
export function keepCount(p: readonly number[], order: readonly number[], s: SampSettings): number {
  const n = order.length;
  switch (s.strategy) {
    case 'greedy':
      return 1;
    case 'pure':
      return n;
    case 'top-k':
      return Math.max(1, Math.min(n, Math.round(s.k)));
    case 'top-p': {
      const target = Number(s.p);
      let cum = 0;
      for (let k = 0; k < n; k++) {
        cum += p[order[k]!]!;
        if (cum >= target) return k + 1;
      }
      return n;
    }
    case 'min-p': {
      const floor = Number(s.minP) * p[order[0]!]!;
      let k = 0;
      while (k < n && p[order[k]!]! >= floor) k++;
      return k;
    }
  }
}

/** The whole pass. `u` is ignored by greedy. */
export function runPass(logits: readonly number[], s: SampSettings, u: number): Pass {
  const t = temperatureOf(s);
  const base = soften(logits, t);
  const keep = keepCount(base.p, base.order, s);
  const kept = base.order.slice(0, keep);
  let mass = 0;
  for (const i of kept) mass += base.p[i]!;
  const q = base.p.map(() => 0);
  for (const i of kept) q[i] = base.p[i]! / mass;
  const greedy = s.strategy === 'greedy';
  const pick = pickByU(q, kept, greedy ? 0 : u);
  return {
    t,
    ...base,
    keep,
    mass,
    q,
    u: greedy ? null : u,
    at: greedy ? 0 : pick.at,
    from: pick.from,
    to: pick.to,
  };
}

// ---------------------------------------------------------------------------------------------
// Input

/** Two to eight logits, one per candidate word in order; an Error says what is wrong. */
export function parseLogits(text: string): number[] | Error {
  const parts = text
    .replace(/[−–]/g, '-')
    .split(/[\s,]+/)
    .filter(Boolean);
  if (parts.length < 2)
    return new Error('Type at least two logits, one per word, such as 3.2 2.4 1.9.');
  if (parts.length > WORDS.length)
    return new Error(`At most ${WORDS.length} logits, one for each of ${WORDS.join(', ')}.`);
  const xs = parts.map(Number);
  if (xs.some((x, i) => !Number.isFinite(x) || !/^-?(\d+\.?\d*|\.\d+)$/.test(parts[i]!)))
    return new Error('Logits are numbers, such as 3.2 or -1.5.');
  if (xs.some((x) => Math.abs(x) > MAX_LOGIT))
    return new Error(`Keep each logit between −${MAX_LOGIT} and ${MAX_LOGIT}.`);
  return xs;
}

/** A uniform number for "draw": one number in [0, 1). */
export function parseU(text: string): number | Error {
  const t = text.trim();
  const u = Number(t);
  if (!/^(0?\.\d+|0)$/.test(t) || !(u >= 0 && u < 1))
    return new Error('For a draw, type one number u from 0 up to (not including) 1, such as 0.62.');
  return u;
}

/** Logits to one decimal, as typed. */
export const fmt = (xs: readonly number[]) =>
  xs.map((x) => (Math.round(x * 10) / 10).toFixed(1)).join(' ');

/** `size` logits that fall off from a top score, with some noise: a typical next-word shape. */
export function randomLogits(rng: Rng, size: number): string {
  const n = Math.max(2, Math.min(WORDS.length, size));
  let x = rng.int(20, 40) / 10;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    out.push(x);
    x -= rng.int(2, 12) / 10;
  }
  return fmt(out);
}

export function init(): S {
  return load(START_LOGITS);
}

function load(logits: readonly number[]): S {
  return {
    words: WORDS.slice(0, logits.length),
    logits: [...logits],
    drawn: false,
    tally: logits.map(() => 0),
  };
}

// ---------------------------------------------------------------------------------------------
// Steps

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });

export function baseVars(s: S, settings: SampSettings): Record<string, Scalar> {
  const out: Record<string, Scalar> = {
    words: s.words.length,
    T: temperatureOf(settings),
  };
  if (s.pass && s.drawn) out.kept = s.pass.keep;
  const draws = s.tally.reduce((a, b) => a + b, 0);
  if (draws) out.draws = draws;
  return out;
}

/** The steps that divide by T and take the softmax. */
function* softenSteps(
  s: S,
  pass: Pass,
  vars: () => Record<string, Scalar>,
): Generator<SStep, void, void> {
  const step = (
    say: string,
    lines: string[],
    level: 1 | 2 | 3,
    stage: SampWork['stage'],
    marks: Mark[] = [],
  ): SStep => ({
    state: s,
    marks,
    say,
    lines,
    level,
    vars: vars(),
    extra: { work: { pass, stage } },
  });
  const top = pass.order[0]!;
  const w = s.words;
  yield step(
    pass.t === 1
      ? 'Temperature T = 1 leaves the logits as they are.'
      : `Divide every logit by the temperature T = ${pass.t}. ${pass.t < 1 ? 'Dividing by less than 1 spreads the logits apart, so the top word will pull further ahead' : 'Dividing by more than 1 squeezes the logits together, so the words will get closer probabilities'}: ${w[top]} goes from ${two(s.logits[top]!)} to ${two(pass.z[top]!)}.`,
    ['temp'],
    2,
    'z',
    w.map((_, i) => mark(`z-${i}`, 'new')),
  );
  for (const i of pass.order)
    yield step(
      `e^(${two(pass.z[i]!)} − ${two(pass.max)}) = ${two(pass.e[i]!)} for ${w[i]}. Subtracting the largest first keeps every power at most 1, so nothing overflows.`,
      ['exp'],
      3,
      'z',
      [mark(`z-${i}`, 'active')],
    );
  yield step(
    `Softmax: the powers add up to ${two(pass.sum)}; divide each by that. ${w[top]} gets ${two(pass.p[top]!)}, and the ${w.length} probabilities add up to 1.`,
    ['exp', 'soft'],
    2,
    'p',
    [mark(`p-${top}`, 'active')],
  );
}

function cutSay(pass: Pass, words: readonly string[], settings: SampSettings): string {
  const kept = pass.order.slice(0, pass.keep);
  const names = kept.map((i) => words[i]!);
  const list =
    names.length === 1 ? names[0]! : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
  const dropped = words.length - pass.keep;
  const rest = dropped
    ? ` The other ${dropped === 1 ? 'word drops' : `${dropped} drop`} out.`
    : ' Nothing is dropped.';
  switch (settings.strategy) {
    case 'greedy':
      return `Greedy takes the most likely word, ${names[0]} (${two(pass.p[kept[0]!]!)}), every time. No random number is needed.`;
    case 'pure':
      return `Plain sampling keeps every word, however unlikely.${rest}`;
    case 'top-k':
      return `Top-k with k = ${settings.k} keeps the ${pass.keep === 1 ? 'most likely word' : `${pass.keep} most likely words`}: ${list}, ${two(pass.mass)} of the probability.${rest}`;
    case 'top-p': {
      const sums = kept.map((i) => two(pass.p[i]!)).join(' + ');
      return pass.keep === 1
        ? `Top-p with p = ${settings.p}: add up the probabilities, most likely first, until they reach ${settings.p}. ${list} alone has ${two(pass.mass)}, so it is the only word kept.${rest}`
        : `Top-p with p = ${settings.p}: add up the probabilities, most likely first, until they reach ${settings.p}. ${sums} = ${two(pass.mass)}, so ${list} stay.${rest}`;
    }
    case 'min-p': {
      const floor = Number(settings.minP) * pass.p[pass.order[0]!]!;
      return `Min-p with ratio ${settings.minP}: the floor is ${settings.minP} × ${two(pass.p[pass.order[0]!]!)} = ${two(floor)}, that share of the top word's probability. Every word at or above it stays: ${list}.${rest}`;
    }
  }
}

/** The steps after the softmax: the cut, the renormalizing and the draw. */
function* drawSteps(
  s: S,
  pass: Pass,
  settings: SampSettings,
  vars: () => Record<string, Scalar>,
): Generator<SStep, void, void> {
  const w = s.words;
  const kept = pass.order.slice(0, pass.keep);
  const step = (
    say: string,
    lines: string[],
    stage: SampWork['stage'],
    marks: Mark[] = [],
  ): SStep => ({
    state: s,
    marks,
    say,
    lines,
    level: 2,
    vars: vars(),
    extra: { work: { pass, stage } },
  });
  yield step(
    cutSay(pass, w, settings),
    ['cut'],
    'cut',
    kept.map((i) => mark(`p-${i}`, 'active')),
  );
  if (settings.strategy === 'greedy') return;
  yield step(
    pass.keep === w.length
      ? 'Nothing was dropped, so the probabilities already add up to 1.'
      : `Renormalize: divide each survivor by ${two(pass.mass)}, so they add up to 1 again. ${w[kept[0]!]} goes from ${two(pass.p[kept[0]!]!)} to ${two(pass.q[kept[0]!]!)}.`,
    ['renorm'],
    'q',
    kept.map((i) => mark(`q-${i}`, 'new')),
  );
}

function drawSay(pass: Pass, words: readonly string[]): string {
  const i = pass.order[pass.at]!;
  return `Draw u = ${round3(pass.u!)}. Lay the bars end to end, most likely first: ${words[i]} covers ${round3(pass.from[pass.at]!)} to ${round3(pass.to[pass.at]!)}, so u lands in ${words[i]}.`;
}

/** The pass, from wherever the state has got to, ending on the draw. */
function* passSteps(
  s: S,
  settings: SampSettings,
  u: number,
  vars: () => Record<string, Scalar>,
): Generator<SStep, Pass, void> {
  const pass = runPass(s.logits, settings, u);
  if (!s.pass) yield* softenSteps(s, pass, vars);
  yield* drawSteps(s, pass, settings, vars);
  return pass;
}

function finish(s: S, pass: Pass, add = 1): S {
  const tally = [...s.tally];
  tally[pass.order[pass.at]!]! += add;
  return { ...s, pass, drawn: true, tally };
}

const pickMarks = (pass: Pass): Mark[] => {
  const i = pass.order[pass.at]!;
  return [mark(`q-${i}`, 'found'), mark(`w-${i}`, 'found'), mark(`n-${i}`, 'found')];
};

const loadOp: Op = {
  label: 'Load',
  arity: 1,
  *run(s, args, { settings }) {
    const logits = parseLogits(String(args[0]));
    if (logits instanceof Error) {
      yield {
        state: s,
        marks: [],
        say: logits.message,
        lines: [],
        level: 1,
        vars: baseVars(s, settings),
      };
      return s;
    }
    const next = load(logits);
    const top = byProbability(logits)[0]!;
    yield {
      state: next,
      marks: next.words.map((_, i) => mark(`l-${i}`, 'new')),
      say: `${logits.length} candidate words after "${PROMPT}", each with a logit: the model's raw score, any real number. ${next.words[top]} scores highest (${two(logits[top]!)}). Press Sample.`,
      lines: ['logits'],
      level: 1,
      vars: baseVars(next, settings),
    };
    return next;
  },
};

const softmaxOp: Op = {
  label: 'Softmax',
  arity: 0,
  *run(s, _args, { settings }) {
    const pass = runPass(s.logits, settings, 0);
    const vars = () => baseVars(s, settings);
    yield* softenSteps(s, pass, vars);
    const next: S = { ...s, pass, drawn: false };
    const top = pass.order[0]!;
    yield {
      state: next,
      marks: [mark(`p-${top}`, 'found')],
      say: `The distribution over the next word at T = ${pass.t}: ${pass.order
        .slice(0, 3)
        .map((i) => `${s.words[i]} ${two(pass.p[i]!)}`)
        .join(
          ', ',
        )}${s.words.length > 3 ? ' and so on' : ''}. Press Sample to cut it with ${strategyName(settings)} and draw.`,
      lines: ['soft'],
      level: 1,
      vars: baseVars(next, settings),
    };
    return next;
  },
};

function drawOp(fixed: boolean): Op {
  return {
    label: fixed ? 'Draw with u' : 'Sample',
    arity: fixed ? 1 : 0,
    *run(s, args, { settings, rng }) {
      let u: number;
      if (fixed) {
        const v = parseU(String(args[0]));
        if (v instanceof Error) {
          yield {
            state: s,
            marks: [],
            say: v.message,
            lines: [],
            level: 1,
            vars: baseVars(s, settings),
          };
          return s;
        }
        u = v;
      } else u = rng.next();
      const vars = () => baseVars(s, settings);
      const pass = yield* passSteps(s, settings, u, vars);
      const next = finish(s, pass);
      const word = s.words[pass.order[pass.at]!]!;
      yield {
        state: next,
        marks: pickMarks(pass),
        say:
          pass.u === null
            ? `Greedy picks ${word}. Run it again and it picks ${word} again: no randomness at all.`
            : `${drawSay(pass, s.words)} The next word is ${word}.`,
        lines: pass.u === null ? ['cut'] : ['draw', 'ret'],
        level: 1,
        vars: baseVars(next, settings),
      };
      return next;
    },
  };
}

const repeatOp: Op = {
  label: `Sample ${REPEATS} times`,
  arity: 0,
  *run(s, _args, { settings, rng }) {
    let cur = s;
    const vars = () => baseVars(cur, settings);
    const first = yield* passSteps(s, settings, rng.next(), vars);
    cur = finish(s, first);
    for (let d = 2; d <= REPEATS; d++) {
      const pass = runPass(s.logits, settings, rng.next());
      cur = finish(cur, pass);
      yield {
        state: cur,
        marks: pickMarks(pass),
        say: `Draw ${d} of ${REPEATS}: ${pass.u === null ? 'greedy' : `u = ${round3(pass.u)}`} gives ${s.words[pass.order[pass.at]!]}.`,
        lines: settings.strategy === 'greedy' ? ['cut'] : ['draw'],
        level: 3,
        vars: vars(),
        extra: { work: { pass, stage: 'draw' } },
      };
    }
    const counts = cur
      .pass!.order.filter((i) => cur.tally[i]! > 0)
      .map((i) => `${s.words[i]} ${cur.tally[i]}`)
      .join(', ');
    const fresh = cur.tally.map((c, i) => c - s.tally[i]!);
    const kinds = fresh.filter((c) => c > 0).length;
    yield {
      state: cur,
      marks: cur.words.flatMap((_, i) => (fresh[i]! > 0 ? [mark(`n-${i}`, 'found')] : [])),
      say: `${REPEATS} draws with ${strategyName(settings)} at T = ${temperatureOf(settings)}: ${kinds === 1 ? 'the same word every time' : `${kinds} different words`}. Counts so far: ${counts}. ${settings.strategy === 'greedy' ? 'Greedy never varies.' : 'The counts follow p′, give or take luck.'}`,
      lines: settings.strategy === 'greedy' ? ['cut'] : ['draw', 'ret'],
      level: 1,
      vars: baseVars(cur, settings),
    };
    return cur;
  },
};

export const ops = {
  load: loadOp,
  softmax: softmaxOp,
  sample: drawOp(false),
  draw: drawOp(true),
  repeat: repeatOp,
};

// ---------------------------------------------------------------------------------------------
// Pseudocode

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

function cutLines(settings: SampSettings) {
  switch (settings.strategy) {
    case 'greedy':
      return [L('cut', 1, 'return argmax_i p_i', 'Greedy: just take the most likely word.')];
    case 'pure':
      return [L('cut', 1, 'keep every token', 'Plain sampling: keep every word.')];
    case 'top-k':
      return [
        L(
          'cut',
          1,
          'keep the k tokens with the largest p',
          `Keep only the ${settings.k} most likely words.`,
        ),
      ];
    case 'top-p':
      return [
        L(
          'cut',
          1,
          'keep the fewest tokens, largest first, with Σ p ≥ p',
          `Keep the most likely words until together they have at least ${settings.p} of the probability.`,
        ),
      ];
    case 'min-p':
      return [
        L(
          'cut',
          1,
          'keep every token with p_i ≥ ratio · max p',
          `Keep the words with at least ${settings.minP} of the top word's probability.`,
        ),
      ];
  }
}

export function pseudocode(settings: SampSettings): PseudoBlock[] {
  const soft = [
    L('temp', 1, 'z_i = logit_i / T', 'Divide every score by the temperature.'),
    L('exp', 1, 'e_i = exp(z_i − max_j z_j)', 'Take e to each, after subtracting the largest.'),
    L('soft', 1, 'p_i = e_i / Σ_j e_j', 'Divide by the total, so they add up to 1.'),
  ];
  const tail =
    settings.strategy === 'greedy'
      ? cutLines(settings)
      : [
          ...cutLines(settings),
          L('renorm', 1, 'p′_i = p_i / Σ_kept p_j', 'Scale the survivors up so they add up to 1.'),
          L(
            'draw',
            1,
            'u = uniform(0, 1); walk the kept tokens, largest first, until Σ p′ > u',
            'Pick a random point between 0 and 1 and see whose stretch it lands in.',
          ),
          L('ret', 1, 'return that token', 'That is the next word.'),
        ];
  return [
    {
      op: 'load',
      lines: [
        L('lsig', 0, 'LOAD(logits)', 'Start from the model’s raw scores:'),
        L(
          'logits',
          1,
          'one logit per candidate token',
          'one number for each word that could come next.',
        ),
      ],
    },
    {
      op: 'softmax',
      lines: [L('ssig', 0, 'SOFTMAX(logits, T)', 'Turn scores into probabilities:'), ...soft],
    },
    ...(['sample', 'draw', 'repeat'] as const).map((op) => ({
      op,
      lines: [L(`${op}-sig`, 0, `SAMPLE(logits, T)`, 'Choose the next word:'), ...soft, ...tail],
    })),
  ];
}

// ---------------------------------------------------------------------------------------------
// Words for screen readers and narration

export function initialSay(s: S): string {
  return `The model has read "${PROMPT}" and gives each of ${s.words.length} candidate next words a logit, a raw score. Press Sample to turn them into probabilities, cut the unlikely ones and draw one.`;
}

export const initialVars = (s: S, settings: SampSettings) => baseVars(s, settings);

export function describe(s: S): string {
  const logits = s.words.map((w, i) => `${w} ${two(s.logits[i]!)}`).join(', ');
  if (!s.pass) return `Logits after "${PROMPT}": ${logits}.`;
  const p = s.pass.order.map((i) => `${s.words[i]} ${two(s.pass!.p[i]!)}`).join(', ');
  if (!s.drawn) return `Logits: ${logits}. Probabilities: ${p}.`;
  return `Logits: ${logits}. Probabilities: ${p}. ${s.pass.keep} kept; drew ${s.words[s.pass.order[s.pass.at]!]}.`;
}
