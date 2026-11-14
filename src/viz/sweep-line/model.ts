/**
 * Sweep line: turn every interval into two events, a start and an end, sort the events by time,
 * and walk them once, keeping only what is open right now.
 *
 * - The most overlap: start +1, end −1, and the highest count is the answer. At equal times
 *   ends go first by default (half-open [s, f), so intervals that only touch never overlap),
 *   or starts first (closed [s, f], touching counts). The naive way checks every point that
 *   could be the answer: each interval's start, against every interval, n² checks.
 * - The skyline: the outline of rectangles (buildings) standing on one line. Sweep the edges
 *   left to right with a max-heap of the heights standing: push at a left edge; a right edge
 *   leaves its height in the heap until it reaches the top, then it is popped (lazy removal).
 *   Wherever the tallest height changes, the outline has a key point. The naive way checks
 *   every building at every edge, 2n · n checks.
 *
 * Work, in the units of src/viz/_patterns/kit.ts: a comparison is two keys compared, sorting
 * the events (a merge sort) or inside the heap; an update is one change to what is open (the
 * count goes up or down, or a push or pop on the heap); a check is one interval tested at one
 * point, the naive way.
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
import { MAX_TIME } from '../_intervals/kit';
import { andList, ivText, mergeSortCount, plural } from '../_intervals2/kit';
import { approachOf, Work, workVars, type Approach, type Totals } from '../_patterns/kit';

export const MAX_N = 8;
export const MAX_H = 12;

export interface Bld {
  /** 1-based, in the order typed. */
  id: number;
  s: number;
  f: number;
  /** Height, for the skyline; 1 when none is typed. */
  h: number;
}

export type Goal = 'overlap' | 'skyline';
export type Ties = 'ends' | 'starts';

export interface SLSettings {
  [key: string]: Scalar;
  approach: Approach;
  goal: Goal;
  ties: Ties;
}

export const defaults: SLSettings = { approach: 'pattern', goal: 'overlap', ties: 'ends' };

export interface SLState {
  ivs: Bld[];
}

export interface Ev {
  t: number;
  kind: 'start' | 'end';
  id: number;
}

/** A max-heap entry: a building's height and where it ends. */
export interface HeapItem {
  h: number;
  r: number;
  id: number;
}

export interface KeyPoint {
  x: number;
  h: number;
}

export interface SLExtra {
  goal: Goal;
  /** The events in sorted order (the pattern), once sorted; how many are done. */
  events?: Ev[];
  done: number;
  /** The sweep's position, and what is open there. */
  at?: number;
  open: number[];
  /** The most overlap: its count and the first time it is reached. */
  best?: { count: number; t: number };
  /** The naive overlap: the point being checked, and the count there so far. */
  point?: { t: number; count: number };
  /** The skyline: the heap (array order), the key points so far, the height now. */
  heap?: HeapItem[];
  keys?: KeyPoint[];
  height?: number;
  /** Buildings popped from the heap or checked and found ended: drawn faded. */
  gone?: number[];
  /** Fixed for the operation: how many key points it ends with, the most heap entries. */
  frame: { keys: number; heap: number };
}

export type SLStep = Step<SLState, SLExtra>;
type Op = OpSpec<SLState, SLSettings, SLExtra>;
type Gen = Generator<SLStep, SLState, void>;

export const START: Bld[] = [
  [1, 6, 4],
  [2, 5, 7],
  [4, 9, 5],
  [7, 11, 3],
  [9, 13, 6],
  [12, 14, 2],
].map(([s, f, h], k) => ({ id: k + 1, s: s!, f: f!, h: h! }));

export const init = (): SLState => ({ ivs: START.map((v) => ({ ...v })) });

const mark = (id: string, role: MarkRole): Mark => ({ id, role });

export const ivId = (id: number) => `iv-${id}`;
export const evId = (k: number) => `ev-${k}`;
export const heapId = (k: number) => `hp-${k}`;
export const keyId = (k: number) => `kp-${k}`;

