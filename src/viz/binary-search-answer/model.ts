/**
 * Binary search on the answer: when the question is "the smallest x that works" (or the
 * largest), and whether x works is a yes/no check that only flips once as x grows, search over
 * the possible answers instead of over an array.
 *
 * Two problems, picked by a setting:
 *
 * - ship: packages w[0..n − 1] leave in order, a truck a day, and no day may carry more than
 *   the capacity c. What is the smallest c that ships everything in d days? fits(c) loads each
 *   day greedily; it is false for small c and true from the answer on. The answer lies between
 *   max(w) (the heaviest package must fit) and sum(w) (one day takes everything).
 * - spread: k items go on k of the positions p (sorted, all different). What is the largest
 *   smallest gap between two neighbouring items? spreads(g) puts an item on the first position
 *   and each next one on the first position at least g past the last; it is true for small g
 *   and false past the answer. The answer lies between 1 and p[n − 1] − p[0].
 *
 * The pattern halves the window of possible answers with each check: about log₂ of its width
 * in checks. The naive way tries every answer upward from the bottom until the check flips.
 * Both run the same check, so `reads` (the values a check looks at) count the same way.
 *
 * Work, in the units of src/viz/_patterns/kit.ts: a check is one run of fits or spreads; a
 * read is one value it looks at. A check stops early once its answer is known (more days than
 * d, or k items placed), so its reads vary.
 */
import type { Mark, MarkRole, OpSpec, PseudoBlock, PseudoLine, Scalar, Step, Value } from '../../engine/types';
import { approachOf, Work, workVars, type Approach, type Totals } from '../_patterns/kit';

export type Problem = 'ship' | 'spread';

export const MAX_N = 10;
export const MAX_WEIGHT = 20;
export const MAX_POSITION = 50;
/** The largest d or k the input box takes. */
export const MAX_PARAM = 12;

/** The packages, days and positions the page starts with. */
export const START_W = [4, 7, 2, 6, 3, 5, 1, 8];
export const START_D = 3;
export const START_P = [1, 3, 8, 12, 13, 19, 24];
export const START_K = 3;

export interface BASettings {
  [key: string]: Scalar;
  approach: Approach;
  problem: Problem;
}

export const defaults: BASettings = { approach: 'pattern', problem: 'ship' };

export interface BAState {
  /** Package weights, in the order they leave. */
  w: number[];
  /** Positions, sorted, all different. */
  p: number[];
}

/** One answer tried, and what its check said. */
export interface Try {
  x: number;
  ok: boolean;
}

/** A check in progress or just finished: what it has worked out for each value it read. */
export interface CheckView {
  x: number;
  /** Values read so far. */
  read: number;
  /** ship: the day each package goes on; spread: the item placed there (1-based), or 0. */
  tag: number[];
  /** ship: the day's load after the package; spread: the distance from the last item. */
  amount: number[];
  /** Done, with its verdict; undefined while it runs. */
  ok?: boolean;
  /** The value being read now (index), for the marks. */
  at?: number;
}

export interface BAExtra {
  problem: Problem;
  /** d (ship) or k (spread). */
  param: number;
  /** The possible answers, fixed for the operation. */
  lo0: number;
  hi0: number;
  /** The pattern's window of answers still possible; the naive way's next candidate in lo. */
  lo: number;
  hi: number;
  /** The answer being checked. */
  mid?: number;
  tried: Try[];
  /** How many answers the operation tries in all (the tried list's final length). */
  tries: number;
  check?: CheckView;
  answer?: number;
}

export type BAStep = Step<BAState, BAExtra>;
type Op = OpSpec<BAState, BASettings, BAExtra>;

export const init = (): BAState => ({ w: [...START_W], p: [...START_P] });

const mark = (id: string, role: MarkRole): Mark => ({ id, role });

// ----- Text -----

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "a", "a and b", "a, b and c". */
export const and = (xs: string[]) =>
  xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;

const sum = (xs: readonly number[]) => {
  let t = 0;
  for (const x of xs) t += x;
  return t;
};

/** What the answer is called: capacity or gap. */
export const what = (problem: Problem) => (problem === 'ship' ? 'capacity' : 'gap');

// ----- Input -----

const INT = /^\d+$/;

