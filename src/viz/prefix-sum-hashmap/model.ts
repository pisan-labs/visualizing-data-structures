/**
 * Prefix sums with a hash map: count the subarrays of A whose sum is k, or find the longest one.
 *
 * - The pattern keeps a running sum and a map from each running sum to how often it has been
 *   seen (or, for the longest, where it was first seen). A subarray A[i..j − 1] sums to k exactly
 *   when P[j] − P[i] = k, where P[j] = A[0] + … + A[j − 1] is the running sum after j values. So
 *   at each j, the earlier running sums equal to P[j] − k are the starts of the subarrays that end
 *   here: one map lookup. One pass, O(n), and negative values are fine.
 * - The naive approach tries every pair of ends: for each start i, extend the end j and keep the
 *   sum of A[i..j], n(n + 1)/2 sums in all.
 *
 * The running sums sit on the fences between cells, as on /range-queries/: P[j] is drawn where
 * A[0..j − 1] ends. The map stores fences: seen[s] counts the fences whose running sum is s,
 * first[s] is the first such fence, which is also where a subarray starting after it begins.
 *
 * Work, in the units of src/viz/_patterns/kit.ts: a sum is one addition; a lookup is one hash map
 * read or write. The pattern does n sums and 2n lookups; every pair of ends does n(n + 1)/2 sums.
 */
import type {
  Mark,
  MarkRole,
  OpSpec,
  PseudoBlock,
  PseudoLine,
  Scalar,
  Step,
  Value,
} from '../../engine/types';
import { approachOf, Work, workVars, type Approach, type Totals } from '../_patterns/kit';

export const MAX_N = 12;
export const MIN_VALUE = -99;
export const MAX_VALUE = 99;
/** The largest |k|: twelve values of 99 sum to 1188, so this reaches past most sums. */
export const MAX_K = 999;

/** The array the page starts with, and a k that makes it interesting. */
export const START = [2, 3, -1, 2, -4, 1, 2, -1];
export const START_K = 3;

export type Goal = 'count' | 'longest';

export interface PSSettings {
  [key: string]: Scalar;
  approach: Approach;
  goal: Goal;
}

export const defaults: PSSettings = { approach: 'pattern', goal: 'count' };

export interface PSState {
  a: number[];
}

/** A subarray A[lo..hi], both ends included. */
export interface Span {
  lo: number;
  hi: number;
}

/** A bracket over A: a subarray in one lane above the array (lane 0 is nearest to A). */
export interface Bracket extends Span {
  lane: number;
  role: MarkRole;
  label?: string;
}

export interface PSExtra {
  k: number;
  /** The pattern: the running sum after j values, by fence j = 0..n; null until reached. */
  sums?: (number | null)[];
  /** The pattern: the map, in the order its keys first appeared. */
  map?: { key: number; value: number }[];
  /** Every pair of ends: tri[i][j] is the sum of A[i..j] once computed (j ≥ i). */
  tri?: (number | null)[][];
  brackets: Bracket[];
  /** The subarrays found so far, in the order found. */
  found: Span[];
  /** The longest: the best subarray so far. */
  best?: Span;
  /**
   * Fixed for the whole operation, so the drawing keeps its frame: whether each bracket lane
   * has a label, and every subarray the operation will find (the found list's final length).
   */
  frame: { lanes: boolean[]; all: Span[] };
}

export type PSStep = Step<PSState, PSExtra>;
type Op = OpSpec<PSState, PSSettings, PSExtra>;

export const init = (): PSState => ({ a: [...START] });

const mark = (id: string, role: MarkRole): Mark => ({ id, role });

// ----- Text -----

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "A[2..4]", or "A[2]" for one value. */
export const span = (s: Span): string => (s.lo === s.hi ? `A[${s.lo}]` : `A[${s.lo}..${s.hi}]`);

/** "a", "a and b", "a, b and c". */
const and = (xs: string[]) =>
  xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;