/** "2–5:7" as typed, with its height. */
export const bldInput = (b: Bld) => `${b.s}-${b.f}:${b.h}`;
/** "2–5 (height 7)". */
const bldText = (b: Bld) => `${ivText(b)} (height ${b.h})`;
/** "2+" for a start at 2, "5−" for an end at 5. */
export const evText = (e: Ev) => `${e.t}${e.kind === 'start' ? '+' : '−'}`;
export const keyText = (k: KeyPoint) => `(${k.x}, ${k.h})`;

// ----- Input -----

const TOKEN = /^(\d+)[-–](\d+)(?::(\d+))?$/;

/** Read "1-6:4 2-5 4-9:5" into intervals, or say what is wrong. */
export function readIntervals(arg: Value | undefined): Bld[] | string {
  const tokens = String(arg ?? '')
    .split(/[\s,;]+/)
    .filter(Boolean);
  const how = `Type each interval as start-end, such as 2-5, or with a height for the skyline, such as 2-5:7. Times from 0 to ${MAX_TIME}, heights from 1 to ${MAX_H}.`;
  if (!tokens.length) return how;
  if (tokens.length > MAX_N) return `That is ${tokens.length} intervals. Use at most ${MAX_N}.`;
  const out: Bld[] = [];
  for (const t of tokens) {
    const m = TOKEN.exec(t);
    if (!m) return `"${t}" is not start-end or start-end:height. ${how}`;
    const s = Number(m[1]);
    const f = Number(m[2]);
    const h = m[3] === undefined ? 1 : Number(m[3]);
    if (f > MAX_TIME) return `In "${t}", use times from 0 to ${MAX_TIME}.`;
    if (f <= s) return `In "${t}", the end must come after the start.`;
    if (h < 1 || h > MAX_H) return `In "${t}", use a height from 1 to ${MAX_H}.`;
    out.push({ id: out.length + 1, s, f, h });
  }
  return out;
}

export function parseInput(token: string): Value | Error {
  const ivs = readIntervals(token);
  if (typeof ivs === 'string') return new Error(ivs);
  return ivs.map((b) => (b.h === 1 && !/:/.test(token) ? `${b.s}-${b.f}` : bldInput(b))).join(' ');
}

// ----- Events -----

/** Sort the events by time; at equal times ends first (or starts first), then by interval. */
export function sortEvents(ivs: readonly Bld[], ties: Ties): { events: Ev[]; comparisons: number } {
  const raw: Ev[] = ivs.flatMap((b) => [
    { t: b.s, kind: 'start' as const, id: b.id },
    { t: b.f, kind: 'end' as const, id: b.id },
  ]);
  const rank = (e: Ev) => ((e.kind === 'end') === (ties === 'ends') ? 0 : 1);
  const less = (a: Ev, b: Ev) =>
    a.t < b.t || (a.t === b.t && (rank(a) < rank(b) || (rank(a) === rank(b) && a.id < b.id)));
  const { sorted, comparisons } = mergeSortCount(raw, less);
  return { events: sorted, comparisons };
}

/** Is b open at time t? Half-open [s, f) when ends go first; closed [s, f] otherwise. */
export const openAt = (b: Bld, t: number, ties: Ties) =>
  ties === 'ends' ? b.s <= t && t < b.f : b.s <= t && t <= b.f;

/** The most intervals open at once, and the first time it happens. */
export function mostOpen(ivs: readonly Bld[], ties: Ties): { count: number; t: number } {
  let best = { count: 0, t: 0 };
  for (const p of ivs) {
    const c = ivs.filter((b) => openAt(b, p.s, ties)).length;
    if (c > best.count || (c === best.count && p.s < best.t)) best = { count: c, t: p.s };
  }
  return best;
}

// ----- A max-heap that counts its comparisons -----

const above = (a: HeapItem, b: HeapItem) => a.h > b.h || (a.h === b.h && a.r > b.r);

