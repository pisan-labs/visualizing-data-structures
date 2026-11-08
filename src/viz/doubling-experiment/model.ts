import type { Mark, OpSpec, PseudoBlock, Scalar, Step, Value } from '../../engine/types';
import { L, and, mark, wholeArg } from '../_recursion/kit';
import { countShort, countText, type Count } from '../big-o-lab/model';
import { ALGO, count, median, noisy, type Algo, type AlgoId } from './algos';

/** The most sizes one run measures: n, 2n, …, 128n. */
export const MAX_ROWS = 8;
/** Noisy sizes take the median of this many runs when the noise setting asks for it. */
export const REPEATS = 5;

export type Noise = 'off' | 'one' | 'median';
export type FitHow = 'last' | 'all';

export interface DxSettings {
  [key: string]: Scalar;
  algo: AlgoId;
  noise: Noise;
  fit: FitHow;
}

export const defaults: DxSettings = { algo: 'insertion', noise: 'off', fit: 'last' };

export interface Row {
  n: number;
  /** The reading: the step count, or with noise on what the timer reports (or their median). */
  t: number;
  /** The true step count. */
  exact: number;
  /** The readings the median came from. */
  runs?: number[];
}

/** The model T(n) ≈ a·nᵇ. */
export interface Fit {
  a: number;
  b: number;
}

/** A prediction at n from the model, and the reading that checks it (null until it runs). */
export interface Guess {
  n: number;
  guess: number;
  t: number | null;
  exact: number;
  runs?: number[];
}

/**
 * The frame of the log-log plot: log₂ n from x0 to x1, log₁₀ T from y0 to y1. Set when an
 * operation starts, from every value it will show, so the axes hold still while it runs.
 */
