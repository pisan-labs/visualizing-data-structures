/**
 * Merge intervals: three operations on a list of intervals, each two ways.
 *
 * - merge: the pattern sorts by start, then makes one pass: each interval either reaches the
 *   last one out (merge: its end grows, or it lies inside) or starts after it (a new one). Once
 *   sorted, nothing later can reach back past the last one out, so one check each is enough.
 *   The naive way takes the intervals as they come and checks each against every interval out
 *   so far, absorbing every one it overlaps: n(n − 1)/2 checks when nothing merges.
 * - insert: one interval into a sorted list of disjoint ones. The pattern copies what ends
 *   before it, absorbs what overlaps it and copies the rest. The naive way appends it and
 *   merges the whole list again.
 * - intersect: two sorted lists of disjoint intervals. The pattern walks both with one index
 *   each, moving the one that ends first. The naive way checks every pair.
 *
 * Every operation's result becomes the list. The setting `touch` says whether intervals that
 * only touch (1–3 and 3–5) overlap: closed intervals, the usual interview convention, or
 * half-open ones as on /interval-partitioning/.
 *
 * Work, in the units of src/viz/_patterns/kit.ts: a comparison is one comparison of two starts
 * while sorting (a merge sort's); a check is one test of two intervals against each other.
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
import { MAX_TIME, intervalsFromArg, type Interval } from '../_intervals/kit';
import {
  andList,
  axisRange,
  ivInput,
  ivText,
  mergeSortCount,
  plural,
  type Bar,
  type Lane,
  type LanePicture,
  type Marker,
} from '../_intervals2/kit';
import { approachOf, Work, workVars, type Approach, type Totals } from '../_patterns/kit';

/** At most this many intervals load, or make up list B. */
export const MAX_LOAD = 8;
/** Inserting can grow the list past MAX_LOAD, up to this. */
export const MAX_LIST = 10;

export type Touch = 'merge' | 'apart';

export interface MISettings {
  [key: string]: Scalar;
  approach: Approach;
  touch: Touch;
}

export const defaults: MISettings = { approach: 'pattern', touch: 'merge' };

export interface MIState {
  /** The list, ids 1..n in its order. */
  ivs: Interval[];
}

/** What a check of the merge pass found: the end grows, it lies inside, or a new one starts. */
export type Action = 'grow' | 'inside' | 'start';

export interface MIExtra {
  pic: LanePicture;
  /** The merge pass (pattern): the interval just checked and what it did. */
  cur?: Interval;
  action?: Action;
  /** The output so far. */
  out: Seg[];
}

export interface Seg {
  s: number;
  f: number;
}

export type MIStep = Step<MIState, MIExtra>;
type Op = OpSpec<MIState, MISettings, MIExtra>;
type Gen = Generator<MIStep, MIState, void>;

export const START: Interval[] = [
  [4, 7],
  [1, 3],
  [9, 12],
  [2, 5],
  [10, 11],
  [13, 15],
  [15, 17],
].map(([s, f], k) => ({ id: k + 1, s: s!, f: f! }));

export const init = (): MIState => ({ ivs: START.map((v) => ({ ...v })) });

const mark = (id: string, role: MarkRole): Mark => ({ id, role });

/** Renumber intervals 1..n in list order. */
export const numbered = (segs: readonly Seg[]): Interval[] =>
  segs.map((v, k) => ({ id: k + 1, s: v.s, f: v.f }));

const closedOf = (s: MISettings) => s.touch !== 'apart';

// ----- The rules, for one setting of touch -----

/** Does x reach the last interval out (merge pass)? x starts no earlier than it. */
export const reaches = (last: Seg, x: Seg, closed: boolean) =>
  closed ? x.s <= last.f : x.s < last.f;

/** Do two intervals overlap? */
export const overlap = (a: Seg, b: Seg, closed: boolean) =>
  closed ? a.s <= b.f && b.s <= a.f : a.s < b.f && b.s < a.f;

/** Is a wholly before b? */
export const before = (a: Seg, b: Seg, closed: boolean) => (closed ? a.f < b.s : a.f <= b.s);

/** Sorted by start, and no two overlap: what insert and intersect need. */
export function sortedDisjoint(ivs: readonly Seg[], closed: boolean): boolean {
  for (let k = 1; k < ivs.length; k++) if (!before(ivs[k - 1]!, ivs[k]!, closed)) return false;
  return true;
}

/** The first two that break sortedDisjoint, for a message. */
function firstClash(ivs: readonly Seg[], closed: boolean): [Seg, Seg] | null {
  for (let k = 1; k < ivs.length; k++)
    if (!before(ivs[k - 1]!, ivs[k]!, closed)) return [ivs[k - 1]!, ivs[k]!];
  return null;
}

const cover = (a: Seg, b: Seg): Seg => ({ s: Math.min(a.s, b.s), f: Math.max(a.f, b.f) });

export const byStart = (a: Interval, b: Interval) => a.s < b.s || (a.s === b.s && a.id < b.id);

// ----- Whole runs, for totals, tests and practice -----