export function heapPush(h: HeapItem[], e: HeapItem, work?: Work): void {
  h.push(e);
  let i = h.length - 1;
  while (i > 0) {
    const p = (i - 1) >> 1;
    work?.add('comparisons');
    if (!above(h[i]!, h[p]!)) break;
    [h[i], h[p]] = [h[p]!, h[i]!];
    i = p;
  }
}

export function heapPop(h: HeapItem[], work?: Work): HeapItem {
  const top = h[0]!;
  const last = h.pop()!;
  if (h.length) {
    h[0] = last;
    let i = 0;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let m = i;
      if (l < h.length) {
        work?.add('comparisons');
        if (above(h[l]!, h[m]!)) m = l;
      }
      if (r < h.length) {
        work?.add('comparisons');
        if (above(h[r]!, h[m]!)) m = r;
      }
      if (m === i) break;
      [h[i], h[m]] = [h[m]!, h[i]!];
      i = m;
    }
  }
  return top;
}

/** The skyline's key points, by the heap. */
export function skylineOf(ivs: readonly Bld[]): KeyPoint[] {
  const { events } = sortEvents(ivs, 'ends');
  const byId = new Map(ivs.map((b) => [b.id, b]));
  const heap: HeapItem[] = [];
  const out: KeyPoint[] = [];
  let prev = 0;
  for (let k = 0; k < events.length;) {
    const x = events[k]!.t;
    for (; k < events.length && events[k]!.t === x; k++) {
      const e = events[k]!;
      if (e.kind === 'start') {
        const b = byId.get(e.id)!;
        heapPush(heap, { h: b.h, r: b.f, id: b.id });
      }
    }
    while (heap.length && heap[0]!.r <= x) heapPop(heap);
    const h = heap.length ? heap[0]!.h : 0;
    if (h !== prev) out.push({ x, h });
    prev = h;
  }
  return out;
}

/** The work of each approach on this input, for the totals. */
export function totalsFor(ivs: readonly Bld[], settings: SLSettings): Totals {
  const n = ivs.length;
  const { comparisons, events } = sortEvents(ivs, settings.ties);
  if (settings.goal === 'overlap') return { naive: n * n, pattern: comparisons + 2 * n };
  const xs = new Set(events.map((e) => e.t)).size;
  // The pattern: replay the heap with a counter.
  const work = new Work(['comparisons', 'updates', 'checks']);
  const byId = new Map(ivs.map((b) => [b.id, b]));
  const heap: HeapItem[] = [];
  for (let k = 0; k < events.length;) {
    const x = events[k]!.t;
    for (; k < events.length && events[k]!.t === x; k++) {
      const e = events[k]!;
      if (e.kind === 'start') {
        const b = byId.get(e.id)!;
        heapPush(heap, { h: b.h, r: b.f, id: b.id }, work);
        work.add('updates');
      }
    }
    while (heap.length && heap[0]!.r <= x) {
      heapPop(heap, work);
      work.add('updates');
    }
  }
  return { naive: comparisons + xs * n, pattern: comparisons + work.total };
}

// ----- Steps -----

function refuse(st: SLState, why: string): SLStep {
  return {
    state: st,
    marks: [],
    say: `Nothing to do. ${why}`,
    lines: [],
    level: 1,
    vars: { n: st.ivs.length },
  };
}

const load: Op = {
  label: 'Load',
  arity: 1,
  *run(st, [arg]): Gen {
    const ivs = readIntervals(arg);
    if (typeof ivs === 'string') {
      yield refuse(st, `${ivs} The intervals stay as they were.`);
      return st;
    }
    const next = { ivs };
    yield {
      state: next,
      marks: [],
      say: `Loaded ${plural(ivs.length, 'interval')}: ${andList(ivs.map(ivText))}. Press Sweep.`,
      lines: [],
      level: 1,
      vars: { n: ivs.length },
    };
    return next;
  },
};

const tieWords = (ties: Ties) =>
  ties === 'ends'
    ? 'at equal times ends go first, so intervals that only touch never overlap'
    : 'at equal times starts go first, so intervals that only touch overlap';

