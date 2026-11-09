import type { OpSpec, PseudoBlock, Scalar, Step, Value } from '../../engine/types';
import { L, mark, wholeArg } from '../_recursion/kit';

export const MAX_N = 1_000_000;

export const FNS = ['1', 'logn', 'n', 'nlogn', 'n2', '2n', 'fact'] as const;
export type Fn = (typeof FNS)[number];

export const FN_LABEL: Record<Fn, string> = {
  '1': '1',
  logn: 'log n',
  n: 'n',
  nlogn: 'n log n',
  n2: 'n²',
  '2n': '2ⁿ',
  fact: 'n!',
};

/** Names of the counting functions in the code tabs. */
export const FN_CODE: Record<Fn, string> = {
  '1': 'constant',
  logn: 'logarithmic',
  n: 'linear',
  nlogn: 'linearithmic',
  n2: 'quadratic',
  '2n': 'exponential',
  fact: 'factorial',
};

export interface LabState {
  n: number;
  /** n before the last change, for the ratio readout. */
  prev: number | null;
  /** Shown functions, slowest growing first. */
  shown: Fn[];
}

export interface LabSettings {
  [key: string]: Scalar;
  scale: 'linear' | 'log';
  /** Steps per second of the imaginary computer. */
  speed: '1e9' | '1e6';
}

type S = LabState;
type Op = OpSpec<S, LabSettings, undefined>;
type LabStep = Step<S, undefined>;

export const defaults: LabSettings = { scale: 'linear', speed: '1e9' };

export function init(): S {
  return { n: 8, prev: null, shown: ['logn', 'n', 'nlogn', 'n2'] };
}

// ----- Counting -----

/** A step count: exact when it fits, and always its base-10 logarithm (-Infinity for 0). */
export interface Count {
  exact: bigint | null;
  lg: number;
}

/** ⌊log₂ n⌋: how many times n can be halved before it reaches 1. */
export function halvings(n: number): number {
  let k = 0;
  for (let m = n; m > 1; m = Math.floor(m / 2)) k++;
  return k;
}

function lgBig(v: bigint): number {
  if (v === 0n) return -Infinity;
  if (v < 2n ** 53n) return Math.log10(Number(v));
  const s = v.toString();
  return s.length - 1 + Math.log10(Number(`${s[0]}.${s.slice(1, 16)}`));
}

const exact = (v: bigint): Count => ({ exact: v, lg: lgBig(v) });

function lgFactorial(n: number): number {
  if (n <= 2000) {
    let s = 0;
    for (let i = 2; i <= n; i++) s += Math.log10(i);
    return s;
  }
  const ln = n * Math.log(n) - n + 0.5 * Math.log(2 * Math.PI * n) + 1 / (12 * n);
  return ln / Math.LN10;
}

/** The number of steps each kind of loop takes for input size n. */
export function count(f: Fn, n: number): Count {
  const N = BigInt(n);
  switch (f) {
    case '1':
      return exact(1n);
    case 'logn':
      return exact(BigInt(halvings(n)));
    case 'n':
      return exact(N);
    case 'nlogn':
      return exact(N * BigInt(halvings(n)));
    case 'n2':
      return exact(N * N);
    case '2n':
      return n <= 2000 ? exact(1n << N) : { exact: null, lg: n * Math.log10(2) };
    case 'fact': {
      if (n > 400) return { exact: null, lg: lgFactorial(n) };
      let v = 1n;
      for (let i = 2n; i <= N; i++) v *= i;
      return exact(v);
    }
  }
}

const commas = (s: string) => s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

function sci(lg: number, digits: number): { m: string; e: number } {
  let e = Math.floor(lg);
  let m = 10 ** (lg - e);
  if (Number(m.toFixed(digits)) >= 10) {
    m /= 10;
    e += 1;
  }
  return { m: m.toFixed(digits), e };
}

/** For narration: exact with commas up to 15 digits, then "1.27 × 10^30". */
export function countText(c: Count): string {
  if (c.exact !== null && c.exact < 10n ** 15n) return commas(c.exact.toString());
  const { m, e } = sci(c.lg, 2);
  return `${m} × 10^${e}`;
}

/** For the drawing: exact below a billion, then "1.3e30". */
export function countShort(c: Count): string {
  if (c.exact !== null && c.exact < 1_000_000_000n) return commas(c.exact.toString());
  const { m, e } = sci(c.lg, 1);
  return `${m}e${e}`;
}