export function mergePass(
  ivs: readonly Interval[],
  closed: boolean,
): { out: Seg[]; comparisons: number; checks: number; sorted: Interval[] } {
  const { sorted, comparisons } = mergeSortCount(ivs, byStart);
  const out: Seg[] = [];
  let checks = 0;
  for (const x of sorted) {
    const last = out[out.length - 1];
    if (!last) {
      out.push({ s: x.s, f: x.f });
      continue;
    }
    checks++;
    if (reaches(last, x, closed)) last.f = Math.max(last.f, x.f);
    else out.push({ s: x.s, f: x.f });
  }
  return { out, comparisons, checks, sorted };
}

export function mergeEvery(
  ivs: readonly Interval[],
  closed: boolean,
): { out: Seg[]; checks: number } {
  let out: Seg[] = [];
  let checks = 0;
  for (const v of ivs) {
    let x: Seg = { s: v.s, f: v.f };
    const keep: Seg[] = [];
    let at = 0;
    for (const r of out) {
      checks++;
      if (overlap(r, x, closed)) x = cover(x, r);
      else {
        keep.push(r);
        if (before(r, x, closed)) at = keep.length;
      }
    }
    keep.splice(at, 0, x);
    out = keep;
  }
  return { out, checks };
}

export function insertPass(
  list: readonly Seg[],
  x0: Seg,
  closed: boolean,
): { out: Seg[]; checks: number } {
  const out: Seg[] = [];
  let x = { ...x0 };
  let checks = 0;
  let i = 0;
  for (; i < list.length; i++) {
    checks++;
    if (!before(list[i]!, x, closed)) break;
    out.push({ ...list[i]! });
  }
  for (; i < list.length; i++) {
    checks++;
    if (before(x, list[i]!, closed)) break;
    x = cover(x, list[i]!);
  }
  out.push(x);
  while (i < list.length) out.push({ ...list[i++]! });
  return { out, checks };
}

/** The overlap of a and b, or null. A single moment counts when touching ends overlap. */
export function common(a: Seg, b: Seg, closed: boolean): Seg | null {
  const lo = Math.max(a.s, b.s);
  const hi = Math.min(a.f, b.f);
  return (closed ? lo <= hi : lo < hi) ? { s: lo, f: hi } : null;
}

export function intersectPass(
  a: readonly Seg[],
  b: readonly Seg[],
  closed: boolean,
): { out: Seg[]; checks: number } {
  const out: Seg[] = [];
  let i = 0;
  let j = 0;
  let checks = 0;
  while (i < a.length && j < b.length) {
    checks++;
    const c = common(a[i]!, b[j]!, closed);
    if (c) out.push(c);
    if (a[i]!.f < b[j]!.f) i++;
    else j++;
  }
  return { out, checks };
}

export function intersectEvery(
  a: readonly Seg[],
  b: readonly Seg[],
  closed: boolean,
): { out: Seg[]; checks: number } {
  const out: Seg[] = [];
  for (const x of a)
    for (const y of b) {
      const c = common(x, y, closed);
      if (c) out.push(c);
    }
  return { out, checks: a.length * b.length };
}

// ----- Text -----

const list = (segs: readonly Seg[]) => (segs.length ? andList(segs.map(ivText)) : 'nothing');

/** "A[1] = 2–6". */
const named = (side: 'A' | 'B', k: number, v: Seg) => `${side}[${k}] = ${ivText(v)}`;

/** What touching ends do, for narration. */
const touchWords = (closed: boolean) =>
  closed ? 'touching ends count as overlapping' : 'touching ends do not overlap';

function cheaper(t: Totals, approach: Approach): string {
  const mine = approach === 'pattern' ? t.pattern : t.naive;
  const other = approach === 'pattern' ? t.naive : t.pattern;
  if (mine < other) return '';
  if (mine === other) return ' On this input the two cost the same.';
  return approach === 'pattern'
    ? ' On an input this small the plain way is cheaper; the sort pays off as n grows.'
    : '';
}

/** "7 intervals merge into 3: …", or that nothing merged. */
function mergedWords(n: number, out: readonly Seg[]): string {
  if (out.length === n && n > 1)
    return `nothing overlaps, so all ${n} intervals come out as they are, in start order: ${list(out)}`;
  return `${plural(n, 'interval')} merge into ${plural(out.length, 'interval')}: ${list(out)}`;
}

// ----- Input -----

/** For the input box: one interval (to insert) or a list (to load, or to intersect with). */
export function parseInput(token: string): Value | Error {
  const ivs = intervalsFromArg(token, MAX_LOAD, 'interval');
  if (typeof ivs === 'string') return new Error(ivs);
  return ivs.map(ivInput).join(' ');
}

function refuse(st: MIState, why: string): MIStep {
  return {
    state: st,
    marks: [],
    say: `Nothing to do. ${why}`,
    lines: [],
    level: 1,
    vars: { n: st.ivs.length },
  };
}

// ----- Pictures -----

const inputLanes = (ivs: readonly Interval[], used: ReadonlySet<number>, id = 'iv'): Lane[] =>
  ivs.map((v) => ({ bars: [{ id: `${id}-${v.id}`, s: v.s, f: v.f, dim: used.has(v.id) }] }));