/** For the input box: one number (d or k), or a list of values to load. */
export function parseInput(token: string): Value | Error {
  const tokens = token.split(/[\s,;]+/).filter(Boolean);
  if (tokens.length === 0) return new Error('Type d or k, such as 3, or a list of values to load.');
  if (tokens.length === 1) {
    const t = tokens[0]!;
    if (!INT.test(t)) return new Error(`"${t}" is not a whole number.`);
    const v = Number(t);
    if (v < 1 || v > MAX_PARAM) return new Error(`${t} is out of range. Use 1 to ${MAX_PARAM}.`);
    return v;
  }
  for (const t of tokens) if (!INT.test(t)) return new Error(`"${t}" is not a whole number.`);
  return tokens.join(' ');
}

/** A list to load for this problem, or why it cannot be read. */
export function readList(arg: Value | undefined, problem: Problem): number[] | string {
  const tokens = String(arg ?? '')
    .split(/[\s,;]+/)
    .filter(Boolean);
  const kind = problem === 'ship' ? 'weights' : 'positions';
  if (tokens.length < 2) return `Type at least 2 ${kind}, such as ${problem === 'ship' ? '4 7 2 6' : '1 3 8 12'}.`;
  if (tokens.length > MAX_N) return `That is ${tokens.length} values. Use at most ${MAX_N}.`;
  const out: number[] = [];
  for (const t of tokens) {
    if (!INT.test(t)) return `"${t}" is not a whole number.`;
    const v = Number(t);
    if (problem === 'ship' && (v < 1 || v > MAX_WEIGHT))
      return `${t} is out of range. Weights go from 1 to ${MAX_WEIGHT}.`;
    if (problem === 'spread' && v > MAX_POSITION)
      return `${t} is out of range. Positions go from 0 to ${MAX_POSITION}.`;
    out.push(v);
  }
  if (problem === 'spread') {
    out.sort((a, b) => a - b);
    for (let i = 1; i < out.length; i++)
      if (out[i] === out[i - 1]) return `${out[i]} is there twice. Positions must all differ.`;
  }
  return out;
}

/** d or k for an operation, or why it cannot be used on this input. */
export function readParam(arg: Value | undefined, s: BAState, problem: Problem): number | string {
  const t = String(arg ?? '').trim();
  if (!INT.test(t)) return problem === 'ship' ? 'Type d, the number of days, such as 3.' : 'Type k, the number of items, such as 3.';
  const v = Number(t);
  if (v > MAX_PARAM) return `${v} is out of range. Use 1 to ${MAX_PARAM}.`;
  if (problem === 'ship') {
    if (v < 1) return 'd must be at least 1 day.';
    return v;
  }
  if (v < 2) return 'k must be at least 2: one item has no gap to measure.';
  if (v > s.p.length)
    return `k = ${v} items do not fit on ${plural(s.p.length, 'position')}. Use k from 2 to ${s.p.length}.`;
  return v;
}

// ----- The checks, as plain functions (the answers and the work, worked out first) -----

/** One step of a check: the value read, and what it decided. */
export interface Read {
  i: number;
  /** ship: the day it goes on; spread: the item placed (0 for none). */
  tag: number;
  /** ship: the load after it; spread: the distance from the last item. */
  amount: number;
  /** ship: it opened a new day; spread: an item went there. */
  event: boolean;
}

export interface CheckRun {
  ok: boolean;
  reads: Read[];
  /** ship: days used (d + 1 when it gave up); spread: items placed. */
  count: number;
}

/** Can capacity c ship w in d days? Greedy: fill each day until the next package does not fit. */
export function fits(w: readonly number[], d: number, c: number): CheckRun {
  let days = 1;
  let load = 0;
  const reads: Read[] = [];
  for (let i = 0; i < w.length; i++) {
    const x = w[i]!;
    let event = false;
    if (load + x > c) {
      days++;
      load = 0;
      event = true;
      if (days > d) {
        reads.push({ i, tag: days, amount: x, event });
        return { ok: false, reads, count: days };
      }
    }
    load += x;
    reads.push({ i, tag: days, amount: load, event });
  }
  return { ok: true, reads, count: days };
}