/** At most four subarrays by name, then how many more. */
export function spans(xs: Span[], most = 4): string {
  if (xs.length <= most) return and(xs.map(span));
  return `${xs
    .slice(0, most - 1)
    .map(span)
    .join(', ')} and ${xs.length - most + 1} more`;
}

/** "5 + 3", "5 − 1" for a negative right side. */
const plus = (a: number, b: number) => (b < 0 ? `${fmt(a)} − ${-b}` : `${fmt(a)} + ${b}`);
/** "5 − 3", "5 − (−3)" for a negative right side. */
const minus = (a: number, b: number) => `${fmt(a)} − ${b < 0 ? `(${fmt(b)})` : b}`;

/** A number for narration, with a true minus sign: "−3". */
export const fmt = (v: number) => (v < 0 ? `−${-v}` : String(v));

/** When a subarray sums to k, in terms of the running sums at its two ends. */
const when = (k: number) =>
  `A subarray sums to ${fmt(k)} when the running sum at its end is ${
    k > 0 ? `${k} more than` : k < 0 ? `${-k} less than` : 'the same as'
  } at its start.`;

/** Where a fence is, in words: "at the start" for fence 0. */
const fenceWords = (f: number) => (f === 0 ? 'at the start' : `after ${plural(f, 'value')}`);

/** Where several fences are: "at the start and after 1, 2 and 4 values". */
function fencesWords(fs: number[]): string {
  const rest = fs.filter((f) => f > 0);
  const after = rest.length
    ? `after ${and(rest.map(String))} ${rest.length === 1 && rest[0] === 1 ? 'value' : 'values'}`
    : '';
  if (fs[0] === 0) return rest.length ? `at the start and ${after}` : 'at the start';
  return after;
}

// ----- Input -----

const INT = /^[-−]?\d+$/;
const num = (t: string) => {
  const v = Number(t.replace('−', '-'));
  return v === 0 ? 0 : v;
};

/** For the input box: a list of values to load ("2 3 -1"), or one number, k. */
export function parseInput(token: string): Value | Error {
  const tokens = token.split(/[\s,;]+/).filter(Boolean);
  if (tokens.length === 0) return new Error('Type k, such as 3, or a list of values to load.');
  if (tokens.length === 1) {
    const t = tokens[0]!;
    if (!INT.test(t)) return new Error(`"${t}" is not a whole number.`);
    const v = num(t);
    if (Math.abs(v) > MAX_K) return new Error(`${t} is out of range. Use −${MAX_K} to ${MAX_K}.`);
    return v;
  }
  const vs = readValues(tokens.join(' '));
  return typeof vs === 'string' ? new Error(vs) : vs.join(' ');
}

/** An operation's list of values, or why it cannot be read. */
export function readValues(arg: Value | undefined): number[] | string {
  const tokens = String(arg ?? '')
    .split(/[\s,;]+/)
    .filter(Boolean);
  if (tokens.length === 0) return 'Type some values first, such as 2 3 -1 2.';
  if (tokens.length > MAX_N)
    return `That is ${tokens.length} values. Use at most ${MAX_N}, so every sum stays readable.`;
  const out: number[] = [];
  for (const t of tokens) {
    if (!INT.test(t)) return `"${t}" is not a whole number.`;
    const v = num(t);
    if (v < MIN_VALUE || v > MAX_VALUE)
      return `${t} is out of range. Use whole numbers from ${MIN_VALUE} to ${MAX_VALUE}.`;
    out.push(v);
  }
  return out;
}

/** An operation's k, or why it cannot be read. */
export function readK(arg: Value | undefined): number | string {
  const t = String(arg ?? '').trim();
  if (!INT.test(t)) return 'Type k as one whole number, such as 3.';
  const v = num(t);
  if (Math.abs(v) > MAX_K) return `k must be from −${MAX_K} to ${MAX_K}, not ${v}.`;
  return v;
}

// ----- What the operation will find (computed first, so the frame stays still) -----

export function prefixSums(a: readonly number[]): number[] {
  const p = [0];
  for (const x of a) p.push(p[p.length - 1]! + x);
  return p;
}

