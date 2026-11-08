import type { MarkRole, OpSpec, PseudoBlock, Scalar, Step } from '../../engine/types';
import { L, mark, wholeArg } from '../_recursion/kit';

/** square: cross out from p² (each smaller multiple has a smaller factor). double: from 2p. */
export type Start = 'square' | 'double';
/** sqrt: stop once p² > n. all: try every p up to n. */
export type Stop = 'sqrt' | 'all';

export interface SieveSettings {
  [key: string]: Scalar;
  start: Start;
  stop: Stop;
}

export const defaults: SieveSettings = { start: 'square', stop: 'sqrt' };

export const MIN_N = 2;
export const MAX_N = 120;

export type Status = 'open' | 'prime' | 'crossed';

export interface SieveState {
  /** 0 before the first run. */
  n: number;
  /** Status of each number 0..n (0 and 1 stay 'open' and are never primes). */
  status: Status[];
  /** The prime that crossed each number out first. */
  by: (number | null)[];
  /** The prime whose multiples are being crossed out, and the multiple at hand. */
  p: number | null;
  at: number | null;
  /** Cross-outs, a number crossed out twice counted twice. */
  marks: number;
  done: boolean;
}

type S = SieveState;
type SieveStep = Step<S, undefined>;
type Op = OpSpec<S, SieveSettings, undefined>;

export function init(): S {
  return { n: 0, status: [], by: [], p: null, at: null, marks: 0, done: false };
}

export const cellId = (k: number) => `n-${k}`;

export const firstMultiple = (p: number, start: Start) => (start === 'square' ? p * p : 2 * p);

/** The primes up to n, by trial division, for checking. */
export function primesUpTo(n: number): number[] {
  const out: number[] = [];
  for (let k = 2; k <= n; k++) {
    let prime = true;
    for (let d = 2; d * d <= k; d++) if (k % d === 0) prime = false;
    if (prime) out.push(k);
  }
  return out;
}

const list = (xs: number[]) =>
  xs.length > 5 ? `${xs.slice(0, 4).join(', ')}, …, ${xs.at(-1)}` : xs.join(', ');

function* sieve(n: number, st: SieveSettings): Generator<SieveStep, S, void> {
  const s: S = {
    n,
    status: Array.from({ length: n + 1 }, () => 'open' as Status),
    by: Array.from({ length: n + 1 }, () => null),
    p: null,
    at: null,
    marks: 0,
    done: false,
  };
  const snap = (): S => ({ ...s, status: [...s.status], by: [...s.by] });
  const count = (x: Status) => s.status.filter((v, k) => k >= 2 && v === x).length;
  const vars = (more: Record<string, Scalar> = {}): Record<string, Scalar> => ({
    p: s.p,
    marks: s.marks,
    crossed: count('crossed'),
    primes: count('prime'),
    '√n': Math.round(Math.sqrt(n) * 100) / 100,
    ...more,
  });
  const step = (
    say: string,
    lines: string[],
    level: 1 | 2 | 3,
    ms: [string, MarkRole][] = [],
  ): SieveStep => ({
    state: snap(),
    marks: ms.map(([id, role]) => mark(id, role)),
    say,
    lines,
    vars: vars(),
    level,
  });

  yield step(
    `Write the numbers 2 to ${n}. None is crossed out yet. ${st.stop === 'sqrt' ? `√${n} ≈ ${Math.sqrt(n).toFixed(1)}, so only primes up to ${Math.floor(Math.sqrt(n))} will cross anything out.` : 'This version tries every p up to n.'}`,
    ['init'],
    2,
  );

  let p = 2;
  for (; st.stop === 'sqrt' ? p * p <= n : p <= n; p++) {
    s.p = p;
    s.at = null;
    if (s.status[p] === 'crossed') {
      yield step(`${p} is crossed out (a multiple of ${s.by[p]}), so skip it.`, ['loop', 'if'], 3, [
        [cellId(p), 'compare'],
      ]);
      continue;
    }
    s.status[p] = 'prime';
    const from = firstMultiple(p, st.start);
    if (from > n) {
      yield step(
        `${p} is not crossed out, so it is prime. Its first multiple to cross out, ${from}, is past ${n}: nothing to do.`,
        ['loop', 'if', 'prime', 'cross'],
        2,
        [[cellId(p), 'found']],
      );
      continue;
    }
    const smaller =
      p === 2
        ? ''
        : p === 3
          ? ': the smaller one, 3·2, has a smaller prime factor and is crossed out already'
          : `: the smaller ones, ${p}·2 to ${p}·${p - 1}, have a smaller prime factor and are crossed out already`;
    yield step(
      `${p} is not crossed out, so it is prime. Cross out its multiples, starting at ${st.start === 'square' ? `${p}² = ${from}${smaller}` : `2·${p} = ${from}`}.`,
      ['loop', 'if', 'prime'],
      2,
      [[cellId(p), 'found']],
    );
    const crossed: number[] = [];
    for (let j = from; j <= n; j += p) {
      s.at = j;
      s.marks++;
      const again = s.status[j] === 'crossed';
      if (!again) {
        s.status[j] = 'crossed';
        s.by[j] = p;
        crossed.push(j);
      }
      yield step(
        again
          ? `${j} = ${p}·${j / p} is already crossed out (by ${s.by[j]}). Crossing it again is wasted work.`
          : `Cross out ${j} = ${p}·${j / p}.`,
        ['cross', 'mark'],
        3,
        [
          [cellId(p), 'active'],
          [cellId(j), again ? 'compare' : 'remove'],
        ],
      );
    }
    s.at = null;
    yield step(
      crossed.length
        ? `Done with ${p}: crossed out ${list(crossed)} (${crossed.length} new).`
        : `Done with ${p}: every multiple was already crossed out.`,
      ['cross'],
      2,
      [[cellId(p), 'found']],
    );
  }

  s.p = null;
  s.at = null;
  if (st.stop === 'sqrt') {
    const left: number[] = [];
    for (let k = 2; k <= n; k++)
      if (s.status[k] === 'open') {
        s.status[k] = 'prime';
        left.push(k);
      }
    yield step(
      `Next is p = ${p}, and ${p}² = ${p * p} > ${n}. A composite number up to ${n} has a factor no bigger than √${n}, so it is crossed out already: ${left.length ? `the ${left.length} numbers left (${list(left)}) are prime` : 'nothing is left'}.`,
      ['loop', 'rest'],
      2,
      left.map((k) => [cellId(k), 'found'] as [string, MarkRole]),
    );
  }
  s.done = true;
  const primes = count('prime');
  const wasted = s.marks - count('crossed');
  yield step(
    `There ${primes === 1 ? 'is 1 prime' : `are ${primes} primes`} up to ${n}. The sieve made ${s.marks} cross-outs for ${count('crossed')} composite numbers${wasted ? `: ${wasted} of them hit a number that was already crossed out` : ''}.`,
    [],
    1,
  );
  return snap();
}