const outBars = (
  segs: readonly (Seg & { key: string })[],
  role?: (k: number) => MarkRole | undefined,
): Bar[] => segs.map((v, k) => ({ id: v.key, s: v.s, f: v.f, role: role?.(k) }));

// ----- Load -----

const load: Op = {
  label: 'Load',
  arity: 1,
  *run(st, [arg]): Gen {
    const ivs = intervalsFromArg(arg, MAX_LOAD, 'interval');
    if (typeof ivs === 'string') {
      yield refuse(st, `${ivs} The list stays as it was.`);
      return st;
    }
    const next = { ivs };
    yield {
      state: next,
      marks: [],
      say: `Loaded ${plural(ivs.length, 'interval')}: ${list(ivs)}. Press Merge.`,
      lines: [],
      level: 1,
      vars: { n: ivs.length },
    };
    return next;
  },
};

// ----- Merge, the pattern: sort, then one pass -----

interface PassContext {
  /** The operation whose pseudocode the steps highlight. */
  block: 'merge' | 'insert';
  totals: Totals;
  /** Insert, appending: the appended interval's id, to mark it. */
  appended?: number;
}

function* sortThenMerge(st: MIState, ivs: Interval[], settings: MISettings, ctx: PassContext): Gen {
  const closed = closedOf(settings);
  const n = ivs.length;
  const { t0, T } = axisRange(ivs);
  const work = new Work(['comparisons', 'checks']);
  const { sorted, comparisons } = mergeSortCount(ivs, byStart);
  const out: (Seg & { key: string })[] = [];
  const used = new Set<number>();
  let order: Interval[] = ivs;
  const pic = (marker = true): LanePicture => ({
    lanes: [...inputLanes(order, used), { name: 'out', bars: outBars(out) }],
    t0,
    T,
    markers:
      marker && out.length
        ? [{ id: 'end', t: out[out.length - 1]!.f, label: 'end', role: 'active' } as Marker]
        : [],
  });
  const vars = () => ({ n, out: out.length, ...workVars(work, ctx.totals) });
  const insert = ctx.block === 'insert';

  if (insert) {
    yield {
      state: st,
      marks: [mark(`iv-${ctx.appended}`, 'new')],
      say: `Append x = ${ivText(ivs[n - 1]!)} to the end of the list, then merge all ${n} again: sort by start, one pass. No use is made of the list being sorted already.`,
      lines: ['append'],
      level: 2,
      vars: vars(),
      extra: { pic: pic(false), out: [] },
    };
  }

  work.add('comparisons', comparisons);
  const already = sorted.every((v, k) => v === ivs[k]);
  order = sorted;
  yield {
    state: st,
    marks: [],
    say: already
      ? `Sort the ${plural(n, 'interval')} by start. They are in start order already, but the sort has to find that out: a merge sort takes ${plural(comparisons, 'comparison')}.`
      : `Sort the ${plural(n, 'interval')} by start: ${list(sorted)}. A merge sort takes ${plural(comparisons, 'comparison')}.`,
    lines: ['sort'],
    level: 2,
    vars: vars(),
    extra: { pic: pic(false), out: [] },
  };

  const first = sorted[0]!;
  out.push({ s: first.s, f: first.f, key: `m-${first.id}` });
  used.add(first.id);
  yield {
    state: st,
    marks: [mark(`iv-${first.id}`, 'new'), mark(`m-${first.id}`, 'new')],
    say: `The first one, ${ivText(first)}, starts the output.`,
    lines: ['first'],
    level: 2,
    vars: vars(),
    extra: { pic: pic(), out: out.map(({ s, f }) => ({ s, f })) },
  };

  for (const x of sorted.slice(1)) {
    const last = out[out.length - 1]!;
    const was = { s: last.s, f: last.f };
    work.add('checks');
    used.add(x.id);
    let action: Action;
    let say: string;
    if (reaches(last, x, closed)) {
      const how =
        x.s === last.f
          ? `starts at ${x.s}, just as ${ivText(was)} ends: ${touchWords(closed)}, so they merge`
          : `starts at ${x.s}, before ${ivText(was)} ends at ${was.f}: they overlap`;
      if (x.f > last.f) {
        action = 'grow';
        last.f = x.f;
        say = `${ivText(x)} ${how}. The end grows to ${x.f}: the last one out is now ${ivText(last)}.`;
      } else {
        action = 'inside';
        say = `${ivText(x)} ${how}, and it ends at ${x.f}, inside. Nothing changes: the last one out stays ${ivText(last)}.`;
      }
    } else {
      action = 'start';
      out.push({ s: x.s, f: x.f, key: `m-${x.id}` });
      say =
        x.s === was.f
          ? `${ivText(x)} starts at ${x.s}, just as ${ivText(was)} ends, and ${touchWords(closed)}. Start a new one.`
          : `${ivText(x)} starts at ${x.s}, after ${ivText(was)} ends at ${was.f}. Every later interval starts later still, so none can reach back: start a new one.`;
    }
    const lastNow = out[out.length - 1]!;
    yield {
      state: st,
      marks: [
        mark(`iv-${x.id}`, 'active'),
        mark(lastNow.key, action === 'start' ? 'new' : 'found'),
      ],
      say,
      lines: ['loop', 'check', action === 'start' ? 'start' : 'grow'],
      level: 2,
      vars: vars(),
      extra: { pic: pic(), cur: x, action, out: out.map(({ s, f }) => ({ s, f })) },
    };
  }

  const result = numbered(out);
  const end: MIState = { ivs: result };
  const mine = ctx.totals.pattern;
  const other = ctx.totals.naive;
  yield {
    state: end,
    marks: [],
    say: `Done: ${insert ? `the list is now ${list(out)}` : mergedWords(n, out)}. ${
      insert
        ? `Appending and merging again took ${work.tally()}; one pass over the sorted list would take ${plural(mine, 'check')}.`
        : `The sort took ${plural(comparisons, 'comparison')} and the pass ${plural(n - 1, 'check')}; checking each against every interval out would take ${plural(other, 'check')}.${cheaper({ pattern: mine, naive: other }, 'pattern')}`
    }`,
    lines: ['ret'],
    level: 1,
    vars: vars(),
    extra: { pic: pic(false), out: out.map(({ s, f }) => ({ s, f })) },
  };
  return end;
}