/** Every subarray with sum k, in the order an approach finds it. */
export function allFound(a: readonly number[], k: number, approach: Approach): Span[] {
  const p = prefixSums(a);
  const out: Span[] = [];
  if (approach === 'naive') {
    for (let i = 0; i < a.length; i++)
      for (let j = i; j < a.length; j++) if (p[j + 1]! - p[i]! === k) out.push({ lo: i, hi: j });
  } else {
    for (let j = 1; j <= a.length; j++)
      for (let i = 0; i < j; i++) if (p[j]! - p[i]! === k) out.push({ lo: i, hi: j - 1 });
  }
  return out;
}

/**
 * The longest subarray with sum k, the first one in scan order on a tie, or null. Both
 * approaches report the same one: of two the same length, the one that ends first starts first.
 */
export function longest(a: readonly number[], k: number): Span | null {
  let best: Span | null = null;
  for (const s of allFound(a, k, 'naive')) if (!best || s.hi - s.lo > best.hi - best.lo) best = s;
  return best;
}

/** What each approach costs on n values: n(n + 1)/2 sums against n sums and 2n lookups. */
export const totals = (n: number): Totals => ({ naive: (n * (n + 1)) / 2, pattern: 3 * n });

/** The most subarrays one lookup finds. */
function mostAtOnce(all: Span[]): number {
  const byEnd = new Map<number, number>();
  for (const s of all) byEnd.set(s.hi, (byEnd.get(s.hi) ?? 0) + 1);
  return Math.max(0, ...byEnd.values());
}

/**
 * The found list shows at most this many chips. With more to show, the last chip reads
 * "+m more" instead.
 */
export const LIST_MAX = 12;

/** Shape id of found subarray number `idx` (0-based) of `total`: its chip, or the "more" chip. */
export const chipId = (idx: number, total: number): string =>
  total > LIST_MAX && idx >= LIST_MAX - 1 ? 'f-more' : `f-${idx}`;

/** Bracket lanes drawn at once by the pattern's count. */
export const MAX_LANES = 3;

function lanesFor(settings: PSSettings, all: Span[]): boolean[] {
  const naive = approachOf(settings) === 'naive';
  if (settings.goal === 'longest') return naive ? [true, true] : [false, true];
  return naive ? [true] : Array(Math.min(MAX_LANES, mostAtOnce(all))).fill(false);
}

// ----- Steps -----

function refuse(s: PSState, why: string): PSStep {
  return {
    state: s,
    marks: [mark('a-name', 'error')],
    say: `Nothing to do. ${why}`,
    lines: [],
    level: 1,
    vars: { n: s.a.length },
  };
}

const load: Op = {
  label: 'Load',
  arity: 1,
  *run(s, [arg]) {
    const vs = readValues(arg);
    if (typeof vs === 'string') {
      yield refuse(s, `${vs} The array stays as it was.`);
      return s;
    }
    const next = { a: vs };
    yield {
      state: next,
      marks: [],
      say: `Loaded ${plural(vs.length, 'value')} into A: ${vs.map(fmt).join(', ')}. Type k and press Find sum k.`,
      lines: [],
      level: 1,
      vars: { n: vs.length },
    };
    return next;
  },
};