const sieveOp: Op = {
  label: 'Sieve up to n',
  arity: 1,
  *run(s, [raw], { settings }) {
    const n = wholeArg(raw, MIN_N, MAX_N);
    if (n === null) {
      yield {
        state: s,
        marks: [],
        say: `The sieve needs a whole number n from ${MIN_N} to ${MAX_N}. Nothing was run.`,
        lines: [],
        vars: { marks: 0 },
        level: 1,
      };
      return s;
    }
    return yield* sieve(n, settings);
  },
};

export const ops = { sieve: sieveOp };

export function pseudocode(st: SieveSettings): PseudoBlock[] {
  const sq = st.stop === 'sqrt';
  const lines = [
    L('init', 0, 'mark every k in 2..n as not crossed out', 'Write down the numbers from 2 to n.'),
    L(
      'loop',
      0,
      sq ? 'for p = 2 while p·p ≤ n' : 'for p = 2 to n',
      sq ? 'For each p whose square is at most n:' : 'For each p from 2 to n:',
    ),
    L('if', 1, 'if p is not crossed out', 'if nobody crossed p out,'),
    L('prime', 2, 'p is prime', 'p is prime;'),
    L(
      'cross',
      2,
      st.start === 'square' ? 'for j = p·p to n step p' : 'for j = 2p to n step p',
      st.start === 'square'
        ? 'go through its multiples from p squared,'
        : 'go through its multiples from 2p,',
    ),
    L('mark', 3, 'cross out j', 'crossing each one out.'),
  ];
  if (sq)
    lines.push(L('rest', 0, 'every k not crossed out is prime', 'Whatever is left is prime.'));
  return [{ op: 'sieve', lines }];
}

export function initialSay(): string {
  return 'Type n (up to 120) and press Sieve. Every prime crosses out its multiples; whatever survives is prime.';
}

export function initialVars(): Record<string, Scalar> {
  return { marks: 0 };
}

export function describe(s: S): string {
  if (!s.n) return 'No sieve run yet.';
  const primes = s.status.flatMap((v, k) => (v === 'prime' ? [k] : []));
  const head = `Sieve of 2 to ${s.n}`;
  if (!s.done)
    return `${head}, in progress${s.p ? ` at p = ${s.p}` : ''}. Primes so far: ${primes.join(', ') || 'none'}.`;
  return `${head}: ${primes.length} primes, ${primes.join(', ')}. ${s.marks} cross-outs.`;
}