// ----- Merge, the naive way: check every interval out -----

function* checkEvery(st: MIState, settings: MISettings, totals: Totals): Gen {
  const closed = closedOf(settings);
  const ivs = st.ivs;
  const n = ivs.length;
  const { t0, T } = axisRange(ivs);
  const work = new Work(['comparisons', 'checks']);
  let out: (Seg & { key: string })[] = [];
  let x: (Seg & { key: string }) | null = null;
  const used = new Set<number>();
  const pic = (): LanePicture => ({
    lanes: [
      ...inputLanes(ivs, used),
      { name: 'x', bars: x ? [{ id: x.key, s: x.s, f: x.f }] : [] },
      { name: 'out', bars: outBars(out) },
    ],
    t0,
    T,
  });
  const vars = () => ({ n, out: out.length, ...workVars(work, totals) });
  const extra = (): MIExtra => ({ pic: pic(), out: out.map(({ s, f }) => ({ s, f })) });

  yield {
    state: st,
    marks: [],
    say: `No sort: take the intervals in the order given. Check each one, x, against every interval out so far, absorb each one it overlaps, then put x in its place by start. Here ${touchWords(closed)}.`,
    lines: ['init'],
    level: 2,
    vars: vars(),
    extra: extra(),
  };

  for (const v of ivs) {
    used.add(v.id);
    x = { s: v.s, f: v.f, key: `m-${v.id}` };
    if (!out.length) {
      out = [x];
      const key = x.key;
      x = null;
      yield {
        state: st,
        marks: [mark(`iv-${v.id}`, 'active'), mark(key, 'new')],
        say: `${ivText(v)} comes first. Nothing is out yet, so it goes straight in.`,
        lines: ['loop', 'place'],
        level: 2,
        vars: vars(),
        extra: extra(),
      };
      continue;
    }
    const keep: (Seg & { key: string })[] = [];
    let at = 0;
    const pending = [...out];
    for (const [k, r] of pending.entries()) {
      work.add('checks');
      const intro =
        k === 0
          ? `Next, x = ${ivText(v)}. Check it against ${pending.length === 1 ? 'the one interval' : `all ${pending.length} intervals`} out. `
          : '';
      let say: string;
      let lines: string[];
      let role: MarkRole;
      if (overlap(r, x, closed)) {
        const was = { s: x.s, f: x.f };
        x = { ...cover(x, r), key: x.key };
        out = out.filter((o) => o !== r);
        say = `${intro}${ivText(r)} overlaps x = ${ivText(was)}: absorb it. x becomes ${ivText(x)}, covering both, and ${ivText(r)} leaves out.`;
        lines = ['loop', 'inner', 'check', 'absorb'];
        role = 'found';
      } else {
        keep.push(r);
        const b = before(r, x, closed);
        if (b) at = keep.length;
        say = `${intro}${ivText(r)} ${b ? `ends at ${r.f}, before x = ${ivText(x)} starts` : `starts at ${r.s}, after x = ${ivText(x)} ends`}: no overlap.`;
        lines = ['loop', 'inner', 'check'];
        role = 'compare';
      }
      yield {
        state: st,
        marks: [
          mark(`iv-${v.id}`, 'active'),
          mark(x.key, 'active'),
          ...(role === 'compare' ? [mark(r.key, 'compare')] : []),
        ],
        say,
        lines,
        level: 2,
        vars: vars(),
        extra: extra(),
      };
    }
    const placed = x;
    keep.splice(at, 0, placed);
    out = keep;
    x = null;
    const where =
      out.length === 1
        ? 'It is the only one out now.'
        : at === 0
          ? `It goes first, before ${ivText(out[1]!)}.`
          : `It goes after ${ivText(out[at - 1]!)}.`;
    yield {
      state: st,
      marks: [mark(`iv-${v.id}`, 'active'), mark(placed.key, 'new')],
      say: `Put x = ${ivText(placed)} out, in start order. ${where}`,
      lines: ['place'],
      level: 2,
      vars: vars(),
      extra: extra(),
    };
  }

  const end: MIState = { ivs: numbered(out) };
  yield {
    state: end,
    marks: [],
    say: `Done: ${mergedWords(n, out)}. Checking every interval out took ${plural(work.get('checks'), 'check')}, with no sort; sorting first would take ${plural(totals.pattern, 'step')} (${plural(totals.pattern - Math.max(0, n - 1), 'comparison')} and ${plural(Math.max(0, n - 1), 'check')}).${cheaper(totals, 'naive')}`,
    lines: ['ret'],
    level: 1,
    vars: vars(),
    extra: extra(),
  };
  return end;
}