/** The pattern: one pass with a running sum and a map. */
function* pattern(s: PSState, k: number, settings: PSSettings): Generator<PSStep, PSState, void> {
  const a = s.a;
  const n = a.length;
  const count = settings.goal === 'count';
  const all = count ? allFound(a, k, 'pattern') : allFound(a, k, 'pattern').filter(firstHit(a, k));
  const frame = { lanes: lanesFor(settings, all), all };
  const tot = totals(n);
  const work = new Work(['sums', 'lookups']);
  const sums: (number | null)[] = Array(n + 1).fill(null);
  const map = new Map<number, number>();
  const keys: number[] = [];
  const found: Span[] = [];
  let sum = 0;
  let result = 0;
  let best: Span | undefined;
  sums[0] = 0;
  map.set(0, count ? 1 : 0);
  keys.push(0);
  const slot = (key: number) => keys.indexOf(key);
  const extra = (brackets: Bracket[] = []): PSExtra => ({
    k,
    sums: [...sums],
    map: keys.map((key) => ({ key, value: map.get(key)! })),
    brackets,
    found: [...found],
    ...(best ? { best } : {}),
    frame,
  });
  const bestBracket = (): Bracket[] =>
    best ? [{ ...best, lane: 1, role: 'found', label: `best = ${result}` }] : [];
  const vars = (j: number): Record<string, Scalar> => ({
    k,
    j,
    sum,
    'sum − k': sum - k,
    [count ? 'count' : 'best']: result,
    ...workVars(work, tot),
  });

  yield {
    state: s,
    marks: [mark('p-0', 'new'), mark('mk-0', 'new'), mark('mv-0', 'new')],
    say: count
      ? `Count the subarrays with sum k = ${fmt(k)}. Start with the empty prefix: the running sum is 0, seen once, so seen = {0: 1}. ${when(k)}`
      : `Find the longest subarray with sum k = ${fmt(k)}. Start with the empty prefix: the running sum 0 is first seen at the start, so first = {0: 0}. ${when(k)}`,
    lines: ['init'],
    level: 2,
    vars: vars(0),
    extra: extra(),
  };

  for (let j = 1; j <= n; j++) {
    const x = a[j - 1]!;
    const was = sum;
    sum += x;
    sums[j] = sum;
    work.add('sums');
    yield {
      state: s,
      marks: [mark(`a-${j - 1}`, 'active'), mark(`p-${j}`, 'new')],
      say: `A[${j - 1}] = ${fmt(x)} comes in: sum = ${plus(was, x)} = ${fmt(sum)}.`,
      lines: ['loop', 'add'],
      level: 3,
      vars: vars(j),
      extra: extra(count ? [] : bestBracket()),
    };

    const need = sum - k;
    work.add('lookups');
    const at = slot(need);
    const fences = sums.slice(0, j).flatMap((v, i) => (v === need ? [i] : []));
    const look = `sum = ${fmt(sum)}. Look up sum − k = ${minus(sum, k)} = ${fmt(need)}`;
    if (count) {
      const hits = fences.map((i) => ({ lo: i, hi: j - 1 }));
      result += hits.length;
      found.push(...hits);
      // Shortest subarrays nearest to A.
      const shown = [...hits].reverse().slice(0, frame.lanes.length);
      yield {
        state: s,
        marks: [
          mark(`p-${j}`, 'active'),
          ...(at >= 0 ? [mark(`mk-${at}`, 'found'), mark(`mv-${at}`, 'found')] : []),
          ...fences.map((i) => mark(`p-${i}`, 'found')),
          ...[
            ...new Set(hits.map((_, h) => chipId(found.length - hits.length + h, all.length))),
          ].map((id) => mark(id, 'new')),
        ],
        say: hits.length
          ? `${look}: seen[${fmt(need)}] = ${hits.length}. The running sum was ${fmt(need)} ${fencesWords(fences)}, so ${hits.length === 1 ? 'one subarray ends' : `${hits.length} subarrays end`} at A[${j - 1}] with sum ${fmt(k)}: ${spans(hits)}. count = ${plus(result - hits.length, hits.length)} = ${result}.`
          : `${look}: not in seen, so no subarray ending at A[${j - 1}] sums to ${fmt(k)}. count stays ${result}.`,
        lines: ['lookup'],
        level: 2,
        vars: vars(j),
        extra: extra(shown.map((h, lane) => ({ ...h, lane, role: 'found' as MarkRole }))),
      };
    } else {
      const i = fences[0];
      let say: string;
      let cand: Bracket[] = [];
      if (i === undefined) {
        say = `${look}: not in first, so no subarray ending at A[${j - 1}] sums to ${fmt(k)}.`;
      } else {
        const hit = { lo: i, hi: j - 1 };
        const len = j - i;
        const better = len > result;
        found.push(hit);
        if (better) {
          result = len;
          best = hit;
        }
        cand = [{ ...hit, lane: 0, role: 'compare' }];
        say = `${look}: first[${fmt(need)}] = ${i}, so the longest subarray ending at A[${j - 1}] with sum ${fmt(k)} starts at A[${i}]: ${span(hit)}, length ${len}.${better ? ' The longest so far.' : ` Not longer than ${result}.`}`;
      }
      yield {
        state: s,
        marks: [
          mark(`p-${j}`, 'active'),
          ...(at >= 0 ? [mark(`mk-${at}`, 'found'), mark(`mv-${at}`, 'found')] : []),
          ...(i === undefined
            ? []
            : [mark(`p-${i}`, 'found'), mark(chipId(found.length - 1, all.length), 'new')]),
        ],
        say,
        lines: i === undefined ? ['lookup'] : ['lookup', 'better'],
        level: 2,
        vars: vars(j),
        extra: extra([...cand, ...bestBracket()]),
      };
    }

    work.add('lookups');
    const fresh = !map.has(sum);
    if (fresh) keys.push(sum);
    if (count) map.set(sum, (map.get(sum) ?? 0) + 1);
    else if (fresh) map.set(sum, j);
    const e = slot(sum);
    yield {
      state: s,
      marks: [
        mark(`p-${j}`, 'active'),
        mark(`mk-${e}`, fresh ? 'new' : 'active'),
        mark(`mv-${e}`, fresh || count ? 'new' : 'active'),
      ],
      say: count
        ? fresh
          ? `Remember this running sum: ${fmt(sum)} is new, so seen[${fmt(sum)}] = 1.`
          : `Remember this running sum: seen[${fmt(sum)}] goes up to ${map.get(sum)}.`
        : fresh
          ? `Remember where this running sum first appeared: ${fmt(sum)} is new, so first[${fmt(sum)}] = ${j}.`
          : `${fmt(sum)} was first reached ${fenceWords(map.get(sum)!)}. Keep that, not ${j}: the earlier a subarray starts, the longer it is.`,
      lines: count || !fresh ? ['record'] : ['record', 'keep'],
      level: 2,
      vars: vars(j),
      extra: extra(count ? [] : bestBracket()),
    };
  }

  const done = count
    ? result
      ? `Done: ${plural(result, 'subarray')} ${result === 1 ? 'sums' : 'sum'} to ${fmt(k)}: ${spans(found)}.`
      : `Done: no subarray sums to ${fmt(k)}, so the count is 0.`
    : best
      ? `Done: the longest subarray with sum ${fmt(k)} is ${span(best)}, length ${result}.`
      : `Done: no subarray sums to ${fmt(k)}, so the answer is 0.`;
  yield {
    state: s,
    marks: best ? [mark('br-1', 'found')] : [],
    say: `${done} One pass did ${work.tally()}; every pair of ends would take ${tot.naive} sums.`,
    lines: ['ret'],
    level: 1,
    vars: {
      ...vars(n),
      ...(count ? {} : { start: best ? best.lo : -1 }),
    },
    extra: extra(count ? [] : bestBracket()),
  };
  return s;
}