function* overlapSweep(st: SLState, settings: SLSettings, totals: Totals): Gen {
  const ivs = st.ivs;
  const n = ivs.length;
  const byId = new Map(ivs.map((b) => [b.id, b]));
  const work = new Work(['comparisons', 'updates', 'checks']);
  const { events, comparisons } = sortEvents(ivs, settings.ties);
  const open = new Set<number>();
  let count = 0;
  let best = { count: 0, t: events[0]!.t };
  let done = 0;
  let at: number | undefined;
  const frame = { keys: 0, heap: 0 };
  const extra = (): SLExtra => ({
    goal: 'overlap',
    events,
    done,
    at,
    open: [...open],
    ...(best.count ? { best: { ...best } } : {}),
    frame,
  });
  const vars = () => ({
    n,
    t: at ?? '–',
    open: count,
    most: best.count,
    ...workVars(work, totals),
  });

  work.add('comparisons', comparisons);
  yield {
    state: st,
    marks: events.map((_, k) => mark(evId(k), 'new')),
    say: `Each interval gives two events: a start (+1) and an end (−1). Sort the ${events.length} by time, and ${tieWords(settings.ties)}. A merge sort takes ${plural(comparisons, 'comparison')}. "2+" is a start at time 2, "5−" an end at 5.`,
    lines: ['events', 'sort'],
    level: 2,
    vars: vars(),
    extra: extra(),
  };

  for (const [k, e] of events.entries()) {
    const b = byId.get(e.id)!;
    at = e.t;
    work.add('updates');
    let say: string;
    if (e.kind === 'start') {
      open.add(b.id);
      count++;
      say = `t = ${e.t}: ${ivText(b)} starts, so open goes up to ${count}.`;
      if (count > best.count) {
        best = { count, t: e.t };
        say += ` The most so far.`;
      }
    } else {
      open.delete(b.id);
      count--;
      say = `t = ${e.t}: ${ivText(b)} ends, so open goes down to ${count}.`;
    }
    done = k + 1;
    yield {
      state: st,
      marks: [mark(evId(k), 'active'), mark(ivId(b.id), e.kind === 'start' ? 'new' : 'remove')],
      say,
      lines: e.kind === 'start' ? ['loop', 'start', 'best'] : ['loop', 'end'],
      level: 2,
      vars: vars(),
      extra: extra(),
    };
  }
  at = best.t;
  const there = ivs.filter((b) => openAt(b, best.t, settings.ties));
  yield {
    state: st,
    marks: there.map((b) => mark(ivId(b.id), 'found')),
    say: `Done: at most ${plural(best.count, 'interval')} ${best.count === 1 ? 'is' : 'are'} open at once, first at time ${best.t} (${andList(there.map(ivText))}). The sweep took ${work.tally()}; checking every start against every interval would take ${plural(totals.naive, 'check')}.${totals.pattern >= totals.naive ? ' At this size the plain way is no slower; the sort pays off as n grows.' : ''}`,
    lines: ['ret'],
    level: 1,
    vars: vars(),
    extra: { ...extra(), open: there.map((b) => b.id) },
  };
  return st;
}