/** Can k items sit on p (sorted) with every gap at least g? Greedy: the first spot that is far enough. */
export function spreads(p: readonly number[], k: number, g: number): CheckRun {
  let count = 1;
  let last = p[0]!;
  const reads: Read[] = [{ i: 0, tag: 1, amount: 0, event: true }];
  if (count >= k) return { ok: true, reads, count };
  for (let i = 1; i < p.length; i++) {
    const gap = p[i]! - last;
    if (gap >= g) {
      count++;
      last = p[i]!;
      reads.push({ i, tag: count, amount: gap, event: true });
      if (count === k) return { ok: true, reads, count };
    } else reads.push({ i, tag: 0, amount: gap, event: false });
  }
  return { ok: false, reads, count };
}

export function range(s: BAState, problem: Problem): { lo0: number; hi0: number } {
  if (problem === 'ship') return { lo0: Math.max(...s.w), hi0: sum(s.w) };
  return { lo0: 1, hi0: s.p[s.p.length - 1]! - s.p[0]! };
}

export const runCheck = (s: BAState, problem: Problem, param: number, x: number) =>
  problem === 'ship' ? fits(s.w, param, x) : spreads(s.p, param, x);

/** The answers an approach tries, in order, with their checks, and the answer. */
export function plan(
  s: BAState,
  problem: Problem,
  param: number,
  approach: Approach,
): { tries: { x: number; run: CheckRun; lo: number; hi: number }[]; answer: number } {
  const { lo0, hi0 } = range(s, problem);
  const tries: { x: number; run: CheckRun; lo: number; hi: number }[] = [];
  if (approach === 'pattern') {
    let lo = lo0;
    let hi = hi0;
    while (lo < hi) {
      const mid = problem === 'ship' ? Math.floor((lo + hi) / 2) : Math.floor((lo + hi + 1) / 2);
      const run = runCheck(s, problem, param, mid);
      tries.push({ x: mid, run, lo, hi });
      if (problem === 'ship') {
        if (run.ok) hi = mid;
        else lo = mid + 1;
      } else if (run.ok) lo = mid;
      else hi = mid - 1;
    }
    return { tries, answer: lo };
  }
  if (problem === 'ship') {
    for (let c = lo0; ; c++) {
      const run = runCheck(s, problem, param, c);
      tries.push({ x: c, run, lo: c, hi: hi0 });
      if (run.ok) return { tries, answer: c };
    }
  }
  // spread: 1 always works (the positions differ), so start at 2.
  for (let g = 2; g <= hi0; g++) {
    const run = runCheck(s, problem, param, g);
    tries.push({ x: g, run, lo: g, hi: hi0 });
    if (!run.ok) return { tries, answer: g - 1 };
  }
  return { tries, answer: hi0 };
}

/** The work an approach does: checks, and the values those checks read. */
export function cost(s: BAState, problem: Problem, param: number, approach: Approach) {
  const { tries } = plan(s, problem, param, approach);
  let reads = 0;
  for (const t of tries) reads += t.run.reads.length;
  return { checks: tries.length, reads };
}

export function totals(s: BAState, problem: Problem, param: number): Totals {
  const n = cost(s, problem, param, 'naive');
  const p = cost(s, problem, param, 'pattern');
  return { naive: n.checks + n.reads, pattern: p.checks + p.reads };
}

/** The smallest capacity or the largest gap, by trying every answer (the reference). */
export function answerOf(s: BAState, problem: Problem, param: number): number {
  return plan(s, problem, param, 'naive').answer;
}

// ----- Steps -----

function refuse(s: BAState, why: string, problem: Problem): BAStep {
  return {
    state: s,
    marks: [mark(problem === 'ship' ? 'w-name' : 'p-name', 'error')],
    say: `Nothing to do. ${why}`,
    lines: [],
    level: 1,
    vars: { n: problem === 'ship' ? s.w.length : s.p.length },
  };
}

const load: Op = {
  label: 'Load',
  arity: 1,
  *run(s, [arg], { settings }) {
    const problem = settings.problem;
    const vs = readList(arg, problem);
    if (typeof vs === 'string') {
      yield refuse(s, `${vs} The values stay as they were.`, problem);
      return s;
    }
    const next: BAState = problem === 'ship' ? { ...s, w: vs } : { ...s, p: vs };
    yield {
      state: next,
      marks: [],
      say:
        problem === 'ship'
          ? `Loaded ${plural(vs.length, 'package')}: ${vs.join(', ')}. Type d, the number of days, and press Search.`
          : `Loaded ${plural(vs.length, 'position')}, sorted: ${vs.join(', ')}. Type k, the number of items, and press Search.`,
      lines: [],
      level: 1,
      vars: { n: vs.length },
    };
    return next;
  },
};