/**
 * For the longest, the pattern looks at one subarray per end: the one from the first fence with
 * the right running sum. Keeps the found list to those.
 */
function firstHit(a: readonly number[], k: number) {
  const p = prefixSums(a);
  return (s: Span) => p.findIndex((v) => v === p[s.hi + 1]! - k) === s.lo;
}

/** Every pair of ends: for each start, extend the end and keep the sum. */
function* naive(s: PSState, k: number, settings: PSSettings): Generator<PSStep, PSState, void> {
  const a = s.a;
  const n = a.length;
  const count = settings.goal === 'count';
  const all = allFound(a, k, 'naive');
  const frame = { lanes: lanesFor(settings, all), all };
  const tot = totals(n);
  const work = new Work(['sums', 'lookups']);
  const tri: (number | null)[][] = a.map(() => Array(n).fill(null));
  const found: Span[] = [];
  let result = 0;
  let best: Span | undefined;
  let sum = 0;
  const extra = (brackets: Bracket[]): PSExtra => ({
    k,
    tri: tri.map((r) => [...r]),
    brackets,
    found: [...found],
    ...(best ? { best } : {}),
    frame,
  });
  const bestBracket = (): Bracket[] =>
    best ? [{ ...best, lane: 1, role: 'found', label: 'best' }] : [];
  const vars = (i: number, j: number): Record<string, Scalar> => ({
    k,
    i,
    j,
    sum,
    [count ? 'count' : 'best']: result,
    ...workVars(work, tot),
  });

  yield {
    state: s,
    marks: [],
    say: count
      ? `Count the subarrays with sum k = ${fmt(k)} by trying every pair of ends: for each start i, extend the end j one value at a time and keep the sum of A[i..j]. Row i of the triangle holds those sums.`
      : `Find the longest subarray with sum k = ${fmt(k)} by trying every pair of ends: for each start i, extend the end j one value at a time and keep the sum of A[i..j]. Row i of the triangle holds those sums.`,
    lines: ['init'],
    level: 2,
    vars: vars(0, 0),
    extra: extra([]),
  };

  for (let i = 0; i < n; i++) {
    sum = 0;
    for (let j = i; j < n; j++) {
      const was = sum;
      sum += a[j]!;
      tri[i]![j] = sum;
      work.add('sums');
      const cur = { lo: i, hi: j };
      const hit = sum === k;
      let note = '';
      if (hit) {
        found.push(cur);
        if (count) {
          result++;
          note = ` That is k: count = ${result}.`;
        } else {
          const len = j - i + 1;
          if (len > result) {
            result = len;
            best = cur;
            note = ` That is k, length ${len}: the longest so far.`;
          } else note = ` That is k, but length ${len} is not longer than ${result}.`;
        }
      }
      const last = j === n - 1;
      const rowDone = last
        ? ` That was the last end for start ${i}: row ${i} has its ${plural(n - i, 'sum')}.`
        : '';
      yield {
        state: s,
        marks: [
          mark(`a-${j}`, 'active'),
          mark(`t-${i}-${j}`, hit ? 'found' : 'new'),
          ...(hit ? [mark(chipId(found.length - 1, all.length), 'new')] : []),
        ],
        say: `${span(cur)}: sum = ${j === i ? a[j] : `${plus(was, a[j]!)} = ${fmt(sum)}`}.${note}${rowDone}`,
        lines: [
          ...(j === i ? ['outer', 'reset'] : ['inner']),
          'add',
          'check',
          ...(hit ? ['hit'] : []),
        ],
        // Every pair is a step at normal detail: the naive way takes longer to play, too.
        level: 2,
        vars: vars(i, j),
        extra: extra([
          { ...cur, lane: 0, role: hit ? 'found' : 'visit', label: `sum = ${sum}` },
          ...(count ? [] : bestBracket()),
        ]),
      };
    }
  }

  const done = count
    ? result
      ? `Done: ${plural(result, 'subarray')} ${result === 1 ? 'sums' : 'sum'} to ${fmt(k)}: ${spans(found)}.`
      : `Done: no subarray sums to ${fmt(k)}, so the count is 0.`
    : best
      ? `Done: the longest subarray with sum ${fmt(k)} is ${span(best)}, length ${result}.`
      : `Done: no subarray sums to ${fmt(k)}, so the answer is 0.`;
  yield {
    state: s,
    marks: best ? [mark('br-1', 'found')] : [],
    say: `${done} Every pair of ends took ${work.tally()}; a running sum with a map takes ${n} sums and ${2 * n} lookups.`,
    lines: ['ret'],
    level: 1,
    vars: { ...vars(n - 1, n - 1), ...(count ? {} : { start: best ? best.lo : -1 }) },
    extra: extra(count ? [] : bestBracket()),
  };
  return s;
}