/** How much the count grew from size a to size b, e.g. "×4" or "from 0". */
export function ratioText(f: Fn, a: number, b: number): string {
  const ca = count(f, a);
  const cb = count(f, b);
  if (ca.lg === -Infinity) return cb.lg === -Infinity ? '×1' : 'from 0';
  if (cb.lg === -Infinity) return 'to 0';
  const small = (c: Count) => c.exact !== null && c.exact < 2n ** 50n;
  const lgr = cb.lg - ca.lg;
  const r = small(ca) && small(cb) ? Number(cb.exact) / Number(ca.exact) : 10 ** lgr;
  if (r >= 1e6 || r < 0.01) {
    const { m, e } = sci(lgr, 1);
    return `×${m}e${e}`;
  }
  const t = r.toFixed(r < 10 ? 2 : r < 1000 ? 1 : 0);
  return `×${commas(t.includes('.') ? t.replace(/\.?0+$/, '') : t)}`;
}

const YEAR = 365.25 * 24 * 3600;

/** How long the steps take at `speed` steps per second. */
export function timeText(c: Count, speed: number): string {
  if (c.lg === -Infinity) return 'no time';
  const lgSec = c.lg - Math.log10(speed);
  const sec = 10 ** lgSec;
  if (sec < 1e-6) return `${Math.max(1, Math.round(sec * 1e9))} ns`;
  if (sec < 1e-3) return `${Math.round(sec * 1e6)} µs`;
  if (sec < 1) return `${Math.round(sec * 1e3)} ms`;
  if (sec < 120) return `${Math.round(sec)} s`;
  if (sec < 7200) return `${Math.round(sec / 60)} min`;
  if (sec < 2 * 86400) return `${Math.round(sec / 3600)} hours`;
  if (sec < YEAR) return `${Math.round(sec / 86400)} days`;
  const lgYears = lgSec - Math.log10(YEAR);
  if (lgYears < 6) return `${commas(String(Math.round(10 ** lgYears)))} years`;
  const { m, e } = sci(lgYears, 1);
  return `${m}e${e} years`;
}

export const speedOf = (settings: LabSettings) => (settings.speed === '1e6' ? 1e6 : 1e9);

// ----- Operations -----

/** The readout name for a curve's count. */
export const stepsVar = (f: Fn) => `${FN_LABEL[f]} steps`;

function vars(s: S, more: Record<string, Scalar> = {}): Record<string, Scalar> {
  const out: Record<string, Scalar> = { n: s.n, ...more };
  for (const f of s.shown) out[stepsVar(f)] = countText(count(f, s.n));
  return out;
}

const reject = (s: S, say: string): LabStep => ({
  state: s,
  marks: [],
  say,
  lines: [],
  vars: vars(s),
  level: 1,
});

const countLines = (s: S) => s.shown.map((f) => `count.${f}`);

/** Move n to `to`, then look at each curve's growth, one step per curve. */
function* changeN(s: S, to: number, line: string, what: string): Generator<LabStep, S, void> {
  const next: S = { ...s, n: to, prev: s.n };
  yield {
    state: next,
    marks: [mark('n-label', 'active')],
    say: `${what}: n goes from ${s.n} to ${to}.`,
    lines: [line],
    vars: vars(next, { 'previous n': s.n }),
    level: 2,
  };
  for (const f of s.shown) {
    const before = countText(count(f, s.n));
    const after = countText(count(f, to));
    yield {
      state: next,
      marks: [mark(`bar-${f}`, 'active'), mark(`bar-${f}-ratio`, 'active')],
      say: `${FN_LABEL[f]}: ${before} steps become ${after} (${ratioText(f, s.n, to)}).`,
      lines: [`count.${f}`],
      vars: vars(next, { 'previous n': s.n }),
      level: 3,
    };
  }
  const fastest = s.shown.at(-1);
  const summary = fastest
    ? `The fastest-growing curve shown, ${FN_LABEL[fastest]}, changed ${ratioText(fastest, s.n, to)}.`
    : 'No curves are shown. Use More operations to show some.';
  yield {
    state: next,
    marks: s.shown.map((f) => mark(`bar-${f}`, 'done')),
    say: `n = ${to}. ${summary}`,
    lines: countLines(s),
    vars: vars(next, { 'previous n': s.n }),
    level: 1,
  };
  return next;
}

const setn: Op = {
  label: 'Set n',
  arity: 1,
  *run(s, [raw]: Value[]) {
    const v = wholeArg(raw, 1, MAX_N);
    if (v === null) {
      yield reject(s, `Pick n from 1 to ${commas(String(MAX_N))}. Nothing changed.`);
      return s;
    }
    return yield* changeN(s, v, 'set.n', `Set n = ${v}`);
  },
};