/** "w[2] = 6" or "p[2] = 8". */
const at = (problem: Problem, s: BAState, i: number) =>
  problem === 'ship' ? `w[${i}] = ${s.w[i]}` : `p[${i}] = ${s.p[i]}`;

/** Narration for one value a check reads. */
function readSay(problem: Problem, s: BAState, x: number, r: Read, prev: CheckRun['reads'], param: number): string {
  if (problem === 'ship') {
    const w = s.w[r.i]!;
    if (!r.event) return `${at(problem, s, r.i)} goes on day ${r.tag}: load ${r.amount} of ${x}.`;
    const before = prev.length ? prev[prev.length - 1]!.amount : 0;
    const over = `${before} + ${w} = ${before + w} > ${x}`;
    if (r.tag > param)
      return `${at(problem, s, r.i)} does not fit on day ${r.tag - 1} (${over}). Day ${r.tag} is one more than d = ${param}: give up.`;
    return `${at(problem, s, r.i)} does not fit on day ${r.tag - 1} (${over}): start day ${r.tag} with it.`;
  }
  if (r.i === 0) return `Item 1 goes on the first position, ${at(problem, s, 0)}.`;
  const p = s.p[r.i]!;
  const last = p - r.amount;
  if (r.event)
    return `${at(problem, s, r.i)} is ${p} − ${last} = ${r.amount} ≥ ${x} past the last item: item ${r.tag} goes there.${r.tag === param ? ` That is all ${param} items.` : ''}`;
  return `${at(problem, s, r.i)} is only ${p} − ${last} = ${r.amount} < ${x} past the last item: skip it.`;
}