export interface Axes {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export interface DxState {
  /** The experiment's seed: the inputs of every size come from it. Null before any run. */
  seed: number | null;
  /** The sizes the run measures, in order. */
  sizes: number[];
  /** The sizes measured so far. */
  rows: Row[];
  fit: Fit | null;
  guess: Guess | null;
  axes: Axes;
}

type S = DxState;
type Op = OpSpec<S, DxSettings, undefined>;
type DxStep = Step<S, undefined>;

export const algoOf = (settings: DxSettings): Algo => ALGO[settings.algo] ?? ALGO.insertion;

export function init(): S {
  return { seed: null, sizes: [], rows: [], fit: null, guess: null, axes: axesFor([], []) };
}

// ----- Numbers -----

const asCount = (v: number): Count =>
  v < 2 ** 53
    ? { exact: BigInt(Math.round(v)), lg: Math.log10(v) }
    : { exact: null, lg: Math.log10(v) };

/** A count for narration: "10,234,567", or "1.27 × 10^30" past 15 digits. */
export const tText = (v: number) => countText(asCount(v));
/** A count for the drawing: "10,234,567", or "1.3e30" past a billion. */
export const tShort = (v: number) => countShort(asCount(v));

export const commas = (v: number) => v.toLocaleString('en-US');

/** The typographic minus, so "−0.25" reads as a negative number. */
const minus = (s: string) => s.replace('-', '−');

/** b and ratios with two decimals. */
export const fix2 = (v: number) => minus(v.toFixed(2));

/** b = log₂ of the ratio of a count to the count at half the size. */
export const bOf = (before: number, after: number) => Math.log2(after / before);

/** a with three significant digits: "0.253", "12.4", "3.1e-7". */
export function aText(a: number): string {
  if (a >= 1e-3 && a < 1e6) return String(Number(a.toPrecision(3)));
  const e = Math.floor(Math.log10(a));
  return `${Number((a / 10 ** e).toPrecision(2))}e${e}`;
}

/** "0.253·n^1.99". */
export const modelText = (f: Fit) => `${aText(f.a)}·n^${fix2(f.b)}`;

/** The ratios and the b of every row after the first. */
export function ratios(rows: readonly Row[]): { ratio: number; b: number }[] {
  return rows.slice(1).map((r, i) => ({ ratio: r.t / rows[i]!.t, b: bOf(rows[i]!.t, r.t) }));
}

// ----- Measuring and fitting -----

/** One size of an experiment: the true count, and the reading the noise setting gives. */
export function measure(settings: DxSettings, n: number, seed: number): Row {
  const exact = count(algoOf(settings).id, n, seed);
  if (settings.noise === 'off') return { n, t: exact, exact };
  if (settings.noise === 'one') return { n, t: noisy(exact, seed, n, 0), exact };
  const runs = Array.from({ length: REPEATS }, (_, r) => noisy(exact, seed, n, r));
  return { n, t: median(runs), exact, runs };
}

/**
 * The model through the rows: with 'last', b from the last two rows (Sedgewick and Wayne's
 * doubling test) and a so the model passes through the last row; with 'all', the least-squares
 * line through every point of the log-log plot.
 */
export function fitOf(rows: readonly Row[], how: FitHow): Fit {
  if (how === 'last' || rows.length === 2) {
    const last = rows.at(-1)!;
    const b = bOf(rows.at(-2)!.t, last.t);
    return { a: last.t / last.n ** b, b };
  }
  const xs = rows.map((r) => Math.log2(r.n));
  const ys = rows.map((r) => Math.log2(r.t));
  const mx = xs.reduce((p, q) => p + q, 0) / xs.length;
  const my = ys.reduce((p, q) => p + q, 0) / ys.length;
  let sxy = 0;
  let sxx = 0;
  xs.forEach((x, i) => {
    sxy += (x - mx) * (ys[i]! - my);
    sxx += (x - mx) ** 2;
  });
  const b = sxy / sxx;
  return { a: 2 ** (my - b * mx), b };
}

export const predictAt = (f: Fit, n: number) => f.a * n ** f.b;

/** A frame that holds these sizes and values, with half a doubling to spare on each side. */
export function axesFor(ns: readonly number[], ts: readonly number[]): Axes {
  if (ns.length === 0) return { x0: 0, x1: 10, y0: 0, y1: 6 };
  const lx = ns.map(Math.log2);
  let x0 = Math.min(...lx) - 0.5;
  let x1 = Math.max(...lx) + 0.5;
  if (x1 - x0 < 3) {
    const mid = (x0 + x1) / 2;
    x0 = mid - 1.5;
    x1 = mid + 1.5;
  }
  // Counts are at least 1, so the bottom is 10⁰ or above; only a guess can go below 1.
  const ly = ts.filter((t) => t > 0).map(Math.log10);
  const low = ly.length ? Math.min(...ly) : 0;
  const y0 = low >= 0 ? Math.max(0, Math.floor(low - 0.05)) : Math.floor(low - 0.05);
  let y1 = ly.length ? Math.ceil(Math.max(...ly) + 0.05) : 1;
  if (y1 <= y0) y1 = y0 + 1;
  return { x0, x1, y0, y1 };
}

// ----- Text -----

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const stepsOf = (al: Algo, t: number) => (t === 1 ? al.step : al.steps);

/** How far a guess was from the reading: "1.2% low", "3.4 times too high". */
export function errorText(guess: number, t: number): string {
  const err = (guess - t) / t;
  if (Math.abs(err) < 0.0005) return 'spot on';
  const times = (f: number) => (f < 10 ? f.toFixed(1) : tText(f));
  if (guess >= 2 * t) return `${times(guess / t)} times too high`;
  if (t >= 2 * guess) return `${times(t / guess)} times too low`;
  return `${(Math.abs(err) * 100).toFixed(1)}% ${err > 0 ? 'high' : 'low'}`;
}

/** What one size's reading was, for narration. */
function readingText(al: Algo, r: Row, settings: DxSettings): string {
  if (settings.noise === 'off') return `${tText(r.t)} ${stepsOf(al, r.t)}`;
  if (r.runs)
    return `five timed runs read ${and(r.runs.map(tText))}; their median is ${tText(r.t)} (the true count is ${tText(r.exact)})`;
  return `the timer reads ${tText(r.t)} (the true count is ${tText(r.exact)})`;
}

/** How much a list of b values wobbles: the mean distance from their median. */
function wobble(bs: readonly number[]): number {
  const mid = median([...bs]);
  return bs.reduce((s, b) => s + Math.abs(b - mid), 0) / bs.length;
}

/** What the finished table says, by algorithm, noise and how the ratios moved. */
function reading(al: Algo, rows: readonly Row[], settings: DxSettings): string {
  const rs = ratios(rows);
  if (rs.length === 0)
    return `Only n = ${commas(rows[0]!.n)} fits under the largest n for ${al.name}, ${commas(al.maxN)}. Start smaller to get a ratio.`;
  const bs = rs.map((r) => r.b);
  const listed = and(bs.map(fix2));
  const last = bs.at(-1)!;
  if (settings.noise !== 'off') {
    const head = `With noise on, b went ${listed}.`;
    const truth = `The true count grows like ${al.order}.`;
    if (al.id === 'binary')
      return `${head} Binary search takes so few steps that the noise is bigger than the work. Time a few thousand searches together, not one. ${truth}`;
    if (settings.noise === 'median') {
      // The first of the five readings is what one run per size would have read.
      const single = ratios(rows.map((r) => ({ ...r, t: r.runs![0]! }))).map((r) => r.b);
      const steadier = wobble(bs) < 0.8 * wobble(single);
      return `${head} ${steadier ? 'The median of five is steadier' : 'Here the median of five barely helped; bigger n is the surer fix'}: with one run per size, b would have gone ${and(single.map(fix2))}. ${truth}`;
    }
    const tail = bs.slice(-3);
    if (Math.max(...tail) - Math.min(...tail) <= 0.15)
      return `${head} The small sizes jump around and the big ones settle: a long run drowns out the timer's jitter. ${truth}`;
    return `${head} Single ratios jump. Bigger n steadies them, and so does the median of several runs per size. ${truth}`;
  }
  const first = rs[0]!.b;
  const small =
    Math.abs(first - al.b) > 0.15 && (al.id === 'insertion' || al.id === 'threesum')
      ? ` The first ratio is off because at n = ${commas(rows[0]!.n)} the lower-order terms still count${al.id === 'threesum' ? ': n(n−1)(n−2)/6 = n³/6 − n²/2 + n/3' : ''}.`
      : '';
  switch (al.id) {
    case 'linear':
      return `Every ratio is exactly 2, so b = ${fix2(last)}: the count is n itself. Linear search for a missing value is O(n).`;
    case 'binary':
      return `The count goes up by about 1 each time n doubles, so the ratios slide toward 1 and b toward 0 (${listed}). That is log n: a doubling test reads it as a tiny power of n.`;
    case 'hash': {
      const per = (rows.at(-1)!.t / rows.at(-1)!.n).toFixed(1);
      return `b stays near 1 (${listed}): each value takes a slot or two whatever n is, so n values take about ${per}·n steps. O(n) on average.`;
    }
    case 'merge':
      return `The ratios stay a little over 2, so b reads ${fix2(last)} and is still sliding down (${listed}). Merge sort is n log n, not n^${fix2(last)}: a doubling test cannot see a log factor.`;
    case 'insertion':
      return `b settles near 2 (${listed}): each doubling of n multiplies the comparisons by about 4. Insertion sort on random input is O(n²).${small}`;
    case 'threesum':
      return `b settles near 3 (${listed}): each doubling multiplies the triples checked by about 8. Three nested loops, O(n³).${small}`;
  }
}

// ----- Operations -----

function vars(s: S, more: Record<string, Scalar> = {}): Record<string, Scalar> {
  const out: Record<string, Scalar> = {};
  if (s.seed !== null) out.seed = s.seed;
  return { ...out, ...more };
}

const reject = (s: S, say: string): DxStep => ({
  state: s,
  marks: [],
  say,
  lines: [],
  vars: vars(s),
  level: 1,
});

const range = (al: Algo) => `${commas(al.minN)} to ${commas(al.maxN)}`;

/** "100, 200 and 400", or "100, 200, 400, …, 12,800" for longer lists. */
export const sizesText = (sizes: readonly number[]) =>
  sizes.length <= 4
    ? and(sizes.map(commas))
    : `${sizes.slice(0, 3).map(commas).join(', ')}, …, ${commas(sizes.at(-1)!)}`;

const run: Op = {
  label: 'Run',
  arity: 1,
  *run(s, [raw]: Value[], { settings, rng }) {
    const al = algoOf(settings);
    const n = wholeArg(raw, al.minN, al.maxN);
    if (n === null) {
      yield reject(s, `Pick a starting n from ${range(al)} for ${al.name}. Nothing changed.`);
      return s;
    }
    const sizes: number[] = [];
    for (let m = n; m <= al.maxN && sizes.length < MAX_ROWS; m *= 2) sizes.push(m);
    const seed = rng.int(1, 999_999);
    const all = sizes.map((m) => measure(settings, m, seed));
    const fit = all.length >= 2 ? fitOf(all, settings.fit) : null;
    let st: S = {
      seed,
      sizes,
      rows: [],
      fit: null,
      guess: null,
      axes: axesFor(
        sizes,
        all.map((r) => r.t),
      ),
    };
    const upTo =
      sizes.length === 1
        ? `n = ${commas(n)} (2n would pass ${commas(al.maxN)}, the largest n here)`
        : `n = ${sizesText(sizes)}`;
    yield {
      state: st,
      marks: [],
      say: `${cap(al.name)}: count ${al.steps} for ${upTo}, each size double the one before. The inputs come from seed ${seed}.`,
      lines: ['run.loop'],
      vars: vars(st, { 'n from': n, 'n up to': sizes.at(-1)! }),
      level: 2,
    };
    for (let k = 0; k < all.length; k++) {
      const r = all[k]!;
      st = { ...st, rows: all.slice(0, k + 1) };
      const marks: Mark[] = [mark(`t-row-${k}`, 'active'), mark(`p-pt-${k}`, 'active')];
      const extra: Record<string, Scalar> =
        settings.noise === 'off' ? {} : { 'true count': tText(r.exact) };
      if (k === 0) {
        yield {
          state: st,
          marks,
          say: `n = ${commas(r.n)}: ${readingText(al, r, settings)}. One size gives no ratio yet.`,
          lines: ['run.input', 'run.measure'],
          vars: vars(st, { n: r.n, 'T(n)': tText(r.t), ...extra }),
          level: 2,
        };
        continue;
      }
      const prev = all[k - 1]!;
      const ratio = r.t / prev.t;
      const b = bOf(prev.t, r.t);
      marks.push(mark(`p-seg-${k}`, 'active'));
      yield {
        state: st,
        marks,
        say: `n = ${commas(r.n)}: ${readingText(al, r, settings)}. That is ${fix2(ratio)} times T(${commas(prev.n)}), so b = log₂ ${fix2(ratio)} = ${fix2(b)}.`,
        lines: ['run.measure', 'run.ratio', 'run.b'],
        vars: vars(st, { n: r.n, 'T(n)': tText(r.t), ratio: fix2(ratio), b: fix2(b), ...extra }),
        level: 2,
      };
    }
    if (fit) {
      st = { ...st, fit };
      const last = all.at(-1)!;
      yield {
        state: st,
        marks: [mark('p-fit', 'found'), mark('t-model', 'found')],
        say:
          settings.fit === 'last' || all.length === 2
            ? `Fit: take b from the last row, ${fix2(fit.b)}, then a = T(${commas(last.n)}) / ${commas(last.n)}^${fix2(fit.b)} = ${aText(fit.a)}. So T(n) ≈ ${modelText(fit)}: on the log-log plot, a line with slope ${fix2(fit.b)}.`
            : `Fit: the least-squares line through all ${all.length} points of the log-log plot has slope b = ${fix2(fit.b)}, and a = ${aText(fit.a)}. So T(n) ≈ ${modelText(fit)}.`,
        lines: ['run.fit'],
        vars: vars(st, { b: fix2(fit.b), a: aText(fit.a), 'T(n) ≈': modelText(fit) }),
        level: 2,
      };
    }
    const bMarks = all.slice(1).map((_, i) => mark(`t-b-${i + 1}`, 'active'));
    yield {
      state: st,
      marks: fit ? [...bMarks, mark('p-fit', 'found')] : [],
      say: reading(al, all, settings),
      lines: fit ? ['run.model'] : ['run.loop'],
      vars: vars(st, fit ? { b: fix2(fit.b), a: aText(fit.a), 'T(n) ≈': modelText(fit) } : {}),
      level: 1,
    };
    return st;
  },
};

const predict: Op = {
  label: 'Predict',
  arity: 1,
  *run(s, [raw]: Value[], { settings }) {
    const al = algoOf(settings);
    if (!s.fit || s.seed === null) {
      yield reject(
        s,
        'Run an experiment first: a prediction needs the model T(n) ≈ a·nᵇ, and the model needs at least two sizes. Nothing changed.',
      );
      return s;
    }
    const n = wholeArg(raw, al.minN, al.maxN);
    if (n === null) {
      yield reject(s, `Pick n from ${range(al)} for ${al.name}. Nothing changed.`);
      return s;
    }
    const fit = s.fit;
    const guess = predictAt(fit, n);
    const m = measure(settings, n, s.seed);
    let st: S = {
      ...s,
      guess: { n, guess, t: null, exact: m.exact },
      axes: axesFor([...s.sizes, n], [...s.rows.map((r) => r.t), guess, m.t]),
    };
    const model = { 'T(n) ≈': modelText(fit) };
    yield {
      state: st,
      marks: [mark('p-guess', 'active'), mark('t-guess', 'active')],
      say: `Predict: T(${commas(n)}) ≈ ${aText(fit.a)} · ${commas(n)}^${fix2(fit.b)} ≈ ${tText(guess)}.`,
      lines: ['predict.guess'],
      vars: vars(st, { n, guess: tText(guess), ...model }),
      level: 2,
    };
    st = { ...st, guess: { ...st.guess!, t: m.t, ...(m.runs ? { runs: m.runs } : {}) } };
    const close = Math.abs(guess - m.t) <= 0.1 * m.t;
    const why = close
      ? ''
      : settings.noise !== 'off'
        ? ' Noisy readings made the ratios, and so the model, wobble.'
        : ' The model is only as good as the ratios behind it.';
    yield {
      state: st,
      marks: [
        mark('p-check', close ? 'found' : 'error'),
        mark('t-check', close ? 'found' : 'error'),
        mark('p-guess', 'active'),
      ],
      say: `Check: run it at n = ${commas(n)}: ${readingText(al, m, settings)}. The guess was ${errorText(guess, m.t)}.${why}`,
      lines: ['predict.check', 'predict.error'],
      vars: vars(st, {
        n,
        guess: tText(guess),
        measured: tText(m.t),
        error: errorText(guess, m.t),
      }),
      level: 1,
    };
    return st;
  },
};

export const ops: Record<string, Op> = { run, predict };

export function pseudocode(settings: DxSettings): PseudoBlock[] {
  const al = algoOf(settings);
  const measureLine =
    settings.noise === 'off'
      ? L(
          'run.measure',
          2,
          `T[m] = ${al.steps} on A`,
          `run the algorithm on it and count its ${al.steps},`,
        )
      : settings.noise === 'one'
        ? L('run.measure', 2, 'T[m] = time one run on A', 'run it once and read the timer,')
        : L(
            'run.measure',
            2,
            `T[m] = median time of ${REPEATS} runs on A`,
            `run it ${REPEATS} times and keep the middle reading,`,
          );
  const fitLine =
    settings.fit === 'last'
      ? L(
          'run.fit',
          1,
          'b = the last b; a = T[last] / lastᵇ',
          'Keep the last b, and pick a so the model passes through the last point.',
        )
      : L(
          'run.fit',
          1,
          'b, log a = least squares through (log m, log T[m])',
          'Fit one straight line through all the points of the log-log plot.',
        );
  return [
    {
      op: 'run',
      lines: [
        L('run.sig', 0, 'doubling(n)', 'To see how the steps grow, starting from size n:'),
        L(
          'run.loop',
          1,
          'for m = n, 2n, 4n, … while m ≤ largest',
          'try sizes that double each time, up to the largest allowed;',
        ),
        L(
          'run.input',
          2,
          'A = random input of size m',
          'make an input of that size from the seed,',
        ),
        measureLine,
        L('run.ratio', 2, 'ratio = T[m] / T[m / 2]', 'divide by the reading at half the size,'),
        L('run.b', 2, 'b = log₂ ratio', 'and take log base 2 of that: the exponent b.'),
        fitLine,
        L('run.model', 1, 'T(n) ≈ a · nᵇ', 'The model: T(n) is about a times n to the power b.'),
      ],
    },
    {
      op: 'predict',
      lines: [
        L('predict.sig', 0, 'predict(n)', 'To predict the steps at size n:'),
        L('predict.guess', 1, 'guess = a · nᵇ', 'put n into the model,'),
        L('predict.check', 1, 'T = measure at size n', 'then run it at that size,'),
        L(
          'predict.error',
          1,
          'error = (guess − T) / T',
          'and see how far off the guess was, as a share of the reading.',
        ),
      ],
    },
  ];
}

export function initialSay(_state: S, settings: DxSettings): string {
  const al = algoOf(settings);
  return `${cap(al.name)}. Type a starting n and press Run: the page counts its ${al.steps} at n, 2n, 4n, … and reads the growth from the ratios. Pick another algorithm under Options.`;
}

export function initialVars(_state: S, settings: DxSettings): Record<string, Scalar> {
  return { counting: algoOf(settings).steps };
}

/** The state in words. The algorithm is left out: a practice question asks for it. */
export function describe(state: S, settings: DxSettings = defaults): string {
  if (state.seed === null) return 'Doubling experiment: no sizes measured yet.';
  const noisy = settings.noise === 'off' ? '' : ', timed with noise';
  if (state.rows.length === 0)
    return `Doubling experiment, seed ${state.seed}${noisy}: about to measure n = ${state.sizes.map(commas).join(', ')}.`;
  const rs = ratios(state.rows);
  const rows = state.rows
    .map((r, k) => `n = ${commas(r.n)}: ${tText(r.t)}${k ? `, b = ${fix2(rs[k - 1]!.b)}` : ''}`)
    .join('; ');
  const fit = state.fit ? ` Model T(n) ≈ ${modelText(state.fit)}.` : '';
  const g = state.guess;
  const guess = g
    ? ` Guess T(${commas(g.n)}) ≈ ${tText(g.guess)}${g.t !== null ? `, measured ${tText(g.t)}` : ''}.`
    : '';
  return `Doubling experiment, seed ${state.seed}${noisy}: ${rows}.${fit}${guess}`;
}