function* overlapPoints(st: SLState, settings: SLSettings, totals: Totals): Gen {
  const ivs = st.ivs;
  const n = ivs.length;
  const work = new Work(['comparisons', 'updates', 'checks']);
  let best = { count: 0, t: ivs[0]!.s };
  let point: { t: number; count: number } | undefined;
  let open: number[] = [];
  const frame = { keys: 0, heap: 0 };
  const extra = (): SLExtra => ({
    goal: 'overlap',
    done: 0,
    at: point?.t,
    open: [...open],
    ...(point ? { point: { ...point } } : {}),
    ...(best.count ? { best: { ...best } } : {}),
    frame,
  });
  const vars = () => ({
    n,
    t: point?.t ?? '–',
    open: point?.count ?? 0,
    most: best.count,
    ...workVars(work, totals),
  });

  yield {
    state: st,
    marks: [],
    say: `Check every point that could be the answer. The most overlap always begins at some interval's start, so for each start t, count the intervals open at t: ${plural(n, 'start')} times ${plural(n, 'interval')}. Here ${settings.ties === 'ends' ? 'an interval is open from its start up to, not including, its end' : 'an interval is open from its start to its end, both included'}.`,
    lines: ['init'],
    level: 2,
    vars: vars(),
    extra: extra(),
  };

  for (const p of ivs) {
    point = { t: p.s, count: 0 };
    open = [];
    for (const [j, b] of ivs.entries()) {
      work.add('checks');
      const yes = openAt(b, p.s, settings.ties);
      if (yes) {
        point.count++;
        open.push(b.id);
      }
      let say = `${j === 0 ? `t = ${p.s}, the start of ${ivText(p)}. ` : ''}Is ${ivText(b)} open at ${p.s}? ${yes ? `Yes: ${point.count} so far.` : 'No.'}`;
      const lastOne = j === n - 1;
      let lines = ['outer', 'inner', 'check'];
      if (lastOne) {
        if (point.count > best.count || (point.count === best.count && p.s < best.t)) {
          const first = point.count > best.count;
          best = { count: point.count, t: p.s };
          say += ` So ${plural(point.count, 'interval')} ${point.count === 1 ? 'is' : 'are'} open at ${p.s}${first ? ': the most so far.' : ', as many as the best, and earlier.'}`;
          lines = [...lines, 'best'];
        } else say += ` So ${point.count} open at ${p.s}, not more than ${best.count}.`;
      }
      yield {
        state: st,
        marks: [mark(ivId(b.id), yes ? 'active' : 'compare'), mark(ivId(p.id), 'visit')].filter(
          (m, i, all) => all.findIndex((x) => x.id === m.id) === i,
        ),
        say,
        lines: yes ? [...lines.slice(0, 3), 'count', ...lines.slice(3)] : lines,
        level: 2,
        vars: vars(),
        extra: extra(),
      };
    }
  }
  const there = ivs.filter((b) => openAt(b, best.t, settings.ties));
  point = { t: best.t, count: best.count };
  open = there.map((b) => b.id);
  yield {
    state: st,
    marks: there.map((b) => mark(ivId(b.id), 'found')),
    say: `Done: at most ${plural(best.count, 'interval')} ${best.count === 1 ? 'is' : 'are'} open at once, first at time ${best.t} (${andList(there.map(ivText))}). Every start against every interval took ${plural(work.get('checks'), 'check')}; sorting the events and sweeping would take ${plural(totals.pattern, 'step')}.`,
    lines: ['ret'],
    level: 1,
    vars: vars(),
    extra: extra(),
  };
  return st;
}