const merge: Op = {
  label: 'Merge',
  arity: 0,
  *run(st, _args, { settings }): Gen {
    const closed = closedOf(settings);
    if (!st.ivs.length) {
      yield refuse(
        st,
        'The list is empty. Type some intervals, such as 4-7 1-3 2-5, and press Load.',
      );
      return st;
    }
    const p = mergePass(st.ivs, closed);
    const totals = { naive: mergeEvery(st.ivs, closed).checks, pattern: p.comparisons + p.checks };
    return approachOf(settings) === 'naive'
      ? yield* checkEvery(st, settings, totals)
      : yield* sortThenMerge(st, st.ivs, settings, { block: 'merge', totals });
  },
};

// ----- Insert -----

function readOne(arg: Value | undefined): Interval | string {
  const ivs = intervalsFromArg(arg, MAX_LOAD, 'interval');
  if (typeof ivs === 'string') return ivs;
  if (ivs.length !== 1)
    return `Insert takes one interval, such as 5-8, not ${ivs.length}. To load a list, press Load.`;
  return ivs[0]!;
}

function needSorted(st: MIState, closed: boolean, what: string): string | null {
  const clash = firstClash(st.ivs, closed);
  if (!clash) return null;
  const [a, b] = clash;
  return `${what} needs a sorted list of intervals that do not overlap, and ${ivText(a)} ${
    overlap(a, b, closed) ? 'overlaps' : 'comes after'
  } ${ivText(b)} (${touchWords(closed)}). Press Merge first.`;
}

function* insertOnePass(st: MIState, x0: Interval, settings: MISettings, totals: Totals): Gen {
  const closed = closedOf(settings);
  const lst = st.ivs;
  const n = lst.length;
  const { t0, T } = axisRange([...lst, x0]);
  const work = new Work(['comparisons', 'checks']);
  let left = lst.map((v) => ({ s: v.s, f: v.f, key: `a-${v.id}` }));
  const out: (Seg & { key: string })[] = [];
  let x: (Seg & { key: string }) | null = { s: x0.s, f: x0.f, key: 'x' };
  const pic = (): LanePicture => ({
    lanes: [
      { name: 'A', bars: outBars(left) },
      { name: 'x', bars: x ? [{ id: 'x', s: x.s, f: x.f }] : [] },
      { name: 'out', bars: outBars(out) },
    ],
    t0,
    T,
  });
  let i = 0;
  const vars = () => ({ n, i, out: out.length, ...workVars(work, totals) });
  const extra = (): MIExtra => ({ pic: pic(), out: out.map(({ s, f }) => ({ s, f })) });

  yield {
    state: st,
    marks: [mark('x', 'new')],
    say: `Insert x = ${ivText(x0)} into the sorted list A of ${plural(n, 'interval')}, in one pass: copy what ends before x, absorb what overlaps it, copy the rest.`,
    lines: ['init'],
    level: 2,
    vars: vars(),
    extra: extra(),
  };

  // Copy what ends before x.
  while (i < n) {
    const r = left[0]!;
    work.add('checks');
    if (before(r, x!, closed)) {
      left = left.slice(1);
      out.push(r);
      i++;
      yield {
        state: st,
        marks: [mark(r.key, 'visit')],
        say: `${ivText(r)} ends at ${r.f}, before x starts at ${x!.s}: copy it out.`,
        lines: ['before', 'copy'],
        level: 2,
        vars: vars(),
        extra: extra(),
      };
    } else {
      yield {
        state: st,
        marks: [mark(r.key, 'compare'), mark('x', 'active')],
        say: `${ivText(r)} ends at ${r.f}, not before x starts at ${x!.s}${r.f === x!.s ? ` (${touchWords(closed)})` : ''}: stop copying.`,
        lines: ['before'],
        level: 2,
        vars: vars(),
        extra: extra(),
      };
      break;
    }
  }
  // Absorb what overlaps it.
  while (i < n) {
    const r = left[0]!;
    work.add('checks');
    if (!before(x!, r, closed)) {
      const was = { s: x!.s, f: x!.f };
      x = { ...cover(x!, r), key: 'x' };
      left = left.slice(1);
      i++;
      yield {
        state: st,
        marks: [mark('x', 'found')],
        say: `${ivText(r)} starts at ${r.s}, ${r.s === was.f ? `just as x = ${ivText(was)} ends` : `before x = ${ivText(was)} ends`}: it overlaps. Absorb it: x = ${ivText(x)}.`,
        lines: ['overlap', 'absorb'],
        level: 2,
        vars: vars(),
        extra: extra(),
      };
    } else {
      yield {
        state: st,
        marks: [mark(r.key, 'compare'), mark('x', 'active')],
        say: `${ivText(r)} starts at ${r.s}, after x = ${ivText(x!)} ends${r.s === x!.f ? ` (${touchWords(closed)})` : ''}: stop absorbing.`,
        lines: ['overlap'],
        level: 2,
        vars: vars(),
        extra: extra(),
      };
      break;
    }
  }
  const placed = x!;
  out.push(placed);
  x = null;
  yield {
    state: st,
    marks: [mark('x', 'new')],
    say: `Put x = ${ivText(placed)} out.`,
    lines: ['add'],
    level: 2,
    vars: vars(),
    extra: extra(),
  };
  if (i < n) {
    const rest = left;
    out.push(...rest);
    left = [];
    i = n;
    yield {
      state: st,
      marks: rest.map((r) => mark(r.key, 'visit')),
      say: `Copy the rest as they are, ${list(rest)}: they start after x ends, and so does everything after them. No more checks.`,
      lines: ['rest'],
      level: 2,
      vars: vars(),
      extra: extra(),
    };
  }
  const end: MIState = { ivs: numbered(out) };
  yield {
    state: end,
    marks: [],
    say: `Done: the list is now ${list(out)}. One pass took ${plural(work.get('checks'), 'check')}; appending x and merging again would take ${plural(totals.naive, 'step')}.${cheaper(totals, 'pattern')}`,
    lines: ['ret'],
    level: 1,
    vars: vars(),
    extra: extra(),
  };
  return end;
}