function* solve(
  s: BAState,
  param: number,
  settings: BASettings,
): Generator<BAStep, BAState, void> {
  const problem = settings.problem;
  const approach = approachOf(settings);
  const naive = approach === 'naive';
  const ship = problem === 'ship';
  const { lo0, hi0 } = range(s, problem);
  const { tries, answer } = plan(s, problem, param, approach);
  const tot = totals(s, problem, param);
  const work = new Work(['checks', 'reads']);
  const tried: Try[] = [];
  let lo = lo0;
  let hi = hi0;
  let mid: number | undefined;
  let check: CheckView | undefined;
  const name = what(problem);
  const extra = (): BAExtra => ({
    problem,
    param,
    lo0,
    hi0,
    lo,
    hi,
    ...(mid === undefined ? {} : { mid }),
    tried: [...tried],
    tries: tries.length,
    ...(check ? { check: { ...check, tag: [...check.tag], amount: [...check.amount] } } : {}),
  });
  const P = ship ? 'd' : 'k';
  const vars = (more: Record<string, Scalar> = {}): Record<string, Scalar> => ({
    [P]: param,
    ...(naive ? { [ship ? 'c' : 'g']: mid ?? null } : { lo, hi, mid: mid ?? null }),
    ...more,
    ...workVars(work, tot),
  });
  const n = ship ? s.w.length : s.p.length;
  const C = ship ? 'c' : 'g';

  yield {
    state: s,
    marks: [mark('ax-open', 'active')],
    say: ship
      ? naive
        ? `Find the smallest capacity that ships these ${n} packages in d = ${param} days by trying every capacity upward. Start at ${lo0}, the heaviest package: any less and it never fits.`
        : `Find the smallest capacity that ships these ${n} packages in d = ${param} days. It is at least ${lo0} (the heaviest package must fit) and at most ${hi0} (one day takes everything). A capacity that works keeps working when it grows, so binary search the ${plural(hi0 - lo0 + 1, 'capacity', 'capacities')} from ${lo0} to ${hi0}.`
      : naive
        ? `Find the largest gap that k = ${param} items can keep on these ${n} positions by trying every gap upward. A gap of 1 always works, since the positions differ, so start at 2.`
        : `Find the largest gap that k = ${param} items can keep on these ${n} positions. It is at least 1 (the positions differ) and at most ${hi0}, the whole span. A gap that works keeps working when it shrinks, so binary search the gaps from 1 to ${hi0}.`,
    lines: ['init'],
    level: 2,
    vars: vars(),
    extra: extra(),
  };

  for (const t of tries) {
    mid = t.x;
    check = { x: t.x, read: 0, tag: Array(n).fill(0), amount: Array(n).fill(0) };
    work.add('checks');
    yield {
      state: s,
      marks: [mark('ax-mid', 'active')],
      say: naive
        ? `Try ${C} = ${t.x}: ${ship ? `can capacity ${t.x} ship everything in ${param} days?` : `can ${param} items keep gaps of at least ${t.x}?`}`
        : `${lo} to ${hi} is left: mid = (${lo} + ${hi}${ship ? '' : ' + 1'}) / 2 = ${t.x}, rounded down. Check: ${ship ? `can capacity ${t.x} ship everything in ${param} days?` : `can ${param} items keep gaps of at least ${t.x}?`}`,
      lines: naive ? ['loop'] : ['loop', 'mid'],
      level: 2,
      vars: vars(),
      extra: extra(),
    };
    const seen: Read[] = [];
    for (const r of t.run.reads) {
      work.add('reads');
      check.read++;
      check.tag[r.i] = r.tag;
      check.amount[r.i] = r.amount;
      check.at = r.i;
      const say = readSay(problem, s, t.x, r, seen, param);
      seen.push(r);
      const lines = ship
        ? r.event
          ? r.tag > param
            ? ['cloop', 'cover', 'cnext', 'cfail']
            : ['cloop', 'cover', 'cnext', 'cadd']
          : ['cloop', 'cadd']
        : r.i === 0
          ? ['cfirst']
          : r.event
            ? r.tag === param
              ? ['cloop', 'cfar', 'cplace', 'cdone']
              : ['cloop', 'cfar', 'cplace']
            : ['cloop', 'cfar'];
      yield {
        state: s,
        marks: [
          mark(`${ship ? 'w' : 'p'}-${r.i}`, 'active'),
          mark(`t-${r.i}`, r.event ? 'new' : 'active'),
        ],
        say,
        lines,
        level: 3,
        vars: vars({ [ship ? 'days' : 'items']: ship ? r.tag : Math.max(...check.tag) }),
        extra: extra(),
      };
    }
    delete check.at;
    check.ok = t.run.ok;
    tried.push({ x: t.x, ok: t.run.ok });
    const used = t.run.count;
    const result = ship
      ? t.run.ok
        ? `Capacity ${t.x} needs ${plural(used, 'day')}, within ${param}: it fits.`
        : `Capacity ${t.x} needs more than ${param} days: too small.`
      : t.run.ok
        ? `All ${param} items fit with gaps of at least ${t.x}.`
        : `Only ${plural(used, 'item')} fit with gaps of at least ${t.x}: too wide.`;
    let say: string;
    let lines: string[];
    if (naive) {
      if (ship) {
        say = t.run.ok
          ? `${result} It is the first capacity that does, so it is the answer.`
          : `${result} Try the next one up.`;
        lines = t.run.ok ? ['cok', 'ret'] : ['next'];
        if (t.run.ok) hi = lo = t.x;
        else lo = t.x + 1;
      } else {
        const top = t.run.ok && t.x === hi0;
        say = t.run.ok
          ? top
            ? `${result} No gap is wider than the span, ${hi0}, so that is the answer.`
            : `${result} Try the next gap up.`
          : `${result} So the answer is the last gap that worked, ${t.x - 1}.`;
        lines = t.run.ok ? (top ? ['ret'] : ['next']) : ['cno', 'ret'];
        if (t.run.ok) lo = t.x;
        else hi = t.x - 1;
      }
    } else if (ship) {
      if (t.run.ok) {
        say = `${result} So does every capacity above it, and the answer is ${t.x} or less: hi = ${t.x}.`;
        hi = t.x;
        lines = ['cok', 'fit'];
      } else {
        say = `${result} So is every capacity below it, and the answer is more: lo = ${t.x} + 1 = ${t.x + 1}.`;
        lo = t.x + 1;
        lines = ['fail'];
      }
    } else if (t.run.ok) {
      say = `${result} So does every smaller gap, and the answer is ${t.x} or more: lo = ${t.x}.`;
      lo = t.x;
      lines = ['cdone', 'fit'];
    } else {
      say = `${result} So is every wider gap, and the answer is less: hi = ${t.x} − 1 = ${t.x - 1}.`;
      hi = t.x - 1;
      lines = ['cno', 'fail'];
    }
    yield {
      state: s,
      marks: [mark(`try-${tried.length - 1}`, t.run.ok ? 'new' : 'remove'), mark('ax-mid', 'active')],
      say,
      lines,
      level: 2,
      vars: vars({ [ship ? 'days' : 'items']: used }),
      extra: extra(),
    };
  }

  // The window is down to one answer: lo = hi.
  lo = answer;
  hi = answer;
  const other = cost(s, problem, param, naive ? 'pattern' : 'naive');
  const mine = cost(s, problem, param, approach);
  const best = ship
    ? `The smallest capacity that ships in ${param} days is ${answer}.`
    : `The largest gap ${param} items can keep is ${answer}.`;
  const how = naive
    ? `Trying every ${name} upward took ${work.tally()}; binary search takes ${plural(other.checks, 'check')} and ${plural(other.reads, 'read')}.`
    : `${tries.length === 0 ? `Only one ${name} was possible, so no check was needed. ` : ''}Binary search took ${work.tally()}; trying every ${name} upward takes ${plural(other.checks, 'check')} and ${plural(other.reads, 'read')}.`;
  const lead = naive ? '' : tries.length ? `lo = hi = ${answer}: one ${name} is left. ` : '';
  const verdict = naive
    ? ''
    : other.checks + other.reads < mine.checks + mine.reads
      ? ' Here the naive way is cheaper: the answer sits near the bottom of the range.'
      : '';
  // The last picture shows the answer's own check: how the trucks are loaded, or where the
  // items go.
  mid = undefined;
  const final = runCheck(s, problem, param, answer);
  check = { x: answer, read: final.reads.length, tag: Array(n).fill(0), amount: Array(n).fill(0), ok: final.ok };
  for (const r of final.reads) {
    check.tag[r.i] = r.tag;
    check.amount[r.i] = r.amount;
  }
  yield {
    state: s,
    marks: [mark('ax-open', 'found'), mark('answer', 'found')],
    say: `${lead}${best} ${how}${verdict}`,
    lines: ['ret'],
    level: 1,
    vars: vars({ answer }),
    extra: { ...extra(), answer },
  };
  return s;
}