const double: Op = {
  label: 'Double n',
  arity: 0,
  *run(s) {
    if (s.n * 2 > MAX_N) {
      yield reject(
        s,
        `2n would pass ${commas(String(MAX_N))}, the largest n here. Nothing changed.`,
      );
      return s;
    }
    return yield* changeN(s, s.n * 2, 'double.n', 'Double n');
  },
};

const halve: Op = {
  label: 'Halve n',
  arity: 0,
  *run(s) {
    if (s.n === 1) {
      yield reject(s, 'n is already 1, the smallest size here. Nothing changed.');
      return s;
    }
    return yield* changeN(s, Math.floor(s.n / 2), 'halve.n', 'Halve n');
  },
};

const inc: Op = {
  label: 'Add 1 to n',
  arity: 0,
  *run(s) {
    if (s.n >= MAX_N) {
      yield reject(
        s,
        `n is already ${commas(String(MAX_N))}, the largest n here. Nothing changed.`,
      );
      return s;
    }
    return yield* changeN(s, s.n + 1, 'inc.n', 'Add 1 to n');
  },
};

function toggle(f: Fn): Op {
  return {
    label: `Show or hide ${FN_LABEL[f]}`,
    arity: 0,
    *run(s) {
      const on = !s.shown.includes(f);
      const shown = FNS.filter((g) => (g === f ? on : s.shown.includes(g)));
      const next: S = { ...s, shown };
      const c = count(f, s.n);
      yield {
        state: next,
        marks: on ? [mark(`bar-${f}`, 'new')] : [],
        say: on
          ? `Show ${FN_LABEL[f]}: at n = ${s.n} it takes ${countText(c)} ${c.exact === 1n ? 'step' : 'steps'}.`
          : `Hide ${FN_LABEL[f]}.`,
        lines: on ? [`count.${f}`] : ['show.toggle'],
        vars: vars(next),
        level: 1,
      };
      return next;
    },
  };
}

export const ops: Record<string, Op> = {
  setn,
  double,
  halve,
  inc,
  ...Object.fromEntries(FNS.map((f) => [`show-${f}`, toggle(f)])),
};

export function pseudocode(): PseudoBlock[] {
  const counts = [
    L('count.1', 1, '1: return 1', 'Constant: one step, whatever n is.'),
    L('count.logn', 1, 'log n: while n > 1: n = n / 2', 'Logarithmic: halve n until it is 1.'),
    L('count.n', 1, 'n: for i = 1 to n', 'Linear: one step per item.'),
    L(
      'count.nlogn',
      1,
      'n log n: for i = 1 to n: halve n until 1',
      'Linearithmic: halve n once for every item.',
    ),
    L('count.n2', 1, 'n²: for i = 1 to n: for j = 1 to n', 'Quadratic: one step per pair.'),
    L(
      'count.2n',
      1,
      '2ⁿ: T(n) = 2 · T(n - 1), T(0) = 1',
      'Exponential: two calls, each one smaller.',
    ),
    L(
      'count.fact',
      1,
      'n!: T(n) = n · T(n - 1), T(0) = 1',
      'Factorial: n calls, each one smaller.',
    ),
  ];
  // One block for every operation: the page falls back to the first block, so the counting
  // loops stay in view whichever button was pressed.
  return [
    {
      op: 'growth lab',
      lines: [
        L('set.n', 0, 'n = v', 'Use input size v.'),
        L('double.n', 0, 'or n = 2 · n', 'Or double the input size.'),
        L('halve.n', 0, 'or n = ⌊n / 2⌋', 'Or halve it.'),
        L('inc.n', 0, 'or n = n + 1', 'Or grow it by one item.'),
        L('show.toggle', 0, 'show or hide a curve f', 'Add or remove a curve.'),
        L('count.sig', 0, 'for each curve shown, count steps:', 'Count the steps of each loop:'),
        ...counts,
      ],
    },
  ];
}

export function initialSay(state: S): string {
  return `n = ${state.n}. Each bar counts the steps of a loop that does that much work. Change n and watch which bars run away.`;
}

export function initialVars(state: S) {
  return vars(state);
}

export function describe(state: S, settings: LabSettings = defaults): string {
  if (state.shown.length === 0) return `n = ${state.n}. No curves shown.`;
  const speed = speedOf(settings);
  const parts = state.shown.map((f) => {
    const c = count(f, state.n);
    return `${FN_LABEL[f]}: ${countText(c)} ${c.exact === 1n ? 'step' : 'steps'}, ${timeText(c, speed)}`;
  });
  return `n = ${state.n}. ${parts.join('; ')}.`;
}