function* skylineSweep(st: SLState, settings: SLSettings, totals: Totals): Gen {
  const ivs = st.ivs;
  const n = ivs.length;
  const naive = approachOf(settings) === 'naive';
  const byId = new Map(ivs.map((b) => [b.id, b]));
  const work = new Work(['comparisons', 'updates', 'checks']);
  const { events, comparisons } = sortEvents(ivs, settings.ties);
  const all = skylineOf(ivs);
  const heap: HeapItem[] = [];
  const keys: KeyPoint[] = [];
  const gone = new Set<number>();
  let open = new Set<number>();
  let done = 0;
  let at: number | undefined;
  let height = 0;
  let mostHeap = 0;
  // The most entries the heap holds, for the frame: replay it once.
  {
    const h: HeapItem[] = [];
    for (let k = 0; k < events.length;) {
      const x = events[k]!.t;
      for (; k < events.length && events[k]!.t === x; k++) {
        const e = events[k]!;
        if (e.kind === 'start') {
          const b = byId.get(e.id)!;
          heapPush(h, { h: b.h, r: b.f, id: b.id });
          mostHeap = Math.max(mostHeap, h.length);
        }
      }
      while (h.length && h[0]!.r <= x) heapPop(h);
    }
  }
  const frame = { keys: all.length, heap: naive ? 0 : mostHeap };
  const extra = (): SLExtra => ({
    goal: 'skyline',
    events,
    done,
    at,
    open: [...open],
    ...(naive ? {} : { heap: heap.map((e) => ({ ...e })) }),
    keys: [...keys],
    height,
    gone: [...gone],
    frame,
  });
  const vars = () => ({
    n,
    x: at ?? '–',
    height,
    ...(naive ? {} : { 'heap size': heap.length }),
    'key points': keys.length,
    ...workVars(work, totals),
  });

  work.add('comparisons', comparisons);
  yield {
    state: st,
    marks: [],
    say: `Each building gives two events: its left edge and its right edge. Sort the ${events.length} by x: a merge sort takes ${plural(comparisons, 'comparison')}. ${
      naive
        ? 'Then at each edge, check every building to find the tallest one standing there.'
        : 'Then sweep them left to right with a max-heap of the heights standing.'
    }`,
    lines: ['events', 'sort'],
    level: 2,
    vars: vars(),
    extra: extra(),
  };

  let prev = 0;
  for (let k = 0; k < events.length;) {
    const x = events[k]!.t;
    at = x;
    if (naive) {
      for (; k < events.length && events[k]!.t === x; k++) done = k + 1;
      let tallest = 0;
      open = new Set();
      for (const [j, b] of ivs.entries()) {
        work.add('checks');
        const stands = b.s <= x && x < b.f;
        if (stands) {
          open.add(b.id);
          tallest = Math.max(tallest, b.h);
        }
        let say = `${j === 0 ? `x = ${x}. ` : ''}Is ${bldText(b)} standing at ${x}? ${stands ? `Yes: the tallest so far is ${tallest}.` : b.f <= x ? 'No, it has ended.' : 'No, not yet.'}`;
        let lines = ['loop', 'inner', 'check'];
        if (j === n - 1) {
          height = tallest;
          if (tallest !== prev) {
            keys.push({ x, h: tallest });
            say += ` So the outline ${tallest > prev ? 'steps up' : 'steps down'} to ${tallest} at x = ${x}: key point ${keyText({ x, h: tallest })}.`;
            lines = [...lines, 'emit'];
          } else say += ` So the height stays ${tallest}: no key point.`;
          prev = tallest;
        }
        yield {
          state: st,
          marks: [
            mark(ivId(b.id), stands ? 'active' : 'compare'),
            ...(j === n - 1 && keys.length && keys[keys.length - 1]!.x === x
              ? [mark(keyId(keys.length - 1), 'new')]
              : []),
          ],
          say,
          lines: stands ? [...lines.slice(0, 3), 'tallest', ...lines.slice(3)] : lines,
          level: 2,
          vars: vars(),
          extra: extra(),
        };
      }
      continue;
    }
    for (; k < events.length && events[k]!.t === x; k++) {
      const e = events[k]!;
      const b = byId.get(e.id)!;
      done = k + 1;
      if (e.kind === 'start') {
        heapPush(heap, { h: b.h, r: b.f, id: b.id }, work);
        work.add('updates');
        open.add(b.id);
        const pos = heap.findIndex((it) => it.id === b.id);
        yield {
          state: st,
          marks: [mark(ivId(b.id), 'new'), mark(heapId(pos), 'new')],
          say: `x = ${x}: ${bldText(b)} starts. Push height ${b.h}, until ${b.f}.${pos === 0 ? ' It is the tallest now.' : ''}`,
          lines: ['loop', 'push'],
          level: 2,
          vars: vars(),
          extra: extra(),
        };
      } else {
        open.delete(b.id);
        const top = heap[0]!;
        yield {
          state: st,
          marks: [mark(ivId(b.id), 'remove')],
          say:
            top.id === b.id
              ? `x = ${x}: ${bldText(b)} ends. Its height is on top of the heap right now: if it is still on top once every edge at ${x} is in, it is popped.`
              : `x = ${x}: ${bldText(b)} ends. Its height ${b.h} stays in the heap for now, since finding it there would take a search. It leaves when it reaches the top (lazy removal).`,
          lines: ['loop'],
          level: 2,
          vars: vars(),
          extra: extra(),
        };
      }
    }
    while (heap.length && heap[0]!.r <= x) {
      const top = heap[0]!;
      heapPop(heap, work);
      work.add('updates');
      gone.add(top.id);
      yield {
        state: st,
        marks: [mark(ivId(top.id), 'stale'), ...(heap.length ? [mark(heapId(0), 'compare')] : [])],
        say: `The top of the heap is ${top.h}, which ended at ${top.r} ≤ ${x}: pop it.${heap.length ? ` The top is now ${heap[0]!.h}, until ${heap[0]!.r}.` : ' The heap is empty.'}`,
        lines: ['pop'],
        level: 2,
        vars: vars(),
        extra: extra(),
      };
    }
    height = heap.length ? heap[0]!.h : 0;
    const changed = height !== prev;
    if (changed) keys.push({ x, h: height });
    yield {
      state: st,
      marks: [
        ...(heap.length ? [mark(heapId(0), 'found')] : []),
        ...(changed ? [mark(keyId(keys.length - 1), 'new')] : []),
      ],
      say: changed
        ? `${height ? `The tallest standing at ${x} is ${height}` : `Nothing is standing at ${x}`}: the outline ${height > prev ? 'steps up' : 'steps down'} to ${height}. Key point ${keyText({ x, h: height })}.`
        : `The tallest standing at ${x} is still ${height}: the outline does not change, so no key point.`,
      lines: changed ? ['top', 'emit'] : ['top'],
      level: 2,
      vars: vars(),
      extra: extra(),
    };
    prev = height;
  }
  at = undefined;
  yield {
    state: st,
    marks: keys.map((_, k) => mark(keyId(k), 'found')),
    say: `Done: the skyline has ${plural(keys.length, 'key point')}: ${keys.map(keyText).join(' ')}. ${naive ? `Checking every building at every edge took ${work.tally()}; the heap would take ${plural(totals.pattern, 'step')}.` : `The sweep took ${work.tally()}; checking every building at every edge would take ${plural(totals.naive, 'step')}.`}`,
    lines: ['ret'],
    level: 1,
    vars: vars(),
    extra: extra(),
  };
  return st;
}