const search: Op = {
  label: 'Search',
  arity: 1,
  *run(s, [arg], { settings }) {
    const problem = settings.problem;
    const param = readParam(arg, s, problem);
    if (typeof param === 'string') {
      yield refuse(s, param, problem);
      return s;
    }
    return yield* solve(s, param, settings);
  },
};

export const ops: Record<string, Op> = { search, load };

// ----- Pseudocode -----

const L = (id: string, indent: number, text: string, plain: string): PseudoLine => ({
  id,
  indent,
  text,
  plain,
});

function fitsLines(): PseudoLine[] {
  return [
    L('csig', 0, 'fits(w, d, c)', 'To check whether capacity c ships w in d days:'),
    L('cinit', 1, 'days = 1; load = 0', 'Start day 1 with nothing on it.'),
    L('cloop', 1, 'for each x in w', 'Take the packages in order:'),
    L('cover', 2, 'if load + x > c', 'if x does not fit on today’s truck,'),
    L('cnext', 3, 'days = days + 1; load = 0', 'start a new day,'),
    L('cfail', 3, 'if days > d: return false', 'and give up once that is more days than d;'),
    L('cadd', 2, 'load = load + x', 'put x on today’s truck.'),
    L('cok', 1, 'return true', 'Everything left within d days.'),
  ];
}

function spreadsLines(): PseudoLine[] {
  return [
    L('csig', 0, 'spreads(p, k, g)', 'To check whether k items fit on p with gaps of at least g:'),
    L('cfirst', 1, 'count = 1; last = p[0]', 'Put the first item on the first position.'),
    L('cloop', 1, 'for each x in p after p[0]', 'Go through the other positions in order:'),
    L('cfar', 2, 'if x − last >= g', 'if x is at least g past the last item,'),
    L('cplace', 3, 'count = count + 1; last = x', 'put the next item there,'),
    L('cdone', 3, 'if count == k: return true', 'and stop once all k are placed.'),
    L('cno', 1, 'return false', 'The positions ran out first.'),
  ];
}