const insert: Op = {
  label: 'Insert',
  arity: 1,
  *run(st, [arg], { settings }): Gen {
    const closed = closedOf(settings);
    const x = readOne(arg);
    if (typeof x === 'string') {
      yield refuse(st, x);
      return st;
    }
    const why = needSorted(st, closed, 'Insert');
    if (why) {
      yield refuse(st, why);
      return st;
    }
    if (st.ivs.length >= MAX_LIST) {
      yield refuse(
        st,
        `The list already holds ${MAX_LIST} intervals, as many as fit. Press Load to start over.`,
      );
      return st;
    }
    const appended: Interval = { id: st.ivs.length + 1, s: x.s, f: x.f };
    const all = [...st.ivs, appended];
    const again = mergePass(all, closed);
    const totals = {
      naive: again.comparisons + again.checks,
      pattern: insertPass(st.ivs, x, closed).checks,
    };
    return approachOf(settings) === 'naive'
      ? yield* sortThenMerge(st, all, settings, { block: 'insert', totals, appended: appended.id })
      : yield* insertOnePass(st, x, settings, totals);
  },
};

// ----- Intersect -----

function* intersectSteps(st: MIState, bs: Interval[], settings: MISettings, totals: Totals): Gen {
  const closed = closedOf(settings);
  const naive = approachOf(settings) === 'naive';
  const as = st.ivs;
  const { t0, T } = axisRange([...as, ...bs]);
  const work = new Work(['comparisons', 'checks']);
  const out: (Seg & { key: string })[] = [];
  const pic = (): LanePicture => ({
    lanes: [
      { name: 'A', bars: as.map((v) => ({ id: `a-${v.id}`, s: v.s, f: v.f })) },
      { name: 'B', bars: bs.map((v) => ({ id: `b-${v.id}`, s: v.s, f: v.f })) },
      { name: 'out', bars: outBars(out) },
    ],
    t0,
    T,
  });
  let i = 0;
  let j = 0;
  const vars = () => ({
    '|A|': as.length,
    '|B|': bs.length,
    i,
    j,
    out: out.length,
    ...workVars(work, totals),
  });
  const extra = (): MIExtra => ({ pic: pic(), out: out.map(({ s, f }) => ({ s, f })) });

  yield {
    state: st,
    marks: [],
    say: naive
      ? `Intersect A (${plural(as.length, 'interval')}) with B (${plural(bs.length, 'interval')}) by checking every pair: each interval of A against each interval of B, ${plural(as.length * bs.length, 'check')}.`
      : `Intersect A (${plural(as.length, 'interval')}) with B (${plural(bs.length, 'interval')}): one index in each, i = 0 and j = 0. Both lists are sorted, so the one that ends first can meet nothing more on the other side.`,
    lines: ['init'],
    level: 2,
    vars: vars(),
    extra: extra(),
  };

  const meet = (a: Interval, b: Interval) => {
    work.add('checks');
    const c = common(a, b, closed);
    const lo = Math.max(a.s, b.s);
    const hi = Math.min(a.f, b.f);
    const pair = `${named('A', i, a)} and ${named('B', j, b)}`;
    let say: string;
    if (c) {
      out.push({ ...c, key: `o-${out.length + 1}` });
      say = `${pair} ${c.s === c.f ? `touch at ${c.s}` : `overlap from ${lo} to ${hi}`}: append ${ivText(c)}.`;
    } else
      say = `${pair}: ${lo > hi ? `the later start, ${lo}, is after the earlier end, ${hi}` : `they only touch at ${lo}, and ${touchWords(closed)}`}. No overlap.`;
    return { c, say };
  };

  if (naive) {
    for (i = 0; i < as.length; i++)
      for (j = 0; j < bs.length; j++) {
        const a = as[i]!;
        const b = bs[j]!;
        const { c, say } = meet(a, b);
        yield {
          state: st,
          marks: [
            mark(`a-${a.id}`, 'active'),
            mark(`b-${b.id}`, 'active'),
            ...(c ? [mark(out[out.length - 1]!.key, 'new')] : []),
          ],
          say,
          lines: c ? ['outer', 'inner', 'common', 'hit'] : ['outer', 'inner', 'common'],
          level: 2,
          vars: vars(),
          extra: extra(),
        };
      }
    i = as.length - 1;
    j = bs.length - 1;
  } else {
    while (i < as.length && j < bs.length) {
      const a = as[i]!;
      const b = bs[j]!;
      const { c, say } = meet(a, b);
      const aFirst = a.f < b.f;
      const move = aFirst
        ? ` A[${i}] ends first, at ${a.f}: i moves on.`
        : a.f === b.f
          ? ` They end together, at ${a.f}: j moves on (i next time).`
          : ` B[${j}] ends first, at ${b.f}: j moves on.`;
      yield {
        state: st,
        marks: [
          mark(`a-${a.id}`, 'active'),
          mark(`b-${b.id}`, 'active'),
          ...(c ? [mark(out[out.length - 1]!.key, 'new')] : []),
        ],
        say: say + move,
        lines: c ? ['loop', 'common', 'hit', 'advance'] : ['loop', 'common', 'advance'],
        level: 2,
        vars: vars(),
        extra: extra(),
      };
      if (aFirst) i++;
      else j++;
    }
  }
  const end: MIState = { ivs: numbered(out) };
  const other = naive ? totals.pattern : totals.naive;
  yield {
    state: end,
    marks: [],
    say: `Done: A and B have ${out.length ? `${plural(out.length, 'stretch', 'stretches')} in common: ${list(out)}` : 'nothing in common'}; that is the list now. ${naive ? 'Every pair' : 'Two indices'} took ${plural(work.get('checks'), 'check')}; ${naive ? 'two indices would take' : 'every pair would take'} ${plural(other, 'check')}.${cheaper(totals, naive ? 'naive' : 'pattern')}`,
    lines: ['ret'],
    level: 1,
    vars: vars(),
    extra: extra(),
  };
  return end;
}