const sweep: Op = {
  label: 'Sweep',
  arity: 0,
  *run(st, _args, { settings }): Gen {
    if (!st.ivs.length) {
      yield refuse(st, 'There are no intervals. Type some, such as 1-6:4 2-5:7, and press Load.');
      return st;
    }
    const totals = totalsFor(st.ivs, settings);
    const naive = approachOf(settings) === 'naive';
    if (settings.goal === 'skyline') return yield* skylineSweep(st, settings, totals);
    return naive
      ? yield* overlapPoints(st, settings, totals)
      : yield* overlapSweep(st, settings, totals);
  },
};

export const ops: Record<string, Op> = { sweep, load };

// ----- Pseudocode -----

const L = (id: string, indent: number, text: string, plain: string): PseudoLine => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: SLSettings): PseudoBlock[] {
  const naive = approachOf(settings) === 'naive';
  const ends = settings.ties !== 'starts';
  if (settings.goal === 'skyline') {
    return [
      {
        op: 'sweep',
        lines: naive
          ? [
              L(
                'sig',
                0,
                'skyline(B)   // check every building at every edge',
                'To draw the outline of the buildings B, the plain way:',
              ),
              L('events', 1, 'xs = every left and right edge', 'Collect every edge,'),
              L('sort', 1, 'sort xs; prev = 0; out = []', 'in order, left to right.'),
              L('loop', 1, 'for each distinct x in xs', 'At each edge x:'),
              L('inner', 2, 'for each building b in B', 'look at every building:'),
              L('check', 3, 'if b.left <= x < b.right', 'if it stands at x,'),
              L('tallest', 4, 'h = max(h, b.height)', 'keep the tallest height.'),
              L(
                'emit',
                2,
                'if h != prev: append (x, h) to out; prev = h',
                'If the tallest changed, the outline has a key point here.',
              ),
              L('ret', 1, 'return out', 'Hand back the key points.'),
            ]
          : [
              L('sig', 0, 'skyline(B)', 'To draw the outline of the buildings B:'),
              L(
                'events',
                1,
                'events = a left edge and a right edge for each building',
                'Each building gives two events,',
              ),
              L(
                'sort',
                1,
                'sort events by x; H = empty max-heap; prev = 0',
                'sorted left to right, with an empty heap of heights.',
              ),
              L('loop', 1, 'for each distinct x, its events in order', 'At each edge x:'),
              L(
                'push',
                2,
                'for each building b starting at x: push (b.height, b.right) on H',
                'push the height of every building starting here;',
              ),
              L(
                'pop',
                2,
                'while H not empty and top(H).right <= x: pop H',
                'pop heights from the top that have ended (lazy removal);',
              ),
              L(
                'top',
                2,
                'h = top(H).height, or 0 if H is empty',
                'the top is the tallest still standing.',
              ),
              L(
                'emit',
                2,
                'if h != prev: append (x, h) to out; prev = h',
                'If it changed, the outline has a key point here.',
              ),
              L('ret', 1, 'return out', 'Hand back the key points.'),
            ],
      },
    ];
  }
  return [
    {
      op: 'sweep',
      lines: naive
        ? [
            L(
              'sig',
              0,
              'mostOpen(I)   // check every start',
              'To find the most intervals open at once, the plain way:',
            ),
            L('init', 1, 'best = 0', 'Nothing counted yet.'),
            L(
              'outer',
              1,
              'for each interval p in I',
              'For each interval, look at the moment it starts:',
            ),
            L('inner', 2, 'count = 0; for each interval b in I', 'go through every interval'),
            L(
              'check',
              3,
              ends ? 'if b.start <= p.start < b.end' : 'if b.start <= p.start <= b.end',
              'and if it is open at that moment,',
            ),
            L('count', 4, 'count = count + 1', 'count it.'),
            L('best', 2, 'best = max(best, count)', 'Keep the highest count.'),
            L('ret', 1, 'return best', 'Hand back the most open at once.'),
          ]
        : [
            L('sig', 0, 'mostOpen(I)', 'To find the most intervals open at once:'),
            L(
              'events',
              1,
              'events = (start, +1) and (end, −1) for each interval',
              'Each interval gives a start and an end event,',
            ),
            L(
              'sort',
              1,
              ends
                ? 'sort events by time, ends first at equal times'
                : 'sort events by time, starts first at equal times',
              ends
                ? 'in order of time; at the same time, ends before starts.'
                : 'in order of time; at the same time, starts before ends.',
            ),
            L('loop', 1, 'open = 0; best = 0; for each event e in order', 'Walk the events once:'),
            L('start', 2, 'if e is a start: open = open + 1', 'a start opens one more,'),
            L('best', 3, 'best = max(best, open)', 'and maybe the most so far;'),
            L('end', 2, 'else: open = open − 1', 'an end closes one.'),
            L('ret', 1, 'return best', 'Hand back the most open at once.'),
          ],
    },
  ];
}

// ----- Start -----

export function describe(st: SLState, settings: SLSettings): string {
  if (!st.ivs.length) return 'No intervals.';
  return settings.goal === 'skyline'
    ? `${plural(st.ivs.length, 'building')}: ${st.ivs.map(bldText).join(', ')}.`
    : `${plural(st.ivs.length, 'interval')}: ${andList(st.ivs.map(ivText))}.`;
}

export function initialSay(st: SLState, settings: SLSettings): string {
  return settings.goal === 'skyline'
    ? `${plural(st.ivs.length, 'building')} on one line, each from its left edge to its right edge, with a height. Press Sweep to trace their outline. Type more as left-right:height, such as 2-5:7, and press Load.`
    : `${plural(st.ivs.length, 'interval')}. How many are open at the same moment, at most? Press Sweep. Type more as start-end, such as 2-5, and press Load; a height (2-5:7) is for the skyline, under Options.`;
}

export const initialVars = (st: SLState) => ({ n: st.ivs.length });