export function pseudocode(settings: BASettings): PseudoBlock[] {
  const naive = approachOf(settings) === 'naive';
  const loadBlock: PseudoBlock = {
    op: 'load',
    lines: [
      L(
        'load',
        0,
        settings.problem === 'ship' ? 'w = the weights' : 'p = the positions, sorted',
        settings.problem === 'ship'
          ? 'Remember the packages, in the order they leave.'
          : 'Remember the positions, smallest first.',
      ),
    ],
  };
  if (settings.problem === 'ship') {
    const main = naive
      ? [
          L('sig', 0, 'smallestCapacity(w, d)   // every capacity upward', 'To find the smallest capacity that ships w in d days, try them all:'),
          L('init', 1, 'c = max(w)', 'Start at the heaviest package: less never fits.'),
          L('loop', 1, 'while not fits(w, d, c)', 'While capacity c needs more than d days,'),
          L('next', 2, 'c = c + 1', 'try one more.'),
          L('ret', 1, 'return c', 'The first capacity that fits is the answer.'),
        ]
      : [
          L('sig', 0, 'smallestCapacity(w, d)', 'To find the smallest capacity that ships w in d days:'),
          L('init', 1, 'lo = max(w); hi = sum(w)', 'The heaviest package must fit; one day for everything always works.'),
          L('loop', 1, 'while lo < hi', 'While more than one capacity is left,'),
          L('mid', 2, 'mid = (lo + hi) / 2   // rounded down', 'take the one in the middle;'),
          L('fit', 2, 'if fits(w, d, mid): hi = mid', 'if it ships in time, the answer is mid or less;'),
          L('fail', 2, 'else: lo = mid + 1', 'if not, the answer is more than mid.'),
          L('ret', 1, 'return lo', 'One capacity is left: the answer.'),
        ];
    return [{ op: 'search', lines: [...main, ...fitsLines()] }, loadBlock];
  }
  const main = naive
    ? [
        L('sig', 0, 'largestGap(p, k)   // every gap upward', 'To find the largest gap k items can keep on p, try them all:'),
        L('init', 1, 'g = 2   // a gap of 1 always works', 'Start at 2: the positions differ, so 1 always works.'),
        L('loop', 1, 'while g <= p[n − 1] − p[0] and spreads(p, k, g)', 'While gap g still works,'),
        L('next', 2, 'g = g + 1', 'try one more.'),
        L('ret', 1, 'return g − 1', 'The last gap that worked is the answer.'),
      ]
    : [
        L('sig', 0, 'largestGap(p, k)', 'To find the largest gap k items can keep on p:'),
        L('init', 1, 'lo = 1; hi = p[n − 1] − p[0]', 'A gap of 1 always works; no gap is wider than the whole span.'),
        L('loop', 1, 'while lo < hi', 'While more than one gap is left,'),
        L('mid', 2, 'mid = (lo + hi + 1) / 2   // rounded down', 'take the one in the middle, rounding up;'),
        L('fit', 2, 'if spreads(p, k, mid): lo = mid', 'if it works, the answer is mid or more;'),
        L('fail', 2, 'else: hi = mid − 1', 'if not, the answer is less than mid.'),
        L('ret', 1, 'return lo', 'One gap is left: the answer.'),
      ];
  return [{ op: 'search', lines: [...main, ...spreadsLines()] }, loadBlock];
}

// ----- Start -----

export function describe(s: BAState, settings: BASettings): string {
  return settings.problem === 'ship'
    ? `${plural(s.w.length, 'package')} to ship, in order: ${s.w.join(', ')}.`
    : `${plural(s.p.length, 'position')}: ${s.p.join(', ')}.`;
}

export function initialSay(s: BAState, settings: BASettings): string {
  return settings.problem === 'ship'
    ? `${plural(s.w.length, 'package')} leave in this order, a truck a day. Type d, the number of days, such as ${START_D}, and press Search to find the smallest truck that ships them all in time.`
    : `${plural(s.p.length, 'position')} along a line. Type k, the number of items, such as ${START_K}, and press Search to spread them as far apart as possible.`;
}

export const initialVars = (s: BAState, settings: BASettings) => ({
  n: settings.problem === 'ship' ? s.w.length : s.p.length,
});