const find: Op = {
  label: 'Find sum k',
  arity: 1,
  *run(s, [arg], { settings }) {
    const k = readK(arg);
    if (typeof k === 'string') {
      yield refuse(s, k);
      return s;
    }
    return approachOf(settings) === 'naive'
      ? yield* naive(s, k, settings)
      : yield* pattern(s, k, settings);
  },
};

export const ops: Record<string, Op> = { find, load };

// ----- Pseudocode -----

const L = (id: string, indent: number, text: string, plain: string): PseudoLine => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: PSSettings): PseudoBlock[] {
  const count = settings.goal !== 'longest';
  if (approachOf(settings) === 'naive') {
    return [
      {
        op: 'find',
        lines: [
          L(
            'sig',
            0,
            count
              ? 'countSumK(A, k)   // every pair of ends'
              : 'longestSumK(A, k)   // every pair of ends',
            count
              ? 'To count the subarrays of A whose sum is k, try every pair of ends:'
              : 'To find the longest subarray of A whose sum is k, try every pair of ends:',
          ),
          L('init', 1, count ? 'count = 0' : 'best = 0', 'Nothing found yet.'),
          L('outer', 1, 'for i = 0 to n − 1', 'For each start i,'),
          L('reset', 2, 'sum = 0', 'start the sum from nothing,'),
          L('inner', 2, 'for j = i to n − 1', 'and for each end j from i on:'),
          L('add', 3, 'sum = sum + A[j]', 'add A[j], so sum is the sum of A[i..j];'),
          L('check', 3, 'if sum == k', 'if it is k,'),
          L(
            'hit',
            4,
            count ? 'count = count + 1' : 'best = max(best, j − i + 1)',
            count ? 'count it.' : 'keep its length if it is the longest.',
          ),
          L('ret', 1, count ? 'return count' : 'return best', 'Hand back the answer.'),
        ],
      },
    ];
  }
  return [
    {
      op: 'find',
      lines: count
        ? [
            L('sig', 0, 'countSumK(A, k)', 'To count the subarrays of A whose sum is k:'),
            L(
              'init',
              1,
              'seen = {0: 1}; sum = 0; count = 0',
              'The empty prefix has sum 0: seen once. Nothing counted yet.',
            ),
            L('loop', 1, 'for j = 1 to n', 'Go through A once, left to right:'),
            L('add', 2, 'sum = sum + A[j − 1]', 'add the next value to the running sum;'),
            L(
              'lookup',
              2,
              'count = count + seen[sum − k]',
              'each earlier running sum equal to sum − k starts a subarray that ends here with sum k: count them all (none if sum − k is not in seen);',
            ),
            L('record', 2, 'seen[sum] = seen[sum] + 1', 'then remember this running sum.'),
            L('ret', 1, 'return count', 'Hand back the count.'),
          ]
        : [
            L('sig', 0, 'longestSumK(A, k)', 'To find the longest subarray of A whose sum is k:'),
            L(
              'init',
              1,
              'first = {0: 0}; sum = 0; best = 0',
              'The empty prefix has sum 0, reached after 0 values. Nothing found yet.',
            ),
            L('loop', 1, 'for j = 1 to n', 'Go through A once, left to right:'),
            L('add', 2, 'sum = sum + A[j − 1]', 'add the next value to the running sum;'),
            L('lookup', 2, 'if sum − k in first', 'if the running sum was ever sum − k,'),
            L(
              'better',
              3,
              'best = max(best, j − first[sum − k])',
              'the subarray from its first time to here sums to k: keep its length if it is the longest;',
            ),
            L('record', 2, 'if sum not in first', 'if this running sum is new,'),
            L(
              'keep',
              3,
              'first[sum] = j',
              'remember where it first appeared. Only the first time.',
            ),
            L('ret', 1, 'return best', 'Hand back the longest length (0 if none).'),
          ],
    },
  ];
}

// ----- Start -----

export function describe(s: PSState): string {
  return `A holds ${plural(s.a.length, 'value')}: ${s.a.map(fmt).join(', ')}.`;
}

export function initialSay(s: PSState): string {
  return `A holds ${plural(s.a.length, 'value')}, some negative. Type k, such as ${START_K}, and press Find sum k. Type a list of values and press Load to start over.`;
}

export const initialVars = (s: PSState) => ({ n: s.a.length });