const intersect: Op = {
  label: 'Intersect with',
  arity: 1,
  *run(st, [arg], { settings }): Gen {
    const closed = closedOf(settings);
    const bs = intervalsFromArg(arg, MAX_LOAD, 'interval');
    if (typeof bs === 'string') {
      yield refuse(st, bs);
      return st;
    }
    const why = needSorted(st, closed, 'Intersect');
    if (why) {
      yield refuse(st, why);
      return st;
    }
    const clash = firstClash(bs, closed);
    if (clash) {
      yield refuse(
        st,
        `Type B in start order with no overlaps, and ${ivText(clash[0])} ${overlap(clash[0], clash[1], closed) ? 'overlaps' : 'comes after'} ${ivText(clash[1])} (${touchWords(closed)}).`,
      );
      return st;
    }
    const totals = {
      naive: st.ivs.length * bs.length,
      pattern: intersectPass(st.ivs, bs, closed).checks,
    };
    return yield* intersectSteps(st, bs, settings, totals);
  },
};

export const ops: Record<string, Op> = { merge, insert, intersect, load };

// ----- Pseudocode -----

const L = (id: string, indent: number, text: string, plain: string): PseudoLine => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: MISettings): PseudoBlock[] {
  const closed = closedOf(settings);
  const le = closed ? '<=' : '<';
  const lt = closed ? '<' : '<=';
  const naive = approachOf(settings) === 'naive';
  const pass = (indent: number): PseudoLine[] => [
    L('sort', indent, 'sort A by start', 'Put the intervals in order of start.'),
    L('first', indent, 'out = [A[0]]', 'The first one starts the output.'),
    L(
      'loop',
      indent,
      'for each interval x in A after the first',
      'Then for each of the others, in that order:',
    ),
    L(
      'check',
      indent + 1,
      `if x.start ${le} last(out).end`,
      closed
        ? 'if it starts before the last one out ends, or just as it ends,'
        : 'if it starts before the last one out ends,',
    ),
    L(
      'grow',
      indent + 2,
      'last(out).end = max(last(out).end, x.end)',
      'merge it: the end grows if x ends later;',
    ),
    L('start', indent + 1, 'else append x to out', 'otherwise it starts a new one.'),
  ];
  const mergeBlock: PseudoBlock = naive
    ? {
        op: 'merge',
        lines: [
          L(
            'sig',
            0,
            'mergeAll(A)   // check every interval out',
            'To merge the intervals of A without sorting:',
          ),
          L('init', 1, 'out = []   // in start order, none overlapping', 'Nothing is out yet.'),
          L(
            'loop',
            1,
            'for each interval x in A, in the order given',
            'Take the intervals as they come:',
          ),
          L('inner', 2, 'for each interval r in out', 'check x against every interval out:'),
          L('check', 3, `if r.start ${le} x.end and x.start ${le} r.end`, 'if r overlaps x,'),
          L(
            'absorb',
            4,
            'x = [min(x.start, r.start), max(x.end, r.end)]; remove r from out',
            'absorb it: x grows to cover both, and r leaves out.',
          ),
          L('place', 2, 'put x into out by its start', 'Then put x out, where its start belongs.'),
          L('ret', 1, 'return out', 'Hand back the merged list.'),
        ],
      }
    : {
        op: 'merge',
        lines: [
          L('sig', 0, 'merge(A)', 'To merge the overlapping intervals of A:'),
          ...pass(1),
          L('ret', 1, 'return out', 'Hand back the merged list.'),
        ],
      };
  const insertBlock: PseudoBlock = naive
    ? {
        op: 'insert',
        lines: [
          L(
            'sig',
            0,
            'insert(A, x)   // append, then merge again',
            'To insert x into the sorted list A, the plain way:',
          ),
          L('append', 1, 'append x to A', 'add x at the end,'),
          ...pass(1),
          L('ret', 1, 'return out', 'Hand back the merged list.'),
        ],
      }
    : {
        op: 'insert',
        lines: [
          L(
            'sig',
            0,
            'insert(A, x)   // A sorted, none overlapping',
            'To insert x into the sorted list A, in one pass:',
          ),
          L('init', 1, 'out = []; i = 0', 'Start at the front of A, with nothing out.'),
          L(
            'before',
            1,
            `while i < n and A[i].end ${lt} x.start`,
            'While the next one ends before x starts,',
          ),
          L('copy', 2, 'append A[i] to out; i = i + 1', 'copy it out.'),
          L(
            'overlap',
            1,
            `while i < n and A[i].start ${le} x.end`,
            'While the next one starts before x ends,',
          ),
          L(
            'absorb',
            2,
            'x = [min(x.start, A[i].start), max(x.end, A[i].end)]; i = i + 1',
            'absorb it into x.',
          ),
          L('add', 1, 'append x to out', 'Put x out.'),
          L('rest', 1, 'append A[i..n − 1] to out', 'Copy the rest as they are.'),
          L('ret', 1, 'return out', 'Hand back the new list.'),
        ],
      };
  const intersectBlock: PseudoBlock = naive
    ? {
        op: 'intersect',
        lines: [
          L(
            'sig',
            0,
            'intersect(A, B)   // every pair',
            'To find what two lists of intervals have in common, pair by pair:',
          ),
          L('init', 1, 'out = []', 'Nothing found yet.'),
          L('outer', 1, 'for each interval a in A', 'For each interval of A'),
          L('inner', 2, 'for each interval b in B', 'and each interval of B:'),
          L(
            'common',
            3,
            'lo = max(a.start, b.start); hi = min(a.end, b.end)',
            'the overlap, if any, runs from the later start to the earlier end;',
          ),
          L('hit', 3, `if lo ${le} hi: append [lo, hi] to out`, 'if there is one, keep it.'),
          L('ret', 1, 'return out', 'Hand back the overlaps, in order.'),
        ],
      }
    : {
        op: 'intersect',
        lines: [
          L(
            'sig',
            0,
            'intersect(A, B)   // both sorted, none overlapping',
            'To find what two sorted lists of intervals have in common:',
          ),
          L('init', 1, 'out = []; i = 0; j = 0', 'Start at the front of both.'),
          L('loop', 1, 'while i < |A| and j < |B|', 'While both have intervals left:'),
          L(
            'common',
            2,
            'lo = max(A[i].start, B[j].start); hi = min(A[i].end, B[j].end)',
            'the overlap, if any, runs from the later start to the earlier end;',
          ),
          L('hit', 2, `if lo ${le} hi: append [lo, hi] to out`, 'if there is one, keep it.'),
          L(
            'advance',
            2,
            'if A[i].end < B[j].end: i = i + 1 else j = j + 1',
            'The one that ends first can meet nothing more: move past it.',
          ),
          L('ret', 1, 'return out', 'Hand back the overlaps, in order.'),
        ],
      };
  return [mergeBlock, insertBlock, intersectBlock];
}

// ----- Start -----

export function describe(st: MIState): string {
  return st.ivs.length
    ? `The list holds ${plural(st.ivs.length, 'interval')}: ${list(st.ivs)}.`
    : 'The list is empty.';
}

export function initialSay(st: MIState): string {
  return `${plural(st.ivs.length, 'interval')}, in no particular order, some overlapping. Press Merge to merge every overlap into one interval. Type one interval, such as 5-8, and press Insert (after a merge), or a list and press Load. Times run from 0 to ${MAX_TIME}.`;
}

export const initialVars = (st: MIState) => ({ n: st.ivs.length });

/** The start picture: one lane per interval. */
export function plainPicture(st: MIState): LanePicture {
  const { t0, T } = axisRange(st.ivs);
  return { lanes: inputLanes(st.ivs, new Set()), t0, T };
}
